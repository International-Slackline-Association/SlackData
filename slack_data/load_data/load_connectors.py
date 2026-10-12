

from slack_data.database import SessionDep
from slack_data.load_data._seed_io import (
    read_seed_json,
    require_seed_id,
    seed_path,
    to_bool,
)
from slack_data.models.brands import Brand, get_brand
from slack_data.models.connectors import (
    Connector,
    ConnectorClosure,
    ConnectorCreate,
    ConnectorMaterial,
    ConnectorStyle,
)
from slack_data.utilities.currencies import get_currency

CONNECTOR_FILE = seed_path("connectors.json")

# Seed keys holding a list, bound for a JSON column. Absent or empty stays None,
# never [] — null is "none recorded".
LIST_KEYS = ("standards", "gear_sellers")

def load_connectors_json() -> list[dict]:
    """
    Load the connector data from the `connectors.json` file.
    """
    return read_seed_json("connectors.json")

def clean_connector_data(connector: dict) -> dict:
    """
    Clean the connector data: blank strings become None, empty lists become None.

    Values are otherwise left as the seed wrote them. Unlike the older loaders
    nothing is passed through str(): `standards` and `gear_sellers` are lists,
    and the numbers are numbers in this seed.
    """
    cleaned_connector = dict(connector)
    for key, value in connector.items():
        if key in LIST_KEYS:
            cleaned_connector[key] = value or None
        elif value == "":
            cleaned_connector[key] = None
    return cleaned_connector

def add_connectors_to_db(connectors: list[dict], session: SessionDep) -> None:
    """
    Add the loaded connector and brand data to the database session.
    """
    brand_cache = {}

    for connector in connectors:

        connector_for_brand = {"brand": connector.get("manufacturer")}
        brand_id, brand_cache = get_brand(session, brand_cache, connector_for_brand)

        if (currency := connector.get("currency")) is not None:
            currency = get_currency(currency)

        # The enums are parsed strictly: a misspelt style or closure in the seed
        # is an error on re-seed, not a silent "Other".
        closure = connector.get("closure")

        connector_create = ConnectorCreate(
            name=str(connector.get("name")),
            brand_id=brand_id,
            connector_style=ConnectorStyle(connector.get("connector_style")),
            closure=ConnectorClosure(closure) if closure is not None else None,
            material=ConnectorMaterial(connector.get("material")),
            alloy=connector.get("alloy"),
            mbs_straight_pull=connector.get("mbs_straight_pull"),
            mbs_crossload=connector.get("mbs_crossload"),
            mbs_gate_open=connector.get("mbs_gate_open"),
            opening=connector.get("opening"),
            pin_diameter=connector.get("pin_diameter"),
            captive_pin=to_bool(connector.get("captive_pin")),
            rope_diameter=connector.get("rope_diameter"),
            weight=connector.get("weight"),
            standards=connector.get("standards"),
            standards_source=connector.get("standards_source"),
            product_group=connector.get("product_group"),
            release_date=connector.get("date_introduced"),
            product_url=connector.get("product_url"),
            price=connector.get("price"),
            currency=currency,
            version=connector.get("version"),
            notes=connector.get("notes"),
            active=connector.get("active"),
            description=connector.get("description"),
            manufacturer_not_for_highline=connector.get("manufacturer_not_for_highline"),
            manufacturer_not_for_highline_source=connector.get("manufacturer_not_for_highline_source"),
            # Brand names only — see the model. Absent stays None, not [].
            gear_sellers=connector.get("gear_sellers"),
        )
        db_connector = Connector.model_validate(connector_create)
        db_connector.id = require_seed_id(connector, "connectors.json")
        db_connector.brand = session.get(Brand, brand_id)
        print(f"Adding connector: {db_connector.name} by {db_connector.brand.name}")
        session.add(db_connector)

    session.commit()

def load_connectors(session: SessionDep) -> None:
    """
    Load the connector data from the JSON file and add it to the database.
    """
    connectors = load_connectors_json()
    cleaned_connectors = [clean_connector_data(connector) for connector in connectors]

    add_connectors_to_db(cleaned_connectors, session)
    print(f"Added {len(cleaned_connectors)} connectors to the database.")

if __name__ == "__main__":
    connectors = load_connectors_json()
    print(f"Loaded {len(connectors)} connectors from {CONNECTOR_FILE}")
    print(connectors[:1])
