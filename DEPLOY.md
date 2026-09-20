# Deploy

Two independently deployable halves. Full detail — failure modes, first-deploy setup,
rollback, the orphan trap — is in [infra/README.md](infra/README.md).

| You changed | Run |
|---|---|
| Frontend code, styles, copy, images in `frontend/public/` | **B** |
| Root `*.json` gear data (baked into the Lambda image) | **A** |
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
```

Expired token → `aws sso login --profile isa-slackdata`, then re-run the `eval`.

## A — API, data, infrastructure

```bash
cd infra
export TURNSTILE_SECRET='...'      # Cloudflare dashboard, slackdata.org. Never in git.
./preflight.sh                     # dirty tree, unset secret, wrong account
npx serverless deploy --stage prod
cd ..
```

2–4 minutes. A `serverless.yml` change that alters the CloudFront distribution ~15.

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

If Cognito or Turnstile values changed, `./sync-env.sh prod` before `npm run build` —
Vite inlines them, and an empty value fails dark (no suggestion form, no admin sign-in).

## Verify

```bash
cd infra && ./verify-deploy.sh https://slackdata.org && cd ..
```

## Rollback

```bash
cd infra && npx serverless rollback --stage prod && cd ..  # A
# B: check out the previous commit, rebuild, re-run B (S3 keeps no history)
```
