import json
from pathlib import Path

from sqlmodel import select
from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate
from slack_data.models.weblocks import FrontPin, AttachmentPoint, Weblock, WeblockCreate
from slack_data.utilities.materials import MetalMaterial
from slack_data.utilities.brand_finder import get_brand

WEBLOCK_FILE = Path(__file__).parent.parent.parent / "weblocks.json"

def load_weblocks_json() -> list[dict]:
    """
    Load the weblock data from the ISA's `weblock.json` file.
    """
    if not WEBLOCK_FILE.exists():
        raise FileNotFoundError(f"Weblock file not found: {WEBLOCK_FILE}")
    with open(WEBLOCK_FILE, "r", encoding="utf-8") as file:
        weblock_data = json.load(file)

    return weblock_data

def clean_weblock_data(weblock: dict) -> dict:
    """
    Clean the weblock data by removing any keys with None values.
    """
    cleaned_weblock = weblock
    for key, value in weblock.items():
        if key in {"width", "weight"} and value == "":
            cleaned_weblock[key] = 0
        elif key not in {"name", "brand", "materialType"} and value == "":
            cleaned_weblock[key] = None
        elif key == "isa_certified":
            cleaned_weblock[key] = bool(value) if isinstance(value,str) else value
        else:
            cleaned_weblock[key] = str(value) if value is not None else None
    return cleaned_weblock

def add_weblocks_to_db(weblocks: list[dict], session: SessionDep) -> None:
    """
    Add the loaded weblock and branddata to the database session.
    """
    brand_cache = {}

    for weblock in weblocks:
        brand_id, brand_cache = get_brand(session, brand_cache, weblock)

        material = get_metal_material(str(weblock.get("material", "")))
        front_pin = get_front_pin_type(str(weblock.get("front_pin", "")))
        attachment_point = get_attachment_point(str(weblock.get("attachment_point", "")))

        weblock_create = WeblockCreate(
            name=str(weblock.get("name")),
            brand_id=brand_id,
            material=material,
            width=int(weblock.get("width", 0)),
            weight=float(weblock.get("weight", 0)),
            breaking_strength=weblock.get("breakingStrength"),
            front_pin=front_pin,
            attachment_point=attachment_point,
        )
        db_weblock = Weblock.model_validate(weblock_create)
        db_weblock.brand = session.get(Brand, brand_id)
        print(f"Adding webbing: {db_weblock.name} by {db_weblock.brand.name}")
        session.add(db_weblock)
    
    session.commit()
    session.refresh(db_weblock)

def get_metal_material(material: str) -> MetalMaterial:
    """
    Convert the material string to a MetalMaterial enum.
    """
    material = material.lower()
    if "aluminum" in material:
        return MetalMaterial.ALUMINUM
    elif "stainless steel" in material:
        return MetalMaterial.STAINLESS_STEEL
    elif "steel" in material:
        return MetalMaterial.STEEL
    elif "titanium" in material:
        return MetalMaterial.TITANIUM
    else:
        return MetalMaterial.OTHER
    
def get_front_pin_type(pin_type: str) -> FrontPin:
    """
    Convert the front pin string to a FrontPin enum
    """
    pin_type = pin_type.lower()
    if "push" in pin_type:
        return FrontPin.PUSHPIN
    elif "pull" in pin_type:
        return FrontPin.PULLPIN
    elif "captive" in pin_type:
        return FrontPin.CAPTIVEPIN
    elif "fixed" in pin_type:
        return FrontPin.FIXEDBOLT
    else:
        return FrontPin.OTHER
    
def get_attachment_point(attachment_type: str) -> AttachmentPoint:
    """
    Convert the attachment point to a AttachmentPoint enum
    """
    attachment_type = attachment_type.lower()
    if "universal" in attachment_type:
        return AttachmentPoint.UNIVERSAL
    elif "pin" in attachment_type:
        return AttachmentPoint.PIN
    elif "bolt" in attachment_type:
        return AttachmentPoint.BOLT
    elif "bent" in attachment_type:
        return AttachmentPoint.BENTPLATE
    elif "sling" in attachment_type:
        return AttachmentPoint.SLING
    elif "hole" in attachment_type:
        return AttachmentPoint.HOLE
    else:
        return AttachmentPoint.OTHER

# TODO: Add a json file for the data and import it, add a main function
