import { pointInTimeFilingChangeSnapshot } from "./secPointInTimeFundamentals";

export const SEC_FILING_CONCEPTS = Object.freeze([
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "OperatingIncomeLoss",
  "NetIncomeLoss",
  "ProfitLoss",
  "NetCashProvidedByUsedInOperatingActivities",
]);

const allowedForms = new Set(["10-Q", "10-K", "20-F", "40-F"]);

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const ratioPct = (numerator, denominator) => {
  const top = finite(numerator);
  const bottom = finite(denominator);
  return top === null || bottom === null || bottom === 0
    ? null
    : (top / bottom) * 100;
};

const difference = (current, prior) =>
  Number.isFinite(current) && Number.isFinite(prior) ? current - prior : null;

const isoDayAfter = (date) => {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + 86_400_000).toISOString().slice(0, 10);
};

const daysBetween = (left, right) => {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs)
    ? Math.round(Math.abs(rightMs - leftMs) / 86_400_000)
    : Infinity;
};

export function compactSecCompanyFacts(companyFacts = {}, { earliestFiled = "2020-01-01", latestFiled = null } = {}) {
  const compactFacts = {};
  for (const concept of SEC_FILING_CONCEPTS) {
    const source = companyFacts?.facts?.["us-gaap"]?.[concept];
    const rows = (source?.units?.USD || []).filter((row) => {
      const filed = String(row?.filed || "").slice(0, 10);
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(filed) &&
        filed >= earliestFiled &&
        (!latestFiled || filed <= latestFiled) &&
        allowedForms.has(String(row?.form || "").toUpperCase()) &&
        Number.isFinite(Number(row?.val))
      );
    });
    if (rows.length)
      compactFacts[concept] = {
        units: {
          USD: rows.map((row) => ({
            start: row.start,
            end: row.end,
            filed: String(row.filed).slice(0, 10),
            val: Number(row.val),
            accn: row.accn || null,
            form: String(row.form || "").toUpperCase(),
            fy: row.fy ?? null,
            fp: row.fp ?? null,
          })),
        },
      };
  }
  return {
    cik: String(companyFacts?.cik || ""),
    entityName: companyFacts?.entityName || null,
    facts: { "us-gaap": compactFacts },
  };
}

function snapshotMetrics(snapshot = {}) {
  const revenue = snapshot.fields?.revenue;
  const profitability = snapshot.fields?.profitability;
  const cash = snapshot.fields?.operatingCashFlow;
  const currentEnds = [revenue, profitability, cash]
    .filter((field) => field?.available)
    .map((field) => field.current?.end)
    .filter(Boolean);
  const alignedPeriodEnds =
    currentEnds.length >= 2 &&
    Math.max(
      ...currentEnds.map((end) =>
        Math.max(...currentEnds.map((other) => daysBetween(end, other))),
      ),
    ) <= 14;
  const currentMarginPct = ratioPct(
    profitability?.current?.value,
    revenue?.current?.value,
  );
  const priorMarginPct = ratioPct(
    profitability?.prior?.value,
    revenue?.prior?.value,
  );
  const currentCashConversionPct = ratioPct(
    cash?.current?.value,
    revenue?.current?.value,
  );
  const priorCashConversionPct = ratioPct(
    cash?.prior?.value,
    revenue?.prior?.value,
  );
  return {
    coverageFields: Number(snapshot.availableFields || 0),
    alignedPeriodEnds,
    periodEnd: currentEnds.sort().at(-1) || null,
    revenueGrowthPct: finite(revenue?.changePct),
    profitabilityGrowthPct: finite(profitability?.changePct),
    cashFlowGrowthPct: finite(cash?.changePct),
    marginChangePctPoints: difference(currentMarginPct, priorMarginPct),
    cashConversionChangePctPoints: difference(
      currentCashConversionPct,
      priorCashConversionPct,
    ),
    profitabilityConcept: profitability?.current?.concept || null,
  };
}

function filingDates(companyFacts = {}) {
  const dates = new Set();
  for (const concept of SEC_FILING_CONCEPTS)
    for (const row of companyFacts?.facts?.["us-gaap"]?.[concept]?.units?.USD || []) {
      const filed = String(row?.filed || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(filed)) dates.add(filed);
    }
  return [...dates].sort();
}

export function buildPointInTimeFilingEvents(
  companyFacts = {},
  { symbol, cik = null, datasetThrough = null } = {},
) {
  const events = [];
  let prior = null;
  let priorFingerprint = null;
  for (const filedDate of filingDates(companyFacts)) {
    if (datasetThrough && filedDate > datasetThrough) continue;
    const decisionDate = isoDayAfter(filedDate);
    if (!decisionDate) continue;
    const snapshot = pointInTimeFilingChangeSnapshot(companyFacts, {
      decisionDate,
    });
    const metrics = snapshotMetrics(snapshot);
    if (metrics.coverageFields < 2 || !metrics.periodEnd) continue;
    const newlyFiledFields = Object.values(snapshot.fields || {}).filter(
      (field) => field?.available && field.current?.filed === filedDate,
    ).length;
    if (!newlyFiledFields) continue;
    const fingerprint = JSON.stringify(metrics);
    if (fingerprint === priorFingerprint) continue;
    const event = {
      symbol: String(symbol || "").toUpperCase(),
      cik: cik ? String(cik).padStart(10, "0") : null,
      filedDate,
      periodEnd: metrics.periodEnd,
      newlyFiledFields,
      ...metrics,
      revenueAccelerationPctPoints: prior
        ? difference(metrics.revenueGrowthPct, prior.revenueGrowthPct)
        : null,
      profitabilityAccelerationPctPoints: prior
        ? difference(
            metrics.profitabilityGrowthPct,
            prior.profitabilityGrowthPct,
          )
        : null,
      cashFlowAccelerationPctPoints: prior
        ? difference(metrics.cashFlowGrowthPct, prior.cashFlowGrowthPct)
        : null,
    };
    events.push(event);
    prior = event;
    priorFingerprint = fingerprint;
  }
  return events;
}

function firstCalendarIndexAfter(calendar, date) {
  let low = 0;
  let high = calendar.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calendar[middle] <= date) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function addFilingEventsToDataset(dataset, calendar, filingEvents = []) {
  const bySymbol = new Map();
  for (const row of filingEvents) {
    const availableIndex = firstCalendarIndexAfter(calendar, row.filedDate);
    if (availableIndex >= calendar.length) continue;
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push({ ...row, availableIndex });
  }
  for (const rows of bySymbol.values())
    rows.sort(
      (left, right) =>
        left.availableIndex - right.availableIndex ||
        left.filedDate.localeCompare(right.filedDate),
    );
  const activeBySymbol = new Map();
  const cursors = new Map();
  const calendarIndex = new Map(calendar.map((date, index) => [date, index]));
  const sessions = (dataset?.sessions || []).map((session) => {
    const sessionIndex = calendarIndex.get(session.date);
    const annotate = (signal) => {
      const symbol = String(signal?.symbol || signal?.ticker || "").toUpperCase();
      const rows = bySymbol.get(symbol) || [];
      let cursor = cursors.get(symbol) || 0;
      while (
        cursor < rows.length &&
        rows[cursor].availableIndex <= sessionIndex
      ) {
        activeBySymbol.set(symbol, rows[cursor]);
        cursor++;
      }
      cursors.set(symbol, cursor);
      const event = activeBySymbol.get(symbol);
      if (!event) return signal;
      return {
        ...signal,
        researchFactors: {
          ...(signal.researchFactors || {}),
          filingCoverageFields: event.coverageFields,
          filingAlignedPeriodEnds: event.alignedPeriodEnds ? 1 : 0,
          sessionsSinceFiling: sessionIndex - event.availableIndex,
          filingDate: event.filedDate,
          filingPeriodEnd: event.periodEnd,
          revenueGrowthPct: event.revenueGrowthPct,
          profitabilityGrowthPct: event.profitabilityGrowthPct,
          cashFlowGrowthPct: event.cashFlowGrowthPct,
          revenueAccelerationPctPoints: event.revenueAccelerationPctPoints,
          profitabilityAccelerationPctPoints:
            event.profitabilityAccelerationPctPoints,
          cashFlowAccelerationPctPoints: event.cashFlowAccelerationPctPoints,
          marginChangePctPoints: event.marginChangePctPoints,
          cashConversionChangePctPoints:
            event.cashConversionChangePctPoints,
        },
      };
    };
    return {
      ...session,
      signals: (session.signals || []).map(annotate),
      positionSignals: (session.positionSignals || []).map(annotate),
    };
  });
  return { ...dataset, sessions };
}

const common = Object.freeze({
  researchSignalSource: "filing-event",
  independentLifecycle: true,
  ignoreSignalPositionActions: true,
  benchmarkSymbols: ["SPY", "QQQ"],
  benchmarkCompletionSymbol: null,
  liquidateAtEnd: true,
  requireLiquidityPass: true,
  minimumAverageDollarVolume: 30_000_000,
  minimumPrice: 5,
  requireEntryTimingPass: false,
  requireTrendAlignment: false,
  requireRelativeStrength: false,
  requireFilingChangeFactors: true,
  requireFilingPeriodAlignment: true,
  minimumFilingCoverageFields: 3,
  minSessionsSinceFiling: 0,
  maxSessionsSinceFiling: 40,
  minimumResearchFactorCoverage: 0,
  blockChaseEntries: false,
  selectionMode: "ranked",
  researchRankMode: "filing-inflection",
  rankedRebalanceSessions: 5,
  rankedTargetCount: 8,
  rankedExitBuffer: 12,
  rankedMinimumHoldSessions: 10,
  rankedEntryQueueCount: 16,
  minimumQualifiedSessions: 1,
  buyTargetPct: 0.1225,
  strongBuyTargetPct: 0.1225,
  buyMaxPositionPct: 0.125,
  strongBuyMaxPositionPct: 0.125,
  buyMaxFactorPct: 1,
  strongBuyMaxFactorPct: 1,
  maxPositions: 8,
  minimumInitialStopPct: 16,
  maximumInitialStopPct: 16,
  maxSectorPositions: 3,
  maxSectorPct: 0.375,
  maxIssuerPositions: 1,
  classifyStopExits: true,
  ratchetRiskPlanStop: false,
  timeStopSessions: 60,
  timeStopMaxReturnPct: 1_000,
  maxVolatility60Pct: 75,
  volatilityTargetPct: null,
  riskBudgetPct: null,
  baseRankWeight: 0,
});

const candidate = ({ id, label, family, mechanism, weights, overrides = {} }) => ({
  id,
  label,
  family,
  mechanism,
  weights,
  control: false,
  overrides: {
    ...common,
    ...overrides,
    filingInflectionWeights: weights,
  },
});

export function pointInTimeSecFilingR14Definitions() {
  return [
    candidate({
      id: "r14-balanced-operating-inflection",
      label: "Balanced newly filed operating inflection",
      family: "operating-inflection",
      mechanism:
        "underreaction to simultaneous changes in sales, profitability, margins and cash generation",
      weights: {
        revenueGrowth: 0.15,
        revenueAcceleration: 0.2,
        profitabilityGrowth: 0.15,
        marginChange: 0.2,
        cashFlowGrowth: 0.15,
        cashConversionChange: 0.1,
        residual20: 0,
        residual60: 0,
        recency: 0.05,
      },
    }),
    candidate({
      id: "r14-cash-backed-growth",
      label: "Cash-backed growth acceleration",
      family: "cash-confirmation",
      mechanism:
        "sales acceleration confirmed by improving cash conversion rather than accrual-only earnings",
      weights: {
        revenueGrowth: 0.15,
        revenueAcceleration: 0.25,
        profitabilityGrowth: 0.05,
        marginChange: 0.1,
        cashFlowGrowth: 0.15,
        cashConversionChange: 0.25,
        residual20: 0,
        residual60: 0,
        recency: 0.05,
      },
      overrides: {
        minimumRevenueGrowthPct: 0,
        minimumCashConversionChangePctPoints: 0,
      },
    }),
    candidate({
      id: "r14-margin-expansion-drift",
      label: "Margin expansion with residual confirmation",
      family: "margin-underreaction",
      mechanism:
        "new operating-margin information combined with incomplete benchmark-relative price adjustment",
      weights: {
        revenueGrowth: 0.1,
        revenueAcceleration: 0.1,
        profitabilityGrowth: 0.15,
        marginChange: 0.3,
        cashFlowGrowth: 0.05,
        cashConversionChange: 0.05,
        residual20: 0.15,
        residual60: 0.05,
        recency: 0.05,
      },
      overrides: { minimumMarginChangePctPoints: 0 },
    }),
    candidate({
      id: "r14-triple-positive-fundamental-drift",
      label: "Triple-positive fundamental drift",
      family: "fundamental-confirmation",
      mechanism:
        "concordant positive sales, profit and cash-flow changes reduce single-line accounting noise",
      weights: {
        revenueGrowth: 0.2,
        revenueAcceleration: 0.1,
        profitabilityGrowth: 0.2,
        marginChange: 0.1,
        cashFlowGrowth: 0.2,
        cashConversionChange: 0.05,
        residual20: 0.05,
        residual60: 0.05,
        recency: 0.05,
      },
      overrides: {
        minimumRevenueGrowthPct: 0,
        minimumProfitabilityGrowthPct: 0,
        minimumCashFlowGrowthPct: 0,
      },
    }),
    candidate({
      id: "r14-delayed-filing-confirmation",
      label: "Delayed filing inflection confirmation",
      family: "delayed-underreaction",
      mechanism:
        "wait two sessions after a filing, then require residual strength before accepting continued underreaction",
      weights: {
        revenueGrowth: 0.1,
        revenueAcceleration: 0.2,
        profitabilityGrowth: 0.1,
        marginChange: 0.2,
        cashFlowGrowth: 0.1,
        cashConversionChange: 0.1,
        residual20: 0.15,
        residual60: 0,
        recency: 0.05,
      },
      overrides: {
        minSessionsSinceFiling: 2,
        maxSessionsSinceFiling: 30,
        minAlpha20VsSpy: 0,
        minAlpha60VsQqq: -5,
      },
    }),
  ];
}

export function pointInTimeSecFilingR14Controls() {
  return [
    {
      id: "r14-control-residual-momentum",
      label: "Matched-lifecycle residual momentum control",
      control: true,
      overrides: {
        ...common,
        researchSignalSource: "price-only",
        requireFilingChangeFactors: false,
        requireFilingPeriodAlignment: false,
        minimumFilingCoverageFields: 0,
        researchRankMode: "benchmark-residual-momentum",
        requireBenchmarkResidualFactors: true,
        benchmarkResidualWeights: {
          relative120: 0.6,
          relative60: 0.25,
          sectorAwareMomentum: 0,
          lowVolatility: 0.15,
          drawdownResilience: 0,
          controlledPullback: 0,
        },
      },
    },
    {
      id: "r14-control-random-placebo-seed-14",
      label: "Matched-lifecycle deterministic random control",
      control: true,
      overrides: {
        ...common,
        researchSignalSource: "price-only",
        requireFilingChangeFactors: false,
        requireFilingPeriodAlignment: false,
        minimumFilingCoverageFields: 0,
        researchRankMode: "random-placebo",
        researchRandomSeed: 14,
      },
    },
  ];
}

export function normalizedFilingScore(value, scale) {
  const parsed = finite(value);
  return parsed === null ? -2 : clamp(parsed / scale, -2, 2);
}
