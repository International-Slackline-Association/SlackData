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
from slack_data.catalogue.documents import Document
from slack_data.catalogue.dynamo import DynamoCatalogueRepository
from slack_data.changelog.dynamo import (
    ACTOR_INDEX,
    FEED_INDEX,
    TARGET_INDEX,
    DynamoChangeLogRepository,
)
from slack_data.changelog.repository import RecordExists
from slack_data.changelog.writer import commit_person_change
from slack_data.manufacturers.dynamo import BRAND_INDEX, DynamoBrandClientRepository
from slack_data.models.brand_clients import BrandClient, BrandPermission
from slack_data.models.brand_clients import now_iso as client_now_iso
from slack_data.models.changes import (
    Action,
    ChangeRecord,
    Channel,
    FieldChange,
    TargetType,
)
from slack_data.models.people import Person, Role
from slack_data.models.submissions import (
    Submission,
    SubmissionKind,
    SubmissionStatus,
    now_iso,
)
from slack_data.people.dynamo import (
    ADMIN_INDEX,
    EMAIL_INDEX,
    ISA_ID_INDEX,
    DynamoPeopleRepository,
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


@pytest.fixture
def catalogue(tables):
    return DynamoCatalogueRepository(table=tables["CatalogTable"])


@pytest.fixture
def people(tables):
    return DynamoPeopleRepository(table=tables["PeopleTable"])


@pytest.fixture
def changelog(tables):
    return DynamoChangeLogRepository(table=tables["ChangelogTable"])


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

    people_gsis = [g["IndexName"] for g in definitions["PeopleTable"]["GlobalSecondaryIndexes"]]
    for index in (EMAIL_INDEX, ISA_ID_INDEX, ADMIN_INDEX):
        assert index in people_gsis, f"{index} not in {people_gsis}"
    log_gsis = [g["IndexName"] for g in definitions["ChangelogTable"]["GlobalSecondaryIndexes"]]
    for index in (FEED_INDEX, TARGET_INDEX, ACTOR_INDEX):
        assert index in log_gsis, f"{index} not in {log_gsis}"


def test_the_primary_keys_match_what_the_code_addresses():
    definitions = _table_definitions()
    assert definitions["SubmissionsTable"]["KeySchema"] == [
        {"AttributeName": "submission_id", "KeyType": "HASH"}
    ]
    assert definitions["BrandClientsTable"]["KeySchema"] == [
        {"AttributeName": "client_id", "KeyType": "HASH"}
    ]
    assert definitions["PeopleTable"]["KeySchema"] == [{"AttributeName": "sub", "KeyType": "HASH"}]
    assert definitions["CatalogTable"]["KeySchema"] == [
        {"AttributeName": "collection", "KeyType": "HASH"},
        {"AttributeName": "key", "KeyType": "RANGE"},
    ]
    assert definitions["ChangelogTable"]["KeySchema"] == [{"AttributeName": "id", "KeyType": "HASH"}]


def test_the_change_log_table_has_the_name_the_isa_deny_names():
    """`ChangelogIsAppendOnly` denies writes on `table/slackdata-changelog-prod`
    by exact name. Renaming the table would silently drop that half of the
    append-only guarantee, and nothing in AWS would say so."""
    text = TEMPLATE.read_text()
    block = text[text.index("    ChangelogTable:"):]
    assert "TableName: ${self:service}-changelog-${self:provider.stage}" in block.split("\n\n")[0]
    assert re.search(r"^service: slackdata$", text, re.MULTILINE)


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


def test_photo_links_round_trip_through_dynamodb(submissions):
    """A list attribute: no table, index or IAM change. Order is the brand's
    and must survive the serializer."""
    links = ["https://bc.example/aero-2.png", "https://bc.example/aero-1.jpg"]
    record = a_submission(
        submission_id="01J0000000000000000000PHOTO",
        kind=SubmissionKind.MANUFACTURER,
        status=SubmissionStatus.APPROVED,
        changes={},
        image_urls=links,
        expires_at=None,
    )
    submissions.create(record)
    assert submissions.get(record.submission_id).image_urls == links


def test_an_item_written_before_photo_links_reads_back_with_none(submissions, tables):
    """Every record stored before this field existed has no attribute at all."""
    item = {
        "submission_id": "01J00000000000000000NOPHOTO",
        "kind": "correction",
        "gear_type": "webbings",
        "gear_id": 12,
        "changes": {"weight": "62"},
        "status": "pending",
        "created_at": now_iso(),
    }
    tables["SubmissionsTable"].put_item(Item=item)
    assert submissions.get(item["submission_id"]).image_urls == []


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


def test_a_brand_clients_key_round_trips(clients):
    """The API key's secret (D63) comes back exactly as stored."""
    clients.put(a_client(client_id="client-key", secret="abc_-XYZ0123456789"))
    assert clients.get("client-key").secret == "abc_-XYZ0123456789"


# --- People -----------------------------------------------------------------


def a_person(**overrides) -> Person:
    base = {
        "sub": "sub-1",
        "isa_id": "ISA_0000AAAA",
        "given_name": "Ada",
        "family_name": "Lovelace",
        "email": "Ada@Example.org",
        "email_verified": True,
    }
    base.update(overrides)
    return Person(**base)


def test_a_person_round_trips(people):
    people.put(a_person(roles=[Role.ADMIN], notice_seen_at="2026-10-13T00:00:00.000Z"))
    back = people.get("sub-1")
    assert back.full_name == "Ada Lovelace"
    assert back.roles == [Role.ADMIN]
    assert back.email_verified is True
    assert back.notice_seen_at == "2026-10-13T00:00:00.000Z"


def test_a_missing_person_is_none(people):
    assert people.get("never-signed-in") is None


def test_people_are_found_by_email_case_insensitively(people):
    people.put(a_person(sub="sub-email", email="Case@Example.org"))
    assert [p.sub for p in people.find_by_email("case@EXAMPLE.org")] == ["sub-email"]
    assert people.find_by_email("nobody@example.org") == []


def test_people_are_found_by_isa_id(people):
    people.put(a_person(sub="sub-isa", isa_id="ISA_1234ABCD"))
    assert people.find_by_isa_id("ISA_1234ABCD").sub == "sub-isa"
    assert people.find_by_isa_id("ISA_FFFFFFFF") is None


def test_the_admin_index_holds_admins_only_and_follows_revocation(people):
    """Sparse: the attribute is written for admins and dropped on revocation,
    so a put without it must take the person out of the index."""
    people.put(a_person(sub="sub-admin", isa_id="ISA_A0000001", email="a@x.org", roles=[Role.ADMIN]))
    people.put(a_person(sub="sub-editor", isa_id="ISA_A0000002", email="b@x.org"))
    assert "sub-admin" in {p.sub for p in people.list_with_role(Role.ADMIN)}
    assert "sub-editor" not in {p.sub for p in people.list_with_role(Role.ADMIN)}

    people.put(people.get("sub-admin").model_copy(update={"roles": []}))
    assert "sub-admin" not in {p.sub for p in people.list_with_role(Role.ADMIN)}


def test_the_blocked_index_holds_blocked_accounts_only(people):
    people.put(a_person(sub="sub-blocked", isa_id="ISA_B0000001", email="c@x.org", blocked_at="2026-10-15T00:00:00Z"))
    people.put(a_person(sub="sub-free", isa_id="ISA_B0000002", email="d@x.org"))
    assert "sub-blocked" in {p.sub for p in people.list_blocked()}
    assert "sub-free" not in {p.sub for p in people.list_blocked()}
    people.put(people.get("sub-blocked").model_copy(update={"blocked_at": None}))
    assert "sub-blocked" not in {p.sub for p in people.list_blocked()}


def test_save_times_round_trip_as_whole_numbers(people):
    people.put(a_person(sub="sub-saves", saves=[1_800_000_000, 1_800_000_060], saves_rev=2))
    back = people.get("sub-saves")
    assert back.saves == [1_800_000_000, 1_800_000_060] and back.saves_rev == 2


# --- The change log ---------------------------------------------------------


def a_record(**overrides) -> ChangeRecord:
    base = {
        "target_type": TargetType.PERSON,
        "target_id": "ISA_0000AAAA",
        "action": Action.ROLE_GRANT,
        "actor_sub": "sub-admin",
        "actor_isa_id": "ISA_A0000001",
        "actor_role": "admin",
        "channel": Channel.WEB,
        "changes": {"roles": FieldChange(before=[], after=["admin"])},
    }
    base.update(overrides)
    return ChangeRecord(**base)


def test_a_record_round_trips_with_its_changes_intact(changelog):
    """Changes are stored as one JSON string, so numbers stay numbers rather
    than coming back as `Decimal` — which phase 3's spec edits will need."""
    record = changelog.append(
        a_record(changes={"breaking_strength": FieldChange(before=30, after=32.5)}, why="test")
    )
    [back] = [r for r in changelog.recent(100) if r.id == record.id]
    assert back.changes["breaking_strength"].after == 32.5
    assert isinstance(back.changes["breaking_strength"].before, int)
    assert back.why == "test"


def test_an_append_never_overwrites(changelog):
    """The half of append-only that IAM cannot enforce (§ 6.5)."""
    record = changelog.append(a_record())
    with pytest.raises(RecordExists):
        changelog.append(record.model_copy(update={"why": "rewritten history"}))
    [back] = [r for r in changelog.recent(100) if r.id == record.id]
    assert back.why is None


def test_recent_is_newest_first_and_pages_backwards(changelog):
    ids = [changelog.append(a_record(target_id=f"ISA_PAGE{n:04d}")).id for n in range(5)]
    newest = changelog.recent(3)
    assert [r.id for r in newest] == sorted([r.id for r in newest], reverse=True)
    assert newest[0].id == ids[-1]
    older = changelog.recent(2, before=newest[-1].id)
    assert all(r.id < newest[-1].id for r in older)


def test_a_targets_history_uses_the_index(changelog):
    changelog.append(a_record(target_id="ISA_HIST0001"))
    changelog.append(a_record(target_id="ISA_HIST0001", action=Action.ROLE_REVOKE))
    changelog.append(a_record(target_id="ISA_HIST0002"))
    history = changelog.for_target(TargetType.PERSON, "ISA_HIST0001")
    assert [r.action for r in history] == [Action.ROLE_REVOKE, Action.ROLE_GRANT]


def test_a_role_change_and_its_record_are_one_transaction(people, changelog):
    """D28: both written, or neither. A record id that already exists cancels
    the whole transaction — the person is NOT updated."""
    person = people.put(a_person(sub="sub-tx", isa_id="ISA_TX000001", email="tx@x.org"))
    granted = person.model_copy(update={"roles": [Role.ADMIN]})
    record = a_record(target_id=person.isa_id)

    commit_person_change(people, changelog, granted, record)
    assert people.get("sub-tx").has(Role.ADMIN)
    assert record.id in {r.id for r in changelog.for_target(TargetType.PERSON, person.isa_id)}

    revoked = granted.model_copy(update={"roles": []})
    with pytest.raises(RecordExists):
        commit_person_change(people, changelog, revoked, record)  # same id: refused
    assert people.get("sub-tx").has(Role.ADMIN), "the person changed without a record"


# --- The catalogue store (phase 2) ------------------------------------------


def test_the_whole_real_catalogue_round_trips_through_dynamodb(catalogue):
    """Every seed entry in, every one back out, exactly — floats, unicode and
    nesting included (`data` is a JSON string precisely so numbers do not come
    back as Decimal). The webbings collection is large enough to page."""
    from slack_data.catalogue.build import sources_from_documents, sources_from_files
    from slack_data.catalogue.importer import documents_from_files

    documents = documents_from_files()
    catalogue.put_many(documents)
    assert sources_from_documents(catalogue.load()) == sources_from_files()


def test_the_catalogue_version_starts_at_zero_and_bumps_atomically(tables):
    fresh = DynamoCatalogueRepository(table=tables["CatalogTable"])
    start = fresh.version()
    assert fresh.bump_version() == start + 1
    assert fresh.bump_version() == start + 2
    assert fresh.version() == start + 2


def test_a_retired_catalogue_document_is_skipped(catalogue):
    catalogue.put_many([Document(collection="grips", key="99999", seq=999, data={"id": 99999}, retired=True)])
    assert "99999" not in {d.key for d in catalogue.load() if d.collection == "grips"}
    assert "99999" in {d.key for d in catalogue.load(include_retired=True) if d.collection == "grips"}


def test_the_version_lives_outside_every_collection(catalogue):
    """`_meta` is not a collection, so loading the catalogue never returns it."""
    catalogue.bump_version()
    assert "_meta" not in {d.collection for d in catalogue.load(include_retired=True)}


# --- Catalogue edits (phase 3) -----------------------------------------------
#
# The tables are shared by the whole module, so these tests use document keys
# no seed holds, and compare the version relative to where it started.


def an_edit_document(key: str, name: str, rev: int = 1) -> Document:
    return Document(collection="grips", key=key, seq=900, data={"id": int(key), "name": name}, rev=rev)


def test_an_edit_its_record_and_the_version_are_one_transaction(catalogue, changelog):
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change

    catalogue.put_many([an_edit_document("880001", "Before")])
    before = catalogue.version()
    record = a_record(target_id="grips#880001")
    commit_catalogue_change(
        catalogue, changelog, [Put(an_edit_document("880001", "After", rev=2), expected_rev=1)], [], [record]
    )
    assert catalogue.get("grips", "880001").data["name"] == "After"
    assert record.id in {r.id for r in changelog.recent(100)}
    assert catalogue.version() == before + 1


def test_a_stale_edit_writes_nothing_at_all(catalogue, changelog):
    """D27 + D28: the rev moved on, so neither the document, the record nor the
    version changes."""
    from slack_data.catalogue.repository import Conflict, Put
    from slack_data.changelog.writer import commit_catalogue_change

    catalogue.put_many([an_edit_document("880002", "Current", rev=3)])
    before = catalogue.version()
    record = a_record(target_id="grips#880002")
    with pytest.raises(Conflict, match="grips/880002"):
        commit_catalogue_change(
            catalogue, changelog, [Put(an_edit_document("880002", "Stale", rev=3), expected_rev=2)], [], [record]
        )
    assert catalogue.get("grips", "880002").data["name"] == "Current"
    assert record.id not in {r.id for r in changelog.recent(100)}
    assert catalogue.version() == before


def test_a_reused_record_id_cancels_the_edit(catalogue, changelog):
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change

    catalogue.put_many([an_edit_document("880003", "Current")])
    existing = changelog.append(a_record())
    with pytest.raises(RecordExists):
        commit_catalogue_change(
            catalogue, changelog, [Put(an_edit_document("880003", "Edited", rev=2), expected_rev=1)], [], [existing]
        )
    assert catalogue.get("grips", "880003").data["name"] == "Current"


def test_a_document_written_before_revs_counts_as_rev_one(catalogue, tables):
    """The importer wrote prod's documents with no `rev` attribute."""
    from slack_data.catalogue.repository import Put

    tables["CatalogTable"].put_item(
        Item={"collection": "grips", "key": "880004", "seq": 900, "data": '{"id": 880004}', "retired": False}
    )
    assert catalogue.get("grips", "880004").rev == 1
    catalogue.apply([Put(an_edit_document("880004", "Edited", rev=2), expected_rev=1)], [])
    assert catalogue.get("grips", "880004").rev == 2


def test_two_creates_cannot_take_one_id_in_dynamodb(catalogue):
    from slack_data.catalogue.repository import Conflict, Put
    from slack_data.changelog.writer import next_id

    new_id, advance = next_id(catalogue, "tricklinekits")
    catalogue.apply([Put(Document(collection="tricklinekits", key=str(new_id), data={"id": new_id}), None)], [advance])
    with pytest.raises(Conflict):
        catalogue.apply([Put(Document(collection="tricklinekits", key="880099", data={"id": 880099}), None)], [advance])
    assert catalogue.get("tricklinekits", "880099") is None
    assert next_id(catalogue, "tricklinekits")[0] == new_id + 1


def test_a_persons_changes_and_the_safety_feed(changelog):
    from slack_data.models.changes import SAFETY_FLAG

    plain = changelog.append(a_record(actor_isa_id="ISA_ACTR0001"))
    flagged = changelog.append(a_record(actor_isa_id="ISA_ACTR0001", flags=[SAFETY_FLAG]))
    changelog.append(a_record(actor_isa_id="ISA_ACTR0002"))
    assert [r.id for r in changelog.by_actor("ISA_ACTR0001")] == [flagged.id, plain.id]
    safety = [r.id for r in changelog.flagged(SAFETY_FLAG, 100)]
    assert flagged.id in safety and plain.id not in safety
    [back] = [r for r in changelog.by_actor("ISA_ACTR0001") if r.id == flagged.id]
    assert back.flags == [SAFETY_FLAG]


def test_a_committed_edit_counts_in_the_same_transaction(catalogue, changelog):
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change

    catalogue.put_many([an_edit_document("880005", "Before")])
    before = catalogue.edits()
    commit_catalogue_change(
        catalogue, changelog, [Put(an_edit_document("880005", "After", rev=2), expected_rev=1)], [], [a_record()]
    )
    assert catalogue.edits() == before + 1


# --- Brand-link requests (phase 5) ----------------------------------------------


@pytest.fixture
def brand_requests(tables):
    from slack_data.brand_requests.dynamo import DynamoBrandRequestRepository

    return DynamoBrandRequestRepository(table=tables["BrandRequestsTable"])


def a_request(**overrides):
    from slack_data.models.brand_requests import BrandRequest
    from slack_data.utilities.ulid import new_ulid

    return BrandRequest(**{"request_id": new_ulid(), "sub": "s-1", "isa_id": "ISA_1", "catalog_id": 3, **overrides})


def test_a_brand_request_round_trips_and_queues_oldest_first(brand_requests):
    from slack_data.models.brand_requests import RequestStatus

    first, second = a_request(note="We make it"), a_request(sub="s-2")
    brand_requests.put(second)
    brand_requests.put(first)
    assert brand_requests.get(first.request_id) == first
    pending = [r.request_id for r in brand_requests.with_status(RequestStatus.PENDING)]
    assert pending.index(first.request_id) < pending.index(second.request_id), "ULID order is age order"
    brand_requests.put(first.model_copy(update={"status": RequestStatus.APPROVED}))
    assert first.request_id not in [r.request_id for r in brand_requests.with_status(RequestStatus.PENDING)]
    assert [r.request_id for r in brand_requests.for_person("s-1")][0] == first.request_id


def test_brand_links_round_trip_on_a_person(people):
    from slack_data.models.people import Person

    people.put(Person(sub="maker-1", isa_id="ISA_M1", brands=[3, 23]))
    assert people.get("maker-1").brands == [3, 23]


def test_a_counted_save_is_written_in_the_edits_transaction(catalogue, changelog, people):
    """P6-C: the person's count and the edit land together."""
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change
    from slack_data.people.ratecap import RateCap

    person = people.put(a_person(sub="sub-capped", isa_id="ISA_C0000001", email="e@x.org"))
    catalogue.put_many([an_edit_document("880101", "Before")])
    record = a_record(target_id="grips#880101", actor_role="editor", actor_sub="sub-capped")
    cap = RateCap(people, person, clock=lambda: 1_800_000_000)
    commit_catalogue_change(
        catalogue, changelog, [Put(an_edit_document("880101", "After", rev=2), expected_rev=1)], [], [record], cap
    )
    back = people.get("sub-capped")
    assert (back.saves, back.saves_rev) == ([1_800_000_000], 1)
    assert back.isa_id == "ISA_C0000001", "an update of the count, not a replacement of the person"


def test_a_count_taken_by_a_parallel_save_cancels_the_edit(catalogue, changelog, people):
    from slack_data.catalogue.repository import Put
    from slack_data.changelog.writer import commit_catalogue_change
    from slack_data.people.ratecap import CapRace, RateCap

    read = people.put(a_person(sub="sub-raced", isa_id="ISA_C0000002", email="f@x.org"))
    people.put(read.model_copy(update={"saves": [1_799_999_999], "saves_rev": 1}))
    catalogue.put_many([an_edit_document("880102", "Before")])
    before = catalogue.version()
    record = a_record(target_id="grips#880102", actor_role="editor", actor_sub="sub-raced")
    with pytest.raises(CapRace):
        commit_catalogue_change(
            catalogue, changelog, [Put(an_edit_document("880102", "After", rev=2), expected_rev=1)], [], [record],
            RateCap(people, read, clock=lambda: 1_800_000_000),
        )
    assert catalogue.get("grips", "880102").data["name"] == "Before"
    assert record.id not in {r.id for r in changelog.recent(100)}
    assert catalogue.version() == before
