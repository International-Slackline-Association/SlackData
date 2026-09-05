from enum import Enum
from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency

class TensioningType(Enum):
    SINGLE_RATCHET = "Single Ratchet"
    DOUBLE_RATCHET = "Double Ratchet"
    PRIMITIVE = "Primitive"
    OTHER = "Other"

class BaseStarterKit(SQLModel):
    """
    Base class for starter kit. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, StarterKitPublic, and StarterKitCreate.
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
    active: bool | None = Field(default=None, index=True)

    # The brands that SELL this product without making it — the co-listing half
    # of `brand_id`, which only ever says who makes it. Slack Inov and Spider
    # Slacklines each carry the other's full range on their own site, and a
    # shopper picking a brand wants what they can buy from it, not what came off
    # its own loom.
    #
    # Brand NAMES, stored on the product itself, because a listing is a fact
    # about this row and nothing else: no second gear row (an id is the
    # catalogue's stable identity, already recorded in ISA match blocks,
    # manufacturer credentials and submitted corrections), and no side table
    # keyed by `(gear_type, gear_id)` to keep in step with it. Each name must
    # have an entry in `manufacturers.json`; `load_seller_brands.py` checks that
    # on every seed and creates the `Brand` row for a shop that makes nothing we
    # hold. None = not researched, `[]` never written.
    gear_sellers: list[str] | None = Field(default=None, sa_column=Column(JSON))


class StarterKit(BaseStarterKit, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # required — NOT NULL in DB
    webbing_length: int                   # required — NOT NULL in DB
    webbing_width: int                    # required — NOT NULL in DB
    tensioning_type: TensioningType       # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_starterkits")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"


class StarterKitPublic(BaseStarterKit):
    """Model for public starter kit data."""
    id: int
    name: str
    webbing_length: int
    webbing_width: int
    tensioning_type: TensioningType
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class StarterKitCreate(BaseStarterKit):
    """Model for creating a new starter kit entry."""
    name: str
    webbing_length: int
    webbing_width: int
    tensioning_type: TensioningType
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class StarterKitUpdate(BaseStarterKit):
    """Model for updating a starter kit entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
