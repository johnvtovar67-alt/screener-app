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

export function calcQualityScore(d) {
  let score = 0;

  const rev = toNumber(d?.revenueGrowthPct, 0);
  const eps = toNumber(d?.epsGrowthPct, 0);
  const margin = toNumber(d?.operatingMarginPct, 0);
  const debt = toNumber(d?.debtToEquity, 2);
  const inst = toNumber(d?.institutionalScore, 0);

  if (rev > 20) score += 25;
  else if (rev > 10) score += 18;
  else if (rev > 0) score += 10;

  if (eps > 20) score += 18;
  else if (eps > 10) score += 12;
  else if (eps > 0) score += 6;

  if (margin > 20) score += 18;
  else if (margin > 10) score += 12;
  else if (margin > 0) score += 6;

  if (debt < 0.5) score += 15;
  else if (debt < 1.0) score += 10;
  else if (debt < 2.0) score += 5;

  if (inst > 70) score += 10;
  else if (inst > 55) score += 6;

  return Math.round(clamp(score));
}

function scoreMomentum(d) {
  let score = 0;

  const m1 = toNumber(d?.oneMonthPct, 0);
  const m3 = toNumber(d?.threeMonthPct, 0);
  const vol = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (m1 > 15) score += 28;
  else if (m1 > 8) score += 20;
  else if (m1 > 3) score += 10;

  if (m3 > 25) score += 20;
  else if (m3 > 12) score += 14;
  else if (m3 > 5) score += 8;

  if (vol >= 1.8) score += 18;
  else if (vol >= 1.3) score += 12;
  else if (vol >= 1.0) score += 6;

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
    if (["sub25", "event", "space_quantum"].includes(bucket)) score += 18;
    else if (["growth", "ai_crypto"].includes(bucket)) score += 10;
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
    ["soun", "bbai", "pltr", "ai"].includes(symbol)
  ) {
    score = Math.max(score, 92);
  }

  if (["mara", "riot", "clsk", "wulf", "coin", "iren", "corz", "btbt"].includes(symbol)) {
    score = Math.max(score, 95);
  }

  if (["asts", "rklb", "joby", "achr", "lilm"].includes(symbol) || name.includes("space")) {
    score = Math.max(score, 86);
  }

  return score;
}

function scoreExpansion(d) {
  let score = 0;

  const volatility = toNumber(d?.volatility ?? d?.atrPct, 0);
  const vol = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (volatility >= 3 && volatility <= 8) score += 24;
  else if (volatility > 8) score += 14;
  else if (volatility >= 2) score += 8;

  if (vol >= 1.8) score += 20;
  else if (vol >= 1.3) score += 14;
  else if (vol >= 1.0) score += 8;

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
  const m1 = toNumber(d?.oneMonthPct, 0);
  const vol = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);

  if (price == null) return "Base";

  if (sma50 != null && price < sma50 && m1 < 0) return "Broken";

  if (
    sma20 != null &&
    sma50 != null &&
    price > sma20 &&
    price > sma50 &&
    vol >= 1.3 &&
    m1 > 5
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
    m1 > 15
  ) {
    return "Extended";
  }

  return "Base";
}

export function calcTriggerScore(d) {
  let score = 0;

  const m1 = toNumber(d?.oneMonthPct, 0);
  const m3 = toNumber(d?.threeMonthPct, 0);
  const vol = toNumber(d?.relativeVolume20d ?? d?.relativeVolume, 0);
  const volatility = toNumber(d?.volatility ?? d?.atrPct, 0);
  const stage = getStage(d);
  const asym = calcAsymmetryScore(d);

  if (stage === "Emerging") score += 40;
  else if (stage === "Extended") score += 20;
  else if (stage === "Base") score += 6;

  if (vol >= 1.8) score += 24;
  else if (vol >= 1.3) score += 18;
  else if (vol >= 1.0) score += 10;

  if (m1 > 15) score += 16;
  else if (m1 > 8) score += 12;
  else if (m1 > 3) score += 6;

  if (m3 > 25) score += 8;
  else if (m3 > 10) score += 5;

  if (volatility >= 3 && volatility <= 8) score += 8;
  else if (volatility > 8) score += 4;

  score += Math.round(asym * 0.10);

  return Math.round(clamp(score));
}

export function getRecommendation(d) {
  const trigger = d?.triggerScore ?? calcTriggerScore(d);
  const asym = d?.asymmetryScore ?? calcAsymmetryScore(d);
  const stage = d?.stage || getStage(d);

  if (asym > 50 && trigger > 45) {
    return {
      label: "Buy (Early)",
      color: "green",
      reason: "Asymmetry + early trigger",
    };
  }

  if (trigger > 60) {
    return {
      label: "Buy Breakout",
      color: "green",
      reason: "Momentum confirmed",
    };
  }

  if (asym > 45) {
    return {
      label: "Speculative Buy",
      color: "yellow",
      reason: "High upside, early stage",
    };
  }

  if (trigger > 40) {
    return {
      label: "Watch",
      color: "yellow",
      reason: "Developing setup",
    };
  }

  return {
    label: "Avoid",
    color: "red",
    reason: "Weak setup",
  };
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

function scoreTechnical(d) {
  let score = 0;
  const m1 = toNumber(d?.oneMonthPct, 0);
  const m3 = toNumber(d?.threeMonthPct, 0);
  const vol = toNumber(d?.relativeVolume, 0);
  const volatility = toNumber(d?.volatility, 0);

  if (m1 > 15) score += 30;
  else if (m1 > 8) score += 22;
  else if (m1 > 3) score += 14;

  if (m3 > 25) score += 25;
  else if (m3 > 15) score += 18;
  else if (m3 > 8) score += 10;

  if (vol >= 1.8) score += 20;
  else if (vol >= 1.2) score += 14;
  else if (vol >= 1.0) score += 8;

  if (volatility > 0 && volatility < 4) score += 15;
  else if (volatility < 6) score += 10;
  else if (volatility < 8) score += 5;

  return Math.round(clamp(score));
}

function scoreFundamental(d) {
  let score = 0;
  const rev = toNumber(d?.revenueGrowthPct, 0);
  const eps = toNumber(d?.epsGrowthPct, 0);
  const margin = toNumber(d?.operatingMarginPct, 0);
  const debt = toNumber(d?.debtToEquity, 99);

  if (rev > 20) score += 25;
  else if (rev > 10) score += 18;
  else if (rev > 3) score += 10;

  if (eps > 25) score += 25;
  else if (eps > 10) score += 18;
  else if (eps > 0) score += 10;

  if (margin > 20) score += 25;
  else if (margin > 10) score += 18;
  else if (margin > 0) score += 10;

  if (debt < 0.5) score += 15;
  else if (debt < 1.0) score += 10;
  else if (debt < 2.0) score += 5;

  return Math.round(clamp(score));
}

function scoreSentiment(d) {
  let score = 0;
  const vol = toNumber(d?.relativeVolume, 0);
  const m1 = toNumber(d?.oneMonthPct, 0);
  const inst = toNumber(d?.institutionalScore, 0);

  if (vol >= 1.8) score += 35;
  else if (vol >= 1.2) score += 25;
  else if (vol >= 1.0) score += 12;

  if (m1 > 15) score += 35;
  else if (m1 > 8) score += 25;
  else if (m1 > 3) score += 10;

  if (inst >= 80) score += 20;
  else if (inst >= 60) score += 10;

  return Math.round(clamp(score));
}

function scoreValuation(d) {
  let score = 50;
  const debt = toNumber(d?.debtToEquity, 99);
  const margin = toNumber(d?.operatingMarginPct, 0);

  if (debt < 0.5) score += 15;
  else if (debt < 1.0) score += 8;
  else if (debt > 2.0) score -= 10;

  if (margin > 15) score += 10;
  else if (margin < 0) score -= 10;

  return Math.round(clamp(score));
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
  const recommendation = getRecommendation({
    ...stock,
    qualityScore,
    asymmetryScore,
    triggerScore,
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
    stage,
    recommendation,
    actionLabel: recommendation.label,
    actionColor: recommendation.color,
    actionReason: recommendation.reason,
    technicalSnapshot: buildTechnicalSnapshot(stock),
    fundamentalSnapshot: buildFundamentalSnapshot(stock),
  };
}
