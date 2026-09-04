const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const research = loader.load(
  "lib/nasdaqConcentratedRunnerResearch.js",
  fs.readFileSync("lib/nasdaqConcentratedRunnerResearch.js", "utf8"),
);
const definitions = research.pointInTimeNasdaqConcentratedRunnerDefinitions();
const controls = research.pointInTimeNasdaqConcentratedRunnerControls();

assert(definitions.length === 5, "R25-R29 must freeze exactly five variants.");
assert(
  definitions.map((row) => row.researchGeneration).join(",") ===
    "R25,R26,R27,R28,R29",
  "Each concentrated runner must have a distinct research generation.",
);
assert(
  definitions.every(
    (row) =>
      Math.abs(
        Object.values(row.weights).reduce((total, value) => total + value, 0) -
          1,
      ) < 1e-9 &&
      row.lifecycle.target >= 1 &&
      row.lifecycle.target <= 3 &&
      row.overrides.researchRankMode === "momentum-spine" &&
      row.overrides.exitOnUniverseRemoval === true &&
      row.overrides.benchmarkCompletionSymbol === null &&
      row.overrides.benchmarkSymbols.join(",") === "SPY,QQQ" &&
      row.overrides.commissionPerOrder === 0 &&
      row.overrides.slippageBps === 12,
  ),
  "Every variant must be concentrated, momentum-led, point-in-time, cash-as-cash, and dual-benchmark.",
);
assert(
  controls.length === 2 &&
    controls.some((row) => row.overrides.researchRankMode === "momentum-only") &&
    controls.some((row) => row.overrides.researchRankMode === "random-placebo"),
  "The batch must include matched simple-momentum and random controls.",
);

const runner = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
const publicRoute = fs.readFileSync("pages/api/research/alpha-creator.js", "utf8");
assert(
  runner.includes("runPointInTimeNasdaqConcentratedRunnerWorker") &&
    runner.includes("finalizePointInTimeNasdaqConcentratedRunnerDevelopment") &&
    runner.includes("getPointInTimeNasdaqRunnerR20"),
  "R25-R29 must require and preserve the terminal R20-R24 result.",
);
assert(
  cron.includes("invokeNasdaqConcentratedRunnerWorkers") &&
    cron.includes("advanceNasdaqConcentratedRunnerProgram") &&
    publicRoute.includes("pit-nasdaq-concentrated-runner-r25-r29") &&
    publicRoute.includes("frozenR20R24Report"),
  "The concurrent R25-R29 batch must remain preserved in the public research chain.",
);

console.log("R25-R29 concentrated Nasdaq runner regression passed.");
