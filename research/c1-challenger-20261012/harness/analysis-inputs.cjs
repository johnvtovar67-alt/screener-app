'use strict';
// Extract exact accepted source marks only. No strategy run, new acquisition,
// substitute history, compiler invocation or public market-data output.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { makeResearchLoaderFactory, PROGRAM_ROOT } = require('./research-loader.cjs');
const { verifyAcceptance, privateInputPath, outputPath, MATRIX_SHA256 } = require('./run-historical.cjs');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const REPO_ROOT = path.resolve(PROGRAM_ROOT, '../..');
function privateTargets(privateRoot, files) {
  return files.map(file => {
    const target = outputPath(privateRoot, file);
    assert(target !== REPO_ROOT && !target.startsWith(REPO_ROOT + path.sep), 'Historical analysis outputs must stay outside the public repository, including when private root contains it');
    return target;
  });
}

function extractAnalysisInputs(dataset) {
  assert(Array.isArray(dataset?.sessions) && dataset.sessions.length, 'Exact ordered source sessions required');
  const spyHistory = [], opportunityMarks = [];
  let unavailableSpyCloses = 0, unavailableOpportunityCloses = 0, sourcePriceRows = 0;
  for (const [index, session] of dataset.sessions.entries()) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(session.date) && (!index || session.date > dataset.sessions[index - 1].date), 'Unique ordered source session dates required');
    assert(Array.isArray(session.prices), 'Original source price array required; missing rows cannot be rebuilt');
    const symbols = new Set();
    const prices = session.prices.map(price => {
      assert(typeof price?.symbol === 'string' && price.symbol && !symbols.has(price.symbol), 'Unique original price symbols required');
      symbols.add(price.symbol);
      if (!Number.isFinite(price.close) || price.close <= 0) unavailableOpportunityCloses++;
      sourcePriceRows++;
      return { symbol: price.symbol, close: price.close };
    });
    const close = session.prices.find(price => price.symbol === 'SPY')?.close;
    if (!Number.isFinite(close) || close <= 0) unavailableSpyCloses++;
    // Preserve dates and values, including undefined/nonfinite/unavailable
    // closes. Audit encoding retains them; no carry-forward or interpolation.
    spyHistory.push({ date: session.date, close });
    opportunityMarks.push({ date: session.date, prices });
  }
  return { spyHistory, opportunityMarks, counts: { sessions: dataset.sessions.length, sourcePriceRows, unavailableSpyCloses, unavailableOpportunityCloses } };
}

// Generic confined writer also supports clearly invented regression fixtures.
// Real historical extraction must enter through prepareAnalysisInputs below.
function writePrivateArtifacts({ privateRoot, spyOutput, opportunityOutput, receiptOutput, extracted, receipt, stringifyAudit }) {
  const targets = privateTargets(privateRoot, [spyOutput, opportunityOutput, receiptOutput]);
  assert(new Set(targets).size === 3, 'Distinct immutable output identities required');
  assert(typeof stringifyAudit === 'function', 'Pinned source audit serialization required');
  const arrays = [extracted.spyHistory, extracted.opportunityMarks];
  const bytes = arrays.map(value => Buffer.from(stringifyAudit(value) + '\n'));
  const outputs = ['spy-history', 'opportunity-marks'].map((role, index) => ({ role, path: targets[index], bytes: bytes[index].length, sha256: sha256(bytes[index]) }));
  const completeReceipt = { ...receipt, outputs, completionConvention: 'Receipt is written last; all three immutable private files and their hashes are required.' };
  bytes.push(Buffer.from(stringifyAudit(completeReceipt, 2) + '\n'));
  // Exclusive creation prevents both preflight and late overwrite collisions.
  // Interrupted extraction may leave incomplete private artifacts; absence of
  // the final receipt means extraction has not completed.
  for (let index = 0; index < targets.length; index++) fs.writeFileSync(targets[index], bytes[index], { flag: 'wx', mode: 0o600 });
  return { outputs, receiptSha256: sha256(bytes[2]), receiptOutput: targets[2] };
}

function prepareAnalysisInputs({ baselineId, dataRoot, privateRoot, spyOutput, opportunityOutput, receiptOutput, gates, conditionalInputs = false } = {}) {
  verifyAcceptance(gates, 'baseline');
  // Preflight every output before loading proprietary input data.
  const targets = privateTargets(privateRoot, [spyOutput, opportunityOutput, receiptOutput]);
  assert(new Set(targets).size === 3, 'Distinct immutable output identities required');
  const factory = makeResearchLoaderFactory('champion', { baselineId });
  const baseline = factory.baseline;
  assert(sha256(fs.readFileSync(path.join(PROGRAM_ROOT, 'experiments.json'))) === MATRIX_SHA256, 'The frozen Challenger matrix has changed');
  const sourceRoot = privateInputPath(dataRoot, 'analysis source input root');
  const enginePath = path.join(baseline.sourceRoot, 'tools/c1-production-policy-replay.cjs');
  const engine = require(enginePath);
  const dataset = engine.loadDataset(sourceRoot, { root: baseline.sourceRoot, compact: true, requireCurrent: true, allowConditional: conditionalInputs });
  const expectedManifest = sha256(fs.readFileSync(path.join(PROGRAM_ROOT, 'imported/docs/research/c1-validation-20261012/current-input-manifest.json')));
  assert(dataset.manifestSha256 === expectedManifest, 'Exact published Champion input manifest required; substitute dataset forbidden');
  const originalDigest = engine.datasetDigest(dataset);
  const extracted = extractAnalysisInputs(dataset);
  assert(engine.datasetDigest(dataset) === originalDigest, 'Analysis extraction mutated original dataset');
  const receipt = {
    contract: 'c1-exact-source-private-analysis-input-extraction-v1',
    baselineId, sourceCommit: baseline.sourceCommit, sourceGraphSha256: baseline.sourceGraphSha256,
    sourceManifestSha256: baseline.manifestSha256, sourcePinSha256: baseline.sourcePinSha256,
    engineSha256: sha256(fs.readFileSync(enginePath)), extractorSha256: sha256(fs.readFileSync(__filename)),
    publishedInputManifestSha256: expectedManifest, originalDatasetSha256: originalDigest,
    originalDatasetUnchanged: true, sourceSessionPriceOrderPreserved: true, ...extracted.counts,
    matrixSha256: MATRIX_SHA256, acceptanceReceiptSha256: sha256(engine.stringifyAudit(gates)),
    inputIntegrity: dataset.inputIntegrity,
    method: 'Pinned accepted-dataset loader with its normal source compaction; copy every dated SPY close and every dated original symbol-close row. No signal-derived inputs or history reconstruction.',
    originalWarmupIncluded: true, unavailableMarksFilled: false, conditionalInputsExplicitlyAllowed: conditionalInputs,
    noHistoricalComparativeClaim: true, historicalRunsExecuted: 0, eligibleForAlphaClaim: false, productionChanged: false,
  };
  const written = writePrivateArtifacts({ privateRoot, spyOutput, opportunityOutput, receiptOutput, extracted, receipt, stringifyAudit: engine.stringifyAudit });
  return { completed: true, baselineId, ...written, sourceDatasetUnchanged: true, noHistoricalComparativeClaim: true, historicalRunsExecuted: 0, productionChanged: false };
}

if (require.main === module) {
  const args = process.argv.slice(2), value = key => { const index = args.indexOf('--' + key); return index < 0 ? undefined : args[index + 1]; };
  try {
    const result = prepareAnalysisInputs({ baselineId: value('baseline'), dataRoot: value('data-root'), privateRoot: value('private-root'),
      spyOutput: value('spy-output'), opportunityOutput: value('opportunity-output'), receiptOutput: value('receipt-output'),
      gates: value('gates') ? JSON.parse(fs.readFileSync(value('gates'))) : null, conditionalInputs: args.includes('--conditional-inputs') });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(JSON.stringify({ completed: false, historicalInputExtractionBlocked: true, reason: error.message })); process.exitCode = 2; }
}
module.exports = { extractAnalysisInputs, writePrivateArtifacts, prepareAnalysisInputs };
