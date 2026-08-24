# SUBMISSIONS_PLAN.md — Phase 2: submit-a-change + admin triage

Implementation plan for the next agent. Phase 1 (public read-only catalogue) is **live** at
`https://slackdata.org` — see [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) for how it got there and
[infra/README.md](infra/README.md) § Deploying to live for how to ship changes.

Read [LAUNCH_RUNBOOK.md §0.2](LAUNCH_RUNBOOK.md) before starting. Its two-data-domains principle is the reason
this phase is additive, and the reason it must not become a catalogue rewrite.

---

## What Phase 2 is

- A **"Suggest a correction"** button on every gear detail page → a form → a stored submission.
- A **single admin login** (Emile) → a triage page listing pending submissions → approve / reject.
- Nothing else. No public accounts, no live catalogue editing.

## What Phase 2 is explicitly NOT

**The catalogue does not become writable.** It stays a read-only SQLite file baked into the Lambda
image, sourced from the root `*.json` in git. A submission is *a note to the admin*, not an edit.

**Approving a submission does not change the site.** It marks the record approved and gives the admin
the exact JSON patch to apply. The data still changes the way it does today: edit the root `*.json`,
redeploy (`infra/README.md` half **A**). Anything else is a different, larger project — see
*Phase 4* at the bottom.

Say this plainly in the admin UI, or the first thing that happens after launch is someone approving
twenty submissions and wondering why the site looks identical.

---

## Step 0 — close the open write endpoints (blocking, do this first)

`https://slackdata.org/api/docs` is **public** and documents **27 unauthenticated write endpoints**
(`POST` / `PATCH` / `DELETE` across every gear router and `/brand`), with a working "Try it out".

They are inert today only because the catalogue is opened `mode=ro&immutable=1`
([slack_data/database.py](slack_data/database.py)) — a write fails at the SQLite layer. **Phase 2
introduces a writable store and an IAM role that can reach it**, so this guard must land *before* any
of that, not after.

Required:

1. In [slack_data/main.py](slack_data/main.py), do not register the catalogue write routes when
   `database.READ_ONLY` is true. Prefer excluding them at router-registration time over per-route
   403s, so they vanish from the OpenAPI schema entirely.
2. Disable `/docs`, `/redoc` and `/openapi.json` in the hosted app (`docs_url=None` etc. when
   `READ_ONLY`), or gate them behind the admin auth added later in this phase.
3. Add a pytest that asserts a `PATCH`/`DELETE` on a gear route returns **404** when `READ_ONLY`, and
   still works in local dev mode. This is the regression guard — without it, the routes come back the
   next time someone refactors `main.py`.

Ship Step 0 on its own, verify with `curl -s https://slackdata.org/api/openapi.json`, and only then
start the rest.

> **Status (2026-08-17): built, not yet deployed.** `slack_data/api/routing.py` registers only the
> safe methods when `READ_ONLY`; `main.py` and `tests/conftest.py` both build their app through it.
> `tests/test_read_only.py` (34 tests) is the guard. One correction to the requirement above: a
> write on a gear route answers **405, not 404** — the path still exists because its `GET` twin is
> registered, and Starlette answers a known path with an unknown method that way. No handler runs
> and no body is validated, which is the property that matters; a 404 would only be reachable by
> removing the read route too. **Deployed 2026-08-18** — verified live: `/api/openapi.json` and
> `/api/docs` both 404, and `POST`/`PATCH`/`DELETE` on the catalogue all answer 405.

---

## Blocking external dependency — request this on day one

**The Lambda execution role is owned by the ISA, not by this repo.** Emile's SSO permission set denies
`iam:CreateRole` under a `DenyIdentitySelfEscalation` guardrail, so the role
`slackdata-prod-eu-central-1-lambdaRole` was created by an ISA admin and is referenced via
`provider.iam.role` in [infra/serverless.yml](infra/serverless.yml). See LAUNCH_RUNBOOK.md §5.4.

**Done — granted and applied 2026-08-23, re-confirmed 2026-08-24.** It held CloudWatch Logs and
nothing else; it now also carries DynamoDB. What was actually granted is **broader than the sketch
this section originally carried**, in the one way that matters:

```json
{
  "Sid": "SlackDataTables",
  "Effect": "Allow",
  "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"],
  "Resource": [
    "arn:aws:dynamodb:eu-central-1:<accountId>:table/slackdata-*",
    "arn:aws:dynamodb:eu-central-1:<accountId>:table/slackdata-*/index/*"
  ]
}
```

`table/slackdata-*` rather than the submissions table by name — which is what lets Phase 4's
`slackdata-brand-clients-prod` work without a further request. Do not narrow it back. `Scan` was
dropped (nothing reads the table without a key), and `DeleteItem` is deliberately absent — submissions
are append-only and status changes are updates, so nothing is ever hard-deleted (see *Privacy*).

The authoritative text is [infra/ISA_ROLE_REQUEST_PHASE2.md](infra/ISA_ROLE_REQUEST_PHASE2.md); the
reasoning per grant is in [infra/LAMBDA_ROLE_PERMISSIONS.md](infra/LAMBDA_ROLE_PERMISSIONS.md).
Turnaround on both requests was same-day — but note this is the *execution* role. Deploy-time
permissions are a separate principal entirely, and no grant here touches them.

**A second constraint that rules out the conventional answer:** the permission set denies `ec2:*`,
and RDS / Aurora / EFS all require a VPC. **DynamoDB is the only writable store deployable without
going back to the ISA.** A NAT gateway would also add ~$32/month and break the ≈$0-idle premise the
whole architecture rests on. Do not propose Postgres.

---

## Architecture

### Store — one DynamoDB table

`slackdata-submissions-${stage}`, on-demand billing (≈$0 idle), defined in `infra/serverless.yml`
alongside the existing resources.

| | |
|---|---|
| PK | `submissionId` — ULID (sortable by creation time) |
| GSI | `status-createdAt-index`: PK `status`, SK `createdAt` — the triage query is "pending, oldest first" |

Item shape:

```jsonc
{
  "submissionId": "01JD...",
  "kind": "correction",          // "correction" | "new_item"  (new_item optional, see below)
  "gearType": "webbings",        // slug, matches config/gearTypes
  "gearId": 42,                  // null for new_item
  "gearName": "Core 2 HS",       // denormalized so triage reads without touching the catalogue
  "changes": { "breaking_strength": "44.0", "width": "25" },  // field -> proposed value, strings
  "note": "Manufacturer site says 44kN not 40kN",
  "sourceUrl": "https://...",    // optional evidence link — ask for this, it makes triage fast
  "submitterEmail": null,        // optional, see Privacy
  "status": "pending",           // pending | approved | rejected
  "createdAt": "2026-08-20T10:00:00Z",
  "reviewedAt": null,
  "reviewNote": null
}
```

`changes` is a free-form map of field → proposed value, **validated against the real model fields**
for that gear type. Do not invent the field list: read `slack_data/models/<type>.py` (the
frontend↔backend contract rule in [CLAUDE.md](CLAUDE.md) applies to this too). Reject unknown field
names at the API boundary so triage never shows a typo'd field.

### Keep the store behind a repository interface

**Do not call `boto3` from the routers.** Define a `SubmissionRepository` protocol with two
implementations:

- `DynamoSubmissionRepository` — hosted.
- `SqliteSubmissionRepository` (or in-memory) — local dev and tests.

Selected by env var, the same way `CATALOG_DB_PATH` already switches the catalogue between modes.

This is not architectural purity — it is what keeps `pytest` and the Cypress suite runnable with no
AWS credentials and no network, which is how every existing test in this repo works. Losing that
would be a serious regression in the project's feedback loop.

### API routes

New router `slack_data/api/routers/submissions_router.py`:

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/submissions` | public | Rate-limited + captcha. Returns `201` and the id. |
| `GET` | `/submissions` | **admin** | `?status=pending` — the triage list, via the GSI |
| `GET` | `/submissions/{id}` | **admin** | |
| `PATCH` | `/submissions/{id}` | **admin** | `{status, reviewNote}` only. Never edits `changes`. |

`POST /submissions` must work while the catalogue is read-only — it writes to DynamoDB, a different
store. Confirm that explicitly in a test; it is the single most likely thing to be broken by a
careless reuse of the catalogue `SessionDep`.

### Auth — Cognito, one user

A Cognito user pool with **self-signup disabled** and exactly one user created by hand. Cognito is
available (`cognito-idp` is not denied, and the account already runs pools for `isa-users` and
`slackmap`), and 50k MAU is free.

- Backend: verify the Cognito JWT (issuer, audience, `exp`, RS256 against the pool's JWKS) in a
  FastAPI dependency. Cache the JWKS in a module-level dict with a TTL — the same pattern
  [slack_data/utilities/fx.py](slack_data/utilities/fx.py) uses, and for the same reason: Lambda's
  filesystem is read-only, so a module global is the only cache available.
- Frontend: `react-oidc-context` + `oidc-client-ts` is enough and much lighter than full Amplify.

**Protect the admin routes server-side.** Hiding the UI is not access control. A test that hits
`GET /submissions` with no token and expects `401` is part of Definition of Done.

### Admin UI

New route `/admin` in the SPA (static segment — it must outrank the `:slug` gear-type pattern, the
same way `/safety` and `/manufacturers` do; see the comment at the top of
[frontend/src/App.tsx](frontend/src/App.tsx)).

- Unauthenticated → a login prompt, not a 404.
- Pending list, oldest first: gear name + type, proposed changes as a **current → proposed** diff,
  the note, evidence link, age.
- Approve / Reject, each with an optional review note.
- On approve, show a **copy-pasteable JSON snippet** for the root `*.json` file, and say in plain
  words that the change is not live until the JSON is edited and the API redeployed. Link
  `infra/README.md` § Deploying to live.

---

## Abuse, spam and cost control

Public unauthenticated `POST` will attract bots. From [LAUNCH_RUNBOOK.md §10](LAUNCH_RUNBOOK.md), all three
from day one:

1. **Cloudflare Turnstile** — free, no account friction. Verify the token server-side; a token that
   is merely *present* is not a check.
2. **API Gateway throttling** on the submissions route specifically. The read-only catalogue routes
   are cached by CloudFront and are not the risk.
3. **Honeypot field** — hidden input that humans never fill; discard silently (200, not 400, so bots
   learn nothing).

Cap the request body size and the number of `changes` keys. A submission is a correction, not a bulk
upload.

---

## Privacy — this is an EU organisation

The ISA is EU-based and the stack runs in `eu-central-1`. `submitterEmail` is personal data under
GDPR, so:

- Keep it **optional**, and say next to the field exactly what it is used for (following up on this
  correction) and nothing else.
- Do **not** store IP addresses or user agents. They are tempting for abuse triage and they turn an
  anonymous suggestion box into a personal-data store. Turnstile plus throttling covers abuse.
- Set a **TTL attribute** on the table so resolved submissions expire automatically (12 months is a
  reasonable default — confirm with the ISA). DynamoDB TTL deletion is free and needs no job.
- Add a line to the privacy/data note about what a submission stores and how long it is kept.

Flag to the ISA that this phase begins collecting personal data, before it ships.

---

## Infrastructure changes

All in [infra/serverless.yml](infra/serverless.yml):

- The DynamoDB table + GSI + TTL attribute.
- The Cognito user pool + app client (self-signup off).
- Table name and pool ids into the function's environment.
- The `/api/*` CloudFront behaviour already forwards all query strings and no cookies, and the
  CloudFront Function strips `/api` — **`/api/submissions` needs no CloudFront change**. Verify
  rather than assume; a distribution change costs ~15 minutes of propagation.

Deploy notes that will otherwise cost an hour:

- Serverless is pinned to **v3** and cannot read an SSO profile. Use the credential bridge in
  `infra/README.md` Step 0 (`unset AWS_PROFILE` then `aws configure export-credentials`).
- Deploy half **A** (`npx serverless deploy --stage prod`) for anything in `slack_data/` or
  `serverless.yml`; half **B** (build + S3 sync + invalidate) for the frontend. The admin UI is B.

---

## Testing — no CI exists, run these yourself

The repo's standard is real behaviour, not mocks-of-everything: 332 pytest, 78 node unit tests, 14
Cypress specs against a live backend.

- **pytest** — the submissions router against the local repository implementation: create, list by
  status, approve, reject, reject-unknown-field, reject-oversized-payload, honeypot, and the
  READ_ONLY guard from Step 0. Add `moto` as a dev dependency only if you test the Dynamo
  implementation directly; the repository abstraction should make that optional.
- **Auth tests** — every admin route returns `401` without a token and `403` with a valid token for a
  non-admin. Do not skip this because there is only one user.
- **Cypress** — the submit form (validation, honeypot, success, failure), and the admin page
  (redirects when logged out, lists pending, approve moves it out of the list). Stub the Cognito
  token; do not put real credentials in the suite.
- **Update [DESIGN.md](DESIGN.md) *before* writing Cypress specs** — that file says so at the top,
  and the existing specs follow it.

Run before deploying: `.venv/bin/python -m pytest tests/ -q`, `cd frontend && npm run build &&
npm run lint && npm run test:unit`, then the Cypress suite with `env -u ELECTRON_RUN_AS_NODE npx
cypress run` (the unset is required under VS Code or Cypress dies with SIGILL).

---

## Definition of done

- [x] Step 0 shipped and verified: no write endpoints in the public OpenAPI schema.
- [x] **ISA has extended the Lambda role.** Granted and applied 2026-08-23, re-confirmed against the
      live role 2026-08-24 — see [infra/ISA_ROLE_REQUEST_PHASE2.md](infra/ISA_ROLE_REQUEST_PHASE2.md).
      *Deploy succeeds* is untested: nothing has been deployed since.
- [x] A correction submitted from a gear page appears in the admin triage list.
- [x] Admin routes reject unauthenticated requests **server-side**.
- [x] Approving shows the JSON patch and states that a redeploy is required.
- [x] Turnstile, throttling and honeypot all active and tested.
- [x] TTL set; no IP or user-agent stored.
- [x] All suites green; DESIGN.md and infra/README.md updated.

> **Status (2026-08-24): built and green locally; still not deployed.** 622 pytest / 130 node unit
> pass, the frontend builds clean, and the role blocker below is cleared.
>
> | | |
> |---|---|
> | Backend | `models/submissions.py`, `submissions/` (repository + Dynamo + store + fields), `api/auth.py`, `utilities/turnstile.py`, `utilities/ulid.py`, `api/routers/submissions_router.py` |
> | Tests | 622 pytest (was 422 at first build) — `test_submissions.py`, `test_auth.py`, `test_ulid.py`, `test_frontend_contract.py`, plus `test_live_api.py` over real HTTP and `test_dynamo_stores.py` against a real DynamoDB |
> | Frontend | `SubmissionDialog`, `SuggestButton`, `AdminPage`, `auth/AdminAuthProvider`, `config/correctableFields.ts` |
> | Frontend tests | 130 node unit (was 78); Cypress `submissions.cy.ts` 14 + `admin_triage.cy.ts` 15 |
> | Infra | DynamoDB table + GSI + TTL + PITR, Cognito pool/client/domain, per-route throttling, `pyjwt[crypto]` + `boto3` declared |
>
> **What still stands between this and a deploy** is no longer the role. It is: an uncommitted
> working tree (the Lambda image is built from it, and `infra/preflight.sh` hard-fails on a dirty
> one), and **Turnstile's two halves** — `VITE_TURNSTILE_SITE_KEY` in `frontend/.env.production` and
> `TURNSTILE_SECRET` in the deploy environment. Deploy with those empty and the suggest button is
> hidden while `POST /submissions` answers 503: a working deploy of a dead feature.
>
> Two deviations from this plan, both deliberate and documented where they live:
> 1. **snake_case, not camelCase**, for the stored item and every API field — consistency with the
>    rest of the repo won. `serverless.yml`'s attribute definitions match.
> 2. A write on a read-only catalogue route is **405, not 404** (see Step 0 above).

---

## Where a submission is stored

**Not in the catalogue.** That bears stating first, because it is the constraint everything else
follows from: the hosted catalogue is a SQLite file baked into the Lambda image and opened
`mode=ro&immutable=1`, rebuilt from the root `*.json` on every deploy. A submission written there
would be unwritable in production and destroyed by the next deploy even if it weren't. So
submissions live in a second store that the catalogue knows nothing about.

Which store is one environment variable (`submissions/store.py`) — the same shape as
`CATALOG_DB_PATH` switching the catalogue between its two modes:

| `SUBMISSIONS_TABLE` set | store | used by |
|---|---|---|
| yes | DynamoDB `slackdata-submissions-prod`, `eu-central-1` | the live site |
| no | SQLite at `SUBMISSIONS_DB_PATH` (default `submissions.db` in the CWD) | `fastapi dev`, pytest, Cypress |

Both sit behind one `SubmissionRepository` Protocol, so the routers never learn which is answering.
boto3 is imported lazily inside the DynamoDB implementation, which is what lets the whole test suite
and the Cypress run work with no AWS credentials and boto3 not installed at all.

### The table

```
Table   slackdata-submissions-prod        PAY_PER_REQUEST, PITR on
PK      submission_id  (S)                a monotonic ULID
GSI     status-created_at-index           PK status (S), SK created_at (S), projection ALL
TTL     expires_at     (N)                unix SECONDS
```

One partition key and one index, because there is exactly one query in the application: *pending,
oldest first*. That is a `Query` on the GSI with `ScanIndexForward=True` — never a `Scan`, which is
why the role is not granted one.

**On-demand billing, not provisioned.** A correction form generates a handful of writes a week; on
demand that is effectively \$0 and there is no capacity to plan. **Point-in-time recovery is on**,
which is the one place I would not economise: submissions are the only data in SlackData that cannot
be regenerated from git. The catalogue can be rebuilt from the JSON at any time; what a member of the
public typed cannot.

### What one record holds

Twelve attributes, ~410 bytes for a fully-filled correction and ~230 for a bare one:

```jsonc
{
  "submission_id": "01K3B8Q…",      // ULID — sorting by it IS sorting by creation time
  "kind":          "correction",    // or "new_item"
  "gear_type":     "webbings",
  "gear_id":       42,              // see the id-stability problem below
  "gear_name":     "Type 18",       // denormalized, so triage renders without the catalogue
  "changes":       { "breaking_strength": "31" },   // field -> proposed value, as strings
  "note":          "The manufacturer's spec sheet says 31 kN, not 27.",
  "source_url":    "https://example.com/spec.pdf",
  "submitter_email": "someone@example.org",         // OPTIONAL — the only personal data here
  "status":        "pending",
  "created_at":    "2026-08-19T10:00:00.000Z",      // millisecond precision, the GSI sort key
  "expires_at":    1787227200                       // unix seconds, DynamoDB TTL
}
```

Four properties of that shape are deliberate and worth not undoing:

- **Nulls are dropped on write, not stored.** DynamoDB keeps an absent attribute rather than a null,
  which keeps the Phase 3 `submitted_by` index *sparse* — with no attributed submissions yet, it
  indexes nothing and costs nothing.
- **No IP address and no user agent.** They are the tempting thing to keep for abuse triage, and
  keeping them turns an anonymous suggestion box into a personal-data store. Abuse is handled by
  Turnstile, a honeypot and route throttling instead.
- **`submitter_email` is optional and labelled on the form** with exactly what it is for. It is the
  only personal data the site collects.
- **Append-only.** The repository Protocol has no `delete` and the hosted role is not granted
  `dynamodb:DeleteItem`, so a record cannot be erased by the application — only aged out by the TTL.

### Retention

12 months, assumed, pending the ISA's answer (`SUBMISSION_RETENTION_DAYS`, and one of the two open
questions in `infra/ISA_ROLE_REQUEST_PHASE2.md`). Deletion is DynamoDB's own TTL sweep: free, and it
needs no scheduled job and no permission on the Lambda role.

Note the interaction with the `applied` status proposed below — an approved record with the JSON edit
still outstanding must **not** be allowed to expire, so `expires_at` should be written when a record
reaches a terminal state rather than at creation.

### Cost, concretely

At 500 submissions a year: ~200 KB of storage, a few hundred writes, a few thousand reads. On-demand
DynamoDB prices that at **under five cents a month**, PITR included. Storage is not a reason to
choose anything here — the reason DynamoDB won over Postgres is that RDS needs a VPC, the deploy
identity is denied `ec2:*`, and a VPC Lambda that still needs the internet needs a NAT gateway at
~\$32/month.

---

## What happens to an approved submission

Phase 2 as built stops one step short. Approving records a decision and prints a JSON patch to
copy — and then the trail goes cold. Nothing tells you a submission arrived, nothing tracks whether
an approved change was ever applied, and nothing connects a value in the catalogue back to the
report that changed it. This section is the plan for closing that loop; **none of it is built yet.**

### The three gaps, precisely

1. **"Approved" does not mean "applied".** The status goes `pending → approved`, and there it stops
   while the actual JSON edit lives in someone's memory. A submission can be approved, forgotten,
   and then deleted by the 12-month TTL with the catalogue never corrected — and the record would
   say "approved" the whole time.
2. **No notification.** The queue is a page you have to remember to open.
3. **The item reference is not stable.** See below — this one has a deadline.

---

### Fix this before collecting a single real submission

The root `*.json` files **have no ids.** A gear id is a SQLite autoincrement assigned by position at
seed time, so inserting one webbing into the middle of `webbings.json` shifts every id after it. A
submission that says "item 42's breaking strength is wrong" is therefore only meaningful against the
exact seed ordering that produced it.

`"<brand> <name>"` *is* unique — 0 collisions across the whole catalogue — but bare `name` is not
(3 duplicates in webbings, 2 in weblocks). **The submission record currently stores `gear_name` and
no brand**, which is not enough to re-resolve an item once ids move.

This is the same problem `load_isa_warnings.py` already solved: it records `"<brand> <name>"` beside
each id and checks the pair before stamping, so drift is reported instead of silently re-pointing a
recall at the wrong product. Do the same here:

- Add `gear_brand` to `SubmissionCreate` / `Submission`, filled from `brand_name` on the page.
- On apply, resolve by `(brand, name)` and treat `gear_id` as a hint to cross-check, not as the key.
- If the pair no longer resolves, fail loudly and show the admin both candidates.

**Why the deadline:** this cannot be backfilled. Once a submission exists against a drifted id with
no brand recorded, the product it referred to is genuinely unrecoverable. It is a small change now
and an impossible one later.

---

### Where the change actually lands

Non-negotiable, and worth stating plainly: **the destination is always a git commit against the root
`*.json`, followed by a redeploy.** The hosted catalogue is a read-only SQLite file baked into the
container image and rebuilt from those files on every deploy, so there is no other place a
correction can go and survive. The only open question is how the patch gets from the triage page
into that commit.

| | A — copy-paste (today) | B — local apply script | C — automated PR |
|---|---|---|---|
| Who edits the JSON | you, by hand | a script, on your machine | the Lambda, via the GitHub API |
| New AWS permissions | none | none | Secrets Manager (a GitHub token) |
| Wrong-item risk | high — no id check | low — resolves by brand+name, refuses on ambiguity | low, but failures happen unattended |
| You see a diff before committing | no | **yes — `git diff` before you commit** | in the PR |
| Closes the loop | no | yes — marks records applied | yes |
| Effort | built | ~half a day | ~2 days + a secret to rotate |

**Recommendation: B now, C only if volume ever justifies it.** B removes the largest error source
(hand-editing JSON from a screenshot) without adding a single AWS permission, and it keeps the
riskiest step — mutating the seed data — on your machine where `git diff` is the last check before
anything is committed. C moves that same mutation into an unattended Lambda and buys a GitHub token
to look after; that trade is worth making at fifty submissions a month, not at five.

Sketch of B — `scripts/apply_submissions.py`:

1. Fetch `?status=approved` from the admin API with your own Cognito token. No new AWS access:
   it is the same endpoint the triage page uses.
2. For each record, resolve `(gear_brand, gear_name)` in the target JSON. Refuse the whole run on
   any ambiguous or missing match rather than guessing — a wrong edit to a safety database is worse
   than a manual one.
3. Apply the changes, writing the JSON back with stable key ordering so the diff is readable.
4. Print a summary and stop. **You** run `git diff`, commit, and deploy half A.
5. After the deploy, `--mark-applied` PATCHes the records to `applied`, quoting the commit sha.

### A fourth status — **built**

`pending → approved → applied`, plus `rejected`. `applied` is the admin recording that the JSON was
edited and the API redeployed; the commit sha goes in the review note, which is what links a value in
the catalogue back to the report that changed it.

`expiry_for(status)` in `models/submissions.py` is the single rule: **approved records have no TTL at
all**, so a correction we have agreed with cannot be swept away with the edit still outstanding.
Pending records keep theirs, so abandoned spam still ages out. The DynamoDB implementation `REMOVE`s
the attribute rather than writing null — the TTL sweeper reads the attribute, and absent is not the
same as null. `/admin` shows an "N approved, waiting to be applied" banner from whichever bucket is
on screen, because that is the count most likely to be quietly wrong.

Two consequences worth building in deliberately:

- **The TTL must not delete an approved-but-unapplied record.** Set `expires_at` only when a record
  reaches `applied` or `rejected`; an approved record with outstanding work should not quietly
  expire. (DynamoDB simply ignores an item whose TTL attribute is absent.)
- **The admin page should show `approved` awaiting apply as its own bucket**, so "3 corrections
  approved, not yet shipped" is visible rather than remembered.

---

### Getting notified

Assume low volume and no urgency: a wrong breaking-strength figure is worth fixing this week, not
this hour. That argues against per-submission alerts, which a public form plus inevitable spam turns
into noise you stop reading — which is worse than no alert, because you will believe you are covered.

| Option | Cost | New permissions | Notes |
|---|---|---|---|
| **Digest to a Slack/Discord webhook** | free | **none** — an HTTPS POST, like the FX call | Webhook URL is the only secret; put it in the function env |
| Email via SES | ~free | `ses:SendEmail` | Sandbox exit, bounce handling, and the ISA's domain reputation |
| Email via Resend/Postmark | free tier | none (API key in env) | Keeps sending reputation off the ISA's domain |
| Pending badge on `/admin` only | free | none | Zero infra; relies entirely on you remembering |
| DynamoDB Streams → Lambda | ~free | stream read | Real-time, and more moving parts than this needs |

**Decision (2026-08-19): per-submission email via SES — built.**
**Reversed (2026-08-23): removed. SlackData sends no email.** `utilities/notify.py` is deleted, and
`tests/test_submissions.py::test_the_app_sends_no_email` greps the source so it does not come back
by a different route.

Why the reversal, since the first decision was reasoned and shipped:

- **The setup cost is permanent and ours.** An SES identity to verify, DKIM records to keep valid,
  and a domain reputation to manage — carried forever, for one recipient. The table above priced
  this as "~free"; that was the AWS bill, not the maintenance.
- **The grant is worse than the feature.** `ses:SendEmail` from `*@slackdata.org` on the execution
  role means a compromised Lambda can send mail **as our own domain**. That is a phishing vector
  bought for the convenience of one notification.
- **The sibling project already solved the half that matters, without AWS.**
  `slackmap@slacklineinternational.org` is a Google-Workspace alias forwarding to a person. It needs
  no verification, it is visible to the ISA rather than to whoever holds the credentials, and it
  survives the AWS account changing hands. That is the durable answer for *inbound* contact; the app
  never needed to be the thing that sends.

**What replaces it: `/admin`, and nothing else.** The triage page already carries an
outstanding-work counter for approved-but-unapplied rows — the number this section correctly
identified as "most likely to be quietly wrong". The premise at the top of this section was right
all along: low volume, no urgency, and a per-submission alert on a public form becomes noise you
stop reading.

**If a contact address is wanted**, ask Thomas for `slackdata@slacklineinternational.org` forwarding
to the maintainer. It is also the natural front door for manufacturer onboarding (a brand mails it,
you verify them, then run `python -m slack_data.manufacturers.register`) — see
MANUFACTURER_API_PLAN.md § Open questions 2. Nothing in this repository changes for it to exist.

The original recommendation is kept below, because it is what to revisit if `/admin` proves too
quiet — note it needs **no** IAM change and **no** domain verification, which is exactly why it was
the recommendation in the first place:

**Alternative: a scheduled digest, not a per-submission alert.** An EventBridge rule fires daily
(or weekly), the function counts pending records, and posts only when the count is non-zero —
silence means an empty queue. Delivery to a Slack webhook if the ISA has a channel for it, since
that needs no IAM change, no domain verification and no bounce story; email via a third-party
provider if they would rather have mail.

Two details that decide whether this is useful or annoying:

- **Post only when there is something to say.** A daily "0 pending" trains you to filter the channel.
- **Include the approved-not-yet-applied count**, not just pending. That is the number most likely to
  be quietly wrong, and the one nothing else surfaces.

The EventBridge rule needs no change to the Lambda role — permission to invoke lives on the rule and
is granted at deploy time.

---

### Order of work

1. ~~**`gear_brand` on the submission record**~~ — **done**, and done before any real submission
   existed, which was the whole point (it could not have been backfilled). It is on
   `SubmissionCreate`/`Submission` (`models/submissions.py`), in the SQLite schema *and* its
   migration path (`submissions/repository.py`), filled by `SubmissionDialog`, set from
   `principal.brand_name` on the manufacturer route, shown in triage, and covered by
   `tests/test_submissions.py` — including a record written by the pre-`gear_brand` schema.
2. ~~The `applied` status + TTL change~~ — **done.**
3. **`scripts/apply_submissions.py`** — not built. JSON editing stays manual for now by decision;
   this is the step that would remove the copy-paste from it. (`scripts/` does hold
   `apply_manufacturer_review.py`, which is a different job: it applies a *review* pass, not
   approved submissions.)
4. ~~Notification~~ — **built as per-submission SES mail on 2026-08-19, then removed on 2026-08-23.**
   SlackData sends no email at all; `/admin`'s outstanding-work counter is the whole notification
   story. See § Getting notified above for why the reversal, and
   `tests/test_submissions.py::test_the_app_sends_no_email` for the guard that keeps it gone.

---

## Phase 3 — accounts by application, with attribution

Sketch only; do not build in Phase 2, but avoid decisions that block it.

- Cognito self-signup stays **off**; a person requests an account and the admin creates it. That is
  the "apply for an account" model, and it needs no extra infrastructure.
- Submissions gain `submittedBy` (Cognito `sub`) and a display name. **Add the field in Phase 2 as
  nullable** — backfilling an attribution column later is far more annoying than carrying an always-
  null field now.
- A public per-contributor record ("edits by X") is a query over the submissions table by
  `submittedBy` + `approved`. Design the GSI in Phase 2 with that in mind.
- Approved users still **suggest**; the admin still approves. Per [CLAUDE.md](CLAUDE.md)'s vision,
  manufacturers get edit rights over their own gear, general users get suggest rights, admins
  approve. Hold that line: this is a safety database under the ISA's name, and an unreviewed edit to
  a breaking-strength field has a physical-harm path that a wiki article does not.

## Phase 4 — live catalogue editing (the architectural fork)

Also not now. "Change gear details from within the site" requires the catalogue to become writable,
which means git stops being its source of truth. Given `ec2:*` is denied, the realistic path is
moving the catalogue into DynamoDB (viable: ~500 rows, and
[useGearList.ts](frontend/src/hooks/useGearList.ts) already fetches everything and filters
client-side, so no server-side query complexity is lost) with a JSON export back into git for audit
and backup. Decide it on its own merits after Phase 2 shows what people actually submit.

---

## Open questions

- [ ] Captcha provider — Turnstile assumed; confirm the ISA is happy with Cloudflare.
- [ ] Submission retention period (12 months assumed).
- [ ] Does the ISA want submissions in a **separate** Lambda from the catalogue API? One function is
      simpler and is assumed here; separate functions isolate blast radius and let the catalogue
      Lambda keep its logs-only role.
- [ ] Should `new_item` submissions ship in Phase 2, or corrections only? Corrections only is the
      smaller, more useful first cut.
- [ ] Who else, if anyone, gets an admin account.
