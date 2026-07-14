"""Tests for the /starterkit endpoints."""

from slack_data.models.starterkits import StarterKit, TensioningType


def make_starterkit(session, brand, *, name="Test Kit", webbing_length=15, webbing_width=50, **kwargs) -> StarterKit:
    k = StarterKit(
        name=name,
        webbing_length=webbing_length,
        webbing_width=webbing_width,
        tensioning_type=TensioningType.SINGLE_RATCHET,
        brand_id=brand.id,
        **kwargs,
    )
    session.add(k)
    session.commit()
    session.refresh(k)
    return k


# --- LIST ---

def test_list_starterkits_empty(client):
    assert client.get("/starterkit/").json() == []


def test_list_starterkits_returns_items(client, session, brand):
    make_starterkit(session, brand, name="Fun Line Kit")
    make_starterkit(session, brand, name="Classic Line Kit")
    names = [k["name"] for k in client.get("/starterkit/").json()]
    assert "Fun Line Kit" in names and "Classic Line Kit" in names


def test_list_starterkits_includes_brand_name(client, session, brand):
    make_starterkit(session, brand)
    assert client.get("/starterkit/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_starterkit_by_id(client, session, brand):
    k = make_starterkit(session, brand, name="Pro Starter", webbing_length=20)
    data = client.get(f"/starterkit/{k.id}").json()
    assert data["name"] == "Pro Starter"
    assert data["webbing_length"] == 20
    assert data["brand_name"] == brand.name


def test_get_starterkit_not_found(client):
    assert client.get("/starterkit/9999").status_code == 404


# --- POST ---

def test_create_starterkit(client, brand):
    r = client.post("/starterkit/", json={
        "name": "New Kit",
        "webbing_length": 15,
        "webbing_width": 50,
        "tensioning_type": "Single Ratchet",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Kit"
    assert r.json()["tensioning_type"] == "Single Ratchet"
    assert r.json()["brand_name"] == brand.name


def test_create_starterkit_with_optional_fields(client, brand):
    r = client.post("/starterkit/", json={
        "name": "Full Kit",
        "webbing_length": 25,
        "webbing_width": 50,
        "tensioning_type": "Double Ratchet",
        "includes_treepro": True,
        "isa_certified": True,
        "price": 145.0,
        "currency": "EUR",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["includes_treepro"] is True
    assert data["isa_certified"] is True


def test_create_starterkit_missing_required_field_rejected(client, brand):
    # Missing tensioning_type
    r = client.post("/starterkit/", json={
        "name": "No Tensioning",
        "webbing_length": 15,
        "webbing_width": 50,
        "brand_id": brand.id,
    })
    assert r.status_code == 422


def test_create_starterkit_optional_fields_default_null(client, brand):
    r = client.post("/starterkit/", json={
        "name": "Minimal",
        "webbing_length": 15,
        "webbing_width": 50,
        "tensioning_type": "Primitive",
        "brand_id": brand.id,
    })
    data = r.json()
    assert data["price"] is None
    assert data["includes_treepro"] is False
    assert data["isa_certified"] is False


# --- PATCH ---

def test_patch_starterkit_updates_field(client, session, brand):
    k = make_starterkit(session, brand, price=79.0)
    resp = client.patch(f"/starterkit/{k.id}", json={"price": 99.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 99.0


def test_patch_starterkit_does_not_touch_other_fields(client, session, brand):
    k = make_starterkit(session, brand, name="Stays Same", webbing_length=20)
    resp = client.patch(f"/starterkit/{k.id}", json={"price": 100.0})
    assert resp.status_code == 200
    data = client.get(f"/starterkit/{k.id}").json()
    assert data["name"] == "Stays Same"
    assert data["webbing_length"] == 20


def test_patch_starterkit_not_found(client):
    assert client.patch("/starterkit/9999", json={"price": 10.0}).status_code == 404


# --- DELETE ---

def test_delete_starterkit(client, session, brand):
    k = make_starterkit(session, brand)
    assert client.delete(f"/starterkit/{k.id}").json() == {"ok": True}
    assert client.get(f"/starterkit/{k.id}").status_code == 404


def test_delete_starterkit_not_found(client):
    assert client.delete("/starterkit/9999").status_code == 404
