"""
The hosted people store — DynamoDB (`slackdata-people-<stage>`).

Covered by the existing `table/slackdata-*` grant, so it needs no new
permission. The role grants no `Scan`, so every list is a query on an index:

| index | key | answers |
|---|---|---|
| `email_key-index` | `email_key` (lower-cased email) | "grant admin to this address" |
| `isa_id-index` | `isa_id` | the name behind a public ISA id |
| `role_admin-index` | `role_admin`, present only on admins (sparse) | the admin list |

Index names must stay in step with `infra/serverless.yml`;
`tests/test_dynamo_stores.py` builds the table from the template, so drift
fails there.
"""

import os
from typing import TYPE_CHECKING

from slack_data.models.people import Person, Role
from slack_data.people.repository import email_key

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

EMAIL_INDEX = "email_key-index"
ISA_ID_INDEX = "isa_id-index"
ADMIN_INDEX = "role_admin-index"


def to_item(person: Person) -> dict:
    """Model -> item: nulls dropped, the index keys added."""
    item = {key: value for key, value in person.model_dump(mode="json").items() if value is not None}
    key = email_key(person.email)
    if key:
        item["email_key"] = key
    if person.has(Role.ADMIN):
        # Sparse: absent on everyone else, so the index holds the admins only.
        item["role_admin"] = Role.ADMIN.value
    return item


def from_item(item: dict) -> Person:
    data = {key: value for key, value in item.items() if key not in {"email_key", "role_admin"}}
    return Person(**data)


class DynamoPeopleRepository:
    def __init__(self, table_name: str | None = None, table: "Table | None" = None) -> None:
        self._explicit_table = table
        self._table_name = table_name
        self._cached: Table | None = None

    @property
    def table_name(self) -> str:
        return self._table.name

    @property
    def _table(self) -> "Table":
        """Built on first use, for the reason `manufacturers/dynamo.py` gives:
        a store resolved as a dependency must not fail before auth answers."""
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3

            name = self._table_name or os.environ["PEOPLE_TABLE"]
            self._cached = boto3.resource("dynamodb").Table(name)
        return self._cached

    def _query(self, index: str, key: str, value: str) -> list[Person]:
        from boto3.dynamodb.conditions import Key

        response = self._table.query(IndexName=index, KeyConditionExpression=Key(key).eq(value))
        return sorted((from_item(item) for item in response.get("Items", [])), key=lambda p: p.sub)

    def get(self, sub: str) -> Person | None:
        item = self._table.get_item(Key={"sub": sub}).get("Item")
        return from_item(item) if item else None

    def put(self, person: Person) -> Person:
        self._table.put_item(Item=to_item(person))
        return person

    def find_by_email(self, email: str) -> list[Person]:
        key = email_key(email)
        return self._query(EMAIL_INDEX, "email_key", key) if key else []

    def find_by_isa_id(self, isa_id: str) -> Person | None:
        found = self._query(ISA_ID_INDEX, "isa_id", isa_id)
        return found[0] if found else None

    def list_with_role(self, role: Role) -> list[Person]:
        if role is not Role.ADMIN:  # the only role there is; a new one needs its index
            raise ValueError(f"no index for role {role!r}")
        return self._query(ADMIN_INDEX, "role_admin", Role.ADMIN.value)
