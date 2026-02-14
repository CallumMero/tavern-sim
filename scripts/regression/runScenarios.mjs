import { createHash } from "node:crypto";
import {
  advanceDay,
  getWorldLayerStatus,
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

  if (!state.lastReport || typeof state.lastReport !== "object") {
    errors.push("lastReport payload missing");
  } else if (typeof state.lastReport.events !== "string") {
    errors.push("lastReport.events missing");
  } else {
    if (typeof state.lastReport.worldLayerSummary !== "string") {
      errors.push("lastReport.worldLayerSummary missing");
    }
    if (typeof state.lastReport.weeklyWorldSummary !== "string") {
      errors.push("lastReport.weeklyWorldSummary missing");
    }
    if (typeof state.lastReport.reputationSummary !== "string") {
      errors.push("lastReport.reputationSummary missing");
    }
    const reputationFields = [
      ["topCohortStandingScore", state.lastReport.topCohortStandingScore],
      ["lowCohortStandingScore", state.lastReport.lowCohortStandingScore],
      ["topGroupStandingScore", state.lastReport.topGroupStandingScore],
      ["lowGroupStandingScore", state.lastReport.lowGroupStandingScore],
      ["crownComplianceStanding", state.lastReport.crownComplianceStanding]
    ];
    reputationFields.forEach(([name, value]) => {
      if (!isFiniteNumber(value) || value < 0 || value > 100) {
        errors.push(`lastReport ${name} out of range: ${value}`);
      }
    });
  }

  if (!state.world || typeof state.world !== "object") {
    errors.push("world payload missing");
  } else {
    if (!state.world.currentDistrict || typeof state.world.currentDistrict !== "string") {
      errors.push("world.currentDistrict missing");
    }
    if (!state.world.activeLocation || typeof state.world.activeLocation !== "string") {
      errors.push("world.activeLocation missing");
    }
    if (!state.world.actors || typeof state.world.actors !== "object") {
      errors.push("world.actors payload missing");
    } else {
      for (const actorId in state.world.actors) {
        const actor = state.world.actors[actorId];
        if (!isFiniteNumber(actor.standing) || actor.standing < 0 || actor.standing > 100) {
          errors.push(`actor ${actorId} standing out of range: ${actor.standing}`);
        }
        if (!isFiniteNumber(actor.influence) || actor.influence < 0 || actor.influence > 100) {
          errors.push(`actor ${actorId} influence out of range: ${actor.influence}`);
        }
      }
    }
    if (!state.world.crown || typeof state.world.crown !== "object") {
      errors.push("world.crown payload missing");
    } else {
      const crown = state.world.crown;
      if (!isInteger(crown.cadenceDays) || crown.cadenceDays < 3) {
        errors.push(`crown cadence invalid: ${crown.cadenceDays}`);
      }
      if (!isInteger(crown.nextCollectionDay) || crown.nextCollectionDay < 1) {
        errors.push(`crown nextCollectionDay invalid: ${crown.nextCollectionDay}`);
      }
      if (!isInteger(crown.pendingTax) || crown.pendingTax < 0) {
        errors.push(`crown pendingTax invalid: ${crown.pendingTax}`);
      }
      if (!isInteger(crown.arrears) || crown.arrears < 0) {
        errors.push(`crown arrears invalid: ${crown.arrears}`);
      }
      if (!isFiniteNumber(crown.complianceScore) || crown.complianceScore < 0 || crown.complianceScore > 100) {
        errors.push(`crown complianceScore out of range: ${crown.complianceScore}`);
      }
      if (!Array.isArray(crown.history) || crown.history.length > 36) {
        errors.push(`crown history invalid length: ${crown.history && crown.history.length}`);
      } else {
        crown.history.forEach((entry, index) => {
          if (!isInteger(entry.day) || entry.day < 1) {
            errors.push(`crown history[${index}] day invalid: ${entry.day}`);
          }
          if (typeof entry.type !== "string" || entry.type.length === 0) {
            errors.push(`crown history[${index}] type missing`);
          }
          if (!isInteger(entry.amount) || entry.amount < 0) {
            errors.push(`crown history[${index}] amount invalid: ${entry.amount}`);
          }
          if (typeof entry.status !== "string" || entry.status.length === 0) {
            errors.push(`crown history[${index}] status missing`);
          }
        });
      }
    }

    if (!state.world.suppliers || typeof state.world.suppliers !== "object") {
      errors.push("world.suppliers payload missing");
    } else {
      const suppliers = state.world.suppliers;
      if (!isFiniteNumber(suppliers.volatility) || suppliers.volatility < 0 || suppliers.volatility > 100) {
        errors.push(`suppliers volatility out of range: ${suppliers.volatility}`);
      }
      if (!suppliers.contracts || typeof suppliers.contracts !== "object") {
        errors.push("suppliers contracts payload missing");
      } else {
        if (!isInteger(suppliers.contracts.localBrokerDays) || suppliers.contracts.localBrokerDays < 0) {
          errors.push(`suppliers localBrokerDays invalid: ${suppliers.contracts.localBrokerDays}`);
        }
        if (!isInteger(suppliers.contracts.arcanumWholesaleDays) || suppliers.contracts.arcanumWholesaleDays < 0) {
          errors.push(`suppliers arcanumWholesaleDays invalid: ${suppliers.contracts.arcanumWholesaleDays}`);
        }
      }
      if (!suppliers.markets || typeof suppliers.markets !== "object") {
        errors.push("suppliers markets payload missing");
      } else {
        for (const districtId in suppliers.markets) {
          const market = suppliers.markets[districtId];
          if (!market || typeof market !== "object" || !market.stock || typeof market.stock !== "object") {
            errors.push(`suppliers market ${districtId} missing stock payload`);
            continue;
          }
          for (const item in market.stock) {
            const amount = market.stock[item];
            if (!isInteger(amount) || amount < 0 || amount > 180) {
              errors.push(`suppliers market ${districtId} ${item} out of range: ${amount}`);
            }
          }
        }
      }
      if (!suppliers.merchant || typeof suppliers.merchant !== "object") {
        errors.push("suppliers merchant payload missing");
      } else {
        if (!isInteger(suppliers.merchant.daysUntilVisit) || suppliers.merchant.daysUntilVisit < 0) {
          errors.push(`suppliers merchant.daysUntilVisit invalid: ${suppliers.merchant.daysUntilVisit}`);
        }
        if (!isInteger(suppliers.merchant.visitWindowDays) || suppliers.merchant.visitWindowDays < 0) {
          errors.push(`suppliers merchant.visitWindowDays invalid: ${suppliers.merchant.visitWindowDays}`);
        }
      }
      if (!suppliers.caravan || typeof suppliers.caravan !== "object") {
        errors.push("suppliers caravan payload missing");
      } else {
        if (!isInteger(suppliers.caravan.daysUntilWindow) || suppliers.caravan.daysUntilWindow < 0) {
          errors.push(`suppliers caravan.daysUntilWindow invalid: ${suppliers.caravan.daysUntilWindow}`);
        }
        if (!isInteger(suppliers.caravan.windowDays) || suppliers.caravan.windowDays < 0) {
          errors.push(`suppliers caravan.windowDays invalid: ${suppliers.caravan.windowDays}`);
        }
      }
      if (!suppliers.stockRun || typeof suppliers.stockRun !== "object") {
        errors.push("suppliers stockRun payload missing");
      } else if (!isInteger(suppliers.stockRun.daysRemaining) || suppliers.stockRun.daysRemaining < 0) {
        errors.push(`suppliers stockRun.daysRemaining invalid: ${suppliers.stockRun.daysRemaining}`);
      }
      if (!Array.isArray(suppliers.history) || suppliers.history.length > 32) {
        errors.push(`suppliers history invalid length: ${suppliers.history && suppliers.history.length}`);
      }
    }

    if (!state.world.rivals || typeof state.world.rivals !== "object") {
      errors.push("world.rivals payload missing");
    } else {
      const rivals = state.world.rivals;
      if (!rivals.districts || typeof rivals.districts !== "object") {
        errors.push("rivals districts payload missing");
      } else {
        for (const districtId in rivals.districts) {
          const district = rivals.districts[districtId];
          if (!district || typeof district !== "object") {
            errors.push(`rivals district ${districtId} missing`);
            continue;
          }
          const bounded = [
            ["demandPressure", district.demandPressure, 0, 1],
            ["pricePressure", district.pricePressure, 0, 1],
            ["reputationPressure", district.reputationPressure, 0, 1]
          ];
          bounded.forEach(([name, value, min, max]) => {
            if (!isFiniteNumber(value) || value < min || value > max) {
              errors.push(`rivals ${districtId} ${name} out of range: ${value}`);
            }
          });
          if (!Array.isArray(district.taverns)) {
            errors.push(`rivals ${districtId} taverns payload missing`);
            continue;
          }
          district.taverns.forEach((tavern, index) => {
            if (typeof tavern.id !== "string" || tavern.id.length === 0) {
              errors.push(`rivals ${districtId} tavern[${index}] id missing`);
            }
            if (!isFiniteNumber(tavern.currentPressure) || tavern.currentPressure < 0 || tavern.currentPressure > 1) {
              errors.push(`rivals ${districtId} tavern[${index}] currentPressure out of range: ${tavern.currentPressure}`);
            }
          });
        }
      }
      if (!Array.isArray(rivals.history) || rivals.history.length > 48) {
        errors.push(`rivals history invalid length: ${rivals.history && rivals.history.length}`);
      }
    }

    if (!state.world.reputationModel || typeof state.world.reputationModel !== "object") {
      errors.push("world.reputationModel payload missing");
    } else {
      const model = state.world.reputationModel;
      if (!model.cohorts || typeof model.cohorts !== "object") {
        errors.push("reputationModel cohorts payload missing");
      } else {
        for (const cohortId in model.cohorts) {
          const score = model.cohorts[cohortId];
          if (!isFiniteNumber(score) || score < 0 || score > 100) {
            errors.push(`reputationModel cohort ${cohortId} out of range: ${score}`);
          }
        }
      }
      if (!model.groups || typeof model.groups !== "object") {
        errors.push("reputationModel groups payload missing");
      } else {
        for (const groupId in model.groups) {
          const entry = model.groups[groupId];
          if (!entry || typeof entry !== "object") {
            errors.push(`reputationModel group ${groupId} missing payload`);
            continue;
          }
          if (!isFiniteNumber(entry.score) || entry.score < 0 || entry.score > 100) {
            errors.push(`reputationModel group ${groupId} score out of range: ${entry.score}`);
          }
          if (!isFiniteNumber(entry.lastShift) || entry.lastShift < -20 || entry.lastShift > 20) {
            errors.push(`reputationModel group ${groupId} lastShift out of range: ${entry.lastShift}`);
          }
        }
      }
      if (!isFiniteNumber(model.crownComplianceStanding) || model.crownComplianceStanding < 0 || model.crownComplianceStanding > 100) {
        errors.push(`reputationModel crownComplianceStanding out of range: ${model.crownComplianceStanding}`);
      }
      if (!Array.isArray(model.history) || model.history.length > 48) {
        errors.push(`reputationModel history invalid length: ${model.history && model.history.length}`);
      }
    }

    if (!state.world.reporting || typeof state.world.reporting !== "object") {
      errors.push("world.reporting payload missing");
    } else {
      const reporting = state.world.reporting;
      if (!reporting.rollingWeek || typeof reporting.rollingWeek !== "object") {
        errors.push("world.reporting.rollingWeek missing");
      } else {
        const rolling = reporting.rollingWeek;
        const boundedRolling = [
          ["startDay", rolling.startDay, 1, 1000000],
          ["days", rolling.days, 0, 7],
          ["eventfulDays", rolling.eventfulDays, 0, 7],
          ["supplierStrainDays", rolling.supplierStrainDays, 0, 7],
          ["rivalHighPressureDays", rolling.rivalHighPressureDays, 0, 7]
        ];
        boundedRolling.forEach(([name, value, min, max]) => {
          if (!isInteger(value) || value < min || value > max) {
            errors.push(`world.reporting.rollingWeek ${name} out of range: ${value}`);
          }
        });
      }
      if (!Array.isArray(reporting.weeklyHistory) || reporting.weeklyHistory.length > 20) {
        errors.push(`world.reporting.weeklyHistory invalid length: ${reporting.weeklyHistory && reporting.weeklyHistory.length}`);
      }
      if (typeof reporting.lastWeeklySummary !== "string") {
        errors.push("world.reporting.lastWeeklySummary missing");
      }
    }
  }

  return errors;
}

function collectWorldLayerErrors(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return ["world layer payload missing"];
  }
  if (!isInteger(payload.contractVersion) || payload.contractVersion < 1) {
    errors.push(`world layer contractVersion invalid: ${payload.contractVersion}`);
  }
  if (!payload.handoffContract || typeof payload.handoffContract !== "object") {
    errors.push("world layer handoffContract missing");
    return errors;
  }
  const handoff = payload.handoffContract;
  if (!isInteger(handoff.version) || handoff.version < 1) {
    errors.push(`handoff version invalid: ${handoff.version}`);
  }
  if (!isInteger(handoff.generatedAtDay) || handoff.generatedAtDay < 1) {
    errors.push(`handoff generatedAtDay invalid: ${handoff.generatedAtDay}`);
  }
  if (!handoff.locationProfile || typeof handoff.locationProfile !== "object") {
    errors.push("handoff locationProfile missing");
  } else {
    if (typeof handoff.locationProfile.id !== "string" || handoff.locationProfile.id.length === 0) {
      errors.push("handoff locationProfile.id missing");
    }
    if (!isFiniteNumber(handoff.locationProfile.taxRate)) {
      errors.push(`handoff locationProfile.taxRate invalid: ${handoff.locationProfile.taxRate}`);
    }
  }
  if (!handoff.taxesCompliance || typeof handoff.taxesCompliance !== "object") {
    errors.push("handoff taxesCompliance missing");
  } else if (!isFiniteNumber(handoff.taxesCompliance.complianceScore)) {
    errors.push(`handoff complianceScore invalid: ${handoff.taxesCompliance.complianceScore}`);
  }
  if (!handoff.eventCalendarOutlook || typeof handoff.eventCalendarOutlook !== "object") {
    errors.push("handoff eventCalendarOutlook missing");
  } else {
    const outlook = handoff.eventCalendarOutlook;
    if (!Array.isArray(outlook.entries) || outlook.entries.length === 0) {
      errors.push("handoff eventCalendarOutlook.entries missing");
    } else {
      const first = outlook.entries[0];
      if (!isInteger(first.day) || first.day < 1) {
        errors.push(`handoff eventCalendarOutlook first day invalid: ${first.day}`);
      }
      if (!first.calendar || typeof first.calendar !== "object") {
        errors.push("handoff eventCalendarOutlook first calendar payload missing");
      }
      if (!first.district || typeof first.district !== "object") {
        errors.push("handoff eventCalendarOutlook first district payload missing");
      }
    }
  }
  if (!handoff.supplierLogistics || typeof handoff.supplierLogistics !== "object") {
    errors.push("handoff supplierLogistics missing");
  } else if (!isFiniteNumber(handoff.supplierLogistics.volatility)) {
    errors.push(`handoff supplier volatility invalid: ${handoff.supplierLogistics.volatility}`);
  }
  if (!handoff.rivalPressure || typeof handoff.rivalPressure !== "object") {
    errors.push("handoff rivalPressure missing");
  } else if (!Array.isArray(handoff.rivalPressure.activeRivals)) {
    errors.push("handoff rivalPressure.activeRivals missing");
  }
  if (!handoff.reputationStandings || typeof handoff.reputationStandings !== "object") {
    errors.push("handoff reputationStandings missing");
  } else if (!handoff.reputationStandings.cohorts || typeof handoff.reputationStandings.cohorts !== "object") {
    errors.push("handoff reputationStandings.cohorts missing");
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
  const worldLayerErrors = collectWorldLayerErrors(getWorldLayerStatus());
  errors.push(...worldLayerErrors);
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
