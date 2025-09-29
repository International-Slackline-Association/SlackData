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
    Base class for roller version.
    """
    name: str = Field(index=True)
    release_date: str | None = None
    material: MetalMaterial
    roller_material: RollerMaterial
    slider_type: SliderType
    lock_type: LockType
    bearing_material: BearingMaterial
    width: str | None = None # smallest in mm, largest in mm
    weight: float | None = None # g
    breaking_strength: float | None = None # kN
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    colors: str | None = None # Comma separated list of colors
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class Roller(BaseRoller, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_rollers")
    
    
    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"

class RollerPublic(BaseRoller):
    """
    Model for public roller data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class RollerCreate(BaseRoller):
    """
    Model for creating a new roller entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class RollerUpdate(BaseRoller):
    """
    Model for updating an existing roller entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"


    