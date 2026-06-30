"""
Tests for brand behaviour — the central entity every gear type links to.

Covers: get_brand() upsert logic, cache behaviour, brand_name computed field
in gear responses, and the constraint that the same brand name never produces
two rows.
"""

from sqlmodel import Session, select

from slack_data.models.brands import Brand, get_brand
from slack_data.models.webbing import FiberMaterial, Webbing


# ---------------------------------------------------------------------------
# get_brand() upsert
# ---------------------------------------------------------------------------

def test_get_brand_creates_brand_if_missing(session: Session):
    cache: dict = {}
    brand_id, cache = get_brand(session, cache, {"brand": "Gibbon"})

    assert brand_id is not None
    brand = session.get(Brand, brand_id)
    assert brand is not None
    assert brand.name == "Gibbon"


def test_get_brand_returns_same_id_for_same_name(session: Session):
    cache: dict = {}
    id1, cache = get_brand(session, cache, {"brand": "Gibbon"})
    id2, cache = get_brand(session, cache, {"brand": "Gibbon"})

    assert id1 == id2


def test_get_brand_no_duplicate_rows(session: Session):
    cache: dict = {}
    get_brand(session, cache, {"brand": "Gibbon"})
    # Simulate a second loader call with an empty cache (cache miss → DB lookup)
    get_brand(session, {}, {"brand": "Gibbon"})

    rows = session.exec(select(Brand).where(Brand.name == "Gibbon")).all()
    assert len(rows) == 1


def test_get_brand_different_names_get_different_ids(session: Session):
    cache: dict = {}
    id_gibbon,     cache = get_brand(session, cache, {"brand": "Gibbon"})
    id_slacktivity, cache = get_brand(session, cache, {"brand": "Slacktivity"})

    assert id_gibbon != id_slacktivity


def test_get_brand_cache_prevents_second_db_insert(session: Session):
    cache: dict = {}
    # First call: creates brand and populates cache
    id1, cache = get_brand(session, cache, {"brand": "Gibbon"})
    # Second call with same cache: must hit cache, not DB
    assert "Gibbon" in cache
    id2, cache = get_brand(session, cache, {"brand": "Gibbon"})

    assert id1 == id2
    # Still only one row despite two calls
    rows = session.exec(select(Brand).where(Brand.name == "Gibbon")).all()
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# brand_name computed field in API responses
# ---------------------------------------------------------------------------

def test_brand_name_present_in_webbing_response(client, session):
    brand = Brand(name="Landcruising")
    session.add(brand)
    session.commit()
    session.refresh(brand)

    webbing = Webbing(name="Verve", material=FiberMaterial.POLYESTER, width=25, brand_id=brand.id)
    session.add(webbing)
    session.commit()
    session.refresh(webbing)

    response = client.get(f"/webbing/{webbing.id}")
    assert response.status_code == 200
    assert response.json()["brand_name"] == "Landcruising"


def test_brand_name_present_in_list_response(client, session):
    brand = Brand(name="Balance Community")
    session.add(brand)
    session.commit()
    session.refresh(brand)

    webbing = Webbing(name="Jibline", material=FiberMaterial.POLYESTER, width=20, brand_id=brand.id)
    session.add(webbing)
    session.commit()

    data = client.get("/webbing/").json()
    assert data[0]["brand_name"] == "Balance Community"


def test_brand_name_present_after_patch(client, session):
    brand = Brand(name="Slacktivity")
    session.add(brand)
    session.commit()
    session.refresh(brand)

    webbing = Webbing(name="Mission", material=FiberMaterial.NYLON, width=25, brand_id=brand.id)
    session.add(webbing)
    session.commit()
    session.refresh(webbing)

    response = client.patch(f"/webbing/{webbing.id}", json={"price": 22.0})
    assert response.status_code == 200
    assert response.json()["brand_name"] == "Slacktivity"
