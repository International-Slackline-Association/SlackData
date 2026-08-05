from enum import Enum
from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning


class FiberMaterial(str, Enum):
    NYLON = "Nylon"
    POLYESTER = "Polyester"
    DYNEEMA = "Dyneema/HMPE"  # Dyneema, UHMWPE and HMPE are used interchangeably
    VECTRAN = "Vectran"
    OTHER = "Other"
    # No HYBRID member: `Webbing.material` is a list, so a hybrid is spelled out
    # as its component fibers, e.g. ["Polyester", "Dyneema/HMPE"].

class Classification(str, Enum):
    A_PLUS = "A+"
    A = "A"
    B = "B"
    C = "C"
    NOT_FOR_HIGHLINE = "Not for Highline"


# Best-to-worst ordering, used to pick the strongest class of a hybrid's fibers.
_CLASSIFICATION_RANK = {
    Classification.A_PLUS: 4,
    Classification.A: 3,
    Classification.B: 2,
    Classification.C: 1,
    Classification.NOT_FOR_HIGHLINE: 0,
}


def classify_webbing(
    material: "list[FiberMaterial] | None",
    breaking_strength: float | None,
) -> Classification:
    """Derive the ISA highline classification from a webbing's fibers + breaking
    strength (kN).

    `material` is the full fiber list. A multi-fiber (formerly "hybrid") webbing is
    graded on its *strongest* component fiber: a Polyester/Dyneema webbing is graded
    on its polyester, because the HMPE strand contributes no ISA class of its own.

    Missing fibers or strength -> Not for Highline.
    """
    if not material or breaking_strength is None:
        return Classification.NOT_FOR_HIGHLINE

    return max(
        (_classify_fiber(fiber, breaking_strength) for fiber in material),
        key=lambda c: _CLASSIFICATION_RANK[c],
    )


def _classify_fiber(
    material: "FiberMaterial",
    breaking_strength: float,
) -> Classification:
    """Classification of a single fiber at a given breaking strength.

    ISA certifies single webbings by strength class, gated by fiber material:
      - Nylon (PA):      eligible for all classes (C/B/A/A+) by strength.
      - Polyester (PES): eligible for B/A/A+ only; Type C is NOT certified for PES.
      - HMPE (Dyneema/UHMWPE and Vectran): ISA does not certify these as single
        webbings below 30 kN (the Type B/C cells read "not certified as single
        webbings"); at 30 kN+ they take the strength-based class -> A (>=30),
        A+ (>=40). No Type B or C for HMPE.
      - Everything else (Other): never certified -> Not for Highline.

    Strength thresholds (inclusive): A+ >= 40, A >= 30, B >= 26, C >= 22 kN.
    """
    # HMPE fibers (Dyneema/UHMWPE, Vectran): not certified as single webbings
    # under 30 kN; at 30 kN+ take the strength class (A >=30, A+ >=40). No B/C.
    if material in (FiberMaterial.DYNEEMA, FiberMaterial.VECTRAN):
        if breaking_strength >= 40:
            return Classification.A_PLUS
        if breaking_strength >= 30:
            return Classification.A
        return Classification.NOT_FOR_HIGHLINE

    if material == FiberMaterial.NYLON:
        if breaking_strength >= 40:
            return Classification.A_PLUS
        if breaking_strength >= 30:
            return Classification.A
        if breaking_strength >= 26:
            return Classification.B
        if breaking_strength >= 22:
            return Classification.C
        return Classification.NOT_FOR_HIGHLINE

    if material == FiberMaterial.POLYESTER:
        if breaking_strength >= 40:
            return Classification.A_PLUS
        if breaking_strength >= 30:
            return Classification.A
        if breaking_strength >= 26:
            return Classification.B
        return Classification.NOT_FOR_HIGHLINE  # no Type C for polyester

    return Classification.NOT_FOR_HIGHLINE

class WebbingConstruction(str, Enum):
    FLAT = "Flat"
    TUBULAR = "Tubular"
    THREADED_TUB = "Threaded Tubular"
    CORE_SHEATH = "Core/Sheath"
    OTHER = "Other"

class BaseWebbing(SQLModel):
    """
    Base class for webbing. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, WebbingPublic, and WebbingCreate.
    """
    name: str | None = Field(default=None, index=True)
    # multi-select: one entry per fiber in the weave. Single-fiber webbing is a
    # 1-element list; a hybrid spells out its fibers, e.g. ["Polyester", "Dyneema/HMPE"].
    material: list[FiberMaterial] | None = Field(default=None, sa_column=Column(JSON))
    webbing_construction: WebbingConstruction | None = None # Flat / Tubular / Core-Sheath
    width: int | None = None              # mm
    thickness: float | None = None        # mm
    release_date: int | None = None       # Unix timestamp
    product_url: str | None = None
    weight: float | None = None           # g/m
    breaking_strength: float | None = None # kN
    stretch: str | None = None            # like [{"kn":0, "percent": 0.0}, ...]
    isa_certified: bool = False
    classification: Classification | None = None
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

class Webbing(BaseWebbing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    # material inherits the JSON column from BaseWebbing (multi-select list)
    width: int                            # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_webbings")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class WebbingPublic(BaseWebbing):
    """Model for public webbing data."""
    id: int
    name: str                             # required in response
    material: list[FiberMaterial]         # required in response
    width: int                            # required in response
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class WebbingCreate(BaseWebbing):
    """Model for creating a new webbing entry."""
    name: str                             # required on create
    material: list[FiberMaterial]         # required on create
    width: int                            # required on create
    brand_id: int                         # required on create

    class Config:
        exclude = ["id"]
        validate_assignment = True

class WebbingUpdate(BaseWebbing):
    """Model for updating a webbing entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"

