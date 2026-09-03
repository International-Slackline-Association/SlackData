# Deploying SlackData (serverless — public read-only catalogue + submissions)

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
export TURNSTILE_SECRET='...'      # Phase 2 — see below. Not stored in this repo.
npx serverless deploy --stage prod
```

**`TURNSTILE_SECRET` is read from your shell at deploy time** (`${env:TURNSTILE_SECRET, ''}` in
serverless.yml), so the captcha secret never lands in git. Deploying without it exported does not
break the site: the submissions endpoint fails **closed** and answers 503, while the catalogue is
untouched. That is the intended failure mode — a captcha that silently switches itself off is worse
than one that refuses. Get the value from the Cloudflare Turnstile dashboard for `slackdata.org`.

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
# NOTE the --delete: anything in this bucket that is not build output is removed.
# That is intended (stale fingerprinted assets must go), and it is why manufacturer
# photo uploads go to slackdata-uploads-prod-* instead — see § Phase 4 uploads.
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

# Phase 2: submissions. The one *open* write endpoint, and the closed admin ones.
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/submissions"              # 401 — admin only
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer dev-admin-token' \
     "$BASE/api/submissions"                                                  # 401 — dev token is dead hosted
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/submissions" \
     -H 'Content-Type: application/json' -d '{"gear_type":"webbings","gear_id":1,"note":"test"}'
                                                                               # 400 — captcha missing (NOT 201)
```

Those last three are the Phase 2 equivalents of the write-surface check above, and the middle one
matters most: **the local dev admin token must not work on the live site.** It is a constant in this
repository, so a 200 there would mean the admin API's password is public. It returns 401 because a
pool is configured; if the pool configuration were ever lost the answer becomes 503, never 200. See
`slack_data/api/auth.py` and `tests/test_auth.py`.

A **201** on the POST would mean the captcha is not being enforced — check that `TURNSTILE_SECRET`
was exported for the deploy.

```bash
# Phase 4: the manufacturer API. Both must be JSON, not HTML.
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$BASE/api/manufacturer/me"
                                                        # 401 application/json
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
     -H 'Authorization: Bearer not-a-real-token' "$BASE/api/manufacturer/me"
                                                        # 401 application/json
```

**Check the content type, not just the status.** CloudFront's `CustomErrorResponses` are
distribution-wide, so a `403 -> 200 /index.html` mapping added for SPA deep links also rewrites the
API's own 403s — and this API returns 403 for a revoked brand credential, a credential without
permission, and gear belonging to another brand. A brand's integration would then read `200 OK` and
a page of HTML as success. That mapping has been **removed**: deep links are handled by
`SpaRoutingFunction` on the default cache behaviour instead, which cannot touch `/api/*`. If you ever
re-add a `CustomErrorResponse`, check first what the API can return with that status.

Confirm the deep-link handling still works after any distribution change — it is the thing that
mapping used to do:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/webbings/1"        # 200 — SPA route
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/admin"             # 200 — SPA route
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/assets/nope.js"    # 403/404 — a real miss, NOT 200
```

End-to-end, in a browser, once half B is deployed:

1. A gear detail page shows **Suggest a correction**. If it does not, `VITE_TURNSTILE_SITE_KEY` was
   empty at build time — see § Turning Phase 2 on.
2. The dialog shows a Cloudflare widget. Submitting gives a reference id.
3. **No email arrives, and that is correct** — the app sends none. See § No email, below.
4. `/admin` offers a Cognito sign-in (not a token prompt), and the submission is in the queue with
   its **brand** shown next to the name.
5. Approve it → a JSON patch appears with "Approved — but not live". Apply it to the root `*.json`,
   redeploy half A, then **Mark handled**.

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

## Phase 2 — submissions and admin triage

Added additively, exactly as anticipated: the read-only catalog and both deploy halves above are
unchanged. What `serverless.yml` now also creates:

| Resource | Purpose |
|---|---|
| `slackdata-submissions-prod` (DynamoDB) | The submission store. On-demand, TTL on `expires_at`, PITR on. **Not the catalogue** — that is still a read-only file in the image. |
| `status-created_at-index` (GSI) | The single query the app makes: pending, oldest first. |
| `slackdata-admins-prod` (Cognito) | One admin user, self-signup off. Created by hand, see below. |
| Route throttling | `POST /submissions` at 2/sec (burst 5); everything else 50/sec. |

The `/api/*` CloudFront behaviour needed **no change** — it already forwards all query strings and
strips the `/api` prefix, so `/api/submissions` routes correctly. Verified rather than assumed; a
distribution change would have cost ~15 minutes of propagation.

### Turning Phase 2 on — the order matters

The frontend needs three values that **do not exist until half A has run**, and Vite inlines them at
build time. So this is a there-and-back-again, not a single pass:

```bash
# 0. Preflight. Checks the things that fail quietly or halfway — an unset
#    TURNSTILE_SECRET (which deploys fine and 503s forever), a dirty working
#    tree (the image is built from it), and which AWS account you are in.
cd infra
export TURNSTILE_SECRET='...'              # Cloudflare dashboard, slackdata.org
./preflight.sh

# 1. Half A. Creates both DynamoDB tables, the Cognito pool, and the uploads bucket.
npx serverless deploy --stage prod

# 2. Read back what it created.
out() { aws cloudformation describe-stacks --stack-name slackdata-prod \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
echo "authority: https://cognito-idp.eu-central-1.amazonaws.com/$(out AdminUserPoolId)"
echo "client id: $(out AdminUserPoolClientId)"

# 3. Fill frontend/.env.production. `./sync-env.sh` writes the two Cognito values
#    in place (keeping the comments around them), plus the Turnstile SITE key
#    from $TURNSTILE_SITE_KEY — so both Turnstile halves come from this one
#    shell and cannot drift apart. See § Turnstile.
./sync-env.sh prod

# 4. Then run half B (build + sync + invalidate).
```

**The manufacturer API (Phase 4) is off by default — turn it on for this deploy.** Its Cognito
resource server needs `cognito-idp:CreateResourceServer` on your own SSO identity (not the Lambda
role, which holds no Cognito action at all). Earlier revisions of this file said that action was not
granted. **It is** — confirmed 2026-08-24 by direct API call against a throwaway pool, along with the
three tier-1 Cognito actions that had also never been exercised. So:

```bash
DEPLOY_MANUFACTURER_API=true npx serverless deploy --stage prod
```

Leave the resource to CloudFormation; do not create it by hand, or the next deploy collides with it.
With the flag off instead, the brand-clients table is still created and the routes are still
mounted — no brand can authenticate, because no app client can carry a scope that does not exist.
That is the same dormant state the API is in anyway until a brand is onboarded by hand, so
forgetting the flag costs nothing but a second stack update. See
[LAMBDA_ROLE_PERMISSIONS.md](LAMBDA_ROLE_PERMISSIONS.md) § Deploy-time permissions.

**Both of the empty values in `.env.production` fail *dark*, not loudly**, which is the behaviour to
know about before you go looking for a bug:

| Left empty | What happens |
|---|---|
| `VITE_TURNSTILE_SITE_KEY` | The suggestion form is **not rendered at all** — and is tree-shaken out of the bundle entirely. Deliberate: the API rejects every un-captcha'd submission when hosted, so shipping the form without a key would mean a visibly broken feature rather than an absent one. A console warning explains it. |
| `VITE_COGNITO_AUTHORITY` / `_CLIENT_ID` | `/admin` renders "sign-in is not configured" instead of the local dev-token prompt, which the API would reject anyway once a pool exists. |

Neither is a security control — the server enforces both independently (`utilities/turnstile.py`
fails closed, `api/auth.py` rejects the dev token whenever a pool is configured). They exist so a
half-finished deploy looks unfinished rather than broken.

### Retained resources and the orphan trap

Three resources carry `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain`, because each holds
something git cannot regenerate:

| Resource | What is lost without it |
|---|---|
| `SubmissionsTable` | what the public typed — corrections and tips |
| `BrandClientsTable` | every brand credential mapping |
| `AdminUserPool` | a real person's login, and their MFA enrolment |

Those policies are right and should stay. **The trap is their consequence.** If a stack update
creates one of them and then fails for any unrelated reason, the rollback deletes everything else and
leaves that resource standing, orphaned from the stack. Every deploy after that tries to create a
resource whose name is already taken, and CloudFormation refuses the change set before touching a
single resource.

Only the two DynamoDB tables can actually spring it — their names are account-unique. A retained user
pool collides with nothing (pool names need not be unique); it strands the admin account instead,
which is a data problem rather than a deploy one.

**A retained pool has a second cost, found on staging 2026-09-03.** Deploys stay green, so nothing
ever surfaces it, and it accumulates: the account ended up with two pools both named
`slackdata-admins-staging`. The damage is to the *manual* path — creating a brand app client in the
console (§ Onboarding policy) now offers two identical names, and picking the wrong one produces
credentials that mint tokens successfully and 401 on every request, because the API verifies against
the other pool's JWKS. `register.py --onboard` is immune (it resolves the pool from the stack's
`AdminUserPoolId` output), but the console is not.

**Tags cannot tell them apart.** CloudFormation stamps `aws:cloudformation:stack-name` at creation
and a retained resource keeps it, so a pool orphaned by an `UpdateReplacePolicy` replacement still
advertises the stack that abandoned it. The stack's output — or `describe-stack-resource
--logical-resource-id AdminUserPool` — is the only evidence of ownership. `preflight.sh` checks this
for `slackdata-admins-<stage>` on every run.

Removing a whole stage is `npx serverless remove --stage <stage>`, **not** deleting its resources by
hand — deleting a stack-managed resource leaves drift that fails the next update. Expect `remove` to
fail once with `DELETE_FAILED` on `WebBucket` if the site was ever synced: a non-empty S3 bucket
cannot be deleted, and the buckets are not `Retain`. Empty it (`aws s3 rm s3://<bucket> --recursive`;
neither bucket is versioned, so this is sufficient) and re-run. The tables and the pool *are*
`Retain` and will still be standing afterwards — genuinely orphaned at that point, and yours to
delete, domain first for the pool.

**This already happened on staging, exactly this way.** The first staging deploy failed on an
unrelated route-key bug (§ the route/throttle invariant). The rollback retained both tables. The next
three deploys failed at change-set creation, and were only recoverable because the tables were empty
and could be deleted. **On prod that escape does not exist**: the submissions table may hold real
public submissions, so deleting it to unblock a deploy is not an option.

#### Why it is hard to diagnose cold

The error tells you to use the `DescribeEvents` API — but a change-set *creation* failure produces no
stack events at all, because the stack never enters an update. `describe-change-set-hooks` returns an
empty list. You get the hook's name (`AWS::EarlyValidation::ResourceExistenceCheck`) and no
indication of which resource it objected to.

On staging this was resolved by bisecting the template: computing each resource's transitive
`Ref`/`GetAtt`/`DependsOn` closure, building a minimal valid template around it, and creating a
throwaway change set per resource until the offending ones named themselves. Budget for that if you
meet it without this section.

#### Prevention — do this, rather than the recovery below

The trap only springs when a retained resource is created by a deploy that later fails. So create
them in a deploy that does nothing else and can barely fail:

```bash
# 0. Both of the checks for the defect class that caused the staging failure.
cd infra && ./preflight.sh --stage prod && python3 ./check-routes.py

# 1. The retained resources ALONE, with the rest of Phase 2/4 still off.
#    Small, isolated, nothing to conflict with.
npx serverless deploy --stage prod

# 2. Confirm all three are CREATE_COMPLETE and stack-managed before going on.
aws cloudformation describe-stack-resources --stack-name slackdata-prod \
  --query "StackResources[?LogicalResourceId=='SubmissionsTable' ||
                           LogicalResourceId=='BrandClientsTable' ||
                           LogicalResourceId=='AdminUserPool'].[LogicalResourceId,ResourceStatus]" \
  --output table

# 3. Then deploy the remainder normally. A failure from here is safe: the
#    resources already exist IN the stack, so a rollback has no reason to
#    re-create them and no reason to orphan them.
DEPLOY_MANUFACTURER_API=true npx serverless deploy --stage prod
```

`preflight.sh` also checks the orphan condition itself on every run — a retained table that exists in
the account but not in the stack is a hard ✗, because it means the next deploy is already blocked.

#### Recovery — if it springs anyway

**Do not delete the resources.** Import them back into the stack:

```bash
# 0. First, a restore point. The tables are on-demand billing with PITR enabled
#    for precisely this moment.
aws dynamodb export-table-to-point-in-time --table-arn <arn> ...   # or take an on-demand backup:
aws dynamodb create-backup --table-name slackdata-submissions-prod \
  --backup-name pre-import-$(date +%Y%m%d)

# 1. The template CloudFormation will import INTO.
npx serverless package --stage prod          # → .serverless/cloudformation-template-update-stack.json

# 2. A change set of type IMPORT, mapping each orphan to its logical id.
aws cloudformation create-change-set \
  --stack-name slackdata-prod --change-set-name import-retained \
  --change-set-type IMPORT \
  --template-body file://.serverless/cloudformation-template-update-stack.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --resources-to-import '[
    {"ResourceType":"AWS::DynamoDB::Table",
     "LogicalResourceId":"SubmissionsTable",
     "ResourceIdentifier":{"TableName":"slackdata-submissions-prod"}},
    {"ResourceType":"AWS::DynamoDB::Table",
     "LogicalResourceId":"BrandClientsTable",
     "ResourceIdentifier":{"TableName":"slackdata-brand-clients-prod"}}
  ]'

# 3. Read it before executing it, then execute.
aws cloudformation describe-change-set --stack-name slackdata-prod --change-set-name import-retained
aws cloudformation execute-change-set --stack-name slackdata-prod --change-set-name import-retained
```

The resources become stack-managed again with their data intact, and normal `serverless deploy`
resumes. Confirm the import is genuinely non-destructive for the table holding real submissions
before you run it — an import must describe the table as it actually is, so a template property that
disagrees with the live table is the thing to check first.

### Turnstile — why it needs three checks, not one

The suggestion form needs two values that live in different places and are
applied by **different halves of the deploy**:

| | Where it lives | Applied by |
|---|---|---|
| `TURNSTILE_SECRET` | your shell → `serverless.yml` → Lambda env | half A |
| `TURNSTILE_SITE_KEY` | your shell → `.env.production` → JS bundle | half B |

`serverless.yml` reads the secret as `${env:TURNSTILE_SECRET, ''}` — that `''`
is a **default, not an error**, so a deploy with no secret succeeds, goes green,
and warns nobody. At runtime `turnstile.py` fails **closed**, so every
`POST /submissions/` answers 503. Nothing else changes: catalogue, search,
detail pages and `/admin` all work. The site looks healthy.

Only one of the four combinations actually hurts:

| Secret | Site key | Result |
|---|---|---|
| unset | unset | Form never renders (tree-shaken out). Ships dark — fine. |
| set | unset | Endpoint works, nothing calls it. Harmless. |
| set | set | Working. |
| **unset** | **set** | **The bad one.** A visitor fills the form in, solves the challenge, submits — and gets a 503. Looks like our bug, and what they typed is gone. |

That last row is easy to reach because the secret lives only in a shell, so it
is gone in every new terminal, while the site key sits in a committed file.

**So the safeguard is three layers, and the first one is structural:**

1. **One source.** `./sync-env.sh` writes `VITE_TURNSTILE_SITE_KEY` from
   `$TURNSTILE_SITE_KEY`, so both halves come from the same shell at the same
   moment. Reaching the bad row now takes two separate mistakes instead of one
   omission — and the script refuses outright if you hand it a site key with no
   secret exported.
2. **Before deploying:** `./preflight.sh` hard-fails on the bad row (checking
   both the shell and the committed file), and warns on the merely-invisible
   ones.
3. **After deploying:** `./verify-deploy.sh` checks the **live site**, because
   intent checks can still be wrong — a secret exported but not picked up, a
   half B built from a stale env file. It cannot solve a captcha, and does not
   need to: `POST /submissions/` with **no** token separates the two states
   exactly and stores nothing either way —

       secret set     -> 400 "captcha verification failed"   (healthy)
       secret not set -> 503 "temporarily unavailable"       (broken)

   which is the inverse of how it reads. It then fetches the deployed bundle,
   checks whether the Turnstile widget is in it, and fails if the two disagree.
   Those two status codes are a contract; `tests/test_submissions.py`
   ::`test_a_tokenless_post_separates_the_two_captcha_configurations` pins them
   so the check cannot silently start lying about production.

A fourth, weaker signal: the function logs a `WARNING` naming
`TURNSTILE_SECRET` on every cold start in that state. It is the only one of the
four emitted by the running thing itself, so it is the one that still fires when
somebody deploys by hand. It lives in `lambda_handler.py` rather than
`main.py`'s lifespan, because Mangum runs with `lifespan="off"` and a check in
the lifespan is silent in exactly the environment it exists for.

    export TURNSTILE_SECRET='...' TURNSTILE_SITE_KEY='0x4AAA...'   # both, together

### No email — and why there is nothing to set up

**SlackData sends no email.** There is no SES identity to verify, no DKIM to keep valid, no sending
reputation attached to `slackdata.org`, and nothing to check when an alert fails to arrive. New
submissions are found at `/admin`, which shows an outstanding-work counter for approved-but-unapplied
rows; a manufacturer's batch lands in the same place.

This replaced an SES alert that was built and then removed. The reasoning, so it is not rebuilt by
the next person who notices the queue is silent:

- The setup cost is **permanent and ours** — an identity to verify, DKIM records to keep valid, and
  a domain reputation to manage — for one recipient.
- An execution role that can `ses:SendEmail` from `*@slackdata.org` means a compromised Lambda can
  send mail **as our own domain**, with our domain's reputation behind it. That is a phishing vector
  bought for the convenience of one notification.
- The sibling project solves the human-contact half without AWS at all:
  `slackmap@slacklineinternational.org` is a Google-Workspace alias that forwards to a person. It
  needs no verification, survives an AWS account changing hands, and is visible to the ISA rather
  than to whoever holds the credentials.

**If a contact address is wanted for SlackData**, the same shape applies — ask Thomas for
`slackdata@slacklineinternational.org` forwarding to the maintainer. It is the natural front door for
manufacturer onboarding (a brand mails it, you verify who they are, then run
`python -m slack_data.manufacturers.register`). Nothing in this repository needs to change for it to
exist, which is the point.

The Lambda role still carries `ses:SendEmail` / `ses:SendRawEmail` from the Phase 2 policy request.
It is **unused**. Removing it is queued for the next revision of that policy rather than a round-trip
of its own — see [LAMBDA_ROLE_PERMISSIONS.md](LAMBDA_ROLE_PERMISSIONS.md).

### Creating the admin user (once, by hand)

Self-signup is disabled, so the account is created with the CLI. There is no sign-up page to gate.

```bash
POOL=$(out AdminUserPoolId)
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL" --username 'you@example.org' \
  --user-attributes Name=email,Value='you@example.org' Name=email_verified,Value=true
```

Cognito emails a temporary password; the first login forces a change. Turn on MFA from the hosted
login page — the pool allows it (`OPTIONAL` + TOTP) and this is the account that can read everything
the public has submitted.

**Then put the user in the admin group — being in the pool is not being an admin.** The API requires
`COGNITO_ADMIN_GROUP` (default `admins`, created by the template as `AdminUserPoolGroup`) in the ID
token's `cognito:groups` claim; without it every triage route answers 403. Cognito adds the claim
itself, so the SPA needs nothing.

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL" --username 'you@example.org' --group-name admins
```

Sign out and back in afterwards: the claim is stamped into the token at sign-in, so an existing
session keeps the old, group-less one until it refreshes.

**On a stage that already has an admin, do this in the same sitting as the deploy that adds the
group** — the moment the new Lambda is live, an account outside the group is locked out of triage.

### Onboarding a manufacturer (Phase 4, by hand and on purpose)

Minting a brand's credentials is the moment we decide a company speaks for a brand. That is a
judgement, not a deploy, which is why there is no route for it. **Two commands, with your own
verification in between.**

```bash
export AWS_PROFILE=isa-slackdata
export BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod   # hosted store, not the local SQLite

# 1. Before you reply to them: what do we already know about this brand?
python -m slack_data.manufacturers.register --check 'Balance Community'
```

That prints the brand's recorded website, contact email and Facebook page, whether the email is on
the same domain as the website, and any credentials they already hold. **Now do the verification** —
challenge an address or channel the brand controls, per the policy below. Then:

```bash
# 2. Once they have answered on a channel you chose:
python -m slack_data.manufacturers.register --onboard \
    --brand 'Balance Community' \
    --verified-via 'replied to info@balancecommunity.com (manufacturers.json)'
```

That one command re-shows the dossier, asks you to confirm, and then:

1. resolves the user pool **from the stack's `AdminUserPoolId` output**, never by name;
2. creates the Cognito app client with a secret, `client_credentials` only, and exactly the
   `slackdata/gear.write` scope;
3. maps the client to the brand in `slackdata-brand-clients-prod` (no `--contact` — see below);
4. mints a token and calls `GET /manufacturer/me`, failing if it does not answer with the brand you
   named — so a credential is never handed over untested;
5. appends the row to [onboarded-brands.md](onboarded-brands.md);
6. writes the credential to a **0600 file under `~/.slackdata/credentials/`** and prints only the
   path. Nothing secret reaches your terminal. Send it to the brand, point them at
   <https://slackdata.org/for-manufacturers>, then delete the file.

If any step after the app client fails, the client is **deleted again** — a half-onboarded brand
never leaves a live credential in the pool with nothing recording that it exists.

`--verified-via` is required. It is the audit trail, and a ledger you have to remember to write is
one that is complete right up until the day it matters. `--yes` skips the confirmation prompt;
`--no-verify` skips step 4 (only useful before the API is deployed).

> **Why the console step moved into the tool.** The console picks a pool by *name*, and a failed
> rollback can leave a second pool with the identical name behind — one did, on 2026-08-25. Choosing
> the wrong one fails **silently**: the client is created, tokens mint, and every request 401s
> because the API verifies against the other pool's JWKS. Resolving the pool from a stack output
> cannot make that mistake.
>
> The other thing not to get wrong is still true and is now unreachable by accident: the admin
> sign-in client (`slackdata-admin-spa-prod`) lives in the same pool and must **never** have a secret
> or the `client_credentials` grant — a browser cannot keep a secret and PKCE breaks outright if it
> has one. The tool only ever creates new clients; it never edits an existing one.

**Registering a client you made by hand** (recovery, or a console-created client) still works —
that is `--client-id` *without* `--onboard`:

```bash
python -m slack_data.manufacturers.register --client-id '<from the console>' --brand 'Balance Community'
```

#### Onboarding policy

*Adopted 2026-08-25. Answers MANUFACTURER_API_PLAN.md § Open questions 2, which gated the phase.*

We hold 76 manufacturers and expect to onboard maybe a dozen a year. The bar is therefore set at
"a challenge only the real brand can answer", not at document checks — proportionate to a database
of gear specifications where the worst case is a competitor filing a wrong weight, and every change
still lands in an admin's queue as a JSON patch before it is applied.

1. **Prefer a request from the brand's own domain** — the same domain as the `website` field
   recorded for them in `manufacturers.json`. `--check` computes that comparison and shows it. Treat
   a mismatch as a reason to look, not a reason to stop: **the recorded contact for several real
   brands is not on their own domain** (Slack Mountain publishes `slackmountain.com@gmail.com`, Yoga
   Slackers a gmail, Raed Slacklines an address at `raed-sports.com`), so a hard rule here would
   refuse the genuine company. What must never be skipped is step 2 — an inbound address is a claim
   whatever its domain, and only the out-of-band reply is confirmation.
2. **Confirm out-of-band, to an address we already held.** 34 of the 76 entries in
   `manufacturers.json` carry a scraped `contact_email` (`metadata.email_source` records where each
   came from). Where one exists, reply *to that address*, not to whoever wrote in. That is what
   turns an inbound claim into a challenge — an impostor can send us mail, but cannot read the
   brand's.
3. **Where we hold no contact email**, use the brand's own public contact form, or a direct message
   to a socials account listed for them in `manufacturers.json`. Same property: we choose the
   channel, and it is one the brand controls.
4. **Record the decision.** `register.py --onboard` does this for you from `--verified-via`, which
   it refuses to run without: date, brand, client id, the channel the confirmation went to, and who
   approved it, appended to `infra/onboarded-brands.md`. If a credential is ever disputed, that row
   is the whole audit trail — so say *which* address or channel answered, not "email".
5. **When in doubt, do not mint.** Nothing breaks if a brand waits a week. A credential handed to
   the wrong person writes permanent, auto-approved rows against another company's products.

The person who approves is whoever holds the ISA's slackdata mailbox. This is deliberately a human
decision with no route behind it — see MANUFACTURER_API_PLAN.md § Onboarding.

#### What we store about a brand contact

*Adopted 2026-08-25. Answers MANUFACTURER_API_PLAN.md § Open questions 4.*

**Register the first brands with `--contact` omitted.** `contact_email` is personal data, and the
`slackdata-brand-clients` record has no TTL (deliberately — a credential mapping that expired on its
own would lock a brand out silently) and no `DeleteItem` grant on the Lambda role, so erasing one
today would need an IAM change. Rather than store personal data we cannot yet delete, we do not
store it: the field is optional, a client works with it null, and nothing in the API reads it.

The onboarding correspondence lives in the mailbox and in `infra/onboarded-brands.md`, which is
where a deletion request can actually be honoured. Revisit this if an operational need for the field
appears — the work is a scoped `dynamodb:DeleteItem` grant plus a `--forget` flag on `register.py`,
not a redesign.

Revoking is one command and takes effect on the very next request — no redeploy, no waiting out a
token lifetime, which is the whole reason the brand mapping lives in data rather than in a per-brand
Cognito scope:

```bash
BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod \
  python -m slack_data.manufacturers.register --client-id '<id>' --deactivate
```

**A manufacturer's updates arrive auto-approved and never expire.** That is deliberate — the sender
makes the product, so the record is work outstanding rather than a decision — but it means a
compromised brand credential writes permanent rows. Bounded by the route throttle (1/sec, burst 10)
and the 50-item batch cap; unbounded in total. If a credential is ever suspected, deactivate it
first and triage what it wrote second: rejecting those rows restores their TTL and they age out.

### One-time prerequisites

- **The Lambda role must be extended first** — see [ISA_ROLE_REQUEST_PHASE2.md](ISA_ROLE_REQUEST_PHASE2.md).
  **Done: granted and applied 2026-08-23.** Without it the deploy's CloudFormation succeeds and every
  submission then fails at runtime with an `AccessDeniedException`. Confirm with:

  ```bash
  aws iam get-role-policy --role-name slackdata-prod-eu-central-1-lambdaRole \
    --policy-name slackdata-prod-lambda --query 'PolicyDocument.Statement[?Sid==`SlackDataTables`]'
  ```

  The resource must be `table/slackdata-*` (plus `/index/*`), not just the submissions table —
  Phase 4's `slackdata-brand-clients-prod` is read on every authenticated manufacturer request.
- **A Cloudflare Turnstile site key + secret** for `slackdata.org`. The secret is exported at deploy
  time (half A above); the site key is public and belongs in `frontend/.env.production`.

### Registering a brand — the id that can be wrong

`python -m slack_data.manufacturers.register` resolves `--brand` against **whatever catalogue the
machine running it has**, then writes that `brand_id` to the hosted table. Brand ids are SQLite
autoincrements assigned by seed order, so a local catalogue seeded from a different commit than the
deployed image can produce a different id — which would point a brand's credential at another
company.

`matching.verify_brand()` catches it: the stored `brand_name` is re-checked against the id on every
manufacturer request, and a disagreement is a **503** ("these credentials need re-registering")
rather than a confident answer about the wrong brand. The CLI also prints a warning when it writes
to a hosted store. Before handing credentials over, confirm:

```bash
curl -H 'Authorization: Bearer <their token>' "$BASE/api/manufacturer/me"
# must report the brand_id and brand_name you registered. A 503 means re-run the
# CLI against a catalogue seeded from the deployed commit.
```

### Phase 4 uploads — a bucket the deploy must never touch

`slackdata-uploads-prod-<accountId>` (`UploadsBucketName` in the stack outputs) holds photos sent in
through the manufacturer API. **Nothing syncs it, and nothing should start.** The website bucket is
synced with `--delete`, so a file placed there that is not in `dist/` is destroyed on the next
deploy; gear images are build output (`frontend/public/gear-images/`, resolved through a build-time
manifest), so an upload would be deleted *and* would not render in the meantime.

Treat it as a quarantine. Reviewing a photo is the same shape as reviewing a spec correction:

```bash
aws s3 cp "s3://$(out UploadsBucketName)/<key>" frontend/public/gear-images/<type>/
# regenerate the image manifest, commit, then run half B
```

Objects expire after 90 days by lifecycle rule, so rejected uploads clear themselves.

### Approving a submission does not change the site

Worth repeating here because it is the thing people expect to be automatic. Approving records the
outcome and hands the admin a JSON patch. Making it live is the ordinary flow: edit the root
`*.json`, commit, and run **half A** again to re-bake the catalog into the image.
