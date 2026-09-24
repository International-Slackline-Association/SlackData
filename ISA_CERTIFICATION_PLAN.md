# ISA Certification Overhaul: Master Plan

> **Status (2026-09-24): S0–S6 all implemented (uncommitted); S3 and S6 notes are in their own sections. S2: certification is loader-derived from `isa_certified.json` (17 rows, 22 certificate rows), `classification` is removed, and the webbing thresholds were confirmed as A+ ≥ 40 / A ≥ 30 / B ≥ 26 / C ≥ 22. S4 implemented (uncommitted): `IsaStatusLabel` replaces `ClassificationBubble` (red pill in the Historic badge's scheme — `bg-red-600`, white text), the per-certificate details come from `/isacertification`, and the not-for-highline line sits under the block. See other subprojects for their own state.** Each subproject (S0–S6) below is a unit of work an agent can take on its own; respect the dependency graph.
> Nothing is committed or pushed without the user's explicit OK. CI on the PR is the verification gate (no local suite runs needed).

## Context

Cards today can carry three certification statements (DESIGN.md § Classification bubble L649–672, § Gear Card Anatomy L556–575):

- the ISA stamp;
- a gray **Not for Highline** pill, which is *computed* from `breaking_strength < 22 kN` and is not something the manufacturer said;
- an outlined **Uncertified** pill.

Certification itself is a hand-set `isa_certified` in each gear seed, with no link to the ISA's records (BACKLOG.md L84–101, DESIGN.md L1391).

What we want:

1. **Two labels only.** Green **ISA Approved** and red **Not ISA Certified**.
2. **"Not for highline" as a researched fact.** A stored field, sourced from the manufacturer's own page and shown on the detail page.
3. **ISA data as the single source of certification.** Every ISA fact lives in one file, `isa_certified.json`. It is built from the ISA's approved-gear list (<https://data.slacklineinternational.org/safety/isa-approved-gear/>) and modelled on `isa_gear_warnings.json` (CLAUDE.md § ISA gear warnings).
4. **The official ISA stamps, one PNG per standard.**

## Inputs already delivered

- **`isa_approved_data.csv`** (repo root, untracked). The raw capture: **33 certificates, 15 columns**.
  - Columns: Cert ID, Brand, Model, Product Type, Standard, Standard Version, Model Version, Release Year, Testing Laboratory, Test Date, Product Link, Manual Link, Picture 1, Picture 2, Manufacturer Email.
- **`frontend/public/isa-labels/`** (untracked). The stamp PNGs: `ISA21`, `ISA22`, `ISA37`, `ISA41A+`, `ISA41A`, `ISA41B`, `ISA41C`, `ISA51`, `ISA52`, `ISA53`, `ISA61`.
  - **There is no plain `ISA41.png`.** A letterless ISA:41 webbing certificate gets its letter **calculated from breaking strength** instead (see the "Webbing letter" decision). That letter then picks the PNG, so Cong Gear Path (40 kN) → `A+` → `ISA41A+.png`.

## Decisions (Q&A, 2026-09-24)

| Topic | Decision |
|---|---|
| Card labels | **ISA Approved**: the current `IsaApprovedBadge`, later swapped for the PNG stamp. **Not ISA Certified**: solid red in the Historic badge's scheme (`bg-red-600`, white text; changed from `#D04A3E` on 2026-09-24). No other certification pill on cards. |
| Kits / tree protectors | Cannot be ISA certified. No certification field and no certification label. |
| Unknown certification | No three-state certification. Anything not matched in `isa_certified.json` reads **Not ISA Certified**. |
| Source of truth | The loader sets `isa_certified` from matches, as `load_isa_warnings.py` does for `isa_warning`. The field is **removed from every gear seed**. |
| Match confidence | Only `exact` matches certify. |
| Which certificates count | **Webbing** and **Webbing – Sewn Loop** certificates match the webbing row. **Intermittent Connection** certificates do not count; they stay in the file unmatched, with a note. |
| Superseded certs | **Newest certificate only**. Pinktube `approved_gear_23` matches; `approved_gear_8` stays unmatched as superseded. |
| Webbing letter | Kept next to the badge. It comes **from the certificate number** (`ISA:41:A+` → `A+`). **If the certificate carries no letter**, it is calculated from `breaking_strength`: A+ ≥ 40, A ≥ 30, B ≥ 26, C ≥ 22 kN (inclusive). |
| Computed `classification` | **Removed** (model, loader, frontend, table/compare). |
| All 17 seed-certified items | All must match. **Stop and ask the user** if any fails to. The preview says all 17 do (Appendix B). |
| SlackX Orange | Hand-matched to weblock 58 `Radrigs Orange`. |
| Normalization | Normalized values in the JSON. The raw CSV is **committed as provenance**, and the JSON is **rebuildable from it by script**. |
| Stored fields | All ISA fields plus certificate number, Product Link, Pictures 1 & 2 (as links, never fetched) and Manufacturer Email. |
| Leashes | A new gear type, logged in BACKLOG as its own project. Leash certificates stay unmatched until then. |
| Not-for-highline field | Stored with three states: `true` / `false` / `null`. Default `null` means "not yet checked". **On all gear types.** The first research pass covers the 35 sub-22 kN webbings. Other types go to BACKLOG. |
| Not-for-highline display | Its own line, **directly under the ISA Certification block** on the detail page. It never appears on the card. |
| Detail certificate fields | Approved as proposed (S4). |
| Sidebar filter | The **ISA Certified** pill group stays (removed from kits). |
| /safety | A new ISA certification section linking to <https://www.slacklineinternational.org/isa-gear-standards/>. Every ISA-approved detail page gets a short note linking to it. |
| Auto-sync | Out of scope; a future project. |

---

## Subprojects

```
S0 setup ─┬─ S1 isa_certified.json + build script ── S2 backend ─┐
          │                                                     ├─ S4 frontend labels ─ S5 /safety + note ─ S6 PNG stamps
          └─ S3 not-for-highline field + research ──────────────┘
```

**PR 1** = S1 + S2. **PR 2** = S3 + S4 + S5. **PR 3** = S6. Each PR has granular commits (per the few-PRs preference). CI is the verification gate.

### S0: Setup (do first)

- **Branch.** `git switch -c isa-certification` from the current HEAD of `deploy-flag-and-axiom-mk2`. This carries across the uncommitted `BACKLOG.md` / `DEPLOY.md` edits and the untracked CSV and `isa-labels/`.
  - Note: the Legacy→Historic rename is already committed there (8519f1c, 1 ahead of origin), so this branch stacks on it.
- **Save the plan.** Save it as `ISA_CERTIFICATION_PLAN.md` (repo root), linked from PLAN.md and BACKLOG.md.
- **BACKLOG.md.**
  1. **New: leashes gear type.** Unblocks BC Threaded Highline Leash, Slacktivity HighlineLeash, raed PRO leash and raed ALPINE leash.
  2. **New: not-for-highline research for the other gear types** (weblocks, rollers, leash rings, grips, tree protectors, kits).
  3. **New: unmatched ISA certificates with no gear type.** Slacktivity KingPin (Connector, ISA:52) and the Intermittent Connection webbing certificates.
  4. **Refresh the auto-sync entry.** It would write `isa_certified.json`. Drop the stale per-type field text. BC Loop is **held** (leashring 27).
- **Memory.** Fix `isa_autosync_backlog.md`: weblock and roller now have a top-level `isa_certified`.

### S1: `isa_certified.json` + rebuild script (PR 1)

1. **`scripts/build_isa_certified.py`** reads `isa_approved_data.csv` and writes `isa_certified.json` as `{"items": [...]}`.
   - It **preserves each entry's hand-written `match` block, keyed by `Cert ID`**, so a re-scrape never loses adjudication.
   - New Cert IDs get an empty match and are reported.
   - It has a `--check` mode (exit 1 on drift), like `scripts/backfill_seed_ids.py`.
2. **Normalized item shape:**
   - `cert_id` (`"approved_gear_17"`)
   - `certificate` (`"ISA:41:A+"`), `standard_number` (41), `isa_class` (`"A+"` / null)
   - `product_type`, `manufacturer`, `model`
   - `model_version` (string: the source has `"B1/B2"` and `"1.5"`), `release_year` (int)
   - `standard_version` (string: the source mixes `"1.0"` and `"2024"`)
   - `testing_lab` (null when the source says `"not needed"`, with the raw value kept in a note)
   - `test_date` (`"YYYY-MM"` or `"YYYY"`, from `06.2021` / `2024`)
   - `product_url`, `manual_url` (null when empty), `pictures` [list], `manufacturer_email`
   - `match` {`gearType`, `gearIds`, `gearNames`, `confidence`, `note`}
3. **Hand adjudication** (Appendix B).
   - Exact matches for all 17 currently certified items, plus sewn-loop certificates onto the same webbing row.
   - Intermittent Connection, superseded Pinktube #8, leashes and KingPin are unmatched, each with a note.
4. **Commit** `isa_approved_data.csv` as provenance and document the rebuild command in CLAUDE.md.

### S2: Backend (PR 1)

Copy the pattern of `load_data/load_isa_warnings.py`, `models/isa_gear_warnings.py` and `/isawarning`.

1. **Model** `slack_data/models/isa_gear_certifications.py`.
   - `ISAGearCertification`: one row per (certificate × matched gear id), linked by `(gear_type, gear_id)`, with no foreign key. Plus `Public` / `Create`.
   - The docstring mirrors `BaseISAGearWarning`.
2. **Gear-row columns** (webbing, weblock, leashring, grip, roller).
   - `isa_certified: bool = False` stays, but is **set only by the loader**.
   - Add `isa_certificate: str | None`: the primary certificate number. For webbing it comes from the plain Webbing certificate, else the Sewn Loop one.
   - Webbing only: add `isa_class: str | None`, set by the loader. It is the certificate's letter; failing that, the strength-derived letter (A+ ≥ 40, A ≥ 30, B ≥ 26, C ≥ 22 kN); null below 22 kN or when strength is unknown.
     - This is a small helper in the loader, **not** the old `_classify_fiber()`: there is no material gating, and it applies only to certified webbings.
     - The note on the certification row records that the letter was derived.
   - Together these let cards pick the stamp PNG and the letter **without a second fetch**, the same way `isa_warning` carries severity.
3. **Loader** `slack_data/load_data/load_isa_certifications.py`.
   - Reuse `read_seed_json` / `seed_path` (`load_data/_seed_io.py`).
   - Reuse the verify-id-against-`"<brand> <name>"`-then-skip-loudly logic of `resolve_warnings()`.
   - Only `exact` matches certify.
   - Runs in `seed.py` beside the warnings pass, after the gear loaders, gated on the new table being empty.
4. **Router** `api/routers/isa_certification_router.py` (`/isacertification`).
   - Hand-written and read-only like `isa_warning_router`.
   - Registered in `main.py` and `CATALOG_ROUTERS` (`api/routing.py`).
5. **Remove seed storage.**
   - Seeds: `isa_certified` in `webbings.json`, `leashrings.json`, `grips.json`, `starterkits.json` and `tricklinekits.json`; `specifications["ISA approved"]` in `weblocks.json`; `isa_approved` in `rollers.json`.
   - Loaders: stop reading it (`load_weblocks.py:92,132`, `load_rollers.py:71`, and the webbing, leashring and grip loaders).
   - **Before removing anything:** assert that the loader-derived certified set equals today's 17. If it doesn't, stop and ask.
6. **Kits.** Remove `isa_certified` from the `StarterKit` / `TricklineKit` models and loaders.
7. **Remove `classification`.**
   - Drop it and `_classify_fiber()` from `models/webbing.py` and its computation in `load_webbings.py`.
   - Remove the `"classification"` entry in `_EXCLUDED` (`submissions/fields.py`).
8. **Not correctable.** Add `isa_certified` and `isa_certificate` to `_EXCLUDED` in `submissions/fields.py`, since both are derived now. Update the manufacturer API example (`frontend/src/pages/ManufacturerApiPage.tsx:161`).
9. **Tests.**
   - New loader tests: id verification, exact-only, sewn-loop vs intermittent, superseded, unmatched.
   - A build-script `--check` test.
   - A read-only guard for the new router.
   - Update `test_loaders.py`, `test_webbings.py`, `test_weblocks.py`, `test_leashrings.py`, `test_rollers.py`, `test_starterkits.py`, `test_manufacturer_api.py` and the frontend contract test.
10. **Docs.** CLAUDE.md (new § ISA certifications, the key-files and active-models tables, removal of classification), DESIGN.md L1391, and BACKLOG.
11. **Re-seed** (CLAUDE.md rule).
    - `rm slack_data/database.db`, restart, and read the loader log.
    - `curl /isacertification/`, a certified webbing, and a kit.

### S3: "Manufacturer states not for highlining" (PR 2)

1. **Field.**
   - Add `manufacturer_not_for_highline: bool | None = None` plus `manufacturer_not_for_highline_source: str | None` (the URL that supports the value) to `Base<X>` on **all eight gear models**, so both flow to Public/Create/Update.
   - Map both through each loader. The seeds carry the keys only where the value is known.
2. **Research: the 35 webbings in Appendix A.**
   - Visit `product_url`, the maker's site, or the Wayback Machine for dead links.
   - `true` on **any** sign from the maker that the item is not for height (explicit statement, height limit, or a use list limited to park, rodeo, trick or travel lines), from the product page **or the maker's webbing manual**. `false` when the item is marketed for highlining (e.g. Paradigm Signature). `null` when nothing from the maker can be read. (The rule was broadened from "explicit only" on 2026-09-24; see Appendix C.)
   - Record a findings table (id, verdict, quote, URL) in `ISA_CERTIFICATION_PLAN.md` as provenance.
3. **Frontend types** in `types/gear.ts`.

### S4: Frontend labels (PR 2)

1. **Card** (`GearCard.tsx`, `ClassificationBubble.tsx` → rename to something like `IsaStatusLabel.tsx`).
   - **Certified:** `IsaApprovedBadge`, plus on webbing a letter bubble from `isa_class`. Keep the ISA-chart colours and dark ink (DESIGN.md L672).
   - **Uncertified**, on the five certifiable types: a solid **Not ISA Certified** pill in the Historic badge's colours (`bg-red-600`, white text).
   - Remove the `Uncertified` pill, the gray Not for Highline pill and the 22 kN logic.
   - Kits and tree protectors show nothing.
   - `config/gearTypes.ts`: `showsUncertified` → `certifiable`, and `hasISA: false` on kits.
2. **Detail page** (`GearDetailBody.tsx:168`).
   - *(Superseded 2026-09-24: the details were removed from the page, and the stamp now sits right of the name/price and links to the ISA approved-gear list. See DESIGN.md § ISA stamp.)* **Certified:** the stamp, then the certificate details from `/isacertification`, in this order: certificate no., standard version, testing lab, test date, model version, release year, manual link (and product link). A webbing with both Webbing and Sewn Loop certificates lists both.
   - **Uncertified:** "Not ISA Certified".
   - Directly under the block: **"Manufacturer states not for highlining"** when `manufacturer_not_for_highline === true`, linked to its source.
3. *(Removed 2026-09-24 along with the details.)* **Data hook.** Fetch `/isacertification/` once and index it by `(gear_type, gear_id)`, the same way ISA warnings are indexed (DESIGN.md L698).
4. **Remove classification.** `CLASSIFICATIONS` in `types/enums.ts`, the classification spec/table/compare columns, and the sort/filter config.
5. **Filters.** Drop `isa_certified` from the kit groups in `config/filterGroups.ts`.
6. **DESIGN.md.** Rewrite § Classification bubble, § Gear Card Anatomy, the ISA Certification block (L674) and L1283. Remove classification from the spec tables (L870).
7. **Tests.** `isa_certification.cy.ts`, `gear_cards.cy.ts`, `gear_detail.cy.ts`, `filters.cy.ts`, `tests/unit/filterCount.test.ts`, and `cypress/shards.json` if any spec is added.

### S5: /safety section + detail-page note (PR 2)

- **/safety.** `SafetyPage.tsx` gets a new **ISA certification** section (id `isa-certification`).
  - It explains that certification here mirrors the ISA's approved-gear list, and links to <https://www.slacklineinternational.org/isa-gear-standards/> and the approved-gear list.
  - The /safety copy is ISA-reviewed (DESIGN.md L1357), so the new wording goes to the ISA before launch.
- **Detail page.** Every ISA-approved detail page gets a short note under the certificate details, linking to the standards page and to `/safety#isa-certification`.
- Update DESIGN.md § Safety and `safety_notices.cy.ts`.

### S6: Official ISA stamp PNGs (PR 3, images delivered)

- `IsaApprovedBadge` takes the `isa_certificate` (plus `isa_class` on webbing) and maps it to a file: `ISA:41` + class `A+` → `isa-labels/ISA41A+.png`, `ISA:51` → `ISA51.png`. A letterless ISA:41 webbing uses its strength-derived `isa_class`, so every certified webbing has a PNG.
  - The `+` must be URL-encoded (`%2B`), or the file renamed to e.g. `ISA41Aplus.png` (decide at implementation).
- **Fallback.** Any certificate still without a PNG falls back to today's drawn badge. A missing image never blanks the badge.
- Card ~28px tall, detail ~80px wide (DESIGN.md L1283). Check the text is readable at card size.
- Commit `frontend/public/isa-labels/`.
- **Done (2026-09-24, uncommitted).** `utils/isaStamp.ts` maps certificate → file (`+` renamed to `plus`: `ISA41Aplus.png`). `IsaApprovedBadge` takes `certificate` / `isaClass` / `size`, and falls back to the drawn badge on no file or a load error. Card 60px, detail 112px: at the planned 28px / 80px the square PNG's lettering is unreadable (40px was tried on cards and was still mush). Tests: `tests/unit/isaStamp.test.ts` (every file on disk is mapped; every certificate in `isa_certified.json` resolves) and a new "ISA stamp images" block in `isa_certification.cy.ts` (each certified item's stamp loads, Marathon → A+).

---

## Resolved: webbing thresholds

- **A+ ≥ 40, A ≥ 30, B ≥ 26, C ≥ 22 kN** (inclusive), confirmed by the user 2026-09-24. This matches the ISA thresholds already in `models/webbing.py`. The comment's "A 20+" is not used, because it would put A below B.

## Verification

- **PR 1.**
  - `scripts/build_isa_certified.py --check` and `scripts/backfill_seed_ids.py --check` pass.
  - Re-seed, and confirm the loader log shows the 17 certified rows and the expected unmatched list.
  - `curl localhost:8000/isacertification/` returns rows.
  - `/webbing/63` (Marathon) has `isa_certificate: "ISA:41:A+"`.
  - `/starterkit/1` has no `isa_certified`.
  - CI green.
- **PR 2.**
  - `/run` the app and check:
    - a certified webbing card (stamp + letter);
    - an uncertified weblock (red pill);
    - a kit (no label);
    - Paradigm Signature (no highline line);
    - a `true` item (line under the ISA block);
    - Marathon's detail page (both certificates listed);
    - the /safety section.
  - CI green (build, lint, unit, sharded Cypress).
- **PR 3.** Every certificate in the JSON resolves to a PNG or the fallback. No 404s in the network panel.

## Appendix A: the 35 sub-22 kN webbings (S3 research list)

| id | brand | name | kN | product_url |
|---|---|---|---|---|
| 11 | BalanceCommunity | Feather | 20 | balancecommunity.com/feather |
| 28 | Slackliner.de | Sigma X | 21 | slackliner.de/…/Sigma-X.html |
| 33 | Equilibrium | Bounce | 16 | slackshop.cz/…/142-eqb-bounce.html |
| 35 | Equilibrium | Element | 20 | eqb.cz/element-en.html |
| 38 | YogaSlackers | eLine | 21.5 | yogaslackers.com/…/eline-webbing/ |
| 41 | Slack Mountain | Snake Tub | 21 | slack-mountain.com/…/5-snake-tub.html |
| 44 | SlackMountain | Artic Fox | 21 | — |
| 45 | Slack Mountain | Flax | 20 | — |
| 51 | SlackMountain | Plum | 10 | slack-mountain.com/…/7-plum.html |
| 66 | Balanceur | Raven | 16 | balanceur.ro/…/pana-corbului/ |
| 80 | EQB | Slim Green | 11 | slackshop.cz/…/29-eqb-slim.html |
| 81 | Line Spirit | Chartreuse | 20 | — |
| 102 | Slack.fr | Supertube Norway | 21 | — |
| 116 | Landcruising | Wave Tube | 20 | — |
| 117 | Landcruising | Wave Tape 19 | 18 | — |
| 118 | Landcruising | Wave Tube 19 | 16 | — |
| 127 | BC: Slackline Outfitters | Slack-Spec Tubelar | 20 | balancecommunity.com/1-slack-spec-tubular |
| 128 | BC: Slackline Outfitters | Slack-Spec 11/16" | 13.3 | balancecommunity.com/11-16-slack-spec-tubular |
| 139 | Balancing Earth | Rasta Tubelar | 20 | web.archive.org (2016) |
| 142 | Slackline Shop NZ | Flat | 21 | slacklineshop.co.nz/…/25mm-flat… |
| 145 | Slackline Shop NZ | Tube #1 | 18 | slacklineshop.co.nz/…/25-mm-tubular… |
| 155 | Slack.fr | Reggae | 21 | laboutique.slack.fr/…/143-reggae-tubular.html |
| 156 | Slack.fr | RVD | 21 | laboutique.slack.fr/…/146-rvd-tubular.html |
| 164 | Landcruising | Aloha (Aka Aki Tidal) | 20 | aki-slacklines.de/…/aki-tidal-webbing |
| 170 | Slacklife BC | Totally Tubular | 17.7 | slacklifebc.com/product/totally-tubular/ |
| 179 | Edelrid | SuperTape 19mm | 15 | edelrid.de/…/flachband-supertape-19mm.html |
| 180 | Edelrid | X-Tuble 16mm | 15 | edelrid.de/…/x-tube-16mm.html |
| 181 | Edelrid | X-Tube 25mm | 20 | edelrid.de/…/x-tube-25mm.html |
| 186 | Raed Slacklines | MOTM light | 15 | raed-slacklines.com/motm-light |
| 197 | Raed Slacklines | Eclipse | 16 | raed-slacklines.com/eclipse-… |
| 198 | BC: Slackline Outfitters | Jelly | 20 | balancecommunity.com/products/jelly-webbing |
| 208 | EQB | Neon | 20 | slackshop.cz/…/30-eqb-neon.html |
| 212 | BC: Slackline Outfitters | Paradigm Signature | 21.0 | balancecommunity.com/products/paradigm-signature-1 (expected `false`) |
| 225 | Slacktivity | GREEN T20 | 12.0 | slacktivity.com/shop/green-t20/ |
| 259 | Wall Ace | Duct Tape | 13 | — |

## Appendix B: proposed match adjudication (to be confirmed in S1)

| Cert ID | ISA model / standard | → our row | Status |
|---|---|---|---|
| 1 / 2 | Slacktivity Redtube Type A (41:A) / Sewn Loops (41) | webbing 62 redTube | exact |
| 23 / 24 | Pinktube (41:C, newest) / Sewn Loops (41) | webbing 61 pinkTube | exact |
| 8 | Pinktube (41:C, 2020) | — | superseded by 23 |
| 17 / 18 | Marathon (41:A+) / Sewn Loops (41) | webbing 63 Marathon | exact |
| 20 / 21 | Y2K (41:A) / Sewn Loops (41:A) | webbing 74 Y2K | exact |
| 14 / 15 | LSD (41:C) / Sewn Loops (41) | webbing 189 LSDTube | exact |
| 33 | Cong Gear Path, Sewn Loop (41) | webbing 260 Path | exact (no letter on cert → strength 40 kN → **A+**) |
| 16, 19, 22, 25, 26 | … Intermittent Connection | — | not counted |
| 3 | Slacktivity HighlineRing (37) | leashring 26 | exact |
| 31 | BC Loop (37) | leashring 27 BC Aluminum Leash Ring | exact (renamed product) |
| 9 | raed HALO leash ring (37) | leashring 29 Halo | exact |
| 7 / 29 / 30 | BC Wafer / Wafer 2.0 / Wafer XL (61) | grip 3 / 15 / 16 | exact |
| 5 | BC Alpine Weblock 5 (51) | weblock 4 | exact |
| 13 | Aki Lynx 5 (51) | weblock 53 | exact |
| 12 | SlackX Orange (51) | weblock 58 Radrigs Orange | exact (hand-match: seller) |
| 6 | Slacktivity Seahorse v1.5 (51) | weblock 84 SeaHorse DP 1.5 | exact |
| 28 | Slack Inov Zenlock (51) | weblock 112 ZENLOCK | exact |
| 4, 10, 11, 32 | leashes (37) | — | no gear type (BACKLOG) |
| 27 | Slacktivity KingPin, Connector (52) | — | no gear type (BACKLOG) |

## Appendix C: S3 findings, not-for-highline research (2026-09-24)

**Rule (broadened on the user's instruction).** `true` on *any* sign from the maker that the item is not for height:
- an explicit "not for highline";
- a height limit;
- a "for highline, combine it with…" note;
- the maker's own use list limited to ground disciplines (park, rodeo, trick, travel, beginner, short lines).

`false` only when the maker markets it for highlining. `null` when nothing from the maker could be read.

Sources are the maker's product page or **their own webbing manual** (raed's Annex A has a per-webbing "for Highline" column). Quotes marked † were read from a search engine's index of the maker's page, because the page itself could not be fetched (it renders only with JavaScript, or the shop returns 503). The Wayback Machine was offline for the whole pass.

### `true`: 18

| id | item | evidence | source |
|---|---|---|---|
| 11 | BC Feather | "FEATHER IS ABSOLUTELY NOT MEANT FOR HIGHLINES, MAIN OR BACKUP." / "Highline approved: No" | balancecommunity.com/products/feather |
| 51 | Slack Mountain Plum | "FORBIDDEN IN HIGHLINE, FINE BELT WILL NOT SUPPORT A LEASH, FORBIDDEN IN BACKUP" | slack-mountain.com/…/7-plum.html |
| 208 | EQB Neon | "Neon (generally all 20kN lines) are NOT suitable for highline!" | slackshop.cz/…/30-eqb-neon.html |
| 197 | raed Eclipse | "It's not recommended for use in heights above 1m." Manual Annex A, "for Highline": **no** | raed-sports.com/…/eclipse-lightweight-polyester-webbing |
| 186 | raed MOTM light | raed webbing manual, Annex A: "for Highline": **no** (the product page only says "a fun companion for your travels") | raed-webbing-manual.pdf |
| 259 | Wall Ace Duct Tape | confirmed directly with Wall Ace by the operator. There's no product page, so the source is null. | — |
| 66 | Balanceur Raven (Pana Corbului) | † "prohibited to use the Pana Corbului band for highline setup"; "perfect for practicing slackline under lengths of 20 meters", rodeo and static yoga | balanceur.ro/…/pana-corbului/ |
| 33 | EQB Bounce | "Its high stretch has predefined it for lowline; surfing in particular." / "To make a very strong high stretch double webbing with highline friendly properties, combine it with the Element webbing" | slackshop.cz/…/142-eqb-bounce.html |
| 35 | EQB Element | "designed for progressive tricks, surfing, and jumps alike" / "High stretch destined the webbing for dynamic tricks application, as well as rode line." | eqb.cz/element-en.html |
| 80 | EQB Slim | "Enthusiasts however use it for special slackline styles such as rodeo line."; EQB index: "ultralight webbing for soft-release or rodeo lines"; "for lines over 20m … Neon is what we recommend". ⚠ the page also says "perfect for backup". | slackshop.cz/…/29-eqb-slim.html |
| 128 | BC Slack-Spec 11/16" | "Extreme stretch optimized for short park lines with play in mind"; listed in BC's "Tubular Park Line Webbing" collection | balancecommunity.com/products/11-16-slack-spec-tubular |
| 198 | BC Jelly | "This is THE go-to park webbing for the beginner or veteran slackliner alike." / "Ideal for primitive slacklines, rodeo lines, and longlines." | balancecommunity.com/products/jelly-webbing |
| 142 | Slackline Shop NZ Flat | "perfect for a Rodeo Slackline"; "we recommend not to put more than 7kN tension on it" | slacklineshop.co.nz/…/25mm-flat-slackline-webbing/ |
| 225 | Slacktivity GREEN T20 | "ideal for traveling and for rodeolining" | slacktivity.com/shop/green-t20/ |
| 38 | YogaSlackers eLine | "It is also a great travel line." / "perfect for beginner to advanced slackliners". ⚠ the weakest `true`: it's a travel/training line, with no park or height wording. | yogaslackers.com/…/eline-webbing/ |
| 155 / 156 | Slack.fr Reggae / RVD | † "ideal for swells, surfs, small jumps and static figures". The maker says the two are the same webbing in different colours, and RVD is filed under `sangle-debutant-15-25m` (beginner 15–25 m webbing). ⚠ The shop's tubular-category page title reads "Sangle de slackline pour la longline, highline, waterline". | laboutique.slack.fr (shop 503 during the pass) |
| 102 | Slack.fr Supertube Norway | † same use wording as Reggae ("swell", surfs, small jumps, static figures); tested to 19 kN behind the loop. ⚠ same category-title conflict as Reggae. | laboutique.slack.fr/…/158-supertube-15m-tubulaire.html |

### `false`: 1

| id | item | evidence |
|---|---|---|
| 212 | BC Paradigm Signature | "The Ultimate in Freestyle Highline Webbing" / "Highline approved: Yes". "*FOR EXPERT USE ONLY* … not meant for use by beginner, or even intermediate highliners/riggers" restricts it to experts but is still highline marketing. |

### `null`: 16. Nothing readable from the maker

| id | item | what was tried |
|---|---|---|
| 28 | Slackliner.de Sigma X | Both URLs 404, and it's gone from the shop. The search index has "suitable for moderate longlines up to 100m", but longline alone isn't a sign against height. |
| 41 | Slack Mountain Snake Tub | Live page (EN + FR) only says "comfort under the foot" and gives specs. |
| 127 | BC Slack-Spec Tubelar (1") | 404, and not in BC's Legacy Products. Its 11/16" sibling is `true`, but that isn't evidence about this product. |
| 139 | Balancing Earth Rasta Tubelar | Domain no longer resolves; Wayback offline. |
| 145 | Slackline Shop NZ Tube #1 | Live page gives specs only. |
| 164 | Landcruising Aloha | Aki store says "opening soon". |
| 170 | Slacklife BC Totally Tubular | Redirects to the homepage; not in their shop. |
| 179 / 180 / 181 | Edelrid SuperTape 19 / X-Tube 16 / X-Tube 25 | 404 / 404 / live. EN 565 climbing webbing: neither the product page nor the Slings & Tapes manual mentions slacklining. |
| 44, 45 | Slack Mountain Artic Fox, Flax | No page on the maker's site or in search. |
| 81 | Line Spirit Chartreuse | Nothing found. |
| 116, 117, 118 | Landcruising Wave Tube / Tape 19 / Tube 19 | landcruising-slacklines.de is a parked domain (Sedo). |

Manuals checked: raed webbing manual (used), Slacktivity's manual index (highline webbings only; no T20 manual), slackliner.de manuals (kits only), BC's "Webbing Usage Guidelines" (care only, nothing per product), and Edelrid's Slings & Tapes manual and EN 565 sheet (nothing on slacklining). No EQB, Slack Mountain or Aki webbing manual was found online.

**Re-check when the Wayback Machine is back:** 28, 127, 139, 155/156/102 (to read the pages directly rather than through the index), 164, 170, and 116–118.

Side finding, not acted on here: BC's Feather page now gives **MBS 16 kN**, and our seed says 20.
