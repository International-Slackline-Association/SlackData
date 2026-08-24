#!/usr/bin/env bash
#
# Deploy preflight — check the things that fail *quietly* or *halfway*.
#
#   cd infra && ./preflight.sh [--stage prod]
#
# Every check here exists because of a specific way this deploy can go wrong in
# a way you would not notice until later:
#
# - TURNSTILE_SECRET unset  -> the stack deploys fine and `POST /submissions`
#                              answers 503 forever, because turnstile.py fails
#                              CLOSED hosted. A working deploy of a dead feature.
# - Dirty working tree      -> the Lambda image is built from the working tree,
#                              so uncommitted code ships and nothing records what.
# - Wrong AWS account       -> this repo targets the ISA's account, not a personal
#                              one. Getting this wrong is expensive to undo.
# - Manufacturer API flag   -> off by default, but the permission it needed is
#                              confirmed (2026-08-24), so it SHOULD be on. Off
#                              means shipping Phase 4 dormant for no reason.
#
# Exits non-zero if anything is a hard problem, so it can gate a deploy. Warnings
# alone exit 0.
set -uo pipefail

STAGE="${2:-prod}"
FAIL=0
WARN=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=1; }

echo "SlackData deploy preflight (stage: $STAGE)"
echo

echo "Turnstile — the two halves must agree"
#
# The failure this guards is NOT "a value is missing". It is the two halves
# disagreeing, because they are applied by different halves of the deploy:
#
#   TURNSTILE_SECRET    -> your shell -> serverless.yml -> Lambda env  (half A)
#   TURNSTILE_SITE_KEY  -> your shell -> .env.production -> JS bundle  (half B)
#
# Secret missing + site key present is the one combination that costs a real
# person their submission: the form renders, they solve the challenge, they hit
# submit, and the API answers 503 because turnstile.py fails closed. It looks
# like our bug, and what they typed is gone.
#
# The secret lives only in a shell, so it is gone every new terminal — which is
# exactly how this drifts.
ENV_FILE="../frontend/.env.production"
FILE_SITE_KEY="$(grep -E '^VITE_TURNSTILE_SITE_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
SITE_KEY="${TURNSTILE_SITE_KEY:-$FILE_SITE_KEY}"

if [ -n "${TURNSTILE_SECRET:-}" ] && [ -n "$SITE_KEY" ]; then
  ok "both halves present — the suggestion form will render AND be accepted"
elif [ -n "${TURNSTILE_SECRET:-}" ] && [ -z "$SITE_KEY" ]; then
  warn "TURNSTILE_SECRET is set but there is no site key. The API will accept
      submissions, but the form is not rendered (and is tree-shaken out), so
      nothing can reach it. Harmless, but the feature is invisible.
        export TURNSTILE_SITE_KEY='0x4AAA...'   # public key, Cloudflare dashboard"
elif [ -z "${TURNSTILE_SECRET:-}" ] && [ -n "$SITE_KEY" ]; then
  bad "THE BAD ONE: a site key is set (so the form WILL render) but TURNSTILE_SECRET
      is not (so the API will 503 every submission). A visitor will fill the form in,
      solve the captcha, submit, and lose what they typed.
        export TURNSTILE_SECRET='...'   # the SECRET half, same Cloudflare widget
      Or clear VITE_TURNSTILE_SITE_KEY in $ENV_FILE to ship the feature dark."
else
  warn "neither Turnstile value is set — submissions ship DARK (form never renders).
      That is a legitimate first-deploy state. Export BOTH to turn the feature on:
        export TURNSTILE_SECRET='...' TURNSTILE_SITE_KEY='0x4AAA...'"
fi

if [ "${DEPLOY_MANUFACTURER_API:-false}" = "true" ]; then
  ok "DEPLOY_MANUFACTURER_API=true — creates the Cognito resource server (permission
      confirmed 2026-08-24). Do not also create it by hand: CloudFormation would hit a
      name conflict on identifier 'slackdata' and fail the stack."
else
  warn "DEPLOY_MANUFACTURER_API is off — Phase 4 will deploy DORMANT. That gate existed
      because cognito-idp:CreateResourceServer was believed un-granted; it is granted
      (confirmed 2026-08-24). Unless you mean to ship it dormant, deploy with
      DEPLOY_MANUFACTURER_API=true."
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
echo "Frontend build inputs (half B — these are read at BUILD time by Vite)"
# Turnstile is handled above; these two come from the stack, via ./sync-env.sh.
for key in VITE_COGNITO_AUTHORITY VITE_COGNITO_CLIENT_ID; do
  value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
  if [ -n "$value" ]; then
    ok "$key is set"
  else
    warn "$key is EMPTY — that feature ships dark (see README § Turning Phase 2 on).
      Expected on a FIRST deploy: these values only exist once half A has run.
      Afterwards, run ./sync-env.sh to fill them in, then rebuild and deploy half B."
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
