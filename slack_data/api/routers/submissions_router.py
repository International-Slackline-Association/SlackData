"""
Submissions — the admin triage queue.

Since phase 6 (LIVE_EDITING_PHASE_6.md, D56, P6-H) there is no public
"suggest a correction" box: anyone with an ISA account edits instead, and the
public `POST /submissions`, its captcha, honeypot and throttle are gone. What
stays, admin-only, is the queue of what the store still holds:

- suggestions sent before the switch-off — the admin opens the item, edits it
  live, then marks the suggestion handled (`applied`) or rejects it (P6-G);
- the manufacturer API's to-do rows: photo links to upload by hand (P5-H).

**This router never touches the catalogue.** It takes no `SessionDep`: the
catalogue session is not the store these records live in, and there is a test
for exactly this. **The app sends no email.** The admin finds work at
`/admin`, which carries an outstanding counter. See SUBMISSIONS_PLAN.md
§ Alerting.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from slack_data.api.auth import require_admin
from slack_data.models.submissions import (
    RETENTION_DAYS,
    Submission,
    SubmissionReview,
    SubmissionStatus,
)
from slack_data.submissions.store import RepositoryDep
from slack_data.utilities.ulid import is_ulid

submissions_router = APIRouter(
    prefix="/submissions",
    tags=["submissions"],
    responses={404: {"description": "Not found"}},
)

# The triage list is a working queue, not an archive.
MAX_LIST_LIMIT = 100


# `""`, not `"/"`: the canonical path is `/submissions`, and Starlette's
# `redirect_slashes` sends `/submissions/` here with a 307.
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
    """Record the outcome — handled (`applied`) or rejected. **This does not
    change the catalogue**: the admin edits the item itself, live, first.

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
__all__ = ["MAX_LIST_LIMIT", "RETENTION_DAYS", "submissions_router"]
