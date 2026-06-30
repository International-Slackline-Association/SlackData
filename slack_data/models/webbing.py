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
    Base class for webbing. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, WebbingPublic, and WebbingCreate.
    """
    name: str | None = Field(default=None, index=True)
    material: FiberMaterial | None = None
    width: int | None = None              # mm
    release_date: int | None = None       # Unix timestamp
    product_url: str | None = None
    weight: float | None = None           # g/m
    breaking_strength: float | None = None # kN
    stretch: str | None = None            # like [{"kn":0, "percent": 0.0}, ...]
    isa_certified: bool = False
    classification: Classification | None = None
    isa_warning: ISAWarning | None = None
    colors: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None

class Webbing(BaseWebbing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    material: FiberMaterial               # required — NOT NULL in DB
    width: int                            # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_webbings")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"

class WebbingPublic(BaseWebbing):
    """Model for public webbing data."""
    name: str                             # required in response
    material: FiberMaterial               # required in response
    width: int                            # required in response
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"

class WebbingCreate(BaseWebbing):
    """Model for creating a new webbing entry."""
    name: str                             # required on create
    material: FiberMaterial               # required on create
    width: int                            # required on create
    brand_id: int                         # required on create

    class Config:
        exclude = ["id"]
        validate_assignment = True

class WebbingUpdate(BaseWebbing):
    """Model for updating a webbing entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"

