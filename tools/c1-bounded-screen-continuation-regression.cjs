const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { createWorkflowFixture } = require('./fixtures/c1-trading-workflow.cjs');
const { createNormalRefreshScreen } = require('./fixtures/c1-normal-refresh-screen.cjs');
const { restore, blob } = require('./c1-bounded-screen-continuation-seams.cjs');

const bytes = readFileSync('tools/fixtures/c1-bounded-screen-continuation-source-seams.json');
const inverse = JSON.parse(bytes);
assert.equal(inverse.baselineCommit, '6619d897aa9145b855775718df1d5dbfed7e48ae');
assert.equal(createHash('sha256').update(bytes).digest('hex'), '0f263393a25000323288ba040269c8722e3cd6c1921b647367f5c7e06817accc');
for (const [file, patch] of Object.entries(inverse.files)) {
  const current = readFileSync(file, 'utf8');
  const original = restore(file, current);
  assert.equal(blob(current), patch.afterHash);
  assert.equal(blob(original), patch.beforeHash);
  assert.equal(restore(file, original), original);
  const unknown = current + '\n// unreviewed\n';
  assert.equal(restore(file, unknown), unknown);
}

const symbols = Array.from({ length: 279 }, (_, i) => 'X' + String(i).padStart(3, '0'));
const workflow = createWorkflowFixture('buy', {
  baselineDate: '2026-11-25',
  now: '2026-11-27T16:04:12Z',
  portfolio: [{ symbol: 'CASH', role: 'Swing', shares: 100000, avgCost: 1 }],
});
for (const session of workflow.book.model.sessions.slice(-24)) {
  session.signals = symbols.map((symbol, index) => ({
    symbol, issuer: symbol, sector: 'Sector ' + index, price: 100, action: 'Strong Buy',
    researchFactors: { momentumPercentile: 100 - 100 * index / symbols.length, volatility60Pct: 20, factorCoverage: 1 },
    entryTiming: { available: true, asOf: session.date, macdImproving: true, liquidityPass: true, averageDollarVolume20: 1e9, strongPass: true, pass: true },
    riskPlan: { invalidationPrice: 86 },
    recommendation: {},
  }));
  session.positionSignals = session.signals;
  session.universeSymbols = [...symbols];
  session.prices = [...symbols, 'SPY', 'QQQ'].map(symbol => ({ symbol, date: session.date, open: 100, high: 101, low: 99, close: 100, volume: 1e7, adjusted: true }));
}

const continuation = { 'x-c1-scan-continue': '1' };
async function read(screen, pass, headers) {
  const start = screen.logs.length;
  const response = await screen.request({ compact: '1', verificationPass: String(pass), screenSymbols: symbols.join(',') }, headers);
  assert.equal(response.status, 200);
  const { c1UniverseScan: scan, quoteFeedStatus } = response.body.meta;
  const batches = screen.logs.slice(start).filter(row => row[0] === 'TOP5_TIMING')
    .map(row => JSON.parse(row[1]))
    .filter(row => row.event === 'start' && row.phase === 'events.map')
    .map(row => row.count);
  assert.equal(scan.sourceSessionDate, '2026-11-25');
  assert.equal(scan.total, 279);
  assert.equal(scan.sourceComplete, true);
  assert.equal(quoteFeedStatus, scan.complete ? 'live' : 'incomplete');
  return { scan, batches };
}

async function main() {
  const screen = createNormalRefreshScreen(workflow);
  const actual = [];
  for (let pass = 0; pass < 5; pass++) actual.push(await read(screen, pass, pass ? continuation : {}));
  assert.deepEqual(actual.map(({ scan }) => scan.scanned), [32, 96, 160, 224, 279]);
  assert.deepEqual(actual.map(({ batches }) => batches.slice(1)), [[32], [32, 32], [32, 32], [32, 32], [32, 23]]);
  assert.equal(new Set(actual.map(({ scan }) => scan.sourceIdentity)).size, 1);
  assert(actual.slice(0, -1).every(({ scan }) => !scan.complete && !scan.evidenceComplete));
  assert.equal(actual.at(-1).scan.evidenceComplete, true);
  assert.equal((await read(screen, 5, continuation)).batches.length, 1, 'A complete scan does not schedule a second batch.');

  let elapsed = 0;
  const slow = createNormalRefreshScreen(workflow, {
    monotonicClock: { now: () => elapsed },
    onProviderRequest(endpoint) { if (endpoint === 'batch-quote') elapsed = 13001; },
  });
  const short = await read(slow, 1, continuation);
  assert.equal(short.scan.scanned, 32, 'A first batch that leaves less than 42 seconds returns its partial receipt.');
  assert.deepEqual(short.batches.slice(1), [32]);
  console.log('PASS: actual screen handler finishes 279 names in five requests, caps each event batch at 32 and reserves the existing request budget.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
