"""
The brand-request store, behind an interface — the same pattern as every other
store (people, change log, submissions).

| implementation | used by |
|---|---|
| `InMemoryBrandRequestRepository` | tests |
| `SqliteBrandRequestRepository` | local dev (`BRAND_REQUESTS_DB_PATH`) |
| `DynamoBrandRequestRepository` (`dynamo.py`) | hosted (`BRAND_REQUESTS_TABLE`) |

No delete: a decided request stays, with who decided it and when.
"""

import sqlite3
from typing import Protocol

from slack_data.models.brand_requests import BrandRequest, RequestStatus


class BrandRequestRepository(Protocol):
    def put(self, request: BrandRequest) -> BrandRequest:
        ...

    def get(self, request_id: str) -> BrandRequest | None:
        ...

    def with_status(self, status: RequestStatus, limit: int = 100) -> list[BrandRequest]:
        """Oldest first: the queue."""
        ...

    def for_person(self, sub: str) -> list[BrandRequest]:
        """Newest first."""
        ...


class InMemoryBrandRequestRepository:
    def __init__(self) -> None:
        self._items: dict[str, BrandRequest] = {}

    def put(self, request: BrandRequest) -> BrandRequest:
        self._items[request.request_id] = request.model_copy(deep=True)
        return request

    def get(self, request_id: str) -> BrandRequest | None:
        found = self._items.get(request_id)
        return found.model_copy(deep=True) if found else None

    def with_status(self, status: RequestStatus, limit: int = 100) -> list[BrandRequest]:
        return sorted((r for r in self._items.values() if r.status == status), key=lambda r: r.request_id)[:limit]

    def for_person(self, sub: str) -> list[BrandRequest]:
        return sorted((r for r in self._items.values() if r.sub == sub), key=lambda r: r.request_id, reverse=True)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS brand_requests (
    request_id TEXT PRIMARY KEY,
    sub        TEXT NOT NULL,
    status     TEXT NOT NULL,
    data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS brand_requests_status ON brand_requests (status, request_id);
CREATE INDEX IF NOT EXISTS brand_requests_sub ON brand_requests (sub, request_id);
"""


class SqliteBrandRequestRepository:
    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    def put(self, request: BrandRequest) -> BrandRequest:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO brand_requests (request_id, sub, status, data) VALUES (?, ?, ?, ?)",
                (request.request_id, request.sub, request.status.value, request.model_dump_json()),
            )
        return request

    def _select(self, where: str, args: tuple, order: str = "ASC", limit: int = 1000) -> list[BrandRequest]:
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT data FROM brand_requests WHERE {where} ORDER BY request_id {order} LIMIT ?", (*args, limit)
            ).fetchall()
        return [BrandRequest.model_validate_json(row["data"]) for row in rows]

    def get(self, request_id: str) -> BrandRequest | None:
        found = self._select("request_id = ?", (request_id,))
        return found[0] if found else None

    def with_status(self, status: RequestStatus, limit: int = 100) -> list[BrandRequest]:
        return self._select("status = ?", (status.value,), limit=limit)

    def for_person(self, sub: str) -> list[BrandRequest]:
        return self._select("sub = ?", (sub,), order="DESC")
