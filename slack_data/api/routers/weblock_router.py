from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.weblocks import Weblock, WeblockCreate, WeblockPublic, WeblockUpdate

weblock_router = APIRouter(
    prefix="/weblock",
    tags=["weblock"],
    responses={404: {"description": "Not found"}}
)

@weblock_router.post("/", response_model=WeblockPublic)
def create_weblock(weblock: WeblockCreate, session: SessionDep):
    db_weblock = Weblock.model_validate(weblock)
    session.add(db_weblock)
    session.commit()
    session.refresh(db_weblock)
    return db_weblock

@weblock_router.get("/", response_model=list[WeblockPublic])
def read_weblocks(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    heroes = session.exec(
        select(Weblock).offset(offset).limit(limit)
    ).all()
    return heroes

@weblock_router.get("/{weblock_id}", response_model=WeblockPublic)
def read_weblock(weblock_id: Annotated[int, Path(gt=0)], session: SessionDep):
    weblock = session.get(Weblock, weblock_id)
    if not weblock:
        raise HTTPException(status_code=404, detail=f"weblock {weblock_id} not found")
    return weblock

@weblock_router.patch("/{weblock_id}", response_model=WeblockPublic)
def update_weblock(
    weblock_id: Annotated[int, Path(gt=0)],
    weblock: WeblockUpdate,
    session: SessionDep
):
    db_weblock = session.get(Weblock, weblock_id)
    if not db_weblock:
        raise HTTPException(status_code=404, detail=f"weblock {weblock_id} not found")
    
    weblock_data = weblock.model_dump(exclude_unset=True)
    for key, value in weblock_data.items():
        setattr(db_weblock, key, value)
    
    session.add(db_weblock)
    session.commit()
    session.refresh(db_weblock)
    return db_weblock

@weblock_router.delete("/{weblock_id}")
def delete_weblock(weblock_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_weblock = session.get(Weblock, weblock_id)
    if not db_weblock:
        raise HTTPException(status_code=404, detail=f"weblock {weblock_id} not found")
    
    session.delete(db_weblock)
    session.commit()
    return {"ok": True}
