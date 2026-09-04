# Lambda execution role — what SlackData needs, and when

**Status: Tier 1 was sent, granted and applied on 2026-08-23, and re-confirmed against the live
role on 2026-08-24.** This file is the *reasoning* — why each grant exists and what is deliberately
excluded. The **authoritative policy text is
[ISA_ROLE_REQUEST_PHASE2.md](ISA_ROLE_REQUEST_PHASE2.md)**, which is what was actually sent and
applied; where the two ever differ, that one is right and this one is stale.

The JSON blocks in *this* file are per-tier excerpts, and two of them showed the shape that was
**drafted** rather than the one that was **granted** — the logs statements and the SES statement.
Both are corrected below against the live policy, with the difference called out, because "what we
asked for" and "what we hold" are exactly the pair you need to get right when deciding whether
something is missing.

> Earlier revisions of this file said it "supersedes" the DynamoDB statement in that request, and
> then showed a *narrower* resource (`table/slackdata-submissions-prod` alone). That was a trap: the
> policy as sent scopes to `table/slackdata-*`, which is what lets Phase 4's
> `slackdata-brand-clients-prod` table work without a fourth round-trip to the ISA. Applying the
> narrow version would have left every authenticated manufacturer request failing with
> `AccessDeniedException`. The block below now matches what was granted.

**Why any of this was needed, in two sentences:** the SlackData API runs as a Lambda whose execution
role permitted nothing but writing its own logs, because Phase 1 was a read-only catalogue baked into
the container image and made no AWS calls at all. Everything that follows — storing a visitor's
correction, letting more than one person sign in, or a brand posting its own specs — requires the
Lambda to call an AWS service it was forbidden from touching, and each of those calls needs an
explicit, scoped grant.

Three tiers, each additive. **Tier 1 is granted and in use.** Tier 2 is not requested. Tier 3's one
runtime grant (S3 on the uploads bucket) went out with Tier 1 and is not used yet — the manufacturer
API ships without photo uploads.

| Tier | Enables | Status |
|---|---|---|
| 1 | Single admin triaging a public suggestion box, plus the Phase 4 manufacturer API | **Granted and applied 2026-08-23** |
| 2 | Multiple accounts: manufacturers, contributors, admins | Phase 3, not yet built |
| 3 | Photo uploads on the API manufacturers call | Granted with Tier 1; **unused** — no upload route exists yet |

Placeholders: `<ACCOUNT>` = the AWS account id, `<REGION>` = `eu-central-1`, `<POOL>` = the Cognito
user pool id. Nothing below uses `Resource: "*"` except where the AWS API genuinely takes no
resource.

---

## The role before Phase 2

`slackdata-prod-eu-central-1-lambdaRole` held nothing but CloudWatch Logs write. That stays exactly
as it is in every tier below; everything else was appended. As live, it is **two** statements rather
than one — `PutLogEvents` is split out because it acts on the log *stream*, one ARN level deeper:

```json
{
  "Effect": "Allow",
  "Action": ["logs:CreateLogStream", "logs:CreateLogGroup", "logs:TagResource"],
  "Resource": ["arn:aws:logs:<REGION>:<ACCOUNT>:log-group:/aws/lambda/slackdata-prod*:*"]
},
{
  "Effect": "Allow",
  "Action": ["logs:PutLogEvents"],
  "Resource": ["arn:aws:logs:<REGION>:<ACCOUNT>:log-group:/aws/lambda/slackdata-prod*:*:*"]
}
```

That shape is not ours to tidy: it reproduces the Serverless Framework's own default execution-role
policy statement-for-statement, which is the whole point of a hand-created role that the deploy then
references (§ LAUNCH_RUNBOOK.md 5.4 — `iam:CreateRole` is denied, so the ISA creates the role and
`provider.iam.role` points at it). Note the prefix is `slackdata-prod*` with **no trailing hyphen**,
so it matches the log group of every function this service deploys.

---

## Tier 1 — suggestion box + manufacturer API (granted, applied 2026-08-23)

A visitor submits a correction, or a brand posts an update to its own products; it is stored; one
admin reviews it. Approved changes are still applied by hand to the JSON in git and redeployed —
**the live catalogue stays read-only.**

```json
{
  "Sid": "SlackDataTables",
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem",
    "dynamodb:Query",
    "dynamodb:UpdateItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:<REGION>:<ACCOUNT>:table/slackdata-*",
    "arn:aws:dynamodb:<REGION>:<ACCOUNT>:table/slackdata-*/index/*"
  ]
}
```

- **The `slackdata-*` prefix is doing real work, not saving typing.** It covers
  `slackdata-submissions-prod` (Phase 2) *and* `slackdata-brand-clients-prod` (Phase 4, the mapping
  from a Cognito app client to one of our brands, read on every authenticated manufacturer request).
  Both are created by `infra/serverless.yml` with that prefix, and naming them individually would
  mean a new round-trip to the ISA for each. It is a prefix on tables **this service creates**, in
  one account and one region — not a wildcard on the DynamoDB namespace.
- **No `DeleteItem`.** Submissions are append-only; a review is an `UpdateItem` on the status field,
  and expiry is DynamoDB's own TTL, which runs as a service and needs no permission on this role.
  Revoking a brand's credentials is likewise `active = False`, never a delete.
- **No `Scan`.** The application makes exactly one query — "pending, oldest first" — against the
  index. Nothing reads the table without a key.
- **No Cognito permission.** Admin login is verified against the pool's *public* JWKS endpoint over
  ordinary HTTPS. That is not an AWS API call.

> **SUPERSEDED — this grant was applied and is now unused.** SlackData sends no email. The block
> below stays for the record, because the policy really does carry it; **drop `ses:*` at the next
> revision of this policy** rather than raising a request of its own. The reasoning is in
> [README.md](README.md) § No email — briefly: the setup cost is permanent and ours, and a Lambda
> that may send mail *as* `slackdata.org` is a phishing vector bought for one notification. Human
> contact is a Google-Workspace alias on the ISA's domain (the shape
> `slackmap@slacklineinternational.org` already uses), which needs no AWS permission at all.

The admin was to be emailed when a submission arrives, so there is nothing to remember to check:

```json
{
  "Sid": "SlackDataEmail",
  "Effect": "Allow",
  "Action": ["ses:SendEmail", "ses:SendRawEmail"],
  "Resource": "arn:aws:ses:<REGION>:<ACCOUNT>:identity/slackdata.org",
  "Condition": {
    "StringLike": { "ses:FromAddress": "*@slackdata.org" }
  }
}
```

- **The SES sandbox is not a blocker at this tier.** It restricts *recipients*, and the only
  recipient is the site's own administrator — verifying that address plus the sending identity is
  enough. No support ticket, no sending reputation to manage, no bounce handling, because we are not
  mailing the public. That changes if submitters are ever emailed; it is not what this grants.
- **What was granted is broader than what was designed, which sharpens the case for dropping it.**
  The draft above this line asked for `SendEmail` alone from `noreply@slackdata.org` (`StringEquals`);
  the applied policy carries `SendRawEmail` too and conditions on `StringLike "*@slackdata.org"` —
  i.e. arbitrary MIME from **any** address at the domain. Nothing sends mail, so nothing uses it; but
  an unused grant that wide is the one to delete first, not last.
- **A failed send never fails a submission.** The notifier logged and moved on, so a missing
  permission or an SES outage cost an email, not somebody's correction. Moot now: there is no
  notifier. `tests/test_submissions.py::test_the_app_sends_no_email` is the guard that keeps it
  that way.

---

## Tier 2 — multiple accounts (Phase 3, not requested yet)

Manufacturers editing their own gear, contributors suggesting edits, admins approving — the account
tiers in CLAUDE.md § Product Vision. Cognito becomes something the application administers rather
than merely reads, because accounts are created by approval rather than self-signup.

```json
{
  "Sid": "AccountData",
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem",
    "dynamodb:Query",
    "dynamodb:UpdateItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:<REGION>:<ACCOUNT>:table/slackdata-accounts-prod",
    "arn:aws:dynamodb:<REGION>:<ACCOUNT>:table/slackdata-accounts-prod/index/*"
  ]
},
{
  "Sid": "TransactionalEmail",
  "Comment": "Widens Tier 1's SES grant: mail now goes to applicants, not just to us",
  "Effect": "Allow",
  "Action": ["ses:SendEmail", "ses:SendRawEmail"],
  "Resource": "arn:aws:ses:<REGION>:<ACCOUNT>:identity/slackdata.org",
  "Condition": {
    "StringEquals": { "ses:FromAddress": "noreply@slackdata.org" }
  }
}
```

**Corrected 2026-08-19: this tier needs no Cognito permission at all**, and the statement that used
to be here has been removed. The Lambda never calls Cognito — sign-in is browser-to-Cognito, the API
only verifies the resulting ID token against the pool's public JWKS over HTTPS, and a user's tier
arrives in that token as `cognito:groups`. Creating and disabling accounts is an administrator
action performed in the console or CLI, by design: sign-up is disabled and accounts are made on
application. The pool carries `Project=slackdata` tags so that *if* in-app user management is ever
wanted, it can be granted by `aws:ResourceTag` condition rather than by an id that does not exist
until the first deploy.

Worth flagging before this tier is granted:

- **`AdminDeleteUser` is deliberately absent.** Disabling an account is reversible and auditable;
  deleting one is neither. A GDPR erasure request is rare enough to be an ISA admin doing it by hand.
- **This is where SES gets expensive**, and not in money. Tier 1 mails one verified administrator;
  this tier mails members of the public, which means leaving the sandbox (a support request AWS
  reviews), handling bounces and complaints, and attaching a sending reputation to the ISA's domain.
  It is listed because approving an account is meaningless if the applicant is never told — but it
  is a genuinely different commitment from the alert in Tier 1, and deserves its own conversation.
- This tier is also where a submission gains a `submitted_by` attribution. The field already exists
  and is always null today, precisely so that adding it later is not a backfill.

---

## Tier 3 — photo uploads on the manufacturer API (granted, not yet used)

**Corrected 2026-08-19.** This tier was previously written the wrong way round — as SlackData
fetching data *from* manufacturers' APIs. It is the opposite: **we publish an API that brands call**
to keep their own gear data and product photos current, instead of the data being transcribed by
hand. That inverts the permissions, and mostly shrinks them.

What an inbound API needs at runtime:

```json
{
  "Sid": "SlackDataUploads",
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": "arn:aws:s3:::slackdata-uploads-prod-<ACCOUNT>/*"
}
```

**Not the website bucket — that would delete the uploads.** Half B of the deploy runs
`aws s3 sync dist/ --delete` over `slackdata-web-prod-*`, and gear images are build output
(`frontend/public/gear-images/`, resolved through a build-time manifest). A photo written into that
prefix would be destroyed by the next deploy, and would not render before then either, because it
is absent from the manifest. `UploadsBucket` in serverless.yml exists precisely so nothing syncs
over it: it is a quarantine for unreviewed binaries, private, encrypted, with a 90-day lifecycle
rule so rejected uploads do not accumulate. A photo becomes a site asset the same way every other
one does — reviewed, committed to the repo, deployed.

**Still no `s3:DeleteObject`**, for the same reason the submissions table has no `DeleteItem`.

And that is all, because of where the other two pieces live:

- **Authenticating a manufacturer needs no IAM.** A Cognito app client per brand, using the
  machine-to-machine client-credentials flow, means the brand holds the secret and the Lambda only
  verifies the resulting token's signature against the pool's public JWKS — the same mechanism the
  admin login already uses, and not an AWS API call. The alternative, issuing our own API keys,
  means storing a *hash* of each key in DynamoDB and comparing on request, which the existing
  `SlackDataTables` grant already covers.
- **Their submitted data is not a special case.** A manufacturer editing their own gear still
  produces a record for review rather than a live catalogue write — the catalogue remains a
  read-only file built from git. So it lands in the same table under the same grant, and the only
  genuinely new thing is somewhere to put an uploaded photo.

**No `secretsmanager:GetSecretValue`.** That was in the earlier draft to hold *manufacturers'* API
keys so we could call them. We are not calling them, so there is no third-party credential to keep.
If we ever do need one — signing an outbound webhook, say — note that the outbound HTTPS call itself
needs no permission either; only storing the credential would.

Worth flagging before this tier is designed properly:

- **Per-brand rate limiting** belongs on API Gateway (usage plans, or route throttling as already
  used for `POST /submissions`). That is deploy-time configuration, not a role permission.
- **Upload size and type limits matter more here than anywhere else on the site**, because this is
  the first endpoint that accepts a binary from outside. A cap belongs in the route, not in IAM.
- **Still no VPC and no `ec2:*`.** Nothing here needs one.

---

## Deploy-time permissions (my SSO session, not the Lambda role)

Separate from everything above, and the distinction that matters most on this page: **nothing in the
policy above applies here.** That policy governs what the *running function* may do. The resources
below are created by CloudFormation under my own SSO session (`slackdata-dev-access`) — a different
principal, which the Phase 2 request never mentioned and could not have changed. No grant on the
Lambda role can unblock a deploy-time action, and the role deliberately holds **no `cognito-idp:*` at
all**, because tokens are verified against the pool's public JWKS rather than through an AWS API.

| Tier | Actions needed by the deploying identity | Status |
|---|---|---|
| 1 | `dynamodb:CreateTable`, `DescribeTable`, `UpdateTimeToLive`, `UpdateContinuousBackups`; `cognito-idp:CreateUserPool`, `CreateUserPoolClient`, `CreateUserPoolDomain` | **Confirmed 2026-08-24** |
| 2 | `cognito-idp:CreateGroup` | not checked — not needed yet |
| 3 | `apigateway:*` on the service's own API (usage plans / per-brand throttling) | not checked — not needed yet |
| 4 | `cognito-idp:CreateResourceServer` (+ `DescribeResourceServer`, `UpdateResourceServer`, `DeleteResourceServer` for stack updates and rollback) | **Confirmed 2026-08-24** |

**Tier 1 no longer needs `ses:VerifyEmailIdentity`** — the app sends no email; see
[README.md](README.md) § No email.

### Tier 4 was never a gap — confirmed 2026-08-24

**`cognito-idp:CreateResourceServer` is permitted.** Proven by direct API call against a throwaway
user pool (method below), along with `CreateUserPool`, `CreateUserPoolClient`, `CreateUserPoolDomain`
and the two matching deletes. No `AccessDeniedException` on any of them.

Earlier revisions of this file said `CreateResourceServer` "is not in the granted set", and
`serverless.yml`, `preflight.sh` and `README.md` each repeated it. **That was wrong**, and it is why
Phase 4 was written up as undeployable rather than merely un-onboarded. It was an **inference from
the tier-1 row above**, read as though the deploying identity carried an enumerated allowlist the way
the Lambda role does. It does not: `slackdata-dev-access` is **`Allow *` with a short deny list**
(LAUNCH_RUNBOOK.md § 5.4), whose known entries are `DenyIdentitySelfEscalation` — `iam:CreateRole`
and friends — and `ec2:*`. Cognito appears in neither. LAUNCH_RUNBOOK.md § 11 reaches the same
conclusion from reading the permission set directly: *"Everything the deploy needs is permitted
**except** IAM role creation."*

**Tier 4 was not the only unexercised row, which is why the check below covers more than it.**
Nothing in this table had ever run: Phase 1 deployed no Cognito and no DynamoDB, so the pool, the
clients, the domain and both tables all first execute during half A. A denial on any one of them
fails the stack part-created.

**All of it is now proven — every deploy-time action in the table above, checked on 2026-08-24.**
Cognito: `CreateUserPool`, `CreateResourceServer`, `CreateUserPoolClient`, `CreateUserPoolDomain`,
plus both deletes. DynamoDB: `CreateTable`, `UpdateTimeToLive`, `UpdateContinuousBackups`,
`DeleteTable`. There is no known un-granted action left between this repo and a full Phase 2/4
deploy.

> **Reading the DynamoDB failures correctly.** Run back-to-back, the two `update-*` calls and the
> delete fail with `ResourceInUseException` / `ContinuousBackupsUnavailableException` — *"the table
> is being created"*. That is sequencing, not authorization, and it looks nothing like
> `AccessDeniedException`. Re-run once the table is `ACTIVE` and all three succeed. CloudFormation
> waits for `ACTIVE` itself, so the stack never meets this race.

How they were proven, kept as the method — a **throwaway user pool** and a throwaway table, free,
empty, and deleted immediately afterwards:

```bash
SCRATCH=$(aws cognito-idp create-user-pool --pool-name slackdata-permcheck \
  --query 'UserPool.Id' --output text)                      # CreateUserPool
aws cognito-idp create-resource-server --user-pool-id "$SCRATCH" \
  --identifier slackdata --name 'SlackData gear API' \
  --scopes ScopeName=gear.write,ScopeDescription='Submit updates to your own gear'  # CreateResourceServer
aws cognito-idp create-user-pool-client --user-pool-id "$SCRATCH" \
  --client-name permcheck >/dev/null                        # CreateUserPoolClient
aws cognito-idp create-user-pool-domain --user-pool-id "$SCRATCH" \
  --domain "slackdata-permcheck-$RANDOM"                    # CreateUserPoolDomain (globally unique)

# Clean up — the domain first; a pool that still has one cannot be deleted.
aws cognito-idp delete-user-pool-domain --user-pool-id "$SCRATCH" --domain <the domain above>
aws cognito-idp delete-user-pool --user-pool-id "$SCRATCH"
```

```bash
aws dynamodb create-table --table-name slackdata-permcheck \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST
# wait for ACTIVE — see the note above:
aws dynamodb wait table-exists --table-name slackdata-permcheck
aws dynamodb update-time-to-live --table-name slackdata-permcheck \
  --time-to-live-specification "Enabled=true,AttributeName=expires_at"
aws dynamodb update-continuous-backups --table-name slackdata-permcheck \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
aws dynamodb delete-table --table-name slackdata-permcheck
```

CloudFormation acts with the calling identity's permissions, so a call that succeeds here succeeds
in the stack. Every one of them did, deletes included, on 2026-08-24.

**Check the cleanup actually happened**, and do not leave a scratch pool behind — one run of this
left a pool alive because its domain had to be deleted first:

```bash
aws cognito-idp list-user-pools --max-results 20 --query "UserPools[?Name=='slackdata-permcheck']"
aws dynamodb list-tables --query "TableNames[?contains(@, 'permcheck')]"
```

**This warning was written and then not followed.** `slackdata-permcheck`
(`eu-central-1_xaIj2Vgjx`) survived in the account until **2026-09-03**, ten days after the check it
existed to prove. The failure is worth recording because it is not the one the paragraph above
anticipates: the domain *was* deleted, which is the step that ordinarily blocks the delete — and
then `delete-user-pool` was simply never re-run, so the pool sat there with no domain, no users, no
clients and no tags, looking exactly like the cleanup had worked. Nothing surfaced it, because
nothing looks. The verification command above only helps if someone runs it; `preflight.sh` now
checks for orphaned pools on every deploy, but only for ones named `slackdata-admins-<stage>` —
a scratch pool under any other name is still invisible. **Delete it in the same shell you create it
in.**

### What to do with the flag now

Nothing needs creating by hand. CloudFormation can make the resource server in the real pool during
half A, which is where it belongs — so **deploy with the flag on**:

```bash
DEPLOY_MANUFACTURER_API=true npx serverless deploy --stage prod
```

The default stays `false` until half A has actually succeeded once. The flag was insurance against an
unproven permission; that reason is gone, but "proven by CLI" and "proven by this template" are not
the same claim, and the cost of keeping the switch one more deploy is zero. **Once half A is green
with it on, delete the `EnableManufacturerApi` condition** and let the resource be unconditional like
everything else — a flag nobody will ever set to `false` again is just a way to deploy the wrong
thing by forgetting it.

Do **not** create the resource server by hand now that the flag works. It would collide: CloudFormation
would try to create identifier `slackdata` in a pool that already has it, and fail the stack.

The `BrandClientsTable` is deliberately *not* conditional — the function's environment does
`!Ref BrandClientsTable`, and a `Ref` to a resource whose condition is false fails the template. An
empty on-demand table costs nothing.

**The flag is not the last thing between here and a live manufacturer API.** Turning it on only makes
`slackdata/gear.write` a scope Cognito will mint. A brand still cannot authenticate until someone
creates its app client by hand and runs `python -m slack_data.manufacturers.register` — and
MANUFACTURER_API_PLAN.md § Open questions 2 (who verifies that a company speaks for a brand) has no
answer yet. Ready is not the same as reachable.

Tiers 2 and 3 are unchecked, but nothing turns on them yet — and the same throwaway-resource method
answers them in minutes when it does. The lesson worth carrying: **absence from a list that was
never an allowlist is not a denial.** Check before writing it down.

---

## What is never requested, at any tier

- **No `iam:*`.** The `DenyIdentitySelfEscalation` guardrail stays exactly as it is; every change
  above is an ISA admin editing an existing role.
- **No `ec2:*`, no VPC.** See Tier 3.
- **No `secretsmanager:*`.** We publish an API rather than consuming anyone else's, so there is no
  third-party credential to store.
- **No `Resource: "*"`** on any statement.
- **No write access to the catalogue.** It remains a read-only SQLite file inside the container
  image, rebuilt from the JSON in git on every deploy. Nothing in any tier changes that.
