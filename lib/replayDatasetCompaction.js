// Keep durable research replay data small enough to restore inside a bounded
// serverless process. The compiler's narrative evidence is useful for the UI,
// but the simulator only needs prices, scores, gates, dates and lifecycle state.

const SIGNAL_SCALAR_FIELDS = [
  "symbol",
  "companyName",
  "cik",
  "cikNumber",
  "sector",
  "industry",
  "factor",
  "primaryTheme",
  "action",
  "positionAction",
  "positionRole",
  "reduceFraction",
  "price",
  "previousClose",
  "dayChangePct",
  "volume",
  "avgVolume",
  "priceAvg50",
  "priceAvg200",
  "timestamp",
  "score",
  "fundamentalScore",
  "technicalScore",
  "momentumScore",
  "relativeStrengthScore",
  "leadershipScore",
  "entryQualityScore",
  "riskScore",
  "extensionRisk",
  "capitalEfficiencyScore",
  "opportunityGap",
  "rotateTarget",
  "rotationTargetEligible",
  "fundamentalDataStatus",
  "fundamentalDataVerified",
  "eventRiskVerified",
  "entryTimingVerified",
  "factorState",
  "themeState",
  "sectorState",
  "marketCycleState",
  "factorWeakness",
  "themeWeakness",
  "sectorWeakness",
];

const SIGNAL_OBJECT_FIELDS = [
  "eventRisk",
  "materialCatalysts",
];

const REPLAY_STRING_FIELDS = new Set([
  "symbol",
  "ticker",
  "name",
  "companyName",
  "cik",
  "cikNumber",
  "sector",
  "industry",
  "factor",
  "primaryTheme",
  "theme",
  "themeKey",
  "action",
  "positionAction",
  "positionRole",
  "role",
  "rotateTarget",
  "date",
  "decisionAt",
  "listedAt",
  "delistedAt",
  "availableAt",
  "acceptedDate",
  "marketAvailableAt",
  "fundamentalsAvailableAt",
  "eventRiskAvailableAt",
  "fundamentalDataStatus",
  "status",
  "severity",
  "riskLevel",
  "recommendedAction",
  "type",
  "benchmarkRegime",
  "label",
  "displayLabel",
  "recommendation",
  "tradeAction",
  "decisionTiming",
  "positionSize",
  "capitalView",
  "factorState",
  "themeState",
  "sectorState",
  "marketCycleState",
  "expectedCloseDate",
  "expectedCloseLabel",
  "acquirer",
  "acquirerSymbol",
  "structure",
]);

function compactPrimitiveTree(value, key = "") {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string")
    return REPLAY_STRING_FIELDS.has(key) ? value : undefined;
  if (Array.isArray(value)) {
    const compacted = value
      .map((item) => compactPrimitiveTree(item, key))
      .filter((item) => item !== undefined);
    return compacted.length ? compacted : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const compacted = compactPrimitiveTree(childValue, childKey);
    if (compacted !== undefined) output[childKey] = compacted;
  }
  return Object.keys(output).length ? output : undefined;
}

function pickFields(source, fields) {
  const output = {};
  for (const field of fields) {
    const value = source?.[field];
    if (value !== null && value !== undefined) output[field] = value;
  }
  return Object.keys(output).length ? output : undefined;
}

function compactRiskPlan(value) {
  return pickFields(value, [
    "invalidationPrice",
    "firstTrimPrice",
    "payoffRatio",
  ]);
}

function compactEntryTiming(value) {
  return pickFields(value, [
    "available",
    "pass",
    "strongPass",
    "chase",
    "fallingKnife",
    "lateBounce",
    "momentumConflict",
    "volumeBreakout",
    "macdImproving",
    "rsi14",
    "ret5",
    "ret10",
    "sma20Slope",
    "belowHigh20",
    "liquidityVerified",
    "liquidityPass",
    "averageDollarVolume20",
    "relativeStrengthVerified",
    "shortTermTechnicalScore",
    "alpha20VsSpy",
    "alpha60VsSpy",
    "alpha60VsQqq",
    "alpha120VsSpy",
    "alpha120VsQqq",
    "benchmarkRegime",
    "status",
  ]);
}

function compactExpertDecision(value) {
  if (!value || typeof value !== "object") return undefined;
  const output = pickFields(value, [
    "action",
    "thesisScore",
    "tradeSetupScore",
    "capitalScore",
    "strongQualityScore",
  ]) || {};
  const metrics = pickFields(value.metrics, [
    "technical",
    "leadership",
    "momentum",
    "entry",
    "risk",
    "extension",
    "below50",
    "below200",
    "day",
    "vs50",
  ]);
  if (metrics) output.metrics = metrics;
  return Object.keys(output).length ? output : undefined;
}

function compactRecommendation(value) {
  if (!value || typeof value !== "object") return undefined;
  const output = pickFields(value, [
    "score",
    "businessQualityScore",
    "technicalScore",
    "momentumScore",
    "leadershipScore",
    "relativeStrengthScore",
    "entryQualityScore",
    "riskScore",
    "extensionRisk",
    "opportunityGap",
    "rotateTarget",
    "rotationTargetEligible",
  ]) || {};
  const gateSummary = pickFields(value.gateSummary, [
    "buyEligible",
    "starterEligible",
  ]);
  if (gateSummary) output.gateSummary = gateSummary;
  const expertDecision = compactExpertDecision(value.expertDecision);
  if (expertDecision) output.expertDecision = expertDecision;
  return Object.keys(output).length ? output : undefined;
}

function compactResearchFactors(value) {
  return pickFields(value, [
    "factorCoverage",
    "qualityPercentile",
    "sectorQualityPercentile",
    "momentumPercentile",
    "valuePercentile",
    "stabilityPercentile",
    "globalCompositePercentile",
    "sectorCompositePercentile",
    "controlledPullbackScore",
    "volatility60Pct",
    "volatility20Pct",
    "return5",
    "return20",
    "return60Ex5",
    "return120Ex20",
    "return200Ex20",
    "distanceFromYearHighPct",
    "yearHighRecencySessions",
    "positiveSessionShare120Pct",
    "pathEfficiency120Pct",
    "informationDiscreteness120",
    "maxDrawdown120Pct",
    "relativeVolume20",
    "maxDailyReturn20Pct",
    "momentumAccelerationDailyPct",
    "highProximityPercentile",
    "highRecencyPercentile",
    "continuousInformationPercentile",
    "intermediateLeadershipPercentile",
    "drawdownResiliencePercentile",
    "accelerationRestraintPercentile",
    "lotteryRestraintPercentile",
  ]);
}

function compactFinalDecision(value) {
  return pickFields(value, ["action"]);
}

export function compactReplaySignal(signal = {}) {
  const output = {};
  for (const field of SIGNAL_SCALAR_FIELDS) {
    const value = signal?.[field];
    if (value === null || value === undefined) continue;
    if (["string", "number", "boolean"].includes(typeof value))
      output[field] = value;
  }
  output.symbol = String(signal.symbol || signal.ticker || "");
  const companyName = signal.companyName || signal.name;
  if (companyName) output.companyName = companyName;
  const price = signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close;
  if (Number.isFinite(Number(price))) output.price = Number(price);
  const dayChangePct =
    signal.dayChangePct ?? signal.changesPercentage ?? signal.changePercentage;
  if (Number.isFinite(Number(dayChangePct)))
    output.dayChangePct = Number(dayChangePct);
  const avgVolume =
    signal.avgVolume ?? signal.averageVolume ?? signal.avgVolume30Day;
  if (Number.isFinite(Number(avgVolume))) output.avgVolume = Number(avgVolume);
  const priceAvg50 =
    signal.priceAvg50 ?? signal.fiftyDayAverage ?? signal.sma50 ?? signal.ma50;
  if (Number.isFinite(Number(priceAvg50))) output.priceAvg50 = Number(priceAvg50);
  const priceAvg200 =
    signal.priceAvg200 ??
    signal.twoHundredDayAverage ??
    signal.sma200 ??
    signal.ma200;
  if (Number.isFinite(Number(priceAvg200)))
    output.priceAvg200 = Number(priceAvg200);
  for (const field of SIGNAL_OBJECT_FIELDS) {
    const compacted = compactPrimitiveTree(signal?.[field], field);
    if (compacted !== undefined) output[field] = compacted;
  }
  const researchFactors = compactResearchFactors(signal.researchFactors);
  if (researchFactors) output.researchFactors = researchFactors;
  const riskPlan = compactRiskPlan(signal.riskPlan);
  if (riskPlan) output.riskPlan = riskPlan;
  const entryTiming = compactEntryTiming(signal.entryTiming);
  if (entryTiming) output.entryTiming = entryTiming;
  const recommendation = compactRecommendation(signal.recommendation);
  if (recommendation) output.recommendation = recommendation;
  const gateSummary = pickFields(signal.gateSummary, [
    "buyEligible",
    "starterEligible",
  ]);
  if (gateSummary) output.gateSummary = gateSummary;
  const finalDecision = compactFinalDecision(signal.finalDecision);
  if (finalDecision) output.finalDecision = finalDecision;
  if (!signal.eventRisk && signal.preTradeCheck) {
    const preTradeCheck = compactPrimitiveTree(
      signal.preTradeCheck,
      "preTradeCheck",
    );
    if (preTradeCheck) output.preTradeCheck = preTradeCheck;
  }
  // Some legacy compiled rows kept the expert metrics only at the root.
  if (!signal?.recommendation?.expertDecision && signal?.expertDecision) {
    const expertDecision = compactExpertDecision(signal.expertDecision);
    if (expertDecision !== undefined) output.expertDecision = expertDecision;
  }
  return output;
}

function compactReplayPrice(row = {}) {
  const output = {};
  for (const field of [
    "symbol",
    "ticker",
    "date",
    "open",
    "high",
    "low",
    "close",
    "adjClose",
    "adjustedClose",
    "volume",
    "adjusted",
  ]) {
    const value = row?.[field];
    if (value !== null && value !== undefined) output[field] = value;
  }
  return output;
}

export function compactReplaySession(session = {}) {
  const signals = Array.isArray(session.signals)
    ? session.signals.map(compactReplaySignal)
    : [];
  const signalSymbols = new Set(
    signals.map((signal) => String(signal.symbol || signal.ticker || "")),
  );
  return {
    date: session.date,
    decisionAt: session.decisionAt,
    universeSymbols: Array.isArray(session.universeSymbols)
      ? session.universeSymbols.map(String).sort()
      : null,
    sourceUniverseCount: session.sourceUniverseCount,
    historicalDelistedMembership: session.historicalDelistedMembership,
    eligibleUniverseCount: session.eligibleUniverseCount,
    corporateActions:
      compactPrimitiveTree(session.corporateActions, "corporateActions") || [],
    prices: Array.isArray(session.prices)
      ? session.prices.map(compactReplayPrice)
      : [],
    signals,
    // The simulator overlays fresh-capital signals on holding signals by
    // symbol. Persist only holding-only rows; duplicates can never be observed.
    positionSignals: Array.isArray(session.positionSignals)
      ? session.positionSignals
          .filter(
            (signal) =>
              !signalSymbols.has(String(signal?.symbol || signal?.ticker || "")),
          )
          .map(compactReplaySignal)
      : [],
  };
}
