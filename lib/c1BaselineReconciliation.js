import { C1_BASELINE_REVISION_REVIEW } from './c1BaselineRevisionReview';

// Reconcile one reviewed, unexposed baseline. This is not a general corporate
// action handler. Original signals/observations remain frozen as observed.
export function reconcileC1UnexposedBaseline(prior, input, now, digest, advance) {
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
