# Scaling Progress

## Objective

Track architectural scale-up work after Milestone 1 so changes can be reviewed later.

## 2026-02-13: Engine Determinism + Persistence

Completed:

- Added deterministic RNG controller with seed/state snapshot support.
- Moved simulation constants/content lists into `src/engine/config.js` to reduce engine coupling.
- Replaced direct `Math.random` usage in engine flows with controller-driven randomness.
- Added versioned game snapshot schema (`SAVE_SCHEMA_VERSION = 1`).
- Added engine save/load API (`saveGame`, `loadGame`) with template-based state normalization.
- Added runtime persistence adapter and startup restore flow.
- Added auto-save on engine state changes.
- Added debug controls through `window.tavernSim`:
  - `save()`
  - `load()`
  - `newGame(seed)`
  - `clearSave()`

Files:

- `src/engine/random.js`
- `src/engine/gameEngine.js`
- `src/runtime/persistence.js`
- `src/runtime/startApp.js`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`

Validation:

- `node --check` on all runtime/engine/ui modules.
- Headless smoke run: init, advance, save, seeded new game, reload snapshot.

## 2026-02-13: Engine Domain Split

Completed:

- Split engine domains out of `src/engine/gameEngine.js`:
  - `src/engine/staffEngine.js`
  - `src/engine/inventoryEngine.js`
  - `src/engine/patronEngine.js`
  - `src/engine/eventEngine.js`
  - `src/engine/economyEngine.js`
- Rewired `gameEngine.js` to act as the orchestration/action surface while delegating domain logic.
- Preserved runtime save/load + deterministic flow compatibility after split.
- Updated architecture docs to reflect the new domain layout.

Files:

- `src/engine/gameEngine.js`
- `src/engine/staffEngine.js`
- `src/engine/inventoryEngine.js`
- `src/engine/patronEngine.js`
- `src/engine/eventEngine.js`
- `src/engine/economyEngine.js`
- `docs/ARCHITECTURE.md`

Validation:

- `node --check` across all engine/runtime/ui modules.
- Headless smoke run: init, advance day, save snapshot, seeded new game, reload snapshot.

## Next Work Items

- Add scenario fixtures and deterministic regression runs.
- Move large static content payloads into dedicated `src/content/` modules.
