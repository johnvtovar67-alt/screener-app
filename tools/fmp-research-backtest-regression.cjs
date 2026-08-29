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
  "\nmodule.exports={selectResearchUniverse,normalizeHistoricalBars,buildHistoricalFundamentalRows};";
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
};
vm.createContext(box);
vm.runInContext(source, box, { filename: "lib/fmpResearchBacktest.js" });
const {
  selectResearchUniverse,
  normalizeHistoricalBars,
  buildHistoricalFundamentalRows,
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
      open: 98,
      high: 102,
      low: 96,
      close: 100,
      adjClose: 50,
      volume: 1_000_000,
    },
  ],
  { sourceAdjusted: true },
);
assert(
  dividendAdjustedBars[0]?.adjusted === true &&
    dividendAdjustedBars[0].open === 98 &&
    dividendAdjustedBars[0].close === 100,
  "An explicitly dividend-adjusted FMP source must retain its OHLC values and adjusted-data provenance.",
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
    !rawSource.includes('client.fetchStable("historical-price-eod/full"') &&
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

console.log(
  "FMP RESEARCH BACKTEST PASS: bounded acquisition, filing clocks, adjusted bars, diversified cohort and provisional labeling verified.",
);
