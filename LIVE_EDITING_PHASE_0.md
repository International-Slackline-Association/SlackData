# Live editing — Phase 0

Phase 0 of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) (§ 13): everything asked of the ISA, and
the one code change that has to land before anything else moves. The plan holds the reasoning;
this file is the checklist.

**Done when:** every row of § 1 is settled, and `_hosted()` no longer depends on the baked
catalogue, with its test.

**Status (2026-10-13): done**, except the export repo's final home (§ 1, row 5), which phase 2
needs and phase 0 does not. Phase 1 is in [LIVE_EDITING_PHASE_1.md](LIVE_EDITING_PHASE_1.md).

---

## 1. The ISA asks (§ 12)

Checked on 2026-10-13 against the live role and the `isa-users` pool, read-only.

| # | Ask | Status |
|---|---|---|
| 1 | SlackData's app client in `isa-users` | **Done** 2026-10-12, created by the ISA: `slackdata`, `2snjdh8i6md0m5n6h9te1hlor1`, callbacks on the bare origins only (D61) |
| 2 | Privacy sign-off | **Agreed**, on condition that people are told **when they first sign in**, not on their first edit. That moves the notice into phase 1's sign-in flow (§ 15 of the plan still says first edit — to update) |
| 3 | The named admins | **Have their emails.** Decided 2026-10-13: the bootstrap allowlist matches **verified ISA email** (`ADMIN_BOOTSTRAP_EMAILS`, from the deployer's shell), not `sub` — built in phase 1 |
| 4 | Deny on the change-log table | **Done.** `ChangelogIsAppendOnly` denies `UpdateItem`, `DeleteItem`, `BatchWriteItem`, `PartiQLUpdate`, `PartiQLDelete` on `table/slackdata-changelog-prod` — exactly as asked |
| 5 | A repo for the daily export | **Created on the operator's own account for now:** [emilebragard/slackdata-data](https://github.com/emilebragard/slackdata-data), to be transferred to the ISA org later (GitHub's transfer keeps history and redirects the old URL). Whether it later lands as its own repo or inside the ISA's existing [slackline-data](https://github.com/International-Slackline-Association/slackline-data) is UNDECIDED. Not used until phase 2 |
| 6 | `s3:PutObject` on the media bucket | **Done.** `SlackDataMedia` on `slackdata-media-prod-<ACCOUNT>/*` |
| 7 | Remove the unused `ses:*` grant | **Done.** `SlackDataEmail` is gone |

Not an ask, but decided in the same round (§ 1, sixth round): our own Cognito pool goes entirely
in phase 1 (D62), manufacturer credentials become API keys in our own table (D63–D65).

---

## 2. Re-base `_hosted()` (§ 11)

**The problem.** [auth.py](slack_data/api/auth.py) decides "am I running hosted?" with
`_hosted()`, which returns `database.READ_ONLY`, which is `bool(CATALOG_DB_PATH)`. Two auth
branches depend on it:

- `require_admin` — no pool configured **and** hosted → 503, never the dev token.
- `require_manufacturer` — the same, for `MANUFACTURER_DEV_TOKEN`.

Today that is safe only because [Dockerfile.lambda](Dockerfile.lambda) always sets
`CATALOG_DB_PATH`. Phase 2 stops baking the catalogue into the image, so that variable goes — and
from that deploy on, **`ADMIN_DEV_TOKEN` and `MANUFACTURER_DEV_TOKEN`, both in this public repo,
are accepted in production**. Phase 1 makes it worse in the meantime, because deleting our pool
unsets `COGNITO_USER_POOL_ID`, the other half of the guard.

**The change.** `_hosted()` answers from a signal the hosted deploy always has, independent of
how the catalogue is stored. `READ_ONLY` keeps its own meaning (the catalogue cannot be written)
and stops doubling as "hosted".

Which signal — **decided 2026-10-13: (c), both** — built as `slack_data/deployment.py`
`is_hosted()`, which also keeps `READ_ONLY` as a third signal while the catalogue is still baked:

| Option | For | Against |
|---|---|---|
| **a. `AWS_LAMBDA_FUNCTION_NAME`** — set by the Lambda runtime itself | Cannot be forgotten in config: every Lambda has it, nothing in our template sets it | Also true of any other Lambda this code is ever run in, including a future staging one — which is the safe direction to be wrong in |
| **b. An explicit `SLACKDATA_DEPLOYMENT=hosted`**, set in `serverless.yml` and the Dockerfile | Says what it means; easy to set in tests | One more variable a refactor of the template can drop — the exact failure being fixed |
| **c. Both: hosted if either is set** | Removing one does not open the hole | Two things to understand instead of one |

It fails closed whichever one goes missing.

**What has to change with it:**

- [auth.py](slack_data/api/auth.py) — `_hosted()`, and the module docstring's table and the
  paragraph about why the dev token is safe in the repo.
- [tests/test_auth.py](tests/test_auth.py) — `test_hosted_without_a_pool_rejects_even_the_dev_token`
  patches `database.READ_ONLY`; it should set the new signal instead. Add:
  - hosted signal set, `CATALOG_DB_PATH` **unset**, no pool → both dev tokens rejected (the case
    phase 2 creates);
  - `CATALOG_DB_PATH` alone → still hosted (`READ_ONLY` is kept as a third signal);
  - `test_hosted_lockout_is_unreachable_in_a_real_deploy` checks the image/template sets the new
    signal, not `CATALOG_DB_PATH`.
- [tests/test_live_api.py](tests/test_live_api.py) — the `hosted` and `hosted_with_pool` servers
  get the new signal in their env, and gain a third: hosted with no `CATALOG_DB_PATH`.
- [infra/serverless.yml](infra/serverless.yml) / [Dockerfile.lambda](Dockerfile.lambda) — set the
  variable, if option (b) or (c).
- CLAUDE.md § The manufacturer API, last paragraph ("That middle row is why the dev token is safe
  …"), which names `CATALOG_DB_PATH` as the reason.

No ISA involvement, no AWS change, no frontend change.

---

## 3. Housekeeping on the plan

Small edits [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md) needs because of § 1:

- § 6.6: the export repo is `emilebragard/slackdata-data`, moving to the ISA later.
- § 12: a status column, or a line saying all seven are settled (2026-10-13).
- § 15: the privacy notice is shown at first sign-in, not first edit.
- § 4.4: how the named admins are bootstrapped, once decided.
