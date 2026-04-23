import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

export default function handler(req, res) {
  try {
    const built = STOCK_UNIVERSE.map(buildStockFromBase);
    const enriched = built.map(enrichStock);

    const ranked = enriched.sort((a, b) => {
      if (b.triggerScore !== a.triggerScore)
        return b.triggerScore - a.triggerScore;

      if (b.asymmetryScore !== a.asymmetryScore)
        return b.asymmetryScore - a.asymmetryScore;

      return b.qualityScore - a.qualityScore;
    });

    res.status(200).json({
      stocks: ranked,
      meta: {
        totalUniverse: built.length,
        afterInstitutionalFilter: built.length,
        afterRankingThreshold: ranked.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Failed", details: String(e) });
  }
}
