const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

const repo = path.resolve(__dirname, '..');
const baselineRelative = 'tools/fixtures/top5-market-session-before-reuse.js';
const actualRelative = 'lib/marketSession.js';
const fixture = fs.readFileSync(path.join(repo, baselineRelative));
const expectedFixtureBlob = '0ac3b15820a31d8587751859755d2b01eff1802e';
const actualFixtureBlob = crypto.createHash('sha1')
  .update(Buffer.from(`blob ${fixture.length}\0`)).update(fixture).digest('hex');
assert.equal(actualFixtureBlob, expectedFixtureBlob,
  'Calendar baseline must remain the exact marketSession.js Git blob from deployed ffdd79b');
const actualSourceSha256 = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(repo, actualRelative))).digest('hex');

// Freeze only this offline process's default Date construction. Both source
// modules receive the same clock; explicit values retain native Date parsing.
const NativeDate = Date;
const frozenNow = '2026-10-09T18:00:00.000Z';
class ProofDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [frozenNow])); }
  static now() { return NativeDate.parse(frozenNow); }
}
let baseline, variant;
try {
  global.Date = ProofDate;
  const loader = createResearchModuleLoader(repo);
  baseline = loader.load(baselineRelative);
  variant = loader.load(actualRelative);
} finally {
  global.Date = NativeDate;
}
assert.deepEqual(Object.keys(variant), Object.keys(baseline));

const counts = Object.fromEntries(Object.keys(baseline).map(name => [name, 0]));
const datesTested = new Set();
let comparisons = 0;
let throwsCompared = 0;
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, clean(part)]));
  return value;
};
const outcome = (fn, args) => {
  try { return { returned: clean(fn(...args)) }; }
  catch (error) { return { thrown: { name: error.name, message: error.message } }; }
};
function compare(name, args, label) {
  const expected = outcome(baseline[name], args);
  const actual = outcome(variant[name], args);
  assert.deepStrictEqual(actual, expected, `${name}: ${label}`);
  comparisons++;
  counts[name]++;
  if (expected.thrown) throwsCompared++;
  // Old code creates many native Intl objects. Collect during this exhaustive
  // comparison so baseline allocation cannot obscure the CPU repair evidence.
  if (global.gc && comparisons % 500 === 0) global.gc();
  return expected.returned;
}
const keyOf = timestamp => new NativeDate(timestamp).toISOString().slice(0, 10);
const nextDay = key => keyOf(NativeDate.parse(`${key}T12:00:00Z`) + 86400000);
const addDays = (key, amount) => keyOf(NativeDate.parse(`${key}T12:00:00Z`) + amount * 86400000);

// Every date in nine years covers weekday, holiday, leap-year and early-close
// combinations. The later cross-decade sequence exercises cache eviction.
for (let key = '2020-01-01'; key <= '2028-12-31'; key = nextDay(key)) {
  datesTested.add(key);
  for (const name of ['isUsMarketSessionDay', 'marketSessionCloseMinutes', 'previousMarketSessionDay']) compare(name, [key], key);
}
for (const year of [...Array.from({length:34}, (_, index) => 1990 + index), 1990, 2040, 2000, 2026, 1990, 2039, 2010, 2022, 2001, 2030, 1999, 2021, 2005, 2035, 1990]) {
  for (const suffix of ['01-01', '06-19', '07-03', '12-24', '12-31']) {
    const key = `${year}-${suffix}`;
    datesTested.add(key);
    for (const name of ['isUsMarketSessionDay', 'marketSessionCloseMinutes', 'previousMarketSessionDay']) compare(name, [key], `FIFO revisit ${key}`);
  }
}

// Compare every time-sensitive helper weekly for nine years, spanning
// pre-/post-Juneteenth calendars, leap years, weekends, DST and trading dates.
const timeNames = ['easternMarketClock', 'marketObservationSessionDay', 'marketExecutionState', 'latestCompletedMarketSessionDay', 'marketSessionProgress'];
let weeklyInstants = 0;
for (let key = '2020-01-01'; key <= '2028-12-31'; key = addDays(key, 7)) {
  const instant = `${key}T15:00:00.123Z`;
  weeklyInstants++;
  for (const name of timeNames) compare(name, [instant], `weekly clock ${instant}`);
  compare('pacedRelativeVolume', [{ volume: 123456, avgVolume: 234567 }, instant], instant);
  compare('projectedFullDayVolume', [{ volume: 123456 }, instant], instant);
}

const expectedDateRules = [
  ['2021-12-31', true, 960], ['2022-01-03', true, 960],
  ['2021-06-18', true, 960], ['2022-06-20', false, 960], ['2023-06-19', false, 960],
  ['2026-04-03', false, 960], ['2021-07-05', false, 960],
  ['2021-12-24', false, 960], ['2022-12-26', false, 960],
  ['2025-07-03', true, 780], ['2026-07-03', false, 960],
  ['2026-11-27', true, 780], ['2026-12-24', true, 780],
];
for (const [key, session, close] of expectedDateRules) {
  assert.equal(compare('isUsMarketSessionDay', [key], `known holiday ${key}`), session);
  assert.equal(compare('marketSessionCloseMinutes', [key], `known close ${key}`), close);
}

const specialDays = [
  '2021-06-18', '2022-06-20', '2023-06-19', '2021-12-31',
  '2026-04-03', '2025-07-03', '2026-07-03', '2026-11-27', '2026-12-24',
  '2024-03-08', '2024-03-10', '2024-03-11', '2024-11-01', '2024-11-03', '2024-11-04',
  '2026-03-06', '2026-03-08', '2026-03-09', '2026-10-30', '2026-11-01', '2026-11-02',
  '2024-02-29', '2026-08-28', '2026-08-29', '2026-08-31',
];
const utcTimes = ['00:00:00.000', '03:59:59.999', '04:00:00.000', '05:00:00.000',
  '06:59:59.999', '07:00:00.000', '12:00:00.000', '13:29:59.999', '13:30:00.000',
  '14:29:59.999', '14:30:00.000', '16:59:59.999', '17:00:00.000', '17:59:59.999',
  '18:00:00.000', '19:59:59.999', '20:00:00.000', '20:59:59.999', '21:00:00.000', '23:59:59.999'];
let boundaryInstants = 0;
for (const key of specialDays) {
  datesTested.add(key);
  for (const time of utcTimes) {
    const instant = `${key}T${time}Z`;
    boundaryInstants++;
    for (const name of timeNames) compare(name, [instant], `boundary ${instant}`);
    compare('pacedRelativeVolume', [{ vol: 123456, averageVolume: 234567 }, instant], instant);
    compare('projectedFullDayVolume', [{ vol: 123456 }, instant], instant);
  }
}
for (const offsetInstant of ['2026-03-09T09:29:59-04:00', '2026-03-09T09:30:00-04:00',
  '2026-11-02T09:29:59-05:00', '2026-11-02T09:30:00-05:00',
  '2026-11-27T12:59:59-05:00', '2026-11-27T13:00:00-05:00',
  '2026-08-31T15:59:59-04:00', '2026-08-31T16:00:00-04:00']) {
  for (const name of timeNames) compare(name, [offsetInstant], `explicit ET boundary ${offsetInstant}`);
}

const invalidAndLegacyDates = [undefined, null, '', 'invalid', '2026-02-30', '2024-02-30',
  '2026-13-01', '2026-00-01', '2026-01-00', '2026-99-99', '2026-1-1', '0000-01-01',
  '0099-12-31', '0100-01-01', '9999-12-31', '2026-08-28', '2026-08-29T03:43:56.651Z',
  0, -1, 1, NaN, Infinity, -Infinity, true, false, new NativeDate(NaN),
  new NativeDate('2024-02-29T20:00:00Z'), -8640000000000000, 8640000000000000,
  8640000000000001, 1n, Symbol('invalid-date')];
for (const [index, value] of invalidAndLegacyDates.entries()) {
  for (const name of [...timeNames, 'isUsMarketSessionDay', 'marketSessionCloseMinutes', 'previousMarketSessionDay']) {
    compare(name, [value], `invalid/legacy input ${index}`);
  }
  compare('pacedRelativeVolume', [{ volume: 10, avgVolume: 20 }, value], `invalid clock ${index}`);
  compare('projectedFullDayVolume', [{ volume: 10 }, value], `invalid clock ${index}`);
}

const distancePairs = [
  ['2026-08-28', '2026-08-31'], ['2026-11-25', '2026-11-27'],
  ['2021-12-30', '2022-01-04'], ['2021-06-17', '2021-06-21'], ['2022-06-17', '2022-06-21'],
  ['2024-02-28', '2024-03-01'], ['2026-02-30', '2026-02-30'], ['2026-02-30', '2026-03-03'],
  ['2026-99-99', '2027-01-01'], ['0000-01-01', '0000-01-02'], ['0099-12-31', '0100-01-01'],
  ['2026-08-31', '2026-08-28'], ['', '2026-08-31'], [null, undefined], [0, 0],
];
for (const first of ['1990-01-01', '2000-01-01', '2011-06-19', '2020-02-29', '2026-08-28']) {
  for (const offset of [0, 1, 2, 3, 10, 365, 3999, 4000, 4001]) {
    const second = addDays(first, offset);
    distancePairs.push([first, second], [second, first]);
  }
}
for (const first of invalidAndLegacyDates) {
  distancePairs.push([first, first], [first, '2026-08-31'], ['2026-08-28', first]);
}
for (const [index, args] of distancePairs.entries()) compare('marketSessionDistance', args, `distance pair ${index}`);
assert.equal(compare('marketSessionDistance', ['2000-01-01', '2010-12-14'], 'exact 4000-day bound'), 2761);
assert.equal(compare('marketSessionDistance', ['2000-01-01', '2010-12-15'], 'beyond 4000-day bound'), null);

const progressInputs = [null, undefined, NaN, -Infinity, Infinity, -1, -0, 0, .0001, .01, .25, .5, .9999, 1, 2, '', '0.5', 'invalid', true, false, 1n, Symbol('invalid-progress')];
for (const [index, value] of progressInputs.entries()) compare('expectedVolumeFraction', [value], `progress input ${index}`);
const stockInputs = [undefined, null, {}, { volume: 0, avgVolume: 20 }, { volume: -1, avgVolume: 20 },
  { volume: NaN, avgVolume: 20 }, { volume: Infinity, avgVolume: 20 }, { volume: 10, avgVolume: 0 },
  { volume: 10, avgVolume: NaN }, { volume: null, vol: 10, avgVolume: null, averageVolume: 20 },
  { vol: '10', avgVolume30Day: '20' }, { volume: 'invalid', avgVolume: 20 },
  { volume: -0, avgVolume: 20 }, { volume: 1n, avgVolume: 2n }, { volume: Symbol('invalid-volume'), avgVolume: 20 }];
for (const [index, stock] of stockInputs.entries()) {
  for (const instant of [undefined, '2026-08-31T12:00:00Z', '2026-08-31T13:30:00Z', '2026-08-31T17:00:00Z',
    '2026-08-31T20:00:00Z', '2026-08-29T15:00:00Z', '2026-11-27T18:00:00Z', 'invalid']) {
    compare('pacedRelativeVolume', [stock, instant], `volume input ${index}`);
    compare('projectedFullDayVolume', [stock, instant], `volume input ${index}`);
  }
}
for (const name of Object.keys(baseline)) compare(name, [], 'default arguments');

// A lazy formatter must keep construction and formatting failures inside the
// existing null fallback, and allow a later call to recover after construction
// failed. Load independent cold modules with equivalent offline Intl faults.
const NativeIntl = Intl;
const ordinaryModules = [baseline, variant];
let formatterFailureComparisons = 0;
function loadWithIntlFault(relative, mode) {
  let constructions = 0, formats = 0;
  const injectedIntl = {
    DateTimeFormat: function (...args) {
      constructions++;
      if (mode === 'always-construction' || (mode === 'first-construction' && constructions === 1)) {
        throw new Error('Offline formatter construction fault');
      }
      const formatter = new NativeIntl.DateTimeFormat(...args);
      return { formatToParts(value) {
        formats++;
        if (mode === 'first-format' && formats === 1) throw new Error('Offline formatter format fault');
        return formatter.formatToParts(value);
      } };
    },
  };
  try {
    global.Intl = injectedIntl;
    return createResearchModuleLoader(repo).load(relative);
  } finally {
    global.Intl = NativeIntl;
  }
}
for (const mode of ['first-construction', 'always-construction', 'first-format']) {
  baseline = loadWithIntlFault(baselineRelative, mode);
  variant = loadWithIntlFault(actualRelative, mode);
  for (const value of ['2026-08-31T13:30:00Z', '2026-08-31T20:00:00Z', new NativeDate(NaN), '2026-11-27T18:00:00Z']) {
    compare('easternMarketClock', [value], `cold formatter ${mode}`);
    formatterFailureComparisons++;
  }
}
[baseline, variant] = ordinaryModules;
for (const [name, count] of Object.entries(counts)) assert.ok(count > 0, `Export not compared: ${name}`);

const summary = {
  result: 'PASS',
  comparison: 'Deep strict exact parity of returned values and exception name/message; NaN, undefined and negative zero retained',
  baselineGitBlob: actualFixtureBlob,
  baselineCommit: 'ffdd79b',
  actualSourceSha256,
  exportsCompared: Object.keys(baseline).length,
  exactComparisons: comparisons,
  exceptionComparisons: throwsCompared,
  uniqueCalendarDates: datesTested.size,
  exhaustiveDateRange: ['2020-01-01', '2028-12-31'],
  fifoRevisitDateRange: ['1990-01-01', '2040-12-31'],
  weeklyInstants,
  weeklyInstantDateRange: ['2020-01-01', '2028-12-31'],
  targetedBoundaryInstants: boundaryInstants,
  distancePairs: distancePairs.length + 2,
  formatterFailureComparisons,
  defaultArgumentClock: frozenNow,
  perExport: counts,
};
console.log('MARKET SESSION REUSE PASS: ' + JSON.stringify(summary));
