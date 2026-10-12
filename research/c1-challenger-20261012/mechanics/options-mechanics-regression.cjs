const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_ROOT, PROGRAM_ROOT, MANIFEST_PATH, FAMILIES, SLEEVES, resolveExperiment, verifySnapshot, makeOptionsLoaderFactory } = require('./options-loader.cjs');
const { syntheticDataset, sourceRegressionFixture } = require('./synthetic-fixtures.cjs');
const { replayPolicy, compareRuns, stringifyAudit } = require(path.join(SOURCE_ROOT, 'tools/c1-production-policy-replay.cjs'));
const { digest } = require(path.join(SOURCE_ROOT, 'tools/c1-production-replay-loader.cjs'));
const { createResearchModuleLoader } = require(path.join(SOURCE_ROOT, 'tools/research-module-loader.cjs'));
const output = path.resolve(process.argv[2] || path.join(__dirname, 'options-mechanics-results.json'));
const manifestHash = digest(fs.readFileSync(MANIFEST_PATH));
function request(dataset, cost = 12, extras = {}) {
  return { root: SOURCE_ROOT, dataset, slippageBps: cost, startDate: dataset.sessions[0].date, endDate: dataset.sessions.at(-1).date, ...extras };
}
function run(id, dataset, cost = 12, extras = {}) {
  return replayPolicy({ ...request(dataset, cost, extras), loaderFactory: makeOptionsLoaderFactory(id) });
}
function literalOverlayFactory(id) {
  const definition = resolveExperiment(id);
  return (root, { slippageBps }) => {
    const loader = createResearchModuleLoader(root);
    const { C1_FROZEN_OPTIONS } = loader.load('lib/c1FrozenOptions.js');
    for (const sleeve of SLEEVES) Object.assign(C1_FROZEN_OPTIONS[sleeve], { slippageBps }, definition.overrides[sleeve]);
    return { ...loader, stats: {}, traceBySleeve: {}, identity: () => ({ unmodifiedSourceExpressions: true }) };
  };
}
const noOp = [];
for (const cost of [12, 25, 50]) {
  const dataset = sourceRegressionFixture();
  const reference = replayPolicy(request(dataset, cost));
  const wrapped = run('champion', dataset, cost);
  assert.deepEqual(wrapped, reference, 'Complete no-op replay must match every output and identity at ' + cost + ' bps');
  noOp.push({ costBps: cost, entireOutputMatches: true, outputSha256: digest(stringifyAudit(reference)) });
}
const experiments = JSON.parse(fs.readFileSync(MANIFEST_PATH)).experiments;
const accepted = experiments.filter(item => Object.hasOwn(FAMILIES, item.family));
const baseFixture = syntheticDataset();
const optionParity = [];
for (const experiment of accepted) {
  const cached = run(experiment.id, baseFixture);
  const uncached = run(experiment.id, baseFixture, 12, { cached: false });
  assert(compareRuns(cached, uncached).passed, 'Cached/uncached options parity: ' + experiment.id);
  const literal = replayPolicy({ ...request(baseFixture), loaderFactory: literalOverlayFactory(experiment.id) });
  for (const field of ['metrics', 'curve', 'trades', 'fills', 'plans', 'accountTrace', 'final']) assert.deepEqual(cached[field], literal[field], 'Literal source with same option export: ' + experiment.id + ' ' + field);
  optionParity.push({ id: experiment.id, cachedUncachedParity: true, literalSourceParity: true });
}
const queues = [];
for (const [id, depth] of [['entry_queue__depth6', 6], ['champion', 9], ['entry_queue__depth12', 12], ['entry_queue__depth15', 15]]) {
  const result = run(id, syntheticDataset({ length: 2, count: 24 }));
  for (const sleeve of SLEEVES) {
    const trace = result.accountTrace[1].sleeves[sleeve];
    const held = new Set(Object.keys(trace.positions));
    const pending = trace.pending.filter(order => order.side === 'buy');
    assert.equal(pending.length, depth);
    assert(pending.every(order => !held.has(order.symbol)));
    assert.equal(pending[0].symbol, 'T03');
    assert.equal(pending.at(-1).symbol, 'T' + String(depth + 2).padStart(2, '0'));
  }
  queues.push({ experimentId: id, depth, firstUnheldCandidate: 'T03', lastUnheldCandidate: 'T' + String(depth + 2).padStart(2, '0'), heldExcludedBeforeQueueTruncation: true });
}
const advCases = [];
const volumes = [250e6, 450e6, 650e6, 850e6];
const advFixture = syntheticDataset({ length: 2, count: 4, adv: index => volumes[index] });
for (const [id, minimum] of [['adv__usdm200', 200e6], ['champion', 300e6], ['adv__usdm500', 500e6], ['adv__usdm750', 750e6]]) {
  const result = run(id, advFixture);
  const expected = volumes.map((adv, index) => adv >= minimum ? 'T' + String(index).padStart(2, '0') : null).filter(Boolean);
  const firstQueue = result.accountTrace[0].sleeves.base.pending.filter(order => order.side === 'buy').map(order => order.symbol);
  assert.deepEqual(firstQueue, expected);
  advCases.push({ experimentId: id, minimumAverageDollarVolume: minimum, qualifyingSyntheticSymbols: expected });
}
const falseLiquidity = run('adv__usdm200', syntheticDataset({ length: 2, count: 4, adv: () => 1e9, liquidityPass: index => index !== 0 }));
assert(!falseLiquidity.fills.some(fill => fill.symbol === 'T00'));
const slots = [];
for (const [id, count] of [['slots__slots2', 2], ['champion', 3], ['slots__slots4', 4], ['slots__slots5', 5]]) {
  for (const sameSector of [false, true]) {
    const result = run(id, syntheticDataset({ length: 2, count: 18, sameSector }));
    const counts = Object.fromEntries(SLEEVES.map(sleeve => [sleeve, Object.keys(result.accountTrace[1].sleeves[sleeve].positions).length]));
    if (!sameSector) assert(Object.values(counts).every(value => value === count));
    else assert(Object.values(counts).every(value => value <= 2));
    const issuerCount = new Set(SLEEVES.flatMap(sleeve => Object.keys(result.accountTrace[1].sleeves[sleeve].positions))).size;
    slots.push({ experimentId: id, slotsPerSleeve: count, sectors: sameSector ? 'all_shared' : 'all_distinct', filledPositionsPerSleeve: counts, combinedUniqueSymbols: issuerCount, syntheticUtilizationPct: (1 - result.curve[1].cash / result.curve[1].equity) * 100 });
  }
}
const sectors = [];
for (const id of ['sector_caps__stronger', 'champion', 'sector_caps__permissive', 'sector_position_limit__max1', 'sector_position_limit__max3']) {
  const result = run(id, syntheticDataset({ length: 2, count: 18, sameSector: true }));
  const options = makeOptionsLoaderFactory(id)(SOURCE_ROOT).load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
  const bySleeve = {};
  for (const sleeve of SLEEVES) {
    const trace = result.accountTrace[1].sleeves[sleeve];
    const invested = Object.values(trace.positions).reduce((sum, position) => sum + position.shares * 100, 0);
    const exposure = invested / trace.equity;
    assert(Object.keys(trace.positions).length <= options[sleeve].maxSectorPositions);
    assert(exposure <= options[sleeve].maxSectorPct + 1e-6);
    bySleeve[sleeve] = { dollarCap: options[sleeve].maxSectorPct, countCap: options[sleeve].maxSectorPositions, filledPositions: Object.keys(trace.positions).length, syntheticSectorExposurePct: exposure * 100 };
  }
  sectors.push({ experimentId: id, bySleeve });
}
const stopFixture = syntheticDataset({ length: 3, count: 3, bar: (symbol, day, price) => day === 2 && symbol.startsWith('T') ? { low: 87, high: 101, close: 100, open: 100 } : {} });
const stops = [];
for (const id of ['initial_stop__pct12', 'champion', 'initial_stop__pct16']) {
  const result = run(id, stopFixture);
  const stopSales = result.fills.filter(fill => fill.side === 'sell' && fill.reason === 'initial-stop');
  if (id === 'initial_stop__pct12') assert(stopSales.length > 0);
  else assert.equal(stopSales.length, 0);
  stops.push({ experimentId: id, stopSales: stopSales.length, syntheticLow: 87 });
}
const breakerFixture = syntheticDataset({ length: 3, count: 3, bar: (symbol, day) => day === 2 && symbol.startsWith('T') ? { low: 88, high: 88.1, close: 88, open: 88 } : {} });
const breakers = [];
for (const id of ['sleeve_breaker__pct10', 'champion', 'sleeve_breaker__pct14']) {
  const result = run(id, breakerFixture);
  const breakerSales = result.fills.filter(fill => fill.side === 'sell' && fill.reason === 'portfolio-drawdown-stop');
  if (id === 'sleeve_breaker__pct10') assert(breakerSales.length > 0);
  else assert.equal(breakerSales.length, 0);
  breakers.push({ experimentId: id, breakerSales: breakerSales.length, cooldowns: Object.fromEntries(SLEEVES.map(sleeve => [sleeve, makeOptionsLoaderFactory(id)(SOURCE_ROOT).load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS[sleeve].portfolioDrawdownCooldownSessions])) });
}
const affordability = [];
for (const cost of [12, 25, 50]) {
  const result = run('champion', syntheticDataset({ length: 2, count: 3, price: 82.3 }), cost, { initialCapital: 1000 });
  for (const fill of result.fills.filter(fill => fill.side === 'buy')) {
    assert.equal(fill.price, 82.3 * (1 + cost / 10000));
    assert(Number.isSafeInteger(fill.shares) && fill.shares > 0);
  }
  assert(result.curve.every(point => point.cash >= 0));
  affordability.push({ costBps: cost, openingBuys: result.fills.filter(fill => fill.side === 'buy').map(fill => ({ sleeve: fill.sleeve, symbol: fill.symbol, shares: fill.shares, price: fill.price })), endingCash: result.curve[1].cash });
}
assert.notDeepEqual(affordability[0].openingBuys.map(fill => [fill.sleeve, fill.symbol, fill.shares]), affordability[2].openingBuys.map(fill => [fill.sleeve, fill.symbol, fill.shares]), 'Costs must alter whole-share affordability/path at a constructed sizing boundary');
for (const id of ['ordinary_hysteresis__top8', 'ordinary_confirmation__sessions2', 'profit_activation__peak15', 'horizon__s100ex15_f50ex5', 'scale_drawdown__trigger8_restore5']) assert.throws(() => makeOptionsLoaderFactory(id), /separately verified research seam/);
const snapshot = verifySnapshot();
assert.equal(digest(fs.readFileSync(MANIFEST_PATH)), manifestHash, 'Experiment manifest must remain fixed during verification');
const report = {
  contract: 'c1-options-only-synthetic-mechanics-verification-v1', passed: true,
  scope: 'Synthetic software mechanics only; no historical comparison, challenger ranking, finalist or alpha evidence.',
  historicalComparisonsRun: 0, productionModified: false, importedSnapshotModified: false,
  experimentsManifestSha256: manifestHash, eligibleForAlphaClaim: false,
  snapshot, noOp, optionParity, queues, advCases, falseLiquidityFlagRemainsBlocking: true,
  slots, sectors, stops, breakers, affordability,
  acceptedFamilies: Object.keys(FAMILIES),
  unsupportedFamilies: [...new Set(experiments.map(item => item.family).filter(family => !Object.hasOwn(FAMILIES, family)))],
  knownBoundaries: [
    'Queue depth applies after already-held names are removed from the source simulator candidate queue; it does not implement operational selected-sector/max-three Buy verification.',
    'The ADV option retains source liquidityPass; current compiler base flag has a $10m floor, below every planned $200m+ ADV experiment. False or absent evidence is never manufactured into true.',
    'Slots are per independent sleeve; dollar sector caps, sector-count caps, $750 model minimum trade and production double-floor rounding remain binding.',
    'All-cash synthetic adoption avoids inherited seed positions whose source initialization stop is fixed at14%; future inherited-position research would need separate explicit treatment.',
    'No momentum-exit expression or new confirmation/regime state is implemented by this wrapper.',
    'Historical execution remains blocked pending verified private input restoration and deployed-versus-audit provenance checks.',
  ],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, noOpCosts: noOp.length, optionsVerified: optionParity.length, acceptedFamilies: report.acceptedFamilies, historicalComparisonsRun: 0, output }));
