// Author: independent_control_review agent. Synthetic-only independent gates; no historical runs.
const path=require('node:path'),os=require('node:os');
// Independent proposed immutable lookup optimization. Synthetic data only.
const assert=require('assert/strict'),fs=require('fs'),root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../..');process.chdir(root);
const reviewOutputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-v2-'));fs.mkdirSync(reviewOutputDir,{recursive:true});const plain=x=>JSON.parse(JSON.stringify(x));
const {createResearchModuleLoader}=require(root+'/tools/c1-research/module-loader.cjs'),{input}=require(root+'/tools/c1-champion-control-parity-review.cjs');
const original=createResearchModuleLoader(root).load('lib/c1RecentMomentumGate.js');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b);};
const transform=require(root+'/tools/c1-exploratory/immutable-index.cjs').indexTransform;
const memo=createResearchModuleLoader(root,transform).load('lib/c1RecentMomentumGate.js'),cases=[];
function check(name,all){for(let i=220;i<all.length;i++){assert.deepEqual(plain(memo.readC1RecentMomentumPrice({session:all[i],symbol:'AAA'})),plain(original.readC1RecentMomentumPrice({session:all[i],symbol:'AAA'})));assert.deepEqual(plain(memo.readC1RecentMomentum({sessions:all,sessionIndex:i,symbol:'AAA'})),plain(original.readC1RecentMomentum({sessions:all,sessionIndex:i,symbol:'AAA'})));}cases.push({case:name,status:'PASS'});}
function freeze(all,rows=true){for(const s of all)for(const field of ['prices','signals','positionSignals','screenRows']){if(rows)for(const r of s[field])Object.freeze(r);Object.freeze(s[field]);}}
for(const frozen of [false,true]){
 let all=input([100,99,98,97,96,95]).dataset.sessions;if(frozen)freeze(all);check('baseline '+frozen,all);
 // Invalid stale/date/availability values are validated identically, not cached away.
 all=input([100,100,100]).dataset.sessions;all[221].prices.find(p=>p.symbol==='AAA').stale=true;if(frozen)freeze(all);check('stale price '+frozen,all);
 all=input([100,100,100]).dataset.sessions;all[221].prices.push({...all[221].prices.find(p=>p.symbol==='AAA'),symbol:' aaa '});if(frozen)freeze(all);check('duplicate normalized price '+frozen,all);
 all=input([100,100,100]).dataset.sessions;all[221].signals.push({...all[221].signals.find(p=>p.symbol==='AAA'),symbol:' aaa '});if(frozen)freeze(all);check('duplicate published signal priority '+frozen,all);
 all=input([100,100,100]).dataset.sessions;if(frozen)freeze(all);check('nested mutation before '+frozen,all);all[221].signals.find(p=>p.symbol==='AAA').entryTiming.availableAt='2099-01-01T00:00:00Z';check('nested timing future after '+frozen,all);
}
let all=input([100,100,100]).dataset.sessions;check('mutable before row rename',all);all[221].prices.find(p=>p.symbol==='AAA').symbol='OTHER';check('mutable after row rename',all);
all=input([100,100,100]).dataset.sessions;freeze(all,false);check('frozen arrays mutable rows before',all);all[221].prices.find(p=>p.symbol==='AAA').symbol='OTHER';check('frozen arrays mutable rows after',all);
const report={author:'independent_control_review agent',scope:'Proposed frozen JSON row symbol index equivalence, no cached policy results',cases,historicalExecutions:0};fs.writeFileSync(path.join(reviewOutputDir,'memo-actual-v2-gates.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log({cases:cases.length,status:'PASS'});
