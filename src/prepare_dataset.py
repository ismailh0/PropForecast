import pandas as pd
from pathlib import Path

#config

RAW_DATA_DIR = Path("../data_raw")
OUTPUT_DIR = Path("../data_clean")
OUTPUT_FILE = OUTPUT_DIR / "ppd_2018_2025_clean.csv"

#raw price paid data columns
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

