// Production promotion of the best observed blended research policy.
//
// This is deliberately V11 as audited: 70% momentum/relative strength,
// 20% quality/stability and 10% entry condition. V12's multi-horizon hard
// extension governor and its 85% momentum weighting are not part of this
// policy because their matched development results were materially worse.

import {
  latestCompletedMarketSessionDay,
  marketSessionDistance,
} from "./marketSession";

export const V11_PRODUCTION_POLICY_ID =
  "v11-momentum-dominant-production-candidate";
export const V11_PRODUCTION_POLICY_LABEL =
  "V11 momentum-dominant quality leadership blend";
export const V11_PRODUCTION_TARGET_COUNT = 12;
export const V11_PRODUCTION_ENTRY_QUEUE_COUNT = 36;
export const V11_PRODUCTION_TARGET_WEIGHT_PCT = 8.25;
export const V11_PRODUCTION_MAX_POSITION_PCT = 8.5;
export const V11_PRODUCTION_MAX_SECTOR_POSITIONS = 4;
export const V11_PRODUCTION_MAX_ENTRY_GAP_PCT = 3;
export const V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS = 5;
export const V11_PRODUCTION_EXIT_RANK = 12;
export const V11_PRODUCTION_MINIMUM_HOLD_SESSIONS = 10;
export const V11_PRODUCTION_CATASTROPHIC_STOP_PCT = 18;
export const V11_PRODUCTION_TIME_STOP_SESSIONS = 126;

export const V11_PRODUCTION_WEIGHTS = Object.freeze({
  mediumTermMomentumPct: 55,
  relativeStrengthPct: 15,
  fundamentalQualityPct: 10,
  sectorRelativeQualityPct: 5,
  stabilityPct: 5,
  shortTermTechnicalPct: 5,
  controlledPullbackPct: 5,
});

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
  const timing = signal.entryTiming || {};
  const relativeStrength =
    clamp(
      0.65 * number(timing.alpha60VsSpy, 0) +
        0.35 * number(timing.alpha60VsQqq, 0),
      -25,
      25,
    ) * 2;
  return (
    0.55 * centeredPercentile(factors.momentumPercentile) +
    0.15 * relativeStrength +
    0.1 * centeredPercentile(factors.qualityPercentile) +
    0.05 * centeredPercentile(factors.sectorQualityPercentile) +
    0.05 * centeredPercentile(factors.stabilityPercentile) +
    0.05 * centeredPercentile(timing.shortTermTechnicalScore) +
    0.05 * centeredPercentile(factors.controlledPullbackScore)
  );
}

export function v11SourceSignalEligible(signal = {}) {
  const factors = signal.researchFactors || {};
  const timing = signal.entryTiming || {};
  const price = number(
    signal.price ?? signal.currentPrice ?? signal.lastPrice ?? signal.close,
    null,
  );
  return Boolean(
    symbolOf(signal) &&
      price >= 5 &&
      signal.fundamentalDataVerified === true &&
      signal.eventRiskVerified === true &&
      timing.available === true &&
      timing.chase !== true &&
      timing.liquidityPass === true &&
      number(factors.factorCoverage, 0) >= 7
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
      `V11 production snapshot has insufficient qualified candidates (${candidates.length}/${V11_PRODUCTION_TARGET_COUNT})`,
    );
  return {
    schema: 1,
    policyId: V11_PRODUCTION_POLICY_ID,
    policyLabel: V11_PRODUCTION_POLICY_LABEL,
    evidenceStatus: "provisional-post-selection-development-candidate",
    independentlyValidated: false,
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
    independentRecommendation: ["Strong Buy", "Buy"].includes(
      row.finalDecision?.action,
    ),
    quoteVerified: metrics.quoteFreshnessPass === true,
    fundamentalsVerified:
      metrics.fundamentalsPass === true &&
      row.fundamentalDataStatus === "complete" &&
      row.fundamentalDataVerified === true,
    eventVerified:
      event.checkComplete === true &&
      event.blockNewCapital !== true &&
      event.manualCheckRequired !== true &&
      !["blocked", "manual", "caution"].includes(eventStatus),
    timingAvailable: timing.available === true,
    entryTimingPass: timing.pass === true,
    liquidityVerified: timing.liquidityPass === true,
    shortHorizonChaseClear: timing.chase !== true,
    priceFloor: price >= 5,
    openingGapClear:
      entryGapPct === null ||
      entryGapPct <= V11_PRODUCTION_MAX_ENTRY_GAP_PCT,
  };
  const pass = Object.values(checks).every(Boolean);
  let reason = "Current operational gates pass.";
  if (!checks.independentRecommendation)
    reason =
      "The independent investment assessment does not currently support new capital.";
  else if (!checks.quoteVerified)
    reason = "Current quote verification is incomplete; fresh capital is paused.";
  else if (!checks.fundamentalsVerified)
    reason = "Current fundamental verification is incomplete; fresh capital is paused.";
  else if (!checks.eventVerified)
    reason = "A current event-risk check blocks or has not cleared fresh capital.";
  else if (!checks.timingAvailable)
    reason = "Current daily-history timing is unavailable; fresh capital is paused.";
  else if (!checks.entryTimingPass)
    reason =
      "Current entry timing has not cleared the required trend, momentum, and price-structure checks.";
  else if (!checks.liquidityVerified)
    reason = "Trailing 20-session dollar liquidity has not cleared the $10 million floor.";
  else if (!checks.shortHorizonChaseClear)
    reason = "The latest 3/5/10-session move is too extended for a fresh entry.";
  else if (!checks.priceFloor)
    reason = "The current price is below the V11 fresh-capital floor.";
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
      ? "A highest-conviction opportunity in the current market. It clears the stricter quality, trend, leadership, reward-to-risk, liquidity, and entry standards without chasing an extended move."
      : "One of the strongest opportunities in the current market. Momentum, relative strength, quality, liquidity, and entry conditions support a position.",
    nextTrigger:
      "Revalidate before trading and do not enter after an opening gap above 3%.",
    planText: "",
    relativeCapitalScore: displayScore,
    capitalEfficiencyScore: displayScore,
    policyScore: candidate.policyScore,
    standaloneAction: action,
    source: "v11-production-policy",
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
    source: "v11-production-gate",
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
    source: "v11-production-rank-demotion",
    capitalConfirmed: false,
  };
}

export function applyV11ProductionPolicy(rows = [], snapshot = {}) {
  const policyReady =
    snapshot?.policyId === V11_PRODUCTION_POLICY_ID &&
    snapshot?.status === "ready" &&
    snapshot?.independentlyValidated === true &&
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
  const pilotGates = new Map();

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

  // The failed V11 rank never authorizes capital. When that policy is explicitly
  // unvalidated, allow a very small, independently generated pilot list to pass
  // only the same live evidence gates. This is deliberately not a replacement
  // ranking model: it is bounded to three names and portfolio sizing caps it at 1%.
  const pilotRows =
    !policyReady && snapshot?.independentlyValidated === false
      ? rows
          .filter((row) =>
            ["Strong Buy", "Buy"].includes(row.finalDecision?.action),
          )
          .map((row) => {
            const price = number(
              row.price ?? row.currentPrice ?? row.lastPrice ?? row.close,
              null,
            );
            const gate = operationalGate(row, { sourcePrice: price }, {});
            pilotGates.set(symbolOf(row), gate);
            return { row, gate };
          })
          .filter(({ gate }) => gate.pass)
          .sort((left, right) => {
            const actionRank = (row) =>
              row.finalDecision?.action === "Strong Buy" ? 1 : 0;
            return (
              actionRank(right.row) - actionRank(left.row) ||
              number(
                right.row.finalDecision?.relativeCapitalScore ??
                  right.row.capitalScore,
                0,
              ) -
                number(
                  left.row.finalDecision?.relativeCapitalScore ??
                    left.row.capitalScore,
                  0,
                ) ||
              symbolOf(left.row).localeCompare(symbolOf(right.row))
            );
          })
          .slice(0, 3)
      : [];
  const pilotIndex = new Map(
    pilotRows.map(({ row }, index) => [symbolOf(row), index]),
  );

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
        if (pilotIndex.has(symbol))
          finalDecision = {
            ...existing,
            timing: "Confirm Across Two Sessions",
            size: "Pilot Max 1%",
            priority: `Limited Pilot #${pilotIndex.get(symbol) + 1}`,
            reason:
              existing.reason ||
              "Current fundamentals, event risk, liquidity, quote quality, and entry timing support a limited pilot position.",
            nextTrigger:
              "Fund only after the signal remains actionable across two distinct U.S. trading sessions; revalidate immediately before trading.",
            planText: "Keep total position size at or below 1% of Swing capital.",
            source: "independent-limited-pilot",
            capitalConfirmed: true,
            productionPolicySelected: false,
          };
        else if (["Strong Buy", "Buy"].includes(existing.action))
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
            source: "v11-production-snapshot-pause",
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
          : pilotIndex.size
            ? "limited-pilot"
          : snapshot?.independentlyValidated === false
            ? "suspended-failed-validation"
            : snapshot?.status || "unavailable",
        sourceSessionDate: snapshot?.sourceSessionDate || null,
        snapshotAgeSessions: number(snapshot?.snapshotAgeSessions, null),
        researchRank: candidate?.researchRank || null,
        policyScore: candidate?.policyScore ?? null,
        selected: selectedIndex.has(symbol),
        pilot: pilotIndex.has(symbol),
        pilotRank: pilotIndex.has(symbol) ? pilotIndex.get(symbol) + 1 : null,
        gate: gate || pilotGates.get(symbol) || null,
        targetWeightPct: V11_PRODUCTION_TARGET_WEIGHT_PCT,
        pilotMaxWeightPct: 1,
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
      reason: `The Swing is down ${Math.abs(gainLossPct).toFixed(1)}%, beyond the 18% loss limit. Exit to cash; do not widen the stop.`,
      source: "v11-production-catastrophic-stop",
      heldSessions,
      researchRank,
    };
  if (
    Number.isFinite(heldSessions) &&
    heldSessions >= V11_PRODUCTION_TIME_STOP_SESSIONS
  )
    return {
      action: "Exit",
      reason: `This Swing has reached ${heldSessions} market sessions, beyond the 126-session holding limit. Exit to cash and require a new qualified entry.`,
      source: "v11-production-time-stop",
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
      source: "v11-production-rank-deterioration",
      heldSessions,
      researchRank,
    };
  return null;
}
