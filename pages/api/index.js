import {
  buildRecommendation,
  buildTechnicalSnapshot,
} from "../../lib/scoring";

const FMP_API_KEY = process.env.FMP_API_KEY;

function cleanSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

async function fetchJson(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`FMP request failed: ${res.status}`);
  }

  return res.json();
}

async function getQuote(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data[0] : null;
}

async function getProfile(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data[0] : null;
}

async function getRatios(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data[0] : null;
}

async function getKeyMetrics(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data[0] : null;
}

async function getIncomeStatement(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=4&apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

async function getHistoricalPrices(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=120&apikey=${FMP_API_KEY}`;
  const data = await fetchJson(url);
  return Array.isArray(data?.historical) ? data.historical : [];
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildFundamentals({ quote, profile, ratios, keyMetrics, income }) {
  const latestIncome = income?.[0] || {};
  const priorIncome = income?.[1] || {};

  const revenueNow = safeNumber(latestIncome.revenue);
  const revenuePrior = safeNumber(priorIncome.revenue);

  const revenueGrowth =
    revenueNow && revenuePrior && revenuePrior !== 0
      ? ((revenueNow - revenuePrior) / Math.abs(revenuePrior)) * 100
      : null;

  return {
    marketCap: safeNumber(profile?.mktCap ?? quote?.marketCap),
    sector: profile?.sector || null,
    industry: profile?.industry || null,

    peRatio: safeNumber(ratios?.peRatioTTM),
    priceToBook: safeNumber(keyMetrics?.pbRatioTTM),
    priceToSales: safeNumber(keyMetrics?.priceToSalesRatioTTM),

    revenueGrowth,
    grossMargin: safeNumber(ratios?.grossProfitMarginTTM),
    operatingMargin: safeNumber(ratios?.operatingProfitMarginTTM),
    netMargin: safeNumber(ratios?.netProfitMarginTTM),

    returnOnEquity: safeNumber(ratios?.returnOnEquityTTM),
    returnOnAssets: safeNumber(ratios?.returnOnAssetsTTM),

    debtToEquity: safeNumber(keyMetrics?.debtToEquityTTM),
    currentRatio: safeNumber(ratios?.currentRatioTTM),
  };
}

function normalizeHistoricalPrices(historical) {
  return historical
    .map((row) => ({
      date: row.date,
      close: safeNumber(row.close),
      volume: safeNumber(row.volume),
    }))
    .filter((row) => row.close !== null)
    .reverse();
}

function fallbackTechnicalSnapshot({ quote, historical }) {
  const prices = normalizeHistoricalPrices(historical);
  const last = prices[prices.length - 1];

  const price = safeNumber(quote?.price ?? last?.close);
  const changePercent = safeNumber(quote?.changesPercentage);

  const close20 = prices.length > 20 ? prices[prices.length - 21]?.close : null;
  const close50 = prices.length > 50 ? prices[prices.length - 51]?.close : null;

  const momentum20 =
    price && close20 ? ((price - close20) / close20) * 100 : null;

  const momentum50 =
    price && close50 ? ((price - close50) / close50) * 100 : null;

  let heatScore = 50;

  if (changePercent !== null) heatScore += Math.max(-15, Math.min(15, changePercent * 2));
  if (momentum20 !== null) heatScore += Math.max(-15, Math.min(15, momentum20));
  if (momentum50 !== null) heatScore += Math.max(-10, Math.min(10, momentum50 / 2));

  heatScore = Math.round(Math.max(0, Math.min(100, heatScore)));

  return {
    price,
    changePercent,
    momentum20,
    momentum50,
    heatScore,
  };
}

function fallbackRecommendation({ fundamentals, technicalSnapshot }) {
  let score = 50;

  if (technicalSnapshot?.heatScore !== null) {
    score += (safeNumber(technicalSnapshot.heatScore, 50) - 50) * 0.45;
  }

  if (fundamentals?.revenueGrowth > 10) score += 8;
  if (fundamentals?.revenueGrowth > 25) score += 6;
  if (fundamentals?.grossMargin > 0.4) score += 5;
  if (fundamentals?.operatingMargin > 0.1) score += 5;
  if (fundamentals?.priceToBook !== null && fundamentals.priceToBook < 3) score += 4;
  if (fundamentals?.debtToEquity !== null && fundamentals.debtToEquity > 3) score -= 8;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let tradeReadiness = "Setup Only";
  if (score >= 70 && technicalSnapshot?.heatScore >= 65) {
    tradeReadiness = "Trade Ready";
  } else if (score >= 58 || technicalSnapshot?.heatScore >= 55) {
    tradeReadiness = "Watch Closely";
  }

  let rating = "Watch";
  if (score >= 75) rating = "Strong Buy";
  else if (score >= 65) rating = "Buy";
  else if (score < 45) rating = "Avoid";

  return {
    score,
    rating,
    tradeReadiness,
    heatScore: technicalSnapshot?.heatScore ?? null,
  };
}

export default async function handler(req, res) {
  try {
    if (!FMP_API_KEY) {
      return res.status(500).json({
        error: "Missing FMP_API_KEY environment variable.",
      });
    }

    const symbol = cleanSymbol(req.query.symbol || req.query.ticker);

    if (!symbol) {
      return res.status(400).json({
        error: "Missing symbol. Example: /api/index?symbol=MARA",
      });
    }

    const [quote, profile, ratios, keyMetrics, income, historical] =
      await Promise.all([
        getQuote(symbol),
        getProfile(symbol),
        getRatios(symbol),
        getKeyMetrics(symbol),
        getIncomeStatement(symbol),
        getHistoricalPrices(symbol),
      ]);

    if (!quote && !profile) {
      return res.status(404).json({
        error: `No data found for ${symbol}.`,
      });
    }

    const fundamentals = buildFundamentals({
      quote,
      profile,
      ratios,
      keyMetrics,
      income,
    });

    let technicalSnapshot;

    try {
      technicalSnapshot = buildTechnicalSnapshot
        ? buildTechnicalSnapshot({
            symbol,
            quote,
            profile,
            fundamentals,
            historical,
          })
        : fallbackTechnicalSnapshot({ quote, historical });
    } catch {
      technicalSnapshot = fallbackTechnicalSnapshot({ quote, historical });
    }

    let recommendation;

    try {
      recommendation = buildRecommendation
        ? buildRecommendation({
            symbol,
            quote,
            profile,
            fundamentals,
            technicalSnapshot,
            historical,
          })
        : fallbackRecommendation({ fundamentals, technicalSnapshot });
    } catch {
      recommendation = fallbackRecommendation({
        fundamentals,
        technicalSnapshot,
      });
    }

    const result = {
      symbol,
      name: profile?.companyName || quote?.name || symbol,
      price: safeNumber(quote?.price),
      changePercent: safeNumber(quote?.changesPercentage),

      quote,
      profile,
      fundamentals,
      technicalSnapshot,
      recommendation,

      compositeScore:
        safeNumber(recommendation?.score) ??
        safeNumber(recommendation?.compositeScore) ??
        0,

      heatScore:
        safeNumber(technicalSnapshot?.heatScore) ??
        safeNumber(recommendation?.heatScore) ??
        0,

      tradeReadiness:
        recommendation?.tradeReadiness ||
        technicalSnapshot?.tradeReadiness ||
        "Setup Only",
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("API index error:", error);

    return res.status(500).json({
      error: "Failed to analyze symbol.",
      detail: error.message,
    });
  }
}
