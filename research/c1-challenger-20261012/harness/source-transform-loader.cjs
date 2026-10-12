'use strict';
// Extend only the pinned research loader's source-read seam, in memory.
// Original application snapshots and the original loader stay immutable.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const ORIGINAL_LOADER_SHA256 = '75590e07a8280a91b8310936a625269932dbfdc66cf186955bb3a8c6889c5ab9';
function once(source, needle, replacement) {
  if (source.split(needle).length !== 2) throw new Error('Pinned research loader seam changed');
  return source.replace(needle, replacement);
}
function createSourceTransformLoader(root, options, sourceTransform) {
  const filename = path.join(root, 'tools/c1-production-replay-loader.cjs');
  const original = fs.readFileSync(filename, 'utf8');
  if (sha256(original) !== ORIGINAL_LOADER_SHA256) throw new Error('Wrong original replay adapter');
  if (!sourceTransform) return require(filename).createProductionReplayLoader(root, options);
  const adapted = once(original, 'let source=transform(relative,original);',
    'let source=transform(relative,__researchTransform(relative,original));');
  const record = { exports: {} };
  vm.runInNewContext(adapted, {
    module: record, exports: record.exports, require, __filename: filename,
    __dirname: path.dirname(filename), __researchTransform: sourceTransform,
    structuredClone, console, process, performance, Date, Intl, Math, Number,
    String, Object, Array, Set, Map, WeakMap, Boolean, RegExp, Error, TypeError,
    JSON, URL, URLSearchParams, AbortController, AbortSignal, Response, fetch,
    setTimeout, clearTimeout,
  }, { filename: 'c1-research-source-transform-adapter' });
  const loader = record.exports.createProductionReplayLoader(root, options);
  const identity = loader.identity.bind(loader);
  loader.identity = () => ({ ...identity(), researchLoaderSeam: {
    contract: 'c1-source-read-transform-seam-v1',
    originalLoaderSha256: ORIGINAL_LOADER_SHA256,
    inMemoryLoaderSha256: sha256(adapted),
    seamModuleSha256: sha256(fs.readFileSync(__filename)),
    sourceSnapshotsModified: false,
  } });
  return loader;
}
module.exports = { createSourceTransformLoader, ORIGINAL_LOADER_SHA256 };
