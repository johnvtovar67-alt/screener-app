// lib/scoring.js

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// --- CORE SCORES ---

function fundamentalScore(row) {
  let score = 55;
  const eps = num(row.eps);
  const pe = num(row.pe);
  const growth = num(row.revenueGrowthPct);

  if (eps != null) score += eps > 0 ? 10 : -8;

  if (pe != null) {
    if (pe > 0 && pe <= 20) score += 12;
    else if (pe <= 40) score += 6;
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
  return clamp(
    fundamentalScore(row) * 0.4 +
    trendScore(row) * 0.2 +
    60 // base upside assumption
  );
}

// --- EXPORTED SCORES ---

export function calcQualityScore(row = {}) {
  return Math.round(fundamentalScore(row));
}

export function calcAsymmetryScore(row = {}) {
  return Math.round(asymmetryScore(row));
}

export function calcTriggerScore(row = {}) {
  return Math.round(trendScore(row));
}

// 🔥 NEW: ENTRY CHECK
function isBuyNow(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const day = num(row.dayChangePct);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  const above50 = price && ma50 ? price > ma50 : false;
  const greenDay = day != null ? day > 0 : false;
  const strongVolume =
    volume && avgVolume ? volume / avgVolume >= 1.3 : false;

  return above50 && greenDay && strongVolume;
}

// --- FINAL RECOMMENDATION ---

export function getRecommendation(row = {}) {
  const quality = calcQualityScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const trigger = calcTriggerScore(row);

  const totalScore = Math.round(
    clamp(trigger * 0.5 + asymmetry * 0.3 + quality * 0.2)
  );

  const buyNow = isBuyNow(row);

  // 🔥 STRONG BUY
  if (totalScore >= 75 && trigger >= 70 && asymmetry >= 65) {
    return {
      label: buyNow ? "STRONG BUY (BUY NOW)" : "STRONG BUY (WAIT)",
      score: totalScore,
      reason: buyNow
        ? "Momentum confirmed with volume."
        : "Strong setup, waiting for confirmation.",
      entryNote: buyNow
        ? "Enter now. Momentum confirmed."
        : "Wait for breakout + volume.",
    };
  }

  // BUY
  if (totalScore >= 70 && trigger >= 60) {
    return {
      label: "BUY",
      score: totalScore,
      reason: "Good setup, not fully confirmed.",
      entryNote: "Starter position only.",
    };
  }

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

// REQUIRED BY YOUR UI
export function getStage(row = {}) {
  const rec = getRecommendation(row);
  return rec.label;
}
