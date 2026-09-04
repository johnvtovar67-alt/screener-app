// R55-R64: event/acceleration mechanisms frozen together before execution.
const common = Object.freeze({
  researchSignalSource: "price-only", independentLifecycle: true, ignoreSignalPositionActions: true,
  exitOnUniverseRemoval: true, benchmarkSymbols: ["SPY", "QQQ"], benchmarkCompletionSymbol: null,
  liquidateAtEnd: true, requireLiquidityPass: true, minimumAverageDollarVolume: 30_000_000,
  minimumPrice: 5, slippageBps: 12, commissionPerOrder: 0, requireEntryTimingPass: false,
  requireTrendAlignment: false, requireRelativeStrength: false, minimumResearchFactorCoverage: 0,
  blockChaseEntries: false, maxEntryGapPct: 3, selectionMode: "ranked", minimumQualifiedSessions: 1,
  maxIssuerPositions: 1, classifyStopExits: true, ratchetRiskPlanStop: false,
  timeStopMaxReturnPct: 1_000, maxVolatility60Pct: 100, volatilityTargetPct: null,
  riskBudgetPct: null, baseRankWeight: 0,
});

function lifecycle(target, hold = 15, rebalance = 5, stop = 14) {
  return { rankedTargetCount: target, rankedExitBuffer: target * 2, rankedEntryQueueCount: target * 3,
    rankedRebalanceSessions: rebalance, rankedMinimumHoldSessions: hold, timeStopSessions: 63,
    buyTargetPct: 0.99 / target, strongBuyTargetPct: 0.99 / target,
    buyMaxPositionPct: 1 / target, strongBuyMaxPositionPct: 1 / target,
    buyMaxFactorPct: 1, strongBuyMaxFactorPct: 1, maxPositions: target,
    maxSectorPositions: target, maxSectorPct: 1, minimumInitialStopPct: stop, maximumInitialStopPct: stop };
}

const mechanisms = Object.freeze([
  { key: "shock", label: "Volume-shock breakout continuation", mode: "attention-shock-breakout-continuation", extra: { requireAttentionShockFactors: true, minRelativeVolume20: 1.5, minReturn5Pct: 0, maxReturn5Pct: 12, minDistanceFromYearHighPct: -5, attentionShockWeights: { activityShock: .4, breakoutProximity: .25, followthrough: .2, relativeStrength20: .15 } } },
  { key: "breakout", label: "Breakout follow-through", mode: "breakout-followthrough-only", extra: { minReturn5Pct: 0, maxReturn5Pct: 12, minDistanceFromYearHighPct: -5 } },
  { key: "attention", label: "Attention shock without near-high constraint", mode: "attention-shock-only", extra: { minRelativeVolume20: 1.5 } },
  { key: "reversal", label: "Controlled short-term reversal", mode: "conditional-short-term-reversal", extra: { conditionalReversalWeights: { longTrend: .35, pullback: .3, stabilization: .2, relativeStrength: .15 } } },
  { key: "earnings", label: "Post-earnings drift", mode: "post-earnings-drift", source: "earnings-event", extra: { requireEarningsSurpriseFactors: true, earningsDriftWeights: { surprise: .55, residual20: .2, residual60: .15, recency: .1 }, minEarningsSurpriseScore: .25, minSessionsSinceEarnings: 0, maxSessionsSinceEarnings: 40 } },
]);

export function pointInTimeNasdaqEventAlphaDefinitions() {
  let generation = 55;
  return mechanisms.flatMap((mechanism) => [4, 6].map((target) => ({
    id: `r${generation}-${mechanism.key}-${target}`, researchGeneration: `R${generation++}`,
    label: `${mechanism.label}, ${target} holdings`, family: "nasdaq-event-alpha", control: false,
    mechanism: `${mechanism.label} with causal next-open entry and bounded event lifecycle`,
    overrides: { ...common, ...lifecycle(target), researchSignalSource: mechanism.source || "price-only", researchRankMode: mechanism.mode, ...mechanism.extra },
  })));
}

export function pointInTimeNasdaqEventAlphaControls() {
  const matched = { ...common, ...lifecycle(6) };
  return [
    { id: "r55-control-momentum", label: "Matched simple momentum", family: "control", control: true, overrides: { ...matched, researchRankMode: "momentum-only" } },
    { id: "r55-control-random", label: "Matched random ranking", family: "control", control: true, overrides: { ...matched, researchRankMode: "random-placebo", researchRandomSeed: 55 } },
  ];
}
