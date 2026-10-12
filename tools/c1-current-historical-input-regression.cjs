const assert = require('node:assert/strict');
const { currentCompiler, projectConditionalProfiles, compileCurrentBatch, prepareRawInput } = require('./c1-build-current-historical-input.cjs');
const compiler = currentCompiler(process.cwd(), 'nasdaq');
const { isUsMarketSessionDay } = compiler.loader.load('lib/marketSession.js');
const dates = [];
for (let time = Date.parse('2025-06-02T12:00:00Z'); dates.length < 260; time += 86400000) {
  const date = new Date(time).toISOString().slice(0, 10);
  if (isUsMarketSessionDay(date)) dates.push(date);
}
const members = Array.from({ length: 90 }, (_, index) => ({
  symbol: 'T' + index, name: 'Fixture ' + index, sector: 'Sector ' + index % 5, cik: String(index + 1) }));
const sanitized = compiler.live.c1LiveMembers('nasdaq', members);
assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), projectConditionalProfiles(members), 'Conditional scalar projection must equal actual source for valid profiles');
assert.ok(sanitized.every(row => !('cik' in row)), 'Use current live profile sanitation before issuer classification');
const invalidSectorMembers = structuredClone(members); invalidSectorMembers[0].sector = 'Other';
assert.throws(() => compiler.live.c1LiveMembers('nasdaq', invalidSectorMembers), /Current sector is missing/);
assert.equal(projectConditionalProfiles(invalidSectorMembers).find(row => row.symbol === members[0].symbol).sector, 'Other', 'Conditional metadata retains the observed source-invalid sector');
const fiveHundredMembers = Array.from({ length: 500 }, (_, index) => ({
  symbol: 'S' + index, name: 'Original issuer ' + index, sector: index < 20 ? 'Other' : 'Technology', cik: String(index + 1) }));
assert.throws(() => compiler.live.c1LiveMembers('sp500', fiveHundredMembers), /Current sector is missing/);
assert.throws(() => compiler.live.c1LiveMembers('sp500', fiveHundredMembers.filter(row => row.sector !== 'Other')), /Index membership count is outside/,
  'Removing invalid sectors before scalar projection reproduces the artificial 480-member adapter bug');
const projectedFiveHundred = projectConditionalProfiles(fiveHundredMembers);
assert.equal(projectedFiveHundred.length, 500, 'Conditional metadata preserves the full observed member count');
assert.equal(projectedFiveHundred.filter(row => row.sector === 'Other').length, 20, 'Every source-invalid label is retained');
assert.ok(projectedFiveHundred.every(row => !('cik' in row)));
const symbols = [...sanitized.map(row => row.symbol), 'SPY', 'QQQ'];
const histories = Object.fromEntries(symbols.map((symbol, index) => [symbol,
  dates.filter((date, day) => symbol !== 'T89' || day >= 8).map((date, day) => {
    const close = 100 + day * (.1 + index / 1000);
    return { date, open: close - .1, high: close + 1, low: close - 1, close, volume: 10_000_000, adjusted: true };
  })]));
const raw = { metadata: {}, fundamentals: [], events: [],
  securities: sanitized.map(row => ({ ...row, listedAt: dates[0], isEtf: false, isFund: false })),
  sessions: dates.map(date => ({ date, decisionAt: date + 'T22:00:00.000Z',
    universeSymbols: sanitized.map(row => row.symbol), corporateActions: [],
    prices: symbols.flatMap(symbol => histories[symbol].filter(row => row.date === date).map(row => ({ ...row, symbol }))) })) };
const before = JSON.stringify(raw);
const batch = compileCurrentBatch(compiler, raw, 252, 8);
for (const session of batch.sessions) {
  const actual = compiler.live.compileC1LiveInput({ universe: 'nasdaq', members,
    histories: Object.fromEntries(Object.entries(histories).map(([symbol, bars]) => [symbol, bars.filter(bar => bar.date <= session.date)])),
    fromDate: dates[0], observedAt: session.decisionAt });
  assert.deepEqual(JSON.parse(JSON.stringify(session)), JSON.parse(JSON.stringify(actual.session)),
    'Batched derived historical input must exactly equal actual production compileC1LiveInput for each date');
  assert.equal(session.positionSignals.length, 89);
  assert.ok(!session.positionSignals.some(row => row.symbol === 'T89'), '252-row member must be removed before sector/global ranks');
  assert.equal(session.signals.length, 0, 'No historical market cap or fundamentals are invented');
}
assert.equal(JSON.stringify(raw), before, 'Source-price frames are immutable');
assert.equal(batch.metadata.minimumSignalHistoryRows, 253);
const market = compiler.loader.load('lib/marketSession.js');
const winterDates = ['2023-01-04', '2023-01-05', '2023-01-06'];
const bar = date => ({ date, open: 100, high: 101, low: 99, close: 100, volume: 10_000_000, adjusted: true });
const winterCheckpoint = { histories: { AAA: winterDates.filter(date => date !== '2023-01-05').map(bar), SPY: winterDates.map(bar), QQQ: winterDates.map(bar) } };
const originalSessions = winterDates.map(date => ({ date, decisionAt: date + 'T20:00:00.000Z', sourceUniverseCount: 1,
  corporateActions: [], prices: Object.entries(winterCheckpoint.histories).flatMap(([symbol, bars]) => bars.filter(row => row.date === date).map(row => ({ ...row, symbol }))) }));
const originalBefore = JSON.stringify(originalSessions);
const prepared = prepareRawInput({ originalSessions, checkpoint: winterCheckpoint,
  blueprint: { initialSymbols: ['AAA'], changes: [], delistedDates: {} },
  signature: { usableSymbols: ['AAA'], fromDate: '2022-01-01' },
  profiles: new Map([['AAA', { symbol: 'AAA', name: 'Known issuer', sector: 'Technology' }]]), metadata: {},
  modelDecisionClock: true, completedSessionDay: market.latestCompletedMarketSessionDay, isSessionDay: market.isUsMarketSessionDay });
assert.equal(prepared.summary.decisionClock.originalBeforeCloseCount, 3);
assert.equal(prepared.summary.decisionClock.changedTimestamps, 3);
assert.ok(prepared.raw.sessions.every(session => market.latestCompletedMarketSessionDay(new Date(session.decisionAt)) === session.date));
assert.deepEqual(prepared.raw.sessions[1].universeSymbols, [], 'Missing current member price is quarantined before derived membership');
assert.deepEqual(prepared.summary.historicalGapGateExceptions, [{ decisionDate: '2023-01-06', symbol: 'AAA', missingSessionDates: ['2023-01-05'] }]);
assert.equal(JSON.stringify(originalSessions), originalBefore, 'Model clock and quarantine never rewrite original inputs');
console.log('PASS: eight batched source-current253 sessions exactly equal actual compileC1LiveInput; short-history exclusion precedes factors; current profiles/no invented fundamentals; modeled post-close clock, exact missing-price quarantine, and explicit history-gap evidence preserve original inputs.');
