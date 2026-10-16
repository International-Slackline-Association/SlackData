"""
"I represent this brand" — requests, decisions and links (phase 5, D5, § 7.8).

| route | who | does |
|---|---|---|
| `POST /me/brand-requests` | any signed-in person | ask to represent a brand (`{catalog_id, note?}`) |
| `GET /me/brand-requests` | any signed-in person | their own requests, newest first |
| `GET /admin/brand-requests` | admins | the pending queue, oldest first, with the email-domain signal |
| `POST /admin/brand-requests/{id}/approve` | admins | link the person to the brand — logged `brand.link` |
| `POST /admin/brand-requests/{id}/decline` | admins | close the request |
| `POST /admin/people/{isa_id}/brands/{catalog_id}/unlink` | admins | take a link away — logged `brand.unlink`, a reason required |

A link is written with its log record together (`commit_person_change`), like
a role grant. The request itself is not public and not logged: it is a
question, not a change. The admin sees the person's email **domain** and
whether it matches the brand's website, never the address itself.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from slack_data.api.auth import require_admin, require_person
from slack_data.brand_requests.store import BrandRequestRepositoryDep
from slack_data.catalogue.documents import ENVELOPE_KEY
from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.changelog.writer import commit_person_change
from slack_data.models.brand_clients import now_iso
from slack_data.models.brand_requests import (
    MAX_NOTE_LENGTH,
    BrandRequest,
    RequestStatus,
    email_domain_matches,
)
from slack_data.models.changes import (
    MAX_WHY_LENGTH,
    Action,
    ChangeRecord,
    Channel,
    FieldChange,
    TargetType,
)
from slack_data.models.people import Person
from slack_data.people.store import PeopleRepositoryDep
from slack_data.utilities.brand_aliases import canonical_brand
from slack_data.utilities.ulid import new_ulid

brand_requests_router = APIRouter(tags=["brand links"])

CurrentPerson = Annotated[Person, Depends(require_person)]
CurrentAdmin = Annotated[Person, Depends(require_admin)]
RequestId = Annotated[str, Path(max_length=26)]


class NewRequest(BaseModel):
    catalog_id: int = Field(gt=0)
    note: str | None = Field(default=None, max_length=MAX_NOTE_LENGTH)


class Decision(BaseModel):
    note: str | None = Field(default=None, max_length=MAX_NOTE_LENGTH)


class Unlink(BaseModel):
    why: str = Field(min_length=1, max_length=MAX_WHY_LENGTH)


class BrandRequestPublic(BaseModel):
    request_id: str
    catalog_id: int
    brand_name: str
    note: str | None
    email_domain_matches: bool
    status: RequestStatus
    created_at: str
    decided_at: str | None
    decision_note: str | None


class BrandRequestAdmin(BrandRequestPublic):
    isa_id: str
    person_name: str
    # The domain only: enough to judge the signal, without the address.
    email_domain: str | None
    email_verified: bool
    brand_website: str | None


def _brand(catalog_id: int) -> dict | None:
    """The brand's entry as the catalogue holds it now, or None."""
    from slack_data.api.routers.catalogue_router import _documents

    documents, _, _ = _documents()
    return next(
        (
            d.data
            for d in documents
            if d.collection == "manufacturers" and d.key != ENVELOPE_KEY and d.data.get("catalog_id") == catalog_id
        ),
        None,
    )


def _brand_name(catalog_id: int, entry: dict | None = None) -> str:
    entry = entry if entry is not None else _brand(catalog_id)
    return canonical_brand(str(entry["name"])) if entry else f"brand #{catalog_id}"


def _public(request: BrandRequest) -> BrandRequestPublic:
    return BrandRequestPublic(
        **request.model_dump(include=set(BrandRequestPublic.model_fields) - {"brand_name"}),
        brand_name=_brand_name(request.catalog_id),
    )


def _link_record(admin: Person, person: Person, action: Action, before, after, why: str | None) -> ChangeRecord:
    return ChangeRecord(
        target_type=TargetType.PERSON,
        target_id=person.isa_id,
        action=action,
        actor_sub=admin.sub,
        actor_isa_id=admin.isa_id,
        actor_role=admin.role_label(),
        channel=Channel.WEB,
        changes={"brand": FieldChange(before=before, after=after)},
        why=why,
    )


# --- The person asking ---------------------------------------------------------------


@brand_requests_router.post("/me/brand-requests", response_model=BrandRequestPublic, status_code=201)
def request_brand(body: NewRequest, person: CurrentPerson, requests: BrandRequestRepositoryDep):
    if person.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "this account is blocked")
    entry = _brand(body.catalog_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no brand {body.catalog_id}")
    if person.represents(body.catalog_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "you already represent this brand")
    if any(r.catalog_id == body.catalog_id and r.status is RequestStatus.PENDING for r in requests.for_person(person.sub)):
        raise HTTPException(status.HTTP_409_CONFLICT, "your request for this brand is waiting for an admin")
    request = BrandRequest(
        request_id=new_ulid(),
        sub=person.sub,
        isa_id=person.isa_id,
        catalog_id=body.catalog_id,
        note=(body.note or "").strip() or None,
        email_domain_matches=email_domain_matches(person.email, person.email_verified, entry.get("website")),
    )
    requests.put(request)
    return _public(request)


@brand_requests_router.get("/me/brand-requests", response_model=list[BrandRequestPublic])
def my_requests(person: CurrentPerson, requests: BrandRequestRepositoryDep):
    return [_public(r) for r in requests.for_person(person.sub)]


# --- Admins --------------------------------------------------------------------------


@brand_requests_router.get("/admin/brand-requests", response_model=list[BrandRequestAdmin])
def pending_requests(_: CurrentAdmin, requests: BrandRequestRepositoryDep, people: PeopleRepositoryDep):
    rows = []
    for request in requests.with_status(RequestStatus.PENDING):
        person = people.get(request.sub)
        entry = _brand(request.catalog_id)
        email = person.email if person else None
        rows.append(
            BrandRequestAdmin(
                **_public(request).model_dump(),
                isa_id=request.isa_id,
                person_name=person.full_name if person else request.isa_id,
                email_domain=email.rsplit("@", 1)[1] if email and "@" in email else None,
                email_verified=bool(person and person.email_verified),
                brand_website=(entry or {}).get("website"),
            )
        )
    return rows


def _pending(requests, request_id: str) -> BrandRequest:
    request = requests.get(request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no request {request_id}")
    if request.status is not RequestStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"this request was already {request.status.value}")
    return request


def _decided(request: BrandRequest, admin: Person, outcome: RequestStatus, note: str | None) -> BrandRequest:
    return request.model_copy(
        update={
            "status": outcome,
            "decided_at": now_iso(),
            "decided_by": admin.isa_id,
            "decision_note": (note or "").strip() or None,
        }
    )


@brand_requests_router.post("/admin/brand-requests/{request_id}/approve", response_model=BrandRequestPublic)
def approve(
    request_id: RequestId,
    body: Decision,
    admin: CurrentAdmin,
    requests: BrandRequestRepositoryDep,
    people: PeopleRepositoryDep,
    log: ChangeLogRepositoryDep,
):
    request = _pending(requests, request_id)
    person = people.get(request.sub)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "the person who asked no longer has a record")
    name = _brand_name(request.catalog_id)
    if not person.represents(request.catalog_id):
        linked = person.model_copy(update={"brands": [*person.brands, request.catalog_id], "updated_at": now_iso()})
        why = (body.note or "").strip() or "Approved their request to represent the brand."
        commit_person_change(people, log, linked, _link_record(admin, person, Action.BRAND_LINK, None, name, why))
    decided = _decided(request, admin, RequestStatus.APPROVED, body.note)
    requests.put(decided)
    return _public(decided)


@brand_requests_router.post("/admin/brand-requests/{request_id}/decline", response_model=BrandRequestPublic)
def decline(request_id: RequestId, body: Decision, admin: CurrentAdmin, requests: BrandRequestRepositoryDep):
    decided = _decided(_pending(requests, request_id), admin, RequestStatus.DECLINED, body.note)
    requests.put(decided)
    return _public(decided)


@brand_requests_router.post("/admin/people/{isa_id}/brands/{catalog_id}/unlink", status_code=204)
def unlink(
    isa_id: Annotated[str, Path(max_length=32)],
    catalog_id: int,
    body: Unlink,
    admin: CurrentAdmin,
    people: PeopleRepositoryDep,
    log: ChangeLogRepositoryDep,
):
    person = people.find_by_isa_id(isa_id)
    if person is None or not person.represents(catalog_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{isa_id} does not represent brand {catalog_id}")
    unlinked = person.model_copy(
        update={"brands": [b for b in person.brands if b != catalog_id], "updated_at": now_iso()}
    )
    record = _link_record(admin, person, Action.BRAND_UNLINK, _brand_name(catalog_id), None, body.why.strip())
    commit_person_change(people, log, unlinked, record)
