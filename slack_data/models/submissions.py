"""
Submissions — the triage store.

**A submission is a note to the admin, not an edit.** Nothing here touches the
catalogue. Since phase 6 (LIVE_EDITING_PHASE_6.md, D56) nobody can send one
any more — anyone with an ISA account edits instead. What the store still
holds: the suggestions sent before the public box was switched off, until an
admin deals with them (by editing the item, then marking them handled) or they
expire; and the manufacturer API's to-do rows — photo links someone has to
upload by hand (P5-H).

These are plain pydantic models rather than SQLModel tables on purpose. The
records live in DynamoDB (hosted) or a separate SQLite file (local), never in
the catalogue database — mixing them would be the exact mistake the read-only
guard in `slack_data/api/routing.py` exists to prevent.

Field naming is snake_case, matching every other schema in this repo and the
TypeScript types that mirror them. SUBMISSIONS_PLAN.md sketched the DynamoDB
item in camelCase; consistency with the rest of the API won.
"""

import os
from datetime import datetime, timedelta, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator

# --- Caps -------------------------------------------------------------------
# What one manufacturer update can put in a record (manufacturer_updates.py).
MAX_CHANGES = 20
MAX_VALUE_LENGTH = 200
MAX_NOTE_LENGTH = 2000
MAX_URL_LENGTH = 500
MAX_NAME_LENGTH = 200
MAX_EMAIL_LENGTH = 254

# How long a record lives before DynamoDB's TTL removes it. 12 months, pending
# the ISA's answer (infra/ISA_ROLE_REQUEST_PHASE2.md).
#
# **Read here and nowhere else.** It used to live in `submissions_router.py` and
# be passed to `expiry_for` on create only, which meant `review()` — in both
# repositories — silently re-stamped every reviewed record with the hardcoded
# 365-day default. Setting the env var to 90 would then have shortened retention
# for pending records and *lengthened* it for reviewed ones, which is the exact
# opposite of what configuring a retention policy is supposed to do. Making
# `expiry_for` the only reader of the variable makes the setting mean one thing.
RETENTION_DAYS = int(os.getenv("SUBMISSION_RETENTION_DAYS", "365"))

class SubmissionKind(str, Enum):
    CORRECTION = "correction"      # an existing item is wrong
    NEW_ITEM = "new_item"          # gear the catalogue doesn't have
    MANUFACTURER = "manufacturer"  # the brand that makes it, via the authenticated API




class SubmissionStatus(str, Enum):
    """The triage lifecycle.

    `APPROVED` is deliberately **not** the end. Approving says "this report is
    right"; the catalogue is only actually corrected once someone edits the root
    `*.json` and redeploys, and `APPLIED` is the admin recording that they did.
    Without that distinction an approved record reads as done while the wrong
    number is still on the site — and would eventually be deleted by the TTL
    with the work never finished. See SUBMISSIONS_PLAN.md § A fourth status.
    """

    PENDING = "pending"
    APPROVED = "approved"   # right, but the JSON edit is still outstanding
    APPLIED = "applied"     # edited, committed, deployed — actually fixed
    REJECTED = "rejected"


# Work is finished on these; an APPROVED record still has a job attached to it.
TERMINAL_STATUSES = frozenset({SubmissionStatus.APPLIED, SubmissionStatus.REJECTED})


class SubmissionReview(BaseModel):
    """The admin PATCH body. It can never touch `changes`."""

    status: SubmissionStatus
    review_note: str | None = None

    @field_validator("status")
    @classmethod
    def _never_back_to_pending(cls, value: SubmissionStatus) -> SubmissionStatus:
        # "Un-reviewing" isn't a workflow — it would only hide the outcome.
        if value is SubmissionStatus.PENDING:
            raise ValueError("a review must approve, reject or mark applied")
        return value

    @field_validator("review_note")
    @classmethod
    def _note_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NOTE_LENGTH:
            raise ValueError(f"review_note must be at most {MAX_NOTE_LENGTH} characters")
        return value


class Submission(BaseModel):
    """A stored record — what the repository reads and writes.

    This is also the admin-facing response model. There is no public read route,
    so there is no second, redacted shape to keep in step: everything here is
    only ever served to an authenticated admin.
    """

    submission_id: str
    kind: SubmissionKind
    gear_type: str
    gear_id: int | None = None
    # Denormalized so the triage list renders without touching the catalogue —
    # and so a record still reads correctly after the item is renamed.
    gear_name: str | None = None
    # The other half of the durable identity: `"<brand> <name>"` is unique
    # where a bare name is not, so the pair re-resolves what a record was about.
    gear_brand: str | None = None
    changes: dict[str, str] = Field(default_factory=dict)
    note: str | None = None
    source_url: str | None = None
    # Links to photos, from the manufacturer API only. Recorded, not fetched:
    # an admin adds them by hand on the item's page. Empty,
    # not null, when there are none, and for every record stored before the
    # field existed (both stores map an absent value to []).
    image_urls: list[str] = Field(default_factory=list)
    submitter_email: str | None = None
    # Who sent it. Null for the public box — an anonymous suggestion box that
    # attributes is not one. A manufacturer submission carries
    # `brand-client:<cognito app client id>`, prefixed so it can never be
    # confused with a Phase 3 contributor's bare Cognito `sub`.
    submitted_by: str | None = None
    # The brand this speaks for, when the sender was authenticated as one.
    # Denormalized beside `submitted_by` for the same reason `gear_name` is:
    # triage must render without touching the catalogue.
    brand_id: int | None = None
    # One POST of N products writes N records sharing this id, so triage can
    # group them back into the call the manufacturer actually made. Storing one
    # record per item (rather than one per batch) keeps the review unit the
    # thing the admin acts on — a single product's JSON patch.
    batch_id: str | None = None
    # The manufacturer's own part number. We hold no SKU column in the
    # catalogue, so this does not resolve anything today — it is recorded
    # because it is the only identifier both sides agree on permanently, and
    # asking every brand to re-send theirs later is worse than writing a column
    # now. The admin can promote it into the root *.json at patch time.
    manufacturer_sku: str | None = None
    status: SubmissionStatus = SubmissionStatus.PENDING
    created_at: str
    reviewed_at: str | None = None
    review_note: str | None = None
    # DynamoDB TTL: unix *seconds*, and the attribute must be a Number. Deletion
    # is free and needs no scheduled job.
    #
    # **None means "never expire"** — DynamoDB simply ignores an item whose TTL
    # attribute is absent, and `_to_item` drops nulls. That is what `APPROVED`
    # uses: a correction we have agreed with but not yet shipped must not be
    # swept away with the work still outstanding. Pending records keep their
    # expiry so abandoned spam ages out on its own.
    expires_at: int | None = None


def now_iso() -> str:
    """UTC, millisecond precision, `Z`-suffixed — sorts correctly as a string.

    Milliseconds rather than seconds because this is the DynamoDB GSI's sort
    key, and the triage query is "oldest first": at second precision a burst of
    submissions ties, and a tie leaves DynamoDB free to return them in any order.
    """
    stamp = datetime.now(timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}Z"


def expiry_for(
    status: SubmissionStatus, days: int | None = None, now: datetime | None = None
) -> int | None:
    """When a record in this status should expire, or None for never.

    The whole point is the `APPROVED` row: it is the one state with unfinished
    work attached, so it is the one state that must not age out.

    `days` defaults to `RETENTION_DAYS` rather than to a literal, so a caller
    that does not care about retention cannot accidentally overrule the
    configured policy — which is what every `review()` implementation used to do.
    """
    if status is SubmissionStatus.APPROVED:
        return None
    return expiry_epoch(now, days=days)


def expiry_epoch(created: datetime | None = None, days: int | None = None) -> int:
    """When a record self-deletes. See SUBMISSIONS_PLAN.md § Privacy."""
    base = created or datetime.now(timezone.utc)
    return int((base + timedelta(days=RETENTION_DAYS if days is None else days)).timestamp())
