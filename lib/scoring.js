// lib/scoring.js

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function exists(value) {
  return value !== null && value !== undefined && value !== "";
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function pct(value) {
  const n = num(value, null);
  if (n === null) return null;

  if (Math.abs(n) <= 1) return n * 100;
  return n;
}

function pick(stock, keys, fallback = null) {
  for (const key of keys) {
    if (exists(stock?.[key])) return stock[key];
  }
  return fallback;
}

function getSymbol(stock) {
  return String(stock?.symbol || stock?.ticker || "").toUpperCase();
}

function getPrice(stock) {
  return num(
    pick(stock, ["price", "currentPrice", "lastPrice", "close", "previousClose"]),
    0
  );
}

function getChangePct(stock) {
  return pct(
    pick(stock, [
      "changesPercentage",
      "changePercentage",
      "percentChange",
      "changePercent",
      "dayChangePercent",
    ])
  );
}

function getMarketCap(stock) {
  return num(pick(stock, ["marketCap", "mktCap", "marketCapitalization"]), 0);
}

function getVolume(stock) {
  return num(pick(stock, ["volume", "vol"]), 0);
}

function getAvgVolume(stock) {
  return num(
    pick(stock, [
      "avgVolume",
      "averageVolume",
      "avgVolume10Day",
      "avgVolume30Day",
      "averageVolume10Day",
      "averageVolume30Day",
    ]),
    0
  );
}

function getFiftyDay(stock) {
  return num(
    pick(stock, [
      "fiftyDayAverage",
      "priceAvg50",
      "sma50",
      "ma50",
      "movingAverage50",
    ]),
    0
  );
}

function getTwoHundredDay(stock) {
  return num(
    pick(stock, [
      "twoHundredDayAverage",
      "priceAvg200",
      "sma200",
      "ma200",
      "movingAverage200",
    ]),
    0
  );
}

function getYearHigh(stock) {
  return num(pick(stock, ["yearHigh", "high52", "fiftyTwoWeekHigh"]), 0);
}

function getYearLow(stock) {
  return num(pick(stock, ["yearLow", "low52", "fiftyTwoWeekLow"]), 0);
}

function getPe(stock) {
  return num(pick(stock, ["pe", "peRatio", "priceEarningsRatio"]), 0);
}

function getPb(stock) {
  return num(pick(stock, ["pb", "priceToBook", "priceBookValueRatio"]), 0);
}

function getDebtToEquity(stock) {
  return num(
    pick(stock, ["debtToEquity", "debtEquityRatio", "deRatio"]),
    0
  );
}

function getOperatingMargin(stock) {
  return pct(
    pick(stock, [
      "operatingMargin",
      "operatingMarginTTM",
      "opMargin",
      "operatingProfitMargin",
    ])
  );
}

function getGrossMargin(stock) {
  return pct(
    pick(stock, ["grossMargin", "grossMarginTTM", "grossProfitMargin"])
  );
}

function getRevenueGrowth(stock) {
  return pct(
    pick(stock, [
      "revenueGrowth",
      "revenueGrowthTTM",
      "revenueGrowthQoQ",
      "salesGrowth",
    ])
  );
}

function getEarningsGrowth(stock) {
  return pct(
    pick(stock, [
      "earningsGrowth",
      "epsGrowth",
      "epsGrowthTTM",
      "netIncomeGrowth",
    ])
  );
}

function getBeta(stock) {
  return num(pick(stock, ["beta"]), 1);
}

function getNameIndustrySector(stock) {
  const symbol = getSymbol(stock);
  const name = normalizeText(stock?.name || stock?.companyName || "");
  const industry = normalizeText(stock?.industry || "");
  const sector = normalizeText(stock?.sector || "");
  const description = normalizeText(stock?.description || "");

  return {
    symbol,
    name,
    industry,
    sector,
    description,
    text: `${symbol} ${name} ${industry} ${sector} ${description}`.toLowerCase(),
  };
}

function isReit(stock) {
  const { text } = getNameIndustrySector(stock);

  return (
    text.includes("reit") ||
    text.includes("real estate investment trust") ||
    text.includes("mortgage trust") ||
    text.includes("property trust")
  );
}

function isPipelineOrIncomeName(stock) {
  const { text } = getNameIndustrySector(stock);

  return (
    text.includes("pipeline") ||
    text.includes("midstream") ||
    text.includes("mlp") ||
    text.includes("limited partnership") ||
    text.includes("income fund") ||
    text.includes("royalty trust") ||
    text.includes("yieldco") ||
    text.includes("yield corp") ||
    text.includes("bdc") ||
    text.includes("business development company")
  );
}

function isAirline(stock) {
  const { text } = getNameIndustrySector(stock);

  return (
    text.includes("airline") ||
    text.includes("airlines") ||
    text.includes("airways") ||
    text.includes("air transport")
  );
}

function isBinaryBiotech(stock) {
  const { text } = getNameIndustrySector(stock);
  const marketCap = getMarketCap(stock);
  const price = getPrice(stock);

  const biotechLike =
    text.includes("biotechnology") ||
    text.includes("biotech") ||
    text.includes("clinical") ||
    text.includes("phase 1") ||
    text.includes("phase 2") ||
    text.includes("phase 3") ||
    text.includes("therapeutics") ||
    text.includes("pharmaceutical") ||
    text.includes("pharmaceuticals") ||
    text.includes("drug development");

  if (!biotechLike) return false;

  return marketCap < 2000000000 || price < 10;
}

function isBlockedBuyNowArchetype(stock) {
  return (
    isReit(stock) ||
    isPipelineOrIncomeName(stock) ||
    isAirline(stock) ||
    isBinaryBiotech(stock)
  );
}

function getBlockedReason(stock) {
  if (isReit(stock)) return "REIT structure; not eligible for Buy Now.";
  if (isPipelineOrIncomeName(stock)) {
    return "Income or pipeline-style name; not eligible for Buy Now.";
  }
  if (isAirline(stock)) return "Airline cyclicality; not eligible for Buy Now.";
  if (isBinaryBiotech(stock)) {
    return "Binary biotech profile; not eligible for Buy Now.";
  }
  return "";
}

function scoreRange(value, low, high) {
  if (!Number.isFinite(value)) return 50;
  if (value <= low) return 0;
  if (value >= high) return 100;
  return ((value - low) / (high - low)) * 100;
}

function calcFundamentalScore(stock = {}) {
  const marketCap = getMarketCap(stock);
  const pe = getPe(stock);
  const pb = getPb(stock);
  const debtToEquity = getDebtToEquity(stock);
  const operatingMargin = getOperatingMargin(stock);
  const grossMargin = getGrossMargin(stock);
  const revenueGrowth = getRevenueGrowth(stock);
  const earningsGrowth = getEarningsGrowth(stock);

  let score = 50;

  if (marketCap >= 10000000000) score += 8;
  else if (marketCap >= 2000000000) score += 5;
  else if (marketCap >= 300000000) score += 1;
  else score -= 10;

  if (pe > 0 && pe <= 15) score += 8;
  else if (pe > 15 && pe <= 30) score += 3;
  else if (pe > 45) score -= 6;

  if (pb > 0 && pb <= 1.5) score += 8;
  else if (pb > 1.5 && pb <= 3) score += 3;
  else if (pb > 7) score -= 5;

  if (debtToEquity > 0 && debtToEquity <= 0.8) score += 6;
  else if (debtToEquity > 2.5) score -= 8;

  if (operatingMargin !== null) {
    if (operatingMargin >= 20) score += 8;
    else if (operatingMargin >= 10) score += 4;
    else if (operatingMargin < 0) score -= 8;
  }

  if (grossMargin !== null) {
    if (grossMargin >= 50) score += 5;
    else if (grossMargin >= 30) score += 2;
    else if (grossMargin < 15) score -= 4;
  }

  if (revenueGrowth !== null) {
    if (revenueGrowth >= 25) score += 8;
    else if (revenueGrowth >= 10) score += 5;
    else if (revenueGrowth < -5) score -= 6;
  }

  if (earningsGrowth !== null) {
    if (earningsGrowth >= 25) score += 8;
    else if (earningsGrowth >= 10) score += 5;
    else if (earningsGrowth < -10) score -= 6;
  }

  if (isBlockedBuyNowArchetype(stock)) score -= 10;

  return Math.round(clamp(score));
}

function calcTechnicalScore(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);
  const changePct = getChangePct(stock);

  let score = 50;

  if (price > 0 && fiftyDay > 0) {
    const vs50 = ((price - fiftyDay) / fiftyDay) * 100;

    if (vs50 >= 3 && vs50 <= 18) score += 18;
    else if (vs50 > 0 && vs50 < 3) score += 8;
    else if (vs50 > 18) score -= 6;
    else if (vs50 < 0 && vs50 >= -4) score -= 4;
    else if (vs50 < -4) score -= 14;
  }

  if (price > 0 && twoHundredDay > 0) {
    const vs200 = ((price - twoHundredDay) / twoHundredDay) * 100;

    if (vs200 >= 5) score += 14;
    else if (vs200 >= 0) score += 7;
    else if (vs200 < -10) score -= 14;
    else score -= 6;
  }

  if (fiftyDay > 0 && twoHundredDay > 0) {
    if (fiftyDay > twoHundredDay) score += 10;
    else score -= 8;
  }

  if (price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    const position = ((price - yearLow) / (yearHigh - yearLow)) * 100;

    if (position >= 55 && position <= 88) score += 12;
    else if (position > 88 && position <= 96) score += 3;
    else if (position > 96) score -= 7;
    else if (position < 35) score -= 8;
  }

  if (changePct !== null) {
    if (changePct >= 1 && changePct <= 5) score += 8;
    else if (changePct > 5 && changePct <= 9) score += 2;
    else if (changePct > 9) score -= 8;
    else if (changePct < -4) score -= 8;
  }

  return Math.round(clamp(score));
}

function calcMomentumScore(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);
  const changePct = getChangePct(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);

  let score = 50;

  if (price > 0 && fiftyDay > 0) {
    const vs50 = ((price - fiftyDay) / fiftyDay) * 100;
    score += scoreRange(vs50, -8, 15) * 0.28 - 14;
  }

  if (price > 0 && twoHundredDay > 0) {
    const vs200 = ((price - twoHundredDay) / twoHundredDay) * 100;
    score += scoreRange(vs200, -15, 30) * 0.22 - 11;
  }

  if (price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    const rangePosition = ((price - yearLow) / (yearHigh - yearLow)) * 100;
    score += scoreRange(rangePosition, 25, 85) * 0.22 - 11;
  }

  if (changePct !== null) {
    if (changePct > 0 && changePct <= 6) score += 12;
    else if (changePct > 6) score += 2;
    else if (changePct < -3) score -= 10;
  }

  return Math.round(clamp(score));
}

function calcQualityScore(stock = {}) {
  const fundamental = calcFundamentalScore(stock);
  const marketCap = getMarketCap(stock);
  const debtToEquity = getDebtToEquity(stock);
  const operatingMargin = getOperatingMargin(stock);

  let score = fundamental;

  if (marketCap >= 2000000000) score += 4;
  if (debtToEquity > 2.5) score -= 8;
  if (operatingMargin !== null && operatingMargin < 0) score -= 8;

  if (isBlockedBuyNowArchetype(stock)) score -= 8;

  return Math.round(clamp(score));
}

function calcAsymmetryScore(stock = {}) {
  const price = getPrice(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);
  const pb = getPb(stock);
  const pe = getPe(stock);
  const marketCap = getMarketCap(stock);

  let score = 50;

  if (price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    const upsideToHigh = ((yearHigh - price) / price) * 100;
    const downsideToLow = ((price - yearLow) / price) * 100;

    if (upsideToHigh >= 30) score += 14;
    else if (upsideToHigh >= 15) score += 8;
    else if (upsideToHigh < 5) score -= 10;

    if (downsideToLow <= 20) score += 8;
    else if (downsideToLow > 45) score -= 8;
  }

  if (pb > 0 && pb <= 2) score += 8;
  else if (pb > 6) score -= 6;

  if (pe > 0 && pe <= 25) score += 5;
  else if (pe > 50) score -= 5;

  if (marketCap > 0 && marketCap < 300000000) score -= 10;

  if (isBlockedBuyNowArchetype(stock)) score -= 8;

  return Math.round(clamp(score));
}

function calcTriggerScore(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);
  const changePct = getChangePct(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  let score = 50;

  if (price > 0 && fiftyDay > 0) {
    const vs50 = ((price - fiftyDay) / fiftyDay) * 100;

    if (vs50 >= 1 && vs50 <= 12) score += 18;
    else if (vs50 > 12 && vs50 <= 20) score += 6;
    else if (vs50 > 20) score -= 8;
    else if (vs50 > -3 && vs50 < 1) score += 3;
    else score -= 12;
  }

  if (price > 0 && twoHundredDay > 0) {
    const vs200 = ((price - twoHundredDay) / twoHundredDay) * 100;

    if (vs200 >= 0) score += 10;
    else score -= 8;
  }

  if (price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    const rangePosition = ((price - yearLow) / (yearHigh - yearLow)) * 100;

    if (rangePosition >= 55 && rangePosition <= 90) score += 10;
    else if (rangePosition > 90 && rangePosition <= 97) score += 2;
    else if (rangePosition > 97) score -= 8;
    else if (rangePosition < 35) score -= 8;
  }

  if (changePct !== null) {
    if (changePct >= 0.5 && changePct <= 5) score += 12;
    else if (changePct > 5 && changePct <= 8) score += 3;
    else if (changePct > 8) score -= 8;
    else if (changePct < -3) score -= 8;
  }

  if (volume > 0 && avgVolume > 0) {
    const relativeVolume = volume / avgVolume;

    if (relativeVolume >= 1.1 && relativeVolume <= 2.5) score += 10;
    else if (relativeVolume >= 0.75 && relativeVolume < 1.1) score += 3;
    else if (relativeVolume > 2.5) score -= 4;
    else if (relativeVolume < 0.4) score -= 8;
  } else if (volume > 0 && avgVolume <= 0) {
    score += 2;
  }

  return Math.round(clamp(score));
}

function calcRiskScore(stock = {}) {
  const price = getPrice(stock);
  const marketCap = getMarketCap(stock);
  const beta = getBeta(stock);
  const changePct = getChangePct(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);
  const fiftyDay = getFiftyDay(stock);

  let risk = 35;

  if (price > 0 && price < 3) risk += 25;
  else if (price >= 3 && price < 5) risk += 14;
  else if (price >= 5 && price < 10) risk += 6;

  if (marketCap > 0 && marketCap < 300000000) risk += 20;
  else if (marketCap >= 300000000 && marketCap < 1000000000) risk += 8;

  if (beta >= 2.2) risk += 14;
  else if (beta >= 1.6) risk += 8;
  else if (beta <= 0.8 && beta > 0) risk -= 4;

  if (changePct !== null) {
    if (Math.abs(changePct) >= 10) risk += 16;
    else if (Math.abs(changePct) >= 6) risk += 8;
  }

  if (price > 0 && fiftyDay > 0) {
    const extended = ((price - fiftyDay) / fiftyDay) * 100;

    if (extended > 25) risk += 18;
    else if (extended > 15) risk += 8;
  }

  if (price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    const rangePosition = ((price - yearLow) / (yearHigh - yearLow)) * 100;

    if (rangePosition > 97) risk += 12;
    else if (rangePosition < 20) risk += 8;
  }

  if (isBlockedBuyNowArchetype(stock)) risk += 8;

  return Math.round(clamp(risk));
}

function compositeScore(stock = {}) {
  const fundamental = calcFundamentalScore(stock);
  const technical = calcTechnicalScore(stock);
  const momentum = calcMomentumScore(stock);
  const asymmetry = calcAsymmetryScore(stock);
  const trigger = calcTriggerScore(stock);
  const quality = calcQualityScore(stock);
  const risk = calcRiskScore(stock);

  const raw =
    fundamental * 0.2 +
    technical * 0.23 +
    momentum * 0.18 +
    asymmetry * 0.13 +
    trigger * 0.18 +
    quality * 0.08 -
    Math.max(0, risk - 45) * 0.18;

  return Math.round(clamp(raw));
}

function calcHeatScore(stock = {}) {
  return compositeScore(stock);
}

function getStage(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);

  if (price <= 0) return "Unknown";

  const above50 = fiftyDay > 0 && price > fiftyDay;
  const above200 = twoHundredDay > 0 && price > twoHundredDay;
  const fiftyAbove200 = fiftyDay > 0 && twoHundredDay > 0 && fiftyDay > twoHundredDay;

  let rangePosition = null;
  if (yearHigh > 0 && yearLow > 0 && yearHigh > yearLow) {
    rangePosition = ((price - yearLow) / (yearHigh - yearLow)) * 100;
  }

  if (above50 && above200 && fiftyAbove200) {
    if (rangePosition !== null && rangePosition > 92) return "Extended Uptrend";
    return "Uptrend";
  }

  if (above50 && !above200) return "Early Reversal";
  if (!above50 && above200) return "Pullback";
  if (!above50 && !above200) return "Downtrend";

  return "Developing";
}

function buildFundamentalSnapshot(stock = {}) {
  return {
    marketCap: getMarketCap(stock),
    pe: getPe(stock),
    priceToBook: getPb(stock),
    debtToEquity: getDebtToEquity(stock),
    operatingMargin: getOperatingMargin(stock),
    grossMargin: getGrossMargin(stock),
    revenueGrowth: getRevenueGrowth(stock),
    earningsGrowth: getEarningsGrowth(stock),
    qualityScore: calcQualityScore(stock),
    fundamentalScore: calcFundamentalScore(stock),
  };
}

function buildTechnicalSnapshot(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);
  const yearHigh = getYearHigh(stock);
  const yearLow = getYearLow(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  const vs50 =
    price > 0 && fiftyDay > 0 ? ((price - fiftyDay) / fiftyDay) * 100 : null;

  const vs200 =
    price > 0 && twoHundredDay > 0
      ? ((price - twoHundredDay) / twoHundredDay) * 100
      : null;

  const rangePosition =
    price > 0 && yearHigh > 0 && yearLow > 0 && yearHigh > yearLow
      ? ((price - yearLow) / (yearHigh - yearLow)) * 100
      : null;

  const relativeVolume =
    volume > 0 && avgVolume > 0 ? volume / avgVolume : null;

  return {
    price,
    changePct: getChangePct(stock),
    fiftyDayAverage: fiftyDay,
    twoHundredDayAverage: twoHundredDay,
    yearHigh,
    yearLow,
    vs50,
    vs200,
    rangePosition,
    volume,
    avgVolume,
    relativeVolume,
    technicalScore: calcTechnicalScore(stock),
    momentumScore: calcMomentumScore(stock),
    triggerScore: calcTriggerScore(stock),
    riskScore: calcRiskScore(stock),
    stage: getStage(stock),
  };
}

function evaluateTradabilityGate(stock = {}) {
  const price = getPrice(stock);
  const marketCap = getMarketCap(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  const notes = [];

  if (price < 3) {
    return {
      status: "FAIL",
      note: "Price is too low for a clean institutional-style trade.",
    };
  }

  if (price < 5) {
    notes.push("Low-priced stock. Position size and risk need to be tighter.");
  }

  if (marketCap > 0 && marketCap < 300000000) {
    return {
      status: "FAIL",
      note: "Market cap is too small for a clean Buy Now setup.",
    };
  }

  if (marketCap >= 300000000 && marketCap < 750000000) {
    notes.push("Smaller market cap. Risk is higher than ideal.");
  }

  if (volume > 0 && avgVolume > 0) {
    const relativeVolume = volume / avgVolume;

    if (volume < 150000) {
      return {
        status: "FAIL",
        note: "Actual trading volume is too thin.",
      };
    }

    if (volume < 350000 || relativeVolume < 0.45) {
      return {
        status: "WATCH",
        note: "Liquidity is light today. Setup may be real, but execution risk is higher.",
      };
    }

    return {
      status: "PASS",
      note: notes.length ? notes.join(" ") : "Tradability is acceptable.",
    };
  }

  if (volume > 0 && avgVolume <= 0) {
    if (volume < 150000) {
      return {
        status: "WATCH",
        note: "Average volume is missing and actual volume is thin.",
      };
    }

    return {
      status: "PASS",
      note: "Average volume is missing, but price, market cap, and actual volume are acceptable.",
      caution: "Volume data incomplete.",
    };
  }

  if (avgVolume > 0 && volume <= 0) {
    if (avgVolume < 250000) {
      return {
        status: "WATCH",
        note: "Current volume is missing and average liquidity is light.",
      };
    }

    return {
      status: "PASS",
      note: "Current volume is missing, but average liquidity appears acceptable.",
      caution: "Current volume data incomplete.",
    };
  }

  return {
    status: "PASS",
    note: "Volume data is incomplete, but price and market cap are acceptable.",
    caution: "Volume data incomplete.",
  };
}

function evaluateTrendGate(stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const twoHundredDay = getTwoHundredDay(stock);

  if (price <= 0) {
    return {
      status: "FAIL",
      note: "Price data is missing.",
    };
  }

  if (fiftyDay > 0 && price < fiftyDay) {
    return {
      status: "WATCH",
      note: "Trend is still below the 50-day average.",
    };
  }

  if (twoHundredDay > 0 && price < twoHundredDay) {
    return {
      status: "WATCH",
      note: "Longer-term trend is not fully confirmed yet.",
    };
  }

  if (fiftyDay > 0 && twoHundredDay > 0 && fiftyDay < twoHundredDay) {
    return {
      status: "WATCH",
      note: "Trend is improving, but the 50-day average is still below the 200-day average.",
    };
  }

  return {
    status: "PASS",
    note: "Trend is acceptable.",
  };
}

function evaluateTriggerGate(stock = {}) {
  const triggerScore = calcTriggerScore(stock);
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const changePct = getChangePct(stock);

  if (triggerScore >= 72) {
    return {
      status: "PASS",
      note: "Upside trigger is active.",
    };
  }

  if (price > 0 && fiftyDay > 0) {
    const vs50 = ((price - fiftyDay) / fiftyDay) * 100;

    if (vs50 < 0) {
      return {
        status: "WATCH",
        note: "Holding near support, but no upside trigger yet.",
      };
    }

    if (vs50 >= 0 && vs50 < 2) {
      return {
        status: "WATCH",
        note: "Needs breakout confirmation.",
      };
    }
  }

  if (changePct !== null && changePct < 0) {
    return {
      status: "WATCH",
      note: "Momentum is not confirming yet.",
    };
  }

  return {
    status: "WATCH",
    note: "Setup is improving, but the trigger is not strong enough yet.",
  };
}

function evaluateConfirmationGate(stock = {}) {
  const technical = calcTechnicalScore(stock);
  const momentum = calcMomentumScore(stock);
  const changePct = getChangePct(stock);
  const volume = getVolume(stock);
  const avgVolume = getAvgVolume(stock);

  let confirmationScore = technical * 0.45 + momentum * 0.45;

  if (changePct !== null && changePct > 0) confirmationScore += 5;

  if (volume > 0 && avgVolume > 0) {
    const relativeVolume = volume / avgVolume;
    if (relativeVolume >= 0.75) confirmationScore += 5;
    if (relativeVolume < 0.45) confirmationScore -= 8;
  } else {
    confirmationScore -= 1;
  }

  if (confirmationScore >= 70) {
    return {
      status: "PASS",
      note: "Price action is confirming.",
    };
  }

  if (confirmationScore >= 58) {
    return {
      status: "WATCH",
      note: "Confirmation is close, but not strong enough yet.",
    };
  }

  return {
    status: "FAIL",
    note: "Price action is not confirming the trade.",
  };
}

function evaluateRiskGate(stock = {}) {
  const risk = calcRiskScore(stock);
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);

  if (risk >= 72) {
    return {
      status: "FAIL",
      note: "Risk is elevated.",
      riskScore: risk,
    };
  }

  if (price > 0 && fiftyDay > 0) {
    const extended = ((price - fiftyDay) / fiftyDay) * 100;

    if (extended > 20) {
      return {
        status: "WATCH",
        note: "Extended; do not chase.",
        riskScore: risk,
      };
    }
  }

  if (risk >= 58) {
    return {
      status: "WATCH",
      note: "Risk is higher than ideal.",
      riskScore: risk,
    };
  }

  return {
    status: "PASS",
    note: "Risk is acceptable.",
    riskScore: risk,
  };
}

function buildGateSummary(stock = {}) {
  return {
    tradability: evaluateTradabilityGate(stock),
    trend: evaluateTrendGate(stock),
    trigger: evaluateTriggerGate(stock),
    confirmation: evaluateConfirmationGate(stock),
    risk: evaluateRiskGate(stock),
  };
}

function countGateStatuses(gateSummary) {
  const gates = Object.values(gateSummary || {});
  return {
    pass: gates.filter((g) => g?.status === "PASS").length,
    watch: gates.filter((g) => g?.status === "WATCH").length,
    fail: gates.filter((g) => g?.status === "FAIL").length,
  };
}

function getDominantReason(stock = {}, gateSummary = buildGateSummary(stock)) {
  const blockedReason = getBlockedReason(stock);
  if (blockedReason) return blockedReason;

  if (gateSummary.risk?.status === "FAIL") return "Risk elevated.";
  if (gateSummary.risk?.note === "Extended; do not chase.") {
    return "Extended; do not chase.";
  }

  if (gateSummary.trend?.note?.includes("below the 50-day")) {
    return "Trend below 50dma.";
  }

  if (gateSummary.confirmation?.status === "FAIL") {
    return "Price action is not confirming the trade.";
  }

  if (gateSummary.trigger?.note?.includes("Needs breakout")) {
    return "Needs breakout confirmation.";
  }

  if (gateSummary.tradability?.caution) {
    return "Volume data incomplete but setup improving.";
  }

  if (gateSummary.trigger?.note?.includes("Holding near support")) {
    return "Holding support but no upside trigger.";
  }

  if (gateSummary.tradability?.status === "FAIL") {
    return gateSummary.tradability.note || "Tradability problem.";
  }

  if (gateSummary.tradability?.status === "WATCH") {
    return gateSummary.tradability.note || "Liquidity needs confirmation.";
  }

  if (gateSummary.trend?.status === "WATCH") {
    return gateSummary.trend.note || "Trend needs confirmation.";
  }

  if (gateSummary.trigger?.status === "WATCH") {
    return gateSummary.trigger.note || "Needs upside trigger.";
  }

  if (gateSummary.confirmation?.status === "WATCH") {
    return gateSummary.confirmation.note || "Needs stronger confirmation.";
  }

  return "Setup is improving.";
}

function getMomentumLabel(stock = {}) {
  const score = calcMomentumScore(stock);

  if (score >= 72) return "Strong";
  if (score >= 55) return "Building";
  return "Weak";
}

function getTradeReadiness(stock = {}) {
  const score = compositeScore(stock);
  const gateSummary = buildGateSummary(stock);
  const counts = countGateStatuses(gateSummary);
  const blocked = isBlockedBuyNowArchetype(stock);
  const risk = calcRiskScore(stock);

  const allCorePass =
    gateSummary.tradability.status === "PASS" &&
    gateSummary.trend.status === "PASS" &&
    gateSummary.trigger.status === "PASS" &&
    gateSummary.confirmation.status === "PASS" &&
    gateSummary.risk.status === "PASS";

  if (!blocked && score >= 88 && allCorePass && risk <= 55) {
    return "Buy Now";
  }

  if (!blocked && score >= 78 && counts.fail === 0) {
    return "Near Miss";
  }

  if (score >= 65 && counts.fail <= 1) {
    return "Watch for Entry";
  }

  return "Avoid for Now";
}

function buildActionSummary(label, dominantReason, score) {
  if (label === "Buy Now") {
    return "Actionable now. Setup, trend, confirmation, tradability, and risk are aligned.";
  }

  if (label === "Near Miss") {
    return `Close, but not actionable yet. ${dominantReason}`;
  }

  if (label === "Watch for Entry") {
    return `Watchlist only. ${dominantReason}`;
  }

  if (score >= 60) {
    return `Not ready. ${dominantReason}`;
  }

  return "Avoid for now. The setup is not strong enough.";
}

function buildReason(label, dominantReason, stock = {}) {
  const score = compositeScore(stock);
  const stage = getStage(stock);
  const momentum = getMomentumLabel(stock);

  if (label === "Buy Now") {
    return `Buy Now because the setup is confirmed, momentum is ${momentum.toLowerCase()}, and risk is acceptable.`;
  }

  if (label === "Near Miss") {
    return `Near Miss because the score is strong at ${score}, but ${dominantReason.toLowerCase()}`;
  }

  if (label === "Watch for Entry") {
    return `Watch for Entry because the stock is in a ${stage.toLowerCase()} stage, but ${dominantReason.toLowerCase()}`;
  }

  return `Avoid for Now because ${dominantReason.toLowerCase()}`;
}

function buildEntryNote(label, dominantReason, stock = {}) {
  const price = getPrice(stock);
  const fiftyDay = getFiftyDay(stock);
  const yearHigh = getYearHigh(stock);

  if (label === "Buy Now") {
    return "Entry is acceptable now, but use normal position sizing and avoid chasing a large intraday spike.";
  }

  if (dominantReason.includes("Volume data incomplete")) {
    return "Do not reject the setup only because average volume is missing. Confirm real-time liquidity before entering.";
  }

  if (dominantReason.includes("breakout")) {
    return "Wait for a clean move above near-term resistance with positive price action.";
  }

  if (dominantReason.includes("Extended")) {
    return "Do not chase here. Wait for a pullback, consolidation, or fresh base.";
  }

  if (dominantReason.includes("Trend below 50dma")) {
    return "Wait for price to reclaim the 50-day average and hold it.";
  }

  if (dominantReason.includes("Risk elevated")) {
    return "Skip or use a very small tactical position only after risk cools down.";
  }

  if (dominantReason.includes("Holding support")) {
    return "Let it prove buyers are stepping in before treating it as actionable.";
  }

  if (price > 0 && fiftyDay > 0 && price < fiftyDay) {
    return "Wait for price to regain the 50-day average before considering an entry.";
  }

  if (price > 0 && yearHigh > 0 && price > yearHigh * 0.96) {
    return "Price is close to its 52-week high. Avoid chasing unless it breaks out cleanly.";
  }

  return "Wait for stronger confirmation before entering.";
}

function getRecommendation(stock = {}) {
  const score = compositeScore(stock);
  const gateSummary = buildGateSummary(stock);
  const dominantReason = getDominantReason(stock, gateSummary);
  const label = getTradeReadiness(stock);
  const actionSummary = buildActionSummary(label, dominantReason, score);
  const reason = buildReason(label, dominantReason, stock);
  const entryNote = buildEntryNote(label, dominantReason, stock);

  return {
    label,
    recommendation: label,
    tradeAction: label,
    score,
    heatScore: score,
    stage: getStage(stock),
    momentum: getMomentumLabel(stock),
    dominantReason,
    actionSummary,
    reason,
    entryNote,
    gateSummary,
    blockedBuyNow: isBlockedBuyNowArchetype(stock),
    blockedReason: getBlockedReason(stock),
  };
}

function passesInstitutionalFilter(stock = {}) {
  const price = getPrice(stock);
  const marketCap = getMarketCap(stock);
  const risk = calcRiskScore(stock);

  if (price < 3) return false;
  if (marketCap > 0 && marketCap < 300000000) return false;
  if (risk >= 80) return false;

  return true;
}

export {
  passesInstitutionalFilter,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
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
};
