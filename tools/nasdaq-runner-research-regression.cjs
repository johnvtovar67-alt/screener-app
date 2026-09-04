const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const research = loader.load(
  "lib/nasdaqRunnerResearch.js",
  fs.readFileSync("lib/nasdaqRunnerResearch.js", "utf8"),
);
const definitions = research.pointInTimeNasdaqRunnerDefinitions();
const controls = research.pointInTimeNasdaqRunnerControls();

assert(definitions.length === 5, "R20-R24 must freeze exactly five active variants.");
assert(
  definitions.map((row) => row.researchGeneration).join(",") ===
    "R20,R21,R22,R23,R24",
  "The Nasdaq runner variants must occupy distinct frozen generations.",
);
assert(
  definitions.every(
    (row) =>
      Math.abs(
        Object.values(row.weights).reduce((total, value) => total + value, 0) -
          1,
      ) < 1e-9 &&
      row.overrides.researchRankMode === "momentum-spine" &&
      row.overrides.researchSignalSource === "price-only" &&
      row.overrides.exitOnUniverseRemoval === true &&
      row.overrides.benchmarkCompletionSymbol === null &&
      row.overrides.benchmarkSymbols.join(",") === "SPY,QQQ" &&
      row.overrides.slippageBps === 12 &&
      row.overrides.commissionPerOrder === 0,
  ),
  "Every active variant must use close-known momentum, point-in-time removals, cash residuals, and dual benchmarks.",
);
assert(
  controls.length === 2 &&
    controls.some((row) => row.overrides.researchRankMode === "momentum-only") &&
    controls.some((row) => row.overrides.researchRankMode === "random-placebo"),
  "R20-R24 must include simple-momentum and random matched controls.",
);

const runner = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
const publicRoute = fs.readFileSync("pages/api/research/alpha-creator.js", "utf8");

assert(
  runner.includes("runPointInTimeNasdaqRunnerWorker") &&
    runner.includes("finalizePointInTimeNasdaqRunnerDevelopment") &&
    runner.includes("restorePointInTimeNasdaqWindow") &&
    runner.includes("previously inspected Nasdaq windows remain unavailable as validation holdouts"),
  "The runner must use the verified Nasdaq dataset without relabeling inspected windows.",
);
assert(
  cron.includes("invokeNasdaqRunnerWorkers") &&
    cron.includes("advanceNasdaqRunnerProgram") &&
    publicRoute.includes("pit-nasdaq-runner-r20-r24"),
  "The cron must preserve the concurrent R20-R24 program and expose its frozen report.",
);

console.log("R20-R24 parallel Nasdaq runner-retention regression passed.");
