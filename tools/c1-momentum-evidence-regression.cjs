const assert = require('node:assert/strict');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');

// Fixtures exercise the display classifier using the application's real module.
// No provider, account save, model replay, brokerage record, or order is involved.
const loader = createResearchModuleLoader(process.cwd());
const { classifyC1MomentumEvidence: classify, c1PortfolioMomentumEvidence: portfolioEvidence } =
  loader.load('lib/c1MomentumEvidence.js');
const { c1IntradayDecision } = loader.load('lib/c1IntradayActivity.js');
const { C1_ACCOUNT_MOMENTUM_EXIT_POLICY: policy, C1_FROZEN_OPTIONS: frozen } =
  loader.load('lib/c1FrozenOptions.js');
const sourceSessionDate = '2026-10-09';
const equal = (actual, expected, message) => assert.deepEqual(
  JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message,
);
const clone = value => structuredClone(value);
const bullish = new Set(['Momentum Accelerating', 'Momentum Intact']);

function observation(date, rank, extra = {}) {
  const row = {
    date, close: 110, priceAvg50: 103, priceAvg200: 94,
    ranks: { base: { rank, eligible: true, eligibleCount: 100, source: 'authoritative-opportunities' } },
    timing: {
      available: true, asOf: date, ret5: 3, ret10: 5, sma20Slope: 0.7,
      macdImproving: true, alpha20VsSpy: date === sourceSessionDate ? 5 : 2,
      alpha60VsSpy: date === sourceSessionDate ? 8 : 6,
      relativeStrengthVerified: true,
    },
  };
  return { ...row, ...extra, timing: { ...row.timing, ...(extra.timing || {}) } };
}
function input(observations = [observation('2026-10-08', 5), observation(sourceSessionDate, 3)]) {
  return { contract: 'c1-momentum-evidence-input-v1', sourceSessionDate, observations, limitations: [] };
}
function rule(extra = {}) {
  return {
    sleeve: 'base', heldSessions: 10, minimumHold: 30, exitBuffer: 6, close: 110,
    earlyStart: 5, earlyEnd: 30, earlyThreshold: 9, earlyConfirmations: 3, earlyStreak: 0,
    profitThreshold: 6, profitConfirmations: 2, profitStreak: 0,
    profitProtectionArmed: false, peakGainPct: 10, rankVerified: true, ...extra,
  };
}
function position(extra = {}) {
  return {
    symbol: 'AAA', shares: 100, avgCost: 100, openedAt: '2026-09-25', action: 'Hold',
    exits: [], stops: [{ sleeve: 'base', shares: 100, price: 86 }],
    reviewRules: [rule()], ...extra,
  };
}
function run({ holding = position(), evidence = input(), current = true, source = sourceSessionDate } = {}) {
  const result = classify({ position: holding, input: evidence, current, sourceSessionDate: source });
  assert.ok(['available', 'partial', 'unavailable', 'stale'].includes(result.status));
  assert.equal(typeof result.label, 'string');
  assert.equal(typeof result.explanation, 'string');
  assert.ok(result.explanation.length > 0, 'Every result explains its evidence or limitation');
  assert.ok(Array.isArray(result.limitations));
  assert.ok(result.classification === null || [
    'Momentum Accelerating', 'Momentum Intact', 'Momentum Weakening', 'Exit Risk',
  ].includes(result.classification));
  return result;
}
function expectClassification(options, classification, message) {
  const result = run(options);
  assert.equal(result.classification, classification, message);
  return result;
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const accelerating = expectClassification({}, 'Momentum Accelerating');
assert.equal(accelerating.status, 'available');
assert.match(accelerating.explanation, /rank/i);
assert.match(accelerating.explanation, /5.*3|3.*5/);
assert.match(accelerating.explanation, /SPY|relative strength/i);
assert.match(accelerating.explanation, /price|return|slope|MACD/i);

const steady = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3)]);
expectClassification({ evidence: steady }, 'Momentum Intact');
const rankedDown = input([observation('2026-10-08', 2), observation(sourceSessionDate, 4)]);
assert.match(expectClassification({ evidence: rankedDown }, 'Momentum Weakening').explanation, /rank/i);
const damaged = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, {
  timing: { ret5: -4, sma20Slope: -0.6, macdImproving: false },
})]);
expectClassification({ evidence: damaged }, 'Momentum Weakening');
for (const field of ['alpha20VsSpy', 'alpha60VsSpy']) {
  const weakRelative = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, {
    timing: { [field]: -1 },
  })]);
  const result = expectClassification({ evidence: weakRelative }, 'Momentum Weakening');
  assert.match(result.explanation, /SPY|relative strength/i);
}
const pullback = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, { timing: { ret5: -1 } })]);
assert.notEqual(run({ evidence: pullback }).classification, 'Momentum Weakening',
  'A negative five-session return with rising slope and positive relative strength alone is insufficient damage');

// Age alone cannot move a healthy holding between evidence classes.
for (const heldSessions of [1, 4, 5, 14, 29, 30, 45, 90]) {
  const result = run({ holding: position({ reviewRules: [rule({ heldSessions })] }) });
  assert.equal(result.classification, accelerating.classification, `${heldSessions} sessions cannot replace momentum evidence`);
  assert.equal(result.explanation, accelerating.explanation, 'Duration is mentioned only when an existing risk rule applies');
}

// Recorded risks override supportive momentum while preserving the independent action.
const pending = position({ action: 'Exit candidate', exits: [{ sleeve: 'base', shares: 100, reason: 'initial-stop' }] });
expectClassification({ holding: pending }, 'Exit Risk');
const noMarketPending = expectClassification({ holding: pending, evidence: null }, 'Exit Risk');
assert.equal(noMarketPending.status, 'partial');
assert.ok(noMarketPending.limitations.length > 0);
assert.match(noMarketPending.explanation, /missing|unavailable|not available/i);
for (const close of [85, 86, 88]) {
  const evidence = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, { close })]);
  assert.match(expectClassification({ evidence }, 'Exit Risk').explanation, /stop/i);
}
const clearOfStop = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, { close: 90 })]);
assert.notEqual(run({ evidence: clearOfStop }).classification, 'Exit Risk', 'A healthy close more than 3% above the recorded stop is not proximity risk');
const bandBoundaryHolding = position({ stops: [{ sleeve: 'base', shares: 100, price: 97 }] });
const atBand = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, { close: 100 })]);
expectClassification({ holding: bandBoundaryHolding, evidence: atBand }, 'Exit Risk');
const beyondBand = input([observation('2026-10-08', 3), observation(sourceSessionDate, 3, { close: 100.1 })]);
assert.notEqual(run({ holding: bandBoundaryHolding, evidence: beyondBand }).classification, 'Exit Risk',
  'The stop warning band is exactly 3% downside from the accepted close');

const earlyEvidence = input([observation('2026-10-08', 9), observation(sourceSessionDate, 10)]);
expectClassification({ holding: position({ reviewRules: [rule({ earlyStreak: 2 })] }), evidence: earlyEvidence }, 'Exit Risk');
assert.notEqual(run({ holding: position({ reviewRules: [rule({ earlyStreak: 1 })] }), evidence: earlyEvidence }).classification,
  'Exit Risk', 'Two remaining confirmations are not immediate early-exit proximity');
assert.notEqual(run({ holding: position({ reviewRules: [rule({ earlyStreak: 2, heldSessions: 4 })] }), evidence: earlyEvidence }).classification,
  'Exit Risk', 'The early momentum rule remains inactive before session five');
assert.notEqual(run({ holding: position({ reviewRules: [rule({ earlyStreak: 2, earlyThreshold: 12 })] }), evidence: earlyEvidence }).classification,
  'Exit Risk', 'Display risk uses the actual review rule threshold rather than inventing a new one');
assert.notEqual(run({ holding: position({ reviewRules: [rule({ earlyStreak: 2, earlyConfirmations: 4 })] }), evidence: earlyEvidence }).classification,
  'Exit Risk', 'Display proximity uses the actual review rule confirmation requirement');

const profitEvidence = input([observation('2026-10-08', 6), observation(sourceSessionDate, 7)]);
expectClassification({ holding: position({ reviewRules: [rule({ profitProtectionArmed: true, profitStreak: 1 })] }), evidence: profitEvidence }, 'Exit Risk');
for (const patch of [{ profitProtectionArmed: false }, { profitThreshold: 8 }, { profitConfirmations: 3 }, { heldSessions: 4 }]) {
  assert.notEqual(run({ holding: position({ reviewRules: [rule({ profitProtectionArmed: true, profitStreak: 1, ...patch })] }), evidence: profitEvidence }).classification,
    'Exit Risk', 'Profit protection proximity requires its armed, active, threshold and confirmation conditions');
}
expectClassification({ holding: position({ reviewRules: [rule({ heldSessions: 30 })] }), evidence: profitEvidence }, 'Exit Risk');
assert.notEqual(run({ holding: position({ reviewRules: [rule({ heldSessions: 30, exitBuffer: 8 })] }), evidence: profitEvidence }).classification,
  'Exit Risk', 'The mature risk review preserves its actual existing exit buffer');

// A missing or stale observation cannot manufacture zero returns, rank, or alpha.
const noIndicators = input([{
  date: sourceSessionDate, close: 110, priceAvg50: null, priceAvg200: null,
  ranks: { base: { rank: 3, eligible: true, eligibleCount: 100, source: 'authoritative-opportunities' } },
  timing: { available: true, asOf: sourceSessionDate, ret5: null, ret10: null,
    sma20Slope: null, macdImproving: null, alpha20VsSpy: null, alpha60VsSpy: null,
    relativeStrengthVerified: false },
}]);
const emptyTechnical = run({ evidence: noIndicators });
assert.equal(emptyTechnical.classification, null);
assert.ok(['partial', 'unavailable'].includes(emptyTechnical.status));
assert.ok(emptyTechnical.limitations.length > 0);
assert.doesNotMatch(emptyTechnical.explanation, /(?:return|alpha|slope)[^.;]*\b0(?:\.0+)?%/i,
  'Missing numbers are never explained as observed zeroes');
assert.equal(run({ evidence: null }).classification, null);
assert.equal(run({ evidence: null }).status, 'unavailable');
assert.equal(run({ evidence: { ...input(), sourceSessionDate: null }, source: null }).classification, null);
for (const evidence of [input([]), { ...input(), contract: 'unsupported' }]) {
  assert.equal(run({ evidence }).classification, null, 'Empty or unsupported input is explicit missing evidence');
}
const missingRelative = input();
Object.assign(missingRelative.observations.at(-1).timing,
  { alpha20VsSpy: null, alpha60VsSpy: null, relativeStrengthVerified: false });
const noRelative = run({ evidence: missingRelative });
assert.equal(bullish.has(noRelative.classification), false, 'Unverified relative strength cannot support a bullish classification');
assert.ok(noRelative.limitations.length > 0);
const oneRelativeHorizon = input();
oneRelativeHorizon.observations.at(-1).timing.alpha60VsSpy = null;
const oneHorizon = expectClassification({ evidence: oneRelativeHorizon }, 'Momentum Accelerating');
assert.equal(oneHorizon.status, 'partial');
assert.match(oneHorizon.explanation, /one.*relative.strength.*horizon/i,
  'Strengthening verified alpha20 can support acceleration while the missing second horizon is explicit');
const missingCurrentClose = input();
missingCurrentClose.observations.at(-1).close = null;
const noClose = run({ holding: position({ reviewRules: [rule({ close: 85 })] }), evidence: missingCurrentClose });
assert.notEqual(noClose.classification, 'Exit Risk',
  'A carried reviewRules close cannot replace a missing current accepted close for stop proximity');
assert.equal(noClose.status, 'partial');
assert.match(noClose.explanation, /closing price.*unavailable/i);
const noRank = input();
noRank.observations.at(-1).ranks = {};
const noRankResult = run({ evidence: noRank });
assert.equal(bullish.has(noRankResult.classification), false, 'Absence from the rank source does not become rank zero');
assert.ok(noRankResult.limitations.length > 0);
const outsidePool = input();
Object.assign(outsidePool.observations.at(-1).ranks.base, { rank: null, eligible: false });
const outsidePoolResult = expectClassification({ evidence: outsidePool }, 'Momentum Weakening');
assert.match(outsidePoolResult.explanation, /outside.*pool/i);
assert.doesNotMatch(outsidePoolResult.explanation, /rank\s*#?\s*0\b/i,
  'An authoritative out-of-pool result is explained as absence, never fabricated as rank zero');
expectClassification({ holding: position({ reviewRules: [rule({ heldSessions: 30 })] }), evidence: outsidePool }, 'Exit Risk');
const unverifiedRank = input();
unverifiedRank.observations.at(-1).ranks.base.source = 'private-held-comparison';
assert.equal(bullish.has(run({ evidence: unverifiedRank }).classification), false,
  'Private comparison ranks cannot replace the authoritative opportunity ranking');
const rejectedRank = input();
rejectedRank.observations.at(-1).ranks.base.verified = false;
for (const evidence of [noRank, unverifiedRank, rejectedRank]) {
  for (const reviewRule of [
    rule({ earlyStreak: 2 }),
    rule({ profitProtectionArmed: true, profitStreak: 1 }),
  ]) {
    const result = run({ holding: position({ reviewRules: [reviewRule] }), evidence });
    assert.notEqual(result.classification, 'Exit Risk',
      'Carried confirmation streaks cannot assert rank-exit proximity without a current authoritative verified rank');
    assert.ok(result.limitations.length > 0, 'Missing or rejected rank provenance remains explicit');
  }
  expectClassification({ holding: pending, evidence }, 'Exit Risk',
    'An actual queued exit remains risk even when current rank provenance is unavailable');
}
const changingPool = input();
changingPool.observations[0].ranks.base.eligibleCount = 80;
const changedPool = run({ evidence: changingPool });
assert.equal(changedPool.classification, 'Momentum Intact');
assert.equal(changedPool.status, 'partial');
assert.ok(changedPool.limitations.length > 0, 'Different pool sizes prevent a numeric improvement claim');
assert.match(changedPool.explanation, /pool|compar|trajectory/i);
const historyGap = input([observation('2026-10-07', 5), observation(sourceSessionDate, 3)]);
const interruptedHistory = expectClassification({ evidence: historyGap }, 'Momentum Intact');
assert.equal(interruptedHistory.status, 'partial');
assert.match(interruptedHistory.explanation, /trajectory.*unavailable|prior.*session/i,
  'A missing accepted session prevents a continuous rank trajectory claim');

for (const options of [
  { current: false },
  { source: '2026-10-12' },
  { evidence: { ...input(), sourceSessionDate: '2026-10-08' } },
  { evidence: input([observation('2026-10-08', 3)]) },
]) {
  const result = run(options);
  assert.equal(result.classification, null);
  assert.equal(result.status, 'stale');
  assert.match(result.explanation, /stale|dated|refresh|latest|session/i);
}
const stalePending = run({ current: false, holding: pending });
assert.equal(stalePending.classification, null, 'A stale analysis does not claim current momentum even when an exit was recorded');
assert.equal(stalePending.status, 'stale');
assert.match(stalePending.explanation, /exit|stop/i, 'The recorded pending exit still appears in the stale explanation');
const staleTiming = input();
staleTiming.observations.at(-1).timing.asOf = '2026-10-08';
const timingMismatch = run({ evidence: staleTiming });
assert.equal(bullish.has(timingMismatch.classification), false, 'Old timing does not support current momentum');
assert.ok(timingMismatch.limitations.length > 0);

// Classifiers are informational projections; inputs, trade rules, and actions stay independent.
const immutableHolding = deepFreeze(position());
const immutableInput = deepFreeze(input());
const saved = JSON.stringify({ immutableHolding, immutableInput });
expectClassification({ holding: immutableHolding, evidence: immutableInput }, 'Momentum Accelerating');
assert.equal(JSON.stringify({ immutableHolding, immutableInput }), saved);
for (const action of ['Hold', 'Add candidate', 'Exit candidate', 'Buy', 'Sell']) {
  const holding = position({ action });
  const before = JSON.stringify(holding);
  run({ holding });
  assert.equal(holding.action, action);
  assert.equal(JSON.stringify(holding), before, 'Evidence cannot mutate independent position actions or quantities');
}
equal({ minimumHold: frozen.base.rankedMinimumHoldSessions, exitBuffer: frozen.base.rankedExitBuffer,
  stop: frozen.base.minimumInitialStopPct, targetCount: frozen.base.rankedTargetCount },
{ minimumHold: 30, exitBuffer: 6, stop: 14, targetCount: 3 });
equal({ earlyStart: policy.earlyRankExitStartSessions, earlyEnd: policy.earlyRankExitEndSessions,
  earlyRank: policy.earlyRankExitThreshold, earlyConfirmations: policy.earlyRankExitConsecutiveSessions,
  profitActivation: policy.profitRankExitActivationPct, profitRank: policy.profitRankExitThreshold,
  profitConfirmations: policy.profitRankExitConsecutiveSessions },
{ earlyStart: 5, earlyEnd: 30, earlyRank: 9, earlyConfirmations: 3,
  profitActivation: 12, profitRank: 6, profitConfirmations: 2 });

const classifiedHolding = position({ momentumEvidence: accelerating });
const decision = { current: true, sourceSessionDate, positions: [classifiedHolding] };
const beforeAdapter = JSON.stringify({ classifiedHolding, decision });
const displayed = portfolioEvidence({ position: classifiedHolding, decision, now: new Date('2026-10-12T14:00:00Z') });
assert.equal(displayed.classification, 'Momentum Accelerating');
assert.equal(displayed.sourceSessionDate, sourceSessionDate);
assert.equal(JSON.stringify({ classifiedHolding, decision }), beforeAdapter);
const newlyQueuedHolding = position({ action: 'Exit candidate', momentumEvidence: accelerating,
  exits: [{ sleeve: 'base', shares: 100, reason: 'profit-rank-deterioration' }] });
const queuedBefore = JSON.stringify(newlyQueuedHolding);
const queuedDisplay = portfolioEvidence({ position: newlyQueuedHolding, decision, now: new Date('2026-10-12T14:00:00Z') });
assert.equal(queuedDisplay.classification, 'Exit Risk',
  'A later opening-plan exit overrides earlier serialized supportive evidence');
assert.match(queuedDisplay.explanation, /profit-rank-deterioration|profit.*protect/i);
assert.equal(JSON.stringify(newlyQueuedHolding), queuedBefore, 'Pending exit display cannot mutate saved evidence or position action');
assert.equal(newlyQueuedHolding.momentumEvidence.classification, 'Momentum Accelerating');
assert.equal(queuedDisplay.status, 'partial', 'New queued exits are reported without reusing an earlier position assessment');
assert.doesNotMatch(queuedDisplay.explanation, /MACD|rank trajectory/i,
  'A changed position with a queued exit reports current exit evidence rather than prior technical assessment');

// A same-session position change invalidates the saved risk assessment, even
// when the completed-session market source is still current.
for (const patch of [
  { shares: 90 }, { shares: 120 }, { avgCost: 101 },
  { stops: [{ sleeve: 'base', shares: 100, price: 90 }] },
  { reviewRules: [rule({ earlyStreak: 1 })] },
]) {
  const updated = position({ momentumEvidence: accelerating, ...patch });
  const before = JSON.stringify(updated);
  const result = portfolioEvidence({ position: updated, decision, now: new Date('2026-10-12T14:00:00Z') });
  assert.equal(result.classification, null, 'Changed shares, cost, stops or rule state need a new completed-session assessment');
  assert.equal(result.status, 'unavailable');
  assert.match(result.explanation, /risk evidence changed.*completed.session/i);
  assert.equal(JSON.stringify(updated), before, 'Invalidating stale position evidence does not mutate the position');
}
const unsigned = clone(accelerating);
delete unsigned.riskBasis;
const unsignedHolding = position({ momentumEvidence: unsigned });
const unsignedResult = portfolioEvidence({ position: unsignedHolding, decision, now: new Date('2026-10-12T14:00:00Z') });
assert.equal(unsignedResult.classification, null, 'Older serialized evidence without a position risk basis cannot be trusted');
assert.equal(unsignedResult.status, 'unavailable');
assert.match(unsignedResult.explanation, /risk evidence changed|risk basis/i);

// Exercise the real intraday projection on fixture-only filled orders. Selling
// one sleeve removes its exit/stop while retaining the earlier serialized view.
const sleeveHolding = position({
  stops: [{ sleeve: 'base', shares: 40, price: 109 }, { sleeve: 'cooldown15', shares: 60, price: 86 }],
  exits: [{ sleeve: 'base', shares: 40, reason: 'initial-stop' }],
  reviewRules: [rule(), rule({ sleeve: 'cooldown15' })],
});
const sleeveInput = input();
for (const row of sleeveInput.observations) row.ranks.cooldown15 = { ...row.ranks.base };
sleeveHolding.momentumEvidence = run({ holding: sleeveHolding, evidence: sleeveInput });
assert.equal(sleeveHolding.momentumEvidence.classification, 'Exit Risk');
const sleeveDecision = { ...decision, contract: 'c1-account-decision-v1', decisionId: 'fixture:1', positions: [sleeveHolding] };
const activity = {
  plan: {
    contract: 'c1-actual-account-opening-plan-v1', sourceSessionDate, date: '2026-10-12',
    openingBooks: {
      base: { cash: 0, positions: { AAA: { shares: 40, avgCost: 100, openedAt: sleeveHolding.openedAt } } },
      cooldown15: { cash: 0, positions: { AAA: { shares: 60, avgCost: 100, openedAt: sleeveHolding.openedAt } } },
      sector40: { cash: 0, positions: {} },
    },
    orders: [{ id: 'fixture-base-exit', sleeve: 'base', symbol: 'AAA', side: 'sell', shares: 40, reason: 'initial-stop' }],
  },
  fills: [{ id: 'fixture-filled-base', orderId: 'fixture-base-exit', symbol: 'AAA', side: 'sell', shares: 40,
    price: 110, fee: 0, executedAt: '2026-10-12T13:45:00Z' }],
};
const overlayBefore = JSON.stringify({ sleeveDecision, activity });
const overlay = c1IntradayDecision({ decision: sleeveDecision, activity, revision: 2, now: new Date('2026-10-12T14:00:00Z') });
const remainingHolding = overlay.positions[0];
assert.equal(remainingHolding.shares, 60);
assert.equal(remainingHolding.action, 'Hold');
assert.equal(remainingHolding.exits.length, 0);
assert.equal(remainingHolding.stops.length, 1);
assert.equal(remainingHolding.stops[0].sleeve, 'cooldown15');
const remainingEvidence = portfolioEvidence({ position: remainingHolding, decision: overlay, now: new Date('2026-10-12T14:00:00Z') });
assert.equal(remainingEvidence.classification, null, 'An exited sleeve cannot leave Exit Risk on the surviving position');
assert.equal(remainingEvidence.status, 'unavailable');
assert.doesNotMatch(remainingEvidence.explanation, /initial-stop|\$109/);
assert.equal(remainingHolding.momentumEvidence.classification, 'Exit Risk', 'The prior saved evidence is invalidated through projection, not mutated');
assert.equal(JSON.stringify({ sleeveDecision, activity }), overlayBefore, 'Intraday fixtures preserve their source records');

const bothQueued = clone(sleeveHolding);
bothQueued.exits.push({ sleeve: 'cooldown15', shares: 60, reason: 'universe-removal' });
bothQueued.momentumEvidence = run({ holding: bothQueued, evidence: sleeveInput });
const stillQueuedDecision = c1IntradayDecision({ decision: { ...sleeveDecision, positions: [bothQueued] },
  activity, revision: 2, now: new Date('2026-10-12T14:00:00Z') });
const stillQueued = portfolioEvidence({ position: stillQueuedDecision.positions[0], decision: stillQueuedDecision,
  now: new Date('2026-10-12T14:00:00Z') });
assert.equal(stillQueued.classification, 'Exit Risk');
assert.equal(stillQueued.status, 'partial');
assert.match(stillQueued.explanation, /universe-removal/);
assert.doesNotMatch(stillQueued.explanation, /initial-stop|\$109|MACD|rank trajectory/i,
  'Only the still-queued sleeve exit is reported after an earlier sleeve sale');
for (const extra of [
  { decision: { ...decision, current: false }, now: new Date('2026-10-12T14:00:00Z') },
  { decision, now: new Date('2026-10-13T14:00:00Z') },
  { decision: { ...decision, sourceSessionDate: '2026-10-12' }, now: new Date('2026-10-13T14:00:00Z') },
]) {
  const result = portfolioEvidence({ position: classifiedHolding, ...extra });
  assert.equal(result.classification, null);
  assert.equal(result.status, 'stale', 'Cached evidence must match both current decision and completed market session');
}
assert.equal(portfolioEvidence({ position: position(), decision, now: new Date('2026-10-12T14:00:00Z') }).classification, null);
assert.equal(portfolioEvidence({ position: null, decision, now: new Date('2026-10-12T14:00:00Z') }).status, 'unavailable');

console.log('PASS: C1 momentum evidence classifies actual rank/price/relative strength and recorded risk; age alone has no effect; missing/stale/private/incomparable evidence stays explicit; actions, inputs, stops, sizing and existing momentum protection remain unchanged.');
