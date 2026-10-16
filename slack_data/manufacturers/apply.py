"""
The machine API, applied live — phase 5 (LIVE_EDITING_PLAN.md § 7.6,
LIVE_EDITING_PHASE_5.md P5-F, P5-G, P5-H, P5-J).

A brand's key now edits the catalogue store with the rights of that brand's
manufacturers (`rights.py`): its own products, uncapped (D53), labelled
"manufacturer for <brand>" and logged with channel `manufacturer-api`. Every
active key does (P5-J); the `SUGGEST`/`WRITE` permission no longer decides.

- **The values as sent**, not their prose (`typed_changes`), through the same
  validation an edit gets — a value the model refuses fails its item.
- **Last write wins** (P5-F): an integration holds no rev, so each item is
  applied to whatever is stored now; both changes stay in the log.
- **All or nothing** (P5-G): every item is planned first, against one read of
  the store, and a batch that fails anywhere writes nothing. The writes go in
  transactions of at most `MAX_TRANSACT` items (DynamoDB's limit is 100, two
  taken by the edit count and version); a batch that needs two and fails in
  the second answers 502 saying how many landed.
- **New products** get the next ids of their type, claimed together.
- **Photo links** (P5-H): an item that sends `image_urls` leaves a to-do row
  in the admin's queue — the links, for someone to upload by hand.

Each item still leaves a `Submission` row — `APPLIED`, or `APPROVED` while its
photos wait — so the receipt's `submission_id` and `GET /manufacturer/
submissions` read back as before.
"""

from dataclasses import dataclass

from fastapi import HTTPException, status

from slack_data.catalogue import edits, rights
from slack_data.catalogue.repository import (
    CatalogueRepository,
    Conflict,
    CounterAdvance,
)
from slack_data.changelog.writer import commit_catalogue_change, next_id
from slack_data.models.brand_clients import ManufacturerPrincipal
from slack_data.models.changes import MAX_WHY_LENGTH, Channel
from slack_data.models.manufacturer_updates import ManufacturerGearItem
from slack_data.models.people import Person

# Writes per transaction, of DynamoDB's 100: the edit count and the version
# take two, and the counters a batch of new products advances a few more.
MAX_TRANSACT = 90


def api_actor(principal: ManufacturerPrincipal) -> Person:
    """Who a key's changes are recorded as: the key itself, representing its
    brand. Not a person — `KEY_<client id>` is what the log shows."""
    return Person(
        sub=f"brand-client:{principal.client_id}",
        isa_id=f"KEY_{principal.client_id[:20]}",
        brands=[principal.brand_id],
    )


def is_api_actor(isa_id: str) -> bool:
    return isa_id.startswith("KEY_")


@dataclass
class Applied:
    gear_id: int
    gear_name: str
    # The log records this item wrote (none: it already held every value).
    record_ids: list[str]
    created: bool


def _fail(index: int, error: edits.EditError) -> HTTPException:
    return HTTPException(
        error.status,
        {"message": f"items[{index}]: {error.message}", "errors": error.detail},
    )


def apply_batch(
    store: CatalogueRepository,
    log,
    principal: ManufacturerPrincipal,
    items: list[ManufacturerGearItem],
    matches: list,
    patches: list[dict[str, str]],
    notes: list[str | None],
) -> list[Applied]:
    """Plan every item, then write them all. Raises an HTTPException naming
    the item on the first that cannot be applied — nothing written then."""
    actor = api_actor(principal)
    documents = store.load(include_retired=True)
    brand = rights.brand_of(documents, principal.brand_name)
    if brand is None or brand[0] != principal.brand_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "this key's brand is not in the catalogue")

    seen: dict[tuple[str, int], int] = {}
    for index, match in enumerate(matches):
        if match.gear_id is not None:
            key = (items[index].gear_type, match.gear_id)
            if key in seen:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"items[{seen[key]}] and items[{index}] are the same product — send it once",
                )
            seen[key] = index

    # collection -> [the counter's value as read, the first id claimed, the next]
    claimed: dict[str, list] = {}
    plans, results = [], []
    for index, (item, match, patch, note) in enumerate(zip(items, matches, patches, notes)):
        changes = {name: value for name, value in item.typed_changes().items()}
        if "name" in patch:  # a rename, from rename_to (MANUFACTURER_EXCLUDED)
            changes["name"] = patch["name"]
        why = (note or "")[:MAX_WHY_LENGTH] or None
        collection = item.gear_type
        try:
            if match.gear_id is None:
                if collection not in claimed:
                    first, advance = next_id(store, collection)
                    claimed[collection] = [advance.expected, first, first]
                new_id = claimed[collection][2]
                claimed[collection][2] += 1
                fields = {**changes, "name": item.name, "brand": brand[1]}
                planned = edits.plan_create_item(
                    documents, actor, collection, fields, new_id, why,
                    channel=Channel.MANUFACTURER_API, seq_offset=new_id - claimed[collection][1],
                )
                gear_id, created = new_id, True
            else:
                current = next(d for d in documents if d.collection == collection and d.key == str(match.gear_id))
                planned = (
                    edits.plan_edit_item(
                        documents, actor, collection, match.gear_id, current.rev, changes, why,
                        channel=Channel.MANUFACTURER_API,
                    )
                    if changes
                    else edits.Planned([], [], [], edits.Outcome(collection, current.key, current.data, current.rev))
                )
                gear_id, created = match.gear_id, False
        except edits.EditError as error:
            raise _fail(index, error) from error
        plans.append(planned)
        results.append(
            Applied(gear_id, planned.outcome.entry.get("name", item.name or ""), [r.id for r in planned.records], created)
        )

    # Every id handed out is claimed in the first transaction, with the first
    # creates: an id is never reused, so a later failure only skips some.
    counters = [CounterAdvance(c, expected, nxt) for c, (expected, _, nxt) in claimed.items()]
    _write(store, log, plans, counters)
    return results


def _write(store, log, plans: list[edits.Planned], counters: list[CounterAdvance]) -> None:
    chunks: list[list[edits.Planned]] = [[]]
    size = len(counters)
    for plan in plans:
        writes = len(plan.puts) + len(plan.records)
        if not writes:
            continue
        if chunks[-1] and size + writes > MAX_TRANSACT:
            chunks.append([])
            size = 0
        chunks[-1].append(plan)
        size += writes
    written = 0
    for number, chunk in enumerate(c for c in chunks if c):
        puts = [put for plan in chunk for put in plan.puts]
        records = [record for plan in chunk for record in plan.records]
        try:
            commit_catalogue_change(store, log, puts, counters if number == 0 else [], records)
        except Conflict as error:
            raise HTTPException(
                status.HTTP_409_CONFLICT if not written else status.HTTP_502_BAD_GATEWAY,
                f"{error.what} changed while this batch was being applied; "
                f"{written} item(s) were written before it — resend the rest",
            ) from error
        written += len(chunk)
