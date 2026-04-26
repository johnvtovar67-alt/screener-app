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

function volumeRatio(row = {}) {
  const relVol = num(row.relativeVolume);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  if (relVol != null) return relVol;
  if (volume != null && avgVolume != null && avgVolume > 0) {
    return volume / avgVolume;
  }
  return null;
}

function qualityScore(row = {}) {
  let score = 55;

  const eps = num(row.eps);
  const pe = num(row.pe);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);

  if (eps != null) score += eps > 0 ? 10 : -8;

  if (pe != null) {
    if (pe > 0 && pe <= 22) score += 8;
    else if (pe > 22 && pe <= 40) score += 3;
    else if (pe <= 0) score -= 6;
  }

  if (marketCap != null) {
    if (marketCap >= 300000000 && marketCap <= 10000000000) score += 8;
    else if (marketCap > 10000000000 && marketCap <= 50000000000) score += 4;
    else if (marketCap < 300000000) score -= 8;
  }

  if (avgVolume != null) {
    if (avgVolume >= 1000000) score += 7;
    else if (avgVolume >= 500000) score += 4;
    else if (avgVolume < 250000) score -= 6;
  }

  return Math.round(clamp(score));
}

function asymmetryScore(row = {}) {
  let score = 55;

  const price = num(row.price);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);

  if (price != null && yearHigh != null && yearHigh > price) {
    const upside = ((yearHigh - price) / price) * 100;

    if (upside >= 80) score += 18;
    else if (upside >= 50) score += 13;
    else if (upside >= 30) score += 9;
    else if (upside >= 15) score += 5;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const offLow = ((price - yearLow) / yearLow) * 100;

    if (offLow > 250) score -= 8;
    else if (offLow > 150) score -= 4;
  }

  return Math.round(clamp(score));
}

function triggerScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const day = num(row.dayChangePct);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const ma200 = num(row.ma200 ?? row.priceAvg200);
  const vr = volumeRatio(row);

  if (price != null && ma50 != null) score += price > ma50 ? 12 : -8;
  if (price != null && ma200 != null) score += price > ma200 ? 8 : -6;

  if (day != null) {
    if (day > 10) score += 3;
    else if (day > 5) score += 12;
    else if (day > 2) score += 10;
    else if (day > 0.5) score += 6;
    else if (day > 0) score += 3;
    else if (day < -5) score -= 12;
    else if (day < -2) score -= 7;
    else if (day < 0) score -= 4;
  }

  if (vr != null) {
    if (vr >= 2) score += 10;
    else if (vr >= 1.3) score += 7;
    else if (vr >= 1.05) score += 3;
    else if (vr < 0.6) score -= 4;
  }

  if (row.breakout20) score += 10;
  if (row.pullback50) score += 5;

  return Math.round(clamp(score));
}

function compositeScore(row = {}) {
  const trigger = row.triggerScore ?? triggerScore(row);
  const asymmetry = row.asymmetryScore ?? asymmetryScore(row);
  const quality = row.qualityScore ?? qualityScore(row);

  return Math.round(clamp(trigger * 0.5 + asymmetry * 0.3 + quality * 0.2));
}

function reasonAndEntry(row, label) {
  const day = num(row.dayChangePct);
  const vr = volumeRatio(row);
  const price = num(row.price);
  const ma50 = num(row.ma50 ?? row.priceAvg50);
  const above50 = price != null && ma50 != null ? price > ma50 : null;

  if (label === "STRONG BUY") {
    if (vr != null && vr >= 1.3) {
      return {
        reason: "BUY NOW: price strength is confirmed by volume.",
        entryNote: "BUY NOW starter. Add only if it holds strength.",
      };
    }

    return {
      reason: "BUY NOW: momentum is strong, but volume is still building.",
      entryNote: "Small starter now. Add only if volume confirms.",
    };
  }

  if (label === "BUY") {
    if (day != null && day > 5) {
      return {
        reason: "Strong momentum, but avoid chasing the full move.",
        entryNote: "Starter only. Prefer pullback or intraday consolidation.",
      };
    }

    if (above50 === true) {
      return {
        reason: "Constructive trend with improving momentum.",
        entryNote: "Starter acceptable. Add on breakout or volume confirmation.",
      };
    }

    if (row.pullback50) {
      return {
        reason: "Potential pullback entry near trend support.",
        entryNote: "Starter acceptable only if 50DMA support holds.",
      };
    }

    return {
      reason: "Good setup, but still needs stronger confirmation.",
      entryNote: "Small starter only. Do not add until confirmation.",
    };
  }

  if (label === "WATCH") {
    if (day != null && day > 5) {
      return {
        reason: "Big move already happened; wait for a cleaner entry.",
        entryNote: "Do not chase. Wait for pullback or consolidation.",
      };
    }

    if (above50 === false) {
      return {
        reason: "Setup forming, but price is still below trend support.",
        entryNote: "Wait for reclaim of 50DMA.",
      };
    }

    return {
      reason: "Setup forming, but not actionable yet.",
      entryNote: "Wait for stronger price action or volume.",
    };
  }

  return {
    reason: "Weak momentum or poor risk/reward.",
    entryNote: "Avoid for now.",
  };
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
  const score = compositeScore({
    ...row,
    triggerScore: trigger,
    asymmetryScore: asymmetry,
    qualityScore: quality,
  });

  const day = num(row.dayChangePct);
  const vr = volumeRatio(row);

  let label = "AVOID";

  if (
    score >= 76 &&
    trigger >= 68 &&
    day != null &&
    day > 2 &&
    day < 10 &&
    (vr == null || vr >= 1.05)
  ) {
    label = "STRONG BUY";
  } else if (
    score >= 71 &&
    trigger >= 62 &&
    day != null &&
    day > 0.5
  ) {
    label = "BUY";
  } else if (score >= 60) {
    label = "WATCH";
  }

  const text = reasonAndEntry(row, label);

  return {
    label,
    score,
    reason: text.reason,
    entryNote: text.entryNote,
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
