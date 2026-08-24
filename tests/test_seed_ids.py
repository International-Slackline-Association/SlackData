"""The seed files' `id` field is the catalogue's stable identity — guard it.

A gear id used to be whatever SQLite's autoincrement handed out at seed time, so
it was really a statement about *where an item sat in a file*. Inserting one
product mid-file shifted every id after it and silently re-pointed everything
holding one: ISA warning match blocks, brand credentials, submitted corrections,
bookmarked `/webbings/42` links. `scripts/backfill_seed_ids.py` moved that
identity into the seeds, where a diff can show it changing.

Nothing enforces that by construction — the seeds are hand-edited JSON, and the
next person to append a product will not remember. So the invariants live here:

1. every item has an id,
2. ids are unique within their file,
3. `"<brand> <name>"` is still unique within their file — the handle the
   backfill matches on, and the one `load_isa_warnings.py` verifies against,
4. every brand a seed names is in `manufacturers.json` — brand ids are the same
   kind of handle, and `verify_brand()` 503s when one drifts,
5. and the one that ties the rest together: a full seed of a real database puts
   every row at the id its seed file names, brands included.

(5) is the assertion with teeth. The other four check the files agree with
themselves; this one checks the loaders honour them, and it is what fails if
someone reverts `require_seed_id()` or `get_brand()` to letting SQLite choose —
which would look like nothing at all until the next re-order.
"""

import json
from collections import Counter
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from slack_data.load_data.load_grips import add_grips_to_db, clean_grip_data
from slack_data.models.brands import Brand
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.seed import seed_catalog
from slack_data.utilities.brand_aliases import canonical_brand

ROOT = Path(__file__).parent.parent

# seed file -> the key that names the brand in it. `brand` for webbing/weblock,
# `manufacturer` for everything else — the split the loaders carry.
SEEDS = {
    "webbings.json": "brand",
    "weblocks.json": "brand",
    "rollers.json": "manufacturer",
    "leashrings.json": "manufacturer",
    "grips.json": "manufacturer",
    "treepros.json": "manufacturer",
    "starterkits.json": "manufacturer",
    "tricklinekits.json": "manufacturer",
}


def load(filename: str) -> list[dict]:
    return json.loads((ROOT / filename).read_text(encoding="utf-8"))


def identity(item: dict, brand_key: str) -> str:
    """`"<brand> <name>"`, brand canonicalized exactly as `get_brand()` does."""
    return f"{canonical_brand(str(item.get(brand_key)))} {item.get('name')}".strip()


@pytest.mark.parametrize("filename,brand_key", SEEDS.items())
def test_every_item_has_an_id(filename: str, brand_key: str) -> None:
    missing = [
        identity(item, brand_key)
        for item in load(filename)
        # `bool` is an `int` in Python, and `true` is not an id.
        if not isinstance(item.get("id"), int) or isinstance(item.get("id"), bool)
    ]
    assert not missing, (
        f"{filename}: {len(missing)} item(s) carry no integer id: {missing[:5]}."
        " Run scripts/backfill_seed_ids.py."
    )


@pytest.mark.parametrize("filename,brand_key", SEEDS.items())
def test_ids_are_positive(filename: str, brand_key: str) -> None:
    bad = [item["id"] for item in load(filename) if isinstance(item.get("id"), int) and item["id"] < 1]
    assert not bad, f"{filename}: ids must be positive (SQLite primary keys), got {bad}"


@pytest.mark.parametrize("filename,brand_key", SEEDS.items())
def test_ids_are_unique(filename: str, brand_key: str) -> None:
    """Two items sharing an id is the failure the explicit ids exist to prevent —
    a corrected price landing on someone else's product."""
    counts = Counter(item.get("id") for item in load(filename))
    duplicates = {gear_id: n for gear_id, n in counts.items() if n > 1}
    assert not duplicates, f"{filename}: id(s) used more than once: {duplicates}"


@pytest.mark.parametrize("filename,brand_key", SEEDS.items())
def test_brand_and_name_is_unique(filename: str, brand_key: str) -> None:
    """The fallback handle, for everything that has to re-find a row without an id.

    Bare `name` is not unique (3 duplicates in webbings, 2 in weblocks, 2 in
    starterkits); `"<brand> <name>"` is, in all eight files. `resolve()` in
    manufacturers/matching.py refuses to guess when it stops being — this keeps
    that from happening by accident.
    """
    counts = Counter(identity(item, brand_key) for item in load(filename))
    duplicates = {key: n for key, n in counts.items() if n > 1}
    assert not duplicates, f"{filename}: duplicate '<brand> <name>': {duplicates}"


def test_every_seed_brand_is_a_known_manufacturer() -> None:
    """A brand that appears only in a gear file gets a row created on the fly by
    `get_brand()`, and therefore an id assigned by which gear file happened to
    mention it first — the positional-identity problem, one level up. Requiring
    an entry in `manufacturers.json` keeps the brand list a closed set."""
    known = {
        canonical_brand(str(entry["name"]))
        for entry in json.loads((ROOT / "manufacturers.json").read_text(encoding="utf-8"))["manufacturers"].values()
    }
    unknown = {
        canonical_brand(str(item.get(brand_key)))
        for filename, brand_key in SEEDS.items()
        for item in load(filename)
    } - known
    assert not unknown, (
        f"brand(s) in the gear seeds but not manufacturers.json: {sorted(unknown)}."
        " Add an entry there so the brand has a stable identity too."
    )


# ---------------------------------------------------------------------------
# The loaders honour them — a real seed, against a real (in-memory) database
# ---------------------------------------------------------------------------

# The catalogue model behind each seed file. Spelled out rather than imported
# from GEAR_MODELS so a rename there cannot quietly narrow what this checks.
MODELS = {
    "webbings.json": Webbing,
    "weblocks.json": Weblock,
    "rollers.json": Roller,
    "leashrings.json": LeashRing,
    "grips.json": Grip,
    "treepros.json": TreePro,
    "starterkits.json": StarterKit,
    "tricklinekits.json": TricklineKit,
}


@pytest.fixture(scope="module")
def seeded():
    """One full seed of the real root `*.json`, shared by the tests below.

    Module-scoped because it is the expensive fixture in this file — 548 rows
    plus the ISA warning pass — and nothing here writes to it.
    """
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_catalog(session)
        yield session


@pytest.mark.parametrize("filename,brand_key", SEEDS.items())
def test_rows_land_on_their_seed_id(seeded, filename: str, brand_key: str) -> None:
    """Every row's primary key is the number its seed file names.

    Checked by `"<brand> <name>"` rather than by position, so a reordered seed
    file passes and a *renumbered* one does not — which is the distinction the
    whole change is about.
    """
    rows = {
        f"{row.brand.name} {row.name}".strip(): row.id
        for row in seeded.exec(select(MODELS[filename])).all()
    }
    wrong = {
        key: (item["id"], rows.get(key))
        for item in load(filename)
        if rows.get(key := identity(item, brand_key)) != item["id"]
    }
    assert not wrong, f"{filename}: seed id vs row id disagree for {wrong}"


def test_brands_land_on_their_catalog_id(seeded) -> None:
    """Same again for `Brand`, whose id comes from manufacturers.json.

    This is the one that matters most in production: a manufacturer credential
    is scoped by `brand_id`, so a brand landing on a different number hands one
    company another's inventory — see `matching.verify_brand`.
    """
    catalog_ids = {
        canonical_brand(str(entry["name"])): entry["catalog_id"]
        for entry in json.loads((ROOT / "manufacturers.json").read_text(encoding="utf-8"))["manufacturers"].values()
    }
    wrong = {
        brand.name: (brand.id, catalog_ids.get(canonical_brand(brand.name)))
        for brand in seeded.exec(select(Brand)).all()
        if brand.id != catalog_ids.get(canonical_brand(brand.name))
    }
    assert not wrong, f"brand id vs manufacturers.json catalog_id disagree for {wrong}"


def test_a_reordered_seed_keeps_its_ids(session) -> None:
    """The test with actual teeth: load a seed file **backwards**.

    Everything above still passes if the loaders ignore the seed's `id` and let
    SQLite autoincrement, because no item has been moved yet — 1..N happens to
    be right. Reversing the file breaks that coincidence: under autoincrement
    the last grip would come back as #1, and only an id read from the seed
    survives. `grips.json` is the vehicle purely because it is the smallest.
    """
    grips = load("grips.json")
    add_grips_to_db([clean_grip_data(dict(grip)) for grip in reversed(grips)], session)

    rows = {row.name: row.id for row in session.exec(select(Grip)).all()}
    wrong = {grip["name"]: (grip["id"], rows.get(grip["name"])) for grip in grips
             if rows.get(grip["name"]) != grip["id"]}
    assert not wrong, f"reversing grips.json moved ids: {wrong}"
