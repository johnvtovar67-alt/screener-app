'use strict';
// Orchestration guards use deliberate in-memory engine doubles. The separate
// verifier checks below execute the real pinned source on two invented sessions.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const {makeResearchLoaderFactory,PROGRAM_ROOT}=require('./research-loader.cjs');
const {verifyResearchRecordedReplay}=require('./recorded-verifier.cjs');
const {verifyBaseline}=require('../baselines/selection.cjs');
const {syntheticDataset}=require('../mechanics/synthetic-fixtures.cjs');
const realDriver=require('./run-historical.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'c1-harness-driver-'));
fs.mkdirSync(path.join(temp,'unread-input-double'));
const publishedManifest=fs.readFileSync(path.join(PROGRAM_ROOT,'imported/docs/research/c1-validation-20261012/current-input-manifest.json'));
const input={metadata:{syntheticDriverDouble:true},sessions:[{date:'2023-01-04',prices:[],universeSymbols:[]},{date:'2023-01-05',prices:[],universeSymbols:[]}],manifestSha256:sha(publishedManifest)};
const datasetDigest=dataset=>sha(JSON.stringify(dataset));
const baseHash=datasetDigest(input),prod=verifyBaseline('production-equivalent');
const matrixSha=sha(fs.readFileSync(path.join(PROGRAM_ROOT,'experiments.json')));
const receiptSha='a'.repeat(64),commit='b'.repeat(40);
const gates={matrixSha256:matrixSha,privateStorageAcceptance:{privateStorageVerified:true,providerLicensePermitsStorage:true,exactOriginalFiles:true,evidenceReference:'synthetic guard test'},
  codePersistence:{verified:true,immutableCommit:commit,researchHarnessFilesVerified:true},
  ...Object.fromEntries(['G0','G1','G2','G3','G4'].map(id=>[id,{passed:true,receiptSha256:receiptSha}]))};
const lockVerification={lock:{validationAllowedExperimentIds:['champion'],validationCostBps:[12,25,50],
  baseInputContentSha256:baseHash,inputContentSha256:baseHash,experimentInputIdentities:{champion:{family:'champion',inputContentSha256:baseHash}},
  sourceCommit:prod.sourceCommit,baseSourceGraphSha256:prod.sourceGraphSha256},
  verification:{verified:true,lockFileSha256:'c'.repeat(64),commit,branch:'research/synthetic-fixture'}};
function isolatedDriver({manifestSha256=input.manifestSha256,onReplay}={}) {
  const filename=path.join(__dirname,'run-historical.cjs');
  const isolated=new Module(filename,module);isolated.filename=filename;isolated.paths=Module._nodeModulePaths(__dirname);
  const originalRequire=Module.createRequire(filename),calls={dataReads:0,replays:0,verifications:0};
  const fakeEngine={datasetDigest,stringifyAudit:JSON.stringify,
    loadDataset(){calls.dataReads++;return {...input,manifestSha256};},
    replayPolicy(request){calls.replays++;if(onReplay)onReplay();return {slippageBps:request.slippageBps,startDate:request.startDate,endDate:request.endDate,
      inputContentSha256:datasetDigest(request.dataset),sourcePin:{sourceGraphSha256:prod.sourceGraphSha256},metrics:{}};}};
  isolated.require=request=>{
    if(request.endsWith('/tools/c1-production-policy-replay.cjs'))return fakeEngine;
    if(request==='./recorded-verifier.cjs')return {verifyResearchRecordedReplay({run,dataset}){
      calls.verifications++;
      assert.equal(run.inputManifestSha256,dataset.manifestSha256,'Manifest must be bound before chronological verification');
      return {passed:true,results:{}};
    }};
    return originalRequire(request);
  };
  isolated._compile(fs.readFileSync(filename,'utf8'),filename);
  return {driver:isolated.exports,calls};
}
const checks=[];
function check(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,reason:error.message});}}
function request(name,extra={}){return {baselineId:'production-equivalent',experimentId:'champion',stage:'development',
  dataRoot:path.join(temp,'unread-input-double'),privateRoot:temp,output:path.join(temp,name+'.json'),gates,slippageBps:25,...extra};}
check('baseline selection requires explicit identity',()=>assert.throws(()=>makeResearchLoaderFactory('champion'),/Explicit/));
check('audit cannot host Challenger overlay',()=>assert.throws(()=>makeResearchLoaderFactory('entry_queue__depth6',{baselineId:'audit-historical'}),/production-equivalent/));
check('development rejects audit before input or engine execution',()=>{
  const {driver,calls}=isolatedDriver();assert.throws(()=>driver.runHistorical(request('audit-dev',{baselineId:'audit-historical'})),/production-equivalent/);
  assert.equal(calls.dataReads,0);assert.equal(calls.replays,0);
});
check('missing G2 blocks development before inputs',()=>{
  const {driver,calls}=isolatedDriver(),copy=structuredClone(gates);delete copy.G2;
  assert.throws(()=>driver.runHistorical(request('g2',{gates:copy})),/acceptance receipts/);assert.equal(calls.dataReads,0);
});
check('development rejects nonselection cost before replay',()=>{
  const {driver,calls}=isolatedDriver();assert.throws(()=>driver.runHistorical(request('cost',{slippageBps:12})),/25bps/);assert.equal(calls.replays,0);
});
check('substitute manifest rejected before replay/output',()=>{
  const {driver,calls}=isolatedDriver({manifestSha256:'d'.repeat(64)}),req=request('substitute');
  assert.throws(()=>driver.runHistorical(req),/Exact saved Champion input manifest/);
  assert.equal(calls.replays,0);assert.equal(fs.existsSync(req.output),false);
});
check('valid development binds manifest before verifier and writes private immutable output',()=>{
  const {driver,calls}=isolatedDriver(),req=request('development');const result=driver.runHistorical(req);
  assert.equal(result.completed,true);assert.equal(calls.replays,1);assert.equal(calls.verifications,1);
  assert.equal(fs.statSync(req.output).mode&0o777,0o600);
  assert.throws(()=>driver.runHistorical(req),/already exists/);assert.equal(calls.replays,1);
});
check('validation rejects absent lock before data/replay',()=>{
  const {driver,calls}=isolatedDriver();assert.throws(()=>driver.runHistorical(request('missing-lock',{stage:'validation'})),/finalist lock/);assert.equal(calls.dataReads,0);
});
check('validation rejects unlocked experiment before replay',()=>{
  const {driver,calls}=isolatedDriver();const denied=structuredClone(lockVerification);denied.lock.validationAllowedExperimentIds=[];
  assert.throws(()=>driver.runHistorical(request('unlocked',{stage:'validation',lockVerification:denied})),/locked finalist/);assert.equal(calls.replays,0);
});
check('valid validation uses exact input/source lock and saves GitHub lock hash',()=>{
  const {driver,calls}=isolatedDriver(),req=request('validation',{stage:'validation',lockVerification});
  const result=driver.runHistorical(req);assert.equal(result.completed,true);assert.equal(calls.replays,1);
  const saved=JSON.parse(fs.readFileSync(req.output,'utf8'));
  assert.equal(saved.researchIdentity.validationLockSha256,lockVerification.verification.lockFileSha256);
  assert.equal(saved.researchIdentity.baseSourceGraphSha256,prod.sourceGraphSha256);
});
check('private output rejects dangling symlink before write',()=>{
  const link=path.join(temp,'dangling.json');fs.symlinkSync(path.join(PROGRAM_ROOT,'synthetic-target-does-not-exist.json'),link);
  assert.throws(()=>realDriver.outputPath(temp,link),/exists|symlink|symbolic/i);
});
check('late output collision cannot truncate existing immutable file',()=>{
  const req=request('late-collision'),sentinel='synthetic concurrent run already owns this identity';
  const {driver}=isolatedDriver({onReplay:()=>fs.writeFileSync(req.output,sentinel,{mode:0o600})});
  assert.throws(()=>driver.runHistorical(req),/exists|EEXIST/);
  assert.equal(fs.readFileSync(req.output,'utf8'),sentinel);
});
check('private output rejects public repository directory',()=>{
  assert.throws(()=>realDriver.outputPath(PROGRAM_ROOT,path.join(PROGRAM_ROOT,'never-written.json')),/outside the public repository/);
});
check('private output rejects public target even when private root is a repository ancestor',()=>{
  assert.throws(()=>realDriver.outputPath(path.resolve(PROGRAM_ROOT,'../../..'),path.join(PROGRAM_ROOT,'never-written-ancestor.json')),/outside the public repository/);
});
check('private source input rejects public repository directory before data read',()=>{
  const {driver,calls}=isolatedDriver();
  assert.throws(()=>driver.runHistorical(request('public-input',{dataRoot:PROGRAM_ROOT})),/outside the public repository/);
  assert.equal(calls.dataReads,0);assert.equal(calls.replays,0);
});
check('private source input rejects symlink into public repository before data read',()=>{
  const link=path.join(temp,'public-input-link');fs.symlinkSync(PROGRAM_ROOT,link,'dir');
  const {driver,calls}=isolatedDriver();
  assert.throws(()=>driver.runHistorical(request('symlink-input',{dataRoot:link})),/outside the public repository/);
  assert.equal(calls.dataReads,0);assert.equal(calls.replays,0);
});
check('source verifier rejects different transformed genotype even when realized path identical',()=>{
  const a=makeResearchLoaderFactory('ordinary_confirmation__sessions2',{baselineId:'production-equivalent'});
  const b=makeResearchLoaderFactory('ordinary_confirmation__sessions3',{baselineId:'production-equivalent'});
  const engine=require(path.join(a.baseline.sourceRoot,'tools/c1-production-policy-replay.cjs'));
  const dataset=syntheticDataset({length:2,count:5});
  const run=engine.replayPolicy({root:a.baseline.sourceRoot,dataset,loaderFactory:a,startDate:dataset.sessions[0].date,
    endDate:dataset.sessions.at(-1).date,slippageBps:25});
  let rejected=false;try{rejected=verifyResearchRecordedReplay({root:b.baseline.sourceRoot,run,dataset,loaderFactory:b}).passed!==true;}catch{rejected=true;}
  assert(rejected,'Wrong confirmation genotype passed recorded-source verification');
  assert.equal(verifyResearchRecordedReplay({root:a.baseline.sourceRoot,run,dataset,loaderFactory:a}).passed,true);
});
check('recorded verifier rejects modified source trace',()=>{
  const factory=makeResearchLoaderFactory('champion',{baselineId:'production-equivalent'});
  const engine=require(path.join(factory.baseline.sourceRoot,'tools/c1-production-policy-replay.cjs'));
  const dataset=syntheticDataset({length:2,count:5});
  const run=engine.replayPolicy({root:factory.baseline.sourceRoot,dataset,loaderFactory:factory,
    startDate:dataset.sessions[0].date,endDate:dataset.sessions.at(-1).date,slippageBps:50});
  const tampered=engine.parseAudit(engine.stringifyAudit(run));tampered.simulatorTrace.base[0].cash+=1;
  assert.equal(verifyResearchRecordedReplay({root:factory.baseline.sourceRoot,run:tampered,dataset,loaderFactory:factory}).passed,false);
});
const report={contract:'c1-focused-harness-driver-regression-v1',passed:checks.every(check=>check.passed),
  scope:'Orchestration guard doubles plus real pinned chronological verifier on two invented sessions. No historical run or source snapshot edits.',checks};
fs.writeFileSync(path.join(__dirname,'harness-driver-results.json'),JSON.stringify(report,null,2)+'\n');
fs.rmSync(temp,{recursive:true,force:true});
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
