"""
The hosted catalogue must publish no write surface at all.

Live, the catalogue is a SQLite file baked into the Lambda image and opened
`mode=ro&immutable=1`, so a `POST` / `PATCH` / `DELETE` fails down at the SQLite
layer. That made 27 unauthenticated write endpoints *inert*, but they were still
registered, still in the public OpenAPI schema, and still had a working "Try it
out" button on /api/docs.

Phase 2 introduces a writable store (DynamoDB) and an execution role that can
reach it. From that point "inert because of how the file is opened" is one
careless `SessionDep` away from being false, so the routes have to be genuinely
absent rather than merely doomed.

These tests are the regression guard: without them the routes come back the next
time someone refactors router registration.
"""

import pytest

from slack_data.api.routing import docs_kwargs, read_only_view
from slack_data.api.routers.webbing_router import webbing_router

from test_active import PREFIXES, _payloads


# ---------------------------------------------------------------------------
# Read-only mode — the hosted shape
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("prefix", PREFIXES + ["/brand"])
def test_reads_still_work_when_read_only(read_only_client, prefix):
    """The whole point of the site: every GET route survives the filter."""
    assert read_only_client.get(f"{prefix}/").status_code == 200


@pytest.mark.parametrize("prefix", PREFIXES)
def test_writes_are_not_routed_when_read_only(read_only_client, brand, prefix):
    """No write route is mounted, so nothing reaches a handler.

    The status is 405, not 404: the *path* still exists because its GET twin is
    registered, and Starlette answers a known path with an unknown method that
    way. What matters is that no handler runs and no request body is ever
    validated — a 404 is only reachable for a path with no read route at all.
    """
    payload = _payloads(brand.id)[prefix]
    assert read_only_client.post(f"{prefix}/", json=payload).status_code == 405
    assert read_only_client.patch(f"{prefix}/1", json={"active": False}).status_code == 405
    assert read_only_client.delete(f"{prefix}/1").status_code == 405


def test_brand_writes_are_not_routed_when_read_only(read_only_client):
    """/brand is not a gear type and is easy to forget; it carries writes too."""
    assert read_only_client.post("/brand/", json={"name": "Sneaky"}).status_code == 405
    assert read_only_client.patch("/brand/1", json={"name": "Sneaky"}).status_code == 405
    assert read_only_client.delete("/brand/1").status_code == 405


def test_read_only_schema_documents_no_write_operations(read_only_client):
    """The OpenAPI schema is the discovery surface — it must be clean.

    Asserted over the whole schema rather than route by route, so a *new*
    catalogue router registered with write methods fails here even though no
    test above knows about it.

    Phase 2's `/submissions` will be the one allowed exception — it writes to a
    different store, so it is unaffected by the catalogue being read-only. Add
    it here deliberately when it lands, rather than loosening the rule.
    """
    schema = read_only_client.get("/openapi.json").json()
    offenders = [
        f"{method.upper()} {path}"
        for path, operations in schema["paths"].items()
        for method in operations
        if method.lower() not in ("get", "head", "parameters")
    ]
    assert offenders == []


def test_read_only_leaves_no_write_route_registered(read_only_client):
    """Belt and braces: check the router table, not just what it documents."""
    for route in read_only_client.app.routes:
        # FastAPI wraps included routers in objects with no `path`; the concrete
        # routes are enumerated alongside them, so skipping the wrappers loses
        # no coverage.
        path = getattr(route, "path", "")
        if not path:
            continue
        assert set(getattr(route, "methods", ())) <= {"GET", "HEAD"}, path


# ---------------------------------------------------------------------------
# Local dev — unchanged, because the loaders and the seed still need it
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("prefix", PREFIXES)
def test_writes_still_work_in_dev_mode(client, brand, prefix):
    """The same routes, mounted normally, still round-trip a full write cycle."""
    created = client.post(f"{prefix}/", json=_payloads(brand.id)[prefix])
    assert created.status_code == 200
    item_id = created.json()["id"]

    patched = client.patch(f"{prefix}/{item_id}", json={"active": False})
    assert patched.status_code == 200
    assert patched.json()["active"] is False

    assert client.delete(f"{prefix}/{item_id}").status_code == 200
    assert client.get(f"{prefix}/{item_id}").status_code == 404


def test_dev_schema_still_documents_the_write_operations(client):
    """Guards the guard: proves the assertion above can fail."""
    schema = client.get("/openapi.json").json()
    assert "post" in schema["paths"]["/webbing/"]
    assert "patch" in schema["paths"]["/webbing/{webbing_id}"]
    assert "delete" in schema["paths"]["/webbing/{webbing_id}"]


# ---------------------------------------------------------------------------
# The filter itself
# ---------------------------------------------------------------------------

def test_read_only_view_does_not_mutate_the_source_router():
    """The routers are module-level singletons imported in several places."""
    before = len(webbing_router.routes)
    filtered = read_only_view(webbing_router)
    assert len(webbing_router.routes) == before
    assert len(filtered.routes) < before


def test_read_only_view_keeps_paths_unprefixed():
    """A prefix on the copy would apply /webbing twice — the paths are baked in."""
    paths = {route.path for route in read_only_view(webbing_router).routes}
    assert paths == {"/webbing/", "/webbing/{webbing_id}"}


# ---------------------------------------------------------------------------
# Interactive docs
# ---------------------------------------------------------------------------

def test_docs_are_served_in_dev():
    assert docs_kwargs(read_only=False)["openapi_url"] == "/openapi.json"


def test_docs_are_off_when_read_only(monkeypatch):
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    assert docs_kwargs(read_only=True) == {
        "docs_url": None,
        "redoc_url": None,
        "openapi_url": None,
    }


def test_docs_can_be_switched_back_on_by_env(monkeypatch):
    """An env-var flip, so re-enabling them needs no code change."""
    monkeypatch.setenv("ENABLE_DOCS", "true")
    assert docs_kwargs(read_only=True)["docs_url"] == "/docs"
