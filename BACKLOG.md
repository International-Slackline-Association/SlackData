# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## Backend / data

- [ ] **Adjudicate the remaining missing-gear candidates.** [MISSING_GEAR_REVIEW.md](MISSING_GEAR_REVIEW.md)
  carries **70 unticked candidates** (tree protectors, starter/longline/highline kits, and more) from
  the 2026-07-31 deep sweep, alongside 9 already rejected. The approved batch has been imported; these
  still need a keep/reject call before they can be. Follow the per-type schema notes in that file's
  "Approved" section — the webbing and weblock loaders take different object shapes.

- [ ] **Add the gear items the ISA warnings point at.** Every entry in
  [isa_gear_warnings.json](isa_gear_warnings.json) now carries a `match` block (`gearType`,
  `gearIds`, `gearNames`, `confidence`, `note`) resolving it against the catalogue — 53 exact,
  12 likely, 1 partial, 10 ambiguous. **Six have nothing to point at**, in two tiers:

  *Type and brand both exist — just add the row (both done):*
  - [x] **SladLock light** (slack.fr) — ISA 82, weblock. Added 2026-09-02 as weblock **131**
    (`SladLock Light`) from the archived shop page; ISA 82 now points at it, and weblock 96
    SladLock Power stays a separate product with its own warning (ISA 12).
  - [x] **RigLock** (Raed Slacklines) — ISA 80, weblock. Added 2026-09-02 as weblock **130** from
    the archived manufacturer page; ISA 80 now points at it. Marked `active: false` — Raed's
    current weblock line is the TiLock and the RODEO.

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

- [x] **Onboard SlackX as a manufacturer.** *(done 2026-09-02.)* Entered in
  [manufacturers.json](manufacturers.json) as `local_slackx`, `catalog_id` 97, carrying
  `info@slackx.eu`, and named as a seller of both Radrigs weblocks — the `Orange` and the
  `Slackfriend` — through `gear_sellers` on those two rows in [weblocks.json](weblocks.json).
  SlackX continues the Radrigs line and makes nothing else we hold. (They list the `Orange` as
  "Orange 1.0"; a per-seller product name is not something the schema stores.)

  The blocker recorded here — nowhere to put the address, because `load_manufacturers.py` only
  enriches rows a gear seed already created — was resolved by making `load_seller_brands.py` create
  a *seller-only* brand from its `catalog_id`, and by running that pass ahead of the enrichment so
  the new row still gets its country, site and email. A shop that resells and manufactures nothing
  was otherwise the one brand co-listings could not name.

  **Still open, and now visible:** SlackX reads as **0 items** on the manufacturers directory,
  because inventory counts group gear rows by maker and know nothing about sellers — see the
  co-listing entry below. And **SlackX Orange** stays on the unmatched-ISA-approvals list above:
  the approval names the seller, the catalogue holds the item as `Radrigs Orange`, so the
  auto-sync's brand+model match needs to consult `gear_sellers` to close it.

- [ ] **Store production batches of the same product.** One row is currently one product, so every
  spec is a single value that silently claims to hold for everything ever sold under that name. It
  does not: a manufacturer changes a weave, a supplier, or a sewing line, and MBS / stretch /
  weight / thickness — and the ISA's opinion of the result — change with it.

  **This is already wrong on the live site, and in the direction that matters.** Five of the 82
  entries in [isa_gear_warnings.json](isa_gear_warnings.json) are explicitly batch-scoped ("Only
  one batch is affected", "produced before April 2020", "Serial Nr. XXXX2017", "50 Pins of the
  first batch"), and [load_isa_warnings.py](slack_data/load_data/load_isa_warnings.py) stamps them
  onto the whole product row because there is nothing narrower to stamp. **Slacktivity pinkTube**
  (`webbings.json` 61) carries two of them and is `active: true` — so we show a warning badge on a
  webbing you can buy new today, when only pre-April-2020 stock is affected. Over-warning is the
  safer failure of the two, but it is still false, and a catalogue that cries wolf on current stock
  teaches people to scroll past the badge that is real. **Slacktivity KingPin** (`weblocks.json` 41,
  also `active: true`) is the same shape.

  **The shape to decide.** Duplicating rows per batch is the one option to rule out up front — an id
  is the catalogue's stable identity (§ Loader pattern), already recorded in ISA match blocks,
  manufacturer credentials, submitted corrections and bookmarked links, and most products have
  exactly one batch anyway. That points at a child table (`WebbingBatch`, FK to `webbing.id`) whose
  columns are **nullable overrides** — null means "same as the parent" — plus whatever identifies
  the batch in the wild: a date range, a serial/lot pattern, a colour run. Open questions:

  - **Which fields are per-batch?** `breaking_strength`, `stretch`, `weight`, `thickness`,
    `isa_certified`, `classification`, `isa_warning` are the candidates. `name`, `brand_id`,
    `width`, `price` almost certainly are not. Getting this list wrong in either direction is what
    makes the feature either useless or unfillable.
  - **`ISAGearWarning` links by `(gear_type, gear_id)` with no FK** — deliberately, because a
    warning can land on any of five tables. A batch-scoped warning needs a third component, or a
    `gear_type` of `webbing_batch`. Either way the `isa_warning` severity enum on the parent row
    has to become an explicit "worst across batches", not an accident.
  - **Identity for the manufacturer API.** `matching.py` resolves `gear_id` + `name`; a batch adds
    a third axis with no name of its own. `manufacturer_sku` is the natural key and is already
    stored-but-unmatched — except most brands keep no part numbers at all, which is why it matches
    nothing today. A brand that cannot name its own batches cannot correct them either.
  - **Frontend.** A card shows one spec set and compare assumes one row is one thing. Batches
    probably belong on the detail page only (a selector, defaulting to current production), leaving
    the card showing the parent — but that has to be a decision, not a default.

  Note `BaseWebbing.version: str | None` already exists, is exposed on `WebbingPublic` and typed in
  `frontend/src/types/gear.ts`, and is **null for all 246 webbings**. It is a free-text label, not a
  batch entity — decide whether it becomes the batch's human-readable name or gets dropped, rather
  than leaving two half-answers to the same question in the schema.

  Only webbing is scoped here because that is where the evidence is; weblocks (KingPin, Slackibloc
  4) have the same problem and should be designed for even if not built at the same time.

- [~] **One product, several brands or sellers.** `brand_id` is a single required FK on every gear
  row, so the schema can only say "this is a Slack Inov Vortex". It cannot say "…which Spider
  Slacklines also sells", which is now true of most of the Slack Inov range. Rebadging and
  reselling are normal in this trade and we model neither.

  **The seller half is built and seeded** — `gear_sellers`, a JSON column of seller brand NAMES on
  every gear model, written in each gear seed beside the item it belongs to and resolved at load
  time by `slack_data/load_data/load_seller_brands.py`. **64 co-listings** load with zero drops.
  See CLAUDE.md § Co-listings.

  It replaced a `GearSeller` side table seeded from a root `gear_sellers.json` of
  `(gear_type, gear_id, gear_name, brand, …)` cross-references. The table could hold a per-seller
  price, currency, product URL and stock flag — but none was ever sourced for 62 of the 64 rows,
  so what it actually held was a second file of hand-typed ids to keep in step with the seeds, for
  data that is one name per listing. The names now live on the product, which is the only place
  they can drift out of step with nothing.

  **What is left**

  **A. Data — done.**

  - [x] **SlackX → Radrigs `Orange`, `Slackfriend`** (2026-09-02), recorded by hand from
    slackx.eu. This is also the case that proves a seller-only brand can be created.
  - [x] **Slack Inov ↔ Spider Slacklines, 62** (2026-09-03). The two companies sell each other's
    full range with no exceptions, so every item made by one names the other, across all eight gear
    types: 26 webbings, 18 weblocks, 5 leashrings, 5 rollers, 3 starterkits, 2 grips, 2 treepros,
    1 tricklinekit.
  - [ ] **Per-seller prices and product URLs are not held at all**, and the schema no longer has
    anywhere to put them. That is the deliberate trade: nobody has sourced a per-product price or
    shop URL for this range, and a price on a public page that no shop ever quoted is worse than no
    price. If they are ever sourced, widening `gear_sellers` from `list[str]` to a list of objects
    is the change — and it should not be made before the data exists.
  - [ ] **Who actually makes what.** The bulk pass kept the catalogue's existing `brand_id` as the
    maker and named the other company as a seller. That is right for the common case and is **not
    verified per product** — where Slack Inov and Spider both resell a third party's webbing, the
    schema has no honest answer and the current rows silently assert one. Worth a pass with the
    manufacturers.
  - [x] **Re-seeded and verified.** `rm slack_data/database.db` + restart → `Resolved 64
    co-listings`, no drops, and `GET /weblock/14` returns `"gear_sellers": ["Slack Inov"]`.
    **The gotcha stays:** seeding is one-shot per gear table, so a `gear_sellers` edit does nothing
    until the database is deleted.

  **B. Frontend — the read side. Built, rendering real data.**

  - [x] **The sellers arrive with the item**, so there is no type, fetch, hook or index of its own
    any more — [utils/sellers.ts](frontend/src/utils/sellers.ts) is one function (`brandsFor`) over
    one field, and `tests/unit/sellers.test.ts` pins its rules (maker first, deduped, blanks and
    non-lists dropped).
  - [x] **The Brand filter reads it.** The listing sidebar's Brand group matches an item's **maker
    plus every brand co-listing it** ([config/brandGroup.ts](frontend/src/config/brandGroup.ts),
    DESIGN.md § Left Filter Sidebar), so picking "Spider Slacklines" returns the Slack Inov gear
    Spider stocks as well as Spider's own.
  - [x] **"Also sold by" on the gear detail page** —
    [AlsoSoldBy.tsx](frontend/src/components/gear/AlsoSoldBy.tsx), in the detail page's right column
    under the price and above the ISA certification block, below the ISA warning banner (a list of
    shops must not push a recall further from the name of the thing recalled). One row per seller,
    the name linked to their brand page. **A name is the whole row** — no price, link or stock chip,
    because none is held. Absent, not empty, when there are none. DESIGN.md § Also sold by.
  - [ ] **Answer counts and dedup before anything renders a seller on a card or in a list.**
    Manufacturer inventory counts ([brandSections.ts](frontend/src/utils/brandSections.ts),
    [useBrandDirectory.ts](frontend/src/hooks/useBrandDirectory.ts)), listing totals and
    [compare.ts](frontend/src/utils/compare.ts) all assume one row is one product. SlackX reads as
    **0 items** on the directory today for exactly this reason. Decide whether a seller's items
    count toward their inventory **before** the number is on screen and someone quotes it.
  - [x] **Cypress spec** — [co_listings.cy.ts](frontend/cypress/e2e/co_listings.cy.ts), now entirely
    against the real backend (the stubs it used to need existed only because the old side table
    shipped empty). It covers the block on a co-listed product, the maker never appearing in it, its
    absence elsewhere, both geometric position rules, and the Brand filter finding what a brand
    sells rather than only what it makes.
    **⚠ Not yet executed.** Cypress will not start in the environment it was written in — every
    cached binary dies with SIGILL / SIGTRAP (exit 132 / 133), with `ELECTRON_RUN_AS_NODE` stripped
    or not. It needs one run from a working terminal, or CI:
    `cd frontend && env -u ELECTRON_RUN_AS_NODE npx cypress run --spec cypress/e2e/co_listings.cy.ts`
  - [x] **[brand_filter.cy.ts](frontend/cypress/e2e/brand_filter.cy.ts) counts sellers too** — its
    expectations derive from maker + `gear_sellers`, and it no longer asserts that every card names
    the picked brand, because a co-listed card names the maker. Same ⚠ as above.

  **C. The write loop — not built, and deliberately so.**

  - [x] **Nobody may edit `gear_sellers` through an API.** It is in `_EXCLUDED` in
    `submissions/fields.py`, so neither the suggestion box nor the manufacturer API offers it. Who
    resells a product is ours to record: a maker does not get to declare or delete a competitor's
    shelf, and `changes` is a `dict[str, str]` that could not carry a list anyway.
  - [ ] **A seller has no way to correct anything about their own listing**, because there is
    nothing per-seller left to correct. The `matching.Role` maker/seller split, `SELLER_CHANGE_FIELDS`,
    the 403 on a spec change from a seller and `Submission.target` were all built against the side
    table and removed with it. Rebuild them **only** alongside per-seller price/URL data (A above) —
    they exist to bound an edit surface that does not currently exist.

  **D. Deploy — nothing outstanding.**

  `Dockerfile.lambda` copies the root `*.json` before baking the catalogue, and the sellers now ride
  in those files, so there is no new file, no new table, no new route and no throttle entry to add.
  A deployed frontend built before this change simply ignores the extra field.

  **E. Deliberately not built.**

  - [ ] **The rebadge half.** `gear_sellers` says "one product, two shops". It does **not** merge
    two rows that are one product, which is what the pairs below are, and the ISA split is still
    live for them — the failure is on the site now, and co-listings did not touch it.
  - [ ] **Adding or removing a co-listing is an operator edit to a seed**, never an API call:
    creating one is a claim about somebody else's product.

  **The data already carries the problem**, from before anyone tried to. Nine product names are
  held by two brands each, and at least three pairs are plainly one product twice:
  **EQB / Spider `Bandit SH` and `Bandit SL`** (`weblocks.json` 13+14, 15+16),
  **Landcruising / Aki `Unicorn` and `White Magic`** (`webbings.json` 6+210, 7+209), and
  **Slack.fr / Slack Pro! `Neon Light`** (100+154). The Bandit pair shows what that costs: the ISA
  pushpin warning is matched to weblocks **12, 13, 15 — all EQB** — so the Spider-badged 14 and 16
  are the same hardware displayed with a clean record. Whichever of the twins a visitor happens to
  open decides whether they are warned. (The specific Slack Inov ↔ Spider overlap is *not* visible
  in the seeds — our SlackDB-era snapshot predates the arrangement — so this one needs sourcing
  before it can be modelled.)

  **Separate the two things it could mean before designing anything.** "Made by X, also sold by Y"
  is a list of seller names on one product row (built) — the further payoff being a price, currency
  and product URL per seller, which is real value we do not offer today. "Sold by X and Y under different names" is
  a rebadge, where the second row should arguably not exist at all and needs merging with a
  redirect, since ids are already recorded in ISA match blocks and bookmarked links (§ Loader
  pattern). The Bandit pair is the second kind; the Slack Inov range is the first. A join table that
  tries to be both will be neither.

  Consequences to think through either way:

  - **Who may edit it.** Nobody but an operator, today: `gear_sellers` is excluded from every write
    path, and there is no per-seller field for a seller to correct. The maker/seller distinction the
    catalogue can *prove* (rather than `BrandPermission`, which is per-credential and cannot vary
    per product) is the right basis for that if it ever comes back.
  - **Counts and dedup.** Manufacturer-page inventory counts, listing totals and compare all assume
    one row is one product. Compare showing the same object twice under two brands is the visible
    failure.
  - **Corrections and warnings must not split.** A submission fixing the EQB Bandit, or an ISA
    recall landing on it, has to reach the Spider one. That is the same `(gear_type, gear_id)` link
    the batch entry above has to widen.
  - **Do not confuse this with one company behind several brand names.** Slack.fr, Slack Inov and
    Easy Slackline are already known to be one operation with three brands — see `KNOWN_SHARED` in
    [tests/test_manufacturer_emails.py](tests/test_manufacturer_emails.py). That is a fact about
    brands; this entry is a fact about products.

  Design this together with the batch entry above. Both hang a second dimension off a gear row that
  currently claims to be one indivisible thing, and solving either one alone very likely means
  rewriting it to fit the other.

## ✅ Shipped (kept here briefly so the entries above don't get re-opened)

- **Mobile & responsive (PLAN.md Phase 12).** The listing page was unusable below ~900px: an
  uncollapsed `flex gap-8` row with a fixed 280px sidebar. Now `lg` is the structural break, filters
  and sort live in a bottom sheet below it, and the nav tabs scroll in one row instead of wrapping
  onto five. **Two decisions not to undo:** (1) the gear-tab strip scrolls rather than wraps — the
  older code comment said the opposite, deliberately reversed; (2) layouts that need different DOM
  switch on `useIsDesktop()`, not `hidden lg:block`, because a CSS-hidden duplicate still doubles
  every `data-cy` the Cypress suite selects on. See DESIGN.md § Responsive & Mobile.

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
