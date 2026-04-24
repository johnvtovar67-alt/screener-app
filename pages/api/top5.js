// pages/api/top5.js

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

function normalizeSymbolForYahoo(symbol) {
  return String(symbol || "").replace(".", "-").toUpperCase();
}

function normalizeSymbolForApp(symbol) {
  return String(symbol || "").replace("-", ".").toUpperCase();
}

async function getSnapshots(symbols) {
  const cleanSymbols = symbols
    .filter(Boolean)
    .map(normalizeSymbolForYahoo);

  const chunkSize = 80;
  const chunks = [];

  for (let i = 0; i < cleanSymbols.length; i += chunkSize) {
    chunks.push(cleanSymbols.slice(i, i + chunkSize));
  }

  const results = [];

  async function fetchChunk(chunk) {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(
      ","
    )}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      const quotes = data?.quoteResponse?.result || [];

      return quotes
        .map((q) => ({
          symbol: normalizeSymbolForApp(q.symbol),
          yahooSymbol: q.symbol,
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
        }))
        .filter((x) => x.symbol && x.price != null);
    } catch (err) {
      console.error("Yahoo quote chunk failed:", err.message);
      return [];
    }
  }

  const concurrency = 6;

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
    return `Actionable now. Watch for strength above $${price.toFixed(
      2
    )} with volume.`;
  }

  if (row.recommendation?.label === "BUY") {
    return `Buyable setup. Better entry on a pullback near $${price.toFixed(
      2
    )} or a strong-volume breakout.`;
  }

  if (row.recommendation?.label === "WATCH") {
    return "Wait for better price/volume confirmation before buying.";
  }

  return "Avoid for now.";
}

export default async function handler(req, res) {
  try {
    const fullUniverse = await buildRawListedUniverse();

    const universeSymbols = fullUniverse.map((x) => x.symbol);
    const snapshots = await getSnapshots(universeSymbols);

    const quoteMap = new Map();
    for (const quote of snapshots) {
      quoteMap.set(normalizeSymbolForApp(quote.symbol), quote);
    }

    const tradable = applyLiquidityFilter(fullUniverse, snapshots, {
      minPrice: 5,
      minMarketCap: 300_000_000,
      minAvgVolume: 500_000,
    });

    const scored = tradable.map((row) => {
      const quote = quoteMap.get(normalizeSymbolForApp(row.symbol)) || {};

      const base = {
        ...row,
        ...quote,
        symbol: row.symbol,
        name: row.name || quote.name || row.symbol,
        price: quote.price ?? row.price,
        marketCap: quote.marketCap ?? row.marketCap,
        avgVolume: quote.avgVolume ?? row.avgVolume,
        dayChangePct: quote.dayChangePct ?? null,
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
        entryNote: buildEntryNote({
          ...base,
          recommendation,
        }),
        technicalSnapshot,
        fundamentalSnapshot,
      };
    });

    scored.sort((a, b) => {
      const actionRank = {
        "STRONG BUY": 4,
        BUY: 3,
        WATCH: 2,
        AVOID: 1,
      };

      return (
        (actionRank[b.recommendation?.label] || 0) -
          (actionRank[a.recommendation?.label] || 0) ||
        (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
        (b.asymmetryScore ?? 0) - (a.asymmetryScore ?? 0) ||
        (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
      );
    });

    const top = scored.slice(0, 150);

    res.status(200).json({
      stocks: top,
      meta: {
        totalUniverse: fullUniverse.length,
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
