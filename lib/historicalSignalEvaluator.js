// Point-in-time compiler that replays the production fresh-capital decision stack
// against historical daily bars, filing-availability timelines and event timelines.

import {
  compositeScore,
  calcFundamentalScore,
  calcTechnicalScore,
  calcMomentumScore,
  calcRelativeStrengthScore,
  calcAsymmetryScore,
  calcTriggerScore,
  getRecommendation,
  buildTechnicalSnapshot,
  buildFundamentalSnapshot,
} from "./scoring";
import { applyExpertDecision } from "./expertDecision";
import { analyzeEntryTiming, applyEntryTimingGate, attachRelativeStrengthContext } from "./entryTiming";
import { applyEventRiskGate } from "./eventRisk";
import { applyPersonalCapitalPolicy } from "./personalCapitalPolicy";
import {
  finalizeBroadOpportunityDecisions,
  recentStrongBuySymbols,
} from "./opportunityDecision";
import { POINT_IN_TIME_SCHEMA } from "./walkForwardBacktest";

const number = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const isObservedNumber = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
const standardDeviation = (values) => {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
};
const pct = (latest, prior) =>
  latest > 0 && prior > 0 ? ((latest - prior) / prior) * 100 : null;
const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));
const asTime = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
const dateDiff = (from, to) =>
  Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() -
      new Date(`${from}T12:00:00Z`).getTime()) /
      86_400_000,
  );

function trailingReturn(closes, sessions, skip = 0) {
  const endIndex = closes.length - 1 - skip;
  const startIndex = endIndex - sessions;
  if (startIndex < 0 || endIndex < 0) return null;
  return pct(closes[endIndex], closes[startIndex]);
}

function annualizedVolatility(closes, sessions = 60) {
  if (closes.length < sessions + 1) return null;
  const window = closes.slice(-(sessions + 1));
  const returns = [];
  for (let index = 1; index < window.length; index++) {
    if (window[index - 1] > 0)
      returns.push(window[index] / window[index - 1] - 1);
  }
  const daily = standardDeviation(returns);
  return daily === null ? null : daily * Math.sqrt(252) * 100;
}

function percentileMap(rows, getter, descending = false) {
  const ranked = rows
    .map((row) => ({ row, value: number(getter(row)) }))
    .filter((entry) => entry.value !== null)
    .sort((a, b) => a.value - b.value);
  const output = new Map(rows.map((row) => [row, 50]));
  if (ranked.length < 2) return output;
  for (let start = 0; start < ranked.length; ) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].value === ranked[start].value)
      end++;
    const midpoint = (start + end - 1) / 2;
    const raw = (midpoint / (ranked.length - 1)) * 100;
    const score = descending ? 100 - raw : raw;
    for (let index = start; index < end; index++)
      output.set(ranked[index].row, score);
    start = end;
  }
  return output;
}

function weightedScore(parts = [], fallback = 50) {
  let total = 0;
  let weight = 0;
  for (const [value, partWeight] of parts) {
    if (!isObservedNumber(value) || !(partWeight > 0)) continue;
    total += Number(value) * partWeight;
    weight += partWeight;
  }
  return weight ? total / weight : fallback;
}

function controlledPullbackScore(return5) {
  if (!Number.isFinite(Number(return5))) return 50;
  const value = Number(return5);
  if (value >= -4 && value <= 1) return 100 - Math.abs(value + 1) * 10;
  if (value > 1) return clamp(80 - (value - 1) * 14);
  return clamp(70 - Math.abs(value + 4) * 12);
}

// Research-only, point-in-time cross-sectional ranks. These do not change the
// production label compiler; they let the replay test whether Buy-quality names
// with superior quality, medium-term momentum and sector-relative strength have
// better capital efficiency than absolute score thresholds alone.
export function attachCrossSectionalResearchFactors(rows = []) {
  const sectors = new Map();
  for (const row of rows) {
    const sector = String(row.sector || row.primaryTheme || "Other");
    if (!sectors.has(sector)) sectors.set(sector, []);
    sectors.get(sector).push(row);
  }
  const fields = [
    "operatingMargin",
    "freeCashFlowMargin",
    "returnOnEquity",
    "revenueGrowth",
    "operatingIncomeGrowth",
    "debtToEquity",
    "shareChangeYoY",
    "return120Ex20",
    "return60Ex5",
    "freeCashFlowYield",
    "pe",
    "volatility60Pct",
    "volatility20Pct",
  ];
  const lowIsGood = new Set([
    "debtToEquity",
    "shareChangeYoY",
    "pe",
    "volatility60Pct",
    "volatility20Pct",
  ]);
  const globalRanks = new Map(
    fields.map((field) => [
      field,
      percentileMap(rows, (candidate) => candidate[field], lowIsGood.has(field)),
    ]),
  );
  const sectorRanks = new Map(
    [...sectors].map(([sector, peers]) => [
      sector,
      new Map(
        fields.map((field) => [
          field,
          percentileMap(
            peers,
            (candidate) => candidate[field],
            lowIsGood.has(field),
          ),
        ]),
      ),
    ]),
  );
  const ranked = rows.map((row) => {
    const sector = String(row.sector || row.primaryTheme || "Other");
    const rank = (field, { sector: withinSector = false } = {}) => {
      if (!isObservedNumber(row[field])) return null;
      return (
        (withinSector ? sectorRanks.get(sector) : globalRanks)
          ?.get(field)
          ?.get(row) ?? 50
      );
    };
    const qualityPercentile = weightedScore([
      [rank("operatingMargin"), 0.2],
      [rank("freeCashFlowMargin"), 0.18],
      [rank("returnOnEquity"), 0.14],
      [rank("revenueGrowth"), 0.16],
      [rank("operatingIncomeGrowth"), 0.14],
      [rank("debtToEquity"), 0.1],
      [rank("shareChangeYoY"), 0.08],
    ], null);
    const sectorQualityPercentile = weightedScore([
      [rank("operatingMargin", { sector: true }), 0.24],
      [rank("freeCashFlowMargin", { sector: true }), 0.2],
      [rank("returnOnEquity", { sector: true }), 0.16],
      [rank("revenueGrowth", { sector: true }), 0.2],
      [rank("operatingIncomeGrowth", { sector: true }), 0.2],
    ], null);
    const momentumPercentile = weightedScore([
      [rank("return120Ex20"), 0.4],
      [rank("return60Ex5"), 0.25],
      [rank("return120Ex20", { sector: true }), 0.22],
      [rank("return60Ex5", { sector: true }), 0.13],
    ], null);
    const valuePercentile = weightedScore([
      [rank("freeCashFlowYield"), 0.65],
      [rank("pe"), 0.35],
    ], null);
    const stabilityPercentile = weightedScore([
      [rank("volatility60Pct"), 0.7],
      [rank("volatility20Pct"), 0.3],
    ], null);
    const factorCoverage = [
      row.operatingMargin,
      row.freeCashFlowMargin,
      row.returnOnEquity,
      row.revenueGrowth,
      row.operatingIncomeGrowth,
      row.return120Ex20,
      row.return60Ex5,
      row.volatility60Pct,
    ].filter(isObservedNumber).length;
    const compositeScore = weightedScore([
      [qualityPercentile, 0.34],
      [sectorQualityPercentile, 0.16],
      [momentumPercentile, 0.32],
      [valuePercentile, 0.08],
      [stabilityPercentile, 0.1],
    ]);
    return {
      ...row,
      researchFactors: {
        factorCoverage,
        qualityPercentile,
        sectorQualityPercentile,
        momentumPercentile,
        valuePercentile,
        stabilityPercentile,
        compositeScore,
        controlledPullbackScore: controlledPullbackScore(row.return5),
        volatility20Pct: row.volatility20Pct,
        volatility60Pct: row.volatility60Pct,
        return5: row.return5,
        return20: row.return20,
        return60Ex5: row.return60Ex5,
        return120Ex20: row.return120Ex20,
      },
    };
  });
  const compositeGlobalRanks = percentileMap(
    ranked,
    (candidate) => candidate.researchFactors.compositeScore,
  );
  const compositeSectorRanks = new Map();
  for (const sector of sectors.keys()) {
    const peers = ranked.filter(
      (candidate) =>
        String(candidate.sector || candidate.primaryTheme || "Other") === sector,
    );
    compositeSectorRanks.set(
      sector,
      percentileMap(peers, (candidate) => candidate.researchFactors.compositeScore),
    );
  }
  for (const row of ranked) {
    const sector = String(row.sector || row.primaryTheme || "Other");
    row.researchFactors.globalCompositePercentile =
      compositeGlobalRanks.get(row) ?? 50;
    row.researchFactors.sectorCompositePercentile =
      compositeSectorRanks.get(sector)?.get(row) ?? 50;
  }
  return ranked;
}

function latestAvailable(rows = [], decisionAt) {
  const decisionTime = asTime(decisionAt);
  return [...rows]
    .filter((row) => {
      const availableAt = asTime(row.availableAt || row.acceptedDate);
      return availableAt !== null && availableAt <= decisionTime;
    })
    .sort(
      (a, b) =>
        asTime(b.availableAt || b.acceptedDate) -
        asTime(a.availableAt || a.acceptedDate),
    )[0];
}

function buildHistoricalQuote({ profile, bar, history, fundamental, decisionAt }) {
  const closes = history.map((row) => number(row.close)).filter((x) => x > 0);
  const prior = closes.at(-2);
  const price = closes.at(-1);
  const priorVolumes = history
    .slice(-21, -1)
    .map((row) => number(row.volume))
    .filter((x) => x > 0);
  const last252 = history.slice(-252);
  const shares = number(
    fundamental?.sharesOutstanding ??
      fundamental?.weightedAverageShsOutDil ??
      fundamental?.weightedAverageShsOut,
  );
  const marketCap = shares > 0 && price > 0 ? shares * price : null;
  const netIncomeTtm = number(
    fundamental?.netIncomeTtm ?? fundamental?.netIncome,
  );
  const freeCashFlowTtm = number(
    fundamental?.freeCashFlowTtm ?? fundamental?.freeCashFlow,
  );
  const bookValue = number(
    fundamental?.bookValue ??
      fundamental?.totalStockholdersEquity ??
      fundamental?.totalEquity,
  );
  return {
    ...profile,
    ...fundamental,
    symbol: symbolOf(profile),
    ticker: symbolOf(profile),
    name: profile.name || profile.companyName || symbolOf(profile),
    companyName: profile.companyName || profile.name || symbolOf(profile),
    price,
    currentPrice: price,
    lastPrice: price,
    close: price,
    previousClose: prior,
    change: price !== null && prior !== null ? price - prior : null,
    dayChangePct: pct(price, prior),
    changesPercentage: pct(price, prior),
    volume: number(bar.volume),
    avgVolume: mean(priorVolumes),
    priceAvg50: mean(closes.slice(-50)),
    fiftyDayAverage: mean(closes.slice(-50)),
    priceAvg200: closes.length >= 200 ? mean(closes.slice(-200)) : null,
    twoHundredDayAverage:
      closes.length >= 200 ? mean(closes.slice(-200)) : null,
    yearHigh: Math.max(...last252.map((row) => number(row.high, row.close))),
    yearLow: Math.min(...last252.map((row) => number(row.low, row.close))),
    marketCap,
    // Valuation is price-sensitive. Historical research must not carry today's
    // PE/PB/FCF yield backward through time merely because the underlying filing
    // row was selected point-in-time.
    pe:
      marketCap > 0 && netIncomeTtm > 0
        ? marketCap / netIncomeTtm
        : number(fundamental?.pe),
    pb:
      marketCap > 0 && bookValue > 0
        ? marketCap / bookValue
        : number(fundamental?.pb),
    freeCashFlowYield:
      marketCap > 0 && freeCashFlowTtm !== null
        ? (freeCashFlowTtm / marketCap) * 100
        : number(fundamental?.freeCashFlowYield),
    return5: trailingReturn(closes, 5),
    return20: trailingReturn(closes, 20),
    return60Ex5: trailingReturn(closes, 55, 5),
    return120Ex20: trailingReturn(closes, 100, 20),
    volatility20Pct: annualizedVolatility(closes, 20),
    volatility60Pct: annualizedVolatility(closes, 60),
    timestamp: Math.floor(asTime(decisionAt) / 1000),
    historicalMarketDataVerified: history.length >= 50,
  };
}

function historicalDiscoveryScore(row = {}) {
  const price = number(row.price, 0);
  const ma50 = number(row.priceAvg50);
  const ma200 = number(row.priceAvg200);
  const day = number(row.dayChangePct, 0);
  const vs50 = price > 0 && ma50 > 0 ? ((price - ma50) / ma50) * 100 : null;
  const relativeVolume =
    number(row.volume) > 0 && number(row.avgVolume) > 0
      ? number(row.volume) / number(row.avgVolume)
      : null;
  let score = 50;
  if (ma50 !== null) score += price >= ma50 ? 9 : -10;
  if (ma50 !== null && ma200 !== null) score += ma50 >= ma200 ? 8 : -9;
  if (ma200 !== null) score += price >= ma200 ? 6 : -12;
  if (vs50 !== null) {
    if (vs50 >= -3 && vs50 <= 8) score += 10;
    else if (vs50 > 14) score -= Math.min(18, (vs50 - 14) * 1.2);
    else if (vs50 < -8) score -= Math.min(15, Math.abs(vs50 + 8));
  }
  if (day >= -2.5 && day <= 2.5) score += 5;
  else if (day > 5) score -= Math.min(15, (day - 5) * 2.5);
  else if (day < -5) score -= Math.min(12, Math.abs(day + 5) * 2);
  if (relativeVolume !== null && relativeVolume >= 0.7 && relativeVolume <= 1.8)
    score += 4;
  return Math.round(clamp(score) * 10) / 10;
}

function liquidityPass(row = {}, rules = {}) {
  const price = number(row.price);
  const marketCap = number(row.marketCap);
  const avgVolume = number(row.avgVolume);
  return Boolean(
    price >= rules.minPrice &&
      marketCap >= rules.minMarketCap &&
      avgVolume > 0 &&
      price * avgVolume >= rules.minAvgDollarVolume &&
      row.historicalMarketDataVerified,
  );
}

function scoreHistoricalQuote(stock = {}, now) {
  const score = compositeScore(stock);
  const fundamentalScore = calcFundamentalScore(stock);
  const technicalScore = calcTechnicalScore(stock);
  const momentumScore = calcMomentumScore(stock);
  const relativeStrengthScore = calcRelativeStrengthScore(stock);
  const asymmetryScore = calcAsymmetryScore(stock);
  const triggerScore = calcTriggerScore(stock);
  const raw = getRecommendation({
    ...stock,
    score,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    triggerScore,
  });
  const recommendation = applyExpertDecision(
    {
      ...stock,
      score,
      fundamentalScore,
      technicalScore,
      momentumScore,
      relativeStrengthScore,
      triggerScore,
    },
    raw,
    now,
  );
  return {
    ...stock,
    score,
    compositeScore: score,
    heatScore: score,
    fundamentalScore,
    technicalScore,
    momentumScore,
    relativeStrengthScore,
    asymmetryScore,
    triggerScore,
    primaryTheme: stock.primaryTheme || stock.sector || "Other",
    theme: stock.primaryTheme || stock.sector || "Other",
    recommendation,
    riskPlan: recommendation.riskPlan ?? raw.riskPlan ?? null,
    technicalSnapshot: buildTechnicalSnapshot(stock),
    fundamentalSnapshot: buildFundamentalSnapshot(stock),
    expertDecision: recommendation.expertDecision,
    expertOverride: recommendation.expertOverride,
    expertOverrideReason: recommendation.expertOverrideReason,
    thesisScore: recommendation.thesisScore,
    tradeSetupScore: recommendation.tradeSetupScore,
    capitalScore: recommendation.capitalScore,
  };
}

function historicalEventRisk({ symbol, date, decisionAt, events, coverageAsOf }) {
  const coverageTime = asTime(coverageAsOf);
  const decisionTime = asTime(decisionAt);
  if (coverageTime === null || coverageTime < decisionTime)
    return {
      status: "Manual",
      label: "Historical event verification unavailable",
      detail:
        "The point-in-time event dataset does not prove coverage through this decision.",
      blockNewCapital: true,
      manualCheckRequired: true,
      checkComplete: false,
    };
  const known = (events || []).filter(
    (event) =>
      symbolOf(event) === symbol &&
      asTime(event.knownAt || event.publishedAt) !== null &&
      asTime(event.knownAt || event.publishedAt) <= decisionTime,
  );
  let risk = {
    status: "Passed",
    label: "Pre-Trade Check: Passed",
    detail: "Point-in-time earnings and material-event history is verified.",
    blockNewCapital: false,
    reduceConviction: false,
    manualCheckRequired: false,
    checkComplete: true,
    earningsCheckComplete: true,
    mergerCheckComplete: true,
    newsCheckComplete: true,
  };
  for (const event of known) {
    const eventDate = String(event.eventDate || event.date || "").slice(0, 10);
    const days = eventDate ? dateDiff(date, eventDate) : null;
    const active =
      event.active === true ||
      (days !== null && days >= number(event.startOffsetDays, -1) && days <= number(event.endOffsetDays, 2));
    if (!active) continue;
    if (event.blockNewCapital === true || event.severity === "blocked")
      risk = {
        ...risk,
        status: "Blocked",
        label: event.label || "Pre-Trade: Material Event",
        detail: event.detail || "A known material event blocks fresh capital.",
        blockNewCapital: true,
      };
    else if (event.reduceConviction === true || event.severity === "caution")
      risk = {
        ...risk,
        status: "Caution",
        label: event.label || "Pre-Trade: Event Caution",
        detail: event.detail || "Known event risk reduces conviction.",
        reduceConviction: true,
      };
  }
  return risk;
}

export function compilePointInTimeSignals(rawDataset = {}, options = {}) {
  const rules = {
    minPrice: 5,
    minMarketCap: 300_000_000,
    minAvgDollarVolume: 10_000_000,
    // Mirror the live full-market discovery shortlist. Research must not test a
    // narrower opportunity set than the production engine actually receives.
    maxCandidates: 500,
    ...options.liquidity,
  };
  const profiles = new Map(
    (rawDataset.securities || []).map((row) => [symbolOf(row), row]),
  );
  const fundamentals = new Map();
  for (const row of rawDataset.fundamentals || []) {
    const symbol = symbolOf(row);
    if (!fundamentals.has(symbol)) fundamentals.set(symbol, []);
    fundamentals.get(symbol).push(row);
  }
  const events = new Map();
  for (const row of rawDataset.events || []) {
    const symbol = symbolOf(row);
    if (!events.has(symbol)) events.set(symbol, []);
    events.get(symbol).push(row);
  }
  const rawSessions = Array.isArray(rawDataset.sessions)
    ? rawDataset.sessions
    : [];
  const requestedResume =
    options.resume && typeof options.resume === "object"
      ? options.resume
      : null;
  const requestedCompleted = Number(requestedResume?.completedSessions);
  const resumeSessions = Array.isArray(requestedResume?.sessions)
    ? requestedResume.sessions
    : [];
  const resumeValid = Boolean(
    Number.isInteger(requestedCompleted) &&
      requestedCompleted >= 0 &&
      requestedCompleted <= rawSessions.length &&
      resumeSessions.length === requestedCompleted &&
      resumeSessions.every(
        (session, index) => session?.date === rawSessions[index]?.date,
      ),
  );
  const startIndex = resumeValid ? requestedCompleted : 0;
  const requestedLimit = Number(options.maxSessions);
  const sessionLimit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : rawSessions.length || 1;
  const endIndex = Math.min(rawSessions.length, startIndex + sessionLimit);
  const histories = new Map();
  // Rebuilding only the raw price prefix is inexpensive and avoids persisting
  // a second copy of every trailing history. Decision hysteresis, which cannot
  // be reconstructed from prices alone, is carried in the durable checkpoint.
  for (const session of rawSessions.slice(0, startIndex)) {
    for (const rawBar of session.prices || []) {
      const symbol = symbolOf(rawBar);
      if (!symbol) continue;
      if (!histories.has(symbol)) histories.set(symbol, []);
      histories.get(symbol).push({ ...rawBar, symbol, date: session.date });
    }
  }
  const decisionMemory = new Map(
    resumeValid && Array.isArray(requestedResume?.decisionMemory)
      ? requestedResume.decisionMemory.filter(
          (entry) => Array.isArray(entry) && entry.length === 2,
        )
      : [],
  );
  const guaranteed = new Set(
    (options.guaranteedSymbols || rawDataset.metadata?.guaranteedSymbols || []).map(
      symbolOf,
    ),
  );
  const outputSessions = resumeValid ? resumeSessions.slice() : [];

  for (const session of rawSessions.slice(startIndex, endIndex)) {
    const decisionAt = session.decisionAt;
    const decisionDate = new Date(decisionAt);
    const decisionTime = decisionDate.getTime();
    const sessionPrices = new Map();
    for (const rawBar of session.prices || []) {
      const symbol = symbolOf(rawBar);
      if (!symbol) continue;
      const bar = { ...rawBar, symbol, date: session.date };
      sessionPrices.set(symbol, bar);
      if (!histories.has(symbol)) histories.set(symbol, []);
      histories.get(symbol).push(bar);
    }
    const spyBar = sessionPrices.get("SPY");
    const qqqBar = sessionPrices.get("QQQ");
    const spyHistory = histories.get("SPY") || [];
    const qqqHistory = histories.get("QQQ") || [];
    const spyDay = pct(number(spyBar?.close), number(spyHistory.at(-2)?.close));
    const qqqDay = pct(number(qqqBar?.close), number(qqqHistory.at(-2)?.close));
    const sourceProfiles = [...profiles.values()].filter((profile) => {
      const listed = String(profile.listedAt || "").slice(0, 10);
      const delisted = String(profile.delistedAt || "").slice(0, 10);
      return (
        profile.isEtf !== true &&
        profile.isFund !== true &&
        listed &&
        listed <= session.date &&
        (!delisted || delisted >= session.date)
      );
    });
    const candidates = [];
    const positionQuotes = [];
    for (const profile of sourceProfiles) {
      const symbol = symbolOf(profile);
      const history = histories.get(symbol) || [];
      const bar = sessionPrices.get(symbol);
      if (!bar || history.length < 20) continue;
      const fundamental = latestAvailable(
        fundamentals.get(symbol) || [],
        decisionAt,
      );
      const quote = buildHistoricalQuote({
        profile,
        bar,
        history,
        fundamental,
        decisionAt,
      });
      quote.spyDayChangePct = spyDay;
      quote.qqqDayChangePct = qqqDay;
      quote.discoveryScore = historicalDiscoveryScore(quote);
      // Entry discovery is intentionally selective, but an already-owned name
      // must continue to receive a portfolio decision even after deterioration
      // pushes it outside the fresh-capital shortlist.
      if (quote.historicalMarketDataVerified) positionQuotes.push(quote);
      if (liquidityPass(quote, rules) || guaranteed.has(symbol))
        candidates.push(quote);
    }
    const ranked = candidates.sort(
      (a, b) =>
        b.discoveryScore - a.discoveryScore || a.symbol.localeCompare(b.symbol),
    );
    const shortlist = ranked.filter((row, index) =>
      guaranteed.has(row.symbol) || index < rules.maxCandidates,
    );
    const positionEvaluations = attachCrossSectionalResearchFactors(
      positionQuotes.map((row) => scoreHistoricalQuote(row, decisionDate)),
    );
    const scoredBySymbol = new Map(
      positionEvaluations.map((row) => [row.symbol, row]),
    );
    let scored = shortlist.map(
      (row) => scoredBySymbol.get(row.symbol) || scoreHistoricalQuote(row, decisionDate),
    );
    const recentStrong = new Set(
      recentStrongBuySymbols(decisionTime, decisionMemory),
    );
    const preTradeSymbols = new Set(
      scored
        .filter(
          (row) =>
            ["Buy", "Strong Buy"].includes(
              row.recommendation?.displayLabel || row.recommendation?.label,
            ) || recentStrong.has(row.symbol),
        )
        .map((row) => row.symbol),
    );
    scored = scored.map((row) => {
      if (!preTradeSymbols.has(row.symbol)) return row;
      const eventRisk = historicalEventRisk({
        symbol: row.symbol,
        date: session.date,
        decisionAt,
        events: events.get(row.symbol) || [],
        coverageAsOf: session.eventCoverageAsOf,
      });
      return applyEventRiskGate(row, eventRisk);
    });
    scored = scored.map((row) => {
      if (!preTradeSymbols.has(row.symbol)) return row;
      const stockHistory=(histories.get(row.symbol)||[]).slice(-220);
      const timing = attachRelativeStrengthContext(analyzeEntryTiming(row.symbol,stockHistory),stockHistory,spyHistory.slice(-220),qqqHistory.slice(-220));
      return applyEntryTimingGate(row, timing, decisionDate);
    });
    const finalized = finalizeBroadOpportunityDecisions(scored, {
      now: decisionTime,
      memory: decisionMemory,
    }).map(applyPersonalCapitalPolicy);
    const holdingEvaluations = positionEvaluations.map((row) => {
      const eventRisk = historicalEventRisk({
        symbol: row.symbol,
        date: session.date,
        decisionAt,
        events: events.get(row.symbol) || [],
        coverageAsOf: session.eventCoverageAsOf,
      });
      const stockHistory=(histories.get(row.symbol)||[]).slice(-220);
      const entryTiming = attachRelativeStrengthContext(analyzeEntryTiming(row.symbol,stockHistory),stockHistory,spyHistory.slice(-220),qqqHistory.slice(-220));
      return {
        ...row,
        eventRisk,
        preTradeCheck: eventRisk,
        entryTiming,
        recommendation: { ...(row.recommendation || {}), entryTiming },
      };
    });
    const serializeEvidence = (row, { freshCapital = false } = {}) => {
      const fundamental = latestAvailable(
        fundamentals.get(row.symbol) || [],
        decisionAt,
      );
      const eventRisk = row.eventRisk || row.preTradeCheck;
      const timing = row.entryTiming || row.recommendation?.entryTiming;
      const fallbackCoverage = session.fundamentalCoverageAsOf || decisionAt;
      return {
        ...row,
        action: freshCapital
          ? row.finalDecision?.action || "Avoid"
          : row.recommendation?.displayLabel || row.recommendation?.label || "Avoid",
        capitalEfficiencyScore:
          row.finalDecision?.capitalEfficiencyScore ||
          row.finalDecision?.relativeCapitalScore ||
          row.capitalScore ||
          row.score,
        listedAt: profiles.get(row.symbol)?.listedAt,
        delistedAt: profiles.get(row.symbol)?.delistedAt || null,
        marketAvailableAt: session.marketAvailableAt || decisionAt,
        fundamentalsAvailableAt:
          fundamental?.availableAt ||
          fundamental?.acceptedDate ||
          fallbackCoverage,
        eventRiskAvailableAt: session.eventCoverageAsOf || decisionAt,
        fundamentalDataVerified:
          row.fundamentalDataStatus === "complete" &&
          row.fundamentalDataVerified === true,
        fundamentalRevisionSafe: fundamental?.revisionSafe === true,
        eventRiskVerified: eventRisk?.checkComplete === true,
        eventHistoryComplete: session.eventHistoryComplete === true,
        entryTimingVerified:
          freshCapital && timing?.available === true && timing?.pass === true,
      };
    };
    outputSessions.push({
      date: session.date,
      decisionAt,
      sourceUniverseCount: sourceProfiles.length,
      historicalDelistedMembership: sourceProfiles.filter(
        (profile) => Boolean(profile.delistedAt),
      ).length,
      eligibleUniverseCount: candidates.length,
      corporateActions: Array.isArray(session.corporateActions)
        ? session.corporateActions
        : [],
      prices: [...sessionPrices.values()],
      // Fresh-capital signals stay bounded to the same shortlist production uses.
      signals: finalized.map((row) =>
        serializeEvidence(row, { freshCapital: true }),
      ),
      // Portfolio decisions use the full historically observable universe so a
      // weak holding cannot evade Review/Trim/Exit by falling off the shortlist.
      positionSignals: holdingEvaluations.map((row) => serializeEvidence(row)),
    });
  }

  const complete = endIndex >= rawSessions.length;
  return {
    metadata: {
      schema: POINT_IN_TIME_SCHEMA,
      pointInTime: rawDataset.metadata?.pointInTime === true,
      survivorshipBiasFree:
        rawDataset.metadata?.survivorshipBiasFree === true,
      universeMembershipPointInTime:
        rawDataset.metadata?.universeMembershipPointInTime === true,
      delistedSecuritiesIncluded:
        rawDataset.metadata?.delistedSecuritiesIncluded === true,
      delistingReturnsComplete:
        rawDataset.metadata?.delistingReturnsComplete === true,
      corporateActionsAdjusted:
        rawDataset.metadata?.corporateActionsAdjusted === true,
      fundamentalsPointInTime:
        rawDataset.metadata?.fundamentalsPointInTime === true,
      fundamentalValuesRevisionSafe:
        rawDataset.metadata?.fundamentalValuesRevisionSafe === true,
      eventRiskPointInTime:
        rawDataset.metadata?.eventRiskPointInTime === true,
      materialNewsHistoryComplete:
        rawDataset.metadata?.materialNewsHistoryComplete === true,
      portfolioDecisionInputsComplete: true,
      capitalPolicyInputsComplete: true,
      positionDecisionUniverseComplete: true,
      fundamentalAvailabilityField: "acceptedDate",
      dataVendorEntitlementsVerified:
        rawDataset.metadata?.dataVendorEntitlementsVerified === true,
      benchmarkSymbol: rawDataset.metadata?.benchmarkSymbol || "SPY",
      generatedAt: new Date().toISOString(),
      source: rawDataset.metadata?.source || "FMP stable bulk endpoints",
      liquidityRules: rules,
      guaranteedSymbols: [...guaranteed],
    },
    sessions: outputSessions,
    compilerProgress: {
      completedSessions: endIndex,
      totalSessions: rawSessions.length,
      remainingSessions: rawSessions.length - endIndex,
      complete,
    },
    compilerCheckpoint: complete
      ? null
      : {
          completedSessions: endIndex,
          decisionMemory: [...decisionMemory.entries()],
        },
  };
}
