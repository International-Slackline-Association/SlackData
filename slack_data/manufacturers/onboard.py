"""
Onboarding a brand in one command — the operator's half of the manufacturer API.

`register.py` maps a Cognito client id onto a brand. That is one of five steps,
and the other four were a console, a markdown table and two curl commands held
together by a runbook. This module is the rest, so the whole thing is:

    python -m slack_data.manufacturers.register --check "Balance Community"
    # ...send the out-of-band challenge, wait for the reply...
    python -m slack_data.manufacturers.register --onboard \\
        --brand "Balance Community" --verified-via "replied to info@balancecommunity.com"

## Why the console step moved in here

Creating the app client by hand is where this goes wrong, and the failure is
silent. The console asks for a pool by NAME, and a failed deploy can leave a
second pool with the identical name behind (one did, on 2026-08-25). Pick the
wrong one and everything still "works": the client is created, the brand gets a
credential, tokens mint — and every request 401s, because the API verifies
against the other pool's JWKS. Resolving the pool from the **stack output**
instead of a name cannot make that mistake.

The same call also pins the four settings that must be right and have no second
chance: a secret (a machine can hold one), `client_credentials` only, the
`slackdata/gear.write` scope, and nothing else. See `infra/serverless.yml`
::AdminUserPoolClient for the *other* kind of client in this pool — the admin
SPA, which must never have a secret or this grant.

## What is deliberately NOT automated

**The verification itself.** The tool gathers the evidence and records the
answer; a human reads it and decides. That is the entire point of onboarding
being a CLI rather than a route (MANUFACTURER_API_PLAN.md § Onboarding), and
automating the judgement would quietly undo it.

**The domain check is shown, never enforced.** `manufacturers.json` records what
each brand publishes as its own contact, and for several that is not on their
own domain — Slack Mountain publishes `slackmountain.com@gmail.com`, Yoga
Slackers a gmail too, Raed Slacklines an address at `raed-sports.com`. A rule
that refused those would refuse the real brand, and an override used routinely
teaches the operator to click past the one screen that matters. So the
comparison is computed and printed as evidence, and the decision stays yours.

**Sending the challenge.** The app sends no mail by design (see
`infra/serverless.yml` on why there is no SES identity). The challenge goes from
your own mailbox, which is also what makes it a challenge.
"""

from __future__ import annotations

import json
import os
import re
import stat
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent.parent
MANUFACTURERS_JSON = ROOT / "manufacturers.json"
LEDGER = ROOT / "infra" / "onboarded-brands.md"

# Where a minted credential is written. Outside the repo, so it can never be
# committed by an absent-minded `git add -A`.
CREDENTIALS_DIR = Path.home() / ".slackdata" / "credentials"

DEFAULT_STACK = "slackdata-prod"
DEFAULT_REGION = "eu-central-1"
DEFAULT_API = "https://slackdata.org/api"
GEAR_SCOPE = "slackdata/gear.write"


class OnboardError(RuntimeError):
    """Anything that should stop the operator rather than be worked around."""


def _boto3():
    """Imported lazily, like every other AWS path in this repo.

    The suite, the local server and Cypress all run without boto3 installed
    (`submissions/repository.py`), and onboarding is the one workflow that
    genuinely cannot. So the import failure has to name the fix.
    """
    try:
        import boto3
    except ModuleNotFoundError as error:  # pragma: no cover - environment-dependent
        raise OnboardError(
            "onboarding needs boto3, which is an optional dependency:\n"
            "    pip install '-e.[aws]'"
        ) from error
    return boto3


# --- The evidence -----------------------------------------------------------


def _normalise_domain(host: str) -> str:
    """`WWW.Brand.co.uk.` -> `brand.co.uk`. Comparison only, not validation."""
    host = host.strip().rstrip(".").lower()
    return host.removeprefix("www.")


def domain_of_url(url: str | None) -> str | None:
    if not url or not url.strip():
        return None
    parsed = urlparse(url if "//" in url else f"//{url}")
    return _normalise_domain(parsed.netloc) or None


def domain_of_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return _normalise_domain(email.rsplit("@", 1)[1]) or None


@dataclass
class Dossier:
    """Everything we already know about a brand, for a human to judge."""

    brand_id: int
    brand_name: str
    website: str | None
    email: str | None
    facebook: str | None
    country: str | None
    item_count: int | None
    site_domain: str | None
    email_domain: str | None
    existing_clients: list = None

    @property
    def domains_agree(self) -> bool | None:
        """None when we cannot tell — which is most of them, and is not a fault."""
        if not self.site_domain or not self.email_domain:
            return None
        return self.site_domain == self.email_domain


def _entry_for(brand_id: int) -> dict:
    """The `manufacturers.json` record whose `catalog_id` is this brand id.

    Joined on `catalog_id` rather than on the name: that field IS `Brand.id`
    (see `load_data/brand_ids.py`), so this is the same identity the credential
    will be scoped by, and a name that differs in punctuation cannot split them.
    """
    data = json.loads(MANUFACTURERS_JSON.read_text(encoding="utf-8"))["manufacturers"]
    for entry in data.values():
        if entry.get("catalog_id") == brand_id:
            return entry
    return {}


def build_dossier(brand_id: int, brand_name: str, existing_clients=None) -> Dossier:
    entry = _entry_for(brand_id)
    website = (entry.get("website") or "").strip() or None
    email = (entry.get("email") or "").strip() or None
    return Dossier(
        brand_id=brand_id,
        brand_name=brand_name,
        website=website,
        email=email,
        facebook=(entry.get("facebook") or "").strip() or None,
        country=entry.get("country"),
        item_count=entry.get("item_count"),
        site_domain=domain_of_url(website),
        email_domain=domain_of_email(email),
        existing_clients=existing_clients or [],
    )


def render_dossier(dossier: Dossier) -> str:
    """The block an operator reads before deciding. Evidence, not a verdict."""
    lines = [
        "",
        f"  brand        {dossier.brand_name}  (id {dossier.brand_id}"
        + (f", {dossier.item_count} items" if dossier.item_count is not None else "")
        + ")",
        f"  country      {dossier.country or '—'}",
        f"  website      {dossier.website or '— none recorded —'}",
    ]

    if dossier.email:
        agree = dossier.domains_agree
        if agree is True:
            flag = "  [same domain as the website]"
        elif agree is False:
            flag = f"  [DIFFERENT DOMAIN — {dossier.email_domain}]"
        else:
            flag = "  [no website recorded to compare against]"
        lines.append(f"  email        {dossier.email}{flag}")
    else:
        lines.append("  email        — none recorded —")

    lines.append(f"  facebook     {dossier.facebook or '—'}")

    if dossier.existing_clients:
        lines.append("")
        lines.append(f"  ALREADY HAS {len(dossier.existing_clients)} CLIENT(S):")
        for row in dossier.existing_clients:
            state = "active" if row.active else "REVOKED"
            lines.append(f"    {row.client_id}  [{state}]")

    lines.append("")
    lines.append("  Challenge an address or channel THE BRAND CONTROLS — the one recorded")
    lines.append("  above, their site's contact form, or the socials listed there. Not the")
    lines.append("  address that wrote to you: that is the claim, not the confirmation.")
    if dossier.domains_agree is False:
        lines.append("")
        lines.append("  The recorded contact is on a different domain than the website. That")
        lines.append("  is common and not itself suspicious — several brands publish a gmail")
        lines.append("  address. It is only a reason to look, not a reason to stop.")
    return "\n".join(lines)


# --- AWS --------------------------------------------------------------------


def stack_outputs(stack: str = DEFAULT_STACK, region: str = DEFAULT_REGION) -> dict[str, str]:
    """The deployed stack's outputs, which is where the pool id comes from."""
    client = _boto3().client("cloudformation", region_name=region)
    try:
        stacks = client.describe_stacks(StackName=stack)["Stacks"]
    except Exception as error:
        raise OnboardError(f"could not read stack {stack!r}: {error}") from error
    return {o["OutputKey"]: o["OutputValue"] for o in stacks[0].get("Outputs", [])}


def resolve_pool(outputs: dict[str, str]) -> tuple[str, str]:
    """(user pool id, token url) — both from the stack, never from a name.

    The whole reason this function exists rather than a `--user-pool-id` the
    operator types: a pool NAME is ambiguous (a failed rollback orphaned a
    second `slackdata-admins-prod` on 2026-08-25) and picking the wrong one
    fails silently at token-verification time.
    """
    pool = outputs.get("AdminUserPoolId")
    token_url = outputs.get("ManufacturerTokenUrl")
    if not pool or not token_url:
        raise OnboardError(
            "the stack has no AdminUserPoolId/ManufacturerTokenUrl output, so Phase 4\n"
            "  is not deployed yet. Deploy half A first:\n"
            "      cd infra && DEPLOY_MANUFACTURER_API=true npx serverless deploy --stage prod"
        )
    return pool, token_url


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "brand"


def create_app_client(
    pool_id: str, brand_name: str, stage: str = "prod", region: str = DEFAULT_REGION
) -> tuple[str, str]:
    """Create the brand's Cognito app client. Returns (client_id, client_secret).

    The four settings below are the ones with no second chance, and each is the
    opposite of what the admin SPA client in the same pool needs:

    - `GenerateSecret=True` — a machine can keep one; a browser cannot, and the
      SPA's PKCE exchange breaks outright if it has one.
    - `client_credentials` only — no user is signing in here.
    - exactly the `slackdata/gear.write` scope, so a stolen token cannot be
      replayed against anything else.
    - no callback or logout URLs, because there is no browser redirect at all.
    """
    cognito = _boto3().client("cognito-idp", region_name=region)
    name = f"slackdata-brand-{_slug(brand_name)}-{stage}"
    try:
        response = cognito.create_user_pool_client(
            UserPoolId=pool_id,
            ClientName=name,
            GenerateSecret=True,
            AllowedOAuthFlows=["client_credentials"],
            AllowedOAuthFlowsUserPoolClient=True,
            AllowedOAuthScopes=[GEAR_SCOPE],
            SupportedIdentityProviders=["COGNITO"],
            EnableTokenRevocation=True,
        )
    except Exception as error:
        message = str(error)
        if "ScopeDoesNotExistException" in message or "scope" in message.lower():
            raise OnboardError(
                f"the pool has no {GEAR_SCOPE!r} scope, which means the resource server\n"
                "  was never created. Redeploy half A with DEPLOY_MANUFACTURER_API=true."
            ) from error
        raise OnboardError(f"could not create the app client: {error}") from error

    client = response["UserPoolClient"]
    return client["ClientId"], client["ClientSecret"]


def delete_app_client(pool_id: str, client_id: str, region: str = DEFAULT_REGION) -> None:
    """Undo a create when a later step fails, so a half-onboarded brand has no
    live credential sitting in the pool with nothing recording that it exists."""
    try:
        _boto3().client("cognito-idp", region_name=region).delete_user_pool_client(
            UserPoolId=pool_id, ClientId=client_id
        )
    except Exception as error:  # noqa: BLE001 - best effort; the caller is already failing
        # Reported, never raised: we are already unwinding a failed onboarding,
        # and masking that with a cleanup error would hide the real cause. A
        # leftover client is visible in the pool and revocable by hand.
        print(f"  ! could not delete the app client {client_id}: {error}")
        print("    delete it by hand, or it sits in the pool with nothing recording it.")


# --- Proving it works before anyone is told it does -------------------------


def verify_end_to_end(
    token_url: str, client_id: str, client_secret: str, api_base: str = DEFAULT_API
) -> dict:
    """Mint a token exactly as the brand will, and ask the API who it is.

    This is the check the runbook asked an operator to remember. Doing it here
    means a credential is never handed over untested — and it catches the two
    failures that otherwise surface as the brand's problem: a `brand_id` that
    drifted between this machine's catalogue and the deployed image (503), and
    an app client created against the wrong pool (401).
    """
    import httpx

    try:
        token_response = httpx.post(
            token_url,
            data={"grant_type": "client_credentials", "scope": GEAR_SCOPE},
            auth=(client_id, client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
    except Exception as error:
        raise OnboardError(f"could not reach the token endpoint: {error}") from error

    if token_response.status_code != 200:
        raise OnboardError(
            f"the token endpoint refused these credentials ({token_response.status_code}):\n"
            f"    {token_response.text[:300]}"
        )
    token = token_response.json().get("access_token")
    if not token:
        raise OnboardError(f"no access_token in the response: {token_response.text[:300]}")

    identity = httpx.get(
        f"{api_base.rstrip('/')}/manufacturer/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if identity.status_code == 503:
        raise OnboardError(
            "the API answered 503 — our record of this brand's id disagrees with the\n"
            "  deployed catalogue. Re-run against a catalogue seeded from the deployed\n"
            "  commit. The credential is NOT usable yet; do not hand it over."
        )
    if identity.status_code != 200:
        raise OnboardError(
            f"GET /manufacturer/me answered {identity.status_code}:\n"
            f"    {identity.text[:300]}"
        )
    return identity.json()


# --- Handing it over --------------------------------------------------------


def write_credential_file(
    brand_name: str, client_id: str, client_secret: str, token_url: str, api_base: str
) -> Path:
    """Write the credential to a 0600 file and return the path.

    Not printed to the terminal: a secret on stdout lives in scrollback, in tmux
    history and in whatever the terminal logs, and this one grants write access
    to a company's catalogue entry until somebody revokes it. A file can be
    attached, pasted from, and deleted.
    """
    CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_DIR.chmod(stat.S_IRWXU)  # 0700, in case it predates this code

    path = CREDENTIALS_DIR / f"{_slug(brand_name)}-{datetime.now(timezone.utc):%Y-%m-%d}.txt"
    path.write_text(
        f"""SlackData gear API credentials — {brand_name}
Issued {datetime.now(timezone.utc):%Y-%m-%d}. Send these to the brand, then DELETE this file.

  client_id      {client_id}
  client_secret  {client_secret}
  token_url      {token_url}
  scope          {GEAR_SCOPE}
  api            {api_base}

Getting a token:

  curl -s -X POST '{token_url}' \\
    -H 'Content-Type: application/x-www-form-urlencoded' \\
    -u '{client_id}:{client_secret}' \\
    -d 'grant_type=client_credentials&scope={GEAR_SCOPE}'

Documentation for them: https://slackdata.org/for-manufacturers

We do not keep a copy of the secret. If it is lost, the client is revoked and a
new one issued — see infra/README.md § Onboarding a manufacturer.
""",
        encoding="utf-8",
    )
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600
    return path


LEDGER_PLACEHOLDER = "| _(none yet"


def append_ledger_row(
    brand_name: str, client_id: str, verified_via: str, approved_by: str
) -> None:
    """Add this onboarding to `infra/onboarded-brands.md`.

    Appended by the tool rather than by hand because a ledger that depends on
    remembering is one that is complete right up until the day it matters. The
    row is the audit trail for "who authorised this credential, on what
    evidence" — see infra/README.md § Onboarding policy.
    """
    if not LEDGER.exists():  # pragma: no cover - the file is in the repo
        raise OnboardError(f"the ledger {LEDGER} is missing")

    text = LEDGER.read_text(encoding="utf-8")
    row = (
        f"| {datetime.now(timezone.utc):%Y-%m-%d} | {brand_name} | {client_id} "
        f"| {verified_via} | {approved_by} | active |"
    )

    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(LEDGER_PLACEHOLDER):
            lines[index] = row  # first real entry replaces the placeholder
            break
    else:
        # Otherwise insert after the last existing table row.
        last = max(
            (i for i, line in enumerate(lines) if line.startswith("| ")),
            default=None,
        )
        if last is None:
            raise OnboardError(f"could not find the table in {LEDGER}")
        lines.insert(last + 1, row)

    LEDGER.write_text("\n".join(lines) + "\n", encoding="utf-8")


def operator_identity() -> str:
    """Who is running this, for the ledger's 'approved by' column."""
    for probe in ("SLACKDATA_OPERATOR", "USER", "LOGNAME"):
        value = os.getenv(probe)
        if value:
            return value
    return "unknown"
