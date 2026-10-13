"""
The change log — every change to SlackData, with who made it and how
(LIVE_EDITING_PLAN.md § 6). Append-only, permanent and public.

Phase 1 writes only **people events**: role grants and revocations, and the
bootstrap. Catalogue edits join it in phase 3 through the same record.

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


class Channel(str, Enum):
    """How the change arrived (§ 6.2, "how")."""

    WEB = "web"
    BOOTSTRAP = "bootstrap"
    MANUFACTURER_API = "manufacturer-api"
    IMPORT = "import"


class Action(str, Enum):
    ROLE_GRANT = "role.grant"
    ROLE_REVOKE = "role.revoke"


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
    """A record as the public sees it (D3): with the actor's name looked up."""

    id: str
    target_type: TargetType
    target_id: str
    action: Action
    actor_isa_id: str
    actor_name: str
    actor_role: str
    channel: Channel
    changes: dict[str, FieldChange]
    why: str | None
    flags: list[str]
    created_at: str
