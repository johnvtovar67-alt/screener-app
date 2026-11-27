const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {createResearchModuleLoader} = require('./research-module-loader.cjs');
const root = process.cwd();
const base = createResearchModuleLoader(root);
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, row) =>
  row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row)).digest('hex');
const {acceptC1DatedInput: accept} = base.load('lib/c1DatedBook.js');
const {advanceC1ForwardModel: advance, c1ForwardOperationalState: state} = base.load('lib/c1ForwardModel.js');
const {c1RecordedOpeningEconomics: economics} = base.load('lib/c1RecordedOpeningRecovery.js');
const reviews = base.load('lib/c1SessionRevisionReview.js');
const symbols = ['BBY', ...Array.from({length: 9}, (_, i) => 'S' + i)];

function session(date, open, close, time = '22:00:00.000Z') {
  return {date, decisionAt: date + 'T' + time, universeSymbols: symbols, corporateActions: [],
    prices: [...symbols, 'SPARE', 'SPY', 'QQQ'].map(symbol => ({symbol, date,
      open: symbol === 'BBY' ? open : 100, close: symbol === 'BBY' ? close : 100,
      high: Math.max(open, close, 101) + 2, low: Math.min(open, close, 99) - 2,
      volume: 10000000, adjusted: true})),
    signals: symbols.map((symbol, i) => ({symbol, sector: 'Sector' + i % 5,
      price: symbol === 'BBY' ? close : 100, researchFactors: {momentumPercentile: 100 - i,
        volatility60Pct: 20, coverage: 1, return60Ex5: 20, return120Ex5: 30, return252Ex21: 40},
      entryTiming: {available: true, liquidityPass: true, averageDollarVolume20: 500000000}}))};
}

function input(session, previous) {
  return {contract: 'c1-dated-index-input-v1', universe: 'sp500', sourceSessionDate: session.date, session,
    observedAt: session.decisionAt, sourceReceipt: {provider: 'FMP', membershipCheckedTwice: true},
    priorSessionPrices: {date: previous?.date, closes: Object.fromEntries(
      (previous?.prices || []).map(row => [row.symbol, row.close]))},
    priceEvidence: {contract: 'c1-provider-price-fields-v1', endpoint: 'historical-price-eod/dividend-adjusted',
      rows: (previous?.prices || []).map(row => ({symbol: row.symbol, date: row.date,
        adjOpen: row.open, adjHigh: row.high, adjLow: row.low, adjClose: row.close, volume: row.volume}))}};
}

function observation(payload) {
  return {contract: 'c1-index-observation-v1',
    observationHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    observedAt: payload.observedAt, sourceSessionDate: payload.sourceSessionDate,
    acceptedModelInput: false, executable: false, payload};
}

const first = session('2026-11-24', 100, 100);
const previous = session('2026-11-25', 101.84, 102.57);
const current = session('2026-11-27', 102.5, 102.6);
const next = session('2026-11-30', 102.5, 102.6);
const prior = accept(accept(null, input(first), new Date(first.decisionAt)), input(previous, first), new Date(previous.decisionAt));
const revisedPrior = clone(prior.model);
const revisedPrevious = revisedPrior.sessions.at(-1);
revisedPrevious.prices.find(row => row.symbol === 'BBY').open = 99.60;
revisedPrevious.prices.find(row => row.symbol === 'SPARE').close = 100.01;
const selected = observation(input(current, revisedPrevious));
const confirmation = observation(input({...current, decisionAt: current.date + 'T21:45:00.000Z'}, revisedPrevious));
const later = observation(input({...current, decisionAt: current.date + 'T22:15:00.000Z'}, revisedPrevious));
const following = observation(input(next, current));
const now = new Date(selected.observedAt);
const observations = [confirmation, selected];
const replay = model => advance(model, [current], now, {completedCloseQueue: true});
const original = replay(prior.model), revised = replay(revisedPrior);
const review = {...reviews.C1_RECORDED_OPENING_REVIEW, priorRecordHash: prior.recordHash, observedAt: selected.observedAt,
  observationHash: selected.observationHash, confirmingObservationHash: confirmation.observationHash,
  correctedPricesHash: digest(revisedPrevious.prices), recordedEconomicsHash: digest(economics(original)),
  recordedRiskHash: digest(state(original)), revisedEconomicsHash: digest(economics(revised)),
  revisedRiskHash: digest(state(revised))};
const loader = (approvedReview = review, overrides = {}) => createResearchModuleLoader(root, {
  'lib/c1SessionRevisionReview.js': {...reviews, C1_RECORDED_OPENING_REVIEW: approvedReview},
  'lib/c1DatedBookStore.js': {prepareStoredC1DatedBook() {}, connectStoredC1DatedInput() {}},
  'lib/c1IndexObservationStore.js': {archiveC1IndexObservation() {}, readC1IndexObservations() {}},
  ...overrides
});

function run(variant, archived = observations, capture = selected) {
  return variant.load('lib/c1DatedBook.js').acceptC1DatedInput(prior, capture.payload, new Date(capture.observedAt),
    {observations: archived});
}

async function main() {
  assert.equal(original.paperExecutionStatus.status, 'unchanged');
  assert.equal(revised.paperExecutionStatus.reason, 'Model history changed');
  assert.notEqual(review.recordedRiskHash, review.revisedRiskHash, 'Real frozen stops/quantities can change in the hypothetical replay');
  assert.equal(digest(original.pendingBySleeve), digest(revised.pendingBySleeve));
  assert.throws(() => run(base), error => error.providerRevisionDiagnostic?.stage === 'model-parity',
    'Recovery is never available for an unreviewed book');
  const recovered = run(loader()), audit = recovered.reconciliations.at(-1);
  assert.equal(recovered.captures.at(-1).sessionDate, current.date);
  assert.equal(digest(recovered.model), digest(original));
  assert.equal(digest(recovered.model.sessions.slice(0, -1)), digest(prior.model.sessions));
  assert.equal(digest(recovered.model.ledger), digest(prior.model.ledger));
  assert.equal(audit.identicalModelEconomics, false);
  assert.equal(audit.executable, false);
  assert.equal(audit.privateAccountTreatment, 'reviewed-recorded-opening-v1');
  assert.equal(audit.recordedOpeningProof.counterfactualRiskHash, review.revisedRiskHash);
  for (const field of ['correctedPricesHash', 'recordedRiskHash', 'revisedEconomicsHash', 'priorRecordHash'])
    assert.throws(() => run(loader({...review, [field]: '0'.repeat(64)})), /requires reconciliation/);
  assert.throws(() => run(loader(), [selected]), /requires reconciliation/);
  assert.throws(() => run(loader(), [confirmation, later], later), /requires reconciliation/);
  const patchedForward = base.load('lib/c1ForwardModel.js');
  const brokenControl = loader(review, {'lib/c1ForwardModel.js': {...patchedForward,
    advanceC1ForwardModel(model, ...args) {
      const result = patchedForward.advanceC1ForwardModel(model, ...args);
      const prices = model?.sessions.at(-1)?.prices;
      if (prices?.find(row => row.symbol === 'BBY')?.open === review.recordedOpen &&
          prices.find(row => row.symbol === 'SPARE')?.close === 100.01) result.summary.equity += 1;
      return result;
    }
  }});
  assert.throws(() => run(brokenControl), /requires reconciliation/,
    'A correction that fails the independent carried-basis replay cannot pass');

  const active = loader();
  const service = active.load('lib/c1AccountService.js');
  const {portfolioCompositionSignature} = active.load('lib/portfolioGovernor.js');
  const portfolio = [{symbol: 'CASH', role: 'Swing', shares: 10000, avgCost: 1}];
  const capitalRecord = {version: 2, highWater: 10000, triggerDay: null, reconciliationRequired: false,
    portfolioSignature: portfolioCompositionSignature(portfolio)};
  const account = service.adoptC1Account({portfolio, capitalRecord, book: prior, now: new Date(previous.decisionAt)});
  const before = digest({account, recovered});
  const response = service.deriveC1AccountAnalysis({account, book: recovered, now});
  assert.equal(response.decision.sourceSessionDate, current.date);
  assert.equal(response.decision.current, true);
  assert.equal(account.records.length, 0, 'Ordinary analysis and the parity checks never save a carry record');
  assert.equal(digest({account, recovered}), before);
  const malformed = clone(recovered);
  malformed.reconciliations.at(-1).recordedOpeningProof.independentlyConfirmedBy = later.observationHash;
  assert.throws(() => service.deriveC1AccountAnalysis({account, book: malformed, now}), /requires reviewed account reconciliation/);
  const oldInputPath = 'lib/c1AccountInput.js';
  const oldInput = require('./c1-recorded-opening-source-seams.cjs').restore(oldInputPath, fs.readFileSync(oldInputPath, 'utf8'))
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const previousRelease = vm.runInNewContext(oldInput + '\nassertC1AccountRevisionCoverage', reviews);
  assert.throws(() => previousRelease(recovered, account, current.date),
    /requires reviewed account reconciliation/, 'Old deployments fail closed against the new audit');

  for (const field of ['cash', 'orders', 'risk']) {
    const ledger = base.load('lib/c1AccountLedger.js'), projection = base.load('lib/c1AccountProjection.js');
    const affected = args => args.historySessions.find(row => row.date === previous.date)
      ?.prices.find(row => row.symbol === 'BBY')?.open === review.revisedOpen;
    const mismatch = loader(review, {
      'lib/c1AccountLedger.js': {...ledger, continueC1ActualAccount(args) {
        const result = ledger.continueC1ActualAccount(args);
        if (affected(args) && args.sessions.at(-1).date === current.date && field === 'cash') result.actualCash += 1;
        return result;
      }},
      'lib/c1AccountProjection.js': {...projection, projectC1AccountSession(args) {
        const plan = projection.projectC1AccountSession(args);
        if (affected(args)) {
          if (field === 'orders') plan.orders = [...plan.orders, {symbol: 'BBY', shares: 1}];
          if (field === 'risk') plan.riskBySleeve.base = {...plan.riskBySleeve.base, paused: true};
        }
        return plan;
      }}
    });
    assert.throws(() => mismatch.load('lib/c1AccountService.js').deriveC1AccountAnalysis({account, book: recovered, now}),
      /requires reviewed account reconciliation/, 'Current account publication must reject changed ' + field);
  }

  const {refreshC1Index} = active.load('lib/c1IndexLifecycle.js');
  const storeAccept = active.load('lib/c1DatedBook.js').acceptC1DatedInput;
  let saved = prior, writes = 0;
  const dependencies = {
    prepare: async () => ({sourceSessionDate: saved.captures.at(-1).sessionDate, recordHash: saved.recordHash}),
    readObservations: async day => day === current.date ? [...observations, later] : [following],
    collect: async () => { throw new Error('Archived recovery must not fetch a substitute'); },
    connect: async (payload, options) => {
      const updated = storeAccept(saved, payload, options.now, options);
      if (updated !== saved) { saved = updated; writes++; }
      return {sourceSessionDate: saved.captures.at(-1).sessionDate};
    }
  };
  const catchup = await refreshC1Index({...dependencies, now: new Date(next.date + 'T22:20:00.000Z')});
  assert.equal(catchup.sourceSessionDate, next.date);
  assert.equal(catchup.recovered[0].observationHash, selected.observationHash);
  assert.equal(catchup.recovered[1].observationHash, following.observationHash);
  assert.equal(writes, 2);
  assert.equal((await refreshC1Index({...dependencies, now: new Date(next.date + 'T22:20:00.000Z')})).status, 'already-current');
  assert.equal(writes, 2, 'Retries never book the approved transition twice');
  assert.equal(saved.reconciliations.length, 1);
  console.log('PASS: exact archived approval, unchanged booked fills and risk, private cash/orders/risk rejection, delayed recovery and idempotency');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
