import json
from pathlib import Path

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.grips import Grip, GripCreate, ConnectionType
from slack_data.utilities.currencies import get_currency
from slack_data.utilities.materials import get_metal_material

GRIP_FILE = Path(__file__).parent.parent.parent / "grips.json"

def load_grips_json() -> list[dict]:
    """
    Load the grips data from the `grips.json` file.
    """
    if not GRIP_FILE.exists():
        raise FileNotFoundError(f"Grips file not found: {GRIP_FILE}")

    with open(GRIP_FILE, "r", encoding="utf-8") as file:
        grip_data = json.load(file)

    return grip_data

def clean_grip_data(grip: dict) -> dict:
    """
    Clean the grip data by removing any keys with None values.
    """
    cleaned_grip = grip
    for key, value in grip.items():
        if key not in {"name", "manufacturer", "material", "isa_certified"} and value == "":
            cleaned_grip[key] = None
        elif key == "isa_certified":
            cleaned_grip[key] = bool(value) if isinstance(value, str) else value
            if value is None:
                cleaned_grip[key] = False
        else:
            cleaned_grip[key] = str(value) if value is not None else None
    return cleaned_grip

def add_grips_to_db(grips: list[dict], session: SessionDep) -> None:
    """
    Add the loaded grip and brand data to the database session.
    """
    brand_cache = {}
    
    for grip in grips:

        grip_for_brand = {"brand": grip.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, grip_for_brand)

        if (currency := grip.get("currency")) is not None:
            currency = get_currency(currency)

        grip_create = GripCreate(
            name=str(grip.get("name")),
            brand_id=brand_id,
            release_date=grip.get("date_introduced"),
            product_url=grip.get("product_url"),
            material=get_metal_material(str(grip.get("material", ""))),
            width_min=int(grip.get("width_min", 0)),
            width_max=grip.get("width_max"),
            weight=grip.get("weight"),
            wll=grip.get("wll"),
            mbs=grip.get("mbs"),
            common_slipping_threshold=grip.get("common_slipping_threshold"),
            connection_type=get_connection_type(str(grip.get("connection_type", ""))),
            isa_certified=grip.get("isa_certified", False),
            price=grip.get("price"),
            currency=currency,
        )
        db_grip = Grip.model_validate(grip_create)
        db_grip.brand = session.get(Brand, brand_id)
        
        print(f"Adding grip: {db_grip.name} by {db_grip.brand.name}")
        session.add(db_grip)

    session.commit()
    session.refresh(db_grip)

def get_connection_type(connection_type: str) -> ConnectionType:
    """
    Convert the connection type string to a ConnectionType enum.
    """
    connection_type = connection_type.lower()
    if "dyneema sling loop" in connection_type:
        return ConnectionType.DYNEEMA_SLING_LOOP
    elif "mounting hole" in connection_type:
        return ConnectionType.MOUNTING_HOLE
    else:
        return ConnectionType.OTHER

def load_grips(session: SessionDep) -> None:
    """
    Load the grip data from the JSON file and add it to the database.
    """
    grips = load_grips_json()
    cleaned_grips = [clean_grip_data(grip) for grip in grips]

    add_grips_to_db(cleaned_grips, session)
    print(f"Added {len(cleaned_grips)} grips to the database.")

if __name__ == "__main__":
    grips = load_grips_json()
    print(f"Loaded {len(grips)} grips from {GRIP_FILE}")
    print(grips[:1])
