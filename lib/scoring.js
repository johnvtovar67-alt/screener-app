// lib/scoring.js

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function pct(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function volRatio(row = {}) {
  const v = num(row.volume);
  const av = num(row.avgVolume);

  if (v != null && av != null && av > 0) {
    return v / av;
  }

  return null;
}

function getTrend(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);

  const above50 = price != null && ma50 != null ? price > ma50 : false;
  const above200 = price != null && ma200 != null ? price > ma200 : false;

  const dist50 = pct(price, ma50);
  const dist200 = pct(price, ma200);

  return {
    above50,
    above200,
    dist50,
    dist200,
  };
}

export function passesInstitutionalFilter(row = {}) {
  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);
  const pe = num(row.pe);
  const eps = num(row.eps);

  if (price == null || price < 5) return false;

  if (marketCap == null || marketCap < 300000000) {
    return false;
  }

  if (avgVolume == null || avgVolume < 500000) {
    return false;
  }

  if (eps != null && eps < -5) {
    return false;
  }

  if (pe != null && pe < -50) {
    return false;
  }

  return true;
}

export function calcFundamentalScore(row = {}) {
  let score = 50;

  const eps = num(row.eps);
  const pe = num(row.pe);
  const marketCap = num(row.marketCap);

  if (eps != null) {
    if (eps > 0) score += 15;
    else score -= 10;
  }

  if (pe != null) {
    if (pe > 0 && pe <= 20) score += 12;
    else if (pe <= 35) score += 7;
    else if (pe > 60) score -= 10;
  }

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 15000000000) {
      score += 10;
    }
  }

  return Math.round(clamp(score));
}

export function calcTechnicalScore(row = {}) {
  let score = 50;

  const { above50, above200, dist50, dist200 } = getTrend(row);

  if (above50) score += 15;
  else score -= 10;

  if (above200) score += 12;
  else score -= 8;

  if (dist50 != null) {
    if (dist50 >= 0 && dist50 <= 8) score += 10;
    if (dist50 > 20) score -= 12;
  }

  if (dist200 != null) {
    if (dist200 >= 0 && dist200 <= 25) score += 8;
    if (dist200 > 50) score -= 10;
  }

  return Math.round(clamp(score));
}

export function calcMomentumScore(row = {}) {
  let score = 50;

  const day = num(row.dayChangePct);
  const vr = volRatio(row);

  if (day != null) {
    if (day >= 5) score += 18;
    else if (day >= 2) score += 12;
    else if (day > 0) score += 6;
    else if (day <= -5) score -= 18;
    else if (day < 0) score -= 8;
  }

  if (vr != null) {
    if (vr >= 2) score += 15;
    else if (vr >= 1.5) score += 10;
    else if (vr >= 1.2) score += 6;
    else if (vr < 0.7) score -= 8;
  }

  return Math.round(clamp(score));
}

export function calcAsymmetryScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  if (price != null && yearHigh != null && yearHigh > 0) {
    const upside = pct(yearHigh, price);

    if (upside >= 50) score += 18;
    else if (upside >= 30) score += 12;
    else if (upside >= 15) score += 6;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const offLow = pct(price, yearLow);

    if (offLow > 250) score -= 15;
    else if (offLow > 150) score -= 8;
  }

  return Math.round(clamp(score));
}

export function calcTriggerScore(row = {}) {
  let score = 45;

  const { above50, above200, dist50 } = getTrend(row);

  const day = num(row.dayChangePct);
  const vr = volRatio(row);

  if (above50) score += 15;
  if (above200) score += 12;

  if (dist50 != null) {
    if (dist50 >= 0 && dist50 <= 5) score += 12;
    else if (dist50 > 15) score -= 10;
  }

  if (day != null) {
    if (day >= 4) score += 15;
    else if (day >= 2) score += 10;
    else if (day > 0) score += 5;
    else if (day <= -4) score -= 15;
  }

  if (vr != null) {
    if (vr >= 2) score += 15;
    else if (vr >= 1.5) score += 10;
    else if (vr >= 1.2) score += 5;
  }

  return Math.round(clamp(score));
}

export function compositeScore(row = {}) {
  const fundamentals = calcFundamentalScore(row);
  const technicals = calcTechnicalScore(row);
  const momentum = calcMomentumScore(row);
  const asymmetry = calcAsymmetryScore(row);

  let score =
    fundamentals * 0.3 +
    technicals * 0.3 +
    momentum * 0.2 +
    asymmetry * 0.2;

  const trigger = calcTriggerScore(row);

  if (trigger >= 80) score += 5;

  return Math.round(clamp(score));
}

export function getRecommendation(row = {}) {
  const trigger = calcTriggerScore(row);
  const score = compositeScore(row);

  const { above50, above200 } = getTrend(row);

  const passes = passesInstitutionalFilter(row);

  if (!passes) {
    return {
      label: "AVOID",
      score,
      triggerScore: trigger,
      reason: "Fails institutional-grade liquidity or quality filters.",
      entryNote: "Avoid for now.",
    };
  }

  const strongTrend = above50 && above200;

  if (
    score >= 90 &&
    trigger >= 85 &&
    strongTrend
  ) {
    return {
      label: "BUY NOW",
      score,
      triggerScore: trigger,
      reason:
        "Strong institutional-quality setup with aligned trend, momentum, and trigger confirmation.",
      entryNote:
        "Starter position is reasonable now. Add only if momentum and volume continue confirming.",
    };
  }

  if (score >= 80) {
    return {
      label: "WATCH FOR ENTRY",
      score,
      triggerScore: trigger,
      reason:
        "Strong overall setup, but trigger timing is not fully confirmed yet.",
      entryNote:
        "Wait for better breakout confirmation, stronger volume, or improved momentum.",
    };
  }

  if (score >= 60) {
    return {
      label: "WATCH",
      score,
      triggerScore: trigger,
      reason:
        "Interesting setup, but institutional alignment is incomplete.",
      entryNote:
        "Monitor for improving technicals and momentum.",
    };
  }

  return {
    label: "AVOID",
    score,
    triggerScore: trigger,
    reason:
      "Weak relative setup versus stronger opportunities in the market.",
    entryNote:
      "Avoid for now.",
  };
}

export function getStage(row = {}) {
  return getRecommendation(row).label;
}

export function buildTechnicalSnapshot(row = {}) {
  const { above50, above200, dist50, dist200 } = getTrend(row);

  return {
    triggerScore: calcTriggerScore(row),
    technicalScore: calcTechnicalScore(row),
    momentumScore: calcMomentumScore(row),

    above50dma: above50,
    above200dma: above200,

    pctFrom50dma: dist50,
    pctFrom200dma: dist200,
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    fundamentalScore: calcFundamentalScore(row),
    asymmetryScore: calcAsymmetryScore(row),

    marketCap: row.marketCap ?? null,
    pe: row.pe ?? null,
    eps: row.eps ?? null,
  };
}
