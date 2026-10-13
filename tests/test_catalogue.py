"""
The catalogue store — live editing, phase 2 (LIVE_EDITING_PLAN.md § 5).

What has to hold for the switch-over to be safe:

- **The store holds the seeds exactly.** Every real seed file survives
  `explode` -> `assemble` -> `render` byte for byte, so the export can stand in
  for the files and nothing is lost on the way in.
- **A catalogue built from the store equals one built from the files** — every
  row of every table. That is the shadow check, and the reason the switch-over
  changes nothing a visitor can see.
- **The version drives freshness (D30):** no rebuild while it stands still, one
  rebuild when it moves, and a failed rebuild keeps serving the last good one.
- **Nothing is deleted:** an entry that leaves the seeds is retired.
"""

import contextlib
import io
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from slack_data.api.routing import register_routers
from slack_data.catalogue import live as live_module
from slack_data.catalogue.build import (
    build_engine,
    compare,
    sources_from_documents,
    sources_from_files,
)
from slack_data.catalogue.documents import (
    COLLECTIONS,
    ENVELOPE_KEY,
    Document,
    DuplicateKey,
    assemble,
    explode,
    render,
)
from slack_data.catalogue.importer import documents_from_files, plan, shadow_differences
from slack_data.catalogue.live import LiveCatalogue
from slack_data.catalogue.repository import (
    InMemoryCatalogueRepository,
    SqliteCatalogueRepository,
)
from slack_data.catalogue.store import set_catalogue_repository
from slack_data.load_data._seed_io import seed_path


def quietly(function, *args):
    """The loaders print a line per row."""
    with contextlib.redirect_stdout(io.StringIO()):
        return function(*args)


@pytest.fixture(scope="module")
def file_documents() -> list[Document]:
    return documents_from_files()


@pytest.fixture(scope="module")
def from_files():
    return quietly(build_engine, sources_from_files())


def filled(documents) -> InMemoryCatalogueRepository:
    repository = InMemoryCatalogueRepository()
    repository.put_many(documents)
    repository.bump_version()
    return repository


# --- The store holds the seeds exactly --------------------------------------


@pytest.mark.parametrize("collection", list(COLLECTIONS))
def test_every_seed_round_trips_byte_for_byte(collection):
    spec = COLLECTIONS[collection]
    text = seed_path(spec.filename).read_text(encoding="utf-8")
    documents = explode(collection, json.loads(text))
    assert render(collection, assemble(collection, documents)) == text


def test_documents_survive_the_sqlite_store(tmp_path, file_documents):
    """The JSON column round-trips unicode, floats and nesting exactly."""
    repository = SqliteCatalogueRepository(str(tmp_path / "store.db"))
    repository.put_many(file_documents)
    back = {(d.collection, d.key): d for d in repository.load()}
    for document in file_documents:
        assert back[(document.collection, document.key)].data == document.data


def test_order_survives_storage_that_does_not_keep_it(file_documents):
    """DynamoDB returns a collection in key order, not file order: `seq` puts
    it back."""
    shuffled = sorted(file_documents, key=lambda d: (d.collection, d.key), reverse=True)
    sources = sources_from_documents(shuffled)
    assert sources == sources_from_files()


def test_the_envelope_is_one_document_per_collection(file_documents):
    envelopes = [d for d in file_documents if d.key == ENVELOPE_KEY]
    assert {d.collection for d in envelopes} == {"manufacturers", "isa_gear_warnings", "isa_certified"}
    manufacturers = next(d for d in envelopes if d.collection == "manufacturers")
    assert "metadata" in manufacturers.data


def test_two_entries_with_one_key_are_refused():
    with pytest.raises(DuplicateKey):
        explode("grips", [{"id": 1, "name": "a"}, {"id": 1, "name": "b"}])


# --- Built from the store == built from the files ---------------------------


def test_the_catalogue_built_from_the_store_equals_the_seeds(file_documents, from_files):
    """The shadow check. Every row of every table — gear, brands with their
    enrichment, co-listings, ISA warnings and certifications."""
    from_store = quietly(build_engine, sources_from_documents(filled(file_documents).load()))
    assert compare(from_files, from_store) == []


def test_an_edited_document_is_exactly_one_difference(file_documents, from_files):
    edited = [d.model_copy(deep=True) for d in file_documents]
    webbing = next(d for d in edited if d.collection == "webbings")
    webbing.data["weight"] = 999
    [difference] = compare(from_files, quietly(build_engine, sources_from_documents(edited)))
    assert difference.startswith(f"webbing ({webbing.data['id']},) weight:")
    assert difference.endswith("!= 999.0")


def test_derived_fields_are_derived_not_stored(file_documents):
    """§ 5.2: the ISA flags are computed at build time, so no stored document
    carries them — a new warning cannot leave a stale flag on a product."""
    for document in file_documents:
        if document.collection in {"isa_gear_warnings", "isa_certified", "manufacturers"}:
            continue
        assert "isa_certified" not in document.data
        assert "isa_warning" not in document.data


# --- The importer ------------------------------------------------------------


def test_an_empty_store_imports_everything(file_documents):
    assert len(plan(InMemoryCatalogueRepository(), file_documents)) == len(file_documents)


def test_a_store_that_matches_needs_nothing(file_documents):
    assert plan(filled(file_documents), file_documents) == []


def test_a_change_writes_that_document_only(file_documents):
    repository = filled(file_documents)
    wanted = [d.model_copy(deep=True) for d in file_documents]
    grip = next(d for d in wanted if d.collection == "grips")
    grip.data["name"] = "Renamed"
    [change] = plan(repository, wanted)
    assert (change.collection, change.key) == ("grips", grip.key)


def test_a_removed_entry_is_retired_not_deleted(file_documents):
    repository = filled(file_documents)
    gone = next(d for d in file_documents if d.collection == "rollers")
    wanted = [d for d in file_documents if d is not gone]

    [change] = plan(repository, wanted)
    assert change.retired and change.key == gone.key
    repository.put_many([change])

    assert gone.key not in {d.key for d in repository.load() if d.collection == "rollers"}
    assert gone.key in {d.key for d in repository.load(include_retired=True) if d.collection == "rollers"}
    ids = [item["id"] for item in sources_from_documents(repository.load())["rollers.json"]]
    assert gone.data["id"] not in ids

    # Coming back un-retires it.
    [revived] = plan(repository, file_documents)
    assert revived.key == gone.key and not revived.retired


def test_the_shadow_check_reports_a_drifted_store(file_documents):
    repository = filled(file_documents)
    assert quietly(shadow_differences, repository) == []
    drifted = next(d for d in file_documents if d.collection == "grips").model_copy(deep=True)
    drifted.data["name"] = "Drifted"
    repository.put_many([drifted])
    assert any("Drifted" in line for line in quietly(shadow_differences, repository))


def test_the_importer_cli_applies_then_checks_clean(tmp_path, monkeypatch, capsys):
    from slack_data.catalogue import importer, store

    monkeypatch.setenv("CATALOG_STORE_PATH", str(tmp_path / "store.db"))
    monkeypatch.delenv("CATALOG_TABLE", raising=False)
    monkeypatch.setattr(store, "_REPOSITORY", None)

    assert importer.main(["--check"]) == 1, "an empty store differs from the seeds"
    assert importer.main([]) == 0
    assert SqliteCatalogueRepository(str(tmp_path / "store.db")).version() == 0, "a dry run writes nothing"
    assert importer.main(["--apply"]) == 0
    assert SqliteCatalogueRepository(str(tmp_path / "store.db")).version() == 1
    assert quietly(importer.main, ["--check"]) == 0
    assert importer.main(["--apply"]) == 0
    assert SqliteCatalogueRepository(str(tmp_path / "store.db")).version() == 1, "nothing changed, no bump"


# --- Freshness: the version (D30) -------------------------------------------


class _Builds:
    """Stands in for the 2-second build, so the version logic tests are fast."""

    def __init__(self):
        self.count = 0

    def __call__(self, sources):
        self.count += 1
        return f"engine-{self.count}"


@pytest.fixture
def fast_builds(monkeypatch):
    builds = _Builds()
    monkeypatch.setattr(live_module, "build_engine", builds)
    monkeypatch.setattr(live_module, "sources_from_documents", lambda documents: {})
    return builds


def test_no_rebuild_while_the_version_stands_still(fast_builds):
    repository = filled([])
    catalogue = LiveCatalogue(repository)
    first = catalogue.engine()
    for _ in range(5):
        assert catalogue.engine() == first
    assert fast_builds.count == 1
    assert repository.loads == 1, "a request that changes nothing reads only the version"


def test_a_bump_rebuilds_on_the_next_request(fast_builds):
    repository = filled([])
    catalogue = LiveCatalogue(repository)
    catalogue.engine()
    repository.bump_version()
    assert catalogue.engine() == "engine-2"
    assert catalogue.version == 2


def test_a_failed_rebuild_keeps_serving_the_last_good_catalogue(fast_builds, monkeypatch):
    repository = filled([])
    catalogue = LiveCatalogue(repository)
    good = catalogue.engine()
    repository.bump_version()

    def broken(_sources):
        raise ValueError("a bad document")

    monkeypatch.setattr(live_module, "build_engine", broken)
    assert catalogue.engine() == good
    assert catalogue.version == 1


def test_a_store_that_cannot_be_read_on_a_cold_start_is_an_error(fast_builds):
    class Down(InMemoryCatalogueRepository):
        def version(self):
            raise ConnectionError("dynamodb unreachable")

    with pytest.raises(ConnectionError):
        LiveCatalogue(Down()).engine()


def test_a_version_outage_after_start_keeps_serving(fast_builds):
    class Flaky(InMemoryCatalogueRepository):
        down = False

        def version(self):
            if self.down:
                raise ConnectionError("dynamodb unreachable")
            return super().version()

    repository = Flaky()
    repository.bump_version()
    catalogue = LiveCatalogue(repository)
    good = catalogue.engine()
    repository.down = True
    assert catalogue.engine() == good


def test_the_live_catalogue_really_rebuilds_from_the_store(file_documents):
    """The real build, once: an edit in the store reaches the catalogue."""
    from sqlmodel import Session, select

    from slack_data.models.grips import Grip

    repository = filled(file_documents)
    catalogue = LiveCatalogue(repository)
    quietly(catalogue.engine)

    grip = next(d for d in file_documents if d.collection == "grips").model_copy(deep=True)
    grip.data["name"] = "Edited in the store"
    repository.put_many([grip])
    repository.bump_version()

    with Session(quietly(catalogue.engine)) as session:
        assert session.exec(select(Grip).where(Grip.id == grip.data["id"])).one().name == "Edited in the store"


# --- The export route --------------------------------------------------------


@pytest.fixture
def app_client():
    app = FastAPI()
    register_routers(app, read_only=True)
    with TestClient(app) as client:
        yield client
    set_catalogue_repository(None)


@pytest.mark.parametrize("collection", ["webbings", "manufacturers", "isa_certified"])
def test_the_export_route_serves_the_seed_byte_for_byte(app_client, monkeypatch, collection):
    monkeypatch.delenv("CATALOG_TABLE", raising=False)
    monkeypatch.delenv("CATALOG_STORE_PATH", raising=False)
    response = app_client.get(f"/catalogue/{collection}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.text == seed_path(f"{collection}.json").read_text(encoding="utf-8")


def test_the_export_route_reads_the_store_when_there_is_one(app_client, monkeypatch, file_documents):
    monkeypatch.setenv("CATALOG_STORE_PATH", "configured")
    repository = filled(file_documents)
    edited = next(d for d in file_documents if d.collection == "grips").model_copy(deep=True)
    edited.data["name"] = "From the store"
    repository.put_many([edited])
    set_catalogue_repository(repository)

    index = app_client.get("/catalogue").json()
    assert index["source"] == "store (shadow)"
    assert "From the store" in app_client.get("/catalogue/grips").text


def test_an_unknown_collection_is_404(app_client):
    assert app_client.get("/catalogue/people").status_code == 404
    assert app_client.get("/catalogue/brand-clients").status_code == 404


def test_hosted_with_no_store_the_export_says_so(app_client, monkeypatch):
    monkeypatch.delenv("CATALOG_TABLE", raising=False)
    monkeypatch.delenv("CATALOG_STORE_PATH", raising=False)
    monkeypatch.setenv("SLACKDATA_DEPLOYMENT", "hosted")
    assert app_client.get("/catalogue/webbings").status_code == 503
