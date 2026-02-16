import {
  DAY_NAMES,
  COHORT_PROFILES,
  ROTA_PRESETS,
  state,
  listStartingLocations,
  listTravelOptions,
  getCrownAuthorityStatus,
  getSupplierNetworkStatus,
  fileComplianceReport,
  settleCrownArrears,
  signLocalBrokerContract,
  signArcanumWholesaleContract,
  scheduleCityStockRun,
  startDistrictTravel,
  startNewGame,
  getManagerPhaseStatus,
  getManagerToolingStatus,
  getSimulationClockStatus,
  getTimeflowContractStatus,
  setSimulationSpeed,
  advanceSimulationMinutes,
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
  setOnChange,
  formatCoin,
  qualityTier,
  getStaffStats,
  setRotaPreset,
  adjustPrice,
  buySupply,
  craft,
  hireRole,
  fireStaff,
  trainStaff,
  runMarketing,
  hostFestival,
  deepClean,
  repairTavern,
  advanceDay
} from "../engine/gameEngine.js";
import { createPixelRenderer } from "./pixelRenderer.js";

let simulationTickerHandle = null;
const UI_HANDOFF_CONTRACT_VERSION = "m6-ui-handoff-v1";
const UI_ROUTE_DEFINITIONS = Object.freeze({
  command: Object.freeze({
    entryPointId: "planningStatusView",
    mountPointIds: Object.freeze([
      "clockStatusView",
      "planningStatusView",
      "commandBoardView",
      "delegationView",
      "alertStrip"
    ])
  }),
  operations: Object.freeze({
    entryPointId: "brewAleBtn",
    mountPointIds: Object.freeze([
      "inventoryView",
      "priceView",
      "supplierStatusView"
    ])
  }),
  staff: Object.freeze({
    entryPointId: "staffView",
    mountPointIds: Object.freeze([
      "staffView",
      "delegationView",
      "scoutingView"
    ])
  }),
  world: Object.freeze({
    entryPointId: "districtStatusView",
    mountPointIds: Object.freeze([
      "districtStatusView",
      "crownStatusView",
      "supplierStatusView",
      "worldActorsView"
    ])
  }),
  analytics: Object.freeze({
    entryPointId: "analyticsView",
    mountPointIds: Object.freeze([
      "analyticsView",
      "scoutingView",
      "reportDailySummaryView"
    ])
  }),
  reports: Object.freeze({
    entryPointId: "reportFilterInput",
    mountPointIds: Object.freeze([
      "reportDailySummaryView",
      "reportWeeklyView",
      "reportView",
      "reportLogSummaryView",
      "logView"
    ])
  })
});
const IN_GAME_VIEW_IDS = Object.freeze(Object.keys(UI_ROUTE_DEFINITIONS));
const REPORT_TABS = ["daily", "weekly", "log"];
const UI_PANEL_MOUNT_POINT_IDS = Object.freeze({
  app_shell: "appShell",
  nav_bar: "inGameNav",
  alert_strip: "alertStrip",
  scene_canvas: "sceneCanvas",
  clock_status: "clockStatusView",
  planning_board: "planningStatusView",
  command_board: "commandBoardView",
  delegation_desk: "delegationView",
  district_travel: "districtStatusView",
  crown_compliance: "crownStatusView",
  supplier_network: "supplierStatusView",
  world_influence: "worldActorsView",
  inventory_board: "inventoryView",
  price_board: "priceView",
  staff_roster: "staffView",
  analytics_dashboard: "analyticsView",
  scouting_desk: "scoutingView",
  report_daily_surface: "reportView",
  report_weekly_surface: "reportWeeklyView",
  report_log_surface: "logView"
});
const UI_ACTION_HOOK_SELECTORS = Object.freeze({
  route_command: '#inGameNav button[data-ui-route="command"]',
  route_operations: '#inGameNav button[data-ui-route="operations"]',
  route_staff: '#inGameNav button[data-ui-route="staff"]',
  route_world: '#inGameNav button[data-ui-route="world"]',
  route_analytics: '#inGameNav button[data-ui-route="analytics"]',
  route_reports: '#inGameNav button[data-ui-route="reports"]',
  action_pause_time: "#pauseSimBtn",
  action_play_time: "#playSimBtn",
  action_fast_x2: "#fast2SimBtn",
  action_fast_x4: "#fast4SimBtn",
  action_skip_next_day: "#nextDayBtn",
  action_update_plan_draft: "#updatePlanDraftBtn",
  action_commit_plan: "#commitPlanBtn",
  action_travel_begin: "#travelBtn",
  action_file_compliance: "#fileComplianceBtn",
  action_settle_arrears: "#settleArrearsBtn",
  action_sign_local_contract: "#signLocalContractBtn",
  action_sign_wholesale_contract: "#signWholesaleContractBtn",
  action_dispatch_stock_run: "#stockRunBtn",
  action_train_staff: "#trainBtn",
  action_run_marketing: "#marketingBtn",
  action_host_minstrel_night: "#festivalBtn",
  action_hire_server: "#hireServerBtn",
  report_tab_daily: "#reportTabDailyBtn",
  report_tab_weekly: "#reportTabWeeklyBtn",
  report_tab_log: "#reportTabLogBtn",
  report_search: "#reportFilterInput",
  report_log_tone: "#logToneSelect",
  alert_jump: "#alertStrip button[data-ui-alert-view]"
});
const UI_AUDIT_NOTES = Object.freeze([
  "M6 audit: grouped by intent -> command, operations, staff, world, analytics, reports.",
  "High-frequency controls stay in Command/Operations; low-frequency controls moved behind view routes/collapsers."
]);
const VIEW_SHORTCUT_BY_KEY = Object.freeze({
  "1": "command",
  "2": "operations",
  "3": "staff",
  "4": "world",
  "5": "analytics",
  "6": "reports"
});
const ALERT_PRIORITY_BY_URGENCY = Object.freeze({
  blocking: 500,
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
  good: 0
});
const ALERT_ACTION_BY_LINKED_ACTION = Object.freeze({
  file_compliance: {
    view: "world",
    targetId: "fileComplianceBtn",
    label: "File Crown report"
  },
  supplier_actions: {
    view: "operations",
    targetId: "supplierStatusView",
    label: "Review supplier network"
  },
  planning_board: {
    view: "command",
    targetId: "planningStatusView",
    label: "Open planning board"
  },
  pricing_board: {
    view: "operations",
    targetId: "priceView",
    label: "Review price board"
  },
  objective_board: {
    view: "command",
    targetId: "commandBoardView",
    label: "Open objective directives"
  },
  world_events: {
    view: "world",
    targetId: "districtStatusView",
    label: "Review world events"
  },
  daily_report: {
    view: "reports",
    targetId: "reportTabDailyBtn",
    reportTab: "daily",
    label: "Open daily report"
  },
  review_scouting: {
    view: "staff",
    targetId: "scoutingView",
    label: "Open scouting desk"
  },
  analytics_dashboard: {
    view: "analytics",
    targetId: "analyticsView",
    label: "Open analytics dashboard"
  }
});
const ALERT_ACTION_BY_CATEGORY = Object.freeze({
  compliance: { view: "world", targetId: "fileComplianceBtn", label: "Open Crown actions" },
  supply: { view: "operations", targetId: "supplierStatusView", label: "Open supplier actions" },
  staffing: { view: "staff", targetId: "staffView", label: "Open staff controls" },
  rivalry: { view: "world", targetId: "worldActorsView", label: "Open world pressure" },
  finance: { view: "reports", targetId: "reportTabDailyBtn", reportTab: "daily", label: "Open daily report" },
  events: { view: "world", targetId: "districtStatusView", label: "Open event outlook" },
  scouting: { view: "staff", targetId: "scoutingView", label: "Open scouting desk" },
  objectives: { view: "command", targetId: "commandBoardView", label: "Open objectives" },
  analytics: { view: "analytics", targetId: "analyticsView", label: "Open analytics" },
  operations: { view: "command", targetId: "planningStatusView", label: "Open command board" }
});

function byId(id, documentRef) {
  return documentRef.getElementById(id);
}

function cloneUiHandoffContract() {
  const routes = {};
  IN_GAME_VIEW_IDS.forEach((routeId) => {
    const def = UI_ROUTE_DEFINITIONS[routeId];
    routes[routeId] = {
      entryPointId: def.entryPointId,
      mountPointIds: def.mountPointIds.slice()
    };
  });
  return {
    version: UI_HANDOFF_CONTRACT_VERSION,
    routeIds: IN_GAME_VIEW_IDS.slice(),
    routes,
    panelMountPoints: { ...UI_PANEL_MOUNT_POINT_IDS },
    actionHooks: { ...UI_ACTION_HOOK_SELECTORS }
  };
}

function applyUiHandoffDomContract(documentRef) {
  if (documentRef.body) {
    documentRef.body.setAttribute("data-ui-contract-version", UI_HANDOFF_CONTRACT_VERSION);
  }
  IN_GAME_VIEW_IDS.forEach((routeId) => {
    const btn = documentRef.querySelector(`#inGameNav button[data-ui-route="${routeId}"]`);
    if (btn) {
      btn.setAttribute("data-ui-route-id", routeId);
    }
  });
  Object.entries(UI_PANEL_MOUNT_POINT_IDS).forEach(([mountId, nodeId]) => {
    const node = documentRef.getElementById(nodeId);
    if (node) {
      node.setAttribute("data-ui-mount", mountId);
    }
  });
  Object.entries(UI_ACTION_HOOK_SELECTORS).forEach(([hookId, selector]) => {
    const nodes = Array.from(documentRef.querySelectorAll(selector));
    nodes.forEach((node) => {
      node.setAttribute("data-ui-action-hook", hookId);
    });
  });
}

export function createGameUI(documentRef = document, options = {}) {
  const uiOptions = {
    onStartCampaign:
      typeof options.onStartCampaign === "function" ? options.onStartCampaign : null,
    onContinueCampaign:
      typeof options.onContinueCampaign === "function" ? options.onContinueCampaign : null,
    onSettingsChange:
      typeof options.onSettingsChange === "function" ? options.onSettingsChange : null,
    initialSettings: normalizeMenuSettings(options.initialSettings),
    hasContinue: Boolean(options.hasContinue),
    continueLabel:
      typeof options.continueLabel === "string" && options.continueLabel.length > 0
        ? options.continueLabel
        : "No saved campaign found."
  };
  const menuState = {
    view: "main_menu",
    transitioning: false,
    selectedLocation: "arcanum",
    hasContinue: uiOptions.hasContinue,
    continueLabel: uiOptions.continueLabel,
    settings: { ...uiOptions.initialSettings },
    inGameView: normalizeInGameViewId(uiOptions.initialSettings.inGameView),
    reportTab: normalizeReportTabId(uiOptions.initialSettings.reportTab),
    reportFilter: "",
    reportLogTone: "all"
  };
  const el = {
    appShell: byId("appShell", documentRef),
    menuRoot: byId("menuRoot", documentRef),
    menuPlayBtn: byId("menuPlayBtn", documentRef),
    menuSettingsBtn: byId("menuSettingsBtn", documentRef),
    menuContinueBtn: byId("menuContinueBtn", documentRef),
    menuContinueMeta: byId("menuContinueMeta", documentRef),
    menuLocationCards: byId("menuLocationCards", documentRef),
    menuSeedInput: byId("menuSeedInput", documentRef),
    menuStartCampaignBtn: byId("menuStartCampaignBtn", documentRef),
    menuBackFromLocationBtn: byId("menuBackFromLocationBtn", documentRef),
    menuAudioModeSelect: byId("menuAudioModeSelect", documentRef),
    menuUiScaleSelect: byId("menuUiScaleSelect", documentRef),
    menuTextSizeSelect: byId("menuTextSizeSelect", documentRef),
    menuDefaultSpeedSelect: byId("menuDefaultSpeedSelect", documentRef),
    menuBackFromSettingsBtn: byId("menuBackFromSettingsBtn", documentRef),
    inGameNav: byId("inGameNav", documentRef),
    alertStrip: byId("alertStrip", documentRef),
    sceneCanvas: byId("sceneCanvas", documentRef),
    startLocationSelect: byId("startLocationSelect", documentRef),
    startSeedInput: byId("startSeedInput", documentRef),
    districtStatusView: byId("districtStatusView", documentRef),
    travelDestinationSelect: byId("travelDestinationSelect", documentRef),
    crownStatusView: byId("crownStatusView", documentRef),
    supplierStatusView: byId("supplierStatusView", documentRef),
    worldActorsView: byId("worldActorsView", documentRef),
    clockStatusView: byId("clockStatusView", documentRef),
    pauseSimBtn: byId("pauseSimBtn", documentRef),
    playSimBtn: byId("playSimBtn", documentRef),
    fast2SimBtn: byId("fast2SimBtn", documentRef),
    fast4SimBtn: byId("fast4SimBtn", documentRef),
    nextDayBtn: byId("nextDayBtn", documentRef),
    travelBtn: byId("travelBtn", documentRef),
    marketingBtn: byId("marketingBtn", documentRef),
    festivalBtn: byId("festivalBtn", documentRef),
    signLocalContractBtn: byId("signLocalContractBtn", documentRef),
    signWholesaleContractBtn: byId("signWholesaleContractBtn", documentRef),
    stockRunBtn: byId("stockRunBtn", documentRef),
    updatePlanDraftBtn: byId("updatePlanDraftBtn", documentRef),
    commitPlanBtn: byId("commitPlanBtn", documentRef),
    planningStatusView: byId("planningStatusView", documentRef),
    commandBoardView: byId("commandBoardView", documentRef),
    delegationView: byId("delegationView", documentRef),
    analyticsView: byId("analyticsView", documentRef),
    scoutingView: byId("scoutingView", documentRef),
    planStaffingSelect: byId("planStaffingSelect", documentRef),
    planPricingSelect: byId("planPricingSelect", documentRef),
    planProcurementSelect: byId("planProcurementSelect", documentRef),
    planMarketingSelect: byId("planMarketingSelect", documentRef),
    planLogisticsSelect: byId("planLogisticsSelect", documentRef),
    planRiskSelect: byId("planRiskSelect", documentRef),
    planReserveInput: byId("planReserveInput", documentRef),
    planNoteInput: byId("planNoteInput", documentRef),
    topStats: byId("topStats", documentRef),
    inventoryView: byId("inventoryView", documentRef),
    priceView: byId("priceView", documentRef),
    staffView: byId("staffView", documentRef),
    reportTabDailyBtn: byId("reportTabDailyBtn", documentRef),
    reportTabWeeklyBtn: byId("reportTabWeeklyBtn", documentRef),
    reportTabLogBtn: byId("reportTabLogBtn", documentRef),
    reportFilterInput: byId("reportFilterInput", documentRef),
    logToolbar: byId("logToolbar", documentRef),
    logToneSelect: byId("logToneSelect", documentRef),
    reportDailySummaryView: byId("reportDailySummaryView", documentRef),
    reportLogSummaryView: byId("reportLogSummaryView", documentRef),
    reportWeeklyView: byId("reportWeeklyView", documentRef),
    reportView: byId("reportView", documentRef),
    logView: byId("logView", documentRef)
  };
  const pixelRenderer = createPixelRenderer(el.sceneCanvas);
  if (simulationTickerHandle) {
    window.clearInterval(simulationTickerHandle);
  }
  simulationTickerHandle = window.setInterval(() => {
    if (menuState.view !== "in_game") {
      return;
    }
    const clock = getSimulationClockStatus();
    if (clock.speed > 0) {
      const tick = advanceSimulationMinutes(clock.speed);
      if (!tick.ok) {
        setSimulationSpeed(0);
      }
    }
    renderTopStats(el);
    renderSimulationClock(el);
  }, 1000);

  bindActions(documentRef, el, uiOptions, menuState);
  bindMenuActions(documentRef, el, uiOptions, menuState);
  setupGroupCollapsers(documentRef);
  applyUiHandoffDomContract(documentRef);
  renderMenuLocationCards(el, menuState);
  applyMenuSettings(menuState.settings);
  syncMenuSettingsInputs(el, menuState.settings);
  if (el.reportFilterInput) {
    el.reportFilterInput.value = menuState.reportFilter;
  }
  if (el.logToneSelect) {
    el.logToneSelect.value = menuState.reportLogTone;
  }
  applyInGameView(documentRef, el, menuState);
  applyReportTabVisibility(el, menuState);
  syncMenuContinueState(el, menuState);
  setOnChange(() => {
    render(el);
    pixelRenderer.render(state);
    if (menuState.view !== "in_game") {
      syncMenuContinueState(el, menuState);
    }
  });
  render(el);
  pixelRenderer.render(state);
  pixelRenderer.start();
  setMenuView(el, menuState, "main_menu", { immediate: true });

  return {
    render: () => {
      render(el);
      pixelRenderer.render(state);
    },
    enterGame: () => {
      setMenuView(el, menuState, "in_game");
    },
    showMenu: (view = "main_menu") => {
      setMenuView(el, menuState, view);
    },
    setContinueState: (hasContinue, continueLabel = "") => {
      menuState.hasContinue = Boolean(hasContinue);
      menuState.continueLabel =
        typeof continueLabel === "string" && continueLabel.length > 0
          ? continueLabel
          : menuState.hasContinue
            ? "Saved campaign available."
            : "No saved campaign found.";
      syncMenuContinueState(el, menuState);
    },
    applySettings: (settings) => {
      menuState.settings = normalizeMenuSettings(settings);
      menuState.inGameView = normalizeInGameViewId(menuState.settings.inGameView);
      menuState.reportTab = normalizeReportTabId(menuState.settings.reportTab);
      applyMenuSettings(menuState.settings);
      syncMenuSettingsInputs(el, menuState.settings);
      applyInGameView(documentRef, el, menuState);
      applyReportTabVisibility(el, menuState);
    },
    setInGameView: (viewId) => {
      menuState.inGameView = normalizeInGameViewId(viewId);
      menuState.settings.inGameView = menuState.inGameView;
      if (uiOptions.onSettingsChange) {
        uiOptions.onSettingsChange({ ...menuState.settings });
      }
      applyInGameView(documentRef, el, menuState);
      render(el);
    },
    getInGameView: () => menuState.inGameView,
    routeIds: () => IN_GAME_VIEW_IDS.slice(),
    handoffContract: () => cloneUiHandoffContract(),
    getSettings: () => ({ ...menuState.settings }),
    destroy: () => {
      if (simulationTickerHandle) {
        window.clearInterval(simulationTickerHandle);
        simulationTickerHandle = null;
      }
      pixelRenderer.destroy();
    }
  };
}

function bindActions(documentRef, el, uiOptions, menuState) {
  populateLocationOptions(el.startLocationSelect);
  populateTravelOptions(el.travelDestinationSelect);
  byId("startCampaignBtn", documentRef).addEventListener("click", () => {
    const seedRaw = el.startSeedInput.value.trim();
    const seed = seedRaw === "" ? null : seedRaw;
    const location = el.startLocationSelect.value;
    const result = uiOptions.onStartCampaign
      ? uiOptions.onStartCampaign({ seed, startingLocation: location, source: "in_game_panel" })
      : startNewGame(seed, location);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    menuState.hasContinue = true;
    menuState.continueLabel = buildContinueLabel();
    syncMenuContinueState(el, menuState);
    el.startLocationSelect.value = result.startingLocation;
  });
  byId("travelBtn", documentRef).addEventListener("click", () => {
    const destinationId = el.travelDestinationSelect.value;
    const result = startDistrictTravel(destinationId);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
  });
  byId("fileComplianceBtn", documentRef).addEventListener("click", () => {
    const result = fileComplianceReport();
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("settleArrearsBtn", documentRef).addEventListener("click", () => {
    const result = settleCrownArrears();
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("signLocalContractBtn", documentRef).addEventListener("click", () => {
    const result = signLocalBrokerContract();
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("signWholesaleContractBtn", documentRef).addEventListener("click", () => {
    const result = signArcanumWholesaleContract();
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("stockRunBtn", documentRef).addEventListener("click", () => {
    const result = scheduleCityStockRun();
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("updatePlanDraftBtn", documentRef).addEventListener("click", () => {
    const result = updateWeeklyPlanDraft(readWeeklyDraftInput(el));
    if (!result.ok) {
      window.alert(result.error);
    }
  });
  byId("commitPlanBtn", documentRef).addEventListener("click", () => {
    const draftUpdate = updateWeeklyPlanDraft(readWeeklyDraftInput(el));
    if (!draftUpdate.ok) {
      window.alert(draftUpdate.error);
      return;
    }
    const result = commitWeeklyPlan();
    if (!result.ok) {
      window.alert(result.error);
    }
  });

  if (el.pauseSimBtn) {
    el.pauseSimBtn.addEventListener("click", () => {
      setSimulationSpeed(0);
    });
  }
  if (el.playSimBtn) {
    el.playSimBtn.addEventListener("click", () => {
      setSimulationSpeed(1);
    });
  }
  if (el.fast2SimBtn) {
    el.fast2SimBtn.addEventListener("click", () => {
      setSimulationSpeed(2);
    });
  }
  if (el.fast4SimBtn) {
    el.fast4SimBtn.addEventListener("click", () => {
      setSimulationSpeed(4);
    });
  }

  byId("nextDayBtn", documentRef).addEventListener("click", () => advanceDay({ trigger: "manual_skip" }));

  byId("brewAleBtn", documentRef).addEventListener("click", () => {
    craft(
      "Brew Ale",
      { grain: 4, hops: 3, wood: 2 },
      { ale: 28 },
      0,
      2
    );
  });

  byId("brewMeadBtn", documentRef).addEventListener("click", () => {
    craft(
      "Brew Mead",
      { honey: 4, grain: 2, wood: 2 },
      { mead: 20 },
      0,
      2
    );
  });

  byId("cookStewBtn", documentRef).addEventListener("click", () => {
    craft(
      "Cook Stew",
      { meat: 4, veg: 4, bread: 2, wood: 1 },
      { stew: 18 },
      0,
      1
    );
  });

  byId("cleanBtn", documentRef).addEventListener("click", () => {
    deepClean();
  });

  byId("repairBtn", documentRef).addEventListener("click", () => {
    repairTavern();
  });

  byId("buyGrainBtn", documentRef).addEventListener("click", () => buySupply("grain", 8, 5));
  byId("buyHopsBtn", documentRef).addEventListener("click", () => buySupply("hops", 8, 6));
  byId("buyHoneyBtn", documentRef).addEventListener("click", () => buySupply("honey", 6, 9));
  byId("buyMeatBtn", documentRef).addEventListener("click", () => buySupply("meat", 6, 8));
  byId("buyVegBtn", documentRef).addEventListener("click", () => buySupply("veg", 8, 5));
  byId("buyBreadBtn", documentRef).addEventListener("click", () => buySupply("bread", 10, 4));
  byId("buyWoodBtn", documentRef).addEventListener("click", () => buySupply("wood", 10, 4));

  byId("hireServerBtn", documentRef).addEventListener("click", () => hireRole("server", 35));
  byId("hireCookBtn", documentRef).addEventListener("click", () => hireRole("cook", 45));
  byId("hireBarkeepBtn", documentRef).addEventListener("click", () => hireRole("barkeep", 42));
  byId("hireGuardBtn", documentRef).addEventListener("click", () => hireRole("guard", 38));

  byId("rotaBalancedBtn", documentRef).addEventListener("click", () => setRotaPreset("balanced"));
  byId("rotaDayBtn", documentRef).addEventListener("click", () => setRotaPreset("day_heavy"));
  byId("rotaNightBtn", documentRef).addEventListener("click", () => setRotaPreset("night_heavy"));

  byId("trainBtn", documentRef).addEventListener("click", trainStaff);
  byId("marketingBtn", documentRef).addEventListener("click", runMarketing);
  byId("festivalBtn", documentRef).addEventListener("click", hostFestival);

  el.priceView.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-product]");
    if (!btn) {
      return;
    }
    const product = btn.getAttribute("data-product");
    const delta = Number(btn.getAttribute("data-delta"));
    adjustPrice(product, delta);
  });

  el.staffView.addEventListener("click", (event) => {
    const fireBtn = event.target.closest("button[data-fire-id]");
    if (fireBtn) {
      const id = fireBtn.getAttribute("data-fire-id");
      fireStaff(id);
      return;
    }
    const shortlistBtn = event.target.closest("button[data-shortlist-id]");
    if (shortlistBtn) {
      const id = shortlistBtn.getAttribute("data-shortlist-id");
      const result = shortlistRecruitCandidate(id);
      if (!result.ok) {
        window.alert(result.error);
      }
      return;
    }
    const scoutBtn = event.target.closest("button[data-scout-id]");
    if (scoutBtn) {
      const id = scoutBtn.getAttribute("data-scout-id");
      const result = scoutRecruitCandidate(id);
      if (!result.ok) {
        window.alert(result.error);
      }
      return;
    }
    const signBtn = event.target.closest("button[data-sign-id]");
    if (signBtn) {
      const id = signBtn.getAttribute("data-sign-id");
      const result = signRecruitCandidate(id);
      if (!result.ok) {
        window.alert(result.error);
      }
    }
  });

  if (el.commandBoardView) {
    el.commandBoardView.addEventListener("click", (event) => {
      const sectionBtn = event.target.closest("button[data-command-section]");
      if (sectionBtn) {
        setCommandBoardSection(sectionBtn.getAttribute("data-command-section"));
        return;
      }
      const categoryBtn = event.target.closest("button[data-command-category]");
      if (categoryBtn) {
        setCommandBoardFilters({ category: categoryBtn.getAttribute("data-command-category") || "all" });
        return;
      }
      const urgencyBtn = event.target.closest("button[data-command-urgency]");
      if (urgencyBtn) {
        setCommandBoardFilters({ urgency: urgencyBtn.getAttribute("data-command-urgency") || "all" });
        return;
      }
      const readBtn = event.target.closest("button[data-command-read]");
      if (readBtn) {
        markCommandMessageRead(readBtn.getAttribute("data-command-read"));
        return;
      }
      const readAllBtn = event.target.closest("button[data-command-read-all]");
      if (readAllBtn) {
        markAllCommandMessagesRead();
      }
    });
  }

  if (el.delegationView) {
    el.delegationView.addEventListener("change", (event) => {
      const roleToggle = event.target.closest("input[data-delegation-role]");
      if (roleToggle) {
        const roleId = roleToggle.getAttribute("data-delegation-role");
        setDelegationRoleEnabled(roleId, roleToggle.checked);
        return;
      }
      const taskToggle = event.target.closest("input[data-delegation-task]");
      if (taskToggle) {
        const roleId = taskToggle.getAttribute("data-delegation-role");
        const taskId = taskToggle.getAttribute("data-delegation-task");
        setDelegationTaskEnabled(roleId, taskId, taskToggle.checked);
      }
    });
  }

  if (el.scoutingView) {
    el.scoutingView.addEventListener("click", (event) => {
      const sweepBtn = event.target.closest("button[data-scouting-sweep]");
      if (!sweepBtn) {
        return;
      }
      const targetType = sweepBtn.getAttribute("data-scouting-sweep") || "event";
      const result = runScoutingSweep(targetType);
      if (!result.ok) {
        window.alert(result.error);
      }
    });
  }

  if (el.inGameNav) {
    el.inGameNav.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-ui-route]");
      if (!btn) {
        return;
      }
      const route = normalizeInGameViewId(btn.getAttribute("data-ui-route"));
      if (menuState.inGameView !== route) {
        menuState.inGameView = route;
        menuState.settings.inGameView = route;
        if (uiOptions.onSettingsChange) {
          uiOptions.onSettingsChange({ ...menuState.settings });
        }
      }
      applyInGameView(documentRef, el, menuState);
      if (route === "reports" && menuState.reportTab === "daily") {
        menuState.reportTab = "weekly";
      }
      render(el);
    });
    el.inGameNav.addEventListener("keydown", (event) => {
      const targetButton = event.target.closest("button[data-ui-route]");
      if (!targetButton) {
        return;
      }
      const buttons = Array.from(el.inGameNav.querySelectorAll("button[data-ui-route]"));
      const index = buttons.indexOf(targetButton);
      if (index < 0) {
        return;
      }
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex = (index + 1) % buttons.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex = (index - 1 + buttons.length) % buttons.length;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = buttons.length - 1;
      }
      if (nextIndex !== index) {
        buttons[nextIndex].focus();
      }
    });
  }

  if (el.alertStrip) {
    el.alertStrip.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-ui-alert-view]");
      if (!btn) {
        return;
      }
      const nextView = normalizeInGameViewId(btn.getAttribute("data-ui-alert-view"));
      const reportTab = normalizeReportTabId(btn.getAttribute("data-ui-alert-report-tab"));
      const targetId = `${btn.getAttribute("data-ui-alert-target") || ""}`.trim();
      const commandCategory = `${btn.getAttribute("data-ui-alert-command-category") || ""}`.trim();
      const commandUrgency = `${btn.getAttribute("data-ui-alert-command-urgency") || ""}`.trim();
      menuState.inGameView = nextView;
      menuState.settings.inGameView = nextView;
      if (nextView === "reports") {
        menuState.reportTab = reportTab;
        menuState.settings.reportTab = reportTab;
      }
      if (uiOptions.onSettingsChange) {
        uiOptions.onSettingsChange({ ...menuState.settings });
      }
      if (commandCategory || commandUrgency) {
        setCommandBoardSection("message_board");
        setCommandBoardFilters({
          category: commandCategory || "all",
          urgency: commandUrgency || "all"
        });
      }
      applyInGameView(documentRef, el, menuState);
      applyReportTabVisibility(el, menuState);
      render(el);
      jumpToAlertTarget(documentRef, targetId);
    });
  }

  [el.reportTabDailyBtn, el.reportTabWeeklyBtn, el.reportTabLogBtn].forEach((btn) => {
    if (!btn) {
      return;
    }
    btn.addEventListener("click", () => {
      const tab = normalizeReportTabId(btn.getAttribute("data-report-tab"));
      menuState.reportTab = tab;
      menuState.settings.reportTab = tab;
      if (uiOptions.onSettingsChange) {
        uiOptions.onSettingsChange({ ...menuState.settings });
      }
      applyReportTabVisibility(el, menuState);
      renderReportTabs(el, menuState);
    });
  });

  if (el.reportFilterInput) {
    el.reportFilterInput.addEventListener("input", () => {
      menuState.reportFilter = el.reportFilterInput.value.trim().toLowerCase();
      renderReportTabs(el, menuState);
      renderReport(el);
      renderLog(el);
    });
  }

  if (el.logToneSelect) {
    el.logToneSelect.addEventListener("change", () => {
      menuState.reportLogTone = normalizeLogToneId(el.logToneSelect.value);
      el.logToneSelect.value = menuState.reportLogTone;
      renderLog(el);
      renderReportTabs(el, menuState);
    });
  }

  applyShortcutMetadata(el);
}

function normalizeInGameViewId(viewId) {
  return IN_GAME_VIEW_IDS.includes(`${viewId}`) ? `${viewId}` : "command";
}

function normalizeReportTabId(tabId) {
  return REPORT_TABS.includes(`${tabId}`) ? `${tabId}` : "daily";
}

function normalizeLogToneId(toneId) {
  const raw = `${toneId || ""}`.toLowerCase();
  return raw === "good" || raw === "neutral" || raw === "bad" ? raw : "all";
}

function annotateControlShortcut(control, shortcutLabel) {
  if (!control || !shortcutLabel) {
    return;
  }
  control.setAttribute("aria-keyshortcuts", shortcutLabel);
  const currentTitle = `${control.getAttribute("title") || ""}`.trim();
  const suffix = `Shortcut: ${shortcutLabel}.`;
  if (currentTitle.length === 0) {
    control.setAttribute("title", suffix);
    return;
  }
  if (!currentTitle.includes(suffix)) {
    control.setAttribute("title", `${currentTitle} ${suffix}`.trim());
  }
}

function applyShortcutMetadata(el) {
  if (el.inGameNav) {
    Array.from(el.inGameNav.querySelectorAll("button[data-ui-route]")).forEach((btn) => {
      const route = normalizeInGameViewId(btn.getAttribute("data-ui-route"));
      const pair = Object.entries(VIEW_SHORTCUT_BY_KEY).find(([, value]) => value === route);
      if (pair) {
        annotateControlShortcut(btn, `Alt+${pair[0]}`);
      }
    });
  }
  annotateControlShortcut(el.pauseSimBtn, "P");
  annotateControlShortcut(el.playSimBtn, "P");
  annotateControlShortcut(el.nextDayBtn, "N");
  annotateControlShortcut(el.marketingBtn, "M");
  annotateControlShortcut(el.festivalBtn, "F");
  annotateControlShortcut(el.updatePlanDraftBtn, "D");
  annotateControlShortcut(el.commitPlanBtn, "C");
  annotateControlShortcut(el.reportFilterInput, "/");
}

function normalizeMenuSettings(settings = null) {
  const input = settings && typeof settings === "object" ? settings : {};
  const allowedAudio = ["hearth_only", "muted"];
  const allowedUiScale = ["0.9", "1", "1.1"];
  const allowedTextSize = ["compact", "default", "large"];
  const allowedSpeed = ["0", "1", "2", "4"];

  const audioMode = allowedAudio.includes(`${input.audioMode}`) ? `${input.audioMode}` : "hearth_only";
  const uiScale = allowedUiScale.includes(`${input.uiScale}`) ? `${input.uiScale}` : "1";
  const textSize = allowedTextSize.includes(`${input.textSize}`) ? `${input.textSize}` : "default";
  const defaultSpeed = allowedSpeed.includes(`${input.defaultSpeed}`) ? `${input.defaultSpeed}` : "0";
  const inGameView = normalizeInGameViewId(input.inGameView);
  const reportTab = normalizeReportTabId(input.reportTab);

  return {
    audioMode,
    uiScale,
    textSize,
    defaultSpeed,
    inGameView,
    reportTab
  };
}

function syncMenuSettingsInputs(el, settings) {
  if (el.menuAudioModeSelect) {
    el.menuAudioModeSelect.value = settings.audioMode;
  }
  if (el.menuUiScaleSelect) {
    el.menuUiScaleSelect.value = settings.uiScale;
  }
  if (el.menuTextSizeSelect) {
    el.menuTextSizeSelect.value = settings.textSize;
  }
  if (el.menuDefaultSpeedSelect) {
    el.menuDefaultSpeedSelect.value = settings.defaultSpeed;
  }
}

function applyMenuSettings(settings) {
  const normalized = normalizeMenuSettings(settings);
  const textScale = normalized.textSize === "compact" ? 0.95 : normalized.textSize === "large" ? 1.08 : 1;
  const uiScale = Number(normalized.uiScale) || 1;
  const mergedScale = Math.max(0.8, Math.min(1.3, uiScale * textScale));
  document.documentElement.style.setProperty("--app-font-scale", `${mergedScale}`);
  document.body.setAttribute("data-audio-mode", normalized.audioMode);
}

function buildContinueLabel() {
  const manager = getManagerPhaseStatus();
  return `Saved campaign: Day ${state.day}, Week ${manager.weekIndex}, ${manager.phase} phase.`;
}

function syncMenuContinueState(el, menuState) {
  if (!el.menuContinueBtn || !el.menuContinueMeta) {
    return;
  }
  el.menuContinueBtn.disabled = !menuState.hasContinue || menuState.transitioning;
  el.menuContinueMeta.textContent = menuState.continueLabel;
}

function renderMenuLocationCards(el, menuState) {
  if (!el.menuLocationCards) {
    return;
  }
  const options = listStartingLocations();
  if (!options.some((entry) => entry.id === menuState.selectedLocation)) {
    menuState.selectedLocation = options.length > 0 ? options[0].id : "arcanum";
  }

  el.menuLocationCards.innerHTML = options
    .map((location) => {
      const activeClass = location.id === menuState.selectedLocation ? "active" : "";
      return `
        <button
          type="button"
          class="location-card ${activeClass}"
          data-menu-location="${location.id}"
          aria-pressed="${location.id === menuState.selectedLocation ? "true" : "false"}"
        >
          <h3>${location.label} (${location.title})</h3>
          <p>${location.summary}</p>
        </button>
      `;
    })
    .join("");
}

function focusMenuScreen(el, menuState) {
  if (menuState.view === "in_game") {
    return;
  }
  const target = menuState.view === "settings_menu"
    ? el.menuAudioModeSelect
    : menuState.view === "new_campaign_location_select"
      ? el.menuStartCampaignBtn
      : el.menuPlayBtn;
  if (target && typeof target.focus === "function") {
    target.focus();
  }
}

function lockMenuInteractivity(el, locked) {
  const controls = [
    el.menuPlayBtn,
    el.menuSettingsBtn,
    el.menuContinueBtn,
    el.menuStartCampaignBtn,
    el.menuBackFromLocationBtn,
    el.menuBackFromSettingsBtn,
    el.menuAudioModeSelect,
    el.menuUiScaleSelect,
    el.menuTextSizeSelect,
    el.menuDefaultSpeedSelect,
    el.menuSeedInput,
    ...Array.from(document.querySelectorAll("[data-menu-location]"))
  ];
  controls.forEach((control) => {
    if (control) {
      control.disabled = Boolean(locked);
    }
  });
}

function setMenuView(el, menuState, nextView, options = {}) {
  const targetView =
    nextView === "settings_menu" || nextView === "new_campaign_location_select" || nextView === "in_game"
      ? nextView
      : "main_menu";
  const immediate = Boolean(options.immediate);
  if (menuState.transitioning && !immediate) {
    return;
  }

  const applyView = () => {
    menuState.view = targetView;
    const inGame = targetView === "in_game";
    if (el.menuRoot) {
      el.menuRoot.classList.toggle("hidden", inGame);
    }
    if (el.appShell) {
      el.appShell.classList.toggle("hidden", !inGame);
      el.appShell.setAttribute("aria-hidden", inGame ? "false" : "true");
    }
    document.body.classList.toggle("menu-active", !inGame);
    Array.from(document.querySelectorAll("[data-menu-screen]")).forEach((screen) => {
      const screenId = screen.getAttribute("data-menu-screen");
      screen.classList.toggle("hidden", screenId !== targetView);
    });
    syncMenuContinueState(el, menuState);
    if (!inGame) {
      focusMenuScreen(el, menuState);
      return;
    }
    applyInGameView(document, el, menuState);
    applyReportTabVisibility(el, menuState);
    render(el);
  };

  if (immediate) {
    applyView();
    return;
  }

  menuState.transitioning = true;
  lockMenuInteractivity(el, true);
  if (el.menuRoot && !el.menuRoot.classList.contains("hidden")) {
    el.menuRoot.classList.add("is-transitioning");
  }

  window.setTimeout(() => {
    applyView();
    if (el.menuRoot) {
      el.menuRoot.classList.remove("is-transitioning");
    }
    menuState.transitioning = false;
    lockMenuInteractivity(el, false);
    syncMenuContinueState(el, menuState);
  }, 180);
}

function bindMenuActions(documentRef, el, uiOptions, menuState) {
  if (!el.menuRoot) {
    return;
  }

  const persistSettings = () => {
    if (uiOptions.onSettingsChange) {
      uiOptions.onSettingsChange({ ...menuState.settings });
    }
  };

  const applySettingsFromControls = () => {
    menuState.settings = normalizeMenuSettings({
      audioMode: el.menuAudioModeSelect ? el.menuAudioModeSelect.value : "hearth_only",
      uiScale: el.menuUiScaleSelect ? el.menuUiScaleSelect.value : "1",
      textSize: el.menuTextSizeSelect ? el.menuTextSizeSelect.value : "default",
      defaultSpeed: el.menuDefaultSpeedSelect ? el.menuDefaultSpeedSelect.value : "0",
      inGameView: menuState.inGameView,
      reportTab: menuState.reportTab
    });
    applyMenuSettings(menuState.settings);
    syncMenuSettingsInputs(el, menuState.settings);
    persistSettings();
  };

  if (el.menuPlayBtn) {
    el.menuPlayBtn.addEventListener("click", () => {
      renderMenuLocationCards(el, menuState);
      setMenuView(el, menuState, "new_campaign_location_select");
    });
  }

  if (el.menuSettingsBtn) {
    el.menuSettingsBtn.addEventListener("click", () => {
      syncMenuSettingsInputs(el, menuState.settings);
      setMenuView(el, menuState, "settings_menu");
    });
  }

  if (el.menuBackFromLocationBtn) {
    el.menuBackFromLocationBtn.addEventListener("click", () => {
      setMenuView(el, menuState, "main_menu");
    });
  }

  if (el.menuBackFromSettingsBtn) {
    el.menuBackFromSettingsBtn.addEventListener("click", () => {
      setMenuView(el, menuState, "main_menu");
    });
  }

  if (el.menuLocationCards) {
    el.menuLocationCards.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-menu-location]");
      if (!btn) {
        return;
      }
      const selected = btn.getAttribute("data-menu-location");
      if (!selected) {
        return;
      }
      menuState.selectedLocation = selected;
      renderMenuLocationCards(el, menuState);
    });
  }

  if (el.menuStartCampaignBtn) {
    el.menuStartCampaignBtn.addEventListener("click", () => {
      const seedRaw = el.menuSeedInput ? el.menuSeedInput.value.trim() : "";
      const seed = seedRaw.length > 0 ? seedRaw : null;
      const selectedLocation = menuState.selectedLocation || "arcanum";
      if (menuState.hasContinue) {
        const confirmed = window.confirm(
          "Starting a new campaign will overwrite your current save. Continue?"
        );
        if (!confirmed) {
          return;
        }
      }
      const result = uiOptions.onStartCampaign
        ? uiOptions.onStartCampaign({
            seed,
            startingLocation: selectedLocation,
            source: "menu_play"
          })
        : startNewGame(seed, selectedLocation);
      if (!result.ok) {
        window.alert(result.error || "Unable to start campaign.");
        return;
      }
      menuState.hasContinue = true;
      menuState.continueLabel = buildContinueLabel();
      syncMenuContinueState(el, menuState);
      setMenuView(el, menuState, "in_game");
      setSimulationSpeed(Number(menuState.settings.defaultSpeed) || 0);
    });
  }

  if (el.menuContinueBtn) {
    el.menuContinueBtn.addEventListener("click", () => {
      if (!menuState.hasContinue) {
        return;
      }
      const result = uiOptions.onContinueCampaign ? uiOptions.onContinueCampaign() : { ok: false, error: "Continue not available." };
      if (!result.ok) {
        window.alert(result.error || "Unable to continue campaign.");
        return;
      }
      menuState.hasContinue = true;
      menuState.continueLabel = buildContinueLabel();
      syncMenuContinueState(el, menuState);
      setMenuView(el, menuState, "in_game");
    });
  }

  [
    el.menuAudioModeSelect,
    el.menuUiScaleSelect,
    el.menuTextSizeSelect,
    el.menuDefaultSpeedSelect
  ].forEach((control) => {
    if (control) {
      control.addEventListener("change", applySettingsFromControls);
    }
  });

  if (el.menuSeedInput) {
    el.menuSeedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && el.menuStartCampaignBtn) {
        event.preventDefault();
        el.menuStartCampaignBtn.click();
      }
    });
  }

  const switchInGameView = (viewId, options = {}) => {
    const nextView = normalizeInGameViewId(viewId);
    const focusEntry = Boolean(options.focusEntry);
    if (menuState.inGameView !== nextView) {
      menuState.inGameView = nextView;
      menuState.settings.inGameView = nextView;
      if (uiOptions.onSettingsChange) {
        uiOptions.onSettingsChange({ ...menuState.settings });
      }
    }
    if (nextView === "reports" && menuState.reportTab === "daily" && options.preferWeeklyOnReports) {
      menuState.reportTab = "weekly";
      menuState.settings.reportTab = "weekly";
      if (uiOptions.onSettingsChange) {
        uiOptions.onSettingsChange({ ...menuState.settings });
      }
    }
    applyInGameView(documentRef, el, menuState);
    applyReportTabVisibility(el, menuState);
    render(el);
    if (focusEntry) {
      focusViewEntryPoint(documentRef, nextView);
    }
  };

  const expandCollapsedAncestors = (node) => {
    if (!node) {
      return;
    }
    let collapsed = node.closest(".group.is-collapsed");
    while (collapsed) {
      const toggle = collapsed.querySelector(".group-toggle");
      if (!toggle || typeof toggle.click !== "function") {
        break;
      }
      toggle.click();
      collapsed = node.closest(".group.is-collapsed");
    }
  };

  const focusViewEntryPoint = (documentCtx, viewId) => {
    const map = {
      command: ["planningStatusView", "clockStatusView", "commandBoardView", "commitPlanBtn"],
      operations: ["brewAleBtn", "buyGrainBtn", "inventoryView", "priceView"],
      staff: ["staffView", "hireServerBtn", "rotaBalancedBtn"],
      world: ["districtStatusView", "travelDestinationSelect", "fileComplianceBtn"],
      analytics: ["analyticsView", "scoutingView"],
      reports: ["reportFilterInput", "reportTabDailyBtn", "reportView"]
    };
    const ids = map[normalizeInGameViewId(viewId)] || [];
    for (const id of ids) {
      const node = documentCtx.getElementById(id);
      if (!node) {
        continue;
      }
      expandCollapsedAncestors(node);
      const isVisible = node.getClientRects().length > 0 && !node.classList.contains("hidden");
      if (!isVisible) {
        continue;
      }
      if (typeof node.focus === "function") {
        node.focus({ preventScroll: true });
        if (typeof node.scrollIntoView === "function") {
          node.scrollIntoView({ block: "nearest" });
        }
        break;
      }
    }
  };

  const runCoreShortcut = (controlId, viewId = "command") => {
    switchInGameView(viewId, { focusEntry: false, preferWeeklyOnReports: false });
    const control = documentRef.getElementById(controlId);
    if (!control) {
      return false;
    }
    expandCollapsedAncestors(control);
    if (control.disabled || control.getClientRects().length === 0) {
      return false;
    }
    if (typeof control.click === "function") {
      control.click();
      return true;
    }
    return false;
  };

  documentRef.addEventListener("keydown", (event) => {
    if (menuState.view === "in_game") {
      const activeTag = documentRef.activeElement ? documentRef.activeElement.tagName : "";
      const typingContext =
        activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
      if (typingContext) {
        return;
      }
      if (event.altKey) {
        if (VIEW_SHORTCUT_BY_KEY[event.key]) {
          event.preventDefault();
          switchInGameView(VIEW_SHORTCUT_BY_KEY[event.key], { focusEntry: true, preferWeeklyOnReports: true });
          return;
        }
      }
      if (event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const currentIndex = IN_GAME_VIEW_IDS.indexOf(menuState.inGameView);
        const direction = event.key === "[" ? -1 : 1;
        const nextIndex = (currentIndex + direction + IN_GAME_VIEW_IDS.length) % IN_GAME_VIEW_IDS.length;
        switchInGameView(IN_GAME_VIEW_IDS[nextIndex], { focusEntry: true, preferWeeklyOnReports: true });
      }

      const key = `${event.key || ""}`.toLowerCase();
      if (key === "/" || key === "?") {
        event.preventDefault();
        switchInGameView("reports", { focusEntry: true, preferWeeklyOnReports: false });
        if (el.reportFilterInput) {
          el.reportFilterInput.focus();
          el.reportFilterInput.select();
        }
        return;
      }
      if (key === "p") {
        event.preventDefault();
        const clock = getSimulationClockStatus();
        setSimulationSpeed(clock.speed === 0 ? 1 : 0);
        return;
      }
      if (key === "n") {
        event.preventDefault();
        runCoreShortcut("nextDayBtn", "command");
        return;
      }
      if (key === "m") {
        event.preventDefault();
        runCoreShortcut("marketingBtn", "command");
        return;
      }
      if (key === "t") {
        event.preventDefault();
        runCoreShortcut("trainBtn", "command");
        return;
      }
      if (key === "f") {
        event.preventDefault();
        runCoreShortcut("festivalBtn", "command");
        return;
      }
      if (key === "c") {
        event.preventDefault();
        runCoreShortcut("commitPlanBtn", "command");
        return;
      }
      if (key === "d") {
        event.preventDefault();
        runCoreShortcut("updatePlanDraftBtn", "command");
        return;
      }
      return;
    }
    if (event.key === "Escape") {
      if (menuState.view === "settings_menu" || menuState.view === "new_campaign_location_select") {
        event.preventDefault();
        setMenuView(el, menuState, "main_menu");
      }
    }
  });
}

function applyInGameView(documentRef, el, menuState) {
  const activeView = normalizeInGameViewId(menuState.inGameView);
  const viewTargets = Array.from(documentRef.querySelectorAll("[data-ui-view]"));
  viewTargets.forEach((node) => {
    const raw = node.getAttribute("data-ui-view") || "";
    const allowed = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const visible = allowed.length === 0 || allowed.includes(activeView);
    node.classList.toggle("ui-hidden", !visible);
  });
  Array.from(documentRef.querySelectorAll(".col")).forEach((col) => {
    const visibleChild = Array.from(col.querySelectorAll("[data-ui-view]")).some(
      (node) => !node.classList.contains("ui-hidden")
    );
    col.classList.toggle("ui-hidden", !visibleChild);
  });

  if (el.inGameNav) {
    Array.from(el.inGameNav.querySelectorAll("button[data-ui-route]")).forEach((btn) => {
      const route = normalizeInGameViewId(btn.getAttribute("data-ui-route"));
      btn.classList.toggle("primary", route === activeView);
      btn.classList.toggle("active-speed", route === activeView);
      btn.setAttribute("aria-pressed", route === activeView ? "true" : "false");
    });
  }

  if (activeView !== "reports" && menuState.reportTab === "log") {
    menuState.reportTab = "daily";
  }
  applyReportTabVisibility(el, menuState);
}

function applyReportTabVisibility(el, menuState) {
  const tab = normalizeReportTabId(menuState.reportTab);
  if (el.reportDailySummaryView) {
    el.reportDailySummaryView.classList.toggle("hidden", tab !== "daily");
  }
  if (el.reportView) {
    el.reportView.classList.toggle("hidden", tab !== "daily");
  }
  if (el.reportWeeklyView) {
    el.reportWeeklyView.classList.toggle("hidden", tab !== "weekly");
  }
  if (el.reportLogSummaryView) {
    el.reportLogSummaryView.classList.toggle("hidden", tab !== "log");
  }
  if (el.logToolbar) {
    el.logToolbar.classList.toggle("hidden", tab !== "log");
  }
  if (el.logView) {
    el.logView.classList.toggle("hidden", tab !== "log");
  }
  [
    [el.reportTabDailyBtn, "daily"],
    [el.reportTabWeeklyBtn, "weekly"],
    [el.reportTabLogBtn, "log"]
  ].forEach(([btn, id]) => {
    if (!btn) {
      return;
    }
    const active = tab === id;
    btn.classList.toggle("primary", active);
    btn.classList.toggle("active-speed", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setupGroupCollapsers(documentRef) {
  const groups = Array.from(documentRef.querySelectorAll(".group[data-collapsible=\"true\"]"));
  groups.forEach((group, index) => {
    const heading = group.querySelector("h3");
    if (!heading || group.querySelector(".group-toggle")) {
      return;
    }
    const wrapper = documentRef.createElement("div");
    wrapper.className = "group-heading";
    heading.parentNode.insertBefore(wrapper, heading);
    wrapper.appendChild(heading);
    const toggle = documentRef.createElement("button");
    toggle.type = "button";
    toggle.className = "group-toggle";
    toggle.setAttribute("data-group-toggle", `group-${index}`);
    const isCollapsed = group.getAttribute("data-collapsed") === "true";
    if (isCollapsed) {
      group.classList.add("is-collapsed");
    }
    toggle.textContent = isCollapsed ? "Expand" : "Collapse";
    toggle.addEventListener("click", () => {
      const nowCollapsed = group.classList.toggle("is-collapsed");
      toggle.textContent = nowCollapsed ? "Expand" : "Collapse";
    });
    wrapper.appendChild(toggle);
  });
}

function escapeHtml(value) {
  const text = `${value ?? ""}`;
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function clampAlertSummary(summary = "", maxLen = 180) {
  const text = `${summary}`.trim().replace(/\s+/g, " ");
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
}

function normalizeAlertUrgency(urgency = "medium") {
  const normalized = `${urgency}`.toLowerCase();
  if (normalized === "blocking") {
    return "blocking";
  }
  if (normalized === "critical") {
    return "critical";
  }
  if (normalized === "high") {
    return "high";
  }
  if (normalized === "low") {
    return "low";
  }
  if (normalized === "good") {
    return "good";
  }
  return "medium";
}

function resolveAlertActionForMessage(message) {
  if (!message || typeof message !== "object") {
    return {
      view: "command",
      targetId: "commandBoardView",
      reportTab: "",
      label: "Open command board"
    };
  }
  const linkedAction = `${message.linkedAction || ""}`.trim();
  const byLinkedAction = ALERT_ACTION_BY_LINKED_ACTION[linkedAction];
  if (byLinkedAction) {
    return {
      view: normalizeInGameViewId(byLinkedAction.view),
      targetId: `${byLinkedAction.targetId || ""}`,
      reportTab: byLinkedAction.reportTab ? normalizeReportTabId(byLinkedAction.reportTab) : "",
      label: byLinkedAction.label || "Open related action"
    };
  }
  const byCategory = ALERT_ACTION_BY_CATEGORY[`${message.category || ""}`];
  if (byCategory) {
    return {
      view: normalizeInGameViewId(byCategory.view),
      targetId: `${byCategory.targetId || ""}`,
      reportTab: byCategory.reportTab ? normalizeReportTabId(byCategory.reportTab) : "",
      label: byCategory.label || "Open related action"
    };
  }
  return {
    view: "command",
    targetId: "commandBoardView",
    reportTab: "",
    label: "Open command board"
  };
}

function buildOperationalWarningAlerts() {
  const alerts = [];
  const lowStockLines = Object.entries(state.inventory || {})
    .filter(([, amount]) => Number(amount) < 9)
    .map(([item]) => item);
  if (lowStockLines.length >= 4) {
    const severe = lowStockLines.filter((item) => Number(state.inventory[item]) < 5);
    alerts.push({
      key: "warning-low-stock",
      urgency: severe.length > 0 ? "critical" : "high",
      tone: "bad",
      priority: severe.length > 0 ? 425 : 315,
      text:
        severe.length > 0
          ? `Supply risk: ${severe.length} lines are under 5 units (${severe.slice(0, 4).join(", ")}).`
          : `Supply warning: ${lowStockLines.length} lines are under 9 units.`,
      action: {
        view: "operations",
        targetId: "supplierStatusView",
        reportTab: "",
        label: "Open supplier actions"
      }
    });
  }

  const compliance = Number(state.lastReport && state.lastReport.compliance);
  const crownDue = Number(state.lastReport && state.lastReport.crownDue);
  if (Number.isFinite(compliance) && (compliance < 50 || crownDue > 0)) {
    alerts.push({
      key: "warning-crown-pressure",
      urgency: compliance < 42 || crownDue > 0 ? "critical" : "high",
      tone: "bad",
      priority: compliance < 42 || crownDue > 0 ? 420 : 320,
      text: `Crown pressure elevated: compliance ${Math.max(0, Math.round(compliance))}, due ${formatCoin(Math.max(0, Math.round(crownDue || 0)))}.`,
      action: {
        view: "world",
        targetId: "fileComplianceBtn",
        reportTab: "",
        label: "Open Crown actions"
      }
    });
  }

  const rivalPressure = Number(state.lastReport && state.lastReport.rivalPressure);
  if (Number.isFinite(rivalPressure) && rivalPressure >= 38) {
    alerts.push({
      key: "warning-rival-pressure",
      urgency: rivalPressure >= 46 ? "high" : "medium",
      tone: rivalPressure >= 46 ? "bad" : "neutral",
      priority: rivalPressure >= 46 ? 305 : 215,
      text: `Rival pressure is ${Math.round(rivalPressure)}% in your district.`,
      action: {
        view: "world",
        targetId: "worldActorsView",
        reportTab: "",
        label: "Open rival pressure"
      }
    });
  }
  return alerts;
}

function buildCommandMessageAlerts(unreadMessages = []) {
  const messages = Array.isArray(unreadMessages) ? unreadMessages : [];
  return messages.slice(0, 8).map((entry, index) => {
    const action = resolveAlertActionForMessage(entry);
    const urgency = normalizeAlertUrgency(entry.urgency);
    const tone = urgency === "critical" || urgency === "high" ? "bad" : urgency === "low" ? "good" : "neutral";
    const priorityBase = ALERT_PRIORITY_BY_URGENCY[urgency] || ALERT_PRIORITY_BY_URGENCY.medium;
    return {
      key: `command-${entry.id || `idx-${index}`}`,
      urgency,
      tone,
      priority: priorityBase + Math.max(0, 7 - index),
      text: `[${urgency.toUpperCase()}] ${entry.title || "Command update"}: ${clampAlertSummary(entry.summary || "", 160)}`,
      action: {
        ...action,
        commandCategory: `${entry.category || ""}`.trim(),
        commandUrgency: urgency
      }
    };
  });
}

function jumpToAlertTarget(documentRef, targetId = "") {
  if (!targetId) {
    return;
  }
  const target = documentRef.getElementById(targetId);
  if (!target) {
    return;
  }
  const collapsedGroup = target.closest(".group.is-collapsed");
  if (collapsedGroup) {
    const toggle = collapsedGroup.querySelector(".group-toggle");
    if (toggle && typeof toggle.click === "function") {
      toggle.click();
    }
  }
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "center" });
  }
  if (typeof target.focus === "function") {
    target.focus({ preventScroll: true });
  }
}

function renderAlertStrip(el) {
  if (!el.alertStrip) {
    return;
  }
  const manager = getManagerPhaseStatus();
  const timeflow = getTimeflowContractStatus();
  const board = manager.commandBoard || { messages: [] };
  const unreadMessages = Array.isArray(board.messages) ? board.messages.filter((entry) => !entry.read) : [];
  const queue = [];

  if (timeflow.runtime && timeflow.runtime.inProgress) {
    queue.push({
      key: "blocking-boundary-resolution",
      urgency: "blocking",
      tone: "bad",
      priority: ALERT_PRIORITY_BY_URGENCY.blocking,
      text: `System lock: boundary resolution in progress (${timeflow.runtime.activeTrigger || "boundary"}).`,
      action: {
        view: "command",
        targetId: "clockStatusView",
        reportTab: "",
        label: "Open simulation clock",
        commandCategory: "",
        commandUrgency: ""
      }
    });
  }

  if (manager.phase === "planning" && !manager.planCommitted) {
    queue.push({
      key: "planning-not-committed",
      urgency: "high",
      tone: "bad",
      priority: 320,
      text: `Week ${manager.weekIndex} planning is not committed. Commit before execution locks decisions.`,
      action: {
        view: "command",
        targetId: "commitPlanBtn",
        reportTab: "",
        label: "Open weekly planning",
        commandCategory: "operations",
        commandUrgency: "high"
      }
    });
  }

  queue.push(...buildOperationalWarningAlerts());
  queue.push(...buildCommandMessageAlerts(unreadMessages));

  const deduped = [];
  const seenKeys = new Set();
  queue.forEach((entry) => {
    const key = `${entry.key || ""}`.trim();
    if (!key || seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    deduped.push(entry);
  });

  deduped.sort((a, b) => {
    const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return `${a.key}`.localeCompare(`${b.key}`);
  });

  if (deduped.length === 0) {
    deduped.push({
      key: "all-clear",
      urgency: "good",
      tone: "good",
      priority: 0,
      text: "No urgent alerts. Proceed with planned operations.",
      action: {
        view: "command",
        targetId: "planningStatusView",
        reportTab: "",
        label: "Open command board",
        commandCategory: "",
        commandUrgency: ""
      }
    });
  }

  const visibleAlerts = deduped.slice(0, 4);
  const queueMeta = deduped.length > visibleAlerts.length
    ? `<div class="alert-queue-meta">Showing top ${visibleAlerts.length} of ${deduped.length} queued alerts.</div>`
    : `<div class="alert-queue-meta">Showing ${visibleAlerts.length} prioritized alert${visibleAlerts.length === 1 ? "" : "s"}.</div>`;

  el.alertStrip.innerHTML = `
    ${queueMeta}
    ${visibleAlerts
      .map((alert, index) => {
        const urgency = normalizeAlertUrgency(alert.urgency);
        const actionView = normalizeInGameViewId(alert.action && alert.action.view);
        const actionLabel = (alert.action && alert.action.label) || "Open action";
        const actionTarget = (alert.action && alert.action.targetId) || "";
        const actionReportTab = (alert.action && alert.action.reportTab) || "";
        const commandCategory = (alert.action && alert.action.commandCategory) || "";
        const commandUrgency = (alert.action && alert.action.commandUrgency) || "";
        return `
          <div class="alert-line ${alert.tone} alert-${urgency}">
            <span class="alert-tag">${escapeHtml(urgency.toUpperCase())}</span>
            <span class="alert-text">${escapeHtml(alert.text)}</span>
            <span class="alert-actions">
              <button
                data-ui-alert-view="${escapeHtml(actionView)}"
                data-ui-alert-target="${escapeHtml(actionTarget)}"
                data-ui-alert-report-tab="${escapeHtml(actionReportTab)}"
                data-ui-alert-command-category="${escapeHtml(commandCategory)}"
                data-ui-alert-command-urgency="${escapeHtml(commandUrgency)}"
                data-ui-action-hook="alert_jump"
                data-alert-index="${index}"
              >${escapeHtml(actionLabel)}</button>
            </span>
          </div>
        `;
      })
      .join("")}
  `;
}

function getReportFilterText(el, menuState = null) {
  if (menuState && typeof menuState.reportFilter === "string") {
    return menuState.reportFilter.trim().toLowerCase();
  }
  if (el && el.reportFilterInput) {
    return el.reportFilterInput.value.trim().toLowerCase();
  }
  return "";
}

function splitFilterTerms(filterText = "") {
  return `${filterText}`
    .toLowerCase()
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function matchesReportFilter(text = "", filterText = "") {
  const terms = splitFilterTerms(filterText);
  if (terms.length === 0) {
    return true;
  }
  const candidate = `${text}`.toLowerCase();
  return terms.every((term) => candidate.includes(term));
}

function formatSignedNumber(value, suffix = "", decimals = 0) {
  const parsed = Number(value) || 0;
  const rounded = decimals > 0 ? parsed.toFixed(decimals) : `${Math.round(parsed)}`;
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${rounded}${suffix}`;
}

function formatSignedCoin(value) {
  const parsed = Math.round(Number(value) || 0);
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${formatCoin(parsed)}`;
}

function buildReportSectionMarkup(sections, filterText = "", emptyMessage = "No entries.") {
  const rendered = [];
  sections.forEach((section) => {
    const title = `${section.title || "Section"}`;
    const lines = Array.isArray(section.lines) ? section.lines : [];
    const matched = lines.filter((line) => {
      const text = `${line.text || ""}`;
      if (matchesReportFilter(text, filterText)) {
        return true;
      }
      return matchesReportFilter(title, filterText);
    });
    if (matched.length === 0) {
      return;
    }
    const sectionHtml = matched
      .map((line) => {
        const tone = `${line.tone || "neutral"}`;
        const label = line.label ? `<span class="report-line-label">${escapeHtml(line.label)}:</span> ` : "";
        return `<div class="report-line ${tone}">${label}${escapeHtml(line.text || "")}</div>`;
      })
      .join("");
    rendered.push(`
      <section class="report-section-block">
        <h4 class="report-section-title">${escapeHtml(title)}</h4>
        ${sectionHtml}
      </section>
    `);
  });
  if (rendered.length === 0) {
    return `<div class="report-line neutral">${escapeHtml(emptyMessage)}</div>`;
  }
  return rendered.join("");
}

function renderReportTabs(el, menuState = null) {
  if (!el.reportWeeklyView) {
    return;
  }
  const manager = getManagerPhaseStatus();
  const tooling = getManagerToolingStatus();
  const analytics = tooling.analytics || {};
  const filterText = getReportFilterText(el, menuState);
  const activeObjectives = manager.objectives ? manager.objectives.active.length : 0;
  const completedObjectives = manager.objectives ? manager.objectives.completed.length : 0;
  const failedObjectives = manager.objectives ? manager.objectives.failed.length : 0;
  const recruitCount = manager.recruitment ? manager.recruitment.market.length : 0;
  const shortlistCount = manager.recruitment ? manager.recruitment.shortlist.length : 0;
  const marginDelta = Number(analytics.deltas && analytics.deltas.marginPct) || 0;
  const convDelta = Number(analytics.deltas && analytics.deltas.conversionPct) || 0;
  const retentionDelta = Number(analytics.deltas && analytics.deltas.retentionPct) || 0;
  const spendDelta = Number(analytics.deltas && analytics.deltas.avgSpend) || 0;

  const weeklySections = [
    {
      title: "Week Situation",
      lines: [
        {
          tone: manager.phase === "execution" && manager.planCommitted ? "good" : "neutral",
          label: "Loop",
          text: `Week ${manager.weekIndex}, day ${manager.dayInWeek}/7, phase ${manager.phase}, committed ${manager.planCommitted ? "yes" : "no"}.`
        },
        {
          tone: "neutral",
          label: "Season",
          text: state.lastReport.seasonSummary || "No season summary."
        },
        {
          tone: "neutral",
          label: "World",
          text: state.lastReport.weeklyWorldSummary || "No weekly world summary."
        }
      ]
    },
    {
      title: "Performance Deltas",
      lines: [
        {
          tone: state.lastNet >= 0 ? "good" : "bad",
          label: "Net",
          text: `${formatCoin(state.lastNet)} (revenue ${formatCoin(state.lastRevenue)}, expenses ${formatCoin(state.lastExpenses)}).`
        },
        {
          tone: marginDelta >= 0 ? "good" : "bad",
          label: "Margin",
          text: `${Number(analytics.dailySummary && analytics.dailySummary.marginPct) || 0}% (${formatSignedNumber(marginDelta, "pp")}).`
        },
        {
          tone: convDelta >= 0 ? "good" : "bad",
          label: "Conversion",
          text: `${Number(analytics.dailySummary && analytics.dailySummary.conversionPct) || 0}% (${formatSignedNumber(convDelta, "pp")}).`
        },
        {
          tone: retentionDelta >= 0 ? "good" : "bad",
          label: "Retention",
          text: `${Number(analytics.dailySummary && analytics.dailySummary.retentionPct) || 0}% (${formatSignedNumber(retentionDelta, "pp")}), avg spend delta ${formatSignedCoin(spendDelta)}.`
        }
      ]
    },
    {
      title: "Objectives And Pipeline",
      lines: [
        {
          tone: failedObjectives > completedObjectives ? "bad" : completedObjectives > 0 ? "good" : "neutral",
          label: "Objectives",
          text: `${activeObjectives} active, ${completedObjectives} completed, ${failedObjectives} failed.`
        },
        {
          tone: recruitCount >= 3 ? "good" : recruitCount === 0 ? "bad" : "neutral",
          label: "Recruitment",
          text: `${recruitCount} candidates, ${shortlistCount} shortlisted.`
        },
        {
          tone: "neutral",
          label: "Tooling",
          text: state.lastReport.managerToolingSummary || "No tooling summary."
        }
      ]
    }
  ];
  el.reportWeeklyView.innerHTML = buildReportSectionMarkup(
    weeklySections,
    filterText,
    "No weekly entries match the current search."
  );
}

function render(el) {
  syncCampaignControls(el);
  syncTimeflowInteractionLocks(el);
  populateTravelOptions(el.travelDestinationSelect);
  renderSimulationClock(el);
  renderDistrictTravel(el);
  renderCrownStatus(el);
  renderSupplierStatus(el);
  renderPlanningStatus(el);
  renderCommandBoard(el);
  renderDelegationDesk(el);
  syncPlanningControls(el);
  renderWorldActors(el);
  renderAnalyticsDashboard(el);
  renderScoutingDesk(el);
  renderAlertStrip(el);
  renderTopStats(el);
  renderInventory(el);
  renderPrices(el);
  renderStaff(el);
  renderReport(el);
  renderLog(el);
  renderReportTabs(el);
}

function syncTimeflowInteractionLocks(el) {
  const timeflow = getTimeflowContractStatus();
  const disabled = Boolean(timeflow.runtime && timeflow.runtime.inProgress);
  const dynamicActionButtons = Array.from(document.querySelectorAll(
    "#priceView button, #staffView button, #commandBoardView button, #scoutingView button, #alertStrip button, #inGameNav button, .report-tabs button"
  ));
  const dynamicInputs = Array.from(document.querySelectorAll(
    "#delegationView input"
  ));
  [
    document.getElementById("startCampaignBtn"),
    document.getElementById("fileComplianceBtn"),
    document.getElementById("settleArrearsBtn"),
    document.getElementById("brewAleBtn"),
    document.getElementById("brewMeadBtn"),
    document.getElementById("cookStewBtn"),
    document.getElementById("cleanBtn"),
    document.getElementById("repairBtn"),
    document.getElementById("buyGrainBtn"),
    document.getElementById("buyHopsBtn"),
    document.getElementById("buyHoneyBtn"),
    document.getElementById("buyMeatBtn"),
    document.getElementById("buyVegBtn"),
    document.getElementById("buyBreadBtn"),
    document.getElementById("buyWoodBtn"),
    document.getElementById("hireServerBtn"),
    document.getElementById("hireCookBtn"),
    document.getElementById("hireBarkeepBtn"),
    document.getElementById("hireGuardBtn"),
    document.getElementById("rotaBalancedBtn"),
    document.getElementById("rotaDayBtn"),
    document.getElementById("rotaNightBtn"),
    document.getElementById("trainBtn"),
    el.nextDayBtn,
    el.travelBtn,
    el.marketingBtn,
    el.festivalBtn,
    el.signLocalContractBtn,
    el.signWholesaleContractBtn,
    el.stockRunBtn,
    el.updatePlanDraftBtn,
    el.commitPlanBtn,
    ...dynamicActionButtons,
    ...dynamicInputs
  ].forEach((control) => {
    if (control) {
      control.disabled = disabled;
    }
  });
}

function renderSimulationClock(el) {
  if (!el.clockStatusView) {
    return;
  }
  const clock = getSimulationClockStatus();
  const timeflow = getTimeflowContractStatus();
  const tone = clock.isPaused ? "neutral" : "good";
  const runtime = timeflow.runtime || {};
  el.clockStatusView.innerHTML = [
    `<div class="report-line ${tone}">Time: ${clock.label}</div>`,
    `<div class="report-line neutral">Speed: ${clock.speedLabel}</div>`,
    `<div class="report-line neutral">Scale: 1 real second = ${clock.speed === 0 ? 0 : clock.speed} in-game minute${clock.speed === 1 ? "" : "s"}.</div>`,
    `<div class="report-line neutral">Boundary: ${runtime.lastResolutionNote || "No boundary trace yet."}</div>`,
    `<div class="report-line neutral">Queue: ${runtime.lastQueueSummary || "No queued intents."}</div>`
  ].join("");
  const buttons = [
    [el.pauseSimBtn, 0],
    [el.playSimBtn, 1],
    [el.fast2SimBtn, 2],
    [el.fast4SimBtn, 4]
  ];
  buttons.forEach(([button, speed]) => {
    if (!button) {
      return;
    }
    const isActive = clock.speed === speed;
    button.classList.toggle("active-speed", isActive);
  });
}

function renderTopStats(el) {
  const staffStats = getStaffStats();
  const weekday = DAY_NAMES[(state.day - 1) % 7];
  const locationLabel = state.world && state.world.locationLabel ? state.world.locationLabel : "Arcanum";
  const districtLabel = state.world && state.world.currentDistrictLabel ? state.world.currentDistrictLabel : "-";
  const manager = getManagerPhaseStatus();
  const clock = getSimulationClockStatus();
  const commandBoard = manager.commandBoard || { messages: [] };
  const unreadCount = Array.isArray(commandBoard.messages)
    ? commandBoard.messages.filter((entry) => !entry.read).length
    : 0;
  const criticalCount = Array.isArray(commandBoard.messages)
    ? commandBoard.messages.filter((entry) => !entry.read && entry.urgency === "critical").length
    : 0;

  const tiles = [
    { text: `Day ${state.day} (${weekday})`, tone: "" },
    { text: `${clock.label} (${clock.speedLabel})`, tone: "" },
    { text: `Week ${manager.weekIndex} ${manager.phase}`, tone: "" },
    { text: `${locationLabel} / ${districtLabel}`, tone: "" },
    { text: `Gold ${formatCoin(state.gold)} | Net ${formatCoin(state.lastNet)}`, tone: state.lastNet < 0 ? "critical" : "" },
    { text: `Rep ${state.reputation} | Compliance ${state.lastReport.compliance || 0}`, tone: Number(state.lastReport.compliance || 0) < 50 ? "critical" : "" },
    { text: `Guests ${state.lastGuests} | Staff ${staffStats.activeCount}/${state.staff.length}`, tone: "" },
    { text: `Alerts ${unreadCount} unread / ${criticalCount} critical`, tone: criticalCount > 0 ? "critical" : "" }
  ];

  el.topStats.innerHTML = tiles
    .map((entry) => `<div class="chip ${entry.tone}">${entry.text}</div>`)
    .join("");
}

function renderInventory(el) {
  const list = [
    ["ale", "Ale"],
    ["mead", "Mead"],
    ["stew", "Stew"],
    ["bread", "Bread"],
    ["grain", "Grain"],
    ["hops", "Hops"],
    ["honey", "Honey"],
    ["meat", "Meat"],
    ["veg", "Veg"],
    ["wood", "Wood"]
  ];

  el.inventoryView.innerHTML = list
    .map(([id, label]) => {
      const amount = state.inventory[id];
      if (!state.supplyStats[id]) {
        return `<div class="kv-row"><span>${label}</span><span>${amount}</span></div>`;
      }
      const quality = state.supplyStats[id].quality;
      const freshness = state.supplyStats[id].freshness;
      return `
        <div class="kv-row">
          <span>${label}</span>
          <span>${amount} (Q${quality}/${qualityTier(quality)} F${freshness})</span>
        </div>
      `;
    })
    .join("");
}

function renderPrices(el) {
  const rows = [
    ["ale", "Ale"],
    ["mead", "Mead"],
    ["stew", "Stew"],
    ["bread", "Bread"],
    ["room", "Room"]
  ];

  el.priceView.innerHTML = rows
    .map(([id, label]) => {
      const price = state.prices[id];
      return `
        <div class="price-row">
          <span>${label}: ${formatCoin(price)}</span>
          <span class="price-controls">
            <button data-product="${id}" data-delta="-1" title="Lower ${label} price by 1 coin.">-</button>
            <button data-product="${id}" data-delta="1" title="Raise ${label} price by 1 coin.">+</button>
          </span>
        </div>
      `;
    })
    .join("");
}

function renderStaff(el) {
  const manager = getManagerPhaseStatus();
  const candidates = manager.recruitment && Array.isArray(manager.recruitment.market)
    ? manager.recruitment.market
    : [];
  const shortlist = manager.recruitment && Array.isArray(manager.recruitment.shortlist)
    ? manager.recruitment.shortlist
    : [];

  const rosterHtml = state.staff
    .map((person) => {
      const status = person.injuryDays > 0
        ? `Injured ${person.injuryDays}d`
        : person.disputeDays > 0
          ? `Dispute ${person.disputeDays}d`
          : `Shift ${person.assignedShift}`;
      return `
        <div class="staff-row">
          <span>${person.role} (S:${person.service} Q:${person.quality} M:${person.morale} F:${person.fatigue}) ${status}</span>
          <span>
            ${formatCoin(person.wage)}
            <button data-fire-id="${person.id}" title="Dismiss this staff member and remove their wage cost.">Fire</button>
          </span>
        </div>
      `;
    })
    .join("");
  const recruitmentHeader = `
    <div class="report-line neutral">Recruitment board: ${candidates.length} active, shortlist ${shortlist.length}.</div>
    <div class="report-line neutral">${manager.recruitment ? manager.recruitment.lastSummary : "Recruitment status unavailable."}</div>
  `;
  const recruitmentRows = candidates
    .slice(0, 6)
    .map((candidate) => {
      const shortlistLabel = shortlist.includes(candidate.id) ? "Shortlisted" : "Shortlist";
      const revealed =
        Array.isArray(candidate.revealedTraits) && candidate.revealedTraits.length > 0
          ? candidate.revealedTraits.join(", ")
          : "no hidden traits revealed";
      return `
        <div class="staff-row">
          <span>
            ${candidate.name} (${candidate.role}) S:${candidate.visibleService} Q:${candidate.visibleQuality}
            Pot:${candidate.potentialMin}-${candidate.potentialMax} Wage:${formatCoin(candidate.expectedWage)}
            ${candidate.daysRemaining}d left | ${revealed}
          </span>
          <span>
            <button data-shortlist-id="${candidate.id}" title="Track this candidate for later decisions.">${shortlistLabel}</button>
            <button data-scout-id="${candidate.id}" title="Reveal hidden traits and improve confidence in this candidate.">Scout</button>
            <button data-sign-id="${candidate.id}" title="Hire immediately at expected wage if conditions allow.">Sign</button>
          </span>
        </div>
      `;
    })
    .join("");
  el.staffView.innerHTML = `${rosterHtml}${recruitmentHeader}${recruitmentRows}`;
}

function renderReport(el) {
  const manager = getManagerPhaseStatus();
  const tooling = getManagerToolingStatus();
  const analytics = tooling.analytics || {};
  const dailyAnalytics = analytics.dailySummary || {};
  const deltas = analytics.deltas || {};
  const topCohort = COHORT_PROFILES[state.lastReport.topCohort] || COHORT_PROFILES.locals;
  const lowCohort = COHORT_PROFILES[state.lastReport.lowCohort] || COHORT_PROFILES.locals;
  const actorTone =
    state.world && state.world.lastActorEvent && state.world.lastActorEvent.tone
      ? state.world.lastActorEvent.tone
      : "neutral";
  const lowStock = Object.entries(state.inventory)
    .filter(([, amount]) => amount < 10)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([item, amount]) => `${item}(${amount})`);

  const netPrefix = state.lastNet >= 0 ? "+" : "";
  const activeObjectives = manager.objectives ? manager.objectives.active.length : 0;
  const completedObjectives = manager.objectives ? manager.objectives.completed.length : 0;
  const failedObjectives = manager.objectives ? manager.objectives.failed.length : 0;
  const recruitCount = manager.recruitment ? manager.recruitment.market.length : 0;
  const shortlistCount = manager.recruitment ? manager.recruitment.shortlist.length : 0;
  const dailyCards = [
    {
      tone: state.lastNet >= 0 ? "good" : "bad",
      title: "Net Today",
      value: `${netPrefix}${formatCoin(state.lastNet)}`,
      delta: `Revenue ${formatCoin(state.lastRevenue)} | Expenses ${formatCoin(state.lastExpenses)}`
    },
    {
      tone: Number(deltas.conversionPct || 0) >= 0 ? "good" : "bad",
      title: "Guest Flow",
      value: `${state.lastGuests} guests`,
      delta: `Conversion ${Number(dailyAnalytics.conversionPct || 0)}% (${formatSignedNumber(deltas.conversionPct || 0, "pp")})`
    },
    {
      tone: Number(deltas.retentionPct || 0) >= 0 ? "good" : "bad",
      title: "Retention",
      value: `${Number(dailyAnalytics.retentionPct || state.lastReport.satisfaction || 0)}%`,
      delta: `Avg spend ${formatCoin(dailyAnalytics.avgSpend || 0)} (${formatSignedCoin(deltas.avgSpend || 0)})`
    },
    {
      tone:
        Number(state.lastReport.compliance || 0) < 50 || Number(state.lastReport.crownDue || 0) > 0
          ? "bad"
          : "neutral",
      title: "Governance",
      value: `Compliance ${state.lastReport.compliance || 0}`,
      delta: `Crown due ${formatCoin(state.lastReport.crownDue || 0)} | Rival ${state.lastReport.rivalPressure || 0}%`
    }
  ];
  if (el.reportDailySummaryView) {
    el.reportDailySummaryView.innerHTML = dailyCards
      .map((card) => {
        return `
          <article class="report-kpi-card ${card.tone}">
            <h4>${escapeHtml(card.title)}</h4>
            <div class="report-kpi-value">${escapeHtml(card.value)}</div>
            <div class="report-kpi-delta">${escapeHtml(card.delta)}</div>
          </article>
        `;
      })
      .join("");
  }

  const dailySections = [
    {
      title: "Finance And Operations",
      lines: [
        {
          tone: state.lastNet >= 0 ? "good" : "bad",
          label: "Finance",
          text: `Revenue ${formatCoin(state.lastRevenue)}, expenses ${formatCoin(state.lastExpenses)}, crown accrued ${formatCoin(state.lastReport.crownTax || 0)}, crown paid ${formatCoin(state.lastReport.crownPayment || 0)}, net ${netPrefix}${formatCoin(state.lastNet)}.`
        },
        {
          tone: lowStock.length === 0 ? "good" : "bad",
          label: "Stock",
          text: lowStock.length === 0 ? "No critical low-stock items." : `Low stock watch: ${lowStock.join(", ")}.`
        },
        {
          tone: state.lastReport.supplies.includes("No ingredient spoilage") ? "good" : "bad",
          label: "Supplies",
          text: `${state.lastReport.supplies} Kitchen blend score ${state.lastReport.kitchen}.`
        },
        {
          tone:
            state.lastReport.supplierSummary && state.lastReport.supplierSummary.includes("thin")
              ? "bad"
              : "neutral",
          label: "Supplier Network",
          text: state.lastReport.supplierSummary || "No supplier update logged."
        }
      ]
    },
    {
      title: "World Pressure",
      lines: [
        {
          tone:
            (state.lastReport.rivalPressure || 0) >= 40
              ? "bad"
              : state.lastReport.rivalSummary && state.lastReport.rivalSummary.includes("setback")
                ? "good"
                : "neutral",
          label: "Rivalry",
          text: `${state.lastReport.rivalSummary || "Rival taverns held steady."} Pressure ${state.lastReport.rivalPressure || 0}%.`
        },
        {
          tone:
            state.lastReport.events && state.lastReport.events.includes("No major district or calendar event")
              ? "neutral"
              : "good",
          label: "Calendar",
          text: state.lastReport.events || "No major district or calendar event today."
        },
        {
          tone: (state.lastReport.crownComplianceStanding || state.lastReport.compliance || 0) >= 55 ? "neutral" : "bad",
          label: "Crown Office",
          text:
            `${state.lastReport.crownSummary || "No collection update."} ` +
            `Compliance ${state.lastReport.compliance || 0}, standing ${state.lastReport.crownComplianceStanding || state.lastReport.compliance || 0}.`
        },
        {
          tone: actorTone,
          label: "Influence",
          text: `${state.lastReport.actorEvent || "No faction movement today."} ${state.lastReport.actorSummary || ""}`.trim()
        }
      ]
    },
    {
      title: "Guests And Staff",
      lines: [
        {
          tone:
            state.lastReport.topCohortLoyalty - state.lastReport.lowCohortLoyalty >= 8
              ? "good"
              : "neutral",
          label: "Sentiment",
          text: `${topCohort.label} loyalty ${state.lastReport.topCohortLoyalty}, ${lowCohort.label} loyalty ${state.lastReport.lowCohortLoyalty}, satisfaction ${state.lastReport.satisfaction}.`
        },
        {
          tone: state.lastReport.staffing.includes("No staff available") ? "bad" : "neutral",
          label: "Staffing",
          text: state.lastReport.staffing
        },
        {
          tone: "neutral",
          label: "Patron Watch",
          text: `${state.lastReport.highlight} Loyalty demand factor ${state.lastReport.loyaltyDemandMult.toFixed(2)}x.`
        }
      ]
    },
    {
      title: "Manager Loop",
      lines: [
        {
          tone: manager.phase === "execution" && manager.planCommitted ? "good" : "neutral",
          label: "Planning",
          text: `Phase ${manager.phase}, week ${manager.weekIndex}, day ${manager.dayInWeek}/7, plan committed ${manager.planCommitted ? "yes" : "no"}.`
        },
        {
          tone: recruitCount >= 3 ? "good" : recruitCount === 0 ? "bad" : "neutral",
          label: "Recruitment",
          text: `${recruitCount} candidates, ${shortlistCount} shortlisted.`
        },
        {
          tone: failedObjectives > completedObjectives ? "bad" : completedObjectives > 0 ? "good" : "neutral",
          label: "Objectives",
          text: `${activeObjectives} active, ${completedObjectives} completed, ${failedObjectives} failed. ${state.lastReport.objectiveSummary || (manager.objectives ? manager.objectives.lastSummary : "No objective summary.")}`
        },
        {
          tone: "neutral",
          label: "Timeflow",
          text: `${state.lastReport.timeflowSummary || "No timeflow summary yet."} ${state.lastReport.timeflowQueueSummary || ""}`.trim()
        }
      ]
    }
  ];

  const filterText = getReportFilterText(el);
  el.reportView.innerHTML = buildReportSectionMarkup(
    dailySections,
    filterText,
    "No daily report lines match the current search."
  );
}

function getLogToneFilter(el) {
  if (!el || !el.logToneSelect) {
    return "all";
  }
  return normalizeLogToneId(el.logToneSelect.value);
}

function collapseConsecutiveLogEntries(entries = []) {
  const collapsed = [];
  entries.forEach((entry) => {
    const message = `${entry.message || ""}`;
    const tone = `${entry.tone || "neutral"}`;
    const day = Math.max(1, Math.round(Number(entry.day) || state.day));
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.message === message && previous.tone === tone) {
      previous.count += 1;
      previous.oldestDay = day;
      return;
    }
    collapsed.push({
      message,
      tone,
      newestDay: day,
      oldestDay: day,
      count: 1
    });
  });
  return collapsed;
}

function renderLog(el) {
  const filterText = getReportFilterText(el);
  const toneFilter = getLogToneFilter(el);
  const rawRows = (state.log || []).filter((entry) => {
    const tone = `${entry.tone || "neutral"}`;
    if (toneFilter !== "all" && tone !== toneFilter) {
      return false;
    }
    return matchesReportFilter(`${entry.message || ""}`, filterText);
  });
  const rows = collapseConsecutiveLogEntries(rawRows).slice(0, 140);
  const toneCounts = {
    bad: rawRows.filter((entry) => entry.tone === "bad").length,
    neutral: rawRows.filter((entry) => entry.tone === "neutral").length,
    good: rawRows.filter((entry) => entry.tone === "good").length
  };
  const repeatLeaders = rows
    .filter((entry) => entry.count > 1)
    .slice(0, 3)
    .map((entry) => `${entry.count}x ${entry.message}`);

  if (el.reportLogSummaryView) {
    el.reportLogSummaryView.innerHTML = [
      `<div class="report-line neutral">Log results: ${rawRows.length} entries (${rows.length} condensed rows shown).</div>`,
      `<div class="report-line bad">Bad ${toneCounts.bad}</div>`,
      `<div class="report-line neutral">Neutral ${toneCounts.neutral}</div>`,
      `<div class="report-line good">Good ${toneCounts.good}</div>`,
      `<div class="report-line neutral">Repeated signals: ${repeatLeaders.length > 0 ? repeatLeaders.join(" | ") : "none"}</div>`
    ].join("");
  }

  if (!el.logView) {
    return;
  }
  if (rows.length === 0) {
    el.logView.innerHTML = `<div class="log-line neutral">No log entries match the current filters.</div>`;
    return;
  }
  el.logView.innerHTML = rows
    .map((entry) => {
      const dayLabel =
        entry.count > 1 && entry.oldestDay !== entry.newestDay
          ? `D${entry.oldestDay}-D${entry.newestDay}`
          : `D${entry.newestDay}`;
      const repeatBadge = entry.count > 1 ? ` <span class="log-repeat-count">x${entry.count}</span>` : "";
      return `<div class="log-line ${entry.tone}">${dayLabel}: ${escapeHtml(entry.message)}${repeatBadge}</div>`;
    })
    .join("");
}

function renderDistrictTravel(el) {
  const world = state.world || {};
  const rivals = Array.isArray(world.rivalTaverns) ? world.rivalTaverns : [];
  const rivalList = rivals.length > 0
    ? rivals.map((rival) => rival.name).join(", ")
    : "No major rivals logged.";
  const travelText = world.travelDaysRemaining > 0
    ? `In transit to ${world.travelDestinationLabel} (${world.travelDaysRemaining}d remaining).`
    : "No travel in progress.";
  const rivalState =
    world.rivals && world.rivals.districts && world.rivals.districts[world.currentDistrict]
      ? world.rivals.districts[world.currentDistrict]
      : null;
  const rivalClimate = rivalState
    ? `Rival climate: demand ${Math.round((rivalState.demandPressure || 0) * 100)}%, price ${Math.round((rivalState.pricePressure || 0) * 100)}%, reputation ${Math.round((rivalState.reputationPressure || 0) * 100)}%.`
    : "Rival climate: no district rivalry data.";

  el.districtStatusView.innerHTML = [
    `<div class="report-line neutral">District: ${world.currentDistrictLabel || "-"}</div>`,
    `<div class="report-line neutral">${world.currentDistrictSummary || ""}</div>`,
    `<div class="report-line neutral">Rival taverns: ${rivalList}</div>`,
    `<div class="report-line neutral">${rivalClimate}</div>`,
    `<div class="report-line ${world.travelDaysRemaining > 0 ? "bad" : "good"}">${travelText}</div>`
  ].join("");
}

function renderWorldActors(el) {
  if (!el.worldActorsView) {
    return;
  }
  const actors = state.world && state.world.actors ? Object.values(state.world.actors) : [];
  const sorted = actors.slice().sort((a, b) => b.influence - a.influence);
  el.worldActorsView.innerHTML = sorted
    .map((actor) => {
      const shift = actor.lastShift > 0 ? `+${actor.lastShift}` : `${actor.lastShift}`;
      return `
        <div class="kv-row">
          <span>${actor.label}</span>
          <span>Standing ${actor.standing} | Influence ${actor.influence} | Shift ${shift}</span>
        </div>
      `;
    })
    .join("");
}

function renderCrownStatus(el) {
  if (!el.crownStatusView) {
    return;
  }
  const crown = getCrownAuthorityStatus();
  const latest = crown.history[0];
  const latestLine = latest
    ? `Latest: D${latest.day} ${latest.type} ${latest.status} (${formatCoin(latest.amount)})`
    : "Latest: no Crown entries logged yet.";
  el.crownStatusView.innerHTML = [
    `<div class="report-line neutral">Compliance: ${crown.complianceScore}</div>`,
    `<div class="report-line ${crown.arrears > 0 ? "bad" : "good"}">Arrears: ${formatCoin(crown.arrears)} | Pending: ${formatCoin(crown.pendingTax)}</div>`,
    `<div class="report-line neutral">Next collection: Day ${crown.nextCollectionDay} (cadence ${crown.cadenceDays}d)</div>`,
    `<div class="report-line neutral">${latestLine}</div>`
  ].join("");
}

function renderSupplierStatus(el) {
  if (!el.supplierStatusView) {
    return;
  }
  const suppliers = getSupplierNetworkStatus();
  const merchantLine =
    suppliers.merchant.visitWindowDays > 0
      ? `Merchant visit active (${suppliers.merchant.visitWindowDays}d) in ${suppliers.merchant.targetDistrict}.`
      : `Merchant visit in ${suppliers.merchant.daysUntilVisit}d.`;
  const caravanLine =
    suppliers.caravan.windowDays > 0
      ? `Caravan window active (${suppliers.caravan.windowDays}d) in ${suppliers.caravan.targetDistrict}.`
      : `Next caravan window in ${suppliers.caravan.daysUntilWindow}d.`;
  const stockRunLine =
    suppliers.stockRun.daysRemaining > 0
      ? `City stock run in transit (${suppliers.stockRun.daysRemaining}d remaining).`
      : "No city stock-up run in progress.";
  const lowLots = Object.entries(suppliers.market.available)
    .filter(([, amount]) => amount <= 8)
    .map(([item, amount]) => `${item}:${amount}`);

  el.supplierStatusView.innerHTML = [
    `<div class="report-line neutral">Volatility: ${suppliers.volatility}</div>`,
    `<div class="report-line neutral">Contracts: local ${suppliers.contracts.localBrokerDays}d | wholesale ${suppliers.contracts.arcanumWholesaleDays}d</div>`,
    `<div class="report-line ${suppliers.merchant.visitWindowDays > 0 ? "good" : "neutral"}">${merchantLine}</div>`,
    `<div class="report-line ${suppliers.caravan.windowDays > 0 ? "good" : "neutral"}">${caravanLine}</div>`,
    `<div class="report-line ${suppliers.stockRun.daysRemaining > 0 ? "bad" : "neutral"}">${stockRunLine}</div>`,
    `<div class="report-line ${lowLots.length > 0 ? "bad" : "good"}">Local lots: ${lowLots.length > 0 ? lowLots.join(", ") : "well stocked"}</div>`
  ].join("");
}

function populateLocationOptions(selectEl) {
  if (!selectEl) {
    return;
  }
  const options = listStartingLocations();
  selectEl.innerHTML = options
    .map((location) => `<option value="${location.id}">${location.label} (${location.title})</option>`)
    .join("");
}

function populateTravelOptions(selectEl) {
  if (!selectEl) {
    return;
  }
  const options = listTravelOptions();
  selectEl.innerHTML = options
    .map((option) => {
      return `<option value="${option.destinationId}">${option.destinationLabel} - ${option.days}d / ${formatCoin(option.cost)}</option>`;
    })
    .join("");

  if (options.length === 0) {
    selectEl.innerHTML = `<option value="">No routes available</option>`;
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
}

function syncCampaignControls(el) {
  if (!el.startLocationSelect || !state.world) {
    return;
  }
  const nextLocation = state.world.activeLocation || state.world.startingLocation;
  if (nextLocation && el.startLocationSelect.value !== nextLocation) {
    el.startLocationSelect.value = nextLocation;
  }
}

function readWeeklyDraftInput(el) {
  return {
    staffingIntent: el.planStaffingSelect ? el.planStaffingSelect.value : "balanced",
    pricingIntent: el.planPricingSelect ? el.planPricingSelect.value : "balanced",
    procurementIntent: el.planProcurementSelect ? el.planProcurementSelect.value : "stability",
    marketingIntent: el.planMarketingSelect ? el.planMarketingSelect.value : "steady",
    logisticsIntent: el.planLogisticsSelect ? el.planLogisticsSelect.value : "local",
    riskTolerance: el.planRiskSelect ? el.planRiskSelect.value : "moderate",
    reserveGoldTarget: el.planReserveInput ? Number(el.planReserveInput.value) : 0,
    note: el.planNoteInput ? el.planNoteInput.value.trim() : ""
  };
}

function syncPlanningControls(el) {
  const manager = getManagerPhaseStatus();
  const draft = manager.planDraft || {};
  const disabled = false;

  if (el.planStaffingSelect && el.planStaffingSelect.value !== draft.staffingIntent) {
    el.planStaffingSelect.value = draft.staffingIntent || "balanced";
  }
  if (el.planPricingSelect && el.planPricingSelect.value !== draft.pricingIntent) {
    el.planPricingSelect.value = draft.pricingIntent || "balanced";
  }
  if (el.planProcurementSelect && el.planProcurementSelect.value !== draft.procurementIntent) {
    el.planProcurementSelect.value = draft.procurementIntent || "stability";
  }
  if (el.planMarketingSelect && el.planMarketingSelect.value !== draft.marketingIntent) {
    el.planMarketingSelect.value = draft.marketingIntent || "steady";
  }
  if (el.planLogisticsSelect && el.planLogisticsSelect.value !== draft.logisticsIntent) {
    el.planLogisticsSelect.value = draft.logisticsIntent || "local";
  }
  if (el.planRiskSelect && el.planRiskSelect.value !== draft.riskTolerance) {
    el.planRiskSelect.value = draft.riskTolerance || "moderate";
  }
  if (el.planReserveInput && Number(el.planReserveInput.value) !== Number(draft.reserveGoldTarget || 0)) {
    el.planReserveInput.value = `${Math.max(0, Math.round(Number(draft.reserveGoldTarget) || 0))}`;
  }
  if (el.planNoteInput && el.planNoteInput.value !== (draft.note || "")) {
    el.planNoteInput.value = draft.note || "";
  }

  [
    el.planStaffingSelect,
    el.planPricingSelect,
    el.planProcurementSelect,
    el.planMarketingSelect,
    el.planLogisticsSelect,
    el.planRiskSelect,
    el.planReserveInput,
    el.planNoteInput
  ].forEach((control) => {
    if (control) {
      control.disabled = disabled;
    }
  });
}

function renderPlanningStatus(el) {
  if (!el.planningStatusView) {
    return;
  }
  const manager = getManagerPhaseStatus();
  const phaseTone =
    manager.phase === "planning" ? "good" : manager.phase === "execution" ? "neutral" : "bad";
  const committed = manager.committedPlanSummary || "No plan committed.";
  const draft = manager.planDraftSummary || "No draft available.";
  const context = manager.planningContext || null;
  const contextLine = context
    ? `${context.summary}`
    : "World planning context unavailable.";
  const recommendationLine = context && context.recommendations
    ? `Recommended: risk ${context.recommendations.riskTolerance}, pricing ${context.recommendations.pricingIntent}, procurement ${context.recommendations.procurementIntent}, marketing ${context.recommendations.marketingIntent}, logistics ${context.recommendations.logisticsIntent}.`
    : "No world-layer recommendations.";
  const supplyPlanner = manager.supplyPlanner || null;
  const supplyLine = supplyPlanner
    ? `Supply planner: cap ${formatCoin(supplyPlanner.weeklyBudgetCap || 0)}, spent ${formatCoin(supplyPlanner.spent || 0)}. ${supplyPlanner.lastAction || ""}`
    : "Supply planner data unavailable.";
  const timing = manager.planningTiming || {};
  const timingLine =
    `Timing windows: staffing/pricing/procurement/menu=${timing.staffingIntent || "next_day"}; ` +
    `marketing/logistics/risk/reserve/supply=${timing.marketingIntent || "next_week"}; note=${timing.note || "instant"}.`;
  const pendingIntents = Array.isArray(manager.pendingIntents) ? manager.pendingIntents : [];
  const pendingLine =
    pendingIntents.length > 0
      ? `Pending intents (${pendingIntents.length}): ${pendingIntents
          .slice(0, 3)
          .map((entry) => `${entry.field}->${entry.effectiveBoundary}`)
          .join(", ")}${pendingIntents.length > 3 ? "..." : ""}`
      : "Pending intents: none.";
  const timeline = manager.timeline || null;
  const timelineLine = timeline
    ? `Timeline: Year ${timeline.year}, ${timeline.seasonLabel} week ${timeline.weekOfSeason}, day ${timeline.dayOfSeason}/${28}.`
    : "Timeline data unavailable.";
  el.planningStatusView.innerHTML = [
    `<div class="report-line ${phaseTone}">Phase: ${manager.phase} | Week ${manager.weekIndex} | Day ${manager.dayInWeek}/7</div>`,
    `<div class="report-line neutral">Draft: ${draft}</div>`,
    `<div class="report-line neutral">Committed: ${committed}</div>`,
    `<div class="report-line neutral">World input: ${contextLine}</div>`,
    `<div class="report-line neutral">${timelineLine}</div>`,
    `<div class="report-line neutral">${recommendationLine}</div>`,
    `<div class="report-line neutral">${supplyLine}</div>`,
    `<div class="report-line neutral">${timingLine}</div>`,
    `<div class="report-line neutral">${pendingLine}</div>`,
    `<div class="report-line neutral">${manager.queueSummary || "Queue status unavailable."}</div>`,
    `<div class="report-line neutral">Transition note: ${manager.transitionReason || "-"}</div>`,
    `<div class="report-line ${manager.guardNote ? "bad" : "neutral"}">${manager.guardNote || manager.lastWeekSummary}</div>`,
    `<div class="report-line neutral">Guard recoveries: ${manager.timeflowGuardRecoveries || 0}</div>`
  ].join("");
}

function renderCommandBoard(el) {
  if (!el.commandBoardView) {
    return;
  }
  const tooling = getManagerToolingStatus();
  const board = tooling.commandBoard || {};
  const messages = Array.isArray(board.messages) ? board.messages : [];
  const categoryFilter = board.categoryFilter || "all";
  const urgencyFilter = board.urgencyFilter || "all";
  const filtered = messages.filter((entry) => {
    const categoryOk = categoryFilter === "all" || entry.category === categoryFilter;
    const urgencyOk = urgencyFilter === "all" || entry.urgency === urgencyFilter;
    return categoryOk && urgencyOk;
  });
  const top = filtered.slice(0, 6);
  const sections = Array.isArray(tooling.sections) ? tooling.sections : [];
  const activeSection = tooling.activeSection || "message_board";
  const categories = ["all", "compliance", "supply", "staffing", "rivalry", "finance", "events", "scouting", "objectives", "analytics", "operations"];
  const urgencies = ["all", "critical", "high", "medium", "low"];
  el.commandBoardView.innerHTML = [
    `<div class="report-line neutral">Unread ${board.unreadCount || 0} | ${board.lastSummary || "No command messages."}</div>`,
    `<div class="report-line neutral">Use section + category + urgency filters to triage directives before acting.</div>`,
    `<div class="group inline action-row">${sections
      .map((sectionId) => {
        const label = sectionId.replace("_", " ");
        const activeClass = sectionId === activeSection ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-section="${sectionId}" title="Switch command board focus to ${label}.">${label}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline action-row">Category ${categories
      .map((categoryId) => {
        const activeClass = categoryId === categoryFilter ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-category="${categoryId}" title="Filter directives by ${categoryId} category.">${categoryId}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline action-row">Urgency ${urgencies
      .map((urgencyId) => {
        const activeClass = urgencyId === urgencyFilter ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-urgency="${urgencyId}" title="Filter directives by ${urgencyId} urgency.">${urgencyId}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline action-row"><button data-command-read-all="1" title="Mark all currently listed command directives as read.">Mark All Read</button></div>`,
    ...top.map((entry) => {
      const tone =
        entry.urgency === "critical" ? "bad" : entry.urgency === "high" ? "bad" : entry.urgency === "medium" ? "neutral" : "good";
      const recommendation = entry.recommendation
        ? ` Rec: ${entry.recommendation.label} (conf ${entry.recommendation.confidence} / impact ${entry.recommendation.impact}).`
        : "";
      return `<div class="report-line ${tone}">[${entry.urgency.toUpperCase()}] ${entry.title}: ${entry.summary}${recommendation} <button data-command-read="${entry.id}" title="Mark this directive as read in the command board.">${entry.read ? "Read" : "Mark Read"}</button></div>`;
    }),
    filtered.length === 0 ? `<div class="report-line neutral">No messages match current filters.</div>` : ""
  ].join("");
}

function renderDelegationDesk(el) {
  if (!el.delegationView) {
    return;
  }
  const tooling = getManagerToolingStatus();
  const delegation = tooling.delegation || {};
  const roles = delegation.roles ? Object.values(delegation.roles) : [];
  const auditTrail = Array.isArray(delegation.auditTrail) ? delegation.auditTrail : [];
  el.delegationView.innerHTML = [
    `<div class="report-line neutral">Delegation runs trusted routines at boundaries; disable roles to keep full manual control.</div>`,
    `<div class="report-line neutral">${delegation.lastRunSummary || "Delegation summary unavailable."}</div>`,
    `<div class="report-line neutral">Last run day: ${delegation.lastRunDay || 0}</div>`,
    ...roles.map((role) => {
      const taskRows = Object.entries(role.tasks || {})
        .map(([taskId, enabled]) => {
          return `<label><input type="checkbox" data-delegation-role="${role.id}" data-delegation-task="${taskId}" ${enabled ? "checked" : ""} title="Toggle delegated task ${taskId} for ${role.label}."> ${taskId}</label>`;
        })
        .join(" ");
      return `
        <div class="report-line neutral">
          <label><input type="checkbox" data-delegation-role="${role.id}" ${role.enabled ? "checked" : ""} title="Enable or disable delegated role ${role.label}."> ${role.label}</label>
          <span>${taskRows}</span>
        </div>
      `;
    }),
    `<div class="report-line neutral">Recent audit:</div>`,
    ...auditTrail.slice(0, 5).map((entry) => {
      const tone = entry.tone === "bad" ? "bad" : entry.tone === "good" ? "good" : "neutral";
      return `<div class="report-line ${tone}">D${entry.day} ${entry.roleId}: ${entry.result}</div>`;
    }),
    auditTrail.length === 0 ? `<div class="report-line neutral">No delegated actions recorded yet.</div>` : ""
  ].join("");
}

function renderAnalyticsDashboard(el) {
  if (!el.analyticsView) {
    return;
  }
  const tooling = getManagerToolingStatus();
  const analytics = tooling.analytics || {};
  const summary = analytics.dailySummary || {};
  const deltas = analytics.deltas || {};
  const margins = analytics.menuItemMargins || {};
  const anomalies = Array.isArray(analytics.anomalyNotes) ? analytics.anomalyNotes : [];
  const history = Array.isArray(analytics.history) ? analytics.history : [];
  const trendTone = (deltas.marginPct || 0) >= 0 ? "good" : "bad";
  el.analyticsView.innerHTML = [
    `<div class="report-line neutral">Updated day: ${analytics.lastUpdatedDay || 0}</div>`,
    `<div class="report-line neutral">Conversion ${summary.conversionPct || 0}% (d ${deltas.conversionPct || 0})</div>`,
    `<div class="report-line neutral">Retention ${summary.retentionPct || 0}% (d ${deltas.retentionPct || 0})</div>`,
    `<div class="report-line ${trendTone}">Margin ${summary.marginPct || 0}% (d ${deltas.marginPct || 0})</div>`,
    `<div class="report-line neutral">Avg Spend ${formatCoin(summary.avgSpend || 0)} (d ${formatCoin(deltas.avgSpend || 0)})</div>`,
    `<div class="report-line neutral">Menu margin: ale ${formatCoin(margins.ale || 0)}, mead ${formatCoin(margins.mead || 0)}, stew ${formatCoin(margins.stew || 0)}, bread ${formatCoin(margins.bread || 0)}, room ${formatCoin(margins.room || 0)}.</div>`,
    `<div class="report-line neutral">Recent history entries: ${history.length}</div>`,
    ...anomalies.slice(0, 4).map((note) => `<div class="report-line bad">${note}</div>`),
    anomalies.length === 0 ? `<div class="report-line good">No major anomalies flagged.</div>` : ""
  ].join("");
}

function renderScoutingDesk(el) {
  if (!el.scoutingView) {
    return;
  }
  const tooling = getManagerToolingStatus();
  const scouting = tooling.scouting || {};
  const reports = Array.isArray(scouting.reports) ? scouting.reports : [];
  const rumors = Array.isArray(scouting.rumors) ? scouting.rumors : [];
  const activeRumors = rumors.filter((entry) => entry.status === "active");
  el.scoutingView.innerHTML = [
    `<div class="report-line neutral">${scouting.lastSummary || "Scouting summary unavailable."}</div>`,
    `<div class="report-line neutral">Scout quality ${scouting.scoutQuality || 0} | reports ${reports.length} | active rumors ${activeRumors.length}</div>`,
    `<div class="report-line neutral">Higher confidence and freshness make scouting intel safer to act on.</div>`,
    `<div class="group inline action-row">
      <button data-scouting-sweep="event" title="Spend scouting effort to gather event intel.">Scout Event</button>
      <button data-scouting-sweep="rival" title="Spend scouting effort to gather rival tavern intel.">Scout Rival</button>
      <button data-scouting-sweep="recruit" title="Spend scouting effort to improve recruitment visibility.">Scout Recruit</button>
    </div>`,
    ...reports.slice(0, 4).map((report) => {
      return `<div class="report-line neutral">Intel ${report.label}: conf ${report.confidence}, fresh ${report.freshness}. ${report.summary}</div>`;
    }),
    ...rumors.slice(0, 4).map((rumor) => {
      const tone = rumor.status === "resolved" ? "good" : rumor.status === "expired" ? "bad" : "neutral";
      const resolveLine = rumor.status === "active" ? `resolves D${rumor.resolveDay}` : rumor.resolutionNote;
      return `<div class="report-line ${tone}">Rumor (${rumor.status}/${rumor.truthState}): ${rumor.summary} ${resolveLine}</div>`;
    }),
    reports.length === 0 ? `<div class="report-line neutral">No intel reports yet.</div>` : ""
  ].join("");
}
