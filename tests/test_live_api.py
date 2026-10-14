"""
The API over real HTTP — a genuine uvicorn process, hit with a real client.

Every other test in this repo goes through FastAPI's `TestClient`, which calls
the ASGI app in-process. That exercises the routing, the dependencies, the
handlers and the validation, and it is the right tool for almost everything —
but there is a class of failure it cannot see, because there is no server, no
socket and no process boundary:

- **Import-time and startup failures.** `TestClient` builds the app the test
  file imported; it never runs `slack_data/main.py`'s lifespan the way a real
  boot does. A module that only imports because a *test* imported something
  first passes there and 502s on a cold Lambda. That is not hypothetical: the
  manufacturer registration CLI shipped with exactly that bug (`Brand`'s
  relationships name eight gear models that nothing had imported), and it was a
  live run that caught it, not the 519 in-process tests.
- **Anything the ASGI transport papers over** — header handling, the
  307 on a missing trailing slash, Content-Length enforcement on a real body,
  query-string parsing by the server rather than by the test client.
- **The store selection in `store.py`.** In-process tests override the
  repository dependency, so the env-var branch that production actually takes is
  never executed. Here it is: the server picks its own stores from the
  environment, exactly as the Lambda does.

Several servers are started, because the configurations that exist in
production are genuinely different programs:

| fixture | configuration | what it stands for |
|---|---|---|
| `live` | writable SQLite, no ISA pool configured | local dev, and the shape the write paths are developed against |
| `hosted` | `CATALOG_DB_PATH` set → `READ_ONLY` | the Lambda: catalogue writes unmounted, admin/manufacturer auth locked out |
| `hosted_unbaked` | `SLACKDATA_DEPLOYMENT=hosted`, no `CATALOG_DB_PATH`, no pool | live editing's shape: dev tokens still locked out |

The catalogue is a **hand-built minimum**, not the real seed. One row in each
gear table is enough to make `seed_catalog` skip every loader, which turns a
~20 second seed of 500 items into a few milliseconds — and none of what is
asserted here is about the catalogue's contents.
"""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine

from slack_data.api import auth
from slack_data.models.brand_clients import BrandClient, now_iso
from slack_data.models.brands import Brand
from slack_data.models.connectors import Connector, ConnectorMaterial, ConnectorStyle
from slack_data.models.grips import Grip
from slack_data.models.isa_gear_warnings import ISAGearWarning
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import (
    BearingMaterial,
    LockType,
    Roller,
    RollerMaterial,
    SliderType,
)
from slack_data.models.starterkits import StarterKit
from slack_data.models.starterkits import TensioningType as StarterKitTensioning
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TensioningType as TricklineTensioning
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import FiberMaterial, Webbing
from slack_data.models.weblocks import Weblock
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial

REPO_ROOT = Path(__file__).resolve().parent.parent

CLIENT_ID = "live-test-client"
ADMIN = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}
BRAND_TOKEN = f"{auth.MANUFACTURER_DEV_TOKEN}:{CLIENT_ID}"
BRAND = {"Authorization": f"Bearer {BRAND_TOKEN}"}
# A real API key (D63–D65): the same client, holding a secret.
SECRET = "live-test-secret-0123456789abcdefghijklmnopq"
KEY = {"Authorization": f"Bearer {CLIENT_ID}:{SECRET}"}

# Generous: a cold uvicorn import of FastAPI + SQLModel + every model is a
# couple of seconds on a laptop and slower under load. Failing here means the
# server never came up, and the log is printed with the failure.
STARTUP_TIMEOUT_SECONDS = 45


def _free_port() -> int:
    """Ask the OS for a port rather than picking one.

    A hard-coded port makes the suite fail for whoever happens to have a dev
    server running, which is everyone working on this repo.
    """
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _build_catalogue(path: Path) -> dict:
    """A minimum catalogue: two brands and one row per gear type.

    One row per table is not laziness — it is what makes `seed_catalog` a no-op,
    since every loader is gated on "is this table empty?". The brand gets a
    `country` and there is one `ISAGearWarning` row for the same reason: those
    two passes are gated on their own conditions rather than on an empty table.
    """
    engine = create_engine(f"sqlite:///{path}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # `country` set so the manufacturers.json enrichment pass is skipped.
        alpha = Brand(name="Alpha Slacklines", country="Germany")
        beta = Brand(name="Beta Rigging", country="France")
        session.add(alpha)
        session.add(beta)
        session.commit()
        session.refresh(alpha)
        session.refresh(beta)

        rows = {
            "alpha_webbing": Webbing(
                name="Mantra MK2", width=25, material=[FiberMaterial.POLYESTER],
                brand_id=alpha.id,
            ),
            "beta_webbing": Webbing(
                name="Beta Line", width=25, material=[FiberMaterial.POLYESTER],
                brand_id=beta.id,
            ),
            "alpha_weblock": Weblock(
                name="Alpha Lock", material=MetalMaterial.ALUMINUM, width_min=25,
                brand_id=alpha.id,
            ),
            # One row each, purely to switch the remaining loaders off. Their
            # NOT NULL columns are filled with the first enum member — nothing
            # here reads them, they only have to satisfy the schema.
            "roller": Roller(
                name="R", roller_material=RollerMaterial.ALUMINUM,
                slider_type=SliderType.MovingPlates, lock_type=LockType.Nonlocking,
                bearing_material=BearingMaterial.StainlessSteel, brand_id=alpha.id,
            ),
            "leashring": LeashRing(
                name="L", material=MetalMaterial.ALUMINUM, brand_id=alpha.id
            ),
            "grip": Grip(
                name="G", material=MetalMaterial.ALUMINUM, width_min=25, brand_id=alpha.id
            ),
            "treepro": TreePro(name="T", brand_id=alpha.id),
            "starterkit": StarterKit(
                name="S", webbing_length=25, webbing_width=25,
                tensioning_type=StarterKitTensioning.SINGLE_RATCHET, brand_id=alpha.id,
            ),
            "tricklinekit": TricklineKit(
                name="K", webbing_length=25, webbing_width=25,
                tensioning_type=TricklineTensioning.SINGLE_RATCHET, brand_id=alpha.id,
            ),
            "connector": Connector(
                name="C", connector_style=ConnectorStyle.SHACKLE,
                material=ConnectorMaterial.STEEL, brand_id=alpha.id,
            ),
        }
        for row in rows.values():
            session.add(row)
        # Gates the ISA pass, which is keyed on this table rather than on the
        # stamps — see load_isa_warnings.has_isa_warnings.
        session.add(
            ISAGearWarning(
                source_id="live-test", status=ISAWarning.WARNING,
                gear_type="webbings", gear_id=1,
            )
        )
        session.commit()

        ids = {name: row.id for name, row in rows.items()}
        ids["alpha_brand"] = alpha.id
        ids["beta_brand"] = beta.id
        return ids


def _register_client(brand_clients_db: Path, brand_id: int, brand_name: str) -> None:
    """Register the test brand's credentials directly through the repository.

    Deliberately not through the CLI: this fixture is about the *server*, and a
    CLI failure here would look like a server failure. `register.py` is a thin
    wrapper over this same `put`.
    """
    from slack_data.manufacturers.clients import SqliteBrandClientRepository

    SqliteBrandClientRepository(str(brand_clients_db)).put(
        BrandClient(
            client_id=CLIENT_ID,
            brand_id=brand_id,
            brand_name=brand_name,
            secret=SECRET,
            created_at=now_iso(),
        )
    )


def _start_server(work_dir: Path, extra_env: dict) -> tuple[subprocess.Popen, str, Path]:
    """Boot uvicorn against `work_dir` and wait until it answers."""
    port = _free_port()
    log_path = work_dir / "server.log"

    env = {
        **os.environ,
        # PYTHONPATH rather than an install: the suite must work from a checkout
        # exactly as `fastapi dev` does.
        "PYTHONPATH": str(REPO_ROOT),
        "SUBMISSIONS_DB_PATH": str(work_dir / "submissions.db"),
        "BRAND_CLIENTS_DB_PATH": str(work_dir / "brand_clients.db"),
        "PEOPLE_DB_PATH": str(work_dir / "people.db"),
        "CHANGELOG_DB_PATH": str(work_dir / "changelog.db"),
        # No pool: the dev-token branch. A hosted deploy sets these, and
        # `hosted` below asserts what happens when it does not.
        "ISA_USER_POOL_ID": "",
        # Whatever shell the suite runs in, each server's hosted-ness is only
        # what its fixture says (slack_data/deployment.py reads both).
        "AWS_LAMBDA_FUNCTION_NAME": "",
        "SLACKDATA_DEPLOYMENT": "",
        # Off, so nothing here calls Cloudflare. (Mail needs no such switch —
        # the app sends none; see test_submissions.test_the_app_sends_no_email.)
        "TURNSTILE_SECRET": "",
        "SQL_ECHO": "false",
        **extra_env,
    }
    # An empty string is not "unset" to os.getenv, and auth.py reads truthiness —
    # but store.py reads presence. Drop the blanks so both agree.
    env = {key: value for key, value in env.items() if value != ""}

    with open(log_path, "w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "slack_data.main:app",
             "--host", "127.0.0.1", "--port", str(port)],
            cwd=work_dir,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )

    base_url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            pytest.fail(f"the server exited during startup:\n{log_path.read_text()}")
        try:
            if httpx.get(f"{base_url}/", timeout=1.0).status_code == 200:
                return process, base_url, log_path
        except httpx.HTTPError:
            time.sleep(0.2)

    process.kill()
    pytest.fail(f"the server did not start in {STARTUP_TIMEOUT_SECONDS}s:\n{log_path.read_text()}")


def _stop(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


@pytest.fixture(scope="module")
def live(tmp_path_factory):
    """A real local-dev server: writable catalogue, dev tokens, its own stores.

    Module-scoped — one boot for the whole file. The tests below are additive
    (they only write submissions) so they do not need isolation from each other,
    and paying two seconds per test for a fresh process would buy nothing.
    """
    work_dir = tmp_path_factory.mktemp("live-api")
    ids = _build_catalogue(work_dir / "database.db")
    _register_client(work_dir / "brand_clients.db", ids["alpha_brand"], "Alpha Slacklines")

    process, base_url, log_path = _start_server(work_dir, {})
    try:
        with httpx.Client(base_url=base_url, timeout=10.0) as client:
            yield client, ids, log_path
    finally:
        _stop(process)


@pytest.fixture(scope="module")
def hosted(tmp_path_factory):
    """A real server in the **hosted** shape: `CATALOG_DB_PATH`, so `READ_ONLY`.

    This is the configuration slackdata.org actually runs, and the one the
    in-process `read_only_client` fixture can only approximate — that fixture
    flips a flag, this one opens the file `mode=ro&immutable=1` in a separate
    process, which is what the Lambda does.
    """
    work_dir = tmp_path_factory.mktemp("hosted-api")
    catalogue = work_dir / "catalog.db"
    ids = _build_catalogue(catalogue)
    _register_client(work_dir / "brand_clients.db", ids["alpha_brand"], "Alpha Slacklines")

    process, base_url, log_path = _start_server(
        work_dir, {"CATALOG_DB_PATH": str(catalogue)}
    )
    try:
        with httpx.Client(base_url=base_url, timeout=10.0) as client:
            yield client, ids, log_path
    finally:
        _stop(process)


@pytest.fixture(scope="module")
def hosted_unbaked(tmp_path_factory):
    """Hosted with **no baked catalogue and no pool** — the shape live editing
    reaches: phase 1 deletes the pool, phase 2 stops baking `CATALOG_DB_PATH`.

    Only `SLACKDATA_DEPLOYMENT=hosted` says it is the live site. The catalogue
    is an ordinary writable file here, which is the point: `READ_ONLY` is
    false, and the dev tokens must still be refused.
    """
    work_dir = tmp_path_factory.mktemp("hosted-unbaked-api")
    ids = _build_catalogue(work_dir / "database.db")
    _register_client(work_dir / "brand_clients.db", ids["alpha_brand"], "Alpha Slacklines")

    process, base_url, log_path = _start_server(work_dir, {"SLACKDATA_DEPLOYMENT": "hosted"})
    try:
        with httpx.Client(base_url=base_url, timeout=10.0) as client:
            yield client, ids, log_path
    finally:
        _stop(process)


@pytest.fixture(scope="module")
def store_mode(tmp_path_factory):
    """Live editing phase 2's shape: `CATALOG_SOURCE=store`, the catalogue read
    from a store filled with the **real** seeds, built into memory at start.

    Local (not hosted), so the dev token still works — store mode alone must
    not count as hosted (deployment.is_hosted reads READ_ONLY, which stays
    "a baked file").
    """
    from slack_data.catalogue.importer import documents_from_files
    from slack_data.catalogue.repository import SqliteCatalogueRepository

    work_dir = tmp_path_factory.mktemp("store-api")
    store = SqliteCatalogueRepository(str(work_dir / "catalog_store.db"))
    store.put_many(documents_from_files())
    store.bump_version()

    process, base_url, log_path = _start_server(
        work_dir,
        {"CATALOG_SOURCE": "store", "CATALOG_STORE_PATH": str(work_dir / "catalog_store.db")},
    )
    try:
        with httpx.Client(base_url=base_url, timeout=30.0) as client:
            yield client, store, log_path
    finally:
        _stop(process)


@pytest.fixture(scope="module")
def hosted_with_pool(tmp_path_factory):
    """The hosted shape **with the ISA pool configured** — production's real shape.

    `hosted` above proves the lockout when the pool is missing. That is the safe
    failure, but it means the branch production actually takes — pool set, token
    verified against its JWKS — never ran in a real process. This fixture closes
    that: the pool id is a fake one, so the JWKS fetch cannot succeed, and what
    is asserted is that every failure resolves to **401, never 500**.

    That distinction is the whole point. A 500 here would mean an unhandled
    exception in the verifier, which on the live site is an error page instead of
    a login prompt — and the JWKS endpoint being unreachable is a thing that
    genuinely happens.
    """
    work_dir = tmp_path_factory.mktemp("hosted-pool-api")
    catalogue = work_dir / "catalog.db"
    ids = _build_catalogue(catalogue)
    _register_client(work_dir / "brand_clients.db", ids["alpha_brand"], "Alpha Slacklines")

    process, base_url, log_path = _start_server(
        work_dir,
        {
            "CATALOG_DB_PATH": str(catalogue),
            "ISA_USER_POOL_ID": "eu-central-1_NoSuchPool",
            "ISA_CLIENT_ID": "no-such-client",
            "ISA_REGION": "eu-central-1",
        },
    )
    try:
        with httpx.Client(base_url=base_url, timeout=30.0) as client:
            yield client, ids, log_path
    finally:
        _stop(process)


# --- The server boots at all ------------------------------------------------


def test_the_server_starts_and_serves_the_catalogue(live):
    """The check that the 519 in-process tests structurally cannot make.

    A real process, a real import of `slack_data.main`, a real lifespan. An
    import-order bug that a test file happened to paper over shows up here.
    """
    client, _, _ = live
    assert client.get("/").json() == {"message": "Welcome to SlackData"}

    webbings = client.get("/webbing/?limit=10").json()
    assert len(webbings) == 2
    assert {row["brand_name"] for row in webbings} == {"Alpha Slacklines", "Beta Rigging"}


def test_nothing_was_logged_as_an_error_during_startup(live):
    """A traceback on a background path still leaves a serving process."""
    _, _, log_path = live
    log = log_path.read_text()
    assert "Traceback" not in log, log
    assert "Application startup complete" in log


def test_the_seed_was_skipped(live):
    """Proves the fixture's premise — if a loader ran, this file got slow and the
    catalogue is not the one the assertions above describe."""
    _, _, log_path = live
    assert "Loading webbing data" not in log_path.read_text()


def test_the_minimal_catalogue_has_a_row_in_every_gear_table(tmp_path):
    """The same premise, checked in-process so it fails with a name, not a crash.

    A new gear type with no row in `_build_catalogue` makes the real server seed
    that type's whole seed file into the test catalogue on boot, where its
    brands collide with Alpha's and Beta's ids and startup dies — every test
    in this file then errors without saying why. A gear table is any table
    with a `brand_id`, which is what every gear loader is gated on being empty.
    """
    from sqlalchemy import func, select

    import slack_data.seed  # noqa: F401 — registers every gear model's table

    _build_catalogue(tmp_path / "catalog.db")
    engine = create_engine(f"sqlite:///{tmp_path / 'catalog.db'}")
    gear_tables = [t for t in SQLModel.metadata.sorted_tables if "brand_id" in t.c]
    assert len(gear_tables) >= 9
    with engine.connect() as conn:
        empty = [t.name for t in gear_tables if conn.execute(select(func.count()).select_from(t)).scalar() == 0]
    assert empty == [], f"_build_catalogue needs a row in: {empty}"


# --- The manufacturer API, over the wire ------------------------------------


def test_the_manufacturer_identity_resolves_over_http(live):
    client, ids, _ = live
    body = client.get("/manufacturer/me", headers=BRAND).json()
    assert body["brand_id"] == ids["alpha_brand"]
    assert body["brand_name"] == "Alpha Slacklines"


def test_the_store_is_chosen_from_the_environment(live):
    """The branch every in-process test overrides away.

    `store.py` picks SQLite or DynamoDB from env vars, and the suite always
    replaces the repository with an in-memory one — so that selection has never
    executed under test until here. If it were broken, every local `fastapi dev`
    would fail and the whole suite would still be green.
    """
    client, _, _ = live
    assert client.get("/manufacturer/me", headers=BRAND).status_code == 200
    assert client.get("/submissions", headers=ADMIN).status_code == 200


def test_discovery_over_http_returns_only_the_callers_gear(live):
    client, _, _ = live
    rows = client.get("/manufacturer/gear", headers=BRAND).json()
    names = {row["name"] for row in rows}
    assert "Mantra MK2" in names
    assert "Beta Line" not in names


def test_a_full_batch_round_trip(live):
    """The whole flow end to end: post as a brand, read back as the admin."""
    client, ids, _ = live
    response = client.post(
        "/manufacturer/gear",
        headers=BRAND,
        json={
            "note": "Live round trip.",
            "items": [
                {"gear_type": "webbings", "gear_id": ids["alpha_webbing"],
                 "name": "Mantra MK2", "manufacturer_sku": "ALP-MK2",
                 "changes": {"breaking_strength": 31.2, "active": True}},
                {"gear_type": "weblocks", "name": "Alpha Lock",
                 "changes": {"weight": 180}},
            ],
        },
    )
    assert response.status_code == 201, response.text

    receipt = response.json()
    assert receipt["accepted"] == 2
    assert receipt["results"][0]["gear_id"] == ids["alpha_webbing"]
    assert receipt["results"][0]["resolution"] == "id"
    # Sent as JSON scalars, stored as the prose the admin hand-applies.
    batch_id = receipt["batch_id"]

    queued = client.get("/submissions?status=approved", headers=ADMIN).json()
    mine = [row for row in queued if row["batch_id"] == batch_id]
    assert len(mine) == 2
    assert mine[0]["changes"] == {"breaking_strength": "31.2", "active": "true"}
    assert mine[0]["manufacturer_sku"] == "ALP-MK2"
    assert mine[0]["submitted_by"] == f"brand-client:{CLIENT_ID}"
    assert all("Live round trip." in row["note"] for row in mine)
    # Approved work never expires — it is a job outstanding, not an archive.
    assert all(row["expires_at"] is None for row in mine)


def test_a_cross_brand_write_is_refused_over_http(live):
    """The security case, on the transport production uses."""
    client, ids, _ = live
    response = client.post(
        "/manufacturer/gear",
        headers=BRAND,
        json={"items": [{"gear_type": "webbings", "gear_id": ids["beta_webbing"],
                         "changes": {"weight": 70}}]},
    )
    assert response.status_code == 403


def test_people_and_the_change_log_over_http(live):
    """Phase 1's stores, chosen from the environment in a real process: the
    dev admin signs in, acknowledges the notice, and the public log is served."""
    client, _, _ = live
    me = client.get("/me", headers=ADMIN)
    assert me.status_code == 200, me.text
    assert me.json()["roles"] == ["admin"]
    assert client.post("/me/notice", headers=ADMIN).json()["notice_seen_at"]
    assert client.get("/admin/admins", headers=ADMIN).status_code == 200
    assert client.get("/changes").status_code == 200


def test_an_anonymous_manufacturer_call_is_refused_over_http(live):
    client, _, _ = live
    response = client.post(
        "/manufacturer/gear",
        json={"items": [{"gear_type": "webbings", "name": "X", "changes": {"weight": "70"}}]},
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_an_oversized_body_is_refused_by_the_real_server(live):
    """Content-Length enforcement with a body a real server actually read.

    In-process the header is whatever the test client computed; here it is a
    genuine one over a socket, which is the only way to know the check fires
    before the body is parsed rather than after.
    """
    from slack_data.api.routers.manufacturer_router import MAX_BODY_BYTES

    client, _, _ = live
    padding = "x" * (MAX_BODY_BYTES + 1024)
    response = client.post(
        "/manufacturer/gear",
        headers=BRAND,
        json={"items": [{"gear_type": "webbings", "name": "X",
                         "changes": {"weight": "70"}, "note": padding}]},
    )
    assert response.status_code == 413


def test_the_old_trailing_slash_path_still_reaches_the_handler(live):
    """`/submissions/` was the canonical path until 2026-08-27, and anything
    written against it must keep working.

    It moved because API Gateway refuses a route key with an empty path segment,
    so `POST /submissions/` could not be named in `RouteSettings` and could not
    be throttled — see infra/serverless.yml. Nothing is mounted at the slashed
    spelling now, so Starlette redirects it here.

    The redirect is a **307**, which is what makes this safe for a POST: it
    preserves the method and the body, where a 301/302 would turn it into a GET
    and silently drop the submission. Hosted, the redirected request lands on
    `$default` and pays the global rate rather than the 2/sec one, which is why
    our own client calls the un-slashed path.
    """
    client, _, _ = live

    response = client.post("/submissions/", json={})
    assert response.status_code == 307
    assert response.headers["location"].endswith("/submissions")

    assert client.get("/submissions/", headers=ADMIN).status_code == 307


def test_the_public_submission_box_still_works_over_http(live):
    """Phase 2's one open write endpoint, unaffected by Phase 4."""
    client, ids, _ = live
    response = client.post(
        "/submissions",
        json={"gear_type": "webbings", "gear_id": ids["alpha_webbing"],
              "changes": {"weight": "71"}, "note": "Live check."},
    )
    assert response.status_code == 201
    assert response.json()["status"] == "pending"


# --- The hosted shape -------------------------------------------------------


def test_the_hosted_server_serves_the_catalogue_read_only(hosted):
    """It boots against an immutable file and still answers reads."""
    client, _, _ = hosted
    assert client.get("/webbing/?limit=10").status_code == 200


def test_the_hosted_server_publishes_no_catalogue_writes(hosted):
    """The routes are absent, not merely inert. See api/routing.py."""
    client, _, _ = hosted
    response = client.post("/webbing/", json={"name": "X", "width": 25, "brand_id": 1})
    assert response.status_code in (404, 405)


def test_the_hosted_server_hides_its_docs(hosted):
    client, _, _ = hosted
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404


def test_the_hosted_server_locks_out_the_dev_tokens(hosted):
    """**The rule that makes a dev token in a public repo safe**, proven in a
    real process running the real hosted configuration rather than by a
    monkeypatched flag.

    No ISA pool + hosted → 503 on every sign-in path, never a fall-through to
    the static token. The manufacturer dev token is read as an API key like any
    other, and no stored key matches it → 401.
    """
    client, _, _ = hosted
    assert client.get("/submissions", headers=ADMIN).status_code == 503
    assert client.get("/me", headers=ADMIN).status_code == 503
    assert client.get("/manufacturer/me", headers=BRAND).status_code == 401
    assert client.post(
        "/manufacturer/gear",
        headers=BRAND,
        json={"items": [{"gear_type": "webbings", "name": "X", "changes": {"weight": "70"}}]},
    ).status_code == 401


def test_a_real_api_key_works_hosted(hosted):
    """Keys need no pool, so a brand works hosted whatever the sign-in config."""
    client, _, _ = hosted
    response = client.get("/manufacturer/me", headers=KEY)
    assert response.status_code == 200, response.text
    assert response.json()["brand_name"] == "Alpha Slacklines"


def test_the_public_change_log_is_reachable_hosted(hosted):
    client, _, _ = hosted
    response = client.get("/changes")
    assert response.status_code == 200
    assert response.json() == []


def test_hosted_without_a_baked_catalogue_still_locks_out_the_dev_tokens(hosted_unbaked):
    """Live editing's phase-2 shape, in a real process: no `CATALOG_DB_PATH`,
    no pool, and still neither dev token is honoured."""
    client, _, _ = hosted_unbaked
    assert client.get("/submissions", headers=ADMIN).status_code == 503
    assert client.get("/manufacturer/me", headers=BRAND).status_code == 401


def test_the_hosted_public_submission_box_is_reachable(hosted):
    """It writes to a different store, so it must survive the read-only
    catalogue. Turnstile is unset here, and hosted that fails **closed** — a 503
    is the correct answer, and it proves the route is mounted and running its
    captcha check rather than 404ing."""
    client, _, _ = hosted
    response = client.post(
        "/submissions",
        json={"gear_type": "webbings", "gear_id": 1, "changes": {"weight": "71"}},
    )
    assert response.status_code == 503


# --- Hosted, with a pool configured: production's real shape ----------------


def test_a_configured_pool_disables_the_dev_tokens_hosted(hosted_with_pool):
    """Configuring the ISA pool closes the dev door rather than adding a second one —
    asserted in a real hosted process, not by monkeypatching a module global."""
    client, _, _ = hosted_with_pool
    assert client.get("/submissions", headers=ADMIN).status_code == 401
    assert client.get("/manufacturer/me", headers=BRAND).status_code == 401


def test_an_unverifiable_token_is_401_not_500(hosted_with_pool):
    """**The failure mode worth catching.**

    The pool does not exist, so the JWKS fetch cannot succeed — exactly what an
    outage at the ISA pool looks like. Every one of these must come back 401. A 500
    means an unhandled exception in the verifier, which is an error page where a
    login prompt belongs.
    """
    client, _, _ = hosted_with_pool
    for token in ("not.a.jwt", "junk", "a.b.c"):
        for path in ("/submissions", "/me", "/manufacturer/me"):
            response = client.get(path, headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 401, f"{path} with {token!r} -> {response.status_code}"


def test_the_public_write_path_is_unaffected_by_the_pool(hosted_with_pool):
    """Turnstile is unset and fails closed hosted, so 503 — the route is mounted
    and running its captcha check, not 404ing and not 500ing."""
    client, _, _ = hosted_with_pool
    response = client.post(
        "/submissions",
        json={"gear_type": "webbings", "gear_id": 1, "changes": {"weight": "71"}},
    )
    assert response.status_code == 503


def test_no_traceback_reached_the_log(hosted_with_pool):
    """A handled 401 must not also be logging a stack trace — that is how a real
    incident gets lost in noise."""
    _, _, log_path = hosted_with_pool
    assert "Traceback" not in log_path.read_text()


# --- Store mode: the catalogue read from the store (phase 2) -----------------


def _seed(name: str):
    return json.loads((REPO_ROOT / name).read_text(encoding="utf-8"))


def test_store_mode_serves_the_real_catalogue(store_mode):
    client, _, _ = store_mode
    webbing = _seed("webbings.json")[0]
    response = client.get(f"/webbing/{webbing['id']}")
    assert response.status_code == 200, response.text
    assert response.json()["name"] == webbing["name"]
    # Derived at build time, not stored: the brand's enrichment is there.
    brands = client.get("/brand/?limit=100").json()
    assert any(brand.get("country") for brand in brands)


def test_store_mode_mounts_no_catalogue_writes(store_mode):
    """An edit to the in-memory copy would be thrown away at the next rebuild,
    so the raw CRUD writes are not there to make one."""
    client, _, _ = store_mode
    assert client.post("/webbing/", json={"name": "x"}).status_code == 405
    assert client.patch("/webbing/1", json={"name": "x"}).status_code == 405
    assert client.delete("/webbing/1").status_code == 405


def test_store_mode_alone_is_not_hosted(store_mode):
    client, _, _ = store_mode
    assert client.get("/me", headers=ADMIN).status_code == 200


def test_the_export_script_reproduces_the_store(store_mode, tmp_path):
    """export/export_catalogue.py against a real server: every file it writes
    is the store's content in the seed's own format, and the change log is
    there."""
    import importlib.util

    from slack_data.catalogue.documents import COLLECTIONS, assemble, render

    client, store, _ = store_mode
    spec = importlib.util.spec_from_file_location("export_catalogue", REPO_ROOT / "export" / "export_catalogue.py")
    export = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(export)

    assert export.main(["--api", str(client.base_url), "--out", str(tmp_path)]) == 0
    documents = store.load()
    for name, collection in COLLECTIONS.items():
        assert (tmp_path / collection.filename).read_text(encoding="utf-8") == render(
            name, assemble(name, documents)
        ), name
    assert json.loads((tmp_path / "changes.json").read_text()) == []
    assert json.loads((tmp_path / "catalogue.json").read_text())["version"] == store.version()


def test_an_edit_in_the_store_is_served_on_the_next_request(store_mode):
    """D30, end to end: a document changes, the version moves, and the very
    next request sees it — no restart, no redeploy."""
    client, store, log_path = store_mode
    grip = next(d for d in store.load() if d.collection == "grips")
    edited = grip.model_copy(deep=True)
    edited.data["name"] = "Edited in the store"
    store.put_many([edited])

    assert client.get(f"/grip/{grip.data['id']}").json()["name"] == grip.data["name"], (
        "unchanged until the version moves"
    )
    version = store.bump_version()
    assert client.get(f"/grip/{grip.data['id']}").json()["name"] == "Edited in the store"
    assert client.get("/catalogue").json()["version"] == version
    assert "Traceback" not in log_path.read_text()


# --- Live editing (phase 3): an admin's edit, end to end ------------------------


def test_an_admin_edit_is_served_on_the_next_request(store_mode):
    """Through the real routes: read the rev, edit, and the very next page
    shows it; a second edit from the same stale rev is refused with the
    current entry; the public log has it."""
    client, _, log_path = store_mode
    current = client.get("/edit/webbings/2", headers=ADMIN).json()
    edited = client.patch(
        "/edit/webbings/2", headers=ADMIN,
        json={"rev": current["rev"], "changes": {"name": "Edited live"}, "why": "live test"},
    )
    assert edited.status_code == 200, edited.text
    assert client.get("/webbing/2").json()["name"] == "Edited live"

    stale = client.patch("/edit/webbings/2", headers=ADMIN, json={"rev": current["rev"], "changes": {"name": "Lost"}})
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["name"] == "Edited live"

    [record] = client.get("/changes", params={"target_type": "item", "target_id": "webbings#2"}).json()
    assert (record["why"], record["actor_role"]) == ("live test", "admin")

    hidden = client.post(
        "/edit/webbings/2/hide", headers=ADMIN, json={"rev": edited.json()["rev"], "why": "live test"}
    )
    assert hidden.status_code == 200, hidden.text
    assert client.get("/webbing/2").json()["detail"]["hidden"] is True
    assert "Traceback" not in log_path.read_text()
