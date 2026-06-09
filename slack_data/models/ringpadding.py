from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency



class RingPaddingMaterial(str, Enum):
    TPU = "TPU"
    RUBBER = "Rubber"
    OTHER = "Other"

class BaseRingPadding(SQLModel):
    """
    Base class for Ring Padding version
    """
    name: str = Field(index=True)
    release_date: int | None = None # Unix timestamp
    product_url: str | None = None # Manufacturer/vendor product page URL
    ring_outer_diameter: float | None = None # mm
    ring_thickness: float | None = None # mm
    public_print_file: bool = False
    weight: float | None = None # g
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None
class RingPadding(BaseRingPadding, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_ringpaddings")

    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"
    
class RingPaddingPublic(BaseRingPadding):
    """
    Model for public ring padding data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class RingPaddingCreate(BaseRingPadding):
    """
    Model for creating a new ring padding entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class RingPaddingUpdate(BaseRingPadding):
    """
    Model for updating an existing ring padding entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"

