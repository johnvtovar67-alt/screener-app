// pages/api/lookup.js

import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "../../lib/scoring";

function normalizeSymbolForYahoo(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

function normalizeSymbolBack(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

async function getQuote(symbol) {
  const yahooSymbol = normalizeSymbolForYahoo(symbol);

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    yahooSymbol
  )}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error("Quote lookup failed.");
  }

  const data = await response.json();
  const q = data?.quoteResponse?.result?.[0];

  if (!q) {
    throw new Error("Ticker not found.");
  }

  return {
    symbol: normalizeSymbolBack(q.symbol),
    name: q.longName || q.shortName || q.displayName || q.symbol,
    price: q.regularMarketPrice ?? null,
    marketCap: q.marketCap ?? null,
    avgVolume:
      q.averageDailyVolume3Month ??
      q.averageDailyVolume10Day ??
      q.regularMarketVolume ??
      null,
    volume: q.regularMarketVolume ?? null,
    dayChangePct: q.regularMarketChangePercent ?? null,
  };
}

function getCleanRecommendation(row) {
  const trigger = row.triggerScore ?? 0;
  const asymmetry = row.asymmetryScore ?? 0;
  const quality = row.qualityScore ?? 0;

  if (trigger >= 78 && asymmetry >= 68 && quality >= 55) {
    return {
      label: "STRONG BUY",
      reason: "Best setup: momentum, asymmetry, and quality are aligned.",
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
    return `Buyable setup. Better entry on a pullback near $${price.toFixed(2)} or a strong-volume breakout.`;
  }

  if (row.recommendation?.label === "WATCH") {
    return "Wait for better price/volume confirmation before buying.";
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
      entryNote: buildEntryNote({
        ...base,
        recommendation,
      }),
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
