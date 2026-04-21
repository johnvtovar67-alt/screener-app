import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";

export default function handler(req, res) {
  try {
    const ranked = STOCK_UNIVERSE.map(enrichStock).sort(
      (a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
    );

    return res.status(200).json({
      stocks: ranked.slice(0, 5),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load top 5",
      details: String(error),
    });
  }
}
