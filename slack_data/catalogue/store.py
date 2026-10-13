"""
Which catalogue store this process talks to, and where the site reads from.

| `CATALOG_TABLE` | `CATALOG_STORE_PATH` | store |
|---|---|---|
| set | — | DynamoDB — hosted. Set by `infra/serverless.yml`. |
| unset | set | SQLite at that path — local store mode, and the live-server tests |
| unset | unset | none: the site reads the seed files or the baked catalogue, as before phase 2 |

`CATALOG_SOURCE` then says what the site reads (`slack_data/database.py`):

| `CATALOG_SOURCE` | the site reads |
|---|---|
| `store` | the catalogue store, built into memory and rebuilt when its version changes (§ 5.2) |
| anything else | the baked catalogue (`CATALOG_DB_PATH`) hosted, the seed files locally — today's behaviour |

So the switch-over in phase 2 is one environment value, and so is a rollback.
Until it flips, the store runs **in shadow**: written by the importer and
compared against the seeds (`python -m slack_data.catalogue.importer --check`),
read by nothing that serves a page.
"""

import os

from slack_data.catalogue.repository import (
    CatalogueRepository,
    SqliteCatalogueRepository,
)

STORE_SOURCE = "store"

_REPOSITORY: CatalogueRepository | None = None


def store_configured() -> bool:
    return bool(os.getenv("CATALOG_TABLE") or os.getenv("CATALOG_STORE_PATH"))


def reads_from_store() -> bool:
    return (os.getenv("CATALOG_SOURCE") or "").strip().lower() == STORE_SOURCE


def build_repository() -> CatalogueRepository:
    table_name = os.getenv("CATALOG_TABLE")
    if table_name:
        from slack_data.catalogue.dynamo import DynamoCatalogueRepository

        return DynamoCatalogueRepository(table_name)
    path = os.getenv("CATALOG_STORE_PATH")
    if not path:
        raise RuntimeError(
            "no catalogue store configured: set CATALOG_TABLE (hosted) or CATALOG_STORE_PATH (local)"
        )
    return SqliteCatalogueRepository(path)


def get_catalogue_repository() -> CatalogueRepository:
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = build_repository()
    return _REPOSITORY


def set_catalogue_repository(repository: CatalogueRepository | None) -> None:
    """For tests: use this store (None: back to the environment's)."""
    global _REPOSITORY
    _REPOSITORY = repository
