"""
Tests for the FX rates endpoint (`GET /fx/rates`) and `slack_data.utilities.fx`.

The catalogue stores every price as sold, in the seller's own currency — 471
priced items across 14 currencies. Nothing about that changes; conversion is a
display layer, and this endpoint is the only thing that feeds it. That makes it
load-bearing in an unusual way:

    If this endpoint is wrong, every price on the site is wrong.
    If this endpoint is DOWN, the site must still render every price.

So the tests below care about two things above correctness of the happy path:

1. **It must never fail.** Upstream 500s, network errors, malformed JSON and
   partial tables all have to come back 200 with usable rates and `stale: true`.
   A 5xx here would blank the price on every card.
2. **It must not hammer the provider.** Rates are cached in a module-level dict
   with a TTL — the only caching that works under the hosted read-only Lambda
   filesystem (`CATALOG_DB_PATH`, `mode=ro&immutable=1`), where nothing can be
   written to disk or to the database.

The upstream HTTP call is monkeypatched throughout via `fx._fetch_upstream`, so
no test here touches the network. `fx.reset_cache()` runs before every test —
the cache is module state and would otherwise leak across tests.
"""

import json
import pathlib
import re
from datetime import date

import pytest

from slack_data.utilities import fx


# The 14 currencies the seeded catalogue actually prices in, confirmed against
# the dev database. Anything outside this set has no gear behind it.
CATALOGUE_CURRENCIES = {
    "BRL", "CAD", "CHF", "CZK", "EUR", "GBP", "ILS",
    "INR", "MXN", "NZD", "PLN", "RUB", "USD", "ZAR",
}

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture(autouse=True)
def clear_fx_cache():
    """The rate cache is module state — reset it around every test."""
    fx.reset_cache()
    yield
    fx.reset_cache()


@pytest.fixture
def upstream(monkeypatch):
    """
    Replace the HTTP call with a controllable stub.

    Returns the stub, which records `.calls` and can be told to raise or to
    return a specific table — so cache behaviour is observable without timing
    or network flakiness.
    """

    class Stub:
        def __init__(self):
            self.calls = 0
            self.rates = {"EUR": 1.0, "USD": 1.10, "GBP": 0.85, "INR": 92.0}
            self.date = "2026-08-07"
            self.error: Exception | None = None

        def __call__(self):
            self.calls += 1
            if self.error is not None:
                raise self.error
            return dict(self.rates), self.date

    stub = Stub()
    monkeypatch.setattr(fx, "_fetch_upstream", stub)
    return stub


@pytest.fixture
def clock(monkeypatch):
    """Controllable monotonic clock so TTL expiry is testable without sleeping."""

    class Clock:
        def __init__(self):
            self.t = 1000.0

        def __call__(self):
            return self.t

        def advance(self, seconds):
            self.t += seconds

    c = Clock()
    monkeypatch.setattr(fx, "_now", c)
    return c


# ── Response shape ────────────────────────────────────────────────────────────

def test_rates_endpoint_returns_the_documented_shape(client, upstream):
    r = client.get("/fx/rates")
    assert r.status_code == 200
    body = r.json()

    assert body["base"] == "EUR"
    assert isinstance(body["rates"], dict)
    assert isinstance(body["date"], str)
    assert isinstance(body["source"], str) and body["source"]
    assert isinstance(body["stale"], bool)
    assert "detected_currency" in body


def test_base_currency_rate_is_exactly_one(client, upstream):
    """
    Rates are EUR-based and the frontend divides by rates[item.currency]. A EUR
    rate of anything but 1.0 would silently rescale the entire catalogue.
    """
    assert client.get("/fx/rates").json()["rates"]["EUR"] == 1.0


def test_every_catalogue_currency_is_present_and_positive(client, upstream):
    """
    The stub upstream only knows 4 currencies. The other 10 must be filled from
    the fallback table, because an item priced in a missing currency cannot be
    converted at all — it would render as a blank or a NaN price.
    """
    rates = client.get("/fx/rates").json()["rates"]
    missing = CATALOGUE_CURRENCIES - rates.keys()
    assert not missing, f"no rate for catalogue currencies: {sorted(missing)}"
    assert all(rates[c] > 0 for c in CATALOGUE_CURRENCIES)


def test_date_is_iso_formatted(client, upstream):
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", client.get("/fx/rates").json()["date"])


# ── Caching ───────────────────────────────────────────────────────────────────

def test_repeat_requests_inside_the_ttl_hit_upstream_once(client, upstream, clock):
    for _ in range(5):
        assert client.get("/fx/rates").status_code == 200
    assert upstream.calls == 1, "rates must be cached, not refetched per request"


def test_cache_expires_after_the_ttl(client, upstream, clock):
    client.get("/fx/rates")
    clock.advance(fx.ttl_seconds() + 1)
    client.get("/fx/rates")
    assert upstream.calls == 2


def test_cache_survives_right_up_to_the_ttl_boundary(client, upstream, clock):
    client.get("/fx/rates")
    clock.advance(fx.ttl_seconds() - 1)
    client.get("/fx/rates")
    assert upstream.calls == 1


def test_refreshed_rates_replace_the_cached_ones(client, upstream, clock):
    assert client.get("/fx/rates").json()["rates"]["USD"] == 1.10
    upstream.rates = {**upstream.rates, "USD": 1.25}
    clock.advance(fx.ttl_seconds() + 1)
    assert client.get("/fx/rates").json()["rates"]["USD"] == 1.25


# ── Degraded modes: the endpoint must never fail ──────────────────────────────

def test_upstream_error_serves_the_fallback_table_marked_stale(client, upstream):
    upstream.error = RuntimeError("provider 503")

    r = client.get("/fx/rates")

    assert r.status_code == 200, "a rate outage must not blank every price on the site"
    body = r.json()
    assert body["stale"] is True
    assert CATALOGUE_CURRENCIES <= body["rates"].keys()
    assert body["rates"]["EUR"] == 1.0


def test_network_error_is_not_a_500(client, upstream):
    upstream.error = OSError("name resolution failed")
    assert client.get("/fx/rates").status_code == 200


def test_malformed_upstream_payload_falls_back(client, upstream):
    upstream.error = ValueError("Expecting value: line 1 column 1 (char 0)")
    body = client.get("/fx/rates").json()
    assert body["stale"] is True
    assert CATALOGUE_CURRENCIES <= body["rates"].keys()


def test_partial_upstream_table_is_filled_from_the_fallback(client, upstream):
    """
    A provider that drops a currency mid-flight is the sneakiest failure: the
    response is a valid 200 with a plausible table, and only the items priced in
    the dropped currency break. Gaps get filled rather than propagated.
    """
    upstream.rates = {"EUR": 1.0, "USD": 1.10}  # no INR, no RUB, ...

    body = client.get("/fx/rates").json()

    assert CATALOGUE_CURRENCIES <= body["rates"].keys()
    assert body["rates"]["USD"] == 1.10, "live values still win where present"
    assert body["rates"]["INR"] == fx.FALLBACK_RATES["INR"]
    assert body["stale"] is False, "a filled gap is not a stale table"


def test_upstream_without_the_base_currency_is_rejected_as_unusable(client, upstream):
    """A table with no EUR anchor cannot be normalized — treat it as an outage."""
    upstream.rates = {"USD": 1.10, "GBP": 0.85}

    body = client.get("/fx/rates").json()

    assert body["stale"] is True
    assert body["rates"]["EUR"] == 1.0


def test_upstream_with_nonsense_values_is_rejected(client, upstream):
    """Zero and negative rates would produce infinities and negative prices."""
    upstream.rates = {"EUR": 1.0, "USD": 0.0, "GBP": -2.0, "INR": 92.0}

    rates = client.get("/fx/rates").json()["rates"]

    assert rates["USD"] == fx.FALLBACK_RATES["USD"]
    assert rates["GBP"] == fx.FALLBACK_RATES["GBP"]
    assert rates["INR"] == 92.0, "valid entries in the same payload still apply"


# ── Caching headers ───────────────────────────────────────────────────────────

def test_response_is_cacheable_by_the_browser(client, upstream):
    """
    The hosted /api/* CloudFront behaviour uses the managed CachingDisabled
    policy, so the browser cache is the only one in front of Lambda.
    """
    cc = client.get("/fx/rates").headers.get("cache-control", "")
    assert "max-age" in cc
    assert int(re.search(r"max-age=(\d+)", cc).group(1)) > 0


# ── Geo detection (optional CloudFront enhancement) ───────────────────────────

def test_detected_currency_is_null_without_the_cloudfront_header(client, upstream):
    """Local dev and Cypress never see the header; the frontend detects instead."""
    assert client.get("/fx/rates").json()["detected_currency"] is None


def test_detected_currency_resolves_from_the_cloudfront_viewer_country(client, upstream):
    for country, expected in [("DE", "EUR"), ("US", "USD"), ("GB", "GBP"), ("CZ", "CZK")]:
        body = client.get("/fx/rates", headers={"CloudFront-Viewer-Country": country}).json()
        assert body["detected_currency"] == expected, country


def test_unknown_viewer_country_detects_nothing_rather_than_guessing(client, upstream):
    body = client.get("/fx/rates", headers={"CloudFront-Viewer-Country": "ZZ"}).json()
    assert body["detected_currency"] is None


# ── Date parsing ──────────────────────────────────────────────────────────────
# These call `fx._parse_date` directly rather than going through the endpoint,
# because the `upstream` fixture stubs `_fetch_upstream` — which is where date
# parsing lives. Without them the suite is green while the shipped date reads
# "Fri, 07 Au": providers disagree on this field, and open.er-api.com (our
# provider) does not send `date` at all.

def test_parses_an_iso_date_field():
    assert fx._parse_date({"date": "2026-08-07"}) == "2026-08-07"


def test_parses_an_iso_datetime_field():
    assert fx._parse_date({"date": "2026-08-07T12:30:00Z"}) == "2026-08-07"


def test_parses_the_rfc_1123_field_our_provider_actually_sends():
    payload = {"time_last_update_utc": "Fri, 07 Aug 2026 00:02:31 +0000"}
    assert fx._parse_date(payload) == "2026-08-07"


def test_parses_a_unix_timestamp_field():
    assert fx._parse_date({"time_last_update_unix": 1786060800}) == "2026-08-07"


def test_prefers_a_real_date_over_a_malformed_one():
    payload = {"date": "not a date", "time_last_update_unix": 1786060800}
    assert fx._parse_date(payload) == "2026-08-07"


def test_falls_back_to_today_when_no_date_is_offered():
    assert fx._parse_date({}) == date.today().isoformat()


def test_every_parsed_date_is_iso_formatted():
    """The invariant that matters — whatever the provider sends, the API is ISO."""
    payloads = [
        {"date": "2026-08-07"},
        {"time_last_update_utc": "Fri, 07 Aug 2026 00:02:31 +0000"},
        {"time_last_update_unix": 1786060800},
        {"date": ""},
        {"date": None},
        {"time_last_update_utc": "gibberish"},
        {},
    ]
    for payload in payloads:
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", fx._parse_date(payload)), payload


# ── Guard: the fallback table must cover the real data ────────────────────────

def test_fallback_covers_every_catalogue_currency():
    """
    The fallback is what the site runs on during an outage. A currency missing
    from it is an item whose price disappears exactly when things are already
    going wrong.
    """
    missing = CATALOGUE_CURRENCIES - fx.FALLBACK_RATES.keys()
    assert not missing, f"FALLBACK_RATES is missing: {sorted(missing)}"


def test_fallback_rates_are_plausible():
    """Catches a decimal-point slip or an inverted (USD-based) table."""
    assert fx.FALLBACK_RATES["EUR"] == 1.0
    assert 0.5 < fx.FALLBACK_RATES["USD"] < 3.0
    assert 0.5 < fx.FALLBACK_RATES["GBP"] < 2.0
    assert all(v > 0 for v in fx.FALLBACK_RATES.values())


def test_seed_files_introduce_no_currency_we_cannot_convert():
    """
    The drift guard. Adding gear priced in a 15th currency is a one-line JSON
    edit that nothing else in this suite would notice — the API keeps returning
    200 and the item keeps rendering, just with an unconvertible price.

    Scans the seed JSON for `currency` keys (rollers spell it `price_unit`, a
    known loader trap — see load_rollers.py) and asserts each value is covered.
    Weblocks keep their currency inside the nested SlackDB scrape, so they are
    covered by CATALOGUE_CURRENCIES above rather than by this scan.
    """
    seeds = [
        "webbings.json", "rollers.json", "leashrings.json", "grips.json",
        "treepros.json", "starterkits.json", "tricklinekits.json",
    ]
    found: set[str] = set()

    for name in seeds:
        path = ROOT / name
        if not path.exists():
            continue
        for item in json.loads(path.read_text()):
            if not isinstance(item, dict):
                continue
            # `price_unit` is the currency in rollers.json, but "single"/"pair"
            # in treepros.json — take only values shaped like an ISO 4217 code.
            for key in ("currency", "price_unit"):
                value = item.get(key)
                if isinstance(value, str) and re.fullmatch(r"[A-Z]{3}", value):
                    found.add(value)

    uncovered = found - fx.FALLBACK_RATES.keys()
    assert not uncovered, (
        f"seed data prices in {sorted(uncovered)}, which FALLBACK_RATES cannot convert"
    )
