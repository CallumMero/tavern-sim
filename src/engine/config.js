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
