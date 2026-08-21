"""Populate `isa_warning` on gear rows from the ISA gear-warnings database.

Source: `isa_gear_warnings.json` at the repo root — a scrape of
https://data.slacklineinternational.org/safety/isa-gear-warnings/. Every entry
carries a hand-adjudicated `match` block written alongside the scrape:

    "match": {
        "gearType": "weblock",          # our table, or null when unmatched
        "gearIds": [13, 15],            # primary keys in that table
        "gearNames": ["EQB Bandit SH", "EQB Bandit SL"],
        "confidence": "exact",          # exact | likely | partial | ambiguous | none
        "note": "..."
    }

**Why ids, and why they are also verified.** The ISA names products the way the
manufacturer's website does ("Ginko mini", "Catlock SL", "AWL 5"), which often
is not the string in our catalogue ("Ginkgo Mini", "Catlock SR", "Alpine WebLock
5.0"). Fuzzy matching those at load time gets both false positives and misses,
so the adjudication was done once, by hand, and recorded as ids. Ids, though,
are assigned by seed order — insert an item into the middle of `webbings.json`
and every id after it shifts, silently re-pointing warnings at the wrong gear.
So each id is checked against the `"<brand> <name>"` string recorded next to it,
and a row that does not match is **skipped with a warning** rather than stamped.
That makes seed-order drift loud and non-destructive.

The pass writes two things:

  - `isa_warning` on the gear row — the severity word, which drives the card
    bubble and the sidebar filter. Worst wins when several warnings land on one
    row.
  - one `ISAGearWarning` row per (entry x matched gear id) — the full entry
    (description, solution, date, source links) for the detail page. One entry
    covering three products becomes three rows; a product with three warnings
    gets three rows pointing at it.

This pass runs last, after every gear loader (it needs the rows to exist) — see
`slack_data.seed`. Only five types have the field: webbing, weblock, roller,
leashring, grip. Entries pointing at anything else (dogbones, slings, brakes,
kits) are counted and reported, not applied.
"""

from datetime import datetime

from sqlmodel import Session, select

from slack_data.load_data._seed_io import read_seed_json, seed_path
from slack_data.models.grips import Grip
from slack_data.models.isa_gear_warnings import ISAGearWarning, ISAGearWarningCreate
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock
from slack_data.utilities.isa_warnings import ISAWarning

ISA_WARNING_FILE = seed_path("isa_gear_warnings.json")

# The gear types that carry an `isa_warning` column. Tree protectors, starter
# kits and trickline kits do not — see CLAUDE.md § Data model.
WARNABLE_MODELS = {
    "webbing": Webbing,
    "weblock": Weblock,
    "roller": Roller,
    "leashring": LeashRing,
    "grip": Grip,
}

# Worst wins when several warnings land on one row: a product with both a recall
# and a notice is recalled. "No Warning" is deliberately absent — it is a valid
# enum member meaning "nothing to show", and storing it would put an empty
# bubble on every card (DESIGN.md § ISA Warnings).
SEVERITY = {
    ISAWarning.RECALL: 3,
    ISAWarning.WARNING: 2,
    ISAWarning.NOTICE: 1,
}


def load_isa_warnings_json() -> list[dict]:
    """Read the warning entries from `isa_gear_warnings.json`."""
    return read_seed_json("isa_gear_warnings.json")["items"]


def get_isa_warning(status: str | None) -> ISAWarning | None:
    """Map an entry's `status` word onto the enum; anything unknown -> None.

    Unknown statuses are dropped rather than raised on: a new severity word
    appearing upstream should leave the catalogue unstamped, not break seeding.
    """
    if not status:
        return None
    try:
        warning = ISAWarning(str(status).strip())
    except ValueError:
        return None
    return warning if warning in SEVERITY else None


def parse_date(raw: str | None) -> str | None:
    """`dd.mm.yy` -> `YYYY-MM-DD`; anything else -> None.

    The source has at least one dirty value (`"01.07,19"`, entry 15), so the
    separators are normalised before parsing and a failure returns None rather
    than raising — a typo upstream should cost the sort order, not the seed.
    Two-digit years are all 2000s here: the ISA database starts in 2012.
    """
    if not raw:
        return None
    cleaned = str(raw).strip().replace(",", ".").replace("/", ".").replace("-", ".")
    try:
        return datetime.strptime(cleaned, "%d.%m.%y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_in_production(raw: str | None) -> bool | None:
    """The source's Yes/No string -> bool; anything else -> None (unknown)."""
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if value in {"yes", "true"}:
        return True
    if value in {"no", "false"}:
        return False
    return None


def resolve_warnings(warnings: list[dict], session: Session) -> tuple[dict, list[str]]:
    """Resolve entries to `{(gear_type, id): ISAWarning}`, keeping the worst.

    Returns the resolution plus the list of human-readable problems found, so
    the caller can print them in one block instead of interleaving them with
    SQLAlchemy's echo output.
    """
    resolved: dict[tuple[str, int], ISAWarning] = {}
    problems: list[str] = []

    for entry in warnings:
        match = entry.get("match") or {}
        gear_type = match.get("gearType")
        gear_ids = match.get("gearIds") or []
        gear_names = match.get("gearNames") or []
        entry_id = entry.get("id")

        if not gear_type or not gear_ids:
            continue  # unmatched entry — tracked in BACKLOG.md, nothing to stamp
        if gear_type not in WARNABLE_MODELS:
            problems.append(
                f"warning {entry_id}: '{gear_type}' has no isa_warning field — skipped"
            )
            continue

        warning = get_isa_warning(entry.get("status"))
        if warning is None:
            problems.append(f"warning {entry_id}: unknown status {entry.get('status')!r} — skipped")
            continue

        model = WARNABLE_MODELS[gear_type]
        for index, gear_id in enumerate(gear_ids):
            row = session.get(model, gear_id)
            if row is None:
                problems.append(f"warning {entry_id}: no {gear_type} row with id {gear_id}")
                continue

            # Guard against seed-order drift — see this module's docstring.
            expected = gear_names[index] if index < len(gear_names) else None
            actual = f"{row.brand.name} {row.name}"
            if expected and expected != actual:
                problems.append(
                    f"warning {entry_id}: {gear_type} {gear_id} is {actual!r}, "
                    f"expected {expected!r} — NOT stamped (ids have drifted)"
                )
                continue

            key = (gear_type, gear_id)
            if SEVERITY[warning] > SEVERITY.get(resolved.get(key), 0):
                resolved[key] = warning

    return resolved, problems


def build_warning_rows(entry: dict, gear_type: str, gear_id: int) -> ISAGearWarningCreate:
    """Map one source entry + one resolved gear id onto a detail row."""
    match = entry.get("match") or {}
    links = [entry[key] for key in ("link1", "link2") if entry.get(key)]
    return ISAGearWarningCreate(
        source_id=str(entry.get("id")),
        status=ISAWarning(str(entry["status"]).strip()),
        gear_type=gear_type,
        gear_id=gear_id,
        date=entry.get("date"),
        date_iso=parse_date(entry.get("date")),
        product_type=entry.get("productType"),
        manufacturer=entry.get("manufacturer"),
        model=entry.get("model"),
        in_production=parse_in_production(entry.get("inProduction")),
        description=entry.get("description"),
        solution=entry.get("solution"),
        product_image=entry.get("productImage"),
        links=links or None,
        confidence=match.get("confidence"),
        note=match.get("note"),
    )


def add_isa_warnings_to_db(warnings: list[dict], session: Session) -> None:
    """Stamp `isa_warning` on the gear rows and write the full warning entries."""
    resolved, problems = resolve_warnings(warnings, session)

    for (gear_type, gear_id), warning in resolved.items():
        row = session.get(WARNABLE_MODELS[gear_type], gear_id)
        row.isa_warning = warning
        session.add(row)

    # The detail rows. Built from the same resolution, so a pairing the verifier
    # rejected above is absent here too — the banner can never describe a
    # warning the card doesn't show, or vice versa.
    detail_rows = 0
    for entry in warnings:
        match = entry.get("match") or {}
        gear_type = match.get("gearType")
        if gear_type not in WARNABLE_MODELS:
            continue
        if get_isa_warning(entry.get("status")) is None:
            continue
        for gear_id in match.get("gearIds") or []:
            if (gear_type, gear_id) not in resolved:
                continue  # id failed verification — see resolve_warnings()
            session.add(
                ISAGearWarning.model_validate(build_warning_rows(entry, gear_type, gear_id))
            )
            detail_rows += 1

    session.commit()

    for problem in problems:
        print(f"ISA warning skipped — {problem}")
    print(f"Stamped {len(resolved)} gear rows with an ISA warning.")
    print(f"Wrote {detail_rows} ISA warning detail rows.")


def load_isa_warnings(session: Session) -> None:
    """Load the ISA gear warnings and apply them to already-seeded gear rows."""
    warnings = load_isa_warnings_json()
    add_isa_warnings_to_db(warnings, session)


def has_isa_warnings(session: Session) -> bool:
    """True once this pass has run — the seed gate.

    Gated on the detail table rather than on the `isa_warning` stamps, because
    the stamps are only half the work: a database seeded before the detail table
    existed has every stamp and no details, and gating on the stamps would leave
    it that way forever. Re-running is safe for the stamps (they are set to the
    same value) and the detail rows are only ever written when the table is
    empty.
    """
    return session.exec(select(ISAGearWarning)).first() is not None


if __name__ == "__main__":
    entries = load_isa_warnings_json()
    matched = [e for e in entries if (e.get("match") or {}).get("gearIds")]
    print(f"Loaded {len(entries)} ISA warnings from {ISA_WARNING_FILE}")
    print(f"{len(matched)} carry a gear match; {len(entries) - len(matched)} do not")
