"""
The hosted brand-client store — DynamoDB.

A second small table rather than a second use of the submissions table: the two
have different access patterns (this one is read on every authenticated
request, by primary key), different retention (submissions expire, credentials
must not) and different sensitivity. The `slackdata-*` prefix in the granted
IAM policy means a new table needs **no new permission** — that wildcard was
requested precisely so this phase would not cost a fourth round-trip to the ISA
(`infra/ISA_ROLE_REQUEST_PHASE2.md`).

boto3 is imported at construction rather than at module scope, so importing
`slack_data.manufacturers` on a machine without it (every test run) still works.
"""

import os
from typing import TYPE_CHECKING

from slack_data.models.brand_clients import BrandClient

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

# GSI: PK `brand_id`. Only the admin/audit read uses it; the hot path is a
# GetItem by client_id. Must stay in step with infra/serverless.yml.
BRAND_INDEX = "brand_id-index"


def _to_item(client: BrandClient) -> dict:
    """Model -> DynamoDB item, dropping nulls (an absent attribute, not a null)."""
    item = client.model_dump(mode="json")
    return {key: value for key, value in item.items() if value is not None}


class DynamoBrandClientRepository:
    """Implements `BrandClientRepository` against one on-demand table."""

    def __init__(self, table_name: str | None = None, table: "Table | None" = None) -> None:
        self._explicit_table = table
        self._table_name = table_name
        self._cached: Table | None = None

    @property
    def _table(self) -> "Table":
        """The DynamoDB table, built on first use.

    The boto3 resource is built on **first use**, not in `__init__`. Two reasons,
    and the second is the one that bit us:

    1. Cold start does less work when a request never touches the store.
    2. FastAPI resolves a route's dependencies *before* running its handler, and
       the repository is one of them — so constructing a client here meant a
       misconfigured store raised **before** the auth check could answer 401 or
       503, turning "not authenticated" into "internal server error". Deferring
       construction keeps the failure where it belongs: in the handler that
       actually reads the store.

        That matters more here than for submissions: this store is read by
        `require_manufacturer` on **every** authenticated request, so it is the
        dependency most likely to be resolved on a request that then turns out
        to be unauthenticated.
        """
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3  # local import — see the module docstring

            name = self._table_name or os.environ["BRAND_CLIENTS_TABLE"]
            self._cached = boto3.resource("dynamodb").Table(name)
        return self._cached

    def get(self, client_id: str) -> BrandClient | None:
        response = self._table.get_item(Key={"client_id": client_id})
        item = response.get("Item")
        return BrandClient(**item) if item else None

    def put(self, client: BrandClient) -> BrandClient:
        # No condition: unlike a submission, a put here is genuinely an upsert.
        # Re-registering a client is how a permission is changed and how one is
        # deactivated, and there is no DeleteItem to fall back on.
        self._table.put_item(Item=_to_item(client))
        return client

    def list_for_brand(self, brand_id: int) -> list[BrandClient]:
        from boto3.dynamodb.conditions import Key

        response = self._table.query(
            IndexName=BRAND_INDEX,
            KeyConditionExpression=Key("brand_id").eq(brand_id),
        )
        return [BrandClient(**item) for item in response.get("Items", [])]
