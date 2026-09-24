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
    # All three set ONLY by load_isa_certifications.py, from the ISA's
    # approved-gear list (`isa_certified.json`) — never read from the seed. Not
    # matched there means not certified. `isa_certificate` is the plain Webbing
    # certificate when there is one, else the Sewn Loop one. `isa_class` is the
    # certificate's letter (`ISA:41:A+` -> "A+"), or, when the certificate has
    # none, the letter its breaking strength earns; None on uncertified rows.
    isa_certified: bool = False
    isa_certificate: str | None = None
    isa_class: str | None = None
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

    # Whether the MAKER says this is not for highlining — a researched fact,
    # sourced from their own product page, and never computed from a spec
    # (a low breaking strength is our inference, not their statement). True =
    # they say so explicitly, False = they market it for highlining, None = not
    # yet checked, or the page is gone or silent. The URL is the page that says
    # it, so the claim can be re-checked.
    manufacturer_not_for_highline: bool | None = None
    manufacturer_not_for_highline_source: str | None = None

    # The brands that SELL this product without making it — the co-listing half
    # of `brand_id`, which only ever says who makes it. Slack Inov and Spider
    # Slacklines each carry the other's full range on their own site, and a
    # shopper picking a brand wants what they can buy from it, not what came off
    # its own loom.
    #
    # Brand NAMES, stored on the product itself, because a listing is a fact
    # about this row and nothing else: no second gear row (an id is the
    # catalogue's stable identity, already recorded in ISA match blocks,
    # manufacturer credentials and submitted corrections), and no side table
    # keyed by `(gear_type, gear_id)` to keep in step with it. Each name must
    # have an entry in `manufacturers.json`; `load_seller_brands.py` checks that
    # on every seed and creates the `Brand` row for a shop that makes nothing we
    # hold. None = not researched, `[]` never written.
    gear_sellers: list[str] | None = Field(default=None, sa_column=Column(JSON))

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

