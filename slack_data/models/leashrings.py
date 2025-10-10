from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial

class BaseLeashRing(SQLModel):
    """
    Base class for Leash Ring version
    """
    name: str = Field(index=True)
    release_date: str | None = None
    material: MetalMaterial
    inner_diameter: float | None = None # mm
    outer_diameter: float | None = None # mm
    weight: float | None = None # g
    breaking_strength: float | None = None # kN
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class LeashRing(BaseLeashRing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_leashrings")


    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"
    
class LeashRingPublic(BaseLeashRing):
    """
    Model for public leash ring data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class LeashRingCreate(BaseLeashRing):
    """
    Model for creating a new leash ring entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class LeashRingUpdate(BaseLeashRing):
    """
    Model for updating an existing leash ring entry.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"