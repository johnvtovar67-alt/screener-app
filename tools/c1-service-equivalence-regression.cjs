const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {planC1Opening,planC1ObservedSession}=loader.load('lib/c1OpeningPlan.js');
const {reconcileC1Execution}=loader.load('lib/c1ExecutionReconciliation.js');
const {c1ModelEventPhase}=loader.load('lib/c1PaperEvents.js');
const {advanceC1ForwardModel}=loader.load('lib/c1ForwardModel.js');
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1FrozenSimulator.js');
const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
const {C1_ACCOUNTING_WEIGHTS:weights}=loader.load('lib/c1SleeveAccounting.js');
const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
// Synthetic inputs only. These are wiring tests, not alpha evidence.
const symbols=Array.from({length:12},(_,i)=>'T'+i);
const sessions=[];
for(let t=Date.parse('2026-03-02T12:00:00Z');sessions.length<80;t+=86400000){
 const date=new Date(t).toISOString().slice(0,10);if(!isUsMarketSessionDay(date))continue;
 const day=sessions.length;
 const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
  const prior=day? sessions.at(-1).prices[i].close:100;
  const close=day===25?prior*.84:prior*(1+(.001*(i%3+1)));
  return {symbol,open:day===12?prior*1.04:prior,close,high:Math.max(prior,close,day===12?prior*1.04:prior)*1.01,low:Math.min(prior,close)*.99,volume:10000000};
 });
 sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,
  prices,signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:prices[i].close,
   researchFactors:{momentumPercentile:100-((i+Math.floor(day/18)*4)%12),volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},
   entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
}
let record=null,checkpoints=0,divergent=false,tradeCount=0,openingChecks=0,eventBlocks=0,gapStopChecked=false;
for(let day=0;day<sessions.length;day++){
 const prior=record, before=record?JSON.stringify(record):null;
 let openingPlan,observedPlan,gapSymbol;
 if(day===10&&prior){
  gapSymbol=Object.keys(prior.summary.virtualShares)[0];assert.ok(gapSymbol,'Need a held symbol for stop-gap case');
  const p=sessions[day].prices.find(p=>p.symbol===gapSymbol);
  p.open*=.8;p.low=Math.min(p.low,p.open*.99);
 }
 if(prior){
  const request={record:prior,date:sessions[day].date,observedAt:sessions[day].date+'T15:00:00Z',opens:sessions[day].prices.map(p=>({symbol:p.symbol,open:p.open,adjusted:true}))};
  openingPlan=planC1Opening(request);
  const observedRequest={record:prior,date:request.date,observedAt:request.date+'T22:00:00Z',bars:sessions[day].prices.map(p=>({...p,adjusted:true,throughAt:request.date+'T21:00:00Z'}))};
  observedPlan=planC1ObservedSession(observedRequest);
  assert.equal(observedPlan.status,'observed-session-projection-only',observedPlan.reason);
  assert.equal(observedPlan.executable,false);
  assert.equal(planC1ObservedSession({...observedRequest,bars:observedRequest.bars.map(p=>({...p,throughAt:request.date+'T23:00:00Z'}))}).status,'blocked');
  assert.equal(openingPlan.status,'opening-projection-only',openingPlan.reason);
  assert.equal(openingPlan.executable,false);
  assert.equal(planC1Opening({...request,opens:request.opens.filter(p=>p.symbol!=='SPY')}).status,'blocked');
  assert.equal(JSON.stringify(prior),before,'Opening projection cannot mutate model history');
 }
 record=advanceC1ForwardModel(record,[sessions[day]],new Date(sessions[day].date+'T22:00:00Z'));
 if(prior)assert.equal(JSON.stringify(prior),before,'Advancing must not mutate the saved record');
 assert.equal(record.summary.combinedPortfolio.contract,'c1-combined-holdings-v1');
 assert.ok(Math.abs(record.summary.combinedPortfolio.equity-record.summary.equity)<.0001);
 assert.deepEqual(Object.fromEntries(record.summary.combinedPortfolio.positions.map(p=>[p.symbol,p.virtualShares])),Object.fromEntries(Object.entries(record.summary.virtualShares).sort(([a],[b])=>a.localeCompare(b))));
 assert.equal(record.summary.executable,false);assert.equal(record.summary.eligibleForLiveCapital,false);
 assert.equal(record.summary.eligibleForAlphaClaim,false);
 assert.notEqual(record.paperExecutionStatus.status,'blocked',record.paperExecutionStatus.reason);
 if(record.paperExecutionStatus.status==='proposed'){
  assert.equal(record.paperExecution.priceBasis,'model-fill-events-v1');
  assert.ok(record.paperExecution.cash>=0);openingChecks++;
 }
 assert.equal(record.summary.observedForwardSessions,day);
 if(openingPlan){
  const reasons=new Map(record.paperExecution.eventHistory.map(e=>[e.fill.id,e.reason]));
  const actual=record.ledger.fills.filter(f=>f.date===sessions[day].date&&c1ModelEventPhase({side:f.side,reason:reasons.get(f.id)})<=3);
  assert.equal(JSON.stringify(openingPlan.modelFills),JSON.stringify(actual),'Every session: projected opening fills equal completed-session engine');
  const full=record.ledger.fills.filter(f=>f.date===sessions[day].date);
  if(gapSymbol){const stop=full.find(f=>f.symbol===gapSymbol&&reasons.get(f.id)==='initial-stop');assert.ok(stop,'Gap must exercise the position stop');assert.ok(Math.abs(stop.price-sessions[day].prices.find(p=>p.symbol===gapSymbol).open*.9988)<1e-7);gapStopChecked=true;}
  assert.equal(JSON.stringify(observedPlan.modelFills),JSON.stringify(full),'Every session: all fills including stops equal completed-session engine');
  assert.ok(Math.abs(observedPlan.projectedCash-record.paperExecution.cash)<1e-7);
  assert.equal(JSON.stringify(observedPlan.projectedPositions),JSON.stringify(record.paperExecution.positions));
  const supplied=observedPlan.orders.map((o,i)=>({id:'fixture-fill-'+i,modelEventId:o.modelEventId,symbol:o.symbol,side:o.side,shares:o.shares,price:o.price,fee:0,executedAt:sessions[day].date+'T21:30:00Z'}));
  const reconciled=reconcileC1Execution({record:prior,plan:observedPlan,fills:supplied,observedAt:sessions[day].date+'T22:00:00Z'});
  assert.equal(reconciled.status,'matches-model-projection',reconciled.reason);
  assert.equal(reconciled.modelAdvanceAuthorized,false);
  assert.ok(Math.abs(reconciled.cash-record.paperExecution.cash)<1e-7);
 }
 if(day%10!==0&&day!==sessions.length-1)continue;
 const states=[];
 const expectedOpening=[];
 for(const [id,weight] of Object.entries(weights)){
  const expected=simulate({metadata:{},sessions:sessions.slice(0,day+1)},
   {...options[id],startDate:record.firstDecisionSession,endDate:sessions[day].date,liquidateAtEnd:false});
  assert.equal(JSON.stringify(record.pendingBySleeve[id]),JSON.stringify(expected.pendingDecisions),id+': exact queue order/content');
  const fills=record.ledger.fills.filter(f=>f.sleeve===id);
  assert.equal(fills.length,expected.trades.length,id+': no missing/extra fills');
  expected.trades.forEach((t,i)=>{
   if(openingPlan&&t.date===sessions[day].date&&c1ModelEventPhase(t)<=3)expectedOpening.push({id:`${id}:${i}`,sleeve:id,date:t.date,symbol:t.symbol,side:t.side,shares:t.shares*weight,price:t.price,fee:0});
   const f=fills[i];assert.equal(f.symbol,t.symbol);assert.equal(f.date,t.date);assert.equal(f.side,t.side);
   assert.equal(f.shares,t.shares*weight);assert.equal(f.price,t.price);
  });
  const last=expected.curve.at(-1);
  if(last)assert.ok(Math.abs(record.summary.sleeves[id].cash-last.cash*weight)<.0051,id+': independent cash');
  states.push(JSON.stringify(Object.fromEntries(Object.entries(record.summary.sleeves[id].positions).map(([symbol,shares])=>[symbol,shares/weight]))));
  checkpoints++;tradeCount+=expected.trades.length;
 }
 if(openingPlan)assert.equal(JSON.stringify(openingPlan.modelFills),JSON.stringify(expectedOpening),'Opening orders equal full-bar simulator before intraday stops');
 divergent ||= new Set(states).size>1;
 const copy=JSON.stringify(record);
 assert.equal(advanceC1ForwardModel(record,[sessions[day]],new Date(sessions[day].date+'T22:00:00Z')),record,'Same-session retry must preserve identity');
 assert.equal(JSON.stringify(record),copy);
}
assert.ok(gapStopChecked,'Must verify stop gap uses opening price, not unreachable stop price');
assert.ok(openingChecks>0,'Exercise event-level reconciliation');
assert.ok(divergent,'Exercise different sleeve holdings');assert.ok(tradeCount>0,'Must exercise actual fills');
console.log(`PASS: service equivalence across ${sessions.length} synthetic sessions, ${checkpoints} independent sleeve checkpoints, ${openingChecks} event-level reconciliations; 79 causal opening plans and 79 observed-session stop plans; exact fills, pending queues, cash, retry identity and no live authority`);
