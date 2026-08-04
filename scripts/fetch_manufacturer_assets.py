#!/usr/bin/env python3
"""Fetch manufacturer logos + country flags, and derive the manufacturer manifest.

Two asset sets, two sources:

* **Manufacturer logos** — from SlackDB (`/user_content/img/manufacturers/<file>`),
  the same origin our gear imagery came from. The filename comes from the
  `imageFilename` field on `GET /api/manufacturers`.
* **Country flags** — from **flagcdn.com** (Flagpedia's CDN; public-domain flag
  artwork). Deliberately NOT SlackDB's `/img/flags/`: flags are generic assets and
  are better taken from a dedicated, reputable source. Vendored locally so the app
  has no runtime dependency on a third-party CDN.

Like scripts/build_gear_manifest.py, this script is **non-destructive by default**:
it only ever adds files it is missing and rewrites the manifest. It never deletes
or overwrites an existing image, so hand-curated logos survive a re-run.
(build_gear_images.py destroyed the curated gear tree twice by doing the opposite
— see that script's docstring.)

**The one exception is the `new_img` override column** in manufacturer_review.csv.
A URL there is an explicit human instruction to replace a bad logo with a better
one, so it is fetched even when a file already exists, and any same-brand file
with a different extension is removed — the manifest keys on the brand slug and
picks the first extension it finds, so leaving both would make which logo wins
depend on extension order rather than on intent.

Run from the repo root:
    python3 scripts/fetch_manufacturer_assets.py            # fetch + write manifest
    python3 scripts/fetch_manufacturer_assets.py --manifest-only
    python3 scripts/fetch_manufacturer_assets.py --check    # verify, exit 1 on drift
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from slack_data.utilities.brand_aliases import canonical_brand  # noqa: E402

LOGO_DIR = ROOT / "frontend" / "public" / "manufacturer-images"
FLAG_DIR = ROOT / "frontend" / "public" / "flags"
MANIFEST = ROOT / "frontend" / "src" / "data" / "manufacturerImages.json"
MFR_JSON = ROOT / "manufacturers.json"
REVIEW_CSV = ROOT / "manufacturer_review.csv"

# Extension preference order — the manifest takes the first that exists on disk.
IMG_EXTS = (".svg", ".png", ".webp", ".jpg", ".jpeg")
CONTENT_TYPE_EXT = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
}

SDB_API = "https://slackdb.com/api/manufacturers"
SDB_LOGO = "https://slackdb.com/user_content/img/manufacturers/{filename}"
# w160 keeps the flag crisp on retina at the ~24px we render it.
FLAG_URL = "https://flagcdn.com/w160/{code}.png"
UA = {"User-Agent": "Mozilla/5.0 (SlackData asset fetcher)"}


def slugify(name: str) -> str:
    """Hyphen slug — MUST match frontend/src/utils/slugify.ts."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return name.strip("-")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def load_slackdb() -> list[dict]:
    """SlackDB's manufacturer list — cached on first fetch.

    Cached OUTSIDE public/: anything under public/ is served verbatim by Vite, so
    a scratch file there would ship to production.
    """
    cache = ROOT / "scripts" / ".cache" / "slackdb_manufacturers.json"
    if cache.exists():
        return json.loads(cache.read_text())
    data = json.loads(fetch(SDB_API))
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, indent=2))
    return data


def country_codes() -> set[str]:
    """Every ISO alpha-2 code present in manufacturers.json (lowercased)."""
    mfrs = json.loads(MFR_JSON.read_text())["manufacturers"]
    return {v["country"].lower() for v in mfrs.values() if v.get("country")}


def download_logos(entries: list[dict], overrides: dict[str, str] | None = None) -> dict[str, str]:
    """canonical brand name -> stored filename. Skips brands SlackDB has no image for."""
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    overrides = overrides or {}
    manifest: dict[str, str] = {}

    for entry in entries:
        raw_name = entry.get("name") or entry.get("slug") or ""
        filename = entry.get("imageFilename")
        if not raw_name or not filename:
            continue

        brand = canonical_brand(raw_name)
        # An override will replace this immediately — don't fetch it just to
        # delete it on every run.
        if brand in overrides:
            continue
        ext = Path(filename).suffix.lower() or ".jpg"
        # Store under OUR canonical brand slug, not SlackDB's filename, so the
        # frontend lookup is a pure function of the brand name.
        stored = f"{slugify(brand)}{ext}"
        dest = LOGO_DIR / stored

        if not dest.exists():
            try:
                dest.write_bytes(fetch(SDB_LOGO.format(filename=filename)))
                print(f"  logo  + {stored}")
            except (urllib.error.HTTPError, urllib.error.URLError) as exc:
                print(f"  logo  ! {raw_name}: {exc}")
                continue
        manifest[brand] = stored

    return manifest


def download_flags(codes: set[str]) -> None:
    FLAG_DIR.mkdir(parents=True, exist_ok=True)
    for code in sorted(codes):
        dest = FLAG_DIR / f"{code}.png"
        if dest.exists():
            continue
        try:
            dest.write_bytes(fetch(FLAG_URL.format(code=code)))
            print(f"  flag  + {code}.png")
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            print(f"  flag  ! {code}: {exc}")


def read_overrides() -> dict[str, str]:
    """canonical brand -> replacement logo URL, from manufacturer_review.csv's new_img."""
    if not REVIEW_CSV.exists():
        return {}
    overrides: dict[str, str] = {}
    with open(REVIEW_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            url = (row.get("new_img") or "").strip()
            brand = (row.get("brand") or "").strip()
            if url and brand:
                overrides[canonical_brand(brand)] = url
    return overrides


def apply_overrides(overrides: dict[str, str]) -> None:
    """Replace logos named in the review CSV. Destructive by design — see module docstring."""
    for brand, url in overrides.items():
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                # The extension must come from Content-Type, not the URL: some of
                # these are extensionless API endpoints (camp.it/api/GetFile/...).
                ext = CONTENT_TYPE_EXT.get(resp.headers.get("Content-Type", "").split(";")[0].strip())
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            print(f"  logo  ! override {brand}: {exc}")
            continue

        if not ext:
            print(f"  logo  ! override {brand}: unsupported content-type")
            continue

        stem = slugify(brand)
        # Drop superseded files in other extensions so exactly one logo per brand
        # survives; otherwise the manifest's extension order, not this override,
        # would decide which image is used.
        for other in IMG_EXTS:
            stale = LOGO_DIR / f"{stem}{other}"
            if other != ext and stale.exists():
                stale.unlink()
                print(f"  logo  - {stale.name} (superseded)")

        (LOGO_DIR / f"{stem}{ext}").write_bytes(payload)
        print(f"  logo  ~ {stem}{ext} (override, {len(payload) // 1024}KB)")


def known_brands(entries: list[dict]) -> set[str]:
    """Every canonical brand name we know about, from BOTH brand sources.

    manufacturers.json is authoritative (it is what the loader reads and what the
    review CSV is keyed on) but SlackDB's list is where imageFilename comes from,
    and the two do not agree: manufacturers.json carries entries SlackDB lacks
    ("Rigging Ventures", "Space Age Slacklines", the renamed lineGrip), while
    SlackDB still lists the retired "Slack Pro!". Building the manifest from only
    one of them silently orphans logos for brands in the other.
    """
    brands = {canonical_brand(e["name"]) for e in entries if e.get("name")}
    raw = json.loads(MFR_JSON.read_text(encoding="utf-8"))
    brands |= {
        canonical_brand(e["name"]) for e in raw.get("manufacturers", {}).values() if e.get("name")
    }
    return brands


def build_manifest_from_disk(entries: list[dict]) -> dict[str, str]:
    """Manifest derived from what is actually on disk — disk is the source of truth."""
    manifest: dict[str, str] = {}
    for brand in known_brands(entries):
        for ext in IMG_EXTS:
            if (LOGO_DIR / f"{slugify(brand)}{ext}").exists():
                manifest[brand] = f"{slugify(brand)}{ext}"
                break
    return manifest


def main() -> int:
    args = set(sys.argv[1:])
    entries = load_slackdb()

    if not (args & {"--manifest-only", "--check"}):
        overrides = read_overrides()
        print(f"Manufacturer logos -> {LOGO_DIR.relative_to(ROOT)}")
        download_logos(entries, overrides)
        print(f"Country flags -> {FLAG_DIR.relative_to(ROOT)}")
        download_flags(country_codes())
        if overrides:
            print(f"Logo overrides from {REVIEW_CSV.name} ({len(overrides)})")
            apply_overrides(overrides)

    manifest = dict(sorted(build_manifest_from_disk(entries).items()))
    payload = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"

    if "--check" in args:
        current = MANIFEST.read_text() if MANIFEST.exists() else ""
        if current != payload:
            print("DRIFT: manufacturerImages.json is stale — re-run without --check")
            return 1
        print(f"OK: {len(manifest)} manufacturer logos in manifest")
        return 0

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(payload)
    missing = sorted(b for b in known_brands(entries) if b not in manifest)
    print(f"\nWrote {MANIFEST.relative_to(ROOT)} — {len(manifest)} logos")
    if missing:
        print(f"No logo for {len(missing)}: {', '.join(missing)}")

    # Files on disk that no brand resolves to. Almost always the leftover of a
    # brand RENAME: the new canonical slug gets fetched fresh and the old file is
    # stranded (this script never deletes, so it can't clean up after itself).
    # Reported, never removed — deciding a file is dead is a human call.
    on_disk = {p.name for p in LOGO_DIR.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS}
    orphans = sorted(on_disk - set(manifest.values()))
    if orphans:
        print(f"\nORPHANS — {len(orphans)} file(s) match no brand (likely a rename):")
        for name in orphans:
            print(f"  {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
