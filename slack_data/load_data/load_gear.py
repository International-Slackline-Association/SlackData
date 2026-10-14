"""
The gear loader — one for all nine types (LIVE_EDITING_PHASE_3.md, P3-A).

A gear seed entry is the item in the model's own vocabulary: the `<X>Create`
field names and enum values, plus `id` and `brand` (the maker's name). So an
edit on the site is a field assignment, and the log, the edit form, the
manufacturer API and the store all name a field the same way.

Until phase 3 each type had its own loader translating a scraped shape
(`priceMeter`, `breakingStrength`, weblocks' nested `pricing` …) into the model.
The seeds were converted once, through those loaders, so each file now holds
exactly what the site showed; the translation lives in git history, not here.

What is NOT in an entry, because it is not typed by anyone:

- `brand_id` — resolved from `brand` through `manufacturers.json`'s
  `catalog_id` (`get_brand`), as before;
- the ISA's statements (`isa_warning`, `isa_certified`, `isa_certificate`,
  `isa_class`) — derived by the ISA passes on every build, so a new warning can
  never leave a stale flag stored on a product.

An entry naming a field the model does not have, or one of those derived
fields, is refused: silently dropping it would lose an edit.

**`unmodelled`** holds what the old seeds carried but no model field does — the
weblocks' SlackDB scrape (WLL, diverter diameter, efficiency, usage, its URLs)
and four roller dimensions. It is kept verbatim so the conversion lost nothing,
is never loaded or edited, and goes out with the export. Promoting a value from
it to a real field is a model change (D35).

One field is stored differently from the model: webbing `stretch` is a list of
`{kn, percent}` readings in the seed and a JSON string on the model, which is
what the frontend parses. `JSON_TEXT_FIELDS` holds that one translation.
"""

import json

from sqlmodel import Session, SQLModel

from slack_data.load_data._seed_io import read_seed_json, require_seed_id
from slack_data.models.brands import get_brand
from slack_data.models.connectors import Connector, ConnectorCreate
from slack_data.models.grips import Grip, GripCreate
from slack_data.models.leashrings import LeashRing, LeashRingCreate
from slack_data.models.rollers import Roller, RollerCreate
from slack_data.models.starterkits import StarterKit, StarterKitCreate
from slack_data.models.treepro import TreePro, TreeProCreate
from slack_data.models.tricklinekits import TricklineKit, TricklineKitCreate
from slack_data.models.webbing import Webbing, WebbingCreate
from slack_data.models.weblocks import Weblock, WeblockCreate

# Collection (= seed file stem, = frontend slug) -> (table model, create schema).
# Load order is this order, as it was in seed.py.
GEAR: dict[str, tuple[type[SQLModel], type[SQLModel]]] = {
    "webbings": (Webbing, WebbingCreate),
    "weblocks": (Weblock, WeblockCreate),
    "rollers": (Roller, RollerCreate),
    "leashrings": (LeashRing, LeashRingCreate),
    "grips": (Grip, GripCreate),
    "treepros": (TreePro, TreeProCreate),
    "starterkits": (StarterKit, StarterKitCreate),
    "tricklinekits": (TricklineKit, TricklineKitCreate),
    "connectors": (Connector, ConnectorCreate),
}

# Set on every build by load_isa_warnings / load_isa_certifications; never typed.
DERIVED_FIELDS = frozenset({"isa_warning", "isa_certified", "isa_certificate", "isa_class"})

# Kept verbatim, never loaded (see the module docstring).
UNMODELLED_KEY = "unmodelled"

# Stored as JSON in the seed, as a JSON string on the model.
JSON_TEXT_FIELDS: dict[str, frozenset[str]] = {"webbings": frozenset({"stretch"})}


class UnknownField(ValueError):
    """A seed entry names a field its model does not hold, or a derived one."""


def stored_fields(collection: str) -> frozenset[str]:
    """Every field a seed entry may carry besides `id` and `brand`."""
    _, create = GEAR[collection]
    return frozenset(create.model_fields) - {"brand_id"} - DERIVED_FIELDS


def to_row(collection: str, entry: dict, brand_id: int) -> SQLModel:
    """One seed entry -> its table row (not yet added to a session)."""
    filename = f"{collection}.json"
    model, _ = GEAR[collection]
    # `[]` is never stored: null is "none recorded" (see any model's gear_sellers).
    data = {
        key: (None if value == [] else value)
        for key, value in entry.items()
        if key not in ("id", "brand", UNMODELLED_KEY)
    }
    unknown = sorted(set(data) - stored_fields(collection))
    if unknown:
        raise UnknownField(f"{filename} id {entry.get('id')}: no such field {unknown}")
    for field in JSON_TEXT_FIELDS.get(collection, ()):
        if data.get(field):
            data[field] = json.dumps(data[field])
    # One validation, by the table model itself (the Create schema shares its
    # fields): validating twice was a third of the load.
    row = model.model_validate({**data, "brand_id": brand_id})
    row.id = require_seed_id(entry, filename)
    return row


def to_entry(collection: str, row: SQLModel, brand_name: str, unmodelled: dict | None = None) -> dict:
    """A table row -> its seed entry: the inverse of `to_row`.

    `id`, `name`, `brand` first, then the model's own field order; unset
    (None) fields are left out, so an entry holds what is known.
    """
    _, create = GEAR[collection]
    values = create.model_validate(row, from_attributes=True).model_dump(mode="json")
    entry: dict = {"id": row.id, "name": values["name"], "brand": brand_name}
    for field in create.model_fields:
        if field in entry or field not in stored_fields(collection):
            continue
        value = values[field]
        if value is None:
            continue
        if field in JSON_TEXT_FIELDS.get(collection, ()):
            value = json.loads(value)
        entry[field] = value
    if unmodelled:
        entry[UNMODELLED_KEY] = unmodelled
    return entry


def load_gear(session: Session, collection: str) -> int:
    """Load one gear seed into the session's database. Returns the count."""
    filename = f"{collection}.json"
    brand_cache: dict[str, int] = {}
    rows = []
    for entry in read_seed_json(filename):
        brand_id, brand_cache = get_brand(session, brand_cache, {"brand": entry.get("brand")})
        rows.append(to_row(collection, entry, brand_id))
    # One add and one commit: a session.get per row (the old loaders' way of
    # attaching the Brand) flushed the session every time, which was most of
    # the cost of building the catalogue.
    session.add_all(rows)
    session.commit()
    print(f"Loaded {len(rows)} {collection} from {filename}.")
    return len(rows)
