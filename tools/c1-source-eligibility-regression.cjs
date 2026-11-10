const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {applySourceEligibilityFixture}=require('./fixtures/c1-source-eligibility.cjs');
const loader=createResearchModuleLoader(process.cwd());
const screen=loader.load('lib/c1StockClassification.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b,message)=>assert.deepEqual(clone(a),clone(b),message);
const workflow=applySourceEligibilityFixture(createWorkflowFixture('buy',{baselineDate:'2026-11-09',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]}));
workflow.setCash(100000);
const baseline=workflow.book.model.sessions.at(-1);
const snapshot=()=>screen.buildC1StockScreenSnapshot(baseline,workflow.now,workflow.book.model.sessions);
const buys=rows=>rows.filter(r=>['Buy','Strong Buy'].includes(r.rating)).map(r=>r.symbol);
const ratings=()=>screen.classifyC1StockScreen({snapshot:snapshot(),rows:workflow.screenRows(),current:true});
eq(buys(ratings()),['BBB','DDD','EEE'],'A source-ineligible leader cannot reserve the healthcare slot');
const mrna=ratings().find(r=>r.symbol==='MRNA');
assert.match(mrna.screenReview.why,/375\.71%.*100\.00%/);
assert.equal(snapshot().candidates.find(c=>c.symbol==='MRNA').qualifiedRank,null);
assert.equal(snapshot().candidates.find(c=>c.symbol==='MRNA').researchRank,1,'Historical rank remains visible');
assert.equal(snapshot().candidates.find(c=>c.symbol==='BBB').qualifiedRank,1);
assert.match(ratings().find(r=>r.symbol==='CCC').screenReview.why,/sector is already selected/,'One eligible healthcare representative, not two');

const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
const {c1AccountRankEligible}=loader.load('lib/c1RecentMomentumChallengerSimulator.js');
const source=baseline.signals.find(s=>s.symbol==='MRNA'),saved=clone(source);
let comparisons=0;
for(const volatility of [0,20,100,100.0001,375.71,null,undefined,'','bad','20',false,' ']){
 for(const available of [true,false])for(const coverage of [1,0,-1,null]){
  source.researchFactors.volatility60Pct=volatility;source.researchFactors.factorCoverage=coverage;source.entryTiming.available=available;
  const candidate=snapshot().candidates.find(c=>c.symbol==='MRNA');
  for(const options of Object.values(C1_FROZEN_OPTIONS)){
   assert.equal(candidate.sourcePurchaseGate.eligible,c1AccountRankEligible(source,options),'Same accepted-source eligibility as every account sleeve');comparisons++;
  }
 }
}
Object.assign(source,clone(saved));

// Frozen pre-activation output and all original source oracles stay intact.
const fs=require('node:fs');
const oldSource=require('./c1-source-eligibility-seams.cjs').restore('lib/c1StockClassification.js',fs.readFileSync('lib/c1StockClassification.js','utf8'));
const tmp=require('node:os').tmpdir(),path=require('node:path');
const dir=fs.mkdtempSync(path.join(tmp,'c1-source-gate-'));
try{
 fs.cpSync('lib',path.join(dir,'lib'),{recursive:true});fs.writeFileSync(path.join(dir,'lib/c1StockClassification.js'),oldSource);
 const old=createResearchModuleLoader(dir).load('lib/c1StockClassification.js');
 const history=workflow.book.model.sessions.slice(0,-1),previous=history.at(-1);
 eq(screen.buildC1StockScreenSnapshot(previous,workflow.now,history),old.buildC1StockScreenSnapshot(previous,workflow.now,history),'Pre-Nov9 selection is byte-equivalent');
 const oldSnapshot=old.buildC1StockScreenSnapshot(baseline,workflow.now,workflow.book.model.sessions);
 eq(buys(old.classifyC1StockScreen({snapshot:oldSnapshot,rows:workflow.screenRows(),current:true})),['MRNA','DDD','EEE'],'Exact released code reproduces reported crowded sector');
}finally{fs.rmSync(dir,{recursive:true,force:true});}

// Nine ineligible historical leaders cannot exhaust the candidate budget.
const savedSignals=clone(baseline.signals);
for(const s of baseline.signals.slice(0,9))s.researchFactors.volatility60Pct=200;
eq(snapshot().candidates.filter(c=>c.qualifiedRank!==null).map(c=>c.symbol),['JJJ','KKK','LLL','DELL']);
assert(snapshot().candidates.length<=18);
for(const s of baseline.signals)s.researchFactors.volatility60Pct=200;
eq(buys(ratings()),[],'All source-ineligible gives zero purchases');
for(let i=0;i<baseline.signals.length;i++)Object.assign(baseline.signals[i],savedSignals[i]);

async function actualFlow(){
 const before=JSON.stringify(workflow.account);
 const evidenceBefore=JSON.stringify(workflow.book);
 const view=await workflow.prepare();
 const names=[...new Set(view.openingPlan.orders.filter(o=>o.side==='buy'&&!o.condition).map(o=>o.symbol))];
 eq(names,['BBB','DDD','EEE'],'Actual three-sleeve opening plan agrees with screen');
 const actual=require('./fixtures/c1-normal-refresh-screen.cjs').createNormalRefreshScreen(workflow);
 const response=await actual.request({compact:'1',screenSymbols:snapshot().candidates.map(c=>c.symbol).join(',')});
 assert.equal(response.status,200);
 const classified=screen.classifyC1StockScreen({snapshot:snapshot(),rows:response.body.stocks,current:true});
 eq(buys(classified),names,'Actual provider adapters and transport agree with account');
 assert.match(classified.find(r=>r.symbol==='MRNA').screenReview.why,/375\.71%.*100\.00%/);
 assert.equal(JSON.stringify(workflow.account),before,'No account/holdings/cash/history mutation');
 assert.equal(JSON.stringify(workflow.book),evidenceBefore,'Accepted source book is unchanged');
 assert.equal(workflow.writes,0);
 console.log(JSON.stringify({status:'PASS',canonicalEligibilityComparisons:comparisons,checkedSymbols:names,sourceHistoryUnchanged:true,productionWrites:0}));
}
actualFlow().catch(error=>{console.error(error);process.exitCode=1;});
