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

Like scripts/build_gear_manifest.py, this script is **non-destructive**: it only
ever adds files it is missing and rewrites the manifest. It never deletes or
overwrites an existing image, so hand-curated or manually-replaced logos survive
a re-run. (build_gear_images.py destroyed the curated gear tree twice by doing
the opposite — see that script's docstring.)

Run from the repo root:
    python3 scripts/fetch_manufacturer_assets.py            # fetch + write manifest
    python3 scripts/fetch_manufacturer_assets.py --manifest-only
    python3 scripts/fetch_manufacturer_assets.py --check    # verify, exit 1 on drift
"""
from __future__ import annotations

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


def download_logos(entries: list[dict]) -> dict[str, str]:
    """canonical brand name -> stored filename. Skips brands SlackDB has no image for."""
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}

    for entry in entries:
        raw_name = entry.get("name") or entry.get("slug") or ""
        filename = entry.get("imageFilename")
        if not raw_name or not filename:
            continue

        brand = canonical_brand(raw_name)
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


def build_manifest_from_disk(entries: list[dict]) -> dict[str, str]:
    """Manifest derived from what is actually on disk — disk is the source of truth."""
    manifest: dict[str, str] = {}
    for entry in entries:
        raw_name = entry.get("name") or entry.get("slug") or ""
        if not raw_name:
            continue
        brand = canonical_brand(raw_name)
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            if (LOGO_DIR / f"{slugify(brand)}{ext}").exists():
                manifest[brand] = f"{slugify(brand)}{ext}"
                break
    return manifest


def main() -> int:
    args = set(sys.argv[1:])
    entries = load_slackdb()

    if not (args & {"--manifest-only", "--check"}):
        print(f"Manufacturer logos -> {LOGO_DIR.relative_to(ROOT)}")
        download_logos(entries)
        print(f"Country flags -> {FLAG_DIR.relative_to(ROOT)}")
        download_flags(country_codes())

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
    missing = [e.get("name") for e in entries if canonical_brand(e.get("name") or "") not in manifest]
    print(f"\nWrote {MANIFEST.relative_to(ROOT)} — {len(manifest)} logos")
    if missing:
        print(f"No logo for {len(missing)}: {', '.join(sorted(filter(None, missing)))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
