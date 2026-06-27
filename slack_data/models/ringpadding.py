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
    Base class for ring padding. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, RingPaddingPublic, and RingPaddingCreate.
    """
    name: str | None = Field(default=None, index=True)
    release_date: int | None = None
    product_url: str | None = None
    ring_outer_diameter: float | None = None # mm
    ring_thickness: float | None = None      # mm
    public_print_file: bool = False
    weight: float | None = None              # g
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None

class RingPadding(BaseRingPadding, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_ringpaddings")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class RingPaddingPublic(BaseRingPadding):
    """Model for public ring padding data."""
    name: str
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class RingPaddingCreate(BaseRingPadding):
    """Model for creating a new ring padding entry."""
    name: str
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class RingPaddingUpdate(BaseRingPadding):
    """Model for updating a ring padding entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
