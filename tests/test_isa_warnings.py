"""The ISA gear-warnings pass (`load_data/load_isa_warnings.py`).

Mostly its `also` targets: one warning entry landing on two tables, because a
match block holds a single `gearType`. The KingPin pin warning (#65) is the
case that needed it — the bare shackle is a connector, the KingPin Weblock a
weblock, and both ship with the affected pin.
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from slack_data.load_data.load_isa_warnings import add_isa_warnings_to_db, match_targets
from slack_data.models.brands import Brand
from slack_data.models.connectors import Connector, ConnectorMaterial, ConnectorStyle
from slack_data.models.isa_gear_warnings import ISAGearWarning
from slack_data.models.weblocks import Weblock
from slack_data.seed import seed_catalog
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial


def _entry(match: dict, status: str = "Warning") -> dict:
    return {"id": "65", "status": status, "model": "Kingpin", "match": match}


@pytest.fixture
def kingpin(session):
    brand = Brand(name="Slacktivity")
    session.add(brand)
    session.commit()
    session.add(Connector(
        id=1, name="KingPin", connector_style=ConnectorStyle.SHACKLE,
        material=ConnectorMaterial.ALUMINUM, brand_id=brand.id,
    ))
    session.add(Weblock(
        id=41, name="KingPin Weblock", material=MetalMaterial.ALUMINUM, width_min=25,
        brand_id=brand.id,
    ))
    session.commit()
    return session


BOTH = {
    "gearType": "connector", "gearIds": [1], "gearNames": ["Slacktivity KingPin"],
    "confidence": "exact", "note": "the shackle",
    "also": [{
        "gearType": "weblock", "gearIds": [41], "gearNames": ["Slacktivity KingPin Weblock"],
        "confidence": "likely", "note": "the weblock",
    }],
}


def test_match_targets_is_the_block_then_its_also_list():
    targets = match_targets(BOTH)
    assert [t["gearType"] for t in targets] == ["connector", "weblock"]
    assert "also" not in targets[0]
    assert match_targets({"gearType": "webbing", "gearIds": [3]}) == [
        {"gearType": "webbing", "gearIds": [3]}
    ]


def test_an_also_target_is_stamped_and_gets_its_own_detail_row(kingpin):
    add_isa_warnings_to_db([_entry(BOTH)], kingpin)

    assert kingpin.get(Connector, 1).isa_warning == ISAWarning.WARNING
    assert kingpin.get(Weblock, 41).isa_warning == ISAWarning.WARNING
    rows = {(r.gear_type, r.gear_id): r for r in kingpin.exec(select(ISAGearWarning))}
    assert set(rows) == {("connector", 1), ("weblock", 41)}
    # Each detail row carries its own target's adjudication, not the primary's.
    assert (rows["connector", 1].confidence, rows["connector", 1].note) == ("exact", "the shackle")
    assert (rows["weblock", 41].confidence, rows["weblock", 41].note) == ("likely", "the weblock")


def test_an_also_target_whose_name_drifted_is_skipped_alone(kingpin, capsys):
    """Verified like the primary: a wrong name drops that target, not the entry."""
    drifted = BOTH | {"also": [BOTH["also"][0] | {"gearNames": ["Slacktivity Something Else"]}]}
    add_isa_warnings_to_db([_entry(drifted)], kingpin)

    assert kingpin.get(Connector, 1).isa_warning == ISAWarning.WARNING
    assert kingpin.get(Weblock, 41).isa_warning is None
    assert [(r.gear_type, r.gear_id) for r in kingpin.exec(select(ISAGearWarning))] == [("connector", 1)]
    assert "NOT stamped" in capsys.readouterr().out


# --- The real files ----------------------------------------------------------

@pytest.fixture(scope="module")
def seeded():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_catalog(session)
        yield session


def test_the_kingpin_pin_warning_lands_on_the_shackle_and_the_weblock(seeded):
    """Warning #65 is about the KingPin's pin, which both products ship with."""
    assert seeded.get(Connector, 1).isa_warning == ISAWarning.WARNING
    assert seeded.get(Weblock, 41).isa_warning == ISAWarning.WARNING
    targets = {
        (r.gear_type, r.gear_id)
        for r in seeded.exec(select(ISAGearWarning).where(ISAGearWarning.source_id == "65"))
    }
    assert targets == {("connector", 1), ("weblock", 41)}
