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

function buyAllowedByArchetype(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "Biotech / Binary Event") return false;
  if (archetype === "REIT / Income") return false;
  if (archetype === "Airline / Cyclical") return false;

  return true;
}

function archetypeRiskPenalty(row = {}) {
  const archetype = getArchetype(row);

  if (archetype === "REIT / Income") return 12;
  if (archetype === "Pipeline / Income Energy") return 8;
  if (archetype === "Airline / Cyclical") return 10;
  if (archetype === "Travel / Cyclical") return 7;
  if (archetype === "Financial / Rate Sensitive") return 4;
  if (archetype === "Crypto Proxy") return 8;
  if (archetype === "Biotech / Binary Event") return 16;

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
