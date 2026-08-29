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
const REPORT_VERSION = 4;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RUNNING_TTL_MS = 4 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
// FMP documents a five-request concurrency ceiling. Start requests globally at
// a deliberately slower cadence as well so large-history responses cannot form
// a burst at the next endpoint boundary.
const REQUEST_START_SPACING_MS = 300;
const PRICE_HISTORY_CONCURRENCY = 3;
const STATEMENT_SYMBOLS_PER_RUN = 6;
const DEFAULT_SYMBOL_LIMIT = 120;
const MAX_SYMBOL_LIMIT = 250;

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
  const normalized = candidates
    .map((row) => ({ ...row, symbol: symbolOf(row) }))
    .filter((row) => row.symbol);
  const bySector = new Map();
  for (const row of normalized) {
    const sector = String(row.sector || row.primaryTheme || "Other");
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(row);
  }
  for (const rows of bySector.values())
    rows.sort(
      (a, b) =>
        number(b.discoveryScore, 0) - number(a.discoveryScore, 0) ||
        a.symbol.localeCompare(b.symbol),
    );
  const selected = [];
  const seen = new Set();
  const sectors = [...bySector.keys()].sort();
  let depth = 0;
  while (selected.length < limit) {
    let added = false;
    for (const sector of sectors) {
      const row = bySector.get(sector)?.[depth];
      if (!row || seen.has(row.symbol)) continue;
      selected.push(row);
      seen.add(row.symbol);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    depth++;
  }
  return selected;
}

export function normalizeHistoricalBars(rows = []) {
  return asArray(rows)
    .map((row) => {
      const rawClose = number(row.close ?? row.price);
      const adjustedClose = number(row.adjClose ?? row.adjustedClose);
      const factor =
        rawClose > 0 && adjustedClose > 0 ? adjustedClose / rawClose : 1;
      return {
        date: String(row.date || "").slice(0, 10),
        open: number(row.open) > 0 ? number(row.open) * factor : null,
        high: number(row.high) > 0 ? number(row.high) * factor : null,
        low: number(row.low) > 0 ? number(row.low) * factor : null,
        close: adjustedClose > 0 ? adjustedClose : rawClose,
        volume: number(row.volume, 0),
        adjusted: adjustedClose > 0,
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
      const grossMargin = ratio(grossProfitTtm, revenueTtm, 100);
      const operatingMargin = ratio(operatingIncomeTtm, revenueTtm, 100);
      const revenueGrowth = growth(revenueTtm, priorRevenueTtm);
      const earningsGrowth = growth(netIncomeTtm, priorNetIncomeTtm);
      const operatingIncomeGrowth = growth(
        operatingIncomeTtm,
        priorOperatingIncomeTtm,
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
        debtToEquity: ratio(debt, equity),
        currentRatio: ratio(currentAssets, currentLiabilities),
        quickRatio: ratio(cash + receivables, currentLiabilities),
        revenueGrowth,
        earningsGrowth,
        operatingIncomeGrowth,
        sharesOutstanding,
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

function metricsSummary(run = {}) {
  const { dailyReturns, ...metrics } = run.metrics || {};
  return {
    metrics,
    tradeSample: (run.trades || []).slice(-200),
    skippedOrderSample: (run.skippedOrders || []).slice(-100),
    endingCash: run.endingCash,
    openPositionCount: (run.openPositions || []).length,
  };
}

function parameterScore(run = {}) {
  const metrics = run.metrics || {};
  const closed=number(metrics.closedTrades,0),profitFactor=Math.min(2.5,number(metrics.profitFactor,0));
  const tradePenalty=closed<12?(12-closed)*0.12:0;
  const turnoverPenalty=Math.max(0,number(metrics.annualizedTurnoverPct,0)-300)/500;
  return number(metrics.totalReturnPct,-100)/10+
    number(metrics.excessReturnPct,-100)/12+
    number(metrics.sharpe,-10)*0.8+
    profitFactor*0.25-
    Math.abs(Math.min(0,number(metrics.maxDrawdownPct,0)))/15-
    turnoverPenalty-tradePenalty;
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
  if (usable.length < 378)
    throw new Error(
      `Only ${usable.length} post-warmup sessions are available; 378 are required`,
    );
  const trainEnd = Math.floor(usable.length * 0.55);
  const validationEnd = Math.floor(usable.length * 0.75);
  const windows = {
    train: { start: usable[0].date, end: usable[trainEnd - 1].date },
    validation: {
      start: usable[trainEnd].date,
      end: usable[validationEnd - 1].date,
    },
    test: {
      start: usable[validationEnd].date,
      end: usable.at(-1).date,
    },
  };
  // Predeclared thesis variants. These are selected only on train/validation;
  // the previously viewed final window is a reused audit, never an untouched test.
  const base={requireRelativeStrength:true,relativeStrengthRankWeight:0.75,stopCooldownSessions:10,relativeExitMinHoldSessions:10};
  const grid = [
    { thesisId:"legacy-control",buyTargetPct:0.04,strongBuyTargetPct:0.07,maxPositions:12 },
    {...base,thesisId:"leader-pullback-static",buyTargetPct:0.06,strongBuyTargetPct:0.06,maxPositions:10,minAlpha20VsSpy:-5,maxAlpha20VsSpy:5,minAlpha60VsSpy:2,minAlpha60VsQqq:-2,defensiveRegimeMinAlpha60:8,relativeExitAlpha20:-6,timeStopSessions:45,timeStopMaxReturnPct:0,ratchetRiskPlanStop:false,profitTrailActivationPct:15,profitTrailDistancePct:10},
    {...base,thesisId:"leader-pullback-wide",buyTargetPct:0.055,strongBuyTargetPct:0.055,maxPositions:12,minAlpha20VsSpy:-7,maxAlpha20VsSpy:7,minAlpha60VsSpy:0,minAlpha60VsQqq:-4,defensiveRegimeMinAlpha60:8,relativeExitAlpha20:-8,timeStopSessions:60,timeStopMaxReturnPct:0,ratchetRiskPlanStop:false,profitTrailActivationPct:18,profitTrailDistancePct:12},
    {...base,thesisId:"confirmed-pullback-static",buyTargetPct:0.06,strongBuyTargetPct:0.06,maxPositions:10,minAlpha20VsSpy:-5,maxAlpha20VsSpy:5,minAlpha60VsSpy:1,minAlpha60VsQqq:-3,defensiveRegimeMinAlpha60:8,relativeExitAlpha20:-6,timeStopSessions:45,timeStopMaxReturnPct:0,ratchetRiskPlanStop:false,requireStrongEntryTiming:true,profitTrailActivationPct:15,profitTrailDistancePct:10},
    {...base,thesisId:"anti-chase-static",buyTargetPct:0.055,strongBuyTargetPct:0.055,maxPositions:12,maxAlpha20VsSpy:4,minAlpha60VsSpy:-2,minAlpha60VsQqq:-5,relativeExitAlpha20:-7,timeStopSessions:50,timeStopMaxReturnPct:0,ratchetRiskPlanStop:false,profitTrailActivationPct:15,profitTrailDistancePct:10,shortTermAlphaRankPenalty:0.5},
    {...base,thesisId:"initial-stop-only",buyTargetPct:0.05,strongBuyTargetPct:0.05,maxPositions:14,ratchetRiskPlanStop:false,relativeExitAlpha20:-8,timeStopSessions:60,timeStopMaxReturnPct:0,profitTrailActivationPct:18,profitTrailDistancePct:12},
  ];
  const evaluated = grid.map((parameters, index) => {
    const train = simulatePointInTimePortfolio(
      dataset,
      simulationOptions({
        ...parameters,
        startDate: windows.train.start,
        endDate: windows.train.end,
      }),
    );
    const validation = simulatePointInTimePortfolio(
      dataset,
      simulationOptions({
        ...parameters,
        startDate: windows.validation.start,
        endDate: windows.validation.end,
      }),
    );
    return {
      index,
      parameters,
      robustScore: Math.min(parameterScore(train), parameterScore(validation)),
      train: metricsSummary(train),
      validation: metricsSummary(validation),
    };
  });
  evaluated.sort(
    (a, b) => b.robustScore - a.robustScore || a.index - b.index,
  );
  const selected = evaluated[0];
  const test = simulatePointInTimePortfolio(
    dataset,
    simulationOptions({
      ...selected.parameters,
      startDate: windows.test.start,
      endDate: windows.test.end,
    }),
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
    windows,
    selectedParameters: selected.parameters,
    selectionScore: selected.robustScore,
    candidates: evaluated,
    reusedTestAudit: metricsSummary(test),
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
    for (const result of results) {
      if (result?.error) {
        output.failures.push(result);
        continue;
      }
      output.incomeRows.push(...asArray(result.incomeRows));
      output.balanceRows.push(...asArray(result.balanceRows));
      output.cashFlowRows.push(...asArray(result.cashFlowRows));
      completed.add(result.symbol);
    }
    output.completedSymbols = [...completed];
    if (onCheckpoint) await onCheckpoint(output);
  }
  output.remainingSymbols = symbols.filter((symbol) => !completed.has(symbol));
  return output;
}

async function fetchPriceHistory(client, symbols, from, to) {
  const results = await mapLimited(
    symbols,
    PRICE_HISTORY_CONCURRENCY,
    async (symbol) => {
    const rows = await client.fetchStable("historical-price-eod/full", {
      symbol: fmpSymbol(symbol),
      from,
      to,
    });
    return { symbol, bars: normalizeHistoricalBars(rows) };
    },
  );
  const histories = new Map();
  const failures = [];
  for (const result of results) {
    if (result?.bars?.length) histories.set(result.symbol, result.bars);
    else failures.push(result);
  }
  return { histories, failures };
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
  const startedAt = new Date(now).toISOString();
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
    const selected = selectResearchUniverse(discovery.candidates, symbolLimit);
    const endDate = isoDay(now);
    const fromDate = isoDay(
      Date.UTC(new Date(now).getUTCFullYear() - 4, 0, 1),
    );
    const symbols = [...new Set(selected.map((row) => row.symbol))];
    const priceSymbols = [...symbols, "SPY", "QQQ"];
    const acquisitionSignature = JSON.stringify({
      discoveryBuiltAt: discovery.builtAt,
      fromDate,
      endDate,
      symbols: priceSymbols.slice().sort(),
    });
    const savedPrices = await readPrivateJson(
      FMP_RESEARCH_PRICE_CHECKPOINT_STORE,
    ).catch(() => null);
    let histories;
    let priceFailures;
    if (savedPrices?.signature === acquisitionSignature) {
      histories = new Map(Object.entries(savedPrices.histories || {}));
      priceFailures = asArray(savedPrices.priceFailures);
    } else {
      const acquired = await fetchPriceHistory(
        client,
        priceSymbols,
        fromDate,
        endDate,
      );
      histories = acquired.histories;
      priceFailures = acquired.failures;
      await persistPrivateJson(FMP_RESEARCH_PRICE_CHECKPOINT_STORE, {
        version: 1,
        signature: acquisitionSignature,
        completedAt: new Date().toISOString(),
        histories: Object.fromEntries(histories),
        priceFailures,
      });
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
      savedStatements?.signature === statementSignature
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
        startedAt: existing?.startedAt || startedAt,
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
        nextSessionOpenExecution: true,
        slippageBps: 12,
        wholeShares: true,
        ordinaryBuyPersistenceUsesDistinctSessions: true,
        strongBuyStillRequiresAllHardGates: true,
        portfolioRiskPolicyReplayed: true,
        positionLifecycleReplayed: true,
        untouchedChronologicalTestWindow: false,
        priorWindowReusedOnlyAsAudit: true,
        parameterSelectionUsesTrainAndValidationOnly: true,
        benchmarkRelativeMomentum20_60_120Sessions: true,
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
        requestedResearchSymbols: symbols.length,
        priceCoveredSymbols: usableSymbols.length,
        fullyEvaluatedSymbols: finalSymbols.length,
        sectors: [...new Set(profiles.map((row) => row.sector || "Other"))].length,
        fromDate,
        toDate: endDate,
        compiledSessions: compiled.sessions.length,
      },
      dataQuality: {
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
