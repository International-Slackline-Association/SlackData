# Onboarded brands

The audit trail for every manufacturer credential ever minted. One row per app client, appended
when the client is created — **before** the credential is handed over, not after.

Why a file and not a table: minting a credential decides whose products a token can change, and the
`slackdata-brand-clients` record holds only the mapping, not the reason for it. If a credential is
ever disputed — "who authorised this, and on what evidence?" — this is the whole answer. It is also
where a deletion request can actually be honoured, which is why we deliberately do **not** store the
contact address in DynamoDB (`infra/README.md` § What we store about a brand contact).

**Rows are appended by `register.py --onboard`**, not by hand — a ledger you have to remember to
write is complete right up until the day it matters. Edit a row by hand only to change its Status
when a credential is revoked. Do not record secrets here: the client id is public-ish, the client
secret is written to a 0600 file under `~/.slackdata/credentials/` and never stored by us at all.

| Date | Brand (exactly as in `manufacturers.json`) | Client id | Confirmed via | Approved by | Status |
|------|--------------------------------------------|-----------|---------------|-------------|--------|
| 2026-08-28 | Balance Community | 27tbg5ks6fqcbiprj4su2n40lp | Know the owner personally, verified through messenger and email | 83649802-e031-70c9-2c2c-1b9d384dabfa | active |
| 2026-09-02 | Raed Slacklines | 4rf6f6a1gpl9sopvgj5acouuls | replied to shop@raed-sports.com (manufacturers.json) and Facebook DM @raedslacklines (linked from raed-slacklines.com) | ebragard | active |

**Confirmed via** — the channel the out-of-band challenge went to, e.g. `contact_email
info@brand.com (manufacturers.json)`, `contact form brand.com/contact`, `Instagram DM @brand`. Not
"they emailed us": that is the claim, not the confirmation.

**Status** — `active`, or `revoked YYYY-MM-DD (reason)`. Revoking is
`python -m slack_data.manufacturers.register --client-id '<id>' --deactivate`; edit the row, never
delete it.
