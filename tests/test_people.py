"""
People and the change log over HTTP — live editing, phase 1.

What this phase must prove (LIVE_EDITING_PLAN.md § 13, phase 1):

- **Any ISA account signs in; only a granted admin administers.** The token is
  `test_auth.py`'s job; here it is what a signed-in person may then do.
- **Every role change is logged**, with who did it, and the person and the
  record are written together (`changelog/writer.py`).
- **The log is public** — `GET /changes` needs no sign-in (D3, D33) — and
  shows names looked up now, never stored in a record (D43).
- **Nothing here touches the catalogue**, which is read-only hosted.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from slack_data.api import auth
from slack_data.api.routing import register_routers
from slack_data.changelog.store import get_changelog_repository
from slack_data.database import get_session
from slack_data.models.changes import Action, Channel
from slack_data.models.people import ANONYMISED_NAME, Person, Role, isa_id_for
from slack_data.people.store import get_people_repository

DEV = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def someone(people, n: int, **fields) -> Person:
    """A person who has signed in before, as `isa` tokens with sub person-sub-<n> would."""
    defaults = {
        "sub": f"person-sub-{n}",
        "isa_id": isa_id_for(f"person-username-{n}"),
        "given_name": f"Person{n}",
        "family_name": "Example",
        "email": f"person{n}@example.org",
        "email_verified": True,
    }
    return people.put(Person(**{**defaults, **fields}))


# --- /me and the notice -----------------------------------------------------


def test_me_requires_sign_in(client):
    assert client.get("/me").status_code == 401


def test_a_new_person_has_not_seen_the_notice(client, isa):
    me = client.get("/me", headers=bearer(isa())).json()
    assert me["notice_seen_at"] is None
    assert me["dev"] is False


def test_acknowledging_the_notice_is_recorded_once(client, isa, people):
    """The ISA's condition for public names: people are told at first sign-in."""
    headers = bearer(isa())
    first = client.post("/me/notice", headers=headers).json()["notice_seen_at"]
    assert first is not None
    again = client.post("/me/notice", headers=headers).json()["notice_seen_at"]
    assert again == first, "the first acknowledgement's time is kept"
    assert client.get("/me", headers=headers).json()["notice_seen_at"] == first


def test_the_notice_informs_it_does_not_gate(client, isa, people):
    """An admin who has not acknowledged it still administers."""
    someone(people, 1, roles=[Role.ADMIN])
    assert client.get("/admin/admins", headers=bearer(isa())).status_code == 200


# --- Admin routes are admins' -----------------------------------------------

ADMIN_ROUTES = [
    ("get", "/admin/admins", None),
    ("post", "/admin/roles", {"email": "x@example.org"}),
]


@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
def test_admin_routes_refuse_anonymous(client, method, path, body):
    assert getattr(client, method)(path, **({"json": body} if body else {})).status_code == 401


@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
def test_admin_routes_refuse_a_signed_in_editor(client, isa, method, path, body):
    response = getattr(client, method)(path, headers=bearer(isa()), **({"json": body} if body else {}))
    assert response.status_code == 403


# --- Granting and revoking --------------------------------------------------


def test_an_admin_grants_admin_by_verified_email(client, people, changelog):
    target = someone(people, 2)
    response = client.post("/admin/roles", headers=DEV, json={"email": "PERSON2@example.org"})
    assert response.status_code == 200
    assert people.get(target.sub).has(Role.ADMIN)

    [record] = changelog.recent()
    assert record.action is Action.ROLE_GRANT
    assert record.channel is Channel.WEB
    assert record.target_id == target.isa_id
    assert record.actor_sub == auth.DEV_ADMIN_SUB
    assert record.actor_role == "admin"
    assert record.changes["roles"].before == [] and record.changes["roles"].after == ["admin"]


def test_an_admin_grants_by_isa_id(client, people):
    target = someone(people, 2, email_verified=False)
    response = client.post("/admin/roles", headers=DEV, json={"isa_id": target.isa_id})
    assert response.status_code == 200
    assert people.get(target.sub).has(Role.ADMIN)


def test_granting_by_an_unverified_address_is_refused(client, people):
    """Anyone can create an ISA account claiming any address; until it is
    verified, the address says nothing about who holds the account."""
    target = someone(people, 2, email_verified=False)
    response = client.post("/admin/roles", headers=DEV, json={"email": target.email})
    assert response.status_code == 404
    assert not people.get(target.sub).has(Role.ADMIN)


def test_granting_to_someone_who_never_signed_in_says_so(client):
    response = client.post("/admin/roles", headers=DEV, json={"email": "new@example.org"})
    assert response.status_code == 404
    assert "sign in once" in response.json()["detail"]


def test_an_address_two_accounts_share_is_refused_not_guessed(client, people):
    someone(people, 2, email="shared@example.org")
    someone(people, 3, email="shared@example.org")
    response = client.post("/admin/roles", headers=DEV, json={"email": "shared@example.org"})
    assert response.status_code == 409


@pytest.mark.parametrize("body", [{}, {"email": "a@b.org", "isa_id": "ISA_00000000"}])
def test_the_person_is_named_exactly_once(client, body):
    assert client.post("/admin/roles", headers=DEV, json=body).status_code == 422


def test_granting_an_existing_admin_changes_and_logs_nothing(client, people, changelog):
    someone(people, 2, roles=[Role.ADMIN])
    assert client.post("/admin/roles", headers=DEV, json={"email": "person2@example.org"}).status_code == 200
    assert changelog.recent() == []


def test_an_admin_revokes_admin_and_it_is_logged(client, people, changelog):
    target = someone(people, 2, roles=[Role.ADMIN])
    client.get("/me", headers=DEV)  # the dev admin exists, so target is not the last
    response = client.post(
        "/admin/roles", headers=DEV, json={"isa_id": target.isa_id, "grant": False, "why": "left SafeCom"}
    )
    assert response.status_code == 200
    assert not people.get(target.sub).has(Role.ADMIN)
    [record] = changelog.recent()
    assert record.action is Action.ROLE_REVOKE
    assert record.why == "left SafeCom"


def test_the_last_admin_cannot_be_revoked(client, people, changelog):
    """There is no second way in (D9). Revoking the only admin would leave
    nobody able to administer SlackData."""
    client.get("/me", headers=DEV)
    me = people.get(auth.DEV_ADMIN_SUB)
    response = client.post("/admin/roles", headers=DEV, json={"isa_id": me.isa_id, "grant": False})
    assert response.status_code == 409
    assert people.get(auth.DEV_ADMIN_SUB).has(Role.ADMIN)
    assert changelog.recent() == []


def test_a_new_grant_works_on_the_next_request(client, isa, people):
    """Roles are read from the store on every request (D30), so a grant needs
    no new sign-in."""
    # With the ISA pool configured the dev token is dead, so the granting
    # admin signs in with a token too.
    someone(people, 9, roles=[Role.ADMIN])
    granter = bearer(
        isa(sub="person-sub-9", email="person9@example.org", **{"cognito:username": "person-username-9"})
    )
    headers = bearer(isa())
    client.get("/me", headers=headers)
    assert client.get("/admin/admins", headers=headers).status_code == 403
    client.post("/admin/roles", headers=granter, json={"email": "ada@example.org"})
    assert client.get("/admin/admins", headers=headers).status_code == 200


def test_the_admin_list(client, people):
    someone(people, 2, roles=[Role.ADMIN])
    someone(people, 3)
    names = {row["name"] for row in client.get("/admin/admins", headers=DEV).json()}
    assert names == {"Local Admin", "Person2 Example"}


# --- The public change log --------------------------------------------------


def test_the_change_log_is_public(client, people):
    someone(people, 2)
    client.post("/admin/roles", headers=DEV, json={"email": "person2@example.org"})
    response = client.get("/changes")
    assert response.status_code == 200
    [row] = response.json()
    assert row["actor_name"] == "Local Admin"
    assert row["action"] == "role.grant"
    assert "actor_sub" not in row, "the public view carries the ISA id, not the token sub"


def test_names_are_looked_up_so_anonymising_reaches_past_records(client, people):
    """D43: a record holds no name. Anonymising the person is one change to
    their people record, and every past record then shows the placeholder."""
    someone(people, 2)
    client.post("/admin/roles", headers=DEV, json={"email": "person2@example.org"})
    me = people.get(auth.DEV_ADMIN_SUB)
    people.put(me.model_copy(update={"anonymised": True}))
    assert client.get("/changes").json()[0]["actor_name"] == ANONYMISED_NAME


def test_one_persons_history(client, people):
    first, second = someone(people, 2), someone(people, 3)
    client.post("/admin/roles", headers=DEV, json={"isa_id": first.isa_id})
    client.post("/admin/roles", headers=DEV, json={"isa_id": second.isa_id})
    client.post("/admin/roles", headers=DEV, json={"isa_id": first.isa_id, "grant": False})

    rows = client.get(f"/changes?target_type=person&target_id={first.isa_id}").json()
    assert [row["action"] for row in rows] == ["role.revoke", "role.grant"]


def test_a_target_needs_both_halves(client):
    assert client.get("/changes?target_type=person").status_code == 422


def test_the_log_pages_backwards(client, people):
    for n in range(2, 6):
        someone(people, n)
        client.post("/admin/roles", headers=DEV, json={"email": f"person{n}@example.org"})
    page = client.get("/changes?limit=2").json()
    older = client.get(f"/changes?limit=10&before={page[-1]['id']}").json()
    assert len(page) == 2 and len(older) == 2
    assert all(row["id"] < page[-1]["id"] for row in older)


# --- Separation from the catalogue -------------------------------------------


def test_people_routes_never_touch_the_catalogue_session(submissions, brand_clients, people, changelog):
    """Hosted, the catalogue is opened read-only. A route here that reached for
    the session would pass every local test and fail on the live site."""
    app = FastAPI()
    register_routers(app, read_only=True)

    def no_catalogue():
        raise AssertionError("a people route reached for the catalogue session")

    app.dependency_overrides[get_session] = no_catalogue
    app.dependency_overrides[get_people_repository] = lambda: people
    app.dependency_overrides[get_changelog_repository] = lambda: changelog

    someone(people, 2)
    with TestClient(app) as unwired:
        assert unwired.get("/me", headers=DEV).status_code == 200
        assert unwired.post("/me/notice", headers=DEV).status_code == 200
        assert unwired.post("/admin/roles", headers=DEV, json={"email": "person2@example.org"}).status_code == 200
        assert unwired.get("/changes").status_code == 200
