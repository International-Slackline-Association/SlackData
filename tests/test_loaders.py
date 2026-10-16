"""
Tests for data loading logic.

These tests do not go through HTTP — they call the loader functions directly.

- **The gear loader** (`load_data/load_gear.py`): one loader for all nine types,
  reading seed entries in the model's own vocabulary. What it must never do is
  lose a value quietly — an unknown field, or a derived one typed by hand, is
  refused — and `to_entry` must be its exact inverse, because the edit path
  writes entries back.
- get_metal_materials(): still the parser behind weblock and roller materials
  in the manufacturer API and the importers.
- get_brand(): upsert with cache (also tested in test_brands.py from the API
  side; here we focus on the pure function behaviour).

The per-type parsing these tests once covered (`materialType` synonyms, weblock
style strings, blank-to-zero cleaning) ran once, in the phase 3 conversion of
the seeds (`scripts/convert_gear_seeds.py`); the seeds now hold its results.
"""

import json

import pytest
from sqlmodel import select

from slack_data.load_data._seed_io import read_seed_json
from slack_data.load_data.load_gear import (
    DERIVED_FIELDS,
    ENVELOPE_KEYS,
    GEAR,
    UnknownField,
    stored_fields,
    to_entry,
    to_row,
)
from slack_data.models.brands import get_brand
from slack_data.utilities.materials import MetalMaterial, get_metal_materials

# ---------------------------------------------------------------------------
# The gear loader
# ---------------------------------------------------------------------------

GRIP = {"id": 7, "name": "Test Grip", "brand": "Gibbon", "material": "Aluminum", "width_min": 25}


def test_an_unknown_field_is_refused_not_dropped():
    with pytest.raises(UnknownField, match="breakingStrength"):
        to_row("grips", GRIP | {"breakingStrength": 40}, brand_id=1)


@pytest.mark.parametrize("field", sorted(DERIVED_FIELDS))
def test_a_derived_isa_field_is_refused(field):
    """The ISA passes set these on every build; a typed value would be a lie
    that the next build silently overwrites."""
    with pytest.raises(UnknownField):
        to_row("grips", GRIP | {field: "x"}, brand_id=1)


def test_unmodelled_values_are_kept_out_of_the_row():
    row = to_row("rollers", {
        "id": 1, "name": "R", "brand": "Gibbon", "material": ["Aluminum"],
        "roller_material": "Aluminum", "lock_type": "Screw Lock",
        "bearing_material": "Steel", "slider_type": "Carabiner",
        "unmodelled": {"wll": 2},
    }, brand_id=1)
    assert row.name == "R"


def test_webbing_stretch_is_a_list_in_the_seed_and_a_string_on_the_row():
    curve = [{"kn": 4, "percent": 1.1}, {"kn": 8, "percent": 3}]
    row = to_row("webbings", {"id": 1, "name": "W", "brand": "Gibbon", "material": ["Nylon"], "width": 25, "stretch": curve}, 1)
    assert json.loads(row.stretch) == curve
    assert to_entry("webbings", row, "Gibbon")["stretch"] == curve


@pytest.mark.parametrize("collection", list(GEAR))
def test_every_real_seed_entry_round_trips(collection):
    """entry -> row -> entry is the identity, for every item we hold: the edit
    path rebuilds entries from rows, so any loss here is a lost edit."""
    for entry in read_seed_json(f"{collection}.json"):
        row = to_row(collection, entry, brand_id=1)
        back = to_entry(collection, row, entry["brand"], entry.get("unmodelled"))
        assert back == entry, (collection, entry["id"])


@pytest.mark.parametrize("collection", list(GEAR))
def test_seed_entries_use_only_stored_fields(collection):
    allowed = stored_fields(collection) | ENVELOPE_KEYS
    for entry in read_seed_json(f"{collection}.json"):
        assert set(entry) <= allowed, (collection, entry["id"], sorted(set(entry) - allowed))
        assert list(entry)[:3] == ["id", "name", "brand"], (collection, entry["id"])


def test_weblocks_seed_declares_a_style_and_a_material_for_every_item():
    """A missing style hides an item from the Style filter; a missing material
    from the Material filter. Both used to be guarded at parse time."""
    for item in read_seed_json("weblocks.json"):
        assert item.get("style"), item["name"]
        assert item.get("material"), item["name"]


def test_load_gear_writes_every_row(session):
    from slack_data.load_data._seed_io import seed_sources
    from slack_data.load_data.load_gear import load_gear
    from slack_data.models.grips import Grip

    sources = {"manufacturers.json": read_seed_json("manufacturers.json"), "grips.json": [GRIP, GRIP | {"id": 8, "name": "Other"}]}
    with seed_sources(sources):
        assert load_gear(session, "grips") == 2
    assert sorted(g.id for g in session.exec(select(Grip))) == [7, 8]


# ---------------------------------------------------------------------------
# get_metal_materials() — the multi-select mapper behind `material`
# ---------------------------------------------------------------------------
# A weblock is rarely one metal: a titanium frame can carry steel pins, and an
# aluminium body stainless hardware. The scalar `get_metal_material()` kept the
# FIRST entry and dropped the rest silently, which is how 14 seeded weblocks
# came to publish one metal each while their seeds named two or three.


@pytest.mark.parametrize("raw,expected", [
    ("Titanium, Steel", [MetalMaterial.TITANIUM, MetalMaterial.STEEL]),
    (["Titanium", "Steel"], [MetalMaterial.TITANIUM, MetalMaterial.STEEL]),
    ("Aluminum & Stainless Steel", [MetalMaterial.ALUMINUM, MetalMaterial.STAINLESS_STEEL]),
    ("Aluminum and Steel", [MetalMaterial.ALUMINUM, MetalMaterial.STEEL]),
    # "stainless" is checked before "steel", so the two stay distinct members
    ("Stainless Steel, Steel", [MetalMaterial.STAINLESS_STEEL, MetalMaterial.STEEL]),
    ("Steel, Steel", [MetalMaterial.STEEL]),                    # duplicates collapse
    ("Nylon, Aluminum", [MetalMaterial.ALUMINUM]),              # OTHER drops once a metal resolves
    ("Unobtainium", [MetalMaterial.OTHER]),                     # ...but survives alone
    (None, [MetalMaterial.OTHER]),
    ("", [MetalMaterial.OTHER]),
])
def test_get_metal_materials(raw, expected):
    assert get_metal_materials(raw) == expected


# ---------------------------------------------------------------------------
# get_brand() — pure function behaviour (no HTTP)
# ---------------------------------------------------------------------------

def test_get_brand_returns_tuple(session):
    result = get_brand(session, {}, {"brand": "Gibbon"})
    assert isinstance(result, tuple)
    brand_id, cache = result
    assert isinstance(brand_id, int)
    assert isinstance(cache, dict)


def test_get_brand_populates_cache(session):
    cache: dict = {}
    brand_id, cache = get_brand(session, cache, {"brand": "Gibbon"})
    assert "Gibbon" in cache
    assert cache["Gibbon"] == brand_id


def test_get_brand_cache_hit_on_second_call(session):
    cache: dict = {}
    id1, cache = get_brand(session, cache, {"brand": "Gibbon"})
    id2, cache = get_brand(session, cache, {"brand": "Gibbon"})
    assert id1 == id2
