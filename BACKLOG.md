# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## Backend / data

- [ ] **Auto-sync ISA certification (every 24h).** Build a scheduled job that fetches the
  official ISA-approved gear list from
  <https://data.slacklineinternational.org/safety/isa-approved-gear/> once per day and
  reconciles it against the DB, setting `isa_certified` (top-level bool on webbing / leashring /
  grip / starterkit / tricklinekit; `specifications["ISA approved"]` string `"true"` on weblock;
  `isa_approved` on roller). Match on brand + model. Report/queue items on the ISA list that have
  no matching row so the catalog can be filled in (as of last manual sync these were unmatched:
  BC Wafer 2.0, BC Wafer XL, BC Loop, BC Threaded Highline Leash, Cong Gear Path,
  Slack Inov Zenlock, SlackX Orange, Slacktivity HighlineLeash).

- [ ] **Add `available` (gear) status field.** Introduce a nullable boolean to track whether an
  item is still purchasable:
  - **`available` on every gear type** — add to all 8 gear models: `Webbing`, `Weblock`, `Roller`,
    `LeashRing`, `Grip`, `TreePro`, `StarterKit`, `TricklineKit` (base classes so it flows to
    `Public`/`Create`/`Update`).

  Rules & rollout:
  1. **The field is nullable (`bool | None`) and initializes to `null` for every existing row.**
     "Unknown" is the default state; values get filled in manually (or via a future data pass)
     later.

  Touch points: the model changes above, the TypeScript types + `*Public` mirrors on the
  frontend, and (optionally) a new filter chip ("Available only") once the data is populated.
  No seed-JSON changes needed — the field starts `null`, so loaders can leave it unset.

  > Note: manufacturer lifecycle is already captured — `active` lives on each entry in
  > `manufacturers.json` (sourced from SlackDB's `isActive`; see `slackdb.md`).
