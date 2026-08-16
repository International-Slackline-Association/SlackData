# Currency Standardization & Price as a First-Class Spec — Plan

Goal (three parts):
1. **Auto-detect** the viewer's currency from their general location.
2. **Live-convert** every price in the site into that currency, with a manual override.
3. Make **price filterable and comparable**, not just sortable.

Spec-first, then tests, then code — DESIGN.md and the Cypress/pytest suites change *before* any
implementation lands. Nothing here has been implemented yet.

---

## 0. What's true today (verified against the code + the live DB, 2026-08-07)

| Fact | Where |
|---|---|
| All 8 gear types carry `price: float \| None` + `currency: Currency \| None` | `slack_data/models/*.py` |
| `Currency` is a 30-member ISO-4217 enum; **14** appear in the catalogue | `utilities/currencies.py` |
| **471 priced items**; every single one has a currency — **0 unconvertible rows** | DB query |
| Currencies in use: EUR (~60%), USD, CZK, PLN, CAD, ILS, BRL, CHF, ZAR, NZD, MXN, RUB, GBP, INR | DB query |
| Webbing `price` is **per meter** (JSON key `priceMeter`) — undocumented in the model, invisible in the UI | `load_webbings.py`, `webbings.json` |
| TreePro has `price_unit` = `single \| pair` — a per-item unit that varies *within* the type | `models/treepro.py` |
| Rollers' JSON key `price_unit` actually holds the **currency** (loader maps it to `currency`) — a naming trap | `load_rollers.py:54` |
| Price **is** sortable already (`UNIVERSAL_SORT_FIELDS`) — and today that sort is meaningless: it compares `5377 RUB` against `89 USD` numerically | `config/sortFields.ts:15` |
| Price is **not** filterable — no `price` group in any of the 8 `FILTER_GROUPS` entries | `config/filterGroups.ts` |
| Price is **not** in `SPEC_ROWS`, so it does **not** appear on the compare page at all | `config/specRows.ts`, `ComparePage.tsx:53` |
| Display is raw: `formatPrice` returns `"120 EUR"` | `utils/format.ts:23` |
| Filtering + sorting are **100% client-side** over the full fetched list | `utils/filter.ts`, `utils/sort.ts` |
| DESIGN.md already calls for a currency selector in the top nav — never built | `DESIGN.md:49` |
| Hosted mode is Lambda with a **read-only, immutable** SQLite (`CATALOG_DB_PATH`) — no runtime DB writes | `database.py:19-31` |
| `/api/*` CloudFront behaviour uses managed **CachingDisabled** + **AllViewerExceptHostHeader** | `infra/serverless.yml:117-125` |
| Frontend has **no unit-test runner** — Cypress is the only frontend suite | `frontend/package.json` |
| `httpx` already ships via `fastapi[standard]` — an HTTP call needs **no new dependency** | `pyproject.toml` |

**The headline finding:** the "price sort" that already exists in the UI is silently wrong across
mixed currencies. Normalizing prices fixes an existing bug, it isn't only new functionality.

---

## 1. Decisions

### D1 — Storage does not change. Conversion is a display layer.
Canonical price stays "as sold, in the seller's currency". **No model change, no migration, no
re-seed, no loader edit.** Rates move daily; a converted number written into the DB is wrong
tomorrow and destroys provenance ("this manufacturer charges €89" is a fact worth keeping).

### D2 — Rates come from our backend, not from the browser.
New router `GET /fx/rates` →
```json
{ "base": "EUR", "date": "2026-08-07", "source": "open.er-api.com",
  "stale": false, "rates": { "EUR": 1.0, "USD": 1.09, ... },
  "detected_currency": "USD" }
```
- **Provider: `open.er-api.com`** — free, no API key, daily updates, and it covers **RUB**, which
  the ECB-backed alternatives (frankfurter.app) dropped in 2022. We hold RUB-priced grips, so ECB
  is disqualified. Provider URL lives in `FX_RATES_URL` so it can be swapped without a code change.
- **Caching: module-level dict + TTL** (`FX_TTL_SECONDS`, default 12h). This is the only option
  that works under the read-only Lambda filesystem; it survives warm invocations, and a cold start
  pays one ~200ms fetch. Response also sets `Cache-Control: public, max-age=43200` for the browser.
- **Why not fetch third-party FX straight from the browser:** same-origin (no CORS/CSP surprises
  behind CloudFront), one shared cache instead of one per tab, an API key can be introduced later
  with zero frontend change, and Cypress gets exactly **one** endpoint to stub deterministically.
- **Never fails loudly.** Upstream error → serve a baked-in `FALLBACK_RATES` table with
  `stale: true`. The catalogue must render even when FX is down.

### D3 — Detection: browser locale first; CloudFront geo is an optional enhancement.
`Intl.DateTimeFormat().resolvedOptions()` (timeZone + locale region) → country → currency, via a
small map covering the high-traffic regions, defaulting to **USD**.

Why not `CloudFront-Viewer-Country` as the primary: it's more accurate, but it needs a **custom
OriginRequestPolicy** (the current managed `AllViewerExceptHostHeader` does not forward
`CloudFront-*` headers), and it yields nothing in local dev or Cypress. So it ships as an
enhancement: when the header is present, `/fx/rates` echoes `detected_currency` and the frontend
prefers it. That infra change is **out of scope for the first pass** and tracked separately.

**Precedence, always:** explicit user choice (localStorage) → `?cur=` URL param → detected → USD.

### D4 — Normalize to a base; filter and sort on the normalized value.
`base = price / rates[item.currency]` (EUR-based). Display = `base * rates[target]`.

Useful property worth testing: converting every item to *any* target is a single global scalar
multiply, so **price sort order is identical in every display currency**. Sorting only needs
normalization, never the target — which is why `?cur=` does not need to appear in every URL.

### D5 — Per-meter and per-pair stay visible.
- Webbing prices render with a `/m` suffix (`≈ $2.60 /m`), the filter/sort label reads **"Price per
  meter"**, and the model field gets a clarifying comment. Today a `2.4 EUR` webbing sits next to an
  `89 EUR` weblock with nothing to distinguish per-meter from absolute — that is actively misleading
  and gets worse once price is a headline filter.
- TreePro `price_unit` stays an appended qualifier (`≈ $45 per pair`). We **do not** silently halve
  pair prices — the pair is the product. The existing "Sold As" pill already lets users scope it.

### D6 — Converted prices are marked approximate, and the original is always reachable.
`≈ $96` on the card, with `€89` as small gray secondary text on the detail page and in the compare
cell. When display currency **equals** the item's own currency: no `≈`, no secondary line. This is
consistent with the project's existing data-accuracy posture and is non-negotiable for trust.

### D7 — Formatting via `Intl.NumberFormat(locale, { style: 'currency' })`.
2 decimals below 10 (per-meter webbing prices), 0 decimals at 100+, 2 otherwise.

### D8 — `?cur=` appears in the URL only when a price bound is set.
Currency is a viewer *preference* (localStorage), like the Cards|Detailed toggle that DESIGN.md
already keeps out of the URL. The one exception: a **price range filter** writes bounds in the
display currency, so the link must carry `?cur=` to stay meaningful when shared. Alternative
considered and rejected: storing bounds in the canonical base — the URL numbers would then not
match the numbers on screen, breaking the repo's `?{field}_min` mirrors-the-visible-value contract.

---

## 2. Step 1 — DESIGN.md (spec first, no code)

1. **New `## Currency & Prices` section** (after `## Color Palette`): the canonical-storage model,
   the precedence chain, the `≈` rule, per-meter / per-pair rules, `Intl` formatting rules, and the
   degraded-mode behaviour when rates fail (render as-sold, drop the `≈`, show a one-line notice).
2. **§Page Header / Top Nav** (line 49) — replace the currency-selector one-liner with a real spec:
   `data-cy="currency-selector"`, options `data-cy="currency-option"` + `data-currency="USD"`,
   an "Auto (detected)" first entry, the 14 catalogue currencies plus majors (**not** all 30 enum
   members — most have no data behind them).
3. **§Left Filter Sidebar** — add **Price** as a range slider to all 8 gear types; document that it
   is the one filter whose domain moves with the selected currency, and that switching currency
   **converts an active bound** rather than clearing it. Amend the "Excluded from filters" line
   (114): `currency` remains excluded as a *filter* because it is now the top-nav *selector*.
4. **§Sort options** (169) — Price sort runs on the normalized value; order is provably identical
   in every display currency; webbings sort per meter.
5. **§Gear Card Anatomy** (245) — the price line becomes `≈ $84` (+ `/m` on webbings).
6. **§Gear Detail Page** (282) — price header gains the "as sold" secondary line; the treepro
   `per pair` rule is preserved.
7. **§Spec rows per gear type** — add a **Price** row for every type, which is what makes price
   appear on the **compare** page (compare renders `SPEC_ROWS`).
8. **PLAN.md** — new roadmap row `| 11 | Currency & price | currency.cy.ts | ⬜ |` + a Phase 11
   section pointing here.

## 3. Step 2 — Tests, red-first

### Backend — new `tests/test_fx.py` (~12 tests)
- 200 shape: `base == "EUR"`, `rates["EUR"] == 1.0`, all 14 catalogue currencies present, all > 0,
  ISO `date`, `source`, `stale` bool.
- Cache holds: two calls inside the TTL hit upstream **once** (monkeypatched fetch counter).
- TTL expiry triggers a refetch.
- Upstream 500 / network raise → **200** with `FALLBACK_RATES` and `stale: true` (never a 5xx).
- Partial upstream table (e.g. missing INR) → gaps filled from the fallback.
- `Cache-Control` header present.
- `detected_currency` echoed from `CloudFront-Viewer-Country` when present, `null` otherwise.
- **Guard test:** walk every model that has a `price` field, collect the distinct currencies in the
  seeded DB, assert each is in `FALLBACK_RATES` — so adding gear in a 15th currency fails loudly
  instead of rendering unconverted.

### Frontend — new `cypress/e2e/currency.cy.ts` (~40 assertions)
Determinism rule: **every assertion on an exact converted number goes through a `cy.intercept` of
`/fx/rates` with a fixed table.** Live rates move daily. Only invariance/presence tests run unstubbed.

- Selector renders in the nav, lists the catalogue currencies, opens with the detected one active.
- Picking USD rewrites every visible card price; the selection **persists** across reload and across
  gear-type navigation.
- `≈` present when converted, absent when display currency == item currency.
- Detail page shows the as-sold secondary; absent when same currency.
- Webbing prices carry `/m`; treepro pair prices keep `per pair`.
- Price range filter present for all 8 types; slider domain matches the converted extremes; bounds
  filter correctly; bounds + `?cur=` round-trip through the URL; **switching currency with a bound
  active re-expresses the bound so the same items stay selected** (the sharp edge).
- **Price sort order is byte-identical under EUR and under USD** — cheap test, proves normalization.
- Compare page has a Price row honouring the selector; items with no price show `—`.
- Degraded mode: intercept `/fx/rates` → 500; the app still renders, prices show as-sold with no
  `≈`, and `[data-cy="fx-stale-notice"]` appears.

### Existing specs that must be amended (they break otherwise)
| Spec | Why |
|---|---|
| `search_sort.cy.ts:21` | price sort entry — point its expectations at the new normalized attribute |
| `gear_cards.cy.ts:63-88` | price shown/omitted still holds; text assertions gain `≈` |
| `gear_detail.cy.ts:50-78` | price + `price_unit` assertions |
| `filters.cy.ts` `FILTER_GROUPS` | add `price` to all 8 lists (this map mirrors `config/filterGroups.ts`) |
| `compare.cy.ts` | row-set expectations now include Price |

## 4. Step 3 — Backend implementation
- `slack_data/utilities/fx.py` — `FALLBACK_RATES` (dated EUR-based constant, all 14 + majors),
  `fetch_rates()`, `get_rates()` with the module cache + TTL. `httpx` (already a dependency).
- `slack_data/api/routers/fx_router.py` — `GET /fx/rates`, sets `Cache-Control`, reads
  `CloudFront-Viewer-Country`.
- Register in `main.py`.
- **Zero** model / loader / seed / DB-write changes — safe under `READ_ONLY`.

## 5. Step 4 — Frontend implementation
| File | Change |
|---|---|
| `api/fx.ts` | *new* — fetch rates + localStorage cache w/ TTL so a repeat visit doesn't block first paint |
| `utils/detectCurrency.ts` | *new* — locale/timezone → country → currency, default USD |
| `utils/money.ts` | *new* — `normalize` / `convert` / `formatMoney` |
| `context/CurrencyContext.tsx` | *new* — `{ display, setDisplay, rates, stale, convert, format }` |
| `components/layout/CurrencySelector.tsx` | *new* — nav dropdown |
| `components/layout/TopNav.tsx` | mount the selector |
| `types/enums.ts` | add `CATALOGUE_CURRENCIES` as const (keep `Currency = string`) |
| `utils/format.ts` | `formatPrice` takes rates + target |
| `config/filterGroups.ts` | price range group × 8 types |
| `config/specRows.ts` | price row (→ compare) |
| `config/sortFields.ts` | price sort points at the normalized field |
| `utils/filter.ts` / `utils/sort.ts` | read price through a normalizing accessor |
| `GearCard.tsx` / `GearDetailBody.tsx` / `ComparePage.tsx` | converted rendering |
| `hooks/useUrlState.ts` | `cur` get/set |

## 6. Step 5 — Verify
```bash
python -m pytest tests/ -q                    # 155 existing + ~12 new
cd frontend && npm run build && npm run lint  # tsc -b + vite + oxlint
npx cypress run --spec cypress/e2e/currency.cy.ts
# then the 5 amended specs, then the full suite
```

---

## 7. Risks & sharp edges

1. **`data-price` semantics.** The whole suite reads `data-{field}` attributes. Rather than
   redefining `data-price`, **keep `data-price` as the as-sold raw value and add
   `data-price-base`** (normalized) for sort/filter verification. Smaller blast radius: only
   `search_sort.cy.ts` re-points, everything else stays green.
2. **The price filter's domain moves with the currency** — every other range filter has a fixed
   domain. Must be specced explicitly (D8 + Step 1.3), or it will read as a bug.
3. **Cypress + live rates** — any exact-number assertion must be stubbed, or the suite fails
   whenever the ECB moves.
4. **Per-meter pooling** — if a future cross-type view ever pools prices, webbing (€/m) must not be
   mixed with absolute prices. Flagged in the spec now.
5. **Rate-provider availability** — mitigated by `FALLBACK_RATES` + `stale`, and a swappable
   `FX_RATES_URL`.
6. **A 15th currency appearing in the data** — caught by the backend guard test.
7. **Rollers' `price_unit` JSON key holding a currency** — leave the loader alone (it works), but
   note it in `CLAUDE.md`'s loader-trap list so nobody "fixes" it into the treepro meaning.

## 8. Size estimate
6 new files, ~14 modified. Backend ~150 LOC, frontend ~400 LOC, tests ~450 LOC, docs ~120 lines.
Steps 1–2 (spec + red tests) are roughly a third of the work and are independently reviewable.
