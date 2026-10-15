"""
Why an item id answers 404: merged into another (P3-E).

A merged duplicate stays in the seed (`load_gear.is_listed`) but no row is
built from it, so the gear routes miss it like any unknown id. This tells the
404 where it went, so a bookmark explains itself and the site goes to the
survivor. (Hiding an item was dropped: D81.)

| mode | where the entry is read |
|---|---|
| store (`CATALOG_SOURCE=store`) | the documents the live catalogue was built from |
| local, no store | the root seed file |
| hosted, baked catalogue | nowhere: a plain 404, as before phase 3 |
"""

from typing import Any

from slack_data.load_data.load_gear import GEAR, MERGED_KEY, is_listed


def unlisted(collection: str, item_id: int) -> dict[str, Any] | None:
    """{"merged_into": N} for a merged duplicate, else None."""
    if collection not in GEAR:
        return None
    entry = _entry(collection, item_id)
    if entry is None or is_listed(entry):
        return None
    return {"merged_into": entry[MERGED_KEY]}


def _entry(collection: str, item_id: int) -> dict | None:
    from slack_data import database
    from slack_data.deployment import is_hosted

    live = database.LIVE_CATALOGUE
    if live is not None:
        live.engine()
        key = str(item_id)
        return next((d.data for d in live.documents if d.collection == collection and d.key == key), None)
    if is_hosted():
        return None
    from slack_data.load_data._seed_io import read_seed_json

    try:
        entries = read_seed_json(f"{collection}.json")
    except FileNotFoundError:
        return None
    return next((e for e in entries if e.get("id") == item_id), None)
