"""
Tests for the `active` lifecycle field across all 8 gear types.

`active` is the one field every gear model shares that is populated ENTIRELY
from the seed JSON — there is no default, no derivation, and no other code path
that can set it. Each loader carries exactly one line for it:

    active=<item>.get("active"),

`.get()` returns None on a missing or misspelled key rather than raising, so
deleting that line, or renaming the JSON key, makes every item of that gear type
seed as None. Nothing crashes. The API keeps returning 200. The only visible
symptom is downstream and far away: the frontend's Legacy badge silently stops
rendering and the HISTORIC filter silently returns nothing.

That is a change no other test in this suite would catch, which is why the
loader mapping — not just the model column — is asserted here per gear type.

Three states are meaningful and all three are covered:
    True  = still sold
    False = legacy / discontinued
    None  = unknown (key absent) — a legal value, not an error
"""

import pytest

from slack_data.load_data.load_grips import add_grips_to_db
from slack_data.load_data.load_leashrings import add_leashrings_to_db
from slack_data.load_data.load_rollers import add_rollers_to_db
from slack_data.load_data.load_starterkits import add_starterkits_to_db, clean_starterkit_data
from slack_data.load_data.load_treepros import add_treepros_to_db
from slack_data.load_data.load_tricklinekits import (
    add_tricklinekits_to_db,
    clean_tricklinekit_data,
)
from slack_data.load_data.load_webbings import add_webbings_to_db
from slack_data.load_data.load_weblocks import add_weblocks_to_db, clean_weblock_data


# Per gear type: the API prefix, a loader callable, and a minimal item in the
# shape that loader actually reads. These deliberately differ, because the
# loaders do:
#   - brand key is `brand` for webbing/weblock, `manufacturer` for the rest
#   - weblock keeps the nested SlackDB scrape shape (`specifications`)
#   - add_*_to_db expects ALREADY-CLEANED input; load_*() is what applies
#     clean_*() first. Where a clean step exists we route through it, since for
#     weblock the `active` mapping lives in clean_weblock_data() rather than in
#     add_weblocks_to_db() — testing the pair is what covers the real path.
def _webbing(active):
    d = {"brand": "TestBrand", "name": "W1", "materialType": "Polyester"}
    if active is not None:
        d["active"] = active
    return d


def _weblock(active):
    d = {
        "brand": "TestBrand",
        "name": "WL1",
        "specifications": {"Material": "Aluminum", "Compatible webbing width": "25mm"},
    }
    if active is not None:
        d["active"] = active
    return d


def _mfr(name, **extra):
    def build(active):
        d = {"manufacturer": "TestBrand", "name": name, **extra}
        if active is not None:
            d["active"] = active
        return d
    return build


def _via(clean, add):
    """Mirror load_*(): clean each item, then hand the batch to the adder."""
    def run(items, session):
        add([clean(i) for i in items], session)
    return run


GEAR_TYPES = [
    ("webbing",      add_webbings_to_db,   _webbing),
    ("weblock",      _via(clean_weblock_data, add_weblocks_to_db), _weblock),
    ("roller",       add_rollers_to_db,    _mfr("R1")),
    ("leashring",    add_leashrings_to_db, _mfr("LR1")),
    ("grip",         add_grips_to_db,      _mfr("G1")),
    ("treepro",      add_treepros_to_db,   _mfr("TP1")),
    ("starterkit",   _via(clean_starterkit_data, add_starterkits_to_db),
                     _mfr("SK1", tensioning_type="Double Ratchet")),
    ("tricklinekit", _via(clean_tricklinekit_data, add_tricklinekits_to_db),
                     _mfr("TK1", tensioning_type="RAT1")),
]

IDS = [t[0] for t in GEAR_TYPES]


# ---------------------------------------------------------------------------
# Loader mapping — the line that can vanish silently
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("prefix, loader, build", GEAR_TYPES, ids=IDS)
@pytest.mark.parametrize("value", [True, False], ids=["active", "legacy"])
def test_loader_maps_active_from_json(client, session, prefix, loader, build, value):
    """A JSON `active` of true/false reaches the API response unchanged."""
    loader([build(value)], session)
    session.commit()

    items = client.get(f"/{prefix}/").json()
    assert len(items) == 1, f"{prefix}: expected exactly one seeded item"
    assert items[0]["active"] is value


@pytest.mark.parametrize("prefix, loader, build", GEAR_TYPES, ids=IDS)
def test_loader_leaves_active_none_when_key_absent(client, session, prefix, loader, build):
    """A missing `active` key is 'unknown' (None), not an error and not False."""
    loader([build(None)], session)
    session.commit()

    items = client.get(f"/{prefix}/").json()
    assert len(items) == 1
    assert items[0]["active"] is None


@pytest.mark.parametrize("prefix, loader, build", GEAR_TYPES, ids=IDS)
def test_active_is_exposed_by_the_public_schema(client, session, prefix, loader, build):
    """
    `active` must be declared on the *Public response model, not merely stored.
    A field present on the table but absent from the response schema would be
    dropped silently on serialisation — the frontend reads this off the API.
    """
    loader([build(True)], session)
    session.commit()

    assert "active" in client.get(f"/{prefix}/").json()[0]


# ---------------------------------------------------------------------------
# Write path — PATCH must be able to flip lifecycle state
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("prefix, loader, build", GEAR_TYPES, ids=IDS)
def test_patch_can_flip_active(client, session, prefix, loader, build):
    """Retiring or reinstating an item is a PATCH of one field."""
    loader([build(True)], session)
    session.commit()
    item_id = client.get(f"/{prefix}/").json()[0]["id"]

    assert client.patch(f"/{prefix}/{item_id}", json={"active": False}).json()["active"] is False
    assert client.get(f"/{prefix}/{item_id}").json()["active"] is False

    assert client.patch(f"/{prefix}/{item_id}", json={"active": True}).json()["active"] is True


@pytest.mark.parametrize("prefix, loader, build", GEAR_TYPES, ids=IDS)
def test_patch_of_another_field_leaves_active_alone(client, session, prefix, loader, build):
    """
    PATCH uses exclude_unset, so a partial update must not reset `active` to its
    default. This is the regression that would quietly wipe lifecycle state
    across the catalogue the first time anything else is edited.
    """
    loader([build(False)], session)
    session.commit()
    item_id = client.get(f"/{prefix}/").json()[0]["id"]

    client.patch(f"/{prefix}/{item_id}", json={"notes": "unrelated edit"})

    assert client.get(f"/{prefix}/{item_id}").json()["active"] is False
