"""
Where media files live, behind an interface — the same pattern as every other
store (LIVE_EDITING_PHASE_4.md § 5, P4-A, P4-G).

| implementation | used by |
|---|---|
| `FilesystemMediaStore` | local dev and tests: no AWS needed (D34) |
| `S3MediaStore` (`s3.py`) | hosted: the uploads bucket (quarantine) and the media bucket (served at `/media/…`) |

**An upload is two steps, and the API never carries the file.** API Gateway and
Lambda cap a request near 6 MB, below a 25 MB manual (hazard 1), so:

1. `upload_target` hands the browser a short-lived form to post the file
   straight to quarantine — an S3 presigned POST hosted, which enforces the size
   and the content type itself; a route of the API's own locally.
2. `upload_head` reads the file's first bytes and its size back, so the server
   checks what actually arrived (`kinds.check`), and `publish` copies it to the
   media key, served with the type that check found.

Nothing is ever deleted (hazard 4): taking a photo off an item leaves its file.
A published key is never overwritten either — each one carries a fresh media
id — so `/media/…` is cached for a year.

**Which store** (`media_store()`):

| `MEDIA_BUCKET` + `UPLOADS_BUCKET` | `MEDIA_DIR` | store |
|---|---|---|
| set | — | S3 — hosted, set by `infra/serverless.yml` |
| unset | set, or default `media-local/` in the CWD | the filesystem, with the repo's `media/` snapshot read beneath it (P4-F) |
| unset, hosted | — | none: the media routes answer 503 |
"""

import hashlib
import hmac
import os
import re
import secrets
import shutil
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from slack_data.media.kinds import FileType

# How long an upload form stays valid.
UPLOAD_TTL_SECONDS = 600

# Every published key is new, so it can be cached for ever.
CACHE_CONTROL = "public, max-age=31536000, immutable"

# The repo's media snapshot, refreshed deliberately in its own PR (P4-F): what
# local dev and CI serve beneath anything uploaded locally.
SNAPSHOT_DIR = Path(__file__).resolve().parents[2] / "media"


class UploadTarget(BaseModel):
    """Where the browser posts one file: a multipart form to `url` with
    `fields` first and the file last, as S3's POST policy requires."""

    upload: str
    url: str
    fields: dict[str, str]
    expires_at: str


class MediaStore(Protocol):
    def upload_target(self, upload_id: str, content_type: str, max_bytes: int, base_url: str) -> UploadTarget:
        """A form the browser can post one file of this type and size to.
        `base_url` is the API's own address, for a store that receives the
        file itself (the local one)."""
        ...

    def upload_head(self, upload_id: str, n: int) -> tuple[bytes, int] | None:
        """The first `n` bytes of an upload and its full size, or None when
        nothing was uploaded under that id."""
        ...

    def publish(self, upload_id: str, key: str, kind: FileType, download_name: str | None = None) -> None:
        """Copy an upload to `key` in the media store, served as `kind`."""
        ...

    def put(self, key: str, data: bytes, kind: FileType, download_name: str | None = None) -> None:
        """Write a file straight to the media store (the migration)."""
        ...

    def exists(self, key: str) -> bool:
        ...


def new_upload_id() -> str:
    return secrets.token_hex(16)


def new_media_id() -> str:
    return secrets.token_hex(8)


def slug(text: str) -> str:
    """Hyphen slug, as scripts/build_gear_manifest.py and the frontend make them."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "file"


# --- Keys -----------------------------------------------------------------------
#
# Under the media root, served at /media/<key>. An item's files sit under its
# gear type and id, a brand's under its catalog_id; each name begins with the
# file's media id, which is what makes it new.


def photo_key(collection: str, item_id: int | str, media_id: str, px: int, kind: FileType) -> str:
    return f"{collection}/{item_id}/{media_id}-{px}.{kind.extension}"


def manual_key(collection: str, item_id: int | str, media_id: str, title: str) -> str:
    return f"{collection}/{item_id}/{media_id}-{slug(title)}.pdf"


def logo_key(catalog_id: int | str, media_id: str, kind: FileType) -> str:
    return f"brands/{catalog_id}/logo-{media_id}.{kind.extension}"


def brand_manual_key(catalog_id: int | str, collection: str, media_id: str, title: str) -> str:
    return f"brands/{catalog_id}/{collection}/{media_id}-{slug(title)}.pdf"


_KEY = re.compile(r"^[a-z0-9]+(/[a-z0-9-]+)*/[a-z0-9-]+\.(jpg|png|webp|pdf|svg)$")


def valid_key(key: str) -> bool:
    """A key this module could have made — nothing climbs out of the root."""
    return bool(_KEY.match(key)) and ".." not in key


def _expiry() -> tuple[int, str]:
    expires = int(time.time()) + UPLOAD_TTL_SECONDS
    return expires, datetime.fromtimestamp(expires, timezone.utc).isoformat()


# --- The filesystem store ----------------------------------------------------------


class UploadRefused(Exception):
    """The local stand-in for S3 refusing a POST its policy does not allow."""


class FilesystemMediaStore:
    """Media under `root`, uploads under `root/.uploads`, and — read only,
    beneath both — the repo's snapshot."""

    def __init__(self, root: Path, snapshot: Path | None = SNAPSHOT_DIR) -> None:
        self.root = Path(root)
        self.snapshot = snapshot
        self.uploads = self.root / ".uploads"
        # Signs the local upload forms. Per process: a restart invalidates the
        # forms outstanding, which a 10-minute form can live with.
        self._secret = secrets.token_bytes(32)

    # The local stand-in for S3's POST policy.

    def _sign(self, upload_id: str, content_type: str, max_bytes: int, expires: int) -> str:
        message = f"{upload_id}|{content_type}|{max_bytes}|{expires}".encode()
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def upload_target(self, upload_id: str, content_type: str, max_bytes: int, base_url: str) -> UploadTarget:
        expires, expires_at = _expiry()
        return UploadTarget(
            upload=upload_id,
            url=f"{base_url.rstrip('/')}/media/uploads/{upload_id}",
            fields={
                "Content-Type": content_type,
                "max": str(max_bytes),
                "expires": str(expires),
                "signature": self._sign(upload_id, content_type, max_bytes, expires),
            },
            expires_at=expires_at,
        )

    def receive(self, upload_id: str, fields: dict[str, str], data: bytes) -> None:
        """What S3 does with a presigned POST: check the policy, store the file."""
        try:
            content_type = fields["Content-Type"]
            max_bytes = int(fields["max"])
            expires = int(fields["expires"])
            signature = fields["signature"]
        except (KeyError, ValueError) as error:
            raise UploadRefused("the form is incomplete") from error
        expected = self._sign(upload_id, content_type, max_bytes, expires)
        if not hmac.compare_digest(expected, signature):
            raise UploadRefused("the form's signature does not match")
        if time.time() > expires:
            raise UploadRefused("the form has expired")
        if not 1 <= len(data) <= max_bytes:
            raise UploadRefused("the file is outside the size the form allows")
        if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
            raise UploadRefused("not an upload id")
        self.uploads.mkdir(parents=True, exist_ok=True)
        (self.uploads / upload_id).write_bytes(data)

    def upload_head(self, upload_id: str, n: int) -> tuple[bytes, int] | None:
        if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
            return None
        path = self.uploads / upload_id
        if not path.is_file():
            return None
        with path.open("rb") as handle:
            return handle.read(n), path.stat().st_size

    def _target(self, key: str) -> Path:
        if not valid_key(key):
            raise ValueError(f"not a media key: {key!r}")
        return self.root / key

    def publish(self, upload_id: str, key: str, kind: FileType, download_name: str | None = None) -> None:
        target = self._target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.uploads / upload_id, target)

    def put(self, key: str, data: bytes, kind: FileType, download_name: str | None = None) -> None:
        target = self._target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def put_as(self, key: str, data: bytes, content_type: str) -> None:
        """A file whose type no upload may have (the SVG logos the migration
        copies as they were); served by extension, so the type is implied."""
        self.put(key, data, None)  # type: ignore[arg-type]

    def locate(self, key: str) -> Path | None:
        """The file to serve for `key`: uploaded locally, else the snapshot's."""
        if not valid_key(key):
            return None
        for base in (self.root, self.snapshot):
            if base is not None and (base / key).is_file():
                return base / key
        return None

    def exists(self, key: str) -> bool:
        return self.locate(key) is not None


# --- Selection ------------------------------------------------------------------

_STORE: MediaStore | None = None
_CHOSEN = False


def build_media_store() -> MediaStore | None:
    media_bucket, uploads_bucket = os.getenv("MEDIA_BUCKET"), os.getenv("UPLOADS_BUCKET")
    if media_bucket and uploads_bucket:
        from slack_data.media.s3 import S3MediaStore

        return S3MediaStore(media_bucket, uploads_bucket)
    from slack_data.deployment import is_hosted

    if is_hosted():
        return None
    return FilesystemMediaStore(Path(os.getenv("MEDIA_DIR") or "media-local"))


def media_store() -> MediaStore | None:
    global _STORE, _CHOSEN
    if not _CHOSEN:
        _STORE, _CHOSEN = build_media_store(), True
    return _STORE


def set_media_store(store: MediaStore | None) -> None:
    """For tests: use this store (None: back to the environment's)."""
    global _STORE, _CHOSEN
    _STORE, _CHOSEN = store, store is not None


def media_base_url(api_base_url: str) -> str:
    """Where the browser fetches `/media/<key>` from: `MEDIA_BASE_URL` hosted
    (`/media`, the CDN's behaviour); locally the API itself serves them."""
    configured = os.getenv("MEDIA_BASE_URL")
    if configured:
        return configured.rstrip("/")
    return f"{api_base_url.rstrip('/')}/media"


_SERVED_AS = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
    # Only the logos migrated as they were (hazard 3); an upload is never one.
    "svg": "image/svg+xml",
}


def content_type_of(key: str) -> str:
    """The type a stored key is served as, from the extension the check chose."""
    return _SERVED_AS.get(key.rsplit(".", 1)[-1], "application/octet-stream")


def disposition(download_name: str | None) -> str | None:
    """`inline`, with a filename for "save as". Names are slugs, so need no quoting."""
    return f'inline; filename="{download_name}"' if download_name else None
