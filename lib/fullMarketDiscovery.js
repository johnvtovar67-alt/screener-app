// Daily, bounded full-market discovery for the live opportunity engine.
//
// The expensive breadth pass is deliberately separated from interactive Reloads:
// FMP's company screener discovers U.S.-listed common stocks, batch quotes apply a
// real dollar-liquidity test and technical pre-ranking, and only a bounded shortlist
// is handed to the stricter fresh-capital engine. The durable snapshot is safe to
// reuse if the provider is temporarily unavailable; stale discovery never changes a
// stock's fundamentals or creates a Buy by itself.

import { get, list, put } from "@vercel/blob";
import { latestCompletedMarketSessionDay, previousMarketSessionDay } from "./marketSession";

export const FULL_MARKET_DISCOVERY_STORE =
  "full-market-discovery-snapshot-v2.json";
export const FULL_MARKET_DISCOVERY_SCHEMA = 2;

const MEMORY_KEY = "__fullMarketDiscoverySnapshotV1";
const INFLIGHT_KEY = "__fullMarketDiscoveryInflightV1";
const COOLDOWN_KEY = "__fullMarketDiscoveryCooldownV1";
const LAST_FAILURE_KEY = "__fullMarketDiscoveryLastFailureV1";
const DEFAULT_MAX_AGE_MS = 20 * 60 * 60 * 1000;
const DEFAULT_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const LIQUIDITY_LOOKBACK_SESSIONS = 20;
const MIN_LIQUIDITY_SESSIONS = 15;
const LIQUIDITY_CONCURRENCY = 2;
const DISCOVERY_EXCHANGES = ["NASDAQ", "NYSE", "AMEX"];
const US_LISTING_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "AMEX",
  "NYSEAMERICAN",
  "NYSE AMERICAN",
]);

const normalizeSymbol = (value) =>
  String(value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
const number = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const boundedNumber = (value, fallback, min, max) =>
  Math.max(min, Math.min(max, number(value, fallback)));
const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));
const asArray = (value) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : value && typeof value === "object"
      ? [value]
      : [];

export function fullMarketDiscoveryConfig(env = process.env) {
  return {
    enabled: String(env.FULL_MARKET_DISCOVERY_ENABLED || "true") !== "false",
    minPrice: boundedNumber(env.FULL_MARKET_MIN_PRICE, 5, 1, 100),
    minMarketCap: boundedNumber(
      env.FULL_MARKET_MIN_CAP,
      300_000_000,
      0,
      1_000_000_000_000,
    ),
    minAvgDollarVolume: boundedNumber(
      env.FULL_MARKET_MIN_AVG_DOLLAR_VOLUME,
      10_000_000,
      1_000_000,
      1_000_000_000,
    ),
    maxQuoteUniverse: Math.floor(
      boundedNumber(env.FULL_MARKET_MAX_QUOTE_UNIVERSE, 4_000, 250, 5_000),
    ),
    maxCandidates: Math.floor(
      boundedNumber(env.FULL_MARKET_MAX_CANDIDATES, 500, 50, 750),
    ),
    perSectorFloor: Math.floor(
      boundedNumber(env.FULL_MARKET_PER_SECTOR_FLOOR, 8, 0, 20),
    ),
  };
}

function normalizedExchange(row = {}) {
  return String(row.exchangeShortName || row.exchange || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

export function isUsListedCommonStock(row = {}) {
  const symbol = normalizeSymbol(row.symbol || row.ticker);
  const name = String(row.companyName || row.name || "").trim();
  const exchange = normalizedExchange(row);
  if (!symbol || !name) return false;
  if (!/^[A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?$/.test(symbol)) return false;
  if (!US_LISTING_EXCHANGES.has(exchange)) return false;
  if (row.isEtf === true || row.isFund === true) return false;
  if (row.isActivelyTrading === false) return false;

  // FMP's boolean instrument flags are primary. The name/symbol checks close the
  // common stock gaps (SPAC units, rights, warrants, preferreds, ADRs and debt).
  if (
    /\b(etf|etn|fund|warrant|rights?|units?|preferred|preference|depositary|depository|adr|notes?|bonds?|debentures?)\b/i.test(
      name,
    ) ||
    /\bacquisition corp(?:oration)?\b/i.test(name)
  )
    return false;
  if (/\.(?:W|WS|U|R|P)$/.test(symbol)) return false;
  return true;
}

function discoveryFailure(error, context = {}) {
  const status = Number(error?.status);
  return {
    issue:
      status === 402
        ? "bulk_entitlement_required"
        : status === 429
          ? "provider_rate_limited"
          : status === 401 || status === 403
            ? "provider_authorization_failed"
            : "provider_temporarily_unavailable",
    at: new Date().toISOString(),
    stage: String(error?.discoveryStage || "unknown"),
    endpoint: String(error?.discoveryEndpoint || "unknown"),
    sourceUniverseSize: Number(context.sourceUniverseSize) || 0,
    sourceExchangeCounts: context.sourceExchangeCounts || null,
    sourceUniverseCapped: Boolean(context.sourceUniverseCapped),
  };
}

function normalizeScreenerRow(row = {}) {
  const price = number(row.price);
  const volume = number(row.volume);
  return {
    symbol: normalizeSymbol(row.symbol || row.ticker),
    name: String(row.companyName || row.name || row.symbol || "").trim(),
    companyName: String(
      row.companyName || row.name || row.symbol || "",
    ).trim(),
    exchange: String(row.exchangeShortName || row.exchange || "").trim(),
    sector: String(row.sector || "Other").trim() || "Other",
    industry: String(row.industry || "").trim(),
    country: String(row.country || "").trim(),
    marketCap: number(row.marketCap),
    price,
    volume,
    currentDollarVolume:
      price !== null && volume !== null ? price * volume : null,
  };
}

function normalizeQuoteRow(row = {}) {
  const price = number(row.price);
  const volume = number(row.volume);
  const avgVolume = number(row.avgVolume ?? row.averageVolume);
  return {
    symbol: normalizeSymbol(row.symbol || row.ticker),
    price,
    previousClose: number(row.previousClose),
    change: number(row.change),
    changesPercentage: number(
      row.changesPercentage ?? row.changePercentage ?? row.changePercent,
    ),
    volume,
    avgVolume,
    averageDollarVolume:
      price !== null && avgVolume !== null ? price * avgVolume : null,
    priceAvg50: number(row.priceAvg50 ?? row.fiftyDayAverage),
    priceAvg200: number(row.priceAvg200 ?? row.twoHundredDayAverage),
    yearHigh: number(row.yearHigh),
    yearLow: number(row.yearLow),
    marketCap: number(row.marketCap),
    beta: number(row.beta),
    eps: number(row.eps),
    pe: number(row.pe),
    timestamp: number(row.timestamp),
  };
}

export function passesDiscoveryLiquidity(row = {}, config = {}) {
  const price = number(row.price);
  const marketCap = number(row.marketCap);
  const avgDollarVolume = number(
    row.averageDollarVolume ??
      (price !== null && number(row.avgVolume) !== null
        ? price * number(row.avgVolume)
        : null),
  );
  return Boolean(
    price !== null &&
      price >= config.minPrice &&
      marketCap !== null &&
      marketCap >= config.minMarketCap &&
      avgDollarVolume !== null &&
      avgDollarVolume >= config.minAvgDollarVolume,
  );
}

export function fullMarketDiscoveryScore(row = {}) {
  const price = number(row.price, 0);
  const ma50 = number(row.priceAvg50);
  const ma200 = number(row.priceAvg200);
  const day = number(row.changesPercentage, 0);
  const currentVolume = number(row.volume);
  const avgVolume = number(row.avgVolume);
  const avgDollarVolume = number(row.averageDollarVolume, 0);
  const marketCap = number(row.marketCap, 0);
  const vs50 = price > 0 && ma50 > 0 ? ((price - ma50) / ma50) * 100 : null;
  const vs200 =
    price > 0 && ma200 > 0 ? ((price - ma200) / ma200) * 100 : null;
  const relativeVolume =
    currentVolume > 0 && avgVolume > 0 ? currentVolume / avgVolume : null;
  let score = 50;

  if (ma50 !== null) score += price >= ma50 ? 9 : -10;
  if (ma50 !== null && ma200 !== null) score += ma50 >= ma200 ? 8 : -9;
  if (ma200 !== null) score += price >= ma200 ? 6 : -12;
  if (vs50 !== null) {
    if (vs50 >= -3 && vs50 <= 8) score += 10;
    else if (vs50 > 14) score -= Math.min(18, (vs50 - 14) * 1.2);
    else if (vs50 < -8) score -= Math.min(15, Math.abs(vs50 + 8));
  }
  if (vs200 !== null && vs200 > 48) score -= Math.min(12, (vs200 - 48) / 2);
  if (day >= -2.5 && day <= 2.5) score += 5;
  else if (day > 5) score -= Math.min(15, (day - 5) * 2.5);
  else if (day < -5) score -= Math.min(12, Math.abs(day + 5) * 2);
  if (relativeVolume !== null) {
    if (relativeVolume >= 0.7 && relativeVolume <= 1.8) score += 4;
    else if (relativeVolume < 0.35) score -= 8;
  }
  if (avgDollarVolume > 0)
    score += clamp(Math.log10(avgDollarVolume / 10_000_000) * 3, 0, 8);
  if (marketCap > 0)
    score += clamp(Math.log10(marketCap / 300_000_000) * 1.5, 0, 5);
  return Math.round(clamp(score) * 10) / 10;
}

export function selectFullMarketCandidates(rows = [], options = {}) {
  const config = { ...fullMarketDiscoveryConfig({}), ...options };
  const eligible = rows
    .filter((row) => passesDiscoveryLiquidity(row, config))
    .map((row) => ({
      ...row,
      discoveryScore: fullMarketDiscoveryScore(row),
      discoverySource: "full-market-daily",
    }))
    .sort(
      (a, b) =>
        b.discoveryScore - a.discoveryScore ||
        number(b.averageDollarVolume, 0) - number(a.averageDollarVolume, 0) ||
        a.symbol.localeCompare(b.symbol),
    );
  // Reserve a small number of slots for every represented sector before filling
  // the remainder by global score. Appending sector rows to an already-full list
  // and slicing it again would silently defeat the floor and recreate a sleeve
  // blind spot whenever one factor dominated the daily ranking.
  const selected = [];
  const selectedSymbols = new Set();
  if (config.perSectorFloor > 0) {
    const sectors = new Map();
    for (const row of eligible) {
      const sector = row.sector || "Other";
      if (!sectors.has(sector)) sectors.set(sector, []);
      sectors.get(sector).push(row);
    }
    const orderedSectors = [...sectors.entries()].sort(
      (a, b) =>
        number(b[1][0]?.discoveryScore, 0) -
          number(a[1][0]?.discoveryScore, 0) || a[0].localeCompare(b[0]),
    );
    for (const [, sectorRows] of orderedSectors) {
      for (const row of sectorRows.slice(0, config.perSectorFloor)) {
        if (selected.length >= config.maxCandidates) break;
        selected.push(row);
        selectedSymbols.add(row.symbol);
      }
      if (selected.length >= config.maxCandidates) break;
    }
  }
  for (const row of eligible) {
    if (selected.length >= config.maxCandidates) break;
    if (selectedSymbols.has(row.symbol)) continue;
    selected.push(row);
    selectedSymbols.add(row.symbol);
  }
  return selected
    .sort(
      (a, b) =>
        b.discoveryScore - a.discoveryScore || a.symbol.localeCompare(b.symbol),
    )
    .slice(0, config.maxCandidates);
}

export function aggregateEodLiquidity(partitions = [], requestedSymbols = []) {
  const requested = new Set(requestedSymbols.map(normalizeSymbol).filter(Boolean));
  const totals = new Map();
  for (const partition of partitions) {
    const seen = new Set();
    for (const row of partition.rows || []) {
      const symbol = normalizeSymbol(row?.symbol || row?.ticker);
      if (!symbol || seen.has(symbol) || (requested.size && !requested.has(symbol)))
        continue;
      const close = number(row.adjClose ?? row.adjustedClose ?? row.close);
      const volume = number(row.volume);
      if (!(close > 0 && volume > 0)) continue;
      seen.add(symbol);
      const prior = totals.get(symbol) || {
        sessions: 0,
        volume: 0,
        dollarVolume: 0,
      };
      prior.sessions++;
      prior.volume += volume;
      prior.dollarVolume += close * volume;
      totals.set(symbol, prior);
    }
  }
  return new Map(
    [...totals.entries()]
      .filter(([, total]) => total.sessions >= MIN_LIQUIDITY_SESSIONS)
      .map(([symbol, total]) => [
        symbol,
        {
          avgVolume: total.volume / total.sessions,
          averageDollarVolume: total.dollarVolume / total.sessions,
          liquiditySessions: total.sessions,
        },
      ]),
  );
}

function recentCompletedSessionDays(now, count = LIQUIDITY_LOOKBACK_SESSIONS) {
  const days = [];
  let cursor = latestCompletedMarketSessionDay(new Date(now));
  while (cursor && days.length < count) {
    days.push(cursor);
    cursor = previousMarketSessionDay(cursor);
  }
  return days;
}

async function fetchTrailingLiquidity(symbols, apiKey, now) {
  const dates = recentCompletedSessionDays(now);
  const partitions = new Array(dates.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= dates.length) return;
      const params = new URLSearchParams({ date: dates[index], apikey: apiKey });
      const payload = await fetchJson(
        `https://financialmodelingprep.com/stable/eod-bulk?${params}`,
        { timeoutMs: 20_000 },
      );
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      if (!rows.length)
        throw new Error(`FMP EOD bulk returned no rows for ${dates[index]}`);
      partitions[index] = { date: dates[index], rows };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(LIQUIDITY_CONCURRENCY, dates.length) }, () =>
      worker(),
    ),
  );
  return {
    dates,
    bySymbol: aggregateEodLiquidity(partitions, symbols),
  };
}

async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let lastError = null;
  const endpoint = new URL(url).pathname;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return await response.json();
      const error = new Error(`FMP discovery request failed: ${response.status}`);
      error.status = response.status;
      error.discoveryEndpoint = endpoint;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(5_000, retryAfter * 1_000)
          : 750 * 2 ** attempt;
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if ([402, 403, 404, 429].includes(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if ([402, 403, 404, 429].includes(error?.status)) throw error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 450 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("FMP discovery request failed");
}

async function fetchScreenerUniverse(apiKey, config) {
  const rows = [];
  const exchangeCounts = {};
  for (const exchange of DISCOVERY_EXCHANGES) {
    const params = new URLSearchParams({
      exchange,
      isEtf: "false",
      isFund: "false",
      isActivelyTrading: "true",
      priceMoreThan: String(Math.max(1, config.minPrice * 0.8)),
      marketCapMoreThan: String(Math.max(0, config.minMarketCap * 0.5)),
      volumeMoreThan: "25000",
      limit: "10000",
      apikey: apiKey,
    });
    try {
      const exchangeRows = asArray(
        await fetchJson(
          `https://financialmodelingprep.com/stable/company-screener?${params}`,
        ),
      );
      if (!exchangeRows.length)
        throw new Error(`FMP company screener returned no ${exchange} rows`);
      exchangeCounts[exchange] = exchangeRows.length;
      rows.push(...exchangeRows);
    } catch (error) {
      const wrapped = new Error(
        `FMP ${exchange} discovery failed: ${error?.message || error}`,
      );
      wrapped.status = error?.status;
      wrapped.discoveryStage = "company_screener";
      wrapped.discoveryEndpoint = error?.discoveryEndpoint;
      throw wrapped;
    }
  }
  if (!rows.length)
    throw new Error("FMP company screener returned no U.S.-listed rows");
  const unique = new Map();
  for (const raw of rows) {
    if (!isUsListedCommonStock(raw)) continue;
    const row = normalizeScreenerRow(raw);
    if (!unique.has(row.symbol)) unique.set(row.symbol, row);
  }
  return {
    rows: [...unique.values()],
    exchangeCounts,
    sourceUniverseCapped: Object.values(exchangeCounts).some(
      (count) => count >= 10_000,
    ),
  };
}

async function fetchDiscoveryQuotes(apiKey) {
  const output = [];
  for (const exchange of DISCOVERY_EXCHANGES) {
    const params = new URLSearchParams({ exchange, apikey: apiKey });
    try {
      const rows = asArray(
        await fetchJson(
          `https://financialmodelingprep.com/stable/batch-exchange-quote?${params}`,
          { timeoutMs: 20_000 },
        ),
      );
      if (!rows.length)
        throw new Error(`FMP exchange quote returned no ${exchange} rows`);
      output.push(...rows);
    } catch (error) {
      error.discoveryStage = "exchange_quotes";
      throw error;
    }
  }
  return output;
}

async function readDurableSnapshot() {
  const { blobs } = await list({
    prefix: FULL_MARKET_DISCOVERY_STORE,
    limit: 1,
  });
  const blob =
    blobs.find((item) => item.pathname === FULL_MARKET_DISCOVERY_STORE) ||
    blobs[0];
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  const parsed = JSON.parse(await new Response(response.stream).text());
  return parsed?.schemaVersion === FULL_MARKET_DISCOVERY_SCHEMA &&
    Array.isArray(parsed.candidates)
    ? parsed
    : null;
}

async function persistSnapshot(snapshot) {
  await put(FULL_MARKET_DISCOVERY_STORE, JSON.stringify(snapshot), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function refreshFullMarketDiscovery({ apiKey, now = Date.now() } = {}) {
  const key = apiKey || process.env.FMP_API_KEY || process.env.FMP_KEY;
  const config = fullMarketDiscoveryConfig();
  if (!config.enabled)
    return {
      schemaVersion: FULL_MARKET_DISCOVERY_SCHEMA,
      status: "disabled",
      builtAt: null,
      candidates: [],
      config,
    };
  if (!key) throw new Error("FMP_API_KEY is required for full-market discovery");

  const screener = await fetchScreenerUniverse(key, config),
    screenerRows = screener.rows;
  const coarseRows = screenerRows
    .filter((row) => {
      if (!(row.price >= config.minPrice * 0.8)) return false;
      if (!(row.marketCap >= config.minMarketCap * 0.5)) return false;
      return (
        row.currentDollarVolume === null ||
        row.currentDollarVolume >= config.minAvgDollarVolume * 0.25
      );
    })
    .sort(
      (a, b) =>
        number(b.currentDollarVolume, 0) - number(a.currentDollarVolume, 0) ||
        number(b.marketCap, 0) - number(a.marketCap, 0),
    )
    .slice(0, config.maxQuoteUniverse);
  const coarseSymbols = coarseRows.map((row) => row.symbol);
  let quoteRows, trailingLiquidity;
  try {
    // Keep the two bandwidth-heavy stages separate. This avoids a six-request
    // burst and prevents thousands of symbol-metered batch quotes from colliding
    // with the EOD bulk history pass.
    trailingLiquidity = await fetchTrailingLiquidity(coarseSymbols, key, now);
    quoteRows = await fetchDiscoveryQuotes(key);
  } catch (error) {
    if (!error.discoveryStage)
      error.discoveryStage = error?.discoveryEndpoint?.includes("eod-bulk")
        ? "eod_liquidity"
        : "exchange_quotes";
    error.discoveryContext = {
      sourceUniverseSize: screenerRows.length,
      sourceExchangeCounts: screener.exchangeCounts,
      sourceUniverseCapped: screener.sourceUniverseCapped,
    };
    throw error;
  }
  const quoteMap = new Map(
    quoteRows
      .map(normalizeQuoteRow)
      .filter((row) => row.symbol)
      .map((row) => [row.symbol, row]),
  );
  const merged = coarseRows
    .filter((row) => quoteMap.has(row.symbol))
    .map((row) => ({
      ...row,
      ...quoteMap.get(row.symbol),
      ...(trailingLiquidity.bySymbol.get(row.symbol) || {}),
    }));
  const quoteCoveragePct = Math.round(
    (merged.length / Math.max(1, coarseRows.length)) * 10_000,
  ) / 100;
  if (quoteCoveragePct < 95)
    throw new Error(
      `FMP discovery quote coverage was ${quoteCoveragePct}%; refusing to replace the prior complete snapshot`,
    );
  const liquidityCoveragePct =
    Math.round(
      (merged.filter((row) => row.liquiditySessions >= MIN_LIQUIDITY_SESSIONS)
        .length /
        Math.max(1, coarseRows.length)) *
        10_000,
    ) / 100;
  if (liquidityCoveragePct < 95)
    throw new Error(
      `FMP trailing-liquidity coverage was ${liquidityCoveragePct}%; refusing to replace the prior complete snapshot`,
    );
  const candidates = selectFullMarketCandidates(merged, config);
  const eligibleSymbols = merged
    .filter((row) => passesDiscoveryLiquidity(row, config))
    .map((row) => row.symbol);
  if (!eligibleSymbols.length)
    throw new Error(
      "FMP full-market discovery produced no liquid common stocks; refusing to persist an empty snapshot",
    );
  const builtAt = new Date(now).toISOString();
  const snapshot = {
    schemaVersion: FULL_MARKET_DISCOVERY_SCHEMA,
    status: "ready",
    builtAt,
    sessionDate: builtAt.slice(0, 10),
    provider:
      "FMP stable company-screener + exchange-wide quotes + EOD bulk",
    sourceUniverseSize: screenerRows.length,
    sourceExchangeCounts: screener.exchangeCounts,
    sourceUniverseCapped: screener.sourceUniverseCapped,
    coarseUniverseSize: coarseRows.length,
    quoteCoverageCount: merged.length,
    quoteCoveragePct,
    liquidityCoveragePct,
    liquidityLookbackSessions: trailingLiquidity.dates.length,
    liquidityAsOf: trailingLiquidity.dates[0] || null,
    eligibleUniverseSize: eligibleSymbols.length,
    eligibleSymbols,
    coarseUniverseCapped: coarseRows.length >= config.maxQuoteUniverse,
    candidateCount: candidates.length,
    maxProviderCalls:
      3 +
      DISCOVERY_EXCHANGES.length +
      LIQUIDITY_LOOKBACK_SESSIONS,
    config,
    candidates,
  };
  await persistSnapshot(snapshot);
  globalThis[MEMORY_KEY] = snapshot;
  globalThis[LAST_FAILURE_KEY] = null;
  return snapshot;
}

export async function getFullMarketDiscovery({
  refreshIfStale = true,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  staleAgeMs = DEFAULT_STALE_AGE_MS,
  now = Date.now(),
} = {}) {
  const config = fullMarketDiscoveryConfig();
  if (!config.enabled)
    return { status: "disabled", candidates: [], config, builtAt: null };
  let snapshot = globalThis[MEMORY_KEY] || null;
  if (!snapshot) {
    try {
      snapshot = await readDurableSnapshot();
      if (snapshot) globalThis[MEMORY_KEY] = snapshot;
    } catch (error) {
      console.warn("full-market discovery read failed:", error?.message || error);
    }
  }
  const ageMs = snapshot?.builtAt
    ? Math.max(0, now - new Date(snapshot.builtAt).getTime())
    : Infinity;
  if (snapshot && ageMs <= maxAgeMs)
    return {
      ...snapshot,
      status: "ready",
      stale: false,
      ageMs,
      refreshIssue: null,
    };
  if (!refreshIfStale)
    return snapshot
      ? { ...snapshot, status: "stale", stale: true, ageMs }
      : { status: "missing", candidates: [], config, builtAt: null };

  if (globalThis[INFLIGHT_KEY]) return globalThis[INFLIGHT_KEY];
  if (now < Number(globalThis[COOLDOWN_KEY] || 0)) {
    const failure = globalThis[LAST_FAILURE_KEY] || {};
    return snapshot && ageMs <= staleAgeMs
      ? {
          ...snapshot,
          status: "stale",
          stale: true,
          ageMs,
          refreshIssue: failure.issue || "provider_temporarily_unavailable",
          refreshIssueAt: failure.at || null,
        }
      : {
          status: "unavailable",
          candidates: [],
          config,
          builtAt: null,
          ...failure,
          refreshIssue: failure.issue || "provider_temporarily_unavailable",
          refreshIssueAt: failure.at || null,
        };
  }
  globalThis[INFLIGHT_KEY] = (async () => {
    try {
      return await refreshFullMarketDiscovery({ now });
    } catch (error) {
      console.warn(
        "full-market discovery refresh failed:",
        error?.message || error,
        `stage=${error?.discoveryStage || "unknown"}`,
        `endpoint=${error?.discoveryEndpoint || "unknown"}`,
      );
      globalThis[COOLDOWN_KEY] = Date.now() + 5 * 60 * 1000;
      const failure = discoveryFailure(error, error?.discoveryContext);
      globalThis[LAST_FAILURE_KEY] = failure;
      return snapshot && ageMs <= staleAgeMs
        ? {
            ...snapshot,
            status: "stale",
            stale: true,
            ageMs,
            refreshIssue: failure.issue,
            refreshIssueAt: failure.at,
          }
        : {
            status: "unavailable",
            candidates: [],
            config,
            builtAt: null,
            ...failure,
            refreshIssue: failure.issue,
            refreshIssueAt: failure.at,
          };
    } finally {
      globalThis[INFLIGHT_KEY] = null;
    }
  })();
  return globalThis[INFLIGHT_KEY];
}
