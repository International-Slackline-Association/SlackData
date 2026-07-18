# Phase 5 (Search & Sort) — Handoff / Context

> **TEMPORARY FILE.** Written for the next agent picking up this work. Safe to delete before
> merge — nothing references it. Supersedes `PHASE4_HANDOFF.md` (Phase 4 + 4.5), whose still-
> relevant traps are carried forward below.

## TL;DR

**Phase 5 (search & sort refinement) is done and green.** The whole frontend suite that has been
built so far passes:

| Spec | Result |
|------|--------|
| `search_sort.cy.ts` | **306/306** (was 252/305, 53 failing) |
| `filters.cy.ts` | 328/328 |
| `gear_listing.cy.ts` | 168/168 |
| `gear_cards.cy.ts` | 111/111 |
| `navigation.cy.ts` | 13/13 |

`npm run build` (tsc + vite) and `npm run lint` (oxlint) are clean.

Still red / not started: `gear_detail.cy.ts`, the **detail half** of `isa_certification.cy.ts`
(17 failures — blocked on Phase 6), `compare.cy.ts`, `manufacturers.cy.ts`, `url_state.cy.ts`.

Branch: **`feat/frontend-phase-4-filters`**. NB: Phase 4 + 4.5 are committed here but **never
reached `origin/main`** — PR #29 merged into `feat/frontend-gear-images`, not main. So this branch
carries Phases 4, 4.5 and 5.

## How to run / verify

Two servers must be up. A dead backend looks like a mass "regression" — it's actually
`ECONNREFUSED 127.0.0.1:8000`.

```bash
# backend :8000 (seeded SQLite; cd first, the db is created in CWD)
cd slack_data && source ../.venv/bin/activate && fastapi dev main.py
# frontend :5173
cd frontend && npm run dev

# Cypress (this WSL box):
cd frontend
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
export LD_LIBRARY_PATH="$HOME/.local/lib/cypress-deps:$LD_LIBRARY_PATH"
unset ELECTRON_RUN_AS_NODE
npx cypress run --spec cypress/e2e/search_sort.cy.ts   # ~5 min, buffers output — tee to a log
npm run build && npm run lint
```

**Startup gotcha hit this session:** the backend crashed on boot with
`LookupError: 'NOT_FOR_HIGHLINE' is not among the defined enum values` — the seeded `database.db`
held a `classification` value the current `webbing.py` enum no longer defines. Seeding is one-shot
per table, so the fix is `rm slack_data/database.db` and restart to re-seed. Expect this any time
a model enum changes.

## The one idea behind almost every Phase 5 fix

`useUrlState` keeps search/sort/filters in the query string, and reads them back via
`useSearchParams`. **That read lags the write by a render.** Every remaining Phase 5 failure was
some flavour of code trusting that lagging value. This is the same class of bug as the Phase 4
`RangeInput → RangeSlider` rewrite, and it will keep biting — assume it in Phases 6–9.

Three concrete instances fixed:

1. **Search box was `value={q}`** (`GearListingPage`). React re-rendered the controlled input with
   the stale URL value between Cypress keystrokes, so characters were dropped: typing `"Core"`
   ended up filtering as `"e"` (172 of 200 cards survived). **Fix:** the box holds local state that
   drives filtering; the URL is still written for bookmarking. It resyncs from the URL only on
   clear-all (`resetNonce`) and on gear-type (`slug`) change — **never** on every param echo, which
   would fight in-progress typing.
2. **Stretch-kN retarget read `sort` back from the URL** (`SortDropdown`). Right after applying a
   stretch sort, `sort` is still `null` for a render, so the kN-picker's `if (activeKn != null)`
   guard was false and the retarget was silently dropped — deterministically, once extra renders
   shifted the timing. **Fix:** a local `stretchActive` flag set synchronously by `pickStretch`
   (kept in sync with external/deep-linked sort by an effect); the retarget keys off that.
3. **Tab persist-vs-reset used a render-time `active` flag** (`TopNav`). It raced React Router's
   navigation re-render, so "sort resets when switching gear type" flaked on whichever tab
   re-rendered a beat late (a different gear type each run). **Fix:** `goToTab` reads
   `window.location` **at click time** — the browser URL is always current, so the decision cannot
   race. Re-clicking the current tab preserves its query string; a different tab navigates bare.

Also in Phase 5: `data-value` (raw enum value) on `filter-pill`s, and `normalize()` in
`utils/search.ts` now NFD-folds diacritics (é → e) as well as stripping `[.\-()/ ]`.

## Spec bugs fixed in place (Phase 4 precedent)

Same principle as Phase 4's two contradictory tests: when the spec contradicts the locked-in
contract or can never pass as written, fix it faithfully to its intent and say so.

- **`contain.text` was passed a RegExp.** Chai coerces it to the literal string `"/z.*a/i"`, which
  never matches — so "sort persists" always failed and "sort resets" always passed *trivially*
  (`not.contain.text` of a string that's never present). Both became plain `'Z→A'`. Note the reset
  test only became a real test after this fix, which is how the `TopNav` race surfaced at all.
- **`.then()` DOM reads after a sort click → retrying `.should()`.** `.then` snapshots the DOM once
  and can read the pre-re-sort order; `.should(($els) => {…})` retries until it settles. This is
  Trap #5 below and was the single biggest bucket of failures.
- **Name-substring assertion → name OR brand.** The contract is "search matches name OR brand,
  normalized", so asserting every visible card's *raw name* contains the term is wrong: brand
  matches and punctuation folding both legitimately produce cards whose raw name doesn't contain it
  (e.g. term `"10 m"` matching `"…Slack 10m"`).
- **One search+filter count read → `item-count`.** It counted `gear-card` elements, but the
  arbitrary `.first()` material pill can exclude every match (webbing pills sort alphabetically, so
  first = Dyneema, and the "Gibbon" search has no Dyneema) → 0 cards → empty state → the `cy.get`
  times out. `item-count` is always present and reads "0 items" fine.

## Traps the next agent WILL hit

Carried over from Phase 4 and still true, plus new ones:

1. **Stale Vite dev server.** HMR can serve a deleted module. If tests fail broadly but
   `npm run build` passes, restart the dev server. (Worth ruling out early — but note that this
   session's "stale HMR" suspicion turned out to be a *real* bug, so don't stop at the restart.)
2. **Backend dies mid-session** → `ECONNREFUSED`, not a code regression. Also see the re-seed
   gotcha above.
3. **Anything reading state back from the URL lags a render.** See the section above. Prefer local
   state for anything driven by fast input, and read `window.location` when you need the truth *now*.
4. **StrictMode double-mount.** Mount-reset effects are gated on a **changed `resetNonce`**
   (comparing the previous value), not a did-mount boolean — that survives the double invoke. Don't
   "simplify" it back. The Phase 5 search-box reset uses the same pattern.
5. **`.then` vs `.should` for post-interaction DOM reads.** Use a retrying `.should(($el) => {…})`.
6. **Cypress buffers spec output**; a 5-min run shows nothing until it finishes. Stream to a log.
7. **For quick iteration write a throwaway `cypress/e2e/_probe.cy.ts`, then delete it.** This was
   how the search race and the stretch-retarget bug were isolated — far faster than 5-min full runs.
   Watch out: URL assertions must account for encoding (`stretch@5` appears as `stretch%405`), which
   cost a false alarm.
8. **Known pre-existing flake:** `filters.cy.ts` "clicking an active pill deactivates it" fails
   roughly 1 run in N on a rapid double-click racing the pill's async URL write; it passes on
   re-run. Not caused by Phase 5 — it's instance #4 of trap 3 and could be hardened the same way.
9. **Webbing names are NOT unique** ("Blue", "Tube Line"). Map cards by the id in the detail-link
   href, never by name.

## Suggested next step — Phase 6 (Detail page)

`gear_detail.cy.ts` (37 `it` blocks, several looping all 8 gear types) + the detail half of
`isa_certification.cy.ts` (unblocks those 17 failures). Replace the 20-line `GearDetailPage` stub:
back link, brand/name/price, spec table (`spec-row[data-field]` + units, omit null rows),
description, "View product →", ISA block + warning banner, not-found. Per-type spec rows are in
**DESIGN.md → "Spec rows per gear type"** — but per the schema-first rule, verify field names,
units and nullability against `slack_data/models/*.py` first, not against DESIGN.md.

Special cases called out by the spec: weblock width *range*, webbing classification pill, treepro
`price_unit`.

Do Phase 6 before Phase 7 (Compare): the compare view reuses the detail spec-row rendering, so
building it first avoids doing that twice. Phase 7's `?ids=` deep-linking and its "compare clears on
gear-type switch" rule both land squarely on trap 3 and on `TopNav.goToTab`.
