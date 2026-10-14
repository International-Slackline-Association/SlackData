"""
Live editing — phase 3 (LIVE_EDITING_PHASE_3.md § 5.5). Admins only for now;
phase 6 opens the item routes to every signed-in ISA account with a rate cap.

| route | does |
|---|---|
| `GET /edit/{slug}/{id}` | the stored entry and its `rev`, hidden or merged ones included |
| `PATCH /edit/{slug}/{id}` | set fields (`{rev, changes, why?}`); null clears one |
| `POST /edit/{slug}` | create (`{fields, why?}`) |
| `POST /edit/{slug}/{id}/hide` · `/unhide` | `{rev, why}` — why required to hide |
| `POST /edit/{slug}/{id}/merge` | `{rev, into, why}` — a detailed why required (D20) |
| `POST /edit/revert/{record_id}` | undo one recorded edit, field by field (D58) |
| `GET` · `PATCH /edit/brand/{catalog_id}`, `POST /edit/brand` | a brand's entry, never its name (P3-G) |
| `GET /edit/{slug}/fields`, `GET /edit/brand/fields` | what the edit form offers: each field's kind and allowed values, from the model |

Every change is written with its change log record in one transaction, and
answers **409** with the current entry when it was based on a stale `rev`
(D27). The writes go to the catalogue **store**, never the catalogue session —
so this router takes no `SessionDep`, like `people_router` — and the next
request anywhere serves them (D30). Without the store (`CATALOG_SOURCE=store`)
there is nothing to edit, and the routes answer 503.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from slack_data.api.auth import require_admin
from slack_data.catalogue import edits
from slack_data.catalogue.repository import CatalogueRepository, Conflict
from slack_data.changelog.repository import RecordExists
from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.models.changes import MAX_WHY_LENGTH
from slack_data.models.people import Person

edit_router = APIRouter(prefix="/edit", tags=["edit"])

CurrentAdmin = Annotated[Person, Depends(require_admin)]


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
Why = Annotated[str | None, Field(default=None, max_length=MAX_WHY_LENGTH)]
ItemId = Annotated[int, Path(gt=0, le=2**63 - 1)]


class ItemEdit(BaseModel):
    rev: int
    changes: dict[str, Any]
    why: Why = None


class ItemCreate(BaseModel):
    fields: dict[str, Any]
    why: Why = None


class Hide(BaseModel):
    rev: int
    why: Annotated[str, Field(max_length=MAX_WHY_LENGTH)]


class Unhide(BaseModel):
    rev: int
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
    except RecordExists as error:  # a ULID collision: retrying is safe
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "please try again") from error


class FieldSpec(BaseModel):
    name: str
    # text · longtext · number · integer · boolean · choice · choices · list · curve
    kind: str
    options: list[str] | None
    required: bool


# --- Brands (declared before /{slug}, which would otherwise match "brand") -----


@edit_router.get("/brand/fields", response_model=list[FieldSpec])
def brand_fields(_: CurrentAdmin) -> list[FieldSpec]:
    return [FieldSpec(**spec) for spec in edits.brand_field_specs()]


@edit_router.get("/brand/{catalog_id}", response_model=Stored)
def read_brand(catalog_id: ItemId, _: CurrentAdmin, store: StoreDep) -> Stored:
    try:
        document = edits._brand_document(store.load(), catalog_id)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return Stored(collection="manufacturers", key=document.key, entry=document.data, rev=document.rev)


@edit_router.patch("/brand/{catalog_id}", response_model=EditResult)
def edit_brand(catalog_id: ItemId, body: BrandEdit, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    key = None
    try:
        key = edits._brand_document(store.load(), catalog_id).key
    except edits.NotFound:
        pass
    return _run(
        store, "manufacturers", key,
        lambda: edits.edit_brand(store, log, admin, catalog_id, body.rev, body.changes, body.why),
    )


@edit_router.post("/brand", response_model=EditResult, status_code=201)
def create_brand(body: BrandCreate, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(store, "manufacturers", None, lambda: edits.create_brand(store, log, admin, body.name, body.fields, body.why))


@edit_router.post("/revert/{record_id}", response_model=EditResult)
def revert(
    record_id: Annotated[str, Path(max_length=26)],
    body: Revert,
    admin: CurrentAdmin,
    store: StoreDep,
    log: ChangeLogRepositoryDep,
):
    record = log.get(record_id)
    collection, _, key = (record.target_id if record else "").partition("#")
    return _run(store, collection, key or None, lambda: edits.revert(store, log, admin, record_id, body.why))


# --- Items ------------------------------------------------------------------------


@edit_router.get("/{slug}/fields", response_model=list[FieldSpec])
def item_fields(slug: str, _: CurrentAdmin, store: StoreDep) -> list[FieldSpec]:
    """What the edit form offers for a gear type: each field's kind and allowed
    values, from the model — the form is built from this, never a copy."""
    try:
        specs = edits.field_specs(slug, edits._brand_names(store.load()))
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return [FieldSpec(**spec) for spec in specs]


@edit_router.get("/{slug}/{item_id}", response_model=Stored)
def read_item(slug: str, item_id: ItemId, _: CurrentAdmin, store: StoreDep) -> Stored:
    try:
        document = edits._item(store.load(), slug, item_id)
    except edits.NotFound as error:
        raise HTTPException(404, error.message) from error
    return Stored(collection=slug, key=document.key, entry=document.data, rev=document.rev)


@edit_router.patch("/{slug}/{item_id}", response_model=EditResult)
def edit_item(slug: str, item_id: ItemId, body: ItemEdit, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(
        store, slug, str(item_id),
        lambda: edits.edit_item(store, log, admin, slug, item_id, body.rev, body.changes, body.why),
    )


@edit_router.post("/{slug}", response_model=EditResult, status_code=201)
def create_item(slug: str, body: ItemCreate, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(store, slug, None, lambda: edits.create_item(store, log, admin, slug, body.fields, body.why))


@edit_router.post("/{slug}/{item_id}/hide", response_model=EditResult)
def hide_item(slug: str, item_id: ItemId, body: Hide, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(store, slug, str(item_id), lambda: edits.hide_item(store, log, admin, slug, item_id, body.rev, body.why))


@edit_router.post("/{slug}/{item_id}/unhide", response_model=EditResult)
def unhide_item(slug: str, item_id: ItemId, body: Unhide, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(store, slug, str(item_id), lambda: edits.unhide_item(store, log, admin, slug, item_id, body.rev, body.why))


@edit_router.post("/{slug}/{item_id}/merge", response_model=EditResult)
def merge_item(slug: str, item_id: ItemId, body: Merge, admin: CurrentAdmin, store: StoreDep, log: ChangeLogRepositoryDep):
    return _run(
        store, slug, str(item_id),
        lambda: edits.merge_item(store, log, admin, slug, item_id, body.rev, body.into, body.why),
    )
