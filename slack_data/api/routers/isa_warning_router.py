from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.isa_gear_warnings import ISAGearWarning, ISAGearWarningPublic

isa_warning_router = APIRouter(
    prefix="/isawarning",
    tags=["isawarning"],
    responses={404: {"description": "Not found"}}
)


@isa_warning_router.get("/", response_model=list[ISAGearWarningPublic])
def read_isa_warnings(
    session: SessionDep,
    gear_type: Annotated[str | None, Query()] = None,
    gear_id: Annotated[int | None, Query(gt=0)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    # Read-only reference data, and small: ~90 rows for the whole catalogue. The
    # frontend fetches the lot once and indexes it by (gear_type, gear_id), the
    # same way it treats FX rates, so the cap is the table rather than the 100
    # the gear routers use.
    limit: Annotated[int, Query(le=500)] = 500,
):
    """Every warning, or just the ones against one gear item."""
    statement = select(ISAGearWarning)
    if gear_type is not None:
        statement = statement.where(ISAGearWarning.gear_type == gear_type)
    if gear_id is not None:
        statement = statement.where(ISAGearWarning.gear_id == gear_id)
    # Newest first — an item with several warnings leads with the latest.
    statement = statement.order_by(ISAGearWarning.date_iso.desc()).offset(offset).limit(limit)
    return session.exec(statement).all()


@isa_warning_router.get("/{warning_id}", response_model=ISAGearWarningPublic)
def read_isa_warning(warning_id: Annotated[int, Path(gt=0)], session: SessionDep):
    warning = session.get(ISAGearWarning, warning_id)
    if not warning:
        raise HTTPException(status_code=404, detail=f"ISA warning {warning_id} not found")
    return warning
