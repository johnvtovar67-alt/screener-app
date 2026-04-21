import { STOCK_UNIVERSE } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";
import { buildStockFromBase } from "../../lib/universeBuilder";

export default function handler(req, res) {
  try {
    const rawSymbol = req.query.symbol || "";
    const symbol = String(rawSymbol).trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const foundBase =
      STOCK_UNIVERSE.find((item) => item.symbol === symbol) || {
        symbol,
        name: symbol,
        bucket: "sub25",
      };

    return res.status(200).json(enrichStock(buildStockFromBase(foundBase)));
  } catch (error) {
    return res.status(500).json({
      error: "Lookup failed",
      details: String(error),
    });
  }
}
