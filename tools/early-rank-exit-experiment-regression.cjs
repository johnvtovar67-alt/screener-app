const assert = require("node:assert/strict");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const { simulatePointInTimePortfolio } = createResearchModuleLoader(
  process.cwd(),
).load("lib/walkForwardBacktest.js");

const symbols = ["AAA", "BBB", "CCC", "DDD", "EEE"];
function session(date, weak = false) {
  const decisionAt = `${date}T20:00:00.000Z`;
  const prices = symbols.concat("SPY", "QQQ").map((symbol) => ({
    symbol,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    adjusted: true,
  }));
  const signals = symbols.map((symbol, index) => ({
    symbol,
    action: "Strong Buy",
    score: symbol === "AAA" ? (weak ? 1 : 100) : 90 - index,
    marketAvailableAt: decisionAt,
    fundamentalsAvailableAt: decisionAt,
    eventRiskAvailableAt: decisionAt,
    fundamentalDataVerified: true,
    fundamentalRevisionSafe: true,
    eventRiskVerified: true,
    eventHistoryComplete: true,
    entryTimingVerified: true,
    riskPlan: { invalidationPrice: 50 },
    recommendation: {},
  }));
  return { date, decisionAt, prices, signals, positionSignals: signals };
}

const dates = [
  "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20",
  "2026-08-21", "2026-08-24", "2026-08-25", "2026-08-26",
  "2026-08-27", "2026-08-28",
];
const dataset = {
  metadata: { benchmarkSymbol: "SPY", comparisonSymbols: ["SPY", "QQQ"] },
  sessions: dates.map((date, index) => session(date, index >= 4)),
};
const base = {
  initialCapital: 10_000,
  minimumTrade: 1,
  slippageBps: 0,
  selectionMode: "ranked",
  rankedTargetCount: 1,
  rankedExitBuffer: 1,
  rankedEntryQueueCount: 1,
  rankedMinimumHoldSessions: 30,
  rankedRebalanceSessions: 1,
  maxPositions: 1,
  buyTargetPct: 0.99,
  strongBuyTargetPct: 0.99,
  buyMaxPositionPct: 1,
  strongBuyMaxPositionPct: 1,
  maxSectorPositions: 1,
  maxSectorPct: 1,
  minimumQualifiedSessions: 1,
  minimumInitialStopPct: 50,
  maximumInitialStopPct: 50,
  ratchetRiskPlanStop: false,
  researchRankMode: "weighted",
  baseRankWeight: 1,
  ignoreSignalPositionActions: true,
  liquidateAtEnd: false,
};

const unchanged = simulatePointInTimePortfolio(dataset, base);
assert.equal(
  unchanged.trades.some((trade) => trade.side === "sell"),
  false,
  "The production-equivalent path must remain unchanged while the experiment is disabled.",
);

const candidate = simulatePointInTimePortfolio(dataset, {
  ...base,
  earlyRankExitStartSessions: 3,
  earlyRankExitEndSessions: 30,
  earlyRankExitThreshold: 3,
  earlyRankExitConsecutiveSessions: 2,
});
const earlyExit = candidate.trades.find(
  (trade) =>
    trade.side === "sell" && trade.reason === "early-rank-deterioration",
);
assert.ok(earlyExit, "Two confirmed weak ranks must schedule an early exit.");
assert.equal(
  earlyExit.date,
  "2026-08-25",
  "The confirmed decision must execute at the next session open without look-ahead.",
);

const oneDayWeakness = {
  ...dataset,
  sessions: dates.map((date, index) => session(date, index === 4)),
};
const recovered = simulatePointInTimePortfolio(oneDayWeakness, {
  ...base,
  earlyRankExitStartSessions: 3,
  earlyRankExitEndSessions: 30,
  earlyRankExitThreshold: 3,
  earlyRankExitConsecutiveSessions: 2,
});
assert.equal(
  recovered.trades.some((trade) => trade.reason === "early-rank-deterioration"),
  false,
  "A one-session rank break must reset after recovery and must not exit.",
);

console.log("Early rank-exit experiment regression passed.");
