import re
from typing import Any

from slack_data.database import SessionDep
from slack_data.load_data._seed_io import read_seed_json, require_seed_id, seed_path
from slack_data.models.brands import Brand, get_brand
from slack_data.models.weblocks import (
    AttachmentPoint,
    FrontPin,
    Weblock,
    WeblockCreate,
    WeblockStyle,
)
from slack_data.utilities.materials import get_metal_materials
from slack_data.utilities.currencies import Currency, get_currency

WEBLOCKS_FILE = seed_path("weblocks.json")

def parse_numerical_value(value_str: str | None, remove_suffix: str = "") -> float | None:
    if value_str is None:
        return None
    try:
        cleaned_val = value_str.lower()
        if remove_suffix:
            cleaned_val = cleaned_val.replace(remove_suffix.lower(), "")
        return float(cleaned_val.strip())
    except (ValueError, AttributeError):
        return None
    
def parse_width_range(width_str: str | None) -> tuple[int, int]:
    """
    Parse webbing width string and return (min_width, max_width).
    For ranges like "24mm - 26mm", returns (24, 26).
    For single values like "25mm", returns (25, None).
    For invalid/missing values, returns (0, None) as default.
    """
    if not width_str or width_str.lower() in ['n/a', 'na', 'unknown', '']:
        return 0, 0
    
    width_str = width_str.lower().replace(" ", "")
    match = re.match(r"(\d+)(?:mm)?(?:-(\d+)(?:mm)?)?", width_str)
    
    if not match:
        return 0, 0
    
    val1 = int(match.group(1))
    val2_group = match.group(2)
    
    if val2_group:
        val2 = int(val2_group)
        return min(val1, val2), max(val1, val2)
    else:
        return val1, val1

def clean_weblock_data(weblock: dict[str, Any]) -> dict[str, Any]:
    """
    Clean the weblock data by removing any keys with None values.
    """
    cleaned_data = {}
    specs = weblock.get("specifications", {})

    # Unlike the other cleaners, this one builds a fresh dict rather than
    # rewriting the seed's — so the stable `id` has to be carried across
    # explicitly or `require_seed_id()` finds nothing.
    cleaned_data["id"] = weblock.get("id")
    # Carried through like raw_name below: this pass builds a FRESH dict from the
    # nested scrape rather than copying the source, so any key not named here is
    # dropped — and `add_weblocks_to_db` needs the seed id off the cleaned
    # payload. Every other loader keeps it for free by passing the item along.
    cleaned_data["id"] = weblock.get("id")

    cleaned_data["raw_name"] = weblock.get("name") 
    cleaned_data["raw_brand_name"] = weblock.get("brand") 

    cleaned_data["style"] = get_weblock_style(weblock.get("style"))
    cleaned_data["material"] = get_metal_materials(specs.get("Material"))
    
    # Parse width range
    width_min, width_max = parse_width_range(specs.get("Compatible webbing width"))
    cleaned_data["width_min"] = width_min
    cleaned_data["width_max"] = width_max
    
    cleaned_data["weight"] = parse_numerical_value(specs.get("Weight"), remove_suffix="gr")
    cleaned_data["breaking_strength"] = parse_numerical_value(specs.get("MBS"), remove_suffix="kN")
    
    cleaned_data["front_pin"] = get_front_pin_type(specs.get("Webbing connection type"))
    cleaned_data["attachment_point"] = get_attachment_point(specs.get("Anchor connection type"))
    cleaned_data["isa_certified"] = parse_boolean_isa(specs.get("ISA approved"))
    
    price, currency = parse_price_and_currency_from_weblock(weblock)
    cleaned_data["price"] = price
    cleaned_data["currency"] = currency.value if currency else None

    cleaned_data["date_introduced"] = weblock.get("date_introduced")
    cleaned_data["product_url"] = weblock.get("product_url")
    cleaned_data["active"] = weblock.get("active")

    # Free-text/optional columns carried straight through from the seed. The
    # SlackDB scrape never populated these, so they are absent on older rows.
    for passthrough in ("description", "notes", "colors", "version", "isa_warning"):
        cleaned_data[passthrough] = weblock.get(passthrough)

    return cleaned_data

def add_weblocks_to_db(weblocks: list[dict], session: SessionDep) -> None:
    """
    Add the loaded weblock and branddata to the database session.
    """
    brand_cache = {}

    for weblock in weblocks:
        weblock_for_brand = {"brand": weblock.get("raw_brand_name")}
        brand_id, brand_cache = get_brand(session, brand_cache, weblock_for_brand)

        weblock_create = WeblockCreate(
            name=weblock.get("raw_name", "Unknown Weblock"),
            brand_id=brand_id,
            release_date=weblock.get("date_introduced"),
            product_url=weblock.get("product_url"),
            style=weblock.get("style"),
            material=weblock.get("material"),
            width_min=weblock.get("width_min"),
            width_max=weblock.get("width_max"),
            weight=weblock.get("weight"),
            breaking_strength=weblock.get("breaking_strength"),
            front_pin=weblock.get("front_pin"),
            attachment_point=weblock.get("attachment_point"),
            isa_certified=weblock.get("isa_certified", False),
            isa_warning=weblock.get("isa_warning"),
            colors=weblock.get("colors"),
            price=weblock.get("price"),
            currency=weblock.get("currency"),
            description=weblock.get("description"),
            version=weblock.get("version"),
            notes=weblock.get("notes"),
            active=weblock.get("active"),
        )
        db_weblock = Weblock.model_validate(weblock_create)
        db_weblock.id = require_seed_id(weblock, "weblocks.json")
        db_weblock.brand = session.get(Brand, brand_id)
        print(f"Adding weblock: {db_weblock.name} by {db_weblock.brand.name}")
        session.add(db_weblock)
    
    session.commit()
    
def get_weblock_style(style_input: str | None) -> WeblockStyle | None:
    """
    Convert the seed's `style` string to a WeblockStyle.

    The seed carries the value verbatim ("Tensionable Weblock" / "Fixed
    Linelocker"); matching is loose so "linelocker", "line locker" and
    "tensionable" all resolve. Anything unrecognised (or missing) stays None
    rather than being guessed into a category.
    """
    if not style_input:
        return None

    style_str = style_input.lower().replace("-", " ")
    if "lock" in style_str and "line" in style_str:
        return WeblockStyle.LINELOCKER
    if "tension" in style_str:
        return WeblockStyle.TENSIONABLE
    return None


def get_front_pin_type(pin_type: str | list[str] | None) -> FrontPin:
    """
    Convert the front pin string or list to a FrontPin enum.
    A list is matched across all its items, not just the first. Screw pin is
    checked first: locks listed as both push/quick and screw pin are screw pins.
    """
    if not pin_type:
        return FrontPin.OTHER
    if isinstance(pin_type, list):
        if not pin_type:
            return FrontPin.OTHER
        pin_str = " ".join(pin_type)
    else:
        pin_str = pin_type

    pin_str = pin_str.lower()
    if "screw" in pin_str:
        return FrontPin.SCREWPIN
    elif "push" in pin_str or "quick" in pin_str:
        return FrontPin.PUSHPIN
    elif "pull" in pin_str:
        return FrontPin.PULLPIN
    elif "captive" in pin_str:
        return FrontPin.CAPTIVEPIN
    elif "fixed" in pin_str:
        return FrontPin.FIXEDBOLT
    else:
        return FrontPin.OTHER
    
def get_attachment_point(point_input: str | list[str] | None) -> AttachmentPoint:
    """
    Convert the attachment point(s) to an AttachmentPoint enum.
    A list is matched across all its items, not just the first. Pin and hole are
    checked ahead of bolt: a lock that accepts a pin is a pin anchor even when it
    also takes a bolt. "XL Mounting Hole" matches hole.
    """
    if not point_input:
        return None
    if isinstance(point_input, list):
        if not point_input:
            return None
        point_str = " ".join(point_input)
    else:
        point_str = point_input

    point_str = point_str.lower()
    if "universal" in point_str:
        return AttachmentPoint.UNIVERSAL
    elif "pin" in point_str:
        return AttachmentPoint.PIN
    elif "hole" in point_str:
        return AttachmentPoint.HOLE
    elif "bolt" in point_str:
        return AttachmentPoint.BOLT
    elif "bent" in point_str:
        return AttachmentPoint.BENTPLATE
    elif "sling" in point_str:
        return AttachmentPoint.SLING
    else:
        return AttachmentPoint.OTHER

# "1 unit and above : 43.00 EUR" → ("43.00", "EUR")
PRICE_PAIR_RE = re.compile(r'([0-9]+(?:\.[0-9]+)?)\s*([A-Z]{3})')
# "Converted from 219 CZK with the rate of 1 EUR = 24.90 CZK" → ("219", "CZK")
CONVERTED_FROM_RE = re.compile(r'[Cc]onverted from\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Z]{3})')


def parse_amount_and_currency(text: str | None, pattern: re.Pattern = PRICE_PAIR_RE) -> tuple[float, Currency] | None:
    """
    Pull an amount and its currency out of one string, as a pair.

    Price and currency must always come from the same match: SlackDB's `text`
    quotes the price already converted to EUR while its `tooltip` quotes the
    original, so reading the number from one and the code from the other
    labels a EUR figure with a foreign currency (8.80 EUR → "8.80 CZK").
    """
    if not text:
        return None
    match = pattern.search(text)
    if not match:
        return None
    try:
        currency = get_currency(match.group(2))
    except ValueError:
        return None
    return float(match.group(1)), currency


def parse_price_and_currency_from_weblock(weblock_data: dict) -> tuple[float | None, Currency | None]:
    """
    Extract the weblock's price and currency from its pricing data or specifications.

    The tooltip wins when present: it carries the manufacturer's *original*
    price and currency, which the display layer re-converts at live rates,
    rather than SlackDB's EUR figure frozen at whatever rate it scraped.
    """
    pricing = weblock_data.get("pricing") or []
    if pricing:
        found = (parse_amount_and_currency(pricing[0].get("tooltip"), CONVERTED_FROM_RE)
                 or parse_amount_and_currency(pricing[0].get("text")))
        if found:
            return found

    specs = weblock_data.get("specifications", {})
    found = parse_amount_and_currency(specs.get("Price (per unit)"))
    if found:
        return found

    return None, None

def parse_boolean_isa(value_str: str | None) -> bool:
    if not value_str:
        return False
    s = value_str.strip().lower()
    if s == "yes" or s == "true" or s == "approved": 
        return True
    return False

def load_weblocks_json() -> list[dict]:
    return read_seed_json("weblocks.json")

def load_weblocks(session: SessionDep) -> None:
    raw_weblocks_data = load_weblocks_json()
    print(f"Loaded {len(raw_weblocks_data)} raw weblock items from {WEBLOCKS_FILE}")

    cleaned_weblocks_payloads = []
    for item_data in raw_weblocks_data:
        try:
            cleaned_payload = clean_weblock_data(item_data)
            cleaned_weblocks_payloads.append(cleaned_payload)
        except Exception as e:
            print(f"Error cleaning weblock data for item '{item_data.get('name', 'Unknown')}': {e}")

    if not cleaned_weblocks_payloads:
        print("No weblock data successfully cleaned. Aborting.")
        return

    added_count = add_weblocks_to_db(cleaned_weblocks_payloads, session)
    print(f"Finished processing. Added {added_count} weblocks to the database.")

if __name__ == "__main__":
    weblocks = load_weblocks_json()
    print(f"Loaded {len(weblocks)} weblocks from {WEBLOCKS_FILE}")
    print(weblocks[:1])