# Deploying SlackData (serverless, Phase 1 — public read-only)

Architecture recap (see [../LAUNCH_RUNBOOK.md §0.2](../LAUNCH_RUNBOOK.md) for the full picture):

- **API** — FastAPI as a container-image **Lambda** behind an **HTTP API**. The gear catalog is
  baked into a **read-only SQLite** file inside the image at build time, so there's no database to
  run and nothing to seed on cold start.
- **Website** — the React build + images on **S3**, served through **CloudFront**.
- **One CloudFront domain** fronts both: `/*` → S3 (SPA), `/api/*` → the API (a CloudFront Function
  strips `/api` so FastAPI keeps its unprefixed routes). Same-origin ⇒ **no CORS**.

Everything is pay-per-use / ≈$0 idle. No RDS, no container left running.

## Prerequisites

- AWS credentials for the target account (the ISA's), with permission to deploy the stack.
- Docker (Serverless builds the Lambda image locally and pushes to ECR).
- Node + `npx serverless`, and Python + this repo's deps for the frontend/catalog builds.

### Serverless Framework version + account

The version is pinned in [package.json](package.json) — run `npm install` here once so
`npx serverless` resolves to the pin rather than floating to whatever major is current. This is not
housekeeping: **v4 refuses to run without an authenticated Serverless Framework account, and v3
requires no account at all.** An unpinned `npx serverless` therefore decides, silently, whether your
deploy needs a credential.

**Currently pinned to v3 (`^3`), deliberately and temporarily.** It deploys this stack with no
account, which keeps the first launch off the critical path of deciding who owns that account. Both
majors accept this `serverless.yml` unchanged — `${aws:accountId}` (v2.50+) and `provider.ecr.images`
(v2.31+) are the only version-sensitive features used, and v3.40 runs fine on Node 22.

```bash
npm install

# v3 predates AWS SSO and cannot read an `sso_session` profile — it reports a
# valid profile as "doesn't seem to be configured". The profile is fine; hand v3
# the already-resolved session as env credentials instead. Re-run after each
# `aws sso login`. (v4 resolves SSO profiles natively and needs none of this.)
unset AWS_PROFILE
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"

npx serverless deploy --stage prod
```

**Moving to v4** is a version bump plus one env var — no config changes:

```bash
# package.json: "serverless": "^4", then
npm install
export SERVERLESS_ACCESS_KEY=<key from app.serverless.com>
```

Do that reasonably soon. v3 is EOL and receives no security updates — it still bundles the
end-of-support AWS SDK v2. When you do register, **register under the ISA, not an individual**: the
signup email owns the org and receives password resets, so a personal account makes one person a
bottleneck for every future deploy.

## Deploying to live

The site is **two independently deployable halves**, and most changes only need one of them:

| What you changed | Run |
|---|---|
| Frontend code, styles, copy | **B** (build + sync + invalidate) |
| Images in `frontend/public/` | **B**, then read the image-caching warning in B3 |
| Root `*.json` gear data | **A** — the catalog is baked into the Lambda image, so it needs a rebuild |
| Python API code (`slack_data/`) | **A** |
| `serverless.yml` / infra | **A** |
| Both | **A**, then **B** |

Running the wrong half is the usual cause of "I deployed and nothing changed": a gear-data edit
needs **A**, not a frontend sync, because the data lives inside the container image.

First deployed 2026-08-17. Run these from a shell where the smoke test in *Local check before
deploying* has passed.

### Step 0 — credentials (always, both halves)

```bash
cd infra

# Serverless v3 cannot read an SSO profile (see above). The AWS CLI still can, so
# hand over the resolved session as env credentials. Re-run after `aws sso login`.
unset AWS_PROFILE
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"

aws sts get-caller-identity        # sanity: expect the ISA account
```

If that errors with an expired token, `aws sso login --profile isa-slackdata` and re-run the `eval`.

Then resolve the stack's resource names. **Derive them, don't hardcode them** — the bucket name
embeds the AWS account id, which stays out of this public repo (LAUNCH_RUNBOOK.md §2):

```bash
out() { aws cloudformation describe-stacks --stack-name slackdata-prod --region eu-central-1 \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

BUCKET=$(out WebBucketName)
DIST=$(out CdnDistributionId)
CDN=$(out CdnDomain)
echo "$BUCKET / $DIST / $CDN"
```

### A — API, data and infrastructure

Rebuilds the Lambda image (re-baking the catalog from the root `*.json`), pushes it to ECR, and
applies any `serverless.yml` change.

```bash
cd infra
npx serverless deploy --stage prod
```

Two to four minutes for a normal redeploy. Only the **first** deploy takes 15–25 minutes, because
creating the CloudFront distribution dominates it; that is done. A `serverless.yml` change that
alters the distribution can still take ~15 minutes to propagate.

### B — the website (SPA + images)

```bash
cd ../frontend
npm run build     # uses .env.production → VITE_API_URL=/api (same-origin, no CORS)
```

**B1 — fingerprinted assets, cached forever.** Vite content-hashes everything in `assets/`, so a new
build produces new filenames and an immutable cache is safe:

```bash
aws s3 sync dist/ "s3://$BUCKET" --delete \
  --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
```

**B2 — `index.html`, never cached.** This one is load-bearing: `index.html` is the only file whose
name doesn't change between builds, so if it is cached, browsers keep loading the *old* asset
filenames and your deploy appears to do nothing:

```bash
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,must-revalidate"
```

**B3 — invalidate CloudFront.**

```bash
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*'
```

> **Warning about images.** Files under `frontend/public/` (802 gear images, 71 manufacturer images)
> are **not** fingerprinted by Vite — they keep their source filenames but get B1's one-year
> immutable header. A browser that already fetched `gear-images/webbings/foo.jpg` will keep serving
> its cached copy for up to a year even after you replace the file, and `/*` invalidation does not
> reach a cache that already has it. Adding new images is fine; **replacing** one means either
> renaming it, or invalidating that exact path and accepting that already-cached browsers keep the
> old one. If image churn becomes routine, split the sync so `gear-images/` and
> `manufacturer-images/` get a short `max-age` instead.

### Verify

```bash
BASE="https://$CDN"          # or https://slackdata.org once §7 DNS is in place

curl -sI "$BASE/" | head -1                                   # 200
curl -s  "$BASE/api/webbing/?limit=1" | head -c 120           # a real row
curl -s  "$BASE/api/fx/rates" | head -c 120                   # "stale":false
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/webbing/999999"   # 404, not 200

# The catalogue publishes no write surface. Both must hold:
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/openapi.json"         # 404 — docs are off
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$BASE/api/webbing/1"  # 405 — route not mounted
```

The write routes are not registered at all in hosted mode ([slack_data/api/routing.py](../slack_data/api/routing.py)),
so `DELETE` hits a path whose only method is `GET` and Starlette answers 405 without reaching a
handler. A **200 or a 422 there is a live write endpoint** — 422 means a body was validated, which
means the route exists. The regression guard is `tests/test_read_only.py`; it fails long before a
deploy can.

To bring `/api/docs` back (e.g. behind admin auth later), set `ENABLE_DOCS=true` on the function —
it is an environment flip, not a code change.

Use **GET, not `curl -I`,** for that last one: the routers declare GET only, so HEAD returns 405 on
every API path and tells you nothing. A JSON 404 here (rather than HTML 200) is what proves
CloudFront isn't rewriting API errors into the SPA — see LAUNCH_RUNBOOK.md §1.2.

Then in a browser: the listing loads, filters work, a detail page opens, the currency selector
changes prices, and **DevTools shows no requests to `localhost:8000`** (which would mean the build
missed `.env.production`).

Cold-start errors, if the API misbehaves:

```bash
aws logs tail /aws/lambda/slackdata-prod-api --since 15m --follow
```

### Rollback

- **API / data:** `npx serverless rollback --stage prod` returns the Lambda to the previous
  deployment.
- **Website:** rebuild from the previous commit and re-run **B**. S3 holds no history, so the
  previous `dist/` is only recoverable from git.

Neither half stores state you can lose — the only durable artefacts are the S3 objects and the ECR
images.

## Local check before deploying

See [../LAUNCH_RUNBOOK.md](../LAUNCH_RUNBOOK.md) §5.1 for the full smoke test (four endpoints,
including the checks for a missing Python dep and an unbaked catalog). The short version — note the
event must be a **complete** API Gateway v2 payload; omitting `requestContext.http.sourceIp` makes
Mangum raise `KeyError: 'sourceIp'` before FastAPI is ever reached:

```bash
# Build the Lambda image and invoke it like API Gateway would (uses the AWS RIE
# built into the base image):
docker build -f ../Dockerfile.lambda -t slackdata-api ..
docker run -d --rm --name sd-smoke -p 9000:8080 slackdata-api
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{
  "version":"2.0","routeKey":"$default","rawPath":"/webbing/","rawQueryString":"limit=1",
  "headers":{"accept":"application/json","host":"example.com"},
  "requestContext":{"accountId":"123456789012","apiId":"abc","domainName":"example.com",
    "stage":"$default","requestId":"r1","timeEpoch":1767225600000,
    "http":{"method":"GET","path":"/webbing/","protocol":"HTTP/1.1",
            "sourceIp":"1.2.3.4","userAgent":"smoke"}},
  "isBase64Encoded":false}'
docker rm -f sd-smoke
```

## Not in Phase 1 (added later, additively)

- **Submissions** (suggest-an-item / correction forms) → a DynamoDB table + `POST` routes.
- **Admin login** to triage submissions → a single-user Cognito pool + a gated admin page.

Neither requires changing anything above — the read-only catalog and this deploy stay as-is.
