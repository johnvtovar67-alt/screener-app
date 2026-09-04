const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const research = loader.load(
  "lib/momentumSpineResearch.js",
  fs.readFileSync("lib/momentumSpineResearch.js", "utf8"),
);
const definitions = research.pointInTimeMomentumSpineR15Definitions();
const controls = research.pointInTimeMomentumSpineR15Controls();

assert(definitions.length === 5, "R15-R19 must freeze exactly five active families.");
assert(
  new Set(definitions.map((row) => row.researchGeneration)).size === 5 &&
    definitions.map((row) => row.researchGeneration).join(",") ===
      "R15,R16,R17,R18,R19",
  "Each parallel momentum hypothesis must have a distinct research generation.",
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
      row.overrides.benchmarkCompletionSymbol === null &&
      row.overrides.benchmarkSymbols.join(",") === "SPY,QQQ" &&
      row.overrides.slippageBps === 12 &&
      row.overrides.commissionPerOrder === 0,
  ),
  "Every active family must be a fully specified momentum-spine rank with cash residuals and dual benchmarks.",
);
assert(
  controls.length === 2 &&
    controls.some((row) => row.overrides.researchRankMode === "momentum-only") &&
    controls.some((row) => row.overrides.researchRankMode === "random-placebo"),
  "The frozen program must include simple-momentum and random matched controls.",
);

const walkForward = fs.readFileSync("lib/walkForwardBacktest.js", "utf8");
const runner = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
const publicRoute = fs.readFileSync("pages/api/research/alpha-creator.js", "utf8");

assert(
  walkForward.includes('researchRankMode === "momentum-spine"') &&
    walkForward.includes('weighted("reacceleration"') &&
    walkForward.includes('weighted("volumeConfirmation"') &&
    walkForward.includes('weighted("contraction"'),
  "The simulator must implement the frozen momentum, reacceleration, volume, and contraction features.",
);
assert(
  runner.includes("runPointInTimeSp500MomentumSpineWorker") &&
    runner.includes("finalizePointInTimeSp500MomentumSpineDevelopment") &&
    runner.includes("strictMatchedPlacebosRequired: 1_000") &&
    runner.includes("residualCashRemainsCash: true") &&
    runner.includes("parallelResearchGenerationsCounted: 5"),
  "The runner must preserve worker isolation, cash residuals, multiplicity, and the strict placebo gate.",
);
assert(
  cron.includes("invokeMomentumSpineWorkers") &&
    cron.includes("Promise.all") &&
    cron.includes("R15-R19-parallel-momentum-spine") &&
    publicRoute.includes("pit-sp500-momentum-spine-r15-r19"),
  "The cron must launch the momentum families concurrently and expose the latest research report.",
);

console.log("R15-R19 parallel momentum-spine regression passed.");
