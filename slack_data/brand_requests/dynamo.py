"""
The brand-request store on DynamoDB (`slackdata-brand-requests-<stage>`, P5-B).

| key / index | holds | read by |
|---|---|---|
| `request_id` (hash) | one request | approve / decline |
| `status-index`: `status` (hash), `request_id` (range) | every request by status, oldest first | the admin queue |
| `sub-index`: `sub` (hash), `request_id` (range) | a person's requests | their account |

Queries only: the role has no `dynamodb:Scan`. boto3 is imported lazily.
"""

import os

from slack_data.models.brand_requests import BrandRequest, RequestStatus

STATUS_INDEX = "status-index"
SUB_INDEX = "sub-index"


def to_item(request: BrandRequest) -> dict:
    return {key: value for key, value in request.model_dump(mode="json").items() if value is not None}


def from_item(item: dict) -> BrandRequest:
    return BrandRequest.model_validate({**item, "catalog_id": int(item["catalog_id"])})


class DynamoBrandRequestRepository:
    def __init__(self, table_name: str | None = None, table=None) -> None:
        self._explicit_table = table
        self._table_name = table_name
        self._cached = None

    @property
    def _table(self):
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3

            self._cached = boto3.resource("dynamodb").Table(self._table_name or os.environ["BRAND_REQUESTS_TABLE"])
        return self._cached

    def put(self, request: BrandRequest) -> BrandRequest:
        self._table.put_item(Item=to_item(request))
        return request

    def get(self, request_id: str) -> BrandRequest | None:
        item = self._table.get_item(Key={"request_id": request_id}).get("Item")
        return from_item(item) if item else None

    def _query(self, index: str, key: str, value: str, forward: bool, limit: int) -> list[BrandRequest]:
        from boto3.dynamodb.conditions import Key

        response = self._table.query(
            IndexName=index, KeyConditionExpression=Key(key).eq(value), ScanIndexForward=forward, Limit=limit
        )
        return [from_item(item) for item in response.get("Items", [])]

    def with_status(self, status: RequestStatus, limit: int = 100) -> list[BrandRequest]:
        return self._query(STATUS_INDEX, "status", status.value, True, limit)

    def for_person(self, sub: str) -> list[BrandRequest]:
        return self._query(SUB_INDEX, "sub", sub, False, 100)
