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
  if (v != null && av != null && av > 0) return v / av;
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

  return { above50, above200, dist50, dist200 };
}

function buyingPressureScore(row = {}) {
  let score = 45;

  const day = num(row.dayChangePct);
  const vr = volRatio(row);
  const { above50, above200, dist50 } = getTrend(row);

  if (above50) score += 12;
  else score -= 8;

  if (above200) score += 8;
  else score -= 5;

  if (day != null) {
    if (day > 10) score += 6;
    else if (day > 6) score += 12;
    else if (day > 3) score += 10;
    else if (day > 1) score += 7;
    else if (day > 0) score += 3;
    else if (day < -5) score -= 12;
    else if (day < -2) score -= 7;
    else if (day < 0) score -= 4;
  }

  if (vr != null) {
    if (vr >= 2) score += 12;
    else if (vr >= 1.5) score += 10;
    else if (vr >= 1.2) score += 6;
    else if (vr < 0.7) score -= 5;
  }

  if (dist50 != null) {
    if (dist50 > 0 && dist50 <= 8) score += 5;
    else if (dist50 > 18) score -= 6;
  }

  return Math.round(clamp(score));
}

function fairValueScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const day = num(row.dayChangePct);
  const yearHigh = num(row.yearHigh);
  const yearLow = num(row.yearLow);
  const { dist50, dist200 } = getTrend(row);

  if (dist50 != null) {
    if (dist50 >= -2 && dist50 <= 8) score += 18;
    else if (dist50 > 8 && dist50 <= 15) score += 8;
    else if (dist50 > 20) score -= 15;
    else if (dist50 < -8) score -= 10;
  }

  if (dist200 != null) {
    if (dist200 >= 0 && dist200 <= 25) score += 8;
    else if (dist200 > 40) score -= 8;
    else if (dist200 < -10) score -= 8;
  }

  if (price != null && yearHigh != null && yearHigh > price) {
    const upside = pct(yearHigh, price);
    if (upside >= 60) score += 12;
    else if (upside >= 30) score += 8;
    else if (upside >= 15) score += 4;
  }

  if (price != null && yearLow != null && yearLow > 0) {
    const offLow = pct(price, yearLow);
    if (offLow > 200) score -= 10;
    else if (offLow > 125) score -= 5;
  }

  if (day != null) {
    if (day > 10) score -= 16;
    else if (day > 7) score -= 9;
    else if (day >= 1 && day <= 5) score += 5;
    else if (day < -3) score -= 6;
  }

  return Math.round(clamp(score));
}

export function calcQualityScore(row = {}) {
  let score = 52;

  const eps = num(row.eps);
  const pe = num(row.pe);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);

  if (eps != null) score += eps > 0 ? 10 : -7;

  if (pe != null) {
    if (pe > 0 && pe <= 18) score += 10;
    else if (pe > 18 && pe <= 35) score += 5;
    else if (pe <= 0) score -= 5;
  }

  if (marketCap != null) {
    if (marketCap >= 300000000 && marketCap <= 10000000000) score += 8;
    else if (marketCap > 10000000000 && marketCap <= 50000000000) score += 4;
  }

  if (avgVolume != null) {
    if (avgVolume >= 1000000) score += 7;
    else if (avgVolume >= 500000) score += 4;
    else if (avgVolume < 250000) score -= 6;
  }

  return Math.round(clamp(score));
}

export function calcAsymmetryScore(row = {}) {
  return fairValueScore(row);
}

export function calcTriggerScore(row = {}) {
  return buyingPressureScore(row);
}

export function calcHeatScore(row = {}) {
  let heat = 0;

  const price = num(row.price);
  const day = num(row.dayChangePct);
  const vr = volRatio(row);
  const yearHigh = num(row.yearHigh);
  const { above50, above200, dist50 } = getTrend(row);

  if (above50) heat += 1;
  if (above200) heat += 1;

  if (day != null && day >= 2 && day <= 9) heat += 1;

  if (vr != null && vr >= 1.5) heat += 1;

  if (price != null && yearHigh != null && yearHigh > 0) {
    const distanceFromHigh = ((yearHigh - price) / yearHigh) * 100;
    if (distanceFromHigh <= 10) heat += 1;
  } else if (dist50 != null && dist50 >= 0 && dist50 <= 8) {
    heat += 1;
  }

  return clamp(heat, 0, 5);
}

export function getTradeReadiness(row = {}) {
  const heatScore = calcHeatScore(row);
  const trigger = row.triggerScore ?? calcTriggerScore(row);
  const quality = row.qualityScore ?? calcQualityScore(row);
  const asymmetry = row.asymmetryScore ?? calcAsymmetryScore(row);

  if (heatScore >= 4 && trigger >= 70 && quality >= 58) {
    return {
      label: "TRADE READY",
      heatScore,
      reason: "Strong setup plus near-term trigger. This is actionable now.",
    };
  }

  if (heatScore >= 3 && trigger >= 62) {
    return {
      label: "WATCH CLOSELY",
      heatScore,
      reason: "Good setup, but it still needs stronger confirmation.",
    };
  }

  return {
    label: "SETUP ONLY",
    heatScore,
    reason: "Interesting stock, but not enough near-term trigger yet.",
  };
}

function composite(row = {}) {
  const pressure = row.triggerScore ?? calcTriggerScore(row);
  const fairValue = row.asymmetryScore ?? calcAsymmetryScore(row);
  const quality = row.qualityScore ?? calcQualityScore(row);
  const heat = calcHeatScore(row);

  return Math.round(
    clamp(pressure * 0.4 + fairValue * 0.3 + quality * 0.2 + heat * 2)
  );
}

function pressureState(score) {
  if (score >= 72) return "GREEN";
  if (score >= 58) return "MIXED";
  return "RED";
}

function fairValueState(score) {
  if (score >= 70) return "GREEN";
  if (score >= 56) return "MIXED";
  return "RED";
}

function language(row, label, pressure, fairValue, tradeReadiness) {
  const day = num(row.dayChangePct);
  const { above50, dist50 } = getTrend(row);

  if (tradeReadiness?.label === "TRADE READY") {
    return {
      reason: "TRADE READY: strong setup with price/volume trigger confirmation.",
      entryNote: "Starter acceptable now. Add only if price and volume keep confirming.",
    };
  }

  if (label === "STRONG BUY") {
    return {
      reason: "Strong setup, but not fully trade-ready yet.",
      entryNote: "Starter acceptable. Best add comes after volume or breakout confirmation.",
    };
  }

  if (label === "BUY") {
    if (pressure === "GREEN" && fairValue !== "GREEN") {
      return {
        reason: "Buying pressure is strong, but entry location is only fair.",
        entryNote: "Small starter only. Prefer pullback before adding.",
      };
    }

    if (fairValue === "GREEN" && pressure !== "GREEN") {
      return {
        reason: "Entry location is attractive, but buying pressure is still building.",
        entryNote: "Starter acceptable. Add only if pressure improves.",
      };
    }

    if (above50) {
      return {
        reason: "Constructive trend with improving buyer control.",
        entryNote: "Starter acceptable. Add on breakout or volume confirmation.",
      };
    }

    return {
      reason: "Setup is improving, but confirmation is incomplete.",
      entryNote: "Small starter only if chart stays constructive.",
    };
  }

  if (label === "WATCH") {
    if (day != null && day > 7) {
      return {
        reason: "Big move already happened; risk of chasing is elevated.",
        entryNote: "Do not chase. Wait for pullback or consolidation.",
      };
    }

    if (pressure === "GREEN" && fairValue === "RED") {
      return {
        reason: "Buyers are active, but price is outside the ideal entry zone.",
        entryNote: "Wait for price to reset closer to fair value.",
      };
    }

    if (pressure === "RED" && fairValue === "GREEN") {
      return {
        reason: "Location is attractive, but buyers have not taken control.",
        entryNote: "Wait for pressure to turn positive.",
      };
    }

    if (dist50 != null && dist50 < 0) {
      return {
        reason: "Setup is forming below trend support.",
        entryNote: "Wait for reclaim of the 50DMA.",
      };
    }

    return {
      reason: "Setup is forming, but pressure and location are not fully aligned.",
      entryNote: "Wait for stronger price action or volume.",
    };
  }

  return {
    reason: "Weak pressure and poor risk/reward.",
    entryNote: "Avoid for now.",
  };
}

export function getRecommendation(row = {}) {
  const trigger = row.triggerScore ?? calcTriggerScore(row);
  const fairValue = row.asymmetryScore ?? calcAsymmetryScore(row);
  const quality = row.qualityScore ?? calcQualityScore(row);
  const heatScore = calcHeatScore(row);

  const score = composite({
    ...row,
    triggerScore: trigger,
    asymmetryScore: fairValue,
    qualityScore: quality,
  });

  const pressure = pressureState(trigger);
  const location = fairValueState(fairValue);
  const tradeReadiness = getTradeReadiness({
    ...row,
    triggerScore: trigger,
    asymmetryScore: fairValue,
    qualityScore: quality,
  });

  const day = num(row.dayChangePct);

  let label = "AVOID";

  if (
    pressure === "GREEN" &&
    location === "GREEN" &&
    score >= 72 &&
    day != null &&
    day > 0.5 &&
    day < 9
  ) {
    label = "STRONG BUY";
  } else if (
    score >= 66 &&
    ((pressure === "GREEN" && location !== "RED") ||
      (location === "GREEN" && pressure !== "RED"))
  ) {
    label = "BUY";
  } else if (score >= 56) {
    label = "WATCH";
  }

  const text = language(row, label, pressure, location, tradeReadiness);

  return {
    label,
    score,
    reason: text.reason,
    entryNote: text.entryNote,
    pressure,
    fairValue: location,
    heatScore,
    tradeReadiness,
  };
}

export function getStage(row = {}) {
  return getRecommendation(row).label;
}

export function buildTechnicalSnapshot(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);
  const vr = volRatio(row);

  return {
    oneMonthPct: row.pct20 ?? row.dayChangePct ?? null,
    threeMonthPct: row.pct60 ?? null,
    relativeVolume: vr,
    heatScore: calcHeatScore(row),
    tradeReadiness: getTradeReadiness(row),
    pressureScore: calcTriggerScore(row),
    fairValueScore: calcAsymmetryScore(row),
    pressure: pressureState(calcTriggerScore(row)),
    fairValue: fairValueState(calcAsymmetryScore(row)),
    above20dma: null,
    above50dma: price != null && ma50 != null ? price > ma50 : null,
    above200dma: price != null && ma200 != null ? price > ma200 : null,
    pctFrom20dma: null,
    pctFrom50dma: pct(price, ma50),
    pctFrom200dma: pct(price, ma200),
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
