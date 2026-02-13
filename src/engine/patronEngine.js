import {
  COHORT_PROFILES,
  PATRON_FIRST_NAMES,
  PATRON_LAST_NAMES,
  PRICE_DEFAULTS,
  PRODUCT_LABELS
} from "./config.js";

function pickWeightedCohort(randomFloat) {
  const roll = randomFloat();
  let threshold = 0;
  for (const cohort in COHORT_PROFILES) {
    threshold += COHORT_PROFILES[cohort].weight;
    if (roll <= threshold) {
      return cohort;
    }
  }
  return "locals";
}

function createPatron(index, tools) {
  const { randInt, pick, randomId, randomFloat } = tools;
  const cohort = pickWeightedCohort(randomFloat);
  const profile = COHORT_PROFILES[cohort];
  const first = PATRON_FIRST_NAMES[randInt(0, PATRON_FIRST_NAMES.length - 1)];
  const last = PATRON_LAST_NAMES[randInt(0, PATRON_LAST_NAMES.length - 1)];
  const preference = pick(profile.preferredProducts);

  return {
    id: `patron-${index}-${randomId(5)}`,
    name: `${first} ${last}`,
    cohort,
    preference,
    loyalty: randInt(36, 64),
    visits: 0
  };
}

function createPatronPool(count, tools) {
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    pool.push(createPatron(i, tools));
  }
  return pool;
}

function getPatronMoodSnapshot(patrons) {
  const cohortTotals = {};
  for (const cohort in COHORT_PROFILES) {
    cohortTotals[cohort] = { sum: 0, count: 0 };
  }

  let allLoyalty = 0;
  patrons.forEach((patron) => {
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
    avgLoyalty: patrons.length === 0 ? 50 : allLoyalty / patrons.length,
    topCohort,
    lowCohort,
    cohortAverages
  };
}

function getLoyaltyDemandMultiplier(patrons, clamp) {
  const snapshot = getPatronMoodSnapshot(patrons);
  return clamp(0.86 + snapshot.avgLoyalty / 245, 0.88, 1.16);
}

function pickVisitingPatrons(patrons, visitorCount, randInt) {
  const shuffled = patrons.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const swapIndex = randInt(0, i);
    const temp = shuffled[i];
    shuffled[i] = shuffled[swapIndex];
    shuffled[swapIndex] = temp;
  }
  return shuffled.slice(0, Math.min(visitorCount, shuffled.length));
}

function updatePatronLoyalty(args) {
  const {
    patrons,
    dayStats,
    prices,
    randInt,
    clamp
  } = args;

  if (patrons.length === 0) {
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
      : Math.min(patrons.length, Math.max(5, Math.floor(dayStats.guests * 0.44)));

  const visitors = pickVisitingPatrons(patrons, visitorCount, randInt);
  let bestReaction = { patron: null, delta: -999 };
  let worstReaction = { patron: null, delta: 999 };

  visitors.forEach((patron) => {
    const profile = COHORT_PROFILES[patron.cohort];
    const wantedUnits = dayStats.wanted[patron.preference];
    const soldUnits = dayStats.sold[patron.preference];
    const fulfillment = wantedUnits <= 0 ? 1 : soldUnits / wantedUnits;
    const stockDelta = (fulfillment - 0.7) * 2.3;

    const priceRatio = prices[patron.preference] / PRICE_DEFAULTS[patron.preference];
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

  const mood = getPatronMoodSnapshot(patrons);
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

export {
  createPatronPool,
  getLoyaltyDemandMultiplier,
  updatePatronLoyalty
};
