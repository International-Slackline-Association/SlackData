"""Tests for the /grip endpoints."""

from slack_data.models.grips import ConnectionType, Grip
from slack_data.utilities.materials import MetalMaterial


def make_grip(session, brand, *, name="Test Grip", width_min=24, **kwargs) -> Grip:
    g = Grip(
        name=name,
        material=MetalMaterial.ALUMINUM,
        width_min=width_min,
        brand_id=brand.id,
        **kwargs,
    )
    session.add(g)
    session.commit()
    session.refresh(g)
    return g


# --- LIST ---

def test_list_grips_empty(client):
    assert client.get("/grip/").json() == []


def test_list_grips_returns_items(client, session, brand):
    make_grip(session, brand, name="LineGrip G4")
    make_grip(session, brand, name="HighlineGrip G2")
    names = [g["name"] for g in client.get("/grip/").json()]
    assert "LineGrip G4" in names and "HighlineGrip G2" in names


def test_list_grips_includes_brand_name(client, session, brand):
    make_grip(session, brand)
    assert client.get("/grip/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_grip_by_id(client, session, brand):
    g = make_grip(session, brand, name="Snatch", width_min=49, width_max=51)
    data = client.get(f"/grip/{g.id}").json()
    assert data["name"] == "Snatch"
    assert data["width_min"] == 49
    assert data["brand_name"] == brand.name


def test_get_grip_not_found(client):
    assert client.get("/grip/9999").status_code == 404


# --- POST ---

def test_create_grip(client, brand):
    r = client.post("/grip/", json={
        "name": "New Grip",
        "material": "Aluminum",
        "width_min": 24,
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Grip"
    assert r.json()["brand_name"] == brand.name


def test_create_grip_with_optional_fields(client, brand):
    r = client.post("/grip/", json={
        "name": "Full Grip",
        "material": "Aluminum",
        "width_min": 24,
        "width_max": 26,
        "wll": 15.0,
        "mbs": 45.0,
        "common_slipping_threshold": 25.0,
        "connection_type": "Mounting Hole",
        "price": 193.70,
        "currency": "EUR",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["wll"] == 15.0
    assert data["connection_type"] == "Mounting Hole"


def test_create_grip_missing_required_field_rejected(client, brand):
    # Missing material
    r = client.post("/grip/", json={"name": "No Material", "width_min": 25, "brand_id": brand.id})
    assert r.status_code == 422


def test_create_grip_optional_fields_default_null(client, brand):
    r = client.post("/grip/", json={
        "name": "Minimal",
        "material": "Aluminum",
        "width_min": 25,
        "brand_id": brand.id,
    })
    data = r.json()
    assert data["price"] is None
    assert data["wll"] is None
    assert data["connection_type"] is None


# --- PATCH ---

def test_patch_grip_updates_field(client, session, brand):
    g = make_grip(session, brand, price=150.0)
    resp = client.patch(f"/grip/{g.id}", json={"price": 193.70})
    assert resp.status_code == 200
    assert resp.json()["price"] == 193.70


def test_patch_grip_does_not_touch_other_fields(client, session, brand):
    g = make_grip(session, brand, name="Stays Same", width_min=24)
    resp = client.patch(f"/grip/{g.id}", json={"price": 99.0})
    assert resp.status_code == 200
    data = client.get(f"/grip/{g.id}").json()
    assert data["name"] == "Stays Same"
    assert data["width_min"] == 24


def test_patch_grip_not_found(client):
    assert client.patch("/grip/9999", json={"price": 10.0}).status_code == 404


# --- DELETE ---

def test_delete_grip(client, session, brand):
    g = make_grip(session, brand)
    assert client.delete(f"/grip/{g.id}").json() == {"ok": True}
    assert client.get(f"/grip/{g.id}").status_code == 404


def test_delete_grip_not_found(client):
    assert client.delete("/grip/9999").status_code == 404
