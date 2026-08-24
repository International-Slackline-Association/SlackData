"""
Which brand-client store this process talks to.

Chosen by environment variable, exactly as `slack_data/submissions/store.py`
chooses the submission store:

| `BRAND_CLIENTS_TABLE` set | store |
|---|---|
| yes | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| no  | SQLite at `BRAND_CLIENTS_DB_PATH` (default `brand_clients.db` in the CWD) — local dev. |

The repository is built once and cached in a module global: on Lambda that is
one boto3 client per warm container instead of one per request, and a module
global is the only cache a read-only filesystem allows (same reasoning as
`utilities/fx.py`).

This one is on the hot path in a way the submission store is not — it is read
on **every** authenticated manufacturer request, to resolve a token's client id
to a brand. That is one DynamoDB GetItem per call, which is cheap and, more
importantly, always current: caching the *records* would mean a deactivated
client kept working until a container recycled, and revocation that takes
effect "eventually" is not revocation.
"""

import os
from typing import Annotated

from fastapi import Depends

from slack_data.manufacturers.clients import (
    BrandClientRepository,
    SqliteBrandClientRepository,
)

DEFAULT_SQLITE_PATH = "brand_clients.db"

_REPOSITORY: BrandClientRepository | None = None


def build_repository() -> BrandClientRepository:
    """A fresh repository from the environment. Prefer `get_client_repository`."""
    table_name = os.getenv("BRAND_CLIENTS_TABLE")
    if table_name:
        # Imported here so boto3 is only required where it is actually used.
        from slack_data.manufacturers.dynamo import DynamoBrandClientRepository

        return DynamoBrandClientRepository(table_name)
    return SqliteBrandClientRepository(
        os.getenv("BRAND_CLIENTS_DB_PATH", DEFAULT_SQLITE_PATH)
    )


def get_client_repository() -> BrandClientRepository:
    """FastAPI dependency. Overridden in tests via `dependency_overrides`."""
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


def reset_client_repository() -> None:
    """Drop the cached instance — for tests that change the environment."""
    global _REPOSITORY
    _REPOSITORY = None


ClientRepositoryDep = Annotated[BrandClientRepository, Depends(get_client_repository)]
