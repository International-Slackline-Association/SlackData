"""
Which submission store this process talks to.

Chosen by environment variable, the same way `CATALOG_DB_PATH` switches the
catalogue between its two modes:

| `SUBMISSIONS_TABLE` set | store                                    |
|---|---|
| yes | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| no  | SQLite at `SUBMISSIONS_DB_PATH` (default `submissions.db` in the CWD) — local dev. |

The repository is built once and cached in a module global. On Lambda that means
one boto3 client per warm container instead of one per request, which is the
same reasoning as the FX rate cache in `slack_data/utilities/fx.py`: a module
global is the only cache a read-only filesystem allows.
"""

import os
from typing import Annotated

from fastapi import Depends

from slack_data.submissions.repository import (
    SqliteSubmissionRepository,
    SubmissionRepository,
)

DEFAULT_SQLITE_PATH = "submissions.db"

_REPOSITORY: SubmissionRepository | None = None


def build_repository() -> SubmissionRepository:
    """A fresh repository from the environment. Prefer `get_repository`."""
    table_name = os.getenv("SUBMISSIONS_TABLE")
    if table_name:
        # Imported here so boto3 is only required where it is actually used.
        from slack_data.submissions.dynamo import DynamoSubmissionRepository

        return DynamoSubmissionRepository(table_name)
    return SqliteSubmissionRepository(os.getenv("SUBMISSIONS_DB_PATH", DEFAULT_SQLITE_PATH))


def get_repository() -> SubmissionRepository:
    """FastAPI dependency. Overridden in tests via `dependency_overrides`."""
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


def reset_repository() -> None:
    """Drop the cached instance — for tests that change the environment."""
    global _REPOSITORY
    _REPOSITORY = None


RepositoryDep = Annotated[SubmissionRepository, Depends(get_repository)]
