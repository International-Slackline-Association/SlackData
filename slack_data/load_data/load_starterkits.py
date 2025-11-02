import json
from pathlib import Path
from typing import Any

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.starterkits import StarterKit, StarterKitCreate, TensioningType
from slack_data.utilities.currencies import get_currency


STARTERKITS_FILE = Path(__file__).parent.parent.parent / "starterkits.json"


def load_starterkits_json() -> list[dict]:
    """
    Load the starterkits data from the `starterkits.json` file.
    """
    if not STARTERKITS_FILE.exists():
        raise FileNotFoundError(f"Starterkits file not found: {STARTERKITS_FILE}")

    with open(STARTERKITS_FILE, "r", encoding="utf-8") as file:
        starter_kit_data = json.load(file)

    return starter_kit_data


def clean_starterkit_data(starterkit: dict) -> dict:
    """
    Clean the starterkit data by normalizing empty strings to None and coercing
    types where appropriate.
    """
    cleaned_kits = {}
    for key, value in starterkit.items():
        if value == "":
            cleaned_kits[key] = None
        else:
            cleaned_kits[key] = value

    # Booleans
    if "includes_treepro" in cleaned_kits:
        v = cleaned_kits.get("includes_treepro")
        if isinstance(v, str):
            cleaned_kits["includes_treepro"] = v.lower() in ("true", "1", "yes")
        else:
            cleaned_kits["includes_treepro"] = bool(v) if v is not None else False

    if "isa_certified" in cleaned_kits:
        v = cleaned_kits.get("isa_certified")
        if isinstance(v, str):
            cleaned_kits["isa_certified"] = v.lower() in ("true", "1", "yes")
        else:
            cleaned_kits["isa_certified"] = bool(v) if v is not None else False

    # Normalize tensioning type to one of the model's enum value strings.
    raw_t = cleaned_kits.get("tensioning_type")
    if raw_t is None:
        cleaned_kits["tensioning_type"] = TensioningType.OTHER.value
    else:
        rt = str(raw_t).upper()
        if "RAT2" in rt or "DOUBLE" in rt:
            cleaned_kits["tensioning_type"] = TensioningType.DOUBLE_RATCHET.value
        elif "RAT1" in rt or ("RAT" in rt and "RAT2" not in rt) or "SINGLE" in rt:
            cleaned_kits["tensioning_type"] = TensioningType.SINGLE_RATCHET.value
        elif "PRIM" in rt or "PRIMITIVE" in rt:
            cleaned_kits["tensioning_type"] = TensioningType.PRIMITIVE.value
        else:
            cleaned_kits["tensioning_type"] = TensioningType.OTHER.value

    return cleaned_kits


def add_starterkits_to_db(starterkits: list[dict], session: SessionDep) -> None:
    """
    Add the loaded starterkit and brand data to the database session.
    """
    brand_cache = {}

    for sk in starterkits:
        sk_for_brand = {"brand": sk.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, sk_for_brand)

        currency = None
        if (curr := sk.get("currency")) is not None:
            try:
                currency = get_currency(curr)
            except Exception:
                currency = None

        starterkit_create = StarterKitCreate(
            name=str(sk.get("name")),
            brand_id=brand_id,
            release_date=sk.get("release_date"),
            product_url=sk.get("product_url"),
            webbing_length=sk.get("webbing_length") or 0,
            webbing_width=sk.get("webbing_width") or 0,
            weight=sk.get("weight"),
            tensioning_type=sk.get("tensioning_type"),
            includes_treepro=sk.get("includes_treepro", False),
            isa_certified=sk.get("isa_certified", False),
            price=sk.get("price"),
            currency=currency,
            description=sk.get("description"),
            version=sk.get("version"),
            notes=sk.get("notes"),
        )

        db_sk = StarterKit.model_validate(starterkit_create)
        db_sk.brand = session.get(Brand, brand_id)
        print(f"Adding starter kit: {db_sk.name} by {db_sk.brand.name}")
        session.add(db_sk)

    session.commit()
    session.refresh(db_sk)


def load_starterkits(session: SessionDep) -> None:
    """
    Load the starter kit data from the JSON file and add it to the database.
    """
    starterkits = load_starterkits_json()
    cleaned_kits = [clean_starterkit_data(sk) for sk in starterkits]

    add_starterkits_to_db(cleaned_kits, session)
    print(f"Added {len(cleaned_kits)} starter kits to the database.")


if __name__ == "__main__":
    sks = load_starterkits_json()
    print(f"Loaded {len(sks)} starter kit items from {STARTERKITS_FILE}")
    print(sks[:1])
