import { buildRawListedUniverse } from "../../src/lib/universe";
import { applyLiquidityFilter } from "../../src/lib/liquidity-filter";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prioritizeUniverse(fullUniverse) {
  const clean = fullUniverse
    .filter((x) => x.symbol)
    .filter((x) => x.symbol.length <= 5)
    .filter((x) => !x.symbol.includes("."))
    .filter((x) => !x.symbol.includes("-"));

  const buckets = 12;
  const spread = [];

  for (let b = 0; b < buckets; b++) {
    for (let i = b; i < clean.length; i += buckets) {
      spread.push(clean[i]);
    }
  }

  return spread.slice(0, 1800);
}

async function fetchFmpQuotes(symbols) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in Vercel environment variables.");
  }

  const clean = [
    ...new Set(symbols.filter(Boolean).map((s) => s.replace(".", "-"))),
  ];

  const chunks = [];
  const chunkSize = 50;

  for (let i = 0; i < clean.length; i += chunkSize) {
    chunks.push(clean.slice(i, i + chunkSize));
  }

  const quoteMap = new Map();

  for (const chunk of chunks) {
    const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${chunk.join(
      ","
    )}&apikey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      if (!Array.isArray(data)) continue;

      for (const q of data) {
        quoteMap.set(normalizeSymbol(q.symbol), {
          symbol: normalizeSymbol(q.symbol),
          name: q.name || q.symbol,
          price: q.price ?? null,
          dayChangePct:
            q.changesPercentage ??
            q.changePercentage ??
            q.changePercent ??
            null,
          volume: q.volume ?? null,
          avgVolume: q.avgVolume ?? q.volume ?? null,
          marketCap: q.marketCap ?? null,
          priceAvg50: q.priceAvg50 ?? null,
          priceAvg200: q.priceAvg200 ?? null,
          yearHigh: q.yearHigh ?? null,
          yearLow: q.yearLow ?? null,
          eps: q.eps ?? null,
          pe: q.pe ?? null,
        });
      }
    } catch {}

    await sleep(100);
  }

  return Array.from(quoteMap.values());
}

//
// 🔥 REAL ENTRY LOGIC (FIXED)
//
function buildEntryNote(row) {
  const price = row.price;
  const ma50 = row.priceAvg50;
  const high = row.yearHigh;
  const signal = row.recommendation?.label;

  if (!price) return "No clean entry yet.";

  // STRONG BUY = ONLY WHEN ACTIONABLE
  if (signal === "STRONG BUY") {
    return `BUY NOW near $${price.toFixed(2)} (momentum confirmed)`;
  }

  // BUY = WAIT FOR TRIGGER
  if (signal === "BUY") {
    // Prefer breakout near recent highs (real level)
    if (high && high > price) {
      const breakout = (price + (high - price) * 0.15); // early breakout zone
      return `Wait for breakout above ~$${breakout.toFixed(2)}`;
    }

    // fallback to 50DMA pullback
    if (ma50 && ma50 > 0) {
      return `Better entry on pullback near $${ma50.toFixed(2)}`;
    }

    return `Wait for confirmation above $${price.toFixed(2)}`;
  }

  if (signal === "WATCH") {
    return "Wait for stronger trend and volume.";
  }

  return "Avoid.";
}

export default async function handler(req, res) {
  try {
    const fullUniverse = await buildRawListedUniverse();
    const prioritizedUniverse = prioritizeUniverse(fullUniverse);

    const quotes = await fetchFmpQuotes(
      prioritizedUniverse.map((x) => x.symbol)
    );

    if (!quotes.length) {
      throw new Error("No quotes returned from FMP.");
    }

    const quoteMap = new Map();
    quotes.forEach((q) => quoteMap.set(q.symbol, q));

    const tradable = applyLiquidityFilter(prioritizedUniverse, quotes, {
      minPrice: 5,
      minMarketCap: 300_000_000,
      minAvgVolume: 250_000,
    });

    const scored = tradable.map((row) => {
      const quote = quoteMap.get(normalizeSymbol(row.symbol)) || {};

      const base = {
        ...row,
        ...quote,
      };

      const qualityScore = calcQualityScore(base);
      const asymmetryScore = calcAsymmetryScore(base);
      const triggerScore = calcTriggerScore(base);

      const recommendation = getRecommendation({
        ...base,
        qualityScore,
        asymmetryScore,
        triggerScore,
      });

      return {
        ...base,
        qualityScore,
        asymmetryScore,
        triggerScore,
        stage: getStage(base),
        recommendation,
        entryNote: buildEntryNote({ ...base, recommendation }),
        technicalSnapshot: buildTechnicalSnapshot(base),
        fundamentalSnapshot: buildFundamentalSnapshot(base),
      };
    });

    scored.sort((a, b) => {
      const rank = {
        "STRONG BUY": 4,
        BUY: 3,
        WATCH: 2,
        AVOID: 1,
      };

      return (
        (rank[b.recommendation?.label] || 0) -
          (rank[a.recommendation?.label] || 0) ||
        b.triggerScore - a.triggerScore
      );
    });

    res.status(200).json({
      stocks: scored.slice(0, 150),
    });
  } catch (err) {
    console.error("top5 error:", err);

    res.status(500).json({
      error: err.message || "Failed to build screener.",
    });
  }
}
