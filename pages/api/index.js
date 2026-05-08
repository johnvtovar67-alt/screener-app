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
    .toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "")
    .replace(".", "-")
    .toUpperCase();
}

async function fetchQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const clean = toFmpSymbol(symbol);
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${clean}&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch quote from FMP.");
  }

  const data = await response.json();
  const quote = Array.isArray(data) ? data[0] : data;

  if (!quote?.symbol) {
    throw new Error("No quote data returned.");
  }

  return {
    symbol: normalizeSymbol(quote.symbol),
    name: quote.name || quote.symbol,

    price: quote.price ?? null,

    dayChangePct:
      quote.changesPercentage ??
      quote.changePercentage ??
      quote.changePercent ??
      null,

    change: quote.change ?? null,

    volume: quote.volume ?? null,
    avgVolume: quote.avgVolume ?? quote.volume ?? null,

    marketCap: quote.marketCap ?? null,

    priceAvg50:
      quote.priceAvg50 ??
      quote.priceAvg50d ??
      null,

    priceAvg200:
      quote.priceAvg200 ??
      quote.priceAvg200d ??
      null,

    yearHigh:
      quote.yearHigh ??
      quote.yearHighPrice ??
      null,

    yearLow:
      quote.yearLow ??
      quote.yearLowPrice ??
      null,

    eps: quote.eps ?? null,
    pe: quote.pe ?? quote.peRatio ?? null,
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

    const [quote, spyQuote, qqqQuote] = await Promise.all([
      fetchQuote(symbol),
      fetchQuote("SPY"),
      fetchQuote("QQQ"),
    ]);

    const base = attachMarketRelativeData(quote, spyQuote, qqqQuote);

    const result = buildScoredResult(base);

    return res.status(200).json({
      stock: result,
      meta: {
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
