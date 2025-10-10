from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial

class ConnectionType(str, Enum):
    DYNEEMA_SLING_LOOP = "Dyneema Sling Loop"
    MOUNTING_HOLE = "Mounting Hole"
    OTHER = "Other"

class BaseGrip(SQLModel):
    """
    Base class for Grip version.
    """
    name: str = Field(index=True)
    release_date: str | None = None
    material: MetalMaterial
    width_min: int # mm
    width_max: int | None = None # mm
    weight: float | None = None # g
    wll: float | None = None # kN
    mbs: float | None = None # kN
    common_slipping_threshold: float | None = None # kN
    connection_type: ConnectionType | None = None
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class Grip(BaseGrip, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_grips")
    
    
    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"

class GripPublic(BaseGrip):
    """
    Model for public grip data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class GripCreate(BaseGrip):
    """
    Model for creating a new grip entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class GripUpdate(BaseGrip):
    """
    Model for updating an existing grip entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"

