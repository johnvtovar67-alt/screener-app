// lib/scoring.js

function num(value, fallback = null) {
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

  if (p == null || b == null || b === 0) return null;

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
    above50: price != null && ma50 != null ? price > ma50 : false,
    above200: price != null && ma200 != null ? price > ma200 : false,
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

  return roundScore(score);
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

  if (travel.includes(symbol)) {
    return "Travel / Cyclical";
  }

  if (
    banks.includes(symbol) ||
    name.includes("BANK") ||
    name.includes("FINANCIAL")
  ) {
    return "Financial / Rate Sensitive";
  }

  if (megaCapTech.includes(symbol)) {
    return "Mega-Cap Leadership";
  }

  if (growthMomentum.includes(symbol)) {
    return "Growth / Momentum";
  }

  return "General Equity";
}

function archetypeBuyNowAllowed(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return false;
  if (archetype === "Airline / Cyclical") return false;
  if (archetype === "Biotech / Binary Event") return false;

  return true;
}

function archetypePenalty(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return 18;
  if (archetype === "Airline / Cyclical") return 14;
  if (archetype === "Travel / Cyclical") return 8;
  if (archetype === "Financial / Rate Sensitive") return 6;
  if (archetype === "Crypto Proxy") return 6;

  return 0;
}

export function passesInstitutionalFilter(row = {}) {
  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);

  if (price == null || price < 5) return false;
  if (marketCap == null || marketCap < 300000000) return false;
  if (avgVolume == null || avgVolume < 500000) return false;

  return true;
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
  }

  if (pctFrom200 != null) {
    if (pctFrom200 > 180) risk += 34;
    else if (pctFrom200 > 130) risk += 26;
    else if (pctFrom200 > 90) risk += 18;
    else if (pctFrom200 > 60) risk += 8;
  }

  if (day != null) {
    if (day >= 18) risk += 34;
    else if (day >= 14) risk += 26;
    else if (day >= 10) risk += 18;
    else if (day >= 7) risk += 10;
  }

  if (rv != null && day != null) {
    if (rv >= 5 && day >= 8) risk += 20;
    else if (rv >= 3.5 && day >= 6) risk += 14;
    else if (rv >= 2.5 && day >= 5) risk += 8;
  }

  if (rv != null && pctFrom50 != null) {
    if (rv >= 4 && pctFrom50 > 25) risk += 18;
    else if (rv >= 3 && pctFrom50 > 18) risk += 10;
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

  if (above50) score += 14;
  if (above200) score += 10;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 6) score += 22;
    else if (pctFrom50 > 6 && pctFrom50 <= 12) score += 16;
    else if (pctFrom50 > 12 && pctFrom50 <= 18) score += 6;
    else if (pctFrom50 > 24) score -= 20;
    else if (pctFrom50 < -6) score -= 16;
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
    else if (rv < 0.7) score -= 8;
  }

  if (relative >= 65) score += 10;
  else if (relative <= 40) score -= 10;

  if (extensionRisk >= 55) score -= 24;
  else if (extensionRisk >= 40) score -= 14;

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

  return roundScore(risk);
}

function riskPenalty(row = {}) {
  let penalty = archetypePenalty(row);

  const price = num(row.price);
  const marketCap = num(row.marketCap);
  const avgVolume = num(row.avgVolume);
  const eps = num(row.eps);
  const pe = num(row.pe);
  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (price != null && price < 5) penalty += 100;
  if (marketCap != null && marketCap < 300000000) penalty += 100;
  if (avgVolume != null && avgVolume < 500000) penalty += 100;

  if (!above50) penalty += 10;
  if (!above200) penalty += 14;

  if (pctFrom50 != null && pctFrom50 > 22) penalty += 18;
  if (pctFrom50 != null && pctFrom50 > 35) penalty += 12;
  if (pctFrom50 != null && pctFrom50 < -10) penalty += 14;

  if (pctFrom200 != null && pctFrom200 > 80) penalty += 12;
  if (pctFrom200 != null && pctFrom200 > 130) penalty += 10;
  if (pctFrom200 != null && pctFrom200 < -15) penalty += 16;

  if (eps != null && eps < 0) penalty += 8;
  if (pe != null && pe > 80) penalty += 8;
  if (pe != null && pe < 0) penalty += 8;

  if (day != null && day <= -4) penalty += 12;
  if (day != null && day >= 12) penalty += 14;

  if (rv != null && rv < 0.6) penalty += 6;
  if (rv != null && rv >= 4 && extensionRisk >= 40) penalty += 12;

  penalty += expectationRisk * 0.38;
  penalty += extensionRisk * 0.28;

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
    else if (marketCap > 50000000000 && marketCap <= 500000000000) score += 8;
    else if (marketCap > 500000000000) score += 2;
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

  if (expectationRisk >= 55) score -= 10;
  else if (expectationRisk >= 40) score -= 5;

  if (archetype === "REIT / Income") score -= 8;

  return roundScore(score);
}

export function calcTechnicalScore(row = {}) {
  let score = 45;

  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const { above50, above200, pctFrom50, pctFrom200 } = trendData(row);

  if (above50) score += 18;
  else score -= 12;

  if (above200) score += 18;
  else score -= 14;

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

  if (expectationRisk >= 55) score -= 8;
  if (extensionRisk >= 55) score -= 10;

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

  if (expectationRisk >= 60) score -= 10;
  else if (expectationRisk >= 50) score -= 5;

  if (extensionRisk >= 60) score -= 14;
  else if (extensionRisk >= 45) score -= 7;

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
    else if (price > 150) score -= 5;
  }

  if (marketCap != null) {
    if (marketCap >= 500000000 && marketCap <= 25000000000) score += 15;
    else if (marketCap > 25000000000 && marketCap <= 150000000000) score += 8;
    else if (marketCap > 500000000000) score -= 6;
  }

  if (freshBreakoutScore >= 75 && extensionRisk <= 35) score += 8;

  if (expectationRisk <= 25) score += 8;
  else if (expectationRisk >= 55) score -= 18;
  else if (expectationRisk >= 40) score -= 8;

  if (extensionRisk >= 55) score -= 14;
  else if (extensionRisk >= 40) score -= 7;

  if (archetype === "Growth / Momentum") score += 8;
  if (archetype === "Crypto Proxy") score += 4;
  if (archetype === "Mega-Cap Leadership") score += 2;
  if (archetype === "REIT / Income") score -= 18;
  if (archetype === "Airline / Cyclical") score -= 10;

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

  if (above50) score += 15;
  else score -= 10;

  if (above200) score += 15;
  else score -= 10;

  if (pctFrom50 != null) {
    if (pctFrom50 >= 0 && pctFrom50 <= 7) score += 16;
    else if (pctFrom50 > 7 && pctFrom50 <= 15) score += 8;
    else if (pctFrom50 > 20) score -= 16;
    else if (pctFrom50 < -6) score -= 10;
  }

  if (day != null) {
    if (day >= 2 && day <= 6) score += 16;
    else if (day > 6 && day <= 10) score += 10;
    else if (day > 10) score -= 5;
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

  score -= penalty * 0.22;
  score -= expectationRisk * 0.08;
  score -= extensionRisk * 0.12;

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
    technical * 0.21 +
    momentum * 0.17 +
    asymmetry * 0.11 +
    relative * 0.14 +
    trigger * 0.14 +
    freshBreakout * 0.07 -
    penalty * 0.17 -
    expectationRisk * 0.1 -
    extensionRisk * 0.12;

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

  if (expectationRisk <= 25) {
    return "Early / Underpriced";
  }

  return "Neutral";
}

export function getSetupGrade(row = {}) {
  const score = compositeScore(row);
  const trigger = calcTriggerScore(row);
  const momentum = calcMomentumScore(row);
  const expectationRisk = calcExpectationRisk(row);
  const extensionRisk = calcExtensionRisk(row);
  const freshBreakoutScore = calcFreshBreakoutScore(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  if (
    score >= 75 &&
    trigger >= 80 &&
    momentum >= 75 &&
    expectationRisk <= 32 &&
    extensionRisk <= 35 &&
    freshBreakoutScore >= 65 &&
    above50 &&
    above200 &&
    (pctFrom50 == null || pctFrom50 <= 20)
  ) {
    return "A";
  }

  if (
    score >= 65 &&
    trigger >= 70 &&
    momentum >= 55 &&
    expectationRisk <= 48 &&
    extensionRisk <= 50 &&
    above50
  ) {
    return "B";
  }

  if (expectationRisk >= 58 || extensionRisk >= 65 || !above50 || momentum < 55) {
    return "C";
  }

  return "B-";
}

export function getColorTone(value, green = 75, yellow = 60) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "gray";
  if (n >= green) return "green";
  if (n >= yellow) return "yellow";

  return "red";
}

export function getMomentumTone(momentum) {
  if (momentum === "Strong") return "green";
  if (momentum === "Building") return "yellow";

  return "red";
}

export function getExpectationTone(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "gray";
  if (n <= 25) return "green";
  if (n <= 45) return "yellow";

  return "red";
}

export function getSetupTone(grade) {
  if (grade === "A") return "green";
  if (grade === "B" || grade === "B-") return "yellow";

  return "red";
}

function getRiskLevel(expectationRisk, extensionRisk, penalty) {
  const points =
    expectationRisk * 0.35 +
    extensionRisk * 0.45 +
    penalty * 0.2;

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
  extensionRisk
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

  if (cleanContext.includes("biotech") || cleanContext.includes("binary")) {
    return "yellow";
  }

  if (
    cleanContext.includes("fails") ||
    cleanContext.includes("extended") ||
    cleanContext.includes("high expectation") ||
    cleanContext.includes("not enough") ||
    cleanContext.includes("lagging") ||
    cleanContext.includes("risk controls")
  ) {
    return "red";
  }

  if (cleanLabel === "BUY NOW" || cleanLabel === "BUY") {
    return "green";
  }

  if (cleanLabel === "WATCH FOR ENTRY") {
    return "yellow";
  }

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
  const triggerScore =
    recommendation.triggerScore ?? calcTriggerScore(row);
  const momentumScore =
    recommendation.momentumScore ?? calcMomentumScore(row);
  const relativeStrengthScore =
    recommendation.relativeStrengthScore ?? calcRelativeStrengthScore(row);
  const penalty = recommendation.riskPenalty ?? riskPenalty(row);
  const { above50, above200, pctFrom50 } = trendData(row);

  if (!passesInstitutionalFilter(row)) {
    return "Fails liquidity / price filter";
  }

  if (archetype === "Biotech / Binary Event" && triggerScore >= 70) {
    return "Biotech / binary-event risk";
  }

  if (!archetypeBuyNowAllowed(row) && triggerScore >= 75) {
    return `${archetype} capped below Buy Now`;
  }

  if (extensionRisk >= 60 || (pctFrom50 != null && pctFrom50 > 28)) {
    return "Strong but extended";
  }

  if (expectationRisk >= 55) {
    return "High expectation risk";
  }

  if (label === "BUY NOW" && freshBreakoutScore >= 75) {
    return "Fresh breakout";
  }

  if (label === "BUY NOW") {
    return "Actionable institutional setup";
  }

  if (label === "BUY" && freshBreakoutScore >= 70) {
    return "Early breakout setup";
  }

  if (label === "BUY" && momentumScore >= 75) {
    return "Momentum setup";
  }

  if (label === "BUY") {
    return "Constructive starter setup";
  }

  if (label === "WATCH FOR ENTRY" && triggerScore >= 80) {
    return "Trigger strong, waiting on confirmation";
  }

  if (label === "WATCH FOR ENTRY" && momentumScore >= 55) {
    return "Momentum building";
  }

  if (!above50 || !above200) {
    return "Trend not fully aligned";
  }

  if (relativeStrengthScore < 50) {
    return "Relative strength lagging";
  }

  if (penalty >= 45) {
    return "Risk controls holding it back";
  }

  return archetype;
}

function buildDynamicReason(row = {}, recommendation = {}) {
  const action = labelDisplay(recommendation.label);
  const context =
    recommendation.context || buildInstitutionalContext(row, recommendation);
  const confidence = recommendation.confidence || "Low";
  const risk = recommendation.risk || "High";
  const label = String(recommendation.label || "").toUpperCase();

  if (label === "BUY NOW") {
    return `${action}: ${context}. Confidence is ${confidence}; risk of entering now is ${risk}.`;
  }

  if (label === "BUY") {
    return `${action}: ${context}. This is constructive, but not as urgent as Buy Now.`;
  }

  if (label === "WATCH FOR ENTRY") {
    return `${action}: ${context}. Wait for cleaner confirmation before buying.`;
  }

  return `${action}: ${context}. Not enough alignment for a new entry.`;
}

function buildDynamicEntry(row = {}, recommendation = {}) {
  const label = String(recommendation.label || "").toUpperCase();
  const context =
    recommendation.context || buildInstitutionalContext(row, recommendation);
  const risk = recommendation.risk || "High";

  if (label === "BUY NOW") {
    return risk === "High"
      ? "Only consider starter sizing because entry risk is elevated."
      : "Actionable now under the current rules. Use normal risk control.";
  }

  if (label === "BUY") {
    return "Starter-size only. Add only if the setup strengthens.";
  }

  if (label === "WATCH FOR ENTRY") {
    return `Watch for entry: ${context}. Wait for stronger price, volume, or momentum confirmation.`;
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

  let label = "AVOID FOR NOW";

  const liquidEnough = passesInstitutionalFilter(row);
  const scoreGreen = score >= 75;
  const triggerGreen = triggerScore >= 85;
  const momentumGreen = momentumScore >= 75;
  const momentumBuilding = momentumScore >= 55;
  const relativeOkay = relativeStrengthScore >= 55;
  const relativeStrong = relativeStrengthScore >= 65;

  const greenCount = [scoreGreen, triggerGreen, momentumGreen].filter(Boolean)
    .length;

  const cleanTrend =
    liquidEnough &&
    above50 &&
    above200 &&
    penalty <= 24 &&
    expectationRisk <= 38 &&
    extensionRisk <= 38 &&
    relativeStrengthScore >= 65 &&
    (pctFrom50 == null || pctFrom50 <= 18);

  const controlledSetup =
    liquidEnough &&
    above50 &&
    penalty <= 48 &&
    expectationRisk <= 55 &&
    extensionRisk <= 60 &&
    (pctFrom50 == null || pctFrom50 <= 28);

  const freshBreakout =
    freshBreakoutScore >= 78 &&
    extensionRisk <= 35 &&
    expectationRisk <= 38 &&
    above50 &&
    above200 &&
    relativeStrengthScore >= 65;

  const buyNowCandidate =
    archetypeBuyNowAllowed(row) &&
    liquidEnough &&
    ((greenCount === 3 && cleanTrend) ||
      (triggerScore >= 90 &&
        momentumScore >= 78 &&
        score >= 72 &&
        cleanTrend) ||
      (freshBreakout &&
        triggerScore >= 85 &&
        momentumScore >= 75 &&
        score >= 70));

  const buyCandidate =
    liquidEnough &&
    controlledSetup &&
    !buyNowCandidate &&
    ((greenCount >= 2 && momentumBuilding && relativeOkay) ||
      (triggerScore >= 78 &&
        momentumScore >= 65 &&
        score >= 60 &&
        relativeOkay) ||
      (freshBreakoutScore >= 70 &&
        triggerScore >= 70 &&
        score >= 58 &&
        relativeOkay));

  const watchCandidate =
    liquidEnough &&
    !buyNowCandidate &&
    !buyCandidate &&
    penalty <= 65 &&
    expectationRisk <= 68 &&
    extensionRisk <= 72 &&
    ((greenCount >= 1 && momentumBuilding) ||
      triggerScore >= 70 ||
      score >= 58 ||
      relativeStrong);

  if (buyNowCandidate) {
    label = "BUY NOW";
  } else if (buyCandidate) {
    label = "BUY";
  } else if (watchCandidate) {
    label = "WATCH FOR ENTRY";
  }

  const riskLevel = getRiskLevel(expectationRisk, extensionRisk, penalty);

  const confidenceLevel = getConfidenceLevel(
    score,
    triggerScore,
    momentumScore,
    relativeStrengthScore,
    expectationRisk,
    extensionRisk
  );

  const recommendation = {
    label,
    displayLabel: labelDisplay(label),
    score,
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
    confidence: confidenceLevel.label,
    confidenceScore: confidenceLevel.score,
    confidenceTone: confidenceLevel.tone,
    risk: riskLevel.label,
    riskTone: riskLevel.tone,
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
    scoreTone: getColorTone(score),
    triggerTone: getColorTone(triggerScore, 85, 70),
    momentumTone: getMomentumTone(getMomentumLabel(row)),
    expectationTone: getExpectationTone(expectationRisk),
    setupTone: getSetupTone(setupGrade),
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
