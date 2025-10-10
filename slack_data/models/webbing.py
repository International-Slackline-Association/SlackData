from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning


class FiberMaterial(str, Enum):
    NYLON = "Nylon"
    POLYESTER = "Polyester"
    DYNEEMA = "Dyneema"
    VECTRAN = "Vectran"
    HYBRID = "Hybrid" # TODO: maybe include different combinations explicitly?
    OTHER = "Other"

class Classification(str, Enum):
    A_PLUS = "A+"
    A = "A"
    B = "B"
    C = "C"
    OTHER = "Other"

class BaseWebbing(SQLModel):
    """
    Base class for webbing version.
    """
    name: str = Field(index=True)
    release_date: int | None = None # Unix timestamp
    product_url: str | None = None # Manufacturer/vendor product page URL
    material: FiberMaterial
    width: int
    weight: float | None = None # g/m
    breaking_strength: float | None = None # kN
    stretch: str | None = None # like [{"kn":0, "percent": 0.0}, {"kn": 10, "percent": 14.97}]
    isa_certified: bool = False
    classification: Classification | None = None
    isa_warning: ISAWarning | None = None
    colors: str | None = None # Comma separated list of colors
    price: float | None = None 
    currency: Currency | None = None # ISO 4217 currency code
    description: str | None = None
    version: str | None = None # Version indicating which batch data is from TODO: how to keep track of this?
    notes: str | None = None

class Webbing(BaseWebbing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_webbings")
    
    
    @computed_field
    def brand_name(self) -> str:
        """
        Computed field to get the brand name.
        """
        return self.brand.name if self.brand else "Unknown"

class WebbingPublic(BaseWebbing):
    """
    Model for public webbing data.
    """
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class WebbingCreate(BaseWebbing):
    """
    Model for creating a new webbing entry.
    """
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True

class WebbingUpdate(BaseWebbing):
    """
    Model for updating an existing webbing entry.
    """
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"


    