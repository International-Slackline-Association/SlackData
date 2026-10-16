"""
Who may change what — phase 5 (LIVE_EDITING_PHASE_5.md, P5-C, P5-D), opened
to everyone in phase 6 (LIVE_EDITING_PHASE_6.md, D52, P6-A).

One rule, used by every edit (the edit routes, the media routes, revert and
the machine API), so the frontend, the routes and the API cannot disagree:

| who | may change |
|---|---|
| an admin | anything, uncapped |
| a manufacturer (a person with brand links, `Person.brands`) | what an editor may; uncapped on their own brands' gear and entries, and revert there (D53, D58) |
| an editor (anyone signed in) | every product and brand entry, within the rate cap — never a product's `brand` or `gear_sellers` (P6-A, D54), a brand's name (D67), a merge (D20) or a revert (D58) |
| a blocked account | nothing (D22) |

"Their own gear" is the product's **maker** (`brand`), as stored — co-listing
in `gear_sellers` gives no rights (D38). Whether a save counts toward the cap
is read off the role it is recorded with (`ratecap.py`).
"""

from collections.abc import Iterable

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.models.people import Person, Role
from slack_data.utilities.brand_aliases import canonical_brand

BRANDS = "manufacturers"

# Fields of a product only an admin changes, even on a manufacturer's own gear:
# who makes it (P5-D, P6-A) and who else sells it (D54).
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


def manages(person: Person, brand: tuple[int, str] | None) -> bool:
    """An admin, or one of this brand's manufacturers: uncapped here, and may
    revert here (D53, D58)."""
    return is_admin(person) or (brand is not None and person.represents(brand[0]))


def may_edit(person: Person, brand: tuple[int, str] | None = None) -> bool:
    """May this person change gear of this brand (or the brand's own entry)?
    Everyone signed in, since phase 6 — unless blocked."""
    return not person.blocked


def may_revert(person: Person, brand: tuple[int, str] | None) -> bool:
    return not person.blocked and manages(person, brand)


def may_edit_any(person: Person) -> bool:
    """Has this person any editing rights at all (for an upload form)."""
    return not person.blocked
