# Live editing — Phase 1

Phase 1 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 13): sign-in through the ISA account,
the people store, admin grants, the change log for role events, the manufacturer credentials as API
keys, and SlackData's own Cognito pool gone.

**Done when:** admins work through ISA accounts only, and nothing of ours is left in Cognito but the
ISA-made client.

**Status (2026-10-13): built and tested locally, not deployed.** § 2 is the rollout, in order.

---

## 1. What was built

| Part | Where | Decisions |
|---|---|---|
| ISA sign-in: `verify_isa_token` (RS256, `aud` = our client, `token_use: id`) | [auth.py](slack_data/api/auth.py) | D61 |
| People store: one record per ISA account, roles, notice, bootstrap | [models/people.py](slack_data/models/people.py), [people/](slack_data/people/) | D8, D30 |
| Change log: append-only, conditional puts, role events | [models/changes.py](slack_data/models/changes.py), [changelog/](slack_data/changelog/) | D3, D28, D43 |
| A role change and its record in one DynamoDB transaction | [changelog/writer.py](slack_data/changelog/writer.py) | D28 |
| Routes: `GET /me`, `POST /me/notice`, `GET /admin/admins`, `POST /admin/roles`, public `GET /changes` | [people_router.py](slack_data/api/routers/people_router.py) | D3, D7 |
| First admins by **verified** ISA email (`ADMIN_BOOTSTRAP_EMAILS`), granted once, logged as `bootstrap` | [auth.py](slack_data/api/auth.py) `sync_person` | § 4.4 |
| Manufacturer API keys: `Bearer <client_id>:<secret>`, constant-time compare | [auth.py](slack_data/api/auth.py), [brand_clients.py](slack_data/models/brand_clients.py) | D63–D65 |
| Onboarding mints keys locally — no Cognito | [onboard.py](slack_data/manufacturers/onboard.py), [register.py](slack_data/manufacturers/register.py) | D63 |
| One-off import of the three existing secrets | [scripts/import_brand_keys_from_cognito.py](scripts/import_brand_keys_from_cognito.py) | D63 |
| Template: `PeopleTable`, `ChangelogTable` (named `slackdata-changelog-<stage>`, as the ISA's deny names it); every Cognito resource removed | [serverless.yml](infra/serverless.yml) | D43, D62 |
| Site-wide sign-in, loaded only on demand, returning to the bare origin | [frontend/src/auth/](frontend/src/auth/) | D41, D61 |
| First-sign-in notice — the ISA's condition for showing names | [SignInNotice.tsx](frontend/src/components/account/SignInNotice.tsx) | Phase 0 § 1 |
| Account menu; admins panel (list, grant by verified email, revoke) on `/admin` | [AccountMenu.tsx](frontend/src/components/account/AccountMenu.tsx), [AdminsPanel.tsx](frontend/src/components/account/AdminsPanel.tsx) | D7 |
| Brand docs: the key replaces the token request | [MANUFACTURER_API.md](MANUFACTURER_API.md), [ManufacturerApiPage.tsx](frontend/src/pages/ManufacturerApiPage.tsx) | D65 |

**Choices made while building, not in the plan:**

- **The sign-in entry point is `/admin` for now.** Anonymous visitors see no "Sign in" button: in
  this phase only admins have anything to do once signed in. Signed-in people get the account menu
  in the nav. The public button arrives with editing.
- **The notice informs; it does not gate.** It shows until acknowledged (`notice_seen_at`), and the
  API does not refuse someone who has not pressed the button.
- **Granting admin by email counts only a verified address**, because isa-users confirms accounts
  before their email is verified. Granting by ISA id works whatever the email.
- **The last admin cannot be revoked** (409): there is no second way in (D9).
- **Manufacturer dev tokens hosted are 401, not 503.** With keys there is no "no pool configured"
  state on that path; a dev token hosted is simply a key that matches nothing.

---

## 2. Rollout — in this order

Each step needs the step before. **Steps 1 and 3 are irreversible in practice**: until step 1 has
run, the old pool is the only place the brands' secrets exist.

1. **Copy the brands' secrets out of the old pool.** Dry run first, then apply, against the hosted
   table:

   ```bash
   export AWS_PROFILE=isa-slackdata
   BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod \
     python scripts/import_brand_keys_from_cognito.py --user-pool-id eu-central-1_Fzl6ssZOQ
   BRAND_CLIENTS_TABLE=slackdata-brand-clients-prod \
     python scripts/import_brand_keys_from_cognito.py --user-pool-id eu-central-1_Fzl6ssZOQ --apply
   ```

   It reads the active rows of [onboarded-brands.md](infra/onboarded-brands.md) (Balance Community,
   Raed, Petram) and prints no secret. The old API keeps working throughout: it ignores the new
   field.

2. **Deploy half A**, with the first admins' verified ISA emails in the shell (never in the repo):

   ```bash
   export ADMIN_BOOTSTRAP_EMAILS='…,…'
   cd infra && ./preflight.sh && npx serverless deploy --stage prod
   ```

   This creates `slackdata-people-prod` and `slackdata-changelog-prod`, switches the API to ISA
   sign-in and API keys, and **removes the Cognito resources from the stack**. The pool itself is
   `DeletionPolicy: Retain`, so it is orphaned, not deleted; its domain, app client, group and
   resource server *are* deleted. **From this moment a brand's old token request fails** — tell the
   three brands before, or straight after (step 5).

3. **Then half B**: `./sync-env.sh prod`, build, sync, invalidate (DEPLOY.md). `sync-env.sh` writes
   `VITE_ISA_AUTHORITY` and `VITE_ISA_CLIENT_ID` from the stack outputs; `.env.production` already
   holds the same values.

4. **Check it.** `./verify-deploy.sh` (expects `/api/me` 401, `/api/changes` 200 JSON). Then sign in
   at `https://slackdata.org/admin` with a bootstrap address: the notice appears once, the queue
   loads, and `https://slackdata.org/api/changes` shows the `bootstrap` grant. Check one brand key:

   ```bash
   curl -H 'Authorization: Bearer <client_id>:<secret>' https://slackdata.org/api/manufacturer/me
   ```

   (the secret is in `~/.slackdata/credentials/` for Raed and Petram; Balance Community's file is
   not there).

5. **Tell the three brands** their key is unchanged and only how they send it changed — point them
   at <https://slackdata.org/for-manufacturers#key>. Worth knowing first whether any of them has
   ever called the API (D65).

6. **Delete the old pool**, once step 4 passes. `preflight.sh` warns about it until you do:

   ```bash
   aws cognito-idp describe-user-pool --user-pool-id eu-central-1_Fzl6ssZOQ \
     --query 'UserPool.Domain'          # delete that domain first, if one is left
   aws cognito-idp delete-user-pool --user-pool-id eu-central-1_Fzl6ssZOQ
   ```

   After that the only thing of SlackData's in Cognito is the `slackdata` client the ISA made.

---

## 3. Testing

- **pytest:** `tests/test_auth.py` (the ISA verifier, bootstrap, profile sync), `tests/test_people.py`
  (the routes), `tests/test_manufacturer_api.py` (keys), `tests/test_dynamo_stores.py` (both new
  tables built from the template, and the transaction), `tests/test_live_api.py` (real servers).
- **Cypress:** `account.cy.ts` (notice, menu, admins panel), `admin_triage.cy.ts` (updated). CI's
  API now starts with scratch `PEOPLE_DB_PATH` / `CHANGELOG_DB_PATH`, like the other stores.
- **Signing in locally with a real ISA account** works — `http://localhost:5173` is a registered
  callback. See the comment in [frontend/.env.development](frontend/.env.development).
