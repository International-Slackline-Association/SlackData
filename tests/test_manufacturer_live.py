"""
The machine API applied live — phase 5 (LIVE_EDITING_PHASE_5.md § 5, P5-F to P5-J).

With the catalogue store, `POST /manufacturer/gear` edits the store as the
brand's manufacturer would, instead of queueing a patch. Against an in-memory
store filled from the real seeds, with the catalogue the matching reads built
from that store. What must hold:

- **Applied, logged, labelled**: the values land in the entry; the log says
  `manufacturer-api`, "manufacturer for <brand>", the key as the actor; the
  receipt says `applied: true`; a breaking strength is flagged `safety`.
- **The values as sent**: a number stays a number; a value the model refuses
  fails its item, by index.
- **All or nothing** (P5-G): one bad item, nothing written.
- **New products and renames** as before, now live.
- **Last write wins** (P5-F): the brand's value replaces an editor's.
- **Photo links leave a to-do** (P5-H).
"""

import contextlib
import io

import pytest
from sqlmodel import Session

from slack_data.api import auth
from slack_data.catalogue.build import build_engine, sources_from_documents
from slack_data.catalogue.importer import documents_from_files
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.catalogue.rights import brand_of
from slack_data.catalogue.store import set_catalogue_repository
from slack_data.database import get_session
from slack_data.manufacturers.clients import InMemoryBrandClientRepository
from slack_data.models.brand_clients import BrandClient, now_iso
from tests.test_edits import ADMIN, edit, people  # noqa: F401 - the people fixture

KEY = "brand-client-bc"
BALANCE = 3
AUTH = {"Authorization": f"Bearer {auth.MANUFACTURER_DEV_TOKEN}:{KEY}"}

_DOCUMENTS = None


def _seeds():
    global _DOCUMENTS
    if _DOCUMENTS is None:
        _DOCUMENTS = documents_from_files()
    return [d.model_copy(deep=True) for d in _DOCUMENTS]


@pytest.fixture
def brand_clients():
    """Balance Community's key. Overrides the conftest fixture."""
    return InMemoryBrandClientRepository(
        [BrandClient(client_id=KEY, brand_id=BALANCE, brand_name="Balance Community", created_at=now_iso())]
    )


@pytest.fixture
def live(client, monkeypatch):
    """Store mode: the store edited, and the catalogue the matching reads built
    from it (once — the matching only needs to find the products)."""
    store = InMemoryCatalogueRepository()
    store.put_many(_seeds())
    monkeypatch.setenv("CATALOG_SOURCE", "store")
    monkeypatch.setenv("CATALOG_STORE_PATH", "unused-in-memory")
    set_catalogue_repository(store)
    from slack_data.api.routers.edit_router import editable_store

    client.app.dependency_overrides[editable_store] = lambda: store
    with contextlib.redirect_stdout(io.StringIO()):
        engine = build_engine(sources_from_documents(store.load()))

    def session():
        with Session(engine) as s:
            yield s

    client.app.dependency_overrides[get_session] = session
    yield store
    set_catalogue_repository(None)


def bc_webbings(store, n=2):
    documents = store.load()
    found = [
        d for d in documents
        if d.collection == "webbings" and not d.data.get("merged_into")
        and (brand_of(documents, d.data.get("brand")) or (0,))[0] == BALANCE
    ]
    names = {}
    for d in found:
        names.setdefault(d.data["name"], []).append(d)
    unique = [ds[0] for ds in names.values() if len(ds) == 1]
    return unique[:n]


def post(client, items):
    return client.post("/manufacturer/gear", json={"items": items}, headers=AUTH)


def item(document, **changes):
    return {"gear_type": "webbings", "gear_id": int(document.key), "name": document.data["name"], "changes": changes}


def test_an_update_is_applied_and_logged_as_the_brands(client, live):
    [webbing] = bc_webbings(live, 1)
    response = post(client, [item(webbing, notes="From our ERP", width=30)])
    assert response.status_code == 201, response.text
    [result] = response.json()["results"]
    assert result["applied"] is True and result["status"] == "applied"

    stored = live.get("webbings", webbing.key).data
    assert stored["notes"] == "From our ERP"
    assert stored["width"] == 30, "a number arrives as a number"

    [record] = client.get("/changes", params={"target_type": "item", "target_id": f"webbings#{webbing.key}"}).json()
    assert record["channel"] == "manufacturer-api"
    assert record["actor_role"] == "manufacturer for Balance Community"
    assert record["actor_isa_id"].startswith("KEY_")


def test_a_breaking_strength_from_the_api_is_flagged_safety(client, live):
    [webbing] = bc_webbings(live, 1)
    post(client, [item(webbing, breaking_strength=42)])
    [record] = client.get("/changes", params={"flag": "safety"}).json()
    assert record["target_id"] == f"webbings#{webbing.key}"


def test_a_value_the_model_refuses_fails_its_item_and_the_batch(client, live):
    first, second = bc_webbings(live, 2)
    before = live.get("webbings", first.key).data
    response = post(client, [item(first, notes="fine"), item(second, width="wide")])
    assert response.status_code == 422
    assert response.json()["detail"]["message"].startswith("items[1]")
    assert live.get("webbings", first.key).data == before, "all or nothing"
    assert client.get("/changes").json() == []


def test_a_new_product_is_created_with_the_next_id(client, live):
    response = post(client, [{"gear_type": "webbings", "name": "Brand New Webbing", "changes": {"width": 25, "material": ["Polyester"]}}])
    assert response.status_code == 201, response.text
    [result] = response.json()["results"]
    new_id = result["gear_id"]
    assert new_id > max(int(d.key) for d in _seeds() if d.collection == "webbings" and d.key.isdigit())
    entry = live.get("webbings", str(new_id)).data
    assert (entry["name"], entry["brand"], entry["material"]) == ("Brand New Webbing", "Balance Community", ["Polyester"])


def test_two_new_products_in_one_call_get_two_ids(client, live):
    response = post(client, [
        {"gear_type": "webbings", "name": "New One", "changes": {"width": 25, "material": ["Polyester"]}},
        {"gear_type": "webbings", "name": "New Two", "changes": {"width": 25, "material": ["Nylon"]}},
    ])
    assert response.status_code == 201, response.text
    ids = [r["gear_id"] for r in response.json()["results"]]
    assert ids[1] == ids[0] + 1
    assert live.get("webbings", str(ids[1])).data["name"] == "New Two"


def test_a_rename_is_applied(client, live):
    [webbing] = bc_webbings(live, 1)
    response = post(client, [{**item(webbing), "rename_to": "Renamed by the maker"}])
    assert response.status_code == 201, response.text
    assert live.get("webbings", webbing.key).data["name"] == "Renamed by the maker"


def test_the_same_product_twice_in_one_call_is_refused(client, live):
    [webbing] = bc_webbings(live, 1)
    response = post(client, [item(webbing, notes="a"), item(webbing, notes="b")])
    assert response.status_code == 422
    assert "same product" in str(response.json()["detail"])


def test_the_brands_value_replaces_an_editors(client, live):
    """P5-F: last write wins; both are in the log."""
    [webbing] = bc_webbings(live, 1)
    edit(client, "webbings", int(webbing.key), {"notes": "An admin's correction"})
    post(client, [item(webbing, notes="The maker's text")])
    assert live.get("webbings", webbing.key).data["notes"] == "The maker's text"
    records = client.get("/changes", params={"target_type": "item", "target_id": f"webbings#{webbing.key}"}).json()
    assert [r["channel"] for r in records] == ["manufacturer-api", "web"]


def test_photo_links_leave_a_to_do_for_the_admin(client, live):
    [webbing] = bc_webbings(live, 1)
    response = post(client, [{**item(webbing, notes="with photos"), "image_urls": ["https://bc.example/a.jpg"]}])
    [result] = response.json()["results"]
    assert result["applied"] is True and result["status"] == "approved"
    [todo] = client.get("/submissions/?status=approved", headers=ADMIN).json()
    assert todo["image_urls"] == ["https://bc.example/a.jpg"]
    assert "added by hand" in todo["review_note"]


def test_another_brands_product_is_still_refused(client, live):
    documents = live.load()
    other = next(
        d for d in documents
        if d.collection == "webbings" and (brand_of(documents, d.data.get("brand")) or (0,))[0] not in (0, BALANCE)
    )
    response = post(client, [item(other, notes="x")])
    assert response.status_code in (403, 404, 422)
    assert live.get("webbings", other.key).data == other.data
