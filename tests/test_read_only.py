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


def test_read_only_schema_documents_no_catalogue_writes(read_only_client):
    """The OpenAPI schema is the discovery surface — it must be clean.

    Asserted over the whole schema rather than route by route, so a *new*
    catalogue router registered with write methods fails here even though no
    test above knows about it.

    `/submissions` and `/manufacturer` are the allowed exceptions, and are named
    explicitly rather than pattern-matched: both write to a different store
    (DynamoDB hosted), so they are unaffected by the catalogue being read-only.
    Adding another exception should be a deliberate edit to this line — which is
    what happened when Phase 4 landed, and is the whole point of asserting over
    the schema rather than route by route.

    `/manufacturer` earns it on the same terms as `/submissions`: it *reads* the
    catalogue to resolve which product a brand means, and writes nothing but
    submissions. `tests/test_manufacturer_api.py` pins that with a session whose
    writes raise.
    """
    schema = read_only_client.get("/openapi.json").json()
    offenders = [
        f"{method.upper()} {path}"
        for path, operations in schema["paths"].items()
        for method in operations
        if method.lower() not in ("get", "head", "parameters")
        and not path.startswith(("/submissions", "/manufacturer"))
    ]
    assert offenders == []


def concrete_routes(routes):
    """Every real route reachable from an app's route table, wrappers unwrapped.

    Written because the obvious `for route in app.routes` **silently stops
    working**. Current FastAPI wraps each `include_router` call in a
    `fastapi.routing._IncludedRouter`, which carries neither `path` nor
    `methods` and does *not* enumerate its children alongside itself. A loop
    that skipped attribute-less entries — as this file's guard used to — then
    inspected only the four FastAPI-generated docs routes and asserted nothing
    whatsoever about the application: it passed just as happily with all thirty
    catalogue write routes mounted.

    So: recurse through anything exposing `original_router`, and fall back to
    the flat shape for FastAPI versions that never wrapped. Both shapes are
    handled because which one you get is a dependency-version detail, and this
    guard failing open is worse than it failing loudly.
    """
    for route in routes:
        included = getattr(route, "original_router", None)
        if included is not None:
            yield from concrete_routes(included.routes)
        elif getattr(route, "path", ""):
            yield route


def test_the_route_table_walk_actually_reaches_the_routes():
    """The guard on the guard. See `concrete_routes` for why this exists.

    Without it, the two tests below can go quietly vacuous on a FastAPI upgrade
    and keep reporting green — which is the failure mode they are supposed to
    prevent, reproduced inside the thing preventing it.
    """
    from fastapi import FastAPI

    from slack_data.api.routing import register_routers

    app = FastAPI()
    register_routers(app, read_only=False)
    paths = {route.path for route in concrete_routes(app.routes)}
    # A catalogue GET, a catalogue write, and both writable routers: if the walk
    # can see all four it is looking at real routes, not wrappers.
    for expected in (
        "/webbing/{webbing_id}",
        "/brand/",
        "/submissions/",
        "/manufacturer/gear",
    ):
        assert expected in paths, f"the route walk cannot see {expected}"

    writes = [
        route.path
        for route in concrete_routes(app.routes)
        if not set(route.methods) <= {"GET", "HEAD"}
    ]
    # Local dev mounts the catalogue's writes; if the walk sees none of them it
    # is not looking at anything.
    assert len(writes) > 20, writes


def test_read_only_leaves_no_catalogue_write_route_registered(read_only_client):
    """Belt and braces: check the router table, not just what it documents."""
    checked = 0
    for route in concrete_routes(read_only_client.app.routes):
        if route.path.startswith(("/submissions", "/manufacturer")):
            # The writable routers, mounted in full in every mode because they
            # write to a different store. Named rather than pattern-matched, so
            # a third one is a deliberate edit here — same rule as the schema
            # test above.
            continue
        checked += 1
        assert set(route.methods) <= {"GET", "HEAD"}, route.path
    assert checked > 20, f"only {checked} routes inspected — the walk is not working"


def test_submissions_are_writable_while_the_catalogue_is_not(read_only_client):
    """The point of the split: the suggestion box works on the live site.

    A submission is stored in DynamoDB, not in the immutable SQLite catalogue,
    so read-only mode must not touch it. This is the single most likely thing to
    be broken by a careless reuse of the catalogue's SessionDep.
    """
    posted = read_only_client.post(
        "/submissions/",
        json={"gear_type": "webbings", "gear_id": 1, "changes": {"breaking_strength": "44"}},
    )
    assert posted.status_code == 201, posted.text


def test_submissions_router_takes_no_catalogue_session():
    """Guards it at the source, not just by observed behaviour.

    A `SessionDep` on any submissions route would open the catalogue engine —
    which in hosted mode is a read-only file — and the failure would appear only
    on the live site, never in a local test run.
    """
    from slack_data.api.routers import submissions_router as module
    from slack_data.database import get_session

    for route in module.submissions_router.routes:
        dependants = [route.dependant, *route.dependant.dependencies]
        assert all(d.call is not get_session for d in dependants), route.path


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
