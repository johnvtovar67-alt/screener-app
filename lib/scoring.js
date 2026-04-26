// lib/scoring.js

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/* =========================
   TREND / MOMENTUM
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
    if (day > 10) score += 8;       // strong, but avoid over-rewarding huge spike days
    else if (day > 5) score += 15;
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

/* =========================
   ASYMMETRY / UPSIDE
========================= */
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

/* =========================
   QUALITY / FUNDAMENTALS
========================= */
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
   FINAL DECISION ENGINE
========================= */
export function getRecommendation(row = {}) {
  const trigger = trendScore(row);
  const asym = asymmetryScore(row);
  const quality = qualityScore(row);

  const score = Math.round(trigger * 0.5 + asym * 0.3 + quality * 0.2);

  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const day = num(row.dayChangePct);
  const vol = num(row.volume);
  const avgVol = num(row.avgVolume);

  const above50 = price && ma50 ? price > ma50 : false;
  const momentum = day != null ? day > 1 : false;
  const notTooExtended = day != null ? day < 12 : true;

  const volumeConfirm =
    vol && avgVol && avgVol > 0 ? vol / avgVol > 1.1 : false;

  // Confirmed buy-now setup
  if (score >= 80 && above50 && momentum && volumeConfirm && notTooExtended) {
    return {
      label: "STRONG BUY",
      score,
      reason: "Confirmed breakout with volume.",
      entryNote: "BUY NOW — starter position justified.",
    };
  }

  // Early buy-now setup
  if (score >= 77 && above50 && momentum && notTooExtended) {
    return {
      label: "STRONG BUY",
      score,
      reason: "Early momentum — front-running confirmation.",
      entryNote: "BUY NOW starter. Add only if volume confirms.",
    };
  }

  // Good setup, but not urgent
  if (score >= 72) {
    return {
      label: "BUY",
      score,
      reason: "High-quality setup nearing confirmation.",
      entryNote: "Starter position acceptable. Add on confirmation.",
    };
  }

  // Developing setup
  if (score >= 65) {
    return {
      label: "WATCH",
      score,
      reason: "Setup forming.",
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
   EXPORTED HELPERS
========================= */
export function calcTriggerScore(row = {}) {
  return trendScore(row);
}

export function calcAsymmetryScore(row = {}) {
  return asymmetryScore(row);
}

export function calcQualityScore(row = {}) {
  return qualityScore(row);
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
