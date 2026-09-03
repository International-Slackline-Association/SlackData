from enum import Enum
from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial

class ConnectionType(str, Enum):
    DYNEEMA_SLING_LOOP = "Dyneema Sling Loop"
    SLING_LOOP = "Sling Loop"
    MOUNTING_HOLE = "Mounting Hole"
    OTHER = "Other"

class BaseGrip(SQLModel):
    """
    Base class for grip. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, GripPublic, and GripCreate.
    """
    name: str | None = Field(default=None, index=True)
    material: MetalMaterial | None = None
    width_min: int | None = None          # mm
    width_max: int | None = None          # mm
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    wll: float | None = None              # kN
    mbs: float | None = None              # kN
    common_slipping_threshold: float | None = None # kN
    connection_type: ConnectionType | None = None
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

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

class Grip(BaseGrip, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    material: MetalMaterial               # required — NOT NULL in DB
    width_min: int                        # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_grips")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class GripPublic(BaseGrip):
    """Model for public grip data."""
    id: int
    name: str
    material: MetalMaterial
    width_min: int
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class GripCreate(BaseGrip):
    """Model for creating a new grip entry."""
    name: str
    material: MetalMaterial
    width_min: int
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class GripUpdate(BaseGrip):
    """Model for updating a grip entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
