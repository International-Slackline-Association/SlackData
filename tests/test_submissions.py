"""
Submissions — the admin triage queue.

Since phase 6 (LIVE_EDITING_PHASE_6.md, D56, P6-G/H) there is no public
suggestion box: anyone with an ISA account edits instead. What stays is the
store and its triage — the suggestions sent before the switch-off, until they
are dealt with or expire, and the manufacturer API's to-do rows (photo links,
P5-H). So the rows here are put straight into the store, as those two ways
left them, and what is asserted is the queue: who may read it, its order, the
review states and their expiry, and that it never touches the catalogue.
"""

import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

from slack_data.api import auth
from slack_data.api.routing import register_routers
from slack_data.changelog.store import get_changelog_repository
from slack_data.database import get_session
from slack_data.models.submissions import (
    Submission,
    SubmissionStatus,
    expiry_for,
    now_iso,
)
from slack_data.people.store import get_people_repository
from slack_data.submissions.store import get_repository
from slack_data.utilities.ulid import new_ulid

ADMIN = {"Authorization": f"Bearer {auth.ADMIN_DEV_TOKEN}"}

CORRECTION = {
    "kind": "correction",
    "gear_type": "webbings",
    "gear_id": 12,
    "gear_name": "Type 18",
    "changes": {"breaking_strength": "31"},
    "note": "The manufacturer's spec sheet says 31 kN, not 27.",
    "source_url": "https://example.com/spec.pdf",
}


class Stored:
    """What the old public POST answered, for the tests that read the id back."""

    def __init__(self, submission_id: str) -> None:
        self.submission_id = submission_id

    def json(self) -> dict:
        return {"submission_id": self.submission_id}


def a_submission(**overrides) -> Submission:
    return Submission(
        submission_id=new_ulid(),
        status=SubmissionStatus.PENDING,
        created_at=now_iso(),
        expires_at=expiry_for(SubmissionStatus.PENDING),
        **{**CORRECTION, **overrides},
    )


def submit(client, **overrides):
    """A suggestion as the box stored it, before it was switched off."""
    repository = client.app.dependency_overrides[get_repository]()
    return Stored(repository.create(a_submission(**overrides)).submission_id)


def pending(client):
    return client.get("/submissions", headers=ADMIN).json()


# --- Triage ordering and filtering ------------------------------------------


def test_the_queue_is_oldest_first(client):
    for i in range(5):
        submit(client, note=f"note {i}")
    notes = [s["note"] for s in pending(client)]
    assert notes == [f"note {i}" for i in range(5)]


def test_the_queue_defaults_to_pending_only(client):
    first = submit(client).json()["submission_id"]
    submit(client)

    client.patch(f"/submissions/{first}", json={"status": "approved"}, headers=ADMIN)

    assert [s["submission_id"] for s in pending(client)] != [first]
    assert len(pending(client)) == 1

    approved = client.get("/submissions/?status=approved", headers=ADMIN).json()
    assert [s["submission_id"] for s in approved] == [first]


def test_the_queue_limit_is_bounded(client):
    assert client.get("/submissions/?limit=101", headers=ADMIN).status_code == 422
    assert client.get("/submissions/?limit=0", headers=ADMIN).status_code == 422
    assert client.get("/submissions/?limit=100", headers=ADMIN).status_code == 200


def test_an_unknown_status_is_rejected(client):
    assert client.get("/submissions/?status=maybe", headers=ADMIN).status_code == 422


# --- Review -----------------------------------------------------------------


def test_approving_records_the_outcome(client):
    submission_id = submit(client).json()["submission_id"]
    response = client.patch(
        f"/submissions/{submission_id}",
        json={"status": "approved", "review_note": "Confirmed against the spec sheet."},
        headers=ADMIN,
    )
    assert response.status_code == 200

    reviewed = response.json()
    assert reviewed["status"] == "approved"
    assert reviewed["review_note"] == "Confirmed against the spec sheet."
    assert reviewed["reviewed_at"] is not None


def test_rejecting_records_the_outcome(client):
    submission_id = submit(client).json()["submission_id"]
    response = client.patch(
        f"/submissions/{submission_id}",
        json={"status": "rejected", "review_note": "Source doesn't say that."},
        headers=ADMIN,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


def test_approving_does_not_change_the_catalogue(client, session, brand):
    """The heart of Phase 2: a review is a note, not an edit.

    Approving must leave the gear row exactly as it was — the JSON patch is
    applied by hand and shipped by redeploy (SUBMISSIONS_PLAN.md § What Phase 2
    is explicitly NOT). If this ever fails, the feature has quietly become live
    catalogue editing.
    """
    from slack_data.models.webbing import Webbing

    webbing = Webbing(name="Type 18", width=25.0, brand_id=brand.id, breaking_strength=27)
    session.add(webbing)
    session.commit()
    session.refresh(webbing)

    submission_id = submit(
        client, gear_id=webbing.id, changes={"breaking_strength": "31"}
    ).json()["submission_id"]
    client.patch(f"/submissions/{submission_id}", json={"status": "approved"}, headers=ADMIN)

    session.refresh(webbing)
    assert webbing.breaking_strength == 27


def test_a_review_cannot_rewrite_what_was_submitted(client):
    """The record must stay a faithful account of what the submitter said."""
    submission_id = submit(client).json()["submission_id"]
    response = client.patch(
        f"/submissions/{submission_id}",
        json={"status": "approved", "changes": {"breaking_strength": "99"}, "note": "hacked"},
        headers=ADMIN,
    )
    assert response.status_code == 200
    assert response.json()["changes"] == {"breaking_strength": "31"}
    assert response.json()["note"] == CORRECTION["note"]


def test_a_review_cannot_set_pending(client):
    """"Un-reviewing" isn't a workflow — it would just hide the outcome."""
    submission_id = submit(client).json()["submission_id"]
    response = client.patch(
        f"/submissions/{submission_id}", json={"status": "pending"}, headers=ADMIN
    )
    assert response.status_code == 422


def test_reviewing_an_unknown_id_is_a_404(client):
    response = client.patch(
        "/submissions/01J0000000000000000000000A", json={"status": "approved"}, headers=ADMIN
    )
    assert response.status_code == 404


def test_a_junk_id_is_a_404_not_a_500(client):
    assert client.get("/submissions/../../etc/passwd", headers=ADMIN).status_code == 404
    assert client.get("/submissions/not-a-ulid", headers=ADMIN).status_code == 404


def test_reading_one_submission(client):
    submission_id = submit(client).json()["submission_id"]
    response = client.get(f"/submissions/{submission_id}", headers=ADMIN)
    assert response.status_code == 200
    assert response.json()["submission_id"] == submission_id


# --- Separation from the catalogue ------------------------------------------


def test_submissions_never_touch_the_catalogue_session(submissions, people, changelog):
    """The one failure that local testing cannot otherwise catch.

    Hosted, the catalogue is opened `mode=ro&immutable=1`. A submissions route
    that took a `SessionDep` would pass every test on a developer's writable
    SQLite and fail on the live site. So this app wires the catalogue session to
    a dependency that explodes: if any submissions route reaches for it, these
    calls 500 instead of succeeding.
    """
    app = FastAPI()
    register_routers(app, read_only=False)

    def no_catalogue():
        raise AssertionError("a submissions route reached for the catalogue session")

    app.dependency_overrides[get_session] = no_catalogue
    app.dependency_overrides[get_repository] = lambda: submissions
    app.dependency_overrides[get_people_repository] = lambda: people
    app.dependency_overrides[get_changelog_repository] = lambda: changelog
    stored = submissions.create(a_submission())

    with TestClient(app) as unwired:
        assert unwired.get("/submissions", headers=ADMIN).status_code == 200
        assert (
            unwired.patch(
                f"/submissions/{stored.submission_id}", json={"status": "applied"}, headers=ADMIN
            ).status_code
            == 200
        )


def test_the_public_box_is_gone(client):
    """D56, P6-H: nobody posts a suggestion any more — they sign in and edit."""
    assert client.post("/submissions", json=CORRECTION).status_code in (401, 405)
    assert client.get("/submissions").status_code == 401


def test_triage_stays_mounted_when_the_catalogue_is_read_only(read_only_client):
    """It reads and writes DynamoDB, a different store entirely — see
    slack_data/api/routing.py § WRITABLE_ROUTERS."""
    assert read_only_client.get("/submissions", headers=ADMIN).status_code == 200
    assert read_only_client.delete("/webbing/1").status_code == 405


# --- The repository contract ------------------------------------------------


def test_the_repository_has_no_delete(submissions):
    """Append-only, in two places: no method here, no IAM grant hosted."""
    from slack_data.submissions.repository import SubmissionRepository

    assert not hasattr(submissions, "delete")
    assert "delete" not in SubmissionRepository.__dict__


def test_sqlite_and_in_memory_repositories_agree(tmp_path, submissions):
    """The local store must behave like the one the tests use, or tests lie."""
    from slack_data.models.submissions import Submission
    from slack_data.submissions.repository import SqliteSubmissionRepository
    from slack_data.utilities.ulid import new_ulid

    sqlite_repo = SqliteSubmissionRepository(str(tmp_path / "submissions.db"))

    records = [
        Submission(
            submission_id=new_ulid(),
            kind="correction",
            gear_type="webbings",
            gear_id=1,
            changes={"weight": str(i)},
            created_at="2026-08-19T10:00:00.000Z",
            expires_at=1,
        )
        for i in range(3)
    ]
    for record in records:
        sqlite_repo.create(record)
        submissions.create(record)

    for repo in (sqlite_repo, submissions):
        queued = repo.list_by_status(SubmissionStatus.PENDING)
        assert [s.submission_id for s in queued] == [r.submission_id for r in records]
        assert repo.get(records[0].submission_id).changes == {"weight": "0"}
        assert repo.get("01J0000000000000000000000A") is None

        reviewed = repo.review(records[0].submission_id, SubmissionStatus.APPROVED, "ok")
        assert reviewed.status is SubmissionStatus.APPROVED
        assert reviewed.reviewed_at is not None
        assert repo.review("01J0000000000000000000000A", SubmissionStatus.APPROVED, None) is None
        assert len(repo.list_by_status(SubmissionStatus.PENDING)) == 2


# --- The applied ("handled") state -------------------------------------------


def test_an_approved_submission_can_be_marked_applied(client):
    """Closing the loop: the admin records that the JSON edit actually shipped."""
    submission_id = submit(client).json()["submission_id"]
    client.patch(f"/submissions/{submission_id}", json={"status": "approved"}, headers=ADMIN)

    response = client.patch(
        f"/submissions/{submission_id}",
        json={"status": "applied", "review_note": "shipped in a1b2c3d"},
        headers=ADMIN,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "applied"
    assert response.json()["review_note"] == "shipped in a1b2c3d"

    applied = client.get("/submissions/?status=applied", headers=ADMIN).json()
    assert [s["submission_id"] for s in applied] == [submission_id]


def test_approved_is_not_the_end_of_the_queue(client):
    """An approved record still has a job attached, so it must stay visible."""
    submission_id = submit(client).json()["submission_id"]
    client.patch(f"/submissions/{submission_id}", json={"status": "approved"}, headers=ADMIN)

    approved = client.get("/submissions/?status=approved", headers=ADMIN).json()
    assert [s["submission_id"] for s in approved] == [submission_id]


def test_approving_suspends_the_expiry(client):
    """The rule that stops unfinished work being swept away by the TTL.

    A correction we have agreed with but not yet shipped must not be deleted
    twelve months later with the wrong number still on the site.
    """
    submission_id = submit(client).json()["submission_id"]
    assert pending(client)[0]["expires_at"] > 0        # spam still ages out

    approved = client.patch(
        f"/submissions/{submission_id}", json={"status": "approved"}, headers=ADMIN
    ).json()
    assert approved["expires_at"] is None

    # ...and once the work is done, the clock starts again.
    applied = client.patch(
        f"/submissions/{submission_id}", json={"status": "applied"}, headers=ADMIN
    ).json()
    assert applied["expires_at"] > 0


def test_rejecting_keeps_an_expiry(client):
    """Nothing outstanding, so it should age out like anything else."""
    submission_id = submit(client).json()["submission_id"]
    rejected = client.patch(
        f"/submissions/{submission_id}", json={"status": "rejected"}, headers=ADMIN
    ).json()
    assert rejected["expires_at"] > 0


def test_expiry_for_is_the_single_rule(client):
    from slack_data.models.submissions import SubmissionStatus, expiry_for

    assert expiry_for(SubmissionStatus.APPROVED) is None
    for status in (SubmissionStatus.PENDING, SubmissionStatus.APPLIED, SubmissionStatus.REJECTED):
        assert expiry_for(status) > 0


def test_configured_retention_applies_to_a_reviewed_record_too(monkeypatch):
    """`SUBMISSION_RETENTION_DAYS` must mean one thing, not two.

    It used to be read in `submissions_router` and passed to `expiry_for` on
    **create** only, so both repositories' `review()` re-stamped the record with
    the hardcoded 365-day default. Setting the variable to 90 therefore shortened
    retention for a pending record and *lengthened* it for a reviewed one — the
    exact opposite of configuring a retention policy.

    Patching the module global rather than reloading the module is deliberate:
    `expiry_epoch` reads `RETENTION_DAYS` at call time, which is the property
    under test, and a reload would hand every other module a second, unequal copy
    of `Submission` and break tests that have nothing to do with retention.
    """
    from slack_data.models import submissions as model

    monkeypatch.setattr(model, "RETENTION_DAYS", 30)

    thirty_days = model.expiry_for(model.SubmissionStatus.REJECTED)
    a_year = model.expiry_epoch(days=365)
    assert thirty_days < a_year - 300 * 86_400
    # An explicit `days` still wins, and APPROVED still never expires.
    assert model.expiry_for(model.SubmissionStatus.PENDING, days=365) > thirty_days
    assert model.expiry_for(model.SubmissionStatus.APPROVED) is None


def test_the_retention_window_comes_from_the_environment():
    """Read in a subprocess: the constant is bound at import, and re-importing it
    in-process would replace `Submission` for every other test in the run."""
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from slack_data.models.submissions import RETENTION_DAYS; print(RETENTION_DAYS)",
        ],
        capture_output=True,
        text=True,
        check=False,  # the returncode is asserted below, with stderr for context
        env={**os.environ, "SUBMISSION_RETENTION_DAYS": "90"},
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "90"


def test_review_does_not_override_the_configured_window(client):
    """Every `review()` must go through `expiry_for` with no `days` of its own.

    Guards the source rather than the behaviour: a repository that passes its
    own number would silently reintroduce the split above, and only a test that
    reads the call sites can see it.
    """
    import inspect

    from slack_data.submissions import dynamo, repository

    for module in (repository, dynamo):
        source = inspect.getsource(module)
        assert "expiry_for(status, days" not in source, module.__name__
        assert "expiry_epoch(" not in source, module.__name__


def test_a_review_still_cannot_set_pending(client):
    submission_id = submit(client).json()["submission_id"]
    response = client.patch(
        f"/submissions/{submission_id}", json={"status": "pending"}, headers=ADMIN
    )
    assert response.status_code == 422


# --- No outbound email ------------------------------------------------------


def test_the_app_sends_no_email():
    """**SlackData sends nothing.** This is the guard on that decision.

    An earlier build alerted the admin through SES. It was removed because the
    cost is all on our side and permanent: an identity to verify, DKIM to keep
    valid, a sending reputation attached to slackdata.org, and an execution role
    that can send mail *as* our own domain — which is a phishing vector bought
    with no return. The admin finds new work at `/admin`.

    Where a human address is genuinely needed — a brand asking to be onboarded —
    the answer is a Google-forwarded alias on the ISA's domain (the shape
    `slackmap@slacklineinternational.org` already uses), which lives outside this
    repository and outlives whoever holds the AWS account.

    Asserted over the source rather than by mocking a client, because the failure
    to catch is someone reintroducing a *different* mailer, not this one.
    """
    from pathlib import Path

    banned = ("send_email", "send_raw_email", "sendmail", "smtplib", '"ses"', "'ses'")
    offenders = [
        f"{path}: {needle}"
        for path in Path("slack_data").rglob("*.py")
        for needle in banned
        if needle in path.read_text()
    ]
    assert offenders == [], f"the app must send no mail, but: {offenders}"




def test_a_suggestion_keeps_the_brand_not_just_the_name(client):
    """Gear ids are not stable, so the brand is what makes a record resolvable.

    The root *.json files carry no ids — a gear id is a SQLite autoincrement
    assigned by position at seed time, so inserting one item mid-file shifts
    every id after it. `"<brand> <name>"` is unique across the catalogue where
    bare `name` is not, which makes the pair the only durable reference.
    """
    submit(client, gear_brand="Balance Community")
    stored = pending(client)[0]
    assert stored["gear_brand"] == "Balance Community"
    assert stored["gear_name"] == "Type 18"


def test_the_brand_survives_review(client):
    submission_id = submit(client, gear_brand="Balance Community").json()["submission_id"]
    reviewed = client.patch(
        f"/submissions/{submission_id}", json={"status": "approved"}, headers=ADMIN
    ).json()
    assert reviewed["gear_brand"] == "Balance Community"




def test_bare_names_really_do_collide(client):
    """The premise of the field, checked against the actual seed data.

    If this ever fails, the catalogue has become name-unique and the brand is
    merely useful rather than necessary — worth knowing either way.
    """
    import collections
    import json
    from pathlib import Path

    root = Path(__file__).parent.parent
    duplicates = {}
    for filename, brand_key in (("webbings.json", "brand"), ("weblocks.json", "brand")):
        items = json.loads((root / filename).read_text())
        names = collections.Counter(str(i.get("name", "")).strip().lower() for i in items)
        duplicates[filename] = [n for n, count in names.items() if count > 1 and n]

    assert duplicates["webbings.json"], "webbings used to contain duplicate product names"
    # Weblocks became name-unique on 2026-10-07: their only collisions were the
    # EQB/Spider Bandit SH/SL twins, which were one product each and were merged.
    assert duplicates["weblocks.json"] == []


def test_brand_and_name_together_are_unique(client):
    """...and the pair is not ambiguous, which is what makes it usable."""
    import collections
    import json
    from pathlib import Path

    root = Path(__file__).parent.parent
    for filename in ("webbings.json", "weblocks.json", "grips.json", "rollers.json"):
        items = json.loads((root / filename).read_text())
        key = "brand" if "brand" in items[0] else "manufacturer"
        pairs = collections.Counter(
            (str(i.get(key, "")).strip().lower(), str(i.get("name", "")).strip().lower())
            for i in items
        )
        collisions = [p for p, count in pairs.items() if count > 1]
        assert not collisions, f"{filename} has ambiguous brand+name pairs: {collisions}"


def test_an_existing_sqlite_file_gains_new_columns(tmp_path):
    """A schema change must not break a store that already holds submissions.

    `CREATE TABLE IF NOT EXISTS` does nothing to an existing file, so without a
    migration the first write after adding a field fails with "no column named
    ...". Deleting the file is the catalogue's answer and the wrong one here:
    submissions cannot be regenerated.
    """
    import sqlite3

    from slack_data.models.submissions import Submission
    from slack_data.submissions.repository import SqliteSubmissionRepository
    from slack_data.utilities.ulid import new_ulid

    path = tmp_path / "old.db"

    # A file written by the previous schema — no gear_brand column.
    legacy = sqlite3.connect(path)
    legacy.execute(
        "CREATE TABLE submissions ("
        " submission_id TEXT PRIMARY KEY, kind TEXT NOT NULL, gear_type TEXT NOT NULL,"
        " gear_id INTEGER, gear_name TEXT, changes TEXT NOT NULL, note TEXT,"
        " source_url TEXT, submitter_email TEXT, submitted_by TEXT, status TEXT NOT NULL,"
        " created_at TEXT NOT NULL, reviewed_at TEXT, review_note TEXT, expires_at INTEGER)"
    )
    legacy.commit()
    legacy.close()

    repo = SqliteSubmissionRepository(str(path))
    record = Submission(
        submission_id=new_ulid(),
        kind="correction",
        gear_type="webbings",
        gear_id=1,
        gear_name="Type 18",
        gear_brand="Balance Community",
        changes={"weight": "62"},
        created_at="2026-08-19T10:00:00.000Z",
    )
    repo.create(record)
    assert repo.get(record.submission_id).gear_brand == "Balance Community"


def test_photo_links_round_trip_through_sqlite(tmp_path):
    """`image_urls` is a list in a TEXT column, encoded like `changes`."""
    from slack_data.models.submissions import Submission
    from slack_data.submissions.repository import SqliteSubmissionRepository
    from slack_data.utilities.ulid import new_ulid

    repo = SqliteSubmissionRepository(str(tmp_path / "photos.db"))
    links = ["https://a.example/1.jpg", "https://a.example/2.png"]
    with_photos = Submission(
        submission_id=new_ulid(), kind="manufacturer", gear_type="webbings",
        gear_id=1, changes={}, image_urls=links, status="approved",
        created_at="2026-09-15T10:00:00.000Z",
    )
    without = Submission(
        submission_id=new_ulid(), kind="correction", gear_type="webbings",
        gear_id=1, changes={"weight": "62"}, created_at="2026-09-15T10:00:00.001Z",
    )
    repo.create(with_photos)
    repo.create(without)

    assert repo.get(with_photos.submission_id).image_urls == links
    assert repo.get(without.submission_id).image_urls == []
    assert [s.image_urls for s in repo.list_by_status(SubmissionStatus.APPROVED)] == [links]


def test_a_store_that_predates_photo_links_reads_its_rows_as_having_none(tmp_path):
    """The Phase 4 schema, before `image_urls`. Its rows must still read back —
    as `[]`, not as a validation error on a NULL column — and new rows must
    still write."""
    import sqlite3

    from slack_data.models.submissions import Submission
    from slack_data.submissions.repository import SqliteSubmissionRepository
    from slack_data.utilities.ulid import new_ulid

    path = tmp_path / "phase4.db"
    old_id = new_ulid()
    legacy = sqlite3.connect(path)
    legacy.execute(
        "CREATE TABLE submissions ("
        " submission_id TEXT PRIMARY KEY, kind TEXT NOT NULL, gear_type TEXT NOT NULL,"
        " gear_id INTEGER, gear_name TEXT, gear_brand TEXT, changes TEXT NOT NULL, note TEXT,"
        " source_url TEXT, submitter_email TEXT, submitted_by TEXT, brand_id INTEGER,"
        " batch_id TEXT, manufacturer_sku TEXT, status TEXT NOT NULL,"
        " created_at TEXT NOT NULL, reviewed_at TEXT, review_note TEXT, expires_at INTEGER)"
    )
    legacy.execute(
        "INSERT INTO submissions (submission_id, kind, gear_type, changes, status, created_at)"
        " VALUES (?, 'manufacturer', 'webbings', '{}', 'approved', '2026-09-01T00:00:00.000Z')",
        (old_id,),
    )
    legacy.commit()
    legacy.close()

    repo = SqliteSubmissionRepository(str(path))
    assert repo.get(old_id).image_urls == []

    record = Submission(
        submission_id=new_ulid(), kind="manufacturer", gear_type="webbings",
        changes={}, image_urls=["https://a.example/1.jpg"], status="approved",
        created_at="2026-09-15T10:00:00.000Z",
    )
    repo.create(record)
    assert repo.get(record.submission_id).image_urls == ["https://a.example/1.jpg"]
