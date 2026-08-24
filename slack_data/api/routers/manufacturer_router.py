"""
The manufacturer API — a brand updating its own gear. Phase 4.

Three routes, all authenticated per brand by `require_manufacturer`:

| route | what it is for |
|---|---|
| `GET /manufacturer/me` | confirm a credential reached the right brand before sending data |
| `GET /manufacturer/gear` | **discovery** — our ids for their products, so they can map their SKUs once |
| `POST /manufacturer/gear` | one call, N products, N submissions sharing a `batch_id` |

**We publish; they call.** An earlier draft of the plan had the Lambda calling
manufacturers' APIs, and the requested permissions were wrong as a result.

**This is not live editing.** An update from a brand is a submission like
anyone's — recorded, then applied to the root `*.json` by hand and shipped by
redeploy. The difference is trust, not mechanism: because the sender is the
company that makes the product, the record is stored `APPROVED` rather than
`PENDING`, so the admin gets a to-do list instead of a decision queue. The
catalogue is a read-only SQLite file baked into the image and *cannot* be
written; see `slack_data/api/routing.py`.

## The one thing to be careful about here

**This router does take a `SessionDep`, unlike `submissions_router`, and it must
only ever read through it.** It needs the catalogue to answer "which of your
products is this?" — a read, which works perfectly well on the live site, where
every `GET` route in the app reads through the same read-only session. A *write*
through it would pass every local test (SQLite is writable locally) and fail on
the live site. `tests/test_manufacturer_api.py` wires a session whose `add`,
`commit` and `delete` raise, so that mistake fails in CI-less pytest instead of
in production.

Everything written goes to the submission store — a different database
entirely — through `RepositoryDep`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from slack_data.api.auth import require_manufacturer
from slack_data.database import SessionDep
from slack_data.manufacturers import matching
from slack_data.models.brand_clients import ManufacturerPrincipal, may_write_directly
from slack_data.models.manufacturer_updates import (
    MAX_BATCH_ITEMS,
    ManufacturerGearItem,
    ManufacturerGearRow,
    ManufacturerIdentity,
    ManufacturerItemResult,
    ManufacturerSubmissionRow,
    ManufacturerUpdateBatch,
    ManufacturerUpdateReceipt,
    Resolution,
)
from slack_data.models.submissions import (
    MAX_NOTE_LENGTH,
    Submission,
    SubmissionKind,
    SubmissionStatus,
    expiry_for,
    now_iso,
)
from slack_data.submissions.store import RepositoryDep
from slack_data.utilities.ulid import new_ulid

manufacturer_router = APIRouter(
    prefix="/manufacturer",
    tags=["manufacturer"],
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not this brand's gear"},
    },
)

# A whole product line of specs, not a correction — so far above
# `submissions_router.MAX_BODY_BYTES` (16 KB) that the two should not share a
# number. 50 items x 60 fields x 200 characters is comfortably inside this, and
# it is still small enough that the endpoint is no use as free storage.
MAX_BODY_BYTES = 256 * 1024

PrincipalDep = Annotated[ManufacturerPrincipal, Depends(require_manufacturer)]


def enforce_body_size(request: Request) -> None:
    """Reject an oversized body on its Content-Length, before reading it.

    Sibling of the identically-shaped check in `submissions_router.py`. Kept
    separate rather than shared because the two caps are unrelated numbers that
    should be free to move independently — the day one is tuned, the other must
    not follow it by accident.
    """
    # Content-Length only, so a chunked request skips this. That is fine and
    # not worth closing here: API Gateway caps a payload at 10 MB before the
    # Lambda is invoked, and every field this endpoint stores is length-capped
    # by the model besides. This check exists to make the *common* oversized
    # request free, not to be the last line of defence.
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"the body must be at most {MAX_BODY_BYTES} bytes",
        )


def _verified_brand(session, principal: ManufacturerPrincipal) -> None:
    """Refuse to act on a credential whose brand id has drifted.

    Every route here scopes its work by `principal.brand_id`, which means a
    *wrong* id is not an error anywhere below — it is a confident answer about
    another company. Brand ids are seed-order autoincrements exactly like gear
    ids, and `register.py` resolves them against the operator's local catalogue
    rather than the one baked into the running image, so drift is a real state
    and not a hypothetical. See `matching.BrandMismatch`.
    """
    try:
        matching.verify_brand(session, principal)
    except matching.MatchError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@manufacturer_router.get("/me", response_model=ManufacturerIdentity)
def read_identity(principal: PrincipalDep, session: SessionDep):
    """Which brand these credentials speak for.

    The first call any integration should make. Confirming the mapping here
    costs one request; discovering it was wrong from a queue row a week later
    costs an apology to two brands.

    It takes a `SessionDep` for one reason: to make that sentence true. Echoing
    the stored record back would confirm nothing — the stored `brand_id` is
    precisely the thing that can be stale — so the id is checked against the
    catalogue this deploy is actually serving before the answer is given. A read,
    like everything else this router does with the session.
    """
    _verified_brand(session, principal)
    return ManufacturerIdentity(
        client_id=principal.client_id,
        brand_id=principal.brand_id,
        brand_name=principal.brand_name,
        permissions=[permission.value for permission in principal.permissions],
        dev=principal.dev,
    )


# What `?include=` accepts. Comma separated and validated against this set
# rather than being a boolean flag, because step 4 (photos) wants
# `?include=spec,photos` and a `spec=true` flag would have to be deprecated to
# get there. See MANUFACTURER_API_PLAN.md.
INCLUDABLE = frozenset({"spec"})


def parse_include(include: str | None) -> frozenset[str]:
    """`?include=spec` -> {"spec"}. An unknown value is 422, never ignored.

    Silently dropping it is the tempting choice and the wrong one: a caller who
    typed `?include=specs` would get four fields back and conclude the feature
    does not work, with nothing anywhere saying why.
    """
    if not include:
        return frozenset()
    parts = {part.strip() for part in include.split(",") if part.strip()}
    unknown = sorted(parts - INCLUDABLE)
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"cannot include {', '.join(unknown)};"
                f" known values: {', '.join(sorted(INCLUDABLE))}"
            ),
        )
    return frozenset(parts)


@manufacturer_router.get(
    "/gear",
    response_model=list[ManufacturerGearRow],
    # So the bare call is byte-identical to what it returned before `spec`
    # existed: an unrequested `spec` is absent, not `null`. `exclude_unset`
    # rather than `exclude_none` because `active: null` is meaningful here —
    # it means "we do not know whether this is still sold", which is not the
    # same as omitting it.
    response_model_exclude_unset=True,
)
def read_own_gear(
    principal: PrincipalDep,
    session: SessionDep,
    gear_type: Annotated[str | None, Query()] = None,
    include: Annotated[str | None, Query(description="comma separated; only `spec`")] = None,
):
    """**Discovery.** Every catalogue row belonging to the calling brand.

    This is what makes the identity scheme work: a brand cannot map their SKUs
    onto ids nobody ever told them. Scoped to their own `brand_id` — not
    because the catalogue is secret (it is public, and served unauthenticated
    at `/webbing/` and friends) but because "your gear" is the useful answer,
    and scoping it here means no route in this file has an unscoped read to get
    wrong later.

    `?include=spec` adds the values we currently hold, keyed by the same field
    names the write accepts — the round trip a brand actually needs: GET what
    we have, change what is wrong, send it back. Opt-in, because the bare form
    is what the "map all my SKUs" call wants and what every integration written
    before this asked for. It is another **read** through `SessionDep`, like
    everything else in this file, and it widens each row rather than which rows
    the caller sees. See MANUFACTURER_API_PLAN.md § Proposed: closing the
    round-trip gap.
    """
    _verified_brand(session, principal)
    if gear_type is not None and gear_type not in matching.GEAR_MODELS:
        raise HTTPException(status_code=404, detail=f"unknown gear type {gear_type!r}")
    wanted = parse_include(include)
    return matching.brand_gear(
        session, principal.brand_id, gear_type, include_spec="spec" in wanted
    )


# The read-back's page size. Same cap as the triage list, and for the same
# reason: this is a "did my batch land?" check, not a data export.
MAX_READ_BACK = 100


@manufacturer_router.get("/submissions", response_model=list[ManufacturerSubmissionRow])
def read_own_submissions(
    principal: PrincipalDep,
    session: SessionDep,
    repository: RepositoryDep,
    batch_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_READ_BACK)] = 50,
):
    """**Read-back.** The caller's own submissions, newest first.

    The POST receipt is one-shot, and two failure modes depended on it: a 502
    partial batch (whose message names a `batch_id` and tells the caller to ask
    the admin — because there was nowhere to look), and a rejection, which
    otherwise the sender could never learn about at all. See
    MANUFACTURER_API_PLAN.md § Reading their own submissions back.

    **The brand id comes from the credential; there is no parameter for it.**
    That is the whole of the authorization story here, and it is why
    `list_for_brand` takes the scope rather than applying a filter afterwards —
    hosted, the query runs against a sparse GSI that the public suggestion box
    is not in, so those rows are unreachable through this route by structure
    and not by a condition somebody could later drop.

    Takes `SessionDep` only for `_verified_brand`, exactly like `/me`: reading
    the store scoped by a `brand_id` that has drifted would be a confident
    answer about another company's queue.
    """
    _verified_brand(session, principal)
    return repository.list_for_brand(principal.brand_id, batch_id=batch_id, limit=limit)


def _note_for(item: ManufacturerGearItem, batch: ManufacturerUpdateBatch) -> str | None:
    """The item's note, with the batch's context kept rather than dropped.

    A batch note ("spring 2027 line") is the only explanation of why 40 rows
    arrived at once, so it belongs on each of them — the admin reviews one row
    at a time and would otherwise never see it.
    """
    parts = [note for note in (item.note, batch.note) if note]
    if not parts:
        return None
    return "\n\n".join(parts)[:MAX_NOTE_LENGTH]


def _resolve_all(session, principal: ManufacturerPrincipal, batch: ManufacturerUpdateBatch):
    """Match every item before writing any of them. See the module docstring on
    all-or-nothing: a partial batch cannot be safely retried."""
    matches = []
    for index, item in enumerate(batch.items):
        try:
            matches.append(
                matching.resolve(session, principal, item.gear_type, item.gear_id, item.name)
            )
        except matching.MatchError as error:
            # The index is the point: a 40-item batch that fails must say which
            # item, or the caller is left diffing their own request.
            raise HTTPException(
                status_code=error.status_code,
                detail=f"items[{index}]: {error}",
            ) from error
    return matches


@manufacturer_router.post(
    "/gear",
    response_model=ManufacturerUpdateReceipt,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_body_size)],
)
def submit_gear(
    batch: ManufacturerUpdateBatch,
    principal: PrincipalDep,
    session: SessionDep,
    repository: RepositoryDep,
):
    """Record a brand's own updates to its own products.

    Auto-approved on arrival: the sender is the company that makes the thing, so
    there is no decision left for the admin to make — only the JSON edit and the
    redeploy. An `APPROVED` record deliberately never expires (`expiry_for`),
    which is exactly right here: it is work outstanding, and it must not age out
    of the queue with the site still wrong.

    Nothing is written until every item has **resolved**, so a batch that fails
    to match is always safe to retry. The *writes* are a weaker guarantee: they
    are a loop, not a transaction, so a store failure part-way through leaves the
    earlier items in place and answers 502 saying how many — see the loop below.
    Retrying that blindly duplicates them.

    The receipt echoes the **resolved** gear id per item, which is how a brand's
    mapping heals itself after a re-seed shifts our ids.
    """
    _verified_brand(session, principal)
    matches = _resolve_all(session, principal, batch)

    # One id for the call, so triage can group N rows back into the request the
    # manufacturer actually made. A ULID, so the group sorts with its members.
    batch_id = new_ulid()
    applied = may_write_directly(principal)  # False today, structurally — see brand_clients.py

    records: list[Submission] = []
    for item, match in zip(batch.items, matches):
        records.append(
            Submission(
                submission_id=new_ulid(),
                kind=SubmissionKind.MANUFACTURER,
                gear_type=item.gear_type,
                gear_id=match.gear_id,
                gear_name=match.gear_name,
                # Their own name, from the verified credential — not a string
                # they sent. This is attribution, so it must not be assertable.
                gear_brand=principal.brand_name,
                changes=item.changes,
                note=_note_for(item, batch),
                source_url=item.source_url,
                # No contact address is collected here: the brand is reachable
                # through the client record, and copying it onto every
                # submission would spread personal data across 40 rows for no
                # gain. See models/brand_clients.py § Privacy.
                submitter_email=None,
                submitted_by=f"brand-client:{principal.client_id}",
                brand_id=principal.brand_id,
                batch_id=batch_id,
                manufacturer_sku=item.manufacturer_sku,
                status=SubmissionStatus.APPROVED,
                created_at=now_iso(),
                # Nobody reviewed it — a human did not look at this, the
                # credential did. Leaving this null keeps "reviewed_at" honest;
                # the review_note below says how it came to be approved.
                reviewed_at=None,
                review_note=(
                    f"auto-approved: sent by {principal.brand_name}"
                    " through the manufacturer API"
                ),
                expires_at=expiry_for(SubmissionStatus.APPROVED),
            )
        )

    # Resolution is all-or-nothing; the writes are not, and cannot be made so
    # without DynamoDB transactions the IAM policy does not grant. So the one
    # thing that must not happen is a *silent* partial batch: the caller retries,
    # every item is stored a second time under a fresh batch_id, and the admin
    # reviews the same product twice with no way to tell which record is current.
    # Reporting how far it got turns that into a reconcilable failure.
    for index, record in enumerate(records):
        try:
            repository.create(record)
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"stored {index} of {len(records)} items before failing;"
                    f" batch_id {batch_id}. Do NOT blind-retry — the stored items"
                    " are already in the queue. Ask the admin to check that batch,"
                    " or resend only the items after this one."
                ),
            ) from error

    # No alert is sent; the app sends no email. A batch lands in the admin's
    # approved bucket, which is a to-do list rather than a decision queue — and
    # triage groups the N rows back into the one call that made them.
    return ManufacturerUpdateReceipt(
        batch_id=batch_id,
        brand_id=principal.brand_id,
        accepted=len(records),
        results=[
            ManufacturerItemResult(
                submission_id=record.submission_id,
                gear_type=record.gear_type,
                gear_id=record.gear_id,
                gear_name=record.gear_name,
                manufacturer_sku=record.manufacturer_sku,
                resolution=Resolution(match.resolution.value),
                stale_gear_id=match.stale_gear_id,
                status=record.status,
                applied=applied,
            )
            for record, match in zip(records, matches)
        ],
    )


# Re-exported for the tests and for anything that wants the cap without
# importing the route function.
__all__ = ["INCLUDABLE", "MAX_BATCH_ITEMS", "MAX_BODY_BYTES", "MAX_READ_BACK", "manufacturer_router"]
