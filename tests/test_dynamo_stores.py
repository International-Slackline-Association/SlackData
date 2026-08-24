"""
The DynamoDB repositories, against a real DynamoDB.

**These code paths otherwise never execute anywhere.** boto3 is an optional
extra, the rest of the suite uses the in-memory repositories, and local dev and
Cypress use SQLite — so before this file, `submissions/dynamo.py` and
`manufacturers/dynamo.py` would have run for the very first time in production.
That is the single largest untested surface in the deploy, and the failures it
hides are not subtle:

- **`Decimal` round-tripping.** DynamoDB has one numeric type and boto3 hands it
  back as `Decimal`. Every integer we store — `gear_id`, `brand_id`,
  `expires_at` — goes out as a number and comes back as a `Decimal`, and the
  models have to accept that.
- **Index names.** `STATUS_INDEX` and `BRAND_INDEX` are strings in Python that
  must match strings in `infra/serverless.yml`. Nothing checks that; a typo is a
  `ValidationException` on the first triage page load.
- **Reserved words.** `status` is a DynamoDB reserved word, hence the `#status`
  alias in `review()`. Getting it wrong is a runtime error, not an import error.
- **TTL semantics.** Approving must `REMOVE expires_at`, not set it null — the
  sweeper reads the attribute, and null is not absent.

**The tables here are built from `infra/serverless.yml`**, not from a copy of the
schema. That is the point: if the template's key schema or index names drift
from what the code queries, these tests fail rather than production.

Requires boto3 and a DynamoDB Local instance; skipped cleanly without either, so
`pytest tests/` still passes on a machine with no AWS anything — which is the
guarantee `submissions/repository.py` exists to protect.

    docker run -d --name ddb-local -p 8765:8000 amazon/dynamodb-local
    pip install '-e.[aws]'
    DYNAMODB_ENDPOINT=http://localhost:8765 python -m pytest tests/test_dynamo_stores.py
"""

import os
import re
from pathlib import Path

import pytest

# NOT `importorskip` at module scope. Both dynamo modules import boto3 lazily
# (inside `__init__`), so their index-name constants are readable without it —
# and the two template-agreement tests below are exactly the ones that must run
# on a normal dev machine, where the `aws` extra is not installed. Only the
# fixtures that need a live DynamoDB skip.
from slack_data.manufacturers.dynamo import BRAND_INDEX, DynamoBrandClientRepository
from slack_data.models.brand_clients import BrandClient, BrandPermission
from slack_data.models.brand_clients import now_iso as client_now_iso
from slack_data.models.submissions import (
    Submission,
    SubmissionKind,
    SubmissionStatus,
    now_iso,
)
from slack_data.submissions.dynamo import (
    BRAND_BATCH_INDEX,
    STATUS_INDEX,
    DynamoSubmissionRepository,
)

# Default matches the docstring; override to point at a different local instance.
ENDPOINT = os.getenv("DYNAMODB_ENDPOINT", "http://localhost:8765")
TEMPLATE = Path(__file__).resolve().parent.parent / "infra" / "serverless.yml"


def _table_definitions() -> dict:
    """The `AWS::DynamoDB::Table` blocks out of `infra/serverless.yml`.

    Hand-parsed rather than loaded with PyYAML: the template is full of
    CloudFormation tags (`!Ref`, `!Sub`, `!GetAtt`) and Serverless variables
    (`${self:service}`) that a safe loader refuses. We only need three keys per
    table and they are plain YAML, so a small block reader is less machinery
    than teaching a loader about tags it will never otherwise see.
    """
    text = TEMPLATE.read_text()
    tables: dict[str, dict] = {}

    for match in re.finditer(r"^    (\w+):\n      Type: AWS::DynamoDB::Table\n", text, re.MULTILINE):
        name = match.group(1)
        body_start = match.end()
        # The block runs until the next resource at the same indentation.
        next_resource = re.search(r"^    \w+:\n      Type: ", text[body_start:], re.MULTILINE)
        body = text[body_start: body_start + next_resource.start()] if next_resource else text[body_start:]
        tables[name] = _parse_table(body)

    assert {"SubmissionsTable", "BrandClientsTable"} <= set(tables), (
        f"expected both tables in the template, found {sorted(tables)}"
    )
    return tables


def _parse_table(body: str) -> dict:
    """AttributeDefinitions / KeySchema / GlobalSecondaryIndexes from one block."""

    def attrs(section: str) -> list[dict]:
        block = _section(body, section)
        return [
            {"AttributeName": n, "AttributeType": t}
            for n, t in re.findall(r"- AttributeName: (\w+)\s+AttributeType: (\w+)", block)
        ]

    def keys(block: str) -> list[dict]:
        return [
            {"AttributeName": n, "KeyType": t}
            for n, t in re.findall(r"- AttributeName: (\w+)\s+KeyType: (\w+)", block)
        ]

    gsis = []
    gsi_block = _section(body, "GlobalSecondaryIndexes")
    for chunk in re.split(r"\n(?=\s+- IndexName:)", gsi_block):
        found = re.search(r"IndexName: ([\w-]+)", chunk)
        if not found:
            continue
        gsis.append(
            {
                "IndexName": found.group(1),
                "KeySchema": keys(chunk),
                "Projection": {"ProjectionType": "ALL"},
            }
        )

    return {
        "AttributeDefinitions": attrs("AttributeDefinitions"),
        "KeySchema": keys(_section(body, "KeySchema")),
        "GlobalSecondaryIndexes": gsis,
    }


def _section(body: str, name: str) -> str:
    """The indented block under `name:`, up to the next key at that indent."""
    start = re.search(rf"^(\s+){name}:\n", body, re.MULTILINE)
    if not start:
        return ""
    indent = len(start.group(1))
    rest = body[start.end():]
    end = re.search(rf"^\s{{0,{indent}}}\w+:", rest, re.MULTILINE)
    return rest[: end.start()] if end else rest


@pytest.fixture(scope="module")
def dynamodb():
    """A DynamoDB Local resource, or skip. Credentials are required but ignored."""
    boto3 = pytest.importorskip("boto3", reason="the aws extra is not installed")

    resource = boto3.resource(
        "dynamodb",
        endpoint_url=ENDPOINT,
        region_name="eu-central-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )
    try:
        list(resource.tables.all())
    except Exception as error:  # noqa: BLE001 - not running, wrong port, no network
        # Deliberately broad: every way "there is no DynamoDB here" presents is a
        # skip, not a failure. Narrowing this would make the suite red on a
        # machine that simply has no container running.
        pytest.skip(f"no DynamoDB at {ENDPOINT}: {error}")
    return resource


@pytest.fixture(scope="module")
def tables(dynamodb):
    """Both tables, created from the real template. Dropped afterwards."""
    definitions = _table_definitions()
    created = {}
    for logical, schema in definitions.items():
        name = f"test-{logical}"
        # Best effort: the table usually does not exist, and every way it can
        # fail here (absent, still deleting, in use) is answered by carrying on
        # to create_table and letting *that* report the real problem.
        try:
            dynamodb.Table(name).delete()
            dynamodb.Table(name).wait_until_not_exists()
        except Exception:  # noqa: BLE001, S110
            pass
        kwargs = {
            "TableName": name,
            "BillingMode": "PAY_PER_REQUEST",
            "AttributeDefinitions": schema["AttributeDefinitions"],
            "KeySchema": schema["KeySchema"],
        }
        if schema["GlobalSecondaryIndexes"]:
            kwargs["GlobalSecondaryIndexes"] = schema["GlobalSecondaryIndexes"]
        table = dynamodb.create_table(**kwargs)
        table.wait_until_exists()
        created[logical] = table

    yield created

    for table in created.values():
        # Teardown of a throwaway container's tables. A failure here must not
        # mask the result of the tests that just ran.
        try:
            table.delete()
        except Exception:  # noqa: BLE001, S110
            pass


@pytest.fixture
def submissions(tables):
    return DynamoSubmissionRepository(table=tables["SubmissionsTable"])


@pytest.fixture
def clients(tables):
    return DynamoBrandClientRepository(table=tables["BrandClientsTable"])


def a_submission(**overrides) -> Submission:
    base = {
        "submission_id": overrides.pop("submission_id", "01J0000000000000000000000A"),
        "kind": SubmissionKind.CORRECTION,
        "gear_type": "webbings",
        "gear_id": 12,
        "gear_name": "Type 18",
        "gear_brand": "Balance Community",
        "changes": {"breaking_strength": "31"},
        "status": SubmissionStatus.PENDING,
        "created_at": now_iso(),
        "expires_at": 1893456000,
    }
    base.update(overrides)
    return Submission(**base)


# --- The template and the code agree ----------------------------------------


def test_the_index_names_match_the_template():
    """Two strings in two files that must be equal, and nothing else checks it.

    A mismatch is a `ValidationException` the first time the triage page loads —
    i.e. in production, on the one query the app makes.
    """
    definitions = _table_definitions()
    submissions_gsis = [g["IndexName"] for g in definitions["SubmissionsTable"]["GlobalSecondaryIndexes"]]
    clients_gsis = [g["IndexName"] for g in definitions["BrandClientsTable"]["GlobalSecondaryIndexes"]]

    assert STATUS_INDEX in submissions_gsis, f"{STATUS_INDEX} not in {submissions_gsis}"
    assert BRAND_INDEX in clients_gsis, f"{BRAND_INDEX} not in {clients_gsis}"
    assert BRAND_BATCH_INDEX in submissions_gsis, f"{BRAND_BATCH_INDEX} not in {submissions_gsis}"


def test_the_primary_keys_match_what_the_code_addresses():
    definitions = _table_definitions()
    assert definitions["SubmissionsTable"]["KeySchema"] == [
        {"AttributeName": "submission_id", "KeyType": "HASH"}
    ]
    assert definitions["BrandClientsTable"]["KeySchema"] == [
        {"AttributeName": "client_id", "KeyType": "HASH"}
    ]


# --- Submissions ------------------------------------------------------------


def test_a_submission_round_trips(submissions):
    """The Decimal question, concretely: ints go out, Decimals come back."""
    record = a_submission(submission_id="01J000000000000000000ROUND")
    submissions.create(record)

    back = submissions.get(record.submission_id)
    assert back is not None
    # Not `== 12` by luck — these must be real ints after the model parses them.
    assert back.gear_id == 12 and isinstance(back.gear_id, int)
    assert back.expires_at == 1893456000 and isinstance(back.expires_at, int)
    assert back.changes == {"breaking_strength": "31"}
    assert back.status is SubmissionStatus.PENDING


def test_a_manufacturer_submission_round_trips(submissions):
    """Phase 4's three added columns, through the real serializer."""
    record = a_submission(
        submission_id="01J00000000000000000000MFR",
        kind=SubmissionKind.MANUFACTURER,
        status=SubmissionStatus.APPROVED,
        submitted_by="brand-client:abc",
        brand_id=17,
        batch_id="01J0000000000000000000BATCH",
        manufacturer_sku="BC-AX-25",
        expires_at=None,
    )
    submissions.create(record)

    back = submissions.get(record.submission_id)
    assert back.brand_id == 17 and isinstance(back.brand_id, int)
    assert back.batch_id == "01J0000000000000000000BATCH"
    assert back.manufacturer_sku == "BC-AX-25"
    assert back.kind is SubmissionKind.MANUFACTURER
    # None means "never expire" — the attribute must be absent, not null.
    assert back.expires_at is None


def test_a_missing_submission_is_none(submissions):
    assert submissions.get("01J0000000000000000MISSING") is None


def test_creating_the_same_id_twice_is_refused(submissions):
    """`attribute_not_exists` — a retried Lambda invocation replaying a write
    must be an error, not a silent overwrite."""
    ClientError = pytest.importorskip("botocore.exceptions").ClientError

    record = a_submission(submission_id="01J0000000000000000000DUPE")
    submissions.create(record)
    with pytest.raises(ClientError) as caught:
        submissions.create(record)
    assert caught.value.response["Error"]["Code"] == "ConditionalCheckFailedException"


def test_the_triage_query_returns_oldest_first(submissions):
    """The one query the app makes, against the real GSI.

    Exercises `STATUS_INDEX` and `ScanIndexForward` together — if the index name
    is wrong this is where it surfaces.
    """
    for i in range(3):
        submissions.create(
            a_submission(
                submission_id=f"01J000000000000000000ORD{i}",
                status=SubmissionStatus.PENDING,
                created_at=f"2026-08-19T10:0{i}:00.000Z",
                note=f"note {i}",
            )
        )
    queued = submissions.list_by_status(SubmissionStatus.PENDING, limit=50)
    notes = [s.note for s in queued if s.note and s.note.startswith("note ")]
    assert notes == ["note 0", "note 1", "note 2"]


def test_the_limit_is_honoured(submissions):
    assert len(submissions.list_by_status(SubmissionStatus.PENDING, limit=1)) == 1


def test_reviewing_sets_the_outcome(submissions):
    """`status` is a reserved word — this is the `#status` alias working."""
    record = a_submission(submission_id="01J000000000000000000REVW")
    submissions.create(record)

    reviewed = submissions.review(
        record.submission_id, SubmissionStatus.REJECTED, "not reproducible"
    )
    assert reviewed.status is SubmissionStatus.REJECTED
    assert reviewed.review_note == "not reproducible"
    assert reviewed.reviewed_at is not None
    # Terminal, so it keeps a TTL and ages out.
    assert reviewed.expires_at is not None


def test_approving_removes_the_ttl_entirely(submissions):
    """**The one that matters.** An approved record has unfinished work and must
    never age out. REMOVE, not "set to null" — the sweeper reads the attribute,
    and a null one is not an absent one.
    """
    record = a_submission(submission_id="01J000000000000000000APPR")
    submissions.create(record)
    assert submissions.get(record.submission_id).expires_at is not None

    reviewed = submissions.review(record.submission_id, SubmissionStatus.APPROVED, None)
    assert reviewed.expires_at is None

    raw = submissions._table.get_item(Key={"submission_id": record.submission_id})["Item"]
    assert "expires_at" not in raw, "the TTL attribute must be gone, not null"


def test_reviewing_a_missing_record_returns_none(submissions):
    """UpdateItem is an upsert by default; the condition is what makes this 404."""
    assert submissions.review("01J000000000000000NOSUCH", SubmissionStatus.APPROVED, None) is None
    assert submissions.get("01J000000000000000NOSUCH") is None, "and it must not have been created"


def test_the_read_back_returns_a_brands_own_submissions_newest_first(submissions):
    """The manufacturer read-back, against a real index rather than a list
    comprehension. Newest first — the opposite of the triage query above."""
    for index in range(3):
        submissions.create(
            a_submission(
                submission_id=f"01AAAAAAAAAAAAAAAAAAAAAA0{index}",
                kind=SubmissionKind.MANUFACTURER, brand_id=7,
                batch_id=f"01BBBBBBBBBBBBBBBBBBBBBB0{index}", note=f"n{index}",
            )
        )
    rows = submissions.list_for_brand(7)
    assert [row.note for row in rows] == ["n2", "n1", "n0"]


def test_the_read_back_is_scoped_to_the_brand(submissions):
    submissions.create(a_submission(submission_id="01CA", kind=SubmissionKind.MANUFACTURER,
                                    brand_id=11, batch_id="01BA", note="mine"))
    submissions.create(a_submission(submission_id="01CB", kind=SubmissionKind.MANUFACTURER,
                                    brand_id=12, batch_id="01BB", note="theirs"))
    assert [row.note for row in submissions.list_for_brand(11)] == ["mine"]


def test_one_batch_can_be_queried_by_its_id(submissions):
    """A key condition, not a filter — which is what the 502 partial-batch
    message needs, since it names a batch_id and nothing else."""
    for index in range(2):
        submissions.create(a_submission(submission_id=f"01DA{index}",
                                        kind=SubmissionKind.MANUFACTURER, brand_id=21,
                                        batch_id="01BATCHWANTED", note=f"w{index}"))
    submissions.create(a_submission(submission_id="01DB", kind=SubmissionKind.MANUFACTURER,
                                    brand_id=21, batch_id="01BATCHOTHER", note="other"))
    rows = submissions.list_for_brand(21, batch_id="01BATCHWANTED")
    assert {row.note for row in rows} == {"w0", "w1"}


def test_the_public_suggestion_box_is_not_in_the_index_at_all(submissions):
    """**The security property, and it can only be checked here.**

    A public submission has no `brand_id` and no `batch_id`, and `_to_item`
    drops nulls — so the row is absent from the sparse GSI rather than filtered
    out of it. In-memory and SQLite reproduce the *answer* with a `WHERE`
    clause; only real DynamoDB reproduces the reason.
    """
    submissions.create(a_submission(submission_id="01EA", kind=SubmissionKind.CORRECTION,
                                    note="from the public box"))
    submissions.create(a_submission(submission_id="01EB", kind=SubmissionKind.MANUFACTURER,
                                    brand_id=31, batch_id="01BE", note="from a brand"))


    everything = submissions._table.scan(IndexName=BRAND_BATCH_INDEX).get("Items", [])
    assert all(item.get("kind") != SubmissionKind.CORRECTION.value for item in everything)
    assert not [i for i in everything if i["submission_id"] == "01EA"]
    assert [row.note for row in submissions.list_for_brand(31)] == ["from a brand"]


def test_nulls_are_dropped_rather_than_stored(submissions):
    """Keeps the Phase 3 `submitted_by` index sparse — an absent attribute is
    not indexed, a null one is."""
    record = a_submission(submission_id="01J00000000000000000NULLS")
    submissions.create(record)
    raw = submissions._table.get_item(Key={"submission_id": record.submission_id})["Item"]
    assert "submitted_by" not in raw
    assert "review_note" not in raw


# --- Brand clients ----------------------------------------------------------


def a_client(**overrides) -> BrandClient:
    base = {
        "client_id": "client-alpha",
        "brand_id": 17,
        "brand_name": "Alpha Slacklines",
        "permissions": [BrandPermission.SUGGEST],
        "created_at": client_now_iso(),
    }
    base.update(overrides)
    return BrandClient(**base)


def test_a_brand_client_round_trips(clients):
    clients.put(a_client(contact_email="hello@alpha.example"))

    back = clients.get("client-alpha")
    assert back is not None
    assert back.brand_id == 17 and isinstance(back.brand_id, int)
    assert back.brand_name == "Alpha Slacklines"
    assert back.permissions == [BrandPermission.SUGGEST]
    assert back.active is True
    assert back.contact_email == "hello@alpha.example"


def test_an_unregistered_client_is_none(clients):
    """The hot path on every authenticated request — it must not raise."""
    assert clients.get("never-registered") is None


def test_revocation_is_a_put(clients):
    """No DeleteItem is granted, so deactivation must work through put."""
    clients.put(a_client(client_id="client-revoke"))
    assert clients.get("client-revoke").active is True

    clients.put(a_client(client_id="client-revoke", active=False))
    assert clients.get("client-revoke").active is False


def test_permissions_survive_the_round_trip(clients):
    """WRITE is stored today and not honoured; it still has to come back intact."""
    clients.put(
        a_client(
            client_id="client-write",
            permissions=[BrandPermission.SUGGEST, BrandPermission.WRITE],
        )
    )
    back = clients.get("client-write")
    assert back.permissions == [BrandPermission.SUGGEST, BrandPermission.WRITE]


def test_listing_a_brands_clients_uses_the_index(clients):
    """Exercises `BRAND_INDEX` and the numeric partition key together."""
    clients.put(a_client(client_id="c1", brand_id=99))
    clients.put(a_client(client_id="c2", brand_id=99))
    clients.put(a_client(client_id="c3", brand_id=100))

    for_99 = clients.list_for_brand(99)
    assert {c.client_id for c in for_99} == {"c1", "c2"}
    assert all(c.brand_id == 99 for c in for_99)
    assert clients.list_for_brand(12345) == []
