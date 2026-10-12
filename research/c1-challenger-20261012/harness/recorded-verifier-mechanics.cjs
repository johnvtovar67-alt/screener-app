'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { makeResearchLoaderFactory } = require('./research-loader.cjs');
const { verifyResearchRecordedReplay } = require('./recorded-verifier.cjs');
const { sourceRegressionFixture } = require('../mechanics/synthetic-fixtures.cjs');
const input = sourceRegressionFixture(40);
const checks = [];
for (const baselineId of ['audit-historical', 'production-equivalent']) {
  for (const cost of [12,25,50]) {
    const factory = makeResearchLoaderFactory('champion', { baselineId });
    const { replayPolicy } = require(path.join(factory.baseline.sourceRoot, 'tools/c1-production-policy-replay.cjs'));
    const run = replayPolicy({ root:factory.baseline.sourceRoot, dataset:input,
      startDate:input.sessions[0].date, endDate:input.sessions.at(-1).date,
      slippageBps:cost, loaderFactory:factory });
    const verified = verifyResearchRecordedReplay({ root:factory.baseline.sourceRoot, run, dataset:input, loaderFactory:factory });
    assert.equal(verified.passed,true);
    checks.push({ baselineId, experimentId:'champion', costBps:cost, passed:verified.passed });
  }
}
for (const experimentId of ['entry_queue__depth6','ordinary_confirmation__sessions2','profit_activation__peak20']) {
  for (const cost of [12,25,50]) {
    const factory = makeResearchLoaderFactory(experimentId,{ baselineId:'production-equivalent' });
    const { replayPolicy } = require(path.join(factory.baseline.sourceRoot,'tools/c1-production-policy-replay.cjs'));
    const run = replayPolicy({ root:factory.baseline.sourceRoot, dataset:input,
      startDate:input.sessions[0].date,endDate:input.sessions.at(-1).date,
      slippageBps:cost, loaderFactory:factory });
    const verified = verifyResearchRecordedReplay({ root:factory.baseline.sourceRoot,run,dataset:input,loaderFactory:factory });
    assert.equal(verified.passed,true,experimentId+' '+cost);
    checks.push({ baselineId:'production-equivalent',experimentId,costBps:cost,passed:verified.passed });
  }
}
const report={contract:'c1-challenger-recorded-verifier-mechanics-v1',passed:true,
  checks,historicalComparisonsRun:0,syntheticInputsOnly:true,productionChanged:false};
fs.writeFileSync(path.join(__dirname,'recorded-verifier-mechanics-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length,historicalComparisonsRun:0}));
