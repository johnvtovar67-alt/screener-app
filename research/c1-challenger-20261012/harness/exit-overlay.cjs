'use strict';

// Pure, research-only overlays for the pinned account-policy simulator. This
// module neither reads nor writes application source, account state or data.
const FAMILY_KEYS = Object.freeze({
  ordinary_confirmation: [],
  ordinary_hysteresis: ['rankedExitBuffer'],
  early_confirmation: ['earlyRankExitConsecutiveSessions'],
  early_rank: ['earlyRankExitThreshold'],
  profit_activation: ['profitRankExitActivationPct'],
  profit_confirmation: ['profitRankExitConsecutiveSessions'],
  large_gain_deterioration: [
    'profitRankExitActivationPct', 'profitRankExitThreshold',
    'profitRankExitConsecutiveSessions',
  ],
});
const POLICY_DEFAULTS = Object.freeze({
  earlyRankExitStartSessions: 5,
  earlyRankExitEndSessions: 30,
  earlyRankExitThreshold: 9,
  earlyRankExitConsecutiveSessions: 3,
  profitRankExitStartSessions: 5,
  profitRankExitEndSessions: 30,
  profitRankExitActivationPct: 12,
  profitRankExitThreshold: 6,
  profitRankExitConsecutiveSessions: 2,
});
const ORDINARY_NEEDLE = `          if (
            heldSessions >= config.rankedMinimumHoldSessions &&
            holdingRankVerified && holdingRank > rankedExitBuffer
          )
            rankExitSymbols.add(symbol);`;
const COUNTER = 'researchOrdinaryRankExitStreak';

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Exit overlay requires object: ' + label);
  }
  return value;
}
function onlyKeys(value, allowed, label) {
  plainObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error('Unsupported exit overlay key: ' + label + '.' + key);
  }
}
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Positive integer required: ' + label);
}
function transformOnce(source, needle, replacement, label) {
  if (typeof source !== 'string') throw new Error('Exit source must be text');
  if (source.split(needle).length !== 2) throw new Error('Pinned exit source seam changed: ' + label);
  return source.replace(needle, replacement);
}

function identityOverlay(experiment, supported = false) {
  return {
    transform: (_relativePath, source) => source,
    optionPatches: {},
    metadata: {
      contract: 'c1-source-pinned-exit-overlay-v1',
      experimentId: experiment.id || null,
      family: experiment.family || null,
      supported, active: false, sourceExpressionsChanged: false,
      newPositionStateFields: [], historicalPerformanceClaim: false,
      productionChange: false,
    },
  };
}

function buildExitOverlay(experiment) {
  plainObject(experiment, 'experiment');
  if (experiment.family === 'champion') return identityOverlay(experiment, true);
  if (!Object.hasOwn(FAMILY_KEYS, experiment.family)) return identityOverlay(experiment);

  const sourceOverrides = experiment.sourceOverrides || {};
  const researchOverrides = experiment.researchOverrides || {};
  onlyKeys(sourceOverrides, [
    'C1_ACCOUNT_MOMENTUM_EXIT_POLICY', 'C1_FROZEN_OPTIONS_all_sleeves',
  ], 'sourceOverrides');
  const policy = { ...(sourceOverrides.C1_ACCOUNT_MOMENTUM_EXIT_POLICY || {}) };
  const frozen = { ...(sourceOverrides.C1_FROZEN_OPTIONS_all_sleeves || {}) };
  const family = experiment.family;

  if (family === 'ordinary_confirmation') {
    onlyKeys(sourceOverrides, [], 'sourceOverrides');
    onlyKeys(researchOverrides, ['ordinaryRankExit'], 'researchOverrides');
    const ordinary = plainObject(researchOverrides.ordinaryRankExit, 'ordinaryRankExit');
    onlyKeys(ordinary, ['minimumAgeSessions', 'rankThreshold', 'consecutiveCompletedSessions'], 'ordinaryRankExit');
    if (ordinary.minimumAgeSessions !== 30 || ordinary.rankThreshold !== 6) {
      throw new Error('Ordinary confirmation must preserve age30 and Top6');
    }
    const confirmations = ordinary.consecutiveCompletedSessions;
    positiveInteger(confirmations, 'ordinary consecutiveCompletedSessions');
    if (confirmations > 3) throw new Error('Ordinary confirmation exceeds frozen coarse matrix');
    if (confirmations === 1) return identityOverlay(experiment, true);
    const replacement = `          // Research-only confirmation of the existing ordinary rank exit.
          // Hard stops, universe removal and sleeve risk controls execute on
          // their unchanged source path. This counter lives in the source
          // position object, so checkpoint/resume preserves completed sessions.
          const researchOrdinaryRuleActive =
            heldSessions >= config.rankedMinimumHoldSessions &&
            holdingRankVerified && holdingRank > rankedExitBuffer;
          position.${COUNTER} = researchOrdinaryRuleActive
            ? number(position.${COUNTER}, 0) + 1
            : 0;
          if (position.${COUNTER} >= ${confirmations})
            rankExitSymbols.add(symbol);`;
    return {
      transform(relativePath, source) {
        if (relativePath !== 'lib/c1AccountSimulator.js') return source;
        return transformOnce(source, ORDINARY_NEEDLE, replacement, 'ordinary-rank-confirmation');
      },
      optionPatches: {},
      metadata: {
        contract: 'c1-source-pinned-exit-overlay-v1', experimentId: experiment.id || null,
        family, supported: true, active: true, sourceExpressionsChanged: true,
        ordinaryMinimumAgeSessions: 30, ordinaryRankThreshold: 6,
        consecutiveCompletedSessions: confirmations,
        newPositionStateFields: [COUNTER],
        counterReset: 'zero when ordinary age/rank condition is false on a completed source rank-rebalance session',
        transformedFiles: ['lib/c1AccountSimulator.js'],
        exactNeedle: 'ordinary-rank-confirmation',
        preservedControls: ['hard_stops', 'universe_removal', 'sleeve_breakers', 'cooldowns', 'early_profit_exits', 'source_pending_exit_precedence'],
        historicalPerformanceClaim: false, productionChange: false,
      },
    };
  }

  onlyKeys(researchOverrides, [], 'researchOverrides');
  if (family === 'ordinary_hysteresis') {
    onlyKeys(sourceOverrides, ['C1_FROZEN_OPTIONS_all_sleeves'], 'sourceOverrides');
    onlyKeys(frozen, FAMILY_KEYS[family], 'C1_FROZEN_OPTIONS_all_sleeves');
    positiveInteger(frozen.rankedExitBuffer, 'rankedExitBuffer');
    if (![6, 8, 10].includes(frozen.rankedExitBuffer)) throw new Error('Ordinary hysteresis is outside the frozen matrix');
  } else {
    onlyKeys(sourceOverrides, ['C1_ACCOUNT_MOMENTUM_EXIT_POLICY'], 'sourceOverrides');
    onlyKeys(policy, FAMILY_KEYS[family], 'C1_ACCOUNT_MOMENTUM_EXIT_POLICY');
    for (const [key, value] of Object.entries(policy)) {
      if (key.endsWith('Pct')) {
        if (!Number.isFinite(value) || value <= 0 || value >= 100) throw new Error('Invalid profit activation percentage');
      } else positiveInteger(value, key);
    }
    const grids = {
      early_confirmation: { earlyRankExitConsecutiveSessions: [3, 4, 5] },
      early_rank: { earlyRankExitThreshold: [9, 12, 15] },
      profit_activation: { profitRankExitActivationPct: [12, 15, 20] },
      profit_confirmation: { profitRankExitConsecutiveSessions: [2, 3, 4] },
      large_gain_deterioration: {
        profitRankExitActivationPct: [20, 25, 30],
        profitRankExitThreshold: [9], profitRankExitConsecutiveSessions: [2],
      },
    };
    for (const [key, values] of Object.entries(grids[family])) {
      if (!values.includes(policy[key])) throw new Error('Exit policy is outside frozen matrix: ' + key);
    }
  }
  const changed = Object.entries(policy).some(([key, value]) => value !== POLICY_DEFAULTS[key]) ||
    Object.entries(frozen).some(([key, value]) => key !== 'rankedExitBuffer' || value !== 6);
  if (!changed) return identityOverlay(experiment, true);
  const optionPatches = {};
  if (Object.keys(policy).length) optionPatches.C1_ACCOUNT_MOMENTUM_EXIT_POLICY = policy;
  if (Object.keys(frozen).length) optionPatches.C1_FROZEN_OPTIONS_all_sleeves = frozen;
  return {
    transform: (_relativePath, source) => source,
    optionPatches,
    metadata: {
      contract: 'c1-source-pinned-exit-overlay-v1', experimentId: experiment.id || null,
      family, supported: true, active: true, sourceExpressionsChanged: false,
      newPositionStateFields: [], policyPatch: policy, frozenOptionsPatch: frozen,
      sourceCountersRetained: ['earlyRankExitStreak', 'profitRankExitStreak'],
      sourceAgeBoundsRetained: 'early/profit ages5–29; ordinary age30+',
      sourcePendingExitPrecedenceRetained: true,
      preservedControls: ['hard_stops', 'universe_removal', 'sleeve_breakers', 'cooldowns', 'source_confirmation_reset_semantics'],
      largeGainSubsetOfCurrentProfitRule: family === 'large_gain_deterioration',
      historicalPerformanceClaim: false, productionChange: false,
    },
  };
}

module.exports = { buildExitOverlay, FAMILY_KEYS, POLICY_DEFAULTS, ORDINARY_NEEDLE, COUNTER };
