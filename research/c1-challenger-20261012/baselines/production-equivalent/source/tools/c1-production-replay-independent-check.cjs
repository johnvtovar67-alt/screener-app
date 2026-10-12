const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Independent synthetic execution/caching checks; no historical experiment.
// Deliberately not added to the normal build regression suite.
const root = path.resolve(__dirname, '..');
const outputRoot = path.resolve(process.env.C1_INDEPENDENT_VALIDATION_OUTPUT_DIR || path.join(root, 'work/independent-validation'));
fs.mkdirSync(outputRoot, { recursive: true });
const { replayPolicy, compareRuns } = require(path.join(root, 'tools/c1-production-policy-replay.cjs'));
const { createResearchModuleLoader } = require(path.join(root, 'tools/research-module-loader.cjs'));
const { createProductionReplayLoader, digest } = require(path.join(root, 'tools/c1-production-replay-loader.cjs'));
const calendar = createResearchModuleLoader(root).load('lib/marketSession.js');
const dates = [];
for (let time = Date.parse('2026-03-02T12:00Z'); dates.length < 37; time += 86400000) {
  const day = new Date(time).toISOString().slice(0, 10);
  if (calendar.isUsMarketSessionDay(day)) dates.push(day);
}
function originalLoaderFactory(root, { slippageBps }) {
  const loader = createResearchModuleLoader(root);
  for (const options of Object.values(loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS)) options.slippageBps = slippageBps;
  return { ...loader, stats: {}, traceBySleeve: {}, identity: () => ({ unmodifiedProductionSource: true }) };
}
function bars(symbols, price) {
  return [...symbols.map(symbol => ({ symbol, open: price, close: price, high: price * 1.001, low: price * .999, volume: 5e6, adjusted: true })),
    ...['SPY', 'QQQ'].map(symbol => ({ symbol, open: 100, close: 100, high: 100, low: 100, volume: 5e6, adjusted: true }))];
}
function signal(symbol, index, price) {
  return { symbol, price, sector: 'Sector' + (index % 4), cik: String(index + 200), action: 'Buy',
    entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 5e8 },
    researchFactors: { momentumPercentile: 100 - index, volatility60Pct: 20 } };
}
function parity(dataset, cost) {
  const request = { root, dataset, startDate: dataset.sessions[0].date, endDate: dataset.sessions.at(-1).date, slippageBps: cost };
  const cached = replayPolicy(request);
  const uncached = replayPolicy({ ...request, cached: false });
  assert(compareRuns(cached, uncached).passed, 'Complete cache equivalence');
  const original = replayPolicy({ ...request, loaderFactory: originalLoaderFactory });
  for (const field of ['metrics', 'curve', 'trades', 'fills', 'plans', 'accountTrace', 'final']) assert.deepEqual(cached[field], original[field], 'Unmodified production source: ' + field);
  return cached;
}
const engineSha256 = digest(fs.readFileSync(path.join(root, 'tools/c1-production-policy-replay.cjs')));
const loaderSha256 = digest(fs.readFileSync(path.join(root, 'tools/c1-production-replay-loader.cjs')));
const breakerReceipts = [];
const breakerSymbols = Array.from({ length: 12 }, (_, index) => 'R' + String(index).padStart(2, '0'));
const breakerDataset = { metadata: { schema: 'screener-pit-v1' }, sessions: dates.map((date, day) => {
  const price = day < 4 ? 100 : day < 8 ? 110 : 95;
  const signals = breakerSymbols.map((symbol, index) => signal(symbol, index, price));
  return { date, decisionAt: date + 'T21:00:00.000Z', prices: bars(breakerSymbols, price), signals, positionSignals: signals, universeSymbols: breakerSymbols, corporateActions: [] };
}) };
for (const cost of [12, 25, 50]) {
  const run = parity(breakerDataset, cost);
  const exits = run.trades.filter(trade => trade.reason === 'portfolio-drawdown-stop');
  assert.equal(exits.length, 9);
  assert(exits.every(trade => trade.date === dates[8]));
  const resumption = {};
  for (const sleeve of ['base', 'cooldown15', 'sector40']) {
    const cooldown = sleeve === 'cooldown15' ? 15 : 10;
    const firstBuy = run.trades.find(trade => trade.sleeve === sleeve && trade.side === 'buy' && trade.date > dates[8]);
    assert.equal(firstBuy.date, dates[9 + cooldown]);
    resumption[sleeve] = firstBuy.date;
    assert.equal(run.accountTrace[9 + cooldown].sleeves[sleeve].risk.highWater,
      run.accountTrace[8].sleeves[sleeve].cash / (sleeve === 'cooldown15' ? .5 : .25));
    for (let index = 8; index < 9 + cooldown; index++) assert.equal(Object.keys(run.accountTrace[index].books[sleeve].positions).length, 0);
  }
  breakerReceipts.push({ cost, breakerDate: dates[8], breakerExits: 9, resumption, sourceParity: true, cacheParity: true });
}
fs.writeFileSync(path.join(outputRoot, 'breaker-parity.json'), JSON.stringify({ contract: 'c1-independent-breaker-parity-v1', passed: true,
  coverage: ['12% open-equity sleeve breaker', 'risk exits before buys', 'all nine sleeve holds liquidated', '10/15/10 cash cooldown', 'high-water reset on resumption', '12/25/50 source/cache/uncached parity'],
  receipts: breakerReceipts, engineSha256, loaderSha256 }, null, 2));
const stopReceipts = [];
const stopSymbols = ['AAA', 'AAB', 'BBB', 'CCC', 'SCHW'];
for (const cost of [12, 25, 50]) for (const kind of ['gap', 'intraday']) {
  const dataset = { metadata: {}, sessions: dates.slice(0, 4).map((date, day) => {
    const prices = bars(stopSymbols, 100).map(bar => {
      const gap = kind === 'gap' && day === 2 && bar.symbol === 'AAA';
      const intraday = kind === 'intraday' && day === 1 && ['AAA', 'BBB', 'CCC'].includes(bar.symbol);
      return { ...bar, open: gap ? 75 : bar.open, low: gap ? 74 : intraday ? 85 : bar.low, close: gap || intraday ? 95 : bar.close };
    });
    const signals = stopSymbols.map((symbol, index) => ({ ...signal(symbol, index, prices.find(bar => bar.symbol === symbol).close),
      sector: 'Sector' + index, cik: index < 2 ? '111' : String(index + 200) }));
    return { date, decisionAt: date + 'T21:00:00.000Z', prices, signals, positionSignals: signals, universeSymbols: stopSymbols, corporateActions: [] };
  }) };
  const run = parity(dataset, cost);
  assert(!run.trades.some(trade => trade.symbol === 'SCHW'));
  for (const trace of run.accountTrace) for (const book of Object.values(trace.books)) assert(!(book.positions.AAA && book.positions.AAB));
  assert(!run.fills.some(fill => fill.side === 'buy' && fill.symbol === 'AAB' && fill.date === dates[1]));
  const stops = run.trades.filter(trade => trade.reason === 'initial-stop');
  assert.equal(stops.length, kind === 'gap' ? 3 : 9);
  assert(stops.every(trade => trade.date === dates[kind === 'gap' ? 2 : 1]));
  for (const stop of stops) {
    const buy = run.trades.find(trade => trade.side === 'buy' && trade.sleeve === stop.sleeve && trade.symbol === stop.symbol && trade.date <= stop.date);
    const expected = kind === 'gap' ? 75 * (1 - cost / 10000) : buy.price * .86 * (1 - cost / 10000);
    assert(Math.abs(stop.price - expected) < 1e-10);
    assert.equal(stop.shares, buy.shares);
    assert.equal(stop.holdingSessions, kind === 'gap' ? 1 : 0);
    assert(Math.abs(stop.roundTripPnl - stop.shares * (expected - buy.price)) < 1e-7);
  }
  stopReceipts.push({ cost, kind, stops: stops.length, date: stops[0].date, sourceParity: true, cacheParity: true, sellCostAppliedExactlyOnce: true });
}
fs.writeFileSync(path.join(outputRoot, 'stop-parity.json'), JSON.stringify({ contract: 'c1-independent-stop-parity-v1', passed: true,
  coverage: ['same-day 14% stop', 'below-stop gap', 'costs exactly once', 'whole-share source ownership', 'one issuer per sleeve', 'SCHW exclusion', '12/25/50 source/cache/uncached parity'],
  receipts: stopReceipts, engineSha256, loaderSha256 }, null, 2));
const invalidSessions = breakerDataset.sessions.slice(0, 2);
const seed = { contract: 'c1-prospective-account-seed-v1', sleeve: 'base', asOfSession: dates[0], prospectiveAdoptionConfirmed: true,
  cash: 100000, highWater: 100000, remainingCooldownSessions: 0, positions: [] };
const executions = { contract: 'c1-actual-fill-replay-v1', sessions: [{ date: dates[1], fills: [{ symbol: 'UNKNOWN', side: 'buy', reason: 'Buy', shares: 1, price: 100, fee: 0 }] }] };
const original = createResearchModuleLoader(root);
const options = { ...original.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS.base, startDate: dates[0], endDate: dates[1], liquidateAtEnd: false };
let originalError;
try { original.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio({ sessions: invalidSessions }, options, seed, executions); } catch (error) { originalError = error.message; }
assert(originalError?.includes('could not be applied'));
const cachedLoader = createProductionReplayLoader(root);
const simulate = cachedLoader.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio;
for (let index = 0; index < 2; index++) assert.throws(() => simulate({ sessions: invalidSessions }, options, seed, executions), error => error.message === originalError);
assert.equal(cachedLoader.stats.resumes, 0);
fs.writeFileSync(path.join(outputRoot, 'failed-cache-rejection.json'), JSON.stringify({ contract: 'c1-independent-failed-cache-rejection-v1', passed: true,
  originalError, repeatedRejections: 2, cacheResumesAfterFailure: 0, engineSha256, loaderSha256 }, null, 2));
console.log(JSON.stringify({ passed: true, breakerScenarios: breakerReceipts.length, stopScenarios: stopReceipts.length, repeatedInvalidFillRejections: 2, engineSha256, loaderSha256 }));
