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

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);

  const price = toPositiveNumber(row.price);
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

  return {
    symbol,
    name: row.name || row.companyName || symbol,
    price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    marketCap: toPositiveNumber(row.marketCap),
    volume: toPositiveNumber(row.volume),
    avgVolume: toPositiveNumber(row.avgVolume),
    yearHigh: toPositiveNumber(row.yearHigh || row.high52 || row.fiftyTwoWeekHigh),
    yearLow: toPositiveNumber(row.yearLow || row.low52 || row.fiftyTwoWeekLow),
    beta: toNumber(row.beta, 1),
    priceAvg50: toPositiveNumber(row.priceAvg50),
    priceAvg200: toPositiveNumber(row.priceAvg200),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    exchange: row.exchange || "",
    timestamp: row.timestamp || null,
  };
}

function displayLabel(stock = {}) {
  const label = String(
    stock.recommendation?.displayLabel ||
      stock.recommendation?.label ||
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
  const label = String(stock.tradeReadiness?.label || "").toUpperCase();

  if (label === "TRADE READY") return 3;
  if (label === "WATCH" || label === "WATCH CLOSELY") return 2;
  if (label === "SETUP ONLY") return 1;

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

    const quotes = await fetchFmpQuotes(symbols);

    if (!Array.isArray(quotes) || quotes.length === 0) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail:
          "FMP returned no quotes for this refresh. Keeping the prior screen is safer than replacing it with blanks.",
      });
    }

    const enriched = quotes
      .map(enrichQuote)
      .filter(Boolean)
      .filter((stock) => Number.isFinite(Number(stock.price)));

    if (!enriched.length) {
      return res.status(502).json({
        error: "Quote refresh returned no usable stocks.",
        detail:
          "Quotes came back from FMP, but none could be scored into usable stock rows.",
      });
    }

    const sorted = buildDisplayUniverse(enriched);

    return res.status(200).json({
      selectedTheme,
      count: sorted.length,
      stocks: sorted,
      meta: {
        mode: "single_brain_bucketed_universe_v4",
        decisionSource: "lib/scoring.js",
        top5DoesLabelMapping: false,
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
