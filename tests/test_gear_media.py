"""
Gear photos and manuals are filed by id (scripts/build_gear_manifest.py).

`frontend/public/gear-images/<type>/<id>_<slug>/` and its `gear-manuals`
twin hold each item's files; the frontend finds them by the item's id, so a
rename in the catalogue store keeps them (LIVE_EDITING_PHASE_2.md). What can
still go wrong is invisible on the page — a folder or file the manifest cannot
place, or a committed manifest older than the tree — so it is checked here.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_gear_manifest

from slack_data.utilities.brand_aliases import canonical_brand


def test_the_committed_manifests_are_current():
    result = subprocess.run(
        [sys.executable, "scripts/build_gear_manifest.py", "--check"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_every_media_file_is_placed():
    """A warning from the builder is a file that will never render."""
    _, image_warnings = build_gear_manifest.build()
    _, manual_warnings = build_gear_manifest.build_manuals()
    _, brand_warnings = build_gear_manifest.build_brand_manuals()
    assert image_warnings + manual_warnings + brand_warnings == []


def test_every_brand_the_seeds_name_has_an_id():
    """Range-wide manuals are found through brandIds.json by the brand name the
    API serves — the maker's, and each seller's."""
    ids = json.loads(build_gear_manifest.BRAND_IDS.read_text())
    for ftype, (seed, brand_field) in build_gear_manifest.SEED.items():
        for item in json.loads((ROOT / seed).read_text()):
            for name in [item.get(brand_field), *(item.get("gear_sellers") or [])]:
                if name:
                    assert canonical_brand(name) in ids, f"{ftype} {item['id']}: {name!r}"
