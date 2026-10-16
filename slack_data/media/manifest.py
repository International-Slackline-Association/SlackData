"""
Which media every item and brand has — what the site reads in place of the
build-time manifests (LIVE_EDITING_PHASE_4.md P4-C).

`GET /media/manifest` answers this, built from the same documents the
catalogue export serves (store mode: the live catalogue's; shadow: the store's;
locally: the seed files), so a photo added on the site is listed on the next
request without a deploy.

    {
      "base": "/media",
      "photos":  {"webbings": {"42": [{"small": "<key>", "large": "<key>"}]}},
      "manuals": {"webbings": {"42": [{"file": "<key>", "title": "User manual"}]}},
      "brandManuals": {"webbings": {"Balance Community": [{"file", "title"}]}},
      "logos": {"Balance Community": "<key>"}
    }

Keys are under `base`. Brands are keyed by name **as the API spells it**
(`brand_name` on every item), which is all an item carries; a brand's name
never changes (P3-G). A merged duplicate is left out, as it is everywhere.
"""

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.load_data.load_gear import GEAR, MANUALS_KEY, PHOTOS_KEY, is_listed
from slack_data.media.edits import LOGO_KEY
from slack_data.utilities.brand_aliases import canonical_brand

BRANDS = "manufacturers"


def build_manifest(documents: list[Document]) -> dict:
    photos: dict[str, dict[str, list]] = {}
    manuals: dict[str, dict[str, list]] = {}
    brand_manuals: dict[str, dict[str, list]] = {}
    logos: dict[str, str] = {}
    for document in sorted(documents, key=lambda d: (d.collection, d.seq, d.key)):
        data = document.data
        if document.key == ENVELOPE_KEY or document.retired or not isinstance(data, dict):
            continue
        if document.collection in GEAR:
            if not is_listed(data):
                continue
            if data.get(PHOTOS_KEY):
                photos.setdefault(document.collection, {})[document.key] = [
                    {"small": p["small"], "large": p["large"]} for p in data[PHOTOS_KEY]
                ]
            if data.get(MANUALS_KEY):
                manuals.setdefault(document.collection, {})[document.key] = [
                    {"file": m["file"], "title": m["title"]} for m in data[MANUALS_KEY]
                ]
        elif document.collection == BRANDS and data.get("name"):
            name = canonical_brand(str(data["name"]))
            if data.get(LOGO_KEY):
                logos[name] = data[LOGO_KEY]
            for collection, listed in (data.get(MANUALS_KEY) or {}).items():
                if listed:
                    brand_manuals.setdefault(collection, {})[name] = [
                        {"file": m["file"], "title": m["title"]} for m in listed
                    ]
    return {"photos": photos, "manuals": manuals, "brandManuals": brand_manuals, "logos": logos}


_CACHE: dict = {"documents": None, "manifest": None}


def current_manifest() -> dict:
    """The manifest for the catalogue a page would show now. In store mode it
    is built once per catalogue the process builds (the live catalogue's
    documents are a new list on every rebuild); otherwise on every call."""
    from slack_data.api.routers.catalogue_router import _documents

    documents, _, source = _documents()
    if source == "store" and _CACHE["documents"] is documents:
        return _CACHE["manifest"]
    manifest = build_manifest(documents)
    if source == "store":
        _CACHE.update(documents=documents, manifest=manifest)
    return manifest
