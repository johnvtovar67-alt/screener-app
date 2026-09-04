// R40-R44 are frozen before execution. They test whether R38's breadth-timed
// two-leader mechanism survives modestly more responsive, predeclared rank
// replacement. This is inspected-development research, not validation.

const weights = Object.freeze({
  momentum: 0.15,
  relative120: 0.38,
  relative60: 0.12,
  continuity: 0.2,
  anchor: 0.1,
  stability: 0.03,
  contraction: 0.02,
});

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
  momentumSpineWeights: weights,
  minimumQualifiedSessions: 1,
  maxIssuerPositions: 1,
  classifyStopExits: true,
  ratchetRiskPlanStop: false,
  timeStopMaxReturnPct: 1_000,
  timeStopSessions: 504,
  maxVolatility60Pct: 100,
  volatilityTargetPct: null,
  riskBudgetPct: null,
  baseRankWeight: 0,
  rankedAdaptiveRebalanceEnabled: true,
  rankedAdaptiveEqualWeightEnabled: true,
  rankedWeakBreadthThresholdPct: 50,
  rankedWeakBreadthRebalanceSessions: 5,
  rankedStrongBreadthRebalanceSessions: 20,
  rankedAdaptiveTargetEnabled: false,
});

function candidate({ researchGeneration, id, label, mechanism, target = 2, exitBuffer, strongCadence = 20, stopPct = 20 }) {
  return {
    id, researchGeneration, label,
    family: "adaptive-rank-replacement",
    mechanism, weights, control: false,
    overrides: {
      ...common,
      rankedStrongBreadthRebalanceSessions: strongCadence,
      rankedTargetCount: target,
      rankedWeakBreadthTargetCount: target,
      rankedStrongBreadthTargetCount: target,
      rankedExitBuffer: exitBuffer,
      rankedMinimumHoldSessions: 10,
      rankedEntryQueueCount: Math.max(10, target * 4),
      buyTargetPct: 0.99 / target,
      strongBuyTargetPct: 0.99 / target,
      buyMaxPositionPct: 1,
      strongBuyMaxPositionPct: 1,
      buyMaxFactorPct: 1,
      strongBuyMaxFactorPct: 1,
      maxPositions: target,
      maxSectorPositions: target,
      maxSectorPct: 1,
      minimumInitialStopPct: stopPct,
      maximumInitialStopPct: stopPct,
    },
  };
}

export function pointInTimeNasdaqAdaptiveReplacementDefinitions() {
  return [
    candidate({ researchGeneration: "R40", id: "r40-two-leader-buffer-four", label: "Adaptive two leaders with rank-four retention", mechanism: "tightens R38's rank-six retention buffer to four without changing signal weights or weak-breadth cadence", exitBuffer: 4 }),
    candidate({ researchGeneration: "R41", id: "r41-two-leader-buffer-three", label: "Adaptive two leaders with rank-three retention", mechanism: "requires a held leader to remain in the top three at a scheduled review", exitBuffer: 3 }),
    candidate({ researchGeneration: "R42", id: "r42-two-leader-fifteen-session-broad", label: "Adaptive two leaders with faster broad review", mechanism: "retains weekly weak-breadth review and shortens broad-breadth review from 20 to 15 sessions", exitBuffer: 4, strongCadence: 15 }),
    candidate({ researchGeneration: "R43", id: "r43-two-leader-eighteen-stop", label: "Adaptive two leaders with tighter loss budget", mechanism: "combines rank-four replacement with an 18% initial loss budget", exitBuffer: 4, stopPct: 18 }),
    candidate({ researchGeneration: "R44", id: "r44-three-leader-transition", label: "Adaptive three-leader transition", mechanism: "tests whether a third leader increases completed evidence while retaining weekly weak-breadth rotation", target: 3, exitBuffer: 6, strongCadence: 15, stopPct: 20 }),
  ];
}

export function pointInTimeNasdaqAdaptiveReplacementControls() {
  const matched = pointInTimeNasdaqAdaptiveReplacementDefinitions()[0].overrides;
  return [
    { id: "r40-control-simple-momentum", label: "Adaptive replacement simple momentum control", family: "control", mechanism: "simple momentum under the matched R40 lifecycle", weights: { momentum: 1 }, control: true, overrides: { ...matched, researchRankMode: "momentum-only" } },
    { id: "r40-control-random-seed-40", label: "Adaptive replacement random control", family: "control", mechanism: "deterministic random ranking under the matched R40 lifecycle", weights: { random: 1 }, control: true, overrides: { ...matched, researchRankMode: "random-placebo", researchRandomSeed: 40 } },
  ];
}
