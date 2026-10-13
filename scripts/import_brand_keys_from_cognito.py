"""
Copy each brand's existing Cognito secret into its brand-clients record (D63).

**Run once, before `slackdata-admins-<stage>` is deleted** — the pool is the only
place these secrets exist, and after the import a brand keeps the client id and
secret it already holds; only how it sends them changes (D65).

    # what would happen (default — writes nothing)
    python scripts/import_brand_keys_from_cognito.py --user-pool-id eu-central-1_Fzl6ssZOQ

    # do it, against the hosted table
    BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod \\
        python scripts/import_brand_keys_from_cognito.py \\
        --user-pool-id eu-central-1_Fzl6ssZOQ --apply

Which clients: every **active** row of `infra/onboarded-brands.md`, the ledger
of every credential ever minted. A record that already has a secret is left
alone, so a second run changes nothing. The secrets are never printed.

Runs as the operator (SSO), never as the Lambda: it needs
`cognito-idp:DescribeUserPoolClient`, which the Lambda role does not hold.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "infra" / "onboarded-brands.md"

sys.path.insert(0, str(ROOT))

from slack_data.manufacturers.store import build_repository


def active_client_ids(ledger: Path = LEDGER) -> list[tuple[str, str]]:
    """(brand, client id) for each ledger row whose status is `active`."""
    rows = []
    for line in ledger.read_text(encoding="utf-8").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 6 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cells[0]):
            continue
        _, brand, client_id, _, _, state = cells
        if state == "active":
            rows.append((brand, client_id))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--user-pool-id", required=True, help="the old slackdata-admins pool")
    parser.add_argument("--region", default="eu-central-1")
    parser.add_argument("--apply", action="store_true", help="write (default: dry run)")
    args = parser.parse_args(argv)

    import boto3

    cognito = boto3.client("cognito-idp", region_name=args.region)
    clients = build_repository()
    failures = 0

    for brand, client_id in active_client_ids():
        record = clients.get(client_id)
        if record is None:
            print(f"  ! {brand}: {client_id} is in the ledger but not in the brand-clients store")
            failures += 1
            continue
        if record.secret:
            print(f"  = {brand}: {client_id} already has a key — left alone")
            continue
        try:
            described = cognito.describe_user_pool_client(
                UserPoolId=args.user_pool_id, ClientId=client_id
            )["UserPoolClient"]
        except Exception as error:  # noqa: BLE001 - reported per client, then the next
            print(f"  ! {brand}: could not read {client_id} from the pool: {error}")
            failures += 1
            continue
        secret = described.get("ClientSecret")
        if not secret:
            print(f"  ! {brand}: {client_id} has no secret in the pool")
            failures += 1
            continue
        if ":" in client_id or ":" in secret:
            print(f"  ! {brand}: {client_id} contains ':' and could not be sent as a key")
            failures += 1
            continue
        if args.apply:
            clients.put(record.model_copy(update={"secret": secret}))
            print(f"  ✓ {brand}: {client_id} imported")
        else:
            print(f"  - {brand}: {client_id} would be imported (dry run)")

    if not args.apply:
        print("\nDry run — nothing written. Re-run with --apply.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
