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

// 🔌 You must implement this using your existing price API
async function getSnapshots(symbols) {
  // TODO: Replace with your TwelveData / existing logic
  // For now assume you already have something similar in lookup.js
  return symbols.map((s) => ({
    symbol: s,
    price: Math.random() * 50 + 5,
    marketCap: 500_000_000 + Math.random() * 5_000_000_000,
    avgVolume: 1_000_000 + Math.random() * 5_000_000,
  }));
}

// 🎯 Clean recommendation mapping (replaces Buy Early / Breakout)
function getCleanRecommendation(row) {
  if (row.triggerScore > 80 && row.asymmetryScore > 70) {
    return {
      label: "STRONG BUY",
      reason: "Momentum + asymmetry + confirmation",
    };
  }

  if (row.triggerScore > 65) {
    return {
      label: "BUY",
      reason: "Setup forming with positive momentum",
    };
  }

  if (row.triggerScore > 50) {
    return {
      label: "WATCH",
      reason: "Close but needs confirmation",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup or poor quality",
  };
}

export default async function handler(req, res) {
  try {
    // ✅ STEP 1 — BUILD REAL UNIVERSE
    const fullUniverse = await buildRawListedUniverse();

    // Only symbols
    const symbols = fullUniverse.map((x) => x.symbol);

    // ✅ STEP 2 — GET MARKET DATA
    const snapshots = await getSnapshots(symbols);

    // ✅ STEP 3 — FILTER (liquidity + quality floor)
    const tradable = applyLiquidityFilter(
      fullUniverse,
      snapshots,
      {
        minPrice: 5,
        minMarketCap: 300_000_000,
        minAvgVolume: 750_000,
      }
    );

    // ✅ STEP 4 — SCORE
    const scored = tradable.map((row) => {
      const base = {
        symbol: row.symbol,
        name: row.name,
        price: row.price,
      };

      const technicalSnapshot = buildTechnicalSnapshot(base);
      const fundamentalSnapshot = buildFundamentalSnapshot(base);

      const qualityScore = calcQualityScore(base);
      const asymmetryScore = calcAsymmetryScore(base);
      const triggerScore = calcTriggerScore(base);
      const stage = getStage(base);

      const recommendation = getCleanRecommendation({
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
        technicalSnapshot,
        fundamentalSnapshot,
      };
    });

    // ✅ STEP 5 — RANK
    scored.sort((a, b) => {
      return (
        b.triggerScore - a.triggerScore ||
        b.asymmetryScore - a.asymmetryScore ||
        b.qualityScore - a.qualityScore
      );
    });

    const top = scored.slice(0, 100);

    // ✅ RETURN
    res.status(200).json({
      stocks: top,
      meta: {
        totalUniverse: fullUniverse.length,
        afterInstitutionalFilter: tradable.length,
        afterRankingThreshold: top.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Failed to build screener",
    });
  }
}
