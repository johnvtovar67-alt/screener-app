import {
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getStage,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
  calcHeatScore,
  getTradeReadiness,
} from "../../lib/scoring";

function normalizeSymbol(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

function cleanSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

async function fetchFmpBatchQuote(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in Vercel environment variables.");
  }

  const fmpSymbol = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${fmpSymbol}&apikey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`FMP batch quote failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const q = data[0];

  if (!q?.symbol || q.price == null) {
    return null;
  }

  return {
    symbol: normalizeSymbol(q.symbol),
    name: q.name || q.symbol,
    price: q.price ?? null,
    dayChangePct:
      q.changesPercentage ??
      q.changePercentage ??
      q.changePercent ??
      null,
    change: q.change ?? null,
    volume: q.volume ?? null,
    avgVolume: q.avgVolume ?? q.volume ?? null,
    marketCap: q.marketCap ?? null,
    priceAvg50: q.priceAvg50 ?? q.priceAvg50d ?? null,
    priceAvg200: q.priceAvg200 ?? q.priceAvg200d ?? null,
    yearHigh: q.yearHigh ?? q.yearHighPrice ?? null,
    yearLow: q.yearLow ?? q.yearLowPrice ?? null,
    eps: q.eps ?? null,
    pe: q.pe ?? q.peRatio ?? null,
  };
}

function buildEntryNote(row) {
  const readiness = row.tradeReadiness?.label;
  const price = row.price;
  const ma50 = row.priceAvg50;

  if (!price) return "No clean entry yet.";

  if (readiness === "TRADE READY") {
    return `TRADE READY near $${price.toFixed(
      2
    )}. Starter acceptable now; add only if volume confirms.`;
  }

  if (readiness === "WATCH CLOSELY") {
    return `Watch closely near $${price.toFixed(
      2
    )}. Wait for stronger price/volume confirmation.`;
  }

  if (row.recommendation?.label === "STRONG BUY") {
    return `Strong setup near $${price.toFixed(
      2
    )}, but wait for trigger confirmation before sizing up.`;
  }

  if (row.recommendation?.label === "BUY") {
    if (ma50 && ma50 > 0 && ma50 < price) {
      return `Starter acceptable. Better add point is pullback near $${ma50.toFixed(
        2
      )} or a volume breakout.`;
    }

    return "Starter acceptable only if chart keeps improving.";
  }

  if (row.recommendation?.label === "WATCH") {
    return "Watch only. Wait for breakout, pullback, or volume confirmation.";
  }

  return "Avoid for now.";
}

export default async function handler(req, res) {
  try {
    const symbol = cleanSymbol(req.query.symbol || req.query.ticker);

    if (!symbol) {
      return res.status(400).json({
        error: "Missing symbol. Example: /api?symbol=MARA",
      });
    }

    const quote = await fetchFmpBatchQuote(symbol);

    if (!quote) {
      return res.status(404).json({
        error: `No quote data found for ${symbol}.`,
      });
    }

    const base = {
      ...quote,
      symbol: normalizeSymbol(symbol),
      name: quote.name || symbol,
      assetType: "stock",
    };

    const qualityScore = calcQualityScore(base);
    const asymmetryScore = calcAsymmetryScore(base);
    const triggerScore = calcTriggerScore(base);
    const heatScore = calcHeatScore(base);

    const scoredRow = {
      ...base,
      qualityScore,
      asymmetryScore,
      triggerScore,
      heatScore,
    };

    const tradeReadiness = getTradeReadiness(scoredRow);
    const recommendation = getRecommendation(scoredRow);

    const finalRow = {
      ...scoredRow,
      tradeReadiness,
      recommendation,
    };

    const result = {
      ...finalRow,
      stage: getStage(finalRow),
      entryNote: buildEntryNote(finalRow),
      technicalSnapshot: buildTechnicalSnapshot(finalRow),
      fundamentalSnapshot: buildFundamentalSnapshot(finalRow),

      compositeScore: recommendation?.score ?? 0,
      heatScore,
      tradeReadiness,
      changePercent: quote.dayChangePct,
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("index api error:", err);

    return res.status(500).json({
      error: err.message || "Failed to analyze symbol.",
    });
  }
}
