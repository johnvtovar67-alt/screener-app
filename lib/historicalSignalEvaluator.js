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
import { analyzeEntryTiming, applyEntryTimingGate } from "./entryTiming";
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
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
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
    marketCap: shares > 0 && price > 0 ? shares * price : null,
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
  const histories = new Map();
  const decisionMemory = new Map();
  const guaranteed = new Set(
    (options.guaranteedSymbols || rawDataset.metadata?.guaranteedSymbols || []).map(
      symbolOf,
    ),
  );
  const outputSessions = [];

  for (const session of rawDataset.sessions || []) {
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
    let scored = shortlist.map((row) =>
      scoreHistoricalQuote(row, decisionDate),
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
      const timing = analyzeEntryTiming(
        row.symbol,
        (histories.get(row.symbol) || []).slice(-120),
      );
      return applyEntryTimingGate(row, timing, decisionDate);
    });
    const finalized = finalizeBroadOpportunityDecisions(scored, {
      now: decisionTime,
      memory: decisionMemory,
    }).map(applyPersonalCapitalPolicy);
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
      signals: finalized.map((row) => {
        const fundamental = latestAvailable(
          fundamentals.get(row.symbol) || [],
          decisionAt,
        );
        const eventRisk = row.eventRisk || row.preTradeCheck;
        const timing = row.entryTiming || row.recommendation?.entryTiming;
        const fallbackCoverage =
          session.fundamentalCoverageAsOf || decisionAt;
        return {
          ...row,
          action: row.finalDecision?.action || "Avoid",
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
          eventRiskVerified:
            preTradeSymbols.has(row.symbol) && eventRisk?.checkComplete === true,
          eventHistoryComplete: session.eventHistoryComplete === true,
          entryTimingVerified:
            preTradeSymbols.has(row.symbol) &&
            timing?.available === true &&
            timing?.pass === true,
        };
      }),
    });
  }

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
  };
}
