'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSignalDataset, economicSignalProjection, nyClose } = require('./signals.cjs');
const { createResearchModuleLoader } = require('../../tools/research-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { compilePointInTimeSignals } = createResearchModuleLoader(root).load('lib/historicalSignalEvaluator.js');
const plain = value => JSON.parse(JSON.stringify(value));
const symbols = ['AAA', 'AAB', 'BRK.B', 'LEN', 'WDC', 'SPY', 'QQQ'];
const dates = [];
for (let date = Date.parse('2023-12-29T12:00:00Z'); dates.length < 258; date += 86400000) {
  const day = new Date(date); if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10));
}
const baseline = dates[252];
function fixture() {
  const barsBySymbol = Object.fromEntries(symbols.map((symbol, si) => [symbol, dates.map((date, i) => {
    const close = 60 + si * 8 + i * (si % 2 ? .15 : .23) + Math.sin(i / 8 + si) * 1.4;
    return { date, open: close * .999, high: close * 1.008, low: close * .991, close, volume: 9e6 + si * 1e5, adjusted: true };
  })]));
  const metadata = { membership: [], identities: [], sectors: [] };
  for (const [i, symbol] of symbols.filter(s => !['SPY', 'QQQ'].includes(s)).entries()) {
    const fact = { security_id: 'line:' + symbol, valid_from: baseline, valid_to: dates.at(-1), known_at: dates[250] + 'T00:00:00Z' };
    metadata.membership.push({ ...fact });
    metadata.identities.push({ ...fact, ticker: symbol, issuer_id: i < 2 ? '0000000001' : String(i + 1).padStart(10, '0'), share_class: 'class:' + symbol });
    metadata.sectors.push({ ...fact, gics_sector: i % 2 ? 'Industrials' : 'Information Technology' });
  }
  return { barsBySymbol, metadata, sessionDates: dates, baselineDate: baseline, allowApproximateMetadata: true };
}
const input = fixture();
const primary = buildSignalDataset(input);
assert.equal(primary.dataset.sessions.length, 6);
assert(primary.dataset.sessions.every(s => s.positionSignals.length === 3));
assert(primary.dataset.sessions.every(s => !s.universeSymbols.includes('LEN') && !s.universeSymbols.includes('WDC')));
assert.equal(primary.audit.warmupRows, 252);
assert.equal(primary.dataset.metadata.minimumSignalHistoryRows, 253);
assert.equal(primary.dataset.metadata.pointInTime, false);
assert.equal(primary.dataset.metadata.exactHistoricalReplication, false);
assert.equal(primary.dataset.sessions[0].positionSignals.find(s => s.symbol === 'AAA').cik, '0000000001');
assert.equal(primary.dataset.sessions[0].positionSignals.find(s => s.symbol === 'AAB').cik, '0000000001');
assert(primary.dataset.sessions[0].positionSignals.some(s => s.symbol === 'BRK.B'));
assert.equal(primary.dataset.sessions[0].signals.length, 0, 'Missing fundamentals may empty display shortlist; full position pool must survive.');

// Exact original compiler invocation with constant profiles and the same daily
// wrapper configuration must reproduce every serialized session, not just ranks.
for (let index = 252; index < dates.length; index++) {
  const current = dates[index];
  const securities = ['AAA', 'AAB', 'BRK.B'].map(symbol => {
    const identity = input.metadata.identities.find(row => row.ticker === symbol);
    const sector = input.metadata.sectors.find(row => row.security_id === identity.security_id).gics_sector;
    return { ...identity, symbol, ticker: symbol, securityId: identity.security_id, cik: identity.issuer_id, name: symbol, companyName: symbol, sector, primaryTheme: sector, listedAt: dates[0], isEtf: false, isFund: false };
  });
  const raw = { securities, fundamentals: [], events: [], sessions: dates.map((date, j) => ({ date, decisionAt: nyClose(date), universeSymbols: j === index ? securities.map(s => s.symbol).sort() : [], prices: j <= index ? symbols.map(symbol => ({ ...input.barsBySymbol[symbol][j], symbol })) : [] })) };
  const expected = compilePointInTimeSignals(raw, { minimumHistoryRows: 253, liquidity: { maxCandidates: 500 }, maxSessions: 1, resume: { sessions: [], completedSessions: index, decisionMemory: [] } });
  const { researchHConsecutiveSymbols, ...sourceSession } = primary.dataset.sessions[index - 252];
  assert.deepEqual(plain(researchHConsecutiveSymbols), ['AAA', 'AAB', 'BRK.B']);
  assert.deepEqual(plain(sourceSession), plain(expected.sessions[0]), 'Constant-sector daily adapter must match exact source invocation.');
}

const future = fixture();
for (const rows of Object.values(future.barsBySymbol)) for (const bar of rows.slice(255)) for (const key of ['open', 'high', 'low', 'close']) bar[key] *= 4;
const mutated = buildSignalDataset(future);
assert.deepEqual(plain(mutated.dataset.sessions.slice(0, 3)), plain(primary.dataset.sessions.slice(0, 3)), 'Future bars must not change prior decisions.');

const stress = buildSignalDataset({ ...fixture(), includeExcludedInFactors: true });
assert(stress.dataset.sessions.every(s => s.positionSignals.length === 5));
assert.deepEqual(stress.dataset.metadata.researchAllocationExcludedSymbols, ['LEN', 'WDC']);
assert(stress.audit.daily.every(row => row.excludedSymbols.length === 2));
assert.notDeepEqual(economicSignalProjection(stress.dataset.sessions[0]).map(s => [s.symbol, s.researchFactors.momentumPercentile]), economicSignalProjection(primary.dataset.sessions[0]).map(s => [s.symbol, s.researchFactors.momentumPercentile]));

const transitionInput = fixture();
const sectorRow = transitionInput.metadata.sectors.find(row => row.security_id === 'line:AAB');
sectorRow.valid_to = dates[254];
transitionInput.metadata.sectors.push({ ...sectorRow, valid_from: dates[255], valid_to: dates.at(-1), known_at: dates[254] + 'T00:00:00Z', gics_sector: 'Information Technology' });
const transitioned = buildSignalDataset(transitionInput);
assert.deepEqual(plain(transitioned.dataset.sessions.slice(0, 3)), plain(primary.dataset.sessions.slice(0, 3)), 'Later sector transition cannot change earlier ranks.');
assert.equal(transitioned.dataset.sessions[3].positionSignals.find(s => s.symbol === 'AAB').sector, 'Information Technology');
assert.notDeepEqual(economicSignalProjection(transitioned.dataset.sessions[3]), economicSignalProjection(primary.dataset.sessions[3]), 'Current dated sector must affect current source factors.');

const nominal = fixture();
nominal.executionBarsBySymbol = Object.fromEntries(Object.entries(nominal.barsBySymbol).map(([symbol, bars]) => [symbol, bars.map(bar => ({ ...bar, open: bar.open * 2, high: bar.high * 2, low: bar.low * 2, close: bar.close * 2 }))]));
nominal.splitOnlyBarsBySymbol = plain(nominal.executionBarsBySymbol);
const rebased = buildSignalDataset({ ...nominal, rebaseToNominal: true, volumeContract: 'synthetic-provider-volume-unchanged' });
for (let i = 0; i < primary.dataset.sessions.length; i++) {
  const original = primary.dataset.sessions[i], revised = rebased.dataset.sessions[i];
  for (const row of original.positionSignals) {
    const adjusted = revised.positionSignals.find(s => s.symbol === row.symbol);
    assert.equal(adjusted.price, row.price * 2);
    assert.equal(adjusted.avgVolume, row.avgVolume, 'No invented volume adjustment.');
    assert.deepEqual(plain(adjusted.researchFactors), plain(row.researchFactors), 'Uniform causal rebasing must preserve source factors.');
    assert.equal(adjusted.price, revised.prices.find(bar => bar.symbol === row.symbol).close);
  }
}

const futureScaled = fixture();
for (const rows of Object.values(futureScaled.barsBySymbol)) for (const bar of rows) for (const key of ['open', 'high', 'low', 'close']) bar[key] *= .3;
futureScaled.executionBarsBySymbol = nominal.executionBarsBySymbol;
futureScaled.splitOnlyBarsBySymbol = nominal.splitOnlyBarsBySymbol;
const correctedVintage = buildSignalDataset({ ...futureScaled, rebaseToNominal: true });
for (let i = 0; i < rebased.dataset.sessions.length; i++) for (const row of rebased.dataset.sessions[i].positionSignals) {
  const revised = correctedVintage.dataset.sessions[i].positionSignals.find(s => s.symbol === row.symbol);
  assert(Math.abs(row.price - revised.price) < 1e-9);
  assert(Math.abs(row.return120Ex20 - revised.return120Ex20) < 1e-10, 'Uniform future-action adjustment cancels at the dated nominal rebase.');
}


// A future 15-for-1 split changes current-vintage volume, whereas a cash
// dividend changes adjusted OHLC only. They require independent unit factors.
function manufacturedVintage(futureSplitFactor) {
  const f = fixture();
  f.executionBarsBySymbol = plain(f.barsBySymbol);
  f.splitOnlyBarsBySymbol = plain(f.barsBySymbol);
  for (const symbol of symbols) for (let i = 0; i < dates.length; i++) {
    const signal = f.barsBySymbol[symbol][i], split = f.splitOnlyBarsBySymbol[symbol][i];
    const cashDividendFactor = symbol === 'AAA' && i < 255 ? .98 : 1;
    for (const key of ['open', 'high', 'low', 'close']) {
      signal[key] *= cashDividendFactor / futureSplitFactor;
      split[key] /= futureSplitFactor;
    }
    signal.volume *= futureSplitFactor;
    split.volume *= futureSplitFactor;
  }
  return { ...f, rebaseToNominal: true, unitContract: { nominalPricesVerified: true, volumeUnitsVerified: true }, volumeContract: 'manufactured-divadj-and-split-only-share-volumes' };
}
const noFutureSplit = buildSignalDataset(manufacturedVintage(1));
const futureFifteenSplit = buildSignalDataset(manufacturedVintage(15));
assert.equal(futureFifteenSplit.dataset.metadata.volumeUnitsVerified, true);
assert.equal(futureFifteenSplit.audit.volumeRebased, true);
for (let i = 0; i < noFutureSplit.dataset.sessions.length; i++) for (const a of noFutureSplit.dataset.sessions[i].positionSignals) {
  const b = futureFifteenSplit.dataset.sessions[i].positionSignals.find(row => row.symbol === a.symbol);
  for (const field of ['price', 'avgVolume']) assert(Math.abs(a[field] - b[field]) < 1e-6, 'Future split cannot alter nominal price/volume gates.');
  assert(Math.abs(a.entryTiming.averageDollarVolume20 - b.entryTiming.averageDollarVolume20) < 1e-5, 'Future split cannot inflate ADV.');
  assert.equal(a.researchFactors.momentumPercentile, b.researchFactors.momentumPercentile);
  assert(Math.abs(a.return120Ex20 - b.return120Ex20) < 1e-10);
}
const preDividend = futureFifteenSplit.dataset.sessions[0].positionSignals.find(row => row.symbol === 'AAA');
assert.equal(preDividend.avgVolume, fixture().barsBySymbol.AAA[0].volume, 'Cash dividend price adjustment must not deflate share volume.');
const noSplitView = manufacturedVintage(15); delete noSplitView.splitOnlyBarsBySymbol;
const unverifiedVolume = buildSignalDataset(noSplitView);
assert.equal(unverifiedVolume.dataset.metadata.volumeUnitsVerified, false, 'Price-only rebasing cannot verify share-volume units.');
assert(unverifiedVolume.dataset.sessions[0].positionSignals.find(row => row.symbol === 'AAA').avgVolume > preDividend.avgVolume * 14);
const mismatchedVolume = manufacturedVintage(15); mismatchedVolume.barsBySymbol.AAA[252].volume += 100;
assert.throws(() => buildSignalDataset(mismatchedVolume), /provider volume mismatch/);
const mismatchedNominal = manufacturedVintage(15); mismatchedNominal.executionBarsBySymbol.AAA[252].volume += 100;
assert.throws(() => buildSignalDataset(mismatchedNominal), /does not match nominal volume/);

// Use F_t uniformly over the prefix: a split already effective at t must remain
// reflected in earlier volume, while a split after t must be removed.
const withinPeriodSplit = fixture();
withinPeriodSplit.executionBarsBySymbol = plain(withinPeriodSplit.barsBySymbol);
withinPeriodSplit.splitOnlyBarsBySymbol = plain(withinPeriodSplit.barsBySymbol);
for (const symbol of symbols) for (let i = 0; i < dates.length; i++) {
  if (i < 254) {
    for (const key of ['open', 'high', 'low', 'close']) withinPeriodSplit.executionBarsBySymbol[symbol][i][key] *= 2;
    withinPeriodSplit.barsBySymbol[symbol][i].volume *= 2;
    withinPeriodSplit.splitOnlyBarsBySymbol[symbol][i].volume *= 2;
  }
}
const within = buildSignalDataset({ ...withinPeriodSplit, rebaseToNominal: true });
const earlier = within.dataset.sessions[0].positionSignals.find(row => row.symbol === 'AAA');
const afterSplit = within.dataset.sessions[2].positionSignals.find(row => row.symbol === 'AAA');
assert.equal(earlier.avgVolume, fixture().barsBySymbol.AAA[0].volume);
assert.equal(afterSplit.avgVolume, earlier.avgVolume * 2, 'Past effective split normalization must remain in prior volume at t.');

const short = fixture();
short.barsBySymbol.AAA = short.barsBySymbol.AAA.slice(1);
const shortResult = buildSignalDataset(short);
assert(!shortResult.dataset.sessions[0].positionSignals.some(s => s.symbol === 'AAA'));
assert(shortResult.dataset.sessions[1].positionSignals.some(s => s.symbol === 'AAA'));
assert(shortResult.audit.daily[0].insufficientHistorySymbols.includes('AAA'));
assert(!shortResult.audit.daily[1].insufficientHistorySymbols.includes('AAA'));

const futureIdentity = fixture(); futureIdentity.metadata.identities[0].known_at = dates[253] + 'T00:00:00Z';
assert.throws(() => buildSignalDataset(futureIdentity), /Information unavailable/);
const duplicateSector = fixture(); duplicateSector.metadata.sectors.push({ ...duplicateSector.metadata.sectors[0] });
assert.throws(() => buildSignalDataset(duplicateSector), /Sector interval missing\/ambiguous/);
const missingCik = fixture(); missingCik.metadata.identities[0].issuer_id = '';
assert.throws(() => buildSignalDataset(missingCik), /Issuer CIK missing/);
const missing = fixture(); missing.barsBySymbol.AAA.splice(252, 1);
assert.throws(() => buildSignalDataset(missing), /Eligible member has no decision bar/);
const interior = fixture(); interior.barsBySymbol.AAA.splice(100, 1);
assert.throws(() => buildSignalDataset(interior), /Available-life history contains a session gap/);
const wrongLine = fixture(); wrongLine.barsBySymbol.AAA[100].security_id = 'different-line';
assert.throws(() => buildSignalDataset(wrongLine), /Price history mixes research security lines/);
assert.throws(() => buildSignalDataset({ ...fixture(), allowApproximateMetadata: false }), /contract must be explicit/);

// Operational verification claims default closed and cannot be inferred from
// successful price parsing. Manufactured receipts below test only the interface.
for (const key of ['executionPricesVerified', 'volumeUnitsVerified', 'fullOpportunityUniverseVerified', 'researchAccountingCoverageComplete', 'researchMembershipActionsComplete']) assert.equal(primary.dataset.metadata[key], false);
assert.equal(primary.dataset.metadata.researchInputCoverageHash, '');
assert.equal(primary.dataset.metadata.researchDataContract, null);
const incompleteContract = buildSignalDataset({ ...fixture(), economicContract: { executionPricesVerified: true, researchAccountingCoverageComplete: true, researchMembershipActionsComplete: true } });
assert.equal(incompleteContract.dataset.metadata.executionPricesVerified, false, 'A flag without a nominal rebased execution view is insufficient.');
assert.equal(incompleteContract.dataset.metadata.researchAccountingCoverageComplete, false, 'An absent action manifest cannot certify accounting coverage.');
assert.equal(incompleteContract.dataset.metadata.researchMembershipActionsComplete, false);
const contract = { executionPricesVerified: true, volumeUnitsVerified: true, fullOpportunityUniverseVerified: true, researchAccountingCoverageComplete: true, researchMembershipActionsComplete: true, researchInputCoverageHash: 'a'.repeat(64), researchCoverageFrom: baseline, researchCoverageThrough: dates.at(-1), researchDataContract: 'manufactured-fixture-v1' };
const sourcedEmpty = { source: 'manufactured-evidence-only', actions: [] };
const declared = buildSignalDataset({ ...nominal, rebaseToNominal: true, economicContract: contract, accountingManifest: sourcedEmpty, membershipActionManifest: sourcedEmpty });
for (const key of ['executionPricesVerified', 'volumeUnitsVerified', 'fullOpportunityUniverseVerified', 'researchAccountingCoverageComplete', 'researchMembershipActionsComplete']) assert.equal(declared.dataset.metadata[key], true);
assert.equal(declared.dataset.metadata.researchDataContract, 'manufactured-fixture-v1');
assert.equal(declared.dataset.metadata.researchCoverageFrom, baseline);
assert.equal(declared.dataset.metadata.researchInputCoverageHash, 'a'.repeat(64));
const removedInput = fixture();
removedInput.metadata.membership[0].valid_to = dates[254];
const missingAction = buildSignalDataset(removedInput);
assert.equal(missingAction.audit.missingMembershipRemovalActions.length, 1);
assert.throws(() => buildSignalDataset({ ...removedInput, economicContract: contract, accountingManifest: sourcedEmpty, membershipActionManifest: sourcedEmpty }), /explicit native index-removal action/);
const removal = { id: 'manufactured-index-removal-AAA', source: 'manufactured-official-notice', verified: true, type: 'universe-removal', symbol: 'AAA', effectiveDate: dates[255], knownAt: dates[254] + 'T00:00:00Z' };
const removalManifest = { source: 'manufactured-index-action-manifest', actions: [removal] };
const removed = buildSignalDataset({ ...removedInput, economicContract: contract, accountingManifest: sourcedEmpty, membershipActionManifest: removalManifest });
assert.deepEqual(plain(removed.dataset.metadata.researchMembershipActions), [removal]);
assert.equal(removed.dataset.sessions[3].corporateActions[0].id, removal.id);
assert(!removed.dataset.sessions[3].universeSymbols.includes('AAA'));
assert(removed.dataset.sessions[3].prices.some(bar => bar.symbol === 'AAA'), 'The removed holding still has a sale/valuation price.');
assert(primary.dataset.sessions.every(session => session.corporateActions.length === 0), 'Ranking quarantine is not an index-removal event.');
const dividend = { id: 'manufactured-dividend', source: 'manufactured-source', verified: true, type: 'cash-dividend', symbol: 'AAA', effectiveDate: dates[253], amountPerShare: .5, paymentDate: dates[254], shareBasis: 'ex-date-post-split' };
const actionFixture = fixture();
actionFixture.sessions = dates.map(date => ({ date, ...(date === dates[253] ? { researchAccountingActions: [dividend] } : {}) }));
delete actionFixture.sessionDates;
assert.throws(() => buildSignalDataset(actionFixture), /absent from separate verified manifest/);
const withDividend = buildSignalDataset({ ...actionFixture, accountingManifest: { source: 'manufactured-reviewed-actions', actions: [dividend] } });
assert.deepEqual(plain(withDividend.dataset.sessions[1].researchAccountingActions), [dividend]);
assert.equal(withDividend.dataset.sessions[1].corporateActions.length, 0, 'Dividend accounting authority is separate from native index actions.');
assert.throws(() => buildSignalDataset({ ...fixture(), accountingManifest: { source: 'manufactured', actions: [{ ...dividend, verified: false }] } }), /Verified unique accounting/);
assert.throws(() => buildSignalDataset({ ...fixture(), accountingManifest: { source: 'manufactured', actions: [{ ...dividend, shareBasis: 'unknown' }] } }), /share basis required/);

assert.equal(nyClose('2025-01-02'), '2025-01-02T21:00:00.000Z');
assert.equal(nyClose('2025-03-24'), '2025-03-24T20:00:00.000Z');
console.log('Signal adapter: source daily parity, future-data invariance, GICS transitions, class/CIK identity, exclusions, 253-row gate, causal rebasing and failures PASS.');
