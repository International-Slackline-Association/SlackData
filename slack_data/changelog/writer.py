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


# --- Catalogue changes (phase 3) ---------------------------------------------


def commit_catalogue_change(
    store,
    log: ChangeLogRepository,
    puts: list,
    counters: list,
    records: list[ChangeRecord],
) -> None:
    """An edit to the catalogue and its log records, together (§ 6.4, D28).

    - **Hosted**: one `TransactWriteItems` — each document put conditional on
      the rev its editor read (D27), each counter advance on the value read,
      each log record on not existing, and the version bump so every container
      rebuilds (D30). A failed condition writes nothing: `Conflict` for the
      catalogue, `RecordExists` for a log id.
    - **Locally**: the revs are checked first, so an ordinary conflict leaves
      no record; then the log; then the documents (checked again, atomically);
      then the version. Two files cannot share a transaction; the order means a
      failure in between leaves a record of an attempt, never an unrecorded
      change.
    """
    from slack_data.catalogue.dynamo import DynamoCatalogueRepository
    from slack_data.changelog.dynamo import DynamoChangeLogRepository

    if isinstance(store, DynamoCatalogueRepository) and isinstance(log, DynamoChangeLogRepository):
        _transact_catalogue(store, log, puts, counters, records)
        return

    from slack_data.catalogue.repository import Conflict, check, counter_name

    for put in puts:
        check(store.get(put.document.collection, put.document.key), put)
    for advance in counters:
        if store.counter(advance.collection) != advance.expected:
            raise Conflict(counter_name(advance.collection))
    for record in records:
        log.append(record)
    store.apply(puts, counters)
    store.count_edit()
    store.bump_version()


def _transact_catalogue(store, log, puts, counters, records) -> None:
    from botocore.exceptions import ClientError

    from slack_data.catalogue.dynamo import describe_cancellation
    from slack_data.catalogue.repository import Conflict
    from slack_data.changelog.dynamo import transaction_put

    catalogue_items = store.transaction_items(puts, counters)
    record_items = [transaction_put(record, log.table.name) for record in records]
    items = catalogue_items + record_items + [store.edits_bump_item(), store.version_bump_item()]
    try:
        log.table.meta.client.transact_write_items(TransactItems=items)
    except ClientError as error:
        reasons = error.response.get("CancellationReasons") or []
        failed = [i for i, r in enumerate(reasons) if r.get("Code") == "ConditionalCheckFailed"]
        if any(len(catalogue_items) <= i < len(catalogue_items) + len(record_items) for i in failed):
            raise RecordExists(records[failed[0] - len(catalogue_items)].id) from error
        if failed:
            raise Conflict(describe_cancellation(error, items)) from error
        raise


def next_id(store, collection: str):
    """The id a new item of `collection` gets, and the counter advance that
    claims it (D26). Before the first create the counter does not exist, and
    starts above every id the collection has ever held, retired ones included —
    an id is never reused."""
    from slack_data.catalogue.repository import CounterAdvance

    current = store.counter(collection)
    if current is None:
        ids = [int(d.key) for d in store.load(include_retired=True) if d.collection == collection and d.key.isdigit()]
        new_id = max(ids, default=0) + 1
    else:
        new_id = current
    return new_id, CounterAdvance(collection, current, new_id + 1)
