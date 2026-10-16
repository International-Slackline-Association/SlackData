# Live editing — Phase 7 (plan)

Phase 7 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 9, § 13): **ISA certificates and
warnings editable by admins**; the bulk import writes to the store; then the automatic sync.

**Done when:** an admin matches a new certificate or warning to a product on the site, with no
developer, and a fresh copy of the ISA's lists can be brought in without touching a JSON file.

**Status (2026-10-15): built (7a–7c), on `live-editing/7-isa`, stacked on phase 6. The automatic
sync (7d) waits on the ISA — the request is § 6.** Every choice in § 4 was decided on 2026-10-15: the recommended
option, (a), on each.

---

## 1. What is there today

- Certificates (`isa_certified`, 33) and warnings (`isa_gear_warnings`, 82) are **stored documents**
  in the catalogue store since phase 2: the ISA's fields verbatim, plus our hand-written `match`
  block (`gearType`, `gearIds`, `gearNames`, `confidence`, `note`).
- The flags on products (`isa_certified`, `isa_certificate`, `isa_class`, `isa_warning`) are
  **derived** at build from those documents and never typed (§ 9). Only `exact` certifies; a match
  is verified against `"<brand> <name>"`.
- A rename or merge **re-points** matches in the same transaction (D73), logged `match.repoint`.
- Nothing edits a certificate or warning on the site. New ones arrive by hand: re-scrape the CSV,
  `scripts/build_isa_certified.py`, hand-write the match, re-seed — which the store has ended.
- The ISA's pages (data.slacklineinternational.org) render the lists client-side from an embedded
  app; there is **no feed we know of** to fetch them from.

---

## 2. Already decided (the plan)

| | |
|---|---|
| D24 | Imported in bulk from the ISA's lists; admins match and correct on the site; the goal is an automatic sync, which proposes and admins confirm what it cannot match itself |
| D54 | Only admins change the ISA's statements |
| D73 | Renames and merges re-point matches; a skipped match is an error held to zero at deploy |
| § 9 | Only `exact` certifies; matches verified against `"<brand> <name>"`; derived values computed at build |
| CLAUDE.md | Webbing and Sewn Loop certificates both certify the webbing; Intermittent Connection never does; superseded certificates stay unmatched |

---

## 3. Hazards found while planning

1. **A match is a safety statement.** Matching a recall to the wrong product clears the right one
   and slanders another. Every match change should be as visible as an MBS edit. → P7-C.
2. **`gearNames` must agree with `gearIds`**, or the build drops the match. Typed by hand, they drift;
   written from the chosen product, they cannot.
3. **The certificate is the ISA's record.** Correcting a scrape error in it (a lab name, a date)
   is ours to do; changing what it certifies is not. The certificate number and class decide
   `isa_class` on webbing.
4. **No feed.** An automatic sync needs something to fetch. Scraping a JS-rendered page needs a
   headless browser, in a scheduled job, against markup the ISA can change at any time. → P7-F.

---

## 4. Decisions

### P7-A What admins edit — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) The match, and the ISA's fields too** (to correct a capture error), and **record a new entry** the list does not have yet; never delete — an entry that leaves the ISA's list is **retired**, with a reason *(recommended)* | Everything a developer did by hand today; § 9 says admins "fix a wrong match, or record one the ISA list does not yet have" | More form to build (≈ 15 fields per kind) |
| (b) The match only | Small | A wrong date or missing manual link needs a developer again |

### P7-B Where on the site — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A "Certificates & warnings" page under /admin**, unmatched first, each entry with its editor and History; and on a product page an admin link "ISA matches" to it, filtered to that product *(recommended)* | One queue to empty; reachable from where the problem is seen | A new page |
| (b) Only on the product page | Where readers see it | An unmatched entry has no product page to be found on |

### P7-C How match changes are logged — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Every change to a warning or certificate is flagged `safety`** — in the safety feed and filter beside MBS edits *(recommended)* | A recall moved, or a certification added, is the most safety-relevant change the site has | More rows in the safety feed (a few a year) |
| (b) Only warnings | Certificates rarely hurt anyone | A wrongly certified product reads as tested |

### P7-D Choosing the product in a match — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Picked from a search of the catalogue; `gearType`, `gearIds` and `gearNames` written from the choice**, confidence chosen (exact / probable / none) with a note *(recommended)* | The ids and names can never disagree (hazard 2) | — |
| (b) Typed ids and names, as in the JSON | Nothing to build | Exactly the drift the build has to catch |

### P7-E The bulk import — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) An importer that diffs a fresh capture against the store**: new entries added unmatched (with a suggested match where `"<brand> <name>"` hits exactly one product, never applied), changed ISA fields updated, vanished ones retired; match blocks never touched; logged as `import` under an admin's ISA id. `python -m slack_data.isa.importer --certificates isa_approved_data.csv --warnings <file> --as <ISA id> --check|--apply` *(recommended)* | Same shape as the media migration; `build_isa_certified.py`'s rules (keep matches, report new, drop vanished) carried over to the store | The capture is still taken by hand until P7-F |
| (b) Admins enter new entries by hand on the site only | No importer | 33 + 82 entries today; the ISA adds several a year |

### P7-F The automatic sync — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Ask the ISA for a machine-readable copy** of both lists (a JSON/CSV export URL from their data app), then run the importer daily on it as a scheduled job; until then admins run it on a hand capture *(recommended)* | Robust; the ISA owns the data and has been quick to help; the importer (P7-E) is the whole sync once a feed exists | Waits on the ISA for the "automatic" part |
| (b) A daily headless-browser scrape (GitHub Action) feeding the importer | No ISA involvement | Breaks silently whenever their page changes; a browser in CI |
| (c) No sync; the importer by hand, as needed | Nothing more to build | The lists drift until someone notices |

In every option the sync **proposes**: it never sets an `exact` match itself (D24).

---

## 5. What gets built

| Step | Content |
|---|---|
| 7a | Edits for the two collections: `plan_edit_isa`, create, retire — admin-only, `safety`-flagged per P7-C, match written from a chosen product (P7-D); `/edit/isa/...` routes |
| 7b | The importer (P7-E), with `--check` for CI and tests over the real seeds |
| 7c | Frontend: the /admin page (P7-B), the product page's admin link, History for an entry |
| 7d | The sync per P7-F; docs (CLAUDE.md § ISA certifications, BACKLOG.md's auto-sync entry), Cypress, verify-deploy |

---

## 6. The request to the ISA (P7-F)

To send to the ISA's technical contact. It asks for nothing in AWS:

> SlackData shows the ISA's approved-gear list and gear warnings on the products they concern, and
> keeps them in step by hand: an admin re-captures the two pages and runs an import. Both pages
> render their tables in the browser from your data app, so there is no file we can fetch on a
> schedule.
>
> Could the ISA publish both lists somewhere machine-readable — a CSV or JSON export URL, or the
> Google Sheet behind them shared read-only? Any stable URL works; we would read it once a day and
> nothing else. With one, new certificates and warnings would reach SlackData within a day, offered
> to our admins to match to products; until then they wait for the next manual capture.

## 7. As built (2026-10-15)

| Step | Where |
|---|---|
| 7a | `slack_data/catalogue/isa.py`: `edit_entry`, `create_entry`, `retire_entry`, admin-only, every record flagged `safety` (`isa.create`/`isa.edit`/`isa.retire`); `build_match` derives `gearType`/`gearIds`/`gearNames` from the products chosen and refuses a type that carries no such flag or a merged product; `check_buildable` runs the build's own row builders on the entry first. Routes `GET/PATCH/POST /edit/isa/{certificates,warnings}…`. The log names an entry as the ISA does (`catalogue/names.py`); the safety feed is now "safety changes" |
| 7b | `slack_data/catalogue/isa_import.py`: reads the approved-gear CSV through `scripts/build_isa_certified.py` and the warnings in `isa_gear_warnings.json`'s shape; adds new entries unmatched with a `suggested_match` (never applied — the warnings build stamps a match at any confidence, so a suggestion cannot live in `match`), updates changed ISA fields without touching the match, retires what the ISA dropped but never an admin's `slackdata-<n>` entry. A test holds the committed capture equal to the store |
| 7c | `/admin/isa` (`pages/IsaAdminPage.tsx`): the two lists, unmatched first, search, Add, Edit (the shared entry editor), Match (a product picker per gear type; a warning may land on several types), Retire with a reason, History. "ISA matches" on a product page for admins (`?gear=<slug>:<id>`); the import's suggestion offered as "Check and use it" |
| 7d | Not built: waits on § 6. The importer is the whole sync once a feed exists — a scheduled job that downloads the two files and runs it |

Tests: `tests/test_isa_editing.py`, `frontend/tests/unit/isaEntries.test.ts`,
`frontend/cypress/e2e/isa_admin.cy.ts` (in `shards.json`).

**Prod rollout:** no infrastructure change. After deploying, nothing changes until an admin edits:
the stored entries are the ones phase 2 imported.
