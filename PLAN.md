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
| 5 | Search & sort refinement | `search_sort.cy.ts` | ✅ 306/306 |
| 6 | Detail page | `gear_detail.cy.ts` + `isa_certification`(detail) | ✅ 201/201 + isa 69/69 |
| 7 | Compare | `compare.cy.ts` | ✅ 20/20 |
| 8 | Manufacturers | `manufacturers.cy.ts` | ✅ 18/18 |
| 9 | URL-state sweep | `url_state.cy.ts` | ✅ 18/18 |
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

### ✅ Phase 5 — Search & sort refinement — DONE
**Result:** `search_sort.cy.ts` **306/306**; `filters` 328/328, `gear_cards` 111/111,
`gear_listing` 168/168, `navigation` 13/13 all confirmed no-regression.

Most of the *dropdown/sort* surface was already built in Phase 4.5 (default+tie-break name sort,
decoupled stretch sort). Phase 5 closed the remaining search/sort-refinement gaps — all of them were
the same root cause showing up in different places: **controlled inputs / reads racing the async
`useSearchParams` URL echo** (the same class as the Phase-4 `RangeInput → RangeSlider` fix).

Fixes worth remembering:
- **Search box is local state, not `value={q}`** (`GearListingPage`). Binding the input straight to
  the lagging URL param dropped characters while Cypress typed fast (`"Core"` → filtered as `"e"` →
  172/200 cards). The box now holds local state that drives filtering and pushes to the URL for
  bookmarking; it resyncs from the URL on `resetNonce` (clear-all) and on gear-type (`slug`) change,
  never mid-typing.
- **Stretch-sort kN retarget uses a synchronous local flag, not the URL read** (`SortDropdown`).
  Right after applying a stretch sort, `sort` (from `useSearchParams`) still reads null for a render,
  so the kN-secondary-dropdown's `if (activeKn != null)` guard silently dropped the retarget. Added a
  local `stretchActive` state set synchronously by `pickStretch` (kept in sync with external/deep-link
  sort via an effect); the retarget keys off that.
- **Sort persist / reset-on-type-switch is decided from `window.location` at click time**
  (`TopNav.goToTab`), not a render-time `active` flag. The render-time flag raced React Router's
  navigation re-render and flaked "resets on switch" on whichever tab re-rendered a beat late.
  Re-clicking the *current* tab preserves its query (sort/search/filters persist); a *different* tab
  navigates bare (resets).
- **`data-value` on filter pills** (`FilterSidebar.Pill`) — raw enum value, additive; the
  search+filter combination tests select pills by it.
- **Accent-insensitive search** — `utils/search.ts` `normalize()` now NFD-folds diacritics in addition
  to stripping `[.\-()/ ]` (é → e).
- **Spec fixes in place** (same precedent as Phase 4): `contain.text` was passed a RegExp (coerced to
  the literal `/z.*a/i`, never matched) → plain `'Z→A'`; flaky `.then()` DOM reads after a sort click
  → retrying `.should()`; the name-substring assertion now allows a name **or brand** match
  (the locked-in contract); one search+filter count read moved to `item-count` (tolerates 0 cards).

Known pre-existing flake (NOT Phase 5): `filters.cy.ts` "clicking an active pill deactivates it" can
flake ~1/run on a rapid double-click racing the pill's async URL write; passes on re-run.

### ✅ Phase 6 — Detail page — DONE
**Result:** `gear_detail.cy.ts` **201/201** (first run, no spec edits needed) and
`isa_certification.cy.ts` **69/69** — the 17 detail-section failures carried since Phase 3 are gone.

Built: `config/specRows.ts` (per-slug row defs: `{ field, label, unit?, render?, value(item) }`),
`components/gear/SpecTable.tsx`, and the real `GearDetailPage` (back link → image band →
brand/name/price → ISA warning banner → ISA certification block → spec table → description →
"View product →"; 404 from the API renders `NotFoundPage`).

Decisions worth remembering:
- **A row renders iff `value(item)` returns a non-empty string.** Required model fields therefore
  always render and nullable ones drop out on their own — no `alwaysPresent` flag in app code.
- **Booleans always render as Yes/No**, overriding DESIGN.md's "omit the row when false"
  (`has_sling_attachment`, `includes_treepro`). Booleans are non-null in every model, so the spec's
  "shows the row when the field is non-null" test picks an item that may well be `false` and asserts
  the row exists; omitting it would fail. The "omits when null" twin finds no item and self-skips.
- **`width_range` is synthetic** (`data-field="width_range"`, weblocks + grips): folds
  `width_min` + `width_max` into `"25–35 mm"`, or `"25 mm"` when max is null. It has no model field.
- **Stretch drops the 0 kN point** (every curve reads 0% there) but falls back to the full point list
  if that's all a webbing has — otherwise the row would vanish for a non-null `stretch`, which the
  spec forbids. Rendered as a text summary (`"3.4% at 5 kN · 5.9% at 10 kN"`); DESIGN.md's inline
  curve chart is a later refinement.
- **DESIGN.md's webbing `material_composition` row does not exist** — the model has
  `material: list[FiberMaterial]`, so `formatValue`'s array join (`"Polyester + Dyneema/HMPE"`)
  already covers it. Schema-first: the model won.
- Extra rows beyond the spec's `specFields` are harmless and were added where the model has data
  (webbing `webbing_construction` / `thickness`).

### ✅ Card image carousel (post-Phase-6 addition)
Cards now browse **every** image in the manifest for a product, not just the primary one.
`gear_cards.cy.ts` **191/191** (was 111 — 80 new carousel assertions, written red-first: 64 failing
before the implementation).

- **New contract:** `gear-card-image-area` carries `data-image-count`; `card-image-dot` (one per
  image, `data-active`), `card-image-prev` / `card-image-next` wrap in both directions. A
  single-image product renders the bare `<img>` — dots and arrows must **not exist**.
- **`cypress/support/images.ts`** gives specs the manifest-backed expected image set, so assertions
  are anchored to the real image library rather than to the DOM's own claim. It duplicates the
  two-line `imageKey()` format because `src/utils/images.ts` reads `import.meta.env` at module
  scope, which the Cypress preprocessor can't evaluate.
- **Cards are found by detail `href`, not by name** (`:has([data-cy="gear-card-name"][href="/slug/id"])`)
  — a `contains(name)` lookup silently picks the wrong product whenever one name is a substring of
  another.
- **Arrows are always visible, not hover-revealed.** Cypress treats `opacity: 0` as invisible, so a
  hover-reveal carousel would need `.click({ force: true })` — a test weaker than the feature.
- Dot count always equals the manifest count even when a file 404s: a broken image swaps its own
  slot for the placeholder instead of dropping out, so the carousel length can't contradict
  `data-image-count`.

No-regression check: `gear_cards` 111/111 and `navigation` 13/13. (One combined run showed 14
`gear_cards` failures that did not reproduce on two subsequent runs — solo 111/111, combined
124/124. Treated as a one-off, not a Phase 6 regression: nothing in this phase touches card code.)

### 🟡 Phase 6.5 — Detailed view (replaces Chart view) — CODE COMPLETE, UNVERIFIED
The listing's second view mode is now **Cards | Detailed** instead of Cards | Chart. The table view
was dropped outright: one shared column set across 8 gear types meant the columns it kept were the
generic ones and the specs that actually distinguish products were the ones it dropped.

Built:
- `GearDetailBody` — the detail-page card body, extracted so `GearDetailPage` and the new
  `GearDetailedList` render **the same component**. Two props carry the only differences:
  `nameHref` (listing panels link the product name; the detail page renders a plain `<h1>`) and
  `showActions` (Save/Alert/Compare, listing panels only).
- `GearDetailedList` — one full-width panel per item, stacked, page scrolls. All panels fully
  expanded, no collapsing.
- `CardImageCarousel` gained an `imgDataCy` prop; **the detail page now has the carousel too**
  (was a single static image), which is the intended consequence of sharing one component.
- Deleted `GearTable.tsx`.

Decisions worth remembering:
- **The detailed list is mounted only while its view is active**, unlike the grid (which stays
  mounted behind `display:none`). Panels reuse the detail page's `data-cy` hooks — `detail-name`,
  `spec-row`, `card-image-dot` — so leaving them hidden in the DOM would double the unscoped counts
  `gear_cards.cy.ts` reads off the grid. Assertions on panel internals must be scoped **within** a
  `gear-detailed-row`.
- View mode stays **local state** — resets to Cards on navigation, not in the URL. `url_state.cy.ts`
  is untouched.

Specs updated (**not yet run — see below**): `gear_listing.cy.ts` chart section rewritten as the
Detailed section (10 `it`s incl. order parity with the grid and a DOM-absence guard);
`gear_detail.cy.ts` gained a 4-test image-carousel block.

⚠️ **Verification blocked:** the Cypress binary in this environment will not start —
`~/.cache/Cypress/15.18.0` errors with `bad option: --no-sandbox` and the 15.18.1 binary exits
silently. Likely a corrupt/partial binary download; `npx cypress install --force` is the probable
fix but re-downloads ~200MB, so it wasn't run unprompted. What **was** verified: `tsc -b` and a full
`vite build` pass clean. **The suite must be run before this phase is closed.**

### ✅ Phase 7 — Compare — DONE
**Result:** `compare.cy.ts` **20/20**. `gear_listing` 192/192 confirmed no-regression; `gear_cards`
198/1-fail/3-skip — the one failure (`Card classification bubble — Webbings` before-all) reproduces
**identically on the clean pre-Phase-7 tree**, so it's a pre-existing spec-infra bug, not a
regression: that describe's `cy.request` hits `http://localhost:8000//webbing/` (double slash from a
leading-slash `apiPath`) → 404. `npm run build` + `npm run lint` clean.

Built:
- **`components/gear/CompareBar.tsx`** — sticky bottom bar; renders only at ≥1 selection.
  `compare-bar-count`, a `compare-bar-item` chip (with `compare-bar-item-name` + `compare-bar-remove`
  ×) per item, `compare-bar-clear`, and `compare-bar-view-btn` **disabled below 2 items**.
- **`GearCard`** — the `btn-compare` stub is now live: `data-active`, `disabled` (when the 4-cap is
  full and this card isn't selected), toggles selection. Teal fill when active.
- **`GearGrid`** — threads `selectedIds` / `compareFull` / `onToggleCompare` to cards.
- **`GearListingPage`** — owns the selection: an ordered `selectedIds` list, capped at 4, **cleared
  on slug change** (the gear-type-switch signal, since the component stays mounted across `:slug`).
  The CTA navigates to `/${slug}/compare?ids=…`.
- **`ComparePage`** — the real side-by-side table. Reads `?ids=` (URL is the only source of truth →
  deep-linkable), fetches the type via `useGearList`, picks ids in URL order. `compare-col[data-id]`
  per item, `compare-row[data-field]` per SPEC_ROWS entry with a `compare-field-label`, and a
  `compare-back-link` → `/${slug}`.

Decisions worth remembering:
- **Selection state is local to the listing page, NOT in the URL.** It only has to survive within one
  listing page and hand off to the compare page. The handoff is the `?ids=` query param, which is
  also exactly what makes `ComparePage` deep-linkable on its own — no shared context/store needed,
  and no lag-a-render URL-read trap (handoff trap #1) because nothing reads selection back from the
  URL on the listing side.
- **Clears on gear-type switch via a `prevSlug` ref effect**, mirroring the existing search-box
  resync — a slug change is the switch signal.
- **The compare table renders every SPEC_ROWS row** (blank cells show "—") rather than dropping
  all-empty rows — a comparison reads more honestly with the full field set aligned.
- Rows **reuse `SPEC_ROWS`** from Phase 6 (that's why Phase 6 came first); labels/formatting can't
  drift from the detail page.
- The Detailed-view `btn-compare` in `GearDetailBody` is still a dead stub — that view isn't in
  `compare.cy.ts`'s scope and isn't mounted by default. Left as-is to keep Phase 7 tight.

### ✅ Phase 8 — Manufacturers — DONE
**Result:** `manufacturers.cy.ts` **36/36**. (It was 18/18 on the first run with no spec edits —
the second phase to manage that, after Phase 6 — and grew to 36 across the follow-up work below.)
`navigation` 13/13, `compare` 20/20, `gear_listing` 192/192 confirmed no-regression; pytest 155;
build + lint clean.

Built:
- **`hooks/useBrandDirectory.ts`** — fetches all brands **plus all 8 gear lists**, and derives
  brand→per-type counts by grouping each gear endpoint on `brand_name`. Shared by both new pages.
- **`components/brand/ManufacturerCard.tsx`** — the gear card's twin: logo image area with the
  Inactive pill top-left and the country flag top-right, then name, slackline badge, `Est. YYYY`,
  gear-inventory pills, View Gear. Root carries `data-count-{slug}` for all eight types (zeroes
  included) plus `data-active`.
- **`pages/ManufacturersPage.tsx`** — search + data-driven country filter + card grid, with a
  **Sort by** control (gear count default, name, country, year established). Grid-only; the
  Cards/List toggle was removed.
- **`pages/BrandDetailPage.tsx`** (`/manufacturers/:id`, new route) — the View Gear destination: one
  `GearGrid` section per gear type the brand stocks.

**Follow-up landed after the phase closed** (commits `62570d5`, `f059888`): country is now stored
(see below), manufacturer logos + country flags are vendored, the reviewed active/inactive status
is applied, and the view toggle became the sort control.

Decisions worth remembering:
- **Gear counts MUST be computed client-side.** `BrandPublic` declares only `webbings: list[str]`
  among the gear lists — the other seven `@computed_field`s exist on the ORM model but are *not* in
  the response schema, so the API genuinely cannot answer "how many weblocks does this brand have".
  Hence the 8-endpoint fetch. This is the same conclusion `types/brand.ts` had already written down
  in Phase 1; schema-first paid off again.
- **The country filter is data-driven — and now POPULATED.** It was absent at first because every
  brand had `country: null` (`get_brand()` only sets a name); the `load_manufacturers.py` enrichment
  pass has since backfilled all 56, so the group renders ~20 real pills and both country tests now
  exercise the populated branch. The filter must stay data-driven either way: never hardcode a
  country list, and note there is **no `continent` field anywhere in the schema** (the spec's own
  comment records that an earlier version of the test invented one).
- **The directory is grid-only.** The Cards/List toggle was removed and its toolbar slot now holds
  the sort control (gear count default, name, country, year established; name tie-breaks, missing
  values last). The two `view-list` tests were retired and replaced with sort tests — a spec now
  asserts the toggle does **not** exist.
- **`slackline_focused` is corrected from the source** (`scripts/apply_slackline_focus.py`): SlackDB
  flags nearly everyone slackline-oriented, so imported as-is the badge rendered on all 56 cards and
  meant nothing. General climbing / rope-access / rigging brands that only make a part slackliners
  use (Petzl, CAMP, Mammut, Edelrid, Kong, Singing Rock, …) are now `false` — 48 of 56 carry the
  badge, 8 don't. The badge now discriminates and is covered by two spec tests.
- **Manufacturer search uses plain lowercase substring matching, not `utils/search.normalize()`.**
  The spec asserts every visible card's *raw* name contains the *raw* typed term, so the gear
  listing's punctuation/accent-folding matcher would surface cards that fail that assertion.
- **Brand→gear membership is decided on `brand_name`**, the gear item's computed field, which
  resolves through the Brand relationship and so always equals the Brand row's `name`.
- Route ranking puts `/manufacturers/:id` above `:slug/:id`, so brand detail wins over gear detail.

### ✅ Phase 9 — URL-state sweep — DONE
`url_state.cy.ts` **18/18** — q / sort / pill / range / combined round-trips, clear-all, 404.
`search_sort.cy.ts` re-run **306/306** (no regression from the sort-default fix below).

The infrastructure (`useUrlState`, routes, `NotFoundPage`) already existed from Phases 1–8, so
this was mostly a verification sweep. One real app fix + three stale-spec fixes:

- **App fix — Name A→Z carries no `?sort=`.** The contract (top of `useUrlState`, DESIGN "Name is
  the default sort") is that Name A→Z is the default and produces no param. The dropdown was writing
  `sort=name-asc`. Fixed in `SortDropdown` — the Name A→Z option now `pick(null)` (clears sort to the
  default state); Name Z→A still writes `sort=name-desc`. Default sort was already null→name-asc, so
  card order is unchanged and `search_sort.cy.ts` stays green.
- **Spec — `contain.text` with a RegExp never matches** (a RegExp is coerced to its literal source).
  Two sort assertions used `/weight.*low/i`; switched to the plain string `'Weight: Low→High'`,
  matching the convention already documented at `search_sort.cy.ts:347`.
- **Spec — range bounds are dual-thumb sliders, not text boxes** (the Phase-4 change). Three tests
  typed into the `range-min`/`range-max` thumbs, which have `pointer-events:none`. Rewrote them to the
  established click-to-edit `range-{min,max}-value` label pattern from `filters.cy.ts`, reading domain
  edges off the thumb `min` attr rather than hardcoding, and added a `have.value` guard so the URL
  assertion can't race the async param write.
- **Spec — multi-select comma is `%2C` in the raw URL.** `URLSearchParams` percent-encodes the
  separator; the round-trip still decodes to a comma. Assertion now reads the decoded `material` value
  and checks for the `a,b` shape instead of grepping the raw URL for a literal comma.

### ✅ Sticky filter sidebar (post-Phase-9 UX)
The left filter sidebar now pins below the top nav as results scroll and self-scrolls when its groups
exceed the viewport, so no filter (notably the webbing stretch widget) scrolls out of reach.
Purely presentational — two files, no schema/data/API:
- `TopNav.tsx` publishes the measured header height as a `--header-h` CSS var (a `ResizeObserver` on
  `<header>`), so the offset survives tier-2 category tabs wrapping to more rows on narrow widths.
- `FilterSidebar.tsx` `<aside>` gains `self-start sticky top-[calc(var(--header-h)+1rem)]
  max-h-[calc(100vh-var(--header-h)-6rem)] overflow-y-auto` — the `6rem` bottom reserve keeps the
  self-scroll region clear of the `fixed` CompareBar.

Tests: 4 behavioral assertions added to `gear_listing.cy.ts` (pins after scroll, filters usable while
scrolled, tall-sidebar reachability via `stretch-kn-pill`, no CompareBar collision) — all green.
⚠️ Same run surfaced a **pre-existing, unrelated** failure cluster: 32 count-comparison tests (4 per
gear type) now fail because the frontend renders fewer cards than the (expanded) backend serves —
independent of this CSS change; needs separate investigation.

### ⬜ Phase 10 — Full green + cleanup
Whole suite green; simplify/dedupe.
