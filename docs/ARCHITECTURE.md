# Architecture

## Core Model

The project uses a three-piece architecture so it can scale without introducing framework or build complexity.

1. Runtime (`src/runtime/`): app bootstrap, environment hooks, startup lifecycle.
2. Engine (`src/engine/`): deterministic simulation logic, state transitions, balancing surfaces.
3. UI (`src/ui/`): input handling and rendering only.

## Current Structure

- `src/main.js`: static entrypoint loaded by `index.html`
- `src/runtime/startApp.js`: starts UI and engine, wires persistence, exposes debug handle
- `src/runtime/persistence.js`: storage adapter for versioned save snapshots
- `src/engine/gameEngine.js`: orchestration layer and action API
- `src/engine/random.js`: deterministic RNG controller (seeded or system mode)
- `src/engine/config.js`: tunable simulation constants and content lists
- `src/engine/scenarioFixtures.js`: deterministic fixture setups for balancing and regression
- `src/engine/staffEngine.js`: staffing, rotas, fatigue, injuries/disputes, staff stats
- `src/engine/inventoryEngine.js`: supply quality/freshness, spoilage, production quality context
- `src/engine/patronEngine.js`: patron generation, cohort loyalty, loyalty demand factor
- `src/engine/eventEngine.js`: daily random event generation and effects
- `src/engine/economyEngine.js`: pricing demand curve and inventory sale helpers
- `src/ui/gameUI.js`: button bindings and panel rendering
- `scripts/regression/runScenarios.mjs`: deterministic scenario regression runner

## Layer Boundaries

- Runtime can import engine and UI.
- UI can import engine actions/state, but must not implement game rules.
- Engine must not access DOM APIs.

## Engine Requirements For Scale

- Keep simulation rules side-effect free except state mutation and log output.
- Keep balancing constants centralized near engine module top.
- Seeded RNG support is now available for reproducible balancing.
- Save/load serialization boundaries now use a versioned snapshot schema (`SAVE_SCHEMA_VERSION`).
- Domain module split is now in place for staff, inventory, patrons, events, and economy.
- Scenario fixture catalog is now in place for repeatable balancing setups.
- Deterministic regression harness now validates fixture stability and core state invariants.
- Next split target: move large content lists (events, cohorts, items) into `src/content/` JSON modules.
- Next split target: wire regression harness into CI once package/tooling is introduced.

## Persistence Contract

- Storage key: `tavern-sim.save.v1`
- Snapshot envelope:
  - `version`: schema version integer
  - `savedAt`: ISO timestamp
  - `random`: RNG controller snapshot (`mode`, `seed`, `state`)
  - `state`: game state payload

## Deterministic Simulation

- RNG mode defaults to system randomness.
- New seeded runs are created through `startNewGame(seed)` (debug handle: `window.tavernSim.newGame(seed)`).
- Scenario starts can be loaded through `loadScenario(id, seed)` (debug handle: `window.tavernSim.loadScenario(id, seed)`).
- Save snapshots preserve RNG state so reloaded runs continue deterministically.

## Regression Workflow

- Run all deterministic fixtures:
  - `node scripts/regression/runScenarios.mjs`
- Run specific fixture(s):
  - `node scripts/regression/runScenarios.mjs cash_crunch burnout_edge`

## Deployment

This app is static and Vercel-friendly by default:

- No build command required.
- `index.html` loads `src/main.js` as an ES module.
- Deploy by connecting the repo in Vercel and using default static settings.
