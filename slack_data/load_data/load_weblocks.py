import json
import re
from pathlib import Path
from typing import Any

from sqlmodel import select
from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.weblocks import FrontPin, AttachmentPoint, Weblock, WeblockCreate
from slack_data.utilities.materials import MetalMaterial, get_metal_material
from slack_data.utilities.currencies import Currency, get_currency
from slack_data.utilities.isa_warnings import ISAWarning

WEBLOCKS_FILE = Path(__file__).parent.parent.parent / "weblocks.json"

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

    cleaned_data["raw_name"] = weblock.get("name") 
    cleaned_data["raw_brand_name"] = weblock.get("brand") 

    cleaned_data["material"] = get_metal_material(specs.get("Material"))
    
    # Parse width range
    width_min, width_max = parse_width_range(specs.get("Compatible webbing width"))
    cleaned_data["width_min"] = width_min
    cleaned_data["width_max"] = width_max
    
    cleaned_data["weight"] = parse_numerical_value(specs.get("Weight"), remove_suffix="gr")
    cleaned_data["breaking_strength"] = parse_numerical_value(specs.get("MBS"), remove_suffix="kN")
    
    cleaned_data["front_pin"] = get_front_pin_type(specs.get("Webbing connection type"))
    cleaned_data["attachment_point"] = get_attachment_point(specs.get("Anchor connection type"))
    cleaned_data["isa_certified"] = parse_boolean_isa(specs.get("ISA approved"))
    
    cleaned_data["price"] = parse_price_from_weblock(weblock)
    cleaned_data["currency"] = parse_currency_from_weblock(weblock).value if parse_currency_from_weblock(weblock) else None

    cleaned_data["date_introduced"] = weblock.get("date_introduced")
    cleaned_data["product_url"] = weblock.get("product_url")

    return cleaned_data

def add_weblocks_to_db(weblocks: list[dict], session: SessionDep) -> None:
    """
    Add the loaded weblock and branddata to the database session.
    """
    brand_cache = {}

    for weblock in weblocks:
        weblock_for_brand = {"brand": weblock.get("raw_brand_name")}
        brand_id, brand_cache = get_brand(session, brand_cache, weblock_for_brand)

        material = get_metal_material(str(weblock.get("material", "")))
        front_pin = get_front_pin_type(str(weblock.get("front_pin", "")))
        attachment_point = get_attachment_point(str(weblock.get("attachment_point", "")))

        weblock_create = WeblockCreate(
            name=weblock.get("raw_name", "Unknown Weblock"),
            brand_id=brand_id,
            release_date=weblock.get("date_introduced"),
            product_url=weblock.get("product_url"),
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
            notes=weblock.get("notes")
        )
        db_weblock = Weblock.model_validate(weblock_create)
        db_weblock.brand = session.get(Brand, brand_id)
        print(f"Adding weblock: {db_weblock.name} by {db_weblock.brand.name}")
        session.add(db_weblock)
    
    session.commit()
    session.refresh(db_weblock)
    
def get_front_pin_type(pin_type: str | list[str] | None) -> FrontPin:
    """
    Convert the front pin string or list to a FrontPin enum.
    If pin_type is a list, uses the first item.
    """
    if not pin_type:
        return FrontPin.OTHER
    if isinstance(pin_type, list):
        if not pin_type:
            return FrontPin.OTHER
        pin_str = pin_type[0]
    else:
        pin_str = pin_type
    
    pin_str = pin_str.lower()
    if "push" in pin_str:
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
    If point_input is a list, uses the first item.
    """
    if not point_input:
        return None
    if isinstance(point_input, list):
        if not point_input:
            return None
        point_str = point_input[0]
    else:
        point_str = point_input
    
    point_str = point_str.lower()
    if "universal" in point_str:
        return AttachmentPoint.UNIVERSAL
    elif "pin" in point_str:
        return AttachmentPoint.PIN
    elif "bolt" in point_str:
        return AttachmentPoint.BOLT
    elif "bent" in point_str:
        return AttachmentPoint.BENTPLATE
    elif "sling" in point_str:
        return AttachmentPoint.SLING
    elif "hole" in point_str:
        return AttachmentPoint.HOLE
    else:
        return AttachmentPoint.OTHER

def parse_price_from_weblock(weblock_data: dict) -> float | None:
    """Extract price from weblock pricing data or specifications."""
    # Try pricing array first
    pricing = weblock_data.get("pricing", [])
    if pricing and pricing[0].get("text"):
        # Look for price pattern: number before currency code
        text = pricing[0]["text"]
        match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:EUR|USD|GBP|CAD|PLN|ZAR)', text)
        if match:
            return float(match.group(1))
    
    # Try specifications as fallback
    specs = weblock_data.get("specifications", {})
    price_text = specs.get("Price (per unit)", "")
    if price_text:
        match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:EUR|USD|GBP|CAD|PLN|ZAR)', price_text)
        if match:
            return float(match.group(1))
    
    return None

def parse_currency_from_weblock(weblock_data: dict) -> Currency | None:
    """Extract currency from weblock pricing data or specifications."""
    
    # Try pricing array first - check tooltip for original currency
    pricing = weblock_data.get("pricing", [])
    if pricing:
        tooltip = pricing[0].get("tooltip", "")
        try:
            currency = get_currency(tooltip)
        except:
            pass
        if currency: return currency
        
        # Check main text
        text = pricing[0].get("text", "")
        try:
            currency = get_currency(text)
        except:
            pass
        if currency: return currency
    
    # Try specifications as fallback
    specs = weblock_data.get("specifications", {})
    price_text = specs.get("Price (per unit)", "")
    try:
        currency = get_currency(price_text)
    except:
        pass
    if currency: return currency
    
    return Currency.EUR

def parse_boolean_isa(value_str: str | None) -> bool:
    if not value_str:
        return False
    s = value_str.strip().lower()
    if s == "yes" or s == "true" or s == "approved": 
        return True
    return False

def load_weblocks_json() -> list[dict]:
    if not WEBLOCKS_FILE.exists():
        raise FileNotFoundError(f"Weblock JSON file not found: {WEBLOCKS_FILE}")

    with open(WEBLOCKS_FILE, "r", encoding="utf-8") as file:
        weblock_data = json.load(file)
    
    return weblock_data

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