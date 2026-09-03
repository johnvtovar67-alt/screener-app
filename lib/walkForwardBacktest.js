// Deterministic point-in-time portfolio simulator and walk-forward evaluator.
//
// This module does not download data and it does not grant credibility to a
// backtest merely because the arithmetic ran. validatePointInTimeDataset rejects
// look-ahead timestamps, current-only universes, unadjusted prices, missing event
// history, and other common sources of false alpha before capital is simulated.

export const POINT_IN_TIME_SCHEMA = "screener-pit-v1";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIONS = new Set(["Strong Buy", "Buy", "Watch", "Avoid", "Paused"]);
const EXIT_ACTIONS = new Set(["Exit", "Rotate"]);
const STOP_EXIT_REASONS = new Set([
  "invalidation-stop",
  "initial-stop",
  "ratcheted-stop",
  "profit-trailing-stop",
]);
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const optionalNumber = (value, fallback = null) =>
  value === null || value === undefined || value === ""
    ? fallback
    : number(value, fallback);
const timestamp = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .toUpperCase()
    .trim();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 6) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const average = (items) =>
  items.length
    ? items.reduce((sum, value) => sum + value, 0) / items.length
    : 0;
const standardDeviation = (items) => {
  if (items.length < 2) return 0;
  const mean = average(items);
  return Math.sqrt(
    items.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (items.length - 1),
  );
};

export function validatePointInTimeDataset(dataset = {}, options = {}) {
  const minimumSessions = Math.max(2, number(options.minimumSessions, 756));
  const errors = [];
  const warnings = [];
  const metadata = dataset.metadata || {};
  const sessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const requireFlag = (key, message) => {
    if (metadata[key] !== true) errors.push(message);
  };

  if (metadata.schema !== POINT_IN_TIME_SCHEMA)
    errors.push(`Dataset schema must be ${POINT_IN_TIME_SCHEMA}.`);
  requireFlag(
    "pointInTime",
    "Dataset must explicitly certify point-in-time construction.",
  );
  requireFlag(
    "survivorshipBiasFree",
    "Dataset must include historical listings and delisted securities.",
  );
  requireFlag(
    "universeMembershipPointInTime",
    "Each session must use the securities listed on that date, not today's universe.",
  );
  requireFlag(
    "delistedSecuritiesIncluded",
    "Delisted securities are required; a current-symbol list is not valid history.",
  );
  requireFlag(
    "delistingReturnsComplete",
    "Delisting cash/recovery outcomes are required so vanished positions cannot be carried at their last quote.",
  );
  requireFlag(
    "corporateActionsAdjusted",
    "Split/dividend-adjusted historical prices are required.",
  );
  requireFlag(
    "fundamentalsPointInTime",
    "Historical fundamentals must be selected by their public availability time.",
  );
  requireFlag(
    "fundamentalValuesRevisionSafe",
    "Historical fundamental values must be as originally available, not silently restated with later knowledge.",
  );
  requireFlag(
    "eventRiskPointInTime",
    "Historical earnings/material-event checks are required for every actionable signal.",
  );
  requireFlag(
    "materialNewsHistoryComplete",
    "Historical material-news coverage is required; earnings dates alone do not reproduce the pre-trade gate.",
  );
  requireFlag(
    "portfolioDecisionInputsComplete",
    "Historical signal rows must preserve the inputs required to replay the production portfolio-decision policy.",
  );
  requireFlag(
    "capitalPolicyInputsComplete",
    "Historical signal rows must preserve the inputs required to replay the production capital-allocation policy.",
  );
  requireFlag(
    "positionDecisionUniverseComplete",
    "Historical sessions must evaluate owned positions independently of the fresh-capital shortlist.",
  );
  if (metadata.fundamentalAvailabilityField !== "acceptedDate")
    errors.push(
      "Fundamental availability must use SEC acceptedDate, not fiscal period end or filing date alone.",
    );
  if (!metadata.benchmarkSymbol)
    errors.push("A benchmark symbol is required for out-of-sample comparison.");
  if (sessions.length < minimumSessions)
    errors.push(
      `At least ${minimumSessions} ordered market sessions are required; received ${sessions.length}.`,
    );

  let priorDate = "";
  let actionableRows = 0;
  let delistedRows = 0;
  let historicalDelistedMembership = 0;
  let delistingEvents = 0;
  let sourceUniverseObservations = 0;
  let positionEvaluationRows = 0;
  const dateSet = new Set();
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const session = sessions[sessionIndex] || {};
    const date = String(session.date || "");
    const decisionAt = timestamp(session.decisionAt);
    const signals = Array.isArray(session.signals) ? session.signals : [];
    const positionSignals = Array.isArray(session.positionSignals)
      ? session.positionSignals
      : null;
    const prices = Array.isArray(session.prices) ? session.prices : [];
    const corporateActions = Array.isArray(session.corporateActions)
      ? session.corporateActions
      : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      errors.push(`Session ${sessionIndex} has an invalid YYYY-MM-DD date.`);
    if (dateSet.has(date)) errors.push(`Duplicate session date ${date}.`);
    dateSet.add(date);
    if (priorDate && date <= priorDate)
      errors.push(`Sessions are not strictly increasing at ${date}.`);
    priorDate = date;
    if (decisionAt === null)
      errors.push(`Session ${date || sessionIndex} is missing decisionAt.`);
    if (
      !prices.some(
        (row) => symbolOf(row) === symbolOf(metadata.benchmarkSymbol),
      )
    )
      errors.push(
        `Session ${date} is missing ${metadata.benchmarkSymbol} prices.`,
      );
    if (!(number(session.sourceUniverseCount, 0) > 0))
      errors.push(`Session ${date} is missing its source-universe count.`);
    if (positionSignals === null)
      errors.push(
        `Session ${date} is missing full-universe position evaluations.`,
      );
    else positionEvaluationRows += positionSignals.length;
    sourceUniverseObservations += number(session.sourceUniverseCount, 0);
    historicalDelistedMembership += number(
      session.historicalDelistedMembership,
      0,
    );
    for (const row of prices) {
      const symbol = symbolOf(row) || "unknown";
      if (row.adjusted !== true)
        errors.push(
          `${symbol} on ${date} does not explicitly certify adjusted OHLCV.`,
        );
      for (const field of ["open", "high", "low", "close"])
        if (!(number(row[field], 0) > 0))
          errors.push(
            `${symbol} on ${date} is missing a valid ${field} price.`,
          );
    }
    for (const action of corporateActions) {
      if (String(action.type || "").toLowerCase() !== "delisting") continue;
      delistingEvents++;
      if (!symbolOf(action))
        errors.push(`A delisting event on ${date} is missing its symbol.`);
      if (number(action.valuePerShare, -1) < 0)
        errors.push(
          `${symbolOf(action) || "unknown"} on ${date} is missing a non-negative delisting value per share.`,
        );
    }

    const seen = new Set();
    for (const signal of signals) {
      const symbol = symbolOf(signal);
      if (!symbol) {
        errors.push(`Session ${date} contains a signal without a symbol.`);
        continue;
      }
      if (seen.has(symbol))
        errors.push(`Session ${date} contains duplicate signal ${symbol}.`);
      seen.add(symbol);
      if (!ACTIONS.has(signal.action))
        errors.push(`Session ${date} has invalid action for ${symbol}.`);
      const availabilityFields = [
        "marketAvailableAt",
        "fundamentalsAvailableAt",
        "eventRiskAvailableAt",
      ];
      for (const field of availabilityFields) {
        const availableAt = timestamp(signal[field]);
        if (availableAt === null)
          errors.push(`${symbol} on ${date} is missing ${field}.`);
        else if (decisionAt !== null && availableAt > decisionAt)
          errors.push(
            `${symbol} on ${date} uses ${field} after the decision timestamp (look-ahead).`,
          );
      }
      const listedAt = timestamp(signal.listedAt);
      const delistedAt = timestamp(signal.delistedAt);
      if (listedAt === null)
        errors.push(`${symbol} on ${date} is missing listedAt.`);
      else if (decisionAt !== null && listedAt > decisionAt)
        errors.push(`${symbol} appears before its listing on ${date}.`);
      if (delistedAt !== null) {
        delistedRows++;
        if (String(signal.delistedAt).slice(0, 10) < date)
          errors.push(`${symbol} appears after delisting on ${date}.`);
      }
      if (["Buy", "Strong Buy"].includes(signal.action)) {
        actionableRows++;
        if (signal.fundamentalDataVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without verified point-in-time fundamentals.`,
          );
        if (signal.fundamentalRevisionSafe !== true)
          errors.push(
            `${symbol} on ${date} is actionable without revision-safe original fundamental values.`,
          );
        if (signal.eventRiskVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without verified point-in-time event risk.`,
          );
        if (signal.eventHistoryComplete !== true)
          errors.push(
            `${symbol} on ${date} is actionable without complete as-known material-event history.`,
          );
        if (signal.entryTimingVerified !== true)
          errors.push(
            `${symbol} on ${date} is actionable without historical entry-timing verification.`,
          );
      }
    }
  }
  if (
    sessions.length >= 252 &&
    delistedRows === 0 &&
    historicalDelistedMembership === 0
  )
    errors.push(
      "No historical delisted membership was observed across a one-year-plus sample.",
    );
  if (
    sessions.length >= 252 &&
    historicalDelistedMembership > 0 &&
    delistingEvents === 0
  )
    errors.push(
      "Historical delisted membership exists, but no delisting return/recovery events were supplied.",
    );
  if (actionableRows === 0)
    warnings.push(
      "Dataset contains no actionable observations; mechanics can run but alpha cannot be measured.",
    );
  if (sourceUniverseObservations === 0)
    errors.push("Historical source-universe breadth was not recorded.");
  if (!metadata.dataVendorEntitlementsVerified)
    warnings.push(
      "Vendor entitlement/capability verification is not recorded; do not present results as production-grade research.",
    );

  return {
    valid: errors.length === 0,
    credibleForResearch:
      errors.length === 0 &&
      metadata.dataVendorEntitlementsVerified === true &&
      sessions.length >= 756 &&
      actionableRows > 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    stats: {
      sessions: sessions.length,
      actionableRows,
      delistedRows,
      historicalDelistedMembership,
      delistingEvents,
      averageSourceUniverseSize: sessions.length
        ? Math.round(sourceUniverseObservations / sessions.length)
        : 0,
      positionEvaluationRows,
    },
  };
}

export function createWalkForwardFolds(
  dates = [],
  {
    trainSessions = 504,
    validationSessions = 126,
    testSessions = 126,
    stepSessions = 126,
  } = {},
) {
  const folds = [];
  const required = trainSessions + validationSessions + testSessions;
  for (
    let start = 0, fold = 1;
    start + required <= dates.length;
    start += stepSessions, fold++
  ) {
    const trainEnd = start + trainSessions;
    const validationEnd = trainEnd + validationSessions;
    const testEnd = validationEnd + testSessions;
    folds.push({
      fold,
      train: { start: dates[start], end: dates[trainEnd - 1] },
      validation: {
        start: dates[trainEnd],
        end: dates[validationEnd - 1],
      },
      test: { start: dates[validationEnd], end: dates[testEnd - 1] },
    });
  }
  return folds;
}

function priceMap(session = {}) {
  return new Map(
    (session.prices || [])
      .map((row) => [symbolOf(row), row])
      .filter(([key]) => key),
  );
}

function factorOf(signal = {}) {
  return String(
    signal.factor || signal.primaryTheme || signal.sector || "Other",
  );
}

function sectorOf(signal = {}) {
  return String(
    signal.sector || signal.primaryTheme || signal.factor || "Other",
  );
}

function issuerOf(signal = {}) {
  const cik = String(signal.cik || signal.cikNumber || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (cik) return `cik:${cik}`;
  const name = String(signal.companyName || signal.name || "")
    .toUpperCase()
    .replace(/\b(?:CLASS [A-Z]|COMMON STOCK|ORDINARY SHARES?)\b/g, " ")
    .replace(
      /\b(?:INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|PLC|LTD|LIMITED|HOLDINGS?|GROUP)\b/g,
      " ",
    )
    .replace(/[^A-Z0-9]/g, "");
  return name ? `name:${name}` : `symbol:${symbolOf(signal)}`;
}

function stableResearchHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function centeredPercentile(value) {
  return clamp(optionalNumber(value, 50), 0, 100) - 50;
}

function momentumExtensionSigma(factors = {}) {
  const annualizedVolatilityPct = optionalNumber(factors.volatility60Pct, null);
  if (!(annualizedVolatilityPct > 0)) return null;
  const annualizedVolatility = annualizedVolatilityPct / 100;
  const observations = [
    [optionalNumber(factors.return60Ex5, null), 55],
    [optionalNumber(factors.return120Ex20, null), 100],
  ];
  const extensions = observations
    .filter(([returnPct]) => returnPct !== null && returnPct > -100)
    .map(([returnPct, sessions]) => {
      const expectedMove = annualizedVolatility * Math.sqrt(sessions / 252);
      return expectedMove > 0
        ? Math.log1p(returnPct / 100) / expectedMove
        : null;
    })
    .filter(Number.isFinite);
  return extensions.length ? Math.max(...extensions) : null;
}

function researchRank(signal = {}, config = {}, context = {}) {
  const factors = signal.researchFactors || {};
  const timing = signal.entryTiming || {};
  if (config.researchRankMode === "attention-shock-breakout-continuation") {
    const weights = config.attentionShockWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    const distanceFromHigh = optionalNumber(
      factors.distanceFromYearHighPct,
      null,
    );
    const return5 = optionalNumber(factors.return5, null);
    const relativeStrength20 = optionalNumber(timing.alpha20VsSpy, null);
    return (
      100 *
      (weighted(
        "activityShock",
        relativeVolume > 0
          ? clamp(Math.log(relativeVolume) / Math.log(3), 0, 2)
          : -2,
      ) +
        weighted(
          "breakoutProximity",
          distanceFromHigh === null
            ? -2
            : clamp((distanceFromHigh + 5) / 5, 0, 1),
        ) +
        weighted(
          "followthrough",
          return5 === null ? -2 : clamp(return5 / 12, 0, 1),
        ) +
        weighted(
          "relativeStrength20",
          relativeStrength20 === null
            ? -2
            : clamp(relativeStrength20 / 10, -1, 2),
        ))
    );
  }
  if (config.researchRankMode === "attention-shock-only") {
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    return relativeVolume > 0
      ? 100 * clamp(Math.log(relativeVolume) / Math.log(3), 0, 2)
      : -200;
  }
  if (config.researchRankMode === "breakout-followthrough-only") {
    const distanceFromHigh = optionalNumber(
      factors.distanceFromYearHighPct,
      null,
    );
    const return5 = optionalNumber(factors.return5, null);
    if (distanceFromHigh === null || return5 === null) return -200;
    return (
      100 *
      (0.6 * clamp((distanceFromHigh + 5) / 5, 0, 1) +
        0.4 * clamp(return5 / 12, 0, 1))
    );
  }
  if (config.researchRankMode === "benchmark-residual-momentum") {
    const weights = config.benchmarkResidualWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relative120 =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const relative60 =
      0.5 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2);
    const sectorMomentumPercentile = optionalNumber(
      context.sectorMomentumPercentileBySymbol?.[symbolOf(signal)],
      null,
    );
    const sectorAwareMomentum =
      sectorMomentumPercentile === null
        ? -2
        : (0.5 * centeredPercentile(factors.momentumPercentile) +
            0.5 * centeredPercentile(sectorMomentumPercentile)) /
          50;
    const lowVolatility = clamp(
      (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
      -2,
      1,
    );
    const drawdownResilience =
      centeredPercentile(factors.drawdownResiliencePercentile) / 50;
    const controlledPullback =
      centeredPercentile(factors.controlledPullbackScore) / 50;
    return (
      100 *
      (weighted("relative120", relative120) +
        weighted("relative60", relative60) +
        weighted("sectorAwareMomentum", sectorAwareMomentum) +
        weighted("lowVolatility", lowVolatility) +
        weighted("drawdownResilience", drawdownResilience) +
        weighted("controlledPullback", controlledPullback))
    );
  }
  if (config.researchRankMode === "conditional-short-term-reversal") {
    const weights = config.shortTermReversalWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const return5 = optionalNumber(factors.return5, null);
    const reversalPressure =
      return5 === null ? -2 : clamp(1 - Math.abs(return5 + 4) / 6, -2, 1);
    const relativeTrend =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 25, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 25, -2, 2);
    const lowVolatility = clamp(
      (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
      -2,
      1,
    );
    const liquidity = clamp(
      Math.log10(Math.max(1, observedDollarVolume(signal))) / 3 - 2,
      -2,
      1,
    );
    return (
      100 *
      (weighted("reversalPressure", reversalPressure) +
        weighted("relativeTrend", relativeTrend) +
        weighted("lowVolatility", lowVolatility) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "industry-leadership-momentum") {
    const weights = config.industryLeadershipWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const sectorTrend = clamp(
      optionalNumber(
        context.sectorLeadershipBySymbol?.[symbolOf(signal)],
        -50,
      ) / 25,
      -2,
      2,
    );
    const stockResidual =
      0.5 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.5 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const withinSector =
      centeredPercentile(
        context.sectorMomentumPercentileBySymbol?.[symbolOf(signal)],
      ) / 50;
    const continuity =
      centeredPercentile(factors.continuousInformationPercentile) / 50;
    const lowVolatility = clamp(
      (40 - optionalNumber(factors.volatility60Pct, 40)) / 40,
      -2,
      1,
    );
    return (
      100 *
      (weighted("sectorTrend", sectorTrend) +
        weighted("stockResidual", stockResidual) +
        weighted("withinSector", withinSector) +
        weighted("continuity", continuity) +
        weighted("lowVolatility", lowVolatility))
    );
  }
  if (config.researchRankMode === "anchored-gradual-leadership") {
    const weights = config.anchoredGradualWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeStrength =
      0.3 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2) +
      0.3 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const relativeVolume = optionalNumber(factors.relativeVolume20, null);
    const lowShockVolume =
      relativeVolume > 0
        ? clamp(1 - Math.abs(Math.log(relativeVolume)) / Math.log(2.5), -1, 1)
        : -1;
    const averageDollarVolume = optionalNumber(
      timing.averageDollarVolume20,
      0,
    );
    const liquidity =
      averageDollarVolume > 0
        ? clamp(Math.log10(averageDollarVolume / 20_000_000) / 2, -1, 1)
        : -1;
    return (
      100 *
      (weighted(
        "anchor",
        centeredPercentile(factors.highProximityPercentile) / 50,
      ) +
        weighted(
          "recency",
          centeredPercentile(factors.highRecencyPercentile) / 50,
        ) +
        weighted(
          "continuity",
          centeredPercentile(factors.continuousInformationPercentile) / 50,
        ) +
        weighted(
          "intermediate",
          centeredPercentile(factors.intermediateLeadershipPercentile) / 50,
        ) +
        weighted("relativeStrength", relativeStrength) +
        weighted(
          "drawdownResilience",
          centeredPercentile(factors.drawdownResiliencePercentile) / 50,
        ) +
        weighted("lowShockVolume", lowShockVolume) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "multi-horizon-price-alpha") {
    const weights = config.priceAlphaWeights || {};
    const weighted = (key, value) => number(weights[key], 0) * value;
    const relativeStrength =
      0.3 * clamp(optionalNumber(timing.alpha60VsSpy, 0) / 25, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha60VsQqq, 0) / 25, -2, 2) +
      0.3 * clamp(optionalNumber(timing.alpha120VsSpy, 0) / 35, -2, 2) +
      0.2 * clamp(optionalNumber(timing.alpha120VsQqq, 0) / 35, -2, 2);
    const averageDollarVolume = optionalNumber(
      timing.averageDollarVolume20,
      0,
    );
    const liquidity =
      averageDollarVolume > 0
        ? clamp(Math.log10(averageDollarVolume / 20_000_000) / 2, -1, 1)
        : -1;
    return (
      100 *
      (weighted(
        "momentum",
        centeredPercentile(factors.momentumPercentile) / 50,
      ) +
        weighted(
          "longMomentum",
          clamp(optionalNumber(factors.return120Ex20, 0) / 60, -2, 2),
        ) +
        weighted(
          "mediumMomentum",
          clamp(optionalNumber(factors.return60Ex5, 0) / 40, -2, 2),
        ) +
        weighted(
          "shortMomentum",
          clamp(optionalNumber(factors.return20, 0) / 25, -2, 2),
        ) +
        weighted(
          "veryShortMomentum",
          clamp(optionalNumber(factors.return5, 0) / 15, -2, 2),
        ) +
        weighted("relativeStrength", relativeStrength) +
        weighted(
          "stability",
          centeredPercentile(factors.stabilityPercentile) / 50,
        ) +
        weighted(
          "lowVolatility",
          clamp(
            (35 - optionalNumber(factors.volatility60Pct, 35)) / 35,
            -2,
            1,
          ),
        ) +
        weighted(
          "technical",
          centeredPercentile(timing.shortTermTechnicalScore) / 50,
        ) +
        weighted(
          "pullback",
          centeredPercentile(factors.controlledPullbackScore) / 50,
        ) +
        weighted("liquidity", liquidity))
    );
  }
  if (config.researchRankMode === "durable-quality-momentum") {
    const quality = centeredPercentile(factors.qualityPercentile);
    const momentum = centeredPercentile(factors.momentumPercentile);
    const stability = centeredPercentile(factors.stabilityPercentile);
    const sectorQuality = centeredPercentile(
      factors.sectorQualityPercentile,
    );
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    const lowVolatility = clamp(
      50 - optionalNumber(factors.volatility60Pct, 50),
      -50,
      50,
    );
    const weakestCoreSignal = Math.min(quality, momentum);
    return (
      0.25 * quality +
      0.2 * momentum +
      0.15 * stability +
      0.1 * sectorQuality +
      0.1 * relativeStrength +
      0.1 * lowVolatility +
      0.1 * weakestCoreSignal
    );
  }
  if (config.researchRankMode === "price-pattern") {
    const weights = config.pricePatternWeights || {};
    const feature = (key, value, minimum, maximum) =>
      number(weights[key], 0) * clamp(optionalNumber(value, 0), minimum, maximum);
    return (
      feature("return120Ex20", factors.return120Ex20, -60, 120) +
      feature("return60Ex5", factors.return60Ex5, -50, 100) +
      feature("return20", factors.return20, -35, 50) +
      feature("return5", factors.return5, -20, 25) +
      feature("volatility60Pct", factors.volatility60Pct, 0, 120) +
      feature("alpha60VsSpy", timing.alpha60VsSpy, -40, 60) +
      feature("alpha60VsQqq", timing.alpha60VsQqq, -40, 60) +
      feature(
        "controlledPullbackScore",
        factors.controlledPullbackScore,
        0,
        100,
      )
    );
  }
  if (config.researchRankMode === "quality-momentum-leadership") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.3 * centeredPercentile(factors.momentumPercentile) +
      0.25 * centeredPercentile(factors.qualityPercentile) +
      0.1 * centeredPercentile(factors.sectorQualityPercentile) +
      0.1 * centeredPercentile(factors.stabilityPercentile) +
      0.15 * relativeStrength +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-dominant-quality-blend") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-quality-momentum") {
    if (context.useQualityDefense === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-factor-leadership") {
    if (context.useQualityLeadership === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "adaptive-factor-leadership-20") {
    if (context.useQualityLeadership20 === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "persistent-factor-leadership-20") {
    if (context.usePersistentQualityLeadership === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "confirmed-quality-defense") {
    if (context.useConfirmedQualityDefense === true)
      return centeredPercentile(factors.qualityPercentile);
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.55 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.1 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.sectorQualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-first-entry-disciplined-blend") {
    const relativeStrength =
      clamp(
        0.65 * optionalNumber(timing.alpha60VsSpy, 0) +
          0.35 * optionalNumber(timing.alpha60VsQqq, 0),
        -25,
        25,
      ) * 2;
    return (
      0.7 * centeredPercentile(factors.momentumPercentile) +
      0.15 * relativeStrength +
      0.05 * centeredPercentile(factors.qualityPercentile) +
      0.05 * centeredPercentile(factors.stabilityPercentile) +
      0.05 * centeredPercentile(factors.controlledPullbackScore)
    );
  }
  if (config.researchRankMode === "momentum-only")
    return centeredPercentile(factors.momentumPercentile);
  if (config.researchRankMode === "quality-only")
    return centeredPercentile(factors.qualityPercentile);
  if (config.researchRankMode === "bull-cycle-pullback-control")
    return (
      0.5 * centeredPercentile(factors.momentumPercentile) +
      0.3 * centeredPercentile(timing.shortTermTechnicalScore) +
      0.2 * centeredPercentile(factors.controlledPullbackScore)
    );
  if (config.researchRankMode === "random-placebo")
    return (
      (stableResearchHash(
        `${number(config.researchRandomSeed, 0)}|${symbolOf(signal)}`,
      ) /
        0xffffffff) *
        100 -
      50
    );
  const base =
    config.baseRankWeight * number(signal.capitalEfficiencyScore, signal.score);
  const shortTermAlpha = number(timing.alpha20VsSpy, 0);
  const relative =
    config.relativeStrengthRankWeight *
      (0.65 * number(timing.alpha60VsSpy, 0) +
        0.35 * number(timing.alpha20VsSpy, 0)) -
    config.shortTermAlphaRankPenalty *
      Math.max(0, shortTermAlpha - config.shortTermAlphaRankPenaltyThreshold);
  const factor =
    config.researchFactorRankWeight *
      (optionalNumber(factors.globalCompositePercentile, 50) - 50) +
    config.qualityRankWeight *
      (optionalNumber(factors.qualityPercentile, 50) - 50) +
    config.sectorQualityRankWeight *
      (optionalNumber(factors.sectorQualityPercentile, 50) - 50) +
    config.momentumRankWeight *
      (optionalNumber(factors.momentumPercentile, 50) - 50) +
    config.valueRankWeight *
      (optionalNumber(factors.valuePercentile, 50) - 50) +
    config.stabilityRankWeight *
      (optionalNumber(factors.stabilityPercentile, 50) - 50);
  const pullback =
    config.controlledPullbackRankWeight *
    (optionalNumber(factors.controlledPullbackScore, 50) - 50);
  return base + relative + factor + pullback;
}

function crossSectionalRankContext(signals = []) {
  const momentumBySector = new Map();
  for (const signal of signals) {
    const momentum = optionalNumber(
      signal?.researchFactors?.momentumPercentile,
      null,
    );
    if (!Number.isFinite(momentum)) continue;
    const sector = sectorOf(signal);
    if (!momentumBySector.has(sector)) momentumBySector.set(sector, []);
    momentumBySector.get(sector).push({
      symbol: symbolOf(signal),
      momentum,
    });
  }
  const sectorMomentumPercentileBySymbol = {};
  const sectorLeadershipBySymbol = {};
  for (const peers of momentumBySector.values()) {
    const ordered = [...peers].sort(
      (left, right) =>
        left.momentum - right.momentum ||
        left.symbol.localeCompare(right.symbol),
    );
    for (let index = 0; index < ordered.length; index++)
      sectorMomentumPercentileBySymbol[ordered[index].symbol] =
        ordered.length < 2 ? 50 : (index / (ordered.length - 1)) * 100;
  }
  const leadershipBySector = new Map();
  for (const signal of signals) {
    const values = [
      signal?.entryTiming?.alpha120VsSpy,
      signal?.entryTiming?.alpha120VsQqq,
    ].map(Number).filter(Number.isFinite);
    if (values.length !== 2) continue;
    const sector = sectorOf(signal);
    if (!leadershipBySector.has(sector)) leadershipBySector.set(sector, []);
    leadershipBySector.get(sector).push({
      symbol: symbolOf(signal),
      value: average(values),
    });
  }
  for (const peers of leadershipBySector.values()) {
    const ordered = peers.map((peer) => peer.value).sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const median = ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
    for (const peer of peers) sectorLeadershipBySymbol[peer.symbol] = median;
  }
  const observations = signals
    .map((signal) => ({
      alpha60: optionalNumber(signal?.entryTiming?.alpha60VsSpy, null),
      momentum: optionalNumber(
        signal?.researchFactors?.momentumPercentile,
        null,
      ),
    }))
    .filter(
      (row) => Number.isFinite(row.alpha60) && Number.isFinite(row.momentum),
    );
  if (observations.length < 20)
    return {
      useQualityDefense: true,
      momentumBreadthPct: null,
      medianMomentumPercentile: null,
      observedSignals: observations.length,
      sectorMomentumPercentileBySymbol,
      sectorLeadershipBySymbol,
    };
  const momentumBreadthPct =
    (observations.filter((row) => row.alpha60 > 0).length /
      observations.length) *
    100;
  const sortedMomentum = observations
    .map((row) => row.momentum)
    .sort((left, right) => left - right);
  const midpoint = Math.floor(sortedMomentum.length / 2);
  const medianMomentumPercentile =
    sortedMomentum.length % 2
      ? sortedMomentum[midpoint]
      : (sortedMomentum[midpoint - 1] + sortedMomentum[midpoint]) / 2;
  const leadershipObservations = signals
    .map((signal) => ({
      quality: optionalNumber(signal?.researchFactors?.qualityPercentile, null),
      momentum: optionalNumber(signal?.researchFactors?.momentumPercentile, null),
      return5: optionalNumber(signal?.researchFactors?.return5, null),
      return20: optionalNumber(signal?.researchFactors?.return20, null),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.quality) &&
        Number.isFinite(row.momentum) &&
        Number.isFinite(row.return5),
    );
  const topCount = Math.max(5, Math.ceil(leadershipObservations.length * 0.25));
  const medianReturn = (rows, key = "return5") => {
    const values = rows.map((row) => row[key]).filter(Number.isFinite).sort((left, right) => left - right);
    if (!values.length) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
  };
  const qualityLeaderReturn5 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.quality - left.quality)
      .slice(0, topCount),
  );
  const momentumLeaderReturn5 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.momentum - left.momentum)
      .slice(0, topCount),
  );
  const qualityLeaderReturn20 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.quality - left.quality)
      .slice(0, topCount),
    "return20",
  );
  const momentumLeaderReturn20 = medianReturn(
    [...leadershipObservations]
      .sort((left, right) => right.momentum - left.momentum)
      .slice(0, topCount),
    "return20",
  );
  return {
    useQualityDefense:
      momentumBreadthPct < 50 || medianMomentumPercentile < 50,
    momentumBreadthPct,
    medianMomentumPercentile,
    observedSignals: observations.length,
    sectorMomentumPercentileBySymbol,
    sectorLeadershipBySymbol,
    useQualityLeadership:
      leadershipObservations.length >= 20 &&
      qualityLeaderReturn5 > momentumLeaderReturn5,
    qualityLeaderReturn5,
    momentumLeaderReturn5,
    useQualityLeadership20:
      leadershipObservations.length >= 20 &&
      Number.isFinite(qualityLeaderReturn20) &&
      Number.isFinite(momentumLeaderReturn20) &&
      qualityLeaderReturn20 > momentumLeaderReturn20,
    useConfirmedQualityDefense:
      leadershipObservations.length >= 20 &&
      momentumBreadthPct < 50 &&
      Number.isFinite(qualityLeaderReturn20) &&
      Number.isFinite(momentumLeaderReturn20) &&
      qualityLeaderReturn20 > momentumLeaderReturn20,
    qualityLeaderReturn20,
    momentumLeaderReturn20,
  };
}

function expandedResearchSource(config = {}) {
  return ["full-evidence", "price-only"].includes(config.researchSignalSource);
}

function entrySignalPool(session = {}, config = {}) {
  if (!expandedResearchSource(config)) return session.signals || [];
  const bySymbol = new Map();
  for (const signal of [
    ...(session.positionSignals || []),
    ...(session.signals || []),
  ]) {
    const symbol = symbolOf(signal);
    if (symbol) bySymbol.set(symbol, signal);
  }
  return [...bySymbol.values()];
}

function observedDollarVolume(signal = {}) {
  const timingDollarVolume = optionalNumber(
    signal.entryTiming?.averageDollarVolume20,
    null,
  );
  if (timingDollarVolume > 0) return timingDollarVolume;
  const price = optionalNumber(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  const volume = optionalNumber(
    signal.avgVolume ?? signal.averageVolume ?? signal.volume,
    null,
  );
  return price > 0 && volume > 0 ? price * volume : null;
}

function entrySignalQualifies(signal = {}, config = {}) {
  const expanded = expandedResearchSource(config);
  const priceOnly = config.researchSignalSource === "price-only";
  const timing = signal.entryTiming || {};
  const factors = signal.researchFactors || {};
  const price = optionalNumber(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  const average50 = optionalNumber(
    signal.priceAvg50 ?? signal.fiftyDayAverage ?? signal.sma50 ?? signal.ma50,
    null,
  );
  const average200 = optionalNumber(
    signal.priceAvg200 ??
      signal.twoHundredDayAverage ??
      signal.sma200 ??
      signal.ma200,
    null,
  );
  const priceVs50Pct =
    price > 0 && average50 > 0 ? (price / average50 - 1) * 100 : null;
  const observedExtensionSigma = momentumExtensionSigma(factors);
  const allowedRegimes = Array.isArray(config.allowedBenchmarkRegimes)
    ? new Set(config.allowedBenchmarkRegimes.map(String))
    : null;
  const anchoredGradualFactorsComplete = [
    factors.highProximityPercentile,
    factors.highRecencyPercentile,
    factors.continuousInformationPercentile,
    factors.intermediateLeadershipPercentile,
    factors.drawdownResiliencePercentile,
  ].every(Number.isFinite);
  const benchmarkResidualFactorsComplete = [
    timing.alpha60VsSpy,
    timing.alpha60VsQqq,
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.momentumPercentile,
    factors.volatility60Pct,
    factors.drawdownResiliencePercentile,
  ].every(Number.isFinite);
  const shortTermReversalFactorsComplete = [
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.return5,
    factors.volatility60Pct,
  ].every(Number.isFinite);
  const industryLeadershipFactorsComplete = [
    timing.alpha120VsSpy,
    timing.alpha120VsQqq,
    factors.momentumPercentile,
    factors.continuousInformationPercentile,
    factors.volatility60Pct,
  ].every(Number.isFinite);
  const attentionShockFactorsComplete = [
    timing.alpha20VsSpy,
    factors.relativeVolume20,
    factors.return5,
    factors.distanceFromYearHighPct,
  ].every(Number.isFinite);

  return Boolean(
    (expanded || ["Strong Buy", "Buy"].includes(signal.action)) &&
    (priceOnly || signal.fundamentalDataVerified === true) &&
    (priceOnly || signal.eventRiskVerified === true) &&
    (expanded
      ? timing.available === true &&
        (!config.requireEntryTimingPass || timing.pass === true)
      : signal.entryTimingVerified === true) &&
    (!config.blockChaseEntries || timing.chase !== true) &&
    (!config.requireLiquidityPass || timing.liquidityPass === true) &&
    (!Number.isFinite(config.minimumAverageDollarVolume) ||
      optionalNumber(observedDollarVolume(signal), -Infinity) >=
        config.minimumAverageDollarVolume) &&
    (!Number.isFinite(config.minimumPrice) ||
      optionalNumber(price, -Infinity) >= config.minimumPrice) &&
    (!config.requireAnchoredGradualFactors ||
      anchoredGradualFactorsComplete) &&
    (!config.requireBenchmarkResidualFactors ||
      benchmarkResidualFactorsComplete) &&
    (!config.requireShortTermReversalFactors ||
      shortTermReversalFactorsComplete) &&
    (!config.requireIndustryLeadershipFactors ||
      industryLeadershipFactorsComplete) &&
    (!config.requireAttentionShockFactors ||
      attentionShockFactorsComplete) &&
    (!config.requireTrendAlignment ||
      (price > average50 && average50 > average200)) &&
    (!Number.isFinite(config.minPriceVs50Pct) ||
      optionalNumber(priceVs50Pct, -Infinity) >= config.minPriceVs50Pct) &&
    (!Number.isFinite(config.maxPriceVs50Pct) ||
      optionalNumber(priceVs50Pct, Infinity) <= config.maxPriceVs50Pct) &&
    (!allowedRegimes || allowedRegimes.has(String(timing.benchmarkRegime))) &&
    (!config.requireRelativeStrength ||
      timing.relativeStrengthVerified === true) &&
    (!config.requireStrongEntryTiming || timing.strongPass === true) &&
    (!Number.isFinite(config.minShortTermTechnicalScore) ||
      number(timing.shortTermTechnicalScore, -Infinity) >=
        config.minShortTermTechnicalScore) &&
    (!Number.isFinite(config.minAlpha20VsSpy) ||
      number(timing.alpha20VsSpy, -Infinity) >= config.minAlpha20VsSpy) &&
    (!Number.isFinite(config.maxAlpha20VsSpy) ||
      number(timing.alpha20VsSpy, Infinity) <= config.maxAlpha20VsSpy) &&
    (!Number.isFinite(config.minAlpha60VsSpy) ||
      number(timing.alpha60VsSpy, -Infinity) >= config.minAlpha60VsSpy) &&
    (!Number.isFinite(config.maxAlpha60VsSpy) ||
      number(timing.alpha60VsSpy, Infinity) <= config.maxAlpha60VsSpy) &&
    (!Number.isFinite(config.minAlpha60VsQqq) ||
      number(timing.alpha60VsQqq, -Infinity) >= config.minAlpha60VsQqq) &&
    (!Number.isFinite(config.minAlpha120VsSpy) ||
      number(timing.alpha120VsSpy, -Infinity) >= config.minAlpha120VsSpy) &&
    (!Number.isFinite(config.minAlpha120VsQqq) ||
      number(timing.alpha120VsQqq, -Infinity) >= config.minAlpha120VsQqq) &&
    (!Number.isFinite(config.minReturn120Ex20) ||
      optionalNumber(factors.return120Ex20, -Infinity) >=
        config.minReturn120Ex20) &&
    (!Number.isFinite(config.minRelativeVolume20) ||
      optionalNumber(factors.relativeVolume20, -Infinity) >=
        config.minRelativeVolume20) &&
    (!Number.isFinite(config.minReturn5Pct) ||
      optionalNumber(factors.return5, -Infinity) >= config.minReturn5Pct) &&
    (!Number.isFinite(config.maxReturn5Pct) ||
      optionalNumber(factors.return5, Infinity) <= config.maxReturn5Pct) &&
    (!Number.isFinite(config.minDistanceFromYearHighPct) ||
      optionalNumber(factors.distanceFromYearHighPct, -Infinity) >=
        config.minDistanceFromYearHighPct) &&
    (!Number.isFinite(config.maxReturn20Pct) ||
      optionalNumber(factors.return20, Infinity) <= config.maxReturn20Pct) &&
    (!Number.isFinite(config.maxReturn60Ex5Pct) ||
      optionalNumber(factors.return60Ex5, Infinity) <=
        config.maxReturn60Ex5Pct) &&
    (!Number.isFinite(config.maxReturn120Ex20Pct) ||
      optionalNumber(factors.return120Ex20, Infinity) <=
        config.maxReturn120Ex20Pct) &&
    (!Number.isFinite(config.maxMomentumExtensionSigma) ||
      optionalNumber(observedExtensionSigma, Infinity) <=
        config.maxMomentumExtensionSigma) &&
    (!config.blockDefensiveEntries || timing.benchmarkRegime !== "defensive") &&
    (timing.benchmarkRegime !== "defensive" ||
      !Number.isFinite(config.defensiveRegimeMinAlpha60) ||
      number(timing.alpha60VsSpy, -Infinity) >=
        config.defensiveRegimeMinAlpha60) &&
    optionalNumber(factors.factorCoverage, 0) >=
      config.minimumResearchFactorCoverage &&
    (!Number.isFinite(config.minQualityPercentile) ||
      optionalNumber(factors.qualityPercentile, -Infinity) >=
        config.minQualityPercentile) &&
    (!Number.isFinite(config.minMomentumPercentile) ||
      optionalNumber(factors.momentumPercentile, -Infinity) >=
        config.minMomentumPercentile) &&
    (!Number.isFinite(config.minCompositePercentile) ||
      optionalNumber(factors.globalCompositePercentile, -Infinity) >=
        config.minCompositePercentile) &&
    (!Number.isFinite(config.minSectorCompositePercentile) ||
      optionalNumber(factors.sectorCompositePercentile, -Infinity) >=
        config.minSectorCompositePercentile) &&
    (!Number.isFinite(config.minValuePercentile) ||
      optionalNumber(factors.valuePercentile, -Infinity) >=
        config.minValuePercentile) &&
    (!Number.isFinite(config.minStabilityPercentile) ||
      optionalNumber(factors.stabilityPercentile, -Infinity) >=
        config.minStabilityPercentile) &&
    (!Number.isFinite(config.maxVolatility60Pct) ||
      optionalNumber(factors.volatility60Pct, Infinity) <=
        config.maxVolatility60Pct),
  );
}

function updateResearchPersistence(state, signals = [], config = {}) {
  const observed = new Set();
  for (const signal of signals) {
    const symbol = symbolOf(signal);
    if (!symbol) continue;
    observed.add(symbol);
    const prior = state.get(symbol) || { qualifiedSessions: 0 };
    state.set(symbol, {
      qualifiedSessions: entrySignalQualifies(signal, config)
        ? number(prior.qualifiedSessions, 0) + 1
        : 0,
    });
  }
  for (const symbol of state.keys())
    if (!observed.has(symbol)) state.delete(symbol);
}

function updatePersistence(state, signals = []) {
  const observed = new Set();
  for (const signal of signals) {
    const symbol = symbolOf(signal);
    if (!symbol) continue;
    observed.add(symbol);
    const prior = state.get(symbol) || { buySessions: 0, strongSessions: 0 };
    if (signal.action === "Strong Buy")
      state.set(symbol, {
        buySessions: prior.buySessions + 1,
        strongSessions: prior.strongSessions + 1,
        currentAction: signal.action,
      });
    else if (signal.action === "Buy")
      state.set(symbol, {
        buySessions: prior.buySessions + 1,
        strongSessions: prior.strongSessions,
        currentAction: signal.action,
      });
    else if (["Watch", "Avoid"].includes(signal.action))
      state.set(symbol, {
        buySessions: 0,
        strongSessions: 0,
        currentAction: signal.action,
      });
    else if (signal.action === "Paused")
      state.set(symbol, { ...prior, currentAction: signal.action });
  }
  return observed;
}

function persistenceEligible(signal, state, capitalSignalEligible = null) {
  const current = state.get(symbolOf(signal));
  const persistent =
    signal.action === "Strong Buy" ||
    (signal.action === "Buy" && number(current?.buySessions, 0) >= 2);
  if (typeof capitalSignalEligible === "function")
    return Boolean(
      capitalSignalEligible({
        target: signal,
        action: signal.action,
        persistence: {
          persistent,
          actionableDays: number(current?.buySessions, 0),
          strongDays: number(current?.strongSessions, 0),
          historyAvailable: true,
          interrupted: false,
        },
      })?.pass,
    );
  return persistent;
}

function equityValue(cash, positions, prices, priceField = "close") {
  let value = cash;
  for (const [symbol, position] of positions) {
    const row = prices.get(symbol);
    const mark = number(row?.[priceField], position.lastPrice);
    value += position.shares * mark;
  }
  return value;
}

function factorExposure(positions, prices, priceField = "close") {
  const factors = new Map();
  for (const [symbol, position] of positions) {
    const mark = number(prices.get(symbol)?.[priceField], position.lastPrice);
    factors.set(
      position.factor,
      number(factors.get(position.factor), 0) + position.shares * mark,
    );
  }
  return factors;
}

function tradePrice(rawPrice, side, slippageBps) {
  const price = number(rawPrice, 0);
  const impact = number(slippageBps, 0) / 10_000;
  return side === "buy" ? price * (1 + impact) : price * (1 - impact);
}

function roundTripDiagnostics(trades = []) {
  const entries = new Map(
    trades
      .filter((trade) => trade.side === "buy")
      .map((trade) => [trade.positionId, trade]),
  );
  const completed = trades
    .filter((trade) => trade.side === "sell" && trade.positionClosed === true)
    .map((trade) => {
      const entry = entries.get(trade.positionId);
      const entryNotional = number(entry?.shares, 0) * number(entry?.price, 0);
      return {
        returnPct:
          entryNotional > 0
            ? (number(trade.roundTripPnl, trade.realizedPnl) / entryNotional) *
              100
            : null,
        reason: String(trade.reason || "unknown"),
        holdingSessions: number(trade.holdingSessions, null),
        mfePct: number(trade.mfePct, null),
        maePct: number(trade.maePct, null),
      };
    })
    .filter((trade) => Number.isFinite(trade.returnPct));
  const values = completed.map((trade) => trade.returnPct);
  const winners = values.filter((value) => value > 0);
  const losers = values.filter((value) => value < 0);
  const holdings = completed
    .map((trade) => trade.holdingSessions)
    .filter(Number.isFinite);
  const exitsByReason = {};
  for (const trade of completed)
    exitsByReason[trade.reason] = number(exitsByReason[trade.reason], 0) + 1;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    expectancyPct: values.length ? round(average(values), 2) : null,
    medianReturnPct: values.length
      ? round(sorted[Math.floor(sorted.length / 2)], 2)
      : null,
    averageWinnerPct: winners.length ? round(average(winners), 2) : null,
    averageLoserPct: losers.length ? round(average(losers), 2) : null,
    winLossPayoffRatio:
      winners.length && losers.length
        ? round(average(winners) / Math.abs(average(losers)), 3)
        : null,
    averageHoldingSessions: holdings.length
      ? round(average(holdings), 1)
      : null,
    averageMfePct: completed.some((trade) => Number.isFinite(trade.mfePct))
      ? round(
          average(
            completed.map((trade) => trade.mfePct).filter(Number.isFinite),
          ),
          2,
        )
      : null,
    averageMaePct: completed.some((trade) => Number.isFinite(trade.maePct))
      ? round(
          average(
            completed.map((trade) => trade.maePct).filter(Number.isFinite),
          ),
          2,
        )
      : null,
    stopOutRatePct: completed.length
      ? round(
          (completed.filter((trade) => STOP_EXIT_REASONS.has(trade.reason))
            .length /
            completed.length) *
            100,
          2,
        )
      : null,
    exitsByReason,
  };
}

function benchmarkAttribution(curve = [], benchmarkCurve = []) {
  const benchmarkReturn =
    benchmarkCurve.length > 1 && benchmarkCurve[0].value > 0
      ? benchmarkCurve.at(-1).value / benchmarkCurve[0].value - 1
      : 0;
  const benchmarkByDate = new Map(
    benchmarkCurve.map((row) => [row.date, number(row.value)]),
  );
  let exposureMatchedBenchmark = 1;
  for (let index = 1; index < curve.length; index++) {
    const priorBenchmark = benchmarkByDate.get(curve[index - 1].date);
    const currentBenchmark = benchmarkByDate.get(curve[index].date);
    if (!(priorBenchmark > 0) || !(currentBenchmark > 0)) continue;
    const priorEquity = number(curve[index - 1].equity);
    const recordedExposure = optionalNumber(
      curve[index - 1].benchmarkExposure,
      null,
    );
    const priorExposure = Number.isFinite(recordedExposure)
      ? clamp(recordedExposure, 0, 1)
      : priorEquity > 0
        ? clamp(1 - number(curve[index - 1].cash) / priorEquity, 0, 1)
        : 0;
    exposureMatchedBenchmark *=
      1 + (currentBenchmark / priorBenchmark - 1) * priorExposure;
  }
  return {
    benchmarkReturn,
    exposureMatchedBenchmarkReturn: exposureMatchedBenchmark - 1,
  };
}

function metricsFromCurve(
  curve = [],
  trades = [],
  benchmarkCurve = [],
  benchmarkCurves = {},
) {
  if (!curve.length)
    return {
      totalReturnPct: 0,
      cagrPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
      sortino: 0,
      trades: 0,
    };
  const values = curve.map((row) => number(row.equity));
  const dailyReturns = [];
  let peak = values[0];
  let maxDrawdown = 0;
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1] > 0)
      dailyReturns.push(values[index] / values[index - 1] - 1);
    peak = Math.max(peak, values[index]);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, values[index] / peak - 1);
  }
  const years = Math.max(1 / 252, (curve.length - 1) / 252);
  const totalReturn = values[0] > 0 ? values.at(-1) / values[0] - 1 : 0;
  const volatility = standardDeviation(dailyReturns);
  const downside = standardDeviation(dailyReturns.filter((value) => value < 0));
  const closed = trades.filter(
    (trade) => trade.side === "sell" && trade.positionClosed === true,
  );
  const tradePnl = (trade) => number(trade.roundTripPnl, trade.realizedPnl);
  const wins = closed.filter((trade) => tradePnl(trade) > 0);
  const grossProfit = closed.reduce(
    (sum, trade) => sum + Math.max(0, tradePnl(trade)),
    0,
  );
  const grossLoss = Math.abs(
    closed.reduce((sum, trade) => sum + Math.min(0, tradePnl(trade)), 0),
  );
  const primaryAttribution = benchmarkAttribution(curve, benchmarkCurve);
  const benchmarkComparisons = {};
  for (const [symbol, comparisonCurve] of Object.entries(
    benchmarkCurves || {},
  )) {
    const attribution = benchmarkAttribution(curve, comparisonCurve);
    benchmarkComparisons[symbol] = {
      simpleReturnPct: round(attribution.benchmarkReturn * 100, 2),
      excessReturnPct: round(
        (totalReturn - attribution.benchmarkReturn) * 100,
        2,
      ),
      exposureMatchedReturnPct: round(
        attribution.exposureMatchedBenchmarkReturn * 100,
        2,
      ),
      exposureMatchedAlphaPct: round(
        (totalReturn - attribution.exposureMatchedBenchmarkReturn) * 100,
        2,
      ),
      cashDragPct: round(
        (attribution.exposureMatchedBenchmarkReturn -
          attribution.benchmarkReturn) *
          100,
        2,
      ),
    };
  }
  const averageEquity = average(values);
  const tradedNotional = trades.reduce(
    (sum, trade) => sum + number(trade.shares) * number(trade.price),
    0,
  );
  const averageActiveExposure = average(
    curve.map((row) => {
      const recorded = optionalNumber(row.activeExposure, null);
      if (Number.isFinite(recorded)) return clamp(recorded, 0, 1);
      return number(row.equity) > 0
        ? clamp(1 - number(row.cash) / number(row.equity), 0, 1)
        : 0;
    }),
  );
  const averageExposure = average(
    curve.map((row) => {
      const recorded = optionalNumber(row.benchmarkExposure, null);
      return Number.isFinite(recorded)
        ? clamp(recorded, 0, 1)
        : number(row.equity) > 0
          ? clamp(1 - number(row.cash) / number(row.equity), 0, 1)
          : 0;
    }),
  );
  const averageBenchmarkSleeve = average(
    curve.map((row) =>
      number(row.equity) > 0
        ? clamp(number(row.benchmarkSleeveValue, 0) / number(row.equity), 0, 1)
        : 0,
    ),
  );
  return {
    totalReturnPct: round(totalReturn * 100, 2),
    cagrPct: round((Math.pow(1 + totalReturn, 1 / years) - 1) * 100, 2),
    maxDrawdownPct: round(maxDrawdown * 100, 2),
    annualizedVolatilityPct: round(volatility * Math.sqrt(252) * 100, 2),
    sharpe: volatility
      ? round((average(dailyReturns) / volatility) * Math.sqrt(252), 3)
      : 0,
    sortino: downside
      ? round((average(dailyReturns) / downside) * Math.sqrt(252), 3)
      : 0,
    trades: trades.length,
    closedTrades: closed.length,
    winRatePct: closed.length
      ? round((wins.length / closed.length) * 100, 2)
      : 0,
    profitFactor: grossLoss ? round(grossProfit / grossLoss, 3) : null,
    benchmarkReturnPct: round(primaryAttribution.benchmarkReturn * 100, 2),
    excessReturnPct: round(
      (totalReturn - primaryAttribution.benchmarkReturn) * 100,
      2,
    ),
    exposureMatchedBenchmarkReturnPct: round(
      primaryAttribution.exposureMatchedBenchmarkReturn * 100,
      2,
    ),
    exposureMatchedAlphaPct: round(
      (totalReturn - primaryAttribution.exposureMatchedBenchmarkReturn) * 100,
      2,
    ),
    cashDragVsBenchmarkPct: round(
      (primaryAttribution.exposureMatchedBenchmarkReturn -
        primaryAttribution.benchmarkReturn) *
        100,
      2,
    ),
    benchmarkComparisons,
    averageExposurePct: round(averageExposure * 100, 2),
    averageActiveExposurePct: round(averageActiveExposure * 100, 2),
    averageBenchmarkSleevePct: round(averageBenchmarkSleeve * 100, 2),
    turnoverPct: averageEquity
      ? round((tradedNotional / averageEquity) * 100, 2)
      : 0,
    annualizedTurnoverPct:
      averageEquity && curve.length
        ? round(
            (tradedNotional / averageEquity) * (252 / curve.length) * 100,
            2,
          )
        : 0,
    tradeDiagnostics: roundTripDiagnostics(trades),
    dailyReturns,
  };
}

export function simulatePointInTimePortfolio(dataset = {}, options = {}) {
  if (symbolOf(options.benchmarkCompletionSymbol))
    throw new Error(
      "Benchmark-completion sleeves are prohibited; uninvested capital must remain cash.",
    );
  const config = {
    initialCapital: 100_000,
    maxPositions: 10,
    buyTargetPct: 0.06,
    strongBuyTargetPct: 0.09,
    buyMaxPositionPct: 0.08,
    strongBuyMaxPositionPct: 0.12,
    buyMaxFactorPct: 0.3,
    strongBuyMaxFactorPct: 0.35,
    minimumTrade: 750,
    slippageBps: 10,
    commissionPerOrder: 0,
    blockedSymbols: [],
    startDate: null,
    endDate: null,
    warmupSessions: 2,
    positionDecision: null,
    capitalAllowance: null,
    portfolioRiskSnapshot: null,
    portfolioContributionGate: null,
    capitalSignalEligible: null,
    swingTimeReview: null,
    positionReunderwrite: null,
    winnerTrimGate: null,
    recordWinnerTrim: null,
    minAlpha20VsSpy: null,
    maxAlpha20VsSpy: null,
    minAlpha60VsSpy: null,
    maxAlpha60VsSpy: null,
    minAlpha60VsQqq: null,
    minAlpha120VsSpy: null,
    minAlpha120VsQqq: null,
    minReturn120Ex20: null,
    maxReturn20Pct: null,
    maxReturn60Ex5Pct: null,
    maxReturn120Ex20Pct: null,
    maxMomentumExtensionSigma: null,
    researchSignalSource: "production",
    requireEntryTimingPass: true,
    blockChaseEntries: false,
    minimumQualifiedSessions: 1,
    requireLiquidityPass: false,
    minimumAverageDollarVolume: null,
    minimumPrice: null,
    requireTrendAlignment: false,
    minPriceVs50Pct: null,
    maxPriceVs50Pct: null,
    allowedBenchmarkRegimes: null,
    requireRelativeStrength: false,
    blockDefensiveEntries: false,
    defensiveRegimeMinAlpha60: null,
    relativeStrengthRankWeight: 0,
    shortTermAlphaRankPenalty: 0,
    shortTermAlphaRankPenaltyThreshold: 0,
    baseRankWeight: 1,
    requireStrongEntryTiming: false,
    minShortTermTechnicalScore: null,
    ratchetRiskPlanStop: true,
    stopRatchetMinHoldSessions: 0,
    stopRatchetMinMfeR: 0,
    classifyStopExits: false,
    stopCooldownSessions: 0,
    relativeExitAlpha20: null,
    relativeExitMinHoldSessions: 10,
    trendExitAlpha60: null,
    trendExitMinHoldSessions: 20,
    timeStopSessions: null,
    timeStopMaxReturnPct: 1,
    profitTrailActivationPct: null,
    profitTrailDistancePct: null,
    minimumResearchFactorCoverage: 0,
    requireAttentionShockFactors: false,
    minRelativeVolume20: null,
    minDistanceFromYearHighPct: null,
    minQualityPercentile: null,
    minMomentumPercentile: null,
    minCompositePercentile: null,
    minSectorCompositePercentile: null,
    minValuePercentile: null,
    minStabilityPercentile: null,
    maxVolatility60Pct: null,
    researchFactorRankWeight: 0,
    qualityRankWeight: 0,
    sectorQualityRankWeight: 0,
    momentumRankWeight: 0,
    valueRankWeight: 0,
    stabilityRankWeight: 0,
    controlledPullbackRankWeight: 0,
    selectionMode: "threshold",
    researchRankMode: "weighted",
    researchRandomSeed: 0,
    rankedRebalanceSessions: 5,
    rankedTargetCount: null,
    rankedExitBuffer: null,
    rankedMinimumHoldSessions: 0,
    rankedEntryQueueCount: null,
    volatilityTargetPct: null,
    riskBudgetPct: null,
    minimumInitialStopPct: null,
    maximumInitialStopPct: null,
    maxSectorPositions: null,
    maxSectorPct: null,
    maxIssuerPositions: null,
    maxEntryGapPct: null,
    ignoreSignalPositionActions: false,
    // Research-only lifecycle experiment. A Review must resolve back to Hold
    // (evidence recovered) or it becomes an exit after a bounded number of
    // consecutive decision sessions. Disabled by default so production and
    // every previously published replay remain unchanged.
    boundedReviewEnabled: false,
    boundedReviewDeadlineSessions: 2,
    boundedOpportunityReviewDeadlineSessions: 1,
    qualityLeadershipMinimumSessions: 40,
    benchmarkSymbols: null,
    liquidateAtEnd: false,
    breakEvenStopMinMfeR: null,
    breakEvenStopBufferPct: 0,
    ...options,
  };
  const allSessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const startIndex = config.startDate
    ? allSessions.findIndex((session) => session.date >= config.startDate)
    : 0;
  const effectiveStart = startIndex < 0 ? allSessions.length : startIndex;
  const warmupStart = Math.max(0, effectiveStart - config.warmupSessions);
  const sessions = allSessions
    .slice(warmupStart)
    .filter((session) => !config.endDate || session.date <= config.endDate);
  const blocked = new Set(config.blockedSymbols.map(symbolOf));
  const persistence = new Map();
  const researchPersistence = new Map();
  const cooldownThrough = new Map();
  const positions = new Map();
  const pending = [];
  const trades = [];
  const skippedOrders = [];
  const curve = [];
  const rankContextObservations = [];
  const primaryBenchmarkSymbol = symbolOf(dataset.metadata?.benchmarkSymbol);
  const benchmarkSymbols = [
    ...new Set(
      [
        primaryBenchmarkSymbol,
        ...(Array.isArray(config.benchmarkSymbols)
          ? config.benchmarkSymbols
          : dataset.metadata?.comparisonSymbols || []),
      ]
        .map(symbolOf)
        .filter(Boolean),
    ),
  ];
  const benchmarkCurves = Object.fromEntries(
    benchmarkSymbols.map((symbol) => [symbol, []]),
  );
  let cash = config.initialCapital;
  const benchmarkShares = new Map();
  let nextPositionId = 1;
  let currentSessionIndex = 0;
  let activeSessionNumber = -1;
  let lastActiveSession = null;
  let lastActivePrices = new Map();
  let persistentQualityLeadership = false;
  let persistentQualityLeadershipThrough = -1;

  const executeSale = ({
    date,
    symbol,
    position,
    shares,
    fill,
    reason,
    commission = config.commissionPerOrder,
    trimContext = null,
  }) => {
    const quantity = Math.min(position.shares, Math.max(0, shares));
    if (!(quantity > 0)) return null;
    const entryCommissionAllocated =
      position.initialShares > 0
        ? position.entryCommission * (quantity / position.initialShares)
        : 0;
    const realizedPnl =
      quantity * (fill - position.entryPrice) -
      commission -
      entryCommissionAllocated;
    cash += Math.max(0, quantity * fill - commission);
    position.realizedPnl = number(position.realizedPnl, 0) + realizedPnl;
    position.shares -= quantity;
    if (reason === "trim" && typeof config.recordWinnerTrim === "function")
      position.winnerHistory = config.recordWinnerTrim(
        position.winnerHistory || {},
        {
          shares: quantity,
          originalShares: position.initialShares,
          remainingShares: position.shares,
          at: date,
          price: fill,
          extensionScore: trimContext?.extensionScore,
        },
      );
    const positionClosed = position.shares <= 0;
    const trade = {
      date,
      symbol,
      side: "sell",
      reason,
      shares: quantity,
      price: fill,
      realizedPnl,
      positionId: position.positionId,
      positionClosed,
      roundTripPnl: positionClosed ? position.realizedPnl : null,
      holdingSessions: Math.max(
        0,
        currentSessionIndex -
          number(position.enteredSessionIndex, currentSessionIndex),
      ),
      initialStopPct:
        position.entryPrice > 0 && position.initialStopPrice > 0
          ? ((position.entryPrice - position.initialStopPrice) /
              position.entryPrice) *
            100
          : null,
      mfePct:
        position.entryPrice > 0
          ? ((number(position.maxPrice, position.entryPrice) -
              position.entryPrice) /
              position.entryPrice) *
            100
          : null,
      maePct:
        position.entryPrice > 0
          ? ((number(position.minPrice, position.entryPrice) -
              position.entryPrice) /
              position.entryPrice) *
            100
          : null,
    };
    trades.push(trade);
    if (positionClosed) {
      positions.delete(symbol);
      if (
        [
          "invalidation-stop",
          "initial-stop",
          "ratcheted-stop",
          "profit-trailing-stop",
        ].includes(reason) &&
        config.stopCooldownSessions > 0
      )
        cooldownThrough.set(
          symbol,
          number(position.lastSessionIndex, 0) + config.stopCooldownSessions,
        );
    }
    return trade;
  };

  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    currentSessionIndex = sessionIndex;
    const session = sessions[sessionIndex];
    const prices = priceMap(session);
    const active = session.date >= (config.startDate || session.date);
    const delistingActions = (session.corporateActions || []).filter(
      (action) => String(action.type || "").toLowerCase() === "delisting",
    );
    const delistedToday = new Set(delistingActions.map(symbolOf));

    if (active) {
      activeSessionNumber++;
      lastActiveSession = session;
      lastActivePrices = prices;
      // Delisting/acquisition proceeds are explicit dataset outcomes. Never keep
      // marking a vanished security at its last quote.
      for (const action of delistingActions) {
        const symbol = symbolOf(action),
          position = positions.get(symbol);
        if (!position) continue;
        const valuePerShare = Math.max(0, number(action.valuePerShare, 0));
        executeSale({
          date: session.date,
          symbol,
          position,
          reason: "delisting-outcome",
          shares: position.shares,
          fill: valuePerShare,
        });
      }

      // Close-generated orders always execute at this next session's open.
      const todaysOrders = pending.splice(0, pending.length);
      const sellOrders = todaysOrders.filter((order) => order.side === "sell");
      const buyOrders = todaysOrders.filter((order) => order.side === "buy");
      for (const order of sellOrders) {
        const position = positions.get(order.symbol);
        const row = prices.get(order.symbol);
        if (!position || !row || !(number(row.open) > 0)) continue;
        const shares = Math.min(
          position.shares,
          number(order.shares, 0) > 0
            ? Math.floor(number(order.shares))
            : order.fraction < 1
              ? Math.max(1, Math.floor(position.shares * order.fraction))
              : position.shares,
        );
        const fill = tradePrice(row.open, "sell", config.slippageBps);
        executeSale({
          date: session.date,
          symbol: order.symbol,
          position,
          reason: order.reason,
          shares,
          fill,
          trimContext: order.trimContext,
        });
      }
      for (const order of buyOrders.sort((a, b) => b.rank - a.rank)) {
        const orderSector = order.sector || "Other";
        if (
          delistedToday.has(order.symbol) ||
          positions.has(order.symbol) ||
          positions.size >= config.maxPositions ||
          (Number.isFinite(config.maxSectorPositions) &&
            [...positions.values()].filter(
              (position) => position.sector === orderSector,
            ).length >= config.maxSectorPositions)
        )
          continue;
        const orderIssuer = order.issuer || issuerOf(order.signal);
        if (
          Number.isFinite(config.maxIssuerPositions) &&
          config.maxIssuerPositions >= 0 &&
          [...positions.values()].filter(
            (position) =>
              (position.issuer || issuerOf(position.stock)) === orderIssuer,
          ).length >= config.maxIssuerPositions
        ) {
          skippedOrders.push({
            date: session.date,
            symbol: order.symbol,
            side: "buy",
            reason: "issuer-concentration-limit",
            issuer: orderIssuer,
          });
          continue;
        }
        const row = prices.get(order.symbol);
        if (!row || !(number(row.open) > 0)) continue;
        if (
          number(order.stopPrice, 0) > 0 &&
          number(row.open) <= number(order.stopPrice)
        ) {
          skippedOrders.push({
            date: session.date,
            symbol: order.symbol,
            side: "buy",
            reason: "entry-invalidated-at-open",
            open: number(row.open),
            invalidationPrice: number(order.stopPrice),
          });
          continue;
        }
        const currentEquity = equityValue(cash, positions, prices, "open");
        const fill = tradePrice(row.open, "buy", config.slippageBps);
        const signalPrice = optionalNumber(
          order.signal?.price ??
            order.signal?.currentPrice ??
            order.signal?.lastPrice ??
            order.signal?.close,
          null,
        );
        const entryGapPct =
          signalPrice > 0 ? ((fill - signalPrice) / signalPrice) * 100 : null;
        if (
          Number.isFinite(config.maxEntryGapPct) &&
          Number.isFinite(entryGapPct) &&
          entryGapPct > config.maxEntryGapPct
        ) {
          skippedOrders.push({
            date: session.date,
            symbol: order.symbol,
            side: "buy",
            reason: "entry-gap-limit",
            entryGapPct,
            maxEntryGapPct: config.maxEntryGapPct,
          });
          continue;
        }
        let targetPct =
          order.action === "Strong Buy"
            ? config.strongBuyTargetPct
            : config.buyTargetPct;
        const volatility60 = optionalNumber(
          order.signal?.researchFactors?.volatility60Pct,
          null,
        );
        if (
          Number.isFinite(config.volatilityTargetPct) &&
          config.volatilityTargetPct > 0 &&
          volatility60 > 0
        )
          targetPct *= clamp(
            config.volatilityTargetPct / volatility60,
            0.55,
            1.25,
          );
        let effectiveStopPrice = number(order.stopPrice, 0);
        let stopDistancePct =
          effectiveStopPrice > 0 && effectiveStopPrice < fill
            ? ((fill - effectiveStopPrice) / fill) * 100
            : null;
        if (
          Number.isFinite(config.minimumInitialStopPct) &&
          config.minimumInitialStopPct > 0 &&
          (!Number.isFinite(stopDistancePct) ||
            stopDistancePct < config.minimumInitialStopPct)
        ) {
          stopDistancePct = config.minimumInitialStopPct;
          effectiveStopPrice = fill * (1 - stopDistancePct / 100);
        }
        if (
          Number.isFinite(config.maximumInitialStopPct) &&
          config.maximumInitialStopPct > 0 &&
          Number.isFinite(stopDistancePct) &&
          stopDistancePct > config.maximumInitialStopPct
        ) {
          stopDistancePct = config.maximumInitialStopPct;
          effectiveStopPrice = fill * (1 - stopDistancePct / 100);
        }
        const executionRiskPlan = {
          ...(order.signal?.riskPlan || {}),
          invalidationPrice: effectiveStopPrice || null,
        };
        const executionSignal = {
          ...(order.signal || {}),
          price: fill,
          currentPrice: fill,
          lastPrice: fill,
          close: fill,
          riskPlan: executionRiskPlan,
          recommendation: order.signal?.recommendation
            ? {
                ...order.signal.recommendation,
                riskPlan: executionRiskPlan,
              }
            : order.signal?.recommendation,
        };
        const maxPositionPct =
          order.action === "Strong Buy"
            ? config.strongBuyMaxPositionPct
            : config.buyMaxPositionPct;
        const maxFactorPct =
          order.action === "Strong Buy"
            ? config.strongBuyMaxFactorPct
            : config.buyMaxFactorPct;
        let budget = Math.min(
          cash - config.commissionPerOrder,
          currentEquity * targetPct,
        );
        let currentPortfolioRisk = null;
        if (
          typeof config.capitalAllowance === "function" &&
          typeof config.portfolioRiskSnapshot === "function"
        ) {
          const holdings = [...positions].map(([symbol, position]) => ({
            ...(position.stock || {}),
            symbol,
            role: "Swing",
            value:
              position.shares *
              number(prices.get(symbol)?.open, position.lastPrice),
          }));
          holdings.push({ symbol: "CASH", role: "Swing", value: cash });
          const risk = config.portfolioRiskSnapshot(holdings);
          currentPortfolioRisk = risk;
          const allowance = config.capitalAllowance({
            target: executionSignal,
            action: order.action,
            requested: budget,
            risk,
          });
          if (allowance?.blocked) {
            skippedOrders.push({
              date: session.date,
              symbol: order.symbol,
              side: "buy",
              reason: "portfolio-allowance-block",
            });
            continue;
          }
          budget = Math.min(budget, Math.max(0, number(allowance?.amount)));
        } else {
          const factors = factorExposure(positions, prices, "open");
          const factorRoom = Math.max(
            0,
            currentEquity * maxFactorPct - number(factors.get(order.factor), 0),
          );
          budget = Math.min(budget, currentEquity * maxPositionPct, factorRoom);
        }
        if (Number.isFinite(config.maxSectorPct) && config.maxSectorPct > 0) {
          const sectorExposure = [...positions.values()]
            .filter((position) => position.sector === orderSector)
            .reduce(
              (total, position) =>
                total +
                position.shares *
                  number(prices.get(position.symbol)?.open, position.lastPrice),
              0,
            );
          budget = Math.min(
            budget,
            Math.max(0, currentEquity * config.maxSectorPct - sectorExposure),
          );
        }
        if (
          Number.isFinite(config.riskBudgetPct) &&
          config.riskBudgetPct > 0 &&
          Number.isFinite(stopDistancePct) &&
          stopDistancePct > 0
        )
          budget = Math.min(
            budget,
            (currentEquity * (config.riskBudgetPct / 100)) /
              (stopDistancePct / 100),
          );
        if (
          currentPortfolioRisk &&
          typeof config.portfolioContributionGate === "function"
        ) {
          const contribution = config.portfolioContributionGate({
            target: executionSignal,
            approvedAmount: budget,
            risk: currentPortfolioRisk,
            existingValue: 0,
          });
          if (!contribution?.pass) {
            skippedOrders.push({
              date: session.date,
              symbol: order.symbol,
              side: "buy",
              reason: "portfolio-contribution-gate",
              rewardRisk: optionalNumber(contribution?.rewardRisk, null),
              entryGapPct,
            });
            continue;
          }
          if (number(contribution.invested, 0) > 0)
            budget = Math.min(budget, number(contribution.invested));
        }
        const shares = Math.floor(Math.max(0, budget) / fill);
        const cost = shares * fill + config.commissionPerOrder;
        if (shares < 1 || cost < config.minimumTrade || cost > cash) continue;
        cash -= cost;
        positions.set(order.symbol, {
          symbol: order.symbol,
          shares,
          initialShares: shares,
          entryPrice: fill,
          entryCommission: config.commissionPerOrder,
          realizedPnl: 0,
          positionId: nextPositionId++,
          enteredAt: session.date,
          enteredSessionIndex: sessionIndex,
          lastSessionIndex: sessionIndex,
          lastPrice: fill,
          highWatermark: fill,
          stopPrice: effectiveStopPrice,
          initialStopPrice: effectiveStopPrice,
          stopKind: "initial-stop",
          factor: order.factor,
          sector: orderSector,
          issuer: orderIssuer,
          stock: executionSignal || null,
          maxPrice: fill,
          minPrice: fill,
          winnerHistory: {
            originalShares: shares,
            trimCount: 0,
            trimmedShares: 0,
          },
        });
        trades.push({
          date: session.date,
          symbol: order.symbol,
          side: "buy",
          reason: order.action,
          shares,
          price: fill,
          realizedPnl: null,
          positionId: nextPositionId - 1,
          signalSnapshot: {
            action: order.action,
            score: number(order.signal?.score, null),
            capitalEfficiencyScore: number(
              order.signal?.capitalEfficiencyScore,
              null,
            ),
            alpha20VsSpy: number(order.signal?.entryTiming?.alpha20VsSpy, null),
            alpha60VsSpy: number(order.signal?.entryTiming?.alpha60VsSpy, null),
            alpha60VsQqq: number(order.signal?.entryTiming?.alpha60VsQqq, null),
            benchmarkRegime:
              order.signal?.entryTiming?.benchmarkRegime || "unknown",
            researchFactors: order.signal?.researchFactors || null,
            stopDistancePct,
            entryGapPct,
          },
        });
      }

      // Orders generated at yesterday's close execute at today's open. Stops
      // then apply to today's range, including positions opened this morning.
      for (const [symbol, position] of [...positions]) {
        const row = prices.get(symbol);
        if (!row || !(position.stopPrice > 0)) continue;
        position.maxPrice = Math.max(
          number(position.maxPrice, position.entryPrice),
          number(row.high, row.close),
        );
        position.minPrice = Math.min(
          number(position.minPrice, position.entryPrice),
          number(row.low, row.close),
        );
        if (number(row.low, Infinity) <= position.stopPrice) {
          const rawFill =
            number(row.open, position.stopPrice) < position.stopPrice
              ? number(row.open)
              : position.stopPrice;
          const fill = tradePrice(rawFill, "sell", config.slippageBps);
          executeSale({
            date: session.date,
            symbol,
            position,
            shares: position.shares,
            fill,
            reason: config.classifyStopExits
              ? position.stopKind || "initial-stop"
              : "invalidation-stop",
          });
        }
      }
    }

    for (const [symbol, position] of positions) {
      const row = prices.get(symbol);
      if (row?.close > 0) {
        position.lastPrice = number(row.close);
        position.highWatermark = Math.max(
          number(position.highWatermark, position.entryPrice),
          number(row.high, row.close),
        );
        position.lastSessionIndex = sessionIndex;
        position.maxPrice = Math.max(
          number(position.maxPrice, position.entryPrice),
          number(row.high, row.close),
        );
        position.minPrice = Math.min(
          number(position.minPrice, position.entryPrice),
          number(row.low, row.close),
        );
      }
    }
    const entrySignals = entrySignalPool(session, config);
    if (expandedResearchSource(config))
      updateResearchPersistence(researchPersistence, entrySignals, config);
    else updatePersistence(persistence, session.signals || []);

    if (active) {
      const equity = equityValue(cash, positions, prices);
      const activeExposure = equity > 0 ? clamp(1 - cash / equity, 0, 1) : 0;
      curve.push({
        date: session.date,
        equity: round(equity, 2),
        cash: round(cash, 2),
        positions: positions.size,
        activeExposure,
        benchmarkExposure: activeExposure,
        benchmarkSleeveValue: 0,
      });
      for (const benchmarkSymbol of benchmarkSymbols) {
        const benchmark = prices.get(benchmarkSymbol);
        if (!benchmark || !(number(benchmark.close) > 0)) continue;
        if (!benchmarkShares.has(benchmarkSymbol)) {
          const entry = number(benchmark.open, number(benchmark.close));
          benchmarkShares.set(
            benchmarkSymbol,
            entry > 0 ? config.initialCapital / entry : 0,
          );
        }
        benchmarkCurves[benchmarkSymbol].push({
          date: session.date,
          value:
            number(benchmarkShares.get(benchmarkSymbol)) *
            number(benchmark.close),
        });
      }

      const signalMap = new Map(
        [...(session.positionSignals || []), ...(session.signals || [])].map(
          (signal) => [symbolOf(signal), signal],
        ),
      );
      const rankedSelection = config.selectionMode === "ranked";
      const rawRankContext = crossSectionalRankContext(entrySignals);
      const rankedRebalanceSessions = Math.max(
        1,
        Math.floor(number(config.rankedRebalanceSessions, 5)),
      );
      const rankRebalance =
        rankedSelection && activeSessionNumber % rankedRebalanceSessions === 0;
      if (
        rankRebalance &&
        config.researchRankMode === "persistent-factor-leadership-20"
      ) {
        if (rawRankContext.useQualityLeadership20 === true) {
          persistentQualityLeadership = true;
          persistentQualityLeadershipThrough = Math.max(
            persistentQualityLeadershipThrough,
            activeSessionNumber +
              Math.max(
                rankedRebalanceSessions,
                Math.floor(number(config.qualityLeadershipMinimumSessions, 40)),
              ),
          );
        } else if (activeSessionNumber >= persistentQualityLeadershipThrough) {
          persistentQualityLeadership = false;
        }
      }
      const rankContext = {
        date: session.date,
        sessionIndex,
        ...rawRankContext,
        usePersistentQualityLeadership: persistentQualityLeadership,
        persistentQualityLeadershipThrough,
      };
      if (rankRebalance)
        rankContextObservations.push({
          date: session.date,
          momentumBreadthPct: rankContext.momentumBreadthPct,
          medianMomentumPercentile: rankContext.medianMomentumPercentile,
          qualityLeaderReturn20: rankContext.qualityLeaderReturn20,
          momentumLeaderReturn20: rankContext.momentumLeaderReturn20,
          useQualityDefense: rankContext.useQualityDefense === true,
          useQualityLeadership20: rankContext.useQualityLeadership20 === true,
          usePersistentQualityLeadership:
            rankContext.usePersistentQualityLeadership === true,
          persistentQualityLeadershipThrough:
            rankContext.persistentQualityLeadershipThrough,
          useConfirmedQualityDefense:
            rankContext.useConfirmedQualityDefense === true,
        });
      const rankedPool = rankedSelection
        ? entrySignals
            .filter(
              (signal) =>
                entrySignalQualifies(signal, config) &&
                !blocked.has(symbolOf(signal)),
            )
            .sort(
              (a, b) =>
                researchRank(b, config, rankContext) -
                  researchRank(a, config, rankContext) ||
                symbolOf(a).localeCompare(symbolOf(b)),
            )
        : [];
      const rankedTargetCount = Math.max(
        1,
        Math.floor(number(config.rankedTargetCount, config.maxPositions)),
      );
      const rankedExitBuffer = Math.max(
        rankedTargetCount,
        Math.floor(number(config.rankedExitBuffer, rankedTargetCount)),
      );
      const retainedRankSymbols = new Set(
        rankedPool.slice(0, rankedExitBuffer).map(symbolOf),
      );
      const rankExitSymbols = new Set();
      if (rankRebalance)
        for (const [symbol, position] of positions) {
          const heldSessions = Math.max(
            0,
            sessionIndex - number(position.enteredSessionIndex, sessionIndex),
          );
          if (
            heldSessions >= config.rankedMinimumHoldSessions &&
            !retainedRankSymbols.has(symbol)
          )
            rankExitSymbols.add(symbol);
        }
      const currentHoldings = [...positions].map(([symbol, position]) => ({
        ...(position.stock || {}),
        symbol,
        role: "Swing",
        value:
          position.shares *
          number(prices.get(symbol)?.close, position.lastPrice),
      }));
      currentHoldings.push({ symbol: "CASH", role: "Swing", value: cash });
      const currentRisk =
        typeof config.portfolioRiskSnapshot === "function"
          ? config.portfolioRiskSnapshot(currentHoldings)
          : null;
      for (const [symbol, position] of positions) {
        const signal = signalMap.get(symbol);
        if (!signal) continue;
        const mark = number(prices.get(symbol)?.close, position.lastPrice);
        const positionSnapshot = {
          symbol,
          role: "Swing",
          shares: position.shares,
          averageCost: position.entryPrice,
          openedAt: position.enteredAt,
          pnlPct:
            position.entryPrice > 0
              ? ((mark - position.entryPrice) / position.entryPrice) * 100
              : 0,
          weightPct: equity > 0 ? ((position.shares * mark) / equity) * 100 : 0,
        };
        const stockSnapshot = {
          ...signal,
          role: "Swing",
          shares: position.shares,
          price: mark,
          currentPrice: mark,
          openedAt: position.enteredAt,
          lastTradeAt: position.enteredAt,
          gainLossPct: positionSnapshot.pnlPct,
          value: position.shares * mark,
        };
        let replayedDecision =
          typeof config.positionDecision === "function"
            ? config.positionDecision({
                stock: signal,
                recommendation: signal.recommendation || {},
                position: positionSnapshot,
                now: new Date(session.decisionAt),
              })
            : null;
        if (
          replayedDecision?.action === "Hold" &&
          typeof config.swingTimeReview === "function" &&
          typeof config.positionReunderwrite === "function"
        ) {
          const historicalNow = new Date(session.decisionAt);
          const timeReview = config.swingTimeReview(
            stockSnapshot,
            historicalNow,
          );
          const reunderwrite = config.positionReunderwrite({
            stock: stockSnapshot,
            decision: replayedDecision,
            risk: currentRisk || {},
            timeReview,
            now: historicalNow,
          });
          if (reunderwrite?.override)
            replayedDecision = {
              ...replayedDecision,
              action: reunderwrite.action,
              reason: reunderwrite.reason,
              reunderwrite,
            };
        }
        const portfolioAction = config.ignoreSignalPositionActions
          ? "Hold"
          : String(replayedDecision?.action || signal.positionAction || "Hold");
        let boundedReviewExit = false;
        if (config.boundedReviewEnabled && portfolioAction === "Review") {
          const reviewStatus = String(
            replayedDecision?.reunderwrite?.status ||
              replayedDecision?.status ||
              "Review",
          );
          const opportunityReview =
            replayedDecision?.reunderwrite?.opportunityCost === true ||
            /opportunity cost/i.test(reviewStatus);
          const reviewKey = opportunityReview ? "opportunity-cost" : reviewStatus;
          if (position.reviewKey === reviewKey)
            position.reviewSessions =
              Math.max(0, number(position.reviewSessions, 0)) + 1;
          else {
            position.reviewKey = reviewKey;
            position.reviewSessions = 1;
            position.reviewStartedAt = session.date;
          }
          const deadline = Math.max(
            1,
            Math.floor(
              number(
                opportunityReview
                  ? config.boundedOpportunityReviewDeadlineSessions
                  : config.boundedReviewDeadlineSessions,
                opportunityReview ? 1 : 2,
              ),
            ),
          );
          boundedReviewExit = position.reviewSessions >= deadline;
        } else if (config.boundedReviewEnabled) {
          // A non-Review decision is the explicit recovery/resolution path.
          position.reviewKey = null;
          position.reviewSessions = 0;
          position.reviewStartedAt = null;
        }
        const heldSessions = Math.max(
          0,
          sessionIndex - number(position.enteredSessionIndex, sessionIndex),
        );
        const pnlPct =
          position.entryPrice > 0 ? (mark / position.entryPrice - 1) * 100 : 0;
        const alpha20 = number(signal.entryTiming?.alpha20VsSpy, null);
        const alpha60 = number(signal.entryTiming?.alpha60VsSpy, null);
        const relativeExit =
          Number.isFinite(config.relativeExitAlpha20) &&
          heldSessions >= config.relativeExitMinHoldSessions &&
          Number.isFinite(alpha20) &&
          alpha20 < config.relativeExitAlpha20;
        const trendExit =
          Number.isFinite(config.trendExitAlpha60) &&
          heldSessions >= config.trendExitMinHoldSessions &&
          Number.isFinite(alpha60) &&
          alpha60 < config.trendExitAlpha60 &&
          mark < number(signal.priceAvg50, 0);
        const timeExit =
          Number.isFinite(config.timeStopSessions) &&
          heldSessions >= config.timeStopSessions &&
          pnlPct <= config.timeStopMaxReturnPct;
        if (rankExitSymbols.has(symbol))
          pending.push({
            side: "sell",
            symbol,
            fraction: 1,
            reason: "rank-deterioration",
          });
        else if (relativeExit || trendExit || timeExit)
          pending.push({
            side: "sell",
            symbol,
            fraction: 1,
            reason: relativeExit
              ? "relative-strength-break"
              : trendExit
                ? "trend-relative-break"
                : "time-stop",
          });
        else if (boundedReviewExit)
          pending.push({
            side: "sell",
            symbol,
            fraction: 1,
            reason: "bounded-review-expiry",
          });
        else if (EXIT_ACTIONS.has(portfolioAction))
          pending.push({
            side: "sell",
            symbol,
            fraction: 1,
            reason: portfolioAction.toLowerCase(),
          });
        else if (portfolioAction === "Reduce") {
          const reduceShares = Math.max(
            0,
            Math.floor(number(replayedDecision?.reunderwrite?.reduceShares, 0)),
          );
          pending.push({
            side: "sell",
            symbol,
            shares: reduceShares || null,
            fraction: reduceShares
              ? null
              : clamp(number(signal.reduceFraction, 0.5), 0.1, 1),
            reason: "reduce",
          });
        } else if (portfolioAction === "Trim") {
          let sellShares = null;
          let trimContext = null;
          if (typeof config.winnerTrimGate === "function") {
            const gate = config.winnerTrimGate({
              position: stockSnapshot,
              decision: replayedDecision,
              history: position.winnerHistory || {},
            });
            if (gate?.pass) {
              const protection = replayedDecision?.profitProtection || {};
              const pnl = Number.isFinite(Number(protection.pnlPct))
                ? Number(protection.pnlPct)
                : positionSnapshot.pnlPct;
              const rawPct =
                protection.highFroth || (protection.winnerFading && pnl >= 60)
                  ? 0.45
                  : protection.winnerFading ||
                      protection.moderateFroth ||
                      pnl >= 75
                    ? 0.35
                    : 0.25;
              const targetPct = Math.min(
                rawPct,
                clamp(number(gate.maxTrimPct, rawPct), 0, 1),
              );
              const positionValue = position.shares * mark;
              const minimumAction = Math.max(500, equity * 0.025);
              const minimumResidual = Math.max(750, equity * 0.04);
              const desired = Math.max(
                minimumAction,
                positionValue * targetPct,
              );
              const maxSell = Math.floor(
                Math.max(0, positionValue - minimumResidual) / mark,
              );
              const candidateShares = Math.min(
                position.shares - 1,
                maxSell,
                Math.ceil(desired / mark),
              );
              const saleValue = candidateShares * mark;
              const residualValue = positionValue - saleValue;
              if (
                candidateShares > 0 &&
                saleValue >= minimumAction &&
                residualValue >= minimumResidual
              ) {
                sellShares = candidateShares;
                trimContext = {
                  extensionScore: protection.extension,
                  targetPct,
                };
              }
            }
          } else {
            sellShares = Math.max(
              1,
              Math.floor(
                position.shares *
                  clamp(number(signal.reduceFraction, 0.5), 0.1, 1),
              ),
            );
          }
          if (sellShares)
            pending.push({
              side: "sell",
              symbol,
              shares: sellShares,
              fraction: null,
              reason: "trim",
              trimContext,
            });
        }
        const stop = number(signal.riskPlan?.invalidationPrice, 0);
        const initialRisk = Math.max(
          0,
          number(position.entryPrice) - number(position.initialStopPrice),
        );
        const mfeR =
          initialRisk > 0
            ? (number(position.highWatermark, position.entryPrice) -
                position.entryPrice) /
              initialRisk
            : 0;
        const breakEvenStop =
          Number.isFinite(config.breakEvenStopMinMfeR) &&
          mfeR >= config.breakEvenStopMinMfeR
            ? position.entryPrice *
              (1 + number(config.breakEvenStopBufferPct, 0) / 100)
            : 0;
        const nextRatchetStop = Math.max(stop, breakEvenStop);
        if (
          config.ratchetRiskPlanStop &&
          heldSessions >= config.stopRatchetMinHoldSessions &&
          mfeR >= config.stopRatchetMinMfeR &&
          nextRatchetStop > number(position.stopPrice, 0) &&
          nextRatchetStop < number(prices.get(symbol)?.close, Infinity)
        ) {
          position.stopPrice = nextRatchetStop;
          position.stopKind = "ratcheted-stop";
        }
        if (
          Number.isFinite(config.profitTrailActivationPct) &&
          Number.isFinite(config.profitTrailDistancePct)
        ) {
          const highGain =
            position.entryPrice > 0
              ? (position.highWatermark / position.entryPrice - 1) * 100
              : 0;
          if (highGain >= config.profitTrailActivationPct) {
            const trailing =
              position.highWatermark *
              (1 - config.profitTrailDistancePct / 100);
            if (trailing < mark && trailing > number(position.stopPrice, 0)) {
              position.stopPrice = trailing;
              position.stopKind = "profit-trailing-stop";
            }
          }
        }
      }

      const candidates = entrySignals
        .filter(
          (signal) =>
            entrySignalQualifies(signal, config) &&
            !positions.has(symbolOf(signal)) &&
            !blocked.has(symbolOf(signal)) &&
            sessionIndex > number(cooldownThrough.get(symbolOf(signal)), -1) &&
            (expandedResearchSource(config)
              ? number(
                  researchPersistence.get(symbolOf(signal))?.qualifiedSessions,
                  0,
                ) >= config.minimumQualifiedSessions
              : persistenceEligible(
                  signal,
                  persistence,
                  config.capitalSignalEligible,
                )),
        )
        .sort(
          (a, b) =>
            researchRank(b, config, rankContext) -
              researchRank(a, config, rankContext) ||
            symbolOf(a).localeCompare(symbolOf(b)),
        )
        .slice(
          0,
          rankedSelection
            ? Math.max(
                rankedTargetCount,
                Math.floor(
                  number(config.rankedEntryQueueCount, rankedTargetCount * 3),
                ),
              )
            : undefined,
        );
      const pendingSymbols = new Set(
        pending
          .filter((order) => order.side === "buy")
          .map((order) => order.symbol),
      );
      for (const signal of rankedSelection && !rankRebalance
        ? []
        : candidates) {
        const symbol = symbolOf(signal);
        if (pendingSymbols.has(symbol)) continue;
        const action = expandedResearchSource(config)
          ? signal.entryTiming?.strongPass === true
            ? "Strong Buy"
            : "Buy"
          : signal.action;
        pending.push({
          side: "buy",
          symbol,
          action,
          // Preserve the same causal cross-sectional context used to select
          // the close-generated queue. Recomputing a context-sensitive rank
          // without that context can invert an adaptive quality/momentum
          // decision before the order reaches the next open.
          rank: researchRank(signal, config, rankContext),
          factor: factorOf(signal),
          sector: sectorOf(signal),
          issuer: issuerOf(signal),
          stopPrice: number(signal.riskPlan?.invalidationPrice, 0),
          signal,
        });
        pendingSymbols.add(symbol);
      }
    }
  }
  if (config.liquidateAtEnd && lastActiveSession && positions.size) {
    for (const [symbol, position] of [...positions]) {
      const row = lastActivePrices.get(symbol);
      const rawFill = number(row?.close, position.lastPrice);
      if (!(rawFill > 0)) continue;
      executeSale({
        date: lastActiveSession.date,
        symbol,
        position,
        shares: position.shares,
        fill: tradePrice(rawFill, "sell", config.slippageBps),
        reason: "window-end-liquidation",
      });
    }
    const finalCurvePoint = curve.at(-1);
    if (finalCurvePoint) {
      const equity = equityValue(cash, positions, lastActivePrices);
      const activeExposure = equity > 0 ? clamp(1 - cash / equity, 0, 1) : 0;
      Object.assign(finalCurvePoint, {
        equity: round(equity, 2),
        cash: round(cash, 2),
        positions: positions.size,
        activeExposure,
        benchmarkExposure: activeExposure,
        benchmarkSleeveValue: 0,
      });
    }
  }
  const benchmarkCurve = benchmarkCurves[primaryBenchmarkSymbol] || [];
  const metrics = metricsFromCurve(
    curve,
    trades,
    benchmarkCurve,
    benchmarkCurves,
  );
  const averageRankContext = (field) => {
    const values = rankContextObservations
      .map((row) => optionalNumber(row[field], null))
      .filter(Number.isFinite);
    return values.length ? round(average(values), 2) : null;
  };
  const regimeCount = (field) =>
    rankContextObservations.filter((row) => row[field] === true).length;
  metrics.rankRegimeDiagnostics = {
    rebalanceObservations: rankContextObservations.length,
    averageMomentumBreadthPct: averageRankContext("momentumBreadthPct"),
    averageMedianMomentumPercentile: averageRankContext(
      "medianMomentumPercentile",
    ),
    qualityDefenseRebalances: regimeCount("useQualityDefense"),
    qualityLeadership20Rebalances: regimeCount("useQualityLeadership20"),
    persistentQualityLeadershipRebalances: regimeCount(
      "usePersistentQualityLeadership",
    ),
    confirmedQualityDefenseRebalances: regimeCount(
      "useConfirmedQualityDefense",
    ),
    observations: rankContextObservations,
  };
  return {
    config,
    metrics,
    curve,
    benchmarkCurve,
    benchmarkCurves,
    trades,
    skippedOrders,
    endingCash: round(cash, 2),
    openPositions: [...positions.values()],
  };
}

function selectionScore(metrics = {}) {
  const sharpe = number(metrics.sharpe, -10);
  const drawdownPenalty =
    Math.abs(Math.min(0, number(metrics.maxDrawdownPct))) / 20;
  const tradePenalty = number(metrics.closedTrades) < 10 ? 1 : 0;
  return sharpe - drawdownPenalty - tradePenalty;
}

export function runWalkForwardBacktest(dataset = {}, options = {}) {
  const validation = validatePointInTimeDataset(dataset, {
    minimumSessions: options.minimumSessions ?? 756,
  });
  if (!validation.valid) {
    const error = new Error(
      `Point-in-time dataset rejected:\n- ${validation.errors.join("\n- ")}`,
    );
    error.validation = validation;
    throw error;
  }
  const dates = dataset.sessions.map((session) => session.date);
  const folds = createWalkForwardFolds(dates, options.folds);
  if (!folds.length)
    throw new Error(
      "No complete train/validation/test walk-forward fold is available.",
    );
  const parameterGrid =
    Array.isArray(options.parameterGrid) && options.parameterGrid.length
      ? options.parameterGrid
      : [{}];
  const foldResults = [];
  const combinedDailyReturns = [];
  let compounded = 1;
  let benchmarkCompounded = 1;

  for (const fold of folds) {
    const evaluated = parameterGrid.map((parameters, index) => {
      const train = simulatePointInTimePortfolio(dataset, {
        ...parameters,
        ...(options.simulationOptions || {}),
        positionDecision: options.positionDecision,
        startDate: fold.train.start,
        endDate: fold.train.end,
      });
      const validationRun = simulatePointInTimePortfolio(dataset, {
        ...parameters,
        ...(options.simulationOptions || {}),
        positionDecision: options.positionDecision,
        startDate: fold.validation.start,
        endDate: fold.validation.end,
      });
      const robustScore = Math.min(
        selectionScore(train.metrics),
        selectionScore(validationRun.metrics),
      );
      return { index, parameters, train, validationRun, robustScore };
    });
    evaluated.sort(
      (a, b) => b.robustScore - a.robustScore || a.index - b.index,
    );
    const selected = evaluated[0];
    const test = simulatePointInTimePortfolio(dataset, {
      ...selected.parameters,
      ...(options.simulationOptions || {}),
      positionDecision: options.positionDecision,
      startDate: fold.test.start,
      endDate: fold.test.end,
    });
    compounded *= 1 + number(test.metrics.totalReturnPct) / 100;
    benchmarkCompounded *= 1 + number(test.metrics.benchmarkReturnPct) / 100;
    combinedDailyReturns.push(...(test.metrics.dailyReturns || []));
    foldResults.push({
      fold: fold.fold,
      windows: fold,
      selectedParameters: selected.parameters,
      selectionScore: round(selected.robustScore, 4),
      trainMetrics: { ...selected.train.metrics, dailyReturns: undefined },
      validationMetrics: {
        ...selected.validationRun.metrics,
        dailyReturns: undefined,
      },
      testMetrics: { ...test.metrics, dailyReturns: undefined },
      testTrades: test.trades,
    });
  }
  const dailyVolatility = standardDeviation(combinedDailyReturns);
  const totalTestSessions = foldResults.reduce(
    (sum, fold) =>
      sum +
      dataset.sessions.filter(
        (session) =>
          session.date >= fold.windows.test.start &&
          session.date <= fold.windows.test.end,
      ).length,
    0,
  );
  const years = Math.max(1 / 252, totalTestSessions / 252);
  const oosReturn = compounded - 1;
  const oosBenchmarkReturn = benchmarkCompounded - 1;
  const outOfSampleClosedTrades = foldResults.reduce(
    (sum, fold) => sum + number(fold.testMetrics.closedTrades),
    0,
  );
  const minimumOosClosedTrades = Math.max(
    1,
    number(options.minimumOosClosedTrades, 30),
  );
  const researchEligible =
    validation.credibleForResearch &&
    typeof options.positionDecision === "function" &&
    typeof options.simulationOptions?.capitalAllowance === "function" &&
    typeof options.simulationOptions?.portfolioRiskSnapshot === "function" &&
    typeof options.simulationOptions?.portfolioContributionGate ===
      "function" &&
    typeof options.simulationOptions?.capitalSignalEligible === "function" &&
    typeof options.simulationOptions?.swingTimeReview === "function" &&
    typeof options.simulationOptions?.positionReunderwrite === "function" &&
    typeof options.simulationOptions?.winnerTrimGate === "function" &&
    typeof options.simulationOptions?.recordWinnerTrim === "function" &&
    outOfSampleClosedTrades >= minimumOosClosedTrades;
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      pointInTime: true,
      nextSessionExecution: true,
      parameterSelectionUsesTestData: false,
      ordinaryBuyPersistenceSessions: 2,
      strongBuyImmediateAfterHardGates: true,
      slippageAndWholeShares: true,
      delistingOutcomesRealized: true,
      productionCapitalPolicyReplayed:
        typeof options.simulationOptions?.capitalAllowance === "function" &&
        typeof options.simulationOptions?.portfolioRiskSnapshot ===
          "function" &&
        typeof options.simulationOptions?.portfolioContributionGate ===
          "function" &&
        typeof options.simulationOptions?.capitalSignalEligible === "function",
      productionPositionLifecycleReplayed:
        typeof options.simulationOptions?.swingTimeReview === "function" &&
        typeof options.simulationOptions?.positionReunderwrite === "function" &&
        typeof options.simulationOptions?.winnerTrimGate === "function" &&
        typeof options.simulationOptions?.recordWinnerTrim === "function",
      minimumOosClosedTrades,
    },
    validation,
    foldCount: foldResults.length,
    folds: foldResults,
    outOfSample: {
      sessions: totalTestSessions,
      compoundedReturnPct: round(oosReturn * 100, 2),
      cagrPct: round((Math.pow(1 + oosReturn, 1 / years) - 1) * 100, 2),
      sharpe: dailyVolatility
        ? round(
            (average(combinedDailyReturns) / dailyVolatility) * Math.sqrt(252),
            3,
          )
        : 0,
      closedTrades: outOfSampleClosedTrades,
      worstFoldDrawdownPct: Math.min(
        ...foldResults.map((fold) => number(fold.testMetrics.maxDrawdownPct)),
      ),
      benchmarkCompoundedReturnPct: round(oosBenchmarkReturn * 100, 2),
      excessCompoundedReturnPct: round(
        (oosReturn - oosBenchmarkReturn) * 100,
        2,
      ),
    },
    claimStatus: researchEligible
      ? "eligible-for-independent-review"
      : validation.credibleForResearch &&
          typeof options.positionDecision === "function" &&
          typeof options.simulationOptions?.capitalAllowance === "function" &&
          typeof options.simulationOptions?.portfolioRiskSnapshot ===
            "function" &&
          typeof options.simulationOptions?.portfolioContributionGate ===
            "function" &&
          typeof options.simulationOptions?.capitalSignalEligible ===
            "function" &&
          typeof options.simulationOptions?.swingTimeReview === "function" &&
          typeof options.simulationOptions?.positionReunderwrite ===
            "function" &&
          typeof options.simulationOptions?.winnerTrimGate === "function" &&
          typeof options.simulationOptions?.recordWinnerTrim === "function"
        ? "insufficient-out-of-sample-trades"
        : "mechanics-only",
  };
}
