'use strict';
// Invented marks and actual filesystem guards only. No accepted historical
// data, passing historical acceptance receipts or provider permissions faked.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto');
const { extractAnalysisInputs, writePrivateArtifacts, prepareAnalysisInputs } = require('./analysis-inputs.cjs');
const { makeResearchLoaderFactory, PROGRAM_ROOT } = require('./research-loader.cjs');
const source = makeResearchLoaderFactory('champion', { baselineId: 'production-equivalent' }).baseline.sourceRoot;
const { stringifyAudit, parseAudit, datasetDigest } = require(path.join(source, 'tools/c1-production-policy-replay.cjs'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-invented-analysis-inputs-'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const checks = [];
const check = (name, action) => { action(); checks.push({ name, passed: true }); };
const invented = { metadata: { syntheticSoftwareOnly: true }, sessions: [
  { date: '2026-03-02', prices: [{ symbol: 'AAA', close: 7, open: 9 }, { symbol: 'SPY', close: 11 }, { symbol: 'BBB', close: NaN }] },
  { date: '2026-03-03', prices: [{ symbol: 'AAA' }, { symbol: 'SPY', close: Infinity }, { symbol: 'BBB', close: null }] },
  { date: '2026-03-04', prices: [{ symbol: 'BBB', close: 0 }] },
] };
let extracted;
check('exact sessions, price-row order and unavailable values retained without original mutation', () => {
  const before = stringifyAudit(invented), digest = datasetDigest(invented);
  extracted = extractAnalysisInputs(invented);
  assert.equal(extracted.spyHistory.length, 3);
  assert.equal(extracted.opportunityMarks.length, 3);
  assert.deepEqual(extracted.opportunityMarks[0].prices.map(row => row.symbol), ['AAA', 'SPY', 'BBB']);
  assert(Number.isNaN(extracted.opportunityMarks[0].prices[2].close));
  assert.equal(extracted.spyHistory[1].close, Infinity);
  assert.equal(extracted.spyHistory[2].close, undefined);
  assert.equal(extracted.opportunityMarks[1].prices[0].close, undefined);
  assert.equal(extracted.opportunityMarks[1].prices[2].close, null);
  assert.equal(extracted.counts.sourcePriceRows, 7);
  assert.equal(extracted.counts.unavailableSpyCloses, 2);
  assert.equal(extracted.counts.unavailableOpportunityCloses, 5);
  assert.equal(stringifyAudit(invented), before); assert.equal(datasetDigest(invented), digest);
  assert.deepEqual(parseAudit(stringifyAudit(extracted)), extracted);
});
check('ambiguous duplicates, unordered dates and missing original arrays reject without reconstruction', () => {
  assert.throws(() => extractAnalysisInputs({ sessions: [invented.sessions[1], invented.sessions[0]] }), /ordered/);
  assert.throws(() => extractAnalysisInputs({ sessions: [{ date: '2026-03-02', prices: [{ symbol: 'AAA', close: 1 }, { symbol: 'AAA', close: 2 }] }] }), /Unique original/);
  assert.throws(() => extractAnalysisInputs({ sessions: [{ date: '2026-03-02' }] }), /cannot be rebuilt/);
});
const paths = name => ({ privateRoot: temp, spyOutput: path.join(temp, name + '-spy.json'), opportunityOutput: path.join(temp, name + '-marks.json'), receiptOutput: path.join(temp, name + '-receipt.json') });
const request = name => ({ ...paths(name), extracted, receipt: { contract: 'synthetic-private-writer-test', syntheticSoftwareOnly: true, noHistoricalComparativeClaim: true }, stringifyAudit });
check('three exclusive private files audit-roundtrip exactly and bind output hashes', () => {
  const req = request('valid'), result = writePrivateArtifacts(req);
  for (const target of [req.spyOutput, req.opportunityOutput, req.receiptOutput]) assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.deepEqual(parseAudit(fs.readFileSync(req.spyOutput, 'utf8')), extracted.spyHistory);
  assert.deepEqual(parseAudit(fs.readFileSync(req.opportunityOutput, 'utf8')), extracted.opportunityMarks);
  const receipt = parseAudit(fs.readFileSync(req.receiptOutput, 'utf8'));
  assert(receipt.syntheticSoftwareOnly);
  for (const output of receipt.outputs) assert.equal(output.sha256, sha(fs.readFileSync(output.path)));
  assert.equal(result.receiptSha256, sha(fs.readFileSync(req.receiptOutput)));
  assert.throws(() => writePrivateArtifacts(req), /already exists/);
});
check('public, traversal, symlink, duplicate and existing output targets reject before any write', () => {
  assert.throws(() => writePrivateArtifacts({ ...request('public'), privateRoot: PROGRAM_ROOT, spyOutput: path.join(PROGRAM_ROOT, 'never-written.json') }), /outside the public repository/);
  assert.throws(() => writePrivateArtifacts({ ...request('ancestor-public'), privateRoot: path.resolve(PROGRAM_ROOT, '../../..'), spyOutput: path.join(PROGRAM_ROOT, 'never-written.json') }), /outside the public repository/);
  assert.throws(() => writePrivateArtifacts({ ...request('escape'), spyOutput: path.join(temp, '..', 'never-written.json') }), /escapes private storage/);
  const duplicate = request('duplicate'); duplicate.opportunityOutput = duplicate.spyOutput;
  assert.throws(() => writePrivateArtifacts(duplicate), /Distinct/); assert(!fs.existsSync(duplicate.spyOutput));
  const linked = request('linked'); fs.symlinkSync(path.join(temp, 'missing-target.json'), linked.opportunityOutput);
  assert.throws(() => writePrivateArtifacts(linked), /already exists/); assert(!fs.existsSync(linked.spyOutput));
  const existing = request('existing'); fs.writeFileSync(existing.opportunityOutput, 'private sentinel', { mode: 0o600 });
  assert.throws(() => writePrivateArtifacts(existing), /already exists/);
  assert.equal(fs.readFileSync(existing.opportunityOutput, 'utf8'), 'private sentinel'); assert(!fs.existsSync(existing.spyOutput));
});
check('missing independent acceptance blocks historical extractor without creating artifacts', () => {
  const req = { ...paths('blocked'), baselineId: 'production-equivalent', dataRoot: path.join(temp, 'absent-input'), gates: null };
  assert.throws(() => prepareAnalysisInputs(req), /acceptance receipts/);
  assert(!fs.existsSync(req.spyOutput)); assert(!fs.existsSync(req.opportunityOutput)); assert(!fs.existsSync(req.receiptOutput));
});
check('late output collision remains exclusive and produces no completion receipt', () => {
  const req = request('late'), originalWrite = fs.writeFileSync;
  fs.writeFileSync = function(file, data, options) {
    if (file === req.spyOutput) originalWrite(req.opportunityOutput, 'late private sentinel', { mode: 0o600, flag: 'wx' });
    return originalWrite(file, data, options);
  };
  try { assert.throws(() => writePrivateArtifacts(req), /EEXIST|exists/); }
  finally { fs.writeFileSync = originalWrite; }
  assert.equal(fs.readFileSync(req.opportunityOutput, 'utf8'), 'late private sentinel');
  assert(!fs.existsSync(req.receiptOutput));
});
const report = { contract: 'c1-analysis-input-extraction-synthetic-regression-v1', passed: true,
  scope: 'Pure extraction of invented marks and private filesystem guard checks. No passing historical acceptance gate, licensing evidence or historical dataset constructed.',
  historicalRunsExecuted: 0, historicalDatasetAccessed: false, productionChanged: false, checks };
fs.writeFileSync(path.join(__dirname, 'analysis-inputs-regression-results.json'), JSON.stringify(report, null, 2) + '\n');
fs.rmSync(temp, { recursive: true, force: true });
console.log(JSON.stringify({ passed: true, checks: checks.length, historicalRunsExecuted: 0 }));
