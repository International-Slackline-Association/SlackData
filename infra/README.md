# Deploying SlackData (serverless, Phase 1 — public read-only)

Architecture recap (see [../GOING_LIVE.md](../GOING_LIVE.md) for the full plan):

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

## Deploy

```bash
# 1. API + AWS resources (Lambda, HTTP API, S3, CloudFront). Builds & pushes the
#    image defined by ../Dockerfile.lambda, which bakes the read-only catalog.
cd infra
npx serverless deploy --stage prod            # add --region <r> to override

# 2. Frontend → S3, pointed at the same-origin API under /api.
cd ../frontend
VITE_API_URL=/api npm run build
aws s3 sync dist/ "s3://$(cd ../infra && npx serverless info --stage prod --verbose \
  | awk '/WebBucketName/{print $2}')" --delete

# 3. Invalidate CloudFront so the new build shows up immediately.
aws cloudfront create-invalidation --paths '/*' \
  --distribution-id "$(cd ../infra && npx serverless info --stage prod --verbose \
  | awk '/CdnDistributionId/{print $2}')"
```

The CloudFront domain is printed as the `CdnDomain` output; open it to see the live site. Point the
real domain/subdomain at that distribution once DNS + an ACM cert (in **us-east-1**) are ready — see
the `TODO(isa)` markers in [serverless.yml](serverless.yml).

## Updating the gear data

The catalog is baked into the image, so a data change = edit the root `*.json` → **redeploy step 1**
(rebuilds the image, re-bakes the catalog). No database migration, nothing stateful to touch.

## Local check before deploying

```bash
# Build the Lambda image and invoke it like API Gateway would (uses the AWS RIE
# built into the base image):
docker build -f ../Dockerfile.lambda -t slackdata-api ..
docker run --rm -p 9000:8080 slackdata-api &
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{
  "version":"2.0","routeKey":"GET /webbing/","rawPath":"/webbing/",
  "rawQueryString":"limit=1","requestContext":{"http":{"method":"GET","path":"/webbing/"}}}'
```

## Not in Phase 1 (added later, additively)

- **Submissions** (suggest-an-item / correction forms) → a DynamoDB table + `POST` routes.
- **Admin login** to triage submissions → a single-user Cognito pool + a gated admin page.

Neither requires changing anything above — the read-only catalog and this deploy stay as-is.
