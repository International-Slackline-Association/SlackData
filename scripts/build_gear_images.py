#!/usr/bin/env python3
"""Rename scraped gear images into the frontend's public/ tree + build a manifest.

Source layout (scraper output):
    scraper/output/images/<scraper_type>/<brand_slug>__<name_slug>/<numeric>.jpg

Destination layout (Vite public/, served at web root):
    frontend/public/gear-images/<frontend_type>/<brand-abbrev>_<name-slug>[-N].jpg

Manifest (looked up at runtime by utils/images.ts):
    frontend/src/data/gearImages.json
        { "<frontend_type>": { "<brand-abbrev>_<name-slug>": ["file.jpg", ...] } }

Idempotent: wipes and rebuilds the destination each run. Run from repo root:
    python3 scripts/build_gear_images.py
"""
from __future__ import annotations
import json, re, shutil, sys, unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scraper" / "output" / "images"
DEST = ROOT / "frontend" / "public" / "gear-images"
MANIFEST = ROOT / "frontend" / "src" / "data" / "gearImages.json"
ABBREV = ROOT / "frontend" / "src" / "data" / "brandAbbrev.json"

# scraper type dir -> frontend gear-type key. Types not listed are skipped.
TYPE_MAP = {
    "webbings": "webbings",
    "weblocks": "weblocks",
    "grips": "grips",
    "leash_rings": "leashrings",
    "tree_protectors": "treepros",
    "starter_kits": "starterkits",
    "trickline_kits": "tricklinekits",
    "line_sliders": "rollers",   # SlackDB "line sliders" == SlackData "rollers"
    # skipped (no frontend gear type): "rope_brakes", "test"
}
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# frontend gear-type -> (root seed JSON, brand field name in that JSON).
# Used to validate that every manifest key resolves to a real product, matching
# how the frontend builds keys at runtime (utils/images.ts): abbrev + "_" + slug(name).
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


def uslug(s: str) -> str:
    """Underscore slug — mirrors the scraper's brand folder naming."""
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def expected_keys(ftype: str, abbrev: dict[str, str]) -> set[str]:
    """The manifest keys the frontend can actually resolve for a gear type —
    one per product in its seed JSON. Returns empty if the seed file is absent."""
    seed = SEED.get(ftype)
    if seed is None:
        return set()
    path = ROOT / seed[0]
    if not path.exists():
        return set()
    brand_field = seed[1]
    keys: set[str] = set()
    for item in json.loads(path.read_text()):
        name = item.get("name")
        if not name:
            continue
        brand = item.get(brand_field) or ""
        keys.add(f"{abbrev.get(brand, slugify(brand))}_{slugify(name)}")
    return keys


def validate_manifest(
    manifest: dict[str, dict[str, list[str]]], abbrev: dict[str, str]
) -> list[str]:
    """Return 'ftype/key' for every manifest key that resolves to no product —
    i.e. an image the frontend will never display."""
    orphans: list[str] = []
    for ftype, entries in manifest.items():
        valid = expected_keys(ftype, abbrev)
        if not valid:  # no seed to check against — skip rather than flag everything
            continue
        orphans.extend(f"{ftype}/{k}" for k in entries if k not in valid)
    return sorted(orphans)


def main() -> int:
    abbrev = json.loads(ABBREV.read_text())
    brand_slug_to_abbrev = {uslug(raw): code for raw, code in abbrev.items()}

    manifest: dict[str, dict[str, list[str]]] = defaultdict(dict)
    unknown_brands: set[str] = set()
    skipped_types: list[str] = []
    key_collisions: list[str] = []
    copied = 0

    if DEST.exists():
        shutil.rmtree(DEST)

    for type_dir in sorted(SRC.iterdir()):
        if not type_dir.is_dir():
            continue
        ftype = TYPE_MAP.get(type_dir.name)
        if ftype is None:
            skipped_types.append(type_dir.name)
            continue

        for item_dir in sorted(type_dir.iterdir()):
            if not item_dir.is_dir() or "__" not in item_dir.name:
                continue
            brand_slug, name_slug = item_dir.name.split("__", 1)
            abbr = brand_slug_to_abbrev.get(brand_slug)
            if abbr is None:
                unknown_brands.add(brand_slug)
                abbr = brand_slug  # fallback: keep something usable
            key = f"{abbr}_{name_slug.replace('_', '-')}"

            imgs = sorted(p for p in item_dir.iterdir() if p.suffix.lower() in IMG_EXTS)
            if not imgs:
                continue
            if key in manifest[ftype]:
                key_collisions.append(f"{ftype}/{key}")

            out_dir = DEST / ftype
            out_dir.mkdir(parents=True, exist_ok=True)
            files: list[str] = []
            for i, img in enumerate(imgs, start=1):
                suffix = "" if i == 1 else f"-{i}"
                fname = f"{key}{suffix}{img.suffix.lower()}"
                shutil.copy2(img, out_dir / fname)
                files.append(fname)
                copied += 1
            manifest[ftype][key] = files

    ordered = {t: dict(sorted(manifest[t].items())) for t in sorted(manifest)}
    MANIFEST.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n")

    print(f"✓ copied {copied} images across {len(ordered)} gear types -> {DEST.relative_to(ROOT)}")
    for t in sorted(ordered):
        print(f"    {t:14} {len(ordered[t]):3} items")
    print(f"✓ manifest written -> {MANIFEST.relative_to(ROOT)}")
    if skipped_types:
        print(f"⚠ skipped scraper types (no frontend gear type): {', '.join(sorted(skipped_types))}")
    if unknown_brands:
        print(f"⚠ brand folder-slugs not in brandAbbrev.json (used slug as fallback): {', '.join(sorted(unknown_brands))}")
    if key_collisions:
        print(f"⚠ image-key collisions (later item overwrote earlier): {', '.join(key_collisions)}")

    orphans = validate_manifest(ordered, abbrev)
    if orphans:
        print(
            f"\n✗ {len(orphans)} manifest key(s) resolve to no product — these images "
            "will never render.\n  The scraper folder name must match the DB product "
            "name (brand-abbrev + slug(name)):"
        )
        for o in orphans:
            print(f"    {o}")
        if "--allow-orphans" in sys.argv:
            print("  (--allow-orphans set — continuing despite the above)")
        else:
            print("  Fix the scraper folder names, or re-run with --allow-orphans.")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
