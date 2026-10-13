import os
from typing import Annotated, Optional
from fastapi import Depends
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

# Local/dev default: a writable SQLite file in the CWD, seeded from the root
# *.json files on first boot.
sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
connect_args = {"check_same_thread": False}

# Hosted (Lambda) mode: CATALOG_DB_PATH points at a pre-built catalog SQLite that
# ships inside the deployment package. When set, the app opens it strictly
# read-only and never creates tables or seeds — the catalog is baked at build
# time (see scripts/build_catalog_db.py). `immutable=1` tells SQLite the file
# cannot change, so it needs no journal/lock files and works on Lambda's
# read-only filesystem.
CATALOG_DB_PATH = os.getenv("CATALOG_DB_PATH")

# Live editing, phase 2: CATALOG_SOURCE=store reads the catalogue from the
# catalogue store instead (slack_data/catalogue/), built into memory and rebuilt
# whenever the store's version moves. It wins over CATALOG_DB_PATH, so the image
# can keep its baked file as the rollback: flipping the variable back is the
# whole of undoing the switch-over.
STORE_MODE = (os.getenv("CATALOG_SOURCE") or "").strip().lower() == "store"

# READ_ONLY keeps its meaning — "this is the baked catalogue file" — because
# deployment.is_hosted() reads it as one of its hosted signals, and local store
# mode must not count as hosted.
READ_ONLY = bool(CATALOG_DB_PATH)

# Whether the raw catalogue CRUD writes are mounted (api/routing.py). Never in
# either hosted shape: not on the baked file, which cannot be written, and not on
# the store's in-memory copy, which the next rebuild would silently throw away.
# Edits arrive in phase 3 through their own logged routes, not through these.
CATALOGUE_WRITABLE = not (READ_ONLY or STORE_MODE)

# Verbose SQL logging is handy locally but noisy (and leaks data) in a hosted log
# stream, so it's off by default. Set SQL_ECHO=true to re-enable for debugging.
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in ("1", "true", "yes")

DATABASE_ENGINE: Optional[Engine] = None

# Store mode only: the live catalogue that hands out the current engine.
LIVE_CATALOGUE = None


def _engine_url() -> str:
    if CATALOG_DB_PATH:
        return f"sqlite:///file:{CATALOG_DB_PATH}?mode=ro&immutable=1&uri=true"
    return sqlite_url


def create_db_and_tables():
    global DATABASE_ENGINE, LIVE_CATALOGUE
    if DATABASE_ENGINE is not None:
        raise RuntimeError("`create_db_and_tables` called, but database already created.")
    if STORE_MODE:
        from slack_data.catalogue.live import LiveCatalogue
        from slack_data.catalogue.store import get_catalogue_repository

        LIVE_CATALOGUE = LiveCatalogue(get_catalogue_repository())
        # Built now, on the cold start, so the first visitor does not pay for it
        # and a store that cannot be read fails the start rather than a request.
        DATABASE_ENGINE = LIVE_CATALOGUE.engine()
        return
    DATABASE_ENGINE = create_engine(
        _engine_url(), connect_args=connect_args, echo=SQL_ECHO
    )
    if CATALOGUE_WRITABLE:
        SQLModel.metadata.create_all(DATABASE_ENGINE)


def get_session():
    global DATABASE_ENGINE
    if DATABASE_ENGINE is None:
        raise RuntimeError("Database engine not created. Call `create_db_and_tables` first.")
    if LIVE_CATALOGUE is not None:
        # One version read per request (D30); a rebuild only when it moved.
        DATABASE_ENGINE = LIVE_CATALOGUE.engine()
    with Session(DATABASE_ENGINE) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
