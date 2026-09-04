// R30-R34 are frozen before execution. They test whether the R26 result
// survives a continuous lifecycle and whether economically bounded
// diversification/risk sizing can keep drawdown within 25% without forfeiting
// the dual-benchmark edge. Cash remains cash; all orders fill next open.

const common = Object.freeze({
  researchSignalSource: "price-only",
  independentLifecycle: true,
  ignoreSignalPositionActions: true,
  exitOnUniverseRemoval: true,
  benchmarkSymbols: ["SPY", "QQQ"],
  benchmarkCompletionSymbol: null,
  liquidateAtEnd: true,
  requireLiquidityPass: true,
  minimumAverageDollarVolume: 30_000_000,
  minimumPrice: 5,
  slippageBps: 12,
  commissionPerOrder: 0,
  requireEntryTimingPass: false,
  requireTrendAlignment: false,
  requireRelativeStrength: false,
  minimumResearchFactorCoverage: 0,
  blockChaseEntries: false,
  maxEntryGapPct: 3,
  selectionMode: "ranked",
  researchRankMode: "momentum-spine",
  minimumQualifiedSessions: 1,
  maxIssuerPositions: 1,
  classifyStopExits: true,
  ratchetRiskPlanStop: false,
  timeStopMaxReturnPct: 1_000,
  maxVolatility60Pct: 100,
  riskBudgetPct: null,
  baseRankWeight: 0,
});

const persistentWeights = Object.freeze({
  momentum: 0.15,
  relative120: 0.38,
  relative60: 0.12,
  continuity: 0.2,
  anchor: 0.1,
  stability: 0.03,
  contraction: 0.02,
});

function candidate({ researchGeneration, id, label, mechanism, target, stopPct, volatilityTargetPct = null, targetWeights = null, exitBuffer = 8 }) {
  return {
    id,
    researchGeneration,
    label,
    family: "continuous-nasdaq-runner-risk",
    mechanism,
    weights: persistentWeights,
    control: false,
    overrides: {
      ...common,
      momentumSpineWeights: persistentWeights,
      rankedRebalanceSessions: 20,
      rankedTargetCount: target,
      rankedExitBuffer: exitBuffer,
      rankedMinimumHoldSessions: 60,
      rankedEntryQueueCount: Math.max(8, target * 4),
      rankedTargetWeights: targetWeights,
      buyTargetPct: 0.99 / target,
      strongBuyTargetPct: 0.99 / target,
      buyMaxPositionPct: targetWeights ? Math.max(...targetWeights) : 1 / target,
      strongBuyMaxPositionPct: targetWeights ? Math.max(...targetWeights) : 1 / target,
      buyMaxFactorPct: 1,
      strongBuyMaxFactorPct: 1,
      maxPositions: target,
      maxSectorPositions: target,
      maxSectorPct: 1,
      minimumInitialStopPct: stopPct,
      maximumInitialStopPct: stopPct,
      timeStopSessions: 504,
      volatilityTargetPct,
    },
  };
}

export function pointInTimeNasdaqContinuousRunnerDefinitions() {
  return [
    candidate({
      researchGeneration: "R30",
      id: "r30-two-leader-continuous",
      label: "Continuous two-leader Nasdaq runners",
      mechanism: "preserves two persistent leaders across reporting folds to remove forced boundary turnover",
      target: 2,
      stopPct: 28,
    }),
    candidate({
      researchGeneration: "R31",
      id: "r31-two-leader-risk-stop",
      label: "Continuous two leaders with bounded loss",
      mechanism: "retains two runner slots while capping idiosyncratic loss sooner to target the unchanged drawdown gate",
      target: 2,
      stopPct: 22,
    }),
    candidate({
      researchGeneration: "R32",
      id: "r32-two-leader-volatility-budget",
      label: "Volatility-budgeted continuous leaders",
      mechanism: "sizes two persistent leaders to a 22% volatility budget while leaving unused capital in cash",
      target: 2,
      stopPct: 25,
      volatilityTargetPct: 22,
    }),
    candidate({
      researchGeneration: "R33",
      id: "r33-single-leader-volatility-budget",
      label: "Volatility-budgeted strongest runner",
      mechanism: "tests whether R26's single-leader edge survives an explicit 20% volatility budget",
      target: 1,
      stopPct: 25,
      volatilityTargetPct: 20,
      exitBuffer: 5,
    }),
    candidate({
      researchGeneration: "R34",
      id: "r34-three-leader-conviction-weighted",
      label: "Conviction-weighted three continuous leaders",
      mechanism: "allocates 50/30/19 across three persistent leaders to reduce single-name drawdown while retaining rank concentration",
      target: 3,
      stopPct: 25,
      targetWeights: [0.5, 0.3, 0.19],
      exitBuffer: 12,
    }),
  ];
}

export function pointInTimeNasdaqContinuousRunnerControls() {
  const target = 2;
  const matched = {
    ...common,
    rankedRebalanceSessions: 20,
    rankedTargetCount: target,
    rankedExitBuffer: 8,
    rankedMinimumHoldSessions: 60,
    rankedEntryQueueCount: 8,
    buyTargetPct: 0.99 / target,
    strongBuyTargetPct: 0.99 / target,
    buyMaxPositionPct: 1 / target,
    strongBuyMaxPositionPct: 1 / target,
    buyMaxFactorPct: 1,
    strongBuyMaxFactorPct: 1,
    maxPositions: target,
    maxSectorPositions: target,
    maxSectorPct: 1,
    minimumInitialStopPct: 28,
    maximumInitialStopPct: 28,
    timeStopSessions: 504,
  };
  return [
    {
      id: "r30-control-simple-momentum",
      label: "Continuous simple Nasdaq momentum control",
      family: "control",
      mechanism: "simple momentum under the matched continuous two-runner lifecycle",
      weights: { momentum: 1 },
      control: true,
      overrides: { ...matched, researchRankMode: "momentum-only" },
    },
    {
      id: "r30-control-random-seed-30",
      label: "Continuous random Nasdaq control",
      family: "control",
      mechanism: "deterministic random ranking under the matched continuous two-runner lifecycle",
      weights: { random: 1 },
      control: true,
      overrides: {
        ...matched,
        researchRankMode: "random-placebo",
        researchRandomSeed: 30,
      },
    },
  ];
}
