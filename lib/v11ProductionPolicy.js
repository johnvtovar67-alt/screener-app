// Live policy for the frozen C1 active-swing ensemble. The legacy filename and
// exports remain as compatibility aliases while every policy identity, rank,
// sizing, and lifecycle rule below is C1.

import {
  latestCompletedMarketSessionDay,
  marketSessionDistance,
} from "./marketSession";

export const V11_PRODUCTION_POLICY_ID =
  "c1-active-swing-ensemble-20260904";
export const V11_PRODUCTION_POLICY_LABEL =
  "C1 active momentum swing ensemble";
export const V11_PRODUCTION_TARGET_COUNT = 3;
export const V11_PRODUCTION_ENTRY_QUEUE_COUNT = 9;
export const V11_PRODUCTION_TARGET_WEIGHT_PCT = 33;
export const V11_PRODUCTION_MAX_POSITION_PCT = 34;
export const V11_PRODUCTION_MAX_SECTOR_POSITIONS = 1;
export const V11_PRODUCTION_MAX_ENTRY_GAP_PCT = 3;
export const V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS = 5;
export const V11_PRODUCTION_EXIT_RANK = 9;
export const V11_PRODUCTION_MINIMUM_HOLD_SESSIONS = 30;
export const V11_PRODUCTION_CATASTROPHIC_STOP_PCT = 14;
export const V11_PRODUCTION_TIME_STOP_SESSIONS = 252;
export const C1_MINIMUM_AVERAGE_DOLLAR_VOLUME = 300_000_000;
export const C1_PORTFOLIO_DRAWDOWN_STOP_PCT = 12;
export const C1_BASE_COOLDOWN_SESSIONS = 10;
export const C1_EXTENDED_COOLDOWN_SESSIONS = 15;
export const C1_BLOCKED_SYMBOLS = Object.freeze(["MSTR"]);

export const V11_PRODUCTION_WEIGHTS = Object.freeze({
  momentumPct: 100,
});

export const C1_PRODUCTION_SLEEVES = Object.freeze([
  Object.freeze({ id: "base", weightPct: 25, cooldownSessions: 10, maximumSectorWeightPct: 50 }),
  Object.freeze({ id: "extended-cooldown", weightPct: 50, cooldownSessions: 15, maximumSectorWeightPct: 50 }),
  Object.freeze({ id: "sector-capped", weightPct: 25, cooldownSessions: 10, maximumSectorWeightPct: 40 }),
]);

const number = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, low = 0, high = 100) =>
  Math.max(low, Math.min(high, number(value, low)));
const symbolOf = (value) =>
  String(value?.symbol || value?.ticker || value || "")
    .replace("-", ".")
    .toUpperCase()
    .trim();
const centeredPercentile = (value) => clamp(value, 0, 100) - 50;
const round = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(number(value, 0) * scale) / scale;
};

function issuerOf(signal = {}) {
  const cik = String(signal.cik || signal.cikNumber || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (cik) return `cik:${cik}`;
  const name = String(signal.companyName || signal.name || "")
    .toUpperCase()
    .replace(/\b(?:CLASS [A-Z]|COMMON STOCK|ORDINARY SHARES?)\b/g, " ")
    .replace(
      /\b(?:INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|PLC|LTD|LIMITED|HOLDINGS?|GROUP)\b/g,
      " ",
    )
    .replace(/[^A-Z0-9]/g, "");
  return name ? `name:${name}` : `symbol:${symbolOf(signal)}`;
}

export function v11ProductionRankScore(signal = {}) {
  const factors = signal.researchFactors || {};
  return centeredPercentile(factors.momentumPercentile);
}

export function v11SourceSignalEligible(signal = {}) {
  const factors = signal.researchFactors || {};
  const timing = signal.entryTiming || {};
  const symbol = symbolOf(signal);
  const price = number(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  return Boolean(
    symbol &&
      !C1_BLOCKED_SYMBOLS.includes(symbol) &&
      price >= 5 &&
      timing.liquidityPass === true &&
      number(timing.averageDollarVolume20, 0) >=
        C1_MINIMUM_AVERAGE_DOLLAR_VOLUME &&
      Number.isFinite(number(factors.momentumPercentile, null))
  );
}

function sourcePool(session = {}) {
  const bySymbol = new Map();
  for (const signal of [
    ...(Array.isArray(session.positionSignals) ? session.positionSignals : []),
    ...(Array.isArray(session.signals) ? session.signals : []),
  ]) {
    const symbol = symbolOf(signal);
    if (symbol) bySymbol.set(symbol, signal);
  }
  return [...bySymbol.values()];
}

export function buildV11ProductionSnapshot(session = {}, createdAt = new Date()) {
  const sourceSessionDate = String(session.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate))
    throw new Error("V11 production snapshot requires a dated source session");
  const candidates = sourcePool(session)
    .filter(v11SourceSignalEligible)
    .map((signal) => {
      const factors = signal.researchFactors || {};
      const timing = signal.entryTiming || {};
      const sourcePrice = number(
        signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
        null,
      );
      return {
        symbol: symbolOf(signal),
        companyName: signal.companyName || signal.name || symbolOf(signal),
        sector: String(signal.sector || signal.primaryTheme || "Other"),
        issuer: issuerOf(signal),
        sourcePrice,
        policyScore: round(v11ProductionRankScore(signal), 4),
        factorCoverage: number(factors.factorCoverage, 0),
        momentumPercentile: number(factors.momentumPercentile, null),
        qualityPercentile: number(factors.qualityPercentile, null),
        sectorQualityPercentile: number(
          factors.sectorQualityPercentile,
          null,
        ),
        stabilityPercentile: number(factors.stabilityPercentile, null),
        controlledPullbackScore: number(
          factors.controlledPullbackScore,
          null,
        ),
        alpha60VsSpy: number(timing.alpha60VsSpy, null),
        alpha60VsQqq: number(timing.alpha60VsQqq, null),
        shortTermTechnicalScore: number(
          timing.shortTermTechnicalScore,
          null,
        ),
        sourceTiming: {
          available: timing.available === true,
          pass: timing.pass === true,
          strongPass: timing.strongPass === true,
          chase: timing.chase === true,
          liquidityPass: timing.liquidityPass === true,
          liquidityVerified: timing.liquidityVerified !== false,
          liquiditySessions: number(timing.liquiditySessions, null),
          averageDollarVolume20: number(
            timing.averageDollarVolume20,
            null,
          ),
          asOf: String(timing.asOf || sourceSessionDate).slice(0, 10),
        },
      };
    })
    .sort(
      (left, right) =>
        right.policyScore - left.policyScore ||
        left.symbol.localeCompare(right.symbol),
    )
    .map((candidate, index) => ({ ...candidate, researchRank: index + 1 }))
    .slice(0, V11_PRODUCTION_ENTRY_QUEUE_COUNT);
  if (candidates.length < V11_PRODUCTION_TARGET_COUNT)
    throw new Error(
      `C1 production snapshot has insufficient qualified candidates (${candidates.length}/${V11_PRODUCTION_TARGET_COUNT})`,
    );
  return {
    schema: 1,
    policyId: V11_PRODUCTION_POLICY_ID,
    policyLabel: V11_PRODUCTION_POLICY_LABEL,
    evidenceStatus: "cross-universe-cost-stress-placebo-qualified",
    independentlyValidated: false,
    activationAuthorized: true,
    sourceSessionDate,
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString()
        : new Date(createdAt).toISOString(),
    targetCount: V11_PRODUCTION_TARGET_COUNT,
    entryQueueCount: V11_PRODUCTION_ENTRY_QUEUE_COUNT,
    targetWeightPct: V11_PRODUCTION_TARGET_WEIGHT_PCT,
    maximumEntryGapPct: V11_PRODUCTION_MAX_ENTRY_GAP_PCT,
    maximumSectorPositions: V11_PRODUCTION_MAX_SECTOR_POSITIONS,
    weights: V11_PRODUCTION_WEIGHTS,
    sleeves: C1_PRODUCTION_SLEEVES,
    portfolioDrawdownStopPct: C1_PORTFOLIO_DRAWDOWN_STOP_PCT,
    v12HardGovernorEnabled: false,
    shortHorizonChaseGateEnabled: true,
    candidates,
  };
}

function currentEventRisk(row = {}) {
  return (
    row.eventRisk ||
    row.preTradeCheck ||
    row.recommendation?.eventRisk ||
    row.recommendation?.preTradeCheck ||
    {}
  );
}

function currentTiming(row = {}, candidate = {}, snapshot = {}) {
  const live = row.entryTiming || row.recommendation?.entryTiming || {};
  if (live.available === true) return live;
  const source = candidate.sourceTiming || {};
  const sourceSessionDate = String(snapshot?.sourceSessionDate || "");
  const requiredSessionDate = String(snapshot?.requiredSessionDate || "");
  if (
    source.available === true &&
    sourceSessionDate &&
    sourceSessionDate === requiredSessionDate &&
    String(source.asOf || sourceSessionDate) >= requiredSessionDate
  )
    return { ...source, sourceSnapshotFallback: true };
  return live;
}

function operationalGate(row = {}, candidate = {}, snapshot = {}) {
  const expert =
    row.recommendation?.expertDecision || row.expertDecision || {};
  const metrics = expert.metrics || {};
  const event = currentEventRisk(row);
  const timing = currentTiming(row, candidate, snapshot);
  const eventStatus = String(event.status || "").toLowerCase();
  const price = number(
    row.price ?? row.currentPrice ?? row.lastPrice ?? row.close,
    null,
  );
  const entryGapPct =
    price > 0 && candidate.sourcePrice > 0
      ? ((price - candidate.sourcePrice) / candidate.sourcePrice) * 100
      : null;
  const checks = {
    quoteVerified: metrics.quoteFreshnessPass === true,
    eventClear:
      event.blockNewCapital !== true &&
      !["blocked", "manual"].includes(eventStatus),
    momentumAvailable: Number.isFinite(number(candidate.momentumPercentile, null)),
    liquidityVerified:
      timing.liquidityPass === true &&
      number(timing.averageDollarVolume20, number(candidate.sourceTiming?.averageDollarVolume20, 0)) >=
        C1_MINIMUM_AVERAGE_DOLLAR_VOLUME,
    priceFloor: price >= 5,
    excludedSymbol: !C1_BLOCKED_SYMBOLS.includes(symbolOf(row)),
    openingGapClear:
      entryGapPct === null ||
      entryGapPct <= V11_PRODUCTION_MAX_ENTRY_GAP_PCT,
  };
  const pass = Object.values(checks).every(Boolean);
  let reason = "Current operational gates pass.";
  if (!checks.quoteVerified)
    reason = "Current quote verification is incomplete; fresh capital is paused.";
  else if (!checks.eventClear)
    reason = "A current material-event block prevents fresh capital.";
  else if (!checks.momentumAvailable)
    reason = "The current momentum rank is unavailable; fresh capital is paused.";
  else if (!checks.liquidityVerified)
    reason = "Trailing 20-session dollar liquidity has not cleared the $300 million floor.";
  else if (!checks.priceFloor)
    reason = "The current price is below the C1 fresh-capital floor.";
  else if (!checks.excludedSymbol)
    reason = "This symbol is outside the active-swing mandate.";
  else if (!checks.openingGapClear)
    reason = `The price is ${entryGapPct.toFixed(1)}% above the source-session close, beyond the 3% opening-gap limit.`;
  return {
    pass,
    checks,
    reason,
    entryGapPct: number(entryGapPct, null),
  };
}

function policyScoreForDisplay(candidate = {}) {
  return round(clamp(number(candidate.policyScore, 0) + 50), 1);
}

function currentStrongBuyQualified(row = {}) {
  const expert =
    row.recommendation?.expertDecision || row.expertDecision || {};
  return expert.strongBuyPass === true;
}

function selectedDecision(
  row = {},
  candidate = {},
  gate = {},
  selectedIndex = 0,
) {
  const displayScore = policyScoreForDisplay(candidate);
  const strongBuy = currentStrongBuyQualified(row);
  const action = strongBuy ? "Strong Buy" : "Buy";
  return {
    action,
    timing: "Next Open / Current Session",
    size: `Target ${V11_PRODUCTION_TARGET_WEIGHT_PCT.toFixed(2)}%`,
    priority:
      selectedIndex === 0
        ? "Best Opportunity"
        : `Priority #${selectedIndex + 1}`,
    reason: strongBuy
      ? "A highest-ranked liquid momentum leader in the current active-swing portfolio."
      : "One of the three highest-ranked liquid momentum leaders in the current active-swing portfolio.",
    nextTrigger:
      "Revalidate before trading and do not enter after an opening gap above 3%.",
    planText: "",
    relativeCapitalScore: displayScore,
    capitalEfficiencyScore: displayScore,
    policyScore: candidate.policyScore,
    standaloneAction: action,
    source: "c1-production-policy",
    capitalConfirmed: true,
    productionPolicySelected: true,
    strongBuyQualified: strongBuy,
    entryGapPct: gate.entryGapPct,
  };
}

function gateWatchDecision(existing = {}, candidate = {}, gate = {}) {
  const displayScore = policyScoreForDisplay(candidate);
  return {
    ...existing,
    action: "Watch",
    timing: "Wait",
    size: "None",
    priority: "Qualified Watch",
    reason: gate.reason,
    nextTrigger:
      "Re-evaluate automatically when the blocked operational check clears; a higher price alone is not a trigger.",
    planText: "No fresh capital while a required entry check is blocked.",
    relativeCapitalScore: displayScore,
    capitalEfficiencyScore: displayScore,
    policyScore: candidate.policyScore,
    standaloneAction: existing.standaloneAction || existing.action || "Watch",
    source: "c1-production-gate",
    capitalConfirmed: false,
    productionPolicySelected: false,
    entryGapPct: gate.entryGapPct,
  };
}

function outsidePolicyDecision(existing = {}) {
  if (!["Strong Buy", "Buy"].includes(existing.action)) return existing;
  return {
    ...existing,
    action: "Watch",
    timing: "Wait for Stronger Rank",
    size: "None",
    priority: "Below Buy Cutoff",
    reason:
      "The setup is not currently strong enough relative to the available alternatives for new capital.",
    nextTrigger: "Improve enough to enter the current target portfolio on a verified refresh.",
    planText: "No fresh capital while the setup remains below the Buy cutoff.",
    standaloneAction: existing.action,
    source: "c1-production-rank-demotion",
    capitalConfirmed: false,
  };
}

export function applyV11ProductionPolicy(rows = [], snapshot = {}) {
  const policyReady =
    snapshot?.policyId === V11_PRODUCTION_POLICY_ID &&
    snapshot?.status === "ready" &&
    snapshot?.activationAuthorized === true &&
    snapshot?.evidenceStatus ===
      "cross-universe-cost-stress-placebo-qualified" &&
    Array.isArray(snapshot?.candidates) &&
    snapshot.candidates.length >= V11_PRODUCTION_TARGET_COUNT;
  const candidateBySymbol = new Map(
    (snapshot?.candidates || []).map((candidate) => [
      symbolOf(candidate),
      candidate,
    ]),
  );
  const rowBySymbol = new Map(
    rows.map((row) => [symbolOf(row), row]).filter(([symbol]) => symbol),
  );
  const gates = new Map();
  const selected = [];
  const sectorCounts = new Map();
  const issuers = new Set();

  if (policyReady) {
    for (const candidate of snapshot.candidates) {
      const row = rowBySymbol.get(symbolOf(candidate));
      if (!row) continue;
      const gate = operationalGate(row, candidate, snapshot);
      gates.set(candidate.symbol, gate);
      if (!gate.pass) continue;
      const sector = String(candidate.sector || row.sector || "Other");
      const issuer = String(candidate.issuer || issuerOf(row));
      if (
        number(sectorCounts.get(sector), 0) >=
          V11_PRODUCTION_MAX_SECTOR_POSITIONS ||
        issuers.has(issuer)
      )
        continue;
      selected.push(candidate.symbol);
      sectorCounts.set(sector, number(sectorCounts.get(sector), 0) + 1);
      issuers.add(issuer);
      if (selected.length >= V11_PRODUCTION_TARGET_COUNT) break;
    }
  }

  const selectedIndex = new Map(selected.map((symbol, index) => [symbol, index]));
  return rows
    .map((row) => {
      const symbol = symbolOf(row);
      const candidate = candidateBySymbol.get(symbol);
      const gate = candidate
        ? gates.get(symbol) || operationalGate(row, candidate, snapshot)
        : null;
      const existing = row.finalDecision || {};
      let finalDecision = existing;
      if (!policyReady) {
        if (["Strong Buy", "Buy"].includes(existing.action))
          finalDecision = {
            ...existing,
            action: "Watch",
            timing: "Verification Paused",
            size: "None",
            priority: "Refresh Required",
            reason:
              "The current market ranking is unavailable or stale, so fresh capital is paused.",
            nextTrigger: "Wait for a current verified market ranking.",
            planText: "No fresh capital until the market ranking refreshes.",
            source: "c1-production-snapshot-pause",
            capitalConfirmed: false,
          };
      } else if (selectedIndex.has(symbol))
        finalDecision = selectedDecision(
          row,
          candidate,
          gate,
          selectedIndex.get(symbol),
        );
      else if (candidate && gate && !gate.pass)
        finalDecision = gateWatchDecision(existing, candidate, gate);
      else finalDecision = outsidePolicyDecision(existing);

      const productionPolicy = {
        id: V11_PRODUCTION_POLICY_ID,
        label: V11_PRODUCTION_POLICY_LABEL,
        status: policyReady
          ? "ready"
          : snapshot?.status || "unavailable",
        sourceSessionDate: snapshot?.sourceSessionDate || null,
        snapshotAgeSessions: number(snapshot?.snapshotAgeSessions, null),
        researchRank: candidate?.researchRank || null,
        policyScore: candidate?.policyScore ?? null,
        selected: selectedIndex.has(symbol),
        pilot: false,
        pilotRank: null,
        gate: gate || null,
        targetWeightPct: V11_PRODUCTION_TARGET_WEIGHT_PCT,
        pilotMaxWeightPct: 1,
        sleeves: C1_PRODUCTION_SLEEVES,
        portfolioDrawdownStopPct: C1_PORTFOLIO_DRAWDOWN_STOP_PCT,
        v12HardGovernorEnabled: false,
      };
      return { ...row, productionPolicy, finalDecision };
    })
    .sort((left, right) => {
      const actionRank = (action) =>
        action === "Strong Buy" ? 4 : action === "Buy" ? 3 : action === "Watch" ? 1 : 0;
      const actionDifference =
        actionRank(right.finalDecision?.action) -
        actionRank(left.finalDecision?.action);
      if (actionDifference) return actionDifference;
      const leftRank = number(left.productionPolicy?.researchRank, Infinity);
      const rightRank = number(right.productionPolicy?.researchRank, Infinity);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return symbolOf(left).localeCompare(symbolOf(right));
    });
}

export function v11ProductionPositionLifecycle({
  stock = {},
  position = {},
  policy = {},
  now = new Date(),
} = {}) {
  if (String(position.role || stock.role || "Swing").toLowerCase() !== "swing")
    return null;
  const openedAt = position.openedAt || stock.openedAt;
  const openedDate = openedAt ? new Date(openedAt) : null;
  const openedDay =
    openedDate && Number.isFinite(openedDate.getTime())
      ? openedDate.toISOString().slice(0, 10)
      : null;
  const currentDay = latestCompletedMarketSessionDay(now);
  const heldSessions = openedDay
    ? marketSessionDistance(openedDay, currentDay)
    : null;
  const gainLossPct = number(
    position.gainLossPct ?? stock.gainLossPct,
    null,
  );
  // Missing means the holding is outside the ranked entry queue. JavaScript's
  // Number(null) is 0, so accepting it here would make an unranked legacy
  // holding look better than rank #1 and bypass the retention lifecycle.
  const parsedResearchRank = number(
    stock.productionPolicy?.researchRank,
    null,
  );
  const researchRank =
    Number.isFinite(parsedResearchRank) && parsedResearchRank >= 1
      ? parsedResearchRank
      : null;
  const policyReady =
    (policy?.id === V11_PRODUCTION_POLICY_ID ||
      stock.productionPolicy?.id === V11_PRODUCTION_POLICY_ID) &&
    String(policy?.status || stock.productionPolicy?.status) === "ready";

  if (
    Number.isFinite(gainLossPct) &&
    gainLossPct <= -V11_PRODUCTION_CATASTROPHIC_STOP_PCT
  )
    return {
      action: "Exit",
      reason: `The Swing is down ${Math.abs(gainLossPct).toFixed(1)}%, beyond the 14% loss limit. Exit to cash; do not widen the stop.`,
      source: "c1-production-catastrophic-stop",
      heldSessions,
      researchRank,
    };
  if (
    Number.isFinite(heldSessions) &&
    heldSessions >= V11_PRODUCTION_TIME_STOP_SESSIONS
  )
    return {
      action: "Exit",
      reason: `This Swing has reached ${heldSessions} market sessions, beyond the 252-session holding limit. Exit to cash and require a new qualified entry.`,
      source: "c1-production-time-stop",
      heldSessions,
      researchRank,
    };
  if (
    policyReady &&
    Number.isFinite(heldSessions) &&
    heldSessions >= V11_PRODUCTION_MINIMUM_HOLD_SESSIONS &&
    stock.productionPolicy?.selected !== true &&
    (!Number.isFinite(researchRank) || researchRank > V11_PRODUCTION_EXIT_RANK)
  )
    return {
      action: "Exit",
      reason: Number.isFinite(researchRank)
        ? `After ${heldSessions} market sessions, ${stock.symbol} ranks #${researchRank}, outside the top-${V11_PRODUCTION_EXIT_RANK} retention group. Exit to cash or a separately qualified opportunity.`
        : `After ${heldSessions} market sessions, ${stock.symbol} is outside the top-${V11_PRODUCTION_EXIT_RANK} retention group. Exit to cash or a separately qualified opportunity.`,
      source: "c1-production-rank-deterioration",
      heldSessions,
      researchRank,
    };
  return null;
}
