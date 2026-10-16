"""
Sign-in through the ISA account, and the admin guard on every submissions route
except the public POST.

The plan is explicit that this must not be skipped "because there is only one
user" (SUBMISSIONS_PLAN.md § Testing). The risk isn't a second admin, it's that
the admin routes read and re-review everything a member of the public typed, on
a site that has no login at all today.

Three modes are asserted here, matching the table in `slack_data/api/auth.py`:
the ISA pool configured, the hosted-without-a-pool lockout, and the local dev
token. The ISA case signs real RS256 tokens with a throwaway key and serves a
matching JWKS, so the token path is exercised end to end rather than mocked out
at `verify_isa_token` — which would test nothing, since that function *is* the
security boundary.

Then the part a token cannot answer: **authentic is not authorised**. Every
ISA account verifies; only a person with the admin role in the people store
(granted by an admin, or once by the bootstrap allowlist) passes the guard.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from slack_data.api import auth
from slack_data.models.changes import Action, Channel
from slack_data.models.people import ANONYMISED_NAME, Person, Role, isa_id_for

ADMIN_ROUTES = [
    ("get", "/submissions/"),
    ("get", "/submissions/01J0000000000000000000000A"),
    ("patch", "/submissions/01J0000000000000000000000A"),
]

DEV_HEADERS = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}


def call(client, method, path):
    """PATCH needs a valid body, or a 422 would mask the 401 we're checking."""
    if method == "patch":
        return client.patch(path, json={"status": "approved"})
    return getattr(client, method)(path)


# --- No credentials ---------------------------------------------------------


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_admin_routes_reject_anonymous_requests(client, method, path):
    response = call(client, method, path)
    assert response.status_code == 401
    # Without this header a browser client has no way to know what to send.
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_admin_routes_reject_a_wrong_token(client, method, path):
    client.headers["Authorization"] = "Bearer not-the-token"
    assert call(client, method, path).status_code == 401


def test_admin_routes_reject_a_non_bearer_scheme(client):
    client.headers["Authorization"] = f"Basic {auth.ADMIN_DEV_TOKEN}"
    assert client.get("/submissions/").status_code == 401


def test_public_post_needs_no_credentials(client):
    """The one route that must stay open. A regression here is silent."""
    response = client.post(
        "/submissions/",
        json={"gear_type": "webbings", "gear_id": 1, "changes": {"name": "Fixed"}},
    )
    assert response.status_code == 201


# --- Local dev token --------------------------------------------------------


def test_dev_token_is_accepted_locally(client):
    response = client.get("/submissions/", headers=DEV_HEADERS)
    assert response.status_code == 200


def test_the_dev_token_is_a_stored_local_admin(client, people):
    """A real people record, marked as dev — so roles, the notice and grants
    behave locally exactly as they do hosted."""
    me = client.get("/me", headers=DEV_HEADERS).json()
    assert me["dev"] is True
    assert me["roles"] == ["admin"]
    assert people.get(auth.DEV_ADMIN_SUB).has(Role.ADMIN)


# --- Hosted without a pool: locked, never open ------------------------------


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_hosted_without_a_pool_rejects_even_the_dev_token(client, monkeypatch, method, path):
    """The mode that matters most.

    A hosted deploy that lost `ISA_USER_POOL_ID` must not fall through to
    the static dev token — that would publish an admin API whose password is in
    this repository. It answers 503 instead: shut, and visibly misconfigured.
    """
    from slack_data import database

    monkeypatch.setattr(database, "READ_ONLY", True)
    monkeypatch.setattr(auth, "ISA_USER_POOL_ID", None)

    client.headers.update(DEV_HEADERS)
    assert call(client, method, path).status_code == 503


HOSTED_SIGNALS = [
    pytest.param({"AWS_LAMBDA_FUNCTION_NAME": "slackdata-prod-api"}, False, id="lambda-runtime"),
    pytest.param({"SLACKDATA_DEPLOYMENT": "hosted"}, False, id="explicit-variable"),
    pytest.param({"SLACKDATA_DEPLOYMENT": " Hosted "}, False, id="explicit-variable-untidy"),
    pytest.param({}, True, id="baked-catalogue"),
]


@pytest.mark.parametrize("env,read_only", HOSTED_SIGNALS)
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_any_one_hosted_signal_alone_locks_out_the_dev_token(
    client, monkeypatch, env, read_only, method, path
):
    """Each signal on its own is enough — the case live editing creates.

    Phase 2 stops baking the catalogue, so `READ_ONLY` goes false hosted, and
    phase 1 deletes the pool. If "hosted" still meant "a catalogue file was
    baked in", that deploy would accept the dev token from this public repo.
    """
    from slack_data import database

    monkeypatch.setattr(database, "READ_ONLY", read_only)
    monkeypatch.setattr(auth, "ISA_USER_POOL_ID", None)
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    client.headers.update(DEV_HEADERS)
    assert call(client, method, path).status_code == 503


def test_no_hosted_signal_means_local(monkeypatch):
    """The other side: with none of the three, the dev token is the local path."""
    from slack_data import database
    from slack_data.deployment import is_hosted

    monkeypatch.setattr(database, "READ_ONLY", False)
    assert not is_hosted()
    monkeypatch.setenv("SLACKDATA_DEPLOYMENT", "local")
    assert not is_hosted(), "only the word 'hosted' means hosted"


def test_hosted_lockout_is_unreachable_in_a_real_deploy():
    """Belt and braces: the deploy says it is hosted in two places of its own.

    The Lambda runtime sets AWS_LAMBDA_FUNCTION_NAME regardless of us. On top
    of it, the image and the template both set SLACKDATA_DEPLOYMENT=hosted, so
    an edit to either one alone leaves the other. If both lines go, this fails.
    """
    with open("Dockerfile.lambda") as file:
        dockerfile = file.read()
    with open("infra/serverless.yml") as file:
        template = file.read()
    assert "SLACKDATA_DEPLOYMENT=hosted" in dockerfile
    assert "SLACKDATA_DEPLOYMENT: hosted" in template


# --- Real ISA tokens --------------------------------------------------------

def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin(people, sub="person-sub-1", **fields) -> Person:
    """Store `sub` as an admin, as an earlier grant would have."""
    defaults = {
        "sub": sub, "isa_id": isa_id_for("person-username-1"), "given_name": "Ada",
        "family_name": "Lovelace", "email": "ada@example.org", "email_verified": True,
        "roles": [Role.ADMIN],
    }
    return people.put(Person(**{**defaults, **fields}))


def test_any_isa_account_signs_in(client, isa, people):
    """First sight creates the people record, from the token."""
    response = client.get("/me", headers=bearer(isa()))
    assert response.status_code == 200
    me = response.json()
    assert me["name"] == "Ada Lovelace"
    assert me["isa_id"] == isa_id_for("person-username-1")
    assert me["roles"] == []
    assert people.get("person-sub-1") is not None


def test_the_isa_id_is_derived_as_isa_users_derives_it():
    """`ISA_` + the first 8 hex of sha256(cognito username), upper-cased —
    `generateISAIdFromUsername` in isa-users. Pinned to one known value."""
    import hashlib

    expected = "ISA_" + hashlib.sha256(b"some-user").hexdigest()[:8].upper()
    assert isa_id_for("some-user") == expected
    assert isa_id_for("some-user").startswith("ISA_") and len(isa_id_for("some-user")) == 12


def test_a_signed_in_editor_is_not_an_admin(client, isa):
    """The one that matters: a genuine ISA account — tens of thousands exist —
    is refused the admin routes. 403, not 401: the sign-in is fine."""
    assert client.get("/submissions/", headers=bearer(isa())).status_code == 403


def test_an_admin_in_the_people_store_is_accepted(client, isa, people):
    admin(people)
    assert client.get("/submissions/", headers=bearer(isa())).status_code == 200


def test_a_revoked_role_takes_effect_on_the_next_request(client, isa, people):
    """The role is read from the store on every request, never from the token (D30)."""
    person = admin(people)
    headers = bearer(isa())
    assert client.get("/submissions/", headers=headers).status_code == 200
    people.put(person.model_copy(update={"roles": []}))
    assert client.get("/submissions/", headers=headers).status_code == 403


def test_the_dev_token_is_dead_once_a_pool_is_configured(client, isa):
    """Configuring the ISA pool must close the dev door, not add a second one."""
    assert client.get("/submissions/", headers=DEV_HEADERS).status_code == 401


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"exp": int(time.time()) - 60}, "expired"),
        ({"aud": "4f7vphq9s9ava93irhh2e7pieh"}, "issued for another ISA app (SlackMap's client)"),
        ({"aud": None}, "no audience at all"),
        ({"iss": "https://cognito-idp.eu-central-1.amazonaws.com/other"}, "wrong pool"),
        ({"token_use": "access"}, "an access token, not an id token"),
        ({"sub": None}, "no subject"),
    ],
)
def test_bad_claims_are_rejected(client, isa, people, overrides, reason):
    admin(people)
    response = client.get("/submissions/", headers=bearer(isa(**overrides)))
    assert response.status_code == 401, reason


def test_a_token_signed_by_a_different_key_is_rejected(client, isa, people):
    """The actual forgery attempt: right shape, right claims, wrong signer."""
    admin(people)
    attacker = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        {
            "sub": "person-sub-1",
            "aud": auth.ISA_CLIENT_ID,
            "iss": auth.issuer(),
            "token_use": "id",
            "exp": int(time.time()) + 3600,
        },
        attacker,
        algorithm="RS256",
        headers={"kid": "test-key-1"},
    )
    assert client.get("/submissions/", headers=bearer(forged)).status_code == 401


def test_an_unsigned_token_is_rejected(client, isa, people):
    """`alg: none` — the classic. Rejected because algorithms=["RS256"] is pinned."""
    admin(people)
    unsigned = jwt.encode(
        {
            "sub": "person-sub-1",
            "aud": auth.ISA_CLIENT_ID,
            "iss": auth.issuer(),
            "token_use": "id",
            "exp": int(time.time()) + 3600,
        },
        key=None,
        algorithm="none",
        headers={"kid": "test-key-1"},
    )
    assert client.get("/submissions/", headers=bearer(unsigned)).status_code == 401


def test_a_malformed_token_is_rejected_not_crashed(client, isa):
    assert client.get("/me", headers={"Authorization": "Bearer not.a.jwt"}).status_code == 401


# --- The profile follows the ISA account -------------------------------------


def test_a_renamed_isa_account_is_renamed_here_on_next_sign_in(client, isa, people):
    client.get("/me", headers=bearer(isa()))
    me = client.get("/me", headers=bearer(isa(name="Augusta Ada", family_name="King"))).json()
    assert me["name"] == "Augusta Ada King"
    assert people.get("person-sub-1").family_name == "King"


def test_an_anonymised_person_is_not_renamed_by_their_token(client, isa, people):
    """Erased (D11): signing in again must not bring the name back."""
    client.get("/me", headers=bearer(isa()))
    person = people.get("person-sub-1")
    people.put(person.model_copy(update={"anonymised": True, "given_name": None, "family_name": None}))
    me = client.get("/me", headers=bearer(isa())).json()
    assert me["name"] == ANONYMISED_NAME
    assert people.get("person-sub-1").given_name is None


@pytest.mark.parametrize("claim", [True, "true", "True"])
def test_email_verified_is_read_as_cognito_sends_it(client, isa, claim):
    me = client.get("/me", headers=bearer(isa(email_verified=claim))).json()
    assert me["email_verified"] is True


@pytest.mark.parametrize("claim", [False, "false", None, "yes"])
def test_anything_else_is_unverified(client, isa, claim):
    me = client.get("/me", headers=bearer(isa(email_verified=claim))).json()
    assert me["email_verified"] is False


# --- Bootstrapping the first admins (§ 4.4) ---------------------------------


def test_a_verified_allowlisted_address_becomes_admin_once(client, isa, people, changelog, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "someone@else.org, ADA@example.org")
    assert client.get("/submissions/", headers=bearer(isa())).status_code == 200

    person = people.get("person-sub-1")
    assert person.has(Role.ADMIN)
    assert person.bootstrapped_at is not None

    [record] = changelog.recent()
    assert record.channel is Channel.BOOTSTRAP
    assert record.action is Action.ROLE_GRANT
    assert record.target_id == person.isa_id
    assert record.changes["roles"].after == ["admin"]


def test_an_unverified_allowlisted_address_is_not_bootstrapped(client, isa, people, monkeypatch):
    """isa-users confirms an account before its email is verified, and anyone
    can claim any address on sign-up. Only a verified one counts."""
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "ada@example.org")
    assert client.get("/submissions/", headers=bearer(isa(email_verified=False))).status_code == 403
    assert not people.get("person-sub-1").has(Role.ADMIN)


def test_a_revoked_bootstrap_admin_is_not_re_granted(client, isa, people, monkeypatch):
    """The allowlist grants once. After an admin revokes them, it must not
    silently make them admin again on their next request."""
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "ada@example.org")
    client.get("/me", headers=bearer(isa()))
    person = people.get("person-sub-1")
    people.put(person.model_copy(update={"roles": []}))
    assert client.get("/submissions/", headers=bearer(isa())).status_code == 403


def test_the_bootstrap_is_logged_once(client, isa, changelog, monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAILS", "ada@example.org")
    for _ in range(3):
        client.get("/me", headers=bearer(isa()))
    assert len(changelog.recent()) == 1


def test_the_allowlist_is_not_in_the_template():
    """These are people's addresses and the repo is public: the template reads
    them from the deployer's shell, never a literal."""
    with open("infra/serverless.yml") as file:
        template = file.read()
    line = next(row for row in template.splitlines() if "ADMIN_BOOTSTRAP_EMAILS:" in row)
    assert "${env:ADMIN_BOOTSTRAP_EMAILS" in line
    assert "@" not in line.split("#")[0]


# --- The JWKS cache ---------------------------------------------------------


def test_an_unknown_kid_forces_one_refetch_then_gives_up(client, isa, monkeypatch):
    """Key rotation should cost one request, not a 12-hour outage."""
    calls = []
    real = auth._fetch_jwks

    def counting():
        calls.append(1)
        return real()

    monkeypatch.setattr(auth, "_fetch_jwks", counting)
    with pytest.raises(HTTPException):
        auth.signing_key("a-kid-the-pool-never-published")
    assert len(calls) == 1


def test_jwks_is_cached_across_requests(client, isa, monkeypatch):
    calls = []
    real = auth._fetch_jwks
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: (calls.append(1), real())[1])

    headers = bearer(isa())
    for _ in range(3):
        assert client.get("/me", headers=headers).status_code == 200
    assert len(calls) == 1


def test_a_jwks_outage_serves_the_stale_key(client, isa, monkeypatch):
    """The pool being unreachable must not log an admin out mid-triage."""
    headers = bearer(isa())
    assert client.get("/me", headers=headers).status_code == 200

    def boom():
        raise RuntimeError("cognito unreachable")

    monkeypatch.setattr(auth, "_fetch_jwks", boom)
    auth._jwks_cache["fetched_at"] = 0.0  # force a refresh attempt
    assert client.get("/me", headers=headers).status_code == 200
