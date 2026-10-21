"""
Live editing — phase 3 (LIVE_EDITING_PHASE_3.md § 5.5). Since phase 6
(LIVE_EDITING_PHASE_6.md) every signed-in ISA account edits, once it has
acknowledged the first-sign-in notice (P6-B) and unless an admin blocked it
(D22), within the rate cap (`people/ratecap.py`, 429 at the cap). What each
person may change is `rights.py`'s, checked in `edits.py`; merges stay
admin-only.

| route | does |
|---|---|
| `GET /edit/{slug}/{id}` | the stored entry and its `rev`, merged ones included |
| `PATCH /edit/{slug}/{id}` | set fields (`{rev, changes, why?}`); null clears one |
| `POST /edit/{slug}` | create (`{fields, why?}`) |
| `POST /edit/{slug}/{id}/merge` | `{rev, into, why}` — a detailed why required (D20) |
| `POST /edit/revert/{record_id}` | undo one recorded edit, field by field (D58) |
| `GET` · `PATCH /edit/brand/{catalog_id}`, `POST /edit/brand` | a brand's entry, never its name (P3-G) |
| `GET /edit/{slug}/fields`, `GET /edit/brand/fields` | what the edit form offers: each field's kind and allowed values, from the model |
| `POST /edit/media/uploads` | forms to post files straight to quarantine (phase 4, P4-A) |
| `PUT /edit/{slug}/{id}/media` | the item's photos and/or manuals, as whole lists: add, remove, reorder, retitle (P4-H) |
| `PUT /edit/brand/{catalog_id}/media` | a brand's logo, and its range-wide manuals per gear type |
| `GET /edit/isa/{kind}`, `GET /edit/isa/{kind}/fields`, `GET /edit/isa/{kind}/{key}` | admins: the ISA's certificates or warnings as stored, with their revs (phase 7) |
| `PATCH /edit/isa/{kind}/{key}` · `POST /edit/isa/{kind}` · `POST /edit/isa/{kind}/{key}/retire` | admins: correct or rematch an entry, record one the ISA has not listed yet, retire one (`catalogue/isa.py`) |

Every change is written with its change log record in one transaction, and
answers **409** with the current entry when it was based on a stale `rev`
(D27). The writes go to the catalogue **store**, never the catalogue session —
so this router takes no `SessionDep`, like `people_router` — and the next
request anywhere serves them (D30). Without the store (`CATALOG_SOURCE=store`)
there is nothing to edit, and the routes answer 503.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from pydantic import BaseModel, Field

from slack_data.api.auth import require_admin, require_person
from slack_data.catalogue import edits, isa, rights
from slack_data.catalogue.repository import CatalogueRepository, Conflict
from slack_data.changelog.repository import RecordExists
from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.media import edits as media_edits
from slack_data.media.kinds import ALLOWED, MAX_BYTES, MB, Purpose, by_content_type
from slack_data.media.store import MediaStore, UploadTarget, media_store, new_upload_id
from slack_data.models.changes import MAX_WHY_LENGTH
from slack_data.models.people import Person
from slack_data.people.ratecap import CapExceeded, CapRace, RateCap, iso
from slack_data.people.store import PeopleRepositoryDep

edit_router = APIRouter(prefix="/edit", tags=["edit"])

CurrentAdmin = Annotated[Person, Depends(require_admin)]


def require_editor(person: Annotated[Person, Depends(require_person)]) -> Person:
    """Anyone signed in who may edit at all. What exactly they may change is
    `rights.py`'s, checked by every operation in `edits.py`; this turns away
    a blocked account (D22), and one that has not yet been told its name is
    shown with its changes — the ISA's condition for publishing it (D70, P6-B)."""
    if not rights.may_edit_any(person):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {"message": edits.BLOCKED, "blocked_reason": person.blocked_reason},
        )
    if person.notice_seen_at is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "acknowledge the sign-in notice first: your name is shown with your changes",
        )
    return person


CurrentEditor = Annotated[Person, Depends(require_editor)]


def rate_cap(editor: CurrentEditor, people: PeopleRepositoryDep) -> RateCap:
    return RateCap(people, editor)


CapDep = Annotated[RateCap, Depends(rate_cap)]


def editable_store() -> CatalogueRepository:
    from slack_data.catalogue.store import (
        get_catalogue_repository,
        reads_from_store,
        store_configured,
    )

    if not (store_configured() and reads_from_store()):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "editing needs the catalogue store (CATALOG_SOURCE=store)",
        )
    return get_catalogue_repository()


StoreDep = Annotated[CatalogueRepository, Depends(editable_store)]


def available_media() -> MediaStore:
    media = media_store()
    if media is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "uploads need the media store")
    return media


MediaDep = Annotated[MediaStore, Depends(available_media)]
Why = Annotated[str | None, Field(default=None, max_length=MAX_WHY_LENGTH)]
ItemId = Annotated[int, Path(gt=0, le=2**63 - 1)]


class ItemEdit(BaseModel):
    rev: int
    changes: dict[str, Any]
    why: Why = None


class ItemCreate(BaseModel):
    fields: dict[str, Any]
    why: Why = None


class Merge(BaseModel):
    rev: int
    into: int
    why: Annotated[str, Field(max_length=MAX_WHY_LENGTH)]


class Revert(BaseModel):
    why: Why = None


class BrandEdit(BaseModel):
    rev: int
    changes: dict[str, Any]
    why: Why = None


class BrandCreate(BaseModel):
    name: str
    fields: dict[str, Any] = {}
    why: Why = None


class UploadRequest(BaseModel):
    purpose: Purpose
    content_type: str
    # What the browser says the file is; S3 enforces the real limit.
    size: int = Field(gt=0)


class Uploads(BaseModel):
    files: list[UploadRequest] = Field(min_length=1, max_length=20)


class ItemMedia(BaseModel):
    rev: int
    photos: list[media_edits.PhotoRef] | None = None
    manuals: list[media_edits.ManualRef] | None = None
    why: Why = None


class BrandMedia(BaseModel):
    rev: int
    logo: media_edits.LogoChange | None = None
    manuals: dict[str, list[media_edits.ManualRef]] | None = None
    why: Why = None


class Stored(BaseModel):
    """An entry as the store holds it, with the rev an edit must name."""

    collection: str
    key: str
    entry: dict[str, Any]
    rev: int


class EditResult(Stored):
    # The ids of the change log records written (none: nothing changed).
    records: list[str]
    # On a revert: fields that had changed again since, left as they are.
    refused: dict[str, Any] = {}


def _result(outcome: edits.Outcome) -> EditResult:
    return EditResult(
        collection=outcome.collection,
        key=outcome.key,
        entry=outcome.entry,
        rev=outcome.rev,
        records=[r.id for r in outcome.records],
        refused=outcome.refused,
    )


def _run(store: CatalogueRepository, collection: str, key: str | None, operation) -> EditResult:
    try:
        return _result(operation())
    except edits.EditError as error:
        raise HTTPException(error.status, {"message": error.message, "errors": error.detail}) from error
    except Conflict as error:
        current = store.get(collection, key) if key is not None else None
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "it changed since you opened it — here is what it is now",
                "conflict": error.what,
                "current": current.data if current else None,
                "rev": current.rev if current else None,
            },
        ) from error
    except CapExceeded as error:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {"message": str(error), "retry_at": iso(error.retry_at), "limit": error.limit, "window": error.window},
        ) from error
    except (RecordExists, CapRace) as error:  # a ULID collision, a parallel save: retrying is safe
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "please try again") from error


class FieldSpec(BaseModel):
    name: str
    # text · longtext · number · integer · boolean · choice · choices · list · curve · rings
    kind: str
    options: list[str] | None
    required: bool
    # Only an admin changes it (rights.ADMIN_ONLY_FIELDS): who makes a
    # product, who else sells it. A manufacturer picks `brand` only when
    # adding a product, among their own brands.
    admin_only: bool = False


# --- Uploads (declared before /{slug}) -------------------------------------------


@edit_router.post("/media/uploads", response_model=list[UploadTarget])
def upload_targets(body: Uploads, request: Request, _: CurrentEditor, __: StoreDep, media: MediaDep):
    """One form per file. A type or size the purpose does not allow is refused
    here, before the file travels; S3 refuses it again on arrival, and the
    attach checks the bytes themselves."""
    errors = []
    for index, wanted in enumerate(body.files):
        kind = by_content_type(wanted.content_type)
        if kind not in ALLOWED[wanted.purpose]:
            names = " or ".join(t.extension.upper() for t in ALLOWED[wanted.purpose])
            errors.append({"field": f"files.{index}", "message": f"a {wanted.purpose.value} must be {names}"})
        elif wanted.size > MAX_BYTES[wanted.purpose]:
            errors.append({
                "field": f"files.{index}",
                "message": f"over the {MAX_BYTES[wanted.purpose] // MB} MB limit for a {wanted.purpose.value}",
            })
    if errors:
        raise HTTPException(422, {"message": "these files cannot be uploaded", "errors": errors})
    base = str(request.base_url)
    return [
        media.upload_target(new_upload_id(), wanted.content_type, MAX_BYTES[wanted.purpose], base)
        for wanted in body.files
    ]


# --- ISA certificates and warnings (phase 7; declared before /{slug}) ----------

IsaKind = Annotated[str, Path(pattern="^(certificates|warnings)$")]
IsaKey = Annotated[str, Path(max_length=64)]


class IsaEntry(BaseModel):
    key: str
    entry: dict[str, Any]
    rev: int


class IsaEdit(BaseModel):
    rev: int
    changes: dict[str, Any] = {}
    match: isa.MatchIn | None = None
    why: Why = None


class IsaCreate(BaseModel):
    fields: dict[str, Any]
    match: isa.MatchIn | None = None
    why: Why = None


class IsaRetire(BaseModel):
    rev: int
    why: Annotated[str, Field(min_length=1, max_length=MAX_WHY_LENGTH)]


@edit_router.get("/isa/{kind}/fields", response_model=list[FieldSpec])
def isa_fields(kind: IsaKind, _: CurrentAdmin) -> list[FieldSpec]:
    return [FieldSpec(**spec) for spec in isa.field_specs(isa.collection_of(kind))]


@edit_router.get("/isa/{kind}", response_model=list[IsaEntry])
def isa_entries(kind: IsaKind, _: CurrentAdmin, store: StoreDep) -> list[IsaEntry]:
    """Every entry of the list, in file order — the admin page sorts."""
    collection = isa.collection_of(kind)
    return [IsaEntry(key=d.key, entry=d.data, rev=d.rev) for d in isa.entries(store.load(), collection)]


@edit_router.get("/isa/{kind}/{key}", response_model=IsaEntry)
def isa_entry(kind: IsaKind, key: IsaKey, _: CurrentAdmin, store: StoreDep) -> IsaEntry:
    try:
        document = isa.entry(store.load(), isa.collection_of(kind), key)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return IsaEntry(key=document.key, entry=document.data, rev=document.rev)


@edit_router.patch("/isa/{kind}/{key}", response_model=EditResult)
def edit_isa(kind: IsaKind, key: IsaKey, body: IsaEdit, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    collection = isa.collection_of(kind)
    return _run(
        store, collection, key,
        lambda: isa.edit_entry(store, log, admin, collection, key, body.rev, body.changes, body.match, body.why),
    )


@edit_router.post("/isa/{kind}", response_model=EditResult, status_code=201)
def create_isa(kind: IsaKind, body: IsaCreate, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    collection = isa.collection_of(kind)
    return _run(
        store, collection, None,
        lambda: isa.create_entry(store, log, admin, collection, body.fields, body.match, body.why),
    )


@edit_router.post("/isa/{kind}/{key}/retire", response_model=EditResult)
def retire_isa(
    kind: IsaKind, key: IsaKey, body: IsaRetire, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep
):
    collection = isa.collection_of(kind)
    return _run(
        store, collection, key, lambda: isa.retire_entry(store, log, admin, collection, key, body.rev, body.why)
    )


# --- Brands (declared before /{slug}, which would otherwise match "brand") -----


@edit_router.get("/brand/fields", response_model=list[FieldSpec])
def brand_fields(_: CurrentEditor) -> list[FieldSpec]:
    return [FieldSpec(**spec) for spec in edits.brand_field_specs()]


@edit_router.get("/brand/{catalog_id}", response_model=Stored)
def read_brand(catalog_id: ItemId, _: CurrentEditor, store: StoreDep) -> Stored:
    try:
        document = edits._brand_document(store.load(), catalog_id)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return Stored(collection="manufacturers", key=document.key, entry=document.data, rev=document.rev)


@edit_router.patch("/brand/{catalog_id}", response_model=EditResult)
def edit_brand(
    catalog_id: ItemId, body: BrandEdit, editor: CurrentEditor, store: StoreDep, log: ChangeLogRepositoryDep, cap: CapDep
):
    key = None
    try:
        key = edits._brand_document(store.load(), catalog_id).key
    except edits.NotFound:
        pass
    return _run(
        store, "manufacturers", key,
        lambda: edits.edit_brand(store, log, editor, catalog_id, body.rev, body.changes, body.why, cap),
    )


@edit_router.put("/brand/{catalog_id}/media", response_model=EditResult)
def brand_media(
    catalog_id: ItemId, body: BrandMedia, editor: CurrentEditor, store: StoreDep, media: MediaDep,
    log: ChangeLogRepositoryDep, cap: CapDep,
):
    key = None
    try:
        key = edits._brand_document(store.load(), catalog_id).key
    except edits.NotFound:
        pass
    return _run(
        store, "manufacturers", key,
        lambda: media_edits.set_brand_media(
            store, log, media, editor, catalog_id, body.rev, body.logo, body.manuals, body.why, cap
        ),
    )


@edit_router.post("/brand", response_model=EditResult, status_code=201)
def create_brand(body: BrandCreate, editor: CurrentEditor, store: StoreDep, log: ChangeLogRepositoryDep, cap: CapDep):
    return _run(
        store, "manufacturers", None,
        lambda: edits.create_brand(store, log, editor, body.name, body.fields, body.why, cap),
    )


@edit_router.post("/revert/{record_id}", response_model=EditResult)
def revert(
    record_id: Annotated[str, Path(max_length=26)],
    body: Revert,
    editor: CurrentEditor,
    store: StoreDep,
    log: ChangeLogRepositoryDep,
    cap: CapDep,
):
    record = log.get(record_id)
    collection, _, key = (record.target_id if record else "").partition("#")
    return _run(store, collection, key or None, lambda: edits.revert(store, log, editor, record_id, body.why, cap))


# --- Items ------------------------------------------------------------------------


@edit_router.get("/{slug}/fields", response_model=list[FieldSpec])
def item_fields(slug: str, editor: CurrentEditor, store: StoreDep) -> list[FieldSpec]:
    """What the edit form offers for a gear type: each field's kind and allowed
    values, from the model — the form is built from this, never a copy. Every
    brand, for everyone: a new product may be any brand's (D59)."""
    documents = store.load()
    try:
        specs = edits.field_specs(slug, edits._brand_names(documents), documents)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return [FieldSpec(**spec) for spec in specs]


@edit_router.get("/{slug}/{item_id}", response_model=Stored)
def read_item(slug: str, item_id: ItemId, _: CurrentEditor, store: StoreDep) -> Stored:
    try:
        document = edits._item(store.load(), slug, item_id)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return Stored(collection=slug, key=document.key, entry=document.data, rev=document.rev)


@edit_router.patch("/{slug}/{item_id}", response_model=EditResult)
def edit_item(
    slug: str, item_id: ItemId, body: ItemEdit, editor: CurrentEditor, store: StoreDep, log: ChangeLogRepositoryDep,
    cap: CapDep,
):
    return _run(
        store, slug, str(item_id),
        lambda: edits.edit_item(store, log, editor, slug, item_id, body.rev, body.changes, body.why, cap),
    )


@edit_router.post("/{slug}", response_model=EditResult, status_code=201)
def create_item(
    slug: str, body: ItemCreate, editor: CurrentEditor, store: StoreDep, log: ChangeLogRepositoryDep, cap: CapDep
):
    return _run(store, slug, None, lambda: edits.create_item(store, log, editor, slug, body.fields, body.why, cap))


@edit_router.post("/{slug}/{item_id}/merge", response_model=EditResult)
def merge_item(slug: str, item_id: ItemId, body: Merge, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(
        store, slug, str(item_id),
        lambda: edits.merge_item(store, log, admin, slug, item_id, body.rev, body.into, body.why),
    )


@edit_router.put("/{slug}/{item_id}/media", response_model=EditResult)
def item_media(
    slug: str, item_id: ItemId, body: ItemMedia, editor: CurrentEditor, store: StoreDep, media: MediaDep,
    log: ChangeLogRepositoryDep, cap: CapDep,
):
    return _run(
        store, slug, str(item_id),
        lambda: media_edits.set_item_media(
            store, log, media, editor, slug, item_id, body.rev, body.photos, body.manuals, body.why, cap
        ),
    )
