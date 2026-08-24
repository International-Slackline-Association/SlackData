"""
The brand-client store, behind an interface.

Same shape and same reasoning as `slack_data/submissions/repository.py`, and
deliberately so — one pattern for "a writable store that is not the catalogue"
is easier to keep right than two. **Nothing outside this package and
`submissions/` imports boto3**, which is what keeps pytest and Cypress runnable
with no AWS credentials and boto3 not installed at all.

There is no `delete`. Revoking a brand's access is `active = False`, for the
same two reasons submissions are append-only: the hosted IAM role is granted no
`dynamodb:DeleteItem`, and a credential that vanished would leave the
submissions it created unattributable.
"""

import json
import sqlite3
from typing import Protocol

from slack_data.models.brand_clients import BrandClient


class BrandClientRepository(Protocol):
    """What the auth layer may do to the store — and, by omission, what it may not."""

    def get(self, client_id: str) -> BrandClient | None:
        """One client, or None. Called on **every** authenticated request."""
        ...

    def put(self, client: BrandClient) -> BrandClient:
        """Create or replace. Registration and deactivation are both this."""
        ...

    def list_for_brand(self, brand_id: int) -> list[BrandClient]:
        """Every client registered for one brand — for the admin, and for audit."""
        ...


class InMemoryBrandClientRepository:
    """For tests, and for a Cypress run that wants a clean slate per spec."""

    def __init__(self, clients: list[BrandClient] | None = None) -> None:
        self._items: dict[str, BrandClient] = {c.client_id: c for c in clients or []}

    def get(self, client_id: str) -> BrandClient | None:
        return self._items.get(client_id)

    def put(self, client: BrandClient) -> BrandClient:
        self._items[client.client_id] = client
        return client

    def list_for_brand(self, brand_id: int) -> list[BrandClient]:
        return sorted(
            (c for c in self._items.values() if c.brand_id == brand_id),
            key=lambda c: c.client_id,
        )


_SCHEMA = """
CREATE TABLE IF NOT EXISTS brand_clients (
    client_id     TEXT PRIMARY KEY,
    brand_id      INTEGER NOT NULL,
    brand_name    TEXT NOT NULL,
    permissions   TEXT NOT NULL,
    contact_email TEXT,
    active        INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    note          TEXT
);
CREATE INDEX IF NOT EXISTS brand_clients_brand ON brand_clients (brand_id);
"""

# Columns added after the first release. Empty today; kept so the next person
# adds one here rather than discovering that CREATE TABLE IF NOT EXISTS did
# nothing to their existing file. See the submissions repository for the same
# machinery and the reason it is not "just delete the database".
_ADDED_COLUMNS: dict[str, str] = {}


class SqliteBrandClientRepository:
    """Local dev: a SQLite file of its own, never the catalogue database.

    Shares a file with nothing else, including submissions — a credential store
    and a suggestion box have different backup and retention answers, and
    hosted they really are two separate tables.

    Connections are opened per call rather than held: FastAPI serves requests on
    a threadpool, and a shared sqlite3 connection across threads is an error.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            existing = {row[1] for row in conn.execute("PRAGMA table_info(brand_clients)")}
            for column, ddl in _ADDED_COLUMNS.items():
                if column not in existing:
                    conn.execute(f"ALTER TABLE brand_clients ADD COLUMN {column} {ddl}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _to_row(client: BrandClient) -> dict:
        row = client.model_dump(mode="json")
        row["permissions"] = json.dumps(row["permissions"])
        row["active"] = 1 if row["active"] else 0
        return row

    @staticmethod
    def _from_row(row: sqlite3.Row) -> BrandClient:
        data = dict(row)
        data["permissions"] = json.loads(data["permissions"])
        data["active"] = bool(data["active"])
        return BrandClient(**data)

    def get(self, client_id: str) -> BrandClient | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM brand_clients WHERE client_id = ?", (client_id,)
            ).fetchone()
        return self._from_row(row) if row else None

    def put(self, client: BrandClient) -> BrandClient:
        row = self._to_row(client)
        columns = ", ".join(row)
        placeholders = ", ".join(f":{name}" for name in row)
        with self._connect() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO brand_clients ({columns}) VALUES ({placeholders})",
                row,
            )
        return client

    def list_for_brand(self, brand_id: int) -> list[BrandClient]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM brand_clients WHERE brand_id = ? ORDER BY client_id ASC",
                (brand_id,),
            ).fetchall()
        return [self._from_row(row) for row in rows]
