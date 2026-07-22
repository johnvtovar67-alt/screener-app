// pages/index.js

import { useEffect, useMemo, useState } from "react";

const PORTFOLIO_KEY = "stock_screener_portfolio_v1";
const ACTION_MEMORY_KEY = "stock_screener_action_memory_v1";
const SIGNAL_MEMORY_KEY = "stock_screener_signal_memory_v1";

const CASH_SYMBOLS = ["CASH", "SWVXX", "VMFXX", "SPAXX", "FDRXX", "MMF"];

const THEME_OPTIONS = [
  { key: "ai_compute", name: "AI Compute & Platforms" },
  { key: "ai_networking", name: "AI Networking" },
  { key: "cybersecurity", name: "Cybersecurity" },
  { key: "power", name: "Power & Electrification" },
  { key: "digital_infra", name: "Digital Infrastructure" },
  { key: "nuclear", name: "Nuclear / Baseload" },
  { key: "btc", name: "BTC / Digital Assets" },
  { key: "defense", name: "Defense & National Security" },
  { key: "space", name: "Space & Satellites" },
  { key: "drones", name: "Autonomy & Drones" },
  { key: "robotics", name: "Robotics & Automation" },
  { key: "industrial_software", name: "Industrial Software" },
  { key: "quantum", name: "Quantum Computing" },
  { key: "biotech", name: "Platform Biotech" },
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function signedNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getSymbol(stock) {
  return String(stock?.symbol ?? stock?.ticker ?? "").toUpperCase();
}


function extractStockFromResponse(data) {
  const candidates = [
    data?.stock,
    data?.result,
    data?.data,
    data?.quote,
    data,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const symbol = getSymbol(candidate);
      const price = getPrice(candidate);

      if (symbol || Number.isFinite(price)) {
        return candidate;
      }
    }
  }

  return null;
}

function hasUsableStock(stock, requestedSymbol = "") {
  if (!stock || typeof stock !== "object") return false;

  const symbol = getSymbol(stock);
  const price = getPrice(stock);
  const requested = String(requestedSymbol || "").trim().toUpperCase();

  if (!symbol && !Number.isFinite(price)) return false;
  if (requested && symbol && symbol !== requested) return true;

  return Boolean(symbol) && Number.isFinite(price);
}

function getName(stock) {
  return stock?.name ?? stock?.companyName ?? stock?.company ?? "—";
}

function getPrice(stock) {
  return Number(stock?.price ?? stock?.currentPrice ?? stock?.quote?.price ?? stock?.lastPrice);
}

function getChangePct(stock) {
  return Number(stock?.dayChangePct ?? stock?.changesPercentage ?? stock?.changePercent ?? stock?.percentChange);
}

function getNetChange(stock) {
  const direct = Number(
    stock?.change ??
      stock?.dayChange ??
      stock?.priceChange ??
      stock?.regularMarketChange ??
      stock?.quote?.change
  );

  if (Number.isFinite(direct)) return direct;

  const price = getPrice(stock);
  const pct = getChangePct(stock);

  if (Number.isFinite(price) && Number.isFinite(pct) && pct !== -100) {
    const previousClose = price / (1 + pct / 100);
    return price - previousClose;
  }

  return null;
}

function priceChangeText(stock) {
  const change = getNetChange(stock);
  const pct = getChangePct(stock);

  if (Number.isFinite(change) && Number.isFinite(pct)) {
    return `${signedNumber(change)} (${percent(pct)})`;
  }

  if (Number.isFinite(change)) return signedNumber(change);
  if (Number.isFinite(pct)) return `(${percent(pct)})`;
  return "—";
}

function priceChangeClass(stock) {
  const change = getNetChange(stock);
  const pct = getChangePct(stock);
  const n = Number.isFinite(change) ? change : pct;
  return Number(n) >= 0 ? "positive" : "negative";
}


function getLocalTradeDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readActionMemory() {
  try {
    const raw = window.localStorage.getItem(ACTION_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeActionMemory(memory) {
  try {
    window.localStorage.setItem(ACTION_MEMORY_KEY, JSON.stringify(memory || {}));
  } catch {
    // Ignore storage failures; the screener still works without same-day memory.
  }
}

function readSignalMemory() {
  try {
    const raw = window.localStorage.getItem(SIGNAL_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSignalMemory(memory) {
  try {
    window.localStorage.setItem(SIGNAL_MEMORY_KEY, JSON.stringify(memory || {}));
  } catch {
    // Signal memory is helpful but not required for the app to run.
  }
}

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(`${dateString}T00:00:00`);
  if (!Number.isFinite(then.getTime())) return Infinity;
  const now = new Date(`${getLocalTradeDate()}T00:00:00`);
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

function actionRankValue(action) {
  const rank = { Buy: 4, Starter: 3, Watch: 2, Avoid: 1, Cash: 0 };
  return rank[action] ?? 0;
}

function deriveSignalState(stock = {}, prior = null) {
  const action = nonOwnedAction(stock);
  if (action !== "Buy" && action !== "Starter") return "";

  const priorAge = daysSince(prior?.lastSeenDate || prior?.date);
  const priorAction = prior?.lastAction || prior?.action || "";

  if (!prior || priorAge > 7) return action === "Buy" ? "New Buy" : "New Starter";
  if (priorAction === action) return action === "Buy" ? "Still Buy" : "Still Starter";
  if (priorAction === "Starter" && action === "Buy") return "Upgraded";
  if (priorAction === "Buy" && action === "Starter") return "Cooling Off";
  if (["Watch", "Avoid"].includes(priorAction)) return "Repaired";
  return "Still Valid";
}

function getSignalState(stock = {}) {
  return String(
    stock?.signalStateLabel ||
      stock?.signalState ||
      stock?.recommendation?.signalStateLabel ||
      stock?.recommendation?.signalState ||
      ""
  );
}

function getSignalClass(stock = {}) {
  const state = getSignalState(stock);
  if (["New Buy", "New Starter", "Upgraded", "Repaired"].includes(state)) return "fresh";
  if (["Still Buy", "Still Starter", "Still Valid"].includes(state)) return "still";
  if (state === "Cooling Off") return "cooling";
  return "neutral";
}

function getSignalRank(stock = {}) {
  const state = getSignalState(stock);
  if (["New Buy", "New Starter", "Upgraded", "Repaired"].includes(state)) return 3;
  if (["Still Buy", "Still Starter", "Still Valid"].includes(state)) return 2;
  if (state === "Cooling Off") return 1;
  return 2;
}

function signalAwareSummary(stock = {}, signalState = "") {
  const action = nonOwnedAction(stock);

  if (signalState === "Still Buy") {
    return "Still valid; already surfaced recently. Do not treat this as a brand-new alert.";
  }

  if (signalState === "Still Starter") {
    return "Still a starter candidate; already surfaced recently. Upgrade only after confirmation.";
  }

  if (signalState === "Cooling Off") {
    return "Prior Buy is cooling off. Keep sizing modest and wait for cleaner confirmation.";
  }

  if (signalState === "Upgraded") {
    return "Signal upgraded from Starter to Buy; entry is cleaner than the prior read.";
  }

  if (signalState === "Repaired") {
    return action === "Buy"
      ? "Signal has repaired into a fresh Buy; confirm risk plan before sizing."
      : "Signal has repaired into a starter; keep size small until confirmation.";
  }

  return "";
}

function applySignalMemory(rows = []) {
  if (typeof window === "undefined") return rows;

  const today = getLocalTradeDate();
  const memory = readSignalMemory();
  let changed = false;

  const nextRows = rows.map((stock) => {
    const symbol = getSymbol(stock);
    if (!symbol || isCashLikeSymbol(symbol)) return stock;

    const action = nonOwnedAction(stock);
    const prior = memory[symbol] || null;
    const signalState = deriveSignalState(stock, prior);

    memory[symbol] = {
      firstSeenDate: prior?.firstSeenDate || today,
      lastSeenDate: today,
      lastAction: action,
      score: getScore(stock),
      trigger: getTrigger(stock),
      momentum: getMomentumScore(stock),
      price: getPrice(stock),
      seenCount: Number(prior?.seenCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    changed = true;

    if (!signalState) return stock;

    const summary = signalAwareSummary(stock, signalState);
    const existingRec = getRecommendation(stock);

    return {
      ...stock,
      signalState,
      signalStateLabel: signalState,
      ...(summary ? { actionSummary: summary } : {}),
      recommendation: {
        ...existingRec,
        signalState,
        signalStateLabel: signalState,
        ...(summary ? { actionSummary: summary } : {}),
      },
    };
  });

  if (changed) writeSignalMemory(memory);
  return nextRows;
}


function getRiskPlan(stock = {}) {
  const direct = stock?.riskPlan ?? stock?.recommendation?.riskPlan;
  return direct && typeof direct === "object" ? direct : {};
}

function formatRiskPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? money(n) : "—";
}

function formatPlanPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function getTradeQuality(stock = {}) {
  const plan = getRiskPlan(stock);
  return String(plan.tradeQualityLabel || plan.tradeQuality || "Unavailable");
}

function getTradeQualityClass(stock = {}) {
  const quality = getTradeQuality(stock).toLowerCase();
  if (quality === "excellent") return "excellent";
  if (quality === "good") return "good";
  if (quality === "thin") return "thin";
  if (quality === "poor") return "poor";
  return "neutral";
}

function getEntryQuality(stock = {}) {
  return String(
    getRecommendation(stock)?.entryQualityLabel ??
      getRecommendation(stock)?.gateSummary?.entryQualityLabel ??
      stock?.entryQualityLabel ??
      stock?.technicalSnapshot?.entryQualityLabel ??
      "Unknown"
  );
}

function getEntryQualityRankValue(stock = {}) {
  const label = getEntryQuality(stock);
  if (label === "Clean Entry") return 4;
  if (label === "Pullback Entry") return 3;
  if (label === "Early Setup") return 2;
  if (label === "Chase Risk") return 1;
  if (label === "Extended") return 0;
  return 0;
}

function getEntryQualityClass(stock = {}) {
  const label = getEntryQuality(stock);
  if (label === "Clean Entry" || label === "Pullback Entry") return "good";
  if (label === "Early Setup") return "neutral";
  if (label === "Chase Risk") return "thin";
  if (label === "Extended") return "poor";
  return "neutral";
}

function getRiskPlanText(stock = {}) {
  const action = nonOwnedAction(stock);
  const plan = getRiskPlan(stock);
  const addAbove = formatRiskPrice(plan.addAbovePrice);
  const invalidation = formatRiskPrice(plan.invalidationPrice);
  const trim = formatRiskPrice(plan.firstTrimPrice);
  const downside = formatPlanPct(-Math.abs(Number(plan.downsideToReviewPct)));
  const upside = formatPlanPct(plan.upsideToFirstTrimPct);

  const belowText = downside ? `${invalidation} (${downside})` : invalidation;
  const gainText = upside ? `${trim} (${upside})` : trim;

  if (action === "Buy") return `Review below ${belowText} • Review gains above ${gainText}`;
  if (action === "Starter") return `Add above ${addAbove} • Review below ${belowText}`;
  if (action === "Watch") return `Trigger above ${addAbove}`;
  return "No new capital.";
}

function isMaterialBreakdown(stock = {}) {
  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const price = getPrice(stock);
  const plan = getRiskPlan(stock);
  const invalidation = Number(plan.invalidationPrice);

  if (score < 65) return true;
  if (trigger < 58) return true;
  if (momentum < 52) return true;
  if (Number.isFinite(price) && Number.isFinite(invalidation) && invalidation > 0 && price < invalidation) return true;

  return false;
}

function stabilizeSameDayStarter(stock = {}) {
  if (typeof window === "undefined" || !stock) return stock;

  const symbol = getSymbol(stock);
  if (!symbol || isCashLikeSymbol(symbol)) return stock;

  const today = getLocalTradeDate();
  const currentAction = nonOwnedAction(stock);
  const memory = readActionMemory();
  const prior = memory[symbol];

  let nextStock = stock;

  const canPreserveStarter =
    prior?.date === today &&
    prior?.action === "Starter" &&
    currentAction !== "Buy" &&
    currentAction !== "Starter" &&
    !isMaterialBreakdown(stock);

  if (canPreserveStarter) {
    const existingRec = getRecommendation(stock);
    nextStock = {
      ...stock,
      stabilizedStarter: true,
      originalAction: currentAction,
      displayLabel: "Starter",
      label: "Starter",
      action: "Starter",
      tradeAction: "Starter",
      actionSummary: "Existing starter remains acceptable. Do not add until confirmation.",
      dominantReason: "Same-day starter stability is active; intraday noise has not materially broken the setup.",
      entryNote: getRiskPlanText(stock),
      triggerNeeded: getRiskPlanText(stock),
      recommendation: {
        ...existingRec,
        label: "Starter",
        displayLabel: "Starter",
        recommendation: "Starter",
        tradeAction: "Starter",
        actionSummary: "Existing starter remains acceptable. Do not add until confirmation.",
        dominantReason: "Same-day starter stability is active; intraday noise has not materially broken the setup.",
        entryNote: getRiskPlanText(stock),
        triggerNeeded: getRiskPlanText(stock),
      },
    };
  }

  const nextAction = nonOwnedAction(nextStock);
  const nextPlan = getRiskPlan(nextStock);

  if (nextAction === "Buy" || nextAction === "Starter") {
    memory[symbol] = {
      date: today,
      action: nextAction,
      score: getScore(nextStock),
      trigger: getTrigger(nextStock),
      momentum: getMomentumScore(nextStock),
      invalidationPrice: nextPlan.invalidationPrice ?? null,
      recordedAt: new Date().toISOString(),
    };
    writeActionMemory(memory);
  }

  return nextStock;
}

function stabilizeStockList(rows = []) {
  return rows.map(stabilizeSameDayStarter);
}

function getRecommendation(stock) {
  const rec = stock?.recommendation;
  if (rec && typeof rec === "object") return rec;
  return {};
}

function normalizeActionLabel(value) {
  const label = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (["BUY", "BUY NOW", "BUY IMMEDIATELY", "STRONG BUY"].includes(label)) return "Buy";
  if (["STARTER", "STARTER ONLY", "STARTER BUY", "BREAKOUT", "BREAKOUT BUY", "BREAKOUT STARTER"].includes(label)) return "Starter";
  if (["WATCH", "WATCH FOR ENTRY", "WATCH CLOSELY", "NEAR MISS", "SETUP", "SETUP ONLY"].includes(label)) return "Watch";
  if (["AVOID", "AVOID FOR NOW", "EXIT / AVOID", "EXIT"].includes(label)) return "Avoid";
  return "Avoid";
}

function nonOwnedAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const rec = getRecommendation(stock);

  return normalizeActionLabel(
    rec?.displayLabel ??
      rec?.label ??
      rec?.recommendation ??
      rec?.tradeAction ??
      stock?.displayLabel ??
      stock?.label ??
      stock?.recommendation ??
      stock?.action
  );
}

function isCashLikeSymbol(symbolOrStock) {
  const symbol =
    typeof symbolOrStock === "string" ? symbolOrStock.toUpperCase() : getSymbol(symbolOrStock);

  return CASH_SYMBOLS.includes(symbol);
}

function getScore(stock) {
  return clampScore(getRecommendation(stock)?.score ?? stock?.score ?? stock?.compositeScore ?? stock?.overallScore ?? 0);
}

function getTrigger(stock) {
  return clampScore(getRecommendation(stock)?.triggerScore ?? stock?.triggerScore ?? stock?.technicalSnapshot?.triggerScore ?? 0);
}

function getMomentumScore(stock) {
  return clampScore(getRecommendation(stock)?.momentumScore ?? stock?.momentumScore ?? stock?.technicalSnapshot?.momentumScore ?? 0);
}

function getExpectationRisk(stock) {
  return clampScore(
    getRecommendation(stock)?.expectationRisk ??
      getRecommendation(stock)?.riskScore ??
      stock?.expectationRisk ??
      stock?.riskScore ??
      stock?.technicalSnapshot?.expectationRisk ??
      stock?.technicalSnapshot?.riskScore ??
      0
  );
}

function getConviction(stock) {
  return stock?.convictionGrade || "B";
}

function getTheme(stock) {
  return stock?.primaryTheme || stock?.theme || "Other";
}

function getCatalyst(stock) {
  return stock?.catalyst || "Setup";
}

function getDecisionClock(stock) {
  const clock = stock?.decisionClock;

  if (clock === "1–2 Weeks") return "Next 2 Weeks";
  if (clock === "2–4 Weeks") return "Monitor";
  if (clock === "1–3 Months") return "Monitor";

  return clock || "Monitor";
}

function getPositionSize(stock) {
  const action = nonOwnedAction(stock);

  if (action === "Buy") return "Full";
  if (action === "Starter") return "Starter";

  return "None";
}

function getDominantReason(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(
    rec?.dominantReason ??
      stock?.dominantReason ??
      rec?.blockedReason ??
      stock?.blockedReason
  );

  if (direct) return direct;

  const action = nonOwnedAction(stock);

  if (action === "Buy") return "High-conviction setup. Normal position size is appropriate.";
  if (action === "Starter") return "Small position is acceptable. Upgrade only after confirmation.";
  if (action === "Watch") return "Not actionable yet. Wait for confirmation.";

  return "Capital is better deployed elsewhere today.";
}

function getActionSummary(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(rec?.actionSummary ?? stock?.actionSummary ?? stock?.summary);
  if (direct) return direct;

  const action = nonOwnedAction(stock);

  if (action === "Buy") return "High-conviction setup. Normal position size is appropriate.";
  if (action === "Starter") return "Small position is acceptable. Upgrade only after confirmation.";
  if (action === "Watch") return "Not actionable yet. Wait for confirmation.";
  return "Capital is better deployed elsewhere today.";
}

function getTriggerNeeded(stock) {
  const rec = getRecommendation(stock);
  const direct = cleanSentence(stock?.triggerNeeded || rec?.entryNote || stock?.entryNote);
  if (direct) return direct;

  const price = getPrice(stock);
  const action = nonOwnedAction(stock);

  if (action === "Buy") return "Immediate decision. Normal size is appropriate with a defined invalidation level.";
  if (action === "Starter") return "Starter size only. Reassess after confirmation.";
  if (action === "Watch" && Number.isFinite(price)) {
    return `Watch for a break above ${money(price * 1.03)} or a constructive pullback to support.`;
  }
  return "Avoid until the setup materially improves.";
}

function cleanSentence(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function actionClass(action) {
  if (action === "Cash") return "gray";
  if (action === "Buy" || action === "Hold / Add") return "green";
  if (action === "Starter" || action === "Trim" || action === "Hold or Exit") return "orange";
  if (action === "Watch" || action === "Hold") return "yellow";
  if (action === "Exit Candidate" || action === "Review / Reduce") return "red";
  return "red";
}

function rankActionable(a, b) {
  const rank = { Buy: 3, Starter: 2, Watch: 1, Avoid: 0, Cash: 0 };
  const actionRankA = rank[nonOwnedAction(a)] ?? 0;
  const actionRankB = rank[nonOwnedAction(b)] ?? 0;

  if (actionRankB !== actionRankA) return actionRankB - actionRankA;

  const signalRankB = getSignalRank(b);
  const signalRankA = getSignalRank(a);

  if (signalRankB !== signalRankA) return signalRankB - signalRankA;

  const gradeRank = { "A+": 6, A: 5, "A-": 4, "B+": 3, B: 2, C: 1 };
  const gradeA = gradeRank[getConviction(a)] ?? 0;
  const gradeB = gradeRank[getConviction(b)] ?? 0;

  if (gradeB !== gradeA) return gradeB - gradeA;

  const entryB = getEntryQualityRankValue(b);
  const entryA = getEntryQualityRankValue(a);

  if (entryB !== entryA) return entryB - entryA;

  const qualityRank = { Excellent: 3, Good: 2, Thin: 1, Poor: 0, Unavailable: 0 };
  const tqB = qualityRank[getTradeQuality(b)] ?? 0;
  const tqA = qualityRank[getTradeQuality(a)] ?? 0;

  if (tqB !== tqA) return tqB - tqA;

  const triggerB = getTrigger(b);
  const triggerA = getTrigger(a);

  if (triggerB !== triggerA) return triggerB - triggerA;

  return getScore(b) - getScore(a);
}

function rankNearMiss(a, b) {
  const actionDiff = rankActionable(a, b);
  if (actionDiff !== 0) return actionDiff;

  const momentumA = getMomentumScore(a);
  const momentumB = getMomentumScore(b);

  if (momentumB !== momentumA) return momentumB - momentumA;

  return getScore(b) - getScore(a);
}

function calculatePosition(position, livePrice) {
  const shares = Number(position?.shares ?? 0);
  const avgCost = Number(position?.avgCost ?? 0);
  const price = Number(livePrice ?? 0);

  const value = shares * price;
  const costBasis = shares * avgCost;
  const gainLoss = value - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  return {
    shares,
    avgCost,
    price,
    value,
    costBasis,
    gainLoss,
    gainLossPct,
  };
}

function portfolioPositionScale(stock) {
  const value = Number(stock?.value);
  const costBasis = Number(stock?.costBasis);
  const size = Math.max(Number.isFinite(value) ? value : 0, Number.isFinite(costBasis) ? costBasis : 0);

  if (size > 0 && size < 25000) return "Small";
  if (size >= 25000 && size < 75000) return "Medium";
  if (size >= 75000) return "Large";
  return "Unknown";
}

function isSmallPortfolioPosition(stock) {
  return portfolioPositionScale(stock) === "Small";
}

function portfolioAction(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const buyAction = nonOwnedAction(stock);
  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);
  const gainLossPct = Number(stock?.gainLossPct);

  const deepLoss = Number.isFinite(gainLossPct) && gainLossPct <= -20;
  const bigGain = Number.isFinite(gainLossPct) && gainLossPct >= 35;

  const thesis = portfolioThesisTracker(stock).status;
  const smallPosition = isSmallPortfolioPosition(stock);

  if (deepLoss && score < 48 && trigger < 50) {
    if (smallPosition && thesis === "Broken") return "Exit Candidate";
    if (smallPosition) return "Hold or Exit";
    return "Review / Reduce";
  }

  if (bigGain && risk >= 78 && momentum < 55) return "Trim";
  if (buyAction === "Buy" && score >= 72 && risk <= 74) return "Hold / Add";
  if (buyAction === "Starter" && trigger >= 60) return "Hold";
  if (buyAction === "Watch" && score >= 52) return "Hold";

  return "Hold";
}

function portfolioHealth(stock) {
  if (isCashLikeSymbol(stock)) return "Cash";

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);

  const health = score * 0.38 + trigger * 0.24 + momentum * 0.22 + (100 - risk) * 0.16;

  if (health >= 84) return "A+";
  if (health >= 78) return "A";
  if (health >= 72) return "A-";
  if (health >= 64) return "B+";
  if (health >= 56) return "B";
  return "C";
}

function portfolioHealthScore(stock) {
  if (isCashLikeSymbol(stock)) return 100;

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);

  return Math.round(score * 0.38 + trigger * 0.24 + momentum * 0.22 + (100 - risk) * 0.16);
}

function portfolioHealthWhy(stock) {
  if (isCashLikeSymbol(stock)) return "Dry powder; no thesis risk.";

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);
  const gainLossPct = Number(stock?.gainLossPct);
  const health = portfolioHealthScore(stock);

  if (health >= 78 && trigger >= 65 && momentum >= 60 && risk < 72) {
    return "Strong score, confirmed setup, and manageable risk.";
  }

  if (health >= 72 && trigger >= 60) {
    return risk >= 72
      ? "Healthy thesis, but risk is elevated. Add carefully."
      : "Thesis is healthy; setup remains constructive.";
  }

  if (Number.isFinite(gainLossPct) && gainLossPct <= -20 && score < 60) {
    return "Loss is large and score is weak; thesis needs proof.";
  }

  if (trigger < 55 && momentum < 55) {
    return "Trigger and momentum are weak; do not add until repaired.";
  }

  if (risk >= 78) {
    return "Risk is elevated; protect capital before adding.";
  }

  if (health < 58) {
    return "Below-average health; thesis is being tested.";
  }

  return "Mixed but acceptable; hold unless conditions worsen.";
}

function portfolioRecommendedAction(stock) {
  if (stock?.error) return "Manual Review";
  return portfolioAction(stock);
}

function portfolioActionWhy(stock) {
  if (stock?.error) return stock.error;

  const action = portfolioRecommendedAction(stock);
  const buyAction = nonOwnedAction(stock);
  const quality = getTradeQuality(stock);
  const gainLossPct = Number(stock?.gainLossPct);

  if (action === "Hold / Add") return `Owned position remains addable. Fresh-money signal is ${buyAction} with ${quality} trade quality.`;
  if (action === "Trim") return "Position has entered a gain-protection zone; trim only if momentum fades.";
  if (action === "Exit Candidate") return "Small broken position; trimming is not useful, so decide whether to exit or keep only as an option ticket.";
  if (action === "Hold or Exit") return "Small weak position; either keep as an option ticket or exit and redeploy.";
  if (action === "Review / Reduce") return "Meaningful-size position with weak thesis or price structure; review exposure.";
  if (action === "Cash") return "Cash is available for better setups.";
  if (buyAction === "Buy") return "Hold existing shares. Add selectively; avoid chasing.";
  if (buyAction === "Starter") return "Hold existing shares. Add only after confirmation.";
  if (buyAction === "Watch") return "Hold only; not attractive for new money yet.";

  if (Number.isFinite(gainLossPct) && gainLossPct < -15) return "Hold only if the thesis still matches your original reason for owning it.";
  return "Hold existing position and wait for clearer evidence.";
}

function portfolioCapitalPriority(stock) {
  if (stock?.error) return "Manual Review";
  if (isCashLikeSymbol(stock)) return "Dry Powder";

  const action = portfolioRecommendedAction(stock);
  const health = portfolioHealthScore(stock);
  const quality = getTradeQuality(stock);
  const risk = getExpectationRisk(stock);
  const buyAction = nonOwnedAction(stock);
  const gainLossPct = Number(stock?.gainLossPct);

  if (action === "Trim") return "Harvest Gains";
  if (action === "Exit Candidate") return "Exit Review";
  if (action === "Hold or Exit") return "Defense First";
  if (action === "Review / Reduce") return "Defense First";
  if (Number.isFinite(gainLossPct) && gainLossPct <= -20 && health < 64) return "Defense First";
  if (action === "Hold / Add" && ["Excellent", "Good"].includes(quality) && health >= 72) return "Add Candidate";
  if (buyAction === "Buy" && ["Excellent", "Good"].includes(quality) && risk < 75) return "Selective Add";
  if (buyAction === "Starter" || quality === "Thin") return "Small Only";
  if (quality === "Poor" || buyAction === "Watch" || buyAction === "Avoid") return "No New Capital";

  return "Hold Existing";
}

function portfolioCapitalWhy(stock) {
  const priority = portfolioCapitalPriority(stock);

  if (priority === "Add Candidate") return "One of the better places for incremental dollars.";
  if (priority === "Selective Add") return "Can add, but only on pullback or confirmation.";
  if (priority === "Small Only") return "Starter-size add only; payoff or confirmation is not strong enough for full size.";
  if (priority === "No New Capital") return "Keep existing shares only; fresh money should go elsewhere.";
  if (priority === "Exit Review") return "Small position is weak enough that the decision is keep or exit, not trim.";
  if (priority === "Defense First") return "Focus on preserving capital before considering adds.";
  if (priority === "Harvest Gains") return "Consider capturing part of the gain if the move stalls.";
  if (priority === "Dry Powder") return "Available cash for stronger opportunities.";
  if (priority === "Manual Review") return "Data issue; verify manually before acting.";

  return "Hold position; not a priority for new capital.";
}

function portfolioPriorityClass(stock) {
  const priority = portfolioCapitalPriority(stock);
  if (["Add Candidate", "Selective Add"].includes(priority)) return "green";
  if (["Small Only", "Hold Existing"].includes(priority)) return "yellow";
  if (["Defense First", "Harvest Gains"].includes(priority)) return "orange";
  if (["Exit Review", "No New Capital", "Manual Review"].includes(priority)) return "red";
  return "gray";
}

function portfolioThesisTracker(stock) {
  if (stock?.error) return { status: "Needs Data", detail: "Quote or scoring data was unavailable." };
  if (isCashLikeSymbol(stock)) return { status: "Dry Powder", detail: "Cash has no operating thesis; keep available for better setups." };

  const score = getScore(stock);
  const trigger = getTrigger(stock);
  const momentum = getMomentumScore(stock);
  const risk = getExpectationRisk(stock);
  const gainLossPct = Number(stock?.gainLossPct);
  const theme = portfolioThesis(stock);
  const price = getPrice(stock);
  const plan = getRiskPlan(stock);
  const invalidation = Number(plan.invalidationPrice);
  const belowReview = Number.isFinite(price) && Number.isFinite(invalidation) && invalidation > 0 && price < invalidation;

  // Thesis Tracker is intentionally broader than the current trade setup.
  // It should answer: "Is the original reason for owning this still plausible?"
  // Price/trigger weakness can mean the thesis is not confirming yet, but that is different from declaring it broken.
  if (score >= 72 && trigger >= 60 && momentum >= 58 && risk < 78) {
    return { status: "Confirmed", detail: `${theme} thesis is being confirmed by score, trigger, and momentum.` };
  }

  if (score >= 60 && (trigger >= 55 || momentum >= 55)) {
    return { status: "Intact", detail: `${theme} thesis remains plausible, but confirmation is not strong enough for aggressive adds.` };
  }

  if (Number.isFinite(gainLossPct) && gainLossPct <= -30 && score < 45 && trigger < 45 && momentum < 45) {
    return { status: "Broken", detail: `${theme} thesis is failing both price action and scoring; reassess whether the original reason still holds.` };
  }

  if (belowReview || (Number.isFinite(gainLossPct) && gainLossPct <= -20) || (score < 50 && trigger < 50)) {
    return { status: "Not Confirming", detail: `${theme} thesis may still be valid, but current price action and scoring are not confirming it.` };
  }

  return { status: "Testing", detail: `${theme} thesis is plausible but mixed; wait for better evidence before adding.` };
}

function portfolioThesisClass(stock) {
  const status = portfolioThesisTracker(stock).status;
  if (status === "Confirmed") return "green";
  if (status === "Intact") return "yellow";
  if (status === "Testing" || status === "Not Confirming") return "orange";
  if (status === "Broken" || status === "Needs Data") return "red";
  return "gray";
}

function portfolioRisk(stock) {
  if (isCashLikeSymbol(stock)) return "Low";

  const risk = getExpectationRisk(stock);
  const beta = Number(stock?.beta);
  const gainLossPct = Number(stock?.gainLossPct);

  if (risk >= 78 || beta >= 2 || gainLossPct <= -20) return "High";
  if (risk >= 62 || beta >= 1.35) return "Medium";
  return "Low";
}

function portfolioProfitPlan(stock) {
  if (isCashLikeSymbol(stock)) return "No profit plan needed.";

  const price = getPrice(stock);
  const plan = getRiskPlan(stock);
  const firstTrim = Number(plan.firstTrimPrice);
  const stretch = Number(plan.stretchTargetPrice);
  const gainLossPct = Number(stock?.gainLossPct);
  const risk = getExpectationRisk(stock);
  const momentum = getMomentumScore(stock);

  const firstTrimText = formatRiskPrice(firstTrim);
  const stretchText = formatRiskPrice(stretch);

  if (!Number.isFinite(price) || price <= 0) return "No profit level available without a live quote.";

  if (Number.isFinite(stretch) && stretch > 0 && price >= stretch) {
    return `Extended zone active above ${stretchText}. Consider trimming 20–30% or tightening risk controls.`;
  }

  if (Number.isFinite(firstTrim) && firstTrim > 0 && price >= firstTrim) {
    if (risk >= 70 || momentum < 60) {
      return `Profit review active above ${firstTrimText}. Consider trimming 10–25% to capture gains.`;
    }

    return `Review gains above ${firstTrimText}. Let it run, but consider a partial trim if momentum fades.`;
  }

  if (Number.isFinite(gainLossPct) && gainLossPct >= 35 && (risk >= 72 || momentum < 58)) {
    return "Protect gains. Consider trimming 10–25% if strength does not resume.";
  }

  if (Number.isFinite(gainLossPct) && gainLossPct >= 18) {
    return `Let winners run. Review gains near ${firstTrimText}.` ;
  }

  if (Number.isFinite(gainLossPct) && gainLossPct > 0) {
    return `No trim yet. Review gains near ${firstTrimText}.`;
  }

  return `Risk first. Profit review is not relevant until price reclaims ${firstTrimText}.`;
}

function portfolioNextDecision(stock) {
  if (isCashLikeSymbol(stock)) return "Hold cash / dry powder.";

  const action = portfolioAction(stock);
  const nonOwned = nonOwnedAction(stock);
  const price = getPrice(stock);
  const support = Number.isFinite(price) ? money(price * 0.96) : "support";
  const breakout = Number.isFinite(price) ? money(price * 1.04) : "breakout";

  if (action === "Hold / Add") return `Add only on a clean pullback near ${support} or renewed strength above ${breakout}.`;
  if (action === "Trim") return "Protect gains; trim only if momentum fades or risk remains elevated.";
  if (action === "Review / Reduce") return "Review thesis. Reduce if the stock cannot reclaim trend support.";
  if (nonOwned === "Buy") return "Thesis healthy. Add selectively; do not chase oversized.";
  if (nonOwned === "Starter") return "Hold. Add only after the starter setup confirms.";
  if (nonOwned === "Watch") return "Hold existing shares; wait for better confirmation before adding.";
  return "Hold only if thesis is still intact.";
}

function portfolioThesis(stock) {
  const theme = getTheme(stock);
  if (theme === "BTC / Digital Assets") return "Bitcoin exposure";
  if (theme === "AI Compute & Platforms") return "AI compute/platform";
  if (theme === "AI Networking") return "AI networking";
  if (theme === "Cybersecurity") return "Cybersecurity/data";
  if (theme === "Power & Electrification") return "Power/electrification";
  if (theme === "Defense & National Security") return "Defense/security";
  if (theme === "Space & Satellites") return "Space/satellite";
  if (theme === "Autonomy & Drones") return "Autonomy/drones";
  return theme;
}

async function mapWithClientConcurrency(items = [], concurrency = 5, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = { ok: true, value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = {
          ok: false,
          symbol: getSymbol(items[index]) || String(items[index]?.symbol || ""),
          error: error?.message || String(error),
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}


function getEventRisk(stock = {}) {
  return stock?.eventRisk || stock?.preTradeCheck || stock?.recommendation?.eventRisk || stock?.recommendation?.preTradeCheck || null;
}

function getEventRiskClass(stock = {}) {
  const status = String(getEventRisk(stock)?.status || "").toLowerCase();
  if (status === "clear") return "clear";
  if (status === "caution") return "caution";
  if (status === "blocked") return "blocked";
  return "incomplete";
}

function OpportunityCard({ stock }) {
  const action = nonOwnedAction(stock);

  return (
    <article className={`ideaCard ${actionClass(action)}`}>
      <div className="ideaTop">
        <div>
          <h3>{getSymbol(stock)}</h3>
          <p>{getName(stock)}</p>
        </div>

        <span className={`actionPill ${actionClass(action)}`}>{action}</span>
      </div>

      <div className="badgeRow">
        <span className="themeBadge">{getTheme(stock)}</span>
        <span className="convictionBadge">Conviction {getConviction(stock)}</span>
        <span className="catalystBadge">{getCatalyst(stock)}</span>
        <span className={`entryBadge ${getEntryQualityClass(stock)}`}>Entry: {getEntryQuality(stock)}</span>
        {getSignalState(stock) && <span className={`signalBadge ${getSignalClass(stock)}`}>Signal: {getSignalState(stock)}</span>}
        {getEventRisk(stock) && <span className={`eventBadge ${getEventRiskClass(stock)}`}>{getEventRisk(stock).label}</span>}
      </div>

      <div className="priceRow">
        <strong>{money(getPrice(stock))}</strong>
        <span className={priceChangeClass(stock)}>{priceChangeText(stock)}</span>
      </div>

      <p className="reasonBox">{getActionSummary(stock)}</p>

      <div className="miniMeta">
        <span>Decision Clock</span>
        <strong>{getDecisionClock(stock)}</strong>
      </div>

      <div className="miniMeta compactMeta">
        <span>Position Size</span>
        <strong>{getPositionSize(stock)}</strong>
      </div>

      <div className="riskPlanBox">
        <span>Position Plan</span>
        <strong>{getRiskPlanText(stock)}</strong>
        <em className={`tradeQuality ${getTradeQualityClass(stock)}`}>Trade Quality: {getTradeQuality(stock)}</em>
      </div>

      {stock?.stabilizedStarter && (
        <p className="stabilityNote">Same-day starter stability: do not add until confirmation.</p>
      )}
    </article>
  );
}

function OnDeckTable({ rows }) {
  return (
    <section className="card">
      <div className="sectionTitle">
        <div>
          <h2>🟡 On Deck</h2>
          <p>Closest candidates. Good companies, but timing is not fully there yet.</p>
        </div>
      </div>

      {!rows.length ? (
        <p className="muted">No on-deck names right now.</p>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Theme</th>
                <th>Conviction</th>
                <th>Catalyst</th>
                <th>Entry</th>
                <th>Price</th>
                <th>Net Change</th>
                <th>Status</th>
                <th>What Is Missing</th>
                <th>Trigger Needed</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((stock) => (
                <tr key={getSymbol(stock)}>
                  <td className="symbol">{getSymbol(stock)}</td>
                  <td>{getTheme(stock)}</td>
                  <td>
                    <span className="smallBadge">{getConviction(stock)}</span>
                  </td>
                  <td>{getCatalyst(stock)}</td>
                  <td><span className={`entryBadge ${getEntryQualityClass(stock)}`}>{getEntryQuality(stock)}</span></td>
                  <td>{money(getPrice(stock))}</td>
                  <td className={priceChangeClass(stock)}>{priceChangeText(stock)}</td>
                  <td>
                    <span className="pill yellow">Setup</span>
                  </td>
                  <td>{getDominantReason(stock)}</td>
                  <td>{getTriggerNeeded(stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("opportunities");
  const [stocks, setStocks] = useState([]);
  const [themeStocks, setThemeStocks] = useState([]);
  const [themeLeadership, setThemeLeadership] = useState([]);
  const [themeMeta, setThemeMeta] = useState(null);
  const [screenerMeta, setScreenerMeta] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState("ai_compute");
  const [loadingTop, setLoadingTop] = useState(false);
  const [topError, setTopError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioResults, setPortfolioResults] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");

  const [symbol, setSymbol] = useState("");
  const [snapStock, setSnapStock] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState("");

  useEffect(() => {
    loadPortfolio();
    loadTopIdeas("opportunities");
  }, []);

  const buyIdeas = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Buy").sort(rankActionable);
  }, [stocks]);

  const starterIdeas = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Starter").sort(rankActionable).slice(0, 8);
  }, [stocks]);

  const onDeck = useMemo(() => {
    return stocks.filter((stock) => nonOwnedAction(stock) === "Watch").sort(rankNearMiss).slice(0, 8);
  }, [stocks]);

  const themeBuyIdeas = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Buy").sort(rankActionable);
  }, [themeStocks]);

  const themeStarterIdeas = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Starter").sort(rankActionable).slice(0, 8);
  }, [themeStocks]);

  const themeOnDeck = useMemo(() => {
    return themeStocks.filter((stock) => nonOwnedAction(stock) === "Watch").sort(rankNearMiss).slice(0, 8);
  }, [themeStocks]);

  const portfolioTotals = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;

    for (const p of portfolioResults) {
      const value = Number(p.value);
      const costBasis = Number(p.costBasis);

      if (Number.isFinite(value)) totalValue += value;
      if (Number.isFinite(costBasis)) totalCost += costBasis;
    }

    const totalGainLoss = totalValue - totalCost;
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    return {
      value: totalValue,
      costBasis: totalCost,
      gainLoss: totalGainLoss,
      gainLossPct: totalGainLossPct,
    };
  }, [portfolioResults]);

  const selectedThemeName =
    THEME_OPTIONS.find((theme) => theme.key === selectedTheme)?.name || "Theme";

  async function loadTopIdeas(theme = "opportunities") {
    setLoadingTop(true);
    setTopError("");
    setRefreshWarning("");

    try {
      const res = await fetch(`/api/top5?theme=${encodeURIComponent(theme)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || "Failed to load trade screen.");
      }

      const baseList = stabilizeStockList(Array.isArray(data?.stocks) ? data.stocks : []);
      const list = theme === "opportunities" ? applySignalMemory(baseList) : baseList;

      if (theme === "opportunities") {
        setStocks(list);
        setThemeLeadership(data?.themeLeadership || []);
      } else {
        setThemeStocks(list);
      }

      setThemeMeta(data?.selectedTheme || null);
      setScreenerMeta(data?.meta || null);
    } catch (err) {
      const message = err.message || "Failed to load trade screen.";

      if (theme === "opportunities" && stocks.length > 0) {
        setRefreshWarning(`Quote refresh failed — showing last successful screen. ${message}`);
      } else {
        setTopError(message);
        setScreenerMeta(null);
      }
    } finally {
      setLoadingTop(false);
    }
  }

  async function changeTheme(nextTheme) {
    setSelectedTheme(nextTheme);
    await loadTopIdeas(nextTheme);
  }

  function loadPortfolio() {
    try {
      const raw = window.localStorage.getItem(PORTFOLIO_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setPortfolio(saved);
    } catch {
      setPortfolio([]);
    }
  }

  function savePortfolio(next) {
    setPortfolio(next);
    window.localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(next));
  }

  async function exportPortfolio() {
    try {
      const json = JSON.stringify(portfolio, null, 2);

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        alert("Portfolio copied. Paste it into Import Portfolio on another device.");
      } else {
        window.prompt("Copy this portfolio data:", json);
      }
    } catch {
      alert("Could not export portfolio.");
    }
  }

  function importPortfolio() {
    const raw = window.prompt("Paste exported portfolio JSON:");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid portfolio.");

      const cleaned = parsed
        .map((p) => ({
          symbol: String(p?.symbol || "").trim().toUpperCase(),
          shares: Number(p?.shares),
          avgCost: Number(p?.avgCost),
        }))
        .filter(
          (p) =>
            p.symbol &&
            Number.isFinite(p.shares) &&
            p.shares > 0 &&
            Number.isFinite(p.avgCost) &&
            p.avgCost >= 0
        );

      if (!cleaned.length) throw new Error("No valid positions.");

      savePortfolio(cleaned);
      setPortfolioResults([]);
      alert("Portfolio imported successfully.");
    } catch {
      alert("Invalid portfolio data.");
    }
  }

  function addPosition() {
    const cleanSymbol = newSymbol.trim().toUpperCase();
    const shares = Number(newShares);
    const avgCost = Number(newCost);

    if (!cleanSymbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost < 0) {
      alert("Please enter symbol, shares, and cost per share.");
      return;
    }

    const next = [...portfolio];
    const index = next.findIndex((p) => p.symbol === cleanSymbol);

    if (index >= 0) {
      next[index] = { symbol: cleanSymbol, shares, avgCost };
    } else {
      next.push({ symbol: cleanSymbol, shares, avgCost });
    }

    savePortfolio(next);
    setNewSymbol("");
    setNewShares("");
    setNewCost("");
  }

  function removePosition(symbolToRemove) {
    savePortfolio(portfolio.filter((p) => p.symbol !== symbolToRemove));
    setPortfolioResults((prev) => prev.filter((p) => p.symbol !== symbolToRemove));
  }


  async function fetchAnalyzedStock(requestedSymbol) {
    const cleanSymbol = String(requestedSymbol || "").trim().toUpperCase();
    if (!cleanSymbol) throw new Error("Missing symbol.");

    const endpoints = [
      `/api?symbol=${encodeURIComponent(cleanSymbol)}`,
      `/api/lookup?symbol=${encodeURIComponent(cleanSymbol)}`,
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.detail || data?.error || `Failed to analyze ${cleanSymbol}.`);
        }

        const stock = extractStockFromResponse(data);

        if (!hasUsableStock(stock, cleanSymbol)) {
          throw new Error(`No usable quote data returned for ${cleanSymbol}.`);
        }

        return stabilizeSameDayStarter(stock);
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(lastError?.message || `Failed to analyze ${cleanSymbol}.`);
  }

  async function analyzeSymbol(e) {
    e?.preventDefault();

    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) return;

    setSnapLoading(true);
    setSnapError("");
    setSnapStock(null);

    try {
      const stock = await fetchAnalyzedStock(cleanSymbol);
      setSnapStock(stock);
    } catch (err) {
      setSnapError(err.message || "Failed to analyze symbol.");
    } finally {
      setSnapLoading(false);
    }
  }

  async function analyzePortfolio() {
    if (!portfolio.length) return;

    setPortfolioLoading(true);
    setPortfolioResults([]);

    try {
      const results = await mapWithClientConcurrency(portfolio, 4, async (position) => {
        if (isCashLikeSymbol(position.symbol)) {
          const calculated = calculatePosition(position, position.avgCost || 1);

          return {
            symbol: position.symbol,
            name: "Cash / Money Market",
            shares: calculated.shares,
            avgCost: calculated.avgCost,
            currentPrice: calculated.price,
            price: calculated.price,
            value: calculated.value,
            costBasis: calculated.costBasis,
            gainLoss: calculated.gainLoss,
            gainLossPct: calculated.gainLossPct,
            primaryTheme: "Cash",
            theme: "Cash",
            isCash: true,
          };
        }

        const stock = await fetchAnalyzedStock(position.symbol);
        const livePrice = getPrice(stock);
        const calculated = calculatePosition(position, livePrice);

        return {
          ...stock,
          shares: calculated.shares,
          avgCost: calculated.avgCost,
          currentPrice: calculated.price,
          price: calculated.price,
          value: calculated.value,
          costBasis: calculated.costBasis,
          gainLoss: calculated.gainLoss,
          gainLossPct: calculated.gainLossPct,
        };
      });

      const rows = results.map((r) => {
        if (r.ok) return r.value;
        return {
          symbol: r.symbol,
          name: r.symbol,
          error: r.error,
        };
      });

      setPortfolioResults(rows);
    } finally {
      setPortfolioLoading(false);
    }
  }

  function themeTone(score) {
    const n = Number(score);
    if (n >= 75) return "strong";
    if (n >= 60) return "improving";
    if (n >= 45) return "neutral";
    if (n >= 30) return "weakening";
    return "weak";
  }

  async function openThemeFromRibbon(theme) {
    if (!theme?.key || theme.key === "opportunities" || theme.key === "broad") return;
    setActiveTab("themes");
    await changeTheme(theme.key);
  }

  function renderLeadershipRibbon() {
    if (!themeLeadership.length) return null;

    return (
      <section className="leadershipRibbon">
        <div className="leadershipHeader">
          <span>Institutional Rotation</span>
          <strong>Theme Health</strong>
          <p>0–100 score. Higher means stronger institutional leadership, broader participation, and more actionable setups.</p>
        </div>

        <div className="leadershipItems">
          {themeLeadership.slice(0, 5).map((theme) => {
            const score = clampScore(theme.healthScore ?? theme.averageStrength ?? 0);
            const delta = Number(theme.trendDelta ?? 0);
            const arrow = theme.trendArrow || (delta > 1 ? "▲" : delta < -1 ? "▼" : "—");
            const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "Flat";
            const canOpen = theme.key && theme.key !== "opportunities" && theme.key !== "broad";

            return (
              <button
                key={theme.theme}
                type="button"
                className={`rotationTile ${themeTone(score)}`}
                onClick={() => openThemeFromRibbon(theme)}
                disabled={!canOpen}
                title={canOpen ? `Open ${theme.theme}` : theme.theme}
              >
                <div className="rotationTileTop">
                  <span className="rotationTheme">{theme.theme}</span>
                  <strong className="rotationScore">{score}</strong>
                </div>

                <div className="rotationBarTrack" aria-label={`${theme.theme} health score ${score} out of 100`}>
                  <span className="rotationBarFill" style={{ width: `${score}%` }} />
                </div>

                <div className="rotationTileBottom">
                  <span className="rotationScale">Health / 100</span>
                  <span className={`rotationTrend ${theme.trendDirection || "flat"}`}>{arrow} {deltaText}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>🧠 Investment Operating System</h1>
          <p>Fresh-capital ideas, portfolio decisions, thesis research, and single-symbol checks.</p>
        </div>

        <button onClick={() => loadTopIdeas(activeTab === "themes" ? selectedTheme : "opportunities")} className="button secondary">
          {loadingTop ? "Refreshing..." : "Reload"}
        </button>
      </header>

      <nav className="tabs">
        <button className={activeTab === "opportunities" ? "active" : ""} onClick={() => setActiveTab("opportunities")}>
          Opportunities
        </button>
        <button className={activeTab === "portfolio" ? "active" : ""} onClick={() => setActiveTab("portfolio")}>
          My Portfolio
        </button>
        <button
          className={activeTab === "themes" ? "active" : ""}
          onClick={() => {
            setActiveTab("themes");
            if (!themeStocks.length) loadTopIdeas(selectedTheme);
          }}
        >
          Themes
        </button>
        <button className={activeTab === "single" ? "active" : ""} onClick={() => setActiveTab("single")}>
          Single Symbol
        </button>
      </nav>

      {refreshWarning && <p className="warning">{refreshWarning}</p>}
      {topError && <p className="error">{topError}</p>}

      {activeTab === "opportunities" && (
        <>
          <section className="card modeCard">
            <div className="themeSummary">
              <div>
                <span>Current Mode</span>
                <strong>Best Opportunities</strong>
              </div>

              <div>
                <span>Purpose</span>
                <p>Fresh-capital screen. Theme labels explain context; they do not change the score.</p>
              </div>
            </div>
          </section>

          {renderLeadershipRibbon()}

          <section className="card actionCard">
            <div className="sectionTitle compactSectionTitle">
              <h2>🔥 Opportunities</h2>
              <p>Fresh money only. Decision Clock = when this investment is likely to require your next decision, not a mandatory waiting period.</p>
            </div>

            {loadingTop && stocks.length === 0 && <p className="muted">Loading opportunities...</p>}

            {buyIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle">Buy</h3>
                <div className="ideaGrid">
                  {buyIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {starterIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle divider">Starter</h3>
                <div className="ideaGrid">
                  {starterIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {!buyIdeas.length && !starterIdeas.length && !loadingTop && (
              <p className="muted">No actionable fresh-capital ideas right now. Check On Deck or be patient.</p>
            )}
          </section>

          <OnDeckTable rows={onDeck} />
        </>
      )}

      {activeTab === "portfolio" && (
        <>
          <section className="card">
            <div className="sectionTitle">
              <div>
                <h2>💼 My Portfolio</h2>
                <p>Designed for this trading account: thesis health, hold/add/exit decisions, capital priority, and profit review zones.</p>
              </div>

              <div className="buttonRow">
                <button onClick={exportPortfolio} className="button secondary">Export</button>
                <button onClick={importPortfolio} className="button secondary">Import</button>
                <button onClick={analyzePortfolio} disabled={!portfolio.length || portfolioLoading} className="button">
                  {portfolioLoading ? "Analyzing..." : "Analyze Portfolio"}
                </button>
              </div>
            </div>

            <div className="inputGrid">
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Symbol" />
              <input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="Shares" />
              <input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Avg cost" />
              <button onClick={addPosition} className="button">Add / Update</button>
            </div>

            {portfolio.length > 0 && (
              <div className="positionChips">
                {portfolio.map((p) => (
                  <span key={p.symbol} className="positionChip">
                    <strong>{p.symbol}</strong> {number(p.shares, 2)} @ {money(p.avgCost)}
                    <button onClick={() => removePosition(p.symbol)} aria-label={`Remove ${p.symbol}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {portfolioResults.length > 0 && (
            <section className="card">
              <div className="sectionTitle">
                <div>
                  <h2>Portfolio Intelligence</h2>
                  <p>Owned-position view: broader thesis status, health why, recommended action, capital priority, and profit review plan.</p>
                </div>

                <div className="totals">
                  <span>Total Value</span>
                  <strong>{money(portfolioTotals.value)}</strong>
                  <span className={portfolioTotals.gainLoss >= 0 ? "positive" : "negative"}>
                    {money(portfolioTotals.gainLoss)} / {percent(portfolioTotals.gainLossPct)}
                  </span>
                </div>
              </div>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Thesis Tracker</th>
                      <th>Health Why</th>
                      <th>Recommended Action</th>
                      <th>Capital Priority</th>
                      <th>Profit Plan</th>
                      <th>Price</th>
                      <th>Gain / Loss</th>
                    </tr>
                  </thead>

                  <tbody>
                    {portfolioResults.map((stock) => {
                      const action = portfolioRecommendedAction(stock);
                      const tracker = portfolioThesisTracker(stock);
                      return (
                        <tr key={getSymbol(stock)}>
                          <td>
                            <strong>{getSymbol(stock)}</strong>
                            <div className="mutedSmall">{getName(stock)}</div>
                            <div className="mutedSmall">{stock.error ? "Data unavailable" : portfolioThesis(stock)}</div>
                          </td>
                          <td>
                            <div className="intelStack">
                              <span className={`pill ${portfolioThesisClass(stock)}`}>{tracker.status}</span>
                              <p>{tracker.detail}</p>
                            </div>
                          </td>
                          <td>
                            <div className="intelStack">
                              <span className="smallBadge">{stock.error ? "—" : portfolioHealth(stock)}</span>
                              <p>{stock.error ? stock.error : portfolioHealthWhy(stock)}</p>
                              {!stock.error && <em>Risk: {portfolioRisk(stock)}</em>}
                            </div>
                          </td>
                          <td>
                            <div className="intelStack">
                              <span className={`pill ${actionClass(action)}`}>{action}</span>
                              <p>{portfolioActionWhy(stock)}</p>
                            </div>
                          </td>
                          <td>
                            <div className="intelStack">
                              <span className={`pill ${portfolioPriorityClass(stock)}`}>{portfolioCapitalPriority(stock)}</span>
                              <p>{portfolioCapitalWhy(stock)}</p>
                            </div>
                          </td>
                          <td className="profitPlanCell">{stock.error ? "—" : portfolioProfitPlan(stock)}</td>
                          <td>
                            {stock.error ? (
                              "—"
                            ) : (
                              <div className="priceStack">
                                <strong>{money(getPrice(stock))}</strong>
                                <span className={priceChangeClass(stock)}>{priceChangeText(stock)}</span>
                              </div>
                            )}
                          </td>
                          <td className={stock.gainLoss >= 0 ? "positive" : "negative"}>
                            {stock.error ? "—" : `${money(stock.gainLoss)} / ${percent(stock.gainLossPct)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {activeTab === "themes" && (
        <>
          <section className="card modeCard">
            <div className="sectionTitle">
              <div>
                <h2>🔎 Thesis Research</h2>
                <p>Use this only when you want to research a specific secular theme.</p>
              </div>

              <select value={selectedTheme} onChange={(e) => changeTheme(e.target.value)} className="themeSelect">
                {THEME_OPTIONS.map((theme) => (
                  <option key={theme.key} value={theme.key}>{theme.name}</option>
                ))}
              </select>
            </div>

            <div className="themeSummary">
              <div>
                <span>Theme</span>
                <strong>{themeMeta?.name || selectedThemeName}</strong>
              </div>

              <div>
                <span>Purpose</span>
                <p>{themeMeta?.description || "Focused research list using the same scoring model."}</p>
              </div>
            </div>
          </section>

          <section className="card actionCard">
            <div className="sectionTitle compactSectionTitle">
              <h2>{selectedThemeName}</h2>
              <p>Same scoring model, narrower thesis universe.</p>
            </div>

            {themeBuyIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle">Buy</h3>
                <div className="ideaGrid">
                  {themeBuyIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {themeStarterIdeas.length > 0 && (
              <>
                <h3 className="bucketTitle divider">Starter</h3>
                <div className="ideaGrid">
                  {themeStarterIdeas.map((stock) => (
                    <OpportunityCard key={getSymbol(stock)} stock={stock} />
                  ))}
                </div>
              </>
            )}

            {!themeBuyIdeas.length && !themeStarterIdeas.length && !loadingTop && (
              <p className="muted">No actionable names in this theme right now.</p>
            )}
          </section>

          <OnDeckTable rows={themeOnDeck} />
        </>
      )}

      {activeTab === "single" && (
        <section className="card">
          <div className="sectionTitle">
            <div>
              <h2>🎯 Single Symbol</h2>
              <p>Fast answer for one stock using the same scoring engine.</p>
            </div>
          </div>

          <form onSubmit={analyzeSymbol} className="singleForm">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MSTR, ANET, CRWD..." />
            <button type="submit" className="button" disabled={snapLoading}>
              {snapLoading ? "Checking..." : "Check"}
            </button>
          </form>

          {snapError && <p className="error">{snapError}</p>}

          {snapStock && (
            <div className="singleResult">
              <OpportunityCard stock={snapStock} />

              <div className="singleDetails">
                <div>
                  <span>Score</span>
                  <strong>{getScore(snapStock)}</strong>
                </div>
                <div>
                  <span>Trigger</span>
                  <strong>{getTrigger(snapStock)}</strong>
                </div>
                <div>
                  <span>Momentum</span>
                  <strong>{getMomentumScore(snapStock)}</strong>
                </div>
                <div>
                  <span>Decision</span>
                  <strong>{getTriggerNeeded(snapStock)}</strong>
                </div>
                <div>
                  <span>Position Plan</span>
                  <strong>{getRiskPlanText(snapStock)}</strong>
                </div>
                <div>
                  <span>Trade Quality</span>
                  <strong>{getTradeQuality(snapStock)}</strong>
                </div>
                <div>
                  <span>Entry Quality</span>
                  <strong>{getEntryQuality(snapStock)}</strong>
                </div>
                <div>
                  <span>Pre-Trade Check</span>
                  <strong>{getEventRisk(snapStock)?.label || "Unavailable"}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <style jsx global>{`
        .page {
          min-height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          padding: 28px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }

        h1, h2, h3, p {
          margin: 0;
        }

        h1 {
          font-size: 34px;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .header p, .sectionTitle p, .themeSummary p {
          color: #53657f;
          margin-top: 6px;
        }

        .button {
          border: 0;
          border-radius: 12px;
          background: #0f172a;
          color: white;
          font-weight: 800;
          padding: 12px 18px;
          cursor: pointer;
        }

        .button.secondary {
          background: white;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }

        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 22px;
        }

        .tabs button {
          border: 1px solid #cbd5e1;
          background: white;
          border-radius: 16px;
          padding: 16px;
          font-weight: 900;
          color: #0f172a;
          cursor: pointer;
        }

        .tabs button.active {
          background: #0f172a;
          color: white;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px #0ea5e9 inset;
        }

        .card {
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }

        .sectionTitle {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }

        .compactSectionTitle {
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 14px;
        }

        .themeSummary {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 14px;
        }

        .themeSummary > div {
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 14px;
        }

        .themeSummary span, .miniMeta span, .singleDetails span, .totals span {
          display: block;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .themeSummary strong {
          display: block;
          margin-top: 4px;
          font-size: 18px;
        }

        .leadershipRibbon {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background: #0f172a;
          color: white;
          border-radius: 18px;
          padding: 16px 18px;
          margin-bottom: 18px;
        }

        .leadershipRibbon span {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 800;
        }

        .leadershipRibbon strong {
          display: block;
          margin-top: 4px;
        }

        .leadershipItems {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .leadershipPill {
          background: rgba(255,255,255,0.1);
          color: white !important;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          padding: 8px 10px;
        }

        .leadershipPill strong {
          display: inline;
          margin-left: 6px;
          color: #fbbf24;
        }

        .bucketTitle {
          margin: 6px 0 12px;
          font-size: 20px;
        }

        .bucketTitle.divider {
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          margin-top: 22px;
        }

        .ideaGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 12px;
        }

        .ideaCard {
          border: 1px solid #dbe5f1;
          border-radius: 16px;
          padding: 14px;
          background: #fff;
        }

        .ideaCard.orange {
          border-color: #fed7aa;
          background: #fffaf4;
        }

        .ideaCard.green {
          border-color: #bbf7d0;
          background: #fbfffc;
        }

        .ideaTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
        }

        .ideaTop h3 {
          font-size: 24px;
          letter-spacing: -0.04em;
        }

        .ideaTop p {
          color: #64748b;
          font-size: 14px;
        }

        .actionPill, .pill, .smallBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 12px;
          font-weight: 900;
          font-size: 13px;
          white-space: nowrap;
        }

        .green {
          background: #dcfce7;
          color: #166534;
        }

        .orange {
          background: #ffedd5;
          color: #9a3412;
        }

        .yellow {
          background: #fef9c3;
          color: #854d0e;
        }

        .red {
          background: #fee2e2;
          color: #991b1b;
        }

        .gray {
          background: #e5e7eb;
          color: #374151;
        }

        .badgeRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 10px 0;
        }

        .themeBadge, .convictionBadge, .catalystBadge {
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 900;
        }

        .themeBadge {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .convictionBadge {
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid #dbe5f1;
        }

        .catalystBadge {
          background: #fef3c7;
          color: #92400e;
        }

        .priceRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          font-size: 18px;
          padding: 8px 0;
        }

        .positive {
          color: #15803d;
          font-weight: 900;
        }

        .negative {
          color: #b91c1c;
          font-weight: 900;
        }

        .reasonBox {
          border: 1px solid #dbe5f1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 10px;
          color: #334155;
          font-size: 14px;
          line-height: 1.35;
          min-height: 48px;
        }

        .miniMeta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          color: #334155;
        }

        .compactMeta {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
        }

        .riskPlanBox {
          margin-top: 10px;
          border: 1px solid #dbe5f1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 9px 10px;
        }

        .riskPlanBox span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.02em;
          margin-bottom: 4px;
        }

        .riskPlanBox strong {
          display: block;
          color: #0f172a;
          font-size: 13px;
          line-height: 1.35;
        }

        .tradeQuality {
          display: inline-flex;
          align-items: center;
          margin-top: 8px;
          border-radius: 999px;
          padding: 4px 8px;
          font-style: normal;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.02em;
          border: 1px solid transparent;
        }

        .tradeQuality.excellent {
          background: #dcfce7;
          color: #14532d;
          border-color: #86efac;
        }

        .tradeQuality.good {
          background: #e0f2fe;
          color: #075985;
          border-color: #7dd3fc;
        }

        .tradeQuality.thin {
          background: #fef3c7;
          color: #92400e;
          border-color: #fcd34d;
        }

        .tradeQuality.poor {
          background: #fee2e2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .tradeQuality.neutral {
          background: #f1f5f9;
          color: #475569;
          border-color: #cbd5e1;
        }

        .stabilityNote {
          margin-top: 8px;
          color: #7c2d12;
          background: #ffedd5;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          padding: 8px;
          font-size: 12px;
          font-weight: 800;
        }


        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: top;
        }

        th {
          color: #64748b;
          font-size: 13px;
          font-weight: 900;
        }

        .symbol {
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .muted {
          color: #64748b;
        }

        .mutedSmall {
          color: #64748b;
          font-size: 12px;
          margin-top: 3px;
        }

        .warning, .error {
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 16px;
          font-weight: 800;
        }

        .warning {
          background: #fef3c7;
          color: #92400e;
        }

        .error {
          background: #fee2e2;
          color: #991b1b;
        }

        .buttonRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .inputGrid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 10px;
          margin-bottom: 14px;
        }

        input, select {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 15px;
          background: white;
          color: #0f172a;
        }

        .themeSelect {
          min-width: 280px;
          font-weight: 800;
        }

        .positionChips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .positionChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 999px;
          padding: 8px 10px;
          color: #334155;
        }

        .positionChip button {
          border: 0;
          background: #e2e8f0;
          border-radius: 999px;
          cursor: pointer;
          color: #0f172a;
          font-weight: 900;
          width: 22px;
          height: 22px;
        }

        .totals {
          text-align: right;
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 10px 12px;
          min-width: 180px;
        }

        .priceStack {
          display: grid;
          gap: 4px;
        }


        .intelStack {
          display: grid;
          gap: 6px;
          min-width: 190px;
          max-width: 270px;
        }

        .intelStack p {
          margin: 0;
          color: #334155;
          font-size: 12px;
          line-height: 1.35;
        }

        .intelStack em {
          color: #64748b;
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
        }

        .profitPlanCell {
          color: #0f172a;
          font-size: 12px;
          line-height: 1.35;
          font-weight: 700;
          min-width: 210px;
        }

        .singleForm {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-bottom: 16px;
        }

        .singleResult {
          display: grid;
          grid-template-columns: minmax(260px, 340px) 1fr;
          gap: 14px;
          align-items: start;
        }

        .singleDetails {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .singleDetails > div {
          background: #f8fafc;
          border: 1px solid #dbe5f1;
          border-radius: 14px;
          padding: 14px;
        }

        .singleDetails strong {
          display: block;
          margin-top: 6px;
          font-size: 20px;
        }

        @media (max-width: 850px) {
          .page {
            padding: 16px;
          }

          .header, .sectionTitle, .leadershipRibbon {
            flex-direction: column;
            align-items: stretch;
          }

          .tabs {
            grid-template-columns: 1fr 1fr;
          }

          .themeSummary, .inputGrid, .singleResult, .singleDetails {
            grid-template-columns: 1fr;
          }

          .leadershipItems {
            justify-content: flex-start;
          }

          .rotationTile {
            width: 100%;
          }
        }

        /* Final UI polish: style child components globally so cards do not render as raw text. */
        .actionCard { overflow: hidden; }

        .ideaGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 12px;
        }

        .ideaCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
          border: 1px solid #dbe5f1;
          border-radius: 16px;
          padding: 14px;
          background: #ffffff;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
          min-height: 205px;
        }

        .ideaCard.green {
          border-color: #bbf7d0;
          background: linear-gradient(180deg, #ffffff 0%, #f7fffa 100%);
        }

        .ideaCard.orange {
          border-color: #fed7aa;
          background: linear-gradient(180deg, #ffffff 0%, #fff8ed 100%);
        }

        .ideaTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 9px;
        }

        .ideaTop h3 {
          font-size: 22px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .ideaTop p {
          color: #64748b;
          font-size: 13px;
          margin-top: 4px;
          line-height: 1.15;
        }

        .badgeRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0;
        }

        .themeBadge,
        .convictionBadge,
        .catalystBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }

        .themeBadge { background: #eff6ff; color: #1d4ed8; }
        .convictionBadge { background: #f8fafc; color: #0f172a; border: 1px solid #dbe5f1; }
        .catalystBadge { background: #fef3c7; color: #92400e; }
        .entryBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
        }
        .entryBadge.good { background: #dcfce7; color: #166534; border-color: #86efac; }
        .entryBadge.thin { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
        .entryBadge.poor { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
        .entryBadge.neutral { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
        .signalBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
        }

        .eventBadge {
          display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px;
          font-size: 12px; font-weight: 800; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155;
        }
        .eventBadge.clear { background: #dcfce7; color: #166534; border-color: #86efac; }
        .eventBadge.caution { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
        .eventBadge.blocked, .eventBadge.incomplete { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

        .signalBadge.fresh { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }
        .signalBadge.still { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
        .signalBadge.cooling { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
        .signalBadge.neutral { background: #f8fafc; color: #334155; border-color: #cbd5e1; }

        .priceRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          font-size: 17px;
          margin-top: auto;
        }

        .reasonBox {
          border: 1px solid #dbe5f1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 10px;
          color: #334155;
          font-size: 13px;
          line-height: 1.35;
          min-height: 54px;
        }

        .miniMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 0;
          padding-top: 2px;
        }

        .miniMeta span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
        }

        .miniMeta strong {
          background: #eef2ff;
          color: #3730a3;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 12px;
          white-space: nowrap;
        }

        .leadershipRibbon {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background: #0f172a;
          color: white;
          border-radius: 18px;
          padding: 16px 18px;
          margin-bottom: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.10);
        }

        .leadershipRibbon span {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .leadershipRibbon strong {
          display: block;
          margin-top: 4px;
        }

        .leadershipItems {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .leadershipHeader {
          min-width: 285px;
        }

        .leadershipHeader p {
          margin: 5px 0 0;
          max-width: 430px;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.35;
        }

        .rotationTile {
          display: grid;
          gap: 8px;
          width: 190px;
          min-height: 86px;
          padding: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 16px;
          background: rgba(15,23,42,0.76);
          text-align: left;
          cursor: pointer;
          color: white;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }

        .rotationTile:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.34);
          background: rgba(30,41,59,0.88);
        }

        .rotationTile:disabled {
          cursor: default;
          opacity: 0.95;
        }

        .rotationTileTop,
        .rotationTileBottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .rotationTheme {
          color: #f8fafc !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px !important;
          font-weight: 950 !important;
          letter-spacing: 0 !important;
        }

        .rotationScore {
          color: #ffffff !important;
          font-size: 22px !important;
          line-height: 1 !important;
          font-weight: 950 !important;
          letter-spacing: -0.04em;
        }

        .rotationBarTrack {
          height: 7px;
          width: 100%;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(148,163,184,0.24);
        }

        .rotationBarFill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #ef4444 0%, #f59e0b 42%, #84cc16 68%, #22c55e 100%);
        }

        .rotationScale {
          color: #94a3b8 !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          letter-spacing: 0.03em !important;
          text-transform: uppercase;
        }

        .rotationTrend {
          font-size: 11px !important;
          font-weight: 950 !important;
          white-space: nowrap;
        }

        .rotationTrend.up { color: #86efac !important; }
        .rotationTrend.down { color: #fca5a5 !important; }
        .rotationTrend.flat { color: #fde68a !important; }

      `}</style>
    </main>
  );
}
