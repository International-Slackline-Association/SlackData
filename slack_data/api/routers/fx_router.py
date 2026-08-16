from fastapi import APIRouter, Header, Response

from slack_data.utilities import fx

fx_router = APIRouter(
    prefix="/fx",
    tags=["fx"],
)


@fx_router.get("/rates")
def read_rates(
    response: Response,
    cloudfront_viewer_country: str | None = Header(default=None),
) -> dict:
    """
    EUR-based exchange rates for the frontend's display layer.

    The catalogue is stored in the currency each item is sold in; this is what
    lets the site show all of it in one. Conversion is
    `price / rates[from] * rates[to]`.

    This endpoint does not have a failure mode by design — a rate outage serves
    a stale fallback table (`stale: true`) rather than an error, because a 5xx
    here would blank the price on every card in the catalogue.

    `detected_currency` is a convenience, not the detection mechanism: it is
    populated only when CloudFront passes `CloudFront-Viewer-Country`, which
    requires a custom OriginRequestPolicy and is absent in local dev entirely.
    The frontend detects from the browser's own locale and treats this as a
    preferred override when present.
    """
    payload = fx.get_rates()

    # The hosted /api/* CloudFront behaviour uses the managed CachingDisabled
    # policy, so the browser cache is the only one sitting in front of Lambda.
    response.headers["Cache-Control"] = f"public, max-age={fx.ttl_seconds()}"

    return {
        **payload,
        "detected_currency": fx.currency_for_country(cloudfront_viewer_country),
    }
