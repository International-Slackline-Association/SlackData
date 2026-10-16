"""
ISA certificates and warnings, edited by admins — live editing phase 7
(LIVE_EDITING_PHASE_7.md, D24, D54).

They stay the ISA's statements: only an admin changes them (P7-A), and every
change is flagged `safety` (P7-C), so it is in the safety feed beside the
breaking-strength edits. What an admin does here is what a developer used to do
in the seed files by hand:

| operation | what it writes |
|---|---|
| `edit_entry` | the entry's ISA fields (a capture error put right), and/or its match |
| `create_entry` | an entry the ISA's list does not have yet, key `slackdata-<n>` |
| `retire_entry` | the entry leaves the catalogue (it left the ISA's list), with a reason |

**A match is written from the products chosen** (P7-D): the admin names a gear
type and ids, and `gearType`, `gearIds` and `gearNames` are derived from the
catalogue as it is now — so the `"<brand> <name>"` check the build makes can
never fail on a typo. A rename or a merge re-points it later (D73).

**An entry is checked against the build before it is written**: the same row
builders the catalogue build runs (`load_isa_warnings`, `load_isa_certifications`)
must accept it, so an edit cannot break the rebuild every page depends on.

The derived values on products — `isa_warning`, `isa_certified`,
`isa_certificate`, `isa_class` — are still computed when the catalogue is built
(§ 9), never written here.
"""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.catalogue.edits import (
    ISA_COLLECTIONS,
    Invalid,
    NotFound,
    Outcome,
    Refused,
    _diff,
    _record,
    api_type,
    require_admin,
)
from slack_data.catalogue.repository import CounterAdvance, Put
from slack_data.changelog.writer import commit_catalogue_change
from slack_data.load_data.load_gear import GEAR, MERGED_KEY
from slack_data.models.changes import SAFETY_FLAG, Action, Channel
from slack_data.models.people import Person

CERTIFICATES = "isa_certified"
WARNINGS = "isa_gear_warnings"

# The URL names of the two kinds, and the collections they are.
KINDS = {"certificates": CERTIFICATES, "warnings": WARNINGS}
KEY_FIELD = {CERTIFICATES: "cert_id", WARNINGS: "id"}

# Set by the importer on an entry new to the ISA's list (P7-E): a match it
# could make by name, offered to the admin and never applied. Kept outside
# `match` because the warnings build stamps a match at any confidence.
SUGGESTED_KEY = "suggested_match"

CONFIDENCES = ("exact", "likely", "partial", "ambiguous", "none")
MATCH_MAX_IDS = 50
MAX_TEXT = 2000

# The editable ISA fields of each kind, as the seed files spell them, with the
# edit form's kind (`edits.field_specs` vocabulary).
FIELDS: dict[str, dict[str, dict]] = {
    CERTIFICATES: {
        "certificate": {"kind": "text", "required": True},
        "standard_number": {"kind": "integer"},
        "isa_class": {"kind": "choice", "options": ["A+", "A", "B", "C"]},
        "product_type": {"kind": "text"},
        "manufacturer": {"kind": "text", "required": True},
        "model": {"kind": "text", "required": True},
        "model_version": {"kind": "text"},
        "release_year": {"kind": "integer"},
        "standard_version": {"kind": "text"},
        "testing_lab": {"kind": "text"},
        "test_date": {"kind": "text"},
        "product_url": {"kind": "text"},
        "manual_url": {"kind": "text"},
        "pictures": {"kind": "list"},
        "manufacturer_email": {"kind": "text"},
        "source_notes": {"kind": "list"},
    },
    WARNINGS: {
        "status": {"kind": "choice", "options": ["Recall", "Warning", "Notice"], "required": True},
        "date": {"kind": "text"},
        "productType": {"kind": "text"},
        "manufacturer": {"kind": "text", "required": True},
        "model": {"kind": "text", "required": True},
        "inProduction": {"kind": "choice", "options": ["Yes", "No"]},
        "description": {"kind": "longtext"},
        "solution": {"kind": "longtext"},
        "productImage": {"kind": "text"},
        "link1": {"kind": "text"},
        "link2": {"kind": "text"},
    },
}

_CERTIFICATE = re.compile(r"ISA:\d+(:(A\+|A|B|C))?")


LABEL = {CERTIFICATES: "certificate", WARNINGS: "warning"}


def collection_of(kind: str) -> str:
    if kind not in KINDS:
        raise NotFound(f"no ISA list {kind!r} — certificates or warnings")
    return KINDS[kind]


def field_specs(collection: str) -> list[dict]:
    return [
        {
            "name": name,
            "kind": spec["kind"],
            "options": spec.get("options"),
            "required": spec.get("required", False),
            "admin_only": True,
        }
        for name, spec in FIELDS[collection].items()
    ]


def entries(documents: list[Document], collection: str) -> list[Document]:
    return [d for d in documents if d.collection == collection and d.key != ENVELOPE_KEY]


def entry(documents: list[Document], collection: str, key: str) -> Document:
    for document in entries(documents, collection):
        if document.key == key:
            return document
    raise NotFound(f"no ISA {LABEL[collection]} {key!r}")


# --- The match --------------------------------------------------------------------


class MatchTarget(BaseModel):
    """Products of one gear type: the collection (`webbings`) and their ids."""

    collection: str
    ids: list[int] = Field(max_length=MATCH_MAX_IDS)


class MatchIn(BaseModel):
    """A match as an admin sets it. No targets: the entry matches nothing (the
    note says why). Several targets: the first is the block's own, the rest go
    under `also` — a warning only (one entry landing on two tables)."""

    targets: list[MatchTarget] = Field(default_factory=list, max_length=5)
    confidence: Literal["exact", "likely", "partial", "ambiguous", "none"] = "exact"
    note: str | None = Field(default=None, max_length=MAX_TEXT)


def _targetable(collection: str) -> set[str]:
    """Gear types an entry of this kind can land on: the ones whose rows carry
    the flag it sets (certification, a warning)."""
    if collection == CERTIFICATES:
        from slack_data.load_data.load_isa_certifications import (
            CERTIFIABLE_MODELS as models,
        )
    else:
        from slack_data.load_data.load_isa_warnings import WARNABLE_MODELS as models
    return {c for c in GEAR if api_type(c) in models}


def build_match(documents: list[Document], collection: str, wanted: MatchIn) -> dict:
    """The stored `match` block for `wanted`, names taken from the catalogue."""
    note = (wanted.note or "").strip() or None
    if not wanted.targets:
        return {"gearType": None, "gearIds": [], "gearNames": [], "confidence": "none", "note": note or ""}
    if collection == CERTIFICATES and len(wanted.targets) > 1:
        raise Invalid("a certificate matches one gear type", [{"field": "match", "message": "one gear type"}])
    allowed = _targetable(collection)
    blocks = []
    for target in wanted.targets:
        if target.collection not in allowed:
            raise Invalid(
                f"a {LABEL[collection]} cannot land on {target.collection} — they carry no such flag",
                [{"field": "match", "message": f"one of {sorted(allowed)}"}],
            )
        if not target.ids:
            raise Invalid("name at least one product", [{"field": "match", "message": "no products"}])
        names = []
        for item_id in dict.fromkeys(target.ids):
            found = next(
                (
                    d for d in documents
                    if d.collection == target.collection and d.key == str(item_id) and not d.retired
                ),
                None,
            )
            if found is None or found.data.get(MERGED_KEY) is not None:
                raise Invalid(
                    f"{target.collection} {item_id} is not a listed product",
                    [{"field": "match", "message": f"{target.collection} {item_id}"}],
                )
            names.append(f"{found.data['brand']} {found.data['name']}")
        blocks.append({
            "gearType": api_type(target.collection),
            "gearIds": list(dict.fromkeys(target.ids)),
            "gearNames": names,
            "confidence": wanted.confidence,
            "note": note or "",
        })
    match = blocks[0]
    if len(blocks) > 1:
        match["also"] = blocks[1:]
    return match


# --- The ISA's fields -------------------------------------------------------------


def _values(collection: str, changes: dict[str, Any]) -> dict[str, Any]:
    specs = FIELDS[collection]
    unknown = sorted(set(changes) - set(specs))
    if unknown:
        raise Invalid(
            f"not a field of an ISA {LABEL[collection]}: {unknown}",
            [{"field": n, "message": "not editable"} for n in unknown],
        )
    errors, clean = [], {}
    for name, value in changes.items():
        spec = specs[name]
        if value is None or value == "" or value == []:
            clean[name] = None
            continue
        kind = spec["kind"]
        if kind == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                errors.append({"field": name, "message": "a whole number"})
                continue
        elif kind == "list":
            if not isinstance(value, list) or not all(isinstance(v, str) and len(v) <= MAX_TEXT for v in value):
                errors.append({"field": name, "message": "a list of text"})
                continue
            value = [v.strip() for v in value if v.strip()]
        else:
            if not isinstance(value, str) or len(value) > MAX_TEXT:
                errors.append({"field": name, "message": f"text, at most {MAX_TEXT} characters"})
                continue
            value = value.strip()
            if kind == "choice" and value not in spec["options"]:
                errors.append({"field": name, "message": f"one of {spec['options']}"})
                continue
        clean[name] = value
    if errors:
        raise Invalid("the entry does not validate", errors)
    return clean


def check_buildable(collection: str, data: dict) -> None:
    """`Invalid` unless the catalogue build would accept this entry — the same
    row builders, against a stand-in product."""
    missing = [n for n, s in FIELDS[collection].items() if s.get("required") and not data.get(n)]
    if missing:
        raise Invalid(f"required: {missing}", [{"field": n, "message": "required"} for n in missing])
    try:
        if collection == CERTIFICATES:
            from slack_data.load_data.load_isa_certifications import (
                build_certification_row,
            )
            from slack_data.models.isa_gear_certifications import ISAGearCertification

            if not _CERTIFICATE.fullmatch(str(data.get("certificate", ""))):
                raise Invalid(
                    "a certificate number looks like ISA:41:A+ or ISA:51",
                    [{"field": "certificate", "message": "ISA:<standard>[:<class>]"}],
                )
            ISAGearCertification.model_validate(build_certification_row(data, "webbing", 1))
        else:
            from slack_data.load_data.load_isa_warnings import (
                build_warning_rows,
                get_isa_warning,
                parse_date,
            )
            from slack_data.models.isa_gear_warnings import ISAGearWarning

            if get_isa_warning(data.get("status")) is None:
                raise Invalid("an unknown status", [{"field": "status", "message": "Recall, Warning or Notice"}])
            if data.get("date") and parse_date(data["date"]) is None:
                raise Invalid("a date as the ISA writes it, dd.mm.yy", [{"field": "date", "message": "dd.mm.yy"}])
            ISAGearWarning.model_validate(build_warning_rows(data, "webbing", 1))
    except ValidationError as error:
        raise Invalid(
            "the catalogue build would refuse this entry",
            [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in error.errors()],
        ) from error


def _apply(data: dict, values: dict[str, Any]) -> dict:
    updated = dict(data)
    for name, value in values.items():
        if value is None:
            updated.pop(name, None)
        else:
            updated[name] = value
    return updated


def _flags() -> list[str]:
    return [SAFETY_FLAG]


# --- Operations -------------------------------------------------------------------


def edit_entry(
    store,
    log,
    actor: Person,
    collection: str,
    key: str,
    rev: int,
    changes: dict[str, Any] | None = None,
    match: MatchIn | None = None,
    why: str | None = None,
    channel: Channel = Channel.WEB,
) -> Outcome:
    require_admin(actor, "change the ISA's certificates and warnings")
    if not changes and match is None:
        raise Invalid("nothing to change")
    documents = store.load()
    document = entry(documents, collection, key)
    data = _apply(document.data, _values(collection, changes or {}))
    if match is not None:
        data["match"] = build_match(documents, collection, match)
        data.pop(SUGGESTED_KEY, None)
    check_buildable(collection, data)
    diff = _diff(document.data, data)
    if not diff:
        return Outcome(collection, document.key, document.data, document.rev)
    record = _record(
        actor, ISA_COLLECTIONS[collection], key, Action.ISA_EDIT,
        channel=channel, changes=diff, why=why, flags=_flags(),
    )
    put = Put(document.model_copy(update={"data": data, "rev": document.rev + 1}), rev)
    commit_catalogue_change(store, log, [put], [], [record])
    return Outcome(collection, document.key, data, document.rev + 1, [record])


def manual_counter(collection: str) -> str:
    return f"{collection}.slackdata"


def create_entry(
    store,
    log,
    actor: Person,
    collection: str,
    fields: dict[str, Any],
    match: MatchIn | None = None,
    why: str | None = None,
    *,
    key: str | None = None,
    channel: Channel = Channel.WEB,
    extra: dict[str, Any] | None = None,
) -> Outcome:
    """A new entry. An admin's gets the next `slackdata-<n>` key — one the
    ISA's own ids can never take; the importer passes the ISA's own `key`."""
    require_admin(actor, "add ISA certificates and warnings")
    documents = store.load(include_retired=True)
    values = {k: v for k, v in _values(collection, fields).items() if v is not None}
    counters: list[CounterAdvance] = []
    if key is None:
        name = manual_counter(collection)
        current = store.counter(name)
        number = current if current is not None else 1
        key = f"slackdata-{number}"
        counters.append(CounterAdvance(name, current, number + 1))
    elif any(d.collection == collection and d.key == key for d in documents):
        raise Refused(f"there is already an ISA {LABEL[collection]} {key!r}")
    data = {KEY_FIELD[collection]: key, **values, **(extra or {})}
    data["match"] = build_match(documents, collection, match or MatchIn())
    check_buildable(collection, data)
    seq = max((d.seq for d in documents if d.collection == collection), default=-1) + 1
    document = Document(collection=collection, key=key, seq=seq, data=data, rev=1)
    record = _record(
        actor, ISA_COLLECTIONS[collection], key, Action.ISA_CREATE,
        channel=channel, changes=_diff({}, data), why=why, flags=_flags(),
    )
    commit_catalogue_change(store, log, [Put(document, None)], counters, [record])
    return Outcome(collection, key, data, 1, [record])


def retire_entry(
    store, log, actor: Person, collection: str, key: str, rev: int, why: str, channel: Channel = Channel.WEB
) -> Outcome:
    """The entry leaves the catalogue — it left the ISA's list, or was recorded
    by mistake. Kept in the store, retired, as every document is (D20); the
    reason is required, and public."""
    require_admin(actor, "retire ISA certificates and warnings")
    if not (why or "").strip():
        raise Invalid("say why it is retired", [{"field": "why", "message": "required"}])
    document = entry(store.load(), collection, key)
    record = _record(
        actor, ISA_COLLECTIONS[collection], key, Action.ISA_RETIRE,
        channel=channel, changes={"retired": _diff({"retired": False}, {"retired": True})["retired"]},
        why=why.strip(), flags=_flags(),
    )
    put = Put(document.model_copy(update={"retired": True, "rev": document.rev + 1}), rev)
    commit_catalogue_change(store, log, [put], [], [record])
    return Outcome(collection, key, document.data, document.rev + 1, [record])

