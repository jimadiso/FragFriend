import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL


base_dir = Path(__file__).resolve().parent.parent
load_dotenv(base_dir / ".env")

csv_file = base_dir / "Fragrance_Data" / "fra_cleaned_formatted.csv"

db_password = os.getenv("DB_PASSWORD")
if not db_password:
    raise RuntimeError(
        "DB_PASSWORD is not set. Add it to the project-root .env file."
    )

engine = create_engine(
    URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("DB_USER", "postgres"),
        password=db_password,
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "fragfriend"),
    )
)

df = pd.read_csv(csv_file)

df.columns = [
    "url",
    "perfume",
    "brand",
    "country",
    "gender",
    "rating_value",
    "rating_count",
    "year",
    "top_notes",
    "middle_notes",
    "base_notes",
    "perfumer1",
    "perfumer2",
    "mainaccord1",
    "mainaccord2",
    "mainaccord3",
    "mainaccord4",
    "mainaccord5",
]

df["rating_value"] = (
    df["rating_value"]
    .astype(str)
    .str.replace(",", ".", regex=False)
    .astype(float)
)

df["year"] = df["year"].astype("Int64")
df["rating_count"] = df["rating_count"].astype("Int64")
df["image_url"] = None


df.to_sql(
    "fragrances",
    engine,
    if_exists="fail",
    index=False,
)

print(f"Loaded {len(df)} rows into PostgreSQL.")