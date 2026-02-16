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

- [x] A new campaign start always asks for one of two opening locations and applies distinct early-game economics/events/supply constraints.
- [x] District map, rival taverns, and local power groups are simulated entities, not flavor text only.
- [x] Crown tax enforcement and compliance meaningfully affect finances and event outcomes.
- [x] Supplier access and logistics choices materially change stock reliability, cost, and menu strategy.
- [x] Reputation is split by cohort and governance context (Crown + local power groups).
- [x] All required M2 data is visible in reports and persisted cleanly so Milestone 3 can begin immediately.

### Milestone 3: Manager Gameplay Loop

- Weekly planning phase and daily execution phase
- Recruitment market with traits, potential, and hidden personality
- Long-term objectives from Crown offices, noble houses, merchant interests, and investors
- Save/load campaign state with seasonal progression

Milestone 3 implementation steps:

1. Implement weekly phase flow and state boundaries:
   - [x] Implementation complete
   - [x] Validation complete
   - explicit `planning` -> `execution` -> `week_close` phases with deterministic transitions.
   - planning locks/commit rules so changes only apply at intended times.
   - phase invariant guards and recovery behavior for invalid transitions (no phase drift under load/save/resume paths).
2. Build weekly planning board surfaces:
   - [x] Implementation complete
   - [x] Validation complete
   - planning controls for staffing intent, pricing intent, procurement intent, marketing intent, and district/logistics intent.
   - clear summary panel of committed plan before week execution begins.
   - budget/risk envelope checks at commit time so impossible plans are blocked with actionable feedback.
3. Consume M2 world-layer handoff contract directly in weekly planning:
   - [x] Implementation complete
   - [x] Validation complete
   - planning input uses location profile, taxes/compliance, event outlook, supplier/logistics state, rival pressure, and reputation standings from `worldLayer()`.
   - no duplicate bridge state between M2 systems and M3 planners.
4. Implement staffing planner + execution policy:
   - [x] Implementation complete
   - [x] Validation complete
   - role coverage targets, fatigue-risk controls, training/rest priorities, and shortage contingencies.
   - day-level shift assignment references weekly plan with controlled variance.
5. Implement supply/menu operations planner:
   - [x] Implementation complete
   - [x] Validation complete
   - weekly stock targets by product chain, budget caps, reorder triggers, and fallback substitutions.
   - plan reacts to forecast volatility, caravan windows, and contract states.
6. Implement recruitment market generation and lifecycle:
   - [x] Implementation complete
   - [x] Validation complete
   - weekly candidate pool with role fit, visible traits, hidden personality flags, potential range, and wage expectations.
   - shortlist/interview/hire flow with uncertainty and scouting-quality effects.
   - candidate churn/expiry and competing-offer pressure so waiting has meaningful opportunity cost.
7. Implement objective generation and tracking:
   - [x] Implementation complete
   - [x] Validation complete
   - medium/long arcs from Crown offices, noble houses, merchant interests, and investors.
   - objective timers, success/failure states, and reward/penalty payloads.
8. Integrate objectives into weekly and daily outcomes:
   - [x] Implementation complete
   - [x] Validation complete
   - plan and execution decisions move objective progress each day/week.
   - objective outcomes feed finances, reputation surfaces, actor standings, and compliance pressure.
9. Implement seasonal timeline progression:
   - [x] Implementation complete
   - [x] Validation complete
   - week indexing, season rollover effects, and objective/recruitment refresh cadence.
   - timeline cues surfaced in reports and planning screens.
   - seasonal modifiers propagate into event outlook and weekly planning assumptions.
10. Extend persistence boundaries for M3 systems:
    - [x] Implementation complete
    - [x] Validation complete
    - save/load coverage for phase state, weekly plans, recruitment market, objectives, and seasonal timeline.
    - backwards-safe loading for older snapshots where possible.
11. Add M3 reporting, diagnostics, and regression fixtures:
    - [x] Implementation complete
    - [x] Validation complete
    - daily/weekly report lines for planning adherence, recruitment pipeline, objective progress, and seasonal status.
    - debug surfaces/API expose current phase, committed plan payload, objective timeline, and recruitment uncertainty state.
    - scenario regressions verify determinism and cohesion between M2 world state and M3 manager loop.
12. Lock M3 -> M4 handoff contract:
    - [x] Implementation complete
    - [x] Validation complete
    - M4 managerial UI surfaces (delegation, analytics, scouting, and command-board style updates) consume stable M3 outputs directly (weekly plans, staffing decisions, recruitment intel, objective timeline) with no bridge sprint required.

Milestone 3 exit criteria:

- [x] A campaign week always begins in planning mode, commits a plan, and executes day-by-day without phase drift.
- [x] Recruitment market supports uncertain talent discovery (visible vs hidden info) and meaningful hiring tradeoffs.
- [x] Multi-week objectives from Crown/noble/merchant/investor lines are active, trackable, and consequential.
- [x] Seasonal progression updates weekly systems (events, objectives, recruitment cadence) coherently.
- [x] Save/load fully restores M3 phase state and all manager-loop entities without corruption.
- [x] Reports and debug surfaces expose enough information to start Milestone 4 without additional integration work.

### Milestone 3.5: Hybrid Timeflow (Planning + Live + Skip)

- Keep strategic planning depth while running a live simulation clock
- Support time controls: `Pause`, `Play`, `Fast x2`, `Fast x4`
- Keep a manual `Skip To Next Day` option for fast-forward management play
- Ensure live progression and skip progression are deterministic/cohesive under the same inputs

Milestone 3.5 implementation steps:

1. Specify the Hybrid Timeflow contract and precedence rules:
   - [x] Implementation complete
   - [x] Validation complete
   - define canonical units (`minute`, `day`, `week`) and exact boundary order: minute tick -> day close -> week close -> reporting publish.
   - define source-of-truth ownership (`clock`, `manager phase`, `day resolver`) so no dual authority exists.
   - define conflict precedence when multiple triggers occur on same tick (manual skip, midnight rollover, week boundary).
2. Implement the simulation clock core as a deterministic state machine:
   - [x] Implementation complete
   - [x] Validation complete
   - support `Pause`, `Play`, `Fast x2`, `Fast x4` as explicit enumerated modes.
   - enforce one simulation ticker authority and prevent duplicate timer loops.
   - guarantee that speed affects only time progression rate, not probability rolls or event weighting.
3. Create a single canonical day-resolution pipeline:
   - [x] Implementation complete
   - [x] Validation complete
   - centralize daily execution into one resolver entry point (economy, staffing, events, suppliers, objectives, reports).
   - remove any alternate branch that can bypass subsystem ordering.
   - define idempotency guard so the same day cannot resolve twice.
4. Bind `Skip To Next Day` to the canonical resolver:
   - [x] Implementation complete
   - [x] Validation complete
   - skip action must advance to next day boundary through the exact same resolver and ordering as live midnight rollover.
   - ensure skip while paused/running has deterministic and documented behavior.
   - lock input during skip execution to avoid partial-state edits mid-resolution.
5. Define planning effect timing windows:
   - [x] Implementation complete
   - [x] Validation complete
   - classify each planning field as `instant`, `next_day`, or `next_week`.
   - publish a timing matrix in code/docs so players know when each change applies.
   - reject or queue edits that violate timing constraints for current boundary state.
6. Implement queued intent application with boundary metadata:
   - [x] Implementation complete
   - [x] Validation complete
   - add intent queue entries with `created_at`, `effective_boundary`, `priority`, and `source`.
   - resolve queued intents deterministically at boundary start before simulation effects.
   - log applied/expired/rejected intents for replay/debug visibility.
7. Add exploit protection and cadence gating:
   - [x] Implementation complete
   - [x] Validation complete
   - enforce cooldowns/locks on high-impact actions (marketing bursts, festival chaining, contract flipping, repeated travel toggles).
   - prevent action spam inside a single in-game minute or during boundary resolution.
   - ensure gating is symmetric in live mode and skip mode.
8. Harden weekly rollover in continuous live flow:
   - [x] Implementation complete
   - [x] Validation complete
   - carry a safe default plan into new week while preserving planning agency.
   - ensure recruitment refresh, objective refresh, and seasonal hooks fire exactly once per week boundary.
   - prevent week-close phase drift when crossing midnight at different speed settings.
9. Build hybrid UX surfaces and wording clarity:
   - [x] Implementation complete
   - [x] Validation complete
   - label controls clearly (`Pause`, `Play`, `Fast x2`, `Fast x4`, `Skip To Next Day`).
   - show current clock state, active speed, pending intents, and next application boundary.
   - display planning timing hints directly in planning controls (instant/next day/next week).
10. Add deterministic parity and speed-invariance tests:
    - [x] Implementation complete
    - [x] Validation complete
    - live-vs-skip parity tests for identical seed + inputs over N-day windows.
    - speed parity tests (`Play` vs `x2` vs `x4`) verifying identical day-close outputs.
    - include edge tests around midnight, week rollover, and queued-intent collisions.
11. Extend persistence and migration boundaries:
    - [x] Implementation complete
    - [x] Validation complete
    - persist clock state, speed mode, queue contents, boundary locks, and last-resolved boundary markers.
    - add migration path for older saves missing hybrid timeflow fields.
    - validate resume behavior mid-day, mid-week, and immediately before boundary transitions.
12. Add timeflow observability, diagnostics, and recovery guards:
    - [x] Implementation complete
    - [x] Validation complete
    - expose debug APIs for clock snapshot, queue snapshot, last boundary trace, and parity status.
    - add report lines for recent boundary applications and any guard-triggered recoveries.
    - define safe fallback behavior when invalid transition/duplicate resolution is detected.

Milestone 3.5 exit criteria:

- [x] Planning remains meaningful and cannot be bypassed by live-speed or skip exploits.
- [x] `Pause`, `Play`, `Fast x2`, and `Fast x4` are stable and do not desync daily/weekly systems.
- [x] `Skip To Next Day` resolves through the same logic path as live rollover and remains deterministic.
- [x] Mid-day edits apply exactly at documented boundaries with no hidden timing surprises.
- [x] Save/load restores hybrid timeflow state cleanly (clock, queued intents, week/day boundary context).
- [x] Reports/debug surfaces make timeflow behavior auditable before Milestone 4.

### Debug: Stabilization Backlog

- [x] Legacy guild terminology still appears in gameplay config/visual text (`guild_inspector` keys and "guild quarter" wording) and conflicts with the Crown-based Calvador world model.
- [x] Save/load phase fidelity issue: `loadGame()` currently forces live execution readiness, which can override a deliberately saved planning-phase state.
- [x] Save/load idempotency issue: loading a snapshot mutates state/log output (extra log entry and live-resume side effects) instead of restoring a clean exact snapshot.
- [x] Timeflow retry issue: duplicate-boundary guard uses `lastBoundaryKey` in a way that can block same-minute retries after a failed boundary attempt.
- [x] Weekly loop planning-window issue: week close currently force-transitions back to execution with carried plan, leaving no explicit planning pause window at week start.
- [x] UI location-state mismatch: campaign setup selector syncs to `startingLocation` rather than current `activeLocation`, so the UI can show stale location context after travel.
- [x] Boundary input lock coverage is partial: several gameplay actions are not hard-blocked at UI/engine level during boundary resolution windows.
- [x] Save migration gap: loader hard-fails on non-current schema versions instead of routing through explicit versioned migrations.
- [x] Documentation drift: `README.md` still contains machine-specific asset path text and no longer-matching world terminology.
- [x] Regression gap: no dedicated automated check currently asserts all of the above (especially load exactness, boundary retry behavior, and full action-lock coverage).

### Milestone 4: Football Manager Style Tooling

- Message board command center with narrative reports and recommendations
- Staff responsibilities delegation (head chef, floor manager, clerk)
- Analytical dashboards: conversion, retention, margin by menu item
- Scouting and rumor systems for recruits, rivals, and events

Milestone 4 implementation steps:

1. Define M4 command-board data contract and navigation states:
   - [x] Implementation complete
   - [x] Validation complete
   - define canonical sections (`message_board`, `delegation`, `analytics`, `scouting`) and routing rules.
   - formalize message payload schema (source, urgency, category, recommendation, expiry, linked actions).
2. Implement message board generation pipeline:
   - [x] Implementation complete
   - [x] Validation complete
   - create daily/weekly message producers from world, manager, finance, staffing, suppliers, rivals, and objectives.
   - include severity ranking and queue ordering so high-risk items surface first.
3. Build message board UI surface:
   - [x] Implementation complete
   - [x] Validation complete
   - render message list with category filters, urgency indicators, read/unread state, and expandable detail.
   - include fast actions from message context (jump to relevant panel/command where applicable).
4. Add recommendation engine for operator guidance:
   - [x] Implementation complete
   - [x] Validation complete
   - attach recommendations to key message types (compliance risk, supply strain, staffing fatigue, rivalry pressure).
   - include confidence/impact hints and expected tradeoff notes.
5. Implement delegation responsibility model:
   - [x] Implementation complete
   - [x] Validation complete
   - define responsibility matrix for head chef, floor manager, and clerk (plus player override boundaries).
   - configure which subsystems can be delegated (procurement, rota tuning, pricing guardrails, routine filings).
6. Implement delegated decision execution + audit trail:
   - [x] Implementation complete
   - [x] Validation complete
   - delegated agents execute bounded actions at valid timeflow windows only.
   - every delegated action writes reason/context/result into an auditable log trail.
7. Build analytics metric engine:
   - [x] Implementation complete
   - [x] Validation complete
   - compute conversion, retention, cohort contribution, margin by menu item, and trend deltas over time windows.
   - include data quality guards for sparse/edge cases (low volume days, missing cohorts, startup periods).
8. Build analytics dashboard UI:
   - [x] Implementation complete
   - [x] Validation complete
   - add manager-facing dashboard panels/cards for core KPIs, trends, and anomaly highlights.
   - provide comparisons (today vs rolling week, week vs prior week, location/district context).
9. Implement scouting intel model:
   - [x] Implementation complete
   - [x] Validation complete
   - support scouting targets across recruits, rivals, and world events with confidence and uncertainty.
   - introduce intel freshness and scouting quality effects on detail depth.
10. Implement rumor lifecycle and resolution:
    - [x] Implementation complete
    - [x] Validation complete
    - rumors can be true/false/partial, decay over time, and resolve into confirmed outcomes.
    - resolved rumors update reputation/standing narratives and downstream recommendations.
11. Extend persistence, reporting, and regression coverage for M4:
    - [x] Implementation complete
    - [x] Validation complete
    - persist message board state, delegation settings, analytics snapshots, and scouting/rumor entities.
    - add regression checks for deterministic behavior and contract validity after save/load.
12. Lock M4 -> post-M4 handoff contract:
    - [x] Implementation complete
    - [x] Validation complete
    - expose stable outputs so later milestones consume M4 systems directly (messages, delegated outcomes, analytics, intel timelines).
    - ensure no bridge sprint is required between M4 completion and next roadmap layer.

Milestone 4 exit criteria:

- [x] Message board is a usable manager command center with narrative updates, urgency ordering, and actionable recommendations.
- [x] Delegation system runs bounded autonomous routines with transparent override controls and auditability.
- [x] Analytics dashboards provide reliable conversion/retention/margin insights and trend context for decisions.
- [x] Scouting and rumor systems produce uncertain but useful intel that resolves over time into tangible outcomes.
- [x] M4 systems persist/load cleanly and remain deterministic under regression scenarios.
- [x] M4 outputs are stable and directly consumable by the next milestone with no integration bridge work.

### Milestone 5: Main Menu + Front-Door Experience

- Main menu appears before entering the management UI
- Main menu presents `Play` and `Settings` as the first actions
- `Play` opens an opening-location selection screen (Arcanum / Meadowbrook) before campaign boot
- Centered pixel-art logo treatment for "Tavern Simulator" with a dark wooden fantasy-medieval tavern mood
- Clean state transitions between menu screens and in-game UI without desyncing campaign state

Milestone 5 implementation steps:

1. Define app shell routing/state for front-door screens:
   - [x] Implementation complete
   - [x] Validation complete
   - add explicit UI states (`main_menu`, `settings_menu`, `new_campaign_location_select`, `in_game`).
   - ensure game systems do not auto-start rendering in-game controls while in menu states.
2. Build base main menu layout container:
   - [x] Implementation complete
   - [x] Validation complete
   - dedicated full-screen menu layer with centered branding area and primary action buttons.
   - menu-first boot path on initial load (and after returning from game session if desired).
3. Implement Tavern Simulator logo treatment:
   - [x] Implementation complete
   - [x] Validation complete
   - add pixel-styled "Tavern Simulator" logo lockup centered on main menu.
   - apply dark-wood/fantasy tavern visual language (wood grain framing, warm lantern accents, readable contrast).
4. Implement main menu primary actions:
   - [x] Implementation complete
   - [x] Validation complete
   - `Play` routes to location-selection screen.
   - `Settings` routes to settings screen.
   - include `Back`/`Return` routing behavior where needed.
5. Build opening-location selection screen:
   - [x] Implementation complete
   - [x] Validation complete
   - present Arcanum and Meadowbrook as clear selectable cards/options with concise tradeoff summaries.
   - optional seed input shown here (or preserved cleanly from previous campaign flow).
6. Bind campaign start flow from menu selection:
   - [x] Implementation complete
   - [x] Validation complete
   - selecting location + confirming start must call `startNewGame(...)` with chosen location.
   - on success, transition from menu state to `in_game` and reveal existing game UI.
7. Build settings screen (Milestone-5 scope):
   - [x] Implementation complete
   - [x] Validation complete
   - include foundational settings only (audio placeholder, UI scale/text size placeholder, and simulation defaults if applicable).
   - settings persist between sessions and safely hydrate on app start.
8. Add menu/in-game visual transition behavior:
   - [x] Implementation complete
   - [x] Validation complete
   - smooth but lightweight transition (fade/slide) between menu and game.
   - prevent double-trigger clicks during transitions.
9. Ensure menu flow works with save/load expectations:
   - [x] Implementation complete
   - [x] Validation complete
   - define deterministic behavior when an existing save is present (e.g., Continue entry or Play -> New Campaign confirmation).
   - avoid accidental save overwrite without explicit user confirmation.
10. Add keyboard/controller-friendly navigation baseline:
   - [x] Implementation complete
   - [x] Validation complete
   - menu focus order, Enter/Space activation, Escape back behavior.
   - basic accessibility semantics for menu controls and labels.
11. Add regression/QA coverage for menu flow:
   - [x] Implementation complete
   - [x] Validation complete
   - tests/checks for state routing (`main_menu` -> `play` -> `location_select` -> `in_game`) and settings persistence.
   - smoke checks that menu introduction does not break existing simulation regressions.
12. Lock M5 -> next milestone UI handoff:
   - [x] Implementation complete
   - [x] Validation complete
   - expose stable hooks for future polish (animated backgrounds, richer settings, continue/load slots, credits).
   - ensure no bridge sprint is required before building post-M5 UX layers.

Milestone 5 exit criteria:

- [x] Launching the game always opens a main menu before showing in-game management UI.
- [x] Main menu has `Play` and `Settings` as first-level actions.
- [x] `Play` flow always routes through location selection (Arcanum/Meadowbrook) before campaign start.
- [x] Centered pixelated "Tavern Simulator" logo and medieval dark-wood visual direction are implemented and readable.
- [x] Campaign starts from selected location without UI/state desync.
- [x] Settings screen exists, persists values, and does not regress gameplay systems.

### Milestone 6: In-Game UI Clarity And Navigation

- Reduce cognitive overload by grouping systems into clear, role-based screens
- Introduce stronger information hierarchy so urgent items stand out and routine data stays readable
- Use progressive disclosure so advanced controls/details are available but not always in the player’s face
- Keep all M1-M5 functionality reachable with fewer on-screen elements at once

Milestone 6 implementation steps:

1. Run a current-state UI audit and workflow map:
   - [x] Implementation complete
   - [x] Validation complete
   - inventory every existing in-game panel/control and map it to player intent (`plan`, `operate`, `staff`, `world`, `analyze`, `respond`).
   - classify each element by frequency and urgency (`always visible`, `contextual`, `advanced`).
2. Define target information architecture for in-game screens:
   - [x] Implementation complete
   - [x] Validation complete
   - introduce primary in-game navigation with canonical views (for example: `Command`, `Operations`, `Staff`, `World`, `Analytics`, `Reports`).
   - define ownership rules so each system appears in one primary home view (avoid duplicate panel sprawl).
3. Implement in-game view routing state + persistence:
   - [x] Implementation complete
   - [x] Validation complete
   - add deterministic UI route state for current in-game tab/view.
   - persist selected view and restore cleanly on reload without breaking simulation state.
4. Build a compact command header (always-on overview):
   - [x] Implementation complete
   - [x] Validation complete
   - keep only core live KPIs always visible (time/speed, gold, net trend, reputation, compliance, critical alerts count).
   - move non-critical chips/details out of the permanent header into relevant screens.
5. Refactor panel density using progressive disclosure:
   - [x] Implementation complete
   - [x] Validation complete
   - convert dense control blocks into collapsible sections with clear labels and defaults.
   - keep high-frequency actions immediate; move advanced/rare actions behind expanders or subviews.
6. Introduce alert prioritization and triage flow:
   - [x] Implementation complete
   - [x] Validation complete
   - unify urgent warnings, command-board critical messages, and blocking system states into a prioritized alert strip/queue.
   - ensure each alert has a clear next action jump.
7. Rework report/log consumption surfaces:
   - [x] Implementation complete
   - [x] Validation complete
   - separate `daily report`, `weekly summary`, and `raw log` into clearer sections with filters/search where useful.
   - reduce repeated text noise and elevate deltas/changes since last day.
8. Improve form and control ergonomics:
   - [x] Implementation complete
   - [x] Validation complete
   - standardize control order, button sizing, spacing, and labeling conventions across views.
   - add helper microcopy/tooltips for non-obvious manager concepts.
9. Tighten visual hierarchy and readability pass:
   - [x] Implementation complete
   - [x] Validation complete
   - rebalance typography scale, contrast, spacing rhythm, and container framing for fast scanning.
   - ensure the style remains consistent with the dark-wood medieval tavern identity.
10. Ensure mobile and narrow-width layout usability:
    - [x] Implementation complete
    - [x] Validation complete
    - design single-column or drawer-based behavior for smaller viewports.
    - confirm no critical controls/panels become inaccessible or clipped.
11. Add keyboard accessibility and navigation quality:
    - [x] Implementation complete
    - [x] Validation complete
    - define predictable tab order per view, clear focus states, and shortcut-friendly navigation where appropriate.
    - ensure view switching and core actions are keyboard-operable.
12. Extend regression + browser smoke coverage for new UI shell:
    - [x] Implementation complete
    - [x] Validation complete
    - add automated checks for routing integrity, alert visibility, and key action reachability across views.
    - include desktop + mobile smoke pass that confirms no M1-M5/M4 functional regressions.
13. Lock M6 -> M7 UI handoff contract:
    - [x] Implementation complete
    - [x] Validation complete
    - expose stable UI route ids, panel mount points, and action hooks for future UX polish/features.
    - ensure no bridge sprint is required before the next milestone builds on this interface.

Milestone 6 exit criteria:

- [x] In-game UI no longer presents the majority of systems on one overloaded screen by default.
- [x] Core player loop actions are reachable in fewer, clearer steps with lower cognitive load.
- [x] Alerts and priorities are visually distinct from routine information.
- [x] Reports/logs are digestible and decision-oriented rather than a dense wall of text.
- [x] Desktop and mobile layouts remain functional and readable for all core gameplay actions.
- [x] Existing gameplay systems (M1-M5 + M4 tooling) remain fully functional after the UI restructure.

## Suggested Technical Direction

- Keep core simulation in pure data modules (easy balancing + tests) [in progress via `src/engine/`]
- Keep rendering thin and event-driven [in progress via `src/ui/`]
- Add deterministic seeded simulation mode for debugging [implemented in `src/engine/random.js`]
- Add versioned save/load boundaries for persistent campaigns [implemented in `src/runtime/persistence.js` + engine snapshots]
- Add scenario fixtures for rapid balancing and regression tests [implemented via `src/engine/scenarioFixtures.js` + `scripts/regression/runScenarios.mjs`]
