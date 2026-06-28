"""Tests for the /tricklinekit endpoints."""

from slack_data.models.tricklinekits import TensioningType, TricklineKit


def make_tricklinekit(session, brand, *, name="Test Trickline Kit", webbing_length=15, webbing_width=25, **kwargs) -> TricklineKit:
    k = TricklineKit(
        name=name,
        webbing_length=webbing_length,
        webbing_width=webbing_width,
        tensioning_type=TensioningType.DOUBLE_RATCHET,
        brand_id=brand.id,
        **kwargs,
    )
    session.add(k)
    session.commit()
    session.refresh(k)
    return k


# --- LIST ---

def test_list_tricklinekits_empty(client):
    assert client.get("/tricklinekit/").json() == []


def test_list_tricklinekits_returns_items(client, session, brand):
    make_tricklinekit(session, brand, name="Jibline Kit")
    make_tricklinekit(session, brand, name="Flow Trickline")
    names = [k["name"] for k in client.get("/tricklinekit/").json()]
    assert "Jibline Kit" in names and "Flow Trickline" in names


def test_list_tricklinekits_includes_brand_name(client, session, brand):
    make_tricklinekit(session, brand)
    assert client.get("/tricklinekit/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_tricklinekit_by_id(client, session, brand):
    k = make_tricklinekit(session, brand, name="Pro Trickline", webbing_length=25)
    data = client.get(f"/tricklinekit/{k.id}").json()
    assert data["name"] == "Pro Trickline"
    assert data["webbing_length"] == 25
    assert data["brand_name"] == brand.name


def test_get_tricklinekit_not_found(client):
    assert client.get("/tricklinekit/9999").status_code == 404


# --- POST ---

def test_create_tricklinekit(client, brand):
    r = client.post("/tricklinekit/", json={
        "name": "New Trickline Kit",
        "webbing_length": 15,
        "webbing_width": 25,
        "tensioning_type": "Double Ratchet",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    assert r.json()["name"] == "New Trickline Kit"
    assert r.json()["tensioning_type"] == "Double Ratchet"
    assert r.json()["brand_name"] == brand.name


def test_create_tricklinekit_with_optional_fields(client, brand):
    r = client.post("/tricklinekit/", json={
        "name": "Full Trickline Kit",
        "webbing_length": 20,
        "webbing_width": 20,
        "tensioning_type": "Single Ratchet",
        "includes_treepro": True,
        "price": 149.0,
        "currency": "USD",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["includes_treepro"] is True
    assert data["price"] == 149.0


def test_create_tricklinekit_missing_required_field_rejected(client, brand):
    # Missing webbing_width
    r = client.post("/tricklinekit/", json={
        "name": "No Width",
        "webbing_length": 15,
        "tensioning_type": "Double Ratchet",
        "brand_id": brand.id,
    })
    assert r.status_code == 422


def test_create_tricklinekit_optional_fields_default_null(client, brand):
    r = client.post("/tricklinekit/", json={
        "name": "Minimal",
        "webbing_length": 15,
        "webbing_width": 25,
        "tensioning_type": "Other",
        "brand_id": brand.id,
    })
    data = r.json()
    assert data["price"] is None
    assert data["includes_treepro"] is False


# --- PATCH ---

def test_patch_tricklinekit_updates_field(client, session, brand):
    k = make_tricklinekit(session, brand, price=120.0)
    resp = client.patch(f"/tricklinekit/{k.id}", json={"price": 149.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 149.0


def test_patch_tricklinekit_does_not_touch_other_fields(client, session, brand):
    k = make_tricklinekit(session, brand, name="Stays Same", webbing_length=20)
    resp = client.patch(f"/tricklinekit/{k.id}", json={"price": 200.0})
    assert resp.status_code == 200
    data = client.get(f"/tricklinekit/{k.id}").json()
    assert data["name"] == "Stays Same"
    assert data["webbing_length"] == 20


def test_patch_tricklinekit_not_found(client):
    assert client.patch("/tricklinekit/9999", json={"price": 10.0}).status_code == 404


# --- DELETE ---

def test_delete_tricklinekit(client, session, brand):
    k = make_tricklinekit(session, brand)
    assert client.delete(f"/tricklinekit/{k.id}").json() == {"ok": True}
    assert client.get(f"/tricklinekit/{k.id}").status_code == 404


def test_delete_tricklinekit_not_found(client):
    assert client.delete("/tricklinekit/9999").status_code == 404
