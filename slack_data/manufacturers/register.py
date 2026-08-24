"""
Registering a brand's API client. `python -m slack_data.manufacturers.register`

The mechanism for onboarding a manufacturer, which is **not** the same thing as
the decision to onboard one. MANUFACTURER_API_PLAN.md § Open questions asks who
verifies that someone mailing from `sales@brand.com` speaks for that brand;
that is a trust question, it gates the phase, and nothing here answers it. What
this does is make the answer executable once a human has reached it.

Deliberately a CLI and not an API route. Minting credentials is the most
dangerous operation in this phase — it is what decides whose data a token can
change — and it happens perhaps a dozen times a year. An endpoint for it would
be a permanent attack surface in exchange for saving a command, and it would
need its own authorization story on top of the admin's.

    # register (or re-register) a client, resolving the brand by name
    python -m slack_data.manufacturers.register \\
        --client-id 3n4kf9... --brand "Balance Community" \\
        --contact hello@balancecommunity.com

    # revoke: takes effect on the very next request, no redeploy
    python -m slack_data.manufacturers.register --client-id 3n4kf9... --deactivate

    # what does this brand hold?
    python -m slack_data.manufacturers.register --brand "Balance Community" --list

The `client_id` is Cognito's, created in the console as an app client with the
`client_credentials` grant and the `slackdata/gear.write` scope. **The secret is
never handled here** — the brand gets it from the console operator once and we
never store it, which is why no `secretsmanager:*` grant was requested.

Run against the same environment the API runs in: `BRAND_CLIENTS_TABLE` set
targets the hosted DynamoDB table, unset writes the local SQLite file.

## The brand id is the dangerous field

`--brand` is resolved against **whatever catalogue this machine has**, and the
record is read by a Lambda holding a catalogue baked from a possibly different
commit. Brand ids are SQLite autoincrements assigned by seed order, with no id
in the root `*.json` — so the two can disagree, and a disagreement hands a
brand's credential to whoever now holds that id.

Two things guard it, neither of which is this file being careful:

1. `matching.verify_brand` re-checks the stored `brand_name` against the id on
   **every** manufacturer request, and refuses rather than answering about the
   wrong company. That is the real protection.
2. Writing to the hosted table from a local catalogue prints a warning here,
   naming the id and the name it resolved to, so the operator can compare it
   with `GET /manufacturer/me` before telling a brand they are live.
"""

import argparse
import os
import sys

from sqlmodel import Session, select

from slack_data import database

# Imported for its side effect as much as for its use: `Brand` declares a
# `Relationship` to all eight gear models by name, and SQLAlchemy cannot resolve
# those names unless the modules defining them have been imported. `main.py`
# imports them all, so the API never hits this; a standalone script that only
# imports `Brand` fails at the first query with "expression 'Webbing' failed to
# locate a name". `matching` imports exactly the eight, which is the set Brand
# refers to.
from slack_data.manufacturers import matching  # noqa: F401
from slack_data.manufacturers.store import build_repository
from slack_data.models.brand_clients import (
    DEFAULT_PERMISSIONS,
    BrandClient,
    BrandPermission,
    now_iso,
)
from slack_data.models.brands import Brand


def _resolve_brand(name_or_id: str) -> tuple[int, str]:
    """A brand name or id -> (id, canonical name).

    Resolving by **name** is the point: the operator has an email from a company,
    not a primary key, and mistyping a key here would hand one brand's data to
    another. An exact-name miss is reported with near matches rather than
    guessed, for the same reason the matcher refuses ambiguity.
    """
    if database.DATABASE_ENGINE is None:
        database.create_db_and_tables()

    with Session(database.DATABASE_ENGINE) as session:
        if name_or_id.isdigit():
            brand = session.get(Brand, int(name_or_id))
            if brand is None:
                sys.exit(f"no brand with id {name_or_id}")
            return brand.id, brand.name

        brands = session.exec(select(Brand)).all()
        exact = [b for b in brands if b.name.casefold() == name_or_id.casefold()]
        if len(exact) == 1:
            return exact[0].id, exact[0].name
        if len(exact) > 1:
            sys.exit(f"{len(exact)} brands are named {name_or_id!r} — use the id")

        near = sorted(b.name for b in brands if name_or_id.casefold() in b.name.casefold())
        hint = f"  did you mean: {', '.join(near[:5])}" if near else ""
        sys.exit(f"no brand named {name_or_id!r}.{hint}")


def _warn_if_catalogue_may_differ(brand_id: int, brand_name: str) -> None:
    """Say so when the id was resolved locally but stored somewhere hosted.

    Silence here would be the wrong default: the write succeeds either way, and
    the failure it invites — a credential pointed at the wrong brand — is
    invisible from this side. `verify_brand` turns that into a refused request
    rather than a leak, but a refused request is a support ticket, and this
    line is what stops it being raised at all.
    """
    if not os.getenv("BRAND_CLIENTS_TABLE"):
        return  # local store, local catalogue — one source of ids
    print(
        "\n  NOTE: the client store is hosted, but the brand id came from this"
        f"\n  machine's catalogue. Confirm the deploy agrees before handing over"
        f"\n  credentials:\n"
        f"\n      curl -H 'Authorization: Bearer <their token>' \\"
        f"\n           https://slackdata.org/api/manufacturer/me\n"
        f"\n  must answer brand_id {brand_id} / {brand_name!r}. If it 503s with a"
        "\n  brand mismatch, re-run this against a catalogue seeded from the"
        "\n  deployed commit."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--client-id", help="the Cognito app client id")
    parser.add_argument("--brand", help="brand name (preferred) or numeric id")
    parser.add_argument("--contact", help="an address to warn if the integration breaks")
    parser.add_argument(
        "--permissions",
        default=",".join(p.value for p in DEFAULT_PERMISSIONS),
        help=(
            "comma separated: suggest, write. `write` is accepted but not yet"
            " honoured — the hosted catalogue is read-only; see"
            " models/brand_clients.py::may_write_directly"
        ),
    )
    parser.add_argument("--note", help="free text, e.g. who asked and when")
    parser.add_argument("--deactivate", action="store_true", help="revoke a client")
    parser.add_argument("--list", action="store_true", help="show a brand's clients")
    args = parser.parse_args(argv)

    clients = build_repository()

    if args.list:
        if not args.brand:
            parser.error("--list needs --brand")
        brand_id, brand_name = _resolve_brand(args.brand)
        rows = clients.list_for_brand(brand_id)
        print(f"{brand_name} (id {brand_id}) — {len(rows)} client(s)")
        for row in rows:
            state = "active" if row.active else "REVOKED"
            perms = ",".join(p.value for p in row.permissions) or "none"
            print(f"  {row.client_id}  [{state}]  {perms}  {row.contact_email or ''}")
        return 0

    if not args.client_id:
        parser.error("--client-id is required")

    if args.deactivate:
        existing = clients.get(args.client_id)
        if existing is None:
            sys.exit(f"no client {args.client_id!r} is registered")
        # Deactivated, never deleted: the submissions it created must stay
        # attributable, and the hosted role has no DeleteItem anyway.
        clients.put(existing.model_copy(update={"active": False}))
        print(f"revoked {args.client_id} (was {existing.brand_name})")
        return 0

    if not args.brand:
        parser.error("--brand is required when registering")

    brand_id, brand_name = _resolve_brand(args.brand)
    try:
        permissions = [
            BrandPermission(value.strip()) for value in args.permissions.split(",") if value.strip()
        ]
    except ValueError as error:
        sys.exit(f"unknown permission: {error}")

    client = BrandClient(
        client_id=args.client_id,
        brand_id=brand_id,
        brand_name=brand_name,
        permissions=permissions,
        contact_email=args.contact,
        active=True,
        created_at=now_iso(),
        note=args.note,
    )
    clients.put(client)
    print(
        f"registered {client.client_id} -> {brand_name} (id {brand_id});"
        f" permissions: {', '.join(p.value for p in permissions) or 'none'}"
    )
    _warn_if_catalogue_may_differ(brand_id, brand_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
