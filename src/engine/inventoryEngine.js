import { SUPPLY_META } from "./config.js";

function isSupplyItem(item) {
  return Boolean(SUPPLY_META[item]);
}

function createSupplyStats(tools) {
  const { randInt, clamp } = tools;
  const stats = {};
  for (const item in SUPPLY_META) {
    stats[item] = {
      quality: clamp(SUPPLY_META[item].baseQuality + randInt(-8, 8), 35, 95),
      freshness: randInt(62, 86)
    };
  }
  return stats;
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

function evaluateIngredientBlend(consumes, supplyStats, tools) {
  const { clamp } = tools;
  let qualityTotal = 0;
  let freshnessTotal = 0;
  let weight = 0;

  for (const item in consumes) {
    if (!isSupplyItem(item)) {
      continue;
    }
    const amount = consumes[item];
    qualityTotal += supplyStats[item].quality * amount;
    freshnessTotal += supplyStats[item].freshness * amount;
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

function getProductionQualityContext(productionQualitySum, productionBatches) {
  if (productionBatches === 0) {
    return { score: 60, boost: 0 };
  }
  const score = productionQualitySum / productionBatches;
  return {
    score,
    boost: Math.round((score - 60) / 7)
  };
}

function resetProductionQualityContext(state) {
  state.productionQualitySum = 0;
  state.productionBatches = 0;
}

function applySupplySpoilage(inventory, supplyStats, cleanliness, tools) {
  const { randInt, clamp } = tools;
  const spoiled = [];

  for (const item in SUPPLY_META) {
    const quantity = inventory[item];
    if (quantity <= 0) {
      continue;
    }

    const meta = SUPPLY_META[item];
    const hygienePenalty = item === "meat" || item === "veg" || item === "bread"
      ? Math.max(0, Math.floor((52 - cleanliness) / 12))
      : 0;

    const freshnessLoss = randInt(meta.lossMin, meta.lossMax) + hygienePenalty;
    supplyStats[item].freshness = clamp(supplyStats[item].freshness - freshnessLoss, 0, 100);
    supplyStats[item].quality = clamp(supplyStats[item].quality - randInt(0, 2), 15, 100);

    if (meta.spoilAt < 0 || supplyStats[item].freshness >= meta.spoilAt) {
      continue;
    }

    const freshnessGap = meta.spoilAt - supplyStats[item].freshness;
    const spoilRate = 0.03 + freshnessGap / 120;
    const lost = Math.min(quantity, Math.max(1, Math.floor(quantity * spoilRate)));
    inventory[item] -= lost;
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

export {
  SUPPLY_META,
  createSupplyStats,
  isSupplyItem,
  qualityTier,
  evaluateIngredientBlend,
  getProductionQualityContext,
  resetProductionQualityContext,
  applySupplySpoilage
};
