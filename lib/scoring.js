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

  let score = 55; // missing fundamentals = neutral, not bad

  if (eps != null) score += eps > 0 ? 12 : -14;

  if (pe != null) {
    if (pe > 0 && pe <= 18) score += 14;
    else if (pe > 18 && pe <= 35) score += 8;
    else if (pe > 35 && pe <= 60) score += 1;
    else if (pe <= 0) score -= 12;
    else score -= 6;
  }

  if (revenueGrowth != null) {
    if (revenueGrowth > 25) score += 10;
    else if (revenueGrowth > 10) score += 6;
    else if (revenueGrowth < 0) score -= 8;
  }

  if (epsGrowth != null) {
    if (epsGrowth > 25) score += 10;
    else if (epsGrowth > 10) score += 6;
    else if (epsGrowth < 0) score -= 8;
  }

  if (margin != null) {
    if (margin > 20) score += 8;
    else if (margin > 8) score += 5;
    else if (margin < 0) score -= 10;
  }

  if (debt != null) {
    if (debt < 0.75) score += 5;
    else if (debt > 3) score -= 8;
  }

  return clamp(score);
}

function trendScore(row) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const day = num(row.dayChangePct);
  const high = num(row.yearHigh);
  const low = num(row.yearLow);

  let score = 50;

  if (price != null && ma50 != null) score += price > ma50 ? 18 : -12;
  if (price != null && ma200 != null) score += price > ma200 ? 18 : -14;

  if (day != null) {
    if (day > 6) score += 14;
    else if (day > 3) score += 10;
    else if (day > 0) score += 5;
    else if (day < -5) score -= 12;
    else if (day < -2) score -= 7;
  }

  if (price != null && high != null && high > 0) {
    const belowHigh = ((high - price) / high) * 100;
    if (belowHigh <= 10) score += 12;
    else if (belowHigh <= 20) score += 7;
    else if (belowHigh > 45) score -= 5;
  }

  if (price != null && low != null && low > 0) {
    const aboveLow = ((price - low) / low) * 100;
    if (aboveLow > 250) score -= 10;
    else if (aboveLow > 150) score -= 5;
  }

  return clamp(score);
}

function asymmetryScore(row) {
  const price = num(row.price);
  const high = num(row.yearHigh);

  let score =
    priceSweetSpotScore(price) * 0.3 +
    marketCapScore(row) * 0.25 +
    liquidityScore(row) * 0.2 +
    fundamentalScore(row) * 0.25;

  if (price != null && high != null && high > price) {
    const upside = ((high - price) / price) * 100;
    if (upside > 100) score += 16;
    else if (upside > 60) score += 12;
    else if (upside > 35) score += 8;
    else if (upside > 15) score += 4;
  }

  return clamp(score);
}

export function calcQualityScore(row = {}) {
  return Math.round(
    clamp(
      fundamentalScore(row) * 0.45 +
        liquidityScore(row) * 0.25 +
        marketCapScore(row) * 0.2 +
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
      trendScore(row) * 0.6 +
        liquidityScore(row) * 0.2 +
        fundamentalScore(row) * 0.2
    )
  );
}

export function getStage(row = {}) {
  const trigger = calcTriggerScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const quality = calcQualityScore(row);

  if (trigger >= 80 && asymmetry >= 72 && quality >= 62) return "Confirmed";
  if (trigger >= 68 && asymmetry >= 62 && quality >= 55) return "Setup";
  if (asymmetry >= 60 && quality >= 50) return "Early";
  if (trigger >= 50 || asymmetry >= 55) return "Watch";
  return "Weak";
}

export function getRecommendation(row = {}) {
  const quality = row.qualityScore ?? calcQualityScore(row);
  const asymmetry = row.asymmetryScore ?? calcAsymmetryScore(row);
  const trigger = row.triggerScore ?? calcTriggerScore(row);

  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const day = num(row.dayChangePct);
  const eps = num(row.eps);
  const pe = num(row.pe);

  const above50 = price != null && ma50 != null ? price > ma50 : true;
  const above200 = price != null && ma200 != null ? price > ma200 : true;
  const positiveDay = day != null ? day > 0 : true;

  const hasFundamentalData = eps != null || pe != null;
  const badFundamentals =
    hasFundamentalData &&
    ((eps != null && eps < 0) || (pe != null && (pe <= 0 || pe > 80)));

  const goodFundamentals =
    !hasFundamentalData ||
    quality >= 58 ||
    (eps != null && eps > 0) ||
    (pe != null && pe > 0 && pe <= 40);

  if (
    trigger >= 80 &&
    asymmetry >= 72 &&
    quality >= 62 &&
    above50 &&
    above200 &&
    positiveDay &&
    goodFundamentals &&
    !badFundamentals
  ) {
    return {
      label: "STRONG BUY",
      reason: "Trend, asymmetry, and fundamentals support action.",
    };
  }

  if (
    trigger >= 68 &&
    asymmetry >= 62 &&
    quality >= 55 &&
    above50 &&
    goodFundamentals &&
    !badFundamentals
  ) {
    return {
      label: "BUY",
      reason: "Strong setup with acceptable fundamental support.",
    };
  }

  if (trigger >= 50 || asymmetry >= 55 || quality >= 55) {
    return {
      label: "WATCH",
      reason: badFundamentals
        ? "Setup exists, but fundamentals are a concern."
        : "Interesting, but needs stronger confirmation.",
    };
  }

  return {
    label: "AVOID",
    reason: "Weak setup or poor risk/reward.",
  };
}

export function buildTechnicalSnapshot(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const day = num(row.dayChangePct);
  const high = num(row.yearHigh);
  const low = num(row.yearLow);

  return {
    oneMonthPct: day,
    threeMonthPct: null,
    relativeVolume:
      volume != null && avgVolume != null && avgVolume > 0
        ? volume / avgVolume
        : avgVolume != null
        ? 1
        : null,
    above20dma: null,
    above50dma: price != null && ma50 != null ? price > ma50 : null,
    above200dma: price != null && ma200 != null ? price > ma200 : null,
    pctFrom20dma: null,
    pctFrom50dma:
      price != null && ma50 != null && ma50 > 0
        ? ((price - ma50) / ma50) * 100
        : null,
    pctFrom200dma:
      price != null && ma200 != null && ma200 > 0
        ? ((price - ma200) / ma200) * 100
        : null,
    pctFrom52wHigh:
      price != null && high != null && high > 0
        ? ((price - high) / high) * 100
        : null,
    pctFrom52wLow:
      price != null && low != null && low > 0
        ? ((price - low) / low) * 100
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
