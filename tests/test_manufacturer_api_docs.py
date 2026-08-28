"""`MANUFACTURER_API.md` is the contract. These tests hold the API to it.

The direction matters and is the opposite of most documentation tests. This is
not "check the docs describe the code" — it is **the published document is what
we promised a brand, and the code has to keep that promise.** A brand writes an
integration from that file, ships it, and runs it nightly; if the file says a
key is accepted and the API refuses it, the brand's build breaks and they have
no way to see why except by asking us.

So the failures here read as "the API no longer does what we published", not as
"someone forgot to update a doc".

Three things are pinned:

1. **The field lists.** § 6 writes out, per gear type, the keys `changes`
   accepts — and the promise in § 2 is that they are the *same* keys
   `?include=spec` hands back, so a brand can post the payload straight back.
   Both directions are checked: a key we accept but never documented is
   invisible, and a key we documented but refuse is a 422 nobody can diagnose.

2. **The round trip, literally.** § 2 promises the spec payload can be posted
   back "verbatim, nulls and all". That sentence is worth a test rather than a
   proofread: it is the one claim that fails if the read and the write ever
   diverge by a single key, and it is the workflow every integration is built
   around.

3. **The status codes.** § 5 tabulates them. A code the API can return and the
   table omits is a brand handling it as "unknown error".

The convenience lists in § 6 exist because a brand reading in a browser should
not have to make an API call to learn the field names. `manufacturer_fields()`
in `slack_data/submissions/fields.py` is the single set both the read and the
write are computed from, and it is what these tests compare the document to.
"""

import re
from pathlib import Path

import pytest

from slack_data.models.brand_clients import BrandClient, BrandPermission
from slack_data.models.brands import Brand
from slack_data.models.webbing import FiberMaterial, Webbing
from slack_data.submissions.fields import (
    CORRECTABLE_FIELDS,
    MANUFACTURER_EXCLUDED,
    manufacturer_fields,
)

DOC = Path(__file__).parent.parent / "MANUFACTURER_API.md"

CLIENT_ID = "doc-client"


# --- Parsing the published document -----------------------------------------


def _section(title: str) -> str:
    text = DOC.read_text(encoding="utf-8")
    start = text.index(title)
    nxt = text.find("\n## ", start + len(title))
    return text[start : nxt if nxt != -1 else len(text)]


def documented_fields() -> dict[str, set[str]]:
    """The per-type bullet lists out of § 6.

    `tricklinekits` says "same as `starterkits`" rather than repeating sixteen
    names, so that one is resolved rather than parsed.
    """
    section = _section("## 6. Gear types and field names")
    documented: dict[str, set[str] | tuple] = {}

    for match in re.finditer(
        r"^- \*\*`(\w+)`\*\* — (.+?)(?=\n- \*\*|\n\n)", section, re.DOTALL | re.MULTILINE
    ):
        slug, body = match.group(1), match.group(2)
        referent = re.search(r"same as `(\w+)`", body)
        documented[slug] = ("alias", referent.group(1)) if referent else set(
            re.findall(r"`(\w+)`", body)
        )

    for slug, value in list(documented.items()):
        if isinstance(value, tuple):
            documented[slug] = documented[value[1]]
    return documented


def documented_status_codes() -> set[int]:
    """The codes tabulated in § 5."""
    section = _section("## 5. Status codes")
    return {int(code) for code in re.findall(r"^\|\s*\**(\d{3})\**\s*\|", section, re.MULTILINE)}


def test_the_parser_found_the_document():
    """Guards every assertion below from passing on an empty parse."""
    documented = documented_fields()
    assert set(documented) == set(CORRECTABLE_FIELDS), (
        "MANUFACTURER_API.md documents a different set of gear types than the API serves"
    )
    for slug, names in documented.items():
        assert len(names) > 5, f"only parsed {names} for {slug} — § 6's format changed"
    assert len(documented_status_codes()) > 5, "§ 5's table did not parse"


# --- 1. The field lists -----------------------------------------------------


def test_the_document_says_the_name_keys_are_not_changes_keys():
    """§ 6's lists are `changes` keys, and neither name-shaped key is one.

    `name` and `rename_to` sit on the row and on the item instead, so a reader
    counting the keys of a spec payload must not be looking for them in these
    lists. That sentence is load-bearing; without it the lists look incomplete.
    """
    section = _section("## 6. Gear types and field names")
    assert "`name` and `rename_to` are **not** in these lists" in section
    assert MANUFACTURER_EXCLUDED == {"name"}, (
        "the manufacturer-excluded set changed; § 6's sentence names `name` specifically"
    )


@pytest.mark.parametrize("slug", sorted(CORRECTABLE_FIELDS))
def test_every_documented_field_is_one_the_api_accepts(slug):
    """A key we published and then refuse is a 422 the brand cannot diagnose."""
    extra = documented_fields()[slug] - manufacturer_fields(slug)
    assert not extra, (
        f"MANUFACTURER_API.md § 6 offers {slug} field(s) the API rejects: {sorted(extra)}."
        " Either the API lost a field brands were told to send, or the document is wrong."
    )


@pytest.mark.parametrize("slug", sorted(CORRECTABLE_FIELDS))
def test_every_field_the_api_accepts_is_documented(slug):
    """A key we accept but never published is one no brand will ever send."""
    missing = manufacturer_fields(slug) - documented_fields()[slug]
    assert not missing, (
        f"MANUFACTURER_API.md § 6 omits {slug} field(s) the API accepts: {sorted(missing)}."
        " Brands cannot discover these; add them to the list."
    )


# --- 3. The status codes ----------------------------------------------------


def test_every_status_the_manufacturer_api_can_return_is_documented():
    """Scraped from the two modules that raise them, so a new refusal shows up
    here rather than reaching a brand as an undocumented code."""
    sources = [
        Path(__file__).parent.parent / "slack_data" / "api" / "routers" / "manufacturer_router.py",
        Path(__file__).parent.parent / "slack_data" / "manufacturers" / "matching.py",
    ]
    raised = set()
    for path in sources:
        text = path.read_text(encoding="utf-8")
        raised |= {int(code) for code in re.findall(r"status\.HTTP_(\d{3})_", text)}
        raised |= {int(code) for code in re.findall(r"^\s*status_code = (\d{3})$", text, re.MULTILINE)}

    # 400 is MatchError's base default and is never raised on its own — every
    # concrete subclass overrides it. Documenting it would describe a state the
    # API cannot reach.
    raised.discard(400)

    undocumented = raised - documented_status_codes()
    assert not undocumented, (
        f"the manufacturer API can return {sorted(undocumented)}, which § 5 does not list."
        " A brand meets those as 'unknown error'."
    )


# --- 2. The round trip, literally -------------------------------------------


@pytest.fixture
def brand(session):
    row = Brand(name="Doc Brand")
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@pytest.fixture
def brand_clients(brand):
    """Overrides conftest's empty store: one client, mapped to this brand."""
    from slack_data.manufacturers.clients import InMemoryBrandClientRepository

    store = InMemoryBrandClientRepository()
    store.put(
        BrandClient(
            client_id=CLIENT_ID, brand_id=brand.id, brand_name=brand.name,
            permissions=[BrandPermission.SUGGEST], active=True,
            created_at="2026-08-27T00:00:00Z",
        )
    )
    return store


@pytest.fixture
def webbing(session, brand):
    row = Webbing(
        name="Doc Webbing", brand_id=brand.id, width=25, weight=70.0,
        material=[FiberMaterial.POLYESTER], breaking_strength=30.0,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _headers():
    from slack_data.api import auth

    return {"Authorization": f"Bearer {auth.MANUFACTURER_DEV_TOKEN}:{CLIENT_ID}"}


def test_the_spec_payload_posts_back_verbatim_nulls_and_all(client, webbing):
    """§ 2: "read the dict, change what is wrong, post it back — verbatim, nulls
    and all. You never have to filter the payload before sending it."

    The existing round-trip test in `test_manufacturer_api.py` strips the nulls
    before posting. That is the safe thing for an integration to do and the
    wrong thing to test, because it is exactly the filtering this sentence
    promises is unnecessary — including the `rename_to: null` that every payload
    carries.
    """
    rows = client.get(
        "/manufacturer/gear?gear_type=webbings&include=spec", headers=_headers()
    ).json()
    spec = dict(rows[0]["spec"])
    assert "name" not in spec, "the name is the row's, not a spec value"
    assert rows[0]["rename_to"] is None, "the rename slot rides on the row"
    assert rows[0]["name"] == "Doc Webbing"

    spec["weight"] = 71.5  # the one real edit

    response = client.post(
        "/manufacturer/gear",
        json={"items": [{
            "gear_type": "webbings", "gear_id": rows[0]["gear_id"],
            "name": rows[0]["name"], "changes": spec,
        }]},
        headers=_headers(),
    )
    assert response.status_code == 201, response.json()
    assert response.json()["results"][0]["gear_id"] == webbing.id


def test_posting_the_spec_back_completely_untouched_is_not_an_error(client, webbing):
    """The nightly-run case: an integration re-sends what it read, unchanged.

    Nothing has changed, so there is nothing to store — but § 2 promises the
    payload is safe to send, so this must not be a *failure*. A note carries it:
    that is the documented way to say "nothing changed, but here I am".
    """
    rows = client.get(
        "/manufacturer/gear?gear_type=webbings&include=spec", headers=_headers()
    ).json()

    response = client.post(
        "/manufacturer/gear",
        json={"items": [{
            "gear_type": "webbings", "gear_id": rows[0]["gear_id"],
            "name": rows[0]["name"], "changes": dict(rows[0]["spec"]),
            "note": "nightly sync, nothing changed",
        }]},
        headers=_headers(),
    )
    assert response.status_code == 201, response.json()


def test_the_documented_rename_shape_is_the_one_that_works(client, webbing):
    """§ 3 § Renaming a product, exactly as written there."""
    response = client.post(
        "/manufacturer/gear",
        json={"items": [{
            "gear_type": "webbings", "gear_id": webbing.id, "name": "Doc Webbing",
            "rename_to": "Doc Webbing II",
        }]},
        headers=_headers(),
    )
    assert response.status_code == 201, response.json()

    stored = client.get("/manufacturer/submissions", headers=_headers()).json()
    assert stored[0]["changes"]["name"] == "Doc Webbing II", (
        "§ 3 says rename_to becomes the stored name change"
    )
