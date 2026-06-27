from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning
from slack_data.utilities.materials import MetalMaterial

class BaseLeashRing(SQLModel):
    """
    Base class for leash ring. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, LeashRingPublic, and LeashRingCreate.
    """
    name: str | None = Field(default=None, index=True)
    material: MetalMaterial | None = None
    inner_diameter: float | None = None   # mm
    outer_diameter: float | None = None   # mm
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    breaking_strength: float | None = None # kN
    isa_certified: bool = False
    isa_warning: ISAWarning | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None

class LeashRing(BaseLeashRing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    material: MetalMaterial               # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_leashrings")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class LeashRingPublic(BaseLeashRing):
    """Model for public leash ring data."""
    name: str
    material: MetalMaterial
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class LeashRingCreate(BaseLeashRing):
    """Model for creating a new leash ring entry."""
    name: str
    material: MetalMaterial
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class LeashRingUpdate(BaseLeashRing):
    """Model for updating a leash ring entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
