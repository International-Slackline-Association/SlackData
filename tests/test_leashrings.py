"""Tests for the /leashring endpoints."""

from slack_data.models.leashrings import LeashRing
from slack_data.utilities.materials import MetalMaterial


def make_leashring(session, brand, *, name="Test Ring", **kwargs) -> LeashRing:
    r = LeashRing(name=name, material=MetalMaterial.STEEL, brand_id=brand.id, **kwargs)
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


# --- LIST ---

def test_list_leashrings_empty(client):
    assert client.get("/leashring/").json() == []


def test_list_leashrings_returns_items(client, session, brand):
    make_leashring(session, brand, name="Ring 50")
    make_leashring(session, brand, name="Bomber Ring")
    names = [r["name"] for r in client.get("/leashring/").json()]
    assert "Ring 50" in names and "Bomber Ring" in names


def test_list_leashrings_includes_brand_name(client, session, brand):
    make_leashring(session, brand)
    assert client.get("/leashring/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_leashring_by_id(client, session, brand):
    r = make_leashring(session, brand, name="Arbo Ring", inner_diameter=46.0)
    data = client.get(f"/leashring/{r.id}").json()
    assert data["name"] == "Arbo Ring"
    assert data["inner_diameter"] == 46.0
    assert data["brand_name"] == brand.name


def test_get_leashring_not_found(client):
    assert client.get("/leashring/9999").status_code == 404


# --- POST ---

def test_create_leashring(client, brand):
    r = client.post("/leashring/", json={
        "name": "New Ring",
        "material": "Steel",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Ring"
    assert r.json()["brand_name"] == brand.name


def test_create_leashring_with_optional_fields(client, brand):
    r = client.post("/leashring/", json={
        "name": "Ti Ring",
        "material": "Titanium",
        "inner_diameter": 50.0,
        "outer_diameter": 59.0,
        "breaking_strength": 30.0,
        "isa_certified": True,
        "price": 45.0,
        "currency": "USD",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["material"] == "Titanium"
    assert data["inner_diameter"] == 50.0
    assert data["isa_certified"] is True


def test_create_leashring_missing_required_field_rejected(client, brand):
    r = client.post("/leashring/", json={"name": "No Material", "brand_id": brand.id})
    assert r.status_code == 422


def test_create_leashring_optional_fields_default_null(client, brand):
    r = client.post("/leashring/", json={
        "name": "Minimal",
        "material": "Steel",
        "brand_id": brand.id,
    })
    data = r.json()
    assert data["price"] is None
    assert data["inner_diameter"] is None
    assert data["breaking_strength"] is None


# --- PATCH ---

def test_patch_leashring_updates_field(client, session, brand):
    r = make_leashring(session, brand, price=10.0)
    resp = client.patch(f"/leashring/{r.id}", json={"price": 18.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 18.0


def test_patch_leashring_does_not_touch_other_fields(client, session, brand):
    r = make_leashring(session, brand, name="Stays Same", inner_diameter=57.0)
    resp = client.patch(f"/leashring/{r.id}", json={"price": 12.0})
    assert resp.status_code == 200
    data = client.get(f"/leashring/{r.id}").json()
    assert data["name"] == "Stays Same"
    assert data["inner_diameter"] == 57.0


def test_patch_leashring_not_found(client):
    assert client.patch("/leashring/9999", json={"price": 5.0}).status_code == 404


# --- DELETE ---

def test_delete_leashring(client, session, brand):
    r = make_leashring(session, brand)
    assert client.delete(f"/leashring/{r.id}").json() == {"ok": True}
    assert client.get(f"/leashring/{r.id}").status_code == 404


def test_delete_leashring_not_found(client):
    assert client.delete("/leashring/9999").status_code == 404
