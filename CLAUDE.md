# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SlackData is a **better, open-source replacement for [SlackDB](https://slackdb.com/)** — a community database of slackline gear. Goals vs SlackDB: stronger/simpler backend, modern UX design, and an account system (manufacturer accounts with edit access, general user accounts with suggest access, admin accounts for approvals).

Current state: backend only (FastAPI + SQLModel + SQLite), no frontend, no hosted deployment, no test suite, no CI.

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

**Immediate priority:** A sandboxed React + TypeScript + Vite frontend using **simulated/mock data only** — no backend connection yet. Focus entirely on UI display, layout, and component design before wiring up real API calls.

Directory: `frontend/` at repo root (not yet created).

**Tech:** React, TypeScript, Vite. No framework decision beyond that has been made yet.

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
- **Above grid**: search bar left, Cards | Chart view toggle, item count, SORT BY dropdown right
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

There is **no test suite** and no CI. Verify changes by running the server and exercising endpoints via `/docs`. The README's install snippet says `uv venv` then `source venv/bin/activate`, but `uv` actually creates `.venv` — use `source .venv/bin/activate` for the uv path.

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
| `slack_data/api/routers/<type>_router.py` | REST CRUD — copy this pattern for new types |
| `slack_data/utilities/` | shared enums/helpers (currency, country, materials, ISA warnings) |

There are `__init__.py` files in `models/`, `api/`, and `utilities/`. No `tests/`, no `.github/`, no Docker, no migrations (SQLModel `create_all` only).

### Startup & seeding (`main.py` lifespan)

1. `create_db_and_tables()` creates the SQLite engine and all tables. It raises if called twice (`DATABASE_ENGINE` is a module global).
2. For each gear type: `select(<Model>).first()` — **if the table is empty**, run the matching `load_*(session)`.
3. **Seeding is one-shot.** Once any row exists for a gear type, its JSON is never re-read. To re-seed after editing JSON: delete `slack_data/database.db` and restart the server.

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

### Active models (wired into `main.py`)

| Model | Table / router prefix | JSON seed | ~Count |
|-------|-----------------------|-----------|--------|
| Brand | `/brand` | (auto-created from gear loads) | — |
| Webbing | `/webbing` | `webbings.json` | 88 |
| Weblock | `/weblock` | `weblocks.json` | 109 |
| Roller | `/roller` | `rollers.json` | 19 |
| LeashRing | `/leashring` | `leashrings.json` | 31 |
| Grip | `/grip` | `grips.json` | 12 |
| TreePro | `/treepro` | `treepros.json` | 23 |
| StarterKit | `/starterkit` | `starterkits.json` | 64 |
| TricklineKit | `/tricklinekit` | `tricklinekits.json` | 9 |

### In-progress models (branch `bungees_ringpadding`)

`Bungee` (`models/bungees.py`) and `RingPadding` (`models/ringpadding.py`) have models defined but **no seed JSON, no loader, no router, and no `Brand` back-reference** — intentionally, because no source data exists yet. They are not imported in `main.py`. To wire one up once data exists: add the `Brand._<type>` Relationship + computed field, a `<type>s.json`, a loader, a router, and register both in `main.py`.

## Loader pattern (`load_data/load_<type>s.py`)

Each loader defines: `load_<type>s_json()` (reads `Path(__file__).parent.parent.parent / "<type>s.json"`), `clean_<type>_data()` (normalizes blanks/types), `add_<type>s_to_db()` (maps JSON keys → `<X>Create`, resolves brand via `get_brand()`, `session.add()`, commit), and `load_<type>s(session)` orchestrating them. There's an `if __name__ == "__main__"` block for standalone inspection.

**JSON keys differ per type — always check the existing loader, don't assume:**
- Brand field is `brand` for webbing, but `manufacturer` for grips/leashrings/rollers/treepro/kits.
- Webbing: `materialType` → `FiberMaterial`; `stretch` stored as a JSON string; `date_introduced` → `release_date` (unix ms).
- Weblock: rich SlackDB scrape with nested `specifications`/`pricing`; heaviest parsing (width ranges, ISA yes/no, price/currency regex) in `load_weblocks.py`.
- Rollers: JSON uses `locking_type`, `isa_approved`, `mbs`; loader maps to model enums.
- Kits: `tensioning_type` normalized from strings like `RAT1`, `Double Ratchet`.

Timestamps (`release_date`) are unix milliseconds (`int | None`).

## Router pattern (`api/routers/<type>_router.py`)

Standard CRUD using `SessionDep`:
- `POST /` — `<X>.model_validate(create)`, add, commit, refresh
- `GET /` — paginated: `offset` (`ge=0`, default 0), `limit` (`le=100`, default 10)
- `GET /{id}` — 404 if missing
- `PATCH /{id}` — `model_dump(exclude_unset=True)` then `setattr` each field
- `DELETE /{id}` — returns `{"ok": True}`

Register every new router in `main.py` via `app.include_router(...)`. `APIRouter(prefix="/<type>", tags=["<type>"], responses={404: ...})`.

## Adding a new gear type (checklist)

1. **Model** — `models/<type>.py`: `Base<X>`, `<X>(table=True)`, `<X>Public`/`<X>Create`/`<X>Update`, enums, `brand` Relationship.
2. **Brand** — add `Brand._<type>` Relationship + `@computed_field` list in `brands.py`.
3. **JSON** — `<type>s.json` at repo root (array of objects).
4. **Loader** — `load_data/load_<type>s.py` following the pattern above.
5. **Router** — `api/routers/<type>_router.py` (CRUD).
6. **Wire up** — in `main.py`: import + add empty-checked loader call in lifespan, and `include_router`.
7. **Re-seed** — delete `slack_data/database.db`, restart.

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
- `manufacturers.json` (74 brands) at root is **reference metadata only — not loaded**; brand rows are created on the fly by `get_brand()`, so brand `country`/`website`/etc. are not populated.
- `BrandPublic` only declares `webbings` in its response schema — other gear lists exist on the ORM model via `@computed_field` but may not serialize in API responses.
- No auth — all endpoints are open.
- Known small artifacts: some routers carry a copy-paste variable name (`heroes`); a `reccomended_line_length` typo in the bungee model.

## What to ignore

- `venv/`, `.venv/` — local environments (dependencies)
- `database.db` / `*.db` — generated SQLite, recreated at runtime
- `slackdata.egg-info/`, `uv.lock` (unless changing deps), `.git/`
- Full contents of `webbings.json` / `weblocks.json` (~120–155 KB) — read one item for the schema, not the whole file
