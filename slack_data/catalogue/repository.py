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

**Edits (phase 3)** go through `apply`: a set of puts, each conditional on the
`rev` the editor read (or on the document not existing yet), plus any id
counters a create advances — all or nothing, or `Conflict`. Hosted, the writer
puts the same conditions into one DynamoDB transaction with the change log
records and the version bump (`changelog/writer.py`).
"""

import json
import sqlite3
from dataclasses import dataclass
from typing import Protocol

from slack_data.catalogue.documents import Document

# `_meta` names: the version, the count of live edits, and one id counter per
# collection (D26).
VERSION_NAME = "version"
# Every committed edit adds one. Once it is above zero the store holds work
# that is in no seed file, and the importer refuses to overwrite it.
EDITS_NAME = "edits"


def counter_name(collection: str) -> str:
    return f"next-id#{collection}"


@dataclass(frozen=True)
class Put:
    document: Document
    # The rev the editor read; None: the document must not exist yet.
    expected_rev: int | None


@dataclass(frozen=True)
class CounterAdvance:
    """Move a collection's next-id counter from `expected` (None: no counter
    yet) to `new`. Conditional, so two creates can never take one id."""

    collection: str
    expected: int | None
    new: int


class Conflict(Exception):
    """A document or counter changed since it was read; nothing was written."""

    def __init__(self, what: str) -> None:
        super().__init__(f"{what} changed since it was read")
        self.what = what


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

    def get(self, collection: str, key: str) -> Document | None:
        """One document, retired or not."""
        ...

    def edits(self) -> int:
        """How many live edits the store has taken (0: it is still the seeds)."""
        ...

    def count_edit(self) -> None:
        ...

    def counter(self, collection: str) -> int | None:
        """The collection's next id, or None before its first create."""
        ...

    def apply(self, puts: list[Put], counters: list[CounterAdvance]) -> None:
        """Every put and counter advance, or none of them (`Conflict`).
        Readers see nothing until `bump_version()`."""
        ...


def check(current: Document | None, put: Put) -> None:
    """The condition every store applies to one put."""
    label = f"{put.document.collection}/{put.document.key}"
    if put.expected_rev is None:
        if current is not None:
            raise Conflict(label)
    elif current is None or current.rev != put.expected_rev:
        raise Conflict(label)


class InMemoryCatalogueRepository:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str], Document] = {}
        self._version = 0
        self._counters: dict[str, int] = {}
        self._edits = 0
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

    def edits(self) -> int:
        return self._edits

    def count_edit(self) -> None:
        self._edits += 1

    def get(self, collection: str, key: str) -> Document | None:
        document = self._items.get((collection, key))
        return document.model_copy(deep=True) if document else None

    def counter(self, collection: str) -> int | None:
        return self._counters.get(collection)

    def apply(self, puts: list[Put], counters: list[CounterAdvance]) -> None:
        for put in puts:
            check(self._items.get((put.document.collection, put.document.key)), put)
        for advance in counters:
            if self._counters.get(advance.collection) != advance.expected:
                raise Conflict(counter_name(advance.collection))
        self.put_many([put.document for put in puts])
        for advance in counters:
            self._counters[advance.collection] = advance.new


_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    key        TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    data       TEXT NOT NULL,
    retired    INTEGER NOT NULL,
    rev        INTEGER NOT NULL DEFAULT 1,
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
            # A store filled before edits existed.
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(documents)")}
            if "rev" not in columns:
                conn.execute("ALTER TABLE documents ADD COLUMN rev INTEGER NOT NULL DEFAULT 1")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    def load(self, include_retired: bool = False) -> list[Document]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM documents").fetchall()
        documents = [self._document(row) for row in rows]
        return [d for d in documents if include_retired or not d.retired]

    @staticmethod
    def _document(row: sqlite3.Row) -> Document:
        return Document(
            collection=row["collection"],
            key=row["key"],
            seq=row["seq"],
            data=json.loads(row["data"]),
            retired=bool(row["retired"]),
            rev=row["rev"],
        )

    @staticmethod
    def _put(conn: sqlite3.Connection, documents: list[Document]) -> None:
        conn.executemany(
            "INSERT OR REPLACE INTO documents (collection, key, seq, data, retired, rev)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (d.collection, d.key, d.seq, json.dumps(d.data, ensure_ascii=False), int(d.retired), d.rev)
                for d in documents
            ],
        )

    def put_many(self, documents: list[Document]) -> None:
        with self._connect() as conn:
            self._put(conn, documents)

    def edits(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE name = ?", (EDITS_NAME,)).fetchone()
        return int(row["value"]) if row else 0

    def count_edit(self) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO meta (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1",
                (EDITS_NAME,),
            )

    def get(self, collection: str, key: str) -> Document | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE collection = ? AND key = ?", (collection, key)
            ).fetchone()
        return self._document(row) if row else None

    def counter(self, collection: str) -> int | None:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE name = ?", (counter_name(collection),)).fetchone()
        return int(row["value"]) if row else None

    def apply(self, puts: list[Put], counters: list[CounterAdvance]) -> None:
        conn = self._connect()
        try:
            # One write transaction, taken before reading: no other writer can
            # move a rev between the check and the put.
            conn.execute("BEGIN IMMEDIATE")
            for put in puts:
                row = conn.execute(
                    "SELECT * FROM documents WHERE collection = ? AND key = ?",
                    (put.document.collection, put.document.key),
                ).fetchone()
                check(self._document(row) if row else None, put)
            for advance in counters:
                row = conn.execute(
                    "SELECT value FROM meta WHERE name = ?", (counter_name(advance.collection),)
                ).fetchone()
                if (int(row["value"]) if row else None) != advance.expected:
                    raise Conflict(counter_name(advance.collection))
            self._put(conn, [put.document for put in puts])
            conn.executemany(
                "INSERT OR REPLACE INTO meta (name, value) VALUES (?, ?)",
                [(counter_name(a.collection), a.new) for a in counters],
            )
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

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
