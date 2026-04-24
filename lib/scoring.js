// lib/scoring.js

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function priceSweetSpotScore(price) {
  const p = num(price);
  if (p == null) return 40;

  if (p >= 5 && p <= 25) return 90;
  if (p > 25 && p <= 50) return 65;
  if (p > 50 && p <= 100) return 45;
  if (p >= 3 && p < 5) return 35;
  return 20;
}

function liquidityScore(row) {
  const volume = num(row.avgVolume ?? row.volume);

  if (volume == null) return 45;
  if (volume >= 10_000_000) return 95;
  if (volume >= 5_000_000) return 88;
  if (volume >= 2_000_000) return 78;
  if (volume >= 1_000_000) return 68;
  if (volume >= 500_000) return 58;
  if (volume >= 250_000) return 48;
  return 30;
}

function marketCapScore(row) {
  const marketCap = num(row.marketCap);

  if (marketCap == null) return 45;
  if (marketCap >= 300_000_000 && marketCap <= 5_000_000_000) return 90;
  if (marketCap > 5_000_000_000 && marketCap <= 25_000_000_000) return 72;
  if (marketCap > 25_000_000_000 && marketCap <= 100_000_000_000) return 55;
  if (marketCap > 100_000_000_000) return 40;
  return 25;
}

function valuationScore(row) {
  const pe = num(row.pe);
  const eps = num(row.eps);

  let score = 45;

  if (eps != null) {
    if (eps > 0) score += 18;
    else score -= 18;
  }

  if (pe != null) {
    if (pe > 0 && pe <= 15) score += 22;
    else if (pe > 15 && pe <= 25) score += 16;
    else if (pe > 25 && pe <= 40) score += 8;
    else if (pe > 40 && pe <= 70) score -= 2;
    else if (pe <= 0) score -= 16;
    else score -= 8;
  }

  return clamp(score);
}

function fundamentalScore(row) {
  const revenueGrowth = num(row.revenueGrowthPct);
  const epsGrowth = num(row.epsGrowthPct);
  const operatingMargin = num(row.operatingMarginPct);
  const grossMargin = num(row.grossMargin);
  const debtToEquity = num(row.debtToEquity);

  let score =
    valuationScore(row) * 0.38 +
    marketCapScore(row) * 0.22 +
    liquidityScore(row) * 0.20 +
    priceSweetSpotScore(row.price) * 0.20;

  if (revenueGrowth != null) {
    if (revenueGrowth > 30) score += 12;
    else if (revenueGrowth > 15) score += 8;
    else if (revenueGrowth > 5) score += 4;
    else if (revenueGrowth < 0) score -= 8;
  }

  if (epsGrowth != null) {
    if (epsGrowth > 30) score += 12;
    else if (epsGrowth > 15) score += 8;
    else if (epsGrowth > 5) score += 4;
    else if (epsGrowth < 0) score -= 8;
  }

  if (operatingMargin != null) {
    if (operatingMargin > 20) score += 10;
    else if (operatingMargin > 10) score += 7;
    else if (operatingMargin > 0) score += 4;
    else score -= 10;
  }

  if (grossMargin != null) {
    if (grossMargin > 50) score += 6;
    else if (grossMargin > 30) score += 3;
  }

  if (debtToEquity != null) {
    if (debtToEquity < 0.5) score += 6;
    else if (debtToEquity < 1.5) score += 2;
    else if (debtToEquity > 3) score -= 8;
  }

  return clamp(score);
}

function trendScore(row) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const dayChange = num(row.dayChangePct);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  let score = 45;

  if (price != null && ma50 != null) {
    score += price > ma50 ? 18 : -12;
  }

  if (price != null && ma200 != null) {
    score += price > ma200 ? 18 : -16;
  }

  if (dayChange != null) {
    if (dayChange > 7) score += 18;
    else if (dayChange > 4) score += 14;
    else if (dayChange > 2) score += 9;
    else if (dayChange > 0) score += 5;
    else if (dayChange < -5) score -= 14;
    else if (dayChange < -2) score -= 8;
  }

  if (price != null && yearHigh != null && yearHigh > 0) {
    const pctBelowHigh = ((yearHigh - price) / yearHigh) * 100;

    if (pctBelowHigh <= 10) score += 12;
    else if (pctBelowHigh <= 20) score += 7;
    else if (pctBelowHigh <= 35) score += 2;
    else score -= 6;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const pctAboveLow = ((price - yearLow) / yearLow) * 100;

    if (pctAboveLow > 250) score -= 10;
    else if (pctAboveLow > 150) score -= 5;
  }

  return clamp(score);
}

function asymmetryUpsideScore(row) {
  const price = num(row.price);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  let score =
    priceSweetSpotScore(price) * 0.30 +
    marketCapScore(row) * 0.25 +
    liquidityScore(row) * 0.20 +
    valuationScore(row) * 0.25;

  if (price != null && yearHigh != null && yearHigh > price) {
    const upsideToHigh = ((yearHigh - price) / price) * 100;

    if (upsideToHigh > 100) score += 18;
    else if (upsideToHigh > 60) score += 13;
    else if (upsideToHigh > 35) score += 8;
    else if (upsideToHigh > 15) score += 4;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const aboveLow = ((price - yearLow) / yearLow) * 100;

    if (aboveLow > 250) score -= 10;
    else if (aboveLow > 150) score -= 5;
  }

  return clamp(score);
}

export function calcQualityScore(row = {}) {
  return Math.round(fundamentalScore(row));
}

export function calcAsymmetryScore(row = {}) {
  const score =
    asymmetryUpsideScore(row) * 0.65 +
    priceSweetSpotScore(row.price) * 0.15 +
    liquidityScore(row) * 0.10 +
    fundamentalScore(row) * 0.10;

  return Math.round(clamp(score));
}

export function calcTriggerScore(row = {}) {
  const score =
    trendScore(row) * 0.60 +
    liquidityScore(row) * 0.20 +
    fundamentalScore(row) * 0.20;

  return Math.round(clamp(score));
}

export function getStage(row = {}) {
  const trigger = calcTriggerScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const quality = calcQualityScore(row);

  if (trigger >= 78 && asymmetry >= 70 && quality >= 65) return "Confirmed";
  if (trigger >= 66 && asymmetry >= 60 && quality >= 55) return "Setup";
  if (asymmetry >= 60 && quality >= 50) return "Early";
  if (trigger >= 50 || asymmetry >= 55) return "Watch";
  return "Weak";
}

export function getRecommendation(row = {}) {
  const qualityScore = row.qualityScore ?? calcQualityScore(row);
  const asymmetryScore = row.asymmetryScore ?? calcAsymmetryScore(row);
  const triggerScore = row.triggerScore ?? calcTriggerScore(row);

  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const dayChange = num(row.dayChangePct);
  const eps = num(row.eps);
  const pe = num(row.pe);

  const above50 = price != null && ma50 != null ? price > ma50 : false;
  const above200 = price != null && ma200 != null ? price > ma200 : false;
  const positiveDay = dayChange != null ? dayChange > 0 : false;

  const acceptableFundamentals =
    qualityScore >= 55 ||
    (eps != null && eps > 0) ||
    (pe != null && pe > 0 && pe <= 40);

  const strongFundamentals =
    qualityScore >= 65 &&
    ((eps != null && eps > 0) || (pe != null && pe > 0 && pe <= 30));

  if (
    triggerScore >= 78 &&
    asymmetryScore >= 70 &&
    strongFundamentals &&
    above50 &&
    above200 &&
    positiveDay
  ) {
    return {
      label: "STRONG BUY",
      reason: "Trend, upside, and fundamentals are aligned.",
    };
  }

  if (
    triggerScore >= 66 &&
    asymmetryScore >= 60 &&
    acceptableFundamentals &&
    (above50 || positiveDay)
  ) {
    return {
      label: "BUY",
      reason: "Good setup with acceptable fundamentals.",
    };
  }

  if (
    triggerScore >= 50 ||
    asymmetryScore >= 55 ||
    qualityScore >= 55
  ) {
    return {
      label: "WATCH",
      reason: "Interesting, but missing confirmation or fundamentals.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup, weak fundamentals, or poor risk/reward.",
  };
}

export function buildTechnicalSnapshot(row = {}) {
  const price = num(row.price);
  const priceAvg50 = num(row.priceAvg50);
  const priceAvg200 = num(row.priceAvg200);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const dayChangePct = num(row.dayChangePct);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  return {
    oneMonthPct: dayChangePct,
    threeMonthPct: null,
    relativeVolume:
      volume != null && avgVolume != null && avgVolume > 0
        ? volume / avgVolume
        : avgVolume != null && avgVolume > 0
        ? 1
        : null,
    above20dma: null,
    above50dma:
      price != null && priceAvg50 != null ? price > priceAvg50 : null,
    above200dma:
      price != null && priceAvg200 != null ? price > priceAvg200 : null,
    pctFrom20dma: null,
    pctFrom50dma:
      price != null && priceAvg50 != null && priceAvg50 > 0
        ? ((price - priceAvg50) / priceAvg50) * 100
        : null,
    pctFrom200dma:
      price != null && priceAvg200 != null && priceAvg200 > 0
        ? ((price - priceAvg200) / priceAvg200) * 100
        : null,
    pctFrom52wHigh:
      price != null && yearHigh != null && yearHigh > 0
        ? ((price - yearHigh) / yearHigh) * 100
        : null,
    pctFrom52wLow:
      price != null && yearLow != null && yearLow > 0
        ? ((price - yearLow) / yearLow) * 100
        : null,
    rsi: null,
    macd: null,
    macdSignal: null,
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    revenueGrowthPct: row.revenueGrowthPct ?? null,
    epsGrowthPct: row.epsGrowthPct ?? null,
    operatingMarginPct: row.operatingMarginPct ?? null,
    grossMargin: row.grossMargin ?? null,
    debtToEquity: row.debtToEquity ?? null,
    marketCap: row.marketCap ?? null,
    institutionalScore: row.institutionalScore ?? null,
    eps: row.eps ?? null,
    pe: row.pe ?? null,
  };
}
