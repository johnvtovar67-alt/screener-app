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

function toStooq(symbol) {
  return String(symbol || "").replace(".", "-").toLowerCase() + ".us";
}

function fromStooq(symbol) {
  return String(symbol || "")
    .replace(".US", "")
    .replace(".us", "")
    .replace("-", ".")
    .toUpperCase();
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i];
    });
    return row;
  });
}

async function getSnapshots(symbols) {
  const clean = [...new Set(symbols.filter(Boolean))];
  const chunks = [];

  for (let i = 0; i < clean.length; i += 75) {
    chunks.push(clean.slice(i, i + 75));
  }

  const results = [];

  for (const chunk of chunks) {
    const stooqSymbols = chunk.map(toStooq).join(",");
    const url = `https://stooq.com/q/l/?s=${stooqSymbols}&f=sd2t2ohlcv&h&e=csv`;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!response.ok) continue;

      const text = await response.text();
      const rows = parseCsv(text);

      for (const r of rows) {
        const close = Number(r.Close);
        const open = Number(r.Open);
        const volume = Number(r.Volume);

        if (!Number.isFinite(close) || close <= 0) continue;

        results.push({
          symbol: fromStooq(r.Symbol),
          price: close,
          avgVolume: Number.isFinite(volume) ? volume : null,
          volume: Number.isFinite(volume) ? volume : null,
          marketCap: null,
          dayChangePct:
            Number.isFinite(open) && open > 0
              ? ((close - open) / open) * 100
              : null,
        });
      }
    } catch (err) {
      console.error("Stooq chunk failed:", err.message);
    }
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
    const snapshots = await getSnapshots(fullUniverse.map((x) => x.symbol));

    if (!snapshots.length) {
      return res.status(500).json({
        error: "Quote pull failed from Stooq. No snap quote data returned.",
      });
    }

    const quoteMap = new Map();
    snapshots.forEach((q) => quoteMap.set(q.symbol, q));

    const tradable = applyLiquidityFilter(fullUniverse, snapshots, {
      minPrice: 5,
      minMarketCap: 300_000_000,
      minAvgVolume: 250_000,
    });

    const scored = tradable.map((row) => {
      const quote = quoteMap.get(row.symbol) || {};

      const base = {
        ...row,
        ...quote,
        symbol: row.symbol,
        name: row.name || row.symbol,
        price: quote.price ?? row.price,
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
        quoteSnapshots: snapshots.length,
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
