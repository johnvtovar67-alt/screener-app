const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const loader = createResearchModuleLoader(process.cwd());
const { compileC1LiveInput, c1LiveMembers } = loader.load('lib/c1LiveInput.js');
const { compilePointInTimeSignals } = loader.load('lib/historicalSignalEvaluator.js');
const { compactReplaySession } = loader.load('lib/replayDatasetCompaction.js');
const { isUsMarketSessionDay } = loader.load('lib/marketSession.js');
const members = Array.from({ length: 90 }, (_, i) => ({ symbol: 'T' + i, name: 'Fixture ' + i, sector: 'Sector' + i % 5 }));
const symbols = [...members.map(row => row.symbol), 'SPY', 'QQQ'];
const dates = [];
for (let t = Date.parse('2025-06-02T12:00:00Z'); t <= Date.parse('2026-09-10T12:00:00Z'); t += 86400000) {
  const date = new Date(t).toISOString().slice(0, 10);
  if (isUsMarketSessionDay(date)) dates.push(date);
}
const histories = Object.fromEntries(symbols.map((symbol, i) => [symbol, dates.map((date, day) => {
  const close = 100 + day * (.1 + i / 1000);
  return { date, open: close - .1, high: close + 1, low: close - 1, close, volume: 10000000, adjusted: true };
})]));
const args = { universe: 'nasdaq', members, histories, observedAt: '2026-09-10T22:00:00.000Z', fromDate: dates[0] };
const before = JSON.stringify(args);
const result = compileC1LiveInput(args);
assert.equal(JSON.stringify(args), before, 'Collection inputs are immutable');
assert.equal(result.memberCount, 90);
assert.equal(result.session.positionSignals.length, 90);
assert.equal(result.executable, false);
assert.equal(result.eligibleForLiveCapital, false);
assert.equal(result.metadata.pointInTime, false, 'Current sectors/members cannot certify historical data');
assert.equal(result.sourceSessionDate, '2026-09-10');
assert.equal(result.metadata.generatedAt, undefined);
assert.equal(result.session.decisionAt, args.observedAt, 'Never claim the signal existed before collection');

// Compare resumed indicator warming with the existing compiler's complete
// traversal of the identical raw input. Earlier sessions have NO constituents.
const sorted = c1LiveMembers('nasdaq', members);
const raw = { securities: sorted.map(row => ({ ...row, listedAt: dates[0], isEtf: false, isFund: false })),
  fundamentals: [], events: [], metadata: {}, sessions: dates.map(date => ({ date, decisionAt: args.observedAt,
    universeSymbols: date === dates.at(-1) ? sorted.map(row => row.symbol) : [],
    prices: [...sorted.map(row => row.symbol), 'SPY', 'QQQ'].map(symbol => ({ ...histories[symbol].find(bar => bar.date === date), symbol })) })) };
const full = compilePointInTimeSignals(raw, { minimumHistoryRows: 253, liquidity: { maxCandidates: 150 } });
assert.equal(JSON.stringify(result.session), JSON.stringify(compactReplaySession(full.sessions.at(-1))),
  'One-session compilation must match the shared compiler exactly');
assert.ok(full.sessions.slice(0, -1).every(session => session.positionSignals.length === 0), 'Never backfill current membership');

const copy = () => JSON.parse(JSON.stringify(args));
let changed = copy(); delete changed.histories.T3;
assert.throws(() => compileC1LiveInput(changed), /missing for T3/);
changed = copy(); changed.histories.T3.pop();
assert.throws(() => compileC1LiveInput(changed), /Current completed price/);
changed = copy(); changed.histories.T3.splice(200, 1);
assert.throws(() => compileC1LiveInput(changed), /session gap/);
changed = copy(); changed.histories.SPY.shift();
assert.throws(() => compileC1LiveInput(changed), /session gap/);
changed = copy(); changed.members[0].sector = 'Other';
assert.throws(() => compileC1LiveInput(changed), /sector is missing/);
changed = copy(); changed.members[0] = changed.members[1];
assert.throws(() => compileC1LiveInput(changed), /duplicate index member/);
changed = copy(); changed.histories.T3[0].adjusted = false;
assert.throws(() => compileC1LiveInput(changed), /unadjusted price/);
changed = copy(); changed.histories.T3[0].low = 200;
assert.throws(() => compileC1LiveInput(changed), /Invalid/);
changed = copy(); changed.histories.T3.push({ ...changed.histories.T3.at(-1), date: '2026-09-11' });
assert.throws(() => compileC1LiveInput(changed), /Invalid/);
changed = copy(); changed.histories.T3 = changed.histories.T3.slice(-100);
const short = compileC1LiveInput(changed);
assert.deepEqual(Array.from(short.shortHistorySymbols), ['T3']);
assert.equal(short.session.positionSignals.length, 89, 'Preserve the frozen compiler 253-row eligibility rule');
assert.equal(short.memberCount, 90, 'An ineligible member stays in the declared universe');
assert.throws(() => c1LiveMembers('broad', members), /tested index universe/);

const provider = fs.readFileSync('lib/c1LiveInputProvider.js', 'utf8');
assert.ok(!provider.includes('@vercel/blob'), 'Acquisition cannot mutate research checkpoints');
assert.ok(!provider.includes('v11ProductionSnapshot'), 'The diagnostic collector cannot switch production');
console.log('PASS: dated index inputs match the existing compiler; complete price coverage, sectors, chronology, short-history eligibility, no historical backfill or trading authority');
