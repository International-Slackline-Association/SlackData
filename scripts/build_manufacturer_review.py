#!/usr/bin/env python3
"""Emit manufacturer_review.csv — the worksheet for checking which brands still trade.

Why this exists: `Brand.active` is a non-nullable bool defaulting to True, and the
manufacturers.json source leaves `active` null for 21 of 76 entries. Those nulls
silently inherit the default, so today every brand reads active=true whether it was
verified or never looked at. This script lists every brand we actually hold gear for,
with the links needed to check it, so the column can be filled in by hand once.

Counts come from the root seed JSON (not the API), so this runs with no server up.
Brand names are normalised through canonical_brand() — the same function get_brand()
uses — so the `brand` column is exactly the key the loader will match on later.

    python3 scripts/build_manufacturer_review.py
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from slack_data.utilities.brand_aliases import canonical_brand  # noqa: E402

OUT = ROOT / "manufacturer_review.csv"

# gear seed file -> the key holding the brand name in that file (they differ; see CLAUDE.md)
SEED = {
    "webbings.json": "brand",
    "weblocks.json": "brand",
    "grips.json": "manufacturer",
    "leashrings.json": "manufacturer",
    "treepros.json": "manufacturer",
    "starterkits.json": "manufacturer",
    "tricklinekits.json": "manufacturer",
    "rollers.json": "manufacturer",
}


def gear_counts() -> Counter:
    counts: Counter = Counter()
    for filename, brand_key in SEED.items():
        path = ROOT / filename
        if not path.exists():
            continue
        for item in json.loads(path.read_text(encoding="utf-8")):
            name = item.get(brand_key)
            if name:
                counts[canonical_brand(str(name))] += 1
    return counts


def manufacturer_meta() -> dict[str, dict]:
    raw = json.loads((ROOT / "manufacturers.json").read_text(encoding="utf-8"))
    meta: dict[str, dict] = {}
    for entry in raw.get("manufacturers", {}).values():
        name = (entry.get("name") or "").strip()
        if name:
            meta[canonical_brand(name)] = entry
    return meta


def main() -> int:
    counts = gear_counts()
    meta = manufacturer_meta()

    rows = []
    for brand, gear in counts.items():
        info = meta.get(brand, {})
        rows.append(
            {
                "brand": brand,
                # The column to fill in: yes / no. Left blank = not yet reviewed;
                # blank rows are skipped by the reader, keeping the current value.
                "active": "",
                "gear": gear,
                "country": info.get("country") or "",
                "website": info.get("website") or "",
                "facebook": info.get("facebook") or "",
                # What the SlackDB dump claimed. "unknown" is the null case — those
                # are the rows most worth checking, since they only *look* active.
                "source_active": {True: "true", False: "false"}.get(info.get("active"), "unknown"),
            }
        )

    # Biggest catalogues first: they matter most and are quickest to recognise.
    rows.sort(key=lambda r: (-r["gear"], r["brand"]))

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["brand", "active", "gear", "country", "website", "facebook", "source_active"]
        )
        writer.writeheader()
        writer.writerows(rows)

    unknown = sum(1 for r in rows if r["source_active"] == "unknown")
    print(f"Wrote {OUT.relative_to(ROOT)} — {len(rows)} brands ({unknown} with unknown status)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
