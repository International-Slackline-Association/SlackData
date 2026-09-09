#!/usr/bin/env python3
"""Derive the frontend asset manifests from whatever is in public/.

    public/gear-images/               -> frontend/src/data/gearImages.json
    public/gear-manuals/<type>/        -> frontend/src/data/gearManuals.json
    public/gear-manuals/<type>/brand/  -> frontend/src/data/brandManuals.json

Both trees are the source of truth for their assets — it holds curated,
hand-renamed files that no scraper output reproduces. This script only *reads* it:
it never creates, moves, or deletes an asset. The manifests are the only files written.

Manuals are keyed exactly like images ("<brand-abbrev>_<name-slug>"), but their
filenames carry a title rather than an ordering index — `landcruise_aeon.pdf` is
the user manual, `landcruise_aeon-product-archive.pdf` is the product archive.
The title is rendered by frontend/src/utils/manuals.ts; this script only groups
files under the longest product key that matches, so the tail is left intact.

A `brand/` subfolder inside a gear type holds the manuals a manufacturer writes
once for a whole product class — Balance Community's webbing manual covers every
webbing they make. Those are keyed by the brand abbreviation ALONE (`bc.pdf`,
`bc-webbing-manual.pdf`), which can never collide with a product key because a
product key always contains an underscore. They go in their own manifest, since
they are a different claim: "this document is about the whole range", not "this
document is about this item".

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
MANUALS_PUB = ROOT / "frontend" / "public" / "gear-manuals"
MANUALS_MANIFEST = ROOT / "frontend" / "src" / "data" / "gearManuals.json"
BRAND_MANUALS_MANIFEST = ROOT / "frontend" / "src" / "data" / "brandManuals.json"
BRAND_DIR = "brand"  # the subfolder inside each gear type holding range-wide docs
ABBREV = ROOT / "frontend" / "src" / "data" / "brandAbbrev.json"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
DOC_EXTS = {".pdf"}

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


def build_manuals() -> tuple[dict, list[str]]:
    """Group public/gear-manuals/<type>/*.pdf under the product key each starts with.

    Unlike images, a trailing `-something` is a document TITLE, not an index, so
    the tail is never stripped — the key is simply the longest seed key the stem
    equals or starts with. A file matching no product keeps its whole stem as its
    key (and is warned about), so nothing is silently dropped.
    """
    abbrev = json.loads(ABBREV.read_text())
    manifest: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    warnings: list[str] = []

    if not MANUALS_PUB.exists():
        return {}, warnings

    for type_dir in sorted(p for p in MANUALS_PUB.iterdir() if p.is_dir()):
        ftype = type_dir.name
        valid = expected_keys(ftype, abbrev)
        for path in sorted(p for p in type_dir.iterdir() if p.suffix.lower() in DOC_EXTS):
            stem = path.stem
            key = max(
                (k for k in valid if stem == k or stem.startswith(k + "-")),
                key=len,
                default=stem,
            )
            if key == stem and stem not in valid:
                warnings.append(f"{ftype}/{path.name} resolves to no product — will never render")
            manifest[ftype][key].append(path.name)

    return {t: dict(sorted(manifest[t].items())) for t in sorted(manifest)}, warnings


def build_brand_manuals() -> tuple[dict, list[str]]:
    """Group public/gear-manuals/<type>/brand/*.pdf under the brand abbreviation.

    The key is the abbreviation on its own — `bc.pdf`, `bc-webbing-manual.pdf`
    both key under "bc" — and the tail is the document title, exactly as for a
    product manual. Several brand NAMES share one abbreviation ("Balance
    Community", "BalanceCommunity", "Balance Community: Slackline Outfitters"),
    which is the point: the manual is filed once and every spelling finds it.

    A stem matching no abbreviation keeps its whole stem as its key and is
    warned about, so a typo shows up here rather than as a document that
    silently never renders.
    """
    abbrev = json.loads(ABBREV.read_text())
    known = set(abbrev.values())
    manifest: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    warnings: list[str] = []

    if not MANUALS_PUB.exists():
        return {}, warnings

    for type_dir in sorted(p for p in MANUALS_PUB.iterdir() if p.is_dir()):
        brand_dir = type_dir / BRAND_DIR
        if not brand_dir.is_dir():
            continue
        for path in sorted(p for p in brand_dir.iterdir() if p.suffix.lower() in DOC_EXTS):
            stem = path.stem
            key = max(
                (a for a in known if stem == a or stem.startswith(a + "-")),
                key=len,
                default=stem,
            )
            if key == stem and stem not in known:
                warnings.append(
                    f"{type_dir.name}/{BRAND_DIR}/{path.name} matches no brand abbreviation"
                    " in brandAbbrev.json — will never render"
                )
            manifest[type_dir.name][key].append(path.name)

    return {t: dict(sorted(manifest[t].items())) for t in sorted(manifest)}, warnings


def write(path: Path, manifest: dict, check: bool, what: str, unit: str = "products") -> int:
    """Write (or --check) one manifest; returns the exit code."""
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    products = sum(len(e) for e in manifest.values())
    files = sum(len(f) for e in manifest.values() for f in e.values())

    if check:
        current = path.read_text() if path.exists() else ""
        if current != text:
            print(f"✗ {path.name} is out of date — run: python3 scripts/build_gear_manifest.py")
            return 1
        print(f"✓ {path.name} up to date ({products} {unit}, {files} {what})")
        return 0

    path.write_text(text)
    print(f"✓ {products} {unit}, {files} {what} -> {path.relative_to(ROOT)}")
    return 0


def main() -> int:
    check = "--check" in sys.argv
    images, warnings = build()
    manuals, manual_warnings = build_manuals()
    brand_manuals, brand_warnings = build_brand_manuals()

    codes = [
        write(MANIFEST, images, check, "images"),
        write(MANUALS_MANIFEST, manuals, check, "documents"),
        write(BRAND_MANUALS_MANIFEST, brand_manuals, check, "range-wide documents", "brands"),
    ]

    for w in warnings + manual_warnings + brand_warnings:
        print(f"⚠ {w}")
    return next((c for c in codes if c), 0)


if __name__ == "__main__":
    sys.exit(main())
