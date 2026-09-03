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

export function pointInTimeDiscreteQuarterObservations(
  companyFacts = {},
  options = {},
) {
  const cumulative = pointInTimeFactObservations(companyFacts, {
    ...options,
    minimumDurationDays: 70,
    maximumDurationDays: 400,
  });
  const byEnd = new Map();
  for (const current of cumulative) {
    let discrete = null;
    if (current.durationDays <= 110) {
      discrete = current;
    } else {
      const priorCumulative = [...cumulative]
        .reverse()
        .find(
          (row) =>
            row.start === current.start &&
            row.end < current.end &&
            row.durationDays < current.durationDays &&
            current.durationDays - row.durationDays >= 70 &&
            current.durationDays - row.durationDays <= 110,
        );
      if (priorCumulative)
        discrete = {
          ...current,
          value: current.value - priorCumulative.value,
          start: priorCumulative.end,
          durationDays: current.durationDays - priorCumulative.durationDays,
          derivedFromCumulative: true,
          componentAccessions: [
            priorCumulative.accession,
            current.accession,
          ].filter(Boolean),
        };
    }
    if (!discrete) continue;
    const prior = byEnd.get(discrete.end);
    if (
      !prior ||
      discrete.filed > prior.filed ||
      (discrete.filed === prior.filed &&
        discrete.durationDays < prior.durationDays)
    )
      byEnd.set(discrete.end, discrete);
  }
  return [...byEnd.values()].sort(
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
  const observations = pointInTimeDiscreteQuarterObservations(
    companyFacts,
    options,
  );
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

export function pointInTimeYearOverYearChangeAnyConcept(
  companyFacts = {},
  { concepts = [], ...options } = {},
) {
  const candidates = concepts
    .map((concept) =>
      pointInTimeYearOverYearChange(companyFacts, { ...options, concept }),
    )
    .filter((candidate) => candidate.available)
    .sort(
      (a, b) =>
        b.current.end.localeCompare(a.current.end) ||
        b.current.filed.localeCompare(a.current.filed),
    );
  return (
    candidates[0] || {
      available: false,
      reason: "comparable-prior-quarter-unavailable-for-all-concepts",
      concepts,
    }
  );
}

export function pointInTimeFilingChangeSnapshot(
  companyFacts = {},
  { decisionDate } = {},
) {
  const revenue = pointInTimeYearOverYearChangeAnyConcept(companyFacts, {
    concepts: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
    ],
    units: ["USD"],
    decisionDate,
  });
  const profitability = pointInTimeYearOverYearChangeAnyConcept(companyFacts, {
    concepts: ["OperatingIncomeLoss", "NetIncomeLoss", "ProfitLoss"],
    units: ["USD"],
    decisionDate,
  });
  const operatingCashFlow = pointInTimeYearOverYearChange(companyFacts, {
    concept: "NetCashProvidedByUsedInOperatingActivities",
    units: ["USD"],
    decisionDate,
  });
  const fields = { revenue, profitability, operatingCashFlow };
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
