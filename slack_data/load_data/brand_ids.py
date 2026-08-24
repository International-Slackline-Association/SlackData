"""Stable `Brand` ids, read from `manufacturers.json`.

A brand's id used to be whatever SQLite handed `get_brand()` when it created the
row — which made it a record of *which gear file mentioned that brand first*.
Re-order the seed loads, or add a webbing for a brand we previously only sold
grips for, and the numbering moves. Nothing in the catalogue notices, but a
manufacturer credential registered against `brand_id=12` then speaks for whoever
now holds 12, which is why `manufacturers/matching.py` carries `verify_brand()`
and a `BrandMismatch` 503.

So the id lives in `manufacturers.json` instead, as `catalog_id` — written once
by `scripts/backfill_seed_ids.py` from the ids already in use, and thereafter
just a number in a file that a diff can show changing. Every entry has one,
including the twenty manufacturers we hold no gear for: their id is decided
before their first product arrives rather than by where that product is filed.

**The read is lazy on purpose.** `models/brands.py` imports this module, and
that import chain reaches the hosted Lambda — which bakes `database.db` into the
image and does not necessarily ship the root seed `*.json`. Nothing here touches
the filesystem until someone actually loads data, which only ever happens where
the seeds exist.
"""

from slack_data.load_data._seed_io import read_seed_json
from slack_data.utilities.brand_aliases import canonical_brand

# canonical brand name -> catalog_id. Filled on first use, never invalidated —
# a load runs against one revision of the seeds.
_CATALOG_IDS: dict[str, int] | None = None


class UnknownBrand(KeyError):
    """A gear seed names a brand `manufacturers.json` does not list.

    Raised rather than falling back to autoincrement: a silent fallback would
    reintroduce exactly the positional id this module exists to remove, and it
    would do it on the one path nobody is watching — the first product from a
    manufacturer we have never carried.
    """


def _catalog_ids() -> dict[str, int]:
    global _CATALOG_IDS
    if _CATALOG_IDS is None:
        entries = read_seed_json("manufacturers.json")["manufacturers"].values()
        ids: dict[str, int] = {}
        for entry in entries:
            catalog_id = entry.get("catalog_id")
            if catalog_id is None:
                continue
            ids[canonical_brand(str(entry.get("name")))] = int(catalog_id)
        _CATALOG_IDS = ids
    return _CATALOG_IDS


def brand_catalog_id(name: str) -> int:
    """The stable id for a brand name, in any of its spellings.

    `name` is canonicalized first, so "BalanceCommunity" and "Balance Community:
    Slackline Outfitters" resolve to the same number — the same folding
    `get_brand()` applies before it looks the row up.
    """
    canonical = canonical_brand(str(name))
    try:
        return _catalog_ids()[canonical]
    except KeyError:
        raise UnknownBrand(
            f"{canonical!r} has no catalog_id in manufacturers.json."
            " Add an entry for it, then run scripts/backfill_seed_ids.py."
        ) from None
