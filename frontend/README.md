# SlackData Frontend

React + TypeScript + Vite. Built TDD against the Cypress E2E suite in `cypress/e2e/`, which runs
against the **real backend** on `localhost:8000` (start it first — see the root README).

- **Build status + phase roadmap:** [../PLAN.md](../PLAN.md)
- **Visual / UX + per-type spec:** [../DESIGN.md](../DESIGN.md)
- **Data schema (canonical):** `../slack_data/models/*.py`

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite (compile check)
npm run lint

# Cypress (see PLAN.md for the WSL env incantation this box needs)
npm run cypress:open
npm run cypress:run
```
