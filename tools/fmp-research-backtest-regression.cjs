const fs = require("fs");
const vm = require("vm");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let source = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const rawSource = source;
const contractSource = fs.readFileSync("lib/v12ResearchContract.js", "utf8");
const walkForwardSource = fs.readFileSync(
  "lib/walkForwardBacktest.js",
  "utf8",
);
const researchSource = `${rawSource}\n${contractSource}`;
assert(
  /runV11ForwardExtension[\s\S]*startDate:\s*window\.start[\s\S]*endDate:\s*window\.end/.test(
    rawSource,
  ),
  "The V11 forward extension must pass an explicit bounded startDate/endDate to the simulator.",
);
assert(
  rawSource.includes("V11_FORWARD_EXTENSION_REPORT_VERSION = 5") &&
    rawSource.includes('thesisId: "v11r-confirmed-slow-cycle"') &&
    rawSource.includes('selectionPolicy: "single-predeclared-candidate-no-selector"') &&
    rawSource.includes("limitedPilotEligible: Object.values(checks).every(Boolean)"),
  "The V11 forward extension must test exactly one declared lower-turnover rescue candidate behind explicit promotion gates.",
);
for (const diagnostic of [
  'id: "momentum-only"',
  'id: "quality-only"',
  'id: "balanced-quality-momentum"',
  'id: "entry-disciplined-momentum"',
  'id: "transparent-bull-pullback"',
  'id: "adaptive-quality-momentum"',
  'id: "quality-confirmed-entry"',
  'id: "quality-confirmed-slow-cycle"',
])
  assert(
    rawSource.includes(diagnostic),
    `The bounded forward component diagnostics must include ${diagnostic}.`,
  );
assert(
  rawSource.includes("runQualityConfirmedHistoricalAudit") &&
    rawSource.includes('thesisId: "quality-confirmed-slow-cycle"') &&
    rawSource.includes("historicalGatePass: Object.values(checks).every(Boolean)") &&
    rawSource.includes("positiveReturnInMajorityOfFolds") &&
    rawSource.includes("beatsSpyInMajorityOfFolds") &&
    rawSource.includes("beatsQqqInMajorityOfFolds"),
  "The exact quality-confirmed slow-cycle candidate must pass a memory-bounded, multi-fold historical gate before production consideration.",
);
assert(
  rawSource.includes("runFactorLeadershipAudit") &&
    rawSource.includes('thesisId: "adaptive-factor-leadership"') &&
    rawSource.includes("pilotEligible: Object.values(checks).every(Boolean)") &&
    rawSource.includes("historicalBeatsSpyInMajorityOfFolds") &&
    rawSource.includes("forwardBeatsQqq"),
  "The causal factor-leadership candidate must pass both prior folds and the bounded forward window before pilot consideration.",
);
assert(
  rawSource.includes("runPricePatternModelSearch") &&
    rawSource.includes('id: "dual-horizon-momentum"') &&
    rawSource.includes('id: "low-volatility-momentum"') &&
    rawSource.includes('id: "benchmark-relative-momentum"') &&
    rawSource.includes("sealedHistoricalWindowNotUsedForSelection: true") &&
    rawSource.includes("forwardWindowNotUsedForSelection: true") &&
    rawSource.includes("pilotEligible: Object.values(checks).every(Boolean)"),
  "The price-pattern search must freeze its candidate set, select only on development windows, and gate on both later windows.",
);
assert(
  rawSource.includes("runAlphaCreatorSearch") &&
    rawSource.includes("ALPHA_CREATOR_REPORT_VERSION = 5") &&
    rawSource.includes("ALPHA_CREATOR_DEVELOPMENT_WINDOWS") &&
    rawSource.includes('Object.freeze({ start: "2025-01-07", end: "2025-07-10" })') &&
    rawSource.includes('Object.freeze({ start: "2025-07-11", end: "2026-01-08" })') &&
    rawSource.includes('start: "2026-01-09"') &&
    rawSource.includes('end: "2026-07-13"') &&
    rawSource.includes("String(existing?.datasetThrough || \"\") >= datasetThrough") &&
    rawSource.includes("end: datasetThrough") &&
    rawSource.includes("forwardWindowAppendsWithoutCandidateRetuning: true") &&
    rawSource.includes("runAlphaProspectiveChallenger") &&
    rawSource.includes('researchRankMode: "confirmed-quality-defense"') &&
    rawSource.includes("candidateFrozenBeforeProspectiveWindow: true") &&
    rawSource.includes('"rejected-before-prospective-collection"') &&
    rawSource.includes("prospectiveCollectionActive: historicalScreenPassed") &&
    rawSource.includes("developmentFolds") &&
    rawSource.includes("minimumSixtyNewSessions") &&
    rawSource.includes("strictOneThousandSeedPlaceboPassed: false") &&
    rawSource.includes("historicalAndPreFreezeResultsContaminated: true") &&
    rawSource.includes("runAlphaRegimeMap") &&
    rawSource.includes("ALPHA_REGIME_MAP_REPORT_VERSION = 4") &&
    rawSource.includes('experiment: "Non-overlapping alpha regime map"') &&
    rawSource.includes("calendar.slice(252)") &&
    rawSource.includes("windowSessions = 126") &&
    rawSource.includes("candidateSelected: false") &&
    rawSource.includes("descriptiveWinnerId") &&
    rawSource.includes('id: "adaptive-breadth-quality-defense"') &&
    rawSource.includes('id: "momentum-only"') &&
    rawSource.includes('id: "momentum-monthly-buffered-diversified"') &&
    rawSource.includes('id: "momentum-monthly-buffered-concentrated"') &&
    rawSource.includes('id: "balanced-quality-momentum"') &&
    rawSource.includes('id: "dual-horizon-price-momentum"') &&
    rawSource.includes('id: "persistent-twenty-session-leadership"') &&
    rawSource.includes('id: "adaptive-leadership-20-monthly-buffered"') &&
    rawSource.includes("rankedExitBuffer: 18") &&
    rawSource.includes('id: "durable-monthly-ten"') &&
    rawSource.includes('id: "quality-safety-monthly"') &&
    rawSource.includes("tradeLifecycle") &&
    rawSource.includes("exitsByReason") &&
    rawSource.includes("developmentBeatsPlacebo95") &&
    rawSource.includes("laterWindowsExcludedFromSelection: true") &&
    rawSource.includes("allEvidenceGatesPassed: Object.values(checks).every(Boolean)"),
  "The alpha creator must use a frozen bounded family, development-only selection, later evaluation windows, benchmarks, and placebo controls.",
);
assert(
  rawSource.includes("const requiredChunks = manifest.chunks.filter") &&
    rawSource.includes('String(chunk?.lastDate || "") >= window.start') &&
    rawSource.includes('String(chunk?.firstDate || "") <= window.end'),
  "The V11 forward extension must restore only overlapping compiled chunks.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaCreatorV2") &&
    rawSource.includes('"anchored-gradual-leadership-monthly-10"') &&
    rawSource.includes('researchRankMode: "anchored-gradual-leadership"') &&
    rawSource.includes("anchor: 0.28") &&
    rawSource.includes("recency: 0.1") &&
    rawSource.includes("continuity: 0.22") &&
    rawSource.includes("intermediate: 0.15") &&
    rawSource.includes("relativeStrength: 0.14") &&
    rawSource.includes("drawdownResilience: 0.06") &&
    rawSource.includes("lowShockVolume: 0.03") &&
    rawSource.includes("liquidity: 0.02") &&
    rawSource.includes("candidateCount: 1") &&
    rawSource.includes("parameterSelectionUsed: false") &&
    rawSource.includes("requiredGenuinelyNewForwardSessions: 60") &&
    rawSource.includes("strictPromotionRequirementSeeds: 1_000") &&
    rawSource.includes("allEvidenceGatesPassed: false") &&
    rawSource.includes("productionChanged: false") &&
    rawSource.includes("eligibleForLiveCapital: false"),
  "The V2 point-in-time program must test one frozen anchored-gradual thesis without selection, relabelled holdouts, or live authority.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaResearchR3") &&
    rawSource.includes('productionCandidateVersion: "V13"') &&
    rawSource.includes('researchGeneration: "R3"') &&
    rawSource.includes('researchRankMode: "benchmark-residual-momentum"') &&
    rawSource.includes("relative120: 0.35") &&
    rawSource.includes("relative60: 0.25") &&
    rawSource.includes("sectorAwareMomentum: 0.2") &&
    rawSource.includes("volatilityTargetPct: 18") &&
    rawSource.includes("neweyWestMeanTStatistic") &&
    rawSource.includes("validationAndAuditNeweyWestTAboveThreeVsSpy") &&
    rawSource.includes("validationAndAuditNeweyWestTAboveThreeVsQqq") &&
    rawSource.includes("familyWiseAdjustedPValue") &&
    rawSource.includes("POINT_IN_TIME_SP500_ALPHA_RESEARCH_GENERATIONS = 3") &&
    rawSource.includes("POINT_IN_TIME_SP500_ALPHA_R4_RESEARCH_GENERATIONS = 4") &&
    rawSource.includes("strictPromotionPlaceboSeeds: 1_000") &&
    rawSource.includes("correctedPriceIntegrityPassed") &&
    rawSource.includes("productionChanged: false") &&
    rawSource.includes("eligibleForLiveCapital: false"),
  "V13/R3 must test one frozen benchmark-relative, volatility-managed thesis behind corrected-data, multiple-testing and HAC-significance gates.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaResearchR4") &&
    rawSource.includes('productionCandidateVersion: "V14"') &&
    rawSource.includes('researchGeneration: "R4"') &&
    rawSource.includes('researchRankMode: "conditional-short-term-reversal"') &&
    rawSource.includes("reversalPressure: 0.55") &&
    rawSource.includes("minReturn5Pct: -10") &&
    rawSource.includes("maxReturn5Pct: -1") &&
    rawSource.includes("minimumAverageDollarVolume: 50_000_000") &&
    rawSource.includes("strictPromotionPlaceboSeeds: 1_000"),
  "V14/R4 must test one frozen liquidity-conditioned reversal thesis with the same corrected-data and significance gates.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaResearchR6") &&
    rawSource.includes('productionCandidateVersion: "V16"') &&
    rawSource.includes('researchGeneration: "R6"') &&
    rawSource.includes(
      'researchRankMode: "attention-shock-breakout-continuation"',
    ) &&
    rawSource.includes("activityShock: 0.4") &&
    rawSource.includes("breakoutProximity: 0.25") &&
    rawSource.includes("followthrough: 0.2") &&
    rawSource.includes("relativeStrength20: 0.15") &&
    rawSource.includes("minRelativeVolume20: 1.5") &&
    rawSource.includes("minDistanceFromYearHighPct: -5") &&
    rawSource.includes("rankedMinimumHoldSessions: 20") &&
    rawSource.includes("minimumInitialStopPct: 12") &&
    rawSource.includes(
      "POINT_IN_TIME_SP500_ALPHA_R6_RESEARCH_GENERATIONS = 6",
    ) &&
    rawSource.includes("specifiedBeforeR4ResultObserved: true") &&
    rawSource.includes("specifiedBeforeR5ResultObserved: true") &&
    rawSource.includes("exactMatchedEventUniversePlacebos") &&
    rawSource.includes("commissionAssumed: 0") &&
    rawSource.includes("strictPromotionPlaceboSeeds: 1_000") &&
    rawSource.includes("productionChanged: false") &&
    rawSource.includes("eligibleForLiveCapital: false"),
  "V16/R6 must test one frozen high-volume near-high continuation event thesis behind unchanged evidence and promotion gates.",
);
assert(
  walkForwardSource.includes(
    'config.researchRankMode === "conditional-short-term-reversal"',
  ) &&
    walkForwardSource.includes("shortTermReversalFactorsComplete") &&
    walkForwardSource.includes("config.minReturn5Pct") &&
    walkForwardSource.includes("config.maxReturn5Pct"),
  "The R4 simulator must fail closed on reversal, trend and volatility inputs and enforce the frozen price-pressure band.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaResearchR5") &&
    rawSource.includes('productionCandidateVersion: "V15"') &&
    rawSource.includes('researchGeneration: "R5"') &&
    rawSource.includes('researchRankMode: "industry-leadership-momentum"') &&
    rawSource.includes("sectorTrend: 0.45") &&
    rawSource.includes("rankedRebalanceSessions: 20") &&
    rawSource.includes("maxSectorPositions: 5") &&
    rawSource.includes("POINT_IN_TIME_SP500_ALPHA_R5_RESEARCH_GENERATIONS = 5"),
  "V15/R5 must test one frozen industry-momentum thesis with five-family correction and no benchmark sleeve.",
);
assert(
  walkForwardSource.includes(
    'config.researchRankMode === "industry-leadership-momentum"',
  ) &&
    walkForwardSource.includes("sectorLeadershipBySymbol") &&
    walkForwardSource.includes("industryLeadershipFactorsComplete") &&
    walkForwardSource.includes("continuousInformationPercentile"),
  "The R5 simulator must causally compute sector leadership and require complete stock-continuity inputs.",
);
assert(
  walkForwardSource.includes(
    'config.researchRankMode === "benchmark-residual-momentum"',
  ) &&
    walkForwardSource.includes("timing.alpha120VsSpy") &&
    walkForwardSource.includes("timing.alpha120VsQqq") &&
    walkForwardSource.includes("sectorAwareMomentum") &&
    walkForwardSource.includes("sectorMomentumPercentileBySymbol") &&
    walkForwardSource.includes(
      "0.5 * centeredPercentile(sectorMomentumPercentile)",
    ) &&
    walkForwardSource.includes("requireBenchmarkResidualFactors") &&
    walkForwardSource.includes("benchmarkResidualFactorsComplete"),
  "The R3 simulator rank must require complete dual-benchmark, sector-aware and risk-control inputs rather than silently filling missing evidence.",
);
assert(
  rawSource.includes("POINT_IN_TIME_SP500_COMPILE_SESSIONS_PER_RUN = 50") &&
    rawSource.includes(
      "POINT_IN_TIME_SP500_COMPILATION_CLAIM_TTL_MS = 3 * 60 * 1000",
    ),
  "The canonical point-in-time rebuild must stay below the proven memory ceiling and promptly recover abandoned compilation claims.",
);
assert(
  rawSource.includes(
    'POINT_IN_TIME_SP500_COMPILER_CONTRACT =\n  "historical-signal-evaluator-v10-explicit-membership-anchored-gradual-path-v2"',
  ) &&
    rawSource.includes(
      "String(manifest.signature || \"\").includes(\n      POINT_IN_TIME_SP500_COMPILER_CONTRACT",
    ) &&
    !rawSource.includes('includes("anchored-gradual-path-v1")'),
  "The frozen V2 runner must accept the same canonical-identity compiler contract that the dataset writes.",
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
  "\nmodule.exports={selectResearchUniverse,normalizeHistoricalBars,buildHistoricalFundamentalRows,resolvePriceHistoryContract,runProvisionalWindows,nextReplaySessionSlice,equivalentAcquisitionSignature,appendCompatibleAcquisitionSignature,appendCompatibleStatementSignature,pointInTimeSecuritySymbol,pointInTimeSp500RawDatasetFromHistory,pointInTimePriceIntegrityAudit,summarizePointInTimeTradeConcentration};";
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
  pointInTimeSecuritySymbol,
  pointInTimeSp500RawDatasetFromHistory,
  pointInTimePriceIntegrityAudit,
  summarizePointInTimeTradeConcentration,
} = box.module.exports;

assert(
  pointInTimeSecuritySymbol("SATS") === "ECHO" &&
    pointInTimeSecuritySymbol("ECHO") === "ECHO",
  "Ticker aliases must resolve to one permanent point-in-time security identifier.",
);
const tickerAliasDataset = pointInTimeSp500RawDatasetFromHistory({
  blueprint: {
    fromDate: "2026-06-22",
    throughDate: "2026-06-25",
    privateBlueprint: {
      initialSymbols: ["SATS", "ECHO"],
      changes: [],
      delistedDates: {},
    },
  },
  profiles: [
    { symbol: "SATS", companyName: "EchoStar" },
    { symbol: "ECHO", companyName: "EchoStar" },
  ],
  histories: new Map([
    [
      "SPY",
      [
        {
          date: "2026-06-22",
          open: 600,
          high: 601,
          low: 599,
          close: 600,
          adjusted: true,
        },
      ],
    ],
    [
      "SATS",
      [
        {
          date: "2026-06-22",
          open: 50,
          high: 51,
          low: 49,
          close: 50,
          adjusted: true,
        },
      ],
    ],
    [
      "ECHO",
      [
        {
          date: "2026-06-22",
          open: 50,
          high: 51,
          low: 49,
          close: 50,
          adjusted: true,
        },
      ],
    ],
  ]),
  fundamentals: [],
});
assert(
  tickerAliasDataset.sessions[0].universeSymbols.join(",") === "ECHO" &&
    tickerAliasDataset.sessions[0].prices.filter(
      (row) => ["SATS", "ECHO"].includes(row.symbol),
    ).length === 1 &&
    tickerAliasDataset.sessions[0].prices.some(
      (row) => row.symbol === "ECHO",
    ),
  "A ticker rename must not create duplicate active membership or duplicate issuer prices.",
);

const cleanPriceIntegrity = pointInTimePriceIntegrityAudit([
  {
    sessions: [
      {
        date: "2026-01-02",
        prices: [
          { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
        ],
      },
      {
        date: "2026-01-05",
        prices: [
          { symbol: "AAA", open: 104, high: 111, low: 103, close: 110, adjusted: true },
        ],
      },
    ],
  },
]);
assert(
  cleanPriceIntegrity.pass === true &&
    cleanPriceIntegrity.adjustedCoveragePct === 100 &&
    cleanPriceIntegrity.possibleUnadjustedCorporateActions.length === 0,
  "The point-in-time integrity audit must accept coherent fully adjusted OHLC rows.",
);
const splitLikePriceIntegrity = pointInTimePriceIntegrityAudit([
  {
    sessions: [
      {
        date: "2026-01-02",
        prices: [
          { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
        ],
      },
      {
        date: "2026-01-05",
        prices: [
          { symbol: "AAA", open: 50, high: 52, low: 49, close: 51, adjusted: true },
        ],
      },
    ],
  },
]);
assert(
  splitLikePriceIntegrity.pass === false &&
    splitLikePriceIntegrity.possibleUnadjustedCorporateActions[0]?.nearestSplitRatio ===
      0.5,
  "A common split-ratio discontinuity must fail the adjusted-price integrity audit even when a provider flag says adjusted.",
);
const eventGapPriceIntegrity = pointInTimePriceIntegrityAudit([
  {
    sessions: [
      {
        date: "2026-01-02",
        prices: [
          { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
        ],
      },
      {
        date: "2026-01-05",
        prices: [
          { symbol: "AAA", open: 33, high: 42, low: 30, close: 39, adjusted: true },
        ],
      },
    ],
  },
]);
assert(
  eventGapPriceIntegrity.pass === true &&
    eventGapPriceIntegrity.extremeOneSessionMoves.length === 1 &&
    eventGapPriceIntegrity.possibleUnadjustedCorporateActions.length === 0,
  "A genuine event-like gap must be disclosed without being misclassified as an unadjusted split from its opening ratio alone.",
);
const decisionRelevantPriceIntegrity = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-02",
          prices: [
            { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, volume: 1_000, adjusted: true },
            { symbol: "OLD", open: 99, high: 101, low: 98, close: 100, volume: 10, adjusted: true },
            { symbol: "SPY", open: 499, high: 501, low: 498, close: 500, volume: 1_000_000, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }],
          positionSignals: [],
        },
        {
          date: "2026-01-05",
          prices: [
            { symbol: "AAA", open: 104, high: 111, low: 103, close: 110, volume: 1_100, adjusted: true },
            { symbol: "OLD", open: 50, high: 52, low: 49, close: 51, volume: 10, adjusted: true },
            { symbol: "SPY", open: 504, high: 511, low: 503, close: 510, volume: 1_100_000, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }],
          positionSignals: [],
        },
      ],
    },
  ],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  decisionRelevantPriceIntegrity.pass === true &&
    decisionRelevantPriceIntegrity.totalStoredPriceRows === 6 &&
    decisionRelevantPriceIntegrity.priceRows === 4 &&
    decisionRelevantPriceIntegrity.excludedArchivalPriceRows === 2,
  "The decision-data audit must exclude unused archival rows while retaining active prices, required lookbacks and benchmarks.",
);
const duplicateActiveSeriesIntegrity = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-02",
          prices: [
            { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, volume: 1_000, adjusted: true },
            { symbol: "BBB", open: 99, high: 101, low: 98, close: 100, volume: 1_000, adjusted: true },
            { symbol: "SPY", open: 499, high: 501, low: 498, close: 500, volume: 1_000_000, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }, { symbol: "BBB" }],
          positionSignals: [],
        },
      ],
    },
  ],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  duplicateActiveSeriesIntegrity.pass === false &&
    duplicateActiveSeriesIntegrity.possibleDuplicateActiveSeries[0]?.symbols.join(",") ===
      "AAA,BBB",
  "Simultaneously active symbols with an identical full OHLCV row must fail closed as a possible ticker-identity collision.",
);
const concentratedTrades = summarizePointInTimeTradeConcentration([
  {
    trades: [
      { date: "2026-01-02", symbol: "AAA", side: "buy", shares: 10, price: 100, positionId: 1 },
      { date: "2026-02-02", symbol: "AAA", side: "sell", price: 110, positionId: 1, positionClosed: true, roundTripPnl: 100, holdingSessions: 20 },
      { date: "2026-01-03", symbol: "BBB", side: "buy", shares: 10, price: 100, positionId: 2 },
      { date: "2026-02-03", symbol: "BBB", side: "sell", price: 105, positionId: 2, positionClosed: true, roundTripPnl: 50, holdingSessions: 20 },
      { date: "2026-01-04", symbol: "CCC", side: "buy", shares: 10, price: 100, positionId: 3 },
      { date: "2026-02-04", symbol: "CCC", side: "sell", price: 97.5, positionId: 3, positionClosed: true, roundTripPnl: -25, holdingSessions: 20 },
    ],
  },
]);
assert(
  concentratedTrades.closedRoundTrips === 3 &&
    concentratedTrades.topWinnerShareOfGrossProfitPct === 66.667 &&
    concentratedTrades.concentrationWarning === true,
  "The post-result audit must disclose when one round trip dominates simulated gross profit.",
);

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
    researchSource.includes('"[pit-sp500-compile] active claim reused"') &&
    researchSource.includes('"[pit-sp500-compile] chunk started"') &&
    researchSource.includes('"[pit-sp500-compile] chunk completed"') &&
    researchSource.includes(
      "POINT_IN_TIME_SP500_COMPILATION_CLAIM_TTL_MS",
    ) &&
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
const alphaCreatorEndpoint = fs.readFileSync(
  "pages/api/research/alpha-creator.js",
  "utf8",
);
const pitAlphaV2Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-creator-v2.js",
  "utf8",
);
const pitAlphaR3Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-research-r3.js",
  "utf8",
);
const pitAlphaR4Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-research-r4.js",
  "utf8",
);
const pitAlphaR5Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-research-r5.js",
  "utf8",
);
const pitAlphaR6Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-research-r6.js",
  "utf8",
);
const pitAlphaR7Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-research-r7.js",
  "utf8",
);
const pitAlphaR8Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-batch-r8.js",
  "utf8",
);
const pitAlphaR9Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-sizing-r9.js",
  "utf8",
);
const pitAlphaV2IntegrityEndpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-creator-v2-integrity.js",
  "utf8",
);
const dataCapabilityEndpoint = fs.readFileSync(
  "pages/api/research/data-capabilities.js",
  "utf8",
);
const pitUniverseEndpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-universe.js",
  "utf8",
);
const schedule = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const preflight = fs.readFileSync("tools/fmp-research-preflight.cjs", "utf8");
assert(
  cron.includes("timingSafeEqual") &&
    cron.includes("CRON_SECRET") &&
    cron.includes("maxDuration: 800") &&
    cron.includes("latestCompletedMarketSessionDay(new Date())") &&
    cron.includes("minimumDatasetThrough") &&
    cron.includes("runAlphaCreatorSearch()") &&
    cron.includes("runAlphaProspectiveChallenger()") &&
    schedule.crons.some(
      (row) => row.path === "/api/cron/fmp-research-backtest",
    ),
  "The expensive FMP replay must be cron-authenticated rather than exposed as an interactive request storm.",
);
assert(
  rawSource.includes("runPointInTimeSp500Universe") &&
    rawSource.includes('client.fetchStable("sp500-constituent"') &&
    rawSource.includes("pointInTimeMembershipConstructed: true") &&
    rawSource.includes("privateBlueprint") &&
    rawSource.includes("initialMembers.delete(change.addedSymbol)") &&
    rawSource.includes("initialMembers.add(change.removedSymbol)") &&
    pitUniverseEndpoint.includes("await runPointInTimeSp500Universe()"),
  "The private S&P 500 blueprint must causally reconstruct historical membership and expose only a bounded summary.",
);
assert(
  alphaCreatorEndpoint.includes("await getPointInTimeSp500AlphaProgram()") &&
    alphaCreatorEndpoint.includes("await runPointInTimeSp500AlphaSizingR9({ force })") &&
    alphaCreatorEndpoint.includes('req.query.legacy || ""') &&
    alphaCreatorEndpoint.includes("await runAlphaCreatorSearch({ force })") &&
    alphaCreatorEndpoint.includes('authority: "point-in-time-sp500-research"') &&
    alphaCreatorEndpoint.includes('authority: "legacy-current-survivor-diagnostic"') &&
    alphaCreatorEndpoint.includes("maxDuration: 800"),
  "The public alpha-creator endpoint must default to point-in-time research and quarantine the current-survivor search behind an explicitly labelled legacy diagnostic.",
);
assert(
  pitAlphaR4Endpoint.includes("await getPointInTimeSp500AlphaResearchR4()") &&
    pitAlphaR4Endpoint.includes("await runPointInTimeSp500AlphaResearchR4({") &&
    pitAlphaR4Endpoint.includes('productionCandidateVersion: "V14"') &&
    pitAlphaR4Endpoint.includes("productionChanged: false") &&
    pitAlphaR4Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR4Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaResearchR4()"),
  "The R4 endpoint and cron must keep V14 research-only and run only after rejected R3.",
);
assert(
  pitAlphaR5Endpoint.includes("await getPointInTimeSp500AlphaResearchR5()") &&
    pitAlphaR5Endpoint.includes("await runPointInTimeSp500AlphaResearchR5({") &&
    pitAlphaR5Endpoint.includes('productionCandidateVersion: "V15"') &&
    pitAlphaR5Endpoint.includes("productionChanged: false") &&
    pitAlphaR5Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR5Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaResearchR5()") &&
    cron.includes(
      'pointInTimeSp500AlphaResearchR4?.candidateDisposition ===',
    ),
  "The R5 endpoint and cron must keep V15 research-only and sequence it only after the frozen R4 rejection.",
);
assert(
  pitAlphaR6Endpoint.includes("await getPointInTimeSp500AlphaResearchR6()") &&
    pitAlphaR6Endpoint.includes("await runPointInTimeSp500AlphaResearchR6({") &&
    pitAlphaR6Endpoint.includes('productionCandidateVersion: "V16"') &&
    pitAlphaR6Endpoint.includes("productionChanged: false") &&
    pitAlphaR6Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR6Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaResearchR6()") &&
    cron.includes(
      'pointInTimeSp500AlphaResearchR5?.candidateDisposition ===',
    ),
  "The R6 endpoint and cron must keep V16 research-only and sequence it only after the frozen R5 rejection.",
);
assert(
  pitAlphaR7Endpoint.includes("await getPointInTimeSp500AlphaResearchR7()") &&
    pitAlphaR7Endpoint.includes("await runPointInTimeSp500AlphaResearchR7({") &&
    pitAlphaR7Endpoint.includes('productionCandidateVersion: "V17"') &&
    pitAlphaR7Endpoint.includes("productionChanged: false") &&
    pitAlphaR7Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR7Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaResearchR7()") &&
    cron.includes(
      'pointInTimeSp500AlphaResearchR6?.candidateDisposition ===',
    ),
  "The R7 endpoint and cron must keep V17 research-only and sequence it only after the frozen R6 rejection.",
);
assert(
  pitAlphaR8Endpoint.includes("await getPointInTimeSp500AlphaBatchR8()") &&
    pitAlphaR8Endpoint.includes("await runPointInTimeSp500AlphaBatchR8({") &&
    pitAlphaR8Endpoint.includes('productionCandidateVersion: "V18"') &&
    pitAlphaR8Endpoint.includes("productionChanged: false") &&
    pitAlphaR8Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR8Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaBatchR8()") &&
    cron.includes(
      'pointInTimeSp500AlphaResearchR7?.candidateDisposition ===',
    ),
  "The R8 endpoint must batch 21 candidates and sequence only after the frozen R7 rejection.",
);
assert(
  rawSource.includes("pointInTimeSp500AlphaR8BatchDefinitions") &&
    rawSource.includes("developmentRank.slice(0, 4)") &&
    rawSource.includes("fullPlaceboRunsAvoided") &&
    rawSource.includes("auditExcludedFromSelection: true") &&
    rawSource.includes("strictMatchedPlacebosRequired"),
  "R8 must share window restores, narrow 21 candidates to four validation finalists and one audit candidate, and defer strict placebos until deterministic gates pass.",
);
assert(
  pitAlphaR9Endpoint.includes("await getPointInTimeSp500AlphaSizingR9()") &&
    pitAlphaR9Endpoint.includes("await runPointInTimeSp500AlphaSizingR9({") &&
    pitAlphaR9Endpoint.includes('productionCandidateVersion: "V19"') &&
    cron.includes("await runPointInTimeSp500AlphaSizingR9()") &&
    rawSource.includes("pointInTimeSp500AlphaR9SizingDefinitions") &&
    walkForwardSource.includes("config.rankedTargetWeights") &&
    walkForwardSource.includes("order.targetPct"),
  "R9 must test explicit rank-weighted conviction sizing and replacement stops in one nested batch after R8.",
);
assert(
  pitAlphaV2Endpoint.includes("await getPointInTimeSp500AlphaCreatorV2()") &&
    pitAlphaV2Endpoint.includes("await runPointInTimeSp500AlphaCreatorV2({") &&
    pitAlphaV2Endpoint.includes("productionChanged: false") &&
    pitAlphaV2Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaV2Endpoint.includes("maxDuration: 800"),
  "The dedicated V2 endpoint must remain research-only and expose bounded status and execution paths.",
);
assert(
  pitAlphaR3Endpoint.includes("await getPointInTimeSp500AlphaResearchR3()") &&
    pitAlphaR3Endpoint.includes("await runPointInTimeSp500AlphaResearchR3({") &&
    pitAlphaR3Endpoint.includes('productionCandidateVersion: "V13"') &&
    pitAlphaR3Endpoint.includes("productionChanged: false") &&
    pitAlphaR3Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR3Endpoint.includes("maxDuration: 800") &&
    cron.includes("await runPointInTimeSp500AlphaResearchR3()"),
  "The R3 endpoint and cron must keep V13 research-only and blocked behind the corrected integrity audit.",
);
assert(
  rawSource.includes("runPointInTimeSp500AlphaCreatorV2Integrity") &&
    rawSource.includes("postResultDiagnosticOnly: true") &&
    rawSource.includes("selectionChanged: false") &&
    rawSource.includes("v2RejectionUnchanged: true") &&
    cron.includes("await runPointInTimeSp500AlphaCreatorV2Integrity()") &&
    pitAlphaV2IntegrityEndpoint.includes(
      "await getPointInTimeSp500AlphaCreatorV2Integrity()",
    ) &&
    pitAlphaV2IntegrityEndpoint.includes("productionChanged: false") &&
    pitAlphaV2IntegrityEndpoint.includes("eligibleForAlphaClaim: false"),
  "The V2 post-result integrity audit must be cron-run, diagnostic-only and incapable of changing selection or production authority.",
);
assert(
  rawSource.includes("runResearchDataCapabilityAudit") &&
    rawSource.includes("number(existing?.version, 0) >= 2") &&
    rawSource.includes('"historical-sp500-constituent"') &&
    rawSource.includes('"delisted-companies"') &&
    rawSource.includes('removedSymbol: ["removedSymbol", "removedTicker"]') &&
    rawSource.includes("sampleFields: Object.keys(sample).sort()") &&
    rawSource.includes("credentialsExposed: false") &&
    rawSource.includes("revisionSafeFundamentalValues: false") &&
    rawSource.includes("pointInTimeMaterialNews: false") &&
    dataCapabilityEndpoint.includes("await runResearchDataCapabilityAudit()") &&
    !dataCapabilityEndpoint.includes("force"),
  "The bounded capability audit must check historical membership and delistings once without exposing credentials or overstating data quality.",
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
