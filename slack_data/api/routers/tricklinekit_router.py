from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.tricklinekits import  TricklineKit, TricklineKitCreate, TricklineKitPublic, TricklineKitUpdate


tricklinekit_router = APIRouter(
    prefix="/tricklinekit",
    tags=["tricklinekit"],
    responses={404: {"description": "Not found"}}
)


@tricklinekit_router.post("/", response_model=TricklineKitPublic)
def create_tricklinekit(tricklinekit: TricklineKitCreate, session: SessionDep):
    db_tricklinekit = TricklineKit.model_validate(tricklinekit)
    session.add(db_tricklinekit)
    session.commit()
    session.refresh(db_tricklinekit)
    return db_tricklinekit


@tricklinekit_router.get("/", response_model=list[TricklineKitPublic])
def read_tricklinekits(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    items = session.exec(
        select(TricklineKit).offset(offset).limit(limit)
    ).all()
    return items


@tricklinekit_router.get("/{tricklinekit_id}", response_model=TricklineKitPublic)
def read_tricklinekit(tricklinekit_id: Annotated[int, Path(gt=0)], session: SessionDep):
    tricklinekit = session.get(TricklineKit, tricklinekit_id)
    if not tricklinekit:
        raise HTTPException(status_code=404, detail=f"TricklineKit {tricklinekit_id} not found")
    return tricklinekit


@tricklinekit_router.patch("/{tricklinekit_id}", response_model=TricklineKitPublic)
def update_tricklinekit(
    tricklinekit_id: Annotated[int, Path(gt=0)],
    tricklinekit: TricklineKitUpdate,
    session: SessionDep
):
    db_tricklinekit = session.get(TricklineKit, tricklinekit_id)
    if not db_tricklinekit:
        raise HTTPException(status_code=404, detail=f"TricklineKit {tricklinekit_id} not found")
    
    tricklinekit_data = tricklinekit.model_dump(exclude_unset=True)
    for key, value in tricklinekit_data.items():
        setattr(db_tricklinekit, key, value)
    
    session.add(db_tricklinekit)
    session.commit()
    session.refresh(db_tricklinekit)
    return db_tricklinekit


@tricklinekit_router.delete("/{tricklinekit_id}")
def delete_tricklinekit(tricklinekit_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_tricklinekit = session.get(TricklineKit, tricklinekit_id)
    if not db_tricklinekit:
        raise HTTPException(status_code=404, detail=f"TricklineKit {tricklinekit_id} not found")
    
    session.delete(db_tricklinekit)
    session.commit()
    return {"ok": True}
