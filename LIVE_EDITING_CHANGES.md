# Live editing, phases 0–2 — what changed, how it is tested, what is verified

A record of the live-editing work of 2026-10-13: what changed, which tests cover it, and — for each
part — whether it has been **verified locally** or can only be verified **once deployed**.

It is three stacked branches, one per phase: `live-editing/0-groundwork` →
`live-editing/1-isa-sign-in` → `live-editing/2-catalogue-store`. Not deployed yet.

The design is [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md). Each phase has its own file with the
build details and the rollout steps: [phase 0](LIVE_EDITING_PHASE_0.md),
[phase 1](LIVE_EDITING_PHASE_1.md), [phase 2](LIVE_EDITING_PHASE_2.md).

---

## 1. What changed

### Phase 0 — groundwork

| Change | Why |
|---|---|
| `slack_data/deployment.py` `is_hosted()`: hosted if **any** of the Lambda runtime's `AWS_LAMBDA_FUNCTION_NAME`, `SLACKDATA_DEPLOYMENT=hosted`, or the baked catalogue | The dev tokens in this public repo were refused hosted only because the image baked a catalogue file. Phase 2 can stop baking it, and phase 1 removes the pool — either would have opened production to the dev tokens |
| `SLACKDATA_DEPLOYMENT=hosted` set in `Dockerfile.lambda` and `infra/serverless.yml` | One of the two signals we control; either alone keeps the guard shut |
| The admin, manufacturer and captcha guards all ask `is_hosted()` | One answer, not three copies |

The ISA requests (§ 12 of the plan) were checked against the live role and pool: all applied.

### Phase 1 — ISA sign-in, people, roles, the change log, API keys

| Change | Where |
|---|---|
| People sign in with their **ISA account** (the `isa-users` pool, SlackData's own client in it); `verify_isa_token` requires our client as the audience | `slack_data/api/auth.py` |
| A **people store**: one record per ISA account, roles read on every request | `slack_data/models/people.py`, `slack_data/people/` |
| The **first admins** by verified ISA email (`ADMIN_BOOTSTRAP_EMAILS`, from the deployer's shell), granted once and logged | `auth.py` `sync_person` |
| An **append-only change log**, public at `GET /changes`; role grants and revocations are written with their record in one DynamoDB transaction | `slack_data/models/changes.py`, `slack_data/changelog/` |
| Routes: `GET /me`, `POST /me/notice`, `GET /admin/admins`, `POST /admin/roles`, `GET /changes` | `slack_data/api/routers/people_router.py` |
| **Manufacturer API keys** (`Bearer <client_id>:<secret>`) instead of Cognito tokens; onboarding mints keys locally; a script copies the three existing secrets out of the old pool | `auth.py`, `slack_data/manufacturers/`, `scripts/import_brand_keys_from_cognito.py` |
| **SlackData's own Cognito pool removed** from the template; `PeopleTable` and `ChangelogTable` added | `infra/serverless.yml` |
| **Frontend:** site-wide sign-in loaded only on demand, returning to the bare origin; the first-sign-in notice; the account menu; the admins panel | `frontend/src/auth/`, `frontend/src/components/account/`, `AdminPage.tsx` |
| Brand docs, deploy scripts, infra README and CLAUDE.md updated | `MANUFACTURER_API.md`, `ManufacturerApiPage.tsx`, `infra/*.sh`, `infra/README.md` |

### Phase 2 — the catalogue store

| Change | Where |
|---|---|
| A **catalogue store**: one document per seed entry, verbatim; nothing derived is stored | `slack_data/catalogue/` |
| An **in-memory build** from the store, through today's loaders unchanged | `catalogue/build.py`, `load_data/_seed_io.py` `seed_sources()` |
| A **live catalogue**: one version read per request, rebuilt only when it moved | `catalogue/live.py`, `database.py` |
| The **importer** and the **shadow check** (`--check`: documents and built catalogues compared) | `catalogue/importer.py` |
| The **switch-over** is one variable, `CATALOG_SOURCE=store`; anything else is today's behaviour | `database.py`, `serverless.yml` |
| A public **export route**, and the **daily export** script and workflow for the data repo | `api/routers/catalogue_router.py`, `export/` |
| `CatalogTable`; preflight runs the shadow check; verify-deploy reports the store | `infra/` |

---

## 2. Tests

**Backend: 1108 tests, all passing** — the full suite, run once at the end with dynamodb-local up,
so the DynamoDB tests ran rather than skipped.

| File | Tests | Status | Covers |
|---|---|---|---|
| `tests/test_catalogue.py` | 37 | **new** | every real seed round-trips byte for byte; store-built == file-built catalogue, every row; an edit is exactly one difference; importer plan / retire / revive; the CLI applies then checks clean; version-driven rebuilds, failed rebuilds, outages; the export route |
| `tests/test_people.py` | 26 | **new** | `/me`, the notice, admin-only routes, grant by verified email or ISA id, ambiguity, last-admin guard, logging, the public log and name look-up, no catalogue session |
| `tests/test_auth.py` | 59 | rewritten | the ISA verifier (audience, issuer, expiry, forged and unsigned tokens, JWKS cache), profile sync, anonymisation, bootstrap once and never again, every hosted signal alone locking out the dev token |
| `tests/test_manufacturer_api.py` | 141 | auth part rewritten | API keys: right key, wrong secret/client/format, no key, revoked, constant-time compare; the dev token is a wrong key hosted |
| `tests/test_manufacturer_onboarding.py` | 20 | Cognito part replaced | keys are random and safe to send; onboarding touches no AWS |
| `tests/test_dynamo_stores.py` | 39 | extended | people and change log tables built from the template; conditional append refuses an overwrite; the grant + record **transaction** (a duplicate id cancels both); the whole real catalogue through DynamoDB; the version counter |
| `tests/test_live_api.py` | 31 | extended | real servers: hosted with no baked catalogue, the ISA pool configured, a real API key hosted; **store mode with the real seeds**: serves the catalogue, mounts no writes, an edit in the store served on the next request, the export script reproducing the store |
| `tests/test_read_only.py` | 40 | updated | the people routes named as deliberate writable exceptions; no catalogue session in them |
| `tests/test_submissions.py` | 72 | wiring only | the new stores wired into the no-catalogue-session test |

**Frontend:** build, lint and 315 unit tests pass. Cypress: `account.cy.ts` (**new**, 11 tests:
notice, account menu, not-an-admin, admins panel) and the updated `admin_triage.cy.ts` (15) pass
against real local servers. The new spec is in `cypress/shards.json`; CI's API now gets scratch
people and change log stores.

**Not run:** the other 26 Cypress specs (CI runs them on the PR). No frontend code changed in
phase 2.

---

## 3. What is verified locally, and what only a deploy can verify

### Verified locally — by running the app, not only by tests

| What | How |
|---|---|
| Phase 0: every hosted signal alone refuses the dev tokens; none of them leaves local dev working | pytest, and a real server with only `SLACKDATA_DEPLOYMENT=hosted` |
| Sign-in state, `/me`, the notice recorded once | the running API (curl) and headless Chromium |
| The notice, account menu, admins panel, sign-out, not-an-admin page | headless Chromium against the running site, with screenshots |
| Granting and revoking admin, its refusals, and the public log showing it with names | the running API |
| A brand key, end to end: minted by the real CLI, proven against the API, accepted, refused when wrong, refused when revoked | the running API |
| The sign-in library stays out of the main bundle (72 KB lazy chunk) | the production build, and the browser's requests |
| Catalogue store: importer dry run → apply → check clean | the real CLI against a local store |
| Store mode serves the whole site; an edit in the store appears on the next page load with no restart; derived fields (co-listings, enrichment) still present | the running site in store mode, headless Chromium |
| The shadow check catches drift, and a re-import repairs it | the real CLI |
| The export of all 12 collections is byte-identical to the seed files | the export script against the running server, then `cmp` |
| DynamoDB behaviour: indexes, conditional writes, the transaction, paging, the version counter | dynamodb-local, tables built from `serverless.yml` |

### Only verifiable once deployed

| What | Why it cannot be checked locally | How to check it |
|---|---|---|
| **A real ISA sign-in** (hosted page, redirect back to the bare origin, token audience) | Needs a real ISA account in a browser. Locally possible by hand (localhost is a registered callback), but not run | Sign in at `/admin` after the deploy; or locally per `frontend/.env.development` |
| The **bootstrap** of the named admins | Needs their verified ISA sign-ins and `ADMIN_BOOTSTRAP_EMAILS` set | `/api/changes` shows a `bootstrap` grant after each first sign-in |
| The **Lambda role** allows every call the new code makes (Query on indexes, the transaction, conditional puts) and the **change-log deny** holds | IAM exists only in the ISA's account; dynamodb-local enforces no IAM | The first grant on the live site succeeds; a deliberate `UpdateItem` on the log table is refused |
| The **template** deploys: new tables, Cognito resources removed, the old pool orphaned rather than deleted | CloudFormation only | `preflight.sh`, the deploy, then `verify-deploy.sh` |
| The **three brands' existing secrets** work as keys after the import | The secrets are in the old pool | `import_brand_keys_from_cognito.py --apply`, then `curl` with one brand's key |
| **Store mode on Lambda:** cold-start build time, memory, the per-request version read | Lambda's CPU, memory and network differ; locally a build takes ~2 s | Lambda logs ("catalogue version N built … in X s") and latency after `CATALOG_SOURCE=store` |
| The **daily export** in the data repo | It runs in GitHub Actions in another repository | Copy the two files from `export/`, run the workflow once by hand |
| The **hosted shadow check** against `slackdata-catalog-prod` | Needs AWS credentials and the real table | `preflight.sh` (runs `importer --check`) |

---

## 4. Open items and risks

- **Rename loses the photo.** Images and manuals are keyed by product name, so renaming a product
  in the store drops its photo on the page. Must be fixed before phase 3 opens renames.
- **Deploy order matters for phase 1:** import the brands' secrets *before* the deploy that drops
  the pool; tell the three brands their token request stops working.
- **After phase 2's switch-over, stop hand-editing the root seeds**; until phase 3, a correction is
  a seed edit plus `importer --apply`.
- **Tests still read the root seeds**, not a pinned data-repo snapshot (D34, D49) — the right swap
  once the seeds stop being edited.
