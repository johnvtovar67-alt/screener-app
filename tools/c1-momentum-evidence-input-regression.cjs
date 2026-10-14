const assert = require('node:assert/strict');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

// Offline, synthetic accepted sessions. Exercise the actual extraction and
// canonical simulator; no provider request or stored account is involved.
const loader = createResearchModuleLoader(process.cwd());
const { buildC1MomentumEvidenceInputs: build } = loader.load('lib/c1MomentumEvidenceInput.js');
const { simulatePointInTimePortfolio } = loader.load('lib/c1AccountSimulator.js');
const { C1_FROZEN_OPTIONS: frozen } = loader.load('lib/c1FrozenOptions.js');
const clone = value => JSON.parse(JSON.stringify(value));
const dates = [
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06',
  '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12',
];

function signal(symbol, momentumPercentile) {
  return {
    symbol, sector: symbol, price: 100, priceAvg50: 95, priceAvg200: 85,
    entryTiming: {
      available: true, liquidityPass: true, averageDollarVolume20: 500_000_000,
      ret5: 2, ret10: 4, sma20Slope: 1, macdImproving: true,
      alpha20VsSpy: 2, alpha60VsSpy: 10, alpha60VsQqq: 5,
      relativeStrengthVerified: true,
    },
    researchFactors: { momentumPercentile, volatility60Pct: 20 },
  };
}
const sessions = dates.map((date, index) => ({
  date, decisionAt: date + 'T21:00:00Z', universeSymbols: ['AAA', 'BBB', 'CCC', 'MSTR'],
  signals: [signal('AAA', 80 + index), signal('BBB', 90), signal('CCC', 90), signal('MSTR', 100)],
  positionSignals: [signal('AAA', 100)],
  accountHoldingSignals: [signal('PRIVATE', 100)],
  legacyHoldingSignals: [{ symbol: 'PRIVATE', sector: 'PRIVATE', inheritedRiskOnly: true }],
  prices: ['AAA', 'BBB', 'CCC', 'MSTR', 'SPY', 'QQQ', 'PRIVATE'].map(symbol => ({
    symbol, date, adjusted: true, open: 100, high: 101, low: 99, close: 100, volume: 10_000_000,
  })),
}));
const position = { symbol: 'AAA', reviewRules: Object.keys(frozen).map(sleeve => ({ sleeve })) };
const before = JSON.stringify({ position, sessions });
const result = build({ position, sessions });
const latest = result.observations.at(-1);
assert.equal(result.sourceSessionDate, dates.at(-1));
assert.equal(result.observations.length, 6, 'Use at most six accepted sessions');
assert.equal(result.observations[0].date, dates[2]);
assert.equal(JSON.stringify({ position, sessions }), before, 'Extraction never mutates account or dated inputs');

function seed(sleeve) {
  return {
    contract: 'c1-prospective-account-seed-v1', sleeve, asOfSession: dates[0],
    prospectiveAdoptionConfirmed: true, cash: 0, highWater: 100_000,
    remainingCooldownSessions: 0, resumeAtNextOpen: false,
    positions: [{
      symbol: 'AAA', role: 'Swing', shares: 1_000, entryPrice: 100, openedAt: dates[0],
      inheritedRiskOnly: false, sector: 'AAA', issuer: 'AAA', stock: { symbol: 'AAA', sector: 'AAA' },
    }],
  };
}
for (const [sleeve, config] of Object.entries(frozen)) {
  const run = simulatePointInTimePortfolio({ sessions }, {
    ...config, startDate: dates[0], endDate: dates.at(-1), liquidateAtEnd: false,
  }, seed(sleeve));
  const model = run.openPositions.find(row => row.symbol === position.symbol);
  assert.ok(model);
  assert.equal(latest.ranks[sleeve].rank, model.lastC1Rank, 'Extraction agrees with actual simulator rank');
  assert.equal(latest.ranks[sleeve].eligibleCount, model.lastC1EligibleCount);
  assert.equal(latest.ranks[sleeve].verified, true);
}
assert.equal(latest.ranks.base.rank, 3, 'Published signals replace same-symbol position signals');
assert.equal(latest.ranks.base.eligibleCount, 3, 'Blocked MSTR is excluded from the canonical pool');
assert.equal(build({ position: { ...position, symbol: 'BBB' }, sessions }).observations.at(-1).ranks.base.rank,
  1, 'Equal momentum scores use the canonical alphabetical tiebreak');
assert.equal(latest.timing.source, 'accepted-published-signal');
assert.equal(latest.timing.asOf, dates.at(-1), 'Compacted timing uses accepted session provenance');
assert.equal(latest.timing.available, true);
assert.equal(latest.priceAvg50, 95);
assert.equal(latest.priceAvg200, 85);
assert.equal(latest.timing.macdHist, undefined, 'Omitted raw indicators are not reconstructed');
assert.equal(latest.timing.sma20, undefined);

const privateResult = build({ position: { ...position, symbol: 'PRIVATE' }, sessions });
const privateLatest = privateResult.observations.at(-1);
assert.equal(privateLatest.ranks.base.eligible, false);
assert.equal(privateLatest.ranks.base.rank, 4, 'Private holding comparisons never enter authoritative ranks');
assert.equal(privateLatest.timing.source, 'accepted-holding-signal');
assert.equal(privateLatest.timing.available, true, 'An accepted outside holding may still have technical evidence');
const priority = clone(sessions);
priority.at(-1).accountHoldingSignals.push(signal('AAA', 100));
assert.equal(build({ position, sessions: priority }).observations.at(-1).timing.source, 'accepted-published-signal',
  'Published evidence wins over an accepted private holding review');
priority.at(-1).accountHoldingSignals = [];
const legacy = build({ position: { ...position, symbol: 'PRIVATE' }, sessions: priority });
assert.equal(legacy.observations.at(-1).timing.source, 'accepted-holding-classification');
assert.equal(legacy.observations.at(-1).timing.available, false, 'Holding classification cannot invent price indicators');
const unknown = build({ position: { ...position, symbol: 'UNKNOWN' }, sessions });
assert.equal(unknown.observations.at(-1).close, null);
assert.equal(unknown.observations.at(-1).timing.source, 'unavailable');
assert.equal(unknown.observations.at(-1).timing.available, false);
assert.ok(unknown.limitations.some(text => text.includes('close is unavailable')));

for (const field of ['ret5', 'sma20Slope', 'alpha20VsSpy', 'alpha60VsSpy']) {
  for (const value of [null, '', '2', false]) {
    const changed = clone(sessions);
    changed.at(-1).signals[0].entryTiming[field] = value;
    assert.equal(build({ position, sessions: changed }).observations.at(-1).timing[field], undefined,
      'Missing or nonnumeric evidence is never converted to an observed number');
  }
}
const mismatch = clone(sessions);
mismatch.at(-1).signals[0].entryTiming.asOf = dates.at(-2);
const misaligned = build({ position, sessions: mismatch });
assert.equal(misaligned.observations.at(-1).timing.available, false);
assert.equal(misaligned.observations.at(-1).timing.status, 'misaligned');
assert.ok(misaligned.limitations.some(text => text.includes('mismatched source date')));
for (const field of ['staleFallback', 'staleVerification']) {
  const changed = clone(sessions);
  changed.at(-1).signals[0].entryTiming[field] = true;
  const stale = build({ position, sessions: changed });
  assert.equal(stale.observations.at(-1).timing.available, false);
  assert.equal(stale.observations.at(-1).timing.status, 'stale');
  assert.equal(stale.observations.at(-1).timing[field], true);
}
for (const field of ['staleFallback', 'clientSnapshotFallback', 'dataFeedSnapshotStale']) {
  const changed = clone(sessions);
  changed.at(-1).signals[0][field] = true;
  assert.equal(build({ position, sessions: changed }).observations.at(-1).timing.available, false);
}
const absentTiming = clone(sessions);
delete absentTiming.at(-1).signals[0].entryTiming;
assert.equal(build({ position, sessions: absentTiming }).observations.at(-1).timing.available, false);
const emptyEligiblePool = clone(sessions);
for (const rows of [emptyEligiblePool.at(-1).signals, emptyEligiblePool.at(-1).positionSignals]) {
  rows.forEach(row => { row.entryTiming.available = false; });
}
const unrankable = build({ position, sessions: emptyEligiblePool });
assert.equal(unrankable.observations.at(-1).ranks.base.eligibleCount, 0);
assert.equal(unrankable.observations.at(-1).ranks.base.verified, false,
  'An empty pool caused by unavailable eligible inputs cannot verify deterioration');
assert.ok(unrankable.limitations.some(text => text.includes('eligible opportunity pool is empty')));

for (const momentum of [null, undefined, '85']) {
  const changed = clone(sessions);
  changed.at(-1).signals[1].researchFactors.momentumPercentile = momentum;
  const extracted = build({ position, sessions: changed });
  assert.equal(extracted.observations.at(-1).ranks.base.verified, false,
    'Canonical defaulted or nonnumeric momentum is not verified evidence');
  assert.ok(extracted.limitations.some(text => text.includes('unavailable momentum input')));
  const run = simulatePointInTimePortfolio({ sessions: changed }, {
    ...frozen.base, startDate: dates[0], endDate: dates.at(-1), liquidateAtEnd: false,
  }, seed('base'));
  assert.equal(extracted.observations.at(-1).ranks.base.rank,
    run.openPositions.find(row => row.symbol === position.symbol).lastC1Rank,
    'Default-input ordering still matches the original simulator without claiming verified trajectory');
}

for (const mutate of [
  bar => { bar.adjusted = false; },
  bar => { bar.close = null; },
  bar => { bar.close = 0; },
  bar => { bar.close = '100'; },
  bar => { bar.date = dates.at(-2); },
]) {
  const changed = clone(sessions);
  mutate(changed.at(-1).prices[0]);
  const extracted = build({ position, sessions: changed });
  assert.equal(extracted.observations.at(-1).close, null);
  assert.ok(extracted.limitations.some(text => text.includes('adjusted holding close is unavailable')));
}
const duplicate = clone(sessions);
duplicate.at(-1).prices.push(clone(duplicate.at(-1).prices[0]));
assert.equal(build({ position, sessions: duplicate }).observations.at(-1).close, null,
  'Ambiguous accepted closes are explicit missing evidence');
const compactPrice = clone(sessions);
delete compactPrice.at(-1).prices[0].date;
assert.equal(build({ position, sessions: compactPrice }).observations.at(-1).close, 100,
  'A compacted bar inherits its enclosing accepted session date');

const gap = build({ position, sessions: [sessions[0], sessions[1], sessions.at(-1)] });
assert.equal(gap.observations.length, 1, 'History stops at a missing market session');
assert.ok(gap.limitations.some(text => text.includes('session gap')));
assert.ok(gap.limitations.some(text => text.includes('rank trajectory is unavailable')));
assert.equal(build({ position, sessions: [sessions[0], sessions[1]] }).observations.length, 2);
for (const unavailableSessions of [[], null, {}]) {
  assert.equal(build({ position, sessions: unavailableSessions }).sourceSessionDate, null);
}
const noSleeves = build({ position: { symbol: 'AAA' }, sessions });
assert.equal(Object.keys(noSleeves.observations.at(-1).ranks).length, 0);
assert.ok(noSleeves.limitations.some(text => text.includes('no completed-session C1 sleeve review')));
assert.equal(JSON.stringify({ position, sessions }), before, 'All fixture cases preserve the original accepted inputs');

console.log('PASS: C1 evidence input extraction matches all frozen sleeve ranks, preserves accepted source precedence, excludes private ranks, and flags missing/defaulted/stale/misaligned indicators, invalid closes, and history gaps without mutation.');
