from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.grips import Grip, GripCreate, GripPublic, GripUpdate

grip_router = APIRouter(
    prefix="/grip",
    tags=["grip"],
    responses={404: {"description": "Not found"}}
)

@grip_router.post("/", response_model=GripPublic)
def create_grip(grip: GripCreate, session: SessionDep):
    db_grip = Grip.model_validate(grip)
    session.add(db_grip)
    session.commit()
    session.refresh(db_grip)
    return db_grip

@grip_router.get("/", response_model=list[GripPublic])
def read_grips(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    grips = session.exec(
        select(Grip).offset(offset).limit(limit)
    ).all()
    return grips

@grip_router.get("/{grip_id}", response_model=GripPublic)
def read_grip(grip_id: Annotated[int, Path(gt=0)], session: SessionDep):
    grip = session.get(Grip, grip_id)
    if not grip:
        raise HTTPException(status_code=404, detail=f"Grip {grip_id} not found")
    return grip

@grip_router.patch("/{grip_id}", response_model=GripPublic)
def update_grip(
    grip_id: Annotated[int, Path(gt=0)],
    grip: GripUpdate,
    session: SessionDep
):
    db_grip = session.get(Grip, grip_id)
    if not db_grip:
        raise HTTPException(status_code=404, detail=f"Grip {grip_id} not found")
    
    grip_data = grip.model_dump(exclude_unset=True)
    for key, value in grip_data.items():
        setattr(db_grip, key, value)
    
    session.add(db_grip)
    session.commit()
    session.refresh(db_grip)
    return db_grip

@grip_router.delete("/{grip_id}")
def delete_grip(grip_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_grip = session.get(Grip, grip_id)
    if not db_grip:
        raise HTTPException(status_code=404, detail=f"Grip {grip_id} not found")
    
    session.delete(db_grip)
    session.commit()
    return {"ok": True}