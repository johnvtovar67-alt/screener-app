#!/usr/bin/env node
// Explicit control audit only. Never imports or loops over challenger arms.
const fs=require('node:fs'),path=require('node:path');
const {validateEvidence,sha}=require('./evidence.cjs');
const {verifySources}=require('./engine.cjs');
const {createControlAdapter}=require('./control-adapter.cjs');
const spec=require('./research-spec-v1.json'),root=path.resolve(__dirname,'../..');
const read=p=>JSON.parse(fs.readFileSync(p));
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
function codeIdentity(){const amendment=read(path.join(__dirname,'technical-amendment-v2.json'));for(const [file,digest] of Object.entries(amendment.files))if(sha(fs.readFileSync(path.join(root,file)))!==digest)throw Error('Technical amendment mismatch: '+file);return sha(fs.readFileSync(path.join(__dirname,'technical-amendment-v2.json')));}
function qualifyProfile(profile,dataset){
 if(profile.schema!=='c1-control-execution-profile-v1'||profile.label!=='retrospective-hypothetical'||profile.costBps!==12)throw Error('Qualified current-source 12bps control execution profile required; 25/50bps execution parity remains unapproved');
 if(profile.independentReview?.approved!==true||!profile.independentReview?.reviewer||!profile.executionAssumptionsFrozenAt||!profile.provenance)throw Error('Execution-profile provenance, frozen assumptions and independent review required');
 const dates=dataset.sessions.filter(s=>s.date>=spec.data.target_start&&s.date<=spec.data.target_end).map(s=>s.date);
 if(JSON.stringify(dates)!==JSON.stringify(profile.sessions?.map(s=>s.date)))throw Error('Execution profile must cover every target session exactly once');
 for(const s of profile.sessions){if(!s.availableAt||Date.parse(s.availableAt)>Date.parse(s.observedAt)||!Number.isFinite(Date.parse(s.availableAt))||!Number.isFinite(Date.parse(s.observedAt))||!Array.isArray(s.fills)||!s.screen||!s.provenance||!Number.isFinite(Date.parse(s.closeObservedAt))||Date.parse(s.closeObservedAt)<Date.parse(s.observedAt))throw Error('Missing/late session execution evidence: '+s.date);}
}
function main(args){
 const [command,manifestFile,profileFile,lockFile,outputFile]=args;
 if(!['validate','freeze','run'].includes(command)||!manifestFile)throw Error('Usage: control-only.cjs validate MANIFEST [PROFILE] | freeze MANIFEST PROFILE NEW_LOCK | run MANIFEST PROFILE LOCK NEW_OUTPUT');
 verifySources(root);const codeSha256=codeIdentity(),gate=validateEvidence(manifestFile,spec);
 if(command==='validate'){
  const {dataset,...receipt}=gate;let profileError=profileFile?null:'Qualified execution profile not supplied';
  if(profileFile)try{qualifyProfile(read(profileFile),dataset);}catch(e){profileError=e.message;}
  console.log(JSON.stringify({...receipt,controlOnly:true,profileError,executionReady:gate.status==='READY_FOR_RESEARCH'&&!profileError},null,2));
  if(gate.status!=='READY_FOR_RESEARCH'||profileError)process.exitCode=2;return;
 }
 if(gate.status!=='READY_FOR_RESEARCH')throw Error('Historical control blocked by input qualification: '+JSON.stringify({errors:gate.errors,auditRequired:gate.auditRequired}));
 if(!profileFile||!lockFile)throw Error('Explicit execution profile and lock required');
 const profile=read(profileFile);qualifyProfile(profile,gate.dataset);
 const identity={schema:'c1-control-only-lock-v2',arm:'C',costBps:12,manifestSha256:gate.manifestSha256,profileSha256:sha(fs.readFileSync(profileFile)),codeSha256};
 if(command==='freeze'){save(lockFile,identity);return;}
 if(!outputFile||fs.existsSync(outputFile))throw Error('Explicit new output required; overwrites refused');
 if(JSON.stringify(read(lockFile))!==JSON.stringify(identity))throw Error('Frozen data/profile/code mismatch');
 const adapter=createControlAdapter(root),all=gate.dataset.sessions,first=all.findIndex(s=>s.date===spec.data.target_start);
 if(first<1)throw Error('Prior baseline and warmup required');
 const baseline=all[first-1],portfolio=[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}];
 const {portfolioCompositionSignature}=adapter.loader.load('lib/portfolioGovernor.js');
 const {createC1ProspectiveSeeds}=adapter.loader.load('lib/c1AccountSeed.js');
 const adoption=createC1ProspectiveSeeds({portfolio,baseline,capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:portfolioCompositionSignature(portfolio)},adoptionConfirmed:true});
 // No implicit retrospective policy activation: current production source is
 // date-gated. A full-window October-policy transform still needs parity proof.
 if(baseline.date<'2026-10-14')throw Error('Full-interval October-policy activation parity is not established; historical execution remains blocked');
 const records=[],reviews=[];
 for(const item of profile.sessions){
  const index=all.findIndex(s=>s.date===item.date),review=adapter.project({adoption,sessions:all.slice(first-1,index),historySessions:all.slice(0,index),records,opening:all[index],observedAt:item.observedAt,screen:item.screen,account:item.account});
  const accepted=adapter.record({review,fills:item.fills,observedAt:item.closeObservedAt});records.push(accepted.record);
  const continued=adapter.continue({adoption,sessions:all.slice(first-1,index+1),historySessions:all.slice(0,index+1),records,observedAt:item.closeObservedAt});
  reviews.push({date:item.date,review,books:continued.books});
 }
 save(outputFile,{label:'Control-only hypothetical decision/accounting audit; not production history',identity,adoption,records,reviews,challengersExecuted:0});
}
if(require.main===module)try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,qualifyProfile};
