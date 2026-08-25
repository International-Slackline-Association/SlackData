"""
Cloudflare Turnstile — the captcha on the public submission form.

A token that is merely *present* is not a check; it has to be redeemed against
Cloudflare, which is what this does. Chosen over reCAPTCHA because it is free,
needs no account from the submitter, and sets no advertising cookies — relevant
for an EU organisation (see SUBMISSIONS_PLAN.md § Privacy).

**Fails closed.** If `TURNSTILE_SECRET` is missing in a hosted deploy, or
Cloudflare is unreachable, verification fails and the submission is rejected.
The alternative — waving submissions through whenever the check is broken —
means a configuration slip or an upstream outage silently turns the abuse
control off, which is the one failure mode a captcha must not have. The
submissions box is not load-bearing for the catalogue: the site keeps working.

This is the opposite of the policy in `fx.py`, deliberately. A rates outage must
never blank the prices, so that module falls back; a captcha outage must never
open the door, so this one refuses.
"""

import os

import httpx

VERIFY_URL = os.getenv(
    "TURNSTILE_VERIFY_URL",
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
)
HTTP_TIMEOUT_SECONDS = 5.0


class CaptchaUnavailable(Exception):
    """Cloudflare could not be reached — a 503, not a rejection of the user."""


def is_enabled() -> bool:
    """Local dev has no secret and runs without a captcha."""
    return bool(os.getenv("TURNSTILE_SECRET"))


def verify(token: str | None) -> bool:
    """True if `token` is a valid, unredeemed Turnstile response.

    Raises `CaptchaUnavailable` if the verification service itself failed, so
    the caller can answer 503 rather than accusing the submitter.
    """
    secret = os.getenv("TURNSTILE_SECRET")
    if not secret:
        # Only reachable locally: the router requires a captcha whenever the
        # app is hosted, regardless of this function.
        return True

    if not token:
        return False

    try:
        response = httpx.post(
            VERIFY_URL,
            data={"secret": secret, "response": token},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as error:
        raise CaptchaUnavailable(str(error)) from error

    return bool(payload.get("success"))
