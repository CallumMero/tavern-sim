# Tavern Sim

A text-first, UI-driven fantasy tavern simulator with a warm wooden tavern presentation.

## Run

Open `index.html` in your browser.

No build step is required.

## Architecture

The codebase is split into three layers:

- `src/runtime/` controls app startup and environment wiring
- `src/engine/` contains simulation state, deterministic RNG, and domain logic modules
- `src/ui/` owns DOM bindings and rendering (`gameUI.js` + `pixelRenderer.js`)

Entry point: `src/main.js`

Key runtime capabilities:

- Auto-load from browser storage on startup (if a save exists)
- Auto-save on each engine state change
- Debug console handle at `window.tavernSim`:
  - `save()`, `load()`, `newGame(seed)`
  - `scenarios()` to list named engine fixtures
  - `loadScenario(id, seed)` to start from a deterministic fixture

## Current Vertical Slice

- Daily simulation loop with finances, reputation, and guest demand
- Inventory production (brew/cook) and supply purchasing
- Staff hiring/training and payroll pressure
- Tavern condition/cleanliness systems
- Random events with immediate economic impact
- Named patron pool with cohort preferences and loyalty-driven demand pressure
- Rota presets with staff fatigue, injuries, and disputes
- Ingredient quality/freshness tracking with spoilage impact on production
- Daily report summaries for finance, operations, staffing, and guest sentiment
- Live pixel-art tavern scene synced to engine state (staff + guest crowd + day HUD)
- Wood-and-lantern themed management interface with event log and controls

## Next Target

See `docs/ROADMAP.md` for the plan to evolve this into a deep manager-style sim.

## Deterministic Regression Checks

Run scenario-based regressions from the repo root:

- `node scripts/regression/runScenarios.mjs`
- `node scripts/regression/runScenarios.mjs cash_crunch`
