"""
Authentication — people through their ISA account, brands through an API key.

**Hiding the admin UI is not access control.** Every admin route depends on
`require_admin`, so an unauthenticated request is rejected before a handler
runs, whatever the SPA does or doesn't render.

## People: the ISA account (LIVE_EDITING_PLAN.md § 4.2)

SlackData has no user pool of its own (D62). People sign in through the ISA's
shared pool, `isa-users`, with SlackData's own app client in it (D61), exactly
as SlackMap and SportHub do. The token says *who you are*; the people store
(`slack_data/people/`) says *what you may do here* (D8).

Three modes, chosen by configuration:

| condition | behaviour |
|---|---|
| `ISA_USER_POOL_ID` set | verify the ISA **ID** token: RS256 against the pool's JWKS, plus `iss`, `aud` (our app client), `exp`, `token_use`. Then read the person — and their roles — from the people store, on every request (D30). |
| unset, but hosted (`deployment.is_hosted()`) | **reject everything** with 503. A hosted deploy that lost its configuration must not fall back to anything. |
| unset, local dev | accept a static bearer token (`ADMIN_DEV_TOKEN`) as a local admin, so `fastapi dev` and Cypress work with no AWS account. |

That middle row is the one that matters. The dev path is not "off by default in
production" — it is unreachable in production, because reaching it requires the
absence of a pool *and* that `deployment.is_hosted()` answers no, which takes
the Lambda runtime's own `AWS_LAMBDA_FUNCTION_NAME`, the image's
`SLACKDATA_DEPLOYMENT=hosted` and the baked catalogue all being absent at once.
`tests/test_auth.py` asserts it.

**Authentic is not authorised.** A valid ISA token proves the person has an ISA
account — tens of thousands do. Admin is a role in the people store, granted by
another admin (a logged change) or, the first time only, by the bootstrap
allowlist (§ 4.4). There is deliberately no value of any variable that makes
every signed-in person an admin.

**The audience is the guard against other ISA apps.** SlackMap's, SportHub's
and the timer's tokens are signed by the same pool with the same keys. Only
`aud == ISA_CLIENT_ID` says a token was issued for SlackData, so `aud` is
required, never skipped.

The JWKS cache is a module-level dict with a TTL, the same pattern (and for the
same reason) as `slack_data/utilities/fx.py`: Lambda's filesystem is read-only,
so a module global is the only cache available.

## Brands: an API key (D63–D65)

A brand's system sends `Authorization: Bearer <client_id>:<secret>` on every
call. The key lives in our own `slackdata-brand-clients` table, beside the
brand it speaks for, so revoking one is one `put` and takes effect on the next
request. No Cognito is involved, so this path has no "no pool configured"
state to fail closed on — a key either matches a stored one or it doesn't. The
local dev token (`MANUFACTURER_DEV_TOKEN:<client_id>`) is honoured only when
not hosted.
"""

import hmac
import os
import time
from typing import Annotated

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.changelog.writer import commit_person_change
from slack_data.manufacturers.store import ClientRepositoryDep
from slack_data.models.brand_clients import now_iso
from slack_data.models.changes import (
    Action,
    ChangeRecord,
    Channel,
    FieldChange,
    TargetType,
)
from slack_data.models.people import Person, Role, isa_id_for
from slack_data.people.repository import email_key
from slack_data.people.store import PeopleRepositoryDep

# The ISA's shared pool and SlackData's app client in it (D61). Public values —
# both appear in every ID token — but they are configuration, not constants, so
# a local run without them takes the dev path.
ISA_USER_POOL_ID = os.getenv("ISA_USER_POOL_ID")
ISA_CLIENT_ID = os.getenv("ISA_CLIENT_ID")
ISA_REGION = os.getenv("ISA_REGION", os.getenv("AWS_REGION", "eu-central-1"))

# Local-dev only; see the table above. A constant default keeps `fastapi dev`
# and the Cypress suite working with no setup, and is safe precisely because the
# branch that reads it cannot execute in a hosted deploy.
ADMIN_DEV_TOKEN = os.getenv("ADMIN_DEV_TOKEN", "dev-admin-token")
DEV_ADMIN_SUB = "dev-admin"
# Locally, "dev-person-token:<name>" signs in as an ordinary account of that
# name (no role), so a manufacturer's flow — ask, be approved, edit — can be
# driven locally and in Cypress. The same lockout as the admin token: never
# hosted, never with a pool configured.
DEV_PERSON_PREFIX = "dev-person-token:"

# Local-dev only, and the same unreachable-in-production branch as
# ADMIN_DEV_TOKEN. Sent as "<token>:<client_id>", so local runs resolve a brand
# through the real registration path.
MANUFACTURER_DEV_TOKEN = os.getenv("MANUFACTURER_DEV_TOKEN", "dev-manufacturer-token")

JWKS_TTL_SECONDS = 12 * 60 * 60
HTTP_TIMEOUT_SECONDS = 5.0

# auto_error=False so a missing header produces our own 401 with a WWW-Authenticate
# header, rather than FastAPI's bare 403.
_bearer = HTTPBearer(auto_error=False)

_jwks_cache: dict[str, object] = {"keys": {}, "fetched_at": 0.0}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _hosted() -> bool:
    """Read at call time, not import time, so tests can set it per-case."""
    from slack_data.deployment import is_hosted

    return is_hosted()


# --- The ISA token ----------------------------------------------------------


def issuer() -> str:
    return f"https://cognito-idp.{ISA_REGION}.amazonaws.com/{ISA_USER_POOL_ID}"


def _fetch_jwks() -> dict[str, jwt.PyJWK]:
    response = httpx.get(f"{issuer()}/.well-known/jwks.json", timeout=HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    return {key["kid"]: jwt.PyJWK(key) for key in response.json()["keys"]}


def signing_key(kid: str) -> jwt.PyJWK:
    """The pool's public key for `kid`, cached with a TTL.

    An unknown `kid` forces one refetch before giving up, which is what makes
    key rotation a single slow request rather than a 12-hour outage.
    """
    keys = _jwks_cache["keys"]
    fresh = time.time() - float(_jwks_cache["fetched_at"]) < JWKS_TTL_SECONDS

    if not keys or not fresh or kid not in keys:
        try:
            keys = _fetch_jwks()
        except Exception as error:  # network, 5xx, malformed JSON
            if kid in _jwks_cache["keys"]:
                # Stale but usable beats a 500 while Cognito is unreachable.
                return _jwks_cache["keys"][kid]
            raise _unauthorized("cannot verify token signing key") from error
        _jwks_cache["keys"] = keys
        _jwks_cache["fetched_at"] = time.time()

    if kid not in keys:
        raise _unauthorized("unknown token signing key")
    return keys[kid]


def verify_isa_token(token: str) -> dict:
    """Decode and fully verify an ISA **ID** token issued for SlackData."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as error:
        raise _unauthorized("malformed token") from error

    kid = header.get("kid")
    if not kid:
        raise _unauthorized("token has no key id")

    try:
        claims = jwt.decode(
            token,
            key=signing_key(kid).key,
            # Pinned, not read from the header: accepting the token's own
            # algorithm choice is how `alg: none` and HMAC-with-the-public-key
            # forgeries get in.
            algorithms=["RS256"],
            # Required, never skipped: every other ISA app's tokens are signed
            # by this same pool. See the module docstring.
            audience=ISA_CLIENT_ID,
            issuer=issuer(),
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as error:
        raise _unauthorized(f"invalid token: {error}") from error

    # Access tokens are signed by the same pool and carry no audience we have
    # verified. Insist on an ID token explicitly.
    if claims.get("token_use") != "id":
        raise _unauthorized("expected an id token")

    return claims


# --- The person behind a token ----------------------------------------------


def bootstrap_emails() -> set[str]:
    """`ADMIN_BOOTSTRAP_EMAILS`, comma separated — the first admins (§ 4.4).

    Read at call time. Set from the deployer's shell, never committed: the repo
    is public and these are people's addresses.
    """
    raw = os.getenv("ADMIN_BOOTSTRAP_EMAILS") or ""
    return {key for key in (email_key(part) for part in raw.split(",")) if key}


def _claim_bool(value) -> bool:
    """Cognito sends `email_verified` as a JSON boolean, but as the string
    "true" for some federated sign-ins."""
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _profile_from_claims(claims: dict) -> dict:
    username = claims.get("cognito:username") or claims["sub"]
    return {
        "isa_id": isa_id_for(username),
        "given_name": claims.get("name"),
        "family_name": claims.get("family_name"),
        "email": claims.get("email"),
        "email_verified": _claim_bool(claims.get("email_verified")),
    }


def sync_person(claims: dict, people, log) -> Person:
    """The people record for a verified token: created on first sight,
    refreshed from the token when the ISA account changed, and granted admin
    once if its verified address is on the bootstrap allowlist."""
    profile = _profile_from_claims(claims)
    person = people.get(claims["sub"])

    if person is None:
        person = Person(sub=claims["sub"], **profile)
        changed = True
    else:
        if person.anonymised:
            # Erased (D11): the name is not taken back from the token.
            profile.update(given_name=None, family_name=None)
        updates = {key: value for key, value in profile.items() if getattr(person, key) != value}
        changed = bool(updates)
        if changed:
            person = person.model_copy(update={**updates, "updated_at": now_iso()})

    if (
        not person.has(Role.ADMIN)
        and person.bootstrapped_at is None
        and person.email_verified
        and email_key(person.email) in bootstrap_emails()
    ):
        granted = person.model_copy(
            update={
                "roles": [*person.roles, Role.ADMIN],
                "bootstrapped_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        record = ChangeRecord(
            target_type=TargetType.PERSON,
            target_id=granted.isa_id,
            action=Action.ROLE_GRANT,
            actor_sub=granted.sub,
            actor_isa_id=granted.isa_id,
            actor_role="bootstrap",
            channel=Channel.BOOTSTRAP,
            changes={
                "roles": FieldChange(
                    before=[r.value for r in person.roles],
                    after=[r.value for r in granted.roles],
                )
            },
            why="On the ADMIN_BOOTSTRAP_EMAILS allowlist, with a verified address.",
        )
        commit_person_change(people, log, granted, record)
        return granted

    if changed:
        people.put(person)
    return person


def _dev_admin(people) -> Person:
    """The local dev identity: a stored person, so roles, notices and grants
    behave locally exactly as they do hosted."""
    person = people.get(DEV_ADMIN_SUB)
    if person is None:
        person = people.put(
            Person(
                sub=DEV_ADMIN_SUB,
                isa_id="ISA_DEVADMIN",
                given_name="Local",
                family_name="Admin",
                email="dev-admin@localhost",
                email_verified=True,
                roles=[Role.ADMIN],
            )
        )
    return person


def _dev_person(people, name: str) -> Person:
    """A local ordinary account, created on first sight (DEV_PERSON_PREFIX)."""
    slug = "".join(c for c in name.lower() if c.isalnum())[:24]
    if not slug:
        raise _unauthorized("a dev person token needs a name")
    sub = f"dev-person-{slug}"
    person = people.get(sub)
    if person is None:
        person = people.put(
            Person(
                sub=sub,
                isa_id=f"ISA_DEV{slug.upper()[:8]}",
                given_name=name[:50],
                email=f"{slug}@localhost",
                email_verified=True,
            )
        )
    return person


def require_person(
    people: PeopleRepositoryDep,
    log: ChangeLogRepositoryDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Person:
    """FastAPI dependency: the signed-in person, from the people store."""
    if credentials is None or not credentials.credentials:
        raise _unauthorized("sign-in required")

    token = credentials.credentials

    if ISA_USER_POOL_ID:
        return sync_person(verify_isa_token(token), people, log)

    # No pool configured. Hosted, that is a misconfiguration, and the only safe
    # response is to stay shut — never to fall through to the dev token.
    if _hosted():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sign-in is not configured",
        )

    if token.startswith(DEV_PERSON_PREFIX):
        return _dev_person(people, token[len(DEV_PERSON_PREFIX):])
    if token != ADMIN_DEV_TOKEN:
        raise _unauthorized("invalid dev admin token")
    return _dev_admin(people)


def is_dev_person(person: Person) -> bool:
    return person.sub == DEV_ADMIN_SUB and not ISA_USER_POOL_ID


def require_admin(person: Annotated[Person, Depends(require_person)]) -> Person:
    """FastAPI dependency guarding every admin route."""
    if not person.has(Role.ADMIN):
        # 403, not 401: the sign-in is genuine and doing it again produces an
        # identical one. The person simply is not an admin.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="this account is not an admin")
    return person


# --- Manufacturers: API keys ------------------------------------------------

# Compared against when a client id is unknown, so the time a refusal takes
# does not say whether the id exists.
_NO_SUCH_SECRET = "x" * 43


def _resolve_brand(client_id: str, clients, dev: bool = False):
    """Map an authenticated client id onto the brand it speaks for.

    Not cached — revocation that takes effect "eventually" is not revocation.
    """
    from slack_data.models.brand_clients import BrandPermission, ManufacturerPrincipal

    record = clients.get(client_id)
    if record is None or not record.active:
        # 403, not 401: the key was right, it is simply not (or no longer)
        # registered to a brand.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="these credentials are not registered to a brand",
        )

    if not any(
        permission in record.permissions
        for permission in (BrandPermission.SUGGEST, BrandPermission.WRITE)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="these credentials may not submit gear data",
        )

    return ManufacturerPrincipal(
        client_id=record.client_id,
        brand_id=record.brand_id,
        brand_name=record.brand_name,
        permissions=record.permissions,
        dev=dev,
    )


def verify_api_key(token: str, clients) -> str:
    """`<client_id>:<secret>` → the client id, or 401. Constant-time compare."""
    client_id, separator, secret = token.partition(":")
    if not separator or not client_id or not secret:
        raise _unauthorized("expected an API key: <client_id>:<secret>")

    record = clients.get(client_id)
    stored = record.secret if record is not None and record.secret else _NO_SUCH_SECRET
    matches = hmac.compare_digest(stored.encode("utf-8"), secret.encode("utf-8"))
    if record is None or not record.secret or not matches:
        raise _unauthorized("invalid API key")
    return client_id


def require_manufacturer(
    clients: ClientRepositoryDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """FastAPI dependency guarding every manufacturer route.

    Returns a `ManufacturerPrincipal` rather than raw credentials, so
    `principal.owns(brand_id)` is the one obvious way to answer the only
    authorization question that matters here.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("manufacturer authentication required")

    token = credentials.credentials

    prefix, _, dev_client_id = token.partition(":")
    if prefix == MANUFACTURER_DEV_TOKEN and not _hosted():
        if not dev_client_id:
            raise _unauthorized("invalid dev manufacturer token")
        # Resolved through the real repository, so local dev and Cypress
        # exercise the registration path rather than a shortcut around it.
        return _resolve_brand(dev_client_id, clients, dev=True)

    return _resolve_brand(verify_api_key(token, clients), clients)
