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

## 0.1 Environment — this workspace is WSL

Everything in this runbook runs **inside the WSL distro**, never in PowerShell or CMD. The repo
lives on the Linux filesystem (`/home/ebragard/SlackData`); keep it there rather than under
`/mnt/c/…`, where Docker builds crawl and file modes are meaningless. Five WSL-specific things bite
during this procedure, and every one of them looks like a different problem than it is.

**`~/.aws` may be owned by root.** It exists in this workspace, empty, `root:root` — so
`aws configure sso` fails to write the profile and reports a permission error that reads like a CLI
bug. Fix ownership before configuring anything:

```bash
sudo chown -R "$USER:$USER" ~/.aws
```

**There is no browser inside WSL.** `aws configure sso` and `aws sso login` try to open one and
cannot. Either install `wslu` and point the CLI at the Windows browser —

```bash
sudo apt install -y wslu && export BROWSER=wslview     # add to ~/.bashrc to make it stick
```

— or skip the launch entirely and drive it by hand:

```bash
aws sso login --profile isa-slackdata --no-browser
```

which prints a URL and a verification code to paste into the Windows browser yourself. **Check the
code on screen matches the one in the browser** before approving; that is the whole security value
of the step.

**Two AWS CLIs can shadow each other.** WSL puts Windows executables on `PATH`, so if AWS CLI for
Windows is installed, `aws` may resolve to `aws.exe` — which reads
`C:\Users\<you>\.aws\config`, a completely different file from the `~/.aws/config` this runbook
writes. The symptom is a profile that "doesn't exist" moments after you created it. Confirm which
binary you are calling before trusting any profile error:

```bash
which aws        # want /usr/local/bin/aws — NOT /mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe
```

**Docker comes from Docker Desktop.** The §5.1 smoke test needs a working `docker`. On WSL that
means Docker Desktop with **WSL integration enabled for this distro** (Settings → Resources → WSL
integration). If `docker` is not found, that toggle is the first thing to check — installing
`docker-ce` inside the distro as well leads to two daemons and a confusing afternoon.

**The clock drifts after the host sleeps.** A suspended Windows machine leaves WSL's clock behind,
and AWS rejects SigV4 requests signed with a skewed clock — surfacing as `InvalidSignatureException`
or a token that claims to be expired seconds after you logged in. If a call fails that way right
after resuming, resync before debugging anything else:

```bash
sudo hwclock -s
```

**One git note.** Editing tracked files from Windows-side editors can introduce CRLF line endings
into files that are LF in the repo, which turns a one-line change into a whole-file diff. It has
already happened once in this repo (`load_weblocks.py`). Edit from inside WSL, and if a diff looks
implausibly large, check line endings before assuming a bad merge.

---

## 1. Pre-flight code fixes — ✅ DONE (2026-08-16, uncommitted on `deploy/container-and-serverless`)

Three defects would each have caused a visible failure on the first deploy. **All three are fixed and
verified**; this section is kept as the record of what changed and how it was proven. Nothing here is
outstanding — resume at §2.

| # | Defect | Fix | Verified by |
|---|--------|-----|-------------|
| 1.1 | Lambda image missing `httpx` → every request 502s | added `httpx>=0.27` to [Dockerfile.lambda](Dockerfile.lambda) | container smoke test: `/fx/rates` → 200, `stale:false` |
| 1.2 | CloudFront rewrote API 404s into HTML 200s | dropped the `404` custom error response in [infra/serverless.yml](infra/serverless.yml) | `GET /webbing/999999` → real JSON 404 |
| 1.3 | `CloudFront-Viewer-Country` never reached the API | custom `ApiOriginRequestPolicy` in [infra/serverless.yml](infra/serverless.yml) | live: `detected_currency` set via CDN, `null` direct |

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

**Confirmed working in production (2026-08-17).** Through CloudFront, `/api/fx/rates` returns
`"detected_currency": "CAD"` for a Canadian caller; the same request straight to the API Gateway URL
returns `null`, since only CloudFront adds that header. That contrast is the proof the custom policy
forwards the header *and* that omitting `Host` kept API Gateway happy.

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

**Where these go: `~/.aws/config`, and nowhere else.** You do not transcribe them — `aws configure
sso` in §2.1 asks for each one and writes the profile for you. They are identifiers rather than
secrets, but **this repository is public**, so none of them belong in a tracked file, and there is no
need to put them in one: after the profile exists, everything downstream refers to
`--profile isa-slackdata` and never sees the raw values again. That includes the agent, which needs
only the output of the verification command at the end of §2.1.

The single exception is the **deploy region** (§3), which goes into
[infra/serverless.yml](infra/serverless.yml#L20) because the template cannot work without it — a
region name is public information. The account ID is *not* needed there: the template already builds
its ARNs with the `${AWS::AccountId}` pseudo-parameter, which CloudFormation fills in at deploy time.

If you want to jot the portal details down while you are still on the console, keep the note outside
the working tree (`~/isa-aws-notes.md`) — a scratch file inside the repo is one `git add -A` away
from a public commit.

The password, the one-time password and the MFA recovery codes go in a password manager, per §0.

### 2.1 Configure the CLI (human)

The AWS CLI is **not installed** in this workspace. Install it inside WSL — not the Windows
installer, which produces the shadowed-binary problem described in §0.1:

```bash
sudo apt install -y unzip   # not present on a stock WSL Ubuntu image
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
aws --version
```

Take the official installer above, not the fallbacks the shell suggests when `aws` is missing:
`apt install awscli` is CLI **v1**, which has no `aws sso login` and cannot read the `sso_session`
profile this runbook writes, and the `aws-cli` snap needs `--classic` and confines its view of
`~/.aws`.

Then — after fixing `~/.aws` ownership and setting `BROWSER`, both per §0.1:

```bash
aws configure sso
# SSO session name:  isa
# SSO start URL:     <the default portal URL>
# SSO region:        <region from the portal>
# SSO registration scopes: sso:account:access   (accept the default)
# → browser opens (or a URL + code is printed — see §0.1); approve the request
# Account:           <pick the ISA account>
# Role:              <the permission set>
# CLI default region: <the deploy region, see §3>
# CLI default output: json
# Profile name:      isa-slackdata
```

That command is what stores the four values from §2 — you will not be asked for them again.

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
15-minute CloudFront deploy. It needs a working `docker` inside WSL — see §0.1 if the command is not
found.

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

### 5.2 Fill in the `TODO(isa)` markers in [infra/serverless.yml](infra/serverless.yml) — ✅ DONE (2026-08-16)

All four edits are made; no `TODO(isa)` markers remain. What changed:

1. **Region** ([line 20](infra/serverless.yml#L20)) — `eu-central-1` kept as the default, now marked
   confirmed rather than provisional.
2. **Bucket name** ([line 45](infra/serverless.yml#L45)) — `${self:service}-web-${self:provider.stage}-${aws:accountId}`.
   Deterministic across deploys, unique within S3's global namespace.
3. **Aliases + certificate** — `slackdata.org` + `www.slackdata.org`, with the existing issued
   us-east-1 certificate and `MinimumProtocolVersion: TLSv1.2_2021`.
4. **Architecture** ([line 22](infra/serverless.yml#L22)) — `x86_64` confirmed against this host
   (`uname -m` → `x86_64`); the Apple-silicon caveat is now a comment in the file itself.

> **The cert ARN is written as `arn:aws:acm:us-east-1:${aws:accountId}:certificate/577c4142-…`.**
> Serverless resolves `${aws:accountId}` at deploy time, so the ARN is complete in CloudFormation
> but the ISA's account id never lands in this public repo — consistent with §2. If you paste a
> literal ARN over it, you have quietly published the account id.

**§4 was already complete when this was done**, which is why no work was needed there: `slackdata.org`
is registered in this account (expiry 2027-08-12, auto-renew on), hosted zone
`Z023751015VNPXXICR3SC` exists and is authoritative, and an ACM certificate covering the apex **and**
`www` is already `ISSUED` in us-east-1 (valid to 2027-03-01) with its two validation CNAMEs still
present in the zone. Leave those CNAMEs alone — ACM needs them for renewal, not just issuance.

### 5.3 Serverless Framework needs an account (v4 only) — ✅ UNBLOCKED via a v3 pin

`npx serverless` floats to **v4** (4.41.0 as of writing), and **v4 refuses to run without an
authenticated Serverless Framework account**. Unpinned, the version therefore silently decides
whether your deploy needs a third-party credential at all. It is now pinned in
[infra/package.json](infra/package.json).

**Pinned to `^3` — deliberately temporary.** v3 needs no account, so the first launch is not blocked
on deciding *who owns* that account, which is entangled with the still-open §11 question of who runs
deploys long-term. Nothing else changes:

```bash
cd infra && npm install       # resolves the ^3 pin; do this once
npx serverless --version      # expect 3.40.x, no login prompt
```

`npm install` writes `infra/package-lock.json` — commit it, that is the point of pinning.

Verified compatible, so this is a version bump and not a fork in the road: the only
version-sensitive features this config uses are `${aws:accountId}` (v2.50+) and
`provider.ecr.images` (v2.31+), and v3.40.0 runs clean on this host's Node 22.

#### v3 cannot read an AWS SSO profile — the one real cost of the pin

**v3 predates AWS SSO.** It resolves credentials by looking for static keys, does not understand an
`sso_session` profile, and reports a perfectly valid one as missing:

```
Cannot resolve serverless.yml: Variables resolution errored with:
  - Cannot resolve variable at "resources.Resources.WebBucket.Properties.BucketName":
    AWS profile "isa-slackdata" doesn't seem to be configured
```

**This is not a broken profile.** `aws sts get-caller-identity --profile isa-slackdata` succeeds at
the same moment. Do not go re-running `aws configure sso` — the profile is fine, v3 simply cannot
read that shape. (Note the error surfaces during *variable resolution*, which makes it look like a
`${aws:accountId}` problem. It isn't: v3 needs the same credentials again at deploy time, so
removing the variables would only move the failure later.)

The fix is to hand v3 the already-resolved session as ordinary environment credentials:

```bash
unset AWS_PROFILE        # else v3 keeps trying the profile it can't read, and still fails
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"
```

`export-credentials` needs AWS CLI ≥2.9 (this host has 2.36). It exports `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` for the current SSO session — **short-lived
credentials that die with the session**, not new long-term keys, so no new secret is created and
nothing needs rotating. They live only in that shell's environment: never echo them, never write
them to a file, and per §0 never paste them into a chat. Re-run the `eval` after each
`aws sso login`.

**v4 makes this go away** — it resolves SSO profiles natively, so `AWS_PROFILE=isa-slackdata` just
works. Add that to the reasons not to sit on v3.

#### Moving to v4 (the intended destination — don't leave v3 indefinitely)

v3 is EOL and gets no security updates; it still bundles the end-of-support AWS SDK v2. Migration is
a bump in `infra/package.json` to `"serverless": "^4"`, `npm install`, and one env var — **no
`serverless.yml` changes.**

Two credentials in v4 have confusingly similar names. Getting this wrong sends you to a paywall:

| | What it is | Cost |
|---|---|---|
| `SERVERLESS_LICENSE_KEY` | CLI-only auth for teams | **Requires a paid subscription** — not our path |
| `SERVERLESS_ACCESS_KEY` | Generated from a free dashboard account | **Free** under $2M revenue — what we want |

The free tier holds for orgs under $2M annual revenue, and Serverless states it may be used "without
providing proof of eligibility" — the ISA files nothing.

To register: sign up at [app.serverless.com](https://app.serverless.com), create an org, then
**Settings → Access Keys → create key** (shown once — copy it immediately). Then
`export SERVERLESS_ACCESS_KEY=<key>` in the deploy shell.

- **Register under an ISA-controlled email, and name the org for the ISA** — not for a person, and
  not `slackdata` (the org will likely outlive this project). The signup email owns the org and
  receives password resets; a personal account makes one individual a bottleneck for every future
  deploy, at exactly the moment someone else needs to ship a fix.
- **Prefer the access key over `serverless login` on WSL.** `login` opens a browser, which this
  environment does not have — the §0.1 problem again (`BROWSER` unset, no `wslview`). The
  dashboard-generated key needs no browser from the CLI, and is also the credential CI/CD would
  need later.
- Treat the key like the AWS credentials in §0: password manager and deploy-shell environment only.
  Never a tracked file, never pasted into a chat.
- If it asks for a credit card, you are on a paid plan — back out.

### 5.4 The Lambda execution role is pre-created by the ISA (not by the deploy)

**Every Lambda requires an execution role** — it is a required property of the function, not a
security nicety. AWS will not create the function without one.

**This deploy cannot create it, by design.** The SSO permission set `slackdata-dev-access` is
`Allow *` with a short deny list, and one entry — `Sid: DenyIdentitySelfEscalation` — blocks
`iam:CreateRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:CreatePolicy` and friends. The
purpose is to stop a compromised dev session from minting itself an admin role. **Do not ask for
`iam:CreateRole` to be granted** — it would defeat the guardrail entirely. The first deploy attempt
failed here:

```
CREATE_FAILED: IamRoleLambdaExecution (AWS::IAM::Role)
  ... not authorized to perform: iam:CreateRole on resource:
  arn:aws:iam::<acct>:role/slackdata-prod-eu-central-1-lambdaRole
  with an explicit deny in an identity-based policy
```

Note `iam:PassRole` is **not** denied — using a role is fine, creating one is not.

**Reusing another service's Lambda role does not work.** Every role in the account scopes its logging
to its own prefix (`slackmap-prod-…` → `/aws/lambda/slackmap-prod*`, etc.), and none covers
`/aws/lambda/slackdata-prod*`. Borrow one and the API runs but writes **no logs at all** — Lambda does
not error when it cannot log, it just goes silent, which would leave §8's cold-start check blind.
They also carry DynamoDB and `ses:SendEmail` on `*`, which this API has no business holding.

**The resolution:** the ISA creates the role once, and
[infra/serverless.yml](infra/serverless.yml) references it via `provider.iam.role`, which reproduces
Serverless's own auto-generated name:

```yaml
iam:
  role: arn:aws:iam::${aws:accountId}:role/${self:service}-${self:provider.stage}-${aws:region}-lambdaRole
```

The role's policy is **CloudWatch Logs write and nothing else** — verified, not assumed: the app
makes zero AWS SDK calls (no boto3 anywhere), the catalog is a read-only SQLite file baked into the
image, and the one outbound call (`httpx.get` to the FX rates API in
[slack_data/utilities/fx.py](slack_data/utilities/fx.py)) needs no IAM permission because the
function runs outside any VPC. If a future phase adds a real datastore or an AWS service call, this
role needs a matching statement — and the ISA has to add it.

> **An alternative, if the ISA would rather not manage the role:** set `provider.cfnRole` to a
> CloudFormation execution role, and CloudFormation creates the Lambda role itself — legitimate,
> because CloudFormation holds the IAM rights rather than the human. The only such role in the
> account today is the **CDK bootstrap** role (`cdk-hnb659fds-cfn-exec-role-…`, trusts
> `cloudformation.amazonaws.com`, has `AdministratorAccess`). It works, but borrowing it couples
> SlackData's deploys to the CDK toolkit: a future `cdk bootstrap` could recreate or alter it and
> break deploys in a way that looks unrelated. A dedicated CFN deploy role would avoid that.

#### Two other things the permission set denies

- **`budgets:*` and `ce:*`** — so §9's `aws budgets create-budget` will fail. An ISA admin has to set
  the budget alarm, or it goes unset.
- **`ec2:*`** — which settles §2.2's mandatory-VPC worry: a VPC attachment can't be applied to this
  deploy anyway, and the stack correctly runs Lambda outside any VPC.

---

## 6. Deploy

```bash
cd infra

# Serverless v3 cannot read an SSO profile (§5.3), so hand it the resolved
# session as env credentials. On v4 this is just: export AWS_PROFILE=isa-slackdata
unset AWS_PROFILE
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"

npx serverless deploy --stage prod          # region comes from serverless.yml (eu-central-1)
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
# Must be 404 with a JSON body — if it returns HTML 200, §1.2 isn't fixed.
# Use GET, not `curl -I`: the routers declare GET only, so a HEAD request
# returns 405 on EVERY api path, valid or not, and tells you nothing.
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/webbing/999999"
curl -s "$BASE/api/webbing/999999"                        # {"detail":"Webbing 999999 not found"}
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

### Routine deploys — use [infra/README.md](infra/README.md) § Deploying to live
**This runbook is the one-time launch sequence; don't work through it again for an update.**
`infra/README.md` has the ongoing procedure: which of the two halves to deploy for a given change,
the credential bridge, the cache headers, invalidation, verification and rollback.

The short version: the catalog is baked into the Lambda image, so a **gear-data change** means
editing the root `*.json` and redeploying the **API** half (`npx serverless deploy --stage prod`) —
*not* a frontend sync, which is the usual reason a data edit appears to do nothing. A **frontend**
change means build → S3 sync → invalidate. No migrations, nothing stateful, either way.

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

- [x] ~~**Image rights.**~~ Resolved by the ISA (confirmed 2026-08-17).
- [ ] **Safety disclaimer.** Text drafted in [SAFETY_AND_ACCURACY.md](SAFETY_AND_ACCURACY.md) §A and
      under review. **Still needs building into the UI** — a footer line site-wide plus a callout on
      gear detail pages, next to the spec numbers someone might actually act on.
- [x] ~~**`LICENSE` file.**~~ Added, split two ways because the project is both software and a
      database: [LICENSE](LICENSE) is MIT and covers the code; [LICENSE-DATA](LICENSE-DATA) is
      CC BY-SA 4.0 and covers the gear catalogue, so a reuser must credit the ISA and share alike.
      Both files state explicitly that the images under `frontend/public/` are covered by **neither**
      and may not be redistributed on their basis.
- [ ] **Data-accuracy note.** Drafted in [SAFETY_AND_ACCURACY.md](SAFETY_AND_ACCURACY.md) §B; needs
      building into the UI alongside the item count and in the footer.

> **Schema issue worth logging separately:** `isa_certified` is `bool = False` on every gear type, so
> the data **cannot distinguish "not certified" from "unknown"**. Every un-recorded product reads as
> uncertified. Making it nullable three-state would let the UI say "unknown" honestly instead of
> relying on a disclaimer nobody reads. It is a model change, so it is deliberately out of scope for
> launch — but it is a correctness problem in a safety-adjacent field, not a nicety.

## 11. Still open with the ISA

- [x] ~~Region.~~ `eu-central-1`.
- [ ] Whether the deploy is run by us into their account (IAM role / GitHub OIDC) or by them from
      this config — this determines whether the credentials in §2 are a one-off or ongoing. **This
      also decides who owns the Serverless account from §5.3**, so settle both together.
- [x] ~~Confirmation that `slackdata.org` is registered in *this* account (§4.1).~~ Confirmed —
      registered here, hosted zone `Z023751015VNPXXICR3SC`, cert issued.
- [ ] Serverless Framework account — **deferred, not resolved.** Pinned to v3 to unblock launch
      (§5.3); v4 + an ISA-owned free account is the destination. Revisit once the deploy-ownership
      question above is settled, since the same answer decides both. v3 is EOL — do not let this
      sit.
- [x] ~~Any SCP or mandatory-VPC policy that affects §2.2.~~ Resolved by reading the permission set
      directly (§5.4): `Allow *` minus a deny list. No VPC issue (`ec2:*` is denied outright, and the
      stack runs Lambda outside a VPC by design). Everything the deploy needs is permitted **except**
      IAM role creation.
- [ ] **A Lambda execution role, created by an ISA admin** (§5.4) — the only thing blocking launch.
      Policy requested by email 2026-08-16.
- [ ] Budget alarm (§9) must be set by an admin — `budgets:*` and `ce:*` are denied to this
      permission set.
- [ ] Captcha provider, ahead of Phase 2 (Turnstile is free and simple).

---

### Order of operations, one line each

~~Pre-flight code fixes (§1)~~ ✅ → ~~SSO profile (§2)~~ ✅ → ~~region (§3)~~ ✅ `eu-central-1` →
~~domain + cert (§4)~~ ✅ already in place → ~~container smoke test (§5.1)~~ ✅ →
~~fill serverless.yml (§5.2)~~ ✅ → ~~Serverless version (§5.3)~~ ✅ pinned v3, account deferred →
**Lambda role created by the ISA (§5.4) ← blocked here, waiting on them** → retry `sls deploy` (§6)
→ sync SPA + invalidate (§6.1) → Route 53 aliases (§7) → smoke test (§8).

**Deployed successfully 2026-08-17** once the ISA created the role (263s). Stack `slackdata-prod` is
`UPDATE_COMPLETE`, the SPA + 900 objects are synced, and CloudFront is serving the whole site at
**`https://draeniek5tchz.cloudfront.net`**. Stack outputs:

| Output | Value |
|---|---|
| `WebBucketName` | `slackdata-web-prod-<accountId>` (resolved at deploy time) |
| `CdnDomain` | `draeniek5tchz.cloudfront.net` |
| `CdnDistributionId` | `E1BPDUT8FFKDOJ` |
| `HttpApiUrl` | `https://u3ivzkebia.execute-api.eu-central-1.amazonaws.com` |

Verified live through CloudFront: SPA loads, deep links work, images serve with the immutable cache
header, `index.html` with `no-cache`, HTTP→HTTPS redirects, and all three §1 pre-flight fixes hold in
production — `/api/fx/rates` returns `"stale":false` (§1.1), and `/api/webbing/999999` returns a JSON
`404` rather than an HTML `200` (§1.2). The distribution already carries the `slackdata.org` +
`www.slackdata.org` aliases and the ACM cert, so **only the Route 53 records in §7 remain** before the
real domain resolves.
