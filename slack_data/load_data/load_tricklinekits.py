import json
from pathlib import Path
from typing import Any

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.tricklinekits import TricklineKit, TricklineKitCreate, TensioningType
from slack_data.utilities.currencies import get_currency


TRICKLINEKITS_FILE = Path(__file__).parent.parent.parent / "tricklinekits.json"


def load_tricklinekits_json() -> list[dict]:
    """
    Load the tricklinekits data from the `tricklinekits.json` file.
    """
    if not TRICKLINEKITS_FILE.exists():
        raise FileNotFoundError(f"Tricklinekits file not found: {TRICKLINEKITS_FILE}")
    with open(TRICKLINEKITS_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def clean_tricklinekit_data(trick: dict) -> dict:
    """
    Clean the tricklinekit data by normalizing empty strings to None and coercing
    types where appropriate.
    """
    cleaned = {}
    for k, v in trick.items():
        cleaned[k] = None if v == "" else v

    # Booleans
    if "includes_treepro" in cleaned:
        v = cleaned.get("includes_treepro")
        if isinstance(v, str):
            cleaned["includes_treepro"] = v.lower() in ("true", "1", "yes")
        else:
            cleaned["includes_treepro"] = bool(v) if v is not None else False

    if "isa_certified" in cleaned:
        v = cleaned.get("isa_certified")
        if isinstance(v, str):
            cleaned["isa_certified"] = v.lower() in ("true", "1", "yes")
        else:
            cleaned["isa_certified"] = bool(v) if v is not None else False

    raw = cleaned.get("tensioning_type")
    if raw is None:
        cleaned["tensioning_type"] = TensioningType.OTHER.value
    else:
        rt = str(raw).upper()
        if "RAT2" in rt or "DOUBLE" in rt:
            cleaned["tensioning_type"] = TensioningType.DOUBLE_RATCHET.value
        elif "RAT1" in rt:
            cleaned["tensioning_type"] = TensioningType.SINGLE_RATCHET.value
        else:
            cleaned["tensioning_type"] = TensioningType.OTHER.value
    return cleaned


def add_tricklinekits_to_db(tricks: list[dict], session: SessionDep) -> None:
    """
    Add the loaded tricklinekit and brand data to the database session.
    """
    brand_cache = {}
    last = None
    for t in tricks:
        sk_for_brand = {"brand": t.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, sk_for_brand)

        currency = None
        if (curr := t.get("currency")) is not None:
            try:
                currency = get_currency(curr)
            except Exception:
                currency = None

        trick_create = TricklineKitCreate(
            name=str(t.get("name")),
            brand_id=brand_id,
            release_date=t.get("release_date"),
            product_url=t.get("product_url"),
            webbing_length=t.get("webbing_length") or 0,
            webbing_width=t.get("webbing_width") or 0,
            weight=t.get("weight"),
            tensioning_type=t.get("tensioning_type"),
            includes_treepro=t.get("includes_treepro", False),
            isa_certified=t.get("isa_certified", False),
            price=t.get("price"),
            currency=currency,
            description=t.get("description"),
            version=t.get("version"),
            notes=t.get("notes"),
        )

        db_tk = TricklineKit.model_validate(trick_create)
        db_tk.brand = session.get(Brand, brand_id)
        print(f"Adding trickline kit: {db_tk.name} by {db_tk.brand.name}")
        session.add(db_tk)
        last = db_tk

    session.commit()
    session.refresh(last)


def load_tricklinekits(session: SessionDep) -> None:
    """
    Load the trickline kit data from the JSON file and add it to the database.
    """
    tricks = load_tricklinekits_json()
    cleaned = [clean_tricklinekit_data(t) for t in tricks]
    add_tricklinekits_to_db(cleaned, session)
    print(f"Added {len(cleaned)} trickline kits to the database.")


if __name__ == "__main__":
    sks = load_tricklinekits_json()
    print(f"Loaded {len(sks)} trickline kit items from {TRICKLINEKITS_FILE}")
    print(sks[:1])
