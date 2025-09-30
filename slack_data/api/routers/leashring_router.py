from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.leashrings import LeashRing, LeashRingCreate, LeashRingPublic, LeashRingUpdate

leashring_router = APIRouter(
    prefix="/leashring",
    tags=["leashring"],
    responses={404: {"description": "Not found"}}
)

@leashring_router.post("/", response_model=LeashRingPublic)
def create_leashring(leashring: LeashRingCreate, session: SessionDep):
    db_leashring = LeashRing.model_validate(leashring)
    session.add(db_leashring)
    session.commit()
    session.refresh(db_leashring)
    return db_leashring

@leashring_router.get("/", response_model=list[LeashRingPublic])
def read_leashrings(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    leashrings = session.exec(
        select(LeashRing).offset(offset).limit(limit)
    ).all()
    return leashrings

@leashring_router.get("/{leashring_id}", response_model=LeashRingPublic)
def read_leashring(leashring_id: Annotated[int, Path(gt=0)], session: SessionDep):
    leashring = session.get(LeashRing, leashring_id)
    if not leashring:
        raise HTTPException(status_code=404, detail=f"Leash ring {leashring_id} not found")
    return leashring

@leashring_router.patch("/{leashring_id}", response_model=LeashRingPublic)
def update_leashring(
    leashring_id: Annotated[int, Path(gt=0)],
    leashring: LeashRingUpdate,
    session: SessionDep
):
    db_leashring = session.get(LeashRing, leashring_id)
    if not db_leashring:
        raise HTTPException(status_code=404, detail=f"Leash ring {leashring_id} not found")
    
    leashring_data = leashring.model_dump(exclude_unset=True)
    for key, value in leashring_data.items():
        setattr(db_leashring, key, value)
    
    session.add(db_leashring)
    session.commit()
    session.refresh(db_leashring)
    return db_leashring

@leashring_router.delete("/{leashring_id}")
def delete_leashring(leashring_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_leashring = session.get(LeashRing, leashring_id)
    if not db_leashring:
        raise HTTPException(status_code=404, detail=f"Leash ring {leashring_id} not found")
    
    session.delete(db_leashring)
    session.commit()
    return {"ok": True}
