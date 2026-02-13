import { createRandomController } from "./random.js";
import {
  DAY_NAMES,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  COHORT_PROFILES
} from "./config.js";
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
import { rollDailyEvent as rollDailyEventModel } from "./eventEngine.js";
import {
  demandByPrice as demandByPriceModel,
  sellFromInventory as sellFromInventoryModel
} from "./economyEngine.js";

const SAVE_SCHEMA_VERSION = 1;

const random = createRandomController();
const changeListeners = [];

function createInitialState() {
  return {
    day: 1,
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
      kitchen: 60,
      satisfaction: 64
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
    if (!ROTA_PRESETS[preset]) {
      return;
    }
    state.rotaPreset = preset;
    logLine(`Rota preset changed to ${ROTA_PRESETS[preset].label}.`, "neutral");
    render();
  }

  function adjustPrice(product, delta) {
    const next = clamp(state.prices[product] + delta, 1, 40);
    state.prices[product] = next;
    logLine(`${product.toUpperCase()} price set to ${formatCoin(next)}.`, "neutral");
    render();
  }

  function buySupply(item, amount, unitCost) {
    const total = amount * unitCost;
    if (!spendGold(total, `Buy ${item}`)) {
      return;
    }
    const oldQty = state.inventory[item];
    state.inventory[item] += amount;
    if (isSupplyItem(item)) {
      const profile = SUPPLY_META[item];
      const incomingQuality = clamp(
        profile.baseQuality + randInt(-profile.qualityVariance, profile.qualityVariance),
        30,
        96
      );
      const incomingFreshness = clamp(randInt(70, 96), 25, 100);
      const nextQty = state.inventory[item];
      state.supplyStats[item].quality = Math.round(
        (state.supplyStats[item].quality * oldQty + incomingQuality * amount) / nextQty
      );
      state.supplyStats[item].freshness = Math.round(
        (state.supplyStats[item].freshness * oldQty + incomingFreshness * amount) / nextQty
      );
      logLine(
        `Purchased ${amount} ${item} for ${formatCoin(total)} (${qualityTier(incomingQuality)} grade).`,
        "neutral"
      );
      render();
      return;
    }
    logLine(`Purchased ${amount} ${item} for ${formatCoin(total)}.`, "neutral");
    render();
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
    if (!spendGold(32, "Marketing")) {
      return;
    }
    state.marketingDays = Math.max(state.marketingDays, 3);
    state.reputation = clamp(state.reputation + 1, 0, 100);
    logLine("Town crier campaign launched (+demand for 3 days).", "good");
    render();
  }

function hostFestival() {
  if (!spendGold(50, "Minstrel Night")) {
    return;
  }
  state.festivalDays = Math.max(state.festivalDays, 2);
  state.cleanliness = clamp(state.cleanliness - 6, 0, 100);
  state.reputation = clamp(state.reputation + 2, 0, 100);
  logLine("Minstrel night booked (+demand for 2 days, more mess).", "good");
  render();
}

function deepClean() {
  if (!spendGold(14, "Deep clean")) {
    return;
  }
  state.cleanliness = clamp(state.cleanliness + 20, 0, 100);
  logLine("You paid for a full scrub and fresh linens (+cleanliness).", "good");
  render();
}

function repairTavern() {
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

  function advanceDay() {
    state.day += 1;
    const weekday = DAY_NAMES[(state.day - 1) % 7];
    const absenceProgress = progressStaffAbsences();
    const spoilageSummary = applySupplySpoilage();
    const shiftContext = assignDailyShifts(weekday);
    const staffStats = getStaffStats();
    const mods = rollDailyEvent();
    const kitchenContext = getProductionQualityContext();

    state.cleanliness = clamp(state.cleanliness - randInt(2, 6) + mods.cleanliness, 0, 100);
    state.condition = clamp(state.condition - randInt(1, 4) + mods.condition, 0, 100);
    state.reputation = clamp(state.reputation + mods.reputation, 0, 100);

    const weekendMult = weekday === "Fri" || weekday === "Sat" ? 1.22 : 1.0;

    let demandBase =
      24 +
      state.reputation * 0.9 +
      staffStats.service * 1.2 +
      (state.cleanliness + state.condition) * 0.3;
    demandBase = demandBase * weekendMult;
    demandBase *= shiftContext.demandMult;
    const loyaltyDemandMult = getLoyaltyDemandMultiplier();
    demandBase *= loyaltyDemandMult;

    if (state.marketingDays > 0) {
      demandBase *= 1.17;
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

    const aleDemand = Math.floor(guests * 0.62 * demandByPrice("ale", 6));
    const meadDemand = Math.floor(guests * 0.33 * demandByPrice("mead", 8));
    const stewDemand = Math.floor(guests * 0.48 * demandByPrice("stew", 10));
    const breadDemand = Math.floor(guests * 0.28 * demandByPrice("bread", 4));
    const roomDemand = Math.floor(guests * 0.18 * demandByPrice("room", 16));

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
    const expenses = payroll + upkeep + randomLoss + disruptionExpense;

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
    state.lastReport = {
      loyaltyDemandMult,
      ...patronReport,
      staffing: `${shiftContext.summary} Avg fatigue ${staffIncidentSummary.avgFatigue}.`,
      supplies: spoilageSummary,
      kitchen: Math.round(kitchenContext.score),
      satisfaction: Math.round(satisfaction * 100)
    };

    const repSwing = Math.round((satisfaction - 0.64) * 11);
    state.reputation = clamp(state.reputation + repSwing, 0, 100);

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

    logLine(
      `Day ${state.day} closed: ${guests} guests, revenue ${formatCoin(revenue)}, net ${formatCoin(net)}.`,
      net >= 0 ? "good" : "bad"
    );
    resetProductionQualityContext();
    render();
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

  function rollDailyEvent() {
    return rollDailyEventModel(state, {
      randInt,
      pick,
      randomFloat: () => random.nextFloat(),
      logLine
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

function loadGame(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, error: "Missing save payload." };
  }
  if (snapshot.version !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Save version ${snapshot.version} is not compatible with ${SAVE_SCHEMA_VERSION}.`
    };
  }

  const merged = mergeWithTemplate(stateTemplate, snapshot.state);
  applyStateSnapshot(merged);
  random.restore(snapshot.random);
  initialized = true;
  logLine(`Loaded campaign snapshot (Day ${state.day}).`, "neutral");
  render();
  return { ok: true };
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

function startNewGame(seedLike = null) {
  if (seedLike === null || seedLike === undefined || seedLike === "") {
    clearRandomSeed();
  } else if (!setRandomSeed(seedLike)) {
    return { ok: false, error: "Seed must be a valid number." };
  }

  applyStateSnapshot(createInitialState());
  initialized = false;
  initGame();
  return { ok: true };
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
  initialized = true;
  logLine("Tavern charter signed. Trade can now begin.", "neutral");
  logLine("Tip: keep ale and stew stocked before Fridays and Saturdays.", "neutral");
  logLine("Tip: loyal patrons boost future demand. Watch the daily report.", "neutral");
  logLine("Tip: fatigue builds over time. Use rota presets to protect your staff.", "neutral");
  render();
}

export {
  DAY_NAMES,
  COHORT_PROFILES,
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
};
