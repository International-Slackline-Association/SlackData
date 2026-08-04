#!/usr/bin/env python3
"""Fold a completed manufacturer_review.csv back into manufacturers.json.

manufacturers.json stays the single source of truth that the loader reads; the
CSV is only a worksheet for the human pass. This script closes that loop.

Which column holds the verdict: `active` is the column the generator leaves blank
for you to fill, but a spreadsheet round-trip makes it just as natural to edit the
pre-filled `source_active` column instead. So we accept EITHER — `active` wins when
it has a value, otherwise `source_active` is used. Excel also uppercases booleans
(true -> TRUE), hence the case-insensitive parse.

Blank / "unknown" means "not reviewed" and is skipped, leaving whatever
manufacturers.json already says rather than guessing.

    python3 scripts/apply_manufacturer_review.py            # apply
    python3 scripts/apply_manufacturer_review.py --dry-run  # report only
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from slack_data.utilities.brand_aliases import canonical_brand  # noqa: E402

REVIEW = ROOT / "manufacturer_review.csv"
MFR_JSON = ROOT / "manufacturers.json"

TRUTHY = {"true", "yes", "y", "1", "active"}
FALSY = {"false", "no", "n", "0", "defunct", "inactive"}


def parse_verdict(row: dict) -> bool | None:
    """The reviewed active value, or None when the row wasn't reviewed."""
    for column in ("active", "source_active"):
        raw = (row.get(column) or "").strip().lower()
        if raw in TRUTHY:
            return True
        if raw in FALSY:
            return False
        # "unknown" / "" fall through to the next column, then to None.
    return None


def main() -> int:
    dry_run = "--dry-run" in sys.argv

    verdicts: dict[str, bool] = {}
    unreviewed: list[str] = []
    with open(REVIEW, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            brand = canonical_brand((row.get("brand") or "").strip())
            if not brand:
                continue
            verdict = parse_verdict(row)
            if verdict is None:
                unreviewed.append(brand)
            else:
                verdicts[brand] = verdict

    data = json.loads(MFR_JSON.read_text(encoding="utf-8"))
    changed, unmatched = [], []
    for entry in data.get("manufacturers", {}).values():
        name = canonical_brand((entry.get("name") or "").strip())
        if name not in verdicts:
            continue
        if entry.get("active") != verdicts[name]:
            changed.append((name, entry.get("active"), verdicts[name]))
            if not dry_run:
                entry["active"] = verdicts[name]

    matched = {canonical_brand((e.get("name") or "").strip()) for e in data.get("manufacturers", {}).values()}
    unmatched = sorted(set(verdicts) - matched)

    active = sum(1 for v in verdicts.values() if v)
    print(f"Reviewed: {len(verdicts)} ({active} active / {len(verdicts) - active} defunct)")
    print(f"Not reviewed (left as-is): {len(unreviewed)}" + (f" — {', '.join(unreviewed)}" if unreviewed else ""))
    print(f"Changed in manufacturers.json: {len(changed)}")
    for name, before, after in changed:
        print(f"  {name:34s} {before!r} -> {after!r}")
    if unmatched:
        print(f"\nWARNING: {len(unmatched)} reviewed brand(s) matched no manufacturers.json entry:")
        for name in unmatched:
            print(f"  {name}")

    if dry_run:
        print("\n(dry run — nothing written)")
        return 0

    # Keep the file's existing 2-space style so the diff stays reviewable.
    MFR_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {MFR_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
