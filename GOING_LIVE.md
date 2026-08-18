# GOING_LIVE.md — Hosting SlackData serverlessly on the ISA's AWS

The International Slackline Association (ISA) is hosting SlackData on their AWS. They run everything
**serverless** (static client-rendered web + Lambda) so it costs ≈$0 when idle — the right call for a
low-traffic community tool. This document is the plan to get there, and to make sure the two feedback
features we know are coming drop in **without any re-architecture**.

Feedback features planned (confirmed with the maintainer):
- **"Suggest a missing item"** — an anonymous public submission form.
- **"Submit a correction / missing data"** — an anonymous public text form on each gear page.
- **A single admin login** (the maintainer's email) to review submissions — *no general user accounts*.

---

## 1. The core principle: two data domains, never mixed

Everything about keeping this cheap, serverless, and future-proof comes from one split:

| Domain | Nature | Where it lives | Who writes |
|--------|--------|----------------|------------|
| **Catalog** (the ~500 gear rows) | **read-only**, derived from the repo's version-controlled `*.json` | a **pre-built SQLite file baked into the Lambda**, opened read-only | nobody at runtime — updated by editing JSON + redeploying |
| **Submissions** (suggestions & corrections) | **append-only**, grows over time | **DynamoDB** (on-demand, ≈$0 idle — the ISA's native tool) | the anonymous public, via form POSTs; read by the admin |

The catalog never becomes writable. A "correction" is a *text note to the admin*, not a live edit —
the admin folds it into the JSON and redeploys. This is why we keep SQLite for the catalog (great at
the relational filtering the app does) **and** why submissions go to DynamoDB (perfect for flat,
append-only records) — no DynamoDB rewrite of the catalog, no relational server for submissions.

**Because the two domains are separate, the feedback features are purely additive** (new API routes +
a DynamoDB table + frontend forms). Nothing built for the read-only launch has to change to add them.

---

## 2. Target architecture (all pay-per-use / free when idle)

```
                     ┌──────────────── CloudFront (one domain) ────────────────┐
   browser ────────► │  default behavior   /*     → S3  (React SPA + images)   │
                     │  path behavior      /api/* → API Gateway → Lambda        │
                     └──────────────────────────────┬──────────────────────────┘
                                                     │
                              ┌──────────────────────┴───────────────────────┐
                              │  Lambda: FastAPI (via Mangum)                 │
                              │   ├─ read catalog  → baked read-only SQLite   │
                              │   └─ write/read submissions → DynamoDB        │
                              └───────────────────────────────────────────────┘
```

| Piece | Service | Idle cost |
|-------|---------|-----------|
| Website (SPA + 62 MB images) | **S3 + CloudFront** (static, client-rendered) | ≈$0 |
| Read API | **Lambda** (FastAPI + Mangum) behind **API Gateway** | ≈$0 |
| Catalog data | **read-only SQLite baked into the Lambda package** | $0 |
| Submissions | **DynamoDB** (on-demand billing) | ≈$0 |
| Admin login *(phase 3)* | **Cognito**, one user | ≈$0 |

Putting the API under `/api/*` on the **same CloudFront domain** means the SPA makes **same-origin**
requests — no CORS in production at all.

---

## 3. What needs to change

### Backend (`slack_data/`)
1. **Lambda adapter** — add `mangum`; expose `handler = Mangum(app)` (small `lambda_handler.py` or in
   `main.py`). API Gateway (HTTP API) proxies to it.
2. **Read-only catalog mode** — [database.py](slack_data/database.py): when `CATALOG_DB_PATH` is set
   (Lambda), build the engine against the pre-built file opened read-only/immutable
   (`sqlite:///file:<path>?mode=ro&immutable=1&uri=true`) and **skip** `create_all`. Local dev is
   unchanged (still seeds `database.db` from JSON).
3. **Skip seeding on Lambda** — [main.py](slack_data/main.py) `lifespan`: guard the whole seed block so
   it only runs in local/dev mode; on Lambda the DB is already built.
4. **Bake the DB at deploy** — a `scripts/build_catalog_db.py` that runs the existing loaders once to
   produce `database.db` from the JSON, invoked during the image build so the `.db` ships in the
   package. (Same seeding logic, moved from boot-time to build-time.)
5. **Submissions feature** (the seam):
   - `slack_data/models/submissions.py` — Pydantic **request** models (`SuggestionCreate`,
     `CorrectionCreate`: type, gear ref, message, **optional email**, captcha token). Not SQLModel
     tables — these go to DynamoDB.
   - `slack_data/dynamo.py` — thin boto3 wrapper (`put_submission`, `list_submissions`).
   - `slack_data/api/routers/submissions_router.py` — **public** `POST /suggestions`,
     `POST /corrections`: validate, verify captcha, write to DynamoDB with `status="new"` + timestamp.
   - `slack_data/captcha.py` — server-side verify the captcha token (Cloudflare Turnstile / hCaptcha),
     secret from env.
   - *(Phase 3, stubbed now)* admin router `GET/PATCH /admin/submissions` guarded by a Cognito JWT.
6. **Deps** — `pyproject.toml`: add `mangum`, `boto3` (for local/tests; present in the Lambda runtime).
7. **CORS** — leave the existing dev block as-is (local only). Production is same-origin via CloudFront,
   so no prod CORS.

### Frontend (`frontend/`)
8. **API base** — [.env.production](frontend/.env.production): `VITE_API_URL=/api` (same-origin behind
   CloudFront) instead of `""`.
9. **Deploy target** — `vite build` → **S3**; served via CloudFront. Images already static.
10. **Submission UI** (phaseable):
    - "Suggest a missing item" page/modal → `POST /api/suggestions`.
    - "Submit a correction" form on the gear detail page → `POST /api/corrections` (auto-attaches gear
      type + id).
    - A captcha widget on both.
    - *(Phase 3)* a Cognito-gated `/admin` route listing submissions.

### Infrastructure (Serverless Framework — the ISA's tooling)
11. `infra/serverless.yml` defining: Lambda (**container image** — built from `Dockerfile.lambda`,
    dodges the zip size limit), API Gateway HTTP API, S3 (SPA + images), CloudFront (default→S3,
    `/api/*`→API GW), **DynamoDB** submissions table, IAM (Lambda→DynamoDB + read the captcha secret),
    SSM/Secrets for the captcha key. Cognito user pool (one admin) added in phase 3.
12. **Deploy flow**: build catalog DB → build frontend → `sls deploy` → `aws s3 sync` the SPA →
    CloudFront invalidation. Manual to start; a GitHub Actions workflow later.

### Deferred
- Cognito admin login + admin triage UI (phase 3); CI/CD; analytics.

---

## 4. Phasing (each phase is additive — nothing earlier is reworked)

| Phase | Ships | New infra | Admin can review via |
|-------|-------|-----------|----------------------|
| **1 — Launch** | Public read-only site (browse/filter/search/detail/compare/manufacturers) | S3, CloudFront, Lambda, API Gateway | n/a |
| **2 — Feedback** | Both submission forms + captcha | DynamoDB table | AWS console / one-line CLI (no login yet) |
| **3 — Admin polish** | Cognito login (your email) + admin triage page | Cognito user pool | the admin UI |

**Phase 1 shipped 2026-08-17** — live at https://slackdata.org (see LAUNCH_RUNBOOK.md).
**Phase 2 + 3 now have a full implementation plan: [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md).**
It supersedes the sketch in this table where the two differ — notably, it folds the single admin
login into Phase 2 rather than deferring it, because the open write endpoints have to be closed
and the admin surface authenticated in the same pass.

Phase 2 is the highest-value step for the stated goal ("go live to get feedback") and needs **no**
login — you read submissions straight from DynamoDB until phase 3 justifies a UI.

---

## 5. Domain

- **Now (free, instant):** a **subdomain of the ISA's domain** (e.g. `slackdata.slackline.international`)
  pointed at CloudFront. Zero cost, no purchase, perfect for the feedback phase.
- **Standalone brand (optional, ~$10/yr):** **`slackdata.org`** — `.org` fits a community/nonprofit
  project. Low-regret to reserve; ask the ISA to **cover and own** it so it lives with the project.
- **Skip `slackdata.com`** ($460) until the project has real traction.

---

## 6. Design-in-now details (cheap now, painful to retrofit)

- **Spam:** the public POST endpoints will attract bots. Build the forms with a **captcha** (Cloudflare
  Turnstile / hCaptcha), **API Gateway throttling**, and a hidden **honeypot** field from day one.
- **Submitter email:** an **optional** field on both forms (leave blank to stay anonymous; provide it to
  let the admin follow up). Stored on the submission record.
- **Image rights & disclaimer** *(before public launch)*: many gear images are scraped — confirm rights
  or swap them, especially under the ISA's name. Surface a "verify specs with the manufacturer" safety
  disclaimer (the data already models ISA warnings). Add a `LICENSE` (project is described as open
  source but has none).

---

## 7. Open items to confirm with the ISA

- [ ] Which they prefer: we `sls deploy` into their account (they grant an IAM role / GitHub OIDC), or
      they run the deploy from our config.
- [ ] Subdomain to use, and whether they'll cover/own `slackdata.org`.
- [ ] New Cognito user pool vs. their existing one (only matters at phase 3).
- [ ] Captcha provider preference (Turnstile is free and simple).

---

### One-line summary
Static SPA on S3/CloudFront + FastAPI on Lambda with a **read-only baked SQLite** for the catalog and
**DynamoDB** for append-only submissions. ≈$0 idle, the ISA's native stack, no catalog rewrite — and
because the read (catalog) and write (submissions) domains are cleanly split, the suggest/correction
features and single-admin login bolt on later without touching anything shipped at launch.
