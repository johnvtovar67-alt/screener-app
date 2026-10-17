const fs=require('fs');
// Author: independent_control_review agent; owner-authorized independent synthetic review.
// No network, historical performance execution, or live account writes.
const path=require('node:path'),os=require('node:os');
const root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../../..');
// Existing production regression fixtures resolve their private loader from cwd.
process.chdir(root);
const outputDir=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-independent-review-'));
fs.mkdirSync(outputDir,{recursive:true});

const {input}=require(root+'/tools/c1-champion-control-parity-review.cjs');
const {createResearchModuleLoader}=require(root+'/tools/research-module-loader.cjs');
const {createControlAdapter}=require(root+'/tools/c1-research/control-adapter.cjs');
const l=createResearchModuleLoader(root),adapter=createControlAdapter(root),f=input(),all=f.dataset.sessions,s=all[220],opening=all[221],history=all.slice(0,221),observedAt=opening.date+'T15:00:00Z';
s.screenRows.find(x=>x.symbol==='AAA').eventRisk={blockNewCapital:true};
const portfolio=[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],sig=l.load('lib/portfolioGovernor.js').portfolioCompositionSignature;
const adoption=l.load('lib/c1AccountSeed.js').createC1ProspectiveSeeds({portfolio,baseline:s,capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:sig(portfolio)},adoptionConfirmed:true});
const screen={decision:{stockScreen:l.load('lib/c1StockClassification.js').buildC1StockScreenSnapshot(s,new Date(s.decisionAt),history),current:true,sourceSessionDate:s.date,decisionId:'review'},rows:s.screenRows,current:true};
const account={brokerageCash:{balance:10000,source:'manual-broker-balance',observedAt:opening.date+'T14:45:00Z'}};
const actual=adapter.project({adoption,sessions:[s],historySessions:history,records:[],opening,observedAt,screen,account});
const capped=l.load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash({plan:actual.rawPlan,account,strategyCash:100000,now:new Date(observedAt)});
const allowed=new Set(l.load('lib/c1ScreenEvidence.js').resolveC1ScreenEvidence(screen).buySymbols);
const summary=a=>a.filter(x=>x.side==='buy').map(x=>({id:x.id,symbol:x.symbol,shares:x.shares,price:x.estimatedPrice}));
const expected=summary(capped.orders.filter(x=>x.side!=='buy'||allowed.has(x.symbol))),got=summary(actual.plan.orders);
const report={reviewer:'independent_control_review agent; independent source inspection',case:'event-blocked-first-candidate-with-10000-broker-cash',productionCommit:'0a65e20964ae080b8718332e5f6f16daa6def452',expectedProductionCashThenVisibleScreen:expected,actualAdapter:got,exact:JSON.stringify(expected)===JSON.stringify(got),historicalExecutions:0};
fs.writeFileSync(path.join(outputDir,'cash-screen-counterexample.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
const assert=require('assert/strict');
assert.equal(JSON.stringify(got),JSON.stringify(expected),'cash-before-screen source identity; VM prototypes excluded');
const blocked=actual.authorityPlan.orders.find(o=>o.side==='buy'&&!allowed.has(o.symbol));
assert.ok(blocked);assert.throws(()=>adapter.record({review:actual,fills:[{id:'blocked',orderId:blocked.id,symbol:blocked.symbol,side:blocked.side,shares:1,price:blocked.estimatedPrice,fee:0,executedAt:observedAt}],observedAt}),/outside the screen-permitted/);
const permitted=actual.plan.orders.find(o=>o.side==='buy');
assert.throws(()=>adapter.record({review:actual,fills:[{id:'oversize',orderId:permitted.id,symbol:permitted.symbol,side:permitted.side,shares:permitted.shares+1,price:permitted.estimatedPrice,fee:0,executedAt:observedAt}],observedAt}),/outside the screen-permitted/);
