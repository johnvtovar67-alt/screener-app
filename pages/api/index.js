// pages/api/index.js

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
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

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

  if (n === null) return fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return fallback;

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

function normalizeQuote(rawQuote = {}, requestedSymbol = "") {
  const symbol = normalizeSymbol(rawQuote.symbol || requestedSymbol);

  const price = toPositiveNumber(rawQuote.price);
  const previousClose = toPositiveNumber(rawQuote.previousClose);
  const change = toNumber(rawQuote.change);

  let dayChangePct = toNumber(rawQuote.changesPercentage);

  if (dayChangePct === null) {
    dayChangePct = toNumber(rawQuote.changePercentage);
  }

  if (dayChangePct === null) {
    dayChangePct = toNumber(rawQuote.changePercent);
  }

  if (dayChangePct === null && price !== null && previousClose !== null) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  if (dayChangePct === null && change !== null && previousClose !== null) {
    dayChangePct = (change / previousClose) * 100;
  }

  return {
    symbol,
    name: rawQuote.name || rawQuote.companyName || symbol,

    price,
    previousClose,
    change,
    dayChangePct,
    changesPercentage: dayChangePct,

    volume: toPositiveNumber(rawQuote.volume),
    avgVolume: toPositiveNumber(rawQuote.avgVolume ?? rawQuote.volume),

    marketCap: toPositiveNumber(rawQuote.marketCap),

    priceAvg50: toPositiveNumber(
      rawQuote.priceAvg50 ?? rawQuote.priceAvg50d
    ),

    priceAvg200: toPositiveNumber(
      rawQuote.priceAvg200 ?? rawQuote.priceAvg200d
    ),

    yearHigh: toPositiveNumber(rawQuote.yearHigh ?? rawQuote.yearHighPrice),
    yearLow: toPositiveNumber(rawQuote.yearLow ?? rawQuote.yearLowPrice),

    eps: toNumber(rawQuote.eps),
    pe: toNumber(rawQuote.pe ?? rawQuote.peRatio),

    exchange: rawQuote.exchange || "",
    timestamp: rawQuote.timestamp || null,
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

  let lastError = null;

  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const quote = Array.isArray(data) ? data[0] : data;

      if (quote && (quote.symbol || quote.price)) {
        const normalized = normalizeQuote(quote, symbol);

        if (normalized.symbol && normalized.price !== null) {
          return normalized;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    lastError?.message || `No quote data returned for ${symbol}.`
  );
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

    const [quote, spyQuote, qqqQuote] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY").catch(() => null),
      fetchQuote("QQQ").catch(() => null),
    ]);

    const base = attachMarketRelativeData(quote, spyQuote, qqqQuote);
    const result = buildScoredResult(base);

    return res.status(200).json({
      stock: result,
      meta: {
        mode: "single_symbol_quote_screen",
        spyChange: spyQuote?.dayChangePct ?? null,
        qqqChange: qqqQuote?.dayChangePct ?? null,
      },
    });
  } catch (err) {
    console.error("api/index error:", err);

    return res.status(500).json({
      error: "Failed to analyze symbol.",
      detail: err.message || "Unknown error.",
    });
  }
}
