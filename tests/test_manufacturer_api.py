"""
The manufacturer API — a brand updating its own gear. Phase 4.

The test this file exists for is `test_a_brand_cannot_update_another_brands_gear`.
Everything else here is supporting cast: a brand posting an update for someone
else's product is the one security failure that matters in this phase, and
MANUFACTURER_API_PLAN.md asks for a test named after it.

The other themes:

- **Identity resolution.** Gear ids are a SQLite autoincrement assigned by seed
  position, so they drift. The matcher verifies an id against the name before
  believing it, re-resolves by name when they disagree, refuses ambiguity, and
  echoes the resolved id back so a brand's mapping heals itself.
- **Separation.** This router reads the catalogue but must never write through
  it — a mistake that passes locally (SQLite is writable) and fails hosted.
  `test_the_router_never_writes_to_the_catalogue` wires a session that explodes
  on any write.
- **Auth shape.** A client-credentials access token is a different animal from
  the admin's ID token, and making the admin verifier accept both would be the
  wrong fix. Both verifiers are exercised against the same pool fixture.
"""

import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient

from slack_data.api import auth
from slack_data.api.routing import register_routers
from slack_data.database import get_session
from slack_data.manufacturers import matching
from slack_data.manufacturers.clients import InMemoryBrandClientRepository
from slack_data.manufacturers.store import get_client_repository
from slack_data.models.brand_clients import (
    BrandClient,
    BrandPermission,
    ManufacturerPrincipal,
    may_write_directly,
    now_iso,
)
from slack_data.models.brands import Brand
from slack_data.models.manufacturer_updates import (
    MAX_BATCH_ITEMS,
    MAX_ITEM_CHANGES,
    Resolution,
)
from slack_data.models.submissions import SubmissionKind, SubmissionStatus
from slack_data.models.webbing import FiberMaterial, Webbing
from slack_data.models.weblocks import Weblock
from slack_data.submissions.store import get_repository
from slack_data.utilities.materials import MetalMaterial
from slack_data.utilities.ulid import new_ulid

CLIENT_ID = "brand-client-alpha"
OTHER_CLIENT_ID = "brand-client-beta"

ADMIN = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}


def dev_headers(client_id: str = CLIENT_ID) -> dict:
    """The local-dev credential: "<token>:<client_id>".

    Unlike the admin — who is one person — a manufacturer request has to say
    which brand it is, so the dev path resolves through the real repository
    rather than shortcutting past it.
    """
    return {"Authorization": f"Bearer {auth.MANUFACTURER_DEV_TOKEN}:{client_id}"}


# --- Fixtures ---------------------------------------------------------------


@pytest.fixture
def brands(session):
    """Two brands. Everything interesting here is about telling them apart."""
    alpha = Brand(name="Alpha Slacklines")
    beta = Brand(name="Beta Rigging")
    session.add(alpha)
    session.add(beta)
    session.commit()
    session.refresh(alpha)
    session.refresh(beta)
    return alpha, beta


@pytest.fixture
def gear(session, brands):
    """A small catalogue: two Alpha webbings, one Beta webbing, one Alpha weblock.

    The two Alpha webbings share a name on purpose — `webbings.json` really does
    contain duplicate names, and refusing that ambiguity rather than guessing is
    a behaviour, not an edge case.
    """
    alpha, beta = brands
    # `width` / `material` / `width_min` are NOT NULL on the tables; the values
    # are arbitrary here, since nothing under test reads them.
    def webbing(name, brand):
        return Webbing(name=name, width=25, material=[FiberMaterial.POLYESTER], brand_id=brand.id)

    rows = {
        "alpha_webbing": webbing("Type 18", alpha),
        "alpha_dupe": webbing("Type 18", alpha),
        "alpha_unique": webbing("Mantra MK2", alpha),
        "beta_webbing": webbing("Beta Line", beta),
        "alpha_weblock": Weblock(
            name="Alpha Lock", material=MetalMaterial.ALUMINUM, width_min=25, brand_id=alpha.id
        ),
    }
    for row in rows.values():
        session.add(row)
    session.commit()
    for row in rows.values():
        session.refresh(row)
    return rows


@pytest.fixture
def brand_clients(brands):
    """One registered client per brand. Overrides the conftest fixture."""
    alpha, beta = brands
    return InMemoryBrandClientRepository(
        [
            BrandClient(
                client_id=CLIENT_ID,
                brand_id=alpha.id,
                brand_name=alpha.name,
                created_at=now_iso(),
            ),
            BrandClient(
                client_id=OTHER_CLIENT_ID,
                brand_id=beta.id,
                brand_name=beta.name,
                created_at=now_iso(),
            ),
        ]
    )


def post(client, items, headers=None, **extra):
    return client.post(
        "/manufacturer/gear",
        json={"items": items, **extra},
        headers=headers or dev_headers(),
    )


def approved(client):
    return client.get("/submissions/?status=approved", headers=ADMIN).json()


# --- The test this file exists for ------------------------------------------


def test_a_brand_cannot_update_another_brands_gear(client, gear, brand_clients):
    """**The security failure that matters in this phase.**

    Alpha's credentials, Beta's product id. 403, and nothing stored — not a
    pending row for an admin to catch, nothing at all.
    """
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["beta_webbing"].id,
          "changes": {"breaking_strength": "31"}}],
    )
    assert response.status_code == 403
    assert approved(client) == []


def test_a_brand_cannot_reach_another_brands_gear_by_name_either(client, gear):
    """The id is not the only handle — the name path must be scoped too.

    Alpha naming Beta's product resolves to no row *of Alpha's*, so it is a new
    product Alpha claims to make, not an edit to Beta's. It must never land on
    Beta's row.
    """
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Beta Line", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201

    result = response.json()["results"][0]
    assert result["resolution"] == Resolution.UNMATCHED.value
    assert result["gear_id"] is None


def test_a_foreign_id_is_403_even_with_a_matching_name_of_their_own(client, gear):
    """Ownership is checked before any name fallback could rescue the request.

    Otherwise "send someone else's id plus one of your own names" would quietly
    succeed, and the 403 would be decorative.
    """
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["beta_webbing"].id,
          "name": "Mantra MK2", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 403
    assert approved(client) == []


# --- Auth -------------------------------------------------------------------


MANUFACTURER_ROUTES = [
    ("get", "/manufacturer/me"),
    ("get", "/manufacturer/gear"),
    ("post", "/manufacturer/gear"),
]


def call(client, method, path, headers=None):
    if method == "post":
        return client.post(
            path,
            json={"items": [{"gear_type": "webbings", "name": "X", "changes": {"weight": "70"}}]},
            headers=headers,
        )
    return getattr(client, method)(path, headers=headers)


@pytest.mark.parametrize("method,path", MANUFACTURER_ROUTES)
def test_every_route_rejects_anonymous_requests(client, method, path):
    response = call(client, method, path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("method,path", MANUFACTURER_ROUTES)
def test_every_route_rejects_a_wrong_token(client, method, path):
    assert call(client, method, path, {"Authorization": "Bearer nope"}).status_code == 401


def test_the_admin_token_is_not_a_manufacturer_token(client, gear):
    """Two different credentials for two different jobs; neither is the other."""
    assert call(client, "get", "/manufacturer/me", ADMIN).status_code == 401


def test_a_manufacturer_token_is_not_an_admin_token(client, gear):
    """And the reverse — the triage queue is not a brand's to read."""
    assert client.get("/submissions/", headers=dev_headers()).status_code == 401


def test_an_unregistered_client_is_403_not_401(client, gear):
    """The credential is genuine; it is simply not mapped to a brand.

    401 would tell an integrator to re-authenticate, which would produce exactly
    the same token. 403 tells them the truth: ask to be registered.
    """
    response = call(client, "get", "/manufacturer/me", dev_headers("never-registered"))
    assert response.status_code == 403


def test_a_deactivated_client_is_refused(client, gear, brand_clients, brands):
    """Revocation is a `put`, and it takes effect on the very next request.

    This is the whole reason the brand mapping lives in data rather than in a
    per-brand Cognito scope — no redeploy, no waiting out a token lifetime.
    """
    alpha, _ = brands
    brand_clients.put(
        BrandClient(
            client_id=CLIENT_ID,
            brand_id=alpha.id,
            brand_name=alpha.name,
            active=False,
            created_at=now_iso(),
        )
    )
    assert call(client, "get", "/manufacturer/me", dev_headers()).status_code == 403


def test_a_client_with_no_permissions_cannot_submit(client, gear, brand_clients, brands):
    alpha, _ = brands
    brand_clients.put(
        BrandClient(
            client_id=CLIENT_ID,
            brand_id=alpha.id,
            brand_name=alpha.name,
            permissions=[],
            created_at=now_iso(),
        )
    )
    assert call(client, "get", "/manufacturer/me", dev_headers()).status_code == 403


def test_a_partial_batch_write_says_how_far_it_got(client, gear, brands):
    """A store failure mid-batch must not look like a total failure.

    Resolution is all-or-nothing; the writes are a loop, not a transaction, and
    no DynamoDB transaction permission is granted. The danger is therefore the
    *silent* partial batch: the brand sees an error, retries, and every stored
    item is written a second time under a fresh batch_id — leaving the admin
    reviewing the same product twice with no way to tell which is current.
    """

    class FailsPartWay:
        def __init__(self):
            self.stored = []

        def create(self, submission):
            if len(self.stored) == 2:
                raise RuntimeError("ProvisionedThroughputExceededException")
            self.stored.append(submission)
            return submission

        def get(self, submission_id):
            return None

        def list_by_status(self, status, limit=50):
            return []

        def review(self, submission_id, status, review_note):
            return None

    from slack_data.submissions.store import get_repository

    store = FailsPartWay()
    client.app.dependency_overrides[get_repository] = lambda: store

    response = post(
        client,
        [
            {"gear_type": "webbings", "name": "Mantra MK2", "changes": {"breaking_strength": "44"}},
            {"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}},
            {"gear_type": "weblocks", "name": "Alpha Lock", "changes": {"weight": "180"}},
        ],
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "stored 2 of 3" in detail, detail
    # The batch_id must be quotable, or the admin cannot find what landed.
    assert "batch_id" in detail
    assert "blind-retry" in detail
    assert len(store.stored) == 2


# ---------------------------------------------------------------------------
# Brand-id drift — the one wrong answer the rest of the module cannot catch
# ---------------------------------------------------------------------------


def drifted(brand_clients, *, brand_id=None, brand_name=None):
    """Re-register Alpha's client with a stale id or name, as a re-seed would."""
    existing = brand_clients.get(CLIENT_ID)
    update = {}
    if brand_id is not None:
        update["brand_id"] = brand_id
    if brand_name is not None:
        update["brand_name"] = brand_name
    brand_clients.put(existing.model_copy(update=update))


def test_a_credential_whose_brand_id_now_names_another_brand_is_refused(
    client, gear, brands, brand_clients
):
    """The failure this guard exists for, and it is not a hypothetical.

    Brand ids are seed-order autoincrements with no id in the root `*.json`, and
    `register.py` resolves them against the operator's local catalogue while the
    record is read by a Lambda holding a catalogue baked from another commit.
    Point Alpha's credential at Beta's row — exactly what one shifted id looks
    like — and every route below would otherwise answer confidently *about Beta*.
    """
    _, beta = brands
    drifted(brand_clients, brand_id=beta.id)  # name still says "Alpha Slacklines"

    for method, path in MANUFACTURER_ROUTES:
        response = call(client, method, path, headers=dev_headers())
        assert response.status_code == 503, f"{method} {path}: {response.status_code}"
        assert "re-registering" in response.json()["detail"]


def test_the_drift_guard_never_leaks_the_other_brands_inventory(
    client, gear, brands, brand_clients
):
    """The consequence, stated as its own test: no Beta row may appear."""
    _, beta = brands
    drifted(brand_clients, brand_id=beta.id)

    response = client.get("/manufacturer/gear", headers=dev_headers())
    assert response.status_code == 503
    assert "Beta Line" not in response.text


def test_a_credential_naming_a_brand_that_no_longer_exists_is_refused(
    client, gear, brand_clients
):
    """A brand dropped from the seed entirely, rather than renumbered."""
    drifted(brand_clients, brand_id=99_999)
    response = client.get("/manufacturer/me", headers=dev_headers())
    assert response.status_code == 503
    assert "not in this catalogue" in response.json()["detail"]


def test_a_renamed_brand_is_refused_rather_than_silently_accepted(
    client, gear, brand_clients
):
    """The id is right, the name is not. Same rule as `resolve()` applies to gear:
    a disagreement between an id and the name recorded beside it is reported,
    never resolved by preferring one of them."""
    drifted(brand_clients, brand_name="Alpha Slacklines GmbH")
    response = client.get("/manufacturer/me", headers=dev_headers())
    assert response.status_code == 503
    assert "issued to" in response.json()["detail"]


def test_brand_verification_tolerates_case_and_spacing(client, gear, brand_clients):
    """The same normalisation `resolve()` uses — a stored "alpha  slacklines" is
    the same brand, and refusing it would make the guard the outage."""
    drifted(brand_clients, brand_name="alpha  SLACKLINES")
    assert client.get("/manufacturer/me", headers=dev_headers()).status_code == 200


def test_me_verifies_rather_than_echoing_the_stored_record(client, gear, brand_clients):
    """`/me` is documented as the call that confirms a credential reached the
    right brand. Echoing the stored `brand_name` back would confirm nothing —
    that field is the thing that can be stale."""
    drifted(brand_clients, brand_id=99_999)
    response = client.get("/manufacturer/me", headers=dev_headers())
    assert response.status_code != 200, "/me confirmed a mapping it never checked"


def test_me_reports_the_resolved_brand(client, gear, brands):
    alpha, _ = brands
    body = call(client, "get", "/manufacturer/me", dev_headers()).json()
    assert body["brand_id"] == alpha.id
    assert body["brand_name"] == "Alpha Slacklines"
    assert body["permissions"] == ["suggest"]
    assert body["dev"] is True  # so anything logging can tell dev from Cognito


# --- Hosted without a pool: locked, never open ------------------------------


@pytest.mark.parametrize("method,path", MANUFACTURER_ROUTES)
def test_hosted_without_a_pool_rejects_even_the_dev_token(
    client, monkeypatch, gear, method, path
):
    """The rule that makes a dev token in a public repo safe, applied to the
    path that *writes*. A hosted deploy missing its pool stays shut."""
    from slack_data import database

    monkeypatch.setattr(database, "READ_ONLY", True)
    monkeypatch.setattr(auth, "COGNITO_USER_POOL_ID", None)

    assert call(client, method, path, dev_headers()).status_code == 503


# --- Real Cognito client-credentials tokens ---------------------------------


@pytest.fixture
def cognito(monkeypatch):
    """A throwaway RSA key, a matching JWKS, and a configured pool.

    Built exactly as `tests/test_auth.py` builds it, and mints **access** tokens
    with a `client_id` and a `scope` — the machine-to-machine shape, which has
    no `aud` claim at all.
    """
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "test-key-1"
    jwk_data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk_data["kid"] = kid
    jwk = jwt.PyJWK(jwk_data)

    monkeypatch.setattr(auth, "COGNITO_USER_POOL_ID", "eu-central-1_TESTPOOL")
    monkeypatch.setattr(auth, "COGNITO_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(auth, "COGNITO_REGION", "eu-central-1")
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: {kid: jwk})
    auth._jwks_cache["keys"] = {}
    auth._jwks_cache["fetched_at"] = 0.0

    def token(**overrides):
        claims = {
            "sub": CLIENT_ID,
            "client_id": CLIENT_ID,
            "iss": auth.issuer(),
            "token_use": "access",
            "scope": auth.MANUFACTURER_SCOPE,
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            **overrides,
        }
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    return token


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_a_valid_client_credentials_token_is_accepted(client, gear, cognito):
    """The shape the admin verifier rejects, accepted by the one built for it."""
    response = client.get("/manufacturer/me", headers=bearer(cognito()))
    assert response.status_code == 200


def test_a_client_credentials_token_is_refused_by_the_admin_verifier(client, gear, cognito):
    """Why there are two verifiers at all.

    An access token with no `aud` cannot pass `verify_cognito_token`, and the
    fix is a second function — never loosening the one guarding admin login.
    """
    assert client.get("/submissions/", headers=bearer(cognito())).status_code == 401


def test_an_admin_id_token_cannot_write_gear(client, gear, cognito):
    """And the mirror image: an ID token is a person in a browser, not a machine."""
    id_token = cognito(token_use="id", aud="test-client-id", scope=None)
    assert client.get("/manufacturer/me", headers=bearer(id_token)).status_code == 401


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"exp": int(time.time()) - 60}, "expired"),
        ({"iss": "https://cognito-idp.eu-central-1.amazonaws.com/other"}, "wrong pool"),
        ({"token_use": "id"}, "an id token, not an access token"),
        ({"scope": "slackdata/something.else"}, "wrong scope"),
        ({"scope": ""}, "no scope"),
        ({"client_id": None}, "names no client"),
    ],
)
def test_bad_claims_are_rejected(client, gear, cognito, overrides, reason):
    response = client.get("/manufacturer/me", headers=bearer(cognito(**overrides)))
    assert response.status_code == 401, reason


def test_a_scope_is_matched_whole_not_by_prefix(client, gear, cognito):
    """`slackdata/gear.write.nothing` must not satisfy `slackdata/gear.write`."""
    token = cognito(scope=f"{auth.MANUFACTURER_SCOPE}.nothing")
    assert client.get("/manufacturer/me", headers=bearer(token)).status_code == 401


def test_one_of_several_scopes_is_enough(client, gear, cognito):
    """Real tokens carry every scope the client is granted, space delimited."""
    token = cognito(scope=f"slackdata/read {auth.MANUFACTURER_SCOPE} openid")
    assert client.get("/manufacturer/me", headers=bearer(token)).status_code == 200


def test_a_token_signed_by_a_different_key_is_rejected(client, gear, cognito):
    attacker = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        {
            "sub": CLIENT_ID,
            "client_id": CLIENT_ID,
            "iss": auth.issuer(),
            "token_use": "access",
            "scope": auth.MANUFACTURER_SCOPE,
            "exp": int(time.time()) + 3600,
        },
        attacker,
        algorithm="RS256",
        headers={"kid": "test-key-1"},
    )
    assert client.get("/manufacturer/me", headers=bearer(forged)).status_code == 401


def test_an_unsigned_token_is_rejected(client, gear, cognito):
    """`alg: none`, rejected because algorithms=["RS256"] is pinned here too."""
    unsigned = jwt.encode(
        {
            "sub": CLIENT_ID,
            "client_id": CLIENT_ID,
            "iss": auth.issuer(),
            "token_use": "access",
            "scope": auth.MANUFACTURER_SCOPE,
            "exp": int(time.time()) + 3600,
        },
        key=None,
        algorithm="none",
        headers={"kid": "test-key-1"},
    )
    assert client.get("/manufacturer/me", headers=bearer(unsigned)).status_code == 401


def test_the_dev_token_is_dead_once_a_pool_is_configured(client, gear, cognito):
    assert client.get("/manufacturer/me", headers=dev_headers()).status_code == 401


def test_a_cognito_token_still_resolves_through_the_client_record(
    client, gear, cognito, brand_clients, brands
):
    """Signature verification says *who*; the record says *which brand*.

    Deactivating the record must refuse a perfectly valid Cognito token — if it
    did not, revocation would mean editing the pool.
    """
    alpha, _ = brands
    brand_clients.put(
        BrandClient(
            client_id=CLIENT_ID,
            brand_id=alpha.id,
            brand_name=alpha.name,
            active=False,
            created_at=now_iso(),
        )
    )
    assert client.get("/manufacturer/me", headers=bearer(cognito())).status_code == 403


# --- Discovery --------------------------------------------------------------


def test_discovery_returns_only_the_callers_own_gear(client, gear, brands):
    """How a brand learns our ids at all. Scoped to them, both ways."""
    rows = client.get("/manufacturer/gear", headers=dev_headers()).json()
    names = {row["name"] for row in rows}
    assert "Beta Line" not in names
    assert {"Type 18", "Mantra MK2", "Alpha Lock"} <= names
    assert {row["gear_type"] for row in rows} == {"webbings", "weblocks"}


def test_discovery_can_be_filtered_by_gear_type(client, gear):
    rows = client.get("/manufacturer/gear?gear_type=weblocks", headers=dev_headers()).json()
    assert [row["name"] for row in rows] == ["Alpha Lock"]


def test_discovery_rejects_an_unknown_gear_type(client, gear):
    assert client.get("/manufacturer/gear?gear_type=hats", headers=dev_headers()).status_code == 404


# --- Discovery: the round-trip read (`?include=spec`) ------------------------
# MANUFACTURER_API_PLAN.md § Proposed: closing the round-trip gap. A brand has to
# be able to GET what we hold, change it, and send it back; without the values
# they can only blind-send every field or mirror our catalogue themselves.


def test_the_bare_discovery_call_carries_no_spec(client, gear):
    """The default must not change — `spec` is opt-in.

    The "map all my SKUs across eight types" call does not want sixty spec
    sheets, and every integration written before this existed asks for it.
    """
    rows = client.get("/manufacturer/gear", headers=dev_headers()).json()
    assert rows
    # Absent, not null: the bare response is byte-identical to what it was
    # before `spec` existed, so no existing integration sees a new key.
    assert all("spec" not in row for row in rows)
    # ...while `active` stays present even when null, because "we do not know
    # whether this is still sold" is an answer.
    assert all("active" in row for row in rows)


def test_include_spec_returns_the_current_values(client, gear):
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    assert row["spec"]["width"] == 25
    # The name is on the ROW, not in the spec — it says which product this is,
    # not what one of its specs is.
    assert row["name"] == "Mantra MK2"


def test_the_spec_is_exactly_the_fields_the_post_accepts(client, gear):
    """Symmetry with the POST, and the reason it cannot drift.

    The keys are the derived `<X>Update` field list less `name` — so a field
    added to a model becomes both correctable and visible in the same commit,
    and a brand can post the dict straight into `changes` without filtering it.
    """
    from slack_data.submissions.fields import manufacturer_fields

    for slug in ("webbings", "weblocks"):
        rows = client.get(
            f"/manufacturer/gear?gear_type={slug}&include=spec", headers=dev_headers()
        ).json()
        assert rows
        for row in rows:
            assert set(row["spec"]) == set(manufacturer_fields(slug))


def test_the_spec_omits_the_fields_the_post_refuses(client, gear):
    """`brand_id` and `classification` are closed on the way in, so they must not
    appear in a payload whose whole purpose is to be edited and sent back.

    `name` is now in that company, for a different reason: it is the handle the
    item is matched by, so it is readable on the row and not editable at all.
    Holding it in both places invited a brand to edit the copy that cannot be
    edited."""
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    assert "brand_id" not in row["spec"]
    assert "classification" not in row["spec"]
    assert "name" not in row["spec"]


def test_the_rename_slot_sits_beside_the_name_on_the_row(client, gear):
    """The affordance a brand reads before they read any documentation: an empty
    `rename_to` next to the `name` it would replace, in the same position it
    occupies on the item they post back."""
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    assert row["name"] == "Mantra MK2"
    assert row["rename_to"] is None


def test_the_spec_carries_brand_name_which_is_not_a_column(client, gear):
    """`brand_name` is correctable but synthetic — a computed field over the
    Brand relationship, not a stored column. Reading it needs the relationship,
    so it is the one key `getattr` on the row does not trivially answer."""
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    assert row["spec"]["brand_name"] == "Alpha Slacklines"


def test_spec_values_keep_their_types(client, gear):
    """**Deliberately asymmetric with the POST.** `changes` is text because the
    admin hand-applies prose; a read has no such excuse, and stringifying here
    would make the round-trip lossy."""
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    assert row["spec"]["width"] == 25
    assert not isinstance(row["spec"]["width"], str)
    assert isinstance(row["spec"]["material"], list)


def test_a_brand_cannot_read_another_brands_spec(client, gear, brands):
    """The cross-brand test, applied to the new read.

    Named after `test_a_brand_cannot_update_another_brands_gear` because it is
    the same failure in the other direction: `include=spec` must add data to the
    rows the caller already owns, never widen which rows those are.
    """
    rows = client.get("/manufacturer/gear?include=spec", headers=dev_headers()).json()
    names = {row["name"] for row in rows}
    assert "Beta Line" not in names
    assert all(row["spec"]["brand_name"] == "Alpha Slacklines" for row in rows)


def test_an_unknown_include_value_is_rejected(client, gear):
    """Not silently ignored: a caller who typed `?include=specs` and got four
    fields back would conclude the feature does not work."""
    response = client.get("/manufacturer/gear?include=specs", headers=dev_headers())
    assert response.status_code == 422


def test_include_spec_still_requires_a_credential(client, gear):
    assert client.get("/manufacturer/gear?include=spec").status_code == 401


def test_the_spec_round_trips_into_an_accepted_update(client, gear):
    """The point of the whole proposal, end to end.

    GET the spec, change one value, POST the dict straight back. If the read
    ever returns a key the write refuses, this fails — which is the coupling
    the derived field list is supposed to guarantee.
    """
    row = _one_spec_row(client, "webbings", "Mantra MK2")
    spec = dict(row["spec"])
    spec["weight"] = 70.5

    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": row["gear_id"], "name": row["name"],
          "changes": {k: v for k, v in spec.items() if v is not None}}],
    )
    assert response.status_code == 201, response.json()
    assert response.json()["results"][0]["resolution"] == Resolution.BY_ID.value
    assert approved(client)[0]["changes"]["weight"] == "70.5"


def _one_spec_row(client, gear_type: str, name: str) -> dict:
    rows = client.get(
        f"/manufacturer/gear?gear_type={gear_type}&include=spec", headers=dev_headers()
    ).json()
    return next(row for row in rows if row["name"] == name)


# --- Read-back: a brand seeing its own submissions ---------------------------
# MANUFACTURER_API_PLAN.md § Reading their own submissions back. The receipt is
# one-shot, and two failure modes depended on a human: a 502 partial batch, and
# a rejection the sender could never learn about.


def _sent(client, note="first", **extra):
    return post(client, [{"gear_type": "webbings", "name": "Mantra MK2",
                          "changes": {"weight": "70"}, "note": note}], **extra).json()


def test_a_brand_reads_its_own_submissions(client, gear):
    _sent(client)
    rows = client.get("/manufacturer/submissions", headers=dev_headers()).json()
    assert len(rows) == 1
    assert rows[0]["gear_name"] == "Mantra MK2"
    assert rows[0]["status"] == SubmissionStatus.APPROVED.value


def test_a_brand_cannot_read_another_brands_submissions(client, gear, brand_clients):
    """The cross-brand test, applied to the read-back.

    Sibling of `test_a_brand_cannot_update_another_brands_gear`. Scoping comes
    from the credential — there is no parameter to pass a brand_id — so the
    failure this guards against is a query that forgets to scope at all.
    """
    _sent(client, note="alpha's")
    rows = client.get("/manufacturer/submissions", headers=dev_headers(OTHER_CLIENT_ID)).json()
    assert rows == []


def test_the_read_back_never_returns_the_public_suggestion_box(client, gear, submissions):
    """A public submission has no brand_id, so it is absent from the index
    rather than filtered out of it — see the plan on sparseness."""
    from slack_data.models.submissions import Submission, now_iso

    submissions.create(
        Submission(
            submission_id=new_ulid(), kind=SubmissionKind.CORRECTION, gear_type="webbings",
            gear_id=None, gear_name="Someone Else", gear_brand="Beta Rigging",
            changes={"weight": "1"}, status=SubmissionStatus.PENDING, created_at=now_iso(),
        )
    )
    _sent(client)
    rows = client.get("/manufacturer/submissions", headers=dev_headers()).json()
    assert [row["gear_name"] for row in rows] == ["Mantra MK2"]


def test_the_read_back_is_newest_first(client, gear):
    """The opposite of triage, deliberately: a brand asking "did my last batch
    land?" wants the last batch. Both orders sort on a ULID, so neither ties."""
    _sent(client, note="older")
    _sent(client, note="newer")
    rows = client.get("/manufacturer/submissions", headers=dev_headers()).json()
    assert [row["note"] for row in rows] == ["newer", "older"]


def test_a_batch_can_be_looked_up_by_id(client, gear):
    """What the 502 partial-batch message needs: it names a batch_id and nothing
    else, so that has to be the thing you can ask about."""
    _sent(client, note="other")
    wanted = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "71"}},
         {"gear_type": "weblocks", "name": "Alpha Lock", "changes": {"weight": "72"}}],
    ).json()["batch_id"]

    rows = client.get(
        f"/manufacturer/submissions?batch_id={wanted}", headers=dev_headers()
    ).json()
    assert len(rows) == 2
    assert {row["batch_id"] for row in rows} == {wanted}


def test_another_brands_batch_id_returns_nothing(client, gear, brand_clients):
    """A batch_id is a guessable-shaped string, so scoping must not be skipped
    just because the caller named an exact batch."""
    batch = _sent(client)["batch_id"]
    rows = client.get(
        f"/manufacturer/submissions?batch_id={batch}", headers=dev_headers(OTHER_CLIENT_ID)
    ).json()
    assert rows == []


def test_the_brand_sees_the_review_note(client, gear):
    """The point of the feature for a rejection. `status: rejected` with no
    reason sends the brand to email anyway — see the plan: admins must know the
    note is read by the sender."""
    submission_id = _sent(client)["results"][0]["submission_id"]
    client.patch(
        f"/submissions/{submission_id}",
        json={"status": "rejected", "review_note": "we already shipped this"},
        headers=ADMIN,
    )
    row = client.get("/manufacturer/submissions", headers=dev_headers()).json()[0]
    assert row["status"] == SubmissionStatus.REJECTED.value
    assert row["review_note"] == "we already shipped this"
    assert row["reviewed_at"] is not None


def test_the_read_back_omits_the_fields_that_say_nothing(client, gear):
    """`submitter_email` is always null for a manufacturer submission, and
    `gear_brand`/`brand_id` are constants of the credential. Echoing them per
    row invites someone to start populating the first one."""
    _sent(client)
    row = client.get("/manufacturer/submissions", headers=dev_headers()).json()[0]
    assert "submitter_email" not in row
    assert "gear_brand" not in row
    assert "brand_id" not in row


def test_the_read_back_requires_a_credential(client, gear):
    assert client.get("/manufacturer/submissions").status_code == 401


def test_the_read_back_refuses_a_drifted_brand(client, gear, brand_clients):
    """`verify_brand` runs here like every other route in this router: a
    credential whose brand id no longer means what it did must refuse, not
    answer about whoever now holds that id."""
    stale = brand_clients.get(CLIENT_ID)
    brand_clients.put(stale.model_copy(update={"brand_name": "Someone Else Entirely"}))
    assert client.get("/manufacturer/submissions", headers=dev_headers()).status_code == 503


def test_the_read_back_caps_its_page(client, gear):
    assert client.get(
        "/manufacturer/submissions?limit=500", headers=dev_headers()
    ).status_code == 422


# --- Identity resolution ----------------------------------------------------


def test_a_matching_id_and_name_resolves_by_id(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "changes": {"weight": "70"}}],
    )
    result = response.json()["results"][0]
    assert result["resolution"] == Resolution.BY_ID.value
    assert result["gear_id"] == gear["alpha_unique"].id
    assert result["stale_gear_id"] is None


def test_a_drifted_id_is_re_resolved_by_name_and_echoed_back(client, gear):
    """**The self-healing case.** A re-seed shifted the ids; the brand's stored
    id now points at a different product of theirs. The name wins, and the
    response hands back the id that is correct now."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_weblock"].id,
          "name": "Mantra MK2", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201

    result = response.json()["results"][0]
    assert result["resolution"] == Resolution.BY_NAME.value
    assert result["gear_id"] == gear["alpha_unique"].id
    assert result["stale_gear_id"] == gear["alpha_weblock"].id


def test_an_unknown_id_with_no_name_is_refused_rather_than_guessed(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": 99999, "changes": {"weight": "70"}}],
    )
    assert response.status_code == 400
    assert "items[0]" in response.json()["detail"]


def test_a_duplicate_name_is_refused_not_guessed(client, gear):
    """`webbings.json` really does hold duplicate names. Picking one would put a
    manufacturer's own spec on the wrong product half the time."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Type 18", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert str(gear["alpha_webbing"].id) in detail
    assert str(gear["alpha_dupe"].id) in detail
    assert approved(client) == []


def test_names_match_case_and_whitespace_insensitively(client, gear):
    """A brand's spelling of their own product drifts from ours in exactly these
    two ways, and only these two — punctuation is left alone, because "A-Line"
    and "Aline" really can be different products."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "  mantra   mk2 ", "changes": {"weight": "70"}}],
    )
    assert response.json()["results"][0]["gear_id"] == gear["alpha_unique"].id


def test_an_unmatched_name_is_recorded_as_a_new_product(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Brand New Line", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201

    result = response.json()["results"][0]
    assert result["resolution"] == Resolution.UNMATCHED.value
    assert result["gear_id"] is None
    assert approved(client)[0]["gear_name"] == "Brand New Line"


def test_a_gear_type_scopes_the_match(client, gear):
    """A weblock named like a webbing is not that webbing."""
    response = post(
        client,
        [{"gear_type": "weblocks", "name": "Mantra MK2", "changes": {"weight": "70"}}],
    )
    assert response.json()["results"][0]["resolution"] == Resolution.UNMATCHED.value


def test_the_wire_resolution_enum_matches_the_matcher(client):
    """The response contract and the matcher's internal states are declared in
    two files; they must agree, and this is cheaper than importing one into the
    other and letting an internal state leak onto the wire."""
    assert {r.value for r in Resolution} == {r.value for r in matching.Resolution}


# --- Renaming a product -----------------------------------------------------
#
# A rename is the one correction where the field being changed is also the
# handle we match on. It travels as `changes["rename_to"]` — a key that is not a
# model field — because `?include=spec` hands a brand a dict holding both `name`
# and `rename_to: null`, and that dict has to stay postable verbatim.


def test_a_rename_travels_as_rename_to(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "rename_to": "Mantra MK3"}],
    )
    assert response.status_code == 201

    result = response.json()["results"][0]
    assert result["resolution"] == Resolution.BY_ID.value
    assert result["gear_id"] == gear["alpha_unique"].id
    # Identity stays the name we hold; the stored patch is an ordinary field
    # edit, because "set name" is what the admin applies to the JSON.
    assert result["gear_name"] == "Mantra MK2"
    assert approved(client)[0]["changes"] == {"name": "Mantra MK3"}


def test_a_name_change_through_changes_is_refused(client, gear):
    """`name` is not a key of `changes` at all — it is the handle the item is
    matched by, so `?include=spec` does not hand it back and the write does not
    take it. Refused by the model with the right key named."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "changes": {"name": "Mantra MK3"}}],
    )
    assert response.status_code == 422
    detail = json.dumps(response.json())
    assert "rename_to" in detail
    assert approved(client) == []


def test_a_null_rename_to_asks_for_no_rename(client, gear):
    """The row hands back `rename_to: null`; posting it back must mean "no
    rename". A real null now, not the string "null" — the reason `rename_to` is
    a field of its own rather than a `changes` key, where every value is text."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "rename_to": None, "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201
    assert approved(client)[0]["changes"] == {"weight": "70"}


def test_a_product_can_be_renamed_to_the_literal_word_null(client, gear):
    """Silly, and the point. While `rename_to` rode inside `changes` its value
    was stringified, so a JSON null and the string "null" were the same four
    characters and one of them had to lose. A field of its own has no such
    ambiguity."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "rename_to": "null"}],
    )
    assert response.status_code == 201
    assert approved(client)[0]["changes"] == {"name": "null"}


def test_a_rename_needs_no_other_change(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "rename_to": "Mantra MK3"}],
    )
    assert response.status_code == 201


def test_a_rename_to_the_name_we_already_hold_is_dropped_not_refused(client, gear):
    """An integration that leaves a shipped rename in its template resends it
    forever. Under all-or-nothing, refusing it would let that one stale row
    reject every other item in the batch."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "rename_to": " mantra   mk2 ", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201
    assert approved(client)[0]["changes"] == {"weight": "70"}


def test_an_item_left_with_nothing_to_say_is_refused(client, gear):
    """Everything sent already matches what we hold, and there is no note. Storing
    it would put a row asking for nothing in front of the admin."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "changes": {"rename_to": "Mantra MK2"}}],
    )
    assert response.status_code == 422
    assert approved(client) == []


def test_a_product_we_do_not_hold_cannot_be_renamed(client, gear):
    """Nothing to rename. Recording it would queue a rename of a product that
    does not exist."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Brand New Line",
          "changes": {"rename_to": "Newer Line"}}],
    )
    assert response.status_code == 422
    assert approved(client) == []


def test_a_rename_is_length_capped_like_any_other_value(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK2", "changes": {"rename_to": "x" * 500}}],
    )
    assert response.status_code == 422


def test_rename_to_is_not_offered_to_the_public_box(client, gear):
    """It is a manufacturer-only key. The public form matches nothing by name, so
    it corrects `name` directly and has no business with this one."""
    from slack_data.submissions.fields import CORRECTABLE_FIELDS, unknown_fields

    assert "rename_to" not in CORRECTABLE_FIELDS["webbings"]
    assert unknown_fields("webbings", ["rename_to"]) == ["rename_to"]


# --- The guard: an id and a name that disagree, matching nothing -------------


def test_the_new_name_sent_as_identity_is_refused_not_filed_as_new(client, gear):
    """**The phantom-product path.** The brand renamed it on their side, so their
    integration now sends the new name with our id. Both handles are good; they
    simply disagree, and we can see exactly what they meant — so this is a 409
    naming the fix, not a 201 filing a product we already hold as new."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
          "name": "Mantra MK3", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 409

    detail = response.json()["detail"]
    assert "items[0]" in detail
    assert "Mantra MK2" in detail      # what we hold
    assert "rename_to" in detail       # what to do about it
    assert approved(client) == []


def test_an_unknown_id_with_an_unmatchable_name_is_refused(client, gear):
    """The same refusal without the helpful half: we hold no such id and nothing
    of theirs by that name. Sending no id at all is how a new product is filed,
    and the message says so."""
    response = post(
        client,
        [{"gear_type": "webbings", "gear_id": 99999, "name": "Brand New Line",
          "changes": {"weight": "70"}}],
    )
    assert response.status_code == 409
    assert "items[0]" in response.json()["detail"]
    assert approved(client) == []


def test_a_new_product_is_still_filed_when_no_id_is_sent(client, gear):
    """The guard above must not close the new-product path — it only fires when
    an id was sent, because only then is there a contradiction to report."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Brand New Line", "changes": {"weight": "70"}}],
    )
    assert response.status_code == 201
    assert response.json()["results"][0]["resolution"] == Resolution.UNMATCHED.value


# --- What gets stored -------------------------------------------------------


def test_an_update_is_stored_approved_not_pending(client, gear):
    """Auto-approved on arrival: the sender makes the product, so there is no
    decision left — only the JSON edit and the redeploy."""
    post(client, [{"gear_type": "webbings", "gear_id": gear["alpha_unique"].id,
                   "name": "Mantra MK2", "changes": {"weight": "70"}}])

    assert client.get("/submissions/", headers=ADMIN).json() == []  # nothing pending
    stored = approved(client)
    assert len(stored) == 1
    assert stored[0]["status"] == SubmissionStatus.APPROVED.value
    assert stored[0]["kind"] == SubmissionKind.MANUFACTURER.value


def test_an_approved_manufacturer_record_never_expires(client, gear):
    """It is work outstanding. Ageing it out would lose the job with the site
    still wrong — the same reason `expiry_for` clears the TTL on approval."""
    post(client, [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}}])
    assert approved(client)[0]["expires_at"] is None


def test_the_record_is_attributed_to_the_verified_brand(client, gear, brands):
    """Attribution comes from the credential, never from a string they sent —
    otherwise a brand could sign someone else's name to their submission."""
    alpha, _ = brands
    post(client, [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}}])

    stored = approved(client)[0]
    assert stored["submitted_by"] == f"brand-client:{CLIENT_ID}"
    assert stored["brand_id"] == alpha.id
    assert stored["gear_brand"] == "Alpha Slacklines"
    assert stored["review_note"].startswith("auto-approved")
    # Nobody looked at it. Saying otherwise would make `reviewed_at` a lie.
    assert stored["reviewed_at"] is None


def test_no_contact_details_are_copied_onto_the_records(client, gear):
    """The brand is reachable through the client record; spreading a personal
    address across 40 rows buys nothing. See models/brand_clients.py § Privacy."""
    post(client, [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}}])
    assert approved(client)[0]["submitter_email"] is None


def test_the_sku_is_persisted_even_though_it_matches_nothing_yet(client, gear):
    """We hold no SKU column, so it resolves nothing today. Recording it now is
    what avoids asking every brand to re-send theirs later."""
    post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2", "manufacturer_sku": "ALP-MK2-25",
          "changes": {"weight": "70"}}],
    )
    assert approved(client)[0]["manufacturer_sku"] == "ALP-MK2-25"


def test_applied_is_false_because_the_catalogue_cannot_be_written(client, gear):
    """The receipt reports the outcome per item from day one, so brands do not
    need a new field the day direct writes land."""
    response = post(client, [{"gear_type": "webbings", "name": "Mantra MK2",
                              "changes": {"weight": "70"}}])
    assert response.json()["results"][0]["applied"] is False


def test_a_write_permission_does_not_bypass_the_queue_today(client, gear, brand_clients, brands):
    """**Pin on the forward-compatible seam.**

    A brand holding `WRITE` still gets its update queued, because the hosted
    catalogue is a read-only file and no code path could write it. When that
    changes, `may_write_directly` is the single place to change — and this test
    is the one that must be consciously updated, rather than a behaviour that
    drifts silently.
    """
    alpha, _ = brands
    brand_clients.put(
        BrandClient(
            client_id=CLIENT_ID,
            brand_id=alpha.id,
            brand_name=alpha.name,
            permissions=[BrandPermission.WRITE],
            created_at=now_iso(),
        )
    )
    response = post(client, [{"gear_type": "webbings", "name": "Mantra MK2",
                              "changes": {"weight": "70"}}])
    assert response.status_code == 201
    assert response.json()["results"][0]["applied"] is False
    assert approved(client)[0]["status"] == SubmissionStatus.APPROVED.value

    principal = ManufacturerPrincipal(
        client_id=CLIENT_ID, brand_id=alpha.id, brand_name=alpha.name,
        permissions=[BrandPermission.WRITE],
    )
    assert may_write_directly(principal) is False


# --- Batches ----------------------------------------------------------------


def test_one_call_writes_one_record_per_product_sharing_a_batch_id(client, gear):
    """A brand with 40 products makes one call; the admin still reviews one
    product's patch at a time. The batch id is what puts them back together."""
    response = post(
        client,
        [
            {"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}},
            {"gear_type": "weblocks", "name": "Alpha Lock", "changes": {"weight": "180"}},
        ],
    )
    assert response.status_code == 201

    body = response.json()
    assert body["accepted"] == 2
    stored = approved(client)
    assert len(stored) == 2
    assert {row["batch_id"] for row in stored} == {body["batch_id"]}


def test_a_batch_note_lands_on_every_row(client, gear):
    """It is the only explanation of why 40 rows arrived at once, and the admin
    reviews them one at a time."""
    post(
        client,
        [
            {"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}},
            {"gear_type": "weblocks", "name": "Alpha Lock", "changes": {"weight": "180"}},
        ],
        note="Spring 2027 line refresh.",
    )
    assert all("Spring 2027" in row["note"] for row in approved(client))


def test_an_item_note_and_a_batch_note_are_both_kept(client, gear):
    post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"},
          "note": "Re-measured on a calibrated scale."}],
        note="Spring 2027 line refresh.",
    )
    note = approved(client)[0]["note"]
    assert "calibrated scale" in note and "Spring 2027" in note


def test_one_bad_item_rejects_the_whole_batch(client, gear):
    """All-or-nothing, so a retry is always safe. A partial batch would mean
    re-sending duplicates every one that worked the first time."""
    response = post(
        client,
        [
            {"gear_type": "webbings", "name": "Mantra MK2", "changes": {"weight": "70"}},
            {"gear_type": "webbings", "name": "Type 18", "changes": {"weight": "70"}},  # ambiguous
        ],
    )
    assert response.status_code == 409
    assert "items[1]" in response.json()["detail"]
    assert approved(client) == []


def test_a_batch_is_capped(client, gear):
    items = [
        {"gear_type": "webbings", "name": f"Line {i}", "changes": {"weight": "70"}}
        for i in range(MAX_BATCH_ITEMS + 1)
    ]
    assert post(client, items).status_code == 422


def test_an_empty_batch_is_refused(client, gear):
    assert post(client, []).status_code == 422


def test_an_oversized_body_is_refused_on_its_content_length(client, gear):
    from slack_data.api.routers.manufacturer_router import MAX_BODY_BYTES

    response = client.post(
        "/manufacturer/gear",
        content=b"{}",
        headers={
            **dev_headers(),
            "Content-Type": "application/json",
            "Content-Length": str(MAX_BODY_BYTES + 1),
        },
    )
    assert response.status_code == 413


# --- Field validation -------------------------------------------------------


def test_an_invented_field_name_is_refused(client, gear):
    """The names come from the real `<X>Update` schema — the same derived list
    the public box and the catalogue's own PATCH routes use. Never a second copy."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2",
          "changes": {"breaking_stength": "31"}}],
    )
    assert response.status_code == 422


def test_an_unknown_gear_type_is_refused(client, gear):
    response = post(client, [{"gear_type": "hats", "name": "X", "changes": {"weight": "70"}}])
    assert response.status_code == 422


def test_the_brand_foreign_key_is_not_correctable(client, gear):
    """A brand must not be able to reassign a product to another brand by
    proposing a `brand_id`. It is excluded from the derived list for everyone."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {"brand_id": "2"}}],
    )
    assert response.status_code == 422


def test_numbers_and_booleans_are_accepted_and_stored_as_json_text(client, gear):
    """A machine caller sends JSON scalars; the store holds the prose the admin
    hand-applies. Booleans render `true`/`false` because the patch is bound for
    a *.json file."""
    response = client.post(
        "/manufacturer/gear",
        json={"items": [{"gear_type": "webbings", "name": "Mantra MK2",
                         "changes": {"weight": 70, "isa_certified": True}}]},
        headers=dev_headers(),
    )
    assert response.status_code == 201
    assert approved(client)[0]["changes"] == {"weight": "70", "isa_certified": "true"}


def test_a_list_of_scalars_becomes_prose(client, gear):
    """`material` really is a list on the model, so the write must take one.

    Refusing it made `?include=spec` un-round-trippable: the read hands back
    `["Polyester"]` and the write would not accept it, forcing every caller to
    special-case the two list-valued fields in the catalogue. Rendered as prose
    because the admin reads it and hand-applies it, like every other value.
    """
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2",
          "changes": {"material": ["Polyester", "Dyneema/HMPE"]}}],
    )
    assert response.status_code == 201, response.json()
    assert approved(client)[0]["changes"]["material"] == "Polyester, Dyneema/HMPE"


def test_a_list_of_nested_values_is_still_refused(client, gear):
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2",
          "changes": {"material": [{"fiber": "Polyester"}]}}],
    )
    assert response.status_code == 422


def test_a_nested_value_is_refused(client, gear):
    response = client.post(
        "/manufacturer/gear",
        json={"items": [{"gear_type": "webbings", "name": "Mantra MK2",
                         "changes": {"weight": {"kn": 70}}}]},
        headers=dev_headers(),
    )
    assert response.status_code == 422


def test_an_item_needs_a_change_or_a_note(client, gear):
    response = post(client, [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {}}])
    assert response.status_code == 422


def test_a_note_alone_is_enough(client, gear):
    """Not every message from a brand is a field edit — "we discontinued this"
    is worth having."""
    response = post(
        client,
        [{"gear_type": "webbings", "name": "Mantra MK2", "changes": {},
          "note": "Discontinued at the end of 2026."}],
    )
    assert response.status_code == 201


def test_too_many_fields_in_one_item_is_refused(client, gear):
    changes = {f"field_{i}": "x" for i in range(MAX_ITEM_CHANGES + 1)}
    assert post(client, [{"gear_type": "webbings", "name": "X", "changes": changes}]).status_code == 422


# --- Separation from the catalogue ------------------------------------------


def test_the_router_never_writes_to_the_catalogue(session, submissions, brand_clients, gear):
    """**The mistake that passes locally and fails hosted.**

    This router reads the catalogue — it has to, to answer "which of your
    products is this?" — and reads are fine on the live site. A write is not:
    the file is opened `mode=ro&immutable=1`. So the session handed to it here
    explodes on any write, and the endpoint must still work.
    """
    def explode(*args, **kwargs):
        raise AssertionError("the manufacturer router must not write to the catalogue")

    session.add = explode
    session.commit = explode
    session.delete = explode

    app = FastAPI()
    register_routers(app, read_only=False)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_repository] = lambda: submissions
    app.dependency_overrides[get_client_repository] = lambda: brand_clients

    with TestClient(app) as test_client:
        assert test_client.get("/manufacturer/gear", headers=dev_headers()).status_code == 200
        response = test_client.post(
            "/manufacturer/gear",
            json={"items": [{"gear_type": "webbings", "name": "Mantra MK2",
                             "changes": {"weight": "70"}}]},
            headers=dev_headers(),
        )
        assert response.status_code == 201


def test_the_routes_are_mounted_in_read_only_mode(read_only_client, gear):
    """The hosted shape. The catalogue's writes are gone; this one must not be —
    it writes to a different database entirely."""
    assert read_only_client.get("/manufacturer/me", headers=dev_headers()).status_code == 200
    response = read_only_client.post(
        "/manufacturer/gear",
        json={"items": [{"gear_type": "webbings", "name": "Mantra MK2",
                         "changes": {"weight": "70"}}]},
        headers=dev_headers(),
    )
    assert response.status_code == 201


# --- The public box cannot impersonate a manufacturer -----------------------


def test_the_public_box_cannot_claim_the_manufacturer_kind(client):
    """Triage shows a manufacturer submission as better evidence than an
    anonymous report. If anyone could claim the kind, that badge would be worth
    nothing."""
    response = client.post(
        "/submissions/",
        json={"kind": "manufacturer", "gear_type": "webbings", "gear_id": 1,
              "changes": {"weight": "70"}},
    )
    assert response.status_code == 422


def test_a_misconfigured_store_does_not_mask_the_auth_answer(client, gear, monkeypatch):
    """An unauthenticated request must get 401, whatever state the store is in.

    FastAPI resolves a route's dependencies *before* running its handler, and the
    brand-client repository is one of them — so a store that raised on
    construction used to answer **500** to a request that had no credentials at
    all, hiding the real answer. The DynamoDB repositories now build their client
    on first *use*, so an unauthenticated request never touches it.

    Found by running the real Lambda image with no `AWS_REGION`: boto3 raised
    `NoRegionError` while resolving the dependency, and `/manufacturer/me`
    returned 500 where it should have said 503.
    """
    from slack_data.manufacturers.store import get_client_repository

    class ExplodingStore:
        def get(self, client_id):
            raise AssertionError("the store must not be read on an unauthenticated request")

        def put(self, client):
            raise AssertionError("never")

        def list_for_brand(self, brand_id):
            raise AssertionError("never")

    client.app.dependency_overrides[get_client_repository] = lambda: ExplodingStore()

    assert client.get("/manufacturer/me").status_code == 401
    assert client.get("/manufacturer/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_the_dynamo_repositories_build_no_client_until_used():
    """The lazy-construction property, asserted directly.

    Constructing a repository must not require boto3, credentials or a region —
    only *using* it may. This is what keeps a dependency-resolution failure from
    preempting the auth answer above.
    """
    from slack_data.manufacturers.dynamo import DynamoBrandClientRepository
    from slack_data.submissions.dynamo import DynamoSubmissionRepository

    # No exception, no boto3 import, no environment needed.
    DynamoBrandClientRepository("some-table")
    DynamoSubmissionRepository("some-table")
