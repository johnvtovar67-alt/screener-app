const fs = require("fs");
const vm = require("vm");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let source = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const rawSource = source;
const nasdaqAcquisitionSource = rawSource.slice(
  rawSource.indexOf("export async function runPointInTimeNasdaqDatasetAcquisition"),
  rawSource.indexOf("async function compilePointInTimeNasdaqDataset"),
);
const nasdaqCompilerSource = rawSource.slice(
  rawSource.indexOf("async function compilePointInTimeNasdaqDataset"),
  rawSource.indexOf("async function verifiedNasdaqChunk"),
);
const nasdaqIntegritySource = rawSource.slice(
  rawSource.indexOf("export async function runPointInTimeNasdaqPriceIntegrity"),
  rawSource.indexOf("function pointInTimeNasdaqAlphaR11Definitions"),
);
const nasdaqR11ContextSource = rawSource.slice(
  rawSource.indexOf("async function pointInTimeNasdaqR11Context"),
  rawSource.indexOf("async function restorePointInTimeNasdaqWindow"),
);
const contractSource = fs.readFileSync("lib/v12ResearchContract.js", "utf8");
const walkForwardSource = fs.readFileSync(
  "lib/walkForwardBacktest.js",
  "utf8",
);
const researchSource = `${rawSource}\n${contractSource}`;
const nasdaqMutationRoutes = [
  "pages/api/research/pit-nasdaq-universe.js",
  "pages/api/research/pit-nasdaq-dataset-status.js",
  "pages/api/research/pit-nasdaq-price-integrity.js",
  "pages/api/research/pit-nasdaq-alpha-parallel-r11.js",
].map((pathname) => fs.readFileSync(pathname, "utf8"));
const cronSource = fs.readFileSync(
  "pages/api/cron/fmp-research-backtest.js",
  "utf8",
);
assert(
  cronSource.indexOf("legacyResearchRerun: false") > 0 &&
    cronSource.indexOf("legacyResearchRerun: false") <
      cronSource.indexOf("const report = await runFmpResearchBacktest"),
  "A terminal Nasdaq study must short-circuit before legacy datasets are reloaded.",
);
assert(
  nasdaqMutationRoutes.every(
    (source) =>
      source.includes('["GET", "POST"]') &&
      source.includes("rejectUnauthorizedResearchMutation"),
  ) &&
    cronSource.includes("invokeNasdaqR11Workers") &&
    cronSource.includes("Promise.all") &&
    cronSource.includes(
      '"x-vercel-protection-bypass": protectionBypassSecret',
    ) &&
    cronSource.includes("VERCEL_AUTOMATION_BYPASS_SECRET is required") &&
    cronSource.includes('response.headers.get("content-type")') &&
    cronSource.includes("JSON.stringify(rawError)") &&
    cronSource.includes('console.error("R11 worker request failed"'),
  "Nasdaq mutation must be authenticated POST-only, with real cron-driven serverless fan-out and actionable worker failure evidence.",
);
assert(
  rawSource.includes('client.fetchStable("nasdaq-constituent", {})') &&
    rawSource.includes(
      'client.fetchStable("historical-nasdaq-constituent", {})',
    ) &&
    rawSource.includes("currentAnchorCardinalityPlausible") &&
    rawSource.includes("rawMembershipDigest") &&
    rawSource.includes("currentPointInTimeNasdaqUniverse") &&
    rawSource.includes(
      "date-added-effective-inclusive-corporate-action-v5",
    ) &&
    rawSource.includes("POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENTS") &&
    rawSource.includes('addedSymbol: "HONA"') &&
    rawSource.includes('removedSymbol: "SOLS"') &&
    rawSource.includes('removedSymbol: "VSNT"') &&
    rawSource.includes('removedSymbol: "XLNX"') &&
    rawSource.includes('removedSymbol: "ANSS"') &&
    rawSource.includes("pointInTimeNasdaqApplyProviderEventCorrections") &&
    rawSource.includes('effectiveDateBasis: "source-verified-supplement"') &&
    rawSource.includes("membershipSupplementContract") &&
    rawSource.includes("row.date >= POINT_IN_TIME_NASDAQ_RESEARCH_FROM"),
  "R11 must use the official FMP Nasdaq membership endpoints behind cardinality and full-history fingerprint gates.",
);
assert(
  rawSource.includes("runPointInTimeNasdaqR11WindowShard") &&
    rawSource.includes("freezePointInTimeNasdaqR11Validation") &&
    rawSource.includes("freezePointInTimeNasdaqR11Audit") &&
    rawSource.includes("finalizePointInTimeNasdaqR11") &&
    rawSource.includes("Exactly one frozen R11 candidate may enter audit") &&
    rawSource.includes("strictMatchedPlacebosRequired"),
  "R11 must use parallel immutable window shards, nested phase freezes, exactly one audit candidate, and a separate strict-placebo gate.",
);
assert(
  rawSource.includes("membershipObservationCoveragePct") &&
    rawSource.includes(
      "usableAdjustedOhlcBar(indexedHistories.get(symbol)?.get(date))",
    ) &&
    rawSource.includes("pointInTimeProviderPriceSymbols") &&
    rawSource.includes("pointInTimeCanonicalPriceHistories") &&
    rawSource.includes("date-bounded-provider-alias-stitch-v1") &&
    rawSource.includes(
      "historical-signal-evaluator-v11-nasdaq-membership-removal-history-v4",
    ) &&
    rawSource.includes(
      "effective-session-adjusted-open-else-conservative-zero-v2",
    ) &&
    rawSource.includes('type: "universe-removal"') &&
    rawSource.includes("universeRemovalOpenCoveragePct") &&
    rawSource.includes("universeRemovalOutcomeCoveragePct") &&
    rawSource.includes("missingMembershipObservations") &&
    rawSource.includes("missingRequiredPriceRows") &&
    rawSource.includes(
      "conservative-zero-recovery-missing-removal-open-v1",
    ),
  "The Nasdaq rebuild must stitch dated ticker aliases, measure actual member-date bars, and resolve every removal without inventing a price.",
);
assert(
  nasdaqAcquisitionSource.includes(
    "const priceSymbols = pointInTimeProviderPriceSymbols(",
  ) &&
    nasdaqAcquisitionSource.includes(
      "pointInTimeCanonicalPriceHistories(histories)",
    ) &&
    nasdaqCompilerSource.includes(
      "const canonicalHistories = pointInTimeCanonicalPriceHistories(histories)",
    ),
  "Alias expansion and stitched usability must be wired into the Nasdaq acquisition and compiler, not merely defined elsewhere.",
);
assert(
  rawSource.includes('status: "stale"') &&
    rawSource.includes("signature?.compilerContract ===") &&
    rawSource.includes("signature?.universeContract ===") &&
    rawSource.includes("signature?.membershipSupplementContract ===") &&
    rawSource.includes("signature?.priceAliasContract ===") &&
    rawSource.includes("signature?.universeRemovalPolicy ===") &&
    rawSource.includes("pointInTimeNasdaqDatasetContractFingerprint") &&
    rawSource.includes("currentPointInTimeNasdaqEvidence") &&
    rawSource.includes("currentPointInTimeNasdaqIntegrity") &&
    rawSource.includes("observed-history-exact-253-row-requirements-v3") &&
    rawSource.includes("observedSignalHistoryRequired") &&
    rawSource.includes("missingRequiredPriceRowsBySymbol") &&
    nasdaqCompilerSource.includes("membershipChangesEffectiveInclusive: true") &&
    nasdaqIntegritySource.includes(
      "assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe)",
    ) &&
    nasdaqIntegritySource.includes(
      "requireExactObservedSignalHistory: true",
    ) &&
    nasdaqR11ContextSource.includes(
      "assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe)",
    ),
  "A compiled Nasdaq status must become stale when the compiler, alias, or removal contract changes so the production cron actually rebuilds it.",
);
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
const { compactReplaySession } = createResearchModuleLoader(
  process.cwd(),
).load("lib/replayDatasetCompaction.js");
const { compilePointInTimeSignals } = createResearchModuleLoader(
  process.cwd(),
).load("lib/historicalSignalEvaluator.js");
source = source
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "")
  .replace(/export const /g, "const ")
  .replace(/export async function /g, "async function ")
  .replace(/export function /g, "function ");
source +=
  "\nmodule.exports={selectResearchUniverse,normalizeHistoricalBars,buildHistoricalFundamentalRows,resolvePriceHistoryContract,runProvisionalWindows,nextReplaySessionSlice,equivalentAcquisitionSignature,appendCompatibleAcquisitionSignature,appendCompatibleStatementSignature,pointInTimeSecuritySymbol,pointInTimeProviderPriceSymbols,pointInTimeCanonicalPriceHistories,pointInTimeSp500RawDatasetFromHistory,pointInTimeIndexRawDatasetFromHistory,pointInTimePriceIntegrityAudit,summarizePointInTimeTradeConcentration,reconstructIndexInitialMembers,canonicalIndexMembershipChanges,pointInTimePriceInputFingerprint,pointInTimeNasdaqExpectedSessionDates,pointInTimeNasdaqExpectedMembershipEvidence,pointInTimeNasdaqManifestHasCurrentContract,currentPointInTimeNasdaqUniverse,currentPointInTimeNasdaqEvidence,currentPointInTimeNasdaqIntegrity,assertCurrentPointInTimeNasdaqEvidence,pointInTimeNasdaqMembershipDigest,pointInTimeNasdaqMembershipSupplementFingerprint,pointInTimeNasdaqProviderEventCorrectionFingerprint,pointInTimeNasdaqMembershipSupplementConflict,pointInTimeNasdaqApplyProviderEventCorrections,pointInTimeNasdaqPriceAcquisitionSignatureMatches,buildR11ShardPlan,r11ShardStorePath,mergeR11ShardReports,validateR11ShardReport,r11PhaseChecksPass,r11DeterministicAuditGate,sha256Fingerprint};";
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
  createHash: require("crypto").createHash,
  isUsMarketSessionDay: createResearchModuleLoader(process.cwd()).load(
    "lib/marketSession.js",
  ).isUsMarketSessionDay,
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
  pointInTimeProviderPriceSymbols,
  pointInTimeCanonicalPriceHistories,
  pointInTimeSp500RawDatasetFromHistory,
  pointInTimeIndexRawDatasetFromHistory,
  pointInTimePriceIntegrityAudit,
  summarizePointInTimeTradeConcentration,
  reconstructIndexInitialMembers,
  canonicalIndexMembershipChanges,
  pointInTimePriceInputFingerprint,
  pointInTimeNasdaqExpectedSessionDates,
  pointInTimeNasdaqExpectedMembershipEvidence,
  pointInTimeNasdaqManifestHasCurrentContract,
  currentPointInTimeNasdaqUniverse,
  currentPointInTimeNasdaqEvidence,
  currentPointInTimeNasdaqIntegrity,
  assertCurrentPointInTimeNasdaqEvidence,
  pointInTimeNasdaqMembershipDigest,
  pointInTimeNasdaqMembershipSupplementFingerprint,
  pointInTimeNasdaqProviderEventCorrectionFingerprint,
  pointInTimeNasdaqMembershipSupplementConflict,
  pointInTimeNasdaqApplyProviderEventCorrections,
  pointInTimeNasdaqPriceAcquisitionSignatureMatches,
  buildR11ShardPlan,
  r11ShardStorePath,
  mergeR11ShardReports,
  validateR11ShardReport,
  r11PhaseChecksPass,
  r11DeterministicAuditGate,
  sha256Fingerprint,
} = box.module.exports;

const doubleCompactedListingSession = compactReplaySession(
  compactReplaySession({
    date: "2026-07-01",
    signals: [
      {
        symbol: "IPO",
        listedAt: "2026-06-29",
        delistedAt: "2026-12-31",
      },
    ],
  }),
);
assert(
  doubleCompactedListingSession.signals[0]?.listedAt === "2026-06-29" &&
    doubleCompactedListingSession.signals[0]?.delistedAt === "2026-12-31",
  "Root signal listing bounds must survive both chunk compaction and restore-time re-compaction.",
);

const compilerHistoryDates = Array.from({ length: 253 }, (_, index) =>
  new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
);
const compilerHistoryDataset = {
  metadata: { pointInTime: true },
  securities: [{ symbol: "AAA", listedAt: compilerHistoryDates[0] }],
  fundamentals: [],
  events: [],
  sessions: compilerHistoryDates.map((date, index) => ({
    date,
    decisionAt: `${date}T20:00:00.000Z`,
    fundamentalCoverageAsOf: `${date}T20:00:00.000Z`,
    eventCoverageAsOf: `${date}T20:00:00.000Z`,
    universeSymbols: ["AAA"],
    prices: ["AAA", "SPY", "QQQ"].map((symbol, symbolIndex) => ({
      symbol,
      open: 100 + symbolIndex + index / 100,
      high: 102 + symbolIndex + index / 100,
      low: 99 + symbolIndex + index / 100,
      close: 101 + symbolIndex + index / 100,
      volume: 100_000_000,
      adjusted: true,
    })),
  })),
};
const exactHistoryCompiled = compilePointInTimeSignals(
  compilerHistoryDataset,
  { minimumHistoryRows: 253 },
);
const defaultHistoryCompiled = compilePointInTimeSignals(
  compilerHistoryDataset,
  { maxSessions: 1 },
);
assert(
  exactHistoryCompiled.metadata.minimumSignalHistoryRows === 253 &&
    exactHistoryCompiled.sessions[251].signals.length === 0 &&
    exactHistoryCompiled.sessions[251].positionSignals.length === 0 &&
    exactHistoryCompiled.sessions[252].positionSignals.length === 1 &&
    defaultHistoryCompiled.metadata.minimumSignalHistoryRows === undefined,
  "Nasdaq compilation must suppress signals until 253 observed rows while the shared compiler default remains unchanged.",
);

const probePriceFingerprint = "1".repeat(64);
const probeSessionDates = pointInTimeNasdaqExpectedSessionDates();
assert(
  probeSessionDates.length === 1_170 &&
    probeSessionDates[0] === "2022-01-03" &&
    probeSessionDates.at(-1) === "2026-09-01" &&
    !probeSessionDates.includes("2025-01-09"),
  "The frozen Nasdaq evidence calendar must contain the exact 1,170 exchange sessions, including exceptional closures.",
);
const probeInitialSymbols = Array.from({ length: 90 }, (_, index) =>
  `N${String(index).padStart(3, "0")}`,
).sort();
const probeCurrentSymbols = ["HONA", ...probeInitialSymbols].sort();
const probeSymbols = ["HONA", "SOLS", "VSNT", ...probeInitialSymbols].sort();
const probeMembershipSupplements = [
  {
    date: "2026-06-29",
    effectiveDate: "2026-06-29",
    announcementDate: "2026-06-05",
    addedSymbol: "HONA",
    removedSymbol: "",
    addedSecurity: "Honeywell Aerospace Inc.",
    reason:
      "Source-backed inference: NDX spin-off rule applied on the verified ex-date",
    provenance:
      "Nasdaq NDX methodology (2026) applied to Nasdaq Corporate Action ECA2026-399",
    sources: [
      "https://indexes.nasdaq.com/docs/Methodology_NDX.pdf",
      "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-399",
    ],
    effectiveDateBasis: "source-verified-supplement",
    sourceVerifiedSupplement: true,
  },
];
const probeSupplementFingerprint =
  pointInTimeNasdaqMembershipSupplementFingerprint(
    probeMembershipSupplements,
  );
const probeCorrectionFingerprint =
  pointInTimeNasdaqProviderEventCorrectionFingerprint();
const probeSolsCorrection = {
  id: "sols-ndx-effective-removal-2025-11-10",
  date: "2025-11-10",
  effectiveDate: "2025-11-10",
  announcementDate: "2025-11-06",
  addedSymbol: "",
  removedSymbol: "SOLS",
  removedSecurity: "Solstice Advanced Materials Inc.",
  providerEventDate: "2025-11-06",
  reason:
    "FMP stamps the removal on its announcement date; official Nasdaq weights show SOLS present through November 7 and absent November 10",
  provenance:
    "Nasdaq Global Indexes 2025 NDX review and official NDX start-of-day weights",
  sources: [
    "https://www.nasdaq.com/articles/global-indexes/2025-nasdaq-100-reconstitution-and-performance-highlights",
    "https://indexes.nasdaqomx.com/Index/Weighting/NDX",
  ],
  providerEventCorrectionId:
    "sols-ndx-effective-removal-2025-11-10",
  effectiveDateBasis: "source-verified-corporate-action",
  sourceVerifiedCorrection: true,
};
const probeVsntCorrection = {
  id: "vsnt-ndx-effective-removal-2026-01-14",
  date: "2026-01-14",
  effectiveDate: "2026-01-14",
  announcementDate: "",
  addedSymbol: "",
  removedSymbol: "VSNT",
  removedSecurity: "Versant Media Group, Inc.",
  providerEventDate: "2026-01-09",
  reason:
    "FMP stamps the removal on January 9; official Nasdaq weights show VSNT present through January 13 and absent January 14",
  provenance:
    "Nasdaq NDX methodology, Nasdaq Corporate Action ECA2025-683, and official NDX start-of-day weights",
  sources: [
    "https://indexes.nasdaq.com/docs/Methodology_NDX.pdf",
    "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-683",
    "https://indexes.nasdaqomx.com/Index/Weighting/NDX",
  ],
  providerEventCorrectionId:
    "vsnt-ndx-effective-removal-2026-01-14",
  effectiveDateBasis: "source-verified-corporate-action",
  sourceVerifiedCorrection: true,
};
const universeProbeFor = (symbols) => {
  const normalizedSymbols = [...new Set(symbols)].sort();
  const initialSymbols = normalizedSymbols.filter((symbol) => symbol !== "HONA");
  const unionSymbols = [...new Set([...normalizedSymbols, "SOLS", "VSNT"])].sort();
  const changes = [
    {
      date: "2025-10-30",
      effectiveDate: "2025-10-30",
      addedSymbol: "SOLS",
      removedSymbol: "",
      effectiveDateBasis: "dateAdded",
    },
    probeSolsCorrection,
    {
      date: "2026-01-05",
      effectiveDate: "2026-01-05",
      addedSymbol: "VSNT",
      removedSymbol: "",
      effectiveDateBasis: "dateAdded",
    },
    probeVsntCorrection,
    probeMembershipSupplements[0],
  ].map((row) => ({ ...row }));
  const profilesBySymbol = Object.fromEntries(
    unionSymbols.map((symbol) => [
      symbol,
      { symbol, name: symbol, companyName: symbol },
    ]),
  );
  const privateBlueprint = {
    currentSymbols: normalizedSymbols,
    throughSymbols: normalizedSymbols,
    initialSymbols,
    changes,
    membershipSupplements: probeMembershipSupplements,
    membershipSupplementContract:
      "source-verified-nasdaq-spinoff-addition-v3",
    membershipSupplementFingerprint: probeSupplementFingerprint,
    providerEventCorrectionContract:
      "source-verified-provider-effective-dates-v3",
    providerEventCorrectionFingerprint: probeCorrectionFingerprint,
    providerEventCorrections: [probeSolsCorrection, probeVsntCorrection],
    unionSymbols,
    profilesBySymbol,
    delistedDates: {},
  };
  const rawMembershipDigest = pointInTimeNasdaqMembershipDigest({
    ...privateBlueprint,
    fromDate: "2022-01-01",
    throughDate: "2026-09-01",
  });
  return {
    version: 1,
    status: "complete",
    universeContract:
      "date-added-effective-inclusive-corporate-action-v5",
    membershipSupplementContract:
      "source-verified-nasdaq-spinoff-addition-v3",
    membershipSupplementFingerprint: probeSupplementFingerprint,
    providerEventCorrectionContract:
      "source-verified-provider-effective-dates-v3",
    providerEventCorrectionFingerprint: probeCorrectionFingerprint,
    correctedProviderEvents: 4,
    membershipEffectiveConvention: "effective-date-inclusive",
    supplementalMembershipEvents: 1,
    currentAnchorCardinalityPlausible: true,
    pointInTimeMembershipConstructed: true,
    currentConstituents: normalizedSymbols.length,
    throughConstituents: normalizedSymbols.length,
    initialConstituents: initialSymbols.length,
    normalizedMembershipChanges: changes.length,
    unionSymbols: unionSymbols.length,
    earliestMembershipEvent: "2025-10-30",
    latestMembershipEvent: "2026-06-29",
    fromDate: "2022-01-01",
    throughDate: "2026-09-01",
    rawMembershipDigest,
    privateBlueprint: { ...privateBlueprint, rawMembershipDigest },
  };
};
const currentNasdaqUniverseProbe = universeProbeFor(probeCurrentSymbols);
const currentNasdaqSignature = JSON.stringify({
  schema: 1,
  compilerContract:
    "historical-signal-evaluator-v11-nasdaq-membership-removal-history-v4",
  minimumSignalHistoryRows: 253,
  universeContract:
    "date-added-effective-inclusive-corporate-action-v5",
  membershipSupplementContract: "source-verified-nasdaq-spinoff-addition-v3",
  membershipSupplementFingerprint: probeSupplementFingerprint,
  providerEventCorrectionContract:
    "source-verified-provider-effective-dates-v3",
  providerEventCorrectionFingerprint: probeCorrectionFingerprint,
  membershipEffectiveConvention: "effective-date-inclusive",
  priceAliasContract: "date-bounded-provider-alias-stitch-v1",
  priceAcquisitionContract: "membership-bound-full-symbol-refresh-v2",
  universeRemovalPolicy:
    "effective-session-adjusted-open-else-conservative-zero-v2",
  securityIdentityContract: "canonical-current-ticker-v1",
  rawMembershipDigest: currentNasdaqUniverseProbe.rawMembershipDigest,
  fromDate: "2022-01-01",
  endDate: "2026-09-01",
  requestedSymbols: probeSymbols,
  usableSymbols: probeSymbols,
  priceContract: "fmp-dividend-adjusted-v1",
  priceInputFingerprint: probePriceFingerprint,
  sessionDates: probeSessionDates,
});
const probeDatasetInputFingerprint = sha256Fingerprint(currentNasdaqSignature);
const probeChunk = {
  pathname: `research/pit-nasdaq-index-compiled-v1/${probeDatasetInputFingerprint}/0000-${probeSessionDates.length}.json.gz`,
  start: 0,
  end: probeSessionDates.length,
  firstDate: probeSessionDates[0],
  lastDate: probeSessionDates.at(-1),
  contentSha256: "2".repeat(64),
};
const probeEvidenceFingerprint = sha256Fingerprint(
  JSON.stringify({
    schema: 1,
    datasetFingerprint: probeDatasetInputFingerprint,
    chunks: [probeChunk],
  }),
);
const probeDatasetContractFingerprint = sha256Fingerprint(
  JSON.stringify({
    schema: 1,
    universeContract:
      "date-added-effective-inclusive-corporate-action-v5",
    membershipSupplementContract: "source-verified-nasdaq-spinoff-addition-v3",
    membershipSupplementFingerprint: probeSupplementFingerprint,
    providerEventCorrectionContract:
      "source-verified-provider-effective-dates-v3",
    providerEventCorrectionFingerprint: probeCorrectionFingerprint,
    membershipEffectiveConvention: "effective-date-inclusive",
    compilerContract:
      "historical-signal-evaluator-v11-nasdaq-membership-removal-history-v4",
    minimumSignalHistoryRows: 253,
    priceAliasContract: "date-bounded-provider-alias-stitch-v1",
    priceAcquisitionContract: "membership-bound-full-symbol-refresh-v2",
    universeRemovalPolicy:
      "effective-session-adjusted-open-else-conservative-zero-v2",
    securityIdentityContract: "canonical-current-ticker-v1",
  }),
);
const currentNasdaqManifestProbe = {
  schema: 1,
  complete: true,
  completedSessions: probeSessionDates.length,
  sessionDates: probeSessionDates,
  chunks: [probeChunk],
  signature: currentNasdaqSignature,
  datasetFingerprint: probeDatasetInputFingerprint,
  evidenceDatasetFingerprint: probeEvidenceFingerprint,
  priceInputFingerprint: probePriceFingerprint,
};
const currentNasdaqStatusProbe = {
  status: "compiled",
  datasetContractFingerprint: probeDatasetContractFingerprint,
  priceAcquisitionContract: "membership-bound-full-symbol-refresh-v2",
  rawMembershipDigest: currentNasdaqUniverseProbe.rawMembershipDigest,
  membershipSupplementFingerprint: probeSupplementFingerprint,
  datasetFingerprint: probeEvidenceFingerprint,
  datasetInputFingerprint: probeDatasetInputFingerprint,
  priceInputFingerprint: probePriceFingerprint,
  period: { from: "2022-01-01", through: "2026-09-01" },
  priceContract: {
    id: "fmp-dividend-adjusted-v1",
    adjustmentMethod: "provider-dividend-adjusted-ohlc",
  },
  productionChanged: false,
  eligibleForAlphaClaim: false,
};
const probeExpectedMembershipEvidence =
  pointInTimeNasdaqExpectedMembershipEvidence(
    currentNasdaqUniverseProbe,
    probeSessionDates,
  );
const probeMembershipObservations =
  probeExpectedMembershipEvidence.requestedMembershipObservations;
const probeBenchmarkObservations = 2 * probeSessionDates.length;
const probeRequiredPriceRows =
  probeMembershipObservations + probeBenchmarkObservations;
const probeRemovalActions =
  probeExpectedMembershipEvidence.universeRemovalActions;
const currentNasdaqIntegrityProbe = {
  version: 2,
  integrityContract: "observed-history-exact-253-row-requirements-v3",
  status: "complete",
  datasetFingerprint: probeEvidenceFingerprint,
  datasetInputFingerprint: probeDatasetInputFingerprint,
  priceInputFingerprint: probePriceFingerprint,
  rawMembershipDigest: currentNasdaqUniverseProbe.rawMembershipDigest,
  membershipSupplementFingerprint: probeSupplementFingerprint,
  assessment: {
    adjustedPriceIntegrityPass: true,
    exactObservedSignalHistoryComplete: true,
    missingPriceAttributionComplete: true,
    activeMemberDateCoverageComplete: true,
    universeRemovalExactOpenCoverageComplete: true,
    universeRemovalOutcomeCoverageComplete: true,
    membershipCardinalityPlausible: true,
    membershipPathMatchesUniverse: true,
    allDataGatesPassed: true,
  },
  membershipPathFingerprint:
    probeExpectedMembershipEvidence.membershipPathFingerprint,
  expectedMembershipPathFingerprint:
    probeExpectedMembershipEvidence.membershipPathFingerprint,
  expectedRequestedMembershipObservations:
    probeExpectedMembershipEvidence.requestedMembershipObservations,
  expectedMinimumMembershipCount:
    probeExpectedMembershipEvidence.minimumMembershipCount,
  expectedMaximumMembershipCount:
    probeExpectedMembershipEvidence.maximumMembershipCount,
  expectedUniverseRemovalActions:
    probeExpectedMembershipEvidence.universeRemovalActions,
  membershipObservationCoveragePct: 100,
  requestedMembershipObservations: probeMembershipObservations,
  availableMembershipObservations: probeMembershipObservations,
  missingMembershipObservations: 0,
  missingMembershipObservationsBySymbol: [],
  universeRemovalOpenCoveragePct: 100,
  universeRemovalOpenPrices: probeRemovalActions,
  universeRemovalZeroRecoveryActions: 0,
  universeRemovalResolvedOutcomes: probeRemovalActions,
  universeRemovalOutcomeCoveragePct: 100,
  universeRemovalActions: probeRemovalActions,
  universeRemovalMissingOutcomes: 0,
  universeRemovalPolicy:
    "effective-session-adjusted-open-else-conservative-zero-v2",
  productionChanged: false,
  eligibleForAlphaClaim: false,
  minimumMembershipCount: 90,
  maximumMembershipCount: 91,
  audit: {
    pass: true,
    sessions: 1_170,
    totalStoredPriceRows: probeRequiredPriceRows,
    priceRows: probeRequiredPriceRows,
    activeMembershipPriceRows: probeMembershipObservations,
    lookbackPriceRows: probeBenchmarkObservations,
    excludedArchivalPriceRows: 0,
    adjustedRows: probeRequiredPriceRows,
    adjustedCoveragePct: 100,
    nonPositiveRows: 0,
    invalidOhlcRows: 0,
    requiredPriceRows: probeRequiredPriceRows,
    observedRequiredPriceRows: probeRequiredPriceRows,
    missingRequiredPriceRows: 0,
    missingRequiredPriceRowsBySymbol: [],
    missingRequiredAttributionComplete: true,
    possibleUnadjustedCorporateActions: [],
    possibleDuplicateActiveSeries: [],
    observedSignalHistoryRequired: true,
    observedSignalHistoryPass: true,
    shortSignalHistoryRows: 0,
    nasdaqMembershipEvidenceApplied: true,
    membershipPathFingerprint:
      probeExpectedMembershipEvidence.membershipPathFingerprint,
    membershipObservationCoveragePct: 100,
    requestedMembershipObservations: probeMembershipObservations,
    availableMembershipObservations: probeMembershipObservations,
    missingMembershipObservations: 0,
    missingMembershipObservationsBySymbol: [],
    activeMemberDateCoverageComplete: true,
    universeRemovalActions: probeRemovalActions,
    universeRemovalOpenPrices: probeRemovalActions,
    universeRemovalOpenCoveragePct: 100,
    universeRemovalZeroRecoveryActions: 0,
    universeRemovalResolvedOutcomes: probeRemovalActions,
    universeRemovalMissingOutcomes: 0,
    universeRemovalOutcomeCoveragePct: 100,
    universeRemovalOutcomeCoverageComplete: true,
    minimumMembershipCount: 90,
    maximumMembershipCount: 91,
  },
};
assert(
  currentPointInTimeNasdaqUniverse(currentNasdaqUniverseProbe) &&
    pointInTimeNasdaqManifestHasCurrentContract(currentNasdaqManifestProbe) &&
    assertCurrentPointInTimeNasdaqEvidence(
      currentNasdaqManifestProbe,
      currentNasdaqStatusProbe,
      currentNasdaqUniverseProbe,
    ) &&
    currentPointInTimeNasdaqIntegrity(
      currentNasdaqIntegrityProbe,
      currentNasdaqManifestProbe,
      currentNasdaqStatusProbe,
      currentNasdaqUniverseProbe,
    ),
  "Current Nasdaq evidence must be accepted only when universe, manifest, status, and integrity fingerprints agree.",
);
const rehashedUniverseProbe = (privateBlueprint, publicOverrides = {}) => {
  const rawMembershipDigest = pointInTimeNasdaqMembershipDigest({
    ...privateBlueprint,
    fromDate: "2022-01-01",
    throughDate: "2026-09-01",
  });
  return {
    ...currentNasdaqUniverseProbe,
    ...publicOverrides,
    rawMembershipDigest,
    privateBlueprint: { ...privateBlueprint, rawMembershipDigest },
  };
};
assert(
  !currentPointInTimeNasdaqUniverse(
    rehashedUniverseProbe(
      { ...currentNasdaqUniverseProbe.privateBlueprint, changes: [] },
      {
        normalizedMembershipChanges: 0,
        earliestMembershipEvent: null,
        latestMembershipEvent: null,
      },
    ),
  ) &&
    !currentPointInTimeNasdaqUniverse(
      rehashedUniverseProbe(
        {
          ...currentNasdaqUniverseProbe.privateBlueprint,
          initialSymbols: probeSymbols,
        },
        { initialConstituents: probeSymbols.length },
      ),
    ),
  "The frozen HONA supplement must be an applied June 29 transition and HONA must not leak into initial membership.",
);
for (const removedSymbol of ["SOLS", "VSNT"])
  assert(
    !currentPointInTimeNasdaqUniverse(
      rehashedUniverseProbe(
        {
          ...currentNasdaqUniverseProbe.privateBlueprint,
          changes: currentNasdaqUniverseProbe.privateBlueprint.changes.filter(
            (row) => row.removedSymbol !== removedSymbol,
          ),
        },
        {
          normalizedMembershipChanges:
            currentNasdaqUniverseProbe.normalizedMembershipChanges - 1,
        },
      ),
    ),
    `A missing ${removedSymbol} spin-off removal must fail the current-anchor replay even when the altered blueprint is self-hashed.`,
  );
assert(
  !pointInTimeNasdaqMembershipSupplementConflict(
    [
      {
        date: "2026-06-29",
        addedSymbol: "HONA",
        removedSymbol: "",
      },
    ],
    probeMembershipSupplements,
  ) &&
    pointInTimeNasdaqMembershipSupplementConflict(
      [
        {
          date: "2025-12-31",
          addedSymbol: "HONA",
          removedSymbol: "",
        },
      ],
      probeMembershipSupplements,
    ) &&
    pointInTimeNasdaqMembershipSupplementConflict(
      [
        {
          date: "2026-06-29",
          addedSymbol: "HONA",
          removedSymbol: "HON",
        },
      ],
      probeMembershipSupplements,
    ),
  "Any alternate HONA date or same-date conflicting removal must stop the source-backed supplement merge.",
);
const correctedAcquisitionEvents =
  pointInTimeNasdaqApplyProviderEventCorrections([
    {
      date: "2022-02-22",
      effectiveDate: "2022-02-22",
      addedSymbol: "AZN",
      removedSymbol: "XLNX",
    },
    {
      date: "2025-07-28",
      effectiveDate: "2025-07-28",
      addedSymbol: "TRI",
      removedSymbol: "ANSS",
    },
    {
      date: "2025-11-06",
      effectiveDate: "2025-11-06",
      addedSymbol: "SOLS",
      removedSymbol: "SOLS",
    },
    {
      date: "2026-01-09",
      effectiveDate: "2026-01-09",
      addedSymbol: "",
      removedSymbol: "VSNT",
    },
  ]);
assert(
  correctedAcquisitionEvents.providerChanges.every(
    (row) => row.removedSymbol === "" && row.providerEventCorrectionId,
  ) &&
    correctedAcquisitionEvents.correctionChanges.some(
      (row) =>
        row.date === "2022-02-14" &&
        row.removedSymbol === "XLNX" &&
        row.sourceVerifiedCorrection === true,
    ) &&
    correctedAcquisitionEvents.correctionChanges.some(
      (row) =>
        row.date === "2025-07-17" &&
        row.removedSymbol === "ANSS" &&
        row.sourceVerifiedCorrection === true,
    ) &&
    correctedAcquisitionEvents.correctionChanges.some(
      (row) =>
        row.date === "2025-11-10" &&
        row.removedSymbol === "SOLS" &&
        row.providerEventDate === "2025-11-06" &&
        row.sourceVerifiedCorrection === true,
    ) &&
    correctedAcquisitionEvents.correctionChanges.some(
      (row) =>
        row.date === "2026-01-14" &&
        row.removedSymbol === "VSNT" &&
        row.providerEventDate === "2026-01-09" &&
        row.sourceVerifiedCorrection === true,
    ),
  "Provider events must move to their source-verified effective dates while any distinct paired additions retain their own dates.",
);
let missingCorrectionAnchorRejected = false;
try {
  pointInTimeNasdaqApplyProviderEventCorrections([
    {
      date: "2022-02-22",
      effectiveDate: "2022-02-22",
      addedSymbol: "AZN",
      removedSymbol: "XLNX",
    },
  ]);
} catch {
  missingCorrectionAnchorRejected = true;
}
assert(
  missingCorrectionAnchorRejected,
  "A missing or changed provider anchor for a source correction must fail closed.",
);
const acquisitionMatchOptions = {
  fromDate: "2022-01-01",
  endDate: "2026-09-01",
  priceContract: "fmp-dividend-adjusted-v1",
  priceSymbols: [...probeSymbols, "QQQ", "SPY"].sort(),
  rawMembershipDigest: currentNasdaqUniverseProbe.rawMembershipDigest,
  membershipSupplementFingerprint: probeSupplementFingerprint,
};
const currentAcquisitionSignature = JSON.stringify({
  schema: 3,
  priceAcquisitionContract: "membership-bound-full-symbol-refresh-v2",
  rawMembershipDigest: acquisitionMatchOptions.rawMembershipDigest,
  membershipSupplementFingerprint: probeSupplementFingerprint,
  fromDate: acquisitionMatchOptions.fromDate,
  endDate: acquisitionMatchOptions.endDate,
  priceContract: acquisitionMatchOptions.priceContract,
  symbols: acquisitionMatchOptions.priceSymbols,
});
assert(
  pointInTimeNasdaqPriceAcquisitionSignatureMatches(
    currentAcquisitionSignature,
    acquisitionMatchOptions,
  ) &&
    !pointInTimeNasdaqPriceAcquisitionSignatureMatches(
      JSON.stringify({
        schema: 3,
        fromDate: acquisitionMatchOptions.fromDate,
        endDate: acquisitionMatchOptions.endDate,
        priceContract: acquisitionMatchOptions.priceContract,
        symbols: acquisitionMatchOptions.priceSymbols,
      }),
      acquisitionMatchOptions,
    ) &&
    !pointInTimeNasdaqPriceAcquisitionSignatureMatches(
      currentAcquisitionSignature,
      { ...acquisitionMatchOptions, rawMembershipDigest: "f".repeat(64) },
    ),
  "A pre-supplement or differently bound Nasdaq price checkpoint must force a full membership-aware refresh.",
);
const selfConsistentManifestProbe = (signaturePayload) => {
  const signature = JSON.stringify(signaturePayload);
  const datasetFingerprint = sha256Fingerprint(signature);
  const sessionDates = signaturePayload.sessionDates;
  const chunk = {
    ...probeChunk,
    pathname: `research/pit-nasdaq-index-compiled-v1/${datasetFingerprint}/0000-${sessionDates.length}.json.gz`,
    end: sessionDates.length,
    firstDate: sessionDates[0],
    lastDate: sessionDates.at(-1),
  };
  return {
    ...currentNasdaqManifestProbe,
    completedSessions: sessionDates.length,
    sessionDates,
    chunks: [chunk],
    signature,
    datasetFingerprint,
    evidenceDatasetFingerprint: sha256Fingerprint(
      JSON.stringify({
        schema: 1,
        datasetFingerprint,
        chunks: [chunk],
      }),
    ),
  };
};
const currentSignaturePayload = JSON.parse(currentNasdaqSignature);
for (const invalidSignature of [
  { ...currentSignaturePayload, fromDate: "2023-01-01" },
  { ...currentSignaturePayload, priceContract: "fabricated-adjusted-prices" },
  (() => {
    const signature = { ...currentSignaturePayload };
    delete signature.priceContract;
    return signature;
  })(),
  {
    ...currentSignaturePayload,
    sessionDates: probeSessionDates.filter((_, index) => index !== 500),
  },
  {
    ...currentSignaturePayload,
    sessionDates: probeSessionDates.map((date, index) =>
      index === 500 ? "2025-02-30" : date,
    ),
  },
])
  assert(
    !pointInTimeNasdaqManifestHasCurrentContract(
      selfConsistentManifestProbe(invalidSignature),
    ),
    "A self-consistent manifest with a wrong period, price contract, missing session, or malformed session date must be stale.",
  );
const unrelatedRequestedSymbols = Array.from({ length: probeSymbols.length },
  (_, index) => `X${String(index).padStart(3, "0")}`,
).sort();
const unrelatedManifestProbe = selfConsistentManifestProbe({
  ...currentSignaturePayload,
  requestedSymbols: unrelatedRequestedSymbols,
  usableSymbols: unrelatedRequestedSymbols,
});
assert(
  pointInTimeNasdaqManifestHasCurrentContract(unrelatedManifestProbe) &&
    !currentPointInTimeNasdaqEvidence(
      unrelatedManifestProbe,
      {
        ...currentNasdaqStatusProbe,
        datasetFingerprint: unrelatedManifestProbe.evidenceDatasetFingerprint,
        datasetInputFingerprint: unrelatedManifestProbe.datasetFingerprint,
      },
      currentNasdaqUniverseProbe,
    ),
  "A structurally valid manifest must still be rejected when its requested symbols differ from the bound universe union.",
);
const alteredSupplements = probeMembershipSupplements.map((row) => ({
  ...row,
  date: "2026-06-30",
  effectiveDate: "2026-06-30",
}));
const alteredUniversePrivate = {
  ...currentNasdaqUniverseProbe.privateBlueprint,
  membershipSupplements: alteredSupplements,
};
const alteredUniverseDigest = pointInTimeNasdaqMembershipDigest({
  ...alteredUniversePrivate,
  fromDate: "2022-01-01",
  throughDate: "2026-09-01",
});
assert(
  !currentPointInTimeNasdaqUniverse({
    ...currentNasdaqUniverseProbe,
    rawMembershipDigest: alteredUniverseDigest,
    privateBlueprint: {
      ...alteredUniversePrivate,
      rawMembershipDigest: alteredUniverseDigest,
    },
  }),
  "A self-hashed universe with a membership supplement different from the frozen source registry must be stale.",
);
let staleNasdaqEvidenceRejections = 0;
for (const [manifest, status, universe] of [
  [
    {
      ...currentNasdaqManifestProbe,
      signature: JSON.stringify({
        ...JSON.parse(currentNasdaqManifestProbe.signature),
        universeContract: "obsolete-universe-contract",
      }),
    },
    currentNasdaqStatusProbe,
    currentNasdaqUniverseProbe,
  ],
  [
    currentNasdaqManifestProbe,
    { ...currentNasdaqStatusProbe, status: "collecting" },
    currentNasdaqUniverseProbe,
  ],
  [
    currentNasdaqManifestProbe,
    { ...currentNasdaqStatusProbe, datasetFingerprint: "different-evidence" },
    currentNasdaqUniverseProbe,
  ],
  [
    currentNasdaqManifestProbe,
    currentNasdaqStatusProbe,
    universeProbeFor([...probeSymbols.slice(0, -1), "ZZZZ"].sort()),
  ],
]) {
  try {
    assertCurrentPointInTimeNasdaqEvidence(manifest, status, universe);
  } catch {
    staleNasdaqEvidenceRejections++;
  }
}
assert(
  staleNasdaqEvidenceRejections === 4,
  "Stale, rebuilding, fingerprint-mismatched, or refreshed-universe Nasdaq evidence must be rejected before integrity or shard execution.",
);
assert(
  !currentPointInTimeNasdaqIntegrity(
    { ...currentNasdaqIntegrityProbe, integrityContract: "obsolete" },
    currentNasdaqManifestProbe,
    currentNasdaqStatusProbe,
    currentNasdaqUniverseProbe,
  ) &&
    !currentPointInTimeNasdaqIntegrity(
      { ...currentNasdaqIntegrityProbe, datasetInputFingerprint: "obsolete" },
      currentNasdaqManifestProbe,
      currentNasdaqStatusProbe,
      currentNasdaqUniverseProbe,
    ),
  "An old integrity contract or mismatched input fingerprint must never authorize the current Nasdaq evidence.",
);
assert(
  !currentPointInTimeNasdaqIntegrity(
    {
      ...currentNasdaqIntegrityProbe,
      audit: { ...currentNasdaqIntegrityProbe.audit, pass: false },
    },
    currentNasdaqManifestProbe,
      currentNasdaqStatusProbe,
      currentNasdaqUniverseProbe,
  ) &&
    !currentPointInTimeNasdaqIntegrity(
      {
        ...currentNasdaqIntegrityProbe,
        audit: {
          ...currentNasdaqIntegrityProbe.audit,
          totalStoredPriceRows: 1,
          priceRows: 1,
          activeMembershipPriceRows: 1,
          lookbackPriceRows: 0,
          adjustedRows: 1,
          requiredPriceRows: 0,
          observedRequiredPriceRows: 0,
          missingRequiredPriceRows: 0,
          pass: true,
        },
      },
      currentNasdaqManifestProbe,
      currentNasdaqStatusProbe,
      currentNasdaqUniverseProbe,
    ),
  "A hollow integrity artifact cannot claim passing assessments while its verified audit says it failed.",
);
const coherentFailedIntegrityProbe = {
  ...currentNasdaqIntegrityProbe,
  assessment: {
    ...currentNasdaqIntegrityProbe.assessment,
    adjustedPriceIntegrityPass: false,
    allDataGatesPassed: false,
  },
  audit: {
    ...currentNasdaqIntegrityProbe.audit,
    pass: false,
    totalStoredPriceRows: probeRequiredPriceRows - 1,
    priceRows: probeRequiredPriceRows - 1,
    activeMembershipPriceRows: probeMembershipObservations,
    lookbackPriceRows: probeBenchmarkObservations - 1,
    adjustedRows: probeRequiredPriceRows - 1,
    observedRequiredPriceRows: probeRequiredPriceRows - 1,
    missingRequiredPriceRows: 1,
    missingRequiredPriceRowsBySymbol: [
      {
        symbol: "HONA",
        total: 1,
        activeOrExecution: 0,
        signalLookback: 1,
        benchmark: 0,
      },
    ],
  },
};
assert(
  currentPointInTimeNasdaqIntegrity(
    coherentFailedIntegrityProbe,
    currentNasdaqManifestProbe,
    currentNasdaqStatusProbe,
    currentNasdaqUniverseProbe,
  ),
  "A coherent current audit failure must remain visible and cacheable while R11 stays blocked.",
);
const nasdaqIntegrityRunnerSource = rawSource.slice(
  rawSource.indexOf("export async function runPointInTimeNasdaqPriceIntegrity"),
  rawSource.indexOf("function pointInTimeNasdaqAlphaR11Definitions"),
);
assert(
  !nasdaqIntegrityRunnerSource.includes("manifest.datasetMetadata") &&
    !nasdaqIntegrityRunnerSource.includes("datasetStatus?.coverage"),
  "Nasdaq integrity authorization metrics must be recomputed from verified chunk sessions, not unbound manifest metadata.",
);

assert(
  pointInTimeSecuritySymbol("SATS") === "ECHO" &&
    pointInTimeSecuritySymbol("ECHO") === "ECHO",
  "Ticker aliases must resolve to one permanent point-in-time security identifier.",
);
assert(
  pointInTimeProviderPriceSymbols(["ECHO", "SPY"]).join(",") ===
    "ECHO,SATS,SPY",
  "Price acquisition must request both provider tickers across a dated SATS-to-ECHO transition.",
);
const stitchedAliasHistory = pointInTimeCanonicalPriceHistories(
  new Map([
    [
      "SATS",
      [
        { date: "2026-06-22", open: 40, close: 41, adjusted: true },
        { date: "2026-06-23", open: 41, close: 42, adjusted: true },
        { date: "2026-06-24", open: 1, close: 1, adjusted: true },
      ],
    ],
    [
      "ECHO",
      [
        { date: "2026-06-22", open: 999, close: 999, adjusted: true },
        { date: "2026-06-24", open: 42, close: 43, adjusted: true },
        { date: "2026-06-25", open: 43, close: 44, adjusted: true },
      ],
    ],
  ]),
).get("ECHO");
assert(
  stitchedAliasHistory.length === 4 &&
    stitchedAliasHistory[0].open === 40 &&
    stitchedAliasHistory[2].open === 42 &&
    stitchedAliasHistory.every((row) => row.symbol === "ECHO"),
  "Date-bounded alias stitching must prefer SATS before the cutover and ECHO from the cutover without duplicate member-date rows.",
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

const reconstructedNasdaq = reconstructIndexInitialMembers(
  ["KEEP", "NEW"],
  [
    {
      date: "2026-01-05",
      addedSymbol: "NEW",
      removedSymbol: "OLD",
    },
  ],
  { fromDate: "2026-01-01", throughDate: "2026-01-06" },
);
assert(
  reconstructedNasdaq.initialSymbols.join(",") === "KEEP,OLD" &&
    reconstructedNasdaq.throughSymbols.join(",") === "KEEP,NEW",
  "Reverse reconstruction must replace a later added member with the removed member at the historical anchor.",
);
const anchorBoundary = reconstructIndexInitialMembers(
  ["NEW"],
  [{ date: "2026-01-01", addedSymbol: "NEW", removedSymbol: "OLD" }],
  { fromDate: "2026-01-01", throughDate: "2026-01-06" },
);
assert(
  anchorBoundary.initialSymbols.join(",") === "OLD",
  "The reconstructed seed must remain pre-event so inclusive replay can apply an anchor-date change exactly once.",
);
assert(
  canonicalIndexMembershipChanges([
    {
      date: "2026-06-24",
      addedSymbol: "ECHO",
      removedSymbol: "SATS",
    },
  ]).length === 0,
  "A canonicalized SATS-to-ECHO ticker rename must not become an index removal and artificial liquidation.",
);
const pitDates = ["2026-01-02", "2026-01-05", "2026-01-06"];
const barsFor = (symbol, includeLast = true) =>
  pitDates.slice(0, includeLast ? 3 : 2).map((date, index) => ({
    symbol,
    date,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000,
    adjusted: true,
  }));
const nasdaqRawArgs = {
  blueprint: {
    fromDate: "2026-01-01",
    throughDate: "2026-01-06",
    privateBlueprint: {
      initialSymbols: ["KEEP", "OLD"],
      changes: [
        {
          date: "2026-01-05",
          addedSymbol: "NEW",
          removedSymbol: "OLD",
        },
      ],
      delistedDates: {},
    },
  },
  profiles: ["KEEP", "OLD", "NEW"].map((symbol) => ({
    symbol,
    companyName: symbol,
  })),
  histories: new Map(
    ["SPY", "QQQ", "KEEP", "OLD", "NEW"].map((symbol) => [
      symbol,
      barsFor(symbol),
    ]),
  ),
  fundamentals: [],
  emitUniverseRemovalActions: true,
  membershipChangesEffectiveInclusive: true,
};
const nasdaqMembershipDataset =
  pointInTimeIndexRawDatasetFromHistory(nasdaqRawArgs);
assert(
  nasdaqMembershipDataset.sessions[0].universeSymbols.join(",") ===
    "KEEP,OLD" &&
    nasdaqMembershipDataset.sessions[1].universeSymbols.join(",") ===
      "KEEP,NEW" &&
    nasdaqMembershipDataset.sessions[2].universeSymbols.join(",") ===
      "KEEP,NEW" &&
    nasdaqMembershipDataset.sessions[1].corporateActions.some(
      (action) =>
        action.type === "universe-removal" && action.symbol === "OLD",
    ) &&
    nasdaqMembershipDataset.metadata.membershipObservationCoveragePct === 100 &&
    nasdaqMembershipDataset.metadata.universeRemovalOpenCoveragePct === 100 &&
    nasdaqMembershipDataset.metadata.universeRemovalZeroRecoveryActions === 0 &&
    nasdaqMembershipDataset.metadata.universeRemovalOutcomeCoveragePct === 100 &&
    nasdaqMembershipDataset.metadata.minimumMembershipCount === 2 &&
    nasdaqMembershipDataset.metadata.maximumMembershipCount === 2,
  "A Nasdaq membership event must take effect on its declared effective session, emit a removal action, and measure actual prices.",
);
const spinoffDates = ["2026-06-26", "2026-06-29", "2026-06-30"];
const spinoffBars = (symbol, dates = spinoffDates) =>
  dates.map((date, index) => ({
    symbol,
    date,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000 + index,
    adjusted: true,
  }));
const honaSpinoffDataset = pointInTimeIndexRawDatasetFromHistory({
  blueprint: {
    fromDate: spinoffDates[0],
    throughDate: spinoffDates.at(-1),
    privateBlueprint: {
      initialSymbols: ["HON"],
      changes: [
        {
          date: "2026-06-29",
          addedSymbol: "HONA",
          removedSymbol: "",
          effectiveDateBasis: "source-verified-supplement",
        },
      ],
      delistedDates: {},
    },
  },
  profiles: [
    { symbol: "HON", listedAt: "2022-01-03" },
    { symbol: "HONA", listedAt: "2026-06-29" },
  ],
  histories: new Map([
    ["SPY", spinoffBars("SPY")],
    ["QQQ", spinoffBars("QQQ")],
    ["HON", spinoffBars("HON")],
    ["HONA", spinoffBars("HONA", spinoffDates.slice(1))],
  ]),
  fundamentals: [],
  membershipChangesEffectiveInclusive: true,
});
assert(
  pointInTimeSecuritySymbol("HON") === "HON" &&
    pointInTimeSecuritySymbol("HONA") === "HONA" &&
    honaSpinoffDataset.sessions[0].universeSymbols.join(",") === "HON" &&
    honaSpinoffDataset.sessions[1].universeSymbols.join(",") ===
      "HON,HONA" &&
    honaSpinoffDataset.metadata.activeMemberDateCoverageComplete === true &&
    honaSpinoffDataset.metadata.missingMembershipObservations === 0,
  "The verified HONA spin-off event must keep HON and HONA distinct, exclude HONA before the event, and include it on the effective session.",
);
const missingPostSpinoffBar = pointInTimeIndexRawDatasetFromHistory({
  ...{
    blueprint: {
      fromDate: spinoffDates[0],
      throughDate: spinoffDates.at(-1),
      privateBlueprint: {
        initialSymbols: ["HON"],
        changes: [
          { date: "2026-06-29", addedSymbol: "HONA", removedSymbol: "" },
        ],
        delistedDates: {},
      },
    },
    profiles: [{ symbol: "HON" }, { symbol: "HONA" }],
    fundamentals: [],
    membershipChangesEffectiveInclusive: true,
  },
  histories: new Map([
    ["SPY", spinoffBars("SPY")],
    ["QQQ", spinoffBars("QQQ")],
    ["HON", spinoffBars("HON")],
    ["HONA", spinoffBars("HONA", ["2026-06-29"])],
  ]),
});
assert(
  missingPostSpinoffBar.metadata.activeMemberDateCoverageComplete === false &&
    missingPostSpinoffBar.metadata.missingMembershipObservations === 1 &&
    missingPostSpinoffBar.metadata.missingMembershipObservationsBySymbol[0]
      ?.symbol === "HONA" &&
    missingPostSpinoffBar.metadata.missingMembershipObservationsBySymbol[0]
      ?.missing === 1,
  "A source-backed membership event must not excuse any missing HONA price after its effective session.",
);
const listingFieldCannotMaskMembershipGap =
  pointInTimeIndexRawDatasetFromHistory({
    blueprint: {
      fromDate: pitDates[0],
      throughDate: pitDates.at(-1),
      privateBlueprint: {
        initialSymbols: ["OLD"],
        changes: [],
        delistedDates: {},
      },
    },
    profiles: [{ symbol: "OLD", listedAt: pitDates[1] }],
    histories: new Map([
      ["SPY", barsFor("SPY")],
      ["QQQ", barsFor("QQQ")],
      ["OLD", barsFor("OLD").slice(1)],
    ]),
    fundamentals: [],
    membershipChangesEffectiveInclusive: true,
  });
assert(
  listingFieldCannotMaskMembershipGap.sessions[0].universeSymbols.includes(
    "OLD",
  ) &&
    listingFieldCannotMaskMembershipGap.metadata
      .activeMemberDateCoverageComplete === false &&
    listingFieldCannotMaskMembershipGap.metadata
      .missingMembershipObservationsBySymbol[0]?.symbol === "OLD",
  "A price-derived listedAt field must never remove an established member or hide a genuine provider-history gap.",
);
const changedPriceHistories = new Map(nasdaqRawArgs.histories);
changedPriceHistories.set("KEEP", [
  ...barsFor("KEEP").slice(0, 2),
  { ...barsFor("KEEP")[2], close: 999 },
]);
assert(
  pointInTimePriceInputFingerprint(nasdaqRawArgs.histories) !==
    pointInTimePriceInputFingerprint(changedPriceHistories),
  "The evidence dataset fingerprint must change when any canonical OHLCV input changes.",
);
const missingMemberPriceDataset = pointInTimeIndexRawDatasetFromHistory({
  ...nasdaqRawArgs,
  histories: new Map([
    ...["SPY", "QQQ", "KEEP", "OLD"].map((symbol) => [symbol, barsFor(symbol)]),
    ["NEW", barsFor("NEW", false)],
  ]),
});
assert(
  missingMemberPriceDataset.metadata.membershipObservationCoveragePct < 100 &&
    missingMemberPriceDataset.metadata.survivorshipBiasFree === false,
  "An active member without a member-date price bar must reduce coverage and fail the survivorship-free label.",
);
const unadjustedMemberPriceDataset = pointInTimeIndexRawDatasetFromHistory({
  ...nasdaqRawArgs,
  histories: new Map([
    ...["SPY", "QQQ", "KEEP", "OLD"].map((symbol) => [symbol, barsFor(symbol)]),
    [
      "NEW",
      barsFor("NEW").map((row, index) =>
        index === 2 ? { ...row, adjusted: false } : row,
      ),
    ],
  ]),
});
assert(
  unadjustedMemberPriceDataset.metadata.membershipObservationCoveragePct <
    100,
  "An unadjusted member-date row must not satisfy the usable price coverage gate.",
);
const roundingDates = Array.from({ length: 201 }, (_, index) =>
  new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
);
const roundingSymbols = Array.from(
  { length: 100 },
  (_, index) => `M${String(index).padStart(3, "0")}`,
);
const roundingHistories = new Map(
  ["SPY", "QQQ", ...roundingSymbols].map((symbol) => [
    symbol,
    roundingDates
      .filter(
        (_, index) =>
          !(symbol === roundingSymbols.at(-1) && index === roundingDates.length - 1),
      )
      .map((date) => ({
        symbol,
        date,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1_000,
        adjusted: true,
      })),
  ]),
);
const roundedIncompleteCoverage = pointInTimeIndexRawDatasetFromHistory({
  blueprint: {
    fromDate: roundingDates[0],
    throughDate: roundingDates.at(-1),
    privateBlueprint: {
      initialSymbols: roundingSymbols,
      changes: [],
      delistedDates: {},
    },
  },
  profiles: roundingSymbols.map((symbol) => ({ symbol })),
  histories: roundingHistories,
  fundamentals: [],
});
assert(
  roundedIncompleteCoverage.metadata.membershipObservationCoveragePct === 100 &&
    roundedIncompleteCoverage.metadata.missingMembershipObservations === 1 &&
    roundedIncompleteCoverage.metadata.activeMemberDateCoverageComplete ===
      false &&
    roundedIncompleteCoverage.metadata.survivorshipBiasFree === false,
  "A rounded 100.00% display must not hide even one missing member-date observation from the exact coverage gate.",
);
const missingProfileButPricedDataset = pointInTimeIndexRawDatasetFromHistory({
  ...nasdaqRawArgs,
  profiles: nasdaqRawArgs.profiles.filter(({ symbol }) => symbol !== "NEW"),
});
assert(
  missingProfileButPricedDataset.metadata.membershipObservationCoveragePct ===
    100,
  "A price-only member-date coverage gate must use adjusted price presence and must not require a current profile record.",
);
const delayedRemovalDates = [
  "2026-01-02",
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
];
const delayedBarsFor = (symbol, dates = delayedRemovalDates) =>
  dates.map((date, index) => ({
    symbol,
    date,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000,
    adjusted: true,
  }));
const delayedRemovalDataset = pointInTimeIndexRawDatasetFromHistory({
  ...nasdaqRawArgs,
  histories: new Map([
    ...["SPY", "QQQ", "KEEP", "NEW"].map((symbol) => [
      symbol,
      delayedBarsFor(symbol),
    ]),
    [
      "OLD",
      delayedBarsFor("OLD", ["2026-01-02", "2026-01-06", "2026-01-07"]),
    ],
  ]),
});
assert(
  delayedRemovalDataset.sessions[1].corporateActions.some(
    (action) =>
      action.type === "universe-removal" &&
      action.symbol === "OLD" &&
      action.treatment ===
        "conservative-zero-recovery-missing-removal-open-v1" &&
      action.valuePerShare === 0,
  ) &&
    !delayedRemovalDataset.sessions[2].corporateActions.some(
      (action) => action.type === "universe-removal",
    ) &&
    delayedRemovalDataset.metadata.universeRemovalOpenCoveragePct === 0 &&
    delayedRemovalDataset.metadata.universeRemovalZeroRecoveryActions === 1 &&
    delayedRemovalDataset.metadata.universeRemovalOutcomeCoveragePct === 100 &&
    delayedRemovalDataset.metadata.survivorshipBiasFree === true,
  "A missing fixed removal-session open must realize an immediate disclosed zero recovery and must never cherry-pick a favorable later quote.",
);

const fakeFingerprint = "a".repeat(64);
const candidateFingerprint = "b".repeat(64);
const experimentFingerprint = "c".repeat(64);
const developmentPlan = buildR11ShardPlan("development", ["A", "B"]);
assert(
  developmentPlan.length === 3 &&
    developmentPlan.every((job, index) => job.shard === index),
  "R11 development must expose one deterministic shard per frozen development window.",
);
const fakeR11Run = (job, seed) => {
  const dates = probeSessionDates.filter(
    (date) => date >= job.window.start && date <= job.window.end,
  );
  const curve = dates.map((date, index) => ({
    date,
    equity: 100_000 + index * (seed + 1),
    activeExposure: 0.8,
  }));
  const endingCash = curve.at(-1).equity;
  const roundTripPnl = endingCash - 100_000;
  const expectancyPct =
    Math.round((roundTripPnl / 100_000) * 100 * 100) / 100;
  const benchmarkCurves = Object.fromEntries(
    ["SPY", "QQQ"].map((symbol, symbolIndex) => [
      symbol,
      dates.map((date, index) => ({
        date,
        value: 100_000 + index * (symbolIndex + 1),
      })),
    ]),
  );
  const totalReturnPct =
    Math.round(
      (curve.at(-1).equity / curve[0].equity - 1) * 100 * 100,
    ) / 100;
  const benchmarkComparisons = Object.fromEntries(
    Object.entries(benchmarkCurves).map(([symbol, rows]) => {
      const simpleReturnPct =
        Math.round((rows.at(-1).value / rows[0].value - 1) * 100 * 100) /
        100;
      return [
        symbol,
        {
          simpleReturnPct,
          excessReturnPct:
            Math.round((totalReturnPct - simpleReturnPct) * 100) / 100,
        },
      ];
    }),
  );
  return {
    metrics: {
      totalReturnPct,
      maxDrawdownPct: 0,
      averageActiveExposurePct: 80,
      profitFactor: null,
      closedTrades: 1,
      tradeDiagnostics: { expectancyPct },
      dailyReturns: curve
        .slice(1)
        .map((row, index) => row.equity / curve[index].equity - 1),
      benchmarkComparisons,
    },
    trades: [
      {
        side: "buy",
        shares: 1,
        price: 100_000,
        positionId: 1,
      },
      {
        side: "sell",
        positionClosed: true,
        roundTripPnl,
        positionId: 1,
      },
    ],
    skippedOrders: [],
    curve,
    benchmarkCurves,
    unresolvedUniverseRemovals: [],
    curveLength: curve.length,
    endingCash,
  };
};
const shardPath = r11ShardStorePath({
  datasetFingerprint: fakeFingerprint,
  candidateSetFingerprint: candidateFingerprint,
  experimentFingerprint,
  phase: "development",
  shard: 0,
  shardCount: 3,
});
assert(
  shardPath.includes(fakeFingerprint) &&
    shardPath.includes(candidateFingerprint) &&
    shardPath.endsWith("development/window-0-of-3.json"),
  "An R11 evidence path must bind the dataset, candidate set, experiment, phase, and shard identity.",
);
const fakeShardReports = developmentPlan.map((job) => {
  const evidence = {
    phase: "development",
    shard: job.shard,
    shardCount: 3,
    window: job.window,
    candidateIds: ["A", "B"],
    results: ["A", "B"].map((candidateId) => ({
      candidateId,
      candidateFingerprint: `${candidateId === "A" ? "1" : "2"}`.repeat(64),
      run: fakeR11Run(job, job.shard + (candidateId === "A" ? 0 : 1)),
    })),
  };
  return {
    version: 13,
    researchGeneration: "R11",
    productionCandidateVersion: "V21",
    status: "complete",
    phase: "development",
    shard: job.shard,
    shardCount: 3,
    window: job.window,
    datasetFingerprint: fakeFingerprint,
    candidateSetFingerprint: candidateFingerprint,
    experimentFingerprint,
    evidence,
    resultDigest: sha256Fingerprint(JSON.stringify(evidence)),
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
  };
});
const mergedShards = mergeR11ShardReports(fakeShardReports, {
  phase: "development",
  shardCount: 3,
  candidateIds: ["A", "B"],
  windows: developmentPlan.map((job) => job.window),
  candidateFingerprints: { A: "1".repeat(64), B: "2".repeat(64) },
  datasetFingerprint: fakeFingerprint,
  candidateSetFingerprint: candidateFingerprint,
  experimentFingerprint,
  calendar: probeSessionDates,
});
assert(
  mergedShards.get("A").length === 3 &&
    mergedShards.get("B").length === 3,
  "R11 shard aggregation must cover every candidate in every window exactly once.",
);
let tamperedShardRejected = false;
try {
  mergeR11ShardReports(
    fakeShardReports.map((report, index) =>
      index === 0
        ? { ...report, candidateSetFingerprint: "d".repeat(64) }
        : report,
    ),
    {
      phase: "development",
      shardCount: 3,
      candidateIds: ["A", "B"],
      windows: developmentPlan.map((job) => job.window),
      candidateFingerprints: { A: "1".repeat(64), B: "2".repeat(64) },
      datasetFingerprint: fakeFingerprint,
      candidateSetFingerprint: candidateFingerprint,
      experimentFingerprint,
      calendar: probeSessionDates,
    },
  );
} catch {
  tamperedShardRejected = true;
}
assert(
  tamperedShardRejected,
  "A missing, duplicated, or fingerprint-mismatched R11 shard must fail closed.",
);
for (const mutate of [
  (report) => ({ ...report, window: { start: "1900-01-01", end: "1900-01-02" } }),
  (report) => ({
    ...report,
    evidence: { ...report.evidence, shard: 2 },
    resultDigest: sha256Fingerprint(
      JSON.stringify({ ...report.evidence, shard: 2 }),
    ),
  }),
  (report) => {
    const evidence = {
      ...report.evidence,
      results: report.evidence.results.map((result, index) =>
        index === 0
          ? { ...result, candidateFingerprint: "9".repeat(64) }
          : result,
      ),
    };
    return {
      ...report,
      evidence,
      resultDigest: sha256Fingerprint(JSON.stringify(evidence)),
    };
  },
  (report) => {
    const evidence = {
      ...report.evidence,
      results: report.evidence.results.map((result, index) =>
        index === 0
          ? {
              ...result,
              run: {
                ...result.run,
                metrics: {
                  ...result.run.metrics,
                  averageActiveExposurePct: 100,
                },
              },
            }
          : result,
      ),
    };
    return {
      ...report,
      evidence,
      resultDigest: sha256Fingerprint(JSON.stringify(evidence)),
    };
  },
  (report) => {
    const evidence = {
      ...report.evidence,
      results: report.evidence.results.map((result, index) => {
        if (index !== 0) return result;
        const tamperedPnl = result.run.trades[1].roundTripPnl + 10;
        return {
          ...result,
          run: {
            ...result.run,
            metrics: {
              ...result.run.metrics,
              tradeDiagnostics: {
                ...result.run.metrics.tradeDiagnostics,
                expectancyPct:
                  Math.round((tamperedPnl / 100_000) * 100 * 100) / 100,
              },
            },
            trades: result.run.trades.map((trade, tradeIndex) =>
              tradeIndex === 1
                ? { ...trade, roundTripPnl: tamperedPnl }
                : trade,
            ),
          },
        };
      }),
    };
    return {
      ...report,
      evidence,
      resultDigest: sha256Fingerprint(JSON.stringify(evidence)),
    };
  },
]) {
  let rejected = false;
  try {
    mergeR11ShardReports([mutate(fakeShardReports[0]), ...fakeShardReports.slice(1)], {
      phase: "development",
      shardCount: 3,
      candidateIds: ["A", "B"],
      windows: developmentPlan.map((job) => job.window),
      candidateFingerprints: { A: "1".repeat(64), B: "2".repeat(64) },
      datasetFingerprint: fakeFingerprint,
      candidateSetFingerprint: candidateFingerprint,
      experimentFingerprint,
      calendar: probeSessionDates,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "R11 must reject a wrong window, evidence identity, or candidate fingerprint.");
}
const allAuditChecks = {
  positiveReturn: true,
  beatsSpy: true,
  beatsQqq: true,
  positiveExpectancy: true,
  profitFactorAboveOne: true,
  positiveAlphaInAtLeastHalfOfWindows: true,
  maxDrawdownWithin25Pct: true,
  minimumClosedTrades: true,
  averageActiveExposureAtLeast70Pct: true,
};
assert(
  r11DeterministicAuditGate({
    auditChecks: allAuditChecks,
    spyStatistic: { tStatistic: 3.001 },
    qqqStatistic: { tStatistic: 3.001 },
    dataIntegrityPassed: true,
    tradeConcentration: { concentrationWarning: false },
  }) === true &&
    r11DeterministicAuditGate({
      auditChecks: allAuditChecks,
      spyStatistic: { tStatistic: 3 },
      qqqStatistic: { tStatistic: 4 },
      dataIntegrityPassed: true,
      tradeConcentration: { concentrationWarning: false },
    }) === false &&
    r11PhaseChecksPass({ positiveReturn: true }) === false &&
    r11DeterministicAuditGate({
      auditChecks: allAuditChecks,
      spyStatistic: { tStatistic: 4 },
      qqqStatistic: { tStatistic: 4 },
      dataIntegrityPassed: true,
    }) === false,
  "The R11 audit must require every explicit phase check, concentration evidence, and a statistic strictly above three against both benchmarks.",
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
            { symbol: "QQQ", open: 399, high: 401, low: 398, close: 400, volume: 900_000, adjusted: true },
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
            { symbol: "QQQ", open: 404, high: 411, low: 403, close: 410, volume: 950_000, adjusted: true },
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
    decisionRelevantPriceIntegrity.totalStoredPriceRows === 8 &&
    decisionRelevantPriceIntegrity.priceRows === 6 &&
    decisionRelevantPriceIntegrity.excludedArchivalPriceRows === 2,
  "The decision-data audit must exclude unused archival rows while retaining active prices, required lookbacks and benchmarks.",
);

const historyAuditDates = [
  "2026-01-02",
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
];
const historyAuditBar = (symbol, date, index) => {
  const offset = symbol === "SPY" ? 500 : symbol === "QQQ" ? 400 : 100;
  const close = offset + index;
  return {
    symbol,
    date,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: offset * 1_000 + index,
    adjusted: true,
  };
};
const historyAuditDataset = ({
  ipoDates = historyAuditDates.slice(1),
  signalDates = [historyAuditDates.at(-1)],
} = {}) => ({
  sessions: historyAuditDates.map((date, index) => ({
    date,
    universeSymbols: [],
    prices: [
      historyAuditBar("SPY", date, index),
      historyAuditBar("QQQ", date, index),
      ...(ipoDates.includes(date) ? [historyAuditBar("IPO", date, index)] : []),
    ],
    signals: signalDates.includes(date)
      ? [{ symbol: "IPO", listedAt: "not-a-listing-proof" }]
      : [],
    positionSignals: [],
  })),
});

const exactObservedHistory = pointInTimePriceIntegrityAudit(
  [historyAuditDataset()],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 3,
    requireExactObservedSignalHistory: true,
  },
);
assert(
  exactObservedHistory.pass === true &&
    exactObservedHistory.observedSignalHistoryRequired === true &&
    exactObservedHistory.observedSignalHistoryPass === true &&
    exactObservedHistory.shortSignalHistoryRows === 0 &&
    exactObservedHistory.requiredPriceRows === 11 &&
    exactObservedHistory.missingRequiredPriceRows === 0,
  "Nasdaq integrity must audit the exact observed input window without trusting a signal listing field.",
);

const internalObservedHistoryGap = pointInTimePriceIntegrityAudit(
  [
    historyAuditDataset({
      ipoDates: [
        historyAuditDates[0],
        historyAuditDates[2],
        historyAuditDates[3],
      ],
    }),
  ],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 3,
    requireExactObservedSignalHistory: true,
  },
);
const internalGapBySymbol =
  internalObservedHistoryGap.missingRequiredPriceRowsBySymbol.find(
    (row) => row.symbol === "IPO",
  );
assert(
  internalObservedHistoryGap.pass === false &&
    internalObservedHistoryGap.missingRequiredPriceRows === 1 &&
    internalObservedHistoryGap.missingRequiredAttributionComplete === true &&
    internalGapBySymbol?.total === 1 &&
    internalGapBySymbol?.signalLookback === 1,
  "An internal calendar gap inside the 253 observed inputs must remain visible and fail integrity.",
);

const shortObservedHistory = pointInTimePriceIntegrityAudit(
  [historyAuditDataset({ ipoDates: historyAuditDates.slice(2) })],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 3,
    requireExactObservedSignalHistory: true,
  },
);
assert(
  shortObservedHistory.pass === false &&
    shortObservedHistory.observedSignalHistoryPass === false &&
    shortObservedHistory.shortSignalHistoryRows === 1 &&
    shortObservedHistory.shortSignalHistorySamples[0]?.observedRows === 2,
  "A Nasdaq signal with fewer than the contract's observed input rows must fail closed.",
);

const crossChunkObservedHistory = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: historyAuditDates.slice(0, 2).map((date, index) => ({
        date,
        universeSymbols: [],
        prices: [
          historyAuditBar("SPY", date, index),
          historyAuditBar("QQQ", date, index),
          ...(index === 1 ? [historyAuditBar("IPO", date, index)] : []),
        ],
        signals: [],
        positionSignals: [],
      })),
    },
    {
      sessions: historyAuditDates.slice(2).map((date, localIndex) => {
        const index = localIndex + 2;
        return {
          date,
          universeSymbols: [],
          prices: [
            historyAuditBar("SPY", date, index),
            historyAuditBar("QQQ", date, index),
            historyAuditBar("IPO", date, index),
          ],
          signals: index === 3 ? [{ symbol: "IPO" }] : [],
          positionSignals: [],
        };
      }),
    },
  ],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 3,
    requireExactObservedSignalHistory: true,
  },
);
assert(
  crossChunkObservedHistory.pass === true &&
    crossChunkObservedHistory.requiredPriceRows === 11 &&
    crossChunkObservedHistory.missingRequiredPriceRows === 0,
  "Exact observed-history requirements must preserve one global window across durable chunk boundaries.",
);

const exactLookbackDates = Array.from({ length: 254 }, (_, index) =>
  new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
);
const exact253RowLookback = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: exactLookbackDates.map((date, index) => ({
        date,
        universeSymbols: [],
        prices: [
          historyAuditBar("SPY", date, index),
          historyAuditBar("QQQ", date, index),
          ...(index > 0 ? [historyAuditBar("IPO", date, index)] : []),
        ],
        signals:
          index === exactLookbackDates.length - 1
            ? [{ symbol: "IPO" }]
            : [],
        positionSignals: [],
      })),
    },
  ],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 253,
    requireExactObservedSignalHistory: true,
  },
);
assert(
  exact253RowLookback.pass === true &&
    exact253RowLookback.requiredPriceRows === 254 * 2 + 253 &&
    exact253RowLookback.missingRequiredPriceRows === 0,
  "The Nasdaq contract must mean the current signal row plus exactly 252 prior observed rows.",
);

const legacyLookbackIsolation = pointInTimePriceIntegrityAudit(
  [historyAuditDataset({ ipoDates: historyAuditDates })],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  legacyLookbackIsolation.pass === true &&
    legacyLookbackIsolation.observedSignalHistoryRequired === false &&
    legacyLookbackIsolation.requiredPriceRows === 10,
  "The shared S&P path must retain its legacy current-plus-one-prior-session semantics.",
);

const activeMemberGapStillFails = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-05",
          universeSymbols: ["ACTIVE"],
          prices: [
            historyAuditBar("SPY", "2026-01-05", 0),
            historyAuditBar("QQQ", "2026-01-05", 0),
          ],
          signals: [],
          positionSignals: [],
        },
      ],
    },
  ],
  {
    decisionRelevantOnly: true,
    lookbackSessions: 253,
    requireExactObservedSignalHistory: true,
  },
);
const activeGapBySymbol =
  activeMemberGapStillFails.missingRequiredPriceRowsBySymbol.find(
    (row) => row.symbol === "ACTIVE",
  );
assert(
  activeMemberGapStillFails.pass === false &&
    activeMemberGapStillFails.missingRequiredAttributionComplete === true &&
    activeGapBySymbol?.total === 1 &&
    activeGapBySymbol?.activeOrExecution === 1 &&
    activeGapBySymbol?.signalLookback === 0 &&
    activeGapBySymbol?.benchmark === 0,
  "An observed-history window must never excuse a missing same-session active-member or mandatory execution price.",
);

const missingRequiredPriceIntegrity = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-02",
          universeSymbols: ["AAA", "BBB"],
          prices: [
            { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
            { symbol: "SPY", open: 499, high: 501, low: 498, close: 500, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }],
        },
      ],
    },
  ],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  missingRequiredPriceIntegrity.pass === false &&
    missingRequiredPriceIntegrity.missingRequiredPriceRows === 2 &&
    missingRequiredPriceIntegrity.missingRequiredPriceSamples.some(
      (row) => row.symbol === "BBB" && row.active === true,
    ) &&
    missingRequiredPriceIntegrity.missingRequiredPriceSamples.some(
      (row) => row.symbol === "QQQ",
    ),
  "The integrity audit must fail when an active universe member or full-period benchmark row is absent, even if no stored row itself is malformed.",
);
const removalExecutionIntegrity = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-02",
          prices: [
            { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
            { symbol: "SPY", open: 499, high: 501, low: 498, close: 500, adjusted: true },
            { symbol: "QQQ", open: 399, high: 401, low: 398, close: 400, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }],
        },
        {
          date: "2026-01-05",
          prices: [
            { symbol: "AAA", open: 50, high: 52, low: 49, close: 51, adjusted: false },
            { symbol: "SPY", open: 504, high: 511, low: 503, close: 510, adjusted: true },
            { symbol: "QQQ", open: 404, high: 411, low: 403, close: 410, adjusted: true },
          ],
          signals: [],
          corporateActions: [{ symbol: "AAA", type: "universe-removal" }],
        },
      ],
    },
  ],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  removalExecutionIntegrity.pass === false &&
    removalExecutionIntegrity.adjustedCoveragePct < 100,
  "The removal-session open used for liquidation must remain inside the adjusted-price integrity audit after its signal disappears.",
);
const zeroRecoveryRemovalIntegrity = pointInTimePriceIntegrityAudit(
  [
    {
      sessions: [
        {
          date: "2026-01-02",
          universeSymbols: ["AAA"],
          prices: [
            { symbol: "AAA", open: 99, high: 101, low: 98, close: 100, adjusted: true },
            { symbol: "SPY", open: 499, high: 501, low: 498, close: 500, adjusted: true },
            { symbol: "QQQ", open: 399, high: 401, low: 398, close: 400, adjusted: true },
          ],
          signals: [{ symbol: "AAA" }],
        },
        {
          date: "2026-01-05",
          universeSymbols: [],
          prices: [
            { symbol: "SPY", open: 504, high: 511, low: 503, close: 510, adjusted: true },
            { symbol: "QQQ", open: 404, high: 411, low: 403, close: 410, adjusted: true },
          ],
          signals: [],
          corporateActions: [
            {
              symbol: "AAA",
              type: "universe-removal",
              treatment:
                "conservative-zero-recovery-missing-removal-open-v1",
              valuePerShare: 0,
            },
          ],
        },
      ],
    },
  ],
  { decisionRelevantOnly: true, lookbackSessions: 1 },
);
assert(
  zeroRecoveryRemovalIntegrity.pass === true &&
    zeroRecoveryRemovalIntegrity.missingRequiredPriceRows === 0,
  "An explicit zero-recovery removal outcome must not fabricate or require a nonexistent execution bar.",
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
const pitAlphaR10Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-earnings-drift-r10.js",
  "utf8",
);
const pitAlphaR14Endpoint = fs.readFileSync(
  "pages/api/research/pit-sp500-alpha-sec-filing-r14.js",
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
    !alphaCreatorEndpoint.includes("runPointInTimeSp500AlphaEarningsDriftR10") &&
    alphaCreatorEndpoint.includes('req.query.legacy || ""') &&
    alphaCreatorEndpoint.includes("await getAlphaCreatorSearch()") &&
    !alphaCreatorEndpoint.includes("runAlphaCreatorSearch") &&
    alphaCreatorEndpoint.includes('authority: "point-in-time-sp500-research"') &&
    alphaCreatorEndpoint.includes('authority: "legacy-current-survivor-diagnostic"') &&
    alphaCreatorEndpoint.includes("pit-sp500-alpha-sec-filing-r14") &&
    alphaCreatorEndpoint.includes("maxDuration: 800"),
  "The public alpha-creator endpoint must be read-only R14 status and quarantine the current-survivor search behind an explicitly labelled legacy diagnostic.",
);
assert(
  pitAlphaR14Endpoint.includes("getPointInTimeSp500AlphaFilingR14") &&
    pitAlphaR14Endpoint.includes("runPointInTimeSp500AlphaFilingR14") &&
    pitAlphaR14Endpoint.includes("rejectUnauthorizedResearchMutation") &&
    pitAlphaR14Endpoint.includes('req.method === "POST"') &&
    pitAlphaR14Endpoint.includes("productionChanged: false") &&
    pitAlphaR14Endpoint.includes("eligibleForAlphaClaim: false") &&
    pitAlphaR14Endpoint.includes("eligibleForLiveCapital: false") &&
    cron.includes("preparePointInTimeSp500SecFilingR14()") &&
    cron.includes("runPointInTimeSp500AlphaFilingR14()"),
  "R14 must expose read-only status, require authentication for mutation, remain research-only, and advance through cron.",
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
  pitAlphaR10Endpoint.includes(
    "await getPointInTimeSp500AlphaEarningsDriftR10()",
  ) &&
    pitAlphaR10Endpoint.includes(
      "await runPointInTimeSp500AlphaEarningsDriftR10({",
    ) &&
    pitAlphaR10Endpoint.includes('productionCandidateVersion: "V20"') &&
    cron.includes("await runPointInTimeSp500AlphaEarningsDriftR10()") &&
    rawSource.includes("pointInTimeSp500AlphaR10EarningsDriftDefinitions") &&
    rawSource.includes('"earnings"') &&
    rawSource.includes("coveragePct < 80") &&
    rawSource.includes("firstCalendarIndexAfter") &&
    walkForwardSource.includes('researchRankMode === "post-earnings-drift"') &&
    walkForwardSource.includes("requireEarningsSurpriseFactors"),
  "R10 must test next-session-available earnings surprise and post-announcement drift in one nested batch after R9.",
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
