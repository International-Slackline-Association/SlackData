"""
The one-off media migration (slack_data/media/migrate.py, D47): the repo's
dev snapshot — the seeds' media keys and the files under media/ — into a
hosted media store and the catalogue store. What must hold:

- **Only media is touched**, and what the store already holds stays: a photo
  uploaded on the site before the migration is kept, first; a logo set on the
  site is not replaced.
- **Every file the entries name is copied**, and a second run does nothing.
- **The import is logged**, as the admin who ran it, on channel `import`.
- **The snapshot and the seeds agree**: every key the seeds name is a file.
"""

from slack_data.catalogue.documents import Document
from slack_data.catalogue.importer import documents_from_files
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.media import migrate as mig
from slack_data.media.manifest import build_manifest
from slack_data.media.store import SNAPSHOT_DIR, FilesystemMediaStore
from slack_data.models.people import Person, Role

PHOTO = {"id": "aaaa", "small": "grips/7/aaaa-480.webp", "large": "grips/7/aaaa-1600.webp"}
MANUAL = {"id": "bbbb", "file": "grips/7/bbbb-user-manual.pdf", "title": "User manual"}
LOGO = "brands/23/logo-cccc.png"

WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32
PDF = b"%PDF-1.7\n" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def stored():
    return [
        Document(collection="grips", key="7", seq=0, data={"id": 7, "name": "Aero", "brand": "Gibbon"}),
        Document(collection="grips", key="8", seq=1, data={"id": 8, "name": "Old", "brand": "Gibbon", "merged_into": 7}),
        Document(collection="manufacturers", key="1", seq=0, data={"catalog_id": 23, "name": "Gibbon"}),
    ]


def seeds():
    docs = stored()
    docs[0].data.update(photos=[PHOTO], manuals=[MANUAL])
    docs[1].data.update(photos=[{**PHOTO, "id": "dddd"}])
    docs[2].data.update(logo=LOGO)
    return docs


def snapshot(tmp_path):
    root = tmp_path / "snapshot"
    for key, data in [(PHOTO["small"], WEBP), (PHOTO["large"], WEBP), (MANUAL["file"], PDF), (LOGO, PNG)]:
        (root / key).parent.mkdir(parents=True, exist_ok=True)
        (root / key).write_bytes(data)
    return root


def admin():
    return Person(sub="s-1", isa_id="ISA_1", roles=[Role.ADMIN])


def test_the_seeds_media_is_added_to_the_stored_entries():
    plan = mig.plan_migration(seeds(), stored())
    assert plan.entries[("grips", "7")] == {"photos": [PHOTO], "manuals": [MANUAL]}
    assert plan.entries[("manufacturers", "1")] == {"logo": LOGO}
    assert ("grips", "8") not in plan.entries, "a merged item is skipped"
    assert len(plan.warnings) == 1
    assert plan.keys == sorted([PHOTO["small"], PHOTO["large"], MANUAL["file"], LOGO])


def test_what_the_store_holds_stays_and_comes_first():
    on_site = {"id": "eeee", "small": "grips/7/eeee-480.webp", "large": "grips/7/eeee-1600.webp"}
    docs = stored()
    docs[0].data["photos"] = [on_site]
    docs[2].data["logo"] = "brands/23/logo-ffff.png"
    plan = mig.plan_migration(seeds(), docs)
    assert plan.entries[("grips", "7")]["photos"] == [on_site, PHOTO]
    assert ("manufacturers", "1") not in plan.entries, "a logo set on the site stands"


def test_the_store_run_copies_files_and_logs_an_import(tmp_path):
    store, log = InMemoryCatalogueRepository(), InMemoryChangeLogRepository()
    store.put_many(stored())
    media = FilesystemMediaStore(tmp_path / "media", snapshot=None)

    plan = mig.plan_migration(seeds(), store.load())
    assert mig.write_files(media, plan.keys, snapshot(tmp_path)) == 4
    assert mig.apply_to_store(store, log, admin(), store.load(), plan) == 2

    assert store.get("grips", "7").data["photos"] == [PHOTO]
    assert (tmp_path / "media" / MANUAL["file"]).read_bytes() == PDF
    records = log.recent()
    assert {(r.channel.value, r.actor_isa_id) for r in records} == {("import", "ISA_1")}
    assert {r.action.value for r in records} == {"item.edit", "brand.edit"}

    again = mig.plan_migration(seeds(), store.load())
    assert again.entries == {} and mig.not_held(media, again.keys) == [], "a second run does nothing"


def test_the_repo_snapshot_mirrors_the_seeds():
    """Every media key the root seeds name is a file in media/, and the seeds
    name every file there — the dev snapshot (P4-F) and its data agree."""
    manifest = build_manifest(documents_from_files())
    keys = [p[size] for by_id in manifest["photos"].values() for ps in by_id.values() for p in ps for size in ("small", "large")]
    keys += [m["file"] for by_id in manifest["manuals"].values() for ms in by_id.values() for m in ms]
    keys += [m["file"] for by_name in manifest["brandManuals"].values() for ms in by_name.values() for m in ms]
    keys += list(manifest["logos"].values())
    assert len(keys) > 2000
    missing = [k for k in keys if not (SNAPSHOT_DIR / k).is_file()]
    assert missing == [], missing[:5]
    on_disk = {p.relative_to(SNAPSHOT_DIR).as_posix() for p in SNAPSHOT_DIR.rglob("*") if p.is_file()}
    assert on_disk - set(keys) == set(), "a file in media/ that nothing names is a file nobody can reach"
