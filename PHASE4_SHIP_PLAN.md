# PHASE4_SHIP_PLAN.md — what still has to happen before brands can actually use the API

**Written 2026-08-25, after a failed `serverless deploy --stage prod`.** Hand this to an agent or
pick it up cold. It is ordered: nothing below § 3 can be done until § 1 and § 2 are.

The goal is **not** "Phase 4 deployed". It is **"a real manufacturer holds a credential and has
successfully updated their own gear."** Deploying the stack is one of six steps toward that, and it
is the only one that has been attempted.

---

## 0. Where things actually stand

| Thing | State |
|---|---|
| `slackdata-prod` CloudFormation stack | **`UPDATE_ROLLBACK_COMPLETE`** — recovered 2026-08-27, see § 1 |
| The live site (`https://slackdata.org`) | **Healthy.** `/` 200, `/api/webbing/?limit=1` 200 |
| Phase 2 (submissions) hosted | **Not live.** `POST /api/submissions/` → 404 (route never created) |
| Phase 4 (manufacturer API) hosted | **Not live.** `/api/manufacturer/me` → 404 |
| Phase 2/4 DynamoDB tables, uploads bucket, SPA routing function | **Not created**, and verified gone after the rollback |
| The admin Cognito pool | **Orphaned, not created.** A pool named `slackdata-admins-prod` survives outside the stack — delete it, see § 1 |
| Branch | PR #69 **merged to `main`** (squashed, `8992b7a`). The local branch keeps one later commit (`a2184b4`, a Cypress fix) plus the Phase 4 ship work; nothing else differs from `main`. |

Nothing shipped half-way. The rollback cancelled every new resource before it existed, so the
catalogue is exactly as it was on 2026-08-20. There is no data to clean up and no user-visible
damage. **Do not re-run the deploy until § 2 is fixed — it will fail identically.**

---

## 1. Recover the stack (blocker, ~2 min) — **DONE 2026-08-27**

`continue-update-rollback --resources-to-skip HttpApiStage` ran clean; the stack reached
`UPDATE_ROLLBACK_COMPLETE` and every resource is now `CREATE_COMPLETE`/`UPDATE_COMPLETE`. The site
was 200 before and after (`/` and `/api/webbing/?limit=1`, the latter serving real catalogue data).

**The skip was verified to be a true no-op.** The live stage was read before and after: `RouteSettings`
is `{}` and `DefaultRouteSettings` is `{"DetailedMetricsEnabled": false}` in both reads, and the API
carries exactly one route, `$default`. Both the forward update and the rollback 404'd *before*
writing anything, exactly as this section predicted.

Two things that read differently now that the account has been looked at:

- **The default throttle has never been live.** `DefaultRouteSettings` (50 rps / 100 burst) is in
  `serverless.yml` but not on the stage, so the API currently runs on AWS's account-level defaults.
  The next successful deploy applies it. Nothing to do, but "the ceiling exists" was not true.
- **One resource was orphaned by the failed rollback:** the Cognito user pool
  `slackdata-admins-prod` (`eu-central-1_kIHciXdAG`), created at 18:03:55Z — the exact second the
  cancelled deploy created it — and left behind when the rollback failed. It has **0 users and no
  domain**, and CloudFormation no longer tracks it. `SubmissionsTable`, `BrandClientsTable`,
  `UploadsBucket` and `SpaRoutingFunction` all rolled back cleanly (verified absent), and the
  globally-unique Cognito domain prefix `slackdata-admin-prod-387132903656` is **not** taken, so
  nothing blocks the next deploy.

  **Delete the orphan anyway.** The trap it created is now largely closed —
  `register.py --onboard` resolves the pool from the stack's `AdminUserPoolId` output rather than by
  name (§ 5), so it cannot pick the wrong one. But the orphan is untracked infrastructure with a
  name that means something, and anyone who *does* reach for the console still sees two identical
  entries in the picker. That failure is silent: the client is created, tokens mint, and every
  request 401s because the API verifies against the other pool's JWKS.

  ```bash
  aws cognito-idp delete-user-pool --user-pool-id eu-central-1_kIHciXdAG   # 0 users, orphaned
  ```

  (`slackdata-permcheck`, `eu-central-1_xaIj2Vgjx`, is the throwaway pool from the 2026-08-24
  permission test referenced in `serverless.yml`'s header comment. Also disposable, unrelated.)

### What was run



`UPDATE_ROLLBACK_FAILED` means CloudFormation could not even undo its own change: rolling
`HttpApiStage` back to its previous `RouteSettings` hit the same 404. The stack is frozen — it will
refuse every further update until it reaches `UPDATE_ROLLBACK_COMPLETE`.

```bash
cd infra
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"

aws cloudformation continue-update-rollback \
  --stack-name slackdata-prod --region eu-central-1 \
  --resources-to-skip HttpApiStage

# wait for UPDATE_ROLLBACK_COMPLETE
aws cloudformation describe-stacks --stack-name slackdata-prod --region eu-central-1 \
  --query 'Stacks[0].StackStatus' --output text
```

`--resources-to-skip HttpApiStage` is required: that resource is the one that cannot roll back.
Skipping it leaves the stage's *live* configuration as it is (the API Gateway stage itself was never
successfully modified — both attempts 404'd before writing), and marks it
`UPDATE_ROLLBACK_COMPLETE` so the stack unfreezes. Confirm afterwards that the site still answers
200 on `/` and `/api/webbing/?limit=1`.

---

## 2. Fix two real defects in `infra/serverless.yml` (blocker)

Both were found by reading the generated template in `infra/.serverless/cloudformation-template-update-stack.json`.
Neither is a credentials or permissions problem — the deploy would fail this way for anyone.

### 2a. `HttpApiStage` has no `DependsOn`, so it is updated before the routes exist

This is what actually failed:

> `Unable to find Route by key POST /manufacturer/gear within the provided RouteSettings (404)`

The `RouteSettings` block in the `extensions:` section names three route keys. The route resources
that create those keys (`HttpApiRoutePostManufacturerGear`, `HttpApiRoutePostSubmissions`) declare
`DependsOn: HttpApiIntegrationApi`, but **nothing makes the stage wait for them**. CloudFormation is
free to update the stage first, and did — 1.3 seconds before it would have created the routes. API
Gateway rejects route settings for a route key that does not exist yet.

This is inherent to a first deploy that adds both a route and its throttle, so it will recur on any
future route added to `RouteSettings`.

**Fix** — add a `DependsOn` to the existing `resources.extensions.HttpApiStage` block. Serverless v3
supports this (verified in `node_modules/serverless/lib/plugins/aws/package/lib/merge-custom-provider-resources.js:56`
— the value must be a **list**, it is spread onto the resource's existing `DependsOn`):

```yaml
  extensions:
    HttpApiStage:
      DependsOn:
        - HttpApiRoutePostSubmissions
        - HttpApiRoutePostManufacturerGear
      Properties:
        DefaultRouteSettings:
          ...
```

Add a comment saying why, because the failure mode is invisible until the day someone adds a fourth
throttled route.

### 2b. `POST /submissions` and `POST /submissions/` collide on one logical id

Independent of 2a, and it would fail the *next* deploy even after 2a is fixed.

`serverless.yml` declares both spellings as separate `httpApi` events, deliberately — the comment
explains that the un-slashed one must be throttled too, or it falls through to `$default` at the
generous global rate. But Serverless normalises both route keys to the **same** CloudFormation
logical id, `HttpApiRoutePostSubmissions`, and the last declaration wins. The generated template
contains exactly one route resource, with `RouteKey: POST /submissions/`.

So `POST /submissions` (un-slashed) is never created, while `RouteSettings` names it → the same 404
as 2a, on a different key.

**Fix options**, in order of preference:

1. Declare the un-slashed route by hand in `resources.Resources` under its own logical id
   (`HttpApiRoutePostSubmissionsNoSlash`), as an `AWS::ApiGatewayV2::Route` with
   `RouteKey: 'POST /submissions'`, `Target: !Join ['/', ['integrations', !Ref HttpApiIntegrationApi]]`,
   `ApiId: !Ref HttpApi`. Then add it to the `DependsOn` list from 2a. Keeps the stated intent
   (both spellings throttled) intact.
2. Drop the `POST /submissions` event **and** its `RouteSettings` entry, accepting that the
   un-slashed POST is throttled only at the default 50/100 before FastAPI 307-redirects it to the
   slashed path (which *is* throttled). Cheaper, and the redirect costs one Lambda invocation. If
   this is chosen, rewrite the comment — it currently claims a protection that would no longer
   exist.

### 2c. Re-verify before deploying again

There is no test covering the generated template's route/settings agreement, which is why this
reached production. Consider adding one — `infra/preflight.sh` could run
`npx serverless package` and assert every `RouteSettings` key has a matching `RouteKey`. That is a
~15-line check that would have caught both defects.

At minimum, run `npx serverless package --stage prod` and diff the route keys by hand:

```bash
cd infra && DEPLOY_MANUFACTURER_API=true npx serverless package --stage prod
python3 - <<'EOF'
import json
t=json.load(open('.serverless/cloudformation-template-update-stack.json'))
routes={v['Properties']['RouteKey'] for v in t['Resources'].values()
        if v['Type']=='AWS::ApiGatewayV2::Route'}
settings=set(t['Resources']['HttpApiStage']['Properties'].get('RouteSettings',{}))
print('routes  :', sorted(routes))
print('settings:', sorted(settings))
print('ORPHANED:', sorted(settings-routes) or 'none — good')
EOF
```

`ORPHANED` must be empty. Anything listed there is a guaranteed deploy failure.

---

## 3. Answer the onboarding trust question (blocker — this is the real one)

`MANUFACTURER_API_PLAN.md` § Open questions 2, unchanged since 2026-08-21:

> Who verifies that someone emailing from `sales@brand.com` speaks for that brand?

**This, not the deploy, is what stands between "Phase 4 exists" and "Phase 4 is in use."** The
mechanism is fully built and tested; it simply has no policy behind it. Until somebody decides how a
brand proves it is that brand, there is no defensible moment to run `register.py`.

It does not need a sophisticated answer, only a written one. A workable minimum, for a database with
76 manufacturers where onboarding happens maybe a dozen times a year:

- The request must come from an address at the brand's **own domain** — the same domain as the
  `website` field already in `manufacturers.json`. A gmail address is not proof and starts a
  conversation, not an onboarding.
- 34 of 76 manufacturers already have a scraped `contact_email` in `manufacturers.json`. Where one
  exists, **confirm out-of-band to that address** rather than replying to whoever wrote in — that
  turns an inbound claim into a challenge only the real brand can answer.
- Where none exists, the brand's public contact form or a socials account listed in
  `manufacturers.json` serves the same purpose.
- Record who approved it and on what evidence. A line per brand in a file is enough.

Whoever owns this decision at the ISA should sign off on it before the first credential is minted —
the whole point of the CLI-not-a-route design is that a human is in this loop on purpose.

**Deliverable: a short § Onboarding policy section in `infra/README.md`, next to the existing
"Onboarding a manufacturer" steps, replacing the current "This is the open question; until it has an
answer, no brand should be onboarded."**

## 3b. GDPR sign-off on `slackdata-brand-clients` (blocker, small)

`MANUFACTURER_API_PLAN.md` § Open questions 4, also still open. `contact_email` is personal data; the
record has **no TTL** (deliberately — an expiring credential mapping would lock a brand out
silently), and there is no `DeleteItem` grant, so removal is a manual act requiring a policy change.
That combination needs to go in front of the ISA before real contacts are stored. It is one
paragraph and one decision:

- Store `contact_email` at all? It is optional today and a client works with it null.
- If yes: what is the deletion path when a brand asks? (Currently: none — needs an IAM change.)

Cheapest resolution that unblocks shipping: **register the first brands with `--contact` omitted**,
and treat the field as future work. Nothing depends on it.

---

## 4. Deploy (once 1, 2, 3 are done)

Everything in one shell — the credentials, the Turnstile secret, and the Phase 4 flag all have to be
live for the same `serverless deploy`. This is the drift `preflight.sh` exists to catch.

```bash
cd infra
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"
unset AWS_PROFILE                       # serverless v3 cannot read an SSO profile
export TURNSTILE_SECRET='...'           # Cloudflare, the secret half
export TURNSTILE_SITE_KEY='0x4AAA...'   # Cloudflare, the public half
export DEPLOY_MANUFACTURER_API=true     # EXPORT it — preflight reads its own env

./preflight.sh                          # must be clean, not just warning-free
```

`preflight.sh` will still warn "on branch 'feat/...', not main" **unless you deploy from a branch off
`main`**, which is now the easy path: PR #69 was squash-merged into `main` as `8992b7a`, so all of
Phase 2/4's application code is already there. The only committed thing the local branch still holds
over `main` is `a2184b4` (a Cypress price-slider fix), plus the uncommitted § 2/§ 3/§ 6 work.

So the sequence is: branch off `origin/main`, commit this work onto it, merge, deploy from `main`.
That makes the deployed image's commit an ancestor of `main`, which is the whole point of the
warning.

Before the IAM-dependent parts run, confirm the Lambda role covers Phase 4's second table —
`slackdata-brand-clients-prod` is read on **every** authenticated manufacturer request, and a policy
scoped only to the submissions table deploys green then 500s at runtime:

```bash
aws iam get-role-policy --role-name slackdata-prod-eu-central-1-lambdaRole \
  --policy-name slackdata-prod-lambda --query 'PolicyDocument.Statement[?Sid==`SlackDataTables`]'
# Resource must be table/slackdata-*  (plus /index/*), NOT just the submissions table.
```

Then:

```bash
DEPLOY_MANUFACTURER_API=true npx serverless deploy --stage prod   # half A
./sync-env.sh prod                                                 # writes frontend/.env.production
cd ../frontend && npm run build                                    # half B — REQUIRED
# s3 sync --delete + CloudFront invalidation — infra/README.md § Deploying to live, B
```

**Half B is not optional here.** `sync-env.sh` only writes the env file; `VITE_COGNITO_AUTHORITY` and
`VITE_COGNITO_CLIENT_ID` are currently empty and are inlined by Vite at build time. Without a rebuild
and sync, `/admin` ships dark — and `/admin` is where a manufacturer's incoming updates are read.
The manufacturer API itself is server-side and works without half B, but nobody could act on what it
receives.

### Verify the deploy

```bash
./verify-deploy.sh                       # covers Phase 1 + Phase 2. It has NO Phase 4 checks.
```

Then Phase 4 by hand — **check the content type, not just the status**:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://slackdata.org/api/manufacturer/me
# want: 401 application/json
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  -H 'Authorization: Bearer not-a-real-token' https://slackdata.org/api/manufacturer/me
# want: 401 application/json
```

A `200 text/html` means CloudFront is rewriting API errors into the SPA — this API returns 403 for a
revoked credential and for cross-brand access, and a brand's integration would read that as success.

**Worth adding to `verify-deploy.sh` as part of this work** rather than leaving it as a manual step
in the README.

---

## 5. Onboard the first brand (this is "actually using it")

**Now two commands.** `register.py` gained `--check` and `--onboard` on 2026-08-27
(`slack_data/manufacturers/onboard.py`), so the console step is gone — along with the
wrong-pool trap that made it dangerous. Full runbook in `infra/README.md` § Onboarding a
manufacturer.

```bash
export AWS_PROFILE=isa-slackdata BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod

python -m slack_data.manufacturers.register --check 'Balance Community'
#   -> website, contact email, whether the domains agree, existing clients

#   ...verify out-of-band, per infra/README.md § Onboarding policy...

python -m slack_data.manufacturers.register --onboard \
    --brand 'Balance Community' \
    --verified-via 'replied to info@balancecommunity.com (manufacturers.json)'
```

`--onboard` resolves the pool from the stack output (never by name), creates the app client with a
secret + `client_credentials` + exactly `slackdata/gear.write`, maps it to the brand, **proves it
end to end via `GET /manufacturer/me`**, appends the ledger row, and writes the credential to a 0600
file whose path is the only thing printed. Any failure after the app-client create deletes the
client again.

It refuses to run without `--verified-via`, and it refuses today with "Phase 4 is not deployed yet"
— verified against the live account on 2026-08-27, creating nothing.

Revocation is unchanged, one command, effective on the next request:

```bash
BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod \
  python -m slack_data.manufacturers.register --client-id '<id>' --deactivate
```

Then edit that row's Status in `infra/onboarded-brands.md` — the only column ever edited by hand.

## 6. The gap nobody has filled: brands have nothing to read

`grep` finds no brand-facing documentation anywhere in the repo. `MANUFACTURER_API_PLAN.md` is an
internal design document; `infra/README.md` is an operator runbook. A manufacturer handed a
`client_id` and a secret today has **no document telling them how to get a token, what to POST, or
what comes back.**

This is the difference between shipped and usable, and it is probably a day's work:

- How to get an access token (Cognito token endpoint — the `ManufacturerTokenUrl` stack output,
  `client_credentials`, scope `slackdata/gear.write`).
- `GET /manufacturer/gear` — discover our ids for your products. **Start here**; the whole identity
  scheme assumes they do.
- `POST /manufacturer/gear` — the batch shape, the 50-item cap, which field names are accepted, and
  that the response **echoes the resolved `gear_id` back** so their mapping self-corrects.
- `GET /manufacturer/submissions` — reading back what they sent, including `review_note`.
- What the status codes mean, especially **502 with a `batch_id`** (partial write — a blind retry
  duplicates; quote the `batch_id` instead) and **503** (re-registration needed).
- That an update is **auto-approved but not instantly live** — it becomes a JSON patch an admin
  applies, followed by a redeploy. Setting this expectation up front prevents the first support
  email.

Publish it wherever brands will actually find it — a page on slackdata.org is the obvious home,
which makes it frontend work, not just a markdown file.

---

## 7. Known gaps that do NOT block shipping

Record them so they are not rediscovered as surprises:

- **Photos are not built.** `MANUFACTURER_API_PLAN.md` § Suggested order 4. `UploadsBucket` is in
  `serverless.yml` and will be created, but nothing writes to it. `MAX_BODY_BYTES` (256 KB) is sized
  for JSON, not images.
- **The triage UI's manufacturer path has no Cypress coverage** (§ Suggested order 3). Batch
  grouping, the manufacturer badge, the SKU and the reject-an-approved-row path are all untested
  end-to-end.
- **`BrandPermission.WRITE` is designed for but not honoured** — `may_write_directly()` returns
  False structurally, because the hosted catalogue is physically read-only. A test pins this, so
  flipping it will be deliberate.
- **The route throttle is per-stage, not per-brand.** HTTP APIs have no usage plans; per-brand quotas
  are a REST API migration, not a setting.
- **A compromised brand credential writes permanent rows** — manufacturer submissions are stored
  APPROVED and never expire. Bounded by the throttle (1/sec, burst 10) and the 50-item cap, unbounded
  in total. Mitigation is `--deactivate` first, triage second (rejecting restores the TTL).

---

## Checklist

Everything not needing the ISA's AWS session was done on 2026-08-25; the rest is
credential-holder work and is marked **you**.

- [x] § 1 Stack recovered to `UPDATE_ROLLBACK_COMPLETE`; site still 200 (2026-08-27)
- [ ] **you** — delete the orphaned Cognito pool `eu-central-1_kIHciXdAG` before § 5
- [x] § 2a `HttpApiStage` gains `DependsOn` on all three route resources
- [x] § 2b Collision resolved by option 1 — `HttpApiRoutePostSubmissionsNoSlash` is a hand-declared
      `AWS::ApiGatewayV2::Route`, so both spellings keep their 2/5 throttle
- [x] § 2c `infra/check-routes.py` — checks the source (no creds, no `serverless package`), run by
      both `preflight.sh` and `tests/test_infra_routes.py`, whose three mutation tests re-create the
      defects that shipped
- [x] § 3 Onboarding policy written into `infra/README.md`; ledger at `infra/onboarded-brands.md`
- [ ] **you** — § 3 Sign-off from whoever holds the ISA's slackdata mailbox
- [x] § 3b Decided: register with `--contact` omitted. `register.py`'s docstring and the README's
      example now agree; MANUFACTURER_API_PLAN.md § Open questions 2 and 4 are closed
- [x] § 4 IAM role confirmed to cover `table/slackdata-*` **and** `/index/*` (checked 2026-08-27:
      PutItem/GetItem/Query/UpdateItem, no DeleteItem, no Scan — as designed)
- [ ] **you** — § 4 `preflight.sh` clean with `DEPLOY_MANUFACTURER_API` **exported**
- [ ] **you** — § 4 Half A deployed, `sync-env.sh` run, **half B built and synced**
- [ ] **you** — § 4 `verify-deploy.sh` green (it now has the Phase 4 checks; they are no longer a
      manual curl step)
- [x] § 5 Tooling: `--check` / `--onboard` (`manufacturers/onboard.py`, 23 tests) — one command
      creates the client, maps it, proves it, ledgers it, and writes the secret to a 0600 file
- [ ] **you** — § 5 First brand actually onboarded with it
- [x] § 6 Brand-facing documentation: `MANUFACTURER_API.md` + the `/for-manufacturers` page, linked
      from the site footer. Its field lists are pinned to the API's derived list by
      `tests/test_frontend_contract.py`; the page has a Cypress spec
- [ ] **you** — § 6 Published, i.e. half B built and synced (the page is in the build already)
- [ ] A real manufacturer has successfully updated a real product

### What changed on 2026-08-25

| File | Why |
|---|---|
| `infra/serverless.yml` | § 2a `DependsOn`; § 2b the hand-declared un-slashed route |
| `infra/check-routes.py` | new — § 2c |
| `infra/preflight.sh` | runs the route check; the new failure mode in the header list |
| `infra/verify-deploy.sh` | § 4's Phase 4 checks, incl. the content-type trap |
| `infra/README.md` | § Onboarding policy, § What we store about a brand contact |
| `infra/onboarded-brands.md` | new — the § 3 audit trail |
| `MANUFACTURER_API.md` | new — § 6, brand-facing |
| `frontend/src/pages/ManufacturerApiPage.tsx` | new — § 6, `/for-manufacturers` |
| `frontend/src/components/layout/SiteFooter.tsx` | the only route into it |
| `tests/test_infra_routes.py` | new — § 2c's regression guard |
| `tests/test_frontend_contract.py` | pins the doc's field lists to the derived list |
| `slack_data/manufacturers/register.py` | the stale `catalog_id` docstring; the `--contact` line |
| `MANUFACTURER_API_PLAN.md` | open questions 2 and 4 closed |

Backend suite 676 passing; frontend build, lint and unit clean; the new Cypress spec and the
footer-sensitive ones pass.
