"""Co-listings: the `gear_sellers` names carried on the gear rows themselves.

`brand_id` says who MAKES a product; `gear_sellers` is the list of brand names
that also sell it (Slack Inov and Spider Slacklines carry each other's whole
range, SlackX continues the Radrigs line). It is a plain list of names stored on
the product, so the two things that can go wrong are both about names:

- a name that is not a brand we list, or is spelled a way nothing matches — the
  frontend compares seller names against `brand_name`, so a bad one degrades to
  silence rather than to an error;
- a maker listed among its own sellers, which says nothing the row does not
  already say and would double that brand in "who sells this".

`load_seller_brands.py` is what catches both, and this file holds it to that.
The seed checks below run against the real root `*.json` and need no database:
they are the ones that fail on a typo in a hand-edited seed.
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from slack_data.load_data._seed_io import read_seed_json
from slack_data.load_data.brand_ids import UnknownBrand, brand_catalog_id
from slack_data.load_data.load_grips import load_grips
from slack_data.load_data.load_seller_brands import SELLABLE_MODELS, resolve_sellers
from slack_data.load_data.load_weblocks import clean_weblock_data, load_weblocks
from slack_data.manufacturers.matching import GEAR_MODELS
from slack_data.models.brands import Brand
from slack_data.models.grips import Grip
from slack_data.models.weblocks import Weblock
from slack_data.submissions.fields import CORRECTABLE_FIELDS, manufacturer_fields
from slack_data.utilities.brand_aliases import canonical_brand

SEED_FILES = {
    "webbings": "webbings.json",
    "weblocks": "weblocks.json",
    "leashrings": "leashrings.json",
    "grips": "grips.json",
    "rollers": "rollers.json",
    "treepros": "treepros.json",
    "starterkits": "starterkits.json",
    "tricklinekits": "tricklinekits.json",
}


def seed_items(slug: str) -> list[dict]:
    return read_seed_json(SEED_FILES[slug])


def maker_of(item: dict) -> str:
    """The seeds spell the brand key two ways — see CLAUDE.md § Loader pattern."""
    return canonical_brand(str(item.get("brand") or item.get("manufacturer") or ""))


# ---------------------------------------------------------------------------
# The vocabulary
# ---------------------------------------------------------------------------

def test_the_seller_pass_covers_exactly_the_gear_types_the_api_knows():
    """One map per vocabulary is one too many if they can disagree.

    `SELLABLE_MODELS` and `matching.GEAR_MODELS` are both keyed by the plural
    frontend slug, declared separately (importing one from the other would be
    circular), and a type present in one but not the other is a type whose
    co-listings load but cannot be reasoned about — or the reverse.
    """
    assert SELLABLE_MODELS == GEAR_MODELS


def test_every_gear_type_carries_the_column():
    for slug, model in SELLABLE_MODELS.items():
        assert "gear_sellers" in model.model_fields, f"{slug} has no gear_sellers field"


# ---------------------------------------------------------------------------
# The seeds — these are the checks that fail on a hand-edit
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("slug", sorted(SEED_FILES))
def test_every_seller_name_in_the_seeds_is_a_brand_we_list(slug):
    """A name with no `manufacturers.json` entry is a typo far more often than
    a new shop, and it costs that listing silently on the site."""
    for item in seed_items(slug):
        for name in item.get("gear_sellers") or []:
            try:
                brand_catalog_id(str(name))
            except UnknownBrand:  # pragma: no cover - the failure message is the point
                pytest.fail(
                    f"{SEED_FILES[slug]} #{item.get('id')} lists seller {name!r},"
                    " which has no entry in manufacturers.json"
                )


@pytest.mark.parametrize("slug", sorted(SEED_FILES))
def test_no_item_lists_its_own_maker_as_a_seller(slug):
    for item in seed_items(slug):
        sellers = [canonical_brand(str(name)) for name in item.get("gear_sellers") or []]
        assert maker_of(item) not in sellers, (
            f"{SEED_FILES[slug]} #{item.get('id')} lists its own maker as a seller"
        )
        assert len(sellers) == len(set(sellers)), (
            f"{SEED_FILES[slug]} #{item.get('id')} lists a seller twice"
        )


def test_the_seeds_actually_hold_co_listings():
    """Guards every check above from passing on an empty field."""
    total = sum(
        len(item.get("gear_sellers") or []) for slug in SEED_FILES for item in seed_items(slug)
    )
    assert total > 50, f"only {total} co-listings in the seeds — did a seed lose the field?"


# ---------------------------------------------------------------------------
# The loaders — a list has to arrive as a list
# ---------------------------------------------------------------------------

@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_the_weblock_cleaner_carries_the_sellers_through():
    """`clean_weblock_data` builds a FRESH dict from the nested scrape, so any
    key it does not name is dropped — which is how the id was once lost."""
    cleaned = clean_weblock_data(
        {"id": 1, "name": "X", "brand": "Radrigs", "gear_sellers": ["SlackX"]}
    )
    assert cleaned["gear_sellers"] == ["SlackX"]


def test_the_loaders_store_a_list_not_its_repr(session):
    """The webbing/grip/leashring/roller cleaners `str()` everything they do not
    recognise. Stringified, a seller list reads back as `"['SlackX']"`, which
    matches no brand and raises nothing."""
    load_grips(session=session)
    load_weblocks(session=session)

    for model in (Grip, Weblock):
        listed = [row for row in session.exec(select(model)).all() if row.gear_sellers]
        assert listed, f"no {model.__name__} in the seeds carries a seller"
        for row in listed:
            assert isinstance(row.gear_sellers, list), row.gear_sellers
            assert all(isinstance(name, str) for name in row.gear_sellers)


# ---------------------------------------------------------------------------
# resolve_sellers() — canonicalization, and the three problems it reports
# ---------------------------------------------------------------------------

def make_grip(session: Session, maker: str, sellers: list[str] | None) -> Grip:
    brand = session.exec(select(Brand).where(Brand.name == maker)).first()
    if brand is None:
        brand = Brand(id=brand_catalog_id(maker), name=maker)
        session.add(brand)
        session.commit()
        session.refresh(brand)
    grip = Grip(name="Test Grip", material="Aluminum", width_min=25, brand_id=brand.id,
                gear_sellers=sellers)
    session.add(grip)
    session.commit()
    session.refresh(grip)
    return grip


def test_a_seller_name_is_canonicalized_to_the_catalogue_spelling(session):
    """`weblocks.json` spells one maker "Spider slacklines". The frontend
    compares a seller name against `brand_name`, so a variant spelling matches
    nothing at all — no error, just an empty result."""
    grip = make_grip(session, "Slack Inov", ["Spider slacklines"])

    assert resolve_sellers(session) == []
    session.refresh(grip)
    assert grip.gear_sellers == ["Spider Slacklines"]


def test_a_shop_that_makes_nothing_we_hold_gets_a_brand_row(session):
    """SlackX resells the Radrigs line and manufactures nothing, so no gear
    loader ever creates it. This pass is the one place such a brand is born."""
    make_grip(session, "Slack Inov", ["SlackX"])

    assert resolve_sellers(session) == []
    slackx = session.exec(select(Brand).where(Brand.name == "SlackX")).first()
    assert slackx is not None
    assert slackx.id == brand_catalog_id("SlackX"), "the id must come from manufacturers.json"


def test_an_unknown_seller_is_reported_and_dropped_not_invented(session):
    grip = make_grip(session, "Slack Inov", ["Spder Slacklines"])

    problems = resolve_sellers(session)

    assert len(problems) == 1 and "not a brand in this catalogue" in problems[0]
    session.refresh(grip)
    # Back to null, never `[]` — "no sellers recorded" and "we checked and there
    # are none" are different claims.
    assert grip.gear_sellers is None
    assert session.exec(select(Brand).where(Brand.name == "Spder Slacklines")).first() is None


def test_a_maker_is_not_one_of_its_own_sellers(session):
    grip = make_grip(session, "Slack Inov", ["Slack Inov", "Spider Slacklines"])

    problems = resolve_sellers(session)

    assert len(problems) == 1 and "makes it" in problems[0]
    session.refresh(grip)
    assert grip.gear_sellers == ["Spider Slacklines"]


def test_a_seller_listed_twice_is_reported_and_kept_once(session):
    grip = make_grip(session, "Slack Inov", ["Spider Slacklines", "Spider slacklines"])

    problems = resolve_sellers(session)

    assert len(problems) == 1 and "listed twice" in problems[0]
    session.refresh(grip)
    assert grip.gear_sellers == ["Spider Slacklines"]


def test_resolving_is_idempotent(session):
    """It runs on every seed of an empty table, and canonicalization must not
    drift on the second pass."""
    grip = make_grip(session, "Slack Inov", ["Spider slacklines"])

    assert resolve_sellers(session) == []
    assert resolve_sellers(session) == []
    session.refresh(grip)
    assert grip.gear_sellers == ["Spider Slacklines"]


# ---------------------------------------------------------------------------
# Not a correctable field
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("slug", sorted(SEED_FILES))
def test_no_writer_may_edit_who_else_sells_a_product(slug):
    """Who resells a product is ours to record. A maker does not get to declare
    (or delete) a competitor's shelf, and `changes` is a dict of strings, which
    could not carry a list even if it did."""
    assert "gear_sellers" not in CORRECTABLE_FIELDS[slug]
    assert "gear_sellers" not in manufacturer_fields(slug)
