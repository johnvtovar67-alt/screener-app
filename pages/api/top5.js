import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

function passesInstitutionalFilter(stock) {
  const price = stock.price ?? 0;
  const volatility = stock.volatility ?? 99;
  const operatingMargin = stock.operatingMarginPct ?? -99;
  const revenueGrowth = stock.revenueGrowthPct ?? -99;
  const epsGrowth = stock.epsGrowthPct ?? -99;
  const oneMonth = stock.oneMonthPct ?? -99;
  const threeMonth = stock.threeMonthPct ?? -99;
  const relativeVolume = stock.relativeVolume ?? 0;
  const debtToEquity = stock.debtToEquity ?? 99;
  const institutionalScore = stock.institutionalScore ?? 0;

  const tradable = price > 5;
  const notTooWild = volatility < 6;
  const profitable = operatingMargin > 5;
  const balanceSheetOK = debtToEquity < 2;
  const hasGrowth = revenueGrowth > 5 || epsGrowth > 10;
  const hasMomentum = oneMonth > 5 && threeMonth > 10;
  const strongParticipation = relativeVolume >= 1.0;
  const institutionalQuality = institutionalScore >= 60;

  return (
    tradable &&
    notTooWild &&
    profitable &&
    balanceSheetOK &&
    strongParticipation &&
    institutionalQuality &&
    (hasGrowth || hasMomentum)
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

        const aInstitutional = a.institutionalScore ?? 0;
        const bInstitutional = b.institutionalScore ?? 0;

        if (bInstitutional !== aInstitutional) {
          return bInstitutional - aInstitutional;
        }

        const aTechnical = a.technicalScore ?? 0;
        const bTechnical = b.technicalScore ?? 0;

        return bTechnical - aTechnical;
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
