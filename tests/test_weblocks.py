"""Tests for the /weblock endpoints."""

from slack_data.models.weblocks import AttachmentPoint, FrontPin, Weblock
from slack_data.utilities.materials import MetalMaterial


def make_weblock(session, brand, *, name="Test Weblock", width_min=25, **kwargs) -> Weblock:
    w = Weblock(
        name=name,
        material=MetalMaterial.ALUMINUM,
        width_min=width_min,
        brand_id=brand.id,
        **kwargs,
    )
    session.add(w)
    session.commit()
    session.refresh(w)
    return w


# --- LIST ---

def test_list_weblocks_empty(client):
    assert client.get("/weblock/").json() == []


def test_list_weblocks_returns_items(client, session, brand):
    make_weblock(session, brand, name="Eddy")
    make_weblock(session, brand, name="Eliot")
    names = [w["name"] for w in client.get("/weblock/").json()]
    assert "Eddy" in names and "Eliot" in names


def test_list_weblocks_includes_brand_name(client, session, brand):
    make_weblock(session, brand)
    assert client.get("/weblock/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_weblock_by_id(client, session, brand):
    w = make_weblock(session, brand, name="Campo", width_min=24, width_max=26)
    data = client.get(f"/weblock/{w.id}").json()
    assert data["name"] == "Campo"
    assert data["width_min"] == 24
    assert data["brand_name"] == brand.name


def test_get_weblock_not_found(client):
    assert client.get("/weblock/9999").status_code == 404


# --- POST ---

def test_create_weblock(client, brand):
    r = client.post("/weblock/", json={
        "name": "New Weblock",
        "material": "Aluminum",
        "width_min": 25,
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Weblock"
    assert r.json()["brand_name"] == brand.name


def test_create_weblock_with_optional_fields(client, brand):
    r = client.post("/weblock/", json={
        "name": "Full Weblock",
        "material": "Stainless Steel",
        "width_min": 20,
        "width_max": 35,
        "front_pin": "Push Pin",
        "attachment_point": "Universal",
        "isa_certified": True,
        "price": 95.0,
        "currency": "EUR",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["width_max"] == 35
    assert data["front_pin"] == "Push Pin"
    assert data["isa_certified"] is True


def test_create_weblock_missing_required_field_rejected(client, brand):
    r = client.post("/weblock/", json={"name": "No Material", "brand_id": brand.id})
    assert r.status_code == 422


def test_create_weblock_optional_fields_default_null(client, brand):
    r = client.post("/weblock/", json={
        "name": "Minimal",
        "material": "Steel",
        "width_min": 25,
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["price"] is None
    assert data["front_pin"] is None
    assert data["attachment_point"] is None


# --- PATCH ---

def test_patch_weblock_updates_field(client, session, brand):
    w = make_weblock(session, brand, price=80.0)
    r = client.patch(f"/weblock/{w.id}", json={"price": 120.0})
    assert r.status_code == 200
    assert r.json()["price"] == 120.0


def test_patch_weblock_does_not_touch_other_fields(client, session, brand):
    w = make_weblock(session, brand, name="Stays Same", width_min=25)
    r = client.patch(f"/weblock/{w.id}", json={"price": 99.0})
    assert r.status_code == 200
    data = client.get(f"/weblock/{w.id}").json()
    assert data["name"] == "Stays Same"
    assert data["width_min"] == 25


def test_patch_weblock_not_found(client):
    assert client.patch("/weblock/9999", json={"price": 10.0}).status_code == 404


# --- DELETE ---

def test_delete_weblock(client, session, brand):
    w = make_weblock(session, brand)
    assert client.delete(f"/weblock/{w.id}").json() == {"ok": True}
    assert client.get(f"/weblock/{w.id}").status_code == 404


def test_delete_weblock_not_found(client):
    assert client.delete("/weblock/9999").status_code == 404
