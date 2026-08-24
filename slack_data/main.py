import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slack_data.database import get_session, create_db_and_tables, READ_ONLY
from slack_data.seed import seed_catalog

from slack_data.api.routers.submissions_router import warn_if_captcha_is_unconfigured
from slack_data.api.routing import docs_kwargs, register_routers


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
    # A hosted misconfiguration that is otherwise silent until a visitor hits it.
    warn_if_captcha_is_unconfigured()
    yield


# root_path lets the API sit under a path prefix (e.g. "/api" behind CloudFront)
# without changing any route — it only fixes the URLs in /docs and openapi.json.
# The docs themselves are off in the hosted read-only app; see api/routing.py.
app = FastAPI(
    lifespan=lifespan,
    root_path=os.getenv("API_ROOT_PATH", ""),
    **docs_kwargs(READ_ONLY),
)

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

# One call so the tests can build the same app. Under READ_ONLY the catalogue's
# POST/PATCH/DELETE routes are not registered at all — they 404 and are absent
# from the OpenAPI schema. See api/routing.py for why that, and not a 403.
register_routers(app, read_only=READ_ONLY)

# The SPA is served separately from S3/CloudFront (see infra/), so the API only
# needs a simple root. CloudFront routes "/" to the SPA and "/api/*" here.
@app.get("/")
def root():
    return {"message": "Welcome to SlackData"}
