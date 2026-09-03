const ALLOWED_FORMS = new Set(["10-Q", "10-K", "20-F", "40-F"]);

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 86_400_000);
}

function observationsForConcept(companyFacts = {}, concept, units = []) {
  const fact = companyFacts?.facts?.["us-gaap"]?.[concept];
  if (!fact?.units) return [];
  const preferredUnits = units.length ? units : Object.keys(fact.units);
  return preferredUnits.flatMap((unit) =>
    (fact.units[unit] || []).map((row) => ({ ...row, unit })),
  );
}

export function pointInTimeFactObservations(
  companyFacts = {},
  {
    concept,
    units = ["USD"],
    decisionDate,
    minimumDurationDays = 70,
    maximumDurationDays = 110,
  } = {},
) {
  if (!concept || !/^\d{4}-\d{2}-\d{2}$/.test(String(decisionDate || "")))
    return [];
  const byPeriod = new Map();
  for (const row of observationsForConcept(companyFacts, concept, units)) {
    const value = finite(row.val);
    const durationDays = daysBetween(row.start, row.end);
    const filed = String(row.filed || "");
    if (
      value === null ||
      !ALLOWED_FORMS.has(String(row.form || "").toUpperCase()) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(filed) ||
      filed >= decisionDate ||
      durationDays === null ||
      durationDays < minimumDurationDays ||
      durationDays > maximumDurationDays
    )
      continue;
    const key = `${row.start}|${row.end}|${row.unit}`;
    const prior = byPeriod.get(key);
    // For a historical decision, retain the latest filing actually available
    // before that decision. A later amendment can never leak backward.
    if (!prior || filed > prior.filed)
      byPeriod.set(key, {
        concept,
        value,
        unit: row.unit,
        start: row.start,
        end: row.end,
        filed,
        form: row.form,
        accession: row.accn || null,
        durationDays,
      });
  }
  return [...byPeriod.values()].sort(
    (a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed),
  );
}

function comparablePrior(current, observations) {
  return [...observations]
    .reverse()
    .find((row) => {
      if (row.end >= current.end) return false;
      const separation = daysBetween(row.end, current.end);
      return (
        separation >= 330 &&
        separation <= 400 &&
        Math.abs(row.durationDays - current.durationDays) <= 14
      );
    });
}

export function pointInTimeYearOverYearChange(companyFacts = {}, options = {}) {
  const observations = pointInTimeFactObservations(companyFacts, options);
  const current = observations.at(-1) || null;
  const prior = current ? comparablePrior(current, observations) : null;
  if (!current || !prior || prior.value === 0)
    return {
      available: false,
      reason: "comparable-prior-quarter-unavailable",
      current,
      prior,
    };
  return {
    available: true,
    changePct: ((current.value / prior.value) - 1) * 100,
    current,
    prior,
  };
}

export function pointInTimeFilingChangeSnapshot(
  companyFacts = {},
  { decisionDate } = {},
) {
  const revenue = pointInTimeYearOverYearChange(companyFacts, {
    concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
    units: ["USD"],
    decisionDate,
  });
  const operatingIncome = pointInTimeYearOverYearChange(companyFacts, {
    concept: "OperatingIncomeLoss",
    units: ["USD"],
    decisionDate,
  });
  const operatingCashFlow = pointInTimeYearOverYearChange(companyFacts, {
    concept: "NetCashProvidedByUsedInOperatingActivities",
    units: ["USD"],
    decisionDate,
  });
  const fields = { revenue, operatingIncome, operatingCashFlow };
  const availableFields = Object.values(fields).filter(
    (field) => field.available,
  ).length;
  return {
    decisionDate,
    availableFields,
    coveragePct: (availableFields / Object.keys(fields).length) * 100,
    fields,
  };
}

