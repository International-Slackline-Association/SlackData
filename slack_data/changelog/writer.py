"""
Writing a change and its log record together (§ 6.4, D28).

A role grant that happened with no record of it, or a record of a grant that
never happened, both break the one promise the log makes. So:

- **Hosted** (both stores DynamoDB): one `TransactWriteItems` — the person's
  new record and the log record are written together or not at all. No new
  permission: IAM authorises a transaction against the `PutItem` of each item
  in it, which the role grants on `slackdata-*`.
- **Locally** (SQLite files, or in-memory in tests): the log first, then the
  person. Two files cannot share a transaction; writing the log first means a
  failure in between leaves a visible record of an attempted change, never an
  unrecorded one.
"""

from slack_data.changelog.repository import ChangeLogRepository, RecordExists
from slack_data.models.changes import ChangeRecord
from slack_data.models.people import Person
from slack_data.people.repository import PeopleRepository


def commit_person_change(
    people: PeopleRepository, log: ChangeLogRepository, person: Person, record: ChangeRecord
) -> None:
    from slack_data.changelog.dynamo import DynamoChangeLogRepository
    from slack_data.people.dynamo import DynamoPeopleRepository

    if isinstance(people, DynamoPeopleRepository) and isinstance(log, DynamoChangeLogRepository):
        _transact(people, log, person, record)
        return

    log.append(record)
    people.put(person)


def _transact(people, log, person: Person, record: ChangeRecord) -> None:
    from botocore.exceptions import ClientError

    from slack_data.changelog.dynamo import transaction_put
    from slack_data.people.dynamo import to_item

    # The resource's own client: it serialises plain Python values the way
    # `Table.put_item` does, so both halves use the same item shapes.
    client = log.table.meta.client
    try:
        client.transact_write_items(
            TransactItems=[
                {"Put": {"TableName": people.table_name, "Item": to_item(person)}},
                transaction_put(record, log.table.name),
            ]
        )
    except ClientError as error:
        reasons = error.response.get("CancellationReasons") or []
        if any(reason.get("Code") == "ConditionalCheckFailed" for reason in reasons):
            raise RecordExists(record.id) from error
        raise
