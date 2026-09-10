const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
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
  return {symbol,open:day===12?prior*1.04:prior,close,high:Math.max(prior,close)*1.01,low:Math.min(prior,close)*.99,volume:10000000};
 });
 sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,
  prices,signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:prices[i].close,
   researchFactors:{momentumPercentile:100-((i+Math.floor(day/18)*4)%12),volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},
   entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
}
let record=null,checkpoints=0,divergent=false,tradeCount=0;
for(let day=0;day<sessions.length;day++){
 const prior=record, before=record?JSON.stringify(record):null;
 record=advanceC1ForwardModel(record,[sessions[day]],new Date(sessions[day].date+'T22:00:00Z'));
 if(prior)assert.equal(JSON.stringify(prior),before,'Advancing must not mutate the saved record');
 assert.equal(record.summary.executable,false);assert.equal(record.summary.eligibleForLiveCapital,false);
 assert.equal(record.summary.eligibleForAlphaClaim,false);
 assert.equal(record.summary.observedForwardSessions,day);
 if(day%10!==0&&day!==sessions.length-1)continue;
 const states=[];
 for(const [id,weight] of Object.entries(weights)){
  const expected=simulate({metadata:{},sessions:sessions.slice(0,day+1)},
   {...options[id],startDate:record.firstDecisionSession,endDate:sessions[day].date,liquidateAtEnd:false});
  assert.equal(JSON.stringify(record.pendingBySleeve[id]),JSON.stringify(expected.pendingDecisions),id+': exact queue order/content');
  const fills=record.ledger.fills.filter(f=>f.sleeve===id);
  assert.equal(fills.length,expected.trades.length,id+': no missing/extra fills');
  expected.trades.forEach((t,i)=>{
   const f=fills[i];assert.equal(f.symbol,t.symbol);assert.equal(f.date,t.date);assert.equal(f.side,t.side);
   assert.equal(f.shares,t.shares*weight);assert.equal(f.price,t.price);
  });
  const last=expected.curve.at(-1);
  if(last)assert.ok(Math.abs(record.summary.sleeves[id].cash-last.cash*weight)<.0051,id+': independent cash');
  states.push(JSON.stringify(Object.fromEntries(Object.entries(record.summary.sleeves[id].positions).map(([symbol,shares])=>[symbol,shares/weight]))));
  checkpoints++;tradeCount+=expected.trades.length;
 }
 divergent ||= new Set(states).size>1;
 const copy=JSON.stringify(record);
 assert.equal(advanceC1ForwardModel(record,[sessions[day]],new Date(sessions[day].date+'T22:00:00Z')),record,'Same-session retry must preserve identity');
 assert.equal(JSON.stringify(record),copy);
}
assert.ok(divergent,'Exercise different sleeve holdings');assert.ok(tradeCount>0,'Must exercise actual fills');
console.log(`PASS: service equivalence across ${sessions.length} synthetic sessions, ${checkpoints} independent sleeve checkpoints; exact fills, pending queues, cash, retry identity and no live authority`);
