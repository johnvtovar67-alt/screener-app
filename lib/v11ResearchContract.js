// V11 is intentionally a single momentum-dominant blend chosen after V10
// exposed that its balanced quality blend diluted the momentum control. The
// old V10 dates are therefore development data for V11, never an independent
// holdout.

export const V11_THESIS_ID =
  "v11-predeclared-momentum-dominant-quality-rank";
export const V11_THESIS_LABEL =
  "Predeclared momentum-dominant quality leadership blend";
export const V11_DEVELOPMENT_PLACEBO_SEEDS = 25;
export const V11_STRICT_PLACEBO_SEEDS = 1_000;

export const V11_EVIDENCE_REQUIREMENTS = Object.freeze({
  minimumClosedRoundTrips: 30,
  minimumAverageActiveStockExposurePct: 80,
  minimumPositiveAlphaFoldShare: 0.5,
  strictPointInTimePlaceboSeeds: V11_STRICT_PLACEBO_SEEDS,
  placeboPercentileToBeat: 0.95,
  requiredBenchmarks: Object.freeze(["SPY", "QQQ"]),
  primaryAlphaMeasure:
    "simple total-return difference versus SPY and QQQ, with cash kept as cash",
  developmentSource:
    "V10 simple-momentum control used to rebalance the V11 blend after the V10 audit",
  independentHoldoutRequired: true,
});

export function v11StrategyOptions(overrides = {}) {
  return {
    thesisId: V11_THESIS_ID,
    thesisLabel: V11_THESIS_LABEL,
    selectionEligible: true,
    researchSignalSource: "full-evidence",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: [...V11_EVIDENCE_REQUIREMENTS.requiredBenchmarks],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 10_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    // Fundamental history must be complete enough to audit the cohort. Quality
    // remains a minority stabilizer instead of matching momentum's influence.
    minimumResearchFactorCoverage: 7,
    // Do not convert a strong medium-term rank into a late entry after a sharp
    // 3/5/10-session run-up or an oversized next-open gap.
    blockChaseEntries: true,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "momentum-dominant-quality-blend",
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
    postSelectedFromV10Control: true,
    ...overrides,
  };
}

export function v11AuditControlDefinitions() {
  return [
    {
      controlId: "simple-momentum-rank",
      controlLabel: "Simple momentum rank",
      researchRankMode: "momentum-only",
    },
    {
      controlId: "v10-quality-momentum-blend",
      controlLabel: "V10 quality-momentum leadership blend",
      researchRankMode: "quality-momentum-leadership",
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
