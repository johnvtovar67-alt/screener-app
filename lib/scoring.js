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
  const eps = num(row.eps);
  const pe = num(row.pe);
  const revenueGrowth = num(row.revenueGrowthPct);
  const epsGrowth = num(row.epsGrowthPct);
  const margin = num(row.operatingMarginPct);
  const debt = num(row.debtToEquity);
  const inst = num(row.institutionalScore);

  let score = 58; // missing data = neutral/slightly constructive, not punitive

  if (eps != null) score += eps > 0 ? 12 : -10;

  if (pe != null) {
    if (pe > 0 && pe <= 18) score += 14;
    else if (pe > 18 && pe <= 35) score += 8;
    else if (pe > 35 && pe <= 60) score += 2;
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
  const high = num(row.yearHigh);
  const low = num(row.yearLow);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  let score = 50;

  if (price != null && ma50 != null) score += price > ma50 ? 18 : -10;
  if (price != null && ma200 != null) score += price > ma200 ? 16 : -12;

  if (day != null) {
    if (day > 8) score += 16;
    else if (day > 5) score += 13;
    else if (day > 2) score += 9;
    else if (day > 0) score += 5;
    else if (day < -6) score -= 12;
    else if (day < -3) score -= 8;
  }

  if (volume != null && avgVolume != null && avgVolume > 0) {
    const relVol = volume / avgVolume;
    if (relVol >= 2) score += 10;
    else if (relVol >= 1.3) score += 6;
    else if (relVol < 0.5) score -= 4;
  }

  if (price != null && high != null && high > 0) {
    const belowHigh = ((high - price) / high) * 100;
    if (belowHigh <= 8) score += 12;
    else if (belowHigh <= 18) score += 7;
    else if (belowHigh > 45) score -= 5;
  }

  if (price != null && low != null && low > 0) {
    const aboveLow = ((price - low) / low) * 100;
    if (aboveLow > 250) score -= 8;
    else if (aboveLow > 150) score -= 4;
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

export function getStage(row = {}) {
  const trigger = calcTriggerScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const quality = calcQualityScore(row);

  if (trigger >= 80 && asymmetry >= 72 && quality >= 62) return "Strong Buy";
  if (trigger >= 68 && asymmetry >= 62 && quality >= 55) return "Buy";
  if (trigger >= 50 || asymmetry >= 55 || quality >= 55) return "Watch";
  return "Avoid";
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

  const totalScore = Math.round(
    clamp(trigger * 0.45 + asymmetry * 0.35 + quality * 0.2)
  );

  const above50 = price != null && ma50 != null ? price > ma50 : true;
  const above200 = price != null && ma200 != null ? price > ma200 : true;
  const positiveDay = day != null ? day > 0 : true;

  const hasFundamentalData = eps != null || pe != null;

  const badFundamentals =
    hasFundamentalData &&
    ((eps != null && eps < 0 && quality < 55) ||
      (pe != null && (pe <= 0 || pe > 100) && quality < 55));

  if (
    totalScore >= 82 &&
    trigger >= 76 &&
    asymmetry >= 70 &&
    quality >= 60 &&
    above50 &&
    above200 &&
    positiveDay &&
    !badFundamentals
  ) {
    return {
      label: "STRONG BUY",
      score: totalScore,
      reason:
        "High-conviction asymmetry setup with strong technical confirmation and acceptable fundamentals.",
      entryNote: "Actionable now. Consider scaling in carefully.",
    };
  }

  if (
    totalScore >= 70 &&
    trigger >= 64 &&
    asymmetry >= 60 &&
    quality >= 52 &&
    above50 &&
    !badFundamentals
  ) {
    return {
      label: "BUY",
      score: totalScore,
      reason:
        "Attractive setup with favorable upside, but one area still needs confirmation.",
      entryNote: "Starter position only. Add if price, volume, or fundamentals confirm.",
    };
  }

  if (totalScore >= 55 || trigger >= 50 || asymmetry >= 55 || quality >= 55) {
    return {
      label: "WATCH",
      score: totalScore,
      reason: badFundamentals
        ? "Setup exists, but confirmed fundamentals are a concern."
        : "Interesting setup, but not enough confirmation yet.",
      entryNote: "Wait for stronger trend, volume, or fundamental confirmation.",
    };
  }

  return {
    label: "AVOID",
    score: totalScore,
    reason: "Setup is too weak, too speculative, or data quality is too poor.",
    entryNote: "Avoid for now. Revisit only if the setup materially improves.",
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
