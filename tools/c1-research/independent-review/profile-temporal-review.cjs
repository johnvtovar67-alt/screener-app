const assert=require('assert/strict'),fs=require('fs');
// Author: independent_control_review agent; owner-authorized independent synthetic review.
// No network, historical performance execution, or live account writes.
const path=require('node:path'),os=require('node:os');
const root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../../..');
// Existing production regression fixtures resolve their private loader from cwd.
process.chdir(root);
const outputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-review-'));
fs.mkdirSync(outputDir,{recursive:true});

const {qualifyProfile}=require(root+'/tools/c1-research/control-only.cjs');
const p={schema:'c1-control-execution-profile-v1',label:'retrospective-hypothetical',costBps:25,policyMode:'retrospective-current',fillsAreHypothetical:true,independentReview:{approved:true,reviewer:'synthetic test only'},executionAssumptionsFrozenAt:'2026-10-16T00:00:00Z',provenance:'synthetic',sessions:[{date:'2025-11-19',observedAt:'2025-11-19T15:00:00Z',closeObservedAt:'2025-11-19T22:00:00Z',decisionInputsAvailableAt:'2025-11-19T14:30:00Z',screen:{},fills:[],provenance:'synthetic'}]},dataset={sessions:[{date:'2025-11-19'}]},cases=[];
qualifyProfile(p,dataset);cases.push({case:'aligned synthetic profile',status:'PASS'});
for(const [name,change] of [['future decision inputs',x=>x.sessions[0].decisionInputsAvailableAt='2025-11-19T15:01:00Z'],['wrong session',x=>x.sessions[0].observedAt='2025-11-20T15:00:00Z'],['preopen',x=>x.sessions[0].observedAt='2025-11-19T14:00:00Z'],['unclosed session',x=>x.sessions[0].closeObservedAt='2025-11-19T20:00:00Z'],['not hypothetical',x=>x.fillsAreHypothetical=false],['unapproved cost',x=>x.costBps=15],['implicit policy',x=>delete x.policyMode]]){const q=JSON.parse(JSON.stringify(p));change(q);assert.throws(()=>qualifyProfile(q,dataset));cases.push({case:name,status:'PASS rejection'});}
fs.writeFileSync(path.join(outputDir,'profile-temporal-review.json'),JSON.stringify({author:'independent_control_review agent',cases,historicalExecutions:0,fullDatasetApproval:false},null,2)+'\n',{flag:'wx'});console.log(cases);
