# Tavern Sim Roadmap

## Vision

Build a management simulator with the depth cadence of Football Manager:

- Mostly simulation and decisions, with text-rich feedback
- Clear system interaction (economy, staff, guests, politics, events)
- Long-term strategic arcs where choices compound over many in-game weeks

## Design Pillars

- Information-dense UI over action gameplay
- Emergent stories from layered systems
- Meaningful uncertainty (scouting, rumors, hidden traits, market shifts)
- Long-form progression with setbacks and recoveries

## Current Slice (Implemented)

- Daily simulation with guest demand, revenue, expenses, and net
- Staff management (hire, fire, morale, wages, training)
- Production and supply chains for tavern goods
- Tavern quality systems (condition, cleanliness, reputation)
- Dynamic pricing and demand elasticity
- Random daily events affecting economics and brand

## Next Milestones

### Milestone 1: Simulation Depth

- [x] Add named patrons and cohorts with preferences and loyalty
- [x] Add shifts/rotas and staff fatigue, injuries, and disputes
- [x] Introduce ingredient quality tiers and spoilage windows
- [x] Add short reports: finance, operations, guest sentiment

Status: Completed on February 13, 2026 with the current browser playable slice.

### Milestone 2: World Layer

- Kingdom of Calvador world frame with starting-location profiles (Arcanum city and Meadowbrook village)
- District map with rival taverns and local power groups (Crown officials, councils, merchant houses, underworld actors)
- Event calendar (harvest fair, war levy, royal tax audits, caravan arrivals, civic festivals)
- Dynamic suppliers, contracts, and price volatility with location-based availability and travel logistics
- Reputation split by group (locals, merchants, nobles, adventurers) plus compliance standing with the Crown tax office

Milestone 2 implementation steps:

1. Finalize two playable opening profiles in the Kingdom of Calvador via `startingLocation`:
   - [x] Implementation complete
   - [x] Validation complete
   - Arcanum city: high demand, easy scaling, easy resupply, higher taxes, higher risk pressure, higher purchase prices.
   - Meadowbrook village: local-heavy demand, calmer event pressure, lower tax pressure, limited supply diversity, growth tied to marketing/logistics.
2. Implement district map data and traversal rules:
   - [x] Implementation complete
   - [x] Validation complete
   - district identities, travel links, and travel-time/cost implications for procurement and events.
   - rival tavern placement by district.
3. Implement world actors and influence model:
   - [x] Implementation complete
   - [x] Validation complete
   - Crown officials, councils, merchant houses, and underworld actors with standing/influence values and event hooks.
4. Add Calvador authority systems:
   - [x] Implementation complete
   - [x] Validation complete
   - Crown tax cadence, audit triggers, penalties, and recovery pathways.
   - Crown compliance history that persists over time.
5. Add location-aware event calendar:
   - [x] Implementation complete
   - [x] Validation complete
   - recurring and seasonal events (including harvest fairs, war levies, royal audits, caravan arrivals, civic festivals).
   - district/location-specific event pools and probabilities.
6. Implement supplier network + logistics economy:
   - [x] Implementation complete
   - [x] Validation complete
   - local market limits, contracts, volatility, caravan windows, merchant visit cadence, and city stock-up trips.
7. Implement rival tavern simulation effects:
   - [x] Implementation complete
   - [x] Validation complete
   - competition pressure on demand, pricing environment, and reputation narrative.
8. Implement world-layer reputation model:
   - [x] Implementation complete
   - [x] Validation complete
   - cohort reputation (locals/merchants/nobles/adventurers), Crown compliance standing, and major group standings.
9. Surface M2 systems in gameplay/reporting/persistence:
   - [x] Implementation complete
   - [x] Validation complete
   - stable state fields, daily/weekly report outputs, and save/load coverage for all M2 world data.
10. Lock M2 -> M3 handoff contract:
   - [x] Implementation complete
   - [x] Validation complete
   - M3 weekly planning consumes M2 outputs directly (location profile, taxes/compliance, event calendar outlook, supplier/logistics state, rival pressure, reputation standings) with no bridge sprint required.

Milestone 2 exit criteria:

- A new campaign start always asks for one of two opening locations and applies distinct early-game economics/events/supply constraints.
- District map, rival taverns, and local power groups are simulated entities, not flavor text only.
- Crown tax enforcement and compliance meaningfully affect finances and event outcomes.
- Supplier access and logistics choices materially change stock reliability, cost, and menu strategy.
- Reputation is split by cohort and governance context (Crown + local power groups).
- All required M2 data is visible in reports and persisted cleanly so Milestone 3 can begin immediately.

### Milestone 3: Manager Gameplay Loop

- Weekly planning phase and daily execution phase
- Recruitment market with traits, potential, and hidden personality
- Long-term objectives from Crown offices, noble houses, merchant interests, and investors
- Save/load campaign state with seasonal progression

### Milestone 4: Football Manager Style Tooling

- Inbox/message center with narrative reports and recommendations
- Staff responsibilities delegation (head chef, floor manager, clerk)
- Analytical dashboards: conversion, retention, margin by menu item
- Scouting and rumor systems for recruits, rivals, and events

## Suggested Technical Direction

- Keep core simulation in pure data modules (easy balancing + tests) [in progress via `src/engine/`]
- Keep rendering thin and event-driven [in progress via `src/ui/`]
- Add deterministic seeded simulation mode for debugging [implemented in `src/engine/random.js`]
- Add versioned save/load boundaries for persistent campaigns [implemented in `src/runtime/persistence.js` + engine snapshots]
- Add scenario fixtures for rapid balancing and regression tests [implemented via `src/engine/scenarioFixtures.js` + `scripts/regression/runScenarios.mjs`]
