#!/usr/bin/env bash
#
# Fill frontend/.env.production from the deployed stack's outputs.
#
#   cd infra && ./sync-env.sh [stage]
#
# Solves the there-and-back-again in README § Turning Phase 2 on: two of the three
# values Vite inlines at build time do not exist until half A has created the
# Cognito pool, so they have to be read back out of CloudFormation and written
# into the env file before half B is built. Doing that by hand means copying two
# opaque identifiers between a terminal and an editor, which is exactly the kind
# of step that silently ships a half-configured frontend — and both failures are
# DARK (see the table in the README), so nobody notices.
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

out() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}

echo "Reading outputs from $STACK…"
POOL_ID="$(out AdminUserPoolId)"
CLIENT_ID="$(out AdminUserPoolClientId)"
REGION="$(aws configure get region || echo eu-central-1)"

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  echo "error: no AdminUserPoolId output on $STACK." >&2
  echo "       Has half A been deployed? (npx serverless deploy --stage $STAGE)" >&2
  exit 1
fi

AUTHORITY="https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}"

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

set_key VITE_COGNITO_AUTHORITY "$AUTHORITY"
set_key VITE_COGNITO_CLIENT_ID "$CLIENT_ID"

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
    echo
    echo "  ✗ $ENV_FILE already carries a site key, but TURNSTILE_SECRET is not set"
    echo "    in this shell. If half A was just deployed from here, the API now has"
    echo "    NO secret and will 503 every submission the form sends."
    echo "    Export TURNSTILE_SECRET and redeploy half A, or clear the site key."
    exit 1
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
