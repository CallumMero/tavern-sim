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

## Next Work Items

- Split `src/engine/gameEngine.js` into domain modules:
  - `staffEngine.js`
  - `inventoryEngine.js`
  - `patronEngine.js`
  - `eventEngine.js`
  - `economyEngine.js`
- Add scenario fixtures and deterministic regression runs.
