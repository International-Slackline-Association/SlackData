"""
Which fields a submission is allowed to talk about.

`changes` is a free-form map of field name → proposed value, so without a guard
the admin triage list fills up with typos (`breaking_stength`) and invented
fields that no amount of reviewing can turn into a JSON patch. The names are
therefore checked at the API boundary.

**The list is derived, never written down.** It comes from each gear type's real
`<X>Update` schema at import time, which is the same source the catalogue's own
`PATCH` routes validate against. A field added to a model is correctable the
moment it exists, and a field renamed can't leave a stale copy behind here —
which is exactly what CLAUDE.md's frontend↔backend contract rule is asking for,
applied to the backend's own boundary.
"""

from pydantic import BaseModel

from slack_data.models.grips import GripUpdate
from slack_data.models.leashrings import LeashRingUpdate
from slack_data.models.rollers import RollerUpdate
from slack_data.models.starterkits import StarterKitUpdate
from slack_data.models.treepro import TreeProUpdate
from slack_data.models.tricklinekits import TricklineKitUpdate
from slack_data.models.webbing import WebbingUpdate
from slack_data.models.weblocks import WeblockUpdate

# Real model fields a submitter has no business proposing a value for.
_EXCLUDED = frozenset(
    {
        # The brand foreign key. A submitter knows "Balance Community", not 17,
        # and an id from a different environment is worse than no answer at all.
        # `brand_name` below is the field they actually mean.
        "brand_id",
        # Derived, not stored knowledge: load_webbings.py computes it from
        # material + breaking_strength on every seed, so a hand-edit to it is
        # overwritten by the next deploy. Correct the inputs instead.
        "classification",
    }
)

# Fields that exist for a submitter but not on the model. `brand_name` is on the
# `*Public` response (a computed field over the Brand relationship), so the
# frontend already displays it and a submitter can see it is wrong — it just
# isn't settable through `*Update`. Resolving it to a brand row is the admin's
# job at patch time.
_SYNTHETIC = frozenset({"brand_name"})


def _correctable(schema: type[BaseModel]) -> frozenset[str]:
    return (frozenset(schema.model_fields) - _EXCLUDED) | _SYNTHETIC


# Keyed by the frontend's gear slug (frontend/src/config/gearTypes.ts), which is
# what the submit form has in hand — not the router prefix.
CORRECTABLE_FIELDS: dict[str, frozenset[str]] = {
    "webbings": _correctable(WebbingUpdate),
    "weblocks": _correctable(WeblockUpdate),
    "leashrings": _correctable(LeashRingUpdate),
    "grips": _correctable(GripUpdate),
    "rollers": _correctable(RollerUpdate),
    "treepros": _correctable(TreeProUpdate),
    "starterkits": _correctable(StarterKitUpdate),
    "tricklinekits": _correctable(TricklineKitUpdate),
}

GEAR_TYPES: frozenset[str] = frozenset(CORRECTABLE_FIELDS)


def unknown_fields(gear_type: str, names) -> list[str]:
    """The submitted field names this gear type has no such field for."""
    allowed = CORRECTABLE_FIELDS.get(gear_type, frozenset())
    return sorted(name for name in names if name not in allowed)
