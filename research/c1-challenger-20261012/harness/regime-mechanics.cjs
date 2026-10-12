// Artificial software checks, never historical market-data reconstruction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildRegimeOverlay, applyRegimeInputs, observableAt, stepRegime, definition, SIDECAR } = require('./regime-overlay.cjs');
const { syntheticDataset } = require('../mechanics/synthetic-fixtures.cjs');
const PROGRAM = path.resolve(__dirname, '..');
const SOURCE = path.join(PROGRAM, 'baselines/production-equivalent/source');
const registry = JSON.parse(fs.readFileSync(path.join(PROGRAM, 'baselines/registry.json')));
const pin = registry.baselines.find(item => item.id === 'production-equivalent');
const { createResearchModuleLoader } = require(path.join(SOURCE, 'tools/research-module-loader.cjs'));
const { replayPolicy, compareRuns, datasetDigest } = require(path.join(SOURCE, 'tools/c1-production-policy-replay.cjs'));
const calendar = createResearchModuleLoader(SOURCE).load('lib/marketSession.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const manifestBytes = fs.readFileSync(path.join(PROGRAM, 'experiments.json'));
const experiments = JSON.parse(manifestBytes).experiments.filter(item => ['scale_drawdown', 'scale_volatility'].includes(item.family));
const draw = experiments.find(item => item.id === 'scale_drawdown__trigger8_restore5');

function warmup(length, endDate, price = () => 100) {
  const dates = [];
  let date = calendar.previousMarketSessionDay(endDate);
  for (let index = 0; index < length; index++) { dates.unshift(date); date = calendar.previousMarketSessionDay(date); }
  return dates.map((date, index) => ({ date, prices: [{ symbol: 'SPY', adjusted: true, close: price(index) }] }));
}
function sidecar(dataset, experiment, originalWarmup) {
  return applyRegimeInputs(dataset, experiment, { benchmarkWarmupSessions: originalWarmup || warmup(experiment.family === 'scale_drawdown' ? 252 : 21, dataset.sessions[0].date), calendar });
}
const { makeResearchLoaderFactory } = require('./research-loader.cjs');
const factory = experiment => makeResearchLoaderFactory(experiment.id, { baselineId: 'production-equivalent' });
const request = (dataset, cost = 12, extras = {}) => ({ root: SOURCE, dataset, slippageBps: cost, startDate: dataset.sessions[0].date, endDate: dataset.sessions.at(-1).date, ...extras });
const run = (experiment, dataset, cost = 12, extras = {}) => replayPolicy({ ...request(dataset, cost, extras), loaderFactory: factory(experiment) });
const receipts = [];

// No-op overlay includes the projection sidecar and budget guard, so it tests
// the actual research seam rather than merely skipping the transform.
for (const cost of [12, 25, 50]) {
  const original = syntheticDataset({ length: 5, count: 12, price: 82.3 });
  const originalHash = datasetDigest(original);
  const derived = sidecar(original, draw, warmup(252, original.sessions[0].date, () => 82.3));
  assert(derived.dataset.sessions.every(session => session[SIDECAR].multiplier === 1));
  const baseline = replayPolicy(request(original, cost));
  const overlay = run(draw, derived.dataset, cost);
  const parity = compareRuns(baseline, overlay);
  assert(parity.passed, 'Normal-state complete economic/trace parity: ' + cost + ' bps ' + JSON.stringify(Object.entries(parity.fields).filter(([, value]) => !value.matched)));
  assert.equal(datasetDigest(original), originalHash);
  receipts.push({ test: 'normal_state_no_op_all_economics_and_source_traces', costBps: cost, passed: true, originalInputUnchanged: true });
}

// All six specifications use causal chronological state and preserve source
// accounting across cached/uncached execution at a meaningful active exposure.
for (const experiment of experiments) {
  const original = syntheticDataset({ length: 4, count: 12, price: 82.3 });
  const w = warmup(experiment.family === 'scale_drawdown' ? 252 : 21, original.sessions[0].date,
    index => experiment.family === 'scale_drawdown' ? (index === 251 ? 80 : 100) : (index % 2 ? 120 : 80));
  const derived = sidecar(original, experiment, w);
  assert.equal(derived.dataset.sessions[1][SIDECAR].multiplier, .5);
  const cached = run(experiment, derived.dataset, 25);
  const uncached = run(experiment, derived.dataset, 25, { cached: false });
  assert(compareRuns(cached, uncached).passed, experiment.id + ' cached/uncached complete parity');
  const first = cached.accountTrace[1];
  assert(cached.fills.filter(fill => fill.side === 'buy').every(fill => Number.isSafeInteger(fill.shares) && fill.shares > 0));
  assert(cached.curve.every(row => row.cash >= 0));
  assert((first.books.base.cash + first.books.cooldown15.cash + first.books.sector40.cash) / cached.curve[1].equity > .49);
  receipts.push({ test: 'active_scale_cached_uncached_double_floor_cash_accounting', experimentId: experiment.id, costBps: 25, passed: true });
}

const specification = definition(draw);
assert.equal(observableAt([...Array(251).fill(100), 92], 251, specification.observable), 8);
let state = { active: false, restoreCount: 0 };
const chronology = [8, 5, 4, 4, 5, 4, 4, 4, 4, 4].map(value => (state = stepRegime(state, value, specification)));
assert.equal(chronology[0].active, true, 'Trigger is inclusive');
assert.equal(chronology[1].restoreCount, 0, 'Restore threshold is strict');
assert.equal(chronology[4].restoreCount, 0, 'Failed restoring observation resets count');
assert.equal(chronology[8].active, true, 'Four completed sessions do not restore');
assert.equal(chronology[9].active, false, 'Fifth completed session restores');
receipts.push({ test: 'inclusive_trigger_strict_restore_five_consecutive_completed_sessions_and_reset', passed: true });

const causal = syntheticDataset({ length: 8 });
for (let index = 0; index < causal.sessions.length; index++) {
  const row = causal.sessions[index].prices.find(price => price.symbol === 'SPY');
  row.open = row.high = row.low = row.close = index === 0 ? 90 : 96;
}
const sourceHash = datasetDigest(causal);
const derived = sidecar(causal, draw);
assert.equal(derived.dataset.sessions[0][SIDECAR].multiplier, 1, 'Current adoption close unavailable for adoption-open decision');
assert.equal(derived.dataset.sessions[1][SIDECAR].multiplier, .5);
assert.equal(derived.dataset.sessions[5][SIDECAR].multiplier, .5);
assert.equal(derived.dataset.sessions[6][SIDECAR].multiplier, 1);
assert.equal(datasetDigest(causal), sourceHash);
const existingArchivePrefix = { ...causal, sessions: [...warmup(252, causal.sessions[0].date), ...causal.sessions] };
const archiveDerived = applyRegimeInputs(existingArchivePrefix, draw, { calendar, policyStartDate: causal.sessions[0].date });
assert.deepEqual(archiveDerived.researchInputs.derived, derived.researchInputs.derived);
assert(archiveDerived.dataset.sessions.slice(0, 252).every(session => !Object.hasOwn(session, SIDECAR)));
assert.equal(archiveDerived.researchInputs.archivedDatasetWarmupSessions, 252);
const futureChanged = structuredClone(causal);
futureChanged.sessions[5].prices.find(price => price.symbol === 'SPY').close = 1;
const changed = sidecar(futureChanged, draw);
assert.deepEqual(changed.researchInputs.derived.slice(0, 6), derived.researchInputs.derived.slice(0, 6));
assert.notDeepEqual(changed.researchInputs.derived[6], derived.researchInputs.derived[6]);
receipts.push({ test: 'causal_previous_close_chronology_future_perturbation_original_inputs_unchanged', passed: true });

// Activate after full-capacity entries. A source stop remains a source stop;
// retained positions do not rebalance and capacity excess pauses replacement.
const stopFixture = syntheticDataset({ length: 4, count: 12, bar: (symbol, day) => symbol === 'T00' && day === 2 ? { open: 85, low: 84, high: 100, close: 100 } : {} });
for (let index = 1; index < stopFixture.sessions.length; index++) {
  const row = stopFixture.sessions[index].prices.find(price => price.symbol === 'SPY');
  row.open = row.high = row.low = row.close = 90;
}
const normal = replayPolicy(request(stopFixture));
const scaled = run(draw, sidecar(stopFixture, draw).dataset);
const sourceStops = normal.fills.filter(fill => fill.side === 'sell' && fill.reason === 'initial-stop');
const researchStops = scaled.fills.filter(fill => fill.side === 'sell' && fill.reason === 'initial-stop');
assert(sourceStops.length > 0);
assert.deepEqual(researchStops, sourceStops, 'Gap-stop quantities/prices/reasons/timestamps preserved');
assert(sourceStops.every(fill => fill.price === 85 * (1 - 12 / 10000)));
assert.equal(scaled.fills.filter(fill => fill.side === 'buy' && fill.executedAt.startsWith(stopFixture.sessions[3].date)).length, 0, 'Existing exposure above scaled total capacity pauses replacement');
assert(normal.fills.some(fill => fill.side === 'buy' && fill.executedAt.startsWith(stopFixture.sessions[3].date)));
for (const sleeve of ['base', 'cooldown15', 'sector40']) {
  const before = scaled.accountTrace[1].sleeves[sleeve].positions;
  const after = scaled.accountTrace[3].sleeves[sleeve].positions;
  for (const symbol of ['T01', 'T02']) assert.equal(after[symbol].shares, before[symbol].shares);
}
receipts.push({ test: 'gap_stop_unchanged_existing_holdings_preserved_excess_capacity_pauses_additions', passed: true });

const breakerFixture = syntheticDataset({ length: 3, count: 12, bar: (symbol, day) => symbol.startsWith('T') && day === 2 ? { open: 85, low: 84, high: 85.1, close: 85 } : {} });
for (let index = 1; index < breakerFixture.sessions.length; index++) {
  const row = breakerFixture.sessions[index].prices.find(price => price.symbol === 'SPY');
  row.open = row.high = row.low = row.close = 90;
}
const breakerNormal = replayPolicy(request(breakerFixture));
const breakerScaled = run(draw, sidecar(breakerFixture, draw).dataset);
assert(breakerNormal.fills.some(fill => fill.reason === 'portfolio-drawdown-stop'));
assert(compareRuns(breakerNormal, breakerScaled).passed, 'Already-held source breaker/cooldown/pending full-state parity during regime activation');
receipts.push({ test: 'source_breaker_exit_cooldown_pending_and_held_state_unchanged_after_regime_activation', passed: true });

// Independent reference formula for simple-return sample realized volatility.
const closes = Array.from({ length: 21 }, (_, index) => 100 * (index % 2 ? 1.02 : 1));
const returns = closes.slice(1).map((value, index) => value / closes[index] - 1);
const mean = returns.reduce((sum, value) => sum + value, 0) / 20;
const expectedVol = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 19) * Math.sqrt(252) * 100;
assert(Math.abs(observableAt(closes, 20, definition(experiments.find(item => item.family === 'scale_volatility')).observable) - expectedVol) < 1e-12);
assert.throws(() => applyRegimeInputs(causal, draw, { calendar }), /warmup/);
const invalidWarmup = warmup(252, causal.sessions[0].date); invalidWarmup.splice(100, 1);
assert.throws(() => applyRegimeInputs(causal, draw, { calendar, benchmarkWarmupSessions: invalidWarmup }), /Missing\/nonmarket/);
assert.throws(() => buildRegimeOverlay({ ...draw, researchOverrides: { newExposureScaling: { ...draw.researchOverrides.newExposureScaling, combinedTrigger: true } } }), /Invalid/);
assert.throws(() => buildRegimeOverlay({ ...draw, sourceOverrides: { surprise: 1 } }), /additional/);
assert.throws(() => buildRegimeOverlay(draw).transform('lib/c1AccountSimulator.js', 'changed pinned source'), /seam changed/);
assert.equal(hash(fs.readFileSync(path.join(PROGRAM, 'experiments.json'))), hash(manifestBytes));
receipts.push({ test: 'volatility_reference_missing_warmup_gap_combined_trigger_source_drift_rejected', passed: true });

const report = {
  contract: 'c1-regime-synthetic-source-mechanics-v1', passed: true,
  scope: 'Artificial software fixtures only; no historical challenger performance, ranking, finalist, alpha or production readiness claims.',
  baselineId: pin.id, baselineCommit: pin.sourceCommit, baselineGraphSha256: pin.sourceGraphSha256,
  experimentsManifestSha256: hash(manifestBytes), preregisteredScaleSpecifications: experiments.map(item => item.id),
  historicalComparisonsRun: 0, productionModified: false, originalInputFilesModified: false,
  accounting: 'Source model floor followed by source actual sleeve floor; no fractional shares, forced sells or rebalancing.',
  loaderUnderTest: 'central research-loader.cjs with byte-pinned source adapter',
  remainingBlockers: ['Exact licensed matched archived inputs, including benchmark warmup, not yet available.', 'Historical causal-regime comparisons require all source/input preservation and baseline verification gates.'],
  receipts,
};
const output = path.resolve(process.argv[2] || path.join(__dirname, 'regime-mechanics-results.json'));
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, fixtures: receipts.length, historicalComparisonsRun: 0, output }));
