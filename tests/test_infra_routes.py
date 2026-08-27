"""The API Gateway route keys in `infra/serverless.yml` must agree with themselves.

This file exists because of a real outage, not a hypothetical one. On 2026-08-25
`serverless deploy --stage prod` failed with

    Unable to find Route by key POST /manufacturer/gear within the provided
    RouteSettings (404)

and the rollback failed too, freezing `slackdata-prod` in
`UPDATE_ROLLBACK_FAILED`. Two independent defects, both invisible in the YAML:

- `HttpApiStage` had no `DependsOn`, so CloudFormation was free to apply the
  stage's `RouteSettings` before the routes those settings name existed. It did.
- `POST /submissions` and `POST /submissions/` were both declared as `httpApi`
  events, and Serverless normalises them to ONE logical id. The last won; the
  un-slashed route was never created while `RouteSettings` still named it.

Nothing tested the generated template, which is why both reached production. The
check itself is `infra/check-routes.py` — shared with `infra/preflight.sh`, so
the deploy gate and CI cannot drift from each other. It reads the source rather
than a packaged template on purpose: `serverless package` resolves
`${aws:accountId}` through STS and builds the Lambda image, so it needs AWS
credentials and Docker, and a check that cannot run in CI is not a check.

The three mutation tests below are the point. A checker that only ever sees a
healthy template proves nothing about whether it would have caught the outage.
"""

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "infra" / "serverless.yml"

# The module's filename is hyphenated (it is a script first, an import second),
# so it cannot be imported by name.
_spec = importlib.util.spec_from_file_location("check_routes", ROOT / "infra" / "check-routes.py")
check_routes = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_routes)


@pytest.fixture
def template() -> str:
    return TEMPLATE.read_text(encoding="utf-8")


def test_the_live_template_is_clean(template: str) -> None:
    """The thing that actually gets deployed. Everything else here is a mutation."""
    assert check_routes.problems(template) == []


def test_every_throttled_route_is_declared_and_waited_for(template: str) -> None:
    """State the invariant directly, so a failure above says which half broke."""
    routes, throttled, depends = check_routes.parse(template)

    assert throttled, "no RouteSettings found — the parser has drifted from the template"
    for key in throttled:
        assert key in routes, f"RouteSettings names '{key}' but no route declares it"
        assert routes[key] in depends, f"HttpApiStage does not wait for {routes[key]}"


def test_logical_ids_match_serverless_v3_naming() -> None:
    """`_logical_id` reproduces naming.js; if that drifts, every check here lies.

    The middle case is the collision itself: a trailing slash contributes an
    empty path segment and therefore no characters at all.
    """
    assert check_routes._logical_id("POST /submissions") == "HttpApiRoutePostSubmissions"
    assert check_routes._logical_id("POST /submissions/") == "HttpApiRoutePostSubmissions"
    assert check_routes._logical_id("POST /manufacturer/gear") == "HttpApiRoutePostManufacturerGear"
    assert check_routes._logical_id("*") == "HttpApiRouteDefault"


# ---- The mutations: each one re-creates a defect that shipped ---------------


def test_catches_a_stage_that_does_not_wait_for_its_routes(template: str) -> None:
    """Defect 2a — the one that actually froze the stack."""
    broken = template.replace("      DependsOn:\n", "      SomethingElse:\n", 1)
    assert broken != template

    found = check_routes.problems(broken)
    assert any("UNORDERED" in line for line in found), found
    assert any("POST /manufacturer/gear" in line for line in found), found


def test_catches_two_route_keys_that_compile_to_one_resource(template: str) -> None:
    """Defect 2b — the collision. Re-created by declaring both spellings as
    events again, which is what the template did until 2026-08-25."""
    broken = template.replace(
        "      - httpApi: 'POST /submissions'",
        "      - httpApi: 'POST /submissions'\n      - httpApi: 'POST /submissions/'",
        1,
    )
    found = check_routes.problems(broken)
    assert any("COLLISION" in line for line in found), found


def test_catches_a_route_key_api_gateway_will_not_accept(template: str) -> None:
    """The one this checker did NOT catch, until it cost a deploy on 2026-08-27.

    A trailing slash leaves an empty path segment and API Gateway refuses the
    route outright — "Part of the given route key path is empty". It is legal
    YAML and a legal logical id, so nothing upstream of the create objects. The
    fault is easy to reintroduce, because the FastAPI path it mirrors *did* end
    in a slash for a year.
    """
    broken = template.replace(
        "      - httpApi: 'POST /submissions'",
        "      - httpApi: 'POST /submissions/'",
        1,
    ).replace("          'POST /submissions':", "          'POST /submissions/':", 1)

    found = check_routes.problems(broken)
    assert any("ILLEGAL" in line for line in found), found
    assert any("empty path segment" in line for line in found), found


def test_catches_a_throttle_for_a_route_nobody_declares(template: str) -> None:
    """The general case of 2b: a RouteSettings key with no route behind it.

    This is what API Gateway 404s on, and it is how any future throttled route
    will fail if someone adds the setting and forgets the event.
    """
    broken = template.replace("      - httpApi: 'POST /manufacturer/gear'\n", "", 1)

    found = check_routes.problems(broken)
    assert any("ORPHANED" in line and "POST /manufacturer/gear" in line for line in found), found


# --- CloudFront must not strip the credential off an authenticated call ------
#
# Also a real failure, on 2026-08-27: signing in to /admin on the staging site
# answered 401 "admin authentication required" with a perfectly valid Cognito
# token. `ApiOriginRequestPolicy` whitelists the headers CloudFront forwards to
# the API, and `Authorization` was not among them — so every authenticated
# request arrived anonymous. Admin triage and the ENTIRE manufacturer API were
# unreachable through the CDN, which is the only way a browser reaches them.
#
# It hid well. The API's own 401 names the caller, not the CDN, so it reads as a
# broken login; and a test that asserts "401 without a token" passes identically
# whether the auth path works or is severed, because both answer 401. Only the
# body distinguishes them ("authentication required" = no credential arrived,
# "malformed token" = one did). The whitelist is the thing worth pinning.


def test_cloudfront_forwards_the_authorization_header(template: str) -> None:
    """Without this, every authenticated request reaches the API anonymous."""
    policy = template.split("ApiOriginRequestPolicy:")[1].split("Cdn:")[0]
    headers = policy.split("HeadersConfig:")[1].split("CookiesConfig:")[0]
    assert "- Authorization" in headers, (
        "ApiOriginRequestPolicy does not forward Authorization. Admin triage "
        "and the manufacturer API will answer 401 through CloudFront even with "
        "a valid token."
    )


def test_the_api_behaviour_does_not_cache(template: str) -> None:
    """Forwarding Authorization is only safe while /api/* is uncacheable.

    `Managed-CachingDisabled`. If the API behaviour is ever given a caching
    policy while Authorization is forwarded and absent from the cache key,
    CloudFront can serve one signed-in user's response to another. That is a
    data leak, not a performance regression, so the two settings are pinned
    together and this test names the reason.
    """
    assert "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" in template, (
        "the /api/* behaviour no longer uses Managed-CachingDisabled — either "
        "restore it, or add Authorization to the cache key, or stop forwarding "
        "it (see ApiOriginRequestPolicy)."
    )
