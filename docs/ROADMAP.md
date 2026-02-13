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

- District map with rival taverns and local factions
- Event calendar (harvest fair, war levy, guild votes)
- Dynamic suppliers, contracts, and price volatility
- Reputation split by group (locals, merchants, nobles, adventurers)

### Milestone 3: Manager Gameplay Loop

- Weekly planning phase and daily execution phase
- Recruitment market with traits, potential, and hidden personality
- Long-term objectives from guilds and investors
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
- Add scenario fixtures for rapid balancing and regression tests
