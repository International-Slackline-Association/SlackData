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
READ_ONLY = bool(CATALOG_DB_PATH)

# Verbose SQL logging is handy locally but noisy (and leaks data) in a hosted log
# stream, so it's off by default. Set SQL_ECHO=true to re-enable for debugging.
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() in ("1", "true", "yes")

DATABASE_ENGINE: Optional[Engine] = None


def _engine_url() -> str:
    if CATALOG_DB_PATH:
        return f"sqlite:///file:{CATALOG_DB_PATH}?mode=ro&immutable=1&uri=true"
    return sqlite_url


def create_db_and_tables():
    global DATABASE_ENGINE
    if DATABASE_ENGINE is not None:
        raise RuntimeError("`create_db_and_tables` called, but database already created.")
    DATABASE_ENGINE = create_engine(
        _engine_url(), connect_args=connect_args, echo=SQL_ECHO
    )
    if not READ_ONLY:
        SQLModel.metadata.create_all(DATABASE_ENGINE)


def get_session():
    global DATABASE_ENGINE
    if DATABASE_ENGINE is None:
        raise RuntimeError("Database engine not created. Call `create_db_and_tables` first.")
    with Session(DATABASE_ENGINE) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
