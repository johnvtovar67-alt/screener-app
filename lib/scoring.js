// lib/scoring.js

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function volRatio(row) {
  const v = num(row.volume);
  const av = num(row.avgVolume);
  if (v && av && av > 0) return v / av;
  return null;
}

/* ---------------- SCORES ---------------- */

export function calcQualityScore(row = {}) {
  let s = 55;

  const eps = num(row.eps);
  const pe = num(row.pe);
  const mc = num(row.marketCap);
  const av = num(row.avgVolume);

  if (eps != null) s += eps > 0 ? 10 : -8;

  if (pe != null) {
    if (pe > 0 && pe <= 25) s += 8;
    else if (pe <= 0) s -= 6;
  }

  if (mc != null) {
    if (mc > 300e6 && mc < 15e9) s += 8;
    else if (mc < 200e6) s -= 10;
  }

  if (av != null) {
    if (av > 1_000_000) s += 7;
    else if (av < 300_000) s -= 8;
  }

  return clamp(Math.round(s));
}

export function calcAsymmetryScore(row = {}) {
  let s = 55;

  const p = num(row.price);
  const hi = num(row.yearHigh);
  const lo = num(row.yearLow);

  if (p && hi && hi > p) {
    const up = ((hi - p) / p) * 100;
    if (up > 60) s += 15;
    else if (up > 30) s += 10;
  }

  if (p && lo) {
    const off = ((p - lo) / lo) * 100;
    if (off > 200) s -= 8;
  }

  return clamp(Math.round(s));
}

export function calcTriggerScore(row = {}) {
  let s = 50;

  const p = num(row.price);
  const d = num(row.dayChangePct);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const vr = volRatio(row);

  if (p && ma50) s += p > ma50 ? 12 : -8;
  if (p && ma200) s += p > ma200 ? 8 : -6;

  if (d != null) {
    if (d > 5) s += 12;
    else if (d > 2) s += 8;
    else if (d > 0) s += 4;
    else if (d < -2) s -= 8;
  }

  if (vr != null) {
    if (vr > 1.8) s += 10;
    else if (vr > 1.3) s += 6;
    else if (vr < 0.6) s -= 4;
  }

  return clamp(Math.round(s));
}

/* ---------------- RECOMMENDATION ---------------- */

export function getRecommendation(row = {}) {
  const trigger = calcTriggerScore(row);
  const asym = calcAsymmetryScore(row);
  const qual = calcQualityScore(row);

  const score = Math.round(trigger * 0.5 + asym * 0.3 + qual * 0.2);

  const d = num(row.dayChangePct);
  const vr = volRatio(row);
  const p = num(row.price);
  const ma50 = num(row.priceAvg50);

  const above50 = p && ma50 ? p > ma50 : false;

  let label = "WATCH";

  /* -------- STRONG BUY (VERY HARD NOW) -------- */
  if (
    score >= 78 &&
    trigger >= 70 &&
    d != null &&
    d >= 2 &&
    d <= 7 &&                 // avoid chasing spikes
    vr != null &&
    vr >= 1.3 &&              // MUST have volume
    above50                   // trend aligned
  ) {
    return {
      label: "STRONG BUY",
      score,
      reason: "BUY NOW: momentum + volume + trend all aligned.",
      entryNote: "BUY NOW starter. Add only if it holds strength.",
    };
  }

  /* -------- BUY -------- */
  if (score >= 70 && trigger >= 62 && d > 0) {
    if (d > 6) {
      return {
        label: "WATCH",
        score,
        reason: "Move extended — do not chase.",
        entryNote: "Wait for pullback or consolidation.",
      };
    }

    return {
      label: "BUY",
      score,
      reason: "Constructive trend with improving momentum.",
      entryNote: "Starter acceptable. Add on breakout or volume confirmation.",
    };
  }

  /* -------- WATCH -------- */
  if (score >= 60) {
    return {
      label: "WATCH",
      score,
      reason: "Setup forming, not actionable yet.",
      entryNote: "Wait for stronger price or volume confirmation.",
    };
  }

  return {
    label: "AVOID",
    score,
    reason: "Weak setup or poor risk/reward.",
    entryNote: "Avoid.",
  };
}

/* ---------------- OTHER ---------------- */

export function getStage(row) {
  return getRecommendation(row).label;
}

export function buildTechnicalSnapshot(row = {}) {
  return {
    relativeVolume: volRatio(row),
    above50dma:
      row.price && row.priceAvg50 ? row.price > row.priceAvg50 : null,
    above200dma:
      row.price && row.priceAvg200 ? row.price > row.priceAvg200 : null,
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    marketCap: row.marketCap ?? null,
    eps: row.eps ?? null,
    pe: row.pe ?? null,
  };
}
