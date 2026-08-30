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
    "Usage: node tools/run-walk-forward-backtest.cjs --input <raw-or-compiled.json> [--output report.json] [--placebo-seeds 1000]",
  );
  process.exit(2);
}

const root = process.cwd();
const loader = createResearchModuleLoader(root);
const { compilePointInTimeSignals } = loader.load("lib/historicalSignalEvaluator.js");
const {
  POINT_IN_TIME_SCHEMA,
  validatePointInTimeDataset,
} = loader.load("lib/walkForwardBacktest.js");
const { runV10AlphaAudit } = loader.load("lib/v10AlphaAudit.js");
const { V10_STRICT_PLACEBO_SEEDS } = loader.load(
  "lib/v10ResearchContract.js",
);
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const dataset =
  input.metadata?.schema === POINT_IN_TIME_SCHEMA
    ? input
    : compilePointInTimeSignals(input);
const validation = validatePointInTimeDataset(dataset, {
  minimumSessions: 1_008,
});
const attestation = dataset.metadata?.v10HoldoutAttestation || {};
const holdoutReady =
  attestation.sealedBeforeEvaluation === true &&
  attestation.excludedFromV7ThroughV10Development === true &&
  attestation.thesisFrozenBeforeReveal === true;

let report;
let exitCode = 0;
if (!validation.credibleForResearch || !holdoutReady) {
  report = {
    generatedAt: new Date().toISOString(),
    claimStatus: "rejected-before-simulation",
    validation,
    holdoutAttestation: {
      sealedBeforeEvaluation: attestation.sealedBeforeEvaluation === true,
      excludedFromV7ThroughV10Development:
        attestation.excludedFromV7ThroughV10Development === true,
      thesisFrozenBeforeReveal:
        attestation.thesisFrozenBeforeReveal === true,
    },
    explanation:
      "No performance result was produced because the evidence failed the strict point-in-time contract or the holdout was not independently sealed before evaluation.",
  };
  exitCode = 1;
} else {
  const placeboSeedCount = Math.max(
    1,
    Number(argument("placebo-seeds", V10_STRICT_PLACEBO_SEEDS)),
  );
  report = runV10AlphaAudit(dataset, {
    placeboSeedCount,
    slippageBps: 12,
  });
  report.claimStatus = report.evidenceAssessment.status;
  if (!report.evidenceAssessment.pass) exitCode = 1;
}

const destination = path.resolve(outputPath);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.claimStatus}: ${destination}`);
if (exitCode) {
  for (const error of validation.errors) console.error(`- ${error}`);
}
process.exit(exitCode);
