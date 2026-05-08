// pages/api/top5.js

import { buildRawListedUniverse } from "../../src/lib/universe";
import { applyLiquidityFilter } from "../../src/lib/liquidity-filter";

import {
  passesInstitutionalFilter,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcAsymmetryScore,
  calcTriggerScore,
  compositeScore,
  getRecommendation,
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

  const clean = [...new Set(symbols.filter(Boolean).map((s) => toFmpSymbol(s)))];

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

      if (!response.ok) {
        const text = await response.text();

        console.error(
          "FMP batch quote failed",
          JSON.stringify({
            status: response.status,
            url,
            body: text,
          })
        );

        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error("FMP batch quote non-array response", JSON.stringify(data));
        continue;
      }

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
      console.error("FMP batch quote error", err);
    }

    await sleep(75);
  }

  return Array.from(quoteMap.values());
}

export default async function handler(req, res) {
  try {
    const fullUniverse = await buildRawListedUniverse();
    const prioritizedUniverse = prioritizeUniverse(fullUniverse);

    const quotes = await fetchFmpQuotes(prioritizedUniverse.map((x) => x.symbol));

    if (!quotes.length) {
      throw new Error("No quotes returned from FMP. Check Vercel logs for FMP status code.");
    }

    const quoteMap = new Map();
    quotes.forEach((q) => quoteMap.set(q.symbol, q));

    const tradable = applyLiquidityFilter(prioritizedUniverse, quotes, {
      minPrice: 5,
      minMarketCap: 300000000,
      minAvgVolume: 500000,
    });

    const scored = tradable
      .map((row) => {
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

        if (!passesInstitutionalFilter(base)) return null;

        const fundamentalScore = calcFundamentalScore(base);
        const technicalScore = calcTechnicalScore(base);
        const momentumScore = calcMomentumScore(base);
        const asymmetryScore = calcAsymmetryScore(base);
        const triggerScore = calcTriggerScore(base);
        const score = compositeScore(base);
        const recommendation = getRecommendation(base);

        return {
          ...base,
          fundamentalScore,
          technicalScore,
          momentumScore,
          asymmetryScore,
          triggerScore,
          score,
          recommendation,
          stage: getStage(base),
          technicalSnapshot: buildTechnicalSnapshot(base),
          fundamentalSnapshot: buildFundamentalSnapshot(base),
        };
      })
      .filter(Boolean);

    scored.sort((a, b) => {
      const actionRank = {
        "BUY NOW": 3,
        "WATCH FOR ENTRY": 2,
        WATCH: 1,
        AVOID: 0,
      };

      return (
        (actionRank[b.recommendation?.label] || 0) -
          (actionRank[a.recommendation?.label] || 0) ||
        (b.triggerScore ?? 0) - (a.triggerScore ?? 0) ||
        (b.score ?? 0) - (a.score ?? 0) ||
        (b.momentumScore ?? 0) - (a.momentumScore ?? 0)
      );
    });

    const topIdeas = scored
      .filter((x) => {
        const label = x?.recommendation?.label;
        return label === "BUY NOW" || label === "WATCH FOR ENTRY";
      })
      .slice(0, 150);

    res.status(200).json({
      stocks: topIdeas,
      meta: {
        totalUniverse: fullUniverse.length,
        prioritizedUniverse: prioritizedUniverse.length,
        quoteSnapshots: quotes.length,
        afterInstitutionalFilter: scored.length,
        finalResults: topIdeas.length,
      },
    });
  } catch (err) {
    console.error("top5 error:", err);

    res.status(500).json({
      error: err.message || "Failed to build screener.",
    });
  }
}
