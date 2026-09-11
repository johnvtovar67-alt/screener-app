import { createHash } from 'node:crypto';
import { advanceC1ForwardModel } from './c1ForwardModel';
import { buildC1DecisionSnapshot } from './c1DecisionSnapshot';
import { compareC1Holdings } from './c1HoldingsComparison';
import { latestCompletedMarketSessionDay, marketSessionDistance } from './marketSession';
import { C1_LIVE_INPUT_CONTRACT } from './c1LiveInput';

export const C1_DATED_BOOK_CONTRACT = 'c1-dated-index-book-v1';
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function inputIdentity(input) {
  // Re-observing an unchanged close is not a data revision. Its FIRST actual
  // observation time remains on the accepted session and the model book.
  const { decisionAt, ...session } = clone(input.session);
  const observationSeconds = Math.floor(Date.parse(input.observedAt) / 1000);
  for (const key of ['signals', 'positionSignals']) for (const row of session[key] || []) {
    if (row.timestamp === observationSeconds) delete row.timestamp;
  }
  return digest({ contract: input.contract, universe: input.universe, session, metadata: input.metadata });
}
function verifyRecord(record) {
  const { recordHash, ...content } = record;
  if (record.contract !== C1_DATED_BOOK_CONTRACT || digest(content) !== recordHash || !record.captures?.length)
    throw new Error('Dated model record integrity failed; preserve the original');
}
export function acceptC1DatedInput(prior, input, now = new Date()) {
  const required = latestCompletedMarketSessionDay(now);
  if (input?.contract !== C1_LIVE_INPUT_CONTRACT || !['nasdaq', 'sp500'].includes(input.universe) ||
      input.sourceSessionDate !== required || input.session?.date !== required ||
      input.session.decisionAt !== input.observedAt || !Number.isFinite(Date.parse(input.observedAt)) ||
      Date.parse(input.observedAt) > now.getTime() || input.sourceReceipt?.membershipCheckedTwice !== true)
    throw new Error('A current, dated, provider-checked index input is required');
  const hash = inputIdentity(input);
  if (prior) {
    verifyRecord(prior);
    if (prior.universe !== input.universe) throw new Error('An existing model cannot switch index universes');
    const captured = prior.captures.find(row => row.sessionDate === required);
    if (captured) {
      if (captured.hash !== hash) throw new Error('Previously accepted index input changed; original preserved');
      return prior;
    }
    const previous = prior.model.sessions.at(-1);
    if (marketSessionDistance(previous.date, required) !== 1) throw new Error('Missing observed index session; no historical membership backfill');
    const anchors = input.priorSessionPrices;
    if (anchors?.date !== previous.date) throw new Error('Previous-session adjusted price anchors are required');
    // Splits, distributions and vendor corrections can change the price basis.
    // Never apply newly adjusted quotes to old virtual shares without a
    // separately reconciled corporate-action transition.
    const mismatches = [];
    for (const row of previous.prices) {
      const value = anchors.closes?.[row.symbol];
      if (!Number.isFinite(value) || Math.abs(value - row.close) > 1e-8 * Math.max(1, row.close))
        mismatches.push({ symbol: row.symbol, previousClose: row.close,
          observedPriorClose: Number.isFinite(value) ? value : null });
    }
    if (mismatches.length) {
      const error = new Error('Corporate action, removal, or price revision requires reconciliation: ' + mismatches[0].symbol);
      error.priceAnchorMismatch = { previousSessionDate: previous.date, currentSessionDate: required,
        mismatchCount: mismatches.length, mismatches };
      throw error;
    }
  }
  const model = advanceC1ForwardModel(prior?.model || null, [input.session], now, { completedCloseQueue: true });
  const content = { contract: C1_DATED_BOOK_CONTRACT, universe: input.universe,
    captures: [...(prior?.captures || []), { sessionDate: required, hash,
      observedAt: input.observedAt, sourceReceipt: clone(input.sourceReceipt) }], model };
  return { ...content, recordHash: digest(content) };
}
export function c1DatedBookView(record, holdings = [], now = new Date()) {
  verifyRecord(record);
  const capture = record.captures.at(-1), current = capture.sessionDate === latestCompletedMarketSessionDay(now);
  const inputArchive = { status: 'captured', sessionDate: capture.sessionDate,
    firstHash: capture.hash, observedHash: capture.hash, firstObservedAt: capture.observedAt,
    sourcePointInTime: false };
  const model = { ...record.model.summary, status: current ? 'paper-only' : 'stale',
    cohort: record.universe, inputArchive };
  const decision = buildC1DecisionSnapshot({ model, inputArchive, sourceSessionDate: capture.sessionDate, now });
  return { contract: C1_DATED_BOOK_CONTRACT, universe: record.universe, sourceSessionDate: capture.sessionDate,
    firstObservedAt: capture.observedAt, sourceHash: capture.hash, recordHash: record.recordHash,
    model, decisionSnapshot: decision,
    holdingsComparison: compareC1Holdings(holdings, model, decision),
    executable: false, activationAuthorized: false, orders: [],
    limitations: ['Existing account holdings are compared, not adopted as historical model sleeve fills.',
      'This connection does not supply account-sized orders or authorize trading.'] };
}
