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
# Covers Phase 1 (the catalogue is up and read-only), Phase 2 (admin auth),
# Phase 4 (the manufacturer routes exist and answer as JSON), and live editing
# (ISA sign-in configured, the public change log served, the store, media, and —
# phase 6 — the anonymous suggestion box gone). It cannot cover the
# authenticated happy paths: those need a real ISA sign-in or a brand's API key,
# which are credentials, not checks.
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
# me/brand-requests and admin/brand-requests: phase 5, the brand-link routes.
for path in submissions me me/brand-requests admin/brand-requests me/brands/1/keys; do
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
case "$INDEX" in
  *'"isa_skipped":0'*) ok "no ISA warning or certificate skipped by the last build" ;;
  *'"isa_skipped":'*) bad "GET /api/catalogue -> $(printf '%s' "$INDEX" | grep -o '"isa_skipped":[0-9]*'): a product
      silently lost its ISA warning or certificate. The Lambda log names each one
      (\"ISA warning skipped\" / \"ISA certification skipped\"); a match block's
      gearNames no longer agrees with the product's brand and name." ;;
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
echo "Media is served from /media (live editing, phase 4)"
MANIFEST="$(curl -s "$API/media/manifest")"
case "$MANIFEST" in
  *'"base":"/media"'*) ok "GET /api/media/manifest -> base /media" ;;
  *) bad "GET /api/media/manifest -> no base /media. MEDIA_BASE_URL is not set on the
      Lambda, or the route is missing: every photo on the site points elsewhere." ;;
esac
# The first photo the manifest names: served from the media bucket, as WebP,
# with the headers that stop it being read as anything else (hazard 3).
KEY="$(printf '%s' "$MANIFEST" | grep -oE '"large":"[^"]+"' | head -1 | cut -d'"' -f4)"
if [ -z "$KEY" ]; then
  warn "the manifest names no photo yet — run the migration (slack_data/media/migrate.py)"
else
  HEADERS="$(curl -sI "$SITE/media/$KEY")"
  case "$HEADERS" in
    *" 200"*) ok "GET /media/$KEY -> 200" ;;
    *) bad "GET /media/$KEY -> not 200. The /media/* behaviour or the bucket policy is missing,
      or the migration has not copied the files." ;;
  esac
  printf '%s' "$HEADERS" | grep -qi '^x-content-type-options: nosniff' \
    && ok "/media/* carries nosniff" \
    || bad "/media/* has no X-Content-Type-Options: nosniff (MediaHeadersPolicy)"
  printf '%s' "$HEADERS" | grep -qi '^content-type: image/' \
    && ok "/media/* serves a photo as an image type" \
    || bad "/media/$KEY is not served as an image"
fi
# Hosted, the API's local stand-ins must not exist.
STATUS="$(code -X POST "$API/media/uploads/0123456789abcdef0123456789abcdef")"
case "$STATUS" in
  404) ok "POST /api/media/uploads/… -> 404 (the local upload stand-in is off)" ;;
  *) bad "POST /api/media/uploads/… -> $STATUS (expected 404): the local stand-in is live hosted" ;;
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
echo "The anonymous suggestion box is gone (live editing phase 6, D56)"
BODY='{"gear_type":"webbings","gear_id":1,"changes":{"weight":"71"}}'
STATUS="$(code -X POST -H 'Content-Type: application/json' -d "$BODY" "$API/submissions")"
case "$STATUS" in
  405|401) ok "POST /api/submissions -> $STATUS (no public write; editing needs a sign-in)" ;;
  201) bad "POST /api/submissions -> 201 without a sign-in. The retired public box is
      still live, and that suggestion was stored — the function is an old build." ;;
  *)   warn "POST /api/submissions -> $STATUS (expected 405)." ;;
esac
ASSET="$(curl -s "$SITE/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)"
if [ -n "$ASSET" ] && curl -s "$SITE$ASSET" | grep -q 'challenges\.cloudflare\.com'; then
  warn "the deployed bundle still loads the Turnstile widget — half B is an old build."
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "VERIFY FAILED — the deploy is live and something above is wrong."
  exit 1
fi
echo "Verified."
exit 0
