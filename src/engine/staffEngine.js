import { ROLE_TEMPLATES, ROTA_PRESETS, ROLE_SHIFT_BIAS } from "./config.js";

function isStaffUnavailable(person) {
  return person.injuryDays > 0 || person.disputeDays > 0;
}

function createStaff(role, tools) {
  const { randomId, randInt, clamp } = tools;
  const tpl = ROLE_TEMPLATES[role];
  return {
    id: `${role}-${randomId(6)}`,
    role,
    wage: tpl.wage + randInt(-1, 2),
    service: clamp(tpl.service + randInt(-3, 3), 4, 25),
    quality: clamp(tpl.quality + randInt(-2, 3), 1, 20),
    morale: randInt(52, 76),
    fatigue: randInt(18, 34),
    injuryDays: 0,
    disputeDays: 0,
    assignedShift: "day"
  };
}

function getStaffStats(staff, clamp) {
  if (staff.length === 0) {
    return {
      service: 0,
      quality: 0,
      avgMorale: 0,
      payroll: 0,
      avgFatigue: 0,
      activeCount: 0,
      unavailableCount: 0
    };
  }

  let service = 0;
  let quality = 0;
  let moraleTotal = 0;
  let payroll = 0;
  let fatigueTotal = 0;
  let activeCount = 0;
  let unavailableCount = 0;

  staff.forEach((person) => {
    moraleTotal += person.morale;
    payroll += person.wage;
    fatigueTotal += person.fatigue;

    if (isStaffUnavailable(person)) {
      unavailableCount += 1;
      return;
    }

    const moraleScale = 0.75 + person.morale / 200;
    const fatigueScale = clamp(1 - person.fatigue / 160, 0.45, 1);
    service += person.service * moraleScale * fatigueScale;
    quality += person.quality * moraleScale * fatigueScale;
    activeCount += 1;
  });

  return {
    service: Math.round(service),
    quality: Math.round(quality),
    avgMorale: moraleTotal / staff.length,
    payroll,
    avgFatigue: fatigueTotal / staff.length,
    activeCount,
    unavailableCount
  };
}

function progressStaffAbsences(staff, tools) {
  const { clamp, randInt, logLine } = tools;
  let returnedCount = 0;
  let injuredCount = 0;
  let disputeCount = 0;

  staff.forEach((person) => {
    if (person.injuryDays > 0) {
      person.injuryDays -= 1;
      person.fatigue = clamp(person.fatigue - randInt(6, 11), 0, 100);
      injuredCount += 1;
      if (person.injuryDays === 0) {
        returnedCount += 1;
        logLine(`${person.role} returned from injury leave.`, "good");
      }
    }

    if (person.disputeDays > 0) {
      person.disputeDays -= 1;
      person.fatigue = clamp(person.fatigue - randInt(4, 8), 0, 100);
      person.morale = clamp(person.morale + 2, 0, 100);
      disputeCount += 1;
      if (person.disputeDays === 0) {
        returnedCount += 1;
        logLine(`${person.role} dispute settled and returned to duty.`, "good");
      }
    }
  });

  return { returnedCount, injuredCount, disputeCount };
}

function assignDailyShifts(staff, weekday, rotaPreset, tools) {
  const { clamp, randomFloat } = tools;
  const isWeekendRush = weekday === "Fri" || weekday === "Sat";
  const demandNightShare = isWeekendRush ? 0.62 : 0.42;
  const preset = ROTA_PRESETS[rotaPreset] || ROTA_PRESETS.balanced;
  const availableStaff = staff.filter((person) => !isStaffUnavailable(person));

  let dayAssigned = 0;
  let nightAssigned = 0;

  availableStaff.forEach((person) => {
    const roleBias = ROLE_SHIFT_BIAS[person.role] || 0;
    const nightChance = clamp(
      preset.nightShare + roleBias + (isWeekendRush ? 0.04 : -0.03),
      0.08,
      0.92
    );

    person.assignedShift = randomFloat() < nightChance ? "night" : "day";
    if (person.assignedShift === "night") {
      nightAssigned += 1;
    } else {
      dayAssigned += 1;
    }
  });

  const totalAssigned = dayAssigned + nightAssigned;
  const nightShare = totalAssigned === 0 ? 0.5 : nightAssigned / totalAssigned;
  const shiftFit = 1 - Math.abs(nightShare - demandNightShare);

  return {
    availableCount: totalAssigned,
    injuredCount: staff.filter((person) => person.injuryDays > 0).length,
    disputeCount: staff.filter((person) => person.disputeDays > 0).length,
    dayAssigned,
    nightAssigned,
    shiftFit,
    demandMult: clamp(0.86 + shiftFit * 0.25, 0.82, 1.09),
    serviceMult: clamp(0.84 + shiftFit * 0.28, 0.8, 1.12),
    busyShift: isWeekendRush ? "night" : "day",
    summary:
      totalAssigned === 0
        ? "No staff available for rota."
        : `Rota ${preset.label}: day ${dayAssigned}, night ${nightAssigned}.`
  };
}

function applyEndOfDayStaffEffects(staff, shiftContext, satisfaction, net, tools) {
  const { clamp, randInt, randomFloat, logLine } = tools;
  let newInjuries = 0;
  let newDisputes = 0;
  let fatigueTotal = 0;

  staff.forEach((person) => {
    if (isStaffUnavailable(person)) {
      fatigueTotal += person.fatigue;
      return;
    }

    const onBusyShift = person.assignedShift === shiftContext.busyShift;
    const fatigueGain = onBusyShift ? randInt(7, 12) : randInt(3, 8);
    const satisfactionRelief = satisfaction >= 0.68 ? 2 : 0;
    person.fatigue = clamp(person.fatigue + fatigueGain - satisfactionRelief, 0, 100);
    fatigueTotal += person.fatigue;

    if (person.fatigue >= 84 && randomFloat() < 0.09) {
      person.injuryDays = randInt(2, 4);
      person.morale = clamp(person.morale - randInt(4, 8), 0, 100);
      newInjuries += 1;
      logLine(`${person.role} suffered a fatigue injury and is out for treatment.`, "bad");
      return;
    }

    if (person.fatigue >= 76 && person.morale < 48 && randomFloat() < 0.12) {
      person.disputeDays = randInt(1, 3);
      person.morale = clamp(person.morale - randInt(3, 7), 0, 100);
      newDisputes += 1;
      logLine(`${person.role} entered a staff dispute and sat out duties.`, "bad");
      return;
    }

    if (net > 0 && satisfaction > 0.67) {
      person.morale = clamp(person.morale + 1, 0, 100);
    }
  });

  const avgFatigue = staff.length === 0 ? 0 : Math.round(fatigueTotal / staff.length);
  return { newInjuries, newDisputes, avgFatigue };
}

export {
  createStaff,
  isStaffUnavailable,
  getStaffStats,
  progressStaffAbsences,
  assignDailyShifts,
  applyEndOfDayStaffEffects
};
