"""
The hosted change log — DynamoDB (`slackdata-changelog-<stage>`).

**The table name is fixed**: the ISA's deny statement (`ChangelogIsAppendOnly`)
names `table/slackdata-changelog-prod` exactly, so renaming the table would
silently drop the IAM half of the append-only guarantee.

| key / index | answers |
|---|---|
| `id` (PK) | one record; the conditional put that refuses an overwrite |
| `feed-index`: `feed` (always `all`) + `id` | Recent Changes, newest first |
| `target-index`: `target` + `id` | one thing's History, newest first |
| `actor-index`: `actor_isa_id` + `id` | one person's contributions, newest first |

The safety feed has no index of its own: it pages back through `feed-index`
with a filter (`flagged`). DynamoDB creates one index per update of an
existing table, and at tens of changes a day a filter over the recent pages
costs nothing — so phase 3 adds a single index.

A single `feed` partition is fine at this size — tens of changes a day — and is
what makes "everything, newest first" a query rather than a `Scan`, which the
role does not grant.
"""

import os
from typing import TYPE_CHECKING

from slack_data.changelog.repository import MAX_PAGE, RecordExists
from slack_data.models.changes import ChangeRecord, TargetType, target_key

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

FEED_INDEX = "feed-index"
TARGET_INDEX = "target-index"
ACTOR_INDEX = "actor-index"
# How far back the safety feed looks, in pages of MAX_PAGE records.
FLAGGED_MAX_PAGES = 20
FEED_ALL = "all"

# The condition every append carries (§ 6.5).
NEW_RECORD_ONLY = "attribute_not_exists(id)"


def to_item(record: ChangeRecord) -> dict:
    item = record.model_dump(mode="json")
    item["changes"] = record.changes_json()
    item["target"] = record.target
    item["feed"] = FEED_ALL
    return {key: value for key, value in item.items() if value is not None}


def from_item(item: dict) -> ChangeRecord:
    data = {key: value for key, value in item.items() if key not in {"target", "feed"}}
    data["changes"] = ChangeRecord.parse_changes(data.get("changes"))
    data["flags"] = list(data.get("flags") or [])
    return ChangeRecord(**data)


class DynamoChangeLogRepository:
    def __init__(self, table_name: str | None = None, table: "Table | None" = None) -> None:
        self._explicit_table = table
        self._table_name = table_name
        self._cached: Table | None = None

    @property
    def table(self) -> "Table":
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3

            name = self._table_name or os.environ["CHANGELOG_TABLE"]
            self._cached = boto3.resource("dynamodb").Table(name)
        return self._cached

    def append(self, record: ChangeRecord) -> ChangeRecord:
        from botocore.exceptions import ClientError

        try:
            self.table.put_item(Item=to_item(record), ConditionExpression=NEW_RECORD_ONLY)
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise RecordExists(record.id) from error
            raise
        return record

    def _query(self, index: str, key_name: str, key_value: str, limit: int, before: str | None):
        from boto3.dynamodb.conditions import Key

        condition = Key(key_name).eq(key_value)
        if before is not None:
            condition = condition & Key("id").lt(before)
        response = self.table.query(
            IndexName=index,
            KeyConditionExpression=condition,
            ScanIndexForward=False,  # newest first: ids are ULIDs
            Limit=min(limit, MAX_PAGE),
        )
        return [from_item(item) for item in response.get("Items", [])]

    def recent(self, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        return self._query(FEED_INDEX, "feed", FEED_ALL, limit, before)

    def for_target(
        self, target_type: TargetType, target_id: str, limit: int = 50
    ) -> list[ChangeRecord]:
        return self._query(TARGET_INDEX, "target", target_key(target_type, target_id), limit, None)

    def get(self, record_id: str) -> ChangeRecord | None:
        item = self.table.get_item(Key={"id": record_id}, ConsistentRead=True).get("Item")
        return from_item(item) if item else None

    def by_actor(self, isa_id: str, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        return self._query(ACTOR_INDEX, "actor_isa_id", isa_id, limit, before)

    def flagged(self, flag: str, limit: int = 50, before: str | None = None) -> list[ChangeRecord]:
        from boto3.dynamodb.conditions import Attr, Key

        condition = Key("feed").eq(FEED_ALL)
        if before is not None:
            condition = condition & Key("id").lt(before)
        kwargs = {
            "IndexName": FEED_INDEX,
            "KeyConditionExpression": condition,
            "FilterExpression": Attr("flags").contains(flag),
            "ScanIndexForward": False,
            "Limit": MAX_PAGE,
        }
        found: list[ChangeRecord] = []
        for _ in range(FLAGGED_MAX_PAGES):
            page = self.table.query(**kwargs)
            found.extend(from_item(item) for item in page.get("Items", []))
            if len(found) >= limit or "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return found[:limit]


def transaction_put(record: ChangeRecord, table_name: str) -> dict:
    """The log half of a `TransactWriteItems` call (D28) — the same conditional
    put `append` makes, as a transaction item."""
    return {
        "Put": {
            "TableName": table_name,
            "Item": to_item(record),
            "ConditionExpression": NEW_RECORD_ONLY,
        }
    }

