"""
Who may change what — phase 5 (LIVE_EDITING_PHASE_5.md, P5-C, P5-D).

One rule, used by every edit (the edit routes, the media routes, revert and
the machine API), so the frontend, the routes and the API cannot disagree:

| who | may change |
|---|---|
| an admin | anything |
| a manufacturer (a person with brand links, `Person.brands`) | the products whose `brand` is one of theirs, and those brands' own entries — never a product's `brand`, its `gear_sellers` (D54), a merge, or a new brand |
| anyone else | nothing yet: editing opens to every ISA account in phase 6 |

"Their own gear" is the product's **maker** (`brand`), as stored — co-listing
in `gear_sellers` gives no rights (D38).
"""

from collections.abc import Iterable

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.models.people import Person, Role
from slack_data.utilities.brand_aliases import canonical_brand

BRANDS = "manufacturers"

# Fields of a product only an admin changes, even on a manufacturer's own gear:
# who makes it (P5-D) and who else sells it (D54).
ADMIN_ONLY_FIELDS = frozenset({"brand", "gear_sellers"})


def brand_of(documents: Iterable[Document], brand_name: str | None) -> tuple[int, str] | None:
    """(catalog_id, name) of the brand a product names, or None."""
    if not brand_name:
        return None
    wanted = canonical_brand(str(brand_name))
    for document in documents:
        if document.collection != BRANDS or document.key == ENVELOPE_KEY or document.retired:
            continue
        name = document.data.get("name")
        if name and canonical_brand(str(name)) == wanted and document.data.get("catalog_id") is not None:
            return int(document.data["catalog_id"]), wanted
    return None


def brand_names(documents: Iterable[Document], catalog_ids: Iterable[int]) -> list[dict]:
    """[{catalog_id, name}] for these brands, in the order given."""
    names = {
        int(d.data["catalog_id"]): canonical_brand(str(d.data["name"]))
        for d in documents
        if d.collection == BRANDS and d.key != ENVELOPE_KEY and d.data.get("catalog_id") is not None
    }
    return [{"catalog_id": cid, "name": names[cid]} for cid in catalog_ids if cid in names]


def is_admin(person: Person) -> bool:
    return person.has(Role.ADMIN)


def may_edit(person: Person, brand: tuple[int, str] | None) -> bool:
    """May this person change gear of this brand (or the brand's own entry)?"""
    return is_admin(person) or (brand is not None and person.represents(brand[0]))


def may_edit_any(person: Person) -> bool:
    """Has this person any editing rights at all (for an upload form)."""
    return is_admin(person) or bool(person.brands)
