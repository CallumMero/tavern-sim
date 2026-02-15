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

function byId(id, documentRef) {
  return documentRef.getElementById(id);
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
    settings: { ...uiOptions.initialSettings }
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
  renderMenuLocationCards(el, menuState);
  applyMenuSettings(menuState.settings);
  syncMenuSettingsInputs(el, menuState.settings);
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
      applyMenuSettings(menuState.settings);
      syncMenuSettingsInputs(el, menuState.settings);
    },
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

  return {
    audioMode,
    uiScale,
    textSize,
    defaultSpeed
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
      defaultSpeed: el.menuDefaultSpeedSelect ? el.menuDefaultSpeedSelect.value : "0"
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

  documentRef.addEventListener("keydown", (event) => {
    if (menuState.view === "in_game") {
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
  renderTopStats(el);
  renderInventory(el);
  renderPrices(el);
  renderStaff(el);
  renderReport(el);
  renderLog(el);
}

function syncTimeflowInteractionLocks(el) {
  const timeflow = getTimeflowContractStatus();
  const disabled = Boolean(timeflow.runtime && timeflow.runtime.inProgress);
  const dynamicActionButtons = Array.from(document.querySelectorAll(
    "#priceView button, #staffView button, #commandBoardView button, #scoutingView button"
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
  const travelDays = state.world && state.world.travelDaysRemaining ? state.world.travelDaysRemaining : 0;
  const manager = getManagerPhaseStatus();
  const clock = getSimulationClockStatus();
  const timeline = manager.timeline || {};

  const tiles = [
    `Day ${state.day} (${weekday})`,
    `Time ${clock.label}`,
    `Sim ${clock.speedLabel}`,
    `Week ${manager.weekIndex} ${manager.phase}`,
    `WDay ${manager.dayInWeek}/7`,
    `Season ${timeline.seasonLabel || "Spring"} W${timeline.weekOfSeason || 1}`,
    `Location ${locationLabel}`,
    `District ${districtLabel}`,
    `Travel ${travelDays > 0 ? `${travelDays}d` : "Idle"}`,
    `Supply Vol ${getSupplierNetworkStatus().volatility}`,
    `Rival ${state.lastReport.rivalPressure || 0}%`,
    `Compliance ${state.lastReport.compliance || 0}`,
    `Gold ${formatCoin(state.gold)}`,
    `Rep ${state.reputation}`,
    `Clean ${state.cleanliness}`,
    `Condition ${state.condition}`,
    `Rota ${ROTA_PRESETS[state.rotaPreset].label}`,
    `Staff ${staffStats.activeCount}/${state.staff.length}`,
    `Fatigue ${Math.round(staffStats.avgFatigue)}`,
    `Payroll ${formatCoin(staffStats.payroll)}`,
    `Guests ${state.lastGuests}`,
    `Net ${formatCoin(state.lastNet)}`
  ];

  el.topStats.innerHTML = tiles
    .map((text) => `<div class="chip">${text}</div>`)
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
            <button data-product="${id}" data-delta="-1">-</button>
            <button data-product="${id}" data-delta="1">+</button>
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
            <button data-fire-id="${person.id}">Fire</button>
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
            <button data-shortlist-id="${candidate.id}">${shortlistLabel}</button>
            <button data-scout-id="${candidate.id}">Scout</button>
            <button data-sign-id="${candidate.id}">Sign</button>
          </span>
        </div>
      `;
    })
    .join("");
  el.staffView.innerHTML = `${rosterHtml}${recruitmentHeader}${recruitmentRows}`;
}

function renderReport(el) {
  const manager = getManagerPhaseStatus();
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
  const lines = [
    {
      tone: state.lastNet >= 0 ? "good" : "bad",
      text: `Finance: ${formatCoin(state.lastRevenue)} revenue, ${formatCoin(state.lastExpenses)} expenses, crown accrued ${formatCoin(state.lastReport.crownTax || 0)}, crown due ${formatCoin(state.lastReport.crownDue || 0)}, crown paid ${formatCoin(state.lastReport.crownPayment || 0)}, ${netPrefix}${formatCoin(state.lastNet)} net.`
    },
    {
      tone: lowStock.length === 0 ? "good" : "bad",
      text:
        lowStock.length === 0
          ? "Operations: no critical low-stock items."
          : `Operations: low stock ${lowStock.join(", ")}.`
    },
    {
      tone: state.lastReport.supplies.includes("No ingredient spoilage") ? "good" : "bad",
      text: `Supplies: ${state.lastReport.supplies} Kitchen blend score ${state.lastReport.kitchen}.`
    },
    {
      tone:
        state.lastReport.supplierSummary && state.lastReport.supplierSummary.includes("thin")
          ? "bad"
          : "neutral",
      text: `Supplier network: ${state.lastReport.supplierSummary || "No supplier update logged."}`
    },
    {
      tone:
        (state.lastReport.rivalPressure || 0) >= 40
          ? "bad"
          : state.lastReport.rivalSummary && state.lastReport.rivalSummary.includes("setback")
            ? "good"
            : "neutral",
      text: `Rivalry: ${state.lastReport.rivalSummary || "Rival taverns held steady."} Pressure ${state.lastReport.rivalPressure || 0}%.`
    },
    {
      tone:
        state.lastReport.events && state.lastReport.events.includes("No major district or calendar event")
          ? "neutral"
          : "good",
      text: `Calendar: ${state.lastReport.events || "No major district or calendar event today."}`
    },
    {
      tone: "neutral",
      text: `World layer: ${state.lastReport.worldLayerSummary || "World layer summary not available."}`
    },
    {
      tone:
        state.lastReport.topCohortLoyalty - state.lastReport.lowCohortLoyalty >= 8
          ? "good"
          : "neutral",
      text: `Sentiment: ${topCohort.label} loyalty ${state.lastReport.topCohortLoyalty}, ${lowCohort.label} loyalty ${state.lastReport.lowCohortLoyalty}, score ${state.lastReport.satisfaction}.`
    },
    {
      tone: state.lastReport.staffing.includes("No staff available") ? "bad" : "neutral",
      text: `Staffing: ${state.lastReport.staffing}`
    },
    {
      tone: "neutral",
      text: `Patron watch: ${state.lastReport.highlight} Loyalty demand factor ${state.lastReport.loyaltyDemandMult.toFixed(2)}x.`
    },
    {
      tone:
        state.lastReport.lowCohortStandingScore <= 42 || state.lastReport.lowGroupStandingScore <= 42
          ? "bad"
          : state.lastReport.topCohortStandingScore >= 62 && state.lastReport.topGroupStandingScore >= 62
            ? "good"
            : "neutral",
      text:
        `World reputation: ${state.lastReport.reputationSummary || "No world reputation summary."} ` +
        `Top cohort ${state.lastReport.topCohortStandingLabel || "Locals"} ${state.lastReport.topCohortStandingScore || 0}, ` +
        `top group ${state.lastReport.topGroupStandingLabel || "Crown Tax Office"} ${state.lastReport.topGroupStandingScore || 0}.`
    },
    {
      tone: actorTone,
      text: `Influence event: ${state.lastReport.actorEvent || "No faction movement today."}`
    },
    {
      tone: "neutral",
      text: `Influence standings: ${state.lastReport.actorSummary || "No influence summary available."}`
    },
    {
      tone: (state.lastReport.crownComplianceStanding || state.lastReport.compliance || 0) >= 55 ? "neutral" : "bad",
      text:
        `Crown office: ${state.lastReport.crownSummary || "No collection update."} ` +
        `Compliance ${state.lastReport.compliance || 0}, standing ${state.lastReport.crownComplianceStanding || state.lastReport.compliance || 0}.`
    },
    {
      tone:
        state.lastReport.weeklyWorldSummary && state.lastReport.weeklyWorldSummary.includes("avg net -")
          ? "bad"
          : "neutral",
      text: `Weekly world ledger: ${state.lastReport.weeklyWorldSummary || "No weekly world summary yet."}`
    },
    {
      tone: manager.phase === "execution" && manager.planCommitted ? "good" : "neutral",
      text:
        `Planning adherence: phase ${manager.phase}, week ${manager.weekIndex}, day ${manager.dayInWeek}/7, ` +
        `plan committed ${manager.planCommitted ? "yes" : "no"}.`
    },
    {
      tone: recruitCount >= 3 ? "good" : recruitCount === 0 ? "bad" : "neutral",
      text:
        `Recruitment pipeline: ${recruitCount} active candidates, ${shortlistCount} shortlisted. ` +
        `${manager.recruitment ? manager.recruitment.lastSummary : "No recruitment summary."}`
    },
    {
      tone: failedObjectives > completedObjectives ? "bad" : completedObjectives > 0 ? "good" : "neutral",
      text:
        `Objective board: ${activeObjectives} active, ${completedObjectives} completed, ${failedObjectives} failed. ` +
        `${state.lastReport.objectiveSummary || (manager.objectives ? manager.objectives.lastSummary : "No objective summary.")}`
    },
    {
      tone: "neutral",
      text: `Manager tooling: ${state.lastReport.managerToolingSummary || "Manager tooling summary unavailable."}`
    },
    {
      tone: "neutral",
      text:
        `Seasonal status: ${state.lastReport.seasonSummary || "Season summary unavailable."} ` +
        `${manager.timeline ? `Transition note: ${manager.timeline.lastTransitionNote}` : ""}`
    },
    {
      tone: "neutral",
      text:
        `Timeflow: ${state.lastReport.timeflowSummary || "No timeflow summary yet."} ` +
        `${state.lastReport.timeflowQueueSummary || ""}`
    }
  ];

  el.reportView.innerHTML = lines
    .map((line) => `<div class="report-line ${line.tone}">${line.text}</div>`)
    .join("");
}

function renderLog(el) {
  el.logView.innerHTML = state.log
    .map((entry) => {
      return `<div class="log-line ${entry.tone}">D${entry.day}: ${entry.message}</div>`;
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
    `<div class="group inline">${sections
      .map((sectionId) => {
        const label = sectionId.replace("_", " ");
        const activeClass = sectionId === activeSection ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-section="${sectionId}">${label}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline">Category ${categories
      .map((categoryId) => {
        const activeClass = categoryId === categoryFilter ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-category="${categoryId}">${categoryId}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline">Urgency ${urgencies
      .map((urgencyId) => {
        const activeClass = urgencyId === urgencyFilter ? "active-speed" : "";
        return `<button class="${activeClass}" data-command-urgency="${urgencyId}">${urgencyId}</button>`;
      })
      .join("")}</div>`,
    `<div class="group inline"><button data-command-read-all="1">Mark All Read</button></div>`,
    ...top.map((entry) => {
      const tone =
        entry.urgency === "critical" ? "bad" : entry.urgency === "high" ? "bad" : entry.urgency === "medium" ? "neutral" : "good";
      const recommendation = entry.recommendation
        ? ` Rec: ${entry.recommendation.label} (conf ${entry.recommendation.confidence} / impact ${entry.recommendation.impact}).`
        : "";
      return `<div class="report-line ${tone}">[${entry.urgency.toUpperCase()}] ${entry.title}: ${entry.summary}${recommendation} <button data-command-read="${entry.id}">${entry.read ? "Read" : "Mark Read"}</button></div>`;
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
    `<div class="report-line neutral">${delegation.lastRunSummary || "Delegation summary unavailable."}</div>`,
    `<div class="report-line neutral">Last run day: ${delegation.lastRunDay || 0}</div>`,
    ...roles.map((role) => {
      const taskRows = Object.entries(role.tasks || {})
        .map(([taskId, enabled]) => {
          return `<label><input type="checkbox" data-delegation-role="${role.id}" data-delegation-task="${taskId}" ${enabled ? "checked" : ""}> ${taskId}</label>`;
        })
        .join(" ");
      return `
        <div class="report-line neutral">
          <label><input type="checkbox" data-delegation-role="${role.id}" ${role.enabled ? "checked" : ""}> ${role.label}</label>
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
    `<div class="group inline">
      <button data-scouting-sweep="event">Scout Event</button>
      <button data-scouting-sweep="rival">Scout Rival</button>
      <button data-scouting-sweep="recruit">Scout Recruit</button>
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
