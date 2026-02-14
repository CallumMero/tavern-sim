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

## 2026-02-13: Scenario Fixtures + Regression Harness

Completed:

- Added deterministic scenario fixture catalog in `src/engine/scenarioFixtures.js`:
  - `baseline`
  - `cash_crunch`
  - `festival_surge`
  - `burnout_edge`
  - `spoilage_alert`
- Added engine scenario APIs:
  - `listScenarios()`
  - `loadScenario(scenarioId, seedLike)`
- Added runtime debug controls through `window.tavernSim`:
  - `scenarios()`
  - `loadScenario(id, seed)`
- Added deterministic regression runner:
  - `scripts/regression/runScenarios.mjs`
  - Runs all fixtures with fixed seeds.
  - Validates state invariants.
  - Verifies deterministic replay (same fixture + seed => same signature).

Files:

- `src/engine/scenarioFixtures.js`
- `src/engine/gameEngine.js`
- `src/runtime/startApp.js`
- `scripts/regression/runScenarios.mjs`

Validation:

- `node --check src/engine/scenarioFixtures.js`
- `node --check src/engine/gameEngine.js`
- `node --check src/runtime/startApp.js`
- `node --check scripts/regression/runScenarios.mjs`
- `node scripts/regression/runScenarios.mjs` (5/5 scenarios passed)

## 2026-02-14: Pixel Visual Layer Scaffold

Completed:

- Added a browser-native canvas renderer (`src/ui/pixelRenderer.js`) with no build dependency.
- Added a live pixel scene panel to `index.html` and responsive styling in `styles.css`.
- Wired the renderer into the UI change cycle so every simulation action updates visuals.
- Added animated staff and patron sprite rendering based on deterministic hashes of entity IDs.
- Added scene HUD and event-highlight message box backed by engine state.

Files:

- `src/ui/pixelRenderer.js`
- `src/ui/gameUI.js`
- `index.html`
- `styles.css`
- `README.md`
- `docs/ARCHITECTURE.md`

Validation:

- `node --check src/ui/pixelRenderer.js`
- `node --check src/ui/gameUI.js`
- `node --check src/runtime/startApp.js`

## 2026-02-14: Tavern Art-Direction Pass (Wood/Amber Theme)

Completed:

- Reworked global UI styling to emphasize a wooden fantasy tavern mood:
  - warm amber lighting
  - dark wood paneling
  - brass/iron accents
  - parchment-like data surfaces
- Retuned canvas scene palette and backdrop composition to match the same art direction.
- Added lantern glow treatment and warmer HUD styling in the pixel renderer.
- Kept gameplay controls/flows unchanged while raising visual cohesion.

Files:

- `styles.css`
- `src/ui/pixelRenderer.js`
- `README.md`

Validation:

- `node --check src/ui/pixelRenderer.js`
- `node --check src/ui/gameUI.js`
- `node scripts/regression/runScenarios.mjs` (5/5 scenarios passed)

## Next Work Items

- Move large static content payloads into dedicated `src/content/` modules.
- Add CI-style command wrappers once a package manifest is introduced.
