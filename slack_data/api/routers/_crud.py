"""The factory behind the per-gear-type catalogue routers.

Every catalogue router was the same five handlers — create / list / read /
update / delete — retyped once per model, which is how four of them ended up
returning a variable called `heroes` and how the 404 message drifted between
"Webbing 1 not found" and "weblock 1 not found". The shape is genuinely
identical, so it is written once here and parameterised by model.

Three details are deliberately preserved rather than simplified, because they
are published API surface rather than implementation:

* **The path parameter keeps its per-type name** (`/webbing/{webbing_id}`, not
  `/webbing/{item_id}`). `tests/test_read_only.py` asserts the exact path
  template; `_named_id` is what buys that back after the handlers are written
  generically.
* **The handlers keep their per-type names** (`read_webbings`, not
  `read_items`), because FastAPI derives `operationId` and `summary` from them
  and a generated client turns those into method names.
* **The writes are real routes on the returned router**, not something this
  factory can be asked to omit. `register_routers` filters on `route.methods`,
  and read-only mode stays the one place that decision is made.

The resulting OpenAPI schema is byte-identical to the nine hand-written routers
this replaced.
"""

import inspect
from typing import Annotated, Any, Callable

from fastapi import APIRouter, HTTPException, Path, Query
from sqlmodel import SQLModel, select

from slack_data.database import SessionDep


def _named(func: Callable, name: str, id_param: str | None = None) -> Callable:
    """Rename `func`, and give it a path parameter called `id_param`.

    FastAPI reads the endpoint's signature to build the path template, the
    OpenAPI parameter list, and the keyword arguments it will call with — and it
    honours an explicit `__signature__` over the real one. So the id parameter
    is *declared here* under its per-type name rather than written into the
    handler under a generic one; the handlers absorb it through `**kwargs` and
    read it back by the same name.
    """
    func.__name__ = name
    if id_param is not None:
        signature = inspect.signature(func)
        params = [
            param
            for param in signature.parameters.values()
            if param.kind is not inspect.Parameter.VAR_KEYWORD
        ]
        params.append(
            inspect.Parameter(
                id_param,
                inspect.Parameter.KEYWORD_ONLY,
                # `le` as well as `gt`, because an id is eventually handed to
                # SQLite as a bound parameter and SQLite integers are signed
                # 64-bit. Python's are not: a larger literal parses cleanly here
                # and then raises inside the driver, which surfaces as a 500 on
                # an unauthenticated GET. The bound turns that into a 422.
                annotation=Annotated[int, Path(gt=0, le=2**63 - 1)],
            )
        )
        func.__signature__ = signature.replace(parameters=params)  # type: ignore[attr-defined]
    return func


def crud_router(
    *,
    prefix: str,
    model: type[SQLModel],
    create_model: type[SQLModel],
    public_model: type[SQLModel],
    update_model: type[SQLModel],
) -> APIRouter:
    """The standard five CRUD routes over one table.

    `prefix` is the bare singular name (`"webbing"`), which becomes the URL
    prefix, the OpenAPI tag, the `{webbing_id}` path parameter and the handler
    names. The 404 label is the model's own class name, so it cannot drift from
    the thing it names.
    """
    router = APIRouter(
        prefix=f"/{prefix}",
        tags=[prefix],
        responses={404: {"description": "Not found"}},
    )
    id_path = f"/{{{prefix}_id}}"
    id_param = f"{prefix}_id"
    label = model.__name__

    def _get_or_404(session: SessionDep, item_id: int) -> Any:
        item = session.get(model, item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"{label} {item_id} not found")
        return item

    def create_item(item: create_model, session: SessionDep):  # type: ignore[valid-type]
        db_item = model.model_validate(item)
        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        return db_item

    def read_items(
        session: SessionDep,
        offset: Annotated[int, Query(ge=0)] = 0,
        # `ge=1` is not symmetry for its own sake. `le=100` alone leaves the
        # bottom open, and SQL treats a NEGATIVE limit as "no limit" — so
        # `?limit=-1` returned the whole table on every gear type, to anyone,
        # unauthenticated. The cap that was written down was not the cap that
        # was enforced.
        limit: Annotated[int, Query(ge=1, le=100)] = 10,
    ):
        return session.exec(select(model).offset(offset).limit(limit)).all()

    def read_item(session: SessionDep, **kwargs):
        return _get_or_404(session, kwargs[id_param])

    def update_item(item: update_model, session: SessionDep, **kwargs):  # type: ignore[valid-type]
        db_item = _get_or_404(session, kwargs[id_param])
        for key, value in item.model_dump(exclude_unset=True).items():
            setattr(db_item, key, value)
        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        return db_item

    def delete_item(session: SessionDep, **kwargs):
        session.delete(_get_or_404(session, kwargs[id_param]))
        session.commit()
        return {"ok": True}

    router.post("/", response_model=public_model)(
        _named(create_item, f"create_{prefix}")
    )
    router.get("/", response_model=list[public_model])(
        _named(read_items, f"read_{prefix}s")
    )
    router.get(id_path, response_model=public_model)(
        _named(read_item, f"read_{prefix}", id_param)
    )
    router.patch(id_path, response_model=public_model)(
        _named(update_item, f"update_{prefix}", id_param)
    )
    router.delete(id_path)(
        _named(delete_item, f"delete_{prefix}", id_param)
    )
    return router
