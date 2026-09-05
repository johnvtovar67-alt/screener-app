const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(`C1 PRODUCTION POLICY FAILURE: ${message}`);
};

const loader = createResearchModuleLoader(process.cwd());
const policy = loader.load("lib/v11ProductionPolicy.js");
const { c1DrawdownControl } = loader.load("lib/portfolioGovernor.js");
const {
  applyV11ProductionPolicy: applyC1ProductionPolicy,
  buildV11ProductionSnapshot: buildC1ProductionSnapshot,
  v11ProductionRankScore: c1ProductionRankScore,
  v11ProductionPositionLifecycle: c1ProductionPositionLifecycle,
  V11_PRODUCTION_POLICY_ID: C1_PRODUCTION_POLICY_ID,
  C1_PRODUCTION_SLEEVES,
  C1_PRODUCTION_ACTIVATION_DAY,
} = policy;

function sourceSignal(index, overrides = {}) {
  return {
    symbol: `S${String(index).padStart(2, "0")}`,
    companyName: `Issuer ${index}`,
    cik: String(20_000 + index),
    sector: `Sector ${index % 5}`,
    price: 100,
    researchFactors: { momentumPercentile: 100 - index },
    entryTiming: {
      available: true,
      liquidityPass: true,
      averageDollarVolume20: 500_000_000,
      asOf: "2026-09-01",
    },
    ...overrides,
  };
}

const session = {
  date: "2026-09-01",
  signals: [
    sourceSignal(99, {
      symbol: "MSTR",
      researchFactors: { momentumPercentile: 100 },
    }),
    ...Array.from({ length: 15 }, (_, index) => sourceSignal(index)),
  ],
};
const snapshot = buildC1ProductionSnapshot(
  session,
  new Date("2026-09-04T15:00:00.000Z"),
);
assert(snapshot.policyId === C1_PRODUCTION_POLICY_ID, "policy identity must be C1");
assert(snapshot.activationAuthorized === true, "authorized activation must be explicit");
assert(snapshot.candidates.length === 9, "the retention queue must contain nine ranks");
assert(!snapshot.candidates.some((row) => row.symbol === "MSTR"), "MSTR must remain outside the system mandate");
assert(snapshot.targetCount === 3 && snapshot.targetWeightPct === 33, "C1 must target three approximately equal positions");
assert(C1_PRODUCTION_SLEEVES.map((row) => row.weightPct).join(",") === "25,50,25", "the frozen sleeve allocation must be 25/50/25");
assert(snapshot.shortHorizonChaseGateEnabled === false, "legacy short-horizon timing must not contradict C1's tested opening-gap entry rule");
assert(c1ProductionRankScore(sourceSignal(0)) > c1ProductionRankScore(sourceSignal(5)), "higher momentum percentile must rank higher");

function liveRow(candidate, overrides = {}) {
  return {
    symbol: candidate.symbol,
    sector: candidate.sector,
    price: candidate.sourcePrice,
    recommendation: { expertDecision: { metrics: { quoteFreshnessPass: true } } },
    eventRisk: { status: "Passed", blockNewCapital: false },
    entryTiming: {
      available: true,
      liquidityPass: true,
      averageDollarVolume20: 500_000_000,
    },
    finalDecision: { action: "Watch", reason: "legacy decision" },
    ...overrides,
  };
}

const ready = {
  ...snapshot,
  status: "ready",
  requiredSessionDate: "2026-09-01",
  snapshotAgeSessions: 0,
};
let applied = applyC1ProductionPolicy(ready.candidates.map(liveRow), ready);
let buys = applied.filter((row) => ["Strong Buy", "Buy"].includes(row.finalDecision.action));
assert(buys.length === 3, "C1 must select exactly three liquid momentum leaders");
assert(buys.every((row) => row.productionPolicy.selected), "every actionable row must be selected by C1");
assert(buys.every((row) => row.finalDecision.size === "Target 33.00%"), "selected rows must expose the combined target");
assert(new Set(buys.map((row) => row.sector)).size === 3, "the selector must not choose two names from one sector");

const legacyTimingConflictRows = ready.candidates.map((candidate, index) =>
  liveRow(candidate, index === 0 ? {
    entryTiming: { available: true, pass: false, chase: true, liquidityPass: true, averageDollarVolume20: 500_000_000 },
  } : {}),
);
applied = applyC1ProductionPolicy(legacyTimingConflictRows, ready);
assert(applied.find((row) => row.symbol === ready.candidates[0].symbol).finalDecision.action === "Buy", "an obsolete V11 timing label must not override C1's tested momentum and opening-gap entry contract");

applied = applyC1ProductionPolicy(ready.candidates.map(liveRow), { ...ready, status: "stale" });
assert(applied.every((row) => !["Strong Buy", "Buy"].includes(row.finalDecision.action)), "a stale C1 snapshot must fail closed");

applied = applyC1ProductionPolicy(
  ready.candidates.map((candidate, index) =>
    liveRow(candidate, index === 0 ? {
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 100_000_000 },
    } : {}),
  ),
  ready,
);
assert(applied.find((row) => row.symbol === ready.candidates[0].symbol).finalDecision.action === "Watch", "a candidate below the $300 million liquidity floor must not receive capital");

let lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "S10", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", selected: false, researchRank: 10 } },
  position: { role: "Swing", openedAt: "2026-07-01T12:00:00.000Z", gainLossPct: 2 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-09-04T15:00:00.000Z"),
});
assert(lifecycle?.action === "Exit" && lifecycle.source === "c1-production-rank-deterioration", "a mature holding outside rank nine must exit");

lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "LEGACY", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", selected: false, researchRank: null } },
  position: { role: "Swing", openedAt: "2026-08-31T12:00:00.000Z", gainLossPct: 1 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-09-05T15:00:00.000Z"),
});
assert(C1_PRODUCTION_ACTIVATION_DAY === "2026-09-04" && lifecycle?.source === "c1-legacy-transition-exit", "a pre-C1 Swing outside the selected portfolio must exit without receiving a retroactive 30-session hold");

lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "LOSS" },
  position: { role: "Swing", openedAt: "2026-09-01T12:00:00.000Z", gainLossPct: -14.1 },
  now: new Date("2026-09-04T15:00:00.000Z"),
});
assert(lifecycle?.source === "c1-production-catastrophic-stop", "the 14% position stop must apply before the hold clock");

lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "MSTR" },
  position: { role: "Core", gainLossPct: -30 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready" },
  now: new Date("2026-09-04T15:00:00.000Z"),
});
assert(lifecycle === null, "MSTR Core must remain outside C1 lifecycle advice");

let drawdown = c1DrawdownControl({ swingEquity: 100_000, state: {}, now: new Date("2026-09-01T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 100 && drawdown.state.highWater === 100_000, "the live drawdown ledger must initialize at current Swing equity");
drawdown = c1DrawdownControl({ swingEquity: 87_900, state: drawdown.state, now: new Date("2026-09-02T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 0 && drawdown.state.triggerDay, "a 12% drawdown must trigger the full-cash phase");
drawdown = c1DrawdownControl({ swingEquity: 90_000, state: drawdown.state, now: new Date("2026-09-17T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 50 && drawdown.cooldown, "the two 10-session sleeves must reactivate before the 15-session sleeve");
drawdown = c1DrawdownControl({ swingEquity: 92_000, state: drawdown.state, now: new Date("2026-09-24T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 100 && !drawdown.cooldown && drawdown.state.highWater === 92_000, "all sleeves must reactivate after 15 sessions with a reset high-water mark");

const top5 = fs.readFileSync("pages/api/top5.js", "utf8");
assert(top5.includes("c1_active_swing") && top5.includes("$300 million"), "the live route must identify C1 and its liquidity contract");
const manifest = fs.readFileSync("lib/releaseManifest.js", "utf8");
assert(manifest.includes('release:"2026-09-05-c1-mobile-resilience"'), "the release manifest must identify the C1 mobile-resilience release");

console.log("C1 PRODUCTION POLICY PASS: momentum rank, 25/50/25 sleeves, three-position selection, liquidity floor, MSTR exclusion, rank-nine lifecycle, 14% stop, stateful 10/15-session drawdown cooldown, and fail-closed behavior verified");
