#!/usr/bin/env python3
"""Build `isa_certified.json` from the raw ISA approved-gear capture.

Source: `isa_approved_data.csv` at the repo root — one row per certificate on
https://data.slacklineinternational.org/safety/isa-approved-gear/, committed
verbatim as provenance. The JSON is the normalized form the loader reads, and it
is *derived*: edit the CSV (or re-scrape into it) and re-run this script, never
the JSON's source fields by hand.

The one hand-written part is each entry's `match` block — the adjudication of
which of our gear rows a certificate is for, shaped exactly like the one in
`isa_gear_warnings.json`:

    "match": {
        "gearType": "webbing",          # our table, or null when unmatched
        "gearIds": [63],                # primary keys in that table
        "gearNames": ["Slacktivity Marathon"],   # "<brand> <name>", verified by the loader
        "confidence": "exact",          # only `exact` certifies
        "note": "..."
    }

A rebuild **keeps every match block, keyed by `cert_id`**, so a re-scrape never
loses adjudication. A certificate new to the CSV gets an empty match and is
reported; one that has vanished from the CSV is dropped and reported, since its
match would otherwise outlive the certificate it describes.

    python3 scripts/build_isa_certified.py            # (re)write isa_certified.json
    python3 scripts/build_isa_certified.py --check    # verify only, exit 1 on drift
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT / "isa_approved_data.csv"
JSON_FILE = ROOT / "isa_certified.json"

EMPTY_MATCH = {"gearType": None, "gearIds": [], "gearNames": [], "confidence": "none", "note": ""}

# The source's way of saying a product needed no lab test (the ISA:37 leash
# ring / leash standards allow it). Stored as null, with the raw value noted.
NO_LAB = "not needed"


def _blank_to_none(raw: str) -> str | None:
    raw = raw.strip()
    return raw or None


def parse_certificate(raw: str) -> tuple[int, str | None]:
    """`"ISA:41:A+"` → `(41, "A+")`; `"ISA:51"` → `(51, None)`."""
    m = re.fullmatch(r"ISA:(\d+)(?::(A\+|A|B|C))?", raw.strip())
    if not m:
        raise ValueError(f"unrecognised certificate {raw!r}")
    return int(m.group(1)), m.group(2)


def parse_test_date(raw: str) -> str | None:
    """`"06.2021"` → `"2021-06"`; `"2024"` → `"2024"`."""
    raw = raw.strip()
    if not raw:
        return None
    if m := re.fullmatch(r"(\d{2})\.(\d{4})", raw):
        return f"{m.group(2)}-{m.group(1)}"
    if re.fullmatch(r"\d{4}", raw):
        return raw
    raise ValueError(f"unrecognised test date {raw!r}")


def parse_url(raw: str, notes: list[str], label: str) -> str | None:
    """Blank → None. The source has two `httpa://` typos; repaired, and noted."""
    url = _blank_to_none(raw)
    if url and url.startswith("httpa://"):
        notes.append(f"{label}: source scheme 'httpa://' corrected to 'https://'")
        url = "https://" + url[len("httpa://"):]
    return url


def cert_sort_key(cert_id: str) -> int:
    return int(cert_id.rsplit("_", 1)[1])


def normalize(row: dict[str, str]) -> dict:
    notes: list[str] = []
    certificate = row["Standard"].strip()
    standard_number, isa_class = parse_certificate(certificate)

    lab = row["Testing Laboratory"].strip()
    if lab.lower() == NO_LAB:
        notes.append(f"testing_lab: source says {lab!r}")
        lab = None

    return {
        "cert_id": row["Cert ID"].strip(),
        "certificate": certificate,
        "standard_number": standard_number,
        "isa_class": isa_class,
        "product_type": row["Product Type"].strip(),
        "manufacturer": row["Brand"].strip(),
        "model": row["Model"].strip(),
        "model_version": _blank_to_none(row["Model Version"]),
        "release_year": int(row["Release Year"]) if row["Release Year"].strip() else None,
        "standard_version": _blank_to_none(row["Standard Version"]),
        "testing_lab": lab or None,
        "test_date": parse_test_date(row["Test Date"]),
        "product_url": parse_url(row["Product Link"], notes, "product_url"),
        "manual_url": parse_url(row["Manual Link"], notes, "manual_url"),
        "pictures": [p for p in (_blank_to_none(row["Picture 1"]), _blank_to_none(row["Picture 2"])) if p],
        "manufacturer_email": _blank_to_none(row["Manufacturer Email"]),
        "source_notes": notes,
    }


def build(existing: dict[str, dict]) -> tuple[str, list[str]]:
    """Return the JSON text to write, plus human-readable reports."""
    with CSV_FILE.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    reports: list[str] = []
    items: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        item = normalize(row)
        cert_id = item["cert_id"]
        if cert_id in seen:
            raise ValueError(f"duplicate Cert ID {cert_id!r} in {CSV_FILE.name}")
        seen.add(cert_id)
        if cert_id in existing:
            item["match"] = existing[cert_id].get("match") or dict(EMPTY_MATCH)
        else:
            item["match"] = dict(EMPTY_MATCH)
            reports.append(f"new certificate {cert_id} ({item['manufacturer']} {item['model']}) — needs a match block")
        items.append(item)

    for cert_id in sorted(set(existing) - seen, key=cert_sort_key):
        reports.append(f"{cert_id} is no longer in {CSV_FILE.name} — dropped, with its match block")

    items.sort(key=lambda it: cert_sort_key(it["cert_id"]))
    text = json.dumps({"items": items}, indent=4, ensure_ascii=False) + "\n"
    return text, reports


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="verify only; exit 1 on drift")
    args = parser.parse_args()

    current = JSON_FILE.read_text(encoding="utf-8") if JSON_FILE.exists() else None
    existing = {it["cert_id"]: it for it in json.loads(current)["items"]} if current else {}

    text, reports = build(existing)
    for report in reports:
        print(f"  ! {report}", file=sys.stderr)

    if args.check:
        if text != current:
            print(f"{JSON_FILE.name} is out of date with {CSV_FILE.name} — run without --check.", file=sys.stderr)
            return 1
        print(f"{JSON_FILE.name} agrees with {CSV_FILE.name}.")
        return 0

    JSON_FILE.write_text(text, encoding="utf-8")
    print(f"wrote {JSON_FILE.name}: {len(json.loads(text)['items'])} certificates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
