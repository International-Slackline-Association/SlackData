"""
Resolving "the product the manufacturer means" to a row in our catalogue.

This is the hard half of the manufacturer API, and it is hard because none of
the three available handles is trustworthy on its own:

| handle | why it is not enough |
|---|---|
| our `gear_id` | stable in the catalogue now — every root `*.json` carries an explicit `id` — but not in the caller's records. A brand's stored mapping can predate a product being withdrawn or re-adjudicated, and nothing obliges them to re-read it. |
| `name` | collides — `webbings.json` holds 3 duplicate names, `weblocks.json` 2 — and brands rename products. |
| their SKU | stable on their side, but we hold no SKU column anywhere, so it matches nothing today. |

(Gear ids were themselves positional until the seeds gained explicit ids: a
SQLite autoincrement assigned at seed time, so inserting one item mid-file
shifted every id after it. That is fixed at the source, which is why this module
is now guarding against a stale *caller*, not a stale *catalogue*.)

The answer here is **verify, then self-heal**, which is the same guard
`load_data/load_isa_warnings.py` applies to recalls: an id is only believed if
the name recorded beside it still agrees, and a disagreement is reported rather
than silently re-pointed. Concretely:

1. A brand discovers our ids once, from `GET /manufacturer/gear`.
2. They send `gear_id` back, with the `name` they recorded next to it.
3. We check the id is **theirs** (the one security failure that matters here),
   then that the name still agrees. If it does, matched.
4. If the id no longer resolves — their mapping is old, the product was
   withdrawn — we fall back to matching the name within their own brand, and
   **echo the resolved id back in the response**, so their next call is correct
   again without anyone being told to do anything.
5. Ambiguity is refused, never guessed. Two rows of theirs with that name is a
   question only a human can answer.

`manufacturer_sku` is carried through and stored but resolves nothing yet —
see `models/submissions.py`. When SKUs eventually live in the root `*.json`
they become step 0 here and the rest becomes the fallback.

**Reads only.** This module takes a `Session` and never writes through it. That
is safe on the live site — the catalogue is opened `mode=ro&immutable=1`, and
every `GET` route in the app reads through the same session — but it is the one
thing to keep true: a write here would pass every local test and fail hosted.
"""

import re
from dataclasses import dataclass
from enum import Enum

from sqlmodel import Session, select

from slack_data.models.brand_clients import ManufacturerPrincipal
from slack_data.models.brands import Brand
from slack_data.models.grips import Grip
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.starterkits import StarterKit
from slack_data.models.treepro import TreePro
from slack_data.models.tricklinekits import TricklineKit
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.submissions.fields import CORRECTABLE_FIELDS

# Keyed by the frontend's gear slug — the same keys `submissions/fields.py`
# uses, so a gear type is either fully supported by both or by neither.
GEAR_MODELS = {
    "webbings": Webbing,
    "weblocks": Weblock,
    "leashrings": LeashRing,
    "grips": Grip,
    "rollers": Roller,
    "treepros": TreePro,
    "starterkits": StarterKit,
    "tricklinekits": TricklineKit,
}

_WHITESPACE = re.compile(r"\s+")


def normalize(name: str | None) -> str:
    """Case- and whitespace-insensitive, because a brand's spelling of their own
    product drifts from ours in exactly those two ways ("Type 18" / "type  18").
    Nothing more aggressive: stripping punctuation would merge "A-Line" with
    "Aline", which really can be two products."""
    return _WHITESPACE.sub(" ", (name or "").strip()).casefold()


class Resolution(str, Enum):
    """How the row was found — reported per item so the caller can react."""

    BY_ID = "id"          # their id was right and the name agreed
    BY_NAME = "name"      # the id drifted or was absent; matched on name
    UNMATCHED = "new"     # we hold no such product — treated as a new item


@dataclass(frozen=True)
class Match:
    resolution: Resolution
    gear_id: int | None
    gear_name: str
    # Set only when `resolution` is BY_NAME after an id was supplied: the id the
    # brand sent, which no longer points at this product. Echoed back so their
    # integration can correct itself rather than drifting further.
    stale_gear_id: int | None = None


class MatchError(Exception):
    """Base for the two failures that must never be guessed past."""

    status_code = 400


class ForeignGear(MatchError):
    """The item names gear belonging to a different brand.

    **This is the security failure this whole module exists to prevent**, and
    the reason `tests/test_manufacturer_api.py` has a test named after it. 403,
    not 404: the row plainly exists, it is simply not theirs to speak for, and
    pretending otherwise would make this endpoint an existence oracle for a
    catalogue that is public anyway.
    """

    status_code = 403


class AmbiguousGear(MatchError):
    """Two or more of the brand's own products answer to that name.

    409 rather than a guess. The catalogue genuinely contains duplicate names,
    so this is a real state and not a corrupt one — the brand resolves it by
    sending the `gear_id` from `GET /manufacturer/gear`.
    """

    status_code = 409


class BrandMismatch(MatchError):
    """The credential's `brand_id` no longer names the brand it was registered to.

    **The one failure the rest of this module cannot catch**, because everything
    below scopes its queries *by* `principal.brand_id` — so a wrong id does not
    produce an error, it produces a confident answer about the wrong company.

    Brand ids used to be the same kind of unstable handle as gear ids: a SQLite
    autoincrement assigned by seed order, with no id in the root `*.json`. They
    come from `catalog_id` in manufacturers.json now (see
    `load_data/brand_ids.py`), so a re-seed no longer moves them.

    This stays because the credential and the catalogue are still written at
    different times: `register.py` resolves the id against whatever catalogue
    the operator has locally, while the record it writes is read by a Lambda
    holding a catalogue baked from a possibly different commit. Nothing stops a
    manufacturers.json entry being renamed or re-keyed by hand between the two,
    and if they disagree a brand's credential silently speaks for whoever now
    holds that id. One primary-key read is a cheap price for never finding out
    the hard way.

    So the stored `brand_name` is verified against the id before any route uses
    it — the same verify-then-report guard `load_isa_warnings.py` applies to
    recalls, and `resolve()` applies to gear. 503, not 403: nothing is wrong with
    the caller's credential, our own mapping is stale, and the fix is an operator
    re-running `register.py`, not anything the brand can do.
    """

    status_code = 503


def verify_brand(session: Session, principal: ManufacturerPrincipal) -> None:
    """Check the credential's brand id still names the brand it was issued for.

    Called before **every** manufacturer route does anything with
    `principal.brand_id`. Cheap — one primary-key read — and it is the only
    thing standing between an id drift and one brand being handed another's
    inventory.
    """
    brand = session.get(Brand, principal.brand_id)
    if brand is None:
        raise BrandMismatch(
            f"brand #{principal.brand_id} is not in this catalogue;"
            " these credentials need re-registering"
        )
    if normalize(brand.name) != normalize(principal.brand_name):
        raise BrandMismatch(
            f"brand #{principal.brand_id} is {brand.name!r} in this catalogue,"
            f" but these credentials were issued to {principal.brand_name!r};"
            " they need re-registering"
        )


def current_spec(item, gear_type: str) -> dict:
    """The values a brand may change, as we currently hold them.

    **The keys are the derived correctable field list, not the model's columns.**
    That is the whole point: the same names `POST /manufacturer/gear` accepts,
    so a brand can edit this dict and send it straight back, and a field added
    to a model becomes readable and writable in the same commit with nothing to
    remember. It also means the two fields the write refuses — `brand_id` (a
    submitter knows a name, not a key) and `classification` (derived on every
    seed, so a hand-edit is overwritten) — are absent here rather than being
    offered for editing and then rejected.

    `brand_name` is the one key that is not a column: it is a computed field
    over the `Brand` relationship, which is exactly why it is correctable —
    a submitter can see it is wrong but cannot set it through `<X>Update`.
    `getattr` reaches it anyway.

    Values keep their stored types, **deliberately unlike `changes` on the
    write**, where everything is text because the admin hand-applies prose. A
    read has no such excuse, and stringifying `40.0` here would make the
    round-trip lossy.
    """
    return {name: getattr(item, name, None) for name in sorted(CORRECTABLE_FIELDS[gear_type])}


def brand_gear(
    session: Session,
    brand_id: int,
    gear_type: str | None = None,
    include_spec: bool = False,
) -> list[dict]:
    """Every catalogue row belonging to one brand — the discovery endpoint's body.

    This is what makes the whole scheme work: a brand cannot map their SKUs onto
    ids they were never told. `active` is included because a brand looking at
    their own inventory immediately asks which of these we still list as sold.

    `include_spec` adds the editable values per row (see `current_spec`), which
    is what lets a brand GET what we hold, change it and send it back. It is
    opt-in because the "map all my SKUs across eight types" call does not want
    sixty spec sheets — and because every integration written before it existed
    asks for the bare form. It widens each row, **never which rows**: the scope
    is still `brand_id`, so this cannot become a way to read another brand.
    """
    types = [gear_type] if gear_type else list(GEAR_MODELS)
    rows: list[dict] = []
    for slug in types:
        model = GEAR_MODELS[slug]
        for item in session.exec(select(model).where(model.brand_id == brand_id)).all():
            row = {
                "gear_type": slug,
                "gear_id": item.id,
                "name": item.name,
                "active": getattr(item, "active", None),
            }
            if include_spec:
                row["spec"] = current_spec(item, slug)
            rows.append(row)
    rows.sort(key=lambda row: (row["gear_type"], normalize(row["name"])))
    return rows


def _by_name(session: Session, brand_id: int, gear_type: str, name: str) -> list:
    """The brand's own rows of this type whose name normalizes to `name`.

    Filtered in Python rather than in SQL: SQLite's `LOWER` is ASCII-only and
    would not fold the accented names several European brands use, and a brand's
    inventory is tens of rows, not thousands.
    """
    model = GEAR_MODELS[gear_type]
    wanted = normalize(name)
    rows = session.exec(select(model).where(model.brand_id == brand_id)).all()
    return [row for row in rows if normalize(row.name) == wanted]


def resolve(
    session: Session,
    principal: ManufacturerPrincipal,
    gear_type: str,
    gear_id: int | None,
    name: str | None,
) -> Match:
    """Find the row this item is about. Raises `MatchError` rather than guessing.

    The order is id-then-name and not the reverse, because an id the brand
    recorded from our own discovery endpoint is the strongest signal we have —
    right up to the moment it disagrees with the name, at which point it is the
    weakest and the name takes over.
    """
    model = GEAR_MODELS[gear_type]

    if gear_id is not None:
        existing = session.get(model, gear_id)

        if existing is not None:
            # Ownership first, before anything is revealed about the row and
            # before any fallback could quietly rescue the request.
            if not principal.owns(existing.brand_id):
                raise ForeignGear(
                    f"{gear_type} #{gear_id} belongs to another brand"
                )
            if not name or normalize(existing.name) == normalize(name):
                return Match(Resolution.BY_ID, existing.id, existing.name)

        # Either no such id, or the id points at a different product of theirs
        # than the name says. Both mean the same thing — the id drifted — and
        # both are recoverable from the name alone.
        if not name:
            raise MatchError(
                f"{gear_type} #{gear_id} does not match anything we hold;"
                " send `name` as well so it can be re-resolved"
            )
        matched = _by_name(session, principal.brand_id, gear_type, name)
        if len(matched) == 1:
            return Match(Resolution.BY_NAME, matched[0].id, matched[0].name, gear_id)
        if len(matched) > 1:
            raise AmbiguousGear(
                f"{len(matched)} of your {gear_type} are named {name!r}"
                f" (ids {', '.join(str(row.id) for row in matched)});"
                " send the gear_id from GET /manufacturer/gear"
            )
        # No id and no name match: a genuinely new product, sent with a stale id.
        return Match(Resolution.UNMATCHED, None, name, gear_id)

    if not name:
        raise MatchError("an item needs a gear_id or a name")

    matched = _by_name(session, principal.brand_id, gear_type, name)
    if len(matched) == 1:
        return Match(Resolution.BY_NAME, matched[0].id, matched[0].name)
    if len(matched) > 1:
        raise AmbiguousGear(
            f"{len(matched)} of your {gear_type} are named {name!r}"
            f" (ids {', '.join(str(row.id) for row in matched)});"
            " send the gear_id from GET /manufacturer/gear"
        )
    return Match(Resolution.UNMATCHED, None, name)
