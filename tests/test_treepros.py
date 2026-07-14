"""Tests for the /treepro endpoints."""

from slack_data.models.treepro import PriceUnit, TreePro


def make_treepro(session, brand, *, name="Test TreePro", **kwargs) -> TreePro:
    t = TreePro(name=name, brand_id=brand.id, **kwargs)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


# --- LIST ---

def test_list_treepros_empty(client):
    assert client.get("/treepro/").json() == []


def test_list_treepros_returns_items(client, session, brand):
    make_treepro(session, brand, name="TreePro XL")
    make_treepro(session, brand, name="Tree-Shirt S")
    names = [t["name"] for t in client.get("/treepro/").json()]
    assert "TreePro XL" in names and "Tree-Shirt S" in names


def test_list_treepros_includes_brand_name(client, session, brand):
    make_treepro(session, brand)
    assert client.get("/treepro/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_treepro_by_id(client, session, brand):
    t = make_treepro(session, brand, name="Wide Guard", width=15.0, length=150)
    data = client.get(f"/treepro/{t.id}").json()
    assert data["name"] == "Wide Guard"
    assert data["length"] == 150
    assert data["brand_name"] == brand.name


def test_get_treepro_not_found(client):
    assert client.get("/treepro/9999").status_code == 404


# --- POST ---

def test_create_treepro(client, brand):
    r = client.post("/treepro/", json={"name": "New TreePro", "brand_id": brand.id})
    assert r.status_code == 200
    assert r.json()["name"] == "New TreePro"
    assert r.json()["brand_name"] == brand.name


def test_create_treepro_with_optional_fields(client, brand):
    r = client.post("/treepro/", json={
        "name": "Full TreePro",
        "width": 10.0,
        "length": 100,
        "thickness": 8,
        "has_sling_attachment": True,
        "price": 28.0,
        "price_unit": "pair",
        "currency": "EUR",
        "brand_id": brand.id,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["has_sling_attachment"] is True
    assert data["price_unit"] == "pair"


def test_create_treepro_optional_fields_default_null(client, brand):
    r = client.post("/treepro/", json={"name": "Minimal", "brand_id": brand.id})
    data = r.json()
    assert data["price"] is None
    assert data["width"] is None
    assert data["length"] is None


# --- PATCH ---

def test_patch_treepro_updates_field(client, session, brand):
    t = make_treepro(session, brand, price=25.0)
    resp = client.patch(f"/treepro/{t.id}", json={"price": 29.99})
    assert resp.status_code == 200
    assert resp.json()["price"] == 29.99


def test_patch_treepro_does_not_touch_other_fields(client, session, brand):
    t = make_treepro(session, brand, name="Stays Same", length=198)
    resp = client.patch(f"/treepro/{t.id}", json={"price": 30.0})
    assert resp.status_code == 200
    data = client.get(f"/treepro/{t.id}").json()
    assert data["name"] == "Stays Same"
    assert data["length"] == 198


def test_patch_treepro_not_found(client):
    assert client.patch("/treepro/9999", json={"price": 5.0}).status_code == 404


# --- DELETE ---

def test_delete_treepro(client, session, brand):
    t = make_treepro(session, brand)
    assert client.delete(f"/treepro/{t.id}").json() == {"ok": True}
    assert client.get(f"/treepro/{t.id}").status_code == 404


def test_delete_treepro_not_found(client):
    assert client.delete("/treepro/9999").status_code == 404
