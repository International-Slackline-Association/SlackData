#!/usr/bin/env python3
"""Give every item in the root seed `*.json` a stable, explicit `id`.

**The problem.** The seeds recorded no identity, so a gear id was whatever
SQLite's autoincrement handed out at seed time — a property of *where an item
sat in a file*. Inserting one product mid-file shifted every id after it and
silently re-pointed anything holding an id: ISA warning match blocks, brand
credentials, submitted corrections, `/webbings/42` links people had bookmarked.

Every downstream guard (`load_isa_warnings.py`'s name check,
`manufacturers/matching.py`'s verify-then-self-heal, `verify_brand`) exists to
survive that drift. This script removes the cause: identity moves into the
source of truth, where a diff can show it changing.

**Why it is safe to run now.** The ids being written are the ones the catalogue
already assigns, read out of a built `database.db` and matched on
`"<brand> <name>"` — which is unique in all eight files (bare `name` is not:
webbings has 3 duplicates, weblocks 2, starterkits 2). Nothing is renumbered, so
every id already recorded anywhere stays correct.

Brands have the same problem one level up: a `Brand` row is created on the fly
by `get_brand()`, so a brand's id records *which gear file happened to mention it
first*. That is what `verify_brand()` 503s about. So this script also writes a
`catalog_id` onto every entry in `manufacturers.json`, which `get_brand()` then
assigns instead of letting SQLite pick. Manufacturers we hold no gear for get a
number too, so the day their first product lands nothing is renumbered.

Run it against the *deployed* catalogue, not a scratch one — the ids that matter
are the ones live clients hold.

    python3 scripts/backfill_seed_ids.py            # write ids into the seeds
    python3 scripts/backfill_seed_ids.py --check    # verify only, exit 1 on drift
    python3 scripts/backfill_seed_ids.py --db path/to/database.db

It is idempotent, and it is also the tool for the *next* item: append an entry
with no `id` to a seed file, re-run, and it takes the next free number rather
than displacing anything. An item the database has never seen is reported, not
silently skipped.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slack_data.utilities.brand_aliases import canonical_brand

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "slack_data" / "database.db"

# seed file -> (catalogue table, the seed's key for the brand name). The brand
# field is `brand` for webbing/weblock and `manufacturer` everywhere else — the
# same split the loaders carry; see CLAUDE.md § Loader pattern.
SEEDS: dict[str, tuple[str, str]] = {
    "webbings.json": ("webbing", "brand"),
    "weblocks.json": ("weblock", "brand"),
    "rollers.json": ("roller", "manufacturer"),
    "leashrings.json": ("leashring", "manufacturer"),
    "grips.json": ("grip", "manufacturer"),
    "treepros.json": ("treepro", "manufacturer"),
    "starterkits.json": ("starterkit", "manufacturer"),
    "tricklinekits.json": ("tricklinekit", "manufacturer"),
}

BRANDS_FILE = "manufacturers.json"


def identity(brand: object, name: object) -> str:
    """The one handle that is unique across every seed file: `"<brand> <name>"`.

    The brand goes through `canonical_brand()` first, exactly as `get_brand()`
    does at load time — the seeds spell one manufacturer up to three ways
    ("BalanceCommunity", "Balance Community: Slackline Outfitters"), and without
    folding them the seed key would never match the row it created.

    Deliberately the same string `load_isa_warnings.py` verifies its match
    blocks against, so both agree on what "the same product" means.
    """
    return f"{canonical_brand(str(brand))} {name}".strip()


def catalogue_ids(db: Path, table: str) -> dict[str, int]:
    """`"<brand> <name>"` -> primary key, as the built catalogue assigns them."""
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute(
            # `table` comes from SEEDS above, never from input.
            f"SELECT g.id, b.name, g.name FROM {table} g"
            " JOIN brand b ON b.id = g.brand_id ORDER BY g.id"
        ).fetchall()
    finally:
        con.close()

    ids: dict[str, int] = {}
    for gear_id, brand, name in rows:
        key = identity(brand, name)
        if key in ids:
            # Would make the mapping ambiguous, which is the whole thing this
            # script is trying to end. Refuse rather than pick one.
            raise SystemExit(f"{table}: two rows share the identity {key!r} (#{ids[key]}, #{gear_id})")
        ids[key] = gear_id
    return ids


def with_id_first(item: dict, gear_id: int) -> dict:
    """`item` with `id` as its first key — it reads as the identity it is."""
    rest = {key: value for key, value in item.items() if key != "id"}
    return {"id": gear_id, **rest}


def process(filename: str, table: str, brand_key: str, db: Path, check: bool) -> tuple[int, int, list[str]]:
    """Returns (assigned, kept, problems) for one seed file."""
    path = ROOT / filename
    raw = path.read_text(encoding="utf-8")
    items = json.loads(raw)
    known = catalogue_ids(db, table)
    next_free = max(known.values(), default=0) + 1

    problems: list[str] = []
    seen: dict[int, str] = {}
    assigned = kept = 0
    out: list[dict] = []

    for index, item in enumerate(items):
        key = identity(item.get(brand_key), item.get("name"))
        existing = item.get("id")
        from_db = known.get(key)

        if existing is not None and from_db is not None and existing != from_db:
            # The seed and the catalogue disagree about which product this is.
            # Never resolved automatically: one of them is pointing at the wrong
            # row, and only a human knows which.
            problems.append(f"{filename}[{index}] {key!r} is #{existing} in the seed but #{from_db} in {table}")
            gear_id = existing
        elif existing is not None:
            gear_id = int(existing)
            kept += 1
        elif from_db is not None:
            gear_id = from_db
            assigned += 1
        else:
            # Appended to the seed but never seeded — take the next free number.
            gear_id = next_free
            next_free += 1
            assigned += 1
            problems.append(f"{filename}[{index}] {key!r} is not in {table}; assigned #{gear_id} (unverified)")

        if gear_id in seen:
            problems.append(f"{filename}[{index}] #{gear_id} is already used by {seen[gear_id]!r}")
        seen[gear_id] = key
        out.append(with_id_first(item, gear_id))

    if not check and assigned:
        path.write_text(json.dumps(out, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    return assigned, kept, problems


def process_brands(db: Path, check: bool) -> tuple[int, int, list[str]]:
    """Write `catalog_id` onto every manufacturers.json entry.

    Entries we hold no gear for have no row to read an id from, so they take the
    next free number. That is the point of numbering all 76 rather than only the
    56 with products: the id is decided before the first product arrives, not by
    where that product happened to be filed.
    """
    path = ROOT / BRANDS_FILE
    document = json.loads(path.read_text(encoding="utf-8"))
    entries: dict[str, dict] = document["manufacturers"]

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        known = {name: brand_id for brand_id, name in con.execute("SELECT id, name FROM brand")}
    finally:
        con.close()
    next_free = max([*known.values(), len(entries)], default=0) + 1

    problems: list[str] = []
    seen: dict[int, str] = {}
    assigned = kept = 0

    for key, entry in entries.items():
        name = canonical_brand(str(entry.get("name")))
        existing = entry.get("catalog_id")
        from_db = known.get(name)

        if existing is not None and from_db is not None and existing != from_db:
            problems.append(f"{BRANDS_FILE}[{key}] {name!r} is #{existing} in the seed but #{from_db} in brand")
            catalog_id = existing
        elif existing is not None:
            catalog_id = int(existing)
            kept += 1
        elif from_db is not None:
            catalog_id = from_db
            assigned += 1
        else:
            # No gear, so no row: this brand's id is being decided here, now.
            catalog_id = next_free
            next_free += 1
            assigned += 1

        if catalog_id in seen:
            problems.append(f"{BRANDS_FILE}[{key}] #{catalog_id} is already used by {seen[catalog_id]!r}")
        seen[catalog_id] = name
        entries[key] = {"catalog_id": catalog_id, **{k: v for k, v in entry.items() if k != "catalog_id"}}

    if not check and assigned:
        path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return assigned, kept, problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="catalogue to read ids from")
    parser.add_argument("--check", action="store_true", help="verify only; exit 1 on drift")
    args = parser.parse_args()

    if not args.db.exists():
        raise SystemExit(
            f"No catalogue at {args.db}. Build one first (scripts/build_catalog_db.py,"
            " or run the dev server once) — the ids come from it, not from file order."
        )

    problems: list[str] = []
    pending = 0
    for filename, (table, brand_key) in SEEDS.items():
        assigned, kept, issues = process(filename, table, brand_key, args.db, args.check)
        problems += issues
        pending += assigned if args.check else 0
        verb = "would assign" if args.check else "assigned"
        print(f"{filename:22} {verb} {assigned:4}  kept {kept:4}")

    assigned, kept, issues = process_brands(args.db, args.check)
    problems += issues
    pending += assigned if args.check else 0
    verb = "would assign" if args.check else "assigned"
    print(f"{BRANDS_FILE:22} {verb} {assigned:4}  kept {kept:4}")

    for problem in problems:
        print(f"  ! {problem}", file=sys.stderr)
    if problems:
        return 1
    if args.check:
        # An id the script would have to assign is one the seed does not record,
        # which is the state this whole change exists to end.
        if pending:
            print(f"\n{pending} item(s) carry no id — run without --check.", file=sys.stderr)
            return 1
        print("\nAll seed ids present and agreeing with the catalogue.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
