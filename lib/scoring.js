function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/* ======================
   NEW SCORING LAYER
====================== */

export function calcQualityScore(d) {
  let score = 0;

  const revenueGrowthYoy = d?.revenueGrowthYoy ?? d?.revenueGrowthPct ?? null;
  const grossMargin = d?.grossMargin ?? null;
  const currentRatio = d?.currentRatio ?? null;
  const shareDilutionYoy = d?.shareDilutionYoy ?? null;
  const institutionalOwnershipPct =
    d?.institutionalOwnershipPct ?? d?.institutionalScore ?? null;

  if (revenueGrowthYoy != null) {
    if (revenueGrowthYoy > 20) score += 25;
    else if (revenueGrowthYoy > 5) score += 18;
    else if (revenueGrowthYoy > 0) score += 10;
    else score += 4;
  }

  if (grossMargin != null) {
    if (grossMargin > 50) score += 20;
    else if (grossMargin > 30) score += 14;
    else if (grossMargin > 15) score += 8;
  } else {
    const operatingMarginPct = d?.operatingMarginPct ?? null;
    if (operatingMarginPct != null) {
      if (operatingMarginPct > 20) score += 18;
      else if (operatingMarginPct > 10) score += 12;
      else if (operatingMarginPct > 0) score += 6;
    }
  }

  if (currentRatio != null) {
    if (currentRatio > 1.5) score += 20;
    else if (currentRatio > 1.1) score += 14;
    else if (currentRatio > 0.9) score += 8;
  } else {
    const debtToEquity = d?.debtToEquity ?? null;
    if (debtToEquity != null) {
      if (debtToEquity < 0.5) score += 18;
      else if (debtToEquity < 1.0) score += 14;
      else if (debtToEquity < 2.0) score += 8;
      else score += 2;
    }
  }

  if (shareDilutionYoy != null) {
    if (shareDilutionYoy < 3) score += 15;
    else if (shareDilutionYoy < 8) score += 10;
    else if (shareDilutionYoy < 15) score += 5;
  }

  if (institutionalOwnershipPct != null) {
    if (institutionalOwnershipPct > 20 && institutionalOwnershipPct < 80) {
      score += 20;
    } else {
      score += 10;
    }
  }

  return Math.round(clamp(score));
}

function scoreMomentum(d) {
  let score = 0;

  const return20d = d?.return20d ?? ((d?.oneMonthPct ?? 0) / 100);
  const return50d = d?.return50d ?? ((d?.threeMonthPct ?? 0) / 100);
  const price = d?.price ?? null;
  const sma20 = d?.sma20 ?? null;
  const sma50 = d?.sma50 ?? null;
  const relativeVolume20d = d?.relativeVolume20d ?? d?.relativeVolume ?? null;

  if (return20d != null) score += Math.min(return20d * 200, 30);
  if (return50d != null) score += Math.min(return50d * 150, 20);

  if (sma20 != null && price != null && price > sma20) score += 10;
  if (sma50 != null && price != null && price > sma50) score += 10;

  if (relativeVolume20d != null) {
    score += Math.min(relativeVolume20d, 2) * 10;
  }

  if (price != null && sma20 != null && sma20 > 0) {
    const extensionPct = ((price - sma20) / sma20) * 100;
    if (extensionPct > 18) score -= 8;
    else if (extensionPct > 12) score -= 4;
  }

  return clamp(score);
}

function scoreDiscovery(d) {
  let score = 0;

  const marketCap = d?.marketCap ?? null;
  const institutionalOwnershipPct =
    d?.institutionalOwnershipPct ?? d?.institutionalScore ?? null;

  if (marketCap != null) {
    if (marketCap < 2e9) score += 30;
    else if (marketCap < 5e9) score += 20;
    else if (marketCap < 10e9) score += 10;
  }

  if (institutionalOwnershipPct != null) {
    if (institutionalOwnershipPct < 40) score += 30;
    else if (institutionalOwnershipPct < 70) score += 15;
  }

  return clamp(score);
}

function scoreNarrative(d) {
  const tags = Array.isArray(d?.themeTags) ? d.themeTags : [];

  if (tags.includes("ai")) return 100;
  if (tags.includes("bitcoin")) return 95;
  if (tags.includes("crypto")) return 90;
  if (tags.includes("miner")) return 90;
  if (tags.includes("defense")) return 85;

  return 30;
}

function scoreExpansion(d) {
  let score = 0;

  const atrPct = d?.atrPct ?? d?.volatility ?? null;
  const rangeExpansion = d?.rangeExpansion ?? null;

  if (atrPct != null) {
    if (atrPct > 4 && atrPct < 10) score += 40;
    else if (atrPct >= 10) score += 25;
    else if (atrPct >= 2) score += 12;
  }

  if (rangeExpansion != null) {
    score += Math.min(rangeExpansion * 20, 30);
  } else {
    const relativeVolume = d?.relativeVolume ?? null;
    if (relativeVolume != null) {
      score += Math.min(relativeVolume * 10, 20);
    }
  }

  return clamp(score);
}

export function calcAsymmetryScore(d) {
  const raw =
    scoreMomentum(d) * 0.35 +
    scoreDiscovery(d) * 0.20 +
    scoreNarrative(d) * 0.15 +
    scoreExpansion(d) * 0.15 +
    calcQualityScore(d) * 0.15;

  return Math.round(clamp(raw));
}

export function getStage(d) {
  const price = d?.price ?? null;
  const sma20 = d?.sma20 ?? null;
  const sma50 = d?.sma50 ?? null;
  const relativeVolume20d = d?.relativeVolume20d ?? d?.relativeVolume ?? 0;
  const return20d = d?.return20d ?? ((d?.oneMonthPct ?? 0) / 100);

  if (price == null) return "Base";

  if (sma50 != null && price < sma50) return "Broken";

  if (sma20 != null && price > sma20 && relativeVolume20d > 1.3) {
    return "Emerging";
  }

  if (sma20 != null && price > sma20 && return20d > 0.15) {
    return "Extended";
  }

  return "Base";
}

/* ======================
   LEGACY-COMPATIBLE LAYER
====================== */

function scoreTechnical(d) {
  let score = 0;

  const oneMonthPct = toNumber(d?.oneMonthPct, 0);
  const threeMonthPct = toNumber(d?.threeMonthPct, 0);
  const relativeVolume = toNumber(d?.relativeVolume, 0);
  const volatility = toNumber(d?.volatility, 0);

  if (oneMonthPct > 15) score += 30;
  else if (oneMonthPct > 8) score += 22;
  else if (oneMonthPct > 3) score += 14;

  if (threeMonthPct > 25) score += 25;
  else if (threeMonthPct > 15) score += 18;
  else if (threeMonthPct > 8) score += 10;

  if (relativeVolume >= 1.8) score += 20;
  else if (relativeVolume >= 1.2) score += 14;
  else if (relativeVolume >= 1.0) score += 8;

  if (volatility > 0 && volatility < 4) score += 15;
  else if (volatility < 6) score += 10;
  else if (volatility < 8) score += 5;

  return Math.round(clamp(score));
}

function scoreFundamental(d) {
  let score = 0;

  const revenueGrowthPct = toNumber(d?.revenueGrowthPct, 0);
  const epsGrowthPct = toNumber(d?.epsGrowthPct, 0);
  const operatingMarginPct = toNumber(d?.operatingMarginPct, 0);
  const debtToEquity = toNumber(d?.debtToEquity, 99);

  if (revenueGrowthPct > 20) score += 25;
  else if (revenueGrowthPct > 10) score += 18;
  else if (revenueGrowthPct > 3) score += 10;

  if (epsGrowthPct > 25) score += 25;
  else if (epsGrowthPct > 10) score += 18;
  else if (epsGrowthPct > 0) score += 10;

  if (operatingMarginPct > 20) score += 25;
  else if (operatingMarginPct > 10) score += 18;
  else if (operatingMarginPct > 0) score += 10;

  if (debtToEquity < 0.5) score += 15;
  else if (debtToEquity < 1.0) score += 10;
  else if (debtToEquity < 2.0) score += 5;

  return Math.round(clamp(score));
}

function scoreSentiment(d) {
  let score = 0;

  const relativeVolume = toNumber(d?.relativeVolume, 0);
  const oneMonthPct = toNumber(d?.oneMonthPct, 0);
  const institutionalScore = toNumber(d?.institutionalScore, 0);

  if (relativeVolume >= 1.8) score += 35;
  else if (relativeVolume >= 1.2) score += 25;
  else if (relativeVolume >= 1.0) score += 12;

  if (oneMonthPct > 15) score += 35;
  else if (oneMonthPct > 8) score += 25;
  else if (oneMonthPct > 3) score += 10;

  if (institutionalScore >= 80) score += 20;
  else if (institutionalScore >= 60) score += 10;

  return Math.round(clamp(score));
}

function scoreValuation(d) {
  let score = 50;

  const debtToEquity = toNumber(d?.debtToEquity, 99);
  const operatingMarginPct = toNumber(d?.operatingMarginPct, 0);

  if (debtToEquity < 0.5) score += 15;
  else if (debtToEquity < 1.0) score += 8;
  else if (debtToEquity > 2.0) score -= 10;

  if (operatingMarginPct > 15) score += 10;
  else if (operatingMarginPct < 0) score -= 10;

  return Math.round(clamp(score));
}

function compositeColorFromScore(score) {
  if (score >= 80) return "green";
  if (score < 60) return "red";
  return "yellow";
}

function actionFromComposite(score, stage) {
  if (score >= 80 && stage !== "Broken") {
    return {
      actionLabel: "Buy",
      actionColor: "green",
      actionReason: "Strong setup with upside skew and supportive quality floor.",
    };
  }

  if (score >= 60 && stage !== "Broken") {
    return {
      actionLabel: "Watch",
      actionColor: "yellow",
      actionReason: "Interesting setup, but not a full-throttle signal yet.",
    };
  }

  return {
    actionLabel: "Avoid",
    actionColor: "red",
    actionReason: "Weak or broken setup relative to the current screen.",
  };
}

function buildDrivers(d, technicalScore, fundamentalScore, sentimentScore) {
  return {
    technical: [
      {
        label: "1M Momentum",
        display: `${toNumber(d?.oneMonthPct, 0).toFixed(1)}%`,
        note:
          toNumber(d?.oneMonthPct, 0) >= 8
            ? "Strong recent momentum"
            : "Moderate recent move",
        score: technicalScore,
        color: technicalScore >= 75 ? "green" : technicalScore < 55 ? "red" : "yellow",
      },
      {
        label: "Relative Volume",
        display: `${toNumber(d?.relativeVolume, 0).toFixed(2)}x`,
        note:
          toNumber(d?.relativeVolume, 0) >= 1.2
            ? "Healthy participation"
            : "Average participation",
        score: technicalScore,
        color:
          toNumber(d?.relativeVolume, 0) >= 1.2
            ? "green"
            : toNumber(d?.relativeVolume, 0) < 0.9
            ? "red"
            : "yellow",
      },
    ],
    fundamental: [
      {
        label: "Revenue Growth",
        display: `${toNumber(d?.revenueGrowthPct, 0).toFixed(1)}%`,
        note:
          toNumber(d?.revenueGrowthPct, 0) > 10
            ? "Strong top-line growth"
            : "Limited top-line growth",
        score: fundamentalScore,
        color:
          toNumber(d?.revenueGrowthPct, 0) > 10
            ? "green"
            : toNumber(d?.revenueGrowthPct, 0) < 0
            ? "red"
            : "yellow",
      },
      {
        label: "Operating Margin",
        display: `${toNumber(d?.operatingMarginPct, 0).toFixed(1)}%`,
        note:
          toNumber(d?.operatingMarginPct, 0) > 10
            ? "Healthy profitability"
            : "Thin profitability profile",
        score: fundamentalScore,
        color:
          toNumber(d?.operatingMarginPct, 0) > 10
            ? "green"
            : toNumber(d?.operatingMarginPct, 0) < 0
            ? "red"
            : "yellow",
      },
    ],
    sentiment: [
      {
        label: "Institutional",
        display: `${toNumber(d?.institutionalScore, 0)}/100`,
        note:
          toNumber(d?.institutionalScore, 0) >= 70
            ? "Strong sponsorship"
            : "Average sponsorship",
        score: sentimentScore,
        color:
          toNumber(d?.institutionalScore, 0) >= 70
            ? "green"
            : toNumber(d?.institutionalScore, 0) < 50
            ? "red"
            : "yellow",
      },
      {
        label: "EPS Growth",
        display: `${toNumber(d?.epsGrowthPct, 0).toFixed(1)}%`,
        note:
          toNumber(d?.epsGrowthPct, 0) > 10
            ? "Supportive earnings trend"
            : "Muted earnings trend",
        score: sentimentScore,
        color:
          toNumber(d?.epsGrowthPct, 0) > 10
            ? "green"
            : toNumber(d?.epsGrowthPct, 0) < 0
            ? "red"
            : "yellow",
      },
    ],
  };
}

export function enrichStock(stock) {
  const technicalScore = scoreTechnical(stock);
  const fundamentalScore = scoreFundamental(stock);
  const sentimentScore = scoreSentiment(stock);
  const valuationScore = scoreValuation(stock);

  const qualityScore = calcQualityScore(stock);
  const asymmetryScore = calcAsymmetryScore(stock);
  const stage = getStage(stock);

  const compositeScore = Math.round(
    clamp(
      asymmetryScore * 0.65 +
        qualityScore * 0.20 +
        technicalScore * 0.10 +
        sentimentScore * 0.05
    )
  );

  const compositeColor = compositeColorFromScore(compositeScore);
  const { actionLabel, actionColor, actionReason } = actionFromComposite(
    compositeScore,
    stage
  );

  return {
    ...stock,
    technicalScore,
    fundamentalScore,
    sentimentScore,
    valuationScore,
    qualityScore,
    asymmetryScore,
    compositeScore,
    compositeColor,
    actionLabel,
    actionColor,
    actionReason,
    stage,
    drivers: buildDrivers(
      stock,
      technicalScore,
      fundamentalScore,
      sentimentScore
    ),
  };
}
