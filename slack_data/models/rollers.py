from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial, RollerMaterial

class SliderType(Enum):
    MovingPlates = "Moving plates"
    Carabiner = "Carabiner"
    LockingCarabiner = "Locking Carabiner"
    Other = "Other"

class LockType(Enum):
    Nonlocking = "Non-locking"
    ScrewLock = "Screw Lock"
    AutoLock = "Auto Lock"
    TwistLock = "Twist Lock"
    MagneticLock = "Magnetic Lock"
    Other = "Other"

class BearingMaterial(Enum):
    StainlessSteel = "Stainless Steel"
    Steel = "Steel"
    Other = "Other"


class BaseRoller(SQLModel):
    """
    Base class for roller. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, RollerPublic, and RollerCreate.
    """
    name: str | None = Field(default=None, index=True)
    material: MetalMaterial | None = None
    roller_material: RollerMaterial | None = None
    slider_type: SliderType | None = None
    lock_type: LockType | None = None
    bearing_material: BearingMaterial | None = None
    width: str | None = None              # "min–max mm"
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    breaking_strength: float | None = None # kN
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None

class Roller(BaseRoller, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    material: MetalMaterial               # required — NOT NULL in DB
    roller_material: RollerMaterial       # required — NOT NULL in DB
    slider_type: SliderType               # required — NOT NULL in DB
    lock_type: LockType                   # required — NOT NULL in DB
    bearing_material: BearingMaterial     # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_rollers")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class RollerPublic(BaseRoller):
    """Model for public roller data."""
    name: str
    material: MetalMaterial
    roller_material: RollerMaterial
    slider_type: SliderType
    lock_type: LockType
    bearing_material: BearingMaterial
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class RollerCreate(BaseRoller):
    """Model for creating a new roller entry."""
    name: str
    material: MetalMaterial
    roller_material: RollerMaterial
    slider_type: SliderType
    lock_type: LockType
    bearing_material: BearingMaterial
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class RollerUpdate(BaseRoller):
    """Model for updating a roller entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
