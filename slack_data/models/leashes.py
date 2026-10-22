from enum import Enum

from pydantic import computed_field, field_validator
from sqlalchemy import JSON
from sqlmodel import Column, Field, Relationship, SQLModel

from slack_data.utilities.currencies import Currency
from slack_data.utilities.isa_warnings import ISAWarning


class LeashConstruction(str, Enum):
    """How the leash is built. A threaded leash is a rope inside tubular
    webbing; a rope leash is a single rope with no sleeve (raed's PRO, the
    spliced leashes). See LEASHES_REVIEW.md § Q7."""
    THREADED = "Threaded"
    ROPE = "Rope"


class RingConnection(str, Enum):
    """How the leash meets its ring. A knot is tied by the user (or pre-tied
    by the maker); a sewn or spliced eye is permanent, which is why those
    leashes are sold shorter (250 cm is a knotted 335 cm)."""
    KNOT = "Knot"
    SEWN = "Sewn"
    SPLICED = "Spliced"


class CoreType(str, Enum):
    """The rope's type, as the maker states it; None = not stated. A static
    rope is the exception worth filtering for."""
    DYNAMIC = "Dynamic"
    STATIC = "Static"


class SleeveMaterial(str, Enum):
    NYLON = "Nylon"
    POLYESTER = "Polyester"
    POLYPROPYLENE = "Polypropylene"
    OTHER = "Other"


class BaseLeash(SQLModel):
    """
    Base class for highline leashes. All fields optional so adding a new field is one line.
    Required fields are re-declared in the table model, LeashPublic, and LeashCreate.

    One row per LENGTH a maker sells: the lengths of one leash share
    `product_group`, which the listing shows as one card (LEASHES_REVIEW.md § Q4).
    """
    name: str | None = Field(default=None, index=True)
    construction: LeashConstruction | None = Field(default=None, index=True)
    ring_end: RingConnection | None = None
    # The rope: inside the sleeve on a threaded leash, the whole leash on a rope
    # leash. Shown as "Rope", "Rope Type" and "Rope Diameter" on the site.
    core_type: CoreType | None = None
    core_rope: str | None = None            # the named rope, e.g. "Edelrid Hummingbird Pro Dry 9.2"
    core_diameter: float | None = None      # mm
    sleeve_material: SleeveMaterial | None = None  # null on a rope leash
    sleeve_width: float | None = None       # mm
    diameter: float | None = None           # mm, overall, as the maker states it
    length: float | None = None             # cm, this row's length; as sold for a sewn or spliced leash
    weight: float | None = None             # g, this length, leash only (ring included where it is sewn or spliced on)

    # The strength the MAKER states for the leash, kN — one value. Where they
    # state two (a spliced end and a knotted end), the lower, which is the end
    # that fails first; the other goes in `notes`. A figure for a component
    # alone (the sleeve's, the core rope's) is not the leash's and stays in
    # `notes`, as do the rope's EN 892 figures.
    breaking_strength: float | None = None

    # The leash rings it is SOLD with, as options: `[{"leashring_id": 26,
    # "count": 1}, {"leashring_id": 26, "count": 2}]` is "one or two
    # HighlineRings". A sewn or spliced set lists its one permanent ring. The
    # first link from one gear type to another: the loader refuses an id that
    # is not a leash ring (load_gear.check_ring_options). A ring we do not hold
    # is named in `notes` instead. None = sold without rings, or not researched.
    ring_options: list[dict] | None = Field(default=None, sa_column=Column(JSON))

    # Stripes, coloured edges, a two-colour or tactile sleeve: anything the
    # maker says is there to spot a twist. None = not stated.
    twist_marker: bool | None = None

    release_date: int | None = None
    product_url: str | None = None
    # Both set ONLY by load_isa_certifications.py, from the ISA's approved-gear
    # list (`isa_certified.json`, ISA:37) — never read from this type's seed.
    isa_certified: bool = False
    isa_certificate: str | None = None
    isa_warning: ISAWarning | None = None
    price: float | None = None              # this length, leash only (the cheapest colour)
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)

    # The brands that SELL this product without making it — see `leashrings.py`.
    gear_sellers: list[str] | None = Field(default=None, sa_column=Column(JSON))

    # Rows that are one leash: its lengths (§ Q4), or one product stated by
    # several makers — see `leashrings.py`. The value is unique to the leash
    # ("Spider Highline Leash"), because a group spans brands.
    product_group: str | None = Field(default=None, index=True)

    @field_validator("ring_options", mode="before")
    @classmethod
    def _ring_options_from_text(cls, value):
        """The manufacturer API carries a list of objects as JSON text, as it
        does a webbing's `stretch` (MANUFACTURER_API.md § 6)."""
        if isinstance(value, str):
            import json

            try:
                return json.loads(value) if value.strip() else None
            except json.JSONDecodeError as error:
                raise ValueError('ring_options as text is JSON: [{"leashring_id": 35, "count": 2}]') from error
        return value

    @field_validator("ring_options")
    @classmethod
    def _ring_options_shape(cls, value: list[dict] | None) -> list[dict] | None:
        if value is None:
            return None
        for option in value:
            if set(option) != {"leashring_id", "count"}:
                raise ValueError(f"a ring option is {{leashring_id, count}}, not {sorted(option)}")
            ring_id, count = option["leashring_id"], option["count"]
            if not isinstance(ring_id, int) or isinstance(ring_id, bool) or ring_id < 1:
                raise ValueError(f"leashring_id must be a positive integer, not {ring_id!r}")
            if not isinstance(count, int) or isinstance(count, bool) or count < 1:
                raise ValueError(f"count must be a positive integer, not {count!r}")
        return value


class Leash(BaseLeash, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)                               # required — NOT NULL in DB
    construction: LeashConstruction = Field(index=True)         # required — NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(back_populates="_leashes")

    @computed_field
    def brand_name(self) -> str:
        return self.brand.name if self.brand else "Unknown"


class LeashPublic(BaseLeash):
    """Model for public leash data."""
    id: int
    name: str
    construction: LeashConstruction
    brand_name: str

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class LeashCreate(BaseLeash):
    """Model for creating a new leash entry."""
    name: str
    construction: LeashConstruction
    brand_id: int

    class Config:
        exclude = ["id"]
        validate_assignment = True


class LeashUpdate(BaseLeash):
    """Model for updating a leash entry. All fields optional for PATCH semantics."""
    brand_id: int | None = None

    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"
