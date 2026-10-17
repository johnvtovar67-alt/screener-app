// Author: independent_control_review agent. Synthetic-only independent gates; no historical runs.
const path=require('node:path'),os=require('node:os');
const assert=require('assert/strict'),fs=require('fs'),root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../..');process.chdir(root);
const reviewOutputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-v2-'));fs.mkdirSync(reviewOutputDir,{recursive:true});const plain=x=>JSON.parse(JSON.stringify(x));
const {input}=require(root+'/tools/c1-champion-control-parity-review.cjs'),{createControlAdapter}=require(root+'/tools/c1-exploratory/account-adapter.cjs'),{challengerTransform}=require(root+'/tools/c1-exploratory/transform.cjs');
const ids=['C','M-entry-off','M-macd-off','M-deterioration-off','M-giveback-off'],mods=Object.fromEntries(ids.map(id=>[id,createControlAdapter(root,{policyMode:'retrospective-current',transform:challengerTransform({id})}).loader.load('lib/c1RecentMomentumGate.js')]));
const cases=[];
for(const scenario of [{name:'deterioration',prices:[100,99,98,97,96,95],macd:false,peak:100},{name:'MACD-confirmation-removal',prices:[100,99,98,97,96,95],macd:true,peak:100},{name:'positive-no-trigger',prices:[100,101,102,103,104,105],macd:true,peak:110},{name:'independent-profit-giveback',prices:[90,92,94,112,106,105],macd:false,peak:120}]){
 const all=input(scenario.prices).dataset.sessions;for(const s of all)for(const field of ['signals','positionSignals','screenRows'])for(const x of s[field])x.entryTiming.macdImproving=scenario.macd;
 const results={};for(const id of ids){let prior=null,reviews=[];for(let i=220;i<all.length;i++){const out=mods[id].evaluateC1RecentMomentum({sessions:all,sessionIndex:i,symbol:'AAA',sleeve:'base',position:{symbol:'AAA',positionId:'synthetic-independent',entryPrice:100,enteredAt:all[210].date,highWatermark:scenario.peak,recentMomentumPeakVerified:true},prior});assert(out.available);reviews.push(plain(out));prior=out.state;}results[id]=reviews;}
 // Entry-only removes only entryAllowed; holding state and metrics stay exact.
 for(let i=0;i<results.C.length;i++){const c=plain(results.C[i]),a=plain(results['M-entry-off'][i]);delete c.entryAllowed;delete a.entryAllowed;assert.deepEqual(a,c);}
 if(scenario.name==='positive-no-trigger')for(const id of ids)assert.deepEqual(results[id],results.C);
 if(scenario.name==='deterioration'){assert(results.C.some(x=>x.exitReason));assert(results['M-deterioration-off'].every(x=>x.state.streak===0));}
 if(scenario.name==='MACD-confirmation-removal'){assert(results.C.every(x=>!x.exitReason));assert(results['M-macd-off'].some(x=>x.exitReason));}
 if(scenario.name==='independent-profit-giveback'){const c=results.C.at(-1),g=results['M-giveback-off'].at(-1),d=results['M-deterioration-off'].at(-1);assert(c.state.profitGivebackStreak>=2);assert(c.exitReason);assert.equal(g.state.profitGivebackStreak,0);assert.equal(d.exitReason,c.exitReason);}
 cases.push({scenario:scenario.name,status:'PASS',final:Object.fromEntries(ids.map(id=>[id,{exit:results[id].at(-1).exitReason,streak:results[id].at(-1).state.streak,giveback:results[id].at(-1).state.profitGivebackStreak}]))});
}
fs.writeFileSync(path.join(reviewOutputDir,'ablation-gates.json'),JSON.stringify({author:'independent_control_review agent',cases,historicalExecutions:0},null,2)+'\n',{flag:'wx'});console.log(cases);
