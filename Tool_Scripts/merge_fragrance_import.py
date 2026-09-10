"""Plan a staged corpus merge. Writes require --apply --expected-plan HASH.

No deletes, no user-table writes, and no live writes in default plan mode.
The approved plan is recomputed under a table lock before applying atomically.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sys

from psycopg2 import sql
from psycopg2.extras import Json, execute_values

from preview_fragrance_import import GENDERS, InputError, connect, source_id_from_url, validate_record


CORPUS = "414478c1921f30dd40ef140258d7f96411f5192ab20a1e76337578155ef71af4"
COLUMNS = ["id", "url", "perfume", "brand", "country", "gender", "rating_value",
           "rating_count", "year", "top_notes", "middle_notes", "base_notes",
           "perfumer1", "perfumer2", "mainaccord1", "mainaccord2", "mainaccord3",
           "mainaccord4", "mainaccord5", "image_url", "flat_notes", "accords_all"]
METADATA_FIELDS = ["notes", "accords", "seasons", "daypart", "longevity", "sillage",
                   "price_value", "community_gender", "rating", "people", "perfumers"]


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, default=str, separators=(",", ":"))


def names(items):
    if not isinstance(items, list):
        raise InputError("Notes, accords, and perfumers must be lists.")
    result = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
            raise InputError("A note, accord, or perfumer has an invalid name.")
        if item["name"].strip() not in result:
            result.append(item["name"].strip())
    return result


def project(record, old, local_id):
    validate_record(record)
    notes = record.get("notes") or {}
    tiered = notes.get("tiered") or {}
    flat = names(notes.get("flat") or [])
    pyramid = {level: names(tiered.get(level) or []) for level in ("top", "middle", "base")}
    if flat and any(pyramid.values()):
        raise InputError(f"Source ID {record['id']}: both flat and tiered notes are present.")
    year = record.get("year")
    if year is not None and (type(year) is not int or not 1 <= year <= 9999):
        raise InputError(f"Source ID {record['id']}: invalid release year.")
    row = {key: (old or {}).get(key) for key in COLUMNS}
    row.update(id=local_id, url=record["url"], perfume=record["name"],
               brand=record["brand"], gender=GENDERS[record["gender"]])
    if year is not None:
        row["year"] = year
    histogram = record["rating"]["histogram"]
    total = sum(entry["count"] for entry in histogram)
    basis = "preserved_existing"
    if total > 0:
        row["rating_value"] = round(sum(Decimal(entry["bucket"]) * entry["count"] for entry in histogram) / total, 4)
        row["rating_count"] = total
        basis = "rating_histogram"
    elif old is None:
        row["rating_value"] = record["rating"].get("average")
        row["rating_count"] = None
        basis = "source_average_unknown_count"
    # Existing notes are retained if the incoming record has no notes at all.
    if flat:
        row.update(top_notes=None, middle_notes=None, base_notes=None, flat_notes=", ".join(flat))
    elif any(pyramid.values()):
        row["flat_notes"] = None
        for level, values in pyramid.items():
            if values:
                row[level + "_notes"] = ", ".join(values)
    accords = names(record.get("accords") or [])
    if accords:
        row["accords_all"] = ", ".join(accords)
        for number in range(1, 6):
            row[f"mainaccord{number}"] = accords[number - 1] if number <= len(accords) else None
    perfumers = names(record.get("perfumers") or [])
    if perfumers:
        row["perfumer1"] = perfumers[0]
        row["perfumer2"] = perfumers[1] if len(perfumers) > 1 else None
    # Country is absent from this corpus. Remote picture links are not imported.
    stamp = (record.get("meta") or {}).get("scraped_at")
    if type(stamp) not in (int, float) or stamp <= 0:
        raise InputError(f"Source ID {record['id']}: missing capture timestamp.")
    captured = datetime.fromtimestamp(stamp, timezone.utc)
    details = {key: record.get(key) for key in METADATA_FIELDS}
    details["rating_basis"] = basis
    return row, (local_id, record["id"], captured, details)


def already_applied(conn, corpus):
    with conn.cursor() as cursor:
        cursor.execute("SELECT to_regclass('public.fragrance_imports')")
        if cursor.fetchone()[0] is None:
            return False
        cursor.execute("SELECT 1 FROM public.fragrance_imports WHERE corpus_sha256=%s", (corpus,))
        return cursor.fetchone() is not None


def prepare(conn, corpus):
    changes = Counter()
    with conn.cursor() as cursor:
        cursor.execute("SELECT to_regclass('public.fragrance_source_metadata')")
        if cursor.fetchone()[0] is not None:
            cursor.execute("SELECT count(*) FROM public.fragrance_source_metadata")
            if cursor.fetchone()[0]:
                raise InputError("Existing source metadata requires a separate incremental-update review.")
        cursor.execute("SELECT * FROM public.fragrances ORDER BY id")
        columns = [x[0] for x in cursor.description]
        current = [dict(zip(columns, values)) for values in cursor.fetchall()]
        existing = {}
        for row in current:
            sid = source_id_from_url(row.get("url"))
            if sid is None or sid in existing:
                raise InputError("Current source URLs are ambiguous; nothing can be merged.")
            existing[sid] = row
        cursor.execute("SELECT pg_get_serial_sequence('public.fragrances', 'id')")
        sequence = cursor.fetchone()[0]
        if sequence != 'public.fragrances_id_seq':
            raise InputError("Unexpected ID sequence; manual review required.")
        cursor.execute("SELECT last_value, is_called FROM public.fragrances_id_seq")
        last_value, is_called = cursor.fetchone()
        next_id = max(max((r['id'] for r in current), default=0) + 1, last_value + int(is_called))
        cursor.execute("SELECT report FROM fragfriend_import_v1.runs WHERE corpus_sha256=%s", (corpus,))
        run = cursor.fetchone()
        if not run:
            raise InputError("Requested corpus is not staged.")
        expected_count = run[0]["candidate_records"]
    fingerprint = hashlib.sha256(encoded({"version": 1, "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "corpus": corpus, "next_id": next_id, "current": current}).encode())
    rows, metadata = [], []
    seen = set()
    matched = 0
    with conn.cursor(name="staged_fragrance_merge_preview") as cursor:
        cursor.itersize = 500
        cursor.execute("""SELECT source_id, payload FROM fragfriend_import_v1.records
                          WHERE corpus_sha256=%s ORDER BY source_id""", (corpus,))
        for sid, record in cursor:
            if sid in seen or record.get("id") != sid:
                raise InputError("Staging identity validation failed.")
            seen.add(sid)
            old = existing.get(sid)
            if old:
                local_id = old["id"]
                matched += 1
            else:
                local_id = next_id
                next_id += 1
            row, meta = project(record, old, local_id)
            if old:
                for field in COLUMNS:
                    if row[field] != old.get(field):
                        changes[field] += 1
            rows.append(row)
            metadata.append(meta)
            fingerprint.update(encoded({"row": row, "metadata": meta}).encode())
    if len(rows) != expected_count or not rows:
        raise InputError("Staging row count does not match its import manifest.")
    report = {"corpus_sha256": corpus, "plan_sha256": fingerprint.hexdigest(),
              "current_fragrances": len(current), "matched_updates": matched,
              "new_fragrances": len(rows) - matched,
              "retained_unmatched": len(current) - matched,
              "expected_total": len(current) + len(rows) - matched,
              "matched_field_changes": dict(changes), "mode": "plan_only",
              "user_tables_modified": False}
    return report, rows, metadata, next_id


def apply_plan(conn, corpus, expected):
    # Caller controls the surrounding transaction; errors roll back DDL and data.
    with conn.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '15s'")
        cursor.execute("LOCK TABLE public.fragrances IN SHARE ROW EXCLUSIVE MODE")
        cursor.execute("LOCK TABLE fragfriend_import_v1.records, fragfriend_import_v1.runs IN SHARE MODE")
        cursor.execute("SELECT pg_advisory_xact_lock(73190422)")
    if already_applied(conn, corpus):
        raise InputError("This corpus has already been applied; no repeat merge is needed.")
    report, rows, metadata, next_id = prepare(conn, corpus)
    if report["plan_sha256"] != expected:
        raise InputError("Plan changed or hash is incorrect. Run plan mode again and review it.")
    with conn.cursor() as cursor:
        cursor.execute("ALTER TABLE public.fragrances ADD COLUMN IF NOT EXISTS flat_notes text")
        cursor.execute("ALTER TABLE public.fragrances ADD COLUMN IF NOT EXISTS accords_all text")
        cursor.execute("""CREATE TABLE IF NOT EXISTS public.fragrance_source_metadata (
            fragrance_id integer PRIMARY KEY REFERENCES public.fragrances(id),
            source_id bigint UNIQUE NOT NULL, captured_at timestamptz NOT NULL,
            imported_at timestamptz NOT NULL DEFAULT now(), corpus_sha256 text NOT NULL,
            attributes jsonb NOT NULL)""")
        cursor.execute("""CREATE TABLE IF NOT EXISTS public.fragrance_imports (
            corpus_sha256 text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(),
            report jsonb NOT NULL)""")
        statement = sql.SQL("INSERT INTO public.fragrances ({}) VALUES %s ON CONFLICT (id) DO UPDATE SET {}").format(
            sql.SQL(',').join(map(sql.Identifier, COLUMNS)),
            sql.SQL(',').join(sql.SQL('{}=EXCLUDED.{}').format(sql.Identifier(c), sql.Identifier(c)) for c in COLUMNS if c != 'id'),
        ).as_string(conn)
        for start in range(0, len(rows), 500):
            execute_values(cursor, statement, [tuple(r[c] for c in COLUMNS) for r in rows[start:start + 500]], page_size=500)
        statement = """INSERT INTO public.fragrance_source_metadata
            (fragrance_id,source_id,captured_at,corpus_sha256,attributes) VALUES %s
            ON CONFLICT (fragrance_id) DO UPDATE SET source_id=EXCLUDED.source_id,
            captured_at=EXCLUDED.captured_at, imported_at=now(),
            corpus_sha256=EXCLUDED.corpus_sha256, attributes=EXCLUDED.attributes"""
        for start in range(0, len(metadata), 500):
            execute_values(cursor, statement,
                           [(local_id, sid, stamp, corpus, Json(attributes)) for local_id, sid, stamp, attributes in metadata[start:start + 500]], page_size=500)
        cursor.execute(sql.SQL("ALTER SEQUENCE public.fragrances_id_seq RESTART WITH {}").format(sql.Literal(next_id)))
        cursor.execute("SELECT count(*) FROM public.fragrances")
        if cursor.fetchone()[0] != report["expected_total"]:
            raise InputError("Post-merge record count failed; rolling back.")
        report["mode"] = "applied"
        cursor.execute("INSERT INTO public.fragrance_imports (corpus_sha256,report) VALUES (%s,%s)", (corpus, Json(report)))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--corpus', default=CORPUS)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-plan')
    args = parser.parse_args()
    if args.apply and not args.expected_plan:
        parser.error('--apply requires the reviewed --expected-plan hash')
    conn = None
    try:
        conn = connect(args.repo, readonly=not args.apply)
        if already_applied(conn, args.corpus):
            print(json.dumps({'mode': 'already_applied', 'corpus_sha256': args.corpus}))
            return 0
        if args.apply:
            report = apply_plan(conn, args.corpus, args.expected_plan)
            conn.commit()
        else:
            report, _, _, _ = prepare(conn, args.corpus)
            conn.rollback()
        print(json.dumps(report, indent=2))
        return 0
    except InputError as error:
        print(f'Stopped: {error}', file=sys.stderr)
    except Exception as error:
        print(f'Stopped ({type(error).__name__}); transaction not confirmed. Inspect before retrying. Connection details withheld.', file=sys.stderr)
    finally:
        if conn is not None:
            conn.close()
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
