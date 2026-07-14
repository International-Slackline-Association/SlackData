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
