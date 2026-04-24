// lib/scoring.js

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, low, high) {
  const v = num(value);
  if (v == null) return 0;
  if (v <= low) return 0;
  if (v >= high) return 100;
  return ((v - low) / (high - low)) * 100;
}

function priceSweetSpotScore(price) {
  const p = num(price);
  if (p == null) return 45;

  if (p >= 5 && p <= 25) return 90;
  if (p > 25 && p <= 50) return 65;
  if (p > 50 && p <= 100) return 45;
  if (p < 5 && p >= 3) return 35;
  return 20;
}

function liquidityScore(row) {
  const volume = num(row.avgVolume ?? row.volume);

  if (volume == null) return 50;
  if (volume >= 5_000_000) return 95;
  if (volume >= 2_000_000) return 85;
  if (volume >= 1_000_000) return 75;
  if (volume >= 500_000) return 65;
  if (volume >= 250_000) return 55;
  return 35;
}

function marketCapScore(row) {
  const marketCap = num(row.marketCap);

  if (marketCap == null) return 55;
  if (marketCap >= 300_000_000 && marketCap <= 5_000_000_000) return 90;
  if (marketCap > 5_000_000_000 && marketCap <= 25_000_000_000) return 70;
  if (marketCap > 25_000_000_000) return 45;
  return 30;
}

function profitabilityScore(row) {
  const eps = num(row.eps);
  const pe = num(row.pe);
  const operatingMargin = num(row.operatingMarginPct);
  const grossMargin = num(row.grossMargin);

  let score = 50;

  if (eps != null) score += eps > 0 ? 18 : -10;
  if (pe != null) {
    if (pe > 0 && pe <= 25) score += 14;
    else if (pe > 25 && pe <= 60) score += 5;
    else if (pe <= 0) score -= 8;
  }

  if (operatingMargin != null) {
    if (operatingMargin > 20) score += 14;
    else if (operatingMargin > 10) score += 10;
    else if (operatingMargin > 0) score += 5;
    else score -= 8;
  }

  if (grossMargin != null) {
    if (grossMargin > 50) score += 10;
    else if (grossMargin > 30) score += 5;
  }

  return clamp(score);
}

function trendScore(row) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const dayChange = num(row.dayChangePct);

  let score = 50;

  if (price != null && ma50 != null) {
    score += price > ma50 ? 18 : -10;
  }

  if (price != null && ma200 != null) {
    score += price > ma200 ? 16 : -12;
  }

  if (dayChange != null) {
    if (dayChange > 5) score += 18;
    else if (dayChange > 2) score += 12;
    else if (dayChange > 0) score += 6;
    else if (dayChange < -5) score -= 14;
    else if (dayChange < -2) score -= 8;
  }

  // If we only have price/volume, don't default everything to AVOID.
  if (ma50 == null && ma200 == null && dayChange == null) {
    score += priceSweetSpotScore(price) * 0.15;
    score += liquidityScore(row) * 0.20;
    score -= 12;
  }

  return clamp(score);
}

function asymmetryUpsideScore(row) {
  const price = num(row.price);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  let score = 45;

  score += priceSweetSpotScore(price) * 0.35;
  score += marketCapScore(row) * 0.25;
  score += liquidityScore(row) * 0.20;

  if (price != null && yearHigh != null && yearHigh > price) {
    const upsideToHigh = ((yearHigh - price) / price) * 100;

    if (upsideToHigh > 100) score += 18;
    else if (upsideToHigh > 50) score += 12;
    else if (upsideToHigh > 25) score += 8;
  }

  if (price != null && yearLow != null && price > yearLow) {
    const offLow = ((price - yearLow) / yearLow) * 100;

    if (offLow > 200) score -= 8;
    else if (offLow > 100) score -= 4;
  }

  return clamp(score);
}

export function calcQualityScore(row = {}) {
  const score =
    profitabilityScore(row) * 0.35 +
    liquidityScore(row) * 0.25 +
    marketCapScore(row) * 0.25 +
    priceSweetSpotScore(row.price) * 0.15;

  return Math.round(clamp(score));
}

export function calcAsymmetryScore(row = {}) {
  const score =
    asymmetryUpsideScore(row) * 0.65 +
    priceSweetSpotScore(row.price) * 0.20 +
    liquidityScore(row) * 0.15;

  return Math.round(clamp(score));
}

export function calcTriggerScore(row = {}) {
  const score =
    trendScore(row) * 0.55 +
    liquidityScore(row) * 0.25 +
    priceSweetSpotScore(row.price) * 0.20;

  return Math.round(clamp(score));
}

export function getStage(row = {}) {
  const trigger = calcTriggerScore(row);
  const asymmetry = calcAsymmetryScore(row);

  if (trigger >= 75 && asymmetry >= 68) return "Breakout";
  if (trigger >= 63 && asymmetry >= 58) return "Setup";
  if (asymmetry >= 60) return "Early";
  if (trigger >= 48) return "Watch";
  return "Weak";
}

export function getRecommendation(row = {}) {
  const qualityScore = row.qualityScore ?? calcQualityScore(row);
  const asymmetryScore = row.asymmetryScore ?? calcAsymmetryScore(row);
  const triggerScore = row.triggerScore ?? calcTriggerScore(row);

  if (triggerScore >= 78 && asymmetryScore >= 68 && qualityScore >= 55) {
    return {
      label: "STRONG BUY",
      reason: "Momentum, asymmetry, and quality aligned.",
    };
  }

  if (triggerScore >= 63 && asymmetryScore >= 58) {
    return {
      label: "BUY",
      reason: "Attractive setup with confirmation.",
    };
  }

  if (triggerScore >= 48 || asymmetryScore >= 60) {
    return {
      label: "WATCH",
      reason: "Interesting, but needs confirmation.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup.",
  };
}

export function buildTechnicalSnapshot(row = {}) {
  const price = num(row.price);
  const priceAvg50 = num(row.priceAvg50);
  const priceAvg200 = num(row.priceAvg200);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const dayChangePct = num(row.dayChangePct);

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
  };
}
