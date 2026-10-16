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

import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from slack_data.api import auth
from slack_data.api.routing import register_routers
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.changelog.store import get_changelog_repository
from slack_data.database import get_session
from slack_data.manufacturers.clients import InMemoryBrandClientRepository
from slack_data.manufacturers.store import get_client_repository
from slack_data.models.brands import Brand
from slack_data.people.repository import InMemoryPeopleRepository
from slack_data.people.store import get_people_repository
from slack_data.submissions.repository import InMemorySubmissionRepository
from slack_data.submissions.store import get_repository


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


@pytest.fixture(autouse=True)
def _not_on_lambda(monkeypatch):
    """Every test starts local, whatever shell it runs in.

    `deployment.is_hosted()` reads two environment variables besides
    `READ_ONLY`; a stray one in a developer's or CI's shell would silently flip
    every "local dev" test into the hosted lockout. Tests that want hosted set
    it themselves.
    """
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.delenv("SLACKDATA_DEPLOYMENT", raising=False)


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
def client(session, submissions, brand_clients, people, changelog):
    app = _build_test_app()

    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_repository] = lambda: submissions
    app.dependency_overrides[get_client_repository] = lambda: brand_clients
    app.dependency_overrides[get_people_repository] = lambda: people
    app.dependency_overrides[get_changelog_repository] = lambda: changelog

    with TestClient(app) as c:
        yield c


@pytest.fixture
def submissions():
    """An empty submission store, isolated per test.

    Every client fixture wires this in. Without it the default store would be
    picked from the environment and a test run would create (and accumulate
    into) a real `submissions.db` in the working directory.
    """
    return InMemorySubmissionRepository()


@pytest.fixture
def read_only_client(session, submissions, brand_clients, people, changelog):
    """A client for the hosted catalogue's shape: GET routes and nothing else.

    The session is still writable — the point of the guard is that the routes
    are absent, not that SQLite refuses. That distinction matters because
    Phase 2 adds a store the Lambda *can* write to.
    """
    app = _build_test_app(read_only=True)

    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_repository] = lambda: submissions
    app.dependency_overrides[get_client_repository] = lambda: brand_clients
    app.dependency_overrides[get_people_repository] = lambda: people
    app.dependency_overrides[get_changelog_repository] = lambda: changelog

    with TestClient(app) as c:
        yield c


@pytest.fixture
def brand_clients():
    """An empty brand-client store, isolated per test.

    Wired into every client fixture for the same reason `submissions` is: left
    to the environment, a test run would create a real `brand_clients.db` in the
    working directory and carry credentials between tests.
    """
    return InMemoryBrandClientRepository()


@pytest.fixture
def people():
    """An empty people store, isolated per test — the same reason as above."""
    return InMemoryPeopleRepository()


@pytest.fixture
def changelog():
    """An empty change log, isolated per test."""
    return InMemoryChangeLogRepository()


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


POOL = "eu-central-1_TESTPOOL"
APP_CLIENT = "slackdata-test-client"


@pytest.fixture
def isa(monkeypatch):
    """The ISA pool configured, with a throwaway RSA key and a matching JWKS.

    Returns a factory for signed ID tokens; an override of None drops a claim.
    Shared by test_auth.py (the verifier) and test_people.py (the routes).
    """
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "test-key-1"
    # Built exactly as `_fetch_jwks` builds it — from the JWK dict a pool
    # publishes — so the fixture can't drift from the code it stands in for.
    jwk_data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk_data["kid"] = kid
    jwk = jwt.PyJWK(jwk_data)

    monkeypatch.setattr(auth, "ISA_USER_POOL_ID", POOL)
    monkeypatch.setattr(auth, "ISA_CLIENT_ID", APP_CLIENT)
    monkeypatch.setattr(auth, "ISA_REGION", "eu-central-1")
    monkeypatch.delenv("ADMIN_BOOTSTRAP_EMAILS", raising=False)
    # Patch the fetch, not the verification: everything from the signature
    # onwards is still the real code path.
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: {kid: jwk})
    auth._jwks_cache["keys"] = {}
    auth._jwks_cache["fetched_at"] = 0.0

    def token(**overrides):
        claims = {
            "sub": "person-sub-1",
            "cognito:username": "person-username-1",
            "aud": APP_CLIENT,
            "iss": auth.issuer(),
            "token_use": "id",
            "name": "Ada",
            "family_name": "Lovelace",
            "email": "ada@example.org",
            "email_verified": True,
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            **overrides,
        }
        # An override of None DROPS the claim.
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    return token
