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
- Versioned save migration support for legacy payloads
- Debug console handle at `window.tavernSim`:
  - `save()`, `load()`, `locations()`, `districts()`, `actors()`, `crown()`, `suppliers()`, `rivals()`, `worldReputation()`, `worldLayer()`, `timeflow()`, `timeflowDiagnostics()`, `managerPhase()`, `managerLayer()`, `clock()`, `setSpeed(speed)`, `tickMinutes(minutes)`, `updatePlan(draft)`, `commitPlan()`, `shortlistCandidate(id)`, `scoutCandidate(id)`, `signCandidate(id)`, `fileCompliance()`, `settleArrears(amount)`, `signLocalContract()`, `signWholesaleContract()`, `runCityStockTrip(bundleScale)`, `travelOptions()`, `travel(destinationId)`, `newGame(seed, startingLocation)`
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
- Campaign openings for Arcanum and Meadowbrook with distinct demand/tax/event/supply profiles
- District map layer with travel routes, transit timing/cost, and rival tavern placement per district
- World actor influence model (Crown office, civic council, merchant houses, underworld network) with standing/influence hooks on events and economy
- Crown authority cadence system with scheduled collections, audit penalties, voluntary filing, arrears settlement, and persistent compliance history
- Calendar-driven event system with recurring core events (harvest fairs, war levies, royal tax audits, caravan arrivals, civic festivals) and district-specific weighted incident pools
- Supplier network layer with district market lot caps, volatility-based pricing, contract systems, merchant/caravan windows, and city stock-up logistics runs
- Rival tavern simulation with daily competition moves that shape demand pressure, pricing environment, and reputation narrative
- World-layer reputation model tracking cohort standings, major group standing surfaces, and Crown compliance standing over time
- World-layer reporting surface with stable daily summaries, rolling weekly ledger outputs, and a versioned M2->M3 handoff contract (`worldLayer()`) covering location, tax/compliance, event outlook, suppliers/logistics, rival pressure, and reputation standings
- Live simulation clock (`Pause`, `Play`, `Fast x2`, `Fast x4`) where 1 real second advances 1 in-game minute at Play speed
- Weekly manager loop with explicit planning pause at week rollover (new week opens in planning and waits for commit)
- Weekly recruitment market with shortlist/scout/sign lifecycle, hidden-trait uncertainty, churn, and competing-offer pressure
- Multi-week objective arcs (Crown/noble/merchant/investor), seasonal timeline progression, and a versioned M3->M4 handoff contract (`managerLayer()`)
- Hybrid timeflow hardening: deterministic live-vs-skip parity checks, speed invariance checks, and queue collision coverage
- Debug stabilization pass: boundary-resolution action locks, load/save idempotency, planning-phase restore fidelity, and retry-safe boundary guards

## Character Assets

- Sprite sources are loaded from the repo-local `assets/` directory.
- The canvas renderer maps those assets to staff roles, patron cohorts, and rotating cameo visitors.
- If an asset fails to load, the renderer falls back to procedural pixel characters so gameplay remains functional.

## Next Target

See `docs/ROADMAP.md` for the plan to evolve this into a deep manager-style sim.

## Deterministic Regression Checks

Run scenario-based regressions from the repo root:

- `node scripts/regression/runScenarios.mjs`
- `node scripts/regression/runScenarios.mjs cash_crunch`
