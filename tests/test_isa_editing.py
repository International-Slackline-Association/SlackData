"""
ISA certificates and warnings, edited by admins — phase 7 (LIVE_EDITING_PHASE_7.md).

Against an in-memory store filled from the real seeds. What must hold:

- **Admins only** (D54): an editor, or a brand's manufacturer, is refused.
- **Every change is a `safety` record** (P7-C), named in the log by the product
  as the ISA names it.
- **A match is written from the products chosen** (P7-D): `gearNames` come from
  the catalogue, and the catalogue built from the store certifies or warns
  exactly what was chosen — nothing skipped.
- **What the build would refuse is refused here**: an unknown status, a date the
  build cannot read, a certificate number that is not one, a match to a type
  that carries no such flag, or to a merged product.
- **New entries** get `slackdata-<n>` keys; **retiring** needs a reason and
  takes the entry out of the build.
- **The importer** adds new entries unmatched (with a suggestion, never
  applied), updates changed fields without touching the match, retires what the
  ISA dropped — but never an admin's own entry.
"""

import contextlib
import csv
import io
import json

import pytest
from sqlmodel import Session, select

from slack_data.catalogue import isa, isa_import
from slack_data.catalogue.build import build_engine, sources_from_documents
from slack_data.changelog.store import get_changelog_repository
from slack_data.models.leashrings import LeashRing
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.people.store import get_people_repository
from tests.test_edits import ADMIN, people, store  # noqa: F401 - fixtures

EDITOR = {"Authorization": "Bearer dev-person-token:Editor"}


def built(store):
    """The catalogue the site would serve from this store."""
    with contextlib.redirect_stdout(io.StringIO()):
        return build_engine(sources_from_documents(store.load()))


def entry(client, kind, key):
    response = client.get(f"/edit/isa/{kind}/{key}", headers=ADMIN)
    assert response.status_code == 200, response.text
    return response.json()


def patch(client, kind, key, headers=ADMIN, **body):
    rev = entry(client, kind, key)["rev"]
    return client.patch(f"/edit/isa/{kind}/{key}", headers=headers, json={"rev": rev, **body})


# --- Who -------------------------------------------------------------------------


def test_only_an_admin(client, store):
    assert patch(client, "warnings", "10", EDITOR, changes={"solution": "x"}).status_code == 403
    assert client.get("/edit/isa/warnings", headers=EDITOR).status_code == 403
    assert client.get("/edit/isa/warnings").status_code == 401


def test_the_lists_are_served_to_an_admin(client, store):
    certificates = client.get("/edit/isa/certificates", headers=ADMIN).json()
    assert len(certificates) == 33
    assert certificates[0]["key"] == "approved_gear_1" and certificates[0]["rev"] >= 1
    fields = {f["name"] for f in client.get("/edit/isa/warnings/fields", headers=ADMIN).json()}
    assert {"status", "description", "solution"} <= fields


# --- Editing ----------------------------------------------------------------------


def test_correcting_a_field_is_a_safety_record_named_as_the_isa_names_it(client, store):
    response = patch(client, "warnings", "10", changes={"solution": "Do NOT use."}, why="ISA corrected it")
    assert response.status_code == 200, response.text
    assert store.get("isa_gear_warnings", "10").data["solution"] == "Do NOT use."
    [record] = client.get("/changes", params={"flag": "safety"}).json()
    assert (record["action"], record["target_type"], record["target_id"]) == ("isa.edit", "isa_warning", "10")
    assert record["target_name"] == "Slack-Inov Nova (Recall)"
    assert record["why"] == "ISA corrected it"


def test_a_match_is_written_from_the_products_chosen_and_certifies_them(client, store):
    # approved_gear_4 matches nothing today; match it to a leash ring.
    response = patch(
        client, "certificates", "approved_gear_4",
        match={"targets": [{"collection": "leashrings", "ids": [27]}], "confidence": "exact", "note": "by hand"},
    )
    assert response.status_code == 200, response.text
    match = store.get("isa_certified", "approved_gear_4").data["match"]
    ring = store.get("leashrings", "27").data
    assert match == {
        "gearType": "leashring", "gearIds": [27], "gearNames": [f"{ring['brand']} {ring['name']}"],
        "confidence": "exact", "note": "by hand",
    }
    with Session(built(store)) as session:
        assert session.get(LeashRing, 27).isa_certified is True


def test_unmatching_a_recall_lifts_it_from_the_product(client, store):
    with Session(built(store)) as session:
        assert session.get(Webbing, 54).isa_warning is not None
    assert patch(client, "warnings", "10", match={"targets": [], "note": "not ours"}).status_code == 200
    with Session(built(store)) as session:
        assert session.get(Webbing, 54).isa_warning is None


def test_a_warning_lands_on_two_types(client, store):
    response = patch(
        client, "warnings", "40",
        match={"targets": [{"collection": "weblocks", "ids": [4]}, {"collection": "connectors", "ids": [1]}]},
    )
    assert response.status_code == 200, response.text
    assert store.get("isa_gear_warnings", "40").data["match"]["also"][0]["gearType"] == "connector"


@pytest.mark.parametrize(
    "kind, key, body, field",
    [
        ("warnings", "10", {"changes": {"status": "Danger"}}, "status"),
        ("warnings", "10", {"changes": {"date": "2020-01-31"}}, "date"),
        ("certificates", "approved_gear_1", {"changes": {"certificate": "ISA 41 A"}}, "certificate"),
        ("certificates", "approved_gear_1", {"changes": {"release_year": "2018"}}, "release_year"),
        ("certificates", "approved_gear_1", {"changes": {"colour": "red"}}, "colour"),
        ("certificates", "approved_gear_4", {"match": {"targets": [{"collection": "treepros", "ids": [1]}]}}, "match"),
        ("warnings", "40", {"match": {"targets": [{"collection": "webbings", "ids": [99999]}]}}, "match"),
    ],
)
def test_what_the_build_would_refuse_is_refused(client, store, kind, key, body, field):
    before = store.get(isa.KINDS[kind], key).data
    response = patch(client, kind, key, **body)
    assert response.status_code == 422, response.text
    assert field in {e["field"] for e in response.json()["detail"]["errors"]}
    assert store.get(isa.KINDS[kind], key).data == before


def test_a_merged_product_cannot_be_matched(client, store):
    rev = client.get("/edit/webbings/2", headers=ADMIN).json()["rev"]
    client.post("/edit/webbings/2/merge", headers=ADMIN, json={"rev": rev, "into": 1, "why": "x" * 40})
    response = patch(client, "warnings", "40", match={"targets": [{"collection": "webbings", "ids": [2]}]})
    assert response.status_code == 422


# --- New and retired ----------------------------------------------------------------


def test_a_new_entry_gets_a_key_of_ours(client, store):
    fields = {"status": "Warning", "manufacturer": "Gibbon", "model": "Test Line", "date": "01.10.26"}
    first = client.post("/edit/isa/warnings", headers=ADMIN, json={"fields": fields, "why": "ISA email"})
    second = client.post("/edit/isa/warnings", headers=ADMIN, json={"fields": fields})
    assert first.status_code == 201, first.text
    assert (first.json()["key"], second.json()["key"]) == ("slackdata-1", "slackdata-2")
    assert first.json()["entry"]["id"] == "slackdata-1"
    assert first.json()["entry"]["match"]["gearIds"] == []


def test_retiring_needs_a_reason_and_takes_it_out_of_the_build(client, store):
    rev = entry(client, "warnings", "11")["rev"]
    assert client.post("/edit/isa/warnings/11/retire", headers=ADMIN, json={"rev": rev, "why": ""}).status_code == 422
    response = client.post("/edit/isa/warnings/11/retire", headers=ADMIN, json={"rev": rev, "why": "Lifted by the ISA"})
    assert response.status_code == 200, response.text
    assert "11" not in {e["key"] for e in client.get("/edit/isa/warnings", headers=ADMIN).json()}
    from slack_data.models.isa_gear_warnings import ISAGearWarning

    with Session(built(store)) as session:
        sources = session.exec(select(ISAGearWarning.source_id).where(ISAGearWarning.gear_id == 4)).all()
        assert "11" not in sources
        assert session.get(Weblock, 4) is not None
    [record] = client.get("/changes", params={"target_type": "isa_warning", "target_id": "11"}).json()
    assert record["action"] == "isa.retire" and "safety" in record["flags"]


def test_a_rename_still_repoints_an_edited_match(client, store):
    patch(client, "certificates", "approved_gear_4", match={"targets": [{"collection": "leashrings", "ids": [27]}]})
    rev = client.get("/edit/leashrings/27", headers=ADMIN).json()["rev"]
    client.patch("/edit/leashrings/27", headers=ADMIN, json={"rev": rev, "changes": {"name": "Renamed Ring"}})
    assert store.get("isa_certified", "approved_gear_4").data["match"]["gearNames"][0].endswith("Renamed Ring")
    with Session(built(store)) as session:
        assert session.get(LeashRing, 27).isa_certified is True


# --- The importer -------------------------------------------------------------------


def capture(tmp_path, store, mutate):
    """The CSV as the ISA would publish it now: the committed one, changed."""
    with open(isa_import.ROOT / "isa_approved_data.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows = mutate(rows)
    path = tmp_path / "capture.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_the_committed_capture_matches_the_store(tmp_path, store):
    result = isa_import.plan(store.load(include_retired=True), isa.CERTIFICATES, isa_import.read_certificates(
        isa_import.ROOT / "isa_approved_data.csv"
    ))
    assert result.empty, (result.new, result.changed, result.gone)


def test_the_importer_adds_updates_and_retires(client, store, tmp_path):
    admin = client.get("/me", headers=ADMIN).json()

    def mutate(rows):
        rows = [r for r in rows if r["Cert ID"] != "approved_gear_3"]  # dropped by the ISA
        rows = [{**r, "Testing Laboratory": "A New Lab"} if r["Cert ID"] == "approved_gear_1" else r for r in rows]
        rows.append({**rows[1], "Cert ID": "approved_gear_99", "Brand": "Balance Community", "Model": "Unknown Line"})
        return rows

    path = capture(tmp_path, store, mutate)
    client.post("/edit/isa/warnings", headers=ADMIN, json={"fields": {"status": "Notice", "manufacturer": "X", "model": "Y"}})
    result = isa_import.plan(store.load(include_retired=True), isa.CERTIFICATES, isa_import.read_certificates(path))
    assert [i["cert_id"] for i in result.new] == ["approved_gear_99"]
    assert result.changed == [("approved_gear_1", {"testing_lab": "A New Lab"})]
    assert result.gone == ["approved_gear_3"]

    log = client.app.dependency_overrides[get_changelog_repository]()
    actor = client.app.dependency_overrides[get_people_repository]().get(admin["sub"])
    before_match = store.get("isa_certified", "approved_gear_1").data["match"]
    assert isa_import.apply(store, log, actor, store.load(), result, "2026-10-15") == 3
    assert store.get("isa_certified", "approved_gear_1").data["testing_lab"] == "A New Lab"
    assert store.get("isa_certified", "approved_gear_1").data["match"] == before_match, "never touches a match"
    assert store.get("isa_certified", "approved_gear_3").retired
    assert store.get("isa_certified", "approved_gear_99").data["match"]["gearIds"] == []
    records = client.get("/changes", params={"flag": "safety", "limit": 10}).json()
    assert {r["channel"] for r in records if r["target_type"] == "isa_certificate"} == {"import"}


def test_the_importer_suggests_a_match_by_name_and_never_applies_it(store):
    documents = store.load()
    ring = store.get("leashrings", "27").data
    suggestion = isa_import.suggest(
        documents, isa.CERTIFICATES, {"manufacturer": ring["brand"], "model": ring["name"].upper()}
    )
    assert suggestion == {"collection": "leashrings", "ids": [27], "name": f"{ring['brand']} {ring['name']}"}
    assert isa_import.suggest(documents, isa.CERTIFICATES, {"manufacturer": "Nobody", "model": "Nothing"}) is None


def test_an_admins_own_entry_is_never_retired_by_an_import(client, store):
    client.post("/edit/isa/warnings", headers=ADMIN, json={"fields": {"status": "Notice", "manufacturer": "X", "model": "Y"}})
    warnings = json.loads((isa_import.ROOT / "isa_gear_warnings.json").read_text())["items"]
    result = isa_import.plan(store.load(include_retired=True), isa.WARNINGS, warnings)
    assert result.empty, (result.new, result.changed, result.gone)
