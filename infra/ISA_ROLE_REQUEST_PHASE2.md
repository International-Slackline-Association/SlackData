# Request to the ISA — Lambda role permissions

**Sent, granted and applied on 2026-08-23; re-confirmed against the live role on 2026-08-24** —
the inline policy `slackdata-prod-lambda` matches the JSON below verbatim. Kept as the record of what
the role actually carries: this is the authoritative policy text, and
[LAMBDA_ROLE_PERMISSIONS.md](LAMBDA_ROLE_PERMISSIONS.md) is the reasoning behind each grant and what
is deliberately excluded. If the two ever disagree, the JSON below is what is real.

**Note what is absent: any `cognito-idp:*` action.** That is deliberate — the Lambda verifies both
admin and manufacturer tokens against the pool's *public* JWKS over ordinary HTTPS, which is not an
AWS API call. It is also why this policy has nothing to do with the `DEPLOY_MANUFACTURER_API` flag:
that gate is about `cognito-idp:CreateResourceServer` on the **deploying** identity, a different
principal that no role grant can supply. See
[LAMBDA_ROLE_PERMISSIONS.md](LAMBDA_ROLE_PERMISSIONS.md) § Deploy-time permissions.

Note the `table/slackdata-*` scope in `SlackDataTables`: it is what lets Phase 4's
`slackdata-brand-clients-prod` table work without a further request. Do not narrow it to the
submissions table alone.

> Account id redacted as `<ACCOUNT>`: this repo is public, and `infra/serverless.yml` builds ARNs
> from `${aws:accountId}` for the same reason. Substitute the real id before sending.

---

Hi,

I'm ready to deploy three things to SlackData, and the API's Lambda role needs a few permissions it
doesn't currently have. Rather than come back three times, here's all of it in one go:

1. **Suggest a correction** — a form where visitors can report a wrong spec or a missing product.
   Submissions are stored for me to review. *Needs: DynamoDB.*
2. ~~**Email alerts** — I get an email when a submission comes in, so I don't have to keep
   checking. *Needs: SES.*~~ **Dropped after this was applied.** We went with a forwarding alias on
   the ISA domain instead (the way `slackmap@slacklineinternational.org` works), so nothing needs
   SES. The grant below was applied and is harmless but unused — worth removing next time this
   policy is edited. See [README.md](README.md) § No email.
3. **A manufacturer API** (later) — an endpoint brands can call to keep their own gear data and
   product photos up to date, instead of me transcribing them. Their updates go into the same
   DynamoDB table for review; photos go to a new, private upload bucket that isn't part of the
   website. *Needs: S3 on that one bucket.*

None of this changes the catalogue itself — that's still a read-only file rebuilt from git on each
deploy; everything submitted, by a visitor or a brand, is reviewed before it goes in. Logins and
manufacturer API access both use Cognito, but the Lambda only verifies tokens against the public
endpoint rather than calling AWS, so there's no Cognito permission needed here.

**Role:** `slackdata-prod-eu-central-1-lambdaRole`
**Inline policy:** `slackdata-prod-lambda`

Trust policy unchanged. Your two existing `logs:` statements are copied below untouched — everything
else is appended.

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
      "Sid": "SlackDataEmail",
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "arn:aws:ses:eu-central-1:<ACCOUNT>:identity/slackdata.org",
      "Condition": {
        "StringLike": {
          "ses:FromAddress": "*@slackdata.org"
        }
      }
    },
    {
      "Sid": "SlackDataUploads",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::slackdata-uploads-prod-<ACCOUNT>/*"
    }
  ]
}
```

Two small things worth knowing: submissions can include an optional email address if someone wants a
reply (no IPs or user agents are stored), and they auto-delete after 12 months — happy to change that
number if you'd prefer a different one.

Let me know if you have any questions, or if you'd rather grant only features 1 and 2 for now and
leave the third until it's actually built.

Thanks,
Emile
