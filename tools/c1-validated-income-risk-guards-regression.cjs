const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),epoch=loader.load('lib/c1OperationalRiskEpoch.js'),flows=loader.load('lib/c1CashFlowReplay.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const evidence={allocation:'base',triggerDate:'2026-11-25',completedDate:'2026-11-25',historicalPeak:1000,
 openingBook:{cash:100,positions:{LLL:{shares:7,avgCost:100}}},closingBook:{cash:800,positions:{}},risk:{highWater:1000,paused:true},
 orders:[{id:'fictional-loss',sleeve:'base',symbol:'LLL',side:'sell',shares:7}],
 fills:[{id:'fictional-fill',orderId:'fictional-loss',symbol:'LLL',side:'sell',shares:7,price:100,fee:0,executedAt:'2026-11-25T15:00:00Z'}]};
const snapshot=clone(evidence),receipt=epoch.captureC1OperationalRiskLiquidation(evidence);
const policy={active:true,activationDate:'2026-11-11',operationalRiskReceipts:{base:[receipt]}},state={historicalHighWater:1000,operationalHighWater:1000,appliedEpochs:[],requiresLiquidationEpoch:true};
const input={policy,state,session:{date:'2026-11-27'},allocation:'base',openingEquity:804};
function replay({amount=4,scale=1,sleeve='base',date='2026-11-27',events=[],openingEvents}={}){
 const current={contract:'c1-actual-fill-replay-v1',sessions:[],projectionDate:date};
 flows.markC1CashFlowReplay(current,{sleeve,actualDollarsPerModelDollar:scale,sourceDigest:'a'.repeat(64),events,
  openingEvents:openingEvents||[{id:'fictional-pnl',date,amount,kind:'pnl'}]});return current;
}
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name);}
check('only genuine matching journal cash can reconcile the once-only exit reference in the original units',()=>{
 for(const scale of [1,.1,10]){
  const result=epoch.operationalRiskForSession({...input,state:{...state,historicalHighWater:1000/scale,operationalHighWater:1000/scale},
   equityScale:scale,openingEquity:804/scale,cashFlowReplay:replay({scale})});
  assert.equal(result.purchaseRiskReady,true);assert.equal(result.resetApplied,true);assert.equal(result.appliedEpochs.length,1);
  assert(Math.abs(result.operationalHighWater-800/scale)<1e-6);assert.equal(result.historicalHighWater,1000/scale);
  const later=epoch.operationalRiskForSession({...input,state:result,session:{date:'2026-11-30'},openingEquity:790/scale,equityScale:scale,cashFlowReplay:replay({scale})});
  assert.equal(later.resetApplied,false);assert.equal(later.appliedEpochs.length,1);assert.equal(later.operationalHighWater,result.operationalHighWater);
 }
});
check('missing, serialized, wrong-date, wrong-allocation, wrong-unit and unexplained cash remain blocked',()=>{
 const good=replay();
 for(const cashFlowReplay of [undefined,clone(good),replay({date:'2026-11-30'}),replay({sleeve:'cooldown15'}),replay({scale:2}),replay({amount:3})]){
  const result=epoch.operationalRiskForSession({...input,cashFlowReplay});
  assert.equal(result.status,'post-exit-equity-changed');assert.equal(result.purchaseRiskReady,false);assert.equal(result.resetApplied,false);
 }
 assert.equal(epoch.operationalRiskForSession({...input,openingEquity:805,cashFlowReplay:good}).purchaseRiskReady,false);
 const historical=replay({openingEvents:[],events:[{id:'fictional-history',date:'2026-11-27',amount:4,kind:'pnl'}]});
 assert.equal(epoch.operationalRiskForSession({...input,cashFlowReplay:historical}).purchaseRiskReady,false,'Dated closing events are not current-opening evidence');
});
check('fees remain P&L against the conserved original reset and the same 12% protection',()=>{
 for(const amount of [-4,-96]){
  const result=epoch.operationalRiskForSession({...input,openingEquity:800+amount,cashFlowReplay:replay({amount})});
  assert.equal(result.purchaseRiskReady,true);assert.equal(result.operationalHighWater,800);assert.equal(result.epoch.reference,800);
  assert.equal(epoch.c1OperationalPortfolioLoss({operationalHighWater:result.operationalHighWater,openingEquity:800+amount}).triggered,amount===-96);
 }
});
check('journal capability does not bypass liquidation ownership, original receipt, approval or next-opening checks',()=>{
 const cashFlowReplay=replay();
 for(const [patch,status]of [
  [{hasOpenHoldings:true},'holding-continuity'],
  [{policy:{...policy,operationalRiskReceipts:{base:[clone(receipt)]}}},'liquidation-evidence-required'],
  [{policy:{...policy,operationalRiskReceipts:{}}},'liquidation-evidence-required'],
  [{session:{date:'2026-11-25'}},'awaiting-next-opening'],
  [{policy:{...policy,operationalRiskDecision:{status:'pending-owner-decision'}}},'pending-owner-decision']
 ]){const result=epoch.operationalRiskForSession({...input,cashFlowReplay,...patch});assert.equal(result.status,status);assert.equal(result.purchaseRiskReady,false);}
});
check('duplicate identities are counted once, conflicts reject and opening capital cannot be admitted as P&L',()=>{
 const event={id:'fictional-pnl',date:'2026-11-27',amount:4,kind:'pnl'};
 assert.equal(epoch.operationalRiskForSession({...input,cashFlowReplay:replay({openingEvents:[event,clone(event)]})}).operationalHighWater,800);
 assert.throws(()=>replay({openingEvents:[event,{...event,amount:5}]}),/Conflicting/);
 assert.throws(()=>replay({openingEvents:[{...event,kind:'capital'}]}),/Invalid dated/);
 const zero=replay({openingEvents:[event,{...event,id:'fictional-fee',amount:-4}]});
 assert.equal(epoch.operationalRiskForSession({...input,openingEquity:800,cashFlowReplay:zero}).operationalHighWater,800);
});
assert.equal(JSON.stringify(evidence),JSON.stringify(snapshot),'Original quantities, fills, basis, cash and risk proof stay unchanged');
assert.equal(JSON.stringify(state),JSON.stringify({historicalHighWater:1000,operationalHighWater:1000,appliedEpochs:[],requiresLiquidationEpoch:true}));
console.log(`PASS: ${checks} scoped authority/epoch guard cases; no live data or writes.`);
