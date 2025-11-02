from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.starterkits import  StarterKit, StarterKitCreate, StarterKitPublic, StarterKitUpdate


starterkit_router = APIRouter(
    prefix="/starterkit",
    tags=["starterkit"],
    responses={404: {"description": "Not found"}}
)


@starterkit_router.post("/", response_model=StarterKitPublic)
def create_starterkit(starterkit: StarterKitCreate, session: SessionDep):
    db_starterkit = StarterKit.model_validate(starterkit)
    session.add(db_starterkit)
    session.commit()
    session.refresh(db_starterkit)
    return db_starterkit


@starterkit_router.get("/", response_model=list[StarterKitPublic])
def read_starterkits(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    items = session.exec(
        select(StarterKit).offset(offset).limit(limit)
    ).all()
    return items


@starterkit_router.get("/{starterkit_id}", response_model=StarterKitPublic)
def read_starterkit(starterkit_id: Annotated[int, Path(gt=0)], session: SessionDep):
    starterkit = session.get(StarterKit, starterkit_id)
    if not starterkit:
        raise HTTPException(status_code=404, detail=f"StarterKit {starterkit_id} not found")
    return starterkit


@starterkit_router.patch("/{starterkit_id}", response_model=StarterKitPublic)
def update_starterkit(
    starterkit_id: Annotated[int, Path(gt=0)],
    starterkit: StarterKitUpdate,
    session: SessionDep
):
    db_starterkit = session.get(StarterKit, starterkit_id)
    if not db_starterkit:
        raise HTTPException(status_code=404, detail=f"StarterKit {starterkit_id} not found")
    
    starterkit_data = starterkit.model_dump(exclude_unset=True)
    for key, value in starterkit_data.items():
        setattr(db_starterkit, key, value)
    
    session.add(db_starterkit)
    session.commit()
    session.refresh(db_starterkit)
    return db_starterkit


@starterkit_router.delete("/{starterkit_id}")
def delete_starterkit(starterkit_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_starterkit = session.get(StarterKit, starterkit_id)
    if not db_starterkit:
        raise HTTPException(status_code=404, detail=f"StarterKit {starterkit_id} not found")
    
    session.delete(db_starterkit)
    session.commit()
    return {"ok": True}
