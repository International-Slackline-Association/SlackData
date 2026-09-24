from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.isa_gear_certifications import (
    ISAGearCertification,
    ISAGearCertificationPublic,
)

isa_certification_router = APIRouter(
    prefix="/isacertification",
    tags=["isacertification"],
    responses={404: {"description": "Not found"}}
)


@isa_certification_router.get("/", response_model=list[ISAGearCertificationPublic])
def read_isa_certifications(
    session: SessionDep,
    gear_type: Annotated[str | None, Query()] = None,
    gear_id: Annotated[int | None, Query(gt=0)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    # Read-only reference data, and small: a few dozen rows for the whole
    # catalogue. The frontend fetches the lot once and indexes it by
    # (gear_type, gear_id), exactly as it does /isawarning.
    limit: Annotated[int, Query(le=500)] = 500,
):
    """Every certificate, or just the ones on one gear item."""
    statement = select(ISAGearCertification)
    if gear_type is not None:
        statement = statement.where(ISAGearCertification.gear_type == gear_type)
    if gear_id is not None:
        statement = statement.where(ISAGearCertification.gear_id == gear_id)
    # Stable and meaningful: grouped by item, then in the ISA's own order.
    statement = statement.order_by(
        ISAGearCertification.gear_type, ISAGearCertification.gear_id, ISAGearCertification.id
    ).offset(offset).limit(limit)
    return session.exec(statement).all()


@isa_certification_router.get("/{certification_id}", response_model=ISAGearCertificationPublic)
def read_isa_certification(certification_id: Annotated[int, Path(gt=0)], session: SessionDep):
    certification = session.get(ISAGearCertification, certification_id)
    if not certification:
        raise HTTPException(
            status_code=404, detail=f"ISA certification {certification_id} not found"
        )
    return certification
