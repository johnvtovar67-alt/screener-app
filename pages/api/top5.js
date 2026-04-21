import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

function passesInstitutionalFilter(stock) {
  const price = stock.price ?? 0;
  const volatility = stock.volatility ?? 99;
  const operatingMargin = stock.operatingMarginPct ?? -99;
  const revenueGrowth = stock.revenueGrowthPct ?? -99;
  const oneMonth = stock.oneMonthPct ?? -99;
  const relativeVolume = stock.relativeVolume ?? 0;

  const tradable = price > 3;
  const notTooWild = volatility < 8;
  const notBroken = operatingMargin > -10;
  const hasBusinessOrTapeSupport = revenueGrowth > 0 || oneMonth > 5;
  const hasEnoughParticipation = relativeVolume >= 0.85;

  return (
    tradable &&
    notTooWild &&
    notBroken &&
    hasBusinessOrTapeSupport &&
    hasEnoughParticipation
  );
}

export default function handler(req, res) {
  try {
    const builtUniverse = STOCK_UNIVERSE.map(buildStockFromBase).map(enrichStock);

    const filteredUniverse = builtUniverse.filter(passesInstitutionalFilter);

    const ranked = filteredUniverse
      .filter((stock) => (stock.compositeScore ?? 0) >= 55)
      .sort((a, b) => {
        const aComposite = a.compositeScore ?? 0;
        const bComposite = b.compositeScore ?? 0;

        if (bComposite !== aComposite) return bComposite - aComposite;

        const aTechnical = a.technicalScore ?? 0;
        const bTechnical = b.technicalScore ?? 0;

        if (bTechnical !== aTechnical) return bTechnical - aTechnical;

        const aFundamental = a.fundamentalScore ?? 0;
        const bFundamental = b.fundamentalScore ?? 0;

        return bFundamental - aFundamental;
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
