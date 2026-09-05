"""Backfill manufacturer metadata onto Brand rows from the root manufacturers.json.

This loader is the odd one out: every other load_*.py CREATES rows for a gear
type, but Brand rows already exist by the time this runs — `get_brand()` creates
them on the fly during the gear loads, populated with nothing but a name. This
pass ENRICHES those existing rows with the reference metadata we already have on
disk (country, year founded, website, socials, contact email, active,
slackline-focused).

It therefore must run AFTER every gear loader in the lifespan, and it never
inserts a brand: a manufacturers.json entry with no matching Brand row means we
hold no gear for that manufacturer, and inventing an empty brand would put a
manufacturer on the directory page with nothing behind it.

Matching is by `canonical_brand()`, the same normaliser `get_brand()` uses, so
alias spellings ("BalanceCommunity" vs "Balance Community: Slackline Outfitters")
resolve to the row that actually exists.

Country arrives as an ISO alpha-2 code ("DE") and is stored as the Country enum's
full display name ("Germany") via `get_country()`.
"""


from sqlmodel import select

from slack_data.load_data._seed_io import read_seed_json
from slack_data.models.brands import Brand
from slack_data.utilities.brand_aliases import canonical_brand
from slack_data.utilities.countries import get_country


def load_manufacturers_json() -> dict:
    """The root manufacturers.json — {"metadata": {...}, "manufacturers": {id: {...}}}."""
    return read_seed_json("manufacturers.json")


def clean_manufacturer_data(raw: dict) -> dict[str, dict]:
    """canonical brand name -> the metadata we actually store.

    Blank strings collapse to None so an empty website doesn't overwrite a real
    one, and unknown/blank country codes resolve to None rather than a guess.
    """
    cleaned: dict[str, dict] = {}
    for entry in raw.get("manufacturers", {}).values():
        name = (entry.get("name") or "").strip()
        if not name:
            continue

        def blank_to_none(value):
            if isinstance(value, str):
                value = value.strip()
                return value or None
            return value

        cleaned[canonical_brand(name)] = {
            "country": get_country(entry.get("country")),
            "year_founded": entry.get("year_established"),
            "website": blank_to_none(entry.get("website")),
            # One social link, first one the entry actually has. Facebook is
            # what SlackDB's dump carried; the others are brands we added
            # ourselves, some of which never had a Facebook page.
            "socials": (
                blank_to_none(entry.get("facebook"))
                or blank_to_none(entry.get("instagram"))
                or blank_to_none(entry.get("tiktok"))
            ),
            "contact_email": blank_to_none(entry.get("email")),
            "active": entry.get("active"),
            "slackline_focused": entry.get("slackline_oriented"),
        }
    return cleaned


def add_manufacturer_data_to_db(session, cleaned: dict[str, dict]) -> int:
    """Apply metadata to existing Brand rows. Returns how many rows changed.

    Only fills fields that are still unset — a value already on the row (hand-
    corrected, or set by a future manufacturer account) outranks this reference
    dump. `active`/`slackline_focused` are non-nullable with defaults, so they are
    only written when the source actually has a value to offer.
    """
    updated = 0
    for brand in session.exec(select(Brand)).all():
        data = cleaned.get(canonical_brand(brand.name))
        if not data:
            continue

        changed = False
        for field in ("country", "year_founded", "website", "socials", "contact_email"):
            value = data.get(field)
            if value is not None and getattr(brand, field) is None:
                setattr(brand, field, value)
                changed = True

        for field in ("active", "slackline_focused"):
            value = data.get(field)
            if value is not None and getattr(brand, field) != value:
                setattr(brand, field, value)
                changed = True

        if changed:
            session.add(brand)
            updated += 1

    session.commit()
    return updated


def load_manufacturers(session) -> int:
    raw = load_manufacturers_json()
    cleaned = clean_manufacturer_data(raw)
    updated = add_manufacturer_data_to_db(session, cleaned)
    print(f"Enriched {updated} brand(s) from manufacturers.json")
    return updated


if __name__ == "__main__":
    data = clean_manufacturer_data(load_manufacturers_json())
    print(f"{len(data)} manufacturers in manufacturers.json")
    with_country = sum(1 for v in data.values() if v["country"])
    print(f"{with_country} have a resolvable country")
