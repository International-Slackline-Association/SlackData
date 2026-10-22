"""
The seed import (slack_data/catalogue/seed_import.py): what a pull request adds
to the seeds, carried into a store the site has already edited. What must hold:

- **What the store lacks is created**, under its own key, with its photos, the
  files copied into the media store; logged as `import` under the admin.
- **A field the site changed stays as the site has it**; a field it never
  changed takes the seeds' newer value.
- **A key the site gave to another entry is left alone**, and reported.
- **The site's next id passes the imported ones.**
- **ISA matches land after the gear they name**, and the build skips none.
- **A second run does nothing.**

Against the real seeds: the store starts as production stood before leashes —
no leashes, no SlackTech rings, the leash certificates unmatched.
"""

import contextlib
import io

import pytest
from sqlmodel import Session

from slack_data.catalogue import edits, seed_import
from slack_data.catalogue.build import build_engine, sources_from_documents
from slack_data.catalogue.importer import documents_from_files
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.media.store import FilesystemMediaStore
from slack_data.models.changes import Channel
from slack_data.models.leashes import Leash
from slack_data.models.people import Person, Role

LEASH_CERTIFICATES = {"approved_gear_4", "approved_gear_10", "approved_gear_11", "approved_gear_32"}
UNMATCHED = {"gearType": None, "gearIds": [], "gearNames": [], "confidence": "none", "note": ""}

_SEEDS = None


def seeds():
    global _SEEDS
    if _SEEDS is None:
        _SEEDS = documents_from_files()
    return [d.model_copy(deep=True) for d in _SEEDS]


def before_leashes():
    """The seeds as production held them before this pull request."""
    documents = []
    for d in seeds():
        if d.collection == "leashes" or (d.collection == "leashrings" and d.key in {"35", "36", "37"}):
            continue
        if d.collection == "connectors" and d.key.isdigit() and int(d.key) >= 127:
            continue
        if d.collection == "isa_gear_warnings" and d.key == "83":
            continue
        if d.collection == "isa_certified" and d.key in LEASH_CERTIFICATES:
            d.data["match"] = dict(UNMATCHED)
        if d.collection == "webbings" and d.key == "9":
            d.data.pop("gear_sellers", None)
        documents.append(d)
    return documents


def admin():
    return Person(sub="s-1", isa_id="ISA_1", roles=[Role.ADMIN])


@pytest.fixture
def world(tmp_path):
    store, log = InMemoryCatalogueRepository(), InMemoryChangeLogRepository()
    store.put_many(before_leashes())
    media = FilesystemMediaStore(tmp_path / "media", snapshot=None)
    return store, log, media


def run(store, log, media):
    result = seed_import.plan(seeds(), store.load(include_retired=True), log)
    seed_import.apply(store, log, media, admin(), result, "test import")
    return result


def built(store):
    with contextlib.redirect_stdout(io.StringIO()):
        return build_engine(sources_from_documents(store.load()))


def test_what_the_store_lacks_is_created_with_its_photos(world, tmp_path):
    store, log, media = world
    result = run(store, log, media)
    assert result.failed == []
    with Session(built(store)) as session:
        leash = session.get(Leash, 43)
        assert leash.ring_options == [{"leashring_id": 35, "count": 2}]
        assert session.get(Leash, 17).isa_warning is not None, "the notice landed after its leash"
        assert session.get(Leash, 1).isa_certified, "a leash certificate's match landed"
    photo = store.get("leashes", "43").data["photos"][0]
    assert (tmp_path / "media" / photo["large"]).is_file(), "the file went to the media store"
    records = log.recent(limit=500)
    assert {(r.channel, r.actor_isa_id) for r in records} == {(Channel.IMPORT, "ISA_1")}


def test_a_field_the_site_changed_stays_and_an_untouched_one_is_set(world):
    store, log, media = world
    # On the site: someone sets webbing 9's price and a note. The seeds add a co-listing to it.
    current = store.get("webbings", "9")
    edits.edit_item(store, log, admin(), "webbings", 9, current.rev, {"price": 1.23, "notes": "the site's note"})

    result = run(store, log, media)
    data = store.get("webbings", "9").data
    assert data["gear_sellers"] == ["SlackTech"], "the seeds' co-listing, a field the site never changed"
    assert data["price"] == 1.23 and data["notes"] == "the site's note", "the site's edits stay"
    [change] = [c for c in result.changes if c.collection == "webbings" and c.key == "9"]
    assert set(change.kept) == {"price", "notes"} and set(change.fields) == {"gear_sellers"}


def test_a_key_the_site_gave_to_another_entry_is_left_alone(world):
    store, log, media = world
    # Before the import, someone adds a leash ring on the site: it takes id 35.
    outcome = edits.create_item(store, log, admin(), "leashrings", {"name": "Site Ring", "brand": "Kong", "material": "Steel"})
    assert outcome.key == "35"
    result = run(store, log, media)
    assert store.get("leashrings", "35").data["name"] == "Site Ring"
    assert any("leashrings 35" in note and "renumber" in note for note in result.notes)
    # The kit that names ring 35 would be sold with the site's ring: it waits.
    assert store.get("leashes", "43") is None
    assert any(note.startswith("leashes 43 ") and "leashrings 35" in note for note in result.notes)
    assert store.get("leashes", "37") is not None, "the kit without rings names none, so it is in"
    assert result.failed == []


def test_the_sites_next_id_passes_the_imported_ones(world):
    store, log, media = world
    edits.create_item(store, log, admin(), "connectors", {"name": "Site Shackle", "brand": "Gibbon",
                                                         "connector_style": "Shackle", "material": "Steel"})
    site_id = max(int(d.key) for d in store.load() if d.collection == "connectors")
    assert site_id == 127, "the site took the id the seeds give their first new connector"
    result = run(store, log, media)
    assert any("connectors 127" in n and "renumber" in n for n in result.notes)
    assert store.get("connectors", "127").data["name"] == "Site Shackle"
    outcome = edits.create_item(store, log, admin(), "connectors", {"name": "Next", "brand": "Gibbon",
                                                                   "connector_style": "Shackle", "material": "Steel"})
    seeds_max = max(int(d.key) for d in seeds() if d.collection == "connectors")
    assert int(outcome.key) > seeds_max


def test_a_second_run_does_nothing(world):
    store, log, media = world
    run(store, log, media)
    again = seed_import.plan(seeds(), store.load(include_retired=True), log)
    assert again.pending == []


def test_the_import_reads_what_the_site_changed_from_the_log(world):
    store, log, media = world
    run(store, log, media)
    rev = store.get("leashes", "43").rev
    edits.edit_item(store, log, admin(), "leashes", 43, rev, {"price": 99.0})
    again = seed_import.plan(seeds(), store.load(include_retired=True), log)
    [change] = [c for c in again.changes if c.collection == "leashes" and c.key == "43"]
    assert change.kept == ["price"] and not change.fields
