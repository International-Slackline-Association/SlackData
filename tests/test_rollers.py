"""Tests for the /roller endpoints."""

from slack_data.models.rollers import BearingMaterial, LockType, Roller, SliderType
from slack_data.utilities.materials import MetalMaterial, RollerMaterial

# Defaults for roller's many required fields
_DEFAULTS = dict(
    material=MetalMaterial.ALUMINUM,
    roller_material=RollerMaterial.PLASTIC,
    slider_type=SliderType.Carabiner,
    lock_type=LockType.Nonlocking,
    bearing_material=BearingMaterial.StainlessSteel,
)


def make_roller(session, brand, *, name="Test Roller", **kwargs) -> Roller:
    r = Roller(name=name, brand_id=brand.id, **{**_DEFAULTS, **kwargs})
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


def _create_payload(brand_id: int, **overrides) -> dict:
    base = {
        "name": "New Roller",
        "material": "Aluminum",
        "roller_material": "Plastic",
        "slider_type": "Carabiner",
        "lock_type": "Non-locking",
        "bearing_material": "Stainless Steel",
        "brand_id": brand_id,
    }
    return {**base, **overrides}


# --- LIST ---

def test_list_rollers_empty(client):
    assert client.get("/roller/").json() == []


def test_list_rollers_returns_items(client, session, brand):
    make_roller(session, brand, name="HangOver")
    make_roller(session, brand, name="Rollex")
    names = [r["name"] for r in client.get("/roller/").json()]
    assert "HangOver" in names and "Rollex" in names


def test_list_rollers_includes_brand_name(client, session, brand):
    make_roller(session, brand)
    assert client.get("/roller/").json()[0]["brand_name"] == brand.name


# --- GET ---

def test_get_roller_by_id(client, session, brand):
    r = make_roller(session, brand, name="Slipstream", slider_type=SliderType.MovingPlates)
    data = client.get(f"/roller/{r.id}").json()
    assert data["name"] == "Slipstream"
    assert data["slider_type"] == "Moving plates"
    assert data["brand_name"] == brand.name


def test_get_roller_not_found(client):
    assert client.get("/roller/9999").status_code == 404


# --- POST ---

def test_create_roller(client, brand):
    r = client.post("/roller/", json=_create_payload(brand.id))
    assert r.status_code == 200
    assert r.json()["name"] == "New Roller"
    assert r.json()["brand_name"] == brand.name


def test_create_roller_with_optional_fields(client, brand):
    r = client.post("/roller/", json=_create_payload(
        brand.id,
        name="Pro Roller",
        breaking_strength=14.0,
        price=80.0,
        currency="USD",
        isa_certified=True,
    ))
    assert r.status_code == 200
    data = r.json()
    assert data["breaking_strength"] == 14.0
    assert data["isa_certified"] is True


def test_create_roller_missing_required_field_rejected(client, brand):
    # Missing slider_type
    payload = _create_payload(brand.id)
    del payload["slider_type"]
    assert client.post("/roller/", json=payload).status_code == 422


def test_create_roller_optional_fields_default_null(client, brand):
    r = client.post("/roller/", json=_create_payload(brand.id))
    data = r.json()
    assert data["price"] is None
    assert data["width"] is None
    assert data["breaking_strength"] is None


# --- PATCH ---

def test_patch_roller_updates_field(client, session, brand):
    r = make_roller(session, brand, price=50.0)
    resp = client.patch(f"/roller/{r.id}", json={"price": 75.0})
    assert resp.status_code == 200
    assert resp.json()["price"] == 75.0


def test_patch_roller_does_not_touch_other_fields(client, session, brand):
    r = make_roller(session, brand, name="Unchanged")
    resp = client.patch(f"/roller/{r.id}", json={"price": 99.0})
    assert resp.status_code == 200
    assert client.get(f"/roller/{r.id}").json()["name"] == "Unchanged"


def test_patch_roller_not_found(client):
    assert client.patch("/roller/9999", json={"price": 10.0}).status_code == 404


# --- DELETE ---

def test_delete_roller(client, session, brand):
    r = make_roller(session, brand)
    assert client.delete(f"/roller/{r.id}").json() == {"ok": True}
    assert client.get(f"/roller/{r.id}").status_code == 404


def test_delete_roller_not_found(client):
    assert client.delete("/roller/9999").status_code == 404
