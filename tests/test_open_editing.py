"""
Editing for every ISA account — phase 6 (LIVE_EDITING_PHASE_6.md).

What must hold:

- **Anyone signed in edits**, once they have acknowledged the first-sign-in
  notice (P6-B) — the API refuses a save before, so no name is published
  with a change its owner was not told about.
- **The rate cap** (D53, P6-C): no more than 20 counted saves in any 60
  minutes and 100 in any 24 hours; a refused save writes nothing and says
  when the next one is possible. Admins, and a manufacturer on their own
  brand's gear, are not counted. A save that changes nothing costs nothing.
- **Blocking** (D22, P6-D): an admin blocks with a reason, logged publicly;
  the account cannot save, upload or ask for a brand; an admin cannot be
  blocked; unblocking restores it.
"""

import pytest

from slack_data.catalogue.repository import InMemoryCatalogueRepository, Put
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.changelog.writer import commit_catalogue_change
from slack_data.people import ratecap
from slack_data.people.ratecap import DAY, HOUR, CapRace, RateCap
from tests.test_edits import ADMIN, people, store, stored  # noqa: F401 - fixtures

EDITOR = {"Authorization": "Bearer dev-person-token:Editor"}
MAKER = {"Authorization": "Bearer dev-person-token:Maker"}
BALANCE = 3
NOW = 1_800_000_000


@pytest.fixture
def clock(monkeypatch):
    moment = {"now": NOW}
    monkeypatch.setattr(ratecap, "now", lambda: moment["now"])
    return moment


def save(client, headers, item_id=1, notes=None, slug="grips"):
    rev = stored(client, slug, item_id)["rev"]
    return client.patch(
        f"/edit/{slug}/{item_id}", headers=headers, json={"rev": rev, "changes": {"notes": notes or f"note {rev}"}}
    )


def person(client, people, headers):
    return people.get(client.get("/me", headers=headers).json()["sub"])


# --- Everyone edits, once told ---------------------------------------------------


def test_an_ordinary_account_edits_labelled_editor(client, store):
    response = save(client, EDITOR)
    assert response.status_code == 200, response.text
    [record] = client.get("/changes").json()
    assert record["actor_role"] == "editor"


def test_no_save_before_the_notice_is_acknowledged(client, store, people):
    unseen = person(client, people, EDITOR)
    people.put(unseen.model_copy(update={"notice_seen_at": None}))
    refused = save(client, EDITOR)
    assert refused.status_code == 403
    assert "notice" in refused.text
    client.post("/me/notice", headers=EDITOR, json={"name": "Ed Itor"})
    assert save(client, EDITOR).status_code == 200


def test_an_editor_creates_brands_and_products(client, store):
    brand = client.post("/edit/brand", headers=EDITOR, json={"name": "Tiny Maker", "fields": {"country": "FR"}})
    assert brand.status_code == 201, brand.text
    fields = {"name": "Tiny Grip", "brand": "Tiny Maker", "material": "Aluminum", "width_min": 25}
    assert client.post("/edit/grips", headers=EDITOR, json={"fields": fields}).status_code == 201


def test_an_editor_never_changes_who_makes_a_product(client, store):
    rev = stored(client, "grips", 1)["rev"]
    response = client.patch("/edit/grips/1", headers=EDITOR, json={"rev": rev, "changes": {"brand": "Gibbon"}})
    assert response.status_code == 403


def test_an_editor_does_not_revert_or_merge(client, store):
    edited = save(client, ADMIN).json()
    assert client.post(f"/edit/revert/{edited['records'][0]}", headers=EDITOR, json={}).status_code == 403
    merge = client.post(
        "/edit/grips/1/merge", headers=EDITOR, json={"rev": edited["rev"], "into": 2, "why": "x" * 40}
    )
    assert merge.status_code == 403


# --- The rate cap -------------------------------------------------------------------


def test_the_twenty_first_save_in_an_hour_is_refused_and_writes_nothing(client, store, clock):
    for n in range(20):
        clock["now"] = NOW + n * 60
        assert save(client, EDITOR).status_code == 200, n
    before = stored(client, "grips", 1)
    refused = save(client, EDITOR, notes="one too many")
    assert refused.status_code == 429
    detail = refused.json()["detail"]
    assert detail["limit"] == 20
    assert detail["retry_at"] == ratecap.iso(NOW + HOUR), "when the first of the twenty leaves the hour"
    assert stored(client, "grips", 1) == before
    assert len(client.get("/changes", params={"limit": 100}).json()) == 20


def test_the_window_slides(client, store, people, clock):
    me = person(client, people, EDITOR)
    people.put(me.model_copy(update={"saves": [NOW - HOUR - 1] * 20}))
    assert save(client, EDITOR).status_code == 200, "saves over an hour old leave the hourly window"


def test_the_hundredth_save_in_a_day(client, store, people, clock):
    me = person(client, people, EDITOR)
    spread = [NOW - 23 * HOUR + n * 60 for n in range(100)]  # all over an hour old
    people.put(me.model_copy(update={"saves": spread}))
    refused = save(client, EDITOR)
    assert refused.status_code == 429
    assert refused.json()["detail"]["retry_at"] == ratecap.iso(spread[0] + DAY)


def test_the_count_is_kept_on_the_person(client, store, people, clock):
    save(client, EDITOR)
    me = person(client, people, EDITOR)
    assert (me.saves, me.saves_rev) == ([NOW], 1)


def test_a_save_that_changes_nothing_costs_nothing(client, store, people, clock):
    save(client, EDITOR, notes="same")
    save(client, EDITOR, notes="same")
    assert person(client, people, EDITOR).saves == [NOW]


def test_admins_are_not_counted(client, store, people, clock):
    for _ in range(25):
        assert save(client, ADMIN).status_code == 200
    assert person(client, people, ADMIN).saves == []


def test_a_manufacturer_is_not_counted_on_their_own_gear_only(client, store, people, clock):
    from slack_data.catalogue.rights import brand_of

    me = person(client, people, MAKER)
    people.put(me.model_copy(update={"brands": [BALANCE], "saves": [NOW - 60] * 20}))
    documents = store.load()
    own = next(
        int(d.key) for d in documents
        if d.collection == "webbings" and (brand_of(documents, d.data.get("brand")) or (0,))[0] == BALANCE
        and not d.data.get("merged_into")
    )
    assert save(client, MAKER, own, slug="webbings").status_code == 200
    assert save(client, MAKER, 1).status_code == 429, "another brand's grip counts"


def test_a_media_save_at_the_cap_is_refused_before_anything_is_published(client, store, people, clock):
    me = person(client, people, EDITOR)
    people.put(me.model_copy(update={"saves": [NOW - 60] * 20}))
    rev = stored(client, "grips", 1)["rev"]
    response = client.put("/edit/grips/1/media", headers=EDITOR, json={"rev": rev, "photos": []})
    assert response.status_code == 429


def test_a_parallel_save_that_took_the_count_cancels_this_one():
    """Two saves read the same count; the second to commit writes nothing."""
    from slack_data.catalogue.documents import Document
    from slack_data.models.changes import (
        Action,
        ChangeRecord,
        Channel,
        FieldChange,
        TargetType,
    )
    from slack_data.models.people import Person
    from slack_data.people.repository import InMemoryPeopleRepository

    people_store = InMemoryPeopleRepository()
    read = people_store.put(Person(sub="s", isa_id="ISA_00000001"))
    catalogue = InMemoryCatalogueRepository()
    catalogue.put_many([Document(collection="grips", key="1", data={"id": 1, "name": "A"})])
    log = InMemoryChangeLogRepository()
    people_store.put(read.model_copy(update={"saves": [NOW], "saves_rev": 1}))  # the other save
    record = ChangeRecord(
        target_type=TargetType.ITEM, target_id="grips#1", action=Action.ITEM_EDIT, actor_sub="s",
        actor_isa_id="ISA_00000001", actor_role="editor", channel=Channel.WEB,
        changes={"name": FieldChange(before="A", after="B")},
    )
    put = Put(Document(collection="grips", key="1", data={"id": 1, "name": "B"}, rev=2), 1)
    with pytest.raises(CapRace):
        commit_catalogue_change(catalogue, log, [put], [], [record], RateCap(people_store, read))
    assert catalogue.get("grips", "1").data["name"] == "A"
    assert log.recent(10) == []


# --- Blocking -------------------------------------------------------------------------


def block(client, isa_id, why="Vandalised twenty products"):
    return client.post(f"/admin/people/{isa_id}/block", headers=ADMIN, json={"why": why})


def test_a_blocked_account_saves_nothing_and_is_told_why(client, store, people):
    isa_id = client.get("/me", headers=EDITOR).json()["isa_id"]
    response = block(client, isa_id)
    assert response.status_code == 200, response.text
    refused = save(client, EDITOR)
    assert refused.status_code == 403
    assert refused.json()["detail"]["blocked_reason"] == "Vandalised twenty products"
    upload = {"files": [{"purpose": "photo", "content_type": "image/webp", "size": 10}]}
    assert client.post("/edit/media/uploads", headers=EDITOR, json=upload).status_code == 403
    assert client.post("/me/brand-requests", headers=EDITOR, json={"catalog_id": BALANCE}).status_code == 403
    me = client.get("/me", headers=EDITOR).json()
    assert me["blocked_reason"] == "Vandalised twenty products", "they still sign in, and see why"


def test_a_block_is_in_the_public_log_and_the_admin_list(client, store):
    isa_id = client.get("/me", headers=EDITOR).json()["isa_id"]
    block(client, isa_id)
    [record] = client.get("/changes", params={"target_type": "person", "target_id": isa_id}).json()
    assert (record["action"], record["why"]) == ("person.block", "Vandalised twenty products")
    [listed] = client.get("/admin/people/blocked", headers=ADMIN).json()
    assert listed["isa_id"] == isa_id and listed["blocked_by"] == "ISA_DEVADMIN"


def test_unblocking_restores_editing(client, store):
    isa_id = client.get("/me", headers=EDITOR).json()["isa_id"]
    block(client, isa_id)
    assert client.post(f"/admin/people/{isa_id}/unblock", headers=ADMIN, json={"why": "Apologised"}).status_code == 200
    assert save(client, EDITOR).status_code == 200
    assert client.get("/admin/people/blocked", headers=ADMIN).json() == []


def test_a_block_needs_a_reason_an_admin_and_a_non_admin(client, store):
    isa_id = client.get("/me", headers=EDITOR).json()["isa_id"]
    assert block(client, isa_id, why="  ").status_code == 422
    assert client.post(f"/admin/people/{isa_id}/block", headers=EDITOR, json={"why": "x"}).status_code == 403
    admin_id = client.get("/me", headers=ADMIN).json()["isa_id"]
    assert block(client, admin_id).status_code == 409
    assert block(client, "ISA_NOBODY00").status_code == 404
