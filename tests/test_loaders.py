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

from slack_data.load_data.load_webbings import clean_webbing_data, get_material_type
from slack_data.models.brands import get_brand
from slack_data.models.webbing import FiberMaterial


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
    ("pes/polyamid", FiberMaterial.HYBRID),      # hybrid check comes first
    ("Carbon Fibre", FiberMaterial.OTHER),       # unrecognised
    ("",             FiberMaterial.OTHER),       # empty string
])
def test_get_material_type(raw, expected):
    assert get_material_type(raw) == expected


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
