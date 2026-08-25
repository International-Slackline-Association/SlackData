#!/usr/bin/env bash
#
# Post-deploy verification — check what is actually LIVE, not what was intended.
#
#   cd infra && ./verify-deploy.sh [https://slackdata.org]
#
# preflight.sh checks the shell you are about to deploy from. This checks the
# site afterwards, and the difference matters: every failure this catches is one
# where the intent was right and the result was not — a secret that was exported
# but not picked up, a half B built from a stale env file, a half A rolled back.
#
# ## How the Turnstile probe works, since it looks like it cannot
#
# We cannot solve a captcha from a shell, so we cannot test the happy path. We do
# not need to. `POST /submissions/` with **no** captcha token separates the two
# configurations exactly, and creates nothing either way:
#
#   secret configured    -> turnstile.verify(None) returns False  -> 400
#   secret NOT configured -> the hosted no-secret branch fires     -> 503
#
# So a 400 here is the healthy answer and a 503 is the broken one, which is the
# inverse of what it looks like. See slack_data/api/routers/submissions_router.py
# ::_check_captcha and slack_data/utilities/turnstile.py.
#
# Then we fetch the deployed JS and look for the Turnstile widget. If the bundle
# renders a captcha but the API has no secret, that is the combination that costs
# a real person their submission, and it is caught here even though both halves
# individually "deployed fine".
set -uo pipefail

SITE="${1:-https://slackdata.org}"
API="$SITE/api"
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Verifying $SITE"
echo

echo "The API is up and serving the baked catalogue"
STATUS="$(code "$API/webbing/?limit=1")"
if [ "$STATUS" = "200" ]; then ok "GET /api/webbing/ -> 200"
else bad "GET /api/webbing/ -> $STATUS (expected 200). Nothing below will be meaningful."; fi

echo
echo "The catalogue is read-only in the way routing.py intends"
STATUS="$(code -X POST -H 'Content-Type: application/json' -d '{}' "$API/webbing/")"
case "$STATUS" in
  404|405) ok "POST /api/webbing/ -> $STATUS (write routes are not mounted)" ;;
  *) bad "POST /api/webbing/ -> $STATUS. A 200 or 422 means a LIVE WRITE ENDPOINT
      on the catalogue — 422 means a body was validated. Investigate immediately." ;;
esac

STATUS="$(code "$API/openapi.json")"
if [ "$STATUS" = "404" ]; then ok "/api/openapi.json -> 404 (schema not published)"
else warn "/api/openapi.json -> $STATUS; ENABLE_DOCS may be set on the function."; fi

echo
echo "Admin auth is wired to a real pool"
STATUS="$(code "$API/submissions/")"
if [ "$STATUS" = "401" ]; then ok "GET /api/submissions/ -> 401 (authentication required)"
elif [ "$STATUS" = "503" ]; then
  bad "GET /api/submissions/ -> 503. The function has NO COGNITO_USER_POOL_ID, so
      admin auth is shut and nobody can triage. Half A did not set it — check the
      AdminUserPool resource and redeploy."
else bad "GET /api/submissions/ -> $STATUS (expected 401)."; fi

echo
echo "Turnstile — the API half"
BODY='{"gear_type":"webbings","gear_id":1,"changes":{"weight":"71"}}'
STATUS="$(code -X POST -H 'Content-Type: application/json' -d "$BODY" "$API/submissions/")"
SECRET_LIVE=unknown
case "$STATUS" in
  400) ok "POST /api/submissions/ -> 400 (captcha rejected an absent token: the SECRET IS SET)"
       SECRET_LIVE=yes ;;
  503) bad "POST /api/submissions/ -> 503. TURNSTILE_SECRET is NOT set on the function,
      so EVERY submission is refused. Re-export it and redeploy half A:
        export TURNSTILE_SECRET='...' && npx serverless deploy --stage prod"
       SECRET_LIVE=no ;;
  201) bad "POST /api/submissions/ -> 201 without a captcha token. The abuse control is
      OFF on a public write endpoint, and that submission was stored. Investigate now."
       SECRET_LIVE=off ;;
  *)   warn "POST /api/submissions/ -> $STATUS (expected 400). Cannot tell whether the
      secret is set; check the function's environment by hand." ;;
esac

echo
echo "Turnstile — the frontend half"
# Find the hashed JS bundle from index.html, then look for the widget in it.
ASSET="$(curl -s "$SITE/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)"
if [ -z "$ASSET" ]; then
  warn "could not find the JS bundle in $SITE/ — skipping the frontend check."
else
  BUNDLE="$(curl -s "$SITE$ASSET")"
  if printf '%s' "$BUNDLE" | grep -q 'challenges\.cloudflare\.com'; then
    SITEKEY_LIVE=yes
    ok "the deployed bundle loads the Turnstile widget (a site key was built in)"
  else
    SITEKEY_LIVE=no
    warn "the deployed bundle has no Turnstile widget — the suggestion form is dark.
      Deliberate if you have not turned Phase 2 on yet."
  fi

  echo
  echo "…and the two halves agree"
  if [ "$SECRET_LIVE" = "no" ] && [ "$SITEKEY_LIVE" = "yes" ]; then
    bad "MISMATCH — the live site RENDERS the suggestion form and the live API REFUSES
      every submission it sends. A visitor will solve a captcha, hit submit, and lose
      what they typed. Fix half A (export TURNSTILE_SECRET, redeploy) or rebuild half B
      without VITE_TURNSTILE_SITE_KEY."
  elif [ "$SECRET_LIVE" = "yes" ] && [ "$SITEKEY_LIVE" = "no" ]; then
    warn "the API accepts submissions but the form is not rendered, so nothing can
      reach it. Harmless, but the feature is invisible: set TURNSTILE_SITE_KEY,
      run ./sync-env.sh, rebuild, redeploy half B."
  elif [ "$SECRET_LIVE" = "yes" ] && [ "$SITEKEY_LIVE" = "yes" ]; then
    ok "both halves live — submissions work end to end"
  elif [ "$SECRET_LIVE" = "no" ] && [ "$SITEKEY_LIVE" = "no" ]; then
    ok "both halves absent — submissions are consistently dark (no user can hit the 503)"
  fi
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "VERIFY FAILED — the deploy is live and something above is wrong."
  exit 1
fi
echo "Verified."
exit 0
