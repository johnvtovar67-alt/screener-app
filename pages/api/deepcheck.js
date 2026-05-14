// pages/api/deepcheck.js

import {
  passesInstitutionalFilter,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  compositeScore,
  getRecommendation,
  getStage,
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

function normalizeQuote(quote = {}) {
  const price = toPositiveNumber(quote.price);
  const previousClose = toPositiveNumber(quote.previousClose);
  const change = toNumber(quote.change);

  let dayChangePct = toNumber(quote.changesPercentage);

  if (dayChangePct == null) dayChangePct = toNumber(quote.changePercentage);
  if (dayChangePct == null) dayChangePct = toNumber(quote.changePercent);

  if (dayChangePct == null && price != null && previousClose) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct == null && change != null && previousClose) {
    dayChangePct = (change / previousClose) * 100;
  }

  return {
    symbol: normalizeSymbol(quote.symbol),
    name: quote.name || quote.companyName || quote.symbol,

    price,
    previousClose,
    dayChangePct,
    changesPercentage: dayChangePct,
    change,

    volume: toPositiveNumber(quote.volume),
    avgVolume: toPositiveNumber(quote.avgVolume),

    marketCap: toPositiveNumber(quote.marketCap),

    priceAvg50: toPositiveNumber(quote.priceAvg50 ?? quote.priceAvg50d),
    priceAvg200: toPositiveNumber(quote.priceAvg200 ?? quote.priceAvg200d),

    yearHigh: toPositiveNumber(quote.yearHigh ?? quote.yearHighPrice),
    yearLow: toPositiveNumber(quote.yearLow ?? quote.yearLowPrice),

    eps: toNumber(quote.eps),
    pe: toNumber(quote.pe ?? quote.peRatio),

    exchange: quote.exchange || "",
    timestamp: quote.timestamp || null,
  };
}

async function fetchQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const clean = toFmpSymbol(symbol);

  const urls = [
    `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
      clean
    )}&apikey=${apiKey}`,
    `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(
      clean
    )}?apikey=${apiKey}`,
  ];

  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const quote = Array.isArray(data) ? data[0] : data;

      if (quote?.symbol) return normalizeQuote(quote);
    } catch {
      // Try next endpoint.
    }
  }

  throw new Error("No quote data returned.");
}

async function fetchHistorical(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const clean = toFmpSymbol(symbol);

  const urls = [
    `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
      clean
    )}&apikey=${apiKey}`,
    `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
      clean
    )}?apikey=${apiKey}`,
  ];

  for (const url of urls) {
    try {
      const data = await fetchJson(url);

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.historical)
          ? data.historical
          : Array.isArray(data?.data)
            ? data.data
            : [];

      if (rows.length) return sortHistoricalRows(rows).slice(0, 90);
    } catch {
      // Try next endpoint.
    }
  }

  return [];
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
  };
}

function attachMarketRelativeData(row, spyQuote, qqqQuote) {
  return {
    ...row,
    spyDayChangePct: spyQuote?.dayChangePct ?? null,
    qqqDayChangePct: qqqQuote?.dayChangePct ?? null,
  };
}

function buildScoredResult(base) {
  const institutionalPass = passesInstitutionalFilter(base);

  const fundamentalScore = calcFundamentalScore(base);
  const technicalScore = calcTechnicalScore(base);
  const momentumScore = calcMomentumScore(base);
  const relativeStrengthScore = calcRelativeStrengthScore(base);
  const asymmetryScore = calcAsymmetryScore(base);
  const triggerScore = calcTriggerScore(base);
  const score = compositeScore(base);
  const recommendation = getRecommendation(base);

  return {
    ...base,

    institutionalPass,
    score,

    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,

    recommendation,
    stage: getStage(base),

    technicalSnapshot: buildTechnicalSnapshot(base),
    fundamentalSnapshot: buildFundamentalSnapshot(base),
  };
}

export default async function handler(req, res) {
  try {
    const symbol = String(req.query.symbol || "")
      .trim()
      .toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        error: "Missing symbol.",
      });
    }

    const [quote, spyQuote, qqqQuote, history] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY").catch(() => null),
      fetchQuote("QQQ").catch(() => null),
      fetchHistorical(symbol).catch(() => []),
    ]);

    const historicalSignals = buildHistoricalSignals(history, quote);

    const base = attachMarketRelativeData(
      {
        ...quote,
        ...historicalSignals,
      },
      spyQuote,
      qqqQuote
    );

    const result = buildScoredResult(base);

    return res.status(200).json({
      stock: result,
      meta: {
        mode: "deep_check",
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
        historicalRows: Array.isArray(history) ? history.length : 0,
        historicalDataAvailable: historicalSignals.historicalDataAvailable,
      },
    });
  } catch (err) {
    console.error("api/deepcheck error:", err);

    return res.status(500).json({
      error: "Failed to run deep check.",
      detail: err.message || "Unknown error.",
    });
  }
}
