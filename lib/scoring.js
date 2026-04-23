function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function pctDiff(a, b) {
  if (!a || !b) return null;
  return ((a - b) / b) * 100;
}

/* ======================
   CORE SCORES
====================== */

export function calcQualityScore(d) {
  let score = 0;

  const rev = toNumber(d.revenueGrowthPct);
  const eps = toNumber(d.epsGrowthPct);
  const margin = toNumber(d.operatingMarginPct);
  const debt = toNumber(d.debtToEquity, 2);
  const inst = toNumber(d.institutionalScore);

  if (rev > 20) score += 25;
  else if (rev > 10) score += 18;
  else if (rev > 0) score += 10;

  if (eps > 20) score += 20;
  else if (eps > 10) score += 15;

  if (margin > 20) score += 20;
  else if (margin > 10) score += 14;

  if (debt < 0.5) score += 15;
  else if (debt < 1.0) score += 10;

  if (inst > 70) score += 10;

  return clamp(score);
}

function scoreMomentum(d) {
  const m1 = toNumber(d.oneMonthPct);
  const m3 = toNumber(d.threeMonthPct);
  const vol = toNumber(d.relativeVolume);

  let score = 0;

  if (m1 > 15) score += 30;
  else if (m1 > 8) score += 20;

  if (m3 > 20) score += 20;

  if (vol > 1.5) score += 20;
  else if (vol > 1.2) score += 10;

  return clamp(score);
}

function scoreNarrative(d) {
  const bucket = d.bucket || "";

  if (bucket === "ai_crypto") return 95;
  if (bucket === "space_quantum") return 85;
  if (bucket === "sub25") return 75;
  if (bucket === "event") return 70;

  return 50;
}

export function calcAsymmetryScore(d) {
  return clamp(
    scoreMomentum(d) * 0.4 +
    scoreNarrative(d) * 0.4 +
    calcQualityScore(d) * 0.2
  );
}

export function getStage(d) {
  const price = d.price;
  const sma20 = d.sma20;
  const sma50 = d.sma50;

  if (!price || !sma20 || !sma50) return "Base";

  if (price > sma20 && price > sma50) return "Emerging";
  if (price < sma50) return "Broken";

  return "Base";
}

export function calcTriggerScore(d) {
  let score = 0;

  const vol = toNumber(d.relativeVolume);
  const m1 = toNumber(d.oneMonthPct);
  const stage = getStage(d);

  if (stage === "Emerging") score += 40;

  if (vol > 1.5) score += 25;
  else if (vol > 1.2) score += 15;

  if (m1 > 10) score += 20;

  return clamp(score);
}

/* ======================
   RECOMMENDATION
====================== */

export function getRecommendation(d) {
  const trigger = calcTriggerScore(d);
  const asym = calcAsymmetryScore(d);
  const stage = getStage(d);

  if (trigger > 70 && asym > 55 && stage === "Emerging") {
    return { label: "Buy Now", color: "green", reason: "Momentum + setup aligned" };
  }

  if (trigger > 60 && asym > 50) {
    return { label: "Buy on Breakout", color: "yellow", reason: "Close to triggering" };
  }

  if (trigger > 45) {
    return { label: "Watch", color: "yellow", reason: "Needs confirmation" };
  }

  return { label: "Avoid", color: "red", reason: "Weak setup" };
}

/* ======================
   SNAPSHOTS
====================== */

export function buildTechnicalSnapshot(d) {
  return {
    oneMonthPct: d.oneMonthPct,
    threeMonthPct: d.threeMonthPct,
    relativeVolume: d.relativeVolume,
    above20dma: d.price > d.sma20,
    above50dma: d.price > d.sma50,
    pctFrom20dma: pctDiff(d.price, d.sma20),
    pctFrom50dma: pctDiff(d.price, d.sma50),
  };
}

export function buildFundamentalSnapshot(d) {
  return {
    revenueGrowthPct: d.revenueGrowthPct,
    epsGrowthPct: d.epsGrowthPct,
    operatingMarginPct: d.operatingMarginPct,
    debtToEquity: d.debtToEquity,
    marketCap: d.marketCap,
    institutionalScore: d.institutionalScore,
  };
}

export function enrichStock(stock) {
  const qualityScore = calcQualityScore(stock);
  const asymmetryScore = calcAsymmetryScore(stock);
  const triggerScore = calcTriggerScore(stock);
  const stage = getStage(stock);
  const recommendation = getRecommendation(stock);

  return {
    ...stock,
    qualityScore,
    asymmetryScore,
    triggerScore,
    stage,
    recommendation,
    technicalSnapshot: buildTechnicalSnapshot(stock),
    fundamentalSnapshot: buildFundamentalSnapshot(stock),
  };
}
