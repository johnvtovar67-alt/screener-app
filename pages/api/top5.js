import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

function isUsable(stock) {
  const price = stock?.price ?? 0;
  return price > 1;
}

export default function handler(req, res) {
  try {
    const builtUniverse = STOCK_UNIVERSE.map((base) => buildStockFromBase(base));
    const enrichedUniverse = builtUniverse.map((stock) => enrichStock(stock));
    const filteredUniverse = enrichedUniverse.filter(isUsable);

    const ranked = [...filteredUniverse].sort((a, b) => {
      const triggerDiff = (b?.triggerScore ?? 0) - (a?.triggerScore ?? 0);
      if (triggerDiff !== 0) return triggerDiff;

      const asymmetryDiff = (b?.asymmetryScore ?? 0) - (a?.asymmetryScore ?? 0);
      if (asymmetryDiff !== 0) return asymmetryDiff;

      return (b?.qualityScore ?? 0) - (a?.qualityScore ?? 0);
    });

    return res.status(200).json({
      stocks: ranked,
      meta: {
        totalUniverse: builtUniverse.length,
        afterInstitutionalFilter: filteredUniverse.length,
        afterRankingThreshold: ranked.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load opportunity universe",
      details: String(error),
    });
  }
}
