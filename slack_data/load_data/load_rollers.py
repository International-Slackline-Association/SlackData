

from slack_data.database import SessionDep
from slack_data.load_data._seed_io import read_seed_json, require_seed_id, seed_path, to_bool
from slack_data.models.brands import Brand, get_brand
from slack_data.models.rollers import BearingMaterial, LockType, SliderType, Roller, RollerCreate
from slack_data.utilities.currencies import get_currency
from slack_data.utilities.materials import RollerMaterial, get_metal_materials

ROLLER_FILE = seed_path("rollers.json")

def load_rollers_json() -> list[dict]:
    """
    Load the rollers data from the `rollers.json` file.
    """
    return read_seed_json("rollers.json")

def clean_roller_data(rollers: dict) -> dict:
    """
    Clean the roller data by removing any keys with None values.
    """
    cleaned_rollers = rollers
    for key, value in rollers.items():
        if key in {"width", "weight"} and value == "":
            cleaned_rollers[key] = 0
        elif key not in {"name", "brand", "materialType"} and value == "":
            cleaned_rollers[key] = None
        elif key == "isa_approved":
            cleaned_rollers[key] = to_bool(value)
        else:
            cleaned_rollers[key] = str(value) if value is not None else None
    return cleaned_rollers

def add_rollers_to_db(rollers: list[dict], session: SessionDep) -> None:
    """
    Add the loaded roller and brand data to the database session.
    """
    brand_cache = {}
    
    for roller in rollers:
        roller_for_brand = {"brand": roller.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, roller_for_brand)

        if (currency := roller.get("price_unit")) is not None:
            currency = get_currency(currency)

        roller_create = RollerCreate(
            name=str(roller.get("name")),
            brand_id=brand_id,
            release_date=roller.get("date_introduced"),
            product_url=roller.get("product_url"),
            material=get_metal_materials(roller.get("material")),
            roller_material=get_roller_material(str(roller.get("roller_material", ""))),
            lock_type=get_lock_type(str(roller.get("locking_type", ""))),
            bearing_material=get_bearing_material(str(roller.get("bearing_material", ""))),
            width=roller.get("width", None),
            # `weight` is `float | None` on the model — a roller whose maker does
            # not publish a weight must stay None. `.get("weight", 0)` did not do
            # that: the default only applies when the KEY is absent, so an
            # explicit `"weight": null` returned None and crashed float(). And
            # where the key really was missing it substituted 0, which reads as
            # "weighs nothing" rather than "unknown".
            weight=float(w) if (w := roller.get("weight")) is not None else None,
            breaking_strength=roller.get("mbs"),
            slider_type=get_slider_type(str(roller.get("slider_type", ""))),
            isa_certified=roller.get("isa_approved", False),
            price=roller.get("price"),
            currency=currency,
            active=roller.get("active"),
        )
        db_roller = Roller.model_validate(roller_create)
        db_roller.id = require_seed_id(roller, "rollers.json")
        db_roller.brand = session.get(Brand, brand_id)
        print(f"Adding roller: {db_roller.name} by {db_roller.brand.name}")
        session.add(db_roller)

    session.commit()

def get_slider_type(slider_type: str) -> SliderType:
    """
    Convert the material string to a Material enum.
    """
    slider_type = slider_type.lower()
    if "moving plates" in slider_type:
        return SliderType.MovingPlates
    elif "carabiner" in slider_type:
        return SliderType.Carabiner
    elif "locking carabiner" in slider_type:
        return SliderType.LockingCarabiner
    else:
        return SliderType.Other
    
def get_roller_material(roller_material: str) -> RollerMaterial:
    """
    Convert the roller material string to a RollerMaterial enum.
    """
    roller_material = roller_material.lower()
    if "aluminum" in roller_material:
        return RollerMaterial.ALUMINUM
    elif "stainless steel" in roller_material:
        return RollerMaterial.STAINLESS_STEEL
    elif "steel" in roller_material:
        return RollerMaterial.STEEL
    elif "plastic" in roller_material or "nylon" in roller_material:
        return RollerMaterial.PLASTIC
    else:
        return RollerMaterial.OTHER

def get_lock_type(lock_type: str) -> LockType:
    """
    Convert the lock type string to a LockType enum.
    """
    lock_type = lock_type.lower()
    if "non-locking" in lock_type:
        return LockType.Nonlocking
    elif "screw lock" in lock_type or "screwlock" in lock_type:
        return LockType.ScrewLock
    elif "auto lock" in lock_type or "autolock" in lock_type:
        return LockType.AutoLock
    elif "twist lock" in lock_type or "twistlock" in lock_type:
        return LockType.TwistLock
    elif "magnetic lock" in lock_type or "magneticlock" in lock_type:
        return LockType.MagneticLock
    else:
        return LockType.Other
    
def get_bearing_material(bearing_material: str) -> BearingMaterial:
    """
    Convert the bearing material string to a BearingMaterial enum.
    """
    bearing_material = bearing_material.lower()
    if "stainless steel" in bearing_material:
        return BearingMaterial.StainlessSteel
    elif "steel" in bearing_material:
        return BearingMaterial.Steel
    else:
        return BearingMaterial.Other

def load_rollers(session: SessionDep) -> None:
    """
    Load the roller data from the JSON file and add it to the database.
    """
    rollers = load_rollers_json()
    cleaned_rollers = [clean_roller_data(roller) for roller in rollers]

    add_rollers_to_db(cleaned_rollers, session)
    print(f"Added {len(cleaned_rollers)} rollers to the database.")

if __name__ == "__main__":
    rollers = load_rollers_json()
    print(f"Loaded {len(rollers)} rollers from {ROLLER_FILE}")
    print(rollers[:1])
