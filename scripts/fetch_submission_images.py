#!/usr/bin/env python3
"""File a manufacturer's photo links into the gear-image tree.

A brand sends `image_urls` through the manufacturer API: links to photos it
already publishes. The API records them and fetches nothing. This script is the
other half, run by the operator when applying the update. The approved row in
/admin shows the exact invocation:

    python3 scripts/fetch_submission_images.py --gear-type webbings --id 42 \\
      'https://…/aero-1.jpg' [...]

See MANUFACTURER_API_PLAN.md § Step 4 — photos as links.

**Photos are filed by id.** Each item has one folder,
`gear-images/<type>/<id>_<name-slug>/`, holding `1.jpg`, `2.jpg` …, and the
frontend finds them by the item's id (scripts/build_gear_manifest.py). So a
photo lands in the item's existing folder whatever the item is called now, and a
rename in the same record cannot misfile it. Only a NEW folder needs a name for
its slug: the seed's name for that id, or `--name` for an item the seeds do not
hold yet.

Like the other asset scripts, this is **non-destructive**: it only adds files.
Nothing held is overwritten, a download byte-identical to a photo already held
for the product is skipped, and so running it twice on one record is safe.

What it checks, because the links come from outside:

- `http(s)` only, a 30 s timeout, and a 15 MB cap (the figure
  MANUFACTURER_API.md publishes);
- the file really is a photo, decided from its **bytes** (JPEG, PNG, WebP,
  GIF), never from the URL or the Content-Type. A product page sent in place of
  an image link is the likeliest mistake, and it arrives as HTML under a URL
  that can end in anything.

Then it rebuilds `gearImages.json` (unless `--dry-run`) and warns when the id
is no product in the seed, whose photos will not render until it is.

Exit status is 1 if any link failed; the links that worked are still filed.

Run from the repo root:
    python3 scripts/fetch_submission_images.py --gear-type T --id N URL [URL ...]
    python3 scripts/fetch_submission_images.py ... --name 'New product'   # a new item's folder
    python3 scripts/fetch_submission_images.py ... --dry-run              # fetch and name, write nothing
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_gear_manifest
from build_gear_manifest import FOLDER, IMG_EXTS, SEED, folder_name

PUB = build_gear_manifest.PUB
MAX_BYTES = 15 * 1024 * 1024
TIMEOUT_SECONDS = 30
UA = {"User-Agent": "Mozilla/5.0 (SlackData image filer)"}


class FetchError(Exception):
    """A link that could not be turned into a photo. Reported, never fatal."""


@dataclass
class Report:
    written: list[str] = field(default_factory=list)      # "<folder>/<n>.<ext>", in link order
    skipped: list[tuple[str, str]] = field(default_factory=list)  # (url, why)
    failed: list[tuple[str, str]] = field(default_factory=list)   # (url, why)
    warnings: list[str] = field(default_factory=list)


# --- Pure helpers -----------------------------------------------------------


def sniff(data: bytes) -> str | None:
    """The extension these bytes deserve, or None if they are not a photo."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_capped(stream, limit: int = MAX_BYTES) -> bytes:
    """Read at most `limit` bytes, and refuse rather than truncate past it."""
    data = stream.read(limit + 1)
    if len(data) > limit:
        raise FetchError(f"over the {limit:,}-byte limit")
    return data


def is_http(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def item_folder(type_dir: Path, item_id: int) -> Path | None:
    """The item's existing `<id>_<slug>` folder, or None."""
    if not type_dir.is_dir():
        return None
    for path in type_dir.iterdir():
        match = FOLDER.match(path.name)
        if path.is_dir() and match and int(match.group(1)) == item_id:
            return path
    return None


# --- The outside world (replaced in tests) ----------------------------------


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return read_capped(response)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise FetchError(str(error)) from error


def seed_names(gear_type: str) -> dict[int, str]:
    """id -> name, from the gear type's seed."""
    return {i: item["name"] for i, item in build_gear_manifest.seed_items(gear_type).items() if item.get("name")}


def rebuild_manifest() -> None:
    images, _ = build_gear_manifest.build()
    build_gear_manifest.write(build_gear_manifest.MANIFEST, images, False, "images")


# --- The work ---------------------------------------------------------------


def _held(folder: Path | None) -> dict[int, Path]:
    """number -> file, for the photos already in the item's folder."""
    if folder is None:
        return {}
    return {
        int(path.stem): path
        for path in folder.iterdir()
        if path.suffix.lower() in IMG_EXTS and path.stem.isdigit()
    }


def file_images(
    gear_type: str,
    item_id: int,
    urls: list[str],
    *,
    name: str | None = None,
    pub: Path | None = None,
    names: dict[int, str] | None = None,
    dry_run: bool = False,
    fetcher=None,
) -> Report:
    """Download each link and file it in the item's folder. Never overwrites.

    `name` is used only to name a folder that does not exist yet; the seed's
    name for the id is preferred, so a rename never splits an item's photos.
    """
    pub = PUB if pub is None else pub
    names = seed_names(gear_type) if names is None else names
    fetcher = fetch if fetcher is None else fetcher

    report = Report()
    type_dir = pub / gear_type
    folder = item_folder(type_dir, item_id)

    if names and item_id not in names:
        report.warnings.append(
            f"{gear_type} id {item_id} is no product in {SEED[gear_type][0]} — apply the record's"
            " JSON patch (a new product) or these photos will not render"
        )
    if folder is None:
        label = names.get(item_id) or name
        if not label:
            raise SystemExit(
                f"✗ {gear_type} id {item_id} has no folder and no name in the seed — pass --name"
            )
        folder = type_dir / folder_name(item_id, label)

    held = _held(folder if folder.is_dir() else None)
    seen = {digest(path.read_bytes()) for path in held.values()}
    number = max(held, default=0) + 1

    for url in urls:
        if not is_http(url):
            report.failed.append((url, "not an http(s) link"))
            continue
        try:
            data = fetcher(url)
        except FetchError as error:
            report.failed.append((url, str(error)))
            continue

        ext = sniff(data)
        if ext is None:
            report.failed.append((url, "not a JPEG, PNG, WebP or GIF (a page link, not an image?)"))
            continue

        fingerprint = digest(data)
        if fingerprint in seen:
            report.skipped.append((url, "already held, byte for byte"))
            continue

        target = folder / f"{number}{ext}"
        if not dry_run:
            folder.mkdir(parents=True, exist_ok=True)
            # "x" mode: a file appearing under this name between the scan and
            # now is an error, not something to replace.
            with open(target, "xb") as handle:
                handle.write(data)
        report.written.append(f"{folder.name}/{target.name}")
        seen.add(fingerprint)
        number += 1

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--gear-type", required=True, choices=sorted(SEED))
    parser.add_argument("--id", required=True, type=int, help="the item's id (the record's gear_id)")
    parser.add_argument("--name", help="names a NEW folder, for an item the seeds do not hold yet")
    parser.add_argument("--dry-run", action="store_true", help="fetch and name, write nothing")
    parser.add_argument("urls", nargs="+", metavar="URL")
    args = parser.parse_args(argv)

    report = file_images(
        args.gear_type, args.id, args.urls, name=args.name, pub=PUB, dry_run=args.dry_run,
    )

    verb = "would write" if args.dry_run else "+"
    for written in report.written:
        print(f"  {verb} {args.gear_type}/{written}")
    for url, why in report.skipped:
        print(f"  = {url}: {why}")
    for url, why in report.failed:
        print(f"  ! {url}: {why}")
    for warning in report.warnings:
        print(f"⚠ {warning}")

    if report.written and not args.dry_run:
        rebuild_manifest()
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
