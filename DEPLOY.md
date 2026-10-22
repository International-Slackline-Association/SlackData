# Deploy

Two independently deployable halves. Full detail — failure modes, first-deploy setup,
rollback, the orphan trap — is in [infra/README.md](infra/README.md).

| You changed | Run |
|---|---|
| Frontend code, styles, copy, images in `frontend/public/` | **B** |
| Root `*.json` gear data, brands, ISA lists (a pull request adding to the seeds) | **A**, then **A2**, then **B** |
| Python API code (`slack_data/`), `infra/serverless.yml` | **A** |
| Both | **A**, then **B** |

Running the wrong half is the usual cause of "I deployed and nothing changed".

## 0 — credentials and stack outputs (always, both halves)

```bash
cd infra
unset AWS_PROFILE                                  # serverless v3 cannot read an SSO profile
eval "$(aws configure export-credentials --profile isa-slackdata --format env)"
aws sts get-caller-identity                        # expect the ISA account

out() { aws cloudformation describe-stacks --stack-name slackdata-prod --region eu-central-1 \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out WebBucketName); DIST=$(out CdnDistributionId); CDN=$(out CdnDomain)
echo "$BUCKET / $DIST / $CDN"
cd ..
```

Expired token → `aws sso login --profile isa-slackdata`, then re-run the `eval`.

## A — API, data, infrastructure

```bash
cd infra
./preflight.sh
CATALOG_SOURCE=store npx serverless deploy --stage prod
cd ..
```

**Always pass `CATALOG_SOURCE=store`.** `serverless.yml` defaults it to `baked`, so a deploy
without it quietly puts the site back on the catalogue baked into the image: every edit made on
the site disappears from view (they are still in the store, and come back with the next deploy that
passes it). `verify-deploy.sh` reports `source: store` when it is right.

2–4 minutes. A `serverless.yml` change that alters the CloudFront distribution ~15.

## A2 — what a pull request added to the seeds

The site reads the catalogue store, not the seeds, and `importer --apply` refuses a store with live
edits. A pull request that adds to the seeds (a gear type, products, a co-listing, a certificate's
match) reaches the site through the seed import: it creates what the store lacks, with its photos,
and sets fields the change log shows the site never changed; anything changed on the site, or a key
the site gave to another entry, is left and reported. Every write is logged as an `import` under
your ISA id. Run it after **A** (the new code must know the new fields) and before **B** (the new
frontend should not show a gear type before it has rows):

```bash
export CATALOG_TABLE=$(out CatalogTableName) CHANGELOG_TABLE=$(out ChangelogTableName) \
       PEOPLE_TABLE=$(out PeopleTableName) SQL_ECHO=false
python -m slack_data.catalogue.seed_import                                        # read the plan
python -m slack_data.catalogue.seed_import --as <your ISA id> \
  --media-bucket "$(out MediaBucketName)" --apply
python -m slack_data.catalogue.seed_import --check                                # exit 0
```

Read the plan before applying: a `!` line is something it will not do (a field edited on the site
since, a renumbering the seeds need). Then `./verify-deploy.sh` (`isa_skipped: 0`).

## B — website (SPA + images)

```bash
cd frontend
npm run build

aws s3 sync dist/ "s3://$BUCKET" --delete \
  --exclude "index.html" --cache-control "public,max-age=31536000,immutable"

aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,must-revalidate"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*'
cd ..
```

`index.html` must stay uncached — it is the only filename that does not change between
builds. **Replacing** an image under `frontend/public/` needs a rename or a per-path
invalidation: those files are not fingerprinted but carry the one-year immutable header.

If the ISA sign-in values changed, `./sync-env.sh prod` before `npm run build` —
Vite inlines them, and an empty value fails dark (no sign-in).

## Verify

```bash
cd infra && ./verify-deploy.sh https://slackdata.org && cd ..
```

## Rollback

```bash
cd infra && npx serverless rollback --stage prod && cd ..  # A
# B: check out the previous commit, rebuild, re-run B (S3 keeps no history)
```
