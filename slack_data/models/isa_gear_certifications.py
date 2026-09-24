from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel


class BaseISAGearCertification(SQLModel):
    """One ISA certificate, resolved onto one piece of gear.

    The ISA publishes the gear it has approved against its standards
    (https://data.slacklineinternational.org/safety/isa-approved-gear/); our
    capture of it is `isa_approved_data.csv`, normalised into
    `isa_certified.json` by `scripts/build_isa_certified.py`. That file is the
    **only** source of certification in the catalogue — the gear seeds no longer
    carry a flag of their own.

    **Why this is a table and not more columns on the gear models.** The gear
    row carries just enough to draw the card: `isa_certified`, the certificate
    number that picks the stamp, and on webbing the class letter. The rest of a
    certificate (standard version, testing lab, test date, the manual) is for
    the detail page, and the fan-out is one-to-many: a webbing routinely holds
    both a plain Webbing certificate and a Sewn Loop one. Same shape as
    `BaseISAGearWarning`, for the same reasons.

    **The link to gear is `(gear_type, gear_id)`, not a foreign key.** A
    certificate can land on a webbing, a weblock, a roller, a leash ring or a
    grip, and SQLModel has no polymorphic FK. Rows are written by
    `load_isa_certifications.py`, which *verifies* each id against the recorded
    gear name before inserting, so a bad pairing never reaches this table.
    """

    # `cert_id` in the source — the ISA's own numbering (`approved_gear_17`).
    # Unique in practice, but not declared so: one certificate may one day
    # cover two of our rows, the way one warning covers several.
    cert_id: str = Field(index=True)

    # Which gear this row is about. Indexed together because every read is
    # "the certificates for this item".
    gear_type: str = Field(index=True)
    gear_id: int = Field(index=True)

    # The certificate itself. `certificate` as printed (`ISA:41:A+`);
    # `standard_number` its standard (41) and `isa_class` its letter, when the
    # certificate carries one. On webbing the gear row's `isa_class` falls back
    # to a strength-derived letter; this one never does — it is what the ISA
    # printed.
    certificate: str
    standard_number: int | None = None
    isa_class: str | None = None
    product_type: str | None = None

    # The ISA's own naming, kept verbatim — it often differs from ours
    # ("Redtube Type A" vs our "redTube"), and it is what the reader will see on
    # the ISA's site and the manufacturer's.
    manufacturer: str | None = None
    model: str | None = None

    # Strings on purpose: the source has "B1/B2" and "1.5" as model versions,
    # and mixes "1.0" and "2024" as standard versions.
    model_version: str | None = None
    release_year: int | None = None
    standard_version: str | None = None
    testing_lab: str | None = None
    # "YYYY-MM" or "YYYY" — the source's precision, not padded to a day.
    test_date: str | None = None

    # Links only, never fetched by the API.
    product_url: str | None = None
    manual_url: str | None = None
    pictures: list[str] | None = Field(default=None, sa_column=Column(JSON))
    manufacturer_email: str | None = None

    # How the match onto our catalogue was adjudicated. Only `exact` rows are
    # ever written, so this is always "exact" today — carried through so that
    # stays visible if the rule is ever loosened.
    confidence: str | None = None
    note: str | None = None


class ISAGearCertification(BaseISAGearCertification, table=True):
    id: int | None = Field(default=None, primary_key=True)


class ISAGearCertificationPublic(BaseISAGearCertification):
    """Model for public ISA certification data."""

    id: int

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class ISAGearCertificationCreate(BaseISAGearCertification):
    """Model for creating a new ISA certification row."""

    class Config:
        exclude = ["id"]
        validate_assignment = True
