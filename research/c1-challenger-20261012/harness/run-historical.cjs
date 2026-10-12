'use strict';
// Exact pinned replay orchestration. Missing external acceptance blocks runs;
// this module never acquires, reconstructs or publishes historical prices.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { makeResearchLoaderFactory, SIGNAL_FAMILIES, REGIME_FAMILIES, PROGRAM_ROOT } = require('./research-loader.cjs');
const { verifyResearchRecordedReplay } = require('./recorded-verifier.cjs');
const { applyRegimeInputs } = require('./regime-overlay.cjs');
const { prepareExactSignalInput, compileSignalInputBatch } = require('./signal-input.cjs');
const { verifyGitHubLock, verifyGitHubLockFromReadReceipt, authorizeValidation } = require('../analysis/finalist-lock.cjs');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const REPO_ROOT = path.resolve(PROGRAM_ROOT, '../..');
const MATRIX_SHA256 = '6f77af71d22c446a950f83d1f2c61815211c21c36031179c1a3dfac66f611f03';
const inside = (file, root) => file !== root && file.startsWith(root + path.sep);
function assert(condition, message) { if (!condition) throw new Error(message); }
function verifyAcceptance(value, stage) {
  const required = ['G0','G1','G3','G4', ...(stage === 'baseline' ? [] : ['G2'])];
  assert(value && required.every(key => value[key]?.passed === true && /^[a-f0-9]{64}$/.test(value[key].receiptSha256)),
    'Source/input/software/code-private-durability acceptance receipts are missing');
  const storage = value.privateStorageAcceptance;
  assert(storage?.privateStorageVerified === true && storage.providerLicensePermitsStorage === true &&
    storage.exactOriginalFiles === true && storage.evidenceReference,
    'Provider-permitted private preservation of exact original inputs has not been established');
  assert(value.codePersistence?.verified === true && /^[a-f0-9]{40}$/.test(value.codePersistence.immutableCommit || '') &&
    value.codePersistence.researchHarnessFilesVerified === true,
    'Current research code must be verified persisted on GitHub before a long run');
  assert(value.matrixSha256 === MATRIX_SHA256, 'Acceptance uses a different experimental matrix');
  return value;
}
function outputPath(privateRoot, output) {
  assert(privateRoot && output, 'Explicit private root and output file required');
  const root = fs.realpathSync(privateRoot);
  assert(!inside(root, REPO_ROOT) && root !== REPO_ROOT, 'Historical row-level data must stay outside the public repository');
  const parent = fs.realpathSync(path.dirname(path.resolve(output)));
  const target = path.join(parent, path.basename(output));
  assert(inside(target, root), 'Historical output escapes private storage');
  assert(!inside(target, REPO_ROOT) && target !== REPO_ROOT, 'Historical output must stay outside the public repository');
  let entry;
  try { entry = fs.lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(!entry, 'Immutable run output already exists, including symbolic links; select a new output identity');
  return target;
}
function privateInputPath(value, label) {
  assert(value, 'Explicit private ' + label + ' required');
  const root = fs.realpathSync(value);
  assert(fs.statSync(root).isDirectory(), label + ' must be an input directory');
  assert(!inside(root, REPO_ROOT) && root !== REPO_ROOT, label + ' must stay outside the public repository');
  return root;
}
function independentAuditMatch(run, verification, evidenceRoot) {
  const reference = JSON.parse(fs.readFileSync(path.join(evidenceRoot,`current-${run.slippageBps}bps-results.json`)));
  assert(run.sourcePin.sourceGraphSha256 === reference.sourcePin.sourceGraphSha256, 'Audit reproduction uses a different historical implementation');
  const metricMatches = {};
  for (const [key,value] of Object.entries(reference.metrics)) {
    if (typeof value === 'number') metricMatches[key] = typeof run.metrics[key] === 'number' &&
      Math.abs(run.metrics[key]-value) <= 1e-9 * Math.max(1,Math.abs(value));
    else metricMatches[key] = JSON.stringify(run.metrics[key]) === JSON.stringify(value);
  }
  const exactSourceHashes = Object.fromEntries(['base','cooldown15','sector40'].map(id => [id,
    verification.results[id].sourceOutputSha256 === reference.sourceVerification.results[id].sourceOutputSha256 &&
    verification.results[id].traceSha256 === reference.sourceVerification.results[id].traceSha256]));
  return { contract:'c1-exact-saved-audit-reproduction-v1', costBps:run.slippageBps,
    passed:Object.values(metricMatches).every(Boolean)&&Object.values(exactSourceHashes).every(Boolean),
    metricMatches,exactSourceHashes,sourceBoundHistoricalImplementation:true,
    productionEquivalentResult:false,eligibleForAlphaClaim:false };
}
function transformedInput({ dataset, factory, originalRoot, storageAcceptance, policyStartDate }) {
  const family = factory.experiment.family;
  const sourceRoot = factory.baseline.sourceRoot;
  if (SIGNAL_FAMILIES.includes(family)) {
    assert(originalRoot, 'Signal experiments require the exact original warmup archive; precomputed factors cannot substitute');
    const loader = factory(sourceRoot,{cached:false,slippageBps:12});
    const prepared = prepareExactSignalInput({originalRoot,sourceRoot,loader,storageAcceptance});
    const sessions=[];
    for (let start=0;start<prepared.raw.sessions.length;start+=50)
      sessions.push(...compileSignalInputBatch({prepared,loader,sourceRoot,start,count:Math.min(50,prepared.raw.sessions.length-start)}).sessions);
    assert(sessions.length===dataset.sessions.length,'Signal compilation altered original dated session pool');
    for(let i=0;i<sessions.length;i++) {
      assert(sessions[i].date===dataset.sessions[i].date,'Signal compilation altered dated session identity');
      assert(JSON.stringify(sessions[i].prices)===JSON.stringify(dataset.sessions[i].prices),'Signal compilation changed original OHLC rows');
      assert(JSON.stringify(sessions[i].universeSymbols)===JSON.stringify(dataset.sessions[i].universeSymbols),'Signal compilation changed original membership');
    }
    return {dataset:{...dataset,sessions},receipt:{...prepared.receipt,
      declaredInputTransformFamily:family,preservedOriginalPriceUniverseVerified:true}};
  }
  if (REGIME_FAMILIES.includes(family)) {
    const calendar = factory(sourceRoot,{cached:false,slippageBps:12}).load('lib/marketSession.js');
    const result = applyRegimeInputs(dataset,factory.experiment,{calendar,policyStartDate});
    return {dataset:result.dataset,receipt:{...result.researchInputs,
      declaredInputTransformFamily:family,preservedOriginalPriceUniverseVerified:true}};
  }
  return {dataset,receipt:null};
}
function runHistorical({baselineId,experimentId='champion',stage,dataRoot,originalRoot,privateRoot,output,
  gates,slippageBps=25,conditionalInputs=false,lockVerification}={}) {
  assert(['baseline','development','validation'].includes(stage),'Explicit baseline/development/validation stage required');
  assert([12,25,50].includes(slippageBps),'Only frozen per-side12/25/50bps costs allowed');
  verifyAcceptance(gates,stage);
  const target=outputPath(privateRoot,output);
  const factory=makeResearchLoaderFactory(experimentId,{baselineId});
  const matrixBytes=fs.readFileSync(path.join(PROGRAM_ROOT,'experiments.json'));
  assert(sha256(matrixBytes)===MATRIX_SHA256,'The48-Challenger matrix has changed');
  assert(stage==='baseline' ? experimentId==='champion' : baselineId==='production-equivalent',
    'Audit source is only for separate Champion reproduction; final comparisons require production-equivalent policy');
  if(stage==='development')assert(slippageBps===25,'Frozen development screening uses25bps');
  if(stage==='validation') {
    assert(lockVerification,'An independently verified immutable GitHub finalist lock is required');
  }
  dataRoot=privateInputPath(dataRoot,'source input root');
  if(originalRoot)originalRoot=privateInputPath(originalRoot,'original warmup input root');
  const engine=require(path.join(factory.baseline.sourceRoot,'tools/c1-production-policy-replay.cjs'));
  const originalDataset=engine.loadDataset(dataRoot,{root:factory.baseline.sourceRoot,requireCurrent:true,allowConditional:conditionalInputs});
  const publishedManifest=fs.readFileSync(path.join(PROGRAM_ROOT,'imported/docs/research/c1-validation-20261012/current-input-manifest.json'));
  assert(originalDataset.manifestSha256===sha256(publishedManifest),'Exact saved Champion input manifest required; no substitute dataset');
  const baseInputContentSha256=engine.datasetDigest(originalDataset);
  const prepared=transformedInput({dataset:originalDataset,factory,originalRoot,
    storageAcceptance:gates.privateStorageAcceptance,policyStartDate:'2023-01-04'});
  const derivedInputContentSha256=engine.datasetDigest(prepared.dataset);
  const researchIdentity={baselineRole:baselineId==='audit-historical'?'historical-audit':'production-equivalent',
    baselineId,sourceCommit:factory.baseline.sourceCommit,baseSourceGraphSha256:factory.baseline.sourceGraphSha256,
    experimentId,matrixSha256:MATRIX_SHA256,baseInputContentSha256,
    inputTransform:prepared.receipt?{family:factory.experiment.family,baseInputContentSha256,
      derivedInputContentSha256,preservedOriginalPriceUniverseVerified:true,
      receiptSha256:sha256(engine.stringifyAudit(prepared.receipt))}:null,
    stage,gates,
    validationLockSha256:lockVerification?.verification?.lockFileSha256||null,
    validationLockCommit:lockVerification?.verification?.commit||null,
    eligibleForAlphaClaim:false,productionChanged:false};
  if(stage==='validation')authorizeValidation({slippageBps,inputContentSha256:derivedInputContentSha256,
    researchIdentity},experimentId,lockVerification);
  const endDate=stage==='development'?'2024-12-31':'2026-09-01';
  const run=engine.replayPolicy({root:factory.baseline.sourceRoot,dataset:prepared.dataset,
    loaderFactory:factory,slippageBps,startDate:'2023-01-04',endDate,initialCapital:100000,cached:true});
  assert(engine.datasetDigest(originalDataset)===baseInputContentSha256,'Research preparation mutated original inputs');
  run.inputManifestSha256=originalDataset.manifestSha256;
  run.researchIdentity=researchIdentity;
  if(stage==='validation')authorizeValidation(run,experimentId,lockVerification);
  const verification=verifyResearchRecordedReplay({root:factory.baseline.sourceRoot,run,dataset:prepared.dataset,loaderFactory:factory});
  assert(verification.passed===true,'Full chronological source verification failed');
  run.researchIdentity.fullChronologicalSourceVerificationPassed=true;
  run.researchIdentity.privateChronologicalVerificationPassed=true;
  const historicalAuditReproduction=baselineId==='audit-historical'?
    independentAuditMatch(run,verification,path.join(PROGRAM_ROOT,'imported/docs/research/c1-validation-20261012')):null;
  if(historicalAuditReproduction)assert(historicalAuditReproduction.passed,'Saved historical audit reproduction failed; do not retune');
  if(historicalAuditReproduction)run.researchIdentity.historicalAuditMatch=historicalAuditReproduction;
  run.privateResearchInputReceipt=prepared.receipt;
  run.privateChronologicalVerification=verification;
  run.historicalAuditReproduction=historicalAuditReproduction;
  run.artifactEncoding='c1-audit-json-values-v1';
  const bytes=Buffer.from(engine.stringifyAudit(run));
  fs.writeFileSync(target,target.endsWith('.gz')?zlib.gzipSync(bytes):bytes,{mode:0o600,flag:'wx'});
  return {completed:true,baselineId,experimentId,stage,slippageBps,outputSha256:sha256(fs.readFileSync(target)),
    sourceVerified:true,historicalAuditReproduced:historicalAuditReproduction?.passed||false,
    historicalPerformanceCertified:false,productionChanged:false};
}
if(require.main===module) {
  const args=process.argv.slice(2),value=(key)=>{const i=args.indexOf('--'+key);return i<0?undefined:args[i+1];};
  try {
    const stage=value('stage');
    const matrix=JSON.parse(fs.readFileSync(path.join(PROGRAM_ROOT,'experiments.json')));
    const lockVerification=stage==='validation'?(value('lock-read-receipt')?
      verifyGitHubLockFromReadReceipt({receipt:JSON.parse(fs.readFileSync(value('lock-read-receipt'))),matrix}):
      verifyGitHubLock({repoRoot:REPO_ROOT,branch:value('lock-branch'),
      commit:value('lock-commit'),lockPath:value('lock-path'),matrix})):undefined;
    const result=runHistorical({baselineId:value('baseline'),experimentId:value('experiment')||'champion',stage,
      dataRoot:value('data-root'),originalRoot:value('original-root'),privateRoot:value('private-root'),output:value('output'),
      gates:value('gates')?JSON.parse(fs.readFileSync(value('gates'))):null,slippageBps:Number(value('cost')||25),
      conditionalInputs:args.includes('--conditional-inputs'),lockVerification});
    console.log(JSON.stringify(result));
  } catch(error) { console.error(JSON.stringify({completed:false,historicalRunBlocked:true,reason:error.message}));process.exitCode=2; }
}
module.exports={runHistorical,verifyAcceptance,outputPath,privateInputPath,independentAuditMatch,transformedInput,MATRIX_SHA256};
