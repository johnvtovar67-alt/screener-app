const fs = require("fs");
const vm = require("vm");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let source = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const rawSource = source;
source = source
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
  .replace(/export const /g, "const ")
  .replace(/export async function /g, "async function ")
  .replace(/export function /g, "function ");
source +=
  "\nmodule.exports={selectResearchUniverse,normalizeHistoricalBars,buildHistoricalFundamentalRows,resolvePriceHistoryContract,runProvisionalWindows};";
let simulatedRuns = 0;
const box = {
  module: { exports: {} },
  exports: {},
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
  JSON,
  URLSearchParams,
  AbortController,
  Response,
  setTimeout,
  clearTimeout,
  portfolioDecision: () => null,
  capitalAllowance: () => null,
  capitalSignalEligible: () => null,
  portfolioContributionGate: () => null,
  portfolioRiskSnapshot: () => null,
  swingTimeReview: () => null,
  reunderwriteExistingPosition: () => null,
  recordWinnerTrim: () => null,
  winnerTrimGate: () => null,
  simulatePointInTimePortfolio(dataset, options) {
    simulatedRuns++;
    const sessions = dataset.sessions.filter(
      (session) =>
        session.date >= options.startDate && session.date <= options.endDate,
    );
    const thesisBonus =
      [
        "live-policy-control",
        "anti-chase-static-control",
        "quality-momentum-selection",
        "quality-momentum-static",
        "quality-momentum-risk-balanced",
      ].indexOf(options.thesisId) + 1;
    return {
      metrics: {
        totalReturnPct: thesisBonus,
        maxDrawdownPct: -2,
        sharpe: 1,
        closedTrades: 1,
        trades: 2,
        profitFactor: 1.5,
        benchmarkReturnPct: 0.5,
        excessReturnPct: thesisBonus - 0.5,
        exposureMatchedBenchmarkReturnPct: 0.4,
        exposureMatchedAlphaPct: thesisBonus - 0.4,
        averageExposurePct: 50,
        annualizedTurnoverPct: 40,
        dailyReturns: sessions.map(() => 0.0001),
      },
      trades: [
        {
          side: "sell",
          positionClosed: true,
          roundTripPnl: thesisBonus,
        },
      ],
      skippedOrders: [],
      curve: sessions.map((session) => ({ date: session.date })),
      openPositions: [],
      endingCash: 100_000 + thesisBonus,
    };
  },
};
vm.createContext(box);
vm.runInContext(source, box, { filename: "lib/fmpResearchBacktest.js" });
const {
  selectResearchUniverse,
  normalizeHistoricalBars,
  buildHistoricalFundamentalRows,
  resolvePriceHistoryContract,
  runProvisionalWindows,
} = box.module.exports;

const selected = selectResearchUniverse(
  [
    { symbol: "T1", sector: "Technology", discoveryScore: 99 },
    { symbol: "T2", sector: "Technology", discoveryScore: 98 },
    { symbol: "E1", sector: "Energy", discoveryScore: 80 },
    { symbol: "H1", sector: "Healthcare", discoveryScore: 75 },
  ],
  3,
);
assert(
  selected.length === 3 && new Set(selected.map((row) => row.sector)).size === 3,
  "The provisional cohort must preserve sector breadth before score depth.",
);
const scoreIndependentA = selectResearchUniverse(
  [
    { symbol: "AAA", sector: "Technology", discoveryScore: 99 },
    { symbol: "BBB", sector: "Technology", discoveryScore: 1 },
  ],
  1,
);
const scoreIndependentB = selectResearchUniverse(
  [
    { symbol: "AAA", sector: "Technology", discoveryScore: 1 },
    { symbol: "BBB", sector: "Technology", discoveryScore: 99 },
  ],
  1,
);
assert(
  scoreIndependentA[0]?.symbol === scoreIndependentB[0]?.symbol,
  "The provisional cohort must not be selected using technical scores observed at the end of the backtest.",
);
const duplicateIndependent = selectResearchUniverse(
  [
    { symbol: "DUP", sector: "Technology" },
    { symbol: "DUP", sector: "Technology" },
    { symbol: "OTHER", sector: "Energy" },
  ],
  3,
);
assert(
  duplicateIndependent.length === 2 &&
    new Set(duplicateIndependent.map((row) => row.symbol)).size === 2,
  "Duplicate discovery rows must never consume two research-cohort slots.",
);

const bars = normalizeHistoricalBars([
  {
    date: "2026-08-28",
    open: 98,
    high: 102,
    low: 96,
    close: 100,
    adjClose: 50,
    volume: 1_000_000,
  },
]);
assert(
  bars[0]?.adjusted === true &&
    bars[0].open === 49 &&
    bars[0].high === 51 &&
    bars[0].close === 50,
  "Historical OHLC must use the same corporate-action adjustment factor as adjusted close.",
);
const dividendAdjustedBars = normalizeHistoricalBars(
  [
    {
      date: "2026-08-28",
      adjOpen: 49,
      adjHigh: 51,
      adjLow: 48,
      adjClose: 50,
      volume: 1_000_000,
    },
  ],
  { sourceAdjusted: true },
);
assert(
  dividendAdjustedBars[0]?.adjusted === true &&
    dividendAdjustedBars[0].open === 49 &&
    dividendAdjustedBars[0].high === 51 &&
    dividendAdjustedBars[0].low === 48 &&
    dividendAdjustedBars[0].close === 50,
  "The FMP dividend-adjusted adjOpen/adjHigh/adjLow/adjClose schema must map to canonical OHLC without discarding valid rows.",
);

const incomeRows = [];
const balanceRows = [];
const cashFlowRows = [];
for (let index = 0; index < 8; index++) {
  const year = 2024 + Math.floor(index / 4);
  const quarter = (index % 4) + 1;
  const date = `${year}-${String(quarter * 3).padStart(2, "0")}-28`;
  const acceptedDate = new Date(
    Date.UTC(year, quarter * 3, 25, 12),
  ).toISOString();
  const growthScale = index < 4 ? 100 : 120;
  incomeRows.push({
    symbol: "AAA",
    calendarYear: String(year),
    period: `Q${quarter}`,
    date,
    acceptedDate,
    revenue: growthScale,
    grossProfit: growthScale * 0.5,
    operatingIncome: growthScale * 0.2,
    netIncome: growthScale * 0.1,
    weightedAverageShsOutDil: 10,
  });
  balanceRows.push({
    symbol: "AAA",
    calendarYear: String(year),
    period: `Q${quarter}`,
    date,
    acceptedDate,
    totalStockholdersEquity: 500,
    totalDebt: 100,
    totalCurrentAssets: 300,
    totalCurrentLiabilities: 100,
    cashAndCashEquivalents: 100,
    netReceivables: 50,
  });
  cashFlowRows.push({
    symbol: "AAA",
    calendarYear: String(year),
    period: `Q${quarter}`,
    date,
    acceptedDate,
    freeCashFlow: 15,
  });
}
const fundamentals = buildHistoricalFundamentalRows({
  incomeRows,
  balanceRows,
  cashFlowRows,
});
const latest = fundamentals.at(-1);
assert(
  latest?.fundamentalDataVerified === true &&
    latest.acceptedDate === incomeRows.at(-1).acceptedDate &&
    Math.abs(latest.revenueGrowth - 20) < 0.001 &&
    Math.abs(latest.freeCashFlowMargin - 12.5) < 0.001 &&
    Math.abs(latest.returnOnEquity - 9.6) < 0.001 &&
    Math.abs(latest.shareChangeYoY) < 0.001 &&
    latest.revisionSafe === false,
  "Historical statements must become usable on acceptedDate, derive point-in-time quality/cash-flow factors, and never claim revision safety.",
);

assert(
  rawSource.includes('"historical-price-eod/dividend-adjusted"') &&
    rawSource.includes('path: "historical-price-eod/full"') &&
    rawSource.includes("resolvePriceHistoryContract") &&
    rawSource.includes("PRICE_ACQUISITION_SCHEMA = 3") &&
    rawSource.includes("RUNNING_TTL_MS = 15 * 60 * 1000") &&
    rawSource.includes("existing?.runnerSchema === REPLAY_CHECKPOINT_SCHEMA") &&
    rawSource.includes("runnerSchema: REPLAY_CHECKPOINT_SCHEMA") &&
    rawSource.includes("existing?.runClaimedAt") &&
    rawSource.includes("runClaimedAt: new Date(now).toISOString()") &&
    rawSource.includes("exhaustedSymbols") &&
    rawSource.includes("failureSample") &&
    rawSource.includes('["income-statement", "incomeRows"]') &&
    rawSource.includes('["balance-sheet-statement", "balanceRows"]') &&
    rawSource.includes('["cash-flow-statement", "cashFlowRows"]') &&
    !rawSource.includes('statement-bulk"') &&
    rawSource.includes("REPORT_VERSION = 7") &&
    rawSource.includes("DEFAULT_SYMBOL_LIMIT = 250") &&
    rawSource.includes("MAX_SYMBOL_LIMIT = 500") &&
    rawSource.includes("REQUEST_START_SPACING_MS = 300") &&
    rawSource.includes("PRICE_HISTORY_CONCURRENCY = 3") &&
    rawSource.includes("PRICE_SYMBOLS_PER_RUN = 75") &&
    rawSource.includes("STATEMENT_SYMBOLS_PER_RUN = 24") &&
    rawSource.includes('status: "collecting"') &&
    rawSource.includes("FMP_RESEARCH_PRICE_CHECKPOINT_STORE") &&
    rawSource.includes("FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE") &&
    rawSource.includes("FMP_RESEARCH_REPLAY_CHECKPOINT_STORE") &&
    rawSource.includes("REPLAY_WINDOWS_PER_RUN = 3") &&
    rawSource.includes("compactResearchRun") &&
    rawSource.includes('stage: "replay"') &&
    rawSource.includes("equivalentAcquisitionSignature") &&
    rawSource.includes("equivalentStatementSignature") &&
    rawSource.includes("eligibleForCapitalClaims: false") &&
    rawSource.includes("quality-momentum-risk-balanced") &&
    rawSource.includes("discovery.researchUniverse") &&
    rawSource.includes("rollingRegimeAudit") &&
    rawSource.includes("walkForwardSelectionAudit") &&
    rawSource.includes("exposureMatchedAlphaPct") &&
    !rawSource.includes("api/v3"),
  "The research job must stay bounded, paced, checkpointed, resumable, stable-endpoint-only, multi-period, factor-aware and incapable of presenting provisional results as capital proof.",
);

const cron = fs.readFileSync(
  "pages/api/cron/fmp-research-backtest.js",
  "utf8",
);
const schedule = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const preflight = fs.readFileSync("tools/fmp-research-preflight.cjs", "utf8");
assert(
  cron.includes("timingSafeEqual") &&
    cron.includes("CRON_SECRET") &&
    cron.includes("maxDuration: 800") &&
    schedule.crons.some(
      (row) => row.path === "/api/cron/fmp-research-backtest",
    ),
  "The expensive FMP replay must be cron-authenticated rather than exposed as an interactive request storm.",
);
assert(
  preflight.includes('path: "historical-price-eod/dividend-adjusted"') &&
    preflight.includes('path: "historical-sp500-constituent"') &&
    preflight.includes("historicalSp500MembershipChanges") &&
    preflight.includes("adjustedOhlcObserved"),
  "The entitlement preflight must verify the adjusted-price and historical-membership inputs needed for stricter research.",
);

const fallbackRows = Array.from({ length: 520 }, (_, index) => ({
  symbol: "SPY",
  date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10),
  open: 100,
  high: 102,
  low: 99,
  close: 100,
  adjClose: 50,
  volume: 1_000_000,
}));
const contractCalls = [];
(async () => {
  const result = await resolvePriceHistoryContract(
    {
      async fetchStable(path) {
        contractCalls.push(path);
        if (path === "historical-price-eod/dividend-adjusted") {
          const error = new Error("FMP endpoint not entitled");
          error.status = 403;
          throw error;
        }
        return fallbackRows;
      },
    },
    "2024-01-01",
    "2026-01-01",
  );
    assert(
      result.contract.id === "fmp-full-adjclose-v1" &&
        result.benchmarkBars.length >= 500 &&
        result.benchmarkBars[0].open === 50 &&
        result.benchmarkBars.every((bar) => bar.adjusted === true) &&
        contractCalls.join(",") ===
          "historical-price-eod/dividend-adjusted,historical-price-eod/full",
      "The price-contract preflight must fail over once, preserve adjusted provenance, and never fan out provider probes.",
    );

  const mockDataset = {
    sessions: Array.from({ length: 1008 }, (_, index) => ({
      date: new Date(Date.UTC(2022, 0, 1 + index))
        .toISOString()
        .slice(0, 10),
    })),
  };
  let checkpoint = null;
  for (let completed = 3; completed <= 30; completed += 3) {
    const partial = await runProvisionalWindows(mockDataset, {
      initial: checkpoint,
      maxWindows: 3,
    });
    assert(
      partial.status === "collecting" &&
        partial.progress.completedWindows === completed &&
        partial.progress.remainingWindows === 30 - completed &&
        partial.progress.completedFolds === Math.floor(completed / 3) &&
        partial.progress.completedCandidates === Math.floor(completed / 6),
      "Each replay invocation must durably advance its bounded chronological simulation windows.",
    );
    checkpoint = partial.checkpoint;
  }
  const completedReplay = await runProvisionalWindows(mockDataset, {
    initial: checkpoint,
    maxWindows: 3,
  });
  assert(
    completedReplay.status === "complete" &&
      completedReplay.replay.candidates.length === 5 &&
      completedReplay.replay.windows.folds.length === 2 &&
      simulatedRuns === 31,
    "The replay must reuse all checkpointed folds, run final selection once, and never recompute completed candidates.",
  );
  console.log(
    "FMP RESEARCH BACKTEST PASS: bounded acquisition, durable replay, filing clocks, adjusted bars, diversified cohort and provisional labeling verified.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
