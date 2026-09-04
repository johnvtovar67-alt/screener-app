// R25-R29 test the remaining economic question from R21: whether a momentum
// portfolio can match a concentrated cap-weighted benchmark only when the
// strongest one-to-three Nasdaq leaders receive comparable concentration and
// wider rank-retention buffers. Frozen together before execution.

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
  volatilityTargetPct: null,
  riskBudgetPct: null,
  baseRankWeight: 0,
});

function candidate({ researchGeneration, id, label, mechanism, weights, target, rebalance, exitBuffer, minimumHold, stopPct }) {
  return {
    id,
    researchGeneration,
    label,
    family: "concentrated-runner-retention",
    mechanism,
    weights,
    lifecycle: { target, rebalance, exitBuffer, minimumHold, timeStop: 252, stopPct },
    control: false,
    overrides: {
      ...common,
      momentumSpineWeights: weights,
      rankedRebalanceSessions: rebalance,
      rankedTargetCount: target,
      rankedExitBuffer: exitBuffer,
      rankedMinimumHoldSessions: minimumHold,
      rankedEntryQueueCount: Math.max(6, target * 4),
      buyTargetPct: 0.99 / target,
      strongBuyTargetPct: 0.99 / target,
      buyMaxPositionPct: 1 / target,
      strongBuyMaxPositionPct: 1 / target,
      buyMaxFactorPct: 1,
      strongBuyMaxFactorPct: 1,
      maxPositions: target,
      maxSectorPositions: target,
      maxSectorPct: 1,
      minimumInitialStopPct: stopPct,
      maximumInitialStopPct: stopPct,
      timeStopSessions: 252,
    },
  };
}

const persistentWeights = Object.freeze({
  momentum: 0.15,
  relative120: 0.38,
  relative60: 0.12,
  continuity: 0.2,
  anchor: 0.1,
  stability: 0.03,
  contraction: 0.02,
});

export function pointInTimeNasdaqConcentratedRunnerDefinitions() {
  return [
    candidate({
      researchGeneration: "R25",
      id: "r25-two-leader-retention",
      label: "Two-leader Nasdaq runner retention",
      mechanism:
        "two persistent leaders receive benchmark-like concentration while a wide rank buffer avoids ordinary rotation",
      weights: persistentWeights,
      target: 2,
      rebalance: 20,
      exitBuffer: 8,
      minimumHold: 60,
      stopPct: 28,
    }),
    candidate({
      researchGeneration: "R26",
      id: "r26-single-leader-retention",
      label: "Single strongest Nasdaq runner",
      mechanism:
        "isolates whether the benchmark gap is entirely a concentration effect, subject to the unchanged drawdown gate",
      weights: persistentWeights,
      target: 1,
      rebalance: 20,
      exitBuffer: 5,
      minimumHold: 60,
      stopPct: 30,
    }),
    candidate({
      researchGeneration: "R27",
      id: "r27-three-leader-wide-buffer",
      label: "Three Nasdaq leaders with wide retention buffer",
      mechanism:
        "retains R21's three-name concentration but requires severe rank deterioration before replacing a runner",
      weights: persistentWeights,
      target: 3,
      rebalance: 20,
      exitBuffer: 15,
      minimumHold: 60,
      stopPct: 28,
    }),
    candidate({
      researchGeneration: "R28",
      id: "r28-three-leader-responsive",
      label: "Responsive three-leader Nasdaq continuation",
      mechanism:
        "tests whether faster monthly confirmation captures new leaders without returning to high-turnover weekly rotation",
      weights: {
        momentum: 0.13,
        relative120: 0.3,
        relative60: 0.22,
        continuity: 0.18,
        anchor: 0.1,
        stability: 0.04,
        contraction: 0.03,
      },
      target: 3,
      rebalance: 10,
      exitBuffer: 10,
      minimumHold: 40,
      stopPct: 25,
    }),
    candidate({
      researchGeneration: "R29",
      id: "r29-two-leader-anchored",
      label: "Two anchored continuous Nasdaq leaders",
      mechanism:
        "two-name concentration is conditioned on sustained benchmark leadership and proximity to the 52-week high",
      weights: {
        momentum: 0.12,
        relative120: 0.36,
        relative60: 0.1,
        continuity: 0.19,
        anchor: 0.16,
        stability: 0.04,
        contraction: 0.03,
      },
      target: 2,
      rebalance: 20,
      exitBuffer: 8,
      minimumHold: 60,
      stopPct: 28,
    }),
  ];
}

export function pointInTimeNasdaqConcentratedRunnerControls() {
  const target = 3;
  const matched = {
    ...common,
    rankedRebalanceSessions: 20,
    rankedTargetCount: target,
    rankedExitBuffer: 15,
    rankedMinimumHoldSessions: 60,
    rankedEntryQueueCount: 12,
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
    timeStopSessions: 252,
  };
  return [
    {
      id: "r25-control-simple-momentum",
      label: "Simple concentrated Nasdaq momentum control",
      family: "control",
      mechanism: "unmodified momentum under the matched three-runner lifecycle",
      weights: { momentum: 1 },
      control: true,
      overrides: { ...matched, researchRankMode: "momentum-only" },
    },
    {
      id: "r25-control-random-seed-25",
      label: "Random concentrated Nasdaq control",
      family: "control",
      mechanism: "deterministic random ranking under the matched three-runner lifecycle",
      weights: { random: 1 },
      control: true,
      overrides: {
        ...matched,
        researchRankMode: "random-placebo",
        researchRandomSeed: 25,
      },
    },
  ];
}
