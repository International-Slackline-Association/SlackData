# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## High priority

- [ ] **Auto-sync ISA certification and warnings (every 24h) — high priority (operator,
  2026-10-17).** Live editing phase 7 built the
  half that does not depend on the ISA: `python -m slack_data.catalogue.isa_import` diffs a capture
  of the approved-gear CSV and the warnings against the catalogue store (new entries unmatched with a
  suggested match, changed fields updated, dropped ones retired, matches never touched), and admins
  match on the site at `/admin/isa`. What is missing is something to fetch: the ISA's pages render
  the lists client-side and publish no file. Decided (P7-F a): ask the ISA for a machine-readable
  export — the request is in LIVE_EDITING_PHASE_7.md § 6 — then run the importer on it daily.
  **Why it is urgent:** our capture is already behind. On 2026-10-17 the operator found an ISA
  Notice of 2026-09-01 on Slack Inov's Spliced Leash in the ISA's own list, missing from
  `isa_gear_warnings.json`; it was added by hand (warning 83, on leash 17). Every safety notice the
  ISA publishes stays off the site until someone happens to notice it, which is exactly what the
  sync is for.

## Staged, waiting for a photo

Products whose specs and links are complete but that have no usable photo, across brands. They
live only in `candidates/` (untracked, git-excluded), in each seed's own format with temporary ids
9001+; `python3 candidates/stage.py apply|revert|status` puts them into the local dev DB or takes
them out. Once a photo turns up, an entry moves into the root seed with a real id
(`scripts/backfill_seed_ids.py`), its photo is filed, and the database is re-seeded.

- [ ] **Landcruising** (archive pass of 2026-10-01; see the Landcruising and Aki entry below)
  - **Linelocker 25** — chain link, 60 g, 31.5 kN WLL:
    <https://web.archive.org/web/20130415083232/http://www.landcruising-slacklines.de/en/shop/12-fixierer/29-landcruising-linelocker-25mm>
  - **Linelocker 35** — 130 g, 53 kN WLL (German page only):
    <https://web.archive.org/web/20140507075500/http://www.landcruising-slacklines.de/de/shop/12-fixierer/30-landcruising-linelocker-35mm>
  - **Cruiser 2.0 Classic** — 25 mm × 30 m yellow Verve, Ellington, 5.4 kg; only 120–132 px
    thumbnails were archived:
    <https://web.archive.org/web/20161007043021/http://www.landcruising-slacklines.de/en/shop/34-neue-produkte/369-cruiser-20-classic-slackline-set-33m>
  - **Cruiser 2.0 Vari** — 25 mm, webbing chosen separately, 2 Lockman 2, ≈5.4 kg:
    <https://web.archive.org/web/20161007042747/http://www.landcruising-slacklines.de/en/shop/34-neue-produkte/370-cruiser-20-vari-25mm-slackline-set>
- [ ] **Slacktivity** (archive pass of 2026-10-08; see the Slacktivity entry below)
  - **LSD-T20** (`candidates/webbings.json` 9007) — the GREEN-T20 webbing #225 with an LSD
    sublimation print, and the line in the Traveler kit #62: 20 mm nylon tubular, 14 m with a sewn
    loop, 12 kN, 28 g/m, 29.95 € (2.14 €/m), English blurb. Staged as its own row rather than a
    colourway of #225 (operator, 2026-10-11). The page's product photo was not archived:
    <https://web.archive.org/web/20200919192803/https://www.slacktivity.com/lsd-t20>
- [ ] **Aki Slacklines**
  - **Mango** — known only from the spec table of Aki's webbing manual (Rev. 1.9, 2021,
    `gear-manuals/webbings/brand/aki-webbing-manual.pdf`): polyester, 20 mm, MBS 16 kN, WLL 3 kN,
    6 % at 10 kN, 32 g/m. No product page or price found yet, and not staged in `candidates/`.

## Data

Gear we don't hold yet in a gear type we already have, and corrections to the rows we do hold.

- [ ] **Elephant Slacklines: loose ends from the archive pass (2026-10-08).** The Elephant rows
  were checked against the Wayback copies of elephant-slacklines.com (three shops, 2011–2019) and
  the still-live Shopify store, where all five products are sold out (all our rows are already
  `active: false`). Archived pages are in English up to 2013; the 2014–2016 meter-ware pages are
  German, so they gave specs and prices but no descriptions. What was applied is under Shipped.

  Still open:
  - [ ] **blueWing stretch.** Elephant published three different figures (all in the row's
    `notes`): 3.6 % at 7 kN / 7.2 % at 15 kN (2012), 7.2 % at 7 kN / 14.5 % at 15 kN (2014), and 5.9 %
    at 7.5 kN on today's shop page (the Wing 3.5's number, likely a copy-paste). The 20-point curve we
    hold matches the 2014 page at 15 kN only. Which figure is right is still undecided.
  - [ ] **Kits we don't hold.** None of Elephant's other sets has a starter-kit row: Rookie, Addict
    and Freak flash'line, the Wing 3.5 sets (15 m girth hitch, 25 m slings), the blueWing 25 m set,
    EcoLine 12 m, PocketLine (13 m, 25 mm, Ellington, 850 g) and Garden Kit. All have archived pages
    and photos, e.g.
    <https://web.archive.org/web/20121015235310/http://www.elephant-slacklines.com:80/contents/en-uk/d86_rookie.html>.
    Horizon (100 m blueWing) and Cloud (70 m Passion) are longline kits, which no gear type covers.
  - [ ] **trendline** (yellow 50 mm set) — only its images were archived, no page or specs:
    <https://web.archive.org/web/2013/http://elephant-slacklines.com/contents/media/l_trendline_set_2013_web.png>.
  - [ ] **T-Lock** — the T-Rig's predecessor ("As successor of our trusted T-Lock…"), part of the
    Horizon set. No archived page.
  - Not Elephant's own, so skipped: the lineGrip G4 Alu (Slackpro's, held already) and the
    Edelrid pulleys.


- [ ] **Landcruising and Aki loose ends (archive passes of 2026-10-01 and 2026-10-05).** Aki
  continued part of the Landcruising range after Landcruising closed in 2018, and both shops survive
  only as Wayback copies (Aki's live shop is behind a password page). What was imported is under
  Shipped. Socials, for announcements that may carry photos and specs: Landcruising Facebook
  <https://www.facebook.com/landcruising.slackline> (no Instagram; `@landcruising` is unrelated);
  Aki Facebook <https://www.facebook.com/akislack>, Instagram <https://www.instagram.com/akislack/>,
  YouTube <https://www.youtube.com/channel/UCw5wJslJNS96DMOKNcg2LTA>. The four products staged
  without a photo are at the top of this file.
  - [ ] **Aki Starter kits #12 and #13 are behind the Shopify-era pages.** #13 "Aki Starter Comfort
    Slacklineset" was renamed "Aki Starter Slackline Kit" — same contents (adjustable tree slings,
    Tree Protection Medium), same 30 kN / 5 kN / 4 kg — and the newer page gives an English
    description, the 4 kg weight and 134.95 € (the row has no weight, no description, 125 €):
    <https://web.archive.org/web/20241204025754/https://aki-slacklines.de/en/products/aki-starter-slackline-kit>.
    #12 Starter Classic's own capture gives 4.2 kg; the row has none.
  - [ ] **Photos too small** — larger ones would be better: Nova Magic 25 #265 and White Magic 35mm #266 (150 × 85), Starter Flex #67 and
    StarterPlus #69 (120 × 73), Lockman 2.0 #140 (200 × 200, the only size archived).
  - [ ] **Stretch curves that disagree with the maker's own table**, left as they are: White Magic
    #6 (maker 4.8 % at 10 kN, seed 5.1 %) and Core 1 #3 (maker 2.7 %, seed 2.8 %). Small, but a
    decision is needed on which source wins.
  - [ ] **Soma #268 is served as 24 mm**, not its 24.5 mm: webbing `width` is an integer column.


- [ ] **Aki / Landcruising gear known by name only — no working capture.** Not staged: each has
  a name and a URL at most, no page with specs or a photo. Each needs a capture found (a
  different Wayback timestamp, the Shopify-era URL, a dealer's copy) before it can become a row.
  - [ ] **Nova Magic 35** (Landcruising) — the only capture is "product not found"; the Starter
    Flex page names it as the red 35 mm line.
  - [ ] **Lockman Air** (Landcruising) — no page of its own and no specs of its own; it appears
    only as a +20 € combo option on the AirBow page (WLL 6 kN in combination):
    <https://web.archive.org/web/20161009010520/http://www.landcruising-slacklines.de/en/shop/6-/38-/491-landcruising-airbow>.
    A 200 × 200 photo survives from the later Landcruising site:
    <https://web.archive.org/web/20180921083857im_/http://landcruising-slacklines.de/media/image/f3/53/63/Landcruising-Slacklines-Landcruising-Lockman-Air-Webbing-Anchor-01_200x200.jpg>
  - [ ] **Lockman Air** (Aki) — in the old shop's sitemap
    (`/de/hardware/bandhalter/81/aki-lockman-air-bandhalter`), no capture. Probably the same
    product as the Landcruising one.


- [ ] **Slacktivity gear we didn't hold, and loose ends from the archive pass (2026-10-08).** Every
  Wayback capture of slacktivity.com, .ch, .de and .at was swept: the Joomla shop (2009–16), the
  Magento shop (2015–21), the WooCommerce shop (2021–) and its product sitemaps (2022–26), and the
  German Shopify shop on slacktivity.de. We already held 40 Slacktivity rows, so only five products
  turned out to be missing, all still sold. Three were added, one is on hold and one was rejected.
  LSD-T20 is staged, waiting for a photo (top of this file). What was applied is under Shipped.

  **Still open:**
  - [ ] **Ice & Fire | 25m Slackline Set**: 25 m × 38 mm, white or orange Super Jumpline, two
    stainless ratchets, slings and tree protectors, 299 €. **Waiting on a decision about kits
    that fit both starterkits and tricklinekits**: it is marketed for beginners, but two ratchets
    on 25 m is a trickline setup, and the held Super Jumpline set (#5) is a tricklinekit. The
    entry and its four photos are kept in `candidates/on_hold/`, which `stage.py` does not read:
    <https://slacktivity.com/shop/ice-fire-25m-slackline-set/>

  - Rejected — do not add
    - **Slackline Ring** (aluminium, 60/80 mm, 51 g, 20 kN, not PSA certified, 11 €; earlier
      "HighlineRing Green" 2016–17 and "AluminiumRing" 2020–21). **Not a leash ring** (operator,
      2026-10-08): it is a general-purpose ring that Slacktivity sells as a multiplier, and says
      not to use as an anchor. Recorded here so a later archive pass does not stage it again. It
      is not the held HighlineRing #26 (39 kN, ISA certified):
      <https://slacktivity.com/shop/slackline-ring/>
  - Looked at and not staged
    - **Variants and renames of held rows**: the Screw-gate HangOver (= HangOver-S #4, also sold
      with a "Black Gate"); Traveler-40m, Traveler-T20 40m and GREEN-T20 20m (lengths of GREEN T20
      #225); Super Jumpline trickline kit 25/50/70 m and Slackline-Set superJumpline (= #5);
      Allround, Allround-2, Allround-3 (= #14); Experience-2 (= #31); IUJ Slackline YOGA Set (the
      same 30 m pinkTube and HangOver-pulley set as #60, with IUJ branding); AcroLine 8 m and
      12 m sets (sets of the held AcroLine #222, set up untensioned). The tree protectors
      (TreeProtection 2.0 / 3.0 / V3 / 3L) are covered under Shipped.
    - **Type X Highline Webbing**: pinkTube #61 sewn to LSDTube #189 or to a 43 g/m PES backup. It
      is an assembly of held webbings, not a new one:
      <https://slacktivity.com/shop/type-x-highline-webbing/>
    - **Longer than any starter kit we hold (max 35 m)**, like the Landcruising longline kits:
      Expert 50/70 m and Expert Pro, Pro kit 50–100 m, Playline set 50–100 m, Lightning 40 m,
      Rodeo 40 m, Park50/Park100, redPark/pinkPark/LSDpark longline kits, HangOverPulley longline
      sets, Highline/Tree Highline/Rock Highline kits, Highline Trickzone Pro setup.
    - **Not a gear type we have**: Weekend Warrior (ninja line), DaVinci, Saltonator, ActiveCube,
      posts and wall mounts, the anti-theft slackline locks (small and large), bigGrip/smallGrip
      rope ascenders, soft releases, rigging plates, static rope, slings, shackles, bungees, the
      HighlineTool, and the X-Connection (a sewing service).
    - **Made by someone else and resold by Slacktivity**: recorded as co-listings (Shipped), not
      rows. Edelrid Eddy is not a gear type we have.


- [ ] **Raed Felt TreeProtection: not staged until a photo turns up** (the rest of the Raed
  archive pass shipped 2026-10-08; see § Shipped). Sold in pairs, 9.99 €, 300 g, 2020–. There are
  no dimensions and no photo anywhere (the archive has only placeholders). In 2019 it was sold
  singly as "treeprotection feltmat" for 7.99 €:
  <https://raed-sports.com/products/2-felt-treeprotection>


- [ ] **Adjudicate the remaining missing-gear candidates.** [MISSING_GEAR_REVIEW.md](MISSING_GEAR_REVIEW.md)
  has one section left from the 2026-07-31 deep sweep: **Starter / Longline / Highline Kit, 56
  rows**. 54 still need a keep/reject call; the two YogaSlackers eLine kits are ticked but not yet
  imported. Every other type is done: the approved webbing, weblock, leash ring, tree protector,
  roller, grip and trickline kit batches are all imported (trickline kits on 2026-09-29), and 11
  items are on the rejected list. Follow the per-type schema notes in that file's "Approved"
  section — the loaders take different object shapes (kits use `manufacturer`, not `brand`).


- [ ] **Named webbings we know exist but hold no specs for.** Twelve products surfaced by name only
  — no manufacturer confirmed for most, no width, MBS, weight, stretch or price. None of them are in
  `webbings.json` today. They are recorded here rather than seeded as stubs: a webbing row needs
  `width` NOT NULL, and the two ISA stubs in the entry below already show what that costs (BoomBoom seeds as
  **0 mm**). Source each one, then add it the normal way — id, brand with a `manufacturers.json`
  entry, `active` flag.

  - [ ] **Mystery Tube**
  - [x] **The Path** — added 2026-09-10 as webbing **260**, Cong Gear "Path".
  - [ ] **TWTSNBN** ("the webbing that shall not be named")
  - [x] **Float** (Balance Community) — not relevant: a prototype polypropylene/HMPE blend the
    operator had a few meters made of, never a product. Not to be listed.
  - [x] **PHAT** ("Polyester, Heavy, And Thicc", Balance Community) — not relevant: a prototype
    heavy polyester webbing the operator made a few meters of, never a product. Not to be listed.
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
  [isa_gear_warnings.json](isa_gear_warnings.json) carries a `match` block (`gearType`,
  `gearIds`, `gearNames`, `confidence`, `note`) resolving it against the catalogue — 53 exact,
  12 likely, 1 partial, 10 ambiguous. Still nothing to point at:

  *Manufacturer missing:*
  - [ ] **Passion / Passion 18m** (Mountain Equipment) — ISA 40 (recall) + 41, starter kit. The kit
    type exists; Mountain Equipment is not one of our brands. Two warnings resolve at once.

  *Needs a gear type we don't model:*
  - [ ] **Dogbones** — ISA 1 (Krok Хвостик) and 8 (Gibbon lineLock) have no home at all, and a
    further 7 dogbone warnings (2–7, 9) ride on the parent weblock's row rather than the product
    they actually name. Both brands already exist. Adding a `Dogbone` type is the single
    highest-yield gap here: 9 warnings.
  - [ ] **Whoopie** (Raed Slacklines) — ISA 22, sling, still in production. Brand exists, slings
    don't.
  - [ ] **Grigri** (Petzl) — ISA 42, brake, still in production. Neither a brake type nor Petzl as
    a brand; the only entry from outside the slackline industry.

  *Ambiguous matches:* the ISA names one product where we hold several rows (EQB Katana/Katana
  FX, Mithril Pull/Quick Pin, Slacktivity SlackDuck/-DP, Raed TiLock 19/25mm, Petram Aeris/Aeris
  P, lineGrip LineLock AL MK4/VA MKIII, LineGrip Alu G4/G5/nano, Souz Snatch 2.2/2.2T, Spider Lime
  vs Lime SR, Souz Rowan 1.2). Decide per item whether the warning covers the whole family or one
  variant.


- [ ] **"Not for highline" research for the other gear types.** `manufacturer_not_for_highline`
  (+ `_source`) exists on all eight gear models, but the first research pass covered only the 35
  sub-22 kN webbings (Appendix A of the [certification plan](https://github.com/International-Slackline-Association/SlackData/blob/5be24c10402cd1917d83385a9af001c142b622cc/ISA_CERTIFICATION_PLAN.md#appendix-a-the-35-sub-22-kn-webbings-s3-research-list), PR #83). Still to check against each maker's own
  page: weblocks, rollers, leash rings, grips, tree protectors, starter kits, trickline kits. `true`
  only on an explicit statement, `false` when marketed for highlining, `null` when silent or gone.


- [ ] **ISA certificates with no gear row to land on.** Left unmatched, each with a note:
  - **Intermittent Connection** webbing certificates (`approved_gear_16`, `19`, `22`, `25`, `26`) —
    they certify a way of joining webbing, not the webbing, so they never count (the loader refuses
    them even if matched). Revisit only if we ever model connection methods.


- **Manuals we know exist but do not hold.**
  - **A dead link on the maker's own site**: Bera's `certificados/anel_linelock.pdf` 404s as of
    2026-09-09. Slacktivity's redTube manual did too — the manuals index still points at
    `Manual_EN_HighlineWebbing_redTube-A_V1.pdf`, which is gone; the B revision was fetched by hand
    and is what we hold. The rigging recommendation their page also carries is **not** a manual for
    the webbing and is deliberately not shown under a heading that says "Manuals & documents".
  - **Documents whose product we do not carry**, found while crawling and worth revisiting if those
    gear types ever land: Spider/Slack Inov's manuals for the Slackimoufle, Infinity, Spacer, EVO,
    Radix and their bungee and leash (bungees and leashes are unseeded types), and Slacktivity's
    TreeSling and softRelease.
  - **Balance Community links most manuals client-side**, so crawling their HTML found three of the
    five we hold; the rest were confirmed by verified URL. A future sweep of that catalogue needs a
    real browser, not curl.


## Backend

Gear types we want to hold but don't yet, and changes to the models, loaders and API.

- [ ] **Leashes: what the first round left open.**
  - **Manuals** not attached: Slacktivity's leash manual (EN/DE PDFs) and raed's leash manual (held
    on the HALO ring today).
  - **No photo anywhere** for Souz's Leash and Leash PP and Balancing Earth's Highline Leash 9.9mm;
    only two 285 px thumbnails for Slack Inov's Spliced Highline Leash.
  - **Not read** (the Archive was down): raed's 2020 "Highline Leash" (€26.95) and SlackLife BC's
    "Alpine Bounce Leash"; Slack Inov's live shop needs a real browser.
  - **Rings sold with leashes that we do not hold** are named in notes, not linked (out of scope
    for this round): PureLoop, Bera's 60/85 mm freestyle ring, Slackhouse Ring F Alu/Steel,
    SlackLife BC's 22 kN and 44 kN rings, Balancing Earth's steel rings. (SlackTech's were added
    2026-10-17: leash rings 35–37.)


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


- [ ] **When a product was sold: year (and optionally month) of release and of end of production.**
  Today every gear type has one `release_date: int | None`, unix milliseconds, and nothing for when
  production stopped (`active` only says whether it is sold *now*). That is the wrong shape for what
  we actually know. Nobody knows the day a webbing came out, so a millisecond timestamp invents
  precision, and the times in the seeds show it: most fall at 22:00 or 23:00 UTC, which is midnight
  local time for someone typing a date into a form. Some of the values aren't release dates at all.
  **58 of the 81 starter kits carry 2021-05-26**, which looks like the date they were entered
  (SlackDB's), not when they were released. 197 rows have a value (57 webbings, 28 weblocks, 64
  starter kits, 23 tree protectors, …), no leash has one, and the frontend shows it nowhere. It is
  only editable on `/edit` (`DATE_FIELDS` in `catalogue/edits.py` and `utils/fieldDraft.ts`).

  **The shape.** Two partial dates per row, both optional, at whatever precision is known:
  `released` and `discontinued`, each a year with an optional month. Possible encodings
  (UNDECIDED): an ISO-style string `"2019"` / `"2019-04"` (sorts as text, reads in the seed, one
  field each), or separate `*_year` / `*_month` ints (easier to filter, but a month without a year
  has to be refused). Open questions:
  - **Migrating `release_date`.** Keep the year (and month?) of each value, but first decide what
    to do with values that are entry dates rather than release dates (the 2021-05-26 cluster). Drop
    them, or keep them marked unverified?
  - **How it relates to `active`.** If `discontinued` is set, `active` should be `false`. Is
    `active` then derived, or kept and checked against it? A product can be known to be
    discontinued without anyone knowing when.
  - **Frontend.** A "Sold 2016 – 2021" / "Since 2019" line on the detail page, a year-range filter
    or sort on the listing, and the year-month picker on `/edit`.
  - **Sources.** Wayback snapshots of shop pages give "first seen / last seen" bounds, which are
    evidence for a date, not the date itself. Do we record that it is a bound?

  **Why now: this is the first step towards batch-specific data** (the entry below). A batch is
  told apart in the wild mostly by *when* it was made ("produced before April 2020"), and
  `product_group` already gives us the structure: one row per version, each with its own specs,
  grouped on the detail page (`utils/groups.ts`, `VendorTable.tsx`'s `version` column, the webbing
  `Reggae` pair). Once every row carries a production window, a group's rows *are* its batches,
  each dated, and `VendorTable` can show the window per version. That probably makes the child
  table the batch entry below proposes unnecessary. That entry predates `product_group`, and it
  should be revisited with this one.


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
  teaches people to scroll past the badge that is real. **Slacktivity KingPin Weblock** (`weblocks.json` 41,
  also `active: true`) is the same shape.

  **The shape to decide.** Duplicating rows per batch is the one option to rule out up front — an id
  is the catalogue's stable identity (§ Loader pattern), already recorded in ISA match blocks,
  manufacturer credentials, submitted corrections and bookmarked links, and most products have
  exactly one batch anyway. That points at a child table (`WebbingBatch`, FK to `webbing.id`) whose
  columns are **nullable overrides** — null means "same as the parent" — plus whatever identifies
  the batch in the wild: a date range, a serial/lot pattern, a colour run. Open questions:

  - **Which fields are per-batch?** `breaking_strength`, `stretch`, `weight`, `thickness`,
    `isa_warning` are the candidates (certification is per certificate, set from
    `isa_certified.json`, so a batch-scoped one would need the certificate to say which batch).
    `name`, `brand_id`, `width`, `price` almost certainly are not. Getting this list wrong in either direction is what
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
    [compare.ts](frontend/src/utils/compare.ts) all assume one row is one product. A seller-only brand would read
    as **0 items** on the directory for exactly this reason (SlackX did, until it was merged with
    Radrigs). Decide whether a seller's items
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

  **The data already carries the problem**, from before anyone tried to. Nine product names were
  held by two brands each, and at least four pairs are plainly one product twice:
  **EQB / Spider `Bandit SH` and `Bandit SL`** (`weblocks.json` 13+14, 15+16; merged into 13 and
  15 with Spider as seller on 2026-10-07, without a redirect),
  **Landcruising / Aki `Unicorn` and `White Magic`** (`webbings.json` 6+209, 7+210; merged into
  6 and 7 with Aki as seller on 2026-10-05, without a redirect), Slacklife BC's `HighTech`
  (`webbings.json` 137, a mistaken duplicate of the `Lion Line` #144; deleted 2026-10-08, without a
  redirect),
  **Slack.fr / Slack Pro! `Neon Light`** (`webbings.json` 100+154; merged into 100 with Slack Pro!
  as seller on 2026-10-08, without a redirect — the Slack.fr specs were kept, so 154's 33 kN /
  3.8 % @ 10 kN readings are gone), and **Landcruising `Core 2 HS` / Raed
  `TWTMNBN (The Webbing That Must Not Be Named)`** (`webbings.json` 1+263 — Raed's 2019 end-of-stock
  resale under the old slackshop.de nickname, added 2026-10-01; its description links to row 1 via
  the `[text](/path)` internal-link syntax in `utils/description.ts` as a stopgap until merged). The Bandit pair showed what that costs: the ISA
  pushpin warning is matched to weblocks **12, 13, 15 — all EQB** — so the Spider-badged 14 and 16
  were the same hardware displayed with a clean record, until the merge. (The specific Slack Inov ↔ Spider overlap is *not* visible
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


- [ ] **Public, front-facing API so other sites and tools can read the gear database.** Today the
  hosted `GET /api/<type>/` routes exist but are built only for our own SPA: CORS lists localhost
  only (the SPA is same-origin under CloudFront), `/docs` is off in production, pages max out at
  100 items, and nothing is versioned, so any field rename would silently break an outside consumer.

  Decided (2026-10-09):
  - **Anonymous, throttled.** No sign-up and no API keys. Anyone can read, and API Gateway throttles
    each route. Adding a throttled route means touching `RouteSettings` and
    `HttpApiStage.DependsOn` (CLAUDE.md § The API Gateway route/throttle invariant).
  - **A separate, versioned `/v1` surface** with published docs, kept apart from the routes the
    frontend uses so internal changes don't break consumers. It needs open CORS on that prefix only,
    and a contract test that pins its schema.
  - **Scope:** all eight gear types and brands; ISA warnings and certifications; links to gear
    images and manuals; and filtering/search beyond `offset`/`limit` (brand, `active`, spec ranges,
    text).

  UNDECIDED:
  - **Data licence / attribution terms** for reuse (e.g. ODbL vs CC BY 4.0).
  - **Republishing the ISA data**: warnings and certificates are the ISA's, so their terms likely
    need ISA sign-off before `/v1` serves them.
  - **Images and manuals**: rights belong to manufacturers, and hotlinking costs bandwidth. Do we
    serve links only, or ask consumers to cache?
  - **Response shape**: the `Public` models as-is, or a curated DTO (e.g. units in field names, such
    as webbing `price` being per metre).

## Infrastructure / deploy

Carried over from LAUNCH_RUNBOOK.md and PHASE4_SHIP_PLAN.md when both were removed (2026-10-04).

- [ ] **Rebalance the Cypress shards — CI went from under 8 min to over 15.** On PR #104 the
  `search` shard alone took 14 min (`search_sort.cy.ts` 5 min, `isa_certification.cy.ts` 7 min,
  much of it 5 s retry timeouts per gear type), while the whole suite used to finish in < 8 min.
  `frontend/cypress/shards.json` packs by durations measured before leashes and connectors were
  added, and the per-gear-type specs grow with every new type. Re-measure and repack (or let a
  script refresh the durations from CI timings), add a shard if needed, and look at trimming the
  per-type loops in the slowest specs.

- [ ] **Serverless Framework v3 → v4, and who runs deploys.** Pinned to v3 so launch did not wait
  on deciding who owns a Serverless account; v3 is EOL and gets no security updates. The same
  answer decides both: whether we deploy into the ISA's account or they deploy from this config,
  and whose account the Serverless org lives under (it should be ISA-owned, not personal).
  Migration itself is a version bump and one env var — infra/README.md § Serverless Framework
  version + account.
- [ ] **Budget alarm.** Needs an ISA admin: `budgets:*` and `ce:*` are denied to our permission
  set. Suggested: a $20/month `COST` budget named `slackdata`.
- [ ] **Delete the orphaned Cognito pool `eu-central-1_kIHciXdAG`** — left over from the failed
  2026-08-25 deploy (the stack-managed admin pool is `eu-central-1_Fzl6ssZOQ`). Check first whether
  it is already gone.
- [ ] **ISA sign-off on the manufacturer onboarding policy** (infra/README.md § Onboarding policy)
  from whoever holds the ISA's slackdata mailbox. Three brands have been onboarded under it since
  2026-08-28; check whether this was given and record it.
- [ ] **No Cypress coverage of the triage UI's manufacturer path**: batch grouping, the manufacturer
  badge, the SKU and rejecting an already-approved row. The grouping logic is unit-tested only.

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

- **Leashes as a gear type** (shipped 2026-10-17: model, router, the Leashes tab, 42 rows from 18
  brands with 103 photos, and the four ISA:37 certificates matched — `approved_gear_4`, `10`, `11`,
  `32`, 10 rows). The research, the decisions and every source are in LEASHES_REVIEW.md.

- **Connectors as a gear type** (shipped 2026-10-11/12: model, loader, router, 120 seeded rows with
  photos and manuals, the Connectors tab, generic parts grouped by `product_group`; see CLAUDE.md §
  Connectors). The record of how it was scoped follows. Before it, we held no connectors: shackles
  only turned up as kit contents, or under "not a gear type we have" in the archive passes. The
  category (operator, 2026-10-11):
  - **aluminium shackles**: one historic, two current. One is Slacktivity's **KingPin**, see below.
    The historic one is Landcruising's **AirBow** (about 2015). It appears only as a prototype and is
    not in Landcruising's 2016 shop (CONNECTORS_REVIEW.md, Q8).
  - **stainless steel shackles**: a dozen or so kinds, in different qualities.
  - **slackline-specific (steel) carabiners**.
  - **soft shackles** (Dyneema): BC 4/5/6 mm, Spider's, raed's.

  **Two aluminium push-pin shackles recorded so far, besides the KingPin** (2026-10-11):
  - **Balance Community Slackle**, current, a pre-order in October 2026 (US$45, "ships mid October")
    (<https://www.balancecommunity.com/products/slackle>). It weighs 128 g, with an MBS of
    60 kN straight pull and 30 kN side pull, and a 12 kN WLL. Body: CNC-machined 7075-T6. Quick pin:
    17-4PH stainless, 12 mm × 77.4 mm, fully round and free-spinning, with a 2024 alloy handle and
    a 440C ball. The jaw is 26.2 mm. Inside it is 40 × 51 mm, outside 62 × 86 mm, and the eye is
    30 mm. One side arm has a parking spot that holds the pin captive during rigging (flip the
    shackle to use it from the other side). The jaw is sized for BC's MightyLock, 1" and 20 mm sewn
    loops, AWL 6-series weblocks and the soft release, and the bow takes several strands of Spanni or
    9 mm rope. The page names no ISA or EN standard.
  - **Cong Gear Falcon** (隼), current. The only source is a Facebook post
    (<https://www.facebook.com/rio.zhang/posts/pfbid02vrPSanZDPLWUGE2pVsuMaN6CyXcaG8bYkjvYMmmzXGBoJyndAnyhyhncuy6RXKTtl>, sent
    by the operator; a plain fetch gets nothing but the login wall). The spec photo gives
    144 g, MBS 60 kN and WLL 8 kN, and the same MBS and WLL are engraved on the body. Outside it
    is 79 mm tall × 82 mm wide (the 82 mm is measured across the pin, head included). Inside it
    is 44.8 mm tall × 38 mm wide, and the jaw is 26 mm. It has an aluminium body (alloy not
    stated), anodised black, red or blue, and a stainless push pin with a black button head,
    a red collar and a cord lanyard. "FALCON", "DESIGNED BY CONG GEAR" and the Cong Gear mark
    are engraved on it. No price, standard or product page is known. The six photos the
    operator sent are filed as `connectors/cong_falcon*.jpg`.

  **ISA standard: ISA:52, "Highline Connector".** It is the standard behind
  `approved_gear_27` in `isa_certified.json`, the only connector certificate so far: Slacktivity
  KingPin, ISA:52, tested 2023 by Siebert Consulting, Vienna. Slacktivity's page says it is
  "Compliant with ISA52 Highline Connector Standard" and also with EN362:2005 (M-type connector).
  It gives 107 g, a 48 kN MBS lengthwise and 28 kN across, an 8 kN WLL, an AL7075 body and a
  17-4PH stainless 11.2 mm PushPin
  (<https://slacktivity.com/shop/kingpin-aluminium-shackle/>). We have **not seen the text of
  ISA:52**. The ISA's [gear standards page](https://www.slacklineinternational.org/isa-gear-standards/)
  lists only ISA:21 (Highline System, 2023, free PDF), :37 Leash, :41 Webbing, :51 Webbing Locker
  and :61 Webbing Grab. The paid standards are sold through
  <https://data.slacklineinternational.org/safety/gear-standards/>. ISA:21 (2023) also allows
  industrial and climbing equipment, used properly and backed up separately, so EN362 / EN12275
  ratings matter as much as ISA:52 for most shackles and carabiners. To do: get ISA:52 (and check
  whether it covers soft shackles), read ISA:21's connector section, and read the ISA publication
  <https://data.slacklineinternational.org/publications/highline/connectors/> (JS-rendered, so
  a plain fetch gets only the menus).

  **Decisions (operator, 2026-10-11):**
  - **One `Connector` type**, soft shackles included. Form and material are separate axes, each
    with its own filter group:
    - `connector_style`: Shackle / Carabiner / Quicklink / Soft shackle (4 forms). Push-pin vs
      screw-pin is carried by `closure`, not by the style.
    - `closure`: one enum across all forms. Screw pin / bolt + nut / push pin / screwgate /
      twist-lock / triple-lock / quicklink sleeve / knot.
    - `material`: a new `ConnectorMaterial` enum in `models/connectors.py`, with values
      Aluminum / Steel / Stainless Steel / Titanium / Dyneema / Other. `MetalMaterial` stays
      untouched. An optional free-text `alloy` holds grades such as 7075-T6 or 17-4PH.
  - **Strengths, kN, nullable:** `mbs_straight_pull`, `mbs_crossload`, `mbs_gate_open`
    (carabiners). **No WLL field.** A shackle that states only a WLL gets it in `notes` ("WLL
    1.5 t, no MBS published"). MBS is never derived from WLL.
  - **Dimensions, mm, nullable:** `opening`, one field for every style. For a shackle it is the jaw
    width. For a carabiner or quicklink it is the gate opening. For a soft shackle it is the inner
    size of the closed loop as the maker states it, with `notes` saying how it was measured when the
    maker words it differently. This replaces the earlier `jaw_width` + soft-shackle `length`. Also
    `pin_diameter`, `rope_diameter` (soft shackles) and `weight`. No inner/outer sizes.
  - **Strength stated in tonnes** ("6-ton breaking strength", "Bruchlast 6,000 kg") is converted to
    kN (× 9.81) as the MBS, with the original wording kept in `notes`. A **proof load** ("tested to
    1500 kg") is not an MBS and goes in `notes` only.
  - **Which rows:** connectors the brand designed or makes itself, plus generic stock hardware
    **only where the shop publishes an MBS**. **One row per size** ("Twisted Shackle 12mm").
  - **Named industrial makers become brands, with the shops as `gear_sellers`:** Van Beest / Green
    Pin (already an entry). This includes BC's two Van Beest shackles. Peguet (Maillon Rapide) was
    one too until 2026-10-12, when the operator reversed it: its quicklinks are now generic stock
    hardware, one row per shop, and its `manufacturers.json` entry is gone. Kong, Petzl, Singing Rock, Climbing Technology, Edelrid,
    Petersen and Wichard stay out.
  - **Out:** rigging plates, rings, swivels, sewn textile links and rope-pulley carabiners.
  - **Generic stock hardware is grouped, not merged** (operator, 2026-10-11). One row per shop
    listing, each with that shop's specs, price and link. Rows naming the same part (shape + size
    + material) share `product_group`; a captive pin is the `captive_pin` flag, not a split. The listing shows a group as one card (spec
    ranges, "from" price, the shops as the brand line, linking to the first member). A member's
    page shows the part: only the specs all shops agree on, then a vendor table with every shop,
    historic ones marked. Only parts at least two shops sell are grouped. Van Beest stays its own
    products. Climbing makers' carabiners (CAMP, Climbing Technology) are out.
  - **The Landcruising AirBow** is included with `active: false`. It was first taken for a
    prototype that was never sold; the production shackle turned up (serial-numbered, on
    Landcruising's archived shop), so the row holds its engraved figures: 70 kN along, 38 kN
    across, WLL 8 kN.
  - **Standards:** `standards: list[str]` holds what the maker claims (e.g. `["EN362:2005",
    "ISA:52"]`), plus `standards_source`. ISA certification stays derived from
    `isa_certified.json`, never from this list.
  - **Scope:** all four forms. **Brand rule:** connectors a slackline brand sells under its own
    name (the retailer rule), plus the Van Beest exception below. No climbing makers (DMM,
    Petzl), no "Unbranded" placeholder.
  - **ISA warning #65** (KingPin shackle pin) lands on **both** the connector row (exact) and
    weblock 41 (which ships with the same pin). A match block holds one `gearType`, so this needs
    either two entries or multi-type matching in `load_isa_warnings.py`.
  - **Nav:** the Connectors tab goes after Tree Protectors, before the kits.
  - **Data:** Claude researches the slackline brands' shops (plus Wayback for historic items) and
    brings back a sourced candidate list for operator review before anything enters
    `connectors.json`.
  - ~~Whether the KingPin moves off weblock 41.~~ Settled 2026-10-11 (operator): weblock 41 is the
    **KingPin Weblock**, the shackle plus a weblock piece, and stays a weblock. The bare KingPin
    shackle becomes a new connector row, and `approved_gear_27` matches that row.

  The full new-gear-type checklist was followed, and connector became the sixth certifiable type
  (`isa_certified` / `isa_certificate` on the model; `load_isa_certifications.py` lands
  `Connector` certificates on it).

- **Slacktivity KingPin certificate matched** — `approved_gear_27`, ISA:52 Connector, certifies the
  KingPin *shackle*, which is now connector 1. Weblock 41 is the **KingPin Weblock** (the shackle
  plus an extra piece, renamed from "KingPin" on 2026-10-11, operator), a different product, so
  the certificate lands on the connector, not the weblock.
- **Raed's webbing manual held** (vers. 2.4 / 2024-12), fetched by hand: their Cloudflare answers
  this network 429 for every automated request, browser headers included, so anything further
  from raed-slacklines.com has to be downloaded in a real browser. Their highline leash-system
  manual came in the same way and sits on the **Halo** leash ring, the one product of the three it
  documents (HALO ring / PRO leash / ALPINE leash) that we carry.
- **ISA-warned gear added or sourced** (2026-09-02 onward), from the "Add the gear items the ISA
  warnings point at" entry under Data:
  - **SladLock Light** (slack.fr) — ISA 82, added as weblock 131 from the archived shop page;
    weblock 96 SladLock Power stays a separate product with its own warning (ISA 12).
  - **RigLock** (Raed Slacklines) — ISA 80, added as weblock 130 from the archived maker page,
    `active: false` (Raed's current line is the TiLock and the RODEO).
  - **Slacktivity Hangover 1.0** (roller 22, ISA 45) — no longer a stub: specs, price (55 EUR)
    and two photos from Slacktivity's
    [HangOver Color-Edition](https://slacktivity.com/shop/hangover-color-edition/) page, which
    still sells V1.0 beside V2.0, so `active: true` despite the 2019 ISA entry's
    `inProduction: "No"`. Aluminium body, steel bearings, per the operator (same for Hangover
    2.0, roller 2).
  - **Slack Inov BoomBoom** (webbing 246, ISA 78) — no longer a stub: 25 mm tubular nylon,
    52 g/m, 27 kN, a full 1–20 kN stretch curve, the Spider Slacklines co-listing. Price and
    product URL still unknown; `active: false`.

- **The webbing loader no longer drops `notes`** (2026-10-11). `add_webbings_to_db()` never
  passed `notes` (nor `version`) to `WebbingCreate`, so every webbing seed's notes were silently
  discarded at seed time, including the merge records on Wave Tube 19 #118 and Verve Red #151 and
  the provenance of #265–#268. The roller and grip loaders dropped both fields too, and the leash
  ring loader dropped `version` (no seed used them there yet). `test_loader_carries_notes_and_version`
  in `tests/test_active.py` now pins all eight loaders; 80 webbings serve their notes after a re-seed.

- **Slacktivity archive pass applied** (2026-10-08), from every Wayback capture of slacktivity.com,
  .ch, .de and .at and the live shops. Each new row links the live page, with the Wayback capture
  in its notes.
  - **Super Jumpline**, webbing **#269**: 37 mm, 36 kN, 5 % at 10 kN, 64 g/m, 2.98 €/m. The
    fibre and the construction are not stated anywhere, so both are null. It is the webbing in
    the held Super Jumpline set (tricklinekit #5).
  - **Allround Light INOX | 15m**, starter kit **#71**: 15 m × 37 mm, a stainless ratchet,
    V-Loops, no slings or tree protectors (made for posts and wall mounts), 99 €.
  - **Experience Light INOX | 30m**, starter kit **#72**: 30 m × 37 mm Experience webbing and
    two stainless ratchets, no slings, 159 € (DE, so no description).
  - **Low stretch Webbing #157 merged into PRO #223** (2026-10-08): one webbing, 37 mm PES,
    3 % at 10 kN, 64 g/m, sold as "Low stretch 37 mm" (2017), "lowStretch" / "PRO 50m–100m"
    (2019–21), PRO, and on slacktivity.ch as **Playline**. #157's photo was a thumbnail of #223's
    and was dropped; `/webbing/157` now 404s. #223's notes record the names. The name
    stays **PRO**, not "PRO / Playline" (operator, 2026-10-11):
    <https://slacktivity.ch/shop/playline-slacklineband/>
  - **Slacktivity recorded as a seller** (2026-10-08) of Slack Pro! LineGrip Alu G4 (grip #1),
    LineGrip G5 (#6) and HighlineGrip G2 (#9), and of Souz Snatch 2.2 (#2). Each was on
    Slacktivity's own shop.
  - **#10 and #12 re-checked against the live pages** (2026-10-08). They are different
    products, and both had the wrong photo.
    - #10 is now named **TreeProtection Set**, as the shop does (it was "Slackline Tree
      Protection Set"): all felt, grey, 240 × 16 cm × 5 mm, 340 g, 40 € a set. Its old photo
      showed the white-edged TreeProtector 3.0 and was replaced with the live one.
    - #12 **Tree Protection | 3L**: felt front, polyester back, three 8 cm loops, 240 × 13.5 cm ×
      3 mm, 332 g, 23 € single. It now has both live photos.
    - <https://slacktivity.com/shop/treeprotection-set/>,
      <https://slacktivity.com/shop/tree-protection-3l/>
  - **#11 split into TreeProtector 2.0 and 3.0** (2026-10-08). The old row "TreeProtection
    Set | V2" had the 2.0's name and photo, the 3.0's specs, and #10's URL and description.
    Slacktivity's own comparison photo shows both generations
    (<https://slacktivity.ch/wp-content/uploads/2021/02/slackline-baumschutz-vergleich.jpg>).
    - **#11 TreeProtector 2.0** is historic: SKU TREE / TREE-2, about 2013–19, an all-brown felt
      roll, 240 × 12.5 cm × 3 mm, 0.5 l, 340 g, 29.95 € a pair. Photos: its old one, plus
      slacktivity.de's, which still lists it at 15 €.
    - **#32 TreeProtector 3.0** is new, and **inactive**: SKU TREE-3, from November 2019, felt
      with a white polyester edge, 240 × 13.5 cm × 3 mm, 1.0 l, 315 g, 23 CHF single. It links
      the live .ch page and has that page's five photos. The page still lists it, but on
      2026-10-08 it showed "Nicht vorrätig" (schema.org OutOfStock), so `active` is false.
    - **What changed** between them, in the maker's words: the 3.0 has a smaller pack size, is
      widened to 13.5 cm and is lighter. The stated volume went up (0.5 → 1.0 l) despite that.
    - slacktivity.com's 2021 "3.0" page repeated the 2.0's 12.5 cm / 340 g, so its specs were
      not used.
  - **#12 3L and #32 3.0 stay separate rows** (operator, 2026-10-08). They have the same body
    (240 × 13.5 cm × 3 mm), but the 3L adds three 8 cm sling loops: SKU TREE-3L against TREE-3,
    332 g against 315 g. Slacktivity has listed them side by side since at least 2021 (the old
    .com shop's "TreeProtection-Set 3.0", TREE-3-2x, and "TreeProtection 3L SET", TREE-3L-1).
    They relate as Allround Light does to Allround. Folding #32 into #12, with loops as an
    option, was offered and not taken.

- **Raed Slacklines archive pass applied** (2026-10-08), from every Wayback capture of
  raed-slacklines.com: the Magento 1 shop (2018–19), the Magento 2 shop (2020–25), its category
  pages year by year, and the German `/de/` pages. The archive holds nothing before 2018 (raed.de,
  captured in 2011, is the climbing business). The live Shopify shop on raed-sports.com was read
  through its `products.json` as a cross-check, and is where the photos of products still sold
  come from. We already held 25 Raed rows, and every Raed webbing in the archive turned out to be
  one of them. Products still sold link the live page, with the Wayback capture in their notes.
  Only the Felt TreeProtection is held back (open, § Data).
  - **Weblocks**
    - **BLNC Weblock**, weblock **#142**: steel, hollow aluminium diverter, one PushPin plus big
      shackle holes, 284 g, 50 kN (2019) / 62 kN (2021), WLL 10 kN on its label, 89.95 €,
      2019–21. The RigLock #130 replaced it:
      <https://web.archive.org/web/20211126224802/https://raed-slacklines.com/blnc-weblock>
    - **RODEO Steel Weblock**, its own row, weblock **#143**. #73 was renamed **RODEO Ultralight
      Weblock**, and its photos re-keyed to `raed_rodeo-ultralight-weblock`. The steel one weighed
      114 g / 9 kN at its launch (preorders Dec 2017), and 136 g / 13 kN after the June 2019
      redesign, which Raed's blog marked "prohibited for tricklining and highlining". The same URL
      describes the aluminium #73 from 2021-07 on:
      <https://web.archive.org/web/20210117055054/https://raed-slacklines.com/rodeo-weblock>
    - **PRO Weblock X-Link**, weblock **#144**: a version of the PRO Weblock #65 with the pulley
      system's X-Link, which takes a Dyneema whoopie directly with no shackle. 389 g, 109 €, 2019.
      Its own page gives no material, WLL, pin types, width, diverter or usage, so those are #65's.
      MBS is #65's 62 kN, though its own page said 75 kN:
      <https://web.archive.org/web/20191120052510/https://raed-slacklines.com/pro-weblock-x-link>
  - **Starter kits #74–#81.** Rodeoline Beginner, Yoga, Ninja and Parkline Comfort lead with a
    composite of their components' own photos, followed by the kit's own photos. The felt tree
    protection is missing from these composites because no photo of it exists. Ninja's composite
    shows shackles, as its text says, though the 2025 configurator gave carabiners. FUN Kit #33,
    Helium, Ultralight Travel, HUMBOLDT and Travel Set keep their own photos, which already show
    every piece.
    - **Travel Slackline Set 20 m** (#74): 25 m MOTM, aluminium carabiners, D-ring linelockers,
      slings, tree protectors, 2100 g, 139.95 €, 2018–19:
      <https://web.archive.org/web/20191120052521/https://raed-slacklines.com/travel-slackline-set-20m>
    - **Helium Set** (#75): 20 m Helium, Dyneema whoopies, aluminium carabiners, 1370 g, 179 €,
      2018–19:
      <https://web.archive.org/web/20191120052504/https://raed-slacklines.com/helium-ultralight-set>
    - **Ultralight Travel Slackline Set** (#76): 20 m MOTM light (19 mm), 6 mm quicklinks, Helium
      slings, 1090 g, 106.67 €, 2020–21, no tree protection:
      <https://web.archive.org/web/20210926134532/https://raed-slacklines.com/ultralight-travel-slackline-set>
    - **HUMBOLDT – Ultralight Travel Slackline Set** (#77): Eclipse webbing, RODEO weblock, Eclipse
      soft release, felt patches, 780 g. It was a 15 m kit in the archive (129.22 €) and is 20 m on
      the live shop (130 €). `manufacturer_not_for_highline` is set from the page's "RODEO may
      never be used in highlines":
      <https://raed-sports.com/products/humboldt-ultralight-travel-slackline-set>
    - **Parkline Comfort Set** (#78): 30 m Rainbow, RODEO weblock, soft release, soft shackles,
      felt tree protection, 180 €, 2023–:
      <https://raed-sports.com/products/parkline-comfort-set>
    - **Yoga Slackline Set** (#79): 25 m MOTM, carabiners, D-rings, felt tree protection, 140 €,
      2020–: <https://raed-sports.com/products/yoga-slackline-set>
    - **Ninja Slackline Set** (#80): 30 m Rainbow (Cumulus in 2020), shackles, D-rings, felt
      tree protection, 139 €, 2020–. Filed as a starter kit, where Raed files it, though it is
      pitched at "your first tricks":
      <https://raed-sports.com/products/ninja-slackline-set>
    - **Rodeoline Beginner Set** (#81): 25 m Helium, RODEO weblock, 2 slings, 2 carabiners, 130 €,
      2020–. It has no tensioning system (`Other`):
      <https://raed-sports.com/products/rodeoline-beginner-set>
  - **Loose ends on rows we hold**
    - **RODEO Ultralight #73's `date_introduced`** is now Jul 2021: the page shows it on
      2021-07-25, and Raed's blog announced it on 2021-08-14. The Dec 2017 date it used to carry was
      the steel one's launch, which #143 now carries.
    - **PRO Weblock #65 is now 62 kN**, Raed's own figure from 2021 on (75 kN in 2019). SlackDB
      had 100 kN.
    - **Dyneemite PRO #229 now links its last Wayback capture.** Its price is still unset,
      though Raed sold it new until at least 2025-09 (3.79 €/m in 2022, 3.99 €/m in 2025):
      <https://web.archive.org/web/20250916235734/https://raed-slacklines.com/dyneemite-pro-ultralight-highline-project-webbing>
    - **SuperMOTM #158 now links its Wayback capture**:
      <https://web.archive.org/web/20190718073229/https://raed-slacklines.com/supermotm-threaded-tubular-nylon-slackline-webbing>.
      No page for **#FFF #153** turned up under any slug.
    - **Raed recorded as a seller** of LineGrip G5 #6, next to Slacktivity.
  - **Looked at and not imported**
    - **Longline kits**, which fit no gear type we have (as with Landcruising and Slacktivity). They
      come with pulley systems: **Beginner Longline Set** (BLNC 5:1, BLNC weblock, 50 m Parsec,
      2019–, out of stock now), **Advanced Longline Set** (BLNC 9:1, TiLock, 2020–), **PRO
      Longline Set** (formerly "PRO Longline-Set Alpha", PRO 9:1, PRO weblock, TreePRO, 2019–21)
      and **Ultralight Longline Set** (PRO 5:1, Helium, 2020). The details, prices and photos for
      all four were gathered before they were dropped and can be restored.
    - **Variants and renames of held rows**: Fun Slackline Set 20 m (2019) is the FUN Kit #33.
      "PRO weblock \*\*\* new \*\*\*" and `pro-highline-weblock` are #65. The TiLock Titanium
      Alpine Highline Weblock is the TiLock rows. Dyneemite PRO 19mm is #229. Cumulus pure, MOTM
      light pure and Helium incl. loop are #60, #186 and #59. Rainbow rest pieces and every
      "used" or "B-Ware" listing are also covered by held rows.
    - **Not a gear type we have**: the PRO, BLNC and TiPS pulley systems (5:1 and 9:1) and their
      multipliers. Also the RopeGrabber, which grabs pulley rope, not webbing. Also rigging plates,
      Eclipse and Helium soft releases, anchor slings (RED, Helium, Parsec, Ultra, Dyneema
      whoopies), soft shackles, the PRO and ALPINE leashes and leash sets, TrickZone sleeves,
      highline freestyle and split setups (assemblies of held webbings), PushPins, sewing and
      testing services, and the ZAED climbing devices.
    - **Rodeoline Set** (live shop only): an empty bundle placeholder with no content.
    - **Made by someone else and resold by Raed**: the Seasure D-Ring linelocker, Kong and Maillon
      Rapide quicklinks, Omega shackles, Gleistein, Teufelberger and Skylotec ropes, Edelrid, and
      Spanset. (LineGrip G5 is held, and lists Raed as a seller.)

- **Elephant Slacklines archive pass applied** (2026-10-08), from the Wayback copies of
  elephant-slacklines.com and the live (sold-out) Shopify store.
  - **Wing 3.5** (webbing #108) — maker blurb and archive link from the 2012 English page;
    €1.60/m and 54 g/m from the 2015 meter-ware page (cited in `notes`). Specs already matched
    (35 mm, 30 kN, 5.9 % at 7.5 kN). First photos: a coil shot (main), the 25 m set with the two
    treeskins painted out onto the white background (a crop would have cut the ratchet), and the
    archived coil on white.
  - **Passion Red** (webbing #25) — price changed from 3 CAD to Elephant's own €2.20/m, plus an
    archive link to the meter-ware page. Specs matched (polyamide, 3.6 mm, 33 kN, 69 g/m, 11 % at
    7.5 kN, 15 % at 15 kN). Only German text exists, so no description.
  - **flash'line** (webbing #106) — breaking strength filled in (45 kN), €2.30/m (was €2.35), link
    moved from the homepage to the archived meter-ware page. 86 g/m and 2 % at 7.5 kN matched (other
    Elephant pages say 2 % at 7 kN). Second photo: the pink and yellow rolls.
  - **blueWing** (webbing #24) — three photos added (coil on white, 200 m spool, rigged line from
    the live shop); the conflicting stretch figures recorded in `notes` (still open above). Live
    link and blurb kept.
  - **EcoLine** (webbing #107) — three in-use photos from the live shop (scaled to 1200 px). Specs,
    price (€1.95/m) and live link all matched. The shop's 1000 px product shot is the same photo as
    ours with more white around it, so ours stays the main image.
  - **T-Rig** (weblock #100) — maker blurb and archive link from the 2017 English page; two
    photos on white. Specs and €95 matched. The 2019 shop's "Line lock" is the same product renamed,
    not a second weblock.
  - **on'sight** (starter kit #73) — new row. 25 m × 25 mm, single long-arm ratchet, slings,
    shackles and tree'skins; the 15 m version and the webbing's specs (light blue, 30 kN, 3.6 % at
    7 kN, 7.2 % at 15 kN) are in `notes`. blueWing's predecessor. German page only, so no
    description; the only photo is the boxed set at 300 px. It was briefly webbing #270, never
    committed.
  - Checked, left alone: **Treeskin** (tree protector #23) is 1.5 m × 14 cm, as held. Elephant
    priced it at €8.75 (2015) against the €9.68 we hold from a shop, whose live link still works.

- **Landcruising and Aki archive passes: 16 products imported** (2026-10-07/08), each with an
  archive link, the specs from the maker's page and its photos; English blurbs only where an
  English capture exists. Webbings Nova Magic 25 #265, White Magic 35mm #266, Sonic (1st gen)
  #267, Soma #268 (Aki); weblocks Lockman #139 (not for highline, per its filed German manual
  rev 1.1), Lockman 2.0 #140, Puma 32 #141 (the Puma 26/35/50 sizes, available on request, are in
  its notes rather than rows); starter kits Starter Flex #67, Starter Aerial #68, StarterPlus #69,
  Cruiser #70; tree protectors TreePlus 2.0 #27, TreeBuddies #28, and Aki Tree Protection Small
  #29, Medium #30, XL #31 (photos from Aki's still-live Shopify CDN). Decided not to import: Aki's
  **Starter 35** (the 35 mm line from its Starter kits, not a webbing in its own right), Aki's
  **Polar B-quality** (seconds of Polar #177) and **Tree Protection Large** (the XL #31 under an
  older name), which are not separate products, and gear
  that fits no type we have — Landcruising's longline kits (Conveyor, Ronin, Sensei 1–3, Ninja);
  Aki's T-Leash Cobra, sewn loops, T-Loop backup split, Backup Extenders, Soft Release Light, Soft
  Thimble, slings, Zentube bushings and the third-party gear it resold.
- **Merges, without redirects** (old ids 404, as 209/210 do). **Wave Tape 19 #117 → Wave Tube 19
  #118** (2026-10-07): one product in two colours; where they disagreed (flat vs tubular, 18 vs
  17 kN, 38 vs 36 g/m) #118's Wayback page won, and #117's red photo is #118's second. **Verve
  #151 → "Verve Red"** (2026-10-08), folding in the staged red Verve: the red page's specs won
  (31 kN, 7 % at 10 kN, 58 g/m, 1.49 €/m); the 2014 "shiny yellow" page #151 used to cite is in its
  notes. **Aki Lockman 2** was never kept as a row: it is Landcruising's Lockman 2.0 #140.
- **Aki's webbing manual applied** (2026-10-12; Rev. 1.9, 2021, the range-wide Aki webbing
  manual). Its spec table filled the Aki-made rows with no recorded source: Sonic 2 #5 weight
  68 → 69 g/m, Polar #177 MBS 28 → 27 kN, Purple Gold #202 65.5 → 66 g/m, Nomad #203 4 → 4.5 % at
  10 kN. Rows sourced from a maker page or made by Landcruising (White Magic #6, Wizard #8, Wave
  Tube 19 #118, Anima #252, Soma #268, Wave Tube 32 #115) kept their figures, with the manual's in
  their notes. Then, on the operator's rule, **MBS defaults to the sewn end loop's where that is
  lower**: Anima 30 → 28, Nomad 23.5 → 20, Polar 27 → 26, Purple Gold 30.5 → 25, Soma 32.5 → 27,
  Sonic 2 34 → 32, Sonic Light 27 → 26, Wave Tube #116 21 → 20, White Magic 32.5 → 29, Wizard
  33 → 32 kN; each row's notes keep the webbing's own figure. The manual's WLLs have no column and
  are in the notes. Aki's manual now also shows on every webbing Aki sells
  (`config/sellerManuals.ts`, DESIGN.md § Range-wide manuals), and Mango, known only from the
  manual, is under § Staged, waiting for a photo.
- **Manuals for Puma 32 #141, Lockman 2.0 #140 and Soma #268** (2026-10-12), all from the Wayback
  copies of Aki's shop (`aki-slacklines.de/media/pdf/`). Puma 32: Landcruising's "Puma 1" product
  archive, whose second page is the Puma 32 manual Rev. 1.0 (filed as *Product archive*; the
  link on Landcruising's own page was never archived). Lockman 2.0: Aki's German manual Rev. 1.2
  (*German user manual*); Landcruising's English `lockman2-manual-rev1.1-eng-web.pdf` was never
  archived. Soma: Aki's English webbing manual Rev. 1.9, filed range-wide as
  `webbings/brand/aki-webbing-manual.pdf`, so it reaches every Aki-branded webbing. Aki's
  `media/pdf/` capture also holds Landcruising product archives (Core 1, Core 2 HS/LS, Lynx 1–3,
  Zilla 1–2, Lockman 1, Verve 25, Unicorn) not checked against what we already hold.
- **Verve 35mm #113 is not co-listed with Aki** (2026-10-12): no Verve 35mm was found in the
  Wayback copies of Aki's shops, so Aki is not recorded as a seller. The old shop's "Landcruising
  Slackline 35mm 18m" was the only candidate and is not taken as a match.
- **Aloha/Tidal #164 relinked** (2026-10-12) from the live, password-locked Aki shop to the
  Wayback copy of Aki's Aloha rodeoline set page (2023-03-30), on the operator's word that it is the
  best link we have. It is a kit page, not a webbing page: no capture of a Tidal page exists, and
  no Landcruising "Aloha" webbing page was found.
- **Matrix Outer #115 and Wave Tube 32 #152 merged** (2026-10-12) into #115, "Wave Tube 32 (Matrix
  Outer)": one Landcruising webbing, sold by Landcruising as Matrix Outer and later by Aki as Wave
  Tube 32 (Aki stays a seller). 32 mm, 58 g/m, 27 kN on the operator's word; thickness left unset
  (Aki's 2.3 mm and 55 g/m are in its notes). Stretch keeps both readings (14 % at 9 kN
  Landcruising, 16 % at 10 kN Aki); price, link and description are Landcruising's. Photos moved
  onto `landcruise_wave-tube-32-matrix-outer` (Aki's 600 × 442 first, the two shop thumbnails as
  `-2`/`-3`). Id 152 no longer exists, with no redirect.
- **Unicorn #7 highline status left null on purpose** (2026-10-12): Landcruising markets it for
  highlines ("whether Highline, Longline or Waterline") but also says they "officially do not sell
  slacklines for use in highlines", so neither true nor false is the maker's statement.
- **Webbing #152 corrected to Aki's Wave Tube 32**: it was recorded as polyester, 25.4 mm,
  58 g/m, 1.95 €/m, with no link. It now has the specs from Aki's page (German, Wayback
  2024-05-28): PA tubular, 32 mm, 2.3 mm, 27 kN, 16 % at 10 kN, 55 g/m, 2.00 €/m, orange / light
  blue, linked to that capture. The 5.4 kN WLL and Aki's caveats about it are in its notes. Aki's
  page is the product link because the archive holds no Landcruising page for it (searched
  2026-10-11; the 2018 category captures recorded a 503).
- **Archive links for four rows that linked the password-locked Aki shop** (2026-10-11). Each
  capture was checked to show the product page, not the password page. Polar #177 →
  Shopify-era `/en/products/aki-polar-slackline-webbing` (2025-03-25); Purple Gold #202 →
  `/en/products/aki-purple-gold-slacklineband` (2025-04-17); Lynx 5 weblock #53 →
  `/en/products/aki-lynx-5-slackline-webbing-locker` (2024-09-19, both its URL fields); Nomad
  #203 → the old shop's German page `/de/slacklineband/polyester/187/aki-nomad-slacklineband`
  (2021-09-28). Nomad *was* archived after all, but only under its German path.
- **Aki's fuller specs applied to Wave Tube #116 and Wave Tube 19 #118** (2026-10-11), from Aki's
  German pages: breaking strength 20 → 21 kN and 17 → 17.5 kN, plus a 10 kN stretch point on each
  (17 % and 18 %) beside Landcruising's original one. There is no column for WLL (4 / 3.5 kN) or
  #118's PU coating, so those, the source links and Aki's prices (1.80 / 1.45 €/m) are in each
  row's notes. `priceMeter` stays Landcruising's own, since a co-listing stores no seller price.
- **Aki recorded as a seller** (`gear_sellers`) on nine Landcruising products: White Magic #6,
  Unicorn #7, Wizard #8 (on the operator's word), Wave Tube #116, Wave Tube 19 #118, Verve Red #151,
  Wave Tube 32 #152, Aloha/Tidal #164 and Lockman 2.0 #140. Aki's founder founded and ran
  Landcruising (2008–2018). The duplicate Aki rows White Magic #209 and Unicorn #210 were merged
  into #6 and #7 (2026-10-05); Aki's own prices had nowhere to go, since a co-listing stores none.
- **Photos for rows that had none or few**: Wizard #8 and Puma 2.0 #66 (supplied by the operator),
  Matrix Outer #115 (two shop thumbnails).
