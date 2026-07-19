import ast
import json
from pathlib import Path

from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate, get_brand
from slack_data.models.webbing import (
    FiberMaterial,
    Webbing,
    WebbingConstruction,
    WebbingCreate,
    classify_webbing,
)
from slack_data.utilities.currencies import Currency


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
        elif key == "isa_certified":
            cleaned_webbing[key] = bool(value) if isinstance(value, str) else value
        elif key in {"stretch", "materialComposition"}:
            # stretch (list of {kn, percent}) and materialComposition (list of
            # fiber names) are stored as valid JSON — the generic str() branch
            # below would emit a Python repr with single quotes, not JSON.
            cleaned_webbing[key] = json.dumps(value) if value else None
        elif key not in {"name", "brand", "materialType"} and value == "":
            cleaned_webbing[key] = None
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

        material = get_material_types(
            webbing.get("materialType"), webbing.get("materialComposition")
        )

        breaking_strength = (
            float(webbing["breakingStrength"])
            if webbing.get("breakingStrength") not in (None, "")
            else None
        )

        webbing_create = WebbingCreate(
            name=str(webbing.get("name")),
            brand_id=brand_id,
            release_date=webbing.get("date_introduced"),
            product_url=webbing.get("product_url"),
            material=material,
            # width is `int` mm in the model, but the enriched dataset carries
            # some decimal widths (e.g. "25.4"); coerce via float so int() won't
            # crash on them.
            width=int(float(webbing.get("width") or 0)),
            # weight is `float | None` in the model; the enriched dataset has
            # some null weights, so pass None through instead of float(None).
            weight=float(webbing.get("weight")) if webbing.get("weight") not in (None, "") else None,
            breaking_strength=breaking_strength,
            classification=classify_webbing(material, breaking_strength),
            stretch=webbing.get("stretch"),
            thickness=float(webbing.get("thickness")) if webbing.get("thickness") not in (None, "") else None,
            webbing_construction=get_webbing_construction(webbing.get("webbing_construction")),
            isa_certified=webbing.get("isa_certified", False),
            price=parse_price(webbing.get("priceMeter")),
            currency=parse_currency(webbing.get("currency")),
        )
        db_webbing = Webbing.model_validate(webbing_create)
        db_webbing.brand = session.get(Brand, brand_id)
        print(f"Adding webbing: {db_webbing.name} by {db_webbing.brand.name}")
        session.add(db_webbing)

    session.commit()
    session.refresh(db_webbing)

def get_material_types(material_type, composition) -> list[FiberMaterial]:
    """Resolve a webbing's fibers into the multi-select `material` list.

    `composition` wins when present — it is the explicit per-fiber breakdown
    (a JSON string like '["Polyester", "Dyneema/HMPE"]' as produced by
    clean_webbing_data, or a plain list). It is the only source for what used to
    be `materialType: "Hybrid"`, which named no actual fibers.

    Otherwise the single `materialType` string is resolved to a 1-element list.
    Unknown fiber names are skipped so one bad entry can't crash seeding; if
    nothing resolves, fall back to [OTHER] rather than an empty list, since
    `material` is NOT NULL.
    """
    if composition:
        fibers = json.loads(composition) if isinstance(composition, str) else composition
        result: list[FiberMaterial] = []
        for name in fibers:
            try:
                fiber = FiberMaterial(name)
            except ValueError:
                continue
            if fiber not in result:  # collapse duplicates, preserve order
                result.append(fiber)
        if result:
            return result

    return [get_material_type(str(material_type or ""))]


def parse_currency(value) -> Currency | None:
    """Map a currency code to the enum; unknown codes -> None (don't crash seeding)."""
    if not value:
        return None
    try:
        return Currency(str(value).upper())
    except ValueError:
        return None

def parse_price(raw) -> float | None:
    """priceMeter may be a number, a numeric string, or a stringified dict like
    "{'value': 1.69, 'currency': 'euro'}" left over from the original scrape."""
    if raw in (None, ""):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip()
    try:
        return float(s)
    except ValueError:
        pass
    try:
        parsed = ast.literal_eval(s)
    except (ValueError, SyntaxError):
        return None
    if isinstance(parsed, dict) and parsed.get("value") is not None:
        return float(parsed["value"])
    return None

def get_webbing_construction(value: str | None) -> WebbingConstruction | None:
    """Map a webbing_construction label (e.g. "Core/Sheath") to the enum."""
    if not value:
        return None
    try:
        return WebbingConstruction(str(value))
    except ValueError:
        return WebbingConstruction.OTHER

def get_material_type(material: str) -> FiberMaterial:
    """
    Convert a single material string to a FiberMaterial enum.

    Multi-fiber sources are handled by get_material_types() via the explicit
    composition list; a bare "Hybrid" names no fibers, so it lands in OTHER.
    """
    material = material.lower()
    if "nylon" in material or "polyamid" in material:
        return FiberMaterial.NYLON
    elif "polyester" in material or "pes" in material:
        return FiberMaterial.POLYESTER
    elif "dyneema" in material or "hmpe" in material:  # HMPE/UHMWPE == Dyneema
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
