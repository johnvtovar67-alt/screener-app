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

  if (n == null) return fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return fallback;

  return n;
}

function avg(values = []) {
  const clean = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  if (!clean.length) return null;

  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function max(values = []) {
  const clean = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  if (!clean.length) return null;

  return Math.max(...clean);
}

function min(values = []) {
  const clean = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  if (!clean.length) return null;

  return Math.min(...clean);
}

function pctChange(current, base) {
  const c = Number(current);
  const b = Number(base);

  if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0) return null;

  return ((c - b) / b) * 100;
}

function sortHistoricalRows(rows = []) {
  return rows
    .filter((row) => row && row.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
  const batchSize = 12;

  for (let i = 0; i < cleanSymbols.length; i += batchSize) {
    const batch = cleanSymbols.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
          toFmpSymbol(symbol)
        )}&apikey=${apiKey}`;

        const data = await fetchJson(url);

        if (Array.isArray(data)) return data[0] || null;
        if (data && typeof data === "object") return data;

        return null;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        all.push(result.value);
      }
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

async function fetchHistorical(symbol, apiKey) {
  const clean = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    clean
  )}&apikey=${apiKey}`;

  const data = await fetchJson(url);

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.historical)
      ? data.historical
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return sortHistoricalRows(rows).slice(0, 90);
}

async function fetchHistoricalForSymbols(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const cleanSymbols = uniqueSymbols(symbols);
  const results = {};
  const batchSize = 6;

  for (let i = 0; i < cleanSymbols.length; i += batchSize) {
    const batch = cleanSymbols.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(async (symbol) => {
        const rows = await fetchHistorical(symbol, apiKey);
        return {
          symbol,
          rows,
        };
      })
    );

    for (const item of settled) {
      if (item.status === "fulfilled") {
        results[item.value.symbol] = item.value.rows;
      }
    }
  }

  return results;
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

function buildHistoricalSignals(history = [], quote = {}) {
  const rows = sortHistoricalRows(history);

  if (rows.length < 20) {
    return {
      historicalDataAvailable: false,
    };
  }

  const price = toPositiveNumber(quote.price);

  if (price == null) {
    return {
      historicalDataAvailable: false,
    };
  }

  const closes = rows.map((row) => toPositiveNumber(row.close));
  const highs = rows.map((row) => toPositiveNumber(row.high));
  const lows = rows.map((row) => toPositiveNumber(row.low));
  const volumes = rows.map((row) => toPositiveNumber(row.volume));

  const close5 = closes[4] ?? null;
  const close10 = closes[9] ?? null;
  const close20 = closes[19] ?? null;

  const sma5 = avg(closes.slice(0, 5));
  const sma10 = avg(closes.slice(0, 10));
  const sma20 = avg(closes.slice(0, 20));

  const recentHigh10 = max(highs.slice(0, 10));
  const recentHigh20 = max(highs.slice(0, 20));
  const recentHigh50 = max(highs.slice(0, 50));

  const recentLow20 = min(lows.slice(0, 20));
  const avgVolume20 = avg(volumes.slice(0, 20));

  const momentum5Pct = pctChange(price, close5);
  const momentum10Pct = pctChange(price, close10);
  const momentum20Pct = pctChange(price, close20);

  const shortTrendSlopePct = pctChange(sma5, sma20);
  const resistanceOverheadPct =
    recentHigh20 != null ? ((recentHigh20 - price) / price) * 100 : null;

  const breakoutAbove20High =
    recentHigh20 != null ? price >= recentHigh20 * 1.0025 : false;

  const nearResistance =
    resistanceOverheadPct != null &&
    resistanceOverheadPct > 0 &&
    resistanceOverheadPct <= 3;

  const closeLocation20 =
    recentHigh20 != null && recentLow20 != null && recentHigh20 > recentLow20
      ? ((price - recentLow20) / (recentHigh20 - recentLow20)) * 100
      : null;

  const volumeRatio20 =
    avgVolume20 != null && avgVolume20 > 0 && quote.volume != null
      ? quote.volume / avgVolume20
      : null;

  let confirmation = 50;

  if (sma5 != null) confirmation += price > sma5 ? 10 : -10;
  if (sma10 != null) confirmation += price > sma10 ? 10 : -10;
  if (sma20 != null) confirmation += price > sma20 ? 12 : -12;

  if (shortTrendSlopePct != null) {
    if (shortTrendSlopePct > 1.5) confirmation += 12;
    else if (shortTrendSlopePct > 0) confirmation += 6;
    else if (shortTrendSlopePct < -1.5) confirmation -= 14;
    else if (shortTrendSlopePct < 0) confirmation -= 7;
  }

  if (momentum5Pct != null) {
    if (momentum5Pct > 2) confirmation += 10;
    else if (momentum5Pct > 0) confirmation += 5;
    else if (momentum5Pct < -2) confirmation -= 12;
    else if (momentum5Pct < 0) confirmation -= 6;
  }

  if (momentum10Pct != null) {
    if (momentum10Pct > 4) confirmation += 10;
    else if (momentum10Pct > 0) confirmation += 5;
    else if (momentum10Pct < -4) confirmation -= 12;
    else if (momentum10Pct < 0) confirmation -= 6;
  }

  if (breakoutAbove20High) confirmation += 18;
  else if (nearResistance) confirmation += 5;
  else if (resistanceOverheadPct != null && resistanceOverheadPct > 6) {
    confirmation -= 18;
  } else if (resistanceOverheadPct != null && resistanceOverheadPct > 3) {
    confirmation -= 9;
  }

  if (closeLocation20 != null) {
    if (closeLocation20 >= 75) confirmation += 8;
    else if (closeLocation20 <= 35) confirmation -= 8;
  }

  if (volumeRatio20 != null) {
    if (volumeRatio20 >= 1.2 && volumeRatio20 <= 3.5) confirmation += 8;
    else if (volumeRatio20 < 0.7) confirmation -= 5;
  }

  const historicalConfirmationScore = Math.round(
    Math.max(0, Math.min(100, confirmation))
  );

  return {
    historicalDataAvailable: true,
    historicalConfirmationScore,

    recentHigh10,
    recentHigh20,
    recentHigh50,
    recentLow20,

    sma5,
    sma10,
    sma20,

    momentum5Pct,
    momentum10Pct,
    momentum20Pct,
    shortTrendSlopePct,

    resistanceOverheadPct,
    breakoutAbove20High,
    closeLocation20,
    volumeRatio20,
    avgVolume20,

    historicalNotes: {
      recentHigh20,
      resistanceOverheadPct,
      breakoutAbove20High,
      shortTrendSlopePct,
      momentum5Pct,
      momentum10Pct,
      volumeRatio20,
    },
  };
}

function confidenceRank(confidence) {
  const clean = String(confidence || "").toUpperCase();

  if (clean === "HIGH") return 3;
  if (clean === "MEDIUM") return 2;
  if (clean === "LOW") return 1;

  return 0;
}

function riskRank(risk) {
  const clean = String(risk || "").toUpperCase();

  if (clean === "LOW") return 3;
  if (clean === "MEDIUM") return 2;
  if (clean === "HIGH") return 1;

  return 0;
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

  const score = Number(rec.score || stock.score || 0);
  const institutionalScore = Number(rec.institutionalScore || score || 0);
  const actionabilityScore = Number(rec.actionabilityScore || 0);
  const trigger = Number(rec.triggerScore || stock.triggerScore || 0);
  const momentum = Number(rec.momentumScore || stock.momentumScore || 0);
  const relative = Number(rec.relativeStrengthScore || 0);
  const freshBreakout = Number(rec.freshBreakoutScore || 0);
  const historicalScore = Number(rec.historicalConfirmationScore || 50);

  const expectationRisk = Number(rec.expectationRisk || 0);
  const extensionRisk = Number(rec.extensionRisk || 0);
  const riskPenalty = Number(rec.riskPenalty || 0);

  const actionPoints = actionRank(rec.label) * 1000;
  const readinessPoints = readinessRank(tradeReadiness.label) * 450;

  const confRank = confidenceRank(rec.confidence);
  const rRank = riskRank(rec.risk);

  const confidenceBoost =
    confRank === 3 ? 360 : confRank === 2 ? 170 : -420;

  const riskBoost = rRank === 3 ? 120 : rRank === 2 ? 20 : -240;

  const buyMiddleTierBoost =
    String(rec.label || "").toUpperCase() === "BUY" ? 240 : 0;

  const lowConfidenceDrag =
    confRank === 1
      ? Math.max(
          0,
          650 -
            institutionalScore * 2.2 -
            trigger * 1.9 -
            momentum * 1.5 -
            freshBreakout * 1.2 -
            historicalScore * 1.4
        )
      : 0;

  const lowConfidenceWatchDrag =
    confRank === 1 && String(rec.label || "").toUpperCase() === "WATCH FOR ENTRY"
      ? 280
      : 0;

  const weakActionabilityDrag =
    actionabilityScore < 50 ? (50 - actionabilityScore) * 12 : 0;

  const setupStrength =
    institutionalScore * 2.6 +
    actionabilityScore * 2.4 +
    score * 1.9 +
    trigger * 3.2 +
    momentum * 2.2 +
    relative * 1.2 +
    freshBreakout * 1.3 +
    historicalScore * 2.2;

  const riskDrag =
    expectationRisk * 1.15 +
    extensionRisk * 1.25 +
    riskPenalty * 0.85;

  return (
    actionPoints +
    readinessPoints +
    buyMiddleTierBoost +
    confidenceBoost +
    riskBoost +
    setupStrength -
    riskDrag -
    lowConfidenceDrag -
    lowConfidenceWatchDrag -
    weakActionabilityDrag
  );
}

function enrichQuote(row = {}, historyRows = []) {
  const normalized = normalizeQuote(row);

  if (!normalized.symbol || normalized.price == null) {
    return null;
  }

  const historicalSignals = buildHistoricalSignals(historyRows, normalized);

  const base = {
    ...normalized,
    ...historicalSignals,
  };

  const recommendation = getRecommendation(base);
  const tradeReadiness = getTradeReadiness(base);
  const technicalSnapshot = buildTechnicalSnapshot(base);
  const fundamentalSnapshot = buildFundamentalSnapshot(base);
  const score = compositeScore(base);

  const stock = {
    ...base,

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
  const actionA = actionRank(a.recommendation?.label);
  const actionB = actionRank(b.recommendation?.label);

  if (actionB !== actionA) return actionB - actionA;

  const rankA = Number(a.institutionalRank || 0);
  const rankB = Number(b.institutionalRank || 0);

  if (rankB !== rankA) return rankB - rankA;

  const confidenceA = confidenceRank(a.recommendation?.confidence);
  const confidenceB = confidenceRank(b.recommendation?.confidence);

  if (confidenceB !== confidenceA) return confidenceB - confidenceA;

  const riskA = riskRank(a.recommendation?.risk);
  const riskB = riskRank(b.recommendation?.risk);

  if (riskB !== riskA) return riskB - riskA;

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
      return res.status(200).json({
        selectedTheme,
        count: 0,
        stocks: [],
      });
    }

    const quotes = await fetchFmpQuotes(symbols);

    if (!Array.isArray(quotes) || quotes.length === 0) {
      return res.status(500).json({
        error: "No quotes returned from FMP.",
        detail:
          "The screener could not retrieve quote data. Check FMP_API_KEY, FMP plan access, or FMP quote endpoint availability.",
      });
    }

    const preliminary = quotes
      .map((quote) => enrichQuote(quote, []))
      .filter(Boolean)
      .filter((stock) => Number.isFinite(Number(stock.price)))
      .sort(sortTopIdeas)
      .slice(0, 35);

    const historicalMap = await fetchHistoricalForSymbols(
      preliminary.map((stock) => stock.symbol)
    ).catch(() => ({}));

    const enriched = preliminary
      .map((stock) => {
        const rawQuote = quotes.find(
          (quote) => normalizeSymbol(quote.symbol) === stock.symbol
        );

        return enrichQuote(rawQuote || stock, historicalMap[stock.symbol] || []);
      })
      .filter(Boolean)
      .filter((stock) => Number.isFinite(Number(stock.price)));

    if (!enriched.length) {
      return res.status(500).json({
        error: "Quotes returned but could not be scored.",
        detail:
          "FMP returned data, but the quote rows did not include usable price fields.",
      });
    }

    const sorted = enriched.sort(sortTopIdeas).slice(0, 10);

    return res.status(200).json({
      selectedTheme,
      count: sorted.length,
      stocks: sorted,
      meta: {
        historicalConfirmation: true,
        historicalCandidatesChecked: preliminary.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top ideas.",
      detail: error?.message || String(error),
    });
  }
}
