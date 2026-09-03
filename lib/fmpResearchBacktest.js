// Bounded, durable FMP research diagnostic.
//
// This is intentionally separate from the strict point-in-time research runner.
// It replays real historical prices and filing-availability timestamps for a
// diversified current cohort, but it cannot honestly certify survivorship-free
// membership, revision-safe statement values or as-known material-news history.
// The report therefore stays "provisional" and can never authorize live capital.

import { get, list, put } from "@vercel/blob";
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
import { latestCompletedMarketSessionDay } from "./marketSession";
import { simulatePointInTimePortfolio } from "./walkForwardBacktest";
import {
  V12_DEVELOPMENT_PLACEBO_SEEDS,
  V12_EVIDENCE_REQUIREMENTS,
  V12_THESIS_ID,
  v12AuditControlDefinitions,
  v12StrategyOptions,
} from "./v12ResearchContract";
import { v11StrategyOptions } from "./v11ResearchContract";

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
const POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_STORE =
  "research/pit-sp500-alpha-creator-v2-integrity.json";
const POINT_IN_TIME_SP500_ALPHA_V2_INTEGRITY_REPORT_VERSION = 5;
// Research datasets use one permanent security identifier across ticker
// changes. EchoStar changed its Nasdaq ticker from SATS to ECHO on 2026-06-24;
// treating both vendor aliases as separate members can double-count one issuer.
const POINT_IN_TIME_SECURITY_ALIASES = Object.freeze({ SATS: "ECHO" });
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
    developmentPositiveReturn: development.totalReturnPct > 0,
    developmentBeatsSpy: development.simpleDifferenceVsSpyPct > 0,
    developmentBeatsQqq: development.simpleDifferenceVsQqqPct > 0,
    developmentProfitFactorAboveOne: development.profitFactor > 1,
    sealedHistoricalPositiveReturn: sealedHistorical.totalReturnPct > 0,
    sealedHistoricalBeatsSpy: sealedHistorical.simpleDifferenceVsSpyPct > 0,
    sealedHistoricalBeatsQqq: sealedHistorical.simpleDifferenceVsQqqPct > 0,
    sealedHistoricalProfitFactorAboveOne:
      sealedHistorical.profitFactor > 1,
    contaminatedPreFreezePositiveReturn:
      contaminatedPreFreeze.totalReturnPct > 0,
    contaminatedPreFreezeBeatsSpy:
      contaminatedPreFreeze.simpleDifferenceVsSpyPct > 0,
    contaminatedPreFreezeBeatsQqq:
      contaminatedPreFreeze.simpleDifferenceVsQqqPct > 0,
    contaminatedPreFreezeProfitFactorAboveOne:
      contaminatedPreFreeze.profitFactor > 1,
  };
  const prospectiveChecks = {
    minimumSixtyNewSessions: prospectiveSessions >= 60,
    positiveReturn: prospective?.totalReturnPct > 0,
    beatsSpy: prospective?.simpleDifferenceVsSpyPct > 0,
    beatsQqq: prospective?.simpleDifferenceVsQqqPct > 0,
    positiveExpectancy: prospective?.expectancyPct > 0,
    profitFactorAboveOne: prospective?.profitFactor > 1,
    maximumDrawdownBelowFifteenPct:
      prospective != null && Math.abs(prospective.maxDrawdownPct) < 15,
    strictOneThousandSeedPlaceboPassed: false,
  };
  const historicalScreenPassed = Object.values(historicalChecks).every(Boolean);
  const report = {
    version: 2,
    status: "complete",
    completedAt: new Date().toISOString(),
    datasetThrough,
    experiment: "Frozen prospective alpha challenger",
    definition,
    candidateCount: 1,
    candidateFrozenBeforeProspectiveWindow: true,
    developmentWindows,
    sealedHistoricalWindow,
    contaminatedPreFreezeWindow,
    prospectiveWindow,
    prospectiveSessions,
    development,
    developmentFolds,
    sealedHistorical,
    contaminatedPreFreeze,
    prospective,
    historicalChecks,
    historicalScreenPassed,
    candidateDisposition: historicalScreenPassed
      ? "prospective-collection-active"
      : "rejected-before-prospective-collection",
    prospectiveCollectionActive: historicalScreenPassed,
    prospectiveChecks,
    allEvidenceGatesPassed:
      historicalScreenPassed &&
      Object.values(prospectiveChecks).every(Boolean),
    productionChanged: false,
    evidenceAssessment: {
      historicalAndPreFreezeResultsContaminated: true,
      prospectiveCandidateRetuningAllowed: false,
      eligibleForAlphaClaim: false,
      reason:
        "The candidate was designed after inspecting results through 2026-09-01. It cannot earn promotion authority until at least 60 genuinely new sessions and the strict 1,000-seed placebo gate pass.",
    },
    limitations: [
      "The current-survivor universe introduces survivorship bias.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
      "The historical and pre-freeze windows are contaminated development diagnostics, not independent evidence.",
      "Successive daily prospective snapshots overlap and are not independent experiments.",
    ],
  };
  await persistPrivateJson(ALPHA_PROSPECTIVE_CHALLENGER_STORE, report);
  return report;
}

// Descriptive regime map only. It uses every non-overlapping 126-session
// window available after a one-year signal warmup and never selects or promotes
// a thesis. The purpose is to distinguish repeatable factor leadership from a
// favorable two-rebalance accident before designing another challenger.
export async function runAlphaRegimeMap({ force = false } = {}) {
  const existing = await getAlphaRegimeMap();
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error("The completed research dataset checkpoint is unavailable");
  const calendar = asArray(manifest.sessionDates);
  const datasetThrough = calendar.at(-1) || null;
  if (!datasetThrough)
    throw new Error("The compiled research calendar is unavailable");
  if (
    !force &&
    existing?.status === "complete" &&
    number(existing?.version, 0) >= ALPHA_REGIME_MAP_REPORT_VERSION &&
    String(existing?.datasetThrough || "") >= datasetThrough
  )
    return existing;
  const usable = calendar.slice(252);
  if (usable.length < 252)
    throw new Error("At least two post-warmup regime windows are required");
  const windowSessions = 126;
  const windows = [];
  for (let start = 0; start < usable.length; start += windowSessions) {
    const dates = usable.slice(start, start + windowSessions);
    if (dates.length < 30) break;
    windows.push({
      index: windows.length + 1,
      start: dates[0],
      end: dates.at(-1),
      sessions: dates.length,
    });
  }
  const unionStart = windows[0].start;
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
  const controls = [
    {
      id: "momentum-only",
      label: "Pure cross-sectional momentum",
      overrides: { researchRankMode: "momentum-only" },
    },
    {
      id: "momentum-monthly-buffered-diversified",
      label: "Monthly buffered pure momentum with diversification",
      overrides: {
        researchRankMode: "momentum-only",
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        rankedTargetCount: 10,
        rankedExitBuffer: 15,
        maxPositions: 10,
        maxSectorPositions: 4,
        maxSectorPct: 0.4,
      },
    },
    {
      id: "momentum-monthly-buffered-concentrated",
      label: "Monthly buffered pure momentum without a sector cap",
      overrides: {
        researchRankMode: "momentum-only",
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        rankedTargetCount: 10,
        rankedExitBuffer: 15,
        maxPositions: 10,
        maxSectorPositions: 10,
        maxSectorPct: 1,
      },
    },
    {
      id: "momentum-dominant",
      label: "Momentum-dominant quality blend",
      overrides: { researchRankMode: "momentum-dominant-quality-blend" },
    },
    {
      id: "balanced-quality-momentum",
      label: "Balanced quality and momentum",
      overrides: { researchRankMode: "quality-momentum-leadership" },
    },
    {
      id: "quality-only",
      label: "Quality only",
      overrides: { researchRankMode: "quality-only" },
    },
    {
      id: "dual-horizon-price-momentum",
      label: "Transparent dual-horizon price momentum",
      overrides: {
        researchRankMode: "price-pattern",
        pricePatternWeights: {
          return120Ex20: 0.5,
          return60Ex5: 0.35,
          return20: 0.15,
        },
      },
    },
    {
      id: "breadth-quality-defense",
      label: "Breadth-triggered quality defense",
      overrides: { researchRankMode: "adaptive-quality-momentum" },
    },
    {
      id: "twenty-session-leadership",
      label: "Twenty-session quality/momentum leadership",
      overrides: { researchRankMode: "adaptive-factor-leadership-20" },
    },
    {
      id: "persistent-twenty-session-leadership",
      label: "Twenty-session factor leadership with forty-session hysteresis",
      overrides: {
        researchRankMode: "persistent-factor-leadership-20",
        qualityLeadershipMinimumSessions: 40,
      },
    },
    {
      id: "confirmed-quality-defense",
      label: "Breadth-confirmed twenty-session quality defense",
      overrides: { researchRankMode: "confirmed-quality-defense" },
    },
  ];
  const runsByControl = new Map(controls.map((control) => [control.id, []]));
  const regimeWindows = windows.map((window) => {
    const results = controls.map((control) => {
      const run = simulatePointInTimePortfolio(
        dataset,
        simulationOptions(
          v11StrategyOptions({
            thesisId: `alpha-regime-map-${control.id}`,
            thesisLabel: control.label,
            requireEntryTimingPass: true,
            minimumQualifiedSessions: 2,
            rankedRebalanceSessions: 10,
            rankedMinimumHoldSessions: 15,
            rankedTargetCount: 12,
            rankedExitBuffer: 12,
            maxPositions: 12,
            maxSectorPositions: 4,
            maxSectorPct: 0.34,
            ...control.overrides,
            startDate: window.start,
            endDate: window.end,
          }),
        ),
      );
      assertCompleteResearchWindow(
        run,
        calendar,
        window,
        `Alpha regime map ${window.index} ${control.id}`,
      );
      runsByControl.get(control.id).push(run);
      return {
        id: control.id,
        label: control.label,
        ...boundedReviewExperimentSummary(run),
      };
    });
    const ordered = [...results].sort(
      (left, right) =>
        Math.min(
          right.simpleDifferenceVsSpyPct,
          right.simpleDifferenceVsQqqPct,
        ) -
          Math.min(
            left.simpleDifferenceVsSpyPct,
            left.simpleDifferenceVsQqqPct,
          ) || left.id.localeCompare(right.id),
    );
    return {
      window,
      results,
      descriptiveWinnerId: ordered[0].id,
      descriptiveWinnerAlphaFloorPct: roundMetric(
        Math.min(
          ordered[0].simpleDifferenceVsSpyPct,
          ordered[0].simpleDifferenceVsQqqPct,
        ),
      ),
    };
  });
  const aggregateControls = controls.map((control) => ({
    id: control.id,
    label: control.label,
    ...boundedReviewExperimentSummary(
      aggregateResearchRuns(runsByControl.get(control.id)),
    ),
    windowsBeatingBothBenchmarks: regimeWindows.filter((window) => {
      const result = window.results.find((row) => row.id === control.id);
      return (
        result.simpleDifferenceVsSpyPct > 0 &&
        result.simpleDifferenceVsQqqPct > 0
      );
    }).length,
    descriptiveWindowWins: regimeWindows.filter(
      (window) => window.descriptiveWinnerId === control.id,
    ).length,
  }));
  const report = {
    version: ALPHA_REGIME_MAP_REPORT_VERSION,
    status: "complete",
    completedAt: new Date().toISOString(),
    datasetThrough,
    experiment: "Non-overlapping alpha regime map",
    windowSessions,
    windowCount: regimeWindows.length,
    controlCount: controls.length,
    controls,
    windows: regimeWindows,
    aggregateControls,
    candidateSelected: false,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    limitations: [
      "This is a post-diagnostic descriptive map; every reported date is contaminated development evidence.",
      "The final window may be shorter than 126 sessions and must not be compared as an equal-length independent sample.",
      "The current-survivor universe introduces survivorship bias and omits delisted securities and explicit delisting returns.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
      "Descriptive window winners are not a selector and have no production authority.",
    ],
  };
  await persistPrivateJson(ALPHA_REGIME_MAP_STORE, report);
  return report;
}

// One bounded provider-capability check. It returns only availability, row
// counts, and field presence; credentials and provider payloads are never
// persisted or exposed. A completed result is immutable so this public
// research endpoint cannot become a provider request amplifier.
export async function runResearchDataCapabilityAudit() {
  const existing = await getResearchDataCapabilityAudit();
  if (existing?.status === "complete" && number(existing?.version, 0) >= 2)
    return existing;
  const apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY;
  if (!apiKey) throw new Error("The configured research provider key is unavailable");
  const client = createFmpClient(apiKey);
  const probe = async (path, params, requiredFieldGroups) => {
    try {
      const rows = await client.fetchStable(path, params);
      const sample = rows[0] || {};
      return {
        available: rows.length > 0,
        rowsReturned: rows.length,
        fieldGroups: Object.fromEntries(
          Object.entries(requiredFieldGroups).map(([label, aliases]) => [
            label,
            aliases.some((field) => sample[field] !== undefined),
          ]),
        ),
        sampleFields: Object.keys(sample).sort(),
      };
    } catch (error) {
      return {
        available: false,
        rowsReturned: 0,
        fieldGroups: Object.fromEntries(
          Object.keys(requiredFieldGroups).map((field) => [field, false]),
        ),
        error: sanitizedError(error),
      };
    }
  };
  const historicalMembership = await probe(
    "historical-sp500-constituent",
    {},
    {
      effectiveDate: ["date", "dateAdded"],
      addedSymbol: ["addedSymbol", "addedTicker", "symbol"],
      removedSymbol: ["removedSymbol", "removedTicker"],
    },
  );
  const delistedCompanies = await probe(
    "delisted-companies",
    { page: "0", limit: "5" },
    { symbol: ["symbol"] },
  );
  const pointInTimeMembershipAvailable =
    historicalMembership.available === true &&
    Object.values(historicalMembership.fieldGroups).every(Boolean);
  const delistedUniverseAvailable =
    delistedCompanies.available === true &&
    delistedCompanies.fieldGroups.symbol === true;
  const report = {
    version: 2,
    status: "complete",
    completedAt: new Date().toISOString(),
    providerCalls: client.stats().calls,
    probes: { historicalMembership, delistedCompanies },
    capabilities: {
      pointInTimeSp500MembershipChanges: pointInTimeMembershipAvailable,
      delistedCompanyUniverse: delistedUniverseAvailable,
      revisionSafeFundamentalValues: false,
      pointInTimeMaterialNews: false,
    },
    pointInTimeDatasetRebuildFeasible:
      pointInTimeMembershipAvailable && delistedUniverseAvailable,
    productionChanged: false,
    credentialsExposed: false,
    nextStep:
      pointInTimeMembershipAvailable && delistedUniverseAvailable
        ? "Build a separate S&P 500 point-in-time research universe with explicit removals and delisting-return handling."
        : "Obtain a provider that supplies historical membership, delistings, revision-safe fundamentals, and as-known material-event history before making an alpha claim.",
    limitations: [
      "Endpoint availability does not certify data completeness or revision history.",
      "FMP statement values are not certified as originally reported rather than later restated.",
      "Historical as-known material-news coverage remains unavailable.",
      "This capability check cannot authorize production recommendations.",
    ],
  };
  await persistPrivateJson(RESEARCH_DATA_CAPABILITY_STORE, report);
  return report;
}

function pointInTimeSp500UniverseSummary(report = {}) {
  return {
    version: report.version,
    status: report.status,
    completedAt: report.completedAt,
    fromDate: report.fromDate,
    throughDate: report.throughDate,
    currentConstituents: report.currentConstituents,
    initialConstituents: report.initialConstituents,
    normalizedMembershipChanges: report.normalizedMembershipChanges,
    unionSymbols: report.unionSymbols,
    removedSymbols: report.removedSymbols,
    delistedRemovedSymbolsMatched: report.delistedRemovedSymbolsMatched,
    pointInTimeMembershipConstructed:
      report.pointInTimeMembershipConstructed === true,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    nextStep: report.nextStep,
    limitations: report.limitations,
  };
}

// Build a private, immutable membership blueprint. The public endpoint receives
// only counts and dates; licensed constituent rows and symbol lists remain in
// private storage for the subsequent bounded price/fundamental acquisition.
export async function runPointInTimeSp500Universe() {
  const existing = await getPointInTimeSp500Universe().catch(() => null);
  if (existing?.status === "complete" && number(existing?.version, 0) >= 1)
    return pointInTimeSp500UniverseSummary(existing);
  const apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY;
  if (!apiKey) throw new Error("The configured research provider key is unavailable");
  const client = createFmpClient(apiKey);
  const currentRows = [];
  const changeRows = [];
  const delistedRows = [];
  const current = await client.fetchStable("sp500-constituent", {});
  const changes = await client.fetchStable("historical-sp500-constituent", {});
  const delisted = await client.fetchStable("delisted-companies", {
    page: "0",
    limit: "1000",
  });
  currentRows.push(...current);
  changeRows.push(...changes);
  delistedRows.push(...delisted);
  const normalize = (value) =>
    String(value || "")
      .replace("-", ".")
      .toUpperCase()
      .trim();
  const currentSymbols = [
    ...new Set(currentRows.map((row) => normalize(row.symbol)).filter(Boolean)),
  ];
  const normalizedChanges = changeRows
    .map((row) => ({
      date: String(row.date || row.dateAdded || "").slice(0, 10),
      addedSymbol: normalize(row.addedSymbol || row.addedTicker || row.symbol),
      removedSymbol: normalize(row.removedSymbol || row.removedTicker),
    }))
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        (row.addedSymbol || row.removedSymbol),
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.addedSymbol.localeCompare(right.addedSymbol) ||
        left.removedSymbol.localeCompare(right.removedSymbol),
    );
  if (currentSymbols.length < 450 || normalizedChanges.length < 100)
    throw new Error(
      `Historical membership coverage is insufficient (${currentSymbols.length} current, ${normalizedChanges.length} changes)`,
    );
  const fromDate = "2022-01-01";
  const throughDate = latestCompletedMarketSessionDay(new Date()) || isoDay(Date.now());
  const relevantChanges = normalizedChanges.filter(
    (row) => row.date > fromDate && row.date <= throughDate,
  );
  const initialMembers = new Set(currentSymbols);
  for (const change of [...relevantChanges].sort((a, b) => b.date.localeCompare(a.date))) {
    if (change.addedSymbol) initialMembers.delete(change.addedSymbol);
    if (change.removedSymbol) initialMembers.add(change.removedSymbol);
  }
  if (initialMembers.size < 400 || initialMembers.size > 600)
    throw new Error(
      `Reconstructed ${fromDate} membership is implausible (${initialMembers.size})`,
    );
  const union = new Set([...currentSymbols, ...initialMembers]);
  for (const change of relevantChanges) {
    if (change.addedSymbol) union.add(change.addedSymbol);
    if (change.removedSymbol) union.add(change.removedSymbol);
  }
  const removed = new Set(
    relevantChanges.map((row) => row.removedSymbol).filter(Boolean),
  );
  const delistedBySymbol = new Map(
    delistedRows
      .map((row) => [normalize(row.symbol), String(row.delistedDate || "").slice(0, 10)])
      .filter(([symbol]) => symbol),
  );
  const report = {
    version: 1,
    status: "complete",
    completedAt: new Date().toISOString(),
    fromDate,
    throughDate,
    currentConstituents: currentSymbols.length,
    initialConstituents: initialMembers.size,
    normalizedMembershipChanges: relevantChanges.length,
    unionSymbols: union.size,
    removedSymbols: removed.size,
    delistedRemovedSymbolsMatched: [...removed].filter((symbol) =>
      delistedBySymbol.has(symbol),
    ).length,
    pointInTimeMembershipConstructed: true,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    privateBlueprint: {
      currentSymbols: currentSymbols.slice().sort(),
      initialSymbols: [...initialMembers].sort(),
      changes: relevantChanges,
      unionSymbols: [...union].sort(),
      delistedDates: Object.fromEntries(delistedBySymbol),
    },
    nextStep:
      "Acquire adjusted histories and filing-clock fundamentals for the private union, then compile membership-filtered sessions in a separate store.",
    limitations: [
      "Membership reconstruction covers the S&P 500, not the full U.S. equity market or Nasdaq-100 membership.",
      "A removed security without an explicit delisting cash value still requires conservative return handling.",
      "Revision-safe fundamentals and historical as-known material news remain unavailable.",
      "This blueprint is research infrastructure and cannot authorize recommendations.",
    ],
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_UNIVERSE_STORE, report);
  return pointInTimeSp500UniverseSummary(report);
}

function pointInTimeSp500DatasetStatusSummary(report = {}) {
  return {
    version: report.version,
    status: report.status,
    startedAt: report.startedAt,
    updatedAt: report.updatedAt,
    completedAt: report.completedAt,
    runClaimedAt: report.runClaimedAt,
    period: report.period,
    progress: report.progress,
    coverage: report.coverage,
    priceContract: report.priceContract,
    pointInTimeMembershipConstructed:
      report.pointInTimeMembershipConstructed === true,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    nextStep: report.nextStep,
    limitations: report.limitations,
  };
}

// Acquire the immutable point-in-time S&P 500 union in bounded batches. This
// uses stores that are deliberately separate from the current-cohort research
// replay, so a partial rebuild cannot contaminate an existing result or alter
// production recommendations.
export async function runPointInTimeSp500DatasetAcquisition({
  now = Date.now(),
} = {}) {
  let blueprint = await getPointInTimeSp500Universe().catch(() => null);
  if (blueprint?.status !== "complete") {
    await runPointInTimeSp500Universe();
    blueprint = await getPointInTimeSp500Universe();
  }
  const privateBlueprint = blueprint?.privateBlueprint;
  const unionSymbols = asArray(privateBlueprint?.unionSymbols)
    .map(symbolOf)
    .filter(Boolean);
  if (
    blueprint?.pointInTimeMembershipConstructed !== true ||
    unionSymbols.length < 450
  )
    throw new Error("A complete private S&P 500 membership blueprint is required");

  const previousStatus = await getPointInTimeSp500DatasetStatus();
  const previousCompilationClaim = new Date(
    previousStatus?.runClaimedAt || 0,
  ).getTime();
  if (
    previousStatus?.status === "collecting" &&
    previousStatus?.progress?.stage === "compiling" &&
    previousStatus?.runClaimedAt &&
    Number.isFinite(previousCompilationClaim) &&
    now - previousCompilationClaim <
      POINT_IN_TIME_SP500_COMPILATION_CLAIM_TTL_MS
  ) {
    console.log("[pit-sp500-compile] active claim reused", {
      runClaimedAt: previousStatus.runClaimedAt,
      compiledSessions: number(previousStatus?.progress?.compiledSessions, 0),
      totalSessions: number(previousStatus?.progress?.totalSessions, 0),
    });
    return pointInTimeSp500DatasetStatusSummary(previousStatus);
  }
  const startedAt =
    previousStatus?.version === 1 && previousStatus?.startedAt
      ? previousStatus.startedAt
      : new Date(now).toISOString();
  const fromDate = String(blueprint.fromDate || "").slice(0, 10);
  const endDate = String(blueprint.throughDate || "").slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  )
    throw new Error("The point-in-time blueprint date range is invalid");

  const limitations = [
    "The rebuild covers historical S&P 500 membership, not the full U.S. market or historical Nasdaq-100 membership.",
    "Filing availability timestamps are point-in-time, but statement values are not certified as revision-safe.",
    "Historical as-known material-news coverage is unavailable.",
    "Acquisition and compilation are research-only and cannot authorize production recommendations.",
  ];
  const apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY;
  if (!apiKey) throw new Error("The configured research provider key is unavailable");
  const client = createFmpClient(apiKey);
  const symbols = [...new Set(unionSymbols)].sort();
  const priceSymbols = [...new Set([...symbols, "SPY", "QQQ"])].sort();
  const savedPrices = await readPrivateJson(
    POINT_IN_TIME_SP500_PRICE_CHECKPOINT_STORE,
  ).catch(() => null);
  const savedPriceSignature = parseSignature(savedPrices?.signature);
  const savedPriceContract = PRICE_HISTORY_CONTRACTS.find(
    (contract) => contract.id === savedPriceSignature?.priceContract,
  );
  const cachedBenchmarkBars = asArray(savedPrices?.histories?.SPY);
  const candidateSignatureForSavedContract = savedPriceContract
    ? JSON.stringify({
        schema: PRICE_ACQUISITION_SCHEMA,
        fromDate,
        endDate,
        priceContract: savedPriceContract.id,
        symbols: priceSymbols,
      })
    : null;
  const cachedPriceContractUsable = Boolean(
    savedPriceContract &&
      equivalentAcquisitionSignature(
        savedPrices?.signature,
        candidateSignatureForSavedContract,
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
    symbols: priceSymbols,
  });
  const initialPrices =
    savedPrices?.signature === acquisitionSignature ||
    equivalentAcquisitionSignature(savedPrices?.signature, acquisitionSignature)
      ? savedPrices
      : null;
  const priceHistory = await fetchPriceHistory(
    client,
    priceContract,
    priceSymbols,
    fromDate,
    endDate,
    {
      initial: {
        ...(initialPrices || {}),
        histories: {
          ...(initialPrices?.histories || {}),
          SPY: priceContractResult.benchmarkBars,
        },
        completedSymbols: [
          ...new Set([
            "SPY",
            ...asArray(initialPrices?.completedSymbols).map(symbolOf),
          ]),
        ],
        exhaustedSymbols: asArray(initialPrices?.exhaustedSymbols)
          .map(symbolOf)
          .filter((symbol) => symbol !== "SPY"),
      },
      onCheckpoint: (checkpoint) =>
        persistPrivateJson(POINT_IN_TIME_SP500_PRICE_CHECKPOINT_STORE, {
          version: PRICE_ACQUISITION_SCHEMA,
          signature: acquisitionSignature,
          updatedAt: new Date().toISOString(),
          ...checkpoint,
        }),
    },
  );
  const priceProgress = {
    stage: "prices",
    completedSymbols: priceHistory.completedSymbols.length,
    exhaustedSymbols: priceHistory.exhaustedSymbols.length,
    processedSymbols:
      priceHistory.completedSymbols.length +
      priceHistory.exhaustedSymbols.length,
    totalSymbols: priceSymbols.length,
    remainingSymbols: priceHistory.remainingSymbols.length,
    failures: asArray(priceHistory.priceFailures).length,
  };
  if (priceHistory.remainingSymbols.length) {
    const collecting = {
      version: 1,
      status: "collecting",
      startedAt,
      updatedAt: new Date().toISOString(),
      period: { from: fromDate, through: endDate },
      progress: priceProgress,
      pointInTimeMembershipConstructed: true,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      priceContract: {
        id: priceContract.id,
        adjustmentMethod: priceContract.adjustmentMethod,
      },
      nextStep: "Continue bounded adjusted-price acquisition.",
      limitations,
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE, collecting);
    return pointInTimeSp500DatasetStatusSummary(collecting);
  }

  const histories = new Map(Object.entries(priceHistory.histories || {}));
  if (!histories.has("SPY") || !histories.has("QQQ"))
    throw new Error("SPY and QQQ benchmark histories are required");
  const usableSymbols = symbols.filter(
    (symbol) => (histories.get(symbol) || []).length >= 20,
  );
  if (usableSymbols.length < Math.floor(symbols.length * 0.85))
    throw new Error(
      `Point-in-time price coverage is insufficient (${usableSymbols.length}/${symbols.length})`,
    );
  const statementSignature = JSON.stringify({
    acquisitionSignature,
    symbols: usableSymbols.slice().sort(),
    source: "stable-per-symbol-quarterly-v1",
  });
  const savedStatements = await readPrivateJson(
    POINT_IN_TIME_SP500_STATEMENT_CHECKPOINT_STORE,
  ).catch(() => null);
  const initialStatements =
    savedStatements?.signature === statementSignature ||
    equivalentStatementSignature(savedStatements?.signature, statementSignature)
      ? savedStatements
      : null;
  const statementHistory = await fetchStatementHistory(
    client,
    usableSymbols,
    new Date(`${fromDate}T00:00:00.000Z`).getUTCFullYear() - 2,
    new Date(`${endDate}T00:00:00.000Z`).getUTCFullYear(),
    {
      initial: initialStatements,
      onCheckpoint: (checkpoint) =>
        persistPrivateJson(POINT_IN_TIME_SP500_STATEMENT_CHECKPOINT_STORE, {
          version: 1,
          signature: statementSignature,
          updatedAt: new Date().toISOString(),
          ...checkpoint,
        }),
    },
  );
  const statementProgress = {
    stage: "fundamentals",
    completedSymbols: statementHistory.completedSymbols.length,
    exhaustedSymbols: statementHistory.exhaustedSymbols.length,
    processedSymbols:
      statementHistory.completedSymbols.length +
      statementHistory.exhaustedSymbols.length,
    totalSymbols: usableSymbols.length,
    remainingSymbols: statementHistory.remainingSymbols.length,
    failures: asArray(statementHistory.failures).length,
  };
  if (statementHistory.remainingSymbols.length) {
    const collecting = {
      version: 1,
      status: "collecting",
      startedAt,
      updatedAt: new Date().toISOString(),
      period: { from: fromDate, through: endDate },
      progress: statementProgress,
      coverage: {
        membershipUnionSymbols: symbols.length,
        priceUsableSymbols: usableSymbols.length,
      },
      pointInTimeMembershipConstructed: true,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      priceContract: {
        id: priceContract.id,
        adjustmentMethod: priceContract.adjustmentMethod,
      },
      nextStep: "Continue bounded filing-clock fundamental acquisition.",
      limitations,
    };
    await persistPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE, collecting);
    return pointInTimeSp500DatasetStatusSummary(collecting);
  }

  const fundamentals = buildHistoricalFundamentalRows(statementHistory);
  const fundamentalSymbols = new Set(
    fundamentals
      .filter((row) => row.fundamentalDataVerified === true)
      .map((row) => symbolOf(row)),
  );
  const ready = {
    version: 1,
    status: "ready-to-compile",
    startedAt,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    period: { from: fromDate, through: endDate },
    progress: {
      stage: "acquisition-complete",
      processedSymbols: usableSymbols.length,
      totalSymbols: usableSymbols.length,
      remainingSymbols: 0,
      failures: asArray(statementHistory.failures).length,
    },
    coverage: {
      membershipUnionSymbols: symbols.length,
      priceUsableSymbols: usableSymbols.length,
      fundamentalVerifiedSymbols: fundamentalSymbols.size,
      membershipChanges: number(blueprint.normalizedMembershipChanges, 0),
      removedSymbols: number(blueprint.removedSymbols, 0),
      delistedRemovedSymbolsMatched: number(
        blueprint.delistedRemovedSymbolsMatched,
        0,
      ),
    },
    pointInTimeMembershipConstructed: true,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    priceContract: {
      id: priceContract.id,
      adjustmentMethod: priceContract.adjustmentMethod,
    },
    nextStep:
      "Compile membership-filtered sessions with conservative delisting treatment in a separate durable store.",
    limitations,
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE, ready);
  const runClaimedAt = new Date(now).toISOString();
  const compiling = {
    ...ready,
    status: "collecting",
    updatedAt: runClaimedAt,
    completedAt: null,
    runClaimedAt,
    progress: {
      stage: "compiling",
      compiledSessions: number(previousStatus?.progress?.compiledSessions, 0),
      totalSessions: (histories.get("SPY") || []).length,
      remainingSessions: Math.max(
        0,
        (histories.get("SPY") || []).length -
          number(previousStatus?.progress?.compiledSessions, 0),
      ),
      compiledChunks: number(previousStatus?.progress?.compiledChunks, 0),
    },
    nextStep: "One claimed worker is compiling the next durable session chunk.",
  };
  await persistPrivateJson(
    POINT_IN_TIME_SP500_DATASET_STATUS_STORE,
    compiling,
  );
  console.log("[pit-sp500-compile] chunk started", {
    runClaimedAt,
    compiledSessions: compiling.progress.compiledSessions,
    totalSessions: compiling.progress.totalSessions,
  });
  try {
    const result = await compilePointInTimeSp500Dataset({
      blueprint,
      histories,
      statementHistory,
      symbols,
      usableSymbols,
      startedAt,
      limitations,
      priceContract,
    });
    console.log("[pit-sp500-compile] chunk completed", {
      status: result.status,
      compiledSessions: number(result?.progress?.compiledSessions, 0),
      totalSessions: number(result?.progress?.totalSessions, 0),
    });
    return result;
  } catch (error) {
    console.error("[pit-sp500-compile] chunk failed", {
      error: sanitizedError(error),
    });
    await persistPrivateJson(POINT_IN_TIME_SP500_DATASET_STATUS_STORE, {
      ...ready,
      status: "ready-to-compile",
      updatedAt: new Date().toISOString(),
      completedAt: null,
      lastCompilationError: sanitizedError(error),
    }).catch(() => {});
    throw error;
  }
}

// Chronologically subsequent V11 evidence. This is intentionally separate
// from the frozen three-fold audit: appending a new session must never rewrite
// the historical baseline or silently retune the thesis.
export async function runV11ForwardExtension({ force = false } = {}) {
  const existing = await getV11ForwardExtensionReport();
  if (
    !force &&
    existing?.status === "complete" &&
    number(existing?.version, 0) >= V11_FORWARD_EXTENSION_REPORT_VERSION &&
    String(existing?.window?.end || "") >= V11_FORWARD_EXTENSION_TARGET
  )
    return existing;
  const manifest = await readPrivateJson(
    FMP_RESEARCH_COMPILED_CHECKPOINT_STORE,
  );
  const calendar = asArray(manifest?.sessionDates);
  const datasetThrough = calendar.at(-1) || null;
  if (
    !manifest?.complete ||
    !asArray(manifest?.chunks).length ||
    !datasetThrough ||
    datasetThrough < V11_FORWARD_EXTENSION_TARGET
  ) {
    const collecting = {
      version: 1,
      status: "collecting",
      thesis: "Frozen V11 momentum-dominant quality leadership blend",
      window: {
        start: V11_FORWARD_EXTENSION_START,
        targetEnd: V11_FORWARD_EXTENSION_TARGET,
        datasetThrough,
      },
      message:
        "The compiled research checkpoint is advancing through the requested completed session.",
      productionChanged: false,
    };
    await persistPrivateJson(V11_FORWARD_EXTENSION_STORE, collecting);
    return collecting;
  }
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
  const requiredDates = calendar.filter(
    (date) => date >= window.start && date <= window.end,
  );
  const restoredDates = new Set(restored.map((session) => session.date));
  if (!requiredDates.length || requiredDates.some((date) => !restoredDates.has(date)))
    throw new Error(
      `Compiled research restore does not cover every extension session (${restoredDates.size}/${requiredDates.length})`,
    );
  const run = simulatePointInTimePortfolio(
    { metadata: manifest.datasetMetadata, sessions: restored },
    simulationOptions(
      v11StrategyOptions({
        startDate: window.start,
        endDate: window.end,
      }),
    ),
  );
  assertCompleteResearchWindow(run, calendar, window, "V11 forward extension");
  // This is a single predeclared rescue candidate assembled from two V11
  // sensitivities that existed before this extension was evaluated: a slower
  // ten-session rebalance/fifteen-session hold and confirmed entry timing.
  // It is not a grid search and cannot rewrite the frozen V11 result.
  const rescueParameters = {
    rankedRebalanceSessions: 10,
    rankedMinimumHoldSessions: 15,
    minimumQualifiedSessions: 2,
    requireEntryTimingPass: true,
  };
  const rescueRun = simulatePointInTimePortfolio(
    { metadata: manifest.datasetMetadata, sessions: restored },
    simulationOptions(
      v11StrategyOptions({
        ...rescueParameters,
        thesisId: "v11r-confirmed-slow-cycle",
        thesisLabel: "Confirmed lower-turnover momentum leadership",
        startDate: window.start,
        endDate: window.end,
      }),
    ),
  );
  assertCompleteResearchWindow(
    rescueRun,
    calendar,
    window,
    "V11R forward candidate",
  );
  const diagnosticDefinitions = [
    {
      id: "momentum-only",
      label: "Momentum only",
      overrides: { researchRankMode: "momentum-only" },
    },
    {
      id: "quality-only",
      label: "Quality only",
      overrides: { researchRankMode: "quality-only" },
    },
    {
      id: "balanced-quality-momentum",
      label: "Balanced quality and momentum",
      overrides: { researchRankMode: "quality-momentum-leadership" },
    },
    {
      id: "entry-disciplined-momentum",
      label: "Entry-disciplined momentum",
      overrides: {
        researchRankMode: "momentum-first-entry-disciplined-blend",
        requireEntryTimingPass: true,
      },
    },
    {
      id: "transparent-bull-pullback",
      label: "Transparent bull-cycle pullback",
      overrides: {
        researchRankMode: "bull-cycle-pullback-control",
        requireTrendAlignment: true,
        requireEntryTimingPass: true,
        allowedBenchmarkRegimes: ["bullish"],
      },
    },
    {
      id: "adaptive-quality-momentum",
      label: "Causal momentum-breadth adaptive quality/momentum",
      overrides: { researchRankMode: "adaptive-quality-momentum" },
    },
    {
      id: "quality-confirmed-entry",
      label: "Quality leadership with confirmed entry",
      overrides: {
        researchRankMode: "quality-only",
        requireEntryTimingPass: true,
      },
    },
    {
      id: "quality-confirmed-slow-cycle",
      label: "Quality leadership with confirmed entry and slower rotation",
      overrides: {
        researchRankMode: "quality-only",
        requireEntryTimingPass: true,
        minimumQualifiedSessions: 2,
        rankedRebalanceSessions: 10,
        rankedMinimumHoldSessions: 15,
      },
    },
  ];
  const diagnostics = diagnosticDefinitions.map((definition) => {
    const diagnosticRun = simulatePointInTimePortfolio(
      { metadata: manifest.datasetMetadata, sessions: restored },
      simulationOptions(
        v11StrategyOptions({
          ...definition.overrides,
          thesisId: `v11-forward-diagnostic-${definition.id}`,
          thesisLabel: definition.label,
          startDate: window.start,
          endDate: window.end,
        }),
      ),
    );
    assertCompleteResearchWindow(
      diagnosticRun,
      calendar,
      window,
      `V11 ${definition.label} diagnostic`,
    );
    return {
      id: definition.id,
      label: definition.label,
      overrides: definition.overrides,
      metrics: boundedReviewExperimentSummary(diagnosticRun),
    };
  });
  const metrics = run?.metrics || {};
  const spy = metrics.benchmarkComparisons?.SPY || {};
  const qqq = metrics.benchmarkComparisons?.QQQ || {};
  const report = {
    version: V11_FORWARD_EXTENSION_REPORT_VERSION,
    status: "complete",
    completedAt: new Date().toISOString(),
    thesis: "Frozen V11 momentum-dominant quality leadership blend",
    thesisChanged: false,
    productionChanged: false,
    window,
    sessions: run?.curve?.length || 0,
    metrics: {
      totalReturnPct: number(metrics.totalReturnPct),
      sharpe: number(metrics.sharpe),
      maxDrawdownPct: number(metrics.maxDrawdownPct),
      profitFactor: number(metrics.profitFactor),
      expectancyPct: number(metrics.tradeDiagnostics?.expectancyPct),
      closedTrades: number(metrics.closedTrades, 0),
      averageActiveExposurePct: number(metrics.averageActiveExposurePct),
      annualizedTurnoverPct: number(metrics.annualizedTurnoverPct),
      benchmarks: {
        SPY: {
          simpleReturnPct: number(spy.simpleReturnPct),
          simpleDifferencePct: number(spy.excessReturnPct),
          exposureMatchedReturnPct: number(spy.exposureMatchedReturnPct),
          exposureMatchedAlphaPct: number(spy.exposureMatchedAlphaPct),
        },
        QQQ: {
          simpleReturnPct: number(qqq.simpleReturnPct),
          simpleDifferencePct: number(qqq.excessReturnPct),
          exposureMatchedReturnPct: number(qqq.exposureMatchedReturnPct),
          exposureMatchedAlphaPct: number(qqq.exposureMatchedAlphaPct),
        },
      },
    },
    rescueCandidate: (() => {
      const summary = boundedReviewExperimentSummary(rescueRun);
      const checks = {
        completeReplay: rescueRun?.curve?.length === run?.curve?.length,
        positiveReturn: summary.totalReturnPct > 0,
        beatsSpy: summary.simpleDifferenceVsSpyPct > 0,
        beatsQqq: summary.simpleDifferenceVsQqqPct > 0,
        positiveExpectancy: summary.expectancyPct > 0,
        profitFactorAboveOne: summary.profitFactor > 1,
        drawdownImproved:
          Math.abs(summary.maxDrawdownPct) <
          Math.abs(number(metrics.maxDrawdownPct)),
        turnoverReduced:
          summary.annualizedTurnoverPct <
          number(metrics.annualizedTurnoverPct),
        minimumClosedTrades: summary.closedTrades >= 8,
      };
      return {
        thesisId: "v11r-confirmed-slow-cycle",
        thesis: "Confirmed lower-turnover momentum leadership",
        parameters: rescueParameters,
        selectionPolicy: "single-predeclared-candidate-no-selector",
        metrics: summary,
        checks,
        limitedPilotEligible: Object.values(checks).every(Boolean),
      };
    })(),
    componentDiagnostics: {
      selectionPolicy: "fixed-control-set-no-automatic-promotion",
      productionChanged: false,
      diagnostics,
    },
    evidenceAssessment: {
      chronologicallySubsequentToAudit: true,
      frozenPolicy: true,
      independentlySelectedHoldout: false,
      eligibleForAlphaClaim: false,
      reason:
        "This is a short post-audit extension of a post-selected thesis. The single rescue candidate is a rapid diagnostic, not independently sealed validation.",
    },
    limitations: [
      "The extension is short and contains too few market regimes for a durable performance conclusion.",
      "The cohort is the frozen current-survivor research universe, not point-in-time index membership.",
      "Delisted securities and complete delisting returns are unavailable.",
      "Fundamentals are not revision-safe and historical material-news coverage is unavailable.",
      "The V11 thesis was selected after reviewing earlier diagnostics, so this extension cannot erase that post-selection risk.",
    ],
  };
  await persistPrivateJson(V11_FORWARD_EXTENSION_STORE, report);
  return report;
}

async function fetchStatementHistory(
  client,
  symbols,
  startYear,
  endYear,
  {
    initial = null,
    onCheckpoint = null,
    maxSymbols = STATEMENT_SYMBOLS_PER_RUN,
  } = {},
) {
  const output = {
    incomeRows: [...asArray(initial?.incomeRows)],
    balanceRows: [...asArray(initial?.balanceRows)],
    cashFlowRows: [...asArray(initial?.cashFlowRows)],
    completedSymbols: [...asArray(initial?.completedSymbols)],
    exhaustedSymbols: [...asArray(initial?.exhaustedSymbols)],
    failures: [...asArray(initial?.failures)],
    attempts: { ...(initial?.attempts || {}) },
  };
  const endpoints = [
    ["income-statement", "incomeRows"],
    ["balance-sheet-statement", "balanceRows"],
    ["cash-flow-statement", "cashFlowRows"],
  ];
  const completed = new Set(output.completedSymbols.map(symbolOf));
  const exhausted = new Set(output.exhaustedSymbols.map(symbolOf));
  const pending = symbols.filter(
    (symbol) => !completed.has(symbol) && !exhausted.has(symbol),
  );
  const scheduled = pending.slice(0, maxSymbols);
  const limit = String(
    Math.min(40, Math.max(28, (endYear - startYear + 1) * 4)),
  );
  for (let offset = 0; offset < scheduled.length; offset += 12) {
    const batch = scheduled.slice(offset, offset + 12);
    const results = await mapLimited(batch, 3, async (symbol) => {
      const collected = { symbol };
      for (const [path, key] of endpoints) {
        const rows = await client.fetchStable(
          path,
          { symbol: fmpSymbol(symbol), period: "quarter", limit },
          { allowEmpty: true },
        );
        collected[key] = rows.filter((row) => {
          const year =
            number(row.calendarYear) ??
            number(String(row.date || "").slice(0, 4));
          return (
            symbolOf(row) === symbol && year >= startYear && year <= endYear
          );
        });
      }
      return collected;
    });
    for (let index = 0; index < results.length; index++) {
      const symbol = batch[index];
      const result = results[index];
      if (result?.error) {
        output.attempts[symbol] = number(output.attempts[symbol], 0) + 1;
        output.failures = output.failures.filter(
          (failure) => symbolOf(failure?.symbol || failure?.item) !== symbol,
        );
        output.failures.push({
          symbol,
          attempt: output.attempts[symbol],
          error: result.error,
        });
        if (output.attempts[symbol] >= 2) exhausted.add(symbol);
        continue;
      }
      output.incomeRows.push(...asArray(result.incomeRows));
      output.balanceRows.push(...asArray(result.balanceRows));
      output.cashFlowRows.push(...asArray(result.cashFlowRows));
      completed.add(symbol);
      exhausted.delete(symbol);
      output.failures = output.failures.filter(
        (failure) => symbolOf(failure?.symbol || failure?.item) !== symbol,
      );
    }
    output.completedSymbols = [...completed];
    output.exhaustedSymbols = [...exhausted];
    if (onCheckpoint) await onCheckpoint(output);
  }
  output.remainingSymbols = symbols.filter(
    (symbol) => !completed.has(symbol) && !exhausted.has(symbol),
  );
  return output;
}

async function fetchPriceHistory(
  client,
  contract,
  symbols,
  from,
  to,
  {
    initial = null,
    onCheckpoint = null,
    maxSymbols = PRICE_SYMBOLS_PER_RUN,
  } = {},
) {
  const histories = new Map(Object.entries(initial?.histories || {}));
  const completed = new Set(
    asArray(initial?.completedSymbols).length
      ? asArray(initial.completedSymbols).map(symbolOf)
      : [...histories.keys()].map(symbolOf),
  );
  const exhausted = new Set(asArray(initial?.exhaustedSymbols).map(symbolOf));
  const attempts = { ...(initial?.attempts || {}) };
  let failures = [...asArray(initial?.priceFailures)];
  const pending = symbols.filter(
    (symbol) => !completed.has(symbol) && !exhausted.has(symbol),
  );
  const scheduled = pending.slice(0, maxSymbols);

  const checkpoint = async () => {
    const output = {
      histories: Object.fromEntries(histories),
      completedSymbols: [...completed],
      exhaustedSymbols: [...exhausted],
      attempts,
      priceFailures: failures,
      remainingSymbols: symbols.filter(
        (symbol) => !completed.has(symbol) && !exhausted.has(symbol),
      ),
    };
    if (onCheckpoint) await onCheckpoint(output);
    return output;
  };

  for (let offset = 0; offset < scheduled.length; offset += 15) {
    const batch = scheduled.slice(offset, offset + 15);
    const results = await mapLimited(
      batch,
      PRICE_HISTORY_CONCURRENCY,
      async (symbol) => {
        const rows = await client.fetchStable(contract.path, {
          symbol: fmpSymbol(symbol),
          from,
          to,
        });
        return {
          symbol,
          bars: normalizeHistoricalBars(rows, {
            sourceAdjusted: contract.sourceAdjusted,
          }),
        };
      },
    );
    for (let index = 0; index < results.length; index++) {
      const symbol = batch[index];
      const result = results[index];
      if (result?.bars?.length) {
        histories.set(symbol, result.bars);
        completed.add(symbol);
        exhausted.delete(symbol);
        failures = failures.filter(
          (failure) => symbolOf(failure?.symbol || failure?.item) !== symbol,
        );
        continue;
      }
      attempts[symbol] = number(attempts[symbol], 0) + 1;
      failures = failures.filter(
        (failure) => symbolOf(failure?.symbol || failure?.item) !== symbol,
      );
      failures.push({
        symbol,
        attempt: attempts[symbol],
        error: result?.error || "No adjusted price history returned",
      });
      // One retry on a later invocation distinguishes a temporary feed failure
      // from a genuinely unavailable history without blocking the entire cohort.
      if (attempts[symbol] >= 2) exhausted.add(symbol);
    }
    await checkpoint();
  }
  return checkpoint();
}

function rawDatasetFromHistory({ profiles, histories, fundamentals }) {
  const spy = histories.get("SPY") || [];
  const indexedHistories = new Map(
    [...histories].map(([symbol, bars]) => [
      symbol,
      new Map(bars.map((bar) => [bar.date, bar])),
    ]),
  );
  const sessions = spy.map((benchmarkBar) => {
    const date = benchmarkBar.date;
    const prices = [];
    for (const [symbol, bars] of indexedHistories) {
      const bar = bars.get(date);
      if (bar) prices.push({ ...bar, symbol });
    }
    const decisionAt = `${date}T20:00:00.000Z`;
    return {
      date,
      decisionAt,
      marketAvailableAt: decisionAt,
      fundamentalCoverageAsOf: decisionAt,
      // Actual as-known material-news coverage is not available in this
      // diagnostic. Fresh-capital event checks are treated as mechanically
      // passed and the report is explicitly barred from capital claims.
      eventCoverageAsOf: decisionAt,
      eventHistoryComplete: false,
      prices,
      corporateActions: [],
    };
  });
  return {
    metadata: {
      pointInTime: false,
      survivorshipBiasFree: false,
      universeMembershipPointInTime: false,
      delistedSecuritiesIncluded: false,
      delistingReturnsComplete: false,
      corporateActionsAdjusted: [...histories.values()].every((bars) =>
        bars.every((bar) => bar.adjusted === true),
      ),
      fundamentalsPointInTime: true,
      fundamentalValuesRevisionSafe: false,
      eventRiskPointInTime: false,
      materialNewsHistoryComplete: false,
      dataVendorEntitlementsVerified: true,
      benchmarkSymbol: "SPY",
      comparisonSymbols: ["SPY", "QQQ"],
      source: "FMP Ultimate provisional current-cohort diagnostic",
    },
    securities: profiles,
    fundamentals,
    events: [],
    sessions,
  };
}

function pointInTimeSp500RawDatasetFromHistory({
  blueprint,
  profiles,
  histories,
  fundamentals,
}) {
  const privateBlueprint = blueprint.privateBlueprint || {};
  const changes = asArray(privateBlueprint.changes)
    .map((row) => ({
      date: String(row.date || "").slice(0, 10),
      addedSymbol: pointInTimeSecuritySymbol(row.addedSymbol),
      removedSymbol: pointInTimeSecuritySymbol(row.removedSymbol),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const profileSymbols = new Set(profiles.map(pointInTimeSecuritySymbol));
  const delistedDates = Object.fromEntries(
    Object.entries(privateBlueprint.delistedDates || {})
      .map(([symbol, date]) => [
        pointInTimeSecuritySymbol(symbol),
        String(date || "").slice(0, 10),
      ])
      .filter(
        ([symbol, date]) =>
          profileSymbols.has(symbol) && /^\d{4}-\d{2}-\d{2}$/.test(date),
      ),
  );
  const spy = histories.get("SPY") || [];
  const sessionDates = spy.map((bar) => bar.date);
  const canonicalHistories = new Map();
  for (const [rawSymbol, bars] of histories) {
    const canonicalSymbol = pointInTimeSecuritySymbol(rawSymbol);
    if (
      !canonicalHistories.has(canonicalSymbol) ||
      symbolOf(rawSymbol) === canonicalSymbol
    )
      canonicalHistories.set(canonicalSymbol, bars);
  }
  const indexedHistories = new Map(
    [...canonicalHistories].map(([symbol, bars]) => [
      symbol,
      new Map(bars.map((bar) => [bar.date, bar])),
    ]),
  );
  const delistingActionsByDate = new Map();
  const delistedUniverseSymbols = [];
  for (const [symbol, delistedAt] of Object.entries(delistedDates)) {
    if (
      delistedAt < blueprint.fromDate ||
      delistedAt > blueprint.throughDate
    )
      continue;
    delistedUniverseSymbols.push(symbol);
    // A weekend/holiday delisting is realized on the first subsequent market
    // session. Zero recovery is deliberately conservative when the provider
    // supplies no cash/merger value; it can depress results but cannot juice them.
    const actionDate = sessionDates.find((date) => date >= delistedAt);
    if (!actionDate) continue;
    if (!delistingActionsByDate.has(actionDate))
      delistingActionsByDate.set(actionDate, []);
    delistingActionsByDate.get(actionDate).push({
      symbol,
      type: "delisting",
      valuePerShare: 0,
      treatment: "conservative-zero-recovery",
    });
  }
  const members = new Set(
    asArray(privateBlueprint.initialSymbols)
      .map(pointInTimeSecuritySymbol)
      .filter(Boolean),
  );
  let changeIndex = 0;
  let requestedMembershipObservations = 0;
  let availableMembershipObservations = 0;
  const sessions = spy.map((benchmarkBar) => {
    const date = benchmarkBar.date;
    // Apply a dated change only after that date's close. This conservative
    // convention prevents same-day index announcements from leaking into the
    // decision made on that session.
    while (changeIndex < changes.length && changes[changeIndex].date < date) {
      const change = changes[changeIndex++];
      if (change.removedSymbol) members.delete(change.removedSymbol);
      if (change.addedSymbol) members.add(change.addedSymbol);
    }
    const universeSymbols = [...members].sort();
    requestedMembershipObservations += universeSymbols.length;
    availableMembershipObservations += universeSymbols.filter((symbol) =>
      profileSymbols.has(symbol),
    ).length;
    const prices = [];
    for (const [symbol, bars] of indexedHistories) {
      const bar = bars.get(date);
      if (bar) prices.push({ ...bar, symbol });
    }
    const decisionAt = `${date}T20:00:00.000Z`;
    return {
      date,
      decisionAt,
      marketAvailableAt: decisionAt,
      fundamentalCoverageAsOf: decisionAt,
      eventCoverageAsOf: decisionAt,
      eventHistoryComplete: false,
      universeSymbols,
      prices,
      corporateActions: delistingActionsByDate.get(date) || [],
    };
  });
  const delistingEventsComplete = delistedUniverseSymbols.every((symbol) =>
    [...delistingActionsByDate.values()]
      .flat()
      .some((action) => action.symbol === symbol),
  );
  const membershipObservationCoveragePct = requestedMembershipObservations
    ? Math.round(
        (availableMembershipObservations / requestedMembershipObservations) *
          10_000,
      ) / 100
    : 0;
  return {
    metadata: {
      pointInTime: true,
      // Point-in-time membership is known, but the stronger survivorship-free
      // label remains false unless every required member has usable history.
      survivorshipBiasFree: membershipObservationCoveragePct === 100,
      universeMembershipPointInTime: true,
      delistedSecuritiesIncluded: delistedUniverseSymbols.length > 0,
      delistingReturnsComplete: delistingEventsComplete,
      corporateActionsAdjusted: [...histories.values()].every((bars) =>
        bars.every((bar) => bar.adjusted === true),
      ),
      fundamentalsPointInTime: true,
      fundamentalValuesRevisionSafe: false,
      eventRiskPointInTime: false,
      materialNewsHistoryComplete: false,
      dataVendorEntitlementsVerified: true,
      benchmarkSymbol: "SPY",
      comparisonSymbols: ["SPY", "QQQ"],
      source: "FMP historical S&P 500 membership research dataset",
      membershipEffectiveConvention: "next-session-after-change-date",
      securityIdentityContract: POINT_IN_TIME_SECURITY_IDENTITY_CONTRACT,
      canonicalTickerAliases: { ...POINT_IN_TIME_SECURITY_ALIASES },
      membershipObservationCoveragePct,
      delistingTreatment: "conservative-zero-recovery-when-value-unavailable",
    },
    securities: profiles,
    fundamentals,
    events: [],
    sessions,
  };
}

async function compilePointInTimeSp500Dataset({
  blueprint,
  histories,
  statementHistory,
  symbols,
  usableSymbols,
  startedAt,
  limitations,
  priceContract,
}) {
  const discovery = await getFullMarketDiscovery({ refreshIfStale: false });
  const discoveryRows = [
    ...asArray(discovery?.researchUniverse),
    ...asArray(discovery?.candidates),
  ];
  const discoveryBySymbol = new Map();
  for (const row of discoveryRows) {
    const rawSymbol = symbolOf(row);
    const canonicalSymbol = pointInTimeSecuritySymbol(rawSymbol);
    if (
      !discoveryBySymbol.has(canonicalSymbol) ||
      rawSymbol === canonicalSymbol
    )
      discoveryBySymbol.set(canonicalSymbol, row);
  }
  const delistedDates = blueprint.privateBlueprint?.delistedDates || {};
  const canonicalSymbols = [
    ...new Set(symbols.map(pointInTimeSecuritySymbol).filter(Boolean)),
  ];
  const canonicalUsableSymbols = [
    ...new Set(usableSymbols.map(pointInTimeSecuritySymbol).filter(Boolean)),
  ];
  const usableSet = new Set(canonicalUsableSymbols);
  const canonicalHistories = new Map();
  for (const [rawSymbol, bars] of histories) {
    const canonicalSymbol = pointInTimeSecuritySymbol(rawSymbol);
    if (
      !canonicalHistories.has(canonicalSymbol) ||
      symbolOf(rawSymbol) === canonicalSymbol
    )
      canonicalHistories.set(canonicalSymbol, bars);
  }
  const profiles = canonicalUsableSymbols.map((symbol) => {
    const source = discoveryBySymbol.get(symbol) || {};
    const history = canonicalHistories.get(symbol) || [];
    const delistedAt = String(
      delistedDates[symbol] ||
        Object.entries(delistedDates).find(
          ([candidate]) => pointInTimeSecuritySymbol(candidate) === symbol,
        )?.[1] ||
        "",
    ).slice(0, 10);
    return {
      ...source,
      symbol,
      name: source.name || source.companyName || symbol,
      companyName: source.companyName || source.name || symbol,
      sector: source.sector || source.primaryTheme || "Other",
      listedAt: history[0]?.date || blueprint.fromDate,
      delistedAt: /^\d{4}-\d{2}-\d{2}$/.test(delistedAt)
        ? delistedAt
        : null,
      isEtf: false,
      isFund: false,
    };
  });
  const fundamentals = buildHistoricalFundamentalRows(statementHistory)
    .map((row) => {
      const symbol = pointInTimeSecuritySymbol(row);
      return { ...row, symbol, ticker: symbol };
    })
    .filter((row) => usableSet.has(symbolOf(row)));
  const finalHistories = new Map(
    [...canonicalHistories].filter(
      ([symbol]) => usableSet.has(symbol) || ["SPY", "QQQ"].includes(symbol),
    ),
  );
  const rawDataset = pointInTimeSp500RawDatasetFromHistory({
    blueprint,
    profiles,
    histories: finalHistories,
    fundamentals,
  });
  const sessionDates = rawDataset.sessions.map((session) => session.date);
  const compiledSignature = JSON.stringify({
    schema: 1,
    compilerContract: POINT_IN_TIME_SP500_COMPILER_CONTRACT,
    securityIdentityContract: POINT_IN_TIME_SECURITY_IDENTITY_CONTRACT,
    fromDate: blueprint.fromDate,
    endDate: blueprint.throughDate,
    membershipChanges: number(blueprint.normalizedMembershipChanges, 0),
    requestedSymbols: canonicalSymbols.slice().sort(),
    usableSymbols: canonicalUsableSymbols.slice().sort(),
    rawSessions: sessionDates.length,
    firstRawSession: sessionDates[0] || null,
    lastRawSession: sessionDates.at(-1) || null,
  });
  const savedCompiled = await readPrivateJson(
    POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE,
  ).catch(() => null);
  const savedChunks = asArray(savedCompiled?.chunks);
  let expectedChunkStart = 0;
  const chunkManifestValid = savedChunks.every((chunk) => {
    const start = number(chunk?.start, -1);
    const end = number(chunk?.end, -1);
    const valid =
      start === expectedChunkStart &&
      end > start &&
      typeof chunk?.pathname === "string" &&
      chunk.pathname.startsWith(
        `${POINT_IN_TIME_SP500_COMPILED_CHUNK_PREFIX}/`,
      );
    if (valid) expectedChunkStart = end;
    return valid;
  });
  const savedCompiledMatches = Boolean(
    savedCompiled?.schema === 1 &&
      savedCompiled?.signature === compiledSignature &&
      chunkManifestValid &&
      number(savedCompiled?.completedSessions, -1) === expectedChunkStart,
  );
  const compiledCacheHit = Boolean(
    savedCompiledMatches &&
      savedCompiled?.complete === true &&
      expectedChunkStart === sessionDates.length,
  );
  const coverage = {
    membershipUnionSymbols: canonicalSymbols.length,
    priceUsableSymbols: canonicalUsableSymbols.length,
    fundamentalVerifiedSymbols: new Set(
      fundamentals
        .filter((row) => row.fundamentalDataVerified === true)
        .map((row) => symbolOf(row)),
    ).size,
    membershipChanges: number(blueprint.normalizedMembershipChanges, 0),
    removedSymbols: number(blueprint.removedSymbols, 0),
    delistedRemovedSymbolsMatched: number(
      blueprint.delistedRemovedSymbolsMatched,
      0,
    ),
    membershipObservationCoveragePct:
      rawDataset.metadata.membershipObservationCoveragePct,
    compiledSessions: compiledCacheHit
      ? sessionDates.length
      : savedCompiledMatches
        ? expectedChunkStart
        : 0,
    totalSessions: sessionDates.length,
  };
  const compilationLimitations = [
    ...limitations,
    "Delistings without a supplied cash or merger value are assigned zero recovery, a conservative convention that may understate returns.",
    "An S&P membership change becomes effective for this research dataset on the next session after its dated change, preventing same-session leakage.",
    "Ticker aliases are canonicalized to a permanent issuer symbol so a rename cannot create two simultaneous securities or an artificial portfolio exit and re-entry.",
  ];
  if (compiledCacheHit) {
    const complete = {
      version: 1,
      status: "compiled",
      startedAt,
      updatedAt: new Date().toISOString(),
      completedAt: savedCompiled.completedAt || new Date().toISOString(),
      period: { from: blueprint.fromDate, through: blueprint.throughDate },
      progress: {
        stage: "compiled",
        compiledSessions: sessionDates.length,
        totalSessions: sessionDates.length,
        remainingSessions: 0,
        compiledChunks: savedChunks.length,
      },
      coverage: { ...coverage, compiledSessions: sessionDates.length },
      pointInTimeMembershipConstructed: true,
      productionChanged: false,
      eligibleForAlphaClaim: false,
      priceContract: {
        id: priceContract.id,
        adjustmentMethod: priceContract.adjustmentMethod,
      },
      nextStep:
        "Run frozen factor/lifecycle controls and matched placebo diagnostics on the membership-filtered dataset without changing production.",
      limitations: compilationLimitations,
    };
    await persistPrivateJson(
      POINT_IN_TIME_SP500_DATASET_STATUS_STORE,
      complete,
    );
    return pointInTimeSp500DatasetStatusSummary(complete);
  }

  const completedBefore = savedCompiledMatches ? expectedChunkStart : 0;
  const compilation = compilePointInTimeSignals(rawDataset, {
    liquidity: { maxCandidates: 500 },
    maxSessions: POINT_IN_TIME_SP500_COMPILE_SESSIONS_PER_RUN,
    resume: savedCompiledMatches
      ? {
          sessions: [],
          completedSessions:
            savedCompiled?.compilerCheckpoint?.completedSessions ??
            completedBefore,
          decisionMemory:
            savedCompiled?.compilerCheckpoint?.decisionMemory || [],
        }
      : null,
  });
  const { compilerProgress, compilerCheckpoint, ...compiledDataset } =
    compilation;
  const chunkEnd = compilerProgress.completedSessions;
  if (chunkEnd <= completedBefore)
    throw new Error("Point-in-time compilation did not advance");
  const chunkPath = `${POINT_IN_TIME_SP500_COMPILED_CHUNK_PREFIX}/${blueprint.fromDate}-${blueprint.throughDate}/${String(completedBefore).padStart(4, "0")}-${String(chunkEnd).padStart(4, "0")}.json.gz`;
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
  await persistPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE, {
    schema: 1,
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
    version: 1,
    status: compilerProgress.complete ? "compiled" : "collecting",
    startedAt,
    updatedAt: new Date().toISOString(),
    completedAt: compilerProgress.complete ? new Date().toISOString() : null,
    period: { from: blueprint.fromDate, through: blueprint.throughDate },
    progress: {
      stage: compilerProgress.complete ? "compiled" : "compiling",
      compiledSessions: chunkEnd,
      totalSessions: compilerProgress.totalSessions,
      remainingSessions: compilerProgress.remainingSessions,
      compiledChunks: chunks.length,
      lastChunkCompressedBytes: compressedBytes,
    },
    coverage: { ...coverage, compiledSessions: chunkEnd },
    pointInTimeMembershipConstructed: true,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    priceContract: {
      id: priceContract.id,
      adjustmentMethod: priceContract.adjustmentMethod,
    },
    nextStep: compilerProgress.complete
      ? "Run frozen factor/lifecycle controls and matched placebo diagnostics on the membership-filtered dataset without changing production."
      : "Continue bounded membership-filtered signal compilation.",
    limitations: compilationLimitations,
  };
  await persistPrivateJson(
    POINT_IN_TIME_SP500_DATASET_STATUS_STORE,
    collecting,
  );
  return pointInTimeSp500DatasetStatusSummary(collecting);
}

function pointInTimeSp500AlphaCandidateDefinitions() {
  const balancedWeights = {
    momentum: 0.18,
    longMomentum: 0.28,
    mediumMomentum: 0.23,
    shortMomentum: 0.07,
    veryShortMomentum: -0.03,
    relativeStrength: 0.16,
    stability: 0.06,
    lowVolatility: 0.04,
    technical: 0.03,
    pullback: 0.03,
    liquidity: 0.02,
  };
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 20_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: true,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "multi-horizon-price-alpha",
    rankedRebalanceSessions: 10,
    rankedTargetCount: 12,
    rankedExitBuffer: 18,
    rankedMinimumHoldSessions: 15,
    rankedEntryQueueCount: 36,
    minimumQualifiedSessions: 1,
    buyTargetPct: 0.08,
    strongBuyTargetPct: 0.08,
    buyMaxPositionPct: 0.085,
    strongBuyMaxPositionPct: 0.085,
    maxPositions: 12,
    minimumInitialStopPct: 18,
    maximumInitialStopPct: 18,
    maxSectorPositions: 4,
    maxSectorPct: 0.34,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 126,
    timeStopMaxReturnPct: 1_000,
    baseRankWeight: 0,
  };
  const candidate = (id, label, weights, overrides = {}) => ({
    id,
    label,
    weights,
    overrides: {
      ...common,
      priceAlphaWeights: weights,
      ...overrides,
    },
  });
  return [
    candidate(
      "balanced-biweekly-12",
      "Balanced multi-horizon leadership, biweekly, 12 holdings",
      balancedWeights,
    ),
    candidate(
      "balanced-monthly-12",
      "Balanced multi-horizon leadership, monthly, 12 holdings",
      balancedWeights,
      { rankedRebalanceSessions: 20, rankedMinimumHoldSessions: 20 },
    ),
    candidate(
      "balanced-biweekly-8",
      "Balanced multi-horizon leadership, biweekly, 8 holdings",
      balancedWeights,
      {
        rankedTargetCount: 8,
        rankedExitBuffer: 12,
        rankedEntryQueueCount: 24,
        maxPositions: 8,
        buyTargetPct: 0.12,
        strongBuyTargetPct: 0.12,
        buyMaxPositionPct: 0.125,
        strongBuyMaxPositionPct: 0.125,
        maxSectorPositions: 2,
        maxSectorPct: 0.28,
      },
    ),
    candidate(
      "balanced-monthly-16",
      "Balanced multi-horizon leadership, monthly, 16 holdings",
      balancedWeights,
      {
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        rankedTargetCount: 16,
        rankedExitBuffer: 24,
        rankedEntryQueueCount: 48,
        maxPositions: 16,
        buyTargetPct: 0.06,
        strongBuyTargetPct: 0.06,
        buyMaxPositionPct: 0.065,
        strongBuyMaxPositionPct: 0.065,
        maxSectorPositions: 5,
      },
    ),
    candidate(
      "long-horizon-monthly",
      "Long-horizon leadership, monthly",
      {
        momentum: 0.12,
        longMomentum: 0.42,
        mediumMomentum: 0.18,
        shortMomentum: 0,
        veryShortMomentum: -0.04,
        relativeStrength: 0.18,
        stability: 0.06,
        lowVolatility: 0.04,
        technical: 0,
        pullback: 0.02,
        liquidity: 0.02,
      },
      { rankedRebalanceSessions: 20, rankedMinimumHoldSessions: 20 },
    ),
    candidate(
      "medium-horizon-biweekly",
      "Medium-horizon leadership, biweekly",
      {
        momentum: 0.14,
        longMomentum: 0.18,
        mediumMomentum: 0.38,
        shortMomentum: 0.14,
        veryShortMomentum: -0.04,
        relativeStrength: 0.14,
        stability: 0.03,
        lowVolatility: 0.02,
        technical: 0.03,
        pullback: 0.03,
        liquidity: 0.01,
      },
    ),
    candidate(
      "risk-adjusted-monthly",
      "Risk-adjusted multi-horizon leadership, monthly",
      {
        momentum: 0.12,
        longMomentum: 0.22,
        mediumMomentum: 0.18,
        shortMomentum: 0.04,
        veryShortMomentum: -0.03,
        relativeStrength: 0.15,
        stability: 0.13,
        lowVolatility: 0.13,
        technical: 0.01,
        pullback: 0.02,
        liquidity: 0.03,
      },
      {
        rankedRebalanceSessions: 20,
        rankedMinimumHoldSessions: 20,
        maxVolatility60Pct: 55,
        volatilityTargetPct: 20,
        riskBudgetPct: 1,
      },
    ),
    candidate(
      "relative-strength-biweekly",
      "Benchmark-relative leadership, biweekly",
      {
        momentum: 0.1,
        longMomentum: 0.18,
        mediumMomentum: 0.16,
        shortMomentum: 0.04,
        veryShortMomentum: -0.03,
        relativeStrength: 0.36,
        stability: 0.05,
        lowVolatility: 0.05,
        technical: 0.02,
        pullback: 0.03,
        liquidity: 0.04,
      },
      { requireRelativeStrength: true },
    ),
    candidate(
      "trend-aligned-balanced",
      "Trend-aligned multi-horizon leadership",
      balancedWeights,
      { requireTrendAlignment: true },
    ),
    candidate(
      "confirmed-balanced",
      "Two-session confirmed multi-horizon leadership",
      balancedWeights,
      { minimumQualifiedSessions: 2 },
    ),
    candidate(
      "pullback-biweekly",
      "Established leaders on controlled pullbacks, biweekly",
      {
        momentum: 0.14,
        longMomentum: 0.26,
        mediumMomentum: 0.2,
        shortMomentum: -0.04,
        veryShortMomentum: -0.08,
        relativeStrength: 0.15,
        stability: 0.05,
        lowVolatility: 0.04,
        technical: 0.04,
        pullback: 0.15,
        liquidity: 0.03,
      },
      { requireEntryTimingPass: true },
    ),
    candidate(
      "acceleration-weekly",
      "Multi-horizon acceleration, weekly",
      {
        momentum: 0.13,
        longMomentum: 0.18,
        mediumMomentum: 0.25,
        shortMomentum: 0.22,
        veryShortMomentum: 0.05,
        relativeStrength: 0.13,
        stability: 0.02,
        lowVolatility: 0.01,
        technical: 0.06,
        pullback: 0.01,
        liquidity: 0.02,
      },
      {
        rankedRebalanceSessions: 5,
        rankedMinimumHoldSessions: 10,
        rankedExitBuffer: 16,
        maxReturn20Pct: 30,
        maxReturn60Ex5Pct: 100,
        maxReturn120Ex20Pct: 125,
        maxMomentumExtensionSigma: 3,
      },
    ),
  ];
}

function pointInTimeSp500AlphaV2Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 20_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: true,
    requireRelativeStrength: false,
    requireAnchoredGradualFactors: true,
    minimumResearchFactorCoverage: 0,
    // Nearness to a long-run high is part of the thesis, so the old generic
    // short-run chase flag cannot veto it. A 3% next-open gap limit and the
    // continuity/volume-shock rank components still reject discontinuous entry.
    blockChaseEntries: false,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "anchored-gradual-leadership",
    rankedRebalanceSessions: 20,
    rankedTargetCount: 10,
    rankedExitBuffer: 15,
    rankedMinimumHoldSessions: 20,
    rankedEntryQueueCount: 30,
    minimumQualifiedSessions: 2,
    buyTargetPct: 0.095,
    strongBuyTargetPct: 0.095,
    buyMaxPositionPct: 0.1,
    strongBuyMaxPositionPct: 0.1,
    maxPositions: 10,
    minimumInitialStopPct: 18,
    maximumInitialStopPct: 18,
    maxSectorPositions: 4,
    maxSectorPct: 0.4,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 126,
    timeStopMaxReturnPct: 1_000,
    baseRankWeight: 0,
  };
  const definition = (id, label, weights, overrides = {}) => ({
    id,
    label,
    weights,
    overrides: {
      ...common,
      anchoredGradualWeights: weights,
      ...overrides,
    },
  });
  const primary = definition(
    "anchored-gradual-leadership-monthly-10",
    "52-week anchored gradual leadership, monthly, 10 holdings",
    {
      anchor: 0.28,
      recency: 0.1,
      continuity: 0.22,
      intermediate: 0.15,
      relativeStrength: 0.14,
      drawdownResilience: 0.06,
      lowShockVolume: 0.03,
      liquidity: 0.02,
    },
  );
  const controls = [
    definition(
      "anchor-only-ablation",
      "52-week anchor-only ablation",
      {
        anchor: 0.6,
        recency: 0.2,
        continuity: 0,
        intermediate: 0.1,
        relativeStrength: 0.1,
        drawdownResilience: 0,
        lowShockVolume: 0,
        liquidity: 0,
      },
    ),
    definition(
      "continuity-only-ablation",
      "Gradual-information continuation ablation",
      {
        anchor: 0,
        recency: 0,
        continuity: 0.55,
        intermediate: 0.2,
        relativeStrength: 0.15,
        drawdownResilience: 0.1,
        lowShockVolume: 0,
        liquidity: 0,
      },
    ),
    {
      id: "v1-long-horizon-matched-lifecycle-control",
      label: "V1 long-horizon rank with V2 lifecycle",
      weights: {
        momentum: 0.12,
        longMomentum: 0.42,
        mediumMomentum: 0.18,
        shortMomentum: 0,
        veryShortMomentum: -0.04,
        relativeStrength: 0.18,
        stability: 0.06,
        lowVolatility: 0.04,
        technical: 0,
        pullback: 0.02,
        liquidity: 0.02,
      },
      overrides: {
        ...common,
        researchRankMode: "multi-horizon-price-alpha",
        priceAlphaWeights: {
          momentum: 0.12,
          longMomentum: 0.42,
          mediumMomentum: 0.18,
          shortMomentum: 0,
          veryShortMomentum: -0.04,
          relativeStrength: 0.18,
          stability: 0.06,
          lowVolatility: 0.04,
          technical: 0,
          pullback: 0.02,
          liquidity: 0.02,
        },
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR3Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 20_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    requireBenchmarkResidualFactors: true,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: false,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "benchmark-residual-momentum",
    rankedRebalanceSessions: 10,
    rankedTargetCount: 12,
    rankedExitBuffer: 18,
    rankedMinimumHoldSessions: 10,
    rankedEntryQueueCount: 36,
    minimumQualifiedSessions: 2,
    buyTargetPct: 0.0825,
    strongBuyTargetPct: 0.0825,
    buyMaxPositionPct: 0.085,
    strongBuyMaxPositionPct: 0.085,
    maxPositions: 12,
    minimumInitialStopPct: 18,
    maximumInitialStopPct: 18,
    maxSectorPositions: 4,
    maxSectorPct: 0.34,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 126,
    timeStopMaxReturnPct: 1_000,
    maxVolatility60Pct: 55,
    volatilityTargetPct: 18,
    riskBudgetPct: 1,
    baseRankWeight: 0,
  };
  const weights = Object.freeze({
    relative120: 0.35,
    relative60: 0.25,
    sectorAwareMomentum: 0.2,
    lowVolatility: 0.1,
    drawdownResilience: 0.07,
    controlledPullback: 0.03,
  });
  const primary = {
    id: "benchmark-residual-volatility-managed-10d-12",
    label:
      "Dual-benchmark residual leadership with volatility management, 10-session rebalance, 12 holdings",
    weights,
    overrides: { ...common, benchmarkResidualWeights: weights },
  };
  const controls = [
    {
      id: "simple-momentum-matched-r3-lifecycle",
      label: "Simple momentum with the matched R3 lifecycle",
      weights: { momentum: 1 },
      overrides: {
        ...common,
        requireBenchmarkResidualFactors: false,
        researchRankMode: "momentum-only",
      },
    },
    {
      id: "unmanaged-benchmark-residual-ablation",
      label: "Benchmark-residual rank without volatility management",
      weights,
      overrides: {
        ...common,
        benchmarkResidualWeights: weights,
        maxVolatility60Pct: null,
        volatilityTargetPct: null,
        riskBudgetPct: null,
      },
    },
    {
      id: "relative-only-ablation",
      label: "Dual-benchmark relative-return ablation",
      weights: {
        relative120: 0.58,
        relative60: 0.42,
        sectorAwareMomentum: 0,
        lowVolatility: 0,
        drawdownResilience: 0,
        controlledPullback: 0,
      },
      overrides: {
        ...common,
        benchmarkResidualWeights: {
          relative120: 0.58,
          relative60: 0.42,
          sectorAwareMomentum: 0,
          lowVolatility: 0,
          drawdownResilience: 0,
          controlledPullback: 0,
        },
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR4Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 50_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    requireShortTermReversalFactors: true,
    minAlpha120VsSpy: 0,
    minAlpha120VsQqq: 0,
    minReturn5Pct: -10,
    maxReturn5Pct: -1,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: true,
    maxEntryGapPct: 2,
    selectionMode: "ranked",
    researchRankMode: "conditional-short-term-reversal",
    rankedRebalanceSessions: 5,
    rankedTargetCount: 15,
    rankedExitBuffer: 20,
    rankedMinimumHoldSessions: 5,
    rankedEntryQueueCount: 45,
    minimumQualifiedSessions: 1,
    buyTargetPct: 0.066,
    strongBuyTargetPct: 0.066,
    buyMaxPositionPct: 0.068,
    strongBuyMaxPositionPct: 0.068,
    maxPositions: 15,
    minimumInitialStopPct: 10,
    maximumInitialStopPct: 10,
    maxSectorPositions: 4,
    maxSectorPct: 0.28,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 10,
    timeStopMaxReturnPct: 1_000,
    maxVolatility60Pct: 50,
    volatilityTargetPct: 16,
    riskBudgetPct: 0.8,
    baseRankWeight: 0,
  };
  const weights = Object.freeze({
    reversalPressure: 0.55,
    relativeTrend: 0.25,
    lowVolatility: 0.12,
    liquidity: 0.08,
  });
  const primary = {
    id: "liquidity-conditioned-reversal-5d-15",
    label:
      "Five-session liquidity-conditioned reversal inside dual-benchmark uptrends",
    weights,
    overrides: { ...common, shortTermReversalWeights: weights },
  };
  const controls = [
    {
      id: "random-matched-r4-lifecycle",
      label: "Random rank with the matched R4 lifecycle and entry filters",
      weights: { random: 1 },
      overrides: {
        ...common,
        researchRankMode: "random-placebo",
        researchRandomSeed: 0,
      },
    },
    {
      id: "unconditioned-reversal-ablation",
      label: "Short-term reversal without benchmark-relative trend conditioning",
      weights,
      overrides: {
        ...common,
        shortTermReversalWeights: weights,
        minAlpha120VsSpy: null,
        minAlpha120VsQqq: null,
      },
    },
    {
      id: "trend-only-r4-ablation",
      label: "Dual-benchmark trend without short-term reversal ranking",
      weights: {
        reversalPressure: 0,
        relativeTrend: 0.75,
        lowVolatility: 0.17,
        liquidity: 0.08,
      },
      overrides: {
        ...common,
        minReturn5Pct: null,
        maxReturn5Pct: null,
        shortTermReversalWeights: {
          reversalPressure: 0,
          relativeTrend: 0.75,
          lowVolatility: 0.17,
          liquidity: 0.08,
        },
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR5Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 30_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    requireIndustryLeadershipFactors: true,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: false,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "industry-leadership-momentum",
    rankedRebalanceSessions: 20,
    rankedTargetCount: 12,
    rankedExitBuffer: 18,
    rankedMinimumHoldSessions: 40,
    rankedEntryQueueCount: 36,
    minimumQualifiedSessions: 2,
    buyTargetPct: 0.0825,
    strongBuyTargetPct: 0.0825,
    buyMaxPositionPct: 0.085,
    strongBuyMaxPositionPct: 0.085,
    maxPositions: 12,
    minimumInitialStopPct: 18,
    maximumInitialStopPct: 18,
    maxSectorPositions: 5,
    maxSectorPct: 0.43,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 126,
    timeStopMaxReturnPct: 1_000,
    maxVolatility60Pct: 65,
    volatilityTargetPct: null,
    riskBudgetPct: null,
    baseRankWeight: 0,
  };
  const weights = Object.freeze({
    sectorTrend: 0.45,
    stockResidual: 0.25,
    withinSector: 0.15,
    continuity: 0.1,
    lowVolatility: 0.05,
  });
  const primary = {
    id: "industry-leadership-continuous-momentum-20d-12",
    label:
      "Industry leadership with continuous within-sector residual momentum",
    weights,
    overrides: { ...common, industryLeadershipWeights: weights },
  };
  const controls = [
    {
      id: "stock-residual-only-r5-control",
      label: "Stock residual momentum without industry leadership",
      weights: {
        sectorTrend: 0,
        stockResidual: 0.65,
        withinSector: 0.2,
        continuity: 0.1,
        lowVolatility: 0.05,
      },
      overrides: {
        ...common,
        industryLeadershipWeights: {
          sectorTrend: 0,
          stockResidual: 0.65,
          withinSector: 0.2,
          continuity: 0.1,
          lowVolatility: 0.05,
        },
      },
    },
    {
      id: "industry-only-r5-ablation",
      label: "Industry leadership without stock residual or continuity",
      weights: {
        sectorTrend: 0.85,
        stockResidual: 0,
        withinSector: 0.15,
        continuity: 0,
        lowVolatility: 0,
      },
      overrides: {
        ...common,
        industryLeadershipWeights: {
          sectorTrend: 0.85,
          stockResidual: 0,
          withinSector: 0.15,
          continuity: 0,
          lowVolatility: 0,
        },
      },
    },
    {
      id: "random-matched-r5-lifecycle",
      label: "Random rank with the matched fully invested R5 lifecycle",
      weights: { random: 1 },
      overrides: {
        ...common,
        researchRankMode: "random-placebo",
        researchRandomSeed: 0,
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR6Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 20_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    requireAttentionShockFactors: true,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: false,
    minRelativeVolume20: 1.5,
    minReturn5Pct: 0,
    maxReturn5Pct: 12,
    minDistanceFromYearHighPct: -5,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "attention-shock-breakout-continuation",
    rankedRebalanceSessions: 1,
    rankedTargetCount: 10,
    rankedExitBuffer: 15,
    rankedMinimumHoldSessions: 20,
    rankedEntryQueueCount: 30,
    minimumQualifiedSessions: 1,
    buyTargetPct: 0.095,
    strongBuyTargetPct: 0.095,
    buyMaxPositionPct: 0.1,
    strongBuyMaxPositionPct: 0.1,
    maxPositions: 10,
    minimumInitialStopPct: 12,
    maximumInitialStopPct: 12,
    maxSectorPositions: 3,
    maxSectorPct: 0.3,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 63,
    timeStopMaxReturnPct: 1_000,
    baseRankWeight: 0,
  };
  const weights = Object.freeze({
    activityShock: 0.4,
    breakoutProximity: 0.25,
    followthrough: 0.2,
    relativeStrength20: 0.15,
  });
  const primary = {
    id: "high-volume-near-high-continuation-20d-10",
    label:
      "High-volume attention shock near a 52-week high with 20-session continuation holding",
    weights,
    overrides: { ...common, attentionShockWeights: weights },
  };
  const controls = [
    {
      id: "simple-momentum-matched-r6-event-universe",
      label: "Simple momentum within the identical R6 event universe",
      weights: { momentum: 1 },
      overrides: { ...common, researchRankMode: "momentum-only" },
    },
    {
      id: "attention-shock-only-ablation",
      label: "High-volume attention shock without the near-high continuation gate",
      weights: { activityShock: 1 },
      overrides: {
        ...common,
        requireAttentionShockFactors: false,
        minReturn5Pct: null,
        maxReturn5Pct: null,
        minDistanceFromYearHighPct: null,
        researchRankMode: "attention-shock-only",
      },
    },
    {
      id: "breakout-followthrough-only-ablation",
      label: "Near-high five-session continuation without the volume shock",
      weights: { breakoutProximity: 0.6, followthrough: 0.4 },
      overrides: {
        ...common,
        requireAttentionShockFactors: false,
        minRelativeVolume20: null,
        researchRankMode: "breakout-followthrough-only",
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR7Definitions() {
  const common = {
    researchSignalSource: "price-only",
    independentLifecycle: true,
    ignoreSignalPositionActions: true,
    benchmarkSymbols: ["SPY", "QQQ"],
    benchmarkCompletionSymbol: null,
    liquidateAtEnd: true,
    requireLiquidityPass: true,
    minimumAverageDollarVolume: 30_000_000,
    minimumPrice: 5,
    requireEntryTimingPass: false,
    requireTrendAlignment: false,
    requireRelativeStrength: false,
    requireBenchmarkResidualFactors: true,
    minimumResearchFactorCoverage: 0,
    blockChaseEntries: false,
    maxEntryGapPct: 3,
    selectionMode: "ranked",
    researchRankMode: "benchmark-residual-momentum",
    rankedRebalanceSessions: 40,
    rankedTargetCount: 8,
    rankedExitBuffer: 14,
    rankedMinimumHoldSessions: 60,
    rankedEntryQueueCount: 24,
    minimumQualifiedSessions: 2,
    buyTargetPct: 0.12,
    strongBuyTargetPct: 0.12,
    buyMaxPositionPct: 0.125,
    strongBuyMaxPositionPct: 0.125,
    maxPositions: 8,
    minimumInitialStopPct: 22,
    maximumInitialStopPct: 22,
    maxSectorPositions: 5,
    maxSectorPct: 0.64,
    maxIssuerPositions: 1,
    classifyStopExits: true,
    ratchetRiskPlanStop: false,
    timeStopSessions: 252,
    timeStopMaxReturnPct: 1_000,
    maxVolatility60Pct: null,
    volatilityTargetPct: null,
    riskBudgetPct: null,
    baseRankWeight: 0,
  };
  const weights = Object.freeze({
    relative120: 0.85,
    relative60: 0,
    sectorAwareMomentum: 0,
    lowVolatility: 0,
    drawdownResilience: 0.15,
    controlledPullback: 0,
  });
  const primary = {
    id: "slow-dual-benchmark-residual-resilience-40d-8",
    label:
      "Slow 120-session dual-benchmark residual leadership with drawdown resilience",
    weights,
    overrides: { ...common, benchmarkResidualWeights: weights },
  };
  const controls = [
    {
      id: "absolute-momentum-matched-r7-lifecycle",
      label: "Absolute momentum with the identical slow R7 lifecycle",
      weights: { momentum: 1 },
      overrides: {
        ...common,
        requireBenchmarkResidualFactors: false,
        researchRankMode: "momentum-only",
      },
    },
    {
      id: "short-residual-matched-r7-lifecycle",
      label: "Shorter 60-session residual momentum under the R7 lifecycle",
      weights: {
        relative120: 0,
        relative60: 1,
        sectorAwareMomentum: 0,
        lowVolatility: 0,
        drawdownResilience: 0,
        controlledPullback: 0,
      },
      overrides: {
        ...common,
        benchmarkResidualWeights: {
          relative120: 0,
          relative60: 1,
          sectorAwareMomentum: 0,
          lowVolatility: 0,
          drawdownResilience: 0,
          controlledPullback: 0,
        },
      },
    },
    {
      id: "random-matched-r7-lifecycle",
      label: "Random rank with the identical slow R7 lifecycle",
      weights: { random: 1 },
      overrides: {
        ...common,
        requireBenchmarkResidualFactors: false,
        researchRankMode: "random-placebo",
        researchRandomSeed: 0,
      },
    },
  ];
  return { primary, controls };
}

function pointInTimeSp500AlphaR8BatchDefinitions() {
  const lifecycleVariants = [
    { id: "monthly-4", target: 4, rebalance: 20, hold: 20 },
    { id: "monthly-6", target: 6, rebalance: 20, hold: 40 },
    { id: "bimonthly-8", target: 8, rebalance: 40, hold: 40 },
  ];
  const factorVariants = [
    {
      id: "residual-120-resilience",
      label: "120-session dual-benchmark residual momentum",
      mode: "benchmark-residual-momentum",
      required: "requireBenchmarkResidualFactors",
      key: "benchmarkResidualWeights",
      weights: {
        relative120: 0.85,
        relative60: 0,
        sectorAwareMomentum: 0,
        lowVolatility: 0,
        drawdownResilience: 0.15,
        controlledPullback: 0,
      },
    },
    {
      id: "residual-balanced",
      label: "Blended 60/120-session dual-benchmark residual momentum",
      mode: "benchmark-residual-momentum",
      required: "requireBenchmarkResidualFactors",
      key: "benchmarkResidualWeights",
      weights: {
        relative120: 0.5,
        relative60: 0.4,
        sectorAwareMomentum: 0,
        lowVolatility: 0,
        drawdownResilience: 0.1,
        controlledPullback: 0,
      },
    },
    {
      id: "residual-60",
      label: "60-session dual-benchmark residual momentum",
      mode: "benchmark-residual-momentum",
      required: "requireBenchmarkResidualFactors",
      key: "benchmarkResidualWeights",
      weights: {
        relative120: 0,
        relative60: 0.9,
        sectorAwareMomentum: 0,
        lowVolatility: 0,
        drawdownResilience: 0.1,
        controlledPullback: 0,
      },
    },
    {
      id: "long-momentum",
      label: "Long-horizon absolute and benchmark-relative momentum",
      mode: "multi-horizon-price-alpha",
      key: "priceAlphaWeights",
      weights: {
        momentum: 0.1,
        longMomentum: 0.45,
        mediumMomentum: 0.12,
        shortMomentum: 0,
        veryShortMomentum: -0.05,
        relativeStrength: 0.3,
        stability: 0.03,
        lowVolatility: 0,
        technical: 0,
        pullback: 0.03,
        liquidity: 0.02,
      },
    },
    {
      id: "balanced-momentum",
      label: "Balanced multi-horizon price leadership",
      mode: "multi-horizon-price-alpha",
      key: "priceAlphaWeights",
      weights: {
        momentum: 0.12,
        longMomentum: 0.25,
        mediumMomentum: 0.25,
        shortMomentum: 0.08,
        veryShortMomentum: -0.04,
        relativeStrength: 0.25,
        stability: 0.03,
        lowVolatility: 0,
        technical: 0.02,
        pullback: 0.02,
        liquidity: 0.02,
      },
    },
    {
      id: "absolute-momentum",
      label: "Cross-sectional absolute momentum",
      mode: "momentum-only",
      key: "priceAlphaWeights",
      weights: { momentum: 1 },
    },
    {
      id: "anchored-continuity",
      label: "52-week-high anchored gradual leadership",
      mode: "anchored-gradual-leadership",
      required: "requireAnchoredGradualFactors",
      key: "anchoredGradualWeights",
      weights: {
        anchor: 0.25,
        recency: 0.08,
        continuity: 0.2,
        intermediate: 0.15,
        relativeStrength: 0.25,
        drawdownResilience: 0.05,
        lowShockVolume: 0,
        liquidity: 0.02,
      },
    },
  ];
  const definitions = [];
  for (const factor of factorVariants) {
    for (const lifecycle of lifecycleVariants) {
      const targetPct = 0.98 / lifecycle.target;
      const common = {
        researchSignalSource: "price-only",
        independentLifecycle: true,
        ignoreSignalPositionActions: true,
        benchmarkSymbols: ["SPY", "QQQ"],
        benchmarkCompletionSymbol: null,
        liquidateAtEnd: true,
        requireLiquidityPass: true,
        minimumAverageDollarVolume: 30_000_000,
        minimumPrice: 5,
        requireEntryTimingPass: false,
        requireTrendAlignment: false,
        requireRelativeStrength: false,
        minimumResearchFactorCoverage: 0,
        blockChaseEntries: false,
        maxEntryGapPct: 3,
        selectionMode: "ranked",
        researchRankMode: factor.mode,
        rankedRebalanceSessions: lifecycle.rebalance,
        rankedTargetCount: lifecycle.target,
        rankedExitBuffer: Math.ceil(lifecycle.target * 1.75),
        rankedMinimumHoldSessions: lifecycle.hold,
        rankedEntryQueueCount: lifecycle.target * 3,
        minimumQualifiedSessions: 1,
        buyTargetPct: targetPct,
        strongBuyTargetPct: targetPct,
        buyMaxPositionPct: 1 / lifecycle.target,
        strongBuyMaxPositionPct: 1 / lifecycle.target,
        maxPositions: lifecycle.target,
        minimumInitialStopPct: 22,
        maximumInitialStopPct: 22,
        maxSectorPositions: Math.max(3, Math.ceil(lifecycle.target * 0.75)),
        maxSectorPct: 0.75,
        maxIssuerPositions: 1,
        classifyStopExits: true,
        ratchetRiskPlanStop: false,
        timeStopSessions: 252,
        timeStopMaxReturnPct: 1_000,
        maxVolatility60Pct: null,
        volatilityTargetPct: null,
        riskBudgetPct: null,
        baseRankWeight: 0,
        [factor.key]: factor.weights,
      };
      if (factor.required) common[factor.required] = true;
      definitions.push({
        id: `r8-${factor.id}-${lifecycle.id}`,
        label: `${factor.label}, ${lifecycle.target} names, ${lifecycle.rebalance}-session rebalance`,
        family: factor.id,
        lifecycle: lifecycle.id,
        weights: factor.weights,
        overrides: common,
      });
    }
  }
  return definitions;
}

function pointInTimeSp500AlphaR9SizingDefinitions() {
  const allocations = [
    {
      id: "equal-6",
      label: "six-name equal weight",
      target: 6,
      weights: [0.1633, 0.1633, 0.1633, 0.1633, 0.1633, 0.1635],
    },
    {
      id: "moderate-6",
      label: "six-name moderate conviction decay",
      target: 6,
      weights: [0.28, 0.21, 0.16, 0.13, 0.11, 0.09],
    },
    {
      id: "top-heavy-6",
      label: "six-name top-heavy conviction decay",
      target: 6,
      weights: [0.36, 0.24, 0.15, 0.1, 0.07, 0.06],
    },
    {
      id: "equal-4",
      label: "four-name equal weight",
      target: 4,
      weights: [0.245, 0.245, 0.245, 0.245],
    },
    {
      id: "moderate-4",
      label: "four-name moderate conviction decay",
      target: 4,
      weights: [0.36, 0.27, 0.2, 0.15],
    },
    {
      id: "top-heavy-4",
      label: "four-name top-heavy conviction decay",
      target: 4,
      weights: [0.45, 0.28, 0.16, 0.09],
    },
  ];
  const stops = [10, 14, 18];
  const residualWeights = Object.freeze({
    relative120: 0.85,
    relative60: 0,
    sectorAwareMomentum: 0,
    lowVolatility: 0,
    drawdownResilience: 0.15,
    controlledPullback: 0,
  });
  const definitions = [];
  for (const allocation of allocations) {
    for (const stopPct of stops) {
      definitions.push({
        id: `r9-${allocation.id}-stop-${stopPct}`,
        label: `R8 residual leader, ${allocation.label}, ${stopPct}% replacement stop`,
        family: "residual-120-resilience",
        allocation: allocation.id,
        stopPct,
        weights: residualWeights,
        overrides: {
          researchSignalSource: "price-only",
          independentLifecycle: true,
          ignoreSignalPositionActions: true,
          benchmarkSymbols: ["SPY", "QQQ"],
          benchmarkCompletionSymbol: null,
          liquidateAtEnd: true,
          requireLiquidityPass: true,
          minimumAverageDollarVolume: 30_000_000,
          minimumPrice: 5,
          requireEntryTimingPass: false,
          requireTrendAlignment: false,
          requireRelativeStrength: false,
          requireBenchmarkResidualFactors: true,
          minimumResearchFactorCoverage: 0,
          blockChaseEntries: false,
          maxEntryGapPct: 3,
          selectionMode: "ranked",
          researchRankMode: "benchmark-residual-momentum",
          benchmarkResidualWeights: residualWeights,
          rankedRebalanceSessions: 20,
          rankedTargetCount: allocation.target,
          rankedTargetWeights: allocation.weights,
          rankedExitBuffer: Math.ceil(allocation.target * 1.75),
          rankedMinimumHoldSessions: 20,
          rankedEntryQueueCount: allocation.target,
          minimumQualifiedSessions: 1,
          buyTargetPct: 0.98 / allocation.target,
          strongBuyTargetPct: 0.98 / allocation.target,
          buyMaxPositionPct: Math.max(...allocation.weights),
          strongBuyMaxPositionPct: Math.max(...allocation.weights),
          buyMaxFactorPct: 1,
          strongBuyMaxFactorPct: 1,
          maxPositions: allocation.target,
          minimumInitialStopPct: stopPct,
          maximumInitialStopPct: stopPct,
          maxSectorPositions: allocation.target,
          maxSectorPct: 1,
          maxIssuerPositions: 1,
          classifyStopExits: true,
          ratchetRiskPlanStop: false,
          timeStopSessions: 252,
          timeStopMaxReturnPct: 1_000,
          maxVolatility60Pct: null,
          volatilityTargetPct: null,
          riskBudgetPct: null,
          baseRankWeight: 0,
        },
      });
    }
  }
  return definitions;
}

function minimumSimpleBenchmarkAlpha(summary = {}) {
  const spy = number(summary.simpleDifferenceVsSpyPct, -Infinity);
  const qqq = number(summary.simpleDifferenceVsQqqPct, -Infinity);
  return Math.min(spy, qqq);
}

function neweyWestMeanTStatistic(values = [], requestedLag = 5) {
  const observations = values.map(Number).filter(Number.isFinite);
  const count = observations.length;
  if (count < 20) return { observations: count, mean: null, tStatistic: null };
  const sampleMean = average(observations);
  const centered = observations.map((value) => value - sampleMean);
  const lag = Math.min(Math.max(0, Math.floor(requestedLag)), count - 1);
  let longRunVariance =
    centered.reduce((sum, value) => sum + value * value, 0) / count;
  for (let offset = 1; offset <= lag; offset++) {
    let covariance = 0;
    for (let index = offset; index < count; index++)
      covariance += centered[index] * centered[index - offset];
    covariance /= count;
    longRunVariance +=
      2 * (1 - offset / (lag + 1)) * covariance;
  }
  const standardError = Math.sqrt(
    Math.max(0, longRunVariance) / count,
  );
  return {
    observations: count,
    mean: roundMetric(sampleMean, 8),
    annualizedMeanPct: roundMetric(sampleMean * 252 * 100, 3),
    lag,
    tStatistic:
      standardError > 0
        ? roundMetric(sampleMean / standardError, 3)
        : null,
  };
}

function benchmarkExcessReturnStatistic(runs = [], symbol = "SPY") {
  const excessReturns = [];
  for (const run of runs) {
    const curve = asArray(run?.curve);
    const benchmarkByDate = new Map(
      asArray(run?.benchmarkCurves?.[symbol]).map((row) => [
        row.date,
        number(row.value),
      ]),
    );
    for (let index = 1; index < curve.length; index++) {
      const priorEquity = number(curve[index - 1]?.equity);
      const currentEquity = number(curve[index]?.equity);
      const priorBenchmark = benchmarkByDate.get(curve[index - 1]?.date);
      const currentBenchmark = benchmarkByDate.get(curve[index]?.date);
      if (
        !(priorEquity > 0) ||
        !(currentEquity > 0) ||
        !(priorBenchmark > 0) ||
        !(currentBenchmark > 0)
      )
        continue;
      excessReturns.push(
        currentEquity / priorEquity - currentBenchmark / priorBenchmark,
      );
    }
  }
  return { symbol, ...neweyWestMeanTStatistic(excessReturns, 5) };
}

async function restorePointInTimeSp500Window(manifest, calendar, window) {
  const startIndex = calendar.indexOf(window.start);
  const endIndex = calendar.indexOf(window.end);
  if (startIndex < 2 || endIndex < startIndex)
    throw new Error(
      `Frozen point-in-time window is unavailable: ${window.start} to ${window.end}`,
    );
  const restoreStart = startIndex - 2;
  const requiredChunks = asArray(manifest.chunks).filter(
    (chunk) =>
      number(chunk?.start, -1) <= endIndex &&
      number(chunk?.end, -1) > restoreStart,
  );
  const restored = [];
  for (const chunk of requiredChunks) {
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
    restored.push(...sessions);
  }
  const expectedDates = calendar.slice(restoreStart, endIndex + 1);
  const sessions = restored.filter(
    (session) =>
      session.date >= expectedDates[0] &&
      session.date <= expectedDates.at(-1),
  );
  if (!sameStringArray(sessions.map((session) => session.date), expectedDates))
    throw new Error(
      `Point-in-time restore is incomplete for ${window.start} to ${window.end}`,
    );
  return { metadata: manifest.datasetMetadata, sessions };
}

function compactPointInTimeAlphaMetricSummary(summary = {}) {
  const diagnostics = summary.rankRegimeDiagnostics;
  return {
    ...summary,
    rankRegimeDiagnostics: diagnostics
      ? {
          rebalanceObservations: number(
            diagnostics.rebalanceObservations,
            0,
          ),
          averageMomentumBreadthPct: number(
            diagnostics.averageMomentumBreadthPct,
          ),
          averageMedianMomentumPercentile: number(
            diagnostics.averageMedianMomentumPercentile,
          ),
        }
      : null,
  };
}

function compactPointInTimeAlphaPhase(phase = {}) {
  if (!phase || typeof phase !== "object") return phase;
  return {
    ...phase,
    aggregate: compactPointInTimeAlphaMetricSummary(phase.aggregate),
    windows: asArray(phase.windows).map((window) =>
      compactPointInTimeAlphaMetricSummary(window),
    ),
  };
}

function normalizePointInTimeAlphaReport(report, datasetStatus = null) {
  if (!report || report.status !== "complete") return report;
  const membershipObservationCoveragePct = number(
    report.dataQuality?.membershipObservationCoveragePct,
    number(datasetStatus?.coverage?.membershipObservationCoveragePct),
  );
  const checks = {
    ...(report.checks || {}),
    controls: {
      ...(report.checks?.controls || {}),
      pointInTimeMembershipCoverageComplete:
        membershipObservationCoveragePct === 100,
    },
  };
  const allHistoricalScreenGatesPassed = Object.values(checks).every(
    (group) =>
      group &&
      typeof group === "object" &&
      Object.values(group).every(Boolean),
  );
  return {
    ...report,
    responseSchema: 2,
    candidates: asArray(report.candidates).map((candidate) => ({
      ...candidate,
      development: compactPointInTimeAlphaPhase(candidate.development),
    })),
    selected: report.selected
      ? {
          ...report.selected,
          development: compactPointInTimeAlphaPhase(
            report.selected.development,
          ),
          validation: compactPointInTimeAlphaPhase(report.selected.validation),
          historicalAudit: compactPointInTimeAlphaPhase(
            report.selected.historicalAudit,
          ),
          forwardDiagnostic: compactPointInTimeAlphaPhase(
            report.selected.forwardDiagnostic,
          ),
        }
      : null,
    checks,
    allHistoricalScreenGatesPassed,
    candidateDisposition:
      ["R8", "R9"].includes(report.researchGeneration)
        ? report.candidateDisposition
        : allHistoricalScreenGatesPassed
          ? "freeze-for-genuinely-prospective-paper-tracking"
          : "rejected-by-historical-screen",
    eligibleForPaperForwardTracking:
      ["R8", "R9"].includes(report.researchGeneration)
        ? false
        : allHistoricalScreenGatesPassed,
    allEvidenceGatesPassed: false,
    eligibleForAlphaClaim: false,
    eligibleForLiveCapital: false,
    dataQuality: {
      ...(report.dataQuality || {}),
      membershipObservationCoveragePct,
    },
  };
}

function pointInTimeAlphaPhaseSummary(runs = [], windows = []) {
  const aggregate = compactPointInTimeAlphaMetricSummary(
    boundedReviewExperimentSummary(aggregateResearchRuns(runs)),
  );
  const windowResults = runs.map((run, index) => ({
    ...windows[index],
    ...compactPointInTimeAlphaMetricSummary(
      boundedReviewExperimentSummary(run),
    ),
  }));
  const windowMinimumAlpha = windowResults.map(minimumSimpleBenchmarkAlpha);
  const finiteWindowAlpha = windowMinimumAlpha.filter(Number.isFinite);
  return {
    aggregate,
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
  };
}

async function evaluatePointInTimeAlphaDefinitions(
  manifest,
  calendar,
  definitions,
  windows,
) {
  const runsById = new Map(definitions.map((definition) => [definition.id, []]));
  for (const window of windows) {
    const dataset = await restorePointInTimeSp500Window(
      manifest,
      calendar,
      window,
    );
    for (const definition of definitions) {
      const run = simulatePointInTimePortfolio(
        dataset,
        simulationOptions({
          ...definition.overrides,
          thesisId: `pit-sp500-alpha-${definition.id}`,
          thesisLabel: definition.label,
          startDate: window.start,
          endDate: window.end,
        }),
      );
      assertCompleteResearchWindow(
        run,
        calendar,
        window,
        `${definition.label} ${window.start}`,
      );
      runsById.get(definition.id).push(run);
    }
  }
  return definitions.map((definition) => ({
    definition,
    runs: runsById.get(definition.id),
    summary: pointInTimeAlphaPhaseSummary(
      runsById.get(definition.id),
      windows,
    ),
  }));
}

function boundedTopAbsolute(rows, row, field, limit = 20) {
  rows.push(row);
  rows.sort(
    (a, b) =>
      Math.abs(number(b?.[field], 0)) - Math.abs(number(a?.[field], 0)),
  );
  if (rows.length > limit) rows.length = limit;
}

function createPointInTimePriceIntegrityAccumulator() {
  return {
    seenDates: new Set(),
    previousPrices: new Map(),
    lastDate: null,
    sessions: 0,
    totalStoredPriceRows: 0,
    priceRows: 0,
    activeMembershipPriceRows: 0,
    lookbackPriceRows: 0,
    excludedArchivalPriceRows: 0,
    adjustedRows: 0,
    invalidOhlcRows: 0,
    nonPositiveRows: 0,
    corporateActionRows: 0,
    possibleUnadjustedCorporateActions: [],
    possibleDuplicateActiveSeries: [],
    extremeOneSessionMoves: [],
  };
}

function addPointInTimePriceRequirement(
  rangesBySymbol,
  symbol,
  startIndex,
  endIndex,
) {
  if (!symbol || startIndex > endIndex) return;
  if (!rangesBySymbol.has(symbol)) rangesBySymbol.set(symbol, []);
  const ranges = rangesBySymbol.get(symbol);
  const prior = ranges.at(-1);
  if (prior && startIndex <= prior.end + 1) {
    prior.end = Math.max(prior.end, endIndex);
    return;
  }
  ranges.push({ start: startIndex, end: endIndex });
}

function createPointInTimePriceRequirements(
  {
    lookbackSessions = 253,
    comparisonSymbols = ["SPY", "QQQ"],
  } = {},
) {
  return {
    rangesBySymbol: new Map(),
    activeRangesBySymbol: new Map(),
    totalSessions: 0,
    lookbackSessions,
    comparisonSymbols: comparisonSymbols.map(symbolOf).filter(Boolean),
  };
}

function observePointInTimePriceRequirements(
  requirements,
  datasets = [],
  { sessionIndexOffset = requirements.totalSessions } = {},
) {
  let sessionOffset = sessionIndexOffset;
  for (const dataset of asArray(datasets)) {
    const sessions = asArray(dataset?.sessions).sort((a, b) =>
      String(a?.date || "").localeCompare(String(b?.date || "")),
    );
    for (const [localIndex, session] of sessions.entries()) {
      const sessionIndex = sessionOffset + localIndex;
      const activeSymbols = new Set(
        [...asArray(session?.signals), ...asArray(session?.positionSignals)]
          .map(symbolOf)
          .filter(Boolean),
      );
      for (const symbol of activeSymbols) {
        addPointInTimePriceRequirement(
          requirements.rangesBySymbol,
          symbol,
          Math.max(0, sessionIndex - requirements.lookbackSessions),
          sessionIndex,
        );
        addPointInTimePriceRequirement(
          requirements.activeRangesBySymbol,
          symbol,
          sessionIndex,
          sessionIndex,
        );
      }
    }
    sessionOffset += sessions.length;
  }
  requirements.totalSessions = Math.max(
    requirements.totalSessions,
    sessionOffset,
  );
  return requirements;
}

function finishPointInTimePriceRequirements(requirements) {
  for (const symbol of requirements.comparisonSymbols) {
    addPointInTimePriceRequirement(
      requirements.rangesBySymbol,
      symbol,
      0,
      Math.max(0, requirements.totalSessions - 1),
    );
  }
  return requirements;
}

function pointInTimePriceRequirements(datasets = [], options = {}) {
  const requirements = createPointInTimePriceRequirements(options);
  observePointInTimePriceRequirements(requirements, datasets);
  return finishPointInTimePriceRequirements(requirements);
}

function pointInTimePriceRequirementContains(
  rangesBySymbol,
  symbol,
  sessionIndex,
) {
  const ranges = rangesBySymbol?.get(symbol);
  return Boolean(
    ranges?.some(
      (range) => sessionIndex >= range.start && sessionIndex <= range.end,
    ),
  );
}

function scanPointInTimePriceDataset(
  accumulator,
  dataset = {},
  { requirements = null, sessionIndexOffset = 0 } = {},
) {
  const commonSplitRatios = [0.1, 0.2, 0.25, 1 / 3, 0.5, 2, 3, 4, 5, 10];
  const sessions = asArray(dataset.sessions).sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || "")),
  );
  for (const [localIndex, session] of sessions.entries()) {
    const sessionIndex = sessionIndexOffset + localIndex;
    const date = String(session?.date || "");
    if (!date || accumulator.seenDates.has(date)) continue;
    if (accumulator.lastDate && date < accumulator.lastDate) continue;
    const currentPrices = new Map();
    const activeSeriesByFingerprint = new Map();
    accumulator.sessions += 1;
    accumulator.seenDates.add(date);
    accumulator.corporateActionRows += asArray(session.corporateActions).length;
    for (const row of asArray(session.prices)) {
      const symbol = symbolOf(row);
      const open = number(row?.open);
      const high = number(row?.high);
      const low = number(row?.low);
      const close = number(row?.close);
      if (!symbol) continue;
      accumulator.totalStoredPriceRows += 1;
      const required = requirements
        ? pointInTimePriceRequirementContains(
            requirements.rangesBySymbol,
            symbol,
            sessionIndex,
          )
        : true;
      if (!required) {
        accumulator.excludedArchivalPriceRows += 1;
        continue;
      }
      const active = requirements
        ? pointInTimePriceRequirementContains(
            requirements.activeRangesBySymbol,
            symbol,
            sessionIndex,
          )
        : true;
      accumulator.priceRows += 1;
      if (active) accumulator.activeMembershipPriceRows += 1;
      else accumulator.lookbackPriceRows += 1;
      if (row?.adjusted === true) accumulator.adjustedRows += 1;
      if (!(open > 0 && high > 0 && low > 0 && close > 0)) {
        accumulator.nonPositiveRows += 1;
        continue;
      }
      currentPrices.set(symbol, { close });
      if (
        active &&
        !requirements?.comparisonSymbols?.includes(symbol)
      ) {
        const fingerprint = [open, high, low, close, number(row?.volume, 0)]
          .map((value) => Number(value).toPrecision(12))
          .join(":");
        if (!activeSeriesByFingerprint.has(fingerprint))
          activeSeriesByFingerprint.set(fingerprint, []);
        activeSeriesByFingerprint.get(fingerprint).push(symbol);
      }
      const tolerance = Math.max(0.000001, high * 0.000001);
      if (
        high + tolerance < Math.max(open, close) ||
        low - tolerance > Math.min(open, close) ||
        high + tolerance < low
      )
        accumulator.invalidOhlcRows += 1;
      const previous = accumulator.previousPrices.get(symbol);
      if (!(previous?.close > 0)) continue;
      const overnightRatio = open / previous.close;
      const closeRatio = close / previous.close;
      const overnightReturnPct = (overnightRatio - 1) * 100;
      const closeReturnPct = (closeRatio - 1) * 100;
      if (Math.abs(closeReturnPct) >= 40)
        boundedTopAbsolute(
          accumulator.extremeOneSessionMoves,
          {
            date,
            symbol,
            previousClose: roundMetric(previous.close, 4),
            open: roundMetric(open, 4),
            close: roundMetric(close, 4),
            overnightReturnPct: roundMetric(overnightReturnPct, 3),
            closeReturnPct: roundMetric(closeReturnPct, 3),
          },
          "closeReturnPct",
        );
      const splitRatio = commonSplitRatios.find(
        (candidate) =>
          Math.abs(Math.log(overnightRatio / candidate)) <= Math.log(1.025),
      );
      const closeAlsoMatchesSplitRatio = splitRatio
        ? Math.abs(Math.log(closeRatio / splitRatio)) <= Math.log(1.05)
        : false;
      const ordinaryIntradayMove =
        Math.abs(Math.log(close / open)) <= Math.log(1.1);
      // A split-like open alone is not enough: genuine insolvency, merger and
      // earnings gaps can happen to land near a common ratio. An unadjusted
      // split should leave both that session's open and close near the same
      // ratio while ordinary intraday trading remains comparatively smooth.
      if (
        Math.abs(overnightReturnPct) >= 25 &&
        splitRatio &&
        closeAlsoMatchesSplitRatio &&
        ordinaryIntradayMove
      )
        boundedTopAbsolute(
          accumulator.possibleUnadjustedCorporateActions,
          {
            date,
            symbol,
            previousClose: roundMetric(previous.close, 4),
            open: roundMetric(open, 4),
            close: roundMetric(close, 4),
            overnightReturnPct: roundMetric(overnightReturnPct, 3),
            closeReturnPct: roundMetric(closeReturnPct, 3),
            nearestSplitRatio: roundMetric(splitRatio, 4),
          },
          "overnightReturnPct",
        );
    }
    for (const symbols of activeSeriesByFingerprint.values()) {
      const uniqueSymbols = [...new Set(symbols)].sort();
      if (uniqueSymbols.length < 2) continue;
      boundedTopAbsolute(
        accumulator.possibleDuplicateActiveSeries,
        {
          date,
          symbols: uniqueSymbols,
          duplicateCount: uniqueSymbols.length,
        },
        "duplicateCount",
      );
    }
    accumulator.previousPrices = currentPrices;
    accumulator.lastDate = date;
  }
  return accumulator;
}

function finishPointInTimePriceIntegrityAudit(accumulator) {
  const adjustedCoveragePct = accumulator.priceRows
    ? roundMetric((accumulator.adjustedRows / accumulator.priceRows) * 100, 4)
    : 0;
  const pass =
    accumulator.priceRows > 0 &&
    accumulator.adjustedRows === accumulator.priceRows &&
    accumulator.nonPositiveRows === 0 &&
    accumulator.invalidOhlcRows === 0 &&
    accumulator.possibleUnadjustedCorporateActions.length === 0 &&
    accumulator.possibleDuplicateActiveSeries.length === 0;
  return {
    pass,
    sessions: accumulator.sessions,
    totalStoredPriceRows: accumulator.totalStoredPriceRows,
    priceRows: accumulator.priceRows,
    activeMembershipPriceRows: accumulator.activeMembershipPriceRows,
    lookbackPriceRows: accumulator.lookbackPriceRows,
    excludedArchivalPriceRows: accumulator.excludedArchivalPriceRows,
    adjustedRows: accumulator.adjustedRows,
    adjustedCoveragePct,
    nonPositiveRows: accumulator.nonPositiveRows,
    invalidOhlcRows: accumulator.invalidOhlcRows,
    corporateActionRows: accumulator.corporateActionRows,
    possibleUnadjustedCorporateActions:
      accumulator.possibleUnadjustedCorporateActions,
    possibleDuplicateActiveSeries:
      accumulator.possibleDuplicateActiveSeries,
    extremeOneSessionMoves: accumulator.extremeOneSessionMoves,
    interpretation:
      "Only active-member prices, their required 253-session signal lookbacks, and benchmark histories determine integrity. Archival post-removal rows are excluded. Extreme moves are disclosed; they fail only when both the open and close preserve a common split ratio with ordinary intraday movement, when active symbols share an identical full OHLCV row, or when adjusted/OHLC invariants fail.",
  };
}

export function pointInTimePriceIntegrityAudit(
  datasets = [],
  { decisionRelevantOnly = false, lookbackSessions = 253 } = {},
) {
  const accumulator = createPointInTimePriceIntegrityAccumulator();
  const normalizedDatasets = asArray(datasets);
  const requirements = decisionRelevantOnly
    ? pointInTimePriceRequirements(normalizedDatasets, { lookbackSessions })
    : null;
  let sessionIndexOffset = 0;
  for (const dataset of normalizedDatasets) {
    scanPointInTimePriceDataset(accumulator, dataset, {
      requirements,
      sessionIndexOffset,
    });
    sessionIndexOffset += asArray(dataset?.sessions).length;
  }
  return finishPointInTimePriceIntegrityAudit(accumulator);
}

export function summarizePointInTimeTradeConcentration(runs = []) {
  const closed = [];
  for (const [runIndex, run] of asArray(runs).entries()) {
    const entries = new Map();
    for (const trade of asArray(run?.trades)) {
      const key = `${runIndex}:${trade?.positionId}`;
      if (trade?.side === "buy") {
        entries.set(key, trade);
        continue;
      }
      if (trade?.side !== "sell" || trade?.positionClosed !== true) continue;
      const entry = entries.get(key);
      const roundTripPnl = number(trade?.roundTripPnl);
      const entryNotional =
        number(entry?.shares, 0) * number(entry?.price, 0);
      if (!entry || roundTripPnl === null || !(entryNotional > 0)) continue;
      closed.push({
        symbol: symbolOf(trade),
        entryDate: entry.date || null,
        exitDate: trade.date || null,
        entryPrice: roundMetric(number(entry.price), 4),
        exitPrice: roundMetric(number(trade.price), 4),
        holdingSessions: number(trade.holdingSessions, 0),
        reason: trade.reason || "unknown",
        roundTripPnl: roundMetric(roundTripPnl, 2),
        returnPct: roundMetric((roundTripPnl / entryNotional) * 100, 3),
        mfePct: roundMetric(number(trade.mfePct), 3),
        maePct: roundMetric(number(trade.maePct), 3),
      });
    }
  }
  const winners = closed
    .filter((trade) => trade.roundTripPnl > 0)
    .sort((a, b) => b.roundTripPnl - a.roundTripPnl);
  const losers = closed
    .filter((trade) => trade.roundTripPnl < 0)
    .sort((a, b) => a.roundTripPnl - b.roundTripPnl);
  const grossProfit = winners.reduce(
    (total, trade) => total + trade.roundTripPnl,
    0,
  );
  const grossLoss = Math.abs(
    losers.reduce((total, trade) => total + trade.roundTripPnl, 0),
  );
  const grossProfitBySymbol = new Map();
  for (const trade of winners)
    grossProfitBySymbol.set(
      trade.symbol,
      number(grossProfitBySymbol.get(trade.symbol), 0) + trade.roundTripPnl,
    );
  const topSymbol = [...grossProfitBySymbol]
    .sort((a, b) => b[1] - a[1])
    .at(0) || [null, 0];
  const shareOfGrossProfit = (amount) =>
    grossProfit > 0 ? roundMetric((amount / grossProfit) * 100, 3) : null;
  const topWinnerShareOfGrossProfitPct = shareOfGrossProfit(
    number(winners[0]?.roundTripPnl, 0),
  );
  const top3WinnerShareOfGrossProfitPct = shareOfGrossProfit(
    winners
      .slice(0, 3)
      .reduce((total, trade) => total + trade.roundTripPnl, 0),
  );
  const topSymbolShareOfGrossProfitPct = shareOfGrossProfit(topSymbol[1]);
  return {
    closedRoundTrips: closed.length,
    grossProfit: roundMetric(grossProfit, 2),
    grossLoss: roundMetric(grossLoss, 2),
    netPnl: roundMetric(grossProfit - grossLoss, 2),
    topWinnerShareOfGrossProfitPct,
    top3WinnerShareOfGrossProfitPct,
    topSymbol: topSymbol[0],
    topSymbolShareOfGrossProfitPct,
    concentrationWarning:
      number(topWinnerShareOfGrossProfitPct, 0) > 35 ||
      number(top3WinnerShareOfGrossProfitPct, 0) > 70 ||
      number(topSymbolShareOfGrossProfitPct, 0) > 40,
    extremeRoundTrips: closed
      .filter((trade) => Math.abs(number(trade.returnPct, 0)) >= 75)
      .sort(
        (a, b) =>
          Math.abs(number(b.returnPct, 0)) -
          Math.abs(number(a.returnPct, 0)),
      )
      .slice(0, 10),
    topWinners: winners.slice(0, 5),
    topLosers: losers.slice(0, 5),
  };
}

function pointInTimeAlphaDevelopmentScore(summary = {}) {
  const aggregateAlpha = minimumSimpleBenchmarkAlpha(summary.aggregate);
  const medianAlpha = number(summary.medianMinimumBenchmarkAlphaPct, -50);
  const worstAlpha = number(summary.worstMinimumBenchmarkAlphaPct, -50);
  const drawdownPenalty = Math.max(
    0,
    Math.abs(number(summary.aggregate?.maxDrawdownPct, -100)) - 20,
  );
  const turnoverPenalty = Math.max(
    0,
    number(summary.aggregate?.annualizedTurnoverPct, 1_000) - 600,
  );
  return roundMetric(
    aggregateAlpha +
      0.4 * medianAlpha +
      0.2 * worstAlpha +
      0.15 * number(summary.aggregate?.sharpe, 0) -
      0.15 * drawdownPenalty -
      0.002 * turnoverPenalty,
    3,
  );
}

function pointInTimeAlphaPhaseChecks(
  phase = {},
  { minimumClosedTrades = 15 } = {},
) {
  const metrics = phase.aggregate || {};
  return {
    positiveReturn: number(metrics.totalReturnPct, -Infinity) > 0,
    beatsSpy: number(metrics.simpleDifferenceVsSpyPct, -Infinity) > 0,
    beatsQqq: number(metrics.simpleDifferenceVsQqqPct, -Infinity) > 0,
    positiveExpectancy: number(metrics.expectancyPct, -Infinity) > 0,
    profitFactorAboveOne: number(metrics.profitFactor, -Infinity) > 1,
    positiveAlphaInAtLeastHalfOfWindows:
      number(phase.positiveAlphaWindowShare, 0) >= 0.5,
    maxDrawdownWithin25Pct:
      number(metrics.maxDrawdownPct, -Infinity) >= -25,
    minimumClosedTrades:
      number(metrics.closedTrades, 0) >= minimumClosedTrades,
    averageActiveExposureAtLeast70Pct:
      number(metrics.averageActiveExposurePct, 0) >= 70,
  };
}

export async function runPointInTimeSp500AlphaCreator({
  force = false,
  now = Date.now(),
} = {}) {
  const manifest = await readPrivateJson(
    POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The completed point-in-time S&P 500 checkpoint is unavailable",
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
  const [storedExisting, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE).catch(() => null),
    getPointInTimeSp500DatasetStatus(),
  ]);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_CREATOR_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  ) {
    if (storedExisting?.responseSchema !== 2)
      await persistPrivateJson(
        POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE,
        existing,
      );
    return { ...existing, cached: true };
  }
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
    version: POINT_IN_TIME_SP500_ALPHA_CREATOR_REPORT_VERSION,
    status: "running",
    experiment: "Frozen point-in-time S&P 500 alpha generator",
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The frozen candidate family is being evaluated on membership-filtered historical sessions.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_WINDOWS).map(([phase, rows]) => [
        phase,
        rows.map((window) => ({ ...window })),
      ]),
    );
    for (const [phase, phaseWindows] of Object.entries(windows)) {
      for (const window of phaseWindows) {
        const sessions = calendar.filter(
          (date) => date >= window.start && date <= window.end,
        ).length;
        const expected = phase === "forwardDiagnostic" ? 36 : 126;
        if (sessions !== expected)
          throw new Error(
            `${phase} window ${window.start} to ${window.end} has ${sessions}/${expected} sessions`,
          );
      }
    }

    const definitions = pointInTimeSp500AlphaCandidateDefinitions();
    const developmentEvaluations =
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        windows.development,
      );
    const candidates = developmentEvaluations.map(
      ({ definition, summary }) => ({
        id: definition.id,
        label: definition.label,
        weights: definition.weights,
        configuration: definition.overrides,
        development: summary,
        developmentScore: pointInTimeAlphaDevelopmentScore(summary),
      }),
    );
    const selected = [...candidates].sort(
      (left, right) =>
        right.developmentScore - left.developmentScore ||
        left.id.localeCompare(right.id),
    )[0];
    const selectedDefinition = definitions.find(
      (definition) => definition.id === selected.id,
    );
    const selectedDevelopment = developmentEvaluations.find(
      (evaluation) => evaluation.definition.id === selected.id,
    ).summary;
    const validation = (
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        [selectedDefinition],
        windows.validation,
      )
    )[0].summary;
    const historicalAudit = (
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        [selectedDefinition],
        windows.historicalAudit,
      )
    )[0].summary;
    const forwardDiagnostic = (
      await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        [selectedDefinition],
        windows.forwardDiagnostic,
      )
    )[0].summary;

    const placeboDefinitions = Array.from(
      { length: POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...selectedDefinition,
          id: `random-placebo-${seed}`,
          label: `Random placebo ${seed}`,
          overrides: {
            ...selectedDefinition.overrides,
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
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS)
      throw new Error(
        `The matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS})`,
      );
    const placebo95 = roundMetric(percentileValue(placeboScores, 0.95), 3);
    const selectedDevelopmentAlpha = minimumSimpleBenchmarkAlpha(
      selectedDevelopment.aggregate,
    );
    const membershipObservationCoveragePct = number(
      manifest.datasetMetadata?.membershipObservationCoveragePct,
      number(datasetStatus?.coverage?.membershipObservationCoveragePct),
    );
    const checks = {
      development: pointInTimeAlphaPhaseChecks(selectedDevelopment, {
        minimumClosedTrades: 30,
      }),
      validation: pointInTimeAlphaPhaseChecks(validation),
      historicalAudit: pointInTimeAlphaPhaseChecks(historicalAudit),
      controls: {
        developmentBeatsMatchedPlacebo95:
          selectedDevelopmentAlpha > placebo95,
        pointInTimeMembershipCoverageComplete:
          membershipObservationCoveragePct === 100,
        noBenchmarkCompletionSleeve:
          selectedDefinition.overrides.benchmarkCompletionSymbol === null,
        priceOnlyRankExcludesUnrevisionedFundamentals:
          selectedDefinition.overrides.researchSignalSource === "price-only",
      },
    };
    const allHistoricalScreenGatesPassed = Object.values(checks).every(
      (group) => Object.values(group).every(Boolean),
    );
    const completedAt = new Date().toISOString();
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_CREATOR_REPORT_VERSION,
      status: "complete",
      experiment: "Frozen point-in-time S&P 500 alpha generator",
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      candidateCount: candidates.length,
      selectionPolicy:
        "Select once on three development windows using benchmark-relative robustness, drawdown and turnover; evaluate that unchanged candidate on validation, historical-audit and forward-diagnostic windows.",
      windows,
      candidates,
      selectedCandidateId: selected.id,
      selected: {
        ...selected,
        development: selectedDevelopment,
        validation,
        historicalAudit,
        forwardDiagnostic,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS,
        purpose: "bounded development screen",
        score:
          "minimum simple total-return difference versus SPY and QQQ over the development windows",
        medianPct: roundMetric(percentileValue(placeboScores, 0.5), 3),
        percentile95Pct: placebo95,
        minimumPct: roundMetric(Math.min(...placeboScores), 3),
        maximumPct: roundMetric(Math.max(...placeboScores), 3),
        scoresPct: placeboScores.map((value) => roundMetric(value, 3)),
        strictPromotionRequirementSeeds: 1_000,
      },
      checks,
      allHistoricalScreenGatesPassed,
      allEvidenceGatesPassed: false,
      candidateDisposition: allHistoricalScreenGatesPassed
        ? "freeze-for-genuinely-prospective-paper-tracking"
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
          "5-session return",
          "20-session return",
          "60-session return excluding the latest 5 sessions",
          "120-session return excluding the latest 20 sessions",
          "SPY and QQQ relative strength",
          "realized volatility and stability rank",
          "short-term technical and controlled-pullback scores",
          "20-session average dollar volume",
        ],
        fundamentalValuesUsedInRank: false,
        historicalNewsUsedInRank: false,
        candidateSelectionUsesOnlyDevelopmentWindows: true,
        validationAndAuditExcludedFromSelection: true,
        forwardDiagnosticExcludedFromSelection: true,
        forwardDiagnosticWasAlreadyHistoricalAtFreeze: true,
        matchedRandomPlacebos: POINT_IN_TIME_SP500_ALPHA_PLACEBO_SEEDS,
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
        delistedRemovedSymbolsMatched: number(
          datasetStatus?.coverage?.delistedRemovedSymbolsMatched,
        ),
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
          "The generator was designed after this entire calendar existed. Chronological validation can reject a weak model, but even a passing result cannot establish out-of-sample alpha without new prospective sessions and the strict 1,000-seed control.",
      },
      researchReferences: [
        {
          title: "Momentum Crashes",
          url: "https://www.sciencedirect.com/science/article/pii/S0304405X16301490",
          implication:
            "Momentum exposure needs explicit volatility, drawdown and regime diagnostics rather than an unconditional return chase.",
        },
        {
          title: "Volatility Managed Portfolios",
          url: "https://www.nber.org/papers/w22208",
          implication:
            "Risk-scaled variants are predeclared because realized volatility can contain useful conditioning information.",
        },
        {
          title: "Long-Horizon Stock Returns Are Positively Autocorrelated",
          url: "https://www.nber.org/system/files/working_papers/w24163/w24163.pdf",
          implication:
            "The bounded family separates short, medium and longer price horizons instead of relying on one lookback.",
        },
      ],
      limitations: [
        "The full 2023-2026 evaluation calendar was available before this candidate family was frozen, so none of these windows is a genuinely untouched holdout.",
        "Only S&P 500 constituents are represented; smaller US equities and non-index opportunities are outside this test.",
        "Historical membership is explicit, but unavailable delisting proceeds use conservative zero recovery.",
        "Fundamental statement values are not certified revision-safe and historical material-news coverage is incomplete; both are excluded from the rank and entry qualification.",
        "One hundred deterministic placebos provide a bounded development screen, not the 1,000-seed promotion control.",
        "The 36-session forward diagnostic is too short and was already known when this generator was written.",
        "This report can reject or freeze a candidate for prospective paper tracking; it cannot authorize a live recommendation or a claim of future outperformance.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Freeze the selected candidate without retuning, collect genuinely new sessions in a prospective paper ledger, and run at least 1,000 matched placebos before independent review."
        : "Do not promote the selected candidate. Preserve this result as a failed frozen search and wait for a new predeclared research thesis rather than retuning on the audit windows.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE,
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
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_CREATOR_STORE,
      failed,
    ).catch(() => {});
    throw error;
  }
}

export async function runPointInTimeSp500AlphaCreatorV2({
  force = false,
  now = Date.now(),
} = {}) {
  const manifest = await readPrivateJson(
    POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE,
  );
  if (!manifest?.complete || !asArray(manifest?.chunks).length)
    throw new Error(
      "The completed point-in-time S&P 500 checkpoint is unavailable",
    );
  if (
    !String(manifest.signature || "").includes(
      POINT_IN_TIME_SP500_COMPILER_CONTRACT,
    )
  )
    throw new Error(
      "The V2 anchored-gradual factor dataset has not finished compiling",
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
  const [storedExisting, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_ALPHA_V2_STORE).catch(() => null),
    getPointInTimeSp500DatasetStatus(),
  ]);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_V2_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_V2_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_V2_REPORT_VERSION,
    status: "running",
    experiment: "Frozen V2 anchored gradual-leadership falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_V2_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_V2_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The single predeclared V2 thesis and its ablation controls are being evaluated on contaminated historical development data.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_V2_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_V2_WINDOWS).map(
        ([phase, rows]) => [
          phase,
          rows.map((window) => ({ ...window })),
        ],
      ),
    );
    for (const [phase, phaseWindows] of Object.entries(windows)) {
      for (const window of phaseWindows) {
        const sessions = calendar.filter(
          (date) => date >= window.start && date <= window.end,
        ).length;
        const expected = phase === "forwardDiagnostic" ? 36 : 126;
        if (sessions !== expected)
          throw new Error(
            `${phase} window ${window.start} to ${window.end} has ${sessions}/${expected} sessions`,
          );
      }
    }

    const { primary, controls } = pointInTimeSp500AlphaV2Definitions();
    const definitions = [primary, ...controls];
    const evaluations = {};
    for (const [phase, phaseWindows] of Object.entries(windows)) {
      evaluations[phase] = await evaluatePointInTimeAlphaDefinitions(
        manifest,
        calendar,
        definitions,
        phaseWindows,
      );
    }
    const summaryFor = (phase, id) =>
      evaluations[phase].find(
        (evaluation) => evaluation.definition.id === id,
      )?.summary;
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
      { length: POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `v2-random-placebo-${seed}`,
          label: `V2 random placebo ${seed}`,
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
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS)
      throw new Error(
        `The V2 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS})`,
      );
    const placebo95 = roundMetric(percentileValue(placeboScores, 0.95), 3);
    const primaryDevelopmentAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.development.aggregate,
    );
    const primaryAuditAlpha = minimumSimpleBenchmarkAlpha(
      primaryPhases.historicalAudit.aggregate,
    );
    const controlDevelopmentAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.development.aggregate),
    );
    const controlAuditAlphas = controlResults.map((control) =>
      minimumSimpleBenchmarkAlpha(control.historicalAudit.aggregate),
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
        developmentBeatsMatchedPlacebo95:
          primaryDevelopmentAlpha > placebo95,
        developmentBeatsEveryAblationControl:
          controlDevelopmentAlphas.every(
            (controlAlpha) => primaryDevelopmentAlpha > controlAlpha,
          ),
        historicalAuditBeatsEveryAblationControl:
          controlAuditAlphas.every(
            (controlAlpha) => primaryAuditAlpha > controlAlpha,
          ),
        pointInTimeMembershipCoverageComplete:
          membershipObservationCoveragePct === 100,
        noBenchmarkCompletionSleeve:
          primary.overrides.benchmarkCompletionSymbol === null,
        priceOnlyRankExcludesUnrevisionedFundamentals:
          primary.overrides.researchSignalSource === "price-only",
        singlePredeclaredThesisNoSelector: true,
      },
    };
    const allHistoricalScreenGatesPassed = Object.values(checks).every(
      (group) => Object.values(group).every(Boolean),
    );
    const completedAt = new Date().toISOString();
    const report = {
      version: POINT_IN_TIME_SP500_ALPHA_V2_REPORT_VERSION,
      status: "complete",
      experiment: "Frozen V2 anchored gradual-leadership falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_V2_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_V2_PROSPECTIVE_START,
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
        "No selector and no parameter fitting: evaluate one fixed anchored gradual-leadership thesis against predeclared ablations, the matched V1 ranking control, SPY, QQQ and deterministic random portfolios.",
      windows,
      candidates: [
        {
          id: primary.id,
          label: primary.label,
          weights: primary.weights,
          configuration: primary.overrides,
          development: primaryPhases.development,
          developmentScore: pointInTimeAlphaDevelopmentScore(
            primaryPhases.development,
          ),
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
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS,
        purpose: "bounded contaminated-development falsification screen",
        score:
          "minimum simple total-return difference versus SPY and QQQ over the development windows",
        medianPct: roundMetric(percentileValue(placeboScores, 0.5), 3),
        percentile95Pct: placebo95,
        minimumPct: roundMetric(Math.min(...placeboScores), 3),
        maximumPct: roundMetric(Math.max(...placeboScores), 3),
        scoresPct: placeboScores.map((value) => roundMetric(value, 3)),
        strictPromotionRequirementSeeds: 1_000,
      },
      checks,
      allHistoricalScreenGatesPassed,
      allEvidenceGatesPassed: false,
      candidateDisposition: allHistoricalScreenGatesPassed
        ? "freeze-for-genuinely-prospective-paper-tracking"
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
          "distance from the trailing 252-session high",
          "sessions since the trailing 252-session high",
          "120-session positive-day share",
          "120-session path efficiency",
          "120-session information discreteness",
          "120-session peak-to-trough drawdown",
          "200-session return excluding the latest 20 sessions",
          "120-session return excluding the latest 20 sessions",
          "SPY and QQQ relative strength",
          "current volume versus its prior 20-session average",
          "20-session average dollar volume",
        ],
        genericShortRunChaseVetoUsed: false,
        nextOpenGapLimitPct: 3,
        fundamentalValuesUsedInRank: false,
        historicalNewsUsedInRank: false,
        parameterSelectionUsed: false,
        everyHistoricalWindowPreviouslyObservableAtFreeze: true,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_V2_PLACEBO_SEEDS,
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
        delistedRemovedSymbolsMatched: number(
          datasetStatus?.coverage?.delistedRemovedSymbolsMatched,
        ),
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
          "V2 was frozen only after the entire historical calendar and V1 result were known. These tests can falsify V2 and decide whether it deserves prospective paper tracking; they cannot prove alpha or authorize capital.",
      },
      researchReferences: [
        {
          title: "The 52-Week High and Momentum Investing",
          url: "https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2004.00695.x",
          implication:
            "Price proximity to a widely observed prior high can capture anchoring and underreaction beyond raw past-return magnitude.",
        },
        {
          title: "Frog in the Pan: Continuous Information and Momentum",
          url: "https://academic.oup.com/rfs/article-abstract/27/7/2171/1578455",
          implication:
            "Gradual, same-direction information embedded across many sessions has historically shown more persistent continuation than discontinuous jumps.",
        },
        {
          title: "Is Momentum Really Momentum?",
          url: "https://www.sciencedirect.com/science/article/abs/pii/S0304405X11001152",
          implication:
            "Intermediate-horizon performance is kept separate from the latest month rather than treating the most recent surge as equivalent evidence.",
        },
      ],
      limitations: [
        "Every session through 2026-09-01 was observable before V2 was frozen, so every displayed phase is contaminated historical development evidence.",
        "Only S&P 500 constituents are represented; smaller US equities and historical Nasdaq-100 membership are outside this test.",
        "Historical membership is explicit, but unavailable delisting proceeds use conservative zero recovery.",
        "Fundamental statement values are not certified revision-safe and historical material-news coverage is incomplete; both are excluded from the V2 rank and eligibility checks.",
        "One hundred deterministic placebos are only a bounded development screen; the unchanged 1,000-seed promotion gate remains unmet.",
        "V2 has zero genuinely new forward sessions. No result in this report can authorize live capital.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Freeze V2 unchanged for a prospective paper ledger beginning no earlier than 2026-09-03; do not promote before 60 genuinely new sessions and the strict 1,000-seed placebo control both pass."
        : "Retire V2 as falsified. Do not retune it on these dates or allow it to affect live recommendations.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_V2_STORE,
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
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_V2_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

export async function runPointInTimeSp500AlphaResearchR3({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
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
    throw new Error("The canonical R3 research dataset has not finished compiling");
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
      "R3 remains blocked until the corrected price-integrity audit passes for this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R3_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R3_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R3_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R3_REPORT_VERSION,
    researchGeneration: "R3",
    productionCandidateVersion: "V13",
    status: "running",
    experiment:
      "Frozen V13/R3 benchmark-residual volatility-managed leadership falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R3_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_R3_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The predeclared R3 thesis and controls are being evaluated on the corrected point-in-time dataset.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R3_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R3_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const { primary, controls } = pointInTimeSp500AlphaR3Definitions();
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
      { length: POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `r3-random-placebo-${seed}`,
          label: `R3 matched random placebo ${seed}`,
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
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS)
      throw new Error(
        `The R3 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS})`,
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
      empiricalPValue * POINT_IN_TIME_SP500_ALPHA_RESEARCH_GENERATIONS,
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
      version: POINT_IN_TIME_SP500_ALPHA_R3_REPORT_VERSION,
      researchGeneration: "R3",
      productionCandidateVersion: "V13",
      status: "complete",
      experiment:
        "Frozen V13/R3 benchmark-residual volatility-managed leadership falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R3_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R3_PROSPECTIVE_START,
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
        "No grid search or selector: one externally motivated benchmark-relative primary thesis is tested against three predeclared matched controls.",
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
          POINT_IN_TIME_SP500_ALPHA_RESEARCH_GENERATIONS,
        familyWiseAdjustedPValue: roundMetric(
          familyWiseAdjustedPValue,
          4,
        ),
        strictPromotionPlaceboSeeds: 1_000,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS,
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
          "120-session excess return versus SPY and QQQ",
          "60-session excess return versus SPY and QQQ",
          "global and sector-relative intermediate momentum percentile",
          "60-session realized volatility",
          "120-session peak-to-trough drawdown resilience",
          "controlled five-session pullback",
        ],
        volatilityTargetPct: 18,
        parameterSelectionUsed: false,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_R3_PLACEBO_SEEDS,
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
          "R3 is protected against ordinary t-statistic and repeated-search inflation, but every session through 2026-09-01 was observable before freeze. A passing historical screen advances research; it does not by itself prove tradable future alpha.",
      },
      researchReferences: [
        {
          title: "Residual Momentum",
          url: "https://doi.org/10.1016/j.jempfin.2011.01.003",
          implication:
            "Benchmark-relative rather than raw returns are emphasized to reduce unstable common-factor exposure.",
        },
        {
          title: "Volatility Managed Portfolios",
          url: "https://www.nber.org/papers/w22208",
          implication:
            "Position risk is reduced when realized stock volatility is high instead of assuming constant risk.",
        },
        {
          title: "Momentum Crashes",
          url: "https://www.nber.org/papers/w20439",
          implication:
            "The design explicitly limits volatility and drawdown dependence rather than maximizing raw momentum exposure.",
        },
        {
          title: "... and the Cross-Section of Expected Returns",
          url: "https://www.nber.org/papers/w20592",
          implication:
            "A t-statistic above three and family-wise correction replace the conventional unadjusted t greater than two hurdle.",
        },
      ],
      limitations: [
        "All historical dates were observable before R3 was frozen; no historical result can be represented as a genuinely untouched holdout.",
        "The available causal contract is price-only because statement revisions and historical material news are not certified as-known.",
        "The 100-placebo stage is a bounded rejection screen. A survivor must still complete the separate 1,000-seed promotion distribution.",
        "Only S&P 500 membership is covered; independent cross-universe replication remains required.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Run the strict 1,000-seed matched-placebo distribution, begin the genuinely prospective paper ledger, and require independent cross-universe replication before any production promotion."
        : "Retire R3 without retuning it on these dates and predeclare an economically distinct R4 research thesis.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R3_STORE,
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
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R3_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

export async function runPointInTimeSp500AlphaResearchR4({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
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
    throw new Error("The canonical R4 research dataset has not finished compiling");
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
      "R4 remains blocked until the corrected price-integrity audit passes for this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R4_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R4_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R4_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R4_REPORT_VERSION,
    researchGeneration: "R4",
    productionCandidateVersion: "V14",
    status: "running",
    experiment:
      "Frozen V14/R4 liquidity-conditioned short-term reversal falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R4_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_R4_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The predeclared R4 thesis and controls are being evaluated on the corrected point-in-time dataset.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R4_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R4_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const { primary, controls } = pointInTimeSp500AlphaR4Definitions();
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
      { length: POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `r4-random-placebo-${seed}`,
          label: `R4 matched random placebo ${seed}`,
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
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS)
      throw new Error(
        `The R4 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS})`,
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
      empiricalPValue * POINT_IN_TIME_SP500_ALPHA_R4_RESEARCH_GENERATIONS,
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
      version: POINT_IN_TIME_SP500_ALPHA_R4_REPORT_VERSION,
      researchGeneration: "R4",
      productionCandidateVersion: "V14",
      status: "complete",
      experiment:
        "Frozen V14/R4 liquidity-conditioned short-term reversal falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R4_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R4_PROSPECTIVE_START,
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
        "No grid search or selector: one externally motivated liquidity-provision primary thesis is tested against three predeclared matched controls.",
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
          POINT_IN_TIME_SP500_ALPHA_R4_RESEARCH_GENERATIONS,
        familyWiseAdjustedPValue: roundMetric(
          familyWiseAdjustedPValue,
          4,
        ),
        strictPromotionPlaceboSeeds: 1_000,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS,
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
          "five-session return constrained to a predeclared -10% to -1% temporary-pressure band",
          "120-session excess return versus both SPY and QQQ as a positive-trend condition",
          "60-session realized volatility",
          "trailing average dollar volume",
        ],
        volatilityTargetPct: 16,
        parameterSelectionUsed: false,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_R4_PLACEBO_SEEDS,
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
          "R4 is protected against ordinary t-statistic and repeated-search inflation, but every session through 2026-09-01 was observable before freeze. A passing historical screen advances research; it does not by itself prove tradable future alpha.",
      },
      researchReferences: [
        {
          title: "Evaporating Liquidity",
          url: "https://www.nber.org/papers/w17653",
          implication:
            "Short-term reversal returns are treated as compensation for supplying liquidity, motivating the temporary-price-pressure signal.",
        },
        {
          title: "Short-term residual reversal",
          url: "https://doi.org/10.1016/j.jempfin.2012.12.002",
          implication:
            "Benchmark-relative conditioning is used to reduce common-factor contamination in short-horizon reversal.",
        },
        {
          title: "... and the Cross-Section of Expected Returns",
          url: "https://www.nber.org/papers/w20592",
          implication:
            "A t-statistic above three and family-wise correction replace the conventional unadjusted t greater than two hurdle.",
        },
      ],
      limitations: [
        "All historical dates were observable before R4 was frozen; no historical result can be represented as a genuinely untouched holdout.",
        "The available causal contract is price-only because statement revisions and historical material news are not certified as-known.",
        "The 100-placebo stage is a bounded rejection screen. A survivor must still complete the separate 1,000-seed promotion distribution.",
        "Only S&P 500 membership is covered; independent cross-universe replication remains required.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Run the strict 1,000-seed matched-placebo distribution, begin the genuinely prospective paper ledger, and require independent cross-universe replication before any production promotion."
        : "Retire R4 without retuning it on these dates and predeclare an economically distinct R5 research thesis.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R4_STORE,
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
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R4_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}

export async function runPointInTimeSp500AlphaResearchR6({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, r5Report, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
    getPointInTimeSp500AlphaResearchR5(),
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
    throw new Error("The canonical R6 research dataset has not finished compiling");
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
      "R6 remains blocked until the corrected price-integrity audit passes for this exact dataset",
    );
  if (
    r5Report?.status !== "complete" ||
    r5Report?.datasetFingerprint !== datasetFingerprint ||
    r5Report?.candidateDisposition !== "rejected-by-historical-screen"
  )
    throw new Error(
      "R6 remains blocked until frozen R5 finishes and is preserved as rejected on this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R6_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R6_REPORT_VERSION &&
    existing?.status === "complete" &&
    existing?.datasetFingerprint === datasetFingerprint
  )
    return { ...existing, cached: true };
  const existingClaimTime = new Date(
    existing?.runClaimedAt || existing?.updatedAt || 0,
  ).getTime();
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R6_REPORT_VERSION &&
    existing?.status === "running" &&
    existing?.datasetFingerprint === datasetFingerprint &&
    Number.isFinite(existingClaimTime) &&
    now - existingClaimTime < RUNNING_TTL_MS
  )
    return existing;

  const startedAt = new Date(now).toISOString();
  const running = {
    version: POINT_IN_TIME_SP500_ALPHA_R6_REPORT_VERSION,
    researchGeneration: "R6",
    productionCandidateVersion: "V16",
    status: "running",
    experiment:
      "Frozen V16/R6 high-volume attention-shock breakout-continuation falsification",
    frozenDate: POINT_IN_TIME_SP500_ALPHA_R6_FROZEN_DATE,
    earliestProspectiveSession:
      POINT_IN_TIME_SP500_ALPHA_R6_PROSPECTIVE_START,
    datasetFingerprint,
    datasetThrough,
    startedAt,
    runClaimedAt: startedAt,
    updatedAt: startedAt,
    productionChanged: false,
    eligibleForAlphaClaim: false,
    message:
      "The predeclared R6 event-continuation thesis and controls are being evaluated on the corrected point-in-time dataset.",
  };
  await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R6_STORE, running);

  try {
    const windows = Object.fromEntries(
      Object.entries(POINT_IN_TIME_SP500_ALPHA_R6_WINDOWS).map(
        ([phase, rows]) => [phase, rows.map((window) => ({ ...window }))],
      ),
    );
    const { primary, controls } = pointInTimeSp500AlphaR6Definitions();
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
      { length: POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS },
      (_, index) => {
        const seed = index + 1;
        return {
          ...primary,
          id: `r6-random-placebo-${seed}`,
          label: `R6 matched event-universe random placebo ${seed}`,
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
    if (placeboScores.length !== POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS)
      throw new Error(
        `The R6 matched placebo distribution is incomplete (${placeboScores.length}/${POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS})`,
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
      empiricalPValue * POINT_IN_TIME_SP500_ALPHA_R6_RESEARCH_GENERATIONS,
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
        exactMatchedEventUniversePlacebos:
          primary.overrides.requireAttentionShockFactors === true,
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
      version: POINT_IN_TIME_SP500_ALPHA_R6_REPORT_VERSION,
      researchGeneration: "R6",
      productionCandidateVersion: "V16",
      status: "complete",
      experiment:
        "Frozen V16/R6 high-volume attention-shock breakout-continuation falsification",
      frozenDate: POINT_IN_TIME_SP500_ALPHA_R6_FROZEN_DATE,
      earliestProspectiveSession:
        POINT_IN_TIME_SP500_ALPHA_R6_PROSPECTIVE_START,
      genuinelyNewForwardSessions: 0,
      requiredGenuinelyNewForwardSessions: 60,
      startedAt,
      completedAt,
      datasetFingerprint,
      datasetThrough,
      candidateSetFrozenBeforeExecution: true,
      specifiedBeforeR4ResultObserved: true,
      specifiedBeforeR5ResultObserved: true,
      predecessorResultUsedForParameterSelection: false,
      candidateCount: 1,
      controlCount: controls.length,
      selectionPolicy:
        "No grid search or selector: one externally motivated high-volume near-high continuation event thesis is tested unchanged against three predeclared controls.",
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
          POINT_IN_TIME_SP500_ALPHA_R6_RESEARCH_GENERATIONS,
        familyWiseAdjustedPValue: roundMetric(
          familyWiseAdjustedPValue,
          4,
        ),
        strictPromotionPlaceboSeeds: 1_000,
      },
      placebo: {
        seeds: POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS,
        purpose:
          "Preliminary random-rank falsification inside the exact same qualifying attention-shock event universe and lifecycle",
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
        eventEligibility: {
          minimumCurrentVolumeVsPrior20DayAverage: 1.5,
          fiveSessionReturnPct: { minimum: 0, maximum: 12 },
          minimumDistanceFromTrailing252SessionHighPct: -5,
        },
        rankInputs: [
          "current session volume divided by the prior 20-session average volume",
          "distance from the trailing 252-session high",
          "five-session return",
          "20-session excess return versus SPY",
        ],
        lifecycle: {
          rebalanceSessions: 1,
          minimumHoldSessions: 20,
          maximumHoldSessions: 63,
          targetPositions: 10,
          fixedInitialStopPct: 12,
          maximumNextOpenGapPct: 3,
          volatilityScalingUsed: false,
        },
        parameterSelectionUsed: false,
        matchedRandomPlacebos:
          POINT_IN_TIME_SP500_ALPHA_R6_PLACEBO_SEEDS,
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
        causalPriceAndVolumeInputsOnly: true,
        historicalPhaseSeparation: true,
        genuinelyUntouchedHoldoutUsed: false,
        historicalCalendarPreviouslyInspected: true,
        strictPlaceboGateMet: false,
        reason:
          "R6 is predeclared and causally simulated, but every session through 2026-09-01 was observable before freeze. Historical evidence can reject R6; it cannot by itself prove future alpha.",
      },
      researchReferences: [
        {
          title: "The High-Volume Return Premium",
          url: "https://doi.org/10.1111/0022-1082.00349",
          implication:
            "Unusually high trading activity is treated as a discrete attention event whose continuation effect is evaluated over a roughly monthly horizon.",
        },
        {
          title: "Price Momentum and Trading Volume",
          url: "https://doi.org/10.1111/0022-1082.00280",
          implication:
            "Volume is tested jointly with recent price continuation rather than used as an unconditional bullish signal.",
        },
        {
          title: "The 52-Week High and Momentum Investing",
          url: "https://doi.org/10.1111/j.1540-6261.2004.00695.x",
          implication:
            "Nearness to a trailing high supplies the economically distinct price anchor for the event filter.",
        },
        {
          title: "... and the Cross-Section of Expected Returns",
          url: "https://www.nber.org/papers/w20592",
          implication:
            "A t-statistic above three and family-wise correction address repeated research and data-mining risk.",
        },
      ],
      limitations: [
        "All historical dates were observable before R6 was frozen; none is a genuinely untouched holdout.",
        "The causal contract is limited to adjusted price and volume because historical statement revisions and material news are not certified as-known.",
        "The 100-placebo screen is only an early rejection test; promotion still requires the separate 1,000-seed matched distribution.",
        "Only point-in-time S&P 500 membership is covered; independent cross-universe replication remains required.",
        "Volume fields are vendor supplied and adjusted-price integrity is verified, but a separate exchange-level historical volume audit is unavailable.",
      ],
      nextStep: allHistoricalScreenGatesPassed
        ? "Run the strict 1,000-seed matched event-universe placebo distribution, begin the genuinely prospective paper ledger, and require independent cross-universe replication before production promotion."
        : "Retire R6 unchanged and preserve its failure before defining an economically distinct R7 hypothesis.",
    };
    const normalizedReport = normalizePointInTimeAlphaReport(
      report,
      datasetStatus,
    );
    await persistPrivateJson(
      POINT_IN_TIME_SP500_ALPHA_R6_STORE,
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
    await persistPrivateJson(POINT_IN_TIME_SP500_ALPHA_R6_STORE, failed).catch(
      () => {},
    );
    throw error;
  }
}


export async function runPointInTimeSp500AlphaResearchR5({
  force = false,
  now = Date.now(),
} = {}) {
  const [manifest, integrity, datasetStatus] = await Promise.all([
    readPrivateJson(POINT_IN_TIME_SP500_COMPILED_CHECKPOINT_STORE),
    getPointInTimeSp500AlphaCreatorV2Integrity(),
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
    throw new Error("The canonical R5 research dataset has not finished compiling");
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
      "R5 remains blocked until the corrected price-integrity audit passes for this exact dataset",
    );
  const storedExisting = await readPrivateJson(
    POINT_IN_TIME_SP500_ALPHA_R5_STORE,
  ).catch(() => null);
  const existing = normalizePointInTimeAlphaReport(
    storedExisting,
    datasetStatus,
  );
  if (
    !force &&
    existing?.version === POINT_IN_TIME_SP500_ALPHA_R5_REPORT_VERSION &&
    existing?.status === "complete" &&
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
