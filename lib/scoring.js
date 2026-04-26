export function calcQualityScore(row) {
  let score = 50;

  if (row.marketCap > 1000000000) score += 10;
  if (row.avgVolume > 1000000) score += 10;
  if (row.pe && row.pe > 0 && row.pe < 25) score += 10;
  if (row.eps && row.eps > 0) score += 10;

  return Math.min(score, 100);
}

export function calcAsymmetryScore(row) {
  if (!row.price || !row.yearHigh || !row.yearLow) return 50;

  const upside = (row.yearHigh - row.price) / row.price;
  const downside = (row.price - row.yearLow) / row.price;

  if (downside === 0) return 50;

  const ratio = upside / downside;

  return Math.max(20, Math.min(100, 50 + ratio * 20));
}

export function calcTriggerScore(row) {
  let score = 50;

  if (row.price && row.priceAvg50 && row.price > row.priceAvg50) score += 15;
  if (row.price && row.priceAvg200 && row.price > row.priceAvg200) score += 15;
  if (row.dayChangePct && row.dayChangePct > 1) score += 10;

  return Math.min(score, 100);
}

export function getStage(row) {
  if (row.price > row.priceAvg50 && row.priceAvg50 > row.priceAvg200) {
    return "UPTREND";
  }
  if (row.price < row.priceAvg50 && row.priceAvg50 < row.priceAvg200) {
    return "DOWNTREND";
  }
  return "NEUTRAL";
}

export function getRecommendation(row) {
  const { triggerScore, asymmetryScore, qualityScore } = row;

  if (triggerScore >= 80 && asymmetryScore >= 65 && qualityScore >= 60) {
    return {
      label: "STRONG BUY",
      score: triggerScore + asymmetryScore + qualityScore,
    };
  }

  if (triggerScore >= 65 && asymmetryScore >= 55) {
    return {
      label: "BUY",
      score: triggerScore + asymmetryScore + qualityScore,
    };
  }

  if (triggerScore >= 50) {
    return {
      label: "WATCH",
      score: triggerScore + asymmetryScore + qualityScore,
    };
  }

  return {
    label: "AVOID",
    score: triggerScore + asymmetryScore + qualityScore,
  };
}

export function buildTechnicalSnapshot(row) {
  return {
    trend:
      row.price > row.priceAvg50
        ? "Above 50DMA"
        : "Below 50DMA",
    momentum:
      row.dayChangePct > 1
        ? "Positive"
        : "Flat/Weak",
  };
}

export function buildFundamentalSnapshot(row) {
  return {
    valuation:
      row.pe && row.pe < 20
        ? "Reasonable"
        : "Expensive/Unknown",
    profitability:
      row.eps > 0
        ? "Profitable"
        : "Unprofitable",
  };
}
