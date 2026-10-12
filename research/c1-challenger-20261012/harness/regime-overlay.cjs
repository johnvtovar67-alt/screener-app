// Research-only causal entry-capacity overlay. Original licensed rows and
// immutable production/audit source snapshots are never edited.
const crypto = require('node:crypto');
const SIDECAR = 'researchNewExposureScaling';
const CONTRACT = 'c1-preregistered-causal-entry-capacity-v1';
const DRAW = 'prior_close_SPY_trailing252_high_drawdown_abs_pct';
const VOL = 'prior_close_SPY_20_return_sample_vol_annualized_pct';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function definition(experiment) {
  if (!experiment || !['scale_drawdown', 'scale_volatility'].includes(experiment.family)) throw new Error('Regime overlay requires a preregistered scaling family');
  const value = experiment.researchOverrides?.newExposureScaling;
  const allowed = ['observable', 'triggerAtOrAbovePct', 'restoreBelowPct', 'restoreConsecutiveCompletedSessions', 'activeNewCapitalMultiplier', 'normalNewCapitalMultiplier', 'heldPositionAction', 'excessHeldExposureAction', 'combinedTrigger'];
  if (!value || Object.keys(value).some(key => !allowed.includes(key)) || Object.keys(experiment.sourceOverrides || {}).length || Object.keys(experiment.researchOverrides || {}).some(key => key !== 'newExposureScaling')) throw new Error('Unsupported additional regime/option change');
  const expected = experiment.family === 'scale_drawdown' ? DRAW : VOL;
  if (value.observable !== expected || !Number.isFinite(value.triggerAtOrAbovePct) || !Number.isFinite(value.restoreBelowPct) || value.restoreBelowPct <= 0 || value.restoreBelowPct >= value.triggerAtOrAbovePct || value.restoreConsecutiveCompletedSessions !== 5 || value.activeNewCapitalMultiplier !== .5 || value.normalNewCapitalMultiplier !== 1 || value.heldPositionAction !== 'none' || value.excessHeldExposureAction !== 'pause_additions' || value.combinedTrigger !== false) throw new Error('Invalid preregistered regime specification');
  const pairs = experiment.family === 'scale_drawdown' ? [[8, 5], [10, 7], [12, 9]] : [[20, 15], [25, 20], [30, 25]];
  if (!pairs.some(([trigger, restore]) => trigger === value.triggerAtOrAbovePct && restore === value.restoreBelowPct)) throw new Error('Regime thresholds must match one preregistered coarse pair');
  return { ...value, experimentId: experiment.id, family: experiment.family };
}

// Inputs are original adjusted SPY closes in consecutive market-session rows.
// Volatility uses20 SIMPLE close returns, sample denominator19, sqrt252.
function observableAt(closes, priorIndex, observable) {
  if (observable === DRAW) {
    if (priorIndex < 251) throw new Error('Drawdown requires252 completed SPY closes before an entry session');
    const window = closes.slice(priorIndex - 251, priorIndex + 1);
    const high = Math.max(...window);
    return Math.max(0, (high - closes[priorIndex]) / high * 100);
  }
  if (observable === VOL) {
    if (priorIndex < 20) throw new Error('Realized volatility requires21 completed SPY closes before an entry session');
    const returns = [];
    for (let index = priorIndex - 19; index <= priorIndex; index++) returns.push(closes[index] / closes[index - 1] - 1);
    const mean = returns.reduce((sum, value) => sum + value, 0) / 20;
    const sampleVariance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 19;
    return Math.sqrt(sampleVariance * 252) * 100;
  }
  throw new Error('Unsupported regime observable');
}

function stepRegime(previous, value, specification) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Complete finite prior-session regime observation required');
  const policy = definition({ id: specification.experimentId || 'synthetic', family: specification.family, sourceOverrides: {}, researchOverrides: { newExposureScaling: Object.fromEntries(Object.entries(specification).filter(([key]) => !['experimentId', 'family'].includes(key))) } });
  let active = previous?.active === true;
  let restoreCount = active ? previous.restoreCount || 0 : 0;
  let transition = 'unchanged';
  if (!active && value >= policy.triggerAtOrAbovePct) { active = true; restoreCount = 0; transition = 'activated'; }
  else if (active) {
    restoreCount = value < policy.restoreBelowPct ? restoreCount + 1 : 0;
    if (restoreCount >= policy.restoreConsecutiveCompletedSessions) { active = false; restoreCount = 0; transition = 'restored'; }
  }
  return { active, restoreCount, transition, multiplier: active ? policy.activeNewCapitalMultiplier : policy.normalNewCapitalMultiplier };
}

function once(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error('Pinned regime source seam changed: ' + label);
  return source.replace(needle, replacement);
}

function buildRegimeOverlay(experiment) {
  const specification = definition(experiment);
  return {
    optionPatches: {},
    metadata: {
      contract: CONTRACT, supported: true, active: true, sourceExpressionsChanged: true, experimentId: experiment.id, family: experiment.family, specification,
      priorCompletedSessionOnly: true, observationStateOutsideSourceCache: true,
      stateInitialization: 'Normal before the exact policy-adoption session; earlier original archive/warmup rows supply closes only.',
      capacityConvention: 'min(source-approved budget, equity*original target*multiplier-existing position value, equity*original total target capacity*multiplier-all held open value). Original total capacity is min(1,sum target weights), or min(1,max(buyTargetPct,strongBuyTargetPct)*rankedTargetCount).',
      sourceRankingChanged: false, heldPositionAction: 'none', hardControlsChanged: false,
      historicalPerformanceClaim: false, productionChange: false,
    },
    transform(relativePath, source) {
      if (relativePath === 'lib/c1AccountProjection.js') {
        const needle = '  const session={date:opening.date,decisionAt:now.toISOString(),prices:[...prices.values()],signals:[],universeSymbols:opening.universeSymbols,corporateActions:clone(opening.corporateActions),...(opening.entryRecheck?{accountEntryBlocks:clone(opening.entryRecheck.blocks)}:{})};';
        const replacement = needle.replace('corporateActions:clone(opening.corporateActions),', `corporateActions:clone(opening.corporateActions),${SIDECAR}:opening.${SIDECAR},`);
        return once(source, needle, replacement, 'projection-carries-causal-scalar');
      }
      if (relativePath !== 'lib/c1AccountSimulator.js') return source;
      // Keep the original share floor, adverse-price cost, cash, affordability,
      // contribution/sector/issuer/risk gates and actual sleeve mapping intact.
      const needle = '        const plannedShares=Math.min(Math.floor(Math.max(0,budget)/fill),completion&&Number.isFinite(existing.entryTargetShares)?Math.max(0,existing.entryTargetShares-existing.shares):Infinity);';
      const implementation = `        const __researchScaling=session.${SIDECAR};
        if(!__researchScaling || __researchScaling.contract!==${JSON.stringify(CONTRACT)} || __researchScaling.experimentId!==${JSON.stringify(experiment.id)} || !__researchScaling.observationDate || __researchScaling.observationDate>=session.date || ![.5,1].includes(__researchScaling.multiplier))throw new Error('Verified prior-session research exposure scalar required');
        if(__researchScaling.multiplier<1){
          const __researchHeldOpenValue=[...positions.values()].reduce((sum,position)=>sum+position.shares*number(prices.get(position.symbol)?.open,position.lastPrice),0);
          const __researchTotalTarget=Array.isArray(config.rankedTargetWeights)?config.rankedTargetWeights.reduce((sum,value)=>sum+Math.max(0,number(value)),0):Math.max(config.buyTargetPct,config.strongBuyTargetPct)*Math.max(1,number(config.rankedTargetCount,config.maxPositions));
          const __researchCapacityRoom=Math.max(0,currentEquity*Math.min(1,__researchTotalTarget)*__researchScaling.multiplier-__researchHeldOpenValue);
          const __researchTargetRoom=Math.max(0,currentEquity*targetPct*__researchScaling.multiplier-existingValue);
          budget=Math.min(budget,__researchTargetRoom,__researchCapacityRoom);
        }
`;
      return once(source, needle, implementation + needle, 'new-entry-budget-before-original-share-floor');
    },
  };
}

// Separate derived research input; row-level values must stay private whenever
// source prices are proprietary. This function never edits original dataset,
// warmup, prices, signals, corporate actions, metadata or input-integrity fields.
function applyRegimeInputs(dataset, experiment, { benchmarkWarmupSessions = [], calendar, policyStartDate = dataset?.sessions?.[0]?.date } = {}) {
  const specification = definition(experiment);
  if (!Array.isArray(dataset?.sessions) || !dataset.sessions.length || !Array.isArray(benchmarkWarmupSessions)) throw new Error('Ordered source sessions and explicit original benchmark warmup required');
  // Never silently redefine20/252 trading-session windows through missing rows.
  if (!calendar || typeof calendar.isUsMarketSessionDay !== 'function' || typeof calendar.marketSessionDistance !== 'function') throw new Error('Pinned source market-session calendar required');
  const rows = [...benchmarkWarmupSessions, ...dataset.sessions];
  const policyStartIndex = dataset.sessions.findIndex(session => session.date === policyStartDate);
  if (policyStartIndex < 0) throw new Error('Exact policy adoption session missing from original dataset');
  const closes = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || (index && row.date <= rows[index - 1].date)) throw new Error('Original benchmark rows must be uniquely ordered, with warmup strictly before replay sessions');
    if (!calendar.isUsMarketSessionDay(row.date) || (index && calendar.marketSessionDistance(rows[index - 1].date, row.date) !== 1)) throw new Error('Missing/nonmarket original SPY session');
    if (Object.hasOwn(row, SIDECAR)) throw new Error('Regime sidecar already present; original inputs required');
    const benchmark = (row.prices || []).filter(price => price.symbol === 'SPY');
    if (benchmark.length !== 1 || benchmark[0].adjusted !== true || !Number.isFinite(benchmark[0].close) || benchmark[0].close <= 0) throw new Error('One original adjusted positive SPY close required per session');
    closes.push(benchmark[0].close);
  }
  const minimum = specification.observable === DRAW ? 252 : 21;
  const effectiveWarmupCount = benchmarkWarmupSessions.length + policyStartIndex;
  if (effectiveWarmupCount < minimum) throw new Error('Complete original SPY warmup required: ' + minimum + ' sessions before policy adoption');
  const historySha256 = digest(JSON.stringify(rows.map((row, index) => [row.date, closes[index]])));
  let state = { active: false, restoreCount: 0 };
  const derived = [];
  const sessions = dataset.sessions.map((session, index) => {
    if (index < policyStartIndex) return session;
    const priorIndex = benchmarkWarmupSessions.length + index - 1;
    const observedValuePct = observableAt(closes, priorIndex, specification.observable);
    state = stepRegime(state, observedValuePct, specification);
    const sidecar = { contract: CONTRACT, experimentId: experiment.id, observationDate: rows[priorIndex].date, observable: specification.observable, observedValuePct, ...state };
    derived.push({ date: session.date, ...sidecar });
    return { ...session, [SIDECAR]: sidecar };
  });
  return {
    dataset: { ...dataset, sessions },
    researchInputs: {
      contract: CONTRACT, experimentId: experiment.id, specification,
      benchmarkHistorySha256: historySha256, benchmarkWarmupSessions: effectiveWarmupCount,
      externalBenchmarkWarmupSessions: benchmarkWarmupSessions.length,
      archivedDatasetWarmupSessions: policyStartIndex, policyStartDate,
      sourceInputPreserved: true, priorCompletedSessionOnly: true, derived,
      derivedSha256: digest(JSON.stringify(derived)), privateWhenSourceDataPrivate: true,
      alphaClaimEligible: false,
    },
  };
}

module.exports = { buildRegimeOverlay, applyRegimeInputs, observableAt, stepRegime, definition, CONTRACT, SIDECAR, DRAW, VOL };
