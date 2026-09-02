const fs = require("fs");
const vm = require("vm");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const walkForwardSource = fs.readFileSync("lib/walkForwardBacktest.js", "utf8");
assert(
  walkForwardSource.includes(
    'researchRankMode === "adaptive-quality-momentum"',
  ) &&
    walkForwardSource.includes("momentumBreadthPct < 50") &&
    walkForwardSource.includes("medianMomentumPercentile < 50"),
  "The adaptive rank must switch causally from current cross-sectional momentum breadth without future returns.",
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
    .includes("maxCandidates: 500"),
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
  maxPositions: 1,
  buyTargetPct: 0.9,
  strongBuyTargetPct: 0.9,
  buyMaxPositionPct: 0.95,
  strongBuyMaxPositionPct: 0.95,
  minimumInitialStopPct: 18,
  maximumInitialStopPct: 18,
  ratchetRiskPlanStop: false,
  benchmarkCompletionSymbol: null,
  liquidateAtEnd: true,
};
run = simulatePointInTimePortfolio(rankedDataset, rankedOptions);
assert(
  run.trades
    .filter((trade) => trade.side === "buy")
    .map((trade) => trade.symbol)
    .join(",") === "AAA,BBB" &&
    run.trades.some(
      (trade) =>
        trade.side === "sell" &&
        trade.symbol === "AAA" &&
        trade.reason === "rank-deterioration",
    ) &&
    run.metrics.averageBenchmarkSleevePct === 0 &&
    run.metrics.averageExposurePct === run.metrics.averageActiveExposurePct,
  "A ranked research book must replace a deteriorating leader at the next open while residual cash remains cash and benchmark-sleeve exposure stays exactly zero.",
);
run = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "adaptive-quality-momentum",
});
assert(
  run.curve.length === rankedDataset.sessions.length &&
    run.trades.some((trade) => trade.side === "buy"),
  "The adaptive quality/momentum branch must execute end-to-end instead of passing only a source-presence check.",
);
run = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "adaptive-factor-leadership-20",
  rankedRebalanceSessions: 10,
});
assert(
  run.curve.length === rankedDataset.sessions.length &&
    run.trades.some((trade) => trade.side === "buy"),
  "The causal 20-session quality/momentum leadership switch must execute end-to-end.",
);

function leadershipContextSession(date, price = 100) {
  const positionSignals = Array.from({ length: 20 }, (_, index) => {
    const ordinal = index + 1;
    const symbol = `Q${String(ordinal).padStart(2, "0")}`;
    return fullEvidenceSignal(date, {
      symbol,
      sector: "Industrials",
      price,
      riskPlan: { invalidationPrice: 60 },
      researchFactors: {
        ...fullEvidenceSignal(date).researchFactors,
        qualityPercentile: 101 - ordinal * 5,
        momentumPercentile: ordinal * 5,
        return5: 0,
        return20: ordinal <= 5 ? 15 : ordinal >= 16 ? -5 : 0,
      },
    });
  });
  return session(date, null, price, {
    sourceUniverseCount: 1_500,
    positionSignals,
    prices: [
      ...positionSignals.map((row) => ({
        symbol: row.symbol,
        open: price,
        high: price + 1,
        low: price - 1,
        close: price,
        adjusted: true,
      })),
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

const leadershipContextDataset = {
  metadata: metadata({ comparisonSymbols: ["SPY", "QQQ"] }),
  sessions: [
    leadershipContextSession("2026-08-24"),
    leadershipContextSession("2026-08-25", 101),
  ],
};
run = simulatePointInTimePortfolio(leadershipContextDataset, {
  ...rankedOptions,
  researchRankMode: "adaptive-factor-leadership-20",
  rankedRebalanceSessions: 1,
  rankedMinimumHoldSessions: 1,
  rankedEntryQueueCount: 20,
  maxPositions: 1,
  minQualityPercentile: null,
  minMomentumPercentile: null,
});
const leadershipContextBuy = run.trades.find(
  (trade) => trade.side === "buy",
);
assert(
  leadershipContextBuy?.symbol === "Q01",
  `A quality-leadership decision must preserve its causal rank context through next-open order execution (bought ${leadershipContextBuy?.symbol || "none"}; skipped ${JSON.stringify(run.skippedOrders || [])}).`,
);
run = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "durable-quality-momentum",
  rankedRebalanceSessions: 20,
  rankedMinimumHoldSessions: 20,
  maxSectorPositions: 2,
  volatilityTargetPct: 20,
});
assert(
  run.curve.length === rankedDataset.sessions.length &&
    run.trades.some((trade) => trade.side === "buy"),
  "The durable quality-momentum rank must execute end-to-end.",
);
run = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "adaptive-factor-leadership",
});
assert(
  run.curve.length === rankedDataset.sessions.length &&
    run.trades.some((trade) => trade.side === "buy"),
  "The causal factor-leadership branch must execute end-to-end.",
);
run = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "price-pattern",
  pricePatternWeights: {
    return120Ex20: 0.5,
    return60Ex5: 0.35,
    return5: -0.15,
  },
});
assert(
  run.curve.length === rankedDataset.sessions.length &&
    run.trades.some((trade) => trade.side === "buy"),
  "The causal price-pattern rank must execute end-to-end.",
);
const chaseBlockedDataset = {
  ...rankedDataset,
  sessions: rankedDataset.sessions.map((researchSession) => ({
    ...researchSession,
    positionSignals: researchSession.positionSignals.map((researchSignal) => ({
      ...researchSignal,
      entryTiming: {
        ...researchSignal.entryTiming,
        chase: true,
      },
    })),
  })),
};
run = simulatePointInTimePortfolio(chaseBlockedDataset, {
  ...rankedOptions,
  blockChaseEntries: true,
  researchRankMode: "momentum-dominant-quality-blend",
});
assert(
  run.trades.every((trade) => trade.side !== "buy"),
  "A momentum-led rank must not initiate a position when the point-in-time 3/5/10-session timing record identifies a chase entry.",
);
const lateRunnerDataset = {
  ...rankedDataset,
  sessions: rankedDataset.sessions.map((researchSession) => ({
    ...researchSession,
    positionSignals: researchSession.positionSignals.map((researchSignal) => ({
      ...researchSignal,
      researchFactors: {
        ...researchSignal.researchFactors,
        return20: 34,
        return60Ex5: 135,
        return120Ex20: 155,
        volatility60Pct: 28,
      },
    })),
  })),
};
const disciplinedEntryOptions = {
  ...rankedOptions,
  researchRankMode: "momentum-first-entry-disciplined-blend",
  requireEntryTimingPass: true,
  requireTrendAlignment: true,
  blockChaseEntries: true,
  maxPriceVs50Pct: 16,
  maxReturn20Pct: 30,
  maxReturn60Ex5Pct: 100,
  maxReturn120Ex20Pct: 125,
  maxMomentumExtensionSigma: 3,
};
run = simulatePointInTimePortfolio(lateRunnerDataset, disciplinedEntryOptions);
assert(
  run.trades.every((trade) => trade.side !== "buy"),
  "A mature momentum runner must not become a fresh entry merely because its immediate 3/5/10-session path has cooled.",
);
const resetRunnerDataset = {
  ...rankedDataset,
  sessions: rankedDataset.sessions.map((researchSession) => ({
    ...researchSession,
    positionSignals: researchSession.positionSignals.map((researchSignal) => ({
      ...researchSignal,
      researchFactors: {
        ...researchSignal.researchFactors,
        return20: 8,
        return60Ex5: 32,
        return120Ex20: 45,
        volatility60Pct: 30,
      },
    })),
  })),
};
run = simulatePointInTimePortfolio(resetRunnerDataset, disciplinedEntryOptions);
assert(
  run.trades.some((trade) => trade.side === "buy"),
  "The multi-horizon governor must still admit intact momentum after extension has reset below every predeclared limit.",
);
const placeboA = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "random-placebo",
  researchRandomSeed: 17,
});
const placeboB = simulatePointInTimePortfolio(rankedDataset, {
  ...rankedOptions,
  researchRankMode: "random-placebo",
  researchRandomSeed: 17,
});
assert(
  JSON.stringify(placeboA.trades) === JSON.stringify(placeboB.trades),
  "Random-control rankings must be deterministic for a declared seed so a favorable placebo cannot be chosen after seeing returns.",
);

const delayedRatchetSessions = [
  ["2026-08-24", 100, 102, 98, 100, 99],
  ["2026-08-25", 100, 102, 95, 100, 99],
  ["2026-08-26", 101, 110, 96, 109, 105],
  ["2026-08-27", 108, 109, 104, 106, 105],
  ["2026-08-28", 104, 106, 103, 104, 105],
].map(([date, open, high, low, close, stop]) =>
  session(date, null, close, {
    positionSignals: [
      fullEvidenceSignal(date, {
        price: close,
        riskPlan: { invalidationPrice: stop },
      }),
    ],
    prices: [
      { symbol: "AAA", open, high, low, close, adjusted: true },
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
);
run = simulatePointInTimePortfolio(
  {
    metadata: metadata({ comparisonSymbols: ["SPY", "QQQ"] }),
    sessions: delayedRatchetSessions,
  },
  {
    ...expandedEvidenceOptions,
    minimumQualifiedSessions: 1,
    minimumInitialStopPct: 8,
    maximumInitialStopPct: 14,
    classifyStopExits: true,
    ratchetRiskPlanStop: true,
    stopRatchetMinHoldSessions: 2,
    stopRatchetMinMfeR: 1,
    stopCooldownSessions: 10,
  },
);
const delayedBuy = run.trades.find((trade) => trade.side === "buy");
const delayedExit = run.trades.find((trade) => trade.side === "sell");
assert(
  Math.abs(delayedBuy.signalSnapshot.stopDistancePct - 8) < 0.001 &&
    delayedExit?.date === "2026-08-28" &&
    delayedExit?.reason === "ratcheted-stop" &&
    run.metrics.tradeDiagnostics.stopOutRatePct === 100,
  "V8 must widen a fragile structural stop, delay ratcheting until both time and one-R progress are earned, and classify the eventual stop accurately.",
);

const breakEvenProtectionDataset = {
  metadata: metadata({ comparisonSymbols: ["SPY", "QQQ"] }),
  sessions: [
    ["2026-09-01", 100, 101, 99, 100, 92],
    ["2026-09-02", 100, 101, 99, 100, 92],
    ["2026-09-03", 101, 113, 99, 110, 95],
    ["2026-09-04", 105, 106, 99, 101, 95],
  ].map(([date, open, high, low, close, stop]) =>
    session(date, null, close, {
      positionSignals: [
        fullEvidenceSignal(date, {
          price: close,
          riskPlan: { invalidationPrice: stop },
        }),
      ],
      prices: [
        { symbol: "AAA", open, high, low, close, adjusted: true },
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
  ),
};
run = simulatePointInTimePortfolio(breakEvenProtectionDataset, {
  ...expandedEvidenceOptions,
  minimumQualifiedSessions: 1,
  minimumInitialStopPct: 8,
  maximumInitialStopPct: 14,
  classifyStopExits: true,
  ratchetRiskPlanStop: true,
  stopRatchetMinHoldSessions: 1,
  stopRatchetMinMfeR: 1,
  breakEvenStopMinMfeR: 1.5,
  breakEvenStopBufferPct: 0,
});
const protectedExit = run.trades.find((trade) => trade.side === "sell");
assert(
  protectedExit?.reason === "ratcheted-stop" &&
    protectedExit?.date === "2026-09-04" &&
    Math.abs(protectedExit.price - 100) < 0.001 &&
    Math.abs(protectedExit.roundTripPnl) < 0.001,
  "After a position earns 1.5 initial risk units, a structural ratchet must not turn it into a loss.",
);

const sameIssuerSignals = [
  signal("2026-08-24", "Strong Buy", {
    symbol: "AAA",
    companyName: "Alphabet Inc.",
    capitalEfficiencyScore: 90,
  }),
  signal("2026-08-24", "Strong Buy", {
    symbol: "BBB",
    companyName: "Alphabet Inc Class A",
    capitalEfficiencyScore: 85,
  }),
];
run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", null, 100, {
        signals: sameIssuerSignals,
        positionSignals: sameIssuerSignals,
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
            symbol: "BBB",
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
        ],
      }),
      session("2026-08-25", null, 101, {
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
            symbol: "BBB",
            open: 101,
            high: 103,
            low: 99,
            close: 101,
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
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    maxIssuerPositions: 1,
  },
);
assert(
  run.trades.filter((trade) => trade.side === "buy").length === 1 &&
    run.skippedOrders.some(
      (order) => order.reason === "issuer-concentration-limit",
    ),
  "Research portfolios must not buy two share classes of the same issuer when the issuer cap is enabled.",
);

const volatilitySized = JSON.parse(JSON.stringify(strongDataset));
volatilitySized.sessions[0].signals[0].riskPlan = { invalidationPrice: 99 };
volatilitySized.sessions[0].signals[0].researchFactors = {
  volatility60Pct: 60,
};
run = simulatePointInTimePortfolio(volatilitySized, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  volatilityTargetPct: 30,
  riskBudgetPct: 0.45,
  minimumInitialStopPct: 6,
  maximumInitialStopPct: 10,
});
assert(
  run.trades[0]?.shares === 4 &&
    Math.abs(run.trades[0].signalSnapshot.stopDistancePct - 6) < 0.001 &&
    Math.abs(
      run.openPositions[0].initialStopPrice - run.trades[0].price * 0.94,
    ) < 0.001 &&
    Number.isFinite(run.metrics.exposureMatchedAlphaPct),
  "Research sizing must scale high-volatility entries, preserve the original stop, and report exposure-matched alpha.",
);

const governedStrongDataset = JSON.parse(JSON.stringify(strongDataset));
governedStrongDataset.sessions[0].signals[0].price = 100;
governedStrongDataset.sessions[0].signals[0].riskPlan = {
  invalidationPrice: 80,
  firstTrimPrice: 150,
};
let governorCalls = 0;
const governedOptions = {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  capitalAllowance: (input) => {
    governorCalls++;
    return capitalAllowance(input);
  },
  capitalSignalEligible: (input) => {
    governorCalls++;
    return capitalSignalEligible(input);
  },
  portfolioContributionGate: (input) => {
    governorCalls++;
    return portfolioContributionGate(input);
  },
  portfolioRiskSnapshot: (input) => {
    governorCalls++;
    return portfolioRiskSnapshot(input);
  },
};
run = simulatePointInTimePortfolio(governedStrongDataset, governedOptions);
assert(
  governorCalls >= 4 && run.trades.some((trade) => trade.side === "buy"),
  "The research simulator must route entries through the production persistence, sizing, factor-risk and contribution gates.",
);
const governedTrades = JSON.stringify(run.trades);
const compactedGovernedDataset = {
  ...governedStrongDataset,
  sessions: governedStrongDataset.sessions.map(compactReplaySession),
};
governorCalls = 0;
run = simulatePointInTimePortfolio(compactedGovernedDataset, governedOptions);
assert(
  JSON.stringify(run.trades) === governedTrades &&
    compactedGovernedDataset.sessions[0].positionSignals.length === 0,
  "Replay compaction must preserve observable trades while removing narrative payloads and holding-signal rows shadowed by fresh signals.",
);

const gapDeteriorationDataset = JSON.parse(
  JSON.stringify(governedStrongDataset),
);
gapDeteriorationDataset.sessions[1].prices[0] = {
  symbol: "AAA",
  open: 140,
  high: 142,
  low: 138,
  close: 141,
  adjusted: true,
};
run = simulatePointInTimePortfolio(gapDeteriorationDataset, governedOptions);
assert(
  !run.trades.some((trade) => trade.side === "buy") &&
    run.skippedOrders.some(
      (order) => order.reason === "portfolio-contribution-gate",
    ),
  "A next-open gap that destroys forward reward/risk must be rejected using the actual fill rather than the stale signal close.",
);

const immaterialSizingDataset = JSON.parse(
  JSON.stringify(governedStrongDataset),
);
immaterialSizingDataset.sessions[0].signals[0].price = 20;
immaterialSizingDataset.sessions[0].signals[0].riskPlan = {
  invalidationPrice: 16,
  firstTrimPrice: 30,
};
for (const researchSession of immaterialSizingDataset.sessions) {
  researchSession.prices[0] = {
    symbol: "AAA",
    open: 20,
    high: 21,
    low: 19,
    close: 20,
    adjusted: true,
  };
}
run = simulatePointInTimePortfolio(immaterialSizingDataset, {
  ...governedOptions,
  riskBudgetPct: 0.1,
});
assert(
  !run.trades.some((trade) => trade.side === "buy") &&
    run.skippedOrders.some(
      (order) => order.reason === "portfolio-contribution-gate",
    ),
  "The contribution gate must evaluate final risk-budgeted size so an immaterial stub position cannot slip through on its larger preliminary allowance.",
);

const pausedDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", "Buy", 100),
    session("2026-08-25", "Paused", 100),
    session("2026-08-26", "Buy", 101),
    session("2026-08-27", "Buy", 102),
  ],
};
run = simulatePointInTimePortfolio(pausedDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
});
assert(
  run.trades[0]?.date === "2026-08-27",
  "A provider pause must preserve, not manufacture or erase, Buy persistence.",
);

const sameDayStopDataset = {
  metadata: metadata(),
  sessions: [
    session("2026-08-24", "Strong Buy", 100),
    {
      ...session("2026-08-25", "Watch", 100),
      prices: [
        {
          symbol: "AAA",
          open: 100,
          high: 101,
          low: 79,
          close: 82,
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
    },
  ],
};
run = simulatePointInTimePortfolio(sameDayStopDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
});
assert(
  run.trades.some(
    (trade) => trade.side === "buy" && trade.date === "2026-08-25",
  ) &&
    run.trades.some(
      (trade) =>
        trade.side === "sell" &&
        trade.date === "2026-08-25" &&
        trade.reason === "invalidation-stop" &&
        trade.positionClosed === true,
    ) &&
    run.metrics.closedTrades === 1 &&
    run.metrics.tradeDiagnostics.expectancyPct < 0 &&
    run.metrics.tradeDiagnostics.stopOutRatePct === 100,
  "A position opened at the next-session open must honor its invalidation stop during that same session.",
);

const invalidatedOpenDataset = JSON.parse(JSON.stringify(sameDayStopDataset));
invalidatedOpenDataset.sessions[1].prices[0] = {
  symbol: "AAA",
  open: 75,
  high: 78,
  low: 72,
  close: 76,
  adjusted: true,
};
run = simulatePointInTimePortfolio(invalidatedOpenDataset, {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
});
assert(
  !run.trades.some((trade) => trade.side === "buy") &&
    run.skippedOrders.some(
      (order) => order.reason === "entry-invalidated-at-open",
    ),
  "A next-session gap below the known invalidation level must cancel the entry instead of buying a broken setup.",
);

run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", "Strong Buy", 100),
      {
        ...session("2026-08-25", null, 98),
        positionSignals: [signal("2026-08-25", "Avoid")],
      },
      session("2026-08-26", null, 95),
    ],
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    positionDecision: () => ({ action: "Exit" }),
  },
);
assert(
  run.trades.some(
    (trade) =>
      trade.side === "sell" &&
      trade.date === "2026-08-26" &&
      trade.reason === "exit",
  ),
  "An owned name outside the fresh-capital shortlist must still receive and execute a portfolio exit decision.",
);

let callbackDate = null;
run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", "Strong Buy", 100),
      session("2026-08-25", "Watch", 100),
      session("2026-08-26", "Watch", 95),
    ],
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    positionDecision: ({ now }) => {
      callbackDate = now.toISOString().slice(0, 10);
      return { action: "Exit" };
    },
  },
);
assert(
  callbackDate === "2026-08-25" &&
    run.trades.some(
      (trade) => trade.side === "sell" && trade.date === "2026-08-26",
    ),
  "Production portfolio decisions must receive the historical clock and execute one session later.",
);

const weakLifecycleSignal = signal("2026-09-15", "Watch", {
  price: 88,
  currentPrice: 88,
  entryTiming: {
    available: true,
    pass: false,
    strongPass: false,
    shortTermTechnicalScore: 35,
  },
  recommendation: {
    expertDecision: {
      thesisScore: 55,
      tradeSetupScore: 42,
      capitalScore: 48,
      metrics: {
        technical: 42,
        momentum: 38,
        leadership: 42,
        risk: 65,
      },
    },
  },
});
run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", "Strong Buy", 100),
      session("2026-08-25", "Watch", 100),
      {
        ...session("2026-09-15", null, 88),
        positionSignals: [weakLifecycleSignal],
      },
      session("2026-09-16", null, 87),
    ],
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    positionDecision: () => ({ action: "Hold", reason: "base hold" }),
    portfolioRiskSnapshot,
    swingTimeReview,
    positionReunderwrite: reunderwriteExistingPosition,
  },
);
assert(
  run.trades.some(
    (trade) =>
      trade.side === "sell" &&
      trade.date === "2026-09-16" &&
      trade.reason === "exit",
  ),
  "The simulator must replay historical time-in-trade re-underwriting instead of leaving a failed Proof position at the base Hold.",
);

run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", "Strong Buy", 100),
      session("2026-08-25", "Watch", 110),
      session("2026-08-26", "Watch", 115),
      session("2026-08-27", "Watch", 112),
    ],
  },
  {
    minimumTrade: 1,
    initialCapital: 10_000,
    slippageBps: 0,
    positionDecision: ({ now }) =>
      now.toISOString().slice(0, 10) === "2026-08-25"
        ? { action: "Trim" }
        : { action: "Exit" },
  },
);
const partialSales = run.trades.filter((trade) => trade.side === "sell");
assert(
  partialSales.length === 2 &&
    partialSales[0].positionClosed === false &&
    partialSales[1].positionClosed === true &&
    run.metrics.closedTrades === 1,
  "A trim followed by a final exit must be one aggregated round trip, not two completed trades that inflate win rate.",
);

run = simulatePointInTimePortfolio(
  {
    metadata: metadata(),
    sessions: [
      session("2026-08-24", "Strong Buy", 100),
      session("2026-08-25", "Watch", 100),
      {
        ...session("2026-08-26", null, 100),
        corporateActions: [
          { symbol: "AAA", type: "delisting", valuePerShare: 12 },
        ],
      },
    ],
  },
  { minimumTrade: 1, initialCapital: 10_000, slippageBps: 0 },
);
assert(
  run.trades.some(
    (trade) =>
      trade.side === "sell" &&
      trade.reason === "delisting-outcome" &&
      trade.price === 12,
  ) && run.openPositions.length === 0,
  "A delisted holding must realize the supplied recovery value instead of retaining its last mark.",
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
  historicalDates.length < 55;
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
          Number.isFinite(row.researchFactors?.globalCompositePercentile),
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

console.log(
  "FULL MARKET + WALK-FORWARD PASS: breadth, PIT rejection, session persistence, next-open fills, historical clock and sector coverage verified.",
);
