"""
The repo's media → a hosted media store, once (D47, P4-F, P4-J).

    # what would change (writes nothing)
    python -m slack_data.media.migrate
    # copy the files to the media bucket, add the media keys to the stored
    # entries, one `import` record per item and brand
    python -m slack_data.media.migrate --as <ISA id> --media-bucket NAME --apply
    # exit 1 if anything is still to migrate
    python -m slack_data.media.migrate --media-bucket NAME --check

Which catalogue store: `CATALOG_TABLE` (hosted, run with the operator's SSO
profile) or `CATALOG_STORE_PATH`; which media store: `--media-bucket`, else
`MEDIA_DIR`.

**The source is the repo's dev snapshot**: the root seeds' `photos`,
`manuals` and `logo` keys, and the files under `media/` they name. Both were
made from the pre-phase-4 `frontend/public/` trees — re-encoded to 480 px and
1600 px WebP, metadata stripped (P4-E), each file's media id the start of its
source's SHA-256 — by this module's earlier version, which git history holds.
Since then photos are uploaded by hand (Photos and manuals), and the trees and
the scripts that gathered them are gone.

The store, not the seeds, is the truth for everything else, so only media is
touched: a stored entry keeps what it holds, and gains each seed file it does
not (by media id); a brand keeps a logo it has. An entry the store no longer
lists is skipped with a warning.
"""

import argparse
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.load_data.load_gear import GEAR, MANUALS_KEY, PHOTOS_KEY, is_listed
from slack_data.media import kinds
from slack_data.media.edits import LOGO_KEY
from slack_data.media.store import SNAPSHOT_DIR, FilesystemMediaStore, MediaStore

BRANDS = "manufacturers"
# Entries per transaction: each is a put and a log record, and DynamoDB takes
# 100 items in one, two of them the edit count and the version.
BATCH = 45
WHY = "Migrated from the repo's media snapshot into the media store (D47)."


@dataclass
class Plan:
    # Every key the migrated media names, to be in the media store.
    keys: list[str] = field(default_factory=list)
    # (collection, key) -> the entry's media fields as they should be
    entries: dict[tuple[str, str], dict] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _append(existing: list[dict] | None, migrated: list[dict]) -> list[dict]:
    """What the entry holds, then each migrated file it does not, by media id."""
    result = list(existing or [])
    held = {m["id"] for m in result}
    for media in migrated:
        if media["id"] not in held:
            result.append(media)
            held.add(media["id"])
    return result


def _keys(media: dict) -> list[str]:
    keys = []
    for photo in media.get(PHOTOS_KEY) or []:
        keys += [photo["small"], photo["large"]]
    manuals = media.get(MANUALS_KEY) or []
    for manual in manuals if isinstance(manuals, list) else [m for ms in manuals.values() for m in ms]:
        keys.append(manual["file"])
    if media.get(LOGO_KEY):
        keys.append(media[LOGO_KEY])
    return keys


def plan_migration(seeds: list[Document], stored: list[Document]) -> Plan:
    plan = Plan()
    index = {(d.collection, d.key): d for d in stored if d.key != ENVELOPE_KEY and not d.retired}
    for seed in seeds:
        if seed.key == ENVELOPE_KEY or not isinstance(seed.data, dict):
            continue
        if seed.collection not in GEAR and seed.collection != BRANDS:
            continue
        source = {k: seed.data[k] for k in (PHOTOS_KEY, MANUALS_KEY, LOGO_KEY) if seed.data.get(k)}
        if not source:
            continue
        document = index.get((seed.collection, seed.key))
        if document is None or (seed.collection in GEAR and not is_listed(document.data)):
            plan.warnings.append(f"{seed.collection} {seed.key}: not a listed entry in the store — skipped")
            continue
        wanted: dict = {}
        if PHOTOS_KEY in source:
            wanted[PHOTOS_KEY] = _append(document.data.get(PHOTOS_KEY), source[PHOTOS_KEY])
        if MANUALS_KEY in source:
            if seed.collection == BRANDS:
                by_type = dict(document.data.get(MANUALS_KEY) or {})
                for collection, listed in source[MANUALS_KEY].items():
                    by_type[collection] = _append(by_type.get(collection), listed)
                wanted[MANUALS_KEY] = dict(sorted(by_type.items()))
            else:
                wanted[MANUALS_KEY] = _append(document.data.get(MANUALS_KEY), source[MANUALS_KEY])
        if LOGO_KEY in source and not document.data.get(LOGO_KEY):  # one set on the site stands
            wanted[LOGO_KEY] = source[LOGO_KEY]
        plan.keys += _keys(source)
        if any(document.data.get(name) != value for name, value in wanted.items()):
            plan.entries[(seed.collection, seed.key)] = wanted
    plan.keys = sorted(set(plan.keys))
    return plan


# --- Doing it -----------------------------------------------------------------------


def not_held(media: MediaStore, keys: list[str]) -> list[str]:
    held = media.held_keys()
    return [k for k in keys if k not in held]


def write_files(media: MediaStore, keys: list[str], snapshot: Path = SNAPSHOT_DIR, log=print) -> int:
    """Copy each key the store does not hold yet from the snapshot."""
    missing = not_held(media, keys)
    for count, key in enumerate(missing, 1):
        data = (snapshot / key).read_bytes()
        kind = kinds.sniff(data)
        if kind is None:  # an SVG logo, ours (hazard 3)
            media.put_as(key, data, "image/svg+xml")
        else:
            # "<media id>-user-manual.pdf" is saved as "user-manual.pdf".
            name = key.rsplit("/", 1)[-1].split("-", 1)[-1] if kind is kinds.PDF else None
            media.put(key, data, kind, name)
        if count % 200 == 0:
            log(f"  … {count}/{len(missing)} files")
    return len(missing)


def apply_to_store(store, changelog, actor, documents: list[Document], plan: Plan) -> int:
    """The entries, through the same commit as every edit, logged as `import`."""
    from slack_data.catalogue.edits import _diff, _record
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change
    from slack_data.models.changes import Action, Channel, TargetType, item_target

    index = {(d.collection, d.key): d for d in documents}
    pending = sorted(plan.entries.items())
    for start in range(0, len(pending), BATCH):
        puts, records = [], []
        for (collection, key), media in pending[start : start + BATCH]:
            document = index[(collection, key)]
            data = {**document.data, **media}
            if collection == BRANDS:
                target = (TargetType.BRAND, str(document.data["catalog_id"]), Action.BRAND_EDIT)
            else:
                target = (TargetType.ITEM, item_target(collection, key), Action.ITEM_EDIT)
            puts.append(Put(document.model_copy(update={"data": data, "rev": document.rev + 1}), document.rev))
            records.append(
                _record(actor, target[0], target[1], target[2], channel=Channel.IMPORT,
                        changes=_diff(document.data, data), why=WHY)
            )
        commit_catalogue_change(store, changelog, puts, [], records)
    return len(pending)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--apply", action="store_true", help="write (default: report only)")
    parser.add_argument("--check", action="store_true", help="exit 1 if anything is still to migrate")
    parser.add_argument("--as", dest="actor", help="the ISA id of the admin the import is recorded as")
    parser.add_argument("--media-bucket", help="the media bucket (hosted); else MEDIA_DIR")
    args = parser.parse_args(argv)

    from slack_data.catalogue.importer import documents_from_files
    from slack_data.catalogue.store import build_repository

    store = build_repository()
    documents = store.load()
    if args.media_bucket:
        from slack_data.media.s3 import S3MediaStore

        media: MediaStore = S3MediaStore(args.media_bucket, uploads_bucket="")
    else:
        media = FilesystemMediaStore(Path(os.getenv("MEDIA_DIR") or "media-local"), snapshot=None)

    plan = plan_migration(documents_from_files(), documents)
    for warning in plan.warnings:
        print(f"⚠ {warning}")
    missing = not_held(media, plan.keys)
    print(f"{len(plan.keys)} files named, {len(missing)} not in the media store yet; "
          f"{len(plan.entries)} entries to update")

    if args.check:
        return 1 if (missing or plan.entries) else 0
    if not args.apply:
        print("dry run — nothing written. Re-run with --apply.")
        return 0

    from slack_data.models.people import Role
    from slack_data.people.store import get_people_repository

    actor = get_people_repository().find_by_isa_id(args.actor or "")
    if actor is None or not actor.has(Role.ADMIN):
        print("✗ --as must name an admin's ISA id: the import is recorded as theirs")
        return 1

    print(f"✓ {write_files(media, plan.keys)} files written")
    from slack_data.changelog.store import get_changelog_repository

    count = apply_to_store(store, get_changelog_repository(), actor, documents, plan)
    print(f"✓ {count} entries updated, each logged as an import; version {store.version()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
