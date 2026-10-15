import { isUsMarketSessionDay, marketSessionDistance } from './marketSession';

// The caller supplies already accepted completed sessions and verified position
// peak provenance; this module never acquires data
// or recomputes a missing historical indicator with present-day information.
export const C1_RECENT_MOMENTUM_GATE = Object.freeze({
  contract: 'c1-recent-momentum-gate-v1',
  deteriorationConfirmations: 3,
  profitProtectionConfirmations: 2,
  profitProtectionActivationPct: 12,
  profitGivebackFraction: 0.5,
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const symbolOf = value => String(value?.symbol || value?.ticker || value || '').toUpperCase().trim();
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value &&
  isUsMarketSessionDay(value);
const stale = value => value?.stale === true || value?.staleFallback === true ||
  value?.staleVerification === true || value?.clientSnapshotFallback === true ||
  value?.dataFeedSnapshotStale === true || value?.current === false || value?.freshness?.stale === true;
const timestamp = value => typeof value === 'string' && value.trim().length > 0 &&
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
function availableByDecision(value, decisionAt) {
  if (!value || typeof value !== 'object') return true;
  const fields = ['marketAvailableAt', 'availableAt'].filter(field => Object.hasOwn(value, field));
  if (!fields.length) return true;
  const boundary = timestamp(decisionAt);
  return boundary !== null && fields.every(field => {
    const availableAt = timestamp(value[field]);
    return availableAt !== null && availableAt <= boundary;
  });
}

// Closes have accepted enclosing-session provenance when compaction omits their
// redundant date. Explicit dates may never disagree with that provenance.
export function readC1RecentMomentumPrice({ session, symbol } = {}) {
  const date = session?.date, wanted = symbolOf(symbol), limitations = [];
  if (!validDate(date)) limitations.push('A valid accepted market-session date is required.');
  if (stale(session)) limitations.push('The accepted session is flagged stale.');
  if (!availableByDecision(session, session?.decisionAt))
    limitations.push('Explicit session availability is invalid or later than its accepted decision boundary.');
  const rows = Array.isArray(session?.prices) ? session.prices.filter(row => symbolOf(row) === wanted) : [];
  const bar = rows.length === 1 ? rows[0] : null;
  if (!wanted || !bar) limitations.push('Exactly one accepted price bar for the symbol is required.');
  if (bar && (bar.adjusted !== true || !positive(bar.close) ||
    (bar.date != null && bar.date !== date) ||
    (bar.asOf != null && (typeof bar.asOf !== 'string' || bar.asOf.slice(0, 10) !== date)) || stale(bar)))
    limitations.push('The adjusted close is missing, stale, invalid, or dated to a different session.');
  if (bar && !availableByDecision(bar, session?.decisionAt))
    limitations.push('Explicit price availability is invalid or later than its accepted decision boundary.');
  const available = limitations.length === 0;
  // A high is optional for the price gate. It can arm protection only when it
  // separately passes strict validation; a fabricated close-only high is unused.
  const high = available && positive(bar?.high) && bar.high >= bar.close &&
    (bar.open == null || positive(bar.open) && bar.high >= bar.open) &&
    (bar.low == null || positive(bar.low) && bar.low <= bar.close && bar.low <= bar.high)
    ? bar.high : null;
  return { available, date: validDate(date) ? date : null,
    close: available ? bar.close : null, high, limitations };
}

function acceptedSignal(session, symbol) {
  // Public signals supersede position signals, matching C1's canonical entry
  // pool. Holding-only reviews can supply timing but never change the rankings.
  for (const [field, source] of [
    ['signals', 'accepted-published-signal'],
    ['positionSignals', 'accepted-position-signal'],
    ['accountHoldingSignals', 'accepted-holding-signal'],
    ['legacyHoldingSignals', 'accepted-holding-classification'],
  ]) {
    const rows = Array.isArray(session?.[field]) ? session[field].filter(row => symbolOf(row) === symbol) : [];
    if (rows.length) return { signal: rows.length === 1 ? rows[0] : null, source,
      ambiguous: rows.length !== 1 };
  }
  return { signal: null, source: 'unavailable', ambiguous: false };
}

export function readC1RecentMomentum({ sessions = [], sessionIndex, symbol } = {}) {
  const index = sessionIndex === undefined && Array.isArray(sessions) ? sessions.length - 1 : sessionIndex;
  const wanted = symbolOf(symbol), limitations = [];
  const session = Array.isArray(sessions) && Number.isSafeInteger(index) && index >= 0 && index < sessions.length
    ? sessions[index] : null;
  const sourceSessionDate = validDate(session?.date) ? session.date : null;
  const result = extra => ({ contract: C1_RECENT_MOMENTUM_GATE.contract,
    sourceSessionDate, available: false, entryAllowed: false, metrics: null,
    fingerprint: null, limitations, ...extra });
  if (!session || !sourceSessionDate || !wanted || index < 5) {
    limitations.push('Six accepted completed sessions and a valid symbol are required.');
    return result();
  }
  const window = sessions.slice(index - 5, index + 1), prices = [];
  for (let offset = 0; offset < window.length; offset++) {
    const row = window[offset];
    if (!validDate(row?.date) || (offset && marketSessionDistance(window[offset - 1].date, row.date) !== 1))
      limitations.push('The six-session close history has a duplicate, missing, or invalid market session.');
    const price = readC1RecentMomentumPrice({ session: row, symbol: wanted });
    for (const reason of price.limitations) limitations.push(`${row?.date || 'unknown'}: ${reason}`);
    prices.push(price);
  }
  const { signal, source, ambiguous } = acceptedSignal(session, wanted);
  const timing = signal?.entryTiming;
  if (ambiguous) limitations.push('The accepted timing source contains duplicate symbol rows.');
  if (!availableByDecision(signal, session.decisionAt) || !availableByDecision(timing, session.decisionAt))
    limitations.push('Explicit signal or timing availability is invalid or later than the accepted decision boundary.');
  if (!signal || timing?.available !== true || typeof timing?.macdImproving !== 'boolean' ||
    stale(signal) || stale(timing) || (timing?.asOf != null && timing.asOf !== sourceSessionDate) ||
    (timing?.symbol != null && symbolOf(timing.symbol) !== wanted))
    limitations.push('Canonical same-session MACD direction is unavailable, stale, or misaligned.');
  if (limitations.length) return result();
  const close = prices[5].close;
  const ret1 = (close / prices[4].close - 1) * 100;
  const ret3 = (close / prices[2].close - 1) * 100;
  const ret5 = (close / prices[0].close - 1) * 100;
  if (![ret1, ret3, ret5].every(finite)) {
    limitations.push('Recent price returns are not finite.');
    return result();
  }
  const macdImproving = timing.macdImproving;
  const negativeWindows = ret3 < 0 && ret5 < 0;
  const weakLatest = ret1 < 0 && macdImproving === false;
  const recovery = ret1 > 0 && macdImproving === true;
  return result({ available: true, entryAllowed: !weakLatest && (!negativeWindows || recovery),
    metrics: { ret1, ret3, ret5, macdImproving, negativeWindows, weakLatest, recovery,
      close, high: prices[5].high, timingSource: source },
    fingerprint: JSON.stringify([window.map((row, offset) => [row.date, prices[offset].close, prices[offset].high]),
      macdImproving, timing.asOf ?? sourceSessionDate, source]) });
}

export function evaluateC1RecentMomentum({ sessions = [], sessionIndex, symbol, prior = null,
  position = null, sleeve = null } = {}) {
  const input = readC1RecentMomentum({ sessions, sessionIndex, symbol });
  const date = input.sourceSessionDate;
  const validPositionId = typeof position?.positionId === 'string' && position.positionId.length > 0 ||
    Number.isSafeInteger(position?.positionId) && position.positionId > 0;
  const holdingValid = position && positive(position.entryPrice) && validDate(position.enteredAt) &&
    validPositionId && (!position.symbol || symbolOf(position.symbol) === symbolOf(symbol)) &&
    date && position.enteredAt <= date;
  const lifecycleKey = holdingValid
    ? JSON.stringify([symbolOf(symbol), sleeve ?? position.sleeve ?? null, position.positionId, position.enteredAt])
    : null;
  const acceptedPrior = lifecycleKey && prior?.contract === C1_RECENT_MOMENTUM_GATE.contract &&
    prior.lifecycleKey === lifecycleKey && validDate(prior.lastSessionDate) && prior.lastSessionDate <= date
    ? prior : null;
  // highWatermark is supplied by the Challenger engine's validated, adjusted
  // since-entry daily-high accumulator. It is not inferred from recent closes.
  const peakGainPct = holdingValid && positive(position.highWatermark)
    ? (position.highWatermark / position.entryPrice - 1) * 100 : null;
  const profitProtectionArmed = Boolean(holdingValid && (acceptedPrior?.profitProtectionArmed === true ||
    (finite(peakGainPct) && position.highWatermark / position.entryPrice >= 1.12)));
  const confirmations = profitProtectionArmed
    ? C1_RECENT_MOMENTUM_GATE.profitProtectionConfirmations
    : C1_RECENT_MOMENTUM_GATE.deteriorationConfirmations;
  const currentGainPct = holdingValid && input.metrics
    ? (input.metrics.close / position.entryPrice - 1) * 100 : null;
  // A numeric high-water field alone cannot prove earned gains. The caller must
  // have established this peak from accepted since-entry high observations for
  // this ownership lifecycle. Missing peak evidence never creates a giveback.
  const verifiedPeak = Boolean(holdingValid && position.recentMomentumPeakVerified === true &&
    positive(position.highWatermark) && position.highWatermark > position.entryPrice);
  const gainGivebackFraction = verifiedPeak && input.metrics
    ? Math.max(0, (position.highWatermark - input.metrics.close) /
      (position.highWatermark - position.entryPrice)) : null;
  const gainGivebackPctPoints = verifiedPeak && input.metrics
    ? Math.max(0, (position.highWatermark - input.metrics.close) / position.entryPrice * 100) : null;
  const meaningfulGiveback = Boolean(profitProtectionArmed && verifiedPeak && input.metrics &&
    position.highWatermark > input.metrics.close &&
    gainGivebackFraction >= C1_RECENT_MOMENTUM_GATE.profitGivebackFraction);
  const holdingFingerprint = input.fingerprint && holdingValid
    ? JSON.stringify([input.fingerprint, position.entryPrice, position.highWatermark,
      position.recentMomentumPeakVerified === true]) : input.fingerprint;
  const state = { contract: C1_RECENT_MOMENTUM_GATE.contract, lifecycleKey,
    lastSessionDate: date, streak: 0, profitGivebackStreak: 0, profitProtectionArmed, fingerprint: holdingFingerprint,
    evidenceAvailable: input.available, exitReason: null };
  const output = { ...input, fingerprint: holdingFingerprint, exitReason: null, state,
    holdingStatus: position ? 'review-required' : null,
    metrics: input.metrics ? { ...input.metrics, peakGainPct, currentGainPct, gainGivebackPctPoints,
      gainGivebackFraction, verifiedPeak, meaningfulGiveback, profitGivebackQualified: false,
      profitGivebackStreak: 0, confirmations, streak: 0 } : null };
  if (!position) return output;
  if (!holdingValid) {
    output.available = false;
    output.entryAllowed = false;
    output.limitations = [...input.limitations, 'The holding entry basis or position lifecycle is unverified.'];
    state.evidenceAvailable = false;
    return output;
  }
  const sameSession = acceptedPrior?.lastSessionDate === date;
  if (sameSession && acceptedPrior.fingerprint !== holdingFingerprint) {
    output.available = false;
    output.entryAllowed = false;
    output.limitations = [...input.limitations, 'The same completed-session momentum evidence changed.'];
    state.fingerprint = acceptedPrior.fingerprint;
    state.profitProtectionArmed = acceptedPrior.profitProtectionArmed === true;
    if (output.metrics) output.metrics.confirmations = state.profitProtectionArmed
      ? C1_RECENT_MOMENTUM_GATE.profitProtectionConfirmations
      : C1_RECENT_MOMENTUM_GATE.deteriorationConfirmations;
    state.evidenceAvailable = false;
    return output;
  }
  if (!input.available) return output;
  const consecutive = acceptedPrior && marketSessionDistance(acceptedPrior.lastSessionDate, date) === 1;
  const previousStreak = acceptedPrior?.evidenceAvailable === true &&
    Number.isSafeInteger(acceptedPrior.streak) && acceptedPrior.streak > 0 ? acceptedPrior.streak : 0;
  const previousGivebackStreak = acceptedPrior?.evidenceAvailable === true &&
    Number.isSafeInteger(acceptedPrior.profitGivebackStreak) && acceptedPrior.profitGivebackStreak > 0
    ? acceptedPrior.profitGivebackStreak : 0;
  const { ret1, negativeWindows, macdImproving, weakLatest, recovery } = input.metrics;
  const canStart = negativeWindows && ret1 < 0 && macdImproving === false;
  const canContinue = consecutive && previousStreak > 0 && negativeWindows && macdImproving === false;
  // The first completed close after the entry session is eligible. There is no
  // 5/30-session minimum; entry-day data cannot establish a post-entry sequence.
  const afterEntry = date > position.enteredAt;
  state.streak = !afterEntry ? 0 : sameSession ? previousStreak
    : canStart || canContinue ? (consecutive ? previousStreak : 0) + 1 : 0;
  // The giveback branch is independent of the historical-window episode. Two
  // red, MACD-confirmed closes after meaningful gain erosion can protect a
  // winner while R3/R5 remain positive. A green day resets this counter only.
  const profitGivebackQualified = meaningfulGiveback && weakLatest;
  state.profitGivebackStreak = !afterEntry ? 0 : sameSession ? previousGivebackStreak
    : profitGivebackQualified ? (consecutive ? previousGivebackStreak : 0) + 1 : 0;
  if (state.streak >= confirmations ||
      state.profitGivebackStreak >= C1_RECENT_MOMENTUM_GATE.profitProtectionConfirmations) {
    state.exitReason = profitProtectionArmed
      ? 'recent-momentum-profit-protection' : 'recent-momentum-deterioration';
    output.exitReason = state.exitReason;
    output.entryAllowed = false;
  }
  output.holdingStatus = output.exitReason ? 'exit-confirmed' :
    !negativeWindows && !weakLatest ? 'hold-supported' : recovery ? 'recovering' : 'under-review';
  output.metrics.streak = state.streak;
  output.metrics.profitGivebackQualified = profitGivebackQualified;
  output.metrics.profitGivebackStreak = state.profitGivebackStreak;
  return output;
}
