# Request to the ISA — live editing with ISA accounts

**DRAFT, not sent — on hold** until the non-technical proposal
([LIVE_EDITING_PROPOSAL.md](../LIVE_EDITING_PROPOSAL.md)) has had the ISA's input.
The Phase 0 request from [LIVE_EDITING_PLAN.md](../LIVE_EDITING_PLAN.md):
everything the ISA is asked for, at once (D50). Notes for us first; the email is below the line.

**Before sending:**

- ~~**Check the live policy still matches the one this is based on.**~~ **Checked 2026-10-05: it
  matches.** The live `slackdata-prod-lambda` policy is still exactly
  [ISA_ROLE_REQUEST_PHASE2.md](ISA_ROLE_REQUEST_PHASE2.md): the two `logs:` statements,
  `SlackDataTables`, `SlackDataEmail` and `SlackDataUploads`, unchanged. The JSON below is that
  policy plus the changes it describes. Re-run if this sits unsent for long:
  `aws iam get-role-policy --role-name slackdata-prod-eu-central-1-lambdaRole --policy-name slackdata-prod-lambda`
- **Substitute `<ACCOUNT>`** with the real account id. It is redacted here because this repo is
  public.
- **Table and bucket names are proposals.** The deny names one table exactly, so its name must be
  final before sending: `slackdata-changelog-prod`. The other two are `slackdata-people-prod` and
  `slackdata-catalog-prod`; the bucket is `slackdata-media-prod-<ACCOUNT>`.

**Two findings that make this request smaller than the plan assumed:**

1. **Transactions need no new permission.** IAM has no `TransactWriteItems` action of its own. A
   transaction is authorised against the `PutItem` / `UpdateItem` / `DeleteItem` / `GetItem` of
   each item inside it, plus `ConditionCheckItem` for pure checks
   ([AWS: Using IAM with DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)).
   The existing `SlackDataTables` statement already grants `PutItem` and `UpdateItem` on
   `slackdata-*`, so D28 works today. Repo docs that say "no `TransactWriteItems` is granted" (e.g.
   CLAUDE.md § The manufacturer API) describe a permission that does not exist.
2. **The deny on the changelog cannot stop an overwrite.** `PutItem` with an existing key replaces
   the record, and IAM has no condition key that can demand `attribute_not_exists`. So the deny
   blocks the mutation APIs (`UpdateItem`, `DeleteItem`, batch, PartiQL) and a future widening of
   the policy; our code makes every changelog write conditional; and the daily export is what
   would reveal an overwrite. The email says this plainly rather than promising more.

---

**Subject:** SlackData — live editing with ISA accounts: one role change and one app client

Hi,

SlackData is moving from "suggest a correction and wait for me to apply it" to editing on the site,
Wikipedia-style. People sign in with their **ISA account**, the same one used for SlackMap and
SportHub:

- **Anyone with an ISA account** changes the data directly — no suggestion or approval queue.
- **A per-account cap** (20 changes an hour, 100 a day) guards against a misused account;
  confirmed manufacturers are exempt on their own products.
- **Every change is recorded publicly and permanently**: who made it, when, what it changed, and
  how (the website, a manufacturer's API, an import).

The full design is in `LIVE_EDITING_PLAN.md` in the repo.

It will be built in phases over the coming months. I'm asking for everything now, so that no
phase stalls waiting on a request. Some of it won't be used until later; I've said when for each
item.

There are two parts:

- **A.** One change to the Lambda role (needs an AWS admin).
- **B.** An app client for SlackData in the ISA login pool (needs whoever looks after ISA accounts).

---

## A. The Lambda role

**Role:** `slackdata-prod-eu-central-1-lambdaRole`
**Inline policy:** `slackdata-prod-lambda`, replacing the whole policy with the JSON below.
**Trust policy:** unchanged.

**What changes, in short:** one statement added, one deny added, one unused statement removed.
Everything else is copied untouched from the current policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:CreateLogGroup",
        "logs:TagResource"
      ],
      "Resource": [
        "arn:aws:logs:eu-central-1:<ACCOUNT>:log-group:/aws/lambda/slackdata-prod*:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:eu-central-1:<ACCOUNT>:log-group:/aws/lambda/slackdata-prod*:*:*"
      ]
    },
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
        "arn:aws:dynamodb:eu-central-1:<ACCOUNT>:table/slackdata-*",
        "arn:aws:dynamodb:eu-central-1:<ACCOUNT>:table/slackdata-*/index/*"
      ]
    },
    {
      "Sid": "ChangelogIsAppendOnly",
      "Effect": "Deny",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:PartiQLUpdate",
        "dynamodb:PartiQLDelete"
      ],
      "Resource": "arn:aws:dynamodb:eu-central-1:<ACCOUNT>:table/slackdata-changelog-prod"
    },
    {
      "Sid": "SlackDataUploads",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::slackdata-uploads-prod-<ACCOUNT>/*"
    },
    {
      "Sid": "SlackDataMedia",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::slackdata-media-prod-<ACCOUNT>/*"
    }
  ]
}
```

### What each change is for

1. **Added — `ChangelogIsAppendOnly` (deny):** the API can add entries to the change log but can
   never edit or delete one, which protects the record of who changed what. Needed from the first
   phase.
2. **Added — `SlackDataMedia`:** lets the API publish uploaded photos and manuals to a new public
   media bucket (no delete). Needed from the fourth phase.
3. **Removed — `SlackDataEmail`:** the email permission from August was never used, and the new
   system sends no email (ISA accounts handle that), so it can go.

The existing table permission already covers the three new tables (all named `slackdata-*`) and
writing an edit together with its log entry, so nothing else is needed. No Cognito, SES, VPC or
delete permissions are asked for.

---

## B. A SlackData app client in `isa-users`

I'd like SlackData to sign in through `isa-users` the same way SlackMap does, with its own app client
in `eu-central-1_iGaYGKeyJ` and your hosted UI.

- **Client:** public (no secret), authorization code + PKCE, scopes `openid email`. It reads
  `name`, `family_name`, `email` and `email_verified`.
- **Callbacks:** `https://slackdata.org`, `https://www.slackdata.org`, `http://localhost:5173`.
- **Nothing is written to the pool** or to the `isa-users` table. Roles live in SlackData's own
  table, as in SportHub, and the Lambda only verifies the ID token.

Two questions:

1. Should I create the client from SlackData's CloudFormation (it would only ever touch that one
   client), or would you rather create it yourselves, as you did SlackMap's?
2. Is there anything from SlackMap's setup I should match, such as which user id apps key on, token
   lifetimes or the hosted UI branding?

Needed for the first phase.

---

**Cost:** an estimated few dollars a month at most: DynamoDB on demand, a little S3 storage, and
CloudFront traffic.

**Safety:** anyone signed in can change a product's specs, including breaking strength (MBS).
Every MBS change appears in a public safety feed. On ISA-certified gear, the certificate's own
tested values stay displayed next to the specs, and only admins can change certification or
warning data.

Happy to go through any of it, or to split the request if you'd rather grant parts later.

Thanks,
Emile
