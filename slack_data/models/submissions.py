"""
Submissions — the "suggest a correction" store.

**A submission is a note to the admin, not an edit.** Nothing here touches the
catalogue. The catalogue remains a read-only SQLite file baked into the Lambda
image and sourced from the root `*.json` in git; approving a submission marks
the record approved and hands the admin a JSON patch to apply by hand, followed
by a redeploy. See SUBMISSIONS_PLAN.md § "What Phase 2 is explicitly NOT".

These are plain pydantic models rather than SQLModel tables on purpose. The
records live in DynamoDB (hosted) or a separate SQLite file (local), never in
the catalogue database — mixing them would be the exact mistake the read-only
guard in `slack_data/api/routing.py` exists to prevent.

Field naming is snake_case, matching every other schema in this repo and the
TypeScript types that mirror them. SUBMISSIONS_PLAN.md sketched the DynamoDB
item in camelCase; consistency with the rest of the API won.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from slack_data.submissions.fields import GEAR_TYPES, unknown_fields

# --- Caps -------------------------------------------------------------------
# A submission is a correction, not a bulk upload. These bound what one
# unauthenticated POST can put in the store, and are asserted in the tests so
# loosening one is a deliberate act.
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

# Deliberately loose: this rejects the obviously-not-an-address, and nothing
# more. Tight email regexes reject valid addresses, and the field is optional
# contact info rather than a login — being wrong about it costs a reply, not
# access. A stricter check would also mean an `email-validator` dependency that
# Dockerfile.lambda would have to install by hand.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SubmissionKind(str, Enum):
    CORRECTION = "correction"      # an existing item is wrong
    NEW_ITEM = "new_item"          # gear the catalogue doesn't have
    MANUFACTURER = "manufacturer"  # the brand that makes it, via the authenticated API


# Kinds a member of the public may claim for themselves. `MANUFACTURER` is
# absent deliberately: it is an authenticated brand's identity, granted only
# after a token check in `/manufacturer/gear`, and triage shows it as better
# evidence than an anonymous report. If the public POST accepted it, anyone
# could paint their submission with that authority — see the validator on
# `SubmissionCreate.kind` and the test named for it.
PUBLIC_KINDS = frozenset({SubmissionKind.CORRECTION, SubmissionKind.NEW_ITEM})


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


class SubmissionCreate(BaseModel):
    """The public POST body."""

    kind: SubmissionKind = SubmissionKind.CORRECTION
    gear_type: str
    gear_id: int | None = None
    gear_name: str | None = None
    # Recorded because a submission outlives the catalogue it was made against.
    # `gear_id` is stable now — every root *.json carries an explicit `id` and
    # the loaders assign it (see load_data/_seed_io.require_seed_id) — but that
    # only guarantees the id does not MOVE; a product can still be withdrawn,
    # merged, or re-adjudicated between a submission arriving and an admin
    # reading it. `"<brand> <name>"` is unique across the whole catalogue where
    # bare `name` is not (webbings and weblocks both contain duplicate names),
    # so the pair stays the durable way to re-resolve what a submission was
    # about, and the way to notice when the id and the name disagree.
    #
    # This is the same guard `load_isa_warnings.py` uses: it records
    # `"<brand> <name>"` beside each id and verifies the pair before stamping,
    # so seed-order drift is reported instead of silently re-pointing a recall.
    gear_brand: str | None = None
    # field name -> proposed value, as strings. Values are NOT coerced to the
    # model's types: a submitter writing "about 44" is information the admin
    # wants to see, and silently dropping it as an invalid float would be worse
    # than showing it. The field *names* are validated; the values are prose.
    changes: dict[str, str] = Field(default_factory=dict)
    note: str | None = None
    source_url: str | None = None
    submitter_email: str | None = None

    # --- Anti-abuse, stripped before storage --------------------------------
    # Hidden in the form and never filled by a human. See the router: a filled
    # honeypot returns 200 with an id, so the bot learns nothing.
    website: str | None = None
    # Cloudflare Turnstile token, verified server-side.
    captcha_token: str | None = None

    @field_validator("kind")
    @classmethod
    def _public_kind_only(cls, value: SubmissionKind) -> SubmissionKind:
        """The public box cannot mint a manufacturer submission. See PUBLIC_KINDS."""
        if value not in PUBLIC_KINDS:
            raise ValueError(f"{value.value} submissions come from the manufacturer API")
        return value

    @field_validator("gear_type")
    @classmethod
    def _known_gear_type(cls, value: str) -> str:
        if value not in GEAR_TYPES:
            raise ValueError(f"unknown gear type {value!r}")
        return value

    @field_validator(
        "gear_name", "gear_brand", "note", "source_url", "submitter_email", mode="before"
    )
    @classmethod
    def _blank_is_absent(cls, value):
        """An untouched optional input posts "" — treat that as omitted."""
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value

    @field_validator("gear_name", "gear_brand")
    @classmethod
    def _name_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NAME_LENGTH:
            raise ValueError(f"names must be at most {MAX_NAME_LENGTH} characters")
        return value

    @field_validator("note")
    @classmethod
    def _note_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NOTE_LENGTH:
            raise ValueError(f"note must be at most {MAX_NOTE_LENGTH} characters")
        return value

    @field_validator("source_url")
    @classmethod
    def _url_shape(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) > MAX_URL_LENGTH:
            raise ValueError(f"source_url must be at most {MAX_URL_LENGTH} characters")
        if not value.startswith(("http://", "https://")):
            raise ValueError("source_url must be an http(s) URL")
        return value

    @field_validator("submitter_email")
    @classmethod
    def _email_shape(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) > MAX_EMAIL_LENGTH or not _EMAIL.match(value):
            raise ValueError("submitter_email is not a valid email address")
        return value

    @model_validator(mode="after")
    def _check_changes_and_target(self) -> "SubmissionCreate":
        if len(self.changes) > MAX_CHANGES:
            raise ValueError(f"at most {MAX_CHANGES} changed fields per submission")

        bad = unknown_fields(self.gear_type, self.changes)
        if bad:
            raise ValueError(
                f"{self.gear_type} has no field(s): {', '.join(bad)}"
            )

        for name, value in self.changes.items():
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} has no proposed value")
            if len(value) > MAX_VALUE_LENGTH:
                raise ValueError(
                    f"{name}: proposed value must be at most {MAX_VALUE_LENGTH} characters"
                )

        if self.kind is SubmissionKind.CORRECTION:
            if self.gear_id is None or self.gear_id <= 0:
                raise ValueError("a correction must name the item it corrects")
            if not self.changes and not self.note:
                # Nothing to review. One or the other is the whole submission.
                raise ValueError("a correction needs a changed field or a note")
        else:
            # A new item has no id yet — accepting one would produce a record
            # that looks like a correction to whatever row holds that id.
            if self.gear_id is not None:
                raise ValueError("a new item cannot reference an existing id")
            if not self.gear_name:
                raise ValueError("a new item needs a product name")

        return self


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
    # The other half of the durable identity. See SubmissionCreate.gear_brand:
    # ids drift with seed order, `"<brand> <name>"` does not.
    gear_brand: str | None = None
    changes: dict[str, str] = Field(default_factory=dict)
    note: str | None = None
    source_url: str | None = None
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


class SubmissionReceipt(BaseModel):
    """What a successful POST returns.

    Deliberately not the stored record: the submitter gets an id to quote and
    nothing else. Echoing the submission back would make the endpoint a way to
    read whatever the honeypot path pretended to store.
    """

    submission_id: str
    status: SubmissionStatus = SubmissionStatus.PENDING


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
