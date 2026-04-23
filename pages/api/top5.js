import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

function passesOpportunityFilter(stock) {
  const price = stock.price ?? 0;
  const operatingMargin = stock.operatingMarginPct ?? -99;
  const revenueGrowth = stock.revenueGrowthPct ?? -99;
  const epsGrowth = stock.epsGrowthPct ?? -99;
  const oneMonth = stock.oneMonthPct ?? -99;
  const relativeVolume = stock.relativeVolume ?? 0;

  const tradable = price > 3;
  const hasProfitability = operatingMargin > 0;
  const hasGrowth = revenueGrowth > 0 || epsGrowth > 0;
  const hasMomentum = oneMonth > 2;
  const hasParticipation = relativeVolume >= 0.8;

  return (
    tradable &&
    hasParticipation &&
    (hasProfitability || hasGrowth || hasMomentum)
  );
}

export default function handler(req, res) {
  try {
    const builtUniverse = STOCK_UNIVERSE.map(buildStockFromBase).map(enrichStock);

    const filteredUniverse = builtUniverse.filter(passesOpportunityFilter);

    const ranked = filteredUniverse
      .filter((stock) => (stock.asymmetryScore ?? 0) >= 50)
      .sort((a, b) => {
        const aAsymmetry = a.asymmetryScore ?? 0;
        const bAsymmetry = b.asymmetryScore ?? 0;

        if (bAsymmetry !== aAsymmetry) return bAsymmetry - aAsymmetry;

        const aQuality = a.qualityScore ?? 0;
        const bQuality = b.qualityScore ?? 0;

        if (bQuality !== aQuality) return bQuality - aQuality;

        const aMomentum = a.technicalScore ?? 0;
        const bMomentum = b.technicalScore ?? 0;

        return bMomentum - aMomentum;
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
