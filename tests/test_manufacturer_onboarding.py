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


class _FakeCognito:
    def __init__(self):
        self.calls = []

    def create_user_pool_client(self, **kwargs):
        self.calls.append(kwargs)
        return {"UserPoolClient": {"ClientId": "abc123", "ClientSecret": "s3cr3t"}}


class _FakeBoto3:
    def __init__(self, cognito):
        self._cognito = cognito

    def client(self, service, **_):
        assert service == "cognito-idp"
        return self._cognito


def test_the_app_client_is_created_with_exactly_the_right_grant_and_scope(monkeypatch):
    """Each assertion here is a different way to hand out a broken or unsafe
    credential, and none of them announces itself."""
    fake = _FakeCognito()
    monkeypatch.setattr(onboard, "_boto3", lambda: _FakeBoto3(fake))

    client_id, secret = onboard.create_app_client("eu-central-1_POOL", "Balance Community")

    assert (client_id, secret) == ("abc123", "s3cr3t")
    (call,) = fake.calls
    assert call["UserPoolId"] == "eu-central-1_POOL"
    # A machine can hold a secret. The admin SPA client in the SAME pool must
    # not have one, and confusing the two breaks PKCE outright.
    assert call["GenerateSecret"] is True
    # No user signs in here. `code` would make this a login client.
    assert call["AllowedOAuthFlows"] == ["client_credentials"]
    # Exactly one scope: a stolen token cannot be replayed against anything else.
    assert call["AllowedOAuthScopes"] == ["slackdata/gear.write"]
    # No browser redirect exists, so no callback may.
    assert "CallbackURLs" not in call
    assert "LogoutURLs" not in call


def test_the_client_name_identifies_the_brand_in_the_console(monkeypatch):
    """The operator will one day look at this pool and need to tell the clients
    apart; `slackdata-brand-<slug>-<stage>` is what makes that possible."""
    fake = _FakeCognito()
    monkeypatch.setattr(onboard, "_boto3", lambda: _FakeBoto3(fake))

    onboard.create_app_client("pool", "Balance Community: Slackline Outfitters", stage="prod")

    assert (
        fake.calls[0]["ClientName"]
        == "slackdata-brand-balance-community-slackline-outfitters-prod"
    )


def test_a_missing_scope_says_the_resource_server_was_never_deployed(monkeypatch):
    """The likeliest real failure: half A deployed without
    DEPLOY_MANUFACTURER_API=true, so the scope is not there to grant."""

    class Boom:
        def create_user_pool_client(self, **_):
            raise RuntimeError("ScopeDoesNotExistException: no such scope")

    monkeypatch.setattr(onboard, "_boto3", lambda: _FakeBoto3(Boom()))

    with pytest.raises(onboard.OnboardError, match="DEPLOY_MANUFACTURER_API"):
        onboard.create_app_client("pool", "Gibbon")


# --- The pool must come from the stack, never from a name -------------------


def test_the_pool_is_resolved_from_stack_outputs():
    pool, token_url = onboard.resolve_pool(
        {
            "AdminUserPoolId": "eu-central-1_REAL",
            "ManufacturerTokenUrl": "https://x.auth.eu-central-1.amazoncognito.com/oauth2/token",
        }
    )
    assert pool == "eu-central-1_REAL"
    assert token_url.endswith("/oauth2/token")


def test_an_undeployed_stack_refuses_rather_than_falling_back_to_a_name():
    """Today's real state: Phase 4 is not deployed, so there is no pool output.

    The tempting fallback is to look a pool up by name — which is exactly how
    the orphaned `slackdata-admins-prod` gets chosen. So there is no fallback.
    """
    with pytest.raises(onboard.OnboardError, match="not deployed yet"):
        onboard.resolve_pool({"CdnDomain": "example.cloudfront.net"})


# --- The ledger -------------------------------------------------------------


@pytest.fixture
def ledger(tmp_path, monkeypatch):
    copy = tmp_path / "onboarded-brands.md"
    copy.write_text(onboard.LEDGER.read_text(encoding="utf-8"), encoding="utf-8")
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

    path = onboard.write_credential_file(
        "Gibbon", "abc123", "s3cr3t", "https://x/oauth2/token", "https://slackdata.org/api"
    )

    assert stat.S_IMODE(path.stat().st_mode) == 0o600, "the secret must not be world-readable"
    body = path.read_text()
    for needed in ("abc123", "s3cr3t", "https://x/oauth2/token", "slackdata/gear.write"):
        assert needed in body
    # It tells the operator to get rid of it, because we keep no copy.
    assert "DELETE this file" in body
    assert "for-manufacturers" in body, "the brand needs to be pointed at the docs"


def test_the_credentials_directory_is_outside_the_repo():
    """A secret written under the working tree is one `git add -A` from being
    committed. Home, not here."""
    assert onboard.ROOT not in onboard.CREDENTIALS_DIR.parents
    assert onboard.CREDENTIALS_DIR.is_relative_to(Path.home())
