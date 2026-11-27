import {c1ForwardOperationalState} from './c1ForwardModel';
import {C1_RECORDED_OPENING_REVIEW as review} from './c1SessionRevisionReview';

export const C1_RECORDED_OPENING_TREATMENT = 'reviewed-recorded-opening-v1';

export function c1RecordedOpeningEconomics(model) {
  const {ledger, pendingBySleeve, paperExecution, paperExecutionStatus, summary} = model;
  return {ledger, pendingBySleeve, paperExecution, paperExecutionStatus, summary};
}

const openingProof = Object.freeze({
  contract: 'c1-recorded-opening-proof-v1',
  observationHash: review.observationHash,
  independentlyConfirmedBy: review.confirmingObservationHash,
  recordedRiskHash: review.recordedRiskHash,
  counterfactualEconomicsHash: review.revisedEconomicsHash,
  counterfactualRiskHash: review.revisedRiskHash
});

// All normal observation and bar confirmation checks run first. The one
// difference authorized here is retaining the already recorded opening basis.
export function proveC1RecordedOpening({prior, input, now, digest, advance, original, corrected,
  correctedPrices, archivedInput, observationHash, confirmations}) {
  const previous = prior.model.sessions.at(-1);
  if (prior.recordHash !== review.priorRecordHash || previous.date !== review.previousSessionDate ||
      input.sourceSessionDate !== review.currentSessionDate || input.observedAt !== review.observedAt ||
      observationHash !== review.observationHash || confirmations.get(review.symbol) !== review.confirmingObservationHash ||
      (input !== archivedInput && digest(input) !== digest(archivedInput)) ||
      digest(correctedPrices) !== review.correctedPricesHash ||
      previous.prices.find(row => row.symbol === review.symbol)?.open !== review.recordedOpen ||
      correctedPrices.find(row => row.symbol === review.symbol)?.open !== review.revisedOpen ||
      digest(original.sessions.slice(0, -1)) !== digest(prior.model.sessions) ||
      digest(original.sessions.at(-1)) !== digest(input.session) ||
      digest(original.ledger) !== digest(prior.model.ledger) ||
      digest(original.paperExecution) !== digest(prior.model.paperExecution) ||
      original.paperExecutionStatus?.status !== 'unchanged' ||
      digest(original.pendingBySleeve) !== digest(corrected.pendingBySleeve) ||
      digest(c1RecordedOpeningEconomics(original)) !== review.recordedEconomicsHash ||
      digest(c1RecordedOpeningEconomics(corrected)) !== review.revisedEconomicsHash ||
      digest(c1ForwardOperationalState(original)) !== review.recordedRiskHash ||
      digest(c1ForwardOperationalState(corrected)) !== review.revisedRiskHash) return null;

  // Apply every independently confirmed revision in this detached replay,
  // retaining only the opening price used by the original booked model buy.
  // Orders, positions, stops, cash, cooldowns and risk must then agree exactly.
  const control = JSON.parse(JSON.stringify(prior.model));
  control.sessions.at(-1).prices = correctedPrices.map(row =>
    row.symbol === review.symbol ? {...row, open: review.recordedOpen} : row);
  const carried = advance(control, [input.session], now, {completedCloseQueue: true});
  if (digest(c1RecordedOpeningEconomics(carried)) !== review.recordedEconomicsHash ||
      digest(c1ForwardOperationalState(carried)) !== review.recordedRiskHash) return null;
  return {...openingProof};
}

export function isC1RecordedOpeningAudit(audit, book, digest) {
  const previous = book.model.sessions.find(row => row.date === review.previousSessionDate);
  const capture = book.captures.find(row => row.sessionDate === review.currentSessionDate);
  return audit.contract === 'c1-provider-revision-reconciliation-v1' &&
    audit.privateAccountTreatment === C1_RECORDED_OPENING_TREATMENT &&
    audit.priorRecordHash === review.priorRecordHash &&
    audit.previousSessionDate === review.previousSessionDate && audit.currentSessionDate === review.currentSessionDate &&
    audit.provider === 'FMP' && audit.endpoint === 'historical-price-eod/dividend-adjusted' &&
    audit.originalInputsPreserved === true && audit.identicalModelEconomics === false &&
    audit.executable === false && audit.eligibleForAlphaClaim === false &&
    Array.isArray(audit.economicAdjustments) && audit.economicAdjustments.length === 0 &&
    Array.isArray(audit.observations) && audit.observations[0] === review.observationHash &&
    audit.observations.includes(review.confirmingObservationHash) &&
    audit.comparisonHash === review.recordedEconomicsHash &&
    digest(audit.recordedOpeningProof ?? null) === digest(openingProof) &&
    digest(audit.correctedPrices ?? null) === review.correctedPricesHash &&
    previous?.prices.find(row => row.symbol === review.symbol)?.open === review.recordedOpen &&
    capture?.observedAt === review.observedAt;
}
