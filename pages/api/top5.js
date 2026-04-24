import { buildRawListedUniverse } from "../../src/lib/universe";
import { applyLiquidityFilter } from "../../src/lib/liquidity-filter";
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

// ✅ FREE-TIER SAFE QUOTE PULL
async function fetchFmpQuotes(symbols) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in Vercel environment variables.");
  }

  const clean = [...new Set(symbols.filter(Boolean).map((s) => s.replace(".", "-")))];
  const chunks = [];

  // smaller chunks for free plan
  for (let i = 0; i < clean.length; i += 50) {
    chunks.push(clean.slice(i, i + 50));
  }

  const results = [];

  async function fetchChunk(chunk) {
    const url = `https://financialmodelingprep.com/api/v3/quote-short/${chunk.join(
      ","
    )}?apikey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((q) => ({
        symbol: normalizeSymbol(q.symbol),
        name: q.symbol,
        price: q.price ?? null,
        volume: q.volume ?? null,
        avgVolume: q.volume ?? null,
        marketCap: null,
        dayChangePct: null,
      }))
      .filter((x) => x.symbol && x.price != null);
  }

  const concurrency = 3;

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchChunk));
    results.push(...batchResults.flat());
  }

  return results;
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
      reason: "Attractive setup with confirmation.",
    };
  }

  if (trigger >= 48 || asymmetry >= 60) {
    return {
      label: "WATCH",
      reason: "Needs confirmation.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup.",
  };
}

function buildEntryNote(row) {
  const price = row.price;

  if (!price) return "No clean entry yet.";

  if (row.recommendation?.label === "STRONG BUY") {
    return `Actionable now above $${price.toFixed(2)} with volume.`;
  }

  if (row.recommendation?.label === "BUY") {
    return `Better entry near $${price.toFixed(2)} or breakout.`;
  }

  if (row.recommendation?.label === "WATCH") {
    return "Wait for confirmation.";
  }

  return "Avoid.";
}

export default async function handler(req, res) {
  try {
    const fullUniverse = await buildRawListedUniverse();

    const quotes = await fetchFmpQuotes(
      fullUniverse.map((x) => x.symbol)
    );

    if (!quotes.length) {
      throw new Error(
        "FMP returned zero quotes. Key may not be active yet (can take a few minutes)."
      );
    }

    const quoteMap = new Map();
    quotes.forEach((q) => quoteMap.set(q.symbol, q));

    const tradable = applyLiquidityFilter(fullUniverse, quotes, {
      minPrice: 5,
      minMarketCap: 300_000_000,
      minAvgVolume: 250_000,
    });

    const scored = tradable.map((row) => {
      const quote = quoteMap.get(normalizeSymbol(row.symbol)) || {};

      const base = {
        ...row,
        ...quote,
        symbol: row.symbol,
        name: quote.name || row.name || row.symbol,
        price: quote.price ?? row.price,
        avgVolume: quote.avgVolume ?? row.avgVolume,
        marketCap: quote.marketCap ?? row.marketCap,
      };

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

      return {
        ...base,
        qualityScore,
        asymmetryScore,
        triggerScore,
        stage,
        recommendation,
        entryNote: buildEntryNote({ ...base, recommendation }),
        technicalSnapshot,
        fundamentalSnapshot,
      };
    });

    scored.sort((a, b) => {
      const rank = { "STRONG BUY": 4, BUY: 3, WATCH: 2, AVOID: 1 };

      return (
        (rank[b.recommendation?.label] || 0) -
          (rank[a.recommendation?.label] || 0) ||
        (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
        (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0) ||
        (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
      );
    });

    res.status(200).json({
      stocks: scored.slice(0, 150),
      meta: {
        totalUniverse: fullUniverse.length,
        quoteSnapshots: quotes.length,
        afterInstitutionalFilter: tradable.length,
        afterRankingThreshold: scored.length,
      },
    });
  } catch (err) {
    console.error("top5 error:", err);

    res.status(500).json({
      error: err.message || "Failed to build screener.",
    });
  }
}
