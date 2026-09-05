from enum import Enum
from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency

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
    id: int
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
