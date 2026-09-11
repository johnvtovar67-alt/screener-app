require("./c1-execution-reconciliation-regression.cjs");
require("./c1-combined-portfolio-regression.cjs");
require("./c1-paper-events-regression.cjs");
require("./c1-presentation-regression.cjs");
require("./c1-service-equivalence-regression.cjs");
require("./c1-pending-decisions-regression.cjs");
require("./c1-execution-adapter-regression.cjs");
require("./brokerage-reconciliation-regression.cjs");
require("./c1-holdings-comparison-regression.cjs");
const fs = require("fs");
require("./c1-sleeve-accounting-regression.cjs");
require("./c1-historical-ledger-regression.cjs");
require("./c1-forward-model-regression.cjs");
require("./c1-input-archive-regression.cjs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(`C1 PRODUCTION POLICY FAILURE: ${message}`);
};

const loader = createResearchModuleLoader(process.cwd());
const policySource = fs.readFileSync("lib/v11ProductionPolicy.js", "utf8");
assert(
  policySource.includes("V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS = 0"),
  "rank snapshots must match the latest completed session",
);
const policy = loader.load("lib/v11ProductionPolicy.js");
const frozen = loader.load("lib/c1FrozenOptions.js").C1_FROZEN_OPTIONS.base;
assert(policy.V11_PRODUCTION_EXIT_RANK === frozen.rankedExitBuffer, "retention rank must match the tested model");
assert(policy.V11_PRODUCTION_MAX_SECTOR_POSITIONS === frozen.maxSectorPositions, "sector name limit must match the tested sleeve");
assert(policy.V11_PRODUCTION_MAX_POSITION_PCT === frozen.buyMaxPositionPct * 100, "position ceiling must match the tested sleeve");
const { c1DrawdownControl, portfolioCompositionSignature } = loader.load("lib/portfolioGovernor.js");
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
assert(snapshot.activationAuthorized === false, "unvalidated C1 must not claim full-size activation authority");
assert(snapshot.independentlyValidated === false, "C1 must remain explicitly unvalidated until every promotion gate passes");
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
    eventRisk: { status: "Passed", blockNewCapital: false, checkComplete: true, manualCheckRequired: false },
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
assert(buys.length === 0, "an unvalidated C1 rank must not manufacture actionable entries");
assert(applied.every((row) => !row.productionPolicy.selected), "an unvalidated C1 rank must not claim selection authority");
assert(applied.every((row) => row.productionPolicy.activationAuthorized === false), "effective row metadata must revoke stale full-size authorization");
assert(applied.every((row) => row.productionPolicy.targetWeightPct === 0), "a suspended policy must advertise no live allocation target");
assert(applied.every((row) => row.productionPolicy.evidenceStatus === "provisional-post-selection-development-candidate"), "unvalidated evidence must never retain a legacy qualified label");

const independentlyActionable = ready.candidates.map((candidate, index) =>
  liveRow(candidate, {
    capitalScore: 90 - index,
    finalDecision: {
      action: index < 5 ? "Buy" : "Watch",
      reason: `independent setup ${index + 1}`,
      relativeCapitalScore: 90 - index,
    },
  }),
);
applied = applyC1ProductionPolicy(independentlyActionable, ready);
buys = applied.filter((row) => ["Strong Buy", "Buy"].includes(row.finalDecision.action));
assert(buys.length === 3, "the bounded pilot must expose at most three independently actionable names");
assert(buys.every((row) => row.productionPolicy.pilot && !row.productionPolicy.selected), "pilot names must never be relabeled as validated policy selections");
assert(buys.every((row) => row.productionPolicy.status === "limited-pilot" && row.finalDecision.size === "Pilot Max 1%"), "every actionable pilot must carry the explicit 1% cap");
assert(buys.every((row) => row.productionPolicy.targetWeightPct === 1 && row.productionPolicy.activationAuthorized === false), "pilot metadata must expose only the 1% cap and no full-size authority");

applied = applyC1ProductionPolicy(
  ready.candidates.map((candidate, index) =>
    liveRow(candidate, index === 0 ? {
      eventRisk: {},
      finalDecision: { action: "Buy", reason: "independent setup" },
    } : {}),
  ),
  ready,
);
assert(applied.find((row) => row.symbol === ready.candidates[0].symbol).finalDecision.action === "Watch" && applied.find((row) => row.symbol === ready.candidates[0].symbol).productionPolicy.pilot === false, "missing event verification must fail closed instead of admitting a pilot");

const legacyTimingConflictRows = ready.candidates.map((candidate, index) =>
  liveRow(candidate, index === 0 ? {
    finalDecision: { action: "Buy", reason: "independent setup" },
    entryTiming: { available: true, pass: false, chase: true, liquidityPass: true, averageDollarVolume20: 500_000_000 },
  } : {}),
);
applied = applyC1ProductionPolicy(legacyTimingConflictRows, ready);
assert(applied.find((row) => row.symbol === ready.candidates[0].symbol).productionPolicy.pilot === true, "an independently actionable name may enter only the bounded pilot path");

applied = applyC1ProductionPolicy(independentlyActionable, { ...ready, status: "stale" });
assert(applied.every((row) => !["Strong Buy", "Buy"].includes(row.finalDecision.action)), "a stale C1 snapshot must fail closed");

applied = applyC1ProductionPolicy(
  ready.candidates.map((candidate, index) =>
    liveRow(candidate, index === 0 ? {
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 100_000_000 },
      finalDecision: { action: "Buy", reason: "independent setup" },
    } : {}),
  ),
  ready,
);
assert(applied.find((row) => row.symbol === ready.candidates[0].symbol).finalDecision.action === "Watch" && applied.find((row) => row.symbol === ready.candidates[0].symbol).productionPolicy.pilot === false, "a candidate below the $300 million liquidity floor must not receive pilot capital");

let lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "S7", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true, selected: false, researchRank: 7 } },
  position: { role: "Swing", openedAt: "2026-07-01T12:00:00.000Z", gainLossPct: 2 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true },
  now: new Date("2026-09-04T15:00:00.000Z"),
});
assert(lifecycle?.action === "Exit" && lifecycle.source === "c1-production-rank-deterioration", "rank seven must trigger the tested top-six retention rule");

lifecycle = c1ProductionPositionLifecycle({
  stock: { symbol: "LEGACY", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true, selected: false, researchRank: null } },
  position: { role: "Swing", openedAt: "2026-08-31T12:00:00.000Z", gainLossPct: 1 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true },
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
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true },
  now: new Date("2026-09-04T15:00:00.000Z"),
});
assert(lifecycle === null, "MSTR Core must remain outside C1 lifecycle advice");

// Missing, suspended, or conflicting receipts must never fall through to
// the legacy portfolio model, even when a stale row still says ready.
for (const policy of [{}, { id: C1_PRODUCTION_POLICY_ID, status: "ready" },
  { id: C1_PRODUCTION_POLICY_ID, status: "suspended", independentlyValidated: true, activationAuthorized: false }]) {
  const result = c1ProductionPositionLifecycle({
    stock: { symbol: "FCX", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true, researchRank: 9 } },
    position: { role: "Swing", openedAt: "2026-07-01", gainLossPct: 1 },
    policy, now: new Date("2026-09-10T21:00:00Z"),
  });
  assert(result?.action === "Review" && result.source === "c1-portfolio-authority-unavailable", "unverified global authority must block legacy fallback and rank exits");
}
const conflictingRow = c1ProductionPositionLifecycle({
  stock: { symbol: "STX", productionPolicy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", activationAuthorized: false } },
  position: { role: "Swing", gainLossPct: -2 },
  policy: { id: C1_PRODUCTION_POLICY_ID, status: "ready", independentlyValidated: true, activationAuthorized: true },
});
assert(conflictingRow?.action === "Review", "global authority cannot override an unauthorized holding receipt");

const originalComposition = portfolioCompositionSignature([{ symbol: "CASH", shares: 25_000, role: "Swing" }, { symbol: "NTRA", shares: 230, role: "Swing" }]);
const changedComposition = portfolioCompositionSignature([{ symbol: "CASH", shares: 12_000, role: "Swing" }, { symbol: "NTRA", shares: 100, role: "Swing" }, { symbol: "FCX", shares: 170, role: "Swing" }]);
let drawdown = c1DrawdownControl({ swingEquity: 100_000, state: {}, portfolioSignature: originalComposition, now: new Date("2026-09-01T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 100 && drawdown.state.highWater === 100_000, "the live drawdown ledger must initialize at current Swing equity");
drawdown = c1DrawdownControl({ swingEquity: 87_900, state: drawdown.state, portfolioSignature: originalComposition, now: new Date("2026-09-02T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 0 && drawdown.state.triggerDay, "a 12% drawdown must trigger the full-cash phase");
drawdown = c1DrawdownControl({ swingEquity: 90_000, state: drawdown.state, portfolioSignature: originalComposition, now: new Date("2026-09-17T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 50 && drawdown.cooldown, "the two 10-session sleeves must reactivate before the 15-session sleeve");
drawdown = c1DrawdownControl({ swingEquity: 92_000, state: drawdown.state, portfolioSignature: originalComposition, now: new Date("2026-09-24T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 100 && !drawdown.cooldown && drawdown.state.highWater === 92_000, "all sleeves must reactivate after 15 sessions with a reset high-water mark");

drawdown = c1DrawdownControl({ swingEquity: 70_000, state: { version: 2, highWater: 100_000, triggerDay: null, portfolioSignature: originalComposition }, portfolioSignature: changedComposition, now: new Date("2026-09-02T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 0 && !drawdown.cooldown && drawdown.reconciliationRequired && drawdown.state.highWater === 100_000, "unclassified capital changes must preserve loss history without generating an exit");
drawdown = c1DrawdownControl({ swingEquity: 70_000, state: { highWater: 100_000, triggerDay: "2026-09-02" }, portfolioSignature: changedComposition, now: new Date("2026-09-02T20:00:00.000Z") });
assert(drawdown.activeCapitalPct === 0 && !drawdown.cooldown && drawdown.reconciliationRequired && drawdown.state.triggerDay === "2026-09-02", "legacy history must remain unresolved rather than silently reset");

const top5 = fs.readFileSync("pages/api/top5.js", "utf8");
assert(top5.includes("independent_limited_pilot") && top5.includes("pilotRequiresTwoSessionPersistence") && top5.includes("$300 million"), "the live route must identify the bounded pilot and its liquidity contract");
const manifest = fs.readFileSync("lib/releaseManifest.js", "utf8");
assert(manifest.includes('release:"2026-09-05-c1-mobile-resilience"'), "the release manifest must identify the C1 mobile-resilience release");

console.log("C1 PRODUCTION POLICY PASS: unvalidated rank has no full-size authority; three-name, 1%, two-session pilot, liquidity floor, lifecycle, drawdown control, and fail-closed behavior verified");
require("./c1-decision-snapshot-regression.cjs");
