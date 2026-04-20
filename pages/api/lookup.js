import { TOP5_STOCKS } from "../../data/top5";
import { enrichStock } from "../../lib/scoring";

const LOOKUP_LIBRARY = [
  ...TOP5_STOCKS,
  {
    symbol: "AAPL",
    name: "Apple",
    price: 214.38,
    dayChangePct: 0.72,
    oneMonthPct: 5.4,
    threeMonthPct: 11.7,
    vs50dPct: 3.6,
    relativeVolume: 1.04,
    volatility: 1.8,
    revenueGrowthPct: 6.1,
    epsGrowthPct: 9.8,
    operatingMarginPct: 31.5,
    debtToEquity: 1.47,
    valuationScore: 48,
    sentimentScoreRaw: 66,
  },
  {
    symbol: "MSTR",
    name: "Strategy",
    price: 1682.44,
    dayChangePct: 2.41,
    oneMonthPct: 18.9,
    threeMonthPct: 38.7,
    vs50dPct: 12.4,
    relativeVolume: 1.56,
    volatility: 5.9,
    revenueGrowthPct: 3.5,
    epsGrowthPct: -4.2,
    operatingMarginPct: 9.4,
    debtToEquity: 0.41,
    valuationScore: 22,
    sentimentScoreRaw: 81,
  },
  {
    symbol: "PLTR",
    name: "Palantir",
    price: 31.76,
    dayChangePct: 1.08,
    oneMonthPct: 14.1,
    threeMonthPct: 27.2,
    vs50dPct: 9.6,
    relativeVolume: 1.29,
    volatility: 3.7,
    revenueGrowthPct: 20.2,
    epsGrowthPct: 35.7,
    operatingMarginPct: 12.5,
    debtToEquity: 0.09,
    valuationScore: 28,
    sentimentScoreRaw: 73,
  },
  {
    symbol: "SHOP",
    name: "Shopify",
    price: 82.43,
    dayChangePct: -0.34,
    oneMonthPct: 8.7,
    threeMonthPct: 16.9,
    vs50dPct: 5.9,
    relativeVolume: 1.11,
    volatility: 3.2,
    revenueGrowthPct: 23.8,
    epsGrowthPct: 41.1,
    operatingMarginPct: 10.3,
    debtToEquity: 0.12,
    valuationScore: 36,
    sentimentScoreRaw: 62,
  },
  {
    symbol: "GCT",
    name: "GigaCloud Technology",
    price: 27.95,
    dayChangePct: 0.53,
    oneMonthPct: 11.3,
    threeMonthPct: 22.4,
    vs50dPct: 7.2,
    relativeVolume: 1.18,
    volatility: 4.1,
    revenueGrowthPct: 29.2,
    epsGrowthPct: 19.6,
    operatingMarginPct: 9.6,
    debtToEquity: 0.18,
    valuationScore: 84,
    sentimentScoreRaw: 57,
  },
];

export default function handler(req, res) {
  try {
    const rawSymbol = req.query.symbol || "";
    const symbol = String(rawSymbol).trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Missing symbol" });
    }

    const found =
      LOOKUP_LIBRARY.find((item) => item.symbol === symbol) ||
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
