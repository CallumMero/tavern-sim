import { createRandomController } from "./random.js";
import {
  DAY_NAMES,
  ROLE_TEMPLATES,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  ROLE_SHIFT_BIAS,
  COHORT_PROFILES,
  PRODUCT_LABELS,
  PATRON_FIRST_NAMES,
  PATRON_LAST_NAMES,
  SUPPLY_META
} from "./config.js";

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
    const tpl = ROLE_TEMPLATES[role];
    return {
      id: `${role}-${random.randomId(6)}`,
      role,
      wage: tpl.wage + randInt(-1, 2),
      service: clamp(tpl.service + randInt(-3, 3), 4, 25),
      quality: clamp(tpl.quality + randInt(-2, 3), 1, 20),
      morale: randInt(52, 76),
      fatigue: randInt(18, 34),
      injuryDays: 0,
      disputeDays: 0,
      assignedShift: "day"
    };
  }

  function createSupplyStats() {
    const stats = {};
    for (const item in SUPPLY_META) {
      stats[item] = {
        quality: clamp(SUPPLY_META[item].baseQuality + randInt(-8, 8), 35, 95),
        freshness: randInt(62, 86)
      };
    }
    return stats;
  }

  function isSupplyItem(item) {
    return Boolean(SUPPLY_META[item]);
  }

  function qualityTier(quality) {
    if (quality >= 78) {
      return "Premium";
    }
    if (quality >= 64) {
      return "Fine";
    }
    if (quality >= 48) {
      return "Standard";
    }
    return "Poor";
  }

  function createPatronPool(count) {
    const pool = [];
    for (let i = 0; i < count; i += 1) {
      pool.push(createPatron(i));
    }
    return pool;
  }

  function createPatron(index) {
    const cohort = pickWeightedCohort();
    const profile = COHORT_PROFILES[cohort];
    const first = PATRON_FIRST_NAMES[randInt(0, PATRON_FIRST_NAMES.length - 1)];
    const last = PATRON_LAST_NAMES[randInt(0, PATRON_LAST_NAMES.length - 1)];
    const preference = pick(profile.preferredProducts);
    return {
      id: `patron-${index}-${random.randomId(5)}`,
      name: `${first} ${last}`,
      cohort,
      preference,
      loyalty: randInt(36, 64),
      visits: 0
    };
  }

  function pickWeightedCohort() {
    const roll = random.nextFloat();
    let threshold = 0;
    for (const cohort in COHORT_PROFILES) {
      threshold += COHORT_PROFILES[cohort].weight;
      if (roll <= threshold) {
        return cohort;
      }
    }
    return "locals";
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

  function isStaffUnavailable(person) {
    return person.injuryDays > 0 || person.disputeDays > 0;
  }

  function evaluateIngredientBlend(consumes) {
    let qualityTotal = 0;
    let freshnessTotal = 0;
    let weight = 0;
    for (const item in consumes) {
      if (!isSupplyItem(item)) {
        continue;
      }
      const amount = consumes[item];
      qualityTotal += state.supplyStats[item].quality * amount;
      freshnessTotal += state.supplyStats[item].freshness * amount;
      weight += amount;
    }

    const avgQuality = weight === 0 ? 60 : qualityTotal / weight;
    const avgFreshness = weight === 0 ? 70 : freshnessTotal / weight;
    const score = avgQuality * 0.62 + avgFreshness * 0.38;
    return {
      avgQuality,
      avgFreshness,
      score,
      outputMult: clamp(1 + (score - 60) / 230, 0.82, 1.12)
    };
  }

  function getProductionQualityContext() {
    if (state.productionBatches === 0) {
      return { score: 60, boost: 0 };
    }
    const score = state.productionQualitySum / state.productionBatches;
    return {
      score,
      boost: Math.round((score - 60) / 7)
    };
  }

  function resetProductionQualityContext() {
    state.productionQualitySum = 0;
    state.productionBatches = 0;
  }

  function applySupplySpoilage() {
    const spoiled = [];
    for (const item in SUPPLY_META) {
      const quantity = state.inventory[item];
      if (quantity <= 0) {
        continue;
      }

      const meta = SUPPLY_META[item];
      const hygienePenalty = item === "meat" || item === "veg" || item === "bread"
        ? Math.max(0, Math.floor((52 - state.cleanliness) / 12))
        : 0;
      const freshnessLoss = randInt(meta.lossMin, meta.lossMax) + hygienePenalty;
      state.supplyStats[item].freshness = clamp(
        state.supplyStats[item].freshness - freshnessLoss,
        0,
        100
      );
      state.supplyStats[item].quality = clamp(
        state.supplyStats[item].quality - randInt(0, 2),
        15,
        100
      );

      if (meta.spoilAt < 0 || state.supplyStats[item].freshness >= meta.spoilAt) {
        continue;
      }
      const freshnessGap = meta.spoilAt - state.supplyStats[item].freshness;
      const spoilRate = 0.03 + freshnessGap / 120;
      const lost = Math.min(quantity, Math.max(1, Math.floor(quantity * spoilRate)));
      state.inventory[item] -= lost;
      spoiled.push({ item, lost });
    }

    if (spoiled.length === 0) {
      return "No ingredient spoilage today.";
    }
    const note = spoiled
      .slice(0, 3)
      .map((entry) => `${entry.item} -${entry.lost}`)
      .join(", ");
    return `Spoilage hit ${note}.`;
  }

  function progressStaffAbsences() {
    let returnedCount = 0;
    let injuredCount = 0;
    let disputeCount = 0;
    state.staff.forEach((person) => {
      if (person.injuryDays > 0) {
        person.injuryDays -= 1;
        person.fatigue = clamp(person.fatigue - randInt(6, 11), 0, 100);
        injuredCount += 1;
        if (person.injuryDays === 0) {
          returnedCount += 1;
          logLine(`${person.role} returned from injury leave.`, "good");
        }
      }
      if (person.disputeDays > 0) {
        person.disputeDays -= 1;
        person.fatigue = clamp(person.fatigue - randInt(4, 8), 0, 100);
        person.morale = clamp(person.morale + 2, 0, 100);
        disputeCount += 1;
        if (person.disputeDays === 0) {
          returnedCount += 1;
          logLine(`${person.role} dispute settled and returned to duty.`, "good");
        }
      }
    });
    return { returnedCount, injuredCount, disputeCount };
  }

  function assignDailyShifts(weekday) {
    const isWeekendRush = weekday === "Fri" || weekday === "Sat";
    const demandNightShare = isWeekendRush ? 0.62 : 0.42;
    const preset = ROTA_PRESETS[state.rotaPreset] || ROTA_PRESETS.balanced;
    const availableStaff = state.staff.filter((person) => !isStaffUnavailable(person));
    let dayAssigned = 0;
    let nightAssigned = 0;

    availableStaff.forEach((person) => {
      const roleBias = ROLE_SHIFT_BIAS[person.role] || 0;
      const nightChance = clamp(
        preset.nightShare + roleBias + (isWeekendRush ? 0.04 : -0.03),
        0.08,
        0.92
      );
      person.assignedShift = random.nextFloat() < nightChance ? "night" : "day";
      if (person.assignedShift === "night") {
        nightAssigned += 1;
      } else {
        dayAssigned += 1;
      }
    });

    const totalAssigned = dayAssigned + nightAssigned;
    const nightShare = totalAssigned === 0 ? 0.5 : nightAssigned / totalAssigned;
    const shiftFit = 1 - Math.abs(nightShare - demandNightShare);
    return {
      availableCount: totalAssigned,
      injuredCount: state.staff.filter((person) => person.injuryDays > 0).length,
      disputeCount: state.staff.filter((person) => person.disputeDays > 0).length,
      dayAssigned,
      nightAssigned,
      shiftFit,
      demandMult: clamp(0.86 + shiftFit * 0.25, 0.82, 1.09),
      serviceMult: clamp(0.84 + shiftFit * 0.28, 0.8, 1.12),
      busyShift: isWeekendRush ? "night" : "day",
      summary:
        totalAssigned === 0
          ? "No staff available for rota."
          : `Rota ${preset.label}: day ${dayAssigned}, night ${nightAssigned}.`
    };
  }

  function applyEndOfDayStaffEffects(shiftContext, satisfaction, net) {
    let newInjuries = 0;
    let newDisputes = 0;
    let fatigueTotal = 0;

    state.staff.forEach((person) => {
      if (isStaffUnavailable(person)) {
        fatigueTotal += person.fatigue;
        return;
      }

      const onBusyShift = person.assignedShift === shiftContext.busyShift;
      const fatigueGain = onBusyShift ? randInt(7, 12) : randInt(3, 8);
      const satisfactionRelief = satisfaction >= 0.68 ? 2 : 0;
      person.fatigue = clamp(person.fatigue + fatigueGain - satisfactionRelief, 0, 100);
      fatigueTotal += person.fatigue;

      if (person.fatigue >= 84 && random.nextFloat() < 0.09) {
        person.injuryDays = randInt(2, 4);
        person.morale = clamp(person.morale - randInt(4, 8), 0, 100);
        newInjuries += 1;
        logLine(`${person.role} suffered a fatigue injury and is out for treatment.`, "bad");
        return;
      }

      if (person.fatigue >= 76 && person.morale < 48 && random.nextFloat() < 0.12) {
        person.disputeDays = randInt(1, 3);
        person.morale = clamp(person.morale - randInt(3, 7), 0, 100);
        newDisputes += 1;
        logLine(`${person.role} entered a staff dispute and sat out duties.`, "bad");
        return;
      }

      if (net > 0 && satisfaction > 0.67) {
        person.morale = clamp(person.morale + 1, 0, 100);
      }
    });

    const avgFatigue = state.staff.length === 0 ? 0 : Math.round(fatigueTotal / state.staff.length);
    return { newInjuries, newDisputes, avgFatigue };
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
    const ratio = state.prices[item] / baseline;
    if (ratio <= 1) {
      return 1 + (1 - ratio) * 0.15;
    }
    return Math.max(0.6, 1 - (ratio - 1) * 0.25);
  }

  function sellFromInventory(item, wanted) {
    const sold = Math.min(wanted, state.inventory[item]);
    state.inventory[item] -= sold;
    return sold;
  }

  function getStaffStats() {
    if (state.staff.length === 0) {
      return {
        service: 0,
        quality: 0,
        avgMorale: 0,
        payroll: 0,
        avgFatigue: 0,
        activeCount: 0,
        unavailableCount: 0
      };
    }
    let service = 0;
    let quality = 0;
    let moraleTotal = 0;
    let payroll = 0;
    let fatigueTotal = 0;
    let activeCount = 0;
    let unavailableCount = 0;

    state.staff.forEach((person) => {
      moraleTotal += person.morale;
      payroll += person.wage;
      fatigueTotal += person.fatigue;
      if (isStaffUnavailable(person)) {
        unavailableCount += 1;
        return;
      }
      const moraleScale = 0.75 + person.morale / 200;
      const fatigueScale = clamp(1 - person.fatigue / 160, 0.45, 1);
      service += person.service * moraleScale * fatigueScale;
      quality += person.quality * moraleScale * fatigueScale;
      activeCount += 1;
    });

    return {
      service: Math.round(service),
      quality: Math.round(quality),
      avgMorale: moraleTotal / state.staff.length,
      payroll,
      avgFatigue: fatigueTotal / state.staff.length,
      activeCount,
      unavailableCount
    };
  }

  function getPatronMoodSnapshot() {
    const cohortTotals = {};
    for (const cohort in COHORT_PROFILES) {
      cohortTotals[cohort] = { sum: 0, count: 0 };
    }

    let allLoyalty = 0;
    state.patrons.forEach((patron) => {
      allLoyalty += patron.loyalty;
      cohortTotals[patron.cohort].sum += patron.loyalty;
      cohortTotals[patron.cohort].count += 1;
    });

    let topCohort = "locals";
    let lowCohort = "locals";
    let topLoyalty = -1;
    let lowLoyalty = 101;
    const cohortAverages = {};

    for (const cohort in cohortTotals) {
      const cohortData = cohortTotals[cohort];
      const average = cohortData.count === 0 ? 50 : cohortData.sum / cohortData.count;
      cohortAverages[cohort] = average;
      if (average > topLoyalty) {
        topLoyalty = average;
        topCohort = cohort;
      }
      if (average < lowLoyalty) {
        lowLoyalty = average;
        lowCohort = cohort;
      }
    }

    return {
      avgLoyalty: state.patrons.length === 0 ? 50 : allLoyalty / state.patrons.length,
      topCohort,
      lowCohort,
      cohortAverages
    };
  }

  function getLoyaltyDemandMultiplier() {
    const snapshot = getPatronMoodSnapshot();
    return clamp(0.86 + snapshot.avgLoyalty / 245, 0.88, 1.16);
  }

  function pickVisitingPatrons(visitorCount) {
    const shuffled = state.patrons.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const swapIndex = randInt(0, i);
      const temp = shuffled[i];
      shuffled[i] = shuffled[swapIndex];
      shuffled[swapIndex] = temp;
    }
    return shuffled.slice(0, Math.min(visitorCount, shuffled.length));
  }

  function updatePatronLoyalty(dayStats) {
    if (state.patrons.length === 0) {
      return {
        topCohort: "locals",
        lowCohort: "locals",
        topCohortLoyalty: 50,
        lowCohortLoyalty: 50,
        highlight: "No patron records are available yet."
      };
    }

    const visitorCount =
      dayStats.guests <= 0
        ? 0
        : Math.min(state.patrons.length, Math.max(5, Math.floor(dayStats.guests * 0.44)));
    const visitors = pickVisitingPatrons(visitorCount);

    let bestReaction = { patron: null, delta: -999 };
    let worstReaction = { patron: null, delta: 999 };

    visitors.forEach((patron) => {
      const profile = COHORT_PROFILES[patron.cohort];
      const wantedUnits = dayStats.wanted[patron.preference];
      const soldUnits = dayStats.sold[patron.preference];
      const fulfillment = wantedUnits <= 0 ? 1 : soldUnits / wantedUnits;
      const stockDelta = (fulfillment - 0.7) * 2.3;

      const priceRatio = state.prices[patron.preference] / PRICE_DEFAULTS[patron.preference];
      const priceDelta =
        priceRatio <= 1
          ? (1 - priceRatio) * 0.35
          : -(priceRatio - 1) * profile.priceSensitivity * 1.6;

      const qualityDelta = (dayStats.qualityScore - profile.qualityNeed) / 34;
      const noise = randInt(-4, 4) / 10;
      const loyaltyDelta = clamp(stockDelta + priceDelta + qualityDelta + noise, -2.8, 2.8);

      patron.loyalty = clamp(patron.loyalty + loyaltyDelta, 0, 100);
      patron.visits += 1;

      if (loyaltyDelta > bestReaction.delta) {
        bestReaction = { patron, delta: loyaltyDelta };
      }
      if (loyaltyDelta < worstReaction.delta) {
        worstReaction = { patron, delta: loyaltyDelta };
      }
    });

    const mood = getPatronMoodSnapshot();
    const topCohortLoyalty = Math.round(mood.cohortAverages[mood.topCohort]);
    const lowCohortLoyalty = Math.round(mood.cohortAverages[mood.lowCohort]);

    let highlight = "Patron sentiment stayed steady today.";
    if (visitors.length === 0) {
      highlight = "No guests arrived. Loyalty stayed unchanged.";
    } else if (bestReaction.patron && bestReaction.delta >= 0.9) {
      highlight = `${bestReaction.patron.name} (${COHORT_PROFILES[bestReaction.patron.cohort].label}) praised your ${PRODUCT_LABELS[bestReaction.patron.preference]}.`;
    } else if (worstReaction.patron && worstReaction.delta <= -0.9) {
      highlight = `${worstReaction.patron.name} (${COHORT_PROFILES[worstReaction.patron.cohort].label}) complained about your ${PRODUCT_LABELS[worstReaction.patron.preference]}.`;
    }

    return {
      topCohort: mood.topCohort,
      lowCohort: mood.lowCohort,
      topCohortLoyalty,
      lowCohortLoyalty,
      highlight
    };
  }

  function rollDailyEvent() {
    const mods = {
      demandMult: 1,
      flatGuests: 0,
      qualityBoost: 0,
      reputation: 0,
      expense: 0,
      cleanliness: 0,
      condition: 0
    };

    if (random.nextFloat() < 0.5) {
      return mods;
    }

    const event = pick([
      "traveling_bard",
      "guild_inspector",
      "bar_brawl",
      "merchant_caravan",
      "spoiled_cask",
      "noble_visit",
      "rainstorm"
    ]);

    switch (event) {
      case "traveling_bard":
        mods.demandMult *= 1.1;
        mods.reputation += 1;
        logLine("A traveling bard praised your tavern in the market.", "good");
        break;
      case "guild_inspector":
        if (state.cleanliness < 45 || state.condition < 45) {
          mods.expense += randInt(12, 28);
          mods.reputation -= 1;
          logLine("Guild inspector issued a fine for poor standards.", "bad");
        } else {
          mods.reputation += 1;
          logLine("Guild inspector approved your books and hygiene.", "good");
        }
        break;
      case "bar_brawl":
        mods.demandMult *= 0.88;
        mods.condition -= randInt(3, 7);
        mods.cleanliness -= randInt(3, 7);
        mods.reputation -= 1;
        logLine("A bar brawl damaged furniture and scared customers.", "bad");
        break;
      case "merchant_caravan":
        mods.flatGuests += randInt(12, 28);
        mods.demandMult *= 1.07;
        logLine("A merchant caravan arrived and flooded the commons.", "good");
        break;
      case "spoiled_cask":
        const lostAle = Math.min(state.inventory.ale, randInt(6, 14));
        state.inventory.ale -= lostAle;
        mods.reputation -= 1;
        logLine(`A spoiled cask forced you to dump ${lostAle} ale.`, "bad");
        break;
      case "noble_visit":
        mods.demandMult *= 1.08;
        mods.qualityBoost += 6;
        mods.reputation += 2;
        logLine("A minor noble dined here and spread favorable gossip.", "good");
        break;
      case "rainstorm":
        mods.demandMult *= 0.86;
        mods.cleanliness -= 3;
        logLine("Heavy rain reduced traffic and left muddy floors.", "bad");
        break;
      default:
        break;
    }
    return mods;
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
