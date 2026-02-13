# Tavern Sim

A text-first, UI-driven fantasy tavern simulator with retro styling.

## Run

Open `index.html` in your browser.

No build step is required.

## Architecture

The codebase is split into three layers:

- `src/runtime/` controls app startup and environment wiring
- `src/engine/` contains simulation state, deterministic RNG, and game logic
- `src/ui/` owns DOM bindings and rendering

Entry point: `src/main.js`

Key runtime capabilities:

- Auto-load from browser storage on startup (if a save exists)
- Auto-save on each engine state change
- Debug console handle at `window.tavernSim` (`save`, `load`, `newGame(seed)`)

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
- Retro interface with event log and management controls

## Next Target

See `docs/ROADMAP.md` for the plan to evolve this into a deep manager-style sim.
