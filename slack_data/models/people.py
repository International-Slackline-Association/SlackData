"""
People — who may do what on SlackData (LIVE_EDITING_PLAN.md § 4, D8).

The ISA account system says *who you are*: the `isa-users` pool signs an ID
token. This record says *what you may do here*, and nothing else does — roles
live in our own table, never as groups in the ISA's shared pool, which is the
pattern SportHub follows with `sporthub-users`.

Plain pydantic, not SQLModel, for the reason `models/submissions.py` gives:
hosted these records live in DynamoDB, locally in a SQLite file of their own,
and never in the catalogue database.

**Personal data.** The email, and the name where the token carries one, are
copied from the ISA token so that pages and the export can show who changed
what without asking the ISA's table (D43: the change log holds a `sub`, never a
name). They are refreshed from the token on every sign-in.

**The public name is typed in by the person** (`display_name`), at the
first-sign-in notice, and changeable from their account menu **once, for
life** (`name_changed_at`) — a name is how others recognise whose edits they
are reading, so it should not drift. SlackData's ISA
client is not given the name attributes, so the token alone would show every
contributor as their ISA id. Anonymising someone (D11) is one change here.
"""

import hashlib
from enum import Enum

from pydantic import BaseModel, Field

from slack_data.models.brand_clients import now_iso

MAX_NAME_LENGTH = 200
# The public name a person types in: long enough for any real name, short
# enough to sit in a change log row.
MAX_DISPLAY_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 320

# What an erased person is shown as, everywhere their edits appear (D11, D14).
ANONYMISED_NAME = "former contributor"


class Role(str, Enum):
    """A role granted on SlackData. Editors are every signed-in account, so
    they have no role to grant (D52, D55); manufacturer links arrive in phase 5
    as brand links, not as a role."""

    ADMIN = "admin"


def isa_id_for(cognito_username: str) -> str:
    """The ISA id isa-users gives an account, derived the same way.

    `ISA_` + the first 8 hex characters of sha256(cognito username), upper-cased
    — `generateISAIdFromUsername` in isa-users' `core/utils/index.ts`. Computed
    rather than looked up, so SlackData never reads the ISA's table.
    """
    digest = hashlib.sha256(cognito_username.encode("utf-8")).hexdigest()
    return f"ISA_{digest[:8]}".upper()


class Person(BaseModel):
    """One ISA account, as SlackData knows it."""

    # The token's `sub` — the identity key (§ 4.2). Stable for the life of the
    # account, unlike an email address.
    sub: str = Field(max_length=128)
    isa_id: str = Field(max_length=32)
    # The ISA pool's `name` holds the first name and `family_name` the surname
    # (isa-users' cognito trigger maps them onto name / surname).
    given_name: str | None = Field(default=None, max_length=MAX_NAME_LENGTH)
    family_name: str | None = Field(default=None, max_length=MAX_NAME_LENGTH)
    email: str | None = Field(default=None, max_length=MAX_EMAIL_LENGTH)
    # The name the person typed in themselves — shown publicly with their
    # changes. Never taken from, or overwritten by, the token.
    display_name: str | None = Field(default=None, max_length=MAX_DISPLAY_NAME_LENGTH)
    # When the person used their one change of that name. Typing it in the
    # first time is not a change.
    name_changed_at: str | None = None
    # isa-users confirms an account at once and verifies the address later, by
    # a link it mails — so this can be false on a live account (§ 4.2). Only a
    # verified address may bootstrap an admin (§ 4.4).
    email_verified: bool = False
    roles: list[Role] = Field(default_factory=list)
    # When the "your name is shown with your changes" notice was acknowledged.
    # The ISA's condition for publishing names: people are told at their first
    # sign-in (LIVE_EDITING_PHASE_0.md § 1).
    notice_seen_at: str | None = None
    # Set the one time the bootstrap allowlist granted this person admin. Never
    # cleared, so an admin who is later revoked is not silently re-granted by
    # the allowlist on their next request (§ 4.4).
    bootstrapped_at: str | None = None
    anonymised: bool = False
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)

    @property
    def full_name(self) -> str:
        """The public name (D37): the name they gave, else the token's, else
        their ISA id — or the erased placeholder."""
        if self.anonymised:
            return ANONYMISED_NAME
        if self.display_name:
            return self.display_name
        name = " ".join(part for part in (self.given_name, self.family_name) if part)
        return name or self.isa_id

    def has(self, role: Role) -> bool:
        return role in self.roles

    def role_label(self) -> str:
        """The role recorded with a change, at the time of the change (§ 6.2)."""
        return Role.ADMIN.value if self.has(Role.ADMIN) else "editor"


class PersonPublic(BaseModel):
    """What anyone may see about a person: their public name and ISA id."""

    isa_id: str
    name: str


class Me(BaseModel):
    """`GET /me` — the signed-in person's own view of themselves."""

    sub: str
    isa_id: str
    name: str
    email: str | None
    email_verified: bool
    roles: list[Role]
    notice_seen_at: str | None
    # False until the person has typed in their public name.
    name_set: bool = False
    # True until they have used their one lifetime change of it.
    name_change_available: bool = True
    dev: bool = False


def clean_display_name(value: str) -> str:
    """A typed-in name, tidied: whitespace collapsed, control characters and
    blank names refused."""
    name = " ".join(value.split())
    if not name:
        raise ValueError("enter your name")
    if len(name) > MAX_DISPLAY_NAME_LENGTH:
        raise ValueError(f"at most {MAX_DISPLAY_NAME_LENGTH} characters")
    if any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("the name contains a control character")
    return name
