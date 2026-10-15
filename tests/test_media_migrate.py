"""
The one-off media migration (slack_data/media/migrate.py, D47, P4-E).

Against small trees in a temp dir laid out like `frontend/public/`, and the
real collections' shapes. What must hold:

- **Every file lands where the manifest will look**: by item id and brand
  catalog_id, photos in number order, manuals in filename order.
- **Deterministic**: the same source gets the same key on every run and in
  both targets, so the repo's snapshot mirrors the bucket; a second run does
  nothing.
- **Photos are re-encoded**: WebP, never upscaled, no metadata (GPS).
- **The import is logged**, as the admin who ran it, on channel `import`.
"""

import io
import json

import pytest

from slack_data.catalogue.documents import Document
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.changelog.repository import InMemoryChangeLogRepository
from slack_data.media import kinds
from slack_data.media import migrate as mig
from slack_data.media.store import FilesystemMediaStore
from slack_data.models.people import Person, Role

PIL = pytest.importorskip("PIL.Image", reason="the migration needs Pillow: pip install '-e.[media]'")


def jpeg(width, height, gps=False) -> bytes:
    from PIL import Image

    image = Image.new("RGB", (width, height), (200, 30, 30))
    out = io.BytesIO()
    if gps:
        exif = Image.Exif()
        exif[0x8825] = {2: (51.0, 30.0, 0.0)}  # GPSInfo: a latitude
        image.save(out, "JPEG", exif=exif)
    else:
        image.save(out, "JPEG")
    return out.getvalue()


PDF = b"%PDF-1.7\n" + b"\x00" * 64
PNG_LOGO = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def public(tmp_path, monkeypatch):
    root = tmp_path / "public"
    monkeypatch.setattr(mig, "PUBLIC", root)
    monkeypatch.setattr(mig, "GEAR_IMAGES", root / "gear-images")
    monkeypatch.setattr(mig, "GEAR_MANUALS", root / "gear-manuals")
    monkeypatch.setattr(mig, "LOGOS", root / "manufacturer-images")
    monkeypatch.setattr(mig, "LOGO_MANIFEST", tmp_path / "manufacturerImages.json")
    return root


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def documents():
    return [
        Document(collection="grips", key="7", seq=0, data={"id": 7, "name": "Aero", "brand": "Gibbon"}),
        Document(collection="grips", key="8", seq=1, data={"id": 8, "name": "Old", "brand": "Gibbon", "merged_into": 7}),
        Document(collection="manufacturers", key="1", seq=0, data={"catalog_id": 23, "name": "Gibbon"}),
    ]


def test_photos_manuals_and_brand_media_land_by_id(public, tmp_path):
    put(public / "gear-images/grips/7_aero/2.jpg", jpeg(100, 50))
    put(public / "gear-images/grips/7_aero/1.jpg", jpeg(60, 60))
    put(public / "gear-images/grips/7_aero/10.jpg", jpeg(70, 70))
    put(public / "gear-manuals/grips/7_aero/user-manual.pdf", PDF)
    put(public / "gear-manuals/grips/brand/23_gibbon/grip-manual.pdf", PDF + b"x")
    put(public / "manufacturer-images/gibbon.png", PNG_LOGO)
    (tmp_path / "manufacturerImages.json").write_text(json.dumps({"Gibbon": "gibbon.png"}))

    plan = mig.plan_migration(documents())
    entry = plan.entries[("grips", "7")]
    sources = ["1.jpg", "2.jpg", "10.jpg"]  # by number, not by name
    assert [p["id"] for p in entry["photos"]] == [
        mig.media_id((public / f"gear-images/grips/7_aero/{n}").read_bytes()) for n in sources
    ]
    assert entry["photos"][0]["small"] == f"grips/7/{entry['photos'][0]['id']}-480.webp"
    [manual] = entry["manuals"]
    assert manual["title"] == "User manual" and manual["file"].endswith("-user-manual.pdf")

    brand = plan.entries[("manufacturers", "1")]
    assert brand["logo"].startswith("brands/23/logo-") and brand["logo"].endswith(".png")
    assert brand["manuals"]["grips"][0]["file"].startswith("brands/23/grips/")
    assert plan.warnings == []


def test_a_merged_or_unknown_item_is_skipped_with_a_warning(public):
    put(public / "gear-images/grips/8_old/1.jpg", jpeg(10, 10))
    put(public / "gear-images/grips/99_gone/1.jpg", jpeg(10, 10))
    plan = mig.plan_migration(documents())
    assert plan.entries == {}
    assert len(plan.warnings) == 2


def test_a_photo_held_twice_in_one_folder_is_listed_once(public):
    put(public / "gear-images/grips/7_aero/1.jpg", jpeg(10, 10))
    put(public / "gear-images/grips/7_aero/2.jpg", jpeg(10, 10))
    assert len(mig.plan_migration(documents()).entries[("grips", "7")]["photos"]) == 1


def test_photos_are_webp_never_upscaled_and_carry_no_gps():
    from PIL import Image

    big = mig.encode(jpeg(3000, 1500, gps=True), kinds.LARGE_PX)
    small = mig.encode(jpeg(300, 200), kinds.LARGE_PX)
    assert kinds.sniff(big) == kinds.WEBP
    with Image.open(io.BytesIO(big)) as image:
        assert image.size == (1600, 800)
        assert not image.getexif(), "no metadata travels"
    with Image.open(io.BytesIO(small)) as image:
        assert image.size == (300, 200), "never upscaled"


def admin():
    return Person(sub="s-1", isa_id="ISA_1", roles=[Role.ADMIN])


def test_the_store_run_writes_files_and_logs_an_import(public, tmp_path):
    put(public / "gear-images/grips/7_aero/1.jpg", jpeg(2000, 1000))
    put(public / "gear-manuals/grips/7_aero/user-manual.pdf", PDF)
    store, log = InMemoryCatalogueRepository(), InMemoryChangeLogRepository()
    store.put_many(documents())
    media = FilesystemMediaStore(tmp_path / "media", snapshot=None)

    plan = mig.plan_migration(store.load())
    assert mig.write_files(media, plan.files) == 3
    assert mig.apply_to_store(store, log, admin(), store.load(), plan) == 1

    stored = store.get("grips", "7").data
    assert stored["photos"] == plan.entries[("grips", "7")]["photos"]
    for photo in stored["photos"]:
        assert media.exists(photo["small"]) and media.exists(photo["large"])
    [record] = log.recent()
    assert (record.channel.value, record.action.value, record.actor_isa_id) == ("import", "item.edit", "ISA_1")
    assert set(record.changes) == {"photos", "manuals"}

    again = mig.plan_migration(store.load())
    assert again.entries == {} and mig.not_held(media, again.files) == [], "a second run does nothing"


def test_media_already_on_an_entry_is_kept_first(public):
    put(public / "gear-images/grips/7_aero/1.jpg", jpeg(10, 10))
    docs = documents()
    uploaded = {"id": "a" * 16, "small": "grips/7/x-480.webp", "large": "grips/7/x-1600.webp"}
    docs[0].data["photos"] = [uploaded]
    photos = mig.plan_migration(docs).entries[("grips", "7")]["photos"]
    assert photos[0] == uploaded and len(photos) == 2


def test_the_repo_snapshot_mirrors_the_seeds():
    """Every media key the root seeds name is a file in media/ — the dev
    snapshot (P4-F) and its data were made together, and stay so."""
    from slack_data.catalogue.importer import documents_from_files
    from slack_data.media.manifest import build_manifest
    from slack_data.media.store import SNAPSHOT_DIR

    manifest = build_manifest(documents_from_files())
    keys = [p[size] for by_id in manifest["photos"].values() for ps in by_id.values() for p in ps for size in ("small", "large")]
    keys += [m["file"] for by_id in manifest["manuals"].values() for ms in by_id.values() for m in ms]
    keys += [m["file"] for by_name in manifest["brandManuals"].values() for ms in by_name.values() for m in ms]
    keys += list(manifest["logos"].values())
    assert len(keys) > 2000
    missing = [k for k in keys if not (SNAPSHOT_DIR / k).is_file()]
    assert missing == [], missing[:5]
