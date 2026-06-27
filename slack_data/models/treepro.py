from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning

class PriceUnit(str, Enum):
    SINGLE = "single"
    PAIR = "pair"

class BaseTreePro(SQLModel):
    """
    Base class for tree protector. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, TreeProPublic, and TreeProCreate.
    """
    name: str | None = Field(default=None, index=True)
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    width: float | None = None            # cm
    length: int | None = None             # cm
    thickness: int | None = None          # mm
    has_sling_attachment: bool = False
    price: float | None = None
    price_unit: PriceUnit | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None


class TreePro(BaseTreePro, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_treepros")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"


class TreeProPublic(BaseTreePro):
    """Model for public tree protector data."""
    name: str
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class TreeProCreate(BaseTreePro):
    """Model for creating a new tree protector entry."""
    name: str
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class TreeProUpdate(BaseTreePro):
    """Model for updating a tree protector entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
