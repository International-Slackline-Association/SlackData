# Live editing with user accounts — what it would actually take

**Status: analysis, not a commitment.** Nothing here is scheduled. This is the honest
accounting of the distance between what the repo does today and "people sign in and edit the
catalogue in the browser, with every change on the record".

It is the fork [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md) § Phase 4 names in one paragraph and
declines to cost. This document costs it.

The short version: **the catalogue is not a database the app can write to, and no amount of
account work changes that.** Accounts are the easy half. The hard half is that every layer of
this system — the seed JSON, the loaders, the ids, the Docker build, the read-only SQLite, the
IAM role, the test suite — was built on the assumption that catalogue state comes from git and
changes only at deploy time. Live editing deletes that assumption, and it is load-bearing in
more places than it looks.

---

## 1. What editing is today

Three write paths exist. None of them writes the catalogue.

### 1.1 The public suggestion box

`POST /submissions` ([submissions_router.py](slack_data/api/routers/submissions_router.py)) takes
an anonymous correction, validates the *field names* against a list derived from each gear type's
real `<X>Update` schema ([submissions/fields.py](slack_data/submissions/fields.py)), and stores a
record in a **separate** store — DynamoDB hosted, a separate SQLite file locally
([submissions/store.py](slack_data/submissions/store.py)). Values are stored as prose strings and
are never coerced to the model's types.

A submission is a note to the admin. Approving it records a decision and produces a JSON patch
the admin applies to the root `*.json` **by hand**, followed by a redeploy. That is why
`SubmissionStatus` has four values and not three: `APPROVED` means "you are right", `APPLIED`
means "and I have actually edited the JSON and shipped it"
([models/submissions.py](slack_data/models/submissions.py)).

### 1.2 The manufacturer API

`POST /manufacturer/gear` ([manufacturer_router.py](slack_data/api/routers/manufacturer_router.py)),
authenticated per brand. It is *machine-to-machine*: Cognito `client_credentials`, one app client
per brand, created by hand in the console and mapped to a `brand_id` by a CLI
(`python -m slack_data.manufacturers.register`). A brand's update becomes an ordinary `Submission`
with `kind="manufacturer"`, stored `APPROVED` rather than `PENDING` because the sender makes the
product — but still a submission, still applied by hand.

The router reads the catalogue through `SessionDep` and **must never write through it**;
`tests/test_manufacturer_api.py` wires a session whose `add`/`commit`/`delete` raise, so that
mistake fails in pytest rather than in production. `may_write_directly()` in
[models/brand_clients.py](slack_data/models/brand_clients.py) returns `False` structurally, and
`BrandPermission.WRITE` exists and is deliberately not honoured.

### 1.3 The CRUD routes that look like live editing and are not

Every gear router is one call to `crud_router()`
([api/routers/_crud.py](slack_data/api/routers/_crud.py)), which builds `POST` / `GET` / `GET
{id}` / `PATCH` / `DELETE`. The `PATCH` is a `model_dump(exclude_unset=True)` followed by a
`setattr` loop. **Hosted, these routes are not mounted at all** —
`register_routers(app, read_only=True)` filters them out by HTTP method, so they 405 and are
absent from the OpenAPI schema ([api/routing.py](slack_data/api/routing.py)), and
`tests/test_read_only.py` is the regression guard.

They exist for local development. Treating them as the basis for live editing would be a
category error: they have no authentication, no authorization, no validation beyond the `Update`
schema's types, no concurrency control, no audit trail, no notion of who did it, and a `DELETE`
that is a hard row delete with no tombstone.

### 1.4 The admin surface

One Cognito user pool with `AllowAdminCreateUserOnly: true`, one group (`admins`), one SPA app
client (authorization code + PKCE, scopes `openid email`). `require_admin`
([api/auth.py](slack_data/api/auth.py)) verifies the **ID** token and requires membership of
`COGNITO_ADMIN_GROUP`. The SPA wraps only `/admin` in the OIDC provider
([auth/AdminAuthProvider.tsx](frontend/src/auth/AdminAuthProvider.tsx)); locally it falls back to
a token pasted into `sessionStorage`.

There is no user table, no profile, no self-signup, no per-user record of anything. `Submission`
carries a `submitted_by` field that is **always null** — added early precisely so that attribution
would not be a backfill.

### 1.5 Where catalogue state actually lives

```
root *.json  →  scripts/build_catalog_db.py  →  catalog.db baked into the image
                                             →  opened mode=ro&immutable=1
```

[Dockerfile.lambda](Dockerfile.lambda) copies the seed JSON in, builds the SQLite, and then
**deletes the JSON from the image**. [database.py](slack_data/database.py) sets
`READ_ONLY = bool(CATALOG_DB_PATH)`, and `immutable=1` tells SQLite the file cannot change — so
it needs no journal or lock files, which is the only reason it works on Lambda's read-only
filesystem at all.

A write to the hosted catalogue does not fail an authorization check. It fails at the filesystem.

---

## 2. The seven genuinely hard problems

Ranked by how much of the repo each one moves.

### Problem 1 — the catalogue has no writable home, and the obvious fixes are blocked

This is the whole thing. Everything else in this document is a consequence.

The read path today is SQLModel: table models with `Relationship` back-references, a `brand_name`
`@computed_field` resolved through the ORM, `select()` queries in `_crud.py`, and a
`SessionDep` threaded through every router. That is a relational API over a file that ships inside
the container.

**RDS/Aurora is effectively unavailable.** The deploying identity is denied `ec2:*` under the
`DenyIdentitySelfEscalation` guardrail and the Lambda has no VPC
([infra/LAMBDA_ROLE_PERMISSIONS.md](infra/LAMBDA_ROLE_PERMISSIONS.md) §§ Tier 3, and
LAUNCH_RUNBOOK.md § 5.4). A VPC-attached Lambda needs subnets, security groups, and a NAT or VPC
endpoints — all `ec2:*`. Aurora Serverless v2 with the RDS Data API sidesteps the VPC attachment
for the *client*, but the cluster itself still needs a VPC to live in. Getting there means a new
conversation with the ISA about a guardrail that exists for good reasons.

**So the realistic target is DynamoDB**, which SUBMISSIONS_PLAN.md already reaches. It is viable:
~570 gear rows across eight types plus 77 brands, and
[useGearList.ts](frontend/src/hooks/useGearList.ts) already fetches a whole gear type and filters
client-side, so no server-side query complexity is lost.

But it is not a swap. It means:

- Every `crud_router` handler rewritten against a repository interface rather than a `Session`.
  The Protocol-plus-two-implementations pattern from
  [submissions/repository.py](slack_data/submissions/repository.py) is the right model, and it is
  eight gear types plus brands wide.
- `brand_name` stops being an ORM computed field and becomes a denormalized attribute that
  something must keep in step when a brand is renamed.
- The `Brand._<type>` relationships and their `@computed_field` member lists
  ([models/brands.py](slack_data/models/brands.py)) have no DynamoDB equivalent; they become
  queries against a GSI, or stored counts that drift.
- The IAM role grants `PutItem`, `GetItem`, `Query`, `UpdateItem` on `table/slackdata-*` and
  `/index/*` — and **nothing else**. There is no `Scan`, no `DeleteItem`, no `BatchWriteItem`, no
  `TransactWriteItems`. Listing a gear type must therefore be a `Query` on a GSI partitioned by
  gear type, never a `Scan`; deletion must be a soft-delete flag (which is better anyway); and
  any multi-row atomic edit is impossible without a new grant. **Each of those is an ISA
  round-trip**, not a config change — the role is pre-created by the ISA because
  `iam:CreateRole` is denied.

**The middle path worth considering:** keep the baked read-only SQLite as the *serving* copy and
put edits in DynamoDB as an overlay, merged at read time. It avoids rewriting the read path in
week one and keeps git authoritative for the bulk of the data. It costs a merge layer on every
read, a second source of truth for every field, and an eventual reconciliation job that writes
the overlay back into the seed JSON. It is a real option, and it is a staging post, not a
destination.

### Problem 2 — git stops being the source of truth, and the seeds become a liability

Today the root `*.json` files *are* the catalogue. Once a row can change through the site:

- A live edit that is not written back to the seeds is lost on the next image build, because
  `build_catalog_db.py` rebuilds from JSON unconditionally.
- A seed edit that is not applied to the live store is silently overwritten by the overlay, or
  silently loses, depending on which way the merge runs.
- `scripts/backfill_seed_ids.py --check` and `tests/test_seed_ids.py` enforce that every seed item
  carries an explicit `id`. A row created live has an id that exists in no seed file. Either the
  export job writes it back (and the seeds become generated artifacts that people still hand-edit,
  which is the worst of both worlds), or the two diverge permanently.

**What has to be decided before any code is written:** is the live store the source of truth with
a JSON export for audit and backup, or are the seeds the source of truth with live edits as a
queued patch set? Both are defensible. Choosing neither, and discovering the answer per-field
during implementation, is how the catalogue ends up with two disagreeing copies of a breaking
strength.

If the live store wins, the seeding machinery changes role entirely: the loaders become a one-time
import, `seed.py`'s "skip if the table has rows" guard becomes meaningless, and the re-seed ritual
in CLAUDE.md (`rm database.db && fastapi dev main.py`) stops being the way to apply a data change.

### Problem 3 — ids, and the things that point at them

`load_data/_seed_io.require_seed_id` assigns each row's id from the seed rather than letting
SQLite autoincrement, because an id is referenced from four places that all break silently if it
moves:

- ISA warning `match` blocks in `isa_gear_warnings.json` — a recall re-pointing at the wrong
  product is the single worst failure mode this repo has.
- Manufacturer credentials, scoped by `brand_id`.
- Submitted corrections, which record `gear_id` **and** `"<brand> <name>"` precisely so drift is
  reported rather than acted on.
- Bookmarked and shared URLs.

Live creation needs an id allocator that cannot collide with the next hand-appended seed item. The
options are a high-water-mark counter in the live store (one more thing to keep correct), a
non-integer id for live-created rows (breaks the `int` path parameter and every TypeScript type),
or reserving a numeric range per source. This must be settled before the first live-created row
exists, because retrofitting it means renumbering, which is the exact thing the explicit-id work
was done to prevent.

`ISAGearWarning` rows have **no foreign key** — `(gear_type, gear_id)` is the link, because a
warning can land on any of five tables. A live delete (or merge, or rebadge) of a gear row leaves
those rows pointing at nothing, and nothing in the schema will say so.

### Problem 4 — derived fields are computed at load time and would be silently clobbered

Three separate passes write fields that no user typed:

1. **`classification`** on webbing is computed by `load_webbings.py` from material and breaking
   strength. It is in `_EXCLUDED` in `submissions/fields.py` for exactly this reason: a hand-edit
   to it is overwritten on the next deploy.
2. **`isa_warning`** (the enum on the gear row) is stamped by `load_isa_warnings.py`, which runs
   **last** in `seed.py` because it addresses gear by primary key. Worst severity wins across all
   matching entries.
3. **Brand enrichment** — `load_manufacturers.py` backfills `country`, `year_founded`, `website`,
   `socials`, `contact_email`, `active`, `slackline_focused` onto brand rows that already exist,
   gated on "no brand has a country yet". And `load_seller_brands.py` resolves `gear_sellers`
   names, canonicalizes spellings, and is the one place a seller-only `Brand` row is created.

In a live-editing world every one of these has to move from "runs once at build time over the
whole file" to "runs on write, for one row, transactionally with the edit" — or be re-run as a
batch job that now races with live edits. `gear_sellers` is the sharpest case: it is a
cross-product statement resolved by a pass over *all* rows, and it is deliberately un-editable
through the API (a maker does not get to declare a competitor's shelf). A live editor must keep
that field off the form and keep the resolution pass running somewhere.

### Problem 5 — there is no audit trail, and "record of all changes" is most of the work

No catalogue model has `created_at`, `updated_at`, `updated_by`, or a revision number. There are
21 fields on `Webbing`, 21 on `Weblock`, 21 on `Roller`, 20 on `Grip`, 17 on `LeashRing`, 16 each
on `TreePro`/`StarterKit`/`TricklineKit`, 10 on `Brand`. "Record of all changes" over that is a
subsystem, not a column:

- A **revision store**, append-only, one record per field-level change or per row-version
  snapshot: `(gear_type, gear_id, revision, changed_at, actor_sub, actor_display_name, before,
  after, reason, source)`. Field-level is more useful for a diff view and more work to render;
  row-snapshot is trivial to write and awkward to query. Pick one deliberately.
- **Revert.** A history nobody can act on is a log file. Revert means re-applying an inverse patch
  and writing *that* as a new revision, never mutating history.
- **Attribution across the boundary.** `Submission.submitted_by` already reserves the shape:
  manufacturer submissions carry `brand-client:<app client id>`, prefixed so it can never be
  confused with a person's bare Cognito `sub`. A live edit's actor must slot into the same
  namespace, and public contributor records (`edits by X`) become a query over it.
- **Retention conflicts with GDPR.** Submissions expire via DynamoDB TTL (365 days, configurable).
  A revision history that expires is not a history; one that does not is personal data held
  indefinitely. The ISA has to answer this, and it is the same conversation as
  [infra/ISA_ROLE_REQUEST_PHASE2.md](infra/ISA_ROLE_REQUEST_PHASE2.md).

Note that with `dynamodb:DeleteItem` ungranted, append-only is enforced by IAM as well as by
design — which is a genuine asset here, not an obstacle.

### Problem 6 — accounts are not one Cognito change

The pool today is configured *against* the thing being asked for: `AllowAdminCreateUserOnly:
true`, one group, one app client with `openid email`. Getting to "people sign up and edit":

- **Three tiers, three group memberships** (`admins`, `manufacturers`, `contributors`), each
  arriving in `cognito:groups` on the ID token. `require_admin`'s group check is the pattern to
  copy — note the deliberate design that an unset `COGNITO_ADMIN_GROUP` falls back to `admins`
  rather than to "no group required".
- **Manufacturer *people*, not just manufacturer *machines*.** The current brand auth is
  `client_credentials` — an access token with no `aud`, resolved to a brand through the
  `slackdata-brand-clients-*` table. A human manufacturer employee signing in produces an **ID**
  token with a `sub` and no `client_id`. That is a *third* verifier, and a second mapping table
  (`cognito sub → brand_id`, many-to-one, with its own invite/revoke flow). `_resolve_brand` is
  the shape to reuse; the lookup key is different.
- **Self-signup or application?** SUBMISSIONS_PLAN.md § Phase 3 says application, and says it
  needs no extra infrastructure. That remains true and remains slow — every account is a manual
  console action. Self-signup means enabling `AllowAdminCreateUserOnly: false`, email
  verification, password reset, bot-signup defence on the pool, and a support path for locked-out
  users.
- **Email.** The app sends no email today, and `tests/test_submissions.py::test_the_app_sends_no_email`
  pins that. Any account system that verifies an address or tells an applicant they were approved
  needs SES **out of the sandbox** — a support request AWS reviews, plus bounce and complaint
  handling, plus a sending reputation attached to the ISA's domain. The role already carries an
  over-broad `ses:SendEmail`/`SendRawEmail` grant that LAMBDA_ROLE_PERMISSIONS.md recommends
  *deleting*; widening it instead is a decision to make out loud.
- **In-app user administration needs a Cognito grant the role does not have.** The Lambda holds no
  `cognito-idp` action at all today, by design — it verifies tokens against public JWKS over
  HTTPS. Creating, disabling, or grouping users from an admin screen means `cognito-idp:AdminCreateUser`,
  `AdminDisableUser`, `AdminAddUserToGroup`. The pool is tagged `Project=slackdata` specifically so
  this can be granted by `aws:ResourceTag` rather than by an id. `AdminDeleteUser` is deliberately
  excluded and should stay excluded.
- **The SPA's auth is scoped to `/admin`.** `AdminAuthProvider` wraps that route only, so no gear
  page loads the OIDC library. Site-wide sign-in inverts that: the provider moves to the root, and
  every visitor to every page pays for it unless it is lazily loaded behind an explicit sign-in
  action. That is a real bundle-size and first-paint decision, not a refactor.
- **Cognito callback URLs are matched exactly, no wildcards.** Today's list covers `/admin` on
  apex, `www`, and localhost. Every new post-login landing route has to be added to
  `CallbackURLs` in [infra/serverless.yml](infra/serverless.yml) and redeployed, or login fails
  with `redirect_mismatch` — which reads as a broken login rather than a missing config entry.

### Problem 7 — safety, and the reason none of this is merely technical

This is a safety database under the ISA's name. An unreviewed edit to a breaking-strength field
has a physical-harm path that a wiki article does not — SUBMISSIONS_PLAN.md says so, and
[SAFETY_AND_ACCURACY.md](SAFETY_AND_ACCURACY.md) is the public-facing half of it.

So "live editing" cannot mean "the edit is live when you press save", for anyone but possibly a
verified manufacturer on their own gear. The realistic design is:

- Contributors edit into a **draft/pending revision** that is queued, not served.
- Manufacturers edit their own gear with the edit going live immediately **and** recorded, with
  the admin able to revert. This is already the trust model the manufacturer API encodes by
  storing `APPROVED` on arrival.
- Admins edit anything, live.
- Certain fields are never live-editable by anyone below admin regardless of tier: breaking
  strength, ISA certification, `isa_warning`, `classification`, `gear_sellers`. `_EXCLUDED` and
  `MANUFACTURER_EXCLUDED` in `submissions/fields.py` are where that list already half-exists, and
  the mechanism (derive from the model, never write the list down twice) is the right one to
  extend.

The moment an edit is served before a human reads it, the liability posture of the site changes.
That is the ISA's call, not an engineering one, and it should be asked before the work starts
rather than after it is built.

---

## 3. What changes, concretely

Layer by layer. This is the scrupulous-detail section.

### 3.1 Backend — data access

| File | Change |
|---|---|
| [slack_data/database.py](slack_data/database.py) | `READ_ONLY` stops meaning "hosted". Either it goes away with the SQLite catalogue, or it narrows to "the *baked* copy is read-only, the overlay is not". `create_db_and_tables()`'s single-call guard and the `DATABASE_ENGINE` global both assume one engine for one immutable file. |
| [slack_data/api/routing.py](slack_data/api/routing.py) | The `CATALOG_ROUTERS` / `WRITABLE_ROUTERS` split is currently "writes to the catalogue" vs "writes elsewhere". With a writable catalogue that distinction dissolves; `read_only_view()` and its method filter stop being the guard. **Something must replace it**, because it is the one place the "publishes no catalogue writes" decision is made, and `tests/test_read_only.py` is the only thing standing between a refactor and re-publishing unauthenticated `DELETE /webbing/{id}` on the live site. |
| [slack_data/api/routers/_crud.py](slack_data/api/routers/_crud.py) | Every handler gains an auth dependency, an authorization check (is this actor allowed to touch this row, this field?), optimistic concurrency (an `If-Match`/version check — two admins on one row is a real scenario), a revision write in the same unit of work as the edit, and a derived-field recompute. `PATCH`'s `setattr` loop becomes a validated, audited apply. `DELETE` becomes a soft delete. The factory is the right place for all of it — nine routers inherit it at once — but it roughly triples in size and stops being "the five obvious handlers". |
| New: a catalogue repository package | Mirroring `submissions/repository.py`: a Protocol, a SQLite implementation for local dev and tests, a DynamoDB implementation, chosen by env var in a `store.py`. Keeping boto3 out of the routers is what lets pytest and Cypress run with no AWS credentials — that property is worth preserving exactly. |
| New: a revisions store | Append-only, with its own table, GSIs for "this row's history" and "this actor's edits", and a retention decision. |
| [slack_data/seed.py](slack_data/seed.py), `load_data/*` | Role changes from "populate on boot" to "one-time import" (or "reconcile"). The empty-table guards, `has_isa_warnings()`, and the "no brand has a country yet" gate are all one-shot-seeding logic that means something different once rows change at runtime. |

### 3.2 Backend — models

Every `Base<X>` gains audit and lifecycle columns: `created_at`, `updated_at`, `updated_by`,
`version` (for optimistic concurrency), `deleted_at` or a `visible` flag. Because they live on
`Base<X>`, they flow automatically into `Public`/`Create`/`Update` — which is wrong for most of
them. `<X>Create` and `<X>Update` must **not** accept `version` as a settable field or
`updated_by` at all, so the class shape described in CLAUDE.md § Data model needs a fourth
variant, or per-schema exclusions.

That in turn hits `submissions/fields.py`, which derives the correctable field list from
`<X>Update` — the new columns would become "correctable" the moment they exist. They go in
`_EXCLUDED`. `tests/test_frontend_contract.py` checks the frontend form offers only names from
that list, so it fails loudly if this is missed, which is the system working.

`Brand` needs the same treatment plus an explicit account linkage. Today
[models/brand_clients.py](slack_data/models/brand_clients.py) is that linkage for *machines*;
people need `BrandMember` (`cognito_sub`, `brand_id`, `role`, `invited_by`, `active`).

### 3.3 Backend — auth

- A third verifier for manufacturer **people** (ID token + `cognito:groups` contains
  `manufacturers` + a `sub → brand_id` lookup), sitting beside `verify_cognito_token` and
  `verify_manufacturer_token`. The module docstring's "two verifiers, not one loosened verifier"
  rule is the thing to honour: do not widen `verify_cognito_token`; it guards admin login and
  `tests/test_auth.py` pins its behaviour against forged signatures, `alg: none`, wrong audiences,
  and access tokens.
- A `require_contributor` for the general tier.
- A field-level authorization layer — "may this principal set this field on this row?" — which
  does not exist in any form today. The nearest thing is `principal.owns(brand_id)`.
- The dev-token escape hatches (`ADMIN_DEV_TOKEN`, `MANUFACTURER_DEV_TOKEN`) are safe today
  because reaching them requires *no pool* **and** *not hosted*, and `Dockerfile.lambda` always
  sets `CATALOG_DB_PATH`. **If `CATALOG_DB_PATH` goes away with the SQLite catalogue, `_hosted()`
  stops working and the dev tokens become reachable in production.** This is the single most
  dangerous line item in this document. `_hosted()` must be re-based on something the hosted image
  always sets before the catalogue migration lands, and `tests/test_auth.py` must assert the new
  basis.

### 3.4 Frontend

| Area | Change |
|---|---|
| [src/api/client.ts](frontend/src/api/client.ts) | `request<T>()` is a bare authenticated-nothing `fetch`. It needs an auth header path, 401 handling that triggers re-login rather than rendering an error, and `PATCH`/`PUT` helpers. |
| [src/auth/AdminAuthProvider.tsx](frontend/src/auth/AdminAuthProvider.tsx) | Becomes a site-wide provider with a tier-aware shape (`isAdmin`, `isManufacturer`, `brandIds`), or is joined by a second provider. The `sessionStorage` dev mode is worth keeping — it is what makes Cypress work without AWS — but it now grants *editing*, so the mode indicator has to be unmissable. |
| [src/hooks/useGearList.ts](frontend/src/hooks/useGearList.ts) | Fetches an entire gear type and filters client-side. That is ideal for a static catalogue and wrong for an edited one: an edit made in one tab is invisible in another until reload, and the list is a consistent snapshot of a moment that is no longer true. Needs cache invalidation on write at minimum; realistically a query client with staleness control. |
| New: edit UI | An inline or modal editor per gear type, driven by the same field metadata the suggestion dialog uses ([src/config/correctableFields.ts](frontend/src/config/correctableFields.ts)) but with real typed inputs — enums as selects, numbers as numbers, currency as currency — rather than the free-text strings a submission stores. This is per-field-type work across ~150 distinct fields. |
| New: history UI | Per-item revision list, diff rendering, revert action, contributor profile pages. |
| [src/pages/AdminPage.tsx](frontend/src/pages/AdminPage.tsx) | Triage remains, but "approve" can now mean "apply", so the four-status lifecycle collapses for some kinds and not others. Getting this wrong makes the queue lie about what is shipped. |
| [src/components/submissions/](frontend/src/components/submissions/) | The suggestion box stays — it is the anonymous path, and anonymity is a feature, not a gap to close. It should not quietly become "sign in to suggest". |

Gear **images** are the sharpest frontend limit: they are files committed under
`frontend/public/gear-images/`, indexed into `src/data/gearImages.json` by
`scripts/build_gear_manifest.py` **at build time**, and served from the SPA's own CloudFront
origin. There is no runtime image path. A live editor that lets anyone add a photo needs an upload
endpoint, a place to serve from, and moderation. `UploadsBucket` in serverless.yml exists as a
*quarantine* — private, no CloudFront origin, 90-day expiry — deliberately not a serving bucket,
because the web bucket is `aws s3 sync --delete`d on every deploy and anything not in the build
output is destroyed. Live images mean a second CloudFront origin, a signed-upload flow, content
moderation, and a rethink of that manifest.

### 3.5 Infrastructure

- **New DynamoDB tables** for the catalogue, revisions, and account/brand membership. Naming them
  `slackdata-*` means the existing IAM grant covers `PutItem`/`GetItem`/`Query`/`UpdateItem` with
  no ISA round-trip. **Anything beyond those four verbs does need one.**
- **New throttled write routes** must be added to **both** `RouteSettings` **and**
  `HttpApiStage.DependsOn` in [infra/serverless.yml](infra/serverless.yml). API Gateway rejects a
  `RouteSettings` key whose route does not exist, and this took down a deploy on 2026-08-25.
  `infra/check-routes.py` and `tests/test_infra_routes.py` guard it. Also note route keys may not
  end in `/`, and two keys that normalise to one CloudFormation logical id collide silently.
- **CloudFront is not a cache problem for the API** — `/api/*` uses the managed CachingDisabled
  policy (`4135ea2d-…`), attached to that behaviour specifically so the SPA's caching cannot
  affect it. Edits show up immediately. The SPA bundle and gear images *are* cached at the default
  behaviour, which is why live images are a harder problem than live specs.
- **Cognito**: new groups, possibly self-signup, new callback URLs, and — if in-app user
  management is wanted — the first `cognito-idp` grant the Lambda has ever held.
- **Backups**: the catalogue is currently backed up by being in git. A live store needs PITR (the
  submissions and brand-clients tables already set `PointInTimeRecoveryEnabled: true` and
  `DeletionPolicy: Retain`; copy that) *and* a periodic JSON export back into the repo, which is
  also the audit artifact and the disaster-recovery path.
- **Lambda memory/timeout**: 512 MB, 29 s. Fine today; a merge-overlay read path or a large export
  job is not obviously fine.

### 3.6 Tests

This is where the cost is easy to underestimate. There are **795 backend tests across 26 files**
and **23 Cypress specs**, and a large share of them are built on the assumption that the catalogue
is seeded from JSON and does not change.

- `tests/conftest.py` builds its app through `register_routers`, so the routes tested are the
  routes production serves. That property must survive the rewrite.
- `tests/test_read_only.py` asserts exact path templates and that writes are absent hosted. Its
  *purpose* changes; it must not simply be deleted.
- `tests/test_seed_ids.py` includes a test that loads `grips.json` **backwards** — the only check
  that fails if a loader goes back to letting the database choose ids. Live-created ids need an
  equivalent invariant test from day one.
- `tests/test_dynamo_stores.py` builds its tables **from `infra/serverless.yml`**, so
  template/code drift fails there. Every new table should be added to it — that pattern is the
  single best thing in this test suite and it should be extended, not worked around.
- `tests/test_auth.py` gains the third verifier's cases, and must gain a test for the new
  `_hosted()` basis (§ 3.3).
- New Cypress specs for sign-in, edit, permission denial, concurrent edit, history, and revert —
  and each one must be added to `frontend/cypress/shards.json` or it silently never runs in CI.
  `npm run shards` is what catches that.
- `tests/test_frontend_contract.py` keeps the frontend's field list honest against the backend's
  derived one. Extend it to cover the edit form, not just the suggestion form.

---

## 4. A sequencing that does not require a big bang

Rough order, each step shippable and reversible:

1. **Decide the source-of-truth question** (§ Problem 2) and get the ISA's answer on the safety
   posture (§ Problem 7) and on revision-history retention. No code until these three are answered
   — every one of them changes the design, not just the implementation.
2. **Re-base `_hosted()`** off something other than `CATALOG_DB_PATH`, with a test. Cheap, and it
   removes the worst latent hazard before anything else moves.
3. **Populate `submitted_by`** on public submissions for signed-in users, with contributor
   accounts by application (Phase 3 as already sketched). No catalogue writes yet. This exercises
   accounts, groups, tier checks and attribution against a store that already exists and is
   already append-only.
4. **Build the revision store and write to it from the existing apply path** — when an admin marks
   a submission `APPLIED`, record the revision. History starts accumulating before anything is
   live-editable, and the history UI can be built and reviewed against real data.
5. **Admin-only live editing of a single gear type**, behind a flag, through the overlay approach
   (§ Problem 1). One type, one tier, full audit. This is where the repository abstraction, the
   concurrency control and the derived-field recompute get proven.
6. **Extend to all gear types**, then to manufacturer *people* on their own gear, then to
   contributor drafts.
7. **Export job back to JSON**, run on a schedule and on demand, committed to the repo. Until this
   exists the live store has no audit artifact and no disaster recovery.
8. **Images**, last, and only if actually wanted. It is a separate system with separate moderation
   problems.

---

## 5. The honest summary

- **Accounts alone**: weeks. The Cognito pool exists, the group-check pattern exists, the ID-token
  verifier exists. Adding tiers and attribution is mostly known work — with the SES/sandbox
  conversation as the one genuine unknown.
- **Live editing with full history**: months, and it is a rewrite of the data layer rather than a
  feature on top of it. The catalogue's read path, the seeding model, the id scheme, the derived
  fields, the test suite's central fixture, and the deploy's meaning all move together.
- **The three things that will hurt most and are not visible in a task list**: derived fields
  silently going stale (§ Problem 4); ids diverging between the live store and the seeds
  (§ Problem 3); and `_hosted()` quietly losing its basis and re-enabling the dev tokens in
  production (§ 3.3).
- **The thing that is not an engineering decision**: whether an unreviewed edit to a breaking
  strength may be served to the public under the ISA's name.

---

See also: [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md) §§ Phase 3–4,
[MANUFACTURER_API_PLAN.md](MANUFACTURER_API_PLAN.md),
[infra/LAMBDA_ROLE_PERMISSIONS.md](infra/LAMBDA_ROLE_PERMISSIONS.md) § Tier 2,
[SAFETY_AND_ACCURACY.md](SAFETY_AND_ACCURACY.md), [BACKLOG.md](BACKLOG.md).
