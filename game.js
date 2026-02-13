(function () {
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const ROLE_TEMPLATES = {
    server: { wage: 8, service: 16, quality: 2 },
    cook: { wage: 11, service: 8, quality: 7 },
    barkeep: { wage: 12, service: 14, quality: 6 },
    guard: { wage: 10, service: 6, quality: 3 }
  };

  const PRICE_DEFAULTS = {
    ale: 6,
    mead: 8,
    stew: 10,
    bread: 4,
    room: 16
  };

  const COHORT_PROFILES = {
    locals: {
      label: "Locals",
      weight: 0.38,
      preferredProducts: ["ale", "bread", "stew"],
      priceSensitivity: 1.25,
      qualityNeed: 48
    },
    adventurers: {
      label: "Adventurers",
      weight: 0.26,
      preferredProducts: ["ale", "stew", "room"],
      priceSensitivity: 0.95,
      qualityNeed: 52
    },
    merchants: {
      label: "Merchants",
      weight: 0.22,
      preferredProducts: ["mead", "bread", "room"],
      priceSensitivity: 1.05,
      qualityNeed: 56
    },
    nobles: {
      label: "Nobles",
      weight: 0.14,
      preferredProducts: ["mead", "room", "stew"],
      priceSensitivity: 0.65,
      qualityNeed: 66
    }
  };

  const PRODUCT_LABELS = {
    ale: "ale",
    mead: "mead",
    stew: "stew",
    bread: "bread",
    room: "rooms"
  };

  const PATRON_FIRST_NAMES = [
    "Alda",
    "Bram",
    "Cora",
    "Dain",
    "Elsa",
    "Fenn",
    "Galen",
    "Hilda",
    "Iris",
    "Joren",
    "Kara",
    "Lio",
    "Mira",
    "Nolan",
    "Orrin",
    "Pella",
    "Quin",
    "Rhea",
    "Soren",
    "Tamsin",
    "Ulric",
    "Vera",
    "Wren",
    "Yara"
  ];

  const PATRON_LAST_NAMES = [
    "Ashford",
    "Briar",
    "Crowley",
    "Dunlop",
    "Eldergrove",
    "Falk",
    "Grimsby",
    "Hearth",
    "Ironwell",
    "Juniper",
    "Kettle",
    "Longstep",
    "Morrow",
    "Northmill",
    "Oakley",
    "Piper",
    "Quickwater",
    "Rook",
    "Stormer",
    "Thorn",
    "Umber",
    "Vale",
    "Westfall",
    "Yew"
  ];

  const state = {
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
      highlight: "The regular crowd is settling in."
    },
    log: []
  };

  const el = {
    topStats: byId("topStats"),
    inventoryView: byId("inventoryView"),
    priceView: byId("priceView"),
    staffView: byId("staffView"),
    reportView: byId("reportView"),
    logView: byId("logView")
  };

  bindActions();
  logLine("Tavern charter signed. Trade can now begin.", "neutral");
  logLine("Tip: keep ale and stew stocked before Fridays and Saturdays.", "neutral");
  logLine("Tip: loyal patrons boost future demand. Watch the daily report.", "neutral");
  render();

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  function formatCoin(value) {
    const rounded = Math.round(value);
    return `${rounded}g`;
  }

  function createStaff(role) {
    const tpl = ROLE_TEMPLATES[role];
    return {
      id: `${role}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      wage: tpl.wage + randInt(-1, 2),
      service: clamp(tpl.service + randInt(-3, 3), 4, 25),
      quality: clamp(tpl.quality + randInt(-2, 3), 1, 20),
      morale: randInt(52, 76)
    };
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
      id: `patron-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${first} ${last}`,
      cohort,
      preference,
      loyalty: randInt(36, 64),
      visits: 0
    };
  }

  function pickWeightedCohort() {
    const roll = Math.random();
    let threshold = 0;
    for (const cohort in COHORT_PROFILES) {
      threshold += COHORT_PROFILES[cohort].weight;
      if (roll <= threshold) {
        return cohort;
      }
    }
    return "locals";
  }

  function bindActions() {
    byId("nextDayBtn").addEventListener("click", advanceDay);

    byId("brewAleBtn").addEventListener("click", () => {
      craft(
        "Brew Ale",
        { grain: 4, hops: 3, wood: 2 },
        { ale: 28 },
        0,
        2
      );
    });

    byId("brewMeadBtn").addEventListener("click", () => {
      craft(
        "Brew Mead",
        { honey: 4, grain: 2, wood: 2 },
        { mead: 20 },
        0,
        2
      );
    });

    byId("cookStewBtn").addEventListener("click", () => {
      craft(
        "Cook Stew",
        { meat: 4, veg: 4, bread: 2, wood: 1 },
        { stew: 18 },
        0,
        1
      );
    });

    byId("cleanBtn").addEventListener("click", () => {
      if (!spendGold(14, "Deep clean")) {
        return;
      }
      state.cleanliness = clamp(state.cleanliness + 20, 0, 100);
      logLine("You paid for a full scrub and fresh linens (+cleanliness).", "good");
      render();
    });

    byId("repairBtn").addEventListener("click", () => {
      if (!spendGold(40, "Repairs")) {
        return;
      }
      state.condition = clamp(state.condition + 24, 0, 100);
      logLine("Carpenters repaired beams and tables (+condition).", "good");
      render();
    });

    byId("buyGrainBtn").addEventListener("click", () => buySupply("grain", 8, 5));
    byId("buyHopsBtn").addEventListener("click", () => buySupply("hops", 8, 6));
    byId("buyHoneyBtn").addEventListener("click", () => buySupply("honey", 6, 9));
    byId("buyMeatBtn").addEventListener("click", () => buySupply("meat", 6, 8));
    byId("buyVegBtn").addEventListener("click", () => buySupply("veg", 8, 5));
    byId("buyBreadBtn").addEventListener("click", () => buySupply("bread", 10, 4));
    byId("buyWoodBtn").addEventListener("click", () => buySupply("wood", 10, 4));

    byId("hireServerBtn").addEventListener("click", () => hireRole("server", 35));
    byId("hireCookBtn").addEventListener("click", () => hireRole("cook", 45));
    byId("hireBarkeepBtn").addEventListener("click", () => hireRole("barkeep", 42));
    byId("hireGuardBtn").addEventListener("click", () => hireRole("guard", 38));

    byId("trainBtn").addEventListener("click", trainStaff);
    byId("marketingBtn").addEventListener("click", runMarketing);
    byId("festivalBtn").addEventListener("click", hostFestival);

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
    state.inventory[item] += amount;
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
    for (const item in outputs) {
      state.inventory[item] += outputs[item];
    }
    state.cleanliness = clamp(state.cleanliness - dirtPenalty, 0, 100);
    logLine(`${label} completed.`, "good");
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
    const trainee = pick(state.staff);
    const serviceGain = randInt(0, 2);
    const qualityGain = randInt(1, 3);
    trainee.service = clamp(trainee.service + serviceGain, 1, 30);
    trainee.quality = clamp(trainee.quality + qualityGain, 1, 30);
    trainee.morale = clamp(trainee.morale + randInt(2, 6), 0, 100);
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

  function advanceDay() {
    state.day += 1;

    const staffStats = getStaffStats();
    const mods = rollDailyEvent();

    state.cleanliness = clamp(state.cleanliness - randInt(2, 6) + mods.cleanliness, 0, 100);
    state.condition = clamp(state.condition - randInt(1, 4) + mods.condition, 0, 100);
    state.reputation = clamp(state.reputation + mods.reputation, 0, 100);

    const weekday = DAY_NAMES[(state.day - 1) % 7];
    const weekendMult = weekday === "Fri" || weekday === "Sat" ? 1.22 : 1.0;

    let demandBase =
      24 +
      state.reputation * 0.9 +
      staffStats.service * 1.2 +
      (state.cleanliness + state.condition) * 0.3;
    demandBase = demandBase * weekendMult;
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

    const serviceCapacity = 22 + staffStats.service * 1.5;
    const guests = Math.max(0, Math.floor(Math.min(demandBase, serviceCapacity)));

    const qualityScore = clamp(
      30 +
        state.condition * 0.25 +
        state.cleanliness * 0.25 +
        staffStats.quality * 2 +
        (staffStats.avgMorale - 50) * 0.35 +
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
    const expenses = payroll + upkeep + randomLoss;

    const net = revenue - expenses;
    state.gold += net;
    state.lastGuests = guests;
    state.lastRevenue = revenue;
    state.lastExpenses = expenses;
    state.lastNet = net;

    const desiredSales = aleDemand + meadDemand + stewDemand + breadDemand;
    const madeSales = soldAle + soldMead + soldStew + soldBread;
    const fulfillment = desiredSales <= 0 ? 1 : madeSales / desiredSales;
    const satisfaction =
      (qualityScore / 100) * 0.65 + fulfillment * 0.35 - (state.prices.room > 22 ? 0.03 : 0);
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
    state.lastReport = {
      loyaltyDemandMult,
      ...patronReport
    };

    const repSwing = Math.round((satisfaction - 0.64) * 11);
    state.reputation = clamp(state.reputation + repSwing, 0, 100);

    state.staff.forEach((person) => {
      let moraleChange = Math.round((satisfaction - 0.6) * 6);
      if (net < 0) {
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

    logLine(
      `Day ${state.day} closed: ${guests} guests, revenue ${formatCoin(revenue)}, net ${formatCoin(net)}.`,
      net >= 0 ? "good" : "bad"
    );
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
      return { service: 0, quality: 0, avgMorale: 0, payroll: 0 };
    }
    let service = 0;
    let quality = 0;
    let moraleTotal = 0;
    let payroll = 0;

    state.staff.forEach((person) => {
      const moraleScale = 0.75 + person.morale / 200;
      service += person.service * moraleScale;
      quality += person.quality * moraleScale;
      moraleTotal += person.morale;
      payroll += person.wage;
    });

    return {
      service: Math.round(service),
      quality: Math.round(quality),
      avgMorale: moraleTotal / state.staff.length,
      payroll
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

    if (Math.random() < 0.5) {
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
    renderTopStats();
    renderInventory();
    renderPrices();
    renderStaff();
    renderReport();
    renderLog();
  }

  function renderTopStats() {
    const staffStats = getStaffStats();
    const weekday = DAY_NAMES[(state.day - 1) % 7];

    const tiles = [
      `Day ${state.day} (${weekday})`,
      `Gold ${formatCoin(state.gold)}`,
      `Rep ${state.reputation}`,
      `Clean ${state.cleanliness}`,
      `Condition ${state.condition}`,
      `Payroll ${formatCoin(staffStats.payroll)}`,
      `Guests ${state.lastGuests}`,
      `Net ${formatCoin(state.lastNet)}`
    ];

    el.topStats.innerHTML = tiles
      .map((text) => `<div class="chip">${text}</div>`)
      .join("");
  }

  function renderInventory() {
    const list = [
      ["Ale", state.inventory.ale],
      ["Mead", state.inventory.mead],
      ["Stew", state.inventory.stew],
      ["Bread", state.inventory.bread],
      ["Grain", state.inventory.grain],
      ["Hops", state.inventory.hops],
      ["Honey", state.inventory.honey],
      ["Meat", state.inventory.meat],
      ["Veg", state.inventory.veg],
      ["Wood", state.inventory.wood]
    ];
    el.inventoryView.innerHTML = list
      .map(([key, val]) => `<div class="kv-row"><span>${key}</span><span>${val}</span></div>`)
      .join("");
  }

  function renderPrices() {
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

  function renderStaff() {
    el.staffView.innerHTML = state.staff
      .map((person) => {
        return `
          <div class="staff-row">
            <span>${person.role} (S:${person.service} Q:${person.quality} M:${person.morale})</span>
            <span>
              ${formatCoin(person.wage)}
              <button data-fire-id="${person.id}">Fire</button>
            </span>
          </div>
        `;
      })
      .join("");
  }

  function renderReport() {
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
        tone:
          state.lastReport.topCohortLoyalty - state.lastReport.lowCohortLoyalty >= 8
            ? "good"
            : "neutral",
        text: `Sentiment: ${topCohort.label} loyalty ${state.lastReport.topCohortLoyalty}, ${lowCohort.label} loyalty ${state.lastReport.lowCohortLoyalty}.`
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

  function logLine(message, tone) {
    state.log.unshift({ day: state.day, message, tone });
    if (state.log.length > 180) {
      state.log.length = 180;
    }
  }

  function renderLog() {
    el.logView.innerHTML = state.log
      .map((entry) => {
        return `<div class="log-line ${entry.tone}">D${entry.day}: ${entry.message}</div>`;
      })
      .join("");
  }
})();
