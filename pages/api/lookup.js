import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
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
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(
    fmpSymbol
  )}?apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("FMP quote lookup failed.");
  }

  const data = await response.json();
  const q = Array.isArray(data) ? data[0] : null;

  if (!q) {
    throw new Error("Ticker not found.");
  }

  return {
    symbol: normalizeSymbol(q.symbol),
    name: q.name || q.symbol,
    price: q.price ?? null,
    dayChangePct: q.changesPercentage ?? null,
    marketCap: q.marketCap ?? null,
    avgVolume: q.avgVolume ?? q.volume ?? null,
    volume: q.volume ?? null,
    priceAvg50: q.priceAvg50 ?? null,
    priceAvg200: q.priceAvg200 ?? null,
    yearHigh: q.yearHigh ?? null,
    yearLow: q.yearLow ?? null,
    eps: q.eps ?? null,
    pe: q.pe ?? null,
  };
}

function getCleanRecommendation(row) {
  const trigger = row.triggerScore ?? 0;
  const asymmetry = row.asymmetryScore ?? 0;
  const quality = row.qualityScore ?? 0;

  if (trigger >= 78 && asymmetry >= 68 && quality >= 55) {
    return {
      label: "STRONG BUY",
      reason: "Momentum, asymmetry, and quality are aligned.",
    };
  }

  if (trigger >= 63 && asymmetry >= 58) {
    return {
      label: "BUY",
      reason: "Attractive setup with positive confirmation.",
    };
  }

  if (trigger >= 48 || asymmetry >= 60) {
    return {
      label: "WATCH",
      reason: "Interesting, but needs better confirmation.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup or not enough confirmation.",
  };
}

function buildEntryNote(row) {
  const price = row.price;

  if (!price) return "No clean entry yet.";

  if (row.recommendation?.label === "STRONG BUY") {
    return `Actionable now. Watch for strength above $${price.toFixed(2)} with volume.`;
  }

  if (row.recommendation?.label === "BUY") {
    return `Buyable setup. Better on pullback near $${price.toFixed(2)} or strong-volume breakout.`;
  }

  if (row.recommendation?.label === "WATCH") {
    return "Wait for better price/volume confirmation.";
  }

  return "Avoid for now.";
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
    const stage = getStage(base);
    const technicalSnapshot = buildTechnicalSnapshot(base);
    const fundamentalSnapshot = buildFundamentalSnapshot(base);

    const recommendation = getCleanRecommendation({
      ...base,
      qualityScore,
      asymmetryScore,
      triggerScore,
    });

    res.status(200).json({
      ...base,
      qualityScore,
      asymmetryScore,
      triggerScore,
      stage,
      recommendation,
      entryNote: buildEntryNote({ ...base, recommendation }),
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
