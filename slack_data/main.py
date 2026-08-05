import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from slack_data.database import get_session, create_db_and_tables, READ_ONLY
from slack_data.seed import seed_catalog

from slack_data.api.routers.brand_router import brand_router
from slack_data.api.routers.grip_router import grip_router
from slack_data.api.routers.leashring_router import leashring_router
from slack_data.api.routers.roller_router import roller_router
from slack_data.api.routers.starterkit_router import starterkit_router
from slack_data.api.routers.treepro_router import treepro_router
from slack_data.api.routers.tricklinekit_router import tricklinekit_router
from slack_data.api.routers.webbing_router import webbing_router
from slack_data.api.routers.weblock_router import weblock_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Local/dev: create a writable SQLite in the CWD and seed it from the root
    # *.json files on first boot. Hosted (read-only) mode ships a pre-built
    # catalog baked into the deployment package, so there is nothing to create
    # or seed here — see slack_data.database and scripts/build_catalog_db.py.
    create_db_and_tables()
    if not READ_ONLY:
        with next(get_session()) as session:
            seed_catalog(session)
    yield


# root_path lets the API sit under a path prefix (e.g. "/api" behind CloudFront)
# without changing any route — it only fixes the URLs in /docs and openapi.json.
app = FastAPI(lifespan=lifespan, root_path=os.getenv("API_ROOT_PATH", ""))

# Allow the local Vite dev server (and preview) to call the API from the browser.
# 5174 is the conventional second port: Vite falls back to it when 5173 is taken,
# which is what a git worktree running its own dev server alongside the primary
# one gets. Without it that server returns no data at all and the app looks
# broken for a reason unrelated to the code under test.
# Hosted builds don't depend on any of this — the container serves the SPA and
# the API from a single origin, so there is no cross-origin request to allow.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(brand_router)
app.include_router(grip_router)
app.include_router(leashring_router)
app.include_router(roller_router)
app.include_router(starterkit_router)
app.include_router(treepro_router)
app.include_router(tricklinekit_router)
app.include_router(webbing_router)
app.include_router(weblock_router)

# Serve the built React SPA (frontend/dist) from the same origin as the API, so
# the whole app can ship as a single container with no CORS. This is only wired
# up when a production build is present — the hosted serverless deploy serves the
# SPA from S3/CloudFront instead (no dist in the Lambda image), and backend-only
# runs (plus the pytest app in tests/conftest.py) skip it entirely.
_DIST_DEFAULT = Path(__file__).resolve().parent.parent / "frontend" / "dist"
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", str(_DIST_DEFAULT))).resolve()

if FRONTEND_DIST.is_dir():
    _INDEX_HTML = FRONTEND_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # A request for a real built asset (JS/CSS/images/icons/flags) → serve the
        # file; anything else → index.html so client-side routes survive a refresh.
        # The API routers are registered above and take precedence over this
        # catch-all, so JSON endpoints are never shadowed.
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_INDEX_HTML)
else:
    @app.get("/")
    def root():
        return {"message": "Welcome to SlackData"}
