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
  if (p == null) return 50;
  if (p >= 5 && p <= 25) return 92;
  if (p > 25 && p <= 50) return 68;
  if (p > 50 && p <= 100) return 45;
  if (p >= 3 && p < 5) return 35;
  return 20;
}

function liquidityScore(row) {
  const volume = num(row.avgVolume ?? row.volume);
  if (volume == null) return 50;
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
  if (marketCap == null) return 55;
  if (marketCap >= 300_000_000 && marketCap <= 5_000_000_000) return 92;
  if (marketCap > 5_000_000_000 && marketCap <= 25_000_000_000) return 72;
  if (marketCap > 25_000_000_000 && marketCap <= 100_000_000_000) return 55;
  if (marketCap > 100_000_000_000) return 40;
  return 25;
}

function fundamentalScore(row) {
  const eps = num(row.eps);
  const pe = num(row.pe);
  const revenueGrowth = num(row.revenueGrowthPct);
  const epsGrowth = num(row.epsGrowthPct);
  const margin = num(row.operatingMarginPct);
  const debt = num(row.debtToEquity);
  const inst = num(row.institutionalScore);

  let score = 55; // neutral baseline

  if (eps != null) score += eps > 0 ? 12 : -10;

  if (pe != null) {
    if (pe > 0 && pe <= 18) score += 14;
    else if (pe <= 35) score += 8;
    else if (pe <= 60) score += 2;
    else if (pe <= 0) score -= 8;
    else score -= 5;
  }

  if (revenueGrowth != null) {
    if (revenueGrowth > 25) score += 10;
    else if (revenueGrowth > 10) score += 6;
    else if (revenueGrowth < 0) score -= 6;
  }

  if (epsGrowth != null) {
    if (epsGrowth > 25) score += 10;
    else if (epsGrowth > 10) score += 6;
    else if (epsGrowth < 0) score -= 6;
  }

  if (margin != null) {
    if (margin > 20) score += 8;
    else if (margin > 8) score += 5;
    else if (margin < 0) score -= 7;
  }

  if (debt != null) {
    if (debt < 0.75) score += 5;
    else if (debt > 3) score -= 6;
  }

  if (inst != null) {
    if (inst >= 75) score += 5;
    else if (inst >= 60) score += 3;
    else if (inst < 35) score -= 3;
  }

  return clamp(score);
}

function trendScore(row) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const day = num(row.dayChangePct);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  let score = 50;

  if (price != null && ma50 != null) score += price > ma50 ? 18 : -10;
  if (price != null && ma200 != null) score += price > ma200 ? 16 : -12;

  if (day != null) {
    if (day > 10) score += 14;
    else if (day > 5) score += 10;
    else if (day > 0) score += 5;
    else if (day < -5) score -= 12;
  }

  if (volume && avgVolume) {
    const rv = volume / avgVolume;
    if (rv > 2) score += 10;
    else if (rv > 1.3) score += 6;
  }

  return clamp(score);
}

function asymmetryScore(row) {
  const price = num(row.price);
  const high = num(row.yearHigh);

  let score =
    priceSweetSpotScore(price) * 0.28 +
    marketCapScore(row) * 0.22 +
    liquidityScore(row) * 0.18 +
    fundamentalScore(row) * 0.32;

  if (price && high && high > price) {
    const upside = ((high - price) / price) * 100;
    if (upside > 100) score += 16;
    else if (upside > 60) score += 12;
    else if (upside > 35) score += 8;
  }

  return clamp(score);
}

export function calcQualityScore(row = {}) {
  return Math.round(
    clamp(
      fundamentalScore(row) * 0.5 +
        liquidityScore(row) * 0.22 +
        marketCapScore(row) * 0.18 +
        priceSweetSpotScore(row.price) * 0.1
    )
  );
}

export function calcAsymmetryScore(row = {}) {
  return Math.round(clamp(asymmetryScore(row)));
}

export function calcTriggerScore(row = {}) {
  return Math.round(
    clamp(
      trendScore(row) * 0.65 +
        liquidityScore(row) * 0.18 +
        fundamentalScore(row) * 0.17
    )
  );
}

export function getRecommendation(row = {}) {
  const quality = calcQualityScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const trigger = calcTriggerScore(row);

  const totalScore = Math.round(
    clamp(trigger * 0.45 + asymmetry * 0.35 + quality * 0.2)
  );

  if (totalScore >= 78 && trigger >= 72 && asymmetry >= 68 && quality >= 58) {
    return {
      label: "STRONG BUY",
      score: totalScore,
      reason: "Breakout-level momentum with strong asymmetry.",
      entryNote: "Actionable now. Scale carefully.",
    };
  }

  if (totalScore >= 74 && trigger >= 66 && asymmetry >= 62) {
    return {
      label: "BUY",
      score: totalScore,
      reason: "Strong upside, still developing.",
      entryNote: "Starter position. Add on confirmation.",
    };
  }

  if (totalScore >= 60) {
    return {
      label: "WATCH",
      score: totalScore,
      reason: "Needs confirmation.",
      entryNote: "Wait.",
    };
  }

  return {
    label: "AVOID",
    score: totalScore,
    reason: "Weak setup.",
    entryNote: "Avoid.",
  };
}
