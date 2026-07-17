# Frontend Build Plan & Status

The single source of truth for **where the frontend build is and what's next**. TDD against a
pre-written, red-first Cypress suite that runs on the **real backend** (no mocks).

- **Design spec** (visual + per-type filter/sort/spec-row definitions): [DESIGN.md](DESIGN.md)
- **Architecture / backend conventions**: [CLAUDE.md](CLAUDE.md)
- **Schema is canonical in the Python models** — always read `slack_data/models/*.py` before
  writing frontend code that depends on field names, enums, or nullability. Never trust this doc,
  DESIGN.md, or memory as the schema source.

---

## Snapshot

- **Branch:** `frontend`, based on `origin/main` @ `#22` (webbing enrichment is in history).
- **Uncommitted working tree** = all frontend WIP (Phases 1–3) + two backend enablers that are
  **not** on main and must stay on this branch:
  - `id: int` added to every `*Public` model (needed for detail/compare routes).
  - `CORSMiddleware` in `slack_data/main.py` (browser fetch; Cypress `cy.request` bypasses CORS but the app doesn't).
  - Plus a tiny `webbings.json` cleanup (dup `product_url`, stray `width`) and a `.gitignore` tweak.
- Local `frontend` has diverged from pushed `origin/frontend` (still @ 2d5d69c). A future push needs `--force-with-lease`.

**Stack:** React 19 + TypeScript + Vite + Tailwind v4, react-router-dom v7. `erasableSyntaxOnly`
tsconfig → **no TS `enum`s / parameter-properties**; use string-literal unions + `as const` arrays.

---

## Running things

```bash
# Backend — port 8000 (must be up + seeded for Cypress)
cd slack_data && fastapi dev main.py
# Reseed after JSON/loader edits: rm slack_data/database.db then restart (seeding is one-shot per type)

# Frontend dev server — port 5173
cd frontend && npm run dev

# Cypress (this WSL box needs the X11 libs + ELECTRON var unset)
cd frontend
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
export LD_LIBRARY_PATH="$HOME/.local/lib/cypress-deps:$LD_LIBRARY_PATH"
unset ELECTRON_RUN_AS_NODE
npx cypress run --spec cypress/e2e/<spec>.cy.ts
```

**Verify the app compiles before running tests:** `npm run build` (tsc + vite) and `npm run lint`.

---

## Contract rules (locked in)

- **`data-cy` attributes** drive every test; **`data-{field}="<value>"`** on cards (empty string when null) drive order/filter verification.
- **Only numeric (int/float) fields are sortable.** Enums/booleans are filter-only (pills), never in the sort dropdown.
- **Null-last sorting** in both directions. Default sort = API order (first card == API's first item). Name sort = locale compare.
- **Search** is punctuation/space/case-insensitive (`normalize()` strips `[.\-()/ ]`), matches name OR brand; empty query → all, punctuation-only → none.
- **Compare:** max 4 items, same gear type, CTA disabled < 2, clears on gear-type switch, deep-linkable via `?ids=`.
- **URL is state:** `?q=`, `?sort=field-direction`, `?<field>=a,b` (pills), `?<field>_min` / `?<field>_max` (ranges).

---

## Phase roadmap

| # | Phase | Spec | Status |
|---|-------|------|--------|
| 1 | Foundation | — | ✅ done (tsc/build/lint clean) |
| 2 | Nav & layout | `navigation.cy.ts` | ✅ 13/13 |
| 3 | Listing + cards | `gear_cards`, `gear_listing`, `isa_certification`(cards) | ✅ see below |
| 4 | Filters | `filters.cy.ts` | ✅ 308/308 (gear_listing/gear_cards still green) |
| 5 | Search & sort refinement | `search_sort.cy.ts` | ⬜ |
| 6 | Detail page | `gear_detail.cy.ts` + `isa_certification`(detail) | ⬜ |
| 7 | Compare | `compare.cy.ts` | ⬜ |
| 8 | Manufacturers | `manufacturers.cy.ts` | ⬜ |
| 9 | URL-state sweep | `url_state.cy.ts` | ⬜ |
| 10 | Full green + cleanup | (whole suite) | ⬜ |

### ✅ Phase 1 — Foundation
Types mirroring `*Public` schemas (`types/`), gear registry (`config/gearTypes.ts` — 8 available + Bungees/Leash-Ring-Pro upcoming), API layer (`api/` — paginates past the 100-cap, `API_BASE` from `VITE_API_URL`), `useUrlState` hook, router + `AppLayout` + page stubs.

### ✅ Phase 2 — Nav & layout
`TopNav` two-tier header (fixed wordmark + Manufacturers row; wrapping category tabs — `nav-tab` vs `nav-tab-upcoming`, active on nested routes). `navigation.cy.ts` **13/13**.

### ✅ Phase 3 — Listing + cards
Built: `useGearList`, `utils/{search,sort,format}`, `config/{gearFields,sortFields}`, `GearCard` (full anatomy + `data-{field}` + ISA stamp), `IsaApprovedBadge`, `GearGrid`, `GearTable` (chart view), `SortDropdown`, `GearListingPage` (toolbar/skeleton/empty state/grid⇄chart toggle). `FilterSidebar` is a **placeholder** (header only — real groups are Phase 4).
- `gear_cards` — ✅ **119/119**
- `isa_certification` — cards pass; **17 failures are the detail-page section** (unblocked by Phase 6)
- `gear_listing` — ✅ **168/168** (re-run 2026-07-14, 2m10s, all green). The earlier 56 chart-view
  failures were a spec bug (chart `it`s sat outside the `describe`'s `cy.visit`) → moved inside. **Phase 3 closed.**

### ✅ Phase 4 — Filters — DONE
**Result:** `filters.cy.ts` **308/308**; `gear_listing` 168/168 and `gear_cards` 119/119 confirmed no-regression.
Built: `config/filterGroups.ts`, `utils/filter.ts` (data-driven pill options + pill/range/array matching),
`FilterGroup`, `RangeSlider` (dual-thumb — replaced the min/max text boxes), `StretchFilter`, real
`FilterSidebar`, and the `GearListingPage` filter pipeline (search → filters → stretch → sort).

Decisions worth remembering:
- **Range filters are dual-thumb sliders** (`RangeSlider`), not text inputs — the text-box version raced
  Cypress typing against async URL writes. `filters.cy.ts` + DESIGN.md were updated to the slider contract
  (`range-min`/`range-max` are the two `type="range"` thumbs; `step=1` for integer-only fields, `0.5` when
  the data has fractional values).
- **Roller `material` is `list[MetalMaterial]`** — array pill fields get one pill per distinct element and
  match by membership (fixed the frontend type too).
- **Webbing stretch default is a non-filtering hint:** the most-common kN is pre-selected but does NOT
  exclude on load (protects the webbing count for gear_listing); the first pill click engages it, clicking an
  engaged pill toggles the widget off, clear-all resets it.
- **Two contradictory `filters.cy.ts` tests were fixed in place** (same class as the earlier chart-view spec
  bug): the empty-state test now skips all-null pill groups (webbing `classification` is 100% null → 0 pills),
  and the "clicking the active kN pill deselects it" test engages a pill first (the default pre-selection is a
  hint, so the first click engages rather than deselects).

<details><summary>Original Phase 4 plan (for reference)</summary>

### 🟡 Phase 4 — Filters — ACTIVE
Build the real `FilterSidebar` and wire filtering into the listing pipeline. Contract =
`filters.cy.ts` (verified against it + the models on 2026-07-14). Runs for all 8 gear types + a
dedicated webbing-stretch block. Serve both servers (:8000 seeded, :5173) and run:
`npx cypress run --spec cypress/e2e/filters.cy.ts` (~2–3 min like gear_listing; buffered — stream to a log).

**`data-cy` contract (from the spec — do not rename):**
`filter-sidebar`, `filter-sidebar-header` (contains `label.toUpperCase()`), `filter-group[data-group="<field>"]`,
`filter-group-dot`, `filter-group-toggle`, `filter-pill[data-active]`, `range-min`, `range-max`,
`clear-filters` (already exists in the empty state), plus stretch-only `stretch-kn-pill[data-active]`.
`data-group` **equals the Python field name** (`width_min`, `breaking_strength`, `isa_certified`, …).

**Step 1 — filter config (`config/filterGroups.ts`, NEW).** Mirror the spec's `FILTER_GROUPS` map
exactly: per `GearSlug`, an ordered list of `{ group, label, type: 'pill'|'range', unit? }`. Pill order
follows the spec (pills first, then ranges is how the spec concatenates, but render order in the sidebar
should match DESIGN's per-type line). **Drive rendering from this config, NOT from model field presence**
(treepro has an `isa_warning` model field but no ISA filter group; kits have `isa_certified` but no
`isa_warning`). This is the schema-first artifact for Phase 4 — the source is `slack_data/models/*.py` +
the enum-value comments already in `filters.cy.ts` and DESIGN.md §"Left Filter Sidebar".

**Step 2 — pill value derivation (data-driven, no phantom values).** For each pill group, compute the
distinct present values from the *loaded dataset* (not the enum definition) so every pill matches ≥1 item
and clicking always reduces the count (tests assert `card count <= all`). Enum pills → distinct string
values; discrete-int pills (`width`, `width_min`, `webbing_width`, `webbing_length`) → sorted distinct
numbers rendered as `String(n)`; boolean pills (`isa_certified`, `includes_treepro`, `has_sling_attachment`)
→ Yes/No; `isa_warning` → the distinct `ISAWarning` values present (incl. a "No Warning"/null bucket).

**Step 3 — filter logic (`utils/filter.ts`, NEW) + wire into `GearListingPage`.** Add a `applyFilters(items, activePills, activeRanges)` step between `filterBySearch` and `sortItems` in the page's `visible` memo.
- Pill match: item passes a group if it has **no** active pills OR `String(item[field])` ∈ selected (multi-select = OR within group, AND across groups). Booleans map value↔`'true'/'false'` or Yes/No consistently with the pill labels.
- Range match: `min`/`max` from `useUrlState().getRange(field)`; null/blank item values are **excluded** when a bound is set (matches null-last philosophy). Both bounds inclusive.
- `item-count` + card/table lists already read `visible`, so count stays correct for free.

**Step 4 — URL state.** Reuse `useUrlState` as-is — it already has `getPillValues/togglePill/setPillValues`
(`?<field>=a,b`) and `getRange/setRangeBound` (`?<field>_min`/`_max`). `clearAll()` already resets
everything and is what the empty-state `clear-filters` calls. Add a **second** `clear-filters` control in the
sidebar (spec calls `cy.get('[data-cy="clear-filters"]').first()`), also wired to `clearAll`.

**Step 5 — components.** Replace the `FilterSidebar` placeholder; add `FilterGroup` (collapsible section:
teal `filter-group-dot`, small-caps label, `filter-group-toggle`; collapse hides its controls via
`hidden`/unmount — test checks `not.be.visible`), `FilterPill`, `RangeInput` (min+max + unit label text
inside the group). Styling per DESIGN §"Left Filter Sidebar": pills inactive = white/gray, active =
teal border + teal text + `#E0F2F1` bg; `data-active` reflects state.

**Step 6 — webbing stretch widget (`StretchFilter.tsx`, the hard part).** `data-group="stretch"`. Parse
each webbing's `stretch` JSON string (`[{kn,percent}]`). Single-select `stretch-kn-pill`s populated from the
**union of all kn values** in the dataset (exact count — no phantoms); default-select the kn present in the
**most** webbing arrays. Selecting a kn: only webbings with a point at that exact kn are eligible; the
group's `range-min`/`range-max` narrow by `percent` at that kn. Clicking the active kn pill → inactive (all
show). Changing kn resets the % range. Rules: DESIGN §"Stretch at X kN filter".

**Step 7 — contextual stretch sort.** When a kn is selected, `SortDropdown` gains two `sort-option`s
matching `/stretch.*low/i` and `/stretch.*high/i` (`data-field="stretch"`). Sorting orders by `percent` at
the selected kn (null-last, not excluded). Add `data-stretch-percent` to webbing cards (via a computed field
fed into the card) so the sort test can read the ordered values. This couples the stretch filter state to
`SortDropdown` + `sortItems` — thread the active kn through the page.

**Watch-outs:** (a) `data-group` must be the raw field name, but card `data-*` attrs are hyphenated — the
range "excluded" test reads `data-${group.replace(/_/g,'-')}`, already emitted by `dataAttrs`. (b) Range
fields are all in `CARD_DATA_FIELDS` already — no card change needed except `data-stretch-percent`. (c) Rollers
`width` is a raw string ("25–35mm") → **not** a filter (excluded per spec). (d) Kits differ only in that
trickline `tensioning_type` has no "Primitive" — handled automatically by data-driven pills. (e) Keep the
existing Phase 3 specs green (re-run `gear_listing` + `gear_cards` after wiring filters into `visible`).

</details>

### ⬜ Phase 5 — Search & sort refinement
`search_sort.cy.ts`: normalized name+brand search, "Name A→Z = no `sort` param" default nuance, sort persistence + reset-on-type-switch, contextual stretch sort, search+filter combination. Sort tables: **DESIGN.md → "Sort options".**

### ⬜ Phase 6 — Detail page
Replace `GearDetailPage` stub: back link, brand/name/price, spec table (`spec-row[data-field]` + units, omit null rows), description, "View product →", ISA certification block + ISA warning banner, not-found. Special cases: weblock width range, webbing classification pill, treepro `price_unit`. Unblocks the 17 `isa_certification` detail failures. Per-type spec rows: **DESIGN.md → "Spec rows per gear type".**

### ⬜ Phase 7 — Compare
Sticky compare bar (chips, count, max 4, same-type, CTA disabled < 2, clears on gear-type switch) + side-by-side `ComparePage` (columns per item, spec rows, back link, deep-linkable `?ids=`).

### ⬜ Phase 8 — Manufacturers
Replace `ManufacturersPage` stub: brand cards, View Gear, per-type gear counts (`data-count-*`), search, graceful country/continent filter, list toggle. `BrandPublic` only serializes `webbings` reliably — read the model. Layout: **DESIGN.md → "Manufacturers Page".**

### ⬜ Phase 9 — URL-state sweep
`url_state.cy.ts`: q / sort / pill / range / combined round-trips, clear-all, 404.

### ⬜ Phase 10 — Full green + cleanup
Whole suite green; simplify/dedupe.
