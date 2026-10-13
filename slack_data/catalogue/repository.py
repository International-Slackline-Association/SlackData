"""
The catalogue store, behind an interface — the same pattern as the
submissions, brand-client, people and change log stores.

| implementation | used by |
|---|---|
| `InMemoryCatalogueRepository` | tests |
| `SqliteCatalogueRepository` | local dev in store mode, and the live-server tests (D34: no AWS needed) |
| `DynamoCatalogueRepository` (`dynamo.py`) | hosted |

**The version.** Every write that should reach readers ends with
`bump_version()`, and every request compares the stored version with the one
its in-memory catalogue was built from, rebuilding when they differ (D30). An
edit is therefore visible on the next request, everywhere, and a request that
changes nothing costs one tiny read.

No `delete`: a document that leaves the catalogue is `retired` (documents.py).
"""

import json
import sqlite3
from typing import Protocol

from slack_data.catalogue.documents import Document


class CatalogueRepository(Protocol):
    def load(self, include_retired: bool = False) -> list[Document]:
        """Every document of every collection."""
        ...

    def put_many(self, documents: list[Document]) -> None:
        """Create or replace each document. Readers see nothing until
        `bump_version()`."""
        ...

    def version(self) -> int:
        """The catalogue version — 0 for a store never written."""
        ...

    def bump_version(self) -> int:
        """Increment and return the version, atomically."""
        ...


class InMemoryCatalogueRepository:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str], Document] = {}
        self._version = 0
        self.loads = 0  # for tests: how often the whole catalogue was read

    def load(self, include_retired: bool = False) -> list[Document]:
        self.loads += 1
        return [d.model_copy(deep=True) for d in self._items.values() if include_retired or not d.retired]

    def put_many(self, documents: list[Document]) -> None:
        for document in documents:
            self._items[(document.collection, document.key)] = document.model_copy(deep=True)

    def version(self) -> int:
        return self._version

    def bump_version(self) -> int:
        self._version += 1
        return self._version


_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    key        TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    data       TEXT NOT NULL,
    retired    INTEGER NOT NULL,
    PRIMARY KEY (collection, key)
);
CREATE TABLE IF NOT EXISTS meta (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);
"""


class SqliteCatalogueRepository:
    """A SQLite file of its own — never the catalogue database the site reads,
    which is built in memory from this one."""

    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    def load(self, include_retired: bool = False) -> list[Document]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM documents").fetchall()
        documents = [
            Document(
                collection=row["collection"],
                key=row["key"],
                seq=row["seq"],
                data=json.loads(row["data"]),
                retired=bool(row["retired"]),
            )
            for row in rows
        ]
        return [d for d in documents if include_retired or not d.retired]

    def put_many(self, documents: list[Document]) -> None:
        with self._connect() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO documents (collection, key, seq, data, retired)"
                " VALUES (?, ?, ?, ?, ?)",
                [
                    (d.collection, d.key, d.seq, json.dumps(d.data, ensure_ascii=False), int(d.retired))
                    for d in documents
                ],
            )

    def version(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE name = 'version'").fetchone()
        return int(row["value"]) if row else 0

    def bump_version(self) -> int:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO meta (name, value) VALUES ('version', 1)"
                " ON CONFLICT(name) DO UPDATE SET value = value + 1"
            )
            return int(conn.execute("SELECT value FROM meta WHERE name = 'version'").fetchone()[0])
