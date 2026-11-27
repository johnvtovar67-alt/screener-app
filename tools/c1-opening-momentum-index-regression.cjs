const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const { restore, blob } = require('./c1-opening-momentum-index-seams.cjs');

const fixtureBytes = readFileSync('tools/fixtures/c1-opening-momentum-index-source-seams.json');
const fixture = JSON.parse(fixtureBytes);
assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), '58ef1fcc588c03fdc35c91d03238a321a7b328f2139cac8c568f24dddb932055');
assert.equal(fixture.baselineCommit, 'efb3ffa89da62903f9fd5873d7d597570ed9f555');
for (const [file, patch] of Object.entries(fixture.files)) {
  const current = readFileSync(file, 'utf8');
  const prior = restore(file, current);
  assert.equal(blob(current), patch.afterHash);
  assert.equal(blob(prior), patch.beforeHash);
  assert.equal(restore(file, prior), prior);
  const unreviewed = current + '\n// unreviewed\n';
  assert.equal(restore(file, unreviewed), unreviewed);
}

const loader = createResearchModuleLoader(process.cwd());
const { indexC1RecentMomentumHistory, readC1RecentMomentum } = loader.load('lib/c1RecentMomentumGate.js');
const { createC1QualifiedMomentumReview } = loader.load('lib/c1QualifiedSelection.js');
const copy = value => JSON.parse(JSON.stringify(value));
const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25'];
const symbols = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'];
const history = dates.map((date, index) => ({
  date,
  decisionAt: date + 'T22:00:00Z',
  prices: symbols.map(symbol => ({ symbol, date, adjusted: true, close: 100 + index, high: 101 + index })),
  signals: symbols.map(symbol => ({ symbol, entryTiming: { available: true, asOf: date, macdImproving: true } })),
}));
const latest = history.at(-1);
latest.prices.push({ ...latest.prices.find(row => row.symbol === 'BBB'), symbol: ' bbb ' });
history[2].prices.find(row => row.symbol === 'CCC').stale = true;
latest.signals.find(row => row.symbol === 'DDD').entryTiming.availableAt = '2026-11-26T00:00:00Z';
latest.signals.push({ ...latest.signals.find(row => row.symbol === 'EEE') });
latest.prices = latest.prices.filter(row => row.symbol !== 'FFF');
latest.positionSignals = latest.signals.filter(row => row.symbol === 'GGG');
latest.signals = latest.signals.filter(row => row.symbol !== 'GGG');

const indexed = [...history];
indexC1RecentMomentumHistory(indexed);
const priorQualified = createC1QualifiedMomentumReview(history);
const indexedQualified = createC1QualifiedMomentumReview(indexed);
for (const [sessionIndex, date] of dates.entries()) {
  for (const symbol of [...symbols, ' aaa ', 'MISSING']) {
    const expected = readC1RecentMomentum({ sessions: history, sessionIndex, symbol });
    assert.deepEqual(copy(readC1RecentMomentum({ sessions: indexed, sessionIndex, symbol })), copy(expected), date + ' ' + symbol);
    assert.deepEqual(copy(indexedQualified(date, symbol)), copy(priorQualified(date, symbol)), date + ' qualified ' + symbol);
  }
}
assert.equal(indexedQualified(latest.date, 'AAA').entryAllowed, true);
assert.equal(indexedQualified(latest.date, 'GGG').metrics.timingSource, 'accepted-position-signal');
for (const symbol of ['BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'MISSING']) {
  assert.equal(indexedQualified(latest.date, symbol).available, false, symbol);
}

const first = readC1RecentMomentum({ sessions: indexed, symbol: 'AAA' });
first.metrics.close = 1;
first.limitations.push('changed by caller');
const second = readC1RecentMomentum({ sessions: indexed, symbol: 'AAA' });
assert.equal(second.metrics.close, 107);
assert.equal(second.limitations.length, 0);
const revised = copy(history);
revised.at(-1).prices.find(row => row.symbol === 'AAA').close = 101;
indexC1RecentMomentumHistory(revised);
assert.equal(readC1RecentMomentum({ sessions: revised, symbol: 'AAA' }).metrics.close, 101);
assert.equal(readC1RecentMomentum({ sessions: indexed, symbol: 'AAA' }).metrics.close, 107);

let rowReads = 0;
const counted = history.map(session => ({
  ...session,
  prices: session.prices.map(({ symbol, ...row }) => ({
    ...row,
    get symbol() { rowReads++; return symbol; },
  })),
}));
indexC1RecentMomentumHistory(counted);
for (let repeat = 0; repeat < 2; repeat++) {
  for (const symbol of symbols) readC1RecentMomentum({ sessions: counted, symbol });
}
assert.equal(rowReads, counted.slice(-6).reduce((sum, session) => sum + session.prices.length, 0));
console.log('PASS: live opening momentum index, complete gate parity, exact source inverse and one lookup per accepted row.');
