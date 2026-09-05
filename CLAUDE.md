# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SlackData is a **better, open-source replacement for [SlackDB](https://slackdb.com/)** — a community database of slackline gear. Goals vs SlackDB: stronger/simpler backend, modern UX design, and an account system (manufacturer accounts with edit access, general user accounts with suggest access, admin accounts for approvals).

Current state: FastAPI + SQLModel + SQLite backend, plus a React/TypeScript/Vite frontend that is well underway (Phases 1–8 of [PLAN.md](PLAN.md) are done: listing, filters, search/sort, detail, compare, manufacturers). There is a pytest suite (622 tests) and a Cypress e2e suite, and the public read-only catalogue is **live at https://slackdata.org** (Phase 1). **CI runs on every PR** (`.github/workflows/ci.yml`): pytest with a dynamodb-local service, the frontend build/lint/unit suite, and Cypress against both real servers.

**Stack:** Python ≥3.10 backend (FastAPI, SQLModel, SQLite) + React/TypeScript/Vite frontend (in progress).

## Product Vision

### What SlackDB has (reference for what to replicate/improve)

- **Homepage:** Stats dashboard (gear counts by type, knowledge/images/manufacturers/communities totals), edit-suggestions panel, latest-activity feed showing contributor actions.
- **Gear listings** (9 types: webbings, weblocks, leash rings, grips, rope brakes, line sliders, starter kits, trickline kits, tree protectors): Card or table view per item with image, rating, manufacturer, title, key specs. Text search, dynamic spec filters, continent filters, sort controls, and a **Compare** feature (add multiple items → side-by-side comparison view). Actions per item: Show details, Compare, Read reviews, Write review.
- **Gear detail page:** Full spec sheet, user ratings/reviews, images, contributor attribution.
- **Manufacturers:** List view + map view. Per entry: name, rating/review count, slackline-focused flag, year founded, website/socials, gear inventory counts by type. Continent + category filters. "Add Manufacturer" CTA.
- **Knowledge base:** Community-contributed articles tagged to gear types, filterable.
- **User accounts:** Contribution tracking, edit-suggestion workflow, community ratings with pros/cons.
- **Multi-currency support**, data-accuracy disclaimer.

### What we're building differently

- Cleaner backend (already done — FastAPI/SQLModel vs SlackDB's stack).
- Modern, polished UI — SlackDB's design is dated; ours should feel contemporary.
- Structured account tiers: **manufacturer** (full edit rights on their gear), **general user** (suggest edits, community ratings), **admin** (approve suggestions, manage users).
- Better data integrity: approval workflow before changes go live.

## Frontend (in progress)

**Live status + the phase-by-phase roadmap live in [PLAN.md](PLAN.md) — read it first.** It is the
single source of truth for where the build is and what's next. The visual/UX spec is in
[DESIGN.md](DESIGN.md).

Directory: `frontend/` at repo root. Built **TDD against the real backend** (localhost:8000) via a
red-first Cypress suite — not mock data.

**Tech:** React 19, TypeScript, Vite, Tailwind v4, react-router-dom v7. `erasableSyntaxOnly` tsconfig
→ no TS `enum`s / parameter-properties; use string-literal unions + `as const` arrays.

Key screens to design (in priority order):
1. Gear listing page (filterable, sortable cards/table per gear type)
2. Gear detail page (full spec sheet)
3. Manufacturers listing + detail
4. Homepage / dashboard
5. Compare view
6. Account pages (login/signup/profile) — lower priority, account system comes later

**Design reference:** climbing-gear.com (crashpads page screenshot). Carry over the design language only — all content/categories come from slackline data.

Visual design spec:
- Light gray page background; white cards with ~12–16px border radius and subtle drop shadow; 3-column card grid default
- **Left filter sidebar** (~280px): collapsible section groups, pill/chip toggle buttons (not checkboxes), small-caps section labels with colored dot accents
- **Card anatomy** (top → bottom): category badge pill top-left (coral/amber), large centered product image, brand name in small all-caps, bold product name, inline key specs row, feature tag pills (light gray bg), price in warm amber/orange, then Save / Alert / Compare as outlined pill buttons with icons
- **Top nav**: gear-type tabs (Webbings, Weblocks, Leash Rings, Grips, Rollers, Tree Protectors, Starter Kits, Trickline Kits)
- **Above grid**: search bar left, Cards | Detailed view toggle, item count, SORT BY dropdown right
- Accent: warm amber/orange for prices and active CTAs; coral for category badges; otherwise white/light gray
- Rounded consistently throughout — cards, pills, buttons, badges all share the same radius

## Commands

```bash
# Setup with uv (creates .venv)
uv sync
source .venv/bin/activate
# Setup with pip (creates venv)
python3 -m venv venv && source venv/bin/activate && pip install '-e.[dev]'

# Run the dev server — MUST cd into slack_data first; database.db is created in CWD
cd slack_data
fastapi dev main.py            # → http://127.0.0.1:8000  (/docs for interactive OpenAPI)

# Lint (ruff is the only dev dependency; no ruff config file exists in repo)
ruff check .
```

CI runs all of this on every PR (`.github/workflows/ci.yml`), but it is the last check, not the first — run them yourself before pushing:

```bash
python -m pytest tests/ -q          # 795 backend tests (26 files: gear types, loaders, read-only guard,
                                    #   submissions, auth, manufacturer API, live server, DynamoDB,
                                    #   manufacturer contact emails, seed ids, infra route/throttle
                                    #   agreement, brand onboarding, co-listings)
# tests/test_live_api.py boots THREE real uvicorn processes (local-dev, hosted
# READ_ONLY, and hosted-with-a-Cognito-pool) and hits them over HTTP. It builds its
# own minimal catalogue, so it adds ~9s and needs no seeded database.db, no network.
#
# tests/test_dynamo_stores.py runs the DynamoDB repositories against a real
# DynamoDB — otherwise those paths first execute in production. It builds its
# tables FROM infra/serverless.yml, so template/code drift fails here. Skips
# cleanly without boto3 or without the container, so the default dev environment
# still gets a green run (15 skip, and the 2 template-drift checks still run):
docker run -d --name ddb-local -p 8765:8000 amazon/dynamodb-local
pip install '-e.[aws]'      # boto3; the app still imports it lazily
cd frontend && npm run build        # tsc -b + vite build
cd frontend && npm run lint         # oxlint
cd frontend && npm run test:unit    # 211 unit tests — node:test on the pure utils, no servers, no deps
# Cypress e2e (23 specs) needs BOTH servers up — see PLAN.md → "Running things"
cd frontend && env -u ELECTRON_RUN_AS_NODE npx cypress run --spec cypress/e2e/<spec>.cy.ts
# (the `env -u` is required under VS Code, or Cypress dies with SIGILL / exit 132)

# admin_triage.cy.ts needs a submissions store it hasn't already filled. The
# triage list is a queue — oldest first, one page of 50 — so fixtures the spec
# creates land at the bottom and drop off the page once ~50 pending rows have
# accumulated across runs. Start the API against a scratch file for test runs:
cd slack_data && SUBMISSIONS_DB_PATH=/tmp/cypress-submissions.db fastapi dev main.py

# The manufacturer API needs a registered brand client before any token works.
# Locally the store is a SQLite file (BRAND_CLIENTS_DB_PATH, default
# brand_clients.db in the CWD), and the dev credential is
# "<MANUFACTURER_DEV_TOKEN>:<client_id>":
python -m slack_data.manufacturers.register --client-id dev-client --brand "Balance Community"
curl -H 'Authorization: Bearer dev-manufacturer-token:dev-client' localhost:8000/manufacturer/me
```

`test:unit` runs `node --experimental-strip-types --test tests/unit/*.test.ts` — Node 22 strips the
types itself, so there is **no test framework dependency**. It covers the arithmetic that is
invisible in a screenshot (slider domains, currency precision); anything about the DOM belongs in
Cypress. `frontend/tests/` has its own tsconfig (`types: ["node"]`) exactly like `cypress/` does, so
it stays out of `tsc -b`.

The README's install snippet says `uv venv` then `source venv/bin/activate`, but `uv` actually creates `.venv` — use `source .venv/bin/activate` for the uv path.

## Architecture

```
Root *.json seed files
  → slack_data/load_data/load_*.py   (one importer per gear type)
  → database.db (SQLite)             via
  → slack_data/models/*.py           (SQLModel table models)
  → slack_data/api/routers/*.py      (FastAPI CRUD routers)
  → HTTP clients / OpenAPI /docs
```

### Key files

| File | Role |
|------|------|
| `slack_data/main.py` | FastAPI app factory; lifespan seeding; router registration |
| `slack_data/database.py` | `DATABASE_ENGINE`, `get_session()`, `SessionDep`, `create_db_and_tables()` |
| `slack_data/models/brands.py` | `Brand` model + `get_brand()` upsert helper (central entity) |
| `slack_data/models/<type>.py` | SQLModel schemas per gear type |
| `slack_data/load_data/load_<type>s.py` | JSON → DB importers — copy this pattern for new types |
| `slack_data/load_data/_seed_io.py` | `read_seed_json()` / `seed_path()` / `to_bool()` / `require_seed_id()` — shared by every loader |
| `slack_data/load_data/brand_ids.py` | `catalog_id` from `manufacturers.json` — the stable `Brand.id`, read lazily |
| `scripts/backfill_seed_ids.py` | Writes/verifies the explicit ids in the seeds; `--check` for CI |
| `slack_data/api/routers/_crud.py` | `crud_router()` — the CRUD factory every gear router is built from |
| `slack_data/api/routers/<type>_router.py` | One `crud_router(...)` call per gear type |
| `slack_data/api/routing.py` | Router registration + the READ_ONLY write-route filter (see below) |
| `slack_data/utilities/` | shared enums/helpers (currency, country, materials, ISA warnings) |
| `slack_data/load_data/load_seller_brands.py` | Resolves each gear row's `gear_sellers` names; the one place a seller-only `Brand` is created |
| `slack_data/models/submissions.py` | Submission schemas — **pydantic, not SQLModel**; never in the catalogue DB |
| `slack_data/submissions/` | The submission store: `repository.py` (Protocol + SQLite + in-memory), `dynamo.py`, `store.py` (env selection), `fields.py` (allowed field names, derived from the models) |
| `slack_data/api/auth.py` | Cognito token verification (admin **ID** tokens + manufacturer **access** tokens) + the local dev-token modes |
| `slack_data/models/brand_clients.py` | `BrandClient` / `BrandPermission` / `ManufacturerPrincipal` — the account linkage `Brand` never had |
| `slack_data/manufacturers/` | The manufacturer API's stores: `clients.py` (Protocol + SQLite + in-memory), `dynamo.py`, `store.py`, `matching.py` (gear identity), `register.py` (onboarding CLI), `onboard.py` (the CLI's AWS half — dossier, Cognito app client, ledger, end-to-end proof) |
| `slack_data/utilities/turnstile.py` | Captcha verification — **fails closed**, unlike `fx.py` |

There are `__init__.py` files in `models/`, `api/`, and `utilities/`. No `tests/`, no `.github/`, no Docker, no migrations (SQLModel `create_all` only).

### Startup & seeding (`main.py` lifespan)

1. `create_db_and_tables()` creates the SQLite engine and all tables. It raises if called twice (`DATABASE_ENGINE` is a module global).
2. For each gear type: `select(<Model>).first()` — **if the table is empty**, run the matching `load_*(session)`.
3. **Seeding is one-shot.** Once any row exists for a gear type, its JSON is never re-read. To re-seed after editing JSON: delete `slack_data/database.db` and restart the server.

**Editing a seed `*.json` is not finished until the database is re-seeded and the server restarted.**
Because seeding is one-shot, a running dev server keeps serving the *old* rows — so the change looks
like it did nothing, in the API and on the site. Every edit to a root `*.json` (gear seeds,
`manufacturers.json`, `isa_gear_warnings.json`) ends with:

```bash
rm -f slack_data/database.db
cd slack_data && fastapi dev main.py    # re-seeds on boot; watch the log for loader errors
```

Do this yourself as the last step of the change, don't just tell the user to — the loaders are where
a bad seed value surfaces (unknown brand, unparseable currency, a name that no longer matches an ISA
match block), and those errors are only visible on a re-seed. Then confirm the new data is actually
served (`curl localhost:8000/<prefix>/<id>`) before reporting the work done.

`database.py` creates the engine with `echo=True`, so SQL is logged verbosely on every run.

### Data model

**`Brand`** (`models/brands.py`) is the central entity (manufacturers). Every gear type links to it via a `brand_id` FK. `Brand` holds a `_<type>` `Relationship` for each gear type plus a `@computed_field` returning member names.

**`get_brand(session, brand_cache, item)`** — upserts a brand by `item["brand"]` name (creating the row if missing) and caches the resulting id in a per-load `brand_cache` dict. Loaders always resolve brands through this; if a loader's JSON names the brand differently (e.g. `manufacturer`), it maps that into `{"brand": ...}` before calling.

**Per-gear-type class shape** (every gear type follows this):
- `Base<X>(SQLModel)` — shared fields
- `<X>(Base<X>, table=True)` — DB table; adds `brand` Relationship + a `brand_name` computed field
- `<X>Public` — API response model (includes `brand_name`)
- `<X>Create` / `<X>Update` — write schemas

Per-model enums (e.g. `FiberMaterial`, `ConnectionType`, `TensioningType`) live in the model file. Cross-cutting enums live in `slack_data/utilities/`: `currencies.py` (`Currency`, `get_currency()`), `countries.py` (`Country`), `materials.py` (`MetalMaterial`, `RollerMaterial`, `get_metal_material()`), `isa_warnings.py` (`ISAWarning`).

There are **no cross-links between gear types** — kits do not FK to specific webbing/weblock rows; they only link to a brand.

Every gear type carries an **`active: bool | None`** field on its `Base<X>` (so it flows to `Public`/`Create`/`Update`): `True` = still sold, `False` = legacy/discontinued, `None` = unknown. It is baked into each root `<type>s.json` seed (one `"active"` key per item) and mapped through the loaders like any other field — sourced from a one-off web-verification pass (227 active / 271 legacy across 498 items as of 2026-07-31). That pass's working set lives in `gear_status/`, which is **gitignored** — it is local provenance, not tracked input, and nothing at runtime reads it. The frontend shows a red "Legacy" card badge when `active === false`, and scopes the listing with an **ALL / CURRENT / HISTORIC** bubble at the top of the filter sidebar (defaults to ALL — see DESIGN.md § Left Filter Sidebar).

### Active models (wired into `main.py`)

| Model | Table / router prefix | JSON seed | ~Count |
|-------|-----------------------|-----------|--------|
| Brand | `/brand` | (auto-created from gear loads) | — |
| Webbing | `/webbing` | `webbings.json` | 245 |
| Weblock | `/weblock` | `weblocks.json` | 127 |
| Roller | `/roller` | `rollers.json` | 21 |
| LeashRing | `/leashring` | `leashrings.json` | 34 |
| Grip | `/grip` | `grips.json` | 20 |
| TreePro | `/treepro` | `treepros.json` | 25 |
| StarterKit | `/starterkit` | `starterkits.json` | 64 |
| TricklineKit | `/tricklinekit` | `tricklinekits.json` | 10 |
| ISAGearWarning | `/isawarning` | `isa_gear_warnings.json` | 88 |

### ISA gear warnings

`isa_gear_warnings.json` (root, 82 entries scraped from the ISA's warnings database) is loaded by
`load_data/load_isa_warnings.py`, which **runs last in `seed.py`** — it addresses gear by primary
key, so every gear table must already be populated. Each entry carries a hand-adjudicated `match`
block (`gearType` / `gearIds` / `gearNames` / `confidence` / `note`) mapping it onto our catalogue;
ids are **verified against the recorded `"<brand> <name>"`** before use, so seed-order drift is
reported instead of silently re-pointing a recall. The pass writes two things:

1. `isa_warning` (the `ISAWarning` enum) onto the gear row — worst severity wins. Only
   webbing / weblock / roller / leashring / grip have the column.
2. One `ISAGearWarning` row per (entry x matched gear id) — `models/isa_gear_warnings.py`, served
   read-only by `/isawarning` — holding the full entry (description, solution, parsed date, source
   links, in-production flag, match confidence). It has **no FK**: `(gear_type, gear_id)` is the
   link, because a warning can land on any of five tables.

Seeding is gated on the `ISAGearWarning` table being empty. Eight entries match nothing we hold —
tracked in BACKLOG.md.

### Co-listings — one product, several sellers

`brand_id` on a gear row says who **makes** the thing. It could not say "…and
Spider Slacklines sells the same webbing on their own site", which is true of
most of the Slack Inov range: the two companies co-list each other's gear, each
with their own product page. **`gear_sellers`**, a column on every gear model,
is that second statement — a list of seller brand NAMES, stored on the product.

- **The gear row stays one row.** A second row per seller would split the things
  that must not split — a correction filed against one copy, or an ISA recall
  landing on it, would leave the other displayed with a clean record. (That
  failure is already live for the EQB/Spider `Bandit SH`/`SL` twins; see
  BACKLOG.md.) Ids are untouched, and so is every id already recorded in an ISA
  match block, a manufacturer credential or a bookmarked link.
- **It lives beside the item, in the item's own seed.** `"gear_sellers":
  ["Slack Inov"]` sits next to `"brand"` in `webbings.json`, `weblocks.json` and
  the rest — not in a side file of `(gear_type, gear_id)` cross-references,
  which is a second thing to keep in step with the seeds and a fresh chance to
  mistype an id on every line. The trade is deliberate: there is no per-seller
  price, product URL or stock flag, because a name is all we actually hold (see
  the provenance below).
- **A JSON column** (`list[str] | None`, `sa_column=Column(JSON)`), so a row
  with no sellers holds JSON `null`, not SQL NULL — filter it in Python, never
  with `.is_not(None)` in SQL. `[]` is never written: null is "none recorded".
- **Names are resolved at seed time**, by `load_data/load_seller_brands.py`,
  which runs **after every gear loader and just before the brand enrichment**
  (it reads the rows they wrote, and it can create a brand the enrichment must
  then reach). It canonicalizes each name (`weblocks.json` spells one maker
  "Spider slacklines"; the frontend compares against `brand_name`, so a variant
  matches nothing and errors nowhere), and reports-then-drops three things: a
  name with no `manufacturers.json` entry, a maker listed among its own sellers,
  and a duplicate. One bad name costs that name, not the boot.
- **A seller that makes nothing we hold is created there**, from its
  `catalog_id` in `manufacturers.json`. This is the one place a `Brand` row is
  born outside a gear loader, and it has to be: a shop that resells and
  manufactures nothing has no product to arrive with, so it would otherwise be
  the single kind of brand co-listings cannot name. `brand_catalog_id()` bounds
  it — an unrecognised name is a typo far more often than a new shop. Such a
  brand shows on the directory page with zero items, because inventory counts
  group gear rows by maker and know nothing about sellers.
- **Nobody may edit it through the API.** `gear_sellers` is in `_EXCLUDED` in
  `submissions/fields.py`, so it is absent from both the public suggestion box
  and the manufacturer API: who resells a product is ours to record, a maker
  does not get to declare (or delete) a competitor's shelf, and `changes` is a
  dict of strings that could not carry a list anyway.

**On the frontend** the sellers arrive with the item — no second fetch, no
index — and `utils/sellers.ts` is one function (`brandsFor`: maker first, then
the sellers, deduped). Two surfaces read it:

- the listing sidebar's **Brand** filter, whose pills match an item's maker
  *plus* every brand co-listing it (`config/brandGroup.ts`, via the derived
  `brands` field the listing page attaches);
- **"Also sold by"** on the gear detail page
  (`components/gear/AlsoSoldBy.tsx`, rendered by `GearDetailBody.tsx` under the
  price and above the ISA certification block) — each shop's name, linked to its
  brand page. DESIGN.md § Also sold by.

Seeded today: **64 co-listings**, from two sources with very different
provenance.

- **SlackX** (`slackx.eu`, catalog_id 97) sells both Radrigs weblocks — the
  `Orange` and the `Slackfriend`. Recorded by hand from their shop. SlackX
  continues the Radrigs line and makes nothing else we hold, which is exactly
  the seller-only brand case above.
- **Slack Inov ↔ Spider Slacklines**, 62: the two companies each sell the
  other's entire range, so every item made by one names the other, across all
  eight gear types. Recorded in bulk from the operator's statement, not from a
  per-product scrape — which is precisely why a name is the whole claim. No
  price, URL or per-shop stock flag is stored for any co-listing: none was
  sourced, and "does this shop still stock it" is a different question from the
  product's own `active`, which for a fair part of this range is `false`.

**Not done here:** the rebadge half (EQB/Spider `Bandit`, Landcruising/Aki
`Unicorn` — two rows that are one product and should be merged with a
redirect), and anything on the **card** — the card shows the maker, because the
specs are the maker's, and inventory counts still assume one row is one product,
so a seller-only brand like SlackX reads as "0 items" on the manufacturers page
even though it sells two. See BACKLOG.md.

### Read-only mode (`api/routing.py`)

Hosted, the catalogue is a SQLite baked into the Lambda image and opened `mode=ro&immutable=1`, so
writes cannot work. `register_routers(app, read_only=READ_ONLY)` therefore **does not mount the
`POST`/`PATCH`/`DELETE` routes at all** when `READ_ONLY` — they answer 405 and are absent from the
OpenAPI schema, rather than 403-ing per route. `/docs`, `/redoc` and `/openapi.json` are off too
(`ENABLE_DOCS=true` re-enables them). Local dev is unaffected: `READ_ONLY` is false, every route
mounts, and the loaders/tests work as before.

`tests/conftest.py` builds its app through the same `register_routers`, so the tests exercise the
routes production serves. `tests/test_read_only.py` is the regression guard — if a refactor of
`main.py` reinstates the write routes hosted, it fails there.

### Submissions (Phase 2) — a second, writable store

The "suggest a correction" box. **A submission is a note to the admin, not an edit** — approving one
records the outcome and produces a JSON patch the admin applies to the root `*.json` by hand,
followed by a redeploy. The catalogue stays read-only. See [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md)
and DESIGN.md § Suggest a Correction.

The important structural point: `register_routers` splits its routers in two. `CATALOG_ROUTERS` lose
their writes under `READ_ONLY`; `WRITABLE_ROUTERS` (just `submissions_router`) mount in full in every
mode, because they write to a **different database** — DynamoDB hosted, a separate SQLite file
locally. `POST /submissions/` therefore works on the live site while the catalogue cannot be written
at all.

- **The submissions router takes no `SessionDep`.** Reaching for the catalogue session would pass
  every local test (where SQLite is writable) and fail on the live site. `tests/test_submissions.py`
  asserts it explicitly by wiring `get_session` to a dependency that raises.
- **Which store** is chosen by env var in `submissions/store.py`: `SUBMISSIONS_TABLE` → DynamoDB,
  otherwise `SUBMISSIONS_DB_PATH` (default `submissions.db` in the CWD). boto3 is imported lazily, so
  the suite and Cypress run with no AWS credentials and no boto3 installed.
- **Ids are monotonic ULIDs** (`utilities/ulid.py`), so sorting by primary key *is* sorting by
  creation time — which is the triage queue's whole contract ("pending, oldest first"). Monotonic
  within a millisecond, deliberately: plain ULIDs tie on a burst.
- **Correctable field names are derived**, never written down — `submissions/fields.py` reads each
  gear type's real `<X>Update` schema. `tests/test_frontend_contract.py` then checks the frontend's
  form offers only names that list contains.
- **Append-only.** The repository Protocol has no `delete`, and the hosted IAM role is not granted
  `dynamodb:DeleteItem`. Expiry is DynamoDB's TTL on `expires_at`.
- **No IP or user-agent is stored** — an anonymous suggestion box that logs IPs is not one. Abuse is
  handled by Turnstile (fail-closed), a honeypot, and API Gateway route throttling.

### The manufacturer API (Phase 4) — brands updating their own gear

`POST /manufacturer/gear`, authenticated per brand. **We publish; they call.**
See [MANUFACTURER_API_PLAN.md](MANUFACTURER_API_PLAN.md).

It reuses the submissions pipeline rather than forking it: an update becomes an
ordinary `Submission` with `kind="manufacturer"`, validated against the same
derived field list (`submissions/fields.py`). What differs is trust and shape.

- **Auto-approved on arrival.** The sender makes the product, so there is no
  decision left — only the JSON edit and the redeploy. Records are stored
  `APPROVED`, which (via `expiry_for`) means they **never expire**: it is work
  outstanding. The admin's remaining move is "Mark handled" — or "Reject
  instead", which exists precisely because nobody judged it on the way in.
- **One call, N products, N records, one `batch_id`.** The review unit is one
  product's JSON patch; triage regroups them (`frontend/src/utils/batches.ts`).
  **Resolution is all-or-nothing**: if any item fails to match, nothing is
  stored, so that retry is always safe. The *writes* are a loop rather than a
  transaction (no `dynamodb:TransactWriteItems` is granted), so a store failure
  part-way answers 502 naming how many landed and the `batch_id` — a blind retry
  there duplicates them.
- **Identity is verify-then-self-heal** (`manufacturers/matching.py`), and it
  applies to the *brand* as well as the gear. `verify_brand()` runs on every
  route: `brand_id` is a seed-order autoincrement just like a gear id, and
  `register.py` resolves it against the operator's local catalogue, so a drifted
  id would otherwise hand a credential another company's inventory rather than
  erroring. A mismatch with the stored `brand_name` is a 503, not a guess.
  For the gear itself — ids drift with seed order, names collide, and we hold no
  SKU column. So: a brand
  discovers our ids from `GET /manufacturer/gear`, sends `gear_id` + `name`
  back, we check the id is **theirs** and that the name still agrees, fall back
  to matching the name within their own brand when it doesn't, refuse ambiguity
  rather than guessing, and **echo the resolved id back** so their mapping
  corrects itself. Same guard as `load_isa_warnings.py`.
- **`manufacturer_sku` is stored but matches nothing yet** — recorded now so
  brands never have to re-send it, and so it can be promoted into the root
  `*.json` later.
- **A second verifier, not a loosened one.** `verify_manufacturer_token` sits
  beside `verify_cognito_token`, sharing only `signing_key()` and the JWKS
  cache. A client-credentials access token has no `aud` claim at all, so it
  cannot pass the admin path — and that path guards admin login, so it must not
  be made to. Identity is `client_id` → `brand_id` through the
  `slackdata-brand-clients-*` table, which is what makes revocation one PutItem
  instead of a redeploy.
- **This router *does* take a `SessionDep`** — unlike `submissions_router` — and
  reads through it only, to answer "which of your products is this?". Reads are
  fine hosted; a write would pass every local test and fail live.
  `tests/test_manufacturer_api.py` wires a session whose writes raise.
- **Full write rights are designed for, not built.** `BrandPermission.WRITE`
  exists and is not honoured: `may_write_directly()` returns False structurally,
  because the hosted catalogue physically cannot be written. The per-item
  response already reports `applied: true/false`, so the day it flips, brands'
  integrations need no new field — and a test pins the current answer so the
  flip is deliberate.

Onboarding is a **CLI, not a route** (`python -m slack_data.manufacturers.register`):
minting credentials decides whose data a token can change, it happens a dozen
times a year, and an endpoint for it would be a permanent attack surface.

Admin auth (`api/auth.py`) has three modes: a Cognito pool set → verify the RS256 **ID** token
against the pool's JWKS; unset **and hosted** → reject everything with 503, never fall through;
unset and local → a static `ADMIN_DEV_TOKEN`. That middle row is why the dev token is safe to have in
the repo: reaching it requires no pool *and* no `CATALOG_DB_PATH`, and `Dockerfile.lambda` always
sets the latter.

### Non-model routers

`/fx/rates` (`api/routers/fx_router.py` + `utilities/fx.py`) — EUR-based exchange rates for the
frontend's display layer. **No model, no table, no DB access**, so it is safe under the hosted
read-only catalog. Rates are cached in a module-level dict with a TTL (the only cache available on
Lambda's read-only filesystem) and every failure path falls back to a baked-in table with
`stale: true` — a 5xx here would blank the price on every card. Prices themselves are **never**
converted in storage; see DESIGN.md § Currency & Prices.

### In-progress models (branch `bungees_ringpadding`)

`Bungee` (`models/bungees.py`) and `RingPadding` (`models/ringpadding.py`) have models defined but **no seed JSON, no loader, no router, and no `Brand` back-reference** — intentionally, because no source data exists yet. They are not imported in `main.py`. To wire one up once data exists: add the `Brand._<type>` Relationship + computed field, a `<type>s.json`, a loader, a router, and register both in `main.py`.

## Loader pattern (`load_data/load_<type>s.py`)

Each loader defines: `load_<type>s_json()` (one line — `read_seed_json("<type>s.json")`), `clean_<type>_data()` (normalizes blanks/types), `add_<type>s_to_db()` (maps JSON keys → `<X>Create`, resolves brand via `get_brand()`, `session.add()`, commit), and `load_<type>s(session)` orchestrating them. There's an `if __name__ == "__main__"` block for standalone inspection.

Reading the file, locating the repo root, and coercing a seed's loose booleans are **not** per-type knowledge and live in `load_data/_seed_io.py` (`read_seed_json`, `seed_path`, `to_bool`, `require_seed_id`). What stays in each loader is the part that genuinely differs: which JSON key maps onto which model field — including the traps below.

**Every seed item carries an explicit `id`** — the first key in each object, in all eight gear
seeds — and the loaders assign it rather than letting SQLite autoincrement
(`_seed_io.require_seed_id`, called right after each `model_validate`). It is the catalogue's stable
identity: an id used to be a statement about where an item sat in its file, so inserting one product
mid-file shifted every id after it and silently re-pointed ISA warning match blocks, brand
credentials, submitted corrections and bookmarked links. A missing id is a hard error, never a
fallback to autoincrement.

**Brands work the same way**, one level up: `Brand.id` comes from `catalog_id` in
`manufacturers.json` via `load_data/brand_ids.py`, which `get_brand()` calls when it creates a row.
Left to autoincrement, a brand's id recorded which gear file named it first — and a manufacturer
credential is scoped by `brand_id`, so that drift hands one company another's inventory. All 76
entries have a `catalog_id`, including manufacturers we hold no gear for, so their first product
renumbers nothing. A gear seed naming a brand with no entry is refused (`UnknownBrand`).

`scripts/backfill_seed_ids.py` wrote today's assignment into the seeds — nothing was renumbered, so
every id already recorded anywhere stayed correct — and is also how a newly appended item or
manufacturer gets the next free number (`--check` verifies, exit 1 on drift).
`tests/test_seed_ids.py` holds the invariants, including a full seed of the real files and one that
loads `grips.json` **backwards** — the only check that fails if a loader goes back to letting SQLite
choose.

**JSON keys differ per type — always check the existing loader, don't assume:**
- Brand field is `brand` for webbing, but `manufacturer` for grips/leashrings/rollers/treepro/kits.
- Webbing: `materialType` → `FiberMaterial`; `stretch` stored as a JSON string; `date_introduced` → `release_date` (unix ms). **`priceMeter` → `price`** — webbing `price` is therefore **per meter**, not per item; the model field name doesn't say so.
- Weblock: rich SlackDB scrape with nested `specifications`/`pricing`; heaviest parsing (width ranges, ISA yes/no, price/currency regex) in `load_weblocks.py`.
- Rollers: JSON uses `locking_type`, `isa_approved`, `mbs`; loader maps to model enums. **`price_unit` in `rollers.json` holds the CURRENCY** (`"EUR"`), which `load_rollers.py` maps to `currency` — it does *not* mean what `price_unit` means on tree protectors (`single`/`pair`). Don't "fix" it.
- Kits: `tensioning_type` normalized from strings like `RAT1`, `Double Ratchet`.

Timestamps (`release_date`) are unix milliseconds (`int | None`).

## Router pattern (`api/routers/<type>_router.py`)

**Every catalogue router is one call to `crud_router()`** (`api/routers/_crud.py`) — the nine of
them were byte-identical apart from names, so the five handlers are written once and parameterised
by model. A router file is now:

```python
from slack_data.api.routers._crud import crud_router
from slack_data.models.grips import Grip, GripCreate, GripPublic, GripUpdate

grip_router = crud_router(
    prefix="grip", model=Grip,
    create_model=GripCreate, public_model=GripPublic, update_model=GripUpdate,
)
```

What it builds, using `SessionDep`:
- `POST /` — `<X>.model_validate(create)`, add, commit, refresh
- `GET /` — paginated: `offset` (`ge=0`, default 0), `limit` (`le=100`, default 10)
- `GET /{<prefix>_id}` — 404 if missing
- `PATCH /{<prefix>_id}` — `model_dump(exclude_unset=True)` then `setattr` each field
- `DELETE /{<prefix>_id}` — returns `{"ok": True}`

`prefix` drives the URL prefix, the OpenAPI tag, the `{<prefix>_id}` path parameter and the handler
names (hence the `operationId`s); the 404 label is the model's class name. The path parameter and
the handler names are **published API surface** — `_crud.py` goes to some trouble to keep them
per-type rather than generic, and `tests/test_read_only.py` asserts the exact path template.

Register every new router in `main.py` via `app.include_router(...)`, and add it to
`CATALOG_ROUTERS` in `api/routing.py` so read-only mode strips its writes.

`isa_warning_router`, `fx_router` and `submissions_router` are hand-written — they are not CRUD over
a gear table.

### The API Gateway route/throttle invariant

`infra/serverless.yml` throttles three routes by name, and API Gateway rejects a `RouteSettings` key
whose route does not exist. Two ways that breaks, both of which took down a deploy on 2026-08-25:
the stage updating before the routes are created (fixed with an explicit `DependsOn`), and two route
keys normalising to one CloudFormation logical id (`POST /submissions` and `POST /submissions/`, so
the un-slashed one is now hand-declared in `resources.Resources`). `infra/check-routes.py` checks
both on the source — no AWS credentials, no `serverless package` — and is run by both
`infra/preflight.sh` and `tests/test_infra_routes.py`. **Adding a throttled route means adding it to
`RouteSettings` and to `HttpApiStage.DependsOn`.**

## Adding a new gear type (checklist)

1. **Model** — `models/<type>.py`: `Base<X>`, `<X>(table=True)`, `<X>Public`/`<X>Create`/`<X>Update`, enums, `brand` Relationship.
2. **Brand** — add `Brand._<type>` Relationship + `@computed_field` list in `brands.py`.
3. **JSON** — `<type>s.json` at repo root (array of objects), each with an explicit `id` (first
   key) and a `brand`/`manufacturer` that has an entry in `manufacturers.json`.
4. **Loader** — `load_data/load_<type>s.py` following the pattern above, including
   `db_<x>.id = require_seed_id(<item>, "<type>s.json")` after `model_validate`.
5. **Router** — `api/routers/<type>_router.py`: one `crud_router(...)` call.
6. **Wire up** — in `main.py`: import + add empty-checked loader call in lifespan, and `include_router`.
7. **Ids** — add the file to `SEEDS` in `scripts/backfill_seed_ids.py`, to `SEEDS`/`MODELS` in
   `tests/test_seed_ids.py`, then run the script to number the new items.
8. **Re-seed** — delete `slack_data/database.db`, restart.

## Frontend ↔ Backend contract rule

**Always read the model files before writing frontend code that depends on field names, types, or enums.** Do not rely on DESIGN.md, CLAUDE.md summaries, memory, or previous session history as the source of truth for the data schema. The canonical source is the Python model files in `slack_data/models/`. This applies to:

- Filter group definitions (which fields are filterable, what their enum values are)
- Spec row definitions on detail pages (field names, units, nullability)
- Card anatomy (which fields to display inline, which are always-present vs optional)
- TypeScript type definitions (must mirror the `Public` schema exactly)
- Cypress test assertions (data-field attributes, expected values)

Before writing any of the above, open the relevant `models/<type>.py` and `utilities/` files and read them. Do not assume — verify.

## Conventions

- Imports are absolute (`from slack_data....`).
- `manufacturers.json` (77 entries) at root **is loaded — but as an enrichment pass, not a creator**. Brand rows are still created on the fly by `get_brand()` with only a name; `load_manufacturers.py` then backfills `country` / `year_founded` / `website` / `socials` / `contact_email` / `active` / `slackline_focused` onto the rows that already exist, matching on `canonical_brand()`. Its `catalog_id` **is** read at creation time, though — that is where `Brand.id` comes from (see § Loader pattern). It never inserts a brand (an entry with no matching row means we hold no gear for that manufacturer — `load_seller_brands.py` is the one pass that will insert one, for a seller-only brand). It **must run after every pass that creates a brand row** — the gear loaders and the seller-name pass, and is gated on "no brand has a country yet" rather than on an empty table. `contact_email` is the one field here that is **ours, not SlackDB's** — scraped from each manufacturer's own site (38/77 as of 2026-09-02; the rest publish a contact form only, or have no site left). `metadata.email_source` in the JSON records that provenance.
- Country is stored as the `Country` enum's **full display name** (`"Germany"`), not an ISO code; `get_country()` in `utilities/countries.py` maps the sources' alpha-2 codes onto the enum.
- `BrandPublic` only declares `webbings` in its response schema — other gear lists exist on the ORM model via `@computed_field` but may not serialize in API responses.
- No auth — all endpoints are open.
- Known small artifacts: some routers carry a copy-paste variable name (`heroes`); a `reccomended_line_length` typo in the bungee model.

## What to ignore

- `venv/`, `.venv/` — local environments (dependencies)
- `database.db` / `*.db` — generated SQLite, recreated at runtime
- `slackdata.egg-info/`, `uv.lock` (unless changing deps), `.git/`
- Full contents of `webbings.json` / `weblocks.json` (~120–155 KB) — read one item for the schema, not the whole file
