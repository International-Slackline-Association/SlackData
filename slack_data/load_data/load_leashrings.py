import json
from pathlib import Path

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.leashrings import LeashRing, LeashRingCreate
from slack_data.utilities.currencies import get_currency
from slack_data.utilities.materials import get_metal_material

LEASHRING_FILE = Path(__file__).parent.parent.parent / "leashrings.json"

def load_leashrings_json() -> list[dict]:
    """
    Load the leash rings data from the `leashrings.json` file.
    """
    if not LEASHRING_FILE.exists():
        raise FileNotFoundError(f"Leash rings file not found: {LEASHRING_FILE}")

    with open(LEASHRING_FILE, "r", encoding="utf-8") as file:
        leashring_data = json.load(file)

    return leashring_data

def clean_leashring_data(leashring: dict) -> dict:
    """
    Clean the leash ring data by removing any keys with None values.
    """
    cleaned_leashring = leashring
    for key, value in leashring.items():
        if key not in {"name", "brand_id", "material", "isa_certified"} and value == "":
            cleaned_leashring[key] = None
        elif key == "isa_certified":
            cleaned_leashring[key] = bool(value) if isinstance(value, str) else value
            if value is None:
                cleaned_leashring[key] = False
        else:
            cleaned_leashring[key] = str(value) if value is not None else None
    return cleaned_leashring

def add_leashrings_to_db(leashrings: list[dict], session: SessionDep) -> None:
    """
    Add the loaded leash ring and brand data to the database session.
    """
    brand_cache = {}
    
    for leashring in leashrings:

        leashring_for_brand = {"brand": leashring.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, leashring_for_brand)

        if (currency := leashring.get("currency")) is not None:
            currency = get_currency(currency)

        leashring_create = LeashRingCreate(
            name=str(leashring.get("name")),
            brand_id=brand_id,
            material=get_metal_material(str(leashring.get("material", ""))),
            inner_diameter=leashring.get("inner_diameter"),
            outer_diameter=leashring.get("outer_diameter"),
            weight=leashring.get("weight"),
            breaking_strength=leashring.get("breaking_strength"),
            isa_certified=leashring.get("isa_certified", False),
            price=leashring.get("price"),
            currency=currency,
            notes=leashring.get("notes"),
        )
        db_leashring = LeashRing.model_validate(leashring_create)
        db_leashring.brand = session.get(Brand, brand_id)
        print(f"Adding leash ring: {db_leashring.name} by {db_leashring.brand.name}")
        session.add(db_leashring)

    session.commit()
    session.refresh(db_leashring)

def load_leashrings(session: SessionDep) -> None:
    """
    Load the leash ring data from the JSON file and add it to the database.
    """
    leashrings = load_leashrings_json()
    cleaned_leashrings = [clean_leashring_data(leashring) for leashring in leashrings]

    add_leashrings_to_db(cleaned_leashrings, session)
    print(f"Added {len(cleaned_leashrings)} leash rings to the database.")

if __name__ == "__main__":
    leashrings = load_leashrings_json()
    print(f"Loaded {len(leashrings)} leash rings from {LEASHRING_FILE}")
    print(leashrings[:1])

