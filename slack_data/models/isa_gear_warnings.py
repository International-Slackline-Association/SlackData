from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel

from slack_data.utilities.isa_warnings import ISAWarning


class BaseISAGearWarning(SQLModel):
    """One ISA gear-warning entry, resolved onto one piece of gear.

    The ISA publishes a database of recalls and cautions on specific products
    (https://data.slacklineinternational.org/safety/isa-gear-warnings/); our
    scrape of it is `isa_gear_warnings.json` at the repo root.

    **Why this is a table and not five more columns on the gear models.** The
    bare `isa_warning` enum already on webbing/weblock/roller/leashring/grip
    holds the severity word and nothing else — enough for the card bubble and
    the sidebar filter, useless for telling someone what is actually wrong with
    their weblock. The rest of an entry (what failed, what to do about it, when,
    and where it was published) does not fit in an enum, and one warning
    routinely covers several rows (EQB's plain "Bandit" warning covers the SH and
    the SL) while one row can carry several warnings (Slack-Inov's Slackibloc 4
    has three). A table takes both fan-outs; extra columns on five models take
    neither.

    **The link to gear is `(gear_type, gear_id)`, not a foreign key.** There is
    no single table to point at — a warning can land on a webbing, a weblock, a
    roller, a leash ring or a grip — and SQLModel has no polymorphic FK. Rows are
    written by `load_isa_warnings.py`, which resolves and *verifies* the id
    against the recorded gear name before inserting, so a bad pairing never
    reaches this table (see that module's docstring).
    """

    # The `id` field in the source JSON — the ISA's own numbering. Not unique
    # here: one source entry that covers three products becomes three rows.
    source_id: str = Field(index=True)
    status: ISAWarning = Field(index=True)

    # Which gear this row is about. Indexed together because every read is
    # "the warnings for this item".
    gear_type: str = Field(index=True)
    gear_id: int = Field(index=True)

    # As published by the ISA. `date` is the raw source string (`dd.mm.yy`, and
    # one entry has a comma where a dot belongs); `date_iso` is it parsed to
    # YYYY-MM-DD, or None when it would not parse. Keeping both means a source
    # typo costs the sort order, not the date.
    date: str | None = None
    date_iso: str | None = None

    # The ISA's own naming, kept verbatim — it often differs from ours ("Ginko
    # mini" vs our "Ginkgo Mini"), and it is what the reader will see on the
    # ISA's site and the manufacturer's.
    product_type: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    in_production: bool | None = None

    description: str | None = None
    solution: str | None = None
    product_image: str | None = None
    links: list[str] | None = Field(default=None, sa_column=Column(JSON))

    # How the match onto our catalogue was adjudicated — `exact`, `likely`,
    # `partial` or `ambiguous`. Carried through so the UI can hedge on a match
    # we are not certain of, and so a review pass can find them.
    confidence: str | None = None
    note: str | None = None


class ISAGearWarning(BaseISAGearWarning, table=True):
    id: int | None = Field(default=None, primary_key=True)


class ISAGearWarningPublic(BaseISAGearWarning):
    """Model for public ISA warning data."""

    id: int

    class Config:
        orm_mode = True
        validate_assignment = True
        extra = "forbid"


class ISAGearWarningCreate(BaseISAGearWarning):
    """Model for creating a new ISA warning row."""

    class Config:
        exclude = ["id"]
        validate_assignment = True
