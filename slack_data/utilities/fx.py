"""
Foreign-exchange rates for the display layer.

The catalogue stores every price as sold, in the seller's own currency. Nothing
here changes that — these rates exist so the frontend can *show* one currency
across a listing whose 471 priced items span 14 of them. See DESIGN.md
§ Currency & Prices.

Two constraints shape this module:

1. **It must never fail.** If rates are unavailable, every price on the site
   would otherwise vanish. So every failure path — network error, upstream 5xx,
   malformed JSON, a table missing the base currency, a table full of zeroes —
   lands on `FALLBACK_RATES` with `stale=True` rather than raising.

2. **It must not write anything.** Hosted deployments run on Lambda against a
   read-only, immutable SQLite catalog (see `slack_data.database`), so there is
   no disk and no database to cache into. A module-level dict with a TTL is what
   is left, and it works well: it survives every warm invocation, and a cold
   start pays exactly one upstream call.

Rates are **EUR-based** — `rates["EUR"] == 1.0` — and conversion is
`price / rates[from] * rates[to]`.
"""

import os
import re
import time
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

BASE_CURRENCY = "EUR"

# open.er-api.com: free, no API key, daily updates, and — unlike the ECB-backed
# providers, which stopped publishing RUB in 2022 — it still quotes every
# currency the catalogue prices in. Overridable so the provider can be swapped
# without a code change.
RATES_URL = os.getenv("FX_RATES_URL", "https://open.er-api.com/v6/latest/EUR")

DEFAULT_TTL_SECONDS = 12 * 60 * 60
HTTP_TIMEOUT_SECONDS = 5.0

# Last-resort table, EUR-based, captured 2026-08-01. These are not meant to be
# accurate — they are meant to keep every price on the site renderable and
# roughly right during an outage, which is why the response says `stale: true`
# when they are in play. Covers all 14 catalogue currencies plus the majors a
# viewer might select.
FALLBACK_RATES: dict[str, float] = {
    "EUR": 1.0,
    "USD": 1.09,
    "GBP": 0.85,
    "CHF": 0.94,
    "CAD": 1.48,
    "AUD": 1.64,
    "NZD": 1.79,
    "JPY": 168.0,
    "CNY": 7.85,
    "CZK": 25.2,
    "PLN": 4.28,
    "DKK": 7.46,
    "SEK": 11.4,
    "ILS": 3.95,
    "INR": 91.5,
    "BRL": 6.05,
    "MXN": 20.1,
    "ZAR": 19.8,
    "RUB": 98.0,
    "TRY": 39.5,
    "SGD": 1.44,
    "HKD": 8.51,
    "KRW": 1490.0,
    "ARS": 1180.0,
    "CLP": 1030.0,
    "COP": 4350.0,
    "PEN": 4.05,
    "BOB": 7.53,
    "UAH": 45.2,
    "BYN": 3.57,
    "IRR": 45900.0,
}

# Only needed for the optional CloudFront-Viewer-Country enhancement — the
# frontend does its own locale-based detection, which is what actually runs in
# local dev and in Cypress. Deliberately partial: an unmapped country detects
# nothing rather than guessing wrong.
COUNTRY_CURRENCY: dict[str, str] = {
    "AT": "EUR", "BE": "EUR", "CY": "EUR", "DE": "EUR", "EE": "EUR",
    "ES": "EUR", "FI": "EUR", "FR": "EUR", "GR": "EUR", "HR": "EUR",
    "IE": "EUR", "IT": "EUR", "LT": "EUR", "LU": "EUR", "LV": "EUR",
    "MT": "EUR", "NL": "EUR", "PT": "EUR", "SI": "EUR", "SK": "EUR",
    "US": "USD", "GB": "GBP", "CH": "CHF", "CA": "CAD", "AU": "AUD",
    "NZ": "NZD", "JP": "JPY", "CN": "CNY", "CZ": "CZK", "PL": "PLN",
    "DK": "DKK", "SE": "SEK", "NO": "SEK", "IL": "ILS", "IN": "INR",
    "BR": "BRL", "MX": "MXN", "ZA": "ZAR", "RU": "RUB", "TR": "TRY",
    "SG": "SGD", "HK": "HKD", "KR": "KRW", "AR": "ARS", "CL": "CLP",
    "CO": "COP", "PE": "PEN", "BO": "BOB", "UA": "UAH",
}

# (payload, fetched_at) — module state, reset by `reset_cache()` in tests.
_cache: tuple[dict, float] | None = None


def _now() -> float:
    """Monotonic clock, indirected so tests can control TTL expiry."""
    return time.monotonic()


def ttl_seconds() -> int:
    """Read at call time, not import time, so tests and env changes both work."""
    return int(os.getenv("FX_TTL_SECONDS", str(DEFAULT_TTL_SECONDS)))


def reset_cache() -> None:
    global _cache
    _cache = None


_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


def _parse_date(payload: dict) -> str:
    """
    The date the rates were published, as `YYYY-MM-DD`.

    Providers disagree on how to say this, and getting it wrong is quiet:
    open.er-api.com has no `date` field at all, only an RFC 1123
    `time_last_update_utc` ("Fri, 07 Aug 2026 00:02:31 +0000"), so naively
    truncating whatever string is there yields "Fri, 07 Au". Three shapes are
    accepted, then we give up and say today — a slightly stale date label is
    harmless, a malformed one is not.
    """
    day = payload.get("date")
    if isinstance(day, str) and _ISO_DAY.match(day):
        return day[:10]

    unix = payload.get("time_last_update_unix")
    if isinstance(unix, (int, float)) and not isinstance(unix, bool) and unix > 0:
        return datetime.fromtimestamp(unix, tz=timezone.utc).date().isoformat()

    rfc = payload.get("time_last_update_utc")
    if isinstance(rfc, str) and rfc:
        try:
            return parsedate_to_datetime(rfc).date().isoformat()
        except (TypeError, ValueError):
            pass

    return date.today().isoformat()


def _fetch_upstream() -> tuple[dict[str, float], str]:
    """
    One HTTP call to the rate provider. Returns (rates, date).

    Raises on anything unusable — the caller turns that into the fallback.
    """
    response = httpx.get(RATES_URL, timeout=HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    payload = response.json()

    rates = payload.get("rates")
    if not isinstance(rates, dict):
        raise ValueError(f"no rates in response from {RATES_URL}")

    return rates, _parse_date(payload)


def _usable(value: object) -> bool:
    """
    A rate is usable if it is a positive, finite number.

    Zero and negatives are the ones that matter: a zero rate divides into
    infinity and a negative one produces negative prices, and both would sail
    through a plain `isinstance(value, float)` check.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return value > 0 and value != float("inf")


def _merge_with_fallback(rates: dict) -> dict[str, float]:
    """
    Live values where they are usable, fallback values everywhere else.

    A provider that silently drops a currency mid-flight is the sneakiest
    failure mode available here: the response is a valid 200 with a plausible
    table, and only the items priced in the dropped currency break.
    """
    merged = dict(FALLBACK_RATES)
    for code, value in rates.items():
        if _usable(value):
            merged[str(code)] = float(value)
    merged[BASE_CURRENCY] = 1.0
    return merged


def _fallback_payload() -> dict:
    return {
        "base": BASE_CURRENCY,
        "date": date.today().isoformat(),
        "source": "fallback",
        "stale": True,
        "rates": dict(FALLBACK_RATES),
    }


def get_rates() -> dict:
    """
    The cached rate payload: `{base, date, source, stale, rates}`.

    Never raises. A failed refresh serves the fallback table rather than
    propagating — a rate outage must not blank every price on the site.
    """
    global _cache

    if _cache is not None:
        payload, fetched_at = _cache
        if _now() - fetched_at < ttl_seconds():
            return payload

    try:
        rates, day = _fetch_upstream()
        if not _usable(rates.get(BASE_CURRENCY)):
            # Without a base anchor the table cannot be normalized, so it is an
            # outage wearing a 200.
            raise ValueError(f"upstream table has no usable {BASE_CURRENCY} rate")
        payload = {
            "base": BASE_CURRENCY,
            "date": day,
            "source": RATES_URL,
            "stale": False,
            "rates": _merge_with_fallback(rates),
        }
    except Exception:
        payload = _fallback_payload()

    _cache = (payload, _now())
    return payload


def currency_for_country(country: str | None) -> str | None:
    """ISO 3166-1 alpha-2 → ISO 4217, or None when we don't know."""
    if not country:
        return None
    return COUNTRY_CURRENCY.get(country.strip().upper())
