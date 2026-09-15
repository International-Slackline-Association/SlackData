# MANUFACTURER_API_PLAN.md — Phase 4: an API brands call to update their own gear

Handoff for whoever picks this up. Read [SUBMISSIONS_PLAN.md](SUBMISSIONS_PLAN.md) first — this
phase reuses its store, its review model and most of its decisions, and repeating them here would
let the two drift.

---

## Status (2026-08-21)

**Steps 1–3 are built and tested; step 4 (photos) is built as *links*, not uploads — see § Step 4.** 565 pytest / 130 node unit tests
pass, and **CI now runs all of it** (`.github/workflows/ci.yml`) including Cypress against both
real servers.

| Built | Where |
|---|---|
| Manufacturer token verification (a *second* verifier, sharing the JWKS cache) | `slack_data/api/auth.py` — `verify_manufacturer_token`, `require_manufacturer` |
| Brand ↔ app-client mapping (option 1 below) | `slack_data/models/brand_clients.py`, `slack_data/manufacturers/{clients,dynamo,store}.py` |
| Gear identity resolution | `slack_data/manufacturers/matching.py` |
| The routes | `slack_data/api/routers/manufacturer_router.py` — `GET /me`, `GET /gear`, `POST /gear` |
| Wire shape | `slack_data/models/manufacturer_updates.py` |
| Round-trip reads (`?include=spec`) | `matching.current_spec` + the route's `include` param — see § Closing the round-trip gap |
| Read-back (`GET /manufacturer/submissions`) | `repository.list_for_brand` + `brand_id-batch_id-index` — see § Reading their own submissions back |
| Onboarding | `python -m slack_data.manufacturers.register` (a CLI, deliberately not a route) |
| Triage UI | `frontend/src/pages/AdminPage.tsx` + `frontend/src/utils/batches.ts` |
| Infra | `infra/serverless.yml` — `BrandClientsTable`, `ManufacturerResourceServer`, route throttle |
| Tests | `tests/test_manufacturer_api.py` (71), `tests/test_live_api.py` (20, real HTTP), `tests/test_dynamo_stores.py` (17, real DynamoDB), `frontend/tests/unit/batches.test.ts` (8) |

### Decisions taken (the open questions below, answered)

1. **Does a manufacturer's update still need review? — No.** Records arrive `APPROVED`: the sender
   makes the product, so there is no decision left, only the JSON edit and the redeploy. An approved
   record never expires, which is right — it is work outstanding. Because nobody judged it on the
   way in, the admin UI grew a **"Reject instead"** on approved rows; without that there would be no
   way back out of a bad batch.
2. **Bulk — one call, N rows, shared `batch_id`.** The review unit stays one product's JSON patch;
   triage regroups them for display. **All-or-nothing** on resolution failure, so a retry is always
   safe. (True idempotency would need a lookup by an idempotency key the store has no index for —
   a repeat therefore creates a second batch, which triage shows as two groups rather than hiding.)
3. **The SKU ↔ row link lives nowhere — the echo self-heals instead.** Resolve by verified
   `gear_id` → fall back to `(brand_id, name)` → refuse ambiguity; every response echoes the
   **resolved** id, so a re-seed that shifts ids corrects the brand's mapping on their next call.
   `manufacturer_sku` is persisted but matches nothing yet. No new store, no model change.
   The endgame is still SKUs in the root `*.json`, at which point this becomes the fallback.
4. **Onboarding and the GDPR scope of the client records are still open** — see below. They are
   trust and governance questions, not technical ones, and nothing built here answers them.

### What is deliberately not built

- **Photo uploads.** Step 4 became *links* instead (§ Step 4 — photos as links). The
  `UploadsBucket` exists in `serverless.yml`; no route writes to it, and none is planned.
- **Direct catalogue writes.** `BrandPermission.WRITE` is declared and **not honoured**:
  `may_write_directly()` returns False structurally, because the hosted catalogue is opened
  `mode=ro&immutable=1`. The per-item response already carries `applied: true/false` so the day it
  flips, brands need no new field. `test_a_write_permission_does_not_bypass_the_queue_today` pins
  the current answer, so flipping it is a deliberate act.
- **Cypress coverage of the new triage UI.** The grouping logic is unit-tested; the DOM is
  covered by `admin_triage.cy.ts` (15 passing) but not specifically for batch grouping.
  The *API* is covered over real HTTP by `tests/test_live_api.py`, which boots uvicorn in both the
  local-dev and hosted (`READ_ONLY`) configurations — including the assertion that a hosted deploy
  with no Cognito pool answers 503 on every manufacturer route rather than falling through to the
  dev token.
- **Per-brand rate quotas.** HTTP APIs have no usage plans; that is a REST API migration.

---

---

## What this is

Manufacturers currently have no way to fix their own data except emailing Emile. This phase gives
them an authenticated endpoint: post your gear specs, upload your product photos, and have them
enter the normal review queue.

## What it is NOT

- **Not the Lambda calling manufacturers' APIs.** An earlier draft had this backwards and the
  permissions were wrong as a result. *We* publish; *they* call.
- **Not live editing.** A manufacturer's update is a submission, reviewed by an admin, applied to
  the root `*.json` by hand and shipped by redeploy — exactly like a visitor's correction. The
  hosted catalogue is a read-only SQLite file baked into the container image; it physically cannot
  be written. If you find yourself wanting to write to it, stop and re-read
  `slack_data/api/routing.py`.
- **Not a public write API.** Every route is authenticated per brand.

---

## The permissions you actually have

Requested from the ISA in `infra/ISA_ROLE_REQUEST_PHASE2.md` and scoped deliberately. **Design
within these; a fourth request is expensive.**

| Granted | Use |
|---|---|
| `dynamodb:PutItem/GetItem/Query/UpdateItem` on `table/slackdata-*` + indexes | Their submitted data. The prefix wildcard means a NEW table needs no new permission. |
| `s3:PutObject/GetObject` on `slackdata-uploads-prod-<acct>/*` | Uploaded photos. |
| `ses:SendEmail/SendRawEmail` from `*@slackdata.org` | Alerts. |

**Not granted, and each absence is intentional:**

- **`dynamodb:DeleteItem`** — submissions are append-only. A withdrawal is a status change.
- **`dynamodb:Scan`** — every read must go through a key or an index.
- **`s3:DeleteObject`** — the uploads bucket has a 90-day lifecycle rule instead.
- **`secretsmanager:*`** — there is no third-party credential to store; see auth below.
- **Any `cognito-idp:*`** — token verification is an HTTPS call to a public JWKS endpoint, not an
  AWS API call. Do not reach for the Cognito SDK; if you think you need it, you have probably
  drifted into managing accounts, which is an administrator's job in the console.

---

## Auth — read this before writing any of it

**The plan is Cognito machine-to-machine (`client_credentials`): one app client per brand, the brand
holds the secret, they exchange it for a token at Cognito's `/oauth2/token`, we verify the
signature.** No credential of theirs is ever stored by us, which is why no Secrets Manager grant was
requested.

**`slack_data/api/auth.py` will reject those tokens as written, and the failure will be confusing.**
Three specific reasons:

1. `verify_cognito_token` passes `audience=COGNITO_CLIENT_ID` to `jwt.decode`. A client-credentials
   **access token has no `aud` claim at all** — it carries `client_id` and `scope`. Decoding raises
   before any of our own checks run.
2. It then insists `token_use == "id"`. M2M tokens are always `"access"`.
3. `COGNITO_CLIENT_ID` is a single value; there will be one client per brand.

Do **not** loosen the existing path to accommodate this — that function guards the admin login, and
`tests/test_auth.py` pins its behaviour (forged signatures, `alg: none`, wrong audience, access
tokens). Add a *second* verifier alongside it, sharing `signing_key()` and the JWKS cache:

```
verify_manufacturer_token(token) ->
    RS256 against the same pool JWKS          (reuse signing_key — do not refetch)
    require token_use == "access"
    require iss == issuer()
    require client_id in <known brand clients>   # NOT `aud`
    require the scope your resource server declares
    -> returns the brand this token speaks for
```

Keep the "no pool configured + hosted → 503, never fall through" rule. That property is why the dev
token is safe to have in the repo, and it must hold for this path too.

### Which brand is this token?

`Brand` (`slack_data/models/brands.py`) has `id` and `name` and **no account linkage** — you are
adding that. Options, in the order I would try them:

1. **A Cognito app client per brand, mapped to a `brand_id` in a DynamoDB table** (`slackdata-brand-clients-prod`,
   already covered by the `slackdata-*` grant). One lookup per request, cacheable in a module global
   like `fx.py` does. Explicit, auditable, revocable without a redeploy.
2. A custom scope per brand (`slackdata/brand-17`). No lookup, but the mapping ends up in Cognito
   config rather than in data you can see.

Whatever you choose: **resolve to a `brand_id`, and check it on every write.** A brand posting an
update for someone else's product is the one security failure that matters here, and it should have
a test named after it.

---

## What they can send

### Gear data

Reuse the submissions pipeline rather than inventing a parallel one:

- `submissions/fields.py` already derives the correctable field names from each gear type's real
  `<X>Update` model. **Do not write a second list.** `tests/test_frontend_contract.py` exists
  because a hand-maintained copy drifted the moment it was written down.
- Record these with `kind: "manufacturer"` (a new `SubmissionKind`) so triage can show them
  differently — an update from the brand that makes the product is better evidence than an
  anonymous report, and the admin should be able to see that at a glance.
- Set `submitted_by` to the brand's identity. The field already exists and is always null today,
  precisely so this is not a backfill.

### Identity of the item

**Gear ids are not stable.** The root `*.json` files carry no ids; a gear id is a SQLite
autoincrement assigned by position at seed time, so inserting one item mid-file shifts every id
after it. Bare `name` collides (3 duplicates in `webbings.json`, 2 in `weblocks.json`);
`"<brand> <name>"` does not.

A manufacturer API makes this sharper, not softer: brands will send us *their* SKUs, which we have
never stored. **Take a `manufacturer_sku` and persist it** — it is the only stable identifier either
side will agree on, and adding it later means asking every brand to re-send. Match on
`(brand_id, sku)` first, fall back to `(brand_id, name)`, and refuse ambiguity rather than guessing.
`load_isa_warnings.py` is the precedent: it verifies a recorded `"<brand> <name>"` before acting so
drift is reported instead of silently re-pointing a recall.

### Photos

See **§ Step 4 — photos as links** below. The original plan here was a binary upload into
`slackdata-uploads-prod-<acct>`; it was replaced before any of it was built.

---

## Step 4 — photos as links (`image_urls`)

**Status: built 2026-09-15, not yet committed or run through CI.** Replaces the upload design that
used to sit under § Photos. The plan below is what was built. The one addition is a test that the
route makes no outbound request.

### The decision: links, not binaries

A brand sends **URLs of photos it already publishes**, as a list on each item. We fetch them
when applying the update, the same way the current 870 images were collected. No binary ever
reaches the API.

The reason is where the work actually is. Getting a photo onto the site is manual whichever way
it arrives: someone looks at it, puts it in `frontend/public/gear-images/<type>/` under the right
key, rebuilds the manifest, commits and runs deploy half B. An upload only changes who holds the
bytes while that happens, and it costs a lot to build:

- **It is the first route that accepts a file from outside.** That means sniffing the content type,
  size caps, and abuse handling. A JSON list of URLs needs none of it.
- **Lambda caps a synchronous request at ~6 MB**, so a real upload has to be a pre-signed POST
  straight to S3 (pre-signed PUT cannot bound the size). That means a new route, boto3 outside
  `submissions/`, and a real-S3 test.
- **The uploads bucket deletes objects after 90 days, but approved manufacturer records never
  expire.** An upload could vanish while its record still said "to do".

What the list costs: no infrastructure, no IAM, no binary, and it fits the existing 256 KB body
cap. The part that genuinely saves time is the other half, **a script that turns a record's URLs
into correctly named files**, because naming is where a photo silently fails to render.

The uploads bucket and its `s3:PutObject/GetObject` grant stay in place, unused. Removing them is a
separate infra change with its own ISA conversation, and a brand with photos it cannot host
anywhere is the case that would bring uploads back.

### The wire shape

`image_urls` on `ManufacturerGearItem`, beside `source_url` and `rename_to` — **not** a key of
`changes`. It adds photos; it does not correct a spec, and `changes` is a `dict[str, str]` that
cannot carry a list anyway.

| Rule | Behaviour |
|---|---|
| Absent or `null` | No photos. Same as `[]`. |
| Up to `MAX_IMAGE_URLS` (10) per item | 11 is a **422** naming the item. Ten is more than any product page carries. |
| Each entry | `http(s)` only, whitespace stripped, at most `MAX_URL_LENGTH` (500). Anything else is a **422** naming the entry's position. |
| A blank entry | **422**, not silently dropped: an empty string in a list is a bug in the caller's template. |
| A repeated URL | Dropped, first occurrence kept, order preserved. A nightly integration re-sending its list must not double the work. |
| An item with only photos | Valid. It asks for something, like a note alone or a rename alone. |

**Semantics are "add these".** Removing or reordering an existing photo is not expressible, and is
said in `note`. A replace-the-set field would let one bad nightly run strip a product's imagery.

**The API does not fetch the URLs.** It records them. An outbound fetch from the Lambda would be a
server-side request forgery surface, and a dead link is found when the admin runs the script,
which is when it matters.

**Image rights.** MANUFACTURER_API.md says plainly that sending a URL grants SlackData permission to
display the image. A link on the brand's own domain, sent with the brand's own credential, is good
evidence of that. The document should not leave it implied.

The public suggestion box does **not** get the field. Anonymous photo links are a moderation
problem the authenticated path does not have, and `SubmissionCreate` ignoring the key is pinned by
a test.

### Storage

`Submission.image_urls: list[str]`, default empty.

- **SQLite:** one entry in `_ADDED_COLUMNS` (`image_urls TEXT`), JSON-encoded like `changes`. Rows
  that predate it read back as `[]`.
- **DynamoDB:** a list attribute on the item. No table, index or IAM change. Items that predate it
  have no attribute and read back as `[]`.
- **Read-back:** `ManufacturerSubmissionRow` carries it, so a brand can confirm what it sent.
- The receipt is unchanged.

### Triage

`SubmissionRow` lists the URLs as plain links (`data-cy="submission-row-images"`, one
`submission-row-image` per URL, new tab, `rel="noopener noreferrer"`). They are **links, not
thumbnails**. A thumbnail loads a third-party resource in the admin's browser the moment the queue
renders, and the link shows exactly the URL the script will fetch.

The approved panel adds **the exact command to run** (`data-cy="image-fetch-command"`, with a copy
button), built by `frontend/src/utils/imageFetch.ts`:

    python3 scripts/fetch_submission_images.py --gear-type webbings \
      --brand 'Balance Community' --name 'Aero 1' 'https://…/aero-1.jpg'

- **The name is the one the product will have after the patch**: `changes.name` when the record
  renames it, otherwise `gear_name`. Images are keyed by name, so fetching under the old name
  after a rename would file them under a key nothing renders.
- **Arguments are single-quoted for a POSIX shell**, with embedded quotes escaped. The brand, the
  name and the URLs all come from outside, so the builder is unit-tested rather than trusted.

### The script — `scripts/fetch_submission_images.py`

    python3 scripts/fetch_submission_images.py --gear-type T --brand B --name N URL [URL ...]
                                                [--dry-run]

1. Computes the key exactly as the frontend does: `<brand-abbrev>_<name-slug>`, via
   `brandAbbrev.json` and `build_gear_manifest.slugify`, never a third copy of either.
2. Finds the files already held under that key and **appends**: the first photo of a product with
   none becomes `<key>.<ext>`, later ones `<key>-<n>.<ext>` after the highest index held.
   Uses `build_gear_manifest.parse` with the seed's keys, so a product *named* "Blue 20" is not
   mistaken for image 20 of "Blue".
3. For each URL: downloads with a timeout and a **15 MB cap**, and decides the extension by
   **sniffing the bytes** (JPEG, PNG, WebP, GIF), never by the URL or the `Content-Type`. A product
   *page* sent in place of an image URL is the likeliest mistake, and it arrives as `text/html`
   under a URL ending in something plausible.
4. **Never overwrites.** A download byte-identical to a file already held for that key is skipped
   and reported, so re-running on the same record is safe.
5. Rebuilds `gearImages.json` through `build_gear_manifest` unless `--dry-run`.
6. **Warns when the key matches no product in the seed.** That is a rename or a new product whose
   JSON patch has not been applied yet, and the images will not render until it is.
7. Exits 1 if any URL failed, after writing the ones that succeeded and naming each failure.

The downloader is a module-level `fetch` function, so tests replace it. **No test touches the
network.**

### Tests (red first)

- `tests/test_manufacturer_api.py` § Photos: accepted and stored, read back, only-photos item is
  valid, the cap, `http(s)` only, per-URL length, a blank entry, `null` means none, duplicates
  dropped with order kept, the field is not a `changes` key, one bad item still rejects the batch,
  the public box ignores it.
- `tests/test_submissions.py`: a SQLite file created **before** the column still opens and reads
  old rows back as `[]`, and a new row round-trips its list.
- `tests/test_dynamo_stores.py`: a manufacturer record round-trips `image_urls` through real
  DynamoDB, and a record without it reads back as `[]`.
- `tests/test_manufacturer_api_docs.py`: MANUFACTURER_API.md's item table documents `image_urls`,
  the cap it states equals `MAX_IMAGE_URLS`, the rights sentence is present, and the SPA page
  mentions the field.
- `tests/test_fetch_submission_images.py`: key building, next index, index-looking product names,
  sniffing, refusing HTML and oversized bodies, no overwrite, byte-identical skip, dry run writes
  nothing, the unknown-key warning, exit code on partial failure.
- `frontend/tests/unit/imageFetch.test.ts`: the command's name after a rename, quoting of `'` and
  shell metacharacters, and no command for a record without photos.

### Not done, deliberately

- **Thumbnails in triage.** See above.
- **`?include=photos`** on discovery. The backend does not know the image manifest; it is a
  frontend build artifact. That needs its own design.
- **Cypress coverage of the triage links.** CI's e2e job registers no brand client, so no spec can
  create a manufacturer record. The rendering logic that can go wrong (the command) is unit-tested.
- **Removing the uploads bucket** and its grant.

---

## Closing the round-trip gap (`GET /manufacturer/gear?include=spec`)

**Status: built 2026-08-24**, raised while testing the API by hand. `matching.current_spec`,
`brand_gear(include_spec=...)`, `ManufacturerGearRow.spec`, and the route's `?include=` parameter.
Covered by 11 tests in `tests/test_manufacturer_api.py` (§ Discovery: the round-trip read).

### The gap

`GET /manufacturer/gear` returns four fields per row — `gear_type`, `gear_id`, `name`, `active`.
That is the *id-mapping* answer ("a brand cannot map their SKUs onto ids nobody ever told them",
`matching.brand_gear`), and it was never argued in this document: the shape was chosen in code, and
the only rationale is that docstring.

It makes the obvious workflow impossible. A brand wanting to correct our data has to **GET their
gear, see the values we hold, change what is wrong, and send it back**. Today the middle step is
missing, so their options are:

1. Send every field they believe is true — which buries the admin in 18-field patches where one
   field actually changed, and defeats the point of a submission being a *patch*; or
2. Maintain their own mirror of our catalogue, which is the thing the echo-the-resolved-id design
   exists to avoid; or
3. Join two endpoints by hand — `GET /manufacturer/gear` for the ids, then the public
   `GET /webbing/{id}` for the values, with two different vocabularies to learn.

### Why withholding the specs protects nothing

**The catalogue is public.** `GET /webbing/213` is unauthenticated and returns every field to
anybody at all. Withholding those same values from the *authenticated owner of the row* is strictly
worse than useless — it is not a confidentiality boundary, just an extra join. Any argument for the
narrow shape has to be about response size or typing, not about access.

### The real objection, and the answer

The eight gear types have different fields, and `ManufacturerGearRow` is one flat model. Full specs
across all types at once means a union response or an untyped blob — that is the genuine engineering
reason the flat shape exists.

The answer is already in the repo: **`submissions/fields.py` derives the correctable field names per
gear type from the real `<X>Update` schema.** So the spec handed back should be exactly *the fields
they are allowed to change*, with their current values:

```python
{name: getattr(item, name) for name in sorted(CORRECTABLE_FIELDS[slug])}
```

This is better than "the whole row" on three counts:

- **Symmetry.** GET returns the editable surface; POST accepts the same names. One vocabulary. A
  brand can round-trip the dict without filtering it.
- **It cannot drift.** A field added to a model becomes both correctable and visible in the same
  commit, with nothing to remember — the same property `fields.py` was written for.
- **It excludes what they must not send anyway.** `brand_id` and `classification` are closed on the
  POST, so they should not appear in a payload meant to be edited and returned. `brand_name` is
  synthetic — correctable, not a column — and is read off the `Public` computed field.

### Shape

Opt-in, so the flat default and every existing caller keep working:

    GET /manufacturer/gear                          -> unchanged, 4 fields
    GET /manufacturer/gear?include=spec             -> each row gains `spec`
    GET /manufacturer/gear?gear_type=webbings&include=spec

`ManufacturerGearRow` gains `spec: dict[str, Any] | None = None`, absent unless asked for. Keeping
the bare shape as the default matters for the "map all my SKUs across eight types" call, which
genuinely does not want 60 full spec sheets.

`include` is a string rather than a bool because the day photos land (step 4) the natural spelling
is `?include=spec,photos`; a `spec=true` flag would have to be deprecated to get there.

### What it must not do

- **No write path.** This is another read through `SessionDep`, exactly like the rest of this
  router. Reads are fine hosted; the existing `test_the_router_never_writes_to_the_catalogue` covers
  the new query too, since it wires the session, not the route.
- **No new authorization surface.** It is scoped by `principal.brand_id` through `brand_gear()`
  like the bare form, and `verify_brand` still runs first. A brand must not be able to read another
  brand's spec through it — worth its own test, named after the existing cross-brand one.
- **Values are serialized as they are stored**, not stringified. `changes` on the POST is text
  because the admin hand-applies prose; a *read* has no such excuse, and coercing `40.0` to `"40.0"`
  here would make the round-trip lossy. The asymmetry is deliberate and should be commented.

### Cost

`brand_gear()` gains a parameter; `ManufacturerGearRow` gains an optional field; the route gains a
query param. No new store, no model migration, no infra change. The response for a 62-row brand goes
from ~4 KB to ~40 KB, well inside the API Gateway limit.

### What building it turned up

**The write refused lists, so the round trip did not actually close.** `material` is
`list[FiberMaterial]` on webbings and rollers — the only two list-valued correctable fields in the
catalogue — and `ManufacturerGearItem._stringify` lumped `list` in with `dict` and rejected both as
"a nested object". The read hands back `["Polyester"]`; the write would not take it. Every caller
would have had to special-case two field names, which is exactly the papercut the proposal exists to
remove.

Fixed by accepting a **list of scalars** and rendering it as prose (`"Polyester, Dyneema/HMPE"`),
the same treatment every other value gets on the way in. Nested containers are still refused, and
`test_a_nested_value_is_refused` — which passes a `dict`, not a list — was never about lists in the
first place. Pinned now by `test_a_list_of_scalars_becomes_prose` and
`test_a_list_of_nested_values_is_still_refused`.

This is a **loosening of a shipped endpoint's validation**, small but real: a body that was a 422
yesterday is a 201 today. It is the right direction (the read and the write now speak the same
shapes, not just the same names) but it is worth knowing it happened.

**The bare call had to stay byte-identical.** A plain `spec: dict | None = None` field puts
`"spec": null` on every row of the unfiltered response, which is a new key for every integration
written before this. The route sets `response_model_exclude_unset=True` so an unrequested `spec` is
absent rather than null — and `exclude_none` would have been wrong, because `active: null` is
meaningful ("we do not know whether this is still sold").

---

## Reading their own submissions back (`GET /manufacturer/submissions`)

**Status: built 2026-08-24.** Raised while testing the API by hand, immediately after
§ Closing the round-trip gap, and for the same underlying reason: a brand could send but not see.

### Why, given the POST already returns a receipt

The receipt is one-shot. Two failure modes in the code as shipped were being handed to a human:

1. **The 502 partial batch.** `submit_gear` writes in a loop, not a transaction — no
   `dynamodb:TransactWriteItems` is granted — so a store failure part-way answers *"stored 3 of 40;
   batch_id X. Do NOT blind-retry… Ask the admin to check that batch."* That instruction existed
   **only because the brand had no way to look**. It is now one request.
2. **Silent rejection.** Manufacturer submissions arrive `APPROVED` and never expire, and the admin's
   remaining moves are "Mark handled" or **"Reject instead"** — which exists precisely because
   nobody judged the batch on the way in. Before this, a rejected batch was invisible to the sender
   forever: they would keep believing the correction was queued.

### Why it needed an index, not a filter

`list_by_status` is the only query the store had, and **`dynamodb:Scan` is not granted** — the role
policy says in as many words that nothing reads the table without a key
(`infra/LAMBDA_ROLE_PERMISSIONS.md`). Filtering the whole table in the Lambda was therefore not a
lazy option that was rejected; it was not an option.

### The index

    brand_id (HASH, N) + batch_id (RANGE, S)     "brand_id-batch_id-index"

The existing design pays for this one:

- **`batch_id` is a monotonic ULID**, so the range key sorts by creation time. One index answers both
  "my recent submissions, newest first" and "this exact batch" — the latter as a key condition
  rather than a filter, which matters because the 502 message names a `batch_id` and nothing else.
- **It is naturally sparse.** A public submission has no `brand_id` and no `batch_id`, so it is
  absent from the index entirely — not filtered out of it. A brand cannot read the suggestion box
  through this endpoint even if the scoping were wrong, because those rows are not in the structure
  being queried. That is the same trick `_to_item` already plays by dropping nulls.
- **No IAM change.** `dynamodb:Query` is already granted on `table/slackdata-*/index/*`.

Duplicate `(brand_id, batch_id)` pairs are expected and fine — a GSI does not require key
uniqueness, unlike a table's primary key. Order *within* one batch is therefore unspecified; the
batch is the unit, and its members are grouped, which is all the caller needs.

Locally the SQLite store gets the matching `submissions_brand_batch` index and the same query.

### Newest first, unlike triage

`list_by_status` is **oldest** first, because triage is a queue. This is the opposite: a brand asking
"did my last batch land?" wants the last batch. Both sort on a ULID, so both are exact and neither
ties.

### What the brand sees

`ManufacturerSubmissionRow` — their own fields, plus the outcome. Deliberately not the stored
`Submission`:

- **`review_note` IS included.** It is the whole value of the feature for a rejection: `status:
  "rejected"` with no reason sends the brand to email anyway. **Admins should know their note is
  read by the brand** — it is a message to them, not an internal annotation. Flagged here because
  the notes written before this shipped were written under the opposite assumption.
- `submitter_email` is **not** included. It is always null for `kind: "manufacturer"` (by design —
  see `models/brand_clients.py` § Privacy) and echoing a field that can only ever be empty invites
  someone to start filling it.
- `gear_brand` and `brand_id` are not included: the caller *is* the brand, so both are constants of
  the credential and repeating them per row says nothing.

### Scoping

`brand_id` comes from `principal`, never from the request — there is no parameter to pass one. The
cross-brand test is named after the existing one
(`test_a_brand_cannot_read_another_brands_submissions`), and `verify_brand` runs first here as on
every other route in this router, so a drifted credential refuses rather than answering about
another company.



---

## Constraints that will bite you

- **Routers take no `SessionDep`.** The catalogue session is read-only hosted, so a route that
  reaches for it passes every local test and fails on the live site. `tests/test_submissions.py`
  asserts this by wiring `get_session` to a dependency that raises. Copy that test.
- **No boto3 outside `submissions/`.** Everything goes through the `SubmissionRepository` Protocol,
  with a lazy import. This is what keeps pytest and Cypress runnable with no AWS credentials — the
  suite currently runs with boto3 *not installed at all*. Do not regress that.
- **`READ_ONLY` splits the routers.** New writable routers go in `WRITABLE_ROUTERS` in
  `slack_data/api/routing.py`, never in `CATALOG_ROUTERS`. `tests/test_read_only.py` is the guard.
- **SQLite needs an additive migration.** `CREATE TABLE IF NOT EXISTS` does nothing to an existing
  file, so a new column breaks every developer's local store. See `_ADDED_COLUMNS` in
  `submissions/repository.py` and add to it.
- **Failure policy is per-module and deliberate.** `turnstile.py` fails **closed** (a broken captcha
  is a hole); `fx.py` fails **open** (a broken rate feed must not blank every price). Decide which
  yours is and write the reason down. (`notify.py` used to be the other fail-open example; the app
  now sends no email at all — see SUBMISSIONS_PLAN.md § Alerting.)
- **Rate limiting is API Gateway, not code.** `serverless.yml` already throttles `POST /submissions`
  by route key via `HttpApiStage` `RouteSettings`. Per-brand quotas need usage plans, which is a
  deploy-time change, not a role permission.
- **Never commit the AWS account id.** `serverless.yml` builds ARNs from `${aws:accountId}` because
  this repo is public. Keep it that way.

---

## Testing — the bar in this repo

No CI exists; run these yourself. Current: **450 pytest, 122 node unit, 36 Cypress** across the
submissions work alone.

- pytest against the in-memory repository: auth (a brand cannot write another brand's gear — name
  that test explicitly), field validation, size caps, idempotent retries.
- The suite must keep running with no AWS credentials and no boto3.
- Cypress runs against the real backend, not mocks. Under VS Code use
  `env -u ELECTRON_RUN_AS_NODE npx cypress run` or it dies with SIGILL.
- **Read the model files before writing frontend code.** `CLAUDE.md`'s frontend↔backend contract
  rule is not advisory; `tests/test_frontend_contract.py` enforces it for the submissions form.

---

## Open questions

1. ~~**Does a manufacturer's update still need review?**~~ **Answered: no** — auto-approved on
   arrival. See § Status.
2. ~~**Onboarding — who verifies that someone emailing from `sales@brand.com` speaks for that
   brand?**~~ **Answered 2026-08-25: confirm out-of-band, to an address we already held.** The
   request must come from the brand's own domain (the `website` domain in `manufacturers.json`),
   and the confirmation goes to the `contact_email` we scraped for them — or to their public
   contact form or socials where we hold none. An impostor can send us mail; they cannot read the
   brand's. Every decision is recorded in `infra/onboarded-brands.md`. The full policy, and why the
   bar is set there, is `infra/README.md` § Onboarding policy. The mechanism was always built; this
   was the missing half.
3. ~~**Bulk updates.**~~ **Answered: one call, N rows, shared `batch_id`.** See § Status.
4. ~~**Scope of `slackdata-brand-clients` data.**~~ **Answered 2026-08-25: don't store it.**
   `contact_email` is the only personal data in the record, it is optional, and nothing reads it —
   so brands are registered with `--contact` omitted. That resolves the combination that made it a
   question: no TTL (deliberately — an expiring credential mapping locks a brand out silently) and
   no `DeleteItem` grant, i.e. data we could not erase on request. The correspondence lives in the
   mailbox and in `infra/onboarded-brands.md`, where a deletion request can be honoured. Revisiting
   costs a scoped `dynamodb:DeleteItem` grant and a `--forget` flag on `register.py`.

---

## Suggested order

1. ~~**Auth first**, including the cross-brand test.~~ **Done** —
   `test_a_brand_cannot_update_another_brands_gear`, plus the two follow-ups that matter more than
   it does: the same attempt by *name*, and a foreign id sent alongside one of their own names
   (ownership is checked before any fallback could rescue the request).
2. ~~**Gear data**, reusing `SubmissionKind` + `fields.py` + the existing repository. Add
   `manufacturer_sku`.~~ **Done.**
3. ~~**Triage UI** for the new kind.~~ **Done** — batch grouping, a manufacturer badge, the SKU, and
   a reject path on approved rows. Not yet covered by Cypress.
4. **Photos — as links.** See § Step 4 — photos as links. No new infrastructure: brands send URLs of
   photos they already publish, and `scripts/fetch_submission_images.py` files them under the right
   key. `UploadsBucket` stays in `serverless.yml`, unused.
