// Differential orchestration tests. Every input and fill is synthetic.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
const {input}=require('../c1-champion-control-parity-review.cjs');
const {createResearchModuleLoader}=require('../research-module-loader.cjs');
const {createControlAdapter}=require('./control-adapter.cjs');
const {verifySources}=require('./engine.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function runTests(){
 verifySources(root);let assertions=0;const cases=[];
 const same=(a,b)=>{assertions++;assert.deepEqual(clone(a),clone(b));};
 const ok=x=>{assertions++;assert.ok(x);};
 for(const scenario of [
  {name:'clear-entry',prices:[100,100,100,100]},
  {name:'event-block-no-backfill',prices:[100,100,100,100],event:true},
  {name:'sector-exclusion',prices:[100,100,100],sector:true},
  {name:'issuer-exclusion',prices:[100,100,100],issuer:true},
  {name:'fractional-model-whole-account',prices:[103.37,103.37,103.37]},
  {name:'incomplete-current-screen',prices:[100,100,100],missing:true},
  {name:'zero-broker-cash',prices:[100,100,100],zero:true},
  {name:'momentum-exit-and-recovery',prices:[100,99,98,97,96,97,98,99,100],held:300},
  {name:'gap-stop-priority',prices:[100,100,85,85,86],held:300},
  {name:'intraday-stop-fill',prices:[100,100,100],held:300,intraday:true},
  {name:'exit-with-zero-broker-cash',prices:[100,99,98,97,96],held:300,zero:true},
  {name:'breaker-and-cooldown',prices:[100,85,84,...Array(18).fill(86)],held:900},
  {name:'partial-fill-fee-continuation',prices:[100,100,100,100],partial:true}
 ]){
  const f=input(scenario.prices),all=f.dataset.sessions;
  // Modify independently supplied source facts before either side receives them.
  for(const session of all){
   if(scenario.event)session.screenRows.find(x=>x.symbol==='AAA').eventRisk={blockNewCapital:true};
   for(const field of ['signals','positionSignals','screenRows']){
    if(scenario.sector)session[field].find(x=>x.symbol==='BBB').sector='Sector 0';
    if(scenario.issuer){session[field].find(x=>x.symbol==='AAA').cik='12345';session[field].find(x=>x.symbol==='BBB').cik='12345';}
   }
   if(scenario.missing)session.screenRows=session.screenRows.filter(x=>x.symbol!=='AAA');
  }
  if(scenario.intraday)all[221].prices.find(p=>p.symbol==='AAA').low=85;
  const source=createResearchModuleLoader(root),adapter=createControlAdapter(root);
  const {createC1ProspectiveSeeds}=source.load('lib/c1AccountSeed.js');
  const {portfolioCompositionSignature}=source.load('lib/portfolioGovernor.js');
  const ex=source.load('lib/c1AccountExecution.js'),ledger=source.load('lib/c1AccountLedger.js');
  const {buildC1StockScreenSnapshot}=source.load('lib/c1StockClassification.js');
  const {resolveC1ScreenEvidence}=source.load('lib/c1ScreenEvidence.js');
  const {capC1ExecutionCash}=source.load('lib/c1ExecutionCashAuthority.js');
  const baseline=all[220],shares=scenario.held||0;
  const portfolio=[...(shares?[{symbol:'AAA',role:'Swing',shares,avgCost:100,openedAt:all[210].date}]:[]),{symbol:'CASH',role:'Swing',shares:100000-shares*100,avgCost:1}];
  const adoption=createC1ProspectiveSeeds({portfolio,baseline,capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:portfolioCompositionSignature(portfolio)},adoptionConfirmed:true});
  const frozen=JSON.stringify({all,adoption});let records=[],otherRecords=[],sales=0,stopSales=0,cooldowns=0,totalOrders=0,blocked=0,intradayStopFills=0,resumedBuys=0;
  for(let i=221;i<all.length;i++){
   const sessions=all.slice(220,i),historySessions=all.slice(0,i),s=sessions.at(-1),opening=all[i],observedAt=opening.date+'T15:00:00Z';
   const snapshot=buildC1StockScreenSnapshot(s,new Date(s.decisionAt),historySessions);
   const screen={decision:{stockScreen:snapshot,current:true,sourceSessionDate:s.date,decisionId:'synthetic:'+s.date},rows:s.screenRows,current:true};
   const account={brokerageCash:{balance:scenario.zero?0:100000,source:'manual-broker-balance',observedAt:opening.date+'T14:45:00Z'}};
   const args={adoption,sessions,historySessions,records,opening,observedAt,screen,account};
   const actual=adapter.project(args);
   const raw=i===221?ex.planC1ActualAccountOpening({adoption,baseline:s,historySessions,opening,observedAt}):ex.planC1ContinuedAccountOpening({...args,records:otherRecords});
   // Oracle follows production component sequence directly, independent of adapter.
   const evidence=resolveC1ScreenEvidence(screen),allowed=new Set(evidence.buySymbols);
   const expected=capC1ExecutionCash({plan:{...raw,orders:raw.orders.filter(o=>o.side!=='buy'||allowed.has(o.symbol)),projectedBooks:null},account:{...account,records:otherRecords},strategyCash:Object.values(raw.openingBooks).reduce((n,b)=>n+b.cash,0),now:new Date(observedAt)});
   same(actual.rawPlan,raw);same(actual.screenEvidence,evidence);same(actual.plan,expected);
   ok(actual.plan.orders.every(o=>Number.isSafeInteger(o.shares)));
   ok(actual.plan.orders.every(o=>raw.orders.some(p=>p.id===o.id&&p.symbol===o.symbol&&p.side===o.side)));
   if(scenario.event){ok(!actual.plan.orders.some(o=>o.side==='buy'&&o.symbol==='AAA'));if(i===221){ok(!actual.plan.orders.some(o=>o.side==='buy'&&o.symbol==='DDD'));same(actual.plan.orders.filter(o=>o.side==='buy').length,6);}}
   if(scenario.sector||scenario.issuer)ok(!actual.plan.orders.some(o=>o.side==='buy'&&o.symbol==='BBB'));
   if(scenario.missing||scenario.zero)ok(!actual.plan.orders.some(o=>o.side==='buy'));
   const fills=expected.orders.filter(o=>!o.condition||scenario.intraday&&i===221&&o.symbol==='AAA').map((o,j)=>({id:'synthetic:'+i+':'+j,orderId:o.id,symbol:o.symbol,side:o.side,shares:scenario.partial&&o.side==='buy'?Math.max(1,Math.floor(o.shares/2)):o.shares,price:o.estimatedPrice,fee:scenario.partial?.03:0,executedAt:observedAt}));
   intradayStopFills+=fills.filter(f=>expected.orders.find(o=>o.id===f.orderId)?.condition==='stop-triggered').length;
   if(i>237)resumedBuys+=fills.filter(f=>f.side==='buy').length;
   const a=adapter.record({review:actual,fills,observedAt}),b=ledger.reconcileC1ActualAccountFills({plan:expected,fills,observedAt});
   same(a.accepted,b);same(ledger.reconcileC1ActualAccountFills({plan:expected,fills:[...fills,...fills],observedAt}),b);
   if(fills.length){assertions++;assert.throws(()=>adapter.record({review:actual,fills:[...fills,{...fills[0],fee:99}],observedAt}),/Conflicting/);}
   records.push(a.record);otherRecords.push({date:opening.date,openingObservedAt:expected.observedAt,complete:true,...(expected.completionPolicy?{completionPolicy:expected.completionPolicy}:{}),executionEvidence:expected,fills:b.fills});
   const continuation={adoption,sessions:all.slice(220,i+1),historySessions:all.slice(0,i+1),records,observedAt:opening.date+'T22:00:00Z'};
   const aNext=adapter.continue(continuation),bNext=ledger.continueC1ActualAccount({...continuation,records:otherRecords});same(aNext,bNext);same(aNext.books,a.accepted.books);
   for(const book of Object.values(aNext.books))ok(book.cash>=0&&Object.values(book.positions).every(p=>Number.isSafeInteger(p.shares)));
   sales+=expected.orders.filter(o=>o.side==='sell'&&!o.condition).length;
   stopSales+=expected.orders.filter(o=>o.reason==='initial-stop'&&!o.condition).length;
   cooldowns+=Object.values(aNext.sleeves).filter(r=>r.accountRisk?.pausedThrough>=r.accountRisk?.activeSessionNumber).length;
   const decisionArgs={continued:aNext,sourceHash:'synthetic:'+opening.date,revision:i,now:new Date(continuation.observedAt),records,brokerageCash:account.brokerageCash};
   same(adapter.decision(decisionArgs),source.load('lib/c1AccountDecision.js').buildC1AccountDecision({...decisionArgs,continued:bNext,records:otherRecords}));
   totalOrders+=expected.orders.length;blocked+=actual.screenBlockedOrders.length;
  }
  same(JSON.stringify({all,adoption}),frozen);
  if(scenario.name==='momentum-exit-and-recovery')ok(sales>0);
  if(scenario.name==='gap-stop-priority')ok(stopSales>0);
  if(scenario.name==='exit-with-zero-broker-cash')ok(sales>0);
  if(scenario.name==='breaker-and-cooldown'){ok(cooldowns>0);ok(sales>0);}
  if(scenario.intraday)same(intradayStopFills,3);
  cases.push({name:scenario.name,status:'PASS',sessions:all.length-221,totalOrders,screenBlockedOrders:blocked,sales,stopSales,cooldownObservations:cooldowns,intradayStopFills,resumedBuys});
 }
 return {status:'PASS',scope:'Synthetic source/adapter orchestration only; not historical qualification or independent parity approval',productionCommit:verifySources(root),assertions,cases,tolerances:{decisionAndOrderIdentity:'exact, including IDs, sequence, side, symbol, reason, phase and integer shares',differentialNumeric:'exact in these deterministic VM tests; no rounding of monetary values for comparison',sourceLedgerCashInvariant:1e-6,sourceWholeShareInvariant:1e-7},historicalExecutions:0,independentApproval:false};
}
if(require.main===module){const report=runTests();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));}
module.exports={runTests};
