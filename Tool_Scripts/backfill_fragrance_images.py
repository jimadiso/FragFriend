"""Populate image links from JSONL using the existing source-ID mapping.

Run after migration 005. Default is a preview; --apply updates only image columns.
No image downloads, fragrance inserts, or account-data changes.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Backend.database import engine
from sqlalchemy import text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with engine.begin() as connection:
        mapping = dict(connection.execute(text(
            "SELECT source_id, fragrance_id FROM fragrance_source_metadata"
        )).all())
        updates = []
        with args.source.open(encoding="utf-8") as source:
            for line in source:
                record = json.loads(line)
                local_id = mapping.get(record["id"])
                if local_id is not None:
                    updates.append({"id": local_id,
                                    "picture": record.get("picture") or None,
                                    "thumbnail": record.get("thumbnail") or None})
        print(f"Matched {len(updates)} source records to existing fragrances.")
        if args.apply:
            statement = text("""UPDATE fragrances SET picture_url=:picture,
                thumbnail_url=:thumbnail WHERE id=:id AND
                (picture_url IS DISTINCT FROM :picture OR thumbnail_url IS DISTINCT FROM :thumbnail)""")
            for start in range(0, len(updates), 1000):
                connection.execute(statement, updates[start:start + 1000])
            print("Image links populated; transaction committed on successful exit.")


if __name__ == "__main__":
    main()
