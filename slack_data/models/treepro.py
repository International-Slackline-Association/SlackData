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
    Base class for Tree Pro version
    """
    name: str = Field(index=True)
    release_date: int | None = None # Unix timestamp
    product_url: str | None = None # Manufacturer/vendor product page URL
    weight: float | None = None # g
    width: float | None = None # cm
    length: int | None = None # cm
    thickness: int | None = None # mm
    has_sling_attachment: bool = False
    price: float | None = None
    price_unit: PriceUnit | None
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None


class TreePro(BaseTreePro, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_treepros")

    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"


class TreeProPublic(BaseTreePro):
    """
    Model for public Tree Pro data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class TreeProCreate(BaseTreePro):
    """
    Model for creating a new Tree Pro entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class TreeProUpdate(BaseTreePro):
    """
    Model for updating an existing Tree Pro entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"