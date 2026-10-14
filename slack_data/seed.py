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

from slack_data.load_data.load_gear import GEAR, load_gear
from slack_data.load_data.load_isa_certifications import (
    has_isa_certifications,
    load_isa_certifications,
)
from slack_data.load_data.load_isa_warnings import has_isa_warnings, load_isa_warnings
from slack_data.load_data.load_manufacturers import load_manufacturers
from slack_data.load_data.load_seller_brands import load_seller_brands
from slack_data.models.brands import Brand


def seed_catalog(session: Session) -> None:
    """Load every gear type into ``session``'s database, then enrich brands.

    Each gear type is skipped if its table already holds rows, so this is safe
    to call against an already-seeded database (a no-op)."""
    loaded_gear = False
    for collection, (model, _) in GEAR.items():
        # Only load a type whose table is empty: seeding is one-shot locally.
        if session.exec(select(model)).first() is None:
            load_gear(session, collection)
            loaded_gear = True
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
    # Beside the warnings pass and for the same reasons: it addresses gear rows
    # by primary key, so every gear table must be populated first, and it is
    # gated on its own detail table being empty. This is the ONLY place
    # `isa_certified` is ever set — the gear seeds no longer carry it.
    if not has_isa_certifications(session):
        print("Applying ISA certifications from isa_certified.json...")
        load_isa_certifications(session=session)
