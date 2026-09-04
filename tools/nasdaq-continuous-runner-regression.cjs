const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const research = loader.load(
  "lib/nasdaqContinuousRunnerResearch.js",
  fs.readFileSync("lib/nasdaqContinuousRunnerResearch.js", "utf8"),
);
const definitions = research.pointInTimeNasdaqContinuousRunnerDefinitions();
const controls = research.pointInTimeNasdaqContinuousRunnerControls();

assert(definitions.length === 5, "R30-R34 must freeze exactly five variants.");
assert(
  definitions.map((row) => row.researchGeneration).join(",") ===
    "R30,R31,R32,R33,R34",
  "Each continuous runner must have a distinct generation.",
);
assert(
  definitions.every(
    (row) =>
      row.overrides.researchRankMode === "momentum-spine" &&
      row.overrides.exitOnUniverseRemoval === true &&
      row.overrides.benchmarkCompletionSymbol === null &&
      row.overrides.benchmarkSymbols.join(",") === "SPY,QQQ" &&
      row.overrides.commissionPerOrder === 0 &&
      row.overrides.slippageBps === 12 &&
      row.overrides.liquidateAtEnd === true,
  ),
  "Every R30 variant must retain next-open costs, dual benchmarks, cash-as-cash, and one final liquidation.",
);
assert(
  controls.length === 2 &&
    controls.some((row) => row.overrides.researchRankMode === "momentum-only") &&
    controls.some((row) => row.overrides.researchRankMode === "random-placebo"),
  "R30 must include matched simple-momentum and random controls.",
);

const simulator = fs.readFileSync("lib/walkForwardBacktest.js", "utf8");
const walkForward = loader.load("lib/walkForwardBacktest.js", simulator);
const sliced = walkForward.slicePointInTimePortfolioRun(
  {
    curve: [
      { date: "2024-01-02", equity: 100, cash: 0, activeExposure: 1 },
      { date: "2024-01-03", equity: 110, cash: 0, activeExposure: 1 },
      { date: "2024-01-04", equity: 121, cash: 121, activeExposure: 0 },
    ],
    benchmarkCurve: [
      { date: "2024-01-02", value: 100 },
      { date: "2024-01-03", value: 105 },
      { date: "2024-01-04", value: 110 },
    ],
    benchmarkCurves: {
      SPY: [
        { date: "2024-01-02", value: 100 },
        { date: "2024-01-03", value: 105 },
        { date: "2024-01-04", value: 110 },
      ],
    },
    trades: [
      { date: "2024-01-04", side: "sell", positionClosed: true, roundTripPnl: 21 },
    ],
    metrics: { rankRegimeDiagnostics: { observations: [] } },
  },
  "2024-01-02",
  "2024-01-03",
);
assert(
  sliced.metrics.totalReturnPct === 10 &&
    sliced.metrics.closedTrades === 0 &&
    sliced.curve.length === 2,
  "Fold attribution must slice the continuous curve without importing a later liquidation.",
);
const runner = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
const publicRoute = fs.readFileSync("pages/api/research/alpha-creator.js", "utf8");
assert(
  simulator.includes("export function slicePointInTimePortfolioRun") &&
    runner.includes("continuousPointInTimeAlphaPhaseSummary") &&
    runner.includes("boundaryLiquidations !== 0"),
  "Continuous fold attribution must explicitly prohibit boundary liquidations.",
);
assert(
  runner.includes("runPointInTimeNasdaqContinuousRunnerWorker") &&
    runner.includes("finalizePointInTimeNasdaqContinuousRunnerDevelopment") &&
    runner.includes("getPointInTimeNasdaqConcentratedRunnerR25"),
  "R30-R34 must require and preserve the terminal R25-R29 result.",
);
assert(
  cron.includes("invokeNasdaqContinuousRunnerWorkers") &&
    cron.includes("R30-R34-parallel-continuous-nasdaq-runners") &&
    publicRoute.includes("pit-nasdaq-continuous-runner-r30-r34") &&
    publicRoute.includes("frozenR25R29Report"),
  "The concurrent R30-R34 batch must be the latest public research program.",
);

console.log("R30-R34 continuous Nasdaq runner regression passed.");
