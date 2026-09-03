from enum import Enum
from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial


class FrontPin(str, Enum):
    PUSHPIN = "Push Pin"
    PULLPIN = "Pull Pin"
    CAPTIVEPIN = "Captive Pin"
    FIXEDBOLT = "Fixed Bolt"
    SCREWPIN = "Screw Pin"
    OTHER = "Other"

class WeblockStyle(str, Enum):
    """
    How the device holds the webbing.

    TENSIONABLE — the usual weblock: webbing is locked by a pin/plate mechanism
    that can be dressed and released under (or near) tension.
    LINELOCKER  — a fixed/static line locker: a ring, plate or chain the webbing
    is simply woven through; nothing to open, it locks by friction.
    """
    TENSIONABLE = "Tensionable Weblock"
    LINELOCKER = "Fixed Linelocker"


class AttachmentPoint(str, Enum):
    UNIVERSAL = "Universal"
    HOLE = "Hole"
    PIN = "Pin"
    BOLT = "Bolt"
    BENTPLATE = "Bent Plate"
    SLING = "Sling"
    OTHER = "Other"


class BaseWeblock(SQLModel):
    """
    Base class for weblock. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, WeblockPublic, and WeblockCreate.
    """
    name: str | None = Field(default=None, index=True)
    style: WeblockStyle | None = Field(default=None, index=True)
    # multi-select, same as BaseRoller: a weblock can be built from several
    # metals — a titanium frame with steel pins is one product, not two facts.
    material: list[MetalMaterial] | None = Field(default=None, sa_column=Column(JSON))
    width_min: int | None = None          # mm
    width_max: int | None = None          # mm
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    breaking_strength: float | None = None # kN
    front_pin: FrontPin | None = None
    attachment_point: AttachmentPoint | None = None
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

class Weblock(BaseWeblock, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    material: MetalMaterial               # required — NOT NULL in DB
    width_min: int                        # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_weblocks")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class WeblockPublic(BaseWeblock):
    """Model for public weblock data."""
    id: int
    name: str
    material: list[MetalMaterial]
    width_min: int
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class WeblockCreate(BaseWeblock):
    """Model for creating a new weblock entry."""
    name: str
    material: list[MetalMaterial]
    width_min: int
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class WeblockUpdate(BaseWeblock):
    """Model for updating a weblock entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
