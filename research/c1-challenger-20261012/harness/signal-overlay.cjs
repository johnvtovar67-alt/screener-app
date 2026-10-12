// Research-only in-memory edits of the exact pinned compiler. No copied factor
// formula, percentile function, eligibility filter or historical replay walker.
const crypto = require('node:crypto');
const COMPILER_PATH = 'lib/historicalSignalEvaluator.js';
const COMPILER_SHA256 = 'e782d935b1ead9e2634938602961f56fa5191fb4728c16f5ba93aa98d072e7f5';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const SOURCE_WEIGHTS = Object.freeze({ globalSlow: 0.4, globalFast: 0.25, sectorSlow: 0.22, sectorFast: 0.13 });
const SOURCE_HORIZONS = Object.freeze({
  slow: Object.freeze({ totalLookbackSessions: 120, excludeRecentSessions: 20, includedReturnSessions: 100 }),
  fast: Object.freeze({ totalLookbackSessions: 60, excludeRecentSessions: 5, includedReturnSessions: 55 }),
});
const WEIGHT_KEYS = Object.keys(SOURCE_WEIGHTS);
const HORIZON_KEYS = ['totalLookbackSessions', 'excludeRecentSessions', 'includedReturnSessions'];
const SLOW_ALIAS = 'researchMomentumSlowReturn';
const FAST_ALIAS = 'researchMomentumFastReturn';
const MOMENTUM_BLOCK = [
  '    const momentumPercentile = weightedScore([',
  '      [rank("return120Ex20"), 0.4],',
  '      [rank("return60Ex5"), 0.25],',
  '      [rank("return120Ex20", { sector: true }), 0.22],',
  '      [rank("return60Ex5", { sector: true }), 0.13],',
  '    ], null);',
].join('\n');
function once(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error('Pinned signal seam changed: ' + label);
  return source.replace(needle, replacement);
}
function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported ' + label);
}
function horizon(value, label) {
  exactKeys(value, HORIZON_KEYS, label + ' horizon');
  if (!HORIZON_KEYS.every(key => Number.isSafeInteger(value[key])) ||
      value.totalLookbackSessions < 1 || value.totalLookbackSessions > 252 ||
      value.excludeRecentSessions < 0 || value.includedReturnSessions < 1 ||
      value.includedReturnSessions + value.excludeRecentSessions !== value.totalLookbackSessions)
    throw new Error('Horizon must satisfy included = total - excluded within source253 history');
  return { ...value };
}
const close = (a, b) => Math.abs(a - b) < 1e-12;
function weights(value, family, research) {
  exactKeys(value, WEIGHT_KEYS, 'momentum weights');
  if (!WEIGHT_KEYS.every(key => Number.isFinite(value[key]) && value[key] > 0) ||
      !close(WEIGHT_KEYS.reduce((sum, key) => sum + value[key], 0), 1))
    throw new Error('Exactly four positive momentum weights summing to one required');
  const global = value.globalSlow + value.globalFast;
  const sector = value.sectorSlow + value.sectorFast;
  if (family === 'global_sector' &&
      (!close(value.globalSlow / global, 0.4 / 0.65) ||
       !close(value.sectorSlow / sector, 0.22 / 0.35)))
    throw new Error('Global/sector variant must preserve both distinct source slow/fast ratios');
  if (family === 'slow_fast') {
    const delta = research.aggregateSlowFraction - 0.62;
    if (!Number.isFinite(delta) || !close(global, 0.65) || !close(sector, 0.35) ||
        !close(value.globalSlow / global, 0.4 / 0.65 + delta) ||
        !close(value.sectorSlow / sector, 0.22 / 0.35 + delta) ||
        !close(value.globalSlow + value.sectorSlow, research.aggregateSlowFraction))
      throw new Error('Slow/fast variant must apply the same shift to distinct source slow ratios');
  }
  return { ...value };
}
function buildSignalOverlay(experiment) {
  if (!experiment || !['champion', 'horizon', 'global_sector', 'slow_fast'].includes(experiment.family))
    throw new Error('Not a signal-family experiment');
  if (Object.keys(experiment.sourceOverrides || {}).length) throw new Error('Signal overlay cannot alter source options');
  const research = experiment.researchOverrides || {};
  const allowed = experiment.family === 'champion' ? [] : experiment.family === 'horizon'
    ? ['momentumHorizons'] : experiment.family === 'global_sector'
      ? ['momentumWeights'] : ['momentumWeights', 'aggregateSlowFraction', 'method'];
  exactKeys(research, allowed, 'signal research overrides');
  const selectedHorizons = experiment.family === 'horizon' ? (() => {
    exactKeys(research.momentumHorizons, ['slow', 'fast'], 'momentum horizons');
    return { slow: horizon(research.momentumHorizons.slow, 'slow'), fast: horizon(research.momentumHorizons.fast, 'fast') };
  })() : SOURCE_HORIZONS;
  const selectedWeights = ['global_sector', 'slow_fast'].includes(experiment.family)
    ? weights(research.momentumWeights, experiment.family, research) : SOURCE_WEIGHTS;
  // Champion values preserve every source byte and output field. This also
  // provides an explicit synthetic control for each independent compiler seam.
  const horizonsChanged = ['slow', 'fast'].some(component => HORIZON_KEYS.some(key =>
    selectedHorizons[component][key] !== SOURCE_HORIZONS[component][key]));
  const weightsChanged = WEIGHT_KEYS.some(key => selectedWeights[key] !== SOURCE_WEIGHTS[key]);
  const changed = horizonsChanged || weightsChanged;
  function transform(relativePath, source) {
    if (relativePath !== COMPILER_PATH) return source;
    if (sha256(source) !== COMPILER_SHA256) throw new Error('Pinned historical compiler hash mismatch');
    if (!changed) return source;
    const slowField = horizonsChanged ? SLOW_ALIAS : 'return120Ex20';
    const fastField = horizonsChanged ? FAST_ALIAS : 'return60Ex5';
    source = once(source, MOMENTUM_BLOCK, [
      '    const momentumPercentile = weightedScore([',
      `      [rank("${slowField}"), ${selectedWeights.globalSlow}],`,
      `      [rank("${fastField}"), ${selectedWeights.globalFast}],`,
      `      [rank("${slowField}", { sector: true }), ${selectedWeights.sectorSlow}],`,
      `      [rank("${fastField}", { sector: true }), ${selectedWeights.sectorFast}],`,
      '    ], null);',
    ].join('\n'), 'four-way momentum blend');
    if (horizonsChanged) {
      // Separate aliases retain the fixed original return fields used by other
      // compiler theses, factorCoverage, scoreHistoricalQuote and diagnostics.
      source = once(source, '    "return120Ex20",\n    "return200Ex20",',
        `    "return120Ex20",\n    "${SLOW_ALIAS}",\n    "${FAST_ALIAS}",\n    "return200Ex20",`, 'rank-field aliases');
      const needle = '    return120Ex20: trailingReturn(closes, 100, 20),';
      source = once(source, needle, [needle,
        `    ${SLOW_ALIAS}: trailingReturn(closes, ${selectedHorizons.slow.includedReturnSessions}, ${selectedHorizons.slow.excludeRecentSessions}),`,
        `    ${FAST_ALIAS}: trailingReturn(closes, ${selectedHorizons.fast.includedReturnSessions}, ${selectedHorizons.fast.excludeRecentSessions}),`,
      ].join('\n'), 'source trailing-return calls');
    }
    return source;
  }
  return { transform, optionPatches: {}, metadata: {
    contract: 'c1-preregistered-signal-source-overlay-v1', experimentId: experiment.id,
    family: experiment.family, sourceCompilerPath: COMPILER_PATH, sourceCompilerSha256: COMPILER_SHA256,
    supported: true, active: changed, sourceExpressionsChanged: changed,
    changed, noOp: !changed, momentumHorizons: selectedHorizons, momentumWeights: selectedWeights,
    minimumHistoryRows: 253, crossSectionalPool: 'unchanged full source positionQuotes before entry eligibility and shortlist',
    percentileTiesAndMissingValues: 'unchanged actual source percentileMap and weightedScore',
    horizonAliases: horizonsChanged ? { slow: SLOW_ALIAS, fast: FAST_ALIAS } : null,
    originalReturnAndNonMomentumInputsPreserved: true,
    mechanicallyChangedDerivedFields: changed ? ['momentumPercentile', 'compositeScore', 'globalCompositePercentile', 'sectorCompositePercentile'] : [],
    historicalPerformanceClaim: false, productionChange: false,
  } };
}
module.exports = { buildSignalOverlay, COMPILER_PATH, COMPILER_SHA256, SOURCE_WEIGHTS, SOURCE_HORIZONS };
