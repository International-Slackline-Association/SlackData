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
# This script never touches a line it has no value for.
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

# The anonymous box's Turnstile site key went with the box (live editing
# phase 6, D56). A stale one left in the file renders nothing now.
if grep -qE '^VITE_TURNSTILE_SITE_KEY=.' "$ENV_FILE"; then
  echo "  (VITE_TURNSTILE_SITE_KEY is set in $ENV_FILE but no longer used — it can go.)"
fi

echo
echo "Wrote $ENV_FILE. Now build and deploy half B:"
echo "  cd ../frontend && npm run build"
echo "  # then the s3 sync + CloudFront invalidation — see README § Deploying to live, half B"
echo "  # (the bucket is the WebBucketName output: aws cloudformation describe-stacks ...)"
