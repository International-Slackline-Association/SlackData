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
    """Defect 2b — the collision, restored by re-declaring the un-slashed route
    as an event and deleting the hand-written resource that gives it its own id."""
    broken = template.replace(
        "      - httpApi: 'POST /submissions/'",
        "      - httpApi: 'POST /submissions'\n      - httpApi: 'POST /submissions/'",
        1,
    )
    start = broken.index("    HttpApiRoutePostSubmissionsNoSlash:")
    end = broken.index("    # ---- Submissions store (Phase 2)", start)
    broken = broken[:start] + broken[end:]

    found = check_routes.problems(broken)
    assert any("COLLISION" in line for line in found), found


def test_catches_a_throttle_for_a_route_nobody_declares(template: str) -> None:
    """The general case of 2b: a RouteSettings key with no route behind it.

    This is what API Gateway 404s on, and it is how any future throttled route
    will fail if someone adds the setting and forgets the event.
    """
    broken = template.replace("      - httpApi: 'POST /manufacturer/gear'\n", "", 1)

    found = check_routes.problems(broken)
    assert any("ORPHANED" in line and "POST /manufacturer/gear" in line for line in found), found
