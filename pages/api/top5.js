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

function toFmpSymbol(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
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
    ...new Set(symbols.filter(Boolean).map((s) => toFmpSymbol(s))),
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
        if (!q?.symbol || q.price == null) continue;

        quoteMap.set(normalizeSymbol(q.symbol), {
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
        });
      }
    } catch (err) {
      console.error("FMP batch quote error:", err);
    }

    await sleep(75);
  }

  return Array.from(quoteMap.values());
}

function buildEntryNote(row) {
  const signal = row.recommendation?.label;
  const price = row.price;
  const ma50 = row.priceAvg50;

  if (!price) return "No clean entry yet.";

  if (signal === "STRONG BUY") {
    return `BUY NOW starter near $${price.toFixed(2)}. Add only if strength holds.`;
  }

  if (signal === "BUY") {
    if (ma50 && ma50 > 0 && ma50 < price) {
      return `Starter acceptable. Add on pullback near $${ma50.toFixed(2)} or volume confirmation.`;
    }

    return "Starter acceptable. Add only on confirmation.";
  }

  if (signal === "WATCH") {
    return "Wait for breakout, pullback, or volume confirmation.";
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
        "No quotes returned from FMP. Confirm FMP_API_KEY and endpoint access."
      );
    }

    const quoteMap = new Map();
    quotes.forEach((q) => quoteMap.set(q.symbol, q));

    const tradable = applyLiquidityFilter(prioritizedUniverse, quotes, {
      minPrice: 5,
      minMarketCap: 300000000,
      minAvgVolume: 250000,
    });

    const scored = tradable.map((row) => {
      const quote = quoteMap.get(normalizeSymbol(row.symbol)) || {};

      const base = {
        ...row,
        ...quote,
        symbol: normalizeSymbol(row.symbol),
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

      const scoredRow = {
        ...base,
        qualityScore,
        asymmetryScore,
        triggerScore,
      };

      const recommendation = getRecommendation(scoredRow);

      return {
        ...scoredRow,
        stage: getStage(scoredRow),
        recommendation,
        entryNote: buildEntryNote({ ...scoredRow, recommendation }),
        technicalSnapshot: buildTechnicalSnapshot(scoredRow),
        fundamentalSnapshot: buildFundamentalSnapshot(scoredRow),
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
        (b.recommendation?.score ?? 0) - (a.recommendation?.score ?? 0) ||
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
