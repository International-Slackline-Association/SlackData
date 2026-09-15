#!/usr/bin/env python3
"""File a manufacturer's photo links into the gear-image tree.

A brand sends `image_urls` through the manufacturer API: links to photos it
already publishes. The API records them and fetches nothing. This script is the
other half, run by the operator when applying the update. The approved row in
/admin shows the exact invocation:

    python3 scripts/fetch_submission_images.py --gear-type webbings \\
      --brand 'Balance Community' --name 'Aero 1' 'https://…/aero-1.jpg' [...]

See MANUFACTURER_API_PLAN.md § Step 4 — photos as links.

**Naming is the whole job.** The frontend finds a product's images by the key
`<brand-abbrev>_<name-slug>` (frontend/src/utils/images.ts), and an image under
any other name never renders and never errors. So the key is built with the
manifest builder's own `slugify` and `brandAbbrev.json`, and indices are read
with its own `parse`, which knows that a product *named* "Blue 20" is not
image 20 of "Blue".

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

Then it rebuilds `gearImages.json` (unless `--dry-run`) and warns when the key
matches no product in the seed: a rename or a new product whose JSON patch has
not been applied yet, whose photos will not render until it is.

Exit status is 1 if any link failed; the links that worked are still filed.

Run from the repo root:
    python3 scripts/fetch_submission_images.py --gear-type T --brand B --name N URL [URL ...]
    python3 scripts/fetch_submission_images.py ... --dry-run    # fetch and name, write nothing
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_gear_manifest
from build_gear_manifest import ABBREV, IMG_EXTS, SEED, parse, slugify

PUB = build_gear_manifest.PUB
MAX_BYTES = 15 * 1024 * 1024
TIMEOUT_SECONDS = 30
UA = {"User-Agent": "Mozilla/5.0 (SlackData image filer)"}


class FetchError(Exception):
    """A link that could not be turned into a photo. Reported, never fatal."""


@dataclass
class Report:
    written: list[str] = field(default_factory=list)      # filenames, in link order
    skipped: list[tuple[str, str]] = field(default_factory=list)  # (url, why)
    failed: list[tuple[str, str]] = field(default_factory=list)   # (url, why)
    warnings: list[str] = field(default_factory=list)


# --- Pure helpers -----------------------------------------------------------


def image_key(brand: str, name: str, abbrev: dict[str, str]) -> str:
    """`<brand-abbrev>_<name-slug>` — MUST match `imageKey()` in utils/images.ts."""
    return f"{abbrev.get(brand, slugify(brand))}_{slugify(name)}"


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


# --- The outside world (replaced in tests) ----------------------------------


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return read_capped(response)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise FetchError(str(error)) from error


def load_abbrev() -> dict[str, str]:
    return json.loads(ABBREV.read_text(encoding="utf-8"))


def valid_keys(gear_type: str, abbrev: dict[str, str]) -> set[str]:
    return build_gear_manifest.expected_keys(gear_type, abbrev)


def rebuild_manifest() -> None:
    images, _ = build_gear_manifest.build()
    build_gear_manifest.write(build_gear_manifest.MANIFEST, images, False, "images")


# --- The work ---------------------------------------------------------------


def _held(folder: Path, key: str, valid: set[str]) -> dict[int, Path]:
    """index -> file, for the photos already filed under `key`."""
    known = valid | {key}
    held: dict[int, Path] = {}
    if not folder.is_dir():
        return held
    for path in folder.iterdir():
        if path.suffix.lower() not in IMG_EXTS:
            continue
        file_key, index = parse(path.stem, known)
        if file_key == key:
            held[index] = path
    return held


def _next_stem(key: str, index: int, valid: set[str]) -> tuple[str, int]:
    """The stem for image `index`, skipping any that is another product's key.

    `bc_blue-2` is image 2 of "Blue" unless a product called "Blue 2" exists, in
    which case writing it would hand this photo to that product.
    """
    while True:
        stem = key if index == 1 else f"{key}-{index}"
        if index == 1 or stem not in valid:
            return stem, index
        index += 1


def file_images(
    gear_type: str,
    brand: str,
    name: str,
    urls: list[str],
    *,
    pub: Path | None = None,
    abbrev: dict[str, str] | None = None,
    valid: set[str] | None = None,
    dry_run: bool = False,
    fetcher=None,
) -> Report:
    """Download each link and file it under the product's key. Never overwrites."""
    pub = PUB if pub is None else pub
    abbrev = load_abbrev() if abbrev is None else abbrev
    valid = valid_keys(gear_type, abbrev) if valid is None else valid
    fetcher = fetch if fetcher is None else fetcher

    report = Report()
    key = image_key(brand, name, abbrev)
    folder = pub / gear_type

    if valid and key not in valid:
        report.warnings.append(
            f"{gear_type}/{key} matches no product in {SEED[gear_type][0]} — apply the record's"
            " JSON patch (a rename or a new product) or these photos will not render"
        )

    held = _held(folder, key, valid)
    seen = {digest(path.read_bytes()) for path in held.values()}
    index = max(held, default=0) + 1

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

        stem, index = _next_stem(key, index, valid)
        target = folder / f"{stem}{ext}"
        if not dry_run:
            folder.mkdir(parents=True, exist_ok=True)
            # "x" mode: a file appearing under this name between the scan and
            # now is an error, not something to replace.
            with open(target, "xb") as handle:
                handle.write(data)
        report.written.append(target.name)
        seen.add(fingerprint)
        index += 1

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--gear-type", required=True, choices=sorted(SEED))
    parser.add_argument("--brand", required=True, help="the brand name as the catalogue holds it")
    parser.add_argument("--name", required=True, help="the product name AFTER any rename")
    parser.add_argument("--dry-run", action="store_true", help="fetch and name, write nothing")
    parser.add_argument("urls", nargs="+", metavar="URL")
    args = parser.parse_args(argv)

    report = file_images(
        args.gear_type, args.brand, args.name, args.urls,
        pub=PUB, abbrev=load_abbrev(), dry_run=args.dry_run,
    )

    verb = "would write" if args.dry_run else "+"
    for name in report.written:
        print(f"  {verb} {args.gear_type}/{name}")
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
