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
# Covers Phase 1 (the catalogue is up and read-only), Phase 2 (admin auth,
# Turnstile's two halves) and Phase 4 (the manufacturer routes exist and answer
# as JSON), and live editing's phase 1 (ISA sign-in configured, the public
# change log served). It cannot cover the authenticated happy paths: those need
# a real ISA sign-in or a brand's API key, which are credentials, not checks.
#
# ## How the Turnstile probe works, since it looks like it cannot
#
# We cannot solve a captcha from a shell, so we cannot test the happy path. We do
# not need to. `POST /submissions` with **no** captcha token separates the two
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
# Status AND content type, because "401" alone does not distinguish a JSON error
# from CloudFront handing back the SPA. Prints e.g. `401 application/json`.
code_type() { curl -s -o /dev/null -w '%{http_code} %{content_type}' "$@" | cut -d';' -f1; }

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
echo "Sign-in is wired to the ISA pool"
for path in submissions me; do
  STATUS="$(code "$API/$path")"
  if [ "$STATUS" = "401" ]; then ok "GET /api/$path -> 401 (sign-in required)"
  elif [ "$STATUS" = "503" ]; then
    bad "GET /api/$path -> 503. The function has NO ISA_USER_POOL_ID, so sign-in is
      shut and nobody can administer. Half A did not set it — check the ISA_*
      environment in serverless.yml and redeploy."
  else bad "GET /api/$path -> $STATUS (expected 401)."; fi
done

echo
echo "The catalogue store (live editing, phase 2)"
INDEX="$(curl -s "$API/catalogue")"
case "$INDEX" in
  *'"source":"store"'*) ok "GET /api/catalogue -> the site reads the store ($(printf '%s' "$INDEX" | grep -o '"version":[0-9]*'))" ;;
  *'"source":"store (shadow)"'*) ok "GET /api/catalogue -> the store runs in shadow ($(printf '%s' "$INDEX" | grep -o '"version":[0-9]*')); the site reads the baked catalogue" ;;
  *) warn "GET /api/catalogue -> no store answer: ${INDEX:0:160}
      Before phase 2's half A this is expected. After it, CATALOG_TABLE is missing
      from the function, or the store was never filled (importer --apply)." ;;
esac
echo
echo "The change log is public"
RESULT="$(code_type "$API/changes")"
case "$RESULT" in
  "200 application/json"*) ok "GET /api/changes -> 200 application/json (no sign-in needed)" ;;
  *) bad "GET /api/changes -> $RESULT (expected 200 application/json). The log is public
      by design (D3); a 401 means the route lost its openness, a 500 the store." ;;
esac

echo
echo "The manufacturer API answers as an API, not as the website"
#
# Two things at once, and the SECOND is the one worth the check.
#
# 1. The routes exist at all. A 404 here means half A shipped without them —
#    which is exactly what the live site looked like before 2026-08-25.
# 2. The body is JSON. CloudFront's CustomErrorResponses are distribution-wide,
#    so any `403 -> 200 /index.html` mapping added for SPA deep links also
#    rewrites this API's own errors — and this API returns 403 for a REVOKED
#    credential, for one without permission, and for gear belonging to another
#    brand. A brand's integration would read `200 OK` plus a page of HTML as
#    success and go on posting into the void. Deep links are handled by
#    SpaRoutingFunction on the default cache behaviour instead, which cannot
#    touch /api/*. This is the guard on that staying true.
# Checked twice: with no credential and with a junk one. They can fail
# differently — an absent Authorization header is rejected by FastAPI's security
# dependency, a malformed key by auth.py's verify_api_key.
check_manufacturer_me() {
  label="$1"; shift
  RESULT="$(code_type "$@" "$API/manufacturer/me")"
  STATUS="${RESULT%% *}"; CTYPE="${RESULT#* }"
  case "$STATUS/$CTYPE" in
    401/application/json)
      ok "GET /api/manufacturer/me $label -> 401 application/json" ;;
    404/*)
      bad "GET /api/manufacturer/me $label -> 404. The manufacturer routes are NOT
      deployed. Half A is out of date — redeploy it." ;;
    */text/html*)
      bad "GET /api/manufacturer/me $label -> $STATUS $CTYPE. CloudFront IS REWRITING API
      ERRORS INTO THE SPA. A revoked or cross-brand credential would read as 200 OK
      with a page of HTML, and a brand's integration would treat that as success.
      Remove the CustomErrorResponses mapping from the distribution." ;;
    200/*)
      bad "GET /api/manufacturer/me $label -> 200. An unauthenticated caller is being
      answered. Investigate immediately." ;;
    *)
      bad "GET /api/manufacturer/me $label -> $STATUS $CTYPE (expected 401 application/json)." ;;
  esac
}

check_manufacturer_me "unauthenticated"
check_manufacturer_me "with a junk token" -H 'Authorization: Bearer not-a-real-token'

# The write route, which is the one that is throttled by name — a 404 here after
# a green /manufacturer/me would mean the RouteSettings/route mismatch that froze
# the stack on 2026-08-25 has recurred. See infra/check-routes.py.
RESULT="$(code_type -X POST -H 'Content-Type: application/json' -d '{"items":[]}' "$API/manufacturer/gear")"
STATUS="${RESULT%% *}"; CTYPE="${RESULT#* }"
case "$STATUS/$CTYPE" in
  401/application/json) ok "POST /api/manufacturer/gear unauthenticated -> 401 application/json" ;;
  404/*) bad "POST /api/manufacturer/gear -> 404 while GET /manufacturer/me works. The
      explicit throttled route is missing from the stage. Run infra/check-routes.py." ;;
  2*|422/*) bad "POST /api/manufacturer/gear -> $STATUS WITHOUT a credential. The brand
      write endpoint is open. Investigate immediately." ;;
  *) bad "POST /api/manufacturer/gear -> $STATUS $CTYPE (expected 401 application/json)." ;;
esac

echo
echo "Turnstile — the API half"
BODY='{"gear_type":"webbings","gear_id":1,"changes":{"weight":"71"}}'
STATUS="$(code -X POST -H 'Content-Type: application/json' -d "$BODY" "$API/submissions")"
SECRET_LIVE=unknown
case "$STATUS" in
  400) ok "POST /api/submissions -> 400 (captcha rejected an absent token: the SECRET IS SET)"
       SECRET_LIVE=yes ;;
  503) bad "POST /api/submissions -> 503. TURNSTILE_SECRET is NOT set on the function,
      so EVERY submission is refused. Re-export it and redeploy half A:
        export TURNSTILE_SECRET='...' && npx serverless deploy --stage prod"
       SECRET_LIVE=no ;;
  201) bad "POST /api/submissions -> 201 without a captcha token. The abuse control is
      OFF on a public write endpoint, and that submission was stored. Investigate now."
       SECRET_LIVE=off ;;
  *)   warn "POST /api/submissions -> $STATUS (expected 400). Cannot tell whether the
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
