"""
Admin authentication — one Cognito user, verified server-side.

**Hiding the admin UI is not access control.** Every admin route depends on
`require_admin`, so an unauthenticated request is rejected before a handler
runs, whatever the SPA does or doesn't render.

Three modes, chosen by configuration:

| condition | behaviour |
|---|---|
| `COGNITO_USER_POOL_ID` set | verify the Cognito ID token: RS256 against the pool's JWKS, plus `iss`, `aud`, `exp`, `token_use` — **and membership of the admin group**. |
| unset, but `READ_ONLY` (hosted) | **reject everything.** A hosted deploy that lost its pool configuration must not fall back to anything. |
| unset, local dev | accept a static bearer token (`ADMIN_DEV_TOKEN`), so `fastapi dev` and Cypress work with no AWS account. |

That middle row is the one that matters. The dev path is not "off by default in
production" — it is unreachable in production, because reaching it requires the
absence of a pool *and* the absence of `CATALOG_DB_PATH`, and the hosted image
sets the latter unconditionally in Dockerfile.lambda. `tests/test_auth.py`
asserts it.

The JWKS cache is a module-level dict with a TTL, the same pattern (and for the
same reason) as `slack_data/utilities/fx.py`: Lambda's filesystem is read-only,
so a module global is the only cache available.

## Authentic is not the same as authorised

Verifying a token proves the pool signed it for our app client. It does not say
the holder may triage submissions. Without a second check the security boundary
would be "exists in the pool" — so anyone added to it for any other reason, ever,
would silently gain read access to every correction the public has submitted plus
the ability to approve, reject and close them.

So an ID token must also carry `COGNITO_ADMIN_GROUP` in its `cognito:groups`
claim. Cognito populates that claim itself for group members, so the SPA sends
nothing new.

**The guard cannot be switched off by configuration.** `COGNITO_ADMIN_GROUP`
names the group, and an unset *or blank* value falls back to `admins` rather
than to "no group required". A guard that disables itself when a variable goes
missing is worse than no guard, because it still reads as protection —
`utilities/turnstile.py` fails closed for the same reason, and so does the row
above it in that table. Removing the check is a code change, deliberately.

## Two verifiers, not one loosened verifier

Phase 4 adds a second caller: a manufacturer's machine-to-machine credentials.
Those tokens cannot pass `verify_cognito_token` and **must not be made to** —
it guards the admin login, and `tests/test_auth.py` pins its behaviour against
forged signatures, `alg: none`, wrong audiences and access tokens. Three
concrete differences:

| | admin (`verify_cognito_token`) | manufacturer (`verify_manufacturer_token`) |
|---|---|---|
| grant | authorization code + PKCE, a person | `client_credentials`, a machine |
| token | **ID** token (`token_use: "id"`) | **access** token (`token_use: "access"`) |
| identified by | `aud` == the one SPA client id | `client_id` — one app client **per brand**, resolved to a brand through data |

A client-credentials access token carries no `aud` claim at all, so passing one
to the admin path raises inside `jwt.decode` before any of our own checks run.
The two share `signing_key()` and the JWKS cache — one pool, one set of keys —
and nothing else.

Both paths keep the same rule: **no pool configured + hosted → 503, never fall
through.** That property is what makes the dev tokens in this file safe.
"""

import os
import time

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from slack_data.manufacturers.store import ClientRepositoryDep

COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
COGNITO_REGION = os.getenv("COGNITO_REGION", os.getenv("AWS_REGION", "eu-central-1"))

# Local-dev only; see the table above. A constant default keeps `fastapi dev`
# and the Cypress suite working with no setup, and is safe precisely because the
# branch that reads it cannot execute in a hosted deploy.
ADMIN_DEV_TOKEN = os.getenv("ADMIN_DEV_TOKEN", "dev-admin-token")

# The Cognito group an ID token must belong to. Not a `getenv` default: a blank
# or whitespace value — an unset shell variable expanded into the Lambda
# environment, say — must land on the group name too, never on "no group
# required". There is deliberately no value that turns the check off.
COGNITO_ADMIN_GROUP = (os.getenv("COGNITO_ADMIN_GROUP") or "").strip() or "admins"

# The scope the manufacturer resource server declares. A brand's token must
# carry it — an access token from the same pool with any other scope (a future
# read-only integration, say) is not permission to write gear data.
MANUFACTURER_SCOPE = os.getenv("COGNITO_MANUFACTURER_SCOPE", "slackdata/gear.write")

# Local-dev only, and the same unreachable-in-production branch as
# ADMIN_DEV_TOKEN. Sent as "<token>:<client_id>", because unlike the admin —
# who is one person — a manufacturer request has to say *which brand* it is,
# and that resolution should be exercised locally exactly as it is hosted.
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


def issuer() -> str:
    return f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"


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


def verify_cognito_token(token: str) -> dict:
    """Decode and fully verify a Cognito **ID** token, and require the admin group.

    401 if the token is not a valid ID token from our pool; 403 if it is, but
    the holder is not in `COGNITO_ADMIN_GROUP`.
    """
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
            audience=COGNITO_CLIENT_ID,
            issuer=issuer(),
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as error:
        raise _unauthorized(f"invalid token: {error}") from error

    # Access tokens are signed by the same pool and would otherwise pass. They
    # carry no user identity we've verified an audience for, so insist on an ID
    # token explicitly.
    if claims.get("token_use") != "id":
        raise _unauthorized("expected an id token")

    # Authorisation, not authenticity — see the module docstring. A token with
    # no `cognito:groups` claim at all is the common case (any pool member who
    # was never put in a group) and is rejected by the same expression.
    groups = claims.get("cognito:groups") or []
    if COGNITO_ADMIN_GROUP not in groups:
        # 403, not 401: the token is genuine and signing in again produces an
        # identical one. Nothing is wrong with the credential — the person
        # simply is not an admin.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="this account is not an admin",
        )

    return claims


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """FastAPI dependency guarding every admin route. Returns the admin's claims."""
    if credentials is None or not credentials.credentials:
        raise _unauthorized("admin authentication required")

    token = credentials.credentials

    if COGNITO_USER_POOL_ID:
        return verify_cognito_token(token)

    # No pool configured. Hosted, that is a misconfiguration, and the only safe
    # response is to stay shut — never to fall through to the dev token.
    if _hosted():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin authentication is not configured",
        )

    if token != ADMIN_DEV_TOKEN:
        raise _unauthorized("invalid dev admin token")
    return {
        "sub": "dev-admin",
        "token_use": "id",
        "cognito:groups": [COGNITO_ADMIN_GROUP],
        "dev": True,
    }


def _hosted() -> bool:
    """Read at call time, not import time, so tests can set it per-case."""
    from slack_data import database

    return database.READ_ONLY


# --- Manufacturers (Phase 4) ------------------------------------------------


def verify_manufacturer_token(token: str) -> dict:
    """Decode and fully verify a Cognito **client-credentials access** token.

    Deliberately not `verify_cognito_token` with looser arguments. The checks
    differ in kind, not in strictness:

    - `verify_aud: False` because a machine-to-machine token has **no `aud`
      claim to check**. The audience's job — "this token was issued for us" —
      is done instead by `iss` (our pool signed it), `client_id` (we registered
      that client) and `scope` (we granted it this permission). Dropping the
      audience check without those three would be a hole; with them it is the
      correct shape for the grant.
    - `token_use == "access"`, the exact inverse of the admin path. An ID token
      here would mean a *person* logging in with a browser flow, which is not
      what this endpoint is for.
    """
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
            # Pinned for the same reason as the admin path: accepting the
            # token's own algorithm choice is how `alg: none` forgeries get in.
            algorithms=["RS256"],
            issuer=issuer(),
            options={
                "require": ["exp", "iss", "sub"],
                "verify_aud": False,  # see the docstring — there is no aud
            },
        )
    except jwt.PyJWTError as error:
        raise _unauthorized(f"invalid token: {error}") from error

    if claims.get("token_use") != "access":
        raise _unauthorized("expected a client-credentials access token")

    if not claims.get("client_id"):
        raise _unauthorized("token names no client")

    # Space-delimited, per RFC 6749. Membership, not prefix matching: a scope
    # named "slackdata/gear.write.nothing" must not satisfy "slackdata/gear.write".
    if MANUFACTURER_SCOPE not in str(claims.get("scope", "")).split():
        raise _unauthorized(f"token lacks the {MANUFACTURER_SCOPE} scope")

    return claims


def _resolve_brand(client_id: str, clients, dev: bool = False):
    """Map a verified client id onto the brand it speaks for.

    The lookup is the whole reason the mapping lives in data rather than in a
    per-brand Cognito scope: deactivating a leaked credential is one `put`
    here and takes effect on the very next request. It is **not** cached —
    revocation that takes effect "eventually" is not revocation. See
    `slack_data/manufacturers/store.py`.
    """
    from slack_data.models.brand_clients import BrandPermission, ManufacturerPrincipal

    record = clients.get(client_id)
    if record is None or not record.active:
        # 403, not 401: the token is genuine and re-authenticating will produce
        # exactly the same one. Nothing about the credential is wrong — it is
        # simply not registered to a brand (or no longer is).
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


def require_manufacturer(
    clients: ClientRepositoryDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """FastAPI dependency guarding every manufacturer route.

    Returns a `ManufacturerPrincipal` rather than raw claims, so no handler
    ever has to re-read a token — and so `principal.owns(brand_id)` is the one
    obvious way to answer the only authorization question that matters here.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("manufacturer authentication required")

    token = credentials.credentials

    if COGNITO_USER_POOL_ID:
        claims = verify_manufacturer_token(token)
        return _resolve_brand(claims["client_id"], clients)

    # Same rule as the admin path, and it matters more here: this one writes.
    if _hosted():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="manufacturer authentication is not configured",
        )

    prefix, _, client_id = token.partition(":")
    if prefix != MANUFACTURER_DEV_TOKEN or not client_id:
        raise _unauthorized("invalid dev manufacturer token")
    # Resolved through the real repository, so local dev and Cypress exercise
    # the registration path rather than a shortcut around it.
    return _resolve_brand(client_id, clients, dev=True)
