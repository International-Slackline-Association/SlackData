"""
Tests for data loading / normalisation logic.

These tests do not go through HTTP — they call the loader functions directly.
They cover the JSON→model mapping that is most likely to break silently:
  - get_material_type(): string → FiberMaterial enum
  - clean_webbing_data(): blank/null field normalisation
  - get_brand(): upsert with cache (also tested in test_brands.py from the
    API side; here we focus on the pure function behaviour)
"""

import pytest

from slack_data.load_data.load_webbings import (
    clean_webbing_data,
    get_material_type,
    get_material_types,
)
from slack_data.load_data.load_weblocks import (
    clean_weblock_data,
    get_weblock_style,
)
from slack_data.models.brands import get_brand
from slack_data.models.webbing import FiberMaterial
from slack_data.models.weblocks import WeblockStyle
from slack_data.utilities.materials import MetalMaterial, get_metal_materials


# ---------------------------------------------------------------------------
# get_material_type()
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("Nylon",        FiberMaterial.NYLON),
    ("NYLON",        FiberMaterial.NYLON),      # case-insensitive
    ("polyamid",     FiberMaterial.NYLON),       # synonym
    ("Polyester",    FiberMaterial.POLYESTER),
    ("PES",          FiberMaterial.POLYESTER),   # abbreviation
    ("Dyneema",      FiberMaterial.DYNEEMA),
    ("DYNEEMA SK75", FiberMaterial.DYNEEMA),     # with suffix
    ("Vectran",      FiberMaterial.VECTRAN),
    ("Hybrid",       FiberMaterial.OTHER),       # names no fibers on its own
    ("Carbon Fibre", FiberMaterial.OTHER),       # unrecognised
    ("",             FiberMaterial.OTHER),       # empty string
])
def test_get_material_type(raw, expected):
    assert get_material_type(raw) == expected


# ---------------------------------------------------------------------------
# get_material_types() — the multi-select `material` list
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("material_type, composition, expected", [
    # no composition → single-fiber list off materialType
    ("Nylon", None, [FiberMaterial.NYLON]),
    ("PES",   None, [FiberMaterial.POLYESTER]),
    # composition wins, and is the only source for former "Hybrid" rows
    ("Hybrid", ["Polyester", "Dyneema/HMPE"],
     [FiberMaterial.POLYESTER, FiberMaterial.DYNEEMA]),
    ("Hybrid", ["Vectran", "Polyester"],
     [FiberMaterial.VECTRAN, FiberMaterial.POLYESTER]),
    # a JSON string (as clean_webbing_data produces) parses the same way
    ("Hybrid", '["Nylon", "Polyester"]',
     [FiberMaterial.NYLON, FiberMaterial.POLYESTER]),
    # a one-element composition is not special — it is just that fiber
    ("Hybrid", ["Polyester"], [FiberMaterial.POLYESTER]),
    # duplicates collapse, order preserved
    ("Hybrid", ["Nylon", "Nylon"], [FiberMaterial.NYLON]),
    # unknown fibers are skipped; empty result falls back to materialType
    ("Nylon", ["Kryptonite"], [FiberMaterial.NYLON]),
    # nothing resolvable at all → [OTHER], never an empty list (NOT NULL column)
    ("", None, [FiberMaterial.OTHER]),
    ("Hybrid", None, [FiberMaterial.OTHER]),
])
def test_get_material_types(material_type, composition, expected):
    assert get_material_types(material_type, composition) == expected


# ---------------------------------------------------------------------------
# clean_webbing_data()
# ---------------------------------------------------------------------------

def _base_item(**overrides) -> dict:
    """Minimal valid webbing dict with overrides applied."""
    item = {
        "name": "Test Webbing",
        "brand": "Test Brand",
        "materialType": "Nylon",
        "width": 25,
        "weight": 68,
    }
    item.update(overrides)
    return item


def test_clean_webbing_empty_width_becomes_zero():
    result = clean_webbing_data(_base_item(width=""))
    assert result["width"] == 0


def test_clean_webbing_empty_weight_becomes_zero():
    result = clean_webbing_data(_base_item(weight=""))
    assert result["weight"] == 0


def test_clean_webbing_empty_optional_field_becomes_none():
    result = clean_webbing_data(_base_item(product_url=""))
    assert result["product_url"] is None


def test_clean_webbing_isa_certified_string_true_becomes_bool():
    result = clean_webbing_data(_base_item(isa_certified="true"))
    assert result["isa_certified"] is True


def test_clean_webbing_isa_certified_empty_string():
    # isa_certified="" in the JSON means "not certified" — should become False.
    result = clean_webbing_data(_base_item(isa_certified=""))
    assert result["isa_certified"] is False


def test_clean_webbing_none_value_stays_none():
    result = clean_webbing_data(_base_item(product_url=None))
    assert result["product_url"] is None


def test_clean_webbing_numeric_value_becomes_string():
    # Non-special fields get str() applied
    result = clean_webbing_data(_base_item(breaking_strength=32))
    assert result["breaking_strength"] == "32"


# ---------------------------------------------------------------------------
# get_weblock_style() — the `style` categoriser on weblocks
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("Tensionable Weblock", WeblockStyle.TENSIONABLE),
    ("tensionable weblock", WeblockStyle.TENSIONABLE),   # case-insensitive
    ("Tensionable",         WeblockStyle.TENSIONABLE),
    ("Fixed Linelocker",    WeblockStyle.LINELOCKER),
    ("fixed linelocker",    WeblockStyle.LINELOCKER),
    ("Line Locker",         WeblockStyle.LINELOCKER),    # spaced spelling
    ("line-lock",           WeblockStyle.LINELOCKER),    # hyphenated spelling
    ("Weblock",             None),                       # ambiguous → unset
    ("something else",      None),                       # unrecognised
    ("",                    None),
    (None,                  None),
])
def test_get_weblock_style(raw, expected):
    assert get_weblock_style(raw) == expected


def _weblock_item(**overrides):
    item = {
        "name": "Test Weblock",
        "brand": "Test Brand",
        "specifications": {"Material": "Aluminum", "Compatible webbing width": "25mm"},
    }
    item.update(overrides)
    return item


def test_clean_weblock_carries_style():
    result = clean_weblock_data(_weblock_item(style="Fixed Linelocker"))
    assert result["style"] == WeblockStyle.LINELOCKER


def test_clean_weblock_missing_style_is_none():
    assert clean_weblock_data(_weblock_item())["style"] is None


def test_weblocks_seed_declares_a_style_for_every_item():
    """Every seeded weblock is categorised — no silent Nones from the JSON."""
    from slack_data.load_data.load_weblocks import load_weblocks_json

    styles = [get_weblock_style(w.get("style")) for w in load_weblocks_json()]
    assert None not in styles
    assert WeblockStyle.LINELOCKER in styles
    assert WeblockStyle.TENSIONABLE in styles


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


def test_clean_weblock_keeps_every_metal():
    """The regression guard: a two-metal weblock must not come back as one.

    This is the TiLock configuration split — a titanium frame with high-strength
    steel pins. Under the old scalar mapping the steel silently vanished and the
    steel-pin build was indistinguishable from the titanium-pin one.
    """
    item = _weblock_item(specifications={"Material": ["Titanium", "Steel"]})
    assert clean_weblock_data(item)["material"] == [
        MetalMaterial.TITANIUM,
        MetalMaterial.STEEL,
    ]


def test_clean_weblock_material_is_always_a_list():
    """Single-metal weblocks — the other 115 — still load, as a 1-item list."""
    assert clean_weblock_data(_weblock_item())["material"] == [MetalMaterial.ALUMINUM]


def test_weblocks_seed_resolves_a_material_for_every_item():
    """No seeded weblock loses its metals on the way in.

    Checked against the raw seed rather than a fixed list, so it keeps holding
    as products are added: whatever a seed names, that many distinct metals come
    out. A revert to first-item-only fails here on the 14 multi-metal rows.
    """
    from slack_data.load_data.load_weblocks import load_weblocks_json

    thin = {}
    for item in load_weblocks_json():
        raw = (item.get("specifications") or {}).get("Material")
        resolved = clean_weblock_data(dict(item))["material"]
        assert resolved, f"{item.get('name')}: no material resolved at all"
        if isinstance(raw, list) and len(get_metal_materials(raw)) != len(resolved):
            thin[item.get("name")] = (raw, resolved)
    assert not thin, f"weblock(s) lost a metal between seed and model: {thin}"


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
