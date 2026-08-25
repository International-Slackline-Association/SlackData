"""
The submission store, behind an interface.

**Nothing outside this package imports boto3.** The routers talk to a
`SubmissionRepository`, and which implementation answers is an environment
decision made in `store.py`.

That is not architectural purity — it is what keeps `pytest` and the Cypress
suite runnable with no AWS credentials and no network, which is how every
existing test in this repo works. A router that reached for a DynamoDB client
directly would take the whole feedback loop offline with it.

Two implementations live here; the DynamoDB one is in `dynamo.py`, imported
lazily so that a machine without boto3 can still run the suite.
"""

import json
import sqlite3
from typing import Protocol

from slack_data.models.submissions import (
    Submission,
    SubmissionStatus,
    expiry_for,
    now_iso,
)


class SubmissionRepository(Protocol):
    """What the routers may do to the store — and, by omission, what they may not.

    There is no `delete`. Submissions are append-only: a review is a status
    update, and expiry is the store's own TTL. The hosted IAM role grants no
    `dynamodb:DeleteItem` either, so this is enforced in two places.
    """

    def create(self, submission: Submission) -> Submission:
        """Store a new record and return it."""
        ...

    def get(self, submission_id: str) -> Submission | None:
        """One record, or None if there is no such id."""
        ...

    def list_by_status(self, status: SubmissionStatus, limit: int = 50) -> list[Submission]:
        """Records with this status, **oldest first** — the triage order."""
        ...

    def list_for_brand(
        self, brand_id: int, batch_id: str | None = None, limit: int = 50
    ) -> list[Submission]:
        """One brand's own submissions, **newest first** — the read-back.

        The opposite order to `list_by_status`, deliberately: triage is a queue
        and wants the oldest, while a brand asking "did my last batch land?"
        wants the last one. Both sort on a ULID, so both are exact.

        Scoped by `brand_id` alone; `batch_id` narrows to one call, which is
        what the 502 partial-batch message needs, since it names a batch and
        nothing else. Public submissions carry neither attribute and are
        therefore absent from the index this reads, rather than filtered out of
        it — see MANUFACTURER_API_PLAN.md § Reading their own submissions back.
        """
        ...

    def review(
        self, submission_id: str, status: SubmissionStatus, review_note: str | None
    ) -> Submission | None:
        """Set the outcome, and re-stamp the TTL to match it.

        The TTL is not incidental here: `APPROVED` clears it, because a
        correction we have agreed with but not yet shipped must not expire with
        the work outstanding. See `expiry_for`. Returns None if there is no
        such id.
        """
        ...


class InMemorySubmissionRepository:
    """For tests, and for a Cypress run that wants a clean slate per spec."""

    def __init__(self) -> None:
        self._items: dict[str, Submission] = {}

    def create(self, submission: Submission) -> Submission:
        self._items[submission.submission_id] = submission
        return submission

    def get(self, submission_id: str) -> Submission | None:
        return self._items.get(submission_id)

    def list_by_status(self, status: SubmissionStatus, limit: int = 50) -> list[Submission]:
        matching = [s for s in self._items.values() if s.status is status]
        # The id is a ULID, so sorting by it *is* sorting by creation time — and
        # unlike created_at (second precision) it never ties.
        matching.sort(key=lambda s: s.submission_id)
        return matching[:limit]

    def list_for_brand(
        self, brand_id: int, batch_id: str | None = None, limit: int = 50
    ) -> list[Submission]:
        mine = [
            s
            for s in self._items.values()
            if s.brand_id == brand_id and (batch_id is None or s.batch_id == batch_id)
        ]
        mine.sort(key=lambda s: s.submission_id, reverse=True)  # newest first
        return mine[:limit]

    def review(
        self, submission_id: str, status: SubmissionStatus, review_note: str | None
    ) -> Submission | None:
        existing = self._items.get(submission_id)
        if existing is None:
            return None
        reviewed = existing.model_copy(
            update={
                "status": status,
                "review_note": review_note,
                "reviewed_at": now_iso(),
                "expires_at": expiry_for(status),
            }
        )
        self._items[submission_id] = reviewed
        return reviewed


_SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
    submission_id   TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    gear_type       TEXT NOT NULL,
    gear_id         INTEGER,
    gear_name       TEXT,
    gear_brand      TEXT,
    changes         TEXT NOT NULL,
    note            TEXT,
    source_url      TEXT,
    submitter_email TEXT,
    submitted_by    TEXT,
    brand_id        INTEGER,
    batch_id        TEXT,
    manufacturer_sku TEXT,
    status          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    reviewed_at     TEXT,
    review_note     TEXT,
    expires_at      INTEGER
);
CREATE INDEX IF NOT EXISTS submissions_status_created
    ON submissions (status, submission_id);
"""

# Indexes over columns in `_ADDED_COLUMNS`, created **after** those columns are
# backfilled rather than in `_SCHEMA`. On a file that predates them, the DDL in
# `_SCHEMA` runs first and would fail with "no such column: brand_id" — which is
# every developer machine that has run this before, and would take the whole
# local store down rather than just the new query.
#
# This one is the local twin of the `brand_id-batch_id-index` GSI in
# infra/serverless.yml. Rows with a null brand_id (the public suggestion box)
# still occupy a SQLite index, unlike DynamoDB's sparse GSI — the query filters
# on brand_id regardless, so the two return the same answer by different means.
_LATE_INDEXES = """
CREATE INDEX IF NOT EXISTS submissions_brand_batch
    ON submissions (brand_id, batch_id, submission_id);
"""


# Columns added after the first release, applied to existing files on open.
# Keep in step with _SCHEMA above; every entry must be nullable, because rows
# that predate the column cannot have a value for it.
_ADDED_COLUMNS: dict[str, str] = {
    "gear_brand": "TEXT",
    # Phase 4 (the manufacturer API). Every existing row predates all three and
    # is correctly null for them: nothing before Phase 4 was sent by a brand.
    "brand_id": "INTEGER",
    "batch_id": "TEXT",
    "manufacturer_sku": "TEXT",
}


class SqliteSubmissionRepository:
    """Local dev: a SQLite file of its own, never the catalogue database.

    Separate on purpose. The catalogue is generated from git and thrown away
    whenever the seed JSON changes (`rm database.db`); submissions are the one
    thing in this app a person typed and cannot regenerate. Keeping them in
    their own file means the standard re-seed doesn't destroy them, and it keeps
    the deployed shape honest — hosted, they really are two different stores.

    Connections are opened per call rather than held: FastAPI serves requests on
    a threadpool, and a shared sqlite3 connection across threads is an error.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            self._add_missing_columns(conn)
            # Only now are the columns guaranteed to exist. See _LATE_INDEXES.
            conn.executescript(_LATE_INDEXES)

    @staticmethod
    def _add_missing_columns(conn: sqlite3.Connection) -> None:
        """Bring an existing file up to the current schema.

        `CREATE TABLE IF NOT EXISTS` is a no-op on a file that already has the
        table, so a new field would otherwise fail at INSERT with "no column
        named ..." on every developer machine that has run this before. The
        catalogue's answer to that is "delete the database and re-seed", and it
        is the wrong answer here: submissions are the one thing in this app that
        cannot be regenerated.

        Only additive changes are handled, which is all the model has ever
        needed. Hosted is DynamoDB and schemaless, so none of this applies there.
        """
        existing = {row[1] for row in conn.execute("PRAGMA table_info(submissions)")}
        for column, ddl in _ADDED_COLUMNS.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE submissions ADD COLUMN {column} {ddl}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _to_row(submission: Submission) -> dict:
        row = submission.model_dump(mode="json")
        row["changes"] = json.dumps(row["changes"])
        return row

    @staticmethod
    def _from_row(row: sqlite3.Row) -> Submission:
        data = dict(row)
        data["changes"] = json.loads(data["changes"])
        return Submission(**data)

    def create(self, submission: Submission) -> Submission:
        row = self._to_row(submission)
        columns = ", ".join(row)
        placeholders = ", ".join(f":{name}" for name in row)
        with self._connect() as conn:
            conn.execute(f"INSERT INTO submissions ({columns}) VALUES ({placeholders})", row)
        return submission

    def get(self, submission_id: str) -> Submission | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM submissions WHERE submission_id = ?", (submission_id,)
            ).fetchone()
        return self._from_row(row) if row else None

    def list_by_status(self, status: SubmissionStatus, limit: int = 50) -> list[Submission]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM submissions WHERE status = ?"
                " ORDER BY submission_id ASC LIMIT ?",
                (status.value, limit),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def list_for_brand(
        self, brand_id: int, batch_id: str | None = None, limit: int = 50
    ) -> list[Submission]:
        clause = "WHERE brand_id = ?" + (" AND batch_id = ?" if batch_id else "")
        params = [brand_id] + ([batch_id] if batch_id else []) + [limit]
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM submissions {clause}"
                " ORDER BY submission_id DESC LIMIT ?",
                params,
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def review(
        self, submission_id: str, status: SubmissionStatus, review_note: str | None
    ) -> Submission | None:
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE submissions SET status = ?, review_note = ?, reviewed_at = ?,"
                " expires_at = ? WHERE submission_id = ?",
                (status.value, review_note, now_iso(), expiry_for(status), submission_id),
            )
            if cursor.rowcount == 0:
                return None
        return self.get(submission_id)
