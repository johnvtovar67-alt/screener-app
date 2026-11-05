import { collectC1LiveInput } from './c1LiveInputProvider';
import { prepareStoredC1DatedBook, connectStoredC1DatedInput } from './c1DatedBookStore';
import { latestCompletedMarketSessionDay, marketSessionDistance, previousMarketSessionDay } from './marketSession';
import { archiveC1IndexObservation, readC1IndexObservations } from './c1IndexObservationStore';
import { C1_SESSION_REVISION_REVIEW } from './c1SessionRevisionReview';

// One daily observation, shared by both pages. Retrying collection never creates
// an alternate model or consumes a historical research checkpoint.
export async function refreshC1Index({ now = new Date(), prepare = prepareStoredC1DatedBook,
  collect = collectC1LiveInput, connect = connectStoredC1DatedInput, archive = archiveC1IndexObservation, readObservations = readC1IndexObservations, onStage = () => {} } = {}) {
  onStage('prepare');
  const prior = await prepare({ now });
  const required = latestCompletedMarketSessionDay(now);
  if (prior.sourceSessionDate === required) return { status: 'already-current', ...prior };
  // Recover this reviewed contemporaneous capture before asking the provider
  // for a newer adjusted history. The normal connect guards still validate
  // immutable evidence and economic parity; no model record is overwritten.
  const review = C1_SESSION_REVISION_REVIEW;
  if (prior.recordHash === review.priorRecordHash && required === review.currentSessionDate) {
    onStage('recover');
    const observations = await readObservations(required, { now });
    const selected = observations.find(o => o.observationHash === review.observations.at(-1));
    if (!selected) throw new Error('Reviewed index observation unavailable; original preserved');
    const eligible = observations.filter(o => o.observedAt <= selected.observedAt);
    const view = await connect(selected.payload, { now: new Date(selected.observedAt), observations: eligible });
    return { status: 'advanced', ...view, recovered: [{ sessionDate: required, observationHash: selected.observationHash }] };
  }
  const recovered = [];
  let recoveryFailure, archivedFailure, blockedSessionDate = required;
  const recoveryError = (error, acquisition) => {
    if (error && typeof error === 'object') error.indexRecovery = {
      state: 'blocked', sessionDate: blockedSessionDate, acquisition,
      recoveredSessionDates: recovered.map(row => row.sessionDate)
    };
    return error;
  };
  // A restart must not require the provider to repeat already archived work.
  // Resume consecutive immutable observations through the same acceptance and
  // conditional-write boundary. Each successful session is its own checkpoint.
  try {
    if (marketSessionDistance(prior.sourceSessionDate, required) > 1) {
      const days = [];
      let day = previousMarketSessionDay(required);
      while (day > prior.sourceSessionDate && days.length < 5) {
        days.unshift(day); day = previousMarketSessionDay(day);
      }
      if (day !== prior.sourceSessionDate) throw new Error('Index recovery exceeds five missing sessions; original preserved');
      for (const date of days) {
        blockedSessionDate = date;
        onStage('archive-read');
        const observations = await readObservations(date, { now });
        // Deterministic latest contemporaneous observation, never a choice based
        // on simulated return. All original observation times remain unchanged.
        const selected = observations.at(-1);
        if (!selected) throw new Error('Missing archived index session: ' + date + '; no historical membership backfill');
        onStage('recover');
        await connect(selected.payload, { now: new Date(selected.observedAt), observations });
        recovered.push({ sessionDate: date, observationHash: selected.observationHash });
      }
    }
  } catch (error) { recoveryFailure = error; }
  if (!recoveryFailure) {
    blockedSessionDate = required;
    let observations;
    onStage('archive-read');
    try { observations = await readObservations(required, { now }); }
    catch (error) { recoveryFailure = error; }
    if (observations) {
      const selected = observations.at(-1);
      if (selected) {
        onStage('recover');
        try {
          const view = await connect(selected.payload, { now: new Date(selected.observedAt), observations });
          recovered.push({ sessionDate: required, observationHash: selected.observationHash });
          return { status: 'advanced', ...view, recovered };
        } catch (error) {
          archivedFailure = error;
          // A fresh independent observation may supply a missing confirmation.
          // It still faces every economic guard; a rejected archive is never
          // promoted merely because acquisition later fails.
        }
      }
    }
  }
  onStage('collect');
  let input;
  try { input = await collect({ universe: 'sp500', now, budgetMs: 240000 }); }
  catch (error) {
    // Keep the demonstrated rejection and its economic diagnostic when an
    // independent confirmation cannot be acquired. The outage did not clear it.
    const blocked = recoveryFailure || archivedFailure;
    if (blocked) { onStage('recover'); throw recoveryError(blocked, 'failed'); }
    throw error;
  }
  const completedAt = new Date();
  onStage('archive');
  const observationReceipt = await archive(input, { now: completedAt });
  onStage('connect');
  try {
    // Preserve today's actual observation even when an older session cannot
    // recover. Otherwise a temporary gap would discard every subsequent day.
    if (recoveryFailure) throw recoveryFailure;
    const observations = await readObservations(input.sourceSessionDate, { now: completedAt });
    const view = await connect(input, { now: completedAt, observations });
    return { status: 'advanced', ...view, observationReceipt, recovered };
  } catch (error) {
    if (error && typeof error === 'object') error.indexObservation = observationReceipt;
    throw recoveryError(error, 'archived');
  }
}
