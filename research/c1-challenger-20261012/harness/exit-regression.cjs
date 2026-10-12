'use strict';

// Focused synthetic software checks. No raw historical/provider/account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildExitOverlay, FAMILY_KEYS, ORDINARY_NEEDLE, COUNTER } = require('./exit-overlay.cjs');
const { verifyBaseline } = require('../baselines/selection.cjs');
const { holdingFixture, allCashParityFixture } = require('./exit-fixtures.cjs');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const manifestBytes = fs.readFileSync(path.join(PROGRAM_ROOT, 'experiments.json'));
const manifest = JSON.parse(manifestBytes);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const definition = id => {
  const result = manifest.experiments.find(experiment => experiment.id === id);
  assert(result, 'Preregistered experiment missing: ' + id);
  return result;
};
const supported = manifest.experiments.filter(experiment => Object.hasOwn(FAMILY_KEYS, experiment.family));
const unitChecks = [];
for (const baselineId of ['audit-historical', 'production-equivalent']) {
  const baseline = verifyBaseline(baselineId);
  const source = fs.readFileSync(path.join(baseline.sourceRoot, 'lib/c1AccountSimulator.js'), 'utf8');
  const champion = buildExitOverlay(definition('champion'));
  assert.equal(champion.transform('lib/c1AccountSimulator.js', source), source);
  assert.deepEqual(champion.optionPatches, {});
  assert.deepEqual(champion.metadata.newPositionStateFields, []);
  for (const experiment of supported) {
    const overlay = buildExitOverlay(experiment);
    const transformed = overlay.transform('lib/c1AccountSimulator.js', source);
    assert.equal(overlay.transform('lib/c1FrozenOptions.js', source), source);
    if (experiment.family === 'ordinary_confirmation') {
      assert.notEqual(transformed, source);
      assert(transformed.includes('position.' + COUNTER));
      assert.equal(transformed.split(ORDINARY_NEEDLE).length, 1);
      assert.throws(() => overlay.transform('lib/c1AccountSimulator.js', transformed), /Pinned exit source seam changed/);
      assert.throws(() => overlay.transform('lib/c1AccountSimulator.js', source + '\n' + ORDINARY_NEEDLE), /Pinned exit source seam changed/);
      assert.throws(() => overlay.transform('lib/c1AccountSimulator.js', source.replace(ORDINARY_NEEDLE, '')), /Pinned exit source seam changed/);
    } else {
      assert.equal(transformed, source, 'Existing policy families keep all simulator expressions');
      assert.deepEqual(overlay.metadata.newPositionStateFields, []);
    }
    unitChecks.push({ baselineId, experimentId: experiment.id, passed: true,
      sourceExpressionsChanged: transformed !== source, counterFields: overlay.metadata.newPositionStateFields });
  }
  const ordinaryNoOp = buildExitOverlay({ id: 'software-only-no-op', family: 'ordinary_confirmation',
    sourceOverrides: {}, researchOverrides: { ordinaryRankExit: {
      minimumAgeSessions: 30, rankThreshold: 6, consecutiveCompletedSessions: 1 } } });
  assert.equal(ordinaryNoOp.transform('lib/c1AccountSimulator.js', source), source);
  assert.deepEqual(ordinaryNoOp.metadata.newPositionStateFields, []);
  verifyBaseline(baselineId);
}
assert.throws(() => buildExitOverlay({ family: 'ordinary_confirmation', sourceOverrides: {}, researchOverrides: {
  ordinaryRankExit: { minimumAgeSessions: 20, rankThreshold: 6, consecutiveCompletedSessions: 2 } } }), /preserve age30/);
assert.throws(() => buildExitOverlay({ family: 'early_rank', researchOverrides: {}, sourceOverrides: {
  C1_ACCOUNT_MOMENTUM_EXIT_POLICY: { earlyRankExitThreshold: 12, profitRankExitActivationPct: 25 } } }), /Unsupported exit overlay key/);
assert.throws(() => buildExitOverlay({ family: 'ordinary_hysteresis', researchOverrides: {}, sourceOverrides: {
  C1_FROZEN_OPTIONS_all_sleeves: { rankedExitBuffer: 8, minimumInitialStopPct: 10 } } }), /Unsupported exit overlay key/);

const report = {
  contract: 'c1-source-pinned-exit-synthetic-verification-v1', passed: true,
  scope: 'Invented offline sessions and normalized model seed balances only; no historical comparison, alpha evidence or production action.',
  historicalComparisonsRun: 0, productionModified: false, immutableSnapshotsModified: false,
  experimentsManifestSha256: digest(manifestBytes), unitChecks,
};
if (!process.argv.includes('--unit-only')) {
  const { makeResearchLoaderFactory } = require('./research-loader.cjs');
  const baselineId = 'production-equivalent';
  const baseline = verifyBaseline(baselineId);
  const { createProductionReplayLoader } = require(path.join(baseline.sourceRoot, 'tools/c1-production-replay-loader.cjs'));
  const engine = require(path.join(baseline.sourceRoot, 'tools/c1-production-policy-replay.cjs'));
  const { replayPolicy, compareRuns, stringifyAudit, parseAudit } = engine;
  const calendar = createProductionReplayLoader(baseline.sourceRoot).load('lib/marketSession.js');
  const plain = value => parseAudit(stringifyAudit(value));
  const loaderFor = (id, cost = 12, cached = false) => makeResearchLoaderFactory(id, { baselineId })(baseline.sourceRoot, { cached, slippageBps: cost });
  function simulated(id, fixtureOptions, cost = 12) {
    const fixture = holdingFixture(calendar, fixtureOptions);
    const loader = loaderFor(id, cost);
    const frozen = loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
    const simulate = loader.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio;
    const result = simulate(fixture.dataset, { ...frozen.base, startDate: fixture.dates[0],
      endDate: fixture.dates.at(-1), liquidateAtEnd: false }, fixture.seed);
    return { result: plain(result), dates: fixture.dates, fixture, loader };
  }
  const heldSales = run => run.result.trades.filter(trade => trade.symbol === 'HELD' && trade.side === 'sell');
  function assertExit(id, fixtureOptions, saleIndex, reason) {
    const run = simulated(id, fixtureOptions);
    const sales = heldSales(run);
    assert(sales.length > 0, 'Missing held exit: ' + id);
    assert.equal(sales[0].date, run.dates[saleIndex], 'Next-session-open exit timing: ' + id);
    assert.equal(sales[0].reason, reason, 'Source exit reason/precedence: ' + id);
    return { id, saleIndex, reason, passed: true };
  }
  report.noOp = [];
  for (const cost of [12, 25, 50]) {
    const dataset = allCashParityFixture(calendar);
    const request = { root: baseline.sourceRoot, dataset, slippageBps: cost,
      startDate: dataset.sessions[0].date, endDate: dataset.sessions.at(-1).date };
    const original = replayPolicy(request);
    const wrapped = replayPolicy({ ...request, loaderFactory: makeResearchLoaderFactory('champion', { baselineId }) });
    for (const field of ['metrics', 'curve', 'trades', 'fills', 'plans', 'accountTrace', 'final', 'simulatorTrace']) {
      assert.deepEqual(wrapped[field], original[field], 'Complete no-op economic/trace parity: ' + cost + ' ' + field);
    }
    assert.deepEqual(wrapped.sourcePin.sources, original.sourcePin.sources);
    assert.equal(wrapped.sourcePin.sourceGraphSha256, original.sourcePin.sourceGraphSha256);
    report.noOp.push({ costBps: cost, completeEconomicTraceParity: true,
      originalSourceGraphSha256: original.sourcePin.sourceGraphSha256 });
  }
  report.boundaries = [
    assertExit('ordinary_confirmation__sessions2', { ranks: [7, 6, 7, 7, 7], age: 30 }, 4, 'rank-deterioration'),
    assertExit('ordinary_confirmation__sessions3', { ranks: [7, 7, 6, 7, 7, 7, 7], age: 30 }, 6, 'rank-deterioration'),
    assertExit('ordinary_confirmation__sessions2', { ranks: [7, 7, 7, 7], age: 29 }, 3, 'rank-deterioration'),
    assertExit('ordinary_hysteresis__top8', { ranks: [8, 9, 9], age: 30 }, 2, 'rank-deterioration'),
    assertExit('ordinary_hysteresis__top10', { ranks: [10, 11, 11], age: 30 }, 2, 'rank-deterioration'),
    assertExit('early_confirmation__sessions4', { ranks: [10, 9, 10, 10, 10, 10, 10], age: 10 }, 6, 'early-rank-deterioration'),
    assertExit('early_confirmation__sessions5', { ranks: [10, 9, 10, 10, 10, 10, 10, 10], age: 10 }, 7, 'early-rank-deterioration'),
    assertExit('early_confirmation__sessions4', { ranks: [10, 10, 10, 10, 10, 10], age: 4 }, 5, 'early-rank-deterioration'),
    assertExit('early_rank__top12', { ranks: [12, 13, 13, 13, 13], age: 10 }, 4, 'early-rank-deterioration'),
    assertExit('early_rank__top15', { ranks: [15, 16, 16, 16, 16], age: 10 }, 4, 'early-rank-deterioration'),
    assertExit('profit_activation__peak15', { ranks: [7, 7, 7], age: 10, gainPct: 16 }, 2, 'profit-rank-deterioration'),
    assertExit('profit_activation__peak20', { ranks: [7, 7, 7], age: 10, gainPct: 21 }, 2, 'profit-rank-deterioration'),
    assertExit('profit_activation__peak15', { ranks: [7, 7, 7, 7], age: 4, gainPct: 16 }, 3, 'profit-rank-deterioration'),
    assertExit('profit_confirmation__sessions3', { ranks: [7, 7, 6, 7, 7, 7, 7], age: 10, gainPct: 13 }, 6, 'profit-rank-deterioration'),
    assertExit('profit_confirmation__sessions4', { ranks: [7, 7, 6, 7, 7, 7, 7, 7], age: 10, gainPct: 13 }, 7, 'profit-rank-deterioration'),
    assertExit('large_gain_deterioration__peak20_top9_2', { ranks: [10, 9, 10, 10, 10], age: 10, gainPct: 21 }, 4, 'profit-rank-deterioration'),
    assertExit('large_gain_deterioration__peak25_top9_2', { ranks: [10, 9, 10, 10, 10], age: 10, gainPct: 26 }, 4, 'profit-rank-deterioration'),
    assertExit('large_gain_deterioration__peak30_top9_2', { ranks: [10, 9, 10, 10, 10], age: 10, gainPct: 31 }, 4, 'profit-rank-deterioration'),
    assertExit('large_gain_deterioration__peak25_top9_2', { ranks: [10, 10, 10, 10], age: 10, gainPct: 24 }, 3, 'early-rank-deterioration'),
    assertExit('profit_confirmation__sessions3', { ranks: [7, 7, 7], age: 29, gainPct: 20 }, 2, 'rank-deterioration'),
    assertExit('early_confirmation__sessions5', { ranks: [10, 10, 10], age: 29 }, 2, 'rank-deterioration'),
    assertExit('large_gain_deterioration__peak25_top9_2', { ranks: [10, 10, 10], age: 29, gainPct: 30 }, 2, 'rank-deterioration'),
  ];
  for (const [id, gainPct] of [['profit_activation__peak15', 14], ['profit_activation__peak20', 19]]) {
    assert.equal(heldSales(simulated(id, { ranks: [7, 7, 7, 7], age: 10, gainPct })).length, 0,
      'Profit activation must retain unarmed profitable position: ' + id);
  }
  const unprofitableReset = simulated('profit_activation__peak15', {
    ranks: [7, 7, 7, 7, 7], age: 10, marks: [116, 100, 116, 116, 116], heldFraction: .2,
  });
  assert.equal(heldSales(unprofitableReset)[0].date, unprofitableReset.dates[4]);
  assert.equal(heldSales(unprofitableReset)[0].reason, 'profit-rank-deterioration');
  report.profitResetWhenNotProfitable = true;
  const retainedLargeWinner = simulated('large_gain_deterioration__peak25_top9_2', { ranks: [7, 7, 7], age: 10, gainPct: 26 });
  assert.equal(heldSales(retainedLargeWinner).length, 0, 'Large-gain rule requires meaningful Top9 deterioration');
  assert(heldSales(simulated('champion', { ranks: [7, 7, 7], age: 10, gainPct: 26 })).some(sale => sale.reason === 'profit-rank-deterioration'));
  report.largeGainRankDeteriorationIsRequired = true;
  const ordinaryReset = simulated('ordinary_confirmation__sessions2', { ranks: [7, 6], age: 30 });
  assert.equal(ordinaryReset.result.openPositions.find(position => position.symbol === 'HELD')[COUNTER], 0);
  report.ordinaryCounterResetsOnRetainedRank = true;

  report.hardControls = [];
  const representatives = ['ordinary_confirmation__sessions3', 'ordinary_hysteresis__top10',
    'early_confirmation__sessions5', 'early_rank__top15', 'profit_activation__peak20',
    'profit_confirmation__sessions4', 'large_gain_deterioration__peak30_top9_2'];
  const riskFixtures = [
    { id: 'intraday_stop', reason: 'initial-stop', options: { ranks: [1, 1, 1], age: 10,
      bars: (symbol, day) => symbol === 'HELD' && day === 1 ? { low: 84 } : {} } },
    { id: 'gap_stop', reason: 'initial-stop', options: { ranks: [1, 1, 1], age: 10,
      heldFraction: .2, marks: [100, 80, 80] } },
    { id: 'sleeve_breaker', reason: 'portfolio-drawdown-stop', options: { ranks: [1, 1, 1], age: 10,
      marks: [100, 88, 88] } },
    { id: 'universe_removal', reason: 'universe-removal', options: { ranks: [1, 1, 1], age: 10, removalDay: 1 } },
  ];
  for (const fixture of riskFixtures) {
    const reference = simulated('champion', fixture.options);
    const expected = heldSales(reference)[0];
    assert(expected && expected.reason === fixture.reason, 'Risk fixture must exercise source control: ' + fixture.id);
    for (const id of representatives) {
      const changed = simulated(id, fixture.options);
      const sale = heldSales(changed)[0];
      assert.equal(sale.reason, expected.reason, 'Unchanged hard-risk reason: ' + id);
      assert.equal(sale.date, expected.date, 'Unchanged hard-risk date: ' + id);
      assert.equal(sale.price, expected.price, 'Unchanged hard-risk cost/fill: ' + id);
      assert.deepEqual(changed.result.accountRisk, reference.result.accountRisk, 'Unchanged risk/cooldown state: ' + id);
      report.hardControls.push({ fixture: fixture.id, experimentId: id, sourceControlUnchanged: true });
    }
  }
  report.confirmationCacheParity = [];
  for (const cost of [12, 25, 50]) {
    const dataset = allCashParityFixture(calendar, 36);
    // Only invented AAA rank deteriorates at source holding age30; all prices
    // remain flat. The source execution/account engine owns every transaction.
    for (let day = 0; day < dataset.sessions.length; day++) {
      const session = dataset.sessions[day];
      for (let index = 0; index < session.prices.length; index++) {
        const row = session.prices[index];
        const base = row.symbol === 'AAA' ? 300.3 : row.symbol === 'BBB' ? 10 : row.symbol === 'CCC' ? 110 : 80 + index;
        Object.assign(row, { open: base, high: base * 1.001, low: base * .999, close: base });
      }
      for (let index = 0; index < session.signals.length; index++) {
        const signal = session.signals[index];
        signal.price = session.prices[index].close;
        signal.researchFactors.momentumPercentile = signal.symbol === 'SCHW' ? 101 : signal.symbol === 'MSTR' ? 102 :
          signal.symbol === 'AAA' ? (day >= 31 ? 1 : 100) : 99 - index;
      }
    }
    const request = { root: baseline.sourceRoot, dataset, slippageBps: cost,
      startDate: dataset.sessions[0].date, endDate: dataset.sessions.at(-1).date,
      loaderFactory: makeResearchLoaderFactory('ordinary_confirmation__sessions2', { baselineId }) };
    const cached = replayPolicy({ ...request, cached: true });
    const uncached = replayPolicy({ ...request, cached: false });
    assert(compareRuns(cached, uncached).passed, 'Confirmation complete cached/uncached trace parity at ' + cost);
    assert(cached.fills.some(fill => fill.symbol === 'AAA' && fill.side === 'sell' && fill.reason === 'rank-deterioration'));
    assert(cached.accountTrace[31].sleeves.base.state.some(position => position.symbol === 'AAA' && position[COUNTER] === 1));
    report.confirmationCacheParity.push({ costBps: cost, completeEconomicTraceParity: true,
      sourcePositionCounterCaptured: true });
  }
  verifyBaseline(baselineId);
  report.integrationCompleted = true;
} else report.integrationCompleted = false;
assert.equal(digest(fs.readFileSync(path.join(PROGRAM_ROOT, 'experiments.json'))), digest(manifestBytes));
const output = path.resolve(__dirname, process.argv.includes('--unit-only') ? 'exit-unit-results.json' : 'exit-mechanics-results.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, unitChecks: unitChecks.length, integrationCompleted: report.integrationCompleted,
  noOpCosts: report.noOp?.length || 0, boundaryChecks: report.boundaries?.length || 0,
  hardControlChecks: report.hardControls?.length || 0, historicalComparisonsRun: 0, output }));
