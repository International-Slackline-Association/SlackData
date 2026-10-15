"""
Live edits to the catalogue — phase 3 (LIVE_EDITING_PHASE_3.md § 5).

Every operation here reads the store, builds the new documents, and hands
them to `commit_catalogue_change` with the change log records, so the edit and
its record land together or not at all (D28), and an edit based on a stale
read is refused (D27). Nothing here touches the catalogue the site reads: the
next request sees the new version and rebuilds (D30).

| operation | what it writes |
|---|---|
| `edit_item` | the item; on a rename, every ISA match that names it (P3-B) |
| `create_item` | a new item, with the next id of its type (D26) |
| `merge_item` | `"merged_into": <id>` on the duplicate; its ISA matches move to the survivor (D20) |
| `revert` | the earlier values of one recorded edit, field by field (D58) |
| `edit_brand` / `create_brand` | a `manufacturers.json` entry — never its name (P3-G) |

Who may do what is decided here, by `rights.py` (phase 5): admins anything,
a manufacturer their own brands' gear and entries. The routes only make sure
someone is signed in, so the edit form, the media dialog, revert and the
machine API all answer to the one rule.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from slack_data.catalogue import rights
from slack_data.catalogue.documents import ENVELOPE_KEY, Document
from slack_data.catalogue.repository import CatalogueRepository, CounterAdvance, Put
from slack_data.changelog.repository import ChangeLogRepository
from slack_data.changelog.writer import commit_catalogue_change, next_id
from slack_data.load_data.load_gear import (
    DERIVED_FIELDS,
    GEAR,
    MEDIA_KEYS,
    MERGED_KEY,
    UNMODELLED_KEY,
    UnknownField,
    to_entry,
    to_row,
)
from slack_data.models.changes import (
    SAFETY_FLAG,
    Action,
    ChangeRecord,
    Channel,
    FieldChange,
    TargetType,
    item_target,
)
from slack_data.models.people import Person
from slack_data.submissions.fields import SAFETY_FIELDS
from slack_data.utilities.brand_aliases import canonical_brand
from slack_data.utilities.countries import get_country

# A duplicate merge must be explained in detail (D20): a sentence, not a word.
MIN_MERGE_WHY = 30

# The ISA's collections, and what a record about one of their entries targets.
ISA_COLLECTIONS = {
    "isa_gear_warnings": TargetType.ISA_WARNING,
    "isa_certified": TargetType.ISA_CERTIFICATE,
}

# What a brand's entry may have changed in phase 3 (P3-G): everything a reader
# sees except the name, which brand links, credentials (`verify_brand`) and
# every product's `brand` hang on, and the ids. Keys as manufacturers.json
# spells them.
BRAND_FIELDS: dict[str, type] = {
    "country": str,
    "year_established": int,
    "slackline_oriented": bool,
    "active": bool,
    "website": str,
    "facebook": str,
    "instagram": str,
    "tiktok": str,
    "email": str,
    "email_alt": str,
}
MAX_BRAND_TEXT = 500


# --- Errors the router maps to HTTP ---------------------------------------------


class EditError(Exception):
    status = 422

    def __init__(self, message: str, detail: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


class NotFound(EditError):
    status = 404


class Invalid(EditError):
    status = 422


class Refused(EditError):
    """Not allowed in the item's current state (merged …)."""

    status = 409


class Forbidden(EditError):
    """Not this person's to change (rights.py)."""

    status = 403


# --- Results ------------------------------------------------------------------


@dataclass
class Outcome:
    collection: str
    key: str
    entry: dict
    rev: int
    records: list[ChangeRecord] = field(default_factory=list)
    # On a revert: fields that moved on since, with their current value.
    refused: dict[str, Any] = field(default_factory=dict)

    @property
    def changed(self) -> bool:
        return bool(self.records)


# --- Helpers ------------------------------------------------------------------


def api_type(collection: str) -> str:
    """`webbings` -> `webbing`: the gear type as ISA match blocks name it."""
    return collection[:-1]


def _find(documents: Iterable[Document], collection: str, key: str) -> Document | None:
    return next((d for d in documents if d.collection == collection and d.key == key), None)


def _brand_names(documents: Iterable[Document]) -> set[str]:
    return {
        canonical_brand(str(d.data.get("name")))
        for d in documents
        if d.collection == "manufacturers" and d.key != ENVELOPE_KEY
    }


def _record(
    actor: Person,
    target_type: TargetType,
    target_id: str,
    action: Action,
    brand: tuple[int, str] | None = None,
    **fields,
) -> ChangeRecord:
    """A log record; `brand` is the brand whose gear (or entry) changed, which
    labels a manufacturer's change "manufacturer for <brand>" (P5-E)."""
    return ChangeRecord(
        target_type=target_type,
        target_id=target_id,
        action=action,
        actor_sub=actor.sub,
        actor_isa_id=actor.isa_id,
        actor_role=actor.role_label(brand),
        **fields,
    )


def check_gear(actor: Person, documents: list[Document], brand_name: str | None, fields: Iterable[str] = ()) -> tuple[int, str] | None:
    """`Forbidden` unless `actor` may change gear of this brand, and these
    fields of it. The brand, as (catalog_id, name)."""
    brand = rights.brand_of(documents, brand_name)
    if not rights.may_edit(actor, brand):
        raise Forbidden(
            "you can change your own brands' products only"
            if actor.brands
            else "editing is open to admins and to a brand's manufacturers"
        )
    closed = sorted(set(fields) & rights.ADMIN_ONLY_FIELDS)
    if closed and not rights.is_admin(actor):
        raise Forbidden(
            f"only an admin changes {closed}: who makes a product, and who else sells it",
            [{"field": n, "message": "admin only"} for n in closed],
        )
    return brand


def check_brand(actor: Person, documents: list[Document], catalog_id: int) -> tuple[int, str] | None:
    """`Forbidden` unless `actor` may change this brand's own entry."""
    found = rights.brand_names(documents, [catalog_id])
    brand = (catalog_id, found[0]["name"]) if found else None
    if not rights.may_edit(actor, brand):
        raise Forbidden("you can change your own brands only")
    return brand


def require_admin(actor: Person, what: str) -> None:
    if not rights.is_admin(actor):
        raise Forbidden(f"only an admin can {what}")


def _diff(before: dict, after: dict) -> dict[str, FieldChange]:
    keys = [k for k in dict.fromkeys([*before, *after]) if k != "id"]
    return {k: FieldChange(before=before.get(k), after=after.get(k)) for k in keys if before.get(k) != after.get(k)}


def _flags(collection: str, changes: dict[str, FieldChange]) -> list[str]:
    return [SAFETY_FLAG] if set(changes) & SAFETY_FIELDS.get(collection, frozenset()) else []


def _errors(error: ValidationError) -> list[dict]:
    return [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in error.errors()]


def canonical(collection: str, entry: dict, brands: set[str]) -> dict:
    """The entry validated and normalised exactly as the loader will read it,
    or `Invalid`. Keeps the keys that are not model fields."""
    brand = canonical_brand(str(entry.get("brand") or ""))
    if brand not in brands:
        raise Invalid(
            f"no brand {entry.get('brand')!r} — a brand must exist before its products",
            [{"field": "brand", "message": "unknown brand"}],
        )
    try:
        row = to_row(collection, {**entry, "brand": brand}, brand_id=0)
        # The create schema is stricter than the table (a required list the
        # table leaves nullable), so a missing value can surface here too.
        result = to_entry(collection, row, brand, entry.get(UNMODELLED_KEY))
    except UnknownField as error:
        raise Invalid(str(error)) from error
    except ValidationError as error:
        raise Invalid("the item does not validate", _errors(error)) from error
    if MERGED_KEY in entry:
        result[MERGED_KEY] = entry[MERGED_KEY]
    for key in MEDIA_KEYS:
        if entry.get(key):
            result[key] = entry[key]
    return result


def _check_fields(collection: str, names: Iterable[str], media: bool = False) -> None:
    """`media`: photos and manuals may be set too — by the media route, which
    has checked every file, and by a revert, which restores a list it had."""
    closed = {"id", UNMODELLED_KEY, MERGED_KEY} | DERIVED_FIELDS | (set() if media else set(MEDIA_KEYS))
    forbidden = sorted(n for n in names if n in closed)
    if forbidden:
        raise Invalid(
            f"not editable here: {forbidden} — the ISA's statements are derived, "
            "and merging and media have their own actions",
            [{"field": n, "message": "not editable"} for n in forbidden],
        )


def _item(documents: list[Document], collection: str, item_id: int) -> Document:
    if collection not in GEAR:
        raise NotFound(f"no gear type {collection!r}")
    document = _find(documents, collection, str(item_id))
    if document is None or document.retired:
        raise NotFound(f"no {api_type(collection)} {item_id}")
    return document


def _repoint(
    documents: list[Document],
    collection: str,
    item_id: int,
    new_name: str,
    new_id: int | None = None,
) -> list[tuple[Document, dict, dict]]:
    """Every ISA match naming `collection` item `item_id`, rewritten: its
    `gearNames` entry to `new_name` (a rename), or — with `new_id` (a merge) —
    the id too, dropping the entry where the survivor is already matched.

    Returns (document, match before, match after) for each one changed.
    """
    changed = []
    for document in documents:
        if document.collection not in ISA_COLLECTIONS or document.key == ENVELOPE_KEY:
            continue
        before = document.data.get("match")
        if not before:
            continue
        after = _deep(before)
        hit = False
        for target in [after, *(after.get("also") or [])]:
            if target.get("gearType") != api_type(collection):
                continue
            ids = target.get("gearIds") or []
            names = target.get("gearNames") or []
            if item_id not in ids:
                continue
            hit = True
            index = ids.index(item_id)
            if new_id is not None and new_id in ids:
                ids.pop(index)
                if index < len(names):
                    names.pop(index)
                continue
            if new_id is not None:
                ids[index] = new_id
            if index < len(names):
                names[index] = new_name
        if hit and after != before:
            changed.append((document, before, after))
    return changed


def _deep(value):
    import copy

    return copy.deepcopy(value)


def _repoint_writes(
    actor: Person,
    changed: list[tuple[Document, dict, dict]],
    why: str | None,
    channel: Channel,
    brand: tuple[int, str] | None = None,
) -> tuple[list[Put], list[ChangeRecord]]:
    puts, records = [], []
    for document, before, after in changed:
        data = {**document.data, "match": after}
        puts.append(Put(document.model_copy(update={"data": data, "rev": document.rev + 1}), document.rev))
        records.append(
            _record(
                actor,
                ISA_COLLECTIONS[document.collection],
                document.key,
                Action.MATCH_REPOINT,
                brand,
                channel=channel,
                changes={"match": FieldChange(before=before, after=after)},
                why=why,
            )
        )
    return puts, records


# --- Items ----------------------------------------------------------------------


@dataclass
class Planned:
    """An edit worked out against a read of the store, not yet written: what
    `commit_catalogue_change` takes, and what to answer once it has. Planning
    and committing apart is what lets the machine API write a batch of items
    in one transaction (P5-G)."""

    puts: list[Put]
    counters: list[CounterAdvance]
    records: list[ChangeRecord]
    outcome: Outcome


def plan_edit_item(
    documents: list[Document],
    actor: Person,
    collection: str,
    item_id: int,
    rev: int,
    changes: dict[str, Any],
    why: str | None = None,
    *,
    action: Action = Action.ITEM_EDIT,
    channel: Channel = Channel.WEB,
    reverts: str | None = None,
    media: bool = False,
) -> Planned:
    """`edit_item`, against `documents`, without writing."""
    if not changes:
        raise Invalid("nothing to change")
    _check_fields(collection, changes, media)
    document = _item(documents, collection, item_id)
    brand = check_gear(actor, documents, document.data.get("brand"), changes)
    if document.data.get(MERGED_KEY) is not None:
        raise Refused(f"{api_type(collection)} {item_id} was merged into {document.data[MERGED_KEY]}")

    wanted = dict(document.data)
    for name, value in changes.items():
        if value is None or value == []:
            wanted.pop(name, None)
        else:
            wanted[name] = value
    entry = canonical(collection, wanted, _brand_names(documents))
    diff = _diff(document.data, entry)
    if not diff:
        return Planned([], [], [], Outcome(collection, document.key, document.data, document.rev))

    puts = [Put(document.model_copy(update={"data": entry, "rev": document.rev + 1}), rev)]
    records = [
        _record(
            actor,
            TargetType.ITEM,
            item_target(collection, item_id),
            action,
            brand,
            channel=channel,
            changes=diff,
            why=why,
            flags=_flags(collection, diff),
            reverts=reverts,
        )
    ]
    if "name" in diff or "brand" in diff:
        extra_puts, extra_records = _repoint_writes(
            actor,
            _repoint(documents, collection, item_id, f"{entry['brand']} {entry['name']}"),
            why,
            channel,
            brand,
        )
        puts += extra_puts
        records += extra_records
    return Planned(puts, [], records, Outcome(collection, document.key, entry, document.rev + 1, records))


def edit_item(
    store: CatalogueRepository,
    log: ChangeLogRepository,
    actor: Person,
    collection: str,
    item_id: int,
    rev: int,
    changes: dict[str, Any],
    why: str | None = None,
    **options,
) -> Outcome:
    """Set fields on an item. A value of None (or `[]`) clears the field.
    `media=True`: photos and manuals may be among them (`_check_fields`)."""
    planned = plan_edit_item(store.load(), actor, collection, item_id, rev, changes, why, **options)
    if planned.records:
        commit_catalogue_change(store, log, planned.puts, [], planned.records)
    return planned.outcome


def plan_create_item(
    documents: list[Document],
    actor: Person,
    collection: str,
    fields: dict[str, Any],
    new_id: int,
    why: str | None = None,
    *,
    channel: Channel = Channel.WEB,
    seq_offset: int = 0,
) -> Planned:
    """`create_item` with its id already claimed, without writing. The caller
    advances the counter (once, for every id it handed out)."""
    if collection not in GEAR:
        raise NotFound(f"no gear type {collection!r}")
    _check_fields(collection, fields)
    # A manufacturer adds products of their own brands (P5-D): `brand` is
    # theirs to name here, as long as it is one of theirs.
    brand = check_gear(actor, documents, fields.get("brand"), set(fields) - {"brand"})
    wanted = {"id": new_id, **{k: v for k, v in fields.items() if v is not None and v != []}}
    entry = canonical(collection, wanted, _brand_names(documents))
    seq = max((d.seq for d in documents if d.collection == collection), default=-1) + 1 + seq_offset
    document = Document(collection=collection, key=str(new_id), seq=seq, data=entry, rev=1)
    diff = _diff({}, entry)
    record = _record(
        actor,
        TargetType.ITEM,
        item_target(collection, new_id),
        Action.ITEM_CREATE,
        brand,
        channel=channel,
        changes=diff,
        why=why,
        flags=_flags(collection, diff),
    )
    return Planned([Put(document, None)], [], [record], Outcome(collection, document.key, entry, 1, [record]))


def create_item(
    store: CatalogueRepository,
    log: ChangeLogRepository,
    actor: Person,
    collection: str,
    fields: dict[str, Any],
    why: str | None = None,
) -> Outcome:
    if collection not in GEAR:
        raise NotFound(f"no gear type {collection!r}")
    documents = store.load(include_retired=True)
    new_id, advance = next_id(store, collection)
    planned = plan_create_item(documents, actor, collection, fields, new_id, why)
    commit_catalogue_change(store, log, planned.puts, [advance], planned.records)
    return planned.outcome


def merge_item(
    store, log, actor: Person, collection: str, item_id: int, rev: int, into: int, why: str
) -> Outcome:
    """`item_id` is a duplicate of `into` (D20). The duplicate stays in the
    store as a pointer; links to it land on the survivor; ISA matches that
    named it name the survivor instead. The explanation is mandatory. Admins
    only (§ 7.7)."""
    require_admin(actor, "merge duplicates")
    if len((why or "").strip()) < MIN_MERGE_WHY:
        raise Invalid(
            f"explain the merge in at least {MIN_MERGE_WHY} characters",
            [{"field": "why", "message": "too short"}],
        )
    if into == item_id:
        raise Invalid("an item cannot be merged into itself")
    documents = store.load()
    source = _item(documents, collection, item_id)
    survivor = _item(documents, collection, into)
    if source.data.get(MERGED_KEY) is not None:
        raise Refused(f"{api_type(collection)} {item_id} is already merged")
    if survivor.data.get(MERGED_KEY) is not None:
        raise Refused(f"{api_type(collection)} {into} is not listed — merge into a listed item")

    data = {**source.data, MERGED_KEY: into}
    puts = [Put(source.model_copy(update={"data": data, "rev": source.rev + 1}), rev)]
    records = [
        _record(
            actor, TargetType.ITEM, item_target(collection, item_id), Action.ITEM_MERGE,
            channel=Channel.MERGE, changes={MERGED_KEY: FieldChange(before=None, after=into)}, why=why,
        ),
        _record(
            actor, TargetType.ITEM, item_target(collection, into), Action.ITEM_MERGE,
            channel=Channel.MERGE, changes={"merged_from": FieldChange(before=None, after=item_id)}, why=why,
        ),
    ]
    name = f"{survivor.data['brand']} {survivor.data['name']}"
    extra_puts, extra_records = _repoint_writes(
        actor, _repoint(documents, collection, item_id, name, new_id=into), why, Channel.MERGE
    )
    commit_catalogue_change(store, log, puts + extra_puts, [], records + extra_records)
    return Outcome(collection, source.key, data, source.rev + 1, records + extra_records)


def revert(store, log, actor: Person, record_id: str, why: str | None = None) -> Outcome:
    """Restore the values one recorded edit replaced (D58). A field that has
    changed again since is left alone and reported (D27); if every field has,
    nothing is written."""
    record = log.get(record_id)
    if record is None:
        raise NotFound(f"no change {record_id}")
    if record.target_type is not TargetType.ITEM or record.action not in (Action.ITEM_EDIT, Action.ITEM_REVERT):
        raise Refused(
            "only an edit can be reverted — a create is undone by merging the item into the one it "
            "duplicates, a merge by a developer"
        )
    collection, _, raw_id = record.target_id.partition("#")
    item_id = int(raw_id)
    document = _item(store.load(), collection, item_id)
    restore, refused = {}, {}
    for name, change in record.changes.items():
        current = document.data.get(name)
        if current == change.after:
            restore[name] = change.before
        else:
            refused[name] = current
    if not restore:
        raise Refused("every field has changed again since — nothing to revert", refused)
    outcome = edit_item(
        store, log, actor, collection, item_id, document.rev, restore, why,
        action=Action.ITEM_REVERT, channel=Channel.REVERT, reverts=record.id, media=True,
    )
    outcome.refused = refused
    return outcome


# --- Brands ---------------------------------------------------------------------


def _brand_document(documents: list[Document], catalog_id: int) -> Document:
    for document in documents:
        if (
            document.collection == "manufacturers"
            and document.key != ENVELOPE_KEY
            and document.data.get("catalog_id") == catalog_id
        ):
            return document
    raise NotFound(f"no brand {catalog_id}")


def _brand_values(changes: dict[str, Any]) -> dict[str, Any]:
    unknown = sorted(set(changes) - set(BRAND_FIELDS))
    if unknown:
        raise Invalid(
            f"not editable on a brand: {unknown} (a brand's name and ids are not)",
            [{"field": n, "message": "not editable"} for n in unknown],
        )
    errors = []
    for name, value in changes.items():
        if value is None:
            continue
        kind = BRAND_FIELDS[name]
        if kind is int and (isinstance(value, bool) or not isinstance(value, int)):
            errors.append({"field": name, "message": "a whole number"})
        elif kind is bool and not isinstance(value, bool):
            errors.append({"field": name, "message": "true or false"})
        elif kind is str and (not isinstance(value, str) or len(value) > MAX_BRAND_TEXT):
            errors.append({"field": name, "message": f"text, at most {MAX_BRAND_TEXT} characters"})
        elif name == "country" and get_country(value) is None:
            errors.append({"field": name, "message": "an ISO country code, e.g. DE"})
        elif name == "year_established" and not 1900 <= value <= 2100:
            errors.append({"field": name, "message": "a year"})
    if errors:
        raise Invalid("the brand does not validate", errors)
    return changes


def edit_brand(store, log, actor: Person, catalog_id: int, rev: int, changes: dict[str, Any], why: str | None = None) -> Outcome:
    if not changes:
        raise Invalid("nothing to change")
    _brand_values(changes)
    documents = store.load()
    document = _brand_document(documents, catalog_id)
    brand = check_brand(actor, documents, catalog_id)
    data = dict(document.data)
    for name, value in changes.items():
        if value is None or value == "":
            data.pop(name, None)
        else:
            data[name] = value.upper() if name == "country" else value
    diff = _diff(document.data, data)
    if not diff:
        return Outcome("manufacturers", document.key, document.data, document.rev)
    record = _record(
        actor, TargetType.BRAND, str(catalog_id), Action.BRAND_EDIT, brand, channel=Channel.WEB, changes=diff, why=why
    )
    put = Put(document.model_copy(update={"data": data, "rev": document.rev + 1}), rev)
    commit_catalogue_change(store, log, [put], [], [record])
    return Outcome("manufacturers", document.key, data, document.rev + 1, [record])


CATALOG_ID_COUNTER = "manufacturers.catalog_id"


def create_brand(store, log, actor: Person, name: str, fields: dict[str, Any], why: str | None = None) -> Outcome:
    """A new manufacturer entry. It gets the next `catalog_id` (its permanent
    `Brand.id`) and the next entry key, both claimed by counters. Admins only
    in phase 5; everyone in phase 6 (D59)."""
    require_admin(actor, "add a brand")
    name = " ".join((name or "").split())
    if not name or len(name) > 200:
        raise Invalid("a brand needs a name", [{"field": "name", "message": "required"}])
    _brand_values(fields)
    documents = store.load(include_retired=True)
    if canonical_brand(name) in _brand_names(documents):
        raise Refused(f"there is already a brand {name!r}")
    key_id, key_advance = next_id(store, "manufacturers")
    current = store.counter(CATALOG_ID_COUNTER)
    if current is None:
        current_max = max(
            (int(d.data.get("catalog_id") or 0) for d in documents if d.collection == "manufacturers"),
            default=0,
        )
        catalog_id = current_max + 1
    else:
        catalog_id = current
    id_advance = CounterAdvance(CATALOG_ID_COUNTER, current, catalog_id + 1)
    data = {"catalog_id": catalog_id, "name": name}
    data.update({k: (v.upper() if k == "country" else v) for k, v in fields.items() if v not in (None, "")})
    seq = max((d.seq for d in documents if d.collection == "manufacturers"), default=-1) + 1
    document = Document(collection="manufacturers", key=str(key_id), seq=seq, data=data, rev=1)
    record = _record(
        actor, TargetType.BRAND, str(catalog_id), Action.BRAND_CREATE,
        channel=Channel.WEB, changes=_diff({}, data), why=why,
    )
    commit_catalogue_change(store, log, [Put(document, None)], [key_advance, id_advance], [record])
    return Outcome("manufacturers", document.key, data, 1, [record])


# --- The edit form's description of each field ------------------------------------
#
# The frontend builds its form from this, so the field names, kinds and allowed
# values come from the models — never from a copy kept in TypeScript.

LONG_TEXT_FIELDS = frozenset({"description", "notes"})

# Stored as Unix milliseconds (the seed format), edited as a calendar date. The
# frontend mirrors this set to show dates in the change log
# (frontend/src/utils/fieldDraft.ts DATE_FIELDS; tests/test_edits.py checks it).
DATE_FIELDS = frozenset({"release_date"})


def _kind(name: str, annotation: Any) -> tuple[str, list | None]:
    import enum
    import types
    import typing

    args = [a for a in typing.get_args(annotation) if a is not type(None)]
    is_union = typing.get_origin(annotation) in (typing.Union, types.UnionType)
    base = args[0] if is_union and len(args) == 1 else annotation
    origin = typing.get_origin(base)
    if origin is list:
        (inner,) = typing.get_args(base) or (str,)
        if isinstance(inner, type) and issubclass(inner, enum.Enum):
            return "choices", [m.value for m in inner]
        return "list", None
    if isinstance(base, type) and issubclass(base, enum.Enum):
        return "choice", [m.value for m in base]
    if base is bool:
        return "boolean", None
    if base is int:
        return ("date" if name in DATE_FIELDS else "integer"), None
    if base is float:
        return "number", None
    return ("longtext" if name in LONG_TEXT_FIELDS else "text"), None


def field_specs(collection: str, brands: Iterable[str]) -> list[dict]:
    """[{name, kind, options, required}] for every editable field, model order;
    `brand` first after `name`, choosing among the brands that exist."""
    from slack_data.load_data.load_gear import JSON_TEXT_FIELDS, stored_fields

    if collection not in GEAR:
        raise NotFound(f"no gear type {collection!r}")
    _, create = GEAR[collection]
    brand_options = sorted(set(brands), key=str.lower)
    specs = []
    for name, info in create.model_fields.items():
        if name not in stored_fields(collection):
            continue
        if name in JSON_TEXT_FIELDS.get(collection, ()):
            kind, options = "curve", None
        elif name == "gear_sellers":
            kind, options = "choices", brand_options
        else:
            kind, options = _kind(name, info.annotation)
        specs.append({"name": name, "kind": kind, "options": options, "required": info.is_required()})
        if name == "name":
            specs.append({"name": "brand", "kind": "choice", "options": brand_options, "required": True})
    return specs


def brand_field_specs() -> list[dict]:
    kinds = {str: "text", int: "integer", bool: "boolean"}
    return [{"name": n, "kind": kinds[t], "options": None, "required": False} for n, t in BRAND_FIELDS.items()]
