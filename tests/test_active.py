"""
Tests for the `active` field across every gear type.

`active` is a three-state flag (`True` = still sold, `False` = historic,
`None` = unknown) that lives on every `Base<X>` and drives the frontend's
"Historic" badge and the ALL / CURRENT / HISTORIC scope bubble.

Two things are covered here, per gear type:

1. **API round trip** — POST `true` / `false` / key omitted must come back as
   `True` / `False` / `None` on the `*Public` response (and survive a re-GET),
   and PATCH must be able to flip it in both directions.
2. **Loader mapping** — a minimal seed entry per type goes through the real
   loader (`load_data/load_gear.py`) and the test asserts what landed in the
   DB. The per-type loaders this once guarded (a `.get("active")` line each,
   silently `None` when dropped) are gone; the generic one is guarded the same
   way, per type.
"""

import pytest
from sqlmodel import select

from slack_data.load_data._seed_io import read_seed_json, seed_sources
from slack_data.load_data.load_gear import load_gear
from slack_data.models.connectors import Connector
from slack_data.models.grips import Grip
from slack_data.models.leashes import Leash
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
        "/connector": {
            "name": "Active Connector",
            "connector_style": "Shackle",
            "material": "Aluminum",
            "brand_id": brand_id,
        },
        "/leash": {
            "name": "Active Leash",
            "construction": "Threaded",
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
# Each entry: (collection, Model, minimal seed entry *without* an `active`
# key), in the seeds' own vocabulary — the model's field names, `brand` for
# the maker on every type.
#
# The brand is a real one: `get_brand()` takes a brand's id from `catalog_id` in
# manufacturers.json (see load_data/brand_ids.py), so an invented manufacturer
# has no id to be given and the load refuses rather than autoincrementing.

LOADER_CASES = [
    ("webbings", Webbing, {"name": "Loaded Webbing", "brand": "Gibbon", "material": ["Nylon"], "width": 25}),
    ("weblocks", Weblock, {"name": "Loaded Weblock", "brand": "Gibbon", "style": "Tensionable Weblock", "material": ["Aluminum"], "width_min": 25}),
    (
        "rollers", Roller,
        {
            "name": "Loaded Roller", "brand": "Gibbon", "material": ["Aluminum"],
            "roller_material": "Aluminum", "lock_type": "Screw Lock",
            "bearing_material": "Steel", "slider_type": "Carabiner",
        },
    ),
    ("leashrings", LeashRing, {"name": "Loaded Leash Ring", "brand": "Gibbon", "material": "Stainless Steel"}),
    ("grips", Grip, {"name": "Loaded Grip", "brand": "Gibbon", "material": "Aluminum", "width_min": 25}),
    ("treepros", TreePro, {"name": "Loaded TreePro", "brand": "Gibbon"}),
    (
        "starterkits", StarterKit,
        {"name": "Loaded Starter Kit", "brand": "Gibbon", "webbing_length": 15, "webbing_width": 25, "tensioning_type": "Single Ratchet"},
    ),
    (
        "tricklinekits", TricklineKit,
        {"name": "Loaded Trickline Kit", "brand": "Gibbon", "webbing_length": 15, "webbing_width": 25, "tensioning_type": "Single Ratchet"},
    ),
    ("connectors", Connector, {"name": "Loaded Connector", "brand": "Gibbon", "connector_style": "Shackle", "material": "Stainless Steel"}),
    ("leashes", Leash, {"name": "Loaded Leash", "brand": "Gibbon", "construction": "Threaded"}),
]

LOADER_IDS = [case[0] for case in LOADER_CASES]


def _load_one(session, collection, Model, item):
    """Run one seed entry through the real loader and return the created row.

    The `id` is supplied here rather than in each case because it is not what
    these tests are about — but the loader requires it (see
    `_seed_io.require_seed_id`). One row per test, so #1 is always free.
    """
    # manufacturers.json passes through: brand ids come from its catalog_id.
    sources = {"manufacturers.json": read_seed_json("manufacturers.json"), f"{collection}.json": [{"id": 1} | item]}
    with seed_sources(sources):
        load_gear(session, collection)
    return session.exec(select(Model)).one()


@pytest.mark.parametrize("collection, Model, item", LOADER_CASES, ids=LOADER_IDS)
@pytest.mark.parametrize("raw, expected", [(True, True), (False, False)])
def test_loader_maps_active(session, collection, Model, item, raw, expected):
    row = _load_one(session, collection, Model, item | {"active": raw})
    assert row.active is expected


@pytest.mark.parametrize("collection, Model, item", LOADER_CASES, ids=LOADER_IDS)
def test_loader_active_absent_from_json_is_none(session, collection, Model, item):
    """A seed item with no `active` key must land as unknown, not as True/False."""
    row = _load_one(session, collection, Model, item)
    assert row.active is None


@pytest.mark.parametrize("collection, Model, item", LOADER_CASES, ids=LOADER_IDS)
def test_loader_carries_notes_version_and_product_group(session, collection, Model, item):
    """`notes`, `version` and `product_group` reach the row on every gear type.

    The old per-type loaders once dropped `notes` and `version` on three types
    with no error anywhere; the generic loader carries every model field, and
    this pins it.
    """
    row = _load_one(
        session, collection, Model,
        item | {"notes": "Merged from #999.", "version": "v2", "product_group": "Reggae"},
    )
    assert row.notes == "Merged from #999."
    assert row.version == "v2"
    assert row.product_group == "Reggae"


# ---------------------------------------------------------------------------
# The seed files themselves — every item should carry an explicit `active`
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("collection", [case[0] for case in LOADER_CASES])
def test_seed_json_carries_active_on_every_item(collection):
    """
    Guards the seed data, not the code: a typo'd or dropped `active` key in a
    root *.json would seed as None and quietly empty out the HISTORIC scope.
    """
    items = read_seed_json(f"{collection}.json")

    missing = [i.get("name") for i in items if "active" not in i]
    assert missing == [], f"{len(missing)} item(s) with no `active` key: {missing[:5]}"
    assert all(isinstance(i["active"], bool) for i in items)
