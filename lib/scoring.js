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
  if (volume >= 10000000) return 95;
  if (volume >= 5000000) return 88;
  if (volume >= 2000000) return 78;
  if (volume >= 1000000) return 68;
  if (volume >= 500000) return 58;
  if (volume >= 250000) return 48;
  return 30;
}

function marketCapScore(row) {
  const marketCap = num(row.marketCap);
  if (marketCap == null) return 55;
  if (marketCap >= 300000000 && marketCap <= 5000000000) return 92;
  if (marketCap > 5000000000 && marketCap <= 25000000000) return 72;
  if (marketCap > 25000000000 && marketCap <= 100000000000) return 55;
  if (marketCap > 100000000000) return 40;
  return 25;
}

function fundamentalScore(row) {
  let score = 55;
  const eps = num(row.eps);
  const pe = num(row.pe);
  const growth = num(row.revenueGrowthPct);

  if (eps != null) score += eps > 0 ? 10 : -8;
  if (pe != null) {
    if (pe > 0 && pe <= 20) score += 12;
    else if (pe > 20 && pe <= 40) score += 6;
    else score -= 4;
  }
  if (growth != null) {
    if (growth > 20) score += 8;
    else if (growth < 0) score -= 6;
  }

  return clamp(score);
}

function trendScore(row) {
  let score = 50;
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const day = num(row.dayChangePct);

  if (price && ma50) score += price > ma50 ? 15 : -10;
  if (price && ma200) score += price > ma200 ? 15 : -10;

  if (day != null) {
    if (day > 5) score += 12;
    else if (day > 0) score += 6;
    else if (day < -5) score -= 10;
  }

  return clamp(score);
}

function asymmetryScore(row) {
  let score =
    priceSweetSpotScore(row.price) * 0.3 +
    marketCapScore(row) * 0.2 +
    liquidityScore(row) * 0.2 +
    fundamentalScore(row) * 0.3;

  return clamp(score);
}

export function calcQualityScore(row = {}) {
  return Math.round(fundamentalScore(row));
}

export function calcAsymmetryScore(row = {}) {
  return Math.round(asymmetryScore(row));
}

export function calcTriggerScore(row = {}) {
  return Math.round(trendScore(row));
}

export function getRecommendation(row = {}) {
  const quality = calcQualityScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const trigger = calcTriggerScore(row);

  const totalScore = Math.round(
    clamp(trigger * 0.5 + asymmetry * 0.3 + quality * 0.2)
  );

  // 🔥 STRONG BUY (easier to hit)
  if (totalScore >= 75 && trigger >= 70 && asymmetry >= 65) {
    return {
      label: "STRONG BUY",
      score: totalScore,
      reason: "High conviction: momentum + upside aligned.",
      entryNote: "Actionable now.",
    };
  }

  // ⚠️ BUY (tightened)
  if (totalScore >= 70 && trigger >= 60) {
    return {
      label: "BUY",
      score: totalScore,
      reason: "Good setup, but not elite.",
      entryNote: "Starter position.",
    };
  }

  // 👀 WATCH
  if (totalScore >= 58) {
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
