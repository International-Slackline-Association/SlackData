# Live editing — Phase 2

Phase 2 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 13): the catalogue imported into
DynamoDB; the in-memory read path running **in shadow** beside the baked catalogue, compared on
every deploy; then switched over; the daily export to the data repo starts.

**Done when:** the site reads from DynamoDB; the seeds are no longer hand-edited.

**Status (2026-10-13): built and tested locally, not deployed.** § 3 is the rollout.

---

## 1. What was built

| Part | Where |
|---|---|
| The stored document: one seed entry, verbatim — nothing derived is stored (§ 5.2) | [catalogue/documents.py](slack_data/catalogue/documents.py) |
| The store: Protocol + in-memory + SQLite + DynamoDB, with a version every write bumps | [catalogue/repository.py](slack_data/catalogue/repository.py), [catalogue/dynamo.py](slack_data/catalogue/dynamo.py), [catalogue/store.py](slack_data/catalogue/store.py) |
| The build: today's `seed_catalog`, unchanged, run into in-memory SQLite from the store's documents | [catalogue/build.py](slack_data/catalogue/build.py), `seed_sources()` in [_seed_io.py](slack_data/load_data/_seed_io.py) |
| The live catalogue: one version read per request, a rebuild only when it moved (D30) | [catalogue/live.py](slack_data/catalogue/live.py), [database.py](slack_data/database.py) |
| The importer and the shadow check: seeds → store; `--check` compares document by document **and** as built catalogues | [catalogue/importer.py](slack_data/catalogue/importer.py) |
| The switch: `CATALOG_SOURCE=store` (rollback: anything else) | [database.py](slack_data/database.py), [serverless.yml](infra/serverless.yml) |
| Public `GET /catalogue` and `GET /catalogue/{collection}` — each seed file, rebuilt from the store, byte for byte | [catalogue_router.py](slack_data/api/routers/catalogue_router.py) |
| The daily export script (stdlib only) and the workflow for the data repo | [export/](export/) |
| `CatalogTable` (`slackdata-catalog-<stage>`, PK `collection`, SK `key`, retained) | [serverless.yml](infra/serverless.yml) |
| Preflight runs the shadow check; verify-deploy reports the store's state | [preflight.sh](infra/preflight.sh), [verify-deploy.sh](infra/verify-deploy.sh) |

**Choices made while building, not in the plan:**

- **A document is one seed entry, verbatim**, and a seed file is a collection. The loaders then run
  exactly as today, reading the store's documents assembled back into each file's shape — so there
  is one load path, and derived fields (ISA flags, certification, co-listings, brand enrichment)
  are still computed, never stored.
- **`data` is stored as a JSON string** in DynamoDB, not a map, so numbers come back as the seed's
  own ints and floats rather than `Decimal`.
- **Nothing is deleted: a removed entry is `retired`.** The Lambda role has no `DeleteItem`.
- **The switch is one environment variable, chosen at deploy time**, and the image keeps baking the
  catalogue, so the rollback is the same variable flipped back. Dropping the bake is a later
  clean-up, after the store has served for a while.
- **`READ_ONLY` keeps meaning "a baked file"**, because `deployment.is_hosted()` reads it; the new
  `CATALOGUE_WRITABLE` says whether the raw CRUD writes are mounted. Store mode never mounts them,
  hosted or local: an edit to the in-memory copy would vanish at the next rebuild.
- **The export reads public routes only** and writes files byte-identical to the seeds, plus the
  change log **oldest first** (an append-only log then diffs as lines added at the end) and no
  timestamp (a quiet day makes no commit).
- **An import is not logged in the change log** — it is not an edit anyone made.
- **Per-type id counters (D26) are not built:** nothing creates items yet. They come with phase 3.

**Found while testing:** renaming a product in the store loses its photo on the page, because
images (and manuals) are keyed by `<brand-abbrev>_<name-slug>`. Harmless today — nobody renames
through the store — but phase 3 opens renames to editors, so media keys must stop depending on the
name before then (phase 4's media migration, D47, is the natural place; or key by id).

**Cost of a rebuild:** about 2 s for the whole catalogue, on a cold start and after each version
change. Fine at today's edit rate; worth measuring on Lambda before phase 3.

---

## 2. Local use

```bash
# fill a local store from the seeds, then check it
export CATALOG_STORE_PATH=/tmp/catalog_store.db
python -m slack_data.catalogue.importer --apply
python -m slack_data.catalogue.importer --check

# serve the site from it (dev token still works: store mode alone is not hosted)
cd slack_data && CATALOG_SOURCE=store CATALOG_STORE_PATH=/tmp/catalog_store.db fastapi dev main.py

# export it, exactly as the data repo's workflow will
python export/export_catalogue.py --api http://localhost:8000 --out /tmp/export
```

Without `CATALOG_SOURCE=store`, nothing changes: the local server still seeds `database.db` from the
root files, and the hosted one still reads the baked file.

---

## 3. Rollout — in this order

1. **Deploy half A as usual.** It creates `slackdata-catalog-prod`. `CATALOG_SOURCE` is unset, so
   the site keeps reading the baked catalogue — the store runs in shadow.
2. **Fill the store** (operator, SSO; needs boto3: `pip install '-e.[aws]'`):

   ```bash
   CATALOG_TABLE=slackdata-catalog-prod python -m slack_data.catalogue.importer          # dry run
   CATALOG_TABLE=slackdata-catalog-prod python -m slack_data.catalogue.importer --apply
   CATALOG_TABLE=slackdata-catalog-prod python -m slack_data.catalogue.importer --check
   ```

3. **Shadow period.** Seeds are still edited by hand; re-run `--apply` after each seed change.
   `./preflight.sh` runs `--check` before every deploy and warns on drift. `./verify-deploy.sh`
   reports `store (shadow)` and the version. `https://slackdata.org/api/catalogue/webbings` is the
   store's copy, live.
4. **Switch over:** `CATALOG_SOURCE=store npx serverless deploy --stage prod`, then
   `./verify-deploy.sh` (expects `source: store`) and a look at the site.
   **Rollback:** `CATALOG_SOURCE=baked npx serverless deploy --stage prod`.
5. **From then on the store is the truth (D4): stop hand-editing the root seeds.** Until phase 3's
   edit routes exist, a correction is still a seed edit followed by `importer --apply` — which is
   fine only while nothing else writes the store; the first phase-3 edit ends that.
6. **Start the daily export** in [emilebragard/slackdata-data](https://github.com/emilebragard/slackdata-data):
   copy [export/export_catalogue.py](export/export_catalogue.py) to its root and
   [export/slackdata-data-export.yml](export/slackdata-data-export.yml) to
   `.github/workflows/export.yml`, then run it once by hand (`workflow_dispatch`).

**Not done here, and why:** tests still read the root seed files rather than a pinned snapshot of
the data repo (D34, D49) — that becomes the right move once the seeds stop being edited (step 5),
and the export writes files in exactly the seed format so the swap is a copy.
