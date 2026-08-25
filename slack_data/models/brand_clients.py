"""
Brand API clients — the link between a Cognito app client and one of our brands.

`Brand` (`slack_data/models/brands.py`) has an id and a name and no account
linkage whatsoever; this module is that linkage. A manufacturer authenticates
with Cognito machine-to-machine credentials (`client_credentials`), and the
access token they get back names their **app client**, not our brand. Something
has to map one to the other, and this is it.

Why a record rather than a per-brand Cognito scope (the other option in
MANUFACTURER_API_PLAN.md § Which brand is this token?): the mapping is data we
can read, audit and revoke without a redeploy, instead of configuration that
only exists inside Cognito's console. Deactivating a compromised client is one
`put` here; a scope-based mapping would need the pool edited and the token
lifetimes waited out.

Plain pydantic, not SQLModel, for exactly the reason `models/submissions.py`
gives: these records live in DynamoDB hosted and in a separate SQLite file
locally, **never** in the catalogue database, which is opened read-only.

**Privacy.** `contact_email` is personal data about a named person at a company,
so it is optional, it is the only such field here, and it is not required to
make a client work — it exists so a human can be told when their integration
starts failing. MANUFACTURER_API_PLAN.md § Open questions asks the ISA to see
this before it ships; the same GDPR constraints as SUBMISSIONS_PLAN.md § Privacy
apply. Unlike a submission there is no TTL: a credential mapping that expired on
its own would lock a brand out silently.
"""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

MAX_CLIENT_ID_LENGTH = 128
MAX_BRAND_NAME_LENGTH = 200


class BrandPermission(str, Enum):
    """What a brand's credentials let it do.

    `SUGGEST` is the whole of today. `WRITE` is declared now and **deliberately
    not honoured yet** — see `may_write_directly()` below for why, and for the
    single place that has to change when it becomes real.
    """

    SUGGEST = "suggest"
    WRITE = "write"


# What a newly registered brand gets. Nothing grants WRITE automatically.
DEFAULT_PERMISSIONS: list[BrandPermission] = [BrandPermission.SUGGEST]


class BrandClient(BaseModel):
    """One set of machine credentials, and the brand it speaks for.

    The `client_id` is Cognito's — we never see or store the secret that goes
    with it, which is why no `secretsmanager:*` grant was requested in
    `infra/ISA_ROLE_REQUEST_PHASE2.md`. The brand holds it, exchanges it for a
    token at Cognito's `/oauth2/token`, and we only ever verify a signature.
    """

    client_id: str = Field(max_length=MAX_CLIENT_ID_LENGTH)
    brand_id: int
    # Denormalized from the catalogue so that resolving a token needs no
    # catalogue read at all, and so a stored record stays readable if the brand
    # is later renamed. It is a label, never the thing matched on.
    brand_name: str = Field(max_length=MAX_BRAND_NAME_LENGTH)
    permissions: list[BrandPermission] = Field(default_factory=lambda: list(DEFAULT_PERMISSIONS))
    contact_email: str | None = None
    # Revocation without touching Cognito. A deactivated client's tokens still
    # verify — they were signed by a real pool — and are refused here instead,
    # which is the point of resolving through data rather than through scopes.
    active: bool = True
    created_at: str
    note: str | None = None


class ManufacturerPrincipal(BaseModel):
    """Who the current request is, once the token has been verified.

    Handed to the route as a resolved identity so that no handler ever has to
    re-read a claim. `brand_id` is the only thing authorization is decided on.
    """

    client_id: str
    brand_id: int
    brand_name: str
    permissions: list[BrandPermission]
    # True when the identity came from the local dev token rather than Cognito,
    # so anything that logs or attributes can tell them apart — the same
    # courtesy `require_admin` extends with its `dev` claim.
    dev: bool = False

    def has(self, permission: BrandPermission) -> bool:
        return permission in self.permissions

    def owns(self, brand_id: int | None) -> bool:
        """The check that matters. See `require_own_brand` in the router."""
        return brand_id is not None and brand_id == self.brand_id


def may_write_directly(principal: ManufacturerPrincipal) -> bool:
    """Whether this principal's update can bypass the queue and edit the catalogue.

    **Always False today, and the falseness is structural, not a policy choice.**
    The hosted catalogue is a SQLite file baked into the Lambda image and opened
    `mode=ro&immutable=1`; there is no code path that could write it, and
    `slack_data/api/routing.py` does not even mount the catalogue's write routes
    in that mode. A brand holding `WRITE` therefore still gets its update
    recorded as a submission — auto-approved, because we trust the sender, but
    applied to the root `*.json` by hand like everything else.

    This function exists so that the day the catalogue becomes writable, the
    change is *here* — and so the API's response shape already reports the
    outcome per item (`applied: true/false`) rather than having to grow a new
    field then. `tests/test_manufacturer_api.py` pins the current answer, which
    makes flipping it a deliberate act rather than a side effect.
    """
    return False


def now_iso() -> str:
    """Matches `models/submissions.py::now_iso` — UTC, milliseconds, `Z`."""
    stamp = datetime.now(timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}Z"
