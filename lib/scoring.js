import { scoreColor } from "./formatters";

function weightedAverage(items) {
  const valid = items.filter(
    (item) => Number.isFinite(item.score) && Number.isFinite(item.weight)
  );

  if (!valid.length) return 50;

  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 50;

  const total = valid.reduce((sum, item) => sum + item.score * item.weight, 0);
  return Math.round(total / totalWeight);
}

function bucketScore(value, greenMin, yellowMin) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { score: 55, color: "yellow", note: "Mixed" };
  }

  if (value >= greenMin) {
    return { score: 85, color: "green", note: "Helping" };
  }

  if (value >= yellowMin) {
    return { score: 55, color: "yellow", note: "Mixed" };
  }

  return { score: 25, color: "red", note: "Hurting" };
}

function reverseBucketScore(value, greenMax, yellowMax) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { score: 55, color: "yellow", note: "Mixed" };
  }

  if (value <= greenMax) {
    return { score: 85, color: "green", note: "Helping" };
  }

  if (value <= yellowMax) {
    return { score: 55, color: "yellow", note: "Mixed" };
  }

  return { score: 25, color: "red", note: "Hurting" };
}

export function buildDrivers(stock) {
  const technicalDrivers = [
    {
      label: "1M Momentum",
      value: stock.oneMonthPct,
      display:
        stock.oneMonthPct === null || stock.oneMonthPct === undefined
          ? "—"
          : `${stock.oneMonthPct > 0 ? "+" : ""}${stock.oneMonthPct.toFixed(2)}%`,
      ...bucketScore(stock.oneMonthPct, 8, 0),
    },
    {
      label: "3M Momentum",
      value: stock.threeMonthPct,
      display:
        stock.threeMonthPct === null || stock.threeMonthPct === undefined
          ? "—"
          : `${stock.threeMonthPct > 0 ? "+" : ""}${stock.threeMonthPct.toFixed(2)}%`,
      ...bucketScore(stock.threeMonthPct, 15, 3),
    },
    {
      label: "Vs 50D Avg",
      value: stock.vs50dPct,
      display:
        stock.vs50dPct === null || stock.vs50dPct === undefined
          ? "—"
          : `${stock.vs50dPct > 0 ? "+" : ""}${stock.vs50dPct.toFixed(2)}%`,
      ...bucketScore(stock.vs50dPct, 4, -2),
    },
    {
      label: "Relative Volume",
      value: stock.relativeVolume,
      display:
        stock.relativeVolume === null || stock.relativeVolume === undefined
          ? "—"
          : `${stock.relativeVolume.toFixed(2)}x`,
      ...bucketScore(stock.relativeVolume, 1.2, 0.9),
    },
    {
      label: "Volatility",
      value: stock.volatility,
      display:
        stock.volatility === null || stock.volatility === undefined
          ? "—"
          : `${stock.volatility.toFixed(2)}%`,
      ...reverseBucketScore(stock.volatility, 2.5, 4.5),
    },
  ];

  const fundamentalDrivers = [
    {
      label: "Revenue Growth",
      value: stock.revenueGrowthPct,
      display:
        stock.revenueGrowthPct === null || stock.revenueGrowthPct === undefined
          ? "—"
          : `${stock.revenueGrowthPct > 0 ? "+" : ""}${stock.revenueGrowthPct.toFixed(2)}%`,
      ...bucketScore(stock.revenueGrowthPct, 10, 2),
    },
    {
      label: "EPS Growth",
      value: stock.epsGrowthPct,
      display:
        stock.epsGrowthPct === null || stock.epsGrowthPct === undefined
          ? "—"
          : `${stock.epsGrowthPct > 0 ? "+" : ""}${stock.epsGrowthPct.toFixed(2)}%`,
      ...bucketScore(stock.epsGrowthPct, 12, 0),
    },
    {
      label: "Operating Margin",
      value: stock.operatingMarginPct,
      display:
        stock.operatingMarginPct === null ||
        stock.operatingMarginPct === undefined
          ? "—"
          : `${stock.operatingMarginPct.toFixed(2)}%`,
      ...bucketScore(stock.operatingMarginPct, 15, 7),
    },
    {
      label: "Debt / Equity",
      value: stock.debtToEquity,
      display:
        stock.debtToEquity === null || stock.debtToEquity === undefined
          ? "—"
          : `${stock.debtToEquity.toFixed(2)}x`,
      ...reverseBucketScore(stock.debtToEquity, 0.7, 1.5),
    },
    {
      label: "Valuation",
      value: stock.valuationScore,
      display:
        stock.valuationScore === null || stock.valuationScore === undefined
          ? "—"
          : `${stock.valuationScore}/100`,
      ...bucketScore(stock.valuationScore, 70, 45),
    },
  ];

  const sentimentDrivers = [
    {
      label: "Daily Price Action",
      value: stock.dayChangePct,
      display:
        stock.dayChangePct === null || stock.dayChangePct === undefined
          ? "—"
          : `${stock.dayChangePct > 0 ? "+" : ""}${stock.dayChangePct.toFixed(2)}%`,
      ...bucketScore(stock.dayChangePct, 1.0, -1.0),
    },
    {
      label: "Participation",
      value: stock.relativeVolume,
      display:
        stock.relativeVolume === null || stock.relativeVolume === undefined
          ? "—"
          : `${stock.relativeVolume.toFixed(2)}x`,
      ...bucketScore(stock.relativeVolume, 1.15, 0.9),
    },
    {
      label: "News / Tone",
      value: stock.sentimentScoreRaw,
      display:
        stock.sentimentScoreRaw === null || stock.sentimentScoreRaw === undefined
          ? "—"
          : `${stock.sentimentScoreRaw}/100`,
      ...bucketScore(stock.sentimentScoreRaw, 70, 45),
    },
  ];

  const technicalScore = weightedAverage([
    { score: technicalDrivers[0].score, weight: 0.2 },
    { score: technicalDrivers[1].score, weight: 0.25 },
    { score: technicalDrivers[2].score, weight: 0.2 },
    { score: technicalDrivers[3].score, weight: 0.2 },
    { score: technicalDrivers[4].score, weight: 0.15 },
  ]);

  const fundamentalScore = weightedAverage([
    { score: fundamentalDrivers[0].score, weight: 0.2 },
    { score: fundamentalDrivers[1].score, weight: 0.25 },
    { score: fundamentalDrivers[2].score, weight: 0.2 },
    { score: fundamentalDrivers[3].score, weight: 0.15 },
    { score: fundamentalDrivers[4].score, weight: 0.2 },
  ]);

  const sentimentScore = weightedAverage([
    { score: sentimentDrivers[0].score, weight: 0.35 },
    { score: sentimentDrivers[1].score, weight: 0.3 },
    { score: sentimentDrivers[2].score, weight: 0.35 },
  ]);

  const compositeScore = weightedAverage([
    { score: technicalScore, weight: 0.4 },
    { score: fundamentalScore, weight: 0.45 },
    { score: sentimentScore, weight: 0.15 },
  ]);

  return {
    technicalScore,
    fundamentalScore,
    sentimentScore,
    compositeScore,
    compositeColor: scoreColor(compositeScore),
    drivers: {
      technical: technicalDrivers,
      fundamental: fundamentalDrivers,
      sentiment: sentimentDrivers,
    },
  };
}

export function enrichStock(stock) {
  const scoring = buildDrivers(stock);

  return {
    ...stock,
    ...scoring,
  };
}
