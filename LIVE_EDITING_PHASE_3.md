# Live editing — Phase 3 (plan)

Phase 3 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 13): **live editing for admins**, plus
History, Recent Changes, feeds, revert, hide and duplicate merge.

**Done when:** admins edit the catalogue without a developer.

**Status (2026-10-13): decided, building** on `live-editing/3-admin-editing`. The operator approved
every recommendation in § 4 except P3-H, which is dropped. Gate item 3 (0–2 merged, prod switched
over) is not met yet: the build goes ahead on the stacked branch, and **ships only after it is**.

---

## 0. The gate — when to start

1. ~~**The original checkout is clean.**~~ Done 2026-10-13: its uncommitted duplicate of phases 0–2
   was stashed (`stash@{0}` in `/home/ebragard/SlackData`), and the other agent's four edits (the
   Cong Gear Falcon link, the nav order) were committed on `live-editing/2-catalogue-store`.
2. ~~**The image-id work is reconciled with phase 2.**~~ Done: it *is* phase 2 now. Media is filed by
   id, one folder per item (`gear-images/<type>/<id>_<slug>/`), so the `gearMediaKeys.json` index
   this item worried about no longer exists. § 3's rename hazard for photos is closed.
3. **Phases 0–2 are reviewed and merged, and prod is switched over to the store**
   (`CATALOG_SOURCE=store`, LIVE_EDITING_PHASE_2.md § 3, step 4). Phase 3 writes to the store, so
   the store must be what the site reads. Once it is, the root seeds are frozen.
4. ~~**The staging store is restored.**~~ Done: `importer --apply` then `--check` clean (version 3).

---

## 1. What phase 3 ships

| | |
|---|---|
| **Edit** | An admin edits any field of any product, except the ISA's statements (§ 9 of the plan, phase 7). Edits take effect on the next request |
| **Create** | An admin adds a product (D26 ids). Brand creation: P3-G |
| **Hide / unhide** | Admin only. Kept, logged, reversible, absent from listings (§ 5.3) |
| **Merge a duplicate** | Admin only, with a mandatory explanation. The removed id points to the survivor, and ISA matches are re-pointed (§ 7.7) |
| **Revert** | Admin only for now; manufacturers revert their own gear in phase 5 (D58). A revert is a new change, refused per field if the field moved on (D27) |
| **History** | On every item page: each change with its diff, who, when, how and why |
| **Recent Changes** | A site-wide page, filterable by kind of change, by role, and by `safety` |
| **Contributions** | One page per person (by ISA id) |
| **Feeds** | Atom feeds of Recent Changes and of safety changes (MBS fields, D33/D57). Public |

**Not in phase 3:**
- Uploads (phase 4).
- Manufacturer accounts, and the machine API applying live (phase 5).
- Editing for non-admins, the rate cap, and retiring the suggestion box (phase 6).
- Editing ISA certificates and warnings (phase 7).

Phase 6 then mostly loosens a guard: the routes built here take `require_admin`, and phase 6 swaps
that for `require_person` plus the cap.

---

## 2. What it builds on (as of phase 2)

| Piece | Where | State |
|---|---|---|
| Catalogue store: one document per seed entry, **verbatim**; `seq`, `retired`; a `_meta/version` counter | `slack_data/catalogue/` | Written only by the importer |
| Live catalogue: rebuilt in memory when the version moves | `catalogue/live.py` | **~6 s** for the first request after a change on staging; 2 s locally |
| Change log: append-only; conditional put; ULID ids; `feed-index` and `target-index` | `slack_data/changelog/` | Only `TargetType.PERSON`, actions `role.grant` / `role.revoke` |
| A change and its record in one transaction | `changelog/writer.py` `commit_person_change` | Person + record only |
| Who may change what, derived from `<X>Update` | `submissions/fields.py` `CORRECTABLE_FIELDS`, `_EXCLUDED` | Used by suggestions and the manufacturer API |
| The suggestion form's field metadata | `frontend/src/config/correctableFields.ts` | Reused by the edit form |
| Admin guard, people store, public `/changes` | `api/auth.py`, `people_router.py` | Phase 1 |
| Typed-in public name, changeable once | `models/people.py` | Phase 1 (changes D37, see § 9) |

---

## 3. Hazards found while planning

These shape the decisions in § 4.

1. **Seed entries are not shaped like the model.** An edit is naturally "field X of webbing 12
   becomes Y", in the model's field names (the names the frontend, the log and the manufacturer API
   all use). The stored documents are seed entries, and their keys differ per type. Measured
   against `CORRECTABLE_FIELDS`:

   | type | seed keys | editable fields | same name |
   |---|---|---|---|
   | webbings | 23 | 20 | 14 — `priceMeter`→`price`, `breakingStrength`, `materialType`→`material`, `date_introduced`→`release_date`, `brand` |
   | weblocks | 21 | 21 | 10 — nested `specifications` / `pricing`, regex-parsed prices and width ranges |
   | rollers | 23 | 21 | 12 — `mbs`, `locking_type`, `price_unit` holding the currency |
   | the other six | 17–27 | 17–26 | all but `manufacturer`→`brand_name`, `date_introduced` |

   Some model fields exist in no seed at all (`notes`, `colors`, `version`,
   `manufacturer_not_for_highline`). No document has anywhere to keep an edit to them. → **P3-A**
2. **Renaming a product can silently drop its ISA recall.** `load_isa_warnings.py` and
   `load_isa_certifications.py` verify every matched id against `"<brand> <name>"` and **skip** a
   mismatch, with a printed line. After a rename, the next rebuild no longer shows the warning or
   the certificate on that product. Nothing errors. The same happens when a product moves to
   another brand. → **P3-B**
3. **A rebuild per edit is slow on Lambda.** It took ~6 s on staging, against 2 s locally. Each
   warm container pays it once per version. Admin-only edits are rare, so phase 3 can live with it;
   phase 6 cannot. → **P3-C**
4. **A brand is keyed by its name.** `manufacturers.json` is a dict keyed by brand name. Gear seeds
   name their brand by string (`brand` or `manufacturer`), and `gear_sellers` lists names. Renaming
   a brand therefore touches every one of its products, every list it appears in, and the ISA
   `gearNames`. Slack Inov and Spider alone could pass DynamoDB's 100-item transaction limit.
   → **P3-G**
5. **Hidden and merged items still have matches pointing at them.** An ISA warning matched to a
   hidden id must not be reported as a mismatch. A merged id's matches move to the survivor in the
   same transaction (§ 7.7). → § 5.4
6. **Photos follow the id** — closed in phase 2: media is filed in one folder per item id, so a
   rename keeps it, and a new item's photos go in a new `<id>_<slug>/` folder. A merge keeps the
   survivor's photos (its id is unchanged); the merged item's folder is moved by hand, as today.
   Manufacturer **logos** are still keyed by brand name, which matters for P3-G. Photos as data
   (uploads, not repo files) remain phase 4 (D47).
7. **Export format.** The daily export promises files byte-identical to the seeds. Any change to
   what a document is (P3-A) changes the data repo's format once. The repo has only just started, so
   now is the cheapest time.

---

## 4. Decisions — decided 2026-10-13

**Every recommended option was chosen**: P3-A (b), P3-B (a), P3-C (a) then (b) in phase 6 if needed,
P3-D (a), P3-E (a), P3-F (a), P3-G (a), P3-I (a). **P3-H is dropped**: from phase 6 everyone edits,
so an "apply as edit" button would serve the box only for its last months. Until then **the rule
stands**: what the site cannot edit (photos, manuals, anything a suggestion asks for) goes through
the suggestion box or a developer, applied by hand.

### P3-A What a stored document is, so an edit can be written back

| Option | How | For | Against |
|---|---|---|---|
| **(a) Seed shape + a per-type codec** | Keep documents as seed entries. Write, for each type, the inverse of its loader: model field ↔ seed key path, with a round-trip test per field | Nothing about the store or the export changes | Weblocks' regex-parsed prices and width ranges have no clean inverse. Fields absent from the seeds need a new home anyway. Nine codecs to keep in step with nine loaders forever, and the manufacturer API (phase 5) needs them too |
| **(b) Canonical documents — the model's own shape** *(recommended)* | One-time conversion: build the catalogue from today's seeds, then write each row back as a document in `<X>Create` field names (enums as values, `brand` as name, `gear_sellers` kept). One generic loader per type replaces the nine special-case ones | An edit is a field assignment, so the log, form, API and store all use one vocabulary. Every model field is storable. Loaders shrink. Phase 5's machine API becomes a plain write | The biggest single change in phase 3: loaders and the root seed files convert, in one PR. Byte-for-byte equality is proven by comparing built catalogues (the shadow check already does this). The export format changes once |
| **(c) Seed entry + an overlay** | Each document keeps its seed entry plus `edits: {field: value}`, applied after `model_validate` in one shared place (like `require_seed_id`) | Smallest change. Loaders untouched | Two truths per item, forever. A reader of the export must apply the overlay. Hide, merge, revert and creation all need overlay semantics. The debt moves to phases 5–7 |

For (b), **convert the root seeds too**, in the same PR. Then there is one load path (store, tests
and local dev all read canonical documents), and D34's pinned snapshot is the export as it already
is. The seeds are frozen after the switch-over (§ 0 step 3), so nobody hand-edits the new format.

### P3-B Renames and ISA matches

| Option | For | Against |
|---|---|---|
| **(a) A rename rewrites the matching `gearNames` in the same transaction, logged** *(recommended)* | Keeps the safety check exactly as it is. Every touched warning or certificate shows the rename in its History | A rename touches more documents. The match block has to be found by `(gearType, gearId)` |
| (b) Verify matches by id only (ids are stable since the seed-id work); `gearNames` becomes a note | Simplest | Removes the guard that caught seed-order drift. Ids are stable now, but a wrong merge or create could still mis-point a recall silently |
| (c) Refuse to rename a product that has an ISA match | No new code path | An admin cannot fix a typo in a recalled product's name |

Separately from the option chosen, **a skipped match becomes loud** in store mode. It is logged at
ERROR, counted in the build log, and `verify-deploy.sh` checks the count is zero.

### P3-C Rebuild latency

| Option | For | Against |
|---|---|---|
| **(a) Profile first, then raise Lambda memory (512 → 1024–1769 MB, which adds CPU)** *(recommended as the first step)* | One line. Cost is cents | May not be enough on its own |
| (b) Incremental rebuild: apply one changed document to the in-memory SQLite and rerun only the derived passes | Rebuild in milliseconds | The derived passes (ISA, sellers, enrichment) are whole-catalogue. Hard to prove equal to a full build; needs a property test against the full build |
| (c) Serve the old copy while rebuilding in the background | No visitor waits | Lambda freezes the container after each response, so a background thread does not run reliably |

Recommendation: profile in step 1. If the build still exceeds ~1.5 s after (a), plan (b) for
**phase 6**. Admin-only edit rates do not need it.

### P3-D What a hidden item's URL shows

| Option | For | Against |
|---|---|---|
| **(a) A public "hidden" page: who, when and why, with History; absent from listings, search and compare** *(recommended)* | Transparent, as the log is public. A bookmark explains itself | One new page state |
| (b) A plain 404 for the public; admins see the item with a banner | Hidden means hidden | Contradicts the public log, which already names the hide |

### P3-E What a merged id does

| Option | For | Against |
|---|---|---|
| **(a) The API answers 404 with `{"merged_into": N}`; the frontend redirects and shows "merged into …"** *(recommended)* | Works the same for the website, the export and the manufacturer API | Callers must read the body |
| (b) The API answers 308 to the survivor's URL | Standard HTTP | A `PATCH` replayed by the machine API would follow it to another product |

### P3-F Field scope for admins in phase 3

| Option | For | Against |
|---|---|---|
| **(a) Every field except the ISA's four statements; admins also edit `gear_sellers` and `product_group` (D54)** *(recommended)* | Matches D54 | `gear_sellers` and `product_group` are lists or groups, so they need their own form controls |
| (b) `CORRECTABLE_FIELDS` only; lists and groups stay JSON edits | Reuses the suggestion form as is | Leaves a developer step |

### P3-G Brands in phase 3

| Option | For | Against |
|---|---|---|
| **(a) Edit a brand's fields (website, socials, country, founding year, contact email, active, slackline-focused); create a brand; no brand rename yet** *(recommended)* | Covers nearly every real need. Brand rename (hazard 4) can wait | A brand rename still needs a developer |
| (b) All of (a), plus rename as a chunked, logged operation outside one transaction | Complete | Non-atomic: a failure part-way leaves a half-renamed brand |
| (c) Products only; brands wait for phase 5 | Smallest | Brand corrections stay hand-edits |

### P3-H Approved suggestions

| Option | For | Against |
|---|---|---|
| **(a) "Apply as edit" on an approved suggestion in triage: it becomes a real edit, channel `submission`, linked to the suggestion** *(recommended)* | Ends the hand-applied JSON patch for the suggestion box's remaining life (until phase 6, D66) | One more button and route |
| (b) Leave triage as is until phase 6 | Nothing to build | JSON patches keep needing a developer |

### P3-I Creating products in phase 3

| Option | For | Against |
|---|---|---|
| **(a) Yes, with the per-type id counter (D26)** *(recommended)* | § 7.1 already says creation works the same way | A counter document, plus a test that it never reissues a seed id |
| (b) Defer creation to phase 6 | Smaller | A new product still needs a developer |

---

## 5. Design (written for the recommended options)

### 5.1 The stored item

- A document carries `data` (canonical, P3-A b) and new envelope fields:
  - `rev`: the item's version for D27, starting at 1 at conversion;
  - `hidden`: plus who, when and why;
  - `merged_into`: the survivor's id.
  - `retired` stays, for import removals.
- **Counters** live in the catalogue table: `_meta/next-id#webbings`, and one per type. They start
  at max(id)+1. Each create advances one with an `UpdateItem ADD` inside the create's transaction.

### 5.2 The write path — one transaction per change

`changelog/writer.py` gains `commit_catalogue_change(store, log, documents, expected_revs, records)`.
Hosted, it is one `TransactWriteItems` (no new permission, D28):

1. a `Put` for each changed document, conditional on `rev = :expected` (or
   `attribute_not_exists` for a create);
2. a `Put` for each log record, conditional on `attribute_not_exists(id)`;
3. an `Update` of `_meta/version` (`ADD n :1`), so every container rebuilds;
4. for a create, an `Update` of the type's counter.

- **On a failed condition:** the API answers **409** with the item's current values and the
  fields that moved since, so the form can offer to re-apply (D27).
- **Locally** (SQLite files): log first, then the documents, then the version, as
  `commit_person_change` does. A failure in between leaves a visible record of an attempt, never an
  unrecorded change.
- **Size:** a merge or a rename with ISA matches is one item plus a few match documents plus the
  records plus the version, well under 100.

### 5.3 The change log grows

- **`TargetType`:** `item` (target id `webbings#12`), `brand`, `isa_warning`, `isa_certificate`.
- **`Action`:** `item.create`, `item.edit`, `item.hide`, `item.unhide`, `item.merge`,
  `item.revert`; `brand.create`, `brand.edit`; `match.repoint` (an ISA match moved by a rename or
  merge).
- **`Channel`:** adds `revert` (with `reverts: <record id>`) and `merge`.
- **`flags`:**
  - `safety` when `breaking_strength` (webbing, weblock, roller, leash ring) or `mbs` (grip)
    changed;
  - one `SAFETY_FIELDS` constant beside `_EXCLUDED` in `submissions/fields.py` (D33).
- `changes` holds model field names, before → after (D31). A merge's `before` is the whole removed
  item.
- **New query routes**, all public:
  - `GET /changes?target=item%23webbings%2312` — uses the existing `target-index`;
  - `?actor=<isa_id>` — needs a new GSI, `actor-index` (`actor_isa_id`, `id`);
  - `?flag=safety`;
  - `?action=…`.

  Filtering by role and kind on Recent Changes runs in memory over recent pages: at expected
  volumes there is no index for it.

### 5.4 Building with hidden and merged items

- `sources_from_documents` skips `hidden` and `merged_into` documents, as it skips `retired` ones.
- The ISA loaders receive the set of hidden and merged ids:
  - a match to one of them is recorded as "on a hidden item", not as a mismatch;
  - a match to a merged id cannot happen, because the merge re-pointed it.
- A **lookup table of hidden and merged ids**, built with the catalogue, lets the gear routers
  answer 404 with `{"hidden": {...}}` or `{"merged_into": N}` (P3-D, P3-E). The routers stay
  `crud_router` reads; the 404 handler consults the lookup.

### 5.5 Routes (`api/routers/edit_router.py`, writable, `require_admin`)

| Route | Body | Does |
|---|---|---|
| `GET /edit/{slug}/{id}` | — | The stored document and its `rev`, including a hidden item (admins) |
| `PATCH /edit/{slug}/{id}` | `{rev, changes: {field: value}, why?}` | Validated against `<X>Update` and the field policy. A rename also re-points ISA `gearNames` (P3-B) |
| `POST /edit/{slug}` | `{fields, why?}` | Create, validated against `<X>Create` |
| `POST /edit/{slug}/{id}/hide` · `/unhide` | `{rev, why}` | Why is mandatory for a hide |
| `POST /edit/{slug}/{id}/merge` | `{rev, into, into_rev, why}` | Why is mandatory, with a minimum length. The source becomes a marker and its ISA matches move |
| `POST /changes/{record_id}/revert` | `{why?}` | Per-field check against the record's `after` |
| `PATCH /edit/brand/{name}` · `POST /edit/brand` | as above | P3-G (a): every field except the name |
| `GET /changes/feed.atom` · `GET /changes/safety.atom` | — | Public feeds (D17, D33) |

- **No catalogue session, ever:** the writes go to the store. `tests/test_read_only.py` lists the
  router as a deliberate writable exception, as it does `people_router`.
- **Not throttled in phase 3**, since admins only. Phase 6 adds `RouteSettings` and `DependsOn`
  (§ 11), and `infra/check-routes.py` enforces it.
- **The raw CRUD writes stay unmounted in store mode** (`CATALOGUE_WRITABLE`), unchanged.

### 5.6 Frontend

| Surface | What |
|---|---|
| Detail page | An **Edit** button for admins. The form is driven by `correctableFields.ts` and `gearFields.ts`: enums as dropdowns, units, currency, and list editors for `gear_sellers`. Then a before → after preview, an optional why, and Save. On a conflict (409): show what moved and keep the typed values |
| Detail page | A **History** section under the specs: the record list with diffs, actor name, role, channel and why. **Revert**, admins only, per record |
| Detail page, admin menu | **Hide**, **Unhide**, **Merge into…** (pick a survivor by search; the explanation is mandatory, with a minimum length) |
| `/changes` | **Recent Changes**: filters (kind, role, safety); link to the feeds |
| `/people/:isaId` | **Contributions** |
| Hidden or merged URL | The page from P3-D / P3-E |
| Listing | An **Add product** button for admins (P3-I) |

A new item has no photos until they are filed under its id (`scripts/fetch_submission_images.py`);
uploads are phase 4.

---

## 6. Build order

Each step is one or more commits on `live-editing/3-admin-editing`, branched from phase 2 (or from
`main` once 0–2 merge). The PRs are stacked: 3a, 3b, 3c.

| Step | Contents | Tests |
|---|---|---|
| **3a.1** Profile the rebuild | Time each loader and pass in `build_engine`. Find and remove the waste (SQL echo, per-row commits, repeated brand queries). Set the Lambda memory from the numbers (P3-C) | A test that the built catalogue is unchanged. A timing budget logged, not asserted |
| **3a.2** Canonical documents (P3-A b) | Write the converter (seeds → built rows → canonical docs). Convert the root seeds in the same commit. Generic loader per type. The ISA and seller passes unchanged. `--check` compares old-format and new-format built catalogues | Every row of every type equal, before and after: the existing `compare()`. Round trip, export byte-identical to the new files. `test_seed_ids` adapted. The whole backend suite green |
| **3a.3** Envelope and write path | `rev`, `hidden`, `merged_into`, counters. `commit_catalogue_change`, hosted and local | Dynamo: stale rev refused and nothing written; a duplicate record id cancels everything; the version bumps once; the counter never reissues an id; 100-item limit not reached by the largest merge |
| **3a.4** The log grows | TargetTypes, Actions, Channels, `SAFETY_FIELDS`, `actor-index` GSI in `serverless.yml`. History, actor and flag queries | Dynamo table built from the template (drift fails). Safety flag on exactly the MBS fields |
| **3b.1** Edit and create routes | `edit_router`: validation, field policy, conflicts, rename re-points ISA names (P3-B), skipped matches made loud | Per field type. ISA statements refused. Renaming a recalled product keeps its warning after the rebuild — **the hazard-2 test**. 409 shape. No catalogue session. Unauthenticated → 401, non-admin → 403 |
| **3b.2** Hide, unhide, merge, revert | Lookups, 404 bodies, ISA re-point on merge | Hidden item absent from lists, present in History. Merged id → pointer. Merge without an explanation refused. Revert refused per moved field |
| **3b.3** Brands, feeds | P3-G (a), Atom | Brand name not editable. Feeds validate as Atom |
| **3b.4** Live-server tests | `test_live_api.py`: a real store-mode server; an admin edit served on the next request; a conflict; the export reproducing the edit | — |
| **3c.1** Edit form, History, Revert | Frontend | Cypress `editing.cy.ts`, against the real API with a scratch store |
| **3c.2** Recent Changes, Contributions, hidden/merged pages, admin actions, Add product | Frontend | Cypress `changes.cy.ts`. Both new specs added to `shards.json` |
| **3c.3** Docs | This file's status, LIVE_EDITING_CHANGES.md, CLAUDE.md (seeding ritual, store mode, the canonical format), SAFETY_AND_ACCURACY.md (who can change what), plan § 16 | — |

Each step ends with the suite for what it touched. Each PR then gets the full backend suite, the
frontend build, lint and unit tests, and the Cypress specs it touches, before it is pushed. CI then
runs everything.

---

## 7. What can be verified where

| | Locally | Only on staging or prod |
|---|---|---|
| The canonical conversion changes no served row | ✓ full compare | Re-run against `slackdata-catalog-staging` after the import |
| Transactions, conditions, counters | ✓ dynamodb-local | IAM: the role allows the transaction's actions on both tables, and the change-log deny still holds |
| Edit visible on the next request in every container | ✓ two local processes on one store | Several warm Lambdas: edit, then hit the CDN repeatedly |
| Rebuild time | ✓ indicative | The Lambda's own log line, at the chosen memory size |
| Feeds | ✓ validator | A real feed reader subscribed to staging |
| A real admin's edit, by ISA sign-in | localhost:5173 proxied to staging (as in phase 2) | — |

**Staging rollout:**
1. deploy;
2. import the canonical store, then `--check`;
3. on localhost:5173 proxied to staging: edit, rename a recalled product, hide, merge, revert;
4. user testing break.

**Prod rollout** after that, using the runbook in this file's final version.

---

## 8. Infra changes

- `serverless.yml`:
  - the `actor-index` GSI on `ChangelogTable`;
  - `memorySize` from step 3a.1;
  - no new table, no new IAM, no new throttled route.
- `preflight.sh`: the shadow check understands the canonical format.
- `verify-deploy.sh`: reports the skipped-match count and the counters.
- Nothing for the ISA. Every write is `PutItem` or `UpdateItem` on `slackdata-*`, already granted.

---

## 9. Decisions to record when this ships

- **D71 (proposed):** the public name is typed in by the person at the first-sign-in notice and can
  be changed once for life (built in phase 1 after staging showed tokens with no name). This
  supersedes D37's "full name from the ISA account". D61 says the client reads `name` /
  `family_name`, but staging tokens carried neither. Worth asking the ISA tech whether that is
  intended; the typed name stays either way.
- The P3-A … P3-I outcomes (§ 4), as D72–D79.
