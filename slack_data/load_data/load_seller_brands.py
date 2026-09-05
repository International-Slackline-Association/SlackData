"""Check the `gear_sellers` names on the gear rows, and create the shops.

A gear row's `gear_sellers` is a list of brand NAMES typed into the seed beside
the product (see any `models/<type>.py`). Names are what a seed can carry, but
two things have to be true of them before the site reads them, and neither is
true by construction:

1. **The name must be a brand we know**, spelled the way the rest of the
   catalogue spells it. The seeds spell several manufacturers more than one way
   ("Spider slacklines" is the maker's own spelling in `weblocks.json`), and the
   frontend compares a seller name against `brand_name` — so an uncanonicalized
   name silently matches nothing rather than erroring. This pass rewrites each
   list through `canonical_brand()`.
2. **A shop that sells other people's gear and makes none of its own still needs
   a `Brand` row.** Every other brand is born in a gear loader, holding a
   product; SlackX resells the Radrigs line and manufactures nothing we hold, so
   without this it would be the one kind of brand the catalogue cannot name.
   The row is created only from `manufacturers.json` (`brand_catalog_id()`), so
   an unrecognised seller — a typo, far likelier than a new shop — is reported
   and dropped instead of inventing a brand out of a misspelling.

**Problems are collected, not raised.** One mistyped seller name should cost
that name, not the boot of the whole application — the same call
`load_isa_warnings.py` makes. Three are worth reporting: a name no
`manufacturers.json` entry matches, a seller that is the row's own maker (which
says nothing the row does not already say, and would double the brand in "who
sells this"), and a name listed twice.

Runs after every gear loader and before the brand enrichment: it needs the gear
rows to read, and the shop it creates must still be reachable by the pass that
gives brands a country and a contact address.
"""

from sqlmodel import Session, select

from slack_data.load_data.brand_ids import UnknownBrand, brand_catalog_id
from slack_data.models.brands import Brand
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.utilities.brand_aliases import canonical_brand

# Keyed by the plural frontend slug, the vocabulary `manufacturers/matching.py`
# and `submissions/fields.py` use — the labels only appear in messages here, but
# a reader tracking a reported problem back to a seed file wants the name of the
# file, not a router prefix.
SELLABLE_MODELS = {
    "webbings": Webbing,
    "weblocks": Weblock,
    "leashrings": LeashRing,
    "grips": Grip,
    "rollers": Roller,
    "treepros": TreePro,
    "starterkits": StarterKit,
    "tricklinekits": TricklineKit,
}


def seller_brand(session: Session, name: str) -> Brand | None:
    """The `Brand` row for a seller name, created if this shop makes nothing.

    None means the name is not a manufacturer we list — the caller reports it
    and drops the name.
    """
    brand = session.exec(select(Brand).where(Brand.name == name)).first()
    if brand is not None:
        return brand
    try:
        brand = Brand(id=brand_catalog_id(name), name=name)
    except UnknownBrand:
        return None
    session.add(brand)
    session.commit()
    session.refresh(brand)
    print(f"Adding brand: {brand.name} (#{brand.id}) — seller only, makes nothing we hold")
    return brand


def resolve_sellers(session: Session) -> list[str]:
    """Canonicalize every `gear_sellers` list in place; return the problems."""
    problems: list[str] = []

    for slug, model in SELLABLE_MODELS.items():
        # Every row, filtered in Python: `gear_sellers` is a JSON column, so a
        # row with no sellers holds the JSON value `null`, not SQL NULL, and
        # `.is_not(None)` in SQL would match the whole table.
        for row in session.exec(select(model)).all():
            if not row.gear_sellers:
                continue
            resolved: list[str] = []
            for raw in row.gear_sellers or []:
                label = f"{slug} {row.id} ({row.brand.name} {row.name})"
                name = canonical_brand(str(raw))
                if name == row.brand.name:
                    problems.append(
                        f"{label}: {name!r} makes it — a maker is not one of its own sellers"
                    )
                    continue
                if name in resolved:
                    problems.append(f"{label}: {name!r} is listed twice")
                    continue
                if seller_brand(session, name) is None:
                    problems.append(
                        f"{label}: seller {name!r} is not a brand in this catalogue"
                        " — add it to manufacturers.json (with a catalog_id) first"
                    )
                    continue
                resolved.append(name)
            # `or None` keeps the column's two meanings apart: null is "no
            # sellers recorded", and an empty list would be a claim we did not
            # make. It also matters after a drop above — a row whose only
            # seller was bad goes back to null rather than to `[]`.
            row.gear_sellers = resolved or None
            session.add(row)

    session.commit()
    return problems


def load_seller_brands(session: Session) -> None:
    """Resolve the seller names on every gear row, reporting what was dropped."""
    problems = resolve_sellers(session)
    for problem in problems:
        print(f"Seller dropped — {problem}")
    listed = sum(
        len(row.gear_sellers or [])
        for model in SELLABLE_MODELS.values()
        for row in session.exec(select(model)).all()
    )
    print(f"Resolved {listed} co-listings.")


if __name__ == "__main__":
    from slack_data.database import DATABASE_ENGINE, create_db_and_tables

    create_db_and_tables()
    with Session(DATABASE_ENGINE) as session:
        load_seller_brands(session)
