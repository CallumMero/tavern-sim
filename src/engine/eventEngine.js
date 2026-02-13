function rollDailyEvent(state, tools) {
  const { randInt, pick, randomFloat, logLine } = tools;

  const mods = {
    demandMult: 1,
    flatGuests: 0,
    qualityBoost: 0,
    reputation: 0,
    expense: 0,
    cleanliness: 0,
    condition: 0
  };

  if (randomFloat() < 0.5) {
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
    case "spoiled_cask": {
      const lostAle = Math.min(state.inventory.ale, randInt(6, 14));
      state.inventory.ale -= lostAle;
      mods.reputation -= 1;
      logLine(`A spoiled cask forced you to dump ${lostAle} ale.`, "bad");
      break;
    }
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

export { rollDailyEvent };
