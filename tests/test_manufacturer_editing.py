"""
Manufacturers editing their own gear — phase 5 (LIVE_EDITING_PHASE_5.md).

A person with brand links (`Person.brands`) may change the products whose
maker is one of their brands, and those brands' own entries — and nothing else
yet (P5-C). What must hold:

- **Their own, and only their own**: another brand's product or entry is 403,
  and so is a product co-listed by their brand (D38).
- **Never who makes it** (P5-D): `brand` and `gear_sellers` stay admin-only,
  and a new product must be one of their brands'.
- **Labelled "manufacturer for <brand>"** in the log (P5-E), "admin" for an admin.
- **Revert on their own gear** (D58); merges and new brands stay admin-only.
- **Everyone else** is turned away at the door until phase 6.
"""

import pytest

from slack_data.catalogue.rights import brand_of
from tests.test_edits import ADMIN, edit, store, stored  # noqa: F401 - the store fixture

MAKER = {"Authorization": "Bearer dev-person-token:Maker"}
NOBODY = {"Authorization": "Bearer dev-person-token:Nobody"}
BALANCE = 3  # Balance Community's catalog_id


def link(client, people, headers, *catalog_ids):
    """Sign the dev person in once (creating them), then link their brands."""
    me = client.get("/me", headers=headers).json()
    person = people.get(me["sub"])
    people.put(person.model_copy(update={"brands": list(catalog_ids)}))
    return me


def own_item(store, catalog_id=BALANCE, collection="webbings"):
    """A listed product of that brand, by its maker."""
    documents = store.load()
    for document in documents:
        if document.collection == collection and document.key != "_envelope" and not document.data.get("merged_into"):
            brand = brand_of(documents, document.data.get("brand"))
            if brand and brand[0] == catalog_id:
                return int(document.key)
    raise AssertionError(f"no {collection} of brand {catalog_id}")


def other_item(store, catalog_id=BALANCE, collection="webbings"):
    documents = store.load()
    for document in documents:
        if document.collection == collection and document.key != "_envelope" and not document.data.get("merged_into"):
            brand = brand_of(documents, document.data.get("brand"))
            if brand and brand[0] != catalog_id:
                return int(document.key)
    raise AssertionError("no other brand's item")


def as_(client, headers, slug, item_id, changes, why=None):
    rev = stored(client, slug, item_id)["rev"]
    return client.patch(f"/edit/{slug}/{item_id}", headers=headers, json={"rev": rev, "changes": changes, "why": why})


@pytest.fixture
def maker(client, people, store):
    return link(client, people, MAKER, BALANCE)


def test_me_lists_the_brands_a_person_represents(client, maker):
    assert client.get("/me", headers=MAKER).json()["brands"] == [{"catalog_id": BALANCE, "name": "Balance Community"}]


def test_a_manufacturer_edits_their_own_product_labelled_as_such(client, store, maker):
    item_id = own_item(store)
    response = as_(client, MAKER, "webbings", item_id, {"notes": "Checked by the maker"}, why="our spec sheet")
    assert response.status_code == 200, response.text
    [record] = client.get("/changes", params={"target_type": "item", "target_id": f"webbings#{item_id}"}).json()
    assert record["actor_role"] == "manufacturer for Balance Community"


def test_another_brands_product_is_not_theirs(client, store, maker):
    response = as_(client, MAKER, "webbings", other_item(store), {"notes": "x"})
    assert response.status_code == 403
    assert "your own brands" in response.json()["detail"]["message"]


def test_a_product_their_brand_only_sells_is_not_theirs(client, store, people):
    """D38: co-listing gives no rights. Spider Slacklines sells Slack Inov's range."""
    documents = store.load()
    spider = brand_of(documents, "Spider Slacklines")
    item = next(
        d for d in documents
        if d.collection == "webbings" and "Spider Slacklines" in (d.data.get("gear_sellers") or [])
        and brand_of(documents, d.data.get("brand"))[0] != spider[0]
    )
    link(client, people, MAKER, spider[0])
    assert as_(client, MAKER, "webbings", int(item.key), {"notes": "x"}).status_code == 403


@pytest.mark.parametrize("field, value", [("brand", "Gibbon"), ("gear_sellers", ["Gibbon"])])
def test_who_makes_and_sells_it_stays_with_admins(client, store, maker, field, value):
    response = as_(client, MAKER, "webbings", own_item(store), {field: value})
    assert response.status_code == 403
    assert response.json()["detail"]["errors"][0]["field"] == field


def test_an_admin_still_changes_anything_and_is_labelled_admin(client, store, people):
    me = client.get("/me", headers=ADMIN).json()
    people.put(people.get(me["sub"]).model_copy(update={"brands": [BALANCE]}))
    item_id = own_item(store)
    assert as_(client, ADMIN, "webbings", item_id, {"notes": "x"}).status_code == 200
    [record] = client.get("/changes", params={"target_type": "item", "target_id": f"webbings#{item_id}"}).json()
    assert record["actor_role"] == "admin", "an admin's change reads as an admin's (P5-E)"


def test_a_manufacturer_adds_products_of_their_own_brand_only(client, store, maker):
    fields = {"name": "Brand New Line", "brand": "Balance Community", "width": 25, "material": ["Polyester"]}
    created = client.post("/edit/webbings", headers=MAKER, json={"fields": fields})
    assert created.status_code == 201, created.text
    other = client.post("/edit/webbings", headers=MAKER, json={"fields": {**fields, "brand": "Gibbon"}})
    assert other.status_code == 403


def test_merging_and_new_brands_stay_with_admins(client, store, maker):
    item_id = own_item(store)
    rev = stored(client, "webbings", item_id)["rev"]
    merge = client.post(
        f"/edit/webbings/{item_id}/merge", headers=MAKER,
        json={"rev": rev, "into": own_item(store, collection="webbings"), "why": "x" * 40},
    )
    assert merge.status_code == 403
    assert client.post("/edit/brand", headers=MAKER, json={"name": "Maker Two"}).status_code == 403


def test_a_manufacturer_edits_their_own_brand_entry_only(client, store, maker):
    rev = client.get(f"/edit/brand/{BALANCE}", headers=MAKER).json()["rev"]
    ok = client.patch(f"/edit/brand/{BALANCE}", headers=MAKER, json={"rev": rev, "changes": {"instagram": "https://instagram.com/bc"}})
    assert ok.status_code == 200, ok.text
    gibbon = brand_of(store.load(), "Gibbon")[0]
    rev = client.get(f"/edit/brand/{gibbon}", headers=MAKER).json()["rev"]
    refused = client.patch(f"/edit/brand/{gibbon}", headers=MAKER, json={"rev": rev, "changes": {"instagram": "x"}})
    assert refused.status_code == 403


def test_a_manufacturer_reverts_on_their_own_gear(client, store, maker):
    item_id = own_item(store)
    edited = edit(client, "webbings", item_id, {"notes": "an admin's guess"}).json()
    response = client.post(f"/edit/revert/{edited['records'][0]}", headers=MAKER, json={"why": "not right"})
    assert response.status_code == 200, response.text

    other = other_item(store)
    edited = edit(client, "webbings", other, {"notes": "x"}).json()
    assert client.post(f"/edit/revert/{edited['records'][0]}", headers=MAKER, json={}).status_code == 403


def test_without_a_brand_there_is_no_editing_yet(client, store, people):
    client.get("/me", headers=NOBODY)
    assert as_(client, NOBODY, "webbings", own_item(store), {"notes": "x"}).status_code == 403
    body = {"files": [{"purpose": "photo", "content_type": "image/webp", "size": 10}]}
    assert client.post("/edit/media/uploads", headers=NOBODY, json=body).status_code == 403


def test_the_dev_person_token_is_refused_hosted(client, monkeypatch):
    monkeypatch.setenv("SLACKDATA_DEPLOYMENT", "hosted")
    assert client.get("/me", headers=MAKER).status_code in (401, 503)


def test_a_product_missing_a_required_list_is_a_422_not_a_500(client, store):
    """WebbingCreate requires `material`; the table does not. Found writing
    the test above: the create answered 500."""
    response = client.post("/edit/webbings", headers=ADMIN, json={"fields": {"name": "No Material", "brand": "Gibbon"}})
    assert response.status_code == 422
    assert "material" in {e["field"] for e in response.json()["detail"]["errors"]}
