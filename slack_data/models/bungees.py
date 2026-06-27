from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning

class BungeeStyle(str, Enum):
    STRAIGHT = "Straight"
    VSHAPE = "V-Shape"
    FOLDABLE = "Foldable"
    OTHER = "Other"

class BaseBungee(SQLModel):
    """
    Base class for bungee. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, BungeePublic, and BungeeCreate.
    """
    name: str | None = Field(default=None, index=True)
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g/m
    breaking_strength: float | None = None # kN
    bungee_style: BungeeStyle | None = None
    length: int | None = None             # cm
    max_extension: int | None = None      # cm
    reccomended_line_length: int | None = None # cm — note: typo preserved from original
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None

class Bungee(BaseBungee, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_bungees")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class BungeePublic(BaseBungee):
    """Model for public bungee data."""
    name: str
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class BungeeCreate(BaseBungee):
    """Model for creating a new bungee entry."""
    name: str
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class BungeeUpdate(BaseBungee):
    """Model for updating a bungee entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
