# Architecture

## Core Model

The project uses a three-piece architecture so it can scale without introducing framework or build complexity.

1. Runtime (`src/runtime/`): app bootstrap, environment hooks, startup lifecycle.
2. Engine (`src/engine/`): deterministic simulation logic, state transitions, balancing surfaces.
3. UI (`src/ui/`): input handling and rendering only.

## Current Structure

- `src/main.js`: static entrypoint loaded by `index.html`
- `src/runtime/startApp.js`: starts UI and engine, exposes debug handle
- `src/engine/gameEngine.js`: game state + all business rules and actions
- `src/ui/gameUI.js`: button bindings and panel rendering

## Layer Boundaries

- Runtime can import engine and UI.
- UI can import engine actions/state, but must not implement game rules.
- Engine must not access DOM APIs.

## Engine Requirements For Scale

- Keep simulation rules side-effect free except state mutation and log output.
- Keep balancing constants centralized near engine module top.
- Add seeded RNG next, so simulation balancing can be reproduced from a seed.
- Introduce save/load serialization boundaries before Milestone 2 world systems.
- Move large content lists (events, cohorts, items) into `src/content/` JSON modules.

## Deployment

This app is static and Vercel-friendly by default:

- No build command required.
- `index.html` loads `src/main.js` as an ES module.
- Deploy by connecting the repo in Vercel and using default static settings.
