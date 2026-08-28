"""
What a manufacturer sends, and what they get back.

The wire shape for `POST /manufacturer/gear`. It is deliberately *not*
`SubmissionCreate`: that model is the public form's body, carrying a honeypot, a
captcha token and a submitter email, none of which mean anything to a machine
holding OAuth credentials. What the two do share is everything that matters —
the field names are validated against the same derived list
(`submissions/fields.py`), and each item becomes an ordinary `Submission`.

**One call, N products, N records.** A brand with 40 items makes one request;
it writes 40 submissions sharing a `batch_id`, because the unit an admin acts
on is one product's JSON patch, not a wall of 40. Triage groups them back.

**All-or-nothing.** If any item fails to resolve, nothing is stored and the
whole call is refused, naming the item by index. The alternative — partial
success — makes a retry unsafe: re-sending the batch would duplicate every item
that worked the first time, and the queue would fill with near-identical rows
that the admin has to diff by hand. Refusing wholesale means a retry is always
the right move. (True idempotency across retries would need a lookup by an
idempotency key the store has no index for; a repeat therefore does create a
second batch, which triage shows as two groups rather than hiding.)
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from slack_data.models.submissions import (
    MAX_NAME_LENGTH,
    MAX_NOTE_LENGTH,
    MAX_URL_LENGTH,
    MAX_VALUE_LENGTH,
    SubmissionStatus,
)
from slack_data.submissions.fields import (
    GEAR_TYPES,
    manufacturer_fields,
    unknown_fields,
)

# --- Caps -------------------------------------------------------------------
# Higher than the public box's, because the caller is authenticated and is
# expected to send their whole catalogue. Still bounded: these are what stop one
# request becoming an unbounded write, and the route's Content-Length check
# rejects an oversized body before any of this runs.
MAX_BATCH_ITEMS = 50
# Above the field count of every `<X>Update` model, so this never truncates a
# complete product — it exists to catch a caller looping something it shouldn't.
MAX_ITEM_CHANGES = 60
MAX_SKU_LENGTH = 100


class Resolution(str, Enum):
    """How an item was matched. Mirrors `manufacturers/matching.py::Resolution`.

    Declared here too because it is part of the response contract, and the
    TypeScript types are written from this file. The two are asserted equal in
    `tests/test_manufacturer_api.py` rather than one importing the other, so
    that the wire shape cannot drift when the matcher gains an internal state.
    """

    BY_ID = "id"
    BY_NAME = "name"
    UNMATCHED = "new"


def _as_text(value) -> str:
    """A machine may send a JSON number or boolean; the store holds prose.

    Values stay strings for the same reason the public box's do: the admin reads
    them and hand-applies them, and a submitter's "about 44" is information, not
    a parse error. Booleans are rendered JSON-style (`true`, not `True`) because
    the patch is destined for a `*.json` file.
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value) if isinstance(value, float) else str(value)
    return value


class ManufacturerGearItem(BaseModel):
    """One product in the batch."""

    gear_type: str
    # Our id, from `GET /manufacturer/gear`. Optional, and never trusted alone:
    # the catalogue's ids are stable now (every seed carries an explicit `id`),
    # but the caller's copy of them is not, so the matcher verifies this against
    # `name` and re-resolves if they disagree. See matching.py.
    gear_id: int | None = None
    # Their name for it. Worth sending even with an id — it is what makes a
    # drifted id recoverable instead of an error.
    name: str | None = None
    # Their part number. Stored, not matched on; see models/submissions.py.
    manufacturer_sku: str | None = None
    # A new name for the product, beside the `name` that says which product it
    # is. Its own field rather than a `changes` key, and that is not a stylistic
    # choice: `changes` is `dict[str, str]` and stringifies its values, so a
    # JSON `null` arrived there as the word "null" and the router had to match
    # it back out — which also meant a product could never be renamed to the
    # literal string "null". Here a null is a null.
    #
    # `?include=spec` mirrors this exactly: `name` and `rename_to` sit on the
    # ROW, `spec` holds only real fields. So the row a brand reads has the same
    # shape as the item they post, and the spec dict goes straight into
    # `changes` untouched.
    rename_to: str | None = None
    # Only real correctable fields. `name` is refused here — see
    # `_check_changes` — because it is the handle this item is matched by.
    changes: dict[str, str] = Field(default_factory=dict)
    note: str | None = None
    source_url: str | None = None

    @field_validator("changes", mode="before")
    @classmethod
    def _stringify(cls, value):
        if not isinstance(value, dict):
            return value
        out = {}
        for name, raw in value.items():
            if isinstance(raw, dict):
                # ValueError, not TypeError, despite this being a type problem:
                # pydantic converts ValueError into a 422 field error and lets a
                # TypeError escape as a 500. (ruff's TRY004 wants the opposite.)
                raise ValueError(  # noqa: TRY004
                    f"{name}: expected a scalar value, not a nested object"
                )
            if isinstance(raw, list):
                # A **list of scalars** is accepted and rendered as prose, because
                # some fields really are lists — `material` on webbings and
                # rollers is `list[FiberMaterial]`. Refusing it made
                # `GET /manufacturer/gear?include=spec` un-round-trippable: the
                # read hands back `["Polyester"]` and the write would not take
                # it, so every caller had to special-case two field names.
                # Nested containers are still refused, by the recursion below.
                if any(isinstance(part, (dict, list)) for part in raw):
                    raise ValueError(
                        f"{name}: expected a list of scalar values, not nested ones"
                    )
                out[name] = ", ".join("null" if part is None else _as_text(part) for part in raw)
                continue
            if raw is None:
                # Explicit null is meaningful ("we no longer publish a price"),
                # and an empty string would read as a value of "". The admin
                # sees the word and clears the field.
                out[name] = "null"
            else:
                out[name] = _as_text(raw)
        return out

    @field_validator("gear_type")
    @classmethod
    def _known_gear_type(cls, value: str) -> str:
        if value not in GEAR_TYPES:
            raise ValueError(f"unknown gear type {value!r}")
        return value

    @field_validator("name", "rename_to", "manufacturer_sku", "note", "source_url", mode="before")
    @classmethod
    def _blank_is_absent(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value

    @field_validator("gear_id")
    @classmethod
    def _positive_id(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("gear_id must be a positive integer")
        return value

    @field_validator("name", "rename_to")
    @classmethod
    def _name_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NAME_LENGTH:
            raise ValueError(f"name must be at most {MAX_NAME_LENGTH} characters")
        return value

    @field_validator("manufacturer_sku")
    @classmethod
    def _sku_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_SKU_LENGTH:
            raise ValueError(f"manufacturer_sku must be at most {MAX_SKU_LENGTH} characters")
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

    @model_validator(mode="after")
    def _check_changes(self) -> "ManufacturerGearItem":
        # Named before the generic unknown-field check, because `name` IS a real
        # correctable field everywhere else and "webbings has no field 'name'"
        # would be a confusing lie. This is the one rule that differs between
        # the public box and this API, so it gets its own sentence.
        if "name" in self.changes:
            raise ValueError(
                "name cannot be sent in `changes` — it is how the item is matched."
                " Send the name we currently hold as `name`, and any new name as"
                " `rename_to`"
            )
        # The rename counts against the cap: it becomes a change in the stored
        # record, and a cap that ignored it would be off by one.
        if len(self.changes) + bool(self.rename_to) > MAX_ITEM_CHANGES:
            raise ValueError(f"at most {MAX_ITEM_CHANGES} fields per item")

        # Derived from the same `<X>Update` schemas the catalogue's own PATCH
        # routes use, less the one field above. Never a hand-written copy — see
        # submissions/fields.py and tests/test_manufacturer_api_docs.py.
        bad = unknown_fields(
            self.gear_type, self.changes, allowed=manufacturer_fields(self.gear_type)
        )
        if bad:
            raise ValueError(f"{self.gear_type} has no field(s): {', '.join(bad)}")

        for name, value in self.changes.items():
            if not value.strip():
                raise ValueError(f"{name} has no proposed value")
            if len(value) > MAX_VALUE_LENGTH:
                raise ValueError(
                    f"{name}: value must be at most {MAX_VALUE_LENGTH} characters"
                )

        if self.gear_id is None and not self.name:
            raise ValueError("an item needs a gear_id or a name")
        if not self.changes and not self.note and not self.rename_to:
            raise ValueError("an item needs at least one change, a rename or a note")
        return self


class ManufacturerUpdateBatch(BaseModel):
    """The POST body. An envelope even for one item, so the shape never changes."""

    items: list[ManufacturerGearItem] = Field(min_length=1, max_length=MAX_BATCH_ITEMS)
    # Free-text, echoed back and stored on nothing — a label the brand can use
    # to tie a batch to their own release ("spring 2027 line"). Kept because a
    # human admin reading 40 rows benefits from knowing why they arrived.
    note: str | None = None

    @field_validator("note")
    @classmethod
    def _note_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NOTE_LENGTH:
            raise ValueError(f"note must be at most {MAX_NOTE_LENGTH} characters")
        return value


class ManufacturerItemResult(BaseModel):
    """What happened to one item — and, crucially, which row it landed on.

    `gear_id` here is the **resolved** id, not the one that was sent. That echo
    is what makes the whole identity scheme self-healing: a brand that stores it
    back is correct again after a re-seed shifted every id, with nobody having
    to be told.
    """

    submission_id: str
    gear_type: str
    gear_id: int | None
    gear_name: str
    manufacturer_sku: str | None = None
    resolution: Resolution
    # Set when the id they sent no longer points at this product. Their cue to
    # update the mapping on their side.
    stale_gear_id: int | None = None
    status: SubmissionStatus
    # Whether the catalogue itself changed. **Always false today** — the hosted
    # catalogue is a read-only file rebuilt from the root *.json at deploy time,
    # so an accepted update is recorded and applied by hand. The field is here
    # from day one so that the day direct writes land, brands' integrations do
    # not need a new field to notice. See models/brand_clients.py.
    applied: bool = False


class ManufacturerUpdateReceipt(BaseModel):
    """The response. Everything the caller needs to correct their own mapping."""

    batch_id: str
    brand_id: int
    accepted: int
    results: list[ManufacturerItemResult]


class ManufacturerIdentity(BaseModel):
    """`GET /manufacturer/me` — who these credentials speak for.

    Exists so a brand integrating against this API can confirm the credential
    reached the right brand before sending any data, rather than discovering it
    from a queue row a week later.
    """

    client_id: str
    brand_id: int
    brand_name: str
    permissions: list[str]
    dev: bool = False


class ManufacturerSubmissionRow(BaseModel):
    """One of the caller's own submissions — `GET /manufacturer/submissions`.

    Deliberately not the stored `Submission`. Three fields are left out and one
    is deliberately in:

    - **`review_note` is included.** For a rejection it is the entire value of
      the endpoint: `status: "rejected"` with no reason sends the brand to email
      anyway. The consequence is that **an admin's note is read by the brand**,
      which makes it a message to them rather than an internal annotation —
      called out in MANUFACTURER_API_PLAN.md because notes written before this
      shipped were written under the opposite assumption.
    - `submitter_email` is out: it is always null for `kind: "manufacturer"`
      (see models/brand_clients.py § Privacy), and echoing a field that can only
      ever be empty invites someone to start filling it.
    - `gear_brand` and `brand_id` are out: the caller *is* the brand, so both are
      constants of the credential and repeating them per row says nothing.
    """

    submission_id: str
    batch_id: str | None = None
    gear_type: str
    gear_id: int | None = None
    gear_name: str | None = None
    manufacturer_sku: str | None = None
    changes: dict[str, str] = Field(default_factory=dict)
    note: str | None = None
    source_url: str | None = None
    status: SubmissionStatus
    created_at: str
    reviewed_at: str | None = None
    review_note: str | None = None


class ManufacturerGearRow(BaseModel):
    """One row of `GET /manufacturer/gear` — the discovery endpoint.

    This is how a brand learns our ids in the first place. Without it they can
    only ever match on a name, and the ambiguity refusals would have no remedy.
    """

    gear_type: str
    gear_id: int
    name: str
    # Always null, and present whenever `spec` is: the empty slot for a new
    # name, sitting beside the `name` it would replace. A brand editing this row
    # sees that renaming is possible and how, without reading anything — and it
    # is in the same position on the item they post back, so the row and the
    # item have one shape between them.
    rename_to: str | None = None
    active: bool | None = None
    # Present only for `?include=spec`: the values we currently hold, keyed by
    # the same derived field names the write accepts, so this dict can be edited
    # and posted straight back. `dict[str, Any]` rather than a per-type model
    # because the eight gear types have eight different field sets — a union
    # response would buy typing at the cost of a schema nobody can read.
    # Absent (not empty) when not asked for, so the bare call is unchanged on
    # the wire for every integration written before this existed.
    spec: dict[str, Any] | None = None
