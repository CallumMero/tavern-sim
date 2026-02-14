import {
  state,
  initGame,
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

export function startApp() {
  const ui = createGameUI(document);
  const persistence = createPersistence(window.localStorage);
  const snapshot = persistence.load();

  let loadedFromSave = false;
  if (snapshot) {
    const result = loadGame(snapshot);
    loadedFromSave = result.ok;
  }
  if (!loadedFromSave) {
    initGame();
  }

  const saveCurrentState = () => {
    persistence.save(saveGame());
  };
  subscribeOnChange(saveCurrentState);
  saveCurrentState();

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
      return loadGame(saved);
    },
    clearSave: () => persistence.clear(),
    locations: () => listStartingLocations(),
    districts: () => listDistricts(),
    actors: () => listWorldActors(),
    crown: () => getCrownAuthorityStatus(),
    suppliers: () => getSupplierNetworkStatus(),
    rivals: () => getRivalStatus(),
    worldReputation: () => getWorldReputationStatus(),
    worldLayer: () => getWorldLayerStatus(),
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
      }
      return result;
    },
    scenarios: () => listScenarios(),
    loadScenario: (scenarioId, seed = null) => {
      const result = loadScenario(scenarioId, seed);
      if (result.ok) {
        saveCurrentState();
      }
      return result;
    }
  };
}
