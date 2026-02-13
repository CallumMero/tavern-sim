# Milestone 1 Tracker

## Scope

Milestone 1 goal from `docs/ROADMAP.md`:

- Named patrons and cohorts with preferences and loyalty
- Shifts/rotas with staff fatigue, injuries, and disputes
- Ingredient quality tiers and spoilage windows
- Short reports for finance, operations, and guest sentiment

## Status

- Milestone 1 state: Complete
- Completed date: February 13, 2026
- Current implementation branch merged target: `main`

## What Was Added

### Patrons And Cohorts

- Added a named patron pool with cohorts (`locals`, `adventurers`, `merchants`, `nobles`)
- Added product preferences and loyalty values per patron
- Added loyalty influence on daily demand
- Added patron highlight notes in reports

Files:

- `src/engine/gameEngine.js`

### Staff Rotas, Fatigue, Injuries, Disputes

- Added rota presets (`balanced`, `day_heavy`, `night_heavy`)
- Added daily shift assignment and shift-fit impact on demand/service capacity
- Added fatigue to each staff member and fatigue-driven performance penalties
- Added injury and dispute downtime states with return-to-work handling
- Added rota controls to UI

Files:

- `index.html`
- `src/engine/gameEngine.js`
- `styles.css`

### Ingredient Quality And Spoilage

- Added quality and freshness tracking for supply ingredients
- Added quality-tier purchasing feedback
- Added ingredient blend effects on craft output
- Added daily spoilage decay and spoilage losses
- Added kitchen blend score to reports

Files:

- `src/engine/gameEngine.js`

### Daily Reporting

- Expanded report panel to include finance, low stock, supply/spoilage, staffing, and sentiment
- Added satisfaction score and loyalty demand factor callouts

Files:

- `src/engine/gameEngine.js`
- `index.html`
- `styles.css`

## Validation

- Syntax check: `node --check src/engine/gameEngine.js`
- Manual playtest: open `index.html` and run multiple days while changing rota presets and supply purchases

## Notes For Milestone 2

- Keep new systems but split `src/engine/gameEngine.js` into smaller engine modules before adding district/faction layers
- Deterministic seeded runs and scenario fixtures are now in place for faster balancing
