"""
Brand API clients — a brand's API key, and the brand it speaks for.

`Brand` (`slack_data/models/brands.py`) has an id and a name and no account
linkage whatsoever; this module is that linkage for machines. A brand's system
sends `Authorization: Bearer <client_id>:<secret>` (D65), and this record maps
the client id onto one of our brands and holds the secret it must match.

Until 2026-10 the credential was a Cognito app client in SlackData's own user
pool, exchanged for a token at Cognito's `/oauth2/token`. That pool is gone
(LIVE_EDITING_PLAN.md D62): SlackData keeps nothing in Cognito but the app
client the ISA made for it. The three credentials issued before then were
imported here under their existing client id and secret (D63), so no brand was
issued a new one.

**The secret is stored readable (D64)** — not hashed, not KMS-encrypted — so a
brand's manufacturer editors can see their own key in their SlackData account.
Accepted with D64: anyone who can read the table can read every brand's key.
This table is therefore never part of the daily export.

Plain pydantic, not SQLModel, for exactly the reason `models/submissions.py`
gives: these records live in DynamoDB hosted and in a separate SQLite file
locally, **never** in the catalogue database, which is opened read-only.

**Privacy.** `contact_email` is personal data about a named person at a company,
so it is optional and not required to make a client work. Unlike a submission
there is no TTL: a credential mapping that expired on its own would lock a
brand out silently.
"""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

MAX_CLIENT_ID_LENGTH = 128
MAX_BRAND_NAME_LENGTH = 200
MAX_SECRET_LENGTH = 256


class BrandPermission(str, Enum):
    """What a brand's credentials let it do.

    Retired as a decision in phase 5 (P5-J): with the catalogue store, every
    active key applies its brand's updates live (`may_write_directly()`). Kept
    so stored records still read.
    """

    SUGGEST = "suggest"
    WRITE = "write"


# What a newly registered brand gets. Nothing grants WRITE automatically.
DEFAULT_PERMISSIONS: list[BrandPermission] = [BrandPermission.SUGGEST]


class BrandClient(BaseModel):
    """One API key, and the brand it speaks for."""

    client_id: str = Field(max_length=MAX_CLIENT_ID_LENGTH)
    brand_id: int
    # Denormalized from the catalogue so that resolving a token needs no
    # catalogue read at all, and so a stored record stays readable if the brand
    # is later renamed. It is a label, never the thing matched on.
    brand_name: str = Field(max_length=MAX_BRAND_NAME_LENGTH)
    permissions: list[BrandPermission] = Field(default_factory=lambda: list(DEFAULT_PERMISSIONS))
    contact_email: str | None = None
    # The other half of the key. None on a record that has no key yet (or a
    # rolled-back onboarding): such a client authenticates nothing.
    secret: str | None = Field(default=None, max_length=MAX_SECRET_LENGTH)
    # Revocation: the key still matches, and is refused anyway.
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
    # True when the identity came from the local dev token rather than a key,
    # so anything that logs or attributes can tell them apart — the same
    # courtesy `require_admin` extends with its `dev` claim.
    dev: bool = False

    def has(self, permission: BrandPermission) -> bool:
        return permission in self.permissions

    def owns(self, brand_id: int | None) -> bool:
        """The check that matters. See `require_own_brand` in the router."""
        return brand_id is not None and brand_id == self.brand_id


def may_write_directly(principal: ManufacturerPrincipal | None = None) -> bool:
    """Whether a brand's update is applied to the catalogue, rather than queued.

    **True whenever the site reads the catalogue store** (live editing, phase
    5): a key then edits with the rights of its brand's manufacturers
    (`manufacturers/apply.py`), every active key alike — `BrandPermission` no
    longer decides (P5-J). Without the store (the baked catalogue hosted, the
    seed files locally) there is nothing to write, and an update is queued for
    a person to apply, as before phase 5. The response's `applied` reports
    which, per item, so brands' integrations need no new field.
    """
    from slack_data.catalogue.store import reads_from_store, store_configured

    return store_configured() and reads_from_store()


def now_iso() -> str:
    """Matches `models/submissions.py::now_iso` — UTC, milliseconds, `Z`."""
    stamp = datetime.now(timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}Z"
