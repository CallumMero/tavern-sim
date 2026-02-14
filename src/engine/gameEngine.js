import { createRandomController } from "./random.js";
import {
  DAY_NAMES,
  STARTING_LOCATION_PROFILES,
  WORLD_ACTOR_PROFILES,
  LOCATION_ACTOR_STANDING_BIAS,
  DISTRICT_PROFILES,
  DISTRICT_TRAVEL_LINKS,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  COHORT_PROFILES,
  PRODUCT_LABELS
} from "./config.js";
import {
  getScenarioFixture,
  listScenarioFixtures
} from "./scenarioFixtures.js";
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
import {
  rollDailyEvent as rollDailyEventModel,
  getEventCalendarOutlook as getEventCalendarOutlookModel
} from "./eventEngine.js";
import {
  demandByPrice as demandByPriceModel,
  sellFromInventory as sellFromInventoryModel
} from "./economyEngine.js";

const SAVE_SCHEMA_VERSION = 1;
const DEFAULT_STARTING_LOCATION = "arcanum";

const random = createRandomController();
const changeListeners = [];

function resolveStartingLocation(locationId) {
  if (typeof locationId === "string" && STARTING_LOCATION_PROFILES[locationId]) {
    return STARTING_LOCATION_PROFILES[locationId];
  }
  return STARTING_LOCATION_PROFILES[DEFAULT_STARTING_LOCATION];
}

function resolveDistrictForLocation(locationId) {
  const location = resolveStartingLocation(locationId);
  if (location.homeDistrictId && DISTRICT_PROFILES[location.homeDistrictId]) {
    return DISTRICT_PROFILES[location.homeDistrictId];
  }
  const fallbackDistrict = Object.values(DISTRICT_PROFILES).find(
    (district) => district.locationId === location.id
  );
  return fallbackDistrict || Object.values(DISTRICT_PROFILES)[0];
}

function resolveDistrict(districtId, fallbackLocationId = DEFAULT_STARTING_LOCATION) {
  if (typeof districtId === "string" && DISTRICT_PROFILES[districtId]) {
    return DISTRICT_PROFILES[districtId];
  }
  return resolveDistrictForLocation(fallbackLocationId);
}

function listStartingLocations() {
  return Object.values(STARTING_LOCATION_PROFILES).map((profile) => ({
    id: profile.id,
    label: profile.label,
    title: profile.title,
    summary: profile.summary
  }));
}

function listDistricts() {
  return Object.values(DISTRICT_PROFILES).map((district) => {
    const location = resolveStartingLocation(district.locationId);
    return {
      id: district.id,
      label: district.label,
      locationId: district.locationId,
      locationLabel: location.label,
      summary: district.summary,
      rivalTaverns: district.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      }))
    };
  });
}

function createWorldActors(locationId, districtId, currentActors = null) {
  const district = resolveDistrict(districtId, locationId);
  const locationBias = LOCATION_ACTOR_STANDING_BIAS[locationId] || {};
  const districtInfluence = district.actorInfluence || {};
  const actors = {};

  Object.values(WORLD_ACTOR_PROFILES).forEach((profile) => {
    const actorId = profile.id;
    const source = currentActors && typeof currentActors === "object" ? currentActors[actorId] : null;
    const sourceStanding = source && Number.isFinite(source.standing) ? source.standing : null;
    const sourceLastShift = source && Number.isFinite(source.lastShift) ? source.lastShift : 0;
    const baselineStanding = profile.baseStanding + (locationBias[actorId] || 0);
    const influence = profile.baseInfluence * (districtInfluence[actorId] || 1);

    actors[actorId] = {
      id: actorId,
      label: profile.label,
      summary: profile.summary,
      standing: Math.max(0, Math.min(100, Math.round(sourceStanding ?? baselineStanding))),
      influence: Math.max(5, Math.min(100, Math.round(influence))),
      lastShift: Math.max(-20, Math.min(20, Math.round(sourceLastShift)))
    };
  });

  return actors;
}

function createWorldEffectState(existing = null) {
  const input = existing && typeof existing === "object" ? existing : {};
  const readNumber = (key, fallback = 0) => {
    const value = Number(input[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    supplyCostDays: Math.max(0, Math.round(readNumber("supplyCostDays"))),
    supplyCostMult: Math.max(0.5, Math.min(1.7, readNumber("supplyCostMult", 1))),
    supplyReliabilityDays: Math.max(0, Math.round(readNumber("supplyReliabilityDays"))),
    supplyReliabilityMult: Math.max(0.45, Math.min(1.5, readNumber("supplyReliabilityMult", 1))),
    demandDays: Math.max(0, Math.round(readNumber("demandDays"))),
    demandMult: Math.max(0.7, Math.min(1.45, readNumber("demandMult", 1))),
    taxFlatDays: Math.max(0, Math.round(readNumber("taxFlatDays"))),
    taxFlatBonus: Math.max(-10, Math.min(35, Math.round(readNumber("taxFlatBonus")))),
    eventRiskDays: Math.max(0, Math.round(readNumber("eventRiskDays"))),
    eventChanceMult: Math.max(0.6, Math.min(1.6, readNumber("eventChanceMult", 1)))
  };
}

function normalizeCrownHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    type: typeof entry.type === "string" ? entry.type : "unknown",
    amount: Math.max(0, Math.round(Number(entry.amount) || 0)),
    status: typeof entry.status === "string" ? entry.status : "logged",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createCrownAuthorityState(existing = null) {
  const current = existing && typeof existing === "object" ? existing : {};
  const cadenceDays = Math.max(3, Math.min(14, Math.round(Number(current.cadenceDays) || 7)));
  const historyInput = Array.isArray(current.history) ? current.history : [];
  const history = historyInput
    .map((entry) => normalizeCrownHistoryEntry(entry))
    .filter(Boolean)
    .slice(0, 36);

  return {
    cadenceDays,
    nextCollectionDay: Math.max(cadenceDays, Math.round(Number(current.nextCollectionDay) || cadenceDays)),
    pendingTax: Math.max(0, Math.round(Number(current.pendingTax) || 0)),
    arrears: Math.max(0, Math.round(Number(current.arrears) || 0)),
    complianceScore: Math.max(0, Math.min(100, Math.round(Number(current.complianceScore) || 64))),
    lastAuditDay: Math.max(0, Math.round(Number(current.lastAuditDay) || 0)),
    auditPasses: Math.max(0, Math.round(Number(current.auditPasses) || 0)),
    auditFailures: Math.max(0, Math.round(Number(current.auditFailures) || 0)),
    history
  };
}

function getDistrictSupplyProfile(districtId) {
  if (districtId.includes("arcanum")) {
    if (districtId.includes("docks")) {
      return { stockMult: 1.24, priceBias: 1.06, restockMult: 1.2 };
    }
    return { stockMult: 1.16, priceBias: 1.14, restockMult: 1.1 };
  }
  if (districtId.includes("wharf")) {
    return { stockMult: 0.94, priceBias: 0.97, restockMult: 1.02 };
  }
  return { stockMult: 0.82, priceBias: 1, restockMult: 0.88 };
}

function createDistrictMarketStock(districtId, existingStock = null) {
  const profile = getDistrictSupplyProfile(districtId);
  const output = {};
  Object.keys(SUPPLY_META).forEach((item) => {
    const base =
      item === "wood"
        ? 42
        : item === "bread"
          ? 30
          : item === "honey"
            ? 20
            : 28;
    const next = existingStock && Number.isFinite(existingStock[item])
      ? Math.round(existingStock[item])
      : Math.round(base * profile.stockMult);
    output[item] = Math.max(0, Math.min(150, next));
  });
  return output;
}

function createSupplierNetworkState(existing = null, activeLocationId = DEFAULT_STARTING_LOCATION) {
  const current = existing && typeof existing === "object" ? existing : {};
  const baseVolatility = activeLocationId === "arcanum" ? 24 : 36;
  const markets = {};
  Object.values(DISTRICT_PROFILES).forEach((district) => {
    const currentMarket =
      current.markets && typeof current.markets === "object" ? current.markets[district.id] : null;
    const districtProfile = getDistrictSupplyProfile(district.id);
    const stock = createDistrictMarketStock(
      district.id,
      currentMarket && typeof currentMarket === "object" ? currentMarket.stock : null
    );
    markets[district.id] = {
      districtId: district.id,
      priceBias: Math.max(
        0.72,
        Math.min(
          1.5,
          Number(currentMarket && currentMarket.priceBias) || districtProfile.priceBias
        )
      ),
      restockMult: Math.max(
        0.55,
        Math.min(
          1.6,
          Number(currentMarket && currentMarket.restockMult) || districtProfile.restockMult
        )
      ),
      stock
    };
  });

  const contracts = current.contracts && typeof current.contracts === "object" ? current.contracts : {};
  const merchant = current.merchant && typeof current.merchant === "object" ? current.merchant : {};
  const caravan = current.caravan && typeof current.caravan === "object" ? current.caravan : {};
  const stockRun = current.stockRun && typeof current.stockRun === "object" ? current.stockRun : {};

  return {
    volatility: Math.max(5, Math.min(95, Math.round(Number(current.volatility) || baseVolatility))),
    markets,
    contracts: {
      localBrokerDays: Math.max(0, Math.round(Number(contracts.localBrokerDays) || 0)),
      arcanumWholesaleDays: Math.max(0, Math.round(Number(contracts.arcanumWholesaleDays) || 0))
    },
    merchant: {
      daysUntilVisit: Math.max(0, Math.round(Number(merchant.daysUntilVisit) || 4)),
      visitWindowDays: Math.max(0, Math.round(Number(merchant.visitWindowDays) || 0)),
      targetDistrict:
        typeof merchant.targetDistrict === "string" && DISTRICT_PROFILES[merchant.targetDistrict]
          ? merchant.targetDistrict
          : activeLocationId === "arcanum"
            ? "arcanum_market"
            : "meadowbrook_square"
    },
    caravan: {
      daysUntilWindow: Math.max(0, Math.round(Number(caravan.daysUntilWindow) || 3)),
      windowDays: Math.max(0, Math.round(Number(caravan.windowDays) || 0)),
      targetDistrict:
        typeof caravan.targetDistrict === "string" && DISTRICT_PROFILES[caravan.targetDistrict]
          ? caravan.targetDistrict
          : activeLocationId === "arcanum"
            ? "arcanum_docks"
            : "meadowbrook_wharf"
    },
    stockRun: {
      daysRemaining: Math.max(0, Math.round(Number(stockRun.daysRemaining) || 0)),
      targetDistrict:
        typeof stockRun.targetDistrict === "string" && DISTRICT_PROFILES[stockRun.targetDistrict]
          ? stockRun.targetDistrict
          : "arcanum_market",
      assignedStaffId: typeof stockRun.assignedStaffId === "string" ? stockRun.assignedStaffId : "",
      bundleScale: Math.max(0.8, Math.min(1.8, Number(stockRun.bundleScale) || 1))
    },
    lastSupplyEvent:
      typeof current.lastSupplyEvent === "string"
        ? current.lastSupplyEvent
        : "Markets stable. No active merchant windfall.",
    history: Array.isArray(current.history)
      ? current.history
          .filter((entry) => entry && typeof entry === "object")
          .slice(0, 32)
          .map((entry) => ({
            day: Math.max(1, Math.round(Number(entry.day) || 1)),
            type: typeof entry.type === "string" ? entry.type : "note",
            note: typeof entry.note === "string" ? entry.note : ""
          }))
      : []
  };
}

function normalizeActorEventEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    actorId: typeof entry.actorId === "string" ? entry.actorId : "",
    label: typeof entry.label === "string" ? entry.label : "",
    tone: entry.tone === "good" || entry.tone === "bad" ? entry.tone : "neutral",
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    summary: typeof entry.summary === "string" ? entry.summary : ""
  };
}

function listWorldActors() {
  normalizeWorldState();
  return Object.values(state.world.actors || {}).map((actor) => ({
    id: actor.id,
    label: actor.label,
    summary: actor.summary,
    standing: actor.standing,
    influence: actor.influence,
    lastShift: actor.lastShift
  }));
}

function getCrownAuthorityStatus() {
  normalizeWorldState();
  const crown = state.world.crown;
  return {
    cadenceDays: crown.cadenceDays,
    nextCollectionDay: crown.nextCollectionDay,
    pendingTax: crown.pendingTax,
    arrears: crown.arrears,
    complianceScore: crown.complianceScore,
    lastAuditDay: crown.lastAuditDay,
    auditPasses: crown.auditPasses,
    auditFailures: crown.auditFailures,
    history: crown.history.map((entry) => ({ ...entry }))
  };
}

function getSupplierNetworkStatus() {
  normalizeWorldState();
  const suppliers = state.world.suppliers;
  const districtId = state.world.currentDistrict;
  const market = suppliers.markets[districtId];
  const available = market ? market.stock : {};
  return {
    volatility: suppliers.volatility,
    contracts: { ...suppliers.contracts },
    merchant: { ...suppliers.merchant },
    caravan: { ...suppliers.caravan },
    stockRun: { ...suppliers.stockRun },
    lastSupplyEvent: suppliers.lastSupplyEvent,
    market: {
      districtId,
      priceBias: market ? market.priceBias : 1,
      restockMult: market ? market.restockMult : 1,
      available: { ...available }
    },
    history: suppliers.history.map((entry) => ({ ...entry }))
  };
}

function normalizeRivalHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    districtId:
      typeof entry.districtId === "string" && DISTRICT_PROFILES[entry.districtId]
        ? entry.districtId
        : "arcanum_market",
    tone: entry.tone === "good" || entry.tone === "bad" ? entry.tone : "neutral",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createDistrictRivalState(district, existingDistrictState = null) {
  const current = existingDistrictState && typeof existingDistrictState === "object" ? existingDistrictState : {};
  const byId = {};
  if (Array.isArray(current.taverns)) {
    current.taverns.forEach((entry) => {
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        byId[entry.id] = entry;
      }
    });
  }

  const taverns = district.rivalTaverns.map((rival) => {
    const source = byId[rival.id] || {};
    const basePressure = clamp(Number(rival.pressure) || 0.08, 0.03, 0.6);
    const defaultPressure = clamp(basePressure + randInt(-2, 2) / 200, 0.02, 0.62);
    return {
      id: rival.id,
      name: rival.name,
      basePressure,
      currentPressure: clamp(Number(source.currentPressure) || defaultPressure, 0.02, 0.7),
      priceAggression: clamp(Math.round(Number(source.priceAggression) || (44 + basePressure * 95)), 5, 95),
      reputationHeat: clamp(Math.round(Number(source.reputationHeat) || (42 + basePressure * 90)), 5, 95),
      momentum: clamp(Math.round(Number(source.momentum) || 0), -20, 20),
      lastMove: typeof source.lastMove === "string" ? source.lastMove : "Quiet service day."
    };
  });

  const avgBasePressure =
    taverns.length > 0 ? taverns.reduce((sum, tavern) => sum + tavern.basePressure, 0) / taverns.length : 0;
  const demandPressure = clamp(
    Number(current.demandPressure) || avgBasePressure,
    0,
    0.75
  );
  const pricePressure = clamp(
    Number(current.pricePressure) || avgBasePressure * 0.7,
    0,
    0.72
  );
  const reputationPressure = clamp(
    Number(current.reputationPressure) || avgBasePressure * 0.55,
    0,
    0.56
  );
  const lastEvent =
    typeof current.lastEvent === "string"
      ? current.lastEvent
      : "Rival taverns held steady. No direct pressure swing today.";

  return {
    districtId: district.id,
    taverns,
    demandPressure,
    pricePressure,
    reputationPressure,
    lastEvent
  };
}

function createRivalSimulationState(existing = null, activeDistrictId = "arcanum_market") {
  const current = existing && typeof existing === "object" ? existing : {};
  const sourceDistricts = current.districts && typeof current.districts === "object" ? current.districts : {};
  const districts = {};

  Object.values(DISTRICT_PROFILES).forEach((district) => {
    districts[district.id] = createDistrictRivalState(district, sourceDistricts[district.id]);
  });

  const resolvedDistrictId =
    typeof activeDistrictId === "string" && districts[activeDistrictId]
      ? activeDistrictId
      : Object.keys(districts)[0];
  const activeDistrict = districts[resolvedDistrictId];
  const lastRivalEvent =
    typeof current.lastRivalEvent === "string" && current.lastRivalEvent.length > 0
      ? current.lastRivalEvent
      : activeDistrict.lastEvent;
  const history = Array.isArray(current.history)
    ? current.history
        .map((entry) => normalizeRivalHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 48)
    : [];

  return {
    activeDistrictId: resolvedDistrictId,
    districts,
    lastRivalEvent,
    history
  };
}

function getRivalStatus() {
  normalizeWorldState();
  const rivals = state.world.rivals;
  const districtId = state.world.currentDistrict;
  const districtState = rivals.districts[districtId];
  return {
    districtId,
    lastRivalEvent: rivals.lastRivalEvent,
    demandPressure: districtState ? districtState.demandPressure : 0,
    pricePressure: districtState ? districtState.pricePressure : 0,
    reputationPressure: districtState ? districtState.reputationPressure : 0,
    taverns: districtState ? districtState.taverns.map((entry) => ({ ...entry })) : [],
    history: rivals.history.map((entry) => ({ ...entry }))
  };
}

function recordRivalHistory(note, tone = "neutral") {
  const rivals = state.world.rivals;
  rivals.history.unshift({
    day: state.day,
    districtId: state.world.currentDistrict,
    tone: tone === "good" || tone === "bad" ? tone : "neutral",
    note: typeof note === "string" ? note : ""
  });
  if (rivals.history.length > 48) {
    rivals.history.length = 48;
  }
}

function progressRivalTavernSimulation() {
  normalizeWorldState();
  const worldActors = getWorldActors();
  const rivals = state.world.rivals;
  const districtId = state.world.currentDistrict;
  const districtState = rivals.districts[districtId];

  if (!districtState || districtState.taverns.length === 0) {
    const summary = "No established rival taverns in this district.";
    rivals.activeDistrictId = districtId;
    rivals.lastRivalEvent = summary;
    return summary;
  }

  const merchants = worldActors.merchant_houses;
  const council = worldActors.civic_council;
  const merchantTension = merchants ? clamp((52 - merchants.standing) / 100, -0.18, 0.28) : 0;
  const councilTension = council ? clamp((50 - council.standing) / 100, -0.15, 0.24) : 0;

  let demandAction = 0;
  let priceAction = 0;
  let reputationAction = 0;
  let badMoves = 0;
  let goodMoves = 0;
  let strongestMove = { weight: -1, text: "", tone: "neutral" };

  districtState.taverns.forEach((tavern) => {
    const momentumDrift =
      randInt(-6, 6) +
      Math.round(merchantTension * 12) +
      Math.round(councilTension * 8);
    tavern.momentum = clamp(tavern.momentum + momentumDrift, -20, 20);
    tavern.currentPressure = clamp(
      tavern.basePressure + tavern.momentum / 220 + randInt(-4, 4) / 240,
      0.02,
      0.72
    );

    const actionChance = clamp(
      0.2 + tavern.currentPressure * 0.84 + Math.max(0, merchantTension) * 0.16,
      0.12,
      0.78
    );
    if (random.nextFloat() > actionChance) {
      tavern.lastMove = "Quiet service day.";
      return;
    }

    const roll = random.nextFloat();
    let weight = 0;
    let moveText = "";
    let tone = "neutral";

    if (roll < 0.34) {
      const intensity = clamp(tavern.currentPressure + randInt(2, 8) / 100, 0.06, 0.34);
      demandAction += intensity * 0.42;
      priceAction += intensity * 0.66;
      tavern.priceAggression = clamp(tavern.priceAggression + randInt(5, 11), 5, 95);
      tavern.reputationHeat = clamp(tavern.reputationHeat + randInt(-2, 3), 5, 95);
      moveText = `${tavern.name} launched a discount blitz across nearby streets.`;
      tavern.lastMove = "Discount blitz";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else if (roll < 0.62) {
      const intensity = clamp(tavern.currentPressure + randInt(1, 7) / 100, 0.05, 0.3);
      demandAction += intensity * 0.58;
      tavern.momentum = clamp(tavern.momentum + randInt(1, 4), -20, 20);
      moveText = `${tavern.name} staged a noisy showcase and pulled extra footfall.`;
      tavern.lastMove = "Street showcase";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else if (roll < 0.84) {
      const intensity = clamp(tavern.currentPressure + randInt(1, 6) / 120, 0.04, 0.26);
      reputationAction += intensity * 0.72;
      tavern.reputationHeat = clamp(tavern.reputationHeat + randInt(6, 12), 5, 95);
      moveText = `${tavern.name} pushed rumor chatter to challenge your standing.`;
      tavern.lastMove = "Rumor campaign";
      badMoves += 1;
      tone = "bad";
      weight = intensity;
    } else {
      const stumble = clamp(tavern.currentPressure + randInt(2, 7) / 120, 0.05, 0.28);
      demandAction -= stumble * 0.4;
      priceAction -= stumble * 0.26;
      reputationAction -= stumble * 0.22;
      tavern.momentum = clamp(tavern.momentum - randInt(3, 7), -20, 20);
      tavern.reputationHeat = clamp(tavern.reputationHeat - randInt(5, 10), 5, 95);
      moveText = `${tavern.name} suffered a rough service run and lost momentum.`;
      tavern.lastMove = "Service stumble";
      goodMoves += 1;
      tone = "good";
      weight = stumble;
    }

    if (weight > strongestMove.weight) {
      strongestMove = { weight, text: moveText, tone };
    }
  });

  const avgPressure =
    districtState.taverns.reduce((sum, tavern) => sum + tavern.currentPressure, 0) /
    Math.max(1, districtState.taverns.length);
  districtState.demandPressure = clamp(avgPressure * 0.74 + demandAction, 0.02, 0.76);
  districtState.pricePressure = clamp(avgPressure * 0.56 + priceAction + districtState.demandPressure * 0.14, 0, 0.74);
  districtState.reputationPressure = clamp(avgPressure * 0.42 + reputationAction, 0, 0.56);

  let summary = "";
  let tone = "neutral";
  if (strongestMove.weight > 0) {
    if (badMoves > goodMoves) {
      summary = `Rival pressure rising in ${resolveDistrict(districtId).label}: ${strongestMove.text}`;
      tone = "bad";
    } else if (goodMoves > badMoves) {
      summary = `Rival setback in ${resolveDistrict(districtId).label}: ${strongestMove.text}`;
      tone = "good";
    } else {
      summary = `Rival climate mixed: ${strongestMove.text}`;
      tone = strongestMove.tone;
    }
  } else if (districtState.demandPressure >= 0.4) {
    summary = "Rival taverns maintained heavy pressure, but no single move dominated the day.";
    tone = "bad";
  } else {
    summary = "Rival taverns held steady. No direct pressure swing today.";
    tone = "neutral";
  }

  districtState.lastEvent = summary;
  rivals.activeDistrictId = districtId;
  rivals.lastRivalEvent = summary;
  recordRivalHistory(summary, tone);
  if (tone !== "neutral") {
    logLine(summary, tone);
  }
  return summary;
}

function normalizeReputationHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    day: Math.max(1, Math.round(Number(entry.day) || 1)),
    type: typeof entry.type === "string" ? entry.type : "daily",
    note: typeof entry.note === "string" ? entry.note : ""
  };
}

function createWorldReputationState(existing = null, locationId = DEFAULT_STARTING_LOCATION, actors = null, crownCompliance = 64) {
  const current = existing && typeof existing === "object" ? existing : {};
  const existingCohorts = current.cohorts && typeof current.cohorts === "object" ? current.cohorts : {};
  const baseCohorts =
    locationId === "arcanum"
      ? { locals: 48, merchants: 56, nobles: 58, adventurers: 52 }
      : { locals: 56, merchants: 47, nobles: 45, adventurers: 50 };

  const cohorts = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    const fallback = Number(baseCohorts[cohortId] || 50);
    const source = Number(existingCohorts[cohortId]);
    cohorts[cohortId] = clamp(Math.round(Number.isFinite(source) ? source : fallback), 0, 100);
  });

  const existingGroups = current.groups && typeof current.groups === "object" ? current.groups : {};
  const groups = {};
  Object.values(WORLD_ACTOR_PROFILES).forEach((actorProfile) => {
    const actorId = actorProfile.id;
    const source = existingGroups[actorId] && typeof existingGroups[actorId] === "object" ? existingGroups[actorId] : {};
    const actorStanding =
      actors &&
      actors[actorId] &&
      Number.isFinite(actors[actorId].standing)
        ? actors[actorId].standing
        : 50;
    const fallbackScore =
      actorId === "crown_office"
        ? Math.round(actorStanding * 0.62 + Number(crownCompliance || 64) * 0.38)
        : actorStanding;
    groups[actorId] = {
      score: clamp(Math.round(Number(source.score) || fallbackScore), 0, 100),
      lastShift: clamp(Math.round(Number(source.lastShift) || 0), -20, 20)
    };
  });

  const complianceStandingSource = Number(current.crownComplianceStanding);
  const crownComplianceStanding = clamp(
    Math.round(Number.isFinite(complianceStandingSource) ? complianceStandingSource : Number(crownCompliance || 64)),
    0,
    100
  );

  const history = Array.isArray(current.history)
    ? current.history
        .map((entry) => normalizeReputationHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 48)
    : [];

  return {
    cohorts,
    groups,
    crownComplianceStanding,
    lastSummary:
      typeof current.lastSummary === "string"
        ? current.lastSummary
        : "World reputation baseline set. Cohorts and group standings are stable.",
    history
  };
}

function normalizeWorldWeeklyHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    week: Math.max(1, Math.round(Number(entry.week) || 1)),
    startDay: Math.max(1, Math.round(Number(entry.startDay) || 1)),
    endDay: Math.max(1, Math.round(Number(entry.endDay) || 1)),
    avgGuests: Math.max(0, Math.round(Number(entry.avgGuests) || 0)),
    avgNet: Math.round(Number(entry.avgNet) || 0),
    crownTaxAccrued: Math.max(0, Math.round(Number(entry.crownTaxAccrued) || 0)),
    crownTaxPaid: Math.max(0, Math.round(Number(entry.crownTaxPaid) || 0)),
    eventfulDays: Math.max(0, Math.min(7, Math.round(Number(entry.eventfulDays) || 0))),
    supplierStrainDays: Math.max(0, Math.min(7, Math.round(Number(entry.supplierStrainDays) || 0))),
    rivalHighPressureDays: Math.max(0, Math.min(7, Math.round(Number(entry.rivalHighPressureDays) || 0))),
    avgCompliance: Math.max(0, Math.min(100, Math.round(Number(entry.avgCompliance) || 0))),
    avgSupplierVolatility: Math.max(0, Math.min(100, Math.round(Number(entry.avgSupplierVolatility) || 0))),
    summary: typeof entry.summary === "string" ? entry.summary : ""
  };
}

function createWorldReportingState(existing = null, currentDay = 1) {
  const day = Math.max(1, Math.round(Number(currentDay) || 1));
  const current = existing && typeof existing === "object" ? existing : {};
  const rolling = current.rollingWeek && typeof current.rollingWeek === "object" ? current.rollingWeek : {};
  const inferredStart = Math.max(1, day - ((day - 1) % 7));
  const startDay = Math.max(1, Math.round(Number(rolling.startDay) || inferredStart));
  const days = Math.max(0, Math.min(7, Math.round(Number(rolling.days) || 0)));

  const weeklyHistory = Array.isArray(current.weeklyHistory)
    ? current.weeklyHistory
        .map((entry) => normalizeWorldWeeklyHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    rollingWeek: {
      startDay,
      days,
      guestTotal: Math.max(0, Math.round(Number(rolling.guestTotal) || 0)),
      netTotal: Math.round(Number(rolling.netTotal) || 0),
      crownTaxAccruedTotal: Math.max(0, Math.round(Number(rolling.crownTaxAccruedTotal) || 0)),
      crownTaxPaidTotal: Math.max(0, Math.round(Number(rolling.crownTaxPaidTotal) || 0)),
      eventfulDays: Math.max(0, Math.min(7, Math.round(Number(rolling.eventfulDays) || 0))),
      supplierStrainDays: Math.max(0, Math.min(7, Math.round(Number(rolling.supplierStrainDays) || 0))),
      rivalHighPressureDays: Math.max(0, Math.min(7, Math.round(Number(rolling.rivalHighPressureDays) || 0))),
      complianceTotal: Math.max(0, Math.round(Number(rolling.complianceTotal) || 0)),
      supplierVolatilityTotal: Math.max(0, Math.round(Number(rolling.supplierVolatilityTotal) || 0))
    },
    weeklyHistory,
    lastWeeklySummary:
      typeof current.lastWeeklySummary === "string"
        ? current.lastWeeklySummary
        : "Week in progress. No world-layer weekly summary published yet."
  };
}

function updateWorldReportingState(daySnapshot) {
  const reporting = state.world.reporting;
  const rolling = reporting.rollingWeek;
  if (rolling.days === 0 && rolling.startDay > state.day) {
    rolling.startDay = state.day;
  }
  if (rolling.days >= 7) {
    rolling.startDay = state.day;
    rolling.days = 0;
    rolling.guestTotal = 0;
    rolling.netTotal = 0;
    rolling.crownTaxAccruedTotal = 0;
    rolling.crownTaxPaidTotal = 0;
    rolling.eventfulDays = 0;
    rolling.supplierStrainDays = 0;
    rolling.rivalHighPressureDays = 0;
    rolling.complianceTotal = 0;
    rolling.supplierVolatilityTotal = 0;
  }

  rolling.guestTotal += Math.max(0, Math.round(Number(daySnapshot.guests) || 0));
  rolling.netTotal += Math.round(Number(daySnapshot.net) || 0);
  rolling.crownTaxAccruedTotal += Math.max(0, Math.round(Number(daySnapshot.crownTaxAccrued) || 0));
  rolling.crownTaxPaidTotal += Math.max(0, Math.round(Number(daySnapshot.crownTaxPaid) || 0));
  rolling.complianceTotal += Math.max(0, Math.round(Number(daySnapshot.compliance) || 0));
  rolling.supplierVolatilityTotal += Math.max(0, Math.round(Number(daySnapshot.supplierVolatility) || 0));
  if (daySnapshot.eventSummary && !daySnapshot.eventSummary.includes("No major district or calendar event")) {
    rolling.eventfulDays += 1;
  }
  if (daySnapshot.supplierVolatility >= 68 || (daySnapshot.supplierSummary || "").includes("thin")) {
    rolling.supplierStrainDays += 1;
  }
  if (daySnapshot.rivalPressure >= 38) {
    rolling.rivalHighPressureDays += 1;
  }
  rolling.days += 1;

  const avgNet = Math.round(rolling.netTotal / Math.max(1, rolling.days));
  const avgGuests = Math.round(rolling.guestTotal / Math.max(1, rolling.days));
  const avgCompliance = Math.round(rolling.complianceTotal / Math.max(1, rolling.days));
  const avgSupplierVolatility = Math.round(rolling.supplierVolatilityTotal / Math.max(1, rolling.days));

  if (rolling.days >= 7) {
    const weekNumber =
      reporting.weeklyHistory.length > 0
        ? reporting.weeklyHistory[0].week + 1
        : 1;
    const summary =
      `Week ${weekNumber} (D${rolling.startDay}-D${state.day}): avg ${avgGuests} guests/day, avg net ${formatCoin(avgNet)}, ` +
      `Crown accrued ${formatCoin(rolling.crownTaxAccruedTotal)} paid ${formatCoin(rolling.crownTaxPaidTotal)}, ` +
      `${rolling.eventfulDays} eventful days, supplier strain ${rolling.supplierStrainDays}d, rival pressure ${rolling.rivalHighPressureDays}d.`;
    reporting.weeklyHistory.unshift({
      week: weekNumber,
      startDay: rolling.startDay,
      endDay: state.day,
      avgGuests,
      avgNet,
      crownTaxAccrued: rolling.crownTaxAccruedTotal,
      crownTaxPaid: rolling.crownTaxPaidTotal,
      eventfulDays: rolling.eventfulDays,
      supplierStrainDays: rolling.supplierStrainDays,
      rivalHighPressureDays: rolling.rivalHighPressureDays,
      avgCompliance,
      avgSupplierVolatility,
      summary
    });
    if (reporting.weeklyHistory.length > 20) {
      reporting.weeklyHistory.length = 20;
    }
    reporting.lastWeeklySummary = summary;

    rolling.startDay = state.day + 1;
    rolling.days = 0;
    rolling.guestTotal = 0;
    rolling.netTotal = 0;
    rolling.crownTaxAccruedTotal = 0;
    rolling.crownTaxPaidTotal = 0;
    rolling.eventfulDays = 0;
    rolling.supplierStrainDays = 0;
    rolling.rivalHighPressureDays = 0;
    rolling.complianceTotal = 0;
    rolling.supplierVolatilityTotal = 0;

    return { weeklySummary: summary, weekClosed: true };
  }

  const progressSummary =
    `Week in progress (${rolling.days}/7): avg ${avgGuests} guests/day, avg net ${formatCoin(avgNet)}, ` +
    `events ${rolling.eventfulDays}d, supplier strain ${rolling.supplierStrainDays}d, rival pressure ${rolling.rivalHighPressureDays}d.`;
  reporting.lastWeeklySummary = progressSummary;
  return { weeklySummary: progressSummary, weekClosed: false };
}

function getWorldReputationStatus() {
  normalizeWorldState();
  const model = state.world.reputationModel;
  return {
    cohorts: { ...model.cohorts },
    groups: Object.fromEntries(
      Object.entries(model.groups).map(([actorId, entry]) => [actorId, { ...entry }])
    ),
    crownComplianceStanding: model.crownComplianceStanding,
    lastSummary: model.lastSummary,
    history: model.history.map((entry) => ({ ...entry }))
  };
}

function getWorldLayerStatus(options = null) {
  normalizeWorldState();
  const world = state.world;
  const report = state.lastReport || {};
  const locationProfile = getActiveLocationProfile();
  const districtProfile = getCurrentDistrictProfile();
  const worldMods = getWorldRuntimeModifiers();
  const crown = getCrownAuthorityStatus();
  const suppliers = getSupplierNetworkStatus();
  const rivals = getRivalStatus();
  const reputation = getWorldReputationStatus();
  const resolvedOptions = options && typeof options === "object" ? options : {};
  const outlookDays = Math.max(3, Math.min(14, Math.round(Number(resolvedOptions.outlookDays) || 7)));
  const eventCalendarOutlook = getEventCalendarOutlookModel(state, {
    days: outlookDays,
    startOffset: 1,
    eventChanceMult: clamp(
      locationProfile.eventChanceMult * districtProfile.eventChanceMult * worldMods.eventChanceMult,
      0.25,
      2.5
    ),
    eventWeights: locationProfile.eventWeights
  });
  return {
    day: state.day,
    contractVersion: 1,
    location: {
      id: world.activeLocation,
      label: world.locationLabel
    },
    district: {
      id: world.currentDistrict,
      label: world.currentDistrictLabel
    },
    travel: {
      daysRemaining: world.travelDaysRemaining,
      destinationId: world.travelDestination,
      destinationLabel: world.travelDestinationLabel
    },
    today: {
      events: report.events || "",
      actorEvent: report.actorEvent || "",
      supplierSummary: report.supplierSummary || "",
      rivalSummary: report.rivalSummary || "",
      reputationSummary: report.reputationSummary || "",
      crownSummary: report.crownSummary || "",
      worldLayerSummary: report.worldLayerSummary || "",
      weeklyWorldSummary: report.weeklyWorldSummary || world.reporting.lastWeeklySummary
    },
    handoffContract: {
      version: 1,
      generatedAtDay: state.day,
      locationProfile: {
        id: locationProfile.id,
        label: locationProfile.label,
        title: locationProfile.title,
        demandMult: locationProfile.demandMult,
        eventChanceMult: locationProfile.eventChanceMult,
        taxRate: locationProfile.taxRate,
        taxFlat: locationProfile.taxFlat,
        supplyCostMult: locationProfile.supplyCostMult,
        supplyQuantityMult: locationProfile.supplyQuantityMult,
        supplyReliability: locationProfile.supplyReliability
      },
      taxesCompliance: {
        cadenceDays: crown.cadenceDays,
        nextCollectionDay: crown.nextCollectionDay,
        pendingTax: crown.pendingTax,
        arrears: crown.arrears,
        complianceScore: crown.complianceScore,
        lastAuditDay: crown.lastAuditDay,
        auditPasses: crown.auditPasses,
        auditFailures: crown.auditFailures,
        currentTaxRate: clamp(locationProfile.taxRate + worldMods.taxRateBonus, 0.03, 0.36),
        currentTaxFlat: Math.max(0, locationProfile.taxFlat + worldMods.taxFlatBonus)
      },
      eventCalendarOutlook,
      supplierLogistics: {
        volatility: suppliers.volatility,
        contracts: { ...suppliers.contracts },
        merchant: { ...suppliers.merchant },
        caravan: { ...suppliers.caravan },
        stockRun: { ...suppliers.stockRun },
        market: {
          districtId: suppliers.market.districtId,
          priceBias: suppliers.market.priceBias,
          restockMult: suppliers.market.restockMult,
          available: { ...suppliers.market.available }
        },
        lastSupplyEvent: suppliers.lastSupplyEvent
      },
      rivalPressure: {
        districtId: rivals.districtId,
        demandPressure: rivals.demandPressure,
        pricePressure: rivals.pricePressure,
        reputationPressure: rivals.reputationPressure,
        activeRivals: rivals.taverns.map((entry) => ({
          id: entry.id,
          name: entry.name,
          currentPressure: entry.currentPressure,
          priceAggression: entry.priceAggression,
          reputationHeat: entry.reputationHeat,
          momentum: entry.momentum
        })),
        lastRivalEvent: rivals.lastRivalEvent
      },
      reputationStandings: {
        cohorts: { ...reputation.cohorts },
        groups: Object.fromEntries(
          Object.entries(reputation.groups).map(([groupId, entry]) => [groupId, { ...entry }])
        ),
        crownComplianceStanding: reputation.crownComplianceStanding,
        lastSummary: reputation.lastSummary
      }
    },
    reporting: {
      lastWeeklySummary: world.reporting.lastWeeklySummary,
      rollingWeek: { ...world.reporting.rollingWeek },
      weeklyHistory: world.reporting.weeklyHistory.map((entry) => ({ ...entry }))
    }
  };
}

function getCohortLoyaltyAverages() {
  const output = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    output[cohortId] = 50;
  });
  const buckets = {};
  Object.keys(COHORT_PROFILES).forEach((cohortId) => {
    buckets[cohortId] = { sum: 0, count: 0 };
  });
  (state.patrons || []).forEach((patron) => {
    if (!patron || !buckets[patron.cohort]) {
      return;
    }
    buckets[patron.cohort].sum += Number(patron.loyalty) || 0;
    buckets[patron.cohort].count += 1;
  });
  Object.keys(buckets).forEach((cohortId) => {
    const bucket = buckets[cohortId];
    output[cohortId] = bucket.count > 0 ? bucket.sum / bucket.count : 50;
  });
  return output;
}

function applyWorldReputationModelDayUpdate(args = {}) {
  const model = state.world.reputationModel;
  const actors = state.world.actors || {};
  const crown = state.world.crown || { complianceScore: 64 };
  const cohortLoyalty = getCohortLoyaltyAverages();
  const satisfaction = Number(args.satisfaction) || 0.6;
  const net = Number(args.net) || 0;
  const rivalPressure = Number(args.rivalPressure) || 0;
  const supplierVolatility = Number(args.supplierVolatility) || 30;
  const collectionResult = args.collectionResult || { reputationDelta: 0 };
  const auditResult = args.auditResult || { reputationDelta: 0 };

  Object.keys(model.cohorts).forEach((cohortId) => {
    const current = model.cohorts[cohortId];
    const loyaltyTarget = Number(cohortLoyalty[cohortId] || 50);
    let delta = Math.round((loyaltyTarget - current) * 0.24);
    if (satisfaction >= 0.72) {
      delta += 1;
    } else if (satisfaction <= 0.5) {
      delta -= 1;
    }
    if (rivalPressure >= 0.35 && (cohortId === "locals" || cohortId === "adventurers")) {
      delta -= 1;
    }
    if (cohortId === "merchants" && net > 0) {
      delta += 1;
    }
    if (cohortId === "nobles" && state.cleanliness >= 70 && state.condition >= 70) {
      delta += 1;
    }
    model.cohorts[cohortId] = clamp(current + delta, 0, 100);
  });

  Object.values(WORLD_ACTOR_PROFILES).forEach((actorProfile) => {
    const actorId = actorProfile.id;
    const group = model.groups[actorId] || { score: 50, lastShift: 0 };
    const actorStanding = actors[actorId] && Number.isFinite(actors[actorId].standing) ? actors[actorId].standing : 50;
    let target = actorStanding;
    if (actorId === "crown_office") {
      target = actorStanding * 0.62 + crown.complianceScore * 0.38;
    } else if (actorId === "merchant_houses") {
      target += net > 0 ? 2 : -2;
      target += supplierVolatility >= 65 ? -2 : 1;
    } else if (actorId === "civic_council") {
      if (state.cleanliness < 45 || state.condition < 45) {
        target -= 4;
      } else if (satisfaction >= 0.68) {
        target += 2;
      }
    } else if (actorId === "underworld_network") {
      if (state.cleanliness < 35 || state.condition < 35) {
        target += 3;
      } else if (satisfaction >= 0.7) {
        target -= 1;
      }
    }
    target += Math.round((Number(collectionResult.reputationDelta) || 0) * (actorId === "crown_office" ? 1.5 : 0.4));
    target += Math.round((Number(auditResult.reputationDelta) || 0) * (actorId === "crown_office" ? 2 : 0.3));
    const nextScore = clamp(Math.round(group.score * 0.74 + target * 0.26), 0, 100);
    group.lastShift = clamp(nextScore - group.score, -20, 20);
    group.score = nextScore;
    model.groups[actorId] = group;
  });

  model.crownComplianceStanding = clamp(
    Math.round(model.crownComplianceStanding * 0.55 + crown.complianceScore * 0.45),
    0,
    100
  );

  const rankedCohorts = Object.entries(model.cohorts).sort((a, b) => b[1] - a[1]);
  const topCohort = rankedCohorts[0] || ["locals", 50];
  const lowCohort = rankedCohorts[rankedCohorts.length - 1] || ["locals", 50];
  const rankedGroups = Object.entries(model.groups).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  const topGroup = rankedGroups[0] || ["crown_office", { score: 50 }];
  const lowGroup = rankedGroups[rankedGroups.length - 1] || ["underworld_network", { score: 50 }];
  const topGroupLabel = WORLD_ACTOR_PROFILES[topGroup[0]] ? WORLD_ACTOR_PROFILES[topGroup[0]].label : topGroup[0];
  const lowGroupLabel = WORLD_ACTOR_PROFILES[lowGroup[0]] ? WORLD_ACTOR_PROFILES[lowGroup[0]].label : lowGroup[0];
  const topCohortLabel = COHORT_PROFILES[topCohort[0]] ? COHORT_PROFILES[topCohort[0]].label : topCohort[0];
  const lowCohortLabel = COHORT_PROFILES[lowCohort[0]] ? COHORT_PROFILES[lowCohort[0]].label : lowCohort[0];

  const summary =
    `${topCohortLabel} standing ${Math.round(topCohort[1])}, ${lowCohortLabel} standing ${Math.round(lowCohort[1])}. ` +
    `${topGroupLabel} ${Math.round(topGroup[1].score)}, ${lowGroupLabel} ${Math.round(lowGroup[1].score)}. ` +
    `Crown compliance standing ${model.crownComplianceStanding}.`;
  model.lastSummary = summary;
  model.history.unshift({
    day: state.day,
    type: "daily",
    note: summary
  });
  if (model.history.length > 48) {
    model.history.length = 48;
  }

  return {
    summary,
    topCohortLabel,
    topCohortScore: Math.round(topCohort[1]),
    lowCohortLabel,
    lowCohortScore: Math.round(lowCohort[1]),
    topGroupLabel,
    topGroupScore: Math.round(topGroup[1].score),
    lowGroupLabel,
    lowGroupScore: Math.round(lowGroup[1].score),
    crownComplianceStanding: model.crownComplianceStanding
  };
}

function recordSupplierHistory(type, note) {
  const suppliers = state.world.suppliers;
  suppliers.history.unshift({
    day: state.day,
    type: typeof type === "string" ? type : "note",
    note: typeof note === "string" ? note : ""
  });
  if (suppliers.history.length > 32) {
    suppliers.history.length = 32;
  }
}

function getSupplierCurrentMarket() {
  const world = state.world && typeof state.world === "object" ? state.world : null;
  if (!world || !world.suppliers || !world.suppliers.markets) {
    return null;
  }
  return world.suppliers.markets[world.currentDistrict] || null;
}

function isMerchantWindowActiveForDistrict(suppliers, districtId) {
  return Boolean(
    suppliers &&
    suppliers.merchant &&
    suppliers.merchant.visitWindowDays > 0 &&
    suppliers.merchant.targetDistrict === districtId
  );
}

function isCaravanWindowActiveForDistrict(suppliers, districtId) {
  return Boolean(
    suppliers &&
    suppliers.caravan &&
    suppliers.caravan.windowDays > 0 &&
    suppliers.caravan.targetDistrict === districtId
  );
}

function getSupplierVolatilityCostMult(volatility) {
  return clamp(0.8 + (Math.max(0, volatility) / 100) * 0.48, 0.78, 1.36);
}

function getSupplierContractCostMult(suppliers, districtId) {
  let multiplier = 1;
  if (suppliers.contracts.localBrokerDays > 0) {
    multiplier *= 0.92;
  }
  if (suppliers.contracts.arcanumWholesaleDays > 0) {
    multiplier *= districtId.startsWith("arcanum") ? 0.82 : 0.9;
  }
  return clamp(multiplier, 0.72, 1);
}

function mergeIncomingSupplyStats(item, incomingAmount, incomingQuality, incomingFreshness) {
  if (!isSupplyItem(item) || incomingAmount <= 0) {
    return;
  }
  const oldQty = state.inventory[item];
  state.inventory[item] += incomingAmount;
  const nextQty = state.inventory[item];
  state.supplyStats[item].quality = Math.round(
    (state.supplyStats[item].quality * oldQty + incomingQuality * incomingAmount) / Math.max(1, nextQty)
  );
  state.supplyStats[item].freshness = Math.round(
    (state.supplyStats[item].freshness * oldQty + incomingFreshness * incomingAmount) / Math.max(1, nextQty)
  );
}

function buildCityStockRunBundle(bundleScale, volatility, contractBoost = 1) {
  const scale = Math.max(0.8, Math.min(1.8, Number(bundleScale) || 1));
  const template = {
    grain: 14,
    hops: 12,
    honey: 7,
    meat: 9,
    veg: 12,
    bread: 12,
    wood: 15
  };

  return Object.entries(template).map(([item, baseAmount]) => {
    const amount = Math.max(1, Math.round(baseAmount * scale + randInt(-2, 2)));
    const meta = SUPPLY_META[item];
    const quality = clamp(
      Math.round(
        meta.baseQuality +
          7 * contractBoost -
          (volatility / 100) * 8 +
          randInt(-Math.ceil(meta.qualityVariance / 2), Math.ceil(meta.qualityVariance / 2))
      ),
      36,
      98
    );
    const freshness = clamp(Math.round(78 + contractBoost * 8 - volatility / 8 + randInt(-6, 8)), 35, 100);
    return { item, amount, quality, freshness };
  });
}

function signLocalBrokerContract() {
  normalizeWorldState();
  const merchantStanding = getWorldActors().merchant_houses.standing;
  const suppliers = state.world.suppliers;
  const discount = merchantStanding >= 60 ? 3 : 0;
  const fee = Math.max(16, 24 - discount);
  if (!spendGold(fee, "Local broker contract")) {
    return { ok: false, error: "Not enough gold to secure local broker terms." };
  }

  const extension = randInt(5, 7);
  suppliers.contracts.localBrokerDays = Math.min(16, suppliers.contracts.localBrokerDays + extension);
  const note = `Local broker contract signed (${suppliers.contracts.localBrokerDays}d active, ${formatCoin(fee)} retainer).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("contract_local", note);
  logLine(note, "good");
  render();
  return { ok: true, days: suppliers.contracts.localBrokerDays, fee };
}

function signArcanumWholesaleContract() {
  normalizeWorldState();
  const district = getCurrentDistrictProfile();
  const suppliers = state.world.suppliers;
  const merchantWindow = isMerchantWindowActiveForDistrict(suppliers, district.id);
  const canSign = district.id.startsWith("arcanum") || merchantWindow;
  if (!canSign) {
    return {
      ok: false,
      error: "Wholesale terms require Arcanum presence or an active merchant visit in your district."
    };
  }

  const fee = merchantWindow ? 28 : 36;
  if (!spendGold(fee, "Arcanum wholesale contract")) {
    return { ok: false, error: "Not enough gold for wholesale contract terms." };
  }

  const extension = randInt(4, 6);
  suppliers.contracts.arcanumWholesaleDays = Math.min(
    14,
    suppliers.contracts.arcanumWholesaleDays + extension
  );
  const note = `Arcanum wholesale papers sealed (${suppliers.contracts.arcanumWholesaleDays}d active, ${formatCoin(fee)}).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("contract_wholesale", note);
  logLine(note, "good");
  render();
  return { ok: true, days: suppliers.contracts.arcanumWholesaleDays, fee };
}

function scheduleCityStockRun(bundleScale = 1) {
  normalizeWorldState();
  const suppliers = state.world.suppliers;
  if (suppliers.stockRun.daysRemaining > 0) {
    return { ok: false, error: "A city stock-up trip is already in progress." };
  }
  if (isDistrictTravelActive()) {
    return { ok: false, error: "Schedule the stock run after district travel completes." };
  }

  const district = getCurrentDistrictProfile();
  if (district.id.startsWith("arcanum")) {
    return { ok: false, error: "City stock-up runs are only needed when operating outside Arcanum." };
  }

  const outbound = getDistrictTravelLink(district.id, "arcanum_market");
  const inbound = getDistrictTravelLink("arcanum_market", district.id);
  if (!outbound || !inbound) {
    return { ok: false, error: "No valid logistics route to Arcanum market from this district." };
  }

  const availableStaff = state.staff.filter((person) => !isStaffUnavailable(person));
  if (availableStaff.length === 0) {
    return { ok: false, error: "No available staff can be assigned to the stock run today." };
  }
  const assigned = availableStaff.sort((a, b) => b.service - a.service)[0];
  const scale = clamp(Number(bundleScale) || 1, 0.8, 1.8);
  const logisticsCost = Math.round((outbound.cost + inbound.cost + 10) * scale);
  const cargoDeposit = Math.round((42 + randInt(0, 18)) * scale);
  const totalCost = logisticsCost + cargoDeposit;

  if (!spendGold(totalCost, "City stock-up run")) {
    return { ok: false, error: "Not enough gold for logistics and cargo deposit." };
  }

  suppliers.stockRun.daysRemaining = Math.max(2, outbound.days + inbound.days);
  suppliers.stockRun.targetDistrict = district.id;
  suppliers.stockRun.assignedStaffId = assigned.id;
  suppliers.stockRun.bundleScale = scale;
  assigned.fatigue = clamp(assigned.fatigue + randInt(5, 10), 0, 100);

  const note = `Stock run dispatched to Arcanum (${suppliers.stockRun.daysRemaining}d, ${formatCoin(totalCost)} committed).`;
  suppliers.lastSupplyEvent = note;
  recordSupplierHistory("stock_run_start", note);
  logLine(note, "neutral");
  render();
  return { ok: true, days: suppliers.stockRun.daysRemaining, cost: totalCost, assignedStaffId: assigned.id };
}

function progressSupplierNetwork() {
  normalizeWorldState();
  const worldMods = getWorldRuntimeModifiers();
  const worldActors = getWorldActors();
  const merchants = worldActors.merchant_houses;
  const underworld = worldActors.underworld_network;
  const suppliers = state.world.suppliers;
  const currentDistrictId = state.world.currentDistrict;
  let notableSummary = "";

  if (suppliers.contracts.localBrokerDays > 0) {
    suppliers.contracts.localBrokerDays -= 1;
  }
  if (suppliers.contracts.arcanumWholesaleDays > 0) {
    suppliers.contracts.arcanumWholesaleDays -= 1;
  }

  const merchantPressure = merchants ? (50 - merchants.standing) / 18 : 0;
  const underworldPressure = underworld ? (underworld.standing - 50) / 20 : 0;
  let volatilityShift = randInt(-4, 4) + Math.round(merchantPressure + underworldPressure);
  if (suppliers.merchant.visitWindowDays > 0) {
    volatilityShift -= 1;
  }
  if (suppliers.caravan.windowDays > 0) {
    volatilityShift -= 1;
  }
  suppliers.volatility = clamp(suppliers.volatility + volatilityShift, 5, 95);

  if (suppliers.merchant.visitWindowDays > 0) {
    suppliers.merchant.visitWindowDays -= 1;
    if (suppliers.merchant.visitWindowDays <= 0) {
      suppliers.merchant.daysUntilVisit = randInt(4, 8);
      const note = `Merchant delegation departed ${resolveDistrict(
        suppliers.merchant.targetDistrict,
        state.world.activeLocation
      ).label}.`;
      recordSupplierHistory("merchant_departure", note);
    }
  } else {
    suppliers.merchant.daysUntilVisit = Math.max(0, suppliers.merchant.daysUntilVisit - 1);
    if (suppliers.merchant.daysUntilVisit <= 0) {
      suppliers.merchant.visitWindowDays = randInt(1, 3);
      suppliers.merchant.targetDistrict = pick(Object.keys(DISTRICT_PROFILES));
      const merchantDistrict = resolveDistrict(suppliers.merchant.targetDistrict, state.world.activeLocation);
      const note = `Merchant delegation opened contract talks in ${merchantDistrict.label} (${suppliers.merchant.visitWindowDays}d).`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("merchant_arrival", note);
      logLine(note, "good");
      notableSummary = note;
    }
  }

  const caravanDistrictPool = Object.keys(DISTRICT_PROFILES).filter(
    (districtId) => districtId.includes("docks") || districtId.includes("wharf")
  );
  if (suppliers.caravan.windowDays > 0) {
    suppliers.caravan.windowDays -= 1;
    if (suppliers.caravan.windowDays <= 0) {
      suppliers.caravan.daysUntilWindow = randInt(4, 7);
      const note = `Caravan window closed in ${resolveDistrict(
        suppliers.caravan.targetDistrict,
        state.world.activeLocation
      ).label}.`;
      recordSupplierHistory("caravan_close", note);
    }
  } else {
    suppliers.caravan.daysUntilWindow = Math.max(0, suppliers.caravan.daysUntilWindow - 1);
    if (suppliers.caravan.daysUntilWindow <= 0) {
      suppliers.caravan.windowDays = randInt(1, 2);
      suppliers.caravan.targetDistrict = pick(
        caravanDistrictPool.length > 0 ? caravanDistrictPool : Object.keys(DISTRICT_PROFILES)
      );
      const caravanDistrict = resolveDistrict(suppliers.caravan.targetDistrict, state.world.activeLocation);
      const note = `Caravan convoys opened in ${caravanDistrict.label} (${suppliers.caravan.windowDays}d).`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("caravan_open", note);
      logLine(note, "neutral");
      notableSummary = note;
    }
  }

  if (suppliers.stockRun.daysRemaining > 0) {
    suppliers.stockRun.daysRemaining -= 1;
    if (suppliers.stockRun.daysRemaining <= 0) {
      const destinationDistrict = resolveDistrict(suppliers.stockRun.targetDistrict, state.world.activeLocation);
      const wholesaleBoost = suppliers.contracts.arcanumWholesaleDays > 0 ? 1.2 : 1;
      const bundle = buildCityStockRunBundle(
        suppliers.stockRun.bundleScale,
        suppliers.volatility,
        wholesaleBoost
      );

      bundle.forEach((entry) => {
        mergeIncomingSupplyStats(entry.item, entry.amount, entry.quality, entry.freshness);
      });

      const assignedStaff = state.staff.find((person) => person.id === suppliers.stockRun.assignedStaffId);
      if (assignedStaff) {
        assignedStaff.morale = clamp(assignedStaff.morale + 2, 0, 100);
      }

      const haul = bundle.map((entry) => `${entry.item}+${entry.amount}`).join(", ");
      const note = `City stock run returned to ${destinationDistrict.label}: ${haul}.`;
      suppliers.lastSupplyEvent = note;
      recordSupplierHistory("stock_run_return", note);
      logLine(note, "good");
      suppliers.stockRun.daysRemaining = 0;
      suppliers.stockRun.assignedStaffId = "";
      suppliers.stockRun.targetDistrict = "arcanum_market";
      suppliers.stockRun.bundleScale = 1;
      notableSummary = note;
    }
  }

  Object.values(suppliers.markets).forEach((market) => {
    Object.keys(SUPPLY_META).forEach((item) => {
      const baseRestock =
        item === "wood"
          ? 6
          : item === "bread"
            ? 5
            : item === "honey"
              ? 3
              : item === "meat"
                ? 4
                : 5;
      const volatilityDrag = clamp(1 - suppliers.volatility / 150, 0.35, 1);
      let restock = baseRestock * market.restockMult * volatilityDrag * worldMods.supplyReliabilityMult;

      if (isMerchantWindowActiveForDistrict(suppliers, market.districtId)) {
        restock *= 1.24;
      }
      if (isCaravanWindowActiveForDistrict(suppliers, market.districtId)) {
        restock *= 1.32;
      }
      if (suppliers.contracts.localBrokerDays > 0 && market.districtId === currentDistrictId) {
        restock *= 1.12;
      }
      if (suppliers.contracts.arcanumWholesaleDays > 0 && market.districtId.startsWith("arcanum")) {
        restock *= 1.18;
      }

      const restockUnits = Math.max(0, Math.round(restock + randInt(-1, 1)));
      const ambientDrain = market.districtId.startsWith("arcanum") ? randInt(1, 3) : randInt(0, 2);
      market.stock[item] = clamp(market.stock[item] + restockUnits - ambientDrain, 0, 180);
    });
  });

  const currentMarket = suppliers.markets[currentDistrictId];
  const lowStockCount = currentMarket
    ? Object.values(currentMarket.stock).filter((amount) => amount <= 8).length
    : 0;

  if (!notableSummary) {
    if (isMerchantWindowActiveForDistrict(suppliers, currentDistrictId)) {
      notableSummary = "Merchant visit active in district: contract and lot terms improved today.";
    } else if (isCaravanWindowActiveForDistrict(suppliers, currentDistrictId)) {
      notableSummary = "Caravan window active nearby: local stalls received heavier lots.";
    } else if (lowStockCount >= 3) {
      notableSummary = "Local market ran thin on several staples; logistics planning is advised.";
    } else if (suppliers.volatility >= 72) {
      notableSummary = "Supplier volatility spiked; expect inconsistent prices and lot size.";
    } else {
      notableSummary = "Supplier routes stable. Baseline market replenishment completed.";
    }
  }

  suppliers.lastSupplyEvent = notableSummary;
  return notableSummary;
}

function createInitialState(locationId = DEFAULT_STARTING_LOCATION) {
  const startingLocation = resolveStartingLocation(locationId);
  const startingDistrict = resolveDistrictForLocation(startingLocation.id);
  const startingActors = createWorldActors(startingLocation.id, startingDistrict.id);
  const initialCrown = createCrownAuthorityState();
  const initialReputationModel = createWorldReputationState(
    null,
    startingLocation.id,
    startingActors,
    initialCrown.complianceScore
  );
  const initialWorldReporting = createWorldReportingState(null, 1);
  const actorList = Object.values(startingActors).sort((a, b) => b.standing - a.standing);
  const highestActor = actorList[0];
  const lowestActor = actorList[actorList.length - 1];
  return {
    day: 1,
    world: {
      startingLocation: startingLocation.id,
      activeLocation: startingLocation.id,
      locationLabel: startingLocation.label,
      locationTitle: startingLocation.title,
      locationSummary: startingLocation.summary,
      currentDistrict: startingDistrict.id,
      currentDistrictLabel: startingDistrict.label,
      currentDistrictSummary: startingDistrict.summary,
      rivalTaverns: startingDistrict.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      })),
      actors: startingActors,
      effects: createWorldEffectState(),
      crown: initialCrown,
      suppliers: createSupplierNetworkState(null, startingLocation.id),
      rivals: createRivalSimulationState(null, startingDistrict.id),
      reputationModel: initialReputationModel,
      reporting: initialWorldReporting,
      lastActorEvent: null,
      travelDaysRemaining: 0,
      travelDestination: null,
      travelDestinationLabel: "",
      travelRouteCost: 0,
      travelRouteDays: 0
    },
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
      supplierSummary: "Local market running on baseline stock.",
      rivalSummary: "Rival taverns held steady. No direct pressure swing today.",
      kitchen: 60,
      satisfaction: 64,
      crownTax: 0,
      crownDue: 0,
      crownPayment: 0,
      reputationSummary: initialReputationModel.lastSummary,
      topCohortStandingLabel: "Locals",
      topCohortStandingScore: initialReputationModel.cohorts.locals,
      lowCohortStandingLabel: "Locals",
      lowCohortStandingScore: initialReputationModel.cohorts.locals,
      topGroupStandingLabel: highestActor.label,
      topGroupStandingScore: initialReputationModel.groups[highestActor.id].score,
      lowGroupStandingLabel: lowestActor.label,
      lowGroupStandingScore: initialReputationModel.groups[lowestActor.id].score,
      crownComplianceStanding: initialReputationModel.crownComplianceStanding,
      worldLayerSummary:
        `District ${startingDistrict.label}. ${initialReputationModel.lastSummary} ` +
        "Supplier, rivalry, Crown, and actor systems initialized.",
      weeklyWorldSummary: initialWorldReporting.lastWeeklySummary,
      district: startingDistrict.label,
      events: "No major district or calendar event today.",
      actorEvent: "Influence climate steady. No major factions moved today.",
      actorSummary: `${highestActor.label} standing ${highestActor.standing}, ${lowestActor.label} standing ${lowestActor.standing}.`,
      crownSummary: "Crown ledger current. Next collection due on Day 7.",
      compliance: initialCrown.complianceScore,
      rivalPressure: Math.round(
        (startingDistrict.rivalTaverns.reduce((sum, rival) => sum + rival.pressure, 0) /
          Math.max(1, startingDistrict.rivalTaverns.length)) *
          100
      )
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

  function getActiveLocationProfile() {
    const locationId = state.world && typeof state.world === "object"
      ? state.world.activeLocation || state.world.startingLocation
      : null;
    return resolveStartingLocation(locationId);
  }

  function getCurrentDistrictProfile() {
    const location = getActiveLocationProfile();
    const districtId = state.world && typeof state.world === "object"
      ? state.world.currentDistrict
      : null;
    return resolveDistrict(districtId, location.id);
  }

  function isDistrictTravelActive() {
    return Boolean(
      state.world &&
      typeof state.world === "object" &&
      Number(state.world.travelDaysRemaining) > 0 &&
      state.world.travelDestination
    );
  }

  function getDistrictTravelLink(fromDistrictId, toDistrictId) {
    const routes = DISTRICT_TRAVEL_LINKS[fromDistrictId];
    if (!routes) {
      return null;
    }
    const route = routes[toDistrictId];
    if (!route) {
      return null;
    }
    const days = Math.max(1, Math.round(route.days || 1));
    const cost = Math.max(0, Math.round(route.cost || 0));
    return { days, cost };
  }

  function listTravelOptions() {
    const currentDistrict = getCurrentDistrictProfile();
    const routes = DISTRICT_TRAVEL_LINKS[currentDistrict.id] || {};
    return Object.entries(routes)
      .map(([destinationId, route]) => {
        const destination = resolveDistrict(destinationId, currentDistrict.locationId);
        const location = resolveStartingLocation(destination.locationId);
        return {
          destinationId: destination.id,
          destinationLabel: destination.label,
          locationId: location.id,
          locationLabel: location.label,
          days: Math.max(1, Math.round(route.days || 1)),
          cost: Math.max(0, Math.round(route.cost || 0))
        };
      })
      .sort((a, b) => a.days - b.days || a.cost - b.cost || a.destinationLabel.localeCompare(b.destinationLabel));
  }

  function getWorldActors() {
    normalizeWorldState();
    return state.world.actors;
  }

  function getWorldEffects() {
    normalizeWorldState();
    return state.world.effects;
  }

  function normalizeWorldState() {
    const current = state.world && typeof state.world === "object" ? state.world : {};
    const startingLocation = resolveStartingLocation(current.startingLocation);
    const activeLocation = resolveStartingLocation(current.activeLocation || startingLocation.id);
    const district = resolveDistrict(current.currentDistrict, activeLocation.id);
    const correctedActiveLocation = resolveStartingLocation(district.locationId);
    const travelDestination =
      typeof current.travelDestination === "string" && DISTRICT_PROFILES[current.travelDestination]
        ? current.travelDestination
        : null;
    const travelDaysRemaining = Math.max(0, Math.round(Number(current.travelDaysRemaining) || 0));
    const destinationDistrict = travelDestination ? DISTRICT_PROFILES[travelDestination] : null;
    const worldActors = createWorldActors(
      correctedActiveLocation.id,
      district.id,
      current.actors
    );
    const worldEffects = createWorldEffectState(current.effects);
    const crownAuthority = createCrownAuthorityState(current.crown);
    const suppliers = createSupplierNetworkState(current.suppliers, correctedActiveLocation.id);
    const rivals = createRivalSimulationState(current.rivals, district.id);
    const reputationModel = createWorldReputationState(
      current.reputationModel,
      correctedActiveLocation.id,
      worldActors,
      crownAuthority.complianceScore
    );
    const reporting = createWorldReportingState(current.reporting, state.day);
    state.world = {
      ...current,
      startingLocation: startingLocation.id,
      activeLocation: correctedActiveLocation.id,
      locationLabel: correctedActiveLocation.label,
      locationTitle: correctedActiveLocation.title,
      locationSummary: correctedActiveLocation.summary,
      currentDistrict: district.id,
      currentDistrictLabel: district.label,
      currentDistrictSummary: district.summary,
      rivalTaverns: district.rivalTaverns.map((rival) => ({
        id: rival.id,
        name: rival.name,
        pressure: rival.pressure
      })),
      actors: worldActors,
      effects: worldEffects,
      crown: crownAuthority,
      suppliers,
      rivals,
      reputationModel,
      reporting,
      lastActorEvent: normalizeActorEventEntry(current.lastActorEvent),
      travelDaysRemaining: travelDaysRemaining > 0 && destinationDistrict ? travelDaysRemaining : 0,
      travelDestination: travelDaysRemaining > 0 && destinationDistrict ? destinationDistrict.id : null,
      travelDestinationLabel: travelDaysRemaining > 0 && destinationDistrict ? destinationDistrict.label : "",
      travelRouteCost: Math.max(0, Math.round(Number(current.travelRouteCost) || 0)),
      travelRouteDays: Math.max(0, Math.round(Number(current.travelRouteDays) || 0))
    };
  }

  function getCrownAuthority() {
    normalizeWorldState();
    return state.world.crown;
  }

  function recordCrownHistory(type, amount, status, note) {
    const crown = getCrownAuthority();
    crown.history.unshift({
      day: state.day,
      type,
      amount: Math.max(0, Math.round(Number(amount) || 0)),
      status,
      note
    });
    if (crown.history.length > 36) {
      crown.history.length = 36;
    }
  }

  function setWorldEffect(effectId, days, value) {
    const effects = getWorldEffects();
    const safeDays = Math.max(0, Math.round(Number(days) || 0));
    switch (effectId) {
      case "supply_cost":
        effects.supplyCostDays = safeDays;
        effects.supplyCostMult = Math.max(0.5, Math.min(1.7, Number(value) || 1));
        break;
      case "supply_reliability":
        effects.supplyReliabilityDays = safeDays;
        effects.supplyReliabilityMult = Math.max(0.45, Math.min(1.5, Number(value) || 1));
        break;
      case "demand":
        effects.demandDays = safeDays;
        effects.demandMult = Math.max(0.7, Math.min(1.45, Number(value) || 1));
        break;
      case "tax_flat":
        effects.taxFlatDays = safeDays;
        effects.taxFlatBonus = Math.max(-10, Math.min(35, Math.round(Number(value) || 0)));
        break;
      case "event_risk":
        effects.eventRiskDays = safeDays;
        effects.eventChanceMult = Math.max(0.6, Math.min(1.6, Number(value) || 1));
        break;
      default:
        break;
    }
  }

  function decayWorldEffects() {
    const effects = getWorldEffects();
    const decayFields = [
      ["supplyCostDays", "supplyCostMult", 1],
      ["supplyReliabilityDays", "supplyReliabilityMult", 1],
      ["demandDays", "demandMult", 1],
      ["taxFlatDays", "taxFlatBonus", 0],
      ["eventRiskDays", "eventChanceMult", 1]
    ];
    decayFields.forEach(([daysKey, valueKey, baseline]) => {
      if (effects[daysKey] > 0) {
        effects[daysKey] -= 1;
        if (effects[daysKey] <= 0) {
          effects[daysKey] = 0;
          effects[valueKey] = baseline;
        }
      }
    });
  }

  function runCrownAuditCheck(worldMods) {
    const crown = getCrownAuthority();
    const crownActor = getWorldActors().crown_office;
    const daysSinceAudit = state.day - crown.lastAuditDay;
    const arrearsPressure = clamp(crown.arrears / 420, 0, 0.55);
    const compliancePressure = clamp((62 - crown.complianceScore) / 100, 0, 0.42);
    const standardsPressure =
      state.cleanliness < 45 || state.condition < 45 ? 0.06 : 0;
    const crownTension = crownActor ? clamp((50 - crownActor.standing) / 100, 0, 0.25) : 0;
    let chance = 0.06 + arrearsPressure + compliancePressure + standardsPressure + crownTension;
    chance *= worldMods.eventChanceMult;
    if (daysSinceAudit <= 2) {
      chance *= 0.35;
    }
    chance = clamp(chance, 0.02, 0.62);
    if (random.nextFloat() > chance) {
      return {
        auditTriggered: false,
        reputationDelta: 0,
        immediateExpense: 0,
        summary: ""
      };
    }

    crown.lastAuditDay = state.day;
    const auditQuality =
      crown.complianceScore * 0.45 +
      state.cleanliness * 0.28 +
      state.condition * 0.22 +
      randInt(-14, 14);

    if (auditQuality < 54) {
      const penalty =
        randInt(18, 36) +
        Math.round(crown.pendingTax * 0.08) +
        Math.round(crown.arrears * 0.12);
      const immediateExpense = randInt(6, 12);
      crown.arrears += penalty;
      crown.complianceScore = clamp(crown.complianceScore - randInt(5, 11), 0, 100);
      crown.auditFailures += 1;
      shiftWorldActorStanding("crown_office", -2);
      setWorldEffect("tax_flat", 2, 7);
      recordCrownHistory(
        "audit",
        penalty,
        "failed",
        `Audit failure: ${formatCoin(penalty)} added to arrears.`
      );
      return {
        auditTriggered: true,
        reputationDelta: -2,
        immediateExpense,
        summary: `Royal audit failed. Penalty ${formatCoin(penalty)} moved to arrears.`,
        tone: "bad"
      };
    }

    const waiver = Math.min(crown.arrears, randInt(3, 10));
    crown.arrears -= waiver;
    crown.complianceScore = clamp(crown.complianceScore + randInt(2, 6), 0, 100);
    crown.auditPasses += 1;
    shiftWorldActorStanding("crown_office", 1);
    recordCrownHistory(
      "audit",
      waiver,
      "passed",
      waiver > 0
        ? `Audit pass: ${formatCoin(waiver)} arrears waived.`
        : "Audit pass: records accepted."
    );
    return {
      auditTriggered: true,
      reputationDelta: 1,
      immediateExpense: 0,
      summary:
        waiver > 0
          ? `Royal audit passed. ${formatCoin(waiver)} arrears waived.`
          : "Royal audit passed. Crown records accepted.",
      tone: "good"
    };
  }

  function resolveCrownCollection(crownTaxAccrued, revenue, operatingExpenses) {
    const crown = getCrownAuthority();
    crown.pendingTax += Math.max(0, Math.round(crownTaxAccrued));
    if (state.day < crown.nextCollectionDay) {
      return {
        taxPayment: 0,
        dueToday: 0,
        collectionSummary: `Next Crown collection on Day ${crown.nextCollectionDay}.`,
        reputationDelta: 0
      };
    }

    const dueToday = Math.max(0, Math.round(crown.pendingTax + crown.arrears));
    const payableNow = Math.max(0, Math.floor(state.gold + revenue - operatingExpenses));
    const taxPayment = Math.min(dueToday, payableNow);
    let remaining = dueToday - taxPayment;
    let reputationDelta = 0;
    let collectionSummary = "";

    crown.pendingTax = 0;
    crown.arrears = remaining;
    crown.nextCollectionDay = state.day + crown.cadenceDays;

    if (remaining > 0) {
      const surcharge = Math.max(5, Math.round(remaining * 0.08));
      crown.arrears += surcharge;
      crown.complianceScore = clamp(crown.complianceScore - randInt(4, 9), 0, 100);
      shiftWorldActorStanding("crown_office", -2);
      reputationDelta -= 2;
      setWorldEffect("tax_flat", 2, 6);
      recordCrownHistory(
        "collection",
        taxPayment,
        "partial",
        `Collected ${formatCoin(taxPayment)} against ${formatCoin(dueToday)} due; surcharge ${formatCoin(surcharge)}.`
      );
      collectionSummary = `Crown collected ${formatCoin(taxPayment)} of ${formatCoin(dueToday)} due. Arrears now ${formatCoin(crown.arrears)}.`;
      return {
        taxPayment,
        dueToday,
        collectionSummary,
        reputationDelta
      };
    }

    crown.complianceScore = clamp(crown.complianceScore + randInt(1, 4), 0, 100);
    shiftWorldActorStanding("crown_office", 1);
    recordCrownHistory(
      "collection",
      taxPayment,
      "paid",
      `Collected full due amount ${formatCoin(taxPayment)}.`
    );
    collectionSummary = `Crown collection settled in full (${formatCoin(taxPayment)}). Next due Day ${crown.nextCollectionDay}.`;
    return {
      taxPayment,
      dueToday,
      collectionSummary,
      reputationDelta
    };
  }

  function settleCrownArrears(amount = null) {
    const crown = getCrownAuthority();
    if (crown.arrears <= 0) {
      logLine("No Crown arrears are currently outstanding.", "neutral");
      render();
      return { ok: false, error: "No arrears to settle." };
    }
    const requested =
      amount === null || amount === undefined || amount === ""
        ? crown.arrears
        : Math.max(1, Math.round(Number(amount) || 0));
    const payment = Math.min(requested, state.gold, crown.arrears);
    if (payment <= 0) {
      logLine("You do not have enough gold to settle Crown arrears.", "bad");
      render();
      return { ok: false, error: "Not enough gold to settle arrears." };
    }
    state.gold -= payment;
    crown.arrears -= payment;
    const scoreLift = clamp(Math.round(payment / 35), 1, 7);
    crown.complianceScore = clamp(crown.complianceScore + scoreLift, 0, 100);
    shiftWorldActorStanding("crown_office", scoreLift >= 4 ? 2 : 1);
    recordCrownHistory(
      "arrears_payment",
      payment,
      "paid",
      `Manual arrears payment of ${formatCoin(payment)}.`
    );
    logLine(`Paid ${formatCoin(payment)} to the Crown arrears office.`, "good");
    render();
    return { ok: true, payment, remainingArrears: crown.arrears };
  }

  function fileComplianceReport() {
    const crown = getCrownAuthority();
    const filingCost = 12;
    if (!spendGold(filingCost, "Voluntary tax filing")) {
      return { ok: false, error: "Not enough gold for filing." };
    }
    const scoreLift = randInt(2, 5);
    crown.complianceScore = clamp(crown.complianceScore + scoreLift, 0, 100);
    shiftWorldActorStanding("crown_office", 1);
    setWorldEffect("event_risk", 2, 0.9);
    if (crown.arrears > 0) {
      const goodwillCut = Math.min(crown.arrears, randInt(2, 7));
      crown.arrears -= goodwillCut;
      recordCrownHistory(
        "voluntary_filing",
        filingCost,
        "accepted",
        `Filed voluntary report; ${formatCoin(goodwillCut)} arrears forgiven.`
      );
      logLine(
        `Voluntary filing accepted (+${scoreLift} compliance). Crown reduced arrears by ${formatCoin(goodwillCut)}.`,
        "good"
      );
      render();
      return { ok: true, scoreLift, goodwillCut };
    }
    recordCrownHistory(
      "voluntary_filing",
      filingCost,
      "accepted",
      "Filed voluntary report and compliance statement."
    );
    logLine(`Voluntary filing accepted (+${scoreLift} compliance standing).`, "good");
    render();
    return { ok: true, scoreLift, goodwillCut: 0 };
  }

  function getActorSupport(actorId) {
    const actor = getWorldActors()[actorId];
    if (!actor) {
      return { actorId, support: 0, tension: 0, influence: 0 };
    }
    const influence = clamp(actor.influence / 100, 0, 1.2);
    const standingShift = clamp((actor.standing - 50) / 50, -1, 1);
    return {
      actorId,
      support: standingShift * influence,
      tension: -standingShift * influence,
      influence
    };
  }

  function getWorldRuntimeModifiers() {
    const crown = getActorSupport("crown_office");
    const council = getActorSupport("civic_council");
    const merchants = getActorSupport("merchant_houses");
    const underworld = getActorSupport("underworld_network");
    const crownAuthority = getCrownAuthority();
    const effects = getWorldEffects();
    const rivalList = state.world && Array.isArray(state.world.rivalTaverns) ? state.world.rivalTaverns : [];
    const rivalPressureRaw = rivalList.reduce((sum, rival) => sum + (Number(rival.pressure) || 0), 0);
    const staticRivalPressure = rivalList.length > 0 ? rivalPressureRaw / rivalList.length : 0;
    const rivalryState =
      state.world &&
      state.world.rivals &&
      state.world.rivals.districts &&
      state.world.rivals.districts[state.world.currentDistrict]
        ? state.world.rivals.districts[state.world.currentDistrict]
        : null;
    const rivalPressure = clamp(
      rivalryState ? Number(rivalryState.demandPressure) || staticRivalPressure : staticRivalPressure,
      0,
      0.76
    );
    const rivalPricePressure = clamp(
      rivalryState ? Number(rivalryState.pricePressure) || rivalPressure * 0.68 : rivalPressure * 0.68,
      0,
      0.74
    );
    const rivalReputationPressure = clamp(
      rivalryState ? Number(rivalryState.reputationPressure) || rivalPressure * 0.54 : rivalPressure * 0.54,
      0,
      0.56
    );

    let demandMult =
      1 +
      council.support * 0.08 +
      merchants.support * 0.06 +
      underworld.support * 0.03 -
      crown.tension * 0.04 -
      underworld.tension * 0.05;
    demandMult *= 1 - rivalPressure * (0.13 + Math.max(0, merchants.tension) * 0.06);

    let supplyCostMult =
      1 -
      merchants.support * 0.09 +
      crown.tension * 0.03 +
      underworld.tension * 0.05;

    let supplyReliabilityMult =
      1 +
      merchants.support * 0.12 +
      council.support * 0.03 -
      underworld.tension * 0.09;

    let eventChanceMult =
      1 +
      crown.tension * 0.18 +
      underworld.tension * 0.16 -
      council.support * 0.06;
    const complianceDrift = clamp((crownAuthority.complianceScore - 60) / 100, -0.35, 0.35);

    const taxRateBonus =
      Math.max(0, crown.tension) * 0.055 -
      Math.max(0, crown.support) * 0.01 +
      Math.max(0, -complianceDrift) * 0.03 -
      Math.max(0, complianceDrift) * 0.012;
    let taxFlatBonus =
      Math.round(Math.max(0, crown.tension * 12)) +
      Math.min(18, Math.round(crownAuthority.arrears / 95));
    demandMult *= 1 - Math.max(0, -complianceDrift) * 0.08;
    eventChanceMult *= 1 + Math.max(0, -complianceDrift) * 0.24;

    if (effects.demandDays > 0) {
      demandMult *= effects.demandMult;
    }
    if (effects.supplyCostDays > 0) {
      supplyCostMult *= effects.supplyCostMult;
    }
    if (effects.supplyReliabilityDays > 0) {
      supplyReliabilityMult *= effects.supplyReliabilityMult;
    }
    if (effects.eventRiskDays > 0) {
      eventChanceMult *= effects.eventChanceMult;
    }
    if (effects.taxFlatDays > 0) {
      taxFlatBonus += effects.taxFlatBonus;
    }

    return {
      demandMult: clamp(demandMult, 0.72, 1.45),
      supplyCostMult: clamp(supplyCostMult, 0.7, 1.65),
      supplyReliabilityMult: clamp(supplyReliabilityMult, 0.55, 1.45),
      eventChanceMult: clamp(eventChanceMult, 0.68, 1.65),
      taxRateBonus: clamp(taxRateBonus, -0.01, 0.08),
      taxFlatBonus: Math.max(-8, Math.min(36, taxFlatBonus)),
      rivalPressure: clamp(rivalPressure, 0, 0.76),
      rivalPricePressure,
      rivalReputationPressure
    };
  }

  function shiftWorldActorStanding(actorId, delta) {
    const actors = getWorldActors();
    const actor = actors[actorId];
    if (!actor) {
      return;
    }
    const shift = Math.round(Number(delta) || 0);
    actor.standing = clamp(actor.standing + shift, 0, 100);
    actor.lastShift = shift;
  }

  function pickWeightedActorId(actors) {
    const entries = Object.values(actors || {}).filter((actor) => actor.influence > 0);
    if (entries.length === 0) {
      return null;
    }
    const totalWeight = entries.reduce((sum, actor) => sum + actor.influence, 0);
    let cursor = random.nextFloat() * totalWeight;
    for (let i = 0; i < entries.length; i += 1) {
      cursor -= entries[i].influence;
      if (cursor <= 0) {
        return entries[i].id;
      }
    }
    return entries[entries.length - 1].id;
  }

  function createDayMods() {
    return {
      demandMult: 1,
      flatGuests: 0,
      qualityBoost: 0,
      reputation: 0,
      expense: 0,
      cleanliness: 0,
      condition: 0,
      taxBonus: 0
    };
  }

  function mergeDayMods(primary, secondary) {
    const left = primary || createDayMods();
    const right = secondary || createDayMods();
    return {
      demandMult: (left.demandMult ?? 1) * (right.demandMult ?? 1),
      flatGuests: (left.flatGuests ?? 0) + (right.flatGuests ?? 0),
      qualityBoost: (left.qualityBoost ?? 0) + (right.qualityBoost ?? 0),
      reputation: (left.reputation ?? 0) + (right.reputation ?? 0),
      expense: (left.expense ?? 0) + (right.expense ?? 0),
      cleanliness: (left.cleanliness ?? 0) + (right.cleanliness ?? 0),
      condition: (left.condition ?? 0) + (right.condition ?? 0),
      taxBonus: (left.taxBonus ?? 0) + (right.taxBonus ?? 0)
    };
  }

  function rollWorldActorEventHook() {
    const actors = getWorldActors();
    const actorList = Object.values(actors);
    const volatility =
      actorList.reduce((sum, actor) => sum + Math.abs(actor.standing - 50) * actor.influence, 0) /
      Math.max(1, actorList.reduce((sum, actor) => sum + actor.influence, 0));
    const chance = clamp(0.22 + (volatility / 50) * 0.32, 0.16, 0.64);
    if (random.nextFloat() > chance) {
      const summary = "Influence climate steady. No major factions moved today.";
      state.world.lastActorEvent = {
        actorId: "",
        label: "Influence Climate",
        tone: "neutral",
        day: state.day,
        summary
      };
      return { mods: createDayMods(), actorSummary: summary };
    }

    const actorId = pickWeightedActorId(actors);
    if (!actorId) {
      const summary = "Influence climate steady. No major factions moved today.";
      state.world.lastActorEvent = {
        actorId: "",
        label: "Influence Climate",
        tone: "neutral",
        day: state.day,
        summary
      };
      return { mods: createDayMods(), actorSummary: summary };
    }

    const actor = actors[actorId];
    const mods = createDayMods();
    let tone = "neutral";
    let summary = "";

    if (actorId === "crown_office") {
      if (actor.standing < 45) {
        const fine = randInt(14, 36);
        const levy = randInt(3, 10);
        mods.expense += fine;
        mods.taxBonus += levy;
        mods.reputation -= 1;
        shiftWorldActorStanding("crown_office", -1);
        summary = `Crown tax officers found irregular filings (${formatCoin(fine)} fine, +${levy}g levy).`;
        tone = "bad";
      } else {
        const royalTraffic = randInt(7, 18);
        mods.flatGuests += royalTraffic;
        mods.reputation += 1;
        mods.taxBonus -= randInt(1, 3);
        shiftWorldActorStanding("crown_office", 1);
        summary = `Crown office issued a clean ledger mark (+${royalTraffic} guest traffic).`;
        tone = "good";
      }
    } else if (actorId === "civic_council") {
      if (actor.standing < 43) {
        const permitDelay = randInt(9, 22);
        mods.expense += permitDelay;
        mods.reputation -= 1;
        mods.condition -= 1;
        shiftWorldActorStanding("civic_council", -1);
        summary = `Council permit delays raised admin costs by ${formatCoin(permitDelay)}.`;
        tone = "bad";
      } else {
        mods.demandMult *= 1.05;
        mods.flatGuests += randInt(4, 11);
        mods.reputation += 1;
        shiftWorldActorStanding("civic_council", 1);
        summary = "Civic council bulletin endorsed your tavern for local gatherings.";
        tone = "good";
      }
    } else if (actorId === "merchant_houses") {
      if (actor.standing < 44) {
        setWorldEffect("supply_reliability", 3, 0.8);
        setWorldEffect("supply_cost", 3, 1.12);
        mods.expense += randInt(6, 14);
        shiftWorldActorStanding("merchant_houses", -1);
        summary = "Merchant houses tightened credit lines (3-day supply squeeze).";
        tone = "bad";
      } else {
        setWorldEffect("supply_cost", 3, 0.86);
        setWorldEffect("supply_reliability", 3, 1.08);
        mods.demandMult *= 1.03;
        shiftWorldActorStanding("merchant_houses", 2);
        summary = "Merchant houses opened preferred contract pricing for 3 days.";
        tone = "good";
      }
    } else if (actorId === "underworld_network") {
      if (actor.standing < 40) {
        const protectionCost = randInt(8, 20);
        mods.expense += protectionCost;
        mods.reputation -= 2;
        mods.cleanliness -= 1;
        setWorldEffect("event_risk", 2, 1.18);
        shiftWorldActorStanding("underworld_network", -1);
        summary = `Underworld collectors demanded protection coin (${formatCoin(protectionCost)}).`;
        tone = "bad";
      } else {
        const cacheItem = pick(["grain", "hops", "honey", "meat", "veg", "wood"]);
        const cacheAmount = randInt(3, 8);
        state.inventory[cacheItem] += cacheAmount;
        setWorldEffect("demand", 2, 1.05);
        shiftWorldActorStanding("underworld_network", 1);
        summary = `A quiet fixer routed extra ${cacheItem} stock (+${cacheAmount}) and rumor-driven footfall.`;
        tone = "neutral";
      }
    }

    state.world.lastActorEvent = {
      actorId: actor.id,
      label: actor.label,
      tone,
      day: state.day,
      summary
    };
    logLine(summary, tone);

    return {
      mods,
      actorSummary: summary
    };
  }

  function applyWorldActorDrift(net, satisfaction) {
    const actorAdjustments = {
      crown_office: 0,
      civic_council: 0,
      merchant_houses: 0,
      underworld_network: 0
    };

    if (net > 0) {
      actorAdjustments.civic_council += 1;
      actorAdjustments.merchant_houses += 1;
    } else {
      actorAdjustments.merchant_houses -= 1;
    }

    if (state.cleanliness < 45 || state.condition < 45) {
      actorAdjustments.crown_office -= 1;
      actorAdjustments.civic_council -= 1;
    }
    if (state.cleanliness < 35 || state.condition < 35) {
      actorAdjustments.underworld_network += 1;
    }

    if (satisfaction >= 0.7) {
      actorAdjustments.civic_council += 1;
      actorAdjustments.crown_office += 1;
    } else if (satisfaction < 0.5) {
      actorAdjustments.civic_council -= 1;
      actorAdjustments.underworld_network += 1;
    }

    Object.entries(actorAdjustments).forEach(([actorId, delta]) => {
      if (delta !== 0) {
        shiftWorldActorStanding(actorId, delta);
      }
    });
  }

  function summarizeWorldActorsForReport() {
    const actors = Object.values(getWorldActors());
    const ranked = actors
      .slice()
      .sort((a, b) => b.standing - a.standing);
    const top = ranked[0];
    const low = ranked[ranked.length - 1];
    return `${top.label} standing ${top.standing}, ${low.label} standing ${low.standing}.`;
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
    normalizeWorldState();
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    const worldMods = getWorldRuntimeModifiers();
    const suppliers = state.world.suppliers;
    const market = getSupplierCurrentMarket();
    if (isDistrictTravelActive()) {
      logLine("Supply orders are paused while your caravan is in transit.", "bad");
      render();
      return;
    }
    if (!market) {
      logLine("Supply ledger unavailable for the active district.", "bad");
      render();
      return;
    }

    const marketAvailable = Math.max(0, Math.round(Number(market.stock[item]) || 0));
    if (marketAvailable <= 0) {
      logLine(`${district.label} market has no ${item} lots left today.`, "bad");
      render();
      return;
    }

    const merchantWindow = isMerchantWindowActiveForDistrict(suppliers, district.id);
    const caravanWindow = isCaravanWindowActiveForDistrict(suppliers, district.id);
    const lotBoost = merchantWindow ? 1.2 : caravanWindow ? 1.12 : 1;
    const adjustedAmount = Math.max(
      1,
      Math.round(amount * location.supplyQuantityMult * district.supplyQuantityMult * lotBoost)
    );
    const purchasableAmount = Math.min(adjustedAmount, marketAvailable);
    const availabilityRoll =
      location.supplyReliability * district.supplyReliability * worldMods.supplyReliabilityMult;
    const lotAvailabilityBuffer = clamp(marketAvailable / 180, 0.04, 0.25);
    const effectiveChance = clamp(availabilityRoll + lotAvailabilityBuffer, 0.15, 0.99);
    if (random.nextFloat() > effectiveChance) {
      logLine(`No fresh ${item} lots were available in ${district.label} today.`, "bad");
      render();
      return;
    }

    const volatilityMult = getSupplierVolatilityCostMult(suppliers.volatility);
    const contractMult = getSupplierContractCostMult(suppliers, district.id);
    const marketEventMult = merchantWindow ? 0.91 : caravanWindow ? 0.95 : 1;
    const adjustedUnitCost = Math.max(
      1,
      Math.round(
        unitCost *
          location.supplyCostMult *
          district.supplyCostMult *
          worldMods.supplyCostMult *
          market.priceBias *
          volatilityMult *
          contractMult *
          marketEventMult
      )
    );
    const total = purchasableAmount * adjustedUnitCost;
    if (!spendGold(total, `Buy ${item}`)) {
      return;
    }
    market.stock[item] = Math.max(0, marketAvailable - purchasableAmount);
    if (isSupplyItem(item)) {
      const profile = SUPPLY_META[item];
      const qualityPenalty = Math.max(0, Math.round((suppliers.volatility - 25) / 8));
      const qualityBonus = suppliers.contracts.arcanumWholesaleDays > 0 ? 4 : suppliers.contracts.localBrokerDays > 0 ? 2 : 0;
      const incomingQuality = clamp(
        profile.baseQuality +
          randInt(-profile.qualityVariance, profile.qualityVariance) -
          qualityPenalty +
          qualityBonus,
        30,
        96
      );
      const freshnessBonus = merchantWindow ? 6 : caravanWindow ? 3 : 0;
      const incomingFreshness = clamp(randInt(64, 94) + freshnessBonus - Math.round(suppliers.volatility / 16), 25, 100);
      mergeIncomingSupplyStats(item, purchasableAmount, incomingQuality, incomingFreshness);
      logLine(
        `Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)} (${qualityTier(incomingQuality)} grade).`,
        "neutral"
      );
      if (purchasableAmount < adjustedAmount) {
        logLine(
          `${district.label} lot cap hit: ordered ${adjustedAmount}, filled ${purchasableAmount}.`,
          "neutral"
        );
      }
      render();
      return;
    }
    state.inventory[item] += purchasableAmount;
    if (purchasableAmount < adjustedAmount) {
      logLine(
        `Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)} (lot cap limited fill).`,
        "neutral"
      );
    } else {
      logLine(`Purchased ${purchasableAmount} ${item} in ${district.label} for ${formatCoin(total)}.`, "neutral");
    }
    render();
  }

  function startDistrictTravel(destinationId) {
    normalizeWorldState();
    if (!destinationId || typeof destinationId !== "string") {
      return { ok: false, error: "Choose a destination district." };
    }
    if (isDistrictTravelActive()) {
      return { ok: false, error: "Travel already in progress." };
    }

    const currentDistrict = getCurrentDistrictProfile();
    if (destinationId === currentDistrict.id) {
      return { ok: false, error: "You are already operating in that district." };
    }

    const destination = resolveDistrict(destinationId, currentDistrict.locationId);
    const route = getDistrictTravelLink(currentDistrict.id, destination.id);
    if (!route) {
      return {
        ok: false,
        error: `No travel route from ${currentDistrict.label} to ${destination.label}.`
      };
    }
    if (!spendGold(route.cost, `Travel to ${destination.label}`)) {
      return { ok: false, error: "Not enough gold for travel." };
    }

    state.world.travelDaysRemaining = route.days;
    state.world.travelDestination = destination.id;
    state.world.travelDestinationLabel = destination.label;
    state.world.travelRouteCost = route.cost;
    state.world.travelRouteDays = route.days;
    logLine(
      `Travel begun: ${currentDistrict.label} -> ${destination.label} (${route.days}d, ${formatCoin(route.cost)}).`,
      "neutral"
    );
    render();
    return { ok: true, destinationId: destination.id, days: route.days, cost: route.cost };
  }

  function progressDistrictTravel() {
    if (!isDistrictTravelActive()) {
      return { inTransitToday: false, demandMult: 1, eventChanceMult: 1, currentDistrict: null };
    }

    const beforeDistrict = getCurrentDistrictProfile();
    const destination = resolveDistrict(state.world.travelDestination, beforeDistrict.locationId);
    const inTransitDays = Math.max(0, Math.round(state.world.travelDaysRemaining));
    state.world.travelDaysRemaining = Math.max(0, inTransitDays - 1);

    if (state.world.travelDaysRemaining <= 0) {
      state.world.currentDistrict = destination.id;
      state.world.activeLocation = destination.locationId;
      state.world.travelDestination = null;
      state.world.travelDestinationLabel = "";
      state.world.travelRouteCost = 0;
      state.world.travelRouteDays = 0;
      normalizeWorldState();
      logLine(`Travel complete: now operating in ${destination.label}.`, "good");
    }

    return {
      inTransitToday: true,
      demandMult: 0.86,
      eventChanceMult: 0.72,
      currentDistrict: beforeDistrict.label,
      destinationDistrict: destination.label
    };
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
    normalizeWorldState();
    const travelContext = progressDistrictTravel();
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    state.day += 1;
    const supplierSummary = progressSupplierNetwork();
    const rivalSummary = progressRivalTavernSimulation();
    const weekday = DAY_NAMES[(state.day - 1) % 7];
    const absenceProgress = progressStaffAbsences();
    const spoilageSummary = applySupplySpoilage();
    const shiftContext = assignDailyShifts(weekday);
    const staffStats = getStaffStats();
    const initialWorldMods = getWorldRuntimeModifiers();
    const baseEventMods = rollDailyEvent(travelContext.eventChanceMult, initialWorldMods.eventChanceMult);
    const calendarEventSummary =
      typeof baseEventMods.eventSummary === "string"
        ? baseEventMods.eventSummary
        : "No major district or calendar event today.";
    const actorHook = rollWorldActorEventHook();
    const worldMods = getWorldRuntimeModifiers();
    const mods = mergeDayMods(baseEventMods, actorHook.mods);
    const kitchenContext = getProductionQualityContext();
    const rivalPriceBaselineMult = clamp(1 - worldMods.rivalPricePressure * 0.22, 0.78, 1.04);

    state.cleanliness = clamp(state.cleanliness - randInt(2, 6) + mods.cleanliness, 0, 100);
    state.condition = clamp(state.condition - randInt(1, 4) + mods.condition, 0, 100);
    state.reputation = clamp(state.reputation + mods.reputation, 0, 100);

    const weekendMult = weekday === "Fri" || weekday === "Sat" ? 1.22 : 1.0;

    let demandBase =
      24 +
      state.reputation * 0.9 +
      staffStats.service * 1.2 +
      (state.cleanliness + state.condition) * 0.3;
    demandBase =
      demandBase *
      weekendMult *
      location.demandMult *
      district.demandMult *
      travelContext.demandMult *
      worldMods.demandMult;
    demandBase *= shiftContext.demandMult;
    const loyaltyDemandMult = getLoyaltyDemandMultiplier();
    demandBase *= loyaltyDemandMult;

    if (state.marketingDays > 0) {
      demandBase *= 1.17 * location.marketingBoostMult;
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

    const aleDemand = Math.floor(guests * 0.62 * demandByPrice("ale", 6 * rivalPriceBaselineMult));
    const meadDemand = Math.floor(guests * 0.33 * demandByPrice("mead", 8 * rivalPriceBaselineMult));
    const stewDemand = Math.floor(guests * 0.48 * demandByPrice("stew", 10 * rivalPriceBaselineMult));
    const breadDemand = Math.floor(guests * 0.28 * demandByPrice("bread", 4 * rivalPriceBaselineMult));
    const roomDemand = Math.floor(guests * 0.18 * demandByPrice("room", 16 * clamp(1 - worldMods.rivalPricePressure * 0.14, 0.84, 1.05)));

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
    const crownTaxRate = clamp(location.taxRate + worldMods.taxRateBonus, 0.03, 0.36);
    const crownTaxFlat = Math.max(0, location.taxFlat + worldMods.taxFlatBonus + (mods.taxBonus || 0));
    const crownTaxAccrued = crownTaxFlat + Math.max(0, Math.round(revenue * crownTaxRate));
    const auditResult = runCrownAuditCheck(worldMods);
    const operatingExpenses =
      payroll + upkeep + randomLoss + disruptionExpense + Math.max(0, auditResult.immediateExpense || 0);
    const collectionResult = resolveCrownCollection(crownTaxAccrued, revenue, operatingExpenses);
    const crownTaxPaid = collectionResult.taxPayment;
    const expenses = operatingExpenses + crownTaxPaid;

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
      supplierSummary,
      rivalSummary,
      kitchen: Math.round(kitchenContext.score),
      satisfaction: Math.round(satisfaction * 100),
      crownTax: crownTaxAccrued,
      crownDue: collectionResult.dueToday,
      crownPayment: crownTaxPaid,
      district: district.label,
      events: calendarEventSummary,
      actorEvent: actorHook.actorSummary,
      actorSummary: summarizeWorldActorsForReport(),
      crownSummary: collectionResult.collectionSummary,
      compliance: getCrownAuthority().complianceScore,
      rivalPressure: Math.round(worldMods.rivalPressure * 100),
      reputationSummary: state.world.reputationModel.lastSummary,
      topCohortStandingLabel: "Locals",
      topCohortStandingScore: state.world.reputationModel.cohorts.locals,
      lowCohortStandingLabel: "Locals",
      lowCohortStandingScore: state.world.reputationModel.cohorts.locals,
      topGroupStandingLabel: "Crown Tax Office",
      topGroupStandingScore: state.world.reputationModel.groups.crown_office.score,
      lowGroupStandingLabel: "Crown Tax Office",
      lowGroupStandingScore: state.world.reputationModel.groups.crown_office.score,
      crownComplianceStanding: state.world.reputationModel.crownComplianceStanding,
      worldLayerSummary: state.lastReport.worldLayerSummary || "World layer updates pending for today.",
      weeklyWorldSummary: state.world.reporting.lastWeeklySummary
    };

    const repSwing = Math.round((satisfaction - 0.64) * 11);
    const rivalReputationDrag = Math.max(
      0,
      Math.round(worldMods.rivalReputationPressure * (satisfaction < 0.62 ? 6 : 3))
    );
    state.reputation = clamp(
      state.reputation +
        repSwing +
        collectionResult.reputationDelta +
        (auditResult.reputationDelta || 0) -
        rivalReputationDrag,
      0,
      100
    );

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
    applyWorldActorDrift(net, satisfaction);
    const reputationModelReport = applyWorldReputationModelDayUpdate({
      satisfaction,
      net,
      rivalPressure: worldMods.rivalPressure,
      supplierVolatility: state.world.suppliers.volatility,
      collectionResult,
      auditResult
    });
    state.lastReport.reputationSummary = reputationModelReport.summary;
    state.lastReport.topCohortStandingLabel = reputationModelReport.topCohortLabel;
    state.lastReport.topCohortStandingScore = reputationModelReport.topCohortScore;
    state.lastReport.lowCohortStandingLabel = reputationModelReport.lowCohortLabel;
    state.lastReport.lowCohortStandingScore = reputationModelReport.lowCohortScore;
    state.lastReport.topGroupStandingLabel = reputationModelReport.topGroupLabel;
    state.lastReport.topGroupStandingScore = reputationModelReport.topGroupScore;
    state.lastReport.lowGroupStandingLabel = reputationModelReport.lowGroupLabel;
    state.lastReport.lowGroupStandingScore = reputationModelReport.lowGroupScore;
    state.lastReport.crownComplianceStanding = reputationModelReport.crownComplianceStanding;
    state.lastReport.worldLayerSummary =
      `District ${district.label}. ${calendarEventSummary} ` +
      `Influence: ${actorHook.actorSummary} ` +
      `Crown: ${collectionResult.collectionSummary} ` +
      `Supplier: ${supplierSummary} ` +
      `Rival: ${rivalSummary} ` +
      `Reputation: ${reputationModelReport.summary}`;
    const weeklyWorldReport = updateWorldReportingState({
      guests,
      net,
      crownTaxAccrued,
      crownTaxPaid,
      compliance: state.lastReport.compliance,
      supplierVolatility: state.world.suppliers.volatility,
      supplierSummary,
      rivalPressure: state.lastReport.rivalPressure,
      eventSummary: calendarEventSummary
    });
    state.lastReport.weeklyWorldSummary = weeklyWorldReport.weeklySummary;
    state.lastReport.actorSummary = summarizeWorldActorsForReport();
    decayWorldEffects();

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
    if (travelContext.inTransitToday) {
      logLine(
        `Travel day in progress (${travelContext.currentDistrict} -> ${travelContext.destinationDistrict}). Demand and events were muted.`,
        "neutral"
      );
    }
    if (auditResult.auditTriggered) {
      logLine(auditResult.summary, auditResult.tone || "neutral");
    }
    if (collectionResult.dueToday > 0) {
      logLine(collectionResult.collectionSummary, collectionResult.reputationDelta < 0 ? "bad" : "neutral");
    }
    if (rivalReputationDrag >= 2) {
      logLine("Rival tavern chatter eroded goodwill by day end.", "bad");
    }
    if (weeklyWorldReport.weekClosed) {
      logLine(state.lastReport.weeklyWorldSummary, "neutral");
    }

    logLine(
      `Day ${state.day} closed in ${district.label}: ${guests} guests, revenue ${formatCoin(revenue)}, crown accrued ${formatCoin(crownTaxAccrued)}, paid ${formatCoin(crownTaxPaid)}, net ${formatCoin(net)}.`,
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

  function rollDailyEvent(travelEventChanceMult = 1, actorEventChanceMult = 1) {
    const location = getActiveLocationProfile();
    const district = getCurrentDistrictProfile();
    return rollDailyEventModel(state, {
      randInt,
      pick,
      randomFloat: () => random.nextFloat(),
      logLine,
      eventChanceMult:
        location.eventChanceMult *
        district.eventChanceMult *
        travelEventChanceMult *
        actorEventChanceMult,
      eventWeights: location.eventWeights
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
  normalizeWorldState();
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

function startNewGame(seedLike = null, startingLocationOrOptions = null) {
  let normalizedSeed = seedLike;
  let selectedLocation = startingLocationOrOptions;
  if (seedLike && typeof seedLike === "object" && !Array.isArray(seedLike)) {
    normalizedSeed = seedLike.seed ?? null;
    selectedLocation = seedLike.startingLocation ?? seedLike.location ?? null;
  } else if (startingLocationOrOptions && typeof startingLocationOrOptions === "object") {
    selectedLocation =
      startingLocationOrOptions.startingLocation ?? startingLocationOrOptions.location ?? null;
  }
  const startingLocation = resolveStartingLocation(selectedLocation).id;

  if (normalizedSeed === null || normalizedSeed === undefined || normalizedSeed === "") {
    clearRandomSeed();
  } else if (!setRandomSeed(normalizedSeed)) {
    return { ok: false, error: "Seed must be a valid number." };
  }

  applyStateSnapshot(createInitialState(startingLocation));
  normalizeWorldState();
  initialized = false;
  initGame();
  return { ok: true, startingLocation };
}

function listScenarios() {
  return listScenarioFixtures();
}

function loadScenario(scenarioId, seedLike = null) {
  const fixture = getScenarioFixture(scenarioId);
  if (!fixture) {
    return {
      ok: false,
      error: `Unknown scenario: ${scenarioId}.`
    };
  }

  const selectedSeed =
    seedLike === null || seedLike === undefined || seedLike === ""
      ? fixture.recommendedSeed
      : seedLike;

  const bootResult = startNewGame(selectedSeed);
  if (!bootResult.ok) {
    return bootResult;
  }

  fixture.apply(state, { createStaff });
  logLine(`Scenario loaded: ${fixture.label}.`, "neutral");
  render();

  return {
    ok: true,
    scenario: fixture.id,
    seed: selectedSeed
  };
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
  normalizeWorldState();
  const location = getActiveLocationProfile();
  const district = getCurrentDistrictProfile();
  initialized = true;
  logLine(`Tavern charter signed in ${location.label} (${location.title}).`, "neutral");
  logLine(`Operating district: ${district.label}.`, "neutral");
  logLine(`Influence watch: ${summarizeWorldActorsForReport()}`, "neutral");
  logLine(location.summary, "neutral");
  logLine("Tip: keep ale and stew stocked before Fridays and Saturdays.", "neutral");
  logLine("Tip: loyal patrons boost future demand. Watch the daily report.", "neutral");
  logLine("Tip: fatigue builds over time. Use rota presets to protect your staff.", "neutral");
  render();
}

export {
  DAY_NAMES,
  COHORT_PROFILES,
  listStartingLocations,
  listDistricts,
  listWorldActors,
  getCrownAuthorityStatus,
  getSupplierNetworkStatus,
  getRivalStatus,
  getWorldReputationStatus,
  getWorldLayerStatus,
  listTravelOptions,
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
  listScenarios,
  loadScenario,
  getStaffStats,
  setRotaPreset,
  startDistrictTravel,
  fileComplianceReport,
  settleCrownArrears,
  signLocalBrokerContract,
  signArcanumWholesaleContract,
  scheduleCityStockRun,
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
