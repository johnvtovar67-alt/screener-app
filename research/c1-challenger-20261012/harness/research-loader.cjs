'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyBaseline } = require('../baselines/selection.cjs');
const { resolveExperiment, FAMILIES: OPTION_FAMILIES, SLEEVES } = require('../mechanics/options-loader.cjs');
const { createSourceTransformLoader } = require('./source-transform-loader.cjs');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(PROGRAM_ROOT, 'experiments.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const EXIT_FAMILIES = ['ordinary_confirmation','ordinary_hysteresis','early_confirmation','early_rank','profit_activation','profit_confirmation','large_gain_deterioration'];
const SIGNAL_FAMILIES = ['horizon','global_sector','slow_fast'];
const REGIME_FAMILIES = ['scale_drawdown','scale_volatility'];

function readExperiment(id, manifestPath = MANIFEST_PATH) {
  const bytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(bytes);
  const experiment = manifest.experiments.find(item => item.id === id);
  if (!experiment) throw new Error('Unknown frozen experiment: ' + id);
  return { experiment, manifestSha256: sha256(bytes) };
}
function overlayFor(experiment, manifestPath) {
  if (Object.hasOwn(OPTION_FAMILIES, experiment.family)) {
    const definition = resolveExperiment(experiment.id, manifestPath);
    return { transform: (_file, source) => source,
      optionPatches: { C1_FROZEN_OPTIONS_by_sleeve: definition.overrides },
      metadata: { family: experiment.family, supported: true, active: experiment.family !== 'champion',
        sourceExpressionsChanged: false }, files: ['../mechanics/options-loader.cjs'] };
  }
  const moduleName = EXIT_FAMILIES.includes(experiment.family) ? './exit-overlay.cjs'
    : SIGNAL_FAMILIES.includes(experiment.family) ? './signal-overlay.cjs'
    : REGIME_FAMILIES.includes(experiment.family) ? './regime-overlay.cjs' : null;
  if (!moduleName) throw new Error('Frozen experiment family has no compatible implementation');
  const module = require(moduleName);
  const build = EXIT_FAMILIES.includes(experiment.family) ? module.buildExitOverlay
    : SIGNAL_FAMILIES.includes(experiment.family) ? module.buildSignalOverlay : module.buildRegimeOverlay;
  const overlay = build(experiment);
  if (!overlay.metadata?.supported) throw new Error('Overlay does not implement declared experiment');
  return { ...overlay, files: [moduleName] };
}
function applyExportPatches(loader, patches = {}) {
  const allowed = ['C1_FROZEN_OPTIONS_all_sleeves','C1_FROZEN_OPTIONS_by_sleeve','C1_ACCOUNT_MOMENTUM_EXIT_POLICY'];
  if (Object.keys(patches).some(key => !allowed.includes(key))) throw new Error('Unsupported research export patch');
  const exports = loader.load('lib/c1FrozenOptions.js');
  const perSleeve = patches.C1_FROZEN_OPTIONS_by_sleeve || {};
  if (Object.keys(perSleeve).some(id => !SLEEVES.includes(id))) throw new Error('Unknown sleeve export');
  for (const sleeve of SLEEVES) Object.assign(exports.C1_FROZEN_OPTIONS[sleeve],
    patches.C1_FROZEN_OPTIONS_all_sleeves || {}, perSleeve[sleeve] || {});
  if (patches.C1_ACCOUNT_MOMENTUM_EXIT_POLICY) exports.C1_ACCOUNT_MOMENTUM_EXIT_POLICY = Object.freeze({
    ...exports.C1_ACCOUNT_MOMENTUM_EXIT_POLICY, ...patches.C1_ACCOUNT_MOMENTUM_EXIT_POLICY,
  });
}

function makeResearchLoaderFactory(experimentId, { baselineId, manifestPath = MANIFEST_PATH } = {}) {
  if (!baselineId) throw new Error('Explicit audit or production-equivalent baseline required');
  const baseline = verifyBaseline(baselineId);
  const { experiment, manifestSha256 } = readExperiment(experimentId, manifestPath);
  if (baselineId !== 'production-equivalent' && experiment.family !== 'champion')
    throw new Error('Final Challenger experiments must use production-equivalent baseline');
  const overlay = overlayFor(experiment, manifestPath);
  const active = experiment.family !== 'champion' && overlay.metadata.active !== false;
  const overlayHashes = Object.fromEntries(overlay.files.map(file => [file,
    sha256(fs.readFileSync(path.resolve(__dirname, file)))]));
  function factory(root = baseline.sourceRoot, options = {}) {
    const verified = verifyBaseline(baselineId);
    if (path.resolve(root) !== verified.sourceRoot) throw new Error('Replay root differs from chosen baseline');
    if (sha256(fs.readFileSync(manifestPath)) !== manifestSha256) throw new Error('Frozen matrix changed after factory creation');
    const transform = active && overlay.metadata.sourceExpressionsChanged ? overlay.transform : null;
    const loader = createSourceTransformLoader(root, options, transform);
    applyExportPatches(loader, overlay.optionPatches);
    // Champion emits exactly the original pinned run identity and source output.
    // Baseline attribution belongs on the run envelope, avoiding a false no-op.
    if (!active) return loader;
    const originalIdentity = loader.identity.bind(loader);
    loader.identity = () => ({ ...originalIdentity(), researchOverlay: {
      contract: 'c1-challenger-source-overlay-v1', experimentId, baselineId,
      sourceCommit: baseline.sourceCommit, sourceGraphSha256: baseline.sourceGraphSha256,
      matrixSha256: manifestSha256, wrapperSha256: sha256(fs.readFileSync(__filename)),
      overlayModuleHashes: overlayHashes, optionPatches: overlay.optionPatches,
      semantics: overlay.metadata, historicalPerformanceVerified: false,
      sourceSnapshotsModified: false, productionChanged: false,
    } });
    return loader;
  }
  factory.baseline = baseline;
  factory.experiment = experiment;
  factory.overlay = overlay;
  factory.manifestSha256 = manifestSha256;
  return factory;
}
module.exports = { PROGRAM_ROOT, MANIFEST_PATH, EXIT_FAMILIES, SIGNAL_FAMILIES, REGIME_FAMILIES,
  readExperiment, overlayFor, applyExportPatches, makeResearchLoaderFactory };
