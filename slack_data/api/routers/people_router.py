"""
People and the change log, over HTTP (LIVE_EDITING_PLAN.md phase 1).

| route | who | what |
|---|---|---|
| `GET /me` | anyone signed in | who SlackData thinks you are, and your roles |
| `POST /me/notice` | anyone signed in | acknowledge the "your name is shown" notice, giving the name to show |
| `PATCH /me/name` | anyone signed in | change the name shown with your changes — once, for life |
| `GET /admin/admins` | admins | the admin list |
| `POST /admin/roles` | admins | grant or revoke admin — a logged change |
| `GET /changes` | **anyone, no sign-in** (D3, D33) | the change log, newest first; or one thing's History (`target_type` + `target_id`), one person's contributions (`actor`), the safety changes (`flag=safety`) |

Like `submissions_router`, this takes **no catalogue session**: it writes only
to the people and change log stores, so it works on the live site, where the
catalogue is read-only. It is in `WRITABLE_ROUTERS` for that reason.

**The notice.** The ISA agreed to names being public on condition that people
are told when they first sign in (LIVE_EDITING_PHASE_0.md § 1). The frontend
shows it until `notice_seen_at` is set. It informs; it is not a gate — the
API does not refuse a person who has not acknowledged it.

**The name.** People type in the name shown with their changes, because the ISA
token gives SlackData none (`models/people.py`). Until they do, they show as
their ISA id. Typing it in the first time is free; after that it can be
changed **once, for life**. A rename shows on every record they made, old ones
too: records hold an ISA id and names are looked up when the log is read (D43).
It is not itself a logged change.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator

from slack_data.api.auth import is_dev_person, require_admin, require_person
from slack_data.changelog.repository import MAX_PAGE
from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.changelog.writer import commit_person_change
from slack_data.models.brand_clients import now_iso
from slack_data.models.changes import (
    MAX_WHY_LENGTH,
    Action,
    ChangeRecord,
    ChangeRecordPublic,
    Channel,
    FieldChange,
    TargetType,
)
from slack_data.models.people import (
    MAX_DISPLAY_NAME_LENGTH,
    Me,
    Person,
    Role,
    clean_display_name,
)
from slack_data.people.store import PeopleRepositoryDep

people_router = APIRouter(tags=["people"])

CurrentPerson = Annotated[Person, Depends(require_person)]
CurrentAdmin = Annotated[Person, Depends(require_admin)]


def _me(person: Person) -> Me:
    return Me(
        sub=person.sub,
        isa_id=person.isa_id,
        name=person.full_name,
        email=person.email,
        email_verified=person.email_verified,
        roles=person.roles,
        notice_seen_at=person.notice_seen_at,
        name_set=bool(person.display_name),
        name_change_available=person.name_changed_at is None,
        dev=is_dev_person(person),
    )


class NameChange(BaseModel):
    # Generous here; clean_display_name enforces the real limit after
    # collapsing whitespace.
    name: str = Field(max_length=MAX_DISPLAY_NAME_LENGTH * 2)

    @field_validator("name")
    @classmethod
    def _clean(cls, value: str) -> str:
        return clean_display_name(value)


class NoticeAcknowledgement(BaseModel):
    name: str | None = Field(default=None, max_length=MAX_DISPLAY_NAME_LENGTH * 2)

    @field_validator("name")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return None if value is None else clean_display_name(value)


def _refuse_if_anonymised(person: Person) -> None:
    # Erased (D11): the placeholder is shown whatever is stored, so a name
    # typed in now would be kept and never shown — refuse it instead.
    if person.anonymised:
        raise HTTPException(status.HTTP_409_CONFLICT, "this account's name has been removed")


@people_router.get("/me", response_model=Me)
def read_me(person: CurrentPerson) -> Me:
    return _me(person)


@people_router.post("/me/notice", response_model=Me)
def acknowledge_notice(
    person: CurrentPerson,
    people: PeopleRepositoryDep,
    body: NoticeAcknowledgement | None = None,
) -> Me:
    """Idempotent: the first acknowledgement's time is kept. The name, when
    given, is saved with it — the notice is where people type it in."""
    updates: dict = {}
    if body is not None and body.name is not None and body.name != person.display_name:
        _refuse_if_anonymised(person)
        if person.display_name:
            # Already typed in: a different name here would be a free change.
            raise HTTPException(
                status.HTTP_409_CONFLICT, "your name is already set — change it from your account"
            )
        updates["display_name"] = body.name
    if person.notice_seen_at is None:
        updates["notice_seen_at"] = now_iso()
    if updates:
        person = people.put(person.model_copy(update={**updates, "updated_at": now_iso()}))
    return _me(person)


@people_router.patch("/me/name", response_model=Me)
def change_name(change: NameChange, person: CurrentPerson, people: PeopleRepositoryDep) -> Me:
    _refuse_if_anonymised(person)
    if change.name == person.display_name:
        return _me(person)
    updates: dict = {"display_name": change.name, "updated_at": now_iso()}
    if person.display_name:
        # Setting a first name is free; replacing one uses the lifetime change.
        if person.name_changed_at is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "you have already used your one change of name"
            )
        updates["name_changed_at"] = now_iso()
    return _me(people.put(person.model_copy(update=updates)))


# --- Admin ------------------------------------------------------------------


class AdminSummary(BaseModel):
    isa_id: str
    name: str
    email: str | None


class RoleChange(BaseModel):
    """Grant or revoke a role. The person is named by their verified email or
    their ISA id, and must have signed in to SlackData at least once."""

    email: str | None = Field(default=None, max_length=320)
    isa_id: str | None = Field(default=None, max_length=32)
    role: Role = Role.ADMIN
    grant: bool = True
    why: str | None = Field(default=None, max_length=MAX_WHY_LENGTH)

    @model_validator(mode="after")
    def _one_target(self) -> "RoleChange":
        if bool(self.email) == bool(self.isa_id):
            raise ValueError("name the person by exactly one of email or isa_id")
        return self


@people_router.get("/admin/admins", response_model=list[AdminSummary])
def list_admins(_: CurrentAdmin, people: PeopleRepositoryDep) -> list[AdminSummary]:
    return [
        AdminSummary(isa_id=p.isa_id, name=p.full_name, email=p.email)
        for p in people.list_with_role(Role.ADMIN)
    ]


def _find_target(change: RoleChange, people) -> Person:
    if change.isa_id:
        target = people.find_by_isa_id(change.isa_id)
        if target is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no SlackData account has that ISA id")
        return target

    matches = people.find_by_email(change.email)
    if change.grant:
        # Granting by address trusts the address, so only a verified one counts.
        # isa-users confirms accounts before their email is verified, and anyone
        # can create an account claiming any address.
        matches = [p for p in matches if p.email_verified]
    if not matches:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "no SlackData account has that verified address — they must sign in once first",
        )
    if len(matches) > 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "more than one account has that address — name the person by ISA id instead",
        )
    return matches[0]


@people_router.post("/admin/roles", response_model=AdminSummary)
def change_role(
    change: RoleChange,
    admin: CurrentAdmin,
    people: PeopleRepositoryDep,
    log: ChangeLogRepositoryDep,
) -> AdminSummary:
    target = _find_target(change, people)
    has_it = target.has(change.role)

    if change.grant == has_it:
        # Nothing to change, and nothing to log.
        return AdminSummary(isa_id=target.isa_id, name=target.full_name, email=target.email)

    # There is no second way in (D9): the last admin revoking themselves, or
    # being revoked, would leave nobody able to administer SlackData.
    if (
        not change.grant
        and change.role is Role.ADMIN
        and len(people.list_with_role(Role.ADMIN)) <= 1
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot revoke the last admin")

    roles = (
        [*target.roles, change.role]
        if change.grant
        else [role for role in target.roles if role is not change.role]
    )
    updated = target.model_copy(update={"roles": roles, "updated_at": now_iso()})
    record = ChangeRecord(
        target_type=TargetType.PERSON,
        target_id=target.isa_id,
        action=Action.ROLE_GRANT if change.grant else Action.ROLE_REVOKE,
        actor_sub=admin.sub,
        actor_isa_id=admin.isa_id,
        actor_role=admin.role_label(),
        channel=Channel.WEB,
        changes={
            "roles": FieldChange(
                before=[r.value for r in target.roles], after=[r.value for r in roles]
            )
        },
        why=change.why,
    )
    commit_person_change(people, log, updated, record)
    return AdminSummary(isa_id=updated.isa_id, name=updated.full_name, email=updated.email)


# --- The public change log --------------------------------------------------


@people_router.get("/changes", response_model=list[ChangeRecordPublic])
def list_changes(
    people: PeopleRepositoryDep,
    log: ChangeLogRepositoryDep,
    limit: int = Query(default=50, ge=1, le=MAX_PAGE),
    before: str | None = Query(default=None, max_length=26),
    target_type: TargetType | None = None,
    target_id: str | None = Query(default=None, max_length=128),
    actor: str | None = Query(default=None, max_length=32, description="an ISA id"),
    flag: Literal["safety"] | None = None,
) -> list[ChangeRecordPublic]:
    """Public and unauthenticated. Names are looked up now, never stored in a
    record (D43), so an anonymised person shows as "former contributor"."""
    if (target_type is None) != (target_id is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "give both target_type and target_id")
    if sum(x is not None for x in (target_type, actor, flag)) > 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "filter by one of target, actor or flag")

    if target_type is not None:
        records = log.for_target(target_type, target_id, limit)
    elif actor is not None:
        records = log.by_actor(actor, limit, before)
    elif flag is not None:
        records = log.flagged(flag, limit, before)
    else:
        records = log.recent(limit, before)

    names: dict[str, str] = {}

    def name_of(isa_id: str) -> str:
        if isa_id not in names:
            person = people.find_by_isa_id(isa_id)
            names[isa_id] = person.full_name if person else isa_id
        return names[isa_id]

    return [
        ChangeRecordPublic(
            id=r.id,
            target_type=r.target_type,
            target_id=r.target_id,
            action=r.action,
            actor_isa_id=r.actor_isa_id,
            actor_name=name_of(r.actor_isa_id),
            actor_role=r.actor_role,
            channel=r.channel,
            changes=r.changes,
            why=r.why,
            flags=r.flags,
            reverts=r.reverts,
            created_at=r.created_at,
        )
        for r in records
    ]
