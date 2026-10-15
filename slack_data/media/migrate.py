"""
Today's photos, manuals and logos → the media store, once (D47, P4-E, P4-F, P4-J).

    # what would change (writes nothing)
    python -m slack_data.media.migrate --target store
    # write the files to the media store, the entries to the catalogue store,
    # one `import` record per item and brand
    python -m slack_data.media.migrate --target store --as <ISA id> --apply [--media-bucket NAME]
    # the repo's dev snapshot: files into media/, entries into the root seeds
    python -m slack_data.media.migrate --target seeds --apply
    # exit 1 if anything is still to migrate
    python -m slack_data.media.migrate --target store --check

Read from the curated trees under `frontend/public/`, filed by id:

| source | becomes |
|---|---|
| `gear-images/<type>/<id>_<slug>/<n>.<ext>` | the item's `photos`, in number order, each re-encoded to 480 px and 1600 px WebP (P4-D, P4-E): metadata stripped, never upscaled |
| `gear-manuals/<type>/<id>_<slug>/<name>.pdf` | the item's `manuals`, in filename order, titled from the filename (`user-manual.pdf` → "User manual") |
| `gear-manuals/<type>/brand/<catalog_id>_<slug>/<name>.pdf` | the brand's range-wide `manuals` for that type |
| `manufacturer-images/<file>` (via `manufacturerImages.json`) | the brand's `logo`, copied as it is (two are our own SVGs, hazard 3) |

**Deterministic.** A file's media id is the start of its source's SHA-256, so
the prod run and the seeds run name every file the same — the dev snapshot
mirrors the bucket key for key — and a second run finds everything done.
Existing media on an entry is kept; migrated media is appended to it.

**Store target.** Files go to the media bucket (`--media-bucket`, run with the
operator's SSO profile) or `MEDIA_DIR`; entries go to the catalogue store
(`CATALOG_TABLE` / `CATALOG_STORE_PATH`) through the same commit as every edit,
in transactions of `BATCH` entries, each with its log record on channel
`import`, attributed to the admin named by `--as`.

Needs Pillow (`pip install '-e.[media]'`), an operator-only dependency.
"""

import argparse
import hashlib
import io
import json
import re
import sys
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.load_data.load_gear import GEAR, MANUALS_KEY, PHOTOS_KEY, is_listed
from slack_data.media import kinds
from slack_data.media.edits import LOGO_KEY
from slack_data.media.store import (
    SNAPSHOT_DIR,
    FilesystemMediaStore,
    MediaStore,
    brand_manual_key,
    logo_key,
    manual_key,
    photo_key,
    slug,
)
from slack_data.utilities.brand_aliases import canonical_brand

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend" / "public"
GEAR_IMAGES = PUBLIC / "gear-images"
GEAR_MANUALS = PUBLIC / "gear-manuals"
LOGOS = PUBLIC / "manufacturer-images"
LOGO_MANIFEST = ROOT / "frontend" / "src" / "data" / "manufacturerImages.json"

BRANDS = "manufacturers"
BRAND_DIR = "brand"
FOLDER = re.compile(r"^(\d+)_[a-z0-9-]+$")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
WEBP_QUALITY = 80
# Entries per transaction: each is a put and a log record, and DynamoDB takes
# 100 items in one, two of them the edit count and the version.
BATCH = 45
WHY = "Migrated from the repo's frontend/public/ into the media store (D47)."


def media_id(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def title_of(path: Path) -> str:
    """`user-manual.pdf` -> "User manual", as the build-time manifest titled it."""
    words = re.sub(r"-+", " ", path.stem).strip()
    return words[:1].upper() + words[1:] if words else "Document"


def encode(data: bytes, px: int) -> bytes:
    """`data` as WebP, at most `px` on the long edge, no metadata."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as image:
        image.seek(0)
        image = ImageOps.exif_transpose(image)  # the camera's rotation, applied
        has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((px, px), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        # No exif= / icc_profile=: nothing from the original travels.
        image.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
        return out.getvalue()


# --- The plan -----------------------------------------------------------------------


@dataclass(frozen=True)
class File:
    key: str
    source: Path
    # Re-encode to this many px (a photo), or None: copied as it is.
    px: int | None = None
    download_name: str | None = None


@dataclass
class Plan:
    files: list[File] = field(default_factory=list)
    # (collection, key) -> the entry's media keys as they should be
    entries: dict[tuple[str, str], dict] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _folders(type_dir: Path, plan: Plan) -> dict[int, Path]:
    folders = {}
    if not type_dir.is_dir():
        return folders
    for path in sorted(type_dir.iterdir()):
        if path.name == BRAND_DIR or not path.is_dir():
            continue
        match = FOLDER.match(path.name)
        if match:
            folders[int(match.group(1))] = path
        else:
            plan.warnings.append(f"{path.relative_to(PUBLIC)} is not <id>_<slug> — skipped")
    return folders


def _numbered(folder: Path) -> list[Path]:
    images = [p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS and p.stem.isdigit()]
    return sorted(images, key=lambda p: int(p.stem))


def _pdfs(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() == ".pdf")


def _append(existing: list[dict] | None, migrated: list[dict]) -> list[dict]:
    """What the entry holds, then each migrated file it does not — once, even
    where a folder holds one photo under two numbers."""
    result = list(existing or [])
    held = {m["id"] for m in result}
    for media in migrated:
        if media["id"] not in held:
            result.append(media)
            held.add(media["id"])
    return result


def _manuals(pdfs: list[Path], key_for: Callable[[str, str], str], plan: Plan) -> list[dict]:
    listed = []
    for pdf in pdfs:
        mid, title = media_id(pdf.read_bytes()), title_of(pdf)
        key = key_for(mid, title)
        plan.files.append(File(key, pdf, download_name=f"{slug(title)}.pdf"))
        listed.append({"id": mid, "file": key, "title": title})
    return listed


def plan_migration(documents: list[Document]) -> Plan:
    plan = Plan()
    items = {
        (d.collection, d.key): d
        for d in documents
        if d.collection in GEAR and d.key != ENVELOPE_KEY and not d.retired
    }
    brands = {
        canonical_brand(str(d.data.get("name"))): d
        for d in documents
        if d.collection == BRANDS and d.key != ENVELOPE_KEY and not d.retired
    }
    brand_by_id = {int(d.data["catalog_id"]): d for d in brands.values() if d.data.get("catalog_id") is not None}

    def item(collection: str, item_id: int, what: Path) -> Document | None:
        document = items.get((collection, str(item_id)))
        if document is None or not is_listed(document.data):
            plan.warnings.append(f"{what.relative_to(PUBLIC)}: {collection} {item_id} is no listed item — skipped")
            return None
        return document

    def wanted(document: Document) -> dict:
        return plan.entries.setdefault((document.collection, document.key), {})

    for collection in GEAR:
        for item_id, folder in _folders(GEAR_IMAGES / collection, plan).items():
            document = item(collection, item_id, folder)
            if document is None:
                continue
            photos = []
            for source in _numbered(folder):
                mid = media_id(source.read_bytes())
                small = photo_key(collection, item_id, mid, kinds.SMALL_PX, kinds.WEBP)
                large = photo_key(collection, item_id, mid, kinds.LARGE_PX, kinds.WEBP)
                plan.files += [File(small, source, kinds.SMALL_PX), File(large, source, kinds.LARGE_PX)]
                photos.append({"id": mid, "small": small, "large": large})
            if photos:
                wanted(document)[PHOTOS_KEY] = _append(document.data.get(PHOTOS_KEY), photos)

        for item_id, folder in _folders(GEAR_MANUALS / collection, plan).items():
            document = item(collection, item_id, folder)
            if document is None:
                continue
            listed = _manuals(
                _pdfs(folder), lambda mid, title, c=collection, i=item_id: manual_key(c, i, mid, title), plan
            )
            if listed:
                wanted(document)[MANUALS_KEY] = _append(document.data.get(MANUALS_KEY), listed)

        for catalog_id, folder in _folders(GEAR_MANUALS / collection / BRAND_DIR, plan).items():
            document = brand_by_id.get(catalog_id)
            if document is None:
                plan.warnings.append(f"{folder.relative_to(PUBLIC)}: no brand {catalog_id} — skipped")
                continue
            listed = _manuals(
                _pdfs(folder),
                lambda mid, title, c=collection, b=catalog_id: brand_manual_key(b, c, mid, title),
                plan,
            )
            if listed:
                by_type = wanted(document).setdefault(MANUALS_KEY, dict(document.data.get(MANUALS_KEY) or {}))
                by_type[collection] = _append(by_type.get(collection), listed)

    logos = json.loads(LOGO_MANIFEST.read_text()) if LOGO_MANIFEST.exists() else {}
    for name, filename in sorted(logos.items()):
        document = brands.get(canonical_brand(name))
        source = LOGOS / filename
        if document is None or document.data.get("catalog_id") is None:
            plan.warnings.append(f"manufacturer-images/{filename}: no brand {name!r} — skipped")
            continue
        if not source.is_file():
            plan.warnings.append(f"manufacturer-images/{filename} is in the manifest, not on disk — skipped")
            continue
        data = source.read_bytes()
        kind = kinds.sniff(data)
        extension = "svg" if source.suffix.lower() == ".svg" else (kind.extension if kind else None)
        if extension is None:
            plan.warnings.append(f"manufacturer-images/{filename} is no image we serve — skipped")
            continue
        if document.data.get(LOGO_KEY):
            continue  # set on the site since: theirs stands
        mid, catalog_id = media_id(data), document.data["catalog_id"]
        key = logo_key(catalog_id, mid, kind) if kind else f"brands/{catalog_id}/logo-{mid}.svg"
        plan.files.append(File(key, source))
        wanted(document)[LOGO_KEY] = key

    # Only what differs from the entry as it stands.
    stored = {**items, **{(d.collection, d.key): d for d in brands.values()}}
    plan.entries = {
        k: v for k, v in plan.entries.items() if any(stored[k].data.get(name) != value for name, value in v.items())
    }
    return plan


def _index(documents: list[Document]) -> dict[tuple[str, str], Document]:
    return {(d.collection, d.key): d for d in documents}


# --- Doing it -----------------------------------------------------------------------


def _render(file: File) -> tuple[str, bytes]:
    data = file.source.read_bytes()
    return file.key, (encode(data, file.px) if file.px else data)


def not_held(media: MediaStore, files: list[File]) -> list[File]:
    held = media.held_keys()
    return [f for f in files if f.key not in held]


def write_files(media: MediaStore, files: list[File], log=print) -> int:
    """Every planned file the store does not hold yet; how many were written."""
    missing = not_held(media, files)
    by_key = {f.key: f for f in missing}
    written = 0
    with ProcessPoolExecutor() as pool:
        for key, data in pool.map(_render, missing, chunksize=8):
            file = by_key[key]
            kind = kinds.sniff(data)
            if kind is None:  # an SVG logo, ours
                media.put_as(key, data, "image/svg+xml")
            else:
                media.put(key, data, kind, file.download_name)
            written += 1
            if written % 100 == 0:
                log(f"  … {written}/{len(missing)} files")
    return written


def apply_to_store(store, changelog, actor, documents: list[Document], plan: Plan) -> int:
    """The entries, through the same commit as every edit, logged as `import`."""
    from slack_data.catalogue.edits import _diff, _record
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change
    from slack_data.models.changes import Action, Channel, TargetType, item_target

    index = _index(documents)
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


def apply_to_seeds(documents: list[Document], plan: Plan) -> list[str]:
    """The root seed files with the media keys added — the dev snapshot's data."""
    from slack_data.catalogue.documents import COLLECTIONS, assemble, render

    index = _index(documents)
    changed = {collection for collection, _ in plan.entries}
    for (collection, key), media in plan.entries.items():
        document = index[(collection, key)]
        document.data = {**document.data, **media}
    for collection in sorted(changed):
        path = ROOT / COLLECTIONS[collection].filename
        path.write_text(render(collection, assemble(collection, documents)))
    return sorted(changed)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--target", choices=("store", "seeds"), required=True)
    parser.add_argument("--apply", action="store_true", help="write (default: report only)")
    parser.add_argument("--check", action="store_true", help="exit 1 if anything is still to migrate")
    parser.add_argument("--as", dest="actor", help="the ISA id of the admin the import is recorded as (store)")
    parser.add_argument("--media-bucket", help="the media bucket (store target, hosted); else MEDIA_DIR")
    args = parser.parse_args(argv)

    if args.target == "seeds":
        from slack_data.catalogue.importer import documents_from_files

        documents = documents_from_files()
        media: MediaStore = FilesystemMediaStore(SNAPSHOT_DIR, snapshot=None)
    else:
        import os

        from slack_data.catalogue.store import build_repository

        store = build_repository()
        documents = store.load()
        if args.media_bucket:
            from slack_data.media.s3 import S3MediaStore

            media = S3MediaStore(args.media_bucket, uploads_bucket="")
        else:
            media = FilesystemMediaStore(Path(os.getenv("MEDIA_DIR") or "media-local"), snapshot=None)

    plan = plan_migration(documents)
    for warning in plan.warnings:
        print(f"⚠ {warning}")
    missing = not_held(media, plan.files)
    print(f"{len(plan.files)} files planned, {len(missing)} not in the media store yet; "
          f"{len(plan.entries)} entries to update")

    if args.check:
        return 1 if (missing or plan.entries) else 0
    if not args.apply:
        print("dry run — nothing written. Re-run with --apply.")
        return 0

    actor = None
    if args.target == "store":
        from slack_data.models.people import Role
        from slack_data.people.store import get_people_repository

        actor = get_people_repository().find_by_isa_id(args.actor or "")
        if actor is None or not actor.has(Role.ADMIN):
            print("✗ --as must name an admin's ISA id: the import is recorded as theirs")
            return 1

    print(f"✓ {write_files(media, plan.files)} files written")
    if args.target == "seeds":
        print(f"✓ seeds updated: {', '.join(apply_to_seeds(documents, plan)) or 'none'}")
    else:
        from slack_data.changelog.store import get_changelog_repository

        count = apply_to_store(store, get_changelog_repository(), actor, documents, plan)
        print(f"✓ {count} entries updated, each logged as an import; version {store.version()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
