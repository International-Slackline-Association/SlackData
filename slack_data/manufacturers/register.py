"""
Registering a brand's API client. `python -m slack_data.manufacturers.register`

The mechanism for onboarding a manufacturer, which is **not** the same thing as
the decision to onboard one. Who verifies that someone mailing from
`sales@brand.com` speaks for that brand is a trust question, and nothing here
answers it — `infra/README.md` § Onboarding policy does (confirm out-of-band, to
an address we already held; record the decision in `infra/onboarded-brands.md`).
What this does is make that answer executable once a human has reached it.

Note the policy says to register **without** `--contact`: the record has no TTL
and the Lambda role has no `DeleteItem`, so a contact address stored here could
not be erased on request. See `infra/README.md` § What we store about a brand
contact.

Deliberately a CLI and not an API route. Minting credentials is the most
dangerous operation in this phase — it is what decides whose data a token can
change — and it happens perhaps a dozen times a year. An endpoint for it would
be a permanent attack surface in exchange for saving a command, and it would
need its own authorization story on top of the admin's.

    # register (or re-register) a client, resolving the brand by name
    python -m slack_data.manufacturers.register \\
        --client-id 3n4kf9... --brand "Balance Community"

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
commit — so the two can disagree, and a disagreement hands a brand's credential
to whoever now holds that id.

That risk is much smaller than it was. `Brand.id` now comes from `catalog_id` in
the root `manufacturers.json`, via `load_data/brand_ids.py`, rather than from a
SQLite autoincrement assigned by seed order; all 76 entries carry one, including
manufacturers we hold no gear for. Two catalogues seeded from the same commit of
that file therefore agree by construction. What is left is genuine drift — a
local checkout older or newer than the deployed image — which is exactly what
the two guards below are for.

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
from slack_data.manufacturers import (
    matching,  # noqa: F401
    onboard,
)
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


def _check(brand: str, clients) -> int:
    """`--check` — the evidence, before you send the challenge.

    Deliberately read-only and separate from `--onboard`. Onboarding is two
    sittings with a wait in between (you challenge, they reply), and a single
    command that did both would either block on input or invite the operator to
    skip the wait.
    """
    brand_id, brand_name = _resolve_brand(brand)
    dossier = onboard.build_dossier(brand_id, brand_name, clients.list_for_brand(brand_id))
    print(onboard.render_dossier(dossier))
    print("  When they have answered:")
    print("      python -m slack_data.manufacturers.register --onboard \\")
    print(f"          --brand {brand_name!r} --verified-via '<how you confirmed>'")
    print()
    return 0


def _onboard(args, clients) -> int:
    """`--onboard` — mint, map, record and prove, in that order.

    The order is the safety property. Nothing is created until a human has
    confirmed the dossier; nothing is handed over until the credential has been
    proven end to end; and if any step after the app client fails, the client is
    deleted again rather than left live with nothing recording that it exists.
    """
    brand_id, brand_name = _resolve_brand(args.brand)
    existing = clients.list_for_brand(brand_id)
    dossier = onboard.build_dossier(brand_id, brand_name, existing)
    print(onboard.render_dossier(dossier))
    print(f"  verified via  {args.verified_via}")
    print(f"  approved by   {args.approved_by or onboard.operator_identity()}")

    active = [row for row in existing if row.active]
    if active:
        print()
        print(f"  ! {brand_name} ALREADY has {len(active)} active credential(s). A second one")
        print("    is legitimate (a brand may want one per system) but is usually a")
        print("    re-issue — in which case revoke the old one afterwards.")

    if not args.yes:
        print()
        answer = input(f"  Create a credential for {brand_name!r}? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("  cancelled — nothing was created.")
            return 1

    outputs = onboard.stack_outputs(args.stack, args.region)
    pool_id, token_url = onboard.resolve_pool(outputs)
    print(f"\n  pool          {pool_id}  (from {args.stack} outputs, not by name)")

    client_id, client_secret = onboard.create_app_client(
        pool_id, brand_name, stage=args.stage, region=args.region
    )
    print(f"  ✓ app client created   {client_id}")

    # From here on, a failure must not leave a live credential behind.
    try:
        client = BrandClient(
            client_id=client_id,
            brand_id=brand_id,
            brand_name=brand_name,
            permissions=list(DEFAULT_PERMISSIONS),
            contact_email=None,  # see infra/README.md § What we store about a brand contact
            active=True,
            created_at=now_iso(),
            note=f"verified via {args.verified_via}",
        )
        clients.put(client)
        print(f"  ✓ mapped to brand id {brand_id} ({brand_name})")

        if args.verify:
            identity = onboard.verify_end_to_end(
                token_url, client_id, client_secret, args.api
            )
            if identity.get("brand_id") != brand_id:
                raise onboard.OnboardError(
                    f"the API says these credentials are {identity.get('brand_name')!r}"
                    f" (id {identity.get('brand_id')}), not {brand_name!r} (id {brand_id})."
                    " Do NOT hand them over."
                )
            print(f"  ✓ /manufacturer/me -> {identity['brand_name']} (id {identity['brand_id']})")
        else:
            print("  - end-to-end check skipped (--no-verify)")

        onboard.append_ledger_row(
            brand_name, client_id, args.verified_via,
            args.approved_by or onboard.operator_identity(),
        )
        print(f"  ✓ recorded in {onboard.LEDGER.relative_to(onboard.ROOT)}")

        path = onboard.write_credential_file(
            brand_name, client_id, client_secret, token_url, args.api
        )
    except Exception:
        print("\n  ! failed after creating the app client — deleting it again so no")
        print("    live credential is left with nothing recording it.")
        onboard.delete_app_client(pool_id, client_id, args.region)
        clients.put(
            BrandClient(
                client_id=client_id, brand_id=brand_id, brand_name=brand_name,
                permissions=[], contact_email=None, active=False,
                created_at=now_iso(), note="rolled back: onboarding failed",
            )
        )
        raise

    print(f"\n  Credential written to {path} (mode 0600).")
    print("  Nothing secret was printed here. Send it to the brand, then delete the file.")
    print("  Point them at https://slackdata.org/for-manufacturers\n")
    return 0


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

    # --- Onboarding (see manufacturers/onboard.py) --------------------------
    parser.add_argument(
        "--check",
        metavar="BRAND",
        help="show what we know about a brand, before you send the challenge",
    )
    parser.add_argument(
        "--onboard",
        action="store_true",
        help="create the app client, map it, record it and prove it works",
    )
    parser.add_argument(
        "--verified-via",
        help="how you confirmed the brand — recorded in the ledger. Required to onboard.",
    )
    parser.add_argument("--approved-by", help="who decided (default: $USER)")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    parser.add_argument(
        "--no-verify",
        dest="verify",
        action="store_false",
        help="skip the end-to-end token check (it needs the API to be deployed)",
    )
    parser.add_argument("--stack", default=onboard.DEFAULT_STACK)
    parser.add_argument("--region", default=onboard.DEFAULT_REGION)
    parser.add_argument("--stage", default="prod")
    parser.add_argument("--api", default=onboard.DEFAULT_API)
    args = parser.parse_args(argv)

    clients = build_repository()

    if args.check:
        return _check(args.check, clients)

    if args.onboard:
        if not args.brand:
            parser.error("--onboard needs --brand")
        if not args.verified_via:
            parser.error(
                "--onboard needs --verified-via: how you confirmed this brand is who they"
                " say. It goes in the ledger, and it is the whole audit trail."
            )
        if args.client_id:
            parser.error(
                "--onboard CREATES the app client; do not pass --client-id. To register a"
                " client you made by hand in the console, use --client-id without --onboard."
            )
        try:
            return _onboard(args, clients)
        except onboard.OnboardError as error:
            sys.exit(f"\n  {error}\n")

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
