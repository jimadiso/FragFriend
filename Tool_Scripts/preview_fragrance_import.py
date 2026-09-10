"""Preview a Fragrantica JSONL ZIP; optionally load an isolated staging schema.

Default mode opens a PostgreSQL READ ONLY transaction. --stage writes only to
fragfriend_import_v1, never public.fragrances or account/collection tables.
Requires the project's existing psycopg2-binary and python-dotenv packages.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
import zipfile

import psycopg2
from psycopg2.extras import Json, execute_values
from dotenv import dotenv_values


GENDERS = {"female": "Women", "male": "Men", "unisex": "Unisex"}
VERSION = 1


class InputError(ValueError):
    pass


def source_id_from_url(value):
    if not isinstance(value, str):
        return None
    url = urlparse(value)
    if url.hostname not in {"fragrantica.com", "www.fragrantica.com"}:
        return None
    match = re.fullmatch(r"/perfume/.+-(\d+)\.html", url.path)
    return int(match[1]) if match else None


def count_value(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def validate_record(record):
    if not isinstance(record, dict):
        raise InputError("A record must be a JSON object.")
    sid = record.get("id")
    if not count_value(sid) or sid == 0:
        raise InputError("Source IDs must be positive integers.")
    if source_id_from_url(record.get("url")) != sid:
        raise InputError(f"Source ID {sid}: URL does not match the source ID.")
    for key in ("name", "brand"):
        if not isinstance(record.get(key), str) or not record[key].strip():
            raise InputError(f"Source ID {sid}: missing {key}.")
    if record.get("gender") not in GENDERS:
        raise InputError(f"Source ID {sid}: unsupported gender label.")
    for field in ("seasons", "daypart"):
        votes = record.get(field)
        if votes is not None and (
            not isinstance(votes, dict)
            or any(not count_value(v) for v in votes.values())
        ):
            raise InputError(f"Source ID {sid}: invalid {field} votes.")
    rating = record.get("rating")
    if not isinstance(rating, dict):
        raise InputError(f"Source ID {sid}: invalid rating object.")
    average = rating.get("average")
    if average is not None and (
        isinstance(average, bool) or not isinstance(average, (int, float))
        or not math.isfinite(average) or not 0 <= average <= 5
    ):
        raise InputError(f"Source ID {sid}: invalid rating average.")
    histogram = rating.get("histogram")
    if not isinstance(histogram, list):
        raise InputError(f"Source ID {sid}: invalid rating histogram.")
    buckets = set()
    for entry in histogram:
        if not isinstance(entry, dict):
            raise InputError(f"Source ID {sid}: invalid histogram entry.")
        bucket = entry.get("bucket")
        if (not count_value(bucket) or bucket not in range(1, 6)
                or bucket in buckets or not count_value(entry.get("count"))):
            raise InputError(f"Source ID {sid}: invalid or duplicate rating bucket.")
        buckets.add(bucket)
    return record


def records(archive, digest):
    with zipfile.ZipFile(archive) as bundle:
        members = [x for x in bundle.infolist()
                   if Path(x.filename).name == "perfumes.jsonl" and not x.is_dir()]
        if len(members) != 1:
            raise InputError("ZIP must contain exactly one perfumes.jsonl file.")
        with bundle.open(members[0]) as stream:
            for line_number, line in enumerate(stream, 1):
                digest.update(line)
                try:
                    record = json.loads(line)
                except (ValueError, UnicodeError):
                    raise InputError(f"Invalid JSON at line {line_number}.") from None
                yield validate_record(record)


def connect(repo, readonly):
    cfg = dotenv_values(repo / ".env")
    if not cfg.get("DB_PASSWORD"):
        raise InputError("DB_PASSWORD is missing from the project-root .env.")
    conn = psycopg2.connect(
        host=cfg.get("DB_HOST", "localhost"), port=cfg.get("DB_PORT", "5432"),
        dbname=cfg.get("DB_NAME", "fragfriend"), user=cfg.get("DB_USER", "postgres"),
        password=cfg["DB_PASSWORD"], connect_timeout=10,
        application_name="fragfriend_import_preview",
    )
    conn.set_session(readonly=readonly)
    return conn


def existing_records(repo):
    conn = connect(repo, readonly=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '30s'")
            cursor.execute("""SELECT id, url, perfume, brand, year, gender,
                              rating_value, rating_count FROM public.fragrances""")
            columns = [col[0] for col in cursor.description]
            result = {}
            for values in cursor.fetchall():
                row = dict(zip(columns, values))
                sid = source_id_from_url(row["url"])
                if sid is None or sid in result:
                    raise InputError("Existing fragrances have ambiguous source URLs; stop for review.")
                result[sid] = row
            return result
    finally:
        conn.rollback()
        conn.close()


def preview(archive, existing):
    digest = hashlib.sha256()
    seen = set()
    changes, missing, quality = Counter(), Counter(), Counter()
    matched = 0
    earliest = latest = None
    for record in records(archive, digest):
        sid = record["id"]
        if sid in seen:
            raise InputError(f"Duplicate source ID {sid}; no staging allowed.")
        seen.add(sid)
        for field in ("seasons", "daypart"):
            if sum((record.get(field) or {}).values()) > 0:
                quality[f"with_positive_{field}_votes"] += 1
        if record.get("year") is None:
            quality["missing_year"] += 1
        notes = record.get("notes") or {}
        if notes.get("flat"):
            quality["flat_notes"] += 1
        if not notes.get("flat") and not any((notes.get("tiered") or {}).values()):
            quality["missing_notes"] += 1
        if not record.get("accords"):
            quality["missing_accords"] += 1
        rating = record["rating"]
        histogram = rating["histogram"]
        rating_total = sum(entry["count"] for entry in histogram) if histogram else None
        if rating_total is not None and record.get("people") != rating_total:
            quality["people_differs_from_rating_vote_total"] += 1
        stamp = (record.get("meta") or {}).get("scraped_at")
        if isinstance(stamp, (int, float)) and math.isfinite(stamp):
            earliest = stamp if earliest is None else min(earliest, stamp)
            latest = stamp if latest is None else max(latest, stamp)
        if sid not in existing:
            continue
        matched += 1
        old = existing[sid]
        proposed = {"perfume": record["name"], "brand": record["brand"],
                    "year": record.get("year"), "gender": GENDERS[record["gender"]],
                    "rating_value": rating.get("average")}
        for field, value in proposed.items():
            if value is None:
                if old[field] is not None:
                    missing[field] += 1
            elif field == "rating_value":
                if old[field] is None or Decimal(str(old[field])) != Decimal(str(value)):
                    changes[field] += 1
            elif old[field] != value:
                changes[field] += 1
    if not seen:
        raise InputError("Empty corpus; no staging allowed.")
    date = lambda value: datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None
    return {
        "importer_version": VERSION,
        "previewed_at_utc": datetime.now(timezone.utc).isoformat(),
        "corpus_sha256": digest.hexdigest(),
        "candidate_records": len(seen), "existing_records": len(existing),
        "matched_records": matched, "new_source_ids": len(seen) - matched,
        "unmatched_existing_local_ids": sorted(row["id"] for sid, row in existing.items() if sid not in seen),
        "field_differences_not_approved_updates": dict(changes),
        "incoming_null_existing_present_preserve_existing": dict(missing),
        "quality": dict(quality),
        "capture_range_utc": [date(earliest), date(latest)],
        "stage_status": "not_requested", "live_tables_modified": False,
        "notes": [
            "Counts are a preview, not an approval to merge.",
            "Preserve local IDs, existing countries/images, and unmatched fragrances.",
            "Rating histogram totals are diagnostic; rating_count mapping needs separate review.",
            "Flat notes remain flat. Missing votes remain unknown.",
            "New records require API compatibility changes before a live merge.",
        ],
    }


def stage(archive, repo, report, existing):
    """Atomically stage raw records. Never updates the live application tables."""
    conn = connect(repo, readonly=False)
    try:
        with conn:
            with conn.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '10s'")
                cursor.execute("SET LOCAL statement_timeout = '120s'")
                cursor.execute("SELECT pg_advisory_xact_lock(73190421)")
                cursor.execute("CREATE SCHEMA IF NOT EXISTS fragfriend_import_v1")
                cursor.execute("""CREATE TABLE IF NOT EXISTS fragfriend_import_v1.runs (
                    corpus_sha256 text PRIMARY KEY, importer_version integer NOT NULL,
                    staged_at timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL)""")
                cursor.execute("""CREATE TABLE IF NOT EXISTS fragfriend_import_v1.records (
                    corpus_sha256 text NOT NULL REFERENCES fragfriend_import_v1.runs(corpus_sha256),
                    source_id bigint NOT NULL, local_id_at_preview integer,
                    payload jsonb NOT NULL, PRIMARY KEY (corpus_sha256, source_id))""")
                cursor.execute("SELECT 1 FROM fragfriend_import_v1.runs WHERE corpus_sha256=%s",
                               (report["corpus_sha256"],))
                if cursor.fetchone():
                    return "already_staged"
                cursor.execute("INSERT INTO fragfriend_import_v1.runs (corpus_sha256, importer_version, report) VALUES (%s,%s,%s)",
                               (report["corpus_sha256"], VERSION, Json(report)))
                digest = hashlib.sha256()
                batch = []
                inserted = 0
                for record in records(archive, digest):
                    old = existing.get(record["id"])
                    batch.append((report["corpus_sha256"], record["id"], old["id"] if old else None, Json(record)))
                    if len(batch) >= 500:
                        execute_values(cursor, "INSERT INTO fragfriend_import_v1.records VALUES %s", batch, page_size=500)
                        inserted += len(batch)
                        batch.clear()
                if batch:
                    execute_values(cursor, "INSERT INTO fragfriend_import_v1.records VALUES %s", batch, page_size=500)
                    inserted += len(batch)
                if digest.hexdigest() != report["corpus_sha256"] or inserted != report["candidate_records"]:
                    raise InputError("Corpus changed after preview; staging rolled back.")
        return "staged"
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--stage", action="store_true", help="Write raw records to isolated staging tables; never merge.")
    args = parser.parse_args()
    try:
        existing = existing_records(args.repo)
        report = preview(args.archive, existing)
        if args.stage:
            report["stage_status"] = stage(args.archive, args.repo, report, existing)
        print(json.dumps(report, indent=2, ensure_ascii=True))
        return 0
    except InputError as error:
        print(f"Stopped: {error}", file=sys.stderr)
    except Exception as error:
        # Connection errors can contain credentials or host details. Do not print them.
        print(f"Stopped ({type(error).__name__}). No live-table writes were attempted; any uncommitted staging work was rolled back.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
