#!/usr/bin/env python3
"""Derive frontend/src/data/gearImages.json from whatever is in public/gear-images/.

`public/gear-images/` is the source of truth for gear imagery — it holds curated,
hand-renamed files that no scraper output reproduces. This script only *reads* it:
it never creates, moves, or deletes an image. The manifest is the only file written.

(It replaces scripts/build_gear_images.py, which wiped and rebuilt public/ from
scraper output on every run. That destroyed the curated tree twice; renames and
manually-added images lived only in public/, so a rebuild silently reverted them.)

Image ordering per product follows the filename suffix: `<key>.jpg` is image 1,
`<key>-2.jpg` is 2, and so on. To reorder, rename the files.

Run from the repo root:
    python3 scripts/build_gear_manifest.py           # write the manifest
    python3 scripts/build_gear_manifest.py --check   # verify only, exit 1 on drift
"""
from __future__ import annotations
import json, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "frontend" / "public" / "gear-images"
MANIFEST = ROOT / "frontend" / "src" / "data" / "gearImages.json"
ABBREV = ROOT / "frontend" / "src" / "data" / "brandAbbrev.json"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# frontend gear-type -> (root seed JSON, brand field in that JSON). Used only to
# warn about images that resolve to no product; never to decide what to keep.
SEED = {
    "webbings": ("webbings.json", "brand"),
    "weblocks": ("weblocks.json", "brand"),
    "grips": ("grips.json", "manufacturer"),
    "leashrings": ("leashrings.json", "manufacturer"),
    "treepros": ("treepros.json", "manufacturer"),
    "starterkits": ("starterkits.json", "manufacturer"),
    "tricklinekits": ("tricklinekits.json", "manufacturer"),
    "rollers": ("rollers.json", "manufacturer"),
}


def slugify(name: str) -> str:
    """Hyphen slug — MUST match frontend/src/utils/slugify.ts."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return name.strip("-")


def parse(stem: str, valid: set[str]) -> tuple[str, int]:
    """'bc_feather-pro-3' -> ('bc_feather-pro', 3); no suffix means image 1.

    Filenames alone are ambiguous: plenty of products are *named* with a trailing
    number ("Blue 20", "Aero 1", "Seahorse DP 1"), so 'bc_blue-20' is a key in its
    own right, not image 20 of 'bc_blue'. Product keys from the seed JSON break the
    tie — longest match wins, and only a purely numeric remainder counts as an index.
    Unknown stems become their own key so no image is silently dropped.
    """
    if stem in valid:
        return stem, 1
    best: tuple[str, int] | None = None
    for key in valid:
        if stem.startswith(key + "-"):
            rest = stem[len(key) + 1:]
            if rest.isdigit() and (best is None or len(key) > len(best[0])):
                best = (key, int(rest))
    if best:
        return best
    m = re.match(r"^(.*)-(\d+)$", stem)
    return (m.group(1), int(m.group(2))) if m else (stem, 1)


def expected_keys(ftype: str, abbrev: dict[str, str]) -> set[str]:
    seed = SEED.get(ftype)
    if seed is None:
        return set()
    path = ROOT / seed[0]
    if not path.exists():
        return set()
    keys = set()
    for item in json.loads(path.read_text()):
        if not item.get("name"):
            continue
        brand = item.get(seed[1]) or ""
        keys.add(f"{abbrev.get(brand, slugify(brand))}_{slugify(item['name'])}")
    return keys


def build() -> tuple[dict, list[str]]:
    abbrev = json.loads(ABBREV.read_text())
    manifest: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    warnings: list[str] = []

    for type_dir in sorted(p for p in PUB.iterdir() if p.is_dir()):
        ftype = type_dir.name
        files = sorted(p for p in type_dir.iterdir() if p.suffix.lower() in IMG_EXTS)
        valid = expected_keys(ftype, abbrev)
        indexed: dict[str, list[tuple[int, str]]] = defaultdict(list)
        for p in files:
            key, idx = parse(p.stem, valid)
            indexed[key].append((idx, p.name))
        for key, entries in indexed.items():
            manifest[ftype][key] = [name for _, name in sorted(entries)]
            if valid and key not in valid:
                warnings.append(f"{ftype}/{key} resolves to no product — will never render")

    return {t: dict(sorted(manifest[t].items())) for t in sorted(manifest)}, warnings


def main() -> int:
    manifest, warnings = build()
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    products = sum(len(e) for e in manifest.values())
    images = sum(len(f) for e in manifest.values() for f in e.values())

    if "--check" in sys.argv:
        current = MANIFEST.read_text() if MANIFEST.exists() else ""
        if current != text:
            print("✗ manifest is out of date — run: python3 scripts/build_gear_manifest.py")
            return 1
        print(f"✓ manifest up to date ({products} products, {images} images)")
    else:
        MANIFEST.write_text(text)
        print(f"✓ {products} products, {images} images -> {MANIFEST.relative_to(ROOT)}")

    for w in warnings:
        print(f"⚠ {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
