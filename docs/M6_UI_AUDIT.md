# Milestone 6 UI Audit

Date: February 15, 2026

## Intent Mapping

- `command`: clock controls, planning status, command board, delegation, urgent alerts
- `operations`: production, supply purchasing, pricing, inventory, supplier contracts
- `staff`: roster, recruit pipeline, rota controls, training actions
- `world`: district travel, Crown compliance, world influence, rivalry context
- `analytics`: KPI dashboard, scouting intel, rumors
- `reports`: daily report, weekly summary, filtered event log

## Frequency and Urgency Classification

- `always visible`:
  - compact top header (time, gold/net, compliance, alert count)
  - in-game route nav
  - alert strip
- `contextual`:
  - planning board
  - command board/delegation
  - analytics + scouting
  - world influence/Crown/supplier travel blocks
- `advanced`:
  - campaign setup panel (during active game)
  - less-frequent controls hidden behind collapsible groups
  - raw event log tab and filter console

## Overload Findings (Before M6)

- Too many controls and data blocks on one screen simultaneously.
- Daily report, logs, and world summaries competed for the same visual priority.
- Important alerts were mixed into large text regions instead of a triage strip.
- Mobile/narrow layouts stacked everything, but still forced long scrolling to find key actions.

## M6 Direction

- Introduce route-based in-game views with one primary intent per screen.
- Keep high-frequency decisions near the top-level command surface.
- Move less-frequent controls into collapsible panels and secondary views.
- Keep every system reachable, but never all equally loud at once.

## Target Information Architecture (Step 2)

Primary in-game navigation (canonical views):

- `Command`: manager-at-a-glance control center (timeflow, urgent alerts, planning pulse, command board triage)
- `Operations`: production, supply purchasing, price tuning, and execution controls
- `Staff`: roster operations, recruitment pipeline, rota controls, delegation oversight
- `World`: district travel, Crown compliance, world influence/power pressure, supplier and rivalry context
- `Analytics`: KPI analysis and scouting/rumor interpretation
- `Reports`: structured daily/weekly report reading and filtered event-log review

Screen ownership model:

- Each gameplay system has exactly one `primary home` view.
- Other views may include brief summaries or links, but not full duplicate control surfaces.
- Cross-view actions should use explicit jumps (`open <view>`) instead of copying full panels.

## Ownership Rules (Step 2)

System-to-primary-home mapping:

- Time controls and day progression: `Command`
- Weekly planning controls: `Command`
- Production crafting and supply buying: `Operations`
- Price board adjustments: `Operations`
- Staff roster management and hiring/firing/training: `Staff`
- Recruitment shortlist/scout/sign flow: `Staff`
- Crown compliance actions: `World`
- District travel actions/status: `World`
- Supplier contracts/logistics controls: `World`
- World actor influence/rival pressure context: `World`
- KPI dashboard and trend interpretation: `Analytics`
- Scouting and rumor lifecycle surfaces: `Analytics`
- Daily/weekly/report-log reading surfaces: `Reports`

Anti-sprawl enforcement rules:

- No full duplicate action panels across views.
- If a panel is mirrored for awareness, mirror only summary lines.
- Keep urgent alerts centralized in Command-level triage and link outward.
- Reserve advanced/rare controls for collapsible or secondary sections.

## M6 To M7 Handoff Contract (Step 13)

Contract source of truth:

- `src/ui/gameUI.js` -> `UI_HANDOFF_CONTRACT_VERSION = m6-ui-handoff-v1`
- Runtime/debug API -> `window.tavernSim.uiHandoff()`

Contract payload guarantees:

- Stable in-game route ids: `command`, `operations`, `staff`, `world`, `analytics`, `reports`
- Stable panel mount map (`panelMountPoints`) keyed by semantic mount ids (for example `planning_board`, `command_board`, `analytics_dashboard`, `report_weekly_surface`)
- Stable action hook selector map (`actionHooks`) keyed by semantic hooks (for example `route_command`, `action_skip_next_day`, `action_file_compliance`, `alert_jump`)

DOM binding guarantees:

- Mount roots receive `data-ui-mount="<mount_id>"`
- Action targets receive `data-ui-action-hook="<hook_id>"`
- Route buttons expose both `data-ui-route` and `data-ui-route-id`
- Active contract version is stamped as `data-ui-contract-version` on `<body>`

Regression enforcement:

- `scripts/regression/m4BrowserSmoke.mjs` validates runtime contract integrity and DOM bindings (`SMOKE: desktop handoff contract`)
- `scripts/regression/runScenarios.mjs` includes static contract checks so regressions fail CI early
