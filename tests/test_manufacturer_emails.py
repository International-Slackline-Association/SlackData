"""
`Brand.contact_email` — the one manufacturer field that is ours, not SlackDB's.

Every other value in manufacturers.json arrived from `slackdb.com/api/manufacturers`
and can be re-derived by re-running that enrichment. The emails cannot: they were
scraped from each manufacturer's own site by hand-checked pass, 38 of 77, and a
wrong one is invisible — it fails silently, in someone else's inbox, months later.
So the seed is checked here rather than trusted.

Two of these tests are about privacy rather than correctness, and they are the
reason this file exists at all. `models/brand_clients.py` § Privacy already draws
the line for the *other* contact_email in this codebase: a named person at a
company is personal data, so it is optional, minimised, and kept out of the
catalogue. That field lives in DynamoDB behind auth. This one is served
unauthenticated by `GET /brand/` and rendered on a public page, which is a
strictly wider exposure, so the line has to be drawn tighter:

  * `test_no_seeded_email_belongs_to_a_named_individual` — only role addresses
    (info@, sales@, support@ …) or brand-named ones (yogaslackers@gmail.com).
    Never julie@, never a personal mailbox that happens to answer brand mail.
    Three real candidates were dropped in the scrape for exactly this reason.
  * `test_the_seed_records_where_the_emails_came_from` — provenance stays
    attached to the data, so a later reader knows this column was scraped and
    when, and can judge whether it is stale or should be dropped.

See DESIGN.md § Manufacturers Page → "Contact email" for the display-side half
of the same argument (detail page only, never the 77-card grid).
"""

import json
import re
from pathlib import Path

import pytest
from sqlmodel import Session, select

from slack_data.load_data.load_manufacturers import (
    add_manufacturer_data_to_db,
    clean_manufacturer_data,
    load_manufacturers_json,
)
from slack_data.models.brands import Brand

REPO_ROOT = Path(__file__).parent.parent
BRAND_TS = REPO_ROOT / "frontend" / "src" / "types" / "brand.ts"

# Deliberately stricter than RFC 5322: these are addresses we chose to publish,
# so anything exotic enough to need the full grammar is a scrape artifact.
EMAIL_RE = re.compile(r"^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$")

# Role prefixes — a mailbox a company staffs, not a person who works there.
# Adding to this list is how you deliberately widen what may be published.
ROLE_LOCAL_PARTS = {
    "info", "support", "sales", "shop", "sklep", "eshop", "order", "orders",
    "contact", "contato", "contacto", "customers", "customerservice",
    "commerciale", "mail", "office", "hello", "admin", "enquiries",
}

# A local part may be the brand name plus one of these and still be a brand
# mailbox ("slackmountain.com@"). Anything ELSE trailing the brand name is a
# person sitting behind it — "krok.ellena@" is Krok's owner, not Krok.
BRAND_LOCAL_SUFFIXES = {
    "", "com", "shop", "info", "slack", "slackline", "slacklines", "team",
}

# Slack.fr, Slack Inov and Easy Slackline are one operation behind three brand
# names — slack.fr's own about page is titled "Slack Inov" and carries this
# address. Any OTHER repeated address is a copy-paste error, not a shared shop.
KNOWN_SHARED = {"support@slack-inov.com": {"Slack Inov", "Slack.fr"}}


@pytest.fixture(scope="module")
def entries() -> list[dict]:
    return list(load_manufacturers_json()["manufacturers"].values())


@pytest.fixture(scope="module")
def seeded_emails(entries) -> dict[str, str]:
    """brand name -> email, for the entries that actually carry one."""
    return {e["name"]: e["email"] for e in entries if e.get("email")}


@pytest.fixture(scope="module")
def alt_emails(entries) -> dict[str, str]:
    """brand name -> email_alt, for the few entries that carry a second address."""
    return {e["name"]: e["email_alt"] for e in entries if e.get("email_alt")}


def _squash(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _is_personal(brand_name: str, email: str) -> bool:
    """True if this address names a person rather than a role or the brand.

    Matched on the LOCAL PART ONLY. Matching the whole address is the obvious
    mistake and it silently defeats the test: `julie@fusionclimb.com` contains
    the brand name in its *domain*, so a whole-address check waves through
    exactly the case this exists to stop.
    """
    local = email.split("@", 1)[0]
    if set(re.split(r"[^a-z0-9]+", local)) & ROLE_LOCAL_PARTS:
        return False
    squashed_local = _squash(local)
    # The whole brand name, and its first word alone — brands shorten themselves
    # in a mailbox ("petram.slack@" for Petram Slacklines) as readily as they
    # pad themselves ("slackmountain.com@"). The suffix set is what keeps this
    # narrow: "krok.ellena@" is still Krok's first word plus a person's name.
    for stem in (_squash(brand_name), _squash(brand_name.split()[0])):
        if (
            squashed_local.startswith(stem)
            and squashed_local[len(stem):] in BRAND_LOCAL_SUFFIXES
        ):
            return False
    return True


# ---------------------------------------------------------------------------
# The seed file
# ---------------------------------------------------------------------------

def test_every_manufacturer_entry_declares_an_email_key(entries):
    """Uniform shape: unknown is an explicit null, never a missing key.

    `website`/`facebook` already follow this, and `clean_manufacturer_data`
    leans on `.get()` — so a missing key would read as None and pass silently
    while the file quietly grew two different schemas.
    """
    missing = [e["name"] for e in entries if "email" not in e]
    assert missing == [], f"entries with no `email` key: {missing}"


def test_every_seeded_email_is_syntactically_valid(seeded_emails):
    bad = {n: e for n, e in seeded_emails.items() if not EMAIL_RE.match(e)}
    assert bad == {}, f"not valid addresses: {bad}"


def test_seeded_emails_are_lowercase_and_unpadded(seeded_emails):
    """A scrape yields whatever the page had; storage should be normalised.

    Mixed case is not *wrong* per RFC, but it makes the values fail to compare
    equal, which is how a duplicate would slip past the test below.
    """
    unnormalised = {n: e for n, e in seeded_emails.items() if e != e.strip().lower()}
    assert unnormalised == {}, f"not normalised: {unnormalised}"


def test_no_seeded_email_belongs_to_a_named_individual(seeded_emails):
    """Privacy: publish role mailboxes and brand mailboxes, never people.

    `models/brand_clients.py` § Privacy makes this argument for the *private*
    contact_email; this column is served unauthenticated, so it binds harder
    here. The scrape did surface personal addresses (a first name at a brand
    domain, an owner's personal gmail beside the shop's) and they were dropped
    by hand — this test is what stops the next pass quietly restoring them.

    Allowed: a role prefix, or an address naming the brand itself.
    """
    offenders = {
        name: email
        for name, email in seeded_emails.items()
        if _is_personal(name, email)
    }
    assert offenders == {}, (
        "these look like personal mailboxes — a public page must not carry them: "
        f"{offenders}"
    )


@pytest.mark.parametrize(
    "brand, email",
    [
        ("Fusion Climb", "julie@fusionclimb.com"),          # first name at the brand domain
        ("Krok", "krok.ellena@gmail.com"),                   # the brand, then a person
        ("Acrobat Slackline", "shaigat@gmail.com"),          # an owner's personal mailbox
        ("Yoga Slackers", "poweredbyyoga@gmail.com"),        # a mailbox that isn't the brand's
        # The first-word rule widened this check; it must not have opened it.
        ("Petram Slacklines", "petram.laura@gmail.com"),     # brand's first word, then a person
    ],
)
def test_the_personal_address_check_catches_what_the_scrape_dropped(brand, email):
    """Every case here was a real hit the scrape found and discarded by hand.

    Without this, the test above is only as good as its heuristic and nothing
    says so — a check that passes because it catches nothing looks identical to
    one that passes because the data is clean.
    """
    assert _is_personal(brand, email)


@pytest.mark.parametrize(
    "brand, email",
    [
        ("Gibbon", "info@gibbon-slacklines.com"),            # role prefix
        ("Slack Mountain", "slackmountain.com@gmail.com"),   # brand + an allowed suffix
        ("Yoga Slackers", "yogaslackers@gmail.com"),         # the brand itself
        ("Krok", "krok@krok.biz"),                           # short brand, exact match
        # A brand shortens itself in a mailbox as readily as it pads itself.
        ("Petram Slacklines", "petram.slack@gmail.com"),     # first word + an allowed suffix
    ],
)
def test_the_personal_address_check_allows_brand_and_role_mailboxes(brand, email):
    assert not _is_personal(brand, email)


def test_alt_addresses_are_held_to_the_same_bar_as_the_primary(alt_emails):
    """`email_alt` is a second address the brand also answers on.

    It is not read by the loader today, so nothing publishes it — which is
    exactly why it needs pinning here. The day it is wired to a Brand column
    is the day an unguarded field would put a scraped personal mailbox on a
    public page, and by then nobody would remember it had never been checked.
    """
    for name, email in alt_emails.items():
        assert email == email.strip().lower(), f"{name}: {email!r} is not normalised"
        assert EMAIL_RE.match(email), f"{name}: {email!r} is not a valid address"
        assert not _is_personal(name, email), f"{name}: {email!r} looks personal"


def test_an_alt_address_is_not_a_copy_of_its_own_primary(entries):
    """A duplicated primary is a mistake; `email_alt` exists to hold a second."""
    for e in entries:
        if e.get("email_alt"):
            assert e["email_alt"] != e.get("email"), (
                f"{e['name']}: email_alt merely repeats email"
            )


def test_a_shared_address_is_only_ever_a_shared_operation(seeded_emails):
    """The same address on two brands means they are one business, or a bug."""
    by_email: dict[str, set[str]] = {}
    for name, email in seeded_emails.items():
        by_email.setdefault(email, set()).add(name)

    shared = {e: n for e, n in by_email.items() if len(n) > 1}
    assert shared == KNOWN_SHARED, (
        f"unexpected duplicate address(es): {set(shared) - set(KNOWN_SHARED)}"
    )


def test_the_seed_records_where_the_emails_came_from():
    """Provenance, because this column cannot be re-derived from SlackDB.

    Everything else in the file is reproducible by re-running the enrichment
    against slackdb.com. These are not, so the file has to say so itself —
    otherwise a future reader has no way to tell scraped data from sourced data.
    """
    meta = load_manufacturers_json()["metadata"]
    assert "email" in meta["enriched_fields"]
    assert meta.get("email_source"), "metadata must say where the emails came from"
    assert re.search(r"\d{4}-\d{2}-\d{2}", meta["email_source"]), (
        "email_source must carry the date the scrape ran, so staleness is visible"
    )


def test_the_recorded_coverage_matches_the_file(entries, seeded_emails):
    """`email_coverage` is a claim about the data; keep it from going stale."""
    meta = load_manufacturers_json()["metadata"]
    assert meta["email_coverage"] == f"{len(seeded_emails)}/{len(entries)}"


# ---------------------------------------------------------------------------
# The loader
# ---------------------------------------------------------------------------

def test_the_loader_maps_the_seeds_email_onto_contact_email():
    """The seed says `email`; the model says `contact_email`. Pin the mapping."""
    cleaned = clean_manufacturer_data(load_manufacturers_json())
    assert cleaned["Gibbon"]["contact_email"] == "info@gibbon-slacklines.com"


def test_a_blank_email_cleans_to_none():
    """An empty string must not overwrite a real address with "" downstream."""
    cleaned = clean_manufacturer_data(
        {"manufacturers": {"1": {"name": "Testbrand", "email": "   "}}}
    )
    assert cleaned["Testbrand"]["contact_email"] is None


def test_the_enrichment_pass_lands_contact_email_on_the_brand_row(session: Session):
    session.add(Brand(name="Gibbon"))
    session.commit()

    add_manufacturer_data_to_db(session, clean_manufacturer_data(load_manufacturers_json()))

    brand = session.exec(select(Brand).where(Brand.name == "Gibbon")).one()
    assert brand.contact_email == "info@gibbon-slacklines.com"


def test_a_hand_corrected_email_outranks_the_seed(session: Session):
    """Same fill-if-unset rule as country/website: a set value wins.

    This is what makes the field safe to correct in the DB (or, later, from a
    manufacturer account) without the next seeding run stamping over it.
    """
    session.add(Brand(name="Gibbon", contact_email="corrected@gibbon-slacklines.com"))
    session.commit()

    add_manufacturer_data_to_db(session, clean_manufacturer_data(load_manufacturers_json()))

    brand = session.exec(select(Brand).where(Brand.name == "Gibbon")).one()
    assert brand.contact_email == "corrected@gibbon-slacklines.com"


def test_a_brand_with_no_scraped_email_keeps_a_null(session: Session):
    """39 of 77 publish no address; that must stay None, not "" or a guess."""
    session.add(Brand(name="Landcruising"))
    session.commit()

    add_manufacturer_data_to_db(session, clean_manufacturer_data(load_manufacturers_json()))

    brand = session.exec(select(Brand).where(Brand.name == "Landcruising")).one()
    assert brand.contact_email is None


# ---------------------------------------------------------------------------
# The API + frontend contract
# ---------------------------------------------------------------------------

def test_contact_email_is_exposed_on_the_brand_response(client, session: Session):
    session.add(Brand(name="Gibbon", contact_email="info@gibbon-slacklines.com"))
    session.commit()

    body = client.get("/brand/").json()

    assert body[0]["contact_email"] == "info@gibbon-slacklines.com"


def test_the_frontend_brand_type_declares_contact_email():
    """CLAUDE.md's contract rule: the TS type must mirror BrandPublic.

    Checked rather than trusted for the same reason test_frontend_contract.py
    parses the TypeScript — a second copy of a field list is a second place to
    drift.
    """
    if not BRAND_TS.exists():  # pragma: no cover - the frontend is always present
        pytest.skip(f"{BRAND_TS} not found")
    assert re.search(r"^\s*contact_email:\s*string\s*\|\s*null\s*$", BRAND_TS.read_text(), re.M), (
        "frontend/src/types/brand.ts must declare `contact_email: string | null`"
    )
