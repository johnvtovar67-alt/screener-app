const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {captureC1OperationalRiskLiquidation:capture,operationalRiskForSession:apply,
 c1OperationalPortfolioLoss:loss,C1_OPERATIONAL_RISK_DECISION:approvedDecision,C1_OPERATIONAL_RISK_MODE:mode}=loader.load('lib/c1OperationalRiskEpoch.js');
const clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(approvedDecision.status,'approved','The actual owner-approved server configuration is active');
assert.equal(approvedDecision.mode,mode);
const pending=Object.freeze({status:'pending-owner-decision',mode:null});
function evidence(overrides={}){
 return {allocation:'base',triggerDate:'2026-11-25',completedDate:'2026-11-25',historicalPeak:1000,
  openingBook:{cash:100,positions:{AAA:{shares:5,avgCost:100},BBB:{shares:2,avgCost:200}}},
  closingBook:{cash:800,positions:{}},risk:{highWater:1000,paused:true},
  orders:[{id:'one',sleeve:'base',symbol:'AAA',side:'sell',shares:5,reason:'owner-discretionary-exit'},
   {id:'two',sleeve:'base',symbol:'BBB',side:'sell',shares:2,reason:'owner-discretionary-exit'}],
  fills:[{id:'fill1',orderId:'one',symbol:'AAA',side:'sell',shares:5,price:100,fee:1,executedAt:'2026-11-25T15:00:00Z'},
   {id:'fill2',orderId:'two',symbol:'BBB',side:'sell',shares:2,price:101,fee:1,executedAt:'2026-11-25T15:01:00Z'}],...overrides};
}
const original=evidence(),before=JSON.stringify(original),receipt=capture(original);
assert(receipt,'Reconciled owner-recorded full liquidation can establish a risk episode');
assert.equal(JSON.stringify(original),before,'Receipt never mutates financial evidence');
const state={historicalHighWater:1000,operationalHighWater:1000,appliedEpochs:[],requiresLiquidationEpoch:true};
const policy={active:true,activationDate:'2026-11-11',operationalRiskDecision:pending,operationalRiskReceipts:{base:receipt}};
const call=(p=policy,s=state,date='2026-11-27',extra={})=>apply({policy:p,state:s,session:{date},allocation:'base',openingEquity:800,...extra});
let result=call();assert.equal(pending.status,'pending-owner-decision');assert.equal(result.purchaseRiskReady,false);assert.equal(result.operationalHighWater,1000);assert.equal(result.resetApplied,false);
const approved={...policy,operationalRiskDecision:approvedDecision};
result=call(approved,state,'2026-11-25');assert.equal(result.status,'awaiting-next-opening');assert.equal(result.resetApplied,false);
assert.throws(()=>call(approved,state,'2026-11-26'),/risk state/,'Thanksgiving is not a trading opening');
result=call(approved);assert.equal(result.resetApplied,true);assert.equal(result.operationalHighWater,800);assert.equal(result.historicalHighWater,1000);assert.equal(result.epoch.effectiveDate,'2026-11-27','Holiday skips to Friday opening');
assert.equal(call(approved,result,'2026-11-30',{openingEquity:790}).resetApplied,false,'Same receipt never resets again');
assert.equal(call(approved,result,'2026-11-30',{openingEquity:790}).operationalHighWater,800,'Loss cannot ratchet the operational reference downward');
assert.equal(loss({operationalHighWater:800,openingEquity:704}).triggered,true,'The same 12% portfolio loss protection remains active');
assert.equal(loss({operationalHighWater:800,openingEquity:705}).triggered,false);
assert.equal(call({...approved,operationalRiskReceipts:{base:clone(receipt)}}).status,'liquidation-evidence-required','Serialized/client receipt cannot authorize a reset');
assert.equal(call(approved,state,'2026-11-27',{hasOpenHoldings:true}).status,'holding-continuity','Activation cannot force an existing holding out');
assert.equal(call(approved,state,'2026-11-27',{openingEquity:799}).status,'post-exit-equity-changed','Intervening investment/equity change cannot become an unreviewed reset');
assert.equal(call({...approved,operationalRiskReceipts:{}}).purchaseRiskReady,false,'Missing episode evidence fails closed');
const scaled=call(approved,{historicalHighWater:10000,operationalHighWater:10000,appliedEpochs:[]},'2026-11-27',{openingEquity:8000,equityScale:.1});
assert.equal(scaled.operationalHighWater,8000);assert.equal(scaled.historicalHighWater,10000,'Model units do not change historical dollar economics');
const transition={...approved,activationDate:'2026-11-30'};
assert.equal(call(transition,state,'2026-11-27').status,'awaiting-next-opening');
assert.equal(call(transition,state,'2026-11-30').epoch.effectiveDate,'2026-11-30','A legacy episode transitions prospectively, not retroactively');
const future=capture(evidence({triggerDate:'2026-12-01',completedDate:'2026-12-01',historicalPeak:1000,
 fills:original.fills.map(f=>({...f,id:f.id+'-future',executedAt:f.executedAt.replace('2026-11-25','2026-12-01')}))}));
const chronological={...approved,operationalRiskReceipts:{base:[receipt,future]}};
const firstEpoch=call(chronological);assert.equal(firstEpoch.epoch.completedDate,'2026-11-25','Later accepted records cannot reset an earlier session');
assert.equal(call(chronological,firstEpoch,'2026-12-01',{openingEquity:790}).purchaseRiskReady,true,'Knowledge of a later completed same-day receipt cannot disable current protection before its actual loss is observed');
const stillFirst=call(chronological,firstEpoch,'2026-11-30',{openingEquity:790});assert.equal(stillFirst.resetApplied,false);assert.equal(stillFirst.operationalHighWater,800);
const newLoss={...stillFirst,requiresLiquidationEpoch:true,triggerDate:'2026-12-01'};
assert.equal(call({...approved,operationalRiskReceipts:{base:[receipt]}},newLoss,'2026-12-01').purchaseRiskReady,false,'An old applied receipt never rearms a new loss cycle');
assert.equal(call(chronological,newLoss,'2026-12-01').status,'awaiting-next-opening','A later completed liquidation waits for the following opening');
const secondEpoch=call(chronological,newLoss,'2026-12-02');assert.equal(secondEpoch.resetApplied,true);assert.equal(secondEpoch.appliedEpochs.length,2);assert.equal(secondEpoch.historicalHighWater,1000);assert.equal(secondEpoch.requiresLiquidationEpoch,false);
const reconstructedPolicy={...approved,operationalRiskReceipts:{base:[capture(original),future]}};
const reconstructed=call(reconstructedPolicy,clone(secondEpoch),'2026-12-03',{openingEquity:790});assert.equal(reconstructed.resetApplied,false,'Rebuilt trusted receipts plus serialized state retain exact one-time epoch identity');assert.equal(reconstructed.operationalHighWater,800);
const partial=evidence({closingBook:{cash:699,positions:{BBB:{shares:1,avgCost:200}}}});assert.equal(capture(partial),null,'Partial liquidation cannot establish a fresh risk epoch');
assert.throws(()=>capture(evidence({closingBook:{cash:801,positions:{}}})),/cash does not reconcile/);
assert.throws(()=>capture(evidence({risk:{highWater:1000,paused:false}})),/risk reference/);
const lateActual=capture(evidence({risk:{highWater:1000,paused:false},observedRiskEquity:800}));
assert(lateActual,'Conserved flat actual cash proves a later same-day breach even when original morning risk was not paused');
assert.equal(call({...approved,operationalRiskReceipts:{base:[lateActual]}}).resetApplied,true);
assert.throws(()=>capture(evidence({risk:{highWater:1000,paused:false},observedRiskEquity:700})),/risk reference|cash breach/,'A claimed observed cash figure must match independently reconciled closing cash');
assert.throws(()=>capture(evidence({fills:[...original.fills,{...original.fills[0],price:99}]})),/chronological|identity/);
assert.equal(JSON.stringify(state),JSON.stringify({historicalHighWater:1000,operationalHighWater:1000,appliedEpochs:[],requiresLiquidationEpoch:true}));
console.log('PASS: pending decision cannot reset; verified actual owner exits reconcile; one prospective next-exchange-opening epoch preserves history, scale and 12% loss protection; partial, forged, changed and missing evidence fail closed without forced sales. Synthetic behavior only, not performance evidence.');
