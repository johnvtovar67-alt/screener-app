#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const inputPath = argument("input");
const outputPath = argument("output", "research-results/walk-forward-report.json");
if (!inputPath) {
  console.error(
    "Usage: node tools/run-walk-forward-backtest.cjs --input <raw-or-compiled.json> [--output report.json]",
  );
  process.exit(2);
}

const root = process.cwd();
const loader = createResearchModuleLoader(root);
const { compilePointInTimeSignals } = loader.load("lib/historicalSignalEvaluator.js");
const {
  POINT_IN_TIME_SCHEMA,
  runWalkForwardBacktest,
  validatePointInTimeDataset,
} = loader.load("lib/walkForwardBacktest.js");
const { portfolioDecision } = loader.load("lib/expertDecision.js");
const {
  capitalAllowance,
  portfolioRiskSnapshot,
  portfolioContributionGate,
  capitalSignalEligible,
} = loader.load("lib/portfolioGovernor.js");
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const dataset =
  input.metadata?.schema === POINT_IN_TIME_SCHEMA
    ? input
    : compilePointInTimeSignals(input);
const validation = validatePointInTimeDataset(dataset);

let report;
let exitCode = 0;
if (!validation.valid) {
  report = {
    generatedAt: new Date().toISOString(),
    claimStatus: "rejected-before-simulation",
    validation,
    explanation:
      "No performance result was produced because the historical evidence failed the point-in-time research contract.",
  };
  exitCode = 1;
} else {
  report = runWalkForwardBacktest(dataset, {
    positionDecision: portfolioDecision,
    simulationOptions: {
      capitalAllowance,
      portfolioRiskSnapshot,
      portfolioContributionGate,
      capitalSignalEligible,
      slippageBps: 12,
    },
    parameterGrid: [
      {
        buyTargetPct: 0.04,
        strongBuyTargetPct: 0.07,
        maxPositions: 12,
      },
      {
        buyTargetPct: 0.06,
        strongBuyTargetPct: 0.09,
        maxPositions: 10,
      },
      {
        buyTargetPct: 0.07,
        strongBuyTargetPct: 0.1,
        maxPositions: 8,
      },
    ],
  });
}

const destination = path.resolve(outputPath);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.claimStatus}: ${destination}`);
if (exitCode) {
  for (const error of validation.errors) console.error(`- ${error}`);
}
process.exit(exitCode);
