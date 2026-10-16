#!/usr/bin/env bash
#
# Deploy preflight — check the things that fail *quietly* or *halfway*.
#
#   cd infra && ./preflight.sh [--stage prod]
#
# Every check here exists because of a specific way this deploy can go wrong in
# a way you would not notice until later:
#
# - Dirty working tree      -> the Lambda image is built from the working tree,
#                              so uncommitted code ships and nothing records what.
# - Wrong AWS account       -> this repo targets the ISA's account, not a personal
#                              one. Getting this wrong is expensive to undo.
# - Route/throttle mismatch -> a RouteSettings key naming a route that does not
#                              exist 404s the stage update, and the ROLLBACK
#                              fails too, freezing the stack (2026-08-25).
# - Leftover admin pool    -> SlackData's own Cognito pool, retired by live
#                              editing (D62) but DeletionPolicy: Retain, so the
#                              deploy that drops it from the template orphans it.
#                              It holds the old brand secrets until imported
#                              (scripts/import_brand_keys_from_cognito.py).
# - Orphaned retained table -> a DeletionPolicy: Retain resource that exists in
#                              the account but not in the stack. Every later
#                              deploy is then rejected at CHANGE SET creation by
#                              AWS::EarlyValidation::ResourceExistenceCheck,
#                              which names no resource and writes no stack event
#                              — hours to diagnose cold. See README § Retained
#                              resources and the orphan trap.
#
# Exits non-zero if anything is a hard problem, so it can gate a deploy. Warnings
# alone exit 0.
set -uo pipefail

# Accepts `--stage staging` and a bare `staging`, and REFUSES anything else.
# `STAGE="${2:-prod}"` alone silently ignored `./preflight.sh staging` and
# checked prod — which the orphan-trap check below turns from harmless into
# misleading, since it then reports on the wrong stage's tables under a header
# confidently naming the stage you asked for. A stage argument that is quietly
# discarded is worse than one that is rejected.
STAGE=prod
case "${1:-}" in
  "")            ;;
  --stage)       STAGE="${2:?--stage needs a value}" ;;
  --stage=*)     STAGE="${1#--stage=}" ;;
  -*)            echo "usage: ./preflight.sh [--stage <stage>]" >&2; exit 2 ;;
  *)             STAGE="$1" ;;
esac

FAIL=0
WARN=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=1; }

echo "SlackData deploy preflight (stage: $STAGE)"
echo

# (A Turnstile check stood here until live editing phase 6 retired the
# anonymous suggestion box and its captcha, D56.)
ENV_FILE="../frontend/.env.production"

echo "API Gateway routes agree with their throttles"
#
# The 2026-08-25 failure: RouteSettings named a route key that the same template
# had not created yet, API Gateway 404'd the stage update, and the rollback
# failed too — slackdata-prod sat in UPDATE_ROLLBACK_FAILED until it was
# recovered by hand. Cheap to check, expensive to discover. Same script CI runs
# (tests/test_infra_routes.py), so the gate and the suite cannot drift.
if ROUTES="$(python3 ./check-routes.py 2>&1)"; then
  ok "every throttled route is declared, uniquely named, and waited for"
else
  bad "serverless.yml would fail to deploy:
$(printf '%s\n' "$ROUTES" | sed 's/^/      /')"
fi

echo
echo "Source state"
if [ -z "$(git -C .. status --porcelain 2>/dev/null)" ]; then
  ok "working tree is clean — the image will match a commit"
else
  bad "working tree is DIRTY — $(git -C .. status --porcelain | wc -l) changed file(s).
      The Lambda image is built from the working tree, so uncommitted code would ship
      and nothing would record which code is live. Commit first."
fi

BRANCH="$(git -C .. rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$BRANCH" = "main" ]; then
  ok "on main"
else
  warn "on branch '$BRANCH', not main"
fi

echo
echo "AWS"
if command -v aws >/dev/null 2>&1; then
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"
  if [ -n "$ACCOUNT" ] && [ "$ACCOUNT" != "None" ]; then
    ok "authenticated as account $ACCOUNT"
    warn "confirm that is the ISA's account and not a personal one before continuing"
  else
    bad "not authenticated — refresh your SSO session (aws sso login)"
  fi
else
  bad "the aws CLI is not on PATH"
fi

echo
echo "Retained resources are stack-managed (the orphan trap)"
#
# SubmissionsTable, BrandClientsTable, PeopleTable, ChangelogTable and CatalogTable are
# DeletionPolicy: Retain, correctly — each holds something git cannot regenerate. The cost is
# that a stack update which CREATES one and then fails for any unrelated reason
# rolls back everything else and leaves that resource standing, orphaned. The
# next deploy tries to create a table name that is already taken and is refused
# before a single resource is touched, with an error that names nothing.
#
# Only the DynamoDB tables can spring it: their names are account-unique.
#
# This is a live check — skipped, not failed, without AWS access, so preflight
# still runs offline.
STACK="slackdata-${STAGE}"
if command -v aws >/dev/null 2>&1 && [ -n "${ACCOUNT:-}" ] && [ "${ACCOUNT:-None}" != "None" ]; then
  # Names come from the template, so renaming a table cannot leave this checking
  # the old one.
  for pair in "SubmissionsTable:submissions" "BrandClientsTable:brand-clients" \
              "PeopleTable:people" "ChangelogTable:changelog" "CatalogTable:catalog"; do
    LOGICAL="${pair%%:*}"
    TABLE="slackdata-${pair##*:}-${STAGE}"

    if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
      ok "$TABLE does not exist yet — nothing to orphan (expected before the first deploy)"
      continue
    fi

    if aws cloudformation describe-stack-resource \
         --stack-name "$STACK" --logical-resource-id "$LOGICAL" >/dev/null 2>&1; then
      ok "$TABLE exists and is managed by $STACK"
    else
      bad "ORPHAN: $TABLE exists in this account but is NOT in $STACK.
      Every deploy from here is rejected at change-set creation by
      AWS::EarlyValidation::ResourceExistenceCheck — no stack events, no resource
      named, nothing to read. Do NOT delete the table to unblock it; it may hold
      real submissions or every brand credential mapping.
      Import it back into the stack instead: README § Retained resources and the
      orphan trap."
    fi
  done

  # SlackData's own user pool was retired by live editing (D62): people sign
  # in through the ISA's pool, brands send an API key. It was DeletionPolicy:
  # Retain, so the first deploy without it ORPHANS it rather than deleting it —
  # on purpose, because until the brands' secrets are copied out of it
  # (scripts/import_brand_keys_from_cognito.py) it is the only place they exist.
  # It cannot break a deploy, so it is a warning, never a failure.
  POOL_NAME="slackdata-admins-${STAGE}"
  FOUND_POOLS="$(aws cognito-idp list-user-pools --max-results 60 \
      --query "UserPools[?Name=='${POOL_NAME}'].Id" --output text 2>/dev/null)"
  if [ -z "$FOUND_POOLS" ]; then
    ok "no $POOL_NAME pool — nothing of SlackData's left in Cognito but the ISA's client"
  else
    for pool in $FOUND_POOLS; do
      warn "$POOL_NAME $pool still exists. SlackData no longer uses it (D62).
      1. Import the brands' secrets while it still holds them:
           python scripts/import_brand_keys_from_cognito.py --user-pool-id $pool --apply
      2. After the deploy that drops it from the template, delete it:
           aws cognito-idp delete-user-pool-domain --user-pool-id $pool --domain <its domain>
           aws cognito-idp delete-user-pool --user-pool-id $pool"
    done
  fi
else
  warn "skipped — no AWS access. This check needs the account to compare against."
fi

echo
echo "The catalogue store (live editing, phase 2)"
# While CATALOG_SOURCE is `baked` the store runs in shadow: the seeds are still
# where data is edited, and the store must match them before every deploy —
# that is the "compared on every deploy" of LIVE_EDITING_PLAN.md § 13. Once it
# is `store`, the store IS the catalogue and the seeds stop being edited, so
# there is nothing to compare against.
SOURCE="${CATALOG_SOURCE:-baked}"
if [ "$SOURCE" = "store" ]; then
  ok "CATALOG_SOURCE=store — the site reads the store; nothing to shadow-check"
elif command -v aws >/dev/null 2>&1 && [ -n "${ACCOUNT:-}" ] && [ "${ACCOUNT:-None}" != "None" ]; then
  TABLE="slackdata-catalog-${STAGE}"
  if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    warn "$TABLE does not exist yet — deploy half A, then fill it:
      CATALOG_TABLE=$TABLE python -m slack_data.catalogue.importer --apply"
  elif CHECK="$(cd .. && CATALOG_TABLE="$TABLE" SQL_ECHO=false python3 -m slack_data.catalogue.importer --check 2>&1)"; then
    ok "${CHECK##*$'\n'}"
  else
    warn "the store differs from the seeds (shadow):
$(printf '%s\n' "$CHECK" | tail -8 | sed 's/^/      /')
      Refresh it before deploying: CATALOG_TABLE=$TABLE python -m slack_data.catalogue.importer --apply"
  fi
else
  warn "skipped — no AWS access."
fi

echo
echo "Frontend build inputs (half B — these are read at BUILD time by Vite)"
# These come from the stack, via ./sync-env.sh.
for key in VITE_ISA_AUTHORITY VITE_ISA_CLIENT_ID; do
  value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
  if [ -n "$value" ]; then
    ok "$key is set"
  else
    warn "$key is EMPTY — sign-in ships as \"not configured\".
      Run ./sync-env.sh to fill it from the stack outputs, then rebuild half B."
  fi
done

echo
if [ "$FAIL" -ne 0 ]; then
  echo "PREFLIGHT FAILED — fix the ✗ items above."
  exit 1
fi
if [ "$WARN" -ne 0 ]; then
  echo "Preflight passed with warnings. Read them; some are expected on a first deploy."
else
  echo "Preflight clean."
fi
exit 0
