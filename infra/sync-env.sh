#!/usr/bin/env bash
#
# Fill frontend/.env.production from the deployed stack's outputs.
#
#   cd infra && ./sync-env.sh [stage]
#
# The sign-in values Vite inlines at build time — the ISA pool and SlackData's
# app client in it (LIVE_EDITING_PLAN.md D61) — are read back out of the stack's
# outputs rather than copied by hand, so the SPA and the API can never be built
# against two different clients. Both are public values. (Until 2026-10 these
# came from SlackData's own pool; that pool is gone, D62.)
#
# The Turnstile SITE key comes from Cloudflare rather than AWS, but it IS written
# here — from `$TURNSTILE_SITE_KEY` — and that is deliberate. Both Turnstile
# halves then come from one place, the deploying shell, at one moment:
#
#   TURNSTILE_SECRET    -> serverless.yml -> Lambda env  (half A)
#   TURNSTILE_SITE_KEY  -> this script -> .env.production -> bundle (half B)
#
# Leaving the site key hand-set is what lets the two drift: you set it once in a
# committed file, then months later redeploy half A from a fresh terminal with no
# secret exported, and the form now renders against an API that 503s every
# submission. Sourcing both from the same shell makes that combination require
# two separate mistakes instead of one omission. `./preflight.sh` refuses it too.
#
# This script never touches a line it has no value for, and never writes the
# secret half of anything to disk.
set -euo pipefail

STAGE="${1:-prod}"
STACK="slackdata-${STAGE}"
ENV_FILE="../frontend/.env.production"

# Resolved BEFORE any call, and passed explicitly to every one of them.
# `serverless` cannot resolve an SSO profile, so deploying means exporting raw
# credentials into the shell — which carries the keys but NOT the profile's
# region. Every unqualified aws call then errors instead of defaulting, and the
# whole script dies one line later with no output at all.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
REGION="${REGION:-eu-central-1}"

# stderr is kept, and the exit status is returned rather than swallowed. The
# guard below prints a diagnostic worth reading, and `set -e` on a failed
# command substitution would kill the script before it could ever run — so the
# one message written for this exact moment was unreachable precisely when the
# call failed. `|| true` keeps us alive long enough to say something useful.
out() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text || true
}

echo "Reading outputs from $STACK (region $REGION)…"
POOL_ID="$(out IsaUserPoolId)"
CLIENT_ID="$(out IsaClientId)"

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  echo "error: no IsaUserPoolId output on $STACK." >&2
  echo "       Has half A been deployed since live editing phase 1?" >&2
  echo "       (npx serverless deploy --stage $STAGE)" >&2
  exit 1
fi

# The ISA pool lives in eu-central-1 whatever region this stack is in.
AUTHORITY="https://cognito-idp.eu-central-1.amazonaws.com/${POOL_ID}"

# In place, key by key — the file is full of comments that explain each value,
# and rewriting it wholesale would throw them away.
set_key() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # `|` as the delimiter: the authority is a URL full of slashes.
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
  echo "  $key=${value}"
}

set_key VITE_ISA_AUTHORITY "$AUTHORITY"
set_key VITE_ISA_CLIENT_ID "$CLIENT_ID"

# The site key, from the same shell that carried the secret into half A.
if [ -n "${TURNSTILE_SITE_KEY:-}" ]; then
  set_key VITE_TURNSTILE_SITE_KEY "$TURNSTILE_SITE_KEY"
  if [ -z "${TURNSTILE_SECRET:-}" ]; then
    echo
    echo "  ✗ TURNSTILE_SITE_KEY is set but TURNSTILE_SECRET is NOT."
    echo "    That is the one combination that costs a real person their submission:"
    echo "    the form will render, and the API will answer 503 to every POST."
    echo "    Export the secret and redeploy half A before building half B."
    exit 1
  fi
else
  SITE_KEY="$(grep -E '^VITE_TURNSTILE_SITE_KEY=' "$ENV_FILE" | cut -d= -f2-)"
  if [ -n "$SITE_KEY" ] && [ -z "${TURNSTILE_SECRET:-}" ]; then
    # An empty shell is not evidence the API has no secret — it is only evidence
    # that THIS shell did not deploy half A. Someone else's did, or an earlier
    # one, and refusing on that basis blocks a correct deploy while a genuinely
    # broken one that happens to export the variable sails through. So ask the
    # deployed function what it actually holds. The shell stays the fallback for
    # when the answer cannot be fetched (no credentials, function not yet
    # created), because failing closed is the whole point of this check.
    DEPLOYED_SECRET="$(aws lambda get-function-configuration \
        --function-name "slackdata-${STAGE}-api" --region "$REGION" \
        --query 'Environment.Variables.TURNSTILE_SECRET' --output text 2>/dev/null || true)"
    case "$DEPLOYED_SECRET" in
      0x????????????????????????????*)
        echo "  ✓ TURNSTILE_SECRET is not in this shell, but slackdata-${STAGE}-api"
        echo "    already carries a well-formed one — half A was deployed elsewhere."
        ;;
      *)
        echo
        echo "  ✗ $ENV_FILE carries a site key, but no usable TURNSTILE_SECRET was"
        echo "    found in this shell OR on slackdata-${STAGE}-api. The form would"
        echo "    render and the API would reject every submission it sends."
        echo "    Export TURNSTILE_SECRET and redeploy half A, or clear the site key."
        exit 1
        ;;
    esac
  fi
  if [ -z "$SITE_KEY" ]; then
    echo
    echo "  ! VITE_TURNSTILE_SITE_KEY is empty — the suggestion form will not render"
    echo "    (and is tree-shaken out). That is fine if you are shipping it dark."
    echo "    To turn it on: export TURNSTILE_SITE_KEY=... and re-run this script."
  fi
fi

echo
echo "Wrote $ENV_FILE. Now build and deploy half B:"
echo "  cd ../frontend && npm run build"
echo "  # then the s3 sync + CloudFront invalidation — see README § Deploying to live, half B"
echo "  # (the bucket is the WebBucketName output: aws cloudformation describe-stacks ...)"
