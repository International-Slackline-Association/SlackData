"""
The hosted catalogue store — DynamoDB (`slackdata-catalog-<stage>`).

| attribute | |
|---|---|
| `collection` (PK) | `webbings`, `manufacturers`, … — or `_meta` for the version |
| `key` (SK) | the entry's id (documents.py), or `version` |
| `data` | the seed entry, as one JSON string |
| `seq`, `retired` | position in the file; soft removal |
| `rev` | the edit-conflict token (D27); absent on a document the importer wrote before phase 3, read as 1 |

`data` is a JSON **string**, not a map, for the reason the change log gives:
DynamoDB turns every number into a `Decimal`, and the loaders expect the seed's
own ints and floats. A string round-trips exactly.

Reading everything is one `Query` per collection, paged — the role grants no
`Scan`, and a collection is the unit anyway. Covered by the `table/slackdata-*`
grant: `GetItem` (the version, every request), `Query` (a rebuild), `PutItem`
and `UpdateItem` (the importer, and phase 3's edits). No new permission.
"""

import json
import os
from typing import TYPE_CHECKING

from slack_data.catalogue.documents import COLLECTIONS, Document
from slack_data.catalogue.repository import (
    VERSION_NAME,
    Conflict,
    CounterAdvance,
    Put,
    counter_name,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

META_COLLECTION = "_meta"
VERSION_KEY = VERSION_NAME


def to_item(document: Document) -> dict:
    return {
        "collection": document.collection,
        "key": document.key,
        "seq": document.seq,
        "data": json.dumps(document.data, ensure_ascii=False),
        "retired": document.retired,
        "rev": document.rev,
    }


def from_item(item: dict) -> Document:
    return Document(
        collection=item["collection"],
        key=item["key"],
        seq=int(item["seq"]),
        data=json.loads(item["data"]),
        retired=bool(item.get("retired", False)),
        rev=int(item.get("rev", 1)),
    )


class DynamoCatalogueRepository:
    def __init__(self, table_name: str | None = None, table: "Table | None" = None) -> None:
        self._explicit_table = table
        self._table_name = table_name
        self._cached: Table | None = None

    @property
    def _table(self) -> "Table":
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3

            name = self._table_name or os.environ["CATALOG_TABLE"]
            self._cached = boto3.resource("dynamodb").Table(name)
        return self._cached

    def load(self, include_retired: bool = False) -> list[Document]:
        from boto3.dynamodb.conditions import Key

        documents: list[Document] = []
        for collection in COLLECTIONS:
            kwargs = {"KeyConditionExpression": Key("collection").eq(collection)}
            while True:
                page = self._table.query(**kwargs)
                documents.extend(from_item(item) for item in page.get("Items", []))
                if "LastEvaluatedKey" not in page:
                    break
                kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return [d for d in documents if include_retired or not d.retired]

    def put_many(self, documents: list[Document]) -> None:
        # One PutItem each, not BatchWriteItem: the role grants PutItem on
        # `slackdata-*`, and a batch is a separate action nobody asked for.
        for document in documents:
            self._table.put_item(Item=to_item(document))

    def version(self) -> int:
        item = self._table.get_item(
            Key={"collection": META_COLLECTION, "key": VERSION_KEY},
            ConsistentRead=True,
        ).get("Item")
        return int(item["n"]) if item else 0

    def bump_version(self) -> int:
        response = self._table.update_item(
            Key={"collection": META_COLLECTION, "key": VERSION_KEY},
            UpdateExpression="ADD n :one",
            ExpressionAttributeValues={":one": 1},
            ReturnValues="UPDATED_NEW",
        )
        return int(response["Attributes"]["n"])

    def get(self, collection: str, key: str) -> Document | None:
        item = self._table.get_item(
            Key={"collection": collection, "key": key}, ConsistentRead=True
        ).get("Item")
        return from_item(item) if item else None

    def counter(self, collection: str) -> int | None:
        item = self._table.get_item(
            Key={"collection": META_COLLECTION, "key": counter_name(collection)},
            ConsistentRead=True,
        ).get("Item")
        return int(item["n"]) if item else None

    @property
    def table_name(self) -> str:
        return self._table.name

    def transaction_items(self, puts: list[Put], counters: list[CounterAdvance]) -> list[dict]:
        """The puts and counter advances as `TransactWriteItems` entries, each
        with its condition — for the writer to send with the log records."""
        items: list[dict] = []
        for put in puts:
            entry: dict = {"TableName": self.table_name, "Item": to_item(put.document)}
            if put.expected_rev is None:
                entry["ConditionExpression"] = "attribute_not_exists(#k)"
                entry["ExpressionAttributeNames"] = {"#k": "key"}
            else:
                # A document the importer wrote before phase 3 has no `rev`: it is 1.
                entry["ConditionExpression"] = "#r = :rev OR (attribute_not_exists(#r) AND :rev = :one)"
                entry["ExpressionAttributeNames"] = {"#r": "rev"}
                entry["ExpressionAttributeValues"] = {":rev": put.expected_rev, ":one": 1}
            items.append({"Put": entry})
        for advance in counters:
            entry = {
                "TableName": self.table_name,
                "Item": {"collection": META_COLLECTION, "key": counter_name(advance.collection), "n": advance.new},
            }
            if advance.expected is None:
                entry["ConditionExpression"] = "attribute_not_exists(#k)"
                entry["ExpressionAttributeNames"] = {"#k": "key"}
            else:
                entry["ConditionExpression"] = "#n = :expected"
                entry["ExpressionAttributeNames"] = {"#n": "n"}
                entry["ExpressionAttributeValues"] = {":expected": advance.expected}
            items.append({"Put": entry})
        return items

    def version_bump_item(self) -> dict:
        return {
            "Update": {
                "TableName": self.table_name,
                "Key": {"collection": META_COLLECTION, "key": VERSION_KEY},
                "UpdateExpression": "ADD n :one",
                "ExpressionAttributeValues": {":one": 1},
            }
        }

    def apply(self, puts: list[Put], counters: list[CounterAdvance]) -> None:
        from botocore.exceptions import ClientError

        items = self.transaction_items(puts, counters)
        if not items:
            return
        try:
            self._table.meta.client.transact_write_items(TransactItems=items)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "TransactionCanceledException":
                raise Conflict(describe_cancellation(error, items)) from error
            raise


def describe_cancellation(error, items: list[dict]) -> str:
    """Which item's condition failed, from the cancellation reasons (one per
    item, in order)."""
    reasons = error.response.get("CancellationReasons") or []
    for reason, item in zip(reasons, items):
        if reason.get("Code") == "ConditionalCheckFailed":
            body = next(iter(item.values()))
            key = body.get("Item") or body.get("Key") or {}
            return f"{key.get('collection')}/{key.get('key')}"
    return "the transaction"
