const assert=require('assert/strict'),fs=require('fs');
// Author: independent_control_review agent; owner-authorized independent synthetic review.
// No network, historical performance execution, or live account writes.
const path=require('node:path'),os=require('node:os');
const root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../../..');
// Existing production regression fixtures resolve their private loader from cwd.
process.chdir(root);
const outputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-review-'));
fs.mkdirSync(outputDir,{recursive:true});

const {createResearchModuleLoader}=require(root+'/tools/research-module-loader.cjs');
const {createControlAdapter}=require(root+'/tools/c1-research/control-adapter.cjs');
const {fixture}=require(root+'/tools/c1-recent-momentum-challenger-regression.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),results=[];
for(const costBps of [12,25,50]){
 const f=fixture([100,100,99,98,97,96]),all=f.dataset.sessions;
 for(const s of all)s.screenRows=s.signals.map(x=>({...x,expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}},eventRisk:{blockNewCapital:false}}));
 const oracle=createResearchModuleLoader(root),days=oracle.load('lib/marketSession.js');
 oracle.load('lib/c1RecentMomentumLivePolicy.js').c1RecentMomentumLiveApplies=date=>days.isUsMarketSessionDay(date);
 const options=oracle.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;for(const x of Object.values(options))x.slippageBps=costBps;
 const adapter=createControlAdapter(root,{costBps,policyMode:'retrospective-current'}),ex=oracle.load('lib/c1AccountExecution.js'),ledger=oracle.load('lib/c1AccountLedger.js');
 const portfolio=[{symbol:'AAA',role:'Swing',shares:300,avgCost:100,openedAt:all[210].date},{symbol:'CASH',role:'Swing',shares:70000,avgCost:1}];
 const adoption=oracle.load('lib/c1AccountSeed.js').createC1ProspectiveSeeds({portfolio,baseline:all[220],capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:oracle.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio)},adoptionConfirmed:true});
 let records=[],referenceRecords=[],sales=0;
 for(let i=221;i<all.length;i++){
  const sessions=all.slice(220,i),historySessions=all.slice(0,i),s=sessions.at(-1),opening=all[i],observedAt=opening.date+'T15:00:00Z';
  const screen={decision:{stockScreen:oracle.load('lib/c1StockClassification.js').buildC1StockScreenSnapshot(s,new Date(s.decisionAt),historySessions),current:true,sourceSessionDate:s.date,decisionId:'independent'},rows:s.screenRows,current:true};
  const account={brokerageCash:{balance:100000,source:'manual-broker-balance',observedAt:opening.date+'T14:45:00Z'}};
  const args={adoption,sessions,historySessions,records,opening,observedAt,screen,account};
  const actual=adapter.project(args),raw=i===221?ex.planC1ActualAccountOpening({adoption,baseline:s,historySessions,opening,observedAt}):ex.planC1ContinuedAccountOpening({...args,records:referenceRecords});
  assert.deepEqual(plain(actual.rawPlan),plain(raw));
  const authority=oracle.load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash({plan:raw,account:{...account,records:referenceRecords},strategyCash:Object.values(raw.openingBooks).reduce((n,b)=>n+b.cash,0),now:new Date(observedAt)});
  assert.deepEqual(plain(actual.authorityPlan),plain(authority));
  const allowed=new Set(oracle.load('lib/c1ScreenEvidence.js').resolveC1ScreenEvidence(screen).buySymbols),orders=authority.orders.filter(o=>o.side!=='buy'||allowed.has(o.symbol));
  assert.deepEqual(plain(actual.plan.orders),plain(orders));
  const fills=orders.filter(o=>!o.condition).map((o,j)=>({id:`review:${i}:${j}`,orderId:o.id,symbol:o.symbol,side:o.side,shares:o.shares,price:o.estimatedPrice,fee:.01,executedAt:observedAt}));
  const a=adapter.record({review:actual,fills,observedAt}),b=ledger.reconcileC1ActualAccountFills({plan:authority,fills,observedAt});
  assert.deepEqual(plain(a.accepted),plain(b));assert.deepEqual(plain(a.record.executionEvidence),plain(authority));records.push(a.record);referenceRecords.push({...a.record,executionEvidence:authority,fills:b.fills});
  const cargs={adoption,sessions:all.slice(220,i+1),historySessions:all.slice(0,i+1),records,observedAt:opening.date+'T22:00:00Z'};
  assert.deepEqual(plain(adapter.continue(cargs)),plain(ledger.continueC1ActualAccount({...cargs,records:referenceRecords})));
  sales+=fills.filter(f=>f.side==='sell').length;
 }
 results.push({costBps,status:'PASS',sourceDate:all[220].date,sessions:all.length-221,sales,seams:adapter.policyProfile.seams});
}
fs.writeFileSync(path.join(outputDir,'policy-cost-review.json'),JSON.stringify({author:'independent_control_review agent',scope:'Synthetic current-policy source seam and component accounting, not live operational authority or historical data approval',results,historicalExecutions:0,numericTolerance:'exact deep equality; no decimal rounding'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(results));
