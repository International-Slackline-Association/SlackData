"""
Shared fixtures for all tests.

We deliberately do NOT use the production app from main.py.  The production
app has an async lifespan that calls create_db_and_tables() (which guards
against a second call with a RuntimeError) and seeds data from JSON files.
Trying to monkeypatch around all of that is fragile.

Instead we create a bare FastAPI app with the same routers but no lifespan.
The `engine` fixture creates an isolated in-memory SQLite database, and the
`session` fixture provides a Session that is injected into every request via
FastAPI's dependency_overrides.  Each test starts with an empty database and
inserts only what it needs.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from slack_data.database import get_session
from slack_data.models.brands import Brand
from slack_data.api.routers.brand_router import brand_router
from slack_data.api.routers.grip_router import grip_router
from slack_data.api.routers.leashring_router import leashring_router
from slack_data.api.routers.roller_router import roller_router
from slack_data.api.routers.starterkit_router import starterkit_router
from slack_data.api.routers.treepro_router import treepro_router
from slack_data.api.routers.tricklinekit_router import tricklinekit_router
from slack_data.api.routers.webbing_router import webbing_router
from slack_data.api.routers.weblock_router import weblock_router


def _build_test_app() -> FastAPI:
    """Minimal app — same routers as production, no lifespan seeding."""
    app = FastAPI()
    app.include_router(brand_router)
    app.include_router(grip_router)
    app.include_router(leashring_router)
    app.include_router(roller_router)
    app.include_router(starterkit_router)
    app.include_router(treepro_router)
    app.include_router(tricklinekit_router)
    app.include_router(webbing_router)
    app.include_router(weblock_router)
    return app


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",  # in-memory; isolated per test
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # single shared connection so session + requests see the same data
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def session(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(session):
    app = _build_test_app()

    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override

    with TestClient(app) as c:
        yield c


@pytest.fixture
def brand(session):
    """A generic brand row available to all test files."""
    b = Brand(name="Test Brand")
    session.add(b)
    session.commit()
    session.refresh(b)
    return b
