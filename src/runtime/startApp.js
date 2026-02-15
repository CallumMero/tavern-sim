import {
  state,
  loadGame,
  saveGame,
  subscribeOnChange,
  startNewGame,
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
  fileComplianceReport,
  settleCrownArrears,
  signLocalBrokerContract,
  signArcanumWholesaleContract,
  scheduleCityStockRun,
  listTravelOptions,
  startDistrictTravel,
  listScenarios,
  loadScenario
} from "../engine/gameEngine.js";
import { createGameUI } from "../ui/gameUI.js";
import { createPersistence } from "./persistence.js";
import { createAppSettingsStore } from "./appSettings.js";

function buildContinueLabel(snapshot) {
  if (!snapshot || !snapshot.state || typeof snapshot.state !== "object") {
    return "No saved campaign found.";
  }
  const day = Math.max(1, Math.round(Number(snapshot.state.day) || 1));
  const manager = snapshot.state.manager && typeof snapshot.state.manager === "object"
    ? snapshot.state.manager
    : {};
  const week = Math.max(1, Math.round(Number(manager.weekIndex) || 1));
  const phase = typeof manager.phase === "string" ? manager.phase : "planning";
  return `Saved campaign: Day ${day}, Week ${week}, ${phase} phase.`;
}

export function startApp() {
  const persistence = createPersistence(window.localStorage);
  const settingsStore = createAppSettingsStore(window.localStorage);
  const initialSnapshot = persistence.load();
  const initialSettings = settingsStore.load();

  const saveCurrentState = () => {
    persistence.save(saveGame());
  };

  const continueCampaign = () => {
    const snapshot = persistence.load();
    if (!snapshot) {
      return { ok: false, error: "No saved campaign found." };
    }
    const result = loadGame(snapshot);
    if (result.ok) {
      saveCurrentState();
    }
    return result;
  };

  const startCampaign = ({ seed = null, startingLocation = null } = {}) => {
    const result = startNewGame(seed, startingLocation);
    if (result.ok) {
      saveCurrentState();
    }
    return result;
  };

  const ui = createGameUI(document, {
    onStartCampaign: startCampaign,
    onContinueCampaign: continueCampaign,
    onSettingsChange: (nextSettings) => {
      settingsStore.save(nextSettings);
    },
    initialSettings,
    hasContinue: Boolean(initialSnapshot),
    continueLabel: buildContinueLabel(initialSnapshot)
  });
  subscribeOnChange(saveCurrentState);
  ui.showMenu("main_menu");
  ui.setContinueState(Boolean(initialSnapshot), buildContinueLabel(initialSnapshot));

  // Debug handle for manual balancing in browser console.
  window.tavernSim = {
    state,
    render: ui.render,
    save: saveCurrentState,
    load: () => {
      const saved = persistence.load();
      if (!saved) {
        return { ok: false, error: "No saved game found." };
      }
      const result = loadGame(saved);
      if (result.ok) {
        ui.setContinueState(true, buildContinueLabel(saved));
      }
      return result;
    },
    clearSave: () => {
      const cleared = persistence.clear();
      if (cleared) {
        ui.setContinueState(false, "No saved campaign found.");
      }
      return cleared;
    },
    locations: () => listStartingLocations(),
    districts: () => listDistricts(),
    actors: () => listWorldActors(),
    crown: () => getCrownAuthorityStatus(),
    suppliers: () => getSupplierNetworkStatus(),
    rivals: () => getRivalStatus(),
    worldReputation: () => getWorldReputationStatus(),
    worldLayer: () => getWorldLayerStatus(),
    timeflow: () => getTimeflowContractStatus(),
    timeflowDiagnostics: () => getTimeflowDiagnostics(),
    managerPhase: () => getManagerPhaseStatus(),
    managerTooling: () => getManagerToolingStatus(),
    managerLayer: () => getManagerLayerStatus(),
    clock: () => getSimulationClockStatus(),
    setSpeed: (speed = 0) => setSimulationSpeed(speed),
    tickMinutes: (minutes = 1) => advanceSimulationMinutes(minutes),
    updatePlan: (draft = {}) => updateWeeklyPlanDraft(draft),
    setCommandSection: (section = "message_board") => setCommandBoardSection(section),
    setCommandFilters: (filters = {}) => setCommandBoardFilters(filters),
    markCommandRead: (messageId, read = true) => markCommandMessageRead(messageId, read),
    markAllCommandRead: () => markAllCommandMessagesRead(),
    setDelegationRole: (roleId, enabled = false) => setDelegationRoleEnabled(roleId, enabled),
    setDelegationTask: (roleId, taskId, enabled = false) => setDelegationTaskEnabled(roleId, taskId, enabled),
    commitPlan: () => commitWeeklyPlan(),
    shortlistCandidate: (candidateId) => shortlistRecruitCandidate(candidateId),
    scoutCandidate: (candidateId) => scoutRecruitCandidate(candidateId),
    scoutingSweep: (targetType = "event") => runScoutingSweep(targetType),
    signCandidate: (candidateId) => signRecruitCandidate(candidateId),
    fileCompliance: () => fileComplianceReport(),
    settleArrears: (amount = null) => settleCrownArrears(amount),
    signLocalContract: () => signLocalBrokerContract(),
    signWholesaleContract: () => signArcanumWholesaleContract(),
    runCityStockTrip: (bundleScale = 1) => scheduleCityStockRun(bundleScale),
    travelOptions: () => listTravelOptions(),
    travel: (destinationId) => startDistrictTravel(destinationId),
    newGame: (seed = null, startingLocation = null) => {
      const result = startNewGame(seed, startingLocation);
      if (result.ok) {
        saveCurrentState();
        ui.setContinueState(true, buildContinueLabel(saveGame()));
      }
      return result;
    },
    scenarios: () => listScenarios(),
    loadScenario: (scenarioId, seed = null) => {
      const result = loadScenario(scenarioId, seed);
      if (result.ok) {
        saveCurrentState();
        ui.setContinueState(true, buildContinueLabel(saveGame()));
      }
      return result;
    },
    showMenu: (view = "main_menu") => ui.showMenu(view),
    enterGame: () => ui.enterGame(),
    settings: () => ui.getSettings(),
    setSettings: (nextSettings = {}) => {
      const stored = settingsStore.save(nextSettings);
      ui.applySettings(stored.settings);
      return stored;
    }
  };

  window.__tavernAppStarted = true;
}
