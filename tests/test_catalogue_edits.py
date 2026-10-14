"""
Writing to the catalogue store — live editing, phase 3 (LIVE_EDITING_PHASE_3.md § 5.1–5.2).

What must hold, on every store:

- **A stale edit writes nothing (D27).** Each put names the rev it read; if
  any one of them moved on, none of them lands.
- **Ids are never reused (D26).** A create takes the collection's counter,
  which starts above every id the collection ever held, retired ones included,
  and two creates cannot take the same one.
- **An edit and its record go together (D28).** Locally: an ordinary
  conflict leaves no record; a success writes the records and bumps the
  version exactly once.

`tests/test_dynamo_stores.py` runs the hosted transaction against DynamoDB.
"""

import pytest

from slack_data.catalogue.documents import Document
from slack_data.catalogue.importer import plan
from slack_data.catalogue.repository import (
    Conflict,
    CounterAdvance,
    InMemoryCatalogueRepository,
    Put,
    SqliteCatalogueRepository,
)
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.changelog.writer import commit_catalogue_change, next_id
from slack_data.models.changes import Action, ChangeRecord, Channel, TargetType


@pytest.fixture(params=["memory", "sqlite"])
def store(request, tmp_path):
    if request.param == "memory":
        return InMemoryCatalogueRepository()
    return SqliteCatalogueRepository(str(tmp_path / "catalogue.db"))


def grip(key: str, name: str = "Grip", rev: int = 1, **data) -> Document:
    return Document(collection="grips", key=key, data={"id": int(key), "name": name, **data}, rev=rev)


def record(target_id: str = "grips#1") -> ChangeRecord:
    return ChangeRecord(
        target_type=TargetType.PERSON,  # the item target types arrive with the log's growth
        target_id=target_id,
        action=Action.ROLE_GRANT,
        actor_sub="sub",
        actor_isa_id="ISA_TEST",
        actor_role="admin",
        channel=Channel.WEB,
    )


# --- apply -----------------------------------------------------------------


def test_an_edit_at_the_current_rev_lands(store):
    store.put_many([grip("1")])
    store.apply([Put(grip("1", "Renamed", rev=2), expected_rev=1)], [])
    stored = store.get("grips", "1")
    assert (stored.data["name"], stored.rev) == ("Renamed", 2)


def test_a_stale_edit_is_refused(store):
    store.put_many([grip("1", rev=3)])
    with pytest.raises(Conflict):
        store.apply([Put(grip("1", "Renamed", rev=3), expected_rev=2)], [])
    assert store.get("grips", "1").data["name"] == "Grip"


def test_one_stale_put_stops_every_put(store):
    store.put_many([grip("1"), grip("2")])
    with pytest.raises(Conflict):
        store.apply(
            [Put(grip("1", "A", rev=2), expected_rev=1), Put(grip("2", "B", rev=2), expected_rev=5)],
            [],
        )
    assert store.get("grips", "1").data["name"] == "Grip"


def test_a_create_over_an_existing_document_is_refused(store):
    store.put_many([grip("1")])
    with pytest.raises(Conflict):
        store.apply([Put(grip("1", "Other"), expected_rev=None)], [])


def test_get_of_a_missing_document_is_none(store):
    assert store.get("grips", "404") is None


# --- ids -------------------------------------------------------------------


def test_the_first_id_is_above_every_id_ever_held(store):
    store.put_many([grip("1"), grip("7").model_copy(update={"retired": True})])
    new_id, advance = next_id(store, "grips")
    assert new_id == 8, "a retired id is never handed out again"
    assert advance == CounterAdvance("grips", None, 9)


def test_ids_follow_the_counter_once_it_exists(store):
    store.put_many([grip("1")])
    first, advance = next_id(store, "grips")
    store.apply([Put(grip(str(first)), expected_rev=None)], [advance])
    second, _ = next_id(store, "grips")
    assert (first, second) == (2, 3)


def test_two_creates_cannot_take_one_id(store):
    store.put_many([grip("1")])
    new_id, advance = next_id(store, "grips")
    store.apply([Put(grip(str(new_id)), expected_rev=None)], [advance])
    with pytest.raises(Conflict):  # a second create that read the same counter
        store.apply([Put(grip("99"), expected_rev=None)], [advance])
    assert store.get("grips", "99") is None


def test_counters_are_per_collection(store):
    store.put_many([grip("5"), Document(collection="webbings", key="40", data={"id": 40})])
    assert next_id(store, "grips")[0] == 6
    assert next_id(store, "webbings")[0] == 41


# --- the writer, locally ---------------------------------------------------


def test_a_committed_edit_writes_its_records_and_bumps_the_version_once(store):
    log = InMemoryChangeLogRepository()
    store.put_many([grip("1")])
    before = store.version()
    commit_catalogue_change(store, log, [Put(grip("1", "New", rev=2), expected_rev=1)], [], [record()])
    assert store.get("grips", "1").data["name"] == "New"
    assert len(log.recent()) == 1
    assert store.version() == before + 1


def test_a_conflict_leaves_no_record_and_no_version_bump(store):
    log = InMemoryChangeLogRepository()
    store.put_many([grip("1", rev=2)])
    before = store.version()
    with pytest.raises(Conflict):
        commit_catalogue_change(store, log, [Put(grip("1", "New", rev=2), expected_rev=1)], [], [record()])
    assert log.recent() == []
    assert store.version() == before


# --- the importer keeps the rev moving ----------------------------------------


def test_an_import_rewrite_moves_the_rev_on(store):
    store.put_many([grip("1", rev=4)])
    changes = plan(store, [grip("1", "Imported")])
    assert [d.rev for d in changes] == [5], "an edit opened before the import is then refused"


def test_an_import_retire_moves_the_rev_on(store):
    store.put_many([grip("1", rev=2)])
    changes = plan(store, [])
    assert [(d.retired, d.rev) for d in changes] == [(True, 3)]


def test_sqlite_reads_a_store_from_before_revs(tmp_path):
    import sqlite3

    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        "CREATE TABLE documents (collection TEXT NOT NULL, key TEXT NOT NULL, seq INTEGER NOT NULL,"
        " data TEXT NOT NULL, retired INTEGER NOT NULL, PRIMARY KEY (collection, key));"
        "INSERT INTO documents VALUES ('grips', '1', 0, '{\"id\": 1}', 0);"
    )
    conn.commit()
    conn.close()
    assert SqliteCatalogueRepository(str(path)).get("grips", "1").rev == 1


# --- hidden and merged entries are kept, not built -----------------------------


def test_hidden_and_merged_entries_are_not_loaded(session):
    from sqlmodel import select

    from slack_data.load_data._seed_io import read_seed_json, seed_sources
    from slack_data.load_data.load_gear import load_gear
    from slack_data.models.grips import Grip

    base = {"brand": "Gibbon", "material": "Aluminum", "width_min": 25}
    entries = [
        {"id": 1, "name": "Shown", **base},
        {"id": 2, "name": "Hidden", **base, "hidden": True},
        {"id": 3, "name": "Merged", **base, "merged_into": 1},
    ]
    with seed_sources({"manufacturers.json": read_seed_json("manufacturers.json"), "grips.json": entries}):
        assert load_gear(session, "grips") == 1
    assert [g.name for g in session.exec(select(Grip))] == ["Shown"]
