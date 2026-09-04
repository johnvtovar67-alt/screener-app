import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  simulatePointInTimePortfolio,
  slicePointInTimePortfolioRun,
} from "../lib/walkForwardBacktest.js";

const dataDirectory = process.argv[2];
const outputPath = process.argv[3];
const manifest = JSON.parse(readFileSync(join(dataDirectory, "manifest.json"), "utf8"));
const sessions = readdirSync(join(dataDirectory, "chunks"))
  .filter((name) => name.endsWith(".json.gz"))
  .sort()
  .flatMap((name) =>
    JSON.parse(gunzipSync(readFileSync(join(dataDirectory, "chunks", name)))).sessions,
  );
const dataset = { metadata: manifest.datasetMetadata, sessions };
const windows = [
  { start: "2023-01-04", end: "2023-07-06" },
  { start: "2023-07-07", end: "2024-01-04" },
  { start: "2024-01-05", end: "2024-07-08" },
  { start: "2024-07-09", end: "2025-01-06" },
  { start: "2025-01-07", end: "2025-07-10" },
  { start: "2025-07-11", end: "2026-01-08" },
  { start: "2026-01-09", end: "2026-07-13" },
  { start: "2026-07-14", end: "2026-09-01" },
];

const base = {
  researchSignalSource: "price-only", independentLifecycle: true,
  ignoreSignalPositionActions: true, exitOnUniverseRemoval: true,
  benchmarkSymbols: ["SPY", "QQQ"], benchmarkCompletionSymbol: null,
  liquidateAtEnd: true, requireLiquidityPass: true,
  minimumAverageDollarVolume: 300_000_000, minimumPrice: 5,
  slippageBps: 12, commissionPerOrder: 0, requireEntryTimingPass: false,
  requireTrendAlignment: false, requireRelativeStrength: false,
  minimumResearchFactorCoverage: 0, blockChaseEntries: false,
  maxEntryGapPct: 3, selectionMode: "ranked", minimumQualifiedSessions: 1,
  maxIssuerPositions: 1, classifyStopExits: true, ratchetRiskPlanStop: false,
  blockedSymbols: ["MSTR"],
  timeStopMaxReturnPct: 1_000, timeStopSessions: 252,
  maxVolatility60Pct: 100, volatilityTargetPct: null, riskBudgetPct: null,
  baseRankWeight: 0, researchRankMode: "price-pattern",
  rankedTargetCount: 3, rankedExitBuffer: 6, rankedEntryQueueCount: 9,
  rankedMinimumHoldSessions: 15, rankedRebalanceSessions: 5,
  buyTargetPct: .33, strongBuyTargetPct: .33,
  buyMaxPositionPct: 1 / 3, strongBuyMaxPositionPct: 1 / 3,
  buyMaxFactorPct: 1, strongBuyMaxFactorPct: 1, maxPositions: 3,
  maxSectorPositions: 3, maxSectorPct: 1,
  minimumInitialStopPct: 14, maximumInitialStopPct: 14,
  pricePatternWeights: { return120Ex20:.18, return60Ex5:.36, return20:.16,
    return5:-.12, volatility60Pct:-.10, alpha60VsSpy:.12,
    alpha60VsQqq:.18, controlledPullbackScore:.06 },
};

function target(count) {
  return { rankedTargetCount: count, rankedExitBuffer: count * 2,
    rankedEntryQueueCount: count * 3, buyTargetPct: .99 / count,
    strongBuyTargetPct: .99 / count, buyMaxPositionPct: 1 / count,
    strongBuyMaxPositionPct: 1 / count, maxPositions: count,
    maxSectorPositions: count };
}
const riskVariants = [
  ["base",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20}],
  ["dd8-c5",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:8,portfolioDrawdownCooldownSessions:5}],
  ["dd8-c10",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:8,portfolioDrawdownCooldownSessions:10}],
  ["dd8-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:8,portfolioDrawdownCooldownSessions:20}],
  ["dd8-c40",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:8,portfolioDrawdownCooldownSessions:40}],
  ["dd10-c5",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:10,portfolioDrawdownCooldownSessions:5}],
  ["dd10-c10",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:10,portfolioDrawdownCooldownSessions:10}],
  ["dd10-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:10,portfolioDrawdownCooldownSessions:20}],
  ["dd10-c40",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:10,portfolioDrawdownCooldownSessions:40}],
  ["dd12-c5",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:5}],
  ["dd12-c10",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:10}],
  ["dd12-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:20}],
  ["dd12-c40",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:40}],
  ["dd15-c10",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:15,portfolioDrawdownCooldownSessions:10}],
  ["dd15-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:15,portfolioDrawdownCooldownSessions:20}],
  ["dd15-c40",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:15,portfolioDrawdownCooldownSessions:40}],
  ["dd18-c10",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:18,portfolioDrawdownCooldownSessions:10}],
  ["dd18-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:18,portfolioDrawdownCooldownSessions:20}],
  ["dd20-c20",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:20,portfolioDrawdownCooldownSessions:20}],
  ["dd10-c10-trail",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:10,portfolioDrawdownCooldownSessions:10,profitTrailActivationPct:15,profitTrailDistancePct:8}],
  ["dd12-c10-trail",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:10,profitTrailActivationPct:15,profitTrailDistancePct:8}],
  ["dd12-c20-trail",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:12,portfolioDrawdownCooldownSessions:20,profitTrailActivationPct:15,profitTrailDistancePct:8}],
  ["dd15-c10-trail",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:15,portfolioDrawdownCooldownSessions:10,profitTrailActivationPct:15,profitTrailDistancePct:8}],
  ["dd15-c20-trail",{rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,portfolioDrawdownStopPct:15,portfolioDrawdownCooldownSessions:20,profitTrailActivationPct:15,profitTrailDistancePct:8}],
];
const candidate = {
  rankedRebalanceSessions: 10,
  rankedMinimumHoldSessions: 20,
  portfolioDrawdownStopPct: 15,
  portfolioDrawdownCooldownSessions: 10,
};
const breadthCandidate = {
  ...candidate,
  maxSectorPositions:2,
  maxSectorPct:.5,
};
const scaledWeights = (key, scale) => ({
  ...base.pricePatternWeights,
  [key]: base.pricePatternWeights[key] * scale,
});
const robustnessVariants = [
  ["candidate", candidate],
  ...[8, 12, 15].map((value) => [`rebalance-${value}`, {...candidate, rankedRebalanceSessions:value}]),
  ...[15, 25, 30].map((value) => [`hold-${value}`, {...candidate, rankedMinimumHoldSessions:value}]),
  ...[25, 50].map((value) => [`slippage-${value}`, {...candidate, slippageBps:value}]),
  ...[500_000_000, 1_000_000_000].map((value) => [`adv-${value}`, {...candidate, minimumAverageDollarVolume:value}]),
  ...[1, 5].map((value) => [`entry-gap-${value}`, {...candidate, maxEntryGapPct:value}]),
  ...[2, 4, 5].map((value) => [`positions-${value}`, {...candidate, ...target(value)}]),
  ...Object.keys(base.pricePatternWeights).flatMap((key) => [0.8, 1.2].map((scale) => [
    `weight-${key}-${scale}`,
    {...candidate, pricePatternWeights:scaledWeights(key, scale)},
  ])),
];
const breadthRobustnessVariants = [
  ["candidate",breadthCandidate],
  ...[8,9,11,12,15].map((value)=>[`rebalance-${value}`,{...breadthCandidate,rankedRebalanceSessions:value}]),
  ...[15,18,22,25,30].map((value)=>[`hold-${value}`,{...breadthCandidate,rankedMinimumHoldSessions:value}]),
  ...[25,50].map((value)=>[`slippage-${value}`,{...breadthCandidate,slippageBps:value}]),
  ...[500_000_000,1_000_000_000].map((value)=>[`adv-${value}`,{...breadthCandidate,minimumAverageDollarVolume:value}]),
  ...[1,5].map((value)=>[`entry-gap-${value}`,{...breadthCandidate,maxEntryGapPct:value}]),
  ...[.4,.6].map((value)=>[`sector-pct-${value}`,{...breadthCandidate,maxSectorPct:value}]),
  ["sector-count-1",{...breadthCandidate,maxSectorPositions:1}],
  ...[12,18].map((value)=>[`drawdown-${value}`,{...breadthCandidate,portfolioDrawdownStopPct:value}]),
  ...[5,15,20].map((value)=>[`cooldown-${value}`,{...breadthCandidate,portfolioDrawdownCooldownSessions:value}]),
  ...[20,25,30,35,40].map((value)=>[`volatility-${value}`,{...breadthCandidate,volatilityTargetPct:value}]),
  ...[1.25,1.5,1.75,2].map((value)=>[`risk-${value}`,{...breadthCandidate,riskBudgetPct:value}]),
  ...Object.keys(base.pricePatternWeights).flatMap((key)=>[.8,1.2].map((scale)=>[
    `weight-${key}-${scale}`,
    {...breadthCandidate,pricePatternWeights:scaledWeights(key,scale)},
  ])),
];
const phaseVariants = Array.from({length:10},(_,offset)=>[
  `phase-${offset}`,
  {...breadthCandidate,rankedRebalanceOffsetSessions:offset},
]);
const gridModes = [
  ["momentum", {researchRankMode:"momentum-only"}],
  ["quality", {researchRankMode:"quality-only"}],
  ["pullback", {researchRankMode:"bull-cycle-pullback-control"}],
  ["quality-momentum", {researchRankMode:"quality-momentum-leadership"}],
  ["momentum-dominant", {researchRankMode:"momentum-dominant-quality-blend"}],
  ["durable", {researchRankMode:"durable-quality-momentum"}],
  ["momentum-first", {researchRankMode:"momentum-first-entry-disciplined-blend"}],
  ["price-pattern", {researchRankMode:"price-pattern"}],
  ["residual-path", {
    researchRankMode:"nasdaq-residual-path-quality",
    nasdaqResidualPathWeights:{relative120:.32,relative60:.12,continuity:.2,
      accelerationRestraint:.08,lotteryRestraint:.08,lowVolatility:.06,
      drawdownResilience:.08,anchor:.06},
  }],
];
const dailyModes = gridModes.filter(([mode])=>
  ["momentum","price-pattern","residual-path"].includes(mode) &&
  (!process.env.DAILY_MODE || process.env.DAILY_MODE===mode));
const dailyGridVariants = dailyModes.flatMap(([mode,modeOverrides])=>
  [3,4,5,6].flatMap((count)=>
    [2,3].flatMap((bufferMultiple)=>
      [10,20,30].flatMap((hold)=>
        [12,15,18].map((drawdown)=>[
          `${mode}-n${count}-b${bufferMultiple}-h${hold}-dd${drawdown}`,
          {
            ...modeOverrides,...target(count),
            rankedRebalanceSessions:1,
            rankedExitBuffer:count*bufferMultiple,
            rankedMinimumHoldSessions:hold,
            portfolioDrawdownStopPct:drawdown,
            portfolioDrawdownCooldownSessions:10,
            maxSectorPositions:2,
            maxSectorPct:count<=4?.5:.4,
          },
        ]),
      ),
    ),
  ),
);
const dailyCandidate = {
  researchRankMode:"momentum-only",
  ...target(3),
  rankedRebalanceSessions:1,
  rankedExitBuffer:9,
  rankedMinimumHoldSessions:30,
  portfolioDrawdownStopPct:12,
  portfolioDrawdownCooldownSessions:10,
  maxSectorPositions:2,
  maxSectorPct:.5,
};
const dailyRobustnessVariants = [
  ["candidate",dailyCandidate],
  ...[7,8,10,11,12].map((value)=>[`buffer-${value}`,{...dailyCandidate,rankedExitBuffer:value}]),
  ...[20,25,35,40].map((value)=>[`hold-${value}`,{...dailyCandidate,rankedMinimumHoldSessions:value}]),
  ...[10,14,15].map((value)=>[`drawdown-${value}`,{...dailyCandidate,portfolioDrawdownStopPct:value}]),
  ...[5,15,20].map((value)=>[`cooldown-${value}`,{...dailyCandidate,portfolioDrawdownCooldownSessions:value}]),
  ...[25,50].map((value)=>[`slippage-${value}`,{...dailyCandidate,slippageBps:value}]),
  ...[500_000_000,1_000_000_000].map((value)=>[`adv-${value}`,{...dailyCandidate,minimumAverageDollarVolume:value}]),
  ...[1,5].map((value)=>[`entry-gap-${value}`,{...dailyCandidate,maxEntryGapPct:value}]),
  ...[.4,.6].map((value)=>[`sector-pct-${value}`,{...dailyCandidate,maxSectorPct:value}]),
  ["sector-count-1",{...dailyCandidate,maxSectorPositions:1}],
  ...[12,16].map((value)=>[`stop-${value}`,{...dailyCandidate,minimumInitialStopPct:value,maximumInitialStopPct:value}]),
  ...[30,40].map((value)=>[`volatility-${value}`,{...dailyCandidate,volatilityTargetPct:value}]),
  ["positions-4",{...dailyCandidate,...target(4),rankedExitBuffer:12,maxSectorPositions:2,maxSectorPct:.5}],
];
const crossUniverseSurvivors = [
  ["momentum-buffer6-hold30",{...dailyCandidate,rankedExitBuffer:6}],
  ["momentum-buffer9-hold30",dailyCandidate],
  ["price-buffer6-hold10",{...dailyCandidate,researchRankMode:"price-pattern",
    rankedExitBuffer:6,rankedMinimumHoldSessions:10}],
];
const jointBase = {...dailyCandidate,rankedExitBuffer:6};
const jointStabilizers = [
  ["base",jointBase],
  ["sector1",{...jointBase,maxSectorPositions:1}],
  ["sector40",{...jointBase,maxSectorPct:.4}],
  ["drawdown10",{...jointBase,portfolioDrawdownStopPct:10}],
  ["drawdown14",{...jointBase,portfolioDrawdownStopPct:14}],
  ["cooldown5",{...jointBase,portfolioDrawdownCooldownSessions:5}],
  ["cooldown15",{...jointBase,portfolioDrawdownCooldownSessions:15}],
  ["cooldown20",{...jointBase,portfolioDrawdownCooldownSessions:20}],
  ["risk15",{...jointBase,riskBudgetPct:1.5}],
  ["risk175",{...jointBase,riskBudgetPct:1.75}],
  ["risk20",{...jointBase,riskBudgetPct:2}],
  ["vol30",{...jointBase,volatilityTargetPct:30}],
  ["vol40",{...jointBase,volatilityTargetPct:40}],
  ["stop16",{...jointBase,minimumInitialStopPct:16,maximumInitialStopPct:16}],
];
const ensembleComponents = [
  ["base",jointBase],
  ["sector40",{...jointBase,maxSectorPct:.4}],
  ["risk20",{...jointBase,riskBudgetPct:2}],
  ["cooldown15",{...jointBase,portfolioDrawdownCooldownSessions:15}],
  ["cooldown20",{...jointBase,portfolioDrawdownCooldownSessions:20}],
  ["drawdown14",{...jointBase,portfolioDrawdownStopPct:14}],
];
const ensemblePlaceboComponents = [
  ["base",jointBase],
  ["cooldown15",{...jointBase,portfolioDrawdownCooldownSessions:15}],
  ["sector40",{...jointBase,maxSectorPct:.4}],
];
const ensembleRobustnessComponents = [
  ["base-12bps",jointBase],
  ["cooldown15-12bps",{...jointBase,portfolioDrawdownCooldownSessions:15}],
  ["sector40-12bps",{...jointBase,maxSectorPct:.4}],
  ["base-25bps",{...jointBase,slippageBps:25}],
  ["cooldown15-25bps",{...jointBase,portfolioDrawdownCooldownSessions:15,slippageBps:25}],
  ["sector40-25bps",{...jointBase,maxSectorPct:.4,slippageBps:25}],
  ["base-50bps",{...jointBase,slippageBps:50}],
  ["cooldown15-50bps",{...jointBase,portfolioDrawdownCooldownSessions:15,slippageBps:50}],
  ["sector40-50bps",{...jointBase,maxSectorPct:.4,slippageBps:50}],
  ["base-adv1b",{...jointBase,minimumAverageDollarVolume:1_000_000_000}],
  ["cooldown15-adv1b",{...jointBase,portfolioDrawdownCooldownSessions:15,minimumAverageDollarVolume:1_000_000_000}],
  ["sector40-adv1b",{...jointBase,maxSectorPct:.4,minimumAverageDollarVolume:1_000_000_000}],
];
const gridVariants = gridModes.flatMap(([mode, modeOverrides]) =>
  [4, 6].flatMap((count) =>
    [10, 15].flatMap((rebalance) =>
      [10, 15, 20].map((drawdown) => [
        `${mode}-n${count}-r${rebalance}-dd${drawdown}`,
        {
          ...modeOverrides,
          ...target(count),
          rankedRebalanceSessions:rebalance,
          rankedMinimumHoldSessions:20,
          portfolioDrawdownStopPct:drawdown,
          portfolioDrawdownCooldownSessions:10,
        },
      ]),
    ),
  ),
);
const entryFilters = [
  ["trend", {requireTrendAlignment:true}],
  ["relative", {requireRelativeStrength:true}],
  ["trend-relative", {requireTrendAlignment:true,requireRelativeStrength:true}],
  ["timing", {requireEntryTimingPass:true}],
  ["chase", {blockChaseEntries:true}],
  ["vol60", {maxVolatility60Pct:60}],
  ["vol45", {maxVolatility60Pct:45}],
  ["trend-vol60", {requireTrendAlignment:true,maxVolatility60Pct:60}],
];
const filterGridVariants = gridModes.flatMap(([mode, modeOverrides]) =>
  [4, 6].flatMap((count) => entryFilters.map(([filter, filterOverrides]) => [
    `${mode}-n${count}-${filter}`,
    {
      ...modeOverrides,
      ...target(count),
      ...filterOverrides,
      rankedRebalanceSessions:10,
      rankedMinimumHoldSessions:20,
      portfolioDrawdownStopPct:15,
      portfolioDrawdownCooldownSessions:10,
    },
  ])),
);
const allocationModes = gridModes.filter(([mode]) =>
  ["momentum", "price-pattern", "residual-path"].includes(mode));
const allocationOverlays = [
  ["equal", {}],
  ["vol20", {volatilityTargetPct:20}],
  ["vol30", {volatilityTargetPct:30}],
  ["vol40", {volatilityTargetPct:40}],
  ["risk15", {riskBudgetPct:1.5}],
  ["risk20", {riskBudgetPct:2}],
  ["risk25", {riskBudgetPct:2.5}],
  ["vol30-risk20", {volatilityTargetPct:30,riskBudgetPct:2}],
  ["sector2", {maxSectorPositions:2,maxSectorPct:.4}],
  ["sector3", {maxSectorPositions:3,maxSectorPct:.45}],
  ["vol30-sector2", {volatilityTargetPct:30,maxSectorPositions:2,maxSectorPct:.4}],
  ["balanced", {volatilityTargetPct:30,riskBudgetPct:2,maxSectorPositions:2,maxSectorPct:.4}],
  ["adaptive", {rankedAdaptiveRebalanceEnabled:true,rankedAdaptiveTargetEnabled:true,
    rankedAdaptiveEqualWeightEnabled:true,rankedWeakBreadthThresholdPct:50,
    rankedWeakBreadthRebalanceSessions:5,rankedStrongBreadthRebalanceSessions:15,
    rankedWeakBreadthTargetCount:3}],
  ["adaptive-vol30", {rankedAdaptiveRebalanceEnabled:true,rankedAdaptiveTargetEnabled:true,
    rankedAdaptiveEqualWeightEnabled:true,rankedWeakBreadthThresholdPct:50,
    rankedWeakBreadthRebalanceSessions:5,rankedStrongBreadthRebalanceSessions:15,
    rankedWeakBreadthTargetCount:3,volatilityTargetPct:30}],
];
const allocationGridVariants = allocationModes.flatMap(([mode, modeOverrides]) =>
  [6, 8].flatMap((count) => allocationOverlays.map(([overlay, overlayOverrides]) => [
    `${mode}-n${count}-${overlay}`,
    {
      ...modeOverrides,
      ...target(count),
      ...overlayOverrides,
      rankedStrongBreadthTargetCount:count,
      rankedRebalanceSessions:10,
      rankedMinimumHoldSessions:20,
      portfolioDrawdownStopPct:15,
      portfolioDrawdownCooldownSessions:10,
    },
  ])),
);
const focusedOverlays = [
  ["equal", {}],
  ...[20,25,30,35,40].map((value)=>[`vol${value}`,{volatilityTargetPct:value}]),
  ...[1.25,1.5,1.75,2].map((value)=>[`risk${String(value).replace(".","")}`,{riskBudgetPct:value}]),
  ["sector1",{maxSectorPositions:1,maxSectorPct:.4}],
  ["sector2",{maxSectorPositions:2,maxSectorPct:.5}],
  ["vol25-risk15",{volatilityTargetPct:25,riskBudgetPct:1.5}],
  ["vol30-risk15",{volatilityTargetPct:30,riskBudgetPct:1.5}],
  ["vol25-sector1",{volatilityTargetPct:25,maxSectorPositions:1,maxSectorPct:.4}],
  ["vol30-sector1",{volatilityTargetPct:30,maxSectorPositions:1,maxSectorPct:.4}],
  ["balanced",{volatilityTargetPct:25,riskBudgetPct:1.5,maxSectorPositions:1,maxSectorPct:.4}],
];
const focusedGridVariants = [3,4,5].flatMap((count)=>
  [15,18,20].flatMap((drawdown)=>focusedOverlays.map(([overlay,overlayOverrides])=>[
    `price-n${count}-dd${drawdown}-${overlay}`,
    {
      researchRankMode:"price-pattern",
      ...target(count),...overlayOverrides,
      rankedRebalanceSessions:10,rankedMinimumHoldSessions:20,
      portfolioDrawdownStopPct:drawdown,portfolioDrawdownCooldownSessions:10,
    },
  ])),
);
const variants = process.env.CANDIDATE_ONLY
  ? [["candidate", candidate]]
  : process.env.BREADTH_CANDIDATE_ONLY
    ? [["price-n3-dd15-sector2", breadthCandidate]]
  : process.env.BREADTH_ROBUSTNESS
    ? breadthRobustnessVariants
  : process.env.PHASE_GRID
    ? phaseVariants
  : process.env.DAILY_GRID
    ? dailyGridVariants
  : process.env.DAILY_CANDIDATE_ONLY
    ? [["daily-momentum-candidate",dailyCandidate]]
  : process.env.DAILY_ROBUSTNESS
    ? dailyRobustnessVariants
  : process.env.CROSS_SET
    ? crossUniverseSurvivors
  : process.env.JOINT_GRID
    ? jointStabilizers
  : process.env.ENSEMBLE_COMPONENTS
    ? ensembleComponents
  : process.env.ENSEMBLE_PLACEBO
    ? ensemblePlaceboComponents
  : process.env.ENSEMBLE_ROBUSTNESS
    ? ensembleRobustnessComponents
  : process.env.FOCUSED_GRID
    ? focusedGridVariants
    : process.env.ALLOCATION_GRID
    ? allocationGridVariants
    : process.env.FILTER_GRID
    ? filterGridVariants
    : process.env.GRID
    ? gridVariants
    : process.env.ROBUSTNESS
    ? robustnessVariants
    : riskVariants;

const placeboSeeds = Math.max(0, Number(process.env.PLACEBO_SEEDS || 0));
const placeboSeedStart = Math.max(0, Number(process.env.PLACEBO_SEED_START || 0));
const candidateStatistic = Number(process.env.CANDIDATE_STATISTIC || 311.14);
const runVariants = placeboSeeds > 0
  ? Array.from({ length: placeboSeeds }, (_, seedIndex) => {
      const seed = placeboSeedStart + seedIndex;
      return (
      variants.map(([sourceVariant, overrides]) => ({
        id: `seed-${seed}-${sourceVariant}`,
        sourceVariant,
        seed,
        overrides: {
          ...overrides,
          researchRankMode: "random-placebo",
          researchRandomSeed: seed,
        },
      }))
      );
    },
    ).flat()
  : variants.map(([id, overrides]) => ({
      id,
      sourceVariant: id,
      seed: null,
      overrides,
    }));

const results = runVariants.map(({ id, sourceVariant, seed, overrides }, index) => {
  const run = simulatePointInTimePortfolio(dataset, { initialCapital:100_000,
    minimumTrade:750, ...base, ...overrides, thesisId:`risk-${id}`,
    thesisLabel:id, startDate:windows[0].start, endDate:windows.at(-1).end,
    ...(process.env.LIVE_SNAPSHOT ? {liquidateAtEnd:false} : {}),
  });
  const metric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const summary = (candidateRun) => ({
    returnPct:metric(candidateRun.metrics?.totalReturnPct),
    vsQqqPct:metric(candidateRun.metrics?.benchmarkComparisons?.QQQ?.excessReturnPct),
    vsSpyPct:metric(candidateRun.metrics?.benchmarkComparisons?.SPY?.excessReturnPct),
    sharpe:metric(candidateRun.metrics?.sharpe),
    drawdownPct:metric(candidateRun.metrics?.maxDrawdownPct),
    trades:metric(candidateRun.metrics?.closedTrades),
    exposurePct:metric(candidateRun.metrics?.averageActiveExposurePct),
    turnoverPct:metric(candidateRun.metrics?.annualizedTurnoverPct),
    breadthPct:metric((candidateRun.metrics?.rankRegimeDiagnostics?.observations||[]).reduce((sum,row)=>sum+Number(row.momentumBreadthPct||0),0)/Math.max(1,(candidateRun.metrics?.rankRegimeDiagnostics?.observations||[]).length)),
    medianMomentumPct:metric((candidateRun.metrics?.rankRegimeDiagnostics?.observations||[]).reduce((sum,row)=>sum+Number(row.medianMomentumPercentile||0),0)/Math.max(1,(candidateRun.metrics?.rankRegimeDiagnostics?.observations||[]).length)),
  });
  const windowRows = windows.map((window) => ({...window,...summary(
    slicePointInTimePortfolioRun(run,window.start,window.end))}));
  const aggregate = summary(run);
  const positiveWindows = windowRows.filter((row)=>row.vsQqqPct>0&&row.vsSpyPct>0).length;
  const positiveWindowReturns = windowRows.map((row)=>Math.max(0,row.returnPct||0));
  const positiveWindowReturnSum = positiveWindowReturns.reduce((sum,value)=>sum+value,0);
  const maxWindowReturnSharePct = positiveWindowReturnSum > 0
    ? Math.max(...positiveWindowReturns) / positiveWindowReturnSum * 100
    : 100;
  const closedTrades = run.trades.filter((trade)=>trade.side==="sell"&&trade.positionClosed===true);
  const grossProfit = closedTrades.reduce((sum,trade)=>
    sum+Math.max(0,Number(trade.roundTripPnl??trade.realizedPnl??0)),0);
  const pnlBySymbol = new Map();
  for (const trade of closedTrades) {
    pnlBySymbol.set(trade.symbol,(pnlBySymbol.get(trade.symbol)||0)+
      Number(trade.roundTripPnl??trade.realizedPnl??0));
  }
  const top3GrossContributionPct = grossProfit > 0
    ? [...pnlBySymbol.values()].sort((a,b)=>b-a).slice(0,3)
        .reduce((sum,value)=>sum+Math.max(0,value),0) / grossProfit * 100
    : 100;
  const requiredPositiveWindows = process.env.BREADTH_CANDIDATE_ONLY || process.env.BREADTH_ROBUSTNESS || process.env.PHASE_GRID || process.env.DAILY_GRID || process.env.DAILY_CANDIDATE_ONLY || process.env.DAILY_ROBUSTNESS || process.env.CROSS_SET || process.env.JOINT_GRID ? 6 : 5;
  const clears = aggregate.vsQqqPct>0 && aggregate.vsSpyPct>0 &&
    aggregate.drawdownPct>=-25 && aggregate.trades>=30 &&
    positiveWindows>=Math.ceil(windows.length/2) &&
    (!(process.env.GRID || process.env.FILTER_GRID || process.env.ALLOCATION_GRID || process.env.FOCUSED_GRID || process.env.BREADTH_CANDIDATE_ONLY || process.env.BREADTH_ROBUSTNESS || process.env.PHASE_GRID || process.env.DAILY_GRID || process.env.DAILY_CANDIDATE_ONLY || process.env.DAILY_ROBUSTNESS || process.env.CROSS_SET || process.env.JOINT_GRID) || (positiveWindows>=requiredPositiveWindows && aggregate.trades>=40 &&
      maxWindowReturnSharePct<=50 && top3GrossContributionPct<=50));
  process.stderr.write(`${index+1}/${runVariants.length} ${id}\n`);
  return {
    id,sourceVariant,seed,overrides,aggregate,positiveWindows,
    maxWindowReturnSharePct,top3GrossContributionPct,
    windows:windowRows,clears,
    ...(process.env.INCLUDE_TRADES ? { trades: run.trades } : {}),
    ...(process.env.LIVE_SNAPSHOT ? { openPositions:run.openPositions,
      endingCash:run.endingCash } : {}),
    ...(process.env.INCLUDE_CURVE ? {curve:run.curve,
      benchmarkCurves:run.benchmarkCurves} : {}),
  };
});
results.sort((a,b)=>Number(b.clears)-Number(a.clears)||b.positiveWindows-a.positiveWindows||b.aggregate.vsQqqPct-a.aggregate.vsQqqPct);
if (placeboSeeds > 0) {
  const seedWinners = Array.from({ length: placeboSeeds }, (_, seedIndex) => {
    const seed = placeboSeedStart + seedIndex;
    const eligible = results.filter((result) => result.seed === seed && result.clears);
    const winner = eligible.sort((a, b) =>
      Math.min(b.aggregate.vsQqqPct, b.aggregate.vsSpyPct) -
      Math.min(a.aggregate.vsQqqPct, a.aggregate.vsSpyPct),
    )[0] || null;
    return {
      seed,
      eligibleCount: eligible.length,
      statistic: winner
        ? Math.min(winner.aggregate.vsQqqPct, winner.aggregate.vsSpyPct)
        : null,
      winner,
    };
  });
  const exceedances = seedWinners.filter((row) =>
    row.statistic !== null && row.statistic >= candidateStatistic,
  ).length;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "family-wise-placebo",
    placeboSeeds,
    placeboSeedStart,
    variantsPerSeed: variants.length,
    candidate: { id: "dd15-c10", statistic: candidateStatistic },
    exceedances,
    empiricalPValue: (exceedances + 1) / (placeboSeeds + 1),
    windows,
    seedWinners,
    results,
  };
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    placeboSeeds,
    placeboSeedStart,
    variantsPerSeed: variants.length,
    candidateStatistic,
    eligibleSeeds: seedWinners.filter((row) => row.eligibleCount > 0).length,
    exceedances,
    empiricalPValue: report.empiricalPValue,
    strongestControls: seedWinners
      .filter((row) => row.winner)
      .sort((a, b) => b.statistic - a.statistic)
      .slice(0, 10)
      .map((row) => ({
        seed: row.seed,
        statistic: row.statistic,
        id: row.winner.id,
        ...row.winner.aggregate,
        positiveWindows: row.winner.positiveWindows,
      })),
  }, null, 2));
} else {
  writeFileSync(outputPath,JSON.stringify({generatedAt:new Date().toISOString(),windows,results},null,2));
  console.log(JSON.stringify(results.slice(0,10).map(({id,aggregate,positiveWindows,clears})=>({id,...aggregate,positiveWindows,clears})),null,2));
}
