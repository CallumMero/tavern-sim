const UINT32_MAX = 0x100000000;
const LCG_A = 1664525;
const LCG_C = 1013904223;

function normalizeSeed(seedLike) {
  const parsed = Number(seedLike);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return (Math.abs(Math.floor(parsed)) >>> 0);
}

export function createRandomController() {
  const context = {
    mode: "system",
    seed: null,
    state: null
  };

  function nextFloat() {
    if (context.mode === "system") {
      return Math.random();
    }
    context.state = (LCG_A * context.state + LCG_C) >>> 0;
    return context.state / UINT32_MAX;
  }

  function setSeed(seedLike) {
    const normalized = normalizeSeed(seedLike);
    if (normalized === null) {
      return false;
    }
    context.mode = "seeded";
    context.seed = normalized;
    context.state = normalized;
    return true;
  }

  function clearSeed() {
    context.mode = "system";
    context.seed = null;
    context.state = null;
  }

  function randomInt(min, max) {
    return Math.floor(nextFloat() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[randomInt(0, arr.length - 1)];
  }

  function randomId(length = 6) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += alphabet[randomInt(0, alphabet.length - 1)];
    }
    return out;
  }

  function snapshot() {
    return {
      mode: context.mode,
      seed: context.seed,
      state: context.state
    };
  }

  function restore(snapshotLike) {
    if (!snapshotLike || typeof snapshotLike !== "object") {
      clearSeed();
      return;
    }
    if (snapshotLike.mode !== "seeded") {
      clearSeed();
      return;
    }
    const seed = normalizeSeed(snapshotLike.seed);
    const state = normalizeSeed(snapshotLike.state);
    if (seed === null || state === null) {
      clearSeed();
      return;
    }
    context.mode = "seeded";
    context.seed = seed;
    context.state = state;
  }

  return {
    nextFloat,
    randomInt,
    pick,
    randomId,
    setSeed,
    clearSeed,
    snapshot,
    restore
  };
}
