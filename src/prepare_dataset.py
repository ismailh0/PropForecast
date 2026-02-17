import pandas as pd
import requests
from pathlib import Path

# CONFIG 
BASE_DIR     = Path(__file__).resolve().parent.parent
RAW_DATA_DIR = BASE_DIR / "data_raw"
OUTPUT_DIR   = BASE_DIR / "data_clean"
OUTPUT_FILE  = OUTPUT_DIR / "ppd_2018_2025_clean.csv"

# Path to the ONS CSV
ONS_NSPL_PATH    = RAW_DATA_DIR / "ONSPD_NOV_2025_UK.csv"
ONS_POSTCODE_COL = "pcds"   #postcode column name in the ONS  file
ONS_LAT_COL      = "lat"
ONS_LONG_COL     = "long"

#postcodes.io bulk API — used as fallback for any postcodes not in the ONS file
POSTCODES_IO_URL = "https://api.postcodes.io/postcodes"
BATCH_SIZE       = 100      

#RAW DATA COLUMNS 
#HM Land Registry Price Paid Data columns
COLUMNS = [
    "transaction_id",
    "price",
    "date_of_transfer",
    "postcode",
    "property_type",
    "new_build_flag",
    "tenure",
    "paon",
    "saon",
    "street",
    "local_locality",
    "town_city",
    "district",
    "county",
    "ppd_category_type",
    "record_status"
]

#Columns after cleaning 
KEEP_COLUMNS = [
    "price",
    "date_of_transfer",
    "postcode",
    "property_type",
    "new_build_flag",
    "tenure",
    "paon",
    "saon",
    "street",
    "town_city",
    "district",
    "county"
]

# Final column order in the output CSV with lat and long
FINAL_COLUMNS = [
    "price",
    "date_of_transfer",
    "postcode",
    "property_type",
    "new_build_flag",
    "tenure",
    "paon",
    "saon",
    "street",
    "town_city",
    "district",
    "county",
    "latitude",
    "longitude"
]


#LOAD

def load_raw_files():
    """
    Load all HM Land Registry Price Paid Data .txt files from RAW_DATA_DIR
    and concatenate them into a single DataFrame.

    Files have no header row. Column names are assigned from the COLUMNS list.
    Categorical dtypes are used for low-cardinality string columns to reduce memory usage.
    """
    dtype_hints = {
        "property_type":     "category",
        "new_build_flag":    "category",
        "tenure":            "category",
        "ppd_category_type": "category",
        "record_status":     "category",
    }

    raw_files = sorted(RAW_DATA_DIR.glob("pp-*.txt"))

    if not raw_files:
        raise FileNotFoundError(f"No pp-*.txt files found in {RAW_DATA_DIR.resolve()}")

    print(f"Found {len(raw_files)} raw data files.")

    frames = []
    for filepath in raw_files:
        print(f"  Loading {filepath.name}...", end=" ", flush=True)
        df = pd.read_csv(
            filepath,
            header=None,
            names=COLUMNS,
            dtype=dtype_hints,
        )
        print(f"{len(df):,} rows")
        frames.append(df)

    print("Concatenating all files...")
    combined = pd.concat(frames, ignore_index=True)
    print(f"Total rows loaded: {len(combined):,}\n")
    return combined


#CLEAN

def clean_dataset(df):
    """
    Clean the raw price paid data:
      - Keep only standard residential transactions (ppd_category_type == 'A')
      - Keep only active records (record_status == 'A')
      - Normalise postcode formatting and fix NaN-as-string issue
      - Drop rows with missing critical fields
      - Cast price to int and date_of_transfer to datetime
      - Select only the columns needed for geocoding and ML
    """
    print("Cleaning dataset...")
    print(f"  Rows before cleaning: {len(df):,}")

    # Keep only standard transactions - ppd_category_type 'B' = bulk/non-standard
    df = df[df["ppd_category_type"] == "A"]
    print(f"  After ppd_category_type == 'A': {len(df):,} rows")

    #Keep only active records 
    df = df[df["record_status"] == "A"]
    print(f"  After record_status == 'A': {len(df):,} rows")

    # Normalise postcode - strip whitespace and uppercase
    df["postcode"] = df["postcode"].astype(str).str.strip().str.upper()
    df["postcode"] = df["postcode"].replace("NAN", pd.NA)

    # Drop rows missing any critical field
    df = df.dropna(subset=["postcode", "price", "date_of_transfer"])
    print(f"  After dropping missing critical fields: {len(df):,} rows")

    # Cast types
    df["price"] = df["price"].astype(int)
    df["date_of_transfer"] = pd.to_datetime(df["date_of_transfer"], errors="coerce")
    df = df.dropna(subset=["date_of_transfer"])

    df = df[KEEP_COLUMNS]

    print(f"  Final cleaned shape: {df.shape}\n")
    return df


#GEOCODE

def geocode_postcodes(df):
    """
    Add latitude and longitude columns to the DataFrame using a two-phase approach:

    Phase 1: Merge with the ONS NSPL postcode lookup CSV (offline, fast).
    Phase 2: Call the postcodes.io batch API for any postcodes not found in Phase 1.

    Rows with no coordinates after both phases are dropped.
    """

    

    if not ONS_NSPL_PATH.exists():
        raise FileNotFoundError(
            f"ONS NSPL file not found at: {ONS_NSPL_PATH.resolve()}\n"
        )

    print(f"Loading ONS NSPL postcode lookup from {ONS_NSPL_PATH.name}...")
    # Load only the 3 columns we need — the full NSPL file has ~30 columns
    nspl = pd.read_csv(
        ONS_NSPL_PATH,
        usecols=[ONS_POSTCODE_COL, ONS_LAT_COL, ONS_LONG_COL],
        dtype={ONS_POSTCODE_COL: str}
    )
    nspl[ONS_POSTCODE_COL] = nspl[ONS_POSTCODE_COL].str.strip().str.upper()
    nspl = nspl.rename(columns={
        ONS_POSTCODE_COL: "postcode",
        ONS_LAT_COL:      "latitude",
        ONS_LONG_COL:     "longitude"
    })

    print("Merging with price paid data on postcode...")
    df = df.merge(nspl, on="postcode", how="left")

    n_missing = df["latitude"].isnull().sum()
    n_total   = len(df)
    print(f"ONS merge complete: {n_total - n_missing:,} matched, {n_missing:,} unmatched "
          f"({n_missing / n_total * 100:.2f}%)\n")

    #postcodes.io API fallback

    missing_mask      = df["latitude"].isnull()
    missing_postcodes = df.loc[missing_mask, "postcode"].unique().tolist()
    missing_postcodes = [p for p in missing_postcodes if p != "NAN"]

    if missing_postcodes:
        total_batches = (len(missing_postcodes) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"Calling postcodes.io API for {len(missing_postcodes):,} unmatched postcodes "
              f"({total_batches} batches of up to {BATCH_SIZE})...")

        api_lookup = {}  

        for i in range(0, len(missing_postcodes), BATCH_SIZE):
            batch     = missing_postcodes[i: i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            print(f"  Batch {batch_num}/{total_batches}...", end=" ", flush=True)

            try:
                response = requests.post(
                    POSTCODES_IO_URL,
                    json={"postcodes": batch},
                    timeout=30
                )
                response.raise_for_status()
                results = response.json().get("result", [])

                found_in_batch = 0
                for item in results:
                    if item and item.get("result"):
                        pc  = item["query"].strip().upper()
                        lat = item["result"]["latitude"]
                        lng = item["result"]["longitude"]
                        api_lookup[pc] = (lat, lng)
                        found_in_batch += 1

                print(f"{found_in_batch}/{len(batch)} found")

            except requests.RequestException as e:
                #Network failure for this batch — log and continue rather than crashing
                print(f"WARNING: API request failed for batch {batch_num}: {e}")

        #Map API results back to the DataFrame 
        if api_lookup:
            unmatched_idx = df.index[missing_mask & df["postcode"].isin(api_lookup)]
            df.loc[unmatched_idx, "latitude"]  = df.loc[unmatched_idx, "postcode"].map(
                lambda p: api_lookup[p][0]
            )
            df.loc[unmatched_idx, "longitude"] = df.loc[unmatched_idx, "postcode"].map(
                lambda p: api_lookup[p][1]
            )
            print(f"API fallback added coordinates for {len(api_lookup):,} postcodes.\n")

    #Drop any rows still missing coordinates - invalid/unresolvable postcodes
    before  = len(df)
    df      = df.dropna(subset=["latitude", "longitude"])
    dropped = before - len(df)
    if dropped > 0:
        print(f"Dropped {dropped:,} rows with no coordinates (unresolvable postcodes).")

    return df


#MAIN

def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    #Load all raw files
    df = load_raw_files()

    # Clean
    df_clean = clean_dataset(df)
    del df 

    #Geocode postcodes 
    df_geocoded = geocode_postcodes(df_clean)

    #Reorder columns to the final output schema
    df_geocoded = df_geocoded[FINAL_COLUMNS]

    #Save
    print(f"Saving to {OUTPUT_FILE}...")
    df_geocoded.to_csv(OUTPUT_FILE, index=False)
    print(f"\n Done. {len(df_geocoded):,} rows written to {OUTPUT_FILE}\n")


if __name__ == "__main__":
    main()
