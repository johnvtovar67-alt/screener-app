// pages/api/top5.js
// Broad opportunity engine: score -> standalone expert decision -> event risk -> historical timing -> relative capital decision.

import {
  compositeScore,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";
import { applyExpertDecision } from "../../lib/expertDecision";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";
import {
  fetchEntryTimingMap,
  applyEntryTimingGate,
} from "../../lib/entryTiming";
import { projectedFullDayVolume } from "../../lib/marketSession";
import {
  finalizeBroadOpportunityDecisions,
  relativeCapitalScore,
} from "../../lib/opportunityDecision";
import { seedDurableStrongBuyMemory } from "../../lib/strongBuyPersistence";
import {
  fetchFmpFundamentals,
  mergeFundamentals,
} from "../../lib/fmpFundamentals";
import {
  marketCycleProxySymbols,
  marketCycleMemberSymbols,
  discoverMarketCycles,
  discoverMarketCycleCandidates,
} from "../../lib/marketCycleUniverse";
const normalizeSymbol = (s) =>
    String(s || "")
      .replace("-", ".")
      .toUpperCase()
      .trim(),
  toFmpSymbol = (s) =>
    String(s || "")
      .replace(".", "-")
      .toUpperCase()
      .trim(),
  uniqueSymbols = (a) => [
    ...new Set((a || []).map(normalizeSymbol).filter(Boolean)),
  ];
const THEMES = {
  "AI Compute & Platforms": [
    "NVDA",
    "AMD",
    "AVGO",
    "ARM",
    "MU",
    "SMCI",
    "DELL",
    "HPE",
    "PLTR",
    "ORCL",
    "MSFT",
    "GOOGL",
    "GOOG",
    "META",
    "AMZN",
    "AAPL",
  ],
  "AI Networking": [
    "ANET",
    "CSCO",
    "NTAP",
    "JNPR",
    "FFIV",
    "CIEN",
    "MRVL",
    "COHR",
    "AAOI",
  ],
  Cybersecurity: ["CRWD", "PANW", "NET", "ZS", "DDOG", "SNOW", "MDB"],
  "Power & Electrification": [
    "ETN",
    "PWR",
    "VRT",
    "FIX",
    "EME",
    "GEV",
    "CEG",
    "VST",
    "NRG",
    "TLN",
  ],
  "Digital Infrastructure": ["EQIX", "DLR", "AMT", "XYL", "WTS", "HUBB", "NVT"],
  "Nuclear / Baseload": [
    "CCJ",
    "UEC",
    "UUUU",
    "LEU",
    "BWXT",
    "SMR",
    "OKLO",
    "NNE",
    "NXE",
    "DNN",
  ],
  "BTC / Digital Assets": [
    "MSTR",
    "MARA",
    "RIOT",
    "CLSK",
    "IREN",
    "WULF",
    "HUT",
    "BTDR",
    "CIFR",
    "BITF",
    "COIN",
    "HOOD",
    "SQ",
  ],
  "Space & Satellites": ["RKLB", "ASTS", "RDW", "BKSY", "IRDM"],
  "Defense & National Security": [
    "RTX",
    "LHX",
    "NOC",
    "LMT",
    "HII",
    "GD",
    "KTOS",
  ],
  "Autonomy & Drones": ["AVAV", "ONDS"],
  "Robotics & Automation": ["ROK", "TER", "CGNX", "SYM", "ISRG"],
  "Industrial Software": ["ADSK", "PTC", "SNPS", "CDNS"],
  "Quantum Computing": ["IONQ", "RGTI", "QBTS", "QUBT", "ARQQ", "IBM", "HON"],
  "Platform Biotech": [
    "MRNA",
    "RXRX",
    "SDGR",
    "CRSP",
    "BEAM",
    "IOVA",
    "VKTX",
    "ALMS",
    "HIMS",
  ],
};
const PRIMARY_THEME_BY_SYMBOL = Object.fromEntries(
    Object.entries(THEMES).flatMap(([theme, symbols]) =>
      symbols.map((s) => [s, theme]),
    ),
  ),
  CORE_OPPORTUNITY_SYMBOLS = Object.keys(PRIMARY_THEME_BY_SYMBOL),
  EXCLUDED = new Set(["ABB", "ABBNY"]);
const THEME_CONFIG = {
  opportunities: {
    name: "Best Opportunities",
    description:
      "Fresh-capital screen using absolute qualification followed by historical entry timing and relative capital ranking.",
    symbols: CORE_OPPORTUNITY_SYMBOLS,
  },
  broad: {
    name: "Best Opportunities",
    description:
      "Fresh-capital screen using absolute qualification followed by historical entry timing and relative capital ranking.",
    symbols: CORE_OPPORTUNITY_SYMBOLS,
  },
  ai_compute: {
    name: "AI Compute & Platforms",
    symbols: THEMES["AI Compute & Platforms"],
  },
  ai_networking: { name: "AI Networking", symbols: THEMES["AI Networking"] },
  cybersecurity: { name: "Cybersecurity", symbols: THEMES.Cybersecurity },
  power: {
    name: "Power & Electrification",
    symbols: THEMES["Power & Electrification"],
  },
  digital_infra: {
    name: "Digital Infrastructure",
    symbols: THEMES["Digital Infrastructure"],
  },
  nuclear: {
    name: "Nuclear / Baseload",
    symbols: THEMES["Nuclear / Baseload"],
  },
  btc: {
    name: "BTC / Digital Assets",
    symbols: THEMES["BTC / Digital Assets"],
  },
  defense: {
    name: "Defense & National Security",
    symbols: THEMES["Defense & National Security"],
  },
  space: { name: "Space & Satellites", symbols: THEMES["Space & Satellites"] },
  drones: { name: "Autonomy & Drones", symbols: THEMES["Autonomy & Drones"] },
  robotics: {
    name: "Robotics & Automation",
    symbols: THEMES["Robotics & Automation"],
  },
  industrial_software: {
    name: "Industrial Software",
    symbols: THEMES["Industrial Software"],
  },
  quantum: { name: "Quantum Computing", symbols: THEMES["Quantum Computing"] },
  biotech: { name: "Platform Biotech", symbols: THEMES["Platform Biotech"] },
};
const getThemeConfig = (k) =>
    THEME_CONFIG[String(k || "opportunities").toLowerCase()] ||
    THEME_CONFIG.opportunities,
  toNumber = (v, f = null) => {
    if (v == null || v === "") return f;
    const n = Number(
      typeof v === "string" ? v.replace("%", "").replace(/,/g, "").trim() : v,
    );
    return Number.isFinite(n) ? n : f;
  },
  toPositiveNumber = (v, f = null) => {
    const n = toNumber(v, f);
    return n != null && n > 0 ? n : f;
  };
function normalizeDailyPct({ price, previousClose, change, rawPct }) {
  let pct = toNumber(rawPct);
  if (price && previousClose) {
    const x = ((price - previousClose) / previousClose) * 100;
    if (pct === null || Math.abs(pct) > 25 || Math.abs(pct - x) > 5) pct = x;
  }
  if (pct === null && change != null && previousClose)
    pct = (change / previousClose) * 100;
  return pct;
}
function normalizeQuote(r = {}) {
  const symbol = normalizeSymbol(r.symbol),
    price = toPositiveNumber(r.price),
    previousClose = toPositiveNumber(r.previousClose),
    change = toNumber(r.change),
    dayChangePct = normalizeDailyPct({
      price,
      previousClose,
      change,
      rawPct: r.changesPercentage ?? r.changePercentage ?? r.changePercent,
    });
  return {
    ...r,
    symbol,
    ticker: symbol,
    name: r.name || r.companyName || symbol,
    companyName: r.companyName || r.name || symbol,
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    changePercent: dayChangePct,
    marketCap: toPositiveNumber(r.marketCap),
    volume: toPositiveNumber(r.volume),
    avgVolume: toPositiveNumber(r.avgVolume),
    priceAvg50: toPositiveNumber(r.priceAvg50),
    fiftyDayAverage: toPositiveNumber(r.priceAvg50 ?? r.fiftyDayAverage),
    priceAvg200: toPositiveNumber(r.priceAvg200),
    twoHundredDayAverage: toPositiveNumber(
      r.priceAvg200 ?? r.twoHundredDayAverage,
    ),
    yearHigh: toPositiveNumber(r.yearHigh),
    yearLow: toPositiveNumber(r.yearLow),
    eps: toNumber(r.eps),
    pe: toNumber(r.pe),
    beta: toNumber(r.beta, null),
    exchange: r.exchange || r.exchangeShortName || "",
    timestamp: r.timestamp || null,
  };
}

// FMP quote resilience: use batch first, then a bounded stable single-quote emergency path.
// The emergency path is intentionally capped so a batch outage cannot become a request storm.
const QUOTE_CACHE_KEY = "__screenerFmpQuoteCacheV4",
  QUOTE_INFLIGHT_KEY = "__screenerFmpQuoteInflightV4",
  QUOTE_COOLDOWN_KEY = "__screenerFmpQuoteCooldownV4";
const QUOTE_TTL_MS = 60 * 1000,
  QUOTE_STALE_MS = 24 * 60 * 60 * 1000,
  QUOTE_COOLDOWN_MS = 20 * 1000,
  QUOTE_BATCH_SIZE = 40,
  QUOTE_TIMEOUT_MS = 7000,
  SINGLE_FALLBACK_LIMIT = 36,
  SINGLE_CONCURRENCY = 3;
const quoteCache = () =>
  globalThis[QUOTE_CACHE_KEY] instanceof Map
    ? globalThis[QUOTE_CACHE_KEY]
    : (globalThis[QUOTE_CACHE_KEY] = new Map());
const quoteInflight = () =>
  globalThis[QUOTE_INFLIGHT_KEY] instanceof Map
    ? globalThis[QUOTE_INFLIGHT_KEY]
    : (globalThis[QUOTE_INFLIGHT_KEY] = new Map());
const quoteCooldownUntil = () => Number(globalThis[QUOTE_COOLDOWN_KEY] || 0);
const setQuoteCooldown = (ms) => {
  globalThis[QUOTE_COOLDOWN_KEY] = Math.max(
    quoteCooldownUntil(),
    Date.now() + ms,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asQuoteArray = (data) =>
  Array.isArray(data)
    ? data.filter(Boolean)
    : data && typeof data === "object"
      ? [data]
      : [];
function chunks(a, size = QUOTE_BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}
async function fetchStableQuoteBatch(symbols, key) {
  if (!symbols.length) return [];
  const joined = symbols.map(toFmpSymbol).join(","),
    url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(joined)}&apikey=${key}`;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (r.ok) return asQuoteArray(await r.json());
      const text = await r.text().catch(() => "");
      const err = new Error(
        `FMP quote request failed: ${r.status}${text ? ` - ${text}` : ""}`,
      );
      err.status = r.status;
      lastError = err;
      if (r.status === 429) {
        setQuoteCooldown(QUOTE_COOLDOWN_MS);
        if (attempt === 0) {
          await sleep(900);
          continue;
        }
      }
      if (r.status === 402 || r.status === 403 || r.status === 404) throw err;
      if (r.status >= 500 && attempt === 0) {
        await sleep(500);
        continue;
      }
      throw err;
    } catch (e) {
      lastError = e;
      if (
        e?.status === 402 ||
        e?.status === 403 ||
        e?.status === 404 ||
        e?.status === 429
      )
        throw e;
      if (attempt === 0) {
        await sleep(400);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("FMP quote request failed.");
}
async function fetchStableSingleQuote(symbol, key) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
  try {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(toFmpSymbol(symbol))}&apikey=${key}`;
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) {
      const e = new Error(`FMP single quote failed: ${r.status}`);
      e.status = r.status;
      throw e;
    }
    const data = await r.json(),
      row = Array.isArray(data) ? data[0] : data;
    return row && (row.symbol || row.price) ? row : null;
  } finally {
    clearTimeout(timer);
  }
}
async function emergencySingleQuoteFallback(symbols, key) {
  const ordered = uniqueSymbols(symbols).slice(0, SINGLE_FALLBACK_LIMIT),
    rows = [];
  for (let i = 0; i < ordered.length; i += SINGLE_CONCURRENCY) {
    const group = ordered.slice(i, i + SINGLE_CONCURRENCY);
    const got = await Promise.all(
      group.map((s) =>
        fetchStableSingleQuote(s, key).catch((e) => {
          if (e?.status === 429) setQuoteCooldown(QUOTE_COOLDOWN_MS);
          return null;
        }),
      ),
    );
    for (const row of got) if (row) rows.push(row);
    if (rows.length >= 24) break;
    if (Date.now() < quoteCooldownUntil() && rows.length) break;
  }
  return rows;
}
async function fetchQuoteBatchResilient(symbols, key) {
  const id = symbols.join(","),
    pending = quoteInflight();
  if (pending.has(id)) return pending.get(id);
  const cache = quoteCache(),
    now = Date.now();
  const p = (async () => {
    try {
      if (Date.now() < quoteCooldownUntil())
        return symbols
          .map((s) => cache.get(s))
          .filter((x) => x && now - x.ts < QUOTE_STALE_MS)
          .map((x) => ({ ...x.data, staleFallback: true }));
      const rows = await fetchStableQuoteBatch(symbols, key),
        seen = new Set();
      for (const row of rows) {
        const symbol = normalizeSymbol(row?.symbol);
        if (symbol) {
          cache.set(symbol, { ts: Date.now(), data: row });
          seen.add(symbol);
        }
      }
      for (const symbol of symbols)
        if (!seen.has(symbol)) {
          const hit = cache.get(symbol);
          if (hit && now - hit.ts < QUOTE_STALE_MS)
            rows.push({ ...hit.data, staleFallback: true });
        }
      return rows;
    } catch (e) {
      console.warn("FMP quote batch degraded:", e?.message || e);
      return symbols
        .map((s) => cache.get(s))
        .filter((x) => x && now - x.ts < QUOTE_STALE_MS)
        .map((x) => ({ ...x.data, staleFallback: true }));
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}
async function fetchFmpQuotes(symbols = []) {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY in environment variables.");
  const requested = uniqueSymbols(symbols),
    cache = quoteCache(),
    now = Date.now(),
    bySymbol = new Map(),
    missing = [];
  for (const symbol of requested) {
    const hit = cache.get(symbol);
    if (hit && now - hit.ts < QUOTE_TTL_MS) bySymbol.set(symbol, hit.data);
    else missing.push(symbol);
  }
  for (const batch of chunks(missing)) {
    const rows = await fetchQuoteBatchResilient(batch, key);
    for (const row of rows) {
      const symbol = normalizeSymbol(row?.symbol);
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, row);
    }
  }
  if (bySymbol.size === 0) {
    console.warn(
      "FMP batch path returned no quotes; using bounded stable single-quote fallback.",
    );
    const rows = await emergencySingleQuoteFallback(requested, key);
    for (const row of rows) {
      const symbol = normalizeSymbol(row?.symbol);
      if (symbol) {
        cache.set(symbol, { ts: Date.now(), data: row });
        bySymbol.set(symbol, row);
      }
    }
  }
  for (const symbol of requested)
    if (!bySymbol.has(symbol)) {
      const hit = cache.get(symbol);
      if (hit && now - hit.ts < QUOTE_STALE_MS)
        bySymbol.set(symbol, { ...hit.data, staleFallback: true });
    }
  return [...bySymbol.values()];
}

function scoreQuote(n = {}) {
  const scoringInput = { ...n, volume: projectedFullDayVolume(n) },
    score = compositeScore(scoringInput),
    fundamentalScore = calcFundamentalScore(scoringInput),
    technicalScore = calcTechnicalScore(scoringInput),
    momentumScore = calcMomentumScore(scoringInput),
    relativeStrengthScore = calcRelativeStrengthScore(scoringInput),
    asymmetryScore = calcAsymmetryScore(scoringInput),
    triggerScore = calcTriggerScore(scoringInput),
    technicalSnapshot = buildTechnicalSnapshot(scoringInput),
    fundamentalSnapshot = buildFundamentalSnapshot(scoringInput),
    raw = getRecommendation({
      ...scoringInput,
      score,
      fundamentalScore,
      technicalScore,
      momentumScore,
      relativeStrengthScore,
      triggerScore,
    }),
    recommendation = applyExpertDecision(
      {
        ...n,
        score,
        fundamentalScore,
        technicalScore,
        momentumScore,
        relativeStrengthScore,
        triggerScore,
      },
      raw,
    );
  return {
    ...n,
    score,
    compositeScore: score,
    heatScore: score,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,
    primaryTheme:
      n.marketCycleTheme || PRIMARY_THEME_BY_SYMBOL[n.symbol] || "Other",
    theme: n.marketCycleTheme || PRIMARY_THEME_BY_SYMBOL[n.symbol] || "Other",
    recommendation,
    riskPlan: recommendation.riskPlan ?? raw.riskPlan ?? null,
    technicalSnapshot,
    fundamentalSnapshot,
    expertDecision: recommendation.expertDecision,
    expertOverride: recommendation.expertOverride,
    expertOverrideReason: recommendation.expertOverrideReason,
    thesisScore: recommendation.thesisScore,
    tradeSetupScore: recommendation.tradeSetupScore,
    capitalScore: recommendation.capitalScore,
  };
}
function fundamentalRefreshPriority(q = {}) {
  const input = { ...q, volume: projectedFullDayVolume(q) };
  return (
    calcTechnicalScore(input) * 0.4 +
    calcRelativeStrengthScore(input) * 0.3 +
    calcMomentumScore(input) * 0.2 +
    calcTriggerScore(input) * 0.1
  );
}
function buildThemeLeadership(rows = []) {
  const map = new Map();
  for (const r of rows) {
    const t = r.primaryTheme || "Other";
    if (!map.has(t))
      map.set(t, {
        theme: t,
        total: 0,
        strongBuy: 0,
        buy: 0,
        watch: 0,
        avoid: 0,
        scoreTotal: 0,
        bestSymbol: r.symbol,
        bestRank: -1,
      });
    const b = map.get(t),
      a = r.finalDecision?.action || "Avoid";
    b.total++;
    if (a === "Strong Buy") b.strongBuy++;
    else if (a === "Buy") b.buy++;
    else if (a === "Watch") b.watch++;
    else b.avoid++;
    b.scoreTotal += Number(r.tradeSetupScore || r.score || 0);
    const rank =
      (a === "Strong Buy" ? 4 : a === "Buy" ? 3 : a === "Watch" ? 1 : 0) *
        1000 +
      relativeCapitalScore(r);
    if (rank > b.bestRank) {
      b.bestRank = rank;
      b.bestSymbol = r.symbol;
    }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      score: Math.round(b.scoreTotal / Math.max(1, b.total)),
      status: b.strongBuy || b.buy ? "Leading" : b.watch ? "Mixed" : "Weak",
    }))
    .sort((a, b) => b.score - a.score);
}
const CACHE_KEY = "__screenerBroadOpportunityCacheV9",
  CACHE_MS = 60000,
  STALE_SNAPSHOT_MS = 24 * 60 * 60 * 1000;
async function buildBroadSnapshot(verificationPass = 0) {
  const now = Date.now(),
    cached = globalThis[CACHE_KEY];
  if (cached?.rows && now - cached.ts < CACHE_MS) return cached;
  if (cached?.promise) return cached.promise;
  const promise = (async () => {
    const strategicSymbols = CORE_OPPORTUNITY_SYMBOLS.filter(
        (x) => !EXCLUDED.has(x),
      ),
      proxySymbols = marketCycleProxySymbols(),
      seedQuotes = await fetchFmpQuotes([
        ...strategicSymbols,
        ...proxySymbols,
        "SPY",
        "QQQ",
      ]),
      seedNormalized = seedQuotes
        .map(normalizeQuote)
        .filter((q) => q.symbol && q.price);
    if (!seedNormalized.length)
      throw new Error(
        "No verified quote data available after batch and bounded single-quote fallback.",
      );
    const cycle = discoverMarketCycles(seedNormalized),
      marketMemberSymbols = marketCycleMemberSymbols().filter(
        (x) => !strategicSymbols.includes(x) && !EXCLUDED.has(x),
      ),
      marketMemberRaw = marketMemberSymbols.length
        ? await fetchFmpQuotes(marketMemberSymbols)
        : [],
      marketMemberNormalized = marketMemberRaw
        .map(normalizeQuote)
        .filter((q) => q.symbol && q.price),
      candidateDiscovery = discoverMarketCycleCandidates(
        marketMemberNormalized,
        cycle,
        { limit: 48, exclude: strategicSymbols },
      ),
      dynamicSymbols = candidateDiscovery.map((x) => x.symbol),
      dynamicTheme = new Map(
        candidateDiscovery.map((x) => [x.symbol, x.marketCycleTheme]),
      );
    const dynamicNormalized = marketMemberNormalized
        .filter((q) => dynamicSymbols.includes(q.symbol))
        .map((q) => ({
          ...q,
          marketCycleTheme: dynamicTheme.get(q.symbol) || "Market Cycle",
        })),
      normalized = [...seedNormalized, ...dynamicNormalized],
      spy = normalized.find((q) => q.symbol === "SPY"),
      qqq = normalized.find((q) => q.symbol === "QQQ"),
      broadSymbols = [...new Set([...strategicSymbols, ...dynamicSymbols])],
      broadQuotes = normalized.filter((q) => broadSymbols.includes(q.symbol)),
      fundamentalPriority = [...broadQuotes]
        .sort(
          (a, b) =>
            fundamentalRefreshPriority(b) - fundamentalRefreshPriority(a),
        )
        .map((q) => q.symbol),
      fundamentalOffset = Math.min(
        fundamentalPriority.length,
        Math.max(0, Math.floor(Number(verificationPass) || 0)) * 12,
      ),
      rotatedFundamentalPriority = [
        ...fundamentalPriority.slice(fundamentalOffset),
        ...fundamentalPriority.slice(0, fundamentalOffset),
      ],
      fundamentalMap = await fetchFmpFundamentals(rotatedFundamentalPriority);
    let rows = broadQuotes.map((q) =>
      scoreQuote(
        mergeFundamentals(
          {
            ...q,
            spyDayChangePct: spy?.dayChangePct ?? null,
            qqqDayChangePct: qqq?.dayChangePct ?? null,
          },
          fundamentalMap,
        ),
      ),
    );
    const eventRiskMap = await fetchEventRiskMap(rows.map((r) => r.symbol));
    rows = rows.map((r) => applyEventRiskGate(r, eventRiskMap.get(r.symbol)));
    const timingCandidates = rows
        .filter((r) =>
          ["Buy", "Strong Buy"].includes(
            String(
              r.recommendation?.displayLabel ||
                r.recommendation?.label ||
                r.action,
            ),
          ),
        )
        .map((r) => r.symbol),
      timingMap = await fetchEntryTimingMap(timingCandidates);
    rows = rows.map((r) =>
      timingMap.has(r.symbol)
        ? applyEntryTimingGate(r, timingMap.get(r.symbol))
        : r,
    );
    await seedDurableStrongBuyMemory();
    rows = finalizeBroadOpportunityDecisions(rows);
    const result = {
      rows,
      cycle,
      strategicCount: strategicSymbols.length,
      dynamicCount: dynamicSymbols.length,
      universeSize: broadSymbols.length,
      staleFeed: false,
    };
    globalThis[CACHE_KEY] = { ts: Date.now(), ...result, promise: null };
    return result;
  })();
  globalThis[CACHE_KEY] = {
    ts: cached?.ts || 0,
    rows: cached?.rows || null,
    cycle: cached?.cycle,
    strategicCount: cached?.strategicCount,
    dynamicCount: cached?.dynamicCount,
    universeSize: cached?.universeSize,
    promise,
  };
  try {
    return await promise;
  } catch (err) {
    const last = globalThis[CACHE_KEY];
    globalThis[CACHE_KEY] = { ...last, promise: null };
    if (cached?.rows && now - cached.ts < STALE_SNAPSHOT_MS) {
      console.warn(
        "Broad screen using stale verified snapshot:",
        err?.message || err,
      );
      return { ...cached, staleFeed: true, promise: null };
    }
    throw err;
  }
}
async function recordPerformance(req, rows) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https",
      host = req.headers.host;
    if (!host) return;
    await fetch(`${proto}://${host}/api/performance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stocks: rows,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("performance ledger:", e.message);
  }
}
export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    const themeKey = String(req.query.theme || "opportunities").toLowerCase(),
      config = getThemeConfig(themeKey),
      verificationPass = Math.min(
        4,
        Math.max(0, Math.floor(Number(req.query.verificationPass) || 0)),
      ),
      broadSnapshot = await buildBroadSnapshot(verificationPass),
      broadRows = broadSnapshot.rows,
      themeLeadership = buildThemeLeadership(broadRows),
      isBroad = themeKey === "opportunities" || themeKey === "broad",
      selectedSymbols = new Set(config.symbols.filter((s) => !EXCLUDED.has(s))),
      rows = isBroad
        ? broadRows
        : broadRows.filter((r) => selectedSymbols.has(r.symbol));
    if (isBroad) void recordPerformance(req, broadRows);
    const fundamentalsComplete = rows.filter(
        (r) => r.fundamentalDataStatus === "complete",
      ).length,
      fundamentalsDeferred = rows.filter(
        (r) => r.fundamentalDataStatus === "deferred",
      ).length,
      fundamentalsUnavailable = rows.filter(
        (r) => r.fundamentalDataStatus === "unavailable",
      ).length,
      fundamentalCoveragePct = Math.round(
        (fundamentalsComplete / Math.max(1, rows.length)) * 100,
      ),
      fundamentalFeedStatus =
        fundamentalsComplete === 0 && fundamentalsUnavailable > 0
          ? "unavailable"
          : fundamentalCoveragePct < 75
            ? "degraded"
            : "healthy",
      actionable = rows.filter((r) =>
        ["Buy", "Strong Buy"].includes(r.finalDecision?.action),
      ),
      actionableThemes = new Set(
        actionable.map((r) => r.primaryTheme).filter(Boolean),
      ).size;
    return res
      .status(200)
      .json({
        stocks: rows,
        themeLeadership,
        selectedTheme: {
          key: themeKey,
          name: config.name,
          description:
            config.description ||
            "Focused research list filtered from the authoritative broad opportunity decisions.",
        },
        meta: {
          mode: "expert_decision_v14_resilient_fmp_historical_entry_timing",
          universeDesign:
            "strategic themes plus the strongest individual candidates discovered across every market-cycle group; fresh capital must independently pass verified fundamentals, event risk, and historical entry timing",
          universeSize: broadSnapshot.universeSize,
          strategicUniverseSize: broadSnapshot.strategicCount,
          dynamicUniverseSize: broadSnapshot.dynamicCount,
          marketCycleRadar: broadSnapshot.cycle.groups.map((g) => ({
            name: g.name,
            proxy: g.proxy,
            state: g.state,
            score: g.score,
          })),
          selectedMarketCycles: broadSnapshot.cycle.selected.map((g) => ({
            name: g.name,
            proxy: g.proxy,
            state: g.state,
            score: g.score,
            members: g.members,
          })),
          quotesReceived: broadRows.length,
          coveragePct:
            Math.round(
              (broadRows.length /
                Math.max(
                  1,
                  CORE_OPPORTUNITY_SYMBOLS.filter((s) => !EXCLUDED.has(s))
                    .length,
                )) *
                1000,
            ) / 10,
          returned: rows.length,
          strongBuys: rows.filter(
            (r) => r.finalDecision?.action === "Strong Buy",
          ).length,
          buys: rows.filter((r) => r.finalDecision?.action === "Buy").length,
          watches: rows.filter((r) => r.finalDecision?.action === "Watch")
            .length,
          qualifiedWatches: rows.filter(
            (r) => r.finalDecision?.priority === "Qualified Watch",
          ).length,
          actionableNames: actionable.length,
          actionableThemes,
          fundamentalsComplete,
          fundamentalsDeferred,
          fundamentalsUnavailable,
          fundamentalsIncomplete: rows.length - fundamentalsComplete,
          fundamentalCoveragePct,
          fundamentalFeedStatus,
          quoteFeedStatus: broadSnapshot.staleFeed ? "stale-verified" : "live",
        },
      });
  } catch (err) {
    console.error("api/top5 error:", err);
    return res
      .status(503)
      .json({
        error: "Trade screen temporarily unavailable.",
        detail: err.message || "Unknown error.",
        retryable: true,
      });
  }
}
