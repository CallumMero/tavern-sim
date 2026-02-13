import { createHash } from "node:crypto";
import {
  advanceDay,
  listScenarios,
  loadScenario,
  saveGame
} from "../../src/engine/gameEngine.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

function collectStateErrors(state) {
  const errors = [];

  const boundedStats = [
    ["reputation", state.reputation],
    ["condition", state.condition],
    ["cleanliness", state.cleanliness]
  ];
  boundedStats.forEach(([name, value]) => {
    if (!isFiniteNumber(value) || value < 0 || value > 100) {
      errors.push(`${name} out of range (0-100): ${value}`);
    }
  });

  if (!isInteger(state.day) || state.day < 1) {
    errors.push(`day must be a positive integer: ${state.day}`);
  }
  if (!isFiniteNumber(state.gold)) {
    errors.push(`gold must be finite: ${state.gold}`);
  }
  if (!state.inventory || typeof state.inventory !== "object") {
    errors.push("inventory payload missing");
  } else {
    for (const item in state.inventory) {
      const amount = state.inventory[item];
      if (!isInteger(amount) || amount < 0) {
        errors.push(`inventory ${item} invalid: ${amount}`);
      }
    }
  }

  if (!state.prices || typeof state.prices !== "object") {
    errors.push("prices payload missing");
  } else {
    for (const item in state.prices) {
      const price = state.prices[item];
      if (!isFiniteNumber(price) || price < 1 || price > 40) {
        errors.push(`price ${item} out of range (1-40): ${price}`);
      }
    }
  }

  if (!state.supplyStats || typeof state.supplyStats !== "object") {
    errors.push("supplyStats payload missing");
  } else {
    for (const item in state.supplyStats) {
      const entry = state.supplyStats[item];
      if (!entry || typeof entry !== "object") {
        errors.push(`supplyStats ${item} missing`);
        continue;
      }
      if (!isFiniteNumber(entry.quality) || entry.quality < 0 || entry.quality > 100) {
        errors.push(`supplyStats ${item} quality out of range: ${entry.quality}`);
      }
      if (!isFiniteNumber(entry.freshness) || entry.freshness < 0 || entry.freshness > 100) {
        errors.push(`supplyStats ${item} freshness out of range: ${entry.freshness}`);
      }
    }
  }

  if (!Array.isArray(state.staff) || state.staff.length < 1) {
    errors.push("staff roster must have at least one member");
  } else {
    state.staff.forEach((person, index) => {
      if (!person || typeof person !== "object") {
        errors.push(`staff[${index}] invalid`);
        return;
      }
      if (!person.role) {
        errors.push(`staff[${index}] missing role`);
      }
      if (!isFiniteNumber(person.wage) || person.wage < 1) {
        errors.push(`staff[${index}] wage invalid: ${person.wage}`);
      }
      if (!isFiniteNumber(person.service) || person.service < 1) {
        errors.push(`staff[${index}] service invalid: ${person.service}`);
      }
      if (!isFiniteNumber(person.quality) || person.quality < 1) {
        errors.push(`staff[${index}] quality invalid: ${person.quality}`);
      }
      if (!isFiniteNumber(person.morale) || person.morale < 0 || person.morale > 100) {
        errors.push(`staff[${index}] morale out of range: ${person.morale}`);
      }
      if (!isFiniteNumber(person.fatigue) || person.fatigue < 0 || person.fatigue > 100) {
        errors.push(`staff[${index}] fatigue out of range: ${person.fatigue}`);
      }
      if (!isInteger(person.injuryDays) || person.injuryDays < 0) {
        errors.push(`staff[${index}] injuryDays invalid: ${person.injuryDays}`);
      }
      if (!isInteger(person.disputeDays) || person.disputeDays < 0) {
        errors.push(`staff[${index}] disputeDays invalid: ${person.disputeDays}`);
      }
    });
  }

  if (!Array.isArray(state.patrons)) {
    errors.push("patron list is missing");
  } else {
    state.patrons.forEach((patron, index) => {
      if (!isFiniteNumber(patron.loyalty) || patron.loyalty < 0 || patron.loyalty > 100) {
        errors.push(`patron[${index}] loyalty out of range: ${patron.loyalty}`);
      }
      if (!isInteger(patron.visits) || patron.visits < 0) {
        errors.push(`patron[${index}] visits invalid: ${patron.visits}`);
      }
    });
  }

  if (!Array.isArray(state.log) || state.log.length > 180) {
    errors.push(`log buffer invalid length: ${state.log && state.log.length}`);
  }

  return errors;
}

function createSignature(snapshot) {
  const stablePayload = JSON.stringify({
    random: snapshot.random,
    state: snapshot.state
  });
  return createHash("sha256").update(stablePayload).digest("hex");
}

function runScenario(scenario) {
  const bootResult = loadScenario(scenario.id, scenario.recommendedSeed);
  if (!bootResult.ok) {
    throw new Error(bootResult.error);
  }

  for (let i = 0; i < scenario.regressionDays; i += 1) {
    advanceDay();
  }

  const snapshot = saveGame();
  const errors = collectStateErrors(snapshot.state);
  if (errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  return {
    seed: bootResult.seed,
    signature: createSignature(snapshot)
  };
}

function resolveScenarios(args) {
  const available = listScenarios();
  if (args.length === 0) {
    return available;
  }
  return args.map((id) => {
    const scenario = available.find((entry) => entry.id === id);
    if (!scenario) {
      throw new Error(`Unknown scenario '${id}'. Available: ${available.map((entry) => entry.id).join(", ")}`);
    }
    return scenario;
  });
}

function main() {
  const requested = process.argv.slice(2);
  const scenarios = resolveScenarios(requested);
  const failures = [];

  scenarios.forEach((scenario) => {
    try {
      const firstRun = runScenario(scenario);
      const secondRun = runScenario(scenario);
      if (firstRun.signature !== secondRun.signature) {
        throw new Error(
          `determinism mismatch ${firstRun.signature.slice(0, 12)} != ${secondRun.signature.slice(0, 12)}`
        );
      }
      console.log(
        `[PASS] ${scenario.id} seed=${firstRun.seed} days=${scenario.regressionDays} sig=${firstRun.signature.slice(0, 12)}`
      );
    } catch (error) {
      failures.push({
        scenarioId: scenario.id,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`[FAIL] ${scenario.id}: ${failures[failures.length - 1].error}`);
    }
  });

  if (failures.length > 0) {
    console.error(`\nScenario regression failed (${failures.length}/${scenarios.length}).`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nScenario regression passed (${scenarios.length}/${scenarios.length}).`);
}

main();
