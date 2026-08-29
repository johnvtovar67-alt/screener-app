const fs = require("fs");
const vm = require("vm");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const loader = createResearchModuleLoader(process.cwd());
const {
  createWalkForwardFolds,
  runWalkForwardBacktest,
  simulatePointInTimePortfolio,
  validatePointInTimeDataset,
} = loader.load("lib/walkForwardBacktest.js");
const { attachCrossSectionalResearchFactors, compilePointInTimeSignals } = loader.load(
  "lib/historicalSignalEvaluator.js",
);
assert(
  fs.readFileSync("lib/historicalSignalEvaluator.js", "utf8").includes(
    "maxCandidates: 500",
  ),
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
      { symbol: "AAA", open: price, high: price + 2, low: price - 2, close: price, adjusted: true },
      { symbol: "SPY", open: 500, high: 502, low: 498, close: 500, adjusted: true },
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
          { symbol: "AAA", open: 100, high: 102, low: 98, close: 100, adjusted: true },
          { symbol: "BBB", open: 100, high: 102, low: 98, close: 100, adjusted: true },
          { symbol: "SPY", open: 500, high: 502, low: 498, close: 500, adjusted: true },
        ],
      }),
      session("2026-08-25", null, 101, {
        prices: [
          { symbol: "AAA", open: 101, high: 103, low: 99, close: 101, adjusted: true },
          { symbol: "BBB", open: 101, high: 103, low: 99, close: 101, adjusted: true },
          { symbol: "SPY", open: 500, high: 502, low: 498, close: 500, adjusted: true },
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
run = simulatePointInTimePortfolio(governedStrongDataset, {
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
});
assert(
  governorCalls >= 4 && run.trades.some((trade) => trade.side === "buy"),
  "The research simulator must route entries through the production persistence, sizing, factor-risk and contribution gates.",
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
        { symbol: "AAA", open: 100, high: 101, low: 79, close: 82, adjusted: true },
        { symbol: "SPY", open: 500, high: 502, low: 498, close: 500, adjusted: true },
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
  run.trades.some((trade) => trade.side === "buy" && trade.date === "2026-08-25") &&
    run.trades.some(
      (trade) =>
        trade.side === "sell" &&
        trade.date === "2026-08-25" &&
        trade.reason === "invalidation-stop" &&
        trade.positionClosed === true,
    ) &&
    run.metrics.closedTrades === 1,
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
    run.skippedOrders.some((order) => order.reason === "entry-invalidated-at-open"),
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
    run.trades.some((trade) => trade.side === "sell" && trade.date === "2026-08-26"),
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
for (let cursor = new Date("2020-01-02T12:00:00.000Z"); foldDates.length < 756; cursor = new Date(cursor.getTime() + 86_400_000)) {
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
    discoverySource.includes('liquiditySource: "symbol_history_hard_gate_only"') &&
    discoverySource.includes("researchUniverse: eligibleRows.map") &&
    discoverySource.includes("passesDiscoveryResearchFloor") &&
    discoverySource.includes("maxProviderCalls: 3 + DISCOVERY_EXCHANGES.length"),
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
vm.runInContext(discoverySource, box, { filename: "lib/fullMarketDiscovery.js" });
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
for (let cursor = new Date("2026-04-01T12:00:00.000Z"); historicalDates.length < 55; cursor = new Date(cursor.getTime() + 86_400_000)) {
  if (![0, 6].includes(cursor.getUTCDay()))
    historicalDates.push(cursor.toISOString().slice(0, 10));
}
const compiled = compilePointInTimeSignals({
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
        { symbol: "AAA", open: close - 0.1, high: close + 0.5, low: close - 0.5, close, volume: 2_000_000, adjusted: true },
        { symbol: "OLD", open: 20, high: 21, low: 19, close: 20, volume: 1_000_000, adjusted: true },
        { symbol: "SPY", open: 500, high: 502, low: 498, close: 500 + index * 0.2, volume: 50_000_000, adjusted: true },
        { symbol: "QQQ", open: 450, high: 452, low: 448, close: 450 + index * 0.25, volume: 40_000_000, adjusted: true },
      ],
    };
  }),
});
assert(
  compiled.sessions.length === historicalDates.length &&
    compiled.sessions.at(-1).signals.some((row) => row.symbol === "AAA") &&
    compiled.sessions.at(-1).positionSignals.some(
      (row) =>
        row.symbol === "AAA" &&
        row.entryTiming?.available === true &&
        Number.isFinite(row.researchFactors?.globalCompositePercentile),
    ) &&
    compiled.sessions[0].historicalDelistedMembership === 1,
  "Historical compilation must replay fresh-capital, cross-sectional factor and holding-timing evidence while retaining delisted membership evidence.",
);

console.log(
  "FULL MARKET + WALK-FORWARD PASS: breadth, PIT rejection, session persistence, next-open fills, historical clock and sector coverage verified.",
);
