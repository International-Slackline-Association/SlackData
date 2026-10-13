"""Shared plumbing for the per-gear-type loaders.

Three things every loader was repeating verbatim:

* `Path(__file__).parent.parent.parent / "<type>s.json"` — ten copies of the
  same walk up out of the package to the repo root.
* "does it exist / open it / json.load it", wrapped in a `FileNotFoundError`
  whose message was the only thing that varied between copies.
* Coercing a JSON boolean that might arrive as `true`, `"true"`, `""` or absent
  into a real `bool`, which four loaders each spelled slightly differently.

None of this is per-gear-type knowledge, so none of it belongs in a loader. The
mapping of JSON keys onto model fields — the part that genuinely differs per
type, and the part with the traps in it (`priceMeter`, rollers' `price_unit`) —
stays in the loaders where it can be read next to the data it describes.
"""

import copy
import json
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# The repo root, where the seed `*.json` live: slack_data/load_data/ -> up three.
SEED_DIR = Path(__file__).parent.parent.parent

# Strings a JSON seed uses for "yes". Anything else truthy-but-unlisted is a
# typo we would rather see as False than silently accept.
_TRUTHY = frozenset({"true", "1", "yes"})


def seed_path(filename: str) -> Path:
    """The absolute path to a seed file at the repo root."""
    return SEED_DIR / filename


# {filename: parsed content} while a load reads from the catalogue store rather
# than from the files (LIVE_EDITING_PLAN.md § 5.2). None: read the files.
_SOURCES: dict[str, Any] | None = None


@contextmanager
def seed_sources(sources: dict[str, Any]) -> Iterator[None]:
    """Make every `read_seed_json` in this block answer from `sources`.

    How the in-memory catalogue is built from the store with the loaders
    unchanged: they still ask for "webbings.json", and get the store's
    documents assembled into exactly that file's shape
    (`slack_data/catalogue/documents.py`). Each read is a deep copy, because
    several `clean_*_data()` passes edit what they are given in place.
    """
    from slack_data.load_data import brand_ids

    global _SOURCES
    previous = _SOURCES
    _SOURCES = sources
    brand_ids.reset()
    try:
        yield
    finally:
        _SOURCES = previous
        brand_ids.reset()


def read_seed_json(filename: str) -> Any:
    """Parse a seed file at the repo root, or raise with the path that is missing.

    Inside `seed_sources(...)`, the store's copy of that file instead.
    """
    if _SOURCES is not None:
        if filename not in _SOURCES:
            raise FileNotFoundError(f"Seed {filename} is not in the catalogue store")
        return copy.deepcopy(_SOURCES[filename])
    path = seed_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"Seed file not found: {path}")
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def to_bool(value: Any, default: bool = False) -> bool:
    """A JSON seed's loose boolean as a real one.

    `None` and `""` mean "not recorded" and give `default`; a string is matched
    against the spellings the seeds actually use; anything else falls back to
    Python truthiness.
    """
    if value is None or value == "":
        return default
    if isinstance(value, str):
        return value.strip().lower() in _TRUTHY
    return bool(value)


def require_seed_id(item: dict, filename: str) -> int:
    """The item's explicit `id`, or a loud failure.

    Gear ids used to be SQLite autoincrements, i.e. a statement about where an
    item sat in its file: insert one product mid-file and every id after it
    shifted, silently re-pointing ISA warning matches, brand credentials,
    submitted corrections and bookmarked links. The id now lives in the seed, and
    the loaders assign it rather than letting the database choose.

    Missing is a hard error, never a fallback to autoincrement — a fallback would
    put the old behaviour back on the one path nobody watches, the freshly
    appended item.

    A digit string is accepted because several `clean_*_data()` passes coerce
    unrecognised values with `str()`; that is their job, and re-teaching eight of
    them about one key is more moving parts than reading the number back.
    """
    value = item.get("id")
    if isinstance(value, bool):  # `bool` is an `int` in Python; `true` is not an id.
        value = None
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value)
    if not isinstance(value, int) or value < 1:
        raise ValueError(
            # `raw_name` is what clean_weblock_data() calls it.
            f"{filename}: {item.get('name') or item.get('raw_name')!r}"
            f' has no valid "id" ({value!r}).'
            " Run scripts/backfill_seed_ids.py to give it one."
        )
    return value
