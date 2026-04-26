// lib/scoring.js

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/* =========================
   CORE SCORES
========================= */

function trendScore(row) {
  let score = 50;

  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const day = num(row.dayChangePct);
  const vol = num(row.volume);
  const avgVol = num(row.avgVolume);

  if (price && ma50) score += price > ma50 ? 15 : -10;
  if (price && ma200) score += price > ma200 ? 15 : -10;

  if (day != null) {
    if (day > 5) score += 15;
    else if (day > 2) score += 10;
    else if (day > 0.5) score += 6;
    else if (day < -3) score -= 8;
  }

  if (vol && avgVol && avgVol > 0) {
    const rv = vol / avgVol;
    if (rv > 1.5) score += 10;
    else if (rv > 1.1) score += 5;
  }

  return clamp(score);
}

function asymmetryScore(row) {
  let score = 60;

  const price = num(row.price);
  const high = num(row.yearHigh);

  if (price && high && high > price) {
    const upside = ((high - price) / price) * 100;

    if (upside > 80) score += 15;
    else if (upside > 50) score += 10;
    else if (upside > 25) score += 5;
  }

  return clamp(score);
}

function qualityScore(row) {
  let score = 55;

  const eps = num(row.eps);
  const pe = num(row.pe);

  if (eps != null) score += eps > 0 ? 10 : -8;

  if (pe != null) {
    if (pe > 0 && pe < 20) score += 10;
    else if (pe < 0) score -= 8;
  }

  return clamp(score);
}

/* =========================
   ACTIONABLE LOGIC
========================= */

function isActionable(row) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const day = num(row.dayChangePct);
  const vol = num(row.volume);
  const avgVol = num(row.avgVolume);

  const above50 = price && ma50 ? price > ma50 : false;
  const momentum = day != null ? day > 1 : false;

  const volumeConfirm =
    vol && avgVol && avgVol > 0 ? vol / avgVol > 1.1 : false;

  return above50 && momentum && volumeConfirm;
}

/* =========================
   FINAL OUTPUT (THIS IS THE FIX)
========================= */

export function getRecommendation(row) {
  const trigger = trendScore(row);
  const asym = asymmetryScore(row);
  const quality = qualityScore(row);

  const score = Math.round(trigger * 0.5 + asym * 0.3 + quality * 0.2);

  const actionable = isActionable(row);

  // 🔥 ONLY TRUE BUY NOW
  if (score >= 78 && actionable) {
    return {
      label: "STRONG BUY",
      score,
      reason: "Momentum + volume confirmed. Buy now.",
      entryNote: "BUY NOW — starter position justified.",
    };
  }

  // 🔥 GOOD BUT NOT READY
  if (score >= 75) {
    return {
      label: "WATCH",
      score,
      reason: "High-quality setup, not actionable yet.",
      entryNote: "WAIT — needs breakout or volume confirmation.",
    };
  }

  // 🔥 DEVELOPING
  if (score >= 65) {
    return {
      label: "WATCH",
      score,
      reason: "Setup forming, but early.",
      entryNote: "Wait.",
    };
  }

  return {
    label: "AVOID",
    score,
    reason: "Weak setup.",
    entryNote: "Avoid.",
  };
}

/* =========================
   EXPORTS
========================= */

export function calcTriggerScore(r) {
  return trendScore(r);
}

export function calcAsymmetryScore(r) {
  return asymmetryScore(r);
}

export function calcQualityScore(r) {
  return qualityScore(r);
}

export function getStage(row) {
  const rec = getRecommendation(row);
  return rec.label;
}

export function buildTechnicalSnapshot(row) {
  return {};
}

export function buildFundamentalSnapshot(row) {
  return {};
}
