"""Catalog seeding — populate the SQLite catalog from the root *.json files.

This is the single source of the load sequence, used two ways:

- **Local/dev:** called from ``main.py``'s lifespan on first boot, against a
  writable ``database.db``.
- **Hosted build:** called by ``scripts/build_catalog_db.py`` to bake the
  read-only catalog that ships inside the Lambda package.

Importing this module also imports every table model + loader, so
``SQLModel.metadata`` is complete (used by the build script's ``create_all``).
"""

from sqlmodel import Session, select

from slack_data.load_data.load_grips import load_grips
from slack_data.load_data.load_isa_warnings import has_isa_warnings, load_isa_warnings
from slack_data.load_data.load_leashrings import load_leashrings
from slack_data.load_data.load_manufacturers import load_manufacturers
from slack_data.load_data.load_rollers import load_rollers
from slack_data.load_data.load_seller_brands import load_seller_brands
from slack_data.load_data.load_starterkits import load_starterkits
from slack_data.load_data.load_treepros import load_treepros
from slack_data.load_data.load_tricklinekits import load_tricklinekits
from slack_data.load_data.load_webbings import load_webbings
from slack_data.load_data.load_weblocks import load_weblocks

from slack_data.models.brands import Brand
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock


def seed_catalog(session: Session) -> None:
    """Load every gear type into ``session``'s database, then enrich brands.

    Each gear type is skipped if its table already holds rows, so this is safe
    to call against an already-seeded database (a no-op)."""
    existing_webbings = session.exec(select(Webbing)).first()
    if existing_webbings is None: # Only load from `webbings.json` if the database is empty
        print("Loading webbing data into the database...")
        load_webbings(session=session)
    existing_weblocks = session.exec(select(Weblock)).first()
    if existing_weblocks is None: # Only load from `webbings.json` if the database is empty
        print("Loading weblocks data into the database...")
        load_weblocks(session=session)
    existing_rollers = session.exec(select(Roller)).first()
    if existing_rollers is None: # Only load from `rollers.json` if the database is empty
        print("Loading roller data into the database...")
        load_rollers(session=session)
    existing_leashrings = session.exec(select(LeashRing)).first()
    if existing_leashrings is None: # Only load from `leashrings.json` if the database is empty
        print("Loading leash ring data into the database...")
        load_leashrings(session=session)
    existing_grips = session.exec(select(Grip)).first()
    if existing_grips is None: # Only load from `grips.json` if the database is empty
        print("Loading grip data into the database...")
        load_grips(session=session)
    existing_treepros = session.exec(select(TreePro)).first()
    if existing_treepros is None: # Only load from `treepros.json` if the database is empty
        print("Loading treepro data into the database...")
        load_treepros(session=session)
    existing_starterkits = session.exec(select(StarterKit)).first()
    if existing_starterkits is None: # Only load from `starterkits.json` if the database is empty
        print("Loading starter kit data into the database...")
        load_starterkits(session=session)
    existing_tricklinekits = session.exec(select(TricklineKit)).first()
    if existing_tricklinekits is None: # Only load from `tricklinekits.json` if the database is empty
        print("Loading trickline kit data into the database...")
        load_tricklinekits(session=session)
    loaded_gear = any(
        existing is None
        for existing in (
            existing_webbings, existing_weblocks, existing_rollers, existing_leashrings,
            existing_grips, existing_treepros, existing_starterkits, existing_tricklinekits,
        )
    )
    # After every gear loader, before the brand enrichment. It reads the
    # `gear_sellers` names off the rows those loaders just wrote, and it can
    # CREATE a brand (a shop that resells and makes nothing has no gear loader
    # to be born in), so it has to run while the enrichment pass can still
    # reach that new row with a country and a contact address. Skipped when
    # every gear table was already populated: the names are part of the gear
    # seeds now, so nothing can have changed without a re-seed.
    if loaded_gear:
        print("Resolving co-listing sellers from the gear seeds...")
        load_seller_brands(session=session)
    # MUST come after everything that creates a Brand row — the gear loaders
    # above (via get_brand(), name-only) and the seller pass just above (a
    # reseller with no gear of its own). This pass only backfills metadata
    # onto rows that already exist. Gated on "no brand has a country yet"
    # rather than on an empty table, because the table is never empty here.
    needs_enrichment = session.exec(
        select(Brand).where(Brand.country.is_not(None))
    ).first() is None
    if needs_enrichment:
        print("Enriching brands from manufacturers.json...")
        load_manufacturers(session=session)
    # ALSO last: this pass stamps `isa_warning` onto rows the gear loaders above
    # created, addressing them by primary key, so every table must be populated
    # first. Gated on "no row carries a warning yet" rather than on an empty
    # table, for the same reason as the brand enrichment above.
    if not has_isa_warnings(session):
        print("Applying ISA gear warnings from isa_gear_warnings.json...")
        load_isa_warnings(session=session)
