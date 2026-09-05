# Making the e2e suite fast

The Cypress job takes **~37 minutes**. This document says where that time actually goes (measured,
not guessed), what to change, in what order, and — the half that matters more — what would make the
suite faster while quietly making it worth less.

**Status:** Tier 1 (§1.1–1.3) is implemented — sharding, the prebuilt bundle, and the Cypress binary
cache. Tier 2 onward is still a plan. See **§5** for what landed, and for the trap §1.2 as originally
written would have walked straight into.

---

## 1. The measured baseline

From CI run [`33907778425`](https://github.com/International-Slackline-Association/SlackData/actions/runs/33907778425) (green, 21 specs — the
current branch adds `brand_filter` and `co_listings`, so today it is nearer 38 min):

| Job | Wall clock |
|-----|-----------|
| `pytest` | 1 m 09 s |
| `build + unit` | 0 m 30 s |
| **`cypress`** | **37 m 32 s** |

Inside the Cypress job:

| Phase | Time |
|-------|------|
| checkout + setup-python + setup-node | 9 s |
| Install (`pip install -e.[dev]` + `npm ci`) | 29 s |
| Start the API (boot + seed 498 items) | 4 s |
| Start the frontend (`vite`) | 1 s |
| Cypress binary verify (**not cached** — "first time using Cypress" every run) | 20 s |
| **Spec execution** | **35 m 29 s** |

So setup is ~1 minute and irrelevant. **All of the time is in the specs**, and it is spread evenly:
**1,922 tests at ~1.11 s each.** There is no single pathological test to delete — there are 1,922
ordinary ones, nearly all of which begin with a full page load.

### Per-spec durations (the baseline to measure against)

| Spec | Time | Tests | s/test |
|------|-----:|------:|-------:|
| `filters.cy.ts` | 6:16 | 383 | 0.98 |
| `search_sort.cy.ts` | 5:34 | 306 | 1.09 |
| `gear_cards.cy.ts` | 5:12 | 300 | 1.04 |
| `gear_listing.cy.ts` | 3:43 | 202 | 1.10 |
| `gear_detail.cy.ts` | 3:08 | 243 | 0.77 |
| `isa_warnings.cy.ts` | 2:35 | 82 | 1.89 |
| `compare.cy.ts` | 1:28 | 33 | 2.67 |
| `currency.cy.ts` | 1:27 | 60 | 1.45 |
| `isa_certification.cy.ts` | 1:11 | 69 | 1.03 |
| `manufacturers.cy.ts` | 1:03 | 49 | 1.29 |
| `price_slider.cy.ts` | 1:00 | 42 | 1.43 |
| `mobile.cy.ts` | 0:34 | 39 | 0.87 |
| `admin_triage.cy.ts` | 0:27 | 15 | 1.80 |
| `submissions.cy.ts` | 0:24 | 21 | 1.14 |
| `url_state.cy.ts` | 0:22 | 18 | 1.22 |
| `navigation.cy.ts` | 0:18 | 14 | 1.29 |
| `range_slider.cy.ts` | 0:16 | 8 | 2.00 |
| `brand_links.cy.ts` | 0:10 | 7 | 1.43 |
| `gear_status.cy.ts` | 0:09 | 11 | 0.82 |
| `safety_notices.cy.ts` | 0:09 | 13 | 0.69 |
| `manufacturer_api_docs.cy.ts` | 0:03 | 7 | 0.43 |

**The top five specs are 24 m 33 s — 69 % of the run.** All five are `GEAR_TYPES.forEach`-wrapped.

### What a single `cy.visit` costs

Measured against the running dev servers on this machine:

**The frontend is the bottleneck, and it is Vite dev mode.** One page load of `/webbings` pulls:

```
107 JS modules, 6.6 MB      — of which 97 are /src/** served `Cache-Control: no-cache`
                              (only the 8 pre-bundled deps are `max-age=31536000,immutable`)
```

A production build of the same app is **two hashed files** — `index-*.js` 414 KB + `index-*.css`
39 KB — plus a lazy `AdminRoute` chunk that a listing page never touches.

So every one of roughly 1,900 page loads makes **~97 revalidating round trips that a real deployment
makes zero of**. Across the suite that is on the order of **180,000 avoidable HTTP requests**, in a
dependency-ordered waterfall the browser cannot fully parallelise.

**The backend is not the bottleneck.** A full 100-item page is 28–37 ms (`/webbing` 33 ms,
`/weblock` 37 ms, `/starterkit` 28 ms), `/isawarning` 21 ms, `/fx/rates` 4 ms. Also note:
`SQL_ECHO` already defaults to **false** in `slack_data/database.py` — CLAUDE.md's claim that the
engine is created with `echo=True` is stale, and the 656 log lines in the "Start the API" step are
the loaders' own output, not SQL.

### What is already right (do not undo it)

- **Zero `cy.wait(<number>)` in the entire suite.** Verified. This is why it is reliable.
- **Video is off**, screenshots are failure-only.
- Electron headless — bundled, so no browser-install step.
- `defaultCommandTimeout: 5000` and `scrollBehavior: 'center'`, both with reasons written down in
  `cypress.config.ts`.

---

## 2. The changes, in the order they should be made

Ordered deliberately: the risk-free wall-clock wins come **first**, so the feedback loop is already
short before anyone starts restructuring tests. Doing the refactors first means doing them with a
37-minute verify cycle.

### Tier 1 — no test file changes at all

#### 1.1 Shard the Cypress job across a matrix ★ biggest win, lowest risk

21–23 specs run serially in one runner. Split them across N runners with `--spec`.

A 6-way split, greedily packed by the measured durations above:

| Shard | Specs | Est. |
|-------|-------|-----:|
| 1 | `filters` | 6:16 |
| 2 | `search_sort`, `navigation`, `brand_links` | 6:02 |
| 3 | `gear_cards`, `mobile`, `gear_status`, `manufacturer_api_docs` | 5:58 |
| 4 | `gear_detail`, `isa_warnings`, `safety_notices` | 5:52 |
| 5 | `gear_listing`, `compare`, `submissions`, `range_slider` | 5:51 |
| 6 | `currency`, `isa_certification`, `manufacturers`, `price_slider`, `admin_triage`, `url_state`, `brand_filter`, `co_listings` | 6:05 |

**37 min → ~7.5 min wall** (6:16 + ~1:15 setup). Each shard boots its own API and frontend, so
`admin_triage`'s scratch submissions store stays per-shard and isolated — arguably better than today.

Notes:
- **`filters.cy.ts` alone is the floor.** Past 6 shards there is no further gain until §2.4 shrinks
  it. That is the argument for doing the matrix-collapse work, not an argument against sharding.
- Keep the split as a **checked-in list** (a JSON/YAML manifest, or the matrix inline in
  `ci.yml`) rather than an auto-balancer, so the balance is reviewable and a new spec has an obvious
  home. Re-pack it when the per-spec table shifts.
- Cost: N × ~75 s of setup, so ~7.5 min of extra billed compute to save ~30 min of wall clock.

#### 1.2 Serve the production build instead of `vite dev` ★ biggest per-test win

Replace `npm run dev` in the e2e job with `vite build` + a static server on 5173. This deletes 96 of
the 97 uncacheable module requests per page load.

- **Reuse the `dist/` the `frontend` job already built** via `upload-artifact` / `download-artifact`.
  It saves the duplicate build *and* means e2e exercises exactly the bundle `tsc -b` type-checked.
- Build with `--sourcemap` so a failure stack still names a real file and line.
- `vite preview` serves the SPA history fallback correctly — verified: `GET /webbings/1` → 200
  `text/html`. Pass `--port 5173 --strictPort` so `baseUrl` needs no change.
- **Caveat worth knowing:** `vite preview` sends `Cache-Control: no-cache` even on hashed assets, so
  the bundle is revalidated (a cheap 304) on each visit. One conditional request instead of 97 is
  still the whole win; a tiny static server with `immutable` on `/assets/*` would shave the last one.
- **`VITE_API_URL` is read at module scope** in `src/api/client.ts`, so it is baked at *build* time,
  not run time. The default is already `http://localhost:8000`, which is what CI uses — but anyone
  pointing e2e elsewhere must set it before `vite build`, not before the server starts.

Expected: a meaningful cut to the ~1.1 s/test floor. Treat the exact figure as unmeasured until a
branch run confirms it — local Cypress on this machine is too unreliable to benchmark with (see the
Electron note in §3).

#### 1.3 Cache the Cypress binary

The log says *"It looks like this is your first time using Cypress: 15.18.0"* on every run. Cache
`~/.cache/Cypress` keyed on the Cypress version. ~20 s — negligible today, ×6 once sharded.

#### 1.4 Memory settings on the long specs — measure, then keep or drop

`filters.cy.ts` runs 383 tests in one browser. `numTestsKeptInMemory: 0` and
`experimentalMemoryManagement: true` are the standard levers for tail-slowdown on long specs. Both
are cheap to try and easy to revert. **Do not assume they help** — compare the spec's own duration
across runs before keeping them.

### Tier 2 — restructure tests, coverage identical

#### 2.1 Delete the double page load

225 `cy.visit` calls sit inside `it()` bodies, and many of them are in describes whose `beforeEach`
**already visited a different page**. `gear_detail.cy.ts` is the clearest case:

```ts
beforeEach(() => { cy.visit(`/${slug}/${item.id}`) })          // ← loaded, then thrown away
...
it('shows the "Weight" spec row when the field is non-null', () => {
  cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
    const withField = body.find(i => i[field] != null)
    cy.visit(`/${slug}/${withField.id}`)                        // ← the load that counts
```

Fix: split each such describe so the self-navigating tests live in a sibling block with no visiting
`beforeEach`. **No assertion changes at all.** Worst offenders by in-body visit count: `currency`
(52), `gear_detail` (25), `isa_warnings` (19), `url_state` (18), `price_slider` (16),
`safety_notices` (13), `isa_certification` (13).

#### 2.2 Hoist the repeated catalogue fetches

`gear_detail.cy.ts` makes 21 `cy.request(.../?limit=100)` calls, one per optional-field test, each
pulling up to 80 KB and each returning **the same page** — only to `.find()` a different field on it.
Fetch it once in `before()` per gear type and compute every "representative item" from that one
response. Same story in `filters` (20 `fetchAllItems`), `manufacturers` (19), `isa_warnings` (18),
`gear_cards` (15), `currency` (15).

Cypress aliases do not survive test isolation, but a spec-scoped `let` populated in `before()` does —
which is the pattern `gear_detail.cy.ts` already uses for `item`.

#### 2.3 `testIsolation: false` on read-only blocks ★ highest leverage, highest risk

Cypress 12+ supports per-describe `testIsolation: false`: the page is **not** reloaded between tests
in that block. One page load then serves N assertions instead of one.

Good candidates — blocks that only look at a rendered page:

- `filters.cy.ts`: *renders the filter sidebar* / *shows the "FIND YOUR [TYPE]" header* / *renders
  all expected filter groups* / *each group has a colored dot* / *each group has a collapse toggle*
  — five page loads for five assertions about one static render, ×8 gear types.
- `gear_detail.cy.ts`: the `alwaysPresent` spec-row and unit-suffix assertions.
- `gear_cards.cy.ts`: the card-anatomy presence assertions.

**The rules that keep this safe:**
1. Only for blocks where **no test clicks, types, navigates, or writes localStorage**.
2. The block does its one `cy.visit` in `before()`, explicitly.
3. Never for `currency`, `compare`, `url_state`, or any block touching filter state — display
   currency, the compare tray and URL filter state all persist and would leak between tests.
4. If a block later gains a mutating test, that test moves out — it does not get a `beforeEach`
   cleanup bolted on. Cleanup hooks that "reset" shared state are how this pattern rots.

#### 2.4 Collapse the gear-type matrix — carefully

`GEAR_TYPES.forEach` around a whole describe is *the* multiplier: 8 types × the same behaviour. But
the matrix is not pointless, so the cut has to be made along the right seam:

- **Config-shaped assertions genuinely differ per type** — which filter groups exist, which spec rows
  exist, which sort fields exist. This is where a `filterGroups.ts` / `gear_types.ts` typo lives.
  **Keep all 8** — but make each one *a single test on a single page load* asserting the whole set,
  instead of N tests each reloading.
- **Behaviour is one component doing one thing** — collapse/expand a group, toggle a pill, clamp a
  typed slider bound, clear-filters, the All/None shortcuts. Run these on **two representative
  types**: `webbings` (richest config: stretch, ISA, ranges) and `treepros` (sparsest — no ISA, no
  brand-heavy sidebar). Not eight.

Realistic effect: `filters.cy.ts` 383 → well under 150 tests, and it stops being the sharding floor.
Same seam applies to `search_sort`, `gear_cards`, `gear_listing`, `gear_detail`.

**Write down in the spec header why each block is per-type or single-type.** This repo already
comments in that style (see the `gear_types.ts` note on why stretch and classification are excluded
from the generic loop) and it is the only thing that stops a future gear type being added with no
coverage.

### Tier 3 — move work out of e2e entirely

#### 3.1 Cypress component tests — **no new dependency needed**

`cypress/react` ships inside the installed Cypress 15.18.0 (`node_modules/cypress/react`). Adding
component testing is a `component` block in `cypress.config.ts`
(`devServer: { framework: 'react', bundler: 'vite' }`), a component support file, and a
`cypress/component/tsconfig.json` — mirroring how `cypress/` and `frontend/tests/` already keep
themselves out of `tsc -b`.

Component specs still run in a browser, so they are not free — but they skip navigation, the module
waterfall, and the backend entirely, and they can run **inside the existing `frontend` job**, in
parallel with e2e.

Candidates, ranked by the e2e time they relieve:

| Component | Relieves | What moves | What must stay e2e |
|-----------|----------|------------|--------------------|
| `RangeSlider.tsx` | `range_slider` (0:16) + the 6-tests-per-range-group loop in `filters` | min/max inputs render, unit label, thumb drag, clamping an out-of-range typed value | "filtering by this range actually removes cards" |
| `GearCard.tsx` | `gear_cards` (5:12) | badge/brand/name/spec-row/tag/price render, Legacy badge, ISA badge | the card renders correctly from **real API rows** — one pass per gear type |
| `CurrencySelector.tsx` | `currency` (1:27) | auto-entry first, exactly-one-active, code in the closed selector | conversion applied across cards/detail/compare, persistence across reload |
| `StretchFilter.tsx` / `StretchChart.tsx` | the stretch block in `filters` (~30 tests) | pill rendering, top-5 selection, single-select behaviour | pill **counts** against the real webbing set |
| `SpecTable.tsx` | `gear_detail` (3:08) | unit suffixes, null-row omission, label text | one real-data pass per gear type — see the warning below |

#### 3.2 Push more into the `node:test` unit suite

211 tests, no framework, no servers, runs in seconds. Anything currently asserted **through the DOM
that is really arithmetic or config** belongs here: sort comparators, currency precision, and
especially **filter-group config completeness** — assert `filterGroupsFor(slug)` against the
model-derived list directly, rather than opening eight sidebars to discover the same fact.

`tests/test_frontend_contract.py` already does this from the Python side (it checks the suggestion
form only offers real field names). Extending that pattern is cheaper than any browser test.

---

## 3. Errors to avoid

These are the ways this work goes wrong. Most of them produce a faster suite that catches less, which
is worse than a slow one because nobody notices.

**Never add `cy.wait(<number>)`.** The suite has exactly zero fixed waits today. Sharding and a
prebuilt bundle both change timing, and the first new race will be tempting to paper over with a
sleep. That trades a 37-minute reliable suite for a 10-minute flaky one, and flake costs more time
than it saves. Wait on a condition, or fix the assertion.

**Do not raise `defaultCommandTimeout` to make a shard go green.** 5000 ms is deliberate and
documented. A shard that needs longer is a symptom to diagnose (a cold static server, a shard
running two heavy specs back to back), not a number to increase.

**Do not stub the backend to make tests fast.** The premise of this suite — stated in CLAUDE.md, in
PLAN.md and in the CI file's own header — is *no mocks, against both real servers*. The one
sanctioned stub is `/fx/rates` in `currency.cy.ts`, and only because exchange rates move daily; the
spec says so in a comment. Replacing real catalogue data with fixtures would make the suite fast and
hollow: it would stop catching seed drift, loader breakage and `Public`-schema changes, which are
precisely the failures this project actually has. And the backend is 30 ms per call — there is
nothing to win.

**Do not `testIsolation: false` a block that mutates anything.** Compare-tray contents, the display
currency in localStorage, URL filter state and active pills all persist. A leaked pill selection
makes a later test pass for the wrong reason — or fail in a way that sends someone hunting a bug that
isn't there. Re-read the four rules in §2.3 before applying it to a new block.

**Do not merge tests just to cut the count.** A single test carrying 40 assertions fails on the first
one and tells you nothing about the other 39. This suite's per-type test names
(`Filter sidebar — Weblocks › renders all expected filter groups`) are what make a red CI readable
without opening a screenshot. Merge only assertions that are facets of one fact.

**Do not shrink the matrix silently.** `filters` and `search_sort` cover eight gear types on purpose.
If a behavioural block drops to one or two representatives, the per-type *structural* check must
survive, and the reason must be in a comment — otherwise the ninth gear type gets added with zero
filter coverage and nothing says so.

**Do not shard alphabetically or by file count.** `filters` (6:16) and `manufacturer_api_docs` (0:03)
are 125× apart. A naive split leaves one runner at 12 minutes while five sit idle, and the job is
only as fast as its slowest shard.

**Do not let shards share a submissions store.** `admin_triage.cy.ts` works a queue — pending, oldest
first, one page of 50 — and two runners writing the same `SUBMISSIONS_DB_PATH` would be an entirely
new class of flake. Separate runners already give separate `/tmp`, but keep the scratch path
explicitly per-shard so it stays true if the job layout changes.

**Do not cache `dist/` across commits.** Serving a stale bundle produces a green e2e for code that is
not the code under test — the worst possible failure mode, because it looks like success. Build per
run (it takes 1.7 s) or hand it over as an artifact from the *same* run's `frontend` job.

**Do not drop the real-data pass when moving assertions into component tests.** CLAUDE.md's
frontend↔backend contract rule ("the canonical source is the Python model files") is *enforced* by
the tests that read live API rows. A `SpecTable` component test with a hand-written fixture will keep
passing forever after someone renames a model field. Every gear type keeps at least one e2e test that
renders a real API row.

**Do not switch browsers hoping Chrome is faster.** Electron is bundled; Chrome costs a browser
install on every shard. If it is tried, it is measured first.

**Do not judge a change on one CI run.** GitHub runners vary. Compare the **per-spec durations** from
the Cypress summary table across 2–3 runs against the baseline in §1 — not job wall clock, which also
moves with queueing and setup.

**Do not remove `needs: [backend, frontend]` to start e2e sooner.** It saves ~90 s and costs six
shards' worth of compute on every branch that fails `tsc`. If it is ever worth it, that is a
deliberate trade, not a cleanup.

**Local Cypress on the dev machine is not a benchmark.** Under VS Code / WSL the runner dies with
SIGILL / SIGTRAP (exit 132/133) intermittently even with `env -u ELECTRON_RUN_AS_NODE`, and produces
no output when stdout is redirected. Measure on CI. *(Superseded — see §5.6: the cause is
`DISPLAY=:0` and the fix is `xvfb-run -a`.)*

---

## 4. Expected outcome, and how to know

| Stage | Change | e2e wall clock |
|-------|--------|---------------:|
| — | today | **~37 min** |
| 1 | shard ×6 (§1.1) + binary cache (§1.3) | **~7.5 min** |
| 2 | production bundle (§1.2) | ~6 min |
| 3 | double-visit + hoisted fetches (§2.1, §2.2) | ~5.5 min |
| 4 | `testIsolation` + matrix collapse (§2.3, §2.4) | **~3–4 min** |
| 5 | component + unit migration (§3) | ~3 min, with less of it on the critical path |

Stage 1 is one file (`ci.yml`) and delivers ~80 % of the wall-clock win with **zero** risk to
coverage. Everything after it is optional and should be justified on its own.

Only two figures above are measured: the baseline (§1) and the 107-vs-2 module count. The rest are
estimates. Record the per-spec table after each stage and replace the estimates with real numbers.

---

## 5. What landed (Tier 1)

Implemented as described, with one correction and one addition the plan had not anticipated.

### 5.1 The trap §1.2 missed: a production build changes the app

The plan said "serve the production build". Doing that literally would have broken
`submissions.cy.ts` (21 tests) and `admin_triage.cy.ts` (15), and the repo already documents why —
in `frontend/.env.development`:

> locally there is no Turnstile site key and no Cognito pool, so SuggestButton renders the form
> anyway (`import.meta.env.PROD` is false) and AdminAuthProvider falls back to its sessionStorage
> token. That is what lets `submissions.cy.ts` and `admin_triage.cy.ts` run with no AWS account.

A `vite build` would have loaded `.env.production` (`VITE_API_URL=/api`, a real Cognito pool, a real
Turnstile key) **and** flipped `import.meta.env.PROD`, which gates two branches:

- `SuggestButton.tsx:40` — hides the suggestion form unless a captcha key is present.
- `AdminAuthProvider.tsx:148` — swaps `DevBridge` for the "sign-in is not configured" screen.

The fix is two flags, both required:

```
NODE_ENV=development vite build --mode development --sourcemap
```

`--mode development` picks the env file; `NODE_ENV=development` keeps `import.meta.env.PROD` false —
**`vite build` sets `NODE_ENV=production` regardless of `--mode`**, so the mode flag alone is not
enough. Verified on the built bundle: the PROD-gated branches are dead-code-eliminated, `API_BASE`
resolves to `localhost:8000`, and no Cognito authority or Turnstile key is inlined.

This also kills §1.2's suggestion to **reuse the `dist/` from the `frontend` job**: that job runs
`npm run build`, which is the production build — the one thing e2e must not serve. Reusing it would
have meant changing what the `frontend` job type-checks and builds, to suit the test job. So the e2e
job builds its own bundle instead (1.8 s), which also sidesteps the stale-artifact hazard §3 warns
about.

The cost is that React's development build gets bundled, so the file is larger (658 KB vs 414 KB).
That is the right trade and arguably the safer one: the suite was written against dev-mode React, so
StrictMode's double-invoked effects still behave as the tests expect. **The win was never bytes** —
it is 107 requests per page load becoming 1 (measured against `vite preview`).

### 5.2 The addition: a coverage guard on the shard split

Sharding introduces exactly one new way to lose coverage — a spec in `cypress/e2e/` that is in no
shard never runs, and CI stays green while doing it. Nothing about that failure is visible.

So the split lives in `frontend/cypress/shards.json` and `frontend/scripts/check-shards.mjs`
enforces that every spec on disk is in exactly one shard, following the `infra/check-routes.py`
pattern: one script, two callers — `npm run test:unit` (via `tests/unit/shards.test.ts`, so it fails
in seconds) and the CI shard-planning job, which also emits the job matrix from the same manifest so
the matrix and the guard cannot disagree. Both drift directions were negative-tested: a spec absent
from the manifest, and a manifest naming a spec that does not exist.

### 5.3 Also done

- **Cypress binary cached** (`~/.cache/Cypress`). The log said *"first time using Cypress"* on every
  run; ~20 s, now paid by all six shards if left uncached.
- **`fail-fast: false`** on the matrix — one shard failing must not cancel the other five.
- **Per-shard screenshot artifacts**, since `upload-artifact@v4` refuses a duplicate name.
- **`npm run build:e2e` / `serve:e2e` / `shards`**, so the load-bearing invocation lives in
  `package.json` rather than buried in YAML, and a developer can reproduce a shard locally.

### 5.4 Held back

**§1.4 (memory settings) was not applied.** The plan says to measure before keeping it, and there is
no measurement yet. It is a one-line experiment once the new baseline exists.

### 5.5 Measured locally

`npm run lint` exit 0, `npm run build` clean, `npm run test:unit` 214 pass / 0 fail.

The Cypress suite **was** run locally, once §5.6 was sorted out. A same-machine A/B on
`gear_status` + `safety_notices`:

| | Dev server | Prebuilt bundle |
|---|---|---|
| `gear_status.cy.ts` | 0:13 | **0:07** |
| `safety_notices.cy.ts` | 0:13 | **0:04** |
| **total** | **0:27** | **0:12** |

**2.25×** — well above the 20–35 % §1.2 estimated. Then, running the real CI shards against the
bundle: `filters` **383/383 pass** (5:09), `search` exit 0, `cards` exit 0.

**Still owed:** the `detail` shard (`gear_detail`, `isa_warnings`, `safety_notices`) returned exit 74,
but the working tree was switched out from under the run mid-shard (an external rebase/checkout to
`main`). In that same shard `gear_detail` passed 243/243, and `safety_notices` had passed 13/13 on
the identical bundle twenty minutes earlier — so the failure is very likely the tree change, not the
bundle. **Re-run it on a stable tree before believing either result.** `listing` and `money` never
ran.

One real trap found while measuring: serving the bundle on a port other than 5173/5174 fails 7 tests
with `0 items`, because `slack_data/main.py` allowlists only those two origins for CORS. Not a defect
— but the bundle swap is only safe on an allowlisted port.

### 5.6 Local Cypress: the actual cause, and the fix

§3's "local Cypress is not a benchmark" was wrong about the reason. Exit 133 with **no output at
all** is not an unstable Electron — it is `DISPLAY=:0`. WSLg sets it, so Cypress does not start its
own Xvfb; it tries to reach WSLg's X server, hangs, and the smoke test times out. In a headless
shell (agent session, ssh, no WSLg attached):

```bash
export LD_LIBRARY_PATH="$HOME/.local/lib/cypress-deps:$LD_LIBRARY_PATH"
unset ELECTRON_RUN_AS_NODE
xvfb-run -a npx cypress run --spec cypress/e2e/<spec>.cy.ts
```

`npx cypress verify` is the quick diagnostic — it reports the smoke test timing out rather than
failing silently. CI needs none of this: `ubuntu-latest` sets no `DISPLAY`, so Cypress starts Xvfb
itself. Now recorded in PLAN.md § Running things.
