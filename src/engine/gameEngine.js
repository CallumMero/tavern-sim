import { createRandomController } from "./random.js";
import {
  DAY_NAMES,
  STARTING_LOCATION_PROFILES,
  WORLD_ACTOR_PROFILES,
  LOCATION_ACTOR_STANDING_BIAS,
  DISTRICT_PROFILES,
  DISTRICT_TRAVEL_LINKS,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  COHORT_PROFILES,
  PRODUCT_LABELS,
  PATRON_FIRST_NAMES,
  PATRON_LAST_NAMES
} from "./config.js";
import {
  getScenarioFixture,
  listScenarioFixtures
} from "./scenarioFixtures.js";
import {
  createStaff as createStaffModel,
  isStaffUnavailable,
  getStaffStats as getStaffStatsModel,
  progressStaffAbsences as progressStaffAbsencesModel,
  assignDailyShifts as assignDailyShiftsModel,
  applyEndOfDayStaffEffects as applyEndOfDayStaffEffectsModel
} from "./staffEngine.js";
import {
  SUPPLY_META,
  createSupplyStats as createSupplyStatsModel,
  isSupplyItem,
  qualityTier,
  evaluateIngredientBlend as evaluateIngredientBlendModel,
  getProductionQualityContext as getProductionQualityContextModel,
  resetProductionQualityContext as resetProductionQualityContextModel,
  applySupplySpoilage as applySupplySpoilageModel
} from "./inventoryEngine.js";
import {
  createPatronPool as createPatronPoolModel,
  getLoyaltyDemandMultiplier as getLoyaltyDemandMultiplierModel,
  updatePatronLoyalty as updatePatronLoyaltyModel
} from "./patronEngine.js";
import {
  rollDailyEvent as rollDailyEventModel,
  getEventCalendarOutlook as getEventCalendarOutlookModel
} from "./eventEngine.js";
import {
  demandByPrice as demandByPriceModel,
  sellFromInventory as sellFromInventoryModel
} from "./economyEngine.js";

const SAVE_SCHEMA_VERSION = 1;
const DEFAULT_STARTING_LOCATION = "arcanum";
const MANAGER_WEEK_LENGTH = 7;
const MINUTES_PER_DAY = 24 * 60;
const SIMULATION_SPEEDS = [0, 1, 2, 4];
const MANAGER_TOOLING_CONTRACT_VERSION = 1;
const MANAGER_TOOLING_SECTIONS = ["message_board", "delegation", "analytics", "scouting"];
const MESSAGE_URGENCY_ORDER = ["critical", "high", "medium", "low"];
const MAX_COMMAND_MESSAGES = 80;
const MAX_DELEGATION_AUDIT_ENTRIES = 120;
const MAX_ANALYTICS_HISTORY = 84;
const MAX_SCOUTING_REPORTS = 36;
const MAX_SCOUTING_RUMORS = 48;
const MENU_MARGIN_COSTS = Object.freeze({
  ale: 3,
  mead: 5,
  stew: 6,
  bread: 2,
  room: 7
});
const TIMEFLOW_CONTRACT_VERSION = 1;
const TIMEFLOW_UNITS = {
  minute: "in_game_minute",
  day: "campaign_day",
  week: "manager_week"
};
const TIMEFLOW_BOUNDARY_ORDER = ["minute_tick", "day_close", "week_close", "reporting_publish"];
const TIMEFLOW_OWNERSHIP = {
  clock: "state.clock",
  managerPhase: "state.manager",
  dayResolver: "advanceDay",
  reportingPublisher: "state.lastReport"
};
const TIMEFLOW_TRIGGER_PRECEDENCE = ["manual_skip", "midnight_rollover", "week_boundary"];
const TIMEFLOW_TRIGGER_PRIORITY = Object.freeze({
  manual_skip: 3,
  midnight_rollover: 2,
  week_boundary: 1
});
const PLAN_EFFECT_TIMING = Object.freeze({
  staffingIntent: "next_day",
  pricingIntent: "next_day",
  procurementIntent: "next_day",
  menuFallbackPolicy: "next_day",
  marketingIntent: "next_week",
  logisticsIntent: "next_week",
  riskTolerance: "next_week",
  reserveGoldTarget: "next_week",
  supplyBudgetCap: "next_week",
  note: "instant"
});
const PLAN_TIMING_ORDER = ["instant", "next_day", "next_week"];
const MANAGER_PHASES = {
  PLANNING: "planning",
  EXECUTION: "execution",
  WEEK_CLOSE: "week_close"
};
const SEASON_LENGTH = 28;
const YEAR_LENGTH = SEASON_LENGTH * 4;
const SEASON_ORDER = [
  { id: "spring", label: "Spring", start: 1, end: 28 },
  { id: "summer", label: "Summer", start: 29, end: 56 },
  { id: "harvest", label: "Harvest", start: 57, end: 84 },
  { id: "winter", label: "Winter", start: 85, end: 112 }
];

const random = createRandomController();
const changeListeners = [];

function createDefaultWeeklyPlan(locationId = DEFAULT_STARTING_LOCATION, weekIndex = 1) {
  const location = resolveStartingLocation(locationId);
  return {
    weekIndex: Math.max(1, Math.round(Number(weekIndex) || 1)),
    staffingIntent: "balanced",
    pricingIntent: location.id === "arcanum" ? "premium" : "value",
    procurementIntent: location.id === "arcanum" ? "quality" : "stability",
    marketingIntent: location.id === "arcanum" ? "steady" : "growth",
    logisticsIntent: location.id === "arcanum" ? "local" : "caravan_watch",
    riskTolerance: location.id === "arcanum" ? "moderate" : "low",
    reserveGoldTarget: location.id === "arcanum" ? 110 : 90,
    supplyBudgetCap: location.id === "arcanum" ? 52 : 38,
    menuFallbackPolicy: location.id === "arcanum" ? "margin_guard" : "substitute_first",
    note: `Week ${Math.max(1, Math.round(Number(weekIndex) || 1))} planning draft.`
  };
}

function isValidManagerTransition(fromPhase, toPhase) {
  const from = typeof fromPhase === "string" ? fromPhase : MANAGER_PHASES.PLANNING;
  const to = typeof toPhase === "string" ? toPhase : MANAGER_PHASES.PLANNING;
  const graph = {
    [MANAGER_PHASES.PLANNING]: [MANAGER_PHASES.EXECUTION],
    [MANAGER_PHASES.EXECUTION]: [MANAGER_PHASES.WEEK_CLOSE],
    [MANAGER_PHASES.WEEK_CLOSE]: [MANAGER_PHASES.PLANNING]
  };
  return Array.isArray(graph[from]) && graph[from].includes(to);
}

function normalizeRecruitCandidateEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const role = typeof entry.role === "string" ? entry.role : "server";
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    name: typeof entry.name === "string" ? entry.name : "Unnamed Candidate",
    role,
    trueService: Math.max(4, Math.min(30, Math.round(Number(entry.trueService) || 10))),
    trueQuality: Math.max(2, Math.min(25, Math.round(Number(entry.trueQuality) || 8))),
    potentialMin: Math.max(6, Math.min(35, Math.round(Number(entry.potentialMin) || 12))),
    potentialMax: Math.max(8, Math.min(40, Math.round(Number(entry.potentialMax) || 18))),
    expectedWage: Math.max(6, Math.min(30, Math.round(Number(entry.expectedWage) || 10))),
    visibleService: Math.max(1, Math.min(30, Math.round(Number(entry.visibleService) || 10))),
    visibleQuality: Math.max(1, Math.min(25, Math.round(Number(entry.visibleQuality) || 8))),
    confidence: Math.max(0, Math.min(100, Math.round(Number(entry.confidence) || 35))),
    daysRemaining: Math.max(0, Math.min(14, Math.round(Number(entry.daysRemaining) || 6))),
    interest: Math.max(0, Math.min(100, Math.round(Number(entry.interest) || 55))),
    competingPressure: Math.max(0, Math.min(100, Math.round(Number(entry.competingPressure) || 40))),
    visibleTraits: Array.isArray(entry.visibleTraits) ? entry.visibleTraits.map((value) => `${value}`).slice(0, 4) : [],
    hiddenTraits: Array.isArray(entry.hiddenTraits) ? entry.hiddenTraits.map((value) => `${value}`).slice(0, 4) : [],
    revealedTraits: Array.isArray(entry.revealedTraits) ? entry.revealedTraits.map((value) => `${value}`).slice(0, 4) : []
  };
}

function normalizeObjectiveEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    issuer: typeof entry.issuer === "string" ? entry.issuer : "crown_office",
    type: typeof entry.type === "string" ? entry.type : "merchant_margin",
    label: typeof entry.label === "string" ? entry.label : "Untitled objective",
    description: typeof entry.description === "string" ? entry.description : "",
    remainingWeeks: Math.max(0, Math.min(12, Math.round(Number(entry.remainingWeeks) || 0))),
    goalValue: Math.max(1, Math.round(Number(entry.goalValue) || 1)),
    progressValue: Math.max(0, Math.round(Number(entry.progressValue) || 0)),
    metric: typeof entry.metric === "string" ? entry.metric : "count_days",
    rewardGold: Math.max(0, Math.round(Number(entry.rewardGold) || 0)),
    rewardReputation: Math.max(0, Math.round(Number(entry.rewardReputation) || 0)),
    penaltyGold: Math.max(0, Math.round(Number(entry.penaltyGold) || 0)),
    penaltyReputation: Math.max(0, Math.round(Number(entry.penaltyReputation) || 0)),
    status: typeof entry.status === "string" ? entry.status : "active",
    progressNote: typeof entry.progressNote === "string" ? entry.progressNote : "",
    originWeek: Math.max(1, Math.round(Number(entry.originWeek) || 1)),
    payload:
      entry.payload && typeof entry.payload === "object"
        ? { ...entry.payload }
        : {}
  };
}

function normalizeManagerMessage(entry, index = 0, dayFallback = 1) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const urgencyRaw = typeof entry.urgency === "string" ? entry.urgency : "medium";
  const urgency = MESSAGE_URGENCY_ORDER.includes(urgencyRaw) ? urgencyRaw : "medium";
  const confidence = Math.max(0, Math.min(100, Math.round(Number(entry.confidence) || 50)));
  const impact = Math.max(0, Math.min(100, Math.round(Number(entry.impact) || 50)));
  const category = typeof entry.category === "string" ? entry.category : "operations";
  const recommendationInput =
    entry.recommendation && typeof entry.recommendation === "object" ? entry.recommendation : {};
  const createdDay = Math.max(1, Math.round(Number(entry.day) || dayFallback));
  const expiresDay = Math.max(createdDay, Math.round(Number(entry.expiresDay) || createdDay + 3));
  return {
    id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `msg-${createdDay}-${index}`,
    day: createdDay,
    source: typeof entry.source === "string" ? entry.source : "operations_desk",
    urgency,
    category,
    title: typeof entry.title === "string" && entry.title.length > 0 ? entry.title : "Operations update",
    summary: typeof entry.summary === "string" ? entry.summary : "",
    confidence,
    impact,
    expiresDay,
    linkedAction: typeof entry.linkedAction === "string" ? entry.linkedAction : "",
    read: Boolean(entry.read),
    recommendation: {
      action: typeof recommendationInput.action === "string" ? recommendationInput.action : "",
      label: typeof recommendationInput.label === "string" ? recommendationInput.label : "Review",
      confidence: Math.max(
        0,
        Math.min(100, Math.round(Number(recommendationInput.confidence) || confidence))
      ),
      impact: Math.max(0, Math.min(100, Math.round(Number(recommendationInput.impact) || impact))),
      tradeoff:
        typeof recommendationInput.tradeoff === "string"
          ? recommendationInput.tradeoff
          : "Balanced short-term and long-term impact."
    }
  };
}

function normalizeDelegationRole(roleId, label, input = null, defaultTasks = {}) {
  const source = input && typeof input === "object" ? input : {};
  const tasksInput = source.tasks && typeof source.tasks === "object" ? source.tasks : {};
  const tasks = Object.fromEntries(
    Object.entries(defaultTasks).map(([taskId, defaultValue]) => [taskId, tasksInput[taskId] !== false && Boolean(defaultValue)])
  );
  return {
    id: roleId,
    label,
    enabled: Boolean(source.enabled),
    tasks,
    note: typeof source.note === "string" ? source.note : ""
  };
}

function normalizeDelegationAuditEntry(entry, index = 0, dayFallback = 1) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `audit-${dayFallback}-${index}`,
    day: Math.max(1, Math.round(Number(entry.day) || dayFallback)),
    boundary: typeof entry.boundary === "string" ? entry.boundary : "day_start",
    roleId: typeof entry.roleId === "string" ? entry.roleId : "clerk",
    action: typeof entry.action === "string" ? entry.action : "routine",
    result: typeof entry.result === "string" ? entry.result : "",
    tone: typeof entry.tone === "string" ? entry.tone : "neutral"
  };
}

function normalizeAnalyticsHistoryEntry(entry, index = 0, dayFallback = 1) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || dayFallback + index)),
    guests: Math.max(0, Math.round(Number(entry.guests) || 0)),
    revenue: Math.max(0, Math.round(Number(entry.revenue) || 0)),
    net: Math.round(Number(entry.net) || 0),
    conversionPct: Math.max(0, Math.min(100, Math.round(Number(entry.conversionPct) || 0))),
    retentionPct: Math.max(0, Math.min(100, Math.round(Number(entry.retentionPct) || 0))),
    avgSpend: Math.max(0, Number(entry.avgSpend) || 0),
    marginPct: Math.max(-100, Math.min(100, Math.round(Number(entry.marginPct) || 0)))
  };
}

function normalizeScoutingReportEntry(entry, index = 0, dayFallback = 1) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `intel-${dayFallback}-${index}`,
    targetType: typeof entry.targetType === "string" ? entry.targetType : "event",
    targetId: typeof entry.targetId === "string" ? entry.targetId : "",
    label: typeof entry.label === "string" ? entry.label : "Unknown target",
    confidence: Math.max(0, Math.min(100, Math.round(Number(entry.confidence) || 40))),
    freshness: Math.max(0, Math.min(100, Math.round(Number(entry.freshness) || 80))),
    summary: typeof entry.summary === "string" ? entry.summary : "",
    discoveredDay: Math.max(1, Math.round(Number(entry.discoveredDay) || dayFallback)),
    lastUpdatedDay: Math.max(1, Math.round(Number(entry.lastUpdatedDay) || dayFallback))
  };
}

function normalizeRumorEntry(entry, index = 0, dayFallback = 1) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const truthStateRaw = typeof entry.truthState === "string" ? entry.truthState : "unknown";
  const truthState =
    truthStateRaw === "true" || truthStateRaw === "false" || truthStateRaw === "partial"
      ? truthStateRaw
      : "unknown";
  const statusRaw = typeof entry.status === "string" ? entry.status : "active";
  const status =
    statusRaw === "resolved" || statusRaw === "expired" || statusRaw === "active" ? statusRaw : "active";
  const createdDay = Math.max(1, Math.round(Number(entry.createdDay) || dayFallback));
  return {
    id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `rumor-${createdDay}-${index}`,
    topic: typeof entry.topic === "string" ? entry.topic : "market-chatter",
    targetType: typeof entry.targetType === "string" ? entry.targetType : "event",
    targetId: typeof entry.targetId === "string" ? entry.targetId : "",
    summary: typeof entry.summary === "string" ? entry.summary : "Rumor is circulating.",
    truthState,
    status,
    confidence: Math.max(0, Math.min(100, Math.round(Number(entry.confidence) || 45))),
    freshness: Math.max(0, Math.min(100, Math.round(Number(entry.freshness) || 75))),
    createdDay,
    resolveDay: Math.max(createdDay, Math.round(Number(entry.resolveDay) || createdDay + 3)),
    resolutionNote: typeof entry.resolutionNote === "string" ? entry.resolutionNote : "",
    effect:
      entry.effect && typeof entry.effect === "object"
        ? {
            reputationDelta: Math.round(Number(entry.effect.reputationDelta) || 0),
            actorId: typeof entry.effect.actorId === "string" ? entry.effect.actorId : "",
            actorStandingDelta: Math.round(Number(entry.effect.actorStandingDelta) || 0)
          }
        : {
            reputationDelta: 0,
            actorId: "",
            actorStandingDelta: 0
          }
  };
}

function createSimulationClockState(existing = null) {
  const input = existing && typeof existing === "object" ? existing : {};
  const speedRaw = Math.round(Number(input.speed) || 0);
  const speed = SIMULATION_SPEEDS.includes(speedRaw) ? speedRaw : 0;
  return {
    minuteOfDay: Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(input.minuteOfDay) || 480))),
    speed
  };
}

function createTimeflowRuntimeState(existing = null) {
  const input = existing && typeof existing === "object" ? existing : {};
  const intentQueue = Array.isArray(input.intentQueue)
    ? input.intentQueue
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const timing =
            typeof entry.timing === "string" && PLAN_TIMING_ORDER.includes(entry.timing)
              ? entry.timing
              : "next_day";
          const fallbackIdBase =
            `legacy-${Math.max(1, Math.round(Number(entry.createdAtDay) || 1))}-` +
            `${Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(entry.createdAtMinute) || 0)))}-` +
            `${typeof entry.field === "string" ? entry.field : "field"}`;
          return {
            id: typeof entry.id === "string" ? entry.id : fallbackIdBase,
            source: typeof entry.source === "string" ? entry.source : "planning_board",
            field: typeof entry.field === "string" ? entry.field : "",
            value: entry.value,
            timing,
            effectiveBoundary: timing === "next_week" ? "week_start" : "day_start",
            priority: timing === "next_week" ? 1 : 2,
            createdAtDay: Math.max(1, Math.round(Number(entry.createdAtDay) || 1)),
            createdAtMinute: Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(entry.createdAtMinute) || 0))),
            createdSeq: Math.max(0, Math.round(Number(entry.createdSeq) || index)),
            applied: Boolean(entry.applied)
          };
        })
        .filter((entry) => entry && entry.field.length > 0)
    : [];
  const inferredNextIntentSeq =
    intentQueue.length > 0
      ? intentQueue.reduce((max, entry) => Math.max(max, Math.max(0, Math.round(Number(entry.createdSeq) || 0))), 0) + 1
      : 0;
  const lastTrigger =
    typeof input.lastTrigger === "string" && TIMEFLOW_TRIGGER_PRECEDENCE.includes(input.lastTrigger)
      ? input.lastTrigger
      : "manual_skip";
  return {
    activeTrigger:
      typeof input.activeTrigger === "string" && TIMEFLOW_TRIGGER_PRECEDENCE.includes(input.activeTrigger)
        ? input.activeTrigger
        : null,
    inProgress: Boolean(input.inProgress),
    lastTrigger,
    lastBoundaryOrder: Array.isArray(input.lastBoundaryOrder)
      ? input.lastBoundaryOrder
          .map((entry) => `${entry}`)
          .filter((entry) => TIMEFLOW_BOUNDARY_ORDER.includes(entry))
      : [],
    lastResolvedDay: Math.max(1, Math.round(Number(input.lastResolvedDay) || 1)),
    lastMinuteOfDay: Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(input.lastMinuteOfDay) || 480))),
    lastBoundaryKey: typeof input.lastBoundaryKey === "string" ? input.lastBoundaryKey : "",
    lastBoundarySucceeded: input.lastBoundarySucceeded !== false,
    lastResolutionNote:
      typeof input.lastResolutionNote === "string"
        ? input.lastResolutionNote
        : "No timeflow boundary resolution recorded yet.",
    intentQueue,
    lastQueueSummary:
      typeof input.lastQueueSummary === "string"
        ? input.lastQueueSummary
        : "No queued planning intents.",
    cadence: input.cadence && typeof input.cadence === "object"
      ? {
          minuteLocks:
            input.cadence.minuteLocks && typeof input.cadence.minuteLocks === "object"
              ? { ...input.cadence.minuteLocks }
              : {},
          dayLocks:
            input.cadence.dayLocks && typeof input.cadence.dayLocks === "object"
              ? { ...input.cadence.dayLocks }
              : {},
          weekLocks:
            input.cadence.weekLocks && typeof input.cadence.weekLocks === "object"
              ? { ...input.cadence.weekLocks }
              : {}
        }
      : {
          minuteLocks: {},
          dayLocks: {},
          weekLocks: {}
        },
    boundaries:
      input.boundaries && typeof input.boundaries === "object"
        ? {
            lastWeekCloseAtDay: Math.max(0, Math.round(Number(input.boundaries.lastWeekCloseAtDay) || 0)),
            lastWeekCloseWeek: Math.max(0, Math.round(Number(input.boundaries.lastWeekCloseWeek) || 0))
          }
        : {
            lastWeekCloseAtDay: 0,
            lastWeekCloseWeek: 0
          },
    diagnostics:
      input.diagnostics && typeof input.diagnostics === "object"
        ? {
            guardRecoveries: Math.max(0, Math.round(Number(input.diagnostics.guardRecoveries) || 0)),
            lastParityStatus:
              typeof input.diagnostics.lastParityStatus === "string"
                ? input.diagnostics.lastParityStatus
                : "unverified"
          }
        : {
            guardRecoveries: 0,
            lastParityStatus: "unverified"
          },
    nextIntentSeq: Math.max(0, Math.round(Number(input.nextIntentSeq) || inferredNextIntentSeq))
  };
}

function resolveSeasonTimeline(dayNumber) {
  const day = Math.max(1, Math.round(Number(dayNumber) || 1));
  const year = Math.floor((day - 1) / YEAR_LENGTH) + 1;
  const dayOfYear = ((day - 1) % YEAR_LENGTH) + 1;
  const season = SEASON_ORDER.find((entry) => dayOfYear >= entry.start && dayOfYear <= entry.end) || SEASON_ORDER[0];
  const dayOfSeason = dayOfYear - season.start + 1;
  const weekOfSeason = Math.floor((dayOfSeason - 1) / 7) + 1;
  return {
    day,
    year,
    dayOfYear,
    seasonId: season.id,
    seasonLabel: season.label,
    dayOfSeason,
    weekOfSeason
  };
}

function normalizeManagerState(existing = null, currentDay = 1, activeLocationId = DEFAULT_STARTING_LOCATION) {
  const input = existing && typeof existing === "object" ? existing : {};
  const inferredWeek = Math.max(1, Math.floor((Math.max(1, Math.round(Number(currentDay) || 1)) - 1) / MANAGER_WEEK_LENGTH) + 1);
  const weekIndex = Math.max(1, Math.round(Number(input.weekIndex) || inferredWeek));
  const inferredDayInWeek = ((Math.max(1, Math.round(Number(currentDay) || 1)) - 1) % MANAGER_WEEK_LENGTH) + 1;
  const phase =
    input.phase === MANAGER_PHASES.PLANNING ||
    input.phase === MANAGER_PHASES.EXECUTION ||
    input.phase === MANAGER_PHASES.WEEK_CLOSE
      ? input.phase
      : MANAGER_PHASES.PLANNING;
  const planDraft = createDefaultWeeklyPlan(
    activeLocationId,
    weekIndex
  );
  if (input.planDraft && typeof input.planDraft === "object") {
    Object.assign(planDraft, input.planDraft);
    planDraft.weekIndex = weekIndex;
  }
  const committedPlan = input.committedPlan && typeof input.committedPlan === "object"
    ? { ...input.committedPlan, weekIndex }
    : null;
  const dayInWeek = Math.max(1, Math.min(MANAGER_WEEK_LENGTH, Math.round(Number(input.dayInWeek) || inferredDayInWeek)));
  let planCommitted = Boolean(input.planCommitted);
  let normalizedPhase = phase;
  let guardNote = typeof input.guardNote === "string" ? input.guardNote : "";

  if (normalizedPhase === MANAGER_PHASES.EXECUTION && !planCommitted) {
    normalizedPhase = MANAGER_PHASES.PLANNING;
    guardNote = "Recovered from invalid execution phase without committed plan.";
  }
  if (normalizedPhase === MANAGER_PHASES.PLANNING && !committedPlan) {
    planCommitted = false;
  }
  const recruitmentInput = input.recruitment && typeof input.recruitment === "object" ? input.recruitment : {};
  const market = Array.isArray(recruitmentInput.market)
    ? recruitmentInput.market
        .map((entry) => normalizeRecruitCandidateEntry(entry))
        .filter(Boolean)
        .slice(0, 16)
    : [];
  const shortlist = Array.isArray(recruitmentInput.shortlist)
    ? recruitmentInput.shortlist
        .map((entry) => `${entry}`)
        .filter((candidateId, index, arr) => candidateId.length > 0 && arr.indexOf(candidateId) === index)
        .slice(0, 16)
    : [];
  const objectivesInput = input.objectives && typeof input.objectives === "object" ? input.objectives : {};
  const activeObjectives = Array.isArray(objectivesInput.active)
    ? objectivesInput.active
        .map((entry) => normalizeObjectiveEntry(entry))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const completedObjectives = Array.isArray(objectivesInput.completed)
    ? objectivesInput.completed
        .map((entry) => normalizeObjectiveEntry(entry))
        .filter(Boolean)
        .slice(0, 24)
    : [];
  const failedObjectives = Array.isArray(objectivesInput.failed)
    ? objectivesInput.failed
        .map((entry) => normalizeObjectiveEntry(entry))
        .filter(Boolean)
        .slice(0, 24)
    : [];
  const resolvedTimeline = resolveSeasonTimeline(currentDay);
  const timelineInput = input.timeline && typeof input.timeline === "object" ? input.timeline : {};
  const commandBoardInput = input.commandBoard && typeof input.commandBoard === "object" ? input.commandBoard : {};
  const commandMessages = Array.isArray(commandBoardInput.messages)
    ? commandBoardInput.messages
        .map((entry, index) => normalizeManagerMessage(entry, index, Math.max(1, Math.round(Number(currentDay) || 1))))
        .filter(Boolean)
        .slice(0, MAX_COMMAND_MESSAGES)
    : [];
  const delegationInput = input.delegation && typeof input.delegation === "object" ? input.delegation : {};
  const delegationRolesInput =
    delegationInput.roles && typeof delegationInput.roles === "object" ? delegationInput.roles : {};
  const delegationAudit = Array.isArray(delegationInput.auditTrail)
    ? delegationInput.auditTrail
        .map((entry, index) =>
          normalizeDelegationAuditEntry(entry, index, Math.max(1, Math.round(Number(currentDay) || 1)))
        )
        .filter(Boolean)
        .slice(0, MAX_DELEGATION_AUDIT_ENTRIES)
    : [];
  const analyticsInput = input.analytics && typeof input.analytics === "object" ? input.analytics : {};
  const analyticsHistory = Array.isArray(analyticsInput.history)
    ? analyticsInput.history
        .map((entry, index) =>
          normalizeAnalyticsHistoryEntry(entry, index, Math.max(1, Math.round(Number(currentDay) || 1)))
        )
        .filter(Boolean)
        .slice(0, MAX_ANALYTICS_HISTORY)
    : [];
  const scoutingInput = input.scouting && typeof input.scouting === "object" ? input.scouting : {};
  const scoutingReports = Array.isArray(scoutingInput.reports)
    ? scoutingInput.reports
        .map((entry, index) =>
          normalizeScoutingReportEntry(entry, index, Math.max(1, Math.round(Number(currentDay) || 1)))
        )
        .filter(Boolean)
        .slice(0, MAX_SCOUTING_REPORTS)
    : [];
  const scoutingRumors = Array.isArray(scoutingInput.rumors)
    ? scoutingInput.rumors
        .map((entry, index) => normalizeRumorEntry(entry, index, Math.max(1, Math.round(Number(currentDay) || 1))))
        .filter(Boolean)
        .slice(0, MAX_SCOUTING_RUMORS)
    : [];
  const currentSectionRaw = typeof commandBoardInput.currentSection === "string" ? commandBoardInput.currentSection : "";
  const currentSection = MANAGER_TOOLING_SECTIONS.includes(currentSectionRaw)
    ? currentSectionRaw
    : "message_board";
  const unreadCount = commandMessages.filter((entry) => !entry.read).length;
  const dailySummaryInput =
    analyticsInput.dailySummary && typeof analyticsInput.dailySummary === "object" ? analyticsInput.dailySummary : {};
  const scoutingFiltersInput =
    scoutingInput.filters && typeof scoutingInput.filters === "object" ? scoutingInput.filters : {};

  return {
    phase: normalizedPhase,
    weekIndex,
    dayInWeek,
    planCommitted,
    planDraft,
    committedPlan,
    lastTransitionDay: Math.max(1, Math.round(Number(input.lastTransitionDay) || Math.max(1, Math.round(Number(currentDay) || 1)))),
    transitionReason: typeof input.transitionReason === "string" ? input.transitionReason : "Planning initialized.",
    guardNote,
    lastWeekSummary: typeof input.lastWeekSummary === "string" ? input.lastWeekSummary : "No weekly close summary yet.",
    supplyPlanner:
      input.supplyPlanner && typeof input.supplyPlanner === "object"
        ? {
            weeklyBudgetCap: Math.max(0, Math.round(Number(input.supplyPlanner.weeklyBudgetCap) || Math.round(Number(planDraft.supplyBudgetCap) || 40))),
            spent: Math.max(0, Math.round(Number(input.supplyPlanner.spent) || 0)),
            stockTargets:
              input.supplyPlanner.stockTargets && typeof input.supplyPlanner.stockTargets === "object"
                ? { ...input.supplyPlanner.stockTargets }
                : {},
            lastAction:
              typeof input.supplyPlanner.lastAction === "string"
                ? input.supplyPlanner.lastAction
                : "Supply planner idle."
          }
        : {
            weeklyBudgetCap: Math.max(0, Math.round(Number(planDraft.supplyBudgetCap) || 40)),
            spent: 0,
            stockTargets: {},
            lastAction: "Supply planner idle."
          },
    recruitment: {
      market,
      shortlist,
      lastRefreshWeek: Math.max(0, Math.round(Number(recruitmentInput.lastRefreshWeek) || 0)),
      lastSummary:
        typeof recruitmentInput.lastSummary === "string"
          ? recruitmentInput.lastSummary
          : "Recruitment market not refreshed yet."
    },
    objectives: {
      active: activeObjectives,
      completed: completedObjectives,
      failed: failedObjectives,
      lastSummary:
        typeof objectivesInput.lastSummary === "string"
          ? objectivesInput.lastSummary
          : "Objective board not generated yet."
    },
    timeline: {
      year: Math.max(1, Math.round(Number(timelineInput.year) || resolvedTimeline.year)),
      seasonId: typeof timelineInput.seasonId === "string" ? timelineInput.seasonId : resolvedTimeline.seasonId,
      seasonLabel: typeof timelineInput.seasonLabel === "string" ? timelineInput.seasonLabel : resolvedTimeline.seasonLabel,
      dayOfSeason: Math.max(1, Math.min(SEASON_LENGTH, Math.round(Number(timelineInput.dayOfSeason) || resolvedTimeline.dayOfSeason))),
      weekOfSeason: Math.max(1, Math.min(4, Math.round(Number(timelineInput.weekOfSeason) || resolvedTimeline.weekOfSeason))),
      dayOfYear: Math.max(1, Math.min(YEAR_LENGTH, Math.round(Number(timelineInput.dayOfYear) || resolvedTimeline.dayOfYear))),
      lastTransitionDay: Math.max(1, Math.round(Number(timelineInput.lastTransitionDay) || resolvedTimeline.day)),
      lastTransitionNote:
        typeof timelineInput.lastTransitionNote === "string"
          ? timelineInput.lastTransitionNote
          : `Season baseline: ${resolvedTimeline.seasonLabel}.`
    },
    planningContext:
      input.planningContext && typeof input.planningContext === "object"
        ? {
            sourceDay: Math.max(1, Math.round(Number(input.planningContext.sourceDay) || Math.max(1, Math.round(Number(currentDay) || 1)))),
            contractVersion: Math.max(1, Math.round(Number(input.planningContext.contractVersion) || 1)),
            locationId: typeof input.planningContext.locationId === "string" ? input.planningContext.locationId : activeLocationId,
            compliance: Math.max(0, Math.min(100, Math.round(Number(input.planningContext.compliance) || 0))),
            supplierVolatility: Math.max(0, Math.min(100, Math.round(Number(input.planningContext.supplierVolatility) || 0))),
            rivalPressurePct: Math.max(0, Math.min(100, Math.round(Number(input.planningContext.rivalPressurePct) || 0))),
            eventRiskTag:
              typeof input.planningContext.eventRiskTag === "string"
                ? input.planningContext.eventRiskTag
                : "No immediate calendar risk signal.",
            recommendations:
              input.planningContext.recommendations && typeof input.planningContext.recommendations === "object"
                ? { ...input.planningContext.recommendations }
                : {},
            summary:
              typeof input.planningContext.summary === "string"
                ? input.planningContext.summary
                : "Planning context pending world-layer sync."
          }
        : {
            sourceDay: Math.max(1, Math.round(Number(currentDay) || 1)),
            contractVersion: 1,
            locationId: activeLocationId,
            compliance: 0,
            supplierVolatility: 0,
            rivalPressurePct: 0,
            eventRiskTag: "Planning context pending world-layer sync.",
            recommendations: {},
            summary: "Planning context pending world-layer sync."
          },
    commandBoard: {
      currentSection,
      categoryFilter:
        typeof commandBoardInput.categoryFilter === "string" && commandBoardInput.categoryFilter.length > 0
          ? commandBoardInput.categoryFilter
          : "all",
      urgencyFilter:
        typeof commandBoardInput.urgencyFilter === "string" && commandBoardInput.urgencyFilter.length > 0
          ? commandBoardInput.urgencyFilter
          : "all",
      unreadCount,
      lastGeneratedDay: Math.max(0, Math.round(Number(commandBoardInput.lastGeneratedDay) || 0)),
      lastSummary:
        typeof commandBoardInput.lastSummary === "string"
          ? commandBoardInput.lastSummary
          : "Command board idle. No directives published yet.",
      messages: commandMessages
    },
    delegation: {
      roles: {
        head_chef: normalizeDelegationRole(
          "head_chef",
          "Head Chef",
          delegationRolesInput.head_chef,
          { procurement: true, menuFallback: true, qualityChecks: true }
        ),
        floor_manager: normalizeDelegationRole(
          "floor_manager",
          "Floor Manager",
          delegationRolesInput.floor_manager,
          { rotaTuning: true, fatigueControl: true, serviceRecovery: true }
        ),
        clerk: normalizeDelegationRole(
          "clerk",
          "Clerk",
          delegationRolesInput.clerk,
          { complianceFilings: true, stockPaperwork: true, contractReminders: true }
        )
      },
      auditTrail: delegationAudit,
      lastRunDay: Math.max(0, Math.round(Number(delegationInput.lastRunDay) || 0)),
      lastRunSummary:
        typeof delegationInput.lastRunSummary === "string"
          ? delegationInput.lastRunSummary
          : "Delegation desk idle."
    },
    analytics: {
      history: analyticsHistory,
      dailySummary: {
        conversionPct: Math.max(0, Math.min(100, Math.round(Number(dailySummaryInput.conversionPct) || 0))),
        retentionPct: Math.max(0, Math.min(100, Math.round(Number(dailySummaryInput.retentionPct) || 0))),
        marginPct: Math.max(-100, Math.min(100, Math.round(Number(dailySummaryInput.marginPct) || 0))),
        avgSpend: Math.max(0, Number(dailySummaryInput.avgSpend) || 0),
        guests: Math.max(0, Math.round(Number(dailySummaryInput.guests) || 0)),
        revenue: Math.max(0, Math.round(Number(dailySummaryInput.revenue) || 0)),
        net: Math.round(Number(dailySummaryInput.net) || 0)
      },
      deltas:
        analyticsInput.deltas && typeof analyticsInput.deltas === "object"
          ? {
              conversionPct: Math.round(Number(analyticsInput.deltas.conversionPct) || 0),
              retentionPct: Math.round(Number(analyticsInput.deltas.retentionPct) || 0),
              marginPct: Math.round(Number(analyticsInput.deltas.marginPct) || 0),
              avgSpend: Number(analyticsInput.deltas.avgSpend) || 0
            }
          : { conversionPct: 0, retentionPct: 0, marginPct: 0, avgSpend: 0 },
      menuItemMargins:
        analyticsInput.menuItemMargins && typeof analyticsInput.menuItemMargins === "object"
          ? {
              ale: Math.round(Number(analyticsInput.menuItemMargins.ale) || 0),
              mead: Math.round(Number(analyticsInput.menuItemMargins.mead) || 0),
              stew: Math.round(Number(analyticsInput.menuItemMargins.stew) || 0),
              bread: Math.round(Number(analyticsInput.menuItemMargins.bread) || 0),
              room: Math.round(Number(analyticsInput.menuItemMargins.room) || 0)
            }
          : { ale: 0, mead: 0, stew: 0, bread: 0, room: 0 },
      anomalyNotes: Array.isArray(analyticsInput.anomalyNotes)
        ? analyticsInput.anomalyNotes.map((entry) => `${entry}`).slice(0, 8)
        : [],
      lastUpdatedDay: Math.max(0, Math.round(Number(analyticsInput.lastUpdatedDay) || 0))
    },
    scouting: {
      scoutQuality: Math.max(20, Math.min(100, Math.round(Number(scoutingInput.scoutQuality) || 52))),
      reports: scoutingReports,
      rumors: scoutingRumors,
      filters: {
        targetType:
          typeof scoutingFiltersInput.targetType === "string" && scoutingFiltersInput.targetType.length > 0
            ? scoutingFiltersInput.targetType
            : "all",
        rumorStatus:
          typeof scoutingFiltersInput.rumorStatus === "string" && scoutingFiltersInput.rumorStatus.length > 0
            ? scoutingFiltersInput.rumorStatus
            : "active"
      },
      lastSummary:
        typeof scoutingInput.lastSummary === "string"
          ? scoutingInput.lastSummary
          : "Scouting desk is awaiting assignments.",
      nextRumorDay: Math.max(1, Math.round(Number(scoutingInput.nextRumorDay) || Math.max(2, Number(currentDay) + 1)))
    }
  };
}

function resolveStartingLocation(locationId) {
  if (typeof locationId === "string" && STARTING_LOCATION_PROFILES[locationId]) {
    return STARTING_LOCATION_PROFILES[locationId];
  }
  return STARTING_LOCATION_PROFILES[DEFAULT_STARTING_LOCATION];
}

function resolveDistrictForLocation(locationId) {
  const location = resolveStartingLocation(locationId);
  if (location.homeDistrictId && DISTRICT_PROFILES[location.homeDistrictId]) {
    return DISTRICT_PROFILES[location.homeDistrictId];
  }
  const fallbackDistrict = Object.values(DISTRICT_PROFILES).find(
    (district) => district.locationId === location.id
  );
  return fallbackDistrict || Object.values(DISTRICT_PROFILES)[0];
}

function resolveDistrict(districtId, fallbackLocationId = DEFAULT_STARTING_LOCATION) {
  if (typeof districtId === "string" && DISTRICT_PROFILES[districtId]) {
    return DISTRICT_PROFILES[districtId];
  }
  return resolveDistrictForLocation(fallbackLocationId);
}

function listStartingLocations() {
  return Object.values(STARTING_LOCATION_PROFILES).map((profile) => ({
    id: profile.id,
    label: profile.label,
    title: profile.title,
    summary: profile.summary
  }));
}

function listDistricts() {
  return Object.values(DISTRICT_PROFILES).map((district) => {
    const location = resolveStartingLocation(district.locationId);
    return {
      id: district.id,
      label: district.label,
      locationId: district.locationId,
      locationLabel: location.label,
      summary: district.summary,
      rivalTaverns: district.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      }))
    };
  });
}

function createWorldActors(locationId, districtId, currentActors = null) {
  const district = resolveDistrict(districtId, locationId);
  const locationBias = LOCATION_ACTOR_STANDING_BIAS[locationId] || {};
  const districtInfluence = district.actorInfluence || {};
  const actors = {};

  Object.values(WORLD_ACTOR_PROFILES).forEach((profile) => {
    const actorId = profile.id;
    const source = currentActors && typeof currentActors === "object" ? currentActors[actorId] : null;
    const sourceStanding = source && Number.isFinite(source.standing) ? source.standing : null;
    const sourceLastShift = source && Number.isFinite(source.lastShift) ? source.lastShift : 0;
    const baselineStanding = profile.baseStanding + (locationBias[actorId] || 0);
    const influence = profile.baseInfluence * (districtInfluence[actorId] || 1);

    actors[actorId] = {
      id: actorId,
      label: profile.label,
      summary: profile.summary,
      standing: Math.max(0, Math.min(100, Math.round(sourceStanding ?? baselineStanding))),
      influence: Math.max(5, Math.min(100, Math.round(influence))),
      lastShift: Math.max(-20, Math.min(20, Math.round(sourceLastShift)))
    };
  });

  return actors;
}

function createWorldEffectState(existing = null) {
  const input = existing && typeof existing === "object" ? existing : {};
  const readNumber = (key, fallback = 0) => {
    const value = Number(input[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    supplyCostDays: Math.max(0, Math.round(readNumber("supplyCostDays"))),
    supplyCostMult: Math.max(0.5, Math.min(1.7, readNumber("supplyCostMult", 1))),
    supplyReliabilityDays: Math.max(0, Math.round(readNumber("supplyReliabilityDays"))),
    supplyReliabilityMult: Math.max(0.45, Math.min(1.5, readNumber("supplyReliabilityMult", 1))),
    demandDays: Math.max(0, Math.round(readNumber("demandDays"))),
    demandMult: Math.max(0.7, Math.min(1.45, readNumber("demandMult", 1))),
    taxFlatDays: Math.max(0, Math.round(readNumber("taxFlatDays"))),
    taxFlatBonus: Math.max(-10, Math.min(35, Math.round(readNumber("taxFlatBonus")))),
    eventRiskDays: Math.max(0, Math.round(readNumber("eventRiskDays"))),
    eventChanceMult: Math.max(0.6, Math.min(1.6, readNumber("eventChanceMult", 1)))
  };
}

function normalizeCrownHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    type: typeof entry.type === "string" ? entry.type : "unknown",
    amount: Math.max(0, Math.round(Number(entry.amount) || 0)),
    status: typeof entry.status === "string" ? entry.status : "logged",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createCrownAuthorityState(existing = null) {
  const current = existing && typeof existing === "object" ? existing : {};
  const cadenceDays = Math.max(3, Math.min(14, Math.round(Number(current.cadenceDays) || 7)));
  const historyInput = Array.isArray(current.history) ? current.history : [];
  const history = historyInput
    .map((entry) => normalizeCrownHistoryEntry(entry))
    .filter(Boolean)
    .slice(0, 36);

  return {
    cadenceDays,
    nextCollectionDay: Math.max(cadenceDays, Math.round(Number(current.nextCollectionDay) || cadenceDays)),
    pendingTax: Math.max(0, Math.round(Number(current.pendingTax) || 0)),
    arrears: Math.max(0, Math.round(Number(current.arrears) || 0)),
    complianceScore: Math.max(0, Math.min(100, Math.round(Number(current.complianceScore) || 64))),
    lastAuditDay: Math.max(0, Math.round(Number(current.lastAuditDay) || 0)),
    auditPasses: Math.max(0, Math.round(Number(current.auditPasses) || 0)),
    auditFailures: Math.max(0, Math.round(Number(current.auditFailures) || 0)),
    history
  };
}

function getDistrictSupplyProfile(districtId) {
  if (districtId.includes("arcanum")) {
    if (districtId.includes("docks")) {
      return { stockMult: 1.24, priceBias: 1.06, restockMult: 1.2 };
    }
    return { stockMult: 1.16, priceBias: 1.14, restockMult: 1.1 };
  }
  if (districtId.includes("wharf")) {
    return { stockMult: 0.94, priceBias: 0.97, restockMult: 1.02 };
  }
  return { stockMult: 0.82, priceBias: 1, restockMult: 0.88 };
}

function createDistrictMarketStock(districtId, existingStock = null) {
  const profile = getDistrictSupplyProfile(districtId);
  const output = {};
  Object.keys(SUPPLY_META).forEach((item) => {
    const base =
      item === "wood"
        ? 42
        : item === "bread"
          ? 30
          : item === "honey"
            ? 20
            : 28;
    const next = existingStock && Number.isFinite(existingStock[item])
      ? Math.round(existingStock[item])
      : Math.round(base * profile.stockMult);
    output[item] = Math.max(0, Math.min(150, next));
  });
  return output;
}

function createSupplierNetworkState(existing = null, activeLocationId = DEFAULT_STARTING_LOCATION) {
  const current = existing && typeof existing === "object" ? existing : {};
  const baseVolatility = activeLocationId === "arcanum" ? 24 : 36;
  const markets = {};
  Object.values(DISTRICT_PROFILES).forEach((district) => {
    const currentMarket =
      current.markets && typeof current.markets === "object" ? current.markets[district.id] : null;
    const districtProfile = getDistrictSupplyProfile(district.id);
    const stock = createDistrictMarketStock(
      district.id,
      currentMarket && typeof currentMarket === "object" ? currentMarket.stock : null
    );
    markets[district.id] = {
      districtId: district.id,
      priceBias: Math.max(
        0.72,
        Math.min(
          1.5,
          Number(currentMarket && currentMarket.priceBias) || districtProfile.priceBias
        )
      ),
      restockMult: Math.max(
        0.55,
        Math.min(
          1.6,
          Number(currentMarket && currentMarket.restockMult) || districtProfile.restockMult
        )
      ),
      stock
    };
  });

  const contracts = current.contracts && typeof current.contracts === "object" ? current.contracts : {};
  const merchant = current.merchant && typeof current.merchant === "object" ? current.merchant : {};
  const caravan = current.caravan && typeof current.caravan === "object" ? current.caravan : {};
  const stockRun = current.stockRun && typeof current.stockRun === "object" ? current.stockRun : {};

  return {
    volatility: Math.max(5, Math.min(95, Math.round(Number(current.volatility) || baseVolatility))),
    markets,
    contracts: {
      localBrokerDays: Math.max(0, Math.round(Number(contracts.localBrokerDays) || 0)),
      arcanumWholesaleDays: Math.max(0, Math.round(Number(contracts.arcanumWholesaleDays) || 0))
    },
    merchant: {
      daysUntilVisit: Math.max(0, Math.round(Number(merchant.daysUntilVisit) || 4)),
      visitWindowDays: Math.max(0, Math.round(Number(merchant.visitWindowDays) || 0)),
      targetDistrict:
        typeof merchant.targetDistrict === "string" && DISTRICT_PROFILES[merchant.targetDistrict]
          ? merchant.targetDistrict
          : activeLocationId === "arcanum"
            ? "arcanum_market"
            : "meadowbrook_square"
    },
    caravan: {
      daysUntilWindow: Math.max(0, Math.round(Number(caravan.daysUntilWindow) || 3)),
      windowDays: Math.max(0, Math.round(Number(caravan.windowDays) || 0)),
      targetDistrict:
        typeof caravan.targetDistrict === "string" && DISTRICT_PROFILES[caravan.targetDistrict]
          ? caravan.targetDistrict
          : activeLocationId === "arcanum"
            ? "arcanum_docks"
            : "meadowbrook_wharf"
    },
    stockRun: {
      daysRemaining: Math.max(0, Math.round(Number(stockRun.daysRemaining) || 0)),
      targetDistrict:
        typeof stockRun.targetDistrict === "string" && DISTRICT_PROFILES[stockRun.targetDistrict]
          ? stockRun.targetDistrict
          : "arcanum_market",
      assignedStaffId: typeof stockRun.assignedStaffId === "string" ? stockRun.assignedStaffId : "",
      bundleScale: Math.max(0.8, Math.min(1.8, Number(stockRun.bundleScale) || 1))
    },
    lastSupplyEvent:
      typeof current.lastSupplyEvent === "string"
        ? current.lastSupplyEvent
        : "Markets stable. No active merchant windfall.",
    history: Array.isArray(current.history)
      ? current.history
          .filter((entry) => entry && typeof entry === "object")
          .slice(0, 32)
          .map((entry) => ({
            day: Math.max(1, Math.round(Number(entry.day) || 1)),
            type: typeof entry.type === "string" ? entry.type : "note",
            note: typeof entry.note === "string" ? entry.note : ""
          }))
      : []
  };
}

function normalizeActorEventEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    actorId: typeof entry.actorId === "string" ? entry.actorId : "",
    label: typeof entry.label === "string" ? entry.label : "",
    tone: entry.tone === "good" || entry.tone === "bad" ? entry.tone : "neutral",
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    summary: typeof entry.summary === "string" ? entry.summary : ""
  };
}

function listWorldActors() {
  normalizeWorldState();
  return Object.values(state.world.actors || {}).map((actor) => ({
    id: actor.id,
    label: actor.label,
    summary: actor.summary,
    standing: actor.standing,
    influence: actor.influence,
    lastShift: actor.lastShift
  }));
}

function getCrownAuthorityStatus() {
  normalizeWorldState();
  const crown = state.world.crown;
  return {
    cadenceDays: crown.cadenceDays,
    nextCollectionDay: crown.nextCollectionDay,
    pendingTax: crown.pendingTax,
    arrears: crown.arrears,
    complianceScore: crown.complianceScore,
    lastAuditDay: crown.lastAuditDay,
    auditPasses: crown.auditPasses,
    auditFailures: crown.auditFailures,
    history: crown.history.map((entry) => ({ ...entry }))
  };
}

function getSupplierNetworkStatus() {
  normalizeWorldState();
  const suppliers = state.world.suppliers;
  const districtId = state.world.currentDistrict;
  const market = suppliers.markets[districtId];
  const available = market ? market.stock : {};
  return {
    volatility: suppliers.volatility,
    contracts: { ...suppliers.contracts },
    merchant: { ...suppliers.merchant },
    caravan: { ...suppliers.caravan },
    stockRun: { ...suppliers.stockRun },
    lastSupplyEvent: suppliers.lastSupplyEvent,
    market: {
      districtId,
      priceBias: market ? market.priceBias : 1,
      restockMult: market ? market.restockMult : 1,
      available: { ...available }
    },
    history: suppliers.history.map((entry) => ({ ...entry }))
  };
}

function normalizeRivalHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    districtId:
      typeof entry.districtId === "string" && DISTRICT_PROFILES[entry.districtId]
        ? entry.districtId
        : "arcanum_market",
    tone: entry.tone === "good" || entry.tone === "bad" ? entry.tone : "neutral",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createDistrictRivalState(district, existingDistrictState = null) {
  const current = existingDistrictState && typeof existingDistrictState === "object" ? existingDistrictState : {};
  const byId = {};
  if (Array.isArray(current.taverns)) {
    current.taverns.forEach((entry) => {
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        byId[entry.id] = entry;
      }
    });
  }

  const taverns = district.rivalTaverns.map((rival) => {
    const source = byId[rival.id] || {};
    const basePressure = clamp(Number(rival.pressure) || 0.08, 0.03, 0.6);
    const defaultPressure = clamp(basePressure, 0.02, 0.62);
    return {
      id: rival.id,
      name: rival.name,
      basePressure,
      currentPressure: clamp(Number(source.currentPressure) || defaultPressure, 0.02, 0.7),
      priceAggression: clamp(Math.round(Number(source.priceAggression) || (44 + basePressure * 95)), 5, 95),
      reputationHeat: clamp(Math.round(Number(source.reputationHeat) || (42 + basePressure * 90)), 5, 95),
      momentum: clamp(Math.round(Number(source.momentum) || 0), -20, 20),
      lastMove: typeof source.lastMove === "string" ? source.lastMove : "Quiet service day."
    };
  });

  const avgBasePressure =
    taverns.length > 0 ? taverns.reduce((sum, tavern) => sum + tavern.basePressure, 0) / taverns.length : 0;
  const demandPressure = clamp(
    Number(current.demandPressure) || avgBasePressure,
    0,
    0.75
  );
  const pricePressure = clamp(
    Number(current.pricePressure) || avgBasePressure * 0.7,
    0,
    0.72
  );
  const reputationPressure = clamp(
    Number(current.reputationPressure) || avgBasePressure * 0.55,
    0,
    0.56
  );
  const lastEvent =
    typeof current.lastEvent === "string"
      ? current.lastEvent
      : "Rival taverns held steady. No direct pressure swing today.";

  return {
    districtId: district.id,
    taverns,
    demandPressure,
    pricePressure,
    reputationPressure,
    lastEvent
  };
}

function createRivalSimulationState(existing = null, activeDistrictId = "arcanum_market") {
  const current = existing && typeof existing === "object" ? existing : {};
  const sourceDistricts = current.districts && typeof current.districts === "object" ? current.districts : {};
  const districts = {};

  Object.values(DISTRICT_PROFILES).forEach((district) => {
    districts[district.id] = createDistrictRivalState(district, sourceDistricts[district.id]);
  });

  const resolvedDistrictId =
    typeof activeDistrictId === "string" && districts[activeDistrictId]
      ? activeDistrictId
      : Object.keys(districts)[0];
  const activeDistrict = districts[resolvedDistrictId];
  const lastRivalEvent =
    typeof current.lastRivalEvent === "string" && current.lastRivalEvent.length > 0
      ? current.lastRivalEvent
      : activeDistrict.lastEvent;
  const history = Array.isArray(current.history)
    ? current.history
        .map((entry) => normalizeRivalHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 48)
    : [];

  return {
    activeDistrictId: resolvedDistrictId,
    districts,
    lastRivalEvent,
    history
  };
}

function getRivalStatus() {
  normalizeWorldState();
  const rivals = state.world.rivals;
  const districtId = state.world.currentDistrict;
  const districtState = rivals.districts[districtId];
  return {
    districtId,
    lastRivalEvent: rivals.lastRivalEvent,
    demandPressure: districtState ? districtState.demandPressure : 0,
    pricePressure: districtState ? districtState.pricePressure : 0,
    reputationPressure: districtState ? districtState.reputationPressure : 0,
    taverns: districtState ? districtState.taverns.map((entry) => ({ ...entry })) : [],
    history: rivals.history.map((entry) => ({ ...entry }))
  };
}

function recordRivalHistory(note, tone = "neutral") {
  const rivals = state.world.rivals;
  rivals.history.unshift({
    day: state.day,
    districtId: state.world.currentDistrict,
    tone: tone === "good" || tone === "bad" ? tone : "neutral",
    note: typeof note === "string" ? note : ""
  });
  if (rivals.history.length > 48) {
    rivals.history.length = 48;
  }
}

function progressRivalTavernSimulation() {
  normalizeWorldState();
  const worldActors = getWorldActors();
  const rivals = state.world.rivals;
  const districtId = state.world.currentDistrict;
  const districtState = rivals.districts[districtId];

  if (!districtState || districtState.taverns.length === 0) {
    const summary = "No established rival taverns in this district.";
    rivals.activeDistrictId = districtId;
    rivals.lastRivalEvent = summary;
    return summary;
  }

  const merchants = worldActors.merchant_houses;
  const council = worldActors.civic_council;
  const merchantTension = merchants ? clamp((52 - merchants.standing) / 100, -0.18, 0.28) : 0;
  const councilTension = council ? clamp((50 - council.standing) / 100, -0.15, 0.24) : 0;

  let demandAction = 0;
  let priceAction = 0;
  let reputationAction = 0;
  let badMoves = 0;
  let goodMoves = 0;
  let strongestMove = { weight: -1, text: "", tone: "neutral" };

  districtState.taverns.forEach((tavern) => {
    const momentumDrift =
      randInt(-6, 6) +
      Math.round(merchantTension * 12) +
      Math.round(councilTension * 8);
    tavern.momentum = clamp(tavern.momentum + momentumDrift, -20, 20);
    tavern.currentPressure = clamp(
      tavern.basePressure + tavern.momentum / 220 + randInt(-4, 4) / 240,
      0.02,
      0.72
    );

    const actionChance = clamp(
      0.2 + tavern.currentPressure * 0.84 + Math.max(0, merchantTension) * 0.16,
      0.12,
      0.78
    );
    if (random.nextFloat() > actionChance) {
      tavern.lastMove = "Quiet service day.";
      return;
    }

    const roll = random.nextFloat();
    let weight = 0;
    let moveText = "";
    let tone = "neutral";

    if (roll < 0.34) {
      const intensity = clamp(tavern.currentPressure + randInt(2, 8) / 100, 0.06, 0.34);
      demandAction += intensity * 0.42;
      priceAction += intensity * 0.66;
      tavern.priceAggression = clamp(tavern.priceAggression + randInt(5, 11), 5, 95);
      tavern.reputationHeat = clamp(tavern.reputationHeat + randInt(-2, 3), 5, 95);
      moveText = `${tavern.name} launched a discount blitz across nearby streets.`;
      tavern.lastMove = "Discount blitz";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else if (roll < 0.62) {
      const intensity = clamp(tavern.currentPressure + randInt(1, 7) / 100, 0.05, 0.3);
      demandAction += intensity * 0.58;
      tavern.momentum = clamp(tavern.momentum + randInt(1, 4), -20, 20);
      moveText = `${tavern.name} staged a noisy showcase and pulled extra footfall.`;
      tavern.lastMove = "Street showcase";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else if (roll < 0.84) {
      const intensity = clamp(tavern.currentPressure + randInt(1, 6) / 120, 0.04, 0.26);
      reputationAction += intensity * 0.72;
      tavern.reputationHeat = clamp(tavern.reputationHeat + randInt(6, 12), 5, 95);
      moveText = `${tavern.name} pushed rumor chatter to challenge your standing.`;
      tavern.lastMove = "Rumor campaign";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else {
      const stumble = clamp(tavern.currentPressure + randInt(2, 7) / 120, 0.05, 0.28);
      demandAction -= stumble * 0.4;
      priceAction -= stumble * 0.26;
      reputationAction -= stumble * 0.22;
      tavern.momentum = clamp(tavern.momentum - randInt(3, 7), -20, 20);
      tavern.reputationHeat = clamp(tavern.reputationHeat - randInt(5, 10), 5, 95);
      moveText = `${tavern.name} suffered a rough service run and lost momentum.`;
      tavern.lastMove = "Service stumble";
      goodMoves += 1;
      tone = "good";
      weight = stumble;
    }

    if (weight > strongestMove.weight) {
      strongestMove = { weight, text: moveText, tone };
    }
  });

  const avgPressure =
    districtState.taverns.reduce((sum, tavern) => sum + tavern.currentPressure, 0) /
    Math.max(1, districtState.taverns.length);
  districtState.demandPressure = clamp(avgPressure * 0.74 + demandAction, 0.02, 0.76);
  districtState.pricePressure = clamp(avgPressure * 0.56 + priceAction + districtState.demandPressure * 0.14, 0, 0.74);
  districtState.reputationPressure = clamp(avgPressure * 0.42 + reputationAction, 0, 0.56);

  let summary = "";
  let tone = "neutral";
  if (strongestMove.weight > 0) {
    if (badMoves > goodMoves) {
      summary = `Rival pressure rising in ${resolveDistrict(districtId).label}: ${strongestMove.text}`;
      tone = "bad";
    } else if (goodMoves > badMoves) {
      summary = `Rival setback in ${resolveDistrict(districtId).label}: ${strongestMove.text}`;
      tone = "good";
    } else {
      summary = `Rival climate mixed: ${strongestMove.text}`;
      tone = strongestMove.tone;
    }
  } else if (districtState.demandPressure >= 0.4) {
    summary = "Rival taverns maintained heavy pressure, but no single move dominated the day.";
    tone = "bad";
  } else {
    summary = "Rival taverns held steady. No direct pressure swing today.";
    tone = "neutral";
  }

  districtState.lastEvent = summary;
  rivals.activeDistrictId = districtId;
  rivals.lastRivalEvent = summary;
  recordRivalHistory(summary, tone);
  if (tone !== "neutral") {
    logLine(summary, tone);
  }
  return summary;
}

function normalizeReputationHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    type: typeof entry.type === "string" ? entry.type : "daily",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createWorldReputationState(existing = null, locationId = DEFAULT_STARTING_LOCATION, actors = null, crownCompliance = 64) {
  const current = existing && typeof existing === "object" ? existing : {};
  const existingCohorts = current.cohorts && typeof current.cohorts === "object" ? current.cohorts : {};
  const baseCohorts =
    locationId === "arcanum"
      ? { locals: 48, merchants: 56, nobles: 58, adventurers: 52 }
      : { locals: 56, merchants: 47, nobles: 45, adventurers: 50 };

  const cohorts = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    const fallback = Number(baseCohorts[cohortId] || 50);
    const source = Number(existingCohorts[cohortId]);
    cohorts[cohortId] = clamp(Math.round(Number.isFinite(source) ? source : fallback), 0, 100);
  });

  const existingGroups = current.groups && typeof current.groups === "object" ? current.groups : {};
  const groups = {};
  Object.values(WORLD_ACTOR_PROFILES).forEach((actorProfile) => {
    const actorId = actorProfile.id;
    const source = existingGroups[actorId] && typeof existingGroups[actorId] === "object" ? existingGroups[actorId] : {};
    const actorStanding =
      actors &&
      actors[actorId] &&
      Number.isFinite(actors[actorId].standing)
        ? actors[actorId].standing
        : 50;
    const fallbackScore =
      actorId === "crown_office"
        ? Math.round(actorStanding * 0.62 + Number(crownCompliance || 64) * 0.38)
        : actorStanding;
    groups[actorId] = {
      score: clamp(Math.round(Number(source.score) || fallbackScore), 0, 100),
      lastShift: clamp(Math.round(Number(source.lastShift) || 0), -20, 20)
    };
  });

  const complianceStandingSource = Number(current.crownComplianceStanding);
  const crownComplianceStanding = clamp(
    Math.round(Number.isFinite(complianceStandingSource) ? complianceStandingSource : Number(crownCompliance || 64)),
    0,
    100
  );

  const history = Array.isArray(current.history)
    ? current.history
        .map((entry) => normalizeReputationHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 48)
    : [];

  return {
    cohorts,
    groups,
    crownComplianceStanding,
    lastSummary:
      typeof current.lastSummary === "string"
        ? current.lastSummary
        : "World reputation baseline set. Cohorts and group standings are stable.",
    history
  };
}

function normalizeWorldWeeklyHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    week: Math.max(1, Math.round(Number(entry.week) || 1)),
    startDay: Math.max(1, Math.round(Number(entry.startDay) || 1)),
    endDay: Math.max(1, Math.round(Number(entry.endDay) || 1)),
    avgGuests: Math.max(0, Math.round(Number(entry.avgGuests) || 0)),
    avgNet: Math.round(Number(entry.avgNet) || 0),
    crownTaxAccrued: Math.max(0, Math.round(Number(entry.crownTaxAccrued) || 0)),
    crownTaxPaid: Math.max(0, Math.round(Number(entry.crownTaxPaid) || 0)),
    eventfulDays: Math.max(0, Math.min(7, Math.round(Number(entry.eventfulDays) || 0))),
    supplierStrainDays: Math.max(0, Math.min(7, Math.round(Number(entry.supplierStrainDays) || 0))),
    rivalHighPressureDays: Math.max(0, Math.min(7, Math.round(Number(entry.rivalHighPressureDays) || 0))),
    avgCompliance: Math.max(0, Math.min(100, Math.round(Number(entry.avgCompliance) || 0))),
    avgSupplierVolatility: Math.max(0, Math.min(100, Math.round(Number(entry.avgSupplierVolatility) || 0))),
    summary: typeof entry.summary === "string" ? entry.summary : ""
  };
}

function createWorldReportingState(existing = null, currentDay = 1) {
  const day = Math.max(1, Math.round(Number(currentDay) || 1));
  const current = existing && typeof existing === "object" ? existing : {};
  const rolling = current.rollingWeek && typeof current.rollingWeek === "object" ? current.rollingWeek : {};
  const inferredStart = Math.max(1, day - ((day - 1) % 7));
  const startDay = Math.max(1, Math.round(Number(rolling.startDay) || inferredStart));
  const days = Math.max(0, Math.min(7, Math.round(Number(rolling.days) || 0)));

  const weeklyHistory = Array.isArray(current.weeklyHistory)
    ? current.weeklyHistory
        .map((entry) => normalizeWorldWeeklyHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    rollingWeek: {
      startDay,
      days,
      guestTotal: Math.max(0, Math.round(Number(rolling.guestTotal) || 0)),
      netTotal: Math.round(Number(rolling.netTotal) || 0),
      crownTaxAccruedTotal: Math.max(0, Math.round(Number(rolling.crownTaxAccruedTotal) || 0)),
      crownTaxPaidTotal: Math.max(0, Math.round(Number(rolling.crownTaxPaidTotal) || 0)),
      eventfulDays: Math.max(0, Math.min(7, Math.round(Number(rolling.eventfulDays) || 0))),
      supplierStrainDays: Math.max(0, Math.min(7, Math.round(Number(rolling.supplierStrainDays) || 0))),
      rivalHighPressureDays: Math.max(0, Math.min(7, Math.round(Number(rolling.rivalHighPressureDays) || 0))),
      complianceTotal: Math.max(0, Math.round(Number(rolling.complianceTotal) || 0)),
      supplierVolatilityTotal: Math.max(0, Math.round(Number(rolling.supplierVolatilityTotal) || 0))
    },
    weeklyHistory,
    lastWeeklySummary:
      typeof current.lastWeeklySummary === "string"
        ? current.lastWeeklySummary
        : "Week in progress. No world-layer weekly summary published yet."
  };
}

function updateWorldReportingState(daySnapshot) {
  const reporting = state.world.reporting;
  const rolling = reporting.rollingWeek;
  if (rolling.days === 0 && rolling.startDay > state.day) {
    rolling.startDay = state.day;
  }
  if (rolling.days >= 7) {
    rolling.startDay = state.day;
    rolling.days = 0;
    rolling.guestTotal = 0;
    rolling.netTotal = 0;
    rolling.crownTaxAccruedTotal = 0;
    rolling.crownTaxPaidTotal = 0;
    rolling.eventfulDays = 0;
    rolling.supplierStrainDays = 0;
    rolling.rivalHighPressureDays = 0;
    rolling.complianceTotal = 0;
    rolling.supplierVolatilityTotal = 0;
  }

  rolling.guestTotal += Math.max(0, Math.round(Number(daySnapshot.guests) || 0));
  rolling.netTotal += Math.round(Number(daySnapshot.net) || 0);
  rolling.crownTaxAccruedTotal += Math.max(0, Math.round(Number(daySnapshot.crownTaxAccrued) || 0));
  rolling.crownTaxPaidTotal += Math.max(0, Math.round(Number(daySnapshot.crownTaxPaid) || 0));
  rolling.complianceTotal += Math.max(0, Math.round(Number(daySnapshot.compliance) || 0));
  rolling.supplierVolatilityTotal += Math.max(0, Math.round(Number(daySnapshot.supplierVolatility) || 0));
  if (daySnapshot.eventSummary && !daySnapshot.eventSummary.includes("No major district or calendar event")) {
    rolling.eventfulDays += 1;
  }
  if (daySnapshot.supplierVolatility >= 68 || (daySnapshot.supplierSummary || "").includes("thin")) {
    rolling.supplierStrainDays += 1;
  }
  if (daySnapshot.rivalPressure >= 38) {
    rolling.rivalHighPressureDays += 1;
  }
  rolling.days += 1;

  const avgNet = Math.round(rolling.netTotal / Math.max(1, rolling.days));
  const avgGuests = Math.round(rolling.guestTotal / Math.max(1, rolling.days));
  const avgCompliance = Math.round(rolling.complianceTotal / Math.max(1, rolling.days));
  const avgSupplierVolatility = Math.round(rolling.supplierVolatilityTotal / Math.max(1, rolling.days));

  if (rolling.days >= 7) {
    const weekNumber =
      reporting.weeklyHistory.length > 0
        ? reporting.weeklyHistory[0].week + 1
        : 1;
    const summary =
      `Week ${weekNumber} (D${rolling.startDay}-D${state.day}): avg ${avgGuests} guests/day, avg net ${formatCoin(avgNet)}, ` +
      `Crown accrued ${formatCoin(rolling.crownTaxAccruedTotal)} paid ${formatCoin(rolling.crownTaxPaidTotal)}, ` +
      `${rolling.eventfulDays} eventful days, supplier strain ${rolling.supplierStrainDays}d, rival pressure ${rolling.rivalHighPressureDays}d.`;
    reporting.weeklyHistory.unshift({
      week: weekNumber,
      startDay: rolling.startDay,
      endDay: state.day,
      avgGuests,
      avgNet,
      crownTaxAccrued: rolling.crownTaxAccruedTotal,
      crownTaxPaid: rolling.crownTaxPaidTotal,
      eventfulDays: rolling.eventfulDays,
      supplierStrainDays: rolling.supplierStrainDays,
      rivalHighPressureDays: rolling.rivalHighPressureDays,
      avgCompliance,
      avgSupplierVolatility,
      summary
    });
    if (reporting.weeklyHistory.length > 20) {
      reporting.weeklyHistory.length = 20;
    }
    reporting.lastWeeklySummary = summary;

    rolling.startDay = state.day + 1;
    rolling.days = 0;
    rolling.guestTotal = 0;
    rolling.netTotal = 0;
    rolling.crownTaxAccruedTotal = 0;
    rolling.crownTaxPaidTotal = 0;
    rolling.eventfulDays = 0;
    rolling.supplierStrainDays = 0;
    rolling.rivalHighPressureDays = 0;
    rolling.complianceTotal = 0;
    rolling.supplierVolatilityTotal = 0;

    return { weeklySummary: summary, weekClosed: true };
  }

  const progressSummary =
    `Week in progress (${rolling.days}/7): avg ${avgGuests} guests/day, avg net ${formatCoin(avgNet)}, ` +
    `events ${rolling.eventfulDays}d, supplier strain ${rolling.supplierStrainDays}d, rival pressure ${rolling.rivalHighPressureDays}d.`;
  reporting.lastWeeklySummary = progressSummary;
  return { weeklySummary: progressSummary, weekClosed: false };
}

function getWorldReputationStatus() {
  normalizeWorldState();
  const model = state.world.reputationModel;
  return {
    cohorts: { ...model.cohorts },
    groups: Object.fromEntries(
      Object.entries(model.groups).map(([actorId, entry]) => [actorId, { ...entry }])
    ),
    crownComplianceStanding: model.crownComplianceStanding,
    lastSummary: model.lastSummary,
    history: model.history.map((entry) => ({ ...entry }))
  };
}

function getWorldLayerStatus(options = null) {
  normalizeWorldState();
  const world = state.world;
  const report = state.lastReport || {};
  const locationProfile = getActiveLocationProfile();
  const districtProfile = getCurrentDistrictProfile();
  const worldMods = getWorldRuntimeModifiers();
  const crown = getCrownAuthorityStatus();
  const suppliers = getSupplierNetworkStatus();
  const rivals = getRivalStatus();
  const reputation = getWorldReputationStatus();
  const resolvedOptions = options && typeof options === "object" ? options : {};
  const outlookDays = Math.max(3, Math.min(14, Math.round(Number(resolvedOptions.outlookDays) || 7)));
  const eventCalendarOutlook = getEventCalendarOutlookModel(state, {
    days: outlookDays,
    startOffset: 1,
    eventChanceMult: clamp(
      locationProfile.eventChanceMult * districtProfile.eventChanceMult * worldMods.eventChanceMult,
      0.25,
      2.5
    ),
    eventWeights: locationProfile.eventWeights
  });
  return {
    day: state.day,
    contractVersion: 1,
    location: {
      id: world.activeLocation,
      label: world.locationLabel
    },
    district: {
      id: world.currentDistrict,
      label: world.currentDistrictLabel
    },
    travel: {
      daysRemaining: world.travelDaysRemaining,
      destinationId: world.travelDestination,
      destinationLabel: world.travelDestinationLabel
    },
    today: {
      events: report.events || "",
      actorEvent: report.actorEvent || "",
      supplierSummary: report.supplierSummary || "",
      rivalSummary: report.rivalSummary || "",
      reputationSummary: report.reputationSummary || "",
      crownSummary: report.crownSummary || "",
      worldLayerSummary: report.worldLayerSummary || "",
      weeklyWorldSummary: report.weeklyWorldSummary || world.reporting.lastWeeklySummary
    },
    handoffContract: {
      version: 1,
      generatedAtDay: state.day,
      locationProfile: {
        id: locationProfile.id,
        label: locationProfile.label,
        title: locationProfile.title,
        demandMult: locationProfile.demandMult,
        eventChanceMult: locationProfile.eventChanceMult,
        taxRate: locationProfile.taxRate,
        taxFlat: locationProfile.taxFlat,
        supplyCostMult: locationProfile.supplyCostMult,
        supplyQuantityMult: locationProfile.supplyQuantityMult,
        supplyReliability: locationProfile.supplyReliability
      },
      taxesCompliance: {
        cadenceDays: crown.cadenceDays,
        nextCollectionDay: crown.nextCollectionDay,
        pendingTax: crown.pendingTax,
        arrears: crown.arrears,
        complianceScore: crown.complianceScore,
        lastAuditDay: crown.lastAuditDay,
        auditPasses: crown.auditPasses,
        auditFailures: crown.auditFailures,
        currentTaxRate: clamp(locationProfile.taxRate + worldMods.taxRateBonus, 0.03, 0.36),
        currentTaxFlat: Math.max(0, locationProfile.taxFlat + worldMods.taxFlatBonus)
      },
      eventCalendarOutlook,
      supplierLogistics: {
        volatility: suppliers.volatility,
        contracts: { ...suppliers.contracts },
        merchant: { ...suppliers.merchant },
        caravan: { ...suppliers.caravan },
        stockRun: { ...suppliers.stockRun },
        market: {
          districtId: suppliers.market.districtId,
          priceBias: suppliers.market.priceBias,
          restockMult: suppliers.market.restockMult,
          available: { ...suppliers.market.available }
        },
        lastSupplyEvent: suppliers.lastSupplyEvent
      },
      rivalPressure: {
        districtId: rivals.districtId,
        demandPressure: rivals.demandPressure,
        pricePressure: rivals.pricePressure,
        reputationPressure: rivals.reputationPressure,
        activeRivals: rivals.taverns.map((entry) => ({
          id: entry.id,
          name: entry.name,
          currentPressure: entry.currentPressure,
          priceAggression: entry.priceAggression,
          reputationHeat: entry.reputationHeat,
          momentum: entry.momentum
        })),
        lastRivalEvent: rivals.lastRivalEvent
      },
      reputationStandings: {
        cohorts: { ...reputation.cohorts },
        groups: Object.fromEntries(
          Object.entries(reputation.groups).map(([groupId, entry]) => [groupId, { ...entry }])
        ),
        crownComplianceStanding: reputation.crownComplianceStanding,
        lastSummary: reputation.lastSummary
      }
    },
    reporting: {
      lastWeeklySummary: world.reporting.lastWeeklySummary,
      rollingWeek: { ...world.reporting.rollingWeek },
      weeklyHistory: world.reporting.weeklyHistory.map((entry) => ({ ...entry }))
    }
  };
}

function getManagerState() {
  const activeLocationId =
    state.world && typeof state.world === "object"
      ? state.world.activeLocation || state.world.startingLocation || DEFAULT_STARTING_LOCATION
      : DEFAULT_STARTING_LOCATION;
  state.manager = normalizeManagerState(state.manager, state.day, activeLocationId);
  return state.manager;
}

function refreshSeasonTimeline() {
  const manager = getManagerState();
  const previous = manager.timeline || resolveSeasonTimeline(state.day);
  const next = resolveSeasonTimeline(state.day);
  const seasonChanged = previous.seasonId !== next.seasonId || previous.year !== next.year;
  manager.timeline = {
    year: next.year,
    seasonId: next.seasonId,
    seasonLabel: next.seasonLabel,
    dayOfSeason: next.dayOfSeason,
    weekOfSeason: next.weekOfSeason,
    dayOfYear: next.dayOfYear,
    lastTransitionDay: seasonChanged ? state.day : previous.lastTransitionDay,
    lastTransitionNote: seasonChanged
      ? `Season shifted to ${next.seasonLabel} in Year ${next.year} (Day ${state.day}).`
      : previous.lastTransitionNote
  };
  if (seasonChanged) {
    if (next.seasonId === "winter") {
      setWorldEffect("supply_reliability", 2, 0.9);
      setWorldEffect("demand", 2, 0.94);
    } else if (next.seasonId === "harvest") {
      setWorldEffect("supply_reliability", 2, 1.08);
      setWorldEffect("demand", 2, 1.06);
    } else if (next.seasonId === "summer") {
      setWorldEffect("demand", 2, 1.04);
    }
  }
  return manager.timeline;
}

function derivePlanningGuidanceFromWorldLayer(worldLayer = null) {
  const layer = worldLayer && typeof worldLayer === "object" ? worldLayer : getWorldLayerStatus({ outlookDays: 7 });
  const timeline = getManagerState().timeline || resolveSeasonTimeline(layer.day);
  const handoff = layer.handoffContract && typeof layer.handoffContract === "object" ? layer.handoffContract : null;
  const taxes = handoff && handoff.taxesCompliance ? handoff.taxesCompliance : {};
  const suppliers = handoff && handoff.supplierLogistics ? handoff.supplierLogistics : {};
  const rivals = handoff && handoff.rivalPressure ? handoff.rivalPressure : {};
  const location = handoff && handoff.locationProfile ? handoff.locationProfile : {};
  const outlook = handoff && handoff.eventCalendarOutlook ? handoff.eventCalendarOutlook : {};
  const highlights = Array.isArray(outlook.highlights) ? outlook.highlights : [];
  const eventRiskTag =
    highlights.find((line) => typeof line === "string" && /levy|audit|flood|strike|storm/i.test(line)) ||
    highlights[0] ||
    "No immediate calendar risk signal.";
  const compliance = Math.max(0, Math.min(100, Math.round(Number(taxes.complianceScore) || 0)));
  const supplierVolatility = Math.max(0, Math.min(100, Math.round(Number(suppliers.volatility) || 0)));
  const rivalPressurePct = Math.max(
    0,
    Math.min(100, Math.round((Number(rivals.demandPressure) || 0) * 100))
  );
  const recommendedRisk =
    compliance < 52 ? "low" : supplierVolatility >= 66 ? "moderate" : "high";
  const recommendedPricing =
    rivalPressurePct >= 20 ? "value" : location.id === "arcanum" ? "premium" : "balanced";
  const recommendedProcurement =
    supplierVolatility >= 62 ? "stability" : location.id === "arcanum" ? "quality" : "cost_control";
  const recommendedMarketing =
    Number(location.demandMult) < 1 ? "growth" : compliance < 50 ? "steady" : "campaign";
  const recommendedLogistics =
    /Caravan/i.test(eventRiskTag) || supplierVolatility >= 58
      ? "caravan_watch"
      : location.id === "meadowbrook"
        ? "city_push"
        : "local";
  const seasonAdjusted = { ...{
    riskTolerance: recommendedRisk,
    pricingIntent: recommendedPricing,
    procurementIntent: recommendedProcurement,
    marketingIntent: recommendedMarketing,
    logisticsIntent: recommendedLogistics
  } };
  if (timeline.seasonId === "winter") {
    seasonAdjusted.procurementIntent = "stability";
    seasonAdjusted.marketingIntent = "steady";
    seasonAdjusted.riskTolerance = seasonAdjusted.riskTolerance === "high" ? "moderate" : seasonAdjusted.riskTolerance;
  } else if (timeline.seasonId === "harvest") {
    seasonAdjusted.marketingIntent = "campaign";
    seasonAdjusted.logisticsIntent = "caravan_watch";
  }

  return {
    sourceDay: layer.day,
    contractVersion: Math.max(1, Math.round(Number(layer.contractVersion) || 1)),
    locationId: typeof location.id === "string" ? location.id : DEFAULT_STARTING_LOCATION,
    compliance,
    supplierVolatility,
    rivalPressurePct,
    eventRiskTag,
    recommendations: {
      ...seasonAdjusted
    },
    summary:
      `World feed D${layer.day}: compliance ${compliance}, supplier vol ${supplierVolatility}, ` +
      `rival pressure ${rivalPressurePct}%, season ${timeline.seasonLabel}, signal "${eventRiskTag}".`
  };
}

function refreshPlanningContext(options = {}) {
  let manager = getManagerState();
  const guidance = derivePlanningGuidanceFromWorldLayer(getWorldLayerStatus({ outlookDays: 7 }));
  manager = getManagerState();
  manager.planningContext = guidance;
  if (options.overwriteDraft) {
    manager.planDraft.riskTolerance = guidance.recommendations.riskTolerance;
    manager.planDraft.pricingIntent = guidance.recommendations.pricingIntent;
    manager.planDraft.procurementIntent = guidance.recommendations.procurementIntent;
    manager.planDraft.marketingIntent = guidance.recommendations.marketingIntent;
    manager.planDraft.logisticsIntent = guidance.recommendations.logisticsIntent;
    manager.planDraft.note = `Week ${manager.weekIndex} focus: ${guidance.summary}`;
  }
  return guidance;
}

function messageUrgencyScore(urgency = "medium") {
  const index = MESSAGE_URGENCY_ORDER.indexOf(`${urgency}`);
  return index >= 0 ? MESSAGE_URGENCY_ORDER.length - index : 1;
}

function sortCommandMessages(messages = []) {
  messages.sort((a, b) => {
    const unreadA = a.read ? 0 : 1;
    const unreadB = b.read ? 0 : 1;
    if (unreadA !== unreadB) {
      return unreadB - unreadA;
    }
    const urgencyDiff = messageUrgencyScore(b.urgency) - messageUrgencyScore(a.urgency);
    if (urgencyDiff !== 0) {
      return urgencyDiff;
    }
    const dayDiff = (Number(b.day) || 0) - (Number(a.day) || 0);
    if (dayDiff !== 0) {
      return dayDiff;
    }
    return `${b.id}`.localeCompare(`${a.id}`);
  });
}

function buildRecommendationPayload(action, label, confidence, impact, tradeoff) {
  return {
    action: typeof action === "string" ? action : "",
    label: typeof label === "string" && label.length > 0 ? label : "Review",
    confidence: Math.max(0, Math.min(100, Math.round(Number(confidence) || 50))),
    impact: Math.max(0, Math.min(100, Math.round(Number(impact) || 50))),
    tradeoff:
      typeof tradeoff === "string" && tradeoff.length > 0
        ? tradeoff
        : "Balanced short-term and long-term impact."
  };
}

function postCommandMessage(payload = {}) {
  const manager = getManagerState();
  const board = manager.commandBoard;
  const message = normalizeManagerMessage(
    {
      ...payload,
      id: typeof payload.id === "string" && payload.id.length > 0 ? payload.id : random.randomId(12),
      day: Math.max(1, Math.round(Number(payload.day) || state.day)),
      expiresDay: Math.max(
        Math.max(1, Math.round(Number(payload.day) || state.day)),
        Math.round(Number(payload.expiresDay) || state.day + 3)
      ),
      recommendation: payload.recommendation || {}
    },
    board.messages.length,
    state.day
  );
  if (!message) {
    return null;
  }
  const duplicate = board.messages.find((entry) => {
    const sameDay = entry.day === message.day;
    const sameTitle = entry.title === message.title;
    const sameCategory = entry.category === message.category;
    return sameDay && sameTitle && sameCategory;
  });
  if (duplicate) {
    duplicate.summary = message.summary;
    duplicate.urgency = message.urgency;
    duplicate.read = false;
    duplicate.confidence = message.confidence;
    duplicate.impact = message.impact;
    duplicate.expiresDay = message.expiresDay;
    duplicate.recommendation = { ...message.recommendation };
    duplicate.linkedAction = message.linkedAction;
  } else {
    board.messages.push(message);
  }
  board.messages = board.messages.filter((entry) => entry.expiresDay >= state.day).slice(0, MAX_COMMAND_MESSAGES);
  sortCommandMessages(board.messages);
  board.unreadCount = board.messages.filter((entry) => !entry.read).length;
  board.lastGeneratedDay = state.day;
  board.lastSummary =
    board.messages.length > 0
      ? `${board.unreadCount} unread directives, top priority ${board.messages[0].urgency}.`
      : "Command board clear.";
  return message;
}

function setCommandBoardSection(section = "message_board") {
  const manager = getManagerState();
  const nextSection = MANAGER_TOOLING_SECTIONS.includes(`${section}`) ? `${section}` : "message_board";
  manager.commandBoard.currentSection = nextSection;
  render();
  return { ok: true, section: nextSection };
}

function setCommandBoardFilters(filters = {}) {
  const manager = getManagerState();
  if (filters.category !== undefined) {
    manager.commandBoard.categoryFilter =
      typeof filters.category === "string" && filters.category.length > 0 ? filters.category : "all";
  }
  if (filters.urgency !== undefined) {
    manager.commandBoard.urgencyFilter =
      typeof filters.urgency === "string" && filters.urgency.length > 0 ? filters.urgency : "all";
  }
  render();
  return {
    ok: true,
    categoryFilter: manager.commandBoard.categoryFilter,
    urgencyFilter: manager.commandBoard.urgencyFilter
  };
}

function markCommandMessageRead(messageId, read = true) {
  const actionWindow = requireActionWindow("mark_command_message");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  const manager = getManagerState();
  const message = manager.commandBoard.messages.find((entry) => entry.id === messageId);
  if (!message) {
    return { ok: false, error: "Command message not found." };
  }
  message.read = Boolean(read);
  manager.commandBoard.unreadCount = manager.commandBoard.messages.filter((entry) => !entry.read).length;
  sortCommandMessages(manager.commandBoard.messages);
  render();
  return { ok: true, unreadCount: manager.commandBoard.unreadCount };
}

function markAllCommandMessagesRead() {
  const actionWindow = requireActionWindow("mark_all_command_messages");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  const manager = getManagerState();
  manager.commandBoard.messages.forEach((entry) => {
    entry.read = true;
  });
  manager.commandBoard.unreadCount = 0;
  sortCommandMessages(manager.commandBoard.messages);
  render();
  return { ok: true };
}

function appendDelegationAudit(roleId, action, result, tone = "neutral", boundary = "day_start") {
  const manager = getManagerState();
  const audit = manager.delegation.auditTrail;
  audit.unshift({
    id: random.randomId(10),
    day: state.day,
    boundary,
    roleId,
    action,
    result,
    tone
  });
  if (audit.length > MAX_DELEGATION_AUDIT_ENTRIES) {
    audit.length = MAX_DELEGATION_AUDIT_ENTRIES;
  }
}

function setDelegationRoleEnabled(roleId, enabled = false) {
  const actionWindow = requireActionWindow("set_delegation_role");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  const manager = getManagerState();
  const role = manager.delegation.roles[roleId];
  if (!role) {
    return { ok: false, error: `Unknown delegation role: ${roleId}.` };
  }
  role.enabled = Boolean(enabled);
  role.note = role.enabled ? "Automation active." : "Manual control.";
  appendDelegationAudit(
    roleId,
    "role_toggle",
    role.enabled ? `${role.label} delegation enabled.` : `${role.label} delegation disabled.`,
    role.enabled ? "good" : "neutral",
    "manual"
  );
  render();
  return { ok: true, role: { ...role } };
}

function setDelegationTaskEnabled(roleId, taskId, enabled = false) {
  const actionWindow = requireActionWindow("set_delegation_task");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  const manager = getManagerState();
  const role = manager.delegation.roles[roleId];
  if (!role) {
    return { ok: false, error: `Unknown delegation role: ${roleId}.` };
  }
  if (!(taskId in role.tasks)) {
    return { ok: false, error: `Unknown delegation task: ${taskId}.` };
  }
  role.tasks[taskId] = Boolean(enabled);
  appendDelegationAudit(
    roleId,
    "task_toggle",
    `${role.label} task ${taskId} ${role.tasks[taskId] ? "enabled" : "disabled"}.`,
    "neutral",
    "manual"
  );
  render();
  return { ok: true, role: { ...role } };
}

function runDelegatedRoutines(boundary = "day_start") {
  const manager = getManagerState();
  if (manager.delegation.lastRunDay === state.day && boundary === "day_start") {
    return { actions: 0, summary: "Delegation routines already executed today." };
  }
  const actions = [];
  const roles = manager.delegation.roles;
  const crown = getCrownAuthority();
  const staffStats = getStaffStats();

  if (roles.head_chef.enabled) {
    if (roles.head_chef.tasks.menuFallback) {
      const fallbackSummary = applyMenuFallbackPolicy(manager.committedPlan || manager.planDraft);
      actions.push(`Head chef: ${fallbackSummary}`);
      appendDelegationAudit("head_chef", "menu_fallback", fallbackSummary, "neutral", boundary);
    }
    if (roles.head_chef.tasks.qualityChecks && state.cleanliness < 60 && state.gold >= 6) {
      state.gold -= 6;
      state.cleanliness = clamp(state.cleanliness + 5, 0, 100);
      const result = "Head chef ran prep-room cleanup (+5 cleanliness, -6 gold).";
      actions.push(result);
      appendDelegationAudit("head_chef", "quality_checks", result, "good", boundary);
    }
  }

  if (roles.floor_manager.enabled) {
    if (roles.floor_manager.tasks.fatigueControl && staffStats.avgFatigue >= 62) {
      state.rotaPreset = "day_heavy";
      const result = `Floor manager shifted rota to ${ROTA_PRESETS[state.rotaPreset].label} for fatigue control.`;
      actions.push(result);
      appendDelegationAudit("floor_manager", "fatigue_control", result, "good", boundary);
    }
    if (roles.floor_manager.tasks.serviceRecovery && state.reputation <= 38) {
      state.reputation = clamp(state.reputation + 1, 0, 100);
      const result = "Floor manager recovered service flow (+1 reputation).";
      actions.push(result);
      appendDelegationAudit("floor_manager", "service_recovery", result, "good", boundary);
    }
  }

  if (roles.clerk.enabled) {
    if (roles.clerk.tasks.complianceFilings && crown.complianceScore < 50 && state.gold >= 12) {
      state.gold -= 12;
      crown.complianceScore = clamp(crown.complianceScore + 3, 0, 100);
      shiftWorldActorStanding("crown_office", 1);
      const filingResult = "Clerk filed a Crown packet (+3 compliance, -12 gold).";
      actions.push(filingResult);
      appendDelegationAudit("clerk", "compliance_filing", filingResult, "good", boundary);
      postCommandMessage({
        source: "clerk",
        urgency: "medium",
        category: "compliance",
        title: "Clerk Filing Submitted",
        summary: filingResult,
        confidence: 82,
        impact: 58,
        linkedAction: "file_compliance",
        expiresDay: state.day + 2,
        recommendation: buildRecommendationPayload(
          "monitor_compliance",
          "Review Crown ledger",
          76,
          50,
          "Small gold spend for steadier tax oversight."
        )
      });
    }
    if (roles.clerk.tasks.stockPaperwork && state.world.suppliers.volatility >= 68) {
      setWorldEffect("supply_reliability", 1, 1.05);
      const paperworkResult = "Clerk expedited supplier paperwork (+reliability for next day).";
      actions.push(paperworkResult);
      appendDelegationAudit("clerk", "stock_paperwork", paperworkResult, "good", boundary);
    }
  }

  manager.delegation.lastRunDay = state.day;
  manager.delegation.lastRunSummary =
    actions.length > 0 ? actions.join(" ") : "Delegation active but no routine trigger fired.";
  return {
    actions: actions.length,
    summary: manager.delegation.lastRunSummary
  };
}

function computeRollingAverage(history, field, count = 7) {
  const entries = history.slice(0, Math.max(1, count));
  if (entries.length === 0) {
    return 0;
  }
  const total = entries.reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);
  return total / entries.length;
}

function updateAnalyticsForDay(snapshot = {}) {
  const manager = getManagerState();
  const analytics = manager.analytics;
  const wanted = snapshot.wanted && typeof snapshot.wanted === "object" ? snapshot.wanted : {};
  const sold = snapshot.sold && typeof snapshot.sold === "object" ? snapshot.sold : {};
  const wantedTotal = Object.values(wanted).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value) || 0)), 0);
  const soldTotal = Object.values(sold).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value) || 0)), 0);
  const conversionPct = wantedTotal > 0 ? Math.round((soldTotal / wantedTotal) * 100) : 100;
  const retentionPct = Math.max(0, Math.min(100, Math.round(Number(snapshot.retentionPct) || 50)));
  const revenue = Math.max(0, Math.round(Number(snapshot.revenue) || 0));
  const net = Math.round(Number(snapshot.net) || 0);
  const guests = Math.max(0, Math.round(Number(snapshot.guests) || 0));
  const marginPct = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
  const avgSpend = guests > 0 ? Number((revenue / guests).toFixed(2)) : 0;

  const menuMargins = {};
  ["ale", "mead", "stew", "bread", "room"].forEach((item) => {
    const units = Math.max(0, Math.round(Number(sold[item]) || 0));
    const revenueItem = units * (Number(state.prices[item]) || 0);
    const costItem = units * (MENU_MARGIN_COSTS[item] || 0);
    menuMargins[item] = Math.round(revenueItem - costItem);
  });

  analytics.history.unshift({
    day: state.day,
    guests,
    revenue,
    net,
    conversionPct,
    retentionPct,
    avgSpend,
    marginPct
  });
  if (analytics.history.length > MAX_ANALYTICS_HISTORY) {
    analytics.history.length = MAX_ANALYTICS_HISTORY;
  }

  const currentWindow = analytics.history.slice(0, 7);
  const previousWindow = analytics.history.slice(7, 14);
  const current = {
    conversionPct: Math.round(computeRollingAverage(currentWindow, "conversionPct", 7)),
    retentionPct: Math.round(computeRollingAverage(currentWindow, "retentionPct", 7)),
    marginPct: Math.round(computeRollingAverage(currentWindow, "marginPct", 7)),
    avgSpend: Number(computeRollingAverage(currentWindow, "avgSpend", 7).toFixed(2))
  };
  const previous = {
    conversionPct: Math.round(computeRollingAverage(previousWindow, "conversionPct", 7)),
    retentionPct: Math.round(computeRollingAverage(previousWindow, "retentionPct", 7)),
    marginPct: Math.round(computeRollingAverage(previousWindow, "marginPct", 7)),
    avgSpend: Number(computeRollingAverage(previousWindow, "avgSpend", 7).toFixed(2))
  };

  analytics.dailySummary = {
    conversionPct,
    retentionPct,
    marginPct,
    avgSpend,
    guests,
    revenue,
    net
  };
  analytics.deltas = {
    conversionPct: current.conversionPct - previous.conversionPct,
    retentionPct: current.retentionPct - previous.retentionPct,
    marginPct: current.marginPct - previous.marginPct,
    avgSpend: Number((current.avgSpend - previous.avgSpend).toFixed(2))
  };
  analytics.menuItemMargins = menuMargins;
  analytics.anomalyNotes = [
    conversionPct < 60 ? "Conversion dipped below 60%." : "",
    retentionPct < 45 ? "Retention pressure: low loyalty carry-over." : "",
    marginPct < 10 ? "Margin pressure: weak net position." : "",
    state.lastReport && state.lastReport.rivalPressure >= 38 ? "Rival pressure elevated." : ""
  ].filter(Boolean);
  analytics.lastUpdatedDay = state.day;

  return {
    conversionPct,
    retentionPct,
    marginPct,
    avgSpend,
    anomalies: analytics.anomalyNotes.slice()
  };
}

function createScoutingReport(targetType = "event") {
  const manager = getManagerState();
  const scouting = manager.scouting;
  let report = null;
  if (targetType === "recruit" && manager.recruitment.market.length > 0) {
    const candidate = pick(manager.recruitment.market);
    report = {
      targetType: "recruit",
      targetId: candidate.id,
      label: candidate.name,
      summary: `${candidate.name} (${candidate.role}) rumored to have ${candidate.hiddenTraits[0] || "hidden traits"}.`
    };
  } else if (targetType === "rival" && Array.isArray(state.world.rivalTaverns) && state.world.rivalTaverns.length > 0) {
    const rival = pick(state.world.rivalTaverns);
    report = {
      targetType: "rival",
      targetId: rival.id,
      label: rival.name,
      summary: `${rival.name} is adjusting price posture in your district.`
    };
  } else {
    const outlook = getWorldLayerStatus({ outlookDays: 5 });
    const highlights =
      outlook.handoffContract &&
      outlook.handoffContract.eventCalendarOutlook &&
      Array.isArray(outlook.handoffContract.eventCalendarOutlook.highlights)
        ? outlook.handoffContract.eventCalendarOutlook.highlights
        : [];
    report = {
      targetType: "event",
      targetId: `event-day-${state.day}`,
      label: "District Outlook",
      summary: highlights[0] || "Scouts report steady conditions across nearby districts."
    };
  }
  const confidence = clamp(
    Math.round(scouting.scoutQuality * 0.72 + randInt(-10, 12)),
    15,
    98
  );
  const entry = normalizeScoutingReportEntry(
    {
      id: random.randomId(10),
      targetType: report.targetType,
      targetId: report.targetId,
      label: report.label,
      confidence,
      freshness: 100,
      summary: report.summary,
      discoveredDay: state.day,
      lastUpdatedDay: state.day
    },
    0,
    state.day
  );
  scouting.reports.unshift(entry);
  if (scouting.reports.length > MAX_SCOUTING_REPORTS) {
    scouting.reports.length = MAX_SCOUTING_REPORTS;
  }
  return entry;
}

function createRumorFromReport(report) {
  if (!report) {
    return null;
  }
  const truthRoll = random.nextFloat();
  const truthState = truthRoll < 0.44 ? "true" : truthRoll < 0.74 ? "partial" : "false";
  const resolveDay = state.day + randInt(2, 5);
  const effect = {
    reputationDelta: truthState === "true" ? randInt(1, 3) : truthState === "partial" ? randInt(0, 2) : randInt(-2, 0),
    actorId: report.targetType === "rival" ? "merchant_houses" : report.targetType === "event" ? "civic_council" : "",
    actorStandingDelta: truthState === "true" ? 1 : truthState === "false" ? -1 : 0
  };
  return normalizeRumorEntry(
    {
      id: random.randomId(11),
      topic: `${report.targetType}_intel`,
      targetType: report.targetType,
      targetId: report.targetId,
      summary: `Rumor: ${report.summary}`,
      truthState,
      status: "active",
      confidence: clamp(Math.round(report.confidence * 0.82 + randInt(-8, 8)), 12, 95),
      freshness: 100,
      createdDay: state.day,
      resolveDay,
      resolutionNote: "",
      effect
    },
    0,
    state.day
  );
}

function resolveRumor(rumor) {
  rumor.status = "resolved";
  rumor.freshness = Math.max(0, rumor.freshness - 18);
  const effect = rumor.effect || { reputationDelta: 0, actorId: "", actorStandingDelta: 0 };
  if (effect.reputationDelta !== 0) {
    state.reputation = clamp(state.reputation + effect.reputationDelta, 0, 100);
  }
  if (effect.actorId && effect.actorStandingDelta !== 0) {
    shiftWorldActorStanding(effect.actorId, effect.actorStandingDelta);
  }
  rumor.resolutionNote =
    rumor.truthState === "true"
      ? "Scout confirmation: rumor was accurate."
      : rumor.truthState === "partial"
        ? "Scout confirmation: rumor was partly accurate."
        : "Scout confirmation: rumor collapsed as false chatter.";
  return rumor.resolutionNote;
}

function updateScoutingForDay() {
  const manager = getManagerState();
  const scouting = manager.scouting;
  scouting.reports.forEach((entry) => {
    entry.freshness = clamp(entry.freshness - randInt(6, 14), 0, 100);
    entry.lastUpdatedDay = state.day;
  });
  scouting.rumors.forEach((entry) => {
    entry.freshness = clamp(entry.freshness - randInt(5, 12), 0, 100);
    if (entry.status === "active" && state.day >= entry.resolveDay) {
      const resolutionNote = resolveRumor(entry);
      postCommandMessage({
        source: "scouting_desk",
        urgency: entry.truthState === "false" ? "low" : "medium",
        category: "scouting",
        title: "Rumor Resolved",
        summary: `${entry.summary} ${resolutionNote}`,
        confidence: entry.confidence,
        impact: Math.abs(entry.effect.reputationDelta) * 20 + 30,
        linkedAction: "review_scouting",
        expiresDay: state.day + 4,
        recommendation: buildRecommendationPayload(
          "refresh_scouting",
          "Refresh scouting targets",
          74,
          48,
          "Fresh intel reduces false-positive chatter."
        )
      });
    } else if (entry.status === "active" && entry.freshness <= 10) {
      entry.status = "expired";
      entry.resolutionNote = "Rumor expired before confirmation.";
    }
  });

  const spawnReport = scouting.reports.length < 4 || state.day % 2 === 0;
  let newReport = null;
  let newRumor = null;
  if (spawnReport) {
    const targetType = pick(["event", "rival", "recruit"]);
    newReport = createScoutingReport(targetType);
  }
  if (newReport && random.nextFloat() <= 0.6) {
    newRumor = createRumorFromReport(newReport);
    if (newRumor) {
      scouting.rumors.unshift(newRumor);
      if (scouting.rumors.length > MAX_SCOUTING_RUMORS) {
        scouting.rumors.length = MAX_SCOUTING_RUMORS;
      }
    }
  }
  scouting.nextRumorDay = state.day + randInt(1, 3);
  const activeRumors = scouting.rumors.filter((entry) => entry.status === "active").length;
  scouting.lastSummary =
    `Scouting quality ${scouting.scoutQuality}. Reports ${scouting.reports.length}, active rumors ${activeRumors}.` +
    `${newReport ? ` New intel: ${newReport.label}.` : ""}`;
  return {
    newReport,
    newRumor,
    activeRumors,
    summary: scouting.lastSummary
  };
}

function runScoutingSweep(targetType = "event") {
  const actionWindow = requireActionWindow("run_scouting_sweep");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  if (!spendGold(7, "Scouting dispatch")) {
    return { ok: false, error: "Not enough gold for scouting dispatch." };
  }
  const report = createScoutingReport(`${targetType}`.toLowerCase());
  const manager = getManagerState();
  manager.scouting.scoutQuality = clamp(manager.scouting.scoutQuality + 1, 20, 100);
  manager.scouting.lastSummary = `Manual scouting sweep filed: ${report.label}.`;
  postCommandMessage({
    source: "scouting_desk",
    urgency: "low",
    category: "scouting",
    title: "Scouting Sweep Complete",
    summary: report.summary,
    confidence: report.confidence,
    impact: 34,
    linkedAction: "review_scouting",
    expiresDay: state.day + 3,
    recommendation: buildRecommendationPayload(
      "review_recruitment",
      "Review scouting tab",
      69,
      36,
      "Costs gold now but improves hiring and rival forecasting."
    )
  });
  logLine(`Scouting sweep complete: ${report.summary}`, "neutral");
  render();
  return { ok: true, report: { ...report } };
}

function publishDailyCommandBoard(feed = {}) {
  const manager = getManagerState();
  const compliance = Number(feed.compliance) || Number(state.lastReport.compliance) || 0;
  const arrears = Number(feed.arrears) || Number(getCrownAuthority().arrears) || 0;
  const rivalPressure = Number(feed.rivalPressure) || Number(state.lastReport.rivalPressure) || 0;
  const staffFatigue = Number(feed.avgFatigue) || Number(getStaffStats().avgFatigue) || 0;
  const net = Math.round(Number(feed.net) || state.lastNet || 0);
  const lowStockCount = Object.values(state.inventory).filter((amount) => Number(amount) < 9).length;
  const objectivePressure = manager.objectives.active.filter((objective) => objective.remainingWeeks <= 1).length;
  const eventSummary = typeof feed.eventSummary === "string" ? feed.eventSummary : state.lastReport.events || "";

  if (compliance < 48 || arrears > 0) {
    postCommandMessage({
      source: "crown_office",
      urgency: compliance < 42 ? "critical" : "high",
      category: "compliance",
      title: "Crown Compliance Pressure",
      summary:
        arrears > 0
          ? `Arrears standing at ${formatCoin(arrears)} with compliance ${compliance}.`
          : `Compliance rating dropped to ${compliance}.`,
      confidence: 88,
      impact: 82,
      linkedAction: "file_compliance",
      expiresDay: state.day + 2,
      recommendation: buildRecommendationPayload(
        "file_compliance",
        "File Crown report",
        86,
        80,
        "Immediate filing costs gold but reduces audit and penalty exposure."
      )
    });
  }

  if (lowStockCount >= 4) {
    postCommandMessage({
      source: "supplier_network",
      urgency: "high",
      category: "supply",
      title: "Supply Strain Alert",
      summary: `${lowStockCount} stock lines are under 9 units. Reliability risk is rising.`,
      confidence: 77,
      impact: 72,
      linkedAction: "supplier_actions",
      expiresDay: state.day + 2,
      recommendation: buildRecommendationPayload(
        "restock_supplies",
        "Prioritize restock",
        74,
        71,
        "Restock spend now prevents demand and margin losses tomorrow."
      )
    });
  }

  if (staffFatigue >= 64) {
    postCommandMessage({
      source: "floor_manager",
      urgency: "medium",
      category: "staffing",
      title: "Fatigue Management Warning",
      summary: `Average staff fatigue reached ${Math.round(staffFatigue)}. Service risk is increasing.`,
      confidence: 72,
      impact: 61,
      linkedAction: "planning_board",
      expiresDay: state.day + 3,
      recommendation: buildRecommendationPayload(
        "adjust_staffing",
        "Shift to rest focus",
        71,
        58,
        "Lower fatigue now may trim short-term output but protects consistency."
      )
    });
  }

  if (rivalPressure >= 36) {
    postCommandMessage({
      source: "district_watch",
      urgency: "medium",
      category: "rivalry",
      title: "Rival Heat Increased",
      summary: `District rival pressure is ${Math.round(rivalPressure)}%.`,
      confidence: 67,
      impact: 55,
      linkedAction: "pricing_board",
      expiresDay: state.day + 3,
      recommendation: buildRecommendationPayload(
        "rebalance_prices",
        "Review price board",
        66,
        53,
        "More competitive pricing can recover flow but may reduce per-sale margin."
      )
    });
  }

  if (objectivePressure > 0) {
    postCommandMessage({
      source: "objective_office",
      urgency: "medium",
      category: "objectives",
      title: "Objective Deadline Pressure",
      summary: `${objectivePressure} active objective${objectivePressure === 1 ? "" : "s"} nearing deadline.`,
      confidence: 79,
      impact: 59,
      linkedAction: "objective_board",
      expiresDay: state.day + 4,
      recommendation: buildRecommendationPayload(
        "focus_objectives",
        "Focus objective progress",
        76,
        61,
        "Objective focus may reduce flexibility for other optimizations."
      )
    });
  }

  if (eventSummary && !/No major/i.test(eventSummary)) {
    postCommandMessage({
      source: "calendar_desk",
      urgency: "low",
      category: "events",
      title: "Calendar Event Update",
      summary: eventSummary,
      confidence: 65,
      impact: 46,
      linkedAction: "world_events",
      expiresDay: state.day + 3,
      recommendation: buildRecommendationPayload(
        "review_event_outlook",
        "Review event outlook",
        64,
        44,
        "Preparing early can reduce surprise swings from district events."
      )
    });
  }

  postCommandMessage({
    source: "ledger",
    urgency: net >= 0 ? "low" : "medium",
    category: "finance",
    title: "Daily Ledger Summary",
    summary: `Day ${state.day} closed at net ${formatCoin(net)} with ${state.lastGuests} guests.`,
    confidence: 94,
    impact: net >= 0 ? 40 : 62,
    linkedAction: "daily_report",
    expiresDay: state.day + 2,
    recommendation: buildRecommendationPayload(
      "review_daily_report",
      "Review daily report",
      92,
      net >= 0 ? 38 : 60,
      "Consistent review improves planning accuracy over the next week."
    )
  });
}

function getTimeflowTriggerPriority(trigger) {
  return TIMEFLOW_TRIGGER_PRIORITY[trigger] || 0;
}

function getPlanningTimingMatrix() {
  return Object.fromEntries(
    Object.entries(PLAN_EFFECT_TIMING).map(([field, timing]) => [field, timing])
  );
}

function normalizePlanningFieldValue(field, value) {
  if (field === "reserveGoldTarget" || field === "supplyBudgetCap") {
    return Math.max(0, Math.round(Number(value) || 0));
  }
  return `${value}`;
}

function applyPlanningFieldToPlans(field, value) {
  const manager = getManagerState();
  const normalizedValue = normalizePlanningFieldValue(field, value);
  manager.planDraft[field] = normalizedValue;
  manager.planDraft.weekIndex = manager.weekIndex;
  if (manager.planCommitted && manager.committedPlan) {
    manager.committedPlan[field] = normalizedValue;
    manager.committedPlan.weekIndex = manager.weekIndex;
    if (field === "supplyBudgetCap") {
      manager.supplyPlanner.weeklyBudgetCap = Math.max(0, Math.round(Number(normalizedValue) || 0));
    }
  }
}

function queuePlanningIntent(field, value, timing, source = "planning_board") {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const queue = state.timeflow.intentQueue;
  const normalizedTiming =
    typeof timing === "string" && PLAN_TIMING_ORDER.includes(timing)
      ? timing
      : PLAN_EFFECT_TIMING[field] || "next_day";
  const clock = createSimulationClockState(state.clock);
  const entry = {
    id: random.randomId(10),
    source,
    field,
    value: normalizePlanningFieldValue(field, value),
    timing: normalizedTiming,
    effectiveBoundary: normalizedTiming === "next_week" ? "week_start" : "day_start",
    priority: normalizedTiming === "next_week" ? 1 : 2,
    createdAtDay: state.day,
    createdAtMinute: clock.minuteOfDay,
    createdSeq: state.timeflow.nextIntentSeq,
    applied: false
  };
  state.timeflow.nextIntentSeq += 1;
  queue.push(entry);
  queue.sort((a, b) =>
    b.priority - a.priority ||
    a.createdAtDay - b.createdAtDay ||
    a.createdAtMinute - b.createdAtMinute ||
    a.createdSeq - b.createdSeq ||
    a.id.localeCompare(b.id)
  );
  state.timeflow.lastQueueSummary = `Queued ${queue.length} planning intent${queue.length === 1 ? "" : "s"}.`;
  return entry;
}

function flushPlanningIntentQueue(boundary = "day_start") {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const queue = state.timeflow.intentQueue;
  if (queue.length === 0) {
    state.timeflow.lastQueueSummary = "No queued planning intents.";
    return { applied: 0, rejected: 0, pending: 0 };
  }
  const nextQueue = [];
  let applied = 0;
  let rejected = 0;
  const appliedFields = [];
  queue.forEach((entry) => {
    if (!entry || !entry.field || !PLAN_EFFECT_TIMING[entry.field]) {
      rejected += 1;
      return;
    }
    if (entry.effectiveBoundary !== boundary) {
      nextQueue.push(entry);
      return;
    }
    applyPlanningFieldToPlans(entry.field, entry.value);
    applied += 1;
    appliedFields.push(entry.field);
  });
  state.timeflow.intentQueue = nextQueue;
  if (applied > 0) {
    logLine(
      `Applied ${applied} queued planning intent${applied === 1 ? "" : "s"} at ${boundary}: ${appliedFields.join(", ")}.`,
      "neutral"
    );
  }
  if (rejected > 0) {
    logLine(`Rejected ${rejected} invalid queued planning intent${rejected === 1 ? "" : "s"}.`, "bad");
  }
  const pending = nextQueue.length;
  state.timeflow.lastQueueSummary =
    pending > 0
      ? `${pending} queued planning intent${pending === 1 ? "" : "s"} pending (${boundary} pass complete).`
      : `Queue clear after ${boundary}.`;
  return { applied, rejected, pending };
}

function requireActionWindow(actionId, options = null) {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const allowDuringBoundary = Boolean(options && options.allowDuringBoundary);
  if (allowDuringBoundary) {
    return { ok: true };
  }
  if (state.timeflow.inProgress) {
    state.timeflow.diagnostics.guardRecoveries += 1;
    return {
      ok: false,
      error: `${actionId} blocked during boundary resolution.`
    };
  }
  return { ok: true };
}

function enforceActionCadence(actionId, rules = {}) {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const timeflow = state.timeflow;
  if (timeflow.inProgress) {
    timeflow.diagnostics.guardRecoveries += 1;
    return { ok: false, error: "Action blocked during boundary resolution." };
  }
  const manager = getManagerState();
  const minuteStamp = `D${state.day}:M${Math.max(0, Math.round(Number(state.clock && state.clock.minuteOfDay) || 0))}`;
  const minuteLocks = timeflow.cadence.minuteLocks;
  const dayLocks = timeflow.cadence.dayLocks;
  const weekLocks = timeflow.cadence.weekLocks;
  if (rules.perMinute && minuteLocks[actionId] === minuteStamp) {
    timeflow.diagnostics.guardRecoveries += 1;
    return { ok: false, error: `${actionId} already used this in-game minute.` };
  }
  if (rules.perDay && dayLocks[actionId] === state.day) {
    timeflow.diagnostics.guardRecoveries += 1;
    return { ok: false, error: `${actionId} already used today.` };
  }
  if (rules.perWeek && weekLocks[actionId] === manager.weekIndex) {
    timeflow.diagnostics.guardRecoveries += 1;
    return { ok: false, error: `${actionId} already used this week.` };
  }
  if (rules.perMinute) {
    minuteLocks[actionId] = minuteStamp;
  }
  if (rules.perDay) {
    dayLocks[actionId] = state.day;
  }
  if (rules.perWeek) {
    weekLocks[actionId] = manager.weekIndex;
  }
  return { ok: true };
}

function beginTimeflowResolution(trigger = "manual_skip") {
  normalizeWorldState();
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const timeflow = state.timeflow;
  const nextTrigger =
    typeof trigger === "string" && TIMEFLOW_TRIGGER_PRECEDENCE.includes(trigger)
      ? trigger
      : "manual_skip";
  const activeMinute = Math.max(0, Math.round(Number(state.clock && state.clock.minuteOfDay) || 0));
  const boundaryKey = `${nextTrigger}|D${state.day}|M${activeMinute}`;
  if (!timeflow.inProgress && timeflow.lastBoundarySucceeded && timeflow.lastBoundaryKey === boundaryKey) {
    timeflow.diagnostics.guardRecoveries += 1;
    return {
      ok: false,
      error: `Duplicate boundary resolution blocked for ${boundaryKey}.`,
      activeTrigger: timeflow.activeTrigger
    };
  }
  if (timeflow.inProgress) {
    const activePriority = getTimeflowTriggerPriority(timeflow.activeTrigger || "manual_skip");
    const incomingPriority = getTimeflowTriggerPriority(nextTrigger);
    timeflow.diagnostics.guardRecoveries += 1;
    return {
      ok: false,
      error:
        incomingPriority > activePriority
          ? `Blocked trigger "${nextTrigger}" while "${timeflow.activeTrigger}" is resolving.`
          : `Skipped lower-priority trigger "${nextTrigger}" while "${timeflow.activeTrigger}" is resolving.`,
      activeTrigger: timeflow.activeTrigger
    };
  }
  timeflow.inProgress = true;
  timeflow.activeTrigger = nextTrigger;
  return { ok: true, trigger: nextTrigger, boundaryKey };
}

function endTimeflowResolution(data = {}) {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const timeflow = state.timeflow;
  const trigger =
    typeof data.trigger === "string" && TIMEFLOW_TRIGGER_PRECEDENCE.includes(data.trigger)
      ? data.trigger
      : timeflow.activeTrigger || timeflow.lastTrigger || "manual_skip";
  const boundaryKey = typeof data.boundaryKey === "string" ? data.boundaryKey : "";
  const success = data.success !== false;
  timeflow.inProgress = false;
  timeflow.activeTrigger = null;
  timeflow.lastTrigger = trigger;
  timeflow.lastBoundarySucceeded = success;
  if (boundaryKey.length > 0 && success) {
    timeflow.lastBoundaryKey = boundaryKey;
  }
  timeflow.lastBoundaryOrder = Array.isArray(data.boundaryOrder)
    ? data.boundaryOrder
        .map((entry) => `${entry}`)
        .filter((entry) => TIMEFLOW_BOUNDARY_ORDER.includes(entry))
    : [];
  timeflow.lastResolvedDay = Math.max(1, Math.round(Number(data.day) || state.day));
  const minuteOfDay = state.clock ? state.clock.minuteOfDay : 0;
  timeflow.lastMinuteOfDay = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(minuteOfDay) || 0)));
  const boundaryLine =
    timeflow.lastBoundaryOrder.length > 0
      ? timeflow.lastBoundaryOrder.join(" -> ")
      : "no boundaries resolved";
  if (success) {
    timeflow.lastResolutionNote = `${trigger}: ${boundaryLine} at Day ${timeflow.lastResolvedDay}.`;
  } else {
    timeflow.lastResolutionNote = `${trigger}: boundary attempt failed at Day ${timeflow.lastResolvedDay}.`;
  }
  if (state.lastReport && typeof state.lastReport === "object") {
    state.lastReport.timeflowSummary = timeflow.lastResolutionNote;
  }
}

function setTimeflowParityStatus(status = "unverified") {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  state.timeflow.diagnostics.lastParityStatus = `${status}`;
}

function getTimeflowDiagnostics() {
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  return {
    lastResolutionNote: state.timeflow.lastResolutionNote,
    lastBoundaryOrder: state.timeflow.lastBoundaryOrder.slice(),
    queueSummary: state.timeflow.lastQueueSummary,
    pendingIntents: state.timeflow.intentQueue.map((entry) => ({ ...entry })),
    guardRecoveries: state.timeflow.diagnostics.guardRecoveries,
    parityStatus: state.timeflow.diagnostics.lastParityStatus
  };
}

function getTimeflowContractStatus() {
  normalizeWorldState();
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  return {
    version: TIMEFLOW_CONTRACT_VERSION,
    units: { ...TIMEFLOW_UNITS },
    boundaryOrder: TIMEFLOW_BOUNDARY_ORDER.slice(),
    ownership: { ...TIMEFLOW_OWNERSHIP },
    triggerPrecedence: TIMEFLOW_TRIGGER_PRECEDENCE.slice(),
    planningTiming: getPlanningTimingMatrix(),
    runtime: {
      ...state.timeflow
    }
  };
}

function getSimulationClockStatus() {
  normalizeWorldState();
  state.clock = createSimulationClockState(state.clock);
  const clock = state.clock;
  const totalMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(Number(clock.minuteOfDay) || 0)));
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const speedLabel = clock.speed === 0 ? "Pause" : clock.speed === 1 ? "Play" : `Fast x${clock.speed}`;
  return {
    minuteOfDay: totalMinutes,
    hour24,
    minute,
    label: `${hour12}:${`${minute}`.padStart(2, "0")} ${ampm}`,
    speed: clock.speed,
    speedLabel,
    isPaused: clock.speed === 0
  };
}

function setSimulationSpeed(speed = 0) {
  normalizeWorldState();
  const parsed = Math.round(Number(speed) || 0);
  if (!SIMULATION_SPEEDS.includes(parsed)) {
    return {
      ok: false,
      error: `Unsupported simulation speed: ${speed}. Allowed values: ${SIMULATION_SPEEDS.join(", ")}.`
    };
  }
  state.clock = createSimulationClockState({ ...state.clock, speed: parsed });
  logLine(
    parsed === 0
      ? "Simulation paused."
      : parsed === 1
        ? "Simulation speed set to Play."
        : `Simulation speed set to Fast Forward x${parsed}.`,
    "neutral"
  );
  render();
  return { ok: true, clock: getSimulationClockStatus() };
}

function advanceSimulationMinutes(minutes = 1) {
  normalizeWorldState();
  const increment = Math.max(0, Math.round(Number(minutes) || 0));
  if (increment <= 0) {
    return { ok: false, error: "Simulation minute increment must be positive." };
  }
  state.clock = createSimulationClockState(state.clock);
  let dayAdvanced = 0;
  state.clock.minuteOfDay += increment;
  while (state.clock.minuteOfDay >= MINUTES_PER_DAY) {
    state.clock.minuteOfDay -= MINUTES_PER_DAY;
    const dayResult = advanceDay({ autoPrepareExecution: true, trigger: "midnight_rollover" });
    if (!dayResult.ok) {
      return {
        ok: false,
        error: dayResult.error || "Failed to advance day during simulation tick.",
        dayAdvanced,
        clock: getSimulationClockStatus()
      };
    }
    dayAdvanced += 1;
  }
  return {
    ok: true,
    dayAdvanced,
    clock: getSimulationClockStatus()
  };
}

function getManagerPhaseStatus() {
  normalizeWorldState();
  const manager = getManagerState();
  state.timeflow = createTimeflowRuntimeState(state.timeflow);
  const summarizePlan = (plan) => {
    if (!plan || typeof plan !== "object") {
      return "No plan committed.";
    }
    return (
      `Staff ${plan.staffingIntent}, pricing ${plan.pricingIntent}, procurement ${plan.procurementIntent}, ` +
      `marketing ${plan.marketingIntent}, logistics ${plan.logisticsIntent}, risk ${plan.riskTolerance}, ` +
      `reserve ${formatCoin(plan.reserveGoldTarget || 0)}, supply budget ${formatCoin(plan.supplyBudgetCap || 0)}.`
    );
  };
  return {
    phase: manager.phase,
    weekIndex: manager.weekIndex,
    dayInWeek: manager.dayInWeek,
    planCommitted: manager.planCommitted,
    transitionReason: manager.transitionReason,
    guardNote: manager.guardNote,
    committedPlan: manager.committedPlan ? { ...manager.committedPlan } : null,
    planDraft: { ...manager.planDraft },
    planDraftSummary: summarizePlan(manager.planDraft),
    committedPlanSummary: summarizePlan(manager.committedPlan),
    supplyPlanner: manager.supplyPlanner ? { ...manager.supplyPlanner } : null,
    recruitment: {
      market: manager.recruitment.market.map((entry) => ({ ...entry })),
      shortlist: manager.recruitment.shortlist.slice(),
      lastRefreshWeek: manager.recruitment.lastRefreshWeek,
      lastSummary: manager.recruitment.lastSummary
    },
    objectives: {
      active: manager.objectives.active.map((entry) => ({ ...entry })),
      completed: manager.objectives.completed.map((entry) => ({ ...entry })),
      failed: manager.objectives.failed.map((entry) => ({ ...entry })),
      lastSummary: manager.objectives.lastSummary
    },
    commandBoard: {
      currentSection: manager.commandBoard.currentSection,
      categoryFilter: manager.commandBoard.categoryFilter,
      urgencyFilter: manager.commandBoard.urgencyFilter,
      unreadCount: manager.commandBoard.unreadCount,
      lastGeneratedDay: manager.commandBoard.lastGeneratedDay,
      lastSummary: manager.commandBoard.lastSummary,
      messages: manager.commandBoard.messages.map((entry) => ({
        ...entry,
        recommendation: entry.recommendation ? { ...entry.recommendation } : null
      }))
    },
    delegation: {
      roles: Object.fromEntries(
        Object.entries(manager.delegation.roles).map(([roleId, role]) => [
          roleId,
          {
            ...role,
            tasks: { ...role.tasks }
          }
        ])
      ),
      auditTrail: manager.delegation.auditTrail.map((entry) => ({ ...entry })),
      lastRunDay: manager.delegation.lastRunDay,
      lastRunSummary: manager.delegation.lastRunSummary
    },
    analytics: {
      history: manager.analytics.history.map((entry) => ({ ...entry })),
      dailySummary: { ...manager.analytics.dailySummary },
      deltas: { ...manager.analytics.deltas },
      menuItemMargins: { ...manager.analytics.menuItemMargins },
      anomalyNotes: manager.analytics.anomalyNotes.slice(),
      lastUpdatedDay: manager.analytics.lastUpdatedDay
    },
    scouting: {
      scoutQuality: manager.scouting.scoutQuality,
      reports: manager.scouting.reports.map((entry) => ({ ...entry })),
      rumors: manager.scouting.rumors.map((entry) => ({
        ...entry,
        effect: entry.effect ? { ...entry.effect } : null
      })),
      filters: { ...manager.scouting.filters },
      lastSummary: manager.scouting.lastSummary,
      nextRumorDay: manager.scouting.nextRumorDay
    },
    timeline: manager.timeline ? { ...manager.timeline } : null,
    planningContext: manager.planningContext ? { ...manager.planningContext } : null,
    lastWeekSummary: manager.lastWeekSummary,
    planningTiming: getPlanningTimingMatrix(),
    pendingIntents: state.timeflow.intentQueue.map((entry) => ({ ...entry })),
    queueSummary: state.timeflow.lastQueueSummary,
    timeflowGuardRecoveries: state.timeflow.diagnostics.guardRecoveries
  };
}

function getManagerLayerStatus() {
  normalizeWorldState();
  const manager = getManagerState();
  const recruitment = manager.recruitment.market || [];
  const confidenceAvg =
    recruitment.length > 0
      ? Math.round(
          recruitment.reduce((sum, candidate) => sum + (Number(candidate.confidence) || 0), 0) /
            recruitment.length
        )
      : 0;
  const unresolvedTraits = recruitment.reduce((sum, candidate) => {
    const hidden = Array.isArray(candidate.hiddenTraits) ? candidate.hiddenTraits.length : 0;
    const revealed = Array.isArray(candidate.revealedTraits) ? candidate.revealedTraits.length : 0;
    return sum + Math.max(0, hidden - revealed);
  }, 0);
  const activeObjectives = manager.objectives.active || [];
  const objectiveDeadlinePressure = activeObjectives.filter((objective) => objective.remainingWeeks <= 1).length;

  return {
    day: state.day,
    contractVersion: 1,
    handoffContract: {
      version: 1,
      generatedAtDay: state.day,
      phaseState: {
        phase: manager.phase,
        weekIndex: manager.weekIndex,
        dayInWeek: manager.dayInWeek,
        planCommitted: manager.planCommitted
      },
      weeklyPlan: {
        draft: { ...manager.planDraft },
        committed: manager.committedPlan ? { ...manager.committedPlan } : null,
        planningContext: manager.planningContext ? { ...manager.planningContext } : null,
        transitionReason: manager.transitionReason
      },
      staffingDecisions: {
        rotaPreset: state.rotaPreset,
        lastStaffingSummary: state.lastReport && typeof state.lastReport.staffing === "string"
          ? state.lastReport.staffing
          : "",
        currentStaffCount: Array.isArray(state.staff) ? state.staff.length : 0,
        unavailableStaffCount: Array.isArray(state.staff)
          ? state.staff.filter((person) => isStaffUnavailable(person)).length
          : 0
      },
      recruitmentIntel: {
        market: recruitment.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          role: candidate.role,
          visibleService: candidate.visibleService,
          visibleQuality: candidate.visibleQuality,
          potentialMin: candidate.potentialMin,
          potentialMax: candidate.potentialMax,
          expectedWage: candidate.expectedWage,
          confidence: candidate.confidence,
          daysRemaining: candidate.daysRemaining,
          interest: candidate.interest,
          competingPressure: candidate.competingPressure,
          revealedTraits: Array.isArray(candidate.revealedTraits) ? candidate.revealedTraits.slice() : []
        })),
        shortlist: manager.recruitment.shortlist.slice(),
        summary: manager.recruitment.lastSummary,
        uncertainty: {
          averageConfidence: confidenceAvg,
          unresolvedTraitCount: unresolvedTraits
        }
      },
      objectiveTimeline: {
        active: activeObjectives.map((objective) => ({ ...objective })),
        completed: manager.objectives.completed.map((objective) => ({ ...objective })),
        failed: manager.objectives.failed.map((objective) => ({ ...objective })),
        summary: manager.objectives.lastSummary,
        deadlinePressure: objectiveDeadlinePressure
      },
      seasonalTimeline: {
        ...manager.timeline
      },
      managerialTooling: {
        contractVersion: MANAGER_TOOLING_CONTRACT_VERSION,
        commandBoard: {
          currentSection: manager.commandBoard.currentSection,
          unreadCount: manager.commandBoard.unreadCount,
          topMessages: manager.commandBoard.messages.slice(0, 8).map((entry) => ({
            id: entry.id,
            day: entry.day,
            source: entry.source,
            urgency: entry.urgency,
            category: entry.category,
            title: entry.title,
            summary: entry.summary,
            read: entry.read,
            recommendation: entry.recommendation ? { ...entry.recommendation } : null
          })),
          summary: manager.commandBoard.lastSummary
        },
        delegatedOutcomes: {
          roles: Object.fromEntries(
            Object.entries(manager.delegation.roles).map(([roleId, role]) => [
              roleId,
              {
                enabled: role.enabled,
                tasks: { ...role.tasks }
              }
            ])
          ),
          lastRunDay: manager.delegation.lastRunDay,
          lastRunSummary: manager.delegation.lastRunSummary,
          recentAudit: manager.delegation.auditTrail.slice(0, 12).map((entry) => ({ ...entry }))
        },
        analytics: {
          dailySummary: { ...manager.analytics.dailySummary },
          deltas: { ...manager.analytics.deltas },
          menuItemMargins: { ...manager.analytics.menuItemMargins },
          anomalies: manager.analytics.anomalyNotes.slice(),
          lastUpdatedDay: manager.analytics.lastUpdatedDay
        },
        intelTimeline: {
          scoutQuality: manager.scouting.scoutQuality,
          reports: manager.scouting.reports.slice(0, 12).map((entry) => ({ ...entry })),
          rumors: manager.scouting.rumors.slice(0, 16).map((entry) => ({
            ...entry,
            effect: entry.effect ? { ...entry.effect } : null
          })),
          summary: manager.scouting.lastSummary
        }
      }
    }
  };
}

function getManagerToolingStatus() {
  const manager = getManagerPhaseStatus();
  return {
    contractVersion: MANAGER_TOOLING_CONTRACT_VERSION,
    sections: MANAGER_TOOLING_SECTIONS.slice(),
    activeSection: manager.commandBoard.currentSection,
    commandBoard: manager.commandBoard,
    delegation: manager.delegation,
    analytics: manager.analytics,
    scouting: manager.scouting
  };
}

function getCohortLoyaltyAverages() {
  const output = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    output[cohortId] = 50;
  });
  const buckets = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    buckets[cohortId] = { sum: 0, count: 0 };
  });
  (state.patrons || []).forEach((patron) => {
    if (!patron || !buckets[patron.cohort]) {
      return;
    }
    buckets[patron.cohort].sum += Number(patron.loyalty) || 0;
    buckets[patron.cohort].count += 1;
  });
  Object.keys(buckets).forEach((cohortId) => {
    const bucket = buckets[cohortId];
    output[cohortId] = bucket.count > 0 ? bucket.sum / bucket.count : 50;
  });
  return output;
}

function applyWorldReputationModelDayUpdate(args = {}) {
  const model = state.world.reputationModel;
  const actors = state.world.actors || {};
  const crown = state.world.crown || { complianceScore: 64 };
  const cohortLoyalty = getCohortLoyaltyAverages();
  const satisfaction = Number(args.satisfaction) || 0.6;
  const net = Number(args.net) || 0;
  const rivalPressure = Number(args.rivalPressure) || 0;
  const supplierVolatility = Number(args.supplierVolatility) || 30;
  const collectionResult = args.collectionResult || { reputationDelta: 0 };
  const auditResult = args.auditResult || { reputationDelta: 0 };

  Object.keys(model.cohorts).forEach((cohortId) => {
    const current = model.cohorts[cohortId];
    const loyaltyTarget = Number(cohortLoyalty[cohortId] || 50);
    let delta = Math.round((loyaltyTarget - current) * 0.24);
    if (satisfaction >= 0.72) {
      delta += 1;
    } else if (satisfaction <= 0.5) {
      delta -= 1;
    }
    if (rivalPressure >= 0.35 && (cohortId === "locals" || cohortId === "adventurers")) {
      delta -= 1;
    }
    if (cohortId === "merchants" && net > 0) {
      delta += 1;
    }
    if (cohortId === "nobles" && state.cleanliness >= 70 && state.condition >= 70) {
      delta += 1;
    }
    model.cohorts[cohortId] = clamp(current + delta, 0, 100);
  });

  Object.values(WORLD_ACTOR_PROFILES).forEach((actorProfile) => {
    const actorId = actorProfile.id;
    const group = model.groups[actorId] || { score: 50, lastShift: 0 };
    const actorStanding = actors[actorId] && Number.isFinite(actors[actorId].standing) ? actors[actorId].standing : 50;
    let target = actorStanding;
    if (actorId === "crown_office") {
      target = actorStanding * 0.62 + crown.complianceScore * 0.38;
    } else if (actorId === "merchant_houses") {
      target += net > 0 ? 2 : -2;
      target += supplierVolatility >= 65 ? -2 : 1;
    } else if (actorId === "civic_council") {
      if (state.cleanliness < 45 || state.condition < 45) {
        target -= 4;
      } else if (satisfaction >= 0.68) {
        target += 2;
      }
    } else if (actorId === "underworld_network") {
      if (state.cleanliness < 35 || state.condition < 35) {
        target += 3;
      } else if (satisfaction >= 0.7) {
        target -= 1;
      }
    }
    target += Math.round((Number(collectionResult.reputationDelta) || 0) * (actorId === "crown_office" ? 1.5 : 0.4));
    target += Math.round((Number(auditResult.reputationDelta) || 0) * (actorId === "crown_office" ? 2 : 0.3));
    const nextScore = clamp(Math.round(group.score * 0.74 + target * 0.26), 0, 100);
    group.lastShift = clamp(nextScore - group.score, -20, 20);
    group.score = nextScore;
    model.groups[actorId] = group;
  });

  model.crownComplianceStanding = clamp(
    Math.round(model.crownComplianceStanding * 0.55 + crown.complianceScore * 0.45),
    0,
    100
  );

  const rankedCohorts = Object.entries(model.cohorts).sort((a, b) => b[1] - a[1]);
  const topCohort = rankedCohorts[0] || ["locals", 50];
  const lowCohort = rankedCohorts[rankedCohorts.length - 1] || ["locals", 50];
  const rankedGroups = Object.entries(model.groups).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  const topGroup = rankedGroups[0] || ["crown_office", { score: 50 }];
  const lowGroup = rankedGroups[rankedGroups.length - 1] || ["underworld_network", { score: 50 }];
  const topGroupLabel = WORLD_ACTOR_PROFILES[topGroup[0]] ? WORLD_ACTOR_PROFILES[topGroup[0]].label : topGroup[0];
  const lowGroupLabel = WORLD_ACTOR_PROFILES[lowGroup[0]] ? WORLD_ACTOR_PROFILES[lowGroup[0]].label : lowGroup[0];
  const topCohortLabel = COHORT_PROFILES[topCohort[0]] ? COHORT_PROFILES[topCohort[0]].label : topCohort[0];
  const lowCohortLabel = COHORT_PROFILES[lowCohort[0]] ? COHORT_PROFILES[lowCohort[0]].label : lowCohort[0];

  const summary =
    `${topCohortLabel} standing ${Math.round(topCohort[1])}, ${lowCohortLabel} standing ${Math.round(lowCohort[1])}. ` +
    `${topGroupLabel} ${Math.round(topGroup[1].score)}, ${lowGroupLabel} ${Math.round(lowGroup[1].score)}. ` +
    `Crown compliance standing ${model.crownComplianceStanding}.`;
  model.lastSummary = summary;
  model.history.unshift({
    day: state.day,
    type: "daily",
    note: summary
  });
  if (model.history.length > 48) {
    model.history.length = 48;
  }

  return {
    summary,
    topCohortLabel,
    topCohortScore: Math.round(topCohort[1]),
    lowCohortLabel,
    lowCohortScore: Math.round(lowCohort[1]),
    topGroupLabel,
    topGroupScore: Math.round(topGroup[1].score),
    lowGroupLabel,
    lowGroupScore: Math.round(lowGroup[1].score),
    crownComplianceStanding: model.crownComplianceStanding
  };
}

function recordSupplierHistory(type, note) {
  const suppliers = state.world.suppliers;
  suppliers.history.unshift({
    day: state.day,
    type: typeof type === "string" ? type : "note",
    note: typeof note === "string" ? note : ""
  });
  if (suppliers.history.length > 32) {
    suppliers.history.length = 32;
  }
}

function getSupplierCurrentMarket() {
  const world = state.world && typeof state.world === "object" ? state.world : null;
  if (!world || !world.suppliers || !world.suppliers.markets) {
    return null;
  }
  return world.suppliers.markets[world.currentDistrict] || null;
}

function isMerchantWindowActiveForDistrict(suppliers, districtId) {
  return Boolean(
    suppliers &&
    suppliers.merchant &&
    suppliers.merchant.visitWindowDays > 0 &&
    suppliers.merchant.targetDistrict === districtId
  );
}

function isCaravanWindowActiveForDistrict(suppliers, districtId) {
  return Boolean(
    suppliers &&
    suppliers.caravan &&
    suppliers.caravan.windowDays > 0 &&
    suppliers.caravan.targetDistrict === districtId
  );
}

function getSupplierVolatilityCostMult(volatility) {
  return clamp(0.8 + (Math.max(0, volatility) / 100) * 0.48, 0.78, 1.36);
}

function getSupplierContractCostMult(suppliers, districtId) {
  let multiplier = 1;
  if (suppliers.contracts.localBrokerDays > 0) {
    multiplier *= 0.92;
  }
  if (suppliers.contracts.arcanumWholesaleDays > 0) {
    multiplier *= districtId.startsWith("arcanum") ? 0.82 : 0.9;
  }
  return clamp(multiplier, 0.72, 1);
}

function mergeIncomingSupplyStats(item, incomingAmount, incomingQuality, incomingFreshness) {
  if (!isSupplyItem(item) || incomingAmount <= 0) {
    return;
  }
  const oldQty = state.inventory[item];
  state.inventory[item] += incomingAmount;
  const nextQty = state.inventory[item];
  state.supplyStats[item].quality = Math.round(
    (state.supplyStats[item].quality * oldQty + incomingQuality * incomingAmount) / Math.max(1, nextQty)
  );
  state.supplyStats[item].freshness = Math.round(
    (state.supplyStats[item].freshness * oldQty + incomingFreshness * incomingAmount) / Math.max(1, nextQty)
  );
}

function buildCityStockRunBundle(bundleScale, volatility, contractBoost = 1) {
  const scale = Math.max(0.8, Math.min(1.8, Number(bundleScale) || 1));
  const template = {
    grain: 14,
    hops: 12,
    honey: 7,
    meat: 9,
    veg: 12,
    bread: 12,
    wood: 15
  };

  return Object.entries(template).map(([item, baseAmount]) => {
    const amount = Math.max(1, Math.round(baseAmount * scale + randInt(-2, 2)));
    const meta = SUPPLY_META[item];
    const quality = clamp(
      Math.round(
        meta.baseQuality +
          7 * contractBoost -
          (volatility / 100) * 8 +
          randInt(-Math.ceil(meta.qualityVariance / 2), Math.ceil(meta.qualityVariance / 2))
      ),
      36,
      98
    );
    const freshness = clamp(Math.round(78 + contractBoost * 8 - volatility / 8 + randInt(-6, 8)), 35, 100);
    return { item, amount, quality, freshness };
  });
}

function signLocalBrokerContract() {
  const actionWindow = requireActionWindow("local_contract");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  normalizeWorldState();
  const merchantStanding = getWorldActors().merchant_houses.standing;
  const suppliers = state.world.suppliers;
  const discount = merchantStanding >= 60 ? 3 : 0;
  const fee = Math.max(16, 24 - discount);
  const cadence = enforceActionCadence("local_contract", { perMinute: true, perDay: true });
  if (!cadence.ok) {
    logLine(cadence.error, "bad");
    render();
    return { ok: false, error: cadence.error };
  }
  if (!spendGold(fee, "Local broker contract")) {
    return { ok: false, error: "Not enough gold to secure local broker terms." };
  }

  const extension = randInt(5, 7);
  suppliers.contracts.localBrokerDays = Math.min(16, suppliers.contracts.localBrokerDays + extension);
  const note = `Local broker contract signed (${suppliers.contracts.localBrokerDays}d active, ${formatCoin(fee)} retainer).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("contract_local", note);
  logLine(note, "good");
  render();
  return { ok: true, days: suppliers.contracts.localBrokerDays, fee };
}

function signArcanumWholesaleContract() {
  const actionWindow = requireActionWindow("wholesale_contract");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  normalizeWorldState();
  const district = getCurrentDistrictProfile();
  const suppliers = state.world.suppliers;
  const merchantWindow = isMerchantWindowActiveForDistrict(suppliers, district.id);
  const canSign = district.id.startsWith("arcanum") || merchantWindow;
  if (!canSign) {
    return {
      ok: false,
      error: "Wholesale terms require Arcanum presence or an active merchant visit in your district."
    };
  }

  const fee = merchantWindow ? 28 : 36;
  const cadence = enforceActionCadence("wholesale_contract", { perMinute: true, perDay: true });
  if (!cadence.ok) {
    logLine(cadence.error, "bad");
    render();
    return { ok: false, error: cadence.error };
  }
  if (!spendGold(fee, "Arcanum wholesale contract")) {
    return { ok: false, error: "Not enough gold for wholesale contract terms." };
  }

  const extension = randInt(4, 6);
  suppliers.contracts.arcanumWholesaleDays = Math.min(
    14,
    suppliers.contracts.arcanumWholesaleDays + extension
  );
  const note = `Arcanum wholesale papers sealed (${suppliers.contracts.arcanumWholesaleDays}d active, ${formatCoin(fee)}).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("contract_wholesale", note);
  logLine(note, "good");
  render();
  return { ok: true, days: suppliers.contracts.arcanumWholesaleDays, fee };
}

function scheduleCityStockRun(bundleScale = 1) {
  const actionWindow = requireActionWindow("city_stock_run");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  normalizeWorldState();
  const suppliers = state.world.suppliers;
  if (suppliers.stockRun.daysRemaining > 0) {
    return { ok: false, error: "A city stock-up trip is already in progress." };
  }
  if (isDistrictTravelActive()) {
    return { ok: false, error: "Schedule the stock run after district travel completes." };
  }

  const district = getCurrentDistrictProfile();
  if (district.id.startsWith("arcanum")) {
    return { ok: false, error: "City stock-up runs are only needed when operating outside Arcanum." };
  }

  const outbound = getDistrictTravelLink(district.id, "arcanum_market");
  const inbound = getDistrictTravelLink("arcanum_market", district.id);
  if (!outbound || !inbound) {
    return { ok: false, error: "No valid logistics route to Arcanum market from this district." };
  }

  const availableStaff = state.staff.filter((person) => !isStaffUnavailable(person));
  if (availableStaff.length === 0) {
    return { ok: false, error: "No available staff can be assigned to the stock run today." };
  }
  const assigned = availableStaff.sort((a, b) => b.service - a.service)[0];
  const scale = clamp(Number(bundleScale) || 1, 0.8, 1.8);
  const logisticsCost = Math.round((outbound.cost + inbound.cost + 10) * scale);
  const cargoDeposit = Math.round((42 + randInt(0, 18)) * scale);
  const totalCost = logisticsCost + cargoDeposit;
  const cadence = enforceActionCadence("city_stock_run", { perMinute: true, perWeek: true });
  if (!cadence.ok) {
    logLine(cadence.error, "bad");
    render();
    return { ok: false, error: cadence.error };
  }

  if (!spendGold(totalCost, "City stock-up run")) {
    return { ok: false, error: "Not enough gold for logistics and cargo deposit." };
  }

  suppliers.stockRun.daysRemaining = Math.max(2, outbound.days + inbound.days);
  suppliers.stockRun.targetDistrict = district.id;
  suppliers.stockRun.assignedStaffId = assigned.id;
  suppliers.stockRun.bundleScale = scale;
  assigned.fatigue = clamp(assigned.fatigue + randInt(5, 10), 0, 100);

  const note = `Stock run dispatched to Arcanum (${suppliers.stockRun.daysRemaining}d, ${formatCoin(totalCost)} committed).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("stock_run_start", note);
  logLine(note, "neutral");
  render();
  return { ok: true, days: suppliers.stockRun.daysRemaining, cost: totalCost, assignedStaffId: assigned.id };
}

function progressSupplierNetwork() {
  normalizeWorldState();
  const worldMods = getWorldRuntimeModifiers();
  const worldActors = getWorldActors();
  const merchants = worldActors.merchant_houses;
  const underworld = worldActors.underworld_network;
  const suppliers = state.world.suppliers;
  const currentDistrictId = state.world.currentDistrict;
  let notableSummary = "";

  if (suppliers.contracts.localBrokerDays > 0) {
    suppliers.contracts.localBrokerDays -= 1;
  }
  if (suppliers.contracts.arcanumWholesaleDays > 0) {
    suppliers.contracts.arcanumWholesaleDays -= 1;
  }

  const merchantPressure = merchants ? (50 - merchants.standing) / 18 : 0;
  const underworldPressure = underworld ? (underworld.standing - 50) / 20 : 0;
  let volatilityShift = randInt(-4, 4) + Math.round(merchantPressure + underworldPressure);
  if (suppliers.merchant.visitWindowDays > 0) {
    volatilityShift -= 1;
  }
  if (suppliers.caravan.windowDays > 0) {
    volatilityShift -= 1;
  }
  suppliers.volatility = clamp(suppliers.volatility + volatilityShift, 5, 95);

  if (suppliers.merchant.visitWindowDays > 0) {
    suppliers.merchant.visitWindowDays -= 1;
    if (suppliers.merchant.visitWindowDays <= 0) {
      suppliers.merchant.daysUntilVisit = randInt(4, 8);
      const note = `Merchant delegation departed ${resolveDistrict(
        suppliers.merchant.targetDistrict,
        state.world.activeLocation
      ).label}.`;
      recordSupplierHistory("merchant_departure", note);
    }
  } else {
    suppliers.merchant.daysUntilVisit = Math.max(0, suppliers.merchant.daysUntilVisit - 1);
    if (suppliers.merchant.daysUntilVisit <= 0) {
      suppliers.merchant.visitWindowDays = randInt(1, 3);
      suppliers.merchant.targetDistrict = pick(Object.keys(DISTRICT_PROFILES));
      const merchantDistrict = resolveDistrict(suppliers.merchant.targetDistrict, state.world.activeLocation);
      const note = `Merchant delegation opened contract talks in ${merchantDistrict.label} (${suppliers.merchant.visitWindowDays}d).`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("merchant_arrival", note);
      logLine(note, "good");
      notableSummary = note;
    }
  }

  const caravanDistrictPool = Object.keys(DISTRICT_PROFILES).filter(
    (districtId) => districtId.includes("docks") || districtId.includes("wharf")
  );
  if (suppliers.caravan.windowDays > 0) {
    suppliers.caravan.windowDays -= 1;
    if (suppliers.caravan.windowDays <= 0) {
      suppliers.caravan.daysUntilWindow = randInt(4, 7);
      const note = `Caravan window closed in ${resolveDistrict(
        suppliers.caravan.targetDistrict,
        state.world.activeLocation
      ).label}.`;
      recordSupplierHistory("caravan_close", note);
    }
  } else {
    suppliers.caravan.daysUntilWindow = Math.max(0, suppliers.caravan.daysUntilWindow - 1);
    if (suppliers.caravan.daysUntilWindow <= 0) {
      suppliers.caravan.windowDays = randInt(1, 2);
      suppliers.caravan.targetDistrict = pick(
        caravanDistrictPool.length > 0 ? caravanDistrictPool : Object.keys(DISTRICT_PROFILES)
      );
      const caravanDistrict = resolveDistrict(suppliers.caravan.targetDistrict, state.world.activeLocation);
      const note = `Caravan convoys opened in ${caravanDistrict.label} (${suppliers.caravan.windowDays}d).`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("caravan_open", note);
      logLine(note, "neutral");
      notableSummary = note;
    }
  }

  if (suppliers.stockRun.daysRemaining > 0) {
    suppliers.stockRun.daysRemaining -= 1;
    if (suppliers.stockRun.daysRemaining <= 0) {
      const destinationDistrict = resolveDistrict(suppliers.stockRun.targetDistrict, state.world.activeLocation);
      const wholesaleBoost = suppliers.contracts.arcanumWholesaleDays > 0 ? 1.2 : 1;
      const bundle = buildCityStockRunBundle(
        suppliers.stockRun.bundleScale,
        suppliers.volatility,
        wholesaleBoost
      );

      bundle.forEach((entry) => {
        mergeIncomingSupplyStats(entry.item, entry.amount, entry.quality, entry.freshness);
      });

      const assignedStaff = state.staff.find((person) => person.id === suppliers.stockRun.assignedStaffId);
      if (assignedStaff) {
        assignedStaff.morale = clamp(assignedStaff.morale + 2, 0, 100);
      }

      const haul = bundle.map((entry) => `${entry.item}+${entry.amount}`).join(", ");
      const note = `City stock run returned to ${destinationDistrict.label}: ${haul}.`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("stock_run_return", note);
      logLine(note, "good");
      suppliers.stockRun.daysRemaining = 0;
      suppliers.stockRun.assignedStaffId = "";
      suppliers.stockRun.targetDistrict = "arcanum_market";
      suppliers.stockRun.bundleScale = 1;
      notableSummary = note;
    }
  }

  Object.values(suppliers.markets).forEach((market) => {
    Object.keys(SUPPLY_META).forEach((item) => {
      const baseRestock =
        item === "wood"
          ? 6
          : item === "bread"
            ? 5
            : item === "honey"
              ? 3
              : item === "meat"
                ? 4
                : 5;
      const volatilityDrag = clamp(1 - suppliers.volatility / 150, 0.35, 1);
      let restock = baseRestock * market.restockMult * volatilityDrag * worldMods.supplyReliabilityMult;

      if (isMerchantWindowActiveForDistrict(suppliers, market.districtId)) {
        restock *= 1.24;
      }
      if (isCaravanWindowActiveForDistrict(suppliers, market.districtId)) {
        restock *= 1.32;
      }
      if (suppliers.contracts.localBrokerDays > 0 && market.districtId === currentDistrictId) {
        restock *= 1.12;
      }
      if (suppliers.contracts.arcanumWholesaleDays > 0 && market.districtId.startsWith("arcanum")) {
        restock *= 1.18;
      }

      const restockUnits = Math.max(0, Math.round(restock + randInt(-1, 1)));
      const ambientDrain = market.districtId.startsWith("arcanum") ? randInt(1, 3) : randInt(0, 2);
      market.stock[item] = clamp(market.stock[item] + restockUnits - ambientDrain, 0, 180);
    });
  });

  const currentMarket = suppliers.markets[currentDistrictId];
  const lowStockCount = currentMarket
    ? Object.values(currentMarket.stock).filter((amount) => amount <= 8).length
    : 0;

  if (!notableSummary) {
    if (isMerchantWindowActiveForDistrict(suppliers, currentDistrictId)) {
      notableSummary = "Merchant visit active in district: contract and lot terms improved today.";
    } else if (isCaravanWindowActiveForDistrict(suppliers, currentDistrictId)) {
      notableSummary = "Caravan window active nearby: local stalls received heavier lots.";
    } else if (lowStockCount >= 3) {
      notableSummary = "Local market ran thin on several staples; logistics planning is advised.";
    } else if (suppliers.volatility >= 72) {
      notableSummary = "Supplier volatility spiked; expect inconsistent prices and lot size.";
    } else {
      notableSummary = "Supplier routes stable. Baseline market replenishment completed.";
    }
  }

  suppliers.lastSupplyEvent = notableSummary;
  return notableSummary;
}

function createInitialState(locationId = DEFAULT_STARTING_LOCATION) {
  const startingLocation = resolveStartingLocation(locationId);
  const startingDistrict = resolveDistrictForLocation(startingLocation.id);
  const startingActors = createWorldActors(startingLocation.id, startingDistrict.id);
  const initialCrown = createCrownAuthorityState();
  const initialReputationModel = createWorldReputationState(
    null,
    startingLocation.id,
    startingActors,
    initialCrown.complianceScore
  );
  const initialWorldReporting = createWorldReportingState(null, 1);
  const actorList = Object.values(startingActors).sort((a, b) => b.standing - a.standing);
  const highestActor = actorList[0];
  const lowestActor = actorList[actorList.length - 1];
  return {
    day: 1,
    manager: normalizeManagerState(null, 1, startingLocation.id),
    world: {
      startingLocation: startingLocation.id,
      activeLocation: startingLocation.id,
      locationLabel: startingLocation.label,
      locationTitle: startingLocation.title,
      locationSummary: startingLocation.summary,
      currentDistrict: startingDistrict.id,
      currentDistrictLabel: startingDistrict.label,
      currentDistrictSummary: startingDistrict.summary,
      rivalTaverns: startingDistrict.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      })),
      actors: startingActors,
      effects: createWorldEffectState(),
      crown: initialCrown,
      suppliers: createSupplierNetworkState(null, startingLocation.id),
      rivals: createRivalSimulationState(null, startingDistrict.id),
      reputationModel: initialReputationModel,
      reporting: initialWorldReporting,
      lastActorEvent: null,
      travelDaysRemaining: 0,
      travelDestination: null,
      travelDestinationLabel: "",
      travelRouteCost: 0,
      travelRouteDays: 0
    },
    clock: createSimulationClockState(),
    timeflow: createTimeflowRuntimeState(),
    gold: 260,
    reputation: 45,
    condition: 70,
    cleanliness: 74,
    marketingDays: 0,
    festivalDays: 0,
    lastGuests: 0,
    lastRevenue: 0,
    lastExpenses: 0,
    lastNet: 0,
    inventory: {
      ale: 52,
      mead: 24,
      stew: 30,
      bread: 22,
      grain: 20,
      hops: 15,
      honey: 10,
      meat: 14,
      veg: 16,
      wood: 18
    },
    supplyStats: createSupplyStats(),
    rotaPreset: "balanced",
    productionQualitySum: 0,
    productionBatches: 0,
    prices: { ...PRICE_DEFAULTS },
    staff: [
      createStaff("barkeep"),
      createStaff("cook"),
      createStaff("server")
    ],
    patrons: createPatronPool(30),
    lastReport: {
      loyaltyDemandMult: 1,
      topCohort: "locals",
      lowCohort: "locals",
      topCohortLoyalty: 50,
      lowCohortLoyalty: 50,
      highlight: "The regular crowd is settling in.",
      staffing: "Rota steady. No absences.",
      supplies: "Supply freshness is stable.",
      supplierSummary: "Local market running on baseline stock.",
      rivalSummary: "Rival taverns held steady. No direct pressure swing today.",
      kitchen: 60,
      satisfaction: 64,
      crownTax: 0,
      crownDue: 0,
      crownPayment: 0,
      reputationSummary: initialReputationModel.lastSummary,
      topCohortStandingLabel: "Locals",
      topCohortStandingScore: initialReputationModel.cohorts.locals,
      lowCohortStandingLabel: "Locals",
      lowCohortStandingScore: initialReputationModel.cohorts.locals,
      topGroupStandingLabel: highestActor.label,
      topGroupStandingScore: initialReputationModel.groups[highestActor.id].score,
      lowGroupStandingLabel: lowestActor.label,
      lowGroupStandingScore: initialReputationModel.groups[lowestActor.id].score,
      crownComplianceStanding: initialReputationModel.crownComplianceStanding,
      worldLayerSummary:
        `District ${startingDistrict.label}. ${initialReputationModel.lastSummary} ` +
        "Supplier, rivalry, Crown, and actor systems initialized.",
      weeklyWorldSummary: initialWorldReporting.lastWeeklySummary,
      district: startingDistrict.label,
      events: "No major district or calendar event today.",
      actorEvent: "Influence climate steady. No major factions moved today.",
      actorSummary: `${highestActor.label} standing ${highestActor.standing}, ${lowestActor.label} standing ${lowestActor.standing}.`,
      crownSummary: "Crown ledger current. Next collection due on Day 7.",
      objectiveSummary: "Objective board not generated yet.",
      seasonSummary: "Year 1, Spring week 1.",
      managerToolingSummary: "Command board and delegation desks are standing by.",
      compliance: initialCrown.complianceScore,
      rivalPressure: Math.round(
        (startingDistrict.rivalTaverns.reduce((sum, rival) => sum + rival.pressure, 0) /
          Math.max(1, startingDistrict.rivalTaverns.length)) *
          100
      )
    },
    log: []
  };
}

const state = createInitialState();
const stateTemplate = cloneData(state);

let initialized = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randInt(min, max) {
    return random.randomInt(min, max);
  }

  function pick(arr) {
    return random.pick(arr);
  }

  function getActiveLocationProfile() {
    const locationId = state.world && typeof state.world === "object"
      ? state.world.activeLocation || state.world.startingLocation
      : null;
    return resolveStartingLocation(locationId);
  }

  function getCurrentDistrictProfile() {
    const location = getActiveLocationProfile();
    const districtId = state.world && typeof state.world === "object"
      ? state.world.currentDistrict
      : null;
    return resolveDistrict(districtId, location.id);
  }

  function isDistrictTravelActive() {
    return Boolean(
      state.world &&
      typeof state.world === "object" &&
      Number(state.world.travelDaysRemaining) > 0 &&
      state.world.travelDestination
    );
  }

  function getDistrictTravelLink(fromDistrictId, toDistrictId) {
    const routes = DISTRICT_TRAVEL_LINKS[fromDistrictId];
    if (!routes) {
      return null;
    }
    const route = routes[toDistrictId];
    if (!route) {
      return null;
    }
    const days = Math.max(1, Math.round(route.days || 1));
    const cost = Math.max(0, Math.round(route.cost || 0));
    return { days, cost };
  }

  function listTravelOptions() {
    const currentDistrict = getCurrentDistrictProfile();
    const routes = DISTRICT_TRAVEL_LINKS[currentDistrict.id] || {};
    return Object.entries(routes)
      .map(([destinationId, route]) => {
        const destination = resolveDistrict(destinationId, currentDistrict.locationId);
        const location = resolveStartingLocation(destination.locationId);
        return {
          destinationId: destination.id,
          destinationLabel: destination.label,
          locationId: location.id,
          locationLabel: location.label,
          days: Math.max(1, Math.round(route.days || 1)),
          cost: Math.max(0, Math.round(route.cost || 0))
        };
      })
      .sort((a, b) => a.days - b.days || a.cost - b.cost || a.destinationLabel.localeCompare(b.destinationLabel));
  }

  function getWorldActors() {
    normalizeWorldState();
    return state.world.actors;
  }

  function getWorldEffects() {
    normalizeWorldState();
    return state.world.effects;
  }

  function normalizeWorldState() {
    const current = state.world && typeof state.world === "object" ? state.world : {};
    const startingLocation = resolveStartingLocation(current.startingLocation);
    const activeLocation = resolveStartingLocation(current.activeLocation || startingLocation.id);
    const district = resolveDistrict(current.currentDistrict, activeLocation.id);
    const correctedActiveLocation = resolveStartingLocation(district.locationId);
    const travelDestination =
      typeof current.travelDestination === "string" && DISTRICT_PROFILES[current.travelDestination]
        ? current.travelDestination
        : null;
    const travelDaysRemaining = Math.max(0, Math.round(Number(current.travelDaysRemaining) || 0));
    const destinationDistrict = travelDestination ? DISTRICT_PROFILES[travelDestination] : null;
    const worldActors = createWorldActors(
      correctedActiveLocation.id,
      district.id,
      current.actors
    );
    const worldEffects = createWorldEffectState(current.effects);
    const crownAuthority = createCrownAuthorityState(current.crown);
    const suppliers = createSupplierNetworkState(current.suppliers, correctedActiveLocation.id);
    const rivals = createRivalSimulationState(current.rivals, district.id);
    const reputationModel = createWorldReputationState(
      current.reputationModel,
      correctedActiveLocation.id,
      worldActors,
      crownAuthority.complianceScore
    );
  const reporting = createWorldReportingState(current.reporting, state.day);
  state.world = {
      ...current,
      startingLocation: startingLocation.id,
      activeLocation: correctedActiveLocation.id,
      locationLabel: correctedActiveLocation.label,
      locationTitle: correctedActiveLocation.title,
      locationSummary: correctedActiveLocation.summary,
      currentDistrict: district.id,
      currentDistrictLabel: district.label,
      currentDistrictSummary: district.summary,
      rivalTaverns: district.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      })),
      actors: worldActors,
      effects: worldEffects,
      crown: crownAuthority,
      suppliers,
      rivals,
      reputationModel,
      reporting,
      lastActorEvent: normalizeActorEventEntry(current.lastActorEvent),
      travelDaysRemaining: travelDaysRemaining > 0 && destinationDistrict ? travelDaysRemaining : 0,
      travelDestination: travelDaysRemaining > 0 && destinationDistrict ? destinationDistrict.id : null,
      travelDestinationLabel: travelDaysRemaining > 0 && destinationDistrict ? destinationDistrict.label : "",
      travelRouteCost: Math.max(0, Math.round(Number(current.travelRouteCost) || 0)),
      travelRouteDays: Math.max(0, Math.round(Number(current.travelRouteDays) || 0))
    };
    state.clock = createSimulationClockState(state.clock);
    state.timeflow = createTimeflowRuntimeState(state.timeflow);
    state.manager = normalizeManagerState(state.manager, state.day, correctedActiveLocation.id);
  }

  function getCrownAuthority() {
    normalizeWorldState();
    return state.world.crown;
  }

  function recordCrownHistory(type, amount, status, note) {
    const crown = getCrownAuthority();
    crown.history.unshift({
      day: state.day,
      type,
      amount: Math.max(0, Math.round(Number(amount) || 0)),
      status,
      note
    });
    if (crown.history.length > 36) {
      crown.history.length = 36;
    }
  }

  function setWorldEffect(effectId, days, value) {
    const effects = getWorldEffects();
    const safeDays = Math.max(0, Math.round(Number(days) || 0));
    switch (effectId) {
      case "supply_cost":
        effects.supplyCostDays = safeDays;
        effects.supplyCostMult = Math.max(0.5, Math.min(1.7, Number(value) || 1));
        break;
      case "supply_reliability":
        effects.supplyReliabilityDays = safeDays;
        effects.supplyReliabilityMult = Math.max(0.45, Math.min(1.5, Number(value) || 1));
        break;
      case "demand":
        effects.demandDays = safeDays;
        effects.demandMult = Math.max(0.7, Math.min(1.45, Number(value) || 1));
        break;
      case "tax_flat":
        effects.taxFlatDays = safeDays;
        effects.taxFlatBonus = Math.max(-10, Math.min(35, Math.round(Number(value) || 0)));
        break;
      case "event_risk":
        effects.eventRiskDays = safeDays;
        effects.eventChanceMult = Math.max(0.6, Math.min(1.6, Number(value) || 1));
        break;
      default:
        break;
    }
  }

  function decayWorldEffects() {
    const effects = getWorldEffects();
    const decayFields = [
      ["supplyCostDays", "supplyCostMult", 1],
      ["supplyReliabilityDays", "supplyReliabilityMult", 1],
      ["demandDays", "demandMult", 1],
      ["taxFlatDays", "taxFlatBonus", 0],
      ["eventRiskDays", "eventChanceMult", 1]
    ];
    decayFields.forEach(([daysKey, valueKey, baseline]) => {
      if (effects[daysKey] > 0) {
        effects[daysKey] -= 1;
        if (effects[daysKey] <= 0) {
          effects[daysKey] = 0;
          effects[valueKey] = baseline;
        }
      }
    });
  }

  function runCrownAuditCheck(worldMods) {
    const crown = getCrownAuthority();
    const crownActor = getWorldActors().crown_office;
    const daysSinceAudit = state.day - crown.lastAuditDay;
    const arrearsPressure = clamp(crown.arrears / 420, 0, 0.55);
    const compliancePressure = clamp((62 - crown.complianceScore) / 100, 0, 0.42);
    const standardsPressure =
      state.cleanliness < 45 || state.condition < 45 ? 0.06 : 0;
    const crownTension = crownActor ? clamp((50 - crownActor.standing) / 100, 0, 0.25) : 0;
    let chance = 0.06 + arrearsPressure + compliancePressure + standardsPressure + crownTension;
    chance *= worldMods.eventChanceMult;
    if (daysSinceAudit <= 2) {
      chance *= 0.35;
    }
    chance = clamp(chance, 0.02, 0.62);
    if (random.nextFloat() > chance) {
      return {
        auditTriggered: false,
        reputationDelta: 0,
        immediateExpense: 0,
        summary: ""
      };
    }

    crown.lastAuditDay = state.day;
    const auditQuality =
      crown.complianceScore * 0.45 +
      state.cleanliness * 0.28 +
      state.condition * 0.22 +
      randInt(-14, 14);

    if (auditQuality < 54) {
      const penalty =
        randInt(18, 36) +
        Math.round(crown.pendingTax * 0.08) +
        Math.round(crown.arrears * 0.12);
      const immediateExpense = randInt(6, 12);
      crown.arrears += penalty;
      crown.complianceScore = clamp(crown.complianceScore - randInt(5, 11), 0, 100);
      crown.auditFailures += 1;
      shiftWorldActorStanding("crown_office", -2);
      setWorldEffect("tax_flat", 2, 7);
      recordCrownHistory(
        "audit",
        penalty,
        "failed",
        `Audit failure: ${formatCoin(penalty)} added to arrears.`
      );
      return {
        auditTriggered: true,
        reputationDelta: -2,
        immediateExpense,
        summary: `Royal audit failed. Penalty ${formatCoin(penalty)} moved to arrears.`,
        tone: "bad"
      };
    }

    const waiver = Math.min(crown.arrears, randInt(3, 10));
    crown.arrears -= waiver;
    crown.complianceScore = clamp(crown.complianceScore + randInt(2, 6), 0, 100);
    crown.auditPasses += 1;
    shiftWorldActorStanding("crown_office", 1);
    recordCrownHistory(
      "audit",
      waiver,
      "passed",
      waiver > 0
        ? `Audit pass: ${formatCoin(waiver)} arrears waived.`
        : "Audit pass: records accepted."
    );
    return {
      auditTriggered: true,
      reputationDelta: 1,
      immediateExpense: 0,
      summary:
        waiver > 0
          ? `Royal audit passed. ${formatCoin(waiver)} arrears waived.`
          : "Royal audit passed. Crown records accepted.",
      tone: "good"
    };
  }

  function resolveCrownCollection(crownTaxAccrued, revenue, operatingExpenses) {
    const crown = getCrownAuthority();
    crown.pendingTax += Math.max(0, Math.round(crownTaxAccrued));
    if (state.day < crown.nextCollectionDay) {
      return {
        taxPayment: 0,
        dueToday: 0,
        collectionSummary: `Next Crown collection on Day ${crown.nextCollectionDay}.`,
        reputationDelta: 0
      };
    }

    const dueToday = Math.max(0, Math.round(crown.pendingTax + crown.arrears));
    const payableNow = Math.max(0, Math.floor(state.gold + revenue - operatingExpenses));
    const taxPayment = Math.min(dueToday, payableNow);
    let remaining = dueToday - taxPayment;
    let reputationDelta = 0;
    let collectionSummary = "";

    crown.pendingTax = 0;
    crown.arrears = remaining;
    crown.nextCollectionDay = state.day + crown.cadenceDays;

    if (remaining > 0) {
      const surcharge = Math.max(5, Math.round(remaining * 0.08));
      crown.arrears += surcharge;
      crown.complianceScore = clamp(crown.complianceScore - randInt(4, 9), 0, 100);
      shiftWorldActorStanding("crown_office", -2);
      reputationDelta -= 2;
      setWorldEffect("tax_flat", 2, 6);
      recordCrownHistory(
        "collection",
        taxPayment,
        "partial",
        `Collected ${formatCoin(taxPayment)} against ${formatCoin(dueToday)} due; surcharge ${formatCoin(surcharge)}.`
      );
      collectionSummary = `Crown collected ${formatCoin(taxPayment)} of ${formatCoin(dueToday)} due. Arrears now ${formatCoin(crown.arrears)}.`;
      return {
        taxPayment,
        dueToday,
        collectionSummary,
        reputationDelta
      };
    }

    crown.complianceScore = clamp(crown.complianceScore + randInt(1, 4), 0, 100);
    shiftWorldActorStanding("crown_office", 1);
    recordCrownHistory(
      "collection",
      taxPayment,
      "paid",
      `Collected full due amount ${formatCoin(taxPayment)}.`
    );
    collectionSummary = `Crown collection settled in full (${formatCoin(taxPayment)}). Next due Day ${crown.nextCollectionDay}.`;
    return {
      taxPayment,
      dueToday,
      collectionSummary,
      reputationDelta
    };
  }

  function settleCrownArrears(amount = null) {
    const actionWindow = requireActionWindow("settle_arrears");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const crown = getCrownAuthority();
    if (crown.arrears <= 0) {
      logLine("No Crown arrears are currently outstanding.", "neutral");
      render();
      return { ok: false, error: "No arrears to settle." };
    }
    const requested =
      amount === null || amount === undefined || amount === ""
        ? crown.arrears
        : Math.max(1, Math.round(Number(amount) || 0));
    const payment = Math.min(requested, state.gold, crown.arrears);
    if (payment <= 0) {
      logLine("You do not have enough gold to settle Crown arrears.", "bad");
      render();
      return { ok: false, error: "Not enough gold to settle arrears." };
    }
    state.gold -= payment;
    crown.arrears -= payment;
    const scoreLift = clamp(Math.round(payment / 35), 1, 7);
    crown.complianceScore = clamp(crown.complianceScore + scoreLift, 0, 100);
    shiftWorldActorStanding("crown_office", scoreLift >= 4 ? 2 : 1);
    recordCrownHistory(
      "arrears_payment",
      payment,
      "paid",
      `Manual arrears payment of ${formatCoin(payment)}.`
    );
    logLine(`Paid ${formatCoin(payment)} to the Crown arrears office.`, "good");
    render();
    return { ok: true, payment, remainingArrears: crown.arrears };
  }

  function fileComplianceReport() {
    const actionWindow = requireActionWindow("file_compliance");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const crown = getCrownAuthority();
    const filingCost = 12;
    if (!spendGold(filingCost, "Voluntary tax filing")) {
      return { ok: false, error: "Not enough gold for filing." };
    }
    const scoreLift = randInt(2, 5);
    crown.complianceScore = clamp(crown.complianceScore + scoreLift, 0, 100);
    shiftWorldActorStanding("crown_office", 1);
    setWorldEffect("event_risk", 2, 0.9);
    if (crown.arrears > 0) {
      const goodwillCut = Math.min(crown.arrears, randInt(2, 7));
      crown.arrears -= goodwillCut;
      recordCrownHistory(
        "voluntary_filing",
        filingCost,
        "accepted",
        `Filed voluntary report; ${formatCoin(goodwillCut)} arrears forgiven.`
      );
      logLine(
        `Voluntary filing accepted (+${scoreLift} compliance). Crown reduced arrears by ${formatCoin(goodwillCut)}.`,
        "good"
      );
      render();
      return { ok: true, scoreLift, goodwillCut };
    }
    recordCrownHistory(
      "voluntary_filing",
      filingCost,
      "accepted",
      "Filed voluntary report and compliance statement."
    );
    logLine(`Voluntary filing accepted (+${scoreLift} compliance standing).`, "good");
    render();
    return { ok: true, scoreLift, goodwillCut: 0 };
  }

  function getActorSupport(actorId) {
    const actor = getWorldActors()[actorId];
    if (!actor) {
      return { actorId, support: 0, tension: 0, influence: 0 };
    }
    const influence = clamp(actor.influence / 100, 0, 1.2);
    const standingShift = clamp((actor.standing - 50) / 50, -1, 1);
    return {
      actorId,
      support: standingShift * influence,
      tension: -standingShift * influence,
      influence
    };
  }

  function getWorldRuntimeModifiers() {
    const crown = getActorSupport("crown_office");
    const council = getActorSupport("civic_council");
    const merchants = getActorSupport("merchant_houses");
    const underworld = getActorSupport("underworld_network");
    const crownAuthority = getCrownAuthority();
    const effects = getWorldEffects();
    const rivalList = state.world && Array.isArray(state.world.rivalTaverns) ? state.world.rivalTaverns : [];
    const rivalPressureRaw = rivalList.reduce((sum, rival) => sum + (Number(rival.pressure) || 0), 0);
    const staticRivalPressure = rivalList.length > 0 ? rivalPressureRaw / rivalList.length : 0;
    const rivalryState =
      state.world &&
      state.world.rivals &&
      state.world.rivals.districts &&
      state.world.rivals.districts[state.world.currentDistrict]
        ? state.world.rivals.districts[state.world.currentDistrict]
        : null;
    const rivalPressure = clamp(
      rivalryState ? Number(rivalryState.demandPressure) || staticRivalPressure : staticRivalPressure,
      0,
      0.76
    );
    const rivalPricePressure = clamp(
      rivalryState ? Number(rivalryState.pricePressure) || rivalPressure * 0.68 : rivalPressure * 0.68,
      0,
      0.74
    );
    const rivalReputationPressure = clamp(
      rivalryState ? Number(rivalryState.reputationPressure) || rivalPressure * 0.54 : rivalPressure * 0.54,
      0,
      0.56
    );

    let demandMult =
      1 +
      council.support * 0.08 +
      merchants.support * 0.06 +
      underworld.support * 0.03 -
      crown.tension * 0.04 -
      underworld.tension * 0.05;
    demandMult *= 1 - rivalPressure * (0.13 + Math.max(0, merchants.tension) * 0.06);

    let supplyCostMult =
      1 -
      merchants.support * 0.09 +
      crown.tension * 0.03 +
      underworld.tension * 0.05;

    let supplyReliabilityMult =
      1 +
      merchants.support * 0.12 +
      council.support * 0.03 -
      underworld.tension * 0.09;

    let eventChanceMult =
      1 +
      crown.tension * 0.18 +
      underworld.tension * 0.16 -
      council.support * 0.06;
    const complianceDrift = clamp((crownAuthority.complianceScore - 60) / 100, -0.35, 0.35);

    const taxRateBonus =
      Math.max(0, crown.tension) * 0.055 -
      Math.max(0, crown.support) * 0.01 +
      Math.max(0, -complianceDrift) * 0.03 -
      Math.max(0, complianceDrift) * 0.012;
    let taxFlatBonus =
      Math.round(Math.max(0, crown.tension * 12)) +
      Math.min(18, Math.round(crownAuthority.arrears / 95));
    demandMult *= 1 - Math.max(0, -complianceDrift) * 0.08;
    eventChanceMult *= 1 + Math.max(0, -complianceDrift) * 0.24;

    if (effects.demandDays > 0) {
      demandMult *= effects.demandMult;
    }
    if (effects.supplyCostDays > 0) {
      supplyCostMult *= effects.supplyCostMult;
    }
    if (effects.supplyReliabilityDays > 0) {
      supplyReliabilityMult *= effects.supplyReliabilityMult;
    }
    if (effects.eventRiskDays > 0) {
      eventChanceMult *= effects.eventChanceMult;
    }
    if (effects.taxFlatDays > 0) {
      taxFlatBonus += effects.taxFlatBonus;
    }

    return {
      demandMult: clamp(demandMult, 0.72, 1.45),
      supplyCostMult: clamp(supplyCostMult, 0.7, 1.65),
      supplyReliabilityMult: clamp(supplyReliabilityMult, 0.55, 1.45),
      eventChanceMult: clamp(eventChanceMult, 0.68, 1.65),
      taxRateBonus: clamp(taxRateBonus, -0.01, 0.08),
      taxFlatBonus: Math.max(-8, Math.min(36, taxFlatBonus)),
      rivalPressure: clamp(rivalPressure, 0, 0.76),
      rivalPricePressure,
      rivalReputationPressure
    };
  }

  function shiftWorldActorStanding(actorId, delta) {
    const actors = getWorldActors();
    const actor = actors[actorId];
    if (!actor) {
      return;
    }
    const shift = Math.round(Number(delta) || 0);
    actor.standing = clamp(actor.standing + shift, 0, 100);
    actor.lastShift = shift;
  }

  function pickWeightedActorId(actors) {
    const entries = Object.values(actors || {}).filter((actor) => actor.influence > 0);
    if (entries.length === 0) {
      return null;
    }
    const totalWeight = entries.reduce((sum, actor) => sum + actor.influence, 0);
    let cursor = random.nextFloat() * totalWeight;
    for (let i = 0; i < entries.length; i += 1) {
      cursor -= entries[i].influence;
      if (cursor <= 0) {
        return entries[i].id;
      }
    }
    return entries[entries.length - 1].id;
  }

  function createDayMods() {
    return {
      demandMult: 1,
      flatGuests: 0,
      qualityBoost: 0,
      reputation: 0,
      expense: 0,
      cleanliness: 0,
      condition: 0,
      taxBonus: 0
    };
  }

  function mergeDayMods(primary, secondary) {
    const left = primary || createDayMods();
    const right = secondary || createDayMods();
    return {
      demandMult: (left.demandMult ?? 1) * (right.demandMult ?? 1),
      flatGuests: (left.flatGuests ?? 0) + (right.flatGuests ?? 0),
      qualityBoost: (left.qualityBoost ?? 0) + (right.qualityBoost ?? 0),
      reputation: (left.reputation ?? 0) + (right.reputation ?? 0),
      expense: (left.expense ?? 0) + (right.expense ?? 0),
      cleanliness: (left.cleanliness ?? 0) + (right.cleanliness ?? 0),
      condition: (left.condition ?? 0) + (right.condition ?? 0),
      taxBonus: (left.taxBonus ?? 0) + (right.taxBonus ?? 0)
    };
  }

  function rollWorldActorEventHook() {
    const actors = getWorldActors();
    const actorList = Object.values(actors);
    const volatility =
      actorList.reduce((sum, actor) => sum + Math.abs(actor.standing - 50) * actor.influence, 0) /
      Math.max(1, actorList.reduce((sum, actor) => sum + actor.influence, 0));
    const chance = clamp(0.22 + (volatility / 50) * 0.32, 0.16, 0.64);
    if (random.nextFloat() > chance) {
      const summary = "Influence climate steady. No major factions moved today.";
      state.world.lastActorEvent = {
        actorId: "",
        label: "Influence Climate",
        tone: "neutral",
        day: state.day,
        summary
      };
      return { mods: createDayMods(), actorSummary: summary };
    }

    const actorId = pickWeightedActorId(actors);
    if (!actorId) {
      const summary = "Influence climate steady. No major factions moved today.";
      state.world.lastActorEvent = {
        actorId: "",
        label: "Influence Climate",
        tone: "neutral",
        day: state.day,
        summary
      };
      return { mods: createDayMods(), actorSummary: summary };
    }

    const actor = actors[actorId];
    const mods = createDayMods();
    let tone = "neutral";
    let summary = "";

    if (actorId === "crown_office") {
      if (actor.standing < 45) {
        const fine = randInt(14, 36);
        const levy = randInt(3, 10);
        mods.expense += fine;
        mods.taxBonus += levy;
        mods.reputation -= 1;
        shiftWorldActorStanding("crown_office", -1);
        summary = `Crown tax officers found irregular filings (${formatCoin(fine)} fine, +${levy}g levy).`;
        tone = "bad";
      } else {
        const royalTraffic = randInt(7, 18);
        mods.flatGuests += royalTraffic;
        mods.reputation += 1;
        mods.taxBonus -= randInt(1, 3);
        shiftWorldActorStanding("crown_office", 1);
        summary = `Crown office issued a clean ledger mark (+${royalTraffic} guest traffic).`;
        tone = "good";
      }
    } else if (actorId === "civic_council") {
      if (actor.standing < 43) {
        const permitDelay = randInt(9, 22);
        mods.expense += permitDelay;
        mods.reputation -= 1;
        mods.condition -= 1;
        shiftWorldActorStanding("civic_council", -1);
        summary = `Council permit delays raised admin costs by ${formatCoin(permitDelay)}.`;
        tone = "bad";
      } else {
        mods.demandMult *= 1.05;
        mods.flatGuests += randInt(4, 11);
        mods.reputation += 1;
        shiftWorldActorStanding("civic_council", 1);
        summary = "Civic council bulletin endorsed your tavern for local gatherings.";
        tone = "good";
      }
    } else if (actorId === "merchant_houses") {
      if (actor.standing < 44) {
        setWorldEffect("supply_reliability", 3, 0.8);
        setWorldEffect("supply_cost", 3, 1.12);
        mods.expense += randInt(6, 14);
        shiftWorldActorStanding("merchant_houses", -1);
        summary = "Merchant houses tightened credit lines (3-day supply squeeze).";
        tone = "bad";
      } else {
        setWorldEffect("supply_cost", 3, 0.86);
        setWorldEffect("supply_reliability", 3, 1.08);
        mods.demandMult *= 1.03;
        shiftWorldActorStanding("merchant_houses", 2);
        summary = "Merchant houses opened preferred contract pricing for 3 days.";
        tone = "good";
      }
    } else if (actorId === "underworld_network") {
      if (actor.standing < 40) {
        const protectionCost = randInt(8, 20);
        mods.expense += protectionCost;
        mods.reputation -= 2;
        mods.cleanliness -= 1;
        setWorldEffect("event_risk", 2, 1.18);
        shiftWorldActorStanding("underworld_network", -1);
        summary = `Underworld collectors demanded protection coin (${formatCoin(protectionCost)}).`;
        tone = "bad";
      } else {
        const cacheItem = pick(["grain", "hops", "honey", "meat", "veg", "wood"]);
        const cacheAmount = randInt(3, 8);
        state.inventory[cacheItem] += cacheAmount;
        setWorldEffect("demand", 2, 1.05);
        shiftWorldActorStanding("underworld_network", 1);
        summary = `A quiet fixer routed extra ${cacheItem} stock (+${cacheAmount}) and rumor-driven footfall.`;
        tone = "neutral";
      }
    }

    state.world.lastActorEvent = {
      actorId: actor.id,
      label: actor.label,
      tone,
      day: state.day,
      summary
    };
    logLine(summary, tone);

    return {
      mods,
      actorSummary: summary
    };
  }

  function applyWorldActorDrift(net, satisfaction) {
    const actorAdjustments = {
      crown_office: 0,
      civic_council: 0,
      merchant_houses: 0,
      underworld_network: 0
    };

    if (net > 0) {
      actorAdjustments.civic_council += 1;
      actorAdjustments.merchant_houses += 1;
    } else {
      actorAdjustments.merchant_houses -= 1;
    }

    if (state.cleanliness < 45 || state.condition < 45) {
      actorAdjustments.crown_office -= 1;
      actorAdjustments.civic_council -= 1;
    }
    if (state.cleanliness < 35 || state.condition < 35) {
      actorAdjustments.underworld_network += 1;
    }

    if (satisfaction >= 0.7) {
      actorAdjustments.civic_council += 1;
      actorAdjustments.crown_office += 1;
    } else if (satisfaction < 0.5) {
      actorAdjustments.civic_council -= 1;
      actorAdjustments.underworld_network += 1;
    }

    Object.entries(actorAdjustments).forEach(([actorId, delta]) => {
      if (delta !== 0) {
        shiftWorldActorStanding(actorId, delta);
      }
    });
  }

  function summarizeWorldActorsForReport() {
    const actors = Object.values(getWorldActors());
    const ranked = actors
      .slice()
      .sort((a, b) => b.standing - a.standing);
    const top = ranked[0];
    const low = ranked[ranked.length - 1];
    return `${top.label} standing ${top.standing}, ${low.label} standing ${low.standing}.`;
  }

  function formatCoin(value) {
    const rounded = Math.round(value);
    return `${rounded}g`;
  }

  function createStaff(role) {
    return createStaffModel(role, {
      randomId: (length) => random.randomId(length),
      randInt,
      clamp
    });
  }

  function createSupplyStats() {
    return createSupplyStatsModel({ randInt, clamp });
  }

  function createPatronPool(count) {
    return createPatronPoolModel(count, {
      randInt,
      pick,
      randomId: (length) => random.randomId(length),
      randomFloat: () => random.nextFloat()
    });
  }

  function setRotaPreset(preset) {
    const actionWindow = requireActionWindow("set_rota");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    if (!ROTA_PRESETS[preset]) {
      return;
    }
    state.rotaPreset = preset;
    logLine(`Rota preset changed to ${ROTA_PRESETS[preset].label}.`, "neutral");
    render();
  }

  function adjustPrice(product, delta) {
    const actionWindow = requireActionWindow("adjust_price");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    const next = clamp(state.prices[product] + delta, 1, 40);
    state.prices[product] = next;
    logLine(`${product.toUpperCase()} price set to ${formatCoin(next)}.`, "neutral");
    render();
  }

  function buySupply(item, amount, unitCost, options = null) {
    const silent = Boolean(options && options.silent);
    const actionWindow = requireActionWindow("buy_supply", options);
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      if (!silent) {
        render();
      }
      return { ok: false, error: actionWindow.error };
    }
    normalizeWorldState();
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    const worldMods = getWorldRuntimeModifiers();
    const suppliers = state.world.suppliers;
    const market = getSupplierCurrentMarket();
    if (isDistrictTravelActive()) {
      logLine("Supply orders are paused while your caravan is in transit.", "bad");
      if (!silent) {
        render();
      }
      return { ok: false, error: "Travel in progress." };
    }
    if (!market) {
      logLine("Supply ledger unavailable for the active district.", "bad");
      if (!silent) {
        render();
      }
      return { ok: false, error: "Market unavailable." };
    }

    const marketAvailable = Math.max(0, Math.round(Number(market.stock[item]) || 0));
    if (marketAvailable <= 0) {
      logLine(`${district.label} market has no ${item} lots left today.`, "bad");
      if (!silent) {
        render();
      }
      return { ok: false, error: "Market out of stock." };
    }

    const merchantWindow = isMerchantWindowActiveForDistrict(suppliers, district.id);
    const caravanWindow = isCaravanWindowActiveForDistrict(suppliers, district.id);
    const lotBoost = merchantWindow ? 1.2 : caravanWindow ? 1.12 : 1;
    const adjustedAmount = Math.max(
      1,
      Math.round(amount * location.supplyQuantityMult * district.supplyQuantityMult * lotBoost)
    );
    const purchasableAmount = Math.min(adjustedAmount, marketAvailable);
    const availabilityRoll =
      location.supplyReliability * district.supplyReliability * worldMods.supplyReliabilityMult;
    const lotAvailabilityBuffer = clamp(marketAvailable / 180, 0.04, 0.25);
    const effectiveChance = clamp(availabilityRoll + lotAvailabilityBuffer, 0.15, 0.99);
    if (random.nextFloat() > effectiveChance) {
      logLine(`No fresh ${item} lots were available in ${district.label} today.`, "bad");
      if (!silent) {
        render();
      }
      return { ok: false, error: "No fresh lots available." };
    }

    const volatilityMult = getSupplierVolatilityCostMult(suppliers.volatility);
    const contractMult = getSupplierContractCostMult(suppliers, district.id);
    const marketEventMult = merchantWindow ? 0.91 : caravanWindow ? 0.95 : 1;
    const adjustedUnitCost = Math.max(
      1,
      Math.round(
        unitCost *
          location.supplyCostMult *
          district.supplyCostMult *
          worldMods.supplyCostMult *
          market.priceBias *
          volatilityMult *
          contractMult *
          marketEventMult
      )
    );
    const total = purchasableAmount * adjustedUnitCost;
    if (!spendGold(total, `Buy ${item}`)) {
      return { ok: false, error: "Not enough gold." };
    }
    market.stock[item] = Math.max(0, marketAvailable - purchasableAmount);
    if (isSupplyItem(item)) {
      const profile = SUPPLY_META[item];
      const qualityPenalty = Math.max(0, Math.round((suppliers.volatility - 25) / 8));
      const qualityBonus = suppliers.contracts.arcanumWholesaleDays > 0 ? 4 : suppliers.contracts.localBrokerDays > 0 ? 2 : 0;
      const incomingQuality = clamp(
        profile.baseQuality +
          randInt(-profile.qualityVariance, profile.qualityVariance) -
          qualityPenalty +
          qualityBonus,
        30,
        96
      );
      const freshnessBonus = merchantWindow ? 6 : caravanWindow ? 3 : 0;
      const incomingFreshness = clamp(randInt(64, 94) + freshnessBonus - Math.round(suppliers.volatility / 16), 25, 100);
      mergeIncomingSupplyStats(item, purchasableAmount, incomingQuality, incomingFreshness);
      logLine(
        `Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)} (${qualityTier(incomingQuality)} grade).`,
        "neutral"
      );
      if (purchasableAmount < adjustedAmount) {
        logLine(
          `${district.label} lot cap hit: ordered ${adjustedAmount}, filled ${purchasableAmount}.`,
          "neutral"
        );
      }
      if (!silent) {
        render();
      }
      return { ok: true, item, amount: purchasableAmount, total };
    }
    state.inventory[item] += purchasableAmount;
    if (purchasableAmount < adjustedAmount) {
      logLine(
        `Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)} (lot cap limited fill).`,
        "neutral"
      );
    } else {
      logLine(`Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)}.`, "neutral");
    }
    if (!silent) {
      render();
    }
    return { ok: true, item, amount: purchasableAmount, total };
  }

  function startDistrictTravel(destinationId) {
    const actionWindow = requireActionWindow("district_travel");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    normalizeWorldState();
    if (!destinationId || typeof destinationId !== "string") {
      return { ok: false, error: "Choose a destination district." };
    }
    if (isDistrictTravelActive()) {
      return { ok: false, error: "Travel already in progress." };
    }

    const currentDistrict = getCurrentDistrictProfile();
    if (destinationId === currentDistrict.id) {
      return { ok: false, error: "You are already operating in that district." };
    }

    const destination = resolveDistrict(destinationId, currentDistrict.locationId);
    const route = getDistrictTravelLink(currentDistrict.id, destination.id);
    if (!route) {
      return {
        ok: false,
        error: `No travel route from ${currentDistrict.label} to ${destination.label}.`
      };
    }
    const cadence = enforceActionCadence("district_travel", { perMinute: true, perDay: true });
    if (!cadence.ok) {
      logLine(cadence.error, "bad");
      render();
      return { ok: false, error: cadence.error };
    }
    if (!spendGold(route.cost, `Travel to ${destination.label}`)) {
      return { ok: false, error: "Not enough gold for travel." };
    }

    state.world.travelDaysRemaining = route.days;
    state.world.travelDestination = destination.id;
    state.world.travelDestinationLabel = destination.label;
    state.world.travelRouteCost = route.cost;
    state.world.travelRouteDays = route.days;
    logLine(
      `Travel begun: ${currentDistrict.label} -> ${destination.label} (${route.days}d, ${formatCoin(route.cost)}).`,
      "neutral"
    );
    render();
    return { ok: true, destinationId: destination.id, days: route.days, cost: route.cost };
  }

  function progressDistrictTravel() {
    if (!isDistrictTravelActive()) {
      return { inTransitToday: false, demandMult: 1, eventChanceMult: 1, currentDistrict: null };
    }

    const beforeDistrict = getCurrentDistrictProfile();
    const destination = resolveDistrict(state.world.travelDestination, beforeDistrict.locationId);
    const inTransitDays = Math.max(0, Math.round(state.world.travelDaysRemaining));
    state.world.travelDaysRemaining = Math.max(0, inTransitDays - 1);

    if (state.world.travelDaysRemaining <= 0) {
      state.world.currentDistrict = destination.id;
      state.world.activeLocation = destination.locationId;
      state.world.travelDestination = null;
      state.world.travelDestinationLabel = "";
      state.world.travelRouteCost = 0;
      state.world.travelRouteDays = 0;
      normalizeWorldState();
      logLine(`Travel complete: now operating in ${destination.label}.`, "good");
    }

    return {
      inTransitToday: true,
      demandMult: 0.86,
      eventChanceMult: 0.72,
      currentDistrict: beforeDistrict.label,
      destinationDistrict: destination.label
    };
  }

  function transitionManagerPhase(nextPhase, reason, options = {}) {
    const activeLocationId =
      state.world && typeof state.world === "object"
        ? state.world.activeLocation || state.world.startingLocation || DEFAULT_STARTING_LOCATION
        : DEFAULT_STARTING_LOCATION;
    state.manager = normalizeManagerState(state.manager, state.day, activeLocationId);
    const manager = state.manager;
    const target = typeof nextPhase === "string" ? nextPhase : MANAGER_PHASES.PLANNING;
    const note = typeof reason === "string" && reason.length > 0 ? reason : "Phase transition.";
    const force = Boolean(options.force);
    if (!force && !isValidManagerTransition(manager.phase, target)) {
      state.timeflow = createTimeflowRuntimeState(state.timeflow);
      state.timeflow.diagnostics.guardRecoveries += 1;
      manager.guardNote =
        `Invalid phase transition blocked (${manager.phase} -> ${target}) on Day ${state.day}.`;
      return { ok: false, error: manager.guardNote };
    }
    manager.phase = target;
    manager.transitionReason = note;
    manager.lastTransitionDay = state.day;
    manager.guardNote = "";
    return { ok: true, phase: manager.phase };
  }

  function primeCommittedPlanFromDraft(options = {}) {
    const resetSupplySpent = options.resetSupplySpent !== false;
    const refreshContext = options.refreshContext !== false;
    const autoRelax = options.autoRelax !== false;
    if (refreshContext) {
      refreshPlanningContext({ overwriteDraft: false });
    }
    let manager = getManagerState();
    let envelope = validateWeeklyPlanEnvelope(manager.planDraft);
    if (!envelope.ok && autoRelax) {
      const draft = manager.planDraft;
      const maxReserveAllowed = Math.max(0, Math.round(state.gold - 5));
      draft.reserveGoldTarget = clamp(Math.round(Number(draft.reserveGoldTarget) || 0), 0, maxReserveAllowed);
      const maxSupplyAllowed = Math.max(0, Math.round(state.gold + 10 - draft.reserveGoldTarget));
      draft.supplyBudgetCap = clamp(Math.round(Number(draft.supplyBudgetCap) || 0), 0, maxSupplyAllowed);
      const compliance = getCrownAuthority().complianceScore;
      if (`${draft.riskTolerance || "moderate"}` === "high" && compliance < 52) {
        draft.riskTolerance = "moderate";
      }
      if (`${draft.marketingIntent || "steady"}` === "campaign" && state.gold < 30) {
        draft.marketingIntent = "steady";
      }
      if (`${draft.logisticsIntent || "local"}` === "city_push" && isDistrictTravelActive()) {
        draft.logisticsIntent = "local";
      }
      envelope = validateWeeklyPlanEnvelope(draft);
    }
    if (!envelope.ok) {
      return {
        ok: false,
        error: `Cannot commit weekly plan: ${envelope.errors.join(" ")}`,
        errors: envelope.errors
      };
    }
    manager = getManagerState();
    manager.committedPlan = { ...manager.planDraft, weekIndex: manager.weekIndex };
    manager.planCommitted = true;
    manager.supplyPlanner.weeklyBudgetCap = Math.max(0, Math.round(Number(manager.committedPlan.supplyBudgetCap) || 0));
    if (resetSupplySpent) {
      manager.supplyPlanner.spent = 0;
    }
    manager.supplyPlanner.lastAction = "Supply planner primed from committed weekly plan.";
    return { ok: true };
  }

  function ensureExecutionPhaseForLiveSim(reason = "Live simulation step.") {
    normalizeWorldState();
    let manager = getManagerState();
    if (!manager.planCommitted || !manager.committedPlan) {
      const commit = primeCommittedPlanFromDraft({ refreshContext: true });
      if (!commit.ok) {
        return commit;
      }
      manager = getManagerState();
    }
    if (manager.phase !== MANAGER_PHASES.EXECUTION) {
      const transition = transitionManagerPhase(MANAGER_PHASES.EXECUTION, reason, { force: true });
      if (!transition.ok) {
        return transition;
      }
    }
    return { ok: true };
  }

  function commitWeeklyPlan() {
    const actionWindow = requireActionWindow("commit_plan");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    normalizeWorldState();
    const manager = getManagerState();
    const wasExecution = manager.phase === MANAGER_PHASES.EXECUTION;
    const commit = primeCommittedPlanFromDraft({
      resetSupplySpent: !wasExecution,
      refreshContext: true
    });
    if (!commit.ok) {
      const reason = commit.error || "Cannot commit weekly plan.";
      logLine(reason, "bad");
      render();
      return { ok: false, error: reason, errors: commit.errors || [] };
    }
    if (!wasExecution) {
      const transition = transitionManagerPhase(
        MANAGER_PHASES.EXECUTION,
        `Week ${manager.weekIndex} plan committed.`
      );
      if (!transition.ok) {
        return transition;
      }
    }
    logLine(
      wasExecution
        ? `Week ${manager.weekIndex} plan updated for live execution.`
        : `Week ${manager.weekIndex} plan committed. Execution phase started.`,
      "good"
    );
    render();
    const phase = getManagerState().phase;
    return { ok: true, weekIndex: manager.weekIndex, phase };
  }

  function updateWeeklyPlanDraft(updates = {}) {
    const actionWindow = requireActionWindow("update_plan_draft");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    normalizeWorldState();
    const manager = getManagerState();
    if (!updates || typeof updates !== "object") {
      return { ok: false, error: "Draft update payload is required." };
    }
    const allowed = [
      "staffingIntent",
      "pricingIntent",
      "procurementIntent",
      "marketingIntent",
      "logisticsIntent",
      "riskTolerance",
      "reserveGoldTarget",
      "supplyBudgetCap",
      "menuFallbackPolicy",
      "note"
    ];
    let queuedCount = 0;
    let immediateCount = 0;
    allowed.forEach((field) => {
      if (updates[field] !== undefined) {
        const normalizedValue = normalizePlanningFieldValue(field, updates[field]);
        manager.planDraft[field] = normalizedValue;
        const timing = PLAN_EFFECT_TIMING[field] || "next_day";
        if (manager.phase === MANAGER_PHASES.EXECUTION && manager.planCommitted && manager.committedPlan) {
          if (timing === "instant") {
            applyPlanningFieldToPlans(field, normalizedValue);
            immediateCount += 1;
          } else {
            queuePlanningIntent(field, normalizedValue, timing, "planning_board");
            queuedCount += 1;
          }
        }
      }
    });
    manager.planDraft.weekIndex = manager.weekIndex;
    if (queuedCount > 0) {
      manager.supplyPlanner.lastAction =
        `Queued ${queuedCount} planning update${queuedCount === 1 ? "" : "s"} for future boundary application.`;
    } else if (immediateCount > 0) {
      manager.supplyPlanner.lastAction = "Immediate planning updates applied.";
    }
    refreshPlanningContext({ overwriteDraft: false });
    render();
    return {
      ok: true,
      draft: { ...manager.planDraft },
      queuedCount,
      immediateCount,
      queueSummary: state.timeflow ? state.timeflow.lastQueueSummary : ""
    };
  }

  function validateWeeklyPlanEnvelope(draft = {}) {
    const errors = [];
    const reserve = Math.max(0, Math.round(Number(draft.reserveGoldTarget) || 0));
    const supplyBudgetCap = Math.max(0, Math.round(Number(draft.supplyBudgetCap) || 0));
    const risk = `${draft.riskTolerance || "moderate"}`;
    const marketing = `${draft.marketingIntent || "steady"}`;
    const compliance = getCrownAuthority().complianceScore;
    const maxReserveAllowed = Math.max(0, Math.round(state.gold - 5));

    if (reserve > maxReserveAllowed) {
      errors.push(`Reserve target ${formatCoin(reserve)} exceeds available planning envelope ${formatCoin(maxReserveAllowed)}.`);
    }
    if (reserve + supplyBudgetCap > Math.max(0, state.gold + 10)) {
      errors.push(
        `Reserve + supply budget (${formatCoin(reserve + supplyBudgetCap)}) exceeds practical weekly envelope for current gold ${formatCoin(state.gold)}.`
      );
    }
    if (risk === "high" && compliance < 52) {
      errors.push(`High risk plans require Crown compliance >= 52 (current ${compliance}).`);
    }
    if (marketing === "campaign" && state.gold < 30) {
      errors.push(`Campaign marketing requires at least ${formatCoin(30)} on hand (current ${formatCoin(state.gold)}).`);
    }
    if (draft.logisticsIntent === "city_push" && isDistrictTravelActive()) {
      errors.push("City push logistics cannot be committed while district travel is active.");
    }

    return { ok: errors.length === 0, errors };
  }

  function createRecruitmentCandidateForWeek(weekIndex, scoutBias = 0) {
    const first = pick(PATRON_FIRST_NAMES);
    const last = pick(PATRON_LAST_NAMES);
    const role = pick(["server", "cook", "barkeep", "guard"]);
    const roleBias =
      role === "cook"
        ? { service: -2, quality: 3 }
        : role === "server"
          ? { service: 3, quality: -1 }
          : role === "barkeep"
            ? { service: 2, quality: 1 }
            : { service: 1, quality: 0 };
    const trueService = Math.max(5, Math.min(28, randInt(8, 20) + roleBias.service));
    const trueQuality = Math.max(3, Math.min(24, randInt(5, 17) + roleBias.quality));
    const uncertainty = Math.max(1, Math.round(6 - scoutBias));
    const visibleService = clamp(trueService + randInt(-uncertainty, uncertainty), 1, 30);
    const visibleQuality = clamp(trueQuality + randInt(-uncertainty, uncertainty), 1, 25);
    const potentialMin = clamp(Math.min(trueService, trueQuality) + randInt(2, 5), 6, 35);
    const potentialMax = clamp(Math.max(trueService, trueQuality) + randInt(4, 11), potentialMin, 40);
    const expectedWage = clamp(
      Math.round(7 + trueService * 0.24 + trueQuality * 0.28 + randInt(-1, 3)),
      6,
      30
    );
    const visibleTraitsPool = ["steady", "punctual", "friendly", "hardy", "neat", "quick learner"];
    const hiddenTraitsPool = ["temperamental", "clutch performer", "slow starter", "union-minded", "moonlighter", "merchant ties"];
    return {
      id: random.randomId(8),
      name: `${first} ${last}`,
      role,
      trueService,
      trueQuality,
      potentialMin,
      potentialMax,
      expectedWage,
      visibleService,
      visibleQuality,
      confidence: clamp(32 + scoutBias * 12 + randInt(-4, 6), 10, 90),
      daysRemaining: clamp(randInt(4, 9), 2, 14),
      interest: clamp(randInt(42, 78), 15, 100),
      competingPressure: clamp(randInt(18, 72), 0, 100),
      visibleTraits: [pick(visibleTraitsPool), pick(visibleTraitsPool)].filter((value, index, arr) => arr.indexOf(value) === index),
      hiddenTraits: [pick(hiddenTraitsPool), pick(hiddenTraitsPool)].filter((value, index, arr) => arr.indexOf(value) === index),
      revealedTraits: [],
      weekIndex
    };
  }

  function refreshRecruitmentMarketForWeek(force = false) {
    const manager = getManagerState();
    const recruitment = manager.recruitment;
    if (!force && recruitment.lastRefreshWeek === manager.weekIndex && recruitment.market.length > 0) {
      return recruitment.lastSummary;
    }
    const scoutBias = manager.planDraft.staffingIntent === "training_push" ? 1 : 0;
    const seasonId = manager.timeline && manager.timeline.seasonId ? manager.timeline.seasonId : "spring";
    const poolSize =
      seasonId === "winter"
        ? randInt(3, 5)
        : seasonId === "harvest"
          ? randInt(5, 8)
          : randInt(4, 7);
    recruitment.market = Array.from({ length: poolSize }, () =>
      createRecruitmentCandidateForWeek(manager.weekIndex, scoutBias)
    );
    recruitment.shortlist = [];
    recruitment.lastRefreshWeek = manager.weekIndex;
    recruitment.lastSummary =
      `Week ${manager.weekIndex} recruitment pool posted (${recruitment.market.length} candidates, ` +
      `${recruitment.market.filter((candidate) => candidate.role === "cook").length} cooks).`;
    return recruitment.lastSummary;
  }

  function progressRecruitmentMarketDay() {
    const recruitment = getManagerState().recruitment;
    if (!Array.isArray(recruitment.market) || recruitment.market.length === 0) {
      recruitment.lastSummary = "Recruitment board is empty.";
      return recruitment.lastSummary;
    }
    let expired = 0;
    let signedElsewhere = 0;
    recruitment.market = recruitment.market.filter((candidate) => {
      candidate.daysRemaining = Math.max(0, candidate.daysRemaining - 1);
      candidate.competingPressure = clamp(candidate.competingPressure + randInt(-4, 7), 0, 100);
      if (candidate.daysRemaining <= 0) {
        expired += 1;
        return false;
      }
      const offerChance = clamp(0.05 + candidate.competingPressure / 180, 0.05, 0.55);
      if (random.nextFloat() < offerChance) {
        signedElsewhere += 1;
        return false;
      }
      return true;
    });
    recruitment.shortlist = recruitment.shortlist.filter((candidateId) =>
      recruitment.market.some((candidate) => candidate.id === candidateId)
    );
    recruitment.lastSummary =
      expired + signedElsewhere > 0
        ? `Recruitment market shifted: ${expired} expired, ${signedElsewhere} signed elsewhere. ${recruitment.market.length} remain.`
        : `Recruitment market steady: ${recruitment.market.length} active candidates.`;
    return recruitment.lastSummary;
  }

  function shortlistRecruitCandidate(candidateId) {
    const actionWindow = requireActionWindow("shortlist_candidate");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const recruitment = getManagerState().recruitment;
    const candidate = recruitment.market.find((entry) => entry.id === candidateId);
    if (!candidate) {
      return { ok: false, error: "Candidate not available." };
    }
    if (!recruitment.shortlist.includes(candidateId)) {
      recruitment.shortlist.push(candidateId);
    }
    logLine(`Shortlisted ${candidate.name} (${candidate.role}).`, "neutral");
    render();
    return { ok: true, candidateId };
  }

  function scoutRecruitCandidate(candidateId) {
    const actionWindow = requireActionWindow("scout_candidate");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const recruitment = getManagerState().recruitment;
    const candidate = recruitment.market.find((entry) => entry.id === candidateId);
    if (!candidate) {
      return { ok: false, error: "Candidate not available." };
    }
    const scoutCost = 4;
    if (!spendGold(scoutCost, "Recruitment scouting")) {
      render();
      return { ok: false, error: "Not enough gold for scouting." };
    }

    const hiddenPool = candidate.hiddenTraits.filter((trait) => !candidate.revealedTraits.includes(trait));
    if (hiddenPool.length > 0) {
      const revealed = pick(hiddenPool);
      candidate.revealedTraits.push(revealed);
    }
    candidate.confidence = clamp(candidate.confidence + randInt(10, 18), 0, 100);
    const uncertainty = Math.max(1, Math.round((100 - candidate.confidence) / 18));
    candidate.visibleService = clamp(candidate.trueService + randInt(-uncertainty, uncertainty), 1, 30);
    candidate.visibleQuality = clamp(candidate.trueQuality + randInt(-uncertainty, uncertainty), 1, 25);
    logLine(
      `Scout report updated for ${candidate.name}: service ${candidate.visibleService}, quality ${candidate.visibleQuality}, confidence ${candidate.confidence}%.`,
      "neutral"
    );
    render();
    return { ok: true, candidateId };
  }

  function signRecruitCandidate(candidateId) {
    const actionWindow = requireActionWindow("sign_candidate");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const recruitment = getManagerState().recruitment;
    const index = recruitment.market.findIndex((entry) => entry.id === candidateId);
    if (index < 0) {
      return { ok: false, error: "Candidate not available." };
    }
    const candidate = recruitment.market[index];
    const signingFee = Math.max(12, Math.round(candidate.expectedWage * 2));
    if (!spendGold(signingFee, "Recruit signing fee")) {
      render();
      return { ok: false, error: "Not enough gold for signing fee." };
    }

    const recruit = createStaff(candidate.role);
    recruit.service = clamp(candidate.trueService + randInt(-1, 1), 1, 30);
    recruit.quality = clamp(candidate.trueQuality + randInt(-1, 1), 1, 25);
    recruit.wage = clamp(candidate.expectedWage + randInt(-1, 2), 6, 32);
    recruit.morale = clamp(58 + Math.round(candidate.interest / 8), 35, 95);
    recruit.fatigue = clamp(randInt(8, 22), 0, 100);
    state.staff.push(recruit);

    recruitment.market.splice(index, 1);
    recruitment.shortlist = recruitment.shortlist.filter((entry) => entry !== candidateId);
    recruitment.lastSummary = `${candidate.name} signed as ${candidate.role}.`;
    logLine(`Signed ${candidate.name} (${candidate.role}) for ${formatCoin(recruit.wage)} wage.`, "good");
    render();
    return { ok: true, candidateId, role: candidate.role };
  }

  function createObjectiveForWeek(weekIndex, seasonId = "spring") {
    const templatePool =
      seasonId === "winter"
        ? ["crown_compliance", "merchant_margin", "merchant_margin", "investor_growth"]
        : seasonId === "harvest"
          ? ["merchant_margin", "investor_growth", "noble_prestige", "merchant_margin"]
          : ["crown_compliance", "noble_prestige", "merchant_margin", "investor_growth"];
    const templateId = pick(templatePool);
    if (templateId === "crown_compliance") {
      const goal = randInt(4, 6);
      return {
        id: random.randomId(10),
        issuer: "crown_office",
        type: templateId,
        label: "Keep Crown Ledgers Clean",
        description: `Hold Crown compliance at 60+ for ${goal} execution days.`,
        remainingWeeks: 2,
        goalValue: goal,
        progressValue: 0,
        metric: "compliance_days",
        rewardGold: 22,
        rewardReputation: 3,
        penaltyGold: 14,
        penaltyReputation: 2,
        status: "active",
        progressNote: "Awaiting first compliance checkpoint.",
        originWeek: weekIndex,
        payload: { threshold: 60 }
      };
    }
    if (templateId === "noble_prestige") {
      const goal = randInt(3, 5);
      return {
        id: random.randomId(10),
        issuer: "noble_houses",
        type: templateId,
        label: "Host Refined Evenings",
        description: `Record satisfaction 70+ across ${goal} service days.`,
        remainingWeeks: 2,
        goalValue: goal,
        progressValue: 0,
        metric: "satisfaction_days",
        rewardGold: 18,
        rewardReputation: 4,
        penaltyGold: 10,
        penaltyReputation: 2,
        status: "active",
        progressNote: "Noble observers are waiting for quality nights.",
        originWeek: weekIndex,
        payload: { threshold: 70 }
      };
    }
    if (templateId === "investor_growth") {
      const goal = randInt(130, 180);
      return {
        id: random.randomId(10),
        issuer: "investors",
        type: templateId,
        label: "Deliver Investor Growth",
        description: `Accumulate ${formatCoin(goal)} net over the objective window.`,
        remainingWeeks: 3,
        goalValue: goal,
        progressValue: 0,
        metric: "net_total",
        rewardGold: 30,
        rewardReputation: 2,
        penaltyGold: 18,
        penaltyReputation: 2,
        status: "active",
        progressNote: "Investor syndicate monitoring cumulative net.",
        originWeek: weekIndex,
        payload: { minimumNet: goal }
      };
    }
    const goal = randInt(4, 6);
    return {
      id: random.randomId(10),
      issuer: "merchant_houses",
      type: "merchant_margin",
      label: "Hold Merchant Margins",
      description: `Log daily net >= ${formatCoin(24)} on ${goal} days.`,
      remainingWeeks: 2,
      goalValue: goal,
      progressValue: 0,
      metric: "margin_days",
      rewardGold: 24,
      rewardReputation: 2,
      penaltyGold: 14,
      penaltyReputation: 2,
      status: "active",
      progressNote: "Merchant clerks tracking daily surplus discipline.",
      originWeek: weekIndex,
      payload: { threshold: 24 }
    };
  }

  function refreshObjectivesForWeek(force = false) {
    const manager = getManagerState();
    const objectives = manager.objectives;
    if (!Array.isArray(objectives.active)) {
      objectives.active = [];
    }
    if (!force && objectives.active.length >= 3) {
      return objectives.lastSummary;
    }
    const seasonId = manager.timeline && manager.timeline.seasonId ? manager.timeline.seasonId : "spring";
    while (objectives.active.length < 3) {
      objectives.active.push(createObjectiveForWeek(manager.weekIndex, seasonId));
    }
    objectives.lastSummary =
      `Objective board active: ${objectives.active.length} live arcs, ` +
      `${objectives.completed.length} completed, ${objectives.failed.length} failed.`;
    return objectives.lastSummary;
  }

  function updateObjectiveProgressDaily(dayContext = {}) {
    const objectives = getManagerState().objectives;
    const compliance = Math.max(0, Math.round(Number(dayContext.compliance) || 0));
    const satisfaction = Math.max(0, Math.round(Number(dayContext.satisfaction) || 0));
    const net = Math.round(Number(dayContext.net) || 0);
    objectives.active.forEach((objective) => {
      if (objective.type === "crown_compliance") {
        const threshold = Math.max(40, Math.round(Number(objective.payload.threshold) || 60));
        if (compliance >= threshold) {
          objective.progressValue += 1;
        }
      } else if (objective.type === "noble_prestige") {
        const threshold = Math.max(40, Math.round(Number(objective.payload.threshold) || 70));
        if (satisfaction >= threshold) {
          objective.progressValue += 1;
        }
      } else if (objective.type === "merchant_margin") {
        const threshold = Math.max(0, Math.round(Number(objective.payload.threshold) || 24));
        if (net >= threshold) {
          objective.progressValue += 1;
        }
      } else if (objective.type === "investor_growth") {
        objective.progressValue += Math.max(0, net);
      }
      objective.progressValue = Math.max(0, Math.round(objective.progressValue));
      objective.progressNote = `${objective.label}: ${objective.progressValue}/${objective.goalValue} progress.`;
    });
    objectives.lastSummary = `Objective tracking updated for Day ${state.day}.`;
  }

  function evaluateObjectivesWeekBoundary() {
    const manager = getManagerState();
    const objectives = manager.objectives;
    if (!Array.isArray(objectives.active) || objectives.active.length === 0) {
      objectives.lastSummary = "No active objectives to evaluate this week.";
      return objectives.lastSummary;
    }
    const remaining = [];
    const succeeded = [];
    const failed = [];
    objectives.active.forEach((objective) => {
      const completed = objective.progressValue >= objective.goalValue;
      if (completed) {
        objective.status = "completed";
        objective.progressNote = `${objective.label} completed (${objective.progressValue}/${objective.goalValue}).`;
        succeeded.push(objective);
        return;
      }
      objective.remainingWeeks = Math.max(0, objective.remainingWeeks - 1);
      if (objective.remainingWeeks <= 0) {
        objective.status = "failed";
        objective.progressNote = `${objective.label} failed (${objective.progressValue}/${objective.goalValue}).`;
        failed.push(objective);
        return;
      }
      remaining.push(objective);
    });
    let rewardGold = 0;
    let rewardRep = 0;
    let penaltyGold = 0;
    let penaltyRep = 0;
    const crown = state.world && state.world.crown ? state.world.crown : { complianceScore: 60 };
    const actors = state.world && state.world.actors ? state.world.actors : {};
    const shiftActorDirect = (actorId, delta) => {
      const actor = actors[actorId];
      if (!actor) {
        return;
      }
      const shift = Math.round(Number(delta) || 0);
      actor.standing = clamp(actor.standing + shift, 0, 100);
      actor.lastShift = shift;
    };
    const applyEffectDirect = (effectId, days, value) => {
      const effects = state.world && state.world.effects ? state.world.effects : null;
      if (!effects) {
        return;
      }
      const safeDays = Math.max(0, Math.round(Number(days) || 0));
      if (effectId === "supply_cost") {
        effects.supplyCostDays = safeDays;
        effects.supplyCostMult = Math.max(0.5, Math.min(1.7, Number(value) || 1));
      } else if (effectId === "tax_flat") {
        effects.taxFlatDays = safeDays;
        effects.taxFlatBonus = Math.max(-10, Math.min(35, Math.round(Number(value) || 0)));
      }
    };
    succeeded.forEach((objective) => {
      rewardGold += objective.rewardGold;
      rewardRep += objective.rewardReputation;
      if (objective.issuer === "crown_office") {
        crown.complianceScore = clamp(crown.complianceScore + 3, 0, 100);
        shiftActorDirect("crown_office", 2);
      } else if (objective.issuer === "merchant_houses") {
        shiftActorDirect("merchant_houses", 2);
        applyEffectDirect("supply_cost", 2, 0.93);
      } else if (objective.issuer === "noble_houses") {
        shiftActorDirect("civic_council", 1);
      } else if (objective.issuer === "investors") {
        rewardGold += 6;
      }
    });
    failed.forEach((objective) => {
      penaltyGold += objective.penaltyGold;
      penaltyRep += objective.penaltyReputation;
      if (objective.issuer === "crown_office") {
        crown.complianceScore = clamp(crown.complianceScore - 4, 0, 100);
        shiftActorDirect("crown_office", -2);
        applyEffectDirect("tax_flat", 2, 4);
      } else if (objective.issuer === "merchant_houses") {
        shiftActorDirect("merchant_houses", -2);
        applyEffectDirect("supply_cost", 2, 1.08);
      } else if (objective.issuer === "noble_houses") {
        shiftActorDirect("civic_council", -1);
      } else if (objective.issuer === "investors") {
        penaltyGold += 4;
      }
    });
    if (rewardGold > 0 || rewardRep > 0) {
      state.gold += rewardGold;
      state.reputation = clamp(state.reputation + rewardRep, 0, 100);
      logLine(
        `Objective rewards received: ${formatCoin(rewardGold)} and +${rewardRep} reputation.`,
        "good"
      );
    }
    if (penaltyGold > 0 || penaltyRep > 0) {
      state.gold -= penaltyGold;
      state.reputation = clamp(state.reputation - penaltyRep, 0, 100);
      logLine(
        `Objective penalties applied: ${formatCoin(penaltyGold)} and -${penaltyRep} reputation.`,
        "bad"
      );
    }
    objectives.active = remaining;
    objectives.completed = [...succeeded, ...objectives.completed].slice(0, 24);
    objectives.failed = [...failed, ...objectives.failed].slice(0, 24);
    objectives.lastSummary =
      `Objective resolution: ${succeeded.length} completed, ${failed.length} failed, ${remaining.length} carried forward. ` +
      `Rewards ${formatCoin(rewardGold)} / +${rewardRep} rep, penalties ${formatCoin(penaltyGold)} / -${penaltyRep} rep.`;
    return objectives.lastSummary;
  }

  function finalizeExecutionWeek(dayStats = {}) {
    state.timeflow = createTimeflowRuntimeState(state.timeflow);
    const boundaries = state.timeflow.boundaries;
    const manager = getManagerState();
    if (manager.phase !== MANAGER_PHASES.EXECUTION) {
      return { weekClosed: false, summary: "" };
    }
    if (boundaries.lastWeekCloseWeek === manager.weekIndex && boundaries.lastWeekCloseAtDay === state.day) {
      state.timeflow.diagnostics.guardRecoveries += 1;
      return { weekClosed: false, summary: "Duplicate week close blocked by boundary guard." };
    }
    manager.dayInWeek += 1;
    if (manager.dayInWeek <= MANAGER_WEEK_LENGTH) {
      return { weekClosed: false, summary: "" };
    }

    const closeTransition = transitionManagerPhase(
      MANAGER_PHASES.WEEK_CLOSE,
      `Week ${manager.weekIndex} execution complete.`
    );
    if (!closeTransition.ok) {
      return { weekClosed: false, summary: "" };
    }

    const postClose = getManagerState();
    const summary =
      `Week ${postClose.weekIndex} closed: last day ${Math.max(0, Math.round(Number(dayStats.guests) || 0))} guests, ` +
      `net ${formatCoin(Math.round(Number(dayStats.net) || 0))}.`;
    postClose.lastWeekSummary = summary;
    const completedWeek = postClose.weekIndex;
    boundaries.lastWeekCloseWeek = completedWeek;
    boundaries.lastWeekCloseAtDay = state.day;
    postClose.weekIndex += 1;
    postClose.dayInWeek = 1;
    const carryForwardPlan = postClose.committedPlan
      ? { ...postClose.committedPlan, weekIndex: postClose.weekIndex }
      : { ...postClose.planDraft, weekIndex: postClose.weekIndex };
    postClose.planCommitted = false;
    postClose.committedPlan = null;
    postClose.planDraft = { ...carryForwardPlan };
    postClose.supplyPlanner.weeklyBudgetCap = Math.max(0, Math.round(Number(carryForwardPlan.supplyBudgetCap) || 0));
    postClose.supplyPlanner.spent = 0;
    postClose.supplyPlanner.stockTargets = {};
    postClose.supplyPlanner.lastAction = "Supply planner rolled into the next week and is awaiting plan commit.";
    transitionManagerPhase(
      MANAGER_PHASES.PLANNING,
      `Week ${postClose.weekIndex} opened in planning mode after Week ${completedWeek} close.`,
      { force: true }
    );
    state.clock = createSimulationClockState({ ...state.clock, speed: 0 });
    const weekQueueResult = flushPlanningIntentQueue("week_start");
    const objectiveSummary = evaluateObjectivesWeekBoundary();
    refreshPlanningContext({ overwriteDraft: true });
    if (postClose.recruitment.lastRefreshWeek !== postClose.weekIndex) {
      refreshRecruitmentMarketForWeek(true);
    }
    if (postClose.objectives.active.length < 3) {
      refreshObjectivesForWeek(false);
    }
    postClose.lastWeekSummary =
      `${summary} ${objectiveSummary} Queue applied ${weekQueueResult.applied}, pending ${weekQueueResult.pending}. ` +
      `Week ${postClose.weekIndex} is paused in planning mode until a plan is committed.`;
    return { weekClosed: true, summary: postClose.lastWeekSummary };
  }

  function spendGold(cost, reason) {
    if (state.gold < cost) {
      logLine(`Not enough gold for ${reason}.`, "bad");
      return false;
    }
    state.gold -= cost;
    return true;
  }

  function craft(label, consumes, outputs, extraGoldCost, dirtPenalty) {
    const actionWindow = requireActionWindow("craft");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    if (extraGoldCost > 0 && !spendGold(extraGoldCost, label)) {
      return;
    }
    const missing = [];
    for (const item in consumes) {
      if (state.inventory[item] < consumes[item]) {
        missing.push(item);
      }
    }
    if (missing.length > 0) {
      if (extraGoldCost > 0) {
        state.gold += extraGoldCost;
      }
      logLine(`${label} failed. Missing: ${missing.join(", ")}.`, "bad");
      render();
      return;
    }
    for (const item in consumes) {
      state.inventory[item] -= consumes[item];
    }
    const ingredientResult = evaluateIngredientBlend(consumes);
    const created = [];
    for (const item in outputs) {
      const produced = Math.max(1, Math.round(outputs[item] * ingredientResult.outputMult));
      state.inventory[item] += produced;
      created.push(`${PRODUCT_LABELS[item] || item} +${produced}`);
    }
    const addedDirt = ingredientResult.avgFreshness < 38 ? 1 : 0;
    state.cleanliness = clamp(state.cleanliness - dirtPenalty - addedDirt, 0, 100);
    state.productionQualitySum += ingredientResult.score;
    state.productionBatches += 1;
    logLine(
      `${label} completed (${created.join(", ")}, ${qualityTier(ingredientResult.avgQuality)} ingredients).`,
      "good"
    );
    render();
  }

  function hireRole(role, signingFee) {
    const actionWindow = requireActionWindow("hire_role");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    if (!spendGold(signingFee, `Hire ${role}`)) {
      return;
    }
    const recruit = createStaff(role);
    state.staff.push(recruit);
    logLine(
      `Hired ${role}: wage ${formatCoin(recruit.wage)}, morale ${recruit.morale}.`,
      "good"
    );
    render();
  }

  function fireStaff(staffId) {
    const actionWindow = requireActionWindow("fire_staff");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    if (state.staff.length <= 1) {
      logLine("You cannot fire your only remaining staff member.", "bad");
      return;
    }
    const idx = state.staff.findIndex((person) => person.id === staffId);
    if (idx < 0) {
      return;
    }
    const person = state.staff[idx];
    state.staff.splice(idx, 1);
    state.reputation = clamp(state.reputation - 1, 0, 100);
    logLine(`${person.role} dismissed. Reputation slipped slightly.`, "bad");
    render();
  }

  function trainStaff() {
    const actionWindow = requireActionWindow("train_staff");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return;
    }
    if (!spendGold(28, "Train Staff")) {
      return;
    }
    const trainable = state.staff.filter((person) => !isStaffUnavailable(person));
    if (trainable.length === 0) {
      state.gold += 28;
      logLine("Training cancelled: all staff are currently unavailable.", "bad");
      render();
      return;
    }
    const trainee = pick(trainable);
    const serviceGain = randInt(0, 2);
    const qualityGain = randInt(1, 3);
    trainee.service = clamp(trainee.service + serviceGain, 1, 30);
    trainee.quality = clamp(trainee.quality + qualityGain, 1, 30);
    trainee.morale = clamp(trainee.morale + randInt(2, 6), 0, 100);
    trainee.fatigue = clamp(trainee.fatigue + randInt(4, 8), 0, 100);
    logLine(
      `${trainee.role} improved (+${serviceGain} service, +${qualityGain} quality).`,
      "good"
    );
    render();
  }

  function runMarketing() {
    const actionWindow = requireActionWindow("marketing");
    if (!actionWindow.ok) {
      logLine(actionWindow.error, "bad");
      render();
      return { ok: false, error: actionWindow.error };
    }
    const cadence = enforceActionCadence("marketing", { perMinute: true, perDay: true });
    if (!cadence.ok) {
      logLine(cadence.error, "bad");
      render();
      return { ok: false, error: cadence.error };
    }
    if (!spendGold(32, "Marketing")) {
      return { ok: false, error: "Not enough gold for marketing." };
    }
    state.marketingDays = Math.max(state.marketingDays, 3);
    state.reputation = clamp(state.reputation + 1, 0, 100);
    logLine("Town crier campaign launched (+demand for 3 days).", "good");
    render();
    return { ok: true, days: state.marketingDays };
  }

function hostFestival() {
  const actionWindow = requireActionWindow("festival");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return { ok: false, error: actionWindow.error };
  }
  const cadence = enforceActionCadence("festival", { perMinute: true, perWeek: true });
  if (!cadence.ok) {
    logLine(cadence.error, "bad");
    render();
    return { ok: false, error: cadence.error };
  }
  if (!spendGold(50, "Minstrel Night")) {
    return { ok: false, error: "Not enough gold for minstrel night." };
  }
  state.festivalDays = Math.max(state.festivalDays, 2);
  state.cleanliness = clamp(state.cleanliness - 6, 0, 100);
  state.reputation = clamp(state.reputation + 2, 0, 100);
  logLine("Minstrel night booked (+demand for 2 days, more mess).", "good");
  render();
  return { ok: true, days: state.festivalDays };
}

function deepClean() {
  const actionWindow = requireActionWindow("deep_clean");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return;
  }
  if (!spendGold(14, "Deep clean")) {
    return;
  }
  state.cleanliness = clamp(state.cleanliness + 20, 0, 100);
  logLine("You paid for a full scrub and fresh linens (+cleanliness).", "good");
  render();
}

function repairTavern() {
  const actionWindow = requireActionWindow("repair_tavern");
  if (!actionWindow.ok) {
    logLine(actionWindow.error, "bad");
    render();
    return;
  }
  if (!spendGold(40, "Repairs")) {
    return;
  }
  state.condition = clamp(state.condition + 24, 0, 100);
  logLine("Carpenters repaired beams and tables (+condition).", "good");
  render();
}

  function evaluateIngredientBlend(consumes) {
    return evaluateIngredientBlendModel(consumes, state.supplyStats, { clamp });
  }

  function getProductionQualityContext() {
    return getProductionQualityContextModel(state.productionQualitySum, state.productionBatches);
  }

  function resetProductionQualityContext() {
    resetProductionQualityContextModel(state);
  }

  function applySupplySpoilage() {
    return applySupplySpoilageModel(state.inventory, state.supplyStats, state.cleanliness, {
      randInt,
      clamp
    });
  }

  function progressStaffAbsences() {
    return progressStaffAbsencesModel(state.staff, {
      clamp,
      randInt,
      logLine
    });
  }

  function assignDailyShifts(weekday) {
    return assignDailyShiftsModel(state.staff, weekday, state.rotaPreset, {
      clamp,
      randomFloat: () => random.nextFloat()
    });
  }

  function applyEndOfDayStaffEffects(shiftContext, satisfaction, net) {
    return applyEndOfDayStaffEffectsModel(state.staff, shiftContext, satisfaction, net, {
      clamp,
      randInt,
      randomFloat: () => random.nextFloat(),
      logLine
    });
  }

  function applyWeeklyStaffingPolicyBeforeDay(weekday) {
    const manager = getManagerState();
    const plan = manager.committedPlan && typeof manager.committedPlan === "object"
      ? manager.committedPlan
      : manager.planDraft;
    const stats = getStaffStats();
    const availableCount = state.staff.filter((person) => !isStaffUnavailable(person)).length;
    const staffingIntent = `${plan.staffingIntent || "balanced"}`;

    let coverageTarget = staffingIntent === "training_push" ? 3 : 2;
    let plannedPreset = "balanced";
    let qualityBoost = 0;
    let demandMult = 1;
    let fatigueRelief = 0;
    let note = "Staffing policy held a balanced rota.";

    if (staffingIntent === "rest_focus") {
      plannedPreset = stats.avgFatigue >= 58 ? "day_heavy" : "balanced";
      qualityBoost = 0;
      fatigueRelief = 2;
      note = "Rest-focus policy prioritized fatigue recovery and safer shifts.";
    } else if (staffingIntent === "training_push") {
      plannedPreset = weekday === "Fri" || weekday === "Sat" ? "balanced" : "night_heavy";
      qualityBoost = 2;
      fatigueRelief = 1;
      note = "Training-push policy emphasized skill reps during service.";
    } else {
      plannedPreset = weekday === "Fri" || weekday === "Sat" ? "night_heavy" : "balanced";
      qualityBoost = 1;
      note = "Balanced policy flexed coverage for peak nights.";
    }

    if (availableCount < coverageTarget) {
      plannedPreset = "balanced";
      demandMult *= 0.92;
      qualityBoost -= 1;
      note = `Shortage contingency engaged (${availableCount}/${coverageTarget} available).`;
    }

    // Controlled variance keeps outcomes from feeling scripted while respecting weekly intent.
    if (random.nextFloat() < 0.18) {
      if (plannedPreset === "balanced") {
        plannedPreset = staffingIntent === "rest_focus" ? "day_heavy" : "night_heavy";
      } else {
        plannedPreset = "balanced";
      }
      note += " Minor rota variance applied.";
    }

    state.rotaPreset = plannedPreset;

    return {
      staffingIntent,
      coverageTarget,
      availableCount,
      plannedPreset,
      qualityBoost,
      demandMult,
      fatigueRelief,
      note
    };
  }

  function buildSupplyTargetsForPlan(plan, suppliers) {
    const procurementIntent = `${plan.procurementIntent || "stability"}`;
    const volatility = Math.max(0, Math.round(Number(suppliers.volatility) || 0));
    const base = procurementIntent === "quality"
      ? { grain: 26, hops: 20, honey: 14, meat: 18, veg: 18, bread: 20, wood: 24 }
      : procurementIntent === "cost_control"
        ? { grain: 20, hops: 14, honey: 10, meat: 14, veg: 14, bread: 16, wood: 18 }
        : { grain: 23, hops: 17, honey: 12, meat: 16, veg: 16, bread: 18, wood: 20 };
    const volatilityBuffer = volatility >= 64 ? 4 : volatility >= 50 ? 2 : 0;
    const caravanBoost = suppliers.caravan && suppliers.caravan.windowDays > 0 ? 2 : 0;
    const wholesaleBoost = suppliers.contracts && suppliers.contracts.arcanumWholesaleDays > 0 ? 3 : 0;
    return Object.fromEntries(
      Object.entries(base).map(([item, amount]) => [
        item,
        amount + volatilityBuffer + caravanBoost + (item === "grain" || item === "hops" ? wholesaleBoost : 0)
      ])
    );
  }

  function applyMenuFallbackPolicy(plan) {
    const policy = `${plan.menuFallbackPolicy || "substitute_first"}`;
    const notes = [];

    if (state.inventory.meat <= 6 || state.inventory.stew <= 6) {
      const next = Math.max(6, state.prices.stew - 1);
      if (next !== state.prices.stew) {
        state.prices.stew = next;
        notes.push("stew value fallback active");
      }
    }
    if (state.inventory.honey <= 4 && state.inventory.mead <= 6) {
      const next = Math.max(6, state.prices.mead - 1);
      if (next !== state.prices.mead) {
        state.prices.mead = next;
        notes.push("mead substitute pricing active");
      }
    }
    if (policy === "margin_guard" && state.inventory.ale <= 8) {
      const next = Math.min(14, state.prices.ale + 1);
      if (next !== state.prices.ale) {
        state.prices.ale = next;
        notes.push("ale margin guard active");
      }
    }

    return notes.length > 0 ? `Menu fallback: ${notes.join(", ")}.` : "Menu fallback: no adjustments needed.";
  }

  function applyWeeklySupplyPlannerBeforeDay() {
    const manager = getManagerState();
    const plan = manager.committedPlan && typeof manager.committedPlan === "object"
      ? manager.committedPlan
      : manager.planDraft;
    const suppliers = state.world.suppliers;
    const planner = manager.supplyPlanner;
    planner.weeklyBudgetCap = Math.max(0, Math.round(Number(plan.supplyBudgetCap) || planner.weeklyBudgetCap || 0));
    planner.stockTargets = buildSupplyTargetsForPlan(plan, suppliers);

    const unitCosts = {
      grain: 5,
      hops: 6,
      honey: 9,
      meat: 8,
      veg: 5,
      bread: 4,
      wood: 4
    };

    const deficits = Object.entries(planner.stockTargets)
      .map(([item, target]) => {
        const current = Math.max(0, Math.round(Number(state.inventory[item]) || 0));
        const reorderTrigger = Math.max(5, Math.round(target * 0.58));
        const deficit = current < reorderTrigger ? target - current : 0;
        return { item, target, current, reorderTrigger, deficit };
      })
      .filter((entry) => entry.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);

    const remainingBudget = Math.max(0, planner.weeklyBudgetCap - planner.spent);
    let procurementNote = "Supply planner held position.";
    if (deficits.length > 0 && remainingBudget > 0) {
      const top = deficits[0];
      const caravanBoost = suppliers.caravan.windowDays > 0 ? 2 : 0;
      const contractBoost = suppliers.contracts.localBrokerDays > 0 ? 1 : 0;
      const orderAmount = Math.max(1, Math.min(top.deficit, 5 + caravanBoost + contractBoost));
      const beforeGold = state.gold;
      const purchaseResult = buySupply(top.item, orderAmount, unitCosts[top.item] || 5, {
        silent: true,
        allowDuringBoundary: true
      });
      const spent = Math.max(0, beforeGold - state.gold);
      planner.spent += spent;
      if (purchaseResult && purchaseResult.ok) {
        procurementNote =
          `Supply planner ordered ${purchaseResult.amount} ${top.item} ` +
          `(${formatCoin(spent)} used, ${formatCoin(Math.max(0, planner.weeklyBudgetCap - planner.spent))} budget left).`;
      } else {
        procurementNote =
          `Supply planner attempted ${top.item} restock but order failed (${purchaseResult && purchaseResult.error ? purchaseResult.error : "unknown reason"}).`;
      }
    } else if (deficits.length > 0) {
      procurementNote = "Supply planner paused reorders (weekly budget exhausted).";
    }

    const menuFallbackNote = applyMenuFallbackPolicy(plan);
    planner.lastAction = `${procurementNote} ${menuFallbackNote}`;
    return {
      summary: planner.lastAction,
      weeklyBudgetCap: planner.weeklyBudgetCap,
      spent: planner.spent,
      deficits
    };
  }

  function advanceDay(options = {}) {
    normalizeWorldState();
    const trigger =
      typeof options.trigger === "string" && TIMEFLOW_TRIGGER_PRECEDENCE.includes(options.trigger)
        ? options.trigger
        : "manual_skip";
    const resolution = beginTimeflowResolution(trigger);
    if (!resolution.ok) {
      return { ok: false, error: resolution.error, phase: getManagerState().phase };
    }
    const boundaryOrder = [];
    let resolutionSucceeded = false;
    try {
      const autoPrepareExecution = options.autoPrepareExecution !== false;
      if (autoPrepareExecution) {
        const ready = ensureExecutionPhaseForLiveSim("Live simulation prepared execution phase.");
        if (!ready.ok) {
          const reason = ready.error || "Unable to prepare execution phase.";
          logLine(reason, "bad");
          render();
          return { ok: false, error: reason, phase: getManagerState().phase };
        }
      } else {
        const manager = getManagerState();
        if (manager.phase !== MANAGER_PHASES.EXECUTION || !manager.planCommitted || !manager.committedPlan) {
          const reason =
            manager.phase !== MANAGER_PHASES.EXECUTION
              ? `Cannot advance day during ${manager.phase} phase. Commit the weekly plan first.`
              : "Cannot advance day without a committed weekly plan.";
          logLine(reason, "neutral");
          render();
          return { ok: false, error: reason, phase: manager.phase };
        }
      }
      boundaryOrder.push("day_close");
      const travelContext = progressDistrictTravel();
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    state.day += 1;
    const dayQueueResult = flushPlanningIntentQueue("day_start");
    const timeline = refreshSeasonTimeline();
    const delegationRun = runDelegatedRoutines("day_start");
    const supplierNetworkSummary = progressSupplierNetwork();
    const supplyPlannerResult = applyWeeklySupplyPlannerBeforeDay();
    const supplierSummary = `${supplierNetworkSummary} ${supplyPlannerResult.summary}`;
    const recruitmentSummary = progressRecruitmentMarketDay();
    const rivalSummary = progressRivalTavernSimulation();
    const weekday = DAY_NAMES[(state.day - 1) % 7];
    const staffingPlan = applyWeeklyStaffingPolicyBeforeDay(weekday);
    const absenceProgress = progressStaffAbsences();
    const spoilageSummary = applySupplySpoilage();
    const shiftContext = assignDailyShifts(weekday);
    const staffStats = getStaffStats();
    const initialWorldMods = getWorldRuntimeModifiers();
    const baseEventMods = rollDailyEvent(travelContext.eventChanceMult, initialWorldMods.eventChanceMult);
    const calendarEventSummary =
      typeof baseEventMods.eventSummary === "string"
        ? baseEventMods.eventSummary
        : "No major district or calendar event today.";
    const actorHook = rollWorldActorEventHook();
    const worldMods = getWorldRuntimeModifiers();
    const mods = mergeDayMods(baseEventMods, actorHook.mods);
    mods.qualityBoost += staffingPlan.qualityBoost;
    mods.demandMult *= staffingPlan.demandMult;
    const kitchenContext = getProductionQualityContext();
    const rivalPriceBaselineMult = clamp(1 - worldMods.rivalPricePressure * 0.22, 0.78, 1.04);

    state.cleanliness = clamp(state.cleanliness - randInt(2, 6) + mods.cleanliness, 0, 100);
    state.condition = clamp(state.condition - randInt(1, 4) + mods.condition, 0, 100);
    state.reputation = clamp(state.reputation + mods.reputation, 0, 100);

    const weekendMult = weekday === "Fri" || weekday === "Sat" ? 1.22 : 1.0;

    let demandBase =
      24 +
      state.reputation * 0.9 +
      staffStats.service * 1.2 +
      (state.cleanliness + state.condition) * 0.3;
    demandBase =
      demandBase *
      weekendMult *
      location.demandMult *
      district.demandMult *
      travelContext.demandMult *
      worldMods.demandMult;
    demandBase *= shiftContext.demandMult;
    const loyaltyDemandMult = getLoyaltyDemandMultiplier();
    demandBase *= loyaltyDemandMult;

    if (state.marketingDays > 0) {
      demandBase *= 1.17 * location.marketingBoostMult;
    }
    if (state.festivalDays > 0) {
      demandBase *= 1.24;
    }
    demandBase *= mods.demandMult;
    demandBase += mods.flatGuests;
    demandBase += randInt(-10, 10);

    const serviceCapacity = (22 + staffStats.service * 1.5) * shiftContext.serviceMult;
    const guests = Math.max(0, Math.floor(Math.min(demandBase, serviceCapacity)));

    const qualityScore = clamp(
      30 +
        state.condition * 0.25 +
        state.cleanliness * 0.25 +
        staffStats.quality * 2 +
        (staffStats.avgMorale - 50) * 0.35 +
        kitchenContext.boost +
        mods.qualityBoost,
      0,
      100
    );

    const aleDemand = Math.floor(guests * 0.62 * demandByPrice("ale", 6 * rivalPriceBaselineMult));
    const meadDemand = Math.floor(guests * 0.33 * demandByPrice("mead", 8 * rivalPriceBaselineMult));
    const stewDemand = Math.floor(guests * 0.48 * demandByPrice("stew", 10 * rivalPriceBaselineMult));
    const breadDemand = Math.floor(guests * 0.28 * demandByPrice("bread", 4 * rivalPriceBaselineMult));
    const roomDemand = Math.floor(guests * 0.18 * demandByPrice("room", 16 * clamp(1 - worldMods.rivalPricePressure * 0.14, 0.84, 1.05)));

    const soldAle = sellFromInventory("ale", aleDemand);
    const soldMead = sellFromInventory("mead", meadDemand);
    const soldStew = sellFromInventory("stew", stewDemand);
    const soldBread = sellFromInventory("bread", breadDemand);
    const soldRooms = Math.min(roomDemand, 16 + Math.floor(staffStats.service / 12));

    const revenue =
      soldAle * state.prices.ale +
      soldMead * state.prices.mead +
      soldStew * state.prices.stew +
      soldBread * state.prices.bread +
      soldRooms * state.prices.room;

    const payroll = staffStats.payroll;
    const upkeep = 10 + Math.floor((100 - state.condition) / 7);
    const randomLoss = mods.expense;
    const disruptionExpense = shiftContext.injuredCount * 2 + shiftContext.disputeCount * 2;
    const crownTaxRate = clamp(location.taxRate + worldMods.taxRateBonus, 0.03, 0.36);
    const crownTaxFlat = Math.max(0, location.taxFlat + worldMods.taxFlatBonus + (mods.taxBonus || 0));
    const crownTaxAccrued = crownTaxFlat + Math.max(0, Math.round(revenue * crownTaxRate));
    const auditResult = runCrownAuditCheck(worldMods);
    const operatingExpenses =
      payroll + upkeep + randomLoss + disruptionExpense + Math.max(0, auditResult.immediateExpense || 0);
    const collectionResult = resolveCrownCollection(crownTaxAccrued, revenue, operatingExpenses);
    const crownTaxPaid = collectionResult.taxPayment;
    const expenses = operatingExpenses + crownTaxPaid;

    const net = revenue - expenses;
    state.gold += net;
    state.lastGuests = guests;
    state.lastRevenue = revenue;
    state.lastExpenses = expenses;
    state.lastNet = net;

    const desiredSales = aleDemand + meadDemand + stewDemand + breadDemand;
    const madeSales = soldAle + soldMead + soldStew + soldBread;
    const fulfillment = desiredSales <= 0 ? 1 : madeSales / desiredSales;
    const satisfaction = clamp(
      (qualityScore / 100) * 0.6 +
        fulfillment * 0.32 +
        shiftContext.shiftFit * 0.08 -
        (state.prices.room > 22 ? 0.03 : 0),
      0.15,
      1.05
    );
    const patronReport = updatePatronLoyalty({
      guests,
      qualityScore,
      wanted: {
        ale: aleDemand,
        mead: meadDemand,
        stew: stewDemand,
        bread: breadDemand,
        room: roomDemand
      },
      sold: {
        ale: soldAle,
        mead: soldMead,
        stew: soldStew,
        bread: soldBread,
        room: soldRooms
      }
    });
    const staffIncidentSummary = applyEndOfDayStaffEffects(shiftContext, satisfaction, net);
    if (staffingPlan.fatigueRelief > 0) {
      state.staff.forEach((person) => {
        if (!isStaffUnavailable(person)) {
          person.fatigue = clamp(person.fatigue - staffingPlan.fatigueRelief, 0, 100);
        }
      });
    }
    state.lastReport = {
      loyaltyDemandMult,
      ...patronReport,
      staffing:
        `${shiftContext.summary} ${staffingPlan.note} ` +
        `Rota ${ROTA_PRESETS[state.rotaPreset].label}, coverage ${staffingPlan.availableCount}/${staffingPlan.coverageTarget}. ` +
        `Avg fatigue ${staffIncidentSummary.avgFatigue}.`,
      supplies: spoilageSummary,
      supplierSummary,
      rivalSummary,
      recruitmentSummary,
      kitchen: Math.round(kitchenContext.score),
      satisfaction: Math.round(satisfaction * 100),
      crownTax: crownTaxAccrued,
      crownDue: collectionResult.dueToday,
      crownPayment: crownTaxPaid,
      district: district.label,
      events: calendarEventSummary,
      actorEvent: actorHook.actorSummary,
      actorSummary: summarizeWorldActorsForReport(),
      crownSummary: collectionResult.collectionSummary,
      compliance: getCrownAuthority().complianceScore,
      rivalPressure: Math.round(worldMods.rivalPressure * 100),
      reputationSummary: state.world.reputationModel.lastSummary,
      topCohortStandingLabel: "Locals",
      topCohortStandingScore: state.world.reputationModel.cohorts.locals,
      lowCohortStandingLabel: "Locals",
      lowCohortStandingScore: state.world.reputationModel.cohorts.locals,
      topGroupStandingLabel: "Crown Tax Office",
      topGroupStandingScore: state.world.reputationModel.groups.crown_office.score,
      lowGroupStandingLabel: "Crown Tax Office",
      lowGroupStandingScore: state.world.reputationModel.groups.crown_office.score,
      crownComplianceStanding: state.world.reputationModel.crownComplianceStanding,
      worldLayerSummary: state.lastReport.worldLayerSummary || "World layer updates pending for today.",
      weeklyWorldSummary: state.world.reporting.lastWeeklySummary,
      delegationSummary: delegationRun.summary,
      managerToolingSummary: "Manager tooling update pending."
    };
    state.lastReport.timeflowQueueSummary = state.timeflow ? state.timeflow.lastQueueSummary : "No queue summary.";
    state.lastReport.seasonSummary = `Year ${timeline.year}, ${timeline.seasonLabel} week ${timeline.weekOfSeason}.`;
    updateObjectiveProgressDaily({
      compliance: state.lastReport.compliance,
      satisfaction: state.lastReport.satisfaction,
      net
    });
    state.lastReport.objectiveSummary = getManagerState().objectives.lastSummary;
    const analyticsSummary = updateAnalyticsForDay({
      wanted: {
        ale: aleDemand,
        mead: meadDemand,
        stew: stewDemand,
        bread: breadDemand,
        room: roomDemand
      },
      sold: {
        ale: soldAle,
        mead: soldMead,
        stew: soldStew,
        bread: soldBread,
        room: soldRooms
      },
      guests,
      revenue,
      net,
      retentionPct: state.lastReport.topCohortLoyalty
    });
    const scoutingSummary = updateScoutingForDay();
    publishDailyCommandBoard({
      compliance: state.lastReport.compliance,
      arrears: getCrownAuthority().arrears,
      rivalPressure: state.lastReport.rivalPressure,
      avgFatigue: staffIncidentSummary.avgFatigue,
      net,
      eventSummary: calendarEventSummary
    });
    state.lastReport.managerToolingSummary =
      `Command board: ${getManagerState().commandBoard.lastSummary} ` +
      `Delegation: ${delegationRun.summary} ` +
      `Analytics: conversion ${analyticsSummary.conversionPct}% margin ${analyticsSummary.marginPct}%. ` +
      `Scouting: ${scoutingSummary.summary}`;

    const repSwing = Math.round((satisfaction - 0.64) * 11);
    const rivalReputationDrag = Math.max(
      0,
      Math.round(worldMods.rivalReputationPressure * (satisfaction < 0.62 ? 6 : 3))
    );
    state.reputation = clamp(
      state.reputation +
        repSwing +
        collectionResult.reputationDelta +
        (auditResult.reputationDelta || 0) -
        rivalReputationDrag,
      0,
      100
    );

    state.staff.forEach((person) => {
      if (isStaffUnavailable(person)) {
        return;
      }
      let moraleChange = Math.round((satisfaction - 0.6) * 6);
      if (net < 0) {
        moraleChange -= 1;
      }
      if (person.fatigue >= 80) {
        moraleChange -= 1;
      }
      person.morale = clamp(person.morale + moraleChange, 0, 100);
    });
    applyWorldActorDrift(net, satisfaction);
    const reputationModelReport = applyWorldReputationModelDayUpdate({
      satisfaction,
      net,
      rivalPressure: worldMods.rivalPressure,
      supplierVolatility: state.world.suppliers.volatility,
      collectionResult,
      auditResult
    });
    state.lastReport.reputationSummary = reputationModelReport.summary;
    state.lastReport.topCohortStandingLabel = reputationModelReport.topCohortLabel;
    state.lastReport.topCohortStandingScore = reputationModelReport.topCohortScore;
    state.lastReport.lowCohortStandingLabel = reputationModelReport.lowCohortLabel;
    state.lastReport.lowCohortStandingScore = reputationModelReport.lowCohortScore;
    state.lastReport.topGroupStandingLabel = reputationModelReport.topGroupLabel;
    state.lastReport.topGroupStandingScore = reputationModelReport.topGroupScore;
    state.lastReport.lowGroupStandingLabel = reputationModelReport.lowGroupLabel;
    state.lastReport.lowGroupStandingScore = reputationModelReport.lowGroupScore;
    state.lastReport.crownComplianceStanding = reputationModelReport.crownComplianceStanding;
    state.lastReport.worldLayerSummary =
      `District ${district.label}. ${calendarEventSummary} ` +
      `Influence: ${actorHook.actorSummary} ` +
      `Crown: ${collectionResult.collectionSummary} ` +
      `Supplier: ${supplierSummary} ` +
      `Rival: ${rivalSummary} ` +
      `Reputation: ${reputationModelReport.summary}`;
    const weeklyWorldReport = updateWorldReportingState({
      guests,
      net,
      crownTaxAccrued,
      crownTaxPaid,
      compliance: state.lastReport.compliance,
      supplierVolatility: state.world.suppliers.volatility,
      supplierSummary,
      rivalPressure: state.lastReport.rivalPressure,
      eventSummary: calendarEventSummary
    });
    state.lastReport.weeklyWorldSummary = weeklyWorldReport.weeklySummary;
    state.lastReport.actorSummary = summarizeWorldActorsForReport();
    decayWorldEffects();

    if (state.marketingDays > 0) {
      state.marketingDays -= 1;
    }
    if (state.festivalDays > 0) {
      state.festivalDays -= 1;
    }

    if (state.gold < 0) {
      state.reputation = clamp(state.reputation - 1, 0, 100);
      logLine("Creditors are watching. Negative gold hurts reputation.", "bad");
    }

    if (state.cleanliness < 35) {
      logLine("Guests complained about grime. Clean soon.", "bad");
    }
    if (state.condition < 30) {
      logLine("The building is deteriorating. Repairs are urgent.", "bad");
    }
    if (spoilageSummary !== "No ingredient spoilage today.") {
      logLine(spoilageSummary, "bad");
    }
    if (absenceProgress.returnedCount > 0) {
      logLine(`Staff returns this morning: ${absenceProgress.returnedCount}.`, "good");
    }
    if (staffIncidentSummary.newInjuries + staffIncidentSummary.newDisputes > 0) {
      logLine(
        `Staff issues today: ${staffIncidentSummary.newInjuries} injuries, ${staffIncidentSummary.newDisputes} disputes.`,
        "bad"
      );
    }
    if (shiftContext.availableCount < 2) {
      logLine("Staffing is dangerously thin. Consider recruiting immediately.", "bad");
    }
    if (travelContext.inTransitToday) {
      logLine(
        `Travel day in progress (${travelContext.currentDistrict} -> ${travelContext.destinationDistrict}). Demand and events were muted.`,
        "neutral"
      );
    }
    if (auditResult.auditTriggered) {
      logLine(auditResult.summary, auditResult.tone || "neutral");
    }
    if (collectionResult.dueToday > 0) {
      logLine(collectionResult.collectionSummary, collectionResult.reputationDelta < 0 ? "bad" : "neutral");
    }
    if (rivalReputationDrag >= 2) {
      logLine("Rival tavern chatter eroded goodwill by day end.", "bad");
    }
    if (weeklyWorldReport.weekClosed) {
      logLine(state.lastReport.weeklyWorldSummary, "neutral");
    }
    if (delegationRun.actions > 0) {
      logLine(delegationRun.summary, "neutral");
    }
    if (scoutingSummary.newRumor) {
      logLine(`New rumor logged: ${scoutingSummary.newRumor.summary}`, "neutral");
    }

    logLine(
      `Day ${state.day} closed in ${district.label}: ${guests} guests, revenue ${formatCoin(revenue)}, crown accrued ${formatCoin(crownTaxAccrued)}, paid ${formatCoin(crownTaxPaid)}, net ${formatCoin(net)}.`,
      net >= 0 ? "good" : "bad"
    );
    const cycleResult = finalizeExecutionWeek({ guests, net });
    if (cycleResult.weekClosed) {
      boundaryOrder.push("week_close");
      logLine(cycleResult.summary, "neutral");
      logLine("Weekly execution ended. Review planning board and commit the next week.", "neutral");
    }
    boundaryOrder.push("reporting_publish");

    resetProductionQualityContext();
    render();
    resolutionSucceeded = true;
    return {
      ok: true,
      day: state.day,
      weekClosed: cycleResult.weekClosed,
      phase: getManagerState().phase,
      dayQueueResult
    };
    } finally {
      endTimeflowResolution({
        trigger,
        boundaryOrder,
        day: state.day,
        boundaryKey: resolution.boundaryKey,
        success: resolutionSucceeded
      });
    }
  }

  function demandByPrice(item, baseline) {
    return demandByPriceModel(state.prices, item, baseline);
  }

  function sellFromInventory(item, wanted) {
    return sellFromInventoryModel(state.inventory, item, wanted);
  }

  function getStaffStats() {
    return getStaffStatsModel(state.staff, clamp);
  }

  function getLoyaltyDemandMultiplier() {
    return getLoyaltyDemandMultiplierModel(state.patrons, clamp);
  }

  function updatePatronLoyalty(dayStats) {
    return updatePatronLoyaltyModel({
      patrons: state.patrons,
      dayStats,
      prices: state.prices,
      randInt,
      clamp
    });
  }

  function rollDailyEvent(travelEventChanceMult = 1, actorEventChanceMult = 1) {
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    return rollDailyEventModel(state, {
      randInt,
      pick,
      randomFloat: () => random.nextFloat(),
      logLine,
      eventChanceMult:
        location.eventChanceMult *
        district.eventChanceMult *
        travelEventChanceMult *
        actorEventChanceMult,
      eventWeights: location.eventWeights
    });
  }

function render() {
  changeListeners.forEach((listener) => listener());
}

function logLine(message, tone) {
  state.log.unshift({ day: state.day, message, tone });
  if (state.log.length > 180) {
    state.log.length = 180;
  }
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeWithTemplate(template, source) {
  if (Array.isArray(template)) {
    return Array.isArray(source) ? cloneData(source) : cloneData(template);
  }
  if (template && typeof template === "object") {
    const output = {};
    const sourceObject = source && typeof source === "object" ? source : {};
    for (const key in template) {
      output[key] = mergeWithTemplate(template[key], sourceObject[key]);
    }
    for (const key in sourceObject) {
      if (!(key in output)) {
        output[key] = cloneData(sourceObject[key]);
      }
    }
    return output;
  }
  return source === undefined ? template : source;
}

function applyStateSnapshot(snapshot) {
  const next = cloneData(snapshot);
  for (const key in state) {
    delete state[key];
  }
  Object.assign(state, next);
}

function saveGame() {
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    random: random.snapshot(),
    state: cloneData(state)
  };
}

function migrateSnapshotV0ToV1(snapshot) {
  const input = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    version: 1,
    savedAt: typeof input.savedAt === "string" ? input.savedAt : new Date().toISOString(),
    random: input.random && typeof input.random === "object"
      ? input.random
      : { mode: "system", seed: null, state: null },
    state: input.state && typeof input.state === "object" ? input.state : null
  };
}

function migrateSaveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, error: "Missing save payload." };
  }
  let working = cloneData(snapshot);
  let version = Number.isInteger(working.version) ? working.version : 0;
  if (version > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Save version ${version} is newer than supported schema ${SAVE_SCHEMA_VERSION}.`
    };
  }
  const migrations = [];
  while (version < SAVE_SCHEMA_VERSION) {
    if (version === 0) {
      working = migrateSnapshotV0ToV1(working);
      migrations.push("0->1");
      version = 1;
      continue;
    }
    return {
      ok: false,
      error: `No migration path from save version ${version} to ${SAVE_SCHEMA_VERSION}.`
    };
  }
  if (!working.state || typeof working.state !== "object") {
    return { ok: false, error: "Save payload is missing state data." };
  }
  if (!working.random || typeof working.random !== "object") {
    working.random = { mode: "system", seed: null, state: null };
  }
  working.version = SAVE_SCHEMA_VERSION;
  return { ok: true, snapshot: working, migrations };
}

function loadGame(snapshot) {
  const migrated = migrateSaveSnapshot(snapshot);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  const payload = migrated.snapshot;
  const missingManagerState = !(payload.state && typeof payload.state === "object" && payload.state.manager);
  const missingTimeflowState = !(payload.state && typeof payload.state === "object" && payload.state.timeflow);
  const merged = mergeWithTemplate(stateTemplate, payload.state);
  applyStateSnapshot(merged);
  normalizeWorldState();
  if (missingManagerState) {
    refreshPlanningContext({ overwriteDraft: true });
    refreshRecruitmentMarketForWeek(true);
    refreshObjectivesForWeek(true);
  }
  if (missingTimeflowState) {
    state.timeflow = createTimeflowRuntimeState(state.timeflow);
  }
  random.restore(payload.random);
  initialized = true;
  render();
  return {
    ok: true,
    migrations: migrated.migrations,
    rehydrated: {
      manager: missingManagerState,
      timeflow: missingTimeflowState
    }
  };
}

function setRandomSeed(seedLike) {
  const ok = random.setSeed(seedLike);
  if (!ok) {
    return false;
  }
  return true;
}

function clearRandomSeed() {
  random.clearSeed();
}

function startNewGame(seedLike = null, startingLocationOrOptions = null) {
  let normalizedSeed = seedLike;
  let selectedLocation = startingLocationOrOptions;
  if (seedLike && typeof seedLike === "object" && !Array.isArray(seedLike)) {
    normalizedSeed = seedLike.seed ?? null;
    selectedLocation = seedLike.startingLocation ?? seedLike.location ?? null;
  } else if (startingLocationOrOptions && typeof startingLocationOrOptions === "object") {
    selectedLocation =
      startingLocationOrOptions.startingLocation ?? startingLocationOrOptions.location ?? null;
  }
  const startingLocation = resolveStartingLocation(selectedLocation).id;

  if (normalizedSeed === null || normalizedSeed === undefined || normalizedSeed === "") {
    clearRandomSeed();
  } else if (!setRandomSeed(normalizedSeed)) {
    return { ok: false, error: "Seed must be a valid number." };
  }

  applyStateSnapshot(createInitialState(startingLocation));
  normalizeWorldState();
  initialized = false;
  initGame();
  return { ok: true, startingLocation };
}

function listScenarios() {
  return listScenarioFixtures();
}

function loadScenario(scenarioId, seedLike = null) {
  const fixture = getScenarioFixture(scenarioId);
  if (!fixture) {
    return {
      ok: false,
      error: `Unknown scenario: ${scenarioId}.`
    };
  }

  const selectedSeed =
    seedLike === null || seedLike === undefined || seedLike === ""
      ? fixture.recommendedSeed
      : seedLike;

  const bootResult = startNewGame(selectedSeed);
  if (!bootResult.ok) {
    return bootResult;
  }

  fixture.apply(state, { createStaff });
  logLine(`Scenario loaded: ${fixture.label}.`, "neutral");
  render();

  return {
    ok: true,
    scenario: fixture.id,
    seed: selectedSeed
  };
}

function subscribeOnChange(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  changeListeners.push(listener);
  return () => {
    const index = changeListeners.indexOf(listener);
    if (index >= 0) {
      changeListeners.splice(index, 1);
    }
  };
}

function setOnChange(listener) {
  changeListeners.length = 0;
  if (typeof listener === "function") {
    changeListeners.push(listener);
  }
}

function initGame() {
  if (initialized) {
    return;
  }
  normalizeWorldState();
  const location = getActiveLocationProfile();
  const district = getCurrentDistrictProfile();
  const timeline = refreshSeasonTimeline();
  const planningGuidance = refreshPlanningContext({ overwriteDraft: true });
  const recruitmentSummary = refreshRecruitmentMarketForWeek(true);
  const objectiveSummary = refreshObjectivesForWeek(true);
  const executionReady = ensureExecutionPhaseForLiveSim("Campaign opened in live execution mode.");
  const manager = getManagerState();
  initialized = true;
  logLine(`Tavern charter signed in ${location.label} (${location.title}).`, "neutral");
  logLine(`Operating district: ${district.label}.`, "neutral");
  logLine(`Influence watch: ${summarizeWorldActorsForReport()}`, "neutral");
  logLine(location.summary, "neutral");
  logLine(`Manager loop ready: Week ${manager.weekIndex} is in ${manager.phase} phase.`, "neutral");
  logLine(`Timeline: Year ${timeline.year}, ${timeline.seasonLabel} week ${timeline.weekOfSeason}.`, "neutral");
  logLine(`Planning context synced from world layer: ${planningGuidance.summary}`, "neutral");
  logLine(`Recruitment board: ${recruitmentSummary}`, "neutral");
  logLine(`Objective board: ${objectiveSummary}`, "neutral");
  postCommandMessage({
    source: "command_center",
    urgency: "medium",
    category: "operations",
    title: "Campaign Command Board Online",
    summary: `Week ${manager.weekIndex} opened in ${manager.phase} phase. Review planning and staffing cadence.`,
    confidence: 92,
    impact: 54,
    linkedAction: "planning_board",
    expiresDay: state.day + 3,
    recommendation: buildRecommendationPayload(
      "review_planning",
      "Review weekly plan",
      90,
      58,
      "Early plan corrections reduce downstream disruption."
    )
  });
  postCommandMessage({
    source: "analytics_desk",
    urgency: "low",
    category: "analytics",
    title: "Analytics Baseline Ready",
    summary: "Daily conversion, retention, and menu margin tracking starts after first day close.",
    confidence: 88,
    impact: 38,
    linkedAction: "analytics_dashboard",
    expiresDay: state.day + 5,
    recommendation: buildRecommendationPayload(
      "review_dashboard",
      "Open analytics dashboard",
      83,
      40,
      "Baseline review helps catch weak signals early."
    )
  });
  if (!executionReady.ok) {
    logLine(`Live execution warning: ${executionReady.error}`, "bad");
  } else {
    logLine("Live simulation is ready. Use Pause, Play, Fast x2, or Fast x4.", "good");
  }
  logLine("Tip: keep ale and stew stocked before Fridays and Saturdays.", "neutral");
  logLine("Tip: loyal patrons boost future demand. Watch the daily report.", "neutral");
  logLine("Tip: fatigue builds over time. Use rota presets to protect your staff.", "neutral");
  render();
}

export {
  DAY_NAMES,
  COHORT_PROFILES,
  listStartingLocations,
  listDistricts,
  listWorldActors,
  getCrownAuthorityStatus,
  getSupplierNetworkStatus,
  getRivalStatus,
  getWorldReputationStatus,
  getWorldLayerStatus,
  getTimeflowContractStatus,
  getTimeflowDiagnostics,
  getManagerPhaseStatus,
  getManagerToolingStatus,
  getManagerLayerStatus,
  getSimulationClockStatus,
  listTravelOptions,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  state,
  initGame,
  setOnChange,
  subscribeOnChange,
  formatCoin,
  qualityTier,
  saveGame,
  loadGame,
  setRandomSeed,
  clearRandomSeed,
  startNewGame,
  listScenarios,
  loadScenario,
  getStaffStats,
  setRotaPreset,
  updateWeeklyPlanDraft,
  setCommandBoardSection,
  setCommandBoardFilters,
  markCommandMessageRead,
  markAllCommandMessagesRead,
  setDelegationRoleEnabled,
  setDelegationTaskEnabled,
  commitWeeklyPlan,
  shortlistRecruitCandidate,
  scoutRecruitCandidate,
  runScoutingSweep,
  signRecruitCandidate,
  startDistrictTravel,
  fileComplianceReport,
  settleCrownArrears,
  signLocalBrokerContract,
  signArcanumWholesaleContract,
  scheduleCityStockRun,
  adjustPrice,
  buySupply,
  craft,
  hireRole,
  fireStaff,
  trainStaff,
  runMarketing,
  hostFestival,
  setTimeflowParityStatus,
  setSimulationSpeed,
  advanceSimulationMinutes,
  deepClean,
  repairTavern,
  advanceDay
};
