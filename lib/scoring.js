// lib/scoring.js
// Screener V2: one shared decision engine for broad screens and single-symbol checks.
// Philosophy: institutional-quality secular-growth leaders with actionable technical entries.

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function exists(value) {
  return value !== null && value !== undefined && value !== "";
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(clamp(value));
}

function pick(stock, keys, fallback = null) {
  for (const key of keys) {
    if (exists(stock?.[key])) return stock[key];
  }
  return fallback;
}

function pct(value) {
  if (!exists(value)) return null;
  const n = num(value, null);
  if (n === null) return null;
  return n;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toFixed(2)}`;
}

function getSymbol(stock = {}) {
  return String(stock.symbol || stock.ticker || "").toUpperCase().trim();
}

function getPrice(stock = {}) {
  return num(pick(stock, ["price", "currentPrice", "lastPrice", "close", "previousClose"]), 0);
}

function getChangePct(stock = {}) {
  return pct(pick(stock, ["dayChangePct", "changesPercentage", "changePercentage", "percentChange", "changePercent", "dayChangePercent"]));
}

function getMarketCap(stock = {}) {
  return num(pick(stock, ["marketCap", "mktCap", "marketCapitalization"]), 0);
}

function getVolume(stock = {}) {
  return num(pick(stock, ["volume", "vol"]), 0);
}

function getAvgVolume(stock = {}) {
  return num(pick(stock, ["avgVolume", "averageVolume", "avgVolume10Day", "avgVolume30Day", "averageVolume10Day", "averageVolume30Day"]), 0);
}

function getFiftyDay(stock = {}) {
  return num(pick(stock, ["fiftyDayAverage", "priceAvg50", "sma50", "ma50", "movingAverage50"]), 0);
}

function getTwoHundredDay(stock = {}) {
  return num(pick(stock, ["twoHundredDayAverage", "priceAvg200", "sma200", "ma200", "movingAverage200"]), 0);
}

function getYearHigh(stock = {}) {
  return num(pick(stock, ["yearHigh", "high52", "fiftyTwoWeekHigh"]), 0);
}

function getYearLow(stock = {}) {
  return num(pick(stock, ["yearLow", "low52", "fiftyTwoWeekLow"]), 0);
}

function getPe(stock = {}) {
  return num(pick(stock, ["pe", "peRatio", "priceEarningsRatio"]), 0);
}

function getPb(stock = {}) {
  return num(pick(stock, ["pb", "priceToBook", "priceBookValueRatio"]), 0);
}

function getDebtToEquity(stock = {}) {
  return num(pick(stock, ["debtToEquity", "debtEquityRatio", "deRatio"]), 0);
}

function getOperatingMargin(stock = {}) {
  return pct(pick(stock, ["operatingMargin", "operatingMarginTTM", "opMargin", "operatingProfitMargin"]));
}

function getGrossMargin(stock = {}) {
  return pct(pick(stock, ["grossMargin", "grossMarginTTM", "grossProfitMargin"]));
}

function getRevenueGrowth(stock = {}) {
  return pct(pick(stock, ["revenueGrowth", "revenueGrowthTTM", "revenueGrowthQoQ", "salesGrowth"]));
}

function getEarningsGrowth(stock = {}) {
  return pct(pick(stock, ["earningsGrowth", "epsGrowth", "epsGrowthTTM", "netIncomeGrowth"]));
}

function getBeta(stock = {}) {
  return num(pick(stock, ["beta"]), 1);
}

function getVs50(stock = {}) {
  const price = getPrice(stock);
  const ma = getFiftyDay(stock);
  if (price <= 0 || ma <= 0) return null;
  return ((price - ma) / ma) * 100;
}

function getVs200(stock = {}) {
  const price = getPrice(stock);
  const ma = getTwoHundredDay(stock);
  if (price <= 0 || ma <= 0) return null;
  return ((price - ma) / ma) * 100;
}

function getRangePosition(stock = {}) {
  const price = getPrice(stock);
  const high = getYearHigh(stock);
  const low = getYearLow(stock);
  if (price <= 0 || high <= 0 || low <= 0 || high <= low) return null;
  return ((price - low) / (high - low)) * 100;
}

function scoreRange(value, low, high) {
  if (!Number.isFinite(value)) return 50;
  if (value <= low) return 0;
  if (value >= high) return 100;
  return ((value - low) / (high - low)) * 100;
}

function hasValidQuote(stock = {}) {
  return getSymbol(stock) && getPrice(stock) > 0;
}

function getNameIndustrySector(stock = {}) {
  const symbol = getSymbol(stock);
  const name = normalizeText(stock.name || stock.companyName || "");
  const industry = normalizeText(stock.industry || "");
  const sector = normalizeText(stock.sector || "");
  const description = normalizeText(stock.description || "");
  const theme = normalizeText(stock.theme || stock.themeKey || "");
  return { symbol, name, industry, sector, description, theme, text: `${symbol} ${name} ${industry} ${sector} ${description} ${theme}`.toLowerCase() };
}

function isDigitalAssetProxy(stock = {}) {
  const { symbol, text } = getNameIndustrySector(stock);
  return ["MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF", "HUT", "BTDR", "CIFR", "BITF", "COIN", "HOOD"].includes(symbol) ||
    text.includes("bitcoin") || text.includes("crypto") || text.includes("digital asset") || text.includes("blockchain");
}

function hasBreakoutStructure(stock = {}) {
  const price = getPrice(stock);
  const fifty = getFiftyDay(stock);
  const twoHundred = getTwoHundredDay(stock);
  const range = getRangePosition(stock);
  const vs50 = getVs50(stock);
  if (price <= 0) return false;
  if (fifty > 0 && price < fifty) return false;
  if (twoHundred > 0 && price < twoHundred) return false;
  if (vs50 !== null && vs50 > 28) return false;
  return range !== null ? range >= 62 : true;
}

function calcFundamentalScore(stock = {}) {
  const marketCap = getMarketCap(stock);
  const pe = getPe(stock);
  const pb = getPb(stock);
  const debt = getDebtToEquity(stock);
  const opMargin = getOperatingMargin(stock);
  const grossMargin = getGrossMargin(stock);
  const revGrowth = getRevenueGrowth(stock);
  const epsGrowth = getEarningsGrowth(stock);

  let score = 50;

  if (marketCap >= 20000000000) score += 10;
  else if (marketCap >= 5000000000) score += 7;
  else if (marketCap >= 1000000000) score += 3;
  else if (marketCap > 0 && marketCap < 500000000) score -= 12;

  if (revGrowth !== null) {
    if (revGrowth >= 25) score += 14;
    else if (revGrowth >= 12) score += 9;
    else if (revGrowth >= 5) score += 4;
    else if (revGrowth < -5) score -= 9;
  }

  if (epsGrowth !== null) {
    if (epsGrowth >= 25) score += 10;
    else if (epsGrowth >= 10) score += 6;
    else if (epsGrowth < -10) score -= 8;
  }

  if (opMargin !== null) {
    if (opMargin >= 22) score += 8;
    else if (opMargin >= 10) score += 4;
    else if (opMargin < 0) score -= 10;
  }

  if (grossMargin !== null) {
    if (grossMargin >= 55) score += 5;
    else if (grossMargin >= 35) score += 2;
    else if (grossMargin < 18) score -= 5;
  }

  if (debt > 0 && debt <= 1) score += 4;
  else if (debt > 3) score -= 8;

  // Valuation is a risk check, not a value-stock reward. Premiums are allowed if growth supports them.
  if (pe > 0 && pe <= 35) score += 3;
  else if (pe > 80) score -= 5;
  if (pb > 0 && pb > 12) score -= 4;

  // Quote-only data should not automatically fail large liquid leaders.
  if (marketCap >= 10000000000 && revGrowth === null && epsGrowth === null && opMargin === null) score += 3;

  return round(score);
}

function calcTechnicalScore(stock = {}) {
  const price = getPrice(stock);
  const fifty = getFiftyDay(stock);
  const twoHundred = getTwoHundredDay(stock);
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);

  let score = 50;

  if (price > 0 && fifty > 0) {
    if (vs50 >= 2 && vs50 <= 15) score += 20;
    else if (vs50 > 0 && vs50 < 2) score += 10;
    else if (vs50 > 15 && vs50 <= 25) score += 6;
    else if (vs50 > 25) score -= 8;
    else if (vs50 >= -4) score -= 4;
    else score -= 16;
  }

  if (price > 0 && twoHundred > 0) {
    if (vs200 >= 8 && vs200 <= 45) score += 18;
    else if (vs200 >= 0) score += 8;
    else if (vs200 < -10) score -= 16;
    else score -= 8;
  }

  if (fifty > 0 && twoHundred > 0) score += fifty > twoHundred ? 10 : -10;

  if (range !== null) {
    if (range >= 60 && range <= 92) score += 14;
    else if (range > 92 && range <= 97) score += 5;
    else if (range > 97) score -= 5;
    else if (range < 35) score -= 10;
  }

  if (change !== null) {
    if (change >= 0.3 && change <= 4.5) score += 6;
    else if (change > 6.5) score -= 4;
    else if (change < -3) score -= 7;
  }

  return round(score);
}

function calcMomentumScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  let score = 50;

  if (vs50 !== null) score += scoreRange(vs50, -8, 20) * 0.28 - 14;
  if (vs200 !== null) score += scoreRange(vs200, -15, 45) * 0.24 - 12;
  if (range !== null) score += scoreRange(range, 30, 90) * 0.24 - 12;

  if (change !== null) {
    if (change > 0 && change <= 5) score += 9;
    else if (change > 5 && change <= 8) score += 3;
    else if (change > 8) score -= 5;
    else if (change < -3) score -= 9;
  }

  if (volume > 0 && avgVolume > 0) {
    const rv = volume / avgVolume;
    if (rv >= 1.2) score += 6;
    else if (rv >= 0.8) score += 2;
    else if (rv < 0.45) score -= 6;
  }

  return round(score);
}

function calcRelativeStrengthScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const day = getChangePct(stock);
  const spy = pct(stock.spyDayChangePct);
  const qqq = pct(stock.qqqDayChangePct);

  let score = 50;

  if (vs50 !== null) score += scoreRange(vs50, -6, 18) * 0.25 - 12.5;
  if (vs200 !== null) score += scoreRange(vs200, -10, 40) * 0.30 - 15;
  if (range !== null) score += scoreRange(range, 35, 92) * 0.25 - 12.5;

  if (day !== null && spy !== null) {
    const spread = day - spy;
    if (spread >= 1) score += 5;
    else if (spread <= -1.5) score -= 5;
  }

  if (day !== null && qqq !== null) {
    const spread = day - qqq;
    if (spread >= 1) score += 5;
    else if (spread <= -1.5) score -= 5;
  }

  return round(score);
}

function calcLeadershipScore(stock = {}) {
  return calcRelativeStrengthScore(stock);
}

function calcTriggerScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const day = getChangePct(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  let score = 50;

  if (vs50 !== null) {
    if (vs50 >= 1 && vs50 <= 10) score += 20;
    else if (vs50 > 10 && vs50 <= 18) score += 10;
    else if (vs50 > 18) score -= 6;
    else if (vs50 >= -2) score += 3;
    else score -= 12;
  }

  if (vs200 !== null) {
    if (vs200 >= 0 && vs200 <= 35) score += 10;
    else if (vs200 > 35) score += 3;
    else score -= 8;
  }

  if (range !== null) {
    if (range >= 62 && range <= 92) score += 12;
    else if (range > 92 && range <= 98) score += 3;
    else if (range < 45) score -= 8;
  }

  if (day !== null) {
    if (day >= 0.5 && day <= 4.5) score += 10;
    else if (day > 4.5 && day <= 7) score += 3;
    else if (day > 7) score -= 5;
    else if (day < -2.5) score -= 8;
  }

  if (volume > 0 && avgVolume > 0) {
    const rv = volume / avgVolume;
    if (rv >= 1.15) score += 8;
    else if (rv >= 0.75) score += 3;
    else if (rv < 0.4) score -= 8;
  }

  return round(score);
}

function calcExtensionRisk(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  const beta = getBeta(stock);

  let risk = 30;

  if (vs50 !== null) {
    if (vs50 > 35) risk += 30;
    else if (vs50 > 25) risk += 20;
    else if (vs50 > 18) risk += 10;
    else if (vs50 >= 2 && vs50 <= 12) risk -= 4;
  }

  if (vs200 !== null) {
    if (vs200 > 75) risk += 16;
    else if (vs200 > 50) risk += 8;
    else if (vs200 < -10) risk += 8;
  }

  if (range !== null) {
    if (range > 98) risk += 12;
    else if (range > 94) risk += 6;
    else if (range >= 55 && range <= 88) risk -= 4;
  }

  if (change !== null) {
    if (change > 8) risk += 10;
    else if (change > 5) risk += 5;
    else if (change < -5) risk += 6;
  }

  if (beta > 1.8) risk += 7;
  else if (beta > 1.4) risk += 3;

  return round(risk);
}

function calcRiskScore(stock = {}) {
  const marketCap = getMarketCap(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);
  const price = getPrice(stock);
  const beta = getBeta(stock);
  const extension = calcExtensionRisk(stock);

  let risk = 28 + extension * 0.35;

  if (marketCap > 0 && marketCap < 500000000) risk += 18;
  else if (marketCap > 0 && marketCap < 2000000000) risk += 8;
  else if (marketCap >= 10000000000) risk -= 4;

  const liquidity = Math.max(volume, avgVolume);
  if (liquidity > 0 && liquidity < 300000) risk += 12;
  else if (liquidity >= 1000000) risk -= 4;

  if (price > 0 && price < 5) risk += 10;
  if (beta > 2) risk += 8;
  else if (beta > 1.5) risk += 4;

  return round(risk);
}

function calcEntryQualityScore(stock = {}) {
  const trigger = calcTriggerScore(stock);
  const technical = calcTechnicalScore(stock);
  const extension = calcExtensionRisk(stock);
  const risk = calcRiskScore(stock);

  let score = trigger * 0.45 + technical * 0.35 + (100 - extension) * 0.15 + (100 - risk) * 0.05;
  return round(score);
}

function calcQualityScore(stock = {}) {
  return calcFundamentalScore(stock);
}

function calcAsymmetryScore(stock = {}) {
  const price = getPrice(stock);
  const high = getYearHigh(stock);
  const low = getYearLow(stock);
  let score = 50;

  if (price > 0 && high > 0 && low > 0 && high > low) {
    const upside = ((high - price) / price) * 100;
    const downside = ((price - low) / price) * 100;
    if (upside >= 25) score += 12;
    else if (upside >= 10) score += 6;
    else if (upside < 3) score -= 8;
    if (downside <= 25) score += 6;
    else if (downside > 55) score -= 8;
  }

  return round(score);
}

function compositeScore(stock = {}) {
  const businessQuality = calcFundamentalScore(stock);
  const leadership = calcLeadershipScore(stock);
  const technical = calcTechnicalScore(stock);
  const entryQuality = calcEntryQualityScore(stock);

  return round(
    businessQuality * 0.30 +
      leadership * 0.30 +
      technical * 0.25 +
      entryQuality * 0.15
  );
}

function calcHeatScore(stock = {}) {
  return compositeScore(stock);
}

function getExpectationRisk(stock = {}) {
  return calcRiskScore(stock);
}

function getExtensionRisk(stock = {}) {
  return calcExtensionRisk(stock);
}

function getFreshBreakoutScore(stock = {}) {
  return round(calcTriggerScore(stock) * 0.45 + calcMomentumScore(stock) * 0.35 + calcTechnicalScore(stock) * 0.20 - Math.max(0, calcExtensionRisk(stock) - 70) * 0.4);
}

function getStage(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);

  if (vs50 !== null && vs50 > 24) return "Extended";
  if (vs50 !== null && vs50 >= -4 && vs50 <= 5 && vs200 !== null && vs200 >= 0) return "Pullback";
  if (vs50 !== null && vs50 > 0 && vs200 !== null && vs200 > 0) return "Uptrend";
  if (range !== null && range < 35) return "Base / Repair";
  return "Developing";
}

function getMomentumLabel(stock = {}) {
  const momentum = calcMomentumScore(stock);
  if (momentum >= 75) return "Strong";
  if (momentum >= 58) return "Building";
  return "Weak";
}

function passesInstitutionalFilter(stock = {}) {
  const price = getPrice(stock);
  const marketCap = getMarketCap(stock);
  const volume = Math.max(getVolume(stock), getAvgVolume(stock));
  if (!hasValidQuote(stock)) return false;
  if (price < 3) return false;
  if (marketCap > 0 && marketCap < 250000000) return false;
  if (volume > 0 && volume < 100000) return false;
  return true;
}

function getCategoryRiskNote(stock = {}) {
  const { symbol, text } = getNameIndustrySector(stock);
  if (isDigitalAssetProxy(stock)) return "Digital-asset proxy; size for BTC correlation and volatility.";
  if (text.includes("reit") || text.includes("real estate investment trust")) return "REIT structure; size for rate sensitivity and real-estate cycle risk.";
  if (text.includes("biotech") || text.includes("therapeutic") || text.includes("clinical") || ["MRNA", "ALMS", "IOVA", "VKTX", "RXRX", "BCRX", "GERN", "ALT"].includes(symbol)) return "Biotech/platform risk; confirm catalyst, cash runway, and trial/approval exposure before sizing.";
  if (text.includes("airline") || ["AAL", "UAL", "DAL", "LUV"].includes(symbol)) return "Airline cyclicality; size for fuel, labor, and macro risk.";
  if (text.includes("space") || ["RKLB", "ASTS", "RDW", "BKSY", "IRDM"].includes(symbol)) return "Space theme; size for contract timing, funding needs, and execution risk.";
  if (text.includes("defense") || text.includes("aerospace") || ["LMT", "NOC", "RTX", "LHX", "KTOS", "AVAV", "HII", "GD"].includes(symbol)) return "Defense/aerospace exposure; monitor program timing and government budget risk.";
  return "";
}

function buildGateSummary(stock = {}) {
  const businessQuality = calcFundamentalScore(stock);
  const leadershipScore = calcLeadershipScore(stock);
  const technicalScore = calcTechnicalScore(stock);
  const entryQualityScore = calcEntryQualityScore(stock);
  const score = compositeScore(stock);
  const riskScore = calcRiskScore(stock);
  const extensionRisk = calcExtensionRisk(stock);
  const institutionalPass = passesInstitutionalFilter(stock);

  return {
    score,
    businessQuality,
    leadershipScore,
    technicalScore,
    entryQualityScore,
    momentumScore: calcMomentumScore(stock),
    triggerScore: calcTriggerScore(stock),
    riskScore,
    extensionRisk,
    institutionalPass,
    buyEligible:
      institutionalPass &&
      score >= 78 &&
      businessQuality >= 55 &&
      leadershipScore >= 72 &&
      technicalScore >= 70 &&
      entryQualityScore >= 60 &&
      riskScore <= 74 &&
      extensionRisk <= 76,
    starterEligible:
      institutionalPass &&
      score >= 68 &&
      leadershipScore >= 60 &&
      technicalScore >= 58 &&
      entryQualityScore >= 50 &&
      riskScore <= 82,
  };
}

function getTradeReadiness(stock = {}) {
  const gate = buildGateSummary(stock);
  if (gate.buyEligible) return "Buy";
  if (gate.starterEligible) return "Starter";
  if (gate.institutionalPass && (gate.score >= 54 || gate.businessQuality >= 68 || gate.leadershipScore >= 62)) return "Watch";
  return "Avoid";
}

function getNearTermBreakoutPrice(stock = {}) {
  const price = getPrice(stock);
  const high = getYearHigh(stock);
  const fifty = getFiftyDay(stock);
  if (price <= 0) return 0;
  if (high > price && high <= price * 1.12) return high;
  if (fifty > price && fifty <= price * 1.08) return fifty;
  return price * 1.04;
}

function getSupportPrice(stock = {}) {
  const price = getPrice(stock);
  const candidates = [getFiftyDay(stock), getTwoHundredDay(stock), getYearLow(stock)]
    .filter((value) => value > 0 && value < price)
    .sort((a, b) => b - a);
  if (candidates.length) return candidates[0];
  return price > 0 ? price * 0.94 : 0;
}


function buildRiskPlan(stock = {}, label = getTradeReadiness(stock)) {
  const price = getPrice(stock);
  const support = getSupportPrice(stock);
  const breakout = getNearTermBreakoutPrice(stock);
  const yearHigh = getYearHigh(stock);

  if (price <= 0) {
    return {
      invalidationPrice: null,
      addAbovePrice: null,
      firstTrimPrice: null,
      stretchTargetPrice: null,
      stopLossPct: null,
      upsideToFirstTrimPct: null,
      summary: "No risk plan available without a usable quote.",
    };
  }

  // Invalidation is the price where the setup thesis is no longer behaving.
  // It is not a prediction and it is not a required stop order; it is the level
  // where the position should be reviewed with fresh eyes.
  const invalidationPrice = support > 0 ? support * 0.985 : price * 0.92;

  // Add/confirmation level is the near-term price that would show the setup is
  // confirming, especially for Starter positions.
  const addAbovePrice = breakout > 0 ? breakout : price * 1.04;

  // Profit targets are staged. The first target is a trim/review zone, not an
  // automatic sell-all level. Prefer a nearby 52-week high when it is realistic;
  // otherwise use an upside extension from the current price.
  let firstTrimPrice = price * 1.16;
  if (yearHigh > price && yearHigh <= price * 1.35) {
    firstTrimPrice = yearHigh;
  }

  const stretchTargetPrice = Math.max(firstTrimPrice * 1.1, price * 1.28);
  const stopLossPct = ((price - invalidationPrice) / price) * 100;
  const upsideToFirstTrimPct = ((firstTrimPrice - price) / price) * 100;

  let summary = "Define risk before entry.";
  if (label === "Buy") {
    summary = `Buyable now. Review below ${formatPrice(invalidationPrice)}; profit review begins near ${formatPrice(firstTrimPrice)}.`;
  } else if (label === "Starter") {
    summary = `Starter acceptable. Add only above ${formatPrice(addAbovePrice)}; review below ${formatPrice(invalidationPrice)}.`;
  } else if (label === "Watch") {
    summary = `No new entry yet. Watch for confirmation above ${formatPrice(addAbovePrice)}.`;
  } else {
    summary = `Avoid until the setup improves; no profit target is useful until the thesis repairs.`;
  }

  return {
    invalidationPrice,
    addAbovePrice,
    firstTrimPrice,
    stretchTargetPrice,
    stopLossPct,
    upsideToFirstTrimPct,
    summary,
  };
}

function buildThesis(stock = {}) {
  const symbol = getSymbol(stock);
  const name = stock.name || stock.companyName || symbol;
  const stage = getStage(stock);
  const leadership = calcLeadershipScore(stock);
  const tech = calcTechnicalScore(stock);
  const theme = stock.themeName || stock.theme || "secular-growth";

  if (leadership >= 72 && tech >= 70) return `${name} is a ${theme} leader with strong relative strength and a constructive ${stage.toLowerCase()} setup.`;
  if (leadership >= 62) return `${name} remains relevant to the ${theme} theme, but the setup still needs cleaner confirmation.`;
  return `${name} is in the ${theme} universe, but the current setup does not yet show enough leadership or technical confirmation.`;
}

function getDominantReason(stock = {}, gate = buildGateSummary(stock)) {
  if (!gate.institutionalPass) return "Fails basic tradability or quote-quality checks.";
  if (gate.extensionRisk > 76) return "Leadership is present, but the stock is too extended for a clean new-money entry.";
  if (gate.leadershipScore < 60) return "Relative strength is not strong enough versus the market leadership standard.";
  if (gate.technicalScore < 58) return "Technical structure is not yet constructive enough for new capital.";
  if (gate.entryQualityScore < 50) return "Entry quality is weak; wait for a cleaner trigger or pullback.";
  if (gate.businessQuality < 55) return "Business-quality inputs are not strong enough for a full Buy.";
  if (gate.buyEligible) return "Business quality, leadership, technical structure, and entry quality are aligned.";
  if (gate.starterEligible) return "Good leadership setup, but one or more Buy-level confirmations are still short.";
  return "Setup is improving but not strong enough for new capital yet.";
}

function buildActionSummary(label, dominantReason, score, stock = {}) {
  if (label === "Buy") return "High-conviction setup. Normal position size is appropriate.";
  if (label === "Starter") return "Small position is acceptable. Upgrade only after confirmation.";
  if (label === "Watch") return "Not actionable yet. Wait for confirmation.";
  return "Capital is better deployed elsewhere today.";
}

function buildReason(label, dominantReason, stock = {}) {
  const support = getSupportPrice(stock);
  const breakout = getNearTermBreakoutPrice(stock);
  if (label === "Buy") return `Actionable now, with invalidation near ${formatPrice(support)} if the setup fails.`;
  if (label === "Starter") return `Small starter is acceptable; upgrade after a sustained move through ${formatPrice(breakout)} or a constructive hold above support.`;
  if (label === "Watch") return `Not actionable yet. Wait for a cleaner trigger near ${formatPrice(breakout)}.`;
  return "Capital is better deployed elsewhere today.";
}

function buildEntryNote(label, dominantReason, stock = {}) {
  const support = getSupportPrice(stock);
  const breakout = getNearTermBreakoutPrice(stock);
  if (label === "Buy") return `Immediate decision. Normal size is appropriate if risk is defined near ${formatPrice(support)}.`;
  if (label === "Starter") return `Starter size only. Reassess after confirmation above ${formatPrice(breakout)} or a constructive hold above support.`;
  if (label === "Watch") return `Monitor only. Revisit after a break above ${formatPrice(breakout)} or a constructive pullback to support.`;
  return "Avoid until the business/leadership/technical profile materially improves.";
}

function getMarketContextLabel(stock = {}) {
  const label = getTradeReadiness(stock);
  const stage = getStage(stock);
  if (label === "Buy") return "Leadership Actionable";
  if (label === "Starter") return "Leadership Developing";
  if (stage === "Pullback") return "Watching Support";
  if (stage === "Extended") return "Digesting Gains";
  return stage;
}

function buildTechnicalSnapshot(stock = {}) {
  return {
    price: getPrice(stock),
    fiftyDayAverage: getFiftyDay(stock),
    twoHundredDayAverage: getTwoHundredDay(stock),
    vs50: getVs50(stock),
    vs200: getVs200(stock),
    rangePosition: getRangePosition(stock),
    dayChangePct: getChangePct(stock),
    technicalScore: calcTechnicalScore(stock),
    momentumScore: calcMomentumScore(stock),
    relativeStrengthScore: calcRelativeStrengthScore(stock),
    leadershipScore: calcLeadershipScore(stock),
    triggerScore: calcTriggerScore(stock),
    entryQualityScore: calcEntryQualityScore(stock),
    riskScore: calcRiskScore(stock),
    extensionRisk: calcExtensionRisk(stock),
    stage: getStage(stock),
    context: getMarketContextLabel(stock),
  };
}

function buildFundamentalSnapshot(stock = {}) {
  return {
    marketCap: getMarketCap(stock),
    pe: getPe(stock),
    pb: getPb(stock),
    revenueGrowth: getRevenueGrowth(stock),
    earningsGrowth: getEarningsGrowth(stock),
    operatingMargin: getOperatingMargin(stock),
    grossMargin: getGrossMargin(stock),
    debtToEquity: getDebtToEquity(stock),
    businessQualityScore: calcFundamentalScore(stock),
    fundamentalScore: calcFundamentalScore(stock),
  };
}

function getRecommendation(stock = {}) {
  const gateSummary = buildGateSummary(stock);
  const label = getTradeReadiness(stock);
  const score = compositeScore(stock);
  const dominantReason = getDominantReason(stock, gateSummary);
  const thesis = buildThesis(stock);

  return {
    label,
    displayLabel: label,
    recommendation: label,
    tradeAction: label,
    score,
    heatScore: score,
    stage: getStage(stock),
    momentum: getMomentumLabel(stock),
    momentumLabel: getMomentumLabel(stock),
    context: getMarketContextLabel(stock),
    thesis,
    dominantReason,
    actionSummary: buildActionSummary(label, dominantReason, score, stock),
    reason: buildReason(label, dominantReason, stock),
    entryNote: buildEntryNote(label, dominantReason, stock),
    triggerNeeded: buildEntryNote(label, dominantReason, stock),
    gateSummary,
    businessQualityScore: gateSummary.businessQuality,
    leadershipScore: gateSummary.leadershipScore,
    technicalScore: gateSummary.technicalScore,
    fundamentalScore: gateSummary.businessQuality,
    momentumScore: gateSummary.momentumScore,
    relativeStrengthScore: gateSummary.leadershipScore,
    triggerScore: gateSummary.triggerScore,
    entryQualityScore: gateSummary.entryQualityScore,
    riskScore: gateSummary.riskScore,
    expectationRisk: gateSummary.riskScore,
    extensionRisk: gateSummary.extensionRisk,
    freshBreakoutScore: getFreshBreakoutScore(stock),
    breakoutStructure: hasBreakoutStructure(stock),
    categoryRiskNote: getCategoryRiskNote(stock),
    riskPlan: buildRiskPlan(stock, label),
    blockedBuyNow: false,
    blockedReason: "",
  };
}

function analyzeStock(stock = {}) {
  const recommendation = getRecommendation(stock);
  return {
    ...stock,
    score: recommendation.score,
    compositeScore: recommendation.score,
    heatScore: recommendation.score,
    recommendation,
    displayLabel: recommendation.label,
    label: recommendation.label,
    tradeAction: recommendation.label,
    stage: recommendation.stage,
    thesis: recommendation.thesis,
    dominantReason: recommendation.dominantReason,
    actionSummary: recommendation.actionSummary,
    reason: recommendation.reason,
    entryNote: recommendation.entryNote,
    triggerNeeded: recommendation.triggerNeeded,
    categoryRiskNote: recommendation.categoryRiskNote,
    riskPlan: recommendation.riskPlan,
    businessQualityScore: recommendation.businessQualityScore,
    fundamentalScore: recommendation.fundamentalScore,
    leadershipScore: recommendation.leadershipScore,
    technicalScore: recommendation.technicalScore,
    momentumScore: recommendation.momentumScore,
    relativeStrengthScore: recommendation.relativeStrengthScore,
    triggerScore: recommendation.triggerScore,
    entryQualityScore: recommendation.entryQualityScore,
    riskScore: recommendation.riskScore,
    expectationRisk: recommendation.expectationRisk,
    extensionRisk: recommendation.extensionRisk,
    institutionalPass: passesInstitutionalFilter(stock),
    technicalSnapshot: buildTechnicalSnapshot(stock),
    fundamentalSnapshot: buildFundamentalSnapshot(stock),
  };
}

export {
  analyzeStock,
  passesInstitutionalFilter,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcLeadershipScore,
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
  calcEntryQualityScore,
  calcRiskScore,
  compositeScore,
  calcHeatScore,
  getTradeReadiness,
  getRecommendation,
  getStage,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
  buildGateSummary,
  getDominantReason,
  getExtensionRisk,
  getExpectationRisk,
  getFreshBreakoutScore,
  getCategoryRiskNote,
  buildRiskPlan,
};
