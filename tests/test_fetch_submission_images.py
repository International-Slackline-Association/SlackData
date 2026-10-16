"""`scripts/fetch_submission_images.py` — filing a manufacturer's photo links.

A brand sends `image_urls`; the operator runs this script to turn them into files
under `frontend/public/gear-images/<type>/<id>_<slug>/`. See
MANUFACTURER_API_PLAN.md § Step 4 — photos as links.

**Where a photo lands is the whole risk.** An image the manifest cannot tie to
a product never renders and never errors, so most of these tests are about the
folder and the number a download lands under — by id, so a rename in the same
record cannot misfile it. The rest are about never destroying what is already
there.

No test here touches the network. Every download goes through a `fetcher`
argument, and every tree is a `tmp_path`.
"""

import hashlib
import io
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

import build_gear_manifest
import fetch_submission_images as fsi

JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-body"
PNG = b"\x89PNG\r\n\x1a\n" + b"png-body"
GIF = b"GIF89a" + b"gif-body"
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"webp-body"
HTML = b"<!doctype html><html><body>Aero 1 - Balance Community</body></html>"

# The seed, as far as these tests need it: webbing 42 is "Aero 1".
NAMES = {42: "Aero 1"}
FOLDER = "42_aero-1"


def served(mapping):
    """A fetcher answering from a dict; anything else is a failure."""
    def fetcher(url):
        if url not in mapping:
            raise fsi.FetchError(f"404 for {url}")
        value = mapping[url]
        if isinstance(value, Exception):
            raise value
        return value
    return fetcher


def run(tmp_path, urls, fetcher, *, item_id=42, name=None, names=None, dry_run=False):
    return fsi.file_images(
        "webbings", item_id, urls, name=name,
        pub=tmp_path, names=NAMES if names is None else names,
        dry_run=dry_run, fetcher=fetcher,
    )


def files(tmp_path, folder=FOLDER):
    path = tmp_path / "webbings" / folder
    return sorted(p.name for p in path.iterdir()) if path.exists() else []


def hold(tmp_path, name, data=b"held", folder=FOLDER):
    path = tmp_path / "webbings" / folder
    path.mkdir(parents=True, exist_ok=True)
    (path / name).write_bytes(data)


A = "https://bc.example/a.jpg"


# --- Where a photo lands ----------------------------------------------------


def test_a_first_photo_makes_the_items_folder_and_is_number_1(tmp_path):
    report = run(tmp_path, [A], served({A: JPEG}))
    assert report.written == [f"{FOLDER}/1.jpg"]
    assert files(tmp_path) == ["1.jpg"]


def test_the_folder_is_named_from_the_seed_like_the_manifest_builder_names_it(tmp_path):
    run(tmp_path, [A], served({A: JPEG}), names={42: "Élan Vital"})
    assert (tmp_path / "webbings" / build_gear_manifest.folder_name(42, "Élan Vital")).is_dir()
    assert (tmp_path / "webbings" / "42_elan-vital").is_dir()


def test_later_photos_append_after_the_highest_number_held(tmp_path):
    hold(tmp_path, "1.jpg")
    hold(tmp_path, "3.png")
    urls = [A, "https://bc.example/b.png"]
    report = run(tmp_path, urls, served({urls[0]: JPEG + b"1", urls[1]: PNG}))
    assert report.written == [f"{FOLDER}/4.jpg", f"{FOLDER}/5.png"]


def test_an_existing_folder_is_used_whatever_its_slug_says(tmp_path):
    """The slug is a label from when the folder was made. After a rename it is
    stale, and the photos still belong in it — a second folder for one id
    would split them (and the manifest builder refuses two)."""
    hold(tmp_path, "1.jpg", folder="42_old-name")
    report = run(tmp_path, [A], served({A: JPEG}), name="New Name")
    assert report.written == ["42_old-name/2.jpg"]
    assert sorted(p.name for p in (tmp_path / "webbings").iterdir()) == ["42_old-name"]


def test_another_items_folder_is_never_touched(tmp_path):
    """`4_…` and `42_…` share a prefix of digits, not an id."""
    hold(tmp_path, "1.jpg", folder="4_other")
    hold(tmp_path, "1.jpg", folder="420_other")
    run(tmp_path, [A], served({A: JPEG}))
    assert files(tmp_path, "4_other") == ["1.jpg"]
    assert files(tmp_path, "420_other") == ["1.jpg"]
    assert files(tmp_path) == ["1.jpg"]


def test_the_file_lands_where_the_manifest_resolves_it(tmp_path, monkeypatch):
    """The round trip that matters: what this writes, the manifest builder
    lists under the id it was filed for, in order."""
    hold(tmp_path, "1.jpg")
    run(tmp_path, ["https://bc.example/a.png"], served({"https://bc.example/a.png": PNG}))
    monkeypatch.setattr(build_gear_manifest, "PUB", tmp_path)
    monkeypatch.setattr(build_gear_manifest, "seed_items", lambda t: {42: {"id": 42, "name": "Aero 1"}})
    images, warnings = build_gear_manifest.build()
    assert images == {"webbings": {"42": [f"{FOLDER}/1.jpg", f"{FOLDER}/2.png"]}}
    assert warnings == []


def test_a_new_item_needs_a_name_for_its_folder(tmp_path):
    """An id the seeds do not hold yet (a product created after them) has no
    name to slug — refuse rather than invent one."""
    with pytest.raises(SystemExit):
        run(tmp_path, [A], served({A: JPEG}), item_id=900)
    report = run(tmp_path, [A], served({A: JPEG}), item_id=900, name="Brand New")
    assert report.written == ["900_brand-new/1.jpg"]


# --- What counts as a photo -------------------------------------------------


@pytest.mark.parametrize(
    "data, ext", [(JPEG, ".jpg"), (PNG, ".png"), (GIF, ".gif"), (WEBP, ".webp")]
)
def test_each_format_is_recognised_by_its_bytes(data, ext):
    assert fsi.sniff(data) == ext


@pytest.mark.parametrize("data", [HTML, b"", b"RIFF\x24\x00\x00\x00WAVEfmt ", b"%PDF-1.7"])
def test_anything_else_is_not_a_photo(data):
    assert fsi.sniff(data) is None


def test_the_extension_comes_from_the_bytes_not_the_url(tmp_path):
    url = "https://bc.example/aero.jpg"
    report = run(tmp_path, [url], served({url: PNG}))
    assert report.written == [f"{FOLDER}/1.png"]


def test_a_product_page_sent_instead_of_an_image_is_refused(tmp_path):
    """The likeliest mistake: the link to the page the photo is on."""
    url = "https://bc.example/products/aero-1"
    report = run(tmp_path, [url], served({url: HTML}))
    assert report.written == []
    assert [failed_url for failed_url, _ in report.failed] == [url]
    assert files(tmp_path) == []


def test_an_oversized_download_is_refused():
    with pytest.raises(fsi.FetchError):
        fsi.read_capped(io.BytesIO(b"x" * 11), limit=10)
    assert fsi.read_capped(io.BytesIO(b"x" * 10), limit=10) == b"x" * 10


def test_the_cap_is_fifteen_megabytes():
    """The number MANUFACTURER_API.md publishes."""
    assert fsi.MAX_BYTES == 15 * 1024 * 1024


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://bc.example/a.jpg", "a.jpg"])
def test_a_non_http_link_is_refused_without_fetching(tmp_path, url):
    def never(_):
        raise AssertionError("fetched a non-http link")

    report = run(tmp_path, [url], never)
    assert [failed_url for failed_url, _ in report.failed] == [url]


# --- Never destroy what is held ---------------------------------------------


def test_nothing_is_ever_overwritten(tmp_path):
    hold(tmp_path, "1.jpg", b"the curated original")
    run(tmp_path, [A], served({A: JPEG}))
    assert (tmp_path / "webbings" / FOLDER / "1.jpg").read_bytes() == b"the curated original"


def test_a_photo_already_held_byte_for_byte_is_skipped(tmp_path):
    """So running the command twice on one record is safe."""
    hold(tmp_path, "1.jpg", JPEG)
    report = run(tmp_path, [A], served({A: JPEG}))
    assert report.written == []
    assert [url for url, _ in report.skipped] == [A]
    assert files(tmp_path) == ["1.jpg"]


def test_the_same_photo_under_two_links_is_written_once(tmp_path):
    urls = [A, "https://cdn.bc.example/a.jpg"]
    report = run(tmp_path, urls, served({urls[0]: JPEG, urls[1]: JPEG}))
    assert report.written == [f"{FOLDER}/1.jpg"]
    assert [url for url, _ in report.skipped] == [urls[1]]


def test_a_dry_run_writes_nothing(tmp_path):
    report = run(tmp_path, [A], served({A: JPEG}), dry_run=True)
    assert report.written == [f"{FOLDER}/1.jpg"], "a dry run still reports the name it would use"
    assert not (tmp_path / "webbings").exists()


def test_one_dead_link_does_not_stop_the_others(tmp_path):
    urls = ["https://bc.example/gone.jpg", A]
    report = run(tmp_path, urls, served({urls[1]: JPEG}))
    assert report.written == [f"{FOLDER}/1.jpg"]
    assert [url for url, _ in report.failed] == [urls[0]]


# --- Warnings ---------------------------------------------------------------


def test_an_id_that_is_no_product_is_warned_about(tmp_path):
    """A new product whose JSON patch is not applied yet: the photos are filed,
    and will not render until the seed holds the id."""
    report = run(tmp_path, [A], served({A: JPEG}), item_id=900, name="Aero 2")
    assert report.written == ["900_aero-2/1.jpg"]
    assert any("id 900" in warning for warning in report.warnings)


def test_a_known_id_is_not_warned_about(tmp_path):
    report = run(tmp_path, [A], served({A: JPEG}))
    assert report.warnings == []


# --- The command ------------------------------------------------------------


@pytest.fixture
def cli(tmp_path, monkeypatch):
    """`main()` pointed at a scratch tree, with the manifest rebuild recorded
    instead of rewriting the repo's gearImages.json."""
    rebuilt = []
    monkeypatch.setattr(fsi, "PUB", tmp_path)
    monkeypatch.setattr(fsi, "seed_names", lambda gear_type: NAMES)
    monkeypatch.setattr(fsi, "rebuild_manifest", lambda: rebuilt.append(True))
    return rebuilt


ARGS = ["--gear-type", "webbings", "--id", "42"]


def test_the_command_files_the_photos_and_rebuilds_the_manifest(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({A: JPEG}))
    assert fsi.main([*ARGS, A]) == 0
    assert files(tmp_path) == ["1.jpg"]
    assert cli == [True]


def test_the_command_exits_1_when_any_link_failed(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({A: JPEG}))
    assert fsi.main([*ARGS, A, "https://bc.example/gone.jpg"]) == 1
    assert files(tmp_path) == ["1.jpg"], "the link that worked is still filed"
    assert cli == [True]


def test_a_dry_run_command_does_not_rebuild_the_manifest(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({A: JPEG}))
    assert fsi.main([*ARGS, "--dry-run", A]) == 0
    assert cli == []


def test_an_unknown_gear_type_is_refused(cli):
    with pytest.raises(SystemExit):
        fsi.main(["--gear-type", "hats", "--id", "1", "https://x.example/a.jpg"])


def test_the_id_is_required(cli):
    with pytest.raises(SystemExit):
        fsi.main(["--gear-type", "webbings", "--name", "Aero 1", A])


def test_the_hash_helper_is_sha256():
    assert fsi.digest(b"abc") == hashlib.sha256(b"abc").hexdigest()
