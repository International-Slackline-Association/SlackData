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

- [ ] **Add the gear items the ISA warnings point at.** Every entry in
  [isa_gear_warnings.json](isa_gear_warnings.json) now carries a `match` block (`gearType`,
  `gearIds`, `gearNames`, `confidence`, `note`) resolving it against the catalogue — 51 exact,
  12 likely, 1 partial, 10 ambiguous. **Eight have nothing to point at**, in three tiers:

  *Type and brand both exist — just add the row:*
  - [ ] **SladLock light** (slack.fr) — ISA 82, weblock. A distinct low-tension model; the
    SladLock Power we hold (weblock 96) is a different product.
  - [ ] **RigLock** (Raed Slacklines) — ISA 80, weblock, still in production. Already named in the
    Dyneemite PRO notes as its recommended weblock, but has no row.

  *Manufacturer missing:*
  - [ ] **Passion / Passion 18m** (Mountain Equipment) — ISA 40 (recall) + 41, starter kit. The kit
    type exists; Mountain Equipment is not one of our 56 brands. Two warnings resolve at once.

  *Needs a gear type we don't model:*
  - [ ] **Dogbones** — ISA 1 (Krok Хвостик) and 8 (Gibbon lineLock) have no home at all, and a
    further 7 dogbone warnings (2–7, 9) currently ride on the parent weblock's row rather than the
    product they actually name. Both brands already exist. Adding a `Dogbone` type is the single
    highest-yield gap here: 9 warnings.
  - [ ] **Whoopie** (Raed Slacklines) — ISA 22, sling, still in production. Brand exists, slings
    don't.
  - [ ] **Grigri** (Petzl) — ISA 42, brake, still in production. Neither a brake type nor Petzl as
    a brand; the only entry from outside the slackline industry.

  Two stubs were already created this way and are seeded from the root JSON with `active: false` and
  no specs beyond what the ISA entry itself states: **Slacktivity Hangover 1.0**
  (`rollers.json`, roller 22, `slider_type: Carabiner`) for ISA 45, and **Slack Inov BoomBoom**
  (`webbings.json`, webbing 246) for ISA 78. Both carry a wart worth fixing when specs surface:
  the required NOT NULL columns fall to their fallback buckets (`roller_material`/`lock_type`/
  `bearing_material` → `Other`, `material` → `["Other"]`, and BoomBoom's `width` seeds as **0 mm**).

  The 10 `ambiguous` matches are a separate, smaller call: the ISA names one product where we hold
  several rows (EQB Katana/Katana FX, Mithril Pull/Quick Pin, Slacktivity SlackDuck/-DP, Raed TiLock
  19/25mm, Petram Aeris/Aeris P, lineGrip LineLock AL MK4/VA MKIII, LineGrip Alu G4/G5/nano, Souz
  Snatch 2.2/2.2T, Spider Lime vs Lime SR, Souz Rowan 1.2). Decide per item whether the warning
  covers the whole family or one variant.

- [ ] **Auto-sync ISA certification (every 24h).** Build a scheduled job that fetches the
  official ISA-approved gear list from
  <https://data.slacklineinternational.org/safety/isa-approved-gear/> once per day and
  reconciles it against the DB, setting `isa_certified` (top-level bool on webbing / leashring /
  grip / starterkit / tricklinekit; `specifications["ISA approved"]` string `"true"` on weblock;
  `isa_approved` on roller). Match on brand + model. Report/queue items on the ISA list that have
  no matching row so the catalog can be filled in (as of last manual sync these were unmatched:
  BC Wafer 2.0, BC Wafer XL, BC Loop, BC Threaded Highline Leash, Cong Gear Path,
  Slack Inov Zenlock, SlackX Orange, Slacktivity HighlineLeash).

- [x] **Surface ISA gear warnings on the item page.** Done, via **option 2** (the dedicated
  table) as this entry preferred — and with the matching problem solved by hand rather than by
  fuzzy string matching. Every entry in [isa_gear_warnings.json](isa_gear_warnings.json) carries an
  adjudicated `match` block (`gearType` / `gearIds` / `gearNames` / `confidence` / `note`);
  [load_isa_warnings.py](slack_data/load_data/load_isa_warnings.py) runs last in
  [seed.py](slack_data/seed.py) and writes two things — the `isa_warning` severity enum onto the
  gear row (worst wins; 75 rows) and one `ISAGearWarning` row per warning × matched item (88 rows,
  `models/isa_gear_warnings.py`, served by `GET /isawarning/`). Each id is verified against the
  recorded `"<brand> <name>"` before it is stamped, so seed-order drift is loud rather than silently
  re-pointing a recall at the wrong gear. Frontend: severity bubble top-right on cards (above the
  classification), a `None · Recall · Warning · Notice` sidebar filter, and a detail panel with the
  ISA's description and solution verbatim, the parsed date, an in-production chip, source links, and
  an explicit hedge line on non-`exact` matches. See DESIGN.md § ISA Warnings and
  `frontend/cypress/e2e/isa_warnings.cy.ts`.

  **Still open from this entry:** the 8 warnings with no gear to point at (see the item above), and
  the ISA's `productImage` is stored but not yet displayed.

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
