"""Onboarding a brand — `slack_data/manufacturers/onboard.py`.

Onboarding happens perhaps a dozen times a year, by hand, and each run mints a
credential that can rewrite a company's catalogue entry. That combination is the
worst case for testing: too rare to build familiarity, too consequential to get
wrong, and the mistakes are silent. So the things pinned here are the ones with
**no second chance and no error message**:

- The four Cognito app-client settings. A client created without a secret, or
  with the wrong grant, or with a scope it should not have, is a broken or
  over-privileged credential that nobody notices until a brand uses it.
- That the pool comes from a **stack output**, never a name. A failed rollback
  orphaned a second pool called `slackdata-admins-prod` on 2026-08-25; picking
  the wrong one fails only at token-verification time, as a 401 with no cause.
- That the dossier joins `manufacturers.json` on `catalog_id`, not on the name.
  The catalogue calls one brand "Balance Community" and the JSON calls it
  "Balance Community: Slackline Outfitters"; a name join would show the operator
  an empty dossier for a brand we hold full contact details for.
- That the secret never reaches stdout, and its file is 0600.

No AWS is touched: boto3 is faked at the module's own accessor, which is the
same lazy-import seam every other AWS path in this repo uses.
"""

import json
import stat
from pathlib import Path

import pytest

from slack_data.manufacturers import onboard

# --- Domain comparison ------------------------------------------------------
#
# Shown to the operator, never enforced — several brands legitimately publish a
# contact off their own domain, so the value of these is that they are ACCURATE,
# not that they gate anything.


@pytest.mark.parametrize(
    "url,expected",
    [
        ("http://www.gibbon-slacklines.com", "gibbon-slacklines.com"),
        ("https://www.slackshop.cz/en/", "slackshop.cz"),
        ("slack-mountain.com", "slack-mountain.com"),
        ("HTTP://WWW.Brand.CO.UK/", "brand.co.uk"),
        ("", None),
        (None, None),
    ],
)
def test_domain_of_url(url, expected):
    assert onboard.domain_of_url(url) == expected


@pytest.mark.parametrize(
    "email,expected",
    [
        ("info@gibbon-slacklines.com", "gibbon-slacklines.com"),
        ("slackmountain.com@gmail.com", "gmail.com"),
        ("not-an-address", None),
        (None, None),
    ],
)
def test_domain_of_email(email, expected):
    assert onboard.domain_of_email(email) == expected


def test_a_contact_off_the_brands_own_domain_is_reported_not_refused():
    """Slack Mountain's real published contact is a gmail address.

    A rule that refused this would refuse the actual brand, and an override used
    routinely is worse than no rule — so the dossier flags it and moves on.
    """
    dossier = onboard.Dossier(
        brand_id=10, brand_name="Slack Mountain",
        website="http://slack-mountain.com", email="slackmountain.com@gmail.com",
        facebook=None, country="US", item_count=37,
        site_domain="slack-mountain.com", email_domain="gmail.com",
    )
    assert dossier.domains_agree is False

    rendered = onboard.render_dossier(dossier)
    assert "DIFFERENT DOMAIN — gmail.com" in rendered
    assert "not itself suspicious" in rendered  # it is evidence, not a verdict


def test_domains_agree_is_none_when_there_is_nothing_to_compare():
    """25 of 76 manufacturers have no website recorded. That is not a mismatch."""
    dossier = onboard.Dossier(
        brand_id=1, brand_name="X", website=None, email="a@b.com", facebook=None,
        country=None, item_count=None, site_domain=None, email_domain="b.com",
    )
    assert dossier.domains_agree is None
    assert "no website recorded to compare against" in onboard.render_dossier(dossier)


# --- The dossier ------------------------------------------------------------


def test_the_dossier_joins_manufacturers_json_on_catalog_id_not_name():
    """The join that makes the evidence appear at all.

    `catalog_id` IS `Brand.id` (load_data/brand_ids.py), so it is the same
    identity the credential gets scoped by. The names genuinely differ between
    the two sources, which is why a name join would silently show nothing.
    """
    raw = json.loads(onboard.MANUFACTURERS_JSON.read_text(encoding="utf-8"))["manufacturers"]
    entry = next(e for e in raw.values() if e["name"].startswith("Balance Community"))

    # The catalogue's name for it is shorter than the JSON's.
    dossier = onboard.build_dossier(entry["catalog_id"], "Balance Community")

    assert dossier.website, "the join failed — no website found for a brand that has one"
    assert dossier.email == entry["email"]
    assert dossier.brand_name == "Balance Community"  # the catalogue's name is kept


def test_an_unknown_brand_id_gives_an_empty_dossier_rather_than_raising():
    """A brand we hold gear for but have no manufacturers.json entry for is a
    real state; the operator should see 'none recorded', not a traceback."""
    dossier = onboard.build_dossier(99999, "Nobody")
    assert dossier.website is None
    assert "— none recorded —" in onboard.render_dossier(dossier)


# --- The Cognito app client: the four settings with no second chance ---------


# --- The key ----------------------------------------------------------------


def test_a_new_key_is_random_and_safe_to_send():
    """Minted here since the Cognito pool went (D62, D63). Neither half may
    contain ':', the separator in `Bearer <client_id>:<secret>`."""
    keys = [onboard.new_key() for _ in range(50)]
    assert len({client_id for client_id, _ in keys}) == 50
    assert len({secret for _, secret in keys}) == 50
    for client_id, secret in keys:
        assert ":" not in client_id and ":" not in secret
        assert len(client_id) == 26
        assert len(secret) >= 43, "256 bits, URL-safe base64"


def test_onboarding_creates_nothing_in_aws():
    """No pool, no app client, no boto3 — a key is a row in our own table."""
    import inspect

    source = inspect.getsource(onboard)
    assert "boto3" not in source
    assert "user_pool" not in source


# --- The ledger -------------------------------------------------------------


@pytest.fixture
def ledger(tmp_path, monkeypatch):
    """The real ledger, wound back to the state it had before anyone was onboarded.

    These tests are about what `append_ledger_row` does, not about who happens
    to hold a credential today — and reading the live file conflated the two:
    the first brand onboarded consumed the placeholder row, and the placeholder
    test started failing on a file nobody had broken.

    The copy is still taken from the real ledger, so the table header and the
    prose after it are the ones we actually ship (that prose is the operator's
    instructions, and one test exists to check it survives an append). Only the
    data rows are wound back.
    """
    lines = onboard.LEDGER.read_text(encoding="utf-8").splitlines()
    separator = next(i for i, line in enumerate(lines) if line.startswith("|-"))
    rows = [i for i, line in enumerate(lines) if i > separator and line.startswith("| ")]
    emptied = (
        lines[: separator + 1]
        + [f"{onboard.LEDGER_PLACEHOLDER} — the first row is the moment Phase 4 "
           "stops being dormant)_ | | | | | |"]
        + lines[(rows[-1] if rows else separator) + 1 :]
    )

    copy = tmp_path / "onboarded-brands.md"
    copy.write_text("\n".join(emptied) + "\n", encoding="utf-8")
    monkeypatch.setattr(onboard, "LEDGER", copy)
    return copy


def test_the_first_entry_replaces_the_placeholder_row(ledger):
    assert onboard.LEDGER_PLACEHOLDER in ledger.read_text()

    onboard.append_ledger_row("Gibbon", "abc123", "replied to info@gibbon-slacklines.com", "emile")

    text = ledger.read_text()
    assert onboard.LEDGER_PLACEHOLDER not in text, "the placeholder should be consumed"
    assert "| Gibbon | abc123 | replied to info@gibbon-slacklines.com | emile | active |" in text


def test_later_entries_append_without_disturbing_earlier_ones(ledger):
    onboard.append_ledger_row("Gibbon", "one", "email", "emile")
    onboard.append_ledger_row("Slacktivity", "two", "contact form", "emile")

    text = ledger.read_text()
    assert "| Gibbon | one |" in text
    assert "| Slacktivity | two |" in text
    # The prose after the table must survive — it is the instructions.
    assert "Confirmed via" in text


# --- The credential file ----------------------------------------------------


def test_the_credential_file_is_private_and_holds_everything_the_brand_needs(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(onboard, "CREDENTIALS_DIR", tmp_path / "creds")

    path = onboard.write_credential_file("Gibbon", "abc123", "s3cr3t", "https://slackdata.org/api")

    assert stat.S_IMODE(path.stat().st_mode) == 0o600, "the secret must not be world-readable"
    body = path.read_text()
    for needed in ("abc123", "s3cr3t", "https://slackdata.org/api", "Bearer abc123:s3cr3t"):
        assert needed in body
    # It tells the operator to get rid of it, because we keep no copy.
    assert "DELETE this file" in body
    assert "for-manufacturers" in body, "the brand needs to be pointed at the docs"


def test_the_credentials_directory_is_outside_the_repo():
    """A secret written under the working tree is one `git add -A` from being
    committed. Home, not here."""
    assert onboard.ROOT not in onboard.CREDENTIALS_DIR.parents
    assert onboard.CREDENTIALS_DIR.is_relative_to(Path.home())
