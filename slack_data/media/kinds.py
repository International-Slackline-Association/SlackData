"""
What a media file may be, decided from its bytes (LIVE_EDITING_PHASE_4.md § 3,
hazard 3).

Media is served from the site's own origin (`slackdata.org/media/…`, D48), so a
file that a browser would run — an SVG, an HTML page — would run as SlackData.
Only JPEG, PNG, WebP and PDF are accepted, and the type is read from the file's
first bytes, never from its name or the content type the browser claimed. The
key a file is published under takes its extension from this check, and so does
the `Content-Type` it is served with.

| purpose | what | limit (the processed file) |
|---|---|---|
| `photo` | JPEG, PNG, WebP: one size of a product photo, resized in the browser (D44) | 5 MB |
| `logo` | JPEG, PNG, WebP: a brand's logo | 2 MB |
| `manual` | PDF | 25 MB (D45) |

A photo's 10 MB limit in D45 is on the file the editor picks; the browser
refuses it before resizing. What reaches the server is the resized copy, which
at 1600 px is far smaller, so the server's limit is on that.
"""

from dataclasses import dataclass
from enum import Enum

MB = 1024 * 1024

# The two sizes every photo is stored at, on the long edge (P4-D). Cards show
# the small one first and swap in the large one once it has loaded.
SMALL_PX = 480
LARGE_PX = 1600


class Purpose(str, Enum):
    PHOTO = "photo"
    LOGO = "logo"
    MANUAL = "manual"


@dataclass(frozen=True)
class FileType:
    content_type: str
    extension: str


JPEG = FileType("image/jpeg", "jpg")
PNG = FileType("image/png", "png")
WEBP = FileType("image/webp", "webp")
PDF = FileType("application/pdf", "pdf")

IMAGE_TYPES = (JPEG, PNG, WEBP)

ALLOWED: dict[Purpose, tuple[FileType, ...]] = {
    Purpose.PHOTO: IMAGE_TYPES,
    Purpose.LOGO: IMAGE_TYPES,
    Purpose.MANUAL: (PDF,),
}

MAX_BYTES: dict[Purpose, int] = {
    Purpose.PHOTO: 5 * MB,
    Purpose.LOGO: 2 * MB,
    Purpose.MANUAL: 25 * MB,
}

# How many leading bytes `sniff` needs.
HEAD_BYTES = 16


def sniff(data: bytes) -> FileType | None:
    """The type these bytes are, or None if they are none we accept."""
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return WEBP
    if data.startswith(b"%PDF-"):
        return PDF
    return None


def by_content_type(content_type: str) -> FileType | None:
    return next((t for t in (*IMAGE_TYPES, PDF) if t.content_type == content_type), None)


class Rejected(ValueError):
    """A file that is not what its purpose allows. The message is for the editor."""


def check(purpose: Purpose, head: bytes, size: int) -> FileType:
    """The file's type, or `Rejected`."""
    kind = sniff(head)
    allowed = ALLOWED[purpose]
    if kind not in allowed:
        names = " or ".join(t.extension.upper() for t in allowed)
        raise Rejected(f"not a {names} file")
    if size <= 0:
        raise Rejected("the file is empty")
    if size > MAX_BYTES[purpose]:
        raise Rejected(f"over the {MAX_BYTES[purpose] // MB} MB limit for a {purpose.value}")
    return kind
