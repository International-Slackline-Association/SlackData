"""
Submissions — the public suggestion box and the admin triage queue.

This is the first endpoint in SlackData that an anonymous member of the public
can write through, so most of what is asserted here is about what it *refuses*:
unknown gear types, invented field names, oversized bodies, bots, and any route
that isn't the POST being reachable without a token.

The other theme is separation. `POST /submissions/` has to work on the live
site, where the catalogue SQLite file is opened read-only — so the router must
never touch the catalogue session. That is easy to get wrong and impossible to
notice locally, where the catalogue is writable, hence the explicit test below.
"""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from slack_data.api import auth
from slack_data.api.routing import register_routers
from slack_data.database import get_session
from slack_data.models.submissions import (
    MAX_CHANGES,
    MAX_NOTE_LENGTH,
    MAX_VALUE_LENGTH,
    SubmissionStatus,
)
from slack_data.submissions.store import get_repository
from slack_data.utilities import turnstile
from slack_data.utilities.ulid import is_ulid

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

NEW_ITEM = {
    "kind": "new_item",
    "gear_type": "weblocks",
    "gear_name": "Some Unlisted Weblock",
    "changes": {"brand_name": "Balance Community"},
}


def submit(client, **overrides):
    return client.post("/submissions/", json={**CORRECTION, **overrides})


def pending(client):
    return client.get("/submissions/", headers=ADMIN).json()


# --- The happy path ---------------------------------------------------------


def test_a_correction_is_accepted_and_appears_in_triage(client):
    response = submit(client)
    assert response.status_code == 201

    receipt = response.json()
    assert is_ulid(receipt["submission_id"])
    assert receipt["status"] == "pending"

    queued = pending(client)
    assert len(queued) == 1
    assert queued[0]["submission_id"] == receipt["submission_id"]
    assert queued[0]["changes"] == {"breaking_strength": "31"}
    assert queued[0]["gear_id"] == 12


def test_a_new_item_tip_is_accepted(client):
    assert client.post("/submissions/", json=NEW_ITEM).status_code == 201
    assert pending(client)[0]["kind"] == "new_item"


def test_a_correction_may_be_a_note_alone(client):
    """Not every reporter knows which field is wrong — prose is still useful."""
    assert submit(client, changes={}, note="The photo is of a different model.").status_code == 201


def test_the_receipt_does_not_echo_the_submission(client):
    """Otherwise the POST doubles as a read endpoint for anonymous callers."""
    body = submit(client).json()
    assert set(body) == {"submission_id", "status"}


def test_a_submission_records_no_ip_or_user_agent(client):
    """§ Privacy: an anonymous box that logs IPs is not an anonymous box."""
    submit(client)
    stored = pending(client)[0]
    assert "ip" not in stored and "user_agent" not in stored
    assert stored["submitter_email"] is None


def test_a_submission_carries_an_expiry(client):
    """DynamoDB's TTL is what actually enforces retention — it must be set."""
    submit(client)
    assert pending(client)[0]["expires_at"] > 0


def test_submitted_by_is_carried_as_null_for_phase_3(client):
    submit(client)
    assert pending(client)[0]["submitted_by"] is None


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


# --- What it refuses --------------------------------------------------------


def test_an_unknown_gear_type_is_rejected(client):
    assert submit(client, gear_type="parachutes").status_code == 422


def test_an_unknown_field_name_is_rejected(client):
    """Without this the queue fills with typos no one can turn into a patch."""
    response = submit(client, changes={"breaking_stength": "31"})
    assert response.status_code == 422
    assert "breaking_stength" in response.text


def test_the_allowed_fields_come_from_the_real_model(client):
    """A field is correctable because the model has it — never because a list says so."""
    from slack_data.models.webbing import WebbingUpdate
    from slack_data.submissions.fields import CORRECTABLE_FIELDS

    assert "weight" in WebbingUpdate.model_fields
    assert submit(client, changes={"weight": "62"}).status_code == 201
    # And the exclusions hold: brand_id is a foreign key, not a fact to correct.
    assert "brand_id" not in CORRECTABLE_FIELDS["webbings"]
    assert submit(client, changes={"brand_id": "17"}).status_code == 422


def test_a_correction_must_name_the_item_it_corrects(client):
    assert submit(client, gear_id=None).status_code == 422


def test_a_new_item_cannot_claim_an_existing_id(client):
    """Otherwise it reads as a correction to whatever row holds that id."""
    response = client.post("/submissions/", json={**NEW_ITEM, "gear_id": 12})
    assert response.status_code == 422


def test_a_new_item_needs_a_name(client):
    response = client.post("/submissions/", json={**NEW_ITEM, "gear_name": ""})
    assert response.status_code == 422


def test_an_empty_correction_is_rejected(client):
    assert submit(client, changes={}, note=None).status_code == 422


def test_a_blank_proposed_value_is_rejected(client):
    assert submit(client, changes={"breaking_strength": "   "}).status_code == 422


def test_a_bad_source_url_is_rejected(client):
    assert submit(client, source_url="javascript:alert(1)").status_code == 422
    assert submit(client, source_url="ftp://example.com").status_code == 422


def test_a_bad_email_is_rejected(client):
    assert submit(client, submitter_email="not-an-email").status_code == 422
    assert submit(client, submitter_email="a@b.co").status_code == 201


def test_blank_optional_strings_are_treated_as_omitted(client):
    """An untouched form input posts "", which must not become a stored value."""
    response = submit(client, source_url="", submitter_email="", gear_name="")
    assert response.status_code == 201
    stored = pending(client)[0]
    assert stored["source_url"] is None
    assert stored["submitter_email"] is None


# --- Caps -------------------------------------------------------------------


def test_too_many_changed_fields_are_rejected(client):
    """Weblocks, because it is one of only two types with more than MAX_CHANGES
    correctable fields — so the cap is reached with entirely *valid* names, and
    the test is about the cap rather than about the unknown-field check."""
    from slack_data.submissions.fields import CORRECTABLE_FIELDS

    names = sorted(CORRECTABLE_FIELDS["weblocks"])[: MAX_CHANGES + 1]
    assert len(names) == MAX_CHANGES + 1, "weblocks must have enough fields to exceed the cap"

    response = client.post(
        "/submissions/",
        json={
            "gear_type": "weblocks",
            "gear_id": 3,
            "changes": {name: "x" for name in names},
        },
    )
    assert response.status_code == 422
    assert str(MAX_CHANGES) in response.text

    # ...and the boundary itself is allowed.
    assert (
        client.post(
            "/submissions/",
            json={
                "gear_type": "weblocks",
                "gear_id": 3,
                "changes": {name: "x" for name in names[:MAX_CHANGES]},
            },
        ).status_code
        == 201
    )


def test_an_overlong_value_is_rejected(client):
    assert submit(client, changes={"name": "x" * (MAX_VALUE_LENGTH + 1)}).status_code == 422
    assert submit(client, changes={"name": "x" * MAX_VALUE_LENGTH}).status_code == 201


def test_an_overlong_note_is_rejected(client):
    assert submit(client, note="x" * (MAX_NOTE_LENGTH + 1)).status_code == 422


def test_an_oversized_body_is_rejected_before_it_is_read(client):
    """A 413 on Content-Length, so the payload never costs us anything."""
    response = client.post(
        "/submissions/",
        content=b'{"gear_type": "webbings", "padding": "' + b"x" * 20_000 + b'"}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


# --- Bots -------------------------------------------------------------------


def test_the_honeypot_stores_nothing_but_looks_like_success(client):
    """A bot must learn nothing from the response, so it mirrors a real receipt."""
    response = submit(client, website="http://spam.example")
    assert response.status_code == 201
    assert is_ulid(response.json()["submission_id"])
    assert response.json()["status"] == "pending"
    assert pending(client) == []


def test_the_honeypot_short_circuits_before_the_captcha(client, monkeypatch):
    """A bot that trips the honeypot must not even cost us a Cloudflare call."""
    calls = []
    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")
    monkeypatch.setattr(turnstile, "verify", lambda token: calls.append(token) or True)

    assert submit(client, website="http://spam.example").status_code == 201
    assert calls == []


def test_the_honeypot_and_captcha_fields_are_never_stored(client):
    submit(client, captcha_token="a-token")
    stored = pending(client)[0]
    assert "website" not in stored
    assert "captcha_token" not in stored


# --- Captcha ----------------------------------------------------------------


def test_no_captcha_is_required_locally(client):
    """Local dev and Cypress run with no Cloudflare secret and must still work."""
    assert not turnstile.is_enabled()
    assert submit(client).status_code == 201


def test_a_failed_captcha_is_rejected(client, monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")
    monkeypatch.setattr(turnstile, "verify", lambda token: False)
    assert submit(client, captcha_token="bad").status_code == 400


def test_a_passed_captcha_is_accepted(client, monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")
    monkeypatch.setattr(turnstile, "verify", lambda token: True)
    assert submit(client, captcha_token="good").status_code == 201


def test_an_unreachable_captcha_is_a_503_not_a_rejection(client, monkeypatch):
    """Blame the outage, not the submitter — a 400 would read as "you failed"."""
    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")

    def unavailable(token):
        raise turnstile.CaptchaUnavailable("cloudflare down")

    monkeypatch.setattr(turnstile, "verify", unavailable)
    assert submit(client, captcha_token="good").status_code == 503


def test_hosted_without_a_captcha_secret_refuses_submissions(client, monkeypatch):
    """Fails closed. A missing secret must not silently disable the abuse control."""
    from slack_data import database

    monkeypatch.delenv("TURNSTILE_SECRET", raising=False)
    monkeypatch.setattr(database, "READ_ONLY", True)
    assert submit(client).status_code == 503


def test_the_startup_warning_fires_only_when_hosted_and_unconfigured(monkeypatch, caplog):
    """The misconfiguration announces itself in the logs.

    Quiet locally (no secret is normal there) and quiet when configured; loud
    only in the state where a hosted deploy will refuse every submission.
    """
    import logging

    from slack_data import database
    from slack_data.api.routers import submissions_router as router

    def warned() -> bool:
        caplog.clear()
        with caplog.at_level(logging.WARNING, logger=router.logger.name):
            router.warn_if_captcha_is_unconfigured()
        return any("TURNSTILE_SECRET" in r.message for r in caplog.records)

    monkeypatch.delenv("TURNSTILE_SECRET", raising=False)

    monkeypatch.setattr(database, "READ_ONLY", False)
    assert not warned(), "local dev has no secret and that is normal — stay quiet"

    monkeypatch.setattr(database, "READ_ONLY", True)
    assert warned(), "hosted with no secret is the silent failure this exists for"

    monkeypatch.setenv("TURNSTILE_SECRET", "configured")
    assert not warned(), "configured hosted must be quiet"


def test_the_hosted_entrypoint_runs_the_startup_check():
    """**Pinned because the obvious placement does not work.**

    `lambda_handler.py` builds Mangum with `lifespan="off"`, so a check placed in
    `main.py`'s lifespan runs under uvicorn, passes its test, and is silent in
    the only environment it exists for. It was written there first, and a run of
    the real container image is what caught it. The hosted cold-start path is
    this module, so the call has to be here.
    """
    from pathlib import Path

    source = Path("slack_data/lambda_handler.py").read_text()
    assert "warn_if_captcha_is_unconfigured()" in source, (
        "the hosted cold start must run the captcha configuration check;"
        " main.py's lifespan does not execute under Mangum(lifespan='off')"
    )


def test_a_tokenless_post_separates_the_two_captcha_configurations(
    client, submissions, monkeypatch
):
    """**A deploy-verification contract, not just a status code.**

    `infra/verify-deploy.sh` decides whether the live Lambda has a
    `TURNSTILE_SECRET` by POSTing with **no** captcha token and reading the
    answer. It cannot solve a captcha from a shell, and it does not need to —
    these two codes separate the configurations exactly, and neither stores
    anything:

        secret set     -> verify(None) is False          -> 400
        secret not set -> the hosted no-secret branch     -> 503

    That is the inverse of how it reads: 400 is the healthy answer. If either
    code changes, the post-deploy check silently starts reporting the wrong
    thing about production, so it is pinned here.
    """
    from slack_data import database

    monkeypatch.setattr(database, "READ_ONLY", True)  # hosted

    monkeypatch.delenv("TURNSTILE_SECRET", raising=False)
    assert submit(client, captcha_token=None).status_code == 503, (
        "no secret hosted must be 503 — verify-deploy.sh reads this as 'misconfigured'"
    )

    monkeypatch.setenv("TURNSTILE_SECRET", "a-real-looking-secret")
    assert submit(client, captcha_token=None).status_code == 400, (
        "a secret with no token must be 400 — verify-deploy.sh reads this as 'healthy'"
    )
    # Asserted against the store rather than the triage route: READ_ONLY is
    # patched on above, so `require_admin` is in its hosted lockout and the
    # admin list would 503 regardless of what was stored.
    assert submissions.list_by_status(SubmissionStatus.PENDING) == [], (
        "neither probe may store a submission"
    )


def test_the_deploy_verifier_probes_the_documented_codes():
    """The script and the contract above must not drift apart.

    Cheap, and it is the only thing connecting a bash file nobody runs in CI to
    the behaviour it depends on.
    """
    from pathlib import Path

    script = Path("infra/verify-deploy.sh").read_text()
    assert "400)" in script and "503)" in script, (
        "verify-deploy.sh must branch on both codes the API actually returns"
    )
    assert "SECRET_LIVE=yes" in script and "SECRET_LIVE=no" in script


def test_turnstile_verify_rejects_a_missing_token(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")
    assert turnstile.verify(None) is False
    assert turnstile.verify("") is False


def test_turnstile_raises_rather_than_passing_on_a_network_error(monkeypatch):
    import httpx

    monkeypatch.setenv("TURNSTILE_SECRET", "test-secret")

    def boom(*args, **kwargs):
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(turnstile.CaptchaUnavailable):
        turnstile.verify("a-token")


# --- Separation from the catalogue ------------------------------------------


def test_submissions_never_touch_the_catalogue_session(submissions):
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

    with TestClient(app) as unwired:
        created = unwired.post("/submissions/", json=CORRECTION)
        assert created.status_code == 201
        assert unwired.get("/submissions/", headers=ADMIN).status_code == 200
        assert (
            unwired.patch(
                f"/submissions/{created.json()['submission_id']}",
                json={"status": "approved"},
                headers=ADMIN,
            ).status_code
            == 200
        )


def test_submissions_stay_mounted_when_the_catalogue_is_read_only(read_only_client):
    """Hosted, the catalogue drops its writes but this endpoint must survive.

    It writes to DynamoDB, a different store entirely — see
    slack_data/api/routing.py § WRITABLE_ROUTERS.
    """
    assert read_only_client.post("/submissions/", json=CORRECTION).status_code == 201
    assert read_only_client.get("/submissions/", headers=ADMIN).status_code == 200
    # ...while the catalogue write next door is still gone.
    assert read_only_client.delete("/webbing/1").status_code == 405


def test_submissions_are_in_the_openapi_schema_when_hosted(read_only_client):
    """The public POST is a documented route; the read-only filter must spare it."""
    paths = read_only_client.get("/openapi.json").json()["paths"]
    assert "post" in paths["/submissions/"]
    assert "patch" in paths["/submissions/{submission_id}"]


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


def test_the_honeypot_still_stores_nothing(client):
    """Kept from the old alert block, because the assertion outlived the mailer.

    The honeypot's job was never only "send no mail" — it is that a bot gets a
    well-formed receipt and the store stays empty, so there is no signal to tune
    against.
    """
    response = submit(client, website="http://spam.example")
    assert response.status_code == 201
    assert is_ulid(response.json()["submission_id"])
    assert pending(client) == []
# --- Durable item identity ----------------------------------------------------


def test_a_correction_records_the_brand_not_just_the_name(client):
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


def test_a_blank_brand_is_stored_as_absent(client):
    submit(client, gear_brand="   ")
    assert pending(client)[0]["gear_brand"] is None


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
    assert duplicates["weblocks.json"], "weblocks used to contain duplicate product names"


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
