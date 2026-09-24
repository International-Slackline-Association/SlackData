"""
ISA certification — `isa_certified.json` → the gear rows and `/isacertification`.

Certification used to be a hand-set flag in each gear seed. It is now derived,
by `load_isa_certifications.py`, from the ISA's approved-gear list — so these
tests pin the rules that derivation applies (exact-only, Intermittent
Connection never counts, ids verified against names, the webbing letter) and,
against the real files, the outcome: exactly the 17 rows the seeds used to
flag, and no others.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from slack_data.load_data.load_isa_certifications import (
    CERTIFIABLE_MODELS,
    add_isa_certifications_to_db,
    class_from_strength,
    load_isa_certified_json,
)
from slack_data.models.grips import Grip
from slack_data.models.isa_gear_certifications import ISAGearCertification
from slack_data.models.starterkits import StarterKit, TensioningType
from slack_data.models.webbing import Webbing
from slack_data.seed import seed_catalog
from slack_data.submissions.fields import CORRECTABLE_FIELDS

ROOT = Path(__file__).parent.parent


# ---------------------------------------------------------------------------
# Loader rules, on a hand-built catalogue
# ---------------------------------------------------------------------------

def _entry(cert_id, certificate, product_type, gear_type, gear_id, name, confidence="exact", isa_class=None):
    return {
        "cert_id": cert_id,
        "certificate": certificate,
        "standard_number": int(certificate.split(":")[1]),
        "isa_class": isa_class,
        "product_type": product_type,
        "manufacturer": "Test Brand",
        "model": name,
        "test_date": "2024",
        "match": {
            "gearType": gear_type,
            "gearIds": [gear_id],
            "gearNames": [f"Test Brand {name}"],
            "confidence": confidence,
            "note": "",
        },
    }


@pytest.fixture
def webbing(session, brand):
    row = Webbing(id=10, name="Line", width=25, material=["Nylon"], breaking_strength=31, brand_id=brand.id)
    session.add(row)
    session.commit()
    return row


def test_exact_webbing_certificate_certifies_the_row(session, webbing):
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:41:B", "Webbing", "webbing", 10, "Line", isa_class="B")], session
    )
    session.refresh(webbing)
    assert webbing.isa_certified is True
    assert webbing.isa_certificate == "ISA:41:B"
    # The certificate's own letter wins over what 31 kN would earn (A).
    assert webbing.isa_class == "B"
    assert len(session.exec(select(ISAGearCertification)).all()) == 1


@pytest.mark.parametrize("confidence", ["likely", "partial", "ambiguous", "none"])
def test_only_exact_matches_certify(session, webbing, confidence):
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:41:A", "Webbing", "webbing", 10, "Line", confidence=confidence)], session
    )
    session.refresh(webbing)
    assert webbing.isa_certified is False
    assert session.exec(select(ISAGearCertification)).first() is None


def test_intermittent_connection_never_certifies(session, webbing):
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:41", "Webbing - Intermittent Connection", "webbing", 10, "Line")], session
    )
    session.refresh(webbing)
    assert webbing.isa_certified is False
    assert session.exec(select(ISAGearCertification)).first() is None


def test_sewn_loop_certifies_and_the_plain_certificate_is_primary(session, webbing):
    """Both certificates are listed; the card speaks for the plain one."""
    add_isa_certifications_to_db(
        [
            _entry("loop", "ISA:41", "Webbing - Sewn Loop", "webbing", 10, "Line"),
            _entry("plain", "ISA:41:A", "Webbing", "webbing", 10, "Line", isa_class="A"),
        ],
        session,
    )
    session.refresh(webbing)
    assert webbing.isa_certificate == "ISA:41:A"
    assert webbing.isa_class == "A"
    rows = session.exec(select(ISAGearCertification)).all()
    assert {r.cert_id for r in rows} == {"loop", "plain"}


def test_a_letterless_certificate_takes_its_class_from_strength(session, webbing):
    add_isa_certifications_to_db(
        [_entry("loop", "ISA:41", "Webbing - Sewn Loop", "webbing", 10, "Line")], session
    )
    session.refresh(webbing)
    assert webbing.isa_certified is True
    assert webbing.isa_certificate == "ISA:41"
    assert webbing.isa_class == "A"  # 31 kN
    detail = session.exec(select(ISAGearCertification)).one()
    # The detail row keeps what the ISA printed, and says the letter is ours.
    assert detail.isa_class is None
    assert "derived from breaking strength" in detail.note


@pytest.mark.parametrize(
    "kn,expected",
    [(None, None), (21.9, None), (22, "C"), (25.9, "C"), (26, "B"), (30, "A"), (39.9, "A"), (40, "A+")],
)
def test_class_from_strength_thresholds_are_inclusive(kn, expected):
    assert class_from_strength(kn) == expected


def test_a_mismatched_name_is_skipped_not_certified(session, webbing, capsys):
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:41:A", "Webbing", "webbing", 10, "Other Line")], session
    )
    session.refresh(webbing)
    assert webbing.isa_certified is False
    assert "NOT certified" in capsys.readouterr().out


def test_a_kit_cannot_be_certified(session, brand, capsys):
    kit = StarterKit(
        id=1, name="Kit", webbing_length=15, webbing_width=50,
        tensioning_type=TensioningType.OTHER, brand_id=brand.id,
    )
    session.add(kit)
    session.commit()
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:41", "Webbing", "starterkit", 1, "Kit")], session
    )
    assert not hasattr(kit, "isa_certified")
    assert "cannot be ISA certified" in capsys.readouterr().out
    assert session.exec(select(ISAGearCertification)).first() is None


def test_non_webbing_rows_get_the_certificate_but_no_class(session, brand):
    grip = Grip(id=3, name="Wafer", material="Aluminum", width_min=25, brand_id=brand.id)
    session.add(grip)
    session.commit()
    add_isa_certifications_to_db(
        [_entry("c1", "ISA:61", "Webbing Grab", "grip", 3, "Wafer")], session
    )
    session.refresh(grip)
    assert grip.isa_certified is True
    assert grip.isa_certificate == "ISA:61"
    assert not hasattr(grip, "isa_class")


# ---------------------------------------------------------------------------
# The real files
# ---------------------------------------------------------------------------

# The 17 rows the gear seeds flagged by hand before certification moved to
# `isa_certified.json` (ISA_CERTIFICATION_PLAN.md: all must match). A change
# here is a change to which products we call ISA approved — deliberate only.
EXPECTED_CERTIFIED = {
    ("webbing", 61), ("webbing", 62), ("webbing", 63), ("webbing", 74),
    ("webbing", 189), ("webbing", 260),
    ("weblock", 4), ("weblock", 53), ("weblock", 58), ("weblock", 84), ("weblock", 112),
    ("leashring", 26), ("leashring", 27), ("leashring", 29),
    ("grip", 3), ("grip", 15), ("grip", 16),
}


@pytest.fixture(scope="module")
def seeded():
    """One full seed of the real root `*.json`, shared by the tests below."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_catalog(session)
        yield session


def test_the_real_list_certifies_exactly_the_expected_rows(seeded):
    certified = {
        (gear_type, row.id)
        for gear_type, model in CERTIFIABLE_MODELS.items()
        for row in seeded.exec(select(model).where(model.isa_certified == True))  # noqa: E712
    }
    assert certified == EXPECTED_CERTIFIED


def test_every_certified_row_has_a_certificate_and_detail_rows(seeded):
    details = {(r.gear_type, r.gear_id) for r in seeded.exec(select(ISAGearCertification))}
    assert details == EXPECTED_CERTIFIED
    for gear_type, gear_id in EXPECTED_CERTIFIED:
        row = seeded.get(CERTIFIABLE_MODELS[gear_type], gear_id)
        assert row.isa_certificate, (gear_type, gear_id)
        if gear_type == "webbing":
            assert row.isa_class in {"A+", "A", "B", "C"}, (gear_id, row.isa_class)


def test_marathon_lists_both_its_certificates(seeded):
    marathon = seeded.get(Webbing, 63)
    assert marathon.isa_certificate == "ISA:41:A+"
    assert marathon.isa_class == "A+"
    certs = seeded.exec(
        select(ISAGearCertification).where(
            ISAGearCertification.gear_type == "webbing", ISAGearCertification.gear_id == 63
        )
    ).all()
    assert {c.cert_id for c in certs} == {"approved_gear_17", "approved_gear_18"}


def test_cong_gear_path_takes_its_letter_from_strength(seeded):
    path = seeded.get(Webbing, 260)
    assert path.isa_certificate == "ISA:41"
    assert path.isa_class == "A+"


def test_superseded_and_intermittent_certificates_are_unmatched():
    entries = {e["cert_id"]: e for e in load_isa_certified_json()}
    assert not entries["approved_gear_8"]["match"]["gearIds"]  # superseded by 23
    for entry in entries.values():
        if "intermittent" in entry["product_type"].lower():
            assert not entry["match"]["gearIds"], entry["cert_id"]


def test_no_gear_seed_carries_a_certification_flag_of_its_own():
    """`isa_certified.json` is the only source; a flag in a seed would be ignored
    silently, which is worse than not being there."""
    for name in ("webbings", "weblocks", "rollers", "leashrings", "grips", "starterkits", "tricklinekits"):
        text = (ROOT / f"{name}.json").read_text(encoding="utf-8")
        for key in ('"isa_certified"', '"isa_approved"', '"ISA approved"'):
            assert key not in text, f"{name}.json still carries {key}"


def test_certification_is_not_correctable():
    for slug, fields in CORRECTABLE_FIELDS.items():
        assert not fields & {"isa_certified", "isa_certificate", "isa_class"}, slug


def test_the_build_script_check_passes():
    """`isa_certified.json` is derived from the CSV; drift between them fails here."""
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build_isa_certified.py"), "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# ---------------------------------------------------------------------------
# /isacertification
# ---------------------------------------------------------------------------

@pytest.fixture
def certified(session, webbing):
    add_isa_certifications_to_db(
        [
            _entry("plain", "ISA:41:A", "Webbing", "webbing", 10, "Line", isa_class="A"),
            _entry("loop", "ISA:41", "Webbing - Sewn Loop", "webbing", 10, "Line"),
        ],
        session,
    )
    return webbing


def test_list_and_filter_certifications(client, certified):
    rows = client.get("/isacertification/").json()
    assert {r["cert_id"] for r in rows} == {"plain", "loop"}
    assert client.get("/isacertification/?gear_type=webbing&gear_id=10").json() == rows
    assert client.get("/isacertification/?gear_type=grip").json() == []


def test_read_one_certification_and_404(client, certified):
    first = client.get("/isacertification/").json()[0]
    assert client.get(f"/isacertification/{first['id']}").json() == first
    assert client.get("/isacertification/9999").status_code == 404


def test_webbing_response_carries_the_card_fields(client, certified):
    data = client.get("/webbing/10").json()
    assert data["isa_certified"] is True
    assert data["isa_certificate"] == "ISA:41:A"
    assert data["isa_class"] == "A"
    assert "classification" not in data


def test_certifications_are_readable_and_unwritable_when_read_only(read_only_client):
    assert read_only_client.get("/isacertification/").status_code == 200
    assert read_only_client.post("/isacertification/", json={}).status_code == 405
    assert read_only_client.delete("/isacertification/1").status_code == 405


def test_the_real_list_is_valid_json():
    data = json.loads((ROOT / "isa_certified.json").read_text(encoding="utf-8"))
    assert len(data["items"]) == 33
