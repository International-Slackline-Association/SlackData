# Live editing with ISA accounts — the design

**Status: design, decided 2026-10-04, revised 2026-10-05 to open editing; nothing built yet.** Supersedes
[SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md) §§ Phase 3–4. The previous version of this file was an
analysis of what live editing would cost; this one records what was decided and what is still
open.

**The goal:** Wikipedia-style, mostly hands-off maintenance. **Anyone who signs in with an ISA
account changes the catalogue live** — there is no suggestion or approval system. A per-account
cap on changes per hour and per day guards against tampering; manufacturers are exempt on their
own gear. **Every change is recorded, permanently and publicly, with who made it and how.**
Changing data never needs a developer or a deploy.

Why: SlackDB worked while a handful of people could edit it freely, and died the moment nobody
could. The present "suggest a correction" model, where every change is a JSON patch applied by
hand and shipped by a redeploy, recreates SlackDB's bottleneck with one person in it.

**How to read this file.** § 1 is settled. Everything after it is the design those decisions
imply. Anything that is *not* settled is in § 14, **Open choices**, with its options and
tradeoffs, and is marked **UNDECIDED** — a recommendation there is only a recommendation.

---

## 1. Decisions

Decided by the ISA's reply and by the project owner, 2026-10-04. Numbers are referenced
throughout.

| # | Topic | Decision | Rejected |
|---|---|---|---|
| D1 | Who edits live | *Superseded by D52 (2026-10-05).* Was: **Maintainers and approved manufacturers edit live.** Anyone with an ISA account **proposes**; a trusted person approves | Any account editing live (no check before a wrong breaking strength is public); only maintainers live (contradicts the ISA's "manufacturers can change everything") |
| D2 | Manufacturer scope | *Extended to every editor by D54 (2026-10-05).* **Every field on their own gear, safety specs included** — except the ISA's statements (`isa_certified`, `isa_certificate`, `isa_class`, `isa_warning`) and `gear_sellers` | Literally everything (a brand could clear a recall on its own product); safety fields under review (stricter than the ISA asked) |
| D3 | Who sees the change log | **Public, with names**: History on every item, a site-wide Recent Changes, a contributions page per person | Names visible to maintainers only; log visible to maintainers only |
| D4 | Where the data lives | **DynamoDB is the source of truth**; a daily export goes to git | Git as the truth with the site committing for you (minutes per edit, a repo-write credential in a public Lambda, CI needing AWS deploy rights); an overlay over the baked catalogue (two truths, never hands-off); the JSON files in S3 (no atomic edit + log write) |
| D5 | Becoming a manufacturer editor | **Request → admin approves**, shown whether the account's verified email domain matches the brand's website | Automatic on a domain match (a company mailbox is not authority over a brand; many small brands use gmail); invitation only |
| D6 | Becoming a maintainer | *Superseded by D55 (2026-10-05).* Was: **Request → admin grants**, shown the requester's record of accepted proposals | Automatic after N accepted proposals (farmable, nobody vouched); SafeCom invitation only |
| D7 | Admins | **The project owner and SafeCom members.** Granting admin is itself a logged change | One admin; SafeCom only |
| D8 | Where roles are stored | **Our own table**, as SportHub does; no groups in the shared ISA pool | Cognito groups in `isa-users` (every grant an ISA console action, invisible to our log, visible across ISA apps) |
| D9 | Today's SlackData admin pool | **Retired as soon as ISA sign-in works.** No break-glass second login | Kept for a period; kept permanently |
| D10 | Anonymous "suggest a correction" box | *Superseded by D56 (2026-10-05).* Was: **Kept**, beside accounts. A maintainer turns a good suggestion into a real edit | Sign-in required to suggest |
| D11 | Log retention | **Forever.** On an erasure request the person's name is **anonymised on the site**; the edits stay | Names kept unconditionally; names expiring after N years |
| D12 | Photos and manuals | *Superseded by D59 (2026-10-05).* Was: **Uploaded on the site.** Live for maintainers and manufacturers, pending for contributors | URLs only; deferred |
| D13 | Export | **Daily, data and log with names, to a separate data repo** | Pseudonymous ids in the export; data only; no export |
| D14 | Export vs. erasure | **Names stay in git; on an erasure request the data repo's history is rewritten.** Consequences in § 6.6 | Pseudonymous ids in git; refusing erasure |
| D15 | Revert | *Superseded by D58 (2026-10-05).* Was: Maintainers and admins revert anything; **manufacturers revert on their own gear.** A revert is a new logged change, never a deletion of history | Maintainers and admins only |
| D16 | Edit summary ("why") | **Optional** | Always required; required on safety fields |
| D17 | Telling maintainers there is work | *Superseded by D55 (2026-10-05).* Was: **On-site pending badge + RSS/Atom feed.** No email | Weekly email digest (SES production access); digest to one shared inbox |
| D18 | A manufacturer changing a safety spec | *Superseded by D57 (2026-10-05).* Was: **Flag it and alert maintainers** — highlighted in Recent Changes and in a dedicated safety feed and badge. On ISA-certified items the certificate's own tested value stays shown beside the edited spec. **Live immediately** | Nothing beyond the log; blocking until reviewed |
| D19 | New items and brands | *Superseded by D59 (2026-10-05).* Was: Maintainers create items and brands live; manufacturers create their own brand's products live; contributors propose | New brands admin-only |
| D20 | Deletion | **Nothing is deleted, except duplicates — by admins only**, with a mandatory, detailed explanation, prominently logged. The removed id **redirects to the item it duplicated** | Truly removing the row (breaks links, ISA matches, credentials) |
| D21 | Who approves a proposal on a brand's gear | *Superseded by D52 (2026-10-05).* Was: **Maintainers, and that brand's manufacturer editors.** A maintainer can override a brand's decision | Maintainers only |
| D22 | Blocking an account | **Admins only**, with a logged reason | Maintainers temporarily; any maintainer |
| D23 | Rollout | **Phased**, each step live on its own and stoppable | One big switch-over |
| D24 | ISA certifications and warnings | **Both**: imported in bulk from the ISA's lists, matched and corrected by admins on the site. **The eventual goal is an automatic ISA sync** | Admin-only hand maintenance; script-only |
| D25 | How the site reads | **Load the whole catalogue into memory** and serve it through today's read code | Querying DynamoDB per request (a full read-path rewrite, and derived fields stored on items going stale) |

### Second round — the technical choices (2026-10-04)

These were open choices in the first version of this file; the O-numbers they had are kept in
brackets so earlier discussion still lines up.

| # | Topic | Decision | Rejected |
|---|---|---|---|
| D26 | Ids for items created on the site (O-1) | **A per-type counter** in DynamoDB, incremented atomically on create — plain numbers, as today | A reserved numeric range; non-numeric ids |
| D27 | Two people editing one item (O-2) | **Every item carries a version.** A save based on an outdated version is refused, and the editor is shown what changed meanwhile. The same applies to reverting a field that has changed again since | Last write wins |
| D28 | Writing an edit and its log record together (O-3) | **One DynamoDB transaction**: both writes succeed or neither. *Corrected 2026-10-05:* this needs **no new permission** — IAM has no `TransactWriteItems` action; a transaction is authorised against the `PutItem` / `UpdateItem` of each item in it, which the role already grants on `slackdata-*` | Ordered writes plus a repair check |
| D29 | Table layout (O-4) | **Separate tables** — people, catalogue, log | One table for everything |
| D30 | When the in-memory catalogue is re-read (O-5) | **Every request checks a "catalogue version"** and rebuilds only if it changed, so an edit shows immediately everywhere. A person's role is re-read on every authenticated request | Rebuilding every N seconds |
| D31 | What a log record stores (O-6) | **Only the changed fields, before → after.** Revert applies the "before" values; seeing an item as it was on a past date means replaying its records | A full copy of the item per change; both |
| D32 | Rate limits (O-8) | *Superseded by D53 (2026-10-05).* Was: **API Gateway route throttles**, as the suggestion box has. Blocking (D22) is the backstop | Per-account limits in the app |
| D33 | Safety-critical fields (O-9) | **MBS only**: `breaking_strength` on webbing, weblocks, rollers and leash rings; `mbs` on grips. And **all feeds are public** — anyone can follow Recent Changes without signing in | A wider list (WLL, stretch, …) |
| D34 | Local development and tests (O-11) | **The SQLite repository, filled from a snapshot of the data repo** — no AWS needed, as today | dynamodb-local for local dev |
| D35 | What still needs a developer (O-12) | **The § 10 line stands**: new gear types, fields and enum values stay code, reviewed in a PR | A schema admins can extend on the site |
| D36 | Phase order (O-13) | *Superseded by D60 (2026-10-05).* Was: **Live editing → media → manufacturers → contributor proposals** (§ 13) | Manufacturers before media; contributors before manufacturers |
| D37 | Which name is public (O-14) | **Full name** | First name + initial; a chosen display name |
| D38 | Brand links (O-15) | **One person may represent several brands. Co-listing gives no edit rights** — a brand in another's `gear_sellers` cannot edit that product | One brand per person; co-listers editing |
| D39 | Manufacturers and their own brand entry (O-16) | *Superseded by O-20 (reopened) (2026-10-05).* Was: **Editable** — website, socials, contact email, country, founding year — logged; **except the brand's name and id** | Brand entries maintainer-only |
| D40 | Who may hide an item (O-17) | *Superseded by D55 (2026-10-05).* Was: **Maintainers and admins only.** A brand marks a product historic (`active: false`) instead — hiding a product under an ISA warning would remove a recall from view | Manufacturers hiding their own gear |
| D41 | How sign-in loads (O-18) | **On demand**, when someone presses "Sign in" — the public site stays as fast as today | Loaded on every page |

### Third round — the last open choices (2026-10-04)

| # | Topic | Decision | Rejected |
|---|---|---|---|
| D42 | A hash chain on the log (O-6b) | **No.** The catalogue is not a high-value target for tampering; the daily export (§ 6.6) is the outside check | Chaining each record to the previous one |
| D43 | Making the log unalterable, and anonymisation (O-7) | **The ISA adds an explicit deny of `UpdateItem` and `DeleteItem` on the log table**, so AWS itself refuses to change or remove a record. *Limit, found 2026-10-05:* IAM cannot stop a `PutItem` that **overwrites** an existing record — no condition key can demand `attribute_not_exists` — so our code makes every log write conditional, every record gets a fresh time-ordered id, and the daily export is what would reveal an overwrite. **Names are kept out of the log:** records hold the person's `sub` and ISA id, and the name is looked up from the people store when a page or the export is produced. Anonymising someone is one change to their people record. If a person renames their ISA account, their old edits show the new name; their role at the time stays in each record | No deny, names in each record (append-only by code alone); deny with names in each record and anonymisation as a manual AWS procedure (needs a developer and an ISA admin every time) |
| D44 | Processing photos (O-10.1) | **In the browser, before upload**: resized to a few standard sizes and re-encoded, which also strips camera metadata including GPS. The server still checks type and size | A server-side image Lambda (a new function, trigger and ISA request); no processing (slow on phones, publishes GPS) |
| D45 | Upload limits (O-10.2) | **Photos JPEG/PNG/WebP up to 10 MB before processing; manuals PDF up to 25 MB** | 5 MB / 10 MB |
| D46 | Contributor uploads (O-10.3) | *Superseded by D59 (2026-10-05).* Was: **The same pending queue as proposals**, decided by the same people (D21) | Maintainers only; contributors pasting links |
| D47 | Today's images and manuals (O-10.4) | **Migrated once into the media bucket in phase 4**, logged as an `import`; the build-time manifests retired in the same step | Both side by side for a while; never migrating |
| D48 | Where media is served from (O-10.5) | **A path on the existing site** (`slackdata.org/media/…`), a second origin on the current CloudFront distribution | A `media.slackdata.org` subdomain with its own distribution |
| D49 | Which data snapshot tests use (O-11b) | **A pinned, dated snapshot** of the data repo, refreshed deliberately in its own PR, so an edit on the site never turns CI red | The latest export on every run |

### Fourth round — dealing with the ISA (2026-10-05)

| # | Topic | Decision | Rejected |
|---|---|---|---|
| D50 | When to ask the ISA | **Everything up front, in phase 0** — one conversation and one role change, so no later phase waits on the ISA. Grants sit unused until their phase, as Tier 3's S3 grant already does | The phase 1 set now and the rest later; strictly per phase |
| D51 | Who creates SlackData's app client in `isa-users` | **Our stack**, in [serverless.yml](infra/serverless.yml) against the ISA pool's id, **with the ISA's written OK**. It touches only our client, never the pool's settings, and we change callback URLs by deploying | The ISA creating it by hand (every callback change a request to them) |

### Fifth round — open editing (2026-10-05)

These replace the proposal-and-approval model. Earlier rows they override are marked
*Superseded* above, and their old text is kept as history.

| # | Topic | Decision | Rejected |
|---|---|---|---|
| D52 | Who edits live | **Every signed-in ISA account edits live.** There are no proposals and no approval queue: anyone with an ISA account is trusted enough, and the log, the rate cap (D53) and admin blocks (D22) are the safeguards | Proposals approved by trusted people (the old D1) — a queue someone has to watch is the SlackDB bottleneck again |
| D53 | Guarding against tampering | **A per-account cap: 20 changes an hour and 100 a day.** Each save counts — an edit, a new product or brand, an upload. At the cap, the person is told when they can edit again. **Exempt:** manufacturers on their own brand's gear (capped like anyone elsewhere), and admins. Counted in the app, in the people store — no new AWS permission. API Gateway route throttles stay as a coarse backstop | Per day only; numbers set later; manufacturers exempt everywhere; admins capped |
| D54 | What an editor may change | **Every field of every product**, for everyone — except the ISA's statements (`isa_certified`, `isa_certificate`, `isa_class`, `isa_warning`) and `gear_sellers`, which only admins change. A manufacturer's products are **not** locked to that manufacturer | Locking a managed brand's products to its maker; locking only MBS |
| D55 | Maintainers | **The role is dropped.** Tiers are: anonymous, editor (any ISA account), manufacturer, admin. What maintainers were for — reviewing proposals, patrolling — has no work left, or falls to admins (hiding, D40; blocking, D22) | Keeping maintainers as patrollers; keeping them as cap-exempt editors |
| D56 | The anonymous "suggest a correction" box | **Removed.** To change something, sign in and edit. When it is switched off: O-19 | Keeping it as a queue editors act on |
| D57 | Breaking-strength (MBS) edits | **Shown in a public safety feed; nobody has to review them.** Any MBS change, by anyone, is marked `safety` in the log. On ISA-certified items the certificate's own tested values stay shown beside the edited spec | Every MBS edit flagged until an admin marks it seen; flagging only manufacturers' MBS edits |
| D58 | One-click revert | **Admins revert anything; manufacturers revert on their own gear.** Everyone else fixes a bad edit by editing it. A revert is a new logged change | Anyone signed in reverting anything |
| D59 | Creating products, brands, photos and manuals | **Anyone, live, within the cap** | New brands admin-only; non-manufacturer uploads admin-checked |
| D60 | Phase order | **D36's order, re-cut for open editing:** live editing for admins → media → manufacturers → editing opens to every ISA account (§ 13) | — |

---

## 2. What we build on (researched, not chosen)

### 2.1 ISA accounts already exist, and other ISA apps already plug into them

The ISA runs **one shared Cognito user pool, `isa-users`** (`eu-central-1_iGaYGKeyJ`, hosted
sign-in at `auth.slacklineinternational.org`), in the same AWS account SlackData deploys to. The
code is public: `International-Slackline-Association/isa-users` on GitHub.

- **Each ISA app has its own app client in that pool.** SlackMap (`slackmap.com`) has one,
  account.slacklineinternational.org has another. SlackData would get a third.
- **Sign-up, email verification and password reset are the pool's job, not the app's.**
  isa-users' own Lambda creates the user record on sign-up and sends the verification mail. So
  SlackData never sends account email — which removes what used to be the hardest part of
  accounts: SES production access, bounces and a sending reputation
  ([infra/LAMBDA_ROLE_PERMISSIONS.md](infra/LAMBDA_ROLE_PERMISSIONS.md) § Tier 2).
- **Every account has an ISA id**, `ISA_` + the first 8 hex characters of
  sha256(cognito username), computed by isa-users. Because it is derived from the username in the
  token, SlackData can compute it without reading isa-users' table.
- **SportHub (slacklinesport.org) documents the pattern** in its `docs/AUTHENTICATION.md` and
  `docs/RBAC.md`: Cognito says *who you are*; the app's own DynamoDB table says *what you may do*;
  the ISA's identity data is never written by the app. D8 follows it.
- **SlackMap already does per-item editors and a changelog** — its DynamoDB design holds
  `featureEditor:{userId}` and `changelog:{date}` rows. What is proposed here is not new to the
  ISA.

### 2.2 Code in this repo that carries over

| What | Where | Role in the new design |
|---|---|---|
| Two token verifiers sharing a JWKS cache | [slack_data/api/auth.py](slack_data/api/auth.py) — `verify_cognito_token`, `verify_manufacturer_token`, `signing_key()` | A third verifier, for ISA tokens, sits beside them (§ 4.2) |
| Repository Protocol + SQLite + DynamoDB, chosen by env var | [slack_data/submissions/repository.py](slack_data/submissions/repository.py), `store.py` | The pattern for the catalogue, people and log stores — keeps pytest and Cypress free of AWS |
| Field lists derived from the models, never written down | [slack_data/submissions/fields.py](slack_data/submissions/fields.py) — `_EXCLUDED`, `MANUFACTURER_EXCLUDED` | Becomes the field policy for D54: what no editor may change |
| Field metadata for the suggestion form | [frontend/src/config/correctableFields.ts](frontend/src/config/correctableFields.ts), `gearFields.ts`, `specRows.ts` | Drives the typed edit form |
| "Could this update be applied directly?" | `may_write_directly()` in [slack_data/models/brand_clients.py](slack_data/models/brand_clients.py); `applied` in the manufacturer API's response | Flips to true; brands' integrations need no change (§ 7.6) |
| Monotonic ULIDs | [slack_data/utilities/ulid.py](slack_data/utilities/ulid.py) | Log record ids: sorting by id is sorting by time |
| Today's derivation passes | `load_data/load_isa_warnings.py`, `load_isa_certifications.py`, `load_seller_brands.py`, `load_manufacturers.py` | Run unchanged over the in-memory catalogue (§ 5.2) |
| Tables built from the deploy template in tests | [tests/test_dynamo_stores.py](tests/test_dynamo_stores.py) | Every new table goes here, so template/code drift fails in CI |
| A private quarantine bucket for uploads | `UploadsBucket` in [infra/serverless.yml](infra/serverless.yml) | Where uploads land before they are published (§ 8) |

The Lambda role today grants `PutItem`, `GetItem`, `Query` and `UpdateItem` on
`table/slackdata-*` and its indexes — and nothing else in DynamoDB: no `DeleteItem`, no `Scan`,
no `BatchWriteItem`. Transactions are covered, because IAM authorises them against the `PutItem` /
`UpdateItem` inside them; there is no separate transaction permission. New tables named
`slackdata-*` are covered by the existing grant; anything beyond those four verbs is an ISA
request (§ 12).

---

## 3. How it fits together

```
 Browser ──sign in──► ISA pool (isa-users) — hosted at auth.slacklineinternational.org
    │                     │ ID token, audience = SlackData's app client
    ▼                     ▼
 API Lambda ── verify_isa_token (public JWKS, no AWS permission needed)
    │
    ├── people store ......... roles, brand links, blocks, rate counts (who may do what — D8, D53)
    ├── catalogue store ...... gear items, brands, ISA certs/warnings (the facts people type — D4)
    ├── change log ........... every change of any kind, append-only  (D3, D11)
    │
    └── in-memory catalogue ── built from the catalogue store, today's derivation passes run
           over it, served through today's read code (D25); rebuilt when something changes

 Daily GitHub Action ── public API ──► separate data repo: gear data + change log (D13)
```

The manufacturer machine API stays, now feeding the same edit-and-log path. The anonymous
suggestion box is retired (D56, O-19).

---

## 4. Identity and roles

### 4.1 The tiers

| Tier | Who | Can | Becomes one by |
|---|---|---|---|
| Anonymous | anyone | read | — |
| Editor | any signed-in ISA account | live edits to every field of every product except the ISA's statements and `gear_sellers` (D54); create products and brands; upload photos and manuals (D59) — all within the rate cap (D53) | signing in |
| Manufacturer | an ISA account linked to one or more brands (D38) | everything an editor can, plus: **no rate cap on their own brand's gear** (D53) and one-click revert there (D58). Their changes are labelled "manufacturer for X" in the log. Co-listing gives no extra rights (D38) | request → admin approves (D5) |
| Admin | the project owner, SafeCom members (D7) | everything, uncapped (D53), plus: revert anything (D58); hide and unhide (D40); grant and revoke admin and manufacturer links; block accounts (D22); merge duplicates (D20); match and correct ISA certifications and warnings (D24) | an existing admin; the first one bootstrapped (§ 4.4) |

There is no maintainer tier (D55). Every grant, revocation, brand link and block is itself a
record in the change log (§ 6).

### 4.2 Plugging into the ISA pool

- **SlackData gets its own app client in `isa-users`**, defined in our stack with the ISA's
  written OK (D51), shaped like today's `AdminUserPoolClient`:
  - no secret (a browser cannot keep one); authorization code + PKCE; scopes `openid email`;
  - read access to `name` and `family_name` (the public full name, D37) and `email` /
    `email_verified` (the manufacturer-request signal, D5);
  - callback and sign-out URLs for `slackdata.org`, `www.slackdata.org` and `localhost:5173`.
    Cognito matches callback URLs exactly, with no wildcards — a missing one reads as a broken
    login (`redirect_mismatch`), not a config error.

  Our own client, rather than reusing SlackMap's, is what makes the token's `aud` mean "issued
  for SlackData": a token leaked from another ISA app is refused.
- **`email_verified` can be false.** isa-users confirms a new account at once and verifies the
  address later, through a link it emails. The D5 domain signal counts only verified addresses.
- **A third verifier, `verify_isa_token`**, beside the two in
  [auth.py](slack_data/api/auth.py): RS256 against the ISA pool's JWKS, `token_use == "id"`,
  `aud` == SlackData's app client. It shares `signing_key()` and the JWKS cache. The module's
  rule — *a second verifier, not a loosened one* — applies again: `verify_cognito_token` is not
  widened.
- **Identity key = the token's `sub`.** The ISA id is recorded beside it (§ 2.1). The public name
  is the person's **full name** from their ISA account (D37), held once in the people store and
  looked up when shown — never copied into log records (D43).
- **The role lookup** is one `GetItem` on the people store per authenticated request (D30). No
  role lives in the token, so a revoked role or a block takes effect on the next request rather
  than at the next login.
- **Frontend:** the existing `react-oidc-context` provider
  ([AdminAuthProvider.tsx](frontend/src/auth/AdminAuthProvider.tsx)) is generalised into a
  site-wide sign-in, pointed at the ISA pool, and **loaded only when someone presses "Sign in"**
  (D41), so anonymous visitors download nothing extra.

### 4.3 Onboarding

- **Editor:** sign in with an ISA account (or create one through the ISA's own sign-up).
  Nothing else — editing starts immediately, within the cap (D52, D53).
- **Manufacturer editor (D5):** a signed-in person opens their brand's page and requests "I
  represent this brand". The request lands in the admin queue showing whether the account's
  verified email domain matches the brand's `website` from
  [manufacturers.json](manufacturers.json). The admin approves or declines, logged. One person
  may represent several brands, each linked by its own approved request (D38).
- **Admin (D7):** granted by an existing admin, logged.
- **The machine API:** unchanged — a brand system still gets a client-credentials app client and
  a `brand_id` mapping via `python -m slack_data.manufacturers.register`.

### 4.4 Bootstrapping, and retiring the old login

- **First admin:** an env-var allowlist of ISA `sub`s, read at startup and recorded in the log as
  `bootstrap` the first time it grants. After that, admins grant admins on the site.
- **The SlackData admin pool** (`AdminUserPool` in [serverless.yml](infra/serverless.yml)) is
  retired as soon as ISA sign-in works (D9). There is then **one** way in. If the ISA pool or our
  app client fails, nobody can administer SlackData until it is fixed — accepted with D9.
- **The dev-token modes** (`ADMIN_DEV_TOKEN`, `MANUFACTURER_DEV_TOKEN`) stay for local work and
  Cypress, subject to the `_hosted()` hazard in § 11.

---

## 5. The data

### 5.1 DynamoDB is the source of truth (D4)

The catalogue store holds what people type: gear items for all eight types, brands, ISA
certificates and warnings with their matches. Each item carries a `version` and a `hidden` flag.

What that changes:

- **The root `*.json` files stop being where data is edited.** They are imported once, at cut-over,
  through the existing loaders, keeping every explicit id. After that, the data repo's daily
  export is the readable copy.
- **The loaders' role changes** from "seed the database on boot" to "the one-time importer, and
  the builder for local and test data from a pinned data-repo snapshot" (D34, D49).
- **The CLAUDE.md re-seed ritual** (`rm database.db`, restart) stops being how a data change is
  applied.
- **The Docker image no longer bakes in a catalogue** ([Dockerfile.lambda](Dockerfile.lambda),
  [scripts/build_catalog_db.py](scripts/build_catalog_db.py)) — which is what triggers the
  `_hosted()` hazard in § 11.
- **New ids** for items created on the site come from a per-type counter, incremented atomically
  (D26). Once the seeds stop being hand-appended, nothing else allocates ids, so nothing can
  collide.

### 5.2 The read path: the whole catalogue in memory (D25)

The catalogue is small — about 650 items and a couple of megabytes. The Lambda reads all of it
from the catalogue store into an **in-memory SQLite**, runs today's derivation passes over it
exactly as the seed does now, and serves it through today's SQLModel models and routers.

- **Derived fields keep a single source.** ISA warning severity, certification, class, "also sold
  by" names and brand enrichment are computed when the in-memory copy is built, never stored on an
  item — so a new ISA warning cannot leave a stale flag on a product.
- **The read code and most read tests stay as they are.** `brand_name`, the Brand relationships
  and the computed fields keep working, because they still run over SQLite.
- **The limits:** this is right up to tens of thousands of items, not beyond. A cold start pays
  for one full read.
- **Freshness (D30):** every request makes one tiny read of a "catalogue version", which every
  edit bumps, and rebuilds the copy only when it changed. An edit is visible everywhere on the
  next request.

### 5.3 Hiding, and deleting duplicates (D20)

- **Nothing is deleted.** A product that should leave the catalogue is **hidden**: kept, logged,
  reversible, absent from listings. A discontinued product is not hidden — it is marked historic
  (`active: false`), which the site already shows. **Only admins may hide** (D40, D55).
- **The one exception is a duplicate**, and only an admin may remove it. Two rows that are the
  same product — like the EQB/Spider `Bandit` and Landcruising/Aki `Unicorn` rebadges in
  [BACKLOG.md](BACKLOG.md) — are merged:
  - The admin picks which row survives and **must write a detailed explanation** (enforced: no
    explanation, no merge).
  - The removed row is replaced by a **"merged into #N" marker**, so bookmarked links, ISA warning
    matches, old suggestions and the manufacturer API's id mapping all land on the survivor.
  - The removed row's full content and history stay in the log, and the merge is prominent in
    Recent Changes.
- **A marker, not a real delete**, which is why D20 needs no `DeleteItem` permission. The ISA has
  deliberately never granted it.

---

## 6. The change log

This is the non-negotiable part of the design: **every change to the site is recorded with who
made it and how, permanently, and in public.**

### 6.1 What is logged

Every change of every kind, not just edits to specs:

- **Edits:** live edits and reverts.
- **Lifecycle:** item and brand creation, hides and unhides, duplicate merges.
- **Media:** uploads.
- **ISA data:** imports and admin corrections to certifications and warnings, and their matches.
- **People:** role grants and revocations, brand links and unlinks, blocks and unblocks, the
  bootstrap.
- **Other channels:** updates through the manufacturer machine API; anonymous suggestions an
  admin turned into edits, while the box still exists (O-19).

### 6.2 What one record holds

| Field | Notes |
|---|---|
| id | ULID — monotonic, so the order of ids is the order of events |
| target | the item, brand, certificate, warning or person changed |
| who | ISA `sub`, ISA id, and **role at the time** — "editor", "admin", or "manufacturer for Balance Community". **No name**: the public full name (D37) is looked up from the people store when shown, so anonymisation never touches the log (D43) |
| how | channel: `web` · `manufacturer-api` (with the brand client id) · `submission` (with the suggestion's id, while the box exists — O-19) · `import` · `revert` (with the reverted record) · `merge` · `bootstrap` |
| what | **only the changed fields, before → after** (D31). A creation's "before" is empty; a merge's "before" is the whole removed row |
| why | the edit summary — optional (D16); **mandatory for duplicate merges** (D20) and blocks (D22) |
| flags | `safety` when anyone changed an MBS field (D33, D57) |

### 6.3 Where it is visible (D3)

**Everything below is public and needs no sign-in (D33).** There is no review queue and no
pending badge: nothing waits on anyone (D52, D57).

- **History** on every item and brand page: each change with its diff, who, when, how and why,
  and a revert action for those allowed (D58).
- **Recent Changes**, site-wide, filterable by type of change, by role (e.g. "manufacturer
  edits") and by `safety`.
- **A contributions page** per person: their edits.
- **Public feeds** (D17, D33): an RSS/Atom feed of Recent Changes, and a **safety feed** of every
  MBS change (D57). Anyone can subscribe; a feed reader is the free, no-email watchlist.

### 6.4 Writing an edit and its record together

An edit to the catalogue and the log record of it must both happen or neither. They are written
in **one DynamoDB transaction** (`TransactWriteItems`), which the existing grant already allows
(D28).
The same transaction checks the item's version (D27), so a stale edit writes nothing at all.

### 6.5 Making the log tamper-evident

- **In code:** the log store has no update or delete operation. The repository Protocol simply
  has none, as the submissions store already does.
- **Enforced by IAM as well (D43):** the Lambda's role carries an explicit deny of `UpdateItem`,
  `DeleteItem`, `BatchWriteItem` and the PartiQL update/delete actions on the log table. A bug, a
  future code change, or an attacker running code in the Lambda cannot edit or delete a record
  through any of those.
- **What IAM cannot do:** stop a `PutItem` that **overwrites** an existing record with the same
  key. IAM has no condition key that can require `attribute_not_exists`. So:
  - every log write is conditional on the record not existing;
  - every record has a fresh time-ordered id, so nothing legitimately writes an existing key;
  - an overwrite would show up as a diff in the daily export.
- **Also not covered:** an administrator of the ISA's AWS account, who can edit the table or lift
  the deny. That too is the export's job, below. No per-record hash chain (D42).
- **Outside AWS:** the daily export (§ 6.6) puts a public copy where an AWS administrator cannot
  reach it. A quietly altered history then shows up as a diff against yesterday.

### 6.6 The daily export (D13), and erasure requests (D14)

- **What it is:** a scheduled GitHub Action that reads the public API and commits the gear data
  and the full change log, **with names**, to a separate data repo (e.g.
  `International-Slackline-Association/slackdata-data`).
- **Why we want it:**
  - It is a backup outside AWS and outside the ISA's account.
  - It is the outside copy that makes the log tamper-evident.
  - It is open data that survives this site — SlackDB's did not.
  - It is the source of local and test data — a pinned snapshot, refreshed deliberately (D34,
    D49) — once the repo's own JSON stops being edited.
- **Names in the export** are looked up from the people store when the export runs (D43); the
  log records themselves carry none.
- **Why a separate repo:** this repo's code history stays clean, rather than carrying a bot
  commit every day.
- **What it costs:** nothing to run. It needs no AWS credentials in GitHub, because it reads the
  public API.
- **An erasure request (D11, D14)** is handled in two places:
  1. **On the site:** one change to the person's people record replaces their name with "former
     contributor". Every past edit then shows that, because names are looked up rather than
     stored in the log (D43). Their edits stay, and so does the role they held.
  2. **In the data repo:** its history is rewritten to remove the name.

  **The consequences, accepted with D14:**
  - Clones, forks and mirrors made before the rewrite keep the name, and we cannot reach them.
  - The rewrite breaks the export's role as an untouched outside record for the period it
    rewrites, so each rewrite should itself be announced and explained in the data repo.
  - The privacy text must say all of this up front (§ 15).

---

## 7. Editing workflows

### 7.1 A live edit (anyone signed in)

1. Open the item and press Edit. The form is typed per field — dropdowns for enums, numbers with
   their units, currency for prices. It is driven by the same field metadata the suggestion
   dialog uses ([correctableFields.ts](frontend/src/config/correctableFields.ts)) and offers every
   field except the ISA's statements and `gear_sellers` (D54).
2. A before → after preview, and an optional "why" (D16).
3. Save. The rate cap is checked (§ 7.2); then the item and its log record are written together
   (D28), and the next request anywhere sees the change (D30).
4. If someone else changed the item since the form was opened, the save is refused and the
   editor is shown what changed, to re-apply on top (D27).

Creating a product or a brand, and uploading a photo or manual, work the same way (D59).

### 7.2 The rate cap (D53)

- **Limits:** 20 changes an hour and 100 a day per account. Each save counts — an edit, a new
  product or brand, an upload.
- **At the cap:** the save is refused, and the editor is told when they can edit again. Nothing
  they typed is lost.
- **Exempt:** a manufacturer on their own brand's gear (their edits elsewhere count), and admins.
  The manufacturer API is covered by the same exemption, since it only touches the brand's own
  gear.
- **Where it is counted:** two counters on the person's people record (this hour, today), bumped
  in the same transaction as the edit, so a burst of parallel saves cannot slip past it. No new
  AWS permission.
- **Why per account and not only per route:** the API Gateway throttles cap the site as a whole;
  only a per-account count stops one hijacked or misused account from rewriting hundreds of
  products overnight. Beyond the cap, an admin can block (§ 7.8).

### 7.3 The anonymous suggestion box goes (D56)

To change something, you sign in and edit. The box, its triage screen and its anti-abuse
(Turnstile, honeypot, route throttling) are retired. When — and what happens to suggestions
already stored — is O-19.

### 7.4 Revert (D58)

A revert is a new change that restores earlier values, logged with channel `revert` and a link
to what it undid. History is never rewritten. Admins can revert anything; a manufacturer can
revert changes to their own brand's gear. Everyone else fixes a bad edit by editing it, which the
log records as an ordinary change. If a field has changed again since the change being reverted,
the revert is refused for that field and the reverter is shown the newer value (D27).

### 7.5 Breaking-strength edits (D57)

Any change to an MBS figure, by anyone, goes live immediately and is marked `safety` in the log.
That puts it in the public safety feed and lets Recent Changes filter for it. Nobody is required
to review it. On an ISA-certified product, the detail page keeps showing **the certificate's own
tested values** next to the edited spec, so a reader can see if the two disagree.

**The safety-critical fields are MBS only (D33):** `breaking_strength` on webbing, weblocks,
rollers and leash rings, and `mbs` on grips. Tree protectors and kits have no such field. The list
lives in one place in code, beside the field policy in
[submissions/fields.py](slack_data/submissions/fields.py).

### 7.6 The manufacturer machine API

It keeps its credentials, its matching
([manufacturers/matching.py](slack_data/manufacturers/matching.py)) and its batch shape. What
changes: an update from a brand client is applied live with the same rights as that brand's
manufacturer accounts (D54), uncapped (D53), and logged with channel `manufacturer-api` and the
client id. `may_write_directly()`
becomes true and the response's `applied` becomes `true`, so brands' integrations need no change.
Renames keep going through `rename_to`, because `name` is what the API matches on
(`MANUFACTURER_EXCLUDED` in [fields.py](slack_data/submissions/fields.py)).

### 7.7 Merging a duplicate (D20)

Admin only. Pick the survivor, write the explanation (mandatory), confirm. The removed row
becomes a redirect marker; ISA warning and certificate matches that pointed at it are re-pointed
to the survivor, each re-point logged; the merge is prominent in Recent Changes.

### 7.8 Blocking (D22)

Admin only, with a mandatory reason, logged. A blocked account can still read and sign in, but
cannot edit, create or upload. Unlinking a manufacturer from a brand is a separate logged admin
action.

---

## 8. Photos and manuals (D12)

Today these are files committed under `frontend/public/` and indexed into the bundle at build
time (`frontend/src/data/gearImages.json`, `brandAbbrev.json`, `gearManuals.json`,
`brandManuals.json`, `manufacturerImages.json`; [scripts/build_gear_manifest.py](scripts/build_gear_manifest.py)).
Adding one needs a developer and a deploy. In the new design they become **data**:

- **An item's photos and manuals are fields on the item**, logged like any other change.
- **Processing, in the browser (D44):** before upload the page resizes a photo to a few
  standard sizes and re-encodes it, which also strips camera metadata such as GPS location.
- **Limits (D45):** photos JPEG/PNG/WebP up to 10 MB before processing; manuals PDF up to 25 MB.
  The server checks type and size itself rather than trusting the browser.
- **Upload:** the browser uploads straight to the existing quarantine `UploadsBucket` through a
  short-lived signed URL. The API never handles the file.
- **Publishing:** an upload that passes the type and size checks is copied to a new public **media bucket**, served at
  `slackdata.org/media/…` as a second origin on the existing CloudFront distribution (D48). It must be separate from the website bucket, because the deploy
  runs `aws s3 sync --delete` over that one and would erase anything it did not build.
- **Live for everyone (D59):** any signed-in editor's upload publishes immediately, and counts
  toward the rate cap (D53).
- **Today's files (D47)** are migrated once into the media bucket in phase 4, logged as an
  `import`, and the five build-time manifests are retired in the same step.

---

## 9. ISA certifications and warnings (D24)

These remain the ISA's statements. No editor or manufacturer can change them (D54); admins
can.

- **Bulk import** continues from the ISA's own lists: today
  [scripts/build_isa_certified.py](scripts/build_isa_certified.py) over the committed capture,
  and the warnings scrape. It now writes into the catalogue store, logged with channel `import`.
- **Admins match and correct on the site.** Matching a certificate or warning to a product,
  fixing a wrong match, or recording one the ISA list does not yet have are logged admin actions.
  The rules carry over: only exact matches certify; a match is verified against
  `"<brand> <name>"` before use.
- **The eventual goal is an automatic sync** from the ISA's published data, where the sync
  proposes and admins confirm the matches it cannot make itself. Its shape is not designed here.
  See also [BACKLOG.md](BACKLOG.md) and [PR #83](https://github.com/International-Slackline-Association/SlackData/pull/83).
- **Derived values** — the row's `isa_warning`, `isa_certified`, `isa_class` and
  `isa_certificate` — are still computed when the in-memory catalogue is built (§ 5.2), never
  typed.

---

## 10. What still needs a developer

Changing **values** never does: specs, prices, descriptions, new items, new brands, photos,
manuals, roles, brand links, ISA certificates and warnings, and their matches.

Changing the **shape** of the data still does: a new gear type, a new field, a new enum value
(such as a material), or a new derived rule. Those are model changes in `slack_data/models/`, they
carry the site's safety semantics, and they go through a reviewed PR (D35).

---

## 11. Hazards carried over

These are true regardless of how the open choices land.

- **`_hosted()` must be re-based first.** It returns `database.READ_ONLY`, which is
  `bool(CATALOG_DB_PATH)`. The dev-token modes are safe hosted only because the image always sets
  `CATALOG_DB_PATH`. Once the catalogue stops being a baked file, that variable goes — and
  **`ADMIN_DEV_TOKEN` and `MANUFACTURER_DEV_TOKEN` become accepted in production.** `_hosted()`
  must be re-based on something the hosted deploy always sets, with a test in
  [tests/test_auth.py](tests/test_auth.py), **before** anything else moves.
- **The read-only guard changes purpose but must survive.** The raw CRUD write routes in
  [_crud.py](slack_data/api/routers/_crud.py) (unauthenticated `PATCH`/`DELETE`) must never be
  mounted hosted. [tests/test_read_only.py](tests/test_read_only.py) keeps guarding that, and gains
  a test that every new write route refuses an unauthenticated call.
- **Every new table is added to [tests/test_dynamo_stores.py](tests/test_dynamo_stores.py)**, which
  builds tables from `serverless.yml` so template/code drift fails in CI.
- **Throttled write routes** must be added to both `RouteSettings` and `HttpApiStage.DependsOn` in
  [serverless.yml](infra/serverless.yml), or the deploy fails as it did on 2026-08-25.
  [infra/check-routes.py](infra/check-routes.py) checks it.
- **New Cypress specs** go into [frontend/cypress/shards.json](frontend/cypress/shards.json), or
  they never run in CI.
- **Cognito callback URLs** are matched exactly: every new post-login route must be listed on the
  ISA app client.

---

## 12. Requests to the ISA, and cost

**All of it is asked for at once, in phase 0 (D50).** The column "first needed" says which phase
would be blocked without it.

| # | Ask | Why | First needed |
|---|---|---|---|
| 1 | **Consent to add SlackData's app client to `isa-users`** (D51) | The pool is the ISA's shared login for SlackMap, SportHub and their accounts site. Our deploy identity could technically create the client (it is "allow everything except IAM and EC2"), but not without the owner's agreement | phase 1 |
| 2 | **Privacy sign-off** (§ 15) | The ISA is the controller of ISA account data, and the ISA Account privacy policy promises not to share information except as it describes — it says nothing about another service publishing names. Public full names, kept forever, exported to git and rewritten on erasure (D11, D13, D14, D37) are a new use that needs a stated basis and a notice | phase 1 — role grants are public from day one |
| 3 | **The named admins** (D7) | Their ISA accounts go into the bootstrap allowlist (§ 4.4) | phase 1 |
| 4 | **An explicit deny of `dynamodb:UpdateItem`, `DeleteItem`, `BatchWriteItem`, `PartiQLUpdate` and `PartiQLDelete` on the log table** (D43) | Overrides the existing `slackdata-*` allow for that one table, and any future widening of it. It names the table, so the table name (`slackdata-changelog-prod`) is fixed before asking. It must exist from the log's first record. It cannot stop a `PutItem` overwrite (§ 6.5) | phase 1 |
| 5 | **A data repo in the ISA's GitHub organisation** (D13) | The daily export lives there. Its workflow commits with the token GitHub issues every workflow, so no AWS credential or extra secret is involved — only someone with org rights to create the repo | phase 2 |
| 6 | **`s3:PutObject` on the new media bucket** | The API copies an accepted upload from the quarantine bucket to the public one. Reading from quarantine is already granted (Tier 3) | phase 4 |
| 7 | **Removing the unused `ses:*` grant** | Granted in August for alerts that were never built; as applied, it would let the API send any mail as any `@slackdata.org` address. Nothing in this design sends email | phase 0 — a reduction, not a need |

**Transactions (D28) are not on this list.** IAM has no `TransactWriteItems` action; a
transaction is authorised against the `PutItem` / `UpdateItem` of each item in it, which
`SlackDataTables` already grants
([AWS docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)).

**The request was sent** to the ISA's technical contact on 2026-10-07: the complete rewritten
role policy, the app client, and a proposed table design for their review.

Items 4, 6 and 7 are changes to the Lambda role, which only an ISA admin can make — our identity
is denied `iam:*`. Everything else the design needs at deploy time — the new tables, the media
bucket, the CloudFront path for it, the app client itself — our deploy identity already creates,
as it created today's tables, buckets, pool and distribution. The new tables named `slackdata-*`
are already covered by the existing DynamoDB grant.

**Not needed:**

- SES sending to the public — the ISA pool sends account mail.
- Any `cognito-idp` permission on the Lambda — roles are in our table, not the pool.
- Anything for the per-account rate cap — it is counted in the people store (D53).
- A VPC or `ec2:*`.
- `dynamodb:DeleteItem` — duplicates become redirect markers.
- `dynamodb:Scan`.
- A deploy role for CI — the export reads the public API.

**Cost — an estimate, to be checked against current AWS pricing before asking:**

| Item | Cost |
|---|---|
| DynamoDB on demand, with reads served from memory | Cents a month: reads are mostly change checks, and writes are a few thousand a year |
| The log | A few kilobytes per change — tens of megabytes after years |
| Point-in-time recovery on the new tables | Pennies at this size |
| Media | Storage at cents per gigabyte, delivery largely inside CloudFront's free allowance (shared across the ISA's account) |
| The GitHub export | Free |

**Realistic total: a few dollars a month at most.**

---

## 13. Phases (D23)

Each phase goes live on its own and can stop there. **Order (D60):** live editing for admins,
then media, then manufacturers, then editing opens to every ISA account.

| Phase | What ships | Done when |
|---|---|---|
| 0 | Every ISA request at once (§ 12, D50); **re-base `_hosted()`** (§ 11) — ours alone, no ISA involvement | The ISA has agreed to items 1–3 and 5, and applied 4, 6 and 7; `_hosted()` has its test |
| 1 | ISA sign-in; people store; admin grants; the log for role events; **old admin pool retired** (D9) | Admins work through ISA accounts only |
| 2 | Catalogue imported into DynamoDB; the in-memory read path running **in shadow** beside the baked catalogue, compared on every deploy; then switched over; the daily export to the data repo starts | The site reads from DynamoDB; seeds are no longer hand-edited |
| 3 | Live editing for admins; History, Recent Changes, feeds, revert, hide, duplicate merge | Admins edit without a developer |
| 4 | Photo and manual uploads for admins (manufacturers gain them in phase 5, everyone in phase 6); today's images and manuals migrated and the manifests retired (D47) | A photo goes live without a deploy |
| 5 | Manufacturer accounts (brand requests, uncapped edits and revert on their own gear); machine API applied live | A brand updates its own gear end to end |
| 6 | **Editing opens to every ISA account**, with the rate cap (D53); the anonymous box retired (D56, O-19) | Anyone with an ISA account edits; no hand-applied JSON patch remains |
| 7 | ISA certificates and warnings editable by admins; the import writes to the store; then the automatic sync | — |

---

## 14. Open choices

Each item below is **UNDECIDED**. Recommendations are Claude's, offered for the decision, not made
by it.

**O-19 — When the anonymous box is switched off, and what happens to stored suggestions.**
- (a) **At phase 6**, when everyone can edit. Until then it remains the only way for the public to
  report an error, and admins act on it (by hand until phase 3, then through the edit form).
  Stored suggestions expire on their existing TTL.
- (b) **Now, or at phase 1.** One less system to run, but for months there is no public way to
  report a wrong spec.

*Recommendation: (a).*

**O-20 — Who may edit a brand's own entry** (website, socials, contact email, country, founding
year, name). Reopened from D39, which was written for manufacturers only.
- (a) **Anyone, like products, except the brand's name and id**, which only admins change. The
  manufacturer API checks the stored brand name on every call (`verify_brand()` in
  [matching.py](slack_data/manufacturers/matching.py)), so a casual rename would lock that brand's
  integration out.
- (b) **Anyone, all fields.**
- (c) **The brand's manufacturer accounts and admins only.** A brand's contact details are the
  brand's to state.

*Recommendation: (a).*

---

## 15. To settle with the ISA

The non-permission half of § 12:

- **Consent to the SlackData app client** in `isa-users`, created by our stack (D51).
- **The privacy text** for permanent public names (D3, D11, D37), the git export with names and
  the history rewrite on erasure (D13, D14). Likely shape: a short SlackData privacy notice, and a
  one-time "your name will be shown publicly with your edits" agreement the first time someone
  edits. It must be ISA-approved before phase 1 ships.
- **Which SafeCom members are admins** (D7).
- **Creating the data repo** in the ISA's GitHub organisation (D13).

---

## 16. Documents this makes stale

These are not changed by this file; each needs updating when the phase that invalidates it ships.

- [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md) — §§ Phase 3–4 superseded by this file; the
  anonymous box it describes is retired (D56, O-19).
- [infra/LAMBDA_ROLE_PERMISSIONS.md](infra/LAMBDA_ROLE_PERMISSIONS.md):
  - "What is never requested — no write access to the catalogue" stops being true (phase 2).
  - Tier 2's SES-to-applicants section is no longer needed (§ 2.1).
- [CLAUDE.md](CLAUDE.md):
  - the seeding ritual (phase 2);
  - the Submissions section — the anonymous box is retired (D56);
  - "No auth — all endpoints are open" (phase 1);
  - the read-only mode section (phase 2).
- [SAFETY_AND_ACCURACY.md](SAFETY_AND_ACCURACY.md) — must describe who can change what, and the
  public log (phase 3).
- [MANUFACTURER_API_PLAN.md](MANUFACTURER_API_PLAN.md) and [MANUFACTURER_API.md](MANUFACTURER_API.md)
  — updates now apply live (phase 5).
