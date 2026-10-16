"""
The ISA's lists → the catalogue store — live editing phase 7 (P7-E).

    # what would change (writes nothing)
    python -m slack_data.catalogue.isa_import --certificates isa_approved_data.csv --warnings warnings.json
    # write it, each change logged as an `import` under an admin's name
    python -m slack_data.catalogue.isa_import --certificates ... --warnings ... --as <ISA id> --apply

Which store: `CATALOG_TABLE` (hosted, with the operator's SSO profile) or
`CATALOG_STORE_PATH`, as for the media migration.

**The inputs are fresh captures of the ISA's lists**, in the shapes the repo
already holds them: the approved-gear CSV (`isa_approved_data.csv`, parsed by
`scripts/build_isa_certified.py`, so the two cannot disagree) and the
warnings as `isa_gear_warnings.json` holds them (any `match` blocks in it are
ignored). Either may be left out.

What it does, entry by entry (keyed by `cert_id` / `id`):

| the ISA's list | the store | written |
|---|---|---|
| has it, store has not | — | added **unmatched**; a match it can make by `"<brand> <name>"` is offered as `suggested_match`, never applied (D24) |
| has it, its fields differ | the ISA's fields | updated — the match is never touched |
| no longer has it | an entry of the ISA's | retired, "no longer on the ISA's list" |

An admin's own entries (`slackdata-<n>`) are never retired by an import. Every
write is a logged change flagged `safety` (`catalogue/isa.py`), so a re-import
shows in the safety feed exactly as an admin's edit would.
"""

import argparse
import csv
import importlib.util
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from slack_data.catalogue import isa
from slack_data.catalogue.documents import Document
from slack_data.load_data.load_gear import MERGED_KEY
from slack_data.models.changes import Channel
from slack_data.utilities.brand_aliases import canonical_brand

ROOT = Path(__file__).resolve().parents[2]
MANUAL_PREFIX = "slackdata-"


def read_certificates(path: Path) -> list[dict]:
    """The approved-gear CSV, as `build_isa_certified.py` reads it."""
    spec = importlib.util.spec_from_file_location("build_isa_certified", ROOT / "scripts" / "build_isa_certified.py")
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    with path.open(newline="", encoding="utf-8") as f:
        return [script.normalize(row) for row in csv.DictReader(f)]


def read_warnings(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    items = raw["items"] if isinstance(raw, dict) else raw
    return [{k: v for k, v in item.items() if k != "match"} for item in items]


def _isa_fields(collection: str, data: dict) -> dict:
    return {name: data.get(name) for name in isa.FIELDS[collection]}


def suggest(documents: list[Document], collection: str, incoming: dict) -> dict | None:
    """A match by name, if exactly one listed product of a type this entry
    can land on is `"<manufacturer> <model>"`."""
    brand = canonical_brand(str(incoming.get("manufacturer") or "")).lower()
    model = str(incoming.get("model") or "").strip().lower()
    if not brand or not model:
        return None
    targetable = isa._targetable(collection)
    hits = [
        d for d in documents
        if d.collection in targetable and not d.retired and d.data.get(MERGED_KEY) is None
        and canonical_brand(str(d.data.get("brand") or "")).lower() == brand
        and str(d.data.get("name") or "").strip().lower() == model
    ]
    if len(hits) != 1:
        return None
    [hit] = hits
    return {"collection": hit.collection, "ids": [int(hit.key)], "name": f"{hit.data['brand']} {hit.data['name']}"}


@dataclass
class Plan:
    collection: str
    new: list[dict] = field(default_factory=list)
    changed: list[tuple[str, dict]] = field(default_factory=list)  # key, {field: new value}
    gone: list[str] = field(default_factory=list)
    reappeared: list[str] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        return not (self.new or self.changed or self.gone)


def plan(documents: list[Document], collection: str, incoming: list[dict]) -> Plan:
    key_field = isa.KEY_FIELD[collection]
    stored = {d.key: d for d in documents if d.collection == collection}
    result = Plan(collection)
    seen = set()
    for item in incoming:
        key = str(item[key_field])
        seen.add(key)
        document = stored.get(key)
        if document is None:
            result.new.append(item)
        elif document.retired:
            result.reappeared.append(key)
        else:
            want = _isa_fields(collection, item)
            have = _isa_fields(collection, document.data)
            changes = {k: v for k, v in want.items() if (v or None) != (have[k] or None)}
            if changes:
                result.changed.append((key, changes))
    result.gone = sorted(
        key for key, d in stored.items()
        if key not in seen and not d.retired and not key.startswith(MANUAL_PREFIX) and key != "_envelope"
    )
    return result


def report(result: Plan) -> None:
    label = isa.LABEL[result.collection]
    key_field = isa.KEY_FIELD[result.collection]
    for item in result.new:
        print(f"+ new {label} {item[key_field]}: {item.get('manufacturer')} {item.get('model')}")
    for key, changes in result.changed:
        print(f"~ {label} {key}: {sorted(changes)}")
    for key in result.gone:
        print(f"- {label} {key}: no longer on the ISA's list — will be retired")
    for key in result.reappeared:
        print(f"! {label} {key} is back on the ISA's list but retired here — left for an admin")
    if result.empty:
        print(f"= {label}s: nothing to change")


def apply(store, log, actor, documents: list[Document], result: Plan, stamp: str) -> int:
    collection = result.collection
    key_field = isa.KEY_FIELD[collection]
    why = f"The ISA's list as captured {stamp}."
    count = 0
    for item in result.new:
        suggestion = suggest(documents, collection, item)
        isa.create_entry(
            store, log, actor, collection,
            {k: v for k, v in _isa_fields(collection, item).items() if v not in (None, "", [])},
            None, why, key=str(item[key_field]), channel=Channel.IMPORT,
            extra={isa.SUGGESTED_KEY: suggestion} if suggestion else None,
        )
        count += 1
    for key, changes in result.changed:
        current = store.get(collection, key)
        isa.edit_entry(store, log, actor, collection, key, current.rev, changes, None, why, Channel.IMPORT)
        count += 1
    for key in result.gone:
        current = store.get(collection, key)
        isa.retire_entry(
            store, log, actor, collection, key, current.rev, f"No longer on the ISA's list as captured {stamp}.",
            Channel.IMPORT,
        )
        count += 1
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--certificates", type=Path, help="the approved-gear CSV capture")
    parser.add_argument("--warnings", type=Path, help="the warnings capture, as isa_gear_warnings.json")
    parser.add_argument("--captured", default=None, help="when the captures were taken (default: today)")
    parser.add_argument("--apply", action="store_true", help="write (default: report only)")
    parser.add_argument("--as", dest="actor", help="the ISA id of the admin the import is recorded as")
    args = parser.parse_args(argv)
    if not (args.certificates or args.warnings):
        parser.error("give --certificates and/or --warnings")

    from datetime import datetime, timezone

    from slack_data.catalogue.store import build_repository

    store = build_repository()
    documents = store.load(include_retired=True)
    plans = []
    if args.certificates:
        plans.append(plan(documents, isa.CERTIFICATES, read_certificates(args.certificates)))
    if args.warnings:
        plans.append(plan(documents, isa.WARNINGS, read_warnings(args.warnings)))
    for result in plans:
        report(result)
    if not args.apply:
        print("dry run — nothing written. Re-run with --apply.")
        return 0

    from slack_data.changelog.store import get_changelog_repository
    from slack_data.models.people import Role
    from slack_data.people.store import get_people_repository

    actor = get_people_repository().find_by_isa_id(args.actor or "")
    if actor is None or not actor.has(Role.ADMIN):
        print("✗ --as must name an admin's ISA id: the import is recorded as theirs")
        return 1
    stamp = args.captured or datetime.now(timezone.utc).date().isoformat()
    log = get_changelog_repository()
    total = sum(apply(store, log, actor, store.load(), result, stamp) for result in plans)
    print(f"✓ {total} changes, each logged as an import; version {store.version()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
