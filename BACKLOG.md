# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## Blocking the first ship

- [x] **Backend test coverage for `active`.** Done — [tests/test_active.py](tests/test_active.py),
  96 tests, parametrized across all 8 gear types. Three layers:
  API round trip (`true` / `false` / key omitted → `True` / `False` / `None` on the `*Public`
  response, on POST, re-GET and the list endpoint), PATCH (both directions, plus `None` → `True`,
  plus "patching another field leaves `active` alone"), and — the layer that matters — loader
  mapping: a minimal JSON item is pushed through each type's real `clean_*` + `add_*_to_db` pair and
  the DB row is asserted, so deleting an `active=x.get("active")` line or typo'ing the JSON key goes
  red (verified by dropping the line in `load_grips.py`: 2 failures). A final check reads each root
  `*.json` and asserts every item carries an explicit boolean `active`. Full suite 270 passed.

- [x] **Compare button is dead in the detailed view.** Fixed: `compareSelected` / `compareDisabled` /
  `onToggleCompare` are threaded from `GearListingPage` (which owns the selection, so it is shared
  with the card grid and survives a density switch) through
  [GearDetailedList.tsx](frontend/src/components/gear/GearDetailedList.tsx) into
  [GearDetailBody.tsx:158](frontend/src/components/gear/GearDetailBody.tsx#L158), which renders the
  pill with the same active styling and `data-active` hook as the card. Covered by the
  "Compare — Detailed view" and "selection shared across Cards and Detailed views" blocks in
  `compare.cy.ts` — 31/31 passing.

## Backend / data

- [ ] **Adjudicate the remaining missing-gear candidates.** [MISSING_GEAR_REVIEW.md](MISSING_GEAR_REVIEW.md)
  carries **70 unticked candidates** (tree protectors, starter/longline/highline kits, and more) from
  the 2026-07-31 deep sweep, alongside 9 already rejected. The approved batch has been imported; these
  still need a keep/reject call before they can be. Follow the per-type schema notes in that file's
  "Approved" section — the webbing and weblock loaders take different object shapes.

- [ ] **Auto-sync ISA certification (every 24h).** Build a scheduled job that fetches the
  official ISA-approved gear list from
  <https://data.slacklineinternational.org/safety/isa-approved-gear/> once per day and
  reconciles it against the DB, setting `isa_certified` (top-level bool on webbing / leashring /
  grip / starterkit / tricklinekit; `specifications["ISA approved"]` string `"true"` on weblock;
  `isa_approved` on roller). Match on brand + model. Report/queue items on the ISA list that have
  no matching row so the catalog can be filled in (as of last manual sync these were unmatched:
  BC Wafer 2.0, BC Wafer XL, BC Loop, BC Threaded Highline Leash, Cong Gear Path,
  Slack Inov Zenlock, SlackX Orange, Slacktivity HighlineLeash).

- [ ] **Surface ISA gear warnings on the item page.** We've collected the full ISA warning
  database in [isa_gear_warnings.json](isa_gear_warnings.json) (root, ~80 entries). Each entry is
  rich: `status` (Recall / Warning / Notice), `date`, `productType`, `model`, `manufacturer`,
  `description`, `solution`, optional `productImage` and `link1`/`link2`. Today the DB stores only a
  bare `isa_warning` enum (the *status* word) on webbing/weblock/roller/leashring/grip, and
  [GearDetailBody.tsx:87](frontend/src/components/gear/GearDetailBody.tsx#L87) renders just that word
  in an amber banner — the description, solution, date, and source links are all dropped. Goal:
  display the **full warning** (what's wrong + what to do + when + source links) on the detail page
  wherever a warning maps to a gear item.

  **Where the richness has to live.** The single `isa_warning: ISAWarning | None` enum can't hold
  description/solution/date/links. Two options:
  1. **Add fields to each gear model** — e.g. `isa_warning_description`, `isa_warning_solution`,
     `isa_warning_date`, `isa_warning_links` (JSON string) alongside the existing enum. Simple, but
     duplicates the shape across 5 models and doesn't handle an item with >1 warning.
  2. **A dedicated `ISAWarning` table** keyed by brand + model (nullable FK from gear, or matched at
     read time), one row per warning-JSON entry. Cleaner, supports multiple warnings per item, and
     is the natural home for the auto-sync job below. Preferred.

  **Matching is partial — hence "wherever possible."** The JSON's `productType` covers many
  categories we don't model as gear types (`Dogbone`, `Weblock Pin`, `Shackle Pin`, `Sling`,
  `Brake`) — only `Webbing`→webbing, `Weblock`→weblock, `Line Gliders`→roller,
  `Webbing Grab`→grip, `Leashring`→leashring, `Slackline Kit`→starterkit map onto our tables. Match
  on `canonical_brand()` + model string (fuzzy — JSON models like `"Rowan 1.1, 1.2, 1.3"` or
  `"Slackibloc 4.0 all batches"` cover multiple/variant rows). Report unmatched warnings the same way
  the ISA auto-sync item does, so the catalog gap is visible rather than silently dropped.

  **Frontend.** Expand the banner into a warning card: status pill colored by severity (Recall = red,
  Warning = amber, Notice = neutral), the `description`, a "What to do" line from `solution`, the
  `date`, and the source `link`s. Mirror the new fields in `types/gear.ts` and the `*Public` schemas.
  Keep the existing `data-cy="isa-warning-banner"` hook (extend, don't break `isa_certification.cy.ts`).

  **Loader/seed.** Add a `load_isa_warnings.py` pass (runs late, like `load_manufacturers.py`) that
  reads the JSON and populates the new fields/table by matching against already-seeded rows. Note the
  one dirty date in the source (`"01.07,19"`, id 15) — parse defensively.

  **Relationship to the ISA auto-sync item below:** that job syncs *certification*; this is the
  *warnings* feed from the same org (`data.slacklineinternational.org/safety/isa-gear-warnings/`).
  Ideally the auto-sync job eventually refreshes both. See [SlackDB API](slackdb.md) for the
  original source of this scrape.

- [ ] **Add bungees as a gear type.** The `Bungee` model already exists on branch
  `bungees_ringpadding` (`slack_data/models/bungees.py`) but has **no seed JSON, no loader, no
  router, and no `Brand` back-reference** — no source data yet. To wire it up: source/build a
  `bungees.json`, add the `Brand._bungees` Relationship + computed field, a loader, a router,
  register both in `main.py`, then re-seed. Frontend: add to `config/gearTypes.ts` (already flagged
  "upcoming" in PLAN.md) + TS types mirroring `BungeePublic`.

  **Reference data sources (manufacturer bungee product pages):**
  - <https://www.balancecommunity.com/products/bc-bungees>
  - <https://slackx.eu/Products/Bungee-Anchor/>
  - <https://slacktivity.com/shop/slackline-bungees/>
  - <https://spider-slacklines.com/shop/en/bungee/1284-7330-modular-bungee.html#/1362-select_model-soft_shackle_openable>

## ✅ Shipped (kept here briefly so the entries above don't get re-opened)

- **Gear lifecycle status.** Shipped as **`active`**, not the `available` this backlog originally
  specified, and with real data rather than the `null`-everywhere rollout that was planned: a
  web-verification pass filled in all 498 items (227 active / 271 legacy). On all 8 gear models,
  through the loaders and seed JSON. Frontend: red "Legacy" card badge + the ALL / CURRENT / HISTORIC
  scope bubble pinned at the top of the filter sidebar. See CLAUDE.md § Data model and
  DESIGN.md § Left Filter Sidebar. Manufacturer lifecycle was already separately captured by `active`
  in `manufacturers.json` (from SlackDB's `isActive`; see `slackdb.md`).

- **Sticky filter sidebar.** The `<aside>` pins below the top nav and self-scrolls. Implemented close
  to the spec that used to live here, with two deviations: the bottom reserve is `6rem` (not `2rem`)
  to clear the fixed CompareBar, and the aside splits into a pinned status bubble plus a separate
  inner scroll region (`data-cy="filter-scroll"`) rather than scrolling as one box. `TopNav.tsx`
  publishes `--header-h` via a `ResizeObserver`. Recorded in PLAN.md as a post-Phase-9 entry.
