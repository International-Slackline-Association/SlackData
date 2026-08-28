#!/usr/bin/env python3
"""Check that every throttled route key in `serverless.yml` names a real route.

    python3 infra/check-routes.py          # exit 0 if clean, 1 with diagnostics

Two deploy-breaking defects reached production on 2026-08-25 and froze the stack
in `UPDATE_ROLLBACK_FAILED`. Both are invisible in the YAML and both are checked
here:

1. **An orphaned `RouteSettings` key.** Route settings key on a *route key*, and
   API Gateway answers `Unable to find Route by key POST /manufacturer/gear
   within the provided RouteSettings (404)` if that route does not exist. It did
   not exist yet, because nothing ordered the stage after the routes — hence the
   `DependsOn` check below.
2. **A logical-id collision.** `POST /submissions` and `POST /submissions/`
   normalise to the SAME CloudFormation logical id, so declaring both as
   `httpApi` events silently produced one route and the last declaration won.
   The un-slashed spelling was named in `RouteSettings` and never created.

This runs on the SOURCE, not on a packaged template, deliberately: `serverless
package` resolves `${aws:accountId}` through STS and builds the Lambda image, so
it needs credentials and Docker. This check needs neither, which is why it can
run in CI (`tests/test_infra_routes.py`) and in `preflight.sh` alike.

What it does NOT catch is Serverless changing its own naming rules. `_logical_id`
below reproduces `naming.js::getHttpApiRouteLogicalId` at v3.40.0; if the
framework is upgraded, re-read that function.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent / "serverless.yml"


def _logical_id(route_key: str) -> str:
    """Reproduce `naming.js::getHttpApiRouteLogicalId` (serverless v3.40.0).

    `normalizePath` splits on '/' and `normalizePathPart` runs lodash
    `capitalize` (upper first char, LOWER the rest) then strips everything that
    is not alphanumeric. A trailing '/' therefore contributes an empty segment
    and no characters at all — which is the whole collision.
    """
    if route_key == "*":
        return "HttpApiRouteDefault"
    out = ""
    for part in route_key.split("/"):
        piece = (part[:1].upper() + part[1:].lower()) if part else ""
        piece = piece.replace("-", "Dash")
        piece = re.sub(r"\{(.*)\}", r"\1Var", piece)
        piece = re.sub(r"[^0-9A-Za-z]", "", piece)
        out += piece[:1].upper() + piece[1:]
    return f"HttpApiRoute{out}"


def _block(text: str, header: str, indent: int) -> str:
    """The lines under `header` that are indented deeper than `indent`.

    Hand-parsed rather than loaded with PyYAML, matching
    `tests/test_dynamo_stores.py`: the template is full of CloudFormation tags
    (`!Ref`, `!Join`) and Serverless variables (`${self:service}`) that a safe
    loader refuses, and we only need three flat lists out of it.
    """
    match = re.search(rf"^{' ' * indent}{re.escape(header)}:[ \t]*$", text, re.MULTILINE)
    if not match:
        return ""
    rest = text[match.end():]
    lines: list[str] = []
    for line in rest.splitlines()[1:] if rest.startswith("\n") else rest.splitlines():
        if line.strip() and not line.startswith(" " * (indent + 1)):
            break
        lines.append(line)
    return "\n".join(lines)


def parse(text: str) -> tuple[dict[str, str], set[str], set[str]]:
    """Return ({route key: its logical id}, throttled route keys, stage DependsOn)."""
    routes: dict[str, str] = {}

    # Routes Serverless compiles from `httpApi` events — logical id derived.
    for key in re.findall(r"^\s+- httpApi: '([^']+)'", text, re.MULTILINE):
        routes[key] = _logical_id(key)

    # Routes written out by hand in resources.Resources, which is how a route
    # key that would collide with another one gets created at all. Here the
    # logical id is whatever the author named the resource, NOT the derived one.
    for match in re.finditer(r"^    (\w+):\n      Type: AWS::ApiGatewayV2::Route\n", text, re.MULTILINE):
        tail = text[match.end():]
        end = re.search(r"^    \w+:\n      Type: ", tail, re.MULTILINE)
        body = tail[: end.start()] if end else tail
        key = re.search(r"^\s+RouteKey: '([^']+)'", body, re.MULTILINE)
        if key:
            routes[key.group(1)] = match.group(1)

    stage = _block(text, "HttpApiStage", indent=4)
    throttled = set(re.findall(r"^\s+'([^']+)':\s*$", _block(stage, "RouteSettings", indent=8), re.MULTILINE))
    depends = set(re.findall(r"^\s+- (\w+)\s*$", _block(stage, "DependsOn", indent=6), re.MULTILINE))

    return routes, throttled, depends


def problems(text: str) -> list[str]:
    routes, throttled, depends = parse(text)
    found: list[str] = []

    # 1. Two route keys that compile to one resource: the second silently wins.
    by_id: dict[str, list[str]] = {}
    for key, logical in sorted(routes.items()):
        by_id.setdefault(logical, []).append(key)
    for logical, keys in sorted(by_id.items()):
        if len(keys) > 1:
            found.append(
                f"COLLISION: {keys} both compile to `{logical}`; only the last survives. "
                "Declare one of them by hand in resources.Resources under its own logical id."
            )

    # 2. A route key API Gateway will not accept at all. A trailing slash (or
    #    any `//`) leaves an empty path segment, and the create fails with
    #    "Part of the given route key path is empty" — discovered the hard way
    #    on the first staging deploy, 2026-08-27, after this checker had passed.
    #    It is legal YAML, a legal logical id, and an illegal route.
    for key in sorted(routes):
        if key == "*":
            continue
        _, _, path = key.partition(" ")
        if not path.startswith("/") or (len(path) > 1 and path.endswith("/")) or "//" in path:
            found.append(
                f"ILLEGAL: route key {key!r} has an empty path segment. API Gateway"
                " refuses it — a route key may not end in '/' or contain '//'."
                " Note this is NOT the same as the URL clients call: FastAPI may"
                " still serve a trailing-slash path, but it cannot be throttled by name."
            )

    # 3. A throttle for a route that is never created: a 404 at deploy time.
    for key in sorted(throttled - set(routes)):
        found.append(
            f"ORPHANED: RouteSettings names '{key}', which no route declares. "
            "API Gateway rejects the whole stage update with a 404."
        )

    # 4. A throttled route the stage does not wait for: a race, lost once already.
    for key in sorted(throttled & set(routes)):
        if routes[key] not in depends:
            found.append(
                f"UNORDERED: '{key}' is throttled but `{routes[key]}` is not in "
                "HttpApiStage.DependsOn. CloudFormation may update the stage "
                "before the route exists."
            )

    return found


def main() -> int:
    text = TEMPLATE.read_text(encoding="utf-8")
    routes, throttled, depends = parse(text)
    found = problems(text)

    print(f"routes declared : {sorted(routes)}")
    print(f"routes throttled: {sorted(throttled)}")
    print(f"stage waits for : {sorted(depends)}")
    print()
    if found:
        for line in found:
            print(f"  ✗ {line}")
        print("\nThis deploy would fail. See infra/check-routes.py's docstring.")
        return 1
    print("  ✓ every throttled route is declared, uniquely named, and waited for")
    return 0


if __name__ == "__main__":
    sys.exit(main())
