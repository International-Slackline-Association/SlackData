"""
What the catalogue store holds: the seed files, one entry at a time.

LIVE_EDITING_PLAN.md § 5.1 makes the store hold "what people type": the gear
items, the brands, the ISA certificates and warnings with their match blocks —
exactly what the root `*.json` seeds hold today. So a stored **document** is one
seed entry, verbatim, and nothing derived: `isa_warning`, `isa_certified`,
brand enrichment and the co-listing names are still computed when the
in-memory catalogue is built, by the same loaders as today (§ 5.2, D25). A new
ISA warning therefore cannot leave a stale flag stored on a product.

Each seed file is a **collection**:

| collection | file | entries | key |
|---|---|---|---|
| webbings … connectors | `<name>.json`, a list | each item | its `id` |
| manufacturers | `manufacturers.json`, `{"metadata", "manufacturers": {...}}` | each value of `manufacturers` | its dict key |
| isa_gear_warnings | `{"items": [...]}` | each item | its `id` |
| isa_certified | `{"items": [...]}` | each item | its `cert_id` |

Whatever else a file holds besides its entries (`manufacturers.json`'s
`metadata`) is kept as one **envelope** document per collection, key
`ENVELOPE_KEY`. Each entry also records its position (`seq`), so
`assemble(explode(file)) == file` exactly — `tests/test_catalogue.py` checks
that for every real seed, which is what lets the daily export write files a
checkout can use in place of today's.

A document is never deleted: one that leaves the seeds is **retired**
(`retired = True`) and skipped. The Lambda role grants no `DeleteItem`, and
D20 says nothing is deleted except merged duplicates.
"""

import json
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

ENVELOPE_KEY = "_envelope"


@dataclass(frozen=True)
class Collection:
    name: str
    # The key inside the file holding the entries; None when the file IS the list.
    entries_at: str | None
    # The field identifying an entry; None for a dict of entries (key = dict key).
    key_field: str | None
    # How the file is written, so an exported file is byte-identical to the seed
    # it came from (`render`). manufacturers.json alone uses 2.
    indent: int = 4

    @property
    def filename(self) -> str:
        return f"{self.name}.json"


_LISTS = (
    "webbings", "weblocks", "rollers", "leashrings", "grips",
    "treepros", "starterkits", "tricklinekits", "connectors", "leashes",
)

COLLECTIONS: dict[str, Collection] = {
    **{name: Collection(name, None, "id") for name in _LISTS},
    "manufacturers": Collection("manufacturers", "manufacturers", None, indent=2),
    "isa_gear_warnings": Collection("isa_gear_warnings", "items", "id"),
    "isa_certified": Collection("isa_certified", "items", "cert_id"),
}


class Document(BaseModel):
    collection: str
    key: str
    seq: int = 0
    data: Any
    retired: bool = False
    # The edit-conflict token (D27): every write of a document stores rev + 1,
    # and an edit is refused unless the rev it read is still the stored one.
    # Store-only — not part of the entry, so not in the export.
    rev: int = 1


class DuplicateKey(ValueError):
    """Two entries of one collection share a key — the store would keep one."""


def explode(collection: str, content: Any) -> list[Document]:
    """A seed file's parsed content -> its documents, envelope included."""
    spec = COLLECTIONS[collection]
    if spec.entries_at is None:
        envelope = None
        entries = content
    else:
        envelope = {k: v for k, v in content.items() if k != spec.entries_at}
        envelope["__entries_at"] = spec.entries_at
        # Where the entries sat among the file's other keys, so key order survives.
        envelope["__order"] = list(content.keys())
        entries = content[spec.entries_at]

    if isinstance(entries, dict):
        pairs = [(str(key), value) for key, value in entries.items()]
    else:
        pairs = [(str(entry[spec.key_field]), entry) for entry in entries]

    seen: set[str] = set()
    documents = []
    for seq, (key, data) in enumerate(pairs):
        if key in seen or key == ENVELOPE_KEY:
            raise DuplicateKey(f"{spec.filename}: two entries keyed {key!r}")
        seen.add(key)
        documents.append(Document(collection=collection, key=key, seq=seq, data=data))
    if envelope is not None:
        documents.append(Document(collection=collection, key=ENVELOPE_KEY, seq=-1, data=envelope))
    return documents


def assemble(collection: str, documents: list[Document]) -> Any:
    """Documents -> the seed file's content, exactly as `explode` found it."""
    spec = COLLECTIONS[collection]
    live = [d for d in documents if d.collection == collection and not d.retired]
    envelope = next((d.data for d in live if d.key == ENVELOPE_KEY), None)
    entries = sorted((d for d in live if d.key != ENVELOPE_KEY), key=lambda d: (d.seq, d.key))

    if spec.entries_at is None:
        return [d.data for d in entries]

    body: Any = (
        {d.key: d.data for d in entries} if spec.key_field is None else [d.data for d in entries]
    )
    envelope = dict(envelope or {})
    order = envelope.pop("__order", None) or [spec.entries_at, *envelope]
    envelope.pop("__entries_at", None)
    content = {}
    for key in order:
        content[key] = body if key == spec.entries_at else envelope[key]
    return content


def render(collection: str, content: Any) -> str:
    """The file's text, formatted exactly as the seeds are: so the daily export
    of an unchanged catalogue is byte-identical to the files, and a diff in the
    data repo is a real change."""
    return json.dumps(content, indent=COLLECTIONS[collection].indent, ensure_ascii=False) + "\n"


def assemble_all(documents: list[Document]) -> dict[str, Any]:
    """{filename: content} for every collection — what the loaders read."""
    return {spec.filename: assemble(name, documents) for name, spec in COLLECTIONS.items()}
