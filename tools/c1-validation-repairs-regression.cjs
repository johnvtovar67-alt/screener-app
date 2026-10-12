const assert = require('node:assert/strict');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

process.argv.push('--check');
require('./generate-c1-account-simulator.cjs');
process.argv.pop();
const loader = createResearchModuleLoader(process.cwd());
const { simulatePointInTimePortfolio: account, c1AccountRankEligible } = loader.load('lib/c1AccountSimulator.js');
const { simulatePointInTimePortfolio: frozen } = loader.load('lib/c1FrozenSimulator.js');
const { C1_FROZEN_OPTIONS: options } = loader.load('lib/c1FrozenOptions.js');
const { projectC1AccountSession } = loader.load('lib/c1AccountProjection.js');
const { buildC1StockScreenSnapshot } = loader.load('lib/c1StockClassification.js');
const { resolveC1ScreenEvidence } = loader.load('lib/c1ScreenEvidence.js');
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
  assert.equal(c1AccountRankEligible(baseline.signals[0], config), false, 'Independent current holding-rank helper uses the same account exclusion');
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
console.log('PASS: SCHW excluded before account ranking/allocation in all sleeves and actual projection; current verified strength upgrades/downgrades without stale continuity; exceptional January 9, 2025 closure does not consume a market session.');
