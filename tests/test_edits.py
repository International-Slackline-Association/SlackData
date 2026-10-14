"""
Live editing over HTTP — phase 3 (LIVE_EDITING_PHASE_3.md § 5.5).

Against an in-memory catalogue store filled from the real seeds, so the ISA
cases are real recalls and certificates. What must hold:

- **Admins only**, and nothing without the store.
- **An edit is validated as the loader will read it**, and stored normalised.
- **A rename keeps the product's ISA warning and certificate** — the hazard
  found while planning (§ 3, hazard 2): the loaders verify `"<brand> <name>"`.
- **Every change is in the public log**, with the safety flag on MBS fields.
- **A stale edit is refused with the current entry** (D27).
- **Hide, merge and revert** behave as § 5 says.
"""

import contextlib
import io

import pytest
from sqlmodel import Session

from slack_data.api import auth
from slack_data.api.routers.edit_router import editable_store
from slack_data.catalogue.build import build_engine, sources_from_documents
from slack_data.catalogue.importer import documents_from_files
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.models.isa_gear_warnings import (
    ISAGearWarning,  # noqa: F401 - registers the table
)
from slack_data.models.webbing import Webbing

ADMIN = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}

_DOCUMENTS = None


def _seed_documents():
    global _DOCUMENTS
    if _DOCUMENTS is None:
        _DOCUMENTS = documents_from_files()
    return [d.model_copy(deep=True) for d in _DOCUMENTS]


@pytest.fixture
def store(client):
    repository = InMemoryCatalogueRepository()
    repository.put_many(_seed_documents())
    client.app.dependency_overrides[editable_store] = lambda: repository
    return repository


def stored(client, slug, item_id):
    response = client.get(f"/edit/{slug}/{item_id}", headers=ADMIN)
    assert response.status_code == 200, response.text
    return response.json()


def edit(client, slug, item_id, changes, rev=None, why=None):
    if rev is None:
        rev = stored(client, slug, item_id)["rev"]
    return client.patch(f"/edit/{slug}/{item_id}", headers=ADMIN, json={"rev": rev, "changes": changes, "why": why})


def built(store):
    with contextlib.redirect_stdout(io.StringIO()):
        return build_engine(sources_from_documents(store.load()))


def warned_webbing(store) -> tuple[int, str]:
    """A webbing with an exact ISA warning match, as the seeds hold it."""
    for document in store.load():
        if document.collection != "isa_gear_warnings" or document.key == "_envelope":
            continue
        match = document.data.get("match") or {}
        if match.get("gearType") == "webbing" and match.get("gearIds") and match.get("confidence") == "exact":
            return match["gearIds"][0], document.key
    raise AssertionError("no warned webbing in the seeds")


# --- Who may edit -----------------------------------------------------------------


def test_editing_needs_a_sign_in(client, store):
    assert client.patch("/edit/grips/1", json={"rev": 1, "changes": {"price": 1}}).status_code == 401


def test_editing_needs_an_admin(client, store, people, isa):
    token = isa()
    client.get("/me", headers={"Authorization": f"Bearer {token}"})
    response = client.patch("/edit/grips/1", headers={"Authorization": f"Bearer {token}"}, json={"rev": 1, "changes": {"price": 1}})
    assert response.status_code == 403


def test_without_the_store_there_is_nothing_to_edit(client, monkeypatch):
    monkeypatch.delenv("CATALOG_SOURCE", raising=False)
    assert client.get("/edit/grips/1", headers=ADMIN).status_code == 503


# --- Editing ------------------------------------------------------------------------


def test_an_edit_is_stored_normalised_and_logged(client, store):
    response = edit(client, "grips", 1, {"price": "199.5", "notes": "Checked 2026"}, why="new price list")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["entry"]["price"] == 199.5, "validated as the loader reads it, then stored"
    assert body["entry"]["notes"] == "Checked 2026"
    [record] = client.get("/changes", params={"target_type": "item", "target_id": "grips#1"}).json()
    assert record["changes"]["price"]["after"] == 199.5
    assert (record["why"], record["actor_role"], record["flags"]) == ("new price list", "admin", [])


def test_null_clears_a_field(client, store):
    assert stored(client, "grips", 1)["entry"].get("product_url")
    body = edit(client, "grips", 1, {"product_url": None}).json()
    assert "product_url" not in body["entry"]


def test_an_invalid_value_is_refused_with_the_field(client, store):
    response = edit(client, "grips", 1, {"connection_type": "Glue"})
    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["field"] == "connection_type"


@pytest.mark.parametrize("field", ["isa_warning", "isa_certified", "id", "hidden", "merged_into", "unmodelled"])
def test_derived_and_envelope_fields_are_not_editable(client, store, field):
    assert edit(client, "grips", 1, {field: "x"}).status_code == 422


def test_an_unknown_brand_is_refused(client, store):
    response = edit(client, "grips", 1, {"brand": "Nobody Slacklines"})
    assert response.status_code == 422


def test_an_mbs_edit_is_flagged_safety(client, store):
    edit(client, "grips", 1, {"mbs": 46})
    [record] = client.get("/changes", params={"flag": "safety"}).json()
    assert record["target_id"] == "grips#1"


def test_nothing_changed_writes_nothing(client, store):
    current = stored(client, "grips", 1)
    body = edit(client, "grips", 1, {"mbs": current["entry"]["mbs"]}).json()
    assert body["records"] == [] and body["rev"] == current["rev"]


def test_a_stale_edit_is_refused_with_the_current_entry(client, store):
    rev = stored(client, "grips", 1)["rev"]
    edit(client, "grips", 1, {"price": 1}, rev=rev)
    response = edit(client, "grips", 1, {"price": 2}, rev=rev)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["current"]["price"] == 1.0 and detail["rev"] == rev + 1


def test_an_edit_is_served_by_the_next_build(client, store):
    edit(client, "webbings", 1, {"name": "Core 2 HS (renamed)"})
    with Session(built(store)) as session:
        assert session.get(Webbing, 1).name == "Core 2 HS (renamed)"


# --- The rename hazard (§ 3, hazard 2) ------------------------------------------------


def test_renaming_a_recalled_product_keeps_its_warning(client, store):
    webbing_id, warning_key = warned_webbing(store)
    with Session(built(store)) as session:
        assert session.get(Webbing, webbing_id).isa_warning is not None
    response = edit(client, "webbings", webbing_id, {"name": "Renamed By An Admin"})
    assert response.status_code == 200, response.text
    with Session(built(store)) as session:
        assert session.get(Webbing, webbing_id).isa_warning is not None, "the recall fell off on rename"
    history = client.get("/changes", params={"target_type": "isa_warning", "target_id": warning_key}).json()
    assert history[0]["action"] == "match.repoint"


def test_renaming_a_certified_product_keeps_its_certificate(client, store):
    with Session(built(store)) as session:
        certified = session.exec(
            __import__("sqlmodel").select(Webbing).where(Webbing.isa_certified == True)
        ).first()
        webbing_id = certified.id
    edit(client, "webbings", webbing_id, {"name": "Renamed Certified Webbing"})
    with Session(built(store)) as session:
        assert session.get(Webbing, webbing_id).isa_certified is True


# --- Create ---------------------------------------------------------------------------


def test_create_takes_the_next_id_and_is_built(client, store):
    response = client.post(
        "/edit/grips", headers=ADMIN,
        json={"fields": {"name": "Brand New Grip", "brand": "Gibbon", "material": "Aluminum", "width_min": 25}},
    )
    assert response.status_code == 201, response.text
    new_id = int(response.json()["key"])
    from slack_data.models.grips import Grip

    with Session(built(store)) as session:
        assert session.get(Grip, new_id).name == "Brand New Grip"
    second = client.post(
        "/edit/grips", headers=ADMIN,
        json={"fields": {"name": "Another Grip", "brand": "Gibbon", "material": "Aluminum", "width_min": 25}},
    )
    assert int(second.json()["key"]) == new_id + 1


# --- Hide, merge ----------------------------------------------------------------------


def test_hide_needs_a_reason_and_takes_the_item_out(client, store):
    rev = stored(client, "grips", 2)["rev"]
    assert client.post("/edit/grips/2/hide", headers=ADMIN, json={"rev": rev, "why": " "}).status_code == 422
    assert client.post("/edit/grips/2/hide", headers=ADMIN, json={"rev": rev, "why": "spam entry"}).status_code == 200
    from slack_data.models.grips import Grip

    with Session(built(store)) as session:
        assert session.get(Grip, 2) is None
    rev = stored(client, "grips", 2)["rev"]
    assert client.post("/edit/grips/2/unhide", headers=ADMIN, json={"rev": rev}).status_code == 200
    with Session(built(store)) as session:
        assert session.get(Grip, 2) is not None


def test_a_merge_needs_a_detailed_reason(client, store):
    rev = stored(client, "grips", 3)["rev"]
    response = client.post("/edit/grips/3/merge", headers=ADMIN, json={"rev": rev, "into": 4, "why": "dupe"})
    assert response.status_code == 422


def test_a_merge_moves_the_recall_to_the_survivor(client, store):
    webbing_id, _ = warned_webbing(store)
    survivor = next(
        int(d.key) for d in store.load()
        if d.collection == "webbings" and d.key != str(webbing_id) and not d.data.get("hidden")
    )
    rev = stored(client, "webbings", webbing_id)["rev"]
    response = client.post(
        f"/edit/webbings/{webbing_id}/merge", headers=ADMIN,
        json={"rev": rev, "into": survivor, "why": "the same webbing sold under two names by one maker"},
    )
    assert response.status_code == 200, response.text
    with Session(built(store)) as session:
        assert session.get(Webbing, webbing_id) is None
        assert session.get(Webbing, survivor).isa_warning is not None
    survivor_history = client.get("/changes", params={"target_type": "item", "target_id": f"webbings#{survivor}"}).json()
    assert survivor_history[0]["action"] == "item.merge"


def test_a_merged_item_cannot_be_edited(client, store):
    rev = stored(client, "grips", 3)["rev"]
    client.post("/edit/grips/3/merge", headers=ADMIN, json={"rev": rev, "into": 4, "why": "x" * 40})
    assert edit(client, "grips", 3, {"price": 1}).status_code == 409


# --- Revert -----------------------------------------------------------------------------


def test_a_revert_restores_and_links_the_record(client, store):
    before = stored(client, "grips", 1)["entry"]["mbs"]
    record_id = edit(client, "grips", 1, {"mbs": 1}).json()["records"][0]
    response = client.post(f"/edit/revert/{record_id}", headers=ADMIN, json={"why": "vandalism"})
    assert response.status_code == 200, response.text
    assert response.json()["entry"]["mbs"] == before
    newest = client.get("/changes").json()[0]
    assert (newest["action"], newest["channel"], newest["reverts"]) == ("item.revert", "revert", record_id)


def test_a_revert_skips_a_field_that_moved_on(client, store):
    record_id = edit(client, "grips", 1, {"mbs": 1, "wll": 2}).json()["records"][0]
    edit(client, "grips", 1, {"wll": 3})
    body = client.post(f"/edit/revert/{record_id}", headers=ADMIN, json={}).json()
    assert body["refused"] == {"wll": 3.0}
    assert body["entry"]["wll"] == 3.0


def test_only_an_edit_can_be_reverted(client, store):
    rev = stored(client, "grips", 2)["rev"]
    record_id = client.post("/edit/grips/2/hide", headers=ADMIN, json={"rev": rev, "why": "x"}).json()["records"][0]
    assert client.post(f"/edit/revert/{record_id}", headers=ADMIN, json={}).status_code == 409


# --- Brands -------------------------------------------------------------------------------


def test_a_brands_fields_are_editable_but_not_its_name(client, store):
    brand = client.get("/edit/brand/23", headers=ADMIN).json()
    assert brand["entry"]["name"] == "Gibbon"
    ok = client.patch("/edit/brand/23", headers=ADMIN, json={"rev": brand["rev"], "changes": {"website": "https://gibbon.example"}})
    assert ok.status_code == 200, ok.text
    refused = client.patch("/edit/brand/23", headers=ADMIN, json={"rev": ok.json()["rev"], "changes": {"name": "Gibbon 2"}})
    assert refused.status_code == 422
    assert client.patch("/edit/brand/23", headers=ADMIN, json={"rev": ok.json()["rev"], "changes": {"country": "XX"}}).status_code == 422


def test_a_new_brand_gets_the_next_catalog_id_and_can_have_products(client, store):
    created = client.post("/edit/brand", headers=ADMIN, json={"name": "Fresh Lines", "fields": {"country": "de"}})
    assert created.status_code == 201, created.text
    entry = created.json()["entry"]
    assert entry["country"] == "DE"
    ids = [d.data.get("catalog_id") for d in store.load() if d.collection == "manufacturers" and d.key != "_envelope"]
    assert entry["catalog_id"] == max(i for i in ids if i != entry["catalog_id"]) + 1
    product = client.post(
        "/edit/grips", headers=ADMIN,
        json={"fields": {"name": "Fresh Grip", "brand": "Fresh Lines", "material": "Aluminum", "width_min": 25}},
    )
    assert product.status_code == 201, product.text
    assert client.post("/edit/brand", headers=ADMIN, json={"name": "Gibbon"}).status_code == 409


# --- What a hidden or merged id answers (P3-D, P3-E) -----------------------------


def test_a_hidden_or_merged_id_says_why_it_is_missing(client, monkeypatch):
    from slack_data.load_data import _seed_io

    entries = [
        {"id": 1, "name": "Shown", "brand": "Gibbon", "material": "Aluminum", "width_min": 25},
        {"id": 2, "name": "Hidden", "brand": "Gibbon", "material": "Aluminum", "width_min": 25, "hidden": True},
        {"id": 3, "name": "Merged", "brand": "Gibbon", "material": "Aluminum", "width_min": 25, "merged_into": 1},
    ]
    real = _seed_io.read_seed_json
    monkeypatch.setattr(_seed_io, "read_seed_json", lambda name: entries if name == "grips.json" else real(name))
    assert client.get("/grip/2").json()["detail"]["hidden"] is True
    assert client.get("/grip/3").json()["detail"]["merged_into"] == 1
    assert client.get("/grip/4").json()["detail"] == "Grip 4 not found"


# --- Feeds (D17, D57) -------------------------------------------------------------


def test_the_feeds_are_public_atom(client, store):
    from xml.etree import ElementTree as ET

    edit(client, "grips", 1, {"mbs": 47}, why="lab retest")
    edit(client, "grips", 1, {"price": 5})
    atom = "{http://www.w3.org/2005/Atom}"
    feed = client.get("/changes/feed.atom")
    assert feed.status_code == 200 and feed.headers["content-type"].startswith("application/atom+xml")
    entries = ET.fromstring(feed.content).findall(f"{atom}entry")
    assert len(entries) == 2
    assert entries[0].find(f"{atom}link").get("href").endswith("/grips/1")
    safety = ET.fromstring(client.get("/changes/safety.atom").content).findall(f"{atom}entry")
    assert len(safety) == 1
    assert "Why: lab retest" in safety[0].find(f"{atom}content").text
