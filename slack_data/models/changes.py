"""
The change log — every change to SlackData, with who made it and how
(LIVE_EDITING_PLAN.md § 6). Append-only, permanent and public.

Phase 1 writes **people events**: role grants and revocations, and the
bootstrap. Phase 3 adds the catalogue: item and brand edits, creates, hides,
merges and reverts, through the same record.

**No names in a record (D43).** `actor_sub` and `actor_isa_id` say who; the
public name is looked up from the people store whenever a record is shown or
exported, so anonymising a person never touches the log.

Plain pydantic, not SQLModel — DynamoDB hosted, a SQLite file of its own
locally, never the catalogue database.
"""

import json
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from slack_data.models.brand_clients import now_iso
from slack_data.utilities.ulid import new_ulid

MAX_WHY_LENGTH = 2000


class TargetType(str, Enum):
    """What a record changed. Grows with the phases: items, brands, media…"""

    PERSON = "person"
    # target_id "<collection>#<id>", e.g. "webbings#12".
    ITEM = "item"
    # target_id the brand's catalog_id.
    BRAND = "brand"
    # target_id the warning's id / the certificate's cert_id.
    ISA_WARNING = "isa_warning"
    ISA_CERTIFICATE = "isa_certificate"


def item_target(collection: str, item_id: int | str) -> str:
    return f"{collection}#{item_id}"


class Channel(str, Enum):
    """How the change arrived (§ 6.2, "how")."""

    WEB = "web"
    BOOTSTRAP = "bootstrap"
    MANUFACTURER_API = "manufacturer-api"
    IMPORT = "import"
    # A change that restores earlier values; `reverts` names the record undone.
    REVERT = "revert"
    # A duplicate merged into another item (D20), and what it re-pointed.
    MERGE = "merge"


class Action(str, Enum):
    ROLE_GRANT = "role.grant"
    ROLE_REVOKE = "role.revoke"
    ITEM_CREATE = "item.create"
    ITEM_EDIT = "item.edit"
    # Hiding was dropped (D81) and these are never written now; staging's
    # append-only log holds one of each from testing, so they stay readable.
    ITEM_HIDE = "item.hide"
    ITEM_UNHIDE = "item.unhide"
    ITEM_MERGE = "item.merge"
    ITEM_REVERT = "item.revert"
    BRAND_CREATE = "brand.create"
    BRAND_EDIT = "brand.edit"
    # An ISA warning or certificate match moved by a rename or a merge (P3-B).
    MATCH_REPOINT = "match.repoint"
    # A person linked to a brand they represent, or unlinked (phase 5, D5).
    # Target: the person; `changes.brand` names the brand.
    BRAND_LINK = "brand.link"
    BRAND_UNLINK = "brand.unlink"
    # A brand's machine API key created, given a new secret, or revoked (D64).
    # Target: the brand; `changes.key` names the client id, never the secret.
    KEY_CREATE = "key.create"
    KEY_REGENERATE = "key.regenerate"
    KEY_REVOKE = "key.revoke"


# The one flag so far: a breaking-strength figure changed (D33, D57).
SAFETY_FLAG = "safety"


def target_key(target_type: TargetType, target_id: str) -> str:
    """The History lookup key: everything that ever happened to one thing."""
    return f"{target_type.value}#{target_id}"


class FieldChange(BaseModel):
    """Only the changed fields, before → after (D31)."""

    before: Any = None
    after: Any = None


class ChangeRecord(BaseModel):
    # A monotonic ULID, so the order of ids is the order of events.
    id: str = Field(default_factory=new_ulid)
    target_type: TargetType
    target_id: str
    action: Action
    actor_sub: str
    actor_isa_id: str
    # "admin", "editor", "manufacturer for <brand>" — the role *at the time*.
    actor_role: str
    channel: Channel
    changes: dict[str, FieldChange] = Field(default_factory=dict)
    why: str | None = Field(default=None, max_length=MAX_WHY_LENGTH)
    flags: list[str] = Field(default_factory=list)
    # On a revert: the id of the record whose change it undoes.
    reverts: str | None = Field(default=None, max_length=26)
    created_at: str = Field(default_factory=now_iso)

    @property
    def target(self) -> str:
        return target_key(self.target_type, self.target_id)

    def changes_json(self) -> str:
        """Stored as one JSON string: lossless whatever the field types are,
        where a DynamoDB map would turn every number into a `Decimal`."""
        return json.dumps(
            {name: change.model_dump() for name, change in self.changes.items()},
            sort_keys=True,
        )

    @staticmethod
    def parse_changes(raw: str | None) -> dict[str, FieldChange]:
        if not raw:
            return {}
        return {name: FieldChange(**value) for name, value in json.loads(raw).items()}


class ChangeRecordPublic(BaseModel):
    """A record as the public sees it (D3): with the actor's name, and the
    target's current name, looked up when it is read (D43)."""

    id: str
    target_type: TargetType
    target_id: str
    # What the target is called now (an item or brand renamed since shows its
    # new name); None where none is known, and the id is shown instead.
    target_name: str | None = None
    action: Action
    actor_isa_id: str
    actor_name: str
    actor_role: str
    channel: Channel
    changes: dict[str, FieldChange]
    why: str | None
    flags: list[str]
    reverts: str | None = None
    created_at: str
