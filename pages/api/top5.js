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
    description: "Full broad-market discovery list using the institutional scoring model.",
    symbols: [
      "NVDA","AMD","AVGO","ARM","MU","SMCI","PLTR","CRWD","NET","DDOG","SNOW","SHOP","MDB","ZS","PANW","ANET","DELL","HPE","ORCL","MSFT","GOOGL","GOOG","META","AMZN","AAPL","TSLA","UBER","ROKU","SOUN","BBAI","AI","AAOI",
      "SCHW","BGC","JPM","BAC","C","WFC","GS","MS","BX","KKR","APO","SOFI","AFRM","HOOD","COIN","PYPL","SQ","ALLY","RKT","UPST",
      "ETN","PWR","VRT","FIX","EME","GEV","CEG","VST","NRG","TLN","KMI","WMB","TRGP","LNG","ET","EPD","OKE","PAGP","XOM","CVX","COP","SLB","HAL","FCX","CLF","NUE","STLD",
      "CCJ","UEC","UUUU","LEU","BWXT","SMR","OKLO","NNE",
      "MSTR","MARA","RIOT","CLSK","IREN","WULF","HUT","BTDR","CIFR","BITF",
      "HIMS","BCRX","ALMS","VKTX","RXRX","SDGR","DNA","MRNA","NVAX","CRSP","BEAM","IOVA","GERN","ALT",
      "CELH","CROX","DKNG","RCL","CCL","NCLH","ABNB","EXPE","AAL","UAL","DAL","LUV","DIS","NFLX","TGT","WMT","COST",
      "AHR","VICI","O","PLD","DLR","EQIX","AMT","CCI","WELL",
    ],
  },

  btc: {
    name: "BTC / Digital Assets",
    description: "Bitcoin, crypto infrastructure, exchanges, and digital asset proxies.",
    symbols: ["MSTR","MARA","RIOT","CLSK","IREN","WULF","HUT","BTDR","CIFR","BITF","COIN","HOOD","SQ","PYPL"],
  },

  ai_power: {
    name: "AI Power & Energy",
    description: "Power generation, grid, electrification, and energy infrastructure tied to AI load growth.",
    symbols: ["VST","CEG","NRG","TLN","GEV","ETN","PWR","VRT","FIX","EME","KMI","WMB","TRGP","LNG","ET","EPD","OKE","XOM","CVX","COP"],
  },

  cooling_water: {
    name: "Cooling & Water",
    description: "Thermal management, water infrastructure, and cooling beneficiaries.",
    symbols: ["VRT","ETN","PWR","FIX","EME","XYL","WTS","AOS","PNR","ITT","DOV","HUBB","NVT","CARR","TT"],
  },

  nuclear: {
    name: "Nuclear / Baseload",
    description: "Uranium, nuclear services, advanced nuclear, and baseload power.",
    symbols: ["CCJ","UEC","UUUU","LEU","BWXT","SMR","OKLO","NNE","CEG","VST","TLN","GEV","NXE","DNN"],
  },

  quantum: {
    name: "Quantum Computing",
    description: "Quantum computing names and larger companies with quantum exposure.",
    symbols: ["IONQ","RGTI","QBTS","QUBT","ARQQ","IBM","GOOGL","MSFT","NVDA","HON","AMZN"],
  },

  ai_infra: {
    name: "AI Infrastructure",
    description: "Semiconductors, servers, networking, data center infrastructure, and AI platforms.",
    symbols: ["NVDA","AMD","AVGO","ARM","MU","SMCI","DELL","HPE","ANET","VRT","ETN","PWR","FIX","EME","ORCL","MSFT","GOOGL","META","AMZN","PLTR","CRWD","NET","DDOG","SNOW"],
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

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function todayYmd() {
  return ymd(new Date());
}

function daysAgoYmd(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return ymd(date);
}

function cleanTradingLevel(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) return null;

  if (n >= 100) return Math.round(n);

  if (n >= 25) {
    const whole = Math.floor(n);
    const decimal = n - whole;

    if (decimal >= 0.6) return whole + 1;
    if (decimal >= 0.35) return whole + 0.5;
    if (decimal >= 0.1) return whole + 0.25;

    return whole;
  }

  if (n >= 10) return Math.round(n * 4) / 4;
  if (n >= 5) return Math.round(n * 20) / 20;

  return Math.round(n * 100) / 100;
}

function stableTriggerLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return cleanTradingLevel(n * 1.005);
}

function average(values = []) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FMP request failed: ${response.status}${text ? ` - ${text}` : ""}`);
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
      // Skip bad symbols or temporary symbol-level FMP failures.
    }
  }

  return all;
}

async function fetchFmpQuotes(symbols = [], apiKey) {
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

async function fetchHistoricalEod(symbol, apiKey) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    toFmpSymbol(symbol)
  )}&from=${daysAgoYmd(95)}&to=${todayYmd()}&apikey=${apiKey}`;

  const data = await fetchJson(url);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.historical)
      ? data.historical
      : [];

  const today = todayYmd();

  return rows
    .map((row) => ({
      date: String(row.date || row.label || ""),
      open: toNumber(row.open),
      high: toNumber(row.high ?? row.price ?? row.close ?? row.adjClose),
      low: toNumber(row.low ?? row.price ?? row.close ?? row.adjClose),
      close: toNumber(row.close ?? row.price ?? row.adjClose),
      volume: toNumber(row.volume),
    }))
    .filter((row) => row.date && row.date < today)
    .filter((row) => Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function fetchHistoricalMap(symbols = [], apiKey) {
  const cleanSymbols = uniqueSymbols(symbols);
  const map = new Map();

  await Promise.all(
    cleanSymbols.map(async (symbol) => {
      try {
        const rows = await fetchHistoricalEod(symbol, apiKey);
        map.set(symbol, rows);
      } catch {
        map.set(symbol, []);
      }
    })
  );

  return map;
}

function buildHistoricalNotes(symbol, historicalRows = []) {
  const rows = Array.isArray(historicalRows) ? historicalRows : [];
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  const latest = rows[0];

  if (!rows.length || closes.length < 10 || !latest) {
    return {
      historicalDataAvailable: false,
      historicalTriggerPrice: null,
      triggerPrice: null,
      triggerType: "No stable historical trigger",
      triggerSource: "No completed historical candles returned",
      triggerIsStable: false,
    };
  }

  const prior20 = rows.slice(0, 20);
  const prior10 = rows.slice(0, 10);
  const prior5 = rows.slice(0, 5);
  const prior3 = rows.slice(0, 3);

  const recentHigh20 = Math.max(...prior20.map((row) => row.high).filter(Number.isFinite));
  const recentLow20 = Math.min(...prior20.map((row) => row.low).filter(Number.isFinite));
  const recentHigh10 = Math.max(...prior10.map((row) => row.high).filter(Number.isFinite));
  const avgVolume20 = average(prior20.map((row) => row.volume));
  const latestVolume = toNumber(latest.volume);
  const volumeRatio20 = avgVolume20 && latestVolume ? latestVolume / avgVolume20 : null;

  const close = latest.close;
  const close5 = rows[5]?.close;
  const close10 = rows[10]?.close;
  const close20 = rows[20]?.close;

  const momentum5Pct = close5 ? ((close - close5) / close5) * 100 : null;
  const momentum10Pct = close10 ? ((close - close10) / close10) * 100 : null;
  const momentum20Pct = close20 ? ((close - close20) / close20) * 100 : null;

  const shortTrendSlopePct = prior5.length >= 5 && prior5[4]?.close
    ? ((prior5[0].close - prior5[4].close) / prior5[4].close) * 100
    : null;

  const higherLows =
    prior3.length >= 3 &&
    prior3[0].low > prior3[1].low &&
    prior3[1].low > prior3[2].low;

  const breakoutAbove20High =
    Number.isFinite(recentHigh20) && close > recentHigh20;

  const resistanceOverheadPct =
    Number.isFinite(recentHigh20) && close > 0
      ? ((recentHigh20 - close) / close) * 100
      : null;

  let historicalConfirmationScore = 50;

  if (momentum5Pct != null) {
    if (momentum5Pct > 6) historicalConfirmationScore += 14;
    else if (momentum5Pct > 2) historicalConfirmationScore += 9;
    else if (momentum5Pct > 0) historicalConfirmationScore += 4;
    else if (momentum5Pct < -4) historicalConfirmationScore -= 12;
    else if (momentum5Pct < 0) historicalConfirmationScore -= 5;
  }

  if (momentum10Pct != null) {
    if (momentum10Pct > 10) historicalConfirmationScore += 14;
    else if (momentum10Pct > 4) historicalConfirmationScore += 9;
    else if (momentum10Pct > 0) historicalConfirmationScore += 4;
    else if (momentum10Pct < -7) historicalConfirmationScore -= 12;
    else if (momentum10Pct < 0) historicalConfirmationScore -= 5;
  }

  if (shortTrendSlopePct != null) {
    if (shortTrendSlopePct > 3) historicalConfirmationScore += 10;
    else if (shortTrendSlopePct > 0) historicalConfirmationScore += 5;
    else if (shortTrendSlopePct < -3) historicalConfirmationScore -= 10;
  }

  if (higherLows) historicalConfirmationScore += 6;

  if (volumeRatio20 != null) {
    if (volumeRatio20 >= 1.5) historicalConfirmationScore += 9;
    else if (volumeRatio20 >= 1.1) historicalConfirmationScore += 5;
    else if (volumeRatio20 < 0.7) historicalConfirmationScore -= 6;
  }

  if (resistanceOverheadPct != null) {
    if (resistanceOverheadPct <= 0) historicalConfirmationScore += 12;
    else if (resistanceOverheadPct <= 3) historicalConfirmationScore += 6;
    else if (resistanceOverheadPct > 8) historicalConfirmationScore -= 12;
  }

  const stableTrigger = stableTriggerLevel(recentHigh20);

  return {
    historicalDataAvailable: true,
    recentHigh20,
    recentHigh10,
    recentLow20,
    resistancePrice: Number.isFinite(recentHigh20) ? recentHigh20 : null,
    resistanceOverheadPct,
    breakoutAbove20High,
    momentum5Pct,
    momentum10Pct,
    momentum20Pct,
    shortTrendSlopePct,
    volumeRatio20,
    historicalConfirmationScore: Math.round(clamp(historicalConfirmationScore, 0, 100)),
    historicalTriggerPrice: stableTrigger,
    triggerPrice: stableTrigger,
    triggerType: "Prior completed 20-day high",
    triggerSource: "Completed historical daily candles only",
    triggerIsStable: Number.isFinite(stableTrigger),
  };
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

function actionRank(label) {
  const clean = String(label || "").toUpperCase();

  if (clean === "BUY NOW") return 3;
  if (clean === "WATCH") return 2;
  if (clean === "WATCH FOR ENTRY") return 2;
  if (clean === "AVOID") return 1;
  if (clean === "AVOID FOR NOW") return 1;

  return 0;
}

function readinessRank(label) {
  const clean = String(label || "").toUpperCase();

  if (clean === "TRADE READY") return 3;
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
  const historicalScore = Number(rec.historicalConfirmationScore || stock.historicalConfirmationScore || 0);

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
    freshBreakout * 1.3 +
    historicalScore * 1.1;

  const riskDrag =
    expectationRisk * 1.15 +
    extensionRisk * 1.25 +
    lateChaseRisk * 1.5 +
    riskPenalty * 0.85;

  return actionPoints + readinessPoints + setupStrength - riskDrag;
}

function normalizeRecommendationLabel(rec = {}) {
  const label = String(rec.label || rec.displayLabel || "").toUpperCase();

  if (label === "BUY NOW") return "Buy Now";
  if (label === "WATCH" || label === "WATCH FOR ENTRY") return "Watch";

  return "Avoid";
}

function enrichQuote(row = {}, historicalRows = []) {
  const normalized = normalizeQuote(row);

  if (!normalized.symbol || normalized.price == null) {
    return null;
  }

  const historicalNotes = buildHistoricalNotes(normalized.symbol, historicalRows);

  const enrichedInput = {
    ...normalized,
    ...historicalNotes,
  };

  const recommendationRaw = getRecommendation(enrichedInput);
  const forcedLabel = normalizeRecommendationLabel(recommendationRaw);

  const recommendation = {
    ...recommendationRaw,
    label: forcedLabel,
    displayLabel: forcedLabel,
    triggerPrice: historicalNotes.triggerPrice,
    historicalTriggerPrice: historicalNotes.historicalTriggerPrice,
    triggerType: historicalNotes.triggerType,
    triggerSource: historicalNotes.triggerSource,
    triggerIsStable: historicalNotes.triggerIsStable,
    historicalConfirmationScore: historicalNotes.historicalConfirmationScore,
  };

  const tradeReadiness = getTradeReadiness(enrichedInput);
  const technicalSnapshot = buildTechnicalSnapshot(enrichedInput);
  const fundamentalSnapshot = buildFundamentalSnapshot(enrichedInput);
  const score = compositeScore(enrichedInput);

  return {
    ...enrichedInput,
    score,
    compositeScore: score,
    recommendation,
    tradeReadiness,
    technicalSnapshot: {
      ...technicalSnapshot,
      ...historicalNotes,
    },
    fundamentalSnapshot,
    historicalNotes,
    triggerPrice: historicalNotes.triggerPrice,
    historicalTriggerPrice: historicalNotes.historicalTriggerPrice,
    triggerType: historicalNotes.triggerType,
    triggerSource: historicalNotes.triggerSource,
    triggerIsStable: historicalNotes.triggerIsStable,
  };
}

export default async function handler(req, res) {
  try {
    const apiKey = process.env.FMP_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing FMP_API_KEY in environment variables.",
      });
    }

    const selectedTheme = getThemeConfig(req.query.theme);
    const symbols = uniqueSymbols(selectedTheme.symbols);

    const quotes = await fetchFmpQuotes(symbols, apiKey);

    if (!quotes.length) {
      return res.status(502).json({
        error: "No quotes returned from FMP.",
      });
    }

    const normalizedQuotes = quotes.map(normalizeQuote).filter(Boolean);
    const quoteSymbols = normalizedQuotes.map((quote) => quote.symbol);
    const historicalMap = await fetchHistoricalMap(quoteSymbols, apiKey);

    const enriched = normalizedQuotes
      .map((quote) => enrichQuote(quote, historicalMap.get(quote.symbol) || []))
      .filter(Boolean)
      .sort((a, b) => institutionalRank(b) - institutionalRank(a));

    return res.status(200).json({
      selectedTheme: {
        key: req.query.theme || "broad",
        name: selectedTheme.name,
        description: selectedTheme.description,
        symbolCount: symbols.length,
      },
      stocks: enriched.slice(0, 10),
      allCount: enriched.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "The screener could not retrieve quote data.",
      detail: error.message,
    });
  }
}
