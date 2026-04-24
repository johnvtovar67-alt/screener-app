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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prioritizeUniverse(fullUniverse) {
  const clean = fullUniverse
    .filter((x) => x.symbol)
    .filter((x) => x.symbol.length <= 5)
    .filter((x) => !x.symbol.includes("."))
    .filter((x) => !x.symbol.includes("-"));

  // Spread across the full list instead of only taking A/B/C tickers.
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

  const targetQuotes = 900;
  const maxRounds = 3;
  const quoteMap = new Map();

  async function fetchChunk(chunk, useShort = false) {
    const endpoint = useShort ? "batch-quote-short" : "batch-quote";

    const url = `https://financialmodelingprep.com/stable/${endpoint}?symbols=${chunk.join(
      ","
    )}&apikey=${apiKey}`;

    try {
      const response = await fetch(url);

      if (!response.ok) return [];

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data
        .map((q) => ({
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
          priceAvg50: q.priceAvg50 ?? null,
          priceAvg200: q.priceAvg200 ?? null,
          yearHigh: q.yearHigh ?? null,
          yearLow: q.yearLow ?? null,
          eps: q.eps ?? null,
          pe: q.pe ?? null,
        }))
        .filter((x) => x.symbol && x.price != null);
    } catch (err) {
      console.error("FMP chunk failed:", err.message);
      return [];
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    for (const chunk of chunks) {
      if (quoteMap.size >= targetQuotes) break;

      let quotes = await fetchChunk(chunk, false);

      // Fallback if the richer endpoint returns nothing for that chunk.
      if (!quotes.length) {
        quotes = await fetchChunk(chunk, true);
      }

      for (const quote of quotes) {
        quoteMap.set(quote.symbol, quote);
      }

      // Keeps us comfortably under rate limits.
      await sleep(120);
    }

    if (quoteMap.size >= targetQuotes) break;

    // Small pause before another pass.
    await sleep(500);
  }

  return Array.from(quoteMap.values());
}

function getCleanRecommendation(row) {
  const trigger = row.triggerScore ?? 0;
  const asymmetry = row.asymmetryScore ?? 0;
  const quality = row.qualityScore ?? 0;

  if (trigger >= 78 && asymmetry >= 70 && quality >= 60) {
    return {
      label: "STRONG BUY",
      reason: "High conviction: trend, upside, and quality aligned.",
    };
  }

  if (trigger >= 66 && asymmetry >= 60 && quality >= 52) {
    return {
      label: "BUY",
      reason: "Solid setup with confirmation.",
    };
  }

  if (trigger >= 50 || asymmetry >= 55) {
    return {
      label: "WATCH",
      reason: "Interesting, needs confirmation.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak structure or poor risk/reward.",
  };
}

function buildEntryNote(row) {
  const price = row.price;
  const ma50 = row.priceAvg50;

  if (!price) return "No clean entry yet.";

  if (row.recommendation?.label === "STRONG BUY") {
    return `Actionable above $${price.toFixed(2)} if volume confirms.`;
  }

  if (row.recommendation?.label === "BUY") {
    if (ma50 && ma50 > 0) {
      return `Better entry near 50DMA around $${ma50.toFixed(
        2
      )} or breakout above $${price.toFixed(2)}.`;
    }

    return `Better entry near $${price.toFixed(2)} or breakout.`;
  }

  if (row.recommendation?.label === "WATCH") {
    return "Wait for trend or volume confirmation.";
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
      throw new Error(
        "FMP returned zero quotes. Confirm paid plan access and FMP_API_KEY."
      );
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
        symbol: row.symbol,
        name: quote.name || row.name || row.symbol,
        price: quote.price ?? row.price,
        dayChangePct: quote.dayChangePct ?? null,
        volume: quote.volume ?? null,
        avgVolume: quote.avgVolume ?? row.avgVolume,
        marketCap: quote.marketCap ?? row.marketCap,
        priceAvg50: quote.priceAvg50 ?? null,
        priceAvg200: quote.priceAvg200 ?? null,
        yearHigh: quote.yearHigh ?? null,
        yearLow: quote.yearLow ?? null,
        eps: quote.eps ?? null,
        pe: quote.pe ?? null,
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
      const rank = {
        "STRONG BUY": 4,
        BUY: 3,
        WATCH: 2,
        AVOID: 1,
      };

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
        prioritizedUniverse: prioritizedUniverse.length,
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
