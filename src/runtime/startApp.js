import {
  state,
  initGame,
  loadGame,
  saveGame,
  subscribeOnChange,
  startNewGame,
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
    newGame: (seed = null) => {
      const result = startNewGame(seed);
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
