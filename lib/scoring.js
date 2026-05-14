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
  if (clean === "BUY") return "Buy";
  if (clean === "WATCH FOR ENTRY") return "Watch for Entry";

  return "Avoid for Now";
}

function missingDataPenalty(row = {}) {
  let penalty = 0;

  if (num(row.marketCap) == null) penalty += 3;
  if (num(row.avgVolume) == null) penalty += 3;
  if (num(row.priceAvg50) == null) penalty += 5;
  if (num(row.priceAvg200) == null) penalty += 5;
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

  const banks = [
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
  ];

  if (
    reits.includes(symbol) ||
    name.includes("REIT") ||
    name.includes("REAL ESTATE")
  ) {
    return "REIT / Income";
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
    banks.includes(symbol) ||
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
  if (archetype === "Airline / Cyclical") return false;
  if (archetype === "Biotech / Binary Event") return false;

  return true;
}

function archetypeRiskPenalty(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return 10;
  if (archetype === "Airline / Cyclical") return 8;
  if (archetype === "Travel / Cyclical") return 6;
  if (archetype === "Financial / Rate Sensitive") return 4;
  if (archetype === "Crypto Proxy") return 6;

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

export function calcExtensionRisk(row = {}) {
  let risk = 0;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
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

  return roundScore(risk);
}

export function calcFreshBreakoutScore(row = {}) {
  let score = 45;

  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const relative = marketRelativeScore(row);
  const extensionRisk = calcExtensionRisk(row);
  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50 === true) score += 14;
  else if (above50 === false) score -= 12;

  if (above200 === true) score += 10;
  else if (above200 === false) score -= 10;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 6) score += 22;
    else if (pctFrom50 > 6 && pctFrom50 <= 12) score += 16;
    else if (pctFrom50 > 12 && pctFrom50 <= 18) score += 6;
    else if (pctFrom50 > 24) score -= 20;
    else if (pctFrom50 < -6) score -= 14;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 >= 0 && pctFrom200 <= 45) score += 8;
    else if (pctFrom200 > 80) score -= 8;
  }

  if (day != null) {
    if (day > 0 && day <= 5) score += 12;
    else if (day > 5 && day <= 8) score += 6;
    else if (day > 12) score -= 16;
    else if (day < -4) score -= 16;
  }

  if (rv != null) {
    if (rv >= 1.2 && rv <= 3.5) score += 16;
    else if (rv > 3.5 && extensionRisk <= 25) score += 8;
    else if (rv > 5 && extensionRisk >= 40) score -= 12;
    else if (rv < 0.7) score -= 6;
  }

  if (relative >= 65) score += 10;
  else if (relative <= 40) score -= 10;

  if (extensionRisk >= 55) score -= 24;
  else if (extensionRisk >= 40) score -= 14;

  score -= missingDataPenalty(row) * 0.25;

  return roundScore(score);
}

export function calcExpectationRisk(row = {}) {
  let risk = 0;

  const pe = num(row.pe);
  const eps = num(row.eps);
  const extensionRisk = calcExtensionRisk(row);

  risk += extensionRisk * 0.65;

  if (pe != null) {
    if (pe > 250) risk += 32;
    else if (pe > 150) risk += 26;
    else if (pe > 100) risk += 20;
    else if (pe > 80) risk += 14;
    else if (pe > 60) risk += 8;
    else if (pe < 0) risk += 12;
  }

  if (eps != null && eps < 0) risk += 10;

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

  penalty += expectationRisk * 0.24;
  penalty += extensionRisk * 0.22;
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
    if (marketCap >= 1000000000 && marketCap <= 50000000000) score += 14;
    else if (marketCap > 50000000000 && marketCap <= 500000000000) score += 10;
    else if (marketCap > 500000000000) score += 6;
  }

  if (eps != null) {
    if (eps > 0) score += 15;
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

  score -= missingDataPenalty(row) * 0.2;

  return roundScore(score);
}

export function calcTechnicalScore(row = {}) {
  let score = 45;

  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50 === true) score += 18;
  else if (above50 === false) score -= 14;

  if (above200 === true) score += 18;
  else if (above200 === false) score -= 14;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 8) score += 15;
    else if (pctFrom50 > 8 && pctFrom50 <= 18) score += 7;
    else if (pctFrom50 > 22) score -= 18;
    else if (pctFrom50 < -8) score -= 12;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 >= 0 && pctFrom200 <= 35) score += 10;
    else if (pctFrom200 > 60) score -= 8;
    else if (pctFrom200 > 120) score -= 8;
    else if (pctFrom200 < -12) score -= 12;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35) score += 6;

  if (expectationRisk >= 60) score -= 8;
  if (extensionRisk >= 60) score -= 10;

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
  const freshBreakoutScore = calcFreshBreakoutScore(row);

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
    else if (rv >= 3.5 && extensionRisk <= 35) score += 14;
    else if (rv >= 3.5 && extensionRisk > 35) score += 5;
    else if (rv >= 1.15) score += 7;
    else if (rv < 0.6) score -= 8;
  }

  if (relative >= 70) score += 12;
  else if (relative >= 60) score += 6;
  else if (relative <= 35) score -= 12;
  else if (relative <= 45) score -= 6;

  if (freshBreakoutScore >= 75 && extensionRisk <= 35) score += 5;

  if (expectationRisk >= 60) score -= 8;
  if (extensionRisk >= 60) score -= 10;

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
  const freshBreakoutScore = calcFreshBreakoutScore(row);

  if (price != null) {
    if (price >= 8 && price <= 80) score += 12;
    else if (price > 150) score -= 3;
  }

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 25000000000) score += 15;
    else if (marketCap > 25000000000 && marketCap <= 150000000000) score += 8;
    else if (marketCap > 500000000000) score -= 3;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35) score += 8;

  if (expectationRisk <= 25) score += 8;
  else if (expectationRisk >= 55) score -= 14;
  else if (expectationRisk >= 40) score -= 7;

  if (extensionRisk >= 55) score -= 12;
  else if (extensionRisk >= 40) score -= 6;

  if (archetype === "Growth / Momentum") score += 8;
  if (archetype === "Crypto Proxy") score += 4;
  if (archetype === "Mega-Cap Leadership") score += 2;
  if (archetype === "REIT / Income") score -= 10;
  if (archetype === "Airline / Cyclical") score -= 7;

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
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  if (above50 === true) score += 15;
  else if (above50 === false) score -= 10;

  if (above200 === true) score += 15;
  else if (above200 === false) score -= 8;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 7) score += 16;
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
    else if (rv >= 3.5 && extensionRisk <= 35) score += 10;
    else if (rv >= 3.5 && extensionRisk > 35) score += 2;
    else if (rv >= 1.15) score += 5;
    else if (rv < 0.6) score -= 6;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35) score += 10;

  if (relative >= 70) score += 10;
  else if (relative <= 40) score -= 10;

  score -= penalty * 0.1;
  score -= expectationRisk * 0.04;
  score -= extensionRisk * 0.06;
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

  const weighted =
    fundamental * 0.16 +
    technical * 0.22 +
    momentum * 0.17 +
    asymmetry * 0.11 +
    relative * 0.13 +
    trigger * 0.15 +
    freshBreakout * 0.06 -
    penalty * 0.07 -
    expectationRisk * 0.04 -
    extensionRisk * 0.05;

  return roundScore(weighted);
}

export function getThemeMaturity(row = {}) {
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const { pctFrom50, pctFrom200 } = trendData(row);
  const pe = num(row.pe);
  const momentumScore = calcMomentumScore(row);

  if (
    expectationRisk >= 60 ||
    extensionRisk >= 55 ||
    (pctFrom50 != null && pctFrom50 > 30) ||
    (pctFrom200 != null && pctFrom200 > 115) ||
    (pe != null && pe > 120)
  ) {
    return "Crowded Momentum";
  }

  if (momentumScore >= 75 && expectationRisk >= 35) {
    return "Institutional Chase";
  }

  if (freshBreakoutScore >= 75 && expectationRisk <= 35) {
    return "Fresh Breakout";
  }

  if (momentumScore >= 55 && expectationRisk <= 35) {
    return "Emerging Setup";
  }

  if (expectationRisk <= 25) return "Early / Underpriced";

  return "Neutral";
}

export function getSetupGrade(row = {}) {
  const score = compositeScore(row);
  const trigger = calcTriggerScore(row);
  const momentum = calcMomentumScore(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  if (
    score >= 75 &&
    trigger >= 82 &&
    momentum >= 72 &&
    expectationRisk <= 38 &&
    extensionRisk <= 38 &&
    above50 !== false &&
    above200 !== false &&
    (pctFrom50 == null || pctFrom50 <= 22)
  ) {
    return "A";
  }

  if (
    score >= 62 &&
    trigger >= 68 &&
    momentum >= 50 &&
    expectationRisk <= 62 &&
    extensionRisk <= 62 &&
    above50 !== false
  ) {
    return "B";
  }

  if (expectationRisk >= 68 || extensionRisk >= 72 || above50 === false) {
    return "C";
  }

  return "B-";
}

function getRiskLevel(expectationRisk, extensionRisk, penalty, row = {}) {
  if (trueTradabilityFailure(row)) {
    return {
      label: "High",
      score: 100,
      tone: "red",
    };
  }

  const points =
    expectationRisk * 0.35 + extensionRisk * 0.45 + penalty * 0.2;

  if (points >= 60) {
    return {
      label: "High",
      score: Math.round(points),
      tone: "red",
    };
  }

  if (points >= 35) {
    return {
      label: "Medium",
      score: Math.round(points),
      tone: "yellow",
    };
  }

  return {
    label: "Low",
    score: Math.round(points),
    tone: "green",
  };
}

function getConfidenceLevel(
  score,
  triggerScore,
  momentumScore,
  relativeStrengthScore,
  expectationRisk,
  extensionRisk,
  row = {}
) {
  let points = 0;

  if (score >= 75) points += 25;
  else if (score >= 65) points += 18;
  else if (score >= 55) points += 10;

  if (triggerScore >= 85) points += 25;
  else if (triggerScore >= 75) points += 18;
  else if (triggerScore >= 65) points += 10;

  if (momentumScore >= 75) points += 20;
  else if (momentumScore >= 55) points += 12;

  if (relativeStrengthScore >= 65) points += 15;
  else if (relativeStrengthScore >= 55) points += 8;

  if (expectationRisk <= 35) points += 8;
  if (extensionRisk <= 35) points += 7;

  points -= missingDataPenalty(row) * 0.7;
  points = roundScore(points);

  if (points >= 75) {
    return {
      label: "High",
      score: points,
      tone: "green",
    };
  }

  if (points >= 50) {
    return {
      label: "Medium",
      score: points,
      tone: "yellow",
    };
  }

  return {
    label: "Low",
    score: points,
    tone: "red",
  };
}

function getContextTone(label, context) {
  const cleanLabel = String(label || "").toUpperCase();
  const cleanContext = String(context || "").toLowerCase();

  if (cleanContext.includes("binary")) return "yellow";

  if (
    cleanContext.includes("fails") ||
    cleanContext.includes("extended") ||
    cleanContext.includes("lagging") ||
    cleanContext.includes("risk")
  ) {
    return "red";
  }

  if (cleanLabel === "BUY NOW" || cleanLabel === "BUY") return "green";
  if (cleanLabel === "WATCH FOR ENTRY") return "yellow";

  return "red";
}

function buildInstitutionalContext(row = {}, recommendation = {}) {
  const archetype = recommendation.archetype || getArchetype(row);
  const label = String(recommendation.label || "").toUpperCase();
  const expectationRisk =
    recommendation.expectationRisk ?? calcExpectationRisk(row);
  const extensionRisk =
    recommendation.extensionRisk ?? calcExtensionRisk(row);
  const freshBreakoutScore =
    recommendation.freshBreakoutScore ?? calcFreshBreakoutScore(row);
  const triggerScore = recommendation.triggerScore ?? calcTriggerScore(row);
  const momentumScore = recommendation.momentumScore ?? calcMomentumScore(row);
  const relativeStrengthScore =
    recommendation.relativeStrengthScore ?? calcRelativeStrengthScore(row);
  const penalty = recommendation.riskPenalty ?? riskPenalty(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  if (trueTradabilityFailure(row)) return "Fails filter";

  if (archetype === "Biotech / Binary Event" && triggerScore >= 70) {
    return "Binary risk";
  }

  if (extensionRisk >= 62 || (pctFrom50 != null && pctFrom50 > 30)) {
    return "Extended";
  }

  if (expectationRisk >= 62) return "High expectations";

  if (label === "BUY NOW" && freshBreakoutScore >= 78) {
    return "Confirmed breakout";
  }

  if (label === "BUY NOW" && freshBreakoutScore >= 72) {
    return "Fresh breakout";
  }

  if (label === "BUY NOW") return "Clean setup";

  if (label === "BUY" && freshBreakoutScore >= 68) return "Early breakout";
  if (label === "BUY" && triggerScore >= 74) return "Strong trigger";
  if (label === "BUY") return "Constructive setup";

  if (label === "WATCH FOR ENTRY" && triggerScore >= 74) return "Strong trigger";
  if (label === "WATCH FOR ENTRY" && momentumScore >= 55) {
    return "Momentum building";
  }

  if (above50 === false || above200 === false) return "Trend not aligned";
  if (relativeStrengthScore < 45) return "Lagging";
  if (penalty >= 60) return "Risk controls";

  return archetype;
}

function buildDynamicReason(row = {}, recommendation = {}) {
  const action = labelDisplay(recommendation.label);
  const context =
    recommendation.context || buildInstitutionalContext(row, recommendation);
  const confidence = recommendation.confidence || "Low";
  const risk = recommendation.risk || "High";

  return `${action}: ${context}. Confidence is ${confidence}; risk is ${risk}.`;
}

function buildDynamicEntry(row = {}, recommendation = {}) {
  const label = String(recommendation.label || "").toUpperCase();

  if (label === "BUY NOW") {
    return "Confirmed actionable setup now. Use normal risk control.";
  }

  if (label === "BUY") {
    return "Starter-size buy only. Add if confirmation improves.";
  }

  if (label === "WATCH FOR ENTRY") {
    return "Watch for better confirmation before buying.";
  }

  return "Avoid for now. Wait for the setup to reset or improve.";
}

export function getRecommendation(row = {}) {
  const score = compositeScore(row);
  const triggerScore = calcTriggerScore(row);
  const momentumScore = calcMomentumScore(row);
  const relativeStrengthScore = calcRelativeStrengthScore(row);
  const penalty = riskPenalty(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const archetype = getArchetype(row);
  const themeMaturity = getThemeMaturity(row);
  const setupGrade = getSetupGrade(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  const rv = relativeVolume(row);
  const dayMove = num(row.dayChangePct);

  let label = "AVOID FOR NOW";

  const liquidEnough = passesInstitutionalFilter(row);
  const buyNowAllowed = buyNowAllowedByArchetype(row);

  const actionabilityScore =
    score * 0.24 +
    triggerScore * 0.29 +
    momentumScore * 0.18 +
    relativeStrengthScore * 0.12 +
    freshBreakoutScore * 0.08 -
    expectationRisk * 0.05 -
    extensionRisk * 0.06 -
    penalty * 0.03;

  const confidencePreview = getConfidenceLevel(
    score,
    triggerScore,
    momentumScore,
    relativeStrengthScore,
    expectationRisk,
    extensionRisk,
    row
  );

  const highConfidence = confidencePreview.label === "High";
  const mediumOrHighConfidence =
    confidencePreview.label === "High" || confidencePreview.label === "Medium";

  const cleanBreakoutConfirmation =
    freshBreakoutScore >= 82 &&
    triggerScore >= 85 &&
    momentumScore >= 74 &&
    relativeStrengthScore >= 62 &&
    extensionRisk <= 40 &&
    expectationRisk <= 45 &&
    penalty <= 45 &&
    above50 !== false &&
    above200 !== false &&
    (pctFrom50 == null || (pctFrom50 >= -2 && pctFrom50 <= 18)) &&
    (dayMove == null || (dayMove >= 0.25 && dayMove <= 8)) &&
    (rv == null || (rv >= 1.15 && rv <= 4.5));

  const cleanBuyNow =
    liquidEnough &&
    buyNowAllowed &&
    highConfidence &&
    cleanBreakoutConfirmation &&
    actionabilityScore >= 70 &&
    score >= 70;

  const buySetup =
    liquidEnough &&
    mediumOrHighConfidence &&
    above50 !== false &&
    actionabilityScore >= 56 &&
    triggerScore >= 68 &&
    momentumScore >= 45 &&
    relativeStrengthScore >= 42 &&
    expectationRisk <= 68 &&
    extensionRisk <= 70 &&
    penalty <= 72 &&
    (pctFrom50 == null || pctFrom50 <= 36);

  const watchSetup =
    liquidEnough &&
    actionabilityScore >= 45 &&
    triggerScore >= 55 &&
    expectationRisk <= 78 &&
    extensionRisk <= 82 &&
    penalty <= 82;

  if (cleanBuyNow) {
    label = "BUY NOW";
  } else if (buySetup) {
    label = "BUY";
  } else if (watchSetup) {
    label = "WATCH FOR ENTRY";
  }

  const riskLevel = getRiskLevel(expectationRisk, extensionRisk, penalty, row);

  const institutionalScore = roundScore(actionabilityScore + 20);

  const recommendation = {
    label,
    displayLabel: labelDisplay(label),
    score,
    institutionalScore,
    actionabilityScore: roundScore(actionabilityScore),
    triggerScore,
    momentumScore,
    relativeStrengthScore,
    riskPenalty: penalty,
    expectationRisk,
    extensionRisk,
    riskScore: riskLevel.score,
    freshBreakoutScore,
    themeMaturity,
    setupGrade,
    archetype,
    confidence: confidencePreview.label,
    confidenceScore: confidencePreview.score,
    confidenceTone: confidencePreview.tone,
    risk: riskLevel.label,
    riskTone: riskLevel.tone,
    breakoutConfirmed: cleanBreakoutConfirmation,
  };

  const context = buildInstitutionalContext(row, recommendation);
  const contextTone = getContextTone(label, context);

  return {
    ...recommendation,
    context,
    contextTone,
    reason: buildDynamicReason(row, {
      ...recommendation,
      context,
    }),
    entryNote: buildDynamicEntry(row, {
      ...recommendation,
      context,
    }),
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
      setupGrade === "A"
        ? "green"
        : setupGrade === "B" || setupGrade === "B-"
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

  return {
    above50dma: above50,
    above200dma: above200,
    pctFrom50dma: pctFrom50,
    pctFrom200dma: pctFrom200,
    triggerScore: calcTriggerScore(row),
    momentumScore: calcMomentumScore(row),
    relativeStrengthScore: calcRelativeStrengthScore(row),
    riskPenalty: riskPenalty(row),
    expectationRisk: calcExpectationRisk(row),
    extensionRisk: calcExtensionRisk(row),
    freshBreakoutScore: calcFreshBreakoutScore(row),
    themeMaturity: getThemeMaturity(row),
    setupGrade: getSetupGrade(row),
    archetype: getArchetype(row),
  };
}

export function buildFundamentalSnapshot(row = {}) {
  return {
    fundamentalScore: calcFundamentalScore(row),
    asymmetryScore: calcAsymmetryScore(row),
    marketCap: row.marketCap ?? null,
    pe: row.pe ?? null,
    eps: row.eps ?? null,
    avgVolume: row.avgVolume ?? null,
    volume: row.volume ?? null,
    expectationRisk: calcExpectationRisk(row),
    extensionRisk: calcExtensionRisk(row),
    freshBreakoutScore: calcFreshBreakoutScore(row),
    themeMaturity: getThemeMaturity(row),
    setupGrade: getSetupGrade(row),
    archetype: getArchetype(row),
  };
}

export const calcQualityScore = calcFundamentalScore;

export function calcHeatScore(row = {}) {
  return calcTriggerScore(row);
}

export function getTradeReadiness(row = {}) {
  const rec = getRecommendation(row);

  if (rec.label === "BUY NOW") {
    return {
      label: "TRADE READY",
      heatScore: rec.triggerScore,
      reason: rec.reason,
    };
  }

  if (rec.label === "BUY") {
    return {
      label: "BUY",
      heatScore: rec.triggerScore,
      reason: rec.reason,
    };
  }

  if (rec.label === "WATCH FOR ENTRY") {
    return {
      label: "WATCH CLOSELY",
      heatScore: rec.triggerScore,
      reason: rec.reason,
    };
  }

  return {
    label: "SETUP ONLY",
    heatScore: rec.triggerScore,
    reason: rec.reason,
  };
}
