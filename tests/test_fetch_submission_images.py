"""`scripts/fetch_submission_images.py` — filing a manufacturer's photo links.

A brand sends `image_urls`; the operator runs this script to turn them into files
under `frontend/public/gear-images/<type>/`. See MANUFACTURER_API_PLAN.md § Step 4
— photos as links.

**Naming is the whole risk.** An image the manifest cannot key to a product
never renders and never errors, so most of these tests are about the name a
download lands under: the key, the index, and the product whose *name* merely
looks like an index. The rest are about never destroying what is already there.

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

ABBREV = {"Balance Community": "bc"}


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


def run(tmp_path, urls, fetcher, *, name="Aero 1", valid=None, dry_run=False):
    return fsi.file_images(
        "webbings", "Balance Community", name, urls,
        pub=tmp_path, abbrev=ABBREV,
        valid={"bc_aero-1"} if valid is None else valid,
        dry_run=dry_run, fetcher=fetcher,
    )


def files(tmp_path):
    folder = tmp_path / "webbings"
    return sorted(p.name for p in folder.iterdir()) if folder.exists() else []


def hold(tmp_path, name, data=b"held"):
    folder = tmp_path / "webbings"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)


# --- The key ----------------------------------------------------------------


def test_the_key_is_built_the_way_the_frontend_builds_it():
    """`<brand-abbrev>_<name-slug>` — utils/images.ts `imageKey()`."""
    assert fsi.image_key("Balance Community", "Aero 1", ABBREV) == "bc_aero-1"
    assert fsi.image_key("Balance Community", "Spider Silk MK1", ABBREV) == "bc_spider-silk-mk1"


def test_a_brand_with_no_abbreviation_falls_back_to_its_slug():
    assert fsi.image_key("Wall Ace", "Duct Tape", ABBREV) == "wall-ace_duct-tape"


def test_accents_fold_like_the_frontend_slug():
    assert fsi.image_key("Balance Community", "Élan Vital", ABBREV) == "bc_elan-vital"


def test_the_slug_is_the_manifest_builders_not_a_third_copy():
    """Two copies (Python + TypeScript) already have to agree. A third is how
    one of them drifts."""
    assert fsi.slugify is build_gear_manifest.slugify


# --- Where a photo lands ----------------------------------------------------


def test_a_first_photo_takes_the_bare_key(tmp_path):
    report = run(tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}))
    assert report.written == ["bc_aero-1.jpg"]
    assert files(tmp_path) == ["bc_aero-1.jpg"]


def test_later_photos_append_after_the_highest_index_held(tmp_path):
    hold(tmp_path, "bc_aero-1.jpg")
    hold(tmp_path, "bc_aero-1-3.png")
    urls = ["https://bc.example/a.jpg", "https://bc.example/b.png"]
    report = run(tmp_path, urls, served({urls[0]: JPEG + b"1", urls[1]: PNG}))
    assert report.written == ["bc_aero-1-4.jpg", "bc_aero-1-5.png"]


def test_another_products_file_is_not_counted_as_an_index(tmp_path):
    """"Blue 20" is a product of its own, so `bc_blue-20.jpg` is not image 20 of
    "Blue". Counting it would file Blue's next photo as image 21."""
    hold(tmp_path, "bc_blue.jpg")
    hold(tmp_path, "bc_blue-20.jpg")
    report = run(
        tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}),
        name="Blue", valid={"bc_blue", "bc_blue-20"},
    )
    assert report.written == ["bc_blue-2.jpg"]


def test_an_index_that_would_be_another_products_key_is_skipped(tmp_path):
    """Writing `bc_blue-2.jpg` when "Blue 2" is a product would hand the photo
    to the wrong product."""
    hold(tmp_path, "bc_blue.jpg")
    report = run(
        tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}),
        name="Blue", valid={"bc_blue", "bc_blue-2"},
    )
    assert report.written == ["bc_blue-3.jpg"]


def test_the_file_lands_where_the_manifest_resolves_it(tmp_path):
    """The round trip that matters: what this writes, the manifest builder keys
    back to the product it was filed for."""
    hold(tmp_path, "bc_aero-1.jpg")
    run(tmp_path, ["https://bc.example/a.png"], served({"https://bc.example/a.png": PNG}))
    for name in files(tmp_path):
        key, _ = build_gear_manifest.parse(Path(name).stem, {"bc_aero-1"})
        assert key == "bc_aero-1", name


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
    assert report.written == ["bc_aero-1.png"]


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
    hold(tmp_path, "bc_aero-1.jpg", b"the curated original")
    run(tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}))
    assert (tmp_path / "webbings" / "bc_aero-1.jpg").read_bytes() == b"the curated original"


def test_a_photo_already_held_byte_for_byte_is_skipped(tmp_path):
    """So running the command twice on one record is safe."""
    hold(tmp_path, "bc_aero-1.jpg", JPEG)
    report = run(tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}))
    assert report.written == []
    assert [url for url, _ in report.skipped] == ["https://bc.example/a.jpg"]
    assert files(tmp_path) == ["bc_aero-1.jpg"]


def test_the_same_photo_under_two_links_is_written_once(tmp_path):
    urls = ["https://bc.example/a.jpg", "https://cdn.bc.example/a.jpg"]
    report = run(tmp_path, urls, served({urls[0]: JPEG, urls[1]: JPEG}))
    assert report.written == ["bc_aero-1.jpg"]
    assert [url for url, _ in report.skipped] == [urls[1]]


def test_a_dry_run_writes_nothing(tmp_path):
    report = run(
        tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}),
        dry_run=True,
    )
    assert report.written == ["bc_aero-1.jpg"], "a dry run still reports the name it would use"
    assert files(tmp_path) == []


def test_one_dead_link_does_not_stop_the_others(tmp_path):
    urls = ["https://bc.example/gone.jpg", "https://bc.example/a.jpg"]
    report = run(tmp_path, urls, served({urls[1]: JPEG}))
    assert report.written == ["bc_aero-1.jpg"]
    assert [url for url, _ in report.failed] == [urls[0]]


# --- Warnings ---------------------------------------------------------------


def test_a_key_matching_no_product_is_warned_about(tmp_path):
    """A rename or new product whose JSON patch is not applied yet: the photos
    are filed, and will not render until the seed agrees."""
    report = run(
        tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}),
        name="Aero 2", valid={"bc_aero-1"},
    )
    assert report.written == ["bc_aero-2.jpg"]
    assert any("bc_aero-2" in warning for warning in report.warnings)


def test_a_key_matching_a_product_is_not_warned_about(tmp_path):
    report = run(tmp_path, ["https://bc.example/a.jpg"], served({"https://bc.example/a.jpg": JPEG}))
    assert report.warnings == []


# --- The command ------------------------------------------------------------


@pytest.fixture
def cli(tmp_path, monkeypatch):
    """`main()` pointed at a scratch tree, with the manifest rebuild recorded
    instead of rewriting the repo's gearImages.json."""
    rebuilt = []
    monkeypatch.setattr(fsi, "PUB", tmp_path)
    monkeypatch.setattr(fsi, "load_abbrev", lambda: ABBREV)
    monkeypatch.setattr(fsi, "valid_keys", lambda gear_type, abbrev: {"bc_aero-1"})
    monkeypatch.setattr(fsi, "rebuild_manifest", lambda: rebuilt.append(True))
    return rebuilt


ARGS = ["--gear-type", "webbings", "--brand", "Balance Community", "--name", "Aero 1"]


def test_the_command_files_the_photos_and_rebuilds_the_manifest(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({"https://bc.example/a.jpg": JPEG}))
    assert fsi.main([*ARGS, "https://bc.example/a.jpg"]) == 0
    assert files(tmp_path) == ["bc_aero-1.jpg"]
    assert cli == [True]


def test_the_command_exits_1_when_any_link_failed(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({"https://bc.example/a.jpg": JPEG}))
    assert fsi.main([*ARGS, "https://bc.example/a.jpg", "https://bc.example/gone.jpg"]) == 1
    assert files(tmp_path) == ["bc_aero-1.jpg"], "the link that worked is still filed"
    assert cli == [True]


def test_a_dry_run_command_does_not_rebuild_the_manifest(tmp_path, cli, monkeypatch):
    monkeypatch.setattr(fsi, "fetch", served({"https://bc.example/a.jpg": JPEG}))
    assert fsi.main([*ARGS, "--dry-run", "https://bc.example/a.jpg"]) == 0
    assert cli == []


def test_an_unknown_gear_type_is_refused(cli):
    with pytest.raises(SystemExit):
        fsi.main(["--gear-type", "hats", "--brand", "B", "--name", "N", "https://x.example/a.jpg"])


def test_the_hash_helper_is_sha256():
    assert fsi.digest(b"abc") == hashlib.sha256(b"abc").hexdigest()
