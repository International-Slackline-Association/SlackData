"""
A brand's machine API keys, managed by its manufacturers (phase 5, D64).

| route | does |
|---|---|
| `GET /me/brands/{catalog_id}/keys` | the brand's keys, **with their secrets** (D64: viewable any time) |
| `POST /me/brands/{catalog_id}/keys` | a new key (`{note?}`) — logged `key.create` |
| `POST /me/brands/{catalog_id}/keys/{client_id}/regenerate` | a new secret for the key; the old one stops working at once — logged `key.regenerate` |
| `POST /me/brands/{catalog_id}/keys/{client_id}/revoke` | the key stops working — logged `key.revoke` |

For the brand's manufacturers (`Person.brands`) and admins. Every action is in
the public log on the brand, naming the client id and never the secret. The
key is written after its record: two stores cannot share a transaction, and a
failure in between leaves a record of an attempt, never an unrecorded key
(as `commit_catalogue_change` orders it locally).

The CLI (`python -m slack_data.manufacturers.register`) still works, for an
operator onboarding a brand nobody represents yet.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from slack_data.api.auth import require_person
from slack_data.api.routers.brand_requests_router import _brand
from slack_data.changelog.store import ChangeLogRepositoryDep
from slack_data.manufacturers.onboard import new_key
from slack_data.manufacturers.store import ClientRepositoryDep
from slack_data.models.brand_clients import BrandClient, now_iso
from slack_data.models.changes import (
    Action,
    ChangeRecord,
    Channel,
    FieldChange,
    TargetType,
)
from slack_data.models.people import Person, Role
from slack_data.utilities.brand_aliases import canonical_brand

brand_keys_router = APIRouter(tags=["brand keys"])

CurrentPerson = Annotated[Person, Depends(require_person)]
ClientId = Annotated[str, Path(max_length=128)]
MAX_KEY_NOTE = 200


class NewKey(BaseModel):
    note: str | None = Field(default=None, max_length=MAX_KEY_NOTE)


class KeyView(BaseModel):
    client_id: str
    # The whole key as the brand sends it: "<client_id>:<secret>" (D65).
    key: str | None
    active: bool
    created_at: str
    note: str | None


def _brand_name(person: Person, catalog_id: int) -> str:
    """The brand, if this person may manage its keys; else 403 / 404."""
    if not (person.has(Role.ADMIN) or person.represents(catalog_id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only this brand's manufacturers and admins manage its keys")
    entry = _brand(catalog_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no brand {catalog_id}")
    return canonical_brand(str(entry["name"]))


def _view(client: BrandClient) -> KeyView:
    return KeyView(
        client_id=client.client_id,
        key=f"{client.client_id}:{client.secret}" if client.secret else None,
        active=client.active,
        created_at=client.created_at,
        note=client.note,
    )


def _own(clients, catalog_id: int, client_id: str) -> BrandClient:
    client = clients.get(client_id)
    if client is None or client.brand_id != catalog_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no key {client_id} for brand {catalog_id}")
    return client


def _log(log, person: Person, catalog_id: int, name: str, action: Action, client_id: str, before=None) -> None:
    log.append(
        ChangeRecord(
            target_type=TargetType.BRAND,
            target_id=str(catalog_id),
            action=action,
            actor_sub=person.sub,
            actor_isa_id=person.isa_id,
            actor_role=person.role_label((catalog_id, name)),
            channel=Channel.WEB,
            changes={"key": FieldChange(before=before, after=client_id)},
        )
    )


@brand_keys_router.get("/me/brands/{catalog_id}/keys", response_model=list[KeyView])
def list_keys(catalog_id: int, person: CurrentPerson, clients: ClientRepositoryDep):
    _brand_name(person, catalog_id)
    return [_view(c) for c in sorted(clients.list_for_brand(catalog_id), key=lambda c: c.created_at)]


@brand_keys_router.post("/me/brands/{catalog_id}/keys", response_model=KeyView, status_code=201)
def create_key(
    catalog_id: int, body: NewKey, person: CurrentPerson, clients: ClientRepositoryDep, log: ChangeLogRepositoryDep
):
    name = _brand_name(person, catalog_id)
    client_id, secret = new_key()
    _log(log, person, catalog_id, name, Action.KEY_CREATE, client_id)
    client = BrandClient(
        client_id=client_id,
        brand_id=catalog_id,
        brand_name=name,
        secret=secret,
        created_at=now_iso(),
        note=(body.note or "").strip() or None,
    )
    return _view(clients.put(client))


@brand_keys_router.post("/me/brands/{catalog_id}/keys/{client_id}/regenerate", response_model=KeyView)
def regenerate_key(
    catalog_id: int, client_id: ClientId, person: CurrentPerson, clients: ClientRepositoryDep, log: ChangeLogRepositoryDep
):
    name = _brand_name(person, catalog_id)
    client = _own(clients, catalog_id, client_id)
    _, secret = new_key()
    _log(log, person, catalog_id, name, Action.KEY_REGENERATE, client_id, before=client_id)
    return _view(clients.put(client.model_copy(update={"secret": secret, "active": True})))


@brand_keys_router.post("/me/brands/{catalog_id}/keys/{client_id}/revoke", response_model=KeyView)
def revoke_key(
    catalog_id: int, client_id: ClientId, person: CurrentPerson, clients: ClientRepositoryDep, log: ChangeLogRepositoryDep
):
    name = _brand_name(person, catalog_id)
    client = _own(clients, catalog_id, client_id)
    if not client.active:
        return _view(client)
    _log(log, person, catalog_id, name, Action.KEY_REVOKE, None, before=client_id)
    return _view(clients.put(client.model_copy(update={"active": False})))
