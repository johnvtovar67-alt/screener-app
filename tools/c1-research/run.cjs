#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const {validateEvidence,sha}=require('./evidence.cjs');const {verifySources,createEngine}=require('./engine.cjs');const {metrics,bootstrapDifferences}=require('./metrics.cjs');
const root=path.resolve(__dirname,'../..'),spec=require('./research-spec-v1.json');
function codeHashes(){return Object.fromEntries(fs.readdirSync(__dirname).filter(x=>/\.(cjs|json|py)$/.test(x)).sort().map(x=>[x,sha(fs.readFileSync(path.join(__dirname,x)))]));}
function saveNew(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function verifyPreregistration(){const lock=require('./preregistration-lock.json'),amendment=require('./technical-amendment-v2.json');for(const [file,expected] of Object.entries(lock.files)){const actual=sha(fs.readFileSync(path.join(root,file)));if(actual!==expected&&amendment.files[file]!==actual)throw Error('Preregistration changed: '+file);}for(const [file,expected] of Object.entries(amendment.files))if(sha(fs.readFileSync(path.join(root,file)))!==expected)throw Error('Technical amendment changed: '+file);}
function main(args){
 if(args[0]==='run')throw Error('Historical matrix execution disabled: legacy adapter parity defect. Use control-only.cjs; challengers require separate authorization.');
 verifyPreregistration();
 const [command,manifestPath,lockPath,outputPath]=args;
 if(command==='inspect'){console.log(JSON.stringify({production:verifySources(root),arms:spec.arms.map(x=>x.id),costs:spec.execution.cost_bps_per_side,label:'Retrospective research only; no results'},null,2));return;}
 if(!['validate','freeze','run'].includes(command)||!manifestPath)throw Error('Usage: run.cjs inspect | validate MANIFEST | freeze MANIFEST LOCK | run MANIFEST LOCK NEW_OUTPUT');
 verifySources(root);const gate=validateEvidence(manifestPath,spec);
 if(command==='validate'){const {dataset,...receipt}=gate;console.log(JSON.stringify(receipt,null,2));if(gate.status!=='READY_FOR_RESEARCH')process.exitCode=2;return;}
 if(gate.status!=='READY_FOR_RESEARCH')throw Error('Evidence gate failed: '+JSON.stringify({errors:gate.errors,auditRequired:gate.auditRequired}));
 if(!lockPath)throw Error('Explicit research lock path required');
 if(command==='freeze'){saveNew(lockPath,{schema:'c1-research-lock-v1',createdAt:new Date().toISOString(),manifestSha256:gate.manifestSha256,codeHashes:codeHashes(),artifactHashes:JSON.parse(fs.readFileSync(manifestPath)).artifacts.map(x=>x.sha256),parametersFrozenBeforeResults:true});return;}
 if(!outputPath)throw Error('Explicit new research output path required');if(fs.existsSync(outputPath))throw Error('Refuse to overwrite research results');
 const lock=JSON.parse(fs.readFileSync(lockPath));if(lock.schema!=='c1-research-lock-v1'||lock.parametersFrozenBeforeResults!==true||lock.manifestSha256!==gate.manifestSha256||JSON.stringify(lock.codeHashes)!==JSON.stringify(codeHashes()))throw Error('Frozen code/data mismatch; new preregistration required');
 const runs=[],summaries=[];
 for(const cost of spec.execution.cost_bps_per_side)for(const arm of spec.arms){const run=createEngine(root,arm,cost).run(gate.dataset,spec.data.target_start,spec.data.target_end,cost);const summary=metrics(run);runs.push(run);summaries.push({arm:arm.id,cost,...summary});}
 const uncertainty={};for(const cost of spec.execution.cost_bps_per_side){const selected=summaries.filter(x=>x.cost===cost),control=selected.find(x=>x.arm==='C');uncertainty[cost]=bootstrapDifferences(control.returns,Object.fromEntries(selected.filter(x=>x.arm!=='C').map(x=>[x.arm,x.returns])),{years:(Date.parse(spec.data.target_end)-Date.parse(spec.data.target_start))/86400000/365.25});}
 const paired=summaries.filter(x=>x.arm!=='C').map(x=>{const c=summaries.find(y=>y.cost===x.cost&&y.arm==='C'),run=runs.find(y=>y.cost===x.cost&&y.arm===x.arm),control=runs.find(y=>y.cost===x.cost&&y.arm==='C');if(JSON.stringify(run.curve.map(r=>r.date))!==JSON.stringify(control.curve.map(r=>r.date)))throw Error('Arm date mismatch');return {arm:x.arm,cost:x.cost,endingEquityDifference:run.curve.at(-1).equity-control.curve.at(-1).equity,cagrDifference:x.cagr-c.cagr,drawdownDifference:x.maxDrawdown-c.maxDrawdown,turnoverRatio:c.twoSidedAnnualTurnover?x.twoSidedAnnualTurnover/c.twoSidedAnnualTurnover:null,cashWeightDifference:x.meanCashWeight-c.meanCashWeight};});
 saveNew(outputPath,{label:'Retrospective independently reconstructed research; not production history or broker performance',createdAt:new Date().toISOString(),lockSha256:sha(fs.readFileSync(lockPath)),summaries,paired,uncertainty,runs,limitations:['No sealed holdout; historical model search creates selection bias.','Bootstrap resamples realized paired returns, not rerun strategy paths; intervals do not account for all model/data uncertainty.','Counterfactual opportunity cost is full paired portfolio difference, not sums of hypothetical missed gains.','Exact historical intraday quote freshness and account authority are outside this retrospective model comparison.','Regime and independent source audits require review before any investment conclusion; no automatic promotion.']});
}
if(require.main===module)try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,codeHashes};
