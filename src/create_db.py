import csv
import sqlite3
import time
from pathlib import Path

#config

BASE_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = BASE_DIR / "data_clean" / "ppd_2018_2025_clean.csv"
DB_PATH  = BASE_DIR / "data_clean" / "propforecast.db"

BATCH_SIZE = 5000  # rows per commit


#create empty table

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sales (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    price            INTEGER NOT NULL,
    date_of_transfer TEXT NOT NULL,
    postcode         TEXT,
    property_type    TEXT,
    new_build_flag   TEXT,
    tenure           TEXT,
    paon             TEXT,
    saon             TEXT,
    street           TEXT,
    town_city        TEXT,
    district         TEXT,
    county           TEXT,
    latitude         REAL,
    longitude        REAL
)
"""

INSERT_SQL = """
INSERT INTO sales (
    price, date_of_transfer, postcode, property_type,
    new_build_flag, tenure, paon, saon, street,
    town_city, district, county, latitude, longitude
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def main():

    # exit if DB already exists
    if DB_PATH.exists():
        print(f"Database already exists at {DB_PATH}")
        print("Delete it first if you want to rebuild it.")
        return

    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Clean CSV not found at {CSV_PATH}")

    print(f"Loading CSV: {CSV_PATH.name}")
    print(f"Destination: {DB_PATH}\n")

    conn = sqlite3.connect(str(DB_PATH))

    #Speed up bulk inserts
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    conn.execute(CREATE_TABLE_SQL)
    conn.commit()

    start = time.time()
    batch = []
    total = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            batch.append((
                int(float(row["price"])),
                row["date_of_transfer"][:10],   #keep YYYY-MM-DD only
                row["postcode"],
                row["property_type"],
                row["new_build_flag"],
                row["tenure"],
                row["paon"],
                row["saon"] if row["saon"] else None,
                row["street"],
                row["town_city"],
                row["district"],
                row["county"],
                float(row["latitude"]) if row["latitude"] else None,
                float(row["longitude"]) if row["longitude"] else None,
            ))

            if len(batch) >= BATCH_SIZE:
                conn.executemany(INSERT_SQL, batch)
                conn.commit()
                total += len(batch)
                batch = []

                if total % 500_000 == 0:
                    elapsed = time.time() - start
                    print(f"  Inserted {total:,} rows... ({elapsed:.1f}s)")

        #Insert any remaining rows
        if batch:
            conn.executemany(INSERT_SQL, batch)
            conn.commit()
            total += len(batch)

    elapsed = time.time() - start
    print(f"\nInserted {total:,} rows in {elapsed:.1f}s")

    # Create indexes after all data is loaded 
    print("Creating indexes...")
    conn.execute("CREATE INDEX idx_postcode ON sales (postcode)")
    conn.execute("CREATE INDEX idx_district ON sales (district)")
    conn.commit()
    conn.close()

    print(f"\n Database saved to {DB_PATH}\n")


if __name__ == "__main__":
    main()
