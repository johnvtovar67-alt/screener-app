// lib/scoring.js

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function pctDiff(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function qualityScore(row = {}) {
  let score = 50;

  const eps = num(row.eps);
  const pe = num(row.pe);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);

  if (eps != null) score += eps > 0 ? 12 : -10;

  if (pe != null) {
    if (pe > 0 && pe <= 18) score += 12;
    else if (pe > 18 && pe <= 35) score += 6;
    else if (pe <= 0) score -= 8;
    else if (pe > 60) score -= 5;
  }

  if (marketCap != null) {
    if (marketCap >= 300000000 && marketCap <= 5000000000) score += 10;
    else if (marketCap > 5000000000 && marketCap <= 25000000000) score += 6;
    else if (marketCap < 300000000) score -= 10;
  }

  if (avgVolume != null) {
    if (avgVolume >= 1000000) score += 8;
    else if (avgVolume >= 500000) score += 4;
    else if (avgVolume < 250000) score -= 8;
  }

  return Math.round(clamp(score));
}

function asymmetryScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  if (price != null && yearHigh != null && yearHigh > price) {
    const upside = ((yearHigh - price) / price) * 100;

    if (upside >= 100) score += 20;
    else if (upside >= 60) score += 15;
    else if (upside >= 35) score += 10;
    else if (upside >= 20) score += 5;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const offLow = ((price - yearLow) / yearLow) * 100;

    if (offLow > 250) score -= 12;
    else if (offLow > 150) score -= 7;
  }

  return Math.round(clamp(score));
}

function triggerScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const day = num(row.dayChangePct);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const ma200 = num(row.ma200 ?? row.priceAvg200);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const relVol = num(row.relativeVolume);

  if (price != null && ma50 != null) score += price > ma50 ? 14 : -10;
  if (price != null && ma200 != null) score += price > ma200 ? 10 : -8;

  if (day != null) {
    if (day > 8) score += 8;
    else if (day > 4) score += 12;
    else if (day > 1) score += 8;
    else if (day > 0) score += 4;
    else if (day < -5) score -= 14;
    else if (day < -2) score -= 8;
    else if (day < 0) score -= 4;
  }

  const volumeRatio =
    relVol != null
      ? relVol
      : volume != null && avgVolume != null && avgVolume > 0
      ? volume / avgVolume
      : null;

  if (volumeRatio != null) {
    if (volumeRatio >= 2) score += 12;
    else if (volumeRatio >= 1.3) score += 8;
    else if (volumeRatio >= 1.05) score += 4;
    else if (volumeRatio < 0.6) score -= 5;
  }

  if (row.breakout20) score += 10;
  if (row.pullback50) score += 5;

  return Math.round(clamp(score));
}

function getCompositeScore(row = {}) {
  const trigger = row.triggerScore ?? triggerScore(row);
  const asymmetry = row.asymmetryScore ?? asymmetryScore(row);
  const quality = row.qualityScore ?? qualityScore(row);

  return Math.round(clamp(trigger * 0.5 + asymmetry * 0.3 + quality * 0.2));
}

function isBuyNow(row = {}) {
  const price = num(row.price);
  const day = num(row.dayChangePct);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const relVol = num(row.relativeVolume);

  const above50 = price != null && ma50 != null ? price > ma50 : false;
  const green = day != null ? day > 0.75 : false;
  const notChasing = day != null ? day < 10 : true;

  const volumeRatio =
    relVol != null
      ? relVol
      : volume != null && avgVolume != null && avgVolume > 0
      ? volume / avgVolume
      : null;

  const volumeOk = volumeRatio != null ? volumeRatio >= 1.05 : false;

  return above50 && green && notChasing && volumeOk;
}

export function calcQualityScore(row = {}) {
  return qualityScore(row);
}

export function calcAsymmetryScore(row = {}) {
  return asymmetryScore(row);
}

export function calcTriggerScore(row = {}) {
  return triggerScore(row);
}

export function getRecommendation(row = {}) {
  const trigger = row.triggerScore ?? triggerScore(row);
  const asymmetry = row.asymmetryScore ?? asymmetryScore(row);
  const quality = row.qualityScore ?? qualityScore(row);
  const score = getCompositeScore({ ...row, triggerScore: trigger, asymmetryScore: asymmetry, qualityScore: quality });

  const day = num(row.dayChangePct);
  const buyNow = isBuyNow(row);

  if (score >= 78 && trigger >= 70 && buyNow) {
    return {
      label: "STRONG BUY",
      score,
      reason: row.breakout20
        ? "BUY NOW: breakout with volume confirmation."
        : "BUY NOW: momentum and volume are confirming.",
      entryNote: "BUY NOW: starter position justified. Add only if strength holds.",
    };
  }

  if (score >= 72 && trigger >= 62) {
    return {
      label: "BUY",
      score,
      reason:
        day != null && day < 0
          ? "Good setup, but not actionable while red."
          : "High-quality setup nearing confirmation.",
      entryNote:
        day != null && day < 0
          ? "WAIT: no buy while red. Recheck on strength."
          : "Starter acceptable. Add only on breakout, pullback, or volume confirmation.",
    };
  }

  if (score >= 62) {
    return {
      label: "WATCH",
      score,
      reason: "Setup forming, but not actionable yet.",
      entryNote: "Wait for stronger trend, volume, or price confirmation.",
    };
  }

  return {
    label: "AVOID",
    score,
    reason: "Weak momentum or poor risk/reward.",
    entryNote: "Avoid for now.",
  };
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
  const ma20 = num(row.ma20);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const ma200 = num(row.ma200 ?? row.priceAvg200);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const relVol = num(row.relativeVolume);

  return {
    oneMonthPct: row.pct20 ?? row.dayChangePct ?? null,
    threeMonthPct: row.pct60 ?? null,
    relativeVolume:
      relVol ??
      (volume != null && avgVolume != null && avgVolume > 0
        ? volume / avgVolume
        : null),
    above20dma: price != null && ma20 != null ? price > ma20 : null,
    above50dma: price != null && ma50 != null ? price > ma50 : null,
    above200dma: price != null && ma200 != null ? price > ma200 : null,
    pctFrom20dma: pctDiff(price, ma20),
    pctFrom50dma: pctDiff(price, ma50),
    pctFrom200dma: pctDiff(price, ma200),
    pctFrom52wHigh:
      price != null && row.yearHigh != null
        ? ((price - row.yearHigh) / row.yearHigh) * 100
        : null,
    pctFrom52wLow:
      price != null && row.yearLow != null
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
