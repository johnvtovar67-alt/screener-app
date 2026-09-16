import { C1_BASELINE_REVISION_REVIEW } from './c1BaselineRevisionReview';
import { C1_HELD_CLOSE_REVISION_REVIEW } from './c1HeldCloseRevisionReview';

// Reconcile one reviewed, unexposed baseline. This is not a general corporate
// action handler. Original signals/observations remain frozen as observed.
export function reconcileC1UnexposedBaseline(prior, input, now, digest, advance, observations = []) {
  if (prior.captures.length > 1) return reconcileC1UnexposedPrices(prior, input, now, digest, advance, observations);
  const review = C1_BASELINE_REVISION_REVIEW;
  const reject = () => { throw new Error('Reviewed baseline reconciliation conditions not met'); };
  if (prior.recordHash !== review.priorRecordHash || prior.universe !== 'sp500' ||
      prior.captures.length !== 1 || prior.model.sessions.length !== 1 ||
      prior.model.sessions[0].date !== review.previousSessionDate ||
      input.sourceSessionDate !== review.currentSessionDate ||
      Date.parse(input.observedAt) < Date.parse(review.reviewedThrough) ||
      input.sourceReceipt?.membershipSha256 !== review.membershipSha256 ||
      input.sourceReceipt?.membershipCheckedTwice !== true ||
      digest(input.priorSessionPrices) !== review.anchorsHash ||
      input.priceEvidence?.contract !== 'c1-provider-price-fields-v1' ||
      input.priceEvidence?.endpoint !== 'historical-price-eod/dividend-adjusted') reject();
  const { recordHash, ...saved } = prior;
  if (digest(saved) !== recordHash) reject();
  const ledger = prior.model.ledger;
  if (ledger?.kind !== 'virtual-model' || ledger.fills.length !== 0 ||
      Object.values(ledger.sleeves).some(s => Object.keys(s.positions).length !== 0) ||
      prior.model.summary?.observedForwardSessions !== 0) reject();
  const changed = new Set(review.mismatches.map(r => r.symbol));
  if (Object.values(prior.model.pendingBySleeve).flat().some(o => changed.has(o.symbol))) reject();
  const evidence = input.priceEvidence.rows.filter(r => r.date === review.previousSessionDate)
    .map(r => ({ ...r, symbol: ({ 'BRK-B': 'BRK.B', 'BF-B': 'BF.B' })[r.symbol] || r.symbol }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (digest(evidence) !== review.priorEvidenceHash) reject();
  const revised = JSON.parse(JSON.stringify(prior.model));
  const bySymbol = new Map(evidence.map(r => [r.symbol, r]));
  for (const row of revised.sessions[0].prices) {
    const bar = bySymbol.get(row.symbol);
    if (!bar) reject();
    for (const [field, providerField] of Object.entries({ open: 'adjOpen', high: 'adjHigh',
      low: 'adjLow', close: 'adjClose', volume: 'volume' })) {
      if (!Number.isFinite(bar[providerField])) reject();
      row[field] = bar[providerField];
    }
  }
  // Two-session operational replay, never a historical alpha test. Revisions
  // must have zero effect on the complete economic result, not just total NAV.
  const originalResult = advance(prior.model, [input.session], now, { completedCloseQueue: true });
  const revisedResult = advance(revised, [input.session], now, { completedCloseQueue: true });
  const fields = ['ledger', 'pendingBySleeve', 'paperExecution', 'paperExecutionStatus', 'summary'];
  for (const field of fields) if (digest(originalResult[field]) !== digest(revisedResult[field])) reject();
  if (originalResult.paperExecutionStatus?.status === 'blocked') reject();
  return { model: originalResult, audit: {
    contract: 'c1-unexposed-baseline-reconciliation-v1', priorRecordHash: recordHash,
    previousSessionDate: review.previousSessionDate, currentSessionDate: review.currentSessionDate,
    reviewedObservations: review.observations, anchorsHash: review.anchorsHash,
    priorEvidenceHash: review.priorEvidenceHash, mismatches: review.mismatches,
    acceptedObservationAt: input.observedAt, originalInputsPreserved: true,
    basis: 'no-existing-model-exposure-and-identical-economic-replay',
    comparisonHash: digest(Object.fromEntries(fields.map(k => [k, originalResult[k]]))),
    economicAdjustments: [], executable: false, eligibleForAlphaClaim: false,
  } };
}

// A revised price for a stock never owned or queued by the model must not
// prevent unrelated accounts from receiving the next session. This accepts no
// price tolerance: evidence and a complete economic replay must agree exactly.
// Held close/volume corrections require repeat-confirmed immutable observations,
// unchanged range and exact economic parity. Other basis changes still reject.
export function reconcileC1UnexposedPrices(prior, input, now, digest, advance, observations = []) {
  const reject = () => { throw new Error('Unexposed price reconciliation conditions not met'); };
  const { recordHash, ...saved } = prior;
  if (digest(saved) !== recordHash || prior.universe !== 'sp500' ||
      input.sourceReceipt?.provider !== 'FMP' || input.sourceReceipt?.membershipCheckedTwice !== true ||
      input.priceEvidence?.contract !== 'c1-provider-price-fields-v1' ||
      input.priceEvidence.endpoint !== 'historical-price-eod/dividend-adjusted' ||
      prior.model.ledger?.kind !== 'virtual-model') reject();
  const previous = prior.model.sessions.at(-1), anchors = input.priorSessionPrices;
  if (anchors?.date !== previous.date) reject();
  const changes = previous.prices.filter(p => !Number.isFinite(anchors.closes?.[p.symbol]) ||
    Math.abs(anchors.closes[p.symbol] - p.close) > 1e-8 * Math.max(1, p.close));
  if (!changes.length) reject();
  const exposed = new Set(['SPY', 'QQQ', ...prior.model.ledger.fills.map(f => f.symbol),
    ...Object.values(prior.model.ledger.sleeves).flatMap(s => Object.keys(s.positions)),
    ...Object.values(prior.model.pendingBySleeve).flat().map(o => o.symbol)]);
  const revised = JSON.parse(JSON.stringify(prior.model)), evidence = [], reviewedHeldCloses = [];
  for (const p of changes) {
    if (!Number.isFinite(anchors.closes[p.symbol]) || anchors.closes[p.symbol] <= 0) reject();
    const rows = input.priceEvidence.rows.filter(r =>
      (({ 'BRK-B': 'BRK.B', 'BF-B': 'BF.B' })[r.symbol] || r.symbol) === p.symbol);
    const bars = {};
    for (const date of [previous.date, input.sourceSessionDate]) {
      const matching = rows.filter(r => r.date === date);
      if (matching.length !== 1) reject();
      const r = matching[0];
      const bar = { open:r.adjOpen, high:r.adjHigh, low:r.adjLow, close:r.adjClose, volume:r.volume };
      if (!['open','high','low','close'].every(k => Number.isFinite(bar[k]) && bar[k] > 0) ||
          !Number.isFinite(bar.volume) || bar.volume < 0 || bar.low > Math.min(bar.open,bar.close) ||
          bar.high < Math.max(bar.open,bar.close)) reject();
      bars[date] = bar; evidence.push(r);
    }
    if (bars[previous.date].close !== anchors.closes[p.symbol]) reject();
    if (exposed.has(p.symbol)) {
      const review = C1_HELD_CLOSE_REVISION_REVIEW, bar = bars[previous.date];
      // Only this independently reviewed close/volume correction may cross
      // model exposure. A split, changed range, other symbol/date/book or new
      // correction still requires separate reconciliation.
      const exactReview = !(recordHash !== review.priorRecordHash || p.symbol !== review.symbol ||
          previous.date !== review.previousSessionDate || input.sourceSessionDate !== review.currentSessionDate ||
          !(Date.parse(input.observedAt) >= Date.parse(review.reviewedThrough)) ||
          p.close !== review.previousClose || bar.close !== review.observedPriorClose ||
          bar.volume !== review.volume || ['open','high','low'].some(k => p[k] !== review[k] || bar[k] !== review[k]));
      if (!exactReview) {
        // A repeat-confirmed close/volume correction with unchanged range is
        // eligible for full economic parity below. Benchmarks and range/basis
        // changes remain blocked. Records come only from the verified archive.
        const repeated = observations.filter(o => o.payload?.sourceReceipt?.provider === 'FMP' &&
          o.sourceSessionDate === input.sourceSessionDate && o.observedAt <= input.observedAt &&
          o.payload.priorSessionPrices?.date === previous.date &&
          o.payload.priceEvidence?.rows?.filter(r => r.symbol === p.symbol && r.date === previous.date).length === 1 &&
          ['adjOpen','adjHigh','adjLow','adjClose','volume'].every(k =>
            o.payload.priceEvidence.rows.find(r => r.symbol === p.symbol && r.date === previous.date)[k] ===
            rows.find(r => r.date === previous.date)[k]));
        if (['SPY','QQQ'].includes(p.symbol) || ['open','high','low'].some(k => p[k] !== bar[k]) ||
            new Set(repeated.map(o => o.observedAt)).size < 2) reject();
        reviewedHeldCloses.push({ symbol:p.symbol, observations:repeated.map(o => o.observationHash),
          basis:'repeat-confirmed-close-and-volume-correction-with-unchanged-open-high-low' });
      } else reviewedHeldCloses.push({symbol:p.symbol, observations:[...review.observations],
        basis:'reviewed-close-and-volume-correction-with-unchanged-open-high-low'});
    }
    const current = input.session.prices.find(r => r.symbol === p.symbol);
    if (!current || Object.keys(bars[input.sourceSessionDate]).some(k => current[k] !== bars[input.sourceSessionDate][k])) reject();
    Object.assign(revised.sessions.at(-1).prices.find(r => r.symbol === p.symbol), bars[previous.date]);
  }
  const originalResult = advance(prior.model, [input.session], now, { completedCloseQueue:true });
  const revisedResult = advance(revised, [input.session], now, { completedCloseQueue:true });
  const fields = ['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
  for (const key of fields) if (digest(originalResult[key]) !== digest(revisedResult[key])) reject();
  if (originalResult.paperExecutionStatus?.status === 'blocked') reject();
  return { model:originalResult, audit:{ contract:'c1-unexposed-price-reconciliation-v1',
    priorRecordHash:recordHash, previousSessionDate:previous.date, currentSessionDate:input.sourceSessionDate,
    mismatches:changes.map(p => ({symbol:p.symbol,previousClose:p.close,observedPriorClose:anchors.closes[p.symbol]})),
    anchorsHash:digest(anchors), priceEvidenceHash:digest(evidence), acceptedObservationAt:input.observedAt,
    basis:reviewedHeldCloses.length?'reviewed-held-close-correction-and-identical-economic-replay':'no-historical-or-queued-model-exposure-and-identical-economic-replay',
    ...(reviewedHeldCloses.length?{reviewedHeldCloses}:{}),
    comparisonHash:digest(Object.fromEntries(fields.map(k => [k,originalResult[k]]))),
    originalInputsPreserved:true, economicAdjustments:[], executable:false, eligibleForAlphaClaim:false } };
}
