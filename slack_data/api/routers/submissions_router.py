"""
Submissions — the public "suggest a correction" box and the admin triage.

Two audiences on one prefix:

- `POST /submissions/` is **public**, and guarded by a captcha, a honeypot and a
  body-size cap rather than by a login.
- Everything else requires `require_admin`, server-side. Hiding the page is not
  access control.

**This router never touches the catalogue.** It takes no `SessionDep`, which is
the single most likely thing to be got wrong here: the catalogue is opened
read-only in hosted mode, so a submission that reached for the catalogue session
would work perfectly in every local test and fail on the live site. The store is
a `SubmissionRepository` and nothing else. There is a test for exactly this.

Approving a submission does **not** change the site. It records the outcome and
the admin UI then shows the JSON patch to apply by hand to the root `*.json`,
followed by a redeploy (infra/README.md half A).

**The app sends no email.** There is no SES identity to verify, no DKIM to keep
valid and no sending reputation tied to slackdata.org — and a Lambda that can
send mail as our own domain is a phishing vector we get nothing back for. The
admin finds new work at `/admin`, which carries an outstanding counter. Where a
human address is genuinely needed (a brand asking to be onboarded), the answer
is a Google-forwarded alias on the ISA's domain, in the manner of
`slackmap@slacklineinternational.org` — outside this codebase entirely, and it
outlives whoever holds the AWS account. See SUBMISSIONS_PLAN.md § Alerting.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status

from slack_data.api.auth import require_admin
from slack_data.models.submissions import (
    RETENTION_DAYS,
    Submission,
    SubmissionCreate,
    SubmissionReceipt,
    SubmissionReview,
    SubmissionStatus,
    expiry_for,
    now_iso,
)
from slack_data.submissions.store import RepositoryDep
from slack_data.utilities import turnstile
from slack_data.utilities.ulid import is_ulid, new_ulid

logger = logging.getLogger(__name__)

submissions_router = APIRouter(
    prefix="/submissions",
    tags=["submissions"],
    responses={404: {"description": "Not found"}},
)

# A correction is a few short strings. 16 KB is generous for that and small
# enough that a bot cannot use the endpoint as free storage. Enforced on the
# declared length before the body is read, so an oversized request costs nothing.
MAX_BODY_BYTES = 16 * 1024

# `RETENTION_DAYS` is imported, not defined here, and is re-exported only
# because this module used to own it. It belongs beside `expiry_for` in
# models/submissions.py: when the router owned it, the value reached the store
# on create and nowhere else, so `review()` re-stamped every reviewed record
# with a hardcoded 365 days and the env var quietly meant half of what it said.

# The triage list is a working queue, not an archive.
MAX_LIST_LIMIT = 100


def warn_if_captcha_is_unconfigured() -> None:
    """Say so in the logs at startup, not when a visitor discovers it.

    Hosted without a `TURNSTILE_SECRET`, every `POST /submissions/` answers 503
    (see `_check_captcha`). Nothing else about the site changes, so the symptom
    is invisible until a real person fills in the form and loses what they
    typed — and, since the app sends no mail, there is no missing alert to
    notice either.

    One line in CloudWatch right after a deploy is not a safeguard on its own —
    `infra/preflight.sh` refuses the dangerous combination beforehand and
    `infra/verify-deploy.sh` probes the live site afterwards — but it is the
    only one of the three emitted by the running thing itself, so it is also
    the only one that still fires when somebody deploys by hand.
    """
    from slack_data import database

    if database.READ_ONLY and not turnstile.is_enabled():
        logger.warning(
            "TURNSTILE_SECRET is not set: POST /submissions/ will answer 503 for"
            " every request. If the frontend was built with"
            " VITE_TURNSTILE_SITE_KEY, visitors are being shown a form that"
            " cannot succeed. See infra/README.md > Turnstile."
        )


def enforce_body_size(request: Request) -> None:
    """Reject an oversized body on its Content-Length, before reading it."""
    # Content-Length only, so a chunked request skips this. That is fine and
    # not worth closing here: API Gateway caps a payload at 10 MB before the
    # Lambda is invoked, and every field this endpoint stores is length-capped
    # by the model besides. This check exists to make the *common* oversized
    # request free, not to be the last line of defence.
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"submission body must be at most {MAX_BODY_BYTES} bytes",
        )


def _hosted() -> bool:
    from slack_data import database

    return database.READ_ONLY


def _check_captcha(token: str | None) -> None:
    """Redeem the Turnstile token, or fail closed. See utilities/turnstile.py."""
    if not turnstile.is_enabled():
        if _hosted():
            # Hosted without a secret is a misconfiguration. Refusing beats
            # running the public write endpoint with its abuse control off.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="submissions are temporarily unavailable",
            )
        return  # local dev

    try:
        passed = turnstile.verify(token)
    except turnstile.CaptchaUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="could not verify the captcha, please try again",
        )
    if not passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="captcha verification failed",
        )


# `""`, not `"/"`, so the canonical path is `/submissions` with no trailing
# slash. That is not cosmetic: API Gateway refuses a route key with an empty
# path segment ("Part of the given route key path is empty"), so `POST
# /submissions/` cannot be named in `RouteSettings` and therefore cannot be
# throttled. The public write endpoint is the one route where that matters most.
# FastAPI still serves `/submissions/` — `redirect_slashes` sends it here with a
# 307 — so anything already calling the old spelling keeps working, it simply
# spends an extra round trip and lands unthrottled. See infra/serverless.yml.
@submissions_router.post(
    "",
    response_model=SubmissionReceipt,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_body_size)],
)
def create_submission(submission: SubmissionCreate, repository: RepositoryDep):
    """Record a correction or a new-item tip. Public.

    Note what is *not* recorded: no IP address and no user agent. They are the
    tempting thing to keep for abuse triage, and keeping them would turn an
    anonymous suggestion box into a personal-data store. The captcha and the
    gateway's rate limit cover abuse instead. See SUBMISSIONS_PLAN.md § Privacy.
    """
    if submission.website:
        # Honeypot: a hidden input no human sees. Answer exactly as success
        # does — same status, same shape, a well-formed id — so the bot learns
        # nothing and has no signal to tune against. Nothing is stored.
        return SubmissionReceipt(submission_id=new_ulid())

    _check_captcha(submission.captcha_token)

    record = Submission(
        submission_id=new_ulid(),
        kind=submission.kind,
        gear_type=submission.gear_type,
        gear_id=submission.gear_id,
        gear_name=submission.gear_name,
        gear_brand=submission.gear_brand,
        changes=submission.changes,
        note=submission.note,
        source_url=submission.source_url,
        submitter_email=submission.submitter_email,
        # Phase 3 fills this in from the Cognito `sub` of a signed-in contributor.
        submitted_by=None,
        status=SubmissionStatus.PENDING,
        created_at=now_iso(),
        expires_at=expiry_for(SubmissionStatus.PENDING),
    )
    repository.create(record)

    # No alert is sent. **SlackData sends no email at all** — see the module
    # docstring. The admin finds new submissions at /admin, which carries an
    # outstanding-work counter for exactly that purpose.
    return SubmissionReceipt(submission_id=record.submission_id)


# `""` for the same reason as the POST above, and also *because* of it: with a
# route still mounted at `/submissions/`, a POST to that spelling matched this
# path and answered 405 instead of redirecting. Both canonical paths are now
# un-slashed, so `/submissions/` matches nothing and Starlette's
# `redirect_slashes` 307s either verb to the right place.
@submissions_router.get(
    "",
    response_model=list[Submission],
    dependencies=[Depends(require_admin)],
)
def read_submissions(
    repository: RepositoryDep,
    submission_status: Annotated[SubmissionStatus, Query(alias="status")] = SubmissionStatus.PENDING,
    limit: Annotated[int, Query(ge=1, le=MAX_LIST_LIMIT)] = 50,
):
    """The triage list: submissions with this status, **oldest first**."""
    return repository.list_by_status(submission_status, limit)


@submissions_router.get(
    "/{submission_id}",
    response_model=Submission,
    dependencies=[Depends(require_admin)],
)
def read_submission(submission_id: Annotated[str, Path()], repository: RepositoryDep):
    if not is_ulid(submission_id):
        # Shape-check first so a junk id 404s without a round trip to the store.
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")
    record = repository.get(submission_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")
    return record


@submissions_router.patch(
    "/{submission_id}",
    response_model=Submission,
    dependencies=[Depends(require_admin)],
)
def review_submission(
    submission_id: Annotated[str, Path()],
    review: SubmissionReview,
    repository: RepositoryDep,
):
    """Approve or reject. **This does not change the catalogue.**

    It records the outcome and nothing else. The gear data still changes the way
    it always has: edit the root `*.json` and redeploy. The admin UI says so on
    screen, next to the JSON patch it generates.

    `SubmissionReview` carries only `status` and `review_note`, so there is no
    request shape that can edit what was submitted — the record stays a faithful
    account of what the submitter actually said.
    """
    if not is_ulid(submission_id):
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")
    reviewed = repository.review(submission_id, review.status, review.review_note)
    if reviewed is None:
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")
    return reviewed


# `RETENTION_DAYS` is re-exported for the tests and for anything that wants the
# retention window without importing the model module — the same courtesy
# `manufacturer_router` extends for `MAX_BATCH_ITEMS`. It is *defined* in
# models/submissions.py, deliberately: see the note beside MAX_BODY_BYTES.
__all__ = ["MAX_BODY_BYTES", "MAX_LIST_LIMIT", "RETENTION_DAYS", "submissions_router"]
