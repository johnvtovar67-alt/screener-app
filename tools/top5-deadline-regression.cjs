const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('next/dist/compiled/babel/core');

// Run the real request helper with real AsyncLocalStorage and AbortSignals.
// Only the clock, timers, logging and fetch boundary are replaced, so the
// production deadline is exercised without a matching CI delay.
const HELPER = path.resolve('lib/top5Diagnostics.js');
const EPOCH = Date.parse('2026-10-09T12:00:00Z');
const SECRET_A = 'fixture-provider-secret-a';
const SECRET_B = 'fixture-provider-secret-b';
const BODY_SECRET = 'fixture-private-response-body';
const providerUrl = key => `https://financialmodelingprep.com/stable/batch-quote?symbols=TEST&apikey=${key}`;
function compile(file) {
  return babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, babelrc: false, configFile: false,
    presets: [[require.resolve('next/babel'), { 'preset-env': { modules: 'commonjs' } }]],
  }).code;
}
const compiled = compile(HELPER);

function virtualClock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [EPOCH + now])); }
    static now() { return EPOCH + now; }
  }
  function setTimer(callback, delay = 0, ...args) {
    const id = ++sequence;
    timers.set(id, { due: now + Math.max(0, Number(delay) || 0), callback: () => callback(...args) });
    return id;
  }
  const clearTimer = id => timers.delete(id);
  const flush = async () => { for (let tick = 0; tick < 32; tick++) await Promise.resolve(); };
  async function settle(promise) {
    let settled = false, result, failure;
    Promise.resolve(promise).then(value => { result = value; settled = true; }, error => { failure = error; settled = true; });
    for (let turn = 0; !settled && turn < 1000; turn++) {
      await flush();
      if (settled) break;
      const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      assert.ok(next, 'The helper must settle or have a pending virtual timer');
      now = Math.max(now, next[1].due);
      timers.delete(next[0]);
      next[1].callback();
    }
    assert.ok(settled, 'The helper must settle within the fixture timer limit');
    if (failure) throw failure;
    return result;
  }
  return {
    Date: ClockDate, now: () => now, setTimeout: setTimer, clearTimeout: clearTimer, settle, flush,
    elapseWithoutTimers: ms => { now += ms; }, pendingTimers: () => timers.size,
  };
}

function createHarness(latency = 1000) {
  const clock = virtualClock(), calls = [], logs = [];
  const fetch = (url, options = {}) => {
    const call = { url, options, startedAt: clock.now(), completed: false };
    calls.push(call);
    return new Promise((resolve, reject) => {
      const abort = () => {
        clock.clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        call.abortedAt = clock.now();
        call.abortReason = options.signal.reason;
        reject(call.abortReason);
      };
      const timer = clock.setTimeout(() => {
        options.signal?.removeEventListener('abort', abort);
        call.completed = true;
        call.completedAt = clock.now();
        resolve({ ok: true, json: async () => ({ privateBody: BODY_SECRET }) });
      }, typeof latency === 'function' ? latency(url) : latency);
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener('abort', abort, { once: true });
    });
  };
  const record = { exports: {} };
  const context = vm.createContext({
    module: record, exports: record.exports,
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    process: { env: { FMP_API_KEY: SECRET_A } },
    Date: clock.Date, Math, Error, URL, URLSearchParams, AbortController, AbortSignal, Response,
    performance: { now: clock.now }, fetch,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  });
  const execute = new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename: HELPER }).runInContext(context);
  execute(request => {
    if (request.startsWith('node:')) return require(request);
    if (request.startsWith('@babel/runtime/')) return require('next/dist/compiled/' + request);
    throw new Error('Unexpected helper dependency: ' + request);
  }, record, record.exports);
  function loadModule(relativeFile, mocks = {}) {
    const file = path.resolve(relativeFile), moduleRecord = { exports: {} };
    const run = new vm.Script(`(function(require,module,exports){${compile(file)}\n})`, { filename: file }).runInContext(context);
    run(request => {
      if (Object.hasOwn(mocks, request)) return mocks[request];
      if (request === './top5Diagnostics' || request === './top5Diagnostics.js') return record.exports;
      if (request.startsWith('node:')) return require(request);
      if (request.startsWith('@babel/runtime/')) return require('next/dist/compiled/' + request);
      throw new Error('Unmocked module dependency: ' + request);
    }, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  return {
    helper: record.exports, clock, calls, logs, loadModule,
    setFetch: mock => { context.fetch = mock; }, globalValue: key => context[key],
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createPerformanceHarness({ firstGet, firstPut } = {}) {
  const harness = createHarness(), blobCalls = [], pureCalls = [];
  const blobUrl = 'https://fixture.invalid/screener-performance-ledger.json';
  let getCount = 0, putCount = 0;
  const blob = {
    list: async () => {
      blobCalls.push({ operation: 'list', at: harness.clock.now() });
      return { blobs: [{ pathname: 'screener-performance-ledger.json', url: blobUrl }] };
    },
    get: async () => {
      blobCalls.push({ operation: 'get', at: harness.clock.now() });
      if (++getCount === 1 && firstGet) return firstGet.promise;
      return { stream: JSON.stringify({ records: [] }) };
    },
    put: async () => {
      blobCalls.push({ operation: 'put', at: harness.clock.now() });
      if (++putCount === 1 && firstPut) return firstPut.promise;
      return { url: blobUrl };
    },
  };
  const ledger = harness.loadModule('lib/performanceStore.js', {
    '@vercel/blob': blob,
    './performanceLedger': {
      applyPerformanceObservation(records) { pureCalls.push('observe'); return [...records]; },
      mergeLedgerRecords(left, right) { pureCalls.push('merge'); return [...left, ...right]; },
      normalizeLedgerRecords(records) { pureCalls.push('normalize'); return [...records]; },
    },
  });
  return { ...harness, ledger, blobCalls, pureCalls, blobUrl };
}

async function moduleDeadlineCases(budget) {
  const events = createHarness();
  events.setFetch(async (url, options) => {
    events.calls.push({ url, options, startedAt: events.clock.now() });
    return { ok: true, json: () => new Promise(resolve => events.clock.setTimeout(() => resolve([]), budget + 1000)) };
  });
  const eventModule = events.loadModule('lib/eventRisk.js', {
    './marketSession': { easternMarketClock: date => ({ key: date.toISOString().slice(0, 10) }) },
  });
  let eventWork;
  const eventRequest = events.helper.profileTop5Request(() => events.helper.top5WithinBudget(() => {
    eventWork = eventModule.fetchEventRiskMap(['TEST']);
    return eventWork;
  }));
  await assert.rejects(events.clock.settle(eventRequest), error => events.helper.isTop5Deadline(error));
  assert.equal(events.clock.now(), budget, 'The outer event request must stop at its deadline while JSON remains pending');
  assert.equal(events.calls.length, 1);
  await assert.rejects(events.clock.settle(eventWork), error => events.helper.isTop5Deadline(error));
  assert.equal(events.clock.now(), budget + 1000);
  assert.equal(events.calls.length, 1, 'Late response JSON must not dispatch the next event endpoint');
  assert.equal(events.globalValue('__screenerEventRiskCacheV2').size, 0, 'Late response JSON must not publish fresh event data');
  assert.equal(events.globalValue('__screenerEventRiskCooldownV2').size, 0, 'A request deadline must not become a provider cooldown');
  assert.equal(events.globalValue('__screenerEventRiskInflightV2').size, 0);
  assertPrivateLogs(events);

  const fundamentals = createHarness(), fundamentalBlobCalls = [];
  fundamentals.setFetch(async (url, options) => {
    fundamentals.calls.push({ url, options, startedAt: fundamentals.clock.now() });
    return { ok: true, json: () => new Promise(resolve => fundamentals.clock.setTimeout(() => resolve([
      { symbol: 'TEST', grossProfitMarginTTM: 0.6, operatingProfitMarginTTM: 0.3, debtToEquityRatioTTM: 0.2 },
    ]), budget + 1000)) };
  });
  const fundamentalModule = fundamentals.loadModule('lib/fmpFundamentals.js', {
    '@vercel/blob': {
      list: async () => { fundamentalBlobCalls.push('list'); return { blobs: [] }; },
      get: async () => { throw new Error('The empty durable cache must not request a Blob body'); },
      put: async () => { fundamentalBlobCalls.push('put'); throw new Error('Expired fundamentals must not be persisted'); },
    },
  });
  let fundamentalWork;
  const fundamentalRequest = fundamentals.helper.profileTop5Request(() => fundamentals.helper.top5WithinBudget(() => {
    fundamentalWork = fundamentalModule.fetchFmpFundamentals(['TEST']);
    return fundamentalWork;
  }));
  await assert.rejects(fundamentals.clock.settle(fundamentalRequest), error => fundamentals.helper.isTop5Deadline(error));
  assert.equal(fundamentals.clock.now(), budget);
  await assert.rejects(fundamentals.clock.settle(fundamentalWork), error => fundamentals.helper.isTop5Deadline(error));
  assert.equal(fundamentals.clock.now(), budget + 1000);
  assert.equal(fundamentals.calls.length, 1, 'Late fundamental JSON must not dispatch growth, statement fallback or another retry');
  assert.equal(fundamentals.globalValue('__fmpFundamentalCacheV7').size, 0, 'Fundamental resilience catches must preserve the typed deadline without publishing late data');
  assert.equal(fundamentals.globalValue('__fmpFundamentalInflightV4').size, 0);
  assert.equal(Number(fundamentals.globalValue('__fmpFundamentalCooldownUntilV3') || 0), 0);
  assert.deepEqual(fundamentalBlobCalls, ['list'], 'Expired fundamentals must not reread or write durable cache');
  assert.equal(fundamentals.clock.pendingTimers(), 0);
  assertPrivateLogs(fundamentals);

  const slowRead = deferred();
  const read = createPerformanceHarness({ firstGet: slowRead });
  let readWork;
  const readRequest = read.helper.profileTop5Request(() => read.helper.top5WithinBudget(() => {
    readWork = read.ledger.updatePerformanceLedger([], new read.clock.Date());
    return readWork;
  }));
  await assert.rejects(read.clock.settle(readRequest), error => read.helper.isTop5Deadline(error));
  assert.deepEqual(read.blobCalls.map(call => call.operation), ['list', 'get']);
  slowRead.resolve({ stream: JSON.stringify({ records: [] }) });
  await assert.rejects(read.clock.settle(readWork), error => read.helper.isTop5Deadline(error));
  assert.deepEqual(read.blobCalls.map(call => call.operation), ['list', 'get'], 'An expired first durable read must prevent later reads and writes');
  assert.equal(read.pureCalls.length, 0, 'Expired durable data must not produce a new ledger observation');
  assert.equal(read.clock.pendingTimers(), 0);
  assertPrivateLogs(read);

  const slowPut = deferred();
  const write = createPerformanceHarness({ firstPut: slowPut });
  let writeWork;
  const writeRequest = write.helper.profileTop5Request(() => write.helper.top5WithinBudget(() => {
    writeWork = write.ledger.updatePerformanceLedger([], new write.clock.Date());
    return writeWork;
  }));
  await assert.rejects(write.clock.settle(writeRequest), error => write.helper.isTop5Deadline(error));
  assert.deepEqual(write.blobCalls.map(call => call.operation), ['list', 'get', 'list', 'get', 'put'], 'The fixture must expire while the first write is already pending');
  const second = write.ledger.updatePerformanceLedger([], new write.clock.Date());
  await write.clock.flush();
  assert.equal(write.blobCalls.length, 5, 'An outer deadline cannot release the ledger lock while its issued put remains pending');
  slowPut.resolve({ url: write.blobUrl });
  await assert.rejects(write.clock.settle(writeWork), error => write.helper.isTop5Deadline(error));
  const secondResult = await write.clock.settle(second);
  assert.equal(secondResult.ok, true, 'An outside-request ledger update may proceed after the expired writer settles');
  assert.deepEqual(write.blobCalls.slice(5).map(call => call.operation), ['list', 'get', 'list', 'get', 'put', 'list', 'get'], 'The expired writer must skip verification; the next writer retains all reconciliation reads');
  assert.equal(write.clock.pendingTimers(), 0);
  assertPrivateLogs(write);
}

async function discoveryReuseCases() {
  const day = 24 * 60 * 60 * 1000;
  const snapshot = age => ({
    schemaVersion: 2, status: 'ready', builtAt: new Date(EPOCH - age).toISOString(),
    sourceUniverseSize: 4000, eligibleUniverseSize: 1200,
    candidates: [{ symbol: 'TEST', companyName: 'Fixture company', discoveryScore: 80 }],
  });
  for (const scenario of [
    { name: 'bounded stale', saved: snapshot(day), status: 'stale', candidates: 1 },
    { name: 'expired stale', saved: snapshot(7 * day + 1), status: 'unavailable', candidates: 0 },
    { name: 'missing', saved: null, status: 'missing', candidates: 0 },
  ]) {
    const harness = createHarness(), blobCalls = [];
    const pathname = 'full-market-discovery-snapshot-v2.json';
    const discovery = harness.loadModule('lib/fullMarketDiscovery.js', {
      '@vercel/blob': {
        list: async () => {
          blobCalls.push('list');
          return { blobs: scenario.saved ? [{ pathname, url: 'https://fixture.invalid/' + pathname }] : [] };
        },
        get: async () => { blobCalls.push('get'); return { stream: JSON.stringify(scenario.saved) }; },
        put: async () => { throw new Error('No-refresh discovery must not persist a new snapshot'); },
      },
    });
    assert.equal(discovery.fullMarketDiscoveryConfig().enabled, true, 'The default enabled discovery path must be exercised');
    assert.equal(harness.globalValue('__fullMarketDiscoverySnapshotV1'), undefined, 'Discovery starts with cold instance memory');
    const result = await harness.clock.settle(discovery.getFullMarketDiscovery({ refreshIfStale: false }));
    assert.equal(result.status, scenario.status, scenario.name);
    assert.equal(result.candidates.length, scenario.candidates, scenario.name);
    assert.equal(harness.calls.length, 0, 'No-refresh discovery must make zero FMP calls: ' + scenario.name);
    assert.deepEqual(blobCalls, scenario.saved ? ['list', 'get'] : ['list']);
    if (scenario.status === 'stale') {
      assert.equal(result.stale, true);
      assert.equal(result.ageMs, day);
      assert.equal(result.builtAt, scenario.saved.builtAt, 'Reused discovery must preserve its original timestamp');
    }
    if (scenario.status === 'unavailable') assert.ok(result.refreshIssue, 'Expired discovery must disclose why its candidates are unavailable');
    assert.equal(harness.clock.pendingTimers(), 0);
  }
}

function timingRows(harness) {
  return harness.logs.map(args => {
    assert.equal(args[0], 'TOP5_TIMING');
    assert.equal(args.length, 2);
    return JSON.parse(args[1]);
  });
}

function assertPrivateLogs(harness) {
  const output = JSON.stringify(harness.logs);
  for (const secret of [SECRET_A, SECRET_B, BODY_SECRET, 'apikey', 'https://financialmodelingprep.com'])
    assert.ok(!output.includes(secret), 'Timing logs must not contain provider URLs, keys or response bodies: ' + secret);
}

async function main() {
  const outside = createHarness();
  const budget = outside.helper.TOP5_REQUEST_BUDGET_MS;
  assert.ok(Number.isFinite(budget) && budget > 6500 && budget < 60000, 'The request budget must allow caller timeouts and precede the 60-second platform cutoff');
  const value = {};
  outside.helper.assertTop5Active();
  assert.equal(outside.helper.top5WithinBudget(() => value), value, 'Outside a request, bounded work remains a direct call');
  assert.equal(outside.helper.top5Phase('outside', () => value), value);
  assert.equal(outside.helper.top5Network('not-a-url', () => value), value, 'Outside a request, diagnostics must not parse provider URLs');
  outside.helper.top5Count('outside');
  const originalSignal = new AbortController().signal;
  const headers = { 'x-fixture': 'preserved' };
  await outside.clock.settle(outside.helper.top5Fetch(providerUrl(SECRET_A), { signal: originalSignal, method: 'POST', headers }));
  assert.equal(outside.calls[0].options.signal, originalSignal, 'Outside a request, fetch retains the original caller signal');
  assert.equal(outside.calls[0].options.method, 'POST');
  assert.equal(outside.calls[0].options.headers, headers);
  await outside.clock.settle(outside.helper.top5Fetch(providerUrl(SECRET_A)));
  assert.ok(!('signal' in outside.calls[1].options), 'Outside a request, fetch must not add a request signal');
  assert.equal(outside.logs.length, 0);
  assert.equal(outside.clock.pendingTimers(), 0);

  const success = createHarness(2000);
  const successful = success.helper.profileTop5Request(async () => {
    await success.helper.top5Fetch(providerUrl(SECRET_A));
    const response = await success.helper.top5Fetch(providerUrl(SECRET_B));
    await response.json();
    success.helper.top5Count('fixture-complete');
    return 'complete';
  }, { fixture: 'successful-request' });
  assert.equal(await success.clock.settle(successful), 'complete');
  assert.equal(success.clock.now(), 4000);
  assert.equal(success.clock.pendingTimers(), 0, 'Successful requests clear their deadline timer');
  const successRows = timingRows(success);
  assert.equal(successRows.filter(row => row.event === 'request').length, 1);
  const summary = successRows.find(row => row.event === 'summary');
  assert.equal(summary.counts.providerCalls, 2);
  assert.equal(summary.counts.duplicateProviderCalls, 1, 'Provider keys cannot change the duplicate-request hash');
  assert.equal(summary.counts['fixture-complete'], 1);
  assert.equal(summary.phases['network:/stable/batch-quote'], 4000, 'Provider timings remain aggregated even when individual logs are condensed');
  assertPrivateLogs(success);
  success.clock.elapseWithoutTimers(budget);
  assert.ok(success.calls.every(call => !call.options.signal.aborted), 'Cleared timers cannot abort a completed request later');

  const deadline = createHarness(120000);
  const expired = deadline.helper.profileTop5Request(() => deadline.helper.top5WithinBudget(() => deadline.helper.top5Fetch(providerUrl(SECRET_A))));
  let deadlineError;
  await assert.rejects(deadline.clock.settle(expired), error => {
    deadlineError = error;
    return error instanceof deadline.helper.Top5DeadlineError && deadline.helper.isTop5Deadline(error);
  });
  assert.equal(deadlineError.name, 'Top5DeadlineError');
  assert.equal(deadlineError.code, 'TOP5_TIMEOUT');
  assert.equal(deadline.clock.now(), budget);
  assert.equal(deadline.calls.length, 1);
  assert.equal(deadline.calls[0].abortedAt, budget, 'The request deadline must abort actual provider work');
  assert.equal(deadline.calls[0].abortReason, deadlineError);
  assert.equal(deadline.calls[0].completed, false);
  assert.equal(deadline.clock.pendingTimers(), 0, 'Aborted fetch and request timers must be cleaned up');
  assert.equal(timingRows(deadline).find(row => row.event === 'summary').elapsedMs, budget);
  assert.ok(timingRows(deadline).some(row => row.event === 'end' && row.status === 'error'));
  assertPrivateLogs(deadline);

  const perCall = createHarness(120000);
  const perCallController = new AbortController();
  const perCallError = new Error('Fixture per-call timeout');
  perCall.clock.setTimeout(() => perCallController.abort(perCallError), 6500);
  const callExpired = perCall.helper.profileTop5Request(() => perCall.helper.top5WithinBudget(() => perCall.helper.top5Fetch(providerUrl(SECRET_A), { signal: perCallController.signal })));
  await assert.rejects(perCall.clock.settle(callExpired), error => error === perCallError);
  assert.equal(perCall.clock.now(), 6500, 'The original per-call timeout still applies inside the request budget');
  assert.equal(perCall.helper.isTop5Deadline(perCallError), false);
  assert.notEqual(perCall.calls[0].options.signal, perCallController.signal, 'The fetch combines both caller and request signals');
  assert.equal(perCall.calls[0].abortReason, perCallError);
  assert.equal(perCall.clock.pendingTimers(), 0);
  assertPrivateLogs(perCall);

  const preAborted = createHarness(120000);
  const preAbortedController = new AbortController();
  preAbortedController.abort(perCallError);
  await assert.rejects(preAborted.clock.settle(preAborted.helper.profileTop5Request(() => preAborted.helper.top5Fetch(providerUrl(SECRET_A), { signal: preAbortedController.signal }))), error => error === perCallError);
  assert.equal(preAborted.clock.now(), 0, 'An already-aborted caller signal prevents a delayed provider response');
  assert.equal(preAborted.calls[0].completed, false);
  assert.equal(preAborted.clock.pendingTimers(), 0);

  const blockedClock = createHarness();
  let dispatched = false;
  const blocked = blockedClock.helper.profileTop5Request(async () => {
    // Simulate CPU work that prevents the deadline timer from firing on time.
    blockedClock.clock.elapseWithoutTimers(budget + 1);
    let error;
    assert.throws(() => blockedClock.helper.assertTop5Active(), caught => {
      error = caught;
      return blockedClock.helper.isTop5Deadline(caught);
    });
    assert.throws(() => blockedClock.helper.top5Fetch(providerUrl(SECRET_A)), caught => caught === error);
    await assert.rejects(blockedClock.helper.top5WithinBudget(() => { dispatched = true; }), caught => caught === error);
    throw error;
  });
  await assert.rejects(blockedClock.clock.settle(blocked), error => blockedClock.helper.isTop5Deadline(error));
  assert.equal(dispatched, false, 'Expired work cannot dispatch another task');
  assert.equal(blockedClock.calls.length, 0, 'Elapsed-clock checks prevent a new fetch even when the timer has not fired');
  assert.equal(blockedClock.clock.pendingTimers(), 0);

  const waiting = createHarness();
  const pending = waiting.helper.profileTop5Request(() => waiting.helper.top5WithinBudget(() => new Promise(() => {})));
  await assert.rejects(waiting.clock.settle(pending), error => waiting.helper.isTop5Deadline(error));
  assert.equal(waiting.clock.now(), budget, 'The deadline also bounds waits whose underlying task does not support abort');
  assert.equal(waiting.clock.pendingTimers(), 0);

  const isolated = createHarness(url => new URL(url).searchParams.get('symbols') === 'SLOW' ? 120000 : budget - 5000);
  const first = isolated.helper.profileTop5Request(() => isolated.helper.top5WithinBudget(() => isolated.helper.top5Fetch(providerUrl(SECRET_A).replace('TEST', 'SLOW'))));
  const second = new Promise((resolve, reject) => {
    isolated.clock.setTimeout(() => {
      isolated.helper.profileTop5Request(() => isolated.helper.top5WithinBudget(() => isolated.helper.top5Fetch(providerUrl(SECRET_B))))
        .then(resolve, reject);
    }, 10000);
  });
  const outcomes = await isolated.clock.settle(Promise.allSettled([first, second]));
  assert.equal(outcomes[0].status, 'rejected');
  assert.ok(isolated.helper.isTop5Deadline(outcomes[0].reason));
  assert.equal(outcomes[1].status, 'fulfilled', 'One request deadline cannot abort another request that still has budget');
  assert.equal(isolated.calls[0].abortedAt, budget);
  assert.equal(isolated.calls[1].completedAt, budget + 5000);
  assert.equal(isolated.calls[1].options.signal.aborted, false);
  assert.equal(isolated.clock.pendingTimers(), 0);
  assertPrivateLogs(isolated);

  await moduleDeadlineCases(budget);
  await discoveryReuseCases();
  console.log('TOP5 DEADLINE REGRESSION PASS: real request context enforces its budget, preserves caller timeouts and private logs; actual event/fundamental/ledger modules stop late work and retain write locking; no-refresh discovery reuse stays bounded.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
