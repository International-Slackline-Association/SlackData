"""
Which people store this process talks to — chosen by environment variable,
exactly as `submissions/store.py` and `manufacturers/store.py` choose theirs:

| `PEOPLE_TABLE` set | store |
|---|---|
| yes | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| no  | SQLite at `PEOPLE_DB_PATH` (default `people.db` in the CWD) — local dev. |

Records are never cached: a person is read on every authenticated request, so
a revoked role takes effect on the next one (D30).
"""

import os
from typing import Annotated

from fastapi import Depends

from slack_data.people.repository import PeopleRepository, SqlitePeopleRepository

DEFAULT_SQLITE_PATH = "people.db"

_REPOSITORY: PeopleRepository | None = None


def build_repository() -> PeopleRepository:
    table_name = os.getenv("PEOPLE_TABLE")
    if table_name:
        from slack_data.people.dynamo import DynamoPeopleRepository

        return DynamoPeopleRepository(table_name)
    return SqlitePeopleRepository(os.getenv("PEOPLE_DB_PATH", DEFAULT_SQLITE_PATH))


def get_people_repository() -> PeopleRepository:
    """FastAPI dependency. Overridden in tests via `dependency_overrides`."""
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


def reset_people_repository() -> None:
    global _REPOSITORY
    _REPOSITORY = None


PeopleRepositoryDep = Annotated[PeopleRepository, Depends(get_people_repository)]
