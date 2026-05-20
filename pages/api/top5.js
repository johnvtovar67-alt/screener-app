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

      if (Array.isArray(data) && data[0]) all.push(data[0]);
      else if (data && typeof data === "object") all.push(data);
    } catch {
      // Skip one-symbol failures so one bad quote does not kill the screen.
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

  if (dayChangePct == null) dayChangePct = toNumber(row.changePercentage);
  if (dayChangePct == null) dayChangePct = toNumber(row.changePercent);

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
    priceAvg50: toPositiveNumber(row.priceAvg50),
    priceAvg200: toPositiveNumber(row.priceAvg200),
    eps: toNumber(row.eps),
    pe: toNumber(row.pe),
    exchange: row.exchange || "",
    timestamp: row.timestamp || null,
  };
}

function cleanLabel(value) {
  return String(value || "").trim().toUpperCase();
}

function actionRank(label) {
  const clean = cleanLabel(label);

  if (clean === "BUY NOW") return 3;
  if (clean === "WATCH" || clean === "WATCH FOR ENTRY") return 2;
  if (clean === "AVOID" || clean === "AVOID FOR NOW") return 1;

  return 0;
}

function readinessRank(label) {
  const clean = cleanLabel(label);

  if (clean === "TRADE READY") return 3;
  if (clean === "BUY") return 2;
  if (clean === "WATCH CLOSELY") return 2;
  if (clean === "SETUP ONLY") return 1;

  return 0;
}

function mapFinalLabel(recommendation = {}, tradeReadiness = {}) {
  const rawLabel = cleanLabel(recommendation.displayLabel || recommendation.label);
  const readiness = cleanLabel(tradeReadiness.label);

  const score = Number(
    recommendation.institutionalScore ||
      recommendation.actionabilityScore ||
      recommendation.score ||
      0
  );

  const trigger = Number(recommendation.triggerScore || 0);
  const momentum = Number(recommendation.momentumScore || 0);
  const relativeStrength = Number(recommendation.relativeStrengthScore || 0);
  const freshBreakout = Number(recommendation.freshBreakoutScore || 0);

  const expectationRisk = Number(recommendation.expectationRisk || 0);
  const extensionRisk = Number(recommendation.extensionRisk || 0);
  const lateChaseRisk = Number(recommendation.lateChaseRisk || 0);
  const riskPenalty = Number(recommendation.riskPenalty || 0);

  const context = cleanLabel(recommendation.context);
  const reason = cleanLabel(recommendation.reason);
  const entryNote = cleanLabel(recommendation.entryNote);
  const combinedText = `${context} ${reason} ${entryNote}`;

  const supportOnly =
    combinedText.includes("HOLDING KEY SUPPORT") ||
    combinedText.includes("SUPPORT");

  const weakOrCautious =
    combinedText.includes("EXTENDED") ||
    combinedText.includes("RESISTANCE") ||
    combinedText.includes("LAGGING") ||
    combinedText.includes("FAILED") ||
    combinedText.includes("FADING") ||
    combinedText.includes("BINARY");

  const improving =
    combinedText.includes("IMPROVING") ||
    combinedText.includes("REBUILDING") ||
    combinedText.includes("TRIGGER") ||
    combinedText.includes("MOMENTUM");

  /*
    Final label rule:
    - Buy Now must be truly actionable.
    - Generic Buy / Trade Ready no longer auto-promotes to Buy Now.
    - Holding key support alone is Watch, not Buy Now.
  */

  if (rawLabel === "BUY NOW") {
    if (
      trigger >= 78 &&
      momentum >= 58 &&
      expectationRisk <= 62 &&
      extensionRisk <= 62 &&
      lateChaseRisk <= 62 &&
      !supportOnly &&
      !weakOrCautious
    ) {
      return "Buy Now";
    }

    return "Watch";
  }

  if (
    score >= 90 &&
    trigger >= 84 &&
    momentum >= 68 &&
    relativeStrength >= 55 &&
    expectationRisk <= 55 &&
    extensionRisk <= 55 &&
    lateChaseRisk <= 55 &&
    riskPenalty <= 35 &&
    freshBreakout >= 55 &&
    !supportOnly &&
    !weakOrCautious
  ) {
    return "Buy Now";
  }

  if (
    rawLabel === "BUY" ||
    rawLabel === "AGGRESSIVE BUY" ||
    readiness === "TRADE READY"
  ) {
    if (
      score >= 88 &&
      trigger >= 82 &&
      momentum >= 65 &&
      expectationRisk <= 55 &&
      extensionRisk <= 55 &&
      lateChaseRisk <= 55 &&
      !supportOnly &&
      !weakOrCautious
    ) {
      return "Buy Now";
    }

    return "Watch";
  }

  if (
    rawLabel === "WATCH" ||
    rawLabel === "WATCH FOR ENTRY" ||
    rawLabel === "WATCH CLOSELY" ||
    rawLabel === "STARTER POSITION" ||
    rawLabel === "EARLY MOMENTUM" ||
    readiness === "WATCH CLOSELY" ||
    readiness === "SETUP ONLY"
  ) {
    return "Watch";
  }

  if (
    score >= 72 ||
    trigger >= 65 ||
    momentum >= 62 ||
    improving ||
    supportOnly
  ) {
    return "Watch";
  }

  return "Avoid";
}

function institutionalRank(stock = {}) {
  const rec = stock.recommendation || {};
  const tradeReadiness = stock.tradeReadiness || {};

  const score = Number(rec.score || stock.score || 0);
  const institutionalScore = Number(rec.institutionalScore || score || 0);
  const actionabilityScore = Number(rec.actionabilityScore || 0);
  const trigger = Number(rec.triggerScore || stock.triggerScore || 0);
  const momentum = Number(rec.momentumScore || stock.momentumScore || 0);
  const relative = Number(rec.relativeStrengthScore || 0);
  const freshBreakout = Number(rec.freshBreakoutScore || 0);

  const expectationRisk = Number(rec.expectationRisk || 0);
  const extensionRisk = Number(rec.extensionRisk || 0);
  const lateChaseRisk = Number(rec.lateChaseRisk || 0);
  const riskPenalty = Number(rec.riskPenalty || 0);

  const actionPoints = actionRank(rec.label) * 1000;
  const readinessPoints = readinessRank(tradeReadiness.label) * 450;

  const setupStrength =
    institutionalScore * 2.6 +
    actionabilityScore * 2.4 +
    score * 1.9 +
    trigger * 3.2 +
    momentum * 2.2 +
    relative * 1.2 +
    freshBreakout * 1.3;

  const riskDrag =
    expectationRisk * 1.15 +
    extensionRisk * 1.25 +
    lateChaseRisk * 1.5 +
    riskPenalty * 0.85;

  return actionPoints + readinessPoints + setupStrength - riskDrag;
}

function enrichQuote(row = {}) {
  const normalized = normalizeQuote(row);

  if (!normalized.symbol || normalized.price == null) {
    return null;
  }

  const recommendationRaw = getRecommendation(normalized);
  const tradeReadiness = getTradeReadiness(normalized);
  const finalLabel = mapFinalLabel(recommendationRaw, tradeReadiness);

  const recommendation = {
    ...recommendationRaw,
    label: finalLabel,
    displayLabel: finalLabel,
  };

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
    lateChaseRisk: recommendation.lateChaseRisk,
    freshBreakoutScore: recommendation.freshBreakoutScore,
    context: recommendation.context,
    reason: recommendation.reason,
    entryNote: recommendation.entryNote,
  };

  return {
    ...stock,
    institutionalRank: institutionalRank(stock),
  };
}

function sortTopIdeas(a, b) {
  const actionA = actionRank(a.recommendation?.label);
  const actionB = actionRank(b.recommendation?.label);

  if (actionB !== actionA) return actionB - actionA;

  const rankA = Number(a.institutionalRank || 0);
  const rankB = Number(b.institutionalRank || 0);

  if (rankB !== rankA) return rankB - rankA;

  const scoreA = Number(a.recommendation?.institutionalScore || a.score || 0);
  const scoreB = Number(b.recommendation?.institutionalScore || b.score || 0);

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

    const sorted = enriched.sort(sortTopIdeas).slice(0, 10);

    return res.status(200).json({
      selectedTheme,
      count: sorted.length,
      stocks: sorted,
      meta: {
        historicalConfirmation: false,
        mode: "fast_quote_screen_no_blank_recovery_stricter_buy_now",
        requestedSymbols: symbols.length,
        returnedQuotes: quotes.length,
        scoredQuotes: enriched.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}
