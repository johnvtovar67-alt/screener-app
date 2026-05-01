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
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

async function getQuote(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`;
  const data = await fetchJsonSafe(url);
  return Array.isArray(data) ? data[0] : null;
}

function buildScore(quote) {
  const price = safeNumber(quote?.price, 0);
  const changePercent = safeNumber(quote?.changesPercentage, 0);
  const volume = safeNumber(quote?.volume, 0);
  const avgVolume = safeNumber(quote?.avgVolume, 0);
  const marketCap = safeNumber(quote?.marketCap, 0);
  const pe = safeNumber(quote?.pe, null);
  const yearHigh = safeNumber(quote?.yearHigh, null);
  const yearLow = safeNumber(quote?.yearLow, null);

  let heatScore = 50;

  if (changePercent > 1) heatScore += 8;
  if (changePercent > 3) heatScore += 8;
  if (changePercent < -1) heatScore -= 8;
  if (changePercent < -3) heatScore -= 8;

  if (volume && avgVolume && volume > avgVolume * 1.2) heatScore += 10;
  if (volume && avgVolume && volume > avgVolume * 2) heatScore += 10;

  if (yearHigh && price && price > yearHigh * 0.85) heatScore += 8;
  if (yearLow && price && price < yearLow * 1.2) heatScore -= 8;

  heatScore = Math.round(Math.max(0, Math.min(100, heatScore)));

  let compositeScore = 50;

  compositeScore += (heatScore - 50) * 0.55;

  if (marketCap > 300000000) compositeScore += 5;
  if (marketCap > 1000000000) compositeScore += 5;

  if (pe !== null && pe > 0 && pe < 40) compositeScore += 5;
  if (pe !== null && pe > 80) compositeScore -= 5;

  compositeScore = Math.round(Math.max(0, Math.min(100, compositeScore)));

  let tradeReadiness = "Setup Only";

  if (compositeScore >= 70 && heatScore >= 65) {
    tradeReadiness = "Trade Ready";
  } else if (compositeScore >= 58 || heatScore >= 55) {
    tradeReadiness = "Watch Closely";
  }

  let rating = "Watch";

  if (compositeScore >= 75) rating = "Strong Buy";
  else if (compositeScore >= 65) rating = "Buy";
  else if (compositeScore < 45) rating = "Avoid";

  return {
    price,
    changePercent,
    volume,
    avgVolume,
    marketCap,
    pe,
    heatScore,
    compositeScore,
    tradeReadiness,
    recommendation: {
      label: rating,
      rating,
      score: compositeScore,
      heatScore,
      tradeReadiness,
      reason:
        tradeReadiness === "Trade Ready"
          ? "Momentum and setup quality are strong enough for active consideration."
          : tradeReadiness === "Watch Closely"
          ? "Good setup, but it needs stronger confirmation."
          : "Setup is not strong enough yet.",
    },
    technicalSnapshot: {
      price,
      changePercent,
      volume,
      avgVolume,
      relativeVolume:
        volume && avgVolume ? Number((volume / avgVolume).toFixed(2)) : null,
      heatScore,
      tradeReadiness,
    },
  };
}

export default async function handler(req, res) {
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

  const quote = await getQuote(symbol);

  if (!quote) {
    return res.status(404).json({
      error: `No quote data found for ${symbol}.`,
    });
  }

  const score = buildScore(quote);

  return res.status(200).json({
    symbol,
    name: quote.name || symbol,
    price: score.price,
    changePercent: score.changePercent,
    marketCap: score.marketCap,
    volume: score.volume,
    avgVolume: score.avgVolume,
    pe: score.pe,

    quote,
    technicalSnapshot: score.technicalSnapshot,
    recommendation: score.recommendation,

    compositeScore: score.compositeScore,
    heatScore: score.heatScore,
    tradeReadiness: score.tradeReadiness,
  });
}
