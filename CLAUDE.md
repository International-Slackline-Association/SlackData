# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git push protocol — ALWAYS do this before pushing

Before pushing any branch, run `git diff main...HEAD --stat` and list every changed file explicitly to the user. Ask them to confirm what should and shouldn't be included **before** running any push or branch creation. Never assume a branch is clean based on what commits were made in the current session — the branch's ancestry may include unrelated work (frontend files, JSON data, etc. have contaminated branches before).

---

## Project

SlackData is a **better, open-source replacement for [SlackDB](https://slackdb.com/)** — a community database of slackline gear. Goals vs SlackDB: stronger/simpler backend, modern UX design, and an account system (manufacturer accounts with edit access, general user accounts with suggest access, admin accounts for approvals).

**Current state:** Backend is functional with 9 active gear types. Frontend exists as a sandboxed mock-data UI (not yet connected to backend). A pytest test suite covers all active gear types. No hosted deployment, no auth, no CI.

**Stack:** Python ≥3.10 backend (FastAPI, SQLModel, SQLite) + React/TypeScript/Vite frontend (mock data only).

---

## Product Vision

### What SlackDB has (reference for what to replicate/improve)

- **Homepage:** Stats dashboard (gear counts by type, knowledge/images/manufacturers/communities totals), edit-suggestions panel, latest-activity feed showing contributor actions.
- **Gear listings** (9 types): Card or table view per item with image, rating, manufacturer, title, key specs. Text search, dynamic spec filters, continent filters, sort controls, and a **Compare** feature. Actions per item: Show details, Compare, Read reviews, Write review.
- **Gear detail page:** Full spec sheet, user ratings/reviews, images, contributor attribution.
- **Manufacturers:** List view + map view. Per entry: name, rating/review count, slackline-focused flag, year founded, website/socials, gear inventory counts by type.
- **Knowledge base:** Community-contributed articles tagged to gear types, filterable.
- **User accounts:** Contribution tracking, edit-suggestion workflow, community ratings with pros/cons.
- **Multi-currency support**, data-accuracy disclaimer.

### What we're building differently

- Cleaner backend (already done — FastAPI/SQLModel vs SlackDB's stack).
- Modern, polished UI — SlackDB's design is dated; ours should feel contemporary.
- Structured account tiers: **manufacturer** (full edit rights on their gear), **general user** (suggest edits, community ratings), **admin** (approve suggestions, manage users).
- Better data integrity: approval workflow before changes go live.

---

## Branch and PR state (as of end of this session)

| Branch | Contents | Status |
|---|---|---|
| `main` | All merged work | ✓ current |
| `frontend` | Complete React/TS/Vite frontend with mock data | Ready for PR — not yet opened |
| `backend/tests` | 145-test pytest suite + 2 production bug fixes | Ready for PR — not yet opened |
| `refactor/schema-models` | All-optional base schema refactor | **Merged as PR #17** |
| `bungees_ringpadding` | Bungee + ring padding models | **Merged as PR #16** |

**Merge order for pending PRs:** `frontend` first (it's independent), then `backend/tests` (tests depend on the schema from PR #17 already being on main — it is).

---

## Commands

```bash
# Backend setup
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"   # installs fastapi, sqlmodel, pytest, ruff

# Run the dev server — MUST cd into slack_data first; database.db is created in CWD
cd slack_data
fastapi dev main.py       # → http://127.0.0.1:8000  (/docs for interactive OpenAPI)

# Run tests (from repo root)
pytest                    # 145 tests, all active gear types

# Lint
ruff check .

# Frontend setup (from repo root)
cd frontend
npm install
npm run dev               # → http://localhost:5173
```

**Re-seeding:** Delete `slack_data/database.db` and restart the server. Seeding is one-shot — once any row exists for a type, its JSON is never re-read.

---

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
| `tests/conftest.py` | pytest fixtures — in-memory SQLite test app, `session`, `client`, `brand` |

### Startup & seeding (`main.py` lifespan)

1. `create_db_and_tables()` creates the SQLite engine and all tables. **It raises if called twice** (`DATABASE_ENGINE` is a module global — important for tests, which bypass the lifespan entirely).
2. For each gear type: `select(<Model>).first()` — **if the table is empty**, run the matching `load_*(session)`.
3. **Seeding is one-shot.** To re-seed: delete `slack_data/database.db` and restart.

### Data model

**`Brand`** (`models/brands.py`) is the central entity. Every gear type links to it via `brand_id` FK. `Brand` holds a `_<type>` Relationship for each gear type plus a `@computed_field` returning member names.

**`get_brand(session, brand_cache, item)`** — upserts a brand by `item["brand"]` name. Returns `(brand_id, updated_cache)`. Called by every loader; caches IDs to avoid duplicate DB inserts per load run.

### Per-gear-type schema pattern (all-optional base)

Every gear type follows this structure — **do not deviate from it**:

```python
class BaseWebbing(SQLModel):
    # ALL fields optional — adding a new field is one line here, propagates everywhere
    name: str | None = Field(default=None, index=True)
    material: FiberMaterial | None = None
    width: int | None = None              # required field made optional in base
    price: float | None = None            # genuinely optional field
    ...

class Webbing(BaseWebbing, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)         # re-declared required → NOT NULL in DB
    material: FiberMaterial               # re-declared required → NOT NULL in DB
    width: int                            # re-declared required → NOT NULL in DB
    brand_id: int = Field(foreign_key="brand.id")
    brand: "Brand" = Relationship(...)
    @computed_field
    def brand_name(self) -> str: ...

class WebbingPublic(BaseWebbing):
    name: str                             # re-declared required (accurate API docs)
    material: FiberMaterial
    width: int
    brand_name: str
    class Config: orm_mode = True; validate_assignment = True; extra = "forbid"

class WebbingCreate(BaseWebbing):
    name: str                             # re-declared required on create
    material: FiberMaterial
    width: int
    brand_id: int                         # required on create
    class Config: exclude = ["id"]; validate_assignment = True

class WebbingUpdate(BaseWebbing):
    # Inherits all-optional base → true PATCH semantics, no overrides needed
    brand_id: int | None = None
    class Config: exclude = ["id"]; validate_assignment = True; extra = "forbid"
```

**Why this pattern:** Adding a new optional field = one line in `Base*`. New required fields need re-declaring in the table model, `*Public`, and `*Create` (three places), but `*Update` gets it for free. `*Update` inheriting the all-optional base gives true PATCH semantics — clients send only changed fields.

### Active models (wired into `main.py`)

| Model | Router prefix | JSON seed | Required fields (beyond name + brand_id) |
|-------|--------------|-----------|------------------------------------------|
| Brand | `/brand` | (auto-created) | name |
| Webbing | `/webbing` | `webbings.json` | material, width |
| Weblock | `/weblock` | `weblocks.json` | material, width_min |
| Roller | `/roller` | `rollers.json` | material, roller_material, slider_type, lock_type, bearing_material |
| LeashRing | `/leashring` | `leashrings.json` | material |
| Grip | `/grip` | `grips.json` | material, width_min |
| TreePro | `/treepro` | `treepros.json` | (none beyond name) |
| StarterKit | `/starterkit` | `starterkits.json` | webbing_length, webbing_width, tensioning_type |
| TricklineKit | `/tricklinekit` | `tricklinekits.json` | webbing_length, webbing_width, tensioning_type |

### In-progress models (not yet wired)

`Bungee` (`models/bungees.py`) and `RingPadding` (`models/ringpadding.py`) have models but **no seed JSON, no loader, no router, no Brand back-reference**. To wire one up: add `Brand._<type>` Relationship + computed field, a JSON file, a loader, a router, and register in `main.py`.

---

## Router pattern

Standard CRUD using `SessionDep`:
- `POST /` — `<X>.model_validate(create)`, add, commit, refresh. **Always call `model_validate` on the CLASS (`Weblock.model_validate(...)`) not the instance (`weblock.model_validate(...)`) — a bug was found and fixed in `weblock_router.py` where the instance form was used.**
- `GET /` — paginated: `offset` (`ge=0`, default 0), `limit` (`le=100`, default 10)
- `GET /{id}` — `Path(gt=0)`, 404 if missing
- `PATCH /{id}` — `model_dump(exclude_unset=True)` then `setattr` each field
- `DELETE /{id}` — returns `{"ok": True}`

Some routers have a copy-paste artifact: the list variable is named `heroes` instead of the gear type name. Harmless but worth cleaning up eventually.

---

## Loader pattern

Each loader: `load_<type>s_json()` → `clean_<type>_data()` → `add_<type>s_to_db()` → `load_<type>s(session)`.

**JSON keys differ per type — always check the existing loader:**
- Brand field: `brand` for webbing/weblocks, `manufacturer` for grips/leashrings/rollers/treepro/kits.
- Webbing: `materialType` → `FiberMaterial`; `stretch` stored as JSON string; `date_introduced` → `release_date` (unix ms).
- Weblock: heavy parsing — width ranges, ISA yes/no, price/currency regex.
- Kits: `tensioning_type` normalized from strings like `RAT1`, `Double Ratchet`.

**`clean_webbing_data()` branch order matters:** The `isa_certified` check must come before the generic empty-string-to-None check, or `isa_certified=""` becomes `None` instead of `False`. This was a bug that was fixed — do not reorder the branches.

---

## Testing

The pytest suite lives in `tests/`. 145 tests covering all 7 active gear types.

### How it works

Tests use a bare FastAPI app (no lifespan, no seeding) with an in-memory SQLite database. Each test gets a fresh empty DB. `conftest.py` provides:
- `engine` fixture — in-memory SQLite with `StaticPool`
- `session` fixture — SQLModel Session over the engine
- `client` fixture — TestClient with `get_session` overridden to use the test session
- `brand` fixture — a pre-inserted `Brand` row available to all tests

**Why no lifespan:** The production lifespan calls `create_db_and_tables()` (which raises if called twice — `DATABASE_ENGINE` is a module global) and seeds from JSON files. Bypassing it entirely is cleaner than monkeypatching 8 loader functions.

### Coverage

Each gear type has: list empty, list returns items, list includes brand_name, get by id, get 404, create with required fields, create with optional fields, create missing required field → 422, patch updates field, patch doesn't touch other fields, patch 404, delete, delete 404.

Loader tests cover `get_material_type()` string→enum mapping and `clean_webbing_data()` normalisation.
Brand tests cover `get_brand()` upsert, cache behaviour, and `brand_name` in API responses.

---

## Frontend

Located in `frontend/`. React 18 + TypeScript + Vite + Tailwind CSS. **Mock data only — not connected to the backend API yet.**

Covers all 8 gear types in the nav (Webbings, Weblocks, Leash Rings, Grips, Rollers, Tree Protectors, Starter Kits, Trickline Kits) plus a Manufacturers page. Features: filterable/sortable gear listing, gear detail page, loading skeletons.

Key frontend files:
- `frontend/src/types/` — TypeScript types mirroring backend models exactly (field names match backend)
- `frontend/src/config/filterConfigs.ts` — filter definitions per gear type (drives sidebar)
- `frontend/src/config/specConfigs.ts` — spec/badge/tag config per gear type (drives card and detail rendering — no `Record<string, unknown>` casts in components)
- `frontend/src/services/gear.ts` — mock service layer structured so swapping to real API = change one file
- `frontend/src/mocks/` — representative mock data per gear type

Frontend types are structured to match backend field names exactly so connecting to the real API requires minimal changes.

---

## Open architectural decisions — DO NOT resolve without asking the user

### 1. Do API responses include the item `id`? (OPEN)

Currently `*Public` response models do not include `id` — this was intentional (avoids exposing internal DB integer IDs). Consequence: a client that creates an item via `POST` has no ID to reference it for later `PATCH`/`DELETE`. Ask the user before adding `id` to any `*Public` model.

**Options:**
- **A.** Add `id: int | None = None` to all `*Public` models — standard REST.
- **B.** Separate `*Created` response for POST only.
- **C.** Keep as-is — acceptable if writes are admin-only and not driven by API responses.

### 2. PATCH semantics (RESOLVED ✓)

`*Update` models inherit the all-optional base, so all fields are optional. True PATCH semantics work — clients send only changed fields. `exclude_unset=True` in the router correctly applies only sent fields.

---

## Conventions

- Imports are absolute (`from slack_data....`).
- `manufacturers.json` at root is **reference metadata only — not loaded**; brand rows are created on the fly by `get_brand()`.
- No auth — all endpoints are open.
- `database.py` creates the engine with `echo=True` — SQL is logged verbosely.
- `reccomended_line_length` typo in `models/bungees.py` — preserved intentionally to avoid breaking anything.
- Pydantic v2 deprecation warnings (`orm_mode` → `from_attributes`, class-based `Config`) appear on every test run — pre-existing, not blocking, not urgent.

## What to ignore

- `venv/`, `.venv/` — local Python environments
- `database.db` / `*.db` — generated SQLite, recreated at runtime
- `slackdata.egg-info/`, `uv.lock` (unless changing deps), `.git/`
- `frontend/node_modules/`, `frontend/.vite/` — frontend build artifacts
- Full contents of `webbings.json` / `weblocks.json` (~120–155 KB) — read one item for the schema, not the whole file
