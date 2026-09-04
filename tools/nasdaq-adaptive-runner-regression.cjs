const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const loader = createResearchModuleLoader();
const source = fs.readFileSync("lib/nasdaqAdaptiveRunnerResearch.js", "utf8");
const research = loader.load("lib/nasdaqAdaptiveRunnerResearch.js", source);
const definitions = research.pointInTimeNasdaqAdaptiveRunnerDefinitions();
const controls = research.pointInTimeNasdaqAdaptiveRunnerControls();

assert(definitions.length === 5, "R35-R39 must freeze exactly five variants.");
assert(definitions.map((row) => row.researchGeneration).join(",") === "R35,R36,R37,R38,R39", "Adaptive candidates must have distinct generations.");
assert(definitions.every((row) => row.overrides.rankedAdaptiveRebalanceEnabled === true && row.overrides.rankedAdaptiveEqualWeightEnabled === true && row.overrides.benchmarkCompletionSymbol === null && row.overrides.benchmarkSymbols.join(",") === "SPY,QQQ" && row.overrides.slippageBps === 12 && row.overrides.commissionPerOrder === 0), "Every adaptive variant must preserve causal cash-as-cash dual-benchmark execution.");
assert(definitions.some((row) => row.overrides.rankedAdaptiveTargetEnabled === true) && definitions.some((row) => row.overrides.volatilityTargetPct === 24), "The family must test both breadth-adaptive concentration and volatility budgeting.");
assert(controls.length === 2 && controls.some((row) => row.overrides.researchRankMode === "momentum-only") && controls.some((row) => row.overrides.researchRankMode === "random-placebo"), "Matched controls are required.");

const simulator = fs.readFileSync("lib/walkForwardBacktest.js", "utf8");
const runner = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const cron = fs.readFileSync("pages/api/cron/fmp-research-backtest.js", "utf8");
const publicRoute = fs.readFileSync("pages/api/research/alpha-creator.js", "utf8");
assert(simulator.includes("rankedAdaptiveRebalanceEnabled") && simulator.includes("rankedWeakBreadthTargetCount") && simulator.includes("rankedAdaptiveEqualWeightEnabled"), "The simulator must implement bounded contemporaneous breadth adaptation.");
assert(runner.includes("runPointInTimeNasdaqAdaptiveRunnerWorker") && runner.includes("getPointInTimeNasdaqContinuousRunnerR30"), "R35 must preserve and follow terminal R30 evidence.");
assert(cron.includes("invokeNasdaqAdaptiveRunnerWorkers") && publicRoute.includes("pit-nasdaq-adaptive-runner-r35-r39") && publicRoute.includes("frozenR30R34Report"), "R35 must remain preserved as frozen evidence.");

console.log("R35-R39 adaptive Nasdaq runner regression passed.");
