"""
Adding, removing, reordering and retitling media — an ordinary logged edit of
the item's (or brand's) entry (LIVE_EDITING_PHASE_4.md P4-B, P4-H).

The editor sends the **whole list as it should be**, in order: each element
either an `id` already on the item (kept, in this position — a manual may be
retitled) or an `upload` just posted to quarantine. So one request adds,
removes and reorders, and one log record says what the list was and is.

Every upload is checked before anything is published (`kinds.check`, on the
bytes S3 actually holds), then copied to its media key, then the entry and
its record are committed together with the rev check (D27, D28). A commit that
loses the race leaves the copied files unreferenced, which costs cents and is
never served.

A revert of a media change restores the earlier list through `edits.revert`:
every file in it was checked when it was added, and none was ever deleted.
"""

from typing import Any

from pydantic import BaseModel, Field

from slack_data.catalogue import edits
from slack_data.catalogue.documents import Document
from slack_data.catalogue.repository import Put
from slack_data.changelog.writer import commit_catalogue_change
from slack_data.load_data.load_gear import GEAR, MANUALS_KEY, MERGED_KEY, PHOTOS_KEY
from slack_data.media import kinds
from slack_data.media.kinds import HEAD_BYTES, LARGE_PX, SMALL_PX, FileType, Purpose
from slack_data.media.store import (
    MediaStore,
    brand_manual_key,
    logo_key,
    manual_key,
    new_media_id,
    photo_key,
    slug,
)
from slack_data.models.changes import Action, Channel, TargetType
from slack_data.models.people import Person

MAX_TITLE = 100
MAX_PHOTOS = 40
MAX_MANUALS = 20

LOGO_KEY = "logo"


# --- What the editor sends ------------------------------------------------------


class NewPhoto(BaseModel):
    """The two sizes of one photo, each an upload id (P4-D)."""

    small: str = Field(max_length=32)
    large: str = Field(max_length=32)


class PhotoRef(BaseModel):
    id: str | None = Field(default=None, max_length=16)
    upload: NewPhoto | None = None


class ManualRef(BaseModel):
    id: str | None = Field(default=None, max_length=16)
    upload: str | None = Field(default=None, max_length=32)
    title: str = Field(max_length=MAX_TITLE)


class LogoChange(BaseModel):
    """`{"upload": id}` sets the logo; `{"upload": null}` takes it off."""

    upload: str | None = Field(default=None, max_length=32)


# --- Checking and publishing ------------------------------------------------------


def checked(media: MediaStore, upload_id: str, purpose: Purpose) -> FileType:
    """What the upload is, from its own bytes — or `Invalid`."""
    found = media.upload_head(upload_id, HEAD_BYTES)
    if found is None:
        raise edits.Invalid(f"no upload {upload_id} — it may have expired; add the file again")
    head, size = found
    try:
        return kinds.check(purpose, head, size)
    except kinds.Rejected as error:
        raise edits.Invalid(f"upload {upload_id}: {error}") from error


def _title(text: str) -> str:
    title = " ".join((text or "").split())
    if not title:
        raise edits.Invalid("a manual needs a title", [{"field": "title", "message": "required"}])
    return title


def _unique(ids: list[str], what: str) -> None:
    if len(ids) != len(set(ids)):
        raise edits.Invalid(f"a {what} is listed twice")


def _photos(
    media: MediaStore, collection: str, owner: int, current: list[dict], wanted: list[PhotoRef]
) -> tuple[list[dict], list]:
    """The new photo list, and the publishes it needs (run after every check)."""
    if len(wanted) > MAX_PHOTOS:
        raise edits.Invalid(f"at most {MAX_PHOTOS} photos")
    held = {p["id"]: p for p in current}
    _unique([r.id for r in wanted if r.id], "photo")
    result, publishes = [], []
    for ref in wanted:
        if (ref.id is None) == (ref.upload is None):
            raise edits.Invalid("each photo is an id already on the item, or an upload")
        if ref.id is not None:
            if ref.id not in held:
                raise edits.Invalid(f"no photo {ref.id} on this item")
            result.append(held[ref.id])
            continue
        small = checked(media, ref.upload.small, Purpose.PHOTO)
        large = checked(media, ref.upload.large, Purpose.PHOTO)
        media_id = new_media_id()
        small_key = photo_key(collection, owner, media_id, SMALL_PX, small)
        large_key = photo_key(collection, owner, media_id, LARGE_PX, large)
        publishes += [(ref.upload.small, small_key, small, None), (ref.upload.large, large_key, large, None)]
        result.append({"id": media_id, "small": small_key, "large": large_key})
    return result, publishes


def _manuals(
    media: MediaStore, current: list[dict], wanted: list[ManualRef], key_for
) -> tuple[list[dict], list]:
    if len(wanted) > MAX_MANUALS:
        raise edits.Invalid(f"at most {MAX_MANUALS} manuals")
    held = {m["id"]: m for m in current}
    _unique([r.id for r in wanted if r.id], "manual")
    result, publishes = [], []
    for ref in wanted:
        title = _title(ref.title)
        if (ref.id is None) == (ref.upload is None):
            raise edits.Invalid("each manual is an id already held, or an upload")
        if ref.id is not None:
            if ref.id not in held:
                raise edits.Invalid(f"no manual {ref.id} here")
            result.append({**held[ref.id], "title": title})
            continue
        kind = checked(media, ref.upload, Purpose.MANUAL)
        media_id = new_media_id()
        key = key_for(media_id, title)
        publishes.append((ref.upload, key, kind, f"{slug(title)}.pdf"))
        result.append({"id": media_id, "file": key, "title": title})
    return result, publishes


def _publish(media: MediaStore, publishes: list) -> None:
    for upload_id, key, kind, download_name in publishes:
        media.publish(upload_id, key, kind, download_name)


# --- Items ----------------------------------------------------------------------


def set_item_media(
    store,
    log,
    media: MediaStore,
    actor: Person,
    collection: str,
    item_id: int,
    rev: int,
    photos: list[PhotoRef] | None = None,
    manuals: list[ManualRef] | None = None,
    why: str | None = None,
    cap=None,
) -> edits.Outcome:
    """Make the item's photos and/or manuals exactly these lists (None: leave
    that list as it is). One save for the rate cap, however many files."""
    if photos is None and manuals is None:
        raise edits.Invalid("nothing to change")
    documents = store.load()
    document = edits._item(documents, collection, item_id)
    # Before anything is published (edit_item checks again, with the rest).
    brand = edits.check_gear(actor, documents, document.data.get("brand"))
    if cap is not None:
        cap.precheck(actor.role_label(brand))
    if document.data.get(MERGED_KEY) is not None:
        raise edits.Refused(f"{edits.api_type(collection)} {item_id} was merged into {document.data[MERGED_KEY]}")
    changes: dict[str, Any] = {}
    publishes: list = []
    if photos is not None:
        changes[PHOTOS_KEY], more = _photos(
            media, collection, item_id, document.data.get(PHOTOS_KEY) or [], photos
        )
        publishes += more
    if manuals is not None:
        changes[MANUALS_KEY], more = _manuals(
            media,
            document.data.get(MANUALS_KEY) or [],
            manuals,
            lambda media_id, title: manual_key(collection, item_id, media_id, title),
        )
        publishes += more
    _publish(media, publishes)
    return edits.edit_item(store, log, actor, collection, item_id, rev, changes, why, cap, media=True)


# --- Brands ---------------------------------------------------------------------


def set_brand_media(
    store,
    log,
    media: MediaStore,
    actor: Person,
    catalog_id: int,
    rev: int,
    logo: LogoChange | None = None,
    manuals: dict[str, list[ManualRef]] | None = None,
    why: str | None = None,
    cap=None,
) -> edits.Outcome:
    """A brand's logo, and its range-wide manuals per gear type ("Applies to
    all Gibbon webbings"). Only the gear types named in `manuals` change."""
    if logo is None and not manuals:
        raise edits.Invalid("nothing to change")
    unknown = sorted(set(manuals or {}) - set(GEAR))
    if unknown:
        raise edits.Invalid(f"no gear type {unknown}")
    documents = store.load()
    document: Document = edits._brand_document(documents, catalog_id)
    brand = edits.check_brand(actor, documents, catalog_id)
    if cap is not None:
        cap.precheck(actor.role_label(brand))
    data = dict(document.data)
    publishes: list = []
    if logo is not None:
        if logo.upload is None:
            data.pop(LOGO_KEY, None)
        else:
            kind = checked(media, logo.upload, Purpose.LOGO)
            key = logo_key(catalog_id, new_media_id(), kind)
            publishes.append((logo.upload, key, kind, None))
            data[LOGO_KEY] = key
    if manuals:
        by_type = dict(data.get(MANUALS_KEY) or {})
        for collection, wanted in manuals.items():
            listed, more = _manuals(
                media,
                by_type.get(collection) or [],
                wanted,
                lambda media_id, title, c=collection: brand_manual_key(catalog_id, c, media_id, title),
            )
            publishes += more
            if listed:
                by_type[collection] = listed
            else:
                by_type.pop(collection, None)
        if by_type:
            data[MANUALS_KEY] = dict(sorted(by_type.items()))
        else:
            data.pop(MANUALS_KEY, None)
    diff = edits._diff(document.data, data)
    if not diff:
        return edits.Outcome("manufacturers", document.key, document.data, document.rev)
    _publish(media, publishes)
    record = edits._record(
        actor, TargetType.BRAND, str(catalog_id), Action.BRAND_EDIT, brand, channel=Channel.WEB, changes=diff, why=why
    )
    put = Put(document.model_copy(update={"data": data, "rev": document.rev + 1}), rev)
    commit_catalogue_change(store, log, [put], [], [record], cap)
    return edits.Outcome("manufacturers", document.key, data, document.rev + 1, [record])
