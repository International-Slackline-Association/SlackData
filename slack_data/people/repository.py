"""
The people store, behind an interface.

The same shape as `slack_data/submissions/repository.py` and
`slack_data/manufacturers/clients.py`: a Protocol, an in-memory implementation
for tests, a SQLite one for local dev and Cypress, and a DynamoDB one in
`dynamo.py`, imported lazily so that nothing here needs boto3.

There is no `delete`. A person is never removed — their past changes must stay
attributable — and the hosted role grants no `dynamodb:DeleteItem`. Erasure is
`anonymised = True` (D11).
"""

import json
import sqlite3
from typing import Protocol

from slack_data.models.people import Person, Role


def email_key(email: str | None) -> str | None:
    """Emails are matched case-insensitively; stored as typed."""
    return email.strip().lower() if email else None


class PeopleRepository(Protocol):
    def get(self, sub: str) -> Person | None:
        """One person by token `sub`. Read on **every** authenticated request
        (D30), so a revoked role takes effect on the next one."""
        ...

    def put(self, person: Person) -> Person:
        """Create or replace."""
        ...

    def find_by_email(self, email: str) -> list[Person]:
        """Everyone holding this address — for an admin granting a role by email.
        A list, because two ISA accounts can share an unverified address."""
        ...

    def find_by_isa_id(self, isa_id: str) -> Person | None:
        """The person behind a public ISA id, for looking up a name."""
        ...

    def list_with_role(self, role: Role) -> list[Person]:
        """Everyone holding a role, e.g. the admin list."""
        ...


class InMemoryPeopleRepository:
    def __init__(self, people: list[Person] | None = None) -> None:
        self._items: dict[str, Person] = {p.sub: p for p in people or []}

    def get(self, sub: str) -> Person | None:
        return self._items.get(sub)

    def put(self, person: Person) -> Person:
        self._items[person.sub] = person
        return person

    def find_by_email(self, email: str) -> list[Person]:
        key = email_key(email)
        return sorted(
            (p for p in self._items.values() if email_key(p.email) == key),
            key=lambda p: p.sub,
        )

    def find_by_isa_id(self, isa_id: str) -> Person | None:
        return next((p for p in self._items.values() if p.isa_id == isa_id), None)

    def list_with_role(self, role: Role) -> list[Person]:
        return sorted((p for p in self._items.values() if p.has(role)), key=lambda p: p.sub)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS people (
    sub             TEXT PRIMARY KEY,
    isa_id          TEXT NOT NULL,
    given_name      TEXT,
    family_name     TEXT,
    email           TEXT,
    email_key       TEXT,
    email_verified  INTEGER NOT NULL,
    roles           TEXT NOT NULL,
    notice_seen_at  TEXT,
    bootstrapped_at TEXT,
    anonymised      INTEGER NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS people_email ON people (email_key);
CREATE INDEX IF NOT EXISTS people_isa_id ON people (isa_id);
"""


class SqlitePeopleRepository:
    """Local dev: a SQLite file of its own, never the catalogue database.

    Connections are opened per call: FastAPI serves requests on a threadpool,
    and a shared sqlite3 connection across threads is an error.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _to_row(person: Person) -> dict:
        row = person.model_dump(mode="json")
        row["roles"] = json.dumps(row["roles"])
        row["email_verified"] = int(row["email_verified"])
        row["anonymised"] = int(row["anonymised"])
        row["email_key"] = email_key(person.email)
        return row

    @staticmethod
    def _from_row(row: sqlite3.Row) -> Person:
        data = dict(row)
        data.pop("email_key", None)
        data["roles"] = json.loads(data["roles"])
        data["email_verified"] = bool(data["email_verified"])
        data["anonymised"] = bool(data["anonymised"])
        return Person(**data)

    def _select(self, where: str, args: tuple) -> list[Person]:
        with self._connect() as conn:
            rows = conn.execute(f"SELECT * FROM people WHERE {where} ORDER BY sub", args).fetchall()
        return [self._from_row(row) for row in rows]

    def get(self, sub: str) -> Person | None:
        found = self._select("sub = ?", (sub,))
        return found[0] if found else None

    def put(self, person: Person) -> Person:
        row = self._to_row(person)
        columns = ", ".join(row)
        placeholders = ", ".join(f":{name}" for name in row)
        with self._connect() as conn:
            conn.execute(f"INSERT OR REPLACE INTO people ({columns}) VALUES ({placeholders})", row)
        return person

    def find_by_email(self, email: str) -> list[Person]:
        return self._select("email_key = ?", (email_key(email),))

    def find_by_isa_id(self, isa_id: str) -> Person | None:
        found = self._select("isa_id = ?", (isa_id,))
        return found[0] if found else None

    def list_with_role(self, role: Role) -> list[Person]:
        return [p for p in self._select("1 = 1", ()) if p.has(role)]
