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

const SEED_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "NFLX",
  "COIN", "HOOD", "MSTR", "MARA", "RIOT", "CLSK", "HIMS", "SOFI", "PLTR", "SOUN",
  "BBAI", "BGC", "BCRX", "FLYW", "CROX", "CELH", "UPST", "AFRM", "RKT", "DKNG",
  "SHOP", "NET", "CRWD", "DDOG", "SNOW", "ROKU", "UBER", "LYFT", "SQ", "PYPL",
  "SCHW", "JPM", "BAC", "C", "WFC", "GS", "MS", "BX", "KKR", "APO"
];

function prioritizeUniverse(fullUniverse) {
  const raw = fullUniverse
    .filter((x) => x.symbol)
    .map((x) => normalizeSymbol(x.symbol))
    .filter((s) => s.length <= 5)
    .filter((s) => !s.includes("."))
    .filter((s) => !s.includes("-"));

  const combined = [...new Set([...SEED_SYMBOLS, ...raw])];

  return combined.slice(0, 250).map((symbol) => ({ symbol }));
}

async function fetchSingleQuote(symbol, apiKey) {
  const clean = toFmpSymbol(symbol);
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${clean}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error("FMP single quote failed", response.status, clean, text);
      return null;
    }

    const data = await response.json();
    const q = Array.isArray(data) ? data[0] : data;

    if (!q?.symbol || q.price == null) {
      console.error("FMP empty quote", clean, JSON.stringify(data));
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
  } catch (err) {
    console.error("FMP quote fetch error", clean, err);
    return null;
  }
}

async function fetchQuotes(symbols) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY.");
  }

  const results = [];

  for (const symbol of symbols) {
    const quote = await fetchSingleQuote(symbol, apiKey);

    if (quote) {
      results.push(quote);
    }

    await sleep(50);
  }

  return results;
}

export default async function handler(req, res) {
  try {
    const fullUniverse = await buildRawListedUniverse();
    const prioritizedUniverse = prioritizeUniverse(fullUniverse);

    const quotes = await fetchQuotes(prioritizedUniverse.map((x) => x.symbol));

    if (!quotes.length) {
      throw new Error("No quotes returned from FMP.");
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

    return res.status(200).json({
      stocks: topIdeas,
      meta: {
        totalUniverse: fullUniverse.length,
        prioritizedUniverse: prioritizedUniverse.length,
        quotes: quotes.length,
        scored: scored.length,
        finalResults: topIdeas.length,
      },
    });
  } catch (err) {
    console.error("top5 error:", err);

    return res.status(500).json({
      error: err.message || "Failed to build screener.",
    });
  }
}
