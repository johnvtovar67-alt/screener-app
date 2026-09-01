const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const loader = createResearchModuleLoader(process.cwd());
const { simulatePointInTimePortfolio } = loader.load(
  "lib/walkForwardBacktest.js",
);

function session(date, price = 100) {
  const decisionAt = `${date}T20:00:00.000Z`;
  const stock = {
    symbol: "AAA",
    action: "Strong Buy",
    score: 90,
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
  };
  return {
    date,
    decisionAt,
    prices: [
      { symbol: "AAA", open: price, high: price + 1, low: price - 1, close: price, adjusted: true },
      { symbol: "SPY", open: 500, high: 501, low: 499, close: 500, adjusted: true },
    ],
    signals: [stock],
    positionSignals: [stock],
  };
}

const dataset = {
  metadata: { benchmarkSymbol: "SPY" },
  sessions: [
    session("2026-08-24"),
    session("2026-08-25"),
    session("2026-08-26"),
    session("2026-08-27"),
    session("2026-08-28"),
  ],
};
const base = {
  minimumTrade: 1,
  initialCapital: 10_000,
  slippageBps: 0,
  positionDecision: ({ now }) => ({
    action: now.toISOString().startsWith("2026-08-25") ? "Hold" : "Review",
    status: "Technical Timing Review",
  }),
  minimumQualifiedSessions: 1,
};

let run = simulatePointInTimePortfolio(dataset, base);
assert(
  !run.trades.some((trade) => trade.side === "sell"),
  "The existing simulator must remain unchanged while bounded Review is disabled.",
);

run = simulatePointInTimePortfolio(dataset, {
  ...base,
  boundedReviewEnabled: true,
  boundedReviewDeadlineSessions: 2,
});
const expiry = run.trades.find(
  (trade) => trade.side === "sell" && trade.reason === "bounded-review-expiry",
);
assert(
  expiry?.date === "2026-08-28",
  "Two consecutive Review decisions must exit at the following session open.",
);

run = simulatePointInTimePortfolio(dataset, {
  ...base,
  boundedReviewEnabled: true,
  boundedReviewDeadlineSessions: 2,
  positionDecision: ({ now }) => ({
    action: now.toISOString().startsWith("2026-08-26") ? "Review" : "Hold",
    status: "Technical Timing Review",
  }),
});
assert(
  !run.trades.some((trade) => trade.side === "sell"),
  "A recovered Hold decision must clear the Review clock without an exit.",
);

console.log("Bounded Review backtest regression passed.");
