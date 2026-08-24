"""
The hosted submission store — DynamoDB.

Why DynamoDB and not Postgres, since that question comes up every time someone
reads this file: the deploy identity's permission set denies `ec2:*`, and RDS,
Aurora Serverless and EFS all require a VPC. A Lambda inside a VPC that still
needs outbound internet (the FX rates call) needs a NAT gateway at ~$32/month,
which is more than the rest of the stack costs together and breaks the ~$0-idle
premise the architecture rests on. The access pattern is one query — "pending,
oldest first" — so nothing is lost. See SUBMISSIONS_PLAN.md and
infra/ISA_ROLE_REQUEST_PHASE2.md.

boto3 is imported at construction rather than at module scope, so importing
`slack_data.submissions` on a machine without it (every test run) still works.
"""

import os
from typing import TYPE_CHECKING

from slack_data.models.submissions import (
    Submission,
    SubmissionStatus,
    expiry_for,
    now_iso,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_dynamodb.service_resource import Table

# GSI: PK `status`, SK `created_at`. The one query the triage page makes.
STATUS_INDEX = "status-created_at-index"

# GSI: PK `brand_id` (N), SK `batch_id` (S). The manufacturer read-back.
#
# **Sparse, and that is the security property, not an optimisation.** A public
# submission has neither attribute (`_to_item` drops nulls), so it is absent
# from this index rather than filtered out of it — a brand cannot reach the
# suggestion box through this query even if the scoping above it were wrong.
#
# `batch_id` is a monotonic ULID, so the sort key orders by creation time: one
# index answers both "my recent submissions" and "this exact batch". Duplicate
# (brand_id, batch_id) pairs are expected — every item of a batch shares one —
# and a GSI, unlike a table's primary key, does not require uniqueness.
#
# Named BRAND_BATCH_INDEX, not BRAND_INDEX: `manufacturers/dynamo.py` already
# has a BRAND_INDEX (on the brand-clients table) and the two are different
# indexes on different tables.
#
# Must stay in step with `brand_id-batch_id-index` in infra/serverless.yml;
# tests/test_dynamo_stores.py builds its tables from that template and fails on
# drift.
BRAND_BATCH_INDEX = "brand_id-batch_id-index"


def _to_item(submission: Submission) -> dict:
    """Model -> DynamoDB item, dropping nulls.

    DynamoDB stores an absent attribute rather than a null, which matters for
    the Phase 3 `submitted_by` index: leaving the attribute off entirely keeps
    that GSI *sparse*, so today, with no attributed submissions, it indexes
    nothing and costs nothing.
    """
    item = submission.model_dump(mode="json")
    return {key: value for key, value in item.items() if value is not None}


class DynamoSubmissionRepository:
    """Implements `SubmissionRepository` against one on-demand table."""

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
        """
        if self._explicit_table is not None:
            return self._explicit_table
        if self._cached is None:
            import boto3  # local import — see the module docstring

            name = self._table_name or os.environ["SUBMISSIONS_TABLE"]
            self._cached = boto3.resource("dynamodb").Table(name)
        return self._cached

    def create(self, submission: Submission) -> Submission:
        # attribute_not_exists makes this a genuine insert. A ULID collision is
        # not a real risk; a retried Lambda invocation replaying the same write
        # is, and this turns that into an error instead of a silent overwrite.
        self._table.put_item(
            Item=_to_item(submission),
            ConditionExpression="attribute_not_exists(submission_id)",
        )
        return submission

    def get(self, submission_id: str) -> Submission | None:
        response = self._table.get_item(Key={"submission_id": submission_id})
        item = response.get("Item")
        return Submission(**item) if item else None

    def list_by_status(self, status: SubmissionStatus, limit: int = 50) -> list[Submission]:
        from boto3.dynamodb.conditions import Key

        response = self._table.query(
            IndexName=STATUS_INDEX,
            KeyConditionExpression=Key("status").eq(status.value),
            ScanIndexForward=True,  # oldest first — the triage order
            Limit=limit,
        )
        return [Submission(**item) for item in response.get("Items", [])]

    def list_for_brand(
        self, brand_id: int, batch_id: str | None = None, limit: int = 50
    ) -> list[Submission]:
        from boto3.dynamodb.conditions import Key

        condition = Key("brand_id").eq(brand_id)
        if batch_id is not None:
            condition = condition & Key("batch_id").eq(batch_id)
        response = self._table.query(
            IndexName=BRAND_BATCH_INDEX,
            KeyConditionExpression=condition,
            ScanIndexForward=False,  # newest first — see the Protocol
            Limit=limit,
        )
        return [Submission(**item) for item in response.get("Items", [])]

    def review(
        self, submission_id: str, status: SubmissionStatus, review_note: str | None
    ) -> Submission | None:
        # `status` is a DynamoDB reserved word, hence the expression-name alias.
        # The condition makes the update a no-op (ConditionalCheckFailed) when
        # the id doesn't exist, so a review of a missing record 404s rather than
        # quietly creating one — UpdateItem is an upsert by default.
        from botocore.exceptions import ClientError

        expires_at = expiry_for(status)
        values = {":status": status.value, ":note": review_note, ":at": now_iso()}

        if expires_at is None:
            # REMOVE, not "SET expires_at = null": DynamoDB's TTL sweeper reads
            # the attribute, and a null one is not the same as an absent one.
            # An approved record has unfinished work and must never age out.
            update = "SET #status = :status, review_note = :note, reviewed_at = :at REMOVE expires_at"
        else:
            update = (
                "SET #status = :status, review_note = :note, reviewed_at = :at,"
                " expires_at = :exp"
            )
            values[":exp"] = expires_at

        try:
            response = self._table.update_item(
                Key={"submission_id": submission_id},
                UpdateExpression=update,
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(submission_id)",
                ReturnValues="ALL_NEW",
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return None
            raise
        return Submission(**response["Attributes"])
