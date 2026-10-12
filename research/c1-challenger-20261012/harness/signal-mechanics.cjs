'use strict';
// Invented OHLC and invented cross-sectional rows only. These checks certify
// software seams, never the licensed dataset, alpha, replay or market results.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeResearchLoaderFactory } = require('./research-loader.cjs');
const { createSourceTransformLoader } = require('./source-transform-loader.cjs');
const { buildSignalOverlay, COMPILER_PATH, SOURCE_HORIZONS, SOURCE_WEIGHTS } = require('./signal-overlay.cjs');
const { readPublishedInputReceipts, assertPrivateStorageAcceptance, compileSignalInputBatch } = require('./signal-input.cjs');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const matrix = require('../experiments.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b, message) => assert.deepEqual(clone(a), clone(b), message);
const SOURCE_CONTROLS = {
  horizon: { momentumHorizons: SOURCE_HORIZONS },
  global_sector: { momentumWeights: SOURCE_WEIGHTS },
  slow_fast: { momentumWeights: SOURCE_WEIGHTS, aggregateSlowFraction: 0.62,
    method: 'equal shift of within-component slow fractions from exact source values' },
};
function inventedRaw(loader) {
  const { isUsMarketSessionDay } = loader.load('lib/marketSession.js');
  const dates = [];
  for (let time = Date.parse('2024-01-02T12:00:00Z'); dates.length < 266; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (isUsMarketSessionDay(date)) dates.push(date);
  }
  const symbols = ['A', 'B', 'C', 'D', 'LIQFAIL', 'MISSING', 'SHORT', 'SPY', 'QQQ'];
  const closeAt = (symbol, index) => {
    const k = ['A', 'B'].includes(symbol) ? 0 : symbols.indexOf(symbol);
    const level = symbol === 'LIQFAIL' ? 0.4 : 70 + k * 12;
    const slope = ['A', 'B'].includes(symbol) ? 0.0014 : 0.0002 + k * 0.00035;
    const bend = ['C', 'LIQFAIL', 'MISSING'].includes(symbol) ? -0.000009 : 0.00001;
    return level * Math.exp(slope * index + bend * Math.max(0, index - 155) ** 2 +
      0.035 * Math.sin(index / (12 + k)));
  };
  return {
    metadata: { pointInTime: true, source: 'invented OHLC software fixture; no historical performance evidence', benchmarkSymbol: 'SPY' },
    securities: symbols.map(symbol => ({ symbol, name: 'Invented ' + symbol,
      sector: ['A', 'B', 'LIQFAIL'].includes(symbol) ? 'Technology' : 'Health Care',
      listedAt: '2020-01-01', isEtf: ['SPY', 'QQQ'].includes(symbol), isFund: false })),
    fundamentals: [], events: [],
    sessions: dates.map((date, index) => ({ date, decisionAt: date + 'T21:30:00.000Z',
      universeSymbols: symbols.filter(symbol => !['SPY', 'QQQ'].includes(symbol)), corporateActions: [],
      prices: symbols.filter(symbol => !(symbol === 'SHORT' && index < 14) &&
        !(symbol === 'MISSING' && index === 265)).map(symbol => {
          const close = closeAt(symbol, index);
          return { symbol, date, open: close * 0.997, high: close * 1.02, low: close * 0.98,
            close, volume: symbol === 'LIQFAIL' ? 1 : 6_000_000, adjusted: true };
        }),
    })),
  };
}
function compile(api, raw) {
  const result = api.compilePointInTimeSignals(raw, { minimumHistoryRows: 253,
    liquidity: { maxCandidates: 500 }, resume: { sessions: [], completedSessions: 251, decisionMemory: [] }, maxSessions: 15 });
  delete result.metadata.generatedAt;
  return result;
}
function nonMomentum(value) {
  const changed = new Set(['researchMomentumSlowReturn', 'researchMomentumFastReturn', 'momentumPercentile',
    'compositeScore', 'globalCompositePercentile', 'sectorCompositePercentile']);
  if (Array.isArray(value)) return value.map(nonMomentum);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !changed.has(key)).map(([key, child]) => [key, nonMomentum(child)]));
  return value;
}
function quoteFixture(api, raw, symbol = 'C') {
  const history = raw.sessions.flatMap(session => session.prices.filter(bar => bar.symbol === symbol));
  return api.buildHistoricalQuote({ profile: raw.securities.find(row => row.symbol === symbol),
    bar: history.at(-1), history, fundamental: null, decisionAt: raw.sessions.at(-1).decisionAt });
}
function expectedReturn(history, horizon) {
  const end = history.length - 1 - horizon.excludeRecentSessions;
  const start = history.length - 1 - horizon.totalLookbackSessions;
  return ((history[end].close - history[start].close) / history[start].close) * 100;
}
function runSignalMechanics() {
  const factory = makeResearchLoaderFactory('champion', { baselineId: 'production-equivalent' });
  const root = factory.baseline.sourceRoot;
  const source = fs.readFileSync(path.join(root, COMPILER_PATH), 'utf8');
  const pristine = require(path.join(root, 'tools/c1-production-replay-loader.cjs')).createProductionReplayLoader(root, { cached: false });
  pristine.load('lib/c1FrozenOptions.js'); // Match the central factory's module preload.
  const pristineApi = pristine.load(COMPILER_PATH);
  const champion = factory(root, { cached: false });
  const championApi = champion.load(COMPILER_PATH);
  const raw = inventedRaw(champion);
  const rawHash = sha256(JSON.stringify(raw));
  const championOutput = compile(championApi, raw);
  equal(championOutput, compile(pristineApi, raw), 'Full no-op source compiler output parity');
  equal(champion.identity(), pristine.identity(), 'No-op compiler/replay source identity parity');
  const tests = [{ id: 'champion', passed: true, exactFullCompilerNoOpParity: true }];
  for (const [family, researchOverrides] of Object.entries(SOURCE_CONTROLS)) {
    const overlay = buildSignalOverlay({ id: family + '__synthetic_source_control', family,
      sourceOverrides: {}, researchOverrides });
    assert.equal(overlay.metadata.noOp, true, 'Source-valued seam control must be no-op');
    assert.equal(overlay.transform(COMPILER_PATH, source), source, 'Source-valued transform bytes must remain exact');
    const control = createSourceTransformLoader(root, { cached: false }, overlay.transform).load(COMPILER_PATH);
    equal(compile(control, raw), championOutput, 'Full compiler control parity: ' + family);
  }
  assert.equal(championOutput.sessions[0].positionSignals.length, 0, '252 observations cannot enter any percentile cohort');
  assert.equal(championOutput.sessions[1].positionSignals.length, 6, '253 observations establish source cohort before percentiles');
  assert.equal(championOutput.sessions.at(-1).positionSignals.length, 5);
  assert.ok(!championOutput.sessions.at(-1).positionSignals.some(row => ['SHORT', 'MISSING'].includes(row.symbol)),
    'Short history and missing current bars preserve exact source exclusions');
  const final = championOutput.sessions.at(-1).positionSignals;
  assert.ok(final.some(row => row.symbol === 'LIQFAIL'), 'Illiquid reference name remains in full percentile pool');
  assert.equal(final.find(row => row.symbol === 'A').researchFactors.momentumPercentile,
    final.find(row => row.symbol === 'B').researchFactors.momentumPercentile, 'Identical prices yield midpoint ties');
  const withoutIlliquid = clone(raw);
  withoutIlliquid.securities = withoutIlliquid.securities.filter(row => row.symbol !== 'LIQFAIL');
  const thinOutput = compile(championApi, withoutIlliquid);
  assert.notEqual(thinOutput.sessions.at(-1).positionSignals.find(row => row.symbol === 'A').researchFactors.momentumPercentile,
    final.find(row => row.symbol === 'A').researchFactors.momentumPercentile,
    'Ineligible reference name affects ranks; post-eligibility recomputation is incompatible');
  const missingRows = [
    { symbol: 'X', sector: 'Technology', return120Ex20: 12, return60Ex5: 7 },
    { symbol: 'Y', sector: 'Technology', return120Ex20: 12, return60Ex5: 7 },
    { symbol: 'Z', sector: 'Health Care', return120Ex20: null, return60Ex5: 15 },
    { symbol: 'NONE', sector: 'Health Care', return120Ex20: null, return60Ex5: null },
  ];
  const missingSource = championApi.attachCrossSectionalResearchFactors(missingRows);
  assert.equal(missingSource.find(row => row.symbol === 'NONE').researchFactors.momentumPercentile, null);
  const preparedFixture = { raw, minimumHistoryRows: 253, maxCandidates: 500, summary: {
    sessionCohorts: raw.sessions.slice(251).map((session, i) => {
      const cohort = i === 0 ? [] : (i === 14 ? ['A', 'B', 'C', 'D', 'LIQFAIL'] : ['A', 'B', 'C', 'D', 'LIQFAIL', 'MISSING']);
      return { date: session.date, current253: cohort.length, current253SymbolsSha256: sha256(JSON.stringify(cohort)) };
    }),
  } };
  const sourceCompactor = champion.load('lib/replayDatasetCompaction.js').compactReplaySession;
  const championBatch = compileSignalInputBatch({ prepared: preparedFixture, loader: champion,
    sourceRoot: root, start: 251, count: 15 });
  equal(championBatch.sessions, championOutput.sessions.map(sourceCompactor), 'Batch pipeline executes actual source compiler and source compactor');
  for (const experiment of matrix.experiments.filter(row => ['horizon', 'global_sector', 'slow_fast'].includes(row.family))) {
    const researchFactory = makeResearchLoaderFactory(experiment.id, { baselineId: 'production-equivalent' });
    const loader = researchFactory(root, { cached: false });
    const api = loader.load(COMPILER_PATH);
    const output = compile(api, raw);
    const batch = compileSignalInputBatch({ prepared: preparedFixture, loader, sourceRoot: root, start: 251, count: 15 });
    equal(batch.sessions, output.sessions.map(sourceCompactor), 'Signal batch pipeline parity: ' + experiment.id);
    equal(nonMomentum(output), nonMomentum(championOutput), 'Every non-momentum source field preserved: ' + experiment.id);
    const metadata = loader.identity().researchOverlay;
    assert.equal(metadata.baselineId, 'production-equivalent');
    assert.equal(metadata.semantics.sourceExpressionsChanged, true);
    assert.equal(metadata.semantics.supported, true);
    assert.notEqual(loader.transforms[COMPILER_PATH].adaptedSha256, loader.transforms[COMPILER_PATH].originalSha256);
    const quote = quoteFixture(api, raw);
    equal(nonMomentum(quote), nonMomentum(quoteFixture(championApi, raw)), 'Historical quote non-momentum parity');
    if (experiment.family === 'horizon') {
      const history = raw.sessions.map(session => session.prices.find(bar => bar.symbol === 'C'));
      const horizons = experiment.researchOverrides.momentumHorizons;
      assert.equal(quote.researchMomentumSlowReturn, expectedReturn(history, horizons.slow), 'Slow total/excluded endpoints');
      assert.equal(quote.researchMomentumFastReturn, expectedReturn(history, horizons.fast), 'Fast total/excluded endpoints');
      // Original same-named fields stay fixed; only separate momentum aliases
      // use alternate horizons, preserving acceleration/leadership diagnostics.
      assert.equal(quote.return120Ex20, quoteFixture(championApi, raw).return120Ex20);
      assert.equal(quote.return60Ex5, quoteFixture(championApi, raw).return60Ex5);
      const aliases = missingRows.map(row => ({ ...row,
        researchMomentumSlowReturn: row.return120Ex20, researchMomentumFastReturn: row.return60Ex5 }));
      equal(nonMomentum(api.attachCrossSectionalResearchFactors(aliases)), nonMomentum(missingSource), 'Horizon aliases retain missing/tie source semantics');
    } else {
      const missingResult = api.attachCrossSectionalResearchFactors(missingRows);
      assert.equal(missingResult.find(row => row.symbol === 'NONE').researchFactors.momentumPercentile, null);
      equal(nonMomentum(missingResult), nonMomentum(missingSource), 'Missing inputs preserve every other factor');
      assert.equal(missingResult[0].researchFactors.momentumPercentile, missingResult[1].researchFactors.momentumPercentile);
    }
    tests.push({ id: experiment.id, family: experiment.family, passed: true,
      fullCompilerNonMomentumParity: true, sourcePoolAndHistoryGatePreserved: true,
      fullCompilerSourceHashRecorded: true, alteredMomentumScoreCount: output.sessions.reduce((sum, session, i) => sum +
        session.positionSignals.filter((row, j) => row.researchFactors.momentumPercentile !==
          championOutput.sessions[i].positionSignals[j].researchFactors.momentumPercentile).length, 0) });
  }
  assert.equal(sha256(JSON.stringify(raw)), rawHash, 'Invented original OHLC fixture unchanged');
  assert.throws(() => buildSignalOverlay(matrix.experiments.find(row => row.family === 'horizon')).transform(COMPILER_PATH, source + '\n'), /hash mismatch/);
  assert.throws(() => buildSignalOverlay({ id: 'invalid', family: 'horizon', sourceOverrides: {}, researchOverrides: {
    momentumHorizons: { slow: { totalLookbackSessions: 120, excludeRecentSessions: 20, includedReturnSessions: 120 },
      fast: SOURCE_HORIZONS.fast } } }), /included = total - excluded/);
  assert.throws(() => buildSignalOverlay({ id: 'invalid', family: 'global_sector', sourceOverrides: {}, researchOverrides: {
    momentumWeights: { globalSlow: 0.496, globalFast: 0.304, sectorSlow: 0.124, sectorFast: 0.076 } } }), /distinct source/);
  assert.throws(() => assertPrivateStorageAcceptance({}), /provider-permitted licensing/);
  assert.throws(() => compileSignalInputBatch({ prepared: null, loader: champion, sourceRoot: root, start: 0, count: 1 }),
    /Prepared exact inputs/);
  const receipts = readPublishedInputReceipts();
  assert.equal(receipts.accepted.originalChunks.length, 24);
  return {
    contract: 'c1-signal-overlay-synthetic-software-mechanics-v1', passed: true, tests,
    syntheticCompilerControls: Object.keys(SOURCE_CONTROLS),
    fixture: { inventedOnly: true, sessions: raw.sessions.length, source253FirstCohortCount: 6,
      finalCohortCount: 5, rawInputHashUnchanged: true, historicalPerformanceEvidence: false },
    independentChecks: ['full compiler no-op output and source identity parity', 'all non-momentum fields preserved',
      '253-row history gate before full-pool percentiles', 'tied midpoint ranks', 'missing inputs retain source handling',
      'illiquid reference pool retained', 'missing-current-bar and short-history exclusions',
      'exact horizon endpoints use total minus excluded', 'exact source-specific global/sector internal ratios',
      'equal slow-fraction shift preserves distinct within-component source ratios',
      'batched recompilation uses actual compiler/compactor and preserves manual full-cohort identities',
      'modified source, malformed horizon, incorrect ratios and absent licensed storage rejected'],
    rawLicensedDatasetAccessible: false, historicalReplaysRun: 0,
    productionBaselinePerformanceVerified: false, audit289PerformanceReproduced: false,
    historicalPerformanceClaim: false, productionChanged: false,
  };
}
if (require.main === module) {
  const result = runSignalMechanics();
  fs.writeFileSync(path.join(__dirname, 'signal-mechanics-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, challengerChecks: result.tests.length - 1,
    fullCompilerControls: result.syntheticCompilerControls.length, historicalReplaysRun: 0 }));
}
module.exports = { runSignalMechanics, inventedRaw, nonMomentum };
