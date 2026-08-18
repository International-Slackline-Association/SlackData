import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slack_data.database import get_session, create_db_and_tables, READ_ONLY
from slack_data.seed import seed_catalog

from slack_data.api.routers.brand_router import brand_router
from slack_data.api.routers.fx_router import fx_router
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
# Hosted builds don't depend on any of this — the SPA and the API share one
# CloudFront origin (the API under /api), so every request is same-origin.
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
# Display-layer FX rates — no session, no DB access, safe under READ_ONLY.
app.include_router(fx_router)
app.include_router(grip_router)
app.include_router(leashring_router)
app.include_router(roller_router)
app.include_router(starterkit_router)
app.include_router(treepro_router)
app.include_router(tricklinekit_router)
app.include_router(webbing_router)
app.include_router(weblock_router)

# The SPA is served separately from S3/CloudFront (see infra/), so the API only
# needs a simple root. CloudFront routes "/" to the SPA and "/api/*" here.
@app.get("/")
def root():
    return {"message": "Welcome to SlackData"}
