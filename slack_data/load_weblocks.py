import json
import re
from pathlib import Path
from typing import Any, cast
from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate
from slack_data.models.weblocks import ( 
    MetalMaterial,
    FrontPin,
    AttachmentPoint,
    Weblock,
    WeblockCreate,
)
from slack_data.utilities.currencies import Currency 
from slack_data.utilities.isa_warnings import ISAWarning 

WEBLOCKS_FILE = Path(__file__).parent.parent / "weblocks.json" 


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

# TODO: Adapt to use a range 
def parse_width(width_str: str | None) -> int | None:
    if not width_str:
        return None
    width_str = width_str.lower().replace(" ", "")
    match = re.match(r"(\d+)(?:mm)?(?:-(\d+)(?:mm)?)?", width_str)
    if match:
        val1 = int(match.group(1))
        return val1 # TODO: return range
    return None

def get_metal_material(material_str: str | None) -> MetalMaterial | None:
    if not material_str:
        return None
    s = material_str.lower().replace('-', ' ').strip()
    if "stainless steel" in s or "stainlesssteel" in s:
        return MetalMaterial.STAINLESS_STEEL
    elif "aluminium" in s:
        return MetalMaterial.ALUMINUM
    elif "steel" in s: 
        return MetalMaterial.STEEL
    elif "titanium" in s:
        return MetalMaterial.TITANIUM
    return MetalMaterial.OTHER 

def get_front_pin_type(pin_str: str | None) -> FrontPin | None:
    if not pin_str:
        return None
    s = pin_str.lower().replace(' ', '').replace('-', '')
    if "pushpin" in s:
        return FrontPin.PUSHPIN
    if "pullpin" in s:
        return FrontPin.PULLPIN
    if "captivepin" in s:
        return FrontPin.CAPTIVEPIN
    if "fixedbolt" in s: 
        return FrontPin.FIXEDBOLT
    return None 

def get_attachment_point_type(point_input: str | list[str] | None) -> AttachmentPoint | None:
    if not point_input:
        return None
    
    point_str = ""
    if isinstance(point_input, list):
        if not point_input: return None
        point_str = point_input[0] 
    elif isinstance(point_input, str):
        point_str = point_input
    else:
        return None

    s = point_str.lower().replace(' ', '').replace('-', '')
    if "universal" in s:
        return AttachmentPoint.UNIVERSAL
    if "hole" in s or "mountinghole" in s:
        return AttachmentPoint.HOLE
    if "pin" in s:
        return AttachmentPoint.PIN
    if "bolt" in s:
        return AttachmentPoint.BOLT
    if "bentplate" in s:
        return AttachmentPoint.BENTPLATE
    if "sling" in s:
        return AttachmentPoint.SLING
    return None 

def parse_boolean_isa(value_str: str | None) -> bool:
    if not value_str:
        return False
    s = value_str.strip().lower()
    if s == "yes" or s == "true" or s == "approved": 
        return True
    return False

def parse_price_currency(price_str: str | None) -> tuple[float | None, Currency | None]:
    # TODO: parse price
    return 0, None
    
def load_weblocks_json() -> list[dict]:
    if not WEBLOCKS_FILE.exists():
        raise FileNotFoundError(f"Weblock JSON file not found: {WEBLOCKS_FILE}")

    with open(WEBLOCKS_FILE, "r", encoding="utf-8") as file:
        weblock_data = json.load(file)
    
    return weblock_data

def clean_weblock_data(item_data: dict[str, Any]) -> dict[str, Any]:
    cleaned_data = {}
    specs = item_data.get("specifications", {})

    cleaned_data["raw_name"] = item_data.get("product_name") 
    cleaned_data["raw_brand_name"] = item_data.get("brand") 

    cleaned_data["material"] = get_metal_material(specs.get("Material"))
    cleaned_data["width"] = parse_width(specs.get("Compatible webbing width"))
    cleaned_data["weight"] = parse_numerical_value(specs.get("Weight"), remove_suffix="gr")
    cleaned_data["breaking_strength"] = parse_numerical_value(specs.get("MBS"), remove_suffix="kN")
    
    cleaned_data["front_pin"] = get_front_pin_type(specs.get("Webbing connection type"))
    cleaned_data["attachment_point"] = get_attachment_point_type(specs.get("Anchor connection type"))
    cleaned_data["isa_certified"] = parse_boolean_isa(specs.get("ISA approved"))
    
    # TODO: price and currency 
    cleaned_data["price"] = 0
    cleaned_data["currency"] = "EURO"

    return cleaned_data


def get_brand(session: SessionDep, weblock_item_cleaned: dict) -> int:
    brand_name = weblock_item_cleaned.get("raw_brand_name")
    if not brand_name:
        raise ValueError("Brand name is missing from weblock data.")

    brand_name = cast(str, brand_name).strip() 
    print(f"Brand name is:  {brand_name}")

    statement = select(Brand.id).where(Brand.name == brand_name)
    result = session.exec(statement).first()
    
    if result is None:
        brand_create = BrandCreate(name=brand_name) 
        db_brand = Brand.model_validate(brand_create)
        print(f"Adding brand: {db_brand.name}")
        session.add(db_brand)
        session.commit() 
        session.refresh(db_brand)
        brand_id = db_brand.id
    else:
        brand_id = result 

    if brand_id is None:
        raise ValueError(f"Brand ID for '{brand_name}' could not be determined.")
    
    return brand_id


def add_weblocks_to_db(cleaned_weblocks: list[dict], session: SessionDep) -> int:
    added_count = 0

    for weblock_payload in cleaned_weblocks:
        try:
            brand_id = get_brand(session, weblock_payload)
            create_dict = {
                "name": weblock_payload.get("raw_name", "Unknown Weblock"),
                "brand_id": brand_id,
                "release_date": weblock_payload.get("release_date"),
                "material": weblock_payload.get("material"),
                "width": weblock_payload.get("width"),
                "weight": weblock_payload.get("weight"),
                "breaking_strength": weblock_payload.get("breaking_strength"),
                "front_pin": weblock_payload.get("front_pin"),
                "attachment_point": weblock_payload.get("attachment_point"),
                "isa_certified": weblock_payload.get("isa_certified", False),
                "isa_warning": weblock_payload.get("isa_warning"), 
                "colors": weblock_payload.get("colors"),
                "price": weblock_payload.get("price"),
                "currency": weblock_payload.get("currency"),
                "description": weblock_payload.get("description"),
                "version": weblock_payload.get("version"), 
                "notes": weblock_payload.get("notes")
            }
            
            if not create_dict["name"]:
                print(f"Skipping item due to missing name: {weblock_payload}")
                continue

            weblock_create_instance = WeblockCreate(create_dict)
            
            db_weblock = Weblock.model_validate(weblock_create_instance)

            print(f"Adding weblock: {db_weblock.name} by Brand ID: {db_weblock.brand_id}")
            session.add(db_weblock)
            added_count += 1
        
        except ValueError as e:
            print(f"Skipping weblock due to validation error: {e}. Data: {weblock_payload.get('raw_name')}")
        except Exception as e:
            print(f"An unexpected error occurred for weblock {weblock_payload.get('raw_name')}: {e}")


    if added_count > 0:
        session.commit()
        print(f"Committed {added_count} weblocks to the database.")
    else:
        print("No weblocks were added in this batch.")
    return added_count


def load_weblocks(session: SessionDep) -> None:
    raw_weblocks_data = load_weblocks_json()
    print(f"Loaded {len(raw_weblocks_data)} raw weblock items from {WEBLOCKS_FILE}")

    cleaned_weblocks_payloads = []
    for item_data in raw_weblocks_data:
        try:
            cleaned_payload = clean_weblock_data(item_data)
            cleaned_weblocks_payloads.append(cleaned_payload)
        except Exception as e:
            print(f"Error cleaning weblock data for item '{item_data.get('product_name', 'Unknown')}': {e}")

    if not cleaned_weblocks_payloads:
        print("No weblock data successfully cleaned. Aborting.")
        return

    added_count = add_weblocks_to_db(cleaned_weblocks_payloads, session)
    print(f"Finished processing. Added {added_count} weblocks to the database.")

