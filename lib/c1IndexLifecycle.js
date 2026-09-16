import { collectC1LiveInput } from './c1LiveInputProvider';
import { prepareStoredC1DatedBook, connectStoredC1DatedInput } from './c1DatedBookStore';
import { latestCompletedMarketSessionDay, marketSessionDistance, previousMarketSessionDay } from './marketSession';
import { archiveC1IndexObservation, readC1IndexObservations } from './c1IndexObservationStore';

// One daily observation, shared by both pages. Retrying collection never creates
// an alternate model or consumes a historical research checkpoint.
export async function refreshC1Index({ now = new Date(), prepare = prepareStoredC1DatedBook,
  collect = collectC1LiveInput, connect = connectStoredC1DatedInput, archive = archiveC1IndexObservation, readObservations = readC1IndexObservations, onStage = () => {} } = {}) {
  onStage('prepare');
  const prior = await prepare({ now });
  const required = latestCompletedMarketSessionDay(now);
  if (prior.sourceSessionDate === required) return { status: 'already-current', ...prior };
  onStage('collect');
  const input = await collect({ universe: 'sp500', now, budgetMs: 240000 });
  const completedAt = new Date();
  onStage('archive');
  const observationReceipt = await archive(input, { now: completedAt });
  onStage('connect');
  try {
    const recovered = [];
    if (marketSessionDistance(prior.sourceSessionDate, input.sourceSessionDate) > 1) {
      const days = [];
      let day = previousMarketSessionDay(input.sourceSessionDate);
      while (day > prior.sourceSessionDate && days.length < 5) {
        days.unshift(day); day = previousMarketSessionDay(day);
      }
      if (day !== prior.sourceSessionDate) throw new Error('Index recovery exceeds five missing sessions; original preserved');
      for (const date of days) {
        onStage('recover');
        const observations = await readObservations(date, { now: completedAt });
        // Deterministic latest contemporaneous observation, never a choice based
        // on simulated return. All original observation times remain unchanged.
        const selected = observations.at(-1);
        if (!selected) throw new Error('Missing archived index session: ' + date + '; no historical membership backfill');
        await connect(selected.payload, { now: new Date(selected.observedAt), observations });
        recovered.push({ sessionDate: date, observationHash: selected.observationHash });
      }
      onStage('connect');
    }
    const observations = await readObservations(input.sourceSessionDate, { now: completedAt });
    const view = await connect(input, { now: completedAt, observations });
    return { status: 'advanced', ...view, observationReceipt, recovered };
  } catch (error) {
    if (error && typeof error === 'object') error.indexObservation = observationReceipt;
    throw error;
  }
}
