const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STARTING_LOCATION_PROFILES = {
  arcanum: {
    id: "arcanum",
    label: "Arcanum",
    title: "City Opening",
    summary: "Bustling capital district with high demand and expensive, reliable supplies.",
    homeDistrictId: "arcanum_market",
    demandMult: 1.2,
    marketingBoostMult: 0.92,
    taxRate: 0.14,
    taxFlat: 5,
    eventChanceMult: 1.18,
    eventWeights: {
      traveling_bard: 1.15,
      royal_inspector: 1.35,
      bar_brawl: 1.25,
      merchant_caravan: 1.08,
      spoiled_cask: 1,
      noble_visit: 1.3,
      rainstorm: 0.9,
      harvest_fair: 0.84,
      civic_festival: 1.18,
      caravan_arrival: 1.16,
      war_levy: 1.22,
      royal_tax_audit: 1.26
    },
    supplyCostMult: 1.2,
    supplyQuantityMult: 1.16,
    supplyReliability: 0.96
  },
  meadowbrook: {
    id: "meadowbrook",
    label: "Meadowbrook",
    title: "Village Opening",
    summary: "Quiet river village with local regulars, softer tax pressure, and tighter supply flow.",
    homeDistrictId: "meadowbrook_square",
    demandMult: 0.88,
    marketingBoostMult: 1.16,
    taxRate: 0.08,
    taxFlat: 2,
    eventChanceMult: 0.82,
    eventWeights: {
      traveling_bard: 0.95,
      royal_inspector: 0.7,
      bar_brawl: 0.7,
      merchant_caravan: 1.24,
      spoiled_cask: 0.9,
      noble_visit: 0.72,
      rainstorm: 1.08,
      harvest_fair: 1.32,
      civic_festival: 1.16,
      caravan_arrival: 1.22,
      war_levy: 0.92,
      royal_tax_audit: 0.9
    },
    supplyCostMult: 1,
    supplyQuantityMult: 0.82,
    supplyReliability: 0.78
  }
};

const WORLD_ACTOR_PROFILES = {
  crown_office: {
    id: "crown_office",
    label: "Crown Tax Office",
    summary: "Royal auditors and treasury officials enforcing Calvador tax law.",
    baseStanding: 50,
    baseInfluence: 82
  },
  civic_council: {
    id: "civic_council",
    label: "Civic Council",
    summary: "Local magistrates and permit clerks shaping civil support.",
    baseStanding: 50,
    baseInfluence: 68
  },
  merchant_houses: {
    id: "merchant_houses",
    label: "Merchant Houses",
    summary: "Trade families and brokers controlling contracts and logistics leverage.",
    baseStanding: 50,
    baseInfluence: 74
  },
  underworld_network: {
    id: "underworld_network",
    label: "Underworld Network",
    summary: "Smugglers and fixers influencing risk, rumors, and quiet supply channels.",
    baseStanding: 50,
    baseInfluence: 52
  }
};

const LOCATION_ACTOR_STANDING_BIAS = {
  arcanum: {
    crown_office: 5,
    civic_council: -2,
    merchant_houses: 6,
    underworld_network: -6
  },
  meadowbrook: {
    crown_office: -3,
    civic_council: 5,
    merchant_houses: -4,
    underworld_network: 3
  }
};

const DISTRICT_PROFILES = {
  arcanum_market: {
    id: "arcanum_market",
    label: "Arcanum Market Ward",
    locationId: "arcanum",
    summary: "Crowded central stalls with premium goods and sharp competition.",
    demandMult: 1.08,
    eventChanceMult: 1.14,
    supplyCostMult: 1.12,
    supplyQuantityMult: 1.1,
    supplyReliability: 0.97,
    actorInfluence: {
      crown_office: 1.18,
      civic_council: 1.06,
      merchant_houses: 1.24,
      underworld_network: 0.78
    },
    rivalTaverns: [
      { id: "coin_and_cauldron", name: "Coin And Cauldron", pressure: 0.17 },
      { id: "brass_lantern", name: "Brass Lantern House", pressure: 0.13 }
    ]
  },
  arcanum_docks: {
    id: "arcanum_docks",
    label: "Arcanum Dockside",
    locationId: "arcanum",
    summary: "River cargo piers with volatile crowds and rotating traders.",
    demandMult: 1.03,
    eventChanceMult: 1.18,
    supplyCostMult: 1.05,
    supplyQuantityMult: 1.18,
    supplyReliability: 0.93,
    actorInfluence: {
      crown_office: 0.96,
      civic_council: 0.92,
      merchant_houses: 1.18,
      underworld_network: 1.22
    },
    rivalTaverns: [
      { id: "salted_anchor", name: "Salted Anchor", pressure: 0.12 }
    ]
  },
  meadowbrook_square: {
    id: "meadowbrook_square",
    label: "Meadowbrook Green",
    locationId: "meadowbrook",
    summary: "Village square trade posts with stable local traffic.",
    demandMult: 0.94,
    eventChanceMult: 0.86,
    supplyCostMult: 0.96,
    supplyQuantityMult: 0.82,
    supplyReliability: 0.81,
    actorInfluence: {
      crown_office: 0.86,
      civic_council: 1.22,
      merchant_houses: 0.9,
      underworld_network: 0.88
    },
    rivalTaverns: [
      { id: "willow_hearth", name: "Willow Hearth", pressure: 0.08 }
    ]
  },
  meadowbrook_wharf: {
    id: "meadowbrook_wharf",
    label: "Meadowbrook River Wharf",
    locationId: "meadowbrook",
    summary: "Seasonal river landing with caravan-heavy supply bursts.",
    demandMult: 0.98,
    eventChanceMult: 0.92,
    supplyCostMult: 0.91,
    supplyQuantityMult: 1.05,
    supplyReliability: 0.85,
    actorInfluence: {
      crown_office: 0.76,
      civic_council: 0.95,
      merchant_houses: 1.06,
      underworld_network: 1.2
    },
    rivalTaverns: [
      { id: "reed_and_ropes", name: "Reed And Ropes", pressure: 0.1 }
    ]
  }
};

const DISTRICT_TRAVEL_LINKS = {
  arcanum_market: {
    arcanum_docks: { days: 1, cost: 6 },
    meadowbrook_square: { days: 2, cost: 18 },
    meadowbrook_wharf: { days: 2, cost: 16 }
  },
  arcanum_docks: {
    arcanum_market: { days: 1, cost: 6 },
    meadowbrook_wharf: { days: 2, cost: 15 },
    meadowbrook_square: { days: 2, cost: 17 }
  },
  meadowbrook_square: {
    meadowbrook_wharf: { days: 1, cost: 5 },
    arcanum_market: { days: 2, cost: 18 },
    arcanum_docks: { days: 2, cost: 17 }
  },
  meadowbrook_wharf: {
    meadowbrook_square: { days: 1, cost: 5 },
    arcanum_docks: { days: 2, cost: 15 },
    arcanum_market: { days: 2, cost: 16 }
  }
};

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

const ROTA_PRESETS = {
  balanced: { label: "Balanced", nightShare: 0.5 },
  day_heavy: { label: "Day Heavy", nightShare: 0.35 },
  night_heavy: { label: "Night Heavy", nightShare: 0.65 }
};

const ROLE_SHIFT_BIAS = {
  server: 0.06,
  cook: -0.12,
  barkeep: 0.22,
  guard: 0.28
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

const SUPPLY_META = {
  grain: {
    label: "Grain",
    baseQuality: 60,
    qualityVariance: 14,
    lossMin: 2,
    lossMax: 4,
    spoilAt: 18
  },
  hops: {
    label: "Hops",
    baseQuality: 62,
    qualityVariance: 13,
    lossMin: 2,
    lossMax: 5,
    spoilAt: 20
  },
  honey: {
    label: "Honey",
    baseQuality: 66,
    qualityVariance: 10,
    lossMin: 1,
    lossMax: 2,
    spoilAt: 8
  },
  meat: {
    label: "Meat",
    baseQuality: 58,
    qualityVariance: 16,
    lossMin: 5,
    lossMax: 9,
    spoilAt: 38
  },
  veg: {
    label: "Veg",
    baseQuality: 61,
    qualityVariance: 14,
    lossMin: 4,
    lossMax: 8,
    spoilAt: 34
  },
  bread: {
    label: "Bread",
    baseQuality: 63,
    qualityVariance: 12,
    lossMin: 5,
    lossMax: 8,
    spoilAt: 40
  },
  wood: {
    label: "Wood",
    baseQuality: 72,
    qualityVariance: 8,
    lossMin: 0,
    lossMax: 1,
    spoilAt: -1
  }
};

export {
  DAY_NAMES,
  STARTING_LOCATION_PROFILES,
  WORLD_ACTOR_PROFILES,
  LOCATION_ACTOR_STANDING_BIAS,
  DISTRICT_PROFILES,
  DISTRICT_TRAVEL_LINKS,
  ROLE_TEMPLATES,
  PRICE_DEFAULTS,
  ROTA_PRESETS,
  ROLE_SHIFT_BIAS,
  COHORT_PROFILES,
  PRODUCT_LABELS,
  PATRON_FIRST_NAMES,
  PATRON_LAST_NAMES,
  SUPPLY_META
};
