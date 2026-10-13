"""
Onboarding a brand in one command — the operator's half of the manufacturer API.

`register.py` maps an API key onto a brand. That is one of five steps, and the
other four were a console, a markdown table and two curl commands held together
by a runbook. This module is the rest, so the whole thing is:

    python -m slack_data.manufacturers.register --check "Balance Community"
    # ...send the out-of-band challenge, wait for the reply...
    python -m slack_data.manufacturers.register --onboard \\
        --brand "Balance Community" --verified-via "replied to info@balancecommunity.com"

## The key is minted here, not in Cognito

Until 2026-10 a brand's credential was a Cognito app client in SlackData's own
user pool. That pool is gone (LIVE_EDITING_PLAN.md D62): a key is now a random
client id and secret generated here and stored in the brand-clients table
(D63). Nothing in AWS has to be created for one, so nothing can be created in
the wrong place.

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
import secrets
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

DEFAULT_API = "https://slackdata.org/api"


class OnboardError(RuntimeError):
    """Anything that should stop the operator rather than be worked around."""


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


# --- The key ----------------------------------------------------------------


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "brand"


def new_key() -> tuple[str, str]:
    """A fresh (client_id, secret).

    The client id is 26 hex characters, the length of the Cognito ids issued
    before it, and contains no ':' — the separator in the header. The
    secret is 256 bits from the OS's CSPRNG, URL-safe base64, so it also never
    contains ':'.
    """
    return secrets.token_hex(13), secrets.token_urlsafe(32)


# --- Proving it works before anyone is told it does -------------------------


def verify_end_to_end(client_id: str, client_secret: str, api_base: str = DEFAULT_API) -> dict:
    """Call the API exactly as the brand will, and ask who it is.

    Doing it here means a key is never handed over untested — and it catches a
    `brand_id` that drifted between this machine's catalogue and the deployed
    image (503) before it becomes the brand's problem.
    """
    import httpx

    try:
        identity = httpx.get(
            f"{api_base.rstrip('/')}/manufacturer/me",
            headers={"Authorization": f"Bearer {client_id}:{client_secret}"},
            timeout=15,
        )
    except Exception as error:
        raise OnboardError(f"could not reach the API: {error}") from error
    if identity.status_code == 503:
        raise OnboardError(
            "the API answered 503 — our record of this brand's id disagrees with the\n"
            "  deployed catalogue. Re-run against a catalogue seeded from the deployed\n"
            "  commit. The key is NOT usable yet; do not hand it over."
        )
    if identity.status_code != 200:
        raise OnboardError(
            f"GET /manufacturer/me answered {identity.status_code}:\n"
            f"    {identity.text[:300]}"
        )
    return identity.json()


# --- Handing it over --------------------------------------------------------


def write_credential_file(
    brand_name: str, client_id: str, client_secret: str, api_base: str
) -> Path:
    """Write the key to a 0600 file and return the path.

    Not printed to the terminal: a secret on stdout lives in scrollback, in tmux
    history and in whatever the terminal logs, and this one grants write access
    to a company's catalogue entry until somebody revokes it. A file can be
    attached, pasted from, and deleted.
    """
    CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_DIR.chmod(stat.S_IRWXU)  # 0700, in case it predates this code

    path = CREDENTIALS_DIR / f"{_slug(brand_name)}-{datetime.now(timezone.utc):%Y-%m-%d}.txt"
    path.write_text(
        f"""SlackData gear API key — {brand_name}
Issued {datetime.now(timezone.utc):%Y-%m-%d}. Send this to the brand, then DELETE this file.

  client_id      {client_id}
  client_secret  {client_secret}
  api            {api_base}

Every call sends both, joined by a colon:

  curl -s '{api_base.rstrip("/")}/manufacturer/me' \\
    -H 'Authorization: Bearer {client_id}:{client_secret}'

Documentation for them: https://slackdata.org/for-manufacturers

If it is lost or leaked, the key is revoked and a new one issued — see
infra/README.md § Onboarding a manufacturer.
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
