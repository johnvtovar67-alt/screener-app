// Bounded, durable FMP research diagnostic.
//
// This is intentionally separate from the strict point-in-time research runner.
// It replays real historical prices and filing-availability timestamps for a
// diversified current cohort, but it cannot honestly certify survivorship-free
// membership, revision-safe statement values or as-known material-news history.
// The report therefore stays "provisional" and can never authorize live capital.

import { get, list, put } from "@vercel/blob";
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
import { simulatePointInTimePortfolio } from "./walkForwardBacktest";

export const FMP_RESEARCH_REPORT_STORE =
  "research/fmp-provisional-backtest-v1.json";
const FMP_RESEARCH_PRICE_CHECKPOINT_STORE =
  "research/fmp-provisional-price-checkpoint-v1.json";
const FMP_RESEARCH_STATEMENT_CHECKPOINT_STORE =
  "research/fmp-provisional-statement-checkpoint-v1.json";
const REPORT_VERSION = 7;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RUNNING_TTL_MS = 4 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const PRICE_HISTORY_SOURCE = "historical-price-eod/dividend-adjusted";
// FMP documents a five-request concurrency ceiling. Start requests globally at
// a deliberately slower cadence as well so large-history responses cannot form
// a burst at the next endpoint boundary.
const REQUEST_START_SPACING_MS = 300;
const PRICE_HISTORY_CONCURRENCY = 3;
const PRICE_SYMBOLS_PER_RUN = 75;
const STATEMENT_SYMBOLS_PER_RUN = 24;
const DEFAULT_SYMBOL_LIMIT = 250;
const MAX_SYMBOL_LIMIT = 500;

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
      a.endDate === b.endDate &&
      a.priceSource === b.priceSource &&
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
  const blob =
    blobs.find((item) => item.pathname === pathname) ||
    blobs[0];
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
      if (delay)
        await new Promise((resolve) => setTimeout(resolve, delay));
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
        const error = new Error(
          `FMP ${path} failed: ${response.status}${payload?.message ? ` - ${payload.message}` : ""}`,
        );
        error.status = response.status;
        if ([401, 402, 403, 404].includes(response.status)) throw error;
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

export function selectResearchUniverse(candidates = [], limit = DEFAULT_SYMBOL_LIMIT) {
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
    (a, b) => bySector.get(b).length - bySector.get(a).length || a.localeCompare(b),
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

export function normalizeHistoricalBars(rows = [], { sourceAdjusted = false } = {}) {
  return asArray(rows)
    .map((row) => {
      const rawClose = number(row.close ?? row.price);
      const adjustedClose = number(row.adjClose ?? row.adjustedClose);
      const factor =
        !sourceAdjusted && rawClose > 0 && adjustedClose > 0
          ? adjustedClose / rawClose
          : 1;
      const adjusted = sourceAdjusted || adjustedClose > 0;
      return {
        date: String(row.date || "").slice(0, 10),
        open: number(row.open) > 0 ? number(row.open) * factor : null,
        high: number(row.high) > 0 ? number(row.high) * factor : null,
        low: number(row.low) > 0 ? number(row.low) * factor : null,
        close:
          !sourceAdjusted && adjustedClose > 0 ? adjustedClose : rawClose,
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
    const observationTimes = [...new Set(rows.map(acceptedAt).filter(Boolean))].sort();
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
          (number(latestBalance.shortTermDebt, 0) +
            number(latestBalance.longTermDebt, 0)),
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
        prior[0]?.weightedAverageShsOutDil ??
          prior[0]?.weightedAverageShsOut,
      );
      const grossMargin = ratio(grossProfitTtm, revenueTtm, 100);
      const operatingMargin = ratio(operatingIncomeTtm, revenueTtm, 100);
      const freeCashFlowMargin = ratio(freeCashFlowTtm, revenueTtm, 100);
      const returnOnEquity = ratio(netIncomeTtm, equity, 100);
      const freeCashFlowConversion =
        netIncomeTtm > 0 ? ratio(freeCashFlowTtm, netIncomeTtm, 100) : null;
      const revenueGrowth = growth(revenueTtm, priorRevenueTtm);
      const earningsGrowth = growth(netIncomeTtm, priorNetIncomeTtm);
      const operatingIncomeGrowth = growth(
        operatingIncomeTtm,
        priorOperatingIncomeTtm,
      );
      const shareChangeYoY = growth(
        sharesOutstanding,
        priorSharesOutstanding,
      );
      const coverage = [
        grossMargin,
        operatingMargin,
        ratio(debt, equity),
        revenueGrowth,
        earningsGrowth,
        sharesOutstanding,
      ].filter((value) => value !== null && Number.isFinite(Number(value))).length;
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
        debtToEquity: ratio(debt, equity),
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

function metricsSummary(run = {}, { tradeLimit = 200, skippedLimit = 100 } = {}) {
  const { dailyReturns, ...metrics } = run.metrics || {};
  return {
    metrics,
    tradeSample: tradeLimit ? (run.trades || []).slice(-tradeLimit) : [],
    skippedOrderSample: skippedLimit
      ? (run.skippedOrders || []).slice(-skippedLimit)
      : [],
    endingCash: run.endingCash,
    openPositionCount: (run.openPositions || []).length,
  };
}

function parameterScore(run = {}) {
  const metrics = run.metrics || {};
  const closed=number(metrics.closedTrades,0),profitFactor=Math.min(2.5,number(metrics.profitFactor,0));
  const tradePenalty=closed<12?(12-closed)*0.12:0;
  const turnoverPenalty=Math.max(0,number(metrics.annualizedTurnoverPct,0)-300)/500;
  return number(metrics.totalReturnPct,-100)/8+
    number(metrics.exposureMatchedAlphaPct,-100)/5+
    number(metrics.excessReturnPct,-100)/30+
    number(metrics.sharpe,-10)*0.8+
    profitFactor*0.25-
    Math.abs(Math.min(0,number(metrics.maxDrawdownPct,0)))/15-
    turnoverPenalty-tradePenalty;
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
    closed.reduce(
      (total, trade) => total + Math.min(0, tradePnl(trade)),
      0,
    ),
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
    (total, run) => total + Math.max(1, run.curve?.length || 0),
    0,
  );
  const weighted = (field) =>
    sessions
      ? runs.reduce(
          (total, run) =>
            total +
            number(run.metrics?.[field]) * Math.max(1, run.curve?.length || 0),
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
      trades: runs.reduce((total, run) => total + number(run.metrics?.trades), 0),
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
      averageExposurePct: roundMetric(weighted("averageExposurePct")),
      turnoverPct: roundMetric(weighted("annualizedTurnoverPct") * years),
      annualizedTurnoverPct: roundMetric(weighted("annualizedTurnoverPct")),
      dailyReturns,
    },
    trades: runs.flatMap((run) => run.trades || []),
    skippedOrders: runs.flatMap((run) => run.skippedOrders || []),
    curve: runs.flatMap((run) => run.curve || []),
    openPositions: [],
    endingCash: null,
  };
}

function simulationOptions(extra = {}) {
  return {
    initialCapital: 100_000,
    minimumTrade: 750,
    slippageBps: 12,
    commissionPerOrder: 0,
    positionDecision: portfolioDecision,
    capitalAllowance,
    portfolioRiskSnapshot,
    portfolioContributionGate,
    capitalSignalEligible,
    swingTimeReview,
    positionReunderwrite: reunderwriteExistingPosition,
    winnerTrimGate,
    recordWinnerTrim,
    ...extra,
  };
}

function runProvisionalWindows(dataset) {
  const sessions = dataset.sessions || [];
  const firstUsable = Math.min(252, Math.max(0, sessions.length - 3));
  const usable = sessions.slice(firstUsable);
  if (usable.length < 630)
    throw new Error(
      `Only ${usable.length} post-warmup sessions are available; 630 are required`,
    );
  const folds = [];
  const trainSessions = 378;
  const validationSessions = 126;
  const auditSessions = 126;
  const stepSessions = 126;
  for (
    let start = 0, fold = 1;
    start + trainSessions + validationSessions + auditSessions <= usable.length;
    start += stepSessions, fold++
  ) {
    const trainEnd = start + trainSessions;
    const validationEnd = trainEnd + validationSessions;
    const auditEnd = validationEnd + auditSessions;
    folds.push({
      fold,
      train: { start: usable[start].date, end: usable[trainEnd - 1].date },
      validation: {
        start: usable[trainEnd].date,
        end: usable[validationEnd - 1].date,
      },
      audit: {
        start: usable[validationEnd].date,
        end: usable[auditEnd - 1].date,
      },
    });
  }
  const antiChase = {
    requireRelativeStrength: true,
    maxAlpha20VsSpy: 4,
    minAlpha60VsSpy: -2,
    minAlpha60VsQqq: -5,
    stopCooldownSessions: 10,
    relativeExitMinHoldSessions: 10,
  };
  const factorSelection = {
    ...antiChase,
    minimumResearchFactorCoverage: 7,
    minQualityPercentile: 40,
    minMomentumPercentile: 55,
    minCompositePercentile: 55,
    minSectorCompositePercentile: 40,
    maxVolatility60Pct: 65,
    relativeStrengthRankWeight: 0.25,
    shortTermAlphaRankPenalty: 0.35,
    researchFactorRankWeight: 0.14,
    controlledPullbackRankWeight: 0.05,
    maxIssuerPositions: 1,
  };
  const staticLifecycle = {
    relativeExitAlpha20: -7,
    timeStopSessions: 50,
    timeStopMaxReturnPct: 0,
    ratchetRiskPlanStop: false,
    profitTrailActivationPct: 15,
    profitTrailDistancePct: 10,
  };
  const grid = [
    {
      thesisId: "live-policy-control",
      buyTargetPct: 0.06,
      strongBuyTargetPct: 0.09,
      maxPositions: 12,
    },
    {
      ...antiChase,
      ...staticLifecycle,
      thesisId: "anti-chase-static-control",
      buyTargetPct: 0.055,
      strongBuyTargetPct: 0.055,
      maxPositions: 12,
      relativeStrengthRankWeight: 0.75,
      shortTermAlphaRankPenalty: 0.5,
    },
    {
      ...factorSelection,
      thesisId: "quality-momentum-selection",
      buyTargetPct: 0.055,
      strongBuyTargetPct: 0.055,
      maxPositions: 12,
    },
    {
      ...factorSelection,
      ...staticLifecycle,
      thesisId: "quality-momentum-static",
      buyTargetPct: 0.06,
      strongBuyTargetPct: 0.06,
      maxPositions: 10,
    },
    {
      ...factorSelection,
      ...staticLifecycle,
      thesisId: "quality-momentum-risk-balanced",
      buyTargetPct: 0.07,
      strongBuyTargetPct: 0.07,
      maxPositions: 12,
      volatilityTargetPct: 30,
      riskBudgetPct: 0.45,
      minimumInitialStopPct: 6,
      maximumInitialStopPct: 10,
      maxSectorPositions: 3,
      maxSectorPct: 0.28,
    },
  ];
  const evaluatedRuns = grid.map((parameters, index) => {
    const foldRuns = folds.map((fold) => {
      const run = (window) =>
        simulatePointInTimePortfolio(
          dataset,
          simulationOptions({
            ...parameters,
            startDate: window.start,
            endDate: window.end,
          }),
        );
      return {
        fold: fold.fold,
        windows: fold,
        train: run(fold.train),
        validation: run(fold.validation),
        rollingAudit: run(fold.audit),
      };
    });
    const selectionScores = foldRuns.flatMap((fold) => [
      parameterScore(fold.train),
      parameterScore(fold.validation),
    ]);
    const train = aggregateResearchRuns(foldRuns.map((fold) => fold.train));
    const validation = aggregateResearchRuns(
      foldRuns.map((fold) => fold.validation),
    );
    const rollingAudit = aggregateResearchRuns(
      foldRuns.map((fold) => fold.rollingAudit),
    );
    return {
      index,
      parameters,
      foldRuns,
      robustScore:
        Math.min(...selectionScores) + average(selectionScores) * 0.15,
      worstSelectionScore: Math.min(...selectionScores),
      train: metricsSummary(train, { tradeLimit: 80, skippedLimit: 30 }),
      validation: metricsSummary(validation, { tradeLimit: 80, skippedLimit: 30 }),
      rollingAudit: metricsSummary(rollingAudit, {
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
  });
  const evaluated = evaluatedRuns.map(({ foldRuns, ...candidate }) => candidate);
  evaluated.sort(
    (a, b) => b.robustScore - a.robustScore || a.index - b.index,
  );
  const selected = evaluated[0];
  const selectedRun = evaluatedRuns.find(
    (candidate) => candidate.index === selected.index,
  );
  const walkForwardSelections = folds.map((fold, foldIndex) => {
    const choices = evaluatedRuns
      .map((candidate) => {
        const runs = candidate.foldRuns[foldIndex];
        const trainScore = parameterScore(runs.train);
        const validationScore = parameterScore(runs.validation);
        return {
          index: candidate.index,
          parameters: candidate.parameters,
          score:
            Math.min(trainScore, validationScore) +
            average([trainScore, validationScore]) * 0.15,
          audit: runs.rollingAudit,
        };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const choice = choices[0];
    return {
      fold: fold.fold,
      windows: fold,
      selectedParameters: choice.parameters,
      selectionScore: choice.score,
      audit: choice.audit,
    };
  });
  const walkForwardAudit = aggregateResearchRuns(
    walkForwardSelections.map((selection) => selection.audit),
  );
  const alphaByFold = walkForwardSelections.map((selection) =>
    number(selection.audit.metrics?.exposureMatchedAlphaPct),
  );
  const profitFactorByFold = walkForwardSelections.map((selection) =>
    number(selection.audit.metrics?.profitFactor),
  );
  const returnByFold = walkForwardSelections.map((selection) =>
    number(selection.audit.metrics?.totalReturnPct),
  );
  const full = simulatePointInTimePortfolio(
    dataset,
    simulationOptions({
      ...selected.parameters,
      startDate: usable[0].date,
      endDate: usable.at(-1).date,
    }),
  );
  return {
    windows: { folds },
    selectedParameters: selected.parameters,
    selectionScore: selected.robustScore,
    candidates: evaluated,
    rollingRegimeAudit: selected.rollingAudit,
    walkForwardSelectionAudit: {
      summary: metricsSummary(walkForwardAudit, {
        tradeLimit: 120,
        skippedLimit: 40,
      }),
      folds: walkForwardSelections.map(({ audit, ...selection }) => ({
        ...selection,
        audit: metricsSummary(audit, { tradeLimit: 0, skippedLimit: 0 }),
      })),
      stability: {
        positiveExposureMatchedAlphaFolds: alphaByFold.filter(
          (value) => value > 0,
        ).length,
        positiveReturnFolds: returnByFold.filter((value) => value > 0).length,
        profitFactorAboveOneFolds: profitFactorByFold.filter(
          (value) => value > 1,
        ).length,
        foldCount: folds.length,
        worstExposureMatchedAlphaPct: Math.min(...alphaByFold),
        medianExposureMatchedAlphaPct: [...alphaByFold].sort(
          (a, b) => a - b,
        )[Math.floor(alphaByFold.length / 2)],
      },
    },
    reusedTestAudit: selectedRun.rollingAudit,
    untouchedTest: null,
    fullPeriodDiagnostic: metricsSummary(full),
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
    failures: [...asArray(initial?.failures)],
    attempts: { ...(initial?.attempts || {}) },
  };
  const endpoints = [
    ["income-statement", "incomeRows"],
    ["balance-sheet-statement", "balanceRows"],
    ["cash-flow-statement", "cashFlowRows"],
  ];
  const completed = new Set(output.completedSymbols.map(symbolOf));
  const pending = symbols.filter((symbol) => !completed.has(symbol));
  const scheduled = pending.slice(0, maxSymbols);
  const limit = String(Math.min(40, Math.max(28, (endYear - startYear + 1) * 4)));
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
          const year = number(row.calendarYear) ??
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
        if (output.attempts[symbol] >= 2) completed.add(symbol);
        continue;
      }
      output.incomeRows.push(...asArray(result.incomeRows));
      output.balanceRows.push(...asArray(result.balanceRows));
      output.cashFlowRows.push(...asArray(result.cashFlowRows));
      completed.add(symbol);
      output.failures = output.failures.filter(
        (failure) => symbolOf(failure?.symbol || failure?.item) !== symbol,
      );
    }
    output.completedSymbols = [...completed];
    if (onCheckpoint) await onCheckpoint(output);
  }
  output.remainingSymbols = symbols.filter((symbol) => !completed.has(symbol));
  return output;
}

async function fetchPriceHistory(
  client,
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
  const attempts = { ...(initial?.attempts || {}) };
  let failures = [...asArray(initial?.priceFailures)];
  const pending = symbols.filter((symbol) => !completed.has(symbol));
  const scheduled = pending.slice(0, maxSymbols);

  const checkpoint = async () => {
    const output = {
      histories: Object.fromEntries(histories),
      completedSymbols: [...completed],
      attempts,
      priceFailures: failures,
      remainingSymbols: symbols.filter((symbol) => !completed.has(symbol)),
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
        const rows = await client.fetchStable(PRICE_HISTORY_SOURCE, {
          symbol: fmpSymbol(symbol),
          from,
          to,
        });
        return {
          symbol,
          bars: normalizeHistoricalBars(rows, { sourceAdjusted: true }),
        };
      },
    );
    for (let index = 0; index < results.length; index++) {
      const symbol = batch[index];
      const result = results[index];
      if (result?.bars?.length) {
        histories.set(symbol, result.bars);
        completed.add(symbol);
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
        error: result?.error || { message: "No adjusted price history returned" },
      });
      // One retry on a later invocation distinguishes a temporary feed failure
      // from a genuinely unavailable history without blocking the entire cohort.
      if (attempts[symbol] >= 2) completed.add(symbol);
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
  if (
    !force &&
    existing?.version === REPORT_VERSION &&
    existing?.status === "complete" &&
    Number.isFinite(existingTime) &&
    now - existingTime < DEFAULT_MAX_AGE_MS
  )
    return { ...existing, cached: true };
  if (
    !force &&
    existing?.status === "running" &&
    Number.isFinite(existingTime) &&
    now - existingTime < RUNNING_TTL_MS
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
    status: "running",
    claimStatus: "provisional-current-universe-diagnostic",
    startedAt,
    message: "FMP history acquisition and chronological replay are in progress.",
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
    const endDate = isoDay(now);
    const fromDate = isoDay(
      Date.UTC(new Date(now).getUTCFullYear() - 4, 0, 1),
    );
    const symbols = [...new Set(selected.map((row) => row.symbol))];
    const priceSymbols = [...symbols, "SPY", "QQQ"];
    const acquisitionSignature = JSON.stringify({
      fromDate,
      endDate,
      priceSource: PRICE_HISTORY_SOURCE,
      symbols: priceSymbols.slice().sort(),
    });
    const savedPrices = await readPrivateJson(
      FMP_RESEARCH_PRICE_CHECKPOINT_STORE,
    ).catch(() => null);
    const initialPrices =
      savedPrices?.signature === acquisitionSignature ||
      equivalentAcquisitionSignature(
        savedPrices?.signature,
        acquisitionSignature,
      )
        ? savedPrices
        : null;
    const priceHistory = await fetchPriceHistory(
      client,
      priceSymbols,
      fromDate,
      endDate,
      {
        initial: initialPrices,
        onCheckpoint: (checkpoint) =>
          persistPrivateJson(FMP_RESEARCH_PRICE_CHECKPOINT_STORE, {
            version: 2,
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
          totalSymbols: priceSymbols.length,
          remainingSymbols: priceHistory.remainingSymbols.length,
          failures: priceFailures.length,
        },
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
          totalSymbols: usableSymbols.length,
          remainingSymbols: statementHistory.remainingSymbols.length,
          failures: statementHistory.failures.length,
        },
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
    const rawDataset = rawDatasetFromHistory({
      profiles,
      histories: finalHistories,
      fundamentals: fundamentals.filter((row) => finalSet.has(row.symbol)),
    });
    const compiled = compilePointInTimeSignals(rawDataset, {
      liquidity: { maxCandidates: 500 },
    });
    const replay = runProvisionalWindows(compiled);
    const bars = [...finalHistories.values()].flat();
    const adjustedBars = bars.filter((bar) => bar.adjusted).length;
    const completedAt = new Date().toISOString();
    const report = {
      version: REPORT_VERSION,
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
        ordinaryBuyPersistenceUsesDistinctSessions: true,
        strongBuyStillRequiresAllHardGates: true,
        portfolioRiskPolicyReplayed: true,
        positionLifecycleReplayed: true,
        untouchedChronologicalTestWindow: false,
        parameterSelectionUsesTrainAndValidationOnly: true,
        rollingRegimeFolds: replay.windows.folds.length,
        rollingFoldSelectionUsesOnlyPriorWindows: true,
        rollingFoldAuditsAreChronologicallyUnseen: true,
        globalThesisAuditRemainsDiagnosticOnly: true,
        benchmarkRelativeMomentum20_60_120Sessions: true,
        crossSectionalQualityMomentumRanks: true,
        sectorRelativeRanks: true,
        exposureMatchedBenchmarkAttribution: true,
        volatilityScaledSizingVariants: true,
        issuerConcentrationVariants: true,
        immutableEntryStopDiagnostics: true,
        regimeAwareEntryVariants: true,
        stopOutCooldownVariants: true,
        relativeStrengthAndTimeExitVariants: true,
        currentCohortOnly: true,
        survivorshipBiasFree: false,
        historicalMembershipPointInTime: false,
        filingAvailabilityUsesAcceptedDate: true,
        fundamentalValuesRevisionSafe: false,
        materialNewsHistoryPointInTime: false,
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
        sectors: [...new Set(profiles.map((row) => row.sector || "Other"))].length,
        fromDate,
        toDate: endDate,
        compiledSessions: compiled.sessions.length,
      },
      dataQuality: {
        priceSource: PRICE_HISTORY_SOURCE,
        adjustedBarCoveragePct: bars.length
          ? Math.round((adjustedBars / bars.length) * 10_000) / 100
          : 0,
        historicalFundamentalSnapshots: fundamentals.length,
        priceFailures: priceFailures.slice(0, 20),
        statementFailures: statementHistory.failures.slice(0, 20),
        provider: client.stats(),
      },
      replay,
      limitations: [
        "The cohort is selected from today's diversified discovery candidates, so survivorship and current-selection bias remain.",
        "The default provisional cohort is 250 names; this is broader than the prior 120-name run but is not the full historical US equity opportunity set.",
        "FMP acceptedDate controls when a filing becomes usable, but the returned statement values are not certified as originally reported rather than later restated.",
        "Historical as-known material-news coverage is unavailable; the production event-risk gate is not reproduced.",
        "Delisted securities and explicit delisting returns are absent from this provisional cohort.",
        "This diagnostic tests mechanics and obvious failure modes; it is not evidence that future recommendations will outperform.",
      ],
      nextResearchRequirement:
        "Run the strict screener-pit-v1 walk-forward contract with historical membership, delistings, revision-safe fundamentals and point-in-time material news before making an alpha claim.",
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
