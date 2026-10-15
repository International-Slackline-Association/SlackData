"""
Which brand-request store this process talks to:

| `BRAND_REQUESTS_TABLE` set | store |
|---|---|
| yes | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| no  | SQLite at `BRAND_REQUESTS_DB_PATH` (default `brand_requests.db` in the CWD) — local dev. |
"""

import os
from typing import Annotated

from fastapi import Depends

from slack_data.brand_requests.repository import (
    BrandRequestRepository,
    SqliteBrandRequestRepository,
)

DEFAULT_SQLITE_PATH = "brand_requests.db"

_REPOSITORY: BrandRequestRepository | None = None


def build_repository() -> BrandRequestRepository:
    table_name = os.getenv("BRAND_REQUESTS_TABLE")
    if table_name:
        from slack_data.brand_requests.dynamo import DynamoBrandRequestRepository

        return DynamoBrandRequestRepository(table_name)
    return SqliteBrandRequestRepository(os.getenv("BRAND_REQUESTS_DB_PATH", DEFAULT_SQLITE_PATH))


def get_brand_request_repository() -> BrandRequestRepository:
    """FastAPI dependency. Overridden in tests via `dependency_overrides`."""
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


BrandRequestRepositoryDep = Annotated[BrandRequestRepository, Depends(get_brand_request_repository)]
