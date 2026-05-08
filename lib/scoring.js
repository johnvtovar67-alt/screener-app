// lib/scoring.js

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctFromMA(price, ma) {
  if (!price || !ma) return 0;
  return ((price - ma) / ma) * 100;
}

export function passesInstitutionalFilter(stock) {
  const marketCap = safeNumber(stock.marketCap);
  const avgVolume = safeNumber(stock.avgVolume);
  const price = safeNumber(stock.price);
  const volume = safeNumber(stock.volume);
  const pe = safeNumber(stock.pe, 25);

  if (price < 5) return false;
  if (marketCap < 300000000) return false;
  if (avgVolume < 500000) return false;
  if (volume < 100000) return false;

  // avoid extreme garbage
  if (pe < 0 && pe !== 0) return false;

  return true;
}

export function calcFundamentalScore(stock) {
  let score = 50;

  const marketCap = safeNumber(stock.marketCap);
  const pe = safeNumber(stock.pe);
  const eps = safeNumber(stock.eps);

  if (marketCap > 1000000000) score += 10;
  if (marketCap > 10000000000) score += 5;

  if (eps > 0) score += 15;

  if (pe > 0 && pe < 40) score += 10;

  if (pe > 0 && pe < 20) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calcTechnicalScore(stock) {
  let score = 50;

  const price = safeNumber(stock.price);
  const ma50 = safeNumber(stock.priceAvg50);
  const ma200 = safeNumber(stock.priceAvg200);

  const pct50 = pctFromMA(price, ma50);
  const pct200 = pctFromMA(price, ma200);

  if (price > ma50) score += 10;
  if (price > ma200) score += 15;

  if (pct50 > 3) score += 10;
  if (pct200 > 8) score += 10;

  // not too extended
  if (pct50 > 18) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calcMomentumScore(stock) {
  let score = 50;

  const changePct = safeNumber(stock.dayChangePct);
  const volume = safeNumber(stock.volume);
  const avgVolume = safeNumber(stock.avgVolume);

  if (changePct > 1) score += 10;
  if (changePct > 3) score += 10;
  if (changePct > 5) score += 5;

  if (avgVolume > 0) {
    const relativeVolume = volume / avgVolume;

    if (relativeVolume > 1.2) score += 10;
    if (relativeVolume > 1.8) score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calcAsymmetryScore(stock) {
  let score = 50;

  const marketCap = safeNumber(stock.marketCap);
  const price = safeNumber(stock.price);

  // sweet spot
  if (marketCap > 1000000000 && marketCap < 50000000000) {
    score += 15;
  }

  // avoid huge lumbering names
  if (marketCap > 500000000000) {
    score -= 10;
  }

  // avoid micro junk
  if (marketCap < 500000000) {
    score -= 15;
  }

  if (price > 8 && price < 80) {
    score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calcTriggerScore(stock) {
  let score = 40;

  const price = safeNumber(stock.price);
  const ma50 = safeNumber(stock.priceAvg50);
  const ma200 = safeNumber(stock.priceAvg200);

  const changePct = safeNumber(stock.dayChangePct);

  const volume = safeNumber(stock.volume);
  const avgVolume = safeNumber(stock.avgVolume);

  const pct50 = pctFromMA(price, ma50);

  // trend alignment
  if (price > ma50) score += 10;
  if (price > ma200) score += 15;

  // price acceleration
  if (changePct > 2) score += 10;
  if (changePct > 4) score += 10;

  // volume confirmation
  if (avgVolume > 0) {
    const relativeVolume = volume / avgVolume;

    if (relativeVolume > 1.3) score += 10;
    if (relativeVolume > 2.0) score += 10;
  }

  // avoid chasing extended names
  if (pct50 > 20) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function compositeScore(stock) {
  const fundamental = calcFundamentalScore(stock);
  const technical = calcTechnicalScore(stock);
  const momentum = calcMomentumScore(stock);
  const asymmetry = calcAsymmetryScore(stock);
  const trigger = calcTriggerScore(stock);

  const weighted =
    fundamental * 0.22 +
    technical * 0.23 +
    momentum * 0.20 +
    asymmetry * 0.15 +
    trigger * 0.20;

  return Math.max(0, Math.min(100, Math.round(weighted)));
}

export function getRecommendation(stock) {
  const score = compositeScore(stock);
  const trigger = calcTriggerScore(stock);
  const momentum = calcMomentumScore(stock);

  // elite timing setup
  if (
    score >= 78 &&
    trigger >= 80 &&
    momentum >= 70
  ) {
    return {
      label: "BUY NOW",
      reason:
        "Strong institutional-quality setup with momentum and trigger confirmation.",
      entryNote:
        "Momentum and trend alignment support immediate entry.",
    };
  }

  // strong watchlist
  if (
    score >= 60 &&
    trigger >= 65
  ) {
    return {
      label: "WATCH FOR ENTRY",
      reason:
        "Interesting setup, but institutional alignment is incomplete.",
      entryNote:
        "Monitor for improving technicals and momentum.",
    };
  }

  return {
    label: "AVOID",
    reason:
      "Weak relative setup versus stronger opportunities in the market.",
    entryNote:
      "Avoid for now.",
  };
}

export function getStage(stock) {
  return getRecommendation(stock).label;
}

export function buildTechnicalSnapshot(stock) {
  const price = safeNumber(stock.price);
  const ma50 = safeNumber(stock.priceAvg50);
  const ma200 = safeNumber(stock.priceAvg200);

  return {
    above50dma: price > ma50,
    above200dma: price > ma200,
    pctAbove50dma: pctFromMA(price, ma50),
    pctAbove200dma: pctFromMA(price, ma200),
    momentumScore: calcMomentumScore(stock),
    triggerScore: calcTriggerScore(stock),
  };
}

export function buildFundamentalSnapshot(stock) {
  return {
    marketCap: safeNumber(stock.marketCap),
    pe: safeNumber(stock.pe),
    eps: safeNumber(stock.eps),
    avgVolume: safeNumber(stock.avgVolume),
    volume: safeNumber(stock.volume),
  };
}
