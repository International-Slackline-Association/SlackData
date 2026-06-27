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
    Base class for bungee version.
    """
    name: str = Field(index=True)
    release_date: int | None = None # Unix timestamp
    product_url: str | None = None # Manufacturer/vendor product page URL
    weight: float | None = None # g/m
    breaking_strength: float | None = None # kN
    bungee_style: BungeeStyle | None = None
    length: int | None = None # cm
    max_extension: int | None = None # cm
    reccomended_line_length: int | None = None # cm
    isa_warning: ISAWarning | None = None
    colors: str | None = None # Comma separated list of colors
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class Bungee(BaseBungee, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_bungees")
    
    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"

class BungeePublic(BaseBungee):
    """
    Model for public bungee data.
    """
    brand_name: str

class BungeeCreate(BaseBungee):
    """
    Model for creating a new bungee entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class BungeeUpdate(BaseBungee):
    """
    Model for updating an existing bungee entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"


    