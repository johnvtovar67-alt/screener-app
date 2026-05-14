// pages/api/top5.js

import {
  compositeScore,
  getRecommendation,
  getTradeReadiness,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
}

function toFmpSymbol(symbol) {
  return String(symbol || "")
    .replace(".", "-")
    .toUpperCase()
    .trim();
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
      // AI / Software / Semis
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

      // Financials / Capital Markets / Fintech
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

      // Energy / Infrastructure / Industrials
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

      // Nuclear / Uranium
      "CCJ",
      "UEC",
      "UUUU",
      "LEU",
      "BWXT",
      "SMR",
      "OKLO",
      "NNE",

      // Crypto / Bitcoin proxies
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

      // Healthcare / Biotech / Spec growth
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

      // Consumer / Travel / Cyclical / Other growth
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

      // REIT / Income names retained, but capped by scoring logic
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
      "XOM",
      "CVX",
      "COP",
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

async function fetchFmpQuotes(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const cleanSymbols = uniqueSymbols(symbols);

  if (!cleanSymbols.length) {
    return [];
  }

  const fmpSymbols = cleanSymbols.map(toFmpSymbol).join(",");

  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbols
  )}&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data;
}

function toNumber(value, fallback = null) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function normalizeQuote(row = {}) {
  const symbol = normalizeSymbol(row.symbol);

  const price = toNumber(row.price);
  const previousClose = toNumber(row.previousClose);
  const change = toNumber(row.change);

  let dayChangePct = toNumber(row.changesPercentage);

  if (dayChangePct == null && price != null && previousClose) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct == null && change != null && previousClose) {
    dayChangePct = (change / previousClose) * 100;
  }

  return {
    symbol,
    name: row.name || symbol,
    price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,
    marketCap: toNumber(row.marketCap),
    volume: toNumber(row.volume),
    avgVolume: toNumber(row.avgVolume),
    priceAvg50: toNumber(row.priceAvg50),
    priceAvg200: toNumber(row.priceAvg200),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    exchange: row.exchange || "",
    timestamp: row.timestamp || null,
  };
}

function actionRank(label) {
  const clean = String(label || "").toUpperCase();

  if (clean === "BUY NOW") return 4;
  if (clean === "BUY") return 3;
  if (clean === "WATCH FOR ENTRY") return 2;
  if (clean === "WATCH") return 2;
  if (clean === "AVOID FOR NOW") return 1;
  if (clean === "AVOID") return 1;

  return 0;
}

function readinessRank(label) {
  const clean = String(label || "").toUpperCase();

  if (clean === "TRADE READY") return 4;
  if (clean === "BUY") return 3;
  if (clean === "WATCH CLOSELY") return 2;
  if (clean === "SETUP ONLY") return 1;

  return 0;
}

function institutionalRank(stock = {}) {
  const rec = stock.recommendation || {};
  const tradeReadiness = stock.tradeReadiness || {};

  const actionPoints = actionRank(rec.label) * 1000;
  const readinessPoints = readinessRank(tradeReadiness.label) * 450;

  const score = Number(rec.score || stock.score || 0);
  const trigger = Number(rec.triggerScore || stock.triggerScore || 0);
  const momentum = Number(rec.momentumScore || stock.momentumScore || 0);
  const relative = Number(rec.relativeStrengthScore || 0);
  const freshBreakout = Number(rec.freshBreakoutScore || 0);

  const expectationRisk = Number(rec.expectationRisk || 0);
  const extensionRisk = Number(rec.extensionRisk || 0);
  const riskPenalty = Number(rec.riskPenalty || 0);

  const confidenceBoost =
    rec.confidence === "High" ? 120 : rec.confidence === "Medium" ? 55 : 0;

  const buyMiddleTierBoost = String(rec.label || "").toUpperCase() === "BUY"
    ? 220
    : 0;

  const setupStrength =
    score * 2.4 +
    trigger * 3.1 +
    momentum * 2.2 +
    relative * 1.3 +
    freshBreakout * 1.2;

  const riskDrag =
    expectationRisk * 1.35 +
    extensionRisk * 1.45 +
    riskPenalty * 1.15;

  return (
    actionPoints +
    readinessPoints +
    buyMiddleTierBoost +
    confidenceBoost +
    setupStrength -
    riskDrag
  );
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
    triggerScore: recommendation.triggerScore,
    momentumScore: recommendation.momentumScore,
    expectationRisk: recommendation.expectationRisk,
    extensionRisk: recommendation.extensionRisk,
    freshBreakoutScore: recommendation.freshBreakoutScore,
    context: recommendation.context,
    confidence: recommendation.confidence,
    risk: recommendation.risk,
    reason: recommendation.reason,
    entryNote: recommendation.entryNote,
  };

  return {
    ...stock,
    institutionalRank: institutionalRank(stock),
  };
}

function sortTopIdeas(a, b) {
  const rankA = Number(a.institutionalRank || 0);
  const rankB = Number(b.institutionalRank || 0);

  if (rankB !== rankA) return rankB - rankA;

  const scoreA = Number(a.recommendation?.score || a.score || 0);
  const scoreB = Number(b.recommendation?.score || b.score || 0);

  if (scoreB !== scoreA) return scoreB - scoreA;

  const triggerA = Number(a.recommendation?.triggerScore || 0);
  const triggerB = Number(b.recommendation?.triggerScore || 0);

  return triggerB - triggerA;
}

export default async function handler(req, res) {
  try {
    const themeKey = String(req.query.theme || "broad").toLowerCase();
    const selectedTheme = getThemeConfig(themeKey);

    const symbols = uniqueSymbols(selectedTheme.symbols);

    if (!symbols.length) {
      return res.status(200).json({
        selectedTheme,
        stocks: [],
      });
    }

    const quotes = await fetchFmpQuotes(symbols);

    const enriched = quotes
      .map(enrichQuote)
      .filter(Boolean)
      .filter((stock) => Number.isFinite(Number(stock.price)));

    const sorted = enriched.sort(sortTopIdeas).slice(0, 10);

    return res.status(200).json({
      selectedTheme,
      count: sorted.length,
      stocks: sorted,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}
