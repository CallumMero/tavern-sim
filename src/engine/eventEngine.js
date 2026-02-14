const SEASON_LENGTH = 28;
const YEAR_LENGTH = SEASON_LENGTH * 4;
const SEASONS = [
  { id: "spring", label: "Spring", start: 1, end: 28 },
  { id: "summer", label: "Summer", start: 29, end: 56 },
  { id: "harvest", label: "Harvest", start: 57, end: 84 },
  { id: "winter", label: "Winter", start: 85, end: 112 }
];

const DISTRICT_INCIDENT_POOLS = {
  arcanum_market: [
    { id: "traveling_bard", label: "Traveling Bard", weight: 1.05 },
    { id: "market_price_war", label: "Market Price War", weight: 1.1 },
    { id: "permit_slowdown", label: "Permit Slowdown", weight: 0.92 },
    { id: "noble_visit", label: "Noble Procession", weight: 0.82 },
    { id: "bar_brawl", label: "Street Brawl", weight: 0.78 },
    { id: "artisan_showcase", label: "Artisan Showcase", weight: 0.74 },
    { id: "rainstorm", label: "Rainstorm", weight: 0.68 }
  ],
  arcanum_docks: [
    { id: "merchant_caravan", label: "Cargo Caravan", weight: 1.12 },
    { id: "dock_strike", label: "Dock Strike", weight: 0.88 },
    { id: "smuggler_bust", label: "Smuggler Bust", weight: 0.92 },
    { id: "spoiled_cask", label: "Spoiled Cask", weight: 0.84 },
    { id: "rainstorm", label: "Harbor Rainstorm", weight: 0.86 },
    { id: "noble_visit", label: "Admiralty Banquet", weight: 0.68 },
    { id: "traveling_bard", label: "Shanty Bard", weight: 0.72 }
  ],
  meadowbrook_square: [
    { id: "village_feast", label: "Village Feast", weight: 1.14 },
    { id: "chapel_fundraiser", label: "Chapel Fundraiser", weight: 0.93 },
    { id: "merchant_caravan", label: "Passing Traders", weight: 0.95 },
    { id: "patrol_presence", label: "Constable Patrol", weight: 0.74 },
    { id: "traveling_bard", label: "Green Bard", weight: 0.84 },
    { id: "rainstorm", label: "River Rain", weight: 0.9 },
    { id: "bar_brawl", label: "Square Scuffle", weight: 0.56 }
  ],
  meadowbrook_wharf: [
    { id: "fish_run", label: "Fish Run", weight: 1.04 },
    { id: "river_flood", label: "River Flood", weight: 0.86 },
    { id: "merchant_caravan", label: "Wharf Caravan", weight: 1.08 },
    { id: "smuggler_bust", label: "Boat Contraband Bust", weight: 0.78 },
    { id: "spoiled_cask", label: "Wet Casks", weight: 0.72 },
    { id: "traveling_bard", label: "Wharf Minstrel", weight: 0.68 },
    { id: "rainstorm", label: "Storm Front", weight: 0.96 }
  ]
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createBaseMods() {
  return {
    demandMult: 1,
    flatGuests: 0,
    qualityBoost: 0,
    reputation: 0,
    expense: 0,
    cleanliness: 0,
    condition: 0,
    taxBonus: 0,
    eventSummary: "No major district or calendar event today.",
    calendarEventId: "",
    districtEventId: ""
  };
}

function resolveCalendarContext(dayNumber) {
  const day = Math.max(1, Math.round(Number(dayNumber) || 1));
  const year = Math.floor((day - 1) / YEAR_LENGTH) + 1;
  const dayOfYear = ((day - 1) % YEAR_LENGTH) + 1;
  const weekdayIndex = (day - 1) % 7;
  const season = SEASONS.find((entry) => dayOfYear >= entry.start && dayOfYear <= entry.end) || SEASONS[0];
  return {
    day,
    year,
    dayOfYear,
    weekdayIndex,
    seasonId: season.id,
    seasonLabel: season.label,
    dayOfSeason: dayOfYear - season.start + 1
  };
}

function normalizeWeight(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function weightedPick(entries, randomFloat) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const normalized = entries
    .map((entry) => ({
      ...entry,
      weight: normalizeWeight(entry.weight, 1)
    }))
    .filter((entry) => entry.weight > 0);
  if (normalized.length === 0) {
    return null;
  }

  const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = randomFloat() * total;
  for (let i = 0; i < normalized.length; i += 1) {
    cursor -= normalized[i].weight;
    if (cursor <= 0) {
      return normalized[i];
    }
  }
  return normalized[normalized.length - 1];
}

function eventWeightFor(eventId, baseWeight, eventWeights) {
  if (!eventWeights || typeof eventWeights !== "object") {
    return normalizeWeight(baseWeight, 1);
  }
  return normalizeWeight(baseWeight, 1) * normalizeWeight(eventWeights[eventId], 1);
}

function applyCalendarEvent(state, eventId, tools, context, mods) {
  const { randInt, pick } = tools;
  switch (eventId) {
    case "harvest_fair":
      mods.demandMult *= 1 + randInt(12, 24) / 100;
      mods.flatGuests += randInt(10, 25);
      mods.reputation += 1;
      mods.cleanliness -= randInt(1, 4);
      return {
        tone: "good",
        summary: `Harvest fair crowds filled ${context.seasonLabel} stalls and spilled into your hall.`
      };
    case "civic_festival":
      mods.demandMult *= 1 + randInt(9, 18) / 100;
      mods.flatGuests += randInt(6, 16);
      mods.reputation += 1;
      mods.cleanliness -= randInt(1, 3);
      return {
        tone: "good",
        summary: "Civic festival permits opened late-night trade lanes around your district."
      };
    case "caravan_arrival": {
      mods.demandMult *= 1 + randInt(7, 15) / 100;
      mods.flatGuests += randInt(8, 20);
      const supply = pick(["grain", "hops", "honey", "meat", "veg", "wood"]);
      const amount = randInt(2, 7);
      if (state.inventory && Number.isFinite(state.inventory[supply])) {
        state.inventory[supply] += amount;
      }
      return {
        tone: "good",
        summary: `A caravan convoy arrived with traffic and bonus ${supply} stock (+${amount}).`
      };
    }
    case "war_levy":
      mods.demandMult *= 1 - randInt(8, 16) / 100;
      mods.expense += randInt(9, 24);
      mods.reputation -= 1;
      mods.taxBonus += randInt(2, 8);
      return {
        tone: "bad",
        summary: "War levy officers requisitioned resources and tightened district tax pressure."
      };
    case "royal_tax_audit": {
      const crown = state.world && state.world.crown ? state.world.crown : null;
      const weakRecords =
        (crown && crown.complianceScore < 56) ||
        state.cleanliness < 45 ||
        state.condition < 45;
      if (weakRecords) {
        mods.expense += randInt(10, 22);
        mods.taxBonus += randInt(2, 7);
        mods.reputation -= 1;
        return {
          tone: "bad",
          summary: "Royal audit circuit flagged weak records and raised immediate levy demands."
        };
      }
      mods.reputation += 1;
      mods.demandMult *= 1.03;
      return {
        tone: "good",
        summary: "Royal audit circuit passed your ledgers and publicly endorsed your operation."
      };
    }
    default:
      return null;
  }
}

function applyDistrictIncident(state, eventId, tools, context, mods) {
  const { randInt } = tools;
  switch (eventId) {
    case "traveling_bard":
      mods.demandMult *= 1.1;
      mods.reputation += 1;
      return {
        tone: "good",
        summary: "A traveling bard praised your tavern across nearby markets."
      };
    case "merchant_caravan":
      mods.flatGuests += randInt(12, 28);
      mods.demandMult *= 1.07;
      return {
        tone: "good",
        summary: "A merchant caravan swelled district footfall."
      };
    case "bar_brawl":
      mods.demandMult *= 0.88;
      mods.condition -= randInt(3, 7);
      mods.cleanliness -= randInt(3, 7);
      mods.reputation -= 1;
      return {
        tone: "bad",
        summary: "A public brawl damaged furnishings and scared off customers."
      };
    case "spoiled_cask": {
      const lostAle = Math.min(state.inventory.ale, randInt(6, 14));
      state.inventory.ale -= lostAle;
      mods.reputation -= 1;
      return {
        tone: "bad",
        summary: `A spoiled cask forced disposal of ${lostAle} ale.`
      };
    }
    case "noble_visit":
      mods.demandMult *= 1.08;
      mods.qualityBoost += 6;
      mods.reputation += 2;
      return {
        tone: "good",
        summary: "A noble entourage dined nearby and spread favorable gossip."
      };
    case "rainstorm":
      mods.demandMult *= 0.86;
      mods.cleanliness -= 3;
      return {
        tone: "bad",
        summary: "Heavy rain cut district traffic and tracked mud through the floor."
      };
    case "market_price_war":
      mods.demandMult *= 0.9;
      mods.reputation -= 1;
      return {
        tone: "bad",
        summary: "Competing taverns launched a short price war in your block."
      };
    case "permit_slowdown":
      mods.expense += randInt(7, 16);
      mods.reputation -= 1;
      return {
        tone: "bad",
        summary: "Permit clerks delayed district paperwork and fees stacked up."
      };
    case "artisan_showcase":
      mods.demandMult *= 1.06;
      mods.flatGuests += randInt(5, 12);
      mods.reputation += 1;
      return {
        tone: "good",
        summary: "An artisan showcase drew craft patrons into the district."
      };
    case "dock_strike":
      mods.demandMult *= 0.9;
      mods.expense += randInt(8, 18);
      return {
        tone: "bad",
        summary: "Dock strike disruptions reduced deliveries and raised operating costs."
      };
    case "smuggler_bust":
      mods.demandMult *= 0.94;
      mods.expense += randInt(6, 14);
      mods.reputation -= 1;
      return {
        tone: "bad",
        summary: "A contraband bust tightened inspections across nearby routes."
      };
    case "village_feast":
      mods.demandMult *= 1.1;
      mods.flatGuests += randInt(7, 16);
      mods.reputation += 1;
      return {
        tone: "good",
        summary: "Village feast traffic created a strong evening service run."
      };
    case "chapel_fundraiser":
      mods.expense += randInt(4, 10);
      mods.reputation += 1;
      return {
        tone: "neutral",
        summary: "Local fundraiser solicited donations; goodwill rose but costs followed."
      };
    case "patrol_presence":
      mods.demandMult *= 0.97;
      mods.reputation += 1;
      return {
        tone: "neutral",
        summary: "Constable patrols kept order but trimmed late-night lingerers."
      };
    case "river_flood":
      mods.demandMult *= 0.83;
      mods.cleanliness -= randInt(3, 7);
      mods.expense += randInt(5, 13);
      return {
        tone: "bad",
        summary: "River flooding disrupted wharf traffic and cleanup costs spiked."
      };
    case "fish_run":
      state.inventory.meat += randInt(2, 6);
      mods.flatGuests += randInt(4, 11);
      mods.demandMult *= 1.04;
      return {
        tone: "good",
        summary: "A strong fish run boosted local trade and kitchen sourcing."
      };
    default:
      return null;
  }
}

function getCoreCalendarCandidates(state, context, eventWeights) {
  const locationId =
    (state.world && (state.world.activeLocation || state.world.startingLocation)) || "arcanum";
  const districtId = (state.world && state.world.currentDistrict) || "arcanum_market";
  const crown = state.world && state.world.crown ? state.world.crown : null;
  const cycleDay = ((context.day - 1) % 28) + 1;
  const daysUntilCollection = crown ? crown.nextCollectionDay - context.day : 99;
  const arrearsPressure = crown ? clamp(crown.arrears / 500, 0, 0.42) : 0;
  const compliancePressure = crown ? clamp((60 - crown.complianceScore) / 100, 0, 0.33) : 0;
  const weekdayBoost = context.weekdayIndex >= 3 && context.weekdayIndex <= 5 ? 1 : 0.78;
  const districtIsRiver = districtId.includes("wharf") || districtId.includes("docks");
  const districtIsVillage = districtId.startsWith("meadowbrook");
  const districtIsCity = districtId.startsWith("arcanum");

  const candidates = [];
  if (context.seasonId === "harvest" && context.dayOfSeason >= 8 && context.dayOfSeason <= 21) {
    const baseWeight = districtIsVillage ? 1.48 : districtIsCity ? 0.86 : 1;
    candidates.push({
      id: "harvest_fair",
      label: "Harvest Fair",
      weight: eventWeightFor("harvest_fair", baseWeight * 0.45, eventWeights)
    });
  }

  if (context.seasonId !== "winter" && [7, 14, 21, 28].includes(context.dayOfSeason)) {
    const baseWeight = districtIsCity ? 1.1 : 1.2;
    candidates.push({
      id: "civic_festival",
      label: "Civic Festival",
      weight: eventWeightFor("civic_festival", baseWeight * 0.33, eventWeights)
    });
  }

  if (weekdayBoost >= 1) {
    const baseWeight = districtIsRiver ? 1.38 : districtIsVillage ? 1.1 : 0.96;
    candidates.push({
      id: "caravan_arrival",
      label: "Caravan Arrival",
      weight: eventWeightFor("caravan_arrival", baseWeight * 0.38, eventWeights)
    });
  }

  if (cycleDay >= 19 && cycleDay <= 23) {
    const baseWeight = locationId === "arcanum" ? 1.3 : 0.92;
    candidates.push({
      id: "war_levy",
      label: "War Levy",
      weight: eventWeightFor("war_levy", baseWeight * 0.28, eventWeights)
    });
  }

  if (daysUntilCollection <= 2 || arrearsPressure > 0 || compliancePressure > 0.05) {
    const baseWeight = 0.34 + arrearsPressure + compliancePressure;
    candidates.push({
      id: "royal_tax_audit",
      label: "Royal Tax Audit",
      weight: eventWeightFor("royal_tax_audit", baseWeight, eventWeights)
    });
  }

  return candidates;
}

function rollCoreCalendarEvent(state, tools, context, eventChanceMult, eventWeights, mods) {
  const { randomFloat, logLine } = tools;
  const candidates = getCoreCalendarCandidates(state, context, eventWeights);
  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const slotChance = clamp((0.12 + totalWeight) * eventChanceMult, 0.08, 0.85);
  if (randomFloat() > slotChance) {
    return null;
  }

  const selected = weightedPick(candidates, randomFloat);
  if (!selected) {
    return null;
  }

  const applied = applyCalendarEvent(state, selected.id, tools, context, mods);
  if (!applied) {
    return null;
  }

  mods.calendarEventId = selected.id;
  logLine(applied.summary, applied.tone);
  return applied.summary;
}

function getDistrictIncidentPool(districtId) {
  if (DISTRICT_INCIDENT_POOLS[districtId]) {
    return DISTRICT_INCIDENT_POOLS[districtId];
  }
  return DISTRICT_INCIDENT_POOLS.arcanum_market;
}

function toProbabilityRows(entries, slotChance, limit = 4) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const totalWeight = entries.reduce((sum, entry) => sum + normalizeWeight(entry.weight, 1), 0);
  if (totalWeight <= 0 || slotChance <= 0) {
    return [];
  }
  return entries
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      chance: Math.round(clamp(slotChance * (normalizeWeight(entry.weight, 1) / totalWeight), 0, 1) * 1000) / 1000
    }))
    .sort((a, b) => b.chance - a.chance || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, Math.round(Number(limit) || 4)));
}

function getEventCalendarOutlook(state, options = {}) {
  const safeState = state && typeof state === "object" ? state : {};
  const baseDay = Math.max(1, Math.round(Number(safeState.day) || 1));
  const days = Math.max(1, Math.min(21, Math.round(Number(options.days) || 7)));
  const startOffset = Math.max(0, Math.round(Number(options.startOffset) || 1));
  const eventChanceMult = clamp(Number(options.eventChanceMult) || 1, 0.25, 2.5);
  const eventWeights = options.eventWeights && typeof options.eventWeights === "object"
    ? options.eventWeights
    : null;
  const rivalCount =
    safeState.world && Array.isArray(safeState.world.rivalTaverns)
      ? safeState.world.rivalTaverns.length
      : 0;
  const districtId = safeState.world && typeof safeState.world.currentDistrict === "string"
    ? safeState.world.currentDistrict
    : "arcanum_market";

  const entries = [];
  for (let i = 0; i < days; i += 1) {
    const day = baseDay + startOffset + i;
    const context = resolveCalendarContext(day);
    const calendarCandidates = getCoreCalendarCandidates(safeState, context, eventWeights)
      .filter((entry) => normalizeWeight(entry.weight, 0) > 0);
    const districtCandidates = getDistrictIncidentPool(districtId)
      .map((entry) => ({
        ...entry,
        weight: eventWeightFor(entry.id, entry.weight, eventWeights)
      }))
      .filter((entry) => normalizeWeight(entry.weight, 0) > 0);
    const calendarWeight = calendarCandidates.reduce((sum, entry) => sum + normalizeWeight(entry.weight, 1), 0);
    const calendarSlotChance =
      calendarWeight > 0
        ? clamp((0.12 + calendarWeight) * eventChanceMult, 0.08, 0.85)
        : 0;
    const districtSlotChance = clamp((0.19 + rivalCount * 0.03) * eventChanceMult, 0.1, 0.82);
    const calendarRows = toProbabilityRows(calendarCandidates, calendarSlotChance);
    const districtRows = toProbabilityRows(districtCandidates, districtSlotChance);

    entries.push({
      day,
      seasonId: context.seasonId,
      seasonLabel: context.seasonLabel,
      dayOfSeason: context.dayOfSeason,
      weekdayIndex: context.weekdayIndex,
      calendar: {
        slotChance: Math.round(calendarSlotChance * 1000) / 1000,
        topEvents: calendarRows
      },
      district: {
        slotChance: Math.round(districtSlotChance * 1000) / 1000,
        topEvents: districtRows
      }
    });
  }

  const highlights = entries
    .map((entry) => {
      const calendarTop = entry.calendar.topEvents[0];
      const districtTop = entry.district.topEvents[0];
      if (!calendarTop && !districtTop) {
        return null;
      }
      const dayLabel = `D${entry.day}`;
      if (calendarTop && districtTop) {
        return `${dayLabel}: ${calendarTop.label} ${Math.round(calendarTop.chance * 100)}% / ${districtTop.label} ${Math.round(districtTop.chance * 100)}%.`;
      }
      const top = calendarTop || districtTop;
      return `${dayLabel}: ${top.label} ${Math.round(top.chance * 100)}%.`;
    })
    .filter(Boolean)
    .slice(0, 5);

  return {
    generatedFromDay: baseDay,
    startsOnDay: baseDay + startOffset,
    horizonDays: days,
    eventChanceMult,
    districtId,
    entries,
    highlights
  };
}

function rollDistrictIncident(state, tools, context, eventChanceMult, eventWeights, mods) {
  const { randomFloat, logLine } = tools;
  const districtId = (state.world && state.world.currentDistrict) || "arcanum_market";
  const rivalCount =
    state.world && Array.isArray(state.world.rivalTaverns) ? state.world.rivalTaverns.length : 0;
  const pool = getDistrictIncidentPool(districtId)
    .map((entry) => ({
      ...entry,
      weight: eventWeightFor(entry.id, entry.weight, eventWeights)
    }))
    .filter((entry) => entry.weight > 0);

  const incidentChance = clamp((0.19 + rivalCount * 0.03) * eventChanceMult, 0.1, 0.82);
  if (randomFloat() > incidentChance) {
    return null;
  }

  const selected = weightedPick(pool, randomFloat);
  if (!selected) {
    return null;
  }

  const applied = applyDistrictIncident(state, selected.id, tools, context, mods);
  if (!applied) {
    return null;
  }

  mods.districtEventId = selected.id;
  logLine(applied.summary, applied.tone);
  return applied.summary;
}

function rollDailyEvent(state, tools) {
  const {
    eventChanceMult = 1,
    eventWeights = null
  } = tools;

  const context = resolveCalendarContext(state.day);
  const mods = createBaseMods();

  const calendarSummary = rollCoreCalendarEvent(
    state,
    tools,
    context,
    eventChanceMult,
    eventWeights,
    mods
  );
  const districtSummary = rollDistrictIncident(
    state,
    tools,
    context,
    eventChanceMult,
    eventWeights,
    mods
  );

  if (calendarSummary && districtSummary) {
    mods.eventSummary = `${calendarSummary} ${districtSummary}`;
  } else if (calendarSummary) {
    mods.eventSummary = calendarSummary;
  } else if (districtSummary) {
    mods.eventSummary = districtSummary;
  }

  return mods;
}

export { rollDailyEvent, getEventCalendarOutlook };
