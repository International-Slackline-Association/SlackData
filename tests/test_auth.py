"""
Admin authentication — the guard on every submissions route except the public POST.

The plan is explicit that this must not be skipped "because there is only one
user" (SUBMISSIONS_PLAN.md § Testing). The risk isn't a second admin, it's that
the admin routes read and re-review everything a member of the public typed, on
a site that has no login at all today.

Three modes are asserted here, matching the table in `slack_data/api/auth.py`:
a real Cognito pool, the hosted-without-a-pool lockout, and the local dev token.
The Cognito case signs real RS256 tokens with a throwaway key and serves a
matching JWKS, so the token path is exercised end to end rather than mocked out
at `verify_cognito_token` — which would test nothing, since that function *is*
the security boundary.
"""

import importlib
import json
import os
import time
from unittest import mock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from slack_data.api import auth

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


def test_dev_token_claims_are_marked_as_dev():
    """So anything that later logs or attributes an action can tell them apart."""
    from fastapi.security import HTTPAuthorizationCredentials

    claims = auth.require_admin(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.ADMIN_DEV_TOKEN)
    )
    assert claims["dev"] is True
    assert claims["sub"] == "dev-admin"


# --- Hosted without a pool: locked, never open ------------------------------


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_hosted_without_a_pool_rejects_even_the_dev_token(client, monkeypatch, method, path):
    """The mode that matters most.

    A hosted deploy that lost `COGNITO_USER_POOL_ID` must not fall through to
    the static dev token — that would publish an admin API whose password is in
    this repository. It answers 503 instead: shut, and visibly misconfigured.
    """
    from slack_data import database

    monkeypatch.setattr(database, "READ_ONLY", True)
    monkeypatch.setattr(auth, "COGNITO_USER_POOL_ID", None)

    client.headers.update(DEV_HEADERS)
    assert call(client, method, path).status_code == 503


def test_hosted_lockout_is_unreachable_in_a_real_deploy():
    """Belt and braces: the hosted image always sets CATALOG_DB_PATH.

    Reaching the dev-token branch requires no pool *and* no CATALOG_DB_PATH.
    Dockerfile.lambda sets the latter unconditionally, so the branch cannot
    execute hosted. If that line ever leaves the Dockerfile, this fails.
    """
    dockerfile = open("Dockerfile.lambda").read()
    assert "CATALOG_DB_PATH" in dockerfile


# --- Real Cognito tokens ----------------------------------------------------


@pytest.fixture
def cognito(monkeypatch):
    """A throwaway RSA key, a matching JWKS, and a configured pool."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "test-key-1"
    # Built exactly as `_fetch_jwks` builds it — from the JWK dict a pool
    # publishes — so the fixture can't drift from the code it stands in for.
    jwk_data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk_data["kid"] = kid
    jwk = jwt.PyJWK(jwk_data)

    monkeypatch.setattr(auth, "COGNITO_USER_POOL_ID", "eu-central-1_TESTPOOL")
    monkeypatch.setattr(auth, "COGNITO_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(auth, "COGNITO_REGION", "eu-central-1")
    # Patch the fetch, not the verification: everything from the signature
    # onwards is still the real code path.
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: {kid: jwk})
    auth._jwks_cache["keys"] = {}
    auth._jwks_cache["fetched_at"] = 0.0

    def token(**overrides):
        claims = {
            "sub": "cognito-admin-sub",
            "aud": "test-client-id",
            "iss": auth.issuer(),
            "token_use": "id",
            # Cognito puts this on a group member's ID token by itself.
            "cognito:groups": [auth.COGNITO_ADMIN_GROUP],
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            **{k.replace("_", ":", 1) if k.startswith("cognito_") else k: v
               for k, v in overrides.items()},
        }
        # An override of None DROPS the claim — the only way to build the token
        # of a pool member who was never put in any group, which is the exact
        # shape this codebase accepted before the group check existed.
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    return token


def test_a_valid_id_token_is_accepted(client, cognito):
    response = client.get(
        "/submissions/", headers={"Authorization": f"Bearer {cognito()}"}
    )
    assert response.status_code == 200


def test_the_dev_token_is_dead_once_a_pool_is_configured(client, cognito):
    """Configuring Cognito must close the dev door, not add a second one."""
    assert client.get("/submissions/", headers=DEV_HEADERS).status_code == 401


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"exp": int(time.time()) - 60}, "expired"),
        ({"aud": "some-other-app"}, "issued for a different client"),
        ({"iss": "https://cognito-idp.eu-central-1.amazonaws.com/other"}, "wrong pool"),
        ({"token_use": "access"}, "an access token, not an id token"),
    ],
)
def test_bad_claims_are_rejected(client, cognito, overrides, reason):
    response = client.get(
        "/submissions/", headers={"Authorization": f"Bearer {cognito(**overrides)}"}
    )
    assert response.status_code == 401, reason


# --- Authentic is not authorised: the admin group ---------------------------


def test_a_pool_member_with_no_groups_claim_is_rejected(client, cognito):
    """The one that matters: this is precisely what used to be accepted.

    A valid, unexpired, correctly-audienced ID token from our own pool, for a
    user who is simply not in the admin group — which, before the group check,
    was every user in the pool.
    """
    response = client.get(
        "/submissions/",
        headers={"Authorization": f"Bearer {cognito(cognito_groups=None)}"},
    )
    assert response.status_code == 403


def test_a_member_of_other_groups_only_is_rejected(client, cognito):
    response = client.get(
        "/submissions/",
        headers={
            "Authorization": f"Bearer {cognito(cognito_groups=['readers', 'brands'])}"
        },
    )
    assert response.status_code == 403


def test_a_member_of_the_admin_group_is_accepted(client, cognito):
    response = client.get(
        "/submissions/",
        headers={
            "Authorization": f"Bearer {cognito(cognito_groups=[auth.COGNITO_ADMIN_GROUP])}"
        },
    )
    assert response.status_code == 200


def test_the_group_name_is_configurable(client, cognito, monkeypatch):
    monkeypatch.setattr(auth, "COGNITO_ADMIN_GROUP", "triagers")
    assert (
        client.get(
            "/submissions/",
            headers={"Authorization": f"Bearer {cognito(cognito_groups=['admins'])}"},
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/submissions/",
            headers={"Authorization": f"Bearer {cognito(cognito_groups=['triagers'])}"},
        ).status_code
        == 200
    )


def test_a_blank_group_setting_does_not_disable_the_check():
    """Fail closed. A guard that switches itself off when a variable goes
    missing is worse than no guard, because it still reads as protection.

    Loaded as a *separate* module object rather than reloaded in place, so
    prodding the environment cannot leave the shared `auth` other tests import
    holding a different group name.
    """
    for environment in ({}, {"COGNITO_ADMIN_GROUP": ""}, {"COGNITO_ADMIN_GROUP": "  "}):
        base = {k: v for k, v in os.environ.items() if k != "COGNITO_ADMIN_GROUP"}
        with mock.patch.dict(os.environ, {**base, **environment}, clear=True):
            spec = importlib.util.find_spec("slack_data.api.auth")
            fresh = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(fresh)
            assert fresh.COGNITO_ADMIN_GROUP == "admins"


def test_the_group_is_declared_in_the_template_not_made_by_hand():
    """A stage created later must not be one forgotten console click away from
    'any pool member is an admin'."""
    template = open("infra/serverless.yml").read()
    assert "AWS::Cognito::UserPoolGroup" in template
    assert "COGNITO_ADMIN_GROUP" in template


def test_a_token_signed_by_a_different_key_is_rejected(client, cognito):
    """The actual forgery attempt: right shape, right claims, wrong signer."""
    attacker = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        {
            "sub": "attacker",
            "aud": "test-client-id",
            "iss": auth.issuer(),
            "token_use": "id",
            "exp": int(time.time()) + 3600,
        },
        attacker,
        algorithm="RS256",
        headers={"kid": "test-key-1"},
    )
    response = client.get("/submissions/", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_an_unsigned_token_is_rejected(client, cognito):
    """`alg: none` — the classic. Rejected because algorithms=["RS256"] is pinned."""
    unsigned = jwt.encode(
        {
            "sub": "attacker",
            "aud": "test-client-id",
            "iss": auth.issuer(),
            "token_use": "id",
            "exp": int(time.time()) + 3600,
        },
        key=None,
        algorithm="none",
        headers={"kid": "test-key-1"},
    )
    response = client.get("/submissions/", headers={"Authorization": f"Bearer {unsigned}"})
    assert response.status_code == 401


def test_a_malformed_token_is_rejected_not_crashed(client, cognito):
    response = client.get("/submissions/", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_an_unknown_kid_forces_one_refetch_then_gives_up(client, cognito, monkeypatch):
    """Key rotation should cost one request, not a 12-hour outage."""
    calls = []
    real = auth._fetch_jwks

    def counting():
        calls.append(1)
        return real()

    monkeypatch.setattr(auth, "_fetch_jwks", counting)
    with pytest.raises(Exception):
        auth.signing_key("a-kid-the-pool-never-published")
    assert len(calls) == 1


def test_jwks_is_cached_across_requests(client, cognito, monkeypatch):
    calls = []
    real = auth._fetch_jwks
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: (calls.append(1), real())[1])

    headers = {"Authorization": f"Bearer {cognito()}"}
    for _ in range(3):
        assert client.get("/submissions/", headers=headers).status_code == 200
    assert len(calls) == 1


def test_a_jwks_outage_serves_the_stale_key(client, cognito, monkeypatch):
    """Cognito being unreachable must not log the admin out mid-triage."""
    headers = {"Authorization": f"Bearer {cognito()}"}
    assert client.get("/submissions/", headers=headers).status_code == 200

    def boom():
        raise RuntimeError("cognito unreachable")

    monkeypatch.setattr(auth, "_fetch_jwks", boom)
    auth._jwks_cache["fetched_at"] = 0.0  # force a refresh attempt
    assert client.get("/submissions/", headers=headers).status_code == 200
