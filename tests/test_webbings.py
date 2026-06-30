"""
Tests for the /webbing endpoints.

Covers: CRUD contract, pagination edge cases, response schema.
"""

import pytest
from sqlmodel import Session

from slack_data.models.brands import Brand
from slack_data.models.webbing import FiberMaterial, Webbing


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_brand(session: Session, name: str = "Test Brand") -> Brand:
    brand = Brand(name=name)
    session.add(brand)
    session.commit()
    session.refresh(brand)
    return brand


def make_webbing(
    session: Session,
    brand: Brand,
    *,
    name: str = "Test Webbing",
    material: FiberMaterial = FiberMaterial.NYLON,
    width: int = 25,
    **kwargs,
) -> Webbing:
    webbing = Webbing(name=name, material=material, width=width, brand_id=brand.id, **kwargs)
    session.add(webbing)
    session.commit()
    session.refresh(webbing)
    return webbing


# ---------------------------------------------------------------------------
# GET /webbing/
# ---------------------------------------------------------------------------

def test_list_webbings_empty(client):
    response = client.get("/webbing/")
    assert response.status_code == 200
    assert response.json() == []


def test_list_webbings_returns_items(client, session):
    brand = make_brand(session)
    make_webbing(session, brand, name="Fly")
    make_webbing(session, brand, name="McFly")

    response = client.get("/webbing/")
    assert response.status_code == 200
    names = [w["name"] for w in response.json()]
    assert "Fly" in names
    assert "McFly" in names


def test_list_webbings_includes_brand_name(client, session):
    brand = make_brand(session, "Gibbon")
    make_webbing(session, brand)

    data = client.get("/webbing/").json()
    assert data[0]["brand_name"] == "Gibbon"


# ---------------------------------------------------------------------------
# GET /webbing/{id}
# ---------------------------------------------------------------------------

def test_get_webbing_by_id(client, session):
    brand = make_brand(session)
    webbing = make_webbing(session, brand, name="Aero 18", width=18)

    response = client.get(f"/webbing/{webbing.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Aero 18"
    assert data["width"] == 18
    assert data["brand_name"] == brand.name


def test_get_webbing_not_found(client):
    response = client.get("/webbing/9999")
    assert response.status_code == 404


def test_get_webbing_invalid_id_zero(client):
    # Path uses gt=0, so 0 is rejected at validation
    response = client.get("/webbing/0")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /webbing/
# ---------------------------------------------------------------------------

def test_create_webbing(client, session):
    brand = make_brand(session)

    response = client.post("/webbing/", json={
        "name": "New Webbing",
        "material": "Nylon",
        "width": 25,
        "brand_id": brand.id,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New Webbing"
    assert data["material"] == "Nylon"
    assert data["brand_name"] == brand.name


def test_create_webbing_optional_fields_default_null(client, session):
    brand = make_brand(session)

    response = client.post("/webbing/", json={
        "name": "Minimal Webbing",
        "material": "Polyester",
        "width": 35,
        "brand_id": brand.id,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["price"] is None
    assert data["weight"] is None
    assert data["breaking_strength"] is None


def test_create_webbing_with_optional_fields(client, session):
    brand = make_brand(session)

    response = client.post("/webbing/", json={
        "name": "Full Webbing",
        "material": "Dyneema",
        "width": 18,
        "brand_id": brand.id,
        "breaking_strength": 22.5,
        "weight": 38.0,
        "price": 65.0,
        "currency": "EUR",
        "isa_certified": True,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["breaking_strength"] == 22.5
    assert data["isa_certified"] is True


# ---------------------------------------------------------------------------
# PATCH /webbing/{id}
# ---------------------------------------------------------------------------

def test_patch_webbing_updates_field(client, session):
    brand = make_brand(session)
    webbing = make_webbing(session, brand, name="Original", price=20.0)

    response = client.patch(f"/webbing/{webbing.id}", json={"price": 35.0})
    assert response.status_code == 200
    assert response.json()["price"] == 35.0


def test_patch_webbing_does_not_touch_other_fields(client, session):
    brand = make_brand(session)
    webbing = make_webbing(session, brand, name="Stays Same", width=25)

    response = client.patch(f"/webbing/{webbing.id}", json={"price": 99.0})
    assert response.status_code == 200

    data = client.get(f"/webbing/{webbing.id}").json()
    assert data["name"] == "Stays Same"
    assert data["width"] == 25
    assert data["price"] == 99.0


def test_patch_webbing_not_found(client):
    response = client.patch("/webbing/9999", json={"price": 10.0})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /webbing/{id}
# ---------------------------------------------------------------------------

def test_delete_webbing(client, session):
    brand = make_brand(session)
    webbing = make_webbing(session, brand)

    response = client.delete(f"/webbing/{webbing.id}")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    # Confirm it's gone
    response = client.get(f"/webbing/{webbing.id}")
    assert response.status_code == 404


def test_delete_webbing_not_found(client):
    response = client.delete("/webbing/9999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

def _create_webbings(session, brand, count: int):
    for i in range(count):
        make_webbing(session, brand, name=f"Webbing {i:03d}", width=25)


def test_pagination_default_limit_is_10(client, session):
    brand = make_brand(session)
    _create_webbings(session, brand, 15)

    response = client.get("/webbing/")
    assert response.status_code == 200
    assert len(response.json()) == 10


def test_pagination_limit(client, session):
    brand = make_brand(session)
    _create_webbings(session, brand, 10)

    response = client.get("/webbing/?limit=3")
    assert len(response.json()) == 3


def test_pagination_offset(client, session):
    brand = make_brand(session)
    _create_webbings(session, brand, 10)

    all_items  = client.get("/webbing/?limit=10").json()
    page2      = client.get("/webbing/?limit=5&offset=5").json()

    assert page2 == all_items[5:]


def test_pagination_limit_over_100_rejected(client):
    response = client.get("/webbing/?limit=101")
    assert response.status_code == 422


def test_pagination_offset_past_end_returns_empty(client, session):
    brand = make_brand(session)
    _create_webbings(session, brand, 3)

    response = client.get("/webbing/?offset=100")
    assert response.status_code == 200
    assert response.json() == []
