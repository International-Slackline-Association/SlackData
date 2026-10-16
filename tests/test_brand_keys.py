"""
A brand's API keys, managed on the site by its manufacturers — phase 5 (D64).

What must hold:

- **Only the brand's manufacturers and admins** see or change its keys.
- **A key made here works** at once against the API, as `<client_id>:<secret>`.
- **Regenerating** gives the same client id a new secret, and the old one stops.
- **Revoking** stops the key.
- **Every action is in the public log, and no secret ever is.**
"""

import pytest
from fastapi import HTTPException

from slack_data.api import auth
from tests.test_brand_requests import BALANCE, MAKER, catalogue  # noqa: F401 - fixtures
from tests.test_edits import ADMIN, people, store  # noqa: F401 - fixtures

OTHER = {"Authorization": "Bearer dev-person-token:Other"}


@pytest.fixture
def maker(client, people, catalogue):
    me = client.get("/me", headers=MAKER).json()
    people.put(people.get(me["sub"]).model_copy(update={"brands": [BALANCE]}))
    return me


def keys_url(catalog_id=BALANCE):
    return f"/me/brands/{catalog_id}/keys"


def test_a_manufacturer_makes_a_key_that_works(client, brand_clients, maker):
    response = client.post(keys_url(), headers=MAKER, json={"note": "our ERP"})
    assert response.status_code == 201, response.text
    key = response.json()
    assert key["active"] and key["note"] == "our ERP"
    assert key["key"].startswith(f"{key['client_id']}:")
    assert auth.verify_api_key(key["key"], brand_clients) == key["client_id"]
    stored = brand_clients.get(key["client_id"])
    assert (stored.brand_id, stored.brand_name) == (BALANCE, "Balance Community")
    assert [k["client_id"] for k in client.get(keys_url(), headers=MAKER).json()] == [key["client_id"]]


def test_regenerating_replaces_the_secret(client, brand_clients, maker):
    old = client.post(keys_url(), headers=MAKER, json={}).json()
    new = client.post(f"{keys_url()}/{old['client_id']}/regenerate", headers=MAKER).json()
    assert new["client_id"] == old["client_id"] and new["key"] != old["key"]
    assert auth.verify_api_key(new["key"], brand_clients) == new["client_id"]
    with pytest.raises(HTTPException):
        auth.verify_api_key(old["key"], brand_clients)


def test_revoking_stops_the_key(client, brand_clients, maker):
    key = client.post(keys_url(), headers=MAKER, json={}).json()
    revoked = client.post(f"{keys_url()}/{key['client_id']}/revoke", headers=MAKER).json()
    assert revoked["active"] is False
    # The secret still matches; a revoked key is refused when it is resolved
    # to its brand — the path every manufacturer request takes.
    client_id = auth.verify_api_key(key["key"], brand_clients)
    with pytest.raises(HTTPException):
        auth._resolve_brand(client_id, brand_clients)


def test_another_brand_and_strangers_are_refused(client, maker, people):
    assert client.get(keys_url(23), headers=MAKER).status_code == 403
    client.get("/me", headers=OTHER)
    assert client.get(keys_url(), headers=OTHER).status_code == 403
    assert client.post(keys_url(), headers=OTHER, json={}).status_code == 403
    assert client.get(keys_url()).status_code == 401


def test_a_key_of_another_brand_cannot_be_reached_through_this_one(client, brand_clients, maker):
    theirs = client.post(keys_url(23), headers=ADMIN, json={}).json()
    response = client.post(f"{keys_url()}/{theirs['client_id']}/revoke", headers=MAKER)
    assert response.status_code == 404
    assert brand_clients.get(theirs["client_id"]).active


def test_an_admin_manages_any_brands_keys(client, catalogue):
    assert client.post(keys_url(23), headers=ADMIN, json={}).status_code == 201


def test_every_action_is_logged_and_no_secret_is(client, maker):
    key = client.post(keys_url(), headers=MAKER, json={}).json()
    client.post(f"{keys_url()}/{key['client_id']}/regenerate", headers=MAKER)
    client.post(f"{keys_url()}/{key['client_id']}/revoke", headers=MAKER)
    records = client.get("/changes", params={"target_type": "brand", "target_id": str(BALANCE)}).json()
    assert [r["action"] for r in records] == ["key.revoke", "key.regenerate", "key.create"]
    assert {r["actor_role"] for r in records} == {"manufacturer for Balance Community"}
    secret = key["key"].split(":", 1)[1]
    assert secret not in str(records)
