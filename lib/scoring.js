function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/* ======================
   QUALITY SCORE (floor)
====================== */
export function calcQualityScore(d) {
  let score = 0;

  if (d?.revenueGrowthYoy != null) {
    if (d.revenueGrowthYoy > 20) score += 25;
    else if (d.revenueGrowthYoy > 5) score += 18;
    else if (d.revenueGrowthYoy > 0) score += 10;
    else score += 4;
  }

  if (d?.grossMargin != null) {
    if (d.grossMargin > 50) score += 20;
    else if (d.grossMargin > 30) score += 14;
    else if (d.grossMargin > 15) score += 8;
  }

  if (d?.currentRatio != null) {
    if (d.currentRatio > 1.5) score += 20;
    else if (d.currentRatio > 1.1) score += 14;
    else if (d.currentRatio > 0.9) score += 8;
  }

  if (d?.shareDilutionYoy != null) {
    if (d.shareDilutionYoy < 3) score += 15;
    else if (d.shareDilutionYoy < 8) score += 10;
    else if (d.shareDilutionYoy < 15) score += 5;
  }

  return Math.round(clamp(score));
}

/* ======================
   ASYMMETRY COMPONENTS
====================== */

function scoreMomentum(d) {
  let score = 0;

  if (d?.return20d != null) score += Math.min(d.return20d * 200, 30);
  if (d?.return50d != null) score += Math.min(d.return50d * 150, 20);

  if (d?.sma20 != null && d?.price != null && d.price > d.sma20) score += 10;
  if (d?.sma50 != null && d?.price != null && d.price > d.sma50) score += 10;

  if (d?.relativeVolume20d != null) {
    score += Math.min(d.relativeVolume20d, 2) * 10;
  }

  return clamp(score);
}

function scoreDiscovery(d) {
  let score = 0;

  if (d?.marketCap != null) {
    if (d.marketCap < 2e9) score += 30;
    else if (d.marketCap < 5e9) score += 20;
    else if (d.marketCap < 10e9) score += 10;
  }

  if (d?.institutionalOwnershipPct != null) {
    if (d.institutionalOwnershipPct < 40) score += 30;
    else if (d.institutionalOwnershipPct < 70) score += 15;
  }

  return clamp(score);
}

function scoreNarrative(d) {
  const tags = Array.isArray(d?.themeTags) ? d.themeTags : [];

  if (tags.includes("ai")) return 100;
  if (tags.includes("bitcoin")) return 95;
  if (tags.includes("crypto")) return 90;
  if (tags.includes("miner")) return 90;
  if (tags.includes("defense")) return 85;

  return 30;
}

function scoreExpansion(d) {
  let score = 0;

  if (d?.atrPct != null) {
    if (d.atrPct > 4 && d.atrPct < 10) score += 40;
    else if (d.atrPct >= 10) score += 25;
  }

  if (d?.rangeExpansion != null) {
    score += Math.min(d.rangeExpansion * 20, 30);
  }

  return clamp(score);
}

/* ======================
   FINAL ASYMMETRY SCORE
====================== */

export function calcAsymmetryScore(d) {
  const raw =
    scoreMomentum(d) * 0.35 +
    scoreDiscovery(d) * 0.20 +
    scoreNarrative(d) * 0.15 +
    scoreExpansion(d) * 0.15 +
    calcQualityScore(d) * 0.15;

  return Math.round(clamp(raw));
}

/* ======================
   STAGE
====================== */

export function getStage(d) {
  const price = d?.price ?? null;
  const sma20 = d?.sma20 ?? null;
  const sma50 = d?.sma50 ?? null;
  const relativeVolume20d = d?.relativeVolume20d ?? 0;
  const return20d = d?.return20d ?? 0;

  if (price == null) return "Base";

  if (sma50 != null && price < sma50) return "Broken";

  if (sma20 != null && price > sma20 && relativeVolume20d > 1.3) {
    return "Emerging";
  }

  if (sma20 != null && price > sma20 && return20d > 0.15) {
    return "Extended";
  }

  return "Base";
}
