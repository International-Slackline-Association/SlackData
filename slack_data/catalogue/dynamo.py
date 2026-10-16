"""
The hosted catalogue store — DynamoDB (`slackdata-catalog-<stage>`).

| attribute | |
|---|---|
| `collection` (PK) | `webbings`, `manufacturers`, … — or `_meta` for the version |
| `key` (SK) | the entry's id (documents.py), or `version` |
| `data` | the seed entry, as one JSON string |
| `seq`, `retired` | position in the file; soft removal |

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

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

META_COLLECTION = "_meta"
VERSION_KEY = "version"


def to_item(document: Document) -> dict:
    return {
        "collection": document.collection,
        "key": document.key,
        "seq": document.seq,
        "data": json.dumps(document.data, ensure_ascii=False),
        "retired": document.retired,
    }


def from_item(item: dict) -> Document:
    return Document(
        collection=item["collection"],
        key=item["key"],
        seq=int(item["seq"]),
        data=json.loads(item["data"]),
        retired=bool(item.get("retired", False)),
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
