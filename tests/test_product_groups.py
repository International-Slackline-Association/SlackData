"""`product_group` on every gear type: one product stated more than once.

Connectors use it for generic parts several shops sell; the other types for a
product whose specs depend on its maker or batch (Slack.fr's and Slack Inov's
Reggae). The frontend collapses a group into one card (src/utils/groups.ts).
"""

from collections import Counter

import pytest

from slack_data.load_data._seed_io import read_seed_json
from slack_data.load_data.load_gear import to_row
from slack_data.models.connectors import Connector
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.submissions.fields import CORRECTABLE_FIELDS, manufacturer_fields

SEEDS = {
    "webbings": ("webbings.json", Webbing),
    "weblocks": ("weblocks.json", Weblock),
    "rollers": ("rollers.json", Roller),
    "leashrings": ("leashrings.json", LeashRing),
    "grips": ("grips.json", Grip),
    "treepros": ("treepros.json", TreePro),
    "starterkits": ("starterkits.json", StarterKit),
    "tricklinekits": ("tricklinekits.json", TricklineKit),
    "connectors": ("connectors.json", Connector),
}


@pytest.mark.parametrize("gear_type", SEEDS)
def test_every_gear_type_has_the_column(gear_type):
    assert "product_group" in SEEDS[gear_type][1].model_fields


@pytest.mark.parametrize("gear_type", SEEDS)
def test_product_group_is_not_correctable(gear_type):
    """A grouping we make across brands — no one brand's to state."""
    assert "product_group" not in CORRECTABLE_FIELDS[gear_type]
    assert "product_group" not in manufacturer_fields(gear_type)


@pytest.mark.parametrize("gear_type", SEEDS)
def test_every_seeded_group_has_at_least_two_members(gear_type):
    """A product stated once is a plain row, never a group of one."""
    items = read_seed_json(SEEDS[gear_type][0])
    groups = Counter(i["product_group"] for i in items if i.get("product_group"))
    assert all(n >= 2 for n in groups.values()), {g: n for g, n in groups.items() if n < 2}


def test_reggae_is_one_group_across_two_makers():
    rows = [w for w in read_seed_json("webbings.json") if w.get("product_group") == "Reggae"]
    assert sorted(w["brand"] for w in rows) == ["Slack Inov", "Slack.fr"]


def test_webbing_loader_maps_product_group():
    row = to_row("webbings", {
        "id": 1, "name": "Reggae", "brand": "Slack.fr", "material": ["Polyester"],
        "width": 25, "product_group": "Reggae",
    }, brand_id=1)
    assert row.product_group == "Reggae"
