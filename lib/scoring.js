// lib/scoring.js

function num(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function roundScore(value) {
  return Math.round(clamp(value, 0, 100));
}

function pctFrom(price, base) {
  const p = num(price);
  const b = num(base);

  if (p == null || b == null || b <= 0) return null;

  return ((p - b) / b) * 100;
}

function relativeVolume(row = {}) {
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);

  if (volume == null || avgVolume == null || avgVolume <= 0) return null;

  return volume / avgVolume;
}

function trendData(row = {}) {
  const price = num(row.price);
  const ma50 = num(row.priceAvg50);
  const ma200 = num(row.priceAvg200);

  return {
    price,
    ma50,
    ma200,
    above50: price != null && ma50 != null && ma50 > 0 ? price > ma50 : null,
    above200:
      price != null && ma200 != null && ma200 > 0 ? price > ma200 : null,
    pctFrom50: pctFrom(price, ma50),
    pctFrom200: pctFrom(price, ma200),
  };
}

function labelDisplay(label) {
  const clean = String(label || "").toUpperCase();

  if (clean === "BUY NOW") return "Buy Now";
  if (clean === "WATCH" || clean === "WATCH FOR ENTRY") return "Watch";

  return "Avoid";
}

function missingDataPenalty(row = {}) {
  let penalty = 0;

  if (num(row.marketCap) == null) penalty += 3;
  if (num(row.avgVolume) == null) penalty += 5;
  if (num(row.priceAvg50) == null) penalty += 6;
  if (num(row.priceAvg200) == null) penalty += 6;
  if (num(row.eps) == null) penalty += 2;
  if (num(row.pe) == null) penalty += 2;

  return penalty;
}

function trueTradabilityFailure(row = {}) {
  const price = num(row.price);

  if (price == null) return true;
  if (price < 5) return true;

  return false;
}

export function passesInstitutionalFilter(row = {}) {
  return !trueTradabilityFailure(row);
}

export function getArchetype(row = {}) {
  const symbol = String(row.symbol || "").toUpperCase();
  const name = String(row.name || row.companyName || "").toUpperCase();

  const reits = [
    "AHR",
    "AGNC",
    "O",
    "VICI",
    "PLD",
    "AMT",
    "CCI",
    "EQIX",
    "WELL",
    "DLR",
    "SPG",
    "EPR",
    "STAG",
    "ADC",
    "NNN",
    "IRM",
    "ARE",
    "BXP",
    "KIM",
    "REG",
  ];

  const pipelineIncomeEnergy = [
    "KMI",
    "WMB",
    "TRGP",
    "LNG",
    "ET",
    "EPD",
    "OKE",
    "PAGP",
    "MPLX",
    "ENB",
    "WES",
    "PAA",
    "AM",
  ];

  const biotechBinary = [
    "ALMS",
    "BCRX",
    "VKTX",
    "SRPT",
    "MRNA",
    "NVAX",
    "SAVA",
    "CRSP",
    "EDIT",
    "NTLA",
    "BEAM",
    "BLUE",
    "IOVA",
    "GERN",
    "ALT",
    "RXRX",
    "SDGR",
    "DNA",
  ];

  const crypto = [
    "MSTR",
    "MARA",
    "RIOT",
    "CLSK",
    "COIN",
    "HOOD",
    "HUT",
    "BTDR",
    "IREN",
    "WULF",
    "BITF",
    "CIFR",
  ];

  const financials = [
    "BAC",
    "C",
    "WFC",
    "JPM",
    "GS",
    "MS",
    "SCHW",
    "BGC",
    "BX",
    "KKR",
    "APO",
    "SOFI",
    "ALLY",
    "RKT",
    "UPST",
    "AFRM",
    "PYPL",
    "SQ",
  ];

  const airlines = ["AAL", "UAL", "DAL", "LUV", "JBLU", "ALK"];
  const travel = ["RCL", "CCL", "NCLH", "ABNB", "EXPE", "BKNG"];

  const megaCapTech = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "GOOGL",
    "GOOG",
    "TSLA",
    "AVGO",
    "AMD",
    "NFLX",
    "ORCL",
  ];

  const growthMomentum = [
    "PLTR",
    "CRWD",
    "NET",
    "DDOG",
    "SNOW",
    "SHOP",
    "HIMS",
    "CELH",
    "SOUN",
    "BBAI",
    "AAOI",
    "ARM",
    "SMCI",
    "MU",
    "ROKU",
    "UBER",
    "DKNG",
    "ZS",
    "PANW",
    "ANET",
    "AI",
  ];

  if (
    reits.includes(symbol) ||
    name.includes("REIT") ||
    name.includes("REAL ESTATE")
  ) {
    return "REIT / Income";
  }

  if (
    pipelineIncomeEnergy.includes(symbol) ||
    name.includes("PIPELINE") ||
    name.includes("MIDSTREAM") ||
    name.includes("PARTNERS") ||
    name.includes("ENERGY TRANSFER") ||
    name.includes("ENTERPRISE PRODUCTS")
  ) {
    return "Pipeline / Income Energy";
  }

  if (
    biotechBinary.includes(symbol) ||
    name.includes("BIOTECH") ||
    name.includes("BIOPHARMA") ||
    name.includes("THERAPEUTICS") ||
    name.includes("PHARMACEUTICAL") ||
    name.includes("PHARMA") ||
    name.includes("BIOSCIENCES") ||
    name.includes("GENOMICS") ||
    name.includes("GENETICS")
  ) {
    return "Biotech / Binary Event";
  }

  if (
    crypto.includes(symbol) ||
    name.includes("BITCOIN") ||
    name.includes("CRYPTO")
  ) {
    return "Crypto Proxy";
  }

  if (airlines.includes(symbol) || name.includes("AIRLINES")) {
    return "Airline / Cyclical";
  }

  if (travel.includes(symbol)) return "Travel / Cyclical";

  if (
    financials.includes(symbol) ||
    name.includes("BANK") ||
    name.includes("FINANCIAL")
  ) {
    return "Financial / Rate Sensitive";
  }

  if (megaCapTech.includes(symbol)) return "Mega-Cap Leadership";
  if (growthMomentum.includes(symbol)) return "Growth / Momentum";

  return "General Equity";
}

function buyNowAllowedByArchetype(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return false;
  if (archetype === "Pipeline / Income Energy") return false;
  if (archetype === "Airline / Cyclical") return false;
  if (archetype === "Biotech / Binary Event") return false;

  return true;
}

function archetypeRiskPenalty(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return 10;
  if (archetype === "Pipeline / Income Energy") return 7;
  if (archetype === "Airline / Cyclical") return 10;
  if (archetype === "Travel / Cyclical") return 7;
  if (archetype === "Financial / Rate Sensitive") return 4;
  if (archetype === "Crypto Proxy") return 9;
  if (archetype === "Biotech / Binary Event") return 18;

  return 0;
}

function marketRelativeScore(row = {}) {
  const stockDay = num(row.dayChangePct);
  const spyDay = num(row.spyDayChangePct);
  const qqqDay = num(row.qqqDayChangePct);

  let score = 50;

  if (stockDay == null) return score;

  if (spyDay != null) {
    const spread = stockDay - spyDay;

    if (spread >= 4) score += 18;
    else if (spread >= 2) score += 12;
    else if (spread >= 1) score += 7;
    else if (spread <= -4) score -= 18;
    else if (spread <= -2) score -= 12;
    else if (spread <= -1) score -= 7;
  }

  if (qqqDay != null) {
    const spread = stockDay - qqqDay;

    if (spread >= 4) score += 18;
    else if (spread >= 2) score += 12;
    else if (spread >= 1) score += 7;
    else if (spread <= -4) score -= 18;
    else if (spread <= -2) score -= 12;
    else if (spread <= -1) score -= 7;
  }

  if (spyDay == null && qqqDay == null) {
    if (stockDay >= 5) score += 16;
    else if (stockDay >= 2) score += 10;
    else if (stockDay >= 0.5) score += 5;
    else if (stockDay <= -5) score -= 16;
    else if (stockDay <= -2) score -= 10;
    else if (stockDay < 0) score -= 5;
  }

  return roundScore(score);
}

function historicalDataAvailable(row = {}) {
  return row.historicalDataAvailable === true;
}

function historicalConfirmationScore(row = {}) {
  if (!historicalDataAvailable(row)) return null;
  return roundScore(row.historicalConfirmationScore ?? 50);
}

function historicalResistanceOverhead(row = {}) {
  return num(row.resistanceOverheadPct);
}

function historicalMomentum5(row = {}) {
  return num(row.momentum5Pct);
}

function historicalMomentum10(row = {}) {
  return num(row.momentum10Pct);
}

function historicalTrendSlope(row = {}) {
  return num(row.shortTrendSlopePct);
}

function historicalVolumeRatio(row = {}) {
  return num(row.volumeRatio20);
}

function historicalImprovingSetup(row = {}) {
  if (!historicalDataAvailable(row)) return false;

  const score = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);
  const momentum5 = historicalMomentum5(row);
  const momentum10 = historicalMomentum10(row);
  const slope = historicalTrendSlope(row);

  if (score == null) return false;

  return (
    score >= 60 &&
    (resistance == null || resistance <= 8) &&
    (momentum5 == null || momentum5 >= -1.25) &&
    (momentum10 == null || momentum10 >= -3) &&
    (slope == null || slope >= -1.25)
  );
}

function historicalCleanEntry(row = {}) {
  if (!historicalDataAvailable(row)) return false;

  const score = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);
  const momentum5 = historicalMomentum5(row);
  const momentum10 = historicalMomentum10(row);
  const slope = historicalTrendSlope(row);
  const volumeRatio = historicalVolumeRatio(row);

  if (score == null) return false;

  return (
    score >= 70 &&
    (resistance == null || resistance <= 4.5) &&
    (momentum5 == null || momentum5 >= 0) &&
    (momentum10 == null || momentum10 >= -1.75) &&
    (slope == null || slope >= -0.6) &&
    (volumeRatio == null || volumeRatio >= 0.75)
  );
}

function historicalConfirmedBreakout(row = {}) {
  if (!historicalDataAvailable(row)) return false;

  const score = historicalConfirmationScore(row);
  const breakout = row.breakoutAbove20High === true;
  const momentum5 = historicalMomentum5(row);
  const slope = historicalTrendSlope(row);
  const volumeRatio = historicalVolumeRatio(row);

  if (score == null) return false;

  return (
    score >= 84 &&
    breakout &&
    (momentum5 == null || momentum5 > 0.75) &&
    (slope == null || slope > 0) &&
    (volumeRatio == null || volumeRatio >= 1.05)
  );
}

function historicalFadingOrBlocked(row = {}) {
  if (!historicalDataAvailable(row)) return false;

  const score = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);
  const momentum5 = historicalMomentum5(row);
  const momentum10 = historicalMomentum10(row);
  const slope = historicalTrendSlope(row);

  if (score != null && score < 58) return true;
  if (resistance != null && resistance > 7.5) return true;
  if (momentum5 != null && momentum5 < -1.75) return true;
  if (momentum10 != null && momentum10 < -3.5) return true;
  if (slope != null && slope < -1.5) return true;

  return false;
}

export function calcExtensionRisk(row = {}) {
  let risk = 0;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const resistance = historicalResistanceOverhead(row);
  const { pctFrom50, pctFrom200 } = trendData(row);

  if (pctFrom50 != null) {
    if (pctFrom50 > 45) risk += 45;
    else if (pctFrom50 > 35) risk += 36;
    else if (pctFrom50 > 28) risk += 28;
    else if (pctFrom50 > 22) risk += 20;
    else if (pctFrom50 > 16) risk += 10;
    else if (pctFrom50 < -12) risk += 8;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 > 180) risk += 34;
    else if (pctFrom200 > 130) risk += 26;
    else if (pctFrom200 > 90) risk += 18;
    else if (pctFrom200 > 60) risk += 8;
    else if (pctFrom200 < -20) risk += 10;
  }

  if (day != null) {
    if (day >= 18) risk += 34;
    else if (day >= 14) risk += 26;
    else if (day >= 10) risk += 18;
    else if (day >= 7) risk += 10;
    else if (day <= -8) risk += 12;
  }

  if (rv != null && day != null) {
    if (rv >= 5 && day >= 8) risk += 20;
    else if (rv >= 3.5 && day >= 6) risk += 14;
    else if (rv >= 2.5 && day >= 5) risk += 8;
  }

  if (resistance != null && resistance > 8) risk += 8;

  return roundScore(risk);
}

export function calcLateChaseRisk(row = {}) {
  let risk = 0;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const momentum5 = historicalMomentum5(row);
  const momentum10 = historicalMomentum10(row);
  const volumeRatio = historicalVolumeRatio(row);
  const extensionRisk = calcExtensionRisk(row);
  const { pctFrom50, pctFrom200 } = trendData(row);

  if (pctFrom50 != null) {
    if (pctFrom50 > 35) risk += 30;
    else if (pctFrom50 > 28) risk += 24;
    else if (pctFrom50 > 22) risk += 16;
    else if (pctFrom50 > 16) risk += 8;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 > 130) risk += 18;
    else if (pctFrom200 > 90) risk += 12;
    else if (pctFrom200 > 60) risk += 6;
  }

  if (day != null) {
    if (day >= 14) risk += 26;
    else if (day >= 10) risk += 18;
    else if (day >= 7) risk += 10;
  }

  if (rv != null && day != null) {
    if (rv >= 5 && day >= 7) risk += 18;
    else if (rv >= 3.5 && day >= 6) risk += 12;
    else if (rv >= 2.5 && day >= 5) risk += 7;
  }

  if (momentum5 != null) {
    if (momentum5 > 14) risk += 22;
    else if (momentum5 > 10) risk += 15;
    else if (momentum5 > 7) risk += 8;
  }

  if (momentum10 != null) {
    if (momentum10 > 25) risk += 22;
    else if (momentum10 > 18) risk += 15;
    else if (momentum10 > 12) risk += 8;
  }

  if (volumeRatio != null) {
    if (volumeRatio >= 3.5 && extensionRisk >= 35) risk += 12;
    else if (volumeRatio >= 2.5 && extensionRisk >= 45) risk += 8;
  }

  if (extensionRisk >= 70) risk += 16;
  else if (extensionRisk >= 55) risk += 10;
  else if (extensionRisk >= 40) risk += 5;

  return roundScore(risk);
}

export function calcExpectationRisk(row = {}) {
  let risk = 0;

  const pe = num(row.pe);
  const eps = num(row.eps);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);

  risk += extensionRisk * 0.65;
  risk += lateChaseRisk * 0.45;

  if (pe != null) {
    if (pe > 250) risk += 32;
    else if (pe > 150) risk += 26;
    else if (pe > 100) risk += 20;
    else if (pe > 80) risk += 14;
    else if (pe > 60) risk += 8;
    else if (pe < 0) risk += 12;
  }

  if (eps != null && eps < 0) risk += 10;
  if (historicalFadingOrBlocked(row)) risk += 12;

  risk += missingDataPenalty(row) * 0.25;

  return roundScore(risk);
}

function riskPenalty(row = {}) {
  let penalty = archetypeRiskPenalty(row);

  const price = num(row.price);
  const eps = num(row.eps);
  const pe = num(row.pe);
  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);

  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const resistance = historicalResistanceOverhead(row);

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (trueTradabilityFailure(row)) penalty += 100;

  if (above50 === false) penalty += 12;
  if (above200 === false) penalty += 12;

  if (pctFrom50 != null && pctFrom50 > 22) penalty += 16;
  if (pctFrom50 != null && pctFrom50 > 35) penalty += 12;
  if (pctFrom50 != null && pctFrom50 < -10) penalty += 12;

  if (pctFrom200 != null && pctFrom200 > 80) penalty += 10;
  if (pctFrom200 != null && pctFrom200 > 130) penalty += 10;
  if (pctFrom200 != null && pctFrom200 < -15) penalty += 12;

  if (eps != null && eps < 0) penalty += 8;
  if (pe != null && pe > 80) penalty += 8;
  if (pe != null && pe < 0) penalty += 8;

  if (day != null && day <= -4) penalty += 12;
  if (day != null && day >= 12) penalty += 12;

  if (rv != null && rv < 0.6) penalty += 6;
  if (rv != null && rv >= 4 && extensionRisk >= 40) penalty += 10;

  if (price != null && price < 8) penalty += 4;

  if (historicalFadingOrBlocked(row)) penalty += 20;
  if (resistance != null && resistance > 7.5) penalty += 12;

  penalty += expectationRisk * 0.24;
  penalty += extensionRisk * 0.22;
  penalty += lateChaseRisk * 0.28;
  penalty += missingDataPenalty(row) * 0.35;

  return roundScore(penalty);
}

export function calcFundamentalScore(row = {}) {
  let score = 50;

  const marketCap = num(row.marketCap);
  const eps = num(row.eps);
  const pe = num(row.pe);
  const expectationRisk = calcExpectationRisk(row);
  const archetype = getArchetype(row);

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 25000000000) score += 14;
    else if (marketCap > 25000000000 && marketCap <= 150000000000) score += 11;
    else if (marketCap > 150000000000 && marketCap <= 750000000000) score += 8;
    else if (marketCap > 750000000000) score += 4;
  }

  if (eps != null) {
    if (eps > 0) score += 14;
    else score -= 10;
  }

  if (pe != null) {
    if (pe > 0 && pe <= 25) score += 12;
    else if (pe > 25 && pe <= 45) score += 5;
    else if (pe > 80) score -= 10;
    else if (pe < 0) score -= 8;
  }

  if (expectationRisk >= 60) score -= 10;
  else if (expectationRisk >= 45) score -= 5;

  if (archetype === "REIT / Income") score -= 6;
  if (archetype === "Pipeline / Income Energy") score -= 4;
  if (archetype === "Biotech / Binary Event") score -= 8;

  score -= missingDataPenalty(row) * 0.2;

  return roundScore(score);
}

export function calcFreshBreakoutScore(row = {}) {
  let score = 45;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);

  const histScore = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);
  const momentum5 = historicalMomentum5(row);
  const slope = historicalTrendSlope(row);

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50 === true) score += 14;
  else if (above50 === false) score -= 12;

  if (above200 === true) score += 10;
  else if (above200 === false) score -= 10;

  if (pctFrom50 != null) {
    if (pctFrom50 >= -1 && pctFrom50 <= 6) score += 22;
    else if (pctFrom50 > 6 && pctFrom50 <= 12) score += 16;
    else if (pctFrom50 > 12 && pctFrom50 <= 18) score += 6;
    else if (pctFrom50 > 24) score -= 20;
    else if (pctFrom50 < -6) score -= 14;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 >= -2 && pctFrom200 <= 45) score += 8;
    else if (pctFrom200 > 80) score -= 8;
  }

  if (day != null) {
    if (day > 0.5 && day <= 5) score += 12;
    else if (day > 5 && day <= 8) score += 6;
    else if (day > 12) score -= 16;
    else if (day < -4) score -= 16;
  }

  if (rv != null) {
    if (rv >= 1.15 && rv <= 3.5) score += 16;
    else if (rv > 3.5 && extensionRisk <= 25) score += 8;
    else if (rv > 5 && extensionRisk >= 40) score -= 12;
    else if (rv < 0.7) score -= 6;
  }

  if (relative >= 65) score += 10;
  else if (relative <= 40) score -= 10;

  if (histScore != null) {
    if (histScore >= 84) score += 18;
    else if (histScore >= 70) score += 10;
    else if (histScore >= 60) score += 3;
    else score -= 16;
  }

  if (resistance != null) {
    if (resistance <= 0) score += 14;
    else if (resistance <= 4) score += 6;
    else if (resistance > 7.5) score -= 18;
  }

  if (momentum5 != null) {
    if (momentum5 > 1) score += 6;
    else if (momentum5 < -1.75) score -= 14;
  }

  if (slope != null) {
    if (slope > 0.75) score += 6;
    else if (slope < -1.5) score -= 14;
  }

  if (extensionRisk >= 55) score -= 24;
  else if (extensionRisk >= 40) score -= 14;

  if (lateChaseRisk >= 70) score -= 26;
  else if (lateChaseRisk >= 55) score -= 16;
  else if (lateChaseRisk >= 40) score -= 8;

  score -= missingDataPenalty(row) * 0.25;

  return roundScore(score);
}

export function calcTechnicalScore(row = {}) {
  let score = 45;

  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);

  const histScore = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50 === true) score += 18;
  else if (above50 === false) score -= 14;

  if (above200 === true) score += 18;
  else if (above200 === false) score -= 14;

  if (pctFrom50 != null) {
    if (pctFrom50 >= -1 && pctFrom50 <= 8) score += 15;
    else if (pctFrom50 > 8 && pctFrom50 <= 18) score += 7;
    else if (pctFrom50 > 22) score -= 18;
    else if (pctFrom50 < -8) score -= 12;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 >= -2 && pctFrom200 <= 35) score += 10;
    else if (pctFrom200 > 60) score -= 8;
    else if (pctFrom200 > 120) score -= 8;
    else if (pctFrom200 < -12) score -= 12;
  }

  if (histScore != null) {
    if (histScore >= 84) score += 14;
    else if (histScore >= 70) score += 8;
    else if (histScore < 58) score -= 16;
  }

  if (resistance != null && resistance > 7.5) score -= 12;

  if (freshBreakoutScore >= 75 && extensionRisk <= 35 && lateChaseRisk <= 45) {
    score += 6;
  }

  if (expectationRisk >= 60) score -= 8;
  if (extensionRisk >= 60) score -= 10;

  if (lateChaseRisk >= 70) score -= 18;
  else if (lateChaseRisk >= 55) score -= 10;

  score -= missingDataPenalty(row) * 0.25;

  return roundScore(score);
}

export function calcMomentumScore(row = {}) {
  let score = 45;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);

  const histScore = historicalConfirmationScore(row);
  const momentum5 = historicalMomentum5(row);
  const momentum10 = historicalMomentum10(row);
  const slope = historicalTrendSlope(row);

  if (day != null) {
    if (day >= 3 && day <= 8) score += 18;
    else if (day > 8 && day <= 12) score += 12;
    else if (day >= 1) score += 8;
    else if (day > 12) score += 4;
    else if (day <= -5) score -= 20;
    else if (day < 0) score -= 8;
  }

  if (rv != null) {
    if (rv >= 1.5 && rv <= 3.5) score += 18;
    else if (rv >= 3.5 && extensionRisk <= 35 && lateChaseRisk <= 45) {
      score += 14;
    } else if (rv >= 3.5 && extensionRisk > 35) {
      score += 5;
    } else if (rv >= 1.15) {
      score += 7;
    } else if (rv < 0.6) {
      score -= 8;
    }
  }

  if (relative >= 70) score += 12;
  else if (relative >= 60) score += 6;
  else if (relative <= 35) score -= 12;
  else if (relative <= 45) score -= 6;

  if (histScore != null) {
    if (histScore >= 84) score += 14;
    else if (histScore >= 70) score += 8;
    else if (histScore < 58) score -= 16;
  }

  if (momentum5 != null) {
    if (momentum5 > 1) score += 6;
    else if (momentum5 < -1.75) score -= 14;
  }

  if (momentum10 != null) {
    if (momentum10 > 2) score += 6;
    else if (momentum10 < -3.5) score -= 14;
  }

  if (slope != null) {
    if (slope > 0.75) score += 6;
    else if (slope < -1.5) score -= 14;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35 && lateChaseRisk <= 45) {
    score += 5;
  }

  if (expectationRisk >= 60) score -= 8;
  if (extensionRisk >= 60) score -= 10;

  if (lateChaseRisk >= 70) score -= 18;
  else if (lateChaseRisk >= 55) score -= 10;

  score -= missingDataPenalty(row) * 0.15;

  return roundScore(score);
}

export function getMomentumLabel(row = {}) {
  const score = calcMomentumScore(row);

  if (score >= 75) return "Strong";
  if (score >= 55) return "Building";

  return "Weak";
}

export function calcRelativeStrengthScore(row = {}) {
  return marketRelativeScore(row);
}

export function calcAsymmetryScore(row = {}) {
  let score = 50;

  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const archetype = getArchetype(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const histScore = historicalConfirmationScore(row);

  if (price != null) {
    if (price >= 8 && price <= 80) score += 12;
    else if (price > 150) score -= 3;
  }

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 25000000000) score += 15;
    else if (marketCap > 25000000000 && marketCap <= 150000000000) score += 8;
    else if (marketCap > 500000000000) score -= 3;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35 && lateChaseRisk <= 45) {
    score += 8;
  }

  if (histScore != null) {
    if (histScore >= 84) score += 10;
    else if (histScore >= 70) score += 6;
    else if (histScore < 58) score -= 12;
  }

  if (expectationRisk <= 25) score += 8;
  else if (expectationRisk >= 55) score -= 14;
  else if (expectationRisk >= 40) score -= 7;

  if (extensionRisk >= 55) score -= 12;
  else if (extensionRisk >= 40) score -= 6;

  if (lateChaseRisk >= 70) score -= 18;
  else if (lateChaseRisk >= 55) score -= 10;
  else if (lateChaseRisk >= 40) score -= 5;

  if (archetype === "Growth / Momentum") score += 8;
  if (archetype === "Crypto Proxy") score += 4;
  if (archetype === "Mega-Cap Leadership") score += 2;
  if (archetype === "REIT / Income") score -= 10;
  if (archetype === "Pipeline / Income Energy") score -= 7;
  if (archetype === "Airline / Cyclical") score -= 8;
  if (archetype === "Biotech / Binary Event") score -= 12;

  score -= missingDataPenalty(row) * 0.15;

  return roundScore(score);
}

export function calcTriggerScore(row = {}) {
  let score = 40;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);
  const penalty = riskPenalty(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);

  const histScore = historicalConfirmationScore(row);
  const resistance = historicalResistanceOverhead(row);

  const { above50, above200, pctFrom50 } = trendData(row);

  if (above50 === true) score += 15;
  else if (above50 === false) score -= 10;

  if (above200 === true) score += 15;
  else if (above200 === false) score -= 8;

  if (pctFrom50 != null) {
    if (pctFrom50 >= -1 && pctFrom50 <= 7) score += 16;
    else if (pctFrom50 > 7 && pctFrom50 <= 15) score += 8;
    else if (pctFrom50 > 20) score -= 16;
    else if (pctFrom50 < -6) score -= 10;
  }

  if (day != null) {
    if (day >= 2 && day <= 6) score += 16;
    else if (day > 6 && day <= 10) score += 10;
    else if (day > 10) score -= 4;
    else if (day > 0) score += 6;
    else if (day <= -4) score -= 16;
    else if (day < 0) score -= 6;
  }

  if (rv != null) {
    if (rv >= 1.5 && rv <= 3.5) score += 15;
    else if (rv >= 3.5 && extensionRisk <= 35 && lateChaseRisk <= 45) {
      score += 10;
    } else if (rv >= 3.5 && extensionRisk > 35) {
      score += 2;
    } else if (rv >= 1.15) {
      score += 5;
    } else if (rv < 0.6) {
      score -= 6;
    }
  }

  if (histScore != null) {
    if (histScore >= 84) score += 18;
    else if (histScore >= 70) score += 10;
    else if (histScore >= 60) score += 3;
    else score -= 16;
  }

  if (resistance != null) {
    if (resistance <= 0) score += 12;
    else if (resistance <= 4) score += 5;
    else if (resistance > 7.5) score -= 16;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35 && lateChaseRisk <= 45) {
    score += 10;
  }

  if (relative >= 70) score += 10;
  else if (relative <= 40) score -= 10;

  score -= penalty * 0.1;
  score -= expectationRisk * 0.04;
  score -= extensionRisk * 0.06;
  score -= lateChaseRisk * 0.08;
  score -= missingDataPenalty(row) * 0.15;

  return roundScore(score);
}

export function compositeScore(row = {}) {
  const fundamental = calcFundamentalScore(row);
  const technical = calcTechnicalScore(row);
  const momentum = calcMomentumScore(row);
  const asymmetry = calcAsymmetryScore(row);
  const relative = calcRelativeStrengthScore(row);
  const trigger = calcTriggerScore(row);
  const freshBreakout = calcFreshBreakoutScore(row);
  const penalty = riskPenalty(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const histScore = historicalConfirmationScore(row);

  let weighted =
    fundamental * 0.14 +
    technical * 0.21 +
    momentum * 0.17 +
    asymmetry * 0.1 +
    relative * 0.12 +
    trigger * 0.15 +
    freshBreakout * 0.06 -
    penalty * 0.07 -
    expectationRisk * 0.04 -
    extensionRisk * 0.05 -
    lateChaseRisk * 0.05;

  if (histScore != null) {
    weighted += histScore * 0.1;
  }

  return roundScore(weighted);
}

function gate(status, reason = "") {
  return { status, reason };
}

function pass(status) {
  return status === "pass";
}

function gateRank(status) {
  if (status === "pass") return 2;
  if (status === "watch") return 1;
  return 0;
}

function buildTradeGates(row = {}) {
  const archetype = getArchetype(row);
  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const volume = num(row.volume);
  const avgVolume = num(row.avgVolume);
  const dollarVolume = price != null && volume != null ? price * volume : null;
  const rv = relativeVolume(row);
  const dayMove = num(row.dayChangePct);

  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  const score = compositeScore(row);
  const triggerScore = calcTriggerScore(row);
  const momentumScore = calcMomentumScore(row);
  const relativeStrengthScore = calcRelativeStrengthScore(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const penalty = riskPenalty(row);

  const histAvailable = historicalDataAvailable(row);
  const histClean = historicalCleanEntry(row);
  const histBreakout = historicalConfirmedBreakout(row);
  const histImproving = historicalImprovingSetup(row);
  const histBlocked = historicalFadingOrBlocked(row);
  const histResistance = historicalResistanceOverhead(row);
  const histVolumeRatio = historicalVolumeRatio(row);

  let tradability = gate("pass", "Tradable security.");

  if (trueTradabilityFailure(row)) {
    tradability = gate(
      "fail",
      "Fails tradability filter: price is too low or quote is missing."
    );
  } else if (marketCap != null && marketCap < 300000000) {
    tradability = gate("fail", "Market cap is too small for this screen.");
  } else if (dollarVolume != null && dollarVolume < 8000000) {
    tradability = gate("watch", "Liquidity is thin; use caution on sizing.");
  } else if (avgVolume == null || volume == null) {
    tradability = gate("watch", "Volume data is incomplete.");
  }

  let trend = gate("watch", "Trend is still developing.");

  if (above50 === false && above200 === false) {
    trend = gate("fail", "Trend not aligned: below both key moving averages.");
  } else if (above50 === false) {
    trend = gate("watch", "Below 50dma; needs reclaim before action.");
  } else if (above50 === true && above200 !== false) {
    if (pctFrom50 != null && pctFrom50 > 22) {
      trend = gate("watch", "Trend is positive but extended from 50dma.");
    } else if (pctFrom50 != null && pctFrom50 < -2) {
      trend = gate("watch", "Trend is improving but not fully reclaimed.");
    } else {
      trend = gate("pass", "Trend aligned above key averages.");
    }
  } else if (above50 === null && score >= 55) {
    trend = gate(
      "watch",
      "Trend data is incomplete, but setup quality is improving."
    );
  }

  let trigger = gate("watch", "Needs a cleaner trigger before buying.");

  if (histBlocked) {
    trigger = gate("fail", "Resistance or fading momentum blocks entry.");
  } else if (histBreakout) {
    trigger = gate("pass", "Confirmed breakout from completed candles.");
  } else if (histClean) {
    trigger = gate("pass", "Clean entry confirmed from completed candles.");
  } else if (histImproving) {
    trigger = gate("watch", "Trigger improving, but not fully confirmed.");
  } else if (triggerScore >= 82 && freshBreakoutScore >= 75) {
    trigger = gate("pass", "Trigger score confirms an actionable setup.");
  } else if (triggerScore >= 60 || freshBreakoutScore >= 60) {
    trigger = gate("watch", "Trigger improving, but needs confirmation.");
  } else if (histResistance != null && histResistance > 7.5) {
    trigger = gate("fail", "Resistance remains too far overhead.");
  }

  let confirmation = gate("watch", "Needs stronger confirmation.");

  if (momentumScore >= 72 && relativeStrengthScore >= 60) {
    if (
      rv == null ||
      rv >= 1.05 ||
      histVolumeRatio == null ||
      histVolumeRatio >= 0.9
    ) {
      confirmation = gate(
        "pass",
        "Momentum and relative strength confirm the move."
      );
    } else {
      confirmation = gate(
        "watch",
        "Momentum is improving, but volume confirmation is light."
      );
    }
  } else if (momentumScore >= 52 || relativeStrengthScore >= 52) {
    confirmation = gate(
      "watch",
      "Momentum is building, but confirmation is incomplete."
    );
  } else if (momentumScore < 40 && relativeStrengthScore < 45) {
    confirmation = gate("fail", "Relative strength and momentum are weak.");
  }

  let risk = gate("pass", "Risk is acceptable for normal sizing.");

  if (
    expectationRisk >= 72 ||
    extensionRisk >= 72 ||
    lateChaseRisk >= 72 ||
    penalty >= 85
  ) {
    risk = gate(
      "fail",
      "Risk is too high: extended, crowded, or low-quality setup."
    );
  } else if (
    expectationRisk >= 55 ||
    extensionRisk >= 55 ||
    lateChaseRisk >= 55 ||
    penalty >= 65
  ) {
    risk = gate("watch", "Risk is elevated; avoid chasing.");
  }

  const dayOkayForEntry = dayMove == null || (dayMove >= -1.5 && dayMove <= 8);
  const notTooExtended = pctFrom50 == null || pctFrom50 <= 22;
  const notTooFarFrom200 = pctFrom200 == null || pctFrom200 <= 100;

  if (!dayOkayForEntry || !notTooExtended || !notTooFarFrom200) {
    if (risk.status === "pass") {
      risk = gate("watch", "Move is somewhat extended; avoid chasing oversized.");
    }
  }

  const buyNowAllowed = buyNowAllowedByArchetype(row);

  if (!buyNowAllowed && risk.status !== "fail") {
    risk = gate(
      "watch",
      `${archetype} is not allowed to be Buy Now in this model.`
    );
  }

  return {
    tradability,
    trend,
    trigger,
    confirmation,
    risk,
    metrics: {
      archetype,
      score,
      triggerScore,
      momentumScore,
      relativeStrengthScore,
      freshBreakoutScore,
      expectationRisk,
      extensionRisk,
      lateChaseRisk,
      penalty,
      rv,
      dayMove,
      pctFrom50,
      pctFrom200,
      histAvailable,
      histClean,
      histBreakout,
      histImproving,
      histBlocked,
      buyNowAllowed,
    },
  };
}

function decideFromGates(row = {}) {
  const gates = buildTradeGates(row);
  const m = gates.metrics;

  const gateStatuses = [
    gates.tradability.status,
    gates.trend.status,
    gates.trigger.status,
    gates.confirmation.status,
    gates.risk.status,
  ];

  const failCount = gateStatuses.filter((s) => s === "fail").length;
  const passCount = gateStatuses.filter((s) => s === "pass").length;
  const watchCount = gateStatuses.filter((s) => s === "watch").length;

  const quoteOnlyButImproving =
    !m.histAvailable &&
    m.score >= 55 &&
    m.triggerScore >= 55 &&
    m.momentumScore >= 50 &&
    m.expectationRisk <= 80 &&
    m.extensionRisk <= 85 &&
    m.lateChaseRisk <= 85;

  const buyNow =
    failCount === 0 &&
    m.buyNowAllowed &&
    pass(gates.tradability.status) &&
    pass(gates.trend.status) &&
    pass(gates.trigger.status) &&
    gateRank(gates.confirmation.status) >= 1 &&
    pass(gates.risk.status) &&
    m.score >= 66 &&
    m.triggerScore >= 72 &&
    m.momentumScore >= 58 &&
    m.freshBreakoutScore >= 66 &&
    m.expectationRisk <= 58 &&
    m.extensionRisk <= 58 &&
    m.lateChaseRisk <= 56;

  if (buyNow) {
    return {
      label: "BUY NOW",
      gates,
      passCount,
      watchCount,
      failCount,
    };
  }

  const watch =
    failCount <= 1 &&
    gateRank(gates.tradability.status) >= 1 &&
    (gateRank(gates.trend.status) >= 1 ||
      gateRank(gates.trigger.status) >= 1 ||
      quoteOnlyButImproving) &&
    (m.score >= 48 ||
      m.triggerScore >= 48 ||
      m.momentumScore >= 48 ||
      m.freshBreakoutScore >= 50 ||
      quoteOnlyButImproving) &&
    m.expectationRisk <= 88 &&
    m.extensionRisk <= 90 &&
    m.lateChaseRisk <= 90;

  if (watch) {
    return {
      label: "WATCH",
      gates,
      passCount,
      watchCount,
      failCount,
    };
  }

  return {
    label: "AVOID",
    gates,
    passCount,
    watchCount,
    failCount,
  };
}

function firstNonPassGate(gates = {}) {
  const order = ["tradability", "trend", "trigger", "confirmation", "risk"];

  for (const key of order) {
    if (gates[key]?.status !== "pass") {
      return { key, ...gates[key] };
    }
  }

  return null;
}

function strongestContext(row = {}, decision = {}) {
  const label = decision.label;
  const gates = decision.gates || {};
  const m = gates.metrics || {};

  if (trueTradabilityFailure(row)) return "Fails tradability filter";
  if (m.archetype === "Biotech / Binary Event") return "Binary event risk";
  if (historicalFadingOrBlocked(row)) return "Resistance or momentum block";

  if (label === "BUY NOW") {
    if (m.histBreakout) return "Confirmed breakout";
    if (m.histClean) return "Clean actionable entry";
    if (m.triggerScore >= 82 && m.freshBreakoutScore >= 75) {
      return "Fresh breakout setup";
    }
    return "Actionable trigger confirmed";
  }

  if (label === "WATCH") {
    const miss = firstNonPassGate(gates);

    if (miss?.key === "risk") return "Risk elevated";
    if (miss?.key === "confirmation") return "Needs stronger confirmation";
    if (miss?.key === "trigger") return "Trigger improving";
    if (miss?.key === "trend") return "Trend rebuilding";
    if (m.histImproving) return "Trend rebuilding";

    const { above50, pctFrom50 } = trendData(row);

    if (
      above50 === true &&
      pctFrom50 != null &&
      pctFrom50 >= -1 &&
      pctFrom50 <= 8
    ) {
      return "Holding key support";
    }

    if (!m.histAvailable && m.triggerScore >= 55 && m.momentumScore >= 50) {
      return "Quote-only setup improving";
    }

    return "Interesting but not actionable now";
  }

  if (m.extensionRisk >= 62 || m.lateChaseRisk >= 62) return "Extended setup";
  if (m.expectationRisk >= 62) return "High expectations";
  if (gates.trend?.status === "fail") return "Trend not aligned";
  if (gates.confirmation?.status === "fail") {
    return "Relative strength deteriorating";
  }
  if (gates.trigger?.status === "fail") return "Resistance overhead";

  return "Not actionable now";
}

function contextTone(label, context) {
  const cleanLabel = String(label || "").toUpperCase();
  const cleanContext = String(context || "").toLowerCase();

  if (cleanContext.includes("cash")) return "gray";

  if (
    cleanContext.includes("failed") ||
    cleanContext.includes("fails") ||
    cleanContext.includes("deteriorating") ||
    cleanContext.includes("extended") ||
    cleanContext.includes("crowded") ||
    cleanContext.includes("chase") ||
    cleanContext.includes("lagging") ||
    cleanContext.includes("binary") ||
    cleanContext.includes("risk") ||
    cleanContext.includes("fading") ||
    cleanContext.includes("not aligned") ||
    cleanContext.includes("resistance")
  ) {
    return cleanLabel === "WATCH" ? "yellow" : "red";
  }

  if (
    cleanContext.includes("interesting") ||
    cleanContext.includes("watch") ||
    cleanContext.includes("wait") ||
    cleanContext.includes("rebuilding") ||
    cleanContext.includes("improving") ||
    cleanContext.includes("holding key support") ||
    cleanContext.includes("confirmation") ||
    cleanContext.includes("quote-only")
  ) {
    return "yellow";
  }

  if (cleanLabel === "BUY NOW") return "green";
  if (cleanLabel === "WATCH") return "yellow";

  return "red";
}

function buildReason(row = {}, recommendation = {}) {
  const label = labelDisplay(recommendation.label);
  const gates = recommendation.gates || {};
  const context = recommendation.context || strongestContext(row, recommendation);
  const miss = firstNonPassGate(gates);

  if (label === "Buy Now") {
    return `Buy Now: ${context}. Core gates passed; use normal sizing and a defined invalidation level.`;
  }

  if (label === "Watch") {
    if (miss?.reason) {
      return `Watch: ${context}. ${miss.reason}`;
    }

    return `Watch: ${context}. Interesting but not actionable now.`;
  }

  if (miss?.reason) {
    return `Avoid: ${context}. ${miss.reason}`;
  }

  return `Avoid: ${context}. No trade right now.`;
}

function buildEntry(row = {}, recommendation = {}) {
  const label = String(recommendation.label || "").toUpperCase();
  const gates = recommendation.gates || {};
  const miss = firstNonPassGate(gates);

  if (label === "BUY NOW") {
    return "Buyable now under normal sizing. Use a defined invalidation level and do not chase oversized.";
  }

  if (label === "WATCH") {
    if (miss?.key === "trigger") {
      return "Watch only. Needs a cleaner trigger before buying.";
    }
    if (miss?.key === "confirmation") {
      return "Watch only. Needs stronger momentum, volume, or relative-strength confirmation.";
    }
    if (miss?.key === "trend") {
      return "Watch only. Needs trend alignment before buying.";
    }
    if (miss?.key === "risk") {
      return "Watch only. Risk is elevated; wait for a better entry or reset.";
    }
    if (miss?.key === "tradability") {
      return "Watch only. Liquidity or data quality is not clean enough.";
    }

    return "Watch only. Interesting but not actionable now.";
  }

  return "Avoid. Wait for the setup to reset or materially improve.";
}

export function getThemeMaturity(row = {}) {
  const decision = decideFromGates(row);
  const context = strongestContext(row, decision);

  if (context === "Confirmed breakout") return "Confirmed Breakout";
  if (context === "Clean actionable entry") return "Clean Entry";
  if (context === "Fresh breakout setup") return "Fresh Breakout";
  if (context === "Trend rebuilding") return "Emerging Setup";
  if (context === "Risk elevated") return "Crowded Momentum";

  return context;
}

export function getSetupGrade(row = {}) {
  const decision = decideFromGates(row);
  const gates = decision.gates || {};
  const m = gates.metrics || {};

  if (
    decision.label === "BUY NOW" &&
    m.score >= 72 &&
    m.triggerScore >= 78 &&
    m.momentumScore >= 62 &&
    m.expectationRisk <= 50 &&
    m.extensionRisk <= 50 &&
    m.lateChaseRisk <= 50
  ) {
    return "A";
  }

  if (decision.label === "BUY NOW") return "B+";
  if (decision.label === "WATCH") return "B-";

  return "C";
}

export function getRecommendation(row = {}) {
  const score = compositeScore(row);
  const triggerScore = calcTriggerScore(row);
  const momentumScore = calcMomentumScore(row);
  const relativeStrengthScore = calcRelativeStrengthScore(row);
  const penalty = riskPenalty(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const lateChaseRisk = calcLateChaseRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const archetype = getArchetype(row);
  const decision = decideFromGates(row);
  const themeMaturity = getThemeMaturity(row);
  const setupGrade = getSetupGrade(row);
  const histScore = historicalConfirmationScore(row);

  const label = decision.label;
  const context = strongestContext(row, decision);
  const contextToneValue = contextTone(label, context);

  const actionabilityScore = roundScore(
    score * 0.22 +
      triggerScore * 0.26 +
      momentumScore * 0.17 +
      relativeStrengthScore * 0.1 +
      freshBreakoutScore * 0.08 +
      (histScore ?? 50) * 0.12 -
      expectationRisk * 0.05 -
      extensionRisk * 0.06 -
      lateChaseRisk * 0.08 -
      penalty * 0.03
  );

  const institutionalScore = roundScore(actionabilityScore + 20);

  const recommendation = {
    label,
    displayLabel: labelDisplay(label),
    score,
    institutionalScore,
    actionabilityScore,
    triggerScore,
    momentumScore,
    relativeStrengthScore,
    riskPenalty: penalty,
    expectationRisk,
    extensionRisk,
    lateChaseRisk,
    freshBreakoutScore,
    themeMaturity,
    setupGrade,
    archetype,
    gates: decision.gates,
    gateSummary: {
      tradability: decision.gates.tradability.status,
      trend: decision.gates.trend.status,
      trigger: decision.gates.trigger.status,
      confirmation: decision.gates.confirmation.status,
      risk: decision.gates.risk.status,
      passCount: decision.passCount,
      watchCount: decision.watchCount,
      failCount: decision.failCount,
    },
    breakoutConfirmed: historicalConfirmedBreakout(row),
    cleanEntryConfirmed: historicalCleanEntry(row),
    improvingSetup: historicalImprovingSetup(row),
    historicalConfirmationScore: histScore,
    historicalCleanEntry: historicalCleanEntry(row),
    historicalConfirmedBreakout: historicalConfirmedBreakout(row),
    historicalFadingOrBlocked: historicalFadingOrBlocked(row),
    context,
    contextTone: contextToneValue,
  };

  return {
    ...recommendation,
    reason: buildReason(row, recommendation),
    entryNote: buildEntry(row, recommendation),
    scoreTone: score >= 75 ? "green" : score >= 60 ? "yellow" : "red",
    triggerTone:
      triggerScore >= 80 ? "green" : triggerScore >= 65 ? "yellow" : "red",
    momentumTone:
      getMomentumLabel(row) === "Strong"
        ? "green"
        : getMomentumLabel(row) === "Building"
          ? "yellow"
          : "red",
    expectationTone:
      expectationRisk <= 30 ? "green" : expectationRisk <= 55 ? "yellow" : "red",
    setupTone:
      setupGrade === "A" || setupGrade === "B+"
        ? "green"
        : setupGrade === "B-"
          ? "yellow"
          : "red",
    momentumLabel: getMomentumLabel(row),
  };
}

export function getStage(row = {}) {
  return getRecommendation(row).label;
}

export function buildTechnicalSnapshot(row = {}) {
  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);
  const recommendation = getRecommendation(row);

  return {
    above50dma: above50,
    above200dma: above200,
    pctFrom50dma: pctFrom50,
    pctFrom200dma: pctFrom200,
    extensionRisk: calcExtensionRisk(row),
    lateChaseRisk: calcLateChaseRisk(row),
    freshBreakoutScore: calcFreshBreakoutScore(row),
    triggerScore: calcTriggerScore(row),
    momentumScore: calcMomentumScore(row),
    relativeStrengthScore: calcRelativeStrengthScore(row),
    themeMaturity: getThemeMaturity(row),
    setupGrade: getSetupGrade(row),
    gates: recommendation.gates,
    gateSummary: recommendation.gateSummary,
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    marketCap: num(row.marketCap),
    eps: num(row.eps),
    pe: num(row.pe),
    archetype: getArchetype(row),
    fundamentalScore: calcFundamentalScore(row),
    expectationRisk: calcExpectationRisk(row),
  };
}

export function calcQualityScore(row = {}) {
  return calcFundamentalScore(row);
}

export function getTradeReadiness(row = {}) {
  const recommendation = getRecommendation(row);
  const label = String(recommendation.label || "").toUpperCase();

  if (label === "BUY NOW") {
    return {
      label: "TRADE READY",
      tone: "green",
      reason: recommendation.reason || "Actionable Buy Now setup.",
      gates: recommendation.gateSummary,
    };
  }

  if (label === "WATCH") {
    return {
      label: "WATCH",
      tone: "yellow",
      reason: recommendation.reason || "Interesting but not actionable now.",
      gates: recommendation.gateSummary,
    };
  }

  return {
    label: "AVOID",
    tone: "red",
    reason: recommendation.reason || "Not actionable right now.",
    gates: recommendation.gateSummary,
  };
}
