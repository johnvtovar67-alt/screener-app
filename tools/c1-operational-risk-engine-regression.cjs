// Actual generated live-account engine with synthetic dated input and fills.
// This verifies policy behavior and preservation, not investment performance.
const assert=require('node:assert/strict');
const {fixture,seedFor}=require('./c1-recent-momentum-challenger-regression.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1RecentMomentumChallengerSimulator.js');
const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {captureC1OperationalRiskLiquidation:capture,C1_OPERATIONAL_RISK_MODE:mode}=loader.load('lib/c1OperationalRiskEpoch.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const approvedDecision=loader.load('lib/c1OperationalRiskDecision.js').C1_OPERATIONAL_RISK_DECISION;
assert.equal(approvedDecision.status,'approved');assert.equal(approvedDecision.mode,mode);
const pendingDecision=Object.freeze({status:'pending-owner-decision',mode:null});
const pendingLoader=createResearchModuleLoader(process.cwd(),{'lib/c1OperationalRiskDecision.js':{C1_OPERATIONAL_RISK_MODE:mode,C1_OPERATIONAL_RISK_DECISION:pendingDecision}});
const pendingSimulate=pendingLoader.load('lib/c1RecentMomentumChallengerSimulator.js').simulatePointInTimePortfolio;
function currentFixture(){
 const f=fixture([100,100,100,100,100]);
 const end=new Date('2026-11-16T00:00:00Z'),dates=[];
 while(dates.length<f.dataset.sessions.length){const key=end.toISOString().slice(0,10);if(isUsMarketSessionDay(key))dates.unshift(key);end.setUTCDate(end.getUTCDate()-1);}
 const replacements=new Map(f.dataset.sessions.map((s,i)=>[s.date,dates[i]]));
 function shift(value){
  if(typeof value==='string'){const date=value.slice(0,10);return replacements.has(date)?replacements.get(date)+value.slice(10):value;}
  if(Array.isArray(value))return value.map(shift);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shift(v)]));
  return value;
 }
 const result=shift(f);result.start=dates[220];result.end=dates.at(-1);result.dates=dates.slice(220);
 return result;
}
const f=currentFixture();assert.deepEqual(f.dates,['2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-16']);
const seed={...seedFor(f,{shares:200}),highWater:125000,actualDollarsPerModelDollar:1};
const options={...C1_FROZEN_OPTIONS.base,startDate:f.start,endDate:f.end,liquidateAtEnd:false};
const live=policy=>({...options,recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate:'2026-11-13',projectionDate:'2026-11-16',...(policy?{accountPolicy:policy}:{})}});
const pending={active:true,activationDate:'2026-11-11',blockedSymbols:[],operationalRiskDecision:pendingDecision,operationalRiskReceipts:{}};
const legacy=simulate(f.dataset,live(),seed),unresolved=pendingSimulate(f.dataset,live(pending),seed);
assert.equal(unresolved.accountRisk.highWater,legacy.accountRisk.highWater,'Pending baseline retains exact legacy risk reference');
assert.equal(unresolved.accountRisk.pausedThrough,legacy.accountRisk.pausedThrough,'Pending baseline retains exact legacy risk clock');
assert.deepEqual(JSON.parse(JSON.stringify(unresolved.trades)),JSON.parse(JSON.stringify(legacy.trades)),'Pending policy cannot force an additional liquidation or invent transactions');
assert.equal(unresolved.accountRisk.operationalRisk.status,'pending-owner-decision');
const continuingSeed={...seed,remainingCooldownSessions:2};
const noEpochApproved={...pending,operationalRiskDecision:approvedDecision};
const noActivity={contract:'c1-actual-fill-replay-v1',projectionDate:'2026-11-16',sessions:['2026-11-11','2026-11-12','2026-11-13'].map(date=>({date,fills:[]}))};
const legacyContinuity=simulate(f.dataset,live(),continuingSeed,noActivity),approvedContinuity=simulate(f.dataset,live(noEpochApproved),continuingSeed,noActivity);
assert.equal(approvedContinuity.accountRisk.highWater,legacyContinuity.accountRisk.highWater,'Activation with no flat verified epoch retains scheduled legacy risk-reference resumption');
assert.equal(approvedContinuity.accountRisk.operationalRisk.referenceMode,'legacy-continuity');
assert.deepEqual(approvedContinuity.trades.filter(t=>t.side==='sell'),legacyContinuity.trades.filter(t=>t.side==='sell'),'Existing holdings retain legacy protective exits without a policy-activation sale');

// Cycle one closes adopted AAA at its original basis. The separate portfolio
// loss is relative to retained historical peak, not a fabricated stock loss.
const firstOrders=[{id:'first',sleeve:'base',symbol:'AAA',side:'sell',shares:200,reason:'owner-discretionary-exit'}];
const firstFills=[{id:'first-fill',orderId:'first',symbol:'AAA',side:'sell',shares:200,price:100,fee:0,executedAt:'2026-11-11T15:00:00Z'}];
const first=capture({allocation:'base',triggerDate:'2026-11-11',completedDate:'2026-11-11',historicalPeak:125000,
 openingBook:{cash:80000,positions:{AAA:{shares:200,avgCost:100}}},closingBook:{cash:100000,positions:{}},
 fills:firstFills,orders:firstOrders,risk:{highWater:125000,paused:true}});
const firstPolicy={...pending,blockedSymbols:['AAA','BBB'],operationalRiskDecision:approvedDecision,operationalRiskReceipts:{base:[first]}};
const changed=clone(f);
for(let index=222;index<changed.dataset.sessions.length;index++){
 const session=changed.dataset.sessions[index],price=index>=223?50:100;
 Object.assign(session.prices.find(p=>p.symbol==='BBB'),{open:price,close:price,high:price,low:price*.999});
 for(const field of ['signals','positionSignals'])Object.assign(session[field].find(s=>s.symbol==='BBB'),{price});
}
const source=changed.dataset.sessions[221].signals.find(s=>s.symbol==='BBB');
const buyReason=source.entryTiming.strongPass===true?'Strong Buy':'Buy';
const replay={contract:'c1-actual-fill-replay-v1',projectionDate:'2026-11-16',sessions:[
 {date:'2026-11-11',fills:firstFills.map(x=>({...x,reason:'owner-discretionary-exit'}))},
 {date:'2026-11-12',fills:[{id:'buy',symbol:'BBB',side:'buy',reason:buyReason,shares:300,price:100,fee:0,executedAt:'2026-11-12T15:00:00Z'}]},
 {date:'2026-11-13',fills:[{id:'sell',symbol:'BBB',side:'sell',reason:'owner-discretionary-exit',shares:300,price:50,fee:0,executedAt:'2026-11-13T15:00:00Z'}]}
]};
const firstOnly=simulate(changed.dataset,live(firstPolicy),seed,replay);
assert(firstOnly.trades.some(t=>t.date==='2026-11-12'&&t.symbol==='BBB'&&t.side==='buy'),'Approved reset permits a later validated historical purchase despite old broad pause');
assert.equal(firstOnly.accountRisk.operationalRisk.requiresLiquidationEpoch,true);
assert.equal(firstOnly.accountRisk.operationalRisk.purchaseRiskReady,false,'A new loss cannot reuse the first reset receipt');
assert.equal(firstOnly.accountRisk.operationalRisk.appliedEpochs.length,1);
assert.equal(firstOnly.accountRisk.highWater,100000,'New loss uses the operational reference, not old 125000 peak');
assert.equal(firstOnly.accountRisk.historicalHighWater,125000,'Historical peak is separately preserved');
assert(firstOnly.skippedOrders.some(o=>o.date==='2026-11-16'&&o.reason==='operational-risk-evidence-required'));
const second=capture({allocation:'base',triggerDate:'2026-11-13',completedDate:'2026-11-13',historicalPeak:100000,
 openingBook:{cash:70000,positions:{BBB:{shares:300,avgCost:100}}},closingBook:{cash:85000,positions:{}},
 orders:[{id:'second',sleeve:'base',symbol:'BBB',side:'sell',shares:300,reason:'owner-discretionary-exit'}],
 fills:[{...replay.sessions[2].fills[0],orderId:'second'}],risk:{highWater:100000,paused:true}});
const completePolicy={...firstPolicy,operationalRiskReceipts:{base:[first,second]}};
const twoCycles=simulate(changed.dataset,live(completePolicy),seed,replay);
assert.equal(twoCycles.accountRisk.operationalRisk.appliedEpochs.length,2,'Both completed risk episodes are consumed exactly once in chronological replay');
assert.equal(twoCycles.accountRisk.highWater,85000);
assert.equal(twoCycles.accountRisk.historicalHighWater,125000);
assert(twoCycles.trades.some(t=>t.date==='2026-11-16'&&t.side==='buy'&&!['AAA','BBB'].includes(t.symbol)),'Unrelated qualifying replacements remain possible with fresh operational protection');
assert(!twoCycles.trades.some(t=>t.date==='2026-11-16'&&t.reason==='portfolio-drawdown-stop'),'Old historic loss cannot immediately liquidate new epoch replacements');
assert.equal(JSON.stringify(simulate(changed.dataset,live(completePolicy),seed,replay)),JSON.stringify(twoCycles),'A fresh seed-to-present request reconstructs identical epochs and economics');

// Exercise the real owner-approved immutable-record reconciliation and
// next-opening projection; no serialized account/plan flag grants approval.
const approvedLedger=loader.load('lib/c1AccountLedger.js');
const approvedProjection=loader.load('lib/c1AccountProjection.js');
const sleeves=['base','cooldown15','sector40'];
const adoption={contract:'c1-prospective-account-adoption-v1',sourceSessionDate:f.start,actualCash:280000,actualSwingEquity:300000,
 seeds:Object.fromEntries(sleeves.map(id=>[id,id==='base'?clone(seed):{...clone(seedFor(f,{sleeve:id,cashOnly:true})),actualDollarsPerModelDollar:1}]))};
const startBooks={base:{cash:80000,positions:{AAA:{shares:200,avgCost:100,openedAt:seed.positions[0].openedAt}}},cooldown15:{cash:100000,positions:{}},sector40:{cash:100000,positions:{}}};
const afterFirst={...clone(startBooks),base:{cash:100000,positions:{}}};
const afterPurchase={...clone(afterFirst),base:{cash:70000,positions:{BBB:{shares:300,avgCost:100,openedAt:'2026-11-12'}}}};
const risk=peak=>Object.fromEntries(sleeves.map(id=>[id,{highWater:id==='base'?peak:100000,paused:false}]));
const makeRecord=(date,prior,books,orders,fills,peak)=>({date,complete:true,fills,
 executionEvidence:{contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:prior,observedAt:date+'T14:45:00Z',openingBooks:books,
 orders:orders.map(o=>o.reason==='owner-discretionary-exit'?{...o,recordingOnly:true}:o),riskBySleeve:risk(peak)}});
const records=[makeRecord('2026-11-11','2026-11-10',startBooks,firstOrders,firstFills,125000),
 makeRecord('2026-11-12','2026-11-11',afterFirst,[{id:'record-buy',sleeve:'base',symbol:'BBB',side:'buy',shares:300,reason:buyReason}],
  [{...replay.sessions[1].fills[0],orderId:'record-buy'}],100000),
 makeRecord('2026-11-13','2026-11-12',afterPurchase,[{id:'record-sell',sleeve:'base',symbol:'BBB',side:'sell',shares:300,reason:'owner-discretionary-exit'}],
  [{...replay.sessions[2].fills[0],orderId:'record-sell'}],100000)];
const financialBefore=JSON.stringify({adoption,records});
const completed=changed.dataset.sessions.filter(s=>s.date>=f.start&&s.date<='2026-11-13');
const continued=approvedLedger.continueC1ActualAccount({adoption,sessions:completed,historySessions:changed.dataset.sessions,
 records,observedAt:'2026-11-13T22:00:00Z'});
assert.equal(continued.operationalRiskReceipts.base.length,2,'Both morning-unpaused/afternoon-actual flat loss episodes are captured from conserved financial facts');
assert.deepEqual(clone(continued.operationalRiskReceipts.base.map(r=>r.triggerDate)),['2026-11-11','2026-11-13']);
assert.equal(continued.books.base.cash,85000);
assert.equal(continued.sleeves.base.accountRisk.operationalRisk.appliedEpochs.length,1,'Second completion cannot reset at its own preceding opening');
const next=approvedProjection.projectC1AccountSession({adoption,baseline:completed.at(-1),opening:changed.dataset.sessions.at(-1),observedAt:'2026-11-16T15:00:00Z',
 books:continued.books,sessions:completed,historySessions:changed.dataset.sessions,replay:continued.replay,accountPolicy:continued.accountPolicy});
assert.equal(next.riskBySleeve.base.operationalRisk.appliedEpochs.length,2,'The following real account projection consumes the verified second completion');
assert.equal(next.riskBySleeve.base.highWater,85000);
assert.equal(next.riskBySleeve.base.historicalHighWater,125000);
assert.equal(JSON.stringify({adoption,records}),financialBefore,'Real account continuation/projector preserves all saved economics and records');
// Two independently completed ownership periods within a single session must
// retain their chronological facts, not a weighted day-level buy/sale group.
const roundTripOrders=[
 {id:'buy-one',sleeve:'base',symbol:'BBB',side:'buy',shares:300,reason:buyReason,initialSwingStopPolicy:'c1-new-swing-initial-stop-10-v1',initialSwingStopPct:10},
 {id:'owner-bbb',sleeve:'base',symbol:'BBB',side:'sell',shares:500,reason:'owner-discretionary-exit',recordingOnly:true},
 {id:'buy-two',sleeve:'base',symbol:'BBB',side:'buy',shares:200,reason:buyReason,initialSwingStopPolicy:'c1-new-swing-initial-stop-10-v1',initialSwingStopPct:10}];
const roundTripFills=[
 {id:'trip-buy-one',orderId:'buy-one',symbol:'BBB',side:'buy',shares:300,price:100,fee:2,executedAt:'2026-11-12T15:00:00Z'},
 {id:'trip-sell-one',orderId:'owner-bbb',symbol:'BBB',side:'sell',shares:300,price:110,fee:1,executedAt:'2026-11-12T15:01:00Z'},
 {id:'trip-buy-two',orderId:'buy-two',symbol:'BBB',side:'buy',shares:200,price:100,fee:1,executedAt:'2026-11-12T15:02:00Z'},
 {id:'trip-sell-two',orderId:'owner-bbb',symbol:'BBB',side:'sell',shares:200,price:90,fee:2,executedAt:'2026-11-12T15:03:00Z'}];
const trips=[records[0],makeRecord('2026-11-12','2026-11-11',afterFirst,roundTripOrders,roundTripFills,100000),
 {date:'2026-11-13',complete:true,fills:[]}];
const tripsBefore=JSON.stringify(trips);
const closedTrips=approvedLedger.continueC1ActualAccount({adoption,sessions:completed,historySessions:changed.dataset.sessions,records:trips,observedAt:'2026-11-13T22:00:00Z'});
assert.equal(closedTrips.books.base.cash,100994,'Both round trips retain their individual actual execution prices and fees');
const accountTrades=closedTrips.sleeves.base.trades.filter(t=>t.date==='2026-11-12'&&t.symbol==='BBB');
assert.deepEqual(clone(accountTrades.map(t=>[t.side,t.shares,t.price])),[['buy',300,100],['sell',300,110],['buy',200,100],['sell',200,90]]);
const closedPeriods=closedTrips.accountPolicy.periods.filter(p=>p.symbol==='BBB');
assert.equal(closedPeriods.length,2);assert.equal(closedPeriods[0].netRealizedPnl,2997);assert.equal(closedPeriods[1].netRealizedPnl,-2003);
assert(closedTrips.accountPolicy.blockedSymbols.includes('BBB'),'The second completed loss remains restricted even when the combined day was profitable');
assert.equal(JSON.stringify(trips),tripsBefore,'Same-day lifecycle replay cannot rewrite any original financial record');
console.log('PASS: actual generated engine preserves pending legacy liquidation/reference; approved two-cycle replay admits validated historical fills, keeps 12% operational loss protection, blocks stale receipt reuse, preserves historical peak and reconstructs identical state. Synthetic behavior only.');
