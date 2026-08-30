export const V10_THESIS_ID = "v10-predeclared-quality-momentum-rank";
export const V10_THESIS_LABEL =
  "Predeclared quality-momentum leadership rank";
export const V10_DEVELOPMENT_PLACEBO_SEEDS = 25;
export const V10_STRICT_PLACEBO_SEEDS = 1_000;

export const V10_EVIDENCE_REQUIREMENTS = Object.freeze({
  minimumClosedRoundTrips: 30,
  minimumAverageActiveStockExposurePct: 80,
  minimumPositiveAlphaFoldShare: 0.5,
  strictPointInTimePlaceboSeeds: V10_STRICT_PLACEBO_SEEDS,
  placeboPercentileToBeat: 0.95,
  requiredBenchmarks: Object.freeze(["SPY", "QQQ"]),
  primaryAlphaMeasure:
    "simple total-return difference versus SPY and QQQ, with cash kept as cash",
});

export function v10StrategyOptions(overrides = {}) {
  return {
    thesisId: V10_THESIS_ID,
    thesisLabel: V10_THESIS_LABEL,
    selectionEligible: true,
    researchSignalSource: "full-evidence",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: [...V10_EVIDENCE_REQUIREMENTS.requiredBenchmarks],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 10_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    minimumResearchFactorCoverage: 7,
    maxEntryGapPct: 4,
    selectionMode: "ranked",
    researchRankMode: "quality-momentum-leadership",
    rankedRebalanceSessions: 5,
    rankedTargetCount: 12,
    rankedExitBuffer: 12,
    rankedMinimumHoldSessions: 10,
    rankedEntryQueueCount: 36,
    minimumQualifiedSessions: 1,
    buyTargetPct: 0.0825,
    strongBuyTargetPct: 0.0825,
    buyMaxPositionPct: 0.085,
    strongBuyMaxPositionPct: 0.085,
    maxPositions: 12,
    minimumInitialStopPct: 18,
    maximumInitialStopPct: 18,
    maxSectorPositions: 4,
    maxSectorPct: 0.34,
    maxIssuerPositions: 1,
    stopCooldownSessions: 0,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 126,
    timeStopMaxReturnPct: 1_000,
    baseRankWeight: 0,
    ...overrides,
  };
}

export function v10AuditControlDefinitions() {
  return [
    {
      controlId: "simple-momentum-rank",
      controlLabel: "Simple momentum rank",
      researchRankMode: "momentum-only",
    },
    {
      controlId: "simple-quality-rank",
      controlLabel: "Simple quality rank",
      researchRankMode: "quality-only",
    },
    {
      controlId: "transparent-bull-cycle-pullback-rank",
      controlLabel:
        "Transparent non-repainting bull-cycle and pullback rank",
      researchRankMode: "bull-cycle-pullback-control",
      requireTrendAlignment: true,
      requireEntryTimingPass: true,
      allowedBenchmarkRegimes: ["bullish"],
    },
  ];
}
