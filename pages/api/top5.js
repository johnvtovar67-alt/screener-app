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

function safeScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeActionLabel(value) {
  const label = String(value || "").trim().toUpperCase();

  if (
    label === "BUY" ||
    label === "BUY NOW" ||
    label === "BUY IMMEDIATELY" ||
    label === "STRONG BUY"
  ) {
    return "Buy";
  }

  if (
    label === "STARTER" ||
    label === "STARTER ONLY" ||
    label === "BREAKOUT BUY" ||
    label === "BREAKOUT" ||
    label === "BREAKOUT STARTER"
  ) {
    return "Starter";
  }

  if (
    label === "WATCH" ||
    label === "WATCH FOR ENTRY" ||
    label === "NEAR MISS" ||
    label === "SETUP" ||
    label === "SETUP ONLY" ||
    label === "WATCH CLOSELY"
  ) {
    return "Watch";
  }

  return "Avoid";
}

function getAction(stock = {}) {
  const rec = stock?.recommendation && typeof stock.recommendation === "object" ? stock.recommendation : {};
  return normalizeActionLabel(
    rec.displayLabel ??
      rec.label ??
      rec.recommendation ??
      rec.tradeAction ??
      stock.displayLabel ??
      stock.label ??
      stock.recommendation ??
      stock.tradeAction ??
      stock.action
  );
}

function actionRank(actionOrStock) {
  const action = typeof actionOrStock === "string" ? actionOrStock : getAction(actionOrStock);
  if (action === "Buy") return 3;
  if (action === "Starter") return 2;
  if (action === "Watch") return 1;
  return 0;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
  }

  return response.json();
}

function chunkArray(items = [], size = 25) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function asQuoteArray(data) {
  if (Array.isArray(data)) return data.filter(Boolean);
  if (data && typeof data === "object") return [data];
  return [];
}

async function fetchStableQuoteChunk(symbols = [], apiKey) {
  const fmpSymbols = symbols.map(toFmpSymbol).join(",");
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbols
  )}&apikey=${apiKey}`;

  return asQuoteArray(await fetchJson(url));
}

async function fetchLegacyQuoteChunk(symbols = [], apiKey) {
  const fmpSymbols = symbols.map(toFmpSymbol).join(",");
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(
    fmpSymbols
  )}?apikey=${apiKey}`;

  return asQuoteArray(await fetchJson(url));
}

async function fetchQuoteChunk(symbols = [], apiKey) {
  if (!symbols.length) return [];

  try {
    const stable = await fetchStableQuoteChunk(symbols, apiKey);
    if (stable.length) return stable;
  } catch {
    // Try the legacy FMP quote endpoint before falling back to one-by-one calls.
  }

  try {
    const legacy = await fetchLegacyQuoteChunk(symbols, apiKey);
    if (legacy.length) return legacy;
  } catch {
    // Try one-by-one below.
  }

  const individual = [];

  for (const symbol of symbols) {
    try {
      const rows = await fetchStableQuoteChunk([symbol], apiKey);
      if (rows.length) {
        individual.push(rows[0]);
        continue;
      }
    } catch {
      // Try legacy one-symbol quote below.
    }

    try {
      const rows = await fetchLegacyQuoteChunk([symbol], apiKey);
      if (rows.length) individual.push(rows[0]);
    } catch {
      // Skip one bad ticker so the screen does not fail.
    }
  }

  return individual;
}

async function fetchFmpQuotes(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("Missing FMP_API_KEY in environment variables.");

  const cleanSymbols = uniqueSymbols(symbols);
  if (!cleanSymbols.length) return [];

  const chunks = chunkArray(cleanSymbols, 20);
  const all = [];

  for (const chunk of chunks) {
    const rows = await fetchQuoteChunk(chunk, apiKey);
    all.push(...rows);
  }

  const seen = new Set();
  return all.filter((row) => {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);
  const price = toPositiveNumber(row.price);
  const previousClose = toPositiveNumber(row.previousClose);
  const change = toNumber(row.change);

  let dayChangePct = toNumber(row.changesPercentage);
  if (dayChangePct == null) dayChangePct = toNumber(row.changePercentage);
  if (dayChangePct == null) dayChangePct = toNumber(row.changePercent);

  if (dayChangePct == null && price != null && previousClose) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct == null && change != null && previousClose) {
    dayChangePct = (change / previousClose) * 100;
  }

  const normalized = {
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
    marketCap: toPositiveNumber(row.marketCap),
    volume: toPositiveNumber(row.volume),
    avgVolume: toPositiveNumber(row.avgVolume),
    priceAvg50: toPositiveNumber(row.priceAvg50),
    fiftyDayAverage: toPositiveNumber(row.priceAvg50 ?? row.fiftyDayAverage),
    priceAvg200: toPositiveNumber(row.priceAvg200),
    twoHundredDayAverage: toPositiveNumber(row.priceAvg200 ?? row.twoHundredDayAverage),
    yearHigh: toPositiveNumber(row.yearHigh),
    yearLow: toPositiveNumber(row.yearLow),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    beta: toNumber(row.beta, null),
    exchange: row.exchange || row.exchangeShortName || "",
    timestamp: row.timestamp || null,
  };

  const recommendation = getRecommendation(normalized);
  const score = compositeScore(normalized);
  const technicalSnapshot = buildTechnicalSnapshot(normalized);
  const fundamentalSnapshot = buildFundamentalSnapshot(normalized);
  const action = normalizeActionLabel(recommendation.label || getTradeReadiness(normalized));

  return {
    ...normalized,
    score,
    compositeScore: score,
    heatScore: score,
    recommendation: {
      ...recommendation,
      label: action,
      displayLabel: action,
      recommendation: action,
      tradeAction: action,
    },
    technicalSnapshot,
    fundamentalSnapshot,
    triggerScore: recommendation.triggerScore ?? technicalSnapshot.triggerScore,
    momentumScore: recommendation.momentumScore ?? technicalSnapshot.momentumScore,
    expectationRisk: recommendation.expectationRisk ?? recommendation.riskScore,
    extensionRisk: recommendation.extensionRisk,
    freshBreakoutScore: recommendation.freshBreakoutScore,
    dominantReason: recommendation.dominantReason,
    reason: recommendation.reason,
    actionWhy: recommendation.reason,
    entryNote: recommendation.entryNote,
    triggerNeeded: recommendation.entryNote,
    categoryRiskNote: recommendation.categoryRiskNote || "",
    decisionEngine: "batch-quote-scoring-js-v18",
  };
}

function rankScore(stock = {}) {
  const rec = stock.recommendation || {};
  const actionPoints = actionRank(stock) * 1000000;
  const score = safeScore(rec.score ?? stock.score);
  const triggerScore = safeScore(rec.triggerScore ?? stock.triggerScore);
  const momentumScore = safeScore(rec.momentumScore ?? stock.momentumScore);
  const technicalScore = safeScore(rec.technicalScore ?? stock.technicalSnapshot?.technicalScore);
  const fundamentalScore = safeScore(rec.fundamentalScore ?? stock.fundamentalSnapshot?.fundamentalScore);
  const freshBreakoutScore = safeScore(rec.freshBreakoutScore ?? stock.freshBreakoutScore);
  const riskScore = safeScore(rec.expectationRisk ?? rec.riskScore ?? stock.expectationRisk ?? stock.riskScore);
  const extensionRisk = safeScore(rec.extensionRisk ?? stock.extensionRisk);

  return (
    actionPoints +
    score * 1000 +
    triggerScore * 40 +
    momentumScore * 35 +
    technicalScore * 20 +
    fundamentalScore * 12 +
    freshBreakoutScore * 10 -
    riskScore * 8 -
    extensionRisk * 6
  );
}

function sortTopIdeas(a, b) {
  const actionDiff = actionRank(b) - actionRank(a);
  if (actionDiff !== 0) return actionDiff;

  const rankDiff = rankScore(b) - rankScore(a);
  if (rankDiff !== 0) return rankDiff;

  const triggerDiff = safeScore(b.triggerScore) - safeScore(a.triggerScore);
  if (triggerDiff !== 0) return triggerDiff;

  const momentumDiff = safeScore(b.momentumScore) - safeScore(a.momentumScore);
  if (momentumDiff !== 0) return momentumDiff;

  return safeScore(b.score) - safeScore(a.score);
}

function bucketRows(rows = []) {
  const sorted = [...rows].sort(sortTopIdeas);
  const byAction = (label) => sorted.filter((stock) => getAction(stock) === label).sort(sortTopIdeas);

  const buys = byAction("Buy");
  const starters = byAction("Starter");
  const watches = byAction("Watch");
  const avoids = byAction("Avoid");

  const selected = [
    ...buys.slice(0, 8),
    ...starters.slice(0, 10),
    ...watches.slice(0, 12),
    ...avoids.slice(0, 8),
  ];

  const seen = new Set();
  const unique = [];

  for (const stock of selected) {
    const symbol = normalizeSymbol(stock.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push(stock);
  }

  return unique;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = getThemeConfig(themeKey);
    const symbols = uniqueSymbols(selectedTheme.symbols);

    if (!symbols.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "The selected theme has no symbols configured.",
      });
    }

    const rawQuotes = await fetchFmpQuotes(symbols);
    const rows = rawQuotes
      .map(normalizeQuote)
      .filter((stock) => stock.symbol && Number.isFinite(Number(stock.price)) && Number(stock.price) > 0);

    if (!rows.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail: "FMP returned no usable quotes for the selected theme.",
      });
    }

    const stocks = bucketRows(rows);
    const countByAction = (label) => rows.filter((stock) => getAction(stock) === label).length;

    return res.status(200).json({
      selectedTheme,
      count: stocks.length,
      stocks,
      meta: {
        mode: "batch_quote_scoring_js_v18_four_decisions",
        dataPath: "FMP batch quote + lib/scoring.js",
        decisionSource: "lib/scoring.js getRecommendation",
        fallbackUsed: false,
        requestedSymbols: symbols.length,
        analyzedSymbols: rows.length,
        buyCount: countByAction("Buy"),
        starterCount: countByAction("Starter"),
        watchCount: countByAction("Watch"),
        avoidCount: countByAction("Avoid"),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}
