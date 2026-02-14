import {
  DAY_NAMES,
  COHORT_PROFILES,
  ROTA_PRESETS,
  state,
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

  const tiles = [
    `Day ${state.day} (${weekday})`,
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
  const lowStock = Object.entries(state.inventory)
    .filter(([, amount]) => amount < 10)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([item, amount]) => `${item}(${amount})`);

  const netPrefix = state.lastNet >= 0 ? "+" : "";
  const lines = [
    {
      tone: state.lastNet >= 0 ? "good" : "bad",
      text: `Finance: ${formatCoin(state.lastRevenue)} revenue, ${formatCoin(state.lastExpenses)} expenses, ${netPrefix}${formatCoin(state.lastNet)} net.`
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
