import { collectC1LiveInput } from './c1LiveInputProvider';
import { prepareStoredC1DatedBook, connectStoredC1DatedInput } from './c1DatedBookStore';
import { latestCompletedMarketSessionDay } from './marketSession';

// One daily observation, shared by both pages. Retrying collection never creates
// an alternate model or consumes a historical research checkpoint.
export async function refreshC1Index({ now = new Date(), prepare = prepareStoredC1DatedBook,
  collect = collectC1LiveInput, connect = connectStoredC1DatedInput } = {}) {
  const prior = await prepare({ now });
  const required = latestCompletedMarketSessionDay(now);
  if (prior.sourceSessionDate === required) return { status: 'already-current', ...prior };
  const input = await collect({ universe: 'sp500', now, budgetMs: 240000 });
  const completedAt = new Date();
  const view = await connect(input, { now: completedAt });
  return { status: 'advanced', ...view };
}
