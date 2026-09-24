"""Set ISA certification on gear rows from the ISA's approved-gear list.

Source: `isa_certified.json` at the repo root, built from the raw capture
`isa_approved_data.csv` by `scripts/build_isa_certified.py`. It is the ISA's
list at https://data.slacklineinternational.org/safety/isa-approved-gear/, one
entry per certificate, each carrying a hand-adjudicated `match` block that the
build script preserves across re-scrapes:

    "match": {
        "gearType": "webbing",          # our table, or null when unmatched
        "gearIds": [63],                # primary keys in that table
        "gearNames": ["Slacktivity Marathon"],
        "confidence": "exact",          # only `exact` certifies
        "note": "..."
    }

**This is the only source of certification.** The gear seeds used to carry a
hand-set flag each (`isa_certified`, a weblock's `specifications["ISA
approved"]`, a roller's `isa_approved`), with no link to what the ISA actually
published. Those are gone: a row is certified if and only if an `exact` match
here lands on it, and anything not matched reads as not certified.

Ids are verified against the recorded `"<brand> <name>"` before use, exactly as
`load_isa_warnings.py` does — a certification stamped on the wrong product is a
safety claim we did not mean to make, so a mismatch is **skipped loudly**, not
applied.

Three rules beyond the match block:

  - **Only `exact` matches certify.** Anything else is reported and skipped.
  - **Intermittent Connection certificates never certify**, even if matched:
    they certify a way of joining webbing, not the webbing (plan decision,
    ISA_CERTIFICATION_PLAN.md). Webbing and Webbing – Sewn Loop certificates
    both certify the webbing row.
  - **Kits and tree protectors cannot be certified** — they have no column.

The pass writes, per certified row:

  - `isa_certified = True` and `isa_certificate` — the primary certificate
    number (on webbing, the plain Webbing certificate, else the Sewn Loop one);
  - on webbing, `isa_class` — the certificate's letter, or when no certificate
    carries one, the letter its breaking strength earns (`class_from_strength`);
  - one `ISAGearCertification` row per (certificate x matched gear id), holding
    the full certificate for the detail page.

Runs after every gear loader (it needs the rows to exist) — see
`slack_data.seed`.
"""

from sqlmodel import Session, select

from slack_data.load_data._seed_io import read_seed_json, seed_path
from slack_data.models.grips import Grip
from slack_data.models.isa_gear_certifications import (
    ISAGearCertification,
    ISAGearCertificationCreate,
)
from slack_data.models.leashrings import LeashRing
from slack_data.models.rollers import Roller
from slack_data.models.webbing import Webbing
from slack_data.models.weblocks import Weblock

ISA_CERTIFIED_FILE = seed_path("isa_certified.json")

# The gear types that can be certified. Tree protectors, starter kits and
# trickline kits cannot — see ISA_CERTIFICATION_PLAN.md § Decisions.
CERTIFIABLE_MODELS = {
    "webbing": Webbing,
    "weblock": Weblock,
    "roller": Roller,
    "leashring": LeashRing,
    "grip": Grip,
}

# The webbing product type whose certificate is preferred as a webbing row's
# `isa_certificate`. A Sewn Loop certificate stands in when it is the only one.
PLAIN_WEBBING = "Webbing"


def load_isa_certified_json() -> list[dict]:
    """Read the certificate entries from `isa_certified.json`."""
    return read_seed_json("isa_certified.json")["items"]


def class_from_strength(breaking_strength: float | None) -> str | None:
    """The ISA webbing class a breaking strength (kN) earns, or None below 22.

    Thresholds are inclusive: A+ >= 40, A >= 30, B >= 26, C >= 22. Used only for
    a CERTIFIED webbing whose certificates carry no letter (Cong Gear Path's
    Sewn Loop certificate is `ISA:41`) — never to grade an uncertified one, and
    with no material gating: the ISA has already certified the product, this
    only recovers which stamp it earns.
    """
    if breaking_strength is None:
        return None
    if breaking_strength >= 40:
        return "A+"
    if breaking_strength >= 30:
        return "A"
    if breaking_strength >= 26:
        return "B"
    if breaking_strength >= 22:
        return "C"
    return None


def counts_toward_certification(entry: dict) -> bool:
    """False for an Intermittent Connection certificate — see module docstring."""
    return "intermittent" not in (entry.get("product_type") or "").lower()


def resolve_certifications(
    entries: list[dict], session: Session
) -> tuple[dict[tuple[str, int], list[dict]], list[str]]:
    """Resolve entries to `{(gear_type, id): [entry, ...]}`, verified.

    Returns the resolution plus the human-readable problems found, so the
    caller can print them in one block instead of interleaving them with
    SQLAlchemy's echo output. Entries with no match at all are not problems —
    each carries a note saying why (leashes, superseded, no gear type).
    """
    resolved: dict[tuple[str, int], list[dict]] = {}
    problems: list[str] = []

    for entry in entries:
        match = entry.get("match") or {}
        gear_type = match.get("gearType")
        gear_ids = match.get("gearIds") or []
        gear_names = match.get("gearNames") or []
        cert_id = entry.get("cert_id")

        if not gear_type or not gear_ids:
            continue  # unmatched — the match note says why
        if match.get("confidence") != "exact":
            problems.append(
                f"{cert_id}: confidence {match.get('confidence')!r}, only 'exact' certifies"
            )
            continue
        if not counts_toward_certification(entry):
            problems.append(f"{cert_id}: {entry.get('product_type')!r} does not certify")
            continue
        if gear_type not in CERTIFIABLE_MODELS:
            problems.append(f"{cert_id}: '{gear_type}' cannot be ISA certified — skipped")
            continue

        model = CERTIFIABLE_MODELS[gear_type]
        for index, gear_id in enumerate(gear_ids):
            row = session.get(model, gear_id)
            if row is None:
                problems.append(f"{cert_id}: no {gear_type} row with id {gear_id}")
                continue

            # Guard against a mistyped or drifted id — see this module's docstring.
            expected = gear_names[index] if index < len(gear_names) else None
            actual = f"{row.brand.name} {row.name}"
            if expected != actual:
                problems.append(
                    f"{cert_id}: {gear_type} {gear_id} is {actual!r}, "
                    f"expected {expected!r} — NOT certified"
                )
                continue

            resolved.setdefault((gear_type, gear_id), []).append(entry)

    return resolved, problems


def primary_certificate(entries: list[dict]) -> dict:
    """The certificate that speaks for the row: plain Webbing first, else file order."""
    return sorted(entries, key=lambda e: e.get("product_type") != PLAIN_WEBBING)[0]


def webbing_class(row: Webbing, entries: list[dict]) -> tuple[str | None, bool]:
    """`(isa_class, derived)` for a certified webbing row.

    The first letter any of its certificates carries, primary first; failing
    that, `class_from_strength`, flagged as derived so the detail row can say so.
    """
    ordered = [primary_certificate(entries), *entries]
    for entry in ordered:
        if entry.get("isa_class"):
            return entry["isa_class"], False
    return class_from_strength(row.breaking_strength), True


def build_certification_row(
    entry: dict, gear_type: str, gear_id: int, note: str | None = None
) -> ISAGearCertificationCreate:
    """Map one source entry + one resolved gear id onto a detail row."""
    match = entry.get("match") or {}
    return ISAGearCertificationCreate(
        cert_id=entry["cert_id"],
        gear_type=gear_type,
        gear_id=gear_id,
        certificate=entry["certificate"],
        standard_number=entry.get("standard_number"),
        isa_class=entry.get("isa_class"),
        product_type=entry.get("product_type"),
        manufacturer=entry.get("manufacturer"),
        model=entry.get("model"),
        model_version=entry.get("model_version"),
        release_year=entry.get("release_year"),
        standard_version=entry.get("standard_version"),
        testing_lab=entry.get("testing_lab"),
        test_date=entry.get("test_date"),
        product_url=entry.get("product_url"),
        manual_url=entry.get("manual_url"),
        pictures=entry.get("pictures") or None,
        manufacturer_email=entry.get("manufacturer_email"),
        confidence=match.get("confidence"),
        note=note if note is not None else (match.get("note") or None),
    )


def add_isa_certifications_to_db(entries: list[dict], session: Session) -> None:
    """Certify the matched gear rows and write the full certificates."""
    resolved, problems = resolve_certifications(entries, session)

    detail_rows = 0
    for (gear_type, gear_id), certs in resolved.items():
        row = session.get(CERTIFIABLE_MODELS[gear_type], gear_id)
        row.isa_certified = True
        row.isa_certificate = primary_certificate(certs)["certificate"]

        derived_note = None
        if gear_type == "webbing":
            row.isa_class, derived = webbing_class(row, certs)
            if derived:
                derived_note = (
                    f"No class letter on the certificate; {row.isa_class or 'no class'} "
                    f"derived from breaking strength ({row.breaking_strength} kN)."
                )
        session.add(row)

        # The detail rows, built from the same resolution, so the card and the
        # detail page can never disagree about whether an item is certified.
        for entry in certs:
            note = (entry.get("match") or {}).get("note") or None
            if derived_note:
                note = f"{note} {derived_note}" if note else derived_note
            session.add(
                ISAGearCertification.model_validate(
                    build_certification_row(entry, gear_type, gear_id, note)
                )
            )
            detail_rows += 1

    session.commit()

    for problem in problems:
        print(f"ISA certification skipped — {problem}")
    unmatched = [
        e["cert_id"] for e in entries if not (e.get("match") or {}).get("gearIds")
    ]
    print(f"Certified {len(resolved)} gear rows from the ISA approved-gear list.")
    print(f"Wrote {detail_rows} ISA certification detail rows.")
    print(f"{len(unmatched)} certificates match no gear row: {', '.join(unmatched)}")


def load_isa_certifications(session: Session) -> None:
    """Load the ISA approved-gear list and apply it to already-seeded gear rows."""
    add_isa_certifications_to_db(load_isa_certified_json(), session)


def has_isa_certifications(session: Session) -> bool:
    """True once this pass has run — the seed gate (detail table non-empty)."""
    return session.exec(select(ISAGearCertification)).first() is not None


if __name__ == "__main__":
    items = load_isa_certified_json()
    matched = [e for e in items if (e.get("match") or {}).get("gearIds")]
    print(f"Loaded {len(items)} ISA certificates from {ISA_CERTIFIED_FILE}")
    print(f"{len(matched)} carry a gear match; {len(items) - len(matched)} do not")
