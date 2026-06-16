// lib/scoring.js
// Clean shared scoring model. The broad screener and single-symbol checker must
// both call analyzeStock() / getRecommendation() so they cannot disagree.

function exists(value) {
  return value !== null && value !== undefined && value !== "";
}

function num(value, fallback = 0) {
  if (!exists(value)) return fallback;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value) {
  if (!exists(value)) return null;
  const n = num(value, null);
  if (n === null) return null;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function clamp(value, min = 0, max = 100) {
  const n = num(value, min);
  return Math.max(min, Math.min(max, n));
}

function round(value) {
  return Math.round(clamp(value));
}

function formatPrice(value) {
  const n = num(value, null);
  if (n === null || n <= 0) return "";
  return `$${n.toFixed(2)}`;
}

function pick(stock, keys, fallback = null) {
  for (const key of keys) {
    if (exists(stock?.[key])) return stock[key];
  }
  return fallback;
}

function getSymbol(stock = {}) {
  return String(stock.symbol || stock.ticker || "").toUpperCase().trim();
}

function getName(stock = {}) {
  return stock.name || stock.companyName || stock.company || getSymbol(stock);
}

function getPrice(stock = {}) {
  return num(pick(stock, ["price", "currentPrice", "lastPrice", "close", "previousClose"]), 0);
}

function getPreviousClose(stock = {}) {
  return num(pick(stock, ["previousClose", "priorClose"]), 0);
}

function getChangePct(stock = {}) {
  const direct = pct(pick(stock, ["dayChangePct", "changesPercentage", "changePercentage", "percentChange", "changePercent", "dayChangePercent"]));
  if (direct !== null) return direct;
  const price = getPrice(stock);
  const prev = getPreviousClose(stock);
  if (price > 0 && prev > 0) return ((price - prev) / prev) * 100;
  return null;
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
  return num(pick(stock, ["fiftyDayAverage", "priceAvg50", "priceAvg50d", "sma50", "ma50", "movingAverage50"]), 0);
}

function getTwoHundredDay(stock = {}) {
  return num(pick(stock, ["twoHundredDayAverage", "priceAvg200", "priceAvg200d", "sma200", "ma200", "movingAverage200"]), 0);
}

function getYearHigh(stock = {}) {
  return num(pick(stock, ["yearHigh", "high52", "fiftyTwoWeekHigh", "yearHighPrice"]), 0);
}

function getYearLow(stock = {}) {
  return num(pick(stock, ["yearLow", "low52", "fiftyTwoWeekLow", "yearLowPrice"]), 0);
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

function getRelativeVolume(stock = {}) {
  const volume = getVolume(stock);
  const avg = getAvgVolume(stock);
  if (volume <= 0 || avg <= 0) return null;
  return volume / avg;
}

function calcFundamentalScore(stock = {}) {
  const marketCap = getMarketCap(stock);
  const pe = getPe(stock);
  const pb = getPb(stock);
  const de = getDebtToEquity(stock);
  const op = getOperatingMargin(stock);
  const gross = getGrossMargin(stock);
  const rev = getRevenueGrowth(stock);
  const eps = getEarningsGrowth(stock);

  let score = 50;
  if (marketCap >= 10000000000) score += 9;
  else if (marketCap >= 2000000000) score += 6;
  else if (marketCap >= 300000000) score += 2;
  else if (marketCap > 0) score -= 10;

  if (pe > 0 && pe <= 18) score += 7;
  else if (pe > 18 && pe <= 35) score += 3;
  else if (pe > 60) score -= 5;

  if (pb > 0 && pb <= 2) score += 5;
  else if (pb > 7) score -= 4;

  if (de > 0 && de <= 0.8) score += 5;
  else if (de > 2.5) score -= 7;

  if (op !== null) score += op >= 20 ? 8 : op >= 10 ? 4 : op < 0 ? -8 : 0;
  if (gross !== null) score += gross >= 50 ? 4 : gross >= 30 ? 2 : gross < 15 ? -3 : 0;
  if (rev !== null) score += rev >= 25 ? 8 : rev >= 10 ? 5 : rev < -5 ? -6 : 0;
  if (eps !== null) score += eps >= 25 ? 8 : eps >= 10 ? 5 : eps < -10 ? -6 : 0;

  return round(score);
}

function calcTechnicalScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  const fifty = getFiftyDay(stock);
  const twoHundred = getTwoHundredDay(stock);
  let score = 50;

  if (vs50 !== null) {
    if (vs50 >= 2 && vs50 <= 15) score += 18;
    else if (vs50 > 15 && vs50 <= 25) score += 8;
    else if (vs50 > 25) score -= 8;
    else if (vs50 >= -3) score += 2;
    else score -= 14;
  }

  if (vs200 !== null) {
    if (vs200 >= 5 && vs200 <= 45) score += 15;
    else if (vs200 >= 0) score += 7;
    else if (vs200 < -10) score -= 14;
    else score -= 6;
  }

  if (fifty > 0 && twoHundred > 0) score += fifty > twoHundred ? 10 : -8;

  if (range !== null) {
    if (range >= 55 && range <= 88) score += 12;
    else if (range > 88 && range <= 96) score += 4;
    else if (range > 96) score -= 5;
    else if (range < 35) score -= 8;
  }

  if (change !== null) {
    if (change >= 0.5 && change <= 5.5) score += 8;
    else if (change > 5.5 && change <= 9) score += 3;
    else if (change > 9) score -= 5;
    else if (change < -4) score -= 8;
  }

  return round(score);
}

function calcMomentumScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  let score = 50;

  if (vs50 !== null) score += scoreRange(vs50, -8, 18) * 0.32 - 16;
  if (vs200 !== null) score += scoreRange(vs200, -15, 40) * 0.25 - 12.5;
  if (range !== null) score += scoreRange(range, 25, 88) * 0.22 - 11;
  if (change !== null) score += change > 0 && change <= 6 ? 12 : change > 6 && change <= 10 ? 5 : change > 10 ? -3 : change < -3 ? -10 : 0;

  return round(score);
}

function calcRelativeStrengthScore(stock = {}) {
  const stockChange = getChangePct(stock);
  const spy = pct(stock.spyDayChangePct);
  const qqq = pct(stock.qqqDayChangePct);
  let score = calcMomentumScore(stock);

  const market = spy !== null && qqq !== null ? (spy + qqq) / 2 : spy ?? qqq;
  if (stockChange !== null && market !== null) {
    const spread = stockChange - market;
    score += spread >= 4 ? 12 : spread >= 2 ? 8 : spread >= 0 ? 3 : spread < -4 ? -12 : spread < -2 ? -7 : -3;
  }

  return round(score);
}

function calcQualityScore(stock = {}) {
  let score = calcFundamentalScore(stock);
  if (getMarketCap(stock) >= 2000000000) score += 4;
  if (getDebtToEquity(stock) > 2.5) score -= 8;
  const op = getOperatingMargin(stock);
  if (op !== null && op < 0) score -= 8;
  return round(score);
}

function calcAsymmetryScore(stock = {}) {
  const price = getPrice(stock);
  const high = getYearHigh(stock);
  const low = getYearLow(stock);
  const pe = getPe(stock);
  const pb = getPb(stock);
  let score = 50;

  if (price > 0 && high > price) {
    const upside = ((high - price) / price) * 100;
    score += upside >= 35 ? 14 : upside >= 18 ? 8 : upside < 5 ? -7 : 0;
  }
  if (price > 0 && low > 0 && low < price) {
    const downside = ((price - low) / price) * 100;
    score += downside <= 22 ? 6 : downside > 55 ? -8 : 0;
  }
  if (pb > 0 && pb <= 2) score += 6;
  else if (pb > 7) score -= 5;
  if (pe > 0 && pe <= 25) score += 4;
  else if (pe > 60) score -= 4;

  return round(score);
}

function calcTriggerScore(stock = {}) {
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  const relVol = getRelativeVolume(stock);
  let score = 42;

  if (vs50 !== null) {
    if (vs50 >= 1 && vs50 <= 8) score += 18;
    else if (vs50 > 8 && vs50 <= 15) score += 10;
    else if (vs50 > 15 && vs50 <= 24) score += 2;
    else if (vs50 > 24) score -= 10;
    else if (vs50 >= -2) score += 2;
    else score -= 14;
  }

  if (vs200 !== null) {
    if (vs200 >= 4 && vs200 <= 45) score += 10;
    else if (vs200 >= 0) score += 5;
    else if (vs200 >= -5) score -= 3;
    else score -= 12;
  }

  if (range !== null) {
    if (range >= 60 && range <= 88) score += 9;
    else if (range > 88 && range <= 94) score += 4;
    else if (range > 94) score -= 5;
    else if (range < 35) score -= 8;
  }

  if (change !== null) {
    if (change >= 0.8 && change <= 4.5) score += 8;
    else if (change > 4.5 && change <= 7) score += 3;
    else if (change > 7) score -= 6;
    else if (change < -3.5) score -= 8;
  }

  if (relVol !== null) {
    if (relVol >= 1.4) score += 8;
    else if (relVol >= 1) score += 4;
    else if (relVol < 0.5) score -= 5;
  }

  return round(score);
}

function calcRiskScore(stock = {}) {
  const marketCap = getMarketCap(stock);
  const beta = getBeta(stock);
  const vs50 = getVs50(stock);
  const range = getRangePosition(stock);
  const price = getPrice(stock);
  const relVol = getRelativeVolume(stock);
  let risk = 35;

  if (marketCap > 0 && marketCap < 300000000) risk += 22;
  else if (marketCap > 0 && marketCap < 2000000000) risk += 10;
  else if (marketCap >= 10000000000) risk -= 5;

  if (price > 0 && price < 5) risk += 18;
  else if (price > 0 && price < 10) risk += 8;

  if (beta > 1.8) risk += 12;
  else if (beta > 1.3) risk += 6;
  else if (beta > 0 && beta < 0.8) risk -= 3;

  if (vs50 !== null) risk += vs50 > 35 ? 22 : vs50 > 25 ? 12 : vs50 < -12 ? 10 : 0;
  if (range !== null) risk += range > 97 ? 8 : range < 20 ? 6 : 0;
  if (relVol !== null && relVol < 0.35) risk += 8;

  return round(risk);
}

function getExtensionRisk(stock = {}) {
  const vs50 = getVs50(stock);
  const range = getRangePosition(stock);
  const change = getChangePct(stock);
  let risk = 30;
  if (vs50 !== null) risk += vs50 > 42 ? 34 : vs50 > 34 ? 24 : vs50 > 26 ? 16 : vs50 > 18 ? 8 : vs50 >= 2 ? -4 : 0;
  if (range !== null) risk += range > 98 ? 16 : range > 94 ? 8 : range >= 55 && range <= 88 ? -5 : 0;
  if (change !== null) risk += change > 10 ? 12 : change > 7 ? 6 : change < -5 ? 5 : 0;
  return round(risk);
}

function getExpectationRisk(stock = {}) {
  return round(calcRiskScore(stock) * 0.62 + getExtensionRisk(stock) * 0.38);
}

function hasBreakoutStructure(stock = {}) {
  const trigger = calcTriggerScore(stock);
  const momentum = calcMomentumScore(stock);
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const range = getRangePosition(stock);
  return trigger >= 68 && momentum >= 62 && (vs50 === null || (vs50 >= 0 && vs50 <= 25)) && (vs200 === null || vs200 >= -2) && (range === null || range >= 50);
}

function getFreshBreakoutScore(stock = {}) {
  let score = calcTriggerScore(stock) * 0.42 + calcMomentumScore(stock) * 0.34 + calcTechnicalScore(stock) * 0.24;
  const relVol = getRelativeVolume(stock);
  const vs50 = getVs50(stock);
  const range = getRangePosition(stock);
  if (vs50 !== null && vs50 >= 1 && vs50 <= 24) score += 6;
  if (range !== null && range >= 58) score += 4;
  if (relVol !== null && relVol >= 1) score += 4;
  if (hasBreakoutStructure(stock)) score += 6;
  if (getExtensionRisk(stock) >= 72) score -= 8;
  return round(score);
}

function compositeScore(stock = {}) {
  const fundamental = calcFundamentalScore(stock);
  const technical = calcTechnicalScore(stock);
  const momentum = calcMomentumScore(stock);
  const relativeStrength = calcRelativeStrengthScore(stock);
  const trigger = calcTriggerScore(stock);
  const asymmetry = calcAsymmetryScore(stock);
  const risk = getExpectationRisk(stock);

  const score =
    technical * 0.30 +
    relativeStrength * 0.28 +
    momentum * 0.22 +
    trigger * 0.12 +
    fundamental * 0.05 +
    asymmetry * 0.03 -
    Math.max(0, risk - 72) * 0.20;

  return round(score);
}

function calcHeatScore(stock = {}) {
  return compositeScore(stock);
}

function getStage(stock = {}) {
  const price = getPrice(stock);
  const fifty = getFiftyDay(stock);
  const twoHundred = getTwoHundredDay(stock);
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  if (price <= 0) return "No Quote";
  if (hasBreakoutStructure(stock)) return "Breakout";
  if (fifty > 0 && twoHundred > 0 && price > fifty && fifty > twoHundred) return "Uptrend";
  if (vs50 !== null && vs50 >= -5 && vs50 <= 3 && (vs200 === null || vs200 >= -5)) return "Pullback";
  if (twoHundred > 0 && price < twoHundred) return "Repairing";
  return "Developing";
}

function getMomentumLabel(stock = {}) {
  const score = calcMomentumScore(stock);
  if (score >= 75) return "Strong";
  if (score >= 55) return "Building";
  return "Weak";
}

function getNearTermBreakoutPrice(stock = {}) {
  const price = getPrice(stock);
  const high = getYearHigh(stock);
  const fifty = getFiftyDay(stock);
  if (price <= 0) return 0;
  if (high > price && high <= price * 1.12) return high;
  if (fifty > price && fifty <= price * 1.18) return fifty;
  if (fifty > 0 && price > fifty) return price * 1.02;
  return price * 1.06;
}

function getSupportPrice(stock = {}) {
  const price = getPrice(stock);
  const candidates = [getFiftyDay(stock), getTwoHundredDay(stock), getYearLow(stock)].filter((v) => v > 0 && v < price).sort((a, b) => b - a);
  return candidates[0] || (price > 0 ? price * 0.94 : 0);
}

function buildCategoryRiskNote(stock = {}) {
  const text = `${getSymbol(stock)} ${getName(stock)} ${stock.sector || ""} ${stock.industry || ""} ${stock.description || ""}`.toLowerCase();
  const notes = [];
  if (text.includes("reit") || text.includes("real estate investment trust")) notes.push("REIT/rate sensitivity");
  if (text.includes("pipeline") || text.includes("midstream") || text.includes("mlp")) notes.push("income/pipeline cyclicality");
  if (text.includes("airline") || ["AAL", "UAL", "DAL", "LUV"].includes(getSymbol(stock))) notes.push("airline macro/fuel risk");
  if (text.includes("biotech") || text.includes("therapeutic") || text.includes("pharmaceutical") || ["MRNA", "NVAX", "CRSP", "BEAM", "IOVA", "RXRX", "SDGR", "DNA", "ALT", "BCRX", "ALMS", "VKTX", "GERN"].includes(getSymbol(stock))) notes.push("biotech/platform volatility");
  if (text.includes("bitcoin") || text.includes("crypto") || ["MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF", "HUT", "BTDR", "CIFR", "BITF", "COIN", "HOOD"].includes(getSymbol(stock))) notes.push("digital-asset beta");
  return notes.length ? `Size for ${notes.join(" and ")}.` : "";
}

function passesInstitutionalFilter(stock = {}) {
  const price = getPrice(stock);
  const marketCap = getMarketCap(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);
  if (price <= 0) return false;
  if (price < 3) return false;
  if (marketCap > 0 && marketCap < 200000000) return false;
  if (volume > 0 && avgVolume > 0 && Math.max(volume, avgVolume) < 75000) return false;
  return true;
}

function getTradeReadiness(stock = {}) {
  const score = compositeScore(stock);
  const technical = calcTechnicalScore(stock);
  const momentum = calcMomentumScore(stock);
  const relativeStrength = calcRelativeStrengthScore(stock);
  const trigger = calcTriggerScore(stock);
  const risk = getExpectationRisk(stock);
  const extension = getExtensionRisk(stock);
  const institutionalPass = passesInstitutionalFilter(stock);
  const price = getPrice(stock);

  if (price <= 0) return "Avoid";
  if (!institutionalPass && score < 74) return "Avoid";
  if (risk >= 88 || extension >= 92) return "Avoid";

  if (
    score >= 78 &&
    technical >= 70 &&
    relativeStrength >= 70 &&
    momentum >= 66 &&
    trigger >= 60 &&
    risk <= 78 &&
    extension <= 84
  ) {
    return "Buy";
  }

  if (
    score >= 66 &&
    technical >= 58 &&
    momentum >= 55 &&
    trigger >= 52 &&
    risk <= 84 &&
    extension <= 88
  ) {
    return "Starter";
  }

  if (score >= 50 || trigger >= 50 || momentum >= 50 || technical >= 50) {
    return "Watch";
  }

  return "Avoid";
}

function buildGateSummary(stock = {}) {
  return {
    institutionalPass: passesInstitutionalFilter(stock),
    price: getPrice(stock),
    marketCap: getMarketCap(stock),
    volume: getVolume(stock),
    avgVolume: getAvgVolume(stock),
    riskScore: calcRiskScore(stock),
    expectationRisk: getExpectationRisk(stock),
    extensionRisk: getExtensionRisk(stock),
    categoryRiskNote: buildCategoryRiskNote(stock),
  };
}

function getDominantReason(stock = {}) {
  const label = getTradeReadiness(stock);
  const score = compositeScore(stock);
  const trigger = calcTriggerScore(stock);
  const momentum = calcMomentumScore(stock);
  const technical = calcTechnicalScore(stock);
  const relativeStrength = calcRelativeStrengthScore(stock);
  const risk = getExpectationRisk(stock);
  const extension = getExtensionRisk(stock);
  const vs50 = getVs50(stock);
  const vs200 = getVs200(stock);
  const breakoutPrice = getNearTermBreakoutPrice(stock);
  const support = getSupportPrice(stock);

  if (label === "Buy") {
    if (relativeStrength >= 78 && momentum >= 72) return "Leadership, trend, momentum, and trigger are aligned.";
    return "Trend and trigger are confirmed with acceptable risk.";
  }

  if (label === "Starter") {
    if (hasBreakoutStructure(stock)) return "Breakout structure is constructive, but size should still start small.";
    if (relativeStrength >= 70 && trigger < 60) return "Relative strength is improving, but trigger confirmation is not full-size yet.";
    return "Setup is improving enough for starter sizing, but not yet a full-size buy.";
  }

  if (risk >= 86 || extension >= 86) return "Risk or extension is too elevated; do not chase.";
  if (vs50 !== null && vs50 < -4) return `Below the 50-day; needs reclaim near ${formatPrice(getFiftyDay(stock))}.`;
  if (vs200 !== null && vs200 < -10) return `Below the 200-day; trend repair is still needed near ${formatPrice(getTwoHundredDay(stock))}.`;
  if (trigger < 52 && score >= 50) return `Setup is watchable, but trigger confirmation is not strong enough. Watch a move through ${formatPrice(breakoutPrice)}.`;
  if (technical < 45 || momentum < 45) return `Price action is not confirming yet. Watch support near ${formatPrice(support)}.`;
  return "Setup is not strong enough for new capital yet.";
}

function buildActionSummary(label, dominantReason) {
  if (label === "Buy") return "Buy. Normal sizing is allowed with a defined invalidation level.";
  if (label === "Starter") return "Starter. Use reduced size and add only if strength holds.";
  if (label === "Watch") return `Watch. ${dominantReason}`;
  return `Avoid. ${dominantReason}`;
}

function buildReason(label, dominantReason, stock = {}) {
  const note = buildCategoryRiskNote(stock);
  const suffix = note ? ` ${note}` : "";
  if (label === "Buy") return `${dominantReason}${suffix}`;
  if (label === "Starter") return `${dominantReason}${suffix}`;
  return dominantReason;
}

function buildEntryNote(label, dominantReason, stock = {}) {
  const breakout = getNearTermBreakoutPrice(stock);
  const support = getSupportPrice(stock);
  if (label === "Buy") return `Buyable now. Keep invalidation near ${formatPrice(support)}.`;
  if (label === "Starter") return `Starter only now. Add only after strength holds or clears ${formatPrice(breakout)}.`;
  if (label === "Watch") return `Act only if it clears ${formatPrice(breakout)} with strength.`;
  return "Avoid until the trend and trigger materially improve.";
}

function getMarketContextLabel(stock = {}) {
  if (getTradeReadiness(stock) === "Buy") return "High Conviction";
  if (hasBreakoutStructure(stock)) return "Breakout Intact";
  if (getStage(stock) === "Pullback" && calcMomentumScore(stock) >= 55) return "Pullback in Uptrend";
  if (getExtensionRisk(stock) >= 72) return "Digesting Gains";
  if (calcMomentumScore(stock) >= 55) return "Consolidating";
  return getStage(stock);
}

function buildTechnicalSnapshot(stock = {}) {
  return {
    price: getPrice(stock),
    fiftyDay: getFiftyDay(stock),
    twoHundredDay: getTwoHundredDay(stock),
    yearHigh: getYearHigh(stock),
    yearLow: getYearLow(stock),
    vs50: getVs50(stock),
    vs200: getVs200(stock),
    rangePosition: getRangePosition(stock),
    relativeVolume: getRelativeVolume(stock),
    technicalScore: calcTechnicalScore(stock),
    momentumScore: calcMomentumScore(stock),
    relativeStrengthScore: calcRelativeStrengthScore(stock),
    triggerScore: calcTriggerScore(stock),
    riskScore: calcRiskScore(stock),
    expectationRisk: getExpectationRisk(stock),
    extensionRisk: getExtensionRisk(stock),
    freshBreakoutScore: getFreshBreakoutScore(stock),
    momentumLabel: getMomentumLabel(stock),
    stage: getStage(stock),
  };
}

function buildFundamentalSnapshot(stock = {}) {
  return {
    marketCap: getMarketCap(stock),
    pe: getPe(stock),
    pb: getPb(stock),
    debtToEquity: getDebtToEquity(stock),
    operatingMargin: getOperatingMargin(stock),
    grossMargin: getGrossMargin(stock),
    revenueGrowth: getRevenueGrowth(stock),
    earningsGrowth: getEarningsGrowth(stock),
    fundamentalScore: calcFundamentalScore(stock),
    qualityScore: calcQualityScore(stock),
    asymmetryScore: calcAsymmetryScore(stock),
  };
}

function getRecommendation(stock = {}) {
  const label = getTradeReadiness(stock);
  const score = compositeScore(stock);
  const dominantReason = getDominantReason(stock);
  return {
    label,
    displayLabel: label,
    recommendation: label,
    tradeAction: label,
    action: label,
    score,
    heatScore: score,
    stage: getStage(stock),
    momentum: getMomentumLabel(stock),
    dominantReason,
    actionSummary: buildActionSummary(label, dominantReason),
    reason: buildReason(label, dominantReason, stock),
    entryNote: buildEntryNote(label, dominantReason, stock),
    gateSummary: buildGateSummary(stock),
    technicalScore: calcTechnicalScore(stock),
    fundamentalScore: calcFundamentalScore(stock),
    momentumScore: calcMomentumScore(stock),
    relativeStrengthScore: calcRelativeStrengthScore(stock),
    qualityScore: calcQualityScore(stock),
    asymmetryScore: calcAsymmetryScore(stock),
    triggerScore: calcTriggerScore(stock),
    riskScore: calcRiskScore(stock),
    expectationRisk: getExpectationRisk(stock),
    extensionRisk: getExtensionRisk(stock),
    freshBreakoutScore: getFreshBreakoutScore(stock),
    context: getMarketContextLabel(stock),
    breakoutStructure: hasBreakoutStructure(stock),
    categoryRiskNote: buildCategoryRiskNote(stock),
    blockedBuyNow: false,
    blockedReason: "",
  };
}

function analyzeStock(stock = {}) {
  const symbol = getSymbol(stock);
  const recommendation = getRecommendation(stock);
  return {
    ...stock,
    symbol,
    ticker: symbol,
    name: getName(stock),
    price: getPrice(stock),
    currentPrice: getPrice(stock),
    dayChangePct: getChangePct(stock),
    changesPercentage: getChangePct(stock),
    institutionalPass: passesInstitutionalFilter(stock),
    score: recommendation.score,
    compositeScore: recommendation.score,
    heatScore: recommendation.score,
    action: recommendation.label,
    label: recommendation.label,
    displayLabel: recommendation.label,
    tradeAction: recommendation.label,
    recommendation,
    stage: getStage(stock),
    context: recommendation.context,
    fundamentalScore: recommendation.fundamentalScore,
    technicalScore: recommendation.technicalScore,
    momentumScore: recommendation.momentumScore,
    relativeStrengthScore: recommendation.relativeStrengthScore,
    qualityScore: recommendation.qualityScore,
    asymmetryScore: recommendation.asymmetryScore,
    triggerScore: recommendation.triggerScore,
    riskScore: recommendation.riskScore,
    expectationRisk: recommendation.expectationRisk,
    extensionRisk: recommendation.extensionRisk,
    freshBreakoutScore: recommendation.freshBreakoutScore,
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
  calcQualityScore,
  calcAsymmetryScore,
  calcTriggerScore,
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
};
