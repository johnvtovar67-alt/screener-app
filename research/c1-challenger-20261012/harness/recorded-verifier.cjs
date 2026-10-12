'use strict';
// Reuse the pinned full chronological verifier. Its sole added seam is the
// already chosen research loader factory; no accounting expression is copied.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const ENGINE_SHA256 = '36a8e41afdd825de46d0302b0fc3008354b30ff0ba2bd5483920ad12721d532a';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function verifyResearchRecordedReplay({ root, run, dataset, loaderFactory }) {
  if (!root || !run || !dataset || typeof loaderFactory !== 'function') throw new Error('Explicit research source, run, inputs and loader required');
  const filename = path.join(root, 'tools/c1-production-policy-replay.cjs');
  const original = fs.readFileSync(filename, 'utf8');
  if (sha256(original) !== ENGINE_SHA256) throw new Error('Recorded verifier source is not the pinned engine');
  const needle = 'const loader=createProductionReplayLoader(root,{cached:false,slippageBps:run.slippageBps});';
  if (original.split(needle).length !== 2) throw new Error('Pinned recorded verifier seam changed');
  const adapted = original.replace(needle,
    'const loader=module.__researchLoaderFactory(root,{cached:false,slippageBps:run.slippageBps});');
  const isolatedModule = new Module(filename, module);
  isolatedModule.filename = filename;
  isolatedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  let verificationLoader;
  isolatedModule.__researchLoaderFactory = (...args) => {
    verificationLoader = loaderFactory(...args);
    return verificationLoader;
  };
  isolatedModule._compile(adapted, filename);
  const receipt = isolatedModule.exports.verifyRecordedReplay({ root, run, dataset });
  // The original verifier checks the original graph and realized source path.
  // A research expression can differ without affecting a short realized path,
  // so also bind every effective source/overlay identity except cache mode.
  const canonical = value => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const effectiveIdentity = value => {
    const { cached, ...identity } = value;
    return JSON.stringify(canonical(identity));
  };
  const expectedIdentity = effectiveIdentity(run.sourcePin);
  const verifiedIdentity = effectiveIdentity(verificationLoader.identity());
  const effectiveSourceIdentityMatches = expectedIdentity === verifiedIdentity;
  return { ...receipt, passed: receipt.passed === true && effectiveSourceIdentityMatches,
    effectiveSourceIdentityMatches,
    effectiveSourceIdentitySha256: { recorded: sha256(expectedIdentity), verified: sha256(verifiedIdentity) },
    researchVerificationSeam: {
    contract: 'c1-pinned-recorded-verifier-loader-seam-v1',
    originalEngineSha256: ENGINE_SHA256, inMemoryVerifierSha256: sha256(adapted),
    seamModuleSha256: sha256(fs.readFileSync(__filename)),
    sourceAccountingExpressionsChanged: false, sourceSnapshotsModified: false,
    loaderFactoryExperiment: loaderFactory.experiment?.id || null,
    baselineId: loaderFactory.baseline?.id || null,
  } };
}
module.exports = { verifyResearchRecordedReplay, ENGINE_SHA256 };
