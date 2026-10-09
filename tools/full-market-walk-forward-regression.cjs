Warning: truncated output (original token count: 17331)
Total output lines: 2358

const fs = require("fs");
const vm = require("vm");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const walkForwardSource = fs.readFileSync("lib/walkForwardBacktest.js", "utf8");
assert(
  walkForwardSource.includes(
    'researchRankMode === "persistent-factor-leadership-20"',
  ) &&
    walkForwardSource.includes("qualityLeadershipMinimumSessions: 40") &&
    walkForwardSource.includes("persistentQualityLeadershipThrough") &&
    walkForwardSource.includes("persistentQualityLeadershipRebalances"),
  "The research-only persistent factor regime must be causal, explicitly time-bounded, and observable.",
);
assert(
  walkForwardSource.includes(
    'researchRankMode === "adaptive-quality-momentum"',
  ) &&
    walkForwardSource.includes("momentumBreadthPct < 50") &&
    walkForwardSource.includes("medianMomentumPercentile < 50"),
  "The adaptive rank must switch causally from current cross-sectional momentum breadth without future returns.",
);
assert(
  walkForwardSource.includes(
    'researchRankMode === "confirmed-quality-defense"',
  ) &&
    walkForwardSource.includes("useConfirmedQualityDefense") &&
    walkForwardSource.includes("momentumBreadthPct < 50") &&
    walkForwardSource.includes("rankRegimeDiagnostics") &&
    walkForwardSource.includes("confirmedQualityDefenseRebalances") &&
    walkForwardSource.includes("observations: rankContextObservations"),
  "The prospective challenger must require both weak breadth and observed twenty-session quality leadership, and report how often that regime was used.",
);
assert(
  walkForwardSource.includes(
    'researchRankMode === "multi-horizon-price-alpha"',
  ) &&
    walkForwardSource.includes('config.researchSignalSource === "price-only"') &&
    walkForwardSource.includes('"full-evidence", "price-only"'),
  "The point-in-time alpha generator must expose an explicit price-only source and multi-horizon rank without altering the production source.",
);
assert(
  walkForwardSource.includes(
    'researchRankMode === "anchored-gradual-leadership"',
  ) &&
    walkForwardSource.includes("anchoredGradualWeights") &&
    walkForwardSource.includes("highProximityPercentile") &&
    walkForwardSource.includes("continuousInformationPercentile") &&
    walkForwardSource.includes("requireAnchoredGradualFactors"),
  "The V2 research rank must require its causal 52-week anchor, path-continuity, and intermediate-leadership evidence.",
);
assert(
  walkForwardSource.includes(
    'researchRankMode === "attention-shock-breakout-continuation"',
  ) &&
    walkForwardSource.includes('researchRankMode === "attention-shock-only"') &&
    walkForwardSource.includes(
      'researchRankMode === "breakout-followthrough-only"',
    ) &&
    walkForwardSource.includes("requireAttentionShockFactors") &&
    walkForwardSource.includes("minRelativeVolume20") &&
    walkForwardSource.includes("minDistanceFromYearHighPct"),
  "The R6 event study must have explicit causal attention-shock inputs, eligibility gates, and predeclared ablation ranks.",
);

const loader = createResearchModuleLoader(process.cwd());
const {
  createWalkForwardFolds,
  runWalkForwardBacktest,
  simulatePointInTimePortfolio,
  validatePointInTimeDataset,
} = loader.load("lib/walkForwardBacktest.js");
const { compactReplaySession } = loader.load("lib/replayDatasetCompaction.js");
const { attachCrossSectionalResearchFactors, compilePointInTimeSignals } =
  loader.load("lib/historicalSignalEvaluator.js");
assert(
  fs
    .readFileSync("lib/historicalSignalEvaluator.js", "utf8")
    .includes("maxCandidates: 500") &&
    fs
      .readFileSync("lib/historicalSignalEvaluator.js", "utf8")
      .includes("const trailingHistory = history.slice(-253)"),
  "Historical research must use the same 500-name discovery shortlist as production.",
);
const {
  capitalAllowance,
  capitalSignalEligible,
  portfolioContributionGate,
  portfolioRiskSnapshot,
  swingTimeReview,
} = loader.load("lib/portfolioGovernor.js");
const { reunderwriteExistingPosition } = loader.load(
  "lib/positionReunderwrite.js",
);

function metadata(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function signal(date, action, extra = {}) {
  const decisionAt = `${date}T20:00:00.000Z`;
  return {
    symbol: "AAA",
    action,
    score: 85,
    listedAt: "2020-01-02",
    delistedAt: null,
    marketAvailableAt: decisionAt,
    fundamentalsAvailableAt: `${date}T12:00:00.000Z`,
    eventRiskAvailableAt: decisionAt,
    fundamentalDataVerified: true,
    fundamentalRevisionSafe: true,
    eventRiskVerified: true,
    eventHistoryComplete: true,
    entryTimingVerified: true,
    riskPlan: { invalidationPrice: 80 },
    recommendation: {},
    ...extra,
  };
}

function session(date, action, price = 100, extra = {}) {
  const decisionAt = `${date}T20:00:00.000Z`;
  return {
    date,
    decisionAt,
    sourceUniverseCount: 1_500,
    historicalDelistedMembership: 12,
    prices: [
      {
        symbol: "AAA",
        open: price,
        high: price + 2,
        low: price - 2,
        close: price,
        adjusted: true,
      },
      {
        symbol: "SPY",
        open: 500,
        high: 502,
        low: 498,
        close: 500,
        adjusted: true,
      },
    ],
    signals: action ? [signal(date, action)] : [],
    positionSignals: action ? [signal(date, action)] : [],
    ...extra,
  };
}

const buyDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", "Buy", 100),
    session("2026-08-25", "Buy", 101),
    session("2026-08-26", "Buy", 102),
  ],
};
let run = simulatePointInTimePortfolio(buyDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
});
assert(
  run.trades.length === 1 && run.trades[0].date === "2026-08-26",
  "An ordinary Buy must execute at the next session open only after two distinct Buy sessions.",
);

const strongDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", "Strong Buy", 100),
    session("2026-08-25", "Strong Buy", 103),
  ],
};
run = simulatePointInTimePortfolio(strongDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
});
assert(
  run.trades[0]?.date === "2026-08-25" && run.trades[0]?.price === 103,
  "A verified Strong Buy must remain immediate but fill no earlier than the next session open.",
);

const factorDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", "Strong Buy", 100, {
      signals: [
        signal("2026-08-24", "Strong Buy", {
          researchFactors: {
            factorCoverage: 8,
            qualityPercentile: 35,
            momentumPercentile: 70,
            globalCompositePercentile: 45,
            sectorCompositePercentile: 50,
            volatility60Pct: 30,
          },
        }),
      ],
    }),
    session("2026-08-25", "Strong Buy", 101, {
      signals: [
        signal("2026-08-25", "Strong Buy", {
          researchFactors: {
            factorCoverage: 8,
            qualityPercentile: 65,
            momentumPercentile: 75,
            globalCompositePercentile: 80,
            sectorCompositePercentile: 70,
            volatility60Pct: 30,
          },
        }),
      ],
    }),
    session("2026-08-26", "Watch", 102),
  ],
};

const coverageProbe = attachCrossSectionalResearchFactors([
  {
    symbol: "COVER",
    sector: "Technology",
    operatingMargin: 20,
    freeCashFlowMargin: null,
    returnOnEquity: undefined,
    revenueGrowth: 10,
    operatingIncomeGrowth: null,
    return120Ex20: null,
    return60Ex5: 8,
    volatility60Pct: 25,
  },
]);
assert(
  coverageProbe[0]?.researchFactors?.factorCoverage === 4,
  "Missing research factors must not be coerced to zero and falsely counted as verified coverage.",
);
const missingFactorProbe = attachCrossSectionalResearchFactors([
  {
    symbol: "HIGH",
    sector: "Technology",
    operatingMargin: 30,
    revenueGrowth: 20,
  },
  {
    symbol: "LOW",
    sector: "Technology",
    operatingMargin: 10,
    revenueGrowth: 5,
  },
]);
assert(
  missingFactorProbe.find((row) => row.symbol === "HIGH")?.researchFactors
    ?.qualityPercentile === 100 &&
    missingFactorProbe.find((row) => row.symbol === "LOW")?.researchFactors
      ?.qualityPercentile === 0,
  "Missing factor inputs must be excluded and observed factor weights rebalanced instead of being imputed as average evidence.",
);
const accountingAnomalyProbe = attachCrossSectionalResearchFactors([
  {
    symbol: "NEGATIVE_EQUITY",
    sector: "Consumer Cyclical",
    bookValue: -100,
    operatingMargin: 15,
    freeCashFlowMargin: 10,
    returnOnEquity: 100,
    revenueGrowth: 8,
    operatingIncomeGrowth: 8,
    debtToEquity: -5,
  },
  {
    symbol: "COMPARABLE_QUALITY",
    sector: "Consumer Cyclical",
    bookValue: 100,
    operatingMargin: 15,
    freeCashFlowMargin: 10,
    returnOnEquity: 20,
    revenueGrowth: 8,
    operatingIncomeGrowth: 8,
    debtToEquity: 0.5,
  },
  {
    symbol: "WEAKER_QUALITY",
    sector: "Consumer Cyclical",
    bookValue: 100,
    operatingMargin: 15,
    freeCashFlowMargin: 10,
    returnOnEquity: 5,
    revenueGrowth: 8,
    operatingIncomeGrowth: 8,
    debtToEquity: 2,
  },
]);
assert(
  accountingAnomalyProbe.find((row) => row.symbol === "NEGATIVE_EQUITY")
    ?.researchFactors?.qualityPercentile <
    accountingAnomalyProbe.find((row) => row.symbol === "COMPARABLE_QUALITY")
      ?.researchFactors?.qualityPercentile,
  "Negative book equity must not turn mechanically negative leverage or extreme ROE into a false quality advantage.",
);

run = simulatePointInTimePortfolio(factorDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  minimumResearchFactorCoverage: 7,
  minQualityPercentile: 50,
  minMomentumPercentile: 55,
  minCompositePercentile: 60,
  minSectorCompositePercentile: 40,
});
assert(
  run.trades.filter((trade) => trade.side === "buy").length === 1 &&
    run.trades[0].date === "2026-08-26",
  "Cross-sectional research gates must reject a weak-quality observation without preventing a later independently qualified signal.",
);

function fullEvidenceSignal(date, extra = {}) {
  return signal(date, "Watch", {
    price: 100,
    priceAvg50: 95,
    priceAvg200: 90,
    entryTimingVerified: false,
    entryTiming: {
      available: true,
      pass: true,
      strongPass: true,
      liquidityVerified: true,
      liquidityPass: true,
      averageDollarVolume20: 50_000_000,
      relativeStrengthVerified: true,
      shortTermTechnicalScore: 85,
      alpha20VsSpy: 3,
      alpha60VsSpy: 7,
      alpha60VsQqq: 2,
      alpha120VsSpy: 8,
      alpha120VsQqq: 1,
      benchmarkRegime: "bullish",
    },
    researchFactors: {
      factorCoverage: 8,
      qualityPercentile: 80,
      sectorQualityPercentile: 75,
      momentumPercentile: 85,
      valuePercentile: 55,
      stabilityPercentile: 70,
      globalCompositePercentile: 82,
      sectorCompositePercentile: 78,
      controlledPullbackScore: 80,
      volatility60Pct: 30,
      return120Ex20: 12,
    },
    ...extra,
  });
}

const expandedEvidenceDataset = {
  metadata: metadata({ comparisonSymbols: ["SPY", "QQQ"] }),
  sessions: [
    session("2026-08-24", null, 100, {
      positionSignals: [fullEvidenceSignal("2026-08-24")],
      prices: [
        {
          symbol: "AAA",
          open: 100,
          high: 102,
          low: 98,
          close: 100,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 500,
          high: 502,
          low: 498,
          close: 500,
          adjusted: true,
        },
        {
          symbol: "QQQ",
          open: 450,
          high: 452,
          low: 448,
          close: 450,
          adjusted: true,
        },
      ],
    }),
    session("2026-08-25", null, 101, {
      positionSignals: [fullEvidenceSignal("2026-08-25", { price: 101 })],
      prices: [
        {
          symbol: "AAA",
          open: 101,
          high: 103,
          low: 99,
          close: 101,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 501,
          high: 503,
          low: 499,
          close: 502,
          adjusted: true,
        },
        {
          symbol: "QQQ",
          open: 451,
          high: 455,
          low: 450,
          close: 454,
          adjusted: true,
        },
      ],
    }),
    session("2026-08-26", null, 102, {
      positionSignals: [fullEvidenceSignal("2026-08-26", { price: 102 })],
      prices: [
        {
          symbol: "AAA",
          open: 102,
          high: 104,
          low: 100,
          close: 103,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 502,
          high: 505,
          low: 501,
          close: 504,
          adjusted: true,
        },
        {
          symbol: "QQQ",
          open: 454,
          high: 458,
          low: 453,
          close: 457,
          adjusted: true,
        },
      ],
    }),
  ],
};
const expandedEvidenceOptions = {
  researchSignalSource: "full-evidence",
  independentLifecycle: true,
  ignoreSignalPositionActions: true,
  minimumQualifiedSessions: 2,
  requireLiquidityPass: true,
  requireTrendAlignment: true,
  requireRelativeStrength: true,
  minimumResearchFactorCoverage: 7,
  minQualityPercentile: 60,
  minMomentumPercentile: 60,
  minCompositePercentile: 65,
  benchmarkSymbols: ["SPY", "QQQ"],
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
};
run = simulatePointInTimePortfolio(
  expandedEvidenceDataset,
  expandedEvidenceOptions,
);
assert(
  run.trades.some(
    (trade) => trade.side === "buy" && trade.date === "2026-08-26",
  ) &&
    Number.isFinite(
      run.metrics.benchmarkComparisons?.QQQ?.exposureMatchedAlphaPct,
    ),
  "An independently qualified full-evidence candidate must be actionable even when the legacy production label is Watch, and SPY/QQQ attribution must remain explicit.",
);
run = simulatePointInTimePortfolio(expandedEvidenceDataset, {
  ...expandedEvidenceOptions,
  researchSignalSource: "production",
});
assert(
  !run.trades.some((trade) => trade.side === "buy"),
  "The production control must continue to reject a Watch label so the V8 source expansion is measurable rather than silently changing the control.",
);
const priceOnlyDataset = {
  ...expandedEvidenceDataset,
  sessions: expandedEvidenceDataset.sessions.map((researchSession) => ({
    ...researchSession,
    positionSignals: researchSession.positionSignals.map((researchSignal) => ({
      ...researchSignal,
      fundamentalDataVerified: false,
      eventRiskVerified: false,
    })),
  })),
};
run = simulatePointInTimePortfolio(priceOnlyDataset, {
  ...expandedEvidenceOptions,
  researchSignalSource: "price-only",
  minimumResearchFactorCoverage: 0,
  minQualityPercentile: null,
  minMomentumPercentile: null,
  minCompositePercentile: null,
});
assert(
  run.trades.some((trade) => trade.side === "buy"),
  "A price-only research run must be able to trade causal market signals when revision-safe fundamentals and historical news are unavailable.",
);
run = simulatePointInTimePortfolio(priceOnlyDataset, expandedEvidenceOptions);
assert(
  !run.trades.some((trade) => trade.side === "buy"),
  "The full-evidence source must keep failing closed when fundamental or event verification is absent.",
);

function rankedSignal(date, symbol, momentumPercentile) {
  return fullEvidenceSignal(date, {
    symbol,
    riskPlan: { invalidationPrice: 60 },
    researchFactors: {
      ...fullEvidenceSignal(date).researchFactors,
      momentumPercentile,
    },
  });
}
function rankedSession(date, aaaMomentum, bbbMomentum, aaaPrice, bbbPrice) {
  const positionSignals = [
    rankedSignal(date, "AAA", aaaMomentum),
    rankedSignal(date, "BBB", bbbMomentum),
  ];
  return session(date, null, aaaPrice, {
    sourceUniverseCount: 1_500,
    positionSignals,
    prices: [
      {
        symbol: "AAA",
        open: aaaPrice,
        high: aaaPrice + 1,
        low: aaaPrice - 1,
        close: aaaPrice,
        adjusted: true,
      },
      {
        symbol: "BBB",
        open: bbbPrice,
        high: bbbPrice + 1,
        low: bbbPrice - 1,
        close: bbbPrice,
        adjusted: true,
      },
      {
        symbol: "SPY",
        open: 500,
        high: 502,
        low: 498,
        close: 500,
        adjusted: true,
      },
      {
        symbol: "QQQ",
        open: 450,
        high: 452,
        low: 448,
        close: 450,
        adjusted: true,
      },
    ],
  });
}
const rankedDataset = {
  metadata: metadata({ comparisonSymbols: ["SPY", "QQQ"] }),
  sessions: [
    rankedSession("2026-08-24", 95, 40, 100, 100),
    rankedSession("2026-08-25", 35, 98, 101, 101),
    rankedSession("2026-08-26", 30, 99, 102, 102),
    rankedSession("2026-08-27", 25, 99, 103, 103),
    rankedSession("2026-08-28", 25, 99, 104, 104),
  ],
};
const rankedOptions = {
  ...expandedEvidenceOptions,
  requireEntryTimingPass: false,
  minimumQualifiedSessions: 1,
  selectionMode: "ranked",
  researchRankMode: "momentum-only",
  rankedRebalanceSessions: 1,
  rankedTargetCount: 1,
  rankedExitBuffer: 1,
  rankedMinimumHoldSessions: 1,
  rankedEntryQueueCount: 2,
  maxPositions:…8331 tokens truncated…    },
        ],
        corporateActions: [{ symbol: "AAA", type: "universe-removal" }],
      }),
    ],
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 12,
    exitOnUniverseRemoval: true,
    ignoreSignalPositionActions: true,
    liquidateAtEnd: true,
  },
);
assert(
  run.unresolvedUniverseRemovals.length === 1 &&
    run.openPositions.length === 1 &&
    !run.trades.some((trade) => trade.reason === "window-end-liquidation"),
  "An unrecognized unresolved removal must invalidate evidence and must not be hidden by stale-price window-end liquidation.",
);

const benchmarkCompletionDataset = {
  metadata: metadata({ comparisonSymbols: ["SPY"] }),
  sessions: [
    ["2026-08-24", 100, 100],
    ["2026-08-25", 100, 110],
    ["2026-08-26", 110, 121],
  ].map(([date, open, close]) => ({
    ...session(date, null, 100),
    prices: [
      {
        symbol: "AAA",
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        adjusted: true,
      },
      { symbol: "SPY", open, high: close, low: open, close, adjusted: true },
    ],
  })),
};
let completionSleeveRejected = false;
try {
  simulatePointInTimePortfolio(benchmarkCompletionDataset, {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    benchmarkCompletionSymbol: "SPY",
  });
} catch (error) {
  completionSleeveRejected = String(error?.message).includes(
    "uninvested capital must remain cash",
  );
}
assert(
  completionSleeveRejected,
  "The simulator must reject every attempt to place idle strategy cash in a benchmark-completion sleeve.",
);

run = simulatePointInTimePortfolio(strongDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  liquidateAtEnd: true,
});
assert(
  run.trades.some(
    (trade) =>
      trade.side === "sell" && trade.reason === "window-end-liquidation",
  ) &&
    run.metrics.closedTrades === 1 &&
    run.openPositions.length === 0,
  "An isolated research window must close its final marks so trade diagnostics and portfolio return measure the same positions.",
);

const openSizingDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", null, 100, {
      signals: [signal("2026-08-24", "Strong Buy", { symbol: "AAA" })],
      positionSignals: [signal("2026-08-24", "Strong Buy", { symbol: "AAA" })],
    }),
    session("2026-08-25", null, 100, {
      signals: [
        signal("2026-08-25", "Strong Buy", { symbol: "BBB", sector: "Energy" }),
      ],
      positionSignals: [
        signal("2026-08-25", "Strong Buy", { symbol: "BBB", sector: "Energy" }),
      ],
      prices: [
        {
          symbol: "AAA",
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          adjusted: true,
        },
        {
          symbol: "BBB",
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 500,
          high: 502,
          low: 498,
          close: 500,
          adjusted: true,
        },
      ],
    }),
    session("2026-08-26", null, 1_000, {
      prices: [
        {
          symbol: "AAA",
          open: 100,
          high: 1_000,
          low: 99,
          close: 1_000,
          adjusted: true,
        },
        {
          symbol: "BBB",
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 500,
          high: 502,
          low: 498,
          close: 500,
          adjusted: true,
        },
      ],
    }),
  ],
};
run = simulatePointInTimePortfolio(openSizingDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  strongBuyTargetPct: 0.1,
  strongBuyMaxPositionPct: 0.1,
});
assert(
  run.trades.find((trade) => trade.side === "buy" && trade.symbol === "BBB")
    ?.shares === 10,
  "Next-open sizing must value existing positions at the open and cannot use the same session's closing price.",
);

const lookAhead = JSON.parse(JSON.stringify(buyDataset));
lookAhead.sessions[0].signals[0].fundamentalsAvailableAt =
  "2026-08-25T12:00:00.000Z";
assert(
  !validatePointInTimeDataset(lookAhead, { minimumSessions: 2 }).valid,
  "The research contract must reject future-known fundamentals.",
);
const restated = JSON.parse(JSON.stringify(buyDataset));
restated.metadata.fundamentalValuesRevisionSafe = false;
assert(
  !validatePointInTimeDataset(restated, { minimumSessions: 2 }).valid,
  "Retrospectively restated fundamentals must not be labeled point-in-time research.",
);
assert(
  createWalkForwardFolds(
    Array.from({ length: 756 }, (_, index) =>
      new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
    ),
  ).length === 1,
  "A default walk-forward fold must keep 504 train, 126 validation and 126 untouched test sessions.",
);
const foldDates = [];
for (
  let cursor = new Date("2020-01-02T12:00:00.000Z");
  foldDates.length < 756;
  cursor = new Date(cursor.getTime() + 86_400_000)
) {
  if (![0, 6].includes(cursor.getUTCDay()))
    foldDates.push(cursor.toISOString().slice(0, 10));
}
const endToEnd = runWalkForwardBacktest(
  {
    metadata: metadata(),
    sessions: foldDates.map((date, index) => ({
      date,
      decisionAt: `${date}T20:00:00.000Z`,
      sourceUniverseCount: 1_500,
      historicalDelistedMembership: 10,
      corporateActions:
        index === 0
          ? [
              {
                symbol: "OLD",
                type: "delisting",
                valuePerShare: 0,
              },
            ]
          : [],
      prices: [
        {
          symbol: "SPY",
          open: 300 + index * 0.1,
          high: 302 + index * 0.1,
          low: 298 + index * 0.1,
          close: 301 + index * 0.1,
          adjusted: true,
        },
      ],
      signals: [],
      positionSignals: [],
    })),
  },
  { positionDecision: () => ({ action: "Hold" }), parameterGrid: [{}] },
);
assert(
  endToEnd.foldCount === 1 &&
    endToEnd.outOfSample.sessions === 126 &&
    endToEnd.methodology.parameterSelectionUsesTestData === false &&
    endToEnd.claimStatus === "mechanics-only",
  "The complete runner must reserve and report the untouched out-of-sample fold.",
);

let discoverySource = fs
  .readFileSync("lib/fullMarketDiscovery.js", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ")
  .replace(/export async function /g, "async function ");
assert(
  discoverySource.includes("stable/batch-exchange-quote") &&
    !discoverySource.includes("stable/batch-quote?"),
  "Full-market discovery must use bounded exchange-wide quotes instead of symbol-metered quote fanout.",
);
assert(
  discoverySource.includes("response.status === 429") &&
    discoverySource.includes('response.headers.get("retry-after")'),
  "Transient FMP throttling must use bounded Retry-After backoff.",
);
assert(
  !discoverySource.includes("stable/eod-bulk") &&
    discoverySource.includes(
      'liquiditySource: "symbol_history_hard_gate_only"',
    ) &&
    discoverySource.includes("researchUniverse: eligibleRows.map") &&
    discoverySource.includes("passesDiscoveryResearchFloor") &&
    discoverySource.includes(
      "maxProviderCalls: 3 + DISCOVERY_EXCHANGES.length",
    ),
  "Interactive full-market discovery must use six bounded calls, avoid inferring liquidity from rollover-prone breadth data, and never call FMP's infrequently refreshed EOD bulk endpoint.",
);
discoverySource +=
  "\nmodule.exports={isUsListedCommonStock,mergeDiscoveryRow,passesDiscoveryResearchFloor,selectFullMarketCandidates};";
const box = {
  module: { exports: {} },
  exports: {},
  top5Phase: (_name, task) => task(),
  top5Network: (_url, task) => task(),
  top5Count() {},
  process: { env: {} },
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  Set,
  Map,
  Boolean,
  RegExp,
};
vm.createContext(box);
vm.runInContext(discoverySource, box, {
  filename: "lib/fullMarketDiscovery.js",
});
const {
  isUsListedCommonStock,
  mergeDiscoveryRow,
  passesDiscoveryResearchFloor,
  selectFullMarketCandidates,
} = box.module.exports;
assert(
  isUsListedCommonStock({
    symbol: "REAL",
    companyName: "Real Common Stock Inc",
    exchangeShortName: "NYSE",
    isEtf: false,
    isFund: false,
    isActivelyTrading: true,
  }) &&
    !isUsListedCommonStock({
      symbol: "FAKE",
      companyName: "Fake Bond ETF",
      exchangeShortName: "NASDAQ",
      isEtf: true,
    }),
  "Full-market discovery must admit common stocks and reject packaged products.",
);
const safelyMerged = mergeDiscoveryRow(
  { symbol: "SAFE", price: 50, marketCap: 2_000_000_000, volume: 100_000 },
  { symbol: "SAFE", price: 51, marketCap: null, volume: null },
);
assert(
  safelyMerged.price === 51 &&
    safelyMerged.marketCap === 2_000_000_000 &&
    safelyMerged.volume === 100_000,
  "Null secondary quote fields must never erase verified screener market cap or volume.",
);
const liquid = (symbol, sector, priceAvg50, priceAvg200) => ({
  symbol,
  sector,
  price: 100,
  marketCap: 2_000_000_000,
  avgVolume: 500_000,
  averageDollarVolume: 50_000_000,
  volume: 500_000,
  priceAvg50,
  priceAvg200,
  changesPercentage: 0,
});
assert(
  passesDiscoveryResearchFloor(
    {
      price: 100,
      marketCap: 2_000_000_000,
    },
    {
      minPrice: 5,
      minMarketCap: 300_000_000,
      minAvgDollarVolume: 10_000_000,
    },
  ),
  "The breadth pass must admit research candidates on verified price and market cap without pretending rollover-prone volume proves liquidity.",
);
const selected = selectFullMarketCandidates(
  [
    liquid("T1", "Technology", 90, 80),
    liquid("T2", "Technology", 91, 81),
    liquid("T3", "Technology", 92, 82),
    liquid("T4", "Technology", 93, 83),
    liquid("E1", "Energy", 120, 115),
    liquid("H1", "Healthcare", 121, 116),
  ],
  {
    minPrice: 5,
    minMarketCap: 300_000_000,
    minAvgDollarVolume: 10_000_000,
    maxCandidates: 4,
    perSectorFloor: 1,
  },
);
assert(
  new Set(selected.map((row) => row.sector)).size === 3,
  "The daily shortlist must preserve represented sectors before global-score fill.",
);
const historicalDates = [];
for (
  let cursor = new Date("2026-04-01T12:00:00.000Z");
  historicalDates.length < 260;
  cursor = new Date(cursor.getTime() + 86_400_000)
) {
  if (![0, 6].includes(cursor.getUTCDay()))
    historicalDates.push(cursor.toISOString().slice(0, 10));
}
const compilerDataset = {
  metadata: {
    ...metadata(),
    source: "synthetic point-in-time compiler regression",
  },
  securities: [
    {
      symbol: "AAA",
      name: "AAA Common Stock",
      sector: "Technology",
      listedAt: "2020-01-02",
      isEtf: false,
      isFund: false,
    },
    {
      symbol: "OLD",
      name: "Old Common Stock",
      sector: "Industrials",
      listedAt: "2020-01-02",
      delistedAt: historicalDates[30],
      isEtf: false,
      isFund: false,
    },
  ],
  fundamentals: [
    {
      symbol: "AAA",
      availableAt: "2026-03-15T12:00:00.000Z",
      acceptedDate: "2026-03-15T12:00:00.000Z",
      sharesOutstanding: 100_000_000,
      grossMargin: 60,
      operatingMargin: 25,
      debtToEquity: 0.2,
      pe: 20,
      pb: 3,
      currentRatio: 2,
      quickRatio: 1.5,
      freeCashFlowYield: 5,
      revenueGrowth: 15,
      earningsGrowth: 18,
      fundamentalDataStatus: "complete",
      fundamentalDataVerified: true,
      revisionSafe: true,
    },
  ],
  events: [],
  sessions: historicalDates.map((date, index) => {
    const decisionAt = `${date}T20:00:00.000Z`;
    const close = 80 + index * 0.35;
    return {
      date,
      decisionAt,
      marketAvailableAt: decisionAt,
      fundamentalCoverageAsOf: decisionAt,
      eventCoverageAsOf: decisionAt,
      eventHistoryComplete: true,
      prices: [
        {
          symbol: "AAA",
          open: close - 0.1,
          high: close + 0.5,
          low: close - 0.5,
          close,
          volume: 2_000_000,
          adjusted: true,
        },
        {
          symbol: "OLD",
          open: 20,
          high: 21,
          low: 19,
          close: 20,
          volume: 1_000_000,
          adjusted: true,
        },
        {
          symbol: "SPY",
          open: 500,
          high: 502,
          low: 498,
          close: 500 + index * 0.2,
          volume: 50_000_000,
          adjusted: true,
        },
        {
          symbol: "QQQ",
          open: 450,
          high: 452,
          low: 448,
          close: 450 + index * 0.25,
          volume: 40_000_000,
          adjusted: true,
        },
      ],
    };
  }),
};
const compiled = compilePointInTimeSignals(compilerDataset);
const membershipFiltered = compilePointInTimeSignals({
  ...compilerDataset,
  sessions: compilerDataset.sessions.map((session, index) => ({
    ...session,
    universeSymbols: index < 30 ? ["OLD"] : ["AAA"],
  })),
});
assert(
  membershipFiltered.sessions[20].sourceUniverseCount === 1 &&
    membershipFiltered.sessions[20].positionSignals.every(
      (row) => row.symbol === "OLD",
    ) &&
    membershipFiltered.sessions.at(-1).sourceUniverseCount === 1 &&
    membershipFiltered.sessions.at(-1).positionSignals.every(
      (row) => row.symbol === "AAA",
    ),
  "Historical compilation must restrict each session to its explicitly supplied point-in-time membership.",
);
let batchedCompiled = null;
let compilerResume = null;
do {
  batchedCompiled = compilePointInTimeSignals(compilerDataset, {
    maxSessions: 13,
    resume: compilerResume,
  });
  compilerResume = {
    sessions: batchedCompiled.sessions,
    completedSessions: batchedCompiled.compilerProgress.completedSessions,
    decisionMemory: batchedCompiled.compilerCheckpoint?.decisionMemory || [],
  };
} while (!batchedCompiled.compilerProgress.complete);
assert(
  JSON.stringify(batchedCompiled.sessions) ===
    JSON.stringify(compiled.sessions),
  "Bounded compiler checkpoints must reproduce the exact monolithic point-in-time decisions and hysteresis state.",
);
const chunkedSessions = [];
compilerResume = null;
do {
  batchedCompiled = compilePointInTimeSignals(compilerDataset, {
    maxSessions: 13,
    resume: compilerResume,
  });
  chunkedSessions.push(...batchedCompiled.sessions);
  compilerResume = {
    sessions: [],
    completedSessions: batchedCompiled.compilerProgress.completedSessions,
    decisionMemory: batchedCompiled.compilerCheckpoint?.decisionMemory || [],
  };
} while (!batchedCompiled.compilerProgress.complete);
assert(
  JSON.stringify(chunkedSessions) === JSON.stringify(compiled.sessions),
  "Independent compiled chunks must preserve the exact monolithic decisions without carrying prior output payloads.",
);
assert(
  compiled.sessions.length === historicalDates.length &&
    compiled.sessions.at(-1).signals.some((row) => row.symbol === "AAA") &&
    compiled.sessions
      .at(-1)
      .signals.every((row) => row.entryTiming?.available === true) &&
    compiled.sessions
      .at(-1)
      .positionSignals.some(
        (row) =>
          row.symbol === "AAA" &&
          row.entryTiming?.available === true &&
          Number.isFinite(row.researchFactors?.globalCompositePercentile) &&
          Number.isFinite(row.researchFactors?.highProximityPercentile) &&
          Number.isFinite(row.researchFactors?.highRecencyPercentile) &&
          Number.isFinite(row.researchFactors?.continuousInformationPercentile) &&
          Number.isFinite(row.researchFactors?.intermediateLeadershipPercentile) &&
          Number.isFinite(row.researchFactors?.drawdownResiliencePercentile),
      ) &&
    compiled.sessions[0].historicalDelistedMembership === 1,
  "Historical compilation must replay fresh-capital, cross-sectional factor and holding-timing evidence while retaining delisted membership evidence.",
);
const compactedCompilerSession = compactReplaySession(compiled.sessions.at(-1));
assert(
  compactedCompilerSession.signals.every(
    (row) =>
      row.entryTiming?.available === true &&
      typeof row.entryTiming?.liquidityPass === "boolean",
  ),
  "The V8 compiled checkpoint must preserve full timing and liquidity evidence on fresh rows even when duplicate holding rows are compacted away.",
);
assert(
  [
    ...compactedCompilerSession.signals,
    ...compactedCompilerSession.positionSignals,
  ].some(
    (row) =>
      row.symbol === "AAA" &&
      Number.isFinite(row.researchFactors?.highProximityPercentile) &&
      Number.isFinite(row.researchFactors?.continuousInformationPercentile) &&
      Number.isFinite(row.researchFactors?.maxDailyReturn20Pct) &&
      Number.isFinite(row.researchFactors?.momentumAccelerationDailyPct) &&
      Number.isFinite(
        row.researchFactors?.accelerationRestraintPercentile,
      ) &&
      Number.isFinite(row.researchFactors?.lotteryRestraintPercentile),
  ),
  "Replay compaction must preserve the anchored-gradual and Nasdaq path-risk factors required to reproduce research ranks.",
);
const compactedRemovalAction = compactReplaySession({
  date: "2026-08-26",
  prices: [],
  signals: [],
  positionSignals: [],
  corporateActions: [
    {
      symbol: "AAA",
      type: "universe-removal",
      effectiveDate: "2026-08-25",
      treatment: "conservative-zero-recovery-missing-removal-open-v1",
      valuePerShare: 0,
    },
  ],
}).corporateActions[0];
assert(
  compactedRemovalAction.effectiveDate === "2026-08-25" &&
    compactedRemovalAction.treatment ===
      "conservative-zero-recovery-missing-removal-open-v1" &&
    compactedRemovalAction.valuePerShare === 0,
  "Replay compaction must preserve the exact removal outcome contract used by the simulator and integrity audit.",
);

console.log(
  "FULL MARKET + WALK-FORWARD PASS: breadth, PIT rejection, session persistence, next-open fills, historical clock and sector coverage verified.",
);
