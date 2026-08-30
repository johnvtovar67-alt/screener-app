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
  V10_DEVELOPMENT_PLACEBO_SEEDS,
  V10_EVIDENCE_REQUIREMENTS,
  V10_THESIS_ID,
  v10AuditControlDefinitions,
  v10StrategyOptions,
} from "./v10ResearchContract";

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
const REPORT_VERSION = 10;
const COMPILED_CHECKPOINT_SCHEMA = 3;
const COMPILE_SESSIONS_PER_RUN = 20;
const REPLAY_CHECKPOINT_SCHEMA = 9;
// A fold is exactly train + validation + audit. Processing all three together
// removes an artificial hourly delay while retaining a durable checkpoint after
// every independently interpretable fold.
const REPLAY_WINDOWS_PER_RUN = 3;
const REPLAY_WARMUP_SESSIONS = 2;
const V10_ACTIVE_THESIS_COUNT = 1;
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

function buildV10ResearchFolds(sessionDates = []) {
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
  const { dates, folds } = buildV10ResearchFolds(sessionDates);
  const windowsPerFold = 3;
  const windowsPerCandidate = folds.length * windowsPerFold;
  const totalWindows = V10_ACTIVE_THESIS_COUNT * windowsPerCandidate;
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
  const { usableDates, folds } = buildV10ResearchFolds(calendar);
  const grid = [v10StrategyOptions()];
  if (grid.length !== V10_ACTIVE_THESIS_COUNT)
    throw new Error("V10 replay thesis count is inconsistent");
  const auditControlDefinitions = v10AuditControlDefinitions();
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
        foldRun?.auditControls?.simpleQuality?.metrics &&
        foldRun?.auditControls?.transparentBullCyclePullback?.metrics &&
        asArray(foldRun?.auditControls?.randomPlacebos).length ===
          V10_DEVELOPMENT_PLACEBO_SEEDS
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
          `V10 ${key}`,
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
            simpleQuality: controlRuns[1],
            transparentBullCyclePullback: controlRuns[2],
            randomPlacebos: Array.from(
              { length: V10_DEVELOPMENT_PLACEBO_SEEDS },
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
    throw new Error("The predeclared V10 thesis is missing completed folds");
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
  const simpleQualityAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.simpleQuality),
  );
  const transparentBullCyclePullbackAudit = aggregateResearchRuns(
    foldRuns.map((fold) => fold.auditControls.transparentBullCyclePullback),
  );
  const randomPlaceboAudits = Array.from(
    { length: V10_DEVELOPMENT_PLACEBO_SEEDS },
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
      seedCount: V10_DEVELOPMENT_PLACEBO_SEEDS,
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
        V10_EVIDENCE_REQUIREMENTS.strictPointInTimePlaceboSeeds,
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
    beatsSimpleMomentumControl:
      thesisTotalReturn >
      number(simpleMomentumAudit.metrics?.totalReturnPct, Infinity),
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
      V10_EVIDENCE_REQUIREMENTS.minimumClosedRoundTrips,
    minimumActiveStockExposure:
      number(walkForwardMetrics.averageActiveExposurePct, 0) >=
      V10_EVIDENCE_REQUIREMENTS.minimumAverageActiveStockExposurePct,
    noBenchmarkCompletionSleeve:
      parameters.benchmarkCompletionSymbol == null &&
      number(walkForwardMetrics.averageBenchmarkSleevePct, 0) === 0,
  };
  const provisionalEvidencePass = Object.values(evidenceChecks).every(Boolean);
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
          status: provisionalEvidencePass
            ? "promising-provisional"
            : "alpha-not-demonstrated",
          pass: provisionalEvidencePass,
          checks: evidenceChecks,
          minimumClosedRoundTrips:
            V10_EVIDENCE_REQUIREMENTS.minimumClosedRoundTrips,
          minimumAverageActiveStockExposurePct:
            V10_EVIDENCE_REQUIREMENTS.minimumAverageActiveStockExposurePct,
          primaryAlphaMeasure: V10_EVIDENCE_REQUIREMENTS.primaryAlphaMeasure,
          selectorUsed: false,
          benchmarkCompletionSleeveUsed: false,
          developmentPlaceboSeeds: V10_DEVELOPMENT_PLACEBO_SEEDS,
          strictPointInTimePlaceboRequirement:
            V10_EVIDENCE_REQUIREMENTS.strictPointInTimePlaceboSeeds,
          capitalClaimAuthorized: false,
        },
      },
      reusedTestAudit: candidate.rollingAudit,
      untouchedTest: null,
      fullPeriodDiagnostic: full ? metricsSummary(full) : null,
    },
  };
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
    now - existingTime < DEFAULT_MAX_AGE_MS
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
    claimStatus: "provisional-current-universe-diagnostic",
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
    const selected = selectResearchUniverse(researchSource, symbolLimit);
    const endDate =
      latestCompletedMarketSessionDay(new Date(now)) || isoDay(now);
    const fromDate = isoDay(Date.UTC(new Date(now).getUTCFullYear() - 4, 0, 1));
    const symbols = [...new Set(selected.map((row) => row.symbol))];
    const priceSymbols = [...symbols, "SPY", "QQQ"];
    const savedPrices = await readPrivateJson(
      FMP_RESEARCH_PRICE_CHECKPOINT_STORE,
    ).catch(() => null);
    const savedPriceSignature = parseSignature(savedPrices?.signature);
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
    const savedInitialPrices =
      savedPrices?.signature === acquisitionSignature ||
      equivalentAcquisitionSignature(
        savedPrices?.signature,
        acquisitionSignature,
      )
        ? savedPrices
        : null;
    const initialPrices = {
      ...(savedInitialPrices || {}),
      histories: {
        SPY: priceContractResult.benchmarkBars,
        ...(savedInitialPrices?.histories || {}),
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
    const savedCompiledMatches = Boolean(
      savedCompiled?.schema === COMPILED_CHECKPOINT_SCHEMA &&
      savedCompiled?.signature === compiledSignature &&
      chunkManifestValid &&
      number(savedCompiled?.completedSessions, -1) === expectedChunkStart,
    );
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
        maxSessions: COMPILE_SESSIONS_PER_RUN,
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
        claimStatus: "provisional-current-universe-diagnostic",
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
      thesisContract: v10StrategyOptions({ contractId: V10_THESIS_ID }),
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
          "The predeclared V10 thesis is being replayed in bounded, durable batches.",
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
      claimStatus: "provisional-current-universe-diagnostic",
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
        activeThesisUsesIndependentResearchLifecycle: true,
        activeThesisRequiresProductionBuyLabel: false,
        fullEvaluatedEvidenceCandidateSource: true,
        untouchedChronologicalTestWindow: false,
        predeclaredActiveThesisCount: V10_ACTIVE_THESIS_COUNT,
        parameterSelectorUsed: false,
        rollingRegimeFolds: replay.windows.folds.length,
        rollingFoldSelectionUsesOnlyPriorWindows: false,
        rollingFoldAuditsAreChronologicallyUnseen: false,
        globalThesisAuditRemainsDiagnosticOnly: true,
        fullPeriodDiagnosticOmittedForBoundedReplay: true,
        benchmarkRelativeMomentum20_60_120Sessions: true,
        benchmarkComparisonSymbols: ["SPY", "QQQ"],
        simpleAndExposureMatchedBenchmarkAttribution: true,
        residualCapitalBenchmarkCompletionSymbol: null,
        residualCashRemainsCash: true,
        passiveBenchmarkReturnNeverCountedAsAlpha: true,
        primaryAlphaMeasure:
          "simple total-return difference versus SPY and QQQ",
        crossSectionalQualityMomentumRanks: true,
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
        simpleFactorControls: ["momentum", "quality"],
        developmentRandomPlaceboSeeds: V10_DEVELOPMENT_PLACEBO_SEEDS,
        currentCohortOnly: true,
        survivorshipBiasFree: false,
        historicalMembershipPointInTime: false,
        filingAvailabilityUsesAcceptedDate: true,
        fundamentalValuesRevisionSafe: false,
        materialNewsHistoryPointInTime: false,
        sameHistoricalWindowsReusedAfterV7V8V9Diagnosis: true,
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
        "V7, V8 and V9 are retained only as failed external baselines; V9's SPY completion sleeve is rejected and cannot influence V10 returns.",
        "The optional overlapping full-period diagnostic is omitted so production execution remains durably bounded; the primary evidence remains the chronological walk-forward audit.",
        "V10 was designed after reviewing V7 through V9 on these historical dates. Its results are a contaminated development comparison, not a new untouched test.",
        "The 25 deterministic random-placebo portfolios are a fast development control, not the 1,000-plus placebo distribution required by the strict point-in-time evidence contract.",
        "Cash remains cash. Exposure-matched attribution is reported only as a secondary diagnostic and cannot satisfy the primary benchmark-beating gate.",
        "This diagnostic tests mechanics and obvious failure modes; it is not evidence that future recommendations will outperform.",
      ],
      nextResearchRequirement:
        "Run the frozen V10 thesis on genuinely untouched or sequestered data under screener-pit-v1, including historical membership, delistings, revision-safe fundamentals, point-in-time material news and at least 1,000 matched random placebos before making an alpha claim or changing live recommendations.",
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
