"""
The change log store, behind an interface.

**Append-only, in code and in IAM (§ 6.5).** The Protocol has `append` and
reads, and nothing else: no update, no delete. Hosted, the Lambda role also
carries an explicit deny of `UpdateItem`, `DeleteItem`, `BatchWriteItem` and the
PartiQL writes on this table (`ChangelogIsAppendOnly`, D43). What IAM cannot
stop is a `PutItem` that overwrites an existing id — so every append here is
conditional on the id being new, and refuses (`RecordExists`) otherwise.

Same shape as the other stores: in-memory for tests, SQLite for local dev,
DynamoDB in `dynamo.py`.
"""

import json
import sqlite3
from typing import Protocol

from slack_data.models.changes import ChangeRecord, TargetType, target_key

MAX_PAGE = 100


class RecordExists(Exception):
    """An append whose id is already in the log. Never an overwrite."""


class ChangeLogRepository(Protocol):
    def append(self, record: ChangeRecord) -> ChangeRecord:
        """Add a record. Raises `RecordExists` rather than replace one."""
        ...

    def recent(self, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        """Newest first; `before` (a record id) pages backwards."""
        ...

    def for_target(
        self, target_type: TargetType, target_id: str, limit: int = 50
    ) -> list[ChangeRecord]:
        """Everything that happened to one thing, newest first — its History."""
        ...


class InMemoryChangeLogRepository:
    def __init__(self) -> None:
        self._items: dict[str, ChangeRecord] = {}

    def append(self, record: ChangeRecord) -> ChangeRecord:
        if record.id in self._items:
            raise RecordExists(record.id)
        self._items[record.id] = record
        return record

    def _newest_first(self) -> list[ChangeRecord]:
        return sorted(self._items.values(), key=lambda r: r.id, reverse=True)

    def recent(self, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        rows = [r for r in self._newest_first() if before is None or r.id < before]
        return rows[:limit]

    def for_target(
        self, target_type: TargetType, target_id: str, limit: int = 50
    ) -> list[ChangeRecord]:
        key = target_key(target_type, target_id)
        return [r for r in self._newest_first() if r.target == key][:limit]


_SCHEMA = """
CREATE TABLE IF NOT EXISTS changes (
    id           TEXT PRIMARY KEY,
    target       TEXT NOT NULL,
    target_type  TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    action       TEXT NOT NULL,
    actor_sub    TEXT NOT NULL,
    actor_isa_id TEXT NOT NULL,
    actor_role   TEXT NOT NULL,
    channel      TEXT NOT NULL,
    changes      TEXT NOT NULL,
    why          TEXT,
    flags        TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_target ON changes (target, id);
"""


class SqliteChangeLogRepository:
    """Local dev: a SQLite file of its own. Plain `INSERT`, never
    `INSERT OR REPLACE` — the primary key refuses an overwrite."""

    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _from_row(row: sqlite3.Row) -> ChangeRecord:
        data = dict(row)
        data.pop("target")
        data["changes"] = ChangeRecord.parse_changes(data["changes"])
        data["flags"] = json.loads(data["flags"])
        return ChangeRecord(**data)

    def append(self, record: ChangeRecord) -> ChangeRecord:
        row = record.model_dump(mode="json")
        row["target"] = record.target
        row["changes"] = record.changes_json()
        row["flags"] = json.dumps(record.flags)
        columns = ", ".join(row)
        placeholders = ", ".join(f":{name}" for name in row)
        try:
            with self._connect() as conn:
                conn.execute(f"INSERT INTO changes ({columns}) VALUES ({placeholders})", row)
        except sqlite3.IntegrityError as error:
            raise RecordExists(record.id) from error
        return record

    def recent(self, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        with self._connect() as conn:
            if before is None:
                rows = conn.execute(
                    "SELECT * FROM changes ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM changes WHERE id < ? ORDER BY id DESC LIMIT ?", (before, limit)
                ).fetchall()
        return [self._from_row(row) for row in rows]

    def for_target(
        self, target_type: TargetType, target_id: str, limit: int = 50
    ) -> list[ChangeRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM changes WHERE target = ? ORDER BY id DESC LIMIT ?",
                (target_key(target_type, target_id), limit),
            ).fetchall()
        return [self._from_row(row) for row in rows]
