import {
  state,
  initGame
} from "../engine/gameEngine.js";
import { createGameUI } from "../ui/gameUI.js";

export function startApp() {
  const ui = createGameUI(document);
  initGame();

  // Debug handle for manual balancing in browser console.
  window.tavernSim = {
    state,
    render: ui.render
  };
}
