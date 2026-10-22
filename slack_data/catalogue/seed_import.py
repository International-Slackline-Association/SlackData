"""
The seed files → the live catalogue store, without undoing anything done on the site.

    # what would change (writes nothing)
    python -m slack_data.catalogue.seed_import
    # write it: each change logged as an `import` under an admin's name, and the
    # files the new entries name copied into the media store
    python -m slack_data.catalogue.seed_import --as <ISA id> --media-bucket NAME --apply
    # exit 1 while anything is still to import
    python -m slack_data.catalogue.seed_import --check

Which catalogue store: `CATALOG_TABLE` (hosted, with the operator's SSO profile)
or `CATALOG_STORE_PATH`; which media store: `--media-bucket`, else `MEDIA_DIR`;
which change log: `CHANGELOG_TABLE` or `CHANGELOG_DB_PATH` — as for the media
migration and the ISA import.

**Why it exists.** Once the site is edited, the store is the truth (D4) and
`importer --apply` refuses to overwrite it. But a pull request can still bring
data in the seeds: a new gear type (leashes, 2026-10), new products, a
co-listing, a certificate's match. This carries those in, and only those:

| the seeds | the store | written |
|---|---|---|
| an entry | nothing under its key | **created**, with its photos and manuals |
| a field of an entry | the same value | nothing |
| a different value | a field the site never changed | **set** to the seeds' value |
| a different value | a field the change log shows changed on the site | **left** as the site has it, and reported |
| an entry | an entry created on the site under the same key | **left**, and reported: the key is taken |
| nothing | an entry | **left** — the import never retires |

"Changed on the site" is read from the change log: every edit, create, revert,
merge, media change and import names the fields it changed. A field no record
names still holds what the first import put there, so the seeds' newer value
replaces nothing anyone did.

Gear entries are written through the same plan as an edit (`edits.py`), so
they are validated exactly as the loader will read them, a leash's rings must
be listed leash rings, a create advances its collection's id counter past the
new ids, and every write and its log record go in one transaction. Brands go
through `edit_brand` (its `BRAND_FIELDS` only; anything else is reported), ISA
entries through `catalogue/isa.py`, after the gear they match. Collection
envelopes (`manufacturers.json`'s `metadata`) are not imported.
"""

import argparse
import subprocess
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field

from slack_data.catalogue import edits, isa
from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.catalogue.repository import CounterAdvance, Put
from slack_data.changelog.writer import commit_catalogue_change
from slack_data.load_data.load_gear import (
    DERIVED_FIELDS,
    GEAR,
    MANUALS_KEY,
    MERGED_KEY,
    PHOTOS_KEY,
    UNMODELLED_KEY,
)
from slack_data.media.edits import LOGO_KEY
from slack_data.models.changes import Action, Channel, TargetType, item_target

BRANDS = "manufacturers"
MEDIA_FIELDS = (PHOTOS_KEY, MANUALS_KEY)
# A transaction holds 100 items; two of them are the edit count and the version,
# and a gear write is a put and a log record (a rename a few more).
MAX_WRITES = 80


@dataclass
class Change:
    collection: str
    key: str
    label: str
    # Created: the entry as the seeds hold it. Edited: {field: the seeds' value}.
    create: dict | None = None
    fields: dict = field(default_factory=dict)
    # Fields changed on the site too, left as the site has them.
    kept: list[str] = field(default_factory=list)


@dataclass
class Plan:
    changes: list[Change] = field(default_factory=list)
    # Things the import will not do, for a person to look at.
    notes: list[str] = field(default_factory=list)
    # Changes refused when written (a validation error), with the reason.
    failed: list[str] = field(default_factory=list)

    @property
    def pending(self) -> list[Change]:
        return [c for c in self.changes if c.create is not None or c.fields]


# --- What the site changed ----------------------------------------------------------


def _target(collection: str, document: Document) -> tuple[TargetType, str]:
    if collection == BRANDS:
        return TargetType.BRAND, str(document.data.get("catalog_id"))
    if collection == isa.CERTIFICATES:
        return TargetType.ISA_CERTIFICATE, document.key
    if collection == isa.WARNINGS:
        return TargetType.ISA_WARNING, document.key
    return TargetType.ITEM, item_target(collection, document.key)


def site_history(log, target_type: TargetType, target_id: str) -> list:
    """Every record of one thing, however many pages."""
    records, before = [], None
    while True:
        page = log.for_target(target_type, target_id, limit=50, before=before)
        records += page
        if len(page) < 50:
            return records
        before = page[-1].id


def touched(records: Iterable) -> set[str]:
    """The fields the change log says were changed — on the site, by an import,
    by anything. `match` for an ISA entry whose match was set or re-pointed."""
    names: set[str] = set()
    for record in records:
        names |= set(record.changes or {})
    return names


def _created_here(records: Iterable) -> bool:
    """Created on the site (or by the manufacturer API), not brought in by an
    import: the key then belongs to that entry, whatever the seeds hold."""
    return any(
        r.action in (Action.ITEM_CREATE, Action.BRAND_CREATE, Action.ISA_CREATE) and r.channel is not Channel.IMPORT
        for r in records
    )


# --- The plan -------------------------------------------------------------------------


def _label(collection: str, data: dict) -> str:
    if collection in GEAR:
        return f"{data.get('brand')} {data.get('name')}"
    if collection == BRANDS:
        return str(data.get("name"))
    return f"{data.get('manufacturer')} {data.get('model')}"


def _same(a, b) -> bool:
    return (a if a not in ("", []) else None) == (b if b not in ("", []) else None)


def _match_key(match: dict | None) -> object:
    """A match as what it says — which products, how sure, why — not the names,
    which `build_match` derives from the catalogue."""
    if not match:
        return None
    blocks = [match, *(match.get("also") or [])]
    return [
        (b.get("gearType"), list(b.get("gearIds") or []), b.get("confidence"), (b.get("note") or "").strip())
        for b in blocks
        if b.get("gearIds")
    ] or None


def _comparable(collection: str, data: dict) -> dict:
    out = {k: v for k, v in data.items() if k not in ("id", isa.SUGGESTED_KEY)}
    if collection in (isa.CERTIFICATES, isa.WARNINGS):
        out["match"] = _match_key(data.get("match"))
    return out


def _names_taken(collection: str, data: dict, taken: set[tuple[str, str]]) -> list[str]:
    """The keys this entry names that the site gave to something else: a
    leash's rings, an ISA entry's products. Imported, it would point at them."""
    named: list[tuple[str, str]] = []
    if collection == "leashes":
        named += [("leashrings", str(o.get("leashring_id"))) for o in data.get(edits.RINGS_FIELD) or []]
    if collection in (isa.CERTIFICATES, isa.WARNINGS) and data.get("match"):
        by_type = {edits.api_type(c): c for c in GEAR}
        for block in [data["match"], *(data["match"].get("also") or [])]:
            named += [(by_type.get(block.get("gearType"), ""), str(i)) for i in block.get("gearIds") or []]
    return [f"{c} {k}" for c, k in named if (c, k) in taken]


def plan(seeds: list[Document], stored: list[Document], log) -> Plan:
    result = Plan()
    index = {(d.collection, d.key): d for d in stored}
    taken: set[tuple[str, str]] = set()
    order = [*GEAR, BRANDS, isa.CERTIFICATES, isa.WARNINGS]
    for seed in sorted(seeds, key=lambda d: (order.index(d.collection), d.seq)):
        if seed.key == ENVELOPE_KEY:
            current = index.get((seed.collection, seed.key))
            if current is None or current.data != seed.data:
                result.notes.append(f"{seed.collection}: the file's envelope differs — not imported")
            continue
        label = _label(seed.collection, seed.data)
        current = index.get((seed.collection, seed.key))
        clash = _names_taken(seed.collection, seed.data, taken)
        if clash:
            result.notes.append(
                f"{seed.collection} {seed.key} ({label}): names {', '.join(clash)}, which the site gave to "
                "something else — not imported until the seeds are renumbered"
            )
            continue
        if current is None:
            result.changes.append(Change(seed.collection, seed.key, label, create=seed.data))
            continue
        if current.retired or (isinstance(current.data, dict) and current.data.get(MERGED_KEY) is not None):
            if current.data != seed.data:
                result.notes.append(
                    f"{seed.collection} {seed.key} ({label}): retired or merged in the store — left as it is"
                )
            continue
        want, have = _comparable(seed.collection, seed.data), _comparable(seed.collection, current.data)
        differ = sorted(k for k in set(want) | set(have) if not _same(want.get(k), have.get(k)))
        if not differ:
            continue
        records = site_history(log, *_target(seed.collection, current))
        if _created_here(records):
            taken.add((seed.collection, seed.key))
            result.notes.append(
                f"{seed.collection} {seed.key}: the seeds' {label!r} has a key the site gave to "
                f"{_label(seed.collection, current.data)!r} — renumber it in the seeds"
            )
            continue
        changed_here = touched(records)
        change = Change(seed.collection, seed.key, label)
        for name in differ:
            if name in changed_here:
                change.kept.append(name)
            else:
                change.fields[name] = seed.data.get("match") if name == "match" else seed.data.get(name)
        if seed.collection == BRANDS:
            settable = set(edits.BRAND_FIELDS)
        elif seed.collection in GEAR:
            settable = None  # every field but the closed ones below
        else:
            settable = set(isa.FIELDS[seed.collection]) | {"match"}
        closed = {"id", UNMODELLED_KEY, MERGED_KEY, *DERIVED_FIELDS}
        other = sorted(
            n for n in change.fields if n in closed or (settable is not None and n not in settable)
        )
        for name in other:
            change.fields.pop(name)
        if other:
            result.notes.append(
                f"{seed.collection} {seed.key} ({label}): {other} — not fields an edit sets, not imported"
            )
        result.changes.append(change)
    return result


def report(result: Plan) -> None:
    for change in result.changes:
        where = f"{change.collection} {change.key} ({change.label})"
        if change.create is not None:
            media = sum(len(change.create.get(k) or []) for k in MEDIA_FIELDS)
            print(f"+ {where}" + (f", {media} photo(s)/manual(s)" if media else ""))
        elif change.fields:
            print(f"~ {where}: {', '.join(sorted(change.fields))}")
        if change.kept:
            print(f"! {where}: {', '.join(change.kept)} changed on the site too — left as the site has it")
    for note in result.notes:
        print(f"! {note}")
    for failure in result.failed:
        print(f"✗ {failure}")
    if not result.pending:
        print("= nothing to import: the store holds everything the seeds add")


# --- Writing it --------------------------------------------------------------------------


def media_keys(entries: Iterable[dict]) -> list[str]:
    keys = []
    for entry in entries:
        for photo in entry.get(PHOTOS_KEY) or []:
            keys += [photo["small"], photo["large"]]
        manuals = entry.get(MANUALS_KEY) or []
        for manual in manuals if isinstance(manuals, list) else [m for ms in manuals.values() for m in ms]:
            keys.append(manual["file"])
        if entry.get(LOGO_KEY):
            keys.append(entry[LOGO_KEY])
    return sorted(set(keys))


def _create(documents, actor, change: Change, why: str, offset: int) -> edits.Planned:
    entry = change.create
    fields = {k: v for k, v in entry.items() if k not in ("id", *MEDIA_FIELDS)}
    planned = edits.plan_create_item(
        documents, actor, change.collection, fields, int(change.key), why, channel=Channel.IMPORT, seq_offset=offset
    )
    media = {k: entry[k] for k in MEDIA_FIELDS if entry.get(k)}
    if media:
        [put], [record] = planned.puts, planned.records
        data = {**put.document.data, **media}
        planned.puts = [Put(put.document.model_copy(update={"data": data}), None)]
        planned.records = [record.model_copy(update={"changes": edits._diff({}, data)})]
    return planned


def _commit(store, log, planned: list[edits.Planned], counters: list[CounterAdvance]) -> None:
    chunk, size = [], len(counters)
    for item in planned:
        writes = len(item.puts) + len(item.records)
        if chunk and size + writes > MAX_WRITES:
            commit_catalogue_change(store, log, [p for c in chunk for p in c.puts], counters, [r for c in chunk for r in c.records])
            counters, chunk, size = [], [], 0
        chunk.append(item)
        size += writes
    if chunk or counters:
        commit_catalogue_change(store, log, [p for c in chunk for p in c.puts], counters, [r for c in chunk for r in c.records])


def _gear(store, log, actor, collection: str, changes: list[Change], why: str, failed: list[str]) -> int:
    documents = store.load(include_retired=True)
    planned, offset, new_ids = [], 0, []
    for change in changes:
        try:
            if change.create is not None:
                planned.append(_create(documents, actor, change, why, offset))
                new_ids.append(int(change.key))
                offset += 1
            elif change.fields:
                current = next(d for d in documents if d.collection == collection and d.key == change.key)
                planned.append(edits.plan_edit_item(
                    documents, actor, collection, int(change.key), current.rev, change.fields, why,
                    channel=Channel.IMPORT, media=True,
                ))
        except edits.EditError as error:
            failed.append(f"{collection} {change.key} ({change.label}): {error.message}")
    counters = []
    current = store.counter(collection)
    if new_ids and current is not None and current <= max(new_ids):
        # The site has created items of this type: its next id must pass ours.
        counters.append(CounterAdvance(collection, current, max(new_ids) + 1))
    planned = [p for p in planned if p.puts]
    if planned or counters:
        _commit(store, log, planned, counters)
    return len(planned)


def _match_in(match: dict | None) -> isa.MatchIn:
    by_type = {edits.api_type(c): c for c in GEAR}
    if not match or not match.get("gearIds"):
        return isa.MatchIn(targets=[], confidence=(match or {}).get("confidence") or "none", note=(match or {}).get("note"))
    blocks = [match, *(match.get("also") or [])]
    return isa.MatchIn(
        targets=[isa.MatchTarget(collection=by_type[b["gearType"]], ids=b["gearIds"]) for b in blocks if b.get("gearIds")],
        confidence=match.get("confidence") or "exact",
        note=match.get("note"),
    )


def _isa(store, log, actor, collection: str, changes: list[Change], why: str, failed: list[str]) -> int:
    count = 0
    for change in changes:
        try:
            count += _isa_one(store, log, actor, collection, change, why)
        except edits.EditError as error:
            failed.append(f"{collection} {change.key} ({change.label}): {error.message}")
    return count


def _isa_one(store, log, actor, collection: str, change: Change, why: str) -> int:
    if change.create is not None:
        fields = {k: v for k, v in change.create.items() if k in isa.FIELDS[collection] and v not in (None, "", [])}
        isa.create_entry(
            store, log, actor, collection, fields, _match_in(change.create.get("match")), why,
            key=change.key, channel=Channel.IMPORT,
        )
        return 1
    if not change.fields:
        return 0
    values = {k: v for k, v in change.fields.items() if k != "match"}
    current = store.get(collection, change.key)
    isa.edit_entry(
        store, log, actor, collection, change.key, current.rev, values or None,
        _match_in(change.fields["match"]) if "match" in change.fields else None, why, Channel.IMPORT,
    )
    return 1


def _brands(store, log, actor, changes: list[Change], why: str, failed: list[str]) -> int:
    count = 0
    for change in changes:
        if not change.fields:
            continue
        current = store.get(BRANDS, change.key)
        try:
            edits.edit_brand(
                store, log, actor, int(current.data["catalog_id"]), current.rev, change.fields, why,
                channel=Channel.IMPORT,
            )
        except edits.EditError as error:
            failed.append(f"{BRANDS} {change.key} ({change.label}): {error.message}")
            continue
        count += 1
    return count


def apply(store, log, media, actor, result: Plan, why: str, snapshot=None) -> int:
    """Write the plan; the files its new entries name go to `media` first."""
    from slack_data.media.migrate import write_files
    from slack_data.media.store import SNAPSHOT_DIR

    entries = [c.create for c in result.pending if c.create is not None]
    entries += [c.fields for c in result.pending if c.create is None]
    write_files(media, media_keys(entries), snapshot or SNAPSHOT_DIR)
    count, failed = 0, result.failed
    for collection in GEAR:
        count += _gear(store, log, actor, collection, [c for c in result.pending if c.collection == collection], why, failed)
    count += _brands(store, log, actor, [c for c in result.pending if c.collection == BRANDS], why, failed)
    for collection in (isa.CERTIFICATES, isa.WARNINGS):
        count += _isa(store, log, actor, collection, [c for c in result.pending if c.collection == collection], why, failed)
    return count


def _commit_label() -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True)
        return f" at {sha.stdout.strip()}"
    except (OSError, subprocess.CalledProcessError):
        return ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--apply", action="store_true", help="write (default: report only)")
    parser.add_argument("--check", action="store_true", help="exit 1 while anything is still to import")
    parser.add_argument("--as", dest="actor", help="the ISA id of the admin the import is recorded as")
    parser.add_argument("--media-bucket", help="the media bucket (hosted); else MEDIA_DIR")
    parser.add_argument("--why", help="the reason every record carries (default: the seeds and their commit)")
    args = parser.parse_args(argv)

    import os
    from pathlib import Path

    from slack_data.catalogue.importer import documents_from_files
    from slack_data.catalogue.store import build_repository
    from slack_data.changelog.store import get_changelog_repository

    store, log = build_repository(), get_changelog_repository()
    result = plan(documents_from_files(), store.load(include_retired=True), log)
    report(result)
    if args.check:
        return 1 if result.pending else 0
    if not args.apply:
        print("dry run — nothing written. Re-run with --as <admin ISA id> --apply.")
        return 0
    if not result.pending:
        return 0

    from slack_data.models.people import Role
    from slack_data.people.store import get_people_repository

    actor = get_people_repository().find_by_isa_id(args.actor or "")
    if actor is None or not actor.has(Role.ADMIN):
        print("✗ --as must name an admin's ISA id: the import is recorded as theirs")
        return 1
    if args.media_bucket:
        from slack_data.media.s3 import S3MediaStore

        media = S3MediaStore(args.media_bucket, uploads_bucket="")
    else:
        from slack_data.media.store import FilesystemMediaStore

        media = FilesystemMediaStore(Path(os.getenv("MEDIA_DIR") or "media-local"), snapshot=None)
    why = args.why or f"From the repo's seed files{_commit_label()}: added by a pull request, not on the site."
    count = apply(store, log, media, actor, result, why)
    for failure in result.failed:
        print(f"✗ {failure}")
    print(f"✓ {count} entries written, each logged as an import; catalogue version {store.version()}")
    return 1 if result.failed else 0


if __name__ == "__main__":
    sys.exit(main())
