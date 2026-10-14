"""Tests for the /connector endpoints and connectors through the gear loader."""

import pytest
from conftest import persist

from slack_data.load_data._seed_io import read_seed_json
from slack_data.load_data.load_gear import to_row
from slack_data.load_data.load_isa_certifications import CERTIFIABLE_MODELS
from slack_data.load_data.load_isa_warnings import WARNABLE_MODELS
from slack_data.models.connectors import (
    Connector,
    ConnectorClosure,
    ConnectorMaterial,
    ConnectorStyle,
)


def make_connector(session, brand, *, name="Test Shackle", **kwargs) -> Connector:
    kwargs.setdefault("connector_style", ConnectorStyle.SHACKLE)
    kwargs.setdefault("material", ConnectorMaterial.STAINLESS_STEEL)
    c = Connector(name=name, brand_id=brand.id, **kwargs)
    return persist(session, c)


# --- LIST ---

def test_list_connectors_empty(client):
    assert client.get("/connector/").json() == []


def test_list_connectors_returns_items(client, session, brand):
    make_connector(session, brand, name="KingPin")
    make_connector(session, brand, name="Soft Shackle 6mm", connector_style=ConnectorStyle.SOFT_SHACKLE,
                   material=ConnectorMaterial.DYNEEMA)
    names = [c["name"] for c in client.get("/connector/").json()]
    assert "KingPin" in names and "Soft Shackle 6mm" in names


def test_list_connectors_includes_brand_name(client, session, brand):
    make_connector(session, brand)
    assert client.get("/connector/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_connector_by_id(client, session, brand):
    c = make_connector(
        session, brand, name="KingPin",
        material=ConnectorMaterial.ALUMINUM, closure=ConnectorClosure.PUSH_PIN,
        mbs_straight_pull=48, mbs_crossload=28, opening=26, pin_diameter=11.2,
        standards=["EN362:2005", "ISA:52"],
    )
    data = client.get(f"/connector/{c.id}").json()
    assert data["name"] == "KingPin"
    assert data["connector_style"] == "Shackle"
    assert data["closure"] == "Push pin"
    assert data["material"] == "Aluminum"
    assert data["mbs_straight_pull"] == 48
    assert data["opening"] == 26
    assert data["standards"] == ["EN362:2005", "ISA:52"]
    assert data["brand_name"] == brand.name


def test_get_connector_not_found(client):
    assert client.get("/connector/9999").status_code == 404


# --- POST ---

def test_create_connector(client, brand):
    r = client.post("/connector/", json={
        "name": "New Carabiner", "connector_style": "Carabiner", "material": "Steel",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Carabiner"
    assert r.json()["brand_name"] == brand.name


def test_create_connector_optional_fields_default_null(client, brand):
    r = client.post("/connector/", json={
        "name": "Minimal", "connector_style": "Quicklink", "material": "Steel",
        "brand_id": brand.id,
    })
    data = r.json()
    for field in ("closure", "mbs_straight_pull", "mbs_crossload", "mbs_gate_open",
                  "opening", "pin_diameter", "rope_diameter", "weight", "standards",
                  "gear_sellers"):
        assert data[field] is None, field
    assert data["isa_certified"] is False


@pytest.mark.parametrize("missing", ["connector_style", "material"])
def test_create_connector_requires_style_and_material(client, brand, missing):
    payload = {"name": "X", "connector_style": "Shackle", "material": "Steel", "brand_id": brand.id}
    del payload[missing]
    assert client.post("/connector/", json=payload).status_code == 422


def test_create_connector_rejects_unknown_style(client, brand):
    r = client.post("/connector/", json={
        "name": "X", "connector_style": "Rigging plate", "material": "Steel", "brand_id": brand.id,
    })
    assert r.status_code == 422


# --- PATCH ---

def test_patch_connector_updates_field(client, session, brand):
    c = make_connector(session, brand, price=15.0)
    resp = client.patch(f"/connector/{c.id}", json={"price": 13.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 13.0


def test_patch_connector_not_found(client):
    assert client.patch("/connector/9999", json={"price": 5.0}).status_code == 404


# --- DELETE ---

def test_delete_connector(client, session, brand):
    c = make_connector(session, brand)
    assert client.delete(f"/connector/{c.id}").json() == {"ok": True}
    assert client.get(f"/connector/{c.id}").status_code == 404


# --- Loader ---

def load_connectors_json() -> list[dict]:
    return read_seed_json("connectors.json")


def _load(session, item: dict) -> Connector:
    row = to_row("connectors", {"id": 1, "brand": "Gibbon"} | item, brand_id=1)
    session.add(row)
    session.commit()
    return session.get(Connector, row.id)


def test_loader_maps_every_connector_field(session):
    row = _load(session, {
        "name": "Slackle",
        "connector_style": "Shackle",
        "closure": "Push pin",
        "material": "Aluminum",
        "alloy": "7075-T6",
        "mbs_straight_pull": 60,
        "mbs_crossload": 30,
        "opening": 26.2,
        "pin_diameter": 12,
        "weight": 128,
        "standards": ["ISA:52"],
        "standards_source": "https://example.com",
        "price": 45,
        "currency": "USD",
        "active": True,
    })
    assert row.connector_style is ConnectorStyle.SHACKLE
    assert row.closure is ConnectorClosure.PUSH_PIN
    assert row.material is ConnectorMaterial.ALUMINUM
    assert row.alloy == "7075-T6"
    assert (row.mbs_straight_pull, row.mbs_crossload, row.mbs_gate_open) == (60, 30, None)
    assert (row.opening, row.pin_diameter, row.weight) == (26.2, 12, 128)
    assert row.standards == ["ISA:52"]


def test_loader_keeps_empty_lists_as_null(session):
    """`[]` is never written: null is "none recorded" (see the model)."""
    row = _load(session, {
        "name": "X", "connector_style": "Shackle",
        "material": "Steel", "standards": [], "gear_sellers": [],
    })
    assert row.standards is None
    assert row.gear_sellers is None


@pytest.mark.parametrize("field, value", [
    ("connector_style", "Rigging plate"),
    ("closure", "Snapgate"),
    ("material", "Brass"),
])
def test_loader_refuses_an_unknown_enum_value(session, field, value):
    """A misspelt style, closure or material is an error on re-seed — never a
    silent fallback, which would put the row under the wrong filter pill."""
    item = {"name": "X", "connector_style": "Shackle", "material": "Steel"}
    with pytest.raises(ValueError):
        _load(session, item | {field: value})


def test_seed_file_is_a_list():
    assert isinstance(load_connectors_json(), list)


# --- ISA ---

def test_connectors_can_be_certified_and_warned():
    """ISA:52 is a connector standard, and warning #65 is about a shackle pin."""
    assert CERTIFIABLE_MODELS["connector"] is Connector
    assert WARNABLE_MODELS["connector"] is Connector


# --- Product groups ---

def test_loader_maps_product_group(session):
    row = _load(session, {
        "name": "D Shackle 8mm", "connector_style": "Shackle",
        "material": "Stainless Steel", "product_group": "D Shackle 8mm, Stainless",
    })
    assert row.product_group == "D Shackle 8mm, Stainless"


def test_product_group_is_not_correctable():
    """Which shops' listings are the same part is our grouping, not any one
    brand's to state — so neither the suggestion box nor the manufacturer API
    takes it."""
    from slack_data.submissions.fields import CORRECTABLE_FIELDS, manufacturer_fields

    assert "product_group" not in CORRECTABLE_FIELDS["connectors"]
    assert "product_group" not in manufacturer_fields("connectors")


def test_every_seeded_group_has_at_least_two_members():
    """A part only one shop sells is a plain row, never a group of one."""
    from collections import Counter

    groups = Counter(c["product_group"] for c in load_connectors_json() if c.get("product_group"))
    assert all(n >= 2 for n in groups.values()), {g: n for g, n in groups.items() if n < 2}


# --- Captive pin ---

def test_loader_maps_captive_pin_and_defaults_it_false(session):
    base = {"connector_style": "Shackle", "material": "Stainless Steel"}
    assert _load(session, {**base, "name": "Bow Shackle 12mm", "captive_pin": True}).captive_pin is True
    assert _load(session, {**base, "id": 2, "name": "Bow Shackle 14mm"}).captive_pin is False


def test_captive_pin_does_not_split_a_group():
    """A captive pin is a flag on a shop's row, not a different part
    (operator, 2026-10-11): no group key names it."""
    assert not any("Captive" in (c.get("product_group") or "") for c in load_connectors_json())


def test_soft_shackle_material_is_spelled_like_the_webbing_fibre():
    """Dyneema is a brand of HMPE: one value for both, so a search or filter
    for the fibre finds the soft shackle and the webbing alike."""
    from slack_data.models.webbing import FiberMaterial

    assert ConnectorMaterial.DYNEEMA.value == FiberMaterial.DYNEEMA.value == "Dyneema/HMPE"

