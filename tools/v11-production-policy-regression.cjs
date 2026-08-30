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
let applied = applyV11ProductionPolicy(rows, readySnapshot);
const buys = applied.filter((row) => row.finalDecision.action === "Buy");
assert(buys.length === 12, "the live policy must fill twelve operationally cleared targets");
assert(
  applied.find((row) => row.symbol === "S00").finalDecision.action === "Watch",
  "an opening gap above 3% must block a fresh entry",
);
assert(
  applied.find((row) => row.symbol === "S01").finalDecision.action === "Watch",
  "the narrow 3/5/10-session chase gate must remain active",
);
assert(
  buys.every((row) => row.finalDecision.size === "Target 8.25%"),
  "selected V11 names must retain the audited equal-weight target",
);
assert(
  buys.some((row) => row.recommendation.expertDecision.metrics.lateTrend === true),
  "the V12 long-horizon extension veto must not leak into V11 selection",
);
assert(
  buys.some((row) => row.entryTiming?.pass === false),
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

console.log(
  "V11 PRODUCTION POLICY PASS: exact audited weights, narrow execution gates, twelve targets, and fail-closed snapshot behavior are verified",
);
