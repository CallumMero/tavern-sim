function setInventoryLevels(state, overrides) {
  for (const item in overrides) {
    state.inventory[item] = overrides[item];
  }
}

function setSupplyLevels(state, overrides) {
  for (const item in overrides) {
    if (!state.supplyStats[item]) {
      continue;
    }
    const next = overrides[item];
    if (typeof next.quality === "number") {
      state.supplyStats[item].quality = next.quality;
    }
    if (typeof next.freshness === "number") {
      state.supplyStats[item].freshness = next.freshness;
    }
  }
}

function setStaffStats(person, overrides) {
  for (const key in overrides) {
    person[key] = overrides[key];
  }
}

function getStaffByRole(state, role) {
  return state.staff.find((person) => person.role === role) || null;
}

function getOrCreateStaff(state, role, tools) {
  const existing = getStaffByRole(state, role);
  if (existing) {
    return existing;
  }
  const created = tools.createStaff(role);
  state.staff.push(created);
  return created;
}

const SCENARIO_FIXTURES = [
  {
    id: "baseline",
    label: "Baseline Start",
    description: "Fresh charter with stable conditions for reference balancing.",
    recommendedSeed: 101,
    regressionDays: 14,
    apply() {}
  },
  {
    id: "cash_crunch",
    label: "Cash Crunch",
    description: "Low gold, weak service quality, and thin inventory under wage pressure.",
    recommendedSeed: 2026,
    regressionDays: 21,
    apply(state, tools) {
      state.day = 26;
      state.gold = 22;
      state.reputation = 35;
      state.condition = 41;
      state.cleanliness = 43;
      state.marketingDays = 0;
      state.festivalDays = 0;
      state.rotaPreset = "night_heavy";
      state.prices = {
        ale: 7,
        mead: 10,
        stew: 11,
        bread: 5,
        room: 21
      };

      setInventoryLevels(state, {
        ale: 8,
        mead: 4,
        stew: 6,
        bread: 6,
        grain: 3,
        hops: 2,
        honey: 1,
        meat: 2,
        veg: 3,
        wood: 4
      });

      setSupplyLevels(state, {
        grain: { quality: 49, freshness: 28 },
        hops: { quality: 46, freshness: 26 },
        honey: { quality: 62, freshness: 42 },
        meat: { quality: 41, freshness: 34 },
        veg: { quality: 45, freshness: 31 },
        bread: { quality: 44, freshness: 35 },
        wood: { quality: 70, freshness: 86 }
      });

      setStaffStats(getOrCreateStaff(state, "barkeep", tools), {
        morale: 44,
        fatigue: 73,
        injuryDays: 0,
        disputeDays: 0
      });
      setStaffStats(getOrCreateStaff(state, "cook", tools), {
        morale: 47,
        fatigue: 68,
        injuryDays: 0,
        disputeDays: 1
      });
      setStaffStats(getOrCreateStaff(state, "server", tools), {
        morale: 46,
        fatigue: 71,
        injuryDays: 0,
        disputeDays: 0
      });
      setStaffStats(getOrCreateStaff(state, "guard", tools), {
        morale: 52,
        fatigue: 58,
        injuryDays: 0,
        disputeDays: 0
      });
    }
  },
  {
    id: "festival_surge",
    label: "Festival Surge",
    description: "Strong reputation and demand buffs with extra staffing and healthy supplies.",
    recommendedSeed: 77,
    regressionDays: 18,
    apply(state, tools) {
      state.day = 40;
      state.gold = 420;
      state.reputation = 68;
      state.condition = 76;
      state.cleanliness = 72;
      state.marketingDays = 2;
      state.festivalDays = 1;
      state.rotaPreset = "night_heavy";
      state.prices = {
        ale: 7,
        mead: 9,
        stew: 11,
        bread: 5,
        room: 19
      };

      setInventoryLevels(state, {
        ale: 86,
        mead: 52,
        stew: 64,
        bread: 58,
        grain: 35,
        hops: 24,
        honey: 20,
        meat: 28,
        veg: 30,
        wood: 36
      });

      setSupplyLevels(state, {
        grain: { quality: 76, freshness: 83 },
        hops: { quality: 74, freshness: 81 },
        honey: { quality: 80, freshness: 85 },
        meat: { quality: 72, freshness: 79 },
        veg: { quality: 73, freshness: 80 },
        bread: { quality: 75, freshness: 82 },
        wood: { quality: 84, freshness: 93 }
      });

      const extraServer = tools.createStaff("server");
      const extraCook = tools.createStaff("cook");
      state.staff.push(extraServer, extraCook);

      state.staff.forEach((person) => {
        person.morale = Math.max(person.morale, 70);
        person.fatigue = Math.min(person.fatigue, 38);
        person.injuryDays = 0;
        person.disputeDays = 0;
      });
    }
  },
  {
    id: "burnout_edge",
    label: "Burnout Edge",
    description: "Staff are overworked with downtime risks while tavern metrics are mid-range.",
    recommendedSeed: 314,
    regressionDays: 16,
    apply(state, tools) {
      state.day = 58;
      state.gold = 110;
      state.reputation = 48;
      state.condition = 63;
      state.cleanliness = 52;
      state.marketingDays = 0;
      state.festivalDays = 0;
      state.rotaPreset = "day_heavy";
      state.prices = {
        ale: 6,
        mead: 8,
        stew: 10,
        bread: 4,
        room: 17
      };

      setInventoryLevels(state, {
        ale: 36,
        mead: 15,
        stew: 26,
        bread: 20,
        grain: 10,
        hops: 8,
        honey: 6,
        meat: 8,
        veg: 9,
        wood: 12
      });

      setSupplyLevels(state, {
        grain: { quality: 58, freshness: 52 },
        hops: { quality: 57, freshness: 49 },
        honey: { quality: 64, freshness: 55 },
        meat: { quality: 55, freshness: 43 },
        veg: { quality: 56, freshness: 45 },
        bread: { quality: 57, freshness: 44 },
        wood: { quality: 73, freshness: 90 }
      });

      setStaffStats(getOrCreateStaff(state, "barkeep", tools), {
        morale: 46,
        fatigue: 84,
        injuryDays: 0,
        disputeDays: 1
      });
      setStaffStats(getOrCreateStaff(state, "cook", tools), {
        morale: 42,
        fatigue: 88,
        injuryDays: 2,
        disputeDays: 0
      });
      setStaffStats(getOrCreateStaff(state, "server", tools), {
        morale: 45,
        fatigue: 82,
        injuryDays: 0,
        disputeDays: 2
      });
      setStaffStats(getOrCreateStaff(state, "guard", tools), {
        morale: 51,
        fatigue: 67,
        injuryDays: 0,
        disputeDays: 0
      });
    }
  },
  {
    id: "spoilage_alert",
    label: "Spoilage Alert",
    description: "Dirty conditions and aging ingredients pressure production reliability.",
    recommendedSeed: 909,
    regressionDays: 12,
    apply(state, tools) {
      state.day = 33;
      state.gold = 132;
      state.reputation = 43;
      state.condition = 55;
      state.cleanliness = 31;
      state.marketingDays = 1;
      state.festivalDays = 0;
      state.rotaPreset = "balanced";
      state.prices = {
        ale: 6,
        mead: 8,
        stew: 10,
        bread: 4,
        room: 18
      };

      setInventoryLevels(state, {
        ale: 28,
        mead: 12,
        stew: 16,
        bread: 14,
        grain: 18,
        hops: 15,
        honey: 8,
        meat: 16,
        veg: 15,
        wood: 14
      });

      setSupplyLevels(state, {
        grain: { quality: 54, freshness: 20 },
        hops: { quality: 52, freshness: 22 },
        honey: { quality: 60, freshness: 26 },
        meat: { quality: 47, freshness: 33 },
        veg: { quality: 49, freshness: 31 },
        bread: { quality: 50, freshness: 34 },
        wood: { quality: 71, freshness: 86 }
      });

      setStaffStats(getOrCreateStaff(state, "barkeep", tools), {
        morale: 53,
        fatigue: 62,
        injuryDays: 0,
        disputeDays: 0
      });
      setStaffStats(getOrCreateStaff(state, "cook", tools), {
        morale: 50,
        fatigue: 65,
        injuryDays: 0,
        disputeDays: 0
      });
      setStaffStats(getOrCreateStaff(state, "server", tools), {
        morale: 52,
        fatigue: 60,
        injuryDays: 0,
        disputeDays: 0
      });
    }
  }
];

function getScenarioFixture(id) {
  return SCENARIO_FIXTURES.find((fixture) => fixture.id === id) || null;
}

function listScenarioFixtures() {
  return SCENARIO_FIXTURES.map((fixture) => ({
    id: fixture.id,
    label: fixture.label,
    description: fixture.description,
    recommendedSeed: fixture.recommendedSeed,
    regressionDays: fixture.regressionDays
  }));
}

export {
  getScenarioFixture,
  listScenarioFixtures
};
