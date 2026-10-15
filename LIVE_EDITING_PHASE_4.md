# Live editing — Phase 4 (plan)

Phase 4 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 8, § 13): **photo and manual uploads for
admins**, and today's images and manuals migrated into a media store, retiring the build-time
manifests (D47).

**Done when:** a photo goes live without a deploy.

**Status (2026-10-15): built (4a–4f) on `live-editing/4-media`.** See § 8. Every choice in § 4 is decided (2026-10-15): the recommended
option on each, except P4-D (small first, then large on cards), P4-F (backed up by the export) and
P4-I (b), no request to the ISA. Built on `live-editing/4-media`, stacked on phase 3.

---

## 1. What phase 4 ships

| | |
|---|---|
| **Upload a photo** | An admin adds photos to an item from its edit panel. The browser resizes and re-encodes each one (D44), which also strips camera metadata such as GPS; the server checks type and size (D45) |
| **Upload a manual** | A PDF up to 25 MB, with a title ("User manual", "Test certificate" …) |
| **Order and remove** | Reorder an item's photos; take one off. Logged; nothing is deleted from storage |
| **Brand media** | A brand's logo, and its range-wide manuals ("Applies to all Gibbon webbings") |
| **The migration** | The 1,269 images (136 MB), 74 PDFs (79 MB) and 71 logos (2.5 MB) committed under `frontend/public/` move to the media store once, logged as `import` (D47) |
| **The manifests retire** | `gearImages.json`, `gearManuals.json`, `brandManuals.json`, `brandIds.json`, `manufacturerImages.json` stop being built into the bundle; the site asks the API |

**Not in phase 4:** uploads by manufacturers (phase 5) or everyone (phase 6, with the rate cap).

---

## 2. What it builds on

| Piece | State |
|---|---|
| `UploadsBucket` (`slackdata-uploads-<stage>-<account>`) — private quarantine, 90-day expiry | Exists, unused. Tier 3 grants the Lambda `s3:PutObject` / `s3:GetObject` on the **prod** one |
| The media bucket | Not created. The ISA granted `s3:PutObject` on `slackdata-media-prod-<account>/*` (request #6) |
| CloudFront | Two origins (web bucket, API). `/media/*` becomes a third (D48) |
| Media filed by id | `gear-images/<type>/<id>_<slug>/1.jpg …`; manuals likewise; brand manuals by `catalog_id` (phase 2) |
| Editing, the log, revs | Phase 3: a media change is an ordinary item edit, logged, conflict-checked |

---

## 3. Hazards found while planning

1. **The API cannot carry the files.** API Gateway and Lambda cap a request at ~6 MB (10 MB API
   Gateway, 6 MB Lambda payload); D45 allows 10 MB photos and 25 MB PDFs. The browser must upload
   straight to S3 — which is what § 8 of the plan says, and why the signed-URL design is not
   optional.
2. **The ISA's grants name prod buckets only.** `SlackDataMedia` and Tier 3 are on
   `slackdata-media-prod-*` and `slackdata-uploads-prod-*`; the staging stack shares prod's role, so
   **uploads cannot be tested on staging** as granted (the same gap as staging's logs). → P4-I.
3. **User files served from the site's own origin.** `slackdata.org/media/…` is same-origin with
   the app (D48). An uploaded SVG or HTML file there could run script as SlackData. Only JPEG, PNG,
   WebP and PDF are accepted, checked by **magic bytes** on the server, never by the name or the
   browser's claim; media responses carry `Content-Type` from the check, `X-Content-Type-Options:
   nosniff`, and PDFs `Content-Disposition: inline` with a sandboxing CSP. Today's two SVG logos are
   ours and migrate as they are.
4. **Nothing is deleted** (the role has no `s3:DeleteObject`, D20's spirit): removing a photo takes
   it off the item; the object stays. Storage grows by what admins upload — cents.
5. **The repo stops being the media backup.** Today git holds every photo. After migration the
   media bucket is the only copy unless something else is: → P4-F (versioning + a second copy).
6. **Local dev and tests have no S3.** The media store needs a local implementation, as every other
   store has. → P4-G.
7. **The frontend reads the manifests in ~10 places** (`utils/images.ts`, manuals, cards, detail,
   compare, the brand page, Cypress support). Switching them to an API-provided manifest of the same
   shape keeps that a mechanical change. → P4-C.

---

## 4. Decisions

### P4-A How the browser uploads — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) S3 presigned POST to the uploads bucket** *(chosen)* | S3 itself enforces the size limit (`content-length-range`) and the key; the API never handles the file; no new permission (Tier 3) | A small CORS rule on the uploads bucket |
| (b) Presigned PUT | Simpler request | No size limit enforced by S3 — the 25 MB cap would only be checked after the bytes land |
| (c) Through the API | One request | Impossible above ~6 MB (hazard 1) |

### P4-B Where an item's media is recorded — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) In the item's entry, `photos` and `manuals` keys beside `unmodelled`** *(chosen)* | One document per item, as everything else; an upload is an ordinary logged edit with a rev; the export carries the list | The entry grows a few paths |
| (b) A separate `media` collection, one document per file | Media history apart from specs | A second thing to keep in step with the item; merges must reach it |

### P4-C How the site learns which photos an item has — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) `GET /media/manifest`, the same shape as today's manifests, built per catalogue version** *(chosen)* | The frontend change is mechanical (a fetch for an import); cached by version like the catalogue | One more request on first load (small, cacheable) |
| (b) Photos on every gear `*Public` response | No extra request | A model change on nine types; the listing already fetches every item, so the payload grows everywhere |
| (c) Keep build-time manifests, regenerated on deploy | Nothing changes | Defeats the phase: a photo would still need a deploy |

### P4-D Photo sizes (D44) — **DECIDED 2026-10-15: two sizes, small first on cards**

Two sizes, **480 px and 1600 px** on the long edge, WebP. **A card shows the 480 at once, then
swaps in the 1600 when it has loaded**, only for cards on screen (the image is lazy, so a card
never scrolled to fetches neither). The detail page loads the 1600. Cost, accepted: a card that is
seen downloads both, so a listing scrolled to the end costs about what it does today plus the small
copies; the gain is that no card waits on the big one to show something.

| Option | For | Against |
|---|---|---|
| **(a) Two sizes, small first then large on cards** *(chosen)* | A card shows a photo as soon as the small one lands, and is sharp once the large one does; re-encoding strips metadata | A seen card downloads both |
| (a′) Two sizes, cards only ever load the small one | Lightest listing | Cards stay at 480 px, soft on a high-density screen |
| (b) Three sizes, JPEG | Maximum compatibility | Larger files, more to store |
| (c) One size, 1600 px | Simplest | Cards wait on the big image, as today |

### P4-E The migration's photos — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Re-encoded to the same sizes as uploads (P4-D)** *(chosen)* | One kind of photo everywhere; cards get lighter; metadata stripped from the old files too | A one-off script with Pillow (an ops-only dependency) |
| (b) Copied as they are | Byte-identical | Two kinds of photo for ever; GPS that may be in old files stays |

### P4-F After the migration: the files in the repo — **DECIDED 2026-10-15: backed up to the data repo; a snapshot in this repo for dev**

1. **The media bucket is the truth**, versioned, so an overwrite can be undone.
2. **The daily export copies the media into the data repo** ([emilebragard/slackdata-data](https://github.com/emilebragard/slackdata-data))
   beside the gear data and the log: new files only, fetched from the public `slackdata.org/media`,
   so it needs no credential. That is the backup outside AWS and outside the ISA's account, which
   is what § 6.6 wants the export to be. No second bucket, so nothing to ask the ISA for.
3. **This repo keeps a media snapshot for development**, refreshed deliberately in its own PR, the
   same way as the data snapshot tests use (D34, D49). The local media store (P4-G) serves it.
   `frontend/public/gear-*` and the build-time manifests still retire (4f); the snapshot moves to
   where the local store reads it.

Size: about 300 MB after the re-encode (P4-E): ~190 MB of 1600 px WebP, ~40 MB at 480 px, 79 MB of
PDFs. Git copes. The largest file is a 25 MB PDF, under GitHub's 100 MB limit, and no LFS is needed,
which keeps the free bandwidth quota out of it. Accepted: each repo's history keeps every file it
ever held, so this repo carries today's JPEGs and the re-encoded WebPs from the first refresh on, and
a photo removed from an item stays in both histories.

| Option | For | Against |
|---|---|---|
| **(d) Backed up by the export to the data repo; a pinned snapshot here for dev** *(chosen)* | A copy outside AWS; dev and CI need no AWS and no network; one export does data and media | Both repos' histories grow with every photo |
| (a) Removed from the repo; versioning, plus a weekly sync to a second private bucket | The repo stops carrying the files | The second copy is in the same AWS account |
| (b) Kept in the repo as a frozen backup | A copy outside AWS | Goes stale with the first upload |
| (c) Removed, no backup beyond versioning | Simplest | One account, one bucket |

### P4-G Local dev and tests — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) A filesystem media store (`MEDIA_DIR`), served by the API at `/media`, with a local stand-in for the presigned POST; `scripts/pull_media.py` downloads the published media from `slackdata.org/media` for local dev** *(chosen)* | No AWS needed, as D34 asks; tests use a temp dir; the same code path as hosted up to the S3 call | A local upload route that exists only in dev (refused hosted, like the dev tokens) |
| (b) MinIO / localstack in Docker | Real S3 semantics | A second container for every developer and CI job |

### P4-H Removing and reordering photos — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Both are edits of the item's `photos` list** *(chosen)* | Logged, revertable, conflict-checked like any field | — |
| (b) Removal only by a developer | Nothing can disappear | A wrong photo stays up |

### P4-I The staging permission gap (hazard 2) — **DECIDED 2026-10-15: (b)**

| Option | For | Against |
|---|---|---|
| (a) Ask the ISA to widen `SlackDataMedia` and Tier 3 to `slackdata-media-*` / `slackdata-uploads-*` *(recommended)* | Uploads testable on staging before prod, as phases 1–3 were | One more request to the ISA |
| **(b) Test uploads locally only, and on prod with a test item** *(chosen)* | No request | The first real S3 upload is on the live site |

Staging still gets everything that needs no S3 write: the media manifest, the `/media/*`
behaviour (served from staging's own media bucket, filled by the migration from the operator's
session), and the upload UI up to the presigned POST, which answers 403 there.

### P4-J Brand logos — **DECIDED 2026-10-15: (a)**

| Option | For | Against |
|---|---|---|
| **(a) Migrated too, as a `logo` on the brand's entry, editable like its other fields** *(chosen)* | `manufacturerImages.json` retires with the rest | Three more surfaces (brand card, brand page, directory) read the API manifest |
| (b) Left as build-time files | Smaller phase | One manifest, and one kind of media, still needs a deploy |

---

## 5. Design (for the recommended options)

*As built — where it differs from the plan above, this is what holds.*

**Upload, end to end:**

1. The editor picks files. Photos are drawn to a canvas at 480 px and 1600 px and exported as WebP
   (JPEG where the browser has no WebP encoder: Safari) (D44); a PDF is sent as it is. Over the
   limit (D45) or of another type → refused in the browser, before anything travels.
2. `POST /edit/media/uploads {files: [{purpose, content_type, size}]}` (admin) → one presigned POST
   per file to `UploadsBucket/edit/<upload id>`, with `content-length-range` (photo 5 MB processed,
   logo 2 MB, manual 25 MB) and the content type fixed, valid 10 minutes.
3. The browser posts each file straight to S3.
4. `PUT /edit/{slug}/{id}/media {rev, photos?, manuals?, why?}` — **the whole list as it should be**,
   each element an `id` already held (kept, in this position; a manual retitled) or a new `upload`.
   For each upload the API reads its first bytes and size (`GetObject` with a Range), checks the
   magic bytes (`slack_data/media/kinds.py`), copies it to the media bucket (`CopyObject`, served
   with the checked type) at `<type>/<id>/<media id>-480.webp` / `-1600.webp` or
   `<type>/<id>/<media id>-<title-slug>.pdf`, and commits the entry with its log record — one
   transaction, rev-checked, as every edit. So add, remove, reorder and retitle are one logged edit.
   `PUT /edit/brand/{catalog_id}/media {rev, logo?, manuals?: {type: [...]}, why?}` likewise.
5. The next request's `GET /media/manifest` lists it; the CDN serves `/media/…`, cached a year (no
   key is ever reused).

**Media keys in an entry:** `"photos": [{"id", "small", "large"}]`, `"manuals": [{"id", "file",
"title"}]`; on a brand, `"logo": "<key>"` and `"manuals": {"<collection>": [...]}`. Not model fields:
the loader skips them like `unmodelled`, the generic edit form may not set them (only the media
route and a revert), and the export carries them.

**Infra:** `MediaBucket` (`slackdata-media-<stage>-<account>`, private, versioned, retained on
stack deletion, served only via the CloudFront OAC); two cache behaviours, `/media/*.pdf` and
`/media/*`, each with a response-headers policy — nosniff on both, and `default-src 'none'` on
everything but PDFs, whose built-in browser viewers run under the document's CSP; CORS (POST only)
on `UploadsBucket` for the site's origins; `MEDIA_BUCKET`, `UPLOADS_BUCKET`, `MEDIA_BASE_URL=/media`
on the Lambda. No new IAM beyond request #6.

---

## 6. Build order (stacked on phase 3, one PR)

| Step | Contents |
|---|---|
| **4a** Media store | Protocol + filesystem + S3; presigned POST (and its local stand-in); magic-byte check; publish; tests on each |
| **4b** Routes | Upload targets, attach / remove / reorder on items and brands, `GET /media/manifest`; logged edits |
| **4c** Migration | Made the repo's dev snapshot once (`media/` and the seeds' media keys: re-encoded, metadata stripped); `python -m slack_data.media.migrate` then copies that snapshot into a hosted store and adds the keys to the stored entries, logged as `import`; `--check` |
| **4d** Frontend | Browser processing; upload UI in the edit panel; every manifest reader switched to the API manifest |
| **4e** Infra | `MediaBucket`, `/media/*` behaviour, headers policy, uploads CORS; verify-deploy checks |
| **4f** Retire | `frontend/public/gear-images`, `gear-manuals`, `manufacturer-images`, the five manifests, and the scripts that gathered photos (`build_gear_manifest.py`, `fetch_submission_images.py`, `fetch_manufacturer_assets.py`) removed — photos are uploaded by hand from now on (2026-10-15) |

---

## 7. To settle with the ISA

Nothing. P4-I (b) needs no wider grant, and P4-F's backup is the export, which needs none.

---

## 8. As built (2026-10-15), and the rollout

**Built:** 4a–4e, on `live-editing/4-media`.

- **Backend:** `slack_data/media/` (kinds, store, s3, edits, manifest, migrate), the media routes in
  `edit_router.py`, `media_router.py` (the manifest; locally also the upload stand-in and `/media/*`).
- **Migration and dev snapshot:** `media/` holds the 2,683 migrated files (187 MB: the photos are
  103 MB where the originals were 136), and the root seeds name them. A file's media id is the start
  of its source's SHA-256, so the prod run names every file exactly as the snapshot does.
- **Frontend:** `utils/mediaStore.ts` fetches the manifest once per page load; `utils/images.ts`,
  `manuals.ts` and `manufacturerImages.ts` read it, so the build-time manifests are no longer
  imported. The carousel loads small then large. The **Photos and manuals** dialog on items and
  **Logo and manuals** on brands (`components/edit/MediaEditor.tsx`); media changes read in words
  in History.
- **Export:** `export/export_catalogue.py` now copies every media file the manifest names into
  `media/<key>` (new keys only, nothing deleted) — the backup outside AWS (P4-F); `--snapshot`
  refreshes this repo's own.
- **Infra:** as § 5; `verify-deploy.sh` checks the manifest's base, a photo's 200, type and nosniff,
  and that the upload stand-in is off.

**Photos are uploaded by hand from now on (decided 2026-10-15).** The scripts that gathered photos
while the catalogue was being built — the manifest builder, the manufacturer-photo filer, the SlackDB
logo fetcher — are removed with the old trees. A brand's `image_urls` are still recorded by the
manufacturer API; the triage row lists them and says to add them on the item's page.

**4f was done here, not after prod**, since the migration now reads the repo's snapshot rather than
the old trees. Photos added to `frontend/public/` on another branch after phase 4 branched are not in
the snapshot: add them on the site once it is live.

**Rollout** (after phases 0–3 are merged and prod reads the store):

1. **Half A** (API + infra): creates `MediaBucket`, the `/media/*` behaviours and the env.
2. **Migrate prod**, from the operator's SSO session:
   `CATALOG_TABLE=slackdata-catalog-prod PEOPLE_TABLE=slackdata-people-prod
   CHANGELOG_TABLE=slackdata-changelog-prod python -m slack_data.media.migrate
   --media-bucket slackdata-media-prod-<acct> --as <admin ISA id> --apply`, then `--check` (exit 0).
   Logged as one `import` record per item and brand.
3. **Half B** (the frontend that reads the manifest), then `infra/verify-deploy.sh`.
4. **The data repo:** copy the new `export_catalogue.py` there; the next run backs up the media.

**Staging (P4-I b):** everything but the S3 writes. The migration can fill staging's media bucket
from the operator's session; an upload from the dialog is refused by S3 (the role's grants name
prod), and the dialog says so.
