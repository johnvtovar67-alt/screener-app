const assert = require("node:assert/strict");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const loader = createResearchModuleLoader(process.cwd());
const { simulatePointInTimePortfolio } = loader.load("lib/c1AccountSimulator.js");
const frozenModule = loader.load("lib/c1FrozenOptions.js");
const frozen = frozenModule.C1_FROZEN_OPTIONS.base;
const policy = frozenModule.C1_ACCOUNT_MOMENTUM_EXIT_POLICY;

assert.deepEqual(
  {
    earlyStart: policy.earlyRankExitStartSessions,
    earlyEnd: policy.earlyRankExitEndSessions,
    earlyRank: policy.earlyRankExitThreshold,
    earlyConfirmations: policy.earlyRankExitConsecutiveSessions,
    profitActivation: policy.profitRankExitActivationPct,
    profitRank: policy.profitRankExitThreshold,
    profitConfirmations: policy.profitRankExitConsecutiveSessions,
  },
  {
    earlyStart: 5,
    earlyEnd: 30,
    earlyRank: 9,
    earlyConfirmations: 3,
    profitActivation: 12,
    profitRank: 6,
    profitConfirmations: 2,
  },
  "The live C1 options must carry the owner-authorized momentum exits.",
);

const symbols = Array.from({ length: 12 }, (_, index) =>
  index === 0 ? "AAA" : `S${String(index).padStart(2, "0")}`,
);
const dates = [
  "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
  "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
];

function session(date, index, { weakFrom = Infinity, profitable = false } = {}) {
  const aaaClose = profitable && index >= 3 ? 115 : 100;
  const decisionAt = `${date}T21:00:00.000Z`;
  const prices = [...symbols, "SPY", "QQQ"].map((symbol) => ({
    symbol,
    open: symbol === "AAA" ? aaaClose : 100,
    high: symbol === "AAA" ? aaaClose : 101,
    low: symbol === "AAA" ? aaaClose - 1 : 99,
    close: symbol === "AAA" ? aaaClose : 100,
    adjusted: true,
  }));
  const signals = symbols.map((symbol, signalIndex) => ({
    symbol,
    sector: `Sector ${signalIndex}`,
    price: symbol === "AAA" ? aaaClose : 100,
    action: "Strong Buy",
    marketAvailableAt: decisionAt,
    fundamentalsAvailableAt: decisionAt,
    eventRiskAvailableAt: decisionAt,
    fundamentalDataVerified: true,
    fundamentalRevisionSafe: true,
    eventRiskVerified: true,
    eventHistoryComplete: true,
    entryTimingVerified: true,
    entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 500_000_000 },
    researchFactors: {
      momentumPercentile:
        symbol === "AAA" ? (index >= weakFrom ? 1 : 100) : 99 - signalIndex,
      volatility60Pct: 20,
      return120Ex20: symbol === "AAA" ? (index >= weakFrom ? 0 : 40) : 30 - signalIndex,
      return60Ex5: symbol === "AAA" ? (index >= weakFrom ? 0 : 30) : 20 - signalIndex,
      return20: symbol === "AAA" ? (index >= weakFrom ? 0 : 20) : 10 - signalIndex,
      return5: 0,
      alpha60VsSpy: 5,
      alpha60VsQqq: 5,
      controlledPullbackScore: 50,
    },
    riskPlan: { invalidationPrice: 50 },
    recommendation: {},
  }));
  return { date, decisionAt, prices, signals, positionSignals: signals, universeSymbols: symbols };
}

const base = {
  ...frozen,
  startDate: dates[0],
  endDate: dates.at(-1),
  liquidateAtEnd: false,
};
const seed = {
  contract: "c1-prospective-account-seed-v1",
  sleeve: "base",
  asOfSession: dates[0],
  prospectiveAdoptionConfirmed: true,
  cash: 0,
  highWater: 100_000,
  remainingCooldownSessions: 0,
  resumeAtNextOpen: false,
  positions: [{
    symbol: "AAA",
    role: "Swing",
    shares: 1_000,
    entryPrice: 100,
    openedAt: "2026-08-24",
    inheritedRiskOnly: false,
    sector: "Sector 0",
    issuer: "AAA",
    stock: { symbol: "AAA", sector: "Sector 0" },
  }],
};

const downside = simulatePointInTimePortfolio(
  {
    metadata: { benchmarkSymbol: "SPY", comparisonSymbols: ["SPY", "QQQ"] },
    sessions: dates.map((date, index) => session(date, index, { weakFrom: 5 })),
  },
  base,
  seed,
);
const downsideExit = downside.trades.find(
  (trade) => trade.side === "sell" && trade.reason === "early-rank-deterioration",
);
assert.equal(
  downsideExit?.date,
  "2026-09-14",
  "Three completed weak-rank sessions must exit at the following session open.",
);

const upside = simulatePointInTimePortfolio(
  {
    metadata: { benchmarkSymbol: "SPY", comparisonSymbols: ["SPY", "QQQ"] },
    sessions: dates.map((date, index) =>
      session(date, index, { weakFrom: 6, profitable: true }),
    ),
  },
  base,
  seed,
);
const upsideExit = upside.trades.find(
  (trade) => trade.side === "sell" && trade.reason === "profit-rank-deterioration",
);
assert.equal(
  upsideExit?.date,
  "2026-09-14",
  "A winner above 12% must exit at the open after two completed sessions outside the top six.",
);
assert.equal(
  upside.trades.some((trade) => trade.reason === "early-rank-deterioration"),
  false,
  "The faster armed-profit rule must take priority over the general early exit.",
);

const oneWeakSession = simulatePointInTimePortfolio(
  {
    metadata: { benchmarkSymbol: "SPY", comparisonSymbols: ["SPY", "QQQ"] },
    sessions: dates.map((date, index) =>
      session(date, index, { weakFrom: index === 6 ? 6 : Infinity, profitable: true }),
    ),
  },
  base,
  seed,
);
assert.equal(
  oneWeakSession.trades.some((trade) =>
    ["profit-rank-deterioration", "early-rank-deterioration"].includes(trade.reason),
  ),
  false,
  "A one-session momentum wobble must not sell the position.",
);

console.log("C1 production momentum-exit regression passed.");
