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

import json
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


def read_seed_json(filename: str) -> Any:
    """Parse a seed file at the repo root, or raise with the path that is missing."""
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
