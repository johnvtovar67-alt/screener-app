Warning: truncated output (original token count: 192962)
Total output lines: 20542

// Bounded, durable FMP research diagnostic.
//
// This is intentionally separate from the strict point-in-time research runner.
// It replays real historical prices and filing-availability timestamps for a
// diversified current cohort, but it cannot honestly certify survivorship-free
// membership, revision-safe statement values or as-known material-news history.
// The report therefore stays "provisional" and can never authorize live capital.

import { get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { getFullMarketDiscovery } from "./fullMarketDiscovery";
import { compilePointInTimeSignals } from "./historicalSignalEvaluator";
import { portfolioDecision } from "./expertDecision";
import {
  capitalAllowance,
  capitalSignalEligible,
  portfolioContributionGate,
  portfolioRiskSnapshot,
  swingTimeReview,
} from "./portfolioGovernor";
import { reunderwriteExistingPosition } from "./positionReunderwrite";
import { recordWinnerTrim, winnerTrimGate } from "./winnerLifecycle";
import { compactReplaySession } from "./replayDatasetCompaction";
import {
  isUsMarketSessionDay,
  latestCompletedMarketSessionDay,
} from "./marketSession";
import {
  simulatePointInTimePortfolio,
  slicePointInTimePortfolioRun,
} from "./walkForwardBacktest";
import {
  V12_DEVELOPMENT_PLACEBO_SEEDS,
  V12_EVIDENCE_REQUIREMENTS,
  V12_THESIS_ID,
  v12AuditControlDefinitions,
  v12StrategyOptions,
} from "./v12ResearchContract";
import { v11StrategyOptions } from "./v11ResearchContract";
import {
  addFilingEventsToDataset,
  buildPointInTimeFilingEvents,
  compactSecCompanyFacts,
  pointInTimeSecFilingR14Controls,
  pointInTimeSecFilingR14Definitions,
} from "./secFilingResearch";
import {
  pointInTimeMomentumSpineR15Controls,
  pointInTimeMomentumSpineR15Definitions,
} from "./momentumSpineResearch";
import {
  pointInTimeNasdaqRunnerControls,
  pointInTimeNasdaqRunnerDefinitions,
} from "./nasdaqRunnerResearch";
import {
  pointInTimeNasdaqConcentratedRunnerControls,
  pointInTimeNasdaqConcentratedRunnerDefinitions,
} from "./nasdaqConcentratedRunnerResearch";
import {
  pointInTimeNasdaqContinuousRunnerControls,
  pointInTimeNasdaqContinuousRunnerDefinitions,
} from "./nasdaqContinuousRunnerResearch";
import {
  pointInTimeNasdaqAdaptiveRunnerControls,
  pointInTimeNasdaqAdaptiveRunnerDefinitions,
} from "./nasdaqAdaptiveRunnerResearch";
import {
  pointInTimeNasdaqAdaptiveReplacementControls,
  pointInTimeNasdaqAdaptiveReplacementDefinitions,
} from "./nasdaqAdaptiveReplacementResearch";

export const FMP_RESEARCH_REPORT_STORE =
  "research/fmp-provisional-backtest-v1.json";
const FMP_RESEARCH_PRICE_CHECKPOINT_STORE =
  "research/fmp-provisional-price-checkpoint-v1.json";
const FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE =
  "research/fmp-provisional-statement-checkpoint-v1.json";
const FMP_RESEARCH_COMPILED_CHECKPOINT_STORE =
  "research/fmp-provisional-compiled-checkpoint-v1.json";
const FMP_RESEARCH_COMPILED_CHUNK_PREFIX =
  "research/fmp-provisional-compiled-v4";
const FMP_RESEARCH_REPLAY_CHECKPOINT_STORE =
  "research/fmp-provisional-replay-checkpoint-v1.json";
const V11_REVIEW_EXPERIMENT_STORE =
  "research/v11-bounded-review-experiment-v1.json";
const V11_STRESS_TEST_STORE = "research/v11-broad-stress-test-v1.json";
const V11_FORWARD_EXTENSION_STORE =
  "research/v11-forward-extension-2026-09-01-v1.json";
const QUALITY_CONFIRMED_HISTORICAL_STORE =
  "research/quality-confirmed-historical-audit-v1.json";
const FACTOR_LEADERSHIP_AUDIT_STORE =
  "research/factor-leadership-audit-v1.json";
const PRICE_PATTERN_MODEL_SEARCH_STORE =
  "research/price-pattern-model-search-v1.json";
const ALPHA_CREATOR_SEARCH_STORE =
  "research/alpha-creator-search-v1.json";
const ALPHA_PROSPECTIVE_CHALLENGER_STORE =
  "research/alpha-prospective-challenger-v1.json";
const ALPHA_REGIME_MAP_STORE = "research/alpha-regime-map-v1.json";
const RESEARCH_DATA_CAPABILITY_STORE =
  "research/fmp-data-capability-audit-v1.json";
const POINT_IN_TIME_SP500_UNIVERSE_STORE =
  "research/pit-sp500-universe-v1.json";
const POINT_IN_TIME_SP500_DATASET_STATUS_STORE =
  "research/pit-sp500-dataset-status-v1.json";
const POINT_IN_TIME_SP500_PRICE_CHECKPOINT_STORE =
  "research/pit-sp500-price-checkpoint-v1.json";
const POINT_IN_TIME_SP500_STATEMENT_CHECKPOINT_STORE =
  "research/pit-sp500-statement-checkpoint-v1.json";
const POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE =
  "research/pit-sp500-compiled-checkpoint-v1.json";
const POINT_IN_TIME_SP500_COMPILED_CHUNK_PREFIX =
  "research/pit-sp500-compiled-v1";
const POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE =
  "research/pit-sp500-alpha-creator-v1.json";
const POINT_IN_TIME_SP500_ALPHA_CREATOR_REPORT_VERSION = 1;
const POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_V2_STORE =
  "research/pit-sp500-alpha-creator-v2.json";
const POINT_IN_TIME_SP500_ALPHA_V2_REPORT_VERSION = 2;
const POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_R3_STORE =
  "research/pit-sp500-alpha-research-r3.json";
const POINT_IN_TIME_SP500_ALPHA_R3_REPORT_VERSION = 3;
const POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_R4_STORE =
  "research/pit-sp500-alpha-research-r4.json";
const POINT_IN_TIME_SP500_ALPHA_R4_REPORT_VERSION = 4;
const POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_RESEARCH_GENERATIONS = 3;
const POINT_IN_TIME_SP500_ALPHA_R4_RESEARCH_GENERATIONS = 4;
const POINT_IN_TIME_SP500_ALPHA_R5_STORE =
  "research/pit-sp500-alpha-research-r5.json";
const POINT_IN_TIME_SP500_ALPHA_R5_REPORT_VERSION = 5;
const POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_R5_RESEARCH_GENERATIONS = 5;
const POINT_IN_TIME_SP500_ALPHA_R6_STORE =
  "research/pit-sp500-alpha-research-r6.json";
const POINT_IN_TIME_SP500_ALPHA_R6_REPORT_VERSION = 6;
const POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_R6_RESEARCH_GENERATIONS = 6;
const POINT_IN_TIME_SP500_ALPHA_R7_STORE =
  "research/pit-sp500-alpha-research-r7.json";
const POINT_IN_TIME_SP500_ALPHA_R7_REPORT_VERSION = 7;
const POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS = 100;
const POINT_IN_TIME_SP500_ALPHA_R7_RESEARCH_GENERATIONS = 7;
const POINT_IN_TIME_SP500_ALPHA_R8_STORE =
  "research/pit-sp500-alpha-batch-r8.json";
const POINT_IN_TIME_SP500_ALPHA_R8_REPORT_VERSION = 8;
const POINT_IN_TIME_SP500_ALPHA_R8_STRICT_PLACEBO_SEEDS = 1_000;
const POINT_IN_TIME_SP500_ALPHA_R8_RESEARCH_GENERATIONS = 8;
const POINT_IN_TIME_SP500_ALPHA_R9_STORE =
  "research/pit-sp500-alpha-sizing-r9.json";
const POINT_IN_TIME_SP500_ALPHA_R9_REPORT_VERSION = 9;
const POINT_IN_TIME_SP500_ALPHA_R9_STRICT_PLACEBO_SEEDS = 1_000;
const POINT_IN_TIME_SP500_ALPHA_R9_RESEARCH_GENERATIONS = 9;
const POINT_IN_TIME_SP500_EARNINGS_SURPRISE_STORE =
  "research/pit-sp500-earnings-surprises-r10.json";
const POINT_IN_TIME_NASDAQ_EARNINGS_SURPRISE_STORE =
  "research/pit-nasdaq-earnings-surprises-r13.json";
const POINT_IN_TIME_SP500_ALPHA_R10_STORE =
  "research/pit-sp500-alpha-earnings-drift-r10.json";
const POINT_IN_TIME_SP500_ALPHA_R10_REPORT_VERSION = 10;
const POINT_IN_TIME_SP500_ALPHA_R10_STRICT_PLACEBO_SEEDS = 1_000;
const POINT_IN_TIME_SP500_ALPHA_R10_RESEARCH_GENERATIONS = 10;
const POINT_IN_TIME_SP500_SEC_R14_FACTS_STORE =
  "research/pit-sp500-sec-filing-facts-r14.json";
const POINT_IN_TIME_SP500_ALPHA_R14_STORE =
  "research/pit-sp500-alpha-sec-filing-r14.json";
const POINT_IN_TIME_SP500_ALPHA_R14_REPORT_VERSION = 14;
const POINT_IN_TIME_SP500_ALPHA_R14_RESEARCH_GENERATIONS = 14;
const POINT_IN_TIME_SP500_ALPHA_R14_STRICT_PLACEBO_SEEDS = 1_000;
const POINT_IN_TIME_SP500_ALPHA_R14_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R14_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R14_EXECUTION_CONTRACT =
  "sec-filing-inflection-next-open-dual-benchmark-v1";
const POINT_IN_TIME_SP500_MOMENTUM_R15_STORE =
  "research/pit-sp500-momentum-spine-r15-r19.json";
const POINT_IN_TIME_SP500_MOMENTUM_R15_WORKER_PREFIX =
  "research/pit-sp500-momentum-spine-r15-r19";
const POINT_IN_TIME_SP500_MOMENTUM_R15_REPORT_VERSION = 15;
const POINT_IN_TIME_SP500_MOMENTUM_R15_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_SP500_MOMENTUM_R15_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_SP500_MOMENTUM_R15_EXECUTION_CONTRACT =
  "parallel-momentum-spine-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_RUNNER_R20_STORE =
  "research/pit-nasdaq-runner-r20-r24.json";
const POINT_IN_TIME_NASDAQ_RUNNER_R20_WORKER_PREFIX =
  "research/pit-nasdaq-runner-r20-r24";
const POINT_IN_TIME_NASDAQ_RUNNER_R20_REPORT_VERSION = 20;
const POINT_IN_TIME_NASDAQ_RUNNER_R20_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RUNNER_R20_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_NASDAQ_RUNNER_R20_EXECUTION_CONTRACT =
  "parallel-nasdaq-runner-retention-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_RUNNER_R25_STORE =
  "research/pit-nasdaq-concentrated-runner-r25-r29.json";
const POINT_IN_TIME_NASDAQ_RUNNER_R25_WORKER_PREFIX =
  "research/pit-nasdaq-concentrated-runner-r25-r29";
const POINT_IN_TIME_NASDAQ_RUNNER_R25_REPORT_VERSION = 25;
const POINT_IN_TIME_NASDAQ_RUNNER_R25_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RUNNER_R25_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_NASDAQ_RUNNER_R25_EXECUTION_CONTRACT =
  "parallel-nasdaq-concentrated-runner-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_RUNNER_R30_STORE =
  "research/pit-nasdaq-continuous-runner-r30-r34.json";
const POINT_IN_TIME_NASDAQ_RUNNER_R30_WORKER_PREFIX =
  "research/pit-nasdaq-continuous-runner-r30-r34";
const POINT_IN_TIME_NASDAQ_RUNNER_R30_REPORT_VERSION = 30;
const POINT_IN_TIME_NASDAQ_RUNNER_R30_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RUNNER_R30_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_NASDAQ_RUNNER_R30_EXECUTION_CONTRACT =
  "parallel-continuous-lifecycle-nasdaq-runner-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_RUNNER_R35_STORE =
  "research/pit-nasdaq-adaptive-runner-r35-r39.json";
const POINT_IN_TIME_NASDAQ_RUNNER_R35_WORKER_PREFIX =
  "research/pit-nasdaq-adaptive-runner-r35-r39";
const POINT_IN_TIME_NASDAQ_RUNNER_R35_REPORT_VERSION = 35;
const POINT_IN_TIME_NASDAQ_RUNNER_R35_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RUNNER_R35_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_NASDAQ_RUNNER_R35_EXECUTION_CONTRACT =
  "parallel-breadth-adaptive-nasdaq-runner-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_RUNNER_R40_STORE =
  "research/pit-nasdaq-adaptive-replacement-r40-r44.json";
const POINT_IN_TIME_NASDAQ_RUNNER_R40_WORKER_PREFIX =
  "research/pit-nasdaq-adaptive-replacement-r40-r44";
const POINT_IN_TIME_NASDAQ_RUNNER_R40_REPORT_VERSION = 40;
const POINT_IN_TIME_NASDAQ_RUNNER_R40_FROZEN_DATE = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RUNNER_R40_PROSPECTIVE_START = "2026-09-08";
const POINT_IN_TIME_NASDAQ_RUNNER_R40_EXECUTION_CONTRACT =
  "parallel-adaptive-rank-replacement-next-open-dual-benchmark-v1";
const POINT_IN_TIME_NASDAQ_UNIVERSE_STORE =
  "research/pit-nasdaq-index-universe-v1.json";
const POINT_IN_TIME_NASDAQ_DATASET_STATUS_STORE =
  "research/pit-nasdaq-index-dataset-status-v1.json";
const POINT_IN_TIME_NASDAQ_PRICE_CHECKPOINT_STORE =
  "research/pit-nasdaq-index-price-checkpoint-v1.json";
const POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE =
  "research/pit-nasdaq-index-compiled-checkpoint-v1.json";
const POINT_IN_TIME_NASDAQ_COMPILED_CHUNK_PREFIX =
  "research/pit-nasdaq-index-compiled-v1";
const POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_STORE =
  "research/pit-nasdaq-index-price-integrity-v1.json";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_STORE =
  "research/pit-nasdaq-alpha-parallel-r13.json";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_PREFIX =
  "research/pit-nasdaq-alpha-parallel-r13";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_REPORT_VERSION = 13;
const POINT_IN_TIME_NASDAQ_ALPHA_R11_RESEARCH_GENERATIONS = 13;
const POINT_IN_TIME_NASDAQ_ALPHA_R11_STRICT_PLACEBO_SEEDS = 1_000;
const POINT_IN_TIME_NASDAQ_ALPHA_R11_EXECUTION_CONTRACT =
  "nasdaq-r13-event-drift-simulator-gates-statistics-v1";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_FINAL_REPORT_CONTRACT =
  "nasdaq-r13-final-report-evidence-v1";
const POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_REPORT_VERSION = 2;
const POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_CONTRACT =
  "observed-history-exact-253-row-requirements-v3";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_PHASE_CHECK_KEYS = Object.freeze([
  "positiveReturn",
  "beatsSpy",
  "beatsQqq",
  "positiveExpectancy",
  "profitFactorAboveOne",
  "positiveAlphaInAtLeastHalfOfWindows",
  "maxDrawdownWithin25Pct",
  "minimumClosedTrades",
  "averageActiveExposureAtLeast70Pct",
]);
const POINT_IN_TIME_NASDAQ_ALPHA_R11_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_NASDAQ_ALPHA_R11_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_NASDAQ_RESEARCH_FROM = "2022-01-01";
const POINT_IN_TIME_NASDAQ_FIRST_SESSION = "2022-01-03";
const POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH = "2026-09-01";
const POINT_IN_TIME_NASDAQ_SPECIAL_MARKET_CLOSURES = Object.freeze([
  // National day of mourning for President Jimmy Carter.
  "2025-01-09",
]);
const POINT_IN_TIME_NASDAQ_UNIVERSE_CONTRACT =
  "date-added-effective-inclusive-corporate-action-v5";
const POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT =
  "source-verified-nasdaq-spinoff-addition-v3";
const POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT =
  "source-verified-provider-effective-dates-v3";
// Complete only source-verifiable spin-off lifecycle events that FMP omits.
// HONA is present in FMP's current Nasdaq anchor without a historical addition.
const POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENTS = Object.freeze([
  Object.freeze({
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
    sources: Object.freeze([
      "https://indexes.nasdaq.com/docs/Methodology_NDX.pdf",
      "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-399",
    ]),
  }),
]);
// Correct only exact, source-anchored provider events whose supplied date is
// not the first effective membership session. Acquired shares can stop trading
// before a later replacement, while FMP can date spin-off removals before
// Nasdaq's first start-of-day weighting date without the security.
const POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTIONS = Object.freeze([
  Object.freeze({
    id: "xlnx-amd-close-2022-02-14",
    date: "2022-02-14",
    effectiveDate: "2022-02-14",
    announcementDate: "2022-02-10",
    addedSymbol: "",
    removedSymbol: "XLNX",
    removedSecurity: "Xilinx, Inc.",
    providerEventDate: "2022-02-22",
    providerPairedAddedSymbol: "AZN",
    reason:
      "AMD merger closed before the market open; XLNX was halted and no longer tradable before its later index replacement",
    provenance:
      "Nasdaq Corporate Action ECA2022-23 and Nasdaq's AZN replacement notice",
    sources: Object.freeze([
      "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2022-23",
      "https://www.nasdaq.com/press-release/astrazeneca-plc-adr-to-join-the-nasdaq-100-index-beginning-february-22-2022-2022-02",
    ]),
  }),
  Object.freeze({
    id: "anss-snps-close-2025-07-17",
    date: "2025-07-17",
    effectiveDate: "2025-07-17",
    announcementDate: "2025-07-15",
    addedSymbol: "",
    removedSymbol: "ANSS",
    removedSecurity: "ANSYS, Inc.",
    providerEventDate: "2025-07-28",
    providerPairedAddedSymbol: "TRI",
    reason:
      "Synopsys merger closed before the market open; ANSS was halted and no longer tradable before its later index replacement",
    provenance:
      "Nasdaq Corporate Action ECA2025-373 and Nasdaq's TRI replacement notice",
    sources: Object.freeze([
      "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-373",
      "https://ir.nasdaq.com/news-releases/news-release-details/thomson-reuters-corp-join-nasdaq-100-indexr-beginning-july-28",
    ]),
  }),
  Object.freeze({
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
    sources: Object.freeze([
      "https://www.nasdaq.com/articles/global-indexes/2025-nasdaq-100-reconstitution-and-performance-highlights",
      "https://indexes.nasdaqomx.com/Index/Weighting/NDX",
    ]),
  }),
  Object.freeze({
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
    sources: Object.freeze([
      "https://indexes.nasdaq.com/docs/Methodology_NDX.pdf",
      "https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2025-683",
      "https://indexes.nasdaqomx.com/Index/Weighting/NDX",
    ]),
  }),
]);
const POINT_IN_TIME_NASDAQ_COMPILE_SESSIONS_PER_RUN = 200;
const POINT_IN_TIME_NASDAQ_COMPILER_CONTRACT =
  "historical-signal-evaluator-v11-nasdaq-membership-removal-history-v4";
const POINT_IN_TIME_NASDAQ_REMOVAL_POLICY =
  "effective-session-adjusted-open-else-conservative-zero-v2";
const POINT_IN_TIME_NASDAQ_PRICE_ALIAS_CONTRACT =
  "date-bounded-provider-alias-stitch-v1";
const POINT_IN_TIME_NASDAQ_PRICE_ACQUISITION_CONTRACT =
  "membership-bound-full-symbol-refresh-v2";
const POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE =
  "research/pit-sp500-alpha-creator-v2-integrity.json";
const POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION = 5;
// Research datasets use one permanent security identifier across ticker
// changes. EchoStar changed its Nasdaq ticker from SATS to ECHO on 2026-06-24;
// treating both vendor aliases as separate members can double-count one issuer.
const POINT_IN_TIME_SECURITY_ALIASES = Object.freeze({ SATS: "ECHO" });
const POINT_IN_TIME_SECURITY_ALIAS_TRANSITIONS = Object.freeze([
  Object.freeze({
    previousSymbol: "SATS",
    currentSymbol: "ECHO",
    canonicalSymbol: "ECHO",
    effectiveDate: "2026-06-24",
  }),
]);
const POINT_IN_TIME_SECURITY_IDENTITY_CONTRACT =
  "canonical-current-ticker-v1";
const POINT_IN_TIME_SP500_COMPILER_CONTRACT =
  "historical-signal-evaluator-v10-explicit-membership-anchored-gradual-path-v2";
// These boundaries and the candidate family below are intentionally explicit.
// They were frozen in source before the first membership-filtered execution.
const POINT_IN_TIME_SP500_ALPHA_WINDOWS = Object.freeze({
  development: Object.freeze([
    Object.freeze({ start: "2023-01-04", end: "2023-07-06" }),
    Object.freeze({ start: "2023-07-07", end: "2024-01-04" }),
    Object.freeze({ start: "2024-01-05", end: "2024-07-08" }),
  ]),
  validation: Object.freeze([
    Object.freeze({ start: "2024-07-09", end: "2025-01-06" }),
    Object.freeze({ start: "2025-01-07", end: "2025-07-10" }),
  ]),
  historicalAudit: Object.freeze([
    Object.freeze({ start: "2025-07-11", end: "2026-01-08" }),
    Object.freeze({ start: "2026-01-09", end: "2026-07-13" }),
  ]),
  forwardDiagnostic: Object.freeze([
    Object.freeze({ start: "2026-07-14", end: "2026-09-01" }),
  ]),
});
// V2 was specified on 2026-09-02 after V1 had failed. Every session through
// 2026-09-01 is therefore contaminated historical development evidence. The
// unchanged V2 thesis may begin a genuinely prospective paper ledger no earlier
// than the 2026-09-03 session, and only if every historical screen below passes.
const POINT_IN_TIME_SP500_ALPHA_V2_FROZEN_DATE = "2026-09-02";
const POINT_IN_TIME_SP500_ALPHA_V2_PROSPECTIVE_START = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_V2_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R3_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R3_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R3_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R4_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R4_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R4_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R5_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R5_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R5_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R6_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R6_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R6_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R7_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R7_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R7_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R8_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R8_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R8_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R9_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R9_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R9_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const POINT_IN_TIME_SP500_ALPHA_R10_FROZEN_DATE = "2026-09-03";
const POINT_IN_TIME_SP500_ALPHA_R10_PROSPECTIVE_START = "2026-09-04";
const POINT_IN_TIME_SP500_ALPHA_R10_WINDOWS = POINT_IN_TIME_SP500_ALPHA_WINDOWS;
const ALPHA_REGIME_MAP_REPORT_VERSION = 4;
const ALPHA_CREATOR_REPORT_VERSION = 5;
const ALPHA_CREATOR_DEVELOPMENT_WINDOWS = Object.freeze([
  Object.freeze({ start: "2025-01-07", end: "2025-07-10" }),
  Object.freeze({ start: "2025-07-11", end: "2026-01-08" }),
]);
const ALPHA_CREATOR_SEALED_HISTORICAL_WINDOW = Object.freeze({
  start: "2026-01-09",
  end: "2026-07-13",
});
const ALPHA_PROSPECTIVE_START = "2026-09-02";
const V11_FORWARD_EXTENSION_REPORT_VERSION = 5;
export const V11_FORWARD_EXTENSION_START = "2026-07-14";
export const V11_FORWARD_EXTENSION_TARGET = "2026-09-01";
const REPORT_VERSION = 12;
const COMPILED_CHECKPOINT_SCHEMA = 3;
const COMPILE_SESSIONS_PER_RUN = 20;
const FORWARD_REFRESH_COMPILE_SESSIONS_PER_RUN = 200;
const POINT_IN_TIME_SP500_COMPILE_SESSIONS_PER_RUN = 50;
const POINT_IN_TIME_SP500_COMPILATION_CLAIM_TTL_MS = 3 * 60 * 1000;
const REPLAY_CHECKPOINT_SCHEMA = 11;
// A fold is exactly train + validation + audit. Processing all three together
// removes an artificial hourly delay while retaining a durable checkpoint after
// every independently interpretable fold.
const REPLAY_WINDOWS_PER_RUN = 3;
const REPLAY_WARMUP_SESSIONS = 2;
const V12_ACTIVE_THESIS_COUNT = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RUNNING_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const PRICE_HISTORY_SOURCE = "historical-price-eod/dividend-adjusted";
const PRICE_ACQUISITION_SCHEMA = 3;
const PRICE_HISTORY_CONTRACTS = [
  {
    id: "fmp-dividend-adjusted-v1",
    path: PRICE_HISTORY_SOURCE,
    sourceAdjusted: true,
    adjustmentMethod: "provider-dividend-adjusted-ohlc",
  },
  {
    id: "fmp-full-adjclose-v1",
    path: "historical-price-eod/full",
    sourceAdjusted: false,
    adjustmentMethod: "adjClose-ratio-applied-to-ohlc",
  },
];
// FMP documents a five-request concurrency ceiling. Start requests globally at
// a deliberately slower cadence as well so large-history responses cannot form
// a burst at the next endpoint boundary.
const REQUEST_START_SPACING_MS = 300;
const PRICE_HISTORY_CONCURRENCY = 3;
const PRICE_SYMBOLS_PER_RUN = 75;
const STATEMENT_SYMBOLS_PER_RUN = 24;
const DEFAULT_SYMBOL_LIMIT = 250;
const MAX_SYMBOL_LIMIT = 500;
const STOP_EXIT_REASONS = new Set([
  "invalidation-stop",
  "initial-stop",
  "ratcheted-stop",
  "profit-trailing-stop",
]);

const asArray = (value) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : value && typeof value === "object"
      ? [value]
      : [];
const number = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const usableAdjustedOhlcBar = (row) =>
  row?.adjusted === true &&
  [row?.open, row?.high, row?.low, row?.close].every(
    (value) => number(value) > 0,
  );
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
export function pointInTimeSecuritySymbol(value) {
  let symbol = symbolOf(value);
  const seen = new Set();
  while (POINT_IN_TIME_SECURITY_ALIASES[symbol] && !seen.has(symbol)) {
    seen.add(symbol);
    symbol = POINT_IN_TIME_SECURITY_ALIASES[symbol];
  }
  return symbol;
}
export function pointInTimeProviderPriceSymbols(values = []) {
  const canonical = new Set(
    asArray(values).map(pointInTimeSecuritySymbol).filter(Boolean),
  );
  const providerSymbols = new Set(canonical);
  for (const transition of POINT_IN_TIME_SECURITY_ALIAS_TRANSITIONS) {
    if (!canonical.has(transition.canonicalSymbol)) continue;
    providerSymbols.add(transition.previousSymbol);
    providerSymbols.add(transition.currentSymbol);
  }
  return [...providerSymbols].sort();
}

function aliasPricePriority(rawSymbol, canonicalSymbol, date) {
  const transition = POINT_IN_TIME_SECURITY_ALIAS_TRANSITIONS.find(
    (row) => row.canonicalSymbol === canonicalSymbol,
  );
  if (!transition) return rawSymbol === canonicalSymbol ? 2 : 1;
  if (rawSymbol === transition.previousSymbol)
    return date < transition.effectiveDate ? 4 : 1;
  if (rawSymbol === transition.currentSymbol)
    return date >= transition.effectiveDate ? 4 : 1;
  return rawSymbol === canonicalSymbol ? 2 : 1;
}

export function pointInTimeCanonicalPriceHistories(histories = new Map()) {
  const entries =
    histories instanceof Map
      ? [...histories.entries()]
      : Object.entries(histories || {});
  const grouped = new Map();
  for (const [rawValue, rawBars] of entries) {
    const rawSymbol = symbolOf(rawValue);
    const canonicalSymbol = pointInTimeSecuritySymbol(rawSymbol);
    if (!canonicalSymbol) continue;
    if (!grouped.has(canonicalSymbol)) grouped.set(canonicalSymbol, new Map());
    const byDate = grouped.get(canonicalSymbol);
    for (const bar of asArray(rawBars)) {
      const date = String(bar?.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const candidate = {
        priority: aliasPricePriority(rawSymbol, canonicalSymbol, date),
        rawSymbol,
        bar,
      };
      const existing = byDate.get(date);
      if (
        !existing ||
        candidate.priority > existing.priority ||
        (candidate.priority === existing.priority &&
          candidate.rawSymbol === canonicalSymbol &&
          existing.rawSymbol !== canonicalSymbol)
      )
        byDate.set(date, candidate);
    }
  }
  return new Map(
    [...grouped]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([symbol, byDate]) => [
        symbol,
        [...byDate]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, row]) => ({ ...row.bar, symbol, date })),
      ]),
  );
}
const fmpSymbol = (value) => symbolOf(value).replace(".", "-");
const sum = (rows, field) =>
  rows.reduce((total, row) => total + number(row?.[field], 0), 0);
const ratio = (numerator, denominator, multiplier = 1) =>
  Number.isFinite(Number(numerator)) &&
  Number.isFinite(Number(denominator)) &&
  Number(denominator) !== 0
    ? (Number(numerator) / Number(denominator)) * multiplier
    : null;
const growth = (latest, prior) =>
  Number.isFinite(Number(latest)) &&
  Number.isFinite(Number(prior)) &&
  Number(prior) !== 0
    ? (Number(latest) / Number(prior) - 1) * 100
    : null;
const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const validIsoDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
};
function pointInTimeNasdaqExpectedSessionDates() {
  const exceptionalClosures = new Set(
    POINT_IN_TIME_NASDAQ_SPECIAL_MARKET_CLOSURES,
  );
  const dates = [];
  const cursor = new Date(`${POINT_IN_TIME_NASDAQ_FIRST_SESSION}T00:00:00.000Z`);
  const end = new Date(
    `${POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH}T00:00:00.000Z`,
  );
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    if (isUsMarketSessionDay(date) && !exceptionalClosures.has(date))
      dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
const boundedInteger = (value, fallback, min, max) =>
  Math.floor(Math.max(min, Math.min(max, number(value, fallback))));
const stableFingerprint = (value = "") => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const sha256Fingerprint = (value = "") =>
  createHash("sha256").update(String(value)).digest("hex");
export function pointInTimePriceInputFingerprint(histories = new Map()) {
  const entries =
    histories instanceof Map
      ? [...histories.entries()]
      : Object.entries(histories || {});
  const hash = createHash("sha256");
  for (const [rawSymbol, rawBars] of entries
    .map(([symbol, bars]) => [pointInTimeSecuritySymbol(symbol), asArray(bars)])
    .filter(([symbol]) => Boolean(symbol))
    .sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${rawSymbol}\n`);
    for (const row of [...rawBars].sort((left, right) =>
      String(left?.date || "").localeCompare(String(right?.date || "")),
    ))
      hash.update(
        `${JSON.stringify([
          String(row?.date || "").slice(0, 10),
          number(row?.open),
          number(row?.high),
          number(row?.low),
          number(row?.close),
          number(row?.volume, 0),
          row?.adjusted === true,
        ])}\n`,
      );
  }
  return hash.digest("hex");
}

function nasdaqEvidenceDatasetFingerprint(datasetFingerprint, chunks = []) {
  return sha256Fingerprint(
    JSON.stringify({
      schema: 1,
      datasetFingerprint,
      chunks: asArray(chunks).map((chunk) => ({
        pathname: chunk.pathname,
        start: chunk.start,
        end: chunk.end,
        firstDate: chunk.firstDate,
        lastDate: chunk.lastDate,
        contentSha256: chunk.contentSha256,
      })),
    }),
  );
}

function pointInTimeNasdaqDatasetContractFingerprint() {
  return sha256Fingerprint(
    JSON.stringify({
      schema: 1,
      universeContract: POINT_IN_TIME_NASDAQ_UNIVERSE_CONTRACT,
      membershipSupplementContract:
        POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT,
      membershipSupplementFingerprint:
        pointInTimeNasdaqMembershipSupplementFingerprint(),
      providerEventCorrectionContract:
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT,
      providerEventCorrectionFingerprint:
        pointInTimeNasdaqProviderEventCorrectionFingerprint(),
      membershipEffectiveConvention: "effective-date-inclusive",
      compilerContract: POINT_IN_TIME_NASDAQ_COMPILER_CONTRACT,
      minimumSignalHistoryRows: 253,
      priceAliasContract: POINT_IN_TIME_NASDAQ_PRICE_ALIAS_CONTRACT,
      priceAcquisitionContract:
        POINT_IN_TIME_NASDAQ_PRICE_ACQUISITION_CONTRACT,
      universeRemovalPolicy: POINT_IN_TIME_NASDAQ_REMOVAL_POLICY,
      securityIdentityContract: POINT_IN_TIME_SECURITY_IDENTITY_CONTRACT,
    }),
  );
}

function pointInTimeNasdaqMembershipSupplementFingerprint(
  supplements = POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENTS,
) {
  return sha256Fingerprint(
    JSON.stringify(
      asArray(supplements).map((row) => ({
        date: row?.date,
        effectiveDate: row?.effectiveDate,
        announcementDate: row?.announcementDate,
        addedSymbol: row?.addedSymbol,
        removedSymbol: row?.removedSymbol,
        addedSecurity: row?.addedSecurity,
        removedSecurity: row?.removedSecurity,
        reason: row?.reason,
        provenance: row?.provenance,
        sources: asArray(row?.sources),
        effectiveDateBasis:
          row?.effectiveDateBasis || "source-verified-supplement",
      })),
    ),
  );
}

function pointInTimeNasdaqProviderEventCorrectionFingerprint(
  corrections = POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTIONS,
) {
  return sha256Fingerprint(
    JSON.stringify(
      asArray(corrections).map((row) => ({
        id: row?.id,
        date: row?.date,
        effectiveDate: row?.effectiveDate,
        announcementDate: row?.announcementDate,
        addedSymbol: row?.addedSymbol,
        removedSymbol: row?.removedSymbol,
        removedSecurity: row?.removedSecurity,
        providerEventDate: row?.providerEventDate,
        providerPairedAddedSymbol: row?.providerPairedAddedSymbol,
        reason: row?.reason,
        provenance: row?.provenance,
        sources: asArray(row?.sources),
      })),
    ),
  );
}

function pointInTimeNasdaqMembershipDigest({
  currentSymbols = [],
  throughSymbols = [],
  initialSymbols = [],
  changes = [],
  membershipSupplements = [],
  providerEventCorrections = [],
  unionSymbols = [],
  profilesBySymbol = {},
  delistedDates = {},
  fromDate = POINT_IN_TIME_NASDAQ_RESEARCH_FROM,
  throughDate = POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH,
} = {}) {
  return sha256Fingerprint(
    JSON.stringify({
      schema: 1,
      membershipSupplementContract:
        POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT,
      providerEventCorrectionContract:
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT,
      currentSymbols: asArray(currentSymbols).map(String).sort(),
      throughSymbols: asArray(throughSymbols).map(String).sort(),
      initialSymbols: asArray(initialSymbols).map(String).sort(),
      changes: asArray(changes),
      membershipSupplements: asArray(membershipSupplements),
      providerEventCorrections: asArray(providerEventCorrections),
      unionSymbols: asArray(unionSymbols).map(String).sort(),
      profilesBySymbol: Object.fromEntries(
        Object.entries(profilesBySymbol || {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      delistedDates: Object.fromEntries(
        Object.entries(delistedDates || {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      fromDate,
      throughDate,
    }),
  );
}

function pointInTimeNasdaqMembershipSupplementConflict(
  providerChanges = [],
  supplements = POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENTS,
) {
  for (const supplement of asArray(supplements)) {
    const addedSymbol = pointInTimeSecuritySymbol(supplement?.addedSymbol);
    const removedSymbol = pointInTimeSecuritySymbol(supplement?.removedSymbol);
    const date = String(supplement?.date || "").slice(0, 10);
    const conflict = asArray(providerChanges).find(
      (row) => {
        const sameSecurity = addedSymbol
          ? pointInTimeSecuritySymbol(row?.addedSymbol) === addedSymbol
          : removedSymbol &&
            pointInTimeSecuritySymbol(row?.removedSymbol) === removedSymbol;
        return Boolean(
          sameSecurity &&
            (String(row?.date || "").slice(0, 10) !== date ||
              pointInTimeSecuritySymbol(row?.addedSymbol) !== addedSymbol ||
              pointInTimeSecuritySymbol(row?.removedSymbol) !== removedSymbol),
        );
      },
    );
    if (conflict) return { supplement, provider: conflict };
  }
  return null;
}

function pointInTimeNasdaqApplyProviderEventCorrections(
  providerChanges = [],
  corrections = POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTIONS,
) {
  const adjustedProviderChanges = asArray(providerChanges).map((row) => ({
    ...row,
  }));
  const correctionChanges = [];
  for (const correction of asArray(corrections)) {
    const removedSymbol = pointInTimeSecuritySymbol(correction?.removedSymbol);
    const pairedAddedSymbol = pointInTimeSecuritySymbol(
      correction?.providerPairedAddedSymbol,
    );
    const providerEventDate = String(
      correction?.providerEventDate || "",
    ).slice(0, 10);
    const matches = adjustedProviderChanges
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          row.date === providerEventDate &&
          pointInTimeSecuritySymbol(row.removedSymbol) === removedSymbol &&
          (!pairedAddedSymbol ||
            pointInTimeSecuritySymbol(row.addedSymbol) ===
              pairedAddedSymbol),
      );
    if (matches.length !== 1)
      throw new Error(
        `Nasdaq provider correction ${correction?.id || removedSymbol} expected exactly one ${providerEventDate} ${pairedAddedSymbol || "any-addition"}/${removedSymbol} event; found ${matches.length}`,
      );
    const match = matches[0];
    adjustedProviderChanges[match.index] = {
      ...match.row,
      removedSymbol: "",
      removedSecurity: "",
      providerEventCorrectionId: correction.id,
    };
    correctionChanges.push({
      ...correction,
      addedSymbol: pointInTimeSecuritySymbol(correction.addedSymbol),
      removedSymbol,
      providerEventCorrectionId: correction.id,
      effectiveDateBasis: "source-verified-corporate-action",
      sourceVerifiedCorrection: true,
    });
  }
  return {
    providerChanges: adjustedProviderChanges.filter(
      (row) => row.addedSymbol || row.removedSymbol,
    ),
    correctionChanges,
  };
}

function pointInTimeNasdaqExpectedMembershipEvidence(
  universe,
  sessionDates = pointInTimeNasdaqExpectedSessionDates(),
) {
  const blueprint = universe?.privateBlueprint || {};
  const changes = canonicalIndexMembershipChanges(blueprint.changes);
  const members = new Set(
    asArray(blueprint.initialSymbols)
      .map(pointInTimeSecuritySymbol)
      .filter(Boolean),
  );
  const hash = createHash("sha256");
  let changeIndex = 0;
  let requestedMembershipObservations = 0;
  let minimumMembershipCount = Infinity;
  let maximumMembershipCount = 0;
  let universeRemovalActions = 0;
  for (const rawDate of asArray(sessionDates)) {
    const date = String(rawDate);
    const removals = [];
    while (changeIndex < changes.length && changes[changeIndex].date <= date) {
      const change = changes[changeIndex++];
      if (change.removedSymbol && members.delete(change.removedSymbol)) {
        universeRemovalActions++;
        removals.push({
          symbol: change.removedSymbol,
          effectiveDate: change.date,
        });
      }
      if (change.addedSymbol) members.add(change.addedSymbol);
    }
    const universeSymbols = [...members].sort();
    removals.sort(
      (left, right) =>
        left.symbol.localeCompare(right.symbol) ||
        left.effectiveDate.localeCompare(right.effectiveDate),
    );
    requestedMembershipObservations += universeSymbols.length;
    minimumMembershipCount = Math.min(
      minimumMembershipCount,
      universeSymbols.length,
    );
    maximumMembershipCount = Math.max(
      maximumMembershipCount,
      universeSymbols.length,
    );
    hash.update(`${JSON.stringify({ date, universeSymbols, removals })}\n`);
  }
  return {
    membershipPathFingerprint: hash.digest("hex"),
    requestedMembershipObservations,
    minimumMembershipCount: Number.isFinite(minimumMembershipCount)
      ? minimumMembershipCount
      : 0,
    maximumMembershipCount,
    universeRemovalActions,
  };
}
const sameStringArray = (left = [], right = []) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((value, index) => String(value) === String(right[index]));

function parseSignature(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function equivalentAcquisitionSignature(left, right) {
  const a = parseSignature(left);
  const b = parseSignature(right);
  return Boolean(
    a &&
    b &&
    a.fromDate === b.fromDate &&
    latestCompletedMarketSessionDay(new Date(`${a.endDate}T23:59:59.000Z`)) ===
      latestCompletedMarketSessionDay(new Date(`${b.endDate}T23:59:59.000Z`)) &&
    a.schema === b.schema &&
    a.priceContract === b.priceContract &&
    sameStringArray(a.symbols, b.symbols),
  );
}

function equivalentStatementSignature(left, right) {
  const a = parseSignature(left);
  const b = parseSignature(right);
  return Boolean(
    a &&
    b &&
    a.source === b.source &&
    sameStringArray(a.symbols, b.symbols) &&
    equivalentAcquisitionSignature(
      a.acquisitionSignature,
      b.acquisitionSignature,
    ),
  );
}

function appendCompatibleAcquisitionSignature(left, right) {
  const a = parseSignature(left);
  const b = parseSignature(right);
  return Boolean(
    a &&
    b &&
    a.fromDate === b.fromDate &&
    a.schema === b.schema &&
    a.priceContract === b.priceContract &&
    sameStringArray(a.symbols, b.symbols) &&
    String(a.endDate || "") < String(b.endDate || ""),
  );
}

function appendCompatibleStatementSignature(left, right) {
  const a = parseSignature(left);
  const b = parseSignature(right);
  return Boolean(
    a &&
    b &&
    a.source === b.source &&
    sameStringArray(a.symbols, b.symbols) &&
    appendCompatibleAcquisitionSignature(
      a.acquisitionSignature,
      b.acquisitionSignature,
    ),
  );
}

async function readPrivateJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname) || blobs[0];
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  return JSON.parse(await new Response(response.stream).text());
}

// Evidence artifacts must never fall back to a prefix neighbor. A missing
// shard is a hard stop, not permission to read a result from another dataset.
async function readExactPrivateJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  return JSON.parse(await new Response(response.stream).text());
}

async function persistPrivateJson(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

async function readPrivateGzipJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname) || blobs[0];
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  const compressed = Buffer.from(
    await new Response(response.stream).arrayBuffer(),
  );
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

async function readExactPrivateGzipJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  const compressed = Buffer.from(
    await new Response(response.stream).arrayBuffer(),
  );
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

async function persistPrivateGzipJson(pathname, value) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(value)), { level: 3 });
  await put(pathname, compressed, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/gzip",
    cacheControlMaxAge: 0,
  });
  return compressed.length;
}

const readReport = () => readPrivateJson(FMP_RESEARCH_REPORT_STORE);
const persistReport = (report) =>
  persistPrivateJson(FMP_RESEARCH_REPORT_STORE, report);

export async function getFmpResearchBacktestReport() {
  try {
    return await readReport();
  } catch (error) {
    return {
      version: REPORT_VERSION,
      status: "unavailable",
      claimStatus: "no-result",
      error: error?.message || "Research report storage is unavailable",
    };
  }
}

export async function getV11BoundedReviewExperiment() {
  try {
    return await readPrivateJson(V11_REVIEW_EXPERIMENT_STORE);
  } catch (error) {
    return {
      status: "unavailable",
      error: sanitizedError(error),
    };
  }
}

export async function getV11StressTestReport() {
  try {
    return await readPrivateJson(V11_STRESS_TEST_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getV11ForwardExtensionReport() {
  try {
    return await readPrivateJson(V11_FORWARD_EXTENSION_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getQualityConfirmedHistoricalAudit() {
  try {
    return await readPrivateJson(QUALITY_CONFIRMED_HISTORICAL_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getFactorLeadershipAudit() {
  try {
    return await readPrivateJson(FACTOR_LEADERSHIP_AUDIT_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPricePatternModelSearch() {
  try {
    return await readPrivateJson(PRICE_PATTERN_MODEL_SEARCH_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getAlphaCreatorSearch() {
  try {
    return await readPrivateJson(ALPHA_CREATOR_SEARCH_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getAlphaProspectiveChallenger() {
  try {
    return await readPrivateJson(ALPHA_PROSPECTIVE_CHALLENGER_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getAlphaRegimeMap() {
  try {
    return await readPrivateJson(ALPHA_REGIME_MAP_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getResearchDataCapabilityAudit() {
  try {
    return await readPrivateJson(RESEARCH_DATA_CAPABILITY_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

async function getPointInTimeSp500Universe() {
  return readPrivateJson(POINT_IN_TIME_SP500_UNIVERSE_STORE);
}

async function getPointInTimeNasdaqUniverse() {
  return readExactPrivateJson(POINT_IN_TIME_NASDAQ_UNIVERSE_STORE);
}

function currentPointInTimeNasdaqUniverse(report) {
  const supplementFingerprint =
    pointInTimeNasdaqMembershipSupplementFingerprint();
  const providerEventCorrectionFingerprint =
    pointInTimeNasdaqProviderEventCorrectionFingerprint();
  const blueprint = report?.privateBlueprint;
  const canonicalSymbols = (value) =>
    Array.isArray(value)
      ? value.map(pointInTimeSecuritySymbol).filter(Boolean).sort()
      : [];
  const canonicalUniqueSymbols = (value) => [
    ...new Set(canonicalSymbols(value)),
  ];
  const currentSymbols = canonicalUniqueSymbols(blueprint?.currentSymbols);
  const throughSymbols = canonicalUniqueSymbols(blueprint?.throughSymbols);
  const initialSymbols = canonicalUniqueSymbols(blueprint?.initialSymbols);
  const unionSymbols = canonicalUniqueSymbols(blueprint?.unionSymbols);
  const arraysAreCanonical = [
    [blueprint?.currentSymbols, currentSymbols],
    [blueprint?.throughSymbols, throughSymbols],
    [blueprint?.initialSymbols, initialSymbols],
    [blueprint?.unionSymbols, unionSymbols],
  ].every(([actual, expected]) => sameStringArray(actual, expected));
  const rawChanges = Array.isArray(blueprint?.changes)
    ? blueprint.changes
    : [];
  const changes = canonicalIndexMembershipChanges(rawChanges);
  const changeIdentities = changes.map(
    (row) => `${row.date}|${row.addedSymbol}|${row.removedSymbol}`,
  );
  const changesAreCanonical =
    changes.length === rawChanges.length &&
    new Set(changeIdentities).size === changeIdentities.length &&
    changes.every(
      (row) =>
        validIsoDay(row.date) &&
        row.date >= POINT_IN_TIME_NASDAQ_RESEARCH_FROM &&
        row.date <= POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH &&
        row.effectiveDate === row.date,
    );
  const expectedSupplements = POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENTS.map(
    (row) => ({
      ...row,
      addedSymbol: pointInTimeSecuritySymbol(row.addedSymbol),
      removedSymbol: pointInTimeSecuritySymbol(row.removedSymbol),
      effectiveDateBasis: "source-verified-supplement",
    }),
  );
  const supplementsAppliedExactly = expectedSupplements.every((supplement) => {
    const matchingChanges = changes.filter(
      (row) =>
        row.date === supplement.date &&
        row.addedSymbol === supplement.addedSymbol &&
        row.removedSymbol === supplement.removedSymbol,
    );
    return (
      (!supplement.addedSymbol ||
        !initialSymbols.includes(supplement.addedSymbol)) &&
      matchingChanges.length === 1 &&
      matchingChanges[0].effectiveDate === supplement.effectiveDate &&
      matchingChanges[0].effectiveDateBasis ===
        supplement.effectiveDateBasis &&
      matchingChanges[0].sourceVerifiedSupplement === true
    );
  });
  const correctionsAppliedExactly =
    POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTIONS.every((correction) => {
      const removedSymbol = pointInTimeSecuritySymbol(
        correction.removedSymbol,
      );
      const pairedAddedSymbol = pointInTimeSecuritySymbol(
        correction.providerPairedAddedSymbol,
      );
      if (
        !unionSymbols.includes(removedSymbol) &&
        !unionSymbols.includes(pairedAddedSymbol)
      )
        return true;
      const correctedRemovals = changes.filter(
        (row) =>
          row.date === correction.date &&
          row.addedSymbol === "" &&
          row.removedSymbol === removedSymbol &&
          row.sourceVerifiedCorrection === true &&
          row.providerEventCorrectionId === correction.id,
      );
      const replacementAdditions = changes.filter(
        (row) =>
          row.date === correction.providerEventDate &&
          row.addedSymbol === pairedAddedSymbol &&
          row.removedSymbol === "" &&
          row.providerEventCorrectionId === correction.id,
      );
      return (
        correctedRemovals.length === 1 &&
        (!pairedAddedSymbol || replacementAdditions.length === 1) &&
        !changes.some(
          (row) =>
            row.date === correction.providerEventDate &&
            row.removedSymbol === removedSymbol,
        )
      );
    });
  const replayedMembers = new Set(initialSymbols);
  for (const change of changes) {
    if (change.removedSymbol) replayedMembers.delete(change.removedSymbol);
    if (change.addedSymbol) replayedMembers.add(change.addedSymbol);
  }
  const derivedUnion = [
    ...new Set([
      ...initialSymbols,
      ...throughSymbols,
      ...changes.flatMap((row) => [row.addedSymbol, row.removedSymbol]),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const profilesBySymbol = blueprint?.profilesBySymbol;
  const profileSymbols =
    profilesBySymbol &&
    typeof profilesBySymbol === "object" &&
    !Array.isArray(profilesBySymbol)
      ? Object.keys(profilesBySymbol).sort()
      : [];
  const profilesAreBound =
    sameStringArray(profileSymbols, unionSymbols) &&
    profileSymbols.every(
      (symbol) =>
        pointInTimeSecuritySymbol(profilesBySymbol[symbol]?.symbol) === symbol,
    );
  const delistedDates = blueprint?.delistedDates;
  const delistedDatesValid = Boolean(
    delistedDates &&
      typeof delistedDates === "object" &&
      !Array.isArray(delistedDates) &&
      Object.entries(delistedDates).every(
        ([symbol, date]) =>
          unionSymbols.includes(pointInTimeSecuritySymbol(symbol)) &&
          validIsoDay(String(date || "").slice(0, 10)),
      ),
  );
  return Boolean(
    report?.status === "complete" &&
      report?.version === 1 &&
      report?.universeContract === POINT_IN_TIME_NASDAQ_UNIVERSE_CONTRACT &&
      report?.membershipSupplementContract ===
        POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT &&
      report?.membershipSupplementFingerprint === supplementFingerprint &&
      report?.providerEventCorrectionContract ===
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT &&
      report?.providerEventCorrectionFingerprint ===
        providerEventCorrectionFingerprint &&
      report?.correctedProviderEvents ===
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTIONS.length &&
      report?.membershipEffectiveConvention === "effective-date-inclusive" &&
      report?.supplementalMembershipEvents === expectedSupplements.length &&
      report?.currentAnchorCardinalityPlausible === true &&
      report?.pointInTimeMembershipConstructed === true &&
      report?.currentConstituents === currentSymbols.length &&
      report?.throughConstituents === throughSymbols.length &&
      report?.initialConstituents === initialSymbols.length &&
      report?.normalizedMembershipChanges === changes.length &&
      report?.unionSymbols === unionSymbols.length &&
      currentSymbols.length >= 90 &&
      currentSymbols.length <= 125 &&
      throughSymbols.length >= 85 &&
      throughSymbols.length <= 125 &&
      initialSymbols.length >= 85 &&
      initialSymbols.length <= 125 &&
      arraysAreCanonical &&
      changesAreCanonical &&
      supplementsAppliedExactly &&
      correctionsAppliedExactly &&
      sameStringArray([...replayedMembers].sort(), throughSymbols) &&
      sameStringArray(derivedUnion, unionSymbols) &&
      !unionSymbols.includes("SPY") &&
      !unionSymbols.includes("QQQ") &&
      profilesAreBound &&
      delistedDatesValid &&
      report?.earliestMembershipEvent === (changes[0]?.date || null) &&
      report?.latestMembershipEvent === (changes.at(-1)?.date || null) &&
      blueprint?.membershipSupplementContract ===
        POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT &&
      blueprint?.membershipSupplementFingerprint === supplementFingerprint &&
      blueprint?.providerEventCorrectionContract ===
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT &&
      blueprint?.providerEventCorrectionFingerprint ===
        providerEventCorrectionFingerprint &&
      pointInTimeNasdaqMembershipSupplementFingerprint(
        blueprint?.membershipSupplements,
      ) === supplementFingerprint &&
      validSha256(report?.rawMembershipDigest) &&
      blueprint?.rawMembershipDigest === report?.rawMembershipDigest &&
      pointInTimeNasdaqMembershipDigest({
        ...blueprint,
        fromDate: report?.fromDate,
        throughDate: report?.throughDate,
      }) === report?.rawMembershipDigest &&
      report?.fromDate === POINT_IN_TIME_NASDAQ_RESEARCH_FROM &&
      report?.throughDate === POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH,
  );
}

function pointInTimeNasdaqUniverseDiagnostics(report) {
  const blueprint = report?.privateBlueprint || {};
  const changes = canonicalIndexMembershipChanges(blueprint.changes);
  const initial = asArray(blueprint.initialSymbols)
    .map(pointInTimeSecuritySymbol)
    .filter(Boolean);
  const through = new Set(
    asArray(blueprint.throughSymbols)
      .map(pointInTimeSecuritySymbol)
      .filter(Boolean),
  );
  const replayed = new Set(initial);
  for (const change of changes) {
    if (change.removedSymbol) replayed.delete(change.removedSymbol);
    if (change.addedSymbol) replayed.add(change.addedSymbol);
  }
  const union = new Set(
    asArray(blueprint.unionSymbols)
      .map(pointInTimeSecuritySymbol)
      .filter(Boolean),
  );
  const profileSymbols = new Set(Object.keys(blueprint.profilesBySymbol || {}));
  return {
    replayedOnly: [...replayed].filter((symbol) => !through.has(symbol)).sort(),
    throughOnly: [...through].filter((symbol) => !replayed.has(symbol)).sort(),
    missingProfiles: [...union]
      .filter((symbol) => !profileSymbols.has(symbol))
      .sort(),
    extraProfiles: [...profileSymbols]
      .filter((symbol) => !union.has(symbol))
      .sort(),
    digestMatches:
      validSha256(report?.rawMembershipDigest) &&
      pointInTimeNasdaqMembershipDigest({
        ...blueprint,
        fromDate: report?.fromDate,
        throughDate: report?.throughDate,
      }) === report.rawMembershipDigest,
  };
}

export async function getPointInTimeNasdaqUniverseStatus() {
  try {
    const report = await getPointInTimeNasdaqUniverse();
    if (!report) return null;
    const summary = pointInTimeNasdaqUniverseSummary(report);
    if (currentPointInTimeNasdaqUniverse(report)) return summary;
    return {
      ...summary,
      status: "stale",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      nextStep:
        "Refresh Nasdaq membership under the current effective-date boundary contract before rebuilding prices.",
      validationDiagnostics: pointInTimeNasdaqUniverseDiagnostics(report),
    };
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

function pointInTimeNasdaqManifestHasCurrentContract(manifest) {
  const signature = parseSignature(manifest?.signature);
  const chunks = asArray(manifest?.chunks);
  const sessionDates = asArray(manifest?.sessionDates).map(String);
  const expectedSessionDates = pointInTimeNasdaqExpectedSessionDates();
  const sessionCalendarValid =
    expectedSessionDates.length === 1_170 &&
    sameStringArray(sessionDates, expectedSessionDates) &&
    sessionDates.every(
      (date, index) =>
        validIsoDay(date) && (index === 0 || sessionDates[index - 1] < date),
    );
  const requestedSymbols = asArray(signature?.requestedSymbols).map(String);
  const usableSymbols = asArray(signature?.usableSymbols).map(String);
  const symbolCoverageValid =
    requestedSymbols.length >= 90 &&
    usableSymbols.length >= 85 &&
    sameStringArray(requestedSymbols, [...new Set(requestedSymbols)].sort()) &&
    sameStringArray(usableSymbols, [...new Set(usableSymbols)].sort()) &&
    usableSymbols.every((symbol) => requestedSymbols.includes(symbol));
  let expectedChunkStart = 0;
  const chunksValid =
    chunks.length > 0 &&
    chunks.every((chunk) => {
      const start = number(chunk?.start, -1);
      const end = number(chunk?.end, -1);
      const valid =
        start === expectedChunkStart &&
        end > start &&
        end <= sessionDates.length &&
        typeof chunk?.pathname === "string" &&
        chunk.pathname.startsWith(
          `${POINT_IN_TIME_NASDAQ_COMPILED_CHUNK_PREFIX}/${manifest?.datasetFingerprint}/`,
        ) &&
        validSha256(chunk?.contentSha256) &&
        chunk?.firstDate === sessionDates[start] &&
        chunk?.lastDate === sessionDates[end - 1];
      if (valid) expectedChunkStart = end;
      return valid;
    });
  return Boolean(
    manifest?.schema === 1 &&
    manifest?.complete === true &&
      typeof manifest?.signature === "string" &&
      validSha256(manifest?.datasetFingerprint) &&
      sha256Fingerprint(manifest.signature) === manifest.datasetFingerprint &&
      validSha256(manifest?.priceInputFingerprint) &&
      signature?.schema === 1 &&
      signature?.fromDate === POINT_IN_TIME_NASDAQ_RESEARCH_FROM &&
      signature?.endDate === POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH &&
      signature?.priceInputFingerprint === manifest.priceInputFingerprint &&
      PRICE_HISTORY_CONTRACTS.some(
        (contract) => contract.id === signature?.priceContract,
      ) &&
      sameStringArray(signature?.sessionDates, sessionDates) &&
      sessionCalendarValid &&
      symbolCoverageValid &&
      signature?.compilerContract ===
        POINT_IN_TIME_NASDAQ_COMPILER_CONTRACT &&
      signature?.minimumSignalHistoryRows === 253 &&
      signature?.universeContract ===
        POINT_IN_TIME_NASDAQ_UNIVERSE_CONTRACT &&
      signature?.membershipSupplementContract ===
        POINT_IN_TIME_NASDAQ_MEMBERSHIP_SUPPLEMENT_CONTRACT &&
      signature?.membershipSupplementFingerprint ===
        pointInTimeNasdaqMembershipSupplementFingerprint() &&
      signature?.providerEventCorrectionContract ===
        POINT_IN_TIME_NASDAQ_PROVIDER_EVENT_CORRECTION_CONTRACT &&
      signature?.providerEventCorrectionFingerprint ===
        pointInTimeNasdaqProviderEventCorrectionFingerprint() &&
      signature?.membershipEffectiveConvention ===
        "effective-date-inclusive" &&
      signature?.priceAliasContract ===
        POINT_IN_TIME_NASDAQ_PRICE_ALIAS_CONTRACT &&
      signature?.priceAcquisitionContract ===
        POINT_IN_TIME_NASDAQ_PRICE_ACQUISITION_CONTRACT &&
      signature?.universeRemovalPolicy ===
        POINT_IN_TIME_NASDAQ_REMOVAL_POLICY &&
      signature?.securityIdentityContract ===
        POINT_IN_TIME_SECURITY_IDENTITY_CONTRACT &&
      validSha256(signature?.rawMembershipDigest) &&
      chunksValid &&
      expectedChunkStart === sessionDates.length &&
      number(manifest?.completedSessions, -1) === sessionDates.length &&
      manifest?.evidenceDatasetFingerprint ===
        nasdaqEvidenceDatasetFingerprint(manifest.datasetFingerprint, chunks),
  );
}

function currentPointInTimeNasdaqEvidence(
  manifest,
  datasetStatus,
  universe,
) {
  const signature = parseSignature(manifest?.signature);
  const requestedSymbols = asArray(signature?.requestedSymbols).map(String);
  const universeSymbols = asArray(
    universe?.privateBlueprint?.unionSymbols,
  ).map(String);
  return Boolean(
    pointInTimeNasdaqManifestHasCurrentContract(manifest) &&
      currentPointInTimeNasdaqUniverse(universe) &&
      signature?.rawMembershipDigest === universe?.rawMembershipDigest &&
      sameStringArray(requestedSymbols, universeSymbols) &&
      datasetStatus?.status === "compiled" &&
      datasetStatus?.productionChanged === false &&
      datasetStatus?.eligibleForAlphaClaim === false &&
      datasetStatus?.rawMembershipDigest === universe?.rawMembershipDigest &&
      datasetStatus?.membershipSupplementFingerprint ===
        pointInTimeNasdaqMembershipSupplementFingerprint() &&
      datasetStatus?.datasetContractFingerprint ===
        pointInTimeNasdaqDatasetContractFingerprint() &&
      datasetStatus?.priceAcquisitionContract ===
        POINT_IN_TIME_NASDAQ_PRICE_ACQUISITION_CONTRACT &&
      datasetStatus?.priceContract?.id === signature?.priceContract &&
      datasetStatus?.period?.from === POINT_IN_TIME_NASDAQ_RESEARCH_FROM &&
      datasetStatus?.period?.through ===
        POINT_IN_TIME_NASDAQ_RESEARCH_THROUGH &&
      datasetStatus?.datasetFingerprint ===
        manifest?.evidenceDatasetFingerprint &&
      datasetStatus?.datasetInputFingerprint === manifest?.datasetFingerprint &&
      datasetStatus?.priceInputFingerprint === manifest?.priceInputFingerprint,
  );
}

function assertCurrentPointInTimeNasdaqEvidence(
  manifest,
  datasetStatus,
  universe,
) {
  if (!currentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe))
    throw new Error(
      "The Nasdaq dataset is stale or rebuilding under a different evidence contract",
    );
  return true;
}

export async function getPointInTimeNasdaqDatasetStatus() {
  try {
    const [report, manifest, universe] = await Promise.all([
      readExactPrivateJson(POINT_IN_TIME_NASDAQ_DATASET_STATUS_STORE),
      readExactPrivateJson(
        POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE,
      ).catch(() => null),
      getPointInTimeNasdaqUniverse().catch(() => null),
    ]);
    const statusBoundToUniverse = Boolean(
      currentPointInTimeNasdaqUniverse(universe) &&
        report?.rawMembershipDigest === universe?.rawMembershipDigest &&
        report?.membershipSupplementFingerprint ===
          pointInTimeNasdaqMembershipSupplementFingerprint(),
    );
    if (!report) return null;
    if (
      report?.status !== "compiled" &&
      report?.datasetContractFingerprint ===
        pointInTimeNasdaqDatasetContractFingerprint() &&
      statusBoundToUniverse
    )
      return {
        ...report,
        productionChanged: false,
        eligibleForAlphaClaim: false,
      };
    if (currentPointInTimeNasdaqEvidence(manifest, report, universe))
      return {
        ...report,
        productionChanged: false,
        eligibleForAlphaClaim: false,
      };
    return {
      ...report,
      status: "stale",
      runClaimedAt: null,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      nextStep:
        "Rebuild the Nasdaq dataset under the current alias, removal, and compiler contracts.",
    };
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

function currentPointInTimeNasdaqIntegrity(
  report,
  manifest,
  datasetStatus,
  universe,
) {
  const audit = report?.audit;
  const assessment = report?.assessment;
  const priceRows = number(audit?.priceRows, -1);
  const adjustedRows = number(audit?.adjustedRows, -1);
  const totalStoredPriceRows = number(audit?.totalStoredPriceRows, -1);
  const activeMembershipPriceRows = number(
    audit?.activeMembershipPriceRows,
    -1,
  );
  const lookbackPriceRows = number(audit?.lookbackPriceRows, -1);
  const excludedArchivalPriceRows = number(
    audit?.excludedArchivalPriceRows,
    -1,
  );
  const requiredPriceRows = number(audit?.requiredPriceRows, -1);
  const observedRequiredPriceRows = number(
    audit?.observedRequiredPriceRows,
    -1,
  );
  const missingRequiredPriceRows = number(
    audit?.missingRequiredPriceRows,
    -1,
  );
  const shortSignalHistoryRows = number(audit?.shortSignalHistoryRows, -1);
  const missingRequiredRows = Array.isArray(
    audit?.missingRequiredPriceRowsBySymbol,
  )
    ? audit.missingRequiredPriceRowsBySymbol
    : null;
  const missingRequiredAttributionComplete = Boolean(
    missingRequiredRows &&
      missingRequiredRows.reduce(
        (total, row) => total + number(row?.total, 0),
        0,
      ) === missingRequiredPriceRows &&
      missingRequiredRows.every(
        (row) =>
          number(row?.activeOrExecution, 0) +
            number(row?.signalLookback, 0) +
            number(row?.benchmark, 0) ===
          number(row?.total, -1),
      ),
  );
  const expectedAdjustedCoveragePct = priceRows > 0
    ? roundMetric((adjustedRows / priceRows) * 100, 4)
    : 0;
  const priceCountsValid = Boolean(
    priceRows > 0 &&
      adjustedRows >= 0 &&
      adjustedRows <= priceRows &&
      requiredPriceRows >= 0 &&
      observedRequiredPriceRows >= 0 &&
      observedRequiredPriceRows <= requiredPriceRows &&
      priceRows === observedRequiredPriceRows &&
      missingRequiredPriceRows ===
        requiredPriceRows - observedRequiredPriceRows &&
      totalStoredPriceRows === priceRows + excludedArchivalPriceRows &&
      activeMembershipPriceRows >= 0 &&
      lookbackPriceRows >= 0 &&
      excludedArchivalPriceRows >= 0 &&
      activeMembershipPriceRows + lookbackPriceRows === priceRows &&
      shortSignalHistoryRows >= 0 &&
      number(audit?.nonPositiveRows, -1) >= 0 &&
      number(audit?.invalidOhlcRows, -1) >= 0,
  );
  const expectedAuditPass = Boolean(
    priceCountsValid &&
      missingRequiredPriceRows === 0 &&
      missingRequiredAttributionComplete &&
      audit?.observedSignalHistoryRequired === true &&
      shortSignalHistoryRows === 0 &&
      adjustedRows === priceRows &&
      audit?.nonPositiveRows === 0 &&
      audit?.invalidOhlcRows === 0 &&
      Array.isArray(audit?.possibleUnadjustedCorporateActions) &&
      audit.possibleUnadjustedCorporateActions.length === 0 &&
      Array.isArray(audit?.possibleDuplicateActiveSeries) &&
      audit.possibleDuplicateActiveSeries.length === 0,
  );
  const requestedMembershipObservations = number(
    report?.requestedMembershipObservations,
    -1,
  );
  const availableMembershipObservations = number(
    report?.availableMembershipObservations,
    -2,
  );
  const universeRemovalActions = number(report?.universeRemovalActions, -1);
  const universeRemovalOpenPrices = number(
    report?.universeRemovalOpenPrices,
    -1,
  );
  const universeRemovalZeroRecoveryActions = number(
    report?.universeRemovalZeroRecoveryActions,
    -1,
  );
  const universeRemovalResolvedOutcomes = number(
    report?.universeRemovalResolvedOutcomes,
    -1,
  );
  const minimumMembershipCount = number(report?.minimumMembershipCount, -1);
  const maximumMembershipCount = number(report?.maximumMembershipCount, -1);
  const missingMembershipRows = Array.isArray(
    report?.missingMembershipObservationsBySymbol,
  )
    ? report.missingMembershipObservationsBySymbol
    : null;
  const missingMembershipObservations = number(
    report?.missingMembershipObservations,
    -1,
  );
  const expectedMembershipCoveragePct =
    requestedMembershipObservations > 0
      ? roundMetric(
          (availableMembershipObservations /
            requestedMembershipObservations) *
            100,
          4,
        )
      : 0;
  const membershipCountsValid = Boolean(
    requestedMembershipObservations > 0 &&
      availableMembershipObservations >= 0 &&
      availableMembershipObservations <= requestedMembershipObservations &&
      missingMembershipObservations ===
        requestedMembershipObservations -
          availableMembershipObservations &&
      missingMembershipRows &&
      missingMembershipRows.reduce(
        (total, row) => total + number(row?.missing, 0),
        0,
      ) === missingMembershipObservations,
  );
  const activeMemberDateCoverageComplete = Boolean(
    membershipCountsValid &&
      missingMembershipObservations === 0,
  );
  const universeRemovalMissingOutcomes = number(
    report?.universeRemovalMissingOutcomes,
    -1,
  );
  const expectedRemovalOpenCoveragePct = universeRemovalActions
    ? roundMetric(
        (universeRemovalOpenPrices / universeRemovalActions) * 100,
        4,
      )
    : 100;
  const expectedRemovalOutcomeCoveragePct = universeRemovalActions
    ? roundMetric(
        (universeRemovalResolvedOutcomes / universeRemovalActions) * 100,
        4,
      )
    : 100;
  const removalCountsValid = Boolean(
    universeRemovalActions >= 0 &&
      universeRemovalOpenPrices >= 0 &&
      universeRemovalZeroRecoveryActions >= 0 &&
      universeRemovalResolvedOutcomes >= 0 &&
      universeRemovalResolvedOutcomes <= universeRemovalActions &&
      universeRemovalOpenPrices + universeRemovalZeroRecoveryActions ===
        universeRemovalResolvedOutcomes &&
      universeRemovalMissingOutcomes >= 0 &&
      universeRemovalMissingOutcomes ===
        universeRemovalActions - universeRemovalResolvedOutcomes,
  );
  const universeRemovalOutcomeCoverageComplete = Boolean(
    removalCountsValid &&
      universeRemovalMissingOutcomes === 0,
  );
  const membershipCardinalityPlausible = Boolean(
    minimumMembershipCount >= 85 &&
      maximumMembershipCount <= 125 &&
      minimumMembershipCount <= maximumMembershipCount,
  );
  const membershipSessionBoundsValid = Boolean(
    requestedMembershipObservations >= 1_170 * minimumMembershipCount &&
      requestedMembershipObservations <= 1_170 * maximumMembershipCount,
  );
  const evidenceRowBoundsValid = Boolean(
    requiredPriceRows >= requestedMembershipObservations + 2 * 1_170 &&
      activeMembershipPriceRows >= availableMembershipObservations,
  );
  const expectedMembershipEvidence =
    pointInTimeNasdaqExpectedMembershipEvidence(
      universe,
      manifest?.sessionDates,
    );
  const membershipPathMatchesUniverse = Boolean(
    validSha256(audit?.membershipPathFingerprint) &&
      audit.membershipPathFingerprint ===
        expectedMembershipEvidence.membershipPathFingerprint &&
      requestedMembershipObservations ===
        expectedMembershipEvidence.requestedMembershipObservations &&
      minimumMembershipCount ===
        expectedMembershipEvidence.minimumMembershipCount &&
      maximumMembershipCount ===
        expectedMembershipEvidence.maximumMembershipCount &&
      universeRemovalActions ===
        expectedMembershipEvidence.universeRemovalActions,
  );
  const expectedAllDataGatesPassed = Boolean(
    expectedAuditPass &&
      activeMemberDateCoverageComplete &&
      universeRemovalOutcomeCoverageComplete &&
      membershipCardinalityPlausible &&
      membershipPathMatchesUniverse,
  );
  return Boolean(
    currentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe) &&
      report?.version === POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_REPORT_VERSION &&
      report?.integrityContract ===
        POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_CONTRACT &&
      report?.status === "complete" &&
      report?.productionChanged === false &&
      report?.eligibleForAlphaClaim === false &&
      report?.datasetFingerprint === manifest?.evidenceDatasetFingerprint &&
      report?.datasetInputFingerprint === manifest?.datasetFingerprint &&
      report?.priceInputFingerprint === manifest?.priceInputFingerprint &&
      report?.rawMembershipDigest === universe?.rawMembershipDigest &&
      report?.membershipSupplementFingerprint ===
        pointInTimeNasdaqMembershipSupplementFingerprint() &&
      report?.universeRemovalPolicy === POINT_IN_TIME_NASDAQ_REMOVAL_POLICY &&
      assessment?.adjustedPriceIntegrityPass === expectedAuditPass &&
      assessment?.exactObservedSignalHistoryComplete ===
        (shortSignalHistoryRows === 0) &&
      assessment?.missingPriceAttributionComplete ===
        missingRequiredAttributionComplete &&
      assessment?.activeMemberDateCoverageComplete ===
        activeMemberDateCoverageComplete &&
      assessment?.universeRemovalExactOpenCoverageComplete ===
        (expectedRemovalOpenCoveragePct === 100) &&
      assessment?.universeRemovalOutcomeCoverageComplete ===
        universeRemovalOutcomeCoverageComplete &&
      assessment?.membershipCardinalityPlausible ===
        membershipCardinalityPlausible &&
      assessment?.membershipPathMatchesUniverse ===
        membershipPathMatchesUniverse &&
      assessment?.allDataGatesPassed === expectedAllDataGatesPassed &&
      priceCountsValid &&
      membershipCountsValid &&
      removalCountsValid &&
      membershipSessionBoundsValid &&
      evidenceRowBoundsValid &&
      audit?.pass === expectedAuditPass &&
      audit?.sessions === 1_170 &&
      audit?.adjustedCoveragePct === expectedAdjustedCoveragePct &&
      audit?.observedSignalHistoryRequired === true &&
      audit?.observedSignalHistoryPass === (shortSignalHistoryRows === 0) &&
      audit?.missingRequiredAttributionComplete ===
        missingRequiredAttributionComplete &&
      audit?.nasdaqMembershipEvidenceApplied === true &&
      validSha256(audit?.membershipPathFingerprint) &&
      report?.membershipPathFingerprint ===
        audit?.membershipPathFingerprint &&
      report?.expectedMembershipPathFingerprint ===
        expectedMembershipEvidence.membershipPathFingerprint &&
      report?.expectedRequestedMembershipObservations ===
        expectedMembershipEvidence.requestedMembershipObservations &&
      report?.expectedMinimumMembershipCount ===
        expectedMembershipEvidence.minimumMembershipCount &&
      report?.expectedMaximumMembershipCount ===
        expectedMembershipEvidence.maximumMembershipCount &&
      report?.expectedUniverseRemovalActions ===
        expectedMembershipEvidence.universeRemovalActions &&
      report?.membershipObservationCoveragePct ===
        expectedMembershipCoveragePct &&
      audit?.requestedMembershipObservations ===
        requestedMembershipObservations &&
      audit?.availableMembershipObservations ===
        availableMembershipObservations &&
      audit?.missingMembershipObservations ===
        missingMembershipObservations &&
      audit?.membershipObservationCoveragePct ===
        expectedMembershipCoveragePct &&
      audit?.activeMemberDateCoverageComplete ===
        activeMemberDateCoverageComplete &&
      JSON.stringify(audit?.missingMembershipObservationsBySymbol) ===
        JSON.stringify(missingMembershipRows) &&
      audit?.universeRemovalActions === universeRemovalActions &&
      audit?.universeRemovalOpenPrices === universeRemovalOpenPrices &&
      audit?.universeRemovalZeroRecoveryActions ===
        universeRemovalZeroRecoveryActions &&
      audit?.universeRemovalResolvedOutcomes ===
        universeRemovalResolvedOutcomes &&
      audit?.universeRemovalMissingOutcomes ===
        universeRemovalMissingOutcomes &&
      report?.universeRemovalOpenCoveragePct ===
        expectedRemovalOpenCoveragePct &&
      report?.universeRemovalOutcomeCoveragePct ===
        expectedRemovalOutcomeCoveragePct &&
      audit?.universeRemovalOutcomeCoveragePct ===
        expectedRemovalOutcomeCoveragePct &&
      audit?.universeRemovalOutcomeCoverageComplete ===
        universeRemovalOutcomeCoverageComplete &&
      audit?.universeRemovalOpenCoveragePct ===
        expectedRemovalOpenCoveragePct &&
      audit?.minimumMembershipCount === minimumMembershipCount &&
      audit?.maximumMembershipCount === maximumMembershipCount,
  );
}

export async function getPointInTimeNasdaqPriceIntegrity() {
  try {
    const [report, manifest, datasetStatus, universe] = await Promise.all([
      readExactPrivateJson(POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_STORE),
      readExactPrivateJson(
        POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE,
      ).catch(() => null),
      readExactPrivateJson(POINT_IN_TIME_NASDAQ_DATASET_STATUS_STORE).catch(
        () => null,
      ),
      getPointInTimeNasdaqUniverse().catch(() => null),
    ]);
    if (
      currentPointInTimeNasdaqIntegrity(
        report,
        manifest,
        datasetStatus,
        universe,
      )
    )
      return {
        ...report,
        productionChanged: false,
        eligibleForAlphaClaim: false,
      };
    if (!report) return null;
    return {
      ...report,
      version: POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_REPORT_VERSION,
      integrityContract: POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_CONTRACT,
      status: "stale",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      nextStep:
        "Run price integrity under the current observed-history evidence contract.",
    };
  } catch (error) {
    return {
      version: POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_REPORT_VERSION,
      integrityContract: POINT_IN_TIME_NASDAQ_PRICE_INTEGRITY_CONTRACT,
      status: "unavailable",
      error: sanitizedError(error),
    };
  }
}

export async function getPointInTimeNasdaqAlphaParallelR11() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_ALPHA_R11_STORE,
    );
    if (!report) return null;
    const context = await pointInTimeNasdaqR11Context().catch(() => null);
    if (
      !context ||
      report.version !== POINT_IN_TIME_NASDAQ_ALPHA_R11_REPORT_VERSION ||
      report.researchGeneration !== "R11" ||
      report.productionCandidateVersion !== "V21" ||
      !["complete", "awaiting-validation", "awaiting-audit"].includes(
        report.status,
      ) ||
      report.datasetFingerprint !== context.datasetFingerprint ||
      report.candidateSetFingerprint !== context.candidateSetFingerprint ||
      report.experimentFingerprint !== context.experimentFingerprint ||
      (report.status === "complete" &&
        !validR11FinalReportForContext(report, context))
    )
      return {
        version: POINT_IN_TIME_NASDAQ_ALPHA_R11_REPORT_VERSION,
        researchGeneration: "R11",
        productionCandidateVersion: "V21",
        status: "stale",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
        nextStep:
          "The stored report belongs to an older dataset or execution commit; rebuild frozen shards for the current context.",
      };
    return {
      ...report,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  } catch (error) {
    return {
      status: "unavailable",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      error: sanitizedError(error),
    };
  }
}

export async function getPreservedPointInTimeNasdaqR13Outcome() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_ALPHA_R11_STORE,
    );
    return {
      status: report?.status || "unavailable",
      selectedCandidateId: report?.selectedCandidateId || null,
      candidateDisposition: report?.candidateDisposition || null,
      reportDigest: report?.reportDigest || null,
      preservedHistoricalEvidence: report?.status === "complete",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: sanitizedError(error),
      preservedHistoricalEvidence: false,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeSp500DatasetStatus() {
  try {
    return await readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaCreator() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaCreatorV2() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_V2_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaResearchR3() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R3_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaResearchR4() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R4_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaResearchR5() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R5_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaResearchR6() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R6_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaResearchR7() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R7_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaBatchR8() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R8_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaSizingR9() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R9_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaEarningsDriftR10() {
  try {
    const [report, datasetStatus] = await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_ALPHA_R10_STORE),
      readPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE).catch(
        () => null,
      ),
    ]);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

function compactR14FactsStatus(report = {}) {
  return {
    version: report.version,
    researchGeneration: report.researchGeneration || "R14",
    status: report.status || "pending",
    source: report.source || "SEC companyfacts",
    availabilityConvention: report.availabilityConvention || null,
    datasetThrough: report.datasetThrough || null,
    updatedAt: report.updatedAt || null,
    completedAt: report.completedAt || null,
    requestedSymbols: Array.isArray(report.requestedSymbols)
      ? report.requestedSymbols.length
      : number(report.requestedSymbols, 0),
    completedSymbols: Array.isArray(report.completedSymbols)
      ? report.completedSymbols.length
      : number(report.completedSymbols, 0),
    exhaustedSymbols: Array.isArray(report.exhaustedSymbols)
      ? report.exhaustedSymbols.length
      : number(report.exhaustedSymbols, 0),
    remainingSymbols: number(report.remainingSymbols, 0),
    coveredSymbols: number(report.coveredSymbols, 0),
    coveragePct: number(report.coveragePct, 0),
    eventRows: number(report.eventRows, 0),
    failureCount: asArray(report.failures).length,
    dataFingerprint: report.dataFingerprint || null,
    nextStep: report.nextStep || null,
    limitations: asArray(report.limitations),
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
  };
}

export async function getPointInTimeSp500AlphaFilingR14() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R14_STORE,
    );
    if (report) return report;
    const facts = await readExactPrivateJson(
      POINT_IN_TIME_SP500_SEC_R14_FACTS_STORE,
    ).catch(() => null);
    return {
      version: POINT_IN_TIME_SP500_ALPHA_R14_REPORT_VERSION,
      researchGeneration: "R14",
      status:
        facts?.status === "complete" ? "pending-development" : "acquiring-data",
      dataAcquisition: compactR14FactsStatus(facts || {}),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  } catch (error) {
    return {
      version: POINT_IN_TIME_SP500_ALPHA_R14_REPORT_VERSION,
      researchGeneration: "R14",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeSp500MomentumSpineR15() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_SP500_MOMENTUM_R15_STORE,
    );
    return (
      report || {
        version: POINT_IN_TIME_SP500_MOMENTUM_R15_REPORT_VERSION,
        researchGeneration: "R15-R19",
        status: "pending-development",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      }
    );
  } catch (error) {
    return {
      version: POINT_IN_TIME_SP500_MOMENTUM_R15_REPORT_VERSION,
      researchGeneration: "R15-R19",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeNasdaqRunnerR20() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_RUNNER_R20_STORE,
    );
    return (
      report || {
        version: POINT_IN_TIME_NASDAQ_RUNNER_R20_REPORT_VERSION,
        researchGeneration: "R20-R24",
        status: "pending-development",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      }
    );
  } catch (error) {
    return {
      version: POINT_IN_TIME_NASDAQ_RUNNER_R20_REPORT_VERSION,
      researchGeneration: "R20-R24",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeNasdaqConcentratedRunnerR25() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_RUNNER_R25_STORE,
    );
    return (
      report || {
        version: POINT_IN_TIME_NASDAQ_RUNNER_R25_REPORT_VERSION,
        researchGeneration: "R25-R29",
        status: "pending-development",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      }
    );
  } catch (error) {
    return {
      version: POINT_IN_TIME_NASDAQ_RUNNER_R25_REPORT_VERSION,
      researchGeneration: "R25-R29",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeNasdaqContinuousRunnerR30() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_RUNNER_R30_STORE,
    );
    return (
      report || {
        version: POINT_IN_TIME_NASDAQ_RUNNER_R30_REPORT_VERSION,
        researchGeneration: "R30-R34",
        status: "pending-development",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      }
    );
  } catch (error) {
    return {
      version: POINT_IN_TIME_NASDAQ_RUNNER_R30_REPORT_VERSION,
      researchGeneration: "R30-R34",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeNasdaqAdaptiveRunnerR35() {
  try {
    const report = await readExactPrivateJson(
      POINT_IN_TIME_NASDAQ_RUNNER_R35_STORE,
    );
    return (
      report || {
        version: POINT_IN_TIME_NASDAQ_RUNNER_R35_REPORT_VERSION,
        researchGeneration: "R35-R39",
        status: "pending-development",
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      }
    );
  } catch (error) {
    return {
      version: POINT_IN_TIME_NASDAQ_RUNNER_R35_REPORT_VERSION,
      researchGeneration: "R35-R39",
      status: "unavailable",
      error: sanitizedError(error),
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    };
  }
}

export async function getPointInTimeNasdaqAdaptiveReplacementR40() {
  try {
    const report = await readExactPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R40_STORE);
    return report || { version: POINT_IN_TIME_NASDAQ_RUNNER_R40_REPORT_VERSION, researchGeneration: "R40-R44", status: "pending-development", productionChanged: false, eligibleForAlphaClaim: false, eligibleForLiveCapital: false };
  } catch (error) {
    return { version: POINT_IN_TIME_NASDAQ_RUNNER_R40_REPORT_VERSION, researchGeneration: "R40-R44", status: "unavailable", error: sanitizedError(error), productionChanged: false, eligibleForAlphaClaim: false, eligibleForLiveCapital: false };
  }
}

export async function getPointInTimeSp500AlphaCreatorV2Integrity() {
  try {
    return await readPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
    );
  } catch (error) {
    return { status: "unavailable", error: sanitizedError(error) };
  }
}

export async function getPointInTimeSp500AlphaProgram() {
  const adaptiveReplacement = await getPointInTimeNasdaqAdaptiveReplacementR40();
  if (adaptiveReplacement?.status && adaptiveReplacement.status !== "unavailable") return adaptiveReplacement;
  const adaptiveRunner = await getPointInTimeNasdaqAdaptiveRunnerR35();
  if (adaptiveRunner?.status && adaptiveRunner.status !== "unavailable")
    return adaptiveRunner;
  const continuousRunner = await getPointInTimeNasdaqContinuousRunnerR30();
  if (continuousRunner?.status && continuousRunner.status !== "unavailable")
    return continuousRunner;
  const concentratedRunner = await getPointInTimeNasdaqConcentratedRunnerR25();
  if (
    concentratedRunner?.status &&
    concentratedRunner.status !== "unavailable"
  )
    return concentratedRunner;
  const nasdaqRunner = await getPointInTimeNasdaqRunnerR20();
  if (nasdaqRunner?.status && nasdaqRunner.status !== "unavailable")
    return nasdaqRunner;
  const momentum = await getPointInTimeSp500MomentumSpineR15();
  if (momentum?.status && momentum.status !== "unavailable") return momentum;
  const r14 = await getPointInTimeSp500AlphaFilingR14();
  if (r14?.status && r14.status !== "unavailable") return r14;
  const r10 = await getPointInTimeSp500AlphaEarningsDriftR10();
  if (r10?.status && r10.status !== "unavailable") return r10;
  const r9 = await getPointInTimeSp500AlphaSizingR9();
  if (r9?.status && r9.status !== "unavailable") return r9;
  const r8 = await getPointInTimeSp500AlphaBatchR8();
  if (r8?.status && r8.status !== "unavailable") return r8;
  const r7 = await getPointInTimeSp500AlphaResearchR7();
  if (r7?.status && r7.status !== "unavailable") return r7;
  const r6 = await getPointInTimeSp500AlphaResearchR6();
  if (r6?.status && r6.status !== "unavailable") return r6;
  const r5 = await getPointInTimeSp500AlphaResearchR5();
  if (r5?.status && r5.status !== "unavailable") return r5;
  const r4 = await getPointInTimeSp500AlphaResearchR4();
  if (r4?.status && r4.status !== "unavailable") return r4;
  const r3 = await getPointInTimeSp500AlphaResearchR3();
  if (r3?.status && r3.status !== "unavailable") return r3;
  const latest = await getPointInTimeSp500AlphaCreatorV2();
  if (latest?.status && latest.status !== "unavailable") return latest;
  return getPointInTimeSp500AlphaCreator();
}

function sanitizedError(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/apikey=[^&\s]+/gi, "apikey=[redacted]")
    .slice(0, 400);
}

function providerErrorMessage(payload, body) {
  const value =
    payload?.message ??
    payload?.error ??
    payload?.["Error Message"] ??
    payload?.detail ??
    body;
  return String(value || "")
    .replace(/apikey=[^&\s]+/gi, "apikey=[redacted]")
    .slice(0, 240);
}

function createFmpClient(apiKey) {
  let calls = 0;
  const failures = [];
  let nextRequestAt = 0;
  let requestSlot = Promise.resolve();

  function waitForRequestSlot() {
    const prior = requestSlot;
    let release;
    requestSlot = new Promise((resolve) => {
      release = resolve;
    });
    return prior.then(async () => {
      const delay = Math.max(0, nextRequestAt - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      nextRequestAt = Date.now() + REQUEST_START_SPACING_MS;
      release();
    });
  }

  async function fetchStable(path, params = {}, { allowEmpty = false } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      await waitForRequestSlot();
      calls++;
      const query = new URLSearchParams({ ...params, apikey: apiKey });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://financialmodelingprep.com/stable/${path}?${query}`,
          { signal: controller.signal },
        );
        const body = await response.text();
        let payload = null;
        try {
          payload = JSON.parse(body);
        } catch {}
        if (response.ok) {
          const rows = Array.isArray(payload?.historical)
            ? payload.historical.filter(Boolean)
            : asArray(payload);
          if (rows.length || allowEmpty) return rows;
          throw new Error(`FMP ${path} returned no rows`);
        }
        const providerMessage = providerErrorMessage(payload, body);
        const error = new Error(
          `FMP ${path} failed: ${response.status}${providerMessage ? ` - ${providerMessage}` : ""}`,
        );
        error.status = response.status;
        if ([401, 402, 403, 404].includes(response.status)) {
          failures.push({
            path,
            status: response.status,
            error: sanitizedError(error),
          });
          throw error;
        }
        if (response.status === 429 && attempt === 0) {
          const retryAfter = number(response.headers.get("retry-after"), 5);
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(30_000, Math.max(5_000, retryAfter * 1_000)),
            ),
          );
          lastError = error;
          continue;
        }
        lastError = error;
      } catch (error) {
        lastError = error;
        if ([401, 402, 403, 404].includes(error?.status)) throw error;
        if (attempt === 0)
          await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        clearTimeout(timer);
      }
    }
    failures.push({ path, error: sanitizedError(lastError) });
    throw lastError || new Error(`FMP ${path} failed`);
  }
  return {
    fetchStable,
    stats: () => ({ calls, failures: failures.slice(0, 20) }),
  };
}

async function mapLimited(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        output[index] = await worker(items[index], index);
      } catch (error) {
        output[index] = { error: sanitizedError(error), item: items[index] };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return output;
}

export function selectResearchUniverse(
  candidates = [],
  limit = DEFAULT_SYMBOL_LIMIT,
) {
  const unique = new Map();
  for (const candidate of candidates) {
    const row = { ...candidate, symbol: symbolOf(candidate) };
    if (row.symbol && !unique.has(row.symbol)) unique.set(row.symbol, row);
  }
  const normalized = [...unique.values()];
  const bySector = new Map();
  for (const row of normalized) {
    const sector = String(row.sector || row.primaryTheme || "Other");
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(row);
  }
  const stableRank = (symbol) => {
    let hash = 2_166_136_261;
    for (const character of String(symbol)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
  };
  const stableSort = (a, b) =>
    stableRank(a.symbol) - stableRank(b.symbol) ||
    a.symbol.localeCompare(b.symbol);
  for (const rows of bySector.values()) rows.sort(stableSort);
  const selected = [];
  const seen = new Set();
  // Seed represented sectors, then fill from a deterministic cross-sector
  // sample. The research cohort must not be selected because a stock happens
  // to have a high technical/discovery score at the end of the test period.
  const sectors = [...bySector.keys()].sort(
    (a, b) =>
      bySector.get(b).length - bySector.get(a).length || a.localeCompare(b),
  );
  for (const sector of sectors) {
    const row = bySector.get(sector)?.[0];
    if (!row || selected.length >= limit) break;
    selected.push(row);
    seen.add(row.symbol);
  }
  const remaining = normalized
    .filter((row) => !seen.has(row.symbol))
    .sort(stableSort);
  for (const row of remaining) {
    if (selected.length >= limit) break;
    if (seen.has(row.symbol)) continue;
    selected.push(row);
    seen.add(row.symbol);
  }
  return selected;
}

export function normalizeHistoricalBars(
  rows = [],
  { sourceAdjusted = false } = {},
) {
  return asArray(rows)
    .map((row) => {
      const rawOpen = number(row.open);
      const rawHigh = number(row.high);
      const rawLow = number(row.low);
      const rawClose = number(row.close ?? row.price);
      const adjustedOpen = number(row.adjOpen ?? row.adjustedOpen);
      const adjustedHigh = number(row.adjHigh ?? row.adjustedHigh);
      const adjustedLow = number(row.adjLow ?? row.adjustedLow);
      const adjustedClose = number(row.adjClose ?? row.adjustedClose);
      const factor =
        !sourceAdjusted && rawClose > 0 && adjustedClose > 0
          ? adjustedClose / rawClose
          : 1;
      const adjusted = sourceAdjusted || adjustedClose > 0;
      return {
        date: String(row.date || "").slice(0, 10),
        open: sourceAdjusted
          ? (adjustedOpen ?? rawOpen)
          : rawOpen > 0
            ? rawOpen * factor
            : null,
        high: sourceAdjusted
          ? (adjustedHigh ?? rawHigh)
          : rawHigh > 0
            ? rawHigh * factor
            : null,
        low: sourceAdjusted
          ? (adjustedLow ?? rawLow)
          : rawLow > 0
            ? rawLow * factor
            : null,
        close: sourceAdjusted
          ? (adjustedClose ?? rawClose)
          : adjustedClose > 0
            ? adjustedClose
            : rawClose,
        volume: number(row.volume, 0),
        adjusted,
      };
    })
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        row.open > 0 &&
        row.high > 0 &&
        row.low > 0 &&
        row.close > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function resolvePriceHistoryContract(client, from, to) {
  const failures = [];
  for (const contract of PRICE_HISTORY_CONTRACTS) {
    try {
      const rows = await client.fetchStable(contract.path, {
        symbol: "SPY",
        from,
        to,
      });
      const bars = normalizeHistoricalBars(rows, {
        sourceAdjusted: contract.sourceAdjusted,
      });
      const adjustedBars = bars.filter((bar) => bar.adjusted).length;
      if (bars.length < 500 || adjustedBars !== bars.length)
        throw new Error(
          `FMP ${contract.path} failed adjusted-history validation (${bars.length} bars, ${adjustedBars} adjusted)`,
        );
      return { contract, benchmarkBars: bars, failures };
    } catch (error) {
      failures.push({
        path: contract.path,
        status: number(error?.status),
        error: sanitizedError(error),
      });
    }
  }
  const summary = failures
    .map((failure) => `${failure.path}: ${failure.error}`)
    .join(" | ");
  const error = new Error(
    `No FMP adjusted-price contract passed preflight${summary ? ` - ${summary}` : ""}`,
  );
  error.priceContractFailures = failures;
  throw error;
}

function acceptedAt(row = {}) {
  const value = row.acceptedDate || row.acceptedDateTime;
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function fiscalKey(row = {}) {
  return `${String(row.calendarYear || row.date || "").slice(0, 4)}-${String(row.period || "")}`;
}

function latestDistinct(rows, cutoff, limit) {
  const chosen = new Map();
  for (const row of rows) {
    const availableAt = acceptedAt(row);
    if (!availableAt || availableAt > cutoff) continue;
    const key = fiscalKey(row);
    const prior = chosen.get(key);
    if (!prior || acceptedAt(prior) < availableAt) chosen.set(key, row);
  }
  return [...chosen.values()]
    .sort(
      (a, b) =>
        String(b.date || b.calendarYear || "").localeCompare(
          String(a.date || a.calendarYear || ""),
        ) || acceptedAt(b).localeCompare(acceptedAt(a)),
    )
    .slice(0, limit);
}

export function buildHistoricalFundamentalRows({
  incomeRows = [],
  balanceRows = [],
  cashFlowRows = [],
} = {}) {
  const bySymbol = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const symbol = symbolOf(row);
      if (!symbol || !acceptedAt(row)) continue;
      if (!map.has(symbol)) map.set(symbol, []);
      map.get(symbol).push(row);
    }
    return map;
  };
  const income = bySymbol(incomeRows);
  const balances = bySymbol(balanceRows);
  const cashFlows = bySymbol(cashFlowRows);
  const output = [];
  for (const [symbol, rows] of income) {
    const observationTimes = [
      ...new Set(rows.map(acceptedAt).filter(Boolean)),
    ].sort();
    for (const availableAt of observationTimes) {
      const latestIncome = latestDistinct(rows, availableAt, 8);
      const latestBalance = latestDistinct(
        balances.get(symbol) || [],
        availableAt,
        1,
      )[0];
      const latestCash = latestDistinct(
        cashFlows.get(symbol) || [],
        availableAt,
        4,
      );
      if (latestIncome.length < 4 || !latestBalance) continue;
      const current = latestIncome.slice(0, 4);
      const prior = latestIncome.slice(4, 8);
      const revenueTtm = sum(current, "revenue");
      const grossProfitTtm = sum(current, "grossProfit");
      const operatingIncomeTtm = sum(current, "operatingIncome");
      const netIncomeTtm = sum(current, "netIncome");
      const freeCashFlowTtm = sum(latestCash, "freeCashFlow");
      const priorRevenueTtm = prior.length === 4 ? sum(prior, "revenue") : null;
      const priorOperatingIncomeTtm =
        prior.length === 4 ? sum(prior, "operatingIncome") : null;
      const priorNetIncomeTtm =
        prior.length === 4 ? sum(prior, "netIncome") : null;
      const equity = number(
        latestBalance.totalStockholdersEquity ??
          latestBalance.totalEquity ??
          latestBalance.stockholdersEquity,
      );
      const debt = number(
        latestBalance.totalDebt ??
          number(latestBalance.shortTermDebt, 0) +
            number(latestBalance.longTermDebt, 0),
      );
      const currentAssets = number(latestBalance.totalCurrentAssets);
      const currentLiabilities = number(latestBalance.totalCurrentLiabilities);
      const cash = number(
        latestBalance.cashAndCashEquivalents ??
          latestBalance.cashAndShortTermInvestments,
        0,
      );
      const receivables = number(
        latestBalance.netReceivables ?? latestBalance.accountsReceivables,
        0,
      );
      const sharesOutstanding = number(
        current[0]?.weightedAverageShsOutDil ??
          current[0]?.weightedAverageShsOut ??
          latestBalance.commonStockSharesOutstanding,
      );
      const priorSharesOutstanding = number(
        prior[0]?.weightedAverageShsOutDil ?? prior[0]?.weightedAverageShsOut,
      );
      const grossMargin = ratio(grossProfitTtm, revenueTtm, 100);
      const operatingMargin = ratio(operatingIncomeTtm, revenueTtm, 100);
      const freeCashFlowMargin = ratio(freeCashFlowTtm, revenueTtm, 100);
      const returnOnEquity =
        equity > 0 ? ratio(netIncomeTtm, equity, 100) : null;
      const freeCashFlowConversion =
        netIncomeTtm > 0 ? ratio(freeCashFlowTtm, netIncomeTtm, 100) : null;
      const revenueGrowth = growth(revenueTtm, priorRevenueTtm);
      const earningsGrowth = growth(netIncomeTtm, priorNetIncomeTtm);
      const operatingIncomeGrowth = growth(
        operatingIncomeTtm,
        priorOperatingIncomeTtm,
      );
      const shareChangeYoY = growth(sharesOutstanding, priorSharesOutstanding);
      const coverage = [
        grossMargin,
        operatingMargin,
        equity > 0 ? ratio(debt, equity) : null,
        revenueGrowth,
        earningsGrowth,
        sharesOutstanding,
      ].filter(
        (value) => value !== null && Number.isFinite(Number(value)),
      ).length;
      output.push({
        symbol,
        availableAt,
        acceptedDate: availableAt,
        revisionSafe: false,
        fundamentalDataStatus: coverage >= 5 ? "complete" : "partial",
        fundamentalDataVerified: coverage >= 5,
        grossMargin,
        operatingMargin,
        freeCashFlowMargin,
        returnOnEquity,
        freeCashFlowConversion,
        debtToEquity: equity > 0 ? ratio(debt, equity) : null,
        currentRatio: ratio(currentAssets, currentLiabilities),
        quickRatio: ratio(cash + receivables, currentLiabilities),
        revenueGrowth,
        earningsGrowth,
        operatingIncomeGrowth,
        shareChangeYoY,
        sharesOutstanding,
        priorSharesOutstanding,
        revenueTtm,
        operatingIncomeTtm,
        netIncomeTtm,
        freeCashFlowTtm,
        bookValue: equity,
        fundamentalSources: {
          historicalQuarterlyStatements: true,
          acceptedDateObserved: true,
          revisionSafe: false,
        },
      });
    }
  }
  return output.sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol) ||
      a.availableAt.localeCompare(b.availableAt),
  );
}

function metricsSummary(
  run = {},
  { tradeLimit = 200, skippedLimit = 100 } = {},
) {
  const { dailyReturns, ...metrics } = run.metrics || {};
  return {
    metrics,
    tradeSample: tradeLimit ? (run.trades || []).slice(-tradeLimit) : [],
    skippedOrderSample: skippedLimit
      ? (run.skippedOrders || []).slice(-skippedLimit)
      : [],
    endingCash: run.endingCash,
    openPositionCount:
      number(run.openPositionCount) ?? (run.openPositions || []).length,
  };
}

function compactResearchRun(run = {}) {
  return {
    metrics: run.metrics || {},
    trades: run.trades || [],
    // Skipped orders are diagnostic samples, not metric inputs. Bound them so a
    // durable replay checkpoint cannot grow with every rejected daily order.
    skippedOrders: (run.skippedOrders || []).slice(-200),
    curveLength: run.curve?.length || 0,
    endingCash: run.endingCash,
    openPositionCount: (run.openPositions || []).length,
  };
}

function compactPlaceboRun(run = {}) {
  return {
    metrics: run.metrics || {},
    trades: [],
    skippedOrders: [],
    curveLength: run.curve?.length || 0,
    endingCash: run.endingCash,
    openPositionCount: (run.openPositions || []).length,
  };
}

const average = (values) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
const standardDeviation = (values) => {
  if (values.length < 2) return 0;
  const center = average(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - center) ** 2, 0) /
      (values.length - 1),
  );
};
const roundMetric = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const percentileValue = (values = [], percentile = 0.5) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1),
  );
  return sorted[index];
};

function researchTradeDiagnostics(trades = []) {
  const entries = new Map(
    trades
      .filter((trade) => trade.side === "buy")
      .map((trade) => [trade.diagnosticPositionId ?? trade.positionId, trade]),
  );
  const completed = trades
    .filter((trade) => trade.side === "sell" && trade.positionClosed === true)
    .map((trade) => {
      const entry = entries.get(trade.diagnosticPositionId ?? trade.positionId);
      const entryNotional = number(entry?.shares, 0) * number(entry?.price, 0);
      return {
        returnPct:
          entryNotional > 0
            ? (number(trade.roundTripPnl, trade.realizedPnl) / entryNotional) *
              100
            : null,
        reason: String(trade.reason || "unknown"),
        holdingSessions: number(trade.holdingSessions, null),
        mfePct: number(trade.mfePct, null),
        maePct: number(trade.maePct, null),
      };
    })
    .filter((trade) => Number.isFinite(trade.returnPct));
  const values = completed.map((trade) => trade.returnPct);
  const winners = values.filter((value) => value > 0);
  const losers = values.filter((value) => value < 0);
  const holdings = completed
    .map((trade) => trade.holdingSessions)
    .filter(Number.isFinite);
  const mfe = completed.map((trade) => trade.mfePct).filter(Number.isFinite);
  const mae = completed.map((trade) => trade.maePct).filter(Number.isFinite);
  const exitsByReason = {};
  for (const trade of completed)
    exitsByReason[trade.reason] = number(exitsByReason[trade.reason], 0) + 1;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    expectancyPct: values.length ? roundMetric(average(values)) : null,
    medianReturnPct: values.length
      ? roundMetric(sorted[Math.floor(sorted.length / 2)])
      : null,
    averageWinnerPct: winners.length ? roundMetric(average(winners)) : null,
    averageLoserPct: losers.length ? roundMetric(average(losers)) : null,
    winLossPayoffRatio:
      winners.length && losers.length
        ? roundMetric(average(winners) / Math.abs(average(losers)), 3)
        : null,
    averageHoldingSessions: holdings.length
      ? roundMetric(average(holdings), 1)
      : null,
    averageMfePct: mfe.length ? roundMetric(average(mfe)) : null,
    averageMaePct: mae.length ? roundMetric(average(mae)) : null,
    stopOutRatePct: completed.length
      ? roundMetric(
          (completed.filter((trade) => STOP_EXIT_REASONS.has(trade.reason))
            .length /
            completed.length) *
            100,
        )
      : null,
    exitsByReason,
  };
}

function aggregateResearchRuns(runs = []) {
  const dailyReturns = runs.flatMap((run) => run.metrics?.dailyReturns || []);
  const closed = runs.flatMap((run) =>
    (run.trades || []).filter(
      (trade) => trade.side === "sell" && trade.positionClosed === true,
    ),
  );
  const tradePnl = (trade) => number(trade.roundTripPnl, trade.realizedPnl);
  const grossProfit = closed.reduce(
    (total, trade) => total + Math.max(0, tradePnl(trade)),
    0,
  );
  const grossLoss = Math.abs(
    closed.reduce((total, trade) => total + Math.min(0, tradePnl(trade)), 0),
  );
  const totalReturn =
    runs.reduce(
      (value, run) => value * (1 + number(run.metrics?.totalReturnPct) / 100),
      1,
    ) - 1;
  const benchmarkReturn =
    runs.reduce(
      (value, run) =>
        value * (1 + number(run.metrics?.benchmarkReturnPct) / 100),
      1,
    ) - 1;
  const exposureMatchedBenchmarkReturn =
    runs.reduce(
      (value, run) =>
        value *
        (1 + number(run.metrics?.exposureMatchedBenchmarkReturnPct) / 100),
      1,
    ) - 1;
  const comparisonSymbols = new Set(
    runs.flatMap((run) => Object.keys(run.metrics?.benchmarkComparisons || {})),
  );
  if (!comparisonSymbols.size) comparisonSymbols.add("SPY");
  const benchmarkComparisons = {};
  for (const symbol of comparisonSymbols) {
    const simpleReturn =
      runs.reduce((value, run) => {
        const comparison = run.metrics?.benchmarkComparisons?.[symbol];
        const returnPct =
          comparison?.simpleReturnPct ??
          (symbol === "SPY" ? run.metrics?.benchmarkReturnPct : 0);
        return value * (1 + number(returnPct) / 100);
      }, 1) - 1;
    const matchedReturn =
      runs.reduce((value, run) => {
        const comparison = run.metrics?.benchmarkComparisons?.[symbol];
        const returnPct =
          comparison?.exposureMatchedReturnPct ??
          (symbol === "SPY"
            ? run.metrics?.exposureMatchedBenchmarkReturnPct
            : 0);
        return value * (1 + number(returnPct) / 100);
      }, 1) - 1;
    benchmarkComparisons[symbol] = {
      simpleReturnPct: roundMetric(simpleReturn * 100),
      excessReturnPct: roundMetric((totalReturn - simpleReturn) * 100),
      exposureMatchedReturnPct: roundMetric(matchedReturn * 100),
      exposureMatchedAlphaPct: roundMetric((totalReturn - matchedReturn) * 100),
      cashDragPct: roundMetric((matchedReturn - simpleReturn) * 100),
    };
  }
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const dailyReturn of dailyReturns) {
    equity *= 1 + dailyReturn;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }
  const volatility = standardDeviation(dailyReturns);
  const downside = standardDeviation(
    dailyReturns.filter((dailyReturn) => dailyReturn < 0),
  );
  const sessions = runs.reduce(
    (total, run) =>
      total + Math.max(1, number(run.curveLength, run.curve?.length || 0)),
    0,
  );
  const weighted = (field) =>
    sessions
      ? runs.reduce(
          (total, run) =>
            total +
            number(run.metrics?.[field]) *
              Math.max(1, number(run.curveLength, run.curve?.length || 0)),
          0,
        ) / sessions
      : 0;
  const years = Math.max(1 / 252, sessions / 252);
  return {
    metrics: {
      totalReturnPct: roundMetric(totalReturn * 100),
      cagrPct: roundMetric((Math.pow(1 + totalReturn, 1 / years) - 1) * 100),
      maxDrawdownPct: roundMetric(maxDrawdown * 100),
      annualizedVolatilityPct: roundMetric(volatility * Math.sqrt(252) * 100),
      sharpe: volatility
        ? roundMetric((average(dailyReturns) / volatility) * Math.sqrt(252), 3)
        : 0,
      sortino: downside
        ? roundMetric((average(dailyReturns) / downside) * Math.sqrt(252), 3)
        : 0,
      trades: runs.reduce(
        (total, run) => total + number(run.metrics?.trades),
        0,
      ),
      closedTrades: closed.length,
      winRatePct: closed.length
        ? roundMetric(
            (closed.filter((trade) => tradePnl(trade) > 0).length /
              closed.length) *
              100,
          )
        : 0,
      profitFactor: grossLoss ? roundMetric(grossProfit / grossLoss, 3) : null,
      benchmarkReturnPct: roundMetric(benchmarkReturn * 100),
      excessReturnPct: roundMetric((totalReturn - benchmarkReturn) * 100),
      exposureMatchedBenchmarkReturnPct: roundMetric(
        exposureMatchedBenchmarkReturn * 100,
      ),
      exposureMatchedAlphaPct: roundMetric(
        (totalReturn - exposureMatchedBenchmarkReturn) * 100,
      ),
      cashDragVsBenchmarkPct: roundMetric(
        (exposureMatchedBenchmarkReturn - benchmarkReturn) * 100,
      ),
      benchmarkComparisons,
      averageExposurePct: roundMetric(weighted("averageExposurePct")),
      averageActiveExposurePct: roundMetric(
        weighted("averageActiveExposurePct"),
      ),
      averageBenchmarkSleevePct: roundMetric(
        weighted("averageBenchmarkSleevePct"),
      ),
      turnoverPct: roundMetric(weighted("annualizedTurnoverPct") * years),
      annualizedTurnoverPct: roundMetric(weighted("annualizedTurnoverPct")),
      tradeDiagnostics: researchTradeDiagnostics(
        runs.flatMap((run, runIndex) =>
          (run.trades || []).map((trade) => ({
            ...trade,
            diagnosticPositionId: `${runIndex}:${trade.positionId}`,
          })),
        ),
      ),
      dailyReturns,
    },
    trades: runs.flatMap((run) => run.trades || []),
    skippedOrders: runs.flatMap((run) => run.skippedOrders || []),
    curveLength: sessions,
    openPositions: [],
    endingCash: null,
  };
}

function simulationOptions(extra = {}) {
  const independentLifecycle = extra.independentLifecycle === true;
  return {
    initialCapital: 100_000,
    minimumTrade: 750,
    slippageBps: 12,
    commissionPerOrder: 0,
    ...(independentLifecycle
      ? {}
      : {
          positionDecision: portfolioDecision,
          capitalAllowance,
          portfolioRiskSnapshot,
          portfolioContributionGate,
          capitalSignalEligible,
          swingTimeReview,
          positionReunderwrite: reunderwriteExistingPosition,
          winnerTrimGate,
          recordWinnerTrim,
        }),
    ...extra,
  };
}

function buildV12ResearchFolds(sessionDates = []) {
  const dates = sessionDates
    .map((value) => String(value?.date || value || ""))
    .filter(Boolean);
  const firstUsable = Math.min(252, Math.max(0, dates.length - 3));
  const usableDates = dates.slice(firstUsable);
  if (usableDates.length < 630)
    throw new Error(
      `Only ${usableDates.length} post-warmup sessions are available; 630 are required`,
    );
  const folds = [];
  const trainSessions = 378;
  const validationSessions = 126;
  const auditSessions = 126;
  const stepSessions = 126;
  for (
    let start = 0, fold = 1;
    start + trainSessions + validationSessions + auditSessions <=
    usableDates.length;
    start += stepSessions, fold++
  ) {
    const trainEnd = start + trainSessions;
    const validationEnd = trainEnd + validationSessions;
    const auditEnd = validationEnd + auditSessions;
    folds.push({
      fold,
      train: {
        start: usableDates[start],
        end: usableDates[trainEnd - 1],
      },
      validation: {
        start: usableDates[trainEnd],
        end: usableDates[validationEnd - 1],
      },
      audit: {
        start: usableDates[validationEnd],
        end: usableDates[auditEnd - 1],
      },
    });
  }
  return { dates, usableDates, folds };
}

function nextReplaySessionSlice(
  sessionDates = [],
  completedWindows = 0,
  maxWindows = REPLAY_WINDOWS_PER_RUN,
) {
  const { dates, folds } = buildV12ResearchFolds(sessionDates);
  const windowsPerFold = 3;
  const windowsPerCandidate = folds.length * windowsPerFold;
  const totalWindows = V12_ACTIVE_THESIS_COUNT * windowsPerCandidate;
  const completed = boundedInteger(completedWindows, 0, 0, totalWindows);
  if (completed >= totalWindows)
    return { complete: true, totalWindows, start: 0, end: 0 };
  const restoreCount = Math.min(
    boundedInteger(maxWindows, REPLAY_WINDOWS_PER_RUN, 1, totalWindows),
    totalWindows - completed,
  );
  const windows = Array.from({ length: restoreCount }, (_, offset) => {
    const candidateWindow = (completed + offset) % windowsPerCandidate;
    const foldIndex = Math.floor(candidateWindow / windowsPerFold);
    const windowIndex = candidateWindow % windowsPerFold;
    const fold = folds[foldIndex];
    return [fold.train, fold.validation, fold.audit][windowIndex];
  });
  const firstWindowDate = windows.reduce(
    (earliest, window) =>
      !earliest || window.start < earliest ? window.start : earliest,
    null,
  );
  const lastWindowDate = windows.reduce(
    (latest, window) => (!latest || window.end > latest ? window.end : latest),
    null,
  );
  const firstIndex = dates.findIndex((date) => date >= firstWindowDate);
  let lastIndex = firstIndex;
  while (lastIndex + 1 < dates.length && dates[lastIndex + 1] <= lastWindowDate)
    lastIndex++;
  if (firstIndex < 0 || lastIndex < firstIndex)
    throw new Error(
      `Replay windows ${firstWindowDate} to ${lastWindowDate} are unavailable`,
    );
  return {
    complete: false,
    totalWindows,
    restoredWindows: restoreCount,
    start: Math.max(0, firstIndex - REPLAY_WARMUP_SESSIONS),
    end: lastIndex + 1,
    startDate: dates[Math.max(0, firstIndex - REPLAY_WARMUP_SESSIONS)],
    endDate: dates[lastIndex],
  };
}

function assertCompleteResearchWindow(run, calendar, window, label) {
  const expectedSessions = calendar.filter(
    (date) => date >= window.start && date <= window.end,
  ).length;
  const curveLength = run?.curve?.length || 0;
  if (expectedSessions < 2 || curveLength !== expectedSessions)
    throw new Error(
      `${label} replay window is incomplete (${curveLength}/${expectedSessions} sessions)`,
    );
  const dailyReturns = run?.metrics?.dailyReturns;
  if (
    !Array.isArray(dailyReturns) ||
    dailyReturns.length !== expectedSessions - 1
  )
    throw new Error(`${label} replay returns are incomplete`);
  if (asArray(run?.unresolvedUniverseRemovals).length)
    throw new Error(`${label} replay has an unresolved mandatory removal exit`);
  for (const benchmark of ["SPY", "QQQ"]) {
    const comparison = run?.metrics?.benchmarkComparisons?.[benchmark];
    if (!comparison || !Number.isFinite(comparison.simpleReturnPct))
      throw new Error(`${label} replay is missing ${benchmark} attribution`);
  }
}

async function runProvisionalWindows(
  dataset,
  {
    initial = null,
    onCheckpoint = null,
    maxWindows = REPLAY_WINDOWS_PER_RUN,
    calendarDates = null,
    skipFullPeriodDiagnostic = false,
  } = {},
) {
  const sessions = dataset.sessions || [];
  const calendar =
    Array.isArray(calendarDates) && calendarDates.length
      ? calendarDates
      : sessions;
  const { usableDates, folds } = buildV12ResearchFolds(calendar);
  const grid = [v12StrategyOptions()];
  if (grid.length !== V12_ACTIVE_THESIS_COUNT)
    throw new Error("V12 replay thesis count is inconsistent");
  const auditControlDefinitions = v12AuditControlDefinitions();
  const candidateRuns = new Map();
  for (const candidate of asArray(initial?.candidateRuns)) {
    const index = number(candidate?.index);
    const expected = Number.isInteger(index) ? grid[index] : null;
    const normalizedFolds = new Map();
    for (const foldRun of asArray(candidate?.foldRuns)) {
      const foldIndex = folds.findIndex((fold) => fold.fold === foldRun?.fold);
      if (
        foldIndex < 0 ||
        JSON.stringify(foldRun?.windows) !== JSON.stringify(folds[foldIndex])
      )
        continue;
      const normalized = {
        fold: foldRun.fold,
        windows: folds[foldIndex],
      };
      for (const key of ["train", "validation", "rollingAudit"])
        if (foldRun?.[key]?.metrics) normalized[key] = foldRun[key];
      if (
        foldRun?.auditControls?.simpleMomentum?.metrics &&
        foldRun?.auditControls?.priorV11Weighting?.metrics &&
        foldRun?.auditControls?.ungovernedV12Entry?.metrics &&
        foldRun?.auditControls?.simpleQuality?.metrics &&
        foldRun?.auditControls?.transparentBullCyclePullback?.metrics &&
        asArray(foldRun?.auditControls?.randomPlacebos).length ===
          V12_DEVELOPMENT_PLACEBO_SEEDS
      )
        normalized.auditControls = foldRun.auditControls;
      if (normalized.train || normalized.validation || normalized.rollingAudit)
        normalizedFolds.set(normalized.fold, normalized);
    }
    const foldRuns = [...normalizedFolds.values()].sort(
      (left, right) => left.fold - right.fold,
    );
    const validFolds =
      new Set(foldRuns.map((foldRun) => foldRun.fold)).size === foldRuns.length;
    if (
      expected &&
      candidate?.parameters?.thesisId === expected.thesisId &&
      validFolds
    )
      candidateRuns.set(index, {
        index,
        parameters: expected,
        foldRuns,
      });
  }
  const windowKeys = ["train", "validation", "rollingAudit"];
  const boundedWindows = boundedInteger(
    maxWindows,
    1,
    0,
    grid.length * folds.length * windowKeys.length,
  );
  let computedWindows = 0;
  let workLimitReached = false;
  for (let index = 0; index < grid.length; index++) {
    const parameters = grid[index];
    const candidate = candidateRuns.get(index) || {
      index,
      parameters,
      foldRuns: [],
    };
    for (const fold of folds) {
      let foldRun = candidate.foldRuns.find((item) => item.fold === fold.fold);
      if (!foldRun) {
        foldRun = { fold: fold.fold, windows: fold };
        candidate.foldRuns.push(foldRun);
      }
      const windows = [
        ["train", fold.train],
        ["validation", fold.validation],
        ["rollingAudit", fold.audit],
      ];
      for (const [key, window] of windows) {
        if (foldRun[key]?.metrics) continue;
        if (computedWindows >= boundedWindows) {
          workLimitReached = true;
          break;
        }
        const activeRun = simulatePointInTimePortfolio(
          dataset,
          simulationOptions({
            ...parameters,
            startDate: window.start,
            endDate: window.end,
          }),
        );
        assertCompleteResearchWindow(
          activeRun,
          calendar.map((value) => String(value?.date || value || "")),
          window,
          `V12 ${key}`,
        );
        foldRun[key] = compactResearchRun(activeRun);
        if (key === "rollingAudit") {
          const controlRuns = auditControlDefinitions.map((control) => {
            const controlRun = simulatePointInTimePortfolio(
              dataset,
              simulationOptions({
                ...parameters,
                ...control,
                thesisId: control.controlId,
                thesisLabel: control.controlLabel,
                selectionEligible: false,
                startDate: window.start,
                endDate: window.end,
              }),
            );
            assertCompleteResearchWindow(
              controlRun,
              calendar.map((value) => String(value?.date || value || "")),
              window,
              control.controlLabel,
            );
            return compactResearchRun(controlRun);
          });
          foldRun.auditControls = {
            simpleMomentum: controlRuns[0],
            priorV11Weighting: controlRuns[1],
            ungovernedV12Entry: controlRuns[2],
            simpleQuality: controlRuns[3],
            transparentBullCyclePullback: controlRuns[4],
            randomPlacebos: Array.from(
              { length: V12_DEVELOPMENT_PLACEBO_SEEDS },
              (_, placeboIndex) => {
                const placeboRun = simulatePointInTimePortfolio(
                  dataset,
                  simulationOptions({
                    ...parameters,
                    thesisId: `random-placebo-${placeboIndex + 1}`,
                    thesisLabel: `Random placebo ${placeboIndex + 1}`,
                    selectionEligible: false,
                    researchRankMode: "random-placebo",
                    researchRandomSeed: placeboIndex + 1,
                    startDate: window.start,
                    endDate: window.end,
                  }),
                );
                assertCompleteResearchWindow(
                  placeboRun,
                  calendar.map((value) => String(value?.date || value || "")),
                  window,
                  `Random placebo ${placeboIndex + 1}`,
                );
                return compactPlaceboRun(placeboRun);
              },
            ),
          };
        }
        computedWindows++;
        candidate.foldRuns.sort((left, right) => left.fold - right.fold);
        candidateRuns.set(index, candidate);
        if (onCheckpoint) {
          const allCandidates = [...candidateRuns.values()];
          const allFoldRuns = allCandidates.flatMap((item) => item.foldRuns);
          const completedWindows = allFoldRuns.reduce(
            (total, item) =>
              total +
              windowKeys.filter((windowKey) => item[windowKey]?.metrics).length,
            0,
          );
          await onCheckpoint({
            schema: REPLAY_CHECKPOINT_SCHEMA,
            completedWindows,
            totalWindows: grid.length * folds.length * windowKeys.length,
            completedFolds: allFoldRuns.filter((item) =>
              windowKeys.every((windowKey) => item[windowKey]?.metrics),
            ).length,
            totalFolds: grid.length * folds.length,
            completedCandidates: allCandidates.filter(
              (item) =>
                item.foldRuns.length === folds.length &&
                item.foldRuns.every((candidateFold) =>
                  windowKeys.every(
                    (windowKey) => candidateFold[windowKey]?.metrics,
                  ),
                ),
            ).length,
            totalCandidates: grid.length,
            windowsPerFold: windowKeys.length,
            foldsPerCandidate: folds.length,
            candidateRuns: allCandidates.sort(
              (left, right) => left.index - right.index,
            ),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      candidate.foldRuns.sort((left, right) => left.fold - right.fold);
      candidateRuns.set(index, candidate);
      if (workLimitReached) break;
    }
    if (workLimitReached) break;
  }
  const allCandidates = [...candidateRuns.values()];
  const allFoldRuns = allCandidates.flatMap((candidate) => candidate.foldRuns);
  const completedWindows = allFoldRuns.reduce(
    (total, foldRun) =>
      total + windowKeys.filter((key) => foldRun[key]?.metrics).length,
    0,
  );
  const completedFolds = allFoldRuns.filter((foldRun) =>
    windowKeys.every((key) => foldRun[key]?.metrics),
  ).length;
  const completedCandidates = allCandidates.filter(
    (candidate) =>
      candidate.foldRuns.length === folds.length &&
      candidate.foldRuns.every((foldRun) =>
        windowKeys.every((key) => foldRun[key]?.metrics),
      ),
  ).length;
  const totalFolds = grid.length * folds.length;
  const totalWindows = totalFolds * windowKeys.length;
  const checkpoint = {
    schema: REPLAY_CHECKPOINT_SCHEMA,
    completedWindows,
    totalWindows,
    completedFolds,
    totalFolds,
    completedCandidates,
    totalCandidates: grid.length,
    windowsPerFold: windowKeys.length,
    foldsPerCandidate: folds.length,
    candidateRuns: [...candidateRuns.values()].sort(
      (left, right) => left.index - right.index,
    ),
  };
  // End an invocation after completing its bounded simulation window, even
  // when it finished the last window. The next invocation performs selection
  // and the full diagnostic from a completely durable checkpoint rather than
  // racing the function timeout after a long simulation.
  if (completedWindows < totalWindows || computedWindows > 0)
    return {
      status: "collecting",
      progress: {
        completedWindows,
        totalWindows,
        remainingWindows: totalWindows - completedWindows,
        completedFolds,
        totalFolds,
        completedCandidates,
        totalCandidates: grid.length,
        windowsPerFold: windowKeys.length,
        foldsPerCandidate: folds.length,
      },
      checkpoint,
    };

  const parameters = grid[0];
  const foldRuns = candidateRuns.get(0)?.foldRuns || [];
  if (foldRuns.length !== folds.length)
    throw new Error("The predeclared V12 thesis is missing completed folds");
  const train = aggregateResearchRuns(foldRuns.map((fold) => fold.train));
  const validation = aggregateResearchRuns(
    foldRuns.map((fold) => fold.validation),
  );
  const walkForwardAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.rollingAudit),
  );
  const simpleMomentumAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.simpleMomentum),
  );
  const priorV11WeightingAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.priorV11Weighting),
  );
  const ungovernedV12EntryAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.ungovernedV12Entry),
  );
  const simpleQualityAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.simpleQuality),
  );
  const transparentBullCyclePullbackAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.transparentBullCyclePullback),
  );
  const randomPlaceboAudits = Array.from(
    { length: V12_DEVELOPMENT_PLACEBO_SEEDS },
    (_, placeboIndex) =>
      aggregateResearchRuns(
        foldRuns.map((fold) => fold.auditControls.randomPlacebos[placeboIndex]),
      ),
  );
  const placeboTotalReturns = randomPlaceboAudits.map((run) =>
    number(run.metrics?.totalReturnPct, -Infinity),
  );
  const placeboSimpleAlphaVsSpy = randomPlaceboAudits.map((run) =>
    number(run.metrics?.benchmarkComparisons?.SPY?.excessReturnPct, -Infinity),
  );
  const placeboSimpleAlphaVsQqq = randomPlaceboAudits.map((run) =>
    number(run.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct, -Infinity),
  );
  const controls = {
    sameLifecycleAndCosts: true,
    simpleMomentum: metricsSummary(simpleMomentumAudit, {
      tradeLimit: 40,
      skippedLimit: 0,
    }),
    priorV11Weighting: metricsSummary(priorV11WeightingAudit, {
      tradeLimit: 40,
      skippedLimit: 0,
    }),
    ungovernedV12Entry: metricsSummary(ungovernedV12EntryAudit, {
      tradeLimit: 40,
      skippedLimit: 0,
    }),
    simpleQuality: metricsSummary(simpleQualityAudit, {
      tradeLimit: 40,
      skippedLimit: 0,
    }),
    transparentBullCyclePullback: metricsSummary(
      transparentBullCyclePullbackAudit,
      {
        tradeLimit: 40,
        skippedLimit: 0,
      },
    ),
    randomPlacebo: {
      seedCount: V12_DEVELOPMENT_PLACEBO_SEEDS,
      construction:
        "stable random symbol ranks with the same universe, sizing, rebalance clock, exits and costs",
      medianTotalReturnPct: roundMetric(
        percentileValue(placeboTotalReturns, 0.5),
      ),
      percentile95TotalReturnPct: roundMetric(
        percentileValue(placeboTotalReturns, 0.95),
      ),
      percentile95SimpleAlphaVsSpyPct: roundMetric(
        percentileValue(placeboSimpleAlphaVsSpy, 0.95),
      ),
      percentile95SimpleAlphaVsQqqPct: roundMetric(
        percentileValue(placeboSimpleAlphaVsQqq, 0.95),
      ),
      runs: randomPlaceboAudits.map((run, index) => ({
        seed: index + 1,
        totalReturnPct: number(run.metrics?.totalReturnPct),
        simpleAlphaVsSpyPct: number(
          run.metrics?.benchmarkComparisons?.SPY?.excessReturnPct,
        ),
        simpleAlphaVsQqqPct: number(
          run.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct,
        ),
      })),
      strictPointInTimeRequirement:
        V12_EVIDENCE_REQUIREMENTS.strictPointInTimePlaceboSeeds,
    },
  };
  const auditFolds = foldRuns.map((fold) => ({
    fold: fold.fold,
    windows: fold.windows,
    selectedParameters: parameters,
    selectionScore: null,
    audit: fold.rollingAudit,
  }));
  const simpleAlphaByFold = auditFolds.map((fold) =>
    number(fold.audit.metrics?.benchmarkComparisons?.SPY?.excessReturnPct),
  );
  const qqqSimpleAlphaByFold = auditFolds.map((fold) =>
    number(fold.audit.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct),
  );
  const exposureMatchedAlphaByFold = auditFolds.map((fold) =>
    number(fold.audit.metrics?.exposureMatchedAlphaPct),
  );
  const profitFactorByFold = auditFolds.map((fold) =>
    number(fold.audit.metrics?.profitFactor),
  );
  const returnByFold = auditFolds.map((fold) =>
    number(fold.audit.metrics?.totalReturnPct),
  );
  const walkForwardMetrics = walkForwardAudit.metrics || {};
  const thesisTotalReturn = number(
    walkForwardMetrics.totalReturnPct,
    -Infinity,
  );
  const thesisMaxDrawdown = Math.abs(
    number(walkForwardMetrics.maxDrawdownPct, -Infinity),
  );
  const ungovernedMetrics = ungovernedV12EntryAudit.metrics || {};
  const ungovernedTotalReturn = number(
    ungovernedMetrics.totalReturnPct,
    -Infinity,
  );
  const ungovernedMaxDrawdown = Math.abs(
    number(ungovernedMetrics.maxDrawdownPct, -Infinity),
  );
  const thesisReturnToDrawdown =
    thesisMaxDrawdown > 0 ? thesisTotalReturn / thesisMaxDrawdown : -Infinity;
  const ungovernedReturnToDrawdown =
    ungovernedMaxDrawdown > 0
      ? ungovernedTotalReturn / ungovernedMaxDrawdown
      : -Infinity;
  const evidenceChecks = {
    positiveAggregateSimpleAlphaVsSpy:
      number(
        walkForwardMetrics.benchmarkComparisons?.SPY?.excessReturnPct,
        -Infinity,
      ) > 0,
    positiveAggregateSimpleAlphaVsQqq:
      number(
        walkForwardMetrics.benchmarkComparisons?.QQQ?.excessReturnPct,
        -Infinity,
      ) > 0,
    positiveAggregateReturn: thesisTotalReturn > 0,
    positiveExpectancy:
      number(walkForwardMetrics.tradeDiagnostics?.expectancyPct, -Infinity) > 0,
    profitFactorAboveOne:
      number(walkForwardMetrics.profitFactor, -Infinity) > 1,
    beatsSpyInMajorityOfFolds:
      simpleAlphaByFold.filter((value) => value > 0).length > folds.length / 2,
    beatsQqqInMajorityOfFolds:
      qqqSimpleAlphaByFold.filter((value) => value > 0).length >
      folds.length / 2,
    beatsPriorV11WeightingControl:
      thesisTotalReturn >
      number(priorV11WeightingAudit.metrics?.totalReturnPct, Infinity),
    beatsSimpleMomentumControl:
      thesisTotalReturn >
      number(simpleMomentumAudit.metrics?.totalReturnPct, Infinity),
    entryGovernorImprovesSharpe:
      number(walkForwardMetrics.sharpe, -Infinity) >
      number(ungovernedMetrics.sharpe, Infinity),
    entryGovernorReducesMaximumDrawdown:
      thesisMaxDrawdown < ungovernedMaxDrawdown,
    entryGovernorImprovesReturnToDrawdown:
      thesisReturnToDrawdown > ungovernedReturnToDrawdown,
    beatsSimpleQualityControl:
      thesisTotalReturn >
      number(simpleQualityAudit.metrics?.totalReturnPct, Infinity),
    beatsTransparentBullCyclePullbackControl:
      thesisTotalReturn >
      number(
        transparentBullCyclePullbackAudit.metrics?.totalReturnPct,
        Infinity,
      ),
    beatsRandomPlacebo95thPercentile:
      thesisTotalReturn > percentileValue(placeboTotalReturns, 0.95),
    minimumClosedRoundTrips:
      number(walkForwardMetrics.closedTrades, 0) >=
      V12_EVIDENCE_REQUIREMENTS.minimumClosedRoundTrips,
    minimumActiveStockExposure:
      number(walkForwardMetrics.averageActiveExposurePct, 0) >=
      V12_EVIDENCE_REQUIREMENTS.minimumAverageActiveStockExposurePct,
    noBenchmarkCompletionSleeve:
      parameters.benchmarkCompletionSymbol == null &&
      number(walkForwardMetrics.averageBenchmarkSleevePct, 0) === 0,
  };
  const developmentPerformancePass =
    Object.values(evidenceChecks).every(Boolean);
  const candidate = {
    index: 0,
    parameters,
    selectionPolicy: "single-predeclared-thesis-no-selector",
    train: metricsSummary(train, { tradeLimit: 80, skippedLimit: 30 }),
    validation: metricsSummary(validation, {
      tradeLimit: 80,
      skippedLimit: 30,
    }),
    rollingAudit: metricsSummary(walkForwardAudit, {
      tradeLimit: 80,
      skippedLimit: 30,
    }),
    folds: foldRuns.map((fold) => ({
      fold: fold.fold,
      windows: fold.windows,
      train: metricsSummary(fold.train, { tradeLimit: 0, skippedLimit: 0 }),
      validation: metricsSummary(fold.validation, {
        tradeLimit: 0,
        skippedLimit: 0,
      }),
      rollingAudit: metricsSummary(fold.rollingAudit, {
        tradeLimit: 0,
        skippedLimit: 0,
      }),
    })),
  };
  const full = skipFullPeriodDiagnostic
    ? null
    : simulatePointInTimePortfolio(
        dataset,
        simulationOptions({
          ...parameters,
          startDate: usableDates[0],
          endDate: usableDates.at(-1),
        }),
      );
  return {
    status: "complete",
    replay: {
      windows: { folds },
      selectedParameters: parameters,
      selectionScore: null,
      selectionPolicy: "single-predeclared-thesis-no-selector",
      candidates: [candidate],
      rollingRegimeAudit: candidate.rollingAudit,
      walkForwardSelectionAudit: {
        selectionPolicy: "single-predeclared-thesis-no-selector",
        primaryComparison: "simple total-return difference versus SPY and QQQ",
        exposureMatchedAttributionIsSecondaryOnly: true,
        summary: metricsSummary(walkForwardAudit, {
          tradeLimit: 120,
          skippedLimit: 40,
        }),
        controls,
        folds: auditFolds.map(({ audit, ...fold }) => ({
          ...fold,
          audit: metricsSummary(audit, { tradeLimit: 0, skippedLimit: 0 }),
        })),
        stability: {
          positiveSimpleAlphaFolds: simpleAlphaByFold.filter(
            (value) => value > 0,
          ).length,
          positiveSimpleAlphaVsQqqFolds: qqqSimpleAlphaByFold.filter(
            (value) => value > 0,
          ).length,
          positiveExposureMatchedAlphaFolds: exposureMatchedAlphaByFold.filter(
            (value) => value > 0,
          ).length,
          positiveReturnFolds: returnByFold.filter((value) => value > 0).length,
          profitFactorAboveOneFolds: profitFactorByFold.filter(
            (value) => value > 1,
          ).length,
          foldCount: folds.length,
          worstSimpleAlphaPct: Math.min(...simpleAlphaByFold),
          medianSimpleAlphaPct: percentileValue(simpleAlphaByFold, 0.5),
          worstSimpleAlphaVsQqqPct: Math.min(...qqqSimpleAlphaByFold),
          medianSimpleAlphaVsQqqPct: percentileValue(qqqSimpleAlphaByFold, 0.5),
          worstExposureMatchedAlphaPct: Math.min(...exposureMatchedAlphaByFold),
          medianExposureMatchedAlphaPct: percentileValue(
            exposureMatchedAlphaByFold,
            0.5,
          ),
        },
        evidenceAssessment: {
          status: developmentPerformancePass
            ? "promising-post-selection-requires-fresh-holdout"
            : "alpha-not-demonstrated",
          pass: false,
          developmentPerformancePass,
          independentEvidencePass: false,
          postSelectedFromV11Diagnostics: true,
          freshIndependentHoldoutUsed: false,
          checks: evidenceChecks,
          minimumClosedRoundTrips:
            V12_EVIDENCE_REQUIREMENTS.minimumClosedRoundTrips,
          minimumAverageActiveStockExposurePct:
            V12_EVIDENCE_REQUIREMENTS.minimumAverageActiveStockExposurePct,
          primaryAlphaMeasure: V12_EVIDENCE_REQUIREMENTS.primaryAlphaMeasure,
          selectorUsed: false,
          benchmarkCompletionSleeveUsed: false,
          developmentPlaceboSeeds: V12_DEVELOPMENT_PLACEBO_SEEDS,
          strictPointInTimePlaceboRequirement:
            V12_EVIDENCE_REQUIREMENTS.strictPointInTimePlaceboSeeds,
          capitalClaimAuthorized: false,
        },
      },
      reusedTestAudit: candidate.rollingAudit,
      untouchedTest: null,
      fullPeriodDiagnostic: full ? metricsSummary(full) : null,
    },
  };
}

function boundedReviewExperimentSummary(run) {
  const metrics = run?.metrics || {};
  const diagnostics = metrics.tradeDiagnostics || {};
  return {
    totalReturnPct: number(metrics.totalReturnPct),
    sharpe: number(metrics.sharpe),
    maxDrawdownPct: number(metrics.maxDrawdownPct),
    profitFactor: number(metrics.profitFactor),
    expectancyPct: number(metrics.tradeDiagnostics?.expectancyPct),
    closedTrades: number(metrics.closedTrades, 0),
    averageActiveExposurePct: number(metrics.averageActiveExposurePct),
    annualizedTurnoverPct: number(metrics.annualizedTurnoverPct),
    rankRegimeDiagnostics: metrics.rankRegimeDiagnostics || null,
    simpleDifferenceVsSpyPct: number(
      metrics.benchmarkComparisons?.SPY?.excessReturnPct,
    ),
    simpleDifferenceVsQqqPct: number(
      metrics.benchmarkComparisons?.QQQ?.excessReturnPct,
    ),
    exposureMatchedAlphaPct: number(metrics.exposureMatchedAlphaPct),
    boundedReviewExits: asArray(run?.trades).filter(
      (trade) => trade?.reason === "bounded-review-expiry",
    ).length,
    tradeLifecycle: {
      winRatePct: number(metrics.winRatePct),
      medianReturnPct: number(diagnostics.medianReturnPct, null),
      averageWinnerPct: number(diagnostics.averageWinnerPct, null),
      averageLoserPct: number(diagnostics.averageLoserPct, null),
      winLossPayoffRatio: number(diagnostics.winLossPayoffRatio, null),
      averageHoldingSessions: number(
        diagnostics.averageHoldingSessions,
        null,
      ),
      averageMfePct: number(diagnostics.averageMfePct, null),
      averageMaePct: number(diagnostics.averageMaePct, null),
      stopOutRatePct: number(diagnostics.stopOutRatePct, null),
      exitsByReason: diagnostics.exitsByReason || {},
    },
  };
}

// Development-only comparison on the already compiled V11/V12 research
// history. It does not create fresh evidence: the dates and current-cohort
// limitations are deliberately inherited from the published research report.
export async function runV11BoundedReviewExperiment({ force = false } = {}) {
  const existing = await getV11BoundedReviewExperiment();
  if (!force && existing?.status === "complete") return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const window = {
    start: V11_FORWARD_EXTENSION_START,
    end: V11_FORWARD_EXTENSION_TARGET,
  };
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= window.start &&
      String(chunk?.firstDate || "") <= window.end,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const calendar = asArray(manifest.sessionDates);
  if (restored.length !== calendar.length)
    throw new Error(
      `Compiled research restore is incomplete (${restored.length}/${calendar.length})`,
    );
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const { folds } = buildV12ResearchFolds(calendar);
  const baselineFolds = [];
  const candidateFolds = [];
  const reviewOnlyReunderwrite = (args) => {
    const result = reunderwriteExistingPosition(args);
    if (result?.action === "Review") return result;
    return {
      override: false,
      action: "Hold",
      reason: result?.reason || "",
      status: result?.status || "Hold",
    };
  };
  for (const fold of folds) {
    const window = fold.audit;
    const common = v11StrategyOptions({
      startDate: window.start,
      endDate: window.end,
    });
    const baseline = simulatePointInTimePortfolio(
      dataset,
      simulationOptions(common),
    );
    const candidate = simulatePointInTimePortfolio(
      dataset,
      simulationOptions({
        ...common,
        // Keep V11 entry/rank/stop policy fixed. Only the Review state is added.
        positionDecision: () => ({ action: "Hold", reason: "" }),
        portfolioRiskSnapshot,
        swingTimeReview,
        positionReunderwrite: reviewOnlyReunderwrite,
        ignoreSignalPositionActions: false,
        boundedReviewEnabled: true,
        boundedReviewDeadlineSessions: 2,
        boundedOpportunityReviewDeadlineSessions: 1,
      }),
    );
    assertCompleteResearchWindow(baseline, calendar, window, "V11 baseline");
    assertCompleteResearchWindow(
      candidate,
      calendar,
      window,
      "V11 bounded Review",
    );
    baselineFolds.push(baseline);
    candidateFolds.push(candidate);
  }
  const baseline = aggregateResearchRuns(baselineFolds);
  const candidate = aggregateResearchRuns(candidateFolds);
  const baselineSummary = boundedReviewExperimentSummary(baseline);
  const candidateSummary = boundedReviewExperimentSummary(candidate);
  const foldReturnDifferencesPct = candidateFolds.map(
    (run, index) =>
      number(run.metrics?.totalReturnPct) -
      number(baselineFolds[index]?.metrics?.totalReturnPct),
  );
  const checks = {
    improvesTotalReturn:
      candidateSummary.totalReturnPct > baselineSummary.totalReturnPct,
    doesNotReduceSharpe: candidateSummary.sharpe >= baselineSummary.sharpe,
    doesNotIncreaseMaximumDrawdown:
      Math.abs(candidateSummary.maxDrawdownPct) <=
      Math.abs(baselineSummary.maxDrawdownPct),
    doesNotReduceProfitFactor:
      candidateSummary.profitFactor >= baselineSummary.profitFactor,
    improvesMajorityOfFolds:
      foldReturnDifferencesPct.filter((value) => value > 0).length >
      foldReturnDifferencesPct.length / 2,
    boundedReviewActuallyTriggered: candidateSummary.boundedReviewExits > 0,
    turnoverIncreaseBelowFiftyPercent:
      candidateSummary.annualizedTurnoverPct <=
      baselineSummary.annualizedTurnoverPct * 1.5,
  };
  const result = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    experiment: "V11 plus two-session bounded Review (one session for opportunity cost)",
    productionChanged: false,
    implementationPass: Object.values(checks).every(Boolean),
    checks,
    auditWindows: folds.map((fold) => fold.audit),
    baseline: baselineSummary,
    candidate: candidateSummary,
    foldReturnDifferencesPct,
    evidenceAssessment: {
      developmentOnly: true,
      freshIndependentHoldout: false,
      eligibleForAlphaClaim: false,
      sameHistoricalDatesAsPriorResearch: true,
    },
    limitations: [
      "The cohort is today's surviving research universe, not point-in-time index membership.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
      "This is a matched reused-data sensitivity test, not fresh independent validation.",
    ],
  };
  await persistPrivateJson(V11_REVIEW_EXPERIMENT_STORE, result);
  return result;
}

export function v11StressScenarioDefinitions() {
  return [
    { id: "baseline", label: "Frozen V11 baseline", overrides: {} },
    {
      id: "cost-25bps",
      label: "25 bps slippage per order",
      overrides: { slippageBps: 25 },
    },
    {
      id: "cost-50bps",
      label: "50 bps slippage per order",
      overrides: { slippageBps: 50 },
    },
    {
      id: "ten-position",
      label: "Ten-position portfolio",
      overrides: {
        rankedTargetCount: 10,
        rankedExitBuffer: 10,
        maxPositions: 10,
        buyTargetPct: 0.099,
        strongBuyTargetPct: 0.099,
        buyMaxPositionPct: 0.102,
        strongBuyMaxPositionPct: 0.102,
        maxSectorPositions: 3,
        maxSectorPct: 0.31,
      },
    },
    {
      id: "fifteen-position",
      label: "Fifteen-position portfolio",
      overrides: {
        rankedTargetCount: 15,
        rankedExitBuffer: 15,
        maxPositions: 15,
        buyTargetPct: 0.066,
        strongBuyTargetPct: 0.066,
        buyMaxPositionPct: 0.068,
        strongBuyMaxPositionPct: 0.068,
        maxSectorPositions: 5,
      },
    },
    {
      id: "slow-cycle",
      label: "Ten-session rebalance and fifteen-session minimum hold",
      overrides: {
        rankedRebalanceSessions: 10,
        rankedMinimumHoldSessions: 15,
      },
    },
    {
      id: "fast-cycle",
      label: "Three-session rebalance and five-session minimum hold",
      overrides: {
        rankedRebalanceSessions: 3,
        rankedMinimumHoldSessions: 5,
      },
    },
    {
      id: "confirmed-entry",
      label: "Two-session rank qualification before entry",
      overrides: { minimumQualifiedSessions: 2 },
    },
    {
      id: "tight-gap",
      label: "Two-percent maximum opening gap",
      overrides: { maxEntryGapPct: 2 },
    },
    {
      id: "tight-sector",
      label: "Two names and twenty-two percent per sector",
      overrides: { maxSectorPositions: 2, maxSectorPct: 0.22 },
    },
  ];
}

function realizedWinnerConcentration(runs = []) {
  const positions = new Map();
  runs.forEach((run, runIndex) => {
    asArray(run?.trades).forEach((trade) => {
      if (trade?.side !== "sell" || !Number.isFinite(Number(trade.realizedPnl)))
        return;
      const key = `${runIndex}:${trade.positionId}`;
      positions.set(key, number(positions.get(key), 0) + number(trade.realizedPnl));
    });
  });
  const winners = [...positions.values()].filter((value) => value > 0);
  const totalWinnerProfit = winners.reduce((sum, value) => sum + value, 0);
  const topFiveProfit = winners
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0);
  return {
    profitableRoundTrips: winners.length,
    topFiveShareOfGrossWinnerProfitPct: totalWinnerProfit
      ? roundMetric((topFiveProfit / totalWinnerProfit) * 100)
      : null,
  };
}

export async function runV11StressTest({ force = false } = {}) {
  const existing = await getV11StressTestReport();
  if (!force && existing?.status === "complete") return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const restored = [];
  for (const chunk of manifest.chunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const calendar = asArray(manifest.sessionDates);
  if (restored.length !== calendar.length)
    throw new Error(
      `Compiled research restore is incomplete (${restored.length}/${calendar.length})`,
    );
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const { folds } = buildV12ResearchFolds(calendar);
  const scenarios = [];
  for (const definition of v11StressScenarioDefinitions()) {
    const foldRuns = [];
    for (const fold of folds) {
      const run = simulatePointInTimePortfolio(
        dataset,
        simulationOptions(
          v11StrategyOptions({
            ...definition.overrides,
            startDate: fold.audit.start,
            endDate: fold.audit.end,
          }),
        ),
      );
      assertCompleteResearchWindow(
        run,
        calendar,
        fold.audit,
        `V11 stress ${definition.id}`,
      );
      foldRuns.push(run);
    }
    const aggregate = aggregateResearchRuns(foldRuns);
    const summary = boundedReviewExperimentSummary(aggregate);
    const foldResults = foldRuns.map((run, index) => ({
      fold: folds[index].fold,
      window: folds[index].audit,
      totalReturnPct: number(run.metrics?.totalReturnPct),
      simpleDifferenceVsSpyPct: number(
        run.metrics?.benchmarkComparisons?.SPY?.excessReturnPct,
      ),
      simpleDifferenceVsQqqPct: number(
        run.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct,
      ),
      maxDrawdownPct: number(run.metrics?.maxDrawdownPct),
    }));
    scenarios.push({
      id: definition.id,
      label: definition.label,
      overrides: definition.overrides,
      ...summary,
      ...realizedWinnerConcentration(foldRuns),
      positiveReturnFolds: foldResults.filter((fold) => fold.totalReturnPct > 0)
        .length,
      positiveSimpleDifferenceVsSpyFolds: foldResults.filter(
        (fold) => fold.simpleDifferenceVsSpyPct > 0,
      ).length,
      positiveSimpleDifferenceVsQqqFolds: foldResults.filter(
        (fold) => fold.simpleDifferenceVsQqqPct > 0,
      ).length,
      folds: foldResults,
    });
  }
  const baseline = scenarios.find((scenario) => scenario.id === "baseline");
  const stressed = scenarios.filter((scenario) => scenario.id !== "baseline");
  const median = (key) =>
    roundMetric(percentileValue(stressed.map((row) => number(row[key])), 0.5));
  const positiveVsBoth = stressed.filter(
    (row) =>
      row.simpleDifferenceVsSpyPct > 0 && row.simpleDifferenceVsQqqPct > 0,
  ).length;
  const checks = {
    baselineReproduced:
      baseline && Math.abs(number(baseline.totalReturnPct) - 49.55) <= 0.15,
    everyStressHasPositiveAbsoluteReturn: stressed.every(
      (row) => row.totalReturnPct > 0,
    ),
    medianStressBeatsSpy: median("simpleDifferenceVsSpyPct") > 0,
    medianStressBeatsQqq: median("simpleDifferenceVsQqqPct") > 0,
    atLeastTwoThirdsBeatBothBenchmarks:
      positiveVsBoth / Math.max(1, stressed.length) >= 2 / 3,
    everyStressPositiveInMajorityOfFolds: stressed.every(
      (row) => row.positiveReturnFolds >= 2,
    ),
    fiftyBasisPointCostStillBeatsBoth: (() => {
      const row = scenarios.find((item) => item.id === "cost-50bps");
      return (
        row?.simpleDifferenceVsSpyPct > 0 &&
        row?.simpleDifferenceVsQqqPct > 0
      );
    })(),
    noStressDrawdownWorseThanFortyFivePercent: stressed.every(
      (row) => Math.abs(row.maxDrawdownPct) <= 45,
    ),
    baselineNotDominatedByFiveWinners:
      number(baseline?.topFiveShareOfGrossWinnerProfitPct, 100) < 50,
  };
  const report = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    thesis: "Frozen V11 momentum-dominant quality leadership blend",
    productionChanged: false,
    scenarioCount: scenarios.length,
    foldCount: folds.length,
    auditWindows: folds.map((fold) => fold.audit),
    robustnessPass: Object.values(checks).every(Boolean),
    checks,
    distribution: {
      stressedScenarioCount: stressed.length,
      scenariosBeatingBothBenchmarks: positiveVsBoth,
      medianTotalReturnPct: median("totalReturnPct"),
      medianSimpleDifferenceVsSpyPct: median("simpleDifferenceVsSpyPct"),
      medianSimpleDifferenceVsQqqPct: median("simpleDifferenceVsQqqPct"),
      worstTotalReturnPct: Math.min(
        ...stressed.map((row) => number(row.totalReturnPct)),
      ),
      worstMaxDrawdownPct: Math.min(
        ...stressed.map((row) => number(row.maxDrawdownPct)),
      ),
    },
    scenarios,
    evidenceAssessment: {
      developmentRobustnessTest: true,
      freshIndependentHoldout: false,
      eligibleForAlphaClaim: false,
      productionPolicySelectionChanged: false,
      firstLiveSessionIncludedInHistoricalReplay: false,
    },
    limitations: [
      "The stress suite reuses the prior V11 development/audit dates and is not fresh independent evidence.",
      "The cohort is today's surviving research universe rather than point-in-time membership.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
      "One completed live V11 session is tracked forward but is statistically insufficient for a performance conclusion.",
    ],
  };
  await persistPrivateJson(V11_STRESS_TEST_STORE, report);
  return report;
}

// Rapid reused-data audit for the exact quality-led candidate that won the
// bounded chronological extension. Only the three prior audit windows are
// restored, keeping the request memory-bounded while preserving the same
// point-in-time signals and next-open execution contract.
export async function runQualityConfirmedHistoricalAudit({ force = false } = {}) {
  const existing = await getQualityConfirmedHistoricalAudit();
  if (!force && existing?.status === "complete") return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const { folds } = buildV12ResearchFolds(calendar);
  const auditWindows = folds.map((fold) => fold.audit);
  const unionWindow = {
    start: auditWindows[0].start,
    end: auditWindows[auditWindows.length - 1].end,
  };
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= unionWindow.start &&
      String(chunk?.firstDate || "") <= unionWindow.end,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const parameters = {
    researchRankMode: "quality-only",
    requireEntryTimingPass: true,
    minimumQualifiedSessions: 2,
    rankedRebalanceSessions: 10,
    rankedMinimumHoldSessions: 15,
  };
  const foldRuns = auditWindows.map((window, index) => {
    const run = simulatePointInTimePortfolio(
      dataset,
      simulationOptions(
        v11StrategyOptions({
          ...parameters,
          thesisId: "quality-confirmed-slow-cycle",
          thesisLabel: "Quality leadership with confirmed entry and slower rotation",
          startDate: window.start,
          endDate: window.end,
        }),
      ),
    );
    assertCompleteResearchWindow(
      run,
      calendar,
      window,
      `Quality confirmed historical fold ${index + 1}`,
    );
    return run;
  });
  const aggregate = aggregateResearchRuns(foldRuns);
  const metrics = boundedReviewExperimentSummary(aggregate);
  const foldResults = foldRuns.map((run, index) => ({
    fold: folds[index].fold,
    window: auditWindows[index],
    ...boundedReviewExperimentSummary(run),
  }));
  const checks = {
    positiveReturn: metrics.totalReturnPct > 0,
    beatsSpy: metrics.simpleDifferenceVsSpyPct > 0,
    beatsQqq: metrics.simpleDifferenceVsQqqPct > 0,
    positiveSharpe: metrics.sharpe > 0,
    positiveExpectancy: metrics.expectancyPct > 0,
    profitFactorAboveOne: metrics.profitFactor > 1,
    drawdownBelowTwentyPercent: Math.abs(metrics.maxDrawdownPct) < 20,
    minimumClosedTrades: metrics.closedTrades >= 20,
    positiveReturnInMajorityOfFolds:
      foldResults.filter((fold) => fold.totalReturnPct > 0).length >= 2,
    beatsSpyInMajorityOfFolds:
      foldResults.filter((fold) => fold.simpleDifferenceVsSpyPct > 0).length >= 2,
    beatsQqqInMajorityOfFolds:
      foldResults.filter((fold) => fold.simpleDifferenceVsQqqPct > 0).length >= 2,
  };
  const report = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    thesisId: "quality-confirmed-slow-cycle",
    thesis: "Quality leadership with confirmed entry and slower rotation",
    parameters,
    productionChanged: false,
    auditWindows,
    metrics,
    folds: foldResults,
    checks,
    historicalGatePass: Object.values(checks).every(Boolean),
    evidenceAssessment: {
      reusedHistoricalAuditDates: true,
      chronologicallySubsequentForwardResultAvailable: true,
      independentlySelectedHoldout: false,
      eligibleForAlphaClaim: false,
    },
    limitations: [
      "The candidate was selected after inspecting the short forward extension and is therefore post-selected.",
      "The historical windows reuse prior research dates rather than providing a fresh sealed holdout.",
      "The cohort is today's surviving research universe rather than point-in-time membership.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
    ],
  };
  await persistPrivateJson(QUALITY_CONFIRMED_HISTORICAL_STORE, report);
  return report;
}

export async function runFactorLeadershipAudit({ force = false } = {}) {
  const existing = await getFactorLeadershipAudit();
  if (!force && existing?.status === "complete") return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const { folds } = buildV12ResearchFolds(calendar);
  const historicalWindows = folds.map((fold) => fold.audit);
  const forwardWindow = {
    start: V11_FORWARD_EXTENSION_START,
    end: V11_FORWARD_EXTENSION_TARGET,
  };
  const allWindows = [...historicalWindows, forwardWindow];
  const unionWindow = {
    start: allWindows[0].start,
    end: allWindows[allWindows.length - 1].end,
  };
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= unionWindow.start &&
      String(chunk?.firstDate || "") <= unionWindow.end,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const parameters = {
    researchRankMode: "adaptive-factor-leadership",
    requireEntryTimingPass: true,
    minimumQualifiedSessions: 2,
    rankedRebalanceSessions: 5,
    rankedMinimumHoldSessions: 10,
  };
  const runs = allWindows.map((window, index) => {
    const run = simulatePointInTimePortfolio(
      dataset,
      simulationOptions(
        v11StrategyOptions({
          ...parameters,
          thesisId: "adaptive-factor-leadership",
          thesisLabel: "Causal five-session quality/momentum leadership rotation",
          startDate: window.start,
          endDate: window.end,
        }),
      ),
    );
    assertCompleteResearchWindow(
      run,
      calendar,
      window,
      `Adaptive factor leadership window ${index + 1}`,
    );
    return run;
  });
  const historicalRuns = runs.slice(0, historicalWindows.length);
  const historical = boundedReviewExperimentSummary(
    aggregateResearchRuns(historicalRuns),
  );
  const forward = boundedReviewExperimentSummary(runs.at(-1));
  const foldResults = historicalRuns.map((run, index) => ({
    fold: folds[index].fold,
    window: historicalWindows[index],
    ...boundedReviewExperimentSummary(run),
  }));
  const checks = {
    historicalPositiveReturn: historical.totalReturnPct > 0,
    historicalBeatsSpy: historical.simpleDifferenceVsSpyPct > 0,
    historicalBeatsQqq: historical.simpleDifferenceVsQqqPct > 0,
    historicalPositiveExpectancy: historical.expectancyPct > 0,
    historicalProfitFactorAboveOne: historical.profitFactor > 1,
    historicalDrawdownBelowTwentyFivePercent:
      Math.abs(historical.maxDrawdownPct) < 25,
    forwardPositiveReturn: forward.totalReturnPct > 0,
    forwardBeatsSpy: forward.simpleDifferenceVsSpyPct > 0,
    forwardBeatsQqq: forward.simpleDifferenceVsQqqPct > 0,
    forwardPositiveExpectancy: forward.expectancyPct > 0,
    forwardProfitFactorAboveOne: forward.profitFactor > 1,
    positiveHistoricalReturnInMajorityOfFolds:
      foldResults.filter((fold) => fold.totalReturnPct > 0).length >= 2,
    historicalBeatsSpyInMajorityOfFolds:
      foldResults.filter((fold) => fold.simpleDifferenceVsSpyPct > 0).length >= 2,
    historicalBeatsQqqInMajorityOfFolds:
      foldResults.filter((fold) => fold.simpleDifferenceVsQqqPct > 0).length >= 2,
  };
  const report = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    thesisId: "adaptive-factor-leadership",
    thesis: "Causal five-session quality/momentum leadership rotation",
    parameters,
    productionChanged: false,
    historicalWindows,
    forwardWindow,
    historical,
    forward,
    folds: foldResults,
    checks,
    pilotEligible: Object.values(checks).every(Boolean),
    evidenceAssessment: {
      causalInputsOnly: true,
      reusedHistoricalAuditDates: true,
      forwardWindowPostSelected: true,
      independentlySelectedHoldout: false,
      eligibleForAlphaClaim: false,
    },
    limitations: [
      "The factor switch was designed after inspecting prior component results and is post-selected.",
      "The historical windows reuse earlier audit dates and the forward window is short.",
      "The cohort is today's surviving research universe rather than point-in-time membership.",
      "Delisted securities, complete delisting returns, revision-safe fundamentals, and historical material-news coverage are unavailable.",
    ],
  };
  await persistPrivateJson(FACTOR_LEADERSHIP_AUDIT_STORE, report);
  return report;
}

function pricePatternCandidateDefinitions() {
  return [
    {
      id: "dual-horizon-momentum",
      label: "Dual-horizon price momentum",
      weights: { return120Ex20: 0.5, return60Ex5: 0.35, return20: 0.15 },
    },
    {
      id: "skip-short-chase",
      label: "Dual-horizon momentum with short-run chase penalty",
      weights: { return120Ex20: 0.55, return60Ex5: 0.45, return5: -0.25 },
    },
    {
      id: "momentum-pullback",
      label: "Intermediate momentum with controlled pullback",
      weights: {
        return120Ex20: 0.45,
        return60Ex5: 0.35,
        return5: -0.15,
        controlledPullbackScore: 0.12,
      },
    },
    {
      id: "low-volatility-momentum",
      label: "Low-volatility medium-term momentum",
      weights: {
        return120Ex20: 0.5,
        return60Ex5: 0.35,
        volatility60Pct: -0.2,
      },
    },
    {
      id: "benchmark-relative-momentum",
      label: "Benchmark-relative medium-term momentum",
      weights: {
        return120Ex20: 0.35,
        return60Ex5: 0.25,
        alpha60VsSpy: 0.25,
        alpha60VsQqq: 0.15,
      },
    },
    {
      id: "momentum-acceleration",
      label: "Momentum acceleration without short-run chasing",
      weights: {
        return120Ex20: 0.35,
        return60Ex5: 0.45,
        return20: 0.2,
        return5: -0.1,
      },
    },
  ];
}

export async function runPricePatternModelSearch({ force = false } = {}) {
  const existing = await getPricePatternModelSearch();
  if (!force && existing?.status === "complete") return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const { folds } = buildV12ResearchFolds(calendar);
  const developmentWindows = folds.slice(0, 2).map((fold) => fold.audit);
  const sealedHistoricalWindow = folds.at(-1).audit;
  const forwardWindow = {
    start: V11_FORWARD_EXTENSION_START,
    end: V11_FORWARD_EXTENSION_TARGET,
  };
  const allWindows = [
    ...developmentWindows,
    sealedHistoricalWindow,
    forwardWindow,
  ];
  const unionWindow = {
    start: allWindows[0].start,
    end: allWindows.at(-1).end,
  };
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= unionWindow.start &&
      String(chunk?.firstDate || "") <= unionWindow.end,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const candidates = pricePatternCandidateDefinitions().map((definition) => {
    const runs = allWindows.map((window, index) => {
      const run = simulatePointInTimePortfolio(
        dataset,
        simulationOptions(
          v11StrategyOptions({
            thesisId: `price-pattern-${definition.id}`,
            thesisLabel: definition.label,
            researchRankMode: "price-pattern",
            pricePatternWeights: definition.weights,
            requireEntryTimingPass: true,
            requireTrendAlignment: true,
            blockChaseEntries: true,
            minimumQualifiedSessions: 2,
            rankedRebalanceSessions: 5,
            rankedMinimumHoldSessions: 10,
            startDate: window.start,
            endDate: window.end,
          }),
        ),
      );
      assertCompleteResearchWindow(
        run,
        calendar,
        window,
        `${definition.label} window ${index + 1}`,
      );
      return run;
    });
    const development = boundedReviewExperimentSummary(
      aggregateResearchRuns(runs.slice(0, 2)),
    );
    const sealedHistorical = boundedReviewExperimentSummary(runs[2]);
    const forward = boundedReviewExperimentSummary(runs[3]);
    const developmentScore = roundMetric(
      Math.min(
        development.simpleDifferenceVsSpyPct,
        development.simpleDifferenceVsQqqPct,
      ) - Math.max(0, Math.abs(development.maxDrawdownPct) - 20) * 0.25,
      3,
    );
    return {
      id: definition.id,
      label: definition.label,
      weights: definition.weights,
      development,
      sealedHistorical,
      forward,
      developmentScore,
    };
  });
  const selected = [...candidates].sort(
    (left, right) =>
      right.developmentScore - left.developmentScore ||
      left.id.localeCompare(right.id),
  )[0];
  const checks = {
    developmentPositiveReturn: selected.development.totalReturnPct > 0,
    developmentBeatsSpy: selected.development.simpleDifferenceVsSpyPct > 0,
    developmentBeatsQqq: selected.development.simpleDifferenceVsQqqPct > 0,
    developmentProfitFactorAboveOne: selected.development.profitFactor > 1,
    sealedHistoricalPositiveReturn: selected.sealedHistorical.totalReturnPct > 0,
    sealedHistoricalBeatsSpy:
      selected.sealedHistorical.simpleDifferenceVsSpyPct > 0,
    sealedHistoricalBeatsQqq:
      selected.sealedHistorical.simpleDifferenceVsQqqPct > 0,
    sealedHistoricalProfitFactorAboveOne:
      selected.sealedHistorical.profitFactor > 1,
    forwardPositiveReturn: selected.forward.totalReturnPct > 0,
    forwardBeatsSpy: selected.forward.simpleDifferenceVsSpyPct > 0,
    forwardBeatsQqq: selected.forward.simpleDifferenceVsQqqPct > 0,
    forwardProfitFactorAboveOne: selected.forward.profitFactor > 1,
    forwardPositiveExpectancy: selected.forward.expectancyPct > 0,
  };
  const report = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    experiment: "Frozen causal price-pattern model search",
    selectionPolicy:
      "select once on first two audit windows; evaluate unchanged on final historical and subsequent windows",
    developmentWindows,
    sealedHistoricalWindow,
    forwardWindow,
    candidateCount: candidates.length,
    candidates,
    selectedCandidateId: selected.id,
    selected,
    checks,
    pilotEligible: Object.values(checks).every(Boolean),
    productionChanged: false,
    evidenceAssessment: {
      priceAndChartInputsOnly: true,
      causalInputsOnly: true,
      candidateSetFrozenBeforeExecution: true,
      sealedHistoricalWindowNotUsedForSelection: true,
      forwardWindowNotUsedForSelection: true,
      independentlyCollectedUniverse: false,
      eligibleForAlphaClaim: false,
    },
    limitations: [
      "The current-survivor universe introduces survivorship bias.",
      "Delisted securities and complete delisting returns are unavailable.",
      "The candidate families were designed after observing failures of earlier strategies.",
      "The subsequent window is short and does not span multiple market regimes.",
    ],
  };
  await persistPrivateJson(PRICE_PATTERN_MODEL_SEARCH_STORE, report);
  return report;
}

function alphaCreatorCandidateDefinitions() {
  const common = {
    requireEntryTimingPass: true,
    requireTrendAlignment: true,
    requireRelativeStrength: true,
    minimumQualifiedSessions: 2,
    blockChaseEntries: true,
    maxEntryGapPct: 3,
    rankedExitBuffer: 5,
    timeStopSessions: 126,
    maxIssuerPositions: 1,
  };
  return [
    {
      id: "adaptive-breadth-quality-defense",
      label: "Momentum breadth with quality defense",
      researchBasis:
        "Use quality leadership when fewer than half of the eligible cohort outperform SPY over 60 sessions or cross-sectional momentum breadth weakens; otherwise retain the momentum-dominant blend.",
      overrides: {
        researchRankMode: "adaptive-quality-momentum",
        requireEntryTimingPass: true,
        minimumQualifiedSessions: 2,
        rankedRebalanceSessions: 10,
        rankedMinimumHoldSessions: 15,
        rankedTargetCount: 12,
        maxPositions: 12,
        maxSectorPositions: 4,
        maxSectorPct: 0.34,
      },
    },
    {
      id: "adaptive-leadership-20-monthly-buffered",
      label:
        "Twenty-session quality/momentum leadership, monthly with 50% rank buffer",
      researchBasis:
        "Monthly review plus a six-name retention buffer tests whether slower, lower-churn implementation preserves the causal factor signal.",
      overrides: {
        researchRankMode: "adaptive-factor-leadership-20",
        requireEntryTimingPass: true,
        minimumQualifiedSessions: 2,
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        rankedTargetCount: 12,
        rankedExitBuffer: 18,
        maxPositions: 12,
        maxSectorPositions: 4,
        maxSectorPct: 0.34,
      },
    },
    {
      id: "adaptive-leadership-20",
      label: "Twenty-session quality/momentum leadership switch",
      overrides: {
        researchRankMode: "adaptive-factor-leadership-20",
        requireEntryTimingPass: true,
        minimumQualifiedSessions: 2,
        rankedRebalanceSessions: 10,
        rankedMinimumHoldSessions: 15,
        rankedTargetCount: 12,
        maxPositions: 12,
        maxSectorPositions: 4,
        maxSectorPct: 0.34,
      },
    },
    {
      id: "durable-monthly-ten",
      label: "Durable quality-momentum, monthly, ten holdings",
      overrides: {
        ...common,
        researchRankMode: "durable-quality-momentum",
        rankedTargetCount: 10,
        maxPositions: 10,
        buyTargetPct: 0.095,
        strongBuyTargetPct: 0.095,
        buyMaxPositionPct: 0.1,
        strongBuyMaxPositionPct: 0.1,
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        maxSectorPositions: 2,
        maxSectorPct: 0.25,
        maxVolatility60Pct: 55,
        volatilityTargetPct: 20,
        riskBudgetPct: 1,
      },
    },
    {
      id: "durable-biweekly-ten",
      label: "Durable quality-momentum, biweekly, ten holdings",
      overrides: {
        ...common,
        researchRankMode: "durable-quality-momentum",
        rankedTargetCount: 10,
        maxPositions: 10,
        buyTargetPct: 0.095,
        strongBuyTargetPct: 0.095,
        buyMaxPositionPct: 0.1,
        strongBuyMaxPositionPct: 0.1,
        rankedRebalanceSessions: 10,
        rankedMinimumHoldSessions: 15,
        maxSectorPositions: 2,
        maxSectorPct: 0.25,
        maxVolatility60Pct: 55,
        volatilityTargetPct: 20,
        riskBudgetPct: 1,
      },
    },
    {
      id: "quality-safety-monthly",
      label: "Quality and safety with positive momentum, monthly",
      overrides: {
        ...common,
        researchRankMode: "quality-only",
        minMomentumPercentile: 55,
        minStabilityPercentile: 55,
        rankedTargetCount: 10,
        maxPositions: 10,
        buyTargetPct: 0.095,
        strongBuyTargetPct: 0.095,
        buyMaxPositionPct: 0.1,
        strongBuyMaxPositionPct: 0.1,
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        maxSectorPositions: 2,
        maxSectorPct: 0.25,
        maxVolatility60Pct: 45,
        volatilityTargetPct: 18,
        riskBudgetPct: 0.9,
      },
    },
    {
      id: "momentum-quality-monthly",
      label: "Momentum with quality and safety floors, monthly",
      overrides: {
        ...common,
        researchRankMode: "momentum-only",
        minQualityPercentile: 60,
        minStabilityPercentile: 50,
        rankedTargetCount: 10,
        maxPositions: 10,
        buyTargetPct: 0.095,
        strongBuyTargetPct: 0.095,
        buyMaxPositionPct: 0.1,
        strongBuyMaxPositionPct: 0.1,
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        maxSectorPositions: 2,
        maxSectorPct: 0.25,
        maxVolatility60Pct: 55,
        volatilityTargetPct: 20,
        riskBudgetPct: 1,
      },
    },
    {
      id: "durable-monthly-eight",
      label: "Durable quality-momentum, monthly, eight holdings",
      overrides: {
        ...common,
        researchRankMode: "durable-quality-momentum",
        rankedTargetCount: 8,
        maxPositions: 8,
        buyTargetPct: 0.12,
        strongBuyTargetPct: 0.12,
        buyMaxPositionPct: 0.125,
        strongBuyMaxPositionPct: 0.125,
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        maxSectorPositions: 2,
        maxSectorPct: 0.25,
        maxVolatility60Pct: 50,
        volatilityTargetPct: 20,
        riskBudgetPct: 1,
      },
    },
  ];
}

export async function runAlphaCreatorSearch({ force = false } = {}) {
  const existing = await getAlphaCreatorSearch();
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const datasetThrough = calendar.at(-1) || null;
  if (!datasetThrough || datasetThrough < V11_FORWARD_EXTENSION_TARGET)
    throw new Error(
      `The compiled research dataset ends at ${datasetThrough || "an unknown date"}; ${V11_FORWARD_EXTENSION_TARGET} is required`,
    );
  if (
    !force &&
    existing?.status === "complete" &&
    number(existing?.version, 0) >= ALPHA_CREATOR_REPORT_VERSION &&
    String(existing?.datasetThrough || "") >= datasetThrough
  )
    return existing;
  // These three historical windows and every candidate definition were frozen
  // before the chronological forward ledger began. New sessions may extend
  // only the forward window; they must never move a development boundary or
  // silently create a new sealed historical sample.
  const developmentWindows = ALPHA_CREATOR_DEVELOPMENT_WINDOWS.map(
    (window) => ({ ...window }),
  );
  const sealedHistoricalWindow = {
    ...ALPHA_CREATOR_SEALED_HISTORICAL_WINDOW,
  };
  const forwardWindow = {
    start: V11_FORWARD_EXTENSION_START,
    end: datasetThrough,
  };
  const windows = [
    ...developmentWindows,
    sealedHistoricalWindow,
    forwardWindow,
  ];
  const union = { start: windows[0].start, end: windows.at(-1).end };
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= union.start &&
      String(chunk?.firstDate || "") <= union.end,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const summarize = (definition, window, suffix) => {
    const run = simulatePointInTimePortfolio(
      dataset,
      simulationOptions(
        v11StrategyOptions({
          ...definition.overrides,
          thesisId: `alpha-creator-${definition.id}`,
          thesisLabel: definition.label,
          startDate: window.start,
          endDate: window.end,
        }),
      ),
    );
    assertCompleteResearchWindow(
      run,
      calendar,
      window,
      `${definition.label} ${suffix}`,
    );
    return run;
  };
  const candidateDefinitions = alphaCreatorCandidateDefinitions();
  const candidates = candidateDefinitions.map((definition) => {
    const runs = windows.map((window, index) =>
      summarize(definition, window, `window ${index + 1}`),
    );
    const development = boundedReviewExperimentSummary(
      aggregateResearchRuns(runs.slice(0, 2)),
    );
    const sealedHistorical = boundedReviewExperimentSummary(runs[2]);
    const forward = boundedReviewExperimentSummary(runs[3]);
    const developmentScore = roundMetric(
      Math.min(
        development.simpleDifferenceVsSpyPct,
        development.simpleDifferenceVsQqqPct,
      ) +
        0.25 * development.sharpe -
        0.15 * Math.max(0, Math.abs(development.maxDrawdownPct) - 15),
      3,
    );
    return {
      id: definition.id,
      label: definition.label,
      researchBasis: definition.researchBasis || null,
      overrides: definition.overrides,
      development,
      sealedHistorical,
      forward,
      developmentScore,
    };
  });
  const selected = [...candidates].sort(
    (left, right) =>
      right.developmentScore - left.developmentScore ||
      left.id.localeCompare(right.id),
  )[0];
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  };
  const placeboScores = [];
  for (let seed = 1; seed <= 25; seed += 1) {
    const runs = developmentWindows.map((window) =>
      summarize(
        {
          id: `placebo-${seed}`,
          label: `Random placebo ${seed}`,
          overrides: {
            ...selected.overrides,
            researchRankMode: "random-placebo",
            researchRandomSeed: seed,
          },
        },
        window,
        "development",
      ),
    );
    const metrics = boundedReviewExperimentSummary(aggregateResearchRuns(runs));
    placeboScores.push(
      Math.min(
        metrics.simpleDifferenceVsSpyPct,
        metrics.simpleDifferenceVsQqqPct,
      ),
    );
  }
  const placebo95 = roundMetric(percentile(placeboScores, 0.95), 3);
  const checks = {
    developmentPositiveReturn: selected.development.totalReturnPct > 0,
    developmentBeatsSpy: selected.development.simpleDifferenceVsSpyPct > 0,
    developmentBeatsQqq: selected.development.simpleDifferenceVsQqqPct > 0,
    developmentProfitFactorAboveOne: selected.development.profitFactor > 1,
    developmentBeatsPlacebo95:
      Math.min(
        selected.development.simpleDifferenceVsSpyPct,
        selected.development.simpleDifferenceVsQqqPct,
      ) > placebo95,
    sealedHistoricalPositiveReturn: selected.sealedHistorical.totalReturnPct > 0,
    sealedHistoricalBeatsSpy:
      selected.sealedHistorical.simpleDifferenceVsSpyPct > 0,
    sealedHistoricalBeatsQqq:
      selected.sealedHistorical.simpleDifferenceVsQqqPct > 0,
    sealedHistoricalPositiveExpectancy:
      selected.sealedHistorical.expectancyPct > 0,
    sealedHistoricalProfitFactorAboveOne:
      selected.sealedHistorical.profitFactor > 1,
    forwardPositiveReturn: selected.forward.totalReturnPct > 0,
    forwardBeatsSpy: selected.forward.simpleDifferenceVsSpyPct > 0,
    forwardBeatsQqq: selected.forward.simpleDifferenceVsQqqPct > 0,
    forwardPositiveExpectancy: selected.forward.expectancyPct > 0,
    forwardProfitFactorAboveOne: selected.forward.profitFactor > 1,
  };
  const report = {
    version: ALPHA_CREATOR_REPORT_VERSION,
    status: "complete",
    completedAt: new Date().toISOString(),
    experiment: "Theory-constrained alpha creator search",
    datasetThrough,
    developmentWindows,
    sealedHistoricalWindow,
    forwardWindow,
    forwardSessions: calendar.filter(
      (date) => date >= forwardWindow.start && date <= forwardWindow.end,
    ).length,
    candidateCount: candidates.length,
    candidateSetFrozenBeforeExecution: true,
    selectionPolicy:
      "select once on the two development windows; evaluate unchanged on sealed historical and chronological forward windows",
    candidates,
    selectedCandidateId: selected.id,
    selected,
    placebo: { seeds: 25, benchmarkAlpha95thPercentilePct: placebo95 },
    checks,
    allEvidenceGatesPassed: Object.values(checks).every(Boolean),
    productionChanged: false,
    evidenceAssessment: {
      causalInputsOnly: true,
      developmentOnlySelection: true,
      laterWindowsExcludedFromSelection: true,
      forwardWindowAppendsWithoutCandidateRetuning: true,
      multipleComparisonsBounded: true,
      eligibleForAlphaClaim: false,
      reason:
        "The later windows were already inspected during prior strategy development; a newly designed model still requires genuinely new forward evidence.",
    },
    limitations: [
      "The current-survivor universe introduces survivorship bias.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe.",
      "Only 25 placebo seeds are used for the rapid screening stage; formal promotion requires the strict 1,000-seed control.",
      "Successive daily forward snapshots overlap and are not independent experiments; only genuinely new sessions add evidence.",
      "This experiment is a candidate-generation screen, not authorization for live capital.",
    ],
  };
  await persistPrivateJson(ALPHA_CREATOR_SEARCH_STORE, report);
  return report;
}

// A single post-diagnostic challenger frozen before the 2026-09-02 session
// closes. Historical and pre-freeze results are only a contaminated screen;
// promotion authority can come only from the growing prospective window.
export async function runAlphaProspectiveChallenger({ force = false } = {}) {
  const existing = await getAlphaProspectiveChallenger();
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const datasetThrough = calendar.at(-1) || null;
  if (!datasetThrough || datasetThrough < V11_FORWARD_EXTENSION_TARGET)
    throw new Error(
      `The compiled research dataset ends at ${datasetThrough || "an unknown date"}; ${V11_FORWARD_EXTENSION_TARGET} is required`,
    );
  if (
    !force &&
    existing?.status === "complete" &&
    number(existing?.version, 0) >= 2 &&
    (existing?.candidateDisposition ===
      "rejected-before-prospective-collection" ||
      String(existing?.datasetThrough || "") >= datasetThrough)
  )
    return existing;

  const definition = {
    id: "confirmed-quality-defense",
    label: "Momentum leadership with breadth-confirmed quality defense",
    researchBasis:
      "Retain the momentum-dominant blend unless fewer than half of eligible stocks outperform SPY over 60 sessions and the top quality quartile also beats the top momentum quartile over 20 sessions.",
    overrides: {
      researchRankMode: "confirmed-quality-defense",
      requireEntryTimingPass: true,
      requireTrendAlignment: true,
      requireRelativeStrength: true,
      minimumQualifiedSessions: 2,
      blockChaseEntries: true,
      maxEntryGapPct: 3,
      rankedRebalanceSessions: 10,
      rankedMinimumHoldSessions: 15,
      rankedTargetCount: 12,
      rankedExitBuffer: 12,
      maxPositions: 12,
      maxSectorPositions: 4,
      maxSectorPct: 0.34,
    },
  };
  const developmentWindows = ALPHA_CREATOR_DEVELOPMENT_WINDOWS.map(
    (window) => ({ ...window }),
  );
  const sealedHistoricalWindow = {
    ...ALPHA_CREATOR_SEALED_HISTORICAL_WINDOW,
  };
  const contaminatedPreFreezeWindow = {
    start: V11_FORWARD_EXTENSION_START,
    end: V11_FORWARD_EXTENSION_TARGET,
  };
  const prospectiveWindow =
    datasetThrough >= ALPHA_PROSPECTIVE_START
      ? { start: ALPHA_PROSPECTIVE_START, end: datasetThrough }
      : null;
  const unionStart = developmentWindows[0].start;
  const requiredChunks = manifest.chunks.filter(
    (chunk) =>
      String(chunk?.lastDate || "") >= unionStart &&
      String(chunk?.firstDate || "") <= datasetThrough,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
    const payload = await readPrivateGzipJson(chunk.pathname);
    const sessions = asArray(payload?.sessions).map(compactReplaySession);
    if (sessions.length !== number(chunk.end) - number(chunk.start))
      throw new Error(`Compiled research chunk is incomplete: ${chunk.pathname}`);
    restored.push(...sessions);
  }
  const dataset = { metadata: manifest.datasetMetadata, sessions: restored };
  const runWindow = (window, label) => {
    const run = simulatePointInTimePortfolio(
      dataset,
      simulationOptions(
        v11StrategyOptions({
          ...definition.overrides,
          thesisId: `alpha-prospective-${definition.id}`,
          thesisLabel: definition.label,
          startDate: window.start,
          endDate: window.end,
        }),
      ),
    );
    assertCompleteResearchWindow(run, calendar, window, label);
    return run;
  };
  const developmentRuns = developmentWindows.map((window, index) =>
    runWindow(window, `Prospective challenger development ${index + 1}`),
  );
  const development = boundedReviewExperimentSummary(
    aggregateResearchRuns(developmentRuns),
  );
  const developmentFolds = developmentRuns.map((run, index) => ({
    window: developmentWindows[index],
    ...boundedReviewExperimentSummary(run),
  }));
  const sealedHistorical = boundedReviewExperimentSummary(
    runWindow(sealedHistoricalWindow, "Prospective challenger sealed history"),
  );
  const contaminatedPreFreeze = boundedReviewExperimentSummary(
    runWindow(
      contaminatedPreFreezeWindow,
      "Prospective challenger contaminated pre-freeze window",
    ),
  );
  const prospective = prospectiveWindow
    ? boundedReviewExperimentSummary(
        runWindow(prospectiveWindow, "Prospective challenger forward ledger"),
      )
    : null;
  const prospectiveSessions = prospectiveWindow
    ? calendar.filter(
        (date) =>
          date >= prospectiveWindow.start && date <= prospectiveWindow.end,
      ).length
    : 0;
  const historicalChecks = {
    developmentPositi…92962 tokens truncated…&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R5_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R5_REPORT_VERSION,
    researchGeneration: "R5",
    productionCandidateVersion: "V15",
    status: "running",
    experiment:
      "Frozen V15/R5 industry-leadership continuous momentum falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R5_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_R5_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The predeclared R5 thesis and controls are being evaluated on the corrected point-in-time dataset.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R5_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R5_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const { primary, controls } = pointInTimeSp500AlphaR5Definitions();
    const definitions = [primary, ...controls];
    const evaluations = {};
    for (const [phase, phaseWindows] of Object.entries(windows))
      evaluations[phase] = await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        phaseWindows,
      );
    const evaluationFor = (phase, id) =>
      evaluations[phase].find(
        (evaluation) => evaluation.definition.id === id,
      );
    const summaryFor = (phase, id) => evaluationFor(phase, id)?.summary;
    const primaryPhases = {
      development: summaryFor("development", primary.id),
      validation: summaryFor("validation", primary.id),
      historicalAudit: summaryFor("historicalAudit", primary.id),
      forwardDiagnostic: summaryFor("forwardDiagnostic", primary.id),
    };
    const controlResults = controls.map((definition) => ({
      id: definition.id,
      label: definition.label,
      weights: definition.weights,
      development: summaryFor("development", definition.id),
      validation: summaryFor("validation", definition.id),
      historicalAudit: summaryFor("historicalAudit", definition.id),
      forwardDiagnostic: summaryFor("forwardDiagnostic", definition.id),
    }));

    const placeboDefinitions = Array.from(
      { length: POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `r5-random-placebo-${seed}`,
          label: `R5 matched random placebo ${seed}`,
          overrides: {
            ...primary.overrides,
            requireBenchmarkResidualFactors: false,
            researchRankMode: "random-placebo",
            researchRandomSeed: seed,
          },
        };
      },
    );
    const placeboEvaluations = await evaluatePointInTimeAlphaDefinitions(
      manifest,
      calendar,
      placeboDefinitions,
      windows.development,
    );
    const placeboScores = placeboEvaluations
      .map((evaluation) =>
        minimumSimpleBenchmarkAlpha(evaluation.summary.aggregate),
      )
      .filter(Number.isFinite);
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS)
      throw new Error(
        `The R5 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS})`,
      );
    const primaryDevelopmentAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.development.aggregate,
    );
    const placeboExceedances = placeboScores.filter(
      (score) => score >= primaryDevelopmentAlpha,
    ).length;
    const empiricalPValue =
      (placeboExceedances + 1) / (placeboScores.length + 1);
    const familyWiseAdjustedPValue = Math.min(
      1,
      empiricalPValue * POINT_IN_TIME_SP500_ALPHA_R5_RESEARCH_GENERATIONS,
    );
    const nonDevelopmentRuns = [
      ...evaluationFor("validation", primary.id).runs,
      ...evaluationFor("historicalAudit", primary.id).runs,
    ];
    const excessReturnStatistics = {
      SPY: benchmarkExcessReturnStatistic(nonDevelopmentRuns, "SPY"),
      QQQ: benchmarkExcessReturnStatistic(nonDevelopmentRuns, "QQQ"),
    };
    const controlDevelopmentAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.development.aggregate),
    );
    const controlAuditAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.historicalAudit.aggregate),
    );
    const primaryAuditAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.historicalAudit.aggregate,
    );
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const checks = {
      development: pointInTimeAlphaPhaseChecks(primaryPhases.development, {
        minimumClosedTrades: 30,
      }),
      validation: pointInTimeAlphaPhaseChecks(primaryPhases.validation),
      historicalAudit: pointInTimeAlphaPhaseChecks(
        primaryPhases.historicalAudit,
      ),
      controls: {
        developmentBeatsEveryPredeclaredControl:
          controlDevelopmentAlphas.every(
            (controlAlpha) => primaryDevelopmentAlpha > controlAlpha,
          ),
        historicalAuditBeatsEveryPredeclaredControl:
          controlAuditAlphas.every(
            (controlAlpha) => primaryAuditAlpha > controlAlpha,
          ),
        preliminaryPlaceboFamilyWisePBelowFivePct:
          familyWiseAdjustedPValue < 0.05,
        pointInTimeMembershipCoverageComplete:
          membershipObservationCoveragePct === 100,
        correctedPriceIntegrityPassed:
          integrity.assessment.adjustedPriceIntegrityPass === true,
        noBenchmarkCompletionSleeve:
          primary.overrides.benchmarkCompletionSymbol === null,
        priceOnlyRankExcludesUnrevisionedFundamentals:
          primary.overrides.researchSignalSource === "price-only",
        singlePredeclaredThesisNoSelector: true,
      },
      statisticalSignificance: {
        validationAndAuditNeweyWestTAboveThreeVsSpy:
          number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3,
        validationAndAuditNeweyWestTAboveThreeVsQqq:
          number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3,
      },
    };
    const allHistoricalScreenGatesPassed = Object.values(checks).every(
      (group) => Object.values(group).every(Boolean),
    );
    const completedAt = new Date().toISOString();
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_R5_REPORT_VERSION,
      researchGeneration: "R5",
      productionCandidateVersion: "V15",
      status: "complete",
      experiment:
        "Frozen V15/R5 industry-leadership continuous momentum falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R5_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R5_PROSPECTIVE_START,
      genuinelyNewForwardSessions: 0,
      requiredGenuinelyNewForwardSessions: 60,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      candidateCount: 1,
      controlCount: controls.length,
      selectionPolicy:
        "No grid search or selector: one externally motivated industry-momentum primary thesis is tested against three predeclared matched controls.",
      windows,
      candidates: [
        {
          id: primary.id,
          label: primary.label,
          weights: primary.weights,
          configuration: primary.overrides,
          development: primaryPhases.development,
        },
      ],
      selectedCandidateId: primary.id,
      selected: {
        id: primary.id,
        label: primary.label,
        weights: primary.weights,
        configuration: primary.overrides,
        development: primaryPhases.development,
        validation: primaryPhases.validation,
        historicalAudit: primaryPhases.historicalAudit,
        forwardDiagnostic: primaryPhases.forwardDiagnostic,
      },
      ablationControls: controlResults,
      statisticalEvidence: {
        method:
          "Newey-West HAC t-statistics with five lags on daily strategy-minus-benchmark returns across validation and historical-audit windows",
        significanceThresholdT: 3,
        excessReturnStatistics,
        preliminaryMatchedPlacebos: placeboScores.length,
        placeboExceedances,
        empiricalPValue: roundMetric(empiricalPValue, 4),
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R5_RESEARCH_GENERATIONS,
        familyWiseAdjustedPValue: roundMetric(
          familyWiseAdjustedPValue,
          4,
        ),
        strictPromotionPlaceboSeeds: 1_000,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS,
        purpose:
          "Preliminary matched-lifecycle falsification before the 1,000-seed promotion test",
        score:
          "minimum simple total-return difference versus SPY and QQQ over development windows",
        medianPct: roundMetric(percentileValue(placeboScores, 0.5), 3),
        percentile95Pct: roundMetric(
          percentileValue(placeboScores, 0.95),
          3,
        ),
        minimumPct: roundMetric(Math.min(...placeboScores), 3),
        maximumPct: roundMetric(Math.max(...placeboScores), 3),
        strictPromotionRequirementSeeds: 1_000,
      },
      checks,
      allHistoricalScreenGatesPassed,
      allEvidenceGatesPassed: false,
      candidateDisposition: allHistoricalScreenGatesPassed
        ? "advance-to-strict-1000-placebo-and-prospective-paper-gates"
        : "rejected-by-historical-screen",
      eligibleForPaperForwardTracking: allHistoricalScreenGatesPassed,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      methodology: {
        historicalMembershipAppliedPerSession: true,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        benchmarkComparisonSymbols: ["SPY", "QQQ"],
        priceOnlyCausalRank: true,
        rankInputs: [
          "cross-sectional median 120-session excess return of each contemporaneous sector",
          "stock 120-session excess return versus both SPY and QQQ",
          "within-sector momentum percentile",
          "continuous-information percentile",
          "60-session realized volatility",
        ],
        volatilityTargetPct: null,
        parameterSelectionUsed: false,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_R5_PLACEBO_SEEDS,
      },
      dataQuality: {
        pointInTimeMembershipConstructed: true,
        membershipObservationCoveragePct,
        compiledSessions: calendar.length,
        compiledChunks: asArray(manifest.chunks).length,
        membershipUnionSymbols: number(
          datasetStatus?.coverage?.membershipUnionSymbols,
        ),
        priceUsableSymbols: number(datasetStatus?.coverage?.priceUsableSymbols),
        adjustedPriceIntegrityPass: true,
        fundamentalsRevisionSafe: false,
        historicalMaterialNewsComplete: false,
      },
      evidenceAssessment: {
        causalPriceInputsOnly: true,
        historicalPhaseSeparation: true,
        genuinelyUntouchedHoldoutUsed: false,
        historicalCalendarPreviouslyInspected: true,
        strictPlaceboGateMet: false,
        reason:
          "R5 is protected against ordinary t-statistic and repeated-search inflation, but every session through 2026-09-01 was observable before freeze. A passing historical screen advances research; it does not by itself prove tradable future alpha.",
      },
      researchReferences: [
        {
          title: "Do Industries Explain Momentum?",
          url: "https://doi.org/10.1111/0022-1082.00146",
          implication:
            "Industry components account for a substantial share of individual-stock momentum, motivating sector-first ranking.",
        },
        {
          title: "Information Discreteness and Stock Returns",
          url: "https://doi.org/10.1111/jofi.12179",
          implication:
            "Continuous paths are separated from jump-driven momentum using a causal price-only continuity measure.",
        },
        {
          title: "... and the Cross-Section of Expected Returns",
          url: "https://www.nber.org/papers/w20592",
          implication:
            "A t-statistic above three and family-wise correction replace the conventional unadjusted t greater than two hurdle.",
        },
      ],
      limitations: [
        "All historical dates were observable before R5 was frozen; no historical result can be represented as a genuinely untouched holdout.",
        "The available causal contract is price-only because statement revisions and historical material news are not certified as-known.",
        "The 100-placebo stage is a bounded rejection screen. A survivor must still complete the separate 1,000-seed promotion distribution.",
        "Only S&P 500 membership is covered; independent cross-universe replication remains required.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Run the strict 1,000-seed matched-placebo distribution, begin the genuinely prospective paper ledger, and require independent cross-universe replication before any production promotion."
        : "Retire R5 without retuning it on these dates and predeclare an economically distinct R6 research thesis.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R5_STORE,
      normalizedReport,
    );
    return normalizedReport;
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R5_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}



export async function runPointInTimeSp500AlphaResearchR7({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, r6Report, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
    getPointInTimeSp500AlphaResearchR6(),
    getPointInTimeSp500DatasetStatus(),
  ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The corrected point-in-time S&P 500 checkpoint is unavailable",
    );
  if (
    !String(manifest.signature || "").includes(
      POINT_IN_TIME_SP500_COMPILER_CONTRACT,
    )
  )
    throw new Error("The canonical R7 research dataset has not finished compiling");
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error(
      "R7 remains blocked until the corrected price-integrity audit passes for this exact dataset",
    );
  if (
    r6Report?.status !== "complete" ||
    r6Report?.datasetFingerprint !== datasetFingerprint ||
    r6Report?.candidateDisposition !== "rejected-by-historical-screen"
  )
    throw new Error(
      "R7 remains blocked until frozen R6 finishes and is preserved as rejected on this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R7_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R7_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R7_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R7_REPORT_VERSION,
    researchGeneration: "R7",
    productionCandidateVersion: "V17",
    status: "running",
    experiment:
      "Frozen V17/R7 slow dual-benchmark residual-momentum falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R7_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_R7_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The predeclared R7 slow residual-momentum thesis and controls are being evaluated on the corrected point-in-time dataset.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R7_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R7_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const { primary, controls } = pointInTimeSp500AlphaR7Definitions();
    const definitions = [primary, ...controls];
    const evaluations = {};
    for (const [phase, phaseWindows] of Object.entries(windows))
      evaluations[phase] = await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        phaseWindows,
      );
    const evaluationFor = (phase, id) =>
      evaluations[phase].find(
        (evaluation) => evaluation.definition.id === id,
      );
    const summaryFor = (phase, id) => evaluationFor(phase, id)?.summary;
    const primaryPhases = {
      development: summaryFor("development", primary.id),
      validation: summaryFor("validation", primary.id),
      historicalAudit: summaryFor("historicalAudit", primary.id),
      forwardDiagnostic: summaryFor("forwardDiagnostic", primary.id),
    };
    const controlResults = controls.map((definition) => ({
      id: definition.id,
      label: definition.label,
      weights: definition.weights,
      development: summaryFor("development", definition.id),
      validation: summaryFor("validation", definition.id),
      historicalAudit: summaryFor("historicalAudit", definition.id),
      forwardDiagnostic: summaryFor("forwardDiagnostic", definition.id),
    }));

    const placeboDefinitions = Array.from(
      { length: POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `r7-random-placebo-${seed}`,
          label: `R7 matched slow-lifecycle random placebo ${seed}`,
          overrides: {
            ...primary.overrides,
            researchRankMode: "random-placebo",
            researchRandomSeed: seed,
          },
        };
      },
    );
    const placeboEvaluations = await evaluatePointInTimeAlphaDefinitions(
      manifest,
      calendar,
      placeboDefinitions,
      windows.development,
    );
    const placeboScores = placeboEvaluations
      .map((evaluation) =>
        minimumSimpleBenchmarkAlpha(evaluation.summary.aggregate),
      )
      .filter(Number.isFinite);
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS)
      throw new Error(
        `The R7 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS})`,
      );
    const primaryDevelopmentAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.development.aggregate,
    );
    const placeboExceedances = placeboScores.filter(
      (score) => score >= primaryDevelopmentAlpha,
    ).length;
    const empiricalPValue =
      (placeboExceedances + 1) / (placeboScores.length + 1);
    const familyWiseAdjustedPValue = Math.min(
      1,
      empiricalPValue * POINT_IN_TIME_SP500_ALPHA_R7_RESEARCH_GENERATIONS,
    );
    const nonDevelopmentRuns = [
      ...evaluationFor("validation", primary.id).runs,
      ...evaluationFor("historicalAudit", primary.id).runs,
    ];
    const excessReturnStatistics = {
      SPY: benchmarkExcessReturnStatistic(nonDevelopmentRuns, "SPY"),
      QQQ: benchmarkExcessReturnStatistic(nonDevelopmentRuns, "QQQ"),
    };
    const controlDevelopmentAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.development.aggregate),
    );
    const controlAuditAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.historicalAudit.aggregate),
    );
    const primaryAuditAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.historicalAudit.aggregate,
    );
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const checks = {
      development: pointInTimeAlphaPhaseChecks(primaryPhases.development, {
        minimumClosedTrades: 30,
      }),
      validation: pointInTimeAlphaPhaseChecks(primaryPhases.validation),
      historicalAudit: pointInTimeAlphaPhaseChecks(
        primaryPhases.historicalAudit,
      ),
      controls: {
        developmentBeatsEveryPredeclaredControl:
          controlDevelopmentAlphas.every(
            (controlAlpha) => primaryDevelopmentAlpha > controlAlpha,
          ),
        historicalAuditBeatsEveryPredeclaredControl:
          controlAuditAlphas.every(
            (controlAlpha) => primaryAuditAlpha > controlAlpha,
          ),
        preliminaryPlaceboFamilyWisePBelowFivePct:
          familyWiseAdjustedPValue < 0.05,
        pointInTimeMembershipCoverageComplete:
          membershipObservationCoveragePct === 100,
        correctedPriceIntegrityPassed:
          integrity.assessment.adjustedPriceIntegrityPass === true,
        noBenchmarkCompletionSleeve:
          primary.overrides.benchmarkCompletionSymbol === null,
        priceOnlyRankExcludesUnrevisionedFundamentals:
          primary.overrides.researchSignalSource === "price-only",
        exactMatchedLifecyclePlacebos: true,
        singlePredeclaredThesisNoSelector: true,
      },
      statisticalSignificance: {
        validationAndAuditNeweyWestTAboveThreeVsSpy:
          number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3,
        validationAndAuditNeweyWestTAboveThreeVsQqq:
          number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3,
      },
    };
    const allHistoricalScreenGatesPassed = Object.values(checks).every(
      (group) => Object.values(group).every(Boolean),
    );
    const completedAt = new Date().toISOString();
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_R7_REPORT_VERSION,
      researchGeneration: "R7",
      productionCandidateVersion: "V17",
      status: "complete",
      experiment:
        "Frozen V17/R7 slow dual-benchmark residual-momentum falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R7_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R7_PROSPECTIVE_START,
      genuinelyNewForwardSessions: 0,
      requiredGenuinelyNewForwardSessions: 60,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      specifiedBeforeR6ResultObserved: false,
      predecessorFailureMechanismUsedForThesisDesign: true,
      candidateCount: 1,
      controlCount: controls.length,
      selectionPolicy:
        "No grid search or selector: one externally motivated slow residual-momentum thesis is tested unchanged against three predeclared controls.",
      windows,
      candidates: [
        {
          id: primary.id,
          label: primary.label,
          weights: primary.weights,
          configuration: primary.overrides,
          development: primaryPhases.development,
        },
      ],
      selectedCandidateId: primary.id,
      selected: {
        id: primary.id,
        label: primary.label,
        weights: primary.weights,
        configuration: primary.overrides,
        development: primaryPhases.development,
        validation: primaryPhases.validation,
        historicalAudit: primaryPhases.historicalAudit,
        forwardDiagnostic: primaryPhases.forwardDiagnostic,
      },
      ablationControls: controlResults,
      statisticalEvidence: {
        method:
          "Newey-West HAC t-statistics with five lags on daily strategy-minus-benchmark returns across validation and historical-audit windows",
        significanceThresholdT: 3,
        excessReturnStatistics,
        preliminaryMatchedPlacebos: placeboScores.length,
        placeboExceedances,
        empiricalPValue: roundMetric(empiricalPValue, 4),
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R7_RESEARCH_GENERATIONS,
        familyWiseAdjustedPValue: roundMetric(
          familyWiseAdjustedPValue,
          4,
        ),
        strictPromotionPlaceboSeeds: 1_000,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS,
        purpose:
          "Preliminary random-rank falsification inside the exact same slow, concentrated lifecycle",
        score:
          "minimum simple total-return difference versus SPY and QQQ over development windows",
        medianPct: roundMetric(percentileValue(placeboScores, 0.5), 3),
        percentile95Pct: roundMetric(
          percentileValue(placeboScores, 0.95),
          3,
        ),
        minimumPct: roundMetric(Math.min(...placeboScores), 3),
        maximumPct: roundMetric(Math.max(...placeboScores), 3),
        strictPromotionRequirementSeeds: 1_000,
      },
      checks,
      allHistoricalScreenGatesPassed,
      allEvidenceGatesPassed: false,
      candidateDisposition: allHistoricalScreenGatesPassed
        ? "advance-to-strict-1000-placebo-and-prospective-paper-gates"
        : "rejected-by-historical-screen",
      eligibleForPaperForwardTracking: allHistoricalScreenGatesPassed,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      methodology: {
        historicalMembershipAppliedPerSession: true,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        commissionAssumed: 0,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        benchmarkComparisonSymbols: ["SPY", "QQQ"],
        priceOnlyCausalRank: true,
        eventEligibility: null,
        rankInputs: [
          "120-session excess return versus SPY",
          "120-session excess return versus QQQ",
          "cross-sectional drawdown-resilience percentile",
        ],
        lifecycle: {
          rebalanceSessions: 40,
          minimumHoldSessions: 60,
          maximumHoldSessions: 252,
          targetPositions: 8,
          fixedInitialStopPct: 22,
          maximumNextOpenGapPct: 3,
          volatilityScalingUsed: false,
        },
        parameterSelectionUsed: false,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_R7_PLACEBO_SEEDS,
      },
      dataQuality: {
        pointInTimeMembershipConstructed: true,
        membershipObservationCoveragePct,
        compiledSessions: calendar.length,
        compiledChunks: asArray(manifest.chunks).length,
        membershipUnionSymbols: number(
          datasetStatus?.coverage?.membershipUnionSymbols,
        ),
        priceUsableSymbols: number(datasetStatus?.coverage?.priceUsableSymbols),
        adjustedPriceIntegrityPass: true,
        fundamentalsRevisionSafe: false,
        historicalMaterialNewsComplete: false,
      },
      evidenceAssessment: {
        causalPriceInputsOnly: true,
        historicalPhaseSeparation: true,
        genuinelyUntouchedHoldoutUsed: false,
        historicalCalendarPreviouslyInspected: true,
        strictPlaceboGateMet: false,
        reason:
          "R7 is predeclared and causally simulated, but every session through 2026-09-01 was observable before freeze. Historical evidence can reject R7; it cannot by itself prove future alpha.",
      },
      researchReferences: [
        {
          title: "Residual Momentum",
          url: "https://doi.org/10.1016/j.jempfin.2011.01.003",
          implication:
            "Slow ranking on benchmark-residual returns targets stock-specific continuation rather than broad market or sector beta.",
        },
        {
          title: "... and the Cross-Section of Expected Returns",
          url: "https://www.nber.org/papers/w20592",
          implication:
            "A t-statistic above three and family-wise correction address repeated research and data-mining risk.",
        },
      ],
      limitations: [
        "All historical dates were observable before R7 was frozen; none is a genuinely untouched holdout.",
        "The causal contract is limited to adjusted prices because historical statement revisions and material news are not certified as-known.",
        "The 100-placebo screen is only an early rejection test; promotion still requires the separate 1,000-seed matched distribution.",
        "Only point-in-time S&P 500 membership is covered; independent cross-universe replication remains required.",
        "The deliberately concentrated eight-name portfolio may carry substantial idiosyncratic and sector concentration risk.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Run the strict 1,000-seed matched-lifecycle placebo distribution, begin the genuinely prospective paper ledger, and require independent cross-universe replication before production promotion."
        : "Retire R7 unchanged and preserve its failure before defining an economically distinct R8 hypothesis.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R7_STORE,
      normalizedReport,
    );
    return normalizedReport;
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R7_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}



export async function runPointInTimeSp500AlphaBatchR8({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, r7Report, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
    getPointInTimeSp500AlphaResearchR7(),
    getPointInTimeSp500DatasetStatus(),
  ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The corrected point-in-time S&P 500 checkpoint is unavailable",
    );
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error(
      "R8 remains blocked until corrected price integrity passes for this exact dataset",
    );
  if (
    r7Report?.status !== "complete" ||
    r7Report?.datasetFingerprint !== datasetFingerprint ||
    r7Report?.candidateDisposition !== "rejected-by-historical-screen"
  )
    throw new Error(
      "R8 remains blocked until frozen R7 is preserved as rejected on this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R8_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R8_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R8_REPORT_VERSION,
    researchGeneration: "R8",
    productionCandidateVersion: "V18",
    status: "running",
    experiment: "R8 batched nested alpha discovery",
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "Twenty-one predeclared candidates are sharing one development restore; only four may reach validation and only one may reach audit.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R8_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R8_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const definitions = pointInTimeSp500AlphaR8BatchDefinitions();
    const developmentEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        windows.development,
      );
    const developmentRank = developmentEvaluations
      .map(({ definition, summary }) => ({
        definition,
        summary,
        score: pointInTimeAlphaDevelopmentScore(summary),
        checks: pointInTimeAlphaPhaseChecks(summary, {
          minimumClosedTrades: 20,
        }),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const finalists = developmentRank.slice(0, 4);
    const validationEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        finalists.map((row) => row.definition),
        windows.validation,
      );
    const validationById = new Map(
      validationEvaluations.map((row) => [row.definition.id, row]),
    );
    const finalistResults = finalists
      .map((row) => {
        const validation = validationById.get(row.definition.id)?.summary;
        const validationChecks = pointInTimeAlphaPhaseChecks(validation);
        const clearsDevelopmentAndValidation =
          Object.values(row.checks).every(Boolean) &&
          Object.values(validationChecks).every(Boolean);
        return {
          ...row,
          validation,
          validationChecks,
          clearsDevelopmentAndValidation,
          nestedScore: roundMetric(
            row.score + 1.5 * pointInTimeAlphaDevelopmentScore(validation),
            3,
          ),
        };
      })
      .sort(
        (left, right) =>
          Number(right.clearsDevelopmentAndValidation) -
            Number(left.clearsDevelopmentAndValidation) ||
          right.nestedScore - left.nestedScore ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const selectedRow = finalistResults.find(
      (row) => row.clearsDevelopmentAndValidation,
    );
    let historicalAudit = null;
    let forwardDiagnostic = null;
    let auditChecks = null;
    let excessReturnStatistics = null;
    let deterministicPromotionScreenPassed = false;
    if (selectedRow) {
      historicalAudit = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.historicalAudit,
        )
      )[0];
      forwardDiagnostic = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.forwardDiagnostic,
        )
      )[0];
      auditChecks = pointInTimeAlphaPhaseChecks(historicalAudit.summary);
      excessReturnStatistics = {
        SPY: benchmarkExcessReturnStatistic(historicalAudit.runs, "SPY"),
        QQQ: benchmarkExcessReturnStatistic(historicalAudit.runs, "QQQ"),
      };
      deterministicPromotionScreenPassed =
        Object.values(auditChecks).every(Boolean) &&
        number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3 &&
        number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3;
    }
    const completedAt = new Date().toISOString();
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const selected = selectedRow
      ? {
          id: selectedRow.definition.id,
          label: selectedRow.definition.label,
          family: selectedRow.definition.family,
          lifecycle: selectedRow.definition.lifecycle,
          weights: selectedRow.definition.weights,
          configuration: selectedRow.definition.overrides,
          development: selectedRow.summary,
          validation: selectedRow.validation,
          historicalAudit: historicalAudit?.summary || null,
          forwardDiagnostic: forwardDiagnostic?.summary || null,
        }
      : null;
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_R8_REPORT_VERSION,
      researchGeneration: "R8",
      productionCandidateVersion: "V18",
      status: "complete",
      experiment: "R8 batched nested alpha discovery",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R8_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R8_PROSPECTIVE_START,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      candidateCount: definitions.length,
      developmentCandidates: definitions.length,
      validationFinalists: finalists.length,
      auditCandidates: selectedRow ? 1 : 0,
      fullPlaceboRunsAvoided:
        deterministicPromotionScreenPassed !== true,
      selectionPolicy:
        "Rank 21 frozen candidates on development, carry four to validation, require every development and validation gate, then freeze one nested-score winner for audit. Audit is never used to choose or retune.",
      windows,
      candidates: developmentRank.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        family: row.definition.family,
        lifecycle: row.definition.lifecycle,
        weights: row.definition.weights,
        configuration: row.definition.overrides,
        development: row.summary,
        developmentScore: row.score,
      })),
      finalists: finalistResults.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        developmentScore: row.score,
        validationScore: pointInTimeAlphaDevelopmentScore(row.validation),
        nestedScore: row.nestedScore,
        clearsDevelopmentAndValidation:
          row.clearsDevelopmentAndValidation,
        validation: row.validation,
      })),
      selectedCandidateId: selected?.id || null,
      selected,
      statisticalEvidence: {
        method:
          "Selection uses development and validation only; Newey-West HAC t-statistics are computed on historical-audit returns only.",
        significanceThresholdT: 3,
        excessReturnStatistics,
        deterministicPromotionScreenPassed,
        strictMatchedPlacebosRun: 0,
        strictMatchedPlacebosRequired:
          POINT_IN_TIME_SP500_ALPHA_R8_STRICT_PLACEBO_SEEDS,
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R8_RESEARCH_GENERATIONS,
      },
      checks: {
        data: {
          pointInTimeMembershipCoverageComplete:
            membershipObservationCoveragePct === 100,
          correctedPriceIntegrityPassed:
            integrity.assessment.adjustedPriceIntegrityPass === true,
          noBenchmarkCompletionSleeve: true,
          priceOnlyRank: true,
        },
        selection: {
          finalistClearedDevelopmentAndValidation: Boolean(selectedRow),
        },
        historicalAudit: auditChecks || {
          candidateReachedAudit: false,
        },
        statisticalSignificance: excessReturnStatistics
          ? {
              auditNeweyWestTAboveThreeVsSpy:
                number(
                  excessReturnStatistics.SPY.tStatistic,
                  -Infinity,
                ) > 3,
              auditNeweyWestTAboveThreeVsQqq:
                number(
                  excessReturnStatistics.QQQ.tStatistic,
                  -Infinity,
                ) > 3,
            }
          : { candidateReachedAudit: false },
        strictPlacebo: {
          requiredOnlyAfterDeterministicScreen:
            deterministicPromotionScreenPassed,
          completed: false,
        },
      },
      allHistoricalScreenGatesPassed: false,
      allEvidenceGatesPassed: false,
      candidateDisposition: deterministicPromotionScreenPassed
        ? "advance-to-separate-strict-1000-placebo-stage"
        : selectedRow
          ? "rejected-by-historical-audit-screen"
          : "rejected-before-audit-by-development-validation-funnel",
      eligibleForPaperForwardTracking: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      methodology: {
        historicalMembershipAppliedPerSession: true,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        batchWindowReuse: true,
        earlyStoppingBeforeAudit: true,
        earlyStoppingBeforePlacebos: true,
        auditExcludedFromSelection: true,
        parameterSelectionUsed: true,
      },
      dataQuality: {
        pointInTimeMembershipConstructed: true,
        membershipObservationCoveragePct,
        compiledSessions: calendar.length,
        compiledChunks: asArray(manifest.chunks).length,
        membershipUnionSymbols: number(
          datasetStatus?.coverage?.membershipUnionSymbols,
        ),
        priceUsableSymbols: number(datasetStatus?.coverage?.priceUsableSymbols),
        adjustedPriceIntegrityPass: true,
      },
      limitations: [
        "Every stored date was observable before R8; the nested chronology constrains selection but is not a genuinely untouched future sample.",
        "R8 searches 21 correlated price-only specifications, so a deterministic survivor still needs the separate 1,000-placebo stage and multiplicity adjustment.",
        "No fundamental, analyst-estimate, options, short-interest, alternative-data, or point-in-time news feature is available in the certified dataset.",
        "Independent cross-universe replication and 60 genuinely new sessions remain mandatory before any alpha or live-capital claim.",
      ],
      nextStep: deterministicPromotionScreenPassed
        ? "Run the separate 1,000-seed matched-placebo stage without changing the selected candidate."
        : "Do not deploy another one-thesis version. Use the batched report to decide whether the certified price-only feature space is exhausted.",
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R8_STORE, report);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R8_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

export async function runPointInTimeSp500AlphaSizingR9({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, r8Report, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
    getPointInTimeSp500AlphaBatchR8(),
    getPointInTimeSp500DatasetStatus(),
  ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The corrected point-in-time S&P 500 checkpoint is unavailable",
    );
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error(
      "R9 remains blocked until corrected price integrity passes for this exact dataset",
    );
  if (
    r8Report?.status !== "complete" ||
    r8Report?.datasetFingerprint !== datasetFingerprint ||
    !String(r8Report?.candidateDisposition || "").startsWith("rejected-")
  )
    throw new Error(
      "R9 remains blocked until the R8 batch is preserved as rejected on this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R9_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R9_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R9_REPORT_VERSION,
    researchGeneration: "R9",
    productionCandidateVersion: "V19",
    status: "running",
    experiment: "R9 batched conviction-sizing and replacement-stop discovery",
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "Eighteen conviction-sizing and replacement-stop candidates share one development restore; only four may reach validation and one may reach audit.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R9_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R9_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const definitions = pointInTimeSp500AlphaR9SizingDefinitions();
    const developmentEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        windows.development,
      );
    const developmentRank = developmentEvaluations
      .map(({ definition, summary }) => ({
        definition,
        summary,
        score: pointInTimeAlphaDevelopmentScore(summary),
        checks: pointInTimeAlphaPhaseChecks(summary, {
          minimumClosedTrades: 20,
        }),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const finalists = developmentRank.slice(0, 4);
    const validationEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        finalists.map((row) => row.definition),
        windows.validation,
      );
    const validationById = new Map(
      validationEvaluations.map((row) => [row.definition.id, row]),
    );
    const finalistResults = finalists
      .map((row) => {
        const validation = validationById.get(row.definition.id)?.summary;
        const validationChecks = pointInTimeAlphaPhaseChecks(validation);
        const clearsDevelopmentAndValidation =
          Object.values(row.checks).every(Boolean) &&
          Object.values(validationChecks).every(Boolean);
        return {
          ...row,
          validation,
          validationChecks,
          clearsDevelopmentAndValidation,
          nestedScore: roundMetric(
            row.score + 1.5 * pointInTimeAlphaDevelopmentScore(validation),
            3,
          ),
        };
      })
      .sort(
        (left, right) =>
          Number(right.clearsDevelopmentAndValidation) -
            Number(left.clearsDevelopmentAndValidation) ||
          right.nestedScore - left.nestedScore ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const selectedRow = finalistResults.find(
      (row) => row.clearsDevelopmentAndValidation,
    );
    let historicalAudit = null;
    let forwardDiagnostic = null;
    let auditChecks = null;
    let excessReturnStatistics = null;
    let deterministicPromotionScreenPassed = false;
    if (selectedRow) {
      historicalAudit = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.historicalAudit,
        )
      )[0];
      forwardDiagnostic = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.forwardDiagnostic,
        )
      )[0];
      auditChecks = pointInTimeAlphaPhaseChecks(historicalAudit.summary);
      excessReturnStatistics = {
        SPY: benchmarkExcessReturnStatistic(historicalAudit.runs, "SPY"),
        QQQ: benchmarkExcessReturnStatistic(historicalAudit.runs, "QQQ"),
      };
      deterministicPromotionScreenPassed =
        Object.values(auditChecks).every(Boolean) &&
        number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3 &&
        number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3;
    }
    const completedAt = new Date().toISOString();
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const selected = selectedRow
      ? {
          id: selectedRow.definition.id,
          label: selectedRow.definition.label,
          family: selectedRow.definition.family,
          lifecycle: selectedRow.definition.lifecycle,
          weights: selectedRow.definition.weights,
          configuration: selectedRow.definition.overrides,
          development: selectedRow.summary,
          validation: selectedRow.validation,
          historicalAudit: historicalAudit?.summary || null,
          forwardDiagnostic: forwardDiagnostic?.summary || null,
        }
      : null;
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_R9_REPORT_VERSION,
      researchGeneration: "R9",
      productionCandidateVersion: "V19",
      status: "complete",
      experiment: "R9 batched conviction-sizing and replacement-stop discovery",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R9_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R9_PROSPECTIVE_START,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      candidateCount: definitions.length,
      developmentCandidates: definitions.length,
      validationFinalists: finalists.length,
      auditCandidates: selectedRow ? 1 : 0,
      fullPlaceboRunsAvoided:
        deterministicPromotionScreenPassed !== true,
      selectionPolicy:
        "Rank 18 frozen portfolio-construction candidates on development, carry four to validation, require every development and validation gate, then freeze one nested-score winner for audit. Audit is never used to choose or retune.",
      windows,
      candidates: developmentRank.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        family: row.definition.family,
        lifecycle: row.definition.lifecycle,
        weights: row.definition.weights,
        configuration: row.definition.overrides,
        development: row.summary,
        developmentScore: row.score,
      })),
      finalists: finalistResults.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        developmentScore: row.score,
        validationScore: pointInTimeAlphaDevelopmentScore(row.validation),
        nestedScore: row.nestedScore,
        clearsDevelopmentAndValidation:
          row.clearsDevelopmentAndValidation,
        validation: row.validation,
      })),
      selectedCandidateId: selected?.id || null,
      selected,
      statisticalEvidence: {
        method:
          "Selection uses development and validation only; Newey-West HAC t-statistics are computed on historical-audit returns only.",
        significanceThresholdT: 3,
        excessReturnStatistics,
        deterministicPromotionScreenPassed,
        strictMatchedPlacebosRun: 0,
        strictMatchedPlacebosRequired:
          POINT_IN_TIME_SP500_ALPHA_R9_STRICT_PLACEBO_SEEDS,
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R9_RESEARCH_GENERATIONS,
      },
      checks: {
        data: {
          pointInTimeMembershipCoverageComplete:
            membershipObservationCoveragePct === 100,
          correctedPriceIntegrityPassed:
            integrity.assessment.adjustedPriceIntegrityPass === true,
          noBenchmarkCompletionSleeve: true,
          priceOnlyRank: true,
        },
        selection: {
          finalistClearedDevelopmentAndValidation: Boolean(selectedRow),
        },
        historicalAudit: auditChecks || {
          candidateReachedAudit: false,
        },
        statisticalSignificance: excessReturnStatistics
          ? {
              auditNeweyWestTAboveThreeVsSpy:
                number(
                  excessReturnStatistics.SPY.tStatistic,
                  -Infinity,
                ) > 3,
              auditNeweyWestTAboveThreeVsQqq:
                number(
                  excessReturnStatistics.QQQ.tStatistic,
                  -Infinity,
                ) > 3,
            }
          : { candidateReachedAudit: false },
        strictPlacebo: {
          requiredOnlyAfterDeterministicScreen:
            deterministicPromotionScreenPassed,
          completed: false,
        },
      },
      allHistoricalScreenGatesPassed: false,
      allEvidenceGatesPassed: false,
      candidateDisposition: deterministicPromotionScreenPassed
        ? "advance-to-separate-strict-1000-placebo-stage"
        : selectedRow
          ? "rejected-by-historical-audit-screen"
          : "rejected-before-audit-by-development-validation-funnel",
      eligibleForPaperForwardTracking: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      methodology: {
        historicalMembershipAppliedPerSession: true,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        batchWindowReuse: true,
        earlyStoppingBeforeAudit: true,
        earlyStoppingBeforePlacebos: true,
        auditExcludedFromSelection: true,
        parameterSelectionUsed: true,
      },
      dataQuality: {
        pointInTimeMembershipConstructed: true,
        membershipObservationCoveragePct,
        compiledSessions: calendar.length,
        compiledChunks: asArray(manifest.chunks).length,
        membershipUnionSymbols: number(
          datasetStatus?.coverage?.membershipUnionSymbols,
        ),
        priceUsableSymbols: number(datasetStatus?.coverage?.priceUsableSymbols),
        adjustedPriceIntegrityPass: true,
      },
      limitations: [
        "Every stored date was observable before R9; the nested chronology constrains selection but is not a genuinely untouched future sample.",
        "R9 searches 18 correlated portfolio-construction specifications around the single best R8 signal, so a deterministic survivor still needs the separate 1,000-placebo stage and multiplicity adjustment.",
        "No fundamental, analyst-estimate, options, short-interest, alternative-data, or point-in-time news feature is available in the certified dataset.",
        "Independent cross-universe replication and 60 genuinely new sessions remain mandatory before any alpha or live-capital claim.",
      ],
      nextStep: deterministicPromotionScreenPassed
        ? "Run the separate 1,000-seed matched-placebo stage without changing the selected candidate."
        : "Do not deploy another one-thesis version. Use the batched report to decide whether the certified price-only feature space is exhausted.",
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R9_STORE, report);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R9_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

export async function runPointInTimeSp500AlphaEarningsDriftR10({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, r9Report, datasetStatus, blueprint] =
    await Promise.all([
      readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
      getPointInTimeSp500AlphaCreatorV2Integrity(),
      getPointInTimeSp500AlphaSizingR9(),
      getPointInTimeSp500DatasetStatus(),
      readPrivateJson(POINT_IN_TIME_SP500_UNIVERSE_STORE),
    ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The corrected point-in-time S&P 500 checkpoint is unavailable",
    );
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error(
      "R10 remains blocked until corrected price integrity passes for this exact dataset",
    );
  if (
    r9Report?.status !== "complete" ||
    r9Report?.datasetFingerprint !== datasetFingerprint ||
    !String(r9Report?.candidateDisposition || "").startsWith("rejected-")
  )
    throw new Error(
      "R10 remains blocked until the R9 batch is preserved as rejected on this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R10_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R10_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R10_REPORT_VERSION,
    researchGeneration: "R10",
    productionCandidateVersion: "V20",
    status: "running",
    experiment: "R10 point-in-time post-earnings-announcement drift batch",
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "Eighteen frozen earnings-surprise and post-event drift candidates share one development restore; only four may reach validation and one may reach audit.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R10_STORE, running);

  try {
    const earnings = await getOrFetchPointInTimeEarningsSurprises(
      datasetThrough,
      blueprint?.privateBlueprint?.unionSymbols,
    );
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R10_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const definitions = pointInTimeSp500AlphaR10EarningsDriftDefinitions();
    const datasetOptions = {
      datasetTransform: (dataset) =>
        addEarningsSurprisesToDataset(dataset, calendar, earnings.rows),
    };
    const developmentEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        windows.development,
        datasetOptions,
      );
    const developmentRank = developmentEvaluations
      .map(({ definition, summary }) => ({
        definition,
        summary,
        score: pointInTimeAlphaDevelopmentScore(summary),
        checks: pointInTimeAlphaPhaseChecks(summary, {
          minimumClosedTrades: 20,
        }),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const finalists = developmentRank.slice(0, 4);
    const validationEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        finalists.map((row) => row.definition),
        windows.validation,
        datasetOptions,
      );
    const validationById = new Map(
      validationEvaluations.map((row) => [row.definition.id, row]),
    );
    const finalistResults = finalists
      .map((row) => {
        const validation = validationById.get(row.definition.id)?.summary;
        const validationChecks = pointInTimeAlphaPhaseChecks(validation);
        const clearsDevelopmentAndValidation =
          Object.values(row.checks).every(Boolean) &&
          Object.values(validationChecks).every(Boolean);
        return {
          ...row,
          validation,
          validationChecks,
          clearsDevelopmentAndValidation,
          nestedScore: roundMetric(
            row.score + 1.5 * pointInTimeAlphaDevelopmentScore(validation),
            3,
          ),
        };
      })
      .sort(
        (left, right) =>
          Number(right.clearsDevelopmentAndValidation) -
            Number(left.clearsDevelopmentAndValidation) ||
          right.nestedScore - left.nestedScore ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const selectedRow = finalistResults.find(
      (row) => row.clearsDevelopmentAndValidation,
    );
    let historicalAudit = null;
    let forwardDiagnostic = null;
    let auditChecks = null;
    let excessReturnStatistics = null;
    let deterministicPromotionScreenPassed = false;
    if (selectedRow) {
      historicalAudit = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.historicalAudit,
          datasetOptions,
        )
      )[0];
      forwardDiagnostic = (
        await evaluatePointInTimeAlphaDefinitions(
          manifest,
          calendar,
          [selectedRow.definition],
          windows.forwardDiagnostic,
          datasetOptions,
        )
      )[0];
      auditChecks = pointInTimeAlphaPhaseChecks(historicalAudit.summary);
      excessReturnStatistics = {
        SPY: benchmarkExcessReturnStatistic(historicalAudit.runs, "SPY"),
        QQQ: benchmarkExcessReturnStatistic(historicalAudit.runs, "QQQ"),
      };
      deterministicPromotionScreenPassed =
        Object.values(auditChecks).every(Boolean) &&
        number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3 &&
        number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3;
    }
    const completedAt = new Date().toISOString();
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const selected = selectedRow
      ? {
          id: selectedRow.definition.id,
          label: selectedRow.definition.label,
          family: selectedRow.definition.family,
          weights: selectedRow.definition.weights,
          configuration: selectedRow.definition.overrides,
          development: selectedRow.summary,
          validation: selectedRow.validation,
          historicalAudit: historicalAudit?.summary || null,
          forwardDiagnostic: forwardDiagnostic?.summary || null,
        }
      : null;
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_R10_REPORT_VERSION,
      researchGeneration: "R10",
      productionCandidateVersion: "V20",
      status: "complete",
      experiment: "R10 point-in-time post-earnings-announcement drift batch",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R10_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R10_PROSPECTIVE_START,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      candidateCount: definitions.length,
      developmentCandidates: definitions.length,
      validationFinalists: finalists.length,
      auditCandidates: selectedRow ? 1 : 0,
      fullPlaceboRunsAvoided: deterministicPromotionScreenPassed !== true,
      selectionPolicy:
        "Rank 18 frozen earnings-drift candidates on development, carry four to validation, require every development and validation gate, then freeze one nested-score winner for audit. Audit is never used to choose or retune.",
      windows,
      candidates: developmentRank.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        family: row.definition.family,
        weights: row.definition.weights,
        configuration: row.definition.overrides,
        development: row.summary,
        developmentScore: row.score,
      })),
      finalists: finalistResults.map((row) => ({
        id: row.definition.id,
        label: row.definition.label,
        developmentScore: row.score,
        validationScore: pointInTimeAlphaDevelopmentScore(row.validation),
        nestedScore: row.nestedScore,
        clearsDevelopmentAndValidation:
          row.clearsDevelopmentAndValidation,
        validation: row.validation,
      })),
      selectedCandidateId: selected?.id || null,
      selected,
      statisticalEvidence: {
        method:
          "Selection uses development and validation only; Newey-West HAC t-statistics are computed on historical-audit returns only.",
        significanceThresholdT: 3,
        excessReturnStatistics,
        deterministicPromotionScreenPassed,
        strictMatchedPlacebosRun: 0,
        strictMatchedPlacebosRequired:
          POINT_IN_TIME_SP500_ALPHA_R10_STRICT_PLACEBO_SEEDS,
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R10_RESEARCH_GENERATIONS,
      },
      checks: {
        data: {
          pointInTimeMembershipCoverageComplete:
            membershipObservationCoveragePct === 100,
          correctedPriceIntegrityPassed:
            integrity.assessment.adjustedPriceIntegrityPass === true,
          noBenchmarkCompletionSleeve: true,
          earningsAvailableNextSessionOnly: true,
          earningsRowsAvailable: earnings.rowCount >= 1_000,
          earningsUniverseCoverageAtLeast80Pct:
            earnings.coveragePct >= 80,
        },
        selection: {
          finalistClearedDevelopmentAndValidation: Boolean(selectedRow),
        },
        historicalAudit: auditChecks || { candidateReachedAudit: false },
        statisticalSignificance: excessReturnStatistics
          ? {
              auditNeweyWestTAboveThreeVsSpy:
                number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3,
              auditNeweyWestTAboveThreeVsQqq:
                number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3,
            }
          : { candidateReachedAudit: false },
        strictPlacebo: {
          requiredOnlyAfterDeterministicScreen:
            deterministicPromotionScreenPassed,
          completed: false,
        },
      },
      allHistoricalScreenGatesPassed: false,
      allEvidenceGatesPassed: false,
      candidateDisposition: deterministicPromotionScreenPassed
        ? "advance-to-separate-strict-1000-placebo-stage"
        : selectedRow
          ? "rejected-by-historical-audit-screen"
          : "rejected-before-audit-by-development-validation-funnel",
      eligibleForPaperForwardTracking: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      methodology: {
        historicalMembershipAppliedPerSession: true,
        earningsAvailabilityConvention:
          earnings.availabilityConvention,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        batchWindowReuse: true,
        earlyStoppingBeforeAudit: true,
        earlyStoppingBeforePlacebos: true,
        auditExcludedFromSelection: true,
        parameterSelectionUsed: true,
      },
      dataQuality: {
        pointInTimeMembershipConstructed: true,
        membershipObservationCoveragePct,
        compiledSessions: calendar.length,
        compiledChunks: asArray(manifest.chunks).length,
        membershipUnionSymbols: number(
          datasetStatus?.coverage?.membershipUnionSymbols,
        ),
        priceUsableSymbols: number(datasetStatus?.coverage?.priceUsableSymbols),
        earningsSurpriseRows: earnings.rowCount,
        earningsSurpriseSymbols: earnings.symbolCount,
        earningsUniverseCoveragePct: earnings.coveragePct,
        earningsFirstDate: earnings.firstDate,
        earningsLastDate: earnings.lastDate,
        adjustedPriceIntegrityPass: true,
      },
      limitations: [
        "Every stored date was observable before R10; the nested chronology constrains selection but is not a genuinely untouched future sample.",
        "The vendor earnings date is treated conservatively as observable only on the first later market session, but the historical estimate is not certified as an unrevised real-time consensus snapshot.",
        "R10 searches 18 correlated earnings-drift specifications, so a deterministic survivor still needs the separate 1,000-placebo stage and multiplicity adjustment.",
        "Independent cross-universe replication and 60 genuinely new sessions remain mandatory before any alpha or live-capital claim.",
      ],
      nextStep: deterministicPromotionScreenPassed
        ? "Run the separate 1,000-seed matched-placebo stage without changing the selected candidate."
        : "Reject this earnings-drift batch and acquire a separate historical Nasdaq universe before defining another candidate family.",
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R10_STORE, report);
    return normalizePointInTimeAlphaReport(report, datasetStatus);
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R10_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

function r14DefinitionFingerprint(definition) {
  return sha256Fingerprint(
    JSON.stringify({
      id: definition.id,
      label: definition.label,
      family: definition.family || null,
      mechanism: definition.mechanism || null,
      weights: definition.weights || null,
      overrides: definition.overrides,
    }),
  );
}

function r14CandidateRow(evaluation, minimumClosedTrades = 15) {
  const checks = pointInTimeAlphaPhaseChecks(evaluation.summary, {
    minimumClosedTrades,
  });
  return {
    id: evaluation.definition.id,
    label: evaluation.definition.label,
    family: evaluation.definition.family || null,
    mechanism: evaluation.definition.mechanism || null,
    weights: evaluation.definition.weights || null,
    configuration: evaluation.definition.overrides,
    definitionFingerprint: r14DefinitionFingerprint(evaluation.definition),
    score: pointInTimeAlphaDevelopmentScore(evaluation.summary),
    summary: compactPointInTimeAlphaPhase(evaluation.summary),
    checks,
    clearsPhase: Object.values(checks).every(Boolean),
  };
}

function r14SelectionComparator(left, right) {
  return (
    Number(right.clearsPhase) - Number(left.clearsPhase) ||
    number(right.score, -Infinity) - number(left.score, -Infinity) ||
    left.id.localeCompare(right.id)
  );
}

function r14BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_SP500_ALPHA_R14_REPORT_VERSION,
    researchGeneration: "R14",
    productionCandidateVersion: "V22-research-only",
    status,
    experiment: "R14 point-in-time SEC filing operating-inflection research",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R14_FROZEN_DATE,
    earliestProspectiveSession: POINT_IN_TIME_SP500_ALPHA_R14_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    filingDataFingerprint: context.facts.dataFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_SP500_ALPHA_R14_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeSp500R14Context() {
  const [manifest, integrity, r10Report, datasetStatus, facts] =
    await Promise.all([
      readExactPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
      getPointInTimeSp500AlphaCreatorV2Integrity(),
      getPointInTimeSp500AlphaEarningsDriftR10(),
      getPointInTimeSp500DatasetStatus(),
      readExactPrivateJson(POINT_IN_TIME_SP500_SEC_R14_FACTS_STORE),
    ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The corrected point-in-time S&P 500 checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error("R14 is blocked until price integrity passes for this exact dataset");
  if (
    r10Report?.status !== "complete" ||
    r10Report?.datasetFingerprint !== datasetFingerprint ||
    !String(r10Report?.candidateDisposition || "").startsWith("rejected-")
  )
    throw new Error("R14 requires the preserved rejected R10 S&P result");
  if (
    facts?.status !== "complete" ||
    facts?.datasetThrough !== datasetThrough ||
    number(facts?.coveragePct, 0) < 80 ||
    !validSha256(facts?.dataFingerprint)
  )
    throw new Error("R14 SEC filing data are not complete and fingerprinted");
  const definitions = pointInTimeSecFilingR14Definitions();
  const controls = pointInTimeSecFilingR14Controls();
  const candidateSetFingerprint = sha256Fingerprint(
    JSON.stringify([...definitions, ...controls]),
  );
  const executionCommit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const experimentFingerprint = sha256Fingerprint(
    JSON.stringify({
      datasetFingerprint,
      filingDataFingerprint: facts.dataFingerprint,
      candidateSetFingerprint,
      executionContract: POINT_IN_TIME_SP500_ALPHA_R14_EXECUTION_CONTRACT,
      executionCommit,
      windows: POINT_IN_TIME_SP500_ALPHA_WINDOWS,
    }),
  );
  return {
    manifest,
    integrity,
    datasetStatus,
    facts,
    calendar,
    datasetThrough,
    datasetFingerprint,
    definitions,
    controls,
    candidateSetFingerprint,
    executionCommit,
    experimentFingerprint,
    windows: POINT_IN_TIME_SP500_ALPHA_WINDOWS,
  };
}

function r14ReportMatches(report, context) {
  return Boolean(
    report?.version === POINT_IN_TIME_SP500_ALPHA_R14_REPORT_VERSION &&
      report?.datasetFingerprint === context.datasetFingerprint &&
      report?.filingDataFingerprint === context.facts.dataFingerprint &&
      report?.candidateSetFingerprint === context.candidateSetFingerprint &&
      report?.experimentFingerprint === context.experimentFingerprint &&
      report?.executionContract ===
        POINT_IN_TIME_SP500_ALPHA_R14_EXECUTION_CONTRACT &&
      report?.executionCommit === context.executionCommit,
  );
}

export async function runPointInTimeSp500AlphaFilingR14({
  force = false,
  now = Date.now(),
} = {}) {
  const context = await pointInTimeSp500R14Context();
  const stored = await readExactPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R14_STORE,
  ).catch(() => null);
  const existing = r14ReportMatches(stored, context) ? stored : null;
  if (!force && existing?.status === "complete") return { ...existing, cached: true };
  const claimTime = new Date(existing?.runClaimedAt || 0).getTime();
  if (
    !force &&
    existing?.status === "running" &&
    Number.isFinite(claimTime) &&
    now - claimTime < RUNNING_TTL_MS
  )
    return existing;

  const priorStage = force ? null : existing;
  const stage =
    priorStage?.status === "awaiting-validation"
      ? "validation"
      : priorStage?.status === "awaiting-audit"
        ? "historical-audit"
        : priorStage?.status === "awaiting-strict-placebo"
          ? "strict-placebo"
          : "development";
  if (stage === "strict-placebo") return priorStage;
  const startedAt = new Date(now).toISOString();
  const running = {
    ...r14BaseReport(context, "running"),
    ...priorStage,
    status: "running",
    stage,
    startedAt: priorStage?.startedAt || startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    message: `Executing only the frozen R14 ${stage} stage.`,
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, running);
  const datasetOptions = {
    datasetTransform: (dataset) =>
      addFilingEventsToDataset(dataset, context.calendar, context.facts.rows),
  };

  try {
    if (stage === "development") {
      const candidateEvaluations = await evaluatePointInTimeAlphaDefinitions(
        context.manifest,
        context.calendar,
        context.definitions,
        context.windows.development,
        datasetOptions,
      );
      // Run controls after active candidates so two restored replay sets are
      // never resident concurrently in the memory-constrained function.
      const controlEvaluations = await evaluatePointInTimeAlphaDefinitions(
        context.manifest,
        context.calendar,
        context.controls,
        context.windows.development,
        datasetOptions,
      );
      const candidates = candidateEvaluations
        .map((row) => r14CandidateRow(row, 20))
        .sort(r14SelectionComparator);
      const controls = controlEvaluations
        .map((row) => r14CandidateRow(row, 20))
        .sort(r14SelectionComparator);
      const finalists = candidates.filter((row) => row.clearsPhase).slice(0, 2);
      if (!finalists.length) {
        const report = {
          ...r14BaseReport(context, "complete"),
          startedAt,
          completedAt: new Date().toISOString(),
          developmentCandidates: candidates,
          developmentControls: controls,
          validationFinalists: [],
          auditCandidates: 0,
          selectedCandidateId: null,
          candidateDisposition: "rejected-by-development-screen",
          allHistoricalScreenGatesPassed: false,
          nextStep:
            "Preserve this family rejection. Do not inspect validation or change V11 production.",
          limitations: r14Limitations(),
        };
        await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, report);
        return report;
      }
      const interim = {
        ...r14BaseReport(context, "awaiting-validation"),
        startedAt,
        updatedAt: new Date().toISOString(),
        developmentCandidates: candidates,
        developmentControls: controls,
        validationFinalists: finalists.map((row) => row.id),
        nextStep:
          "Run only the frozen development survivors on the sealed validation windows.",
        limitations: r14Limitations(),
      };
      await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, interim);
      return interim;
    }

    const definitionsById = new Map(
      context.definitions.map((definition) => [definition.id, definition]),
    );
    if (stage === "validation") {
      const finalistIds = asArray(priorStage.validationFinalists).map(String);
      const finalistDefinitions = finalistIds.map((id) => definitionsById.get(id));
      if (!finalistDefinitions.length || finalistDefinitions.some((row) => !row))
        throw new Error("R14 validation finalists failed frozen-definition integrity");
      const evaluations = await evaluatePointInTimeAlphaDefinitions(
        context.manifest,
        context.calendar,
        finalistDefinitions,
        context.windows.validation,
        datasetOptions,
      );
      const developmentById = new Map(
        asArray(priorStage.developmentCandidates).map((row) => [row.id, row]),
      );
      const validation = evaluations
        .map((evaluation) => {
          const row = r14CandidateRow(evaluation, 15);
          return {
            ...row,
            clearsPhase:
              row.clearsPhase && developmentById.get(row.id)?.clearsPhase === true,
            nestedScore: roundMetric(
              number(developmentById.get(row.id)?.score, -100) + 1.5 * row.score,
              3,
            ),
          };
        })
        .sort(
          (left, right) =>
            Number(right.clearsPhase) - Number(left.clearsPhase) ||
            right.nestedScore - left.nestedScore ||
            left.id.localeCompare(right.id),
        );
      const selected = validation.find((row) => row.clearsPhase) || null;
      if (!selected) {
        const report = {
          ...r14BaseReport(context, "complete"),
          startedAt: priorStage.startedAt,
          completedAt: new Date().toISOString(),
          developmentCandidates: priorStage.developmentCandidates,
          developmentControls: priorStage.developmentControls,
          validationFinalists: validation,
          auditCandidates: 0,
          selectedCandidateId: null,
          candidateDisposition: "rejected-by-validation-screen",
          allHistoricalScreenGatesPassed: false,
          nextStep: "Preserve this family rejection. Keep the historical audit sealed.",
          limitations: r14Limitations(),
        };
        await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, report);
        return report;
      }
      const interim = {
        ...r14BaseReport(context, "awaiting-audit"),
        startedAt: priorStage.startedAt,
        updatedAt: new Date().toISOString(),
        developmentCandidates: priorStage.developmentCandidates,
        developmentControls: priorStage.developmentControls,
        validationFinalists: validation,
        selectedCandidateId: selected.id,
        selectedDefinitionFingerprint: selected.definitionFingerprint,
        nextStep:
          "Run exactly one frozen validation survivor on the sealed historical audit.",
        limitations: r14Limitations(),
      };
      await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, interim);
      return interim;
    }

    const selectedId = String(priorStage.selectedCandidateId || "");
    const selectedDefinition = definitionsById.get(selectedId);
    if (
      !selectedDefinition ||
      r14DefinitionFingerprint(selectedDefinition) !==
        priorStage.selectedDefinitionFingerprint
    )
      throw new Error("R14 audit candidate failed frozen-definition integrity");
    const auditEvaluation = await evaluatePointInTimeAlphaDefinitions(
      context.manifest,
      context.calendar,
      [selectedDefinition],
      context.windows.historicalAudit,
      datasetOptions,
    );
    const forwardEvaluation = await evaluatePointInTimeAlphaDefinitions(
      context.manifest,
      context.calendar,
      [selectedDefinition],
      context.windows.forwardDiagnostic,
      datasetOptions,
    );
    const audit = r14CandidateRow(auditEvaluation[0], 15);
    const forwardDiagnostic = r14CandidateRow(forwardEvaluation[0], 1);
    const excessReturnStatistics = {
      SPY: benchmarkExcessReturnStatistic(auditEvaluation[0].runs, "SPY"),
      QQQ: benchmarkExcessReturnStatistic(auditEvaluation[0].runs, "QQQ"),
    };
    const tradeConcentration = summarizePointInTimeTradeConcentration(
      auditEvaluation[0].runs,
    );
    const dataGatesPassed = Boolean(
      context.integrity.assessment.adjustedPriceIntegrityPass === true &&
        number(context.facts.coveragePct, 0) >= 80 &&
        number(
          context.datasetStatus?.coverage?.membershipObservationCoveragePct,
          0,
        ) === 100,
    );
    const deterministicPromotionScreenPassed = Boolean(
      dataGatesPassed &&
        audit.clearsPhase &&
        number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3 &&
        number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3 &&
        tradeConcentration.concentrationWarning === false,
    );
    const finalStatus = deterministicPromotionScreenPassed
      ? "awaiting-strict-placebo"
      : "complete";
    const report = {
      ...r14BaseReport(context, finalStatus),
      startedAt: priorStage.startedAt,
      completedAt:
        finalStatus === "complete" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      developmentCandidates: priorStage.developmentCandidates,
      developmentControls: priorStage.developmentControls,
      validationFinalists: priorStage.validationFinalists,
      auditCandidates: 1,
      selectedCandidateId: selectedId,
      selected: {
        id: selectedDefinition.id,
        label: selectedDefinition.label,
        family: selectedDefinition.family,
        mechanism: selectedDefinition.mechanism,
        weights: selectedDefinition.weights,
        configuration: selectedDefinition.overrides,
        historicalAudit: audit,
        forwardDiagnostic,
      },
      statisticalEvidence: {
        method:
          "Newey-West HAC t-statistics with five lags on audit-only daily strategy-minus-benchmark returns.",
        significanceThresholdT: 3,
        excessReturnStatistics,
        deterministicPromotionScreenPassed,
        strictMatchedPlacebosRun: 0,
        strictMatchedPlacebosRequired:
          POINT_IN_TIME_SP500_ALPHA_R14_STRICT_PLACEBO_SEEDS,
        researchGenerationsCounted:
          POINT_IN_TIME_SP500_ALPHA_R14_RESEARCH_GENERATIONS,
      },
      tradeConcentration,
      checks: {
        data: {
          correctedPriceIntegrityPassed: true,
          pointInTimeMembershipCoverageComplete:
            number(
              context.datasetStatus?.coverage
                ?.membershipObservationCoveragePct,
              0,
            ) === 100,
          secFilingCoverageAtLeast80Pct: context.facts.coveragePct >= 80,
          filingAvailableNextSessionOnly: true,
          noBenchmarkCompletionSleeve: true,
        },
        selection: {
          candidateSetFrozenBeforeExecution: true,
          validationUsedOnlyDevelopmentSurvivors: true,
          exactlyOneAuditCandidate: true,
          auditExcludedFromSelection: true,
        },
        historicalAudit: audit.checks,
        statisticalSignificance: {
          auditNeweyWestTAboveThreeVsSpy:
            number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3,
          auditNeweyWestTAboveThreeVsQqq:
            number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3,
        },
        strictPlacebo: {
          requiredOnlyAfterDeterministicScreen:
            deterministicPromotionScreenPassed,
          completed: false,
        },
        prospective: { atLeast60GenuinelyNewSessions: false },
      },
      allHistoricalScreenGatesPassed: deterministicPromotionScreenPassed,
      candidateDisposition: deterministicPromotionScreenPassed
        ? "advance-to-separate-strict-1000-placebo-stage"
        : "rejected-by-historical-audit-screen",
      methodology: {
        historicalMembershipAppliedPerSession: true,
        filingAvailabilityConvention:
          context.facts.availabilityConvention,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        commissionAssumed: 0,
        wholeShares: true,
        residualCashRemainsCash: true,
        benchmarkCompletionSleeveUsed: false,
        phaseHoldoutIsolation: true,
      },
      dataQuality: {
        secFilingCoveragePct: context.facts.coveragePct,
        secFilingEventRows: context.facts.eventRows,
        secFilingCoveredSymbols: context.facts.coveredSymbols,
        adjustedPriceIntegrityPass: true,
      },
      limitations: r14Limitations(),
      nextStep: deterministicPromotionScreenPassed
        ? "Run 1,000 maximum-statistic matched placebos without changing the candidate, then begin a 60-session prospective ledger."
        : "Preserve this rejection and do not change V11 production.",
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, report);
    return report;
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R14_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

function r14Limitations() {
  return [
    "Every stored session through 2026-09-01 was visible before R14 and can reject but cannot establish prospective alpha.",
    "SEC standard-taxonomy coverage varies by issuer; missing or misaligned facts fail closed and current ticker-to-CIK mapping may omit historical symbols.",
    "Five correlated active candidates require a separate 1,000-seed maximum-statistic placebo stage after any deterministic audit pass.",
    "Independent replication and at least 60 genuinely new sessions remain mandatory before an alpha or live-capital claim.",
  ];
}

function r15DefinitionFingerprint(definition) {
  return sha256Fingerprint(
    JSON.stringify({
      researchGeneration: definition.researchGeneration || null,
      id: definition.id,
      label: definition.label,
      family: definition.family || null,
      mechanism: definition.mechanism || null,
      weights: definition.weights || null,
      lifecycle: definition.lifecycle || null,
      overrides: definition.overrides,
    }),
  );
}

function r15CandidateRow(evaluation, minimumClosedTrades = 15) {
  const checks = pointInTimeAlphaPhaseChecks(evaluation.summary, {
    minimumClosedTrades,
  });
  return {
    researchGeneration:
      evaluation.definition.researchGeneration || "control",
    id: evaluation.definition.id,
    label: evaluation.definition.label,
    family: evaluation.definition.family || null,
    mechanism: evaluation.definition.mechanism || null,
    weights: evaluation.definition.weights || null,
    lifecycle: evaluation.definition.lifecycle || null,
    configuration: evaluation.definition.overrides,
    definitionFingerprint: r15DefinitionFingerprint(evaluation.definition),
    score: pointInTimeAlphaDevelopmentScore(evaluation.summary),
    summary: compactPointInTimeAlphaPhase(evaluation.summary),
    checks,
    clearsPhase: Object.values(checks).every(Boolean),
  };
}

function r15Limitations() {
  return [
    "Every stored session through 2026-09-01 was visible before R15-R19 and may reject but cannot establish prospective alpha.",
    "Five correlated momentum hypotheses are run in parallel; concurrency reduces wall-clock time but not the multiple-testing burden.",
    "A deterministic historical survivor still requires a separate 1,000-seed maximum-statistic placebo test across the entire parallel family.",
    "Independent replication and at least 60 genuinely new sessions remain mandatory before an alpha or live-capital claim.",
  ];
}

function r15BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_SP500_MOMENTUM_R15_REPORT_VERSION,
    researchGeneration: "R15-R19",
    productionCandidateVersion: "V23-research-only",
    status,
    experiment: "Parallel point-in-time momentum-spine research",
    frozenDate: POINT_IN_TIME_SP500_MOMENTUM_R15_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_MOMENTUM_R15_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_SP500_MOMENTUM_R15_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeSp500R15Context() {
  const [manifest, integrity, r14, datasetStatus] = await Promise.all([
    readExactPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
    getPointInTimeSp500AlphaFilingR14(),
    getPointInTimeSp500DatasetStatus(),
  ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The corrected point-in-time S&P 500 checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetThrough = calendar.at(-1) || null;
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: datasetThrough,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  if (
    integrity?.assessment?.adjustedPriceIntegrityPass !== true ||
    integrity?.datasetFingerprint !== datasetFingerprint
  )
    throw new Error("R15-R19 are blocked until price integrity passes for this exact dataset");
  if (
    r14?.status !== "complete" ||
    !String(r14?.candidateDisposition || "").startsWith("rejected-")
  )
    throw new Error("R15-R19 require the preserved terminal R14 rejection");
  const definitions = pointInTimeMomentumSpineR15Definitions();
  const controls = pointInTimeMomentumSpineR15Controls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const experimentFingerprint = sha256Fingerprint(
    JSON.stringify({
      datasetFingerprint,
      candidateSetFingerprint,
      executionContract: POINT_IN_TIME_SP500_MOMENTUM_R15_EXECUTION_CONTRACT,
      executionCommit,
      windows: POINT_IN_TIME_SP500_ALPHA_WINDOWS,
    }),
  );
  return {
    manifest,
    integrity,
    datasetStatus,
    calendar,
    datasetThrough,
    datasetFingerprint,
    definitions,
    controls,
    workUnits,
    definitionsById: new Map(workUnits.map((row) => [row.id, row])),
    candidateSetFingerprint,
    executionCommit,
    experimentFingerprint,
    windows: POINT_IN_TIME_SP500_ALPHA_WINDOWS,
  };
}

function r15WorkerStorePath(context, candidateId) {
  if (!context.definitionsById.has(candidateId))
    throw new Error(`Unknown R15-R19 work unit: ${candidateId}`);
  return `${POINT_IN_TIME_SP500_MOMENTUM_R15_WORKER_PREFIX}/${context.experimentFingerprint}/development/${candidateId}.json`;
}

export async function runPointInTimeSp500MomentumSpineWorker({
  candidateId,
} = {}) {
  const context = await pointInTimeSp500R15Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R15-R19 work unit: ${id}`);
  const pathname = r15WorkerStorePath(context, id);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (
    existing?.status === "complete" &&
    existing?.experimentFingerprint === context.experimentFingerprint &&
    existing?.definitionFingerprint === r15DefinitionFingerprint(definition)
  )
    return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, {
    ...r15BaseReport(context, "running"),
    candidateId: id,
    definitionFingerprint: r15DefinitionFingerprint(definition),
    startedAt,
    updatedAt: startedAt,
  });
  try {
    const [evaluation] = await evaluatePointInTimeAlphaDefinitions(
      context.manifest,
      context.calendar,
      [definition],
      context.windows.development,
    );
    const result = r15CandidateRow(evaluation, 20);
    const report = {
      ...r15BaseReport(context, "complete"),
      candidateId: id,
      definitionFingerprint: r15DefinitionFingerprint(definition),
      control: definition.control === true,
      startedAt,
      completedAt: new Date().toISOString(),
      result,
    };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = {
      ...r15BaseReport(context, "failed"),
      candidateId: id,
      definitionFingerprint: r15DefinitionFingerprint(definition),
      startedAt,
      failedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

export async function finalizePointInTimeSp500MomentumSpineDevelopment() {
  const context = await pointInTimeSp500R15Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(
      r15WorkerStorePath(context, definition.id),
    );
    if (
      worker?.status !== "complete" ||
      worker?.experimentFingerprint !== context.experimentFingerprint ||
      worker?.definitionFingerprint !== r15DefinitionFingerprint(definition) ||
      worker?.result?.definitionFingerprint !==
        r15DefinitionFingerprint(definition)
    )
      throw new Error(`R15-R19 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports
    .filter((row) => row.control !== true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const controls = workerReports
    .filter((row) => row.control === true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const finalists = candidates.filter((row) => row.clearsPhase).slice(0, 2);
  const startedAt = workerReports
    .map((row) => row.startedAt)
    .filter(Boolean)
    .sort()[0];
  const completedAt = new Date().toISOString();
  const workerIntervals = workerReports.map((row) => ({
    candidateId: row.candidateId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
  const starts = workerIntervals.map((row) => new Date(row.startedAt).getTime());
  const ends = workerIntervals.map((row) => new Date(row.completedAt).getTime());
  const parallelExecution = {
    workerCount: workerIntervals.length,
    workers: workerIntervals,
    wallClockOverlapObserved:
      starts.every(Number.isFinite) &&
      ends.every(Number.isFinite) &&
      Math.max(...starts) < Math.min(...ends),
  };
  const report = finalists.length
    ? {
        ...r15BaseReport(context, "awaiting-validation"),
        startedAt,
        updatedAt: completedAt,
        developmentCandidates: candidates,
        developmentControls: controls,
        validationFinalists: finalists.map((row) => row.id),
        parallelExecution,
        nextStep:
          "Run only the frozen development survivors on sealed validation windows.",
        limitations: r15Limitations(),
      }
    : {
        ...r15BaseReport(context, "complete"),
        startedAt,
        completedAt,
        developmentCandidates: candidates,
        developmentControls: controls,
        validationFinalists: [],
        auditCandidates: 0,
        selectedCandidateId: null,
        candidateDisposition: "rejected-by-development-screen",
        allHistoricalScreenGatesPassed: false,
        parallelExecution,
        nextStep:
          "Preserve all five parallel momentum-family rejections; do not change V11 production.",
        limitations: r15Limitations(),
      };
  await persistPrivateJson(POINT_IN_TIME_SP500_MOMENTUM_R15_STORE, report);
  return report;
}

export async function advancePointInTimeSp500MomentumSpineR15() {
  const context = await pointInTimeSp500R15Context();
  const current = await getPointInTimeSp500MomentumSpineR15();
  if (current?.status === "complete") return current;
  const definitionsById = new Map(
    context.definitions.map((definition) => [definition.id, definition]),
  );
  if (current?.status === "awaiting-validation") {
    const finalists = asArray(current.validationFinalists).map((id) =>
      definitionsById.get(String(id)),
    );
    if (!finalists.length || finalists.some((row) => !row))
      throw new Error("R15-R19 validation finalists failed frozen-definition integrity");
    const evaluations = await evaluatePointInTimeAlphaDefinitions(
      context.manifest,
      context.calendar,
      finalists,
      context.windows.validation,
    );
    const developmentById = new Map(
      asArray(current.developmentCandidates).map((row) => [row.id, row]),
    );
    const validation = evaluations
      .map((evaluation) => {
        const row = r15CandidateRow(evaluation, 15);
        return {
          ...row,
          clearsPhase:
            row.clearsPhase && developmentById.get(row.id)?.clearsPhase === true,
          nestedScore: roundMetric(
            number(developmentById.get(row.id)?.score, -100) + 1.5 * row.score,
            3,
          ),
        };
      })
      .sort(
        (left, right) =>
          Number(right.clearsPhase) - Number(left.clearsPhase) ||
          right.nestedScore - left.nestedScore ||
          left.id.localeCompare(right.id),
      );
    const selected = validation.find((row) => row.clearsPhase) || null;
    const report = selected
      ? {
          ...current,
          status: "awaiting-audit",
          updatedAt: new Date().toISOString(),
          validationFinalists: validation,
          selectedCandidateId: selected.id,
          selectedDefinitionFingerprint: selected.definitionFingerprint,
          nextStep:
            "Run exactly one frozen validation survivor on the historical audit.",
        }
      : {
          ...current,
          status: "complete",
          completedAt: new Date().toISOString(),
          validationFinalists: validation,
          auditCandidates: 0,
          selectedCandidateId: null,
          candidateDisposition: "rejected-by-validation-screen",
          allHistoricalScreenGatesPassed: false,
          nextStep: "Preserve the rejection and keep the historical audit sealed.",
        };
    await persistPrivateJson(POINT_IN_TIME_SP500_MOMENTUM_R15_STORE, report);
    return report;
  }
  if (current?.status !== "awaiting-audit") return current;
  const selectedId = String(current.selectedCandidateId || "");
  const selectedDefinition = definitionsById.get(selectedId);
  if (
    !selectedDefinition ||
    r15DefinitionFingerprint(selectedDefinition) !==
      current.selectedDefinitionFingerprint
  )
    throw new Error("R15-R19 audit candidate failed frozen-definition integrity");
  const [auditEvaluation] = await evaluatePointInTimeAlphaDefinitions(
    context.manifest,
    context.calendar,
    [selectedDefinition],
    context.windows.historicalAudit,
  );
  const [forwardEvaluation] = await evaluatePointInTimeAlphaDefinitions(
    context.manifest,
    context.calendar,
    [selectedDefinition],
    context.windows.forwardDiagnostic,
  );
  const audit = r15CandidateRow(auditEvaluation, 15);
  const forwardDiagnostic = r15CandidateRow(forwardEvaluation, 1);
  const excessReturnStatistics = {
    SPY: benchmarkExcessReturnStatistic(auditEvaluation.runs, "SPY"),
    QQQ: benchmarkExcessReturnStatistic(auditEvaluation.runs, "QQQ"),
  };
  const tradeConcentration = summarizePointInTimeTradeConcentration(
    auditEvaluation.runs,
  );
  const dataGatesPassed = Boolean(
    context.integrity.assessment.adjustedPriceIntegrityPass === true &&
      number(
        context.datasetStatus?.coverage?.membershipObservationCoveragePct,
        0,
      ) === 100,
  );
  const deterministicPromotionScreenPassed = Boolean(
    dataGatesPassed &&
      audit.clearsPhase &&
      number(excessReturnStatistics.SPY.tStatistic, -Infinity) > 3 &&
      number(excessReturnStatistics.QQQ.tStatistic, -Infinity) > 3 &&
      tradeConcentration.concentrationWarning === false
  );
  const report = {
    ...current,
    status: deterministicPromotionScreenPassed
      ? "awaiting-strict-placebo"
      : "complete",
    completedAt: deterministicPromotionScreenPassed
      ? null
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    auditCandidates: 1,
    selected: {
      id: selectedDefinition.id,
      researchGeneration: selectedDefinition.researchGeneration,
      label: selectedDefinition.label,
      family: selectedDefinition.family,
      mechanism: selectedDefinition.mechanism,
      weights: selectedDefinition.weights,
      lifecycle: selectedDefinition.lifecycle,
      configuration: selectedDefinition.overrides,
      historicalAudit: audit,
      forwardDiagnostic,
    },
    statisticalEvidence: {
      method:
        "Newey-West HAC t-statistics with five lags on audit-only daily strategy-minus-benchmark returns.",
      significanceThresholdT: 3,
      excessReturnStatistics,
      deterministicPromotionScreenPassed,
      strictMatchedPlacebosRun: 0,
      strictMatchedPlacebosRequired: 1_000,
      parallelResearchGenerationsCounted: 5,
    },
    tradeConcentration,
    allHistoricalScreenGatesPassed: deterministicPromotionScreenPassed,
    candidateDisposition: deterministicPromotionScreenPassed
      ? "advance-to-separate-strict-1000-placebo-stage"
      : "rejected-by-historical-audit-screen",
    methodology: {
      historicalMembershipAppliedPerSession: true,
      nextSessionOpenExecution: true,
      slippageBps: 12,
      commissionAssumed: 0,
      wholeShares: true,
      residualCashRemainsCash: true,
      benchmarkCompletionSleeveUsed: false,
      parallelDevelopmentFamilies: true,
      phaseHoldoutIsolation: true,
    },
    limitations: r15Limitations(),
    nextStep: deterministicPromotionScreenPassed
      ? "Run a 1,000-seed maximum-statistic placebo across all five hypotheses, then begin the 60-session prospective ledger."
      : "Preserve the rejection and do not change V11 production.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_MOMENTUM_R15_STORE, report);
  return report;
}

function r20Limitations() {
  return [
    "Every stored session through 2026-09-01 has already been inspected by earlier research and may reject R20-R24 but cannot establish prospective alpha.",
    "The Nasdaq membership reconstruction is point-in-time and integrity-checked, but historical sector classifications are unavailable and therefore unused.",
    "Five correlated runner-retention hypotheses increase the multiple-testing burden even though they run concurrently.",
    "Any historical survivor remains research-only until an unchanged 1,000-seed maximum-statistic placebo and at least 60 genuinely new post-freeze sessions pass every gate.",
  ];
}

function r20BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_NASDAQ_RUNNER_R20_REPORT_VERSION,
    researchGeneration: "R20-R24",
    productionCandidateVersion: "V24-research-only",
    status,
    experiment: "Parallel point-in-time Nasdaq runner-retention research",
    frozenDate: POINT_IN_TIME_NASDAQ_RUNNER_R20_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_NASDAQ_RUNNER_R20_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R20_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeNasdaqR20Context() {
  const [manifest, integrity, datasetStatus, universe, r15] = await Promise.all([
    readExactPrivateJson(POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE),
    getPointInTimeNasdaqPriceIntegrity(),
    getPointInTimeNasdaqDatasetStatus(),
    getPointInTimeNasdaqUniverse(),
    getPointInTimeSp500MomentumSpineR15(),
  ]);
  assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe);
  if (
    integrity?.status !== "complete" ||
    integrity?.assessment?.allDataGatesPassed !== true ||
    integrity?.datasetFingerprint !== manifest.evidenceDatasetFingerprint
  )
    throw new Error(
      "R20-R24 are blocked until exact member-date Nasdaq price integrity passes",
    );
  if (
    r15?.status !== "complete" ||
    r15?.candidateDisposition !== "rejected-by-development-screen"
  )
    throw new Error("R20-R24 require the preserved terminal R15-R19 rejection");
  const definitions = pointInTimeNasdaqRunnerDefinitions();
  const controls = pointInTimeNasdaqRunnerControls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const experimentFingerprint = sha256Fingerprint(
    JSON.stringify({
      datasetFingerprint: manifest.evidenceDatasetFingerprint,
      candidateSetFingerprint,
      executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R20_EXECUTION_CONTRACT,
      executionCommit,
      developmentWindows: POINT_IN_TIME_SP500_ALPHA_WINDOWS.development,
    }),
  );
  return {
    manifest,
    integrity,
    datasetStatus,
    universe,
    calendar: asArray(manifest.sessionDates).map(String),
    datasetThrough: asArray(manifest.sessionDates).at(-1) || null,
    datasetFingerprint: manifest.evidenceDatasetFingerprint,
    definitions,
    controls,
    workUnits,
    definitionsById: new Map(workUnits.map((row) => [row.id, row])),
    candidateSetFingerprint,
    executionCommit,
    experimentFingerprint,
    developmentWindows: POINT_IN_TIME_SP500_ALPHA_WINDOWS.development,
  };
}

async function evaluatePointInTimeNasdaqRunnerDefinitions(
  context,
  definitions,
  windows,
) {
  const runsById = new Map(definitions.map((definition) => [definition.id, []]));
  for (const window of windows) {
    const dataset = await restorePointInTimeNasdaqWindow(
      context.manifest,
      context.calendar,
      window,
    );
    for (const definition of definitions) {
      const run = simulatePointInTimePortfolio(
        dataset,
        simulationOptions({
          ...definition.overrides,
          thesisId: `pit-nasdaq-runner-${definition.id}`,
          thesisLabel: definition.label,
          startDate: window.start,
          endDate: window.end,
        }),
      );
      assertCompleteResearchWindow(
        run,
        context.calendar,
        window,
        `${definition.label} ${window.start}`,
      );
      runsById.get(definition.id).push(run);
    }
  }
  return definitions.map((definition) => ({
    definition,
    runs: runsById.get(definition.id),
    summary: pointInTimeAlphaPhaseSummary(runsById.get(definition.id), windows),
  }));
}

function continuousPointInTimeAlphaPhaseSummary(fullRun, windows) {
  const windowRuns = windows.map((window) =>
    slicePointInTimePortfolioRun(fullRun, window.start, window.end),
  );
  const windowResults = windowRuns.map((run, index) => ({
    ...windows[index],
    ...compactPointInTimeAlphaMetricSummary(
      boundedReviewExperimentSummary(run),
    ),
  }));
  const windowMinimumAlpha = windowResults.map(minimumSimpleBenchmarkAlpha);
  const finiteWindowAlpha = windowMinimumAlpha.filter(Number.isFinite);
  return {
    aggregate: compactPointInTimeAlphaMetricSummary(
      boundedReviewExperimentSummary(fullRun),
    ),
    windows: windowResults,
    positiveAlphaWindows: finiteWindowAlpha.filter((value) => value > 0)
      .length,
    positiveAlphaWindowShare: finiteWindowAlpha.length
      ? roundMetric(
          finiteWindowAlpha.filter((value) => value > 0).length /
            finiteWindowAlpha.length,
          3,
        )
      : 0,
    medianMinimumBenchmarkAlphaPct: finiteWindowAlpha.length
      ? roundMetric(percentileValue(finiteWindowAlpha, 0.5), 3)
      : null,
    worstMinimumBenchmarkAlphaPct: finiteWindowAlpha.length
      ? roundMetric(Math.min(...finiteWindowAlpha), 3)
      : null,
    continuousLifecycle: true,
    boundaryLiquidations: asArray(fullRun?.trades).filter(
      (trade) =>
        trade?.reason === "window-end-liquidation" &&
        windows.slice(0, -1).some((window) => trade.date === window.end),
    ).length,
  };
}

async function evaluatePointInTimeNasdaqContinuousRunnerDefinitions(
  context,
  definitions,
  windows,
) {
  const unionWindow = {
    start: windows[0].start,
    end: windows.at(-1).end,
  };
  const dataset = await restorePointInTimeNasdaqWindow(
    context.manifest,
    context.calendar,
    unionWindow,
  );
  return definitions.map((definition) => {
    const run = simulatePointInTimePortfolio(
      dataset,
      simulationOptions({
        ...definition.overrides,
        thesisId: `pit-nasdaq-continuous-runner-${definition.id}`,
        thesisLabel: definition.label,
        startDate: unionWindow.start,
        endDate: unionWindow.end,
      }),
    );
    assertCompleteResearchWindow(
      run,
      context.calendar,
      unionWindow,
      `${definition.label} continuous chronology`,
    );
    const summary = continuousPointInTimeAlphaPhaseSummary(run, windows);
    if (summary.boundaryLiquidations !== 0)
      throw new Error(
        `${definition.id} unexpectedly liquidated at a reporting boundary`,
      );
    return { definition, runs: [run], summary };
  });
}

function r20WorkerStorePath(context, candidateId) {
  if (!context.definitionsById.has(candidateId))
    throw new Error(`Unknown R20-R24 work unit: ${candidateId}`);
  return `${POINT_IN_TIME_NASDAQ_RUNNER_R20_WORKER_PREFIX}/${context.experimentFingerprint}/development/${candidateId}.json`;
}

export async function runPointInTimeNasdaqRunnerWorker({ candidateId } = {}) {
  const context = await pointInTimeNasdaqR20Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R20-R24 work unit: ${id}`);
  const pathname = r20WorkerStorePath(context, id);
  const definitionFingerprint = r15DefinitionFingerprint(definition);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (
    existing?.status === "complete" &&
    existing?.experimentFingerprint === context.experimentFingerprint &&
    existing?.definitionFingerprint === definitionFingerprint
  )
    return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, {
    ...r20BaseReport(context, "running"),
    candidateId: id,
    definitionFingerprint,
    startedAt,
    updatedAt: startedAt,
  });
  try {
    const [evaluation] = await evaluatePointInTimeNasdaqRunnerDefinitions(
      context,
      [definition],
      context.developmentWindows,
    );
    const result = r15CandidateRow(evaluation, 20);
    const report = {
      ...r20BaseReport(context, "complete"),
      candidateId: id,
      definitionFingerprint,
      control: definition.control === true,
      startedAt,
      completedAt: new Date().toISOString(),
      result,
    };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = {
      ...r20BaseReport(context, "failed"),
      candidateId: id,
      definitionFingerprint,
      startedAt,
      failedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

function peakConcurrentIntervals(intervals) {
  const events = intervals.flatMap((row) => [
    { at: new Date(row.startedAt).getTime(), delta: 1 },
    { at: new Date(row.completedAt).getTime(), delta: -1 },
  ]);
  if (events.some((event) => !Number.isFinite(event.at))) return null;
  events.sort((left, right) => left.at - right.at || left.delta - right.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

export async function finalizePointInTimeNasdaqRunnerDevelopment() {
  const context = await pointInTimeNasdaqR20Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(
      r20WorkerStorePath(context, definition.id),
    );
    const fingerprint = r15DefinitionFingerprint(definition);
    if (
      worker?.status !== "complete" ||
      worker?.experimentFingerprint !== context.experimentFingerprint ||
      worker?.definitionFingerprint !== fingerprint ||
      worker?.result?.definitionFingerprint !== fingerprint
    )
      throw new Error(`R20-R24 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports
    .filter((row) => row.control !== true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const controls = workerReports
    .filter((row) => row.control === true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const finalists = candidates.filter((row) => row.clearsPhase).slice(0, 1);
  const intervals = workerReports.map((row) => ({
    candidateId: row.candidateId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
  const timestamps = intervals.flatMap((row) => [
    new Date(row.startedAt).getTime(),
    new Date(row.completedAt).getTime(),
  ]);
  const parallelExecution = {
    workerCount: intervals.length,
    workers: intervals,
    peakConcurrentWorkers: peakConcurrentIntervals(intervals),
    elapsedSeconds:
      timestamps.every(Number.isFinite) && timestamps.length
        ? roundMetric((Math.max(...timestamps) - Math.min(...timestamps)) / 1_000, 3)
        : null,
  };
  const completedAt = new Date().toISOString();
  const report = finalists.length
    ? {
        ...r20BaseReport(context, "complete"),
        startedAt: intervals.map((row) => row.startedAt).sort()[0],
        completedAt,
        developmentCandidates: candidates,
        developmentControls: controls,
        selectedCandidateId: finalists[0].id,
        selectedDefinitionFingerprint: finalists[0].definitionFingerprint,
        candidateDisposition: "frozen-for-prospective-tracking-only",
        historicalDevelopmentGatesPassed: true,
        allHistoricalScreenGatesPassed: false,
        prospectiveSessions: 0,
        parallelExecution,
        nextStep:
          "Track the unchanged historical survivor prospectively; previously inspected Nasdaq windows remain unavailable as validation holdouts.",
        limitations: r20Limitations(),
      }
    : {
        ...r20BaseReport(context, "complete"),
        startedAt: intervals.map((row) => row.startedAt).sort()[0],
        completedAt,
        developmentCandidates: candidates,
        developmentControls: controls,
        selectedCandidateId: null,
        candidateDisposition: "rejected-by-development-screen",
        historicalDevelopmentGatesPassed: false,
        allHistoricalScreenGatesPassed: false,
        prospectiveSessions: 0,
        parallelExecution,
        nextStep:
          "Preserve the rejection; do not change V11 production or reuse inspected Nasdaq windows as holdouts.",
        limitations: r20Limitations(),
      };
  await persistPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R20_STORE, report);
  return report;
}

function r25BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_NASDAQ_RUNNER_R25_REPORT_VERSION,
    researchGeneration: "R25-R29",
    productionCandidateVersion: "V25-research-only",
    status,
    experiment: "Parallel concentrated Nasdaq runner-retention research",
    frozenDate: POINT_IN_TIME_NASDAQ_RUNNER_R25_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_NASDAQ_RUNNER_R25_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R25_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeNasdaqR25Context() {
  const [manifest, integrity, datasetStatus, universe, r20] = await Promise.all([
    readExactPrivateJson(POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE),
    getPointInTimeNasdaqPriceIntegrity(),
    getPointInTimeNasdaqDatasetStatus(),
    getPointInTimeNasdaqUniverse(),
    getPointInTimeNasdaqRunnerR20(),
  ]);
  assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe);
  if (
    integrity?.status !== "complete" ||
    integrity?.assessment?.allDataGatesPassed !== true ||
    integrity?.datasetFingerprint !== manifest.evidenceDatasetFingerprint
  )
    throw new Error(
      "R25-R29 are blocked until exact member-date Nasdaq price integrity passes",
    );
  if (
    r20?.status !== "complete" ||
    r20?.candidateDisposition !== "rejected-by-development-screen"
  )
    throw new Error("R25-R29 require the preserved terminal R20-R24 rejection");
  const definitions = pointInTimeNasdaqConcentratedRunnerDefinitions();
  const controls = pointInTimeNasdaqConcentratedRunnerControls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const experimentFingerprint = sha256Fingerprint(
    JSON.stringify({
      datasetFingerprint: manifest.evidenceDatasetFingerprint,
      candidateSetFingerprint,
      executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R25_EXECUTION_CONTRACT,
      executionCommit,
      developmentWindows: POINT_IN_TIME_SP500_ALPHA_WINDOWS.development,
    }),
  );
  return {
    manifest,
    integrity,
    datasetStatus,
    universe,
    calendar: asArray(manifest.sessionDates).map(String),
    datasetThrough: asArray(manifest.sessionDates).at(-1) || null,
    datasetFingerprint: manifest.evidenceDatasetFingerprint,
    definitions,
    controls,
    workUnits,
    definitionsById: new Map(workUnits.map((row) => [row.id, row])),
    candidateSetFingerprint,
    executionCommit,
    experimentFingerprint,
    developmentWindows: POINT_IN_TIME_SP500_ALPHA_WINDOWS.development,
  };
}

function r25WorkerStorePath(context, candidateId) {
  if (!context.definitionsById.has(candidateId))
    throw new Error(`Unknown R25-R29 work unit: ${candidateId}`);
  return `${POINT_IN_TIME_NASDAQ_RUNNER_R25_WORKER_PREFIX}/${context.experimentFingerprint}/development/${candidateId}.json`;
}

export async function runPointInTimeNasdaqConcentratedRunnerWorker({
  candidateId,
} = {}) {
  const context = await pointInTimeNasdaqR25Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R25-R29 work unit: ${id}`);
  const pathname = r25WorkerStorePath(context, id);
  const definitionFingerprint = r15DefinitionFingerprint(definition);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (
    existing?.status === "complete" &&
    existing?.experimentFingerprint === context.experimentFingerprint &&
    existing?.definitionFingerprint === definitionFingerprint
  )
    return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, {
    ...r25BaseReport(context, "running"),
    candidateId: id,
    definitionFingerprint,
    startedAt,
    updatedAt: startedAt,
  });
  try {
    const [evaluation] = await evaluatePointInTimeNasdaqRunnerDefinitions(
      context,
      [definition],
      context.developmentWindows,
    );
    const result = r15CandidateRow(evaluation, 15);
    const report = {
      ...r25BaseReport(context, "complete"),
      candidateId: id,
      definitionFingerprint,
      control: definition.control === true,
      startedAt,
      completedAt: new Date().toISOString(),
      result,
    };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = {
      ...r25BaseReport(context, "failed"),
      candidateId: id,
      definitionFingerprint,
      startedAt,
      failedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

export async function finalizePointInTimeNasdaqConcentratedRunnerDevelopment() {
  const context = await pointInTimeNasdaqR25Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(
      r25WorkerStorePath(context, definition.id),
    );
    const fingerprint = r15DefinitionFingerprint(definition);
    if (
      worker?.status !== "complete" ||
      worker?.experimentFingerprint !== context.experimentFingerprint ||
      worker?.definitionFingerprint !== fingerprint ||
      worker?.result?.definitionFingerprint !== fingerprint
    )
      throw new Error(`R25-R29 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports
    .filter((row) => row.control !== true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const controls = workerReports
    .filter((row) => row.control === true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const finalist = candidates.find((row) => row.clearsPhase) || null;
  const intervals = workerReports.map((row) => ({
    candidateId: row.candidateId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
  const timestamps = intervals.flatMap((row) => [
    new Date(row.startedAt).getTime(),
    new Date(row.completedAt).getTime(),
  ]);
  const completedAt = new Date().toISOString();
  const report = {
    ...r25BaseReport(context, "complete"),
    startedAt: intervals.map((row) => row.startedAt).sort()[0],
    completedAt,
    developmentCandidates: candidates,
    developmentControls: controls,
    selectedCandidateId: finalist?.id || null,
    selectedDefinitionFingerprint: finalist?.definitionFingerprint || null,
    candidateDisposition: finalist
      ? "frozen-for-prospective-tracking-only"
      : "rejected-by-development-screen",
    historicalDevelopmentGatesPassed: Boolean(finalist),
    allHistoricalScreenGatesPassed: false,
    prospectiveSessions: 0,
    parallelExecution: {
      workerCount: intervals.length,
      workers: intervals,
      peakConcurrentWorkers: peakConcurrentIntervals(intervals),
      elapsedSeconds:
        timestamps.every(Number.isFinite) && timestamps.length
          ? roundMetric(
              (Math.max(...timestamps) - Math.min(...timestamps)) / 1_000,
              3,
            )
          : null,
    },
    nextStep: finalist
      ? "Freeze the sole development survivor for genuinely new-session tracking; do not promote from inspected history."
      : "Preserve the rejection and do not change V11 production.",
    limitations: [
      "Every stored session through 2026-09-01 has already been inspected and is development evidence only.",
      "One-to-three-name portfolios intentionally test concentration, but the unchanged 25% drawdown gate and trade-concentration controls still apply.",
      "A historical survivor cannot use previously inspected Nasdaq windows as validation and remains ineligible for live capital.",
      "A strict 1,000-seed maximum-statistic placebo and at least 60 genuinely new sessions remain mandatory.",
    ],
  };
  await persistPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R25_STORE, report);
  return report;
}

function r30BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_NASDAQ_RUNNER_R30_REPORT_VERSION,
    researchGeneration: "R30-R34",
    productionCandidateVersion: "V30-research-only",
    status,
    experiment: "Parallel continuous-lifecycle Nasdaq runner risk research",
    frozenDate: POINT_IN_TIME_NASDAQ_RUNNER_R30_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_NASDAQ_RUNNER_R30_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R30_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    continuousLifecycle: true,
    reportingFoldResets: false,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeNasdaqR30Context() {
  const [manifest, integrity, datasetStatus, universe, r25] =
    await Promise.all([
      readExactPrivateJson(POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE),
      getPointInTimeNasdaqPriceIntegrity(),
      getPointInTimeNasdaqDatasetStatus(),
      getPointInTimeNasdaqUniverse(),
      getPointInTimeNasdaqConcentratedRunnerR25(),
    ]);
  assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe);
  if (
    integrity?.status !== "complete" ||
    integrity?.assessment?.allDataGatesPassed !== true ||
    integrity?.datasetFingerprint !== manifest.evidenceDatasetFingerprint
  )
    throw new Error(
      "R30-R34 are blocked until exact member-date Nasdaq price integrity passes",
    );
  if (
    r25?.status !== "complete" ||
    r25?.candidateDisposition !== "rejected-by-development-screen"
  )
    throw new Error("R30-R34 require the preserved terminal R25-R29 rejection");
  const definitions = pointInTimeNasdaqContinuousRunnerDefinitions();
  const controls = pointInTimeNasdaqContinuousRunnerControls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const developmentWindows = POINT_IN_TIME_SP500_ALPHA_WINDOWS.development;
  const experimentFingerprint = sha256Fingerprint(
    JSON.stringify({
      datasetFingerprint: manifest.evidenceDatasetFingerprint,
      candidateSetFingerprint,
      executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R30_EXECUTION_CONTRACT,
      executionCommit,
      developmentWindows,
      reportingFoldResets: false,
    }),
  );
  return {
    manifest,
    integrity,
    datasetStatus,
    universe,
    calendar: asArray(manifest.sessionDates).map(String),
    datasetThrough: asArray(manifest.sessionDates).at(-1) || null,
    datasetFingerprint: manifest.evidenceDatasetFingerprint,
    definitions,
    controls,
    workUnits,
    definitionsById: new Map(workUnits.map((row) => [row.id, row])),
    candidateSetFingerprint,
    executionCommit,
    experimentFingerprint,
    developmentWindows,
  };
}

function r30WorkerStorePath(context, candidateId) {
  if (!context.definitionsById.has(candidateId))
    throw new Error(`Unknown R30-R34 work unit: ${candidateId}`);
  return `${POINT_IN_TIME_NASDAQ_RUNNER_R30_WORKER_PREFIX}/${context.experimentFingerprint}/development/${candidateId}.json`;
}

export async function runPointInTimeNasdaqContinuousRunnerWorker({
  candidateId,
} = {}) {
  const context = await pointInTimeNasdaqR30Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R30-R34 work unit: ${id}`);
  const pathname = r30WorkerStorePath(context, id);
  const definitionFingerprint = r15DefinitionFingerprint(definition);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (
    existing?.status === "complete" &&
    existing?.experimentFingerprint === context.experimentFingerprint &&
    existing?.definitionFingerprint === definitionFingerprint
  )
    return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, {
    ...r30BaseReport(context, "running"),
    candidateId: id,
    definitionFingerprint,
    startedAt,
    updatedAt: startedAt,
  });
  try {
    const [evaluation] =
      await evaluatePointInTimeNasdaqContinuousRunnerDefinitions(
        context,
        [definition],
        context.developmentWindows,
      );
    const result = r15CandidateRow(evaluation, 15);
    const report = {
      ...r30BaseReport(context, "complete"),
      candidateId: id,
      definitionFingerprint,
      control: definition.control === true,
      startedAt,
      completedAt: new Date().toISOString(),
      result,
    };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = {
      ...r30BaseReport(context, "failed"),
      candidateId: id,
      definitionFingerprint,
      startedAt,
      failedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

export async function finalizePointInTimeNasdaqContinuousRunnerDevelopment() {
  const context = await pointInTimeNasdaqR30Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(
      r30WorkerStorePath(context, definition.id),
    );
    const fingerprint = r15DefinitionFingerprint(definition);
    if (
      worker?.status !== "complete" ||
      worker?.experimentFingerprint !== context.experimentFingerprint ||
      worker?.definitionFingerprint !== fingerprint ||
      worker?.result?.definitionFingerprint !== fingerprint
    )
      throw new Error(`R30-R34 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports
    .filter((row) => row.control !== true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const controls = workerReports
    .filter((row) => row.control === true)
    .map((row) => row.result)
    .sort(r14SelectionComparator);
  const finalist = candidates.find((row) => row.clearsPhase) || null;
  const intervals = workerReports.map((row) => ({
    candidateId: row.candidateId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
  const timestamps = intervals.flatMap((row) => [
    new Date(row.startedAt).getTime(),
    new Date(row.completedAt).getTime(),
  ]);
  const report = {
    ...r30BaseReport(context, "complete"),
    startedAt: intervals.map((row) => row.startedAt).sort()[0],
    completedAt: new Date().toISOString(),
    developmentCandidates: candidates,
    developmentControls: controls,
    selectedCandidateId: finalist?.id || null,
    selectedDefinitionFingerprint: finalist?.definitionFingerprint || null,
    candidateDisposition: finalist
      ? "frozen-for-prospective-tracking-only"
      : "rejected-by-development-screen",
    historicalDevelopmentGatesPassed: Boolean(finalist),
    allHistoricalScreenGatesPassed: false,
    prospectiveSessions: 0,
    parallelExecution: {
      workerCount: intervals.length,
      workers: intervals,
      peakConcurrentWorkers: peakConcurrentIntervals(intervals),
      elapsedSeconds:
        timestamps.every(Number.isFinite) && timestamps.length
          ? roundMetric(
              (Math.max(...timestamps) - Math.min(...timestamps)) / 1_000,
              3,
            )
          : null,
    },
    nextStep: finalist
      ? "Freeze the sole survivor for genuinely new-session tracking and the strict placebo; do not promote from inspected history."
      : "Preserve the rejection and do not change V11 production.",
    limitations: [
      "Every stored session through 2026-09-01 is inspected development evidence and cannot establish prospective alpha.",
      "Continuous lifecycle removes artificial fold liquidation, but fold returns, drawdowns, and benchmark comparisons remain independently attributed.",
      "One-to-three-name concentration can create unstable outcomes; the 25% drawdown and 15-round-trip gates remain unchanged.",
      "A strict 1,000-seed maximum-statistic placebo and at least 60 genuinely new sessions remain mandatory before live authority.",
    ],
  };
  await persistPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R30_STORE, report);
  return report;
}

function r35BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_NASDAQ_RUNNER_R35_REPORT_VERSION,
    researchGeneration: "R35-R39",
    productionCandidateVersion: "V35-research-only",
    status,
    experiment: "Parallel breadth-adaptive Nasdaq runner research",
    frozenDate: POINT_IN_TIME_NASDAQ_RUNNER_R35_FROZEN_DATE,
    earliestProspectiveSession: POINT_IN_TIME_NASDAQ_RUNNER_R35_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R35_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    continuousLifecycle: true,
    reportingFoldResets: false,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeNasdaqR35Context() {
  const [manifest, integrity, datasetStatus, universe, r30] = await Promise.all([
    readExactPrivateJson(POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE),
    getPointInTimeNasdaqPriceIntegrity(),
    getPointInTimeNasdaqDatasetStatus(),
    getPointInTimeNasdaqUniverse(),
    getPointInTimeNasdaqContinuousRunnerR30(),
  ]);
  assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe);
  if (
    integrity?.status !== "complete" ||
    integrity?.assessment?.allDataGatesPassed !== true ||
    integrity?.datasetFingerprint !== manifest.evidenceDatasetFingerprint
  )
    throw new Error("R35-R39 require complete exact member-date Nasdaq price integrity");
  if (r30?.status !== "complete" || r30?.candidateDisposition !== "rejected-by-development-screen")
    throw new Error("R35-R39 require the preserved terminal R30-R34 rejection");
  const definitions = pointInTimeNasdaqAdaptiveRunnerDefinitions();
  const controls = pointInTimeNasdaqAdaptiveRunnerControls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const developmentWindows = POINT_IN_TIME_SP500_ALPHA_WINDOWS.development;
  const experimentFingerprint = sha256Fingerprint(JSON.stringify({
    datasetFingerprint: manifest.evidenceDatasetFingerprint,
    candidateSetFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R35_EXECUTION_CONTRACT,
    executionCommit,
    developmentWindows,
    reportingFoldResets: false,
  }));
  return {
    manifest, integrity, datasetStatus, universe,
    calendar: asArray(manifest.sessionDates).map(String),
    datasetThrough: asArray(manifest.sessionDates).at(-1) || null,
    datasetFingerprint: manifest.evidenceDatasetFingerprint,
    definitions, controls, workUnits,
    definitionsById: new Map(workUnits.map((row) => [row.id, row])),
    candidateSetFingerprint, executionCommit, experimentFingerprint,
    developmentWindows,
  };
}

function r35WorkerStorePath(context, candidateId) {
  if (!context.definitionsById.has(candidateId)) throw new Error(`Unknown R35-R39 work unit: ${candidateId}`);
  return `${POINT_IN_TIME_NASDAQ_RUNNER_R35_WORKER_PREFIX}/${context.experimentFingerprint}/development/${candidateId}.json`;
}

export async function runPointInTimeNasdaqAdaptiveRunnerWorker({ candidateId } = {}) {
  const context = await pointInTimeNasdaqR35Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R35-R39 work unit: ${id}`);
  const pathname = r35WorkerStorePath(context, id);
  const definitionFingerprint = r15DefinitionFingerprint(definition);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (existing?.status === "complete" && existing?.experimentFingerprint === context.experimentFingerprint && existing?.definitionFingerprint === definitionFingerprint)
    return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, { ...r35BaseReport(context, "running"), candidateId: id, definitionFingerprint, startedAt, updatedAt: startedAt });
  try {
    const [evaluation] = await evaluatePointInTimeNasdaqContinuousRunnerDefinitions(context, [definition], context.developmentWindows);
    const result = r15CandidateRow(evaluation, 15);
    const report = { ...r35BaseReport(context, "complete"), candidateId: id, definitionFingerprint, control: definition.control === true, startedAt, completedAt: new Date().toISOString(), result };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = { ...r35BaseReport(context, "failed"), candidateId: id, definitionFingerprint, startedAt, failedAt: new Date().toISOString(), error: sanitizedError(error) };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

export async function finalizePointInTimeNasdaqAdaptiveRunnerDevelopment() {
  const context = await pointInTimeNasdaqR35Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(r35WorkerStorePath(context, definition.id));
    const fingerprint = r15DefinitionFingerprint(definition);
    if (worker?.status !== "complete" || worker?.experimentFingerprint !== context.experimentFingerprint || worker?.definitionFingerprint !== fingerprint || worker?.result?.definitionFingerprint !== fingerprint)
      throw new Error(`R35-R39 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports.filter((row) => row.control !== true).map((row) => row.result).sort(r14SelectionComparator);
  const controls = workerReports.filter((row) => row.control === true).map((row) => row.result).sort(r14SelectionComparator);
  const finalist = candidates.find((row) => row.clearsPhase) || null;
  const intervals = workerReports.map((row) => ({ candidateId: row.candidateId, startedAt: row.startedAt, completedAt: row.completedAt }));
  const timestamps = intervals.flatMap((row) => [new Date(row.startedAt).getTime(), new Date(row.completedAt).getTime()]);
  const report = {
    ...r35BaseReport(context, "complete"),
    startedAt: intervals.map((row) => row.startedAt).sort()[0],
    completedAt: new Date().toISOString(),
    developmentCandidates: candidates,
    developmentControls: controls,
    selectedCandidateId: finalist?.id || null,
    selectedDefinitionFingerprint: finalist?.definitionFingerprint || null,
    candidateDisposition: finalist ? "frozen-for-prospective-tracking-only" : "rejected-by-development-screen",
    historicalDevelopmentGatesPassed: Boolean(finalist),
    allHistoricalScreenGatesPassed: false,
    prospectiveSessions: 0,
    parallelExecution: {
      workerCount: intervals.length,
      workers: intervals,
      peakConcurrentWorkers: peakConcurrentIntervals(intervals),
      elapsedSeconds: timestamps.every(Number.isFinite) && timestamps.length ? roundMetric((Math.max(...timestamps) - Math.min(...timestamps)) / 1_000, 3) : null,
    },
    nextStep: finalist ? "Freeze the sole survivor for the strict placebo and genuinely new-session tracking; do not promote from inspected history." : "Preserve the rejection and do not change V11 production.",
    limitations: [
      "Every stored session through 2026-09-01 is inspected development evidence and cannot establish prospective alpha.",
      "Breadth adaptation uses only contemporaneous cross-sectional observations; folds attribute performance without resetting holdings.",
      "Concentration, drawdown, minimum-trade, fold-stability, exposure, SPY, and QQQ gates remain unchanged.",
      "A strict 1,000-seed maximum-statistic placebo and at least 60 genuinely new sessions remain mandatory before live authority.",
    ],
  };
  await persistPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R35_STORE, report);
  return report;
}

function r40BaseReport(context, status) {
  return {
    version: POINT_IN_TIME_NASDAQ_RUNNER_R40_REPORT_VERSION,
    researchGeneration: "R40-R44",
    productionCandidateVersion: "V40-research-only",
    status,
    experiment: "Parallel adaptive Nasdaq rank-replacement research",
    frozenDate: POINT_IN_TIME_NASDAQ_RUNNER_R40_FROZEN_DATE,
    earliestProspectiveSession: POINT_IN_TIME_NASDAQ_RUNNER_R40_PROSPECTIVE_START,
    datasetFingerprint: context.datasetFingerprint,
    candidateSetFingerprint: context.candidateSetFingerprint,
    experimentFingerprint: context.experimentFingerprint,
    executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R40_EXECUTION_CONTRACT,
    executionCommit: context.executionCommit,
    datasetThrough: context.datasetThrough,
    candidateSetFrozenBeforeExecution: true,
    candidateCount: context.definitions.length,
    controlCount: context.controls.length,
    parallelWorkerCount: context.workUnits.length,
    continuousLifecycle: true,
    reportingFoldResets: false,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    allEvidenceGatesPassed: false,
  };
}

async function pointInTimeNasdaqR40Context() {
  const [manifest, integrity, datasetStatus, universe, r35] = await Promise.all([
    readExactPrivateJson(POINT_IN_TIME_NASDAQ_COMPILED_CHECKPOINT_STORE), getPointInTimeNasdaqPriceIntegrity(), getPointInTimeNasdaqDatasetStatus(), getPointInTimeNasdaqUniverse(), getPointInTimeNasdaqAdaptiveRunnerR35(),
  ]);
  assertCurrentPointInTimeNasdaqEvidence(manifest, datasetStatus, universe);
  if (integrity?.status !== "complete" || integrity?.assessment?.allDataGatesPassed !== true || integrity?.datasetFingerprint !== manifest.evidenceDatasetFingerprint) throw new Error("R40-R44 require complete exact member-date Nasdaq price integrity");
  if (r35?.status !== "complete" || r35?.candidateDisposition !== "rejected-by-development-screen") throw new Error("R40-R44 require the preserved terminal R35-R39 result");
  const definitions = pointInTimeNasdaqAdaptiveReplacementDefinitions();
  const controls = pointInTimeNasdaqAdaptiveReplacementControls();
  const workUnits = [...definitions, ...controls];
  const candidateSetFingerprint = sha256Fingerprint(JSON.stringify(workUnits));
  const executionCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local";
  const developmentWindows = POINT_IN_TIME_SP500_ALPHA_WINDOWS.development;
  const experimentFingerprint = sha256Fingerprint(JSON.stringify({ datasetFingerprint: manifest.evidenceDatasetFingerprint, candidateSetFingerprint, executionContract: POINT_IN_TIME_NASDAQ_RUNNER_R40_EXECUTION_CONTRACT, executionCommit, developmentWindows, reportingFoldResets: false }));
  return { manifest, integrity, datasetStatus, universe, calendar: asArray(manifest.sessionDates).map(String), datasetThrough: asArray(manifest.sessionDates).at(-1) || null, datasetFingerprint: manifest.evidenceDatasetFingerprint, definitions, controls, workUnits, definitionsById: new Map(workUnits.map((row) => [row.id, row])), candidateSetFingerprint, executionCommit, experimentFingerprint, developmentWindows };
}

function r40WorkerStorePath(context, id) {
  if (!context.definitionsById.has(id)) throw new Error(`Unknown R40-R44 work unit: ${id}`);
  return `${POINT_IN_TIME_NASDAQ_RUNNER_R40_WORKER_PREFIX}/${context.experimentFingerprint}/development/${id}.json`;
}

export async function runPointInTimeNasdaqAdaptiveReplacementWorker({ candidateId } = {}) {
  const context = await pointInTimeNasdaqR40Context();
  const id = String(candidateId || "");
  const definition = context.definitionsById.get(id);
  if (!definition) throw new Error(`Unknown R40-R44 work unit: ${id}`);
  const pathname = r40WorkerStorePath(context, id);
  const definitionFingerprint = r15DefinitionFingerprint(definition);
  const existing = await readExactPrivateJson(pathname).catch(() => null);
  if (existing?.status === "complete" && existing?.experimentFingerprint === context.experimentFingerprint && existing?.definitionFingerprint === definitionFingerprint) return { ...existing, cached: true };
  const startedAt = new Date().toISOString();
  await persistPrivateJson(pathname, { ...r40BaseReport(context, "running"), candidateId: id, definitionFingerprint, startedAt, updatedAt: startedAt });
  try {
    const [evaluation] = await evaluatePointInTimeNasdaqContinuousRunnerDefinitions(context, [definition], context.developmentWindows);
    const result = r15CandidateRow(evaluation, 15);
    const report = { ...r40BaseReport(context, "complete"), candidateId: id, definitionFingerprint, control: definition.control === true, startedAt, completedAt: new Date().toISOString(), result };
    await persistPrivateJson(pathname, report);
    return report;
  } catch (error) {
    const failed = { ...r40BaseReport(context, "failed"), candidateId: id, definitionFingerprint, startedAt, failedAt: new Date().toISOString(), error: sanitizedError(error) };
    await persistPrivateJson(pathname, failed).catch(() => {});
    throw error;
  }
}

export async function finalizePointInTimeNasdaqAdaptiveReplacementDevelopment() {
  const context = await pointInTimeNasdaqR40Context();
  const workerReports = [];
  for (const definition of context.workUnits) {
    const worker = await readExactPrivateJson(r40WorkerStorePath(context, definition.id));
    const fingerprint = r15DefinitionFingerprint(definition);
    if (worker?.status !== "complete" || worker?.experimentFingerprint !== context.experimentFingerprint || worker?.definitionFingerprint !== fingerprint || worker?.result?.definitionFingerprint !== fingerprint) throw new Error(`R40-R44 worker failed integrity: ${definition.id}`);
    workerReports.push(worker);
  }
  const candidates = workerReports.filter((row) => row.control !== true).map((row) => row.result).sort(r14SelectionComparator);
  const controls = workerReports.filter((row) => row.control === true).map((row) => row.result).sort(r14SelectionComparator);
  const finalist = candidates.find((row) => row.clearsPhase) || null;
  const intervals = workerReports.map((row) => ({ candidateId: row.candidateId, startedAt: row.startedAt, completedAt: row.completedAt }));
  const timestamps = intervals.flatMap((row) => [new Date(row.startedAt).getTime(), new Date(row.completedAt).getTime()]);
  const report = {
    ...r40BaseReport(context, "complete"), startedAt: intervals.map((row) => row.startedAt).sort()[0], completedAt: new Date().toISOString(), developmentCandidates: candidates, developmentControls: controls,
    selectedCandidateId: finalist?.id || null, selectedDefinitionFingerprint: finalist?.definitionFingerprint || null,
    candidateDisposition: finalist ? "frozen-for-strict-placebo-and-prospective-tracking-only" : "rejected-by-development-screen",
    historicalDevelopmentGatesPassed: Boolean(finalist), allHistoricalScreenGatesPassed: false, prospectiveSessions: 0,
    parallelExecution: { workerCount: intervals.length, workers: intervals, peakConcurrentWorkers: peakConcurrentIntervals(intervals), elapsedSeconds: timestamps.every(Number.isFinite) && timestamps.length ? roundMetric((Math.max(...timestamps) - Math.min(...timestamps)) / 1_000, 3) : null },
    nextStep: finalist ? "Run the strict 1,000-seed family-wise placebo before any genuinely new-session tracking; do not promote from inspected history." : "Preserve the rejection and do not change V11 production.",
    limitations: ["R40-R44 are explicitly post-R38 inspected-development hypotheses and are not independent validation.", "All folds use continuous positions and causal next-open execution; cash remains cash.", "Every deterministic gate remains unchanged, and a survivor still requires the strict 1,000-seed maximum-statistic placebo.", "At least 60 genuinely new sessions and independent replication remain mandatory before live authority."],
  };
  await persistPrivateJson(POINT_IN_TIME_NASDAQ_RUNNER_R40_STORE, report);
  return report;
}

export async function runPointInTimeSp500AlphaCreatorV2Integrity({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, v2Report] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2(),
  ]);
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The completed point-in-time S&P 500 checkpoint is unavailable",
    );
  if (v2Report?.status !== "complete")
    throw new Error("The frozen V2 result must complete before integrity audit");
  const calendar = asArray(manifest.sessionDates).map(String);
  const datasetFingerprint = stableFingerprint(
    JSON.stringify({
      schema: manifest.schema,
      signature: manifest.signature,
      completedSessions: manifest.completedSessions,
      firstDate: calendar[0] || null,
      lastDate: calendar.at(-1) || null,
      chunks: asArray(manifest.chunks).map((chunk) => [
        chunk.pathname,
        chunk.start,
        chunk.end,
        chunk.compressedBytes,
      ]),
    }),
  );
  const existing = await getPointInTimeSp500AlphaCreatorV2Integrity();
  if (
    !force &&
    existing?.version ===
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    existing?.v2CompletedAt === v2Report.completedAt
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version ===
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION,
    status: "running",
    audit: "Post-result V2 price-integrity and trade-concentration audit",
    datasetFingerprint,
    datasetThrough: calendar.at(-1) || null,
    v2CompletedAt: v2Report.completedAt,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    selectionChanged: false,
    productionChanged: false,
    eligibleForAlphaClaim: false,
  };
  await persistPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
    running,
  );

  try {
    // Build a light membership/eligibility map first. The compiled store also
    // contains archival histories for removed symbols so future replays can
    // construct causal lookbacks; those unused post-removal rows must not make
    // the decision dataset fail integrity.
    const priceRequirements = createPointInTimePriceRequirements({
      lookbackSessions: 253,
    });
    let requirementSessionIndexOffset = 0;
    for (const chunk of asArray(manifest.chunks)) {
      const payload = await readPrivateGzipJson(chunk.pathname);
      const sessions = asArray(payload?.sessions).map(compactReplaySession);
      if (
        sessions.length !== number(chunk.end) - number(chunk.start) ||
        sessions[0]?.date !== chunk.firstDate ||
        sessions.at(-1)?.date !== chunk.lastDate
      )
        throw new Error(
          `Point-in-time compiled chunk is invalid: ${chunk.pathname}`,
        );
      observePointInTimePriceRequirements(
        priceRequirements,
        [{ sessions }],
        { sessionIndexOffset: requirementSessionIndexOffset },
      );
      requirementSessionIndexOffset += sessions.length;
    }
    finishPointInTimePriceRequirements(priceRequirements);
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
      {
        ...running,
        updatedAt: new Date().toISOString(),
        progress: {
          stage: "price-integrity-scan",
          requirementSessions: priceRequirements.totalSessions,
          requiredSymbols: priceRequirements.rangesBySymbol.size,
        },
      },
    );
    const priceAccumulator = createPointInTimePriceIntegrityAccumulator();
    let sessionIndexOffset = 0;
    for (const chunk of asArray(manifest.chunks)) {
      const payload = await readPrivateGzipJson(chunk.pathname);
      const sessions = asArray(payload?.sessions).map(compactReplaySession);
      if (
        sessions.length !== number(chunk.end) - number(chunk.start) ||
        sessions[0]?.date !== chunk.firstDate ||
        sessions.at(-1)?.date !== chunk.lastDate
      )
        throw new Error(
          `Point-in-time compiled chunk is invalid: ${chunk.pathname}`,
        );
      scanPointInTimePriceDataset(
        priceAccumulator,
        { sessions },
        { requirements: priceRequirements, sessionIndexOffset },
      );
      sessionIndexOffset += sessions.length;
    }
    const priceIntegrity = finishPointInTimePriceIntegrityAudit(
      priceAccumulator,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
      {
        ...running,
        updatedAt: new Date().toISOString(),
        progress: {
          stage: "selected-v2-concentration",
          completedPriceSessions: priceIntegrity.sessions,
          adjustedPriceIntegrityPass: priceIntegrity.pass,
        },
        priceIntegrity,
      },
    );

    const { primary } = pointInTimeSp500AlphaV2Definitions();
    const runsByPhase = Object.fromEntries(
      Object.keys(POINT_IN_TIME_SP500_ALPHA_V2_WINDOWS).map((phase) => [
        phase,
        [],
      ]),
    );
    for (const [phase, windows] of Object.entries(
      POINT_IN_TIME_SP500_ALPHA_V2_WINDOWS,
    )) {
      for (const window of windows) {
        const dataset = await restorePointInTimeSp500Window(
          manifest,
          calendar,
          window,
        );
        const run = simulatePointInTimePortfolio(
          dataset,
          simulationOptions({
            ...primary.overrides,
            thesisId: `pit-sp500-alpha-integrity-${primary.id}`,
            thesisLabel: primary.label,
            startDate: window.start,
            endDate: window.end,
          }),
        );
        assertCompleteResearchWindow(
          run,
          calendar,
          window,
          `${primary.label} integrity ${window.start}`,
        );
        runsByPhase[phase].push(run);
      }
    }
    const selectedConcentration = {
      id: primary.id,
      label: primary.label,
      phases: Object.fromEntries(
        Object.entries(runsByPhase).map(([phase, runs]) => [
          phase,
          summarizePointInTimeTradeConcentration(runs),
        ]),
      ),
    };
    const auditConcentrationWarning = Boolean(
      selectedConcentration?.phases?.historicalAudit?.concentrationWarning,
    );
    const completedAt = new Date().toISOString();
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION,
      status: "complete",
      audit: "Post-result V2 price-integrity and trade-concentration audit",
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough: calendar.at(-1) || null,
      v2CompletedAt: v2Report.completedAt,
      v2Disposition: v2Report.candidateDisposition,
      postResultDiagnosticOnly: true,
      candidateSelectionUsed: false,
      selectionChanged: false,
      priceIntegrity,
      selectedCandidateId: primary.id,
      selectedTradeConcentration: selectedConcentration,
      controlTradeConcentration: [],
      assessment: {
        adjustedPriceIntegrityPass: priceIntegrity.pass,
        historicalAuditConcentrationWarning: auditConcentrationWarning,
        v2RejectionUnchanged: true,
        safeToDefineDistinctNextHypothesis:
          priceIntegrity.pass && !auditConcentrationWarning,
      },
      allEvidenceGatesPassed: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      productionChanged: false,
      limitations: [
        "This audit was specified after the V2 outcome was known and may diagnose data quality or concentration only; it cannot rescue, select or promote V2.",
        "Large one-session moves are disclosed rather than automatically labelled errors; a split-like failure requires both open and close to preserve a common split ratio with ordinary intraday movement.",
        "Stored rows outside every active-membership interval and its 253-session signal lookback are archival and excluded from the decision-data pass/fail result.",
        "Identical full OHLCV rows across simultaneously active symbols fail closed as a possible ticker-identity collision.",
        "Trade concentration is measured from simulated round-trip P&L across independently reset windows and is descriptive, not new evidence.",
        "Control portfolios are not re-simulated for this diagnostic because their concentration cannot change the V2 rejection or the data-integrity decision; only the selected V2 portfolio is re-simulated.",
      ],
      nextStep: !priceIntegrity.pass
        ? "Quarantine the affected research data and repair the price contract before defining another thesis."
        : auditConcentrationWarning
          ? "Keep V2 rejected and audit the identified outlier dependence before defining another thesis."
          : "Keep V2 rejected and predeclare an economically distinct V3 for contaminated-development falsification only.",
    };
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
      report,
    );
    return report;
  } catch (error) {
    const failed = {
      ...running,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: sanitizedError(error),
    };
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE,
      failed,
    ).catch(() => {});
    throw error;
  }
}

export async function runFmpResearchBacktest({
  force = false,
  now = Date.now(),
  minimumDatasetThrough = null,
} = {}) {
  const existing = await readReport().catch(() => null);
  const existingTime = new Date(
    existing?.completedAt || existing?.startedAt || 0,
  ).getTime();
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || existing?.startedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === REPORT_VERSION &&
    existing?.runnerSchema === REPLAY_CHECKPOINT_SCHEMA &&
    existing?.status === "complete" &&
    Number.isFinite(existingTime) &&
    now - existingTime < DEFAULT_MAX_AGE_MS &&
    (!minimumDatasetThrough ||
      String(existing?.universe?.toDate || "") >= minimumDatasetThrough)
  )
    return { ...existing, cached: true };
  if (
    !force &&
    existing?.status === "running" &&
    existing?.runnerSchema === REPLAY_CHECKPOINT_SCHEMA &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY is required for research replay");
  const startedAt =
    existing?.version === REPORT_VERSION &&
    ["running", "collecting"].includes(existing?.status) &&
    existing?.startedAt
      ? existing.startedAt
      : new Date(now).toISOString();
  const running = {
    version: REPORT_VERSION,
    runnerSchema: REPLAY_CHECKPOINT_SCHEMA,
    status: "running",
    claimStatus: "provisional-post-selection-development-diagnostic",
    eligibleForCapitalClaims: false,
    startedAt,
    runClaimedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    message:
      "FMP history acquisition and chronological replay are in progress.",
  };
  await persistReport(running);
  const client = createFmpClient(apiKey);

  try {
    const discovery = await getFullMarketDiscovery({ refreshIfStale: false });
    if (!Array.isArray(discovery?.candidates) || !discovery.candidates.length)
      throw new Error("A completed full-market discovery snapshot is required");
    const symbolLimit = boundedInteger(
      process.env.FMP_RESEARCH_SYMBOL_LIMIT,
      DEFAULT_SYMBOL_LIMIT,
      50,
      MAX_SYMBOL_LIMIT,
    );
    const researchSource = Array.isArray(discovery.researchUniverse)
      ? discovery.researchUniverse
      : discovery.candidates;
    let selected = selectResearchUniverse(researchSource, symbolLimit);
    const endDate =
      latestCompletedMarketSessionDay(new Date(now)) || isoDay(now);
    const fromDate = isoDay(Date.UTC(new Date(now).getUTCFullYear() - 4, 0, 1));
    const savedPrices = await readPrivateJson(
      FMP_RESEARCH_PRICE_CHECKPOINT_STORE,
    ).catch(() => null);
    const savedPriceSignature = parseSignature(savedPrices?.signature);
    if (minimumDatasetThrough && existing?.status === "complete") {
      const frozenSymbols = asArray(savedPriceSignature?.symbols).filter(
        (symbol) => !["SPY", "QQQ"].includes(symbol),
      );
      const sourceBySymbol = new Map(
        asArray(researchSource).map((row) => [symbolOf(row), row]),
      );
      const frozenSelection = frozenSymbols
        .map((symbol) => sourceBySymbol.get(symbol))
        .filter(Boolean);
      if (
        frozenSymbols.length &&
        frozenSelection.length !== frozenSymbols.length
      )
        throw new Error(
          `The frozen research cohort cannot be reconstructed (${frozenSelection.length}/${frozenSymbols.length})`,
        );
      if (frozenSelection.length) selected = frozenSelection;
    }
    const symbols = [...new Set(selected.map((row) => row.symbol))];
    const priceSymbols = [...symbols, "SPY", "QQQ"];
    const savedPriceContract = PRICE_HISTORY_CONTRACTS.find(
      (contract) => contract.id === savedPriceSignature?.priceContract,
    );
    const cachedBenchmarkBars = asArray(savedPrices?.histories?.SPY);
    const cachedPriceContractUsable = Boolean(
      savedPriceContract &&
      equivalentAcquisitionSignature(
        savedPrices?.signature,
        JSON.stringify({
          schema: PRICE_ACQUISITION_SCHEMA,
          fromDate,
          endDate,
          priceContract: savedPriceContract.id,
          symbols: priceSymbols.slice().sort(),
        }),
      ) &&
      cachedBenchmarkBars.length >= 500 &&
      cachedBenchmarkBars.every((bar) => bar.adjusted === true),
    );
    const priceContractResult = cachedPriceContractUsable
      ? {
          contract: savedPriceContract,
          benchmarkBars: cachedBenchmarkBars,
          failures: [],
          checkpointReused: true,
        }
      : await resolvePriceHistoryContract(client, fromDate, endDate);
    const priceContract = priceContractResult.contract;
    const acquisitionSignature = JSON.stringify({
      schema: PRICE_ACQUISITION_SCHEMA,
      fromDate,
      endDate,
      priceContract: priceContract.id,
      symbols: priceSymbols.slice().sort(),
    });
    const appendPrices = appendCompatibleAcquisitionSignature(
      savedPrices?.signature,
      acquisitionSignature,
    );
    const savedInitialPrices =
      savedPrices?.signature === acquisitionSignature ||
      equivalentAcquisitionSignature(
        savedPrices?.signature,
        acquisitionSignature,
      )
        ? savedPrices
        : appendPrices
          ? {
              ...savedPrices,
              // Keep the old histories available while every symbol is
              // refreshed through the newly completed market session.
              completedSymbols: [],
              exhaustedSymbols: [],
            }
          : null;
    const initialPrices = {
      ...(savedInitialPrices || {}),
      histories: {
        ...(savedInitialPrices?.histories || {}),
        // Contract resolution fetches SPY through the requested end date. It
        // must win over an older checkpoint copy during an append refresh.
        SPY: priceContractResult.benchmarkBars,
      },
      completedSymbols: [
        ...new Set([
          "SPY",
          ...asArray(savedInitialPrices?.completedSymbols).map(symbolOf),
        ]),
      ],
      exhaustedSymbols: asArray(savedInitialPrices?.exhaustedSymbols)
        .map(symbolOf)
        .filter((symbol) => symbol !== "SPY"),
    };
    const priceHistory = await fetchPriceHistory(
      client,
      priceContract,
      priceSymbols,
      fromDate,
      endDate,
      {
        initial: initialPrices,
        onCheckpoint: (checkpoint) =>
          persistPrivateJson(FMP_RESEARCH_PRICE_CHECKPOINT_STORE, {
            version: PRICE_ACQUISITION_SCHEMA,
            signature: acquisitionSignature,
            completedAt: new Date().toISOString(),
            ...checkpoint,
          }),
      },
    );
    const histories = new Map(Object.entries(priceHistory.histories || {}));
    const priceFailures = asArray(priceHistory.priceFailures);
    if (priceHistory.remainingSymbols.length) {
      const collecting = {
        version: REPORT_VERSION,
        status: "collecting",
        claimStatus: "no-result",
        eligibleForCapitalClaims: false,
        startedAt,
        updatedAt: new Date().toISOString(),
        message:
          "Dividend-adjusted historical prices are being acquired in bounded, resumable batches.",
        progress: {
          stage: "prices",
          completedSymbols: priceHistory.completedSymbols.length,
          exhaustedSymbols: priceHistory.exhaustedSymbols.length,
          processedSymbols:
            priceHistory.completedSymbols.length +
            priceHistory.exhaustedSymbols.length,
          totalSymbols: priceSymbols.length,
          remainingSymbols: priceHistory.remainingSymbols.length,
          failures: priceFailures.length,
        },
        priceContract: {
          id: priceContract.id,
          path: priceContract.path,
          adjustmentMethod: priceContract.adjustmentMethod,
          checkpointReused: priceContractResult.checkpointReused === true,
          fallbackUsed: priceContract.path !== PRICE_HISTORY_SOURCE,
          preflightFailures: priceContractResult.failures,
        },
        failureSample: priceFailures.slice(0, 5),
        provider: client.stats(),
      };
      await persistReport(collecting);
      return collecting;
    }
    if (!histories.has("SPY") || !histories.has("QQQ"))
      throw new Error("SPY and QQQ benchmark histories are required");
    const usableSymbols = symbols.filter(
      (symbol) => (histories.get(symbol) || []).length >= 500,
    );
    if (usableSymbols.length < Math.min(50, Math.floor(symbols.length * 0.7)))
      throw new Error(
        `Historical price coverage is insufficient (${usableSymbols.length}/${symbols.length})`,
      );
    const statementSignature = JSON.stringify({
      acquisitionSignature,
      symbols: usableSymbols.slice().sort(),
      source: "stable-per-symbol-quarterly-v1",
    });
    const savedStatements = await readPrivateJson(
      FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE,
    ).catch(() => null);
    const initialStatements =
      savedStatements?.signature === statementSignature ||
      equivalentStatementSignature(
        savedStatements?.signature,
        statementSignature,
      )
        ? savedStatements
        : appendCompatibleStatementSignature(
              savedStatements?.signature,
              statementSignature,
            )
          ? savedStatements
          : null;
    const statementHistory = await fetchStatementHistory(
      client,
      usableSymbols,
      new Date(fromDate).getUTCFullYear() - 2,
      new Date(endDate).getUTCFullYear(),
      {
        initial: initialStatements,
        onCheckpoint: (checkpoint) =>
          persistPrivateJson(FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE, {
            version: 1,
            signature: statementSignature,
            completedAt: new Date().toISOString(),
            ...checkpoint,
          }),
      },
    );
    if (statementHistory.remainingSymbols.length) {
      const collecting = {
        version: REPORT_VERSION,
        status: "collecting",
        claimStatus: "no-result",
        eligibleForCapitalClaims: false,
        startedAt,
        updatedAt: new Date().toISOString(),
        message:
          "Historical fundamentals are being acquired in bounded, resumable batches.",
        progress: {
          stage: "fundamentals",
          completedSymbols: statementHistory.completedSymbols.length,
          exhaustedSymbols: statementHistory.exhaustedSymbols.length,
          processedSymbols:
            statementHistory.completedSymbols.length +
            statementHistory.exhaustedSymbols.length,
          totalSymbols: usableSymbols.length,
          remainingSymbols: statementHistory.remainingSymbols.length,
          failures: statementHistory.failures.length,
        },
        failureSample: statementHistory.failures.slice(0, 5),
        provider: client.stats(),
      };
      await persistReport(collecting);
      return collecting;
    }
    const fundamentals = buildHistoricalFundamentalRows(statementHistory);
    const fundamentalSymbols = new Set(
      fundamentals
        .filter((row) => row.fundamentalDataVerified)
        .map((row) => row.symbol),
    );
    const finalSymbols = usableSymbols.filter((symbol) =>
      fundamentalSymbols.has(symbol),
    );
    if (finalSymbols.length < Math.min(40, Math.floor(symbols.length * 0.55)))
      throw new Error(
        `Historical fundamental coverage is insufficient (${finalSymbols.length}/${symbols.length})`,
      );
    const finalSet = new Set(finalSymbols);
    const firstDate = fromDate;
    const profiles = selected
      .filter((row) => finalSet.has(row.symbol))
      .map((row) => ({
        ...row,
        listedAt: histories.get(row.symbol)?.[0]?.date || firstDate,
        delistedAt: null,
        isEtf: false,
        isFund: false,
      }));
    const finalHistories = new Map(
      [...histories].filter(
        ([symbol]) => finalSet.has(symbol) || ["SPY", "QQQ"].includes(symbol),
      ),
    );
    const sessionDates = (finalHistories.get("SPY") || []).map(
      (bar) => bar.date,
    );
    const compiledSignature = JSON.stringify({
      schema: COMPILED_CHECKPOINT_SCHEMA,
      compilerContract:
        "historical-signal-evaluator-v8-full-evidence-research-v1",
      statementSignature,
      finalSymbols: finalSymbols.slice().sort(),
      fromDate,
      endDate,
      rawSessions: sessionDates.length,
      firstRawSession: sessionDates[0] || null,
      lastRawSession: sessionDates.at(-1) || null,
    });
    const savedCompiled = await readPrivateJson(
      FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
    ).catch(() => null);
    const savedChunks = Array.isArray(savedCompiled?.chunks)
      ? savedCompiled.chunks
      : [];
    let expectedChunkStart = 0;
    const chunkManifestValid = savedChunks.every((chunk) => {
      const start = number(chunk?.start, -1);
      const end = number(chunk?.end, -1);
      const valid =
        start === expectedChunkStart &&
        end > start &&
        typeof chunk?.pathname === "string" &&
        chunk.pathname.startsWith(`${FMP_RESEARCH_COMPILED_CHUNK_PREFIX}/`);
      if (valid) expectedChunkStart = end;
      return valid;
    });
    const strictCompiledMatch = Boolean(
      savedCompiled?.schema === COMPILED_CHECKPOINT_SCHEMA &&
      savedCompiled?.signature === compiledSignature &&
      chunkManifestValid &&
      number(savedCompiled?.completedSessions, -1) === expectedChunkStart,
    );
    const savedCompiledSignature = parseSignature(savedCompiled?.signature);
    const nextCompiledSignature = parseSignature(compiledSignature);
    const priorSessionDates = asArray(savedCompiled?.sessionDates);
    const appendCompiledMatch = Boolean(
      savedCompiled?.schema === COMPILED_CHECKPOINT_SCHEMA &&
      savedCompiled?.complete === true &&
      chunkManifestValid &&
      number(savedCompiled?.completedSessions, -1) === expectedChunkStart &&
      expectedChunkStart === priorSessionDates.length &&
      priorSessionDates.length < sessionDates.length &&
      priorSessionDates.every((date, index) => date === sessionDates[index]) &&
      savedCompiledSignature?.compilerContract ===
        nextCompiledSignature?.compilerContract &&
      savedCompiledSignature?.fromDate === nextCompiledSignature?.fromDate &&
      sameStringArray(
        savedCompiledSignature?.finalSymbols,
        nextCompiledSignature?.finalSymbols,
      ) &&
      appendCompatibleStatementSignature(
        savedCompiledSignature?.statementSignature,
        nextCompiledSignature?.statementSignature,
      )
    );
    const savedCompiledMatches = strictCompiledMatch || appendCompiledMatch;
    const compiledCacheHit = Boolean(
      savedCompiledMatches &&
      savedCompiled?.complete === true &&
      expectedChunkStart === sessionDates.length,
    );
    let compiled = null;
    if (!compiledCacheHit) {
      const rawDataset = rawDatasetFromHistory({
        profiles,
        histories: finalHistories,
        fundamentals: fundamentals.filter((row) => finalSet.has(row.symbol)),
      });
      const completedBefore = savedCompiledMatches ? expectedChunkStart : 0;
      const compilation = compilePointInTimeSignals(rawDataset, {
        liquidity: { maxCandidates: 500 },
        maxSessions: minimumDatasetThrough
          ? FORWARD_REFRESH_COMPILE_SESSIONS_PER_RUN
          : COMPILE_SESSIONS_PER_RUN,
        resume: savedCompiledMatches
          ? {
              sessions: [],
              completedSessions:
                savedCompiled?.compilerCheckpoint?.completedSessions,
              decisionMemory: savedCompiled?.compilerCheckpoint?.decisionMemory,
            }
          : null,
      });
      const { compilerProgress, compilerCheckpoint, ...compiledDataset } =
        compilation;
      const chunkEnd = compilerProgress.completedSessions;
      const chunkPath = `${FMP_RESEARCH_COMPILED_CHUNK_PREFIX}/${fromDate}-${endDate}/${String(completedBefore).padStart(4, "0")}-${String(chunkEnd).padStart(4, "0")}.json.gz`;
      await persistReport({
        ...running,
        updatedAt: new Date().toISOString(),
        message:
          "A bounded point-in-time signal batch is compiled and being compressed into durable storage.",
        progress: {
          stage: "compiling-write",
          compiledSessions: chunkEnd,
          totalSessions: compilerProgress.totalSessions,
          remainingSessions: compilerProgress.remainingSessions,
          fullyEvaluatedSymbols: finalSymbols.length,
        },
      });
      const compressedBytes = await persistPrivateGzipJson(chunkPath, {
        metadata: compiledDataset.metadata,
        sessions: compiledDataset.sessions.map(compactReplaySession),
      });
      const chunks = [
        ...(savedCompiledMatches ? savedChunks : []),
        {
          pathname: chunkPath,
          start: completedBefore,
          end: chunkEnd,
          firstDate: compiledDataset.sessions[0]?.date || null,
          lastDate: compiledDataset.sessions.at(-1)?.date || null,
          compressedBytes,
        },
      ];
      await persistPrivateJson(FMP_RESEARCH_COMPILED_CHECKPOINT_STORE, {
        schema: COMPILED_CHECKPOINT_SCHEMA,
        signature: compiledSignature,
        complete: compilerProgress.complete,
        completedSessions: chunkEnd,
        completedAt: new Date().toISOString(),
        compilerCheckpoint,
        datasetMetadata: compiledDataset.metadata,
        sessionDates,
        chunks,
      });
      const collecting = {
        version: REPORT_VERSION,
        runnerSchema: REPLAY_CHECKPOINT_SCHEMA,
        status: "collecting",
        claimStatus: "provisional-post-selection-development-diagnostic",
        eligibleForCapitalClaims: false,
        startedAt,
        updatedAt: new Date().toISOString(),
        message: compilerProgress.complete
          ? "The point-in-time signal dataset is durably compiled; replay will start on the next invocation."
          : "Point-in-time signals are being compiled in bounded, durable session batches.",
        progress: {
          stage: compilerProgress.complete ? "compiled" : "compiling",
          compiledCacheHit: false,
          compiledSessions: compilerProgress.completedSessions,
          totalSessions: compilerProgress.totalSessions,
          remainingSessions: compilerProgress.remainingSessions,
          compiledChunks: chunks.length,
          lastChunkCompressedBytes: compressedBytes,
          fullyEvaluatedSymbols: finalSymbols.length,
        },
      };
      await persistReport(collecting);
      return collecting;
    }
    const replaySignature = JSON.stringify({
      schema: REPLAY_CHECKPOINT_SCHEMA,
      reportVersion: REPORT_VERSION,
      thesisContract: v12StrategyOptions({ contractId: V12_THESIS_ID }),
      statementSignature,
      finalSymbols: finalSymbols.slice().sort(),
      fromDate,
      endDate,
      firstCompiledSession: sessionDates[0] || null,
      lastCompiledSession: sessionDates.at(-1) || null,
      compiledSessions: sessionDates.length,
    });
    const savedReplay = await readPrivateJson(
      FMP_RESEARCH_REPLAY_CHECKPOINT_STORE,
    ).catch(() => null);
    const initialReplay =
      savedReplay?.schema === REPLAY_CHECKPOINT_SCHEMA &&
      savedReplay?.signature === replaySignature
        ? savedReplay
        : null;
    const replaySlice = nextReplaySessionSlice(
      sessionDates,
      initialReplay?.completedWindows,
      REPLAY_WINDOWS_PER_RUN,
    );
    const requiredChunks = replaySlice.complete
      ? []
      : savedChunks.filter(
          (chunk) =>
            number(chunk?.start, -1) < replaySlice.end &&
            number(chunk?.end, -1) > replaySlice.start,
        );
    const restoredChunks = await mapLimited(
      requiredChunks,
      1,
      async (chunk) => {
        const payload = await readPrivateGzipJson(chunk.pathname);
        const sessions = Array.isArray(payload?.sessions)
          ? payload.sessions
          : [];
        if (
          sessions.length !== chunk.end - chunk.start ||
          sessions[0]?.date !== chunk.firstDate ||
          sessions.at(-1)?.date !== chunk.lastDate
        )
          throw new Error(
            `Compiled research chunk is invalid: ${chunk.pathname}`,
          );
        return sessions.map(compactReplaySession);
      },
    );
    const restoreFailure = restoredChunks.find(
      (chunk) => chunk?.error || !Array.isArray(chunk),
    );
    if (restoreFailure)
      throw new Error(
        `Compiled research restore failed: ${restoreFailure.error || "invalid chunk"}`,
      );
    compiled = {
      metadata: savedCompiled.datasetMetadata,
      sessions: restoredChunks
        .flat()
        .filter(
          (session) =>
            replaySlice.complete ||
            (session.date >= replaySlice.startDate &&
              session.date <= replaySlice.endDate),
        ),
    };
    const expectedRestoredSessions = replaySlice.complete
      ? 0
      : replaySlice.end - replaySlice.start;
    if (compiled.sessions.length !== expectedRestoredSessions)
      throw new Error(
        `Compiled research window restore is incomplete (${compiled.sessions.length}/${expectedRestoredSessions})`,
      );
    await persistReport({
      ...running,
      updatedAt: new Date().toISOString(),
      message:
        "The next point-in-time replay window was restored; walk-forward replay is starting.",
      progress: {
        stage: "compiled",
        compiledCacheHit: true,
        compiledSessions: sessionDates.length,
        restoredSessions: compiled.sessions.length,
        fullyEvaluatedSymbols: finalSymbols.length,
      },
    });
    const replayResult = await runProvisionalWindows(compiled, {
      initial: initialReplay,
      calendarDates: sessionDates,
      skipFullPeriodDiagnostic: true,
      onCheckpoint: async (checkpoint) => {
        await persistPrivateJson(FMP_RESEARCH_REPLAY_CHECKPOINT_STORE, {
          ...checkpoint,
          schema: REPLAY_CHECKPOINT_SCHEMA,
          signature: replaySignature,
        });
        const { candidateRuns: _candidateRuns, ...publicProgress } = checkpoint;
        await persistReport({
          ...running,
          updatedAt: new Date().toISOString(),
          message:
            "Walk-forward replay is running from durable simulation-window checkpoints.",
          progress: {
            stage: "replay",
            ...publicProgress,
          },
        });
      },
    });
    if (replayResult.status === "collecting") {
      const collecting = {
        version: REPORT_VERSION,
        status: "collecting",
        claimStatus: "no-result",
        eligibleForCapitalClaims: false,
        startedAt,
        updatedAt: new Date().toISOString(),
        message:
          "The predeclared V12 thesis is being replayed in bounded, durable batches.",
        progress: {
          stage: "replay",
          ...replayResult.progress,
        },
        universe: {
          requestedResearchSymbols: symbols.length,
          priceCoveredSymbols: usableSymbols.length,
          fullyEvaluatedSymbols: finalSymbols.length,
          fromDate,
          toDate: endDate,
          compiledSessions: sessionDates.length,
        },
        provider: client.stats(),
      };
      await persistReport(collecting);
      return collecting;
    }
    const replay = replayResult.replay;
    const bars = [...finalHistories.values()].flat();
    const adjustedBars = bars.filter((bar) => bar.adjusted).length;
    const completedAt = new Date().toISOString();
    const report = {
      version: REPORT_VERSION,
      runnerSchema: REPLAY_CHECKPOINT_SCHEMA,
      status: "complete",
      cached: false,
      claimStatus: "provisional-post-selection-development-diagnostic",
      eligibleForCapitalClaims: false,
      startedAt,
      completedAt,
      methodology: {
        realHistoricalPrices: true,
        dividendAdjustedHistoricalPrices: true,
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        ordinaryBuyPersistenceUsesDistinctSessions: false,
        strongBuyStillRequiresAllHardGates: false,
        liveControlReplaysProductionPortfolioPolicy: false,
        completedV7ReportIsExternalComparisonBaseline: true,
        completedV8ReportIsExternalComparisonBaseline: true,
        completedV9ReportIsRejectedBenchmarkSleeveBaseline: true,
        completedV10ReportIsDevelopmentSource: true,
        completedV11ReportIsDevelopmentSource: true,
        activeThesisWasPostSelectedFromV11Diagnostics: true,
        activeThesisUsesIndependentResearchLifecycle: true,
        activeThesisRequiresProductionBuyLabel: false,
        fullEvaluatedEvidenceCandidateSource: true,
        untouchedChronologicalTestWindow: false,
        predeclaredActiveThesisCount: V12_ACTIVE_THESIS_COUNT,
        parameterSelectorUsed: false,
        rollingRegimeFolds: replay.windows.folds.length,
        rollingFoldSelectionUsesOnlyPriorWindows: false,
        rollingFoldAuditsAreChronologicallyUnseen: false,
        globalThesisAuditRemainsDiagnosticOnly: true,
        fullPeriodDiagnosticOmittedForBoundedReplay: true,
        benchmarkRelativeMomentum20_60_120Sessions: true,
        momentumRankUses120Ex20And60Ex5Sessions: true,
        pointInTimeChaseEntriesBlocked: true,
        pointInTimeEntryTimingPassRequired: true,
        pointInTimeTrendAlignmentRequired: true,
        maximumPriceAbove50DayAveragePct: 16,
        maximumReturn20Pct: 30,
        maximumReturn60Ex5Pct: 100,
        maximumReturn120Ex20Pct: 125,
        maximumMomentumExtensionSigma: 3,
        maximumNextOpenEntryGapPct: 3,
        benchmarkComparisonSymbols: ["SPY", "QQQ"],
        simpleAndExposureMatchedBenchmarkAttribution: true,
        residualCapitalBenchmarkCompletionSymbol: null,
        residualCashRemainsCash: true,
        passiveBenchmarkReturnNeverCountedAsAlpha: true,
        primaryAlphaMeasure:
          "simple total-return difference versus SPY and QQQ",
        crossSectionalMomentumRanks: true,
        momentumAndRelativeStrengthWeightPct: 85,
        qualityAndStabilityWeightPct: 10,
        timingAndControlledPullbackWeightPct: 5,
        fundamentalEvidenceCoverageRemainsRequired: true,
        sectorRelativeRanks: true,
        weeklyRankRebalance: true,
        equalWeightStockTargets: true,
        exposureMatchedBenchmarkAttributionIsSecondaryOnly: true,
        volatilityScaledSizing: false,
        issuerConcentrationLimit: true,
        immutableEntryStopDiagnostics: true,
        catastrophicInitialStopPct: 18,
        stopRatchetsDisabled: true,
        classifiedInitialStops: true,
        researchWindowsLiquidateAtFinalClose: true,
        nextOpenSizingUsesOpenMarksOnly: true,
        regimeHardGateUsed: false,
        rankDeteriorationExits: true,
        developmentControls: [
          "simple momentum under V12 entry discipline",
          "V11 weighting under V12 entry discipline",
          "V12 rank without the multi-horizon entry governor",
          "quality under V12 entry discipline",
          "transparent bull-cycle/pullback under V12 entry discipline",
          "random placebo",
        ],
        developmentRandomPlaceboSeeds: V12_DEVELOPMENT_PLACEBO_SEEDS,
        currentCohortOnly: true,
        survivorshipBiasFree: false,
        historicalMembershipPointInTime: false,
        filingAvailabilityUsesAcceptedDate: true,
        fundamentalValuesRevisionSafe: false,
        materialNewsHistoryPointInTime: false,
        sameHistoricalWindowsReusedAfterV7ThroughV11Diagnosis: true,
      },
      universe: {
        liveDiscoveryBuiltAt: discovery.builtAt,
        liveSourceUniverseSize: discovery.sourceUniverseSize,
        liveCandidateCount: discovery.candidateCount,
        researchSourceUniverseCount: researchSource.length,
        researchSampling:
          "sector-seeded deterministic sample without current technical-score ranking",
        requestedResearchSymbols: symbols.length,
        priceCoveredSymbols: usableSymbols.length,
        fullyEvaluatedSymbols: finalSymbols.length,
        sectors: [...new Set(profiles.map((row) => row.sector || "Other"))]
          .length,
        fromDate,
        toDate: endDate,
        compiledSessions: sessionDates.length,
      },
      dataQuality: {
        priceSource: priceContract.path,
        priceContractId: priceContract.id,
        priceAdjustmentMethod: priceContract.adjustmentMethod,
        dividendAdjustedEndpointFallbackUsed:
          priceContract.path !== PRICE_HISTORY_SOURCE,
        priceContractPreflightFailures: priceContractResult.failures,
        priceContractCheckpointReused:
          priceContractResult.checkpointReused === true,
        adjustedBarCoveragePct: bars.length
          ? Math.round((adjustedBars / bars.length) * 10_000) / 100
          : 0,
        historicalFundamentalSnapshots: fundamentals.length,
        priceFailures: priceFailures.slice(0, 20),
        statementFailures: statementHistory.failures.slice(0, 20),
        provider: client.stats(),
        compiledDatasetCheckpointReused: compiledCacheHit,
      },
      replay,
      limitations: [
        "The cohort is selected from today's diversified discovery candidates, so survivorship and current-selection bias remain.",
        "The default provisional cohort is 250 names; this is broader than the prior 120-name run but is not the full historical US equity opportunity set.",
        "FMP acceptedDate controls when a filing becomes usable, but the returned statement values are not certified as originally reported rather than later restated.",
        "Historical as-known material-news coverage is unavailable; the production event-risk gate is not reproduced.",
        "Delisted securities and explicit delisting returns are absent from this provisional cohort.",
        "V7 through V11 are retained as external baselines and are not rerun; the V11-weight control inside this report changes only the rank weights under the matched V12 lifecycle.",
        "The optional overlapping full-period diagnostic is omitted so production execution remains durably bounded; the primary evidence remains the chronological walk-forward audit.",
        "V12 uses the observed V11 factor and trade diagnostics to increase momentum weight and add a multi-horizon entry governor. Every reused historical date is therefore contaminated development data, not a new untouched test.",
        "The 25 deterministic random-placebo portfolios are a fast development control, not the 1,000-plus placebo distribution required by the strict point-in-time evidence contract.",
        "Cash remains cash. Exposure-matched attribution is reported only as a secondary diagnostic and cannot satisfy the primary benchmark-beating gate.",
        "This diagnostic tests mechanics and obvious failure modes; it is not evidence that future recommendations will outperform.",
      ],
      nextResearchRequirement:
        "Run the frozen V12 thesis on genuinely untouched or forward data under screener-pit-v1, including historical membership, delistings, revision-safe fundamentals, point-in-time material news and at least 1,000 matched random placebos before making an alpha claim or changing live recommendations.",
    };
    await persistReport(report);
    return report;
  } catch (error) {
    const failed = {
      version: REPORT_VERSION,
      status: "failed",
      claimStatus: "no-result",
      eligibleForCapitalClaims: false,
      startedAt,
      failedAt: new Date().toISOString(),
      error: sanitizedError(error),
      provider: client.stats(),
    };
    await persistReport(failed).catch(() => {});
    throw error;
  }
}
