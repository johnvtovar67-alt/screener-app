// R45-R54: economically distinct mechanisms frozen together before execution.
const common = Object.freeze({
  researchSignalSource: "price-only", independentLifecycle: true, ignoreSignalPositionActions: true,
  exitOnUniverseRemoval: true, benchmarkSymbols: ["SPY", "QQQ"], benchmarkCompletionSymbol: null,
  liquidateAtEnd: true, requireLiquidityPass: true, minimumAverageDollarVolume: 30_000_000,
  minimumPrice: 5, slippageBps: 12, commissionPerOrder: 0, requireEntryTimingPass: false,
  requireTrendAlignment: false, requireRelativeStrength: false, minimumResearchFactorCoverage: 0,
  blockChaseEntries: false, maxEntryGapPct: 3, selectionMode: "ranked", minimumQualifiedSessions: 1,
  maxIssuerPositions: 1, classifyStopExits: true, ratchetRiskPlanStop: false,
  timeStopMaxReturnPct: 1_000, timeStopSessions: 252, maxVolatility60Pct: 100,
  volatilityTargetPct: null, riskBudgetPct: null, baseRankWeight: 0,
  rankedRebalanceSessions: 15, rankedMinimumHoldSessions: 20,
});

function lifecycle(target) {
  return { rankedTargetCount: target, rankedExitBuffer: target * 2, rankedEntryQueueCount: target * 3,
    buyTargetPct: 0.99 / target, strongBuyTargetPct: 0.99 / target,
    buyMaxPositionPct: 1 / target, strongBuyMaxPositionPct: 1 / target,
    buyMaxFactorPct: 1, strongBuyMaxFactorPct: 1, maxPositions: target,
    maxSectorPositions: target, maxSectorPct: 1, minimumInitialStopPct: 18, maximumInitialStopPct: 18 };
}

const mechanisms = Object.freeze([
  { key: "residual", mode: "benchmark-residual-momentum", label: "Dual-benchmark residual momentum", config: { benchmarkResidualWeights: { relative120: .42, relative60: .18, sectorAwareMomentum: .18, lowVolatility: .08, drawdownResilience: .1, controlledPullback: .04 } } },
  { key: "path", mode: "nasdaq-residual-path-quality", label: "Residual path quality", config: { nasdaqResidualPathWeights: { relative120: .32, relative60: .12, continuity: .2, accelerationRestraint: .08, lotteryRestraint: .08, lowVolatility: .06, drawdownResilience: .08, anchor: .06 } } },
  { key: "industry", mode: "industry-leadership-momentum", label: "Industry leadership momentum", config: { industryLeadershipWeights: { sectorTrend: .2, stockResidual: .32, withinSector: .18, continuity: .2, lowVolatility: .1 } } },
  { key: "gradual", mode: "anchored-gradual-leadership", label: "Anchored gradual leadership", config: { anchoredGradualWeights: { anchor: .12, recency: .08, continuity: .2, intermediate: .15, relativeStrength: .3, drawdownResilience: .08, lowShockVolume: .04, liquidity: .03 } } },
  { key: "multihorizon", mode: "multi-horizon-price-alpha", label: "Multi-horizon price leadership", config: { priceAlphaWeights: { momentum: .08, longMomentum: .14, mediumMomentum: .12, shortMomentum: .04, veryShortMomentum: 0, relativeStrength: .3, stability: .06, lowVolatility: .06, technical: .04, pullback: .03, liquidity: .03 } } },
]);

export function pointInTimeNasdaqDistinctAlphaDefinitions() {
  let generation = 45;
  return mechanisms.flatMap((mechanism) => [4, 6].map((target) => ({
    id: `r${generation}-${mechanism.key}-${target}`, researchGeneration: `R${generation++}`,
    label: `${mechanism.label}, ${target} holdings`, family: "distinct-nasdaq-alpha",
    mechanism: `${mechanism.label} with ${target}-position diversification and scheduled rank replacement`,
    control: false, overrides: { ...common, ...lifecycle(target), researchRankMode: mechanism.mode, ...mechanism.config },
  })));
}

export function pointInTimeNasdaqDistinctAlphaControls() {
  const matched = { ...common, ...lifecycle(6) };
  return [
    { id: "r45-control-momentum", label: "Matched simple momentum", family: "control", control: true, overrides: { ...matched, researchRankMode: "momentum-only" } },
    { id: "r45-control-random", label: "Matched random ranking", family: "control", control: true, overrides: { ...matched, researchRankMode: "random-placebo", researchRandomSeed: 45 } },
  ];
}
