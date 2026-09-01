const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(`V11 PRODUCTION POLICY FAILURE: ${message}`);
};

const loader = createResearchModuleLoader(process.cwd());
const {
  applyV11ProductionPolicy,
  buildV11ProductionSnapshot,
  v11ProductionRankScore,
  v11ProductionPositionLifecycle,
  V11_PRODUCTION_POLICY_ID,
} = loader.load("lib/v11ProductionPolicy.js");

function sourceSignal(index, overrides = {}) {
  const level = 100 - index;
  return {
    symbol: `S${String(index).padStart(2, "0")}`,
    companyName: `Issuer ${index}`,
    cik: String(10_000 + index),
    sector: `Sector ${index % 6}`,
    price: 100,
    fundamentalDataVerified: true,
    eventRiskVerified: true,
    researchFactors: {
      factorCoverage: 8,
      momentumPercentile: level,
      qualityPercentile: 70,
      sectorQualityPercentile: 65,
      stabilityPercentile: 60,
      controlledPullbackScore: 55,
    },
    entryTiming: {
      available: true,
      pass: false,
      chase: false,
      liquidityPass: true,
      alpha60VsSpy: 12 - index * 0.05,
      alpha60VsQqq: 9 - index * 0.05,
      shortTermTechnicalScore: 58,
    },
    ...overrides,
  };
}

const session = {
  date: "2026-08-28",
  signals: Array.from({ length: 40 }, (_, index) => sourceSignal(index)),
  positionSignals: [],
};
const snapshot = buildV11ProductionSnapshot(
  session,
  new Date("2026-08-30T03:00:00.000Z"),
);
assert(snapshot.policyId === V11_PRODUCTION_POLICY_ID, "policy ID must be frozen");
assert(snapshot.candidates.length === 36, "the V11 entry queue must contain 36 ranks");
assert(snapshot.candidates[0].symbol === "S00", "highest V11 score must rank first");
assert(snapshot.v12HardGovernorEnabled === false, "the failed V12 hard governor must remain off");
assert(snapshot.weights.mediumTermMomentumPct + snapshot.weights.relativeStrengthPct === 70, "momentum and relative strength must retain the audited 70% weight");
assert(
  v11ProductionRankScore(sourceSignal(0)) >
    v11ProductionRankScore(sourceSignal(20)),
  "stronger medium-term momentum must rank higher",
);

function liveRow(candidate, overrides = {}) {
  return {
    symbol: candidate.symbol,
    sector: candidate.sector,
    price: candidate.sourcePrice,
    fundamentalDataStatus: "complete",
    fundamentalDataVerified: true,
    recommendation: {
      expertDecision: {
        metrics: {
          quoteFreshnessPass: true,
          fundamentalsPass: true,
          // V11 production must not silently restore V12's long-horizon veto.
          lateTrend: true,
          severeLateTrend: true,
          vs50: 30,
        },
      },
    },
    expertDecision: {
      metrics: { quoteFreshnessPass: true, fundamentalsPass: true },
    },
    eventRisk: {
      status: "Passed",
      checkComplete: true,
      blockNewCapital: false,
      manualCheckRequired: false,
    },
    entryTiming: {
      available: true,
      pass: false,
      chase: false,
      liquidityPass: true,
    },
    finalDecision: { action: "Watch", reason: "legacy result" },
    ...overrides,
  };
}

const readySnapshot = {
  ...snapshot,
  status: "ready",
  requiredSessionDate: "2026-08-28",
  snapshotAgeSessions: 0,
};
let rows = readySnapshot.candidates.map(liveRow);
rows[0] = liveRow(readySnapshot.candidates[0], { price: 104.01 });
rows[1] = liveRow(readySnapshot.candidates[1], {
  entryTiming: {
    available: true,
    pass: true,
    chase: true,
    liquidityPass: true,
  },
});
rows[2] = liveRow(readySnapshot.candidates[2], { entryTiming: undefined });
rows[3] = liveRow(readySnapshot.candidates[3]);
rows[3].recommendation.expertDecision.strongBuyPass = true;
rows[4] = liveRow(readySnapshot.candidates[4], {
  finalDecision: { action: "Strong Buy", reason: "legacy strong result" },
});
let applied = applyV11ProductionPolicy(rows, readySnapshot);
const buys = applied.filter((row) => row.finalDecision.action === "Buy");
const strongBuys = applied.filter(
  (row) => row.finalDecision.action === "Strong Buy",
);
const actionable = [...strongBuys, ...buys];
assert(
  actionable.length === 12,
  "the live policy must fill twelve operationally cleared targets",
);
assert(
  strongBuys.length === 1 && strongBuys[0].symbol === "S03",
  "a selected row that clears the strict current strong-buy gate must remain a Strong Buy",
);
assert(
  applied.find((row) => row.symbol === "S04").finalDecision.action === "Buy",
  "a legacy Strong Buy label must not survive without the current strict strong-buy gate",
);
assert(
  applied.find((row) => row.symbol === "S00").finalDecision.action === "Watch",
  "an opening gap above 3% must block a fresh entry",
);
assert(
  applied.find((row) => row.symbol === "S01").finalDecision.action === "Watch",
  "the narrow 3/5/10-session chase gate must remain active",
);
assert(
  actionable.every((row) => row.finalDecision.size === "Target 8.25%"),
  "Buy and Strong Buy selections must retain the audited equal-weight target",
);
assert(
  actionable.every(
    (row) =>
      !/\bV11\b|production policy|audited|point-in-time/i.test(
        `${row.finalDecision.reason} ${row.finalDecision.priority} ${row.finalDecision.planText}`,
      ),
  ),
  "investor-facing decisions must not expose version or implementation narration",
);
assert(
  applied.find((row) => row.symbol === "S02").finalDecision.priority ===
      "Best Opportunity" &&
    applied.find((row) => row.symbol === "S03").finalDecision.priority ===
      "Priority #2",
  "priority labels must remain useful without exposing the policy version",
);
assert(
  actionable.some(
    (row) => row.recommendation.expertDecision.metrics.lateTrend === true,
  ),
  "the V12 long-horizon extension veto must not leak into V11 selection",
);
assert(
  actionable.some((row) => row.entryTiming?.pass === false),
  "V11 must not be changed into V12 by requiring the full timing pass",
);
assert(
  applied.find((row) => row.symbol === "S02").finalDecision.action === "Buy" &&
    applied.find((row) => row.symbol === "S02").productionPolicy.gate.checks
      .timingAvailable === true,
  "the same-session compiled timing evidence must safely cover a cold live timing cache",
);

let lifecycle = v11ProductionPositionLifecycle({
  stock: {
    symbol: "S13",
    productionPolicy: {
      id: V11_PRODUCTION_POLICY_ID,
      status: "ready",
      researchRank: 13,
    },
  },
  position: {
    role: "Swing",
    openedAt: "2026-08-01T12:00:00.000Z",
    gainLossPct: 4,
  },
  policy: { id: V11_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-08-30T03:00:00.000Z"),
});
assert(
  lifecycle?.action === "Exit" &&
    lifecycle.source === "v11-production-rank-deterioration",
  "a mature Swing outside the frozen top-12 retention buffer must exit",
);
assert(
  !/\bV11\b|frozen|policy/i.test(lifecycle.reason),
  "holding decisions must use investor-facing language",
);
// Legacy holdings absent from the ranked entry queue carry a null rank. They
// are outside the retention group, not synthetic rank zero.
lifecycle = v11ProductionPositionLifecycle({
  stock: {
    symbol: "LEGACY",
    productionPolicy: {
      id: V11_PRODUCTION_POLICY_ID,
      status: "ready",
      researchRank: null,
      selected: false,
    },
  },
  position: {
    role: "Swing",
    openedAt: "2026-08-01T12:00:00.000Z",
    gainLossPct: 4,
  },
  policy: { id: V11_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-08-30T03:00:00.000Z"),
});
assert(
  lifecycle?.action === "Exit" &&
    lifecycle.source === "v11-production-rank-deterioration" &&
    lifecycle.researchRank === null,
  "a mature unranked pre-V11 Swing must exit rather than masquerade as rank zero",
);
lifecycle = v11ProductionPositionLifecycle({
  stock: {
    symbol: "NEW",
    productionPolicy: {
      id: V11_PRODUCTION_POLICY_ID,
      status: "ready",
      researchRank: null,
      selected: false,
    },
  },
  position: {
    role: "Swing",
    openedAt: "2026-08-27T12:00:00.000Z",
    gainLossPct: 1,
  },
  policy: { id: V11_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-08-30T03:00:00.000Z"),
});
assert(
  lifecycle === null,
  "an unranked Swing must retain the audited ten-session minimum hold",
);
lifecycle = v11ProductionPositionLifecycle({
  stock: { symbol: "CORE" },
  position: { role: "Core", gainLossPct: -25 },
  policy: { id: V11_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-08-30T03:00:00.000Z"),
});
assert(
  lifecycle === null,
  "Core holdings must remain exempt from the Swing rank, time, and loss lifecycle",
);
lifecycle = v11ProductionPositionLifecycle({
  stock: { symbol: "LOSS" },
  position: {
    role: "Swing",
    openedAt: "2026-08-27T12:00:00.000Z",
    gainLossPct: -18.1,
  },
  now: new Date("2026-08-30T03:00:00.000Z"),
});
assert(
  lifecycle?.source === "v11-production-catastrophic-stop",
  "the frozen 18% catastrophic stop must apply even before the rank minimum-hold clock",
);

applied = applyV11ProductionPolicy(
  [
    {
      ...liveRow(snapshot.candidates[0]),
      finalDecision: { action: "Buy", reason: "legacy buy" },
    },
  ],
  { status: "unavailable" },
);
assert(
  applied[0].finalDecision.action === "Watch" &&
    applied[0].finalDecision.source === "v11-production-snapshot-pause",
  "missing policy data must fail closed instead of falling back to another strategy",
);

const top5 = fs.readFileSync("pages/api/top5.js", "utf8");
assert(
  top5.includes("applyV11ProductionPolicy") &&
    top5.includes("getV11ProductionSnapshot") &&
    top5.includes("v11_momentum_dominant_production_candidate"),
  "the live Opportunities route must consume and identify the promoted V11 policy",
);
const page = fs.readFileSync("pages/index.js", "utf8");
for (const hiddenNarration of [
  "The promoted V11 cross-sectional rank",
  "Production policy",
  "V11 momentum-dominant blend is authoritative",
  "V11 ranks",
])
  assert(
    !page.includes(hiddenNarration),
    `the investor UI must hide implementation narration: ${hiddenNarration}`,
  );
assert(
  page.includes(
    "Current candidates for new capital, ordered from strongest to weakest.",
  ),
  "Opportunities must retain a concise investor-facing description",
);
assert(
  page.includes("v11ProductionPositionLifecycle") &&
    page.includes("currentProductionPolicy") &&
    page.includes('s.role==="Swing"&&!CASH.includes(sym(s))&&!s.openedAt'),
  "saved Swing holdings must receive the current lifecycle and an opening-date completeness check",
);

console.log(
  "V11 PRODUCTION POLICY PASS: strict Strong Buy preservation, exact audited weights, narrow execution gates, twelve targets, and fail-closed snapshot behavior are verified",
);
