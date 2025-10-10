from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial


class FrontPin(str, Enum):
    PUSHPIN = "Push Pin"
    PULLPIN = "Pull Pin"
    CAPTIVEPIN = "Captive Pin"
    FIXEDBOLT = "Fixed Bolt"

class AttachmentPoint(str, Enum):
    UNIVERSAL = "Universal" # Fits hard connectors, soft connectors, sewn loops
    HOLE = "Hole" # connected hole like AWL 3/4, Frog, Ramlock TODO: Find a better name for this
    PIN = "Pin"
    BOLT = "Bolt"
    BENTPLATE = "Bent Plate"
    SLING = "Sling"


class BaseWeblock(SQLModel):
    """
    Base class for Weblock version.
    """
    name: str = Field(index=True)
    release_date: str | None = None
    material: MetalMaterial
    width: int
    weight: float | None = None # g
    breaking_strength: float | None = None # kN
    front_pin: FrontPin | None = None
    attachment_point: AttachmentPoint | None = None
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    colors: str | None = None # Comma separated list of colors
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class Weblock(BaseWeblock, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="weblock")
    
    
    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"

class WeblockPublic(BaseWeblock):
    """
    Model for public weblock data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class WeblockCreate(BaseWeblock):
    """
    Model for creating a new weblock entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class WeblockUpdate(BaseWeblock):
    """
    Model for updating an existing weblock entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"


    