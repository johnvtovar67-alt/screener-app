// V12 is a single momentum-first development thesis chosen after V11 showed
// that momentum remained the strongest factor while the short-horizon chase
// flag still admitted stocks whose larger 20/60/120-session advance was
// already extreme. The reused dates are development data, not a fresh holdout.

export const V12_THESIS_ID =
  "v12-predeclared-momentum-first-entry-discipline-rank";
export const V12_THESIS_LABEL =
  "Predeclared momentum-first blend with multi-horizon entry discipline";
export const V12_DEVELOPMENT_PLACEBO_SEEDS = 25;
export const V12_STRICT_PLACEBO_SEEDS = 1_000;

export const V12_EVIDENCE_REQUIREMENTS = Object.freeze({
  minimumClosedRoundTrips: 30,
  minimumAverageActiveStockExposurePct: 80,
  minimumPositiveAlphaFoldShare: 0.5,
  strictPointInTimePlaceboSeeds: V12_STRICT_PLACEBO_SEEDS,
  placeboPercentileToBeat: 0.95,
  requiredBenchmarks: Object.freeze(["SPY", "QQQ"]),
  primaryAlphaMeasure:
    "simple total-return difference versus SPY and QQQ, with cash kept as cash",
  developmentSource:
    "V11 factor and trade diagnostics used to increase momentum weight and replace the short-only chase test with a multi-horizon entry governor",
  independentHoldoutRequired: true,
});

export function v12StrategyOptions(overrides = {}) {
  return {
    thesisId: V12_THESIS_ID,
    thesisLabel: V12_THESIS_LABEL,
    selectionEligible: true,
    researchSignalSource: "full-evidence",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: [...V12_EVIDENCE_REQUIREMENTS.requiredBenchmarks],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 10_000_000,
    minimumPrice: 5,
    // Momentum earns the rank, but a fresh entry must still be technically
    // intact and cannot use a brief pullback to disguise a mature advance.
    requireEntryTimingPass: true,
    requireTrendAlignment: true,
    blockChaseEntries: true,
    maxPriceVs50Pct: 16,
    maxReturn20Pct: 30,
    maxReturn60Ex5Pct: 100,
    maxReturn120Ex20Pct: 125,
    maxMomentumExtensionSigma: 3,
    maxEntryGapPct: 3,
    requireRelativeStrength: false,
    minimumResearchFactorCoverage: 8,
    selectionMode: "ranked",
    researchRankMode: "momentum-first-entry-disciplined-blend",
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
    postSelectedFromV11Diagnostics: true,
    ...overrides,
  };
}

export function v12AuditControlDefinitions() {
  return [
    {
      controlId: "simple-momentum-rank",
      controlLabel: "Simple momentum rank with V12 entry discipline",
      researchRankMode: "momentum-only",
    },
    {
      controlId: "v11-momentum-dominant-blend",
      controlLabel: "V11 momentum-dominant weighting with V12 entry discipline",
      researchRankMode: "momentum-dominant-quality-blend",
    },
    {
      controlId: "v12-rank-without-multi-horizon-entry-governor",
      controlLabel: "V12 rank without the multi-horizon entry governor",
      researchRankMode: "momentum-first-entry-disciplined-blend",
      requireEntryTimingPass: false,
      requireTrendAlignment: false,
      maxPriceVs50Pct: null,
      maxReturn20Pct: null,
      maxReturn60Ex5Pct: null,
      maxReturn120Ex20Pct: null,
      maxMomentumExtensionSigma: null,
    },
    {
      controlId: "simple-quality-rank",
      controlLabel: "Simple quality rank with V12 entry discipline",
      researchRankMode: "quality-only",
    },
    {
      controlId: "transparent-bull-cycle-pullback-rank",
      controlLabel:
        "Transparent non-repainting bull-cycle and pullback rank with V12 entry discipline",
      researchRankMode: "bull-cycle-pullback-control",
      requireTrendAlignment: true,
      requireEntryTimingPass: true,
      allowedBenchmarkRegimes: ["bullish"],
    },
  ];
}
