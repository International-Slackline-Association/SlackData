import json
from pathlib import Path

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate
from slack_data.models.webbing import FiberMaterial, Webbing, WebbingCreate


WEBBING_FILE = Path(__file__).parent.parent.parent / "webbings.json"

def load_webbings_json() -> list[dict]:
    """
    Load the webbing data from the ISA's `webbing.json` file.
    """
    if not WEBBING_FILE.exists():
        raise FileNotFoundError(f"Webbing file not found: {WEBBING_FILE}")

    with open(WEBBING_FILE, "r", encoding="utf-8") as file:
        webbing_data = json.load(file)

    return webbing_data

def clean_webbing_data(webbing: dict) -> dict:
    """
    Clean the webbing data by removing any keys with None values.
    """
    cleaned_webbing = webbing
    for key, value in webbing.items():
        if key in {"width", "weight"} and value == "":
            cleaned_webbing[key] = 0
        elif key not in {"name", "brand", "materialType"} and value == "":
            cleaned_webbing[key] = None
        elif key == "isa_certified":
            cleaned_webbing[key] = bool(value) if isinstance(value, str) else value
        else:
            cleaned_webbing[key] = str(value) if value is not None else None
    return cleaned_webbing

def add_webbings_to_db(webbings: list[dict], session: SessionDep) -> None:
    """
    Add the loaded webbing and branddata to the database session.
    """
    brand_cache = {}

    for webbing in webbings:
        brand_id, brand_cache = get_brand(session, brand_cache, webbing)

        material = get_material_type(str(webbing.get("materialType", "")))

        webbing_create = WebbingCreate(
            name=str(webbing.get("name")),
            brand_id=brand_id,
            material=material,
            width=int(webbing.get("width", 0)),
            weight=float(webbing.get("weight", 0)),
            breaking_strength=webbing.get("breakingStrength"),
            stretch=webbing.get("stretch"),
        )
        db_webbing = Webbing.model_validate(webbing_create)
        db_webbing.brand = session.get(Brand, brand_id)
        print(f"Adding webbing: {db_webbing.name} by {db_webbing.brand.name}")
        session.add(db_webbing)

    session.commit()
    session.refresh(db_webbing)

def get_brand(session: SessionDep, brand_cache: dict[str, int], webbing: dict) -> tuple[int,dict]:
    brand_name = str(webbing.get("brand"))
    if brand_name not in brand_cache:
        # get brand_id from the database or create it if it doesn't exist
        statement = select(Brand.id).where(Brand.name == brand_name)
        result = session.exec(statement).first()
        if result is None:
            # Create a new brand entry if it doesn't exist
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
        
        brand_cache[brand_name] = brand_id
    brand_id = brand_cache[brand_name]
    return brand_id, brand_cache

def get_material_type(material: str) -> FiberMaterial:
    """
    Convert the material string to a Material enum.
    """
    material = material.lower()
    if "pes/polyamid" in material:
        return FiberMaterial.HYBRID
    elif "nylon" in material or "polyamid" in material:
        return FiberMaterial.NYLON
    elif "polyester" in material or "pes" in material:
        return FiberMaterial.POLYESTER
    elif "dyneema" in material:
        return FiberMaterial.DYNEEMA
    elif "vectran" in material:
        return FiberMaterial.VECTRAN
    else:
        return FiberMaterial.OTHER

def load_webbings(session: SessionDep) -> None:
    """
    Load the webbing data from the JSON file and add it to the database.
    """
    webbings = load_webbings_json()
    cleaned_webbings = [clean_webbing_data(webbing) for webbing in webbings]

    add_webbings_to_db(cleaned_webbings, session)
    print(f"Added {len(cleaned_webbings)} webbings to the database.")

if __name__ == "__main__":
    webbings = load_webbings_json()
    print(f"Loaded {len(webbings)} webbings from {WEBBING_FILE}")
    print(webbings[:1])
