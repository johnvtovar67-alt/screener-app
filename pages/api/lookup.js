import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";

export default function handler(req, res) {
  try {
    const rawSymbol = req.query.symbol || "";
    const symbol = String(rawSymbol).trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const found =
      STOCK_UNIVERSE.find((item) => item.symbol === symbol) ||
      {
        symbol,
        name: symbol,
        price: 50.0,
        dayChangePct: 0.0,
        oneMonthPct: 2.0,
        threeMonthPct: 4.0,
        vs50dPct: 1.0,
        relativeVolume: 1.0,
        volatility: 3.0,
        revenueGrowthPct: 5.0,
        epsGrowthPct: 5.0,
        operatingMarginPct: 10.0,
        debtToEquity: 1.0,
        valuationScore: 55,
        sentimentScoreRaw: 55,
      };

    return res.status(200).json(enrichStock(found));
  } catch (error) {
    return res.status(500).json({
      error: "Lookup failed",
      details: String(error),
    });
  }
}
