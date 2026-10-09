const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

// This is a synthetic software parity check, not a historical alpha experiment.
// The compact source fixture also runs in shallow CI/Vercel build checkouts.
const root = process.cwd();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,
  'fixtures/c1-brokerage-production-5a1a682.json'), 'utf8'));
const productionCommit = '5a1a682956add9bdf30e65d77dfe8c3b3a23f0c3';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
assert.equal(fixture.commit, productionCommit);
const sources = JSON.parse(zlib.gunzipSync(Buffer.from(fixture.sourcesGzipBase64, 'base64')));
for (const [file, expected] of Object.entries(fixture.sourceSha256)) {
  assert.equal(hash(sources[file]), expected, file + ': pinned production source fixture');
}
const originalCalendar = fs.readFileSync(path.join(__dirname,
  'fixtures/top5-market-session-before-reuse.js'));
assert.equal(hash(originalCalendar), fixture.unchangedRuleSha256['lib/marketSession.js'],
  'The calendar comparison fixture must preserve the original production rules');
// The owner authorized reuse of the fixed Eastern formatter and immutable
// holiday sets to repair /api/top5 timeouts. Pin that exact implementation;
// market-session-reuse-regression.cjs separately proves exact calendar parity.
const repairedCalendarSha256 = '2b12b67b5000249f05431908e21c8b8e0979d881f2390d11430287aafe818cc6';
for (const [file, expected] of Object.entries(fixture.unchangedRuleSha256)) {
  assert.equal(hash(fs.readFileSync(path.join(root, file))),
    file === 'lib/marketSession.js' ? repairedCalendarSha256 : expected,
    file + ': the brokerage execution cap must not change the production trading rules');
}

const scratch = path.join(root, 'work');
fs.mkdirSync(scratch, { recursive: true });
const baselineRoot = fs.mkdtempSync(path.join(scratch, 'c1-brokerage-rule-parity-'));
fs.cpSync(path.join(root, 'lib'), path.join(baselineRoot, 'lib'), { recursive: true });
for (const [file, source] of Object.entries(sources)) fs.writeFileSync(path.join(baselineRoot, file), source);
fs.writeFileSync(path.join(baselineRoot, 'lib/marketSession.js'), originalCalendar);
assert.equal(hash(fs.readFileSync(path.join(baselineRoot, 'lib/marketSession.js'))),
  fixture.unchangedRuleSha256['lib/marketSession.js'],
  'Account/model parity must compare the original calendar with its authorized repair');

// Bind the compact fixture to the actual Git tree whenever that commit is
// available. Missing Git history in a deployment never requires network I/O.
let gitArchiveVerified = false;
const archive = spawnSync('git', ['archive', productionCommit, 'lib'],
  { cwd: root, maxBuffer: 32 * 1024 * 1024 });
if (archive.status === 0 && archive.stdout?.length) {
  const extracted = spawnSync('tar', ['-xf', '-', '-C', baselineRoot],
    { input: archive.stdout, maxBuffer: 32 * 1024 * 1024 });
  if (extracted.status === 0) {
    for (const [file, expected] of Object.entries({
      ...fixture.sourceSha256, ...fixture.unchangedRuleSha256,
    })) assert.equal(hash(fs.readFileSync(path.join(baselineRoot, file))), expected,
      file + ': fixture must match the archived production commit');
    gitArchiveVerified = true;
  }
}

const current = createResearchModuleLoader(root);
const baseline = createResearchModuleLoader(baselineRoot);
const market = current.load('lib/marketSession.js');
const options = current.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
const symbols = Array.from({ length: 12 }, (_, i) => 'P' + i);
const sessions = [];
for (let time = Date.parse('2026-03-02T12:00:00Z'); sessions.length < 48; time += 86400000) {
  const date = new Date(time).toISOString().slice(0, 10);
  if (!market.isUsMarketSessionDay(date)) continue;
  const day = sessions.length;
  const prices = [...symbols, 'SPY', 'QQQ'].map((symbol, i) => {
    const prior = day ? sessions.at(-1).prices[i].close : 100;
    const close = prior * (day === 25 ? .84 : 1 + .001 * (i % 3 + 1));
    return { symbol, open: prior, close, high: Math.max(prior, close) * 1.01,
      low: Math.min(prior, close) * .99, volume: 10000000, adjusted: true };
  });
  sessions.push({ date, decisionAt: date + 'T21:00:00Z', universeSymbols: symbols, prices,
    signals: symbols.map((symbol, i) => ({ symbol, sector: 'Sector' + i % 4,
      price: prices[i].close,
      researchFactors: { momentumPercentile: 100 - ((i + Math.floor(day / 18) * 4) % 12),
        volatility60Pct: 20, coverage: 1, return60Ex5: 20, return120Ex5: 30, return252Ex21: 40 },
      entryTiming: { available: true, liquidityPass: true, averageDollarVolume20: 500000000 } })),
  });
}

// Compare complete output, including rankings, stops, exits, holding periods,
// independent sleeve cash, risk state, turnover and whole-share quantities.
for (const [sleeve, config] of Object.entries(options)) {
  const request = { ...config, startDate: sessions[0].date,
    endDate: sessions.at(-1).date, liquidateAtEnd: false };
  same(current.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio({ sessions }, request),
    baseline.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio({ sessions }, request),
    sleeve + ': complete synthetic strategy/model output must equal production');
}

const sourceSession = sessions[35];
const nextSession = sessions[36];
const now = new Date(nextSession.date + 'T14:00:00Z');
const sourceHash = 'synthetic-production-parity';
const book = { universe: 'sp500', model: { sessions: sessions.slice(0, 36) },
  captures: [{ sessionDate: sourceSession.date, hash: sourceHash,
    observedAt: sourceSession.decisionAt }] };
const { portfolioCompositionSignature } = current.load('lib/portfolioGovernor.js');
function accountFor(loader, held = false) {
  const portfolio = [
    { symbol: 'MSTR', role: 'Core', shares: 2, avgCost: 100, openedAt: sessions[0].date },
    { symbol: 'MRNA', role: 'Core', shares: 5, avgCost: 200, openedAt: sessions[0].date },
    ...(held ? [{ symbol: 'P4', role: 'Swing', shares: 3,
      avgCost: sourceSession.prices.find(p => p.symbol === 'P4').close,
      openedAt: sessions[0].date }] : []),
    { symbol: 'CASH', role: 'Swing', shares: 3037.90, avgCost: 1 },
  ];
  const capitalRecord = { version: 2, triggerDay: null, reconciliationRequired: false,
    highWater: 3037.90 + (held ? 3 * portfolio.find(p => p.symbol === 'P4').avgCost : 0),
    portfolioSignature: portfolioCompositionSignature(portfolio) };
  const adoption = loader.load('lib/c1AccountSeed.js').createC1ProspectiveSeeds({
    portfolio, baseline: sourceSession, capitalRecord, adoptionConfirmed: true });
  return { contract: 'c1-private-account-v1', revision: 0, adoption, records: [],
    sourceHashes: [{ date: sourceSession.date, hash: sourceHash }],
    createdAt: sourceSession.decisionAt };
}
const cashFields = new Set(['strategyCash', 'brokerageCash', 'executableCash',
  'brokerageCashCurrent', 'brokerageCashObservedAt', 'brokerageCashStatus',
  'brokerageCashReason', 'cashAuthority', 'cashBlockedOrders']);
function withoutCashOverlay(value, rawPlan = false) {
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !cashFields.has(key) && !(rawPlan && key === 'actualCash')));
}
const currentService = current.load('lib/c1AccountService.js');
const baselineService = baseline.load('lib/c1AccountService.js');
const currentAccount = accountFor(current);
const baselineAccount = accountFor(baseline);
same(currentAccount, baselineAccount, 'Opening strategy adoption must equal production including excluded Core ownership');
const currentHeld = accountFor(current, true);
const baselineHeld = accountFor(baseline, true);
same(currentHeld, baselineHeld, 'Inherited Swing adoption and original dates must equal production');

const { capC1ExecutionCash } = current.load('lib/c1ExecutionCashAuthority.js');
let pureCashPlan;
for (const [active, original] of [[currentAccount, baselineAccount], [currentHeld, baselineHeld]]) {
  const input = { adoption: active.adoption, sessions: [sourceSession],
    historySessions: sessions.slice(0, 36), records: [], observedAt: now.toISOString() };
  const oldInput = { ...input, adoption: original.adoption };
  same(current.load('lib/c1AccountLedger.js').continueC1ActualAccount(input),
    baseline.load('lib/c1AccountLedger.js').continueC1ActualAccount(oldInput),
    'Completed ledger, sleeve state and strategy economics must equal production');
  const rawPlan = current.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({
    ...input, opening: { ...nextSession, corporateActions: [] } });
  const oldPlan = baseline.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({
    ...oldInput, opening: { ...nextSession, corporateActions: [] } });
  same(rawPlan, oldPlan, 'Frozen raw opening orders, sizing, sequencing and stop prices must equal production');
  if (active === currentAccount) pureCashPlan = rawPlan;
  else assert.ok(rawPlan.orders.some(o => o.side === 'sell' && !o.condition),
    'Inherited-position fixture must exercise existing exit recommendations');
  const oldDecision = baselineService.deriveC1AccountAnalysis({ account: original, book, now }).decision;
  for (const balance of [10000, 363.36, 0]) {
    const withBroker = { ...active, brokerageCash: { balance,
      observedAt: nextSession.date + 'T13:29:00Z', source: 'manual-broker-balance' } };
    const decision = currentService.deriveC1AccountAnalysis({ account: withBroker, book, now }).decision;
    same(withoutCashOverlay(decision), oldDecision,
      'Broker cash changes cannot alter completed ranks, opportunities, holdings or decisions');
    assert.equal(decision.actualCash, decision.strategyCash, 'actualCash remains only a strategy cash alias');
    assert.ok(Math.abs(decision.strategyCash - 3037.90) < 1e-7);
    assert.equal(decision.executableCash, Math.min(decision.strategyCash, balance));
    const capped = capC1ExecutionCash({ plan: rawPlan, account: withBroker,
      strategyCash: decision.strategyCash, now });
    const originalById = new Map(rawPlan.orders.map(order => [order.id, order]));
    for (const order of capped.orders) {
      const prior = originalById.get(order.id);
      assert.ok(prior, 'Cash cap cannot invent an order or reorder the C1 selection');
      same({ ...order, shares: prior.shares }, prior,
        'Cash cap may only reduce shares; model reason, price, sleeve, target and stop remain unchanged');
      assert.ok(order.shares <= prior.shares);
    }
    same(capped.orders.filter(o => o.side === 'sell' && !o.condition),
      rawPlan.orders.filter(o => o.side === 'sell' && !o.condition),
      'Zero brokerage cash cannot suppress existing unconditional exits');
    same(capped.entryReviews, rawPlan.entryReviews,
      'Cash insufficiency affects execution authority without changing strategy qualification');
    same(capped.openingBooks, rawPlan.openingBooks, 'Cash cap cannot rewrite strategy sleeve books');
    const cost = capped.orders.filter(o => o.side === 'buy')
      .reduce((sum, order) => sum + order.shares * order.estimatedPrice, 0);
    assert.ok(cost <= decision.executableCash + 1e-7);
    assert.equal(capped.cashAuthority.unrecordedSaleProceedsIncluded, false);
  }
}

const funded = { ...currentAccount, brokerageCash: { balance: 10000,
  observedAt: nextSession.date + 'T13:29:00Z', source: 'manual-broker-balance' } };
const highPlan = capC1ExecutionCash({ plan: pureCashPlan, account: funded,
  strategyCash: 3037.90, now });
same(withoutCashOverlay(highPlan, true), pureCashPlan,
  'Ample broker cash must preserve the complete production plan, including quantities');

// Replay real partial fills independently of any brokerage metadata. The
// accepted history, fees, cost bases, stops and future raw plans stay identical.
const fills = pureCashPlan.orders.filter(order => order.side === 'buy').slice(0, 3)
  .map((order, i) => ({ id: 'synthetic-broker-parity-' + i, orderId: order.id,
    symbol: order.symbol, side: 'buy', shares: 1, price: order.estimatedPrice,
    fee: .01, executedAt: nextSession.date + 'T13:31:00Z' }));
assert.ok(fills.length, 'Synthetic parity fixture must include posted buys');
const record = { date: nextSession.date, complete: true,
  openingObservedAt: now.toISOString(), fills, executionEvidence: pureCashPlan };
const replayInput = { adoption: currentAccount.adoption,
  sessions: [sourceSession, nextSession], historySessions: sessions.slice(0, 37),
  records: [record], observedAt: nextSession.date + 'T21:00:00Z' };
same(current.load('lib/c1AccountLedger.js').continueC1ActualAccount(replayInput),
  baseline.load('lib/c1AccountLedger.js').continueC1ActualAccount(replayInput),
  'Recorded fills and fees must conserve unchanged C1 historical economics');
same(current.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({
  ...replayInput, opening: { ...sessions[37], corporateActions: [] },
  observedAt: sessions[37].date + 'T14:00:00Z' }),
baseline.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({
  ...replayInput, opening: { ...sessions[37], corporateActions: [] },
  observedAt: sessions[37].date + 'T14:00:00Z' }),
'Future raw C1 sizing, holding state and queues after recorded fills must equal production');

// Exercise the complete prepare boundary, using synthetic server-verified
// observations rather than a real quote provider or signed-in account.
const observedOpening = { ...nextSession, corporateActions: [],
  prices: nextSession.prices.map(price => ({ ...price, observedPrice: price.open,
    observedAt: now.toISOString() })),
  receipt: { observedAt: now.toISOString(), membershipCheckedTwice: true,
    previousAdjustedClosesUnchanged: true } };
(async () => {
  const request = { book, now, collectOpening: async () => observedOpening };
  const oldPrepared = await baseline.load('lib/c1AccountExecutionView.js')
    .prepareC1AccountExecution({ ...request, account: baselineAccount });
  assert.equal(oldPrepared.manualRecommendations.status, 'ready',
    'Production comparison fixture must provide a current verified opening');
  for (const balance of [10000, 363.36, 0]) {
    const withBroker = { ...currentAccount, brokerageCash: { balance,
      observedAt: nextSession.date + 'T13:29:00Z', source: 'manual-broker-balance' } };
    const prepared = await current.load('lib/c1AccountExecutionView.js')
      .prepareC1AccountExecution({ ...request, account: withBroker });
    same(withoutCashOverlay(prepared.decision), oldPrepared.decision,
      'The complete execution request cannot change completed production analysis');
    assert.ok(prepared.openingPlan, 'Low cash must leave checked opening analysis visible');
    const buyCost = prepared.manualRecommendations.orders.filter(order => order.side === 'buy')
      .reduce((sum, order) => sum + order.shares * order.estimatedPrice, 0);
    assert.ok(buyCost <= Math.min(3037.90, balance) + 1e-7,
      'The public prepare boundary must never grant aggregate buy authority above either cash source');
    if (balance === 10000) {
      same(withoutCashOverlay(prepared.openingPlan, true), oldPrepared.openingPlan,
        'Ample cash preserves the production prepare plan, exact quantities and verification');
      same(withoutCashOverlay(prepared.executionDecision), oldPrepared.executionDecision,
        'Ample cash preserves the production execution action overlay');
      same(prepared.manualRecommendations, oldPrepared.manualRecommendations,
        'Ample cash preserves production manual recommendation authority and freshness');
    }
  }
  console.log('PASS: production 5a1a682 parity — ' +
    Object.keys(fixture.unchangedRuleSha256).length + ' pinned rule/planner files; all three synthetic sleeves; ' +
    'complete ledger/raw-plan/holding/rank equivalence; ample-cash prepare authority unchanged; ' +
    '$3037.90 strategy / $363.36 brokerage and zero-cash caps affect execution only; ' +
    'recorded-fill replay preserved; Git archive verified=' + gitArchiveVerified + '.');
})().catch(error => { console.error(error); process.exitCode = 1; });
