# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## Backend / data

- [ ] **Adjudicate the remaining missing-gear candidates.** [MISSING_GEAR_REVIEW.md](MISSING_GEAR_REVIEW.md)
  carries **70 unticked candidates** (tree protectors, starter/longline/highline kits, and more) from
  the 2026-07-31 deep sweep, alongside 9 already rejected. The approved batch has been imported; these
  still need a keep/reject call before they can be. Follow the per-type schema notes in that file's
  "Approved" section — the webbing and weblock loaders take different object shapes.

- [ ] **Named webbings we know exist but hold no specs for.** Twelve products surfaced by name only
  — no manufacturer confirmed for most, no width, MBS, weight, stretch or price. None of them are in
  `webbings.json` today. They are recorded here rather than seeded as stubs: a webbing row needs
  `width` NOT NULL, and the two ISA stubs in the entry below already show what that costs (BoomBoom seeds as
  **0 mm**). Source each one, then add it the normal way — id, brand with a `manufacturers.json`
  entry, `active` flag.

  - [ ] **Mystery Tube**
  - [x] **The Path** — added 2026-09-10 as webbing **260**, Cong Gear "Path".
  - [ ] **TWTSNBN** ("the webbing that shall not be named")
  - [ ] **Float**
  - [ ] **PHAT**
  - [ ] **Pure**
  - [ ] **PowerLine** (HopOn) — reviewed at
    <https://www.outdoorgearlab.com/reviews/climbing/slackline/hopon-powerline>, which is a
    sourceable spec sheet. HopOn is not one of our manufacturers yet.
  - [ ] **Marmot Tube** (Mammot Tubular)
  - [ ] **Nathan Paulin castle special** — a one-off/limited line rather than a catalogue product;
    decide whether it belongs in the catalogue at all before sourcing it. (Techni Sangles)
  - [ ] **Dynosaur** (Santi)
  - [ ] **Bearsling**
  - [x] **Duct Tape** (Wall Ace) — added 2026-09-10 as webbing **259**, from the maker direct:
    the same 25 mm Dyneema-centre/nylon-edge weave as their Steel Cable, just thinner.

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

  *A stub that still has to be sourced:*
  - [ ] **Slacktivity Hangover 1.0** (`rollers.json`, roller 22) for ISA 45. Created so the warning
    had something to point at, and `slider_type: Carabiner` plus `active: false` is the whole of
    what it states — every other field in the seed is `null`. That is not neutral on the site:
    `load_rollers.py` runs the three NOT NULL enums through `get_roller_material` / `get_lock_type` /
    `get_bearing_material`, which fall to **`Other`** on an empty string, so the detail page prints
    three specs the seed never claimed. Source it (Slacktivity's own page or a capture), or decide
    the fallbacks should be nullable columns.

  The other stub, **Slack Inov BoomBoom** (`webbings.json` 246, ISA 78), is done — it carries real
  manufacturer specs now (25 mm tubular nylon, 52 g/m, 27 kN, a full 1–20 kN stretch curve, the
  Spider Slacklines co-listing). Only price and product URL are still unknown, and it stays
  `active: false`.

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
  no matching row so the catalog can be filled in. Four of the eight items unmatched at the last
  manual sync are now held — **BC Wafer 2.0** and **BC Wafer XL** (grips 15, 16), **Slack Inov
  Zenlock** (weblock 112) and **Cong Gear Path** (webbing 260). What is left:

  - **SlackX Orange** — held, as `Radrigs Orange` (weblock 58). The approval names the **seller**,
    so a brand+model match closes it only if it consults `gear_sellers` (SlackX is named there).
    This is the one unmatched entry that is a matching bug rather than missing data.
  - **BC Loop** — the BC Aluminum Leash Ring
  - **BC Threaded Highline Leash** and **Slacktivity HighlineLeash** — leashes, a gear type we do
    not model at all. Nothing to match until one exists.
  - ~~**Cong Gear Path**~~ — closed 2026-09-10: held as webbing **260**, and Cong Gear is now a
    manufacturer (catalog_id 100). A brand+model match reaches it.

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

  **The seller half is built and seeded** — `gear_sellers`, 64 co-listings, the Brand filter and
  "Also sold by" (§ Shipped, CLAUDE.md § Co-listings). What that leaves:

  **A. Data.**

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

  **B. Frontend.**

  - [ ] **Answer counts and dedup before anything renders a seller on a card or in a list.**
    Manufacturer inventory counts ([brandSections.ts](frontend/src/utils/brandSections.ts),
    [useBrandDirectory.ts](frontend/src/hooks/useBrandDirectory.ts)), listing totals and
    [compare.ts](frontend/src/utils/compare.ts) all assume one row is one product. SlackX reads as
    **0 items** on the directory today for exactly this reason. Decide whether a seller's items
    count toward their inventory **before** the number is on screen and someone quotes it.

  **C. The write loop — not built, and deliberately so.**

  - [ ] **A seller has no way to correct anything about their own listing**, because there is
    nothing per-seller left to correct. The `matching.Role` maker/seller split, `SELLER_CHANGE_FIELDS`,
    the 403 on a spec change from a seller and `Submission.target` were all built against the side
    table and removed with it. Rebuild them **only** alongside per-seller price/URL data (A above) —
    they exist to bound an edit surface that does not currently exist.

  **D. Deliberately not built.**

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

- **Manuals we know exist but do not hold.**
  - ~~**Raed's webbing manual.**~~ Held now (vers. 2.4 / 2024-12), fetched by hand: their
    Cloudflare answers this network 429 for every automated request, browser headers included, so
    anything further from raed-slacklines.com has to be downloaded in a real browser. Their
    highline leash-system manual came in the same way and sits on the **Halo** leash ring, the one
    product of the three it documents (HALO ring / PRO leash / ALPINE leash) that we carry.
  - **A dead link on the maker's own site**: Bera's `certificados/anel_linelock.pdf` 404s as of
    2026-09-09. Slacktivity's redTube manual did too — the manuals index still points at
    `Manual_EN_HighlineWebbing_redTube-A_V1.pdf`, which is gone; the B revision was fetched by hand
    and is what we hold. The rigging recommendation their page also carries is **not** a manual for
    the webbing and is deliberately not shown under a heading that says "Manuals & documents".
  - **Documents whose product we do not carry**, found while crawling and worth revisiting if those
    gear types ever land: Spider/Slack Inov's manuals for the Slackimoufle, Infinity, Spacer, EVO,
    Radix and their bungee and leash (bungees and leashes are unseeded types), and Slacktivity's
    TreeSling and softRelease.
  - **German-only manuals are held, titled as such** — Slacktivity's Super Jumpline and
    Slackliner.de's ratchet-set manual (range-wide: all three of their starter kits are single
    ratchet, and the document names no product). The **German** duplicates of documents we already
    hold in English were not taken, nor were Slacktivity's DE-only pinkTube B and C sheets, which
    describe webbing variants the catalogue holds as one `pinkTube`.
  - **Balance Community links most manuals client-side**, so crawling their HTML found three of the
    five we hold; the rest were confirmed by verified URL. A future sweep of that catalogue needs a
    real browser, not curl.

## Frontend / UX

- [ ] **Universal search (considered, deferred).** Search is per gear type: the box on the webbings
  page searches webbings. Someone who knows a product name but not its category — which is most
  people who arrive from outside — has to guess the tab first. Two shapes were weighed: one search
  box in `TopNav` searching all eight types with a grouped results surface, or the same box with an
  Amazon-style category selector fused to its left, defaulting to the category being browsed.

  Deferred rather than dropped. The immediate complaint behind it was that the listing toolbar was
  overloaded and the search box was being squeezed to ~130px, and that is fixed (§ Shipped) without
  moving search anywhere. Doing it properly needs a cross-type search surface — a results page that
  can rank a webbing against a weblock, which we have no relevance model for — and that is a feature,
  not a layout change. Revisit once there is a homepage/dashboard to hang it off (PLAN.md).

## ✅ Shipped (kept here briefly so the entries above don't get re-opened)

- **Back goes where you actually were.** Three parts of one complaint, all fixed.

  - **The back link on a detail page was `/${slug}`** — the gear type's bare listing, whoever sent
    you. Open a webbing from Balance Community's page and it said "← Webbings" and meant it; open
    one from a filtered listing and the filters were gone. Links into a detail page now carry the
    page they were clicked on in `location.state` (`utils/origin.ts`, `context/OriginContext.tsx`),
    so the link reads "← Balance Community" or "← Compare Webbings" and returns there, filters and
    sort intact. `components/layout/BackLink.tsx` is a real `<Link>` with a real href — middle-click
    and copy-link work — but a plain left click prefers `history.back()` when we know we arrived by
    PUSH, so the scroll offset `useScrollRestoration` keeps is not thrown away by re-pushing the URL.
    An origin out of history state is validated before it becomes an href
    (`tests/unit/origin.test.ts`): a protocol-relative path is not a same-site path.
  - **Two filters were not in the URL and so silently reverted**, which is the "Local listing state
    does not survive Back" entry this replaces. The webbing stretch widget (`?kn=`, `?stretch_min=`,
    `?stretch_max=`) and the ALL/CURRENT/HISTORIC status scope (`?status=`) were `useState` in
    `GearListingPage`; both are query params now, so Back restores them, they are deep-linkable, and
    the two clears drop them along with the rest of the query string rather than resetting them by
    hand. `navigation.cy.ts` covers both, plus every back-link route above.
  - **The compare selection went the same way, and then came back.** It was `?compare=3,1,9` in
    selection order, for a good reason: the detour that emptied the bar was opening one of the picks
    to check a number. The cost turned out to be about a second per tick. A param write goes through
    `useSearchParams`, and every memo on the listing keyed off `url.params` recomputes with it — both
    `applyFilters` passes, the sort, and the table view's column set — so one checkbox re-ran the
    whole listing pipeline and re-rendered 12,000 table cells. It is component state again.
    `?compare=` is still READ on mount, so a link carrying one opens with the bar filled and
    `utils/compare.ts` → `parseIdList` stays shared with the compare page's `?ids=`
    (`tests/unit/compareIds.test.ts`); nothing writes it. Both clears still keep it and it still
    clears on a gear-type switch — the latter needs an effect now that the nav's empty query string
    isn't doing it for free. `url_state.cy.ts` asserts the URL does not change while you pick, which
    is the guard against this regressing.

    Surviving the detour is still worth having. The way to get it is somewhere that is not a render
    input — the entry's `history.state`, or a context above the listing — not by paying for it on
    every click.

- **Table view — the listing's third mode.** `?view=table`, a peer of Cards and Detailed, built to
  the spec that was in this section: columns are the FULL spec set from `config/specRows.ts` in its
  declared order (which is the relevance order — the file now says so, because a column's position
  is the only thing that decides whether anyone scrolls to it), minus the ones no item populates;
  header clicks write the same single-field `?sort=` the dropdown writes; one frozen identity column;
  a compare checkbox per row; and the whole row a real link through to the item, as the whole card is
  — one anchor filling each cell, since a `<tr>` cannot host the card's stretched overlay and a bare
  click handler gives no context menu, no new-tab and no middle click. Headers carry the label alone — the unit is already on every line.
  The identity header carries two sorts, `Name · Manufacturer`, since the cell stacks both — which
  needed an alphabetical branch in `sortItems`, as the numeric path Number()s every brand to NaN and
  would have left the rows in name order under a header claiming otherwise.
  **Webbing stretch is one column per kN**, expanded in place where specRows puts the curve: a
  series in one cell can be read but not ranked, and ranking the catalogue at a given load is the
  question the mode exists for. The columns are headed by the load alone under one spanning
  `STRETCH @ KN` heading, and the block's ceiling follows the FILTER rather than the catalogue —
  only 29 of 230 curves pass 20 kN, so an unfiltered block is empty at the top. Readings recorded off-integer (14
  of 230 curves) round into the nearest column; an exact reading always beats a rounded one; display
  and sort share the one accessor so the column can't rank on a number it didn't print. The
  sidebar's kN pills stay exact-match — a pill saying 10 kN must mean measured at 10 kN. Below `lg` the button is absent and a deep-linked `?view=table` renders
  Cards without rewriting the URL. DESIGN.md § Table View, `table.cy.ts` (42 tests), and
  `tests/unit/table.test.ts` for the column/sort-state arithmetic.

  Three things worth knowing, none of them in the plan above:

  - **The listing mode moved into the URL** — for all three modes, not just the table. It was
    `useState`, so it could not be shared and did not survive Back — the first of the fields the
    Back entry below moved into the URL.
  - **The sticky header forces an inner scroll region.** A wrapper that scrolls only horizontally
    becomes the sticky containing block, so a header pinned inside it scrolls away with the page —
    `overflow-x: auto` cannot be paired with `overflow-y: visible`, the spec computes that to `auto`.
    So the table scrolls in both axes inside a `max-h` region under the nav.
  - **Two rapid header clicks did not flip the direction**, because `sort` arrives through
    `useSearchParams` and lags a render: the second click read the pre-click sort and re-applied
    ascending. Fixed with a local `pendingSort` held until the echo lands — the same trap
    `SortDropdown` documents for its stretch row. `table.cy.ts` caught it.

  **Not done, and deliberately:** multi-column sort (the moment `?sort=` is a list, the dropdown
  can't represent it), and any table at all below `lg`.

  Adding it also **repacked `cypress/shards.json`**: every shard was already ~6:00, so a 2:00 spec
  had nowhere to land without making one runner 7:51.

- **Listing toolbar: fixed-size search, and the accuracy note moved out.** The search input was
  `min-w-0 flex-1 max-w-64` — sized from whatever the flex-wrap row had left over, which made it a
  residue of everything else on the row rather than a control with a size. At ~1200px it resolved to
  about 130px, too narrow to show the word "Search" in its own placeholder. It is now `w-64
  shrink-0`. Two things left the row to make that fit: the inline "Community-sourced — may be
  incomplete." note (it is a standing notice and the footer already carries it on every page —
  SAFETY_AND_ACCURACY.md §B1 was updated, and `safety_notices.cy.ts` now asserts its ABSENCE from the
  toolbar so it is not quietly reinstated), and "Missing something?", which moved into the
  right-hand group beside the view toggle and Sort.

- **Card content no longer paints over the sticky filter bar.** Reported as a Firefox-on-Mac bug at
  narrow widths; it reproduces in Chromium too, ~2000 times in a single scroll sweep. Width was only
  the trigger — `MobileFilterBar` mounts below `lg`, so the bug can only appear there. The cause was
  a z-index tie: `GearCard`'s root was `relative` with **no** z-index, so it opened no stacking
  context and its `relative z-10` title link and action buttons landed in the ROOT stacking context,
  tying with the bar's own `z-10` and winning on DOM order because the cards come after it. Fixed
  with `isolate` on the card — not by giving the bar a bigger number, which would only move the
  collision. `mobile.cy.ts` guards it with `elementFromPoint` across a sweep of scroll offsets,
  because overlap is the question "what is painted here?" and rectangles cannot answer it.

- **"Sort by Sort by".** `labelFor()` returned the literal string `'Sort by'` when no sort was set,
  and both triggers print their own eyebrow above it — so the desktop button read "Sort by Sort by"
  and the mobile one "Sort Sort by". No sort is not "unsorted": `sortItems()` falls through to
  alphabetical, so the default now labels itself **Name: A→Z**, which is what it actually does.

- **Scroll restoration on back/forward.** Every navigation used to land at the top, so opening the
  180th webbing and pressing Back dropped you at webbing #1. `hooks/useScrollRestoration.ts`, mounted
  once on `AppLayout`. It is a hook rather than react-router's `<ScrollRestoration>` because that
  component requires a data router and `main.tsx` mounts a plain `<BrowserRouter>` — adopting
  `createBrowserRouter` to get it would rewrite App.tsx's route table for one behaviour. Three things
  make it work rather than nearly work: `history.scrollRestoration = 'manual'` (the browser's own
  runs before React has rendered the list and clamps to 0 against a page one spinner tall); keyed by
  `location.key` rather than pathname (two visits to /webbings with different filters are different
  entries and must not inherit each other's offset); and re-applied every animation frame until the
  offset sticks or a 1.5s budget runs out, because the listing is still fetching and still growing at
  restore time. PUSH/REPLACE still go to the top. Filters, sort and search come back on their own —
  they live in the query string — with two exceptions recorded above.

- **Compare draws the stretch curve, and holds ten items** (#76). Four columns of
  "5.9% @ 10 kN · 7.1% @ 15 kN · …" is the reading compare exists to spare you, so on compare
  webbing stretch leaves the table and becomes a multi-series line chart — load across, elongation
  up, one line per column in the column's own colour — suppressed back to a table row when there
  are fewer than two curves to plot. Inline SVG built here (`utils/chart.ts` +
  `components/charts/LineChart.tsx`), not a charting dependency: the arithmetic that decides whether
  it is readable (nice-numbered ticks, a domain that ignores one outlying curve, the eight-series
  cap) is unit-testable in a way a picture is not — `chart.test.ts`. **`COMPARE_MAX` went 4 → 10**;
  the chart is the binding constraint, so it plots the first eight curves and names the rest.
  DESIGN.md § Stretch is a chart, not a table. Landing it on main also fixed a **range-domain race**
  that reddened the spec: the slider domain and the drawn domain were computed from two different
  snapshots of the fetch.

- **Manuals & documents on the detail page.** Manufacturers publish PDFs about their gear and we now
  hold **42** of them — 36 filed against a product, 6 filed against a brand — shown as their own card
  below the spec sheet, first document embedded inline with an "Open ↗" fallback that *is* the
  feature on mobile. Stored exactly like images: a curated folder tree under
  `frontend/public/gear-manuals/` plus a manifest generated by `scripts/build_gear_manifest.py`
  (`--check` fails on drift), with the document's title carried in the filename and a non-English
  document saying so in its own title. **Range-wide manuals are filed once under the brand**
  (`brandManuals.json`) — BC, Spider/Slack Inov, Bera and Raed each publish one webbing manual for
  everything they make, and copying it onto forty product keys is forty chances to leave one on the
  old version. Absent, not empty, when we hold nothing. DESIGN.md § Manuals & documents. What we
  know exists and still do not hold is recorded under Backend / data above.

- **Catalogue data: two manufacturers, six webbings, the YogaSlackers range** (#78). Wall Ace
  (`catalog_id` 98, AU) and Sterling Rope (99, US) — Sterling the first entry here that is not
  slackline-oriented — plus webbings 253–258 (Wall Ace Steel Cable, BC Spider Silk MK1, Landcruising
  Aeon, Sterling Type 9800, Slacktivity 2FACES, Slackstar Line Long Way), starterkits 65/66 and
  treepro 26 for YogaSlackers. Each row is transcribed from the maker's own page or the only capture
  of it, with the provenance in `notes`: a stated percentage with no load is **not** recorded as a
  stretch point, an unstated breaking strength stays null rather than being inferred, and prices are
  per metre off the longest length's regular price, never a sale price. "Yoga Slackers" became
  **YogaSlackers**, the old spelling kept as an alias so seeds, scraped image filenames and anything
  already recorded still resolve. Corrections to rows already held: webbing 38 gains a price and a
  stretch point, Slack.fr Dark Blue's `priceMeter` drops 1.96 → 1.45 (1.96 was the 25 m tier),
  weblock 95 becomes "Slackibloc Jump", starterkits 25/26 lose their scraper-shouted names.

- **The e2e job went from ~37 minutes to ~7, without dropping a test** (#77). Cypress runs sharded
  across six runners packed by measured spec duration from `frontend/cypress/shards.json`. The cost
  is a manifest that has to be kept in step with the spec directory — a spec absent from it silently
  never runs — so `npm run shards` verifies every spec is in exactly one shard, and is run by
  `test:unit` and by CI before the matrix is built.

- **SlackX onboarded as a seller-only manufacturer** (2026-09-02). `local_slackx`, `catalog_id` 97,
  `info@slackx.eu`, named through `gear_sellers` as the seller of both Radrigs weblocks — the
  `Orange` and the `Slackfriend`. It continues the Radrigs line and makes nothing else we hold, so
  the recorded blocker (nowhere to put the address, since `load_manufacturers.py` only enriches rows
  a gear seed already created) was closed by letting `load_seller_brands.py` create a seller-only
  brand from its `catalog_id`, ahead of the enrichment pass. Two consequences are still open and
  tracked where they belong: SlackX reads **0 items** on the directory (co-listings, § B) and
  **SlackX Orange** is still an unmatched ISA approval (§ Auto-sync ISA certification).

- **Co-listings — one product, several sellers** (#75). `gear_sellers`, a JSON column of seller brand
  NAMES on every gear model, written in each gear seed beside the item it belongs to and resolved at
  load time by `load_data/load_seller_brands.py` — which also creates a *seller-only* brand from its
  `catalog_id`, the one place a `Brand` is born outside a gear loader. **64 co-listings** load with
  zero drops: SlackX → Radrigs `Orange`/`Slackfriend`, and the 62 Slack Inov ↔ Spider listings across
  all eight gear types. It replaced a `GearSeller` side table of `(gear_type, gear_id, …)`
  cross-references, which would have been a second file of hand-typed ids to keep in step with the
  seeds for data that is one name per listing. On the frontend the sellers arrive with the item —
  [utils/sellers.ts](frontend/src/utils/sellers.ts) is one function over one field — feeding the
  sidebar's **Brand** filter (which matches an item's maker *plus* every brand co-listing it,
  [config/brandGroup.ts](frontend/src/config/brandGroup.ts)) and **"Also sold by"** on the detail page
  ([AlsoSoldBy.tsx](frontend/src/components/gear/AlsoSoldBy.tsx)), a name per row because a name is
  all we hold. `co_listings.cy.ts` and `brand_filter.cy.ts` cover both, sharded and green in CI.
  Nobody may edit it through an API — `gear_sellers` is in `_EXCLUDED` in `submissions/fields.py` —
  and deploy needed nothing: the sellers ride in the root `*.json` the Lambda image already bakes.
  CLAUDE.md § Co-listings. **What is still open is above**: per-seller prices/URLs, who actually
  makes what, inventory counts that read a seller as 0 items, and the rebadge half.
