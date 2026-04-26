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

function average(values) {
  const clean = values.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function max(values) {
  const clean = values.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (!clean.length) return null;
  return Math.max(...clean);
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
    } catch {}

    await sleep(75);
  }

  return Array.from(quoteMap.values());
}

async function fetchHistory(symbol) {
  const apiKey = process.env.FMP_API_KEY;
  const fmpSymbol = toFmpSymbol(symbol);

  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const raw = Array.isArray(data) ? data : data?.historical || [];

    return raw
      .map((x) => ({
        date: x.date,
        open: Number(x.open),
        high: Number(x.high),
        low: Number(x.low),
        close: Number(x.close),
        volume: Number(x.volume),
      }))
      .filter((x) => Number.isFinite(x.close))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function enrichWithHistory(row, history) {
  if (!history.length) return row;

  const price = Number(row.price);
  const closes = history.map((x) => x.close);
  const highs = history.map((x) => x.high);
  const volumes = history.map((x) => x.volume);

  const ma20 = average(closes.slice(0, 20));
  const ma50 = average(closes.slice(0, 50));
  const ma200 = average(closes.slice(0, 200));

  const prev20High = max(highs.slice(1, 21));
  const prev60High = max(highs.slice(1, 61));
  const avgVol20 = average(volumes.slice(1, 21));

  const pct5 = closes[5] ? ((price - closes[5]) / closes[5]) * 100 : null;
  const pct20 = closes[20] ? ((price - closes[20]) / closes[20]) * 100 : null;
  const pct60 = closes[60] ? ((price - closes[60]) / closes[60]) * 100 : null;

  const relativeVolume =
    row.volume && avgVol20 && avgVol20 > 0 ? row.volume / avgVol20 : null;

  const breakout20 =
    price && prev20High && relativeVolume != null
      ? price >= prev20High && relativeVolume >= 1.05
      : false;

  const pullback50 =
    price && ma50
      ? price > ma50 && (price - ma50) / ma50 <= 0.06
      : false;

  return {
    ...row,
    ma20,
    ma50,
    ma200,
    priceAvg50: ma50 ?? row.priceAvg50,
    priceAvg200: ma200 ?? row.priceAvg200,
    pct5,
    pct20,
    pct60,
    relativeVolume,
    breakout20,
    breakout60:
      price && prev60High && relativeVolume != null
        ? price >= prev60High && relativeVolume >= 1.05
        : false,
    pullback50,
    historicalBars: history.length,
  };
}

function buildEntryNote(row) {
  const price = row.price;
  const ma50 = row.ma50 ?? row.priceAvg50;
  const signal = row.recommendation?.label;

  if (!price) return "No clean entry yet.";

  if (signal === "STRONG BUY") {
    return row.breakout20
      ? `BUY NOW near $${price.toFixed(2)}. Breakout is confirming.`
      : `BUY NOW starter near $${price.toFixed(2)}. Add only if volume follows.`;
  }

  if (signal === "BUY") {
    if (row.pullback50 && ma50) {
      return `Starter acceptable near $${price.toFixed(
        2
      )}. Add if it holds above 50DMA near $${ma50.toFixed(2)}.`;
    }

    return "Starter acceptable only if chart confirms. Add on breakout or volume.";
  }

  if (signal === "WATCH") {
    return "Wait for breakout, pullback, or volume confirmation.";
  }

  return "Avoid.";
}

function preliminaryRank(row) {
  const price = Number(row.price) || 0;
  const day = Number(row.dayChangePct) || 0;
  const vol = Number(row.volume || row.avgVolume) || 0;
  const marketCap = Number(row.marketCap) || 0;

  let score = 0;

  if (price >= 5 && price <= 25) score += 30;
  if (day > 0) score += Math.min(day * 2, 20);
  if (vol > 1000000) score += 15;
  else if (vol > 500000) score += 10;
  if (marketCap > 300000000) score += 10;

  return score;
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

    const baseRows = tradable.map((row) => {
      const quote = quoteMap.get(normalizeSymbol(row.symbol)) || {};

      return {
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
    });

    const historyCandidates = [...baseRows]
      .sort((a, b) => preliminaryRank(b) - preliminaryRank(a))
      .slice(0, 120);

    const historyPairs = await mapLimit(historyCandidates, 6, async (row) => {
      const history = await fetchHistory(row.symbol);
      return [row.symbol, history];
    });

    const historyMap = new Map(historyPairs);

    const scored = baseRows.map((row) => {
      const enriched = enrichWithHistory(row, historyMap.get(row.symbol) || []);

      const qualityScore = calcQualityScore(enriched);
      const asymmetryScore = calcAsymmetryScore(enriched);
      const triggerScore = calcTriggerScore(enriched);

      const scoredRow = {
        ...enriched,
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
        historicalSnapshots: historyPairs.filter(([, h]) => h.length).length,
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
