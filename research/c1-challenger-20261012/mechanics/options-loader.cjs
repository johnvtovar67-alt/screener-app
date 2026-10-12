// Research-only export overlays. The immutable source snapshot is never edited.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(PROGRAM_ROOT, 'imported/source');
const MANIFEST_PATH = path.join(PROGRAM_ROOT, 'experiments.json');
const { createProductionReplayLoader } = require(path.join(SOURCE_ROOT, 'tools/c1-production-replay-loader.cjs'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const FAMILIES = Object.freeze({
  champion: [],
  slots: ['rankedTargetCount', 'maxPositions', 'buyTargetPct', 'strongBuyTargetPct', 'buyMaxPositionPct', 'strongBuyMaxPositionPct'],
  sector_caps: ['maxSectorPct'],
  sector_position_limit: ['maxSectorPositions'],
  entry_queue: ['rankedEntryQueueCount'],
  adv: ['minimumAverageDollarVolume'],
  initial_stop: ['minimumInitialStopPct', 'maximumInitialStopPct'],
  sleeve_breaker: ['portfolioDrawdownStopPct'],
});
const SLEEVES = ['base', 'cooldown15', 'sector40'];
function verifySnapshot(root = SOURCE_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROGRAM_ROOT, 'imported/source-snapshot-manifest.json')));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error('Immutable source snapshot mismatch: ' + file.path);
  }
  return { auditCommit: manifest.auditCommit, sourceGraphSha256: manifest.sourceGraphSha256, files: manifest.files.length };
}
function resolveExperiment(id, manifestPath = MANIFEST_PATH) {
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const experiment = manifest.experiments.find(item => item.id === id);
  if (!experiment) throw new Error('Unknown preregistered experiment: ' + id);
  if (!Object.hasOwn(FAMILIES, experiment.family)) throw new Error('Family requires a separately verified research seam: ' + experiment.family);
  if (Object.keys(experiment.researchOverrides || {}).length) throw new Error('Options-only loader cannot change compiler/state inputs');
  const scopes = experiment.sourceOverrides || {};
  for (const key of Object.keys(scopes)) if (!['C1_FROZEN_OPTIONS_all_sleeves', 'C1_FROZEN_OPTIONS_by_sleeve'].includes(key)) throw new Error('Unsupported source export overlay: ' + key);
  const bySleeve = scopes.C1_FROZEN_OPTIONS_by_sleeve || {};
  for (const id of Object.keys(bySleeve)) if (!SLEEVES.includes(id)) throw new Error('Unknown sleeve: ' + id);
  const overrides = Object.fromEntries(SLEEVES.map(sleeve => [sleeve, {
    ...(scopes.C1_FROZEN_OPTIONS_all_sleeves || {}), ...(bySleeve[sleeve] || {}),
  }]));
  for (const overlay of Object.values(overrides)) for (const [key, value] of Object.entries(overlay)) {
    if (!FAMILIES[experiment.family].includes(key) || !Number.isFinite(value) || value <= 0) throw new Error('Unsupported option/value: ' + key);
    if (['rankedTargetCount', 'maxPositions', 'rankedEntryQueueCount', 'maxSectorPositions'].includes(key) && !Number.isSafeInteger(value)) throw new Error('Integer option required: ' + key);
    if (['buyTargetPct', 'strongBuyTargetPct', 'buyMaxPositionPct', 'strongBuyMaxPositionPct', 'maxSectorPct'].includes(key) && value > 1) throw new Error('Fraction option exceeds one: ' + key);
    if (['minimumInitialStopPct', 'maximumInitialStopPct', 'portfolioDrawdownStopPct'].includes(key) && value >= 100) throw new Error('Risk percentage must be below 100: ' + key);
  }
  return { id, family: experiment.family, overrides, manifestSha256: sha256(manifestBytes) };
}
function makeOptionsLoaderFactory(experimentId = 'champion', { manifestPath = MANIFEST_PATH } = {}) {
  const definition = resolveExperiment(experimentId, manifestPath);
  const snapshot = verifySnapshot();
  const changed = Object.values(definition.overrides).some(value => Object.keys(value).length);
  return function optionsLoaderFactory(root = SOURCE_ROOT, { cached = true, slippageBps = 12 } = {}) {
    verifySnapshot(root);
    const loader = createProductionReplayLoader(root, { cached, slippageBps });
    // Preload the shared export before seed/projection/simulator imports. Every
    // source consumer and the strict seed validator see the same option object.
    const { C1_FROZEN_OPTIONS } = loader.load('lib/c1FrozenOptions.js');
    for (const sleeve of SLEEVES) Object.assign(C1_FROZEN_OPTIONS[sleeve], definition.overrides[sleeve]);
    if (!changed) return loader; // Complete no-op output/source identity is exact.
    const originalIdentity = loader.identity.bind(loader);
    loader.identity = () => ({
      ...originalIdentity(),
      researchOptionOverlay: {
        contract: 'c1-preregistered-options-export-overlay-v1',
        experimentId: definition.id, family: definition.family,
        optionsBySleeve: definition.overrides, manifestSha256: definition.manifestSha256,
        sourceSnapshot: snapshot, sourceExpressionsChanged: false,
        historicalPerformanceClaim: false, productionChange: false,
      },
    });
    return loader;
  };
}
module.exports = { PROGRAM_ROOT, SOURCE_ROOT, MANIFEST_PATH, FAMILIES, SLEEVES, resolveExperiment, verifySnapshot, makeOptionsLoaderFactory };
