function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function pctDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

/* ======================
   CORE SCORES
====================== */

export function calcQualityScore(d) {
  let score = 0;

  const revenueGrowth = d?.revenueGrowthYoy ?? d?.revenueGrowthPct ?? null;
  const epsGrowth = d?.epsGrowthPct ?? null;
  const operatingMargin = d?.operatingMarginPct ?? null;
  const grossMargin = d?.grossMargin ?? null;
  const currentRatio = d?.currentRatio ?? null;
  const debtToEquity = d?.debtToEquity ?? null;
  const institutional = d?.institutionalOwnershipPct ?? d?.institutionalScore ?? null;

  if (revenueGrowth != null) {
    if (revenueGrowth > 20) score += 20;
    else if (revenueGrowth > 10) score += 15;
    else if (revenueGrowth > 0) score += 8;
  }

  if (epsGrowth != null) {
    if (epsGrowth > 20) score += 18;
    else if (epsGrowth > 10) score += 12;
    else if (epsGrowth > 0) score += 6;
  }

  const marginRef = grossMargin ?? operatingMargin;
  if (marginRef != null) {
    if (marginRef > 40) score += 18;
    else if (marginRef > 20) score += 12;
    else if (marginRef > 0) score += 6;
  }

  if (currentRatio != null) {
    if (currentRatio > 1.5) score += 14;
    else if (currentRatio > 1.1) score += 10;
    else if (currentRatio > 0.9) score += 6;
  } else if (debtToEquity != null) {
    if (debtToEquity < 0.5) score += 14;
    else if (debtToEquity < 1.0) score += 10;
    else if (debtToEquity < 2.0) score += 6;
  }

  if (institutional != null) {
    if (institutional > 20 && institutional < 80) score += 12;
    else score += 6;
  }

  return Math.round(clamp(score));
}

function scoreMomentum(d) {
  let score = 0;

  const oneMonthPct = toNumber(d?.oneMonthPct, 0);
  const threeMonthPct = toNumber(d?.threeMonthPct, 0);
  const relativeVolume = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (oneMonthPct > 15) score += 28;
  else if (oneMonthPct > 8) score += 20;
  else if (oneMonthPct > 3) score += 10;

  if (threeMonthPct > 25) score += 20;
  else if (threeMonthPct > 12) score += 14;
  else if (threeMonthPct > 5) score += 8;

  if (relativeVolume >= 1.8) score += 18;
  else if (relativeVolume >= 1.3) score += 12;
  else if (relativeVolume >= 1.0) score += 6;

  return Math.round(clamp(score));
}

function scoreDiscovery(d) {
  let score = 0;

  const marketCap = d?.marketCap ?? null;
  const bucket = (d?.bucket || "").toLowerCase();

  if (marketCap != null) {
    if (marketCap < 2e9) score += 30;
    else if (marketCap < 5e9) score += 22;
    else if (marketCap < 10e9) score += 12;
  } else {
    if (bucket === "sub25" || bucket === "event" || bucket === "space_quantum") {
      score += 18;
    } else if (bucket === "growth" || bucket === "ai_crypto") {
      score += 10;
    }
  }

  return Math.round(clamp(score));
}

function scoreNarrative(d) {
  const bucket = (d?.bucket || "").toLowerCase();
  const name = (d?.name || "").toLowerCase();
  const symbol = (d?.symbol || "").toLowerCase();

  let score = 20;

  if (bucket === "ai_crypto") score = 95;
  else if (bucket === "space_quantum") score = 88;
  else if (bucket === "sub25") score = 78;
  else if (bucket === "event") score = 75;
  else if (bucket === "growth") score = 60;
  else if (bucket === "quality") score = 35;

  if (
    name.includes("ai") ||
    symbol === "soun" ||
    symbol === "bbai" ||
    symbol === "pltr" ||
    symbol === "ai"
  ) {
    score = Math.max(score, 92);
  }

  if (
    symbol === "mara" ||
    symbol === "riot" ||
    symbol === "clsk" ||
    symbol === "wulf" ||
    symbol === "coin"
  ) {
    score = Math.max(score, 95);
  }

  if (
    symbol === "asts" ||
    symbol === "rklb" ||
    symbol === "joby" ||
    symbol === "achr" ||
    name.includes("space") ||
    name.includes("satellite")
  ) {
    score = Math.max(score, 86);
  }

  return score;
}

function scoreExpansion(d) {
  let score = 0;

  const volatility = toNumber(d?.volatility ?? d?.atrPct, 0);
  const relativeVolume = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (volatility >= 3 && volatility <= 8) score += 24;
  else if (volatility > 8) score += 14;
  else if (volatility >= 2) score += 8;

  if (relativeVolume >= 1.8) score += 20;
  else if (relativeVolume >= 1.3) score += 14;
  else if (relativeVolume >= 1.0) score += 8;

  return Math.round(clamp(score));
}

export function calcAsymmetryScore(d) {
  const raw =
    scoreMomentum(d) * 0.28 +
    scoreDiscovery(d) * 0.18 +
    scoreNarrative(d) * 0.30 +
    scoreExpansion(d) * 0.14 +
    calcQualityScore(d) * 0.10;

  return Math.round(clamp(raw));
}

export function getStage(d) {
  const price = d?.price ?? null;
  const sma20 = d?.sma20 ?? null;
  const sma50 = d?.sma50 ?? null;
  const sma200 = d?.sma200 ?? null;
  const oneMonthPct = toNumber(d?.oneMonthPct, 0);
  const relativeVolume = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (price == null) return "Base";

  if (sma50 != null && price < sma50 && oneMonthPct < 0) return "Broken";

  if (
    sma20 != null &&
    sma50 != null &&
    price > sma20 &&
    price > sma50 &&
    relativeVolume >= 1.3 &&
    oneMonthPct > 5
  ) {
    return "Emerging";
  }

  if (
    sma20 != null &&
    sma50 != null &&
    sma200 != null &&
    price > sma20 &&
    price > sma50 &&
    price > sma200 &&
    oneMonthPct > 15
  ) {
    return "Extended";
  }

  return "Base";
}

export function calcTriggerScore(d) {
  let score = 0;

  const oneMonthPct = toNumber(d?.oneMonthPct, 0);
  const threeMonthPct = toNumber(d?.threeMonthPct, 0);
  const relativeVolume = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);
  const volatility = toNumber(d?.volatility ?? d?.atrPct, 0);
  const stage = getStage(d);
  const asymmetry = calcAsymmetryScore(d);

  if (stage === "Emerging") score += 40;
  else if (stage === "Extended") score += 20;
  else if (stage === "Base") score += 6;

  if (relativeVolume >= 1.8) score += 24;
  else if (relativeVolume >= 1.3) score += 18;
  else if (relativeVolume >= 1.0) score += 10;

  if (oneMonthPct > 15) score += 16;
  else if (oneMonthPct > 8) score += 12;
  else if (oneMonthPct > 3) score += 6;

  if (threeMonthPct > 25) score += 8;
  else if (threeMonthPct > 10) score += 5;

  if (volatility >= 3 && volatility <= 8) score += 8;
  else if (volatility > 8) score += 4;

  score += Math.round(asymmetry * 0.10);

  return Math.round(clamp(score));
}

/* ======================
   DISPLAY HELPERS
====================== */

export function getRecommendation(d) {
  const trigger = d?.triggerScore ?? calcTriggerScore(d);
  const asymmetry = d?.asymmetryScore ?? calcAsymmetryScore(d);
  const stage = d?.stage || getStage(d);

  if (trigger >= 72 && asymmetry >= 58 && stage === "Emerging") {
    return {
      label: "Buy Now",
      color: "green",
      reason: "Timing is active and upside profile is strong.",
    };
  }

  if (trigger >= 60 && asymmetry >= 52) {
    return {
      label: "Buy on Breakout",
      color: "yellow",
      reason: "Interesting setup, but needs confirmation.",
    };
  }

  if (trigger >= 50 && asymmetry >= 45) {
    return {
      label: "Watch",
      color: "yellow",
      reason: "Worth tracking, but not actionable yet.",
    };
  }

  return {
    label: "Avoid",
    color: "red",
    reason: "Timing or upside profile is not good enough.",
  };
}

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

export function buildTechnicalSnapshot(d) {
  const price = d?.price ?? null;
  const sma20 = d?.sma20 ?? null;
  const sma50 = d?.sma50 ?? null;
  const sma200 = d?.sma200 ?? null;

  return {
    oneMonthPct: toNumber(d?.oneMonthPct, 0),
    threeMonthPct: toNumber(d?.threeMonthPct, 0),
    relativeVolume: toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0),
    rsi: d?.rsi14 ?? null,
    macd: d?.macd ?? null,
    macdSignal: d?.macdSignal ?? null,
    above20dma: sma20 != null && price != null ? price > sma20 : null,
    above50dma: sma50 != null && price != null ? price > sma50 : null,
    above200dma: sma200 != null && price != null ? price > sma200 : null,
    pctFrom20dma: pctDiff(price, sma20),
    pctFrom50dma: pctDiff(price, sma50),
    pctFrom200dma: pctDiff(price, sma200),
  };
}

export function buildFundamentalSnapshot(d) {
  return {
    revenueGrowthPct: toNumber(d?.revenueGrowthPct, 0),
    epsGrowthPct: toNumber(d?.epsGrowthPct, 0),
    operatingMarginPct: toNumber(d?.operatingMarginPct, 0),
    grossMargin: d?.grossMargin ?? null,
    debtToEquity: d?.debtToEquity ?? null,
    marketCap: d?.marketCap ?? null,
    institutionalScore: d?.institutionalScore ?? null,
  };
}

function buildDrivers(
  d,
  technicalScore,
  fundamentalScore,
  sentimentScore,
  triggerScore
) {
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
        color:
          technicalScore >= 75 ? "green" : technicalScore < 55 ? "red" : "yellow",
      },
      {
        label: "Relative Volume",
        display: `${toNumber(d?.relativeVolume, 0).toFixed(2)}x`,
        note:
          toNumber(d?.relativeVolume, 0) >= 1.2
            ? "Healthy participation"
            : "Average participation",
        score: triggerScore,
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
        label: "Trigger Score",
        display: `${triggerScore}/100`,
        note:
          triggerScore >= 70
            ? "Timing setup is live"
            : triggerScore >= 50
            ? "Setup is building"
            : "No timing confirmation yet",
        score: triggerScore,
        color: triggerScore >= 70 ? "green" : triggerScore < 50 ? "red" : "yellow",
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
  const triggerScore = calcTriggerScore(stock);
  const stage = getStage(stock);

  const compositeScore = Math.round(
    clamp(
      asymmetryScore * 0.40 +
        triggerScore * 0.35 +
        qualityScore * 0.15 +
        technicalScore * 0.05 +
        sentimentScore * 0.05
    )
  );

  const compositeColor = compositeColorFromScore(compositeScore);
  const recommendation = getRecommendation({
    ...stock,
    triggerScore,
    asymmetryScore,
    stage,
  });

  return {
    ...stock,
    technicalScore,
    fundamentalScore,
    sentimentScore,
    valuationScore,
    qualityScore,
    asymmetryScore,
    triggerScore,
    compositeScore,
    compositeColor,
    actionLabel: recommendation.label,
    actionColor: recommendation.color,
    actionReason: recommendation.reason,
    recommendation,
    stage,
    technicalSnapshot: buildTechnicalSnapshot(stock),
    fundamentalSnapshot: buildFundamentalSnapshot(stock),
    drivers: buildDrivers(
      stock,
      technicalScore,
      fundamentalScore,
      sentimentScore,
      triggerScore
    ),
  };
}
