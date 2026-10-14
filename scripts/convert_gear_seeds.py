#!/usr/bin/env python3
"""
One-off: rewrite the nine gear seeds in the model's own vocabulary (P3-A).

Run once, on 2026-10-13, while the per-type loaders still existed. It built the
catalogue from the seeds exactly as the site did, read every gear row back, and
wrote it as a seed entry with `load_gear.to_entry`. File order and ids are kept.

    python3 scripts/convert_gear_seeds.py           # rewrite the nine files
    python3 scripts/convert_gear_seeds.py --check   # build both ways, compare

`--check` builds the catalogue from the converted files with the new loader and
compares it to the old build, every row of every table, field by field. The
conversion is right only if that comparison is empty.

Kept for provenance. It imports the old loaders through `slack_data.seed` as it
was before the switch, so after the switch it no longer runs; read it with the
commit that ran it.
"""

import contextlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select

from slack_data.catalogue.build import (
    build_engine,
    compare,
    sources_from_files,
)
from slack_data.catalogue.documents import render
from slack_data.load_data.load_gear import GEAR, to_entry
from slack_data.models.brands import Brand

# What the old seeds held that no loader read — kept under `unmodelled`
# (load_gear.py). Found by checking every key path against its loader.
UNMODELLED = {
    "weblocks": (
        "image_url", "details_url", "full_name", "manufacturer_info", "product_page_url",
        "specifications.WLL", "specifications.Diverter diameter", "specifications.Efficiency",
        "specifications.Usage", "specifications.Date introduced", "specifications.Manufacturer",
        "specifications.Manufacturer Product Page",
    ),
    "rollers": ("wll", "compatible_webbing_width", "inner_width", "outer_bearing_diameter"),
}


def unmodelled_of(collection: str, old_entry: dict) -> dict:
    kept: dict = {}
    for path in UNMODELLED.get(collection, ()):
        head, _, tail = path.partition(".")
        if head not in old_entry:
            continue
        if not tail:
            kept[head] = old_entry[head]
        elif isinstance(old_entry[head], dict) and tail in old_entry[head]:
            kept.setdefault(head, {})[tail] = old_entry[head][tail]
    return kept


def converted(old_engine) -> dict[str, list[dict]]:
    out = {}
    with Session(old_engine) as session:
        names = {b.id: b.name for b in session.exec(select(Brand))}
        for collection, (model, _) in GEAR.items():
            old_entries = json.loads((ROOT / f"{collection}.json").read_text())
            rows = {row.id: row for row in session.exec(select(model))}
            assert set(rows) == {e["id"] for e in old_entries}, collection
            out[collection] = [
                to_entry(collection, rows[e["id"]], names[rows[e["id"]].brand_id], unmodelled_of(collection, e))
                for e in old_entries
            ]
    return out


def main() -> int:
    with contextlib.redirect_stdout(io.StringIO()):
        old = build_engine(sources_from_files())
    entries = converted(old)
    if "--check" in sys.argv:
        sources = sources_from_files()
        for collection, items in entries.items():
            sources[f"{collection}.json"] = items
        # The nine per-type loaders, swapped for the generic one, inside the
        # same seed_catalog: everything else (sellers, enrichment, ISA) runs as is.
        from slack_data import seed
        from slack_data.load_data.load_gear import load_gear

        for collection in GEAR:
            setattr(seed, f"load_{collection}", lambda session, c=collection: load_gear(session, c))
        with contextlib.redirect_stdout(io.StringIO()):
            new = build_engine(sources)
        differences = compare(old, new)
        for line in differences:
            print(line)
        print("✓ identical" if not differences else f"✗ {len(differences)} differences")
        return 1 if differences else 0
    for collection, items in entries.items():
        (ROOT / f"{collection}.json").write_text(render(collection, items))
        print(f"✓ {collection}.json: {len(items)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
