from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Path
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.treepro import TreePro, TreeProCreate, TreeProPublic, TreeProUpdate

treepro_router = APIRouter(
    prefix="/treepro",
    tags=["treepro"],
    responses={404: {"description": "Not found"}}
)


@treepro_router.post("/", response_model=TreeProPublic)
def create_treepro(treepro: TreeProCreate, session: SessionDep):
    db_treepro = TreePro.model_validate(treepro)
    session.add(db_treepro)
    session.commit()
    session.refresh(db_treepro)
    return db_treepro


@treepro_router.get("/", response_model=list[TreeProPublic])
def read_treepros(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(le=100)] = 10,
):
    items = session.exec(
        select(TreePro).offset(offset).limit(limit)
    ).all()
    return items


@treepro_router.get("/{treepro_id}", response_model=TreeProPublic)
def read_treepro(treepro_id: Annotated[int, Path(gt=0)], session: SessionDep):
    treepro = session.get(TreePro, treepro_id)
    if not treepro:
        raise HTTPException(status_code=404, detail=f"TreePro {treepro_id} not found")
    return treepro


@treepro_router.patch("/{treepro_id}", response_model=TreeProPublic)
def update_treepro(
    treepro_id: Annotated[int, Path(gt=0)],
    treepro: TreeProUpdate,
    session: SessionDep
):
    db_treepro = session.get(TreePro, treepro_id)
    if not db_treepro:
        raise HTTPException(status_code=404, detail=f"TreePro {treepro_id} not found")
    
    treepro_data = treepro.model_dump(exclude_unset=True)
    for key, value in treepro_data.items():
        setattr(db_treepro, key, value)
    
    session.add(db_treepro)
    session.commit()
    session.refresh(db_treepro)
    return db_treepro


@treepro_router.delete("/{treepro_id}")
def delete_treepro(treepro_id: Annotated[int, Path(gt=0)], session: SessionDep):
    db_treepro = session.get(TreePro, treepro_id)
    if not db_treepro:
        raise HTTPException(status_code=404, detail=f"TreePro {treepro_id} not found")
    
    session.delete(db_treepro)
    session.commit()
    return {"ok": True}
