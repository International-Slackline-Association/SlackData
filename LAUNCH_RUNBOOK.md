# LAUNCH_RUNBOOK.md — taking SlackData live on `slackdata.org`

Step-by-step procedure to deploy the Phase-1 (public, read-only) stack into the ISA's AWS account
and put it behind `slackdata.org`. Written to be followed by a human **or** by an agent working
alongside a human.

- **What** is being deployed and **why** it looks like this → [GOING_LIVE.md](GOING_LIVE.md)
- **The deploy commands in isolation** → [infra/README.md](infra/README.md)
- **This file** is the end-to-end sequence, including the credential handling, the domain, the TLS
  certificate, and the things that are currently broken and must be fixed before the first deploy.

---

## 0. Ground rules on credentials

**The agent never receives the AWS credentials.** Not the portal URL password, not the one-time
password, not an access key, not a session token. This is not a formality — an AWS session for the
ISA's account is a credential belonging to a third-party organisation.

The split of work:

| Task | Who |
|------|-----|
| First browser login to the AWS access portal, password reset, MFA enrolment | **Human only** |
| `aws configure sso` (opens a browser, human approves) | **Human only** |
| Everything after that (`aws …`, `serverless deploy`, builds, DNS records) | Agent may run it, using the **named profile** the human created |

An agent therefore operates by referencing a profile name (e.g. `AWS_PROFILE=isa-slackdata`) that
resolves to a session the human established. If the session is expired, the agent stops and asks the
human to re-run `aws sso login --profile isa-slackdata`. **An agent must never ask the user to paste
credentials into the chat**, and if they are pasted anyway, it should say so, decline to store them
in any file, and ask the human to rotate them.

---

## 1. Pre-flight code fixes — ✅ DONE (2026-08-16, uncommitted on `deploy/container-and-serverless`)

Three defects would each have caused a visible failure on the first deploy. **All three are fixed and
verified**; this section is kept as the record of what changed and how it was proven. Nothing here is
outstanding — resume at §2.

| # | Defect | Fix | Verified by |
|---|--------|-----|-------------|
| 1.1 | Lambda image missing `httpx` → every request 502s | added `httpx>=0.27` to [Dockerfile.lambda](Dockerfile.lambda) | container smoke test: `/fx/rates` → 200, `stale:false` |
| 1.2 | CloudFront rewrote API 404s into HTML 200s | dropped the `404` custom error response in [infra/serverless.yml](infra/serverless.yml) | `GET /webbing/999999` → real JSON 404 |
| 1.3 | `CloudFront-Viewer-Country` never reached the API | custom `ApiOriginRequestPolicy` in [infra/serverless.yml](infra/serverless.yml) | CFN template parses; header now whitelisted |

### 1.1 BLOCKER (fixed) — the Lambda image was missing `httpx`, so the API would not start

[Dockerfile.lambda:13-16](Dockerfile.lambda#L13-L16) installs plain `fastapi`, but
[slack_data/utilities/fx.py](slack_data/utilities/fx.py) does `import httpx`, and
[slack_data/main.py](slack_data/main.py) imports `fx_router` at module scope. `httpx` is **not** a
dependency of core `fastapi` (it comes with `fastapi[standard]`, which is what
[pyproject.toml](pyproject.toml) declares — the Dockerfile diverged). Result: `ImportError` on cold
start, **every request 502s**. The currency work landed after the deploy commit, which is how this
slipped through.

**Fixed** — `"httpx>=0.27"` added to the image's pip install, with a comment explaining why it can't
be dropped again. Confirmed load-bearing: uninstalling `httpx` inside the built image and importing
`slack_data.main` reproduces `ModuleNotFoundError: No module named 'httpx'`.

> Guard against a recurrence: the image pins its runtime deps by hand rather than installing the
> project, so any **new** third-party import in `slack_data/` must be added to
> [Dockerfile.lambda](Dockerfile.lambda) as well as [pyproject.toml](pyproject.toml). The §5.1 smoke
> test catches it, so run it before every deploy.

### 1.2 CloudFront turned API 404s into HTML 200s (fixed)

[infra/serverless.yml:130-136](infra/serverless.yml#L130-L136) maps `403` and `404` to
`/index.html` with status `200`. `CustomErrorResponses` are **distribution-wide** — they apply to the
`/api/*` behavior too. So `GET /api/webbing/999999`, which should be a JSON `404`, returns the SPA's
HTML with a `200`, and the frontend's not-found handling silently breaks.

**Fixed** — the `404` entry is gone; only `403` remains. S3 with Origin Access Control returns `403`
(not `404`) for a missing key, so SPA deep links still work. Verified against the container:
`GET /webbing/999999` returns `{"detail":"Webbing 999999 not found"}` with status 404. Re-confirm
end-to-end through CloudFront with the smoke test in §8, since this half of the fix is a CDN
behaviour that can only be observed once deployed.

### 1.3 Currency auto-detection silently no-op'd (fixed)

[slack_data/api/routers/fx_router.py](slack_data/api/routers/fx_router.py) reads the
`CloudFront-Viewer-Country` header to pick the visitor's default display currency. The `/api/*`
behavior uses managed origin request policy `b689b0a8-…` (**AllViewerExceptHostHeader**), which
forwards viewer headers but does **not** add CloudFront's own `CloudFront-*` headers.

**Fixed — but not the obvious way.** Swapping in the managed
**AllViewerAndCloudFrontHeaders-2022-06** policy (`33f36d7e-…`) is the textbook answer and is
**wrong here**: it is `AllViewer`-based, so it forwards the `Host` header, and API Gateway rejects
requests whose `Host` doesn't match its own `execute-api` domain — turning a cosmetic no-op into a
total API outage. `AllViewerExceptHostHeader` exists precisely to avoid that.

Instead, `serverless.yml` now defines a minimal custom `ApiOriginRequestPolicy`: all query strings
(the routers page on `limit`/`offset`), no cookies, no `Host`, and `CloudFront-Viewer-Country`
whitelisted. Safe because the API takes no auth, no cookies and no custom request headers.

Only fully observable once deployed — confirm in §8 that `/api/fx/rates` reflects the caller's
country. If it doesn't, the site still works; everyone just lands on the fallback currency.

---

## 2. First login to the ISA's AWS (human, once)

You were given: a default access-portal URL, a dual-stack portal URL, a username, and a one-time
password. The two URLs are the same portal — the dual-stack one is for IPv6-only networks. **Use the
default one** unless it fails to resolve.

1. Open the portal URL, sign in with the username + one-time password.
2. You will be forced to set a new password. Put it in a password manager, not in this repo.
3. Enrol MFA when prompted (AWS IAM Identity Center generally requires it). Keep the recovery codes.
4. On the portal landing page, note for each account tile you can see:
   - the **account name and 12-digit account ID**
   - the **permission set / role name** (e.g. `AdministratorAccess`, `PowerUserAccess`)
   - the **SSO region** (visible in the portal URL, e.g. `https://d-xxxx.awsapps.com/start` plus the
     region shown on the credentials popup)

Record those three things — the agent needs them (they are identifiers, not secrets) and cannot get
them any other way.

### 2.1 Configure the CLI (human)

The AWS CLI is **not installed** in this workspace. Install it first:

```bash
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
aws --version
```

Then:

```bash
aws configure sso
# SSO session name:  isa
# SSO start URL:     <the default portal URL>
# SSO region:        <region from the portal>
# SSO registration scopes: sso:account:access   (accept the default)
# → browser opens, approve the request
# Account:           <pick the ISA account>
# Role:              <the permission set>
# CLI default region: <the deploy region, see §3>
# CLI default output: json
# Profile name:      isa-slackdata
```

Verify, and hand the agent only the output of this command:

```bash
aws sts get-caller-identity --profile isa-slackdata
```

Sessions expire (typically 8–12 h). Renew with `aws sso login --profile isa-slackdata`.

### 2.2 Permissions the deploy actually needs

If the permission set is not admin, the deploy will fail partway. It needs to create/update:
CloudFormation, **ECR** (repo + push), **Lambda**, **API Gateway v2**, **S3**, **CloudFront**
(distribution, Origin Access Control, CloudFront Functions), **ACM** (us-east-1), **Route 53**,
**IAM** (the Lambda execution role), and **CloudWatch Logs**.

Two organisation-level things to check with the ISA *before* burning time on a failed deploy:

- **Service Control Policies** may block CloudFront/ECR or restrict regions.
- **Mandatory VPC attachment** for Lambda: if their policy forces it, the FX endpoint loses outbound
  internet unless a NAT gateway exists (NAT is ~$32/mo and would break the ≈$0-idle premise). The
  stack as written puts Lambda outside any VPC, which is correct here — the Lambda holds no data
  and reads a read-only file baked into its own image.

---

## 3. Decide the region (human + ISA)

[infra/serverless.yml:20](infra/serverless.yml#L20) defaults to `eu-central-1`. Confirm what the ISA
uses and standardise on it — a European region suits an EU-based org and the audience.

**Independent of that choice: the ACM certificate for CloudFront must live in `us-east-1`.** This is
a hard CloudFront requirement, not a preference. The rest of the stack goes in the chosen region.

---

## 4. Domain and TLS

### 4.1 Confirm what "bought and accessible in AWS" actually means

Two different things must both be true. Check both:

```bash
export AWS_PROFILE=isa-slackdata

# (a) Is the domain registered through Route 53? (Registrar API is us-east-1 only)
aws route53domains list-domains --region us-east-1

# (b) Is there a hosted zone for it? This is what actually serves DNS.
aws route53 list-hosted-zones-by-name --dns-name slackdata.org
```

Outcomes:

- **Registered in this account + hosted zone exists** → ideal, continue to §4.2. Note the
  `HostedZoneId`.
- **Registered here but no hosted zone** → create one (`aws route53 create-hosted-zone --name
  slackdata.org --caller-reference $(date +%s)`), then set the domain's nameservers to that zone's
  four NS records via `route53domains update-domain-nameservers`.
- **Registered elsewhere (another registrar, or another AWS account)** → create the hosted zone here
  and have whoever controls the registration point the nameservers at it. Allow up to 48 h for
  propagation, though it is usually much faster. **Do not start the ACM validation clock before the
  zone is authoritative** — the DNS validation record has to be resolvable publicly.
- **Not visible at all** → stop and ask the ISA which account holds it. Nothing downstream works
  without control of DNS.

### 4.2 Request the certificate (us-east-1, DNS-validated)

Cover the apex and `www`:

```bash
aws acm request-certificate --region us-east-1 \
  --domain-name slackdata.org \
  --subject-alternative-names www.slackdata.org \
  --validation-method DNS \
  --query CertificateArn --output text
```

Get the validation CNAMEs and create them in the hosted zone:

```bash
CERT_ARN=<arn from above>
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
```

Add each `Name`/`Value` as a CNAME record in the `slackdata.org` hosted zone (console, or a
`change-resource-record-sets` batch). Then wait for issuance:

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT_ARN"
```

This usually takes a few minutes once the records resolve. Keep `$CERT_ARN` — §5.2 needs it.

---

## 5. Prepare and validate the build locally

### 5.1 Smoke-test the Lambda image before it ever reaches AWS

Run this before **every** deploy. It catches an image-level failure in seconds instead of after a
15-minute CloudFront deploy.

Note the event below is a **complete** API Gateway v2 payload. The abbreviated one previously in
`infra/README.md` omitted `requestContext.http.sourceIp`, which makes Mangum raise
`KeyError: 'sourceIp'` before the request ever reaches FastAPI — an error easily mistaken for an
application bug.

```bash
docker build -f Dockerfile.lambda -t slackdata-api .
docker run -d --rm --name sd-smoke -p 9000:8080 slackdata-api

ev() { cat <<EOF
{"version":"2.0","routeKey":"\$default","rawPath":"$1","rawQueryString":"$2",
 "headers":{"accept":"application/json","host":"example.com","cloudfront-viewer-country":"DE"},
 "requestContext":{"accountId":"123456789012","apiId":"abc","domainName":"example.com",
   "stage":"\$default","requestId":"r1","time":"01/Jan/2026:00:00:00 +0000","timeEpoch":1767225600000,
   "http":{"method":"GET","path":"$1","protocol":"HTTP/1.1","sourceIp":"1.2.3.4","userAgent":"smoke"}},
 "isBase64Encoded":false}
EOF
}
inv() { curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" -d "$(ev "$1" "$2")"; }

inv "/webbing/" "limit=1"    # 200 + a real webbing row  → catalog baked correctly
inv "/fx/rates" ""           # 200 + rates, "stale":false → httpx present, egress works
inv "/webbing/999999" ""     # 404 + {"detail":"Webbing 999999 not found"}
inv "/brand/" "limit=1"      # 200 + a real brand         → manufacturer enrichment ran

docker rm -f sd-smoke
```

Every one must return a `statusCode` and JSON body — never `errorType`. An `ImportModuleError` or
`ModuleNotFoundError` means a Python dependency is missing from the image (see the guard note in
§1.1). An empty list from the first call means the catalog didn't bake.

Run the test suites too — `python -m pytest tests/ -q`, `cd frontend && npm run build && npm run
test:unit`.

### 5.2 Fill in the `TODO(isa)` markers in [infra/serverless.yml](infra/serverless.yml)

Four edits:

1. **Region** ([line 20](infra/serverless.yml#L20)) — set the confirmed region as the default.
2. **Bucket name** ([line 45](infra/serverless.yml#L45)) — `slackdata-web-prod` is a global
   namespace and may well be taken. Make it deterministic and unique:
   `BucketName: ${self:service}-web-${self:provider.stage}-${aws:accountId}`.
3. **Aliases + certificate** ([lines 97-101](infra/serverless.yml#L97-L101)) — uncomment and fill:

   ```yaml
             Aliases:
               - slackdata.org
               - www.slackdata.org
             ViewerCertificate:
               AcmCertificateArn: <CERT_ARN from §4.2>
               SslSupportMethod: sni-only
               MinimumProtocolVersion: TLSv1.2_2021
   ```

4. **Architecture** ([line 22](infra/serverless.yml#L22)) — `x86_64` matches this WSL2 host. If you
   ever deploy from an Apple-silicon machine, either switch both this and the image to `arm64`
   (cheaper) or build with `--platform linux/amd64`. A mismatch here produces a Lambda that fails at
   runtime with an exec-format error.

### 5.3 Serverless Framework v4 needs an account (expect this to stop you)

`npx serverless` resolves to **v4**, which requires a Serverless Framework account and a
`SERVERLESS_ACCESS_KEY` even on the free tier. There is no `package.json` in `infra/`, so the version
is unpinned. Pick one before deploy day:

- **Register a free Serverless account** (free for organisations under $2M revenue — a nonprofit
  qualifies), create an access key, and export `SERVERLESS_ACCESS_KEY` in the deploy shell. Then pin
  it: add an `infra/package.json` with `"serverless": "^4"` so the version can't drift.
- **Or pin v3** (`npx serverless@3 deploy …`), which needs no account. v3 no longer gets updates but
  deploys this stack fine.
- **Or drop the dependency** — the config is thin enough to port to AWS SAM or raw CloudFormation.
  Worth considering if the ISA has a house standard; not worth doing on launch day.

Whichever you choose, record it in [infra/README.md](infra/README.md) so the next person isn't
surprised.

---

## 6. Deploy

```bash
export AWS_PROFILE=isa-slackdata
cd infra
npx serverless deploy --stage prod --region <region>
```

This builds the image, pushes it to ECR, and creates the Lambda, HTTP API, S3 bucket, CloudFront
Function, and distribution. **First run takes 15–25 minutes** — CloudFront distribution creation
dominates. Do not interrupt it; a half-created distribution is annoying to clean up.

Capture the outputs:

```bash
npx serverless info --stage prod --verbose   # WebBucketName, CdnDomain, CdnDistributionId
```

### 6.1 Upload the site

The SPA plus ~65 MB of gear and manufacturer images in `frontend/public/` land in `dist/`. Sync with
cache headers that suit each class of file — Vite fingerprints everything in `assets/`, so it is
safe to cache those forever, while `index.html` must never be cached or deploys won't take effect:

```bash
cd ../frontend
npm run build     # uses .env.production → VITE_API_URL=/api

BUCKET=<WebBucketName>
# long-lived, fingerprinted assets
aws s3 sync dist/ "s3://$BUCKET" --delete \
  --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
# the entry point — always revalidated
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,must-revalidate"
```

Note the images under `public/` are **not** fingerprinted by Vite — they keep their source
filenames. `max-age=31536000,immutable` on them means a replaced image keeps serving stale for up to
a year in browsers that already fetched it. That is usually fine (images are added, rarely
replaced); if you replace one, invalidate that exact path. If image churn becomes routine, split the
sync so `gear-images/` and `manufacturer-images/` get a shorter max-age.

### 6.2 Invalidate

```bash
aws cloudfront create-invalidation --distribution-id <CdnDistributionId> --paths '/*'
```

---

## 7. Point the domain at CloudFront

In the `slackdata.org` hosted zone, create **alias** records (not CNAMEs — an apex can't be a CNAME,
and Route 53 aliases are free):

- `slackdata.org` → **A**, alias → the CloudFront distribution domain (`dxxxx.cloudfront.net`)
- `slackdata.org` → **AAAA**, alias → same (CloudFront is dual-stack; do both)
- `www.slackdata.org` → **A** and **AAAA**, alias → same

The alias target hosted-zone ID for **all** CloudFront distributions is the constant
`Z2FDTNDATAQYW2`. Example change batch:

```json
{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{
  "Name":"slackdata.org","Type":"A",
  "AliasTarget":{"HostedZoneId":"Z2FDTNDATAQYW2",
                 "DNSName":"<CdnDomain>","EvaluateTargetHealth":false}}}]}
```

```bash
aws route53 change-resource-record-sets --hosted-zone-id <ZONE_ID> \
  --change-batch file://alias.json
```

DNS propagates within minutes. If you get an SSL warning, the aliases or the certificate in §5.2
didn't make it into the distribution — check with
`aws cloudfront get-distribution-config --id <CdnDistributionId>`.

---

## 8. Smoke test the live site

```bash
BASE=https://slackdata.org

curl -sI  "$BASE/" | head -1                              # 200, HTML
curl -s   "$BASE/api/webbing/?limit=1" | head -c 200      # JSON, one real row
curl -s   "$BASE/api/fx/rates" | head -c 200              # rates; check "stale" is false
curl -sI  "$BASE/api/webbing/999999" | head -1            # must be 404 — if 200, §1.2 isn't fixed
curl -sI  "$BASE/gear/webbings" | head -1                 # 200 (SPA deep link → index.html)
curl -sI  "$BASE/gear-images/<a real filename>" | head -1 # 200, image/*
curl -sI  "http://slackdata.org/" | head -1               # 301/308 → https
curl -sI  "https://www.slackdata.org/" | head -1          # 200
```

Then in a browser, on the real domain: listing loads, filters and search work, a detail page opens,
compare works, the currency selector changes prices, and **DevTools shows no CORS errors and no
requests to `localhost:8000`** (that would mean the build didn't pick up `.env.production`).

Check the Lambda logs for cold-start exceptions:

```bash
aws logs tail /aws/lambda/slackdata-prod-api --since 15m --follow
```

---

## 9. After launch

### Updating gear data
The catalog is baked into the image, so a data change is: edit the root `*.json` → re-run the
deploy in §6 (rebuilds the image, re-bakes the catalog). No migration, nothing stateful. Frontend
sync is only needed if the frontend changed.

### Cost guardrails
Everything here is pay-per-use; idle cost is a few cents a month (S3 storage for 65 MB, ECR image
storage, Route 53's $0.50/zone). Set a budget alarm anyway so a surprise is caught early:

```bash
aws budgets create-budget --account-id <ACCOUNT_ID> --budget \
  '{"BudgetName":"slackdata","BudgetLimit":{"Amount":"20","Unit":"USD"},
    "TimeUnit":"MONTHLY","BudgetType":"COST"}'
```

Consider adding throttling on the HTTP API before the Phase-2 submission forms go public — the
read-only launch has no write endpoints, so it is low-risk today.

### Rollback
`npx serverless rollback --stage prod` reverts the API to the previous deployment. For the frontend,
re-sync a previous `dist/` build and invalidate. CloudFront/S3 hold no state you can lose here — the
only durable artefacts are the S3 objects and the ECR images.

### Teardown (if this account turns out to be the wrong one)
`npx serverless remove --stage prod`. The S3 bucket must be emptied first or CloudFormation will
refuse to delete it. The ACM certificate and hosted zone are created outside the stack and survive.

---

## 10. Before this is really "public"

Carried over from [GOING_LIVE.md §6](GOING_LIVE.md) — these are launch-blocking in the reputational
sense, under the ISA's name, not the technical one:

- [ ] **Image rights.** Many gear images were scraped. Confirm rights or replace them.
- [ ] **Safety disclaimer.** Surface "verify specs with the manufacturer" prominently. The data
      already models ISA warnings; the disclaimer is a UI addition.
- [ ] **`LICENSE` file.** The project is described as open source and has none.
- [ ] **Data-accuracy note**, as SlackDB has.

## 11. Still open with the ISA

- [ ] Region.
- [ ] Whether the deploy is run by us into their account (IAM role / GitHub OIDC) or by them from
      this config — this determines whether the credentials in §2 are a one-off or ongoing.
- [ ] Confirmation that `slackdata.org` is registered in *this* account (§4.1).
- [ ] Serverless Framework account, or the decision to pin v3 / port to SAM (§5.3).
- [ ] Any SCP or mandatory-VPC policy that affects §2.2.
- [ ] Captcha provider, ahead of Phase 2 (Turnstile is free and simple).

---

### Order of operations, one line each

~~Pre-flight code fixes (§1)~~ ✅ done → human logs into SSO and configures the profile (§2) → confirm region (§3) →
confirm domain + request cert (§4) → local container smoke test (§5.1) → fill serverless.yml (§5.2)
→ settle the Serverless v4 account question (§5.3) → `sls deploy` (§6) → sync SPA + invalidate (§6.1)
→ Route 53 aliases (§7) → smoke test (§8).
