from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency

class TensioningType(Enum):
    SINGLE_RATCHET = "Single Ratchet"
    DOUBLE_RATCHET = "Double Ratchet"
    PRIMITIVE = "Primitive"
    OTHER = "Other"

class BaseStarterKit(SQLModel):
    """
    Base class for starter kit version.
    """
    name: str = Field(index=True)
    release_date: int | None = None # Unix timestamp
    product_url: str | None = None # Manufacturer/vendor product page URL
    webbing_length: int # m
    webbing_width: int # mm
    weight: float | None = None # g
    tensioning_type: TensioningType
    includes_treepro: bool = False
    isa_certified: bool = False
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None


class StarterKit(BaseStarterKit, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_starterkits")

    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"


class StarterKitPublic(BaseStarterKit):
    """
    Model for public starter kit data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class StarterKitCreate(BaseStarterKit):
    """
    Model for creating a new starter kit entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class StarterKitUpdate(BaseStarterKit):
    """
    Model for updating an existing starter kit entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"