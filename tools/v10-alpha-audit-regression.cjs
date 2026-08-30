const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader(process.cwd());
const { runV10AlphaAudit } = loader.load("lib/v10AlphaAudit.js");
const {
  V10_THESIS_ID,
  v10AuditControlDefinitions,
  v10StrategyOptions,
} = loader.load(
  "lib/v10ResearchContract.js",
);

function signal(date, symbol, quality, momentum) {
  const decisionAt = `${date}T20:00:00.000Z`;
  return {
    symbol,
    action: "Buy",
    listedAt: "2010-01-04",
    delistedAt: null,
    marketAvailableAt: decisionAt,
    fundamentalsAvailableAt: `${date}T12:00:00.000Z`,
    eventRiskAvailableAt: decisionAt,
    fundamentalDataVerified: true,
    fundamentalRevisionSafe: true,
    eventRiskVerified: true,
    eventHistoryComplete: true,
    entryTimingVerified: true,
    price: 100,
    priceAvg50: 95,
    priceAvg200: 90,
    riskPlan: { invalidationPrice: 70 },
    entryTiming: {
      available: true,
      pass: true,
      strongPass: true,
      liquidityPass: true,
      averageDollarVolume20: 100_000_000,
      relativeStrengthVerified: true,
      shortTermTechnicalScore: momentum,
      alpha20VsSpy: 2,
      alpha60VsSpy: 4,
      alpha60VsQqq: 2,
      benchmarkRegime: "bullish",
    },
    researchFactors: {
      factorCoverage: 8,
      qualityPercentile: quality,
      sectorQualityPercentile: quality,
      momentumPercentile: momentum,
      stabilityPercentile: 70,
      controlledPullbackScore: 65,
      volatility60Pct: 25,
    },
  };
}

const sessions = Array.from({ length: 1_008 }, (_, index) => {
  const date = new Date(Date.UTC(2022, 0, 3 + index))
    .toISOString()
    .slice(0, 10);
  const aaa = 100 + index * 0.08;
  const bbb = 100 + index * 0.04;
  const spy = 500 + index * 0.2;
  const qqq = 450 + index * 0.22;
  const signals = [signal(date, "AAA", 85, 90), signal(date, "BBB", 70, 65)];
  return {
    date,
    decisionAt: `${date}T20:00:00.000Z`,
    sourceUniverseCount: 1_500,
    historicalDelistedMembership: 1,
    corporateActions:
      index === 500
        ? [{ type: "delisting", symbol: "ZZZ", valuePerShare: 0 }]
        : [],
    signals,
    positionSignals: signals,
    prices: [
      { symbol: "AAA", open: aaa, high: aaa + 1, low: aaa - 1, close: aaa, adjusted: true },
      { symbol: "BBB", open: bbb, high: bbb + 1, low: bbb - 1, close: bbb, adjusted: true },
      { symbol: "SPY", open: spy, high: spy + 1, low: spy - 1, close: spy, adjusted: true },
      { symbol: "QQQ", open: qqq, high: qqq + 1, low: qqq - 1, close: qqq, adjusted: true },
    ],
  };
});

const dataset = {
  metadata: {
    schema: "screener-pit-v1",
    pointInTime: true,
    survivorshipBiasFree: true,
    universeMembershipPointInTime: true,
    delistedSecuritiesIncluded: true,
    delistingReturnsComplete: true,
    corporateActionsAdjusted: true,
    fundamentalsPointInTime: true,
    fundamentalValuesRevisionSafe: true,
    eventRiskPointInTime: true,
    materialNewsHistoryComplete: true,
    portfolioDecisionInputsComplete: true,
    capitalPolicyInputsComplete: true,
    positionDecisionUniverseComplete: true,
    fundamentalAvailabilityField: "acceptedDate",
    dataVendorEntitlementsVerified: true,
    benchmarkSymbol: "SPY",
    comparisonSymbols: ["SPY", "QQQ"],
    v10HoldoutAttestation: {
      sealedBeforeEvaluation: true,
      excludedFromV7ThroughV10Development: true,
      thesisFrozenBeforeReveal: true,
    },
  },
  sessions,
};

const report = runV10AlphaAudit(dataset, {
  placeboSeedCount: 2,
  slippageBps: 0,
});
assert(
  report.thesisId === V10_THESIS_ID &&
    report.foldCount === 3 &&
    report.selectionPolicy === "single-predeclared-thesis-no-selector" &&
    report.controls.randomPlacebo.seedCount === 2 &&
    Number.isFinite(
      report.controls.transparentBullCyclePullback.totalReturnPct,
    ) &&
    typeof report.evidenceAssessment.checks
      .beatsTransparentBullCyclePullbackControl === "boolean" &&
    report.evidenceAssessment.checks.strictPlaceboCount === false &&
    report.evidenceAssessment.pass === false &&
    report.evidenceAssessment.capitalClaimAuthorized === false &&
    report.summary.averageBenchmarkSleevePct === 0,
  "The strict V10 runner must preserve the frozen thesis, require 1,000 placebos, keep cash out of benchmark sleeves and refuse capital authorization when any evidence gate fails.",
);
const strategy = v10StrategyOptions();
const controls = v10AuditControlDefinitions();
assert(
  strategy.benchmarkCompletionSymbol === null &&
    strategy.selectionMode === "ranked" &&
    strategy.ratchetRiskPlanStop === false &&
    strategy.minimumInitialStopPct === 18 &&
    strategy.maximumInitialStopPct === 18,
  "The shared V10 contract must make the no-filler ranked lifecycle immutable across provisional and strict research runners.",
);
assert(
  controls.length === 3 &&
    controls[2].researchRankMode === "bull-cycle-pullback-control" &&
    controls[2].requireTrendAlignment === true &&
    controls[2].requireEntryTimingPass === true &&
    controls[2].allowedBenchmarkRegimes.join(",") === "bullish",
  "The technical bull-cycle comparison must stay transparent, non-repainting and isolated as an audit control rather than a post-hoc thesis selector.",
);

console.log(
  "V10 ALPHA AUDIT PASS: frozen thesis, strict holdout gates, placebo floor and cash-as-cash policy verified.",
);
