import json
from pathlib import Path

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.treepro import TreePro, TreeProCreate
from slack_data.utilities.currencies import get_currency

TREEPRO_FILE = Path(__file__).parent.parent.parent / "treepros.json"


def load_treepros_json() -> list[dict]:
    """
    Load the tree pro data from the `treepros.json` file.
    """
    if not TREEPRO_FILE.exists():
        raise FileNotFoundError(f"TreePro file not found: {TREEPRO_FILE}")

    with open(TREEPRO_FILE, "r", encoding="utf-8") as file:
        treepro_data = json.load(file)

    return treepro_data


def clean_treepro_data(treepro: dict) -> dict:
    """
    Clean the treepro data by normalizing empty strings to None and coercing
    types where appropriate.
    """
    cleaned = {}
    for key, value in treepro.items():
        if value == "":
            cleaned[key] = None
        else:
            cleaned[key] = value

    # Ensure booleans are booleans
    if "has_sling_attachment" in cleaned:
        v = cleaned.get("has_sling_attachment")
        if isinstance(v, str):
            cleaned["has_sling_attachment"] = v.lower() in ("true", "1", "yes")
        else:
            cleaned["has_sling_attachment"] = bool(v) if v is not None else False

    return cleaned


def add_treepros_to_db(treepros: list[dict], session: SessionDep) -> None:
    """
    Add the loaded treepro and brand data to the database session.
    """
    brand_cache = {}

    for treepro in treepros:
        # Resolve brand/manufacturer
        tr_for_brand = {"brand": treepro.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, tr_for_brand)

        currency = None
        if (curr := treepro.get("currency")) is not None:
            currency = get_currency(curr)

        treepro_create = TreeProCreate(
            name=str(treepro.get("name")),
            brand_id=brand_id,
            release_date=treepro.get("release_date"),
            product_url=treepro.get("product_url"),
            weight=treepro.get("weight"),
            width=treepro.get("width"),
            length=treepro.get("length"),
            thickness=treepro.get("thickness"),
            has_sling_attachment=treepro.get("has_sling_attachment", False),
            price=treepro.get("price"),
            price_unit=treepro.get("price_unit"),
            currency=currency,
            description=treepro.get("description"),
            version=treepro.get("version"),
            notes=treepro.get("notes"),
        )

        db_treepro = TreePro.model_validate(treepro_create)
        db_treepro.brand = session.get(Brand, brand_id)
        print(f"Adding TreePro: {db_treepro.name} by {db_treepro.brand.name}")
        session.add(db_treepro)

    session.commit()
    session.refresh(db_treepro)


def load_treepros(session: SessionDep) -> None:
    """
    Load the tree pro data from the JSON file and add it to the database.
    """
    treepros = load_treepros_json()
    cleaned_treepros = [clean_treepro_data(treepro) for treepro in treepros]

    add_treepros_to_db(cleaned_treepros, session)
    print(f"Added {len(cleaned_treepros)} tree pro items to the database.")


if __name__ == "__main__":
    treepros = load_treepros_json()
    print(f"Loaded {len(treepros)} tree pro items from {TREEPRO_FILE}")
    print(treepros[:1])
