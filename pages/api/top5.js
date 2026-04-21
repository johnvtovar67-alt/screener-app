import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";

export default function handler(req, res) {
  try {
    const ranked = STOCK_UNIVERSE.map(enrichStock)
      .filter((stock) => (stock.compositeScore ?? 0) >= 55)
      .sort((a, b) => {
        const aComposite = a.compositeScore ?? 0;
        const bComposite = b.compositeScore ?? 0;

        if (bComposite !== aComposite) return bComposite - aComposite;

        const aTechnical = a.technicalScore ?? 0;
        const bTechnical = b.technicalScore ?? 0;

        return bTechnical - aTechnical;
      });

    return res.status(200).json({
      stocks: ranked,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load opportunity universe",
      details: String(error),
    });
  }
}
