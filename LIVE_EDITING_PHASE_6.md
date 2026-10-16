# Live editing — Phase 6 (plan)

Phase 6 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 4, § 7, § 13): **editing opens to
every ISA account**, within the rate cap; admins can block an account; the anonymous suggestion box
is switched off.

**Done when:** anyone with an ISA account edits, and no hand-applied JSON patch remains.

**Status (2026-10-15): built (6a–6f)**, on `live-editing/6-open-editing`, stacked on phase 5. See § 6. Every choice in § 4 was decided on 2026-10-15: the
recommended option, (a), on each — except **P6-C, decided (b)**: sliding windows. Built so far: the site-wide **Sign in** button in the top nav (fc989e70), which needed
no decision.

---

## 1. What phase 6 ships

| | |
|---|---|
| **Everyone edits** | Any signed-in ISA account edits every field of every product and of every brand's entry, except the ISA's statements, `gear_sellers` (D54) and a brand's name (D67). Creates products and brands; uploads photos and manuals (D59) |
| **The rate cap** | No more than 20 saves in any 60 minutes and 100 in any 24 hours per account (D53, P6-C). Manufacturers on their own brand's gear and admins are exempt |
| **Blocking** | An admin blocks an account, with a reason; it can still read and sign in, but not save anything (D22). Logged, and so public |
| **The box is switched off** | No more anonymous suggestions (D56, D66). Triage stays only for what is already stored |
| **Sign in from anywhere** | Built: the top nav's **Sign in** returns to the page the person was on |

**Not in phase 6:** ISA certificates and warnings (phase 7); renaming a brand (D78); revert for
editors (D58: admins anywhere, manufacturers on their own gear).

---

## 2. Already decided (the plan)

| | |
|---|---|
| D52 | Every signed-in ISA account edits live; no proposals, no queue |
| D53 | 20 an hour, 100 a day; each save counts (an edit, a new product or brand, an upload); told when they can edit again; manufacturers exempt on their own gear, admins exempt; counted on the people record, in the edit's transaction |
| D54 | Every field except `isa_*` and `gear_sellers` |
| D22 | Blocking: admins only, a logged reason; a blocked account reads and signs in, never edits, creates or uploads |
| D58 | Revert: admins anything, manufacturers their own gear. Editors fix a bad edit by editing |
| D59 | Products, brands, photos and manuals: anyone, live, within the cap |
| D66 | The box is switched off at phase 6; stored suggestions expire on their existing TTL (365 days) |
| D67 | A brand's own entry: anyone, except its name and id |
| D70 | People are told at first sign-in that their name is public |

---

## 3. Hazards found while planning

1. **A product's `brand` decides who manages it** (phase 5). If any editor may change it, an editor
   can move a product into a manufacturer's reach or out of it, and the manufacturer's uncapped
   rights follow the edit. → P6-A.
2. **The notice is a modal, not a rule.** D70's condition (told before their name is public) holds
   in the browser only; a direct API call could publish an edit under a name the person never saw
   the notice for. → P6-B.
3. **Counting in the edit's transaction.** Hosted, the people table joins the catalogue
   transaction as a conditional `UpdateItem` (granted on `slackdata-*`). Locally, as in every other
   two-store write, it is a check before and a write after. The transaction limit is untouched: the
   cap never applies to the machine API's batches.
4. **More edits mean more rebuilds.** Each save bumps the catalogue version and every warm
   container rebuilds on its next request (D30). D74 deferred an incremental rebuild "only if phase
   6 needs it": measured on staging before prod, not built ahead.
5. **The box has an infra footprint.** `POST /submissions` is a throttled route in
   `RouteSettings` and `HttpApiStage.DependsOn` (`infra/check-routes.py`); Turnstile's secret is a
   parameter; `VITE_ENABLE_SUBMISSIONS` gates the button. All of it goes together, or the deploy
   fails as on 2026-08-25.
6. **Approved manufacturer to-dos still live in the submissions store** (photo links, P5-H). The
   store, triage and `GET /manufacturer/submissions` therefore stay; only the public route goes.

---

## 4. Decisions

### P6-A Who may change a product's `brand` — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Admins only, for everyone** — the phase 5 rule for manufacturers, extended to editors *(recommended)* | One rule; nobody moves a product into or out of a manufacturer's hands by an edit; a wrong maker is rare, and an admin fixes it | A narrowing of D54's "every field"; an editor who spots a wrong maker has to ask |
| (b) Any editor, as D54 reads | D54 as written | An edit hands a product to another brand's manufacturers, uncapped; a vandal can strip a brand's management |

Creating a product still names its brand — any brand for an editor, their own for a manufacturer.

### P6-B Editing before the first-sign-in notice is acknowledged — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) The API refuses every save until the notice is acknowledged** (403, "acknowledge the notice first") *(recommended)* | D70's condition holds on the server, not only in the browser; acknowledging also sets the public name, so no edit is published as a bare ISA id | One more refusal path (the site never shows it: the modal comes first) |
| (b) Browser only, as today | Nothing to build | A direct API call publishes a name its owner was never told about |

### P6-C The cap's windows — **DECIDED 2026-10-15: (b)**

| Option | For | Against |
|---|---|---|
| **(a) Clock windows**: this UTC hour, this UTC day, two counters on the people record (D53's wording) *(recommended)* | Two numbers, one conditional update; "you can edit again at 15:00" is exact | Up to 40 saves across an hour boundary (and 200 across midnight) |
| (b) Sliding windows: the last 100 save times on the record | Exactly 20 in any 60 minutes | A list rewritten on every save; harder to explain the wait |

### P6-D What a blocked person sees, and where an admin blocks — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Block / Unblock on the person's contributions page** (`/people/<isa id>`), reason required; a **Blocked accounts** list on /admin; the blocked person sees a banner with the reason and no edit buttons *(recommended)* | The admin blocks from where they saw the edits; the person knows why; one list to review | — |
| (b) Only a form on /admin, by ISA id | One place | Copying an id from the page where the problem is |

Either way: logged as `person.block` / `person.unblock` with the reason, so public (D3). A block
stops saves, uploads and brand requests; a manufacturer's brand's **API keys keep working** — they
are the brand's, not the person's, and an admin revokes a key separately.

### P6-E Anonymous visitors and the Edit button — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) "Edit" shown to everyone**: anonymous, it signs in and comes back with the editor open *(recommended)* | It replaces "Suggest a correction" as the invitation to fix something | A visitor without an ISA account meets the ISA's sign-up |
| (b) Only after signing in (the nav button) | Nothing anonymous changes | Nobody learns the site is editable |

### P6-F Showing the cap — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Only at the cap**: the save is refused, the editor keeps what was typed, and is told when they can save again *(recommended)* | D53 as written; nothing on screen for the 99% who never get near it | A burst ends with a surprise |
| (b) A count of saves left in every editor | No surprise | Noise, and an invitation to treat 100 as a target |

### P6-G Suggestions already stored — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Triage keeps them until they are dealt with**: "Approve" (which produced a JSON patch) becomes **"Open item"** — the admin edits it live — then **Mark handled**; "Reject" stays *(recommended)* | No patch is ever applied by hand again (phase 6's "done when"); nothing a member of the public sent is dropped | The queue lives until it is emptied or expires (≤ 365 days) |
| (b) Close every pending one at switch-off, with a note | A clean cut | Drops real corrections unread |

Approved rows already waiting (manufacturer photo links, P5-H) are unchanged: upload, then Mark handled.

### P6-H The public route after switch-off — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Removed**: `POST /submissions` is not mounted, the throttle, Turnstile parameter and dialog are deleted *(recommended)* | Less surface; matches D56 | An old cached page posting gets a 404/405 |
| (b) Kept, answering 410 Gone with "sign in and edit" | A friendlier message to stale tabs | A route and its throttle kept only to say no |

---

## 5. What gets built

| Step | Content |
|---|---|
| 6a | Rights: `may_edit` true for any person not blocked; `ADMIN_ONLY_FIELDS` per P6-A; merge stays admin; `create_brand` opens; the notice rule (P6-B) |
| 6b | The cap: counters on `Person`, a `CapExceeded` (429 with `retry_at`), counted in `commit_catalogue_change` (hosted: in the transaction; local: check then write), exempt per D53 |
| 6c | Blocking: `Person.blocked_at/blocked_reason/blocked_by`, `POST /admin/people/{isa_id}/block|unblock`, `person.block|unblock` in the log, `/me` says so |
| 6d | Frontend: edit, create, media and brand dialogs for every signed-in person; anonymous Edit (P6-E); the cap message; blocked banner; Block on contributions; Blocked list on /admin |
| 6e | The box switched off (P6-G, P6-H): route, throttle, Turnstile, dialog, flag; triage's "Open item" |
| 6f | Docs (CLAUDE.md's Submissions section, SAFETY_AND_ACCURACY.md, SUBMISSIONS_PLAN.md marked superseded), Cypress (`open_editing.cy.ts` in `shards.json`), verify-deploy |

Testing as before: backend suite with dynamodb-local, the Cypress specs touched, staging deploy.

---

## 6. As built (2026-10-15)

| Step | Where |
|---|---|
| 6a–c | `catalogue/rights.py` (everyone edits unless blocked; `manages` for revert and the cap); `people/ratecap.py` (the sliding windows, `CapExceeded` → 429 with `retry_at`); `changelog/writer.py` (the count joins the edit's transaction as a conditional `UpdateItem` on the people table, `CapRace` → 503); `Person.blocked_*`, `saves`, `saves_rev`; the sparse `is_blocked-index`; `POST /admin/people/{isa_id}/block|unblock`, `GET /admin/people/blocked`; `person.block|unblock` in the log; `require_editor` refuses a blocked account and one that has not acknowledged the notice |
| 6d | `AuthContext` (`canEdit`, `canManageBrand`, `blockedReason`); Edit for everyone and an anonymous Edit that signs in and reopens the editor (`?edit=1`); the cap message (`utils/rateCap.ts`); the blocked banner; Block / Unblock on `/people/<isa id>` and Blocked accounts on /admin (`components/account/Blocking.tsx`) |
| 6e | The public `POST /submissions`, Turnstile, honeypot, throttle and dialog removed; triage rows link to the item (editor open) and close with Mark handled / Reject — no Approve, no JSON patch |
| 6f | Tests: `tests/test_open_editing.py`, Dynamo tests for the count and the blocked index, `cypress/e2e/open_editing.cy.ts` (in `shards.json` in place of `submissions`), `admin_triage.cy.ts` rewritten around a manufacturer's photo to-do. Docs: CLAUDE.md, SAFETY_AND_ACCURACY.md, DESIGN.md, SUBMISSIONS_PLAN.md (superseded), infra/README.md, DEPLOY.md |

**Choices made while building, inside the decisions:**

- **Which saves count is read off the log records**: a save recorded as `editor` counts; `admin`
  and `manufacturer for <brand>` do not. That is exactly D53's exemption, by the same rule that
  labels the change, and it covers the machine API without a special case.
- **A media save is checked against the cap before the upload is published**, so a refused save
  leaves no orphan in the media bucket.
- **The notice is required by `require_editor`**, so uploads and the edit form's reads need it too.
- **A blocked account cannot manage its brand's keys**, though the keys keep working (P6-D).
- **Not built:** the D74 incremental rebuild. To measure on staging under real edits before prod.

**Prod rollout:** the deploy that ships this removes the `POST /submissions` route and its throttle
in one stack update (CloudFormation updates the stage, then deletes the route), adds the people
table's `is_blocked-index` (one GSI, online), and stops reading `TURNSTILE_SECRET`. Prod's one
pending suggestion stays in triage.
