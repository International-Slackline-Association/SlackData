"""
Which change log store this process talks to:

| `CHANGELOG_TABLE` set | store |
|---|---|
| yes | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| no  | SQLite at `CHANGELOG_DB_PATH` (default `changelog.db` in the CWD) — local dev. |
"""

import os
from typing import Annotated

from fastapi import Depends

from slack_data.changelog.repository import (
    ChangeLogRepository,
    SqliteChangeLogRepository,
)

DEFAULT_SQLITE_PATH = "changelog.db"

_REPOSITORY: ChangeLogRepository | None = None


def build_repository() -> ChangeLogRepository:
    table_name = os.getenv("CHANGELOG_TABLE")
    if table_name:
        from slack_data.changelog.dynamo import DynamoChangeLogRepository

        return DynamoChangeLogRepository(table_name)
    return SqliteChangeLogRepository(os.getenv("CHANGELOG_DB_PATH", DEFAULT_SQLITE_PATH))


def get_changelog_repository() -> ChangeLogRepository:
    """FastAPI dependency. Overridden in tests via `dependency_overrides`."""
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


def reset_changelog_repository() -> None:
    global _REPOSITORY
    _REPOSITORY = None


ChangeLogRepositoryDep = Annotated[ChangeLogRepository, Depends(get_changelog_repository)]
