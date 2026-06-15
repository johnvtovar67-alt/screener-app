// pages/api/top5.js

import {
  compositeScore,
  getRecommendation,
  getTradeReadiness,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase().trim();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase().trim();
}

function uniqueSymbols(symbols = []) {
  const seen = new Set();

  return symbols
    .map((symbol) => normalizeSymbol(symbol))
    .filter((symbol) => {
      if (!symbol) return false;
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
}

const THEME_CONFIG = {
  broad: {
    name: "Broad Market",
    description:
      "Full broad-market discovery list using the institutional scoring model.",
    symbols: [
      "NVDA",
      "AMD",
      "AVGO",
      "QCOM",
      "ARM",
      "MU",
      "SMCI",
      "PLTR",
      "CRWD",
      "NET",
      "DDOG",
      "SNOW",
      "SHOP",
      "MDB",
      "ZS",
      "PANW",
      "ANET",
      "DELL",
      "HPE",
      "ORCL",
      "MSFT",
      "GOOGL",
      "GOOG",
      "META",
      "AMZN",
      "AAPL",
      "TSLA",
      "UBER",
      "ROKU",
      "SOUN",
      "BBAI",
      "AI",
      "AAOI",

      "SCHW",
      "BGC",
      "JPM",
      "BAC",
      "C",
      "WFC",
      "GS",
      "MS",
      "BX",
      "KKR",
      "APO",
      "SOFI",
      "AFRM",
      "HOOD",
      "COIN",
      "PYPL",
      "SQ",
      "ALLY",
      "RKT",
      "UPST",

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
      "KMI",
      "WMB",
      "TRGP",
      "LNG",
      "ET",
      "EPD",
      "OKE",
      "PAGP",
      "XOM",
      "CVX",
      "COP",
      "SLB",
      "HAL",
      "FCX",
      "CLF",
      "NUE",
      "STLD",

      "CCJ",
      "UEC",
      "UUUU",
      "LEU",
      "BWXT",
      "SMR",
      "OKLO",
      "NNE",

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

      "HIMS",
      "BCRX",
      "ALMS",
      "VKTX",
      "RXRX",
      "SDGR",
      "DNA",
      "MRNA",
      "NVAX",
      "CRSP",
      "BEAM",
      "IOVA",
      "GERN",
      "ALT",

      "CELH",
      "CROX",
      "DKNG",
      "RCL",
      "CCL",
      "NCLH",
      "ABNB",
      "EXPE",
      "AAL",
      "UAL",
      "DAL",
      "LUV",
      "DIS",
      "NFLX",
      "TGT",
      "WMT",
      "COST",

      "AHR",
      "VICI",
      "O",
      "PLD",
      "DLR",
      "EQIX",
      "AMT",
      "CCI",
      "WELL",
    ],
  },

  btc: {
    name: "BTC / Digital Assets",
    description:
      "Bitcoin, crypto infrastructure, exchanges, and digital asset proxies.",
    symbols: [
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
      "PYPL",
    ],
  },

  ai_power: {
    name: "AI Power & Energy",
    description:
      "Power generation, grid, electrification, and energy infrastructure tied to AI load growth.",
    symbols: [
      "VST",
      "CEG",
      "NRG",
      "TLN",
      "GEV",
      "ETN",
      "PWR",
      "VRT",
      "FIX",
      "EME",
      "KMI",
      "WMB",
      "TRGP",
      "LNG",
      "ET",
      "EPD",
      "OKE",
    ],
  },

  cooling_water: {
    name: "Cooling & Water",
    description:
      "Thermal management, water infrastructure, and cooling beneficiaries.",
    symbols: [
      "VRT",
      "ETN",
      "PWR",
      "FIX",
      "EME",
      "XYL",
      "WTS",
      "AOS",
      "PNR",
      "ITT",
      "DOV",
      "HUBB",
      "NVT",
      "CARR",
      "TT",
    ],
  },

  nuclear: {
    name: "Nuclear / Baseload",
    description:
      "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: [
      "CCJ",
      "UEC",
      "UUUU",
      "LEU",
      "BWXT",
      "SMR",
      "OKLO",
      "NNE",
      "CEG",
      "VST",
      "TLN",
      "GEV",
      "NXE",
      "DNN",
    ],
  },

  quantum: {
    name: "Quantum Computing",
    description:
      "Quantum computing names and larger companies with quantum exposure.",
    symbols: [
      "IONQ",
      "RGTI",
      "QBTS",
      "QUBT",
      "ARQQ",
      "IBM",
      "GOOGL",
      "MSFT",
      "NVDA",
      "HON",
      "AMZN",
    ],
  },

  ai_infra: {
    name: "AI Infrastructure",
    description:
      "Semiconductors, servers, networking, data center infrastructure, and AI platforms.",
    symbols: [
      "NVDA",
      "AMD",
      "AVGO",
      "QCOM",
      "ARM",
      "MU",
      "SMCI",
      "DELL",
      "HPE",
      "ANET",
      "VRT",
      "ETN",
      "PWR",
      "FIX",
      "EME",
      "ORCL",
      "MSFT",
      "GOOGL",
      "META",
      "AMZN",
      "PLTR",
      "CRWD",
      "NET",
      "DDOG",
      "SNOW",
    ],
  },
};

function getThemeConfig(themeKey) {
  const clean = String(themeKey || "broad").toLowerCase();
  return THEME_CONFIG[clean] || THEME_CONFIG.broad;
}

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;

  if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveNumber(value, fallback = null) {
  const n = toNumber(value, fallback);
  if (n == null || !Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`
    );
  }

  return response.json();
}

async function fetchFmpBatch(symbols = [], apiKey) {
  const cleanSymbols = uniqueSymbols(symbols);
  if (!cleanSymbols.length) return [];

  const fmpSymbols = cleanSymbols.map(toFmpSymbol).join(",");

  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbols
  )}&apikey=${apiKey}`;

  const data = await fetchJson(url);

  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];

  return [];
}

async function fetchFmpIndividual(symbols = [], apiKey) {
  const cleanSymbols = uniqueSymbols(symbols);
  const all = [];

  for (const symbol of cleanSymbols) {
    try {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
        toFmpSymbol(symbol)
      )}&apikey=${apiKey}`;

      const data = await fetchJson(url);

      if (Array.isArray(data) && data[0]) {
        all.push(data[0]);
      } else if (data && typeof data === "object") {
        all.push(data);
      }
    } catch {
      // Skip one-symbol failures so one bad ticker does not kill the full screen.
    }
  }

  return all;
}

async function fetchFmpQuotes(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const cleanSymbols = uniqueSymbols(symbols);
  if (!cleanSymbols.length) return [];

  let batchQuotes = [];

  try {
    batchQuotes = await fetchFmpBatch(cleanSymbols, apiKey);
  } catch {
    batchQuotes = [];
  }

  if (Array.isArray(batchQuotes) && batchQuotes.length > 0) {
    return batchQuotes;
  }

  return fetchFmpIndividual(cleanSymbols, apiKey);
}


function getRequestBaseUrl(req) {
  const host = req?.headers?.host;

  if (!host) return "";

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}


function extractRecommendationLabel(stock = {}) {
  const rec = stock.recommendation;

  return String(
    (typeof rec === "string" ? rec : "") ||
      rec?.displayLabel ||
      rec?.label ||
      rec?.recommendation ||
      rec?.tradeAction ||
      stock.displayLabel ||
      stock.label ||
      stock.tradeAction ||
      stock.action ||
      stock.status ||
      ""
  ).trim();
}

function normalizeRecommendationObject(stock = {}, normalized = {}) {
  const rec = stock.recommendation;

  if (rec && typeof rec === "object") {
    const label = extractRecommendationLabel(stock) || rec.label || rec.tradeAction;

    return {
      ...rec,
      label,
      recommendation: rec.recommendation || label,
      tradeAction: rec.tradeAction || label,
    };
  }

  const directLabel = extractRecommendationLabel(stock);

  if (directLabel) {
    return {
      label: directLabel,
      recommendation: directLabel,
      tradeAction: directLabel,
      displayLabel: directLabel,
      score: stock.score ?? stock.compositeScore ?? normalized.score,
      reason: stock.reason || stock.actionWhy || stock.dominantReason || "",
      entryNote: stock.entryNote || stock.triggerNeeded || "",
      triggerScore: stock.triggerScore,
      momentumScore: stock.momentumScore,
      riskScore: stock.riskScore,
      expectationRisk: stock.expectationRisk,
      extensionRisk: stock.extensionRisk,
      freshBreakoutScore: stock.freshBreakoutScore,
    };
  }

  return getRecommendation(normalized);
}

function normalizeTradeReadiness(stock = {}, normalized = {}) {
  const value = stock.tradeReadiness;

  if (value && typeof value === "object") return value;
  if (typeof value === "string" && value.trim()) {
    return { label: value.trim(), recommendation: value.trim() };
  }

  const label = extractRecommendationLabel(stock);
  if (label) return { label, recommendation: label };

  return { label: getTradeReadiness(normalized) };
}

async function fetchSingleSymbolAnalysis(req, symbol) {
  const baseUrl = getRequestBaseUrl(req);

  if (!baseUrl || !symbol) return null;

  try {
    const url = `${baseUrl}/api?symbol=${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-screener-internal": "top5-single-brain",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const stock = data?.stock || data?.result || data?.data || data;

    if (!stock || typeof stock !== "object") return null;

    const normalized = normalizeQuote({
      ...stock,
      symbol: stock.symbol || symbol,
    });

    const recommendation = normalizeRecommendationObject(stock, normalized);

    const tradeReadiness = normalizeTradeReadiness(stock, normalized);

    const technicalSnapshot =
      stock.technicalSnapshot && typeof stock.technicalSnapshot === "object"
        ? stock.technicalSnapshot
        : buildTechnicalSnapshot(normalized);

    const fundamentalSnapshot =
      stock.fundamentalSnapshot && typeof stock.fundamentalSnapshot === "object"
        ? stock.fundamentalSnapshot
        : buildFundamentalSnapshot(normalized);

    const score = compositeScore(normalized);

    const row = {
      ...normalized,
      ...stock,
      symbol: normalizeSymbol(stock.symbol || symbol),
      ticker: normalizeSymbol(stock.symbol || symbol),
      price: normalized.price,
      currentPrice: normalized.currentPrice,
      lastPrice: normalized.lastPrice,
      close: normalized.close,
      changesPercentage: normalized.changesPercentage,
      changePercent: normalized.changePercent,
      dayChangePct: normalized.dayChangePct,
      score,
      compositeScore: score,
      recommendation,
      tradeReadiness,
      technicalSnapshot,
      fundamentalSnapshot,
      triggerScore: recommendation?.triggerScore ?? stock.triggerScore,
      momentumScore: recommendation?.momentumScore ?? stock.momentumScore,
      expectationRisk: recommendation?.expectationRisk ?? stock.expectationRisk,
      extensionRisk: recommendation?.extensionRisk ?? stock.extensionRisk,
      lateChaseRisk: recommendation?.lateChaseRisk ?? stock.lateChaseRisk,
      freshBreakoutScore:
        recommendation?.freshBreakoutScore ?? stock.freshBreakoutScore,
      context: recommendation?.context ?? stock.context,
      reason: recommendation?.reason ?? stock.reason,
      entryNote: recommendation?.entryNote ?? stock.entryNote,
      actionWhy: recommendation?.reason ?? stock.actionWhy,
      triggerNeeded: recommendation?.entryNote ?? stock.triggerNeeded,
      dataPath: "single-symbol-api",
    };

    return {
      ...row,
      institutionalRank: rankScore(row),
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items = [], concurrency = 8, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function fetchSingleBrainUniverse(req, symbols = []) {
  const cleanSymbols = uniqueSymbols(symbols);

  if (!cleanSymbols.length) return [];

  const rows = await mapWithConcurrency(cleanSymbols, 8, (symbol) =>
    fetchSingleSymbolAnalysis(req, symbol)
  );

  return rows.filter(Boolean);
}

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);

  const price = toPositiveNumber(row.price ?? row.currentPrice ?? row.close);
  const previousClose = toPositiveNumber(row.previousClose);
  const change = toNumber(row.change);

  let dayChangePct = toNumber(row.changesPercentage);

  if (dayChangePct == null) {
    dayChangePct = toNumber(row.changePercentage);
  }

  if (dayChangePct == null) {
    dayChangePct = toNumber(row.changePercent);
  }

  if (dayChangePct == null && price != null && previousClose) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct == null && change != null && previousClose) {
    dayChangePct = (change / previousClose) * 100;
  }

  // IMPORTANT:
  // Keep the raw quote fields and explicitly map every scoring field that the
  // single-symbol analyzer can use. The prior broad screener normalized the FMP
  // quote too aggressively and dropped fields such as yearHigh/yearLow/beta.
  // That made the broad screener and the single-symbol checker disagree on the
  // exact same stock at the exact same price. This object is now the single
  // source of truth passed into lib/scoring.js for broad-market rows.
  const yearHigh = toPositiveNumber(
    row.yearHigh ?? row.high52 ?? row.fiftyTwoWeekHigh ?? row['52WeekHigh']
  );
  const yearLow = toPositiveNumber(
    row.yearLow ?? row.low52 ?? row.fiftyTwoWeekLow ?? row['52WeekLow']
  );
  const priceAvg50 = toPositiveNumber(
    row.priceAvg50 ?? row.fiftyDayAverage ?? row.sma50 ?? row.ma50
  );
  const priceAvg200 = toPositiveNumber(
    row.priceAvg200 ?? row.twoHundredDayAverage ?? row.sma200 ?? row.ma200
  );
  const volume = toPositiveNumber(row.volume ?? row.vol);
  const avgVolume = toPositiveNumber(
    row.avgVolume ?? row.averageVolume ?? row.avgVolume10Day ?? row.averageVolume10Day
  );

  return {
    ...row,
    symbol,
    ticker: symbol,
    name: row.name || row.companyName || symbol,
    companyName: row.companyName || row.name || symbol,
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    changePercent: dayChangePct,
    marketCap: toPositiveNumber(row.marketCap ?? row.mktCap ?? row.marketCapitalization),
    volume,
    vol: volume,
    avgVolume,
    averageVolume: avgVolume,
    priceAvg50,
    fiftyDayAverage: priceAvg50,
    sma50: priceAvg50,
    priceAvg200,
    twoHundredDayAverage: priceAvg200,
    sma200: priceAvg200,
    yearHigh,
    high52: yearHigh,
    fiftyTwoWeekHigh: yearHigh,
    yearLow,
    low52: yearLow,
    fiftyTwoWeekLow: yearLow,
    dayHigh: toPositiveNumber(row.dayHigh ?? row.high),
    dayLow: toPositiveNumber(row.dayLow ?? row.low),
    open: toPositiveNumber(row.open),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe ?? row.peRatio),
    beta: toNumber(row.beta, null),
    sharesOutstanding: toPositiveNumber(row.sharesOutstanding),
    exchange: row.exchange || row.exchangeShortName || "",
    sector: row.sector || "",
    industry: row.industry || "",
    timestamp: row.timestamp || null,
  };
}

function displayLabel(stock = {}) {
  const rec = stock.recommendation;
  const label = String(
    (typeof rec === "string" ? rec : "") ||
      rec?.displayLabel ||
      rec?.label ||
      rec?.recommendation ||
      rec?.tradeAction ||
      stock.displayLabel ||
      stock.label ||
      stock.tradeAction ||
      stock.action ||
      stock.status ||
      ""
  ).toUpperCase();

  if (label === "BUY IMMEDIATELY") return "Buy Immediately";
  if (label === "BUY NOW") return "Buy Now";
  if (label === "BREAKOUT BUY") return "Breakout Buy";
  if (label === "STARTER ONLY" || label === "STARTER") return "Starter Only";
  if (
    label === "WATCH" ||
    label === "WATCH FOR ENTRY" ||
    label === "NEAR MISS" ||
    label === "SETUP"
  ) {
    return "Watch";
  }

  return "Avoid";
}

function actionRank(stock = {}) {
  const label = displayLabel(stock);

  if (label === "Buy Immediately") return 5;
  if (label === "Buy Now") return 4;
  if (label === "Breakout Buy") return 3;
  if (label === "Starter Only") return 2;
  if (label === "Watch") return 1;
  return 0;
}

function readinessRank(stock = {}) {
  const raw = stock.tradeReadiness;
  const label = String(
    (typeof raw === "string" ? raw : "") ||
      raw?.label ||
      raw?.recommendation ||
      raw?.tradeAction ||
      ""
  ).toUpperCase();

  if (label === "BUY IMMEDIATELY" || label === "TRADE READY") return 3;
  if (label === "BUY NOW" || label === "BREAKOUT BUY") return 3;
  if (label === "STARTER ONLY" || label === "WATCH" || label === "WATCH CLOSELY") return 2;
  if (label === "SETUP ONLY" || label === "NEAR MISS") return 1;

  return 0;
}

function safeScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rankScore(stock = {}) {
  const rec = stock.recommendation || {};

  const actionPoints = actionRank(stock) * 100000;
  const readinessPoints = readinessRank(stock) * 10000;

  const score = safeScore(rec.score || stock.score);
  const institutionalScore = safeScore(rec.institutionalScore);
  const actionabilityScore = safeScore(rec.actionabilityScore);
  const triggerScore = safeScore(rec.triggerScore || stock.triggerScore);
  const momentumScore = safeScore(rec.momentumScore || stock.momentumScore);
  const relativeStrengthScore = safeScore(rec.relativeStrengthScore);
  const freshBreakoutScore = safeScore(rec.freshBreakoutScore);

  const expectationRisk = safeScore(rec.expectationRisk);
  const extensionRisk = safeScore(rec.extensionRisk);
  const lateChaseRisk = safeScore(rec.lateChaseRisk);
  const riskPenalty = safeScore(rec.riskPenalty);

  const positive =
    institutionalScore * 2.6 +
    actionabilityScore * 2.4 +
    score * 1.8 +
    triggerScore * 3.1 +
    momentumScore * 2.2 +
    relativeStrengthScore * 1.4 +
    freshBreakoutScore * 1.4;

  const negative =
    expectationRisk * 1.2 +
    extensionRisk * 1.3 +
    lateChaseRisk * 1.5 +
    riskPenalty * 0.8;

  return actionPoints + readinessPoints + positive - negative;
}

function enrichQuote(row = {}) {
  const normalized = normalizeQuote(row);

  if (!normalized.symbol || normalized.price == null) {
    return null;
  }

  const recommendation = getRecommendation(normalized);
  const tradeReadiness = getTradeReadiness(normalized);
  const technicalSnapshot = buildTechnicalSnapshot(normalized);
  const fundamentalSnapshot = buildFundamentalSnapshot(normalized);
  const score = compositeScore(normalized);

  const stock = {
    ...normalized,
    score,
    compositeScore: score,
    recommendation,
    tradeReadiness,
    technicalSnapshot,
    fundamentalSnapshot,

    triggerScore: recommendation?.triggerScore,
    momentumScore: recommendation?.momentumScore,
    expectationRisk: recommendation?.expectationRisk,
    extensionRisk: recommendation?.extensionRisk,
    lateChaseRisk: recommendation?.lateChaseRisk,
    freshBreakoutScore: recommendation?.freshBreakoutScore,
    context: recommendation?.context,
    reason: recommendation?.reason,
    entryNote: recommendation?.entryNote,
    actionWhy: recommendation?.reason,
    triggerNeeded: recommendation?.entryNote,
  };

  return {
    ...stock,
    institutionalRank: rankScore(stock),
  };
}

function buildDisplayUniverse(enriched = []) {
  const sorted = [...enriched].sort(sortTopIdeas);

  const rank = {
    "Buy Immediately": 5,
    "Buy Now": 4,
    "Breakout Buy": 3,
    "Starter Only": 2,
    Watch: 1,
    Avoid: 0,
  };

  const byAction = (label) =>
    sorted
      .filter((stock) => displayLabel(stock) === label)
      .sort(sortTopIdeas);

  const selected = [
    ...byAction("Buy Immediately"),
    ...byAction("Buy Now"),
    ...byAction("Breakout Buy"),
    ...byAction("Starter Only").slice(0, 15),
    ...byAction("Watch").slice(0, 12),
    ...byAction("Avoid").slice(0, 8),
  ];

  const seen = new Set();
  const unique = [];

  for (const stock of selected) {
    const symbol = normalizeSymbol(stock.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push({
      ...stock,
      actionRank: rank[displayLabel(stock)] ?? 0,
    });
  }

  return unique.slice(0, 60);
}

function sortTopIdeas(a, b) {
  const rankA = Number(a.institutionalRank || 0);
  const rankB = Number(b.institutionalRank || 0);

  if (rankB !== rankA) return rankB - rankA;

  const scoreA = safeScore(a.recommendation?.actionabilityScore || a.score);
  const scoreB = safeScore(b.recommendation?.actionabilityScore || b.score);

  if (scoreB !== scoreA) return scoreB - scoreA;

  const triggerA = safeScore(a.recommendation?.triggerScore);
  const triggerB = safeScore(b.recommendation?.triggerScore);

  if (triggerB !== triggerA) return triggerB - triggerA;

  const momentumA = safeScore(a.recommendation?.momentumScore);
  const momentumB = safeScore(b.recommendation?.momentumScore);

  return momentumB - momentumA;
}

export default async function handler(req, res) {
  try {
    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = getThemeConfig(themeKey);
    const symbols = uniqueSymbols(selectedTheme.symbols);

    if (!symbols.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "The selected theme has no symbols configured.",
      });
    }

    // Critical architecture fix:
    // Broad Market must use the exact same single-symbol decision path as the
    // Single Symbol Action Check. There is intentionally NO silent quote-only
    // fallback here. A fallback can make the page look healthy while returning
    // different labels for the same symbol at the same price, which is exactly
    // the ANET/QCOM problem we diagnosed.
    const rawRows = await fetchSingleBrainUniverse(req, symbols);
    const dataPath = "single-symbol-api-required";
    const quotes = [];

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(502).json({
        error: "Single-symbol engine unavailable.",
        detail:
          "Broad screener refused to use the old quote-only fallback because it can disagree with the Single Symbol Action Check. Upload pages/api/index.js if this error persists so the route can be wired directly instead of through an internal fetch.",
        meta: {
          mode: "single_symbol_engine_required_v7",
          requestedSymbols: symbols.length,
          scoredQuotes: 0,
        },
      });
    }

    const enriched = rawRows.filter((stock) =>
      Number.isFinite(Number(stock.price ?? stock.currentPrice ?? stock.lastPrice))
    );

    if (!enriched.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail:
          "Rows came back, but none could be scored into usable stock rows.",
      });
    }

    const sorted = buildDisplayUniverse(enriched);

    return res.status(200).json({
      selectedTheme,
      count: sorted.length,
      stocks: sorted,
      meta: {
        mode: "single_symbol_engine_required_v7",
        decisionSource: "same /api?symbol output used by Single Symbol Action Check",
        top5DoesLabelMapping: false,
        dataPath,
        requestedSymbols: symbols.length,
        returnedQuotes: quotes.length,
        scoredQuotes: enriched.length,
        displayUniverse: sorted.length,
        buyImmediatelyCount: enriched.filter((stock) => displayLabel(stock) === "Buy Immediately").length,
        buyNowCount: enriched.filter((stock) => displayLabel(stock) === "Buy Now").length,
        breakoutBuyCount: enriched.filter((stock) => displayLabel(stock) === "Breakout Buy").length,
        starterOnlyCount: enriched.filter((stock) => displayLabel(stock) === "Starter Only").length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}
