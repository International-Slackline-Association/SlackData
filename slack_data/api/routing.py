"""
Router registration, shared by the app and the test suite.

The hosted catalogue is a read-only SQLite baked into the Lambda image
(`CATALOG_DB_PATH`, see slack_data.database), so its `POST` / `PATCH` / `DELETE`
routes cannot do anything — a write fails down at the SQLite layer. They were
still published in the public OpenAPI schema though, with a working "Try it
out" button, which is a discovery surface pointing at a database that is only
inert by accident of how it is opened.

Phase 2 adds a writable store and an execution role that can reach it, so
"inert by accident" stops being good enough. Registering only the safe methods
when `READ_ONLY` is deliberately preferred over a 403 per route: the routes 404
and vanish from the schema entirely, so there is nothing to discover and nothing
for a later refactor of `main.py` to quietly reinstate.

Both `main.py` and `tests/conftest.py` build their app through
`register_routers`, so the routes the tests exercise are the routes production
serves.
"""

import os

from fastapi import APIRouter, FastAPI

from slack_data.api.routers.brand_router import brand_router
from slack_data.api.routers.fx_router import fx_router
from slack_data.api.routers.grip_router import grip_router
from slack_data.api.routers.isa_warning_router import isa_warning_router
from slack_data.api.routers.leashring_router import leashring_router
from slack_data.api.routers.manufacturer_router import manufacturer_router
from slack_data.api.routers.roller_router import roller_router
from slack_data.api.routers.starterkit_router import starterkit_router
from slack_data.api.routers.submissions_router import submissions_router
from slack_data.api.routers.treepro_router import treepro_router
from slack_data.api.routers.tricklinekit_router import tricklinekit_router
from slack_data.api.routers.webbing_router import webbing_router
from slack_data.api.routers.weblock_router import weblock_router

# Methods that cannot change catalogue state. OPTIONS is answered by the CORS
# middleware rather than by a route, so it doesn't belong here.
SAFE_METHODS = frozenset({"GET", "HEAD"})

# Routers over the catalogue — filtered when READ_ONLY. `fx_router` and
# `isa_warning_router` are already read-only, so filtering them is a no-op;
# they're in this list so that a write route added to either one in future is
# covered by default rather than by remembering to move it.
CATALOG_ROUTERS: tuple[APIRouter, ...] = (
    brand_router,
    fx_router,
    grip_router,
    isa_warning_router,
    leashring_router,
    roller_router,
    starterkit_router,
    treepro_router,
    tricklinekit_router,
    webbing_router,
    weblock_router,
)

# Routers over a *different* store, mounted in full in every mode.
#
# `POST /submissions/` has to work on the live site, where the catalogue is
# opened read-only — it writes to DynamoDB, which is a separate database that
# knows nothing about the SQLite file. This split is the whole reason the guard
# above is expressed as "the catalogue publishes no writes" rather than "the app
# publishes no writes": Phase 2 is precisely the moment those stop being the
# same statement.
# `manufacturer_router` belongs here for the same reason, with one wrinkle: it
# *reads* the catalogue (to answer "which of your products is this?") while
# writing only to the submission store. Reads are fine hosted — every GET route
# in the app reads through the same read-only session — so it is the write side
# that decides which list it goes in, and its writes are not the catalogue's.
WRITABLE_ROUTERS: tuple[APIRouter, ...] = (submissions_router, manufacturer_router)

# Kept as the union so a caller iterating "every router" still gets every router.
ROUTERS: tuple[APIRouter, ...] = CATALOG_ROUTERS + WRITABLE_ROUTERS


def read_only_view(router: APIRouter) -> APIRouter:
    """A copy of `router` carrying only its non-mutating routes.

    The routes are shared, not rebuilt: their paths already have the source
    router's prefix applied (FastAPI does that at `add_api_route` time), so the
    copy must not carry a prefix of its own or every path would gain it twice.
    """
    safe = APIRouter()
    safe.routes = [
        route
        for route in router.routes
        if SAFE_METHODS.issuperset(getattr(route, "methods", ()))
    ]
    return safe


def register_routers(app: FastAPI, *, read_only: bool) -> None:
    """Mount every router on `app`, dropping the catalogue writes when read-only."""
    for router in CATALOG_ROUTERS:
        app.include_router(read_only_view(router) if read_only else router)
    for router in WRITABLE_ROUTERS:
        app.include_router(router)


def docs_kwargs(read_only: bool) -> dict[str, str | None]:
    """The `docs_url` / `redoc_url` / `openapi_url` arguments for `FastAPI(...)`.

    Off in the hosted read-only app. The write routes are gone by then, so what
    is left to document is harmless — but the schema is also the map an attacker
    reads first, and there is no audience for it on slackdata.org that the
    repository doesn't serve better. `ENABLE_DOCS=true` brings them back without
    a redeploy of anything but the environment, which is what a future admin-
    authenticated `/docs` will want.
    """
    enabled = not read_only or os.getenv("ENABLE_DOCS", "").lower() in ("1", "true", "yes")
    if enabled:
        return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}
