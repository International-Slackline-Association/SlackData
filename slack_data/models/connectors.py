from enum import Enum

from pydantic import computed_field
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning


class ConnectorStyle(str, Enum):
    """The connector's form. Push-pin vs screw-pin is NOT a style — that is
    `closure` — so an aluminium push-pin shackle and a stainless screw-pin one
    are both `SHACKLE`."""
    SHACKLE = "Shackle"
    CARABINER = "Carabiner"
    QUICKLINK = "Quicklink"
    SOFT_SHACKLE = "Soft shackle"


class ConnectorClosure(str, Enum):
    """How it closes — one enum across every style, so it is one filter group.
    A captive pin is still a screw pin; `captive_pin` records it."""
    SCREW_PIN = "Screw pin"
    BOLT_NUT = "Bolt + nut"
    PUSH_PIN = "Push pin"
    SCREWGATE = "Screwgate"
    TWIST_LOCK = "Twist-lock"
    TRIPLE_LOCK = "Triple-lock"
    SLEEVE = "Quicklink sleeve"
    KNOT = "Knot"


class ConnectorMaterial(str, Enum):
    """Kept apart from `MetalMaterial`, which weblocks, rollers and leash rings
    share, because a soft shackle is Dyneema. The alloy grade (7075-T6, 17-4PH,
    316) goes in `alloy` as free text."""
    ALUMINUM = "Aluminum"
    STEEL = "Steel"
    STAINLESS_STEEL = "Stainless Steel"
    TITANIUM = "Titanium"
    DYNEEMA = "Dyneema"
    OTHER = "Other"


class BaseConnector(SQLModel):
    """
    Base class for connectors: shackles, carabiners, quicklinks, soft shackles.
    All fields optional so adding a new field is one line. Required fields are
    re-declared in the table model, ConnectorPublic, and ConnectorCreate.
    """
    name: str | None = Field(default=None, index=True)
    connector_style: ConnectorStyle | None = Field(default=None, index=True)
    closure: ConnectorClosure | None = None
    material: ConnectorMaterial | None = None
    alloy: str | None = None

    # Breaking strengths as the MAKER states them, kN. Never derived from a WLL
    # (a WLL-only connector keeps the WLL in `notes` and these null), and never
    # from a proof load. A strength stated in tonnes is converted (x 9.81), with
    # the original wording kept in `notes`.
    mbs_straight_pull: float | None = None   # kN, along the major axis
    mbs_crossload: float | None = None       # kN, minor axis / side pull
    mbs_gate_open: float | None = None       # kN, carabiners only

    # How much fits: a shackle's jaw width, a carabiner's or quicklink's gate
    # opening, a soft shackle's inner loop size as the maker states it. One
    # field across every style; `notes` says how it was measured when the
    # maker words it differently.
    opening: float | None = None             # mm
    pin_diameter: float | None = None        # mm
    # A pin that stays in the body once unscrewed. A flag, not a different
    # part: a group of shops' rows for one shackle can mix both (the vendor
    # table shows which). False where the shop does not say so.
    captive_pin: bool = False
    rope_diameter: float | None = None       # mm, soft shackles only
    weight: float | None = None              # g

    # The standards the MAKER claims ("EN362:2005", "ISA:52"), with the page
    # that claims them. A claim, not a certification: `isa_certified` below is
    # set only from the ISA's own list.
    standards: list[str] | None = Field(default=None, sa_column=Column(JSON))
    standards_source: str | None = None

    # Both set ONLY by load_isa_certifications.py, from the ISA's approved-gear
    # list (`isa_certified.json`) — never read from this type's seed.
    isa_certified: bool = False
    isa_certificate: str | None = None
    isa_warning: ISAWarning | None = None

    release_date: int | None = None
    product_url: str | None = None
    price: float | None = None
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

    # Whether the MAKER says this is not for highlining — see `leashrings.py`.
    manufacturer_not_for_highline: bool | None = None
    manufacturer_not_for_highline_source: str | None = None

    # Generic stock hardware that several shops sell — the same 8 mm stainless
    # D shackle from Slacktivity, SlackGear and BC — is one row PER SHOP, each
    # with that shop's own stated specs, price and link. Rows naming the same
    # part (shape + size + material) share this value, which is also the
    # group's display name ("D Shackle 8mm, Stainless"). The listing shows a
    # group as one card and the detail page shows its rows as a vendor table.
    # Set only where at least two shops sell the part; None = a product of its
    # own. Ours to assign, so it is not correctable (submissions/fields.py).
    product_group: str | None = Field(default=None, index=True)

    # The brands that SELL this product without making it — see `leashrings.py`.
    gear_sellers: list[str] | None = Field(default=None, sa_column=Column(JSON))


class Connector(BaseConnector, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)                       # required — NOT NULL in DB
    connector_style: ConnectorStyle = Field(index=True)  # required — NOT NULL in DB
    material: ConnectorMaterial                         # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_connectors")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"


class ConnectorPublic(BaseConnector):
    """Model for public connector data."""
    id: int
    name: str
    connector_style: ConnectorStyle
    material: ConnectorMaterial
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class ConnectorCreate(BaseConnector):
    """Model for creating a new connector entry."""
    name: str
    connector_style: ConnectorStyle
    material: ConnectorMaterial
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class ConnectorUpdate(BaseConnector):
    """Model for updating a connector entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
