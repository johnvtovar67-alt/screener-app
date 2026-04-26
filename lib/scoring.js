x// lib/scoring.js

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function pct(a, b) {
  if (!a || !b) return null;
  return ((a - b) / b) * 100;
}

function qualityScore(row) {
  let score = 55;

  const eps = num(row.eps);
  const pe = num(row.pe);

  if (eps != null) score += eps > 0 ? 10 : -8;

  if (pe != null) {
    if (pe > 0 && pe < 18) score += 10;
    else if (pe > 0 && pe < 35) score += 5;
    else if (pe <= 0) score -= 8;
  }

  return clamp(score);
}

function asymmetryScore(row) {
  let score = 55;

  const price = num(row.price);
  const high52 = num(row.yearHigh);
  const low52 = num(row.yearLow);

  if (price && high52 && high52 > price) {
    const upside = ((high52 - price) / price) * 100;
    if (upside > 80) score += 18;
    else if (upside > 50) score += 12;
    else if (upside > 25) score += 7;
  }

  if (price && low52 && price > low52) {
    const offLow = ((price - low52) / low52) * 100;
    if (offLow > 250) score -= 8;
    else if (offLow > 150) score -= 4;
  }

  return clamp(score);
}

function triggerScore(row) {
  let score = 50;

  const price = num(row.price);
  const day = num(row.dayChangePct);

  const ma20 = num(row.ma20);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const ma200 = num(row.ma200 ?? row.priceAvg200);

  const pct5 = num(row.pct5);
  const pct20 = num(row.pct20);
  const relVol = num(row.relativeVolume);
  const breakout20 = !!row.breakout20;
  const pullback50 = !!row.pullback50;

  if (price && ma20) score += price > ma20 ? 10 : -6;
  if (price && ma50) score += price > ma50 ? 10 : -8;
  if (price && ma200) score += price > ma200 ? 6 : -6;

  if (pct5 != null) {
    if (pct5 > 8) score += 10;
    else if (pct5 > 3) score += 8;
    else if (pct5 > 0) score += 4;
    else if (pct5 < -5) score -= 8;
  }

  if (pct20 != null) {
    if (pct20 > 20) score += 6;
    else if (pct20 > 6) score += 8;
    else if (pct20 > 0) score += 4;
    else if (pct20 < -8) score -= 8;
  }

  if (relVol != null) {
    if (relVol >= 2) score += 12;
    else if (relVol >= 1.3) score += 8;
    else if (relVol >= 1.05) score += 4;
    else if (relVol < 0.6) score -= 4;
  }

  if (breakout20) score += 12;
  if (pullback50) score += 5;

  if (day != null) {
    if (day > 12) score -= 8;
    else if (day > 5) score += 6;
    else if (day > 1) score += 5;
    else if (day < -5) score -= 8;
  }

  return clamp(score);
}

function isActionableNow(row) {
  const price = num(row.price);
  const ma20 = num(row.ma20);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const pct5 = num(row.pct5);
  const day = num(row.dayChangePct);
  const relVol = num(row.relativeVolume);

  const above20 = price && ma20 ? price > ma20 : false;
  const above50 = price && ma50 ? price > ma50 : false;
  const momentum = pct5 != null ? pct5 > 2 : day != null ? day > 1 : false;
  const volume = relVol != null ? relVol >= 1.05 : false;
  const notChasing = day != null ? day < 12 : true;

  return notChasing && volume && ((row.breakout20 && above20) || (above20 && above50 && momentum));
}

export function getRecommendation(row = {}) {
  const trigger = row.triggerScore ?? triggerScore(row);
  const asymmetry = row.asymmetryScore ?? asymmetryScore(row);
  const quality = row.qualityScore ?? qualityScore(row);

  const score = Math.round(trigger * 0.5 + asymmetry * 0.3 + quality * 0.2);
  const actionable = isActionableNow(row);

  if (score >= 78 && actionable) {
    return {
      label: "STRONG BUY",
      score,
      reason: row.breakout20
        ? "BUY NOW: breakout with volume confirmation."
        : "BUY NOW: momentum and volume are confirming.",
      entryNote: "BUY NOW — starter position justified. Add only if it holds strength.",
    };
  }

  if (score >= 72) {
    return {
      label: "BUY",
      score,
      reason: row.pullback50
        ? "Buyable pullback setup near trend support."
        : "High-quality setup nearing confirmation.",
      entryNote: row.pullback50
        ? "Starter acceptable near trend support. Add on strength."
        : "Starter acceptable only if chart confirms. Add on breakout or volume.",
    };
  }

  if (score >= 62) {
    return {
      label: "WATCH",
      score,
      reason: "Setup forming, but not actionable yet.",
      entryNote: "Wait for breakout, pullback, or volume confirmation.",
    };
  }

  return {
    label: "AVOID",
    score,
    reason: "Weak momentum or poor risk/reward.",
    entryNote: "Avoid for now.",
  };
}

export function calcTriggerScore(row = {}) {
  return Math.round(triggerScore(row));
}

export function calcAsymmetryScore(row = {}) {
  return Math.round(asymmetryScore(row));
}

export function calcQualityScore(row = {}) {
  return Math.round(qualityScore(row));
}

export function getStage(row = {}) {
  const rec = getRecommendation(row);
  if (rec.label === "STRONG BUY") return "Strong Buy";
  if (rec.label === "BUY") return "Buy";
  if (rec.label === "WATCH") return "Watch";
  return "Avoid";
}

export function buildTechnicalSnapshot(row = {}) {
  const price = num(row.price);

  return {
    oneMonthPct: row.pct20 ?? row.dayChangePct ?? null,
    threeMonthPct: row.pct60 ?? null,
    relativeVolume: row.relativeVolume ?? null,
    above20dma: price != null && row.ma20 != null ? price > row.ma20 : null,
    above50dma:
      price != null && (row.ma50 ?? row.priceAvg50) != null
        ? price > (row.ma50 ?? row.priceAvg50)
        : null,
    above200dma:
      price != null && (row.ma200 ?? row.priceAvg200) != null
        ? price > (row.ma200 ?? row.priceAvg200)
        : null,
    pctFrom20dma:
      price != null && row.ma20
        ? ((price - row.ma20) / row.ma20) * 100
        : null,
    pctFrom50dma:
      price != null && (row.ma50 ?? row.priceAvg50)
        ? ((price - (row.ma50 ?? row.priceAvg50)) /
            (row.ma50 ?? row.priceAvg50)) *
          100
        : null,
    pctFrom200dma:
      price != null && (row.ma200 ?? row.priceAvg200)
        ? ((price - (row.ma200 ?? row.priceAvg200)) /
            (row.ma200 ?? row.priceAvg200)) *
          100
        : null,
    pctFrom52wHigh:
      price != null && row.yearHigh
        ? ((price - row.yearHigh) / row.yearHigh) * 100
        : null,
    pctFrom52wLow:
      price != null && row.yearLow
        ? ((price - row.yearLow) / row.yearLow) * 100
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
