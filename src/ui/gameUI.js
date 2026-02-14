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

function byId(id, documentRef) {
  return documentRef.getElementById(id);
}

export function createGameUI(documentRef = document) {
  const el = {
    sceneCanvas: byId("sceneCanvas", documentRef),
    startLocationSelect: byId("startLocationSelect", documentRef),
    startSeedInput: byId("startSeedInput", documentRef),
    districtStatusView: byId("districtStatusView", documentRef),
    travelDestinationSelect: byId("travelDestinationSelect", documentRef),
    crownStatusView: byId("crownStatusView", documentRef),
    supplierStatusView: byId("supplierStatusView", documentRef),
    worldActorsView: byId("worldActorsView", documentRef),
    topStats: byId("topStats", documentRef),
    inventoryView: byId("inventoryView", documentRef),
    priceView: byId("priceView", documentRef),
    staffView: byId("staffView", documentRef),
    reportView: byId("reportView", documentRef),
    logView: byId("logView", documentRef)
  };
  const pixelRenderer = createPixelRenderer(el.sceneCanvas);

  bindActions(documentRef, el);
  setOnChange(() => {
    render(el);
    pixelRenderer.render(state);
  });
  render(el);
  pixelRenderer.render(state);
  pixelRenderer.start();

  return {
    render: () => {
      render(el);
      pixelRenderer.render(state);
    },
    destroy: () => pixelRenderer.destroy()
  };
}

function bindActions(documentRef, el) {
  populateLocationOptions(el.startLocationSelect);
  populateTravelOptions(el.travelDestinationSelect);
  byId("startCampaignBtn", documentRef).addEventListener("click", () => {
    const seedRaw = el.startSeedInput.value.trim();
    const seed = seedRaw === "" ? null : seedRaw;
    const location = el.startLocationSelect.value;
    const result = startNewGame(seed, location);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
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

  byId("nextDayBtn", documentRef).addEventListener("click", advanceDay);

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
    const btn = event.target.closest("button[data-fire-id]");
    if (!btn) {
      return;
    }
    const id = btn.getAttribute("data-fire-id");
    fireStaff(id);
  });
}

function render(el) {
  syncCampaignControls(el);
  populateTravelOptions(el.travelDestinationSelect);
  renderDistrictTravel(el);
  renderCrownStatus(el);
  renderSupplierStatus(el);
  renderWorldActors(el);
  renderTopStats(el);
  renderInventory(el);
  renderPrices(el);
  renderStaff(el);
  renderReport(el);
  renderLog(el);
}

function renderTopStats(el) {
  const staffStats = getStaffStats();
  const weekday = DAY_NAMES[(state.day - 1) % 7];
  const locationLabel = state.world && state.world.locationLabel ? state.world.locationLabel : "Arcanum";
  const districtLabel = state.world && state.world.currentDistrictLabel ? state.world.currentDistrictLabel : "-";
  const travelDays = state.world && state.world.travelDaysRemaining ? state.world.travelDaysRemaining : 0;

  const tiles = [
    `Day ${state.day} (${weekday})`,
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
  el.staffView.innerHTML = state.staff
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
}

function renderReport(el) {
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
  const nextLocation = state.world.startingLocation;
  if (nextLocation && el.startLocationSelect.value !== nextLocation) {
    el.startLocationSelect.value = nextLocation;
  }
}
