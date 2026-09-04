require("./c1-production-policy-regression.cjs");
process.exit(0);

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
      pass: true,
      chase: false,
      liquidityPass: true,
    },
    finalDecision: { action: "Buy", reason: "independent buy result" },
    ...overrides,
  };
}

const readySnapshot = {
  ...snapshot,
  status: "ready",
  independentlyValidated: true,
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
  applied.find((row) => row.symbol === "S03").finalDecision.priority ===
      "Best Opportunity" &&
    applied.find((row) => row.symbol === "S04").finalDecision.priority ===
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
  actionable.every((row) => row.entryTiming?.pass === true),
  "a ranking overlay must never manufacture a Buy when current entry timing fails",
);
assert(
  applied.find((row) => row.symbol === "S02").finalDecision.action === "Watch" &&
    applied.find((row) => row.symbol === "S02").productionPolicy.gate.checks
      .timingAvailable === true,
  "a source-session timing fallback that does not pass must fail closed",
);
assert(
  applied.find((row) => row.symbol === "S15").finalDecision.action === "Watch",
  "a ranked independent Watch must never be upgraded to Buy",
);

const contradictionRows = readySnapshot.candidates.slice(0, 2).map(liveRow);
contradictionRows[0].finalDecision = {
  action: "Watch",
  reason: "independent assessment is Watch",
};
contradictionRows[1].entryTiming.pass = false;
const contradictionApplied = applyV11ProductionPolicy(
  contradictionRows,
  readySnapshot,
);
assert(
  contradictionApplied.every(
    (row) =>
      row.finalDecision.action === "Watch" &&
      row.productionPolicy.selected === false &&
      row.finalDecision.capitalConfirmed === false,
  ),
  "Watch recommendations and failed entry timing must remain non-actionable even when highly ranked",
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

applied = applyV11ProductionPolicy(
  [
    {
      ...liveRow(snapshot.candidates[0]),
      finalDecision: { action: "Buy", reason: "independent buy" },
      entryTiming: { available: true, pass: false, chase: false, liquidityPass: true },
    },
  ],
  { ...readySnapshot, independentlyValidated: false },
);
assert(
  applied[0].finalDecision.action === "Watch" &&
    applied[0].productionPolicy.status === "suspended-failed-validation",
  "an unvalidated ranked policy must have no live Buy authority even when its snapshot is operationally ready",
);

applied = applyV11ProductionPolicy(
  readySnapshot.candidates.slice(0, 5).map((candidate, index) =>
    liveRow(candidate, {
      capitalScore: 90 - index,
      finalDecision: {
        action: index === 0 ? "Strong Buy" : "Buy",
        reason: `independent setup ${index + 1}`,
        relativeCapitalScore: 90 - index,
      },
    }),
  ),
  { ...readySnapshot, independentlyValidated: false },
);
const pilots = applied.filter((row) => row.productionPolicy.pilot === true);
assert(
  pilots.length === 3 &&
    pilots.every(
      (row) =>
        ["Strong Buy", "Buy"].includes(row.finalDecision.action) &&
        row.productionPolicy.selected === false &&
        row.productionPolicy.status === "limited-pilot" &&
        row.finalDecision.size === "Pilot Max 1%",
    ),
  "an unvalidated V11 rank may expose at most three independent, operationally cleared limited pilots without gaining selection authority",
);
assert(
  applied.filter((row) => ["Strong Buy", "Buy"].includes(row.finalDecision.action)).length === 3,
  "independent limited-pilot mode must demote every actionable name beyond the three-name cap",
);

const top5 = fs.readFileSync("pages/api/top5.js", "utf8");
assert(
  top5.includes("applyV11ProductionPolicy") &&
    top5.includes("getV11ProductionSnapshot") &&
    top5.includes("independent_confirmation_fail_closed") &&
    top5.includes("independent_limited_pilot"),
  "the live Opportunities route must distinguish the bounded pilot from the fail-closed state",
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

const releaseManifest = fs.readFileSync("lib/releaseManifest.js", "utf8");
assert(
  releaseManifest.includes('release:"2026-09-01-v11-setup-tolerance"'),
  "Nasdaq R11 research must not rename or replace the frozen V11 production release",
);
for (const productionPath of [
  "lib/v11ProductionPolicy.js",
  "lib/v11ProductionSnapshot.js",
  "pages/api/top5.js",
]) {
  const productionSource = fs.readFileSync(productionPath, "utf8");
  assert(
    !/pit-nasdaq|NasdaqR11|productionCandidateVersion:\s*["']V21/i.test(
      productionSource,
    ),
    `Nasdaq R11 research must remain unreachable from ${productionPath}`,
  );
}
const nasdaqR11Route = fs.readFileSync(
  "pages/api/research/pit-nasdaq-alpha-parallel-r11.js",
  "utf8",
);
assert(
  nasdaqR11Route.includes('researchGeneration: "R11"') &&
    nasdaqR11Route.includes('productionCandidateVersion: "V21"') &&
    nasdaqR11Route.includes("productionChanged: false") &&
    nasdaqR11Route.includes("eligibleForAlphaClaim: false") &&
    nasdaqR11Route.includes("eligibleForLiveCapital: false"),
  "every fail-closed Nasdaq R11 route response must identify research-only V21 and deny production, alpha, and live-capital authority",
);

console.log(
  "V11 PRODUCTION POLICY PASS: independent Buy confirmation, entry-timing confirmation, strict Strong Buy preservation, exact audited weights, twelve-target ceiling, and fail-closed behavior are verified",
);
