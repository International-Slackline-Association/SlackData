"""
Tests for the `active` field across every gear type.

`active` is a three-state flag (`True` = still sold, `False` = legacy,
`None` = unknown) that lives on every `Base<X>` and drives the frontend's
"Legacy" badge and the ALL / CURRENT / HISTORIC scope bubble.

Two things are covered here, per gear type:

1. **API round trip** — POST `true` / `false` / key omitted must come back as
   `True` / `False` / `None` on the `*Public` response (and survive a re-GET),
   and PATCH must be able to flip it in both directions.
2. **Loader mapping** — the real risk. Each `load_*.py` carries a single
   `active=x.get("active")` line, and `.get()` answers `None` for a missing or
   misspelled key instead of raising. Dropping that line, or renaming the JSON
   key, would silently seed every item of that type as `None` while the rest of
   the suite stayed green. These tests push a minimal JSON item through the
   type's real `clean_*` + `add_*_to_db` pair and assert what landed in the DB.
"""

import pytest
from sqlmodel import select

from slack_data.load_data.load_grips import add_grips_to_db, clean_grip_data
from slack_data.load_data.load_leashrings import (
    add_leashrings_to_db,
    clean_leashring_data,
)
from slack_data.load_data.load_rollers import add_rollers_to_db, clean_roller_data
from slack_data.load_data.load_starterkits import (
    add_starterkits_to_db,
    clean_starterkit_data,
)
from slack_data.load_data.load_treepros import add_treepros_to_db, clean_treepro_data
from slack_data.load_data.load_tricklinekits import (
    add_tricklinekits_to_db,
    clean_tricklinekit_data,
)
from slack_data.load_data.load_webbings import add_webbings_to_db, clean_webbing_data
from slack_data.load_data.load_weblocks import add_weblocks_to_db, clean_weblock_data
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock


# ---------------------------------------------------------------------------
# API round trip — one minimal create payload per gear type
# ---------------------------------------------------------------------------

def _payloads(brand_id: int) -> dict[str, dict]:
    """Smallest valid POST body per endpoint, keyed by router prefix."""
    return {
        "/webbing": {
            "name": "Active Webbing",
            "material": ["Nylon"],
            "width": 25,
            "brand_id": brand_id,
        },
        "/weblock": {
            "name": "Active Weblock",
            "material": ["Aluminum"],
            "width_min": 25,
            "brand_id": brand_id,
        },
        "/roller": {
            "name": "Active Roller",
            "material": ["Aluminum"],
            "roller_material": "Aluminum",
            "slider_type": "Carabiner",
            "lock_type": "Screw Lock",
            "bearing_material": "Steel",
            "brand_id": brand_id,
        },
        "/leashring": {
            "name": "Active Leash Ring",
            "material": "Stainless Steel",
            "brand_id": brand_id,
        },
        "/grip": {
            "name": "Active Grip",
            "material": "Aluminum",
            "width_min": 25,
            "brand_id": brand_id,
        },
        "/treepro": {
            "name": "Active TreePro",
            "brand_id": brand_id,
        },
        "/starterkit": {
            "name": "Active Starter Kit",
            "webbing_length": 15,
            "webbing_width": 25,
            "tensioning_type": "Single Ratchet",
            "brand_id": brand_id,
        },
        "/tricklinekit": {
            "name": "Active Trickline Kit",
            "webbing_length": 15,
            "webbing_width": 25,
            "tensioning_type": "Single Ratchet",
            "brand_id": brand_id,
        },
    }


PREFIXES = list(_payloads(1).keys())


@pytest.mark.parametrize("prefix", PREFIXES)
@pytest.mark.parametrize("sent, expected", [(True, True), (False, False)])
def test_active_round_trips_through_the_api(client, brand, prefix, sent, expected):
    payload = _payloads(brand.id)[prefix] | {"active": sent}
    created = client.post(f"{prefix}/", json=payload)
    assert created.status_code == 200
    assert created.json()["active"] is expected
    # and it is persisted, not just echoed back
    assert client.get(f"{prefix}/{created.json()['id']}").json()["active"] is expected


@pytest.mark.parametrize("prefix", PREFIXES)
def test_active_defaults_to_none_when_omitted(client, brand, prefix):
    created = client.post(f"{prefix}/", json=_payloads(brand.id)[prefix])
    assert created.status_code == 200
    assert created.json()["active"] is None
    assert client.get(f"{prefix}/{created.json()['id']}").json()["active"] is None


@pytest.mark.parametrize("prefix", PREFIXES)
def test_active_is_present_in_the_list_response(client, brand, prefix):
    client.post(f"{prefix}/", json=_payloads(brand.id)[prefix] | {"active": False})
    assert client.get(f"{prefix}/").json()[0]["active"] is False


@pytest.mark.parametrize("prefix", PREFIXES)
@pytest.mark.parametrize("start, patch_to", [(True, False), (False, True), (None, True)])
def test_patch_active(client, brand, prefix, start, patch_to):
    payload = _payloads(brand.id)[prefix]
    if start is not None:
        payload = payload | {"active": start}
    item_id = client.post(f"{prefix}/", json=payload).json()["id"]

    resp = client.patch(f"{prefix}/{item_id}", json={"active": patch_to})
    assert resp.status_code == 200
    assert resp.json()["active"] is patch_to
    assert client.get(f"{prefix}/{item_id}").json()["active"] is patch_to


@pytest.mark.parametrize("prefix", PREFIXES)
def test_patch_other_field_leaves_active_alone(client, brand, prefix):
    payload = _payloads(brand.id)[prefix] | {"active": False}
    item_id = client.post(f"{prefix}/", json=payload).json()["id"]

    assert client.patch(f"{prefix}/{item_id}", json={"price": 42.0}).status_code == 200
    assert client.get(f"{prefix}/{item_id}").json()["active"] is False


# ---------------------------------------------------------------------------
# Loader mapping — JSON `active` key → DB column, per gear type
# ---------------------------------------------------------------------------
#
# Each entry: (id, clean_fn, add_fn, Model, minimal raw JSON item *without*
# an `active` key). Note the brand field name differs per type — `brand` for
# webbing/weblock, `manufacturer` for everything else — which is exactly the
# kind of per-loader divergence these tests exist to pin down.
#
# The brand is a real one: `get_brand()` takes a brand's id from `catalog_id` in
# manufacturers.json (see load_data/brand_ids.py), so an invented manufacturer
# has no id to be given and the load refuses rather than autoincrementing.

LOADER_CASES = [
    (
        "webbing",
        clean_webbing_data,
        add_webbings_to_db,
        Webbing,
        {"name": "Loaded Webbing", "brand": "Gibbon", "materialType": "Nylon", "width": 25},
    ),
    (
        "weblock",
        clean_weblock_data,
        add_weblocks_to_db,
        Weblock,
        {
            "name": "Loaded Weblock",
            "brand": "Gibbon",
            "style": "Rodeo",
            "specifications": {
                "Material": "Aluminum",
                "Compatible webbing width": "25 mm",
            },
        },
    ),
    (
        "roller",
        clean_roller_data,
        add_rollers_to_db,
        Roller,
        {
            "name": "Loaded Roller",
            "manufacturer": "Gibbon",
            "material": "Aluminum",
            "roller_material": "Aluminum",
            "locking_type": "Screw Lock",
            "bearing_material": "Steel",
            "slider_type": "Carabiner",
            "width": "25",
        },
    ),
    (
        "leashring",
        clean_leashring_data,
        add_leashrings_to_db,
        LeashRing,
        {
            "name": "Loaded Leash Ring",
            "manufacturer": "Gibbon",
            "material": "Stainless Steel",
        },
    ),
    (
        "grip",
        clean_grip_data,
        add_grips_to_db,
        Grip,
        {
            "name": "Loaded Grip",
            "manufacturer": "Gibbon",
            "material": "Aluminum",
            "width_min": 25,
        },
    ),
    (
        "treepro",
        clean_treepro_data,
        add_treepros_to_db,
        TreePro,
        {"name": "Loaded TreePro", "manufacturer": "Gibbon"},
    ),
    (
        "starterkit",
        clean_starterkit_data,
        add_starterkits_to_db,
        StarterKit,
        {
            "name": "Loaded Starter Kit",
            "manufacturer": "Gibbon",
            "webbing_length": 15,
            "webbing_width": 25,
            "tensioning_type": "RAT1",
        },
    ),
    (
        "tricklinekit",
        clean_tricklinekit_data,
        add_tricklinekits_to_db,
        TricklineKit,
        {
            "name": "Loaded Trickline Kit",
            "manufacturer": "Gibbon",
            "webbing_length": 15,
            "webbing_width": 25,
            "tensioning_type": "RAT1",
        },
    ),
]

LOADER_IDS = [case[0] for case in LOADER_CASES]


def _load_one(session, clean_fn, add_fn, Model, item):
    """Run one raw JSON item through its loader and return the created row.

    The `id` is supplied here rather than in each case because it is not what
    these tests are about — but the loaders require it (see
    `_seed_io.require_seed_id`), since a seed item's id is no longer SQLite's to
    invent. One row per test, so #1 is always free.
    """
    add_fn([clean_fn(dict(item) | {"id": 1})], session)
    return session.exec(select(Model)).one()


@pytest.mark.parametrize(
    "clean_fn, add_fn, Model, item",
    [case[1:] for case in LOADER_CASES],
    ids=LOADER_IDS,
)
@pytest.mark.parametrize("raw, expected", [(True, True), (False, False)])
def test_loader_maps_active(session, clean_fn, add_fn, Model, item, raw, expected):
    row = _load_one(session, clean_fn, add_fn, Model, item | {"active": raw})
    assert row.active is expected


@pytest.mark.parametrize(
    "clean_fn, add_fn, Model, item",
    [case[1:] for case in LOADER_CASES],
    ids=LOADER_IDS,
)
def test_loader_active_absent_from_json_is_none(session, clean_fn, add_fn, Model, item):
    """A seed item with no `active` key must land as unknown, not as True/False."""
    row = _load_one(session, clean_fn, add_fn, Model, item)
    assert row.active is None


# ---------------------------------------------------------------------------
# The seed files themselves — every item should carry an explicit `active`
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("json_loader", [
    pytest.param("load_webbings", id="webbings"),
    pytest.param("load_weblocks", id="weblocks"),
    pytest.param("load_rollers", id="rollers"),
    pytest.param("load_leashrings", id="leashrings"),
    pytest.param("load_grips", id="grips"),
    pytest.param("load_treepros", id="treepros"),
    pytest.param("load_starterkits", id="starterkits"),
    pytest.param("load_tricklinekits", id="tricklinekits"),
])
def test_seed_json_carries_active_on_every_item(json_loader):
    """
    Guards the seed data, not the code: a typo'd or dropped `active` key in a
    root *.json would seed as None and quietly empty out the HISTORIC scope.
    """
    import importlib

    module = importlib.import_module(f"slack_data.load_data.{json_loader}")
    read_json = getattr(module, f"{json_loader}_json")
    items = read_json()

    missing = [i.get("name") for i in items if "active" not in i]
    assert missing == [], f"{len(missing)} item(s) with no `active` key: {missing[:5]}"
    assert all(isinstance(i["active"], bool) for i in items)
