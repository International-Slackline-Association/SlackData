"""
"I represent this brand" — phase 5 (LIVE_EDITING_PHASE_5.md, D5).

What must hold:

- **Anyone signed in may ask; only an admin decides.**
- **The domain signal is shown, never decisive**, and counts a verified
  address only.
- **Approving links the person** — and the link is in the public log, with
  the brand named; the request itself is not.
- **One pending request per brand**, none for a brand already represented.
- **Unlinking takes the rights away** on the next request, with a reason.
"""

import pytest

from slack_data.models.brand_requests import email_domain_matches
from tests.test_edits import ADMIN, store, stored  # noqa: F401 - the store fixture

MAKER = {"Authorization": "Bearer dev-person-token:Maker"}
BALANCE = 3


@pytest.fixture
def catalogue(store, monkeypatch):
    """The brand lookups read what a page would: here, the test store."""
    from slack_data.api.routers import catalogue_router

    monkeypatch.setattr(catalogue_router, "_documents", lambda: (store.load(), store.version(), "store (shadow)"))
    return store


def ask(client, catalog_id=BALANCE, note="We make it"):
    return client.post("/me/brand-requests", headers=MAKER, json={"catalog_id": catalog_id, "note": note})


def queue(client):
    response = client.get("/admin/brand-requests", headers=ADMIN)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(
    "email, verified, website, matches",
    [
        ("anna@balancecommunity.com", True, "http://www.balancecommunity.com", True),
        ("anna@shop.gibbon.com", True, "https://gibbon.com/en", True),
        ("anna@balancecommunity.com", False, "http://www.balancecommunity.com", False),
        ("anna@gmail.com", True, "http://www.balancecommunity.com", False),
        ("anna@balancecommunity.com", True, None, False),
    ],
)
def test_the_domain_signal(email, verified, website, matches):
    assert email_domain_matches(email, verified, website) is matches


def test_a_person_asks_and_an_admin_sees_it_with_the_signal(client, catalogue):
    response = ask(client)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["brand_name"] == "Balance Community"
    [row] = queue(client)
    assert row["isa_id"].startswith("ISA_DEV")
    assert row["email_domain"] == "localhost", "the domain, never the address"
    assert "email" not in row
    assert row["email_domain_matches"] is False
    assert row["brand_website"] == "http://www.balancecommunity.com"


def test_only_an_admin_sees_the_queue_and_decides(client, catalogue):
    request_id = ask(client).json()["request_id"]
    assert client.get("/admin/brand-requests", headers=MAKER).status_code == 403
    assert client.post(f"/admin/brand-requests/{request_id}/approve", headers=MAKER, json={}).status_code == 403


def test_approving_links_the_person_and_logs_it(client, catalogue):
    request_id = ask(client).json()["request_id"]
    response = client.post(f"/admin/brand-requests/{request_id}/approve", headers=ADMIN, json={"note": "Known to us"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"

    me = client.get("/me", headers=MAKER).json()
    assert me["brands"] == [{"catalog_id": BALANCE, "name": "Balance Community"}]
    [record] = client.get("/changes", params={"target_type": "person", "target_id": me["isa_id"]}).json()
    assert record["action"] == "brand.link"
    assert record["changes"]["brand"] == {"before": None, "after": "Balance Community"}
    assert record["why"] == "Known to us"
    assert queue(client) == []
    assert client.get("/me/brand-requests", headers=MAKER).json()[0]["status"] == "approved"


def test_a_decision_is_made_once(client, catalogue):
    request_id = ask(client).json()["request_id"]
    client.post(f"/admin/brand-requests/{request_id}/decline", headers=ADMIN, json={"note": "Not the maker"})
    assert client.post(f"/admin/brand-requests/{request_id}/approve", headers=ADMIN, json={}).status_code == 409
    assert client.get("/me", headers=MAKER).json()["brands"] == []


def test_declining_links_nothing_and_logs_nothing(client, catalogue):
    request_id = ask(client).json()["request_id"]
    response = client.post(f"/admin/brand-requests/{request_id}/decline", headers=ADMIN, json={"note": "Not the maker"})
    assert response.json()["decision_note"] == "Not the maker"
    assert client.get("/changes").json() == []


def test_one_pending_request_per_brand_and_none_once_linked(client, catalogue):
    request_id = ask(client).json()["request_id"]
    assert ask(client).status_code == 409
    client.post(f"/admin/brand-requests/{request_id}/approve", headers=ADMIN, json={})
    assert ask(client).status_code == 409


def test_a_brand_that_does_not_exist_is_404(client, catalogue):
    assert ask(client, catalog_id=99999).status_code == 404


def test_asking_needs_a_sign_in(client, catalogue):
    assert client.post("/me/brand-requests", json={"catalog_id": BALANCE}).status_code == 401


def test_unlinking_takes_the_rights_away(client, catalogue):
    request_id = ask(client).json()["request_id"]
    client.post(f"/admin/brand-requests/{request_id}/approve", headers=ADMIN, json={})
    me = client.get("/me", headers=MAKER).json()
    item = next(
        int(d.key) for d in catalogue.load()
        if d.collection == "webbings" and d.data.get("brand") == "Balance Community"
    )
    rev = stored(client, "webbings", item)["rev"]
    assert client.patch(f"/edit/webbings/{item}", headers=MAKER, json={"rev": rev, "changes": {"notes": "a"}}).status_code == 200

    assert client.post(f"/admin/people/{me['isa_id']}/brands/{BALANCE}/unlink", headers=ADMIN, json={"why": ""}).status_code == 422
    response = client.post(f"/admin/people/{me['isa_id']}/brands/{BALANCE}/unlink", headers=ADMIN, json={"why": "Left the company"})
    assert response.status_code == 204
    rev = stored(client, "webbings", item)["rev"]
    assert client.patch(f"/edit/webbings/{item}", headers=MAKER, json={"rev": rev, "changes": {"notes": "b"}}).status_code == 403
    actions = [r["action"] for r in client.get("/changes", params={"target_type": "person", "target_id": me["isa_id"]}).json()]
    assert actions == ["brand.unlink", "brand.link"]
