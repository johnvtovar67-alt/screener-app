const fs = require("fs");
const vm = require("vm");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let source = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const rawSource = source;
const contractSource = fs.readFileSync("lib/v12ResearchContract.js", "utf8");
const researchSource = `${rawSource}\n${contractSource}`;
assert(
  /runV11ForwardExtension[\s\S]*startDate:\s*window\.start[\s\S]*endDate:\s*window\.end/.test(
    rawSource,
  ),
  "The V11 forward extension must pass an explicit bounded startDate/endDate to the simulator.",
);
assert(
  rawSource.includes("V11_FORWARD_EXTENSION_REPORT_VERSION = 2") &&
    rawSource.includes('thesisId: "v11r-confirmed-slow-cycle"') &&
    rawSource.includes('selectionPolicy: "single-predeclared-candidate-no-selector"') &&
    rawSource.includes("limitedPilotEligible: Object.values(checks).every(Boolean)"),
  "The V11 forward extension must test exactly one declared lower-turnover rescue candidate behind explicit promotion gates.",
);
assert(
  rawSource.includes("const requiredChunks = manifest.chunks.filter") &&
    rawSource.includes('String(chunk?.lastDate || "") >= window.start') &&
    rawSource.includes('String(chunk?.firstDate || "") <= window.end'),
  "The V11 forward extension must restore only overlapping compiled chunks.",
);
const contract = createResearchModuleLoader(process.cwd()).load(
  "lib/v12ResearchContract.js",
);
source = source
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
  .replace(/export const /g, "const ")
  .replace(/export async function /g, "async function ")
  .replace(/export function /g, "function ");
source +=
  "\nmodule.exports={selectResearchUniverse,normalizeHistoricalBars,buildHistoricalFundamentalRows,resolvePriceHistoryContract,runProvisionalWindows,nextReplaySessionSlice,equivalentAcquisitionSignature,appendCompatibleAcquisitionSignature,appendCompatibleStatementSignature};";
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
  ...contract,
  latestCompletedMarketSessionDay(value) {
    const date = new Date(value);
    while ([0, 6].includes(date.getUTCDay()))
      date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  },
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
    const placeboMatch = String(options.thesisId || "").match(
      /^random-placebo-(\d+)$/,
    );
    const thesisBonus = placeboMatch
      ? 0.25 + (Number(placeboMatch[1]) % 7) * 0.1
      : options.thesisId === "simple-momentum-rank"
        ? 1.5
        : options.thesisId === "simple-quality-rank"
          ? 1
          : options.thesisId === "transparent-bull-cycle-pullback-rank"
            ? 2
            : 3;
    const benchmarkComparisons = {
      SPY: {
        simpleReturnPct: 0.5,
        excessReturnPct: thesisBonus - 0.5,
        exposureMatchedReturnPct: 0.4,
        exposureMatchedAlphaPct: thesisBonus - 0.4,
        cashDragPct: -0.1,
      },
      QQQ: {
        simpleReturnPct: 0.8,
        excessReturnPct: thesisBonus - 0.8,
        exposureMatchedReturnPct: 0.65,
        exposureMatchedAlphaPct: thesisBonus - 0.65,
        cashDragPct: -0.15,
      },
    };
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
        benchmarkComparisons,
        averageExposurePct: 90,
        averageActiveExposurePct: 90,
        averageBenchmarkSleevePct: 0,
        annualizedTurnoverPct: 40,
        dailyReturns: sessions.slice(1).map(() => 0.0001),
      },
      trades: [
        {
          side: "buy",
          shares: 10,
          price: 100,
          positionId: 1,
        },
        {
          side: "sell",
          positionClosed: true,
          roundTripPnl: thesisBonus,
          positionId: 1,
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
  nextReplaySessionSlice,
  equivalentAcquisitionSignature,
  appendCompatibleAcquisitionSignature,
  appendCompatibleStatementSignature,
} = box.module.exports;

const acquisitionSignature = (endDate) =>
  JSON.stringify({
    schema: 3,
    fromDate: "2022-01-01",
    endDate,
    priceContract: "fmp-dividend-adjusted-v1",
    symbols: ["AAA", "QQQ", "SPY"],
  });
assert(
  equivalentAcquisitionSignature(
    acquisitionSignature("2026-08-29"),
    acquisitionSignature("2026-08-28"),
  ) &&
    !equivalentAcquisitionSignature(
      acquisitionSignature("2026-08-28"),
      acquisitionSignature("2026-08-31"),
    ),
  "Weekend date changes must reuse the same completed-session history, while a new market session must require an update.",
);
assert(
  appendCompatibleAcquisitionSignature(
    acquisitionSignature("2026-08-28"),
    acquisitionSignature("2026-09-01"),
  ) &&
    !appendCompatibleAcquisitionSignature(
      acquisitionSignature("2026-09-01"),
      acquisitionSignature("2026-08-28"),
    ),
  "A forward research refresh must append only when the frozen acquisition contract is unchanged and the end session advances.",
);
const statementSignature = (endDate) =>
  JSON.stringify({
    source: "stable-per-symbol-quarterly-v1",
    symbols: ["AAA"],
    acquisitionSignature: acquisitionSignature(endDate),
  });
assert(
  appendCompatibleStatementSignature(
    statementSignature("2026-08-28"),
    statementSignature("2026-09-01"),
  ),
  "Unchanged historical statements must be reusable when only the completed price session advances.",
);

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
  selected.length === 3 &&
    new Set(selected.map((row) => row.sector)).size === 3,
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
  researchSource.includes('"historical-price-eod/dividend-adjusted"') &&
    researchSource.includes('path: "historical-price-eod/full"') &&
    researchSource.includes("resolvePriceHistoryContract") &&
    researchSource.includes("PRICE_ACQUISITION_SCHEMA = 3") &&
    researchSource.includes("RUNNING_TTL_MS = 15 * 60 * 1000") &&
    researchSource.includes(
      "existing?.runnerSchema === REPLAY_CHECKPOINT_SCHEMA",
    ) &&
    researchSource.includes("runnerSchema: REPLAY_CHECKPOINT_SCHEMA") &&
    researchSource.includes("existing?.runClaimedAt") &&
    researchSource.includes("runClaimedAt: new Date(now).toISOString()") &&
    researchSource.includes("exhaustedSymbols") &&
    researchSource.includes("failureSample") &&
    researchSource.includes('["income-statement", "incomeRows"]') &&
    researchSource.includes('["balance-sheet-statement", "balanceRows"]') &&
    researchSource.includes('["cash-flow-statement", "cashFlowRows"]') &&
    !researchSource.includes('statement-bulk"') &&
    researchSource.includes("REPORT_VERSION = 12") &&
    researchSource.includes("DEFAULT_SYMBOL_LIMIT = 250") &&
    researchSource.includes("MAX_SYMBOL_LIMIT = 500") &&
    researchSource.includes("REQUEST_START_SPACING_MS = 300") &&
    researchSource.includes("PRICE_HISTORY_CONCURRENCY = 3") &&
    researchSource.includes("PRICE_SYMBOLS_PER_RUN = 75") &&
    researchSource.includes("STATEMENT_SYMBOLS_PER_RUN = 24") &&
    researchSource.includes('status: "collecting"') &&
    researchSource.includes("FMP_RESEARCH_PRICE_CHECKPOINT_STORE") &&
    researchSource.includes("FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE") &&
    researchSource.includes("FMP_RESEARCH_COMPILED_CHECKPOINT_STORE") &&
    researchSource.includes("FMP_RESEARCH_COMPILED_CHUNK_PREFIX") &&
    researchSource.includes("FMP_RESEARCH_REPLAY_CHECKPOINT_STORE") &&
    researchSource.includes("COMPILED_CHECKPOINT_SCHEMA = 3") &&
    researchSource.includes("COMPILE_SESSIONS_PER_RUN = 20") &&
    researchSource.includes("REPLAY_CHECKPOINT_SCHEMA = 11") &&
    researchSource.includes("REPLAY_WINDOWS_PER_RUN = 3") &&
    researchSource.includes("V12_ACTIVE_THESIS_COUNT = 1") &&
    researchSource.includes("V12_DEVELOPMENT_PLACEBO_SEEDS = 25") &&
    researchSource.includes("V12_STRICT_PLACEBO_SEEDS = 1_000") &&
    researchSource.includes("nextReplaySessionSlice") &&
    researchSource.includes("requiredChunks") &&
    researchSource.includes("skipFullPeriodDiagnostic: true") &&
    researchSource.includes("persistPrivateGzipJson") &&
    researchSource.includes("readPrivateGzipJson") &&
    researchSource.includes("compactResearchRun") &&
    researchSource.includes('stage: "compiled"') &&
    researchSource.includes('"compiling"') &&
    researchSource.includes('stage: "replay"') &&
    researchSource.includes("compiledDatasetCheckpointReused") &&
    researchSource.includes(
      "const { candidateRuns: _candidateRuns, ...publicProgress } = checkpoint",
    ) &&
    researchSource.includes("equivalentAcquisitionSignature") &&
    researchSource.includes("equivalentStatementSignature") &&
    researchSource.includes("latestCompletedMarketSessionDay") &&
    researchSource.includes("cachedPriceContractUsable") &&
    researchSource.includes("priceContractCheckpointReused") &&
    researchSource.includes("eligibleForCapitalClaims: false") &&
    researchSource.includes("completedV7ReportIsExternalComparisonBaseline") &&
    researchSource.includes("completedV8ReportIsExternalComparisonBaseline") &&
    researchSource.includes(
      "completedV9ReportIsRejectedBenchmarkSleeveBaseline",
    ) &&
    researchSource.includes(
      "v12-predeclared-momentum-first-entry-discipline-rank",
    ) &&
    researchSource.includes('researchSignalSource: "full-evidence"') &&
    researchSource.includes("activeThesisUsesIndependentResearchLifecycle") &&
    researchSource.includes("requiredBenchmarks") &&
    researchSource.includes("benchmarkCompletionSymbol: null") &&
    !researchSource.includes('benchmarkCompletionSymbol: "SPY"') &&
    researchSource.includes('selectionMode: "ranked"') &&
    researchSource.includes(
      'researchRankMode: "momentum-first-entry-disciplined-blend"',
    ) &&
    researchSource.includes("requireEntryTimingPass: true") &&
    researchSource.includes("requireTrendAlignment: true") &&
    researchSource.includes("blockChaseEntries: true") &&
    researchSource.includes("maxPriceVs50Pct: 16") &&
    researchSource.includes("maxReturn20Pct: 30") &&
    researchSource.includes("maxReturn60Ex5Pct: 100") &&
    researchSource.includes("maxReturn120Ex20Pct: 125") &&
    researchSource.includes("maxMomentumExtensionSigma: 3") &&
    researchSource.includes("maxEntryGapPct: 3") &&
    researchSource.includes('controlId: "simple-momentum-rank"') &&
    researchSource.includes('controlId: "v11-momentum-dominant-blend"') &&
    researchSource.includes(
      'controlId: "v12-rank-without-multi-horizon-entry-governor"',
    ) &&
    researchSource.includes("single-predeclared-thesis-no-selector") &&
    !researchSource.includes("parameterScore") &&
    researchSource.includes("liquidateAtEnd: true") &&
    researchSource.includes("minimumInitialStopPct: 18") &&
    researchSource.includes("ratchetRiskPlanStop: false") &&
    researchSource.includes('researchRankMode: "random-placebo"') &&
    researchSource.includes(
      'researchRankMode: "bull-cycle-pullback-control"',
    ) &&
    researchSource.includes("strictPointInTimePlaceboSeeds") &&
    researchSource.includes("benchmarkComparisons") &&
    researchSource.includes("discovery.researchUniverse") &&
    researchSource.includes("rollingRegimeAudit") &&
    researchSource.includes("walkForwardSelectionAudit") &&
    researchSource.includes("exposureMatchedAlphaPct") &&
    !researchSource.includes("api/v3"),
  "The research job must stay bounded, paced, checkpointed, resumable, stable-endpoint-only, multi-period, factor-aware and incapable of presenting provisional results as capital proof.",
);

const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
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
      date: new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10),
    })),
  };
  const threeWindowSlice = nextReplaySessionSlice(
    mockDataset.sessions.map((session) => session.date),
    0,
    3,
  );
  assert(
    threeWindowSlice.restoredWindows === 3 &&
      threeWindowSlice.start === 250 &&
      threeWindowSlice.end === 882,
    "A three-window replay invocation must restore the complete train, validation and audit fold plus warmup.",
  );
  const subsetProbe = await runProvisionalWindows(
    { sessions: mockDataset.sessions.slice(250, 630) },
    {
      calendarDates: mockDataset.sessions.map((session) => session.date),
      maxWindows: 1,
      skipFullPeriodDiagnostic: true,
    },
  );
  assert(
    subsetProbe.status === "collecting" &&
      subsetProbe.progress.completedWindows === 1 &&
      subsetProbe.progress.totalWindows === 6,
    "A replay invocation must be able to simulate one bounded date slice while deriving folds from the full durable calendar.",
  );
  let checkpoint = null;
  for (let completed = 3; completed <= 6; completed += 3) {
    const partial = await runProvisionalWindows(mockDataset, {
      initial: checkpoint,
      maxWindows: 3,
    });
    assert(
      partial.status === "collecting" &&
        partial.progress.completedWindows === completed &&
        partial.progress.remainingWindows === 6 - completed &&
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
      completedReplay.replay.candidates.length === 1 &&
      completedReplay.replay.windows.folds.length === 2 &&
      completedReplay.replay.selectedParameters.thesisId ===
        "v12-predeclared-momentum-first-entry-discipline-rank" &&
      completedReplay.replay.walkForwardSelectionAudit.folds.every(
        (fold) => fold.selectedParameters.selectionEligible === true,
      ) &&
      completedReplay.replay.walkForwardSelectionAudit.selectionPolicy ===
        "single-predeclared-thesis-no-selector" &&
      completedReplay.replay.walkForwardSelectionAudit.controls.randomPlacebo
        .seedCount === 25 &&
      completedReplay.replay.walkForwardSelectionAudit.controls.simpleMomentum
        .metrics.totalReturnPct === 3.02 &&
      completedReplay.replay.walkForwardSelectionAudit.controls
        .ungovernedV12Entry.metrics.totalReturnPct === 6.09 &&
      completedReplay.replay.walkForwardSelectionAudit.controls
        .transparentBullCyclePullback.metrics.totalReturnPct === 4.04 &&
      completedReplay.replay.walkForwardSelectionAudit.evidenceAssessment
        .capitalClaimAuthorized === false &&
      completedReplay.replay.walkForwardSelectionAudit.evidenceAssessment
        .selectorUsed === false &&
      completedReplay.replay.walkForwardSelectionAudit.evidenceAssessment
        .benchmarkCompletionSleeveUsed === false &&
      completedReplay.replay.walkForwardSelectionAudit.evidenceAssessment
        .postSelectedFromV11Diagnostics === true &&
      completedReplay.replay.walkForwardSelectionAudit.evidenceAssessment
        .pass === false &&
      simulatedRuns === 68,
    "The replay must reuse the frozen thesis, compute matched controls only on audit folds, avoid a selector and never recompute completed windows.",
  );
  console.log(
    "FMP RESEARCH BACKTEST PASS: bounded acquisition, durable replay, filing clocks, adjusted bars, diversified cohort and provisional labeling verified.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
