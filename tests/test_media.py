"""
Photos, manuals and logos as data — live editing phase 4 (LIVE_EDITING_PHASE_4.md).

Against an in-memory catalogue store filled from the real seeds, and a
filesystem media store in a temp dir: the same code path as hosted up to the
S3 calls, which have their own tests at the bottom against a recording client.
What must hold:

- **The type is the bytes'**: an SVG, an HTML page, or a file whose bytes are
  not what the browser claimed is never published (hazard 3).
- **The whole list is the edit**: add, remove, reorder and retitle are one
  logged change of the item, conflict-checked and revertable (P4-H).
- **Nothing is deleted** (hazard 4): a photo taken off an item keeps its file.
- **The manifest lists it on the next request** (P4-C) — no deploy.
- **The local stand-ins never run hosted** (P4-G).
"""

import io

import pytest

from slack_data.api import auth
from slack_data.api.routers import catalogue_router
from slack_data.api.routers.edit_router import available_media, editable_store
from slack_data.catalogue.importer import documents_from_files
from slack_data.catalogue.repository import InMemoryCatalogueRepository
from slack_data.media import kinds
from slack_data.media.s3 import UPLOAD_PREFIX, S3MediaStore
from slack_data.media.store import FilesystemMediaStore, set_media_store
from slack_data.utilities.brand_aliases import canonical_brand

ADMIN = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}

WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 64
WEBP_2 = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x01" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
HTML = b"<!doctype html><script>alert(1)</script>"

_DOCUMENTS = None


def _seed_documents():
    global _DOCUMENTS
    if _DOCUMENTS is None:
        _DOCUMENTS = documents_from_files()
    return [d.model_copy(deep=True) for d in _DOCUMENTS]


@pytest.fixture
def store(client, monkeypatch):
    repository = InMemoryCatalogueRepository()
    repository.put_many(_seed_documents())
    client.app.dependency_overrides[editable_store] = lambda: repository
    # The manifest reads what a page would: here, this store.
    monkeypatch.setattr(catalogue_router, "_documents", lambda: (repository.load(), repository.version(), "store (shadow)"))
    return repository


@pytest.fixture
def media(client, tmp_path):
    store = FilesystemMediaStore(tmp_path / "media", snapshot=None)
    set_media_store(store)
    client.app.dependency_overrides[available_media] = lambda: store
    yield store
    set_media_store(None)


def upload(client, purpose, content_type, data):
    """Ask for a form, post the file to it, as the browser does. The upload id."""
    response = client.post(
        "/edit/media/uploads",
        headers=ADMIN,
        json={"files": [{"purpose": purpose, "content_type": content_type, "size": len(data)}]},
    )
    assert response.status_code == 200, response.text
    [target] = response.json()
    posted = client.post(target["url"], data=target["fields"], files={"file": ("f", io.BytesIO(data), content_type)})
    assert posted.status_code == 204, posted.text
    return target["upload"]


def photo(client, data=WEBP, large=None):
    return {
        "upload": {
            "small": upload(client, "photo", "image/webp", data),
            "large": upload(client, "photo", "image/webp", large or data),
        }
    }


def entry(client, slug, item_id):
    response = client.get(f"/edit/{slug}/{item_id}", headers=ADMIN)
    assert response.status_code == 200, response.text
    return response.json()


def put_media(client, slug, item_id, rev=None, **lists):
    if rev is None:
        rev = entry(client, slug, item_id)["rev"]
    return client.put(f"/edit/{slug}/{item_id}/media", headers=ADMIN, json={"rev": rev, **lists})


def keep(photos):
    return [{"id": p["id"]} for p in photos]


# --- What a file may be ------------------------------------------------------------


@pytest.mark.parametrize("data, kind", [(JPEG, kinds.JPEG), (PNG, kinds.PNG), (WEBP, kinds.WEBP), (PDF, kinds.PDF)])
def test_each_accepted_type_is_known_by_its_bytes(data, kind):
    assert kinds.sniff(data) == kind


@pytest.mark.parametrize("data", [SVG, HTML, b"GIF89a....", b"", b"RIFF\x24\x00\x00\x00WAVEfmt "])
def test_anything_a_browser_could_run_is_no_accepted_type(data):
    assert kinds.sniff(data) is None


def test_a_pdf_is_no_photo_and_a_photo_no_manual():
    with pytest.raises(kinds.Rejected):
        kinds.check(kinds.Purpose.PHOTO, PDF, len(PDF))
    with pytest.raises(kinds.Rejected):
        kinds.check(kinds.Purpose.MANUAL, WEBP, len(WEBP))


def test_the_limits_are_d45s():
    assert kinds.MAX_BYTES[kinds.Purpose.MANUAL] == 25 * kinds.MB
    with pytest.raises(kinds.Rejected):
        kinds.check(kinds.Purpose.MANUAL, PDF, 25 * kinds.MB + 1)
    assert kinds.check(kinds.Purpose.MANUAL, PDF, 25 * kinds.MB) == kinds.PDF


# --- Upload forms ------------------------------------------------------------------


def test_upload_forms_are_for_admins(client, store, media):
    body = {"files": [{"purpose": "photo", "content_type": "image/webp", "size": 10}]}
    assert client.post("/edit/media/uploads", json=body).status_code == 401


@pytest.mark.parametrize(
    "purpose, content_type, size",
    [
        ("photo", "image/svg+xml", 10),
        ("photo", "text/html", 10),
        ("photo", "application/pdf", 10),
        ("manual", "image/webp", 10),
        ("manual", "application/pdf", 25 * kinds.MB + 1),
        ("photo", "image/webp", 5 * kinds.MB + 1),
    ],
)
def test_a_file_the_purpose_does_not_allow_gets_no_form(client, store, media, purpose, content_type, size):
    body = {"files": [{"purpose": purpose, "content_type": content_type, "size": size}]}
    response = client.post("/edit/media/uploads", headers=ADMIN, json=body)
    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["field"] == "files.0"


def form(client, purpose="photo", content_type="image/webp", size=10):
    body = {"files": [{"purpose": purpose, "content_type": content_type, "size": size}]}
    return client.post("/edit/media/uploads", headers=ADMIN, json=body).json()[0]


def test_the_local_form_refuses_what_s3s_policy_would(client, store, media):
    target = form(client)
    tampered = {**target["fields"], "max": str(10**9)}
    response = client.post(target["url"], data=tampered, files={"file": ("f", io.BytesIO(WEBP), "image/webp")})
    assert response.status_code == 403, "a changed limit breaks the signature"

    target = form(client)
    big = b"\x00" * (5 * kinds.MB + 1)
    response = client.post(target["url"], data=target["fields"], files={"file": ("f", io.BytesIO(big), "image/webp")})
    assert response.status_code == 403, "over the purpose's limit"


def test_an_expired_form_is_refused(client, store, media, monkeypatch):
    target = form(client)
    import slack_data.media.store as media_store_module

    monkeypatch.setattr(media_store_module.time, "time", lambda: 10**12)
    response = client.post(target["url"], data=target["fields"], files={"file": ("f", io.BytesIO(WEBP), "image/webp")})
    assert response.status_code == 403


# --- Photos --------------------------------------------------------------------------


def test_a_photo_is_published_logged_and_listed(client, store, media):
    response = put_media(client, "grips", 1, photos=[photo(client)], why="maker's photo")
    assert response.status_code == 200, response.text
    [added] = response.json()["entry"]["photos"]
    assert added["small"].startswith("grips/1/") and added["small"].endswith("-480.webp")
    assert added["large"].endswith("-1600.webp")

    served = client.get(f"/media/{added['large']}")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.content == WEBP

    [record] = client.get("/changes", params={"target_type": "item", "target_id": "grips#1"}).json()
    assert record["action"] == "item.edit"
    assert record["changes"]["photos"]["after"] == [added]
    assert record["why"] == "maker's photo"

    manifest = client.get("/media/manifest").json()
    assert manifest["photos"]["grips"]["1"] == [{"small": added["small"], "large": added["large"]}]
    assert manifest["base"] == "http://testserver/media"


def test_a_file_whose_bytes_are_not_a_photo_is_never_published(client, store, media):
    before = entry(client, "grips", 1)["entry"].get("photos")
    lie = upload(client, "photo", "image/webp", HTML)  # the browser's claim, not the bytes
    response = put_media(client, "grips", 1, photos=[{"upload": {"small": lie, "large": lie}}])
    assert response.status_code == 422
    assert "not a JPG or PNG or WEBP file" in response.json()["detail"]["message"]
    assert not (media.root / "grips").exists(), "nothing was published"
    assert entry(client, "grips", 1)["entry"].get("photos") == before


def test_an_unknown_upload_is_refused(client, store, media):
    response = put_media(client, "grips", 1, photos=[{"upload": {"small": "0" * 32, "large": "0" * 32}}])
    assert response.status_code == 422
    assert "expired" in response.json()["detail"]["message"]


def test_photos_are_reordered_and_removed_as_one_list(client, store, media):
    first = put_media(client, "grips", 1, photos=[photo(client), photo(client, WEBP_2)]).json()["entry"]["photos"]
    a, b = first

    reordered = put_media(client, "grips", 1, photos=keep([b, a])).json()["entry"]["photos"]
    assert [p["id"] for p in reordered] == [b["id"], a["id"]]

    removed = put_media(client, "grips", 1, photos=keep([a]), why="wrong product").json()["entry"]["photos"]
    assert removed == [a]
    assert (media.root / b["large"]).is_file(), "taking a photo off an item deletes nothing"

    cleared = put_media(client, "grips", 1, photos=[]).json()["entry"]
    assert "photos" not in cleared
    assert len(client.get("/changes", params={"target_type": "item", "target_id": "grips#1"}).json()) == 4


def test_a_photo_another_item_holds_cannot_be_borrowed(client, store, media):
    [held] = put_media(client, "grips", 1, photos=[photo(client)]).json()["entry"]["photos"]
    response = put_media(client, "grips", 2, photos=[{"id": held["id"]}])
    assert response.status_code == 422
    assert "no photo" in response.json()["detail"]["message"]


def test_a_photo_listed_twice_is_refused(client, store, media):
    [held] = put_media(client, "grips", 1, photos=[photo(client)]).json()["entry"]["photos"]
    assert put_media(client, "grips", 1, photos=keep([held, held])).status_code == 422


def test_a_stale_media_edit_is_refused_with_the_current_entry(client, store, media):
    rev = entry(client, "grips", 1)["rev"]
    assert put_media(client, "grips", 1, rev=rev, photos=[photo(client)]).status_code == 200
    response = put_media(client, "grips", 1, rev=rev, photos=[])
    assert response.status_code == 409
    assert response.json()["detail"]["current"]["photos"]


def test_the_edit_form_cannot_set_media(client, store, media):
    rev = entry(client, "grips", 1)["rev"]
    for key in ("photos", "manuals"):
        response = client.patch(
            "/edit/grips/1", headers=ADMIN, json={"rev": rev, "changes": {key: [{"id": "x", "small": "/etc/passwd"}]}}
        )
        assert response.status_code == 422, "a path could otherwise point anywhere"


def test_a_media_change_is_reverted_like_any_edit(client, store, media):
    put_media(client, "grips", 1, photos=[photo(client)])
    [added] = entry(client, "grips", 1)["entry"]["photos"]
    removal = put_media(client, "grips", 1, photos=[]).json()["records"][0]
    response = client.post(f"/edit/revert/{removal}", headers=ADMIN, json={"why": "removed by mistake"})
    assert response.status_code == 200, response.text
    assert response.json()["entry"]["photos"] == [added]


def test_a_merged_item_takes_no_media(client, store, media):
    rev = entry(client, "grips", 2)["rev"]
    client.post(
        "/edit/grips/2/merge", headers=ADMIN,
        json={"rev": rev, "into": 1, "why": "the same grip, listed twice by two different shops"},
    )
    response = client.put("/edit/grips/2/media", headers=ADMIN, json={"rev": rev + 1, "photos": [photo(client)]})
    assert response.status_code in (404, 409)


def test_the_manifest_leaves_merged_items_out(client, store, media):
    put_media(client, "grips", 2, photos=[photo(client)])
    rev = entry(client, "grips", 2)["rev"]
    client.post(
        "/edit/grips/2/merge", headers=ADMIN,
        json={"rev": rev, "into": 1, "why": "the same grip, listed twice by two different shops"},
    )
    assert "2" not in client.get("/media/manifest").json()["photos"].get("grips", {})


def test_the_catalogue_still_builds_with_media_on_an_entry(client, store, media):
    from tests.test_edits import built

    put_media(client, "grips", 1, photos=[photo(client)], manuals=[{"upload": upload(client, "manual", "application/pdf", PDF), "title": "User manual"}])
    built(store)  # the loader reads past photos and manuals; UnknownField would raise


# --- Manuals ------------------------------------------------------------------------


def test_a_manual_is_published_with_its_title_and_retitled(client, store, media):
    pdf = upload(client, "manual", "application/pdf", PDF)
    response = put_media(client, "grips", 1, manuals=[{"upload": pdf, "title": "  User   manual "}])
    assert response.status_code == 200, response.text
    [manual] = response.json()["entry"]["manuals"]
    assert manual["title"] == "User manual"
    assert manual["file"].startswith("grips/1/") and manual["file"].endswith("-user-manual.pdf")
    assert client.get(f"/media/{manual['file']}").headers["content-type"] == "application/pdf"

    retitled = put_media(client, "grips", 1, manuals=[{"id": manual["id"], "title": "Test certificate"}])
    assert retitled.json()["entry"]["manuals"] == [{**manual, "title": "Test certificate"}]
    assert client.get("/media/manifest").json()["manuals"]["grips"]["1"] == [
        {"file": manual["file"], "title": "Test certificate"}
    ]


def test_a_manual_needs_a_title_and_a_pdf(client, store, media):
    pdf = upload(client, "manual", "application/pdf", PDF)
    assert put_media(client, "grips", 1, manuals=[{"upload": pdf, "title": " "}]).status_code == 422
    fake = upload(client, "manual", "application/pdf", HTML)
    assert put_media(client, "grips", 1, manuals=[{"upload": fake, "title": "Manual"}]).status_code == 422


# --- Brands -------------------------------------------------------------------------


def brand(client, catalog_id):
    return client.get(f"/edit/brand/{catalog_id}", headers=ADMIN).json()


def test_a_brand_gets_a_logo_and_range_wide_manuals(client, store, media):
    current = brand(client, 3)
    # As items carry it: the brand's name as the API spells it.
    name = canonical_brand(current["entry"]["name"])
    logo = upload(client, "logo", "image/png", PNG)
    pdf = upload(client, "manual", "application/pdf", PDF)
    response = client.put(
        "/edit/brand/3/media", headers=ADMIN,
        json={"rev": current["rev"], "logo": {"upload": logo}, "manuals": {"webbings": [{"upload": pdf, "title": "Webbing manual"}]}},
    )
    assert response.status_code == 200, response.text
    data = response.json()["entry"]
    assert data["logo"].startswith("brands/3/logo-") and data["logo"].endswith(".png")
    assert data["manuals"]["webbings"][0]["file"].startswith("brands/3/webbings/")

    manifest = client.get("/media/manifest").json()
    assert manifest["logos"][name] == data["logo"]
    assert manifest["brandManuals"]["webbings"][name][0]["title"] == "Webbing manual"

    [record] = client.get("/changes", params={"target_type": "brand", "target_id": "3"}).json()
    assert set(record["changes"]) == {"logo", "manuals"}

    off = client.put("/edit/brand/3/media", headers=ADMIN, json={"rev": current["rev"] + 1, "logo": {"upload": None}})
    assert "logo" not in off.json()["entry"]


def test_a_logo_must_be_an_image(client, store, media):
    current = brand(client, 3)
    pdf = upload(client, "manual", "application/pdf", PDF)
    response = client.put("/edit/brand/3/media", headers=ADMIN, json={"rev": current["rev"], "logo": {"upload": pdf}})
    assert response.status_code == 422


def test_brand_manuals_name_real_gear_types(client, store, media):
    current = brand(client, 3)
    response = client.put("/edit/brand/3/media", headers=ADMIN, json={"rev": current["rev"], "manuals": {"hats": []}})
    assert response.status_code == 422


# --- Hosted ---------------------------------------------------------------------------


def test_the_local_stand_ins_answer_404_hosted(client, store, media, monkeypatch):
    target = form(client)
    monkeypatch.setenv("SLACKDATA_DEPLOYMENT", "hosted")
    response = client.post(target["url"], data=target["fields"], files={"file": ("f", io.BytesIO(WEBP), "image/webp")})
    assert response.status_code == 404
    assert client.get("/media/grips/1/x-480.webp").status_code == 404


def test_hosted_without_buckets_there_is_no_media_store(monkeypatch):
    from slack_data.media.store import build_media_store

    monkeypatch.setenv("SLACKDATA_DEPLOYMENT", "hosted")
    monkeypatch.delenv("MEDIA_BUCKET", raising=False)
    assert build_media_store() is None


def test_the_manifest_base_is_the_cdn_path_hosted(client, store, media, monkeypatch):
    monkeypatch.setenv("MEDIA_BASE_URL", "/media/")
    assert client.get("/media/manifest").json()["base"] == "/media"


def test_a_key_cannot_climb_out_of_the_media_root(client, store, media):
    assert client.get("/media/../../etc/passwd").status_code == 404
    assert media.locate("grips/../../x.webp") is None


# --- S3 -------------------------------------------------------------------------------


class RecordingS3:
    def __init__(self, objects=None):
        self.calls = []
        self.objects = objects or {}

    def generate_presigned_post(self, **kwargs):
        self.calls.append(("presign", kwargs))
        return {"url": "https://uploads.example", "fields": {"key": kwargs["Key"], **kwargs["Fields"]}}

    def get_object(self, **kwargs):
        self.calls.append(("get", kwargs))
        data = self.objects[kwargs["Key"]]
        return {"Body": io.BytesIO(data[:16]), "ContentRange": f"bytes 0-15/{len(data)}"}

    def copy_object(self, **kwargs):
        self.calls.append(("copy", kwargs))

    def put_object(self, **kwargs):
        self.calls.append(("put", kwargs))


def test_s3_enforces_the_size_and_the_type_on_arrival():
    s3 = RecordingS3()
    target = S3MediaStore("media", "uploads", client=s3).upload_target("a" * 32, "image/webp", 5 * kinds.MB, "")
    [(_, kwargs)] = s3.calls
    assert kwargs["Bucket"] == "uploads" and kwargs["Key"] == UPLOAD_PREFIX + "a" * 32
    assert ["content-length-range", 1, 5 * kinds.MB] in kwargs["Conditions"]
    assert {"Content-Type": "image/webp"} in kwargs["Conditions"]
    assert target.fields["Content-Type"] == "image/webp"


def test_s3_reads_only_the_head_and_the_size():
    s3 = RecordingS3({UPLOAD_PREFIX + "u": PDF + b"\x00" * 1000})
    head, size = S3MediaStore("media", "uploads", client=s3).upload_head("u", 16)
    assert head == (PDF + b"\x00" * 1000)[:16] and size == len(PDF) + 1000
    assert s3.calls[0][1]["Range"] == "bytes=0-15"


def test_s3_publishes_by_copy_with_the_checked_type():
    s3 = RecordingS3()
    S3MediaStore("media", "uploads", client=s3).publish("u", "grips/1/x-user-manual.pdf", kinds.PDF, "user-manual.pdf")
    [(_, kwargs)] = s3.calls
    assert kwargs["Bucket"] == "media" and kwargs["CopySource"] == {"Bucket": "uploads", "Key": UPLOAD_PREFIX + "u"}
    assert kwargs["MetadataDirective"] == "REPLACE"
    assert kwargs["ContentType"] == "application/pdf"
    assert kwargs["ContentDisposition"] == 'inline; filename="user-manual.pdf"'
    assert "immutable" in kwargs["CacheControl"]
