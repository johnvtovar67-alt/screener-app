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
export const V11_FORWARD_EXTENSION_START = "2026-07-14";
export const V11_FORWARD_EXTENSION_TARGET = "2026-09-01";
const REPORT_VERSION = 12;
const COMPILED_CHECKPOINT_SCHEMA = 3;
const COMPILE_SESSIONS_PER_RUN = 20;
const FORWARD_REFRESH_COMPILE_SESSIONS_PER_RUN = 200;
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
  return {
    totalReturnPct: number(metrics.totalReturnPct),
    sharpe: number(metrics.sharpe),
    maxDrawdownPct: number(metrics.maxDrawdownPct),
    profitFactor: number(metrics.profitFactor),
    expectancyPct: number(metrics.tradeDiagnostics?.expectancyPct),
    closedTrades: number(metrics.closedTrades, 0),
    averageActiveExposurePct: number(metrics.averageActiveExposurePct),
    annualizedTurnoverPct: number(metrics.annualizedTurnoverPct),
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

// Chronologically subsequent V11 evidence. This is intentionally separate
// from the frozen three-fold audit: appending a new session must never rewrite
// the historical baseline or silently retune the thesis.
export async function runV11ForwardExtension({ force = false } = {}) {
  const existing = await getV11ForwardExtensionReport();
  if (
    !force &&
    existing?.status === "complete" &&
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
  const restored = [];
  for (const chunk of manifest.chunks) {
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
  const metrics = run?.metrics || {};
  const spy = metrics.benchmarkComparisons?.SPY || {};
  const qqq = metrics.benchmarkComparisons?.QQQ || {};
  const report = {
    version: 1,
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
    evidenceAssessment: {
      chronologicallySubsequentToAudit: true,
      frozenPolicy: true,
      independentlySelectedHoldout: false,
      eligibleForAlphaClaim: false,
      reason:
        "This is a short post-audit extension of a post-selected thesis, not an independently selected long holdout.",
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
