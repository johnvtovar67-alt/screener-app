import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

async function getQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in Vercel environment variables.");
  }

  const fmpSymbol = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("FMP quote lookup failed.");
  }

  const data = await response.json();
  const q = Array.isArray(data) ? data[0] : data;

  if (!q || !q.symbol) {
    throw new Error("Ticker not found.");
  }

  return {
    symbol: normalizeSymbol(q.symbol),
    name: q.name || q.symbol,
    price: q.price ?? null,
    dayChangePct: q.changesPercentage ?? q.changePercentage ?? null,
    marketCap: q.marketCap ?? null,
    avgVolume: q.avgVolume ?? q.volume ?? null,
    volume: q.volume ?? null,
    priceAvg50: q.priceAvg50 ?? q.priceAvg50d ?? null,
    priceAvg200: q.priceAvg200 ?? q.priceAvg200d ?? null,
    yearHigh: q.yearHigh ?? q.yearHighPrice ?? null,
    yearLow: q.yearLow ?? q.yearLowPrice ?? null,
    eps: q.eps ?? null,
    pe: q.pe ?? q.peRatio ?? null,
  };
}

function buildEntryNote(row) {
  return (
    row.recommendation?.entryNote ||
    "Wait for stronger price and volume confirmation."
  );
}

export default async function handler(req, res) {
  try {
    const symbol = String(req.query.symbol || "").trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol." });
    }

    const base = await getQuote(symbol);

    const qualityScore = calcQualityScore(base);
    const asymmetryScore = calcAsymmetryScore(base);
    const triggerScore = calcTriggerScore(base);

    const scoredRow = {
      ...base,
      qualityScore,
      asymmetryScore,
      triggerScore,
    };

    const stage = getStage(scoredRow);
    const recommendation = getRecommendation(scoredRow);
    const technicalSnapshot = buildTechnicalSnapshot(scoredRow);
    const fundamentalSnapshot = buildFundamentalSnapshot(scoredRow);

    res.status(200).json({
      ...scoredRow,
      stage,
      recommendation,
      entryNote: buildEntryNote({ ...scoredRow, recommendation }),
      technicalSnapshot,
      fundamentalSnapshot,
    });
  } catch (err) {
    console.error("lookup error:", err);
    res.status(500).json({
      error: err.message || "Lookup failed.",
    });
  }
}
