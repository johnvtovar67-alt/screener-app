const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

process.argv.push('--check');
require('./generate-c1-account-simulator.cjs');
process.argv.pop();
const loader = createResearchModuleLoader(process.cwd());
const { simulatePointInTimePortfolio: account, c1AccountRankEligible } = loader.load('lib/c1AccountSimulator.js');
const { simulatePointInTimePortfolio: frozen } = loader.load('lib/c1FrozenSimulator.js');
const frozenRankEligible = vm.runInNewContext(fs.readFileSync('lib/c1FrozenSimulator.js', 'utf8')
  .replace(/^export /gm, '') + '\nentrySignalQualifies;', {}, { filename: 'lib/c1FrozenSimulator.js' });
const { C1_FROZEN_OPTIONS: options } = loader.load('lib/c1FrozenOptions.js');
const { projectC1AccountSession } = loader.load('lib/c1AccountProjection.js');
const { c1SeedPosition, c1HistoricalPriceEvidence } = loader.load('lib/c1AccountSeed.js');
const { buildC1StockScreenSnapshot } = loader.load('lib/c1StockClassification.js');
const { resolveC1ScreenEvidence, readC1ScreenEvidence, writeC1ScreenEvidence } = loader.load('lib/c1ScreenEvidence.js');
const market = loader.load('lib/marketSession.js');
const plain = value => JSON.parse(JSON.stringify(value));
const symbols = ['SCHW', 'AAA', 'BBB', 'CCC'];
function session(date) {
  const signals = symbols.map((symbol, index) => ({
    symbol, sector: 'Sector ' + index, cik: String(100 + index), companyName: symbol,
    price: 100, researchFactors: { momentumPercentile: 100 - index, volatility60Pct: 20 },
    entryTiming: { available: true, asOf: date, liquidityPass: true, averageDollarVolume20: 500_000_000 },
  }));
  return { date, decisionAt: date + 'T21:00:00Z', signals, positionSignals: signals,
    universeSymbols: symbols, corporateActions: [],
    prices: [...symbols, 'SPY', 'QQQ'].map(symbol => ({ symbol, open: 100, high: 101, low: 99, close: 100, adjusted: true })) };
}
const baseline = session('2026-09-01'), opening = session('2026-09-02');
const seed = sleeve => ({ contract: 'c1-prospective-account-seed-v1', sleeve,
  asOfSession: baseline.date, prospectiveAdoptionConfirmed: true,
  cash: 100_000, highWater: 100_000, remainingCooldownSessions: 0, positions: [] });
for (const [sleeve, config] of Object.entries(options)) {
  const request = { ...config, startDate: baseline.date, endDate: opening.date, liquidateAtEnd: false };
  const original = frozen({ sessions: [baseline, opening] }, request);
  assert.ok(original.trades.some(trade => trade.symbol === 'SCHW'), 'Fixture reproduces SCHW occupying a frozen simulated slot');
  const repaired = account({ sessions: [baseline, opening] }, request, seed(sleeve));
  assert.deepEqual(plain(repaired.trades.filter(trade => trade.side === 'buy').map(trade => trade.symbol)), ['AAA', 'BBB', 'CCC'], 'SCHW is excluded before spending cash or consuming a slot');
  assert.ok(repaired.trades.every(trade => Number.isSafeInteger(trade.shares) && trade.shares > 0));
  assert.ok(repaired.curve.at(-1).cash >= 0);
  assert.ok(repaired.pendingDecisions.every(order => order.symbol !== 'SCHW'));
  assert.equal(c1AccountRankEligible(baseline.signals[0], config), true, 'Purchase exclusion preserves SCHW holding-rank eligibility');
  for (const signal of [...baseline.signals, { ...baseline.signals[0], entryTiming: { liquidityPass: false } }]) {
    assert.equal(c1AccountRankEligible(signal, config), frozenRankEligible(signal, config), 'Purchase restriction cannot alter the frozen holding-rank predicate');
  }
  const noSeed = account({ sessions: [baseline, opening] }, request);
  assert.ok(noSeed.trades.every(trade => trade.symbol !== 'SCHW'), 'Current account runtime also excludes before unseeded replay allocation');
}
const weights = { base: 0.25, cooldown15: 0.5, sector40: 0.25 };
const adoption = { sourceSessionDate: baseline.date, seeds: Object.fromEntries(Object.entries(weights).map(([sleeve, weight]) => [sleeve, { ...seed(sleeve), actualDollarsPerModelDollar: weight }])) };
const books = Object.fromEntries(Object.entries(weights).map(([sleeve, weight]) => [sleeve, { cash: 100_000 * weight, positions: {} }]));
const plan = projectC1AccountSession({ adoption, baseline, opening, observedAt: opening.date + 'T14:00:00Z', books, sessions: [baseline] });
for (const sleeve of Object.keys(weights)) {
  assert.deepEqual(plain(plan.orders.filter(order => order.sleeve === sleeve && order.side === 'buy').map(order => order.symbol)), ['AAA', 'BBB', 'CCC'], 'Actual opening projection fills the freed SCHW slot');
  assert.equal(Object.keys(plan.projectedBooks[sleeve].positions).length, 3);
  assert.ok(plan.projectedBooks[sleeve].cash >= 0);
}
assert.equal(plan.blockedOrders.length, 0, 'Exclusion occurs before a hypothetical purchase is fabricated');

// Purchase exclusion must not remove SCHW from the existing holding-rank pool.
// The pool expression is still the immutable frozen rank expression; the
// runtime fixture then tests both sides of the armed-profit top-six boundary.
const rankPoolExpression = source => source.match(/const rankedPool =[\s\S]*?const configuredTargetCount =/)[0];
assert.equal(rankPoolExpression(fs.readFileSync('lib/c1AccountSimulator.js', 'utf8')),
  rankPoolExpression(fs.readFileSync('lib/c1FrozenSimulator.js', 'utf8')),
  'The allocation repair preserves the existing blocked holding-rank pool');
const rankDates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14'];
const rankSymbols = ['AAA', 'SCHW', ...Array.from({ length: 10 }, (_, index) => 'P' + String(index + 1).padStart(2, '0'))];
function rankSession(date, index, holdingRank) {
  const close = index >= 3 ? 115 : 100;
  const signals = rankSymbols.map((symbol, ordinal) => ({
    symbol, sector: 'Rank Sector ' + ordinal, companyName: symbol, cik: String(200 + ordinal),
    price: symbol === 'AAA' ? close : 100,
    researchFactors: { momentumPercentile: symbol === 'AAA' ? index >= 6 ? holdingRank === 7 ? 93.5 : 94.5 : 100 : 100 - ordinal, volatility60Pct: 20 },
    entryTiming: { available: true, asOf: date, liquidityPass: true, averageDollarVolume20: 500_000_000 },
  }));
  return { date, decisionAt: date + 'T21:00:00Z', signals, positionSignals: signals,
    universeSymbols: rankSymbols, corporateActions: [],
    prices: [...rankSymbols, 'SPY', 'QQQ'].map(symbol => ({ symbol,
      open: symbol === 'AAA' ? close : 100, close: symbol === 'AAA' ? close : 100,
      high: symbol === 'AAA' ? close + 1 : 101, low: symbol === 'AAA' ? close - 1 : 99, adjusted: true })) };
}
for (const [sleeve, config] of Object.entries(options)) {
  for (const expectedRank of [6, 7]) {
    const sessions = rankDates.map((date, index) => rankSession(date, index, expectedRank));
    const openingSeed = { ...seed(sleeve), cash: 0, positions: [{ symbol: 'AAA', role: 'Swing', shares: 1_000,
      entryPrice: 100, openedAt: '2026-08-24', sector: 'Rank Sector 0', issuer: 'AAA',
      stock: { symbol: 'AAA', sector: 'Rank Sector 0' } }] };
    const salePrice = 115 * (1 - config.slippageBps / 10_000);
    const records = sessions.slice(1).map((item, index) => ({ date: item.date,
      fills: expectedRank === 7 && index === 7 ? [{ symbol: 'AAA', side: 'sell', reason: 'profit-rank-deterioration', shares: 1_000, price: salePrice, fee: 0 }] : [] }));
    const replayThrough = count => account({ sessions: sessions.slice(0, count) }, {
      ...config, startDate: rankDates[0], endDate: rankDates[count - 1], liquidateAtEnd: false,
    }, openingSeed, { contract: 'c1-actual-fill-replay-v1', sessions: records.slice(0, count - 1) });
    for (const [count, expectedStreak] of [[7, expectedRank === 7 ? 1 : 0], [8, expectedRank === 7 ? 2 : 0]]) {
      const result = replayThrough(count), held = result.openPositions.find(position => position.symbol === 'AAA');
      assert.equal(held.lastC1Rank, expectedRank, 'SCHW ahead of the held winner remains in its existing ordinal rank');
      assert.equal(held.profitProtectionArmed, true);
      assert.equal(held.profitRankExitStreak, expectedStreak, 'The unchanged top-six profit confirmation counts completed weak-rank sessions');
      assert.equal(held.earlyRankExitStreak, 0, 'Rank six/seven cannot trigger the separate top-nine early exit');
      assert.equal(result.trades.length, 0, 'No modeled purchase or premature sale replaces the recorded executions');
      assert.equal(result.actualCash, 0);
      assert.equal(result.pendingDecisions.some(order => order.symbol === 'AAA' && order.reason === 'profit-rank-deterioration'), expectedRank === 7 && count === 8);
    }
    const completed = replayThrough(9), sells = completed.trades.filter(trade => trade.side === 'sell');
    assert.equal(completed.trades.some(trade => trade.side === 'buy'), false, 'Explicitly empty purchase records cannot fabricate fills');
    assert.equal(sells.length, expectedRank === 7 ? 1 : 0);
    assert.equal(completed.actualCash, expectedRank === 7 ? 1_000 * salePrice : 0, 'Recorded exit cash uses the unchanged fill and accounting arithmetic');
    if (expectedRank === 7) {
      assert.equal(sells[0].date, '2026-09-14', 'Two completed closes outside the top six exit at the following regular open');
      assert.equal(sells[0].reason, 'profit-rank-deterioration');
      assert.equal(sells[0].shares, 1_000);
      assert.equal(sells[0].price, salePrice);
      assert.equal(completed.openPositions.length, 0);
    } else assert.equal(completed.openPositions[0].lastC1Rank, 6, 'A held winner at rank six remains held');
  }
}

const stockScreen = buildC1StockScreenSnapshot(baseline);
const decision = { current: true, decisionId: 'accepted-source:1', sourceSessionDate: baseline.date, stockScreen };
const rows = stockScreen.candidates.map(candidate => ({ symbol: candidate.symbol, price: 100,
  entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 500_000_000 },
  expertDecision: { strongBuyPass: false, metrics: { quoteFreshnessPass: true } }, eventRisk: { status: 'Clear' } }));
const first = resolveC1ScreenEvidence({ decision, rows, current: true });
assert.equal(first.verified, true);
const strongRows = structuredClone(rows); strongRows[0].expertDecision.strongBuyPass = true;
const upgraded = resolveC1ScreenEvidence({ decision, rows: strongRows, current: true, previous: first });
assert.equal(upgraded.ratings[0].rating, 'Strong Buy', 'Complete current verified evidence upgrades prior Buy strength');
assert.equal(upgraded.pending, false);
const downgraded = resolveC1ScreenEvidence({ decision, rows, current: true, previous: upgraded });
assert.equal(downgraded.ratings[0].rating, 'Buy', 'Complete current verified evidence removes prior Strong Buy strength');
assert.equal(downgraded.pending, false);
assert.deepEqual(plain(downgraded.buySymbols), plain(first.buySymbols), 'Strength refresh preserves current selected names');
for (const [verified, evidenceRows] of [[upgraded, strongRows], [downgraded, rows]]) {
  let previous = verified;
  for (let repeat = 0; repeat < 10; repeat++) {
    previous = resolveC1ScreenEvidence({ decision, rows: evidenceRows, current: true, previous });
    assert.deepEqual(plain(previous), plain(verified), 'Repeated identical verified evidence preserves the full current strength and authority state');
  }
}
const stored = new Map();
const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
writeC1ScreenEvidence(storage, upgraded);
const cachedStrong = readC1ScreenEvidence(storage, decision);
assert.deepEqual(plain(cachedStrong.ratings), plain(upgraded.ratings));
const reloadedBuy = resolveC1ScreenEvidence({ decision, rows, current: true, previous: cachedStrong });
assert.deepEqual(plain(reloadedBuy), plain(downgraded), 'Current verified Buy replaces cached Strong Buy after reload');
writeC1ScreenEvidence(storage, reloadedBuy);
assert.deepEqual(plain(resolveC1ScreenEvidence({ decision, rows: strongRows, current: true,
  previous: readC1ScreenEvidence(storage, decision) })), plain(upgraded), 'Current verified Strong Buy replaces cached Buy after reload');
const pending = resolveC1ScreenEvidence({ decision, rows: strongRows.slice(1), current: true, previous: upgraded });
assert.equal(pending.pending, true);
assert.equal(pending.verified, false);
assert.deepEqual(plain(pending.ratings), plain(upgraded.ratings), 'Incomplete evidence retains the last verified explanation');
assert.deepEqual(plain(pending.buySymbols), [], 'Prior continuity provides no fresh capital authority while verification is pending');

assert.equal(market.isUsMarketSessionDay('2025-01-08'), true);
assert.equal(market.isUsMarketSessionDay('2025-01-09'), false, 'Carter national day of mourning is an exceptional market closure');
assert.equal(market.isUsMarketSessionDay('2025-01-10'), true);
assert.equal(market.previousMarketSessionDay('2025-01-10'), '2025-01-08');
assert.equal(market.marketSessionDistance('2025-01-08', '2025-01-10'), 1, 'Closure cannot increment holding/rank/cooldown session counts');
assert.equal(market.marketExecutionState('2025-01-09T16:00:00Z').isOpen, false);
assert.equal(market.marketObservationSessionDay('2025-01-09T16:00:00Z'), '2025-01-08');
assert.equal(market.latestCompletedMarketSessionDay('2025-01-09T22:00:00Z'), '2025-01-08');
const closureSessions = [session('2025-01-08'), session('2025-01-10')];
const holding = { symbol: 'AAA', role: 'Swing', shares: 1, entryPrice: 100,
  openedAt: '2025-01-08', sector: 'Sector 1', issuer: '101' };
const seededHolding = c1SeedPosition(holding, 0, '2025-01-10', 100);
assert.equal(seededHolding.enteredAt, '2025-01-08', 'Calendar repair preserves the original holding date');
assert.equal(seededHolding.enteredSessionIndex, -1, 'Actual seeded holding age advances once across the closure');
assert.equal(seededHolding.lastSessionIndex - seededHolding.enteredSessionIndex, 1);
const historicalEvidence = c1HistoricalPriceEvidence(holding, closureSessions, '2025-01-10');
assert.equal(historicalEvidence.expectedSessions, 2, 'Closure does not fabricate a required historical price session');
assert.equal(historicalEvidence.sessionsObserved, 2);
assert.equal(historicalEvidence.complete, true);
const closureAdoption = { sourceSessionDate: '2025-01-08', seeds: Object.fromEntries(Object.entries(adoption.seeds)
  .map(([sleeve, value]) => [sleeve, { ...value, asOfSession: '2025-01-08' }])) };
const closurePlan = projectC1AccountSession({ adoption: closureAdoption, baseline: closureSessions[0],
  opening: closureSessions[1], observedAt: '2025-01-10T15:00:00Z', books, sessions: [closureSessions[0]] });
for (const sleeve of Object.keys(weights)) {
  assert.deepEqual(plain(closurePlan.orders.filter(order => order.sleeve === sleeve && order.side === 'buy')
    .map(order => order.symbol)), ['AAA', 'BBB', 'CCC'], 'Jan8 to Jan10 is one valid actual-account opening transition');
}
console.log('PASS: SCHW excluded before allocation in all sleeves and actual projection with holding ranks unchanged; current verified strength refreshes and repeats exactly after reload; January 9, 2025 closure preserves one opening transition, holding age and complete price history.');
