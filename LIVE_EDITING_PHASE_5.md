# Live editing — Phase 5 (plan)

Phase 5 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 4, § 7, § 13): **manufacturer
accounts**. A signed-in person asks to represent a brand, an admin approves, and from then on they
edit, upload to and revert their own brand's gear live; the machine API's updates apply live too.

**Done when:** a brand updates its own gear end to end.

**Status (2026-10-15): building**, on `live-editing/5-manufacturers`, stacked on phase 4. Every
choice in § 4 was decided on 2026-10-15: the recommended option, (a), on each.

---

## 1. What phase 5 ships

| | |
|---|---|
| **Ask to represent a brand** | On a brand's page, a signed-in person asks "I represent this brand", with a short note. The request shows the admin whether their **verified** email's domain matches the brand's website (D5) |
| **Admin approves or declines** | A queue on `/admin`; approve links the person to the brand, decline closes the request. Both logged. An admin can also unlink later (§ 7.8) |
| **Edit their own gear** | Every field of their own brand's products and of the brand's own entry (except its name and id, D67), live and logged as "manufacturer for X" (§ 6.2) |
| **Create products** | New products of their own brand |
| **Photos and manuals** | The phase 4 dialogs, on their own products and their brand |
| **Revert** | On their own brand's gear (D58) |
| **API keys** | Their brand's machine API keys: create, see, regenerate, revoke, in their account (D64), each logged |
| **The machine API applies live** | An update from a brand's key is applied like an edit by that brand's manufacturer, logged with channel `manufacturer-api` and the key's client id; `applied: true` in the response (§ 7.6) |

**Not in phase 5:** editing by every ISA account and the rate cap (phase 6); ISA certificates and
warnings (phase 7).

---

## 2. Already decided (the plan)

| | |
|---|---|
| D5 | Request → admin approves; the verified-email domain match is shown, never decisive |
| D38 | One person may represent several brands, each by its own approved request; co-listing (`gear_sellers`) gives no rights |
| D53 | Manufacturers are uncapped on their own brand's gear (the cap itself is phase 6) |
| D54 | Every field except the ISA's statements and `gear_sellers` |
| D58 | Manufacturers revert on their own brand's gear |
| D64 | Keys stay viewable in the account; create, regenerate, revoke are logged |
| D65 | A brand sends `Authorization: Bearer <client_id>:<secret>` |
| D67 | A brand's own entry: anyone (phase 6) — but never its name or id |
| § 6.2 | The log labels the change "manufacturer for <brand>" |
| § 7.6 | The machine API applies live with the brand's manufacturer rights, uncapped; renames keep going through `rename_to` |

---

## 3. Hazards found while planning

1. **"Their own gear" is the `brand` field — which they could edit.** A manufacturer moving a
   product to another brand would put it out of their reach and into someone else's, and moving one
   *in* would claim it. → P5-D.
2. **The machine API sends strings.** `changes` is `dict[str, str]` (stringified on the way in, so
   an explicit null survives). Applied live, each value has to become the model's type through the
   same validation an edit gets (`edits.canonical`), and a value that does not convert must fail
   that item with a clear message rather than store "44" as text.
3. **The machine API has no `rev`.** An integration sends what is true now; it never read our rev.
   → P5-F.
4. **Batches were all-or-nothing on resolution only**; the writes were a loop (no transactions were
   granted then). Phase 3's `commit_catalogue_change` does have transactions now (100 items each,
   2 taken by the edit count and version), and `MAX_BATCH_ITEMS` is 50, each item a put + a record
   (+ ISA re-points on a rename). → P5-G.
5. **`image_urls` has nowhere to go.** Photos are uploaded by hand now (phase 4), and an applied
   update creates no submission row for an admin to read the links from. → P5-H.
6. **The approved-but-unapplied manufacturer rows already in the queue** (the three brands' past
   calls, if any) would sit beside live updates. → P5-I.
7. **Staging cannot upload** (phase 4, P4-I b): a manufacturer's uploads are testable locally and on
   prod only, like an admin's.
8. **Pending requests must be listable** without a table Scan (the role has no `dynamodb:Scan`):
   whatever holds them needs a key or an index to query "pending, oldest first". → P5-B.

---

## 4. Decisions

### P5-A Where a person's brand links live — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A `brands` list (catalog ids) on the person's record in the people store** *(chosen)* | Read on every request already (the role lookup, § 4.2), so "may this person edit this item?" costs nothing more; like `roles` | Listing a brand's manufacturers needs an index (or is done from the log) |
| (b) A separate links table, one row per (person, brand) | Both directions are queries | A second read per request; a new table |

### P5-B Where a brand-link request waits — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A small new table, `slackdata-brand-requests-<stage>`, keyed by request id (a ULID) with a "pending" index, oldest first** *(chosen)* | Its own lifecycle (pending → approved / declined), queryable; no ISA request (the role covers `slackdata-*`) | One more table |
| (b) The submissions store, as `kind: brand_link` | The triage queue exists | The anonymous box and its store retire at phase 6 (D66); a request is not a correction |
| (c) A `pending_brands` field on the person | No new store | Listing every pending request needs an index on people anyway |

### P5-C How far a manufacturer's rights reach in phase 5 — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Their own brand's products and entry only** — edit, create, upload, revert. Everything else stays admin-only until phase 6 *(chosen)* | What § 13 says phase 5 is; small, testable, no cap needed yet | — |
| (b) Their own uncapped, and everything else within a cap now | Phase 6's rights early | Builds the cap (D53) now; that is phase 6's |

### P5-D Moving a product between brands (hazard 1) — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A manufacturer cannot change a product's `brand`, and creates only with their own brand; an admin can** *(chosen)* | Nobody claims or dumps a product; the scope check is "the stored brand is mine" | A brand that sold a product line to another maker asks an admin |
| (b) They may move their own product to another brand | Self-service | A product leaves their hands by their own mistake; the other brand gets it unasked |

### P5-E What a manufacturer's change is labelled — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) "manufacturer for <brand>" on changes to that brand's gear; "admin" when the person is also an admin** *(chosen)* | § 6.2; an admin's change reads as an admin's | — |
| (b) Always "manufacturer for <brand>", even for an admin who represents it | The brand's voice is visible | Hides that an admin made it |

### P5-F The machine API and conflicts (hazard 3) — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Applied against whatever is stored now (last write wins), field by field; a field an editor changed since is overwritten, and both changes are in the log** *(chosen)* | The brand is the authority on its own gear (D54); an integration cannot hold a rev; the log shows both | An admin's correction can be overwritten by a nightly sync that sends stale data |
| (b) Refuse a field changed by someone else in the last N days, reported per item | Protects a recent correction | Integrations fail in ways they cannot fix |

### P5-G A machine API batch (hazard 4) — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) All or nothing: every item resolved and validated first, then written in transactions of up to ~30 items; a failure in a later transaction reports which items landed** *(chosen)* | Most batches (≤ 30) are truly atomic; a bad value never half-applies a product | A 50-item batch is two transactions |
| (b) One transaction per item, results per item | Simple; one bad item never blocks the rest | A partial batch is the normal failure, and retries re-send everything |

### P5-H A brand's photo links (hazard 5) — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Kept: an update carrying `image_urls` also files a row in the admin's to-do list (and the brand's manufacturers see it in their account), saying which product and which links, for someone to upload by hand** *(chosen)* | No integration breaks; the links are not lost | A manual step stays |
| (b) Refused from phase 5 (422), and documented as removed | Nothing manual left | Breaks any integration that sends them; a published-API change |
| (c) Accepted and ignored | Nothing breaks | Silently drops what a brand sent |

### P5-I The manufacturer rows already in the queue (hazard 6) — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Left as they are: an admin applies each through the edit form (or marks it handled); nothing new joins them** *(chosen)* | No automatic write from a months-old record | Manual |
| (b) Applied automatically at the switch | Nothing manual | Applies stale values without anyone looking |

### P5-J Which keys apply live — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Every active key of a brand; `BrandPermission` retired** *(chosen)* | § 7.6: the key has the rights of the brand's manufacturers; the three brands' integrations need no change | — |
| (b) Only keys holding `WRITE`; `SUGGEST` keys keep queueing | Finer control | A second permission system beside brand links, and every key today is `SUGGEST` — nothing would change for the three brands |

### P5-K Telling an admin a request is waiting — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A count on the Admin link and the queue on `/admin`; no email** *(chosen)* | The app sends no email today, and adding SES would be an ISA request | An admin has to look |
| (b) Email the admins (SES) | Prompt | A new AWS permission; personal addresses in the sending path |

---

## 5. Design (for the recommended options)

**People store:** `Person.brands: list[int]` (catalog ids). `role_label(brand_id)` returns
`admin`, else `manufacturer for <brand>` when the change is on one of their brands, else `editor`.

**Permission, one function** (`slack_data/people/rights.py`): `may_edit(person, collection,
entry)` — admins anything; a manufacturer when the entry's brand (canonical name → catalog id) is
one of theirs; nobody else in phase 5. `edit_router` swaps `require_admin` for `require_person` +
this check on items, brands, media and revert; merges, ISA matches and `gear_sellers` stay
admin-only; `brand` stays admin-only on an existing product (P5-D).

**Requests:** `BrandRequest {id, sub, isa_id, catalog_id, note, email_domain_matches, status,
created_at, decided_at, decided_by}` in `slackdata-brand-requests-<stage>`, query index on status.
Routes: `POST /me/brand-requests`, `GET /me/brand-requests`; admin `GET /admin/brand-requests`,
`POST /admin/brand-requests/{id}/approve|decline`, `POST /admin/brand-links/{sub}/{catalog_id}/unlink`.
A request is not a change, so it is not logged; approving one is: `brand.link`, and an unlink
`brand.unlink`, each on the person, naming the brand.

**Keys on the site:** `GET/POST /me/brands/{catalog_id}/keys`, `POST …/{client_id}/regenerate`,
`POST …/{client_id}/revoke` — for that brand's manufacturers and admins; logged `key.create`,
`key.regenerate`, `key.revoke` on the brand (never the secret).

**The machine API:** `submit_gear` resolves and validates every item (strings through
`edits.canonical`), then commits each item's put and its record (channel `manufacturer-api`,
`actor` = the brand client, role "manufacturer for <brand>") in transactions; a new product goes
through `create_item`; `applied: true`. Items with `image_urls` (P5-H a) also file a to-do.

**Frontend:** "I represent this brand" on the brand page; "Your brands" and their keys in the
account menu; the request queue on `/admin`; the edit controls shown wherever `may_edit` holds
(the API answers `can_edit` per item so the page needs no copy of the rule).

---

## 6. Build order (stacked on phase 4, one PR)

| Step | Contents |
|---|---|
| **5a** Links and rights | `Person.brands`, `rights.py`, role labels; edit routes opened to manufacturers on their own gear; tests |
| **5b** Requests | the requests store (SQLite, in-memory, DynamoDB), routes, approve/decline/unlink, logged; infra table |
| **5c** Keys on the site | key routes over the brand-clients store, logged |
| **5d** Machine API live | apply instead of queue; transactions; `image_urls` to-dos; docs for brands |
| **5e** Frontend | request button, account brands and keys, admin queue, edit controls for manufacturers |
| **5f** Staging, docs | deploy; verify-deploy; DESIGN.md, CLAUDE.md, MANUFACTURER_API.md |
