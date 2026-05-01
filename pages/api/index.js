import {
  buildRecommendation,
  buildTechnicalSnapshot,
} from "../../lib/scoring";

const FMP_API_KEY = process.env.FMP_API_KEY;

function cleanSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
      };
    }

    const data = await res.json();

    return {
      ok: true,
      status: res.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error.message,
    };
  }
}

async function getQuote(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`;
  const result = await fetchJsonSafe(url);

  if (!result.ok) return null;

  return Array.isArray(result.data) ? result.data[0] : null;
}

async function getProfile(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`;
  const result = await fetchJsonSafe(url);

  if (!result.ok) return null;

  return Array.isArray(result.data) ? result.data[0] : null;
}

async function getHistoricalPrices(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=90&apikey=${FMP_API_KEY}`;
  const result = await fetchJsonSafe(url);

  if (!result.ok) return [];

  return Array.isArray(result.data?.historical) ? result.data.historical : [];
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

function buildBasicFundamentals({ quote, profile }) {
  return {
    marketCap: safeNumber(profile?.mktCap ?? quote?.marketCap),
    sector: profile?.sector || null,
    industry: profile?.industry || null,
    peRatio: safeNumber(quote?.pe),
    priceToBook: null,
    priceToSales: null,
    revenueGrowth: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    returnOnEquity: null,
    returnOnAssets: null,
    debtToEquity: null,
    currentRatio: null,
  };
}

function fallbackTechnicalSnapshot({ quote, historical }) {
  const prices = normalizeHistoricalPrices(historical);
  const price = safeNumber(quote?.price);
  const changePercent = safeNumber(quote?.changesPercentage);

  const latest = prices[prices.length - 1];
  const closeNow = price ?? latest?.close ?? null;

  const close20 =
    prices.length > 20 ? prices[prices.length - 21]?.close : null;

  const close50 =
    prices.length > 50 ? prices[prices.length - 51]?.close : null;

  const momentum20 =
    closeNow && close20 ? ((closeNow - close20) / close20) * 100 : null;

  const momentum50 =
    closeNow && close50 ? ((closeNow - close50) / close50) * 100 : null;

  let heatScore = 50;

  if (changePercent !== null) {
    heatScore += Math.max(-15, Math.min(15, changePercent * 2));
  }

  if (momentum20 !== null) {
    heatScore += Math.max(-20, Math.min(20, momentum20));
  }

  if (momentum50 !== null) {
    heatScore += Math.max(-15, Math.min(15, momentum50 / 2));
  }

  heatScore = Math.round(Math.max(0, Math.min(100, heatScore)));

  let tradeReadiness = "Setup Only";

  if (heatScore >= 70) {
    tradeReadiness = "Trade Ready";
  } else if (heatScore >= 55) {
    tradeReadiness = "Watch Closely";
  }

  return {
    price: closeNow,
    changePercent,
    momentum20,
    momentum50,
    heatScore,
    tradeReadiness,
  };
}

function fallbackRecommendation({ fundamentals, technicalSnapshot }) {
  let score = 50;

  const heat = safeNumber(technicalSnapshot?.heatScore, 50);

  score += (heat - 50) * 0.55;

  const marketCap = safeNumber(fundamentals?.marketCap);

  if (marketCap !== null && marketCap > 300000000) score += 4;
  if (marketCap !== null && marketCap > 1000000000) score += 4;

  const pe = safeNumber(fundamentals?.peRatio);

  if (pe !== null && pe > 0 && pe < 35) score += 4;
  if (pe !== null && pe > 80) score -= 5;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let tradeReadiness = "Setup Only";

  if (score >= 70 && heat >= 65) {
    tradeReadiness = "Trade Ready";
  } else if (score >= 58 || heat >= 55) {
    tradeReadiness = "Watch Closely";
  }

  let rating = "Watch";

  if (score >= 75) {
    rating = "Strong Buy";
  } else if (score >= 65) {
    rating = "Buy";
  } else if (score < 45) {
    rating = "Avoid";
  }

  return {
    score,
    rating,
    tradeReadiness,
    heatScore: heat,
    reason:
      tradeReadiness === "Trade Ready"
        ? "Momentum and setup quality are strong enough for active consideration."
        : tradeReadiness === "Watch Closely"
        ? "Good setup, but it needs stronger confirmation."
        : "Setup is not strong enough yet.",
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
        error: "Missing symbol. Example: /api?symbol=MARA",
      });
    }

    const [quote, profile, historical] = await Promise.all([
      getQuote(symbol),
      getProfile(symbol),
      getHistoricalPrices(symbol),
    ]);

    if (!quote && !profile) {
      return res.status(404).json({
        error: `No quote data found for ${symbol}.`,
      });
    }

    const fundamentals = buildBasicFundamentals({
      quote,
      profile,
    });

    let technicalSnapshot;

    try {
      technicalSnapshot = buildTechnicalSnapshot({
        symbol,
        quote,
        profile,
        fundamentals,
        historical,
      });
    } catch {
      technicalSnapshot = fallbackTechnicalSnapshot({
        quote,
        historical,
      });
    }

    let recommendation;

    try {
      recommendation = buildRecommendation({
        symbol,
        quote,
        profile,
        fundamentals,
        technicalSnapshot,
        historical,
      });
    } catch {
      recommendation = fallbackRecommendation({
        fundamentals,
        technicalSnapshot,
      });
    }

    const heatScore =
      safeNumber(technicalSnapshot?.heatScore) ??
      safeNumber(recommendation?.heatScore) ??
      0;

    const compositeScore =
      safeNumber(recommendation?.score) ??
      safeNumber(recommendation?.compositeScore) ??
      0;

    const tradeReadiness =
      recommendation?.tradeReadiness?.label ||
      recommendation?.tradeReadiness ||
      technicalSnapshot?.tradeReadiness?.label ||
      technicalSnapshot?.tradeReadiness ||
      "Setup Only";

    return res.status(200).json({
      symbol,
      name: profile?.companyName || quote?.name || symbol,
      price: safeNumber(quote?.price ?? profile?.price),
      changePercent: safeNumber(quote?.changesPercentage),
      marketCap: safeNumber(profile?.mktCap ?? quote?.marketCap),
      volume: safeNumber(quote?.volume),
      avgVolume: safeNumber(quote?.avgVolume),

      quote,
      profile,
      fundamentals,
      technicalSnapshot,
      recommendation,

      compositeScore,
      heatScore,
      tradeReadiness,
    });
  } catch (error) {
    console.error("API index error:", error);

    return res.status(500).json({
      error: "Failed to analyze symbol.",
      detail: error.message,
    });
  }
}
