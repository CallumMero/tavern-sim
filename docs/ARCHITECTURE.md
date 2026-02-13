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
- `src/engine/gameEngine.js`: game state + business rules + save/load boundaries
- `src/engine/random.js`: deterministic RNG controller (seeded or system mode)
- `src/engine/config.js`: tunable simulation constants and content lists
- `src/ui/gameUI.js`: button bindings and panel rendering

## Layer Boundaries

- Runtime can import engine and UI.
- UI can import engine actions/state, but must not implement game rules.
- Engine must not access DOM APIs.

## Engine Requirements For Scale

- Keep simulation rules side-effect free except state mutation and log output.
- Keep balancing constants centralized near engine module top.
- Seeded RNG support is now available for reproducible balancing.
- Save/load serialization boundaries now use a versioned snapshot schema (`SAVE_SCHEMA_VERSION`).
- Next split target: move large content lists (events, cohorts, items) into `src/content/` JSON modules.
- Next split target: break `gameEngine.js` into domain modules (`staff`, `inventory`, `patrons`, `events`, `economy`).

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
- Save snapshots preserve RNG state so reloaded runs continue deterministically.

## Deployment

This app is static and Vercel-friendly by default:

- No build command required.
- `index.html` loads `src/main.js` as an ES module.
- Deploy by connecting the repo in Vercel and using default static settings.
