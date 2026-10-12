// Research baseline selection is explicit. Neither immutable snapshot is edited.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PROGRAM_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(__dirname, 'registry.json');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function withinProgram(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Relative research baseline path required');
  const resolved = path.resolve(PROGRAM_ROOT, relative);
  if (!resolved.startsWith(PROGRAM_ROOT + path.sep)) throw new Error('Baseline path escapes research program');
  return resolved;
}
function selectBaseline(id) {
  if (typeof id !== 'string' || !id) throw new Error('Explicit baseline id required');
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const baseline = registry.baselines.find(item => item.id === id);
  if (!baseline) throw new Error('Unknown research baseline: ' + id);
  return Object.freeze({...baseline, sourceRoot:withinProgram(baseline.sourceRoot),
    manifestPath:withinProgram(baseline.manifestPath), sourcePinPath:withinProgram(baseline.sourcePinPath),
    registrySha256:digest(fs.readFileSync(REGISTRY_PATH))});
}
function listFiles(root, relative = '') {
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry => {
    const name = relative ? relative+'/'+entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Snapshot symbolic links are not permitted: '+name);
    return entry.isDirectory() ? listFiles(root,name) : [name];
  }).sort();
}
function verifyBaseline(id) {
  const baseline = selectBaseline(id);
  const manifest = JSON.parse(fs.readFileSync(baseline.manifestPath,'utf8'));
  const pin = JSON.parse(fs.readFileSync(baseline.sourcePinPath,'utf8'));
  if ((manifest.sourceCommit || manifest.auditCommit) !== baseline.sourceCommit ||
      manifest.sourceGraphSha256 !== baseline.sourceGraphSha256 || pin.sourceGraphSha256 !== baseline.sourceGraphSha256)
    throw new Error('Research baseline source identity mismatch: '+id);
  const expected = manifest.files.map(file=>file.path).sort();
  if (JSON.stringify(listFiles(baseline.sourceRoot)) !== JSON.stringify(expected))
    throw new Error('Snapshot has added or missing files: '+id);
  for (const file of manifest.files) {
    const absolute = path.resolve(baseline.sourceRoot,file.path);
    if (!absolute.startsWith(baseline.sourceRoot+path.sep)) throw new Error('Snapshot entry escapes source root');
    const bytes = fs.readFileSync(absolute);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
      throw new Error('Immutable baseline mismatch: '+id+'/'+file.path);
  }
  const graph = Object.fromEntries(manifest.files.filter(file=>file.path.startsWith('lib/')).map(file=>[file.path,file.sha256]));
  if (Object.keys(graph).length !== 25 || manifest.applicationModuleCount !== 25 ||
      JSON.stringify(Object.entries(graph).sort()) !== JSON.stringify(Object.entries(pin.sources).sort()) ||
      digest(JSON.stringify(Object.entries(graph).sort())) !== baseline.sourceGraphSha256)
    throw new Error('Baseline 25-module graph mismatch: '+id);
  return Object.freeze({...baseline, applicationModuleCount:25, filesChecked:manifest.files.length,
    manifestSha256:digest(fs.readFileSync(baseline.manifestPath)), sourcePinSha256:digest(fs.readFileSync(baseline.sourcePinPath)),
    passed:true, productionModified:false, deployedStatusClaimed:false});
}
module.exports={PROGRAM_ROOT,REGISTRY_PATH,selectBaseline,verifyBaseline};
