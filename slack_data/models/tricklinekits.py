from enum import Enum
from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency

class TensioningType(Enum):
    SINGLE_RATCHET = "Single Ratchet"
    DOUBLE_RATCHET = "Double Ratchet"
    OTHER = "Other"

class BaseTricklineKit(SQLModel):
    """
    Base class for trickline kit. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, TricklineKitPublic, and TricklineKitCreate.
    """
    name: str | None = Field(default=None, index=True)
    webbing_length: int | None = None     # m
    webbing_width: int | None = None      # mm
    tensioning_type: TensioningType | None = None
    release_date: int | None = None
    product_url: str | None = None
    weight: float | None = None           # g
    includes_treepro: bool = False
    isa_certified: bool = False
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None


class TricklineKit(BaseTricklineKit, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    webbing_length: int                   # required — NOT NULL in DB
    webbing_width: int                    # required — NOT NULL in DB
    tensioning_type: TensioningType       # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_tricklinekits")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"


class TricklineKitPublic(BaseTricklineKit):
    """Model for public trickline kit data."""
    name: str
    webbing_length: int
    webbing_width: int
    tensioning_type: TensioningType
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class TricklineKitCreate(BaseTricklineKit):
    """Model for creating a new trickline kit entry."""
    name: str
    webbing_length: int
    webbing_width: int
    tensioning_type: TensioningType
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class TricklineKitUpdate(BaseTricklineKit):
    """Model for updating a trickline kit entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
