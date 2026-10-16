"""
The current name of whatever a change log record is about — looked up when the
log is read, never stored in it (D43), exactly as the actor's name is.

A record names its target by id (`webbings#54`, a brand's `catalog_id`), which
is stable; a name is not, and the log must not go stale when an item is
renamed. So the public log shows each target as it is called **now**, and a
rename shows as one (the record's own `name` change says from what).

| mode | where the names come from |
|---|---|
| store (`CATALOG_SOURCE=store`) | the documents the live catalogue was built from |
| local, no store | the root seed files |
| hosted, baked catalogue | nowhere: no names, and the log shows ids as before |
"""

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.models.changes import TargetType

BRANDS = "manufacturers"


def _documents() -> list[Document] | None:
    from slack_data import database
    from slack_data.deployment import is_hosted

    live = database.LIVE_CATALOGUE
    if live is not None:
        live.engine()  # the version the next page shows
        return live.documents
    if is_hosted():
        return None
    from slack_data.catalogue.build import sources_from_files
    from slack_data.catalogue.documents import COLLECTIONS, explode

    sources = sources_from_files()
    return [d for name, spec in COLLECTIONS.items() for d in explode(name, sources[spec.filename])]


ISA_COLLECTIONS = {"isa_certified": TargetType.ISA_CERTIFICATE, "isa_gear_warnings": TargetType.ISA_WARNING}


def isa_name(collection: str, data: dict) -> str | None:
    """How an ISA entry reads in the log: the product as the ISA names it, and
    the certificate number or the kind of warning."""
    product = " ".join(str(data[k]) for k in ("manufacturer", "model") if data.get(k))
    tag = data.get("certificate") if collection == "isa_certified" else data.get("status")
    if not product:
        return tag
    return f"{product} ({tag})" if tag else product


class TargetNames:
    """Item, brand and ISA entry names, read once per request."""

    def __init__(self) -> None:
        self._items: dict[str, str] | None = None
        self._brands: dict[str, str] = {}
        self._isa: dict[tuple[TargetType, str], str] = {}

    def _load(self) -> None:
        self._items = {}
        for document in _documents() or []:
            if document.key == ENVELOPE_KEY or not isinstance(document.data, dict):
                continue
            if document.collection in ISA_COLLECTIONS:
                label = isa_name(document.collection, document.data)
                if label:
                    self._isa[(ISA_COLLECTIONS[document.collection], document.key)] = label
                continue
            name = document.data.get("name")
            if not isinstance(name, str):
                continue
            if document.collection == BRANDS:
                if document.data.get("catalog_id") is not None:
                    self._brands[str(document.data["catalog_id"])] = name
            else:
                self._items[f"{document.collection}#{document.key}"] = name

    def name(self, target_type: TargetType, target_id: str) -> str | None:
        """The target's current name, or None (a person's comes from the
        people store; an id the catalogue no longer holds has none)."""
        if target_type is TargetType.PERSON:
            return None
        if self._items is None:
            self._load()
        if target_type in (TargetType.ISA_WARNING, TargetType.ISA_CERTIFICATE):
            return self._isa.get((target_type, target_id))
        if target_type is TargetType.BRAND:
            return self._brands.get(target_id)
        return self._items.get(target_id)
