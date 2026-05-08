// lib/scoring.js

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function roundScore(value) {
  return Math.round(clamp(value, 0, 100));
}

function pctFrom(price, base) {
  const p = num(price);
  const b = num(base);

  if (p == null || b == null || b === 0) return null;

  return ((p - b) / b) * 100;
}

function relativeVolume(row = {}) {
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  if (volume == null || avgVolume == null || avgVolume <= 0) return null;

  return volume / avgVolume;
}

function trendData(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);

  return {
    price,
    ma50,
    ma200,
    above50: price != null && ma50 != null ? price > ma50 : false,
    above200: price != null && ma200 != null ? price > ma200 : false,
    pctFrom50: pctFrom(price, ma50),
    pctFrom200: pctFrom(price, ma200),
  };
}

function marketRelativeScore(row = {}) {
  const stockDay = num(row.dayChangePct);
  const spyDay = num(row.spyDayChangePct);
  const qqqDay = num(row.qqqDayChangePct);

  let score = 50;

  if (stockDay == null) return score;

  if (spyDay != null) {
    const spread = stockDay - spyDay;

    if (spread >= 4) score += 18;
    else if (spread >= 2) score += 12;
    else if (spread >= 1) score += 7;
    else if (spread <= -4) score -= 18;
    else if (spread <= -2) score -= 12;
    else if (spread <= -1) score -= 7;
  }

  if (qqqDay != null) {
    const spread = stockDay - qqqDay;

    if (spread >= 4) score += 18;
    else if (spread >= 2) score += 12;
    else if (spread >= 1) score += 7;
    else if (spread <= -4) score -= 18;
    else if (spread <= -2) score -= 12;
    else if (spread <= -1) score -= 7;
  }

  return roundScore(score);
}

function riskPenalty(row = {}) {
  let penalty = 0;

  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);
  const eps = num(row.eps);
  const pe = num(row.pe);
  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (price != null && price < 5) penalty += 100;
  if (marketCap != null && marketCap < 300000000) penalty += 100;
  if (avgVolume != null && avgVolume < 500000) penalty += 100;

  if (!above50) penalty += 10;
  if (!above200) penalty += 14;

  if (pctFrom50 != null && pctFrom50 > 22) penalty += 18;
  if (pctFrom50 != null && pctFrom50 < -10) penalty += 14;

  if (pctFrom200 != null && pctFrom200 > 80) penalty += 12;
  if (pctFrom200 != null && pctFrom200 < -15) penalty += 16;

  if (eps != null && eps < 0) penalty += 8;

  if (pe != null && pe > 80) penalty += 8;
  if (pe != null && pe < 0) penalty += 8;

  if (day != null && day <= -4) penalty += 12;

  if (rv != null && rv < 0.6) penalty += 6;

  return Math.round(clamp(penalty, 0, 100));
}

export function getColorTone(value, green = 75, yellow = 60) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "gray";
  if (n >= green) return "green";
  if (n >= yellow) return "yellow";
  return "red";
}

export function getMomentumTone(momentum) {
  if (momentum === "Strong") return "green";
  if (momentum === "Building") return "yellow";
  return "red";
}

export function passesInstitutionalFilter(row = {}) {
  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);

  if (price == null || price < 5) return false;
  if (marketCap == null || marketCap < 300000000) return false;
  if (avgVolume == null || avgVolume < 500000) return false;

  return true;
}

export function calcFundamentalScore(row = {}) {
  let score = 50;

  const marketCap = num(row.marketCap);
  const eps = num(row.eps);
  const pe = num(row.pe);

  if (marketCap != null) {
    if (marketCap >= 1000000000 && marketCap <= 50000000000) score += 14;
    else if (marketCap > 50000000000 && marketCap <= 500000000000) score += 8;
    else if (marketCap > 500000000000) score += 2;
  }

  if (eps != null) {
    if (eps > 0) score += 15;
    else score -= 10;
  }

  if (pe != null) {
    if (pe > 0 && pe <= 25) score += 12;
    else if (pe > 25 && pe <= 45) score += 5;
    else if (pe > 80) score -= 10;
    else if (pe < 0) score -= 8;
  }

  return roundScore(score);
}

export function calcTechnicalScore(row = {}) {
  let score = 45;

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50) score += 18;
  else score -= 12;

  if (above200) score += 18;
  else score -= 14;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 8) score += 15;
    else if (pctFrom50 > 8 && pctFrom50 <= 18) score += 7;
    else if (pctFrom50 > 22) score -= 18;
    else if (pctFrom50 < -8) score -= 12;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 >= 0 && pctFrom200 <= 35) score += 10;
    else if (pctFrom200 > 60) score -= 8;
    else if (pctFrom200 < -12) score -= 12;
  }

  return roundScore(score);
}

export function calcMomentumScore(row = {}) {
  let score = 45;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);

  if (day != null) {
    if (day >= 6) score += 20;
    else if (day >= 3) score += 15;
    else if (day >= 1) score += 8;
    else if (day <= -5) score -= 20;
    else if (day < 0) score -= 8;
  }

  if (rv != null) {
    if (rv >= 2) score += 18;
    else if (rv >= 1.5) score += 12;
    else if (rv >= 1.15) score += 7;
    else if (rv < 0.6) score -= 8;
  }

  if (relative >= 70) score += 12;
  else if (relative >= 60) score += 6;
  else if (relative <= 35) score -= 12;
  else if (relative <= 45) score -= 6;

  return roundScore(score);
}

export function getMomentumLabel(row = {}) {
  const score = calcMomentumScore(row);

  if (score >= 75) return "Strong";
  if (score >= 55) return "Building";
  return "Weak";
}

export function calcRelativeStrengthScore(row = {}) {
  return marketRelativeScore(row);
}

export function calcAsymmetryScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const marketCap = num(row.marketCap);

  if (price != null) {
    if (price >= 8 && price <= 80) score += 12;
    else if (price > 150) score -= 5;
  }

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 25000000000) score += 15;
    else if (marketCap > 25000000000 && marketCap <= 150000000000) score += 8;
    else if (marketCap > 500000000000) score -= 6;
  }

  return roundScore(score);
}

export function calcTriggerScore(row = {}) {
  let score = 40;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);

  const { above50, above200, pctFrom50 } = trendData(row);

  if (above50) score += 15;
  else score -= 10;

  if (above200) score += 15;
  else score -= 10;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 7) score += 14;
    else if (pctFrom50 > 7 && pctFrom50 <= 15) score += 6;
    else if (pctFrom50 > 20) score -= 18;
    else if (pctFrom50 < -6) score -= 10;
  }

  if (day != null) {
    if (day >= 5) score += 16;
    else if (day >= 2) score += 12;
    else if (day > 0) score += 6;
    else if (day <= -4) score -= 16;
    else if (day < 0) score -= 6;
  }

  if (rv != null) {
    if (rv >= 2) score += 15;
    else if (rv >= 1.5) score += 10;
    else if (rv >= 1.15) score += 5;
    else if (rv < 0.6) score -= 6;
  }

  if (relative >= 70) score += 10;
  else if (relative <= 40) score -= 10;

  score -= riskPenalty(row) * 0.25;

  return roundScore(score);
}

export function compositeScore(row = {}) {
  const fundamental = calcFundamentalScore(row);
  const technical = calcTechnicalScore(row);
  const momentum = calcMomentumScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const relative = calcRelativeStrengthScore(row);
  const trigger = calcTriggerScore(row);
  const penalty = riskPenalty(row);

  const weighted =
    fundamental * 0.18 +
    technical * 0.22 +
    momentum * 0.18 +
    asymmetry * 0.12 +
    relative * 0.15 +
    trigger * 0.15 -
    penalty * 0.2;

  return roundScore(weighted);
}

function buildDynamicReason(row = {}, recommendation = {}) {
  const trigger = recommendation.triggerScore ?? 0;
  const momentum = getMomentumLabel(row);
  const relative = recommendation.relativeStrengthScore ?? 0;
  const penalty = recommendation.riskPenalty ?? 0;

  const { pctFrom50 } = trendData(row);

  if (recommendation.label === "BUY NOW") {
    if (trigger >= 90 && momentum !== "Weak") {
      return "Actionable setup with very strong trigger behavior and improving confirmation.";
    }

    return "Actionable setup with strong trend, relative strength, and trigger confirmation.";
  }

  if (pctFrom50 != null && pctFrom50 > 18) {
    return "Strong move, but setup appears extended after recent momentum.";
  }

  if (penalty >= 35) {
    return "Setup is being held back by risk controls despite some positive signals.";
  }

  if (trigger >= 90 && momentum === "Building") {
    return "Very strong trigger behavior with improving momentum confirmation.";
  }

  if (momentum === "Strong" && relative >= 65) {
    return "Leadership characteristics with strong market-relative performance.";
  }

  if (momentum === "Weak") {
    return "Momentum profile remains weak versus stronger market leaders.";
  }

  if (relative < 50) {
    return "Relative strength remains below ideal institutional levels.";
  }

  return "Constructive setup, but timing and confirmation are still developing.";
}

function buildDynamicEntry(row = {}, recommendation = {}) {
  const trigger = recommendation.triggerScore ?? 0;
  const { pctFrom50 } = trendData(row);

  if (recommendation.label === "BUY NOW") {
    return "Buy now is reasonable for a starter position. Add only if volume and trend continue confirming.";
  }

  if (pctFrom50 != null && pctFrom50 > 18) {
    return "Wait for pullback or consolidation before entry.";
  }

  if (trigger >= 90) {
    return "Watch closely for continued volume and breakout confirmation.";
  }

  return "Monitor for stronger relative strength and cleaner technical alignment.";
}

export function getRecommendation(row = {}) {
  const score = compositeScore(row);
  const triggerScore = calcTriggerScore(row);
  const momentumScore = calcMomentumScore(row);
  const relativeStrengthScore = calcRelativeStrengthScore(row);
  const penalty = riskPenalty(row);

  const { above50, above200, pctFrom50 } = trendData(row);

  let label = "AVOID";

  if (
    score >= 76 &&
    triggerScore >= 78 &&
    momentumScore >= 68 &&
    relativeStrengthScore >= 58 &&
    above50 &&
    above200 &&
    penalty <= 22 &&
    (pctFrom50 == null || pctFrom50 <= 20)
  ) {
    label = "BUY NOW";
  } else if (
    score >= 58 &&
    triggerScore >= 62 &&
    above50 &&
    penalty <= 40
  ) {
    label = "WATCH FOR ENTRY";
  }

  const recommendation = {
    label,
    score,
    triggerScore,
    momentumScore,
    relativeStrengthScore,
    riskPenalty: penalty,
  };

  return {
    ...recommendation,
    reason: buildDynamicReason(row, recommendation),
    entryNote: buildDynamicEntry(row, recommendation),
    scoreTone: getColorTone(score),
    triggerTone: getColorTone(triggerScore, 80, 65),
    momentumTone: getMomentumTone(getMomentumLabel(row)),
    momentumLabel: getMomentumLabel(row),
  };
}

export function getStage(row = {}) {
  return getRecommendation(row).label;
}

export function buildTechnicalSnapshot(row = {}) {
  return {
    triggerScore: calcTriggerScore(row),
    momentumScore: calcMomentumScore(row),
    relativeStrengthScore: calcRelativeStrengthScore(row),
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    fundamentalScore: calcFundamentalScore(row),
    asymmetryScore: calcAsymmetryScore(row),
  };
}

export const calcQualityScore = calcFundamentalScore;

export function calcHeatScore(row = {}) {
  return calcTriggerScore(row);
}

export function getTradeReadiness(row = {}) {
  const rec = getRecommendation(row);

  if (rec.label === "BUY NOW") {
    return {
      label: "TRADE READY",
      heatScore: rec.triggerScore,
      reason: rec.reason,
    };
  }

  if (rec.label === "WATCH FOR ENTRY") {
    return {
      label: "WATCH CLOSELY",
      heatScore: rec.triggerScore,
      reason: rec.reason,
    };
  }

  return {
    label: "SETUP ONLY",
    heatScore: rec.triggerScore,
    reason: rec.reason,
  };
}
