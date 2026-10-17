// Author: independent_control_review agent. Synthetic-only independent gates; no historical runs.
const path=require('node:path'),os=require('node:os');
// Independent synthetic challenger gate. No historical dataset loaded.
const fs=require('fs'),assert=require('assert/strict'),root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../..');process.chdir(root);
const reviewOutputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-v2-'));fs.mkdirSync(reviewOutputDir,{recursive:true});const plain=x=>JSON.parse(JSON.stringify(x));
const spec=require(root+'/tools/c1-research/research-spec-v1.json'),{challengerTransform}=require(root+'/tools/c1-exploratory/transform.cjs'),{createControlAdapter}=require(root+'/tools/c1-exploratory/account-adapter.cjs'),{execute}=require(root+'/tools/c1-exploratory/runner.cjs'),{input}=require(root+'/tools/c1-champion-control-parity-review.cjs');
const base=createControlAdapter(root,{policyMode:'retrospective-current'}).loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
const files=['lib/c1FrozenOptions.js','lib/c1StockClassification.js','lib/c1RecentMomentumGate.js','lib/c1RecentMomentumChallengerSimulator.js'],cases=[];
for(const arm of spec.arms){
 const transform=challengerTransform(arm),changed=files.filter(file=>{const text=fs.readFileSync(root+'/'+file,'utf8');return transform(file,text)!==text;});
 const allowed=arm.id==='C'?[]:arm.family==='momentum-ablation'?['lib/c1RecentMomentumGate.js']:arm.family==='selection'?['lib/c1StockClassification.js']:['lib/c1FrozenOptions.js','lib/c1RecentMomentumChallengerSimulator.js',...(arm.entry_selection_cap===9?['lib/c1StockClassification.js']:[])];assert.deepEqual(changed.sort(),allowed.sort());
 const loader=createControlAdapter(root,{policyMode:'retrospective-current',transform}).loader,opts=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
 for(const id of Object.keys(base)){const actual=plain(opts[id]),expected=plain(base[id]);if(typeof arm.sizing==='object')for(const k of ['maxPositions','rankedTargetCount','buyMaxPositionPct','strongBuyMaxPositionPct'])delete actual[k],delete expected[k];assert.deepEqual(actual,expected);assert.equal(opts[id].rankedExitBuffer,6);assert.equal(opts[id].rankedEntryQueueCount,9);}
 const f=input([100,100,100]),all=f.dataset.sessions,dataset={sessions:all.slice(220),historyWarmup:all.slice(0,220)};
 try{const r=execute(dataset,arm,12,{limit:2,checkCausality:true});cases.push({arm:arm.id,status:'PASS synthetic execution',changedFiles:changed,fills:r.trades.length});}catch(e){cases.push({arm:arm.id,status:'BLOCKED synthetic execution',changedFiles:changed,error:e.message});}
}
const report={author:'independent_control_review agent',scope:'Synthetic12arm source seam isolation, frozen safeguards and execution smoke gates only; not performance evidence',cases,historicalExecutions:0};fs.writeFileSync(path.join(reviewOutputDir,'challenger-actual-v2-gates.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);
