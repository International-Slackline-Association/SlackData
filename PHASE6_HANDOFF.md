# Phase 6 (Detail Page) — Handoff / Context

> **TEMPORARY FILE.** Written for the next agent picking up this work. Safe to delete before
> merge — nothing references it. Supersedes `PHASE5_HANDOFF.md` (Phase 5), whose still-relevant
> traps are carried forward below. Delete `PHASE5_HANDOFF.md` when you delete this.

## TL;DR

**Phase 6 (detail page) is done and green**, plus an unplanned **card image carousel** the user
asked for on top of it.

| Spec | Result |
|------|--------|
| `gear_detail.cy.ts` | **232/232** |
| `isa_certification.cy.ts` | **69/69** (the 17 detail-half failures carried since Phase 3 are gone) |
| `gear_cards.cy.ts` | **191/191** (was 111 — 80 new carousel assertions) |
| `gear_listing.cy.ts` | 168/168 |
| `filters` / `search_sort` / `navigation` | see "Verification status" below |

`npm run build` (tsc + vite) and `npm run lint` (oxlint) are clean.

Still red / not started: `compare.cy.ts` (Phase 7), `manufacturers.cy.ts` (Phase 8),
`url_state.cy.ts` (Phase 9).

Branch: **`feat/frontend-phase-4-filters`**, still carrying Phases 4, 4.5, 5 and now 6 — none of
which have reached `origin/main`.

## What Phase 6 built

- **`config/specRows.ts`** — per-slug spec-row definitions: `{ field, label, unit?, render?, value(item) }`.
- **`components/gear/SpecTable.tsx`** — the SPECIFICATIONS block (two-column grid; the stretch
  curve is a full-width load/stretch table).
- **`pages/GearDetailPage.tsx`** — image left / identity+specs right; back link, brand, name,
  classification bubble, price, ISA warning banner, ISA certification block, spec table,
  description, "View product →". An API 404 renders `NotFoundPage`.
- **`components/gear/CardImageCarousel.tsx`** — cards browse *every* manifest image, not just the
  primary one.

### Design rules that are now load-bearing

1. **A spec row renders iff `value(item)` returns a non-empty string.** Required model fields
   therefore always render and nullable ones drop out on their own — there is no `alwaysPresent`
   flag in app code (only in the Cypress fixture, which drives *how the spec asserts*).
2. **Booleans always render as Yes/No**, overriding DESIGN.md's "omit the row when false"
   (`has_sling_attachment`, `includes_treepro`). Booleans are non-null in every model, so the
   spec's "shows the row when non-null" test picks an item that may well be `false`; omitting the
   row fails it. The "omits when null" twin finds no item and self-skips.
3. **`width_range` is synthetic** (weblocks + grips): folds `width_min` + `width_max` into
   `"25–35 mm"`, or `"25 mm"` when max is null. No model field backs it.
4. **Classification is NOT a spec row.** It renders as a `ClassificationBubble` beside the product
   name on the detail page and in the card's top-right stack. DESIGN.md's spec-row table is stale
   on this point; `specRows.ts` carries a comment so it isn't "restored" by mistake.
5. **DESIGN.md's webbing `material_composition` row does not exist.** The model has
   `material: list[FiberMaterial]`, and `formatValue`'s array join already renders
   `"Polyester + Dyneema/HMPE"`. Schema-first: the model won.
6. **Carousel dot count always equals the manifest count**, even when a file 404s — a broken image
   swaps its own slot for the placeholder instead of dropping out, so the carousel length can never
   contradict `data-image-count` on the image area.
7. **Carousel arrows are always visible, not hover-revealed.** Cypress treats `opacity: 0` as
   invisible, so a hover-reveal carousel forces `.click({ force: true })` — a test weaker than the
   feature it covers. Design followed testability here deliberately.

### New `data-cy` contract (do not rename)

Detail: `detail-back-link`, `detail-brand`, `detail-name`, `detail-price`, `detail-description`,
`detail-img`, `view-product-btn`, `spec-table`, `spec-row[data-field]`, `classification-pill`
(carries `data-classification`), `color-chip`, `stretch-table` / `stretch-kn` /
`stretch-percent[data-kn]`, `isa-certification-block`, `isa-not-certified-text`,
`isa-warning-banner`, `not-found`.

Cards: `gear-card-image-area` gains `data-image-count`; `card-image-dot` (one per image, with
`data-active`), `card-image-prev`, `card-image-next`.

## Testing notes

- **`cypress/support/images.ts`** gives specs the manifest-backed expected image set, so carousel
  assertions are anchored to the real image library rather than to the DOM's own claim about
  itself. It duplicates the two-line `imageKey()` format on purpose: `src/utils/images.ts` reads
  `import.meta.env` at module scope, which the Cypress preprocessor cannot evaluate.
- **Find cards by detail `href`, never by name** —
  `[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/slug/id"])`. Webbing names are not
  unique ("Blue", "Tube Line"), so `contains(name)` silently grabs the wrong product and the
  assertion is then quietly wrong rather than failing. (This was trap #9 in the Phase 5 handoff;
  it bit again here.)
- **Phase 6 needed no spec edits** — a first for this build. `gear_detail.cy.ts` went 201/201 on
  the first run against a straight schema-first reading of the models.

## Traps the next agent WILL hit

Carried forward from Phases 4–5 and still true, plus new ones:

1. **Anything reading state back from the URL lags a render.** `useUrlState` writes to the query
   string and reads back via `useSearchParams`; that read is one render behind. Nearly every Phase
   4/5 bug was some flavour of trusting the lagging value. Prefer local state for anything driven
   by fast input; read `window.location` when you need the truth *now*. **Phase 7's `?ids=`
   deep-linking and "compare clears on gear-type switch" land squarely on this.**
2. **Backend dies mid-session** → `ECONNREFUSED 127.0.0.1:8000` looks like a mass regression but
   isn't. Re-seed gotcha: seeding is one-shot per table, so after a model-enum or JSON change you
   must `rm slack_data/database.db` and restart. A stale db surfaces as e.g.
   `LookupError: 'NOT_FOR_HIGHLINE' is not among the defined enum values` on boot.
3. **Stale Vite dev server.** HMR can serve a deleted module. If tests fail broadly but
   `npm run build` passes, restart the dev server — but don't stop there, Phase 5's "stale HMR"
   suspicion turned out to be a real bug.
4. **StrictMode double-mount.** Mount-reset effects are gated on a *changed* `resetNonce`, not a
   did-mount boolean. Don't "simplify" it back.
5. **`.then` vs `.should` for post-interaction DOM reads.** `.then` snapshots the DOM once and can
   read pre-update state; use a retrying `.should(($el) => {…})`.
6. **Cypress buffers spec output** — a 5-min run shows nothing until it finishes. Stream to a log.
7. **For quick iteration write a throwaway `cypress/e2e/_probe.cy.ts`, then delete it.** Far faster
   than full runs. URL assertions must account for encoding (`stretch@5` → `stretch%405`).
8. **NEW — don't trust a Cypress run taken while files are being edited.** This session reported a
   `gear_detail` failure (classification spec row) that was already fixed in the spec; the run had
   raced an in-flight edit and executed the older file. Re-run before acting on any failure.
9. **Known pre-existing flake:** `filters.cy.ts` "clicking an active pill deactivates it" fails
   roughly 1 run in N on a rapid double-click racing the pill's async URL write; passes on re-run.
   Instance #4 of trap 1.

## Verification status — read this before trusting the table above

`gear_detail`, `isa_certification`, `gear_cards` and `gear_listing` were run against the tree as it
stands. `filters`, `search_sort` and `navigation` were **last** confirmed green in Phase 5 and were
re-run at the end of this session — check that run's result before claiming the suite is green,
because the concurrent work in this tree touched `filters.cy.ts` (+176 lines), `filterGroups.ts`,
`utils/filter.ts`, `StretchFilter.tsx`, `useUrlState.ts` and `GearListingPage.tsx`.

## Commit layout

Two commits sit on top of Phase 5 (`be3da7a`):

1. **`58a14d9` `feat(images): curate gear image library…`** — landed out-of-band from a
   `chore/gear-image-library` branch. It carries the **entire backend data-audit stream**:
   `models/{webbing,grips,weblocks}.py`, four loaders, `utilities/materials.py`, the root `*.json`
   seed files, `isa_gear_warnings.json`, the `tests/` python suite (which now exists — CLAUDE.md
   still says "no test suite"), plus the gear images, `frontend/src/data/gearImages.json`, and
   `scripts/build_gear_manifest.py` (which replaced the old `build_gear_images.py`).
2. **The Phase 6 commit** (this handoff) — frontend detail page + card carousel + the entangled
   refinement (classification bubble, detail two-column layout, `GearDetailBody`,
   `GearDetailedList` replacing the deleted `GearTable`, stretch-table rendering, filter/listing
   tweaks) + the design/plan docs. Frontend-only; the backend/image concern is already isolated in
   (1).

`frontend/cypress/screenshots/` and `cypress/videos/` are now gitignored (test output, never
committed). Neither commit has reached `origin/main`.

## Suggested next step — Phase 7 (Compare)

`compare.cy.ts`, 20 tests, all red. Two halves:

- **Sticky compare bar** (13 tests) on the listing page. `btn-compare` on the card is currently a
  dead stub; it needs to toggle selection and carry `data-active`. Bar exists only when ≥1 item is
  selected: `compare-bar-count`, a removable `compare-bar-item` chip per item, `compare-bar-clear`,
  and `compare-bar-view-btn` **disabled at 1 item**. Cap **4** — the 5th card's button goes
  `disabled`. Switching gear type clears the selection.
- **Side-by-side view** (7 tests). `ComparePage` is still a stub. One `compare-col` per item (with
  `data-id`), `compare-row` per field with a `compare-field-label`, `compare-back-link`, and
  **deep-linkability** — revisiting the URL restores the comparison, so selection must round-trip
  through `?ids=`.

The route `:slug/compare` already exists and outranks `:slug/:id`, so routing is done. **Reuse
`SPEC_ROWS`** from Phase 6 for the row content — that's why Phase 6 came first. The genuinely new
thing is *shared selection state across two pages*; everything so far has been per-page URL-derived
state, so decide early whether the bar's state lives in the URL, in context, or in both (the
deep-link test forces at least a URL representation on the compare page itself).
