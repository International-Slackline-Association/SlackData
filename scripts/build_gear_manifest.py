#!/usr/bin/env python3
"""Derive the frontend asset manifests from whatever is in public/.

    public/gear-images/<type>/<id>_<slug>/          -> frontend/src/data/gearImages.json
    public/gear-manuals/<type>/<id>_<slug>/         -> frontend/src/data/gearManuals.json
    public/gear-manuals/<type>/brand/<cid>_<slug>/  -> frontend/src/data/brandManuals.json
    manufacturers.json                              -> frontend/src/data/brandIds.json

Both trees are the source of truth for their assets — they hold curated files
that no scraper output reproduces. This script only *reads* them: it never
creates, moves, or deletes an asset. The manifests are the only files written.

**Media is filed by id, one folder per item.** A folder is named
`<id>_<name-slug>`: the gear item's seed id, then a slug of its name when the
folder was made. Only the id is read; the slug is a label for people browsing
the tree, and it goes stale — harmlessly — when the item is renamed. Live
editing renames items in the catalogue store, and photos found by name would
silently disappear (LIVE_EDITING_PHASE_2.md); found by id, they cannot.

- **Images** are numbered inside the folder: `1.jpg` is the primary, `2.jpg`
  the second. To reorder, renumber the files.
- **Manuals** are titled by their filename: `user-manual.pdf` reads "User
  manual", `product-archive.pdf` "Product archive" (frontend/src/utils/manuals.ts).
  They are listed in filename order, and the product page embeds the first.
- **Range-wide manuals** — a manufacturer's document for a whole product class,
  Balance Community's webbing manual covering every webbing they make — sit in
  `<type>/brand/<catalog_id>_<brand-slug>/`, keyed by the brand's `catalog_id`
  from manufacturers.json. They are a different claim ("about the whole range",
  not "about this item"), so they have their own manifest.

`brandIds.json` maps each brand name, as the API spells it, to its catalog_id,
so the frontend can find a range-wide manual for a maker or a seller (items
carry brand names, not brand ids).

(It replaces scripts/build_gear_images.py, which wiped and rebuilt public/ from
scraper output on every run. That destroyed the curated tree twice; renames and
manually-added images lived only in public/, so a rebuild silently reverted them.)

Run from the repo root:
    python3 scripts/build_gear_manifest.py           # write the manifests
    python3 scripts/build_gear_manifest.py --check   # verify only, exit 1 on drift
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "frontend" / "public" / "gear-images"
MANIFEST = ROOT / "frontend" / "src" / "data" / "gearImages.json"
MANUALS_PUB = ROOT / "frontend" / "public" / "gear-manuals"
MANUALS_MANIFEST = ROOT / "frontend" / "src" / "data" / "gearManuals.json"
BRAND_MANUALS_MANIFEST = ROOT / "frontend" / "src" / "data" / "brandManuals.json"
BRAND_IDS = ROOT / "frontend" / "src" / "data" / "brandIds.json"
BRAND_DIR = "brand"  # the subfolder inside each gear type holding range-wide docs
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
DOC_EXTS = {".pdf"}

# frontend gear-type -> (root seed JSON, brand field in that JSON). Used to warn
# about folders whose id names no product; never to decide what to keep.
SEED = {
    "webbings": ("webbings.json", "brand"),
    "weblocks": ("weblocks.json", "brand"),
    "grips": ("grips.json", "brand"),
    "leashrings": ("leashrings.json", "brand"),
    "treepros": ("treepros.json", "brand"),
    "starterkits": ("starterkits.json", "brand"),
    "tricklinekits": ("tricklinekits.json", "brand"),
    "rollers": ("rollers.json", "brand"),
    "connectors": ("connectors.json", "brand"),
}

# `<id>_<slug>`: the id is everything before the first underscore.
FOLDER = re.compile(r"^(\d+)_[a-z0-9-]+$")


def slugify(name: str) -> str:
    """Hyphen slug — MUST match frontend/src/utils/slugify.ts."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return name.strip("-")


def folder_name(item_id: int, name: str) -> str:
    """The folder a new item's media goes in: `<id>_<name-slug>`."""
    return f"{item_id}_{slugify(name)}"


def seed_items(ftype: str) -> dict[int, dict]:
    """id -> seed item, for a gear type ({} for an unknown type or a missing seed)."""
    seed = SEED.get(ftype)
    if seed is None or not (ROOT / seed[0]).exists():
        return {}
    return {item["id"]: item for item in json.loads((ROOT / seed[0]).read_text()) if "id" in item}


def catalog_ids() -> dict[int, str]:
    """catalog_id -> brand name, from manufacturers.json."""
    makers = json.loads((ROOT / "manufacturers.json").read_text())["manufacturers"].values()
    return {int(m["catalog_id"]): m["name"] for m in makers if m.get("catalog_id") is not None}


def item_folders(type_dir: Path, known: set[int], warnings: list[str], what: str) -> dict[int, Path]:
    """id -> folder for every `<id>_<slug>` folder in a type directory."""
    folders: dict[int, Path] = {}
    for path in sorted(type_dir.iterdir()):
        if path.name == BRAND_DIR:
            continue
        rel = f"{type_dir.name}/{path.name}"
        if path.is_file():
            warnings.append(f"{rel} is not in an item folder — will never render")
            continue
        match = FOLDER.match(path.name)
        if not match:
            warnings.append(f"{rel}/ is not named <id>_<slug> — will never render")
            continue
        item_id = int(match.group(1))
        if item_id in folders:
            raise SystemExit(f"✗ two {what} folders for {type_dir.name} id {item_id}: "
                             f"{folders[item_id].name}, {path.name}")
        if known and item_id not in known:
            warnings.append(f"{rel}/ — {type_dir.name} id {item_id} is no product — will never render")
        folders[item_id] = path
    return folders


def _by_id(manifest: dict[str, dict[int, list[str]]]) -> dict:
    """Sorted, with string keys, as the JSON is written."""
    return {
        t: {str(i): manifest[t][i] for i in sorted(manifest[t])}
        for t in sorted(manifest) if manifest[t]
    }


def build() -> tuple[dict, list[str]]:
    """gear type -> {id: ["<folder>/1.jpg", "<folder>/2.jpg", ...]}."""
    manifest: dict[str, dict[int, list[str]]] = {}
    warnings: list[str] = []
    for type_dir in sorted(p for p in PUB.iterdir() if p.is_dir()):
        ftype = type_dir.name
        manifest[ftype] = {}
        for item_id, folder in item_folders(type_dir, set(seed_items(ftype)), warnings, "image").items():
            numbered = []
            for path in folder.iterdir():
                if path.suffix.lower() not in IMG_EXTS:
                    continue
                if not path.stem.isdigit():
                    warnings.append(f"{ftype}/{folder.name}/{path.name} is not numbered (1.jpg, 2.jpg …) — skipped")
                    continue
                numbered.append((int(path.stem), f"{folder.name}/{path.name}"))
            if numbered:
                manifest[ftype][item_id] = [name for _, name in sorted(numbered)]
    return _by_id(manifest), warnings


def _documents(folder: Path) -> list[str]:
    """A folder's PDFs in filename order — the order the page lists them in."""
    return [f"{folder.name}/{p.name}" for p in sorted(folder.iterdir()) if p.suffix.lower() in DOC_EXTS]


def build_manuals() -> tuple[dict, list[str]]:
    """gear type -> {id: ["<folder>/user-manual.pdf", ...]}."""
    manifest: dict[str, dict[int, list[str]]] = {}
    warnings: list[str] = []
    if not MANUALS_PUB.exists():
        return {}, warnings
    for type_dir in sorted(p for p in MANUALS_PUB.iterdir() if p.is_dir()):
        ftype = type_dir.name
        manifest[ftype] = {}
        for item_id, folder in item_folders(type_dir, set(seed_items(ftype)), warnings, "manual").items():
            if docs := _documents(folder):
                manifest[ftype][item_id] = docs
    return _by_id(manifest), warnings


def build_brand_manuals() -> tuple[dict, list[str]]:
    """gear type -> {catalog_id: ["<folder>/webbing-manual.pdf", ...]}.

    Spider Slacklines and Slack Inov file the same PDF twice, once in each
    brand's folder; one folder per brand keeps that a statement about each.
    """
    known = set(catalog_ids())
    manifest: dict[str, dict[int, list[str]]] = {}
    warnings: list[str] = []
    if not MANUALS_PUB.exists():
        return {}, warnings
    for type_dir in sorted(p for p in MANUALS_PUB.iterdir() if p.is_dir()):
        brand_dir = type_dir / BRAND_DIR
        if not brand_dir.is_dir():
            continue
        manifest[type_dir.name] = {}
        folders = item_folders(brand_dir, known, warnings, "brand manual")
        for catalog_id, folder in folders.items():
            if docs := _documents(folder):
                manifest[type_dir.name][catalog_id] = docs
    return _by_id(manifest), warnings


def build_brand_ids() -> dict[str, int]:
    """Brand name, as the API spells it (canonical), -> catalog_id."""
    sys.path.insert(0, str(ROOT))
    from slack_data.utilities.brand_aliases import canonical_brand

    ids = {canonical_brand(name): cid for cid, name in catalog_ids().items()}
    return dict(sorted(ids.items()))


def write(path: Path, manifest: dict, check: bool, summary: str) -> int:
    """Write (or --check) one manifest; returns the exit code."""
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    if check:
        current = path.read_text() if path.exists() else ""
        if current != text:
            print(f"✗ {path.name} is out of date — run: python3 scripts/build_gear_manifest.py")
            return 1
        print(f"✓ {path.name} up to date ({summary})")
        return 0
    path.write_text(text)
    print(f"✓ {summary} -> {path.relative_to(ROOT)}")
    return 0


def _counts(manifest: dict, unit: str, what: str) -> str:
    owners = sum(len(e) for e in manifest.values())
    files = sum(len(f) for e in manifest.values() for f in e.values())
    return f"{owners} {unit}, {files} {what}"


def main() -> int:
    check = "--check" in sys.argv
    images, warnings = build()
    manuals, manual_warnings = build_manuals()
    brand_manuals, brand_warnings = build_brand_manuals()
    brand_ids = build_brand_ids()

    codes = [
        write(MANIFEST, images, check, _counts(images, "products", "images")),
        write(MANUALS_MANIFEST, manuals, check, _counts(manuals, "products", "documents")),
        write(BRAND_MANUALS_MANIFEST, brand_manuals, check,
              _counts(brand_manuals, "brands", "range-wide documents")),
        write(BRAND_IDS, brand_ids, check, f"{len(brand_ids)} brand names"),
    ]

    for w in warnings + manual_warnings + brand_warnings:
        print(f"⚠ {w}")
    return next((c for c in codes if c), 0)


if __name__ == "__main__":
    sys.exit(main())
