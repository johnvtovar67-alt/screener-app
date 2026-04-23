import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

function isUsable(stock) {
  const price = stock?.price ?? 0;
  return price > 1;
}

function rankScore(stock) {
  if (stock?.asymmetryScore != null) return stock.asymmetryScore;
  if (stock?.compositeScore != null) return stock.compositeScore;
  return 0;
}

export default function handler(req, res) {
  try {
    const builtUniverse = STOCK_UNIVERSE.map((base) => buildStockFromBase(base));

    const enrichedUniverse = builtUniverse.map((stock) => enrichStock(stock));

    const filteredUniverse = enrichedUniverse.filter(isUsable);

    const ranked = [...filteredUniverse].sort((a, b) => {
      const bRank = rankScore(b);
      const aRank = rankScore(a);
      if (bRank !== aRank) return bRank - aRank;

      const bQuality = b?.qualityScore ?? 0;
      const aQuality = a?.qualityScore ?? 0;
      if (bQuality !== aQuality) return bQuality - aQuality;

      const bTech = b?.technicalScore ?? 0;
      const aTech = a?.technicalScore ?? 0;
      return bTech - aTech;
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
