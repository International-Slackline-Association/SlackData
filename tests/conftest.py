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

from slack_data.api.routing import register_routers
from slack_data.database import get_session
from slack_data.models.brands import Brand


def _build_test_app(read_only: bool = False) -> FastAPI:
    """Minimal app — same routers as production, no lifespan seeding.

    Registration goes through the same `register_routers` main.py uses, so the
    routes these tests exercise are the routes production serves. `read_only`
    mirrors the hosted catalogue, where the write routes are never mounted; see
    slack_data/api/routing.py and tests/test_read_only.py.
    """
    app = FastAPI()
    register_routers(app, read_only=read_only)
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
def read_only_client(session):
    """A client for the hosted catalogue's shape: GET routes and nothing else.

    The session is still writable — the point of the guard is that the routes
    are absent, not that SQLite refuses. That distinction matters because
    Phase 2 adds a store the Lambda *can* write to.
    """
    app = _build_test_app(read_only=True)

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


def persist(session, obj):
    """Add, commit, refresh — the four lines every `make_<type>` helper repeated.

    Each test file still builds its own model instance, because the required
    fields differ per gear type and naming them at the call site is the point of
    those helpers. Only the session dance is shared.
    """
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj
