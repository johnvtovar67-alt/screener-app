const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const babel = require('next/dist/compiled/babel/core');

// Execute the complete production/current route with its actual pure decision
// functions. Only external I/O is replaced. No live provider, account or Blob
// request is possible in this harness. Timers preserve realistic phase latency
// and concurrency without making CI wait a minute for every failure scenario.
const ROOT = process.cwd(), EPOCH = Date.parse('2026-10-08T21:00:00Z');
const BASELINE = 'tools/fixtures/top5-production-ffdd79b.js';
const CURRENT = 'pages/api/top5.js';
const COMPILED = new Map();
const clone = value => JSON.parse(JSON.stringify(value));
const normalizedSymbol = value => String(value || '').replace('-', '.').toUpperCase().trim();

function virtualClock() {
  let now = EPOCH, sequence = 0;
  const timers = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function setTimer(callback, delay = 0, ...args) {
    const id = ++sequence;
    timers.set(id, { due: now + Math.max(0, Number(delay) || 0), callback: () => callback(...args) });
    return id;
  }
  const clearTimer = id => timers.delete(id);
  const wait = delay => new Promise(resolve => setTimer(resolve, delay));
  async function settle(promise, maximumMs = 240000) {
    let result, failure, settled = false;
    Promise.resolve(promise).then(value => { result = value; settled = true; }, error => { failure = error; settled = true; });
    const start = now;
    for (let turn = 0; !settled && turn < 100000; turn++) {
      // Let complete promise chains enqueue their next timer before advancing.
      for (let tick = 0; tick < 128; tick++) await Promise.resolve();
      if (settled) break;
      const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      assert.ok(next, 'The actual handler stalled without a timer or a response');
      assert.ok(next[1].due - start <= maximumMs, 'The actual handler exceeded the fixture runtime limit');
      now = next[1].due; timers.delete(next[0]); next[1].callback();
    }
    assert.ok(settled, 'The actual handler must settle');
    if (failure) throw failure;
    return result;
  }
  return { Date: ClockDate, setTimeout: setTimer, clearTimeout: clearTimer, wait, settle, now: () => now, advance: ms => { now += ms; } };
}

function compile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const key = file + ':' + source;
  if (!COMPILED.has(key)) COMPILED.set(key, babel.transformSync(source, {
    filename: file, babelrc: false, configFile: false,
    presets: [[require.resolve('next/babel'), { 'preset-env': { modules: 'commonjs' } }]],
  }).code);
  return COMPILED.get(key);
}

function createHarness(route = CURRENT, options = {}) {
  const clock = virtualClock(), calls = [], logs = [], moduleCache = new Map();
  const latencies = { discovery: 0, snapshot: 0, quote: 0, fundamentals: 0, continuity: 0, event: 0, timing: 0, ledger: 0, ...options.latencies };
  const call = (phase, details = {}) => { const row = { phase, at: clock.now() - EPOCH, ...details }; calls.push(row); return row; };
  const boundary = async (phase, value, details = {}) => {
    const row = call(phase, details); await clock.wait(latencies[phase]); row.finished = clock.now() - EPOCH;
    if (options.fail === phase) throw new Error('Fixture ' + phase + ' unavailable');
    return value;
  };
  const forbidden = name => () => { throw new Error('Unexpected external I/O: ' + name); };
  class FrozenMarketDate extends clock.Date {
    constructor(...args) { super(...(args.length ? args : [EPOCH])); }
    static now() { return EPOCH; }
  }
  const sandbox = {
    console: { log: (...args) => logs.push(args), info: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    process: { env: { FMP_API_KEY: 'offline-fixture-key', VERCEL_ENV: 'production', NODE_ENV: 'test' } },
    Date: options.freezeMarketClock ? FrozenMarketDate : clock.Date, Intl, Math, Number, String, Object, Array, Set, Map, WeakMap, Boolean, RegExp, Error, TypeError,
    JSON, URL, URLSearchParams, AbortController, AbortSignal, Response, Buffer,
    performance: { now: () => clock.now() - EPOCH },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  };
  const context = vm.createContext(sandbox);
  let snapshot;
  const discoveryCandidates = Array.from({ length: options.discoveryCount ?? 500 }, (_, index) => ({
    symbol: 'X' + String(index).padStart(3, '0'), companyName: 'Fixture company ' + index,
    sector: 'Sector ' + index % 12, discoveryScore: 100 - index / 10,
    price: 100, marketCap: 2000000000, avgVolume: 5000000,
  }));
  const quote = symbol => {
    const index = Number(String(symbol).replace(/\D/g, '')) || 0;
    return {
      symbol, companyName: 'Fixture issuer ' + symbol, name: 'Fixture issuer ' + symbol,
      price: 100, previousClose: 99, change: 1, changesPercentage: 100 / 99,
      marketCap: 2000000000, volume: 5000000, avgVolume: 5000000,
      priceAvg50: 95, priceAvg200: 90, yearHigh: 102, yearLow: 55,
      eps: 6, pe: 100 / 6, beta: 1.1, exchange: 'NASDAQ', timestamp: options.quoteTimestamp ?? EPOCH / 1000,
      sector: 'Sector ' + index % 12, ...(options.quoteOverrides?.[symbol] || {}),
    };
  };
  const fundamentals = symbol => ({
    symbol, fundamentalDataStatus: 'complete', fundamentalDataVerified: true,
    fundamentalSources: { ratiosTtm: true, incomeGrowth: true, ratioFields: 12, growthFields: 3 },
    pe: 18, grossMargin: 60, operatingMargin: 30, netMargin: 24, debtToEquity: 0.2,
    currentRatio: 2, freeCashFlowYield: 8, returnOnEquity: 24, returnOnAssets: 16,
    revenueGrowth: 25, earningsGrowth: 30, operatingIncomeGrowth: 28,
  });
  const timing = symbol => ({ symbol, available: true, pass: true, strongPass: true,
    liquidityPass: true, liquidityVerified: true, liquiditySessions: 20,
    averageDollarVolume20: 500000000, asOf: '2026-10-08', ret3: 1, ret5: 2, ret10: 3,
    status: 'Confirmed', reason: 'Fixture verified timing', shortTermTechnicalScore: 90,
    ...(options.lowLiquidity?.includes(symbol) ? { averageDollarVolume20: 100000000, liquidityPass: false } : {}) });
  const event = symbol => ({ symbol, status: 'Passed', label: 'Pre-Trade Check: Passed',
    checkComplete: true, blockNewCapital: false, manualCheckRequired: false,
    earningsCheckComplete: true, mergerCheckComplete: true, newsCheckComplete: true, materialCatalysts: [],
    ...(options.blockedEvents?.includes(symbol) ? { status: 'Blocked', blockNewCapital: true, detail: 'Fixture material event block' } : {}) });
  sandbox.fetch = async (rawUrl, fetchOptions = {}) => {
    const url = new URL(rawUrl);
    assert.equal(url.hostname, 'financialmodelingprep.com', 'Only mocked FMP quotes may reach fetch');
    assert.ok(['/stable/batch-quote', '/stable/quote'].includes(url.pathname), 'No other external request may run');
    const symbols = (url.searchParams.get('symbols') || url.searchParams.get('symbol') || '').split(',').map(normalizedSymbol);
    const row = call('quote', { symbols });
    return new Promise((resolve, reject) => {
      const abort = () => { clock.clearTimeout(timer); row.aborted = clock.now() - EPOCH; const error = new Error('Fixture quote aborted'); error.name = 'AbortError'; reject(error); };
      const timer = clock.setTimeout(() => {
        row.finished = clock.now() - EPOCH;
        fetchOptions.signal?.removeEventListener('abort', abort);
        const rows = symbols.filter(symbol => !options.missingQuotes?.includes(symbol)).map(quote);
        const batch = url.pathname === '/stable/batch-quote';
        const status = batch && options.batchStatus ? options.batchStatus : options.failQuotes ? 503 : 200;
        resolve({ ok: status === 200, status,
          json: async () => { if (!batch && options.singleJsonLatency) await clock.wait(options.singleJsonLatency); return rows; },
          text: async () => { if (batch && options.batchTextLatency) await clock.wait(options.batchTextLatency); return status === 200 ? '' : 'Fixture quote unavailable'; } });
      }, latencies.quote);
      if (fetchOptions.signal?.aborted) abort(); else fetchOptions.signal?.addEventListener('abort', abort, { once: true });
    });
  };
  function resolve(request, parent) {
    if (!request.startsWith('.')) return request;
    const filename = path.resolve(path.dirname(parent), request);
    return fs.existsSync(filename) ? filename : filename + '.js';
  }
  function actual(file) {
    file = path.resolve(file);
    if (moduleCache.has(file)) return moduleCache.get(file).exports;
    const record = { exports: {} }; moduleCache.set(file, record);
    const execute = new vm.Script('(function(require,module,exports){' + compile(file) + '\n})', { filename: file }).runInContext(context);
    execute(request => {
      if (request === '@vercel/blob') return { get: forbidden('Blob get'), list: forbidden('Blob list'), put: forbidden('Blob put'), del: forbidden('Blob del') };
      if (request.startsWith('node:')) return require(request);
      if (request.startsWith('@babel/runtime/')) return require('next/dist/compiled/' + request);
      if (!request.startsWith('.')) throw new Error('Unmocked external import: ' + request);
      const dependency = resolve(request, file);
      if (dependency === path.join(ROOT, 'lib/fullMarketDiscovery.js')) return {
        getFullMarketDiscovery: async readOptions => {
          if (route === CURRENT) assert.equal(readOptions?.refreshIfStale, false, 'Interactive screens must not rebuild the daily discovery universe');
          return boundary('discovery', {
          status: 'ready', stale: false, builtAt: new clock.Date().toISOString(),
          candidates: discoveryCandidates, sourceUniverseSize: 4000, eligibleUniverseSize: 1200,
          liquidityCoveragePct: 100, config: { minAvgDollarVolume: 10000000 },
          });
        },
      };
      if (dependency === path.join(ROOT, 'lib/v11ProductionSnapshot.js')) return { getV11ProductionSnapshot: async () => boundary('snapshot', snapshot) };
      if (dependency === path.join(ROOT, 'lib/strongBuyPersistence.js')) return {
        seedDurableStrongBuyMemory: async () => {
          await boundary('continuity', null);
          context.__screenerStrongBuyMemoryV1 = new Map([['X499', { action: 'Strong Buy', earnedAt: EPOCH, interruptedAt: 0 }]]);
        },
      };
      if (dependency === path.join(ROOT, 'lib/performanceStore.js')) return {
        updatePerformanceLedger: async rows => boundary('ledger', { ok: true }, { symbols: rows.map(row => row.symbol) }),
      };
      const exports = actual(dependency);
      if (dependency === path.join(ROOT, 'lib/fmpFundamentals.js')) return { ...exports,
        fetchFmpFundamentals: async symbols => boundary('fundamentals', new Map(symbols.map(symbol => [symbol, fundamentals(symbol)])), { symbols: [...symbols] }) };
      if (dependency === path.join(ROOT, 'lib/entryTiming.js')) return { ...exports,
        fetchEntryTimingMap: async symbols => boundary('timing', new Map(symbols.map(symbol => [symbol, timing(symbol)])), { symbols: [...symbols] }) };
      if (dependency === path.join(ROOT, 'lib/eventRisk.js')) return { ...exports,
        fetchEventRiskMap: async symbols => boundary('event', new Map(symbols.map(symbol => [symbol, event(symbol)])), { symbols: [...symbols] }) };
      return exports;
    }, record, record.exports);
    return record.exports;
  }
  const policy = actual(path.join(ROOT, 'lib/v11ProductionPolicy.js'));
  const session = { date: '2026-10-08', signals: Array.from({ length: 12 }, (_, index) => ({
    symbol: 'X' + String(index).padStart(3, '0'), companyName: 'Fixture issuer ' + index,
    cik: String(10000 + index), sector: 'Sector ' + index % 12, price: 100,
    researchFactors: { momentumPercentile: 100 - index }, entryTiming: timing('X' + index),
  })) };
  snapshot = { ...policy.buildV11ProductionSnapshot(session, new clock.Date()), status: 'ready',
    requiredSessionDate: session.date, snapshotAgeSessions: 0,
    independentlyValidated: true, activationAuthorized: true, evidenceStatus: 'independently-validated' };
  const classification = actual(path.join(ROOT, 'lib/c1StockClassification.js'));
  const screenSnapshot = classification.buildC1StockScreenSnapshot(session);
  const handler = actual(path.join(ROOT, route)).default;
  function request(query = {}) {
    const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    const started = clock.now();
    return Promise.resolve(handler({ method: 'GET', query: { theme: 'opportunities', ...query }, headers: {} }, response))
      .then(() => ({ code: response.code, body: clone(response.body), headers: response.headers, elapsedMs: clock.now() - started }));
  }
  return { request, clock, calls, logs, snapshot, screenSnapshot, latencies,
    cache: () => context.__screenerBroadOpportunityCacheV9,
    quoteCache: () => context.__screenerFmpQuoteCacheV4,
    quoteCooldown: () => Number(context.__screenerFmpQuoteCooldownV4 || 0),
    inflight: () => context.__screenerBroadInflightV1,
    installProducer: (promise, cached) => {
      context.__screenerBroadOpportunityCacheV9 = { ...cached, promise };
      context.__screenerBroadInflightV1 = new Map([['2026-10-08:1', promise]]);
    },
    classify: rows => clone(classification.classifyC1StockScreen({ snapshot: screenSnapshot, rows, current: true })) };
}

function assertHealthy(response) {
  assert.equal(response.code, 200, JSON.stringify(response.body));
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(response.body.meta.quoteCoverageAdequate, true);
  assert.equal(response.body.meta.quoteFeedStatus, 'live');
  assert.equal(response.body.meta.performanceObservationRecorded, true);
}
function decisionParity(current, baseline) {
  assert.deepEqual(current.body.stocks, baseline.body.stocks, 'Actual-route stocks, ranking and decisions must remain identical');
  assert.deepEqual(current.body.themeLeadership, baseline.body.themeLeadership);
  const stableMeta = response => {
    const { snapshotAsOf, snapshotAgeSeconds, ...meta } = response.body.meta; return meta;
  };
  assert.deepEqual(stableMeta(current), stableMeta(baseline), 'Existing response metadata must remain identical');
}

async function main() {
  const provenance = JSON.parse(fs.readFileSync('tools/fixtures/top5-production-ffdd79b.json'));
  const baselineSource = fs.readFileSync(BASELINE);
  assert.equal(createHash('sha1').update(Buffer.from('blob ' + baselineSource.length + '\0')).update(baselineSource).digest('hex'),
    provenance.gitBlobHash, 'The production route oracle must remain an exact unmodified Git blob');
  const baseline = createHarness(BASELINE), current = createHarness();
  const oldFull = await baseline.clock.settle(baseline.request());
  const newFull = await current.clock.settle(current.request());
  assertHealthy(oldFull); assertHealthy(newFull); decisionParity(newFull, oldFull);
  assert.equal(newFull.body.stocks.length, oldFull.body.meta.universeSize, 'The full universe is preserved');
  const classifications = current.classify(newFull.body.stocks);
  assert.deepEqual(classifications, baseline.classify(oldFull.body.stocks), 'Account-independent original C1 stock classifications stay identical');
  assert.equal(classifications.filter(row => row.rating === 'Buy').length, 3, 'The fixture must exercise real C1 Buy selection');
  assert.equal(classifications.filter(row => row.rating === 'Watch').length, 6, 'The fixture must retain the other six ranked candidates');

  const screenSymbols = current.screenSnapshot.candidates.map(row => row.symbol).join(',');
  const compactQuery = { compact: '1', screenSymbols, symbol: 'X499' };
  const before = current.calls.length;
  const compact = await current.clock.settle(current.request(compactQuery));
  const oldCompact = await baseline.clock.settle(baseline.request(compactQuery));
  assertHealthy(compact); decisionParity(compact, oldCompact);
  assert.equal(current.calls.length, before, 'Compact selection reuses the authoritative cached result without I/O');
  for (const symbol of [...screenSymbols.split(','), 'X499']) assert.ok(compact.body.stocks.some(row => row.symbol === symbol), 'Compact response retains ' + symbol);
  for (const row of newFull.body.stocks.filter(row => ['Buy', 'Strong Buy'].includes(row.finalDecision?.action))) {
    assert.ok(compact.body.stocks.some(retained => retained.symbol === row.symbol), 'Compact response retains every actionable row');
  }
  assert.deepEqual(current.classify(compact.body.stocks), current.classify(newFull.body.stocks), 'Compact/full responses preserve original stock classification');

  // A faster task graph must retain the same results when earlier gates prune
  // candidates, rather than passing only the all-clear provider fixture.
  const guardedOptions = { blockedEvents: ['X000'], lowLiquidity: ['X001'], quoteOverrides: { X002: { price: 104 } } };
  const guardedOld = createHarness(BASELINE, guardedOptions), guardedCurrent = createHarness(CURRENT, guardedOptions);
  const guardedOldResponse = await guardedOld.clock.settle(guardedOld.request(compactQuery));
  const guardedResponse = await guardedCurrent.clock.settle(guardedCurrent.request(compactQuery));
  decisionParity(guardedResponse, guardedOldResponse);
  const guardedRatings = guardedCurrent.classify(guardedResponse.body.stocks);
  assert.deepEqual(guardedRatings, guardedOld.classify(guardedOldResponse.body.stocks));
  for (const symbol of ['X000', 'X001', 'X002']) assert.equal(guardedRatings.find(row => row.symbol === symbol)?.rating, 'Watch',
    'Material-event, liquidity and price-gap blocks retain original stock classification');

  const baselinePass = await baseline.clock.settle(baseline.request({ verificationPass: '1', compact: '1', screenSymbols }));
  const currentPass = await current.clock.settle(current.request({ verificationPass: '1', compact: '1', screenSymbols }));
  assertHealthy(currentPass); decisionParity(currentPass, baselinePass);
  const priorities = current.calls.filter(row => row.phase === 'fundamentals').map(row => row.symbols);
  assert.deepEqual(priorities[1], [...priorities[0].slice(24), ...priorities[0].slice(0, 24)], 'Manual pass retains the existing fundamental rotation');

  const incomplete = createHarness(CURRENT, { missingQuotes: ['SPY', 'QQQ'] });
  const paused = await incomplete.clock.settle(incomplete.request({ compact: '1', screenSymbols }));
  assert.equal(paused.code, 200); assert.equal(paused.body.meta.quoteCoverageAdequate, false);
  assert.ok(paused.body.stocks.every(row => !['Buy', 'Strong Buy'].includes(row.finalDecision?.action)), 'Incomplete benchmark verification cannot authorize a purchase');

  const slowLatencies = { discovery: 1800, snapshot: 300, quote: 1200, fundamentals: 18000, continuity: 300, event: 8000, timing: 18000, ledger: 500 };
  // Hold market time fixed while monotonic timers vary. Real quote-age and
  // continuity timestamp fields otherwise change solely because one route is
  // faster; keeping both clocks explicit allows complete stock-object parity.
  const oldSlow = createHarness(BASELINE, { latencies: slowLatencies, freezeMarketClock: true });
  const oldSlowResponse = await oldSlow.clock.settle(oldSlow.request({ compact: '1', screenSymbols }));
  const newSlow = createHarness(CURRENT, { latencies: slowLatencies, freezeMarketClock: true });
  const newSlowResponse = await newSlow.clock.settle(newSlow.request({ compact: '1', screenSymbols }));
  console.log('TOP5 LATENCY FIXTURE:', JSON.stringify({ productionBaselineMs: oldSlowResponse.elapsedMs,
    currentMs: newSlowResponse.elapsedMs, universeSize: oldSlowResponse.body.meta.universeSize,
    productionQuoteCalls: oldSlow.calls.filter(row => row.phase === 'quote').length,
    currentQuoteCalls: newSlow.calls.filter(row => row.phase === 'quote').length }));
  assertHealthy(newSlowResponse);
  assert.deepEqual(newSlowResponse.body.stocks, oldSlowResponse.body.stocks, 'Latency repair cannot change the same verified decisions');

  if (!process.argv.includes('--diagnostic-only')) {
    assert.ok(newSlowResponse.elapsedMs < 55000, 'Realistic cold compact load needs platform deadline headroom');
    const concurrent = createHarness(CURRENT, { latencies: { discovery: 300, quote: 100, fundamentals: 500, event: 200, timing: 500 } });
    const responses = await concurrent.clock.settle(Promise.all([
      concurrent.request({ verificationPass: '1', compact: '1', screenSymbols }),
      concurrent.request({ verificationPass: '1', compact: '1', screenSymbols }),
    ]));
    for (const response of responses) assertHealthy(response);
    assert.deepEqual(responses[0].body, responses[1].body);
    for (const phase of ['discovery', 'snapshot', 'fundamentals', 'continuity', 'event', 'timing', 'ledger']) {
      assert.equal(concurrent.calls.filter(row => row.phase === phase).length, 1, 'Concurrent same-pass reloads share ' + phase);
    }
    const stalled = createHarness(CURRENT, { latencies: { fundamentals: 120000 } });
    const failure = await stalled.clock.settle(stalled.request({ compact: '1', screenSymbols }));
    assert.equal(failure.code, 503, 'An unfinished build returns a clean API failure');
    assert.equal(failure.body.retryable, true); assert.equal(failure.body.code, 'TOP5_TIMEOUT');
    assert.ok(failure.elapsedMs < 60000, 'Clean failure precedes the platform cutoff');
    assert.equal(stalled.cache()?.rows, null);
    await stalled.clock.settle(stalled.clock.wait(75000));
    assert.equal(stalled.cache()?.rows, null, 'An uncooperative provider resolving after timeout cannot publish a live result');
    stalled.latencies.fundamentals = 0;
    const recovered = await stalled.clock.settle(stalled.request({ compact: '1', screenSymbols }));
    assertHealthy(recovered);
    assert.equal(stalled.calls.filter(row => row.phase === 'fundamentals').length, 2, 'A timed-out build cannot masquerade as a successful cached result');

    const prior = createHarness();
    const verified = await prior.clock.settle(prior.request(compactQuery)); assertHealthy(verified);
    const priorRows = clone(prior.cache().rows), priorBuiltAt = prior.cache().ts;
    prior.latencies.fundamentals = 120000;
    const retained = await prior.clock.settle(prior.request({ ...compactQuery, verificationPass: '1' }));
    assert.equal(retained.code, 200, 'A prior verified server snapshot survives a timed-out manual reload');
    assert.equal(retained.body.meta.quoteFeedStatus, 'stale-verified');
    assert.equal(retained.body.meta.performanceObservationRecorded, false);
    assert.equal(retained.body.meta.snapshotAsOf, verified.body.meta.snapshotAsOf);
    assert.ok(retained.elapsedMs < 60000);
    assert.deepEqual(retained.body.stocks.map(row => row.symbol), verified.body.stocks.map(row => row.symbol), 'Prior candidates remain visible for continuity');
    assert.ok(retained.body.stocks.every(row => row.dataFeedSnapshotStale && !['Buy', 'Strong Buy'].includes(row.finalDecision?.action)), 'Retained rows never carry live new-capital authority');
    assert.equal(prior.calls.filter(row => row.phase === 'ledger').length, 1, 'An expired refresh cannot start a new ledger write');
    await prior.clock.settle(prior.clock.wait(75000));
    assert.equal(prior.cache().ts, priorBuiltAt, 'The original verified cache timestamp remains authoritative');
    assert.deepEqual(clone(prior.cache().rows), priorRows, 'Late failed work cannot replace the verified server cache');

    // An independently timed waiter must leave a shared producer owned by
    // another request intact. Use a real successfully built snapshot as the
    // shared result, and inject only the promise's completion latency.
    const waiter = createHarness();
    await waiter.clock.settle(waiter.request(compactQuery));
    const producerSnapshot = waiter.cache();
    const producer = waiter.clock.wait(80000).then(() => producerSnapshot);
    waiter.installProducer(producer, producerSnapshot);
    const expiredWaiter = await waiter.clock.settle(waiter.request({ ...compactQuery, verificationPass: '1' }));
    assert.equal(expiredWaiter.code, 200); assert.equal(expiredWaiter.body.meta.quoteFeedStatus, 'stale-verified');
    assert.ok(expiredWaiter.body.stocks.every(row => row.dataFeedSnapshotStale && !['Buy', 'Strong Buy'].includes(row.finalDecision?.action)));
    assert.equal(waiter.inflight().get('2026-10-08:1'), producer, 'A waiter timeout must not clear another request\'s producer');
    assert.equal(waiter.cache().promise, producer);
    const survivingWaiter = await waiter.clock.settle(waiter.request({ ...compactQuery, verificationPass: '1' }));
    assertHealthy(survivingWaiter);
    assert.deepEqual(survivingWaiter.body.stocks, verified.body.stocks);
    assert.equal(waiter.calls.filter(row => row.phase === 'fundamentals').length, 1, 'A later waiter shares the intact producer without rebuilding');

    // Prime immediately before the next close: the row session is October 8,
    // while a rebuild beginning six seconds later requires October 9. The
    // prior rows are still inside the five-minute cache TTL, so a staging entry
    // must never make them appear newly verified under the new session key.
    const beforeClose = Date.parse('2026-10-09T19:59:55Z');
    const primeRollover = async options => {
      const harness = createHarness(CURRENT, { ...options, quoteTimestamp: beforeClose / 1000 });
      harness.clock.advance(beforeClose - EPOCH);
      const response = await harness.clock.settle(harness.request(compactQuery)); assertHealthy(response);
      assert.equal(harness.cache().requiredSessionDate, '2026-10-08');
      harness.clock.advance(6000);
      Object.assign(harness.snapshot, { sourceSessionDate: '2026-10-09', requiredSessionDate: '2026-10-09', datasetThrough: '2026-10-09' });
      for (const candidate of harness.snapshot.candidates) candidate.sourceTiming.asOf = '2026-10-09';
      return { harness, response };
    };
    const { harness: rollover, response: beforeRollover } = await primeRollover({});
    rollover.latencies.discovery = 500; rollover.latencies.fundamentals = 1000;
    const rolloverResponses = await rollover.clock.settle(Promise.all([rollover.request(compactQuery), rollover.request(compactQuery)]));
    for (const response of rolloverResponses) {
      assertHealthy(response);
      assert.ok(response.elapsedMs >= 1500, 'A concurrent new-session request waits for the actual rebuild');
      assert.notEqual(response.body.meta.snapshotAsOf, beforeRollover.body.meta.snapshotAsOf);
      assert.equal(response.body.meta.productionPolicy.sourceSessionDate, '2026-10-09');
    }
    assert.deepEqual(rolloverResponses[0].body, rolloverResponses[1].body);
    assert.equal(rollover.calls.filter(row => row.phase === 'fundamentals').length, 2, 'Only one rebuild follows the prior session snapshot');

    const failedOptions = {};
    const { harness: failedRollover } = await primeRollover(failedOptions);
    // primeRollover spreads input options, so use a mutable provider control
    // through a delayed phase rather than changing unrelated source functions.
    failedRollover.latencies.fundamentals = 120000;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await failedRollover.clock.settle(failedRollover.request(compactQuery));
      assert.equal(response.code, 200); assert.equal(response.body.meta.quoteFeedStatus, 'stale-verified');
      assert.equal(failedRollover.cache().requiredSessionDate, '2026-10-08', 'A failed rebuild cannot restamp prior rows as the newly completed session');
    }
    assert.equal(failedRollover.calls.filter(row => row.phase === 'fundamentals').length, 3, 'A failed rollover retries verification rather than hitting a falsely fresh cache');

    const lateSingle = createHarness(CURRENT, { batchStatus: 403, singleJsonLatency: 56000 });
    const singleFailure = await lateSingle.clock.settle(lateSingle.request(compactQuery));
    assert.equal(singleFailure.code, 503); assert.equal(singleFailure.body.code, 'TOP5_TIMEOUT');
    await lateSingle.clock.settle(lateSingle.clock.wait(75000));
    assert.equal(lateSingle.quoteCache().size, 0, 'Late emergency single-quote JSON cannot populate verified quote cache');
    assert.equal(lateSingle.calls.filter(row => row.phase === 'quote' && row.symbols.length === 1).length, 2, 'An expired single fallback cannot start the remaining six symbols');

    const lateThrottle = createHarness(CURRENT, { batchStatus: 429, batchTextLatency: 56000 });
    const throttleFailure = await lateThrottle.clock.settle(lateThrottle.request(compactQuery));
    assert.equal(throttleFailure.code, 503); assert.equal(throttleFailure.body.code, 'TOP5_TIMEOUT');
    await lateThrottle.clock.settle(lateThrottle.clock.wait(75000));
    assert.equal(lateThrottle.quoteCooldown(), 0, 'A late throttling body cannot publish provider cooldown after deadline');
    assert.equal(lateThrottle.quoteCache().size, 0);
    assert.equal(lateThrottle.calls.filter(row => row.phase === 'quote').length, 4, 'A late throttling body cannot dispatch retry or single fallback work');
  }
  console.log('PASS: actual top5 route preserves full/compact ranked decisions, screen classifications, manual priority rotation, caching and fail-closed benchmark coverage with mocked I/O.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
