const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const { restore, blob } = require('./c1-opening-recovery-deadline-seams.cjs');

const fixtureBytes = readFileSync('tools/fixtures/c1-opening-recovery-deadline-source-seams.json');
assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), 'b1dd9daae1c00248f9cfb8eca5d256a1e763d804d727ca38f6c22f26cced9f76');
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.baselineCommit, 'f375986f006a59d6dd9fc15ed7b49268731b5099');
const file = 'lib/c1OpeningReviewRead.js';
const current = readFileSync(file, 'utf8');
const prior = restore(file, current);
assert.equal(blob(current), fixture.files[file].afterHash);
assert.equal(blob(prior), fixture.files[file].beforeHash);
assert.equal(restore(file, prior), prior);
const unreviewed = current + '\n// unreviewed\n';
assert.equal(restore(file, unreviewed), unreviewed);

const flush = () => new Promise(resolve => setImmediate(resolve));
const timeout = error => error.code === 'ACCOUNT_RESPONSE_TIMEOUT' && error.stage === 'opening-review';
const view = { decision: { contract:'c1-account-decision-v1', decisionId:'synthetic', revision:1, positions:[] } };
const response = (json = async () => view) => ({ ok:true, status:200, headers:new Headers(), json });

function harness(fetcher, isCurrent = () => true) {
  let now = 0;
  let id = 0;
  const timers = new Map(), methods = [];
  const clock = {
    now: () => now,
    setTimeout(callback, delay) {
      timers.set(++id, { at:now + delay, callback });
      return id;
    },
    clearTimeout(key) { timers.delete(key); },
    async advance(to) {
      await flush();
      for (;;) {
        const next = [...timers].filter(([, entry]) => entry.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [key, { at, callback }] = next;
        now = Math.max(now, at);
        timers.delete(key);
        callback();
        await flush();
      }
      now = to;
      await flush();
    },
    elapseWithoutTimers(to) { now = to; },
  };
  const original = Object.getOwnPropertyDescriptor(global, 'performance');
  const { setTimeout, clearTimeout } = global;
  Object.defineProperty(global, 'performance', {configurable:true, value:clock});
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  let read;
  try {
    read = createResearchModuleLoader(process.cwd()).load(file).readC1OpeningReview;
  } finally {
    Object.defineProperty(global, 'performance', original);
    global.setTimeout = setTimeout;
    global.clearTimeout = clearTimeout;
  }
  const at = (time, action) => new Promise((resolve, reject) => {
    clock.setTimeout(() => {
      try { resolve(action()); } catch (error) { reject(error); }
    }, time - now);
  });
  const review = read('fictional', isCurrent, (url, options) => {
    methods.push([options.method, url, options.body]);
    return fetcher(options.method, at, methods.length);
  });
  const settled = review.then(value => ({value}), error => ({error}));
  return { clock, methods, settled };
}

async function main() {
  const lost = () => { throw new TypeError('Interrupted'); };
  const recovering = harness((method, at) => method === 'POST'
    ? at(56500, lost)
    : at(100000, () => response(() => at(114200, () => view))));
  let result;
  recovering.settled.then(value => { result = value; });
  await recovering.clock.advance(90000);
  assert.equal(result, undefined, 'Recovery survives the original deadline.');
  await recovering.clock.advance(114200);
  assert.equal(result.value.execution.decision.revision, 1);
  assert.deepEqual(recovering.methods.map(([method]) => method), ['POST', 'GET']);
  assert.deepEqual(recovering.methods[1], ['GET', '/api/c1-account?review=opening', undefined]);

  const stuck = () => new Promise(() => {});
  const noPostRetry = harness(stuck);
  await noPostRetry.clock.advance(90000);
  assert(timeout((await noPostRetry.settled).error));
  assert.equal(noPostRetry.methods.length, 1);

  const lateBody = harness((method, at) => method === 'POST'
    ? at(56500, lost)
    : response(() => at(150000, () => view)));
  await lateBody.clock.advance(146499);
  let pending = true;
  lateBody.settled.then(() => { pending = false; });
  await flush();
  assert.equal(pending, true);
  await lateBody.clock.advance(146500);
  assert(timeout((await lateBody.settled).error));
  await lateBody.clock.advance(150000);
  assert.equal(lateBody.methods.length, 2);

  const scan = {sourceIdentity:'synthetic source', total:2, complete:false, completed:1};
  const ordinaryScan = harness((method, at) => method === 'POST'
    ? response(async () => ({decision:{...view.decision, scan}}))
    : at(100000, () => response()));
  await ordinaryScan.clock.advance(90000);
  assert(timeout((await ordinaryScan.settled).error));
  assert.deepEqual(ordinaryScan.methods.map(([method]) => method), ['POST', 'GET']);

  let interrupt;
  const throttled = harness(() => new Promise((_, reject) => { interrupt = reject; }));
  throttled.clock.elapseWithoutTimers(91000);
  interrupt(new TypeError('Interrupted before delayed timeout callback'));
  assert(timeout((await throttled.settled).error));
  assert.equal(throttled.methods.length, 1);

  let owner = true;
  const superseded = harness((_, at) => at(56500, lost), () => owner);
  owner = false;
  await superseded.clock.advance(56500);
  assert.equal((await superseded.settled).error?.name, 'TypeError');
  assert.equal(superseded.methods.length, 1);
  console.log('PASS: interrupted opening recovery has one bounded interval, with no POST replay or ordinary-scan deadline change.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
