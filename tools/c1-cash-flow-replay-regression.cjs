// Fictional cash-ledger behavior only. No market-performance claim, provider,
// real statement/account access, brokerage execution or persistent write.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {fixture,seedFor}=require('./c1-recent-momentum-challenger-regression.cjs');
const loader=createResearchModuleLoader(process.cwd());
const cashFlows=loader.load('lib/c1CashFlowReplay.js');
const {createC1ActualFillReplay}=loader.load('lib/c1ActualFillReplay.js');
const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
const simulate=loader.load('lib/c1RecentMomentumChallengerSimulator.js').simulatePointInTimePortfolio;
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,message||`${actual} differs from ${expected}`);
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const sourceDigest='a'.repeat(64);
let cases=0;
function check(name,run){run();cases++;console.log('PASS '+name);}
function currentFixture(){
 const original=fixture([100,100,100,100,100]),dates=[];
 for(const day=new Date('2026-11-18T00:00:00Z');dates.length<original.dataset.sessions.length;day.setUTCDate(day.getUTCDate()-1)){
  const date=day.toISOString().slice(0,10);if(isUsMarketSessionDay(date))dates.unshift(date);
 }
 const replaced=new Map(original.dataset.sessions.map((session,index)=>[session.date,dates[index]]));
 function shift(value){
  if(typeof value==='string')return replaced.has(value.slice(0,10))?replaced.get(value.slice(0,10))+value.slice(10):value;
  if(Array.isArray(value))return value.map(shift);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,shift(item)]));
  return value;
 }
 return shift(original);
}
const f=currentFixture(),seed={...seedFor(f),highWater:100000/.9,actualDollarsPerModelDollar:1};
const policy={active:true,activationDate:'2026-11-10',blockedSymbols:[],operationalRiskDecision:loader.load('lib/c1OperationalRiskDecision.js').C1_OPERATIONAL_RISK_DECISION,operationalRiskReceipts:{}};
const options={...C1_FROZEN_OPTIONS.base,startDate:f.start,endDate:f.end,liquidateAtEnd:false,
 recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate:f.end,projectionDate:null,accountPolicy:policy}};
const input=()=>({contract:'c1-actual-fill-replay-v1',sessions:f.dates.slice(1).map(date=>({date,fills:[]}))});
const event=(id,amount,kind='capital',date=f.dates[1])=>({id,date,amount,kind});
const mark=(replay,events,scale=1)=>cashFlows.markC1CashFlowReplay(replay,{sleeve:'base',actualDollarsPerModelDollar:scale,events,sourceDigest});
const run=replay=>simulate(f.dataset,options,seed,replay);

check('serialized fields cannot create statement-cash capabilities',()=>{
 const replay=input(),baseline=run(replay);
 replay.cashEvents=[event('forged',-20000)];replay.statementApproved=true;replay.cashFlowSourceDigest=sourceDigest;
 same(run(replay),baseline,'Only a server-marked replay may consume a journal');
 mark(replay,[event('real',-20000)]);
 same(run(copy(replay)),baseline,'JSON round trips discard the trusted capability');
});

check('one journal is normalized once, deduplicated and consumed once per replay',()=>{
 const replay=input(),journal=[event('single',-20000),event('single',-20000)];
 mark(replay,journal,2);mark(replay,journal,2);
 same(cashFlows.c1ReplayCashFlowEvents(replay,f.dates[1]),[event('single',-10000)]);
 const actual=createC1ActualFillReplay(replay,seed,f.dataset.sessions);
 assert.equal(actual.cashEvents(f.dates[1]).length,1);same(actual.cashEvents(f.dates[1]),[]);
 assert.throws(()=>mark(replay,[event('single',-30000)],2),/Conflicting validated/);
 assert.throws(()=>mark(input(),[event('collision',1),event('collision',2)]),/Conflicting statement/);
});

check('capital withdrawals preserve existing percentage drawdown and logical episode state',()=>{
 const state={historicalHighWater:10000,operationalHighWater:10000,appliedEpochs:['original-episode'],requiresLiquidationEpoch:true,triggerDate:'2026-11-12',epoch:{reference:10000}},snapshot=copy(state);
 const result=cashFlows.applyC1CashFlowEvents({cash:1000,equity:9000,portfolioHighWatermark:10000,operationalRiskState:state,events:[event('capital',-2000)]});
 near(result.cash,-1000,'Negative analytic cash conveys no spend authority');near(result.equity,7000);near(result.portfolioHighWatermark,7000/.9);
 near(result.equity/result.portfolioHighWatermark,.9);near(result.equity/result.operationalRiskState.operationalHighWater,.9);
 same(result.operationalRiskState.appliedEpochs,state.appliedEpochs);same(result.operationalRiskState.epoch,state.epoch);
 assert.equal(result.operationalRiskState.requiresLiquidationEpoch,true);assert.equal(result.operationalRiskState.historicalHighWater,10000);
 same(state,snapshot,'No input reference or prior episode is mutated');
});

check('income, fees and settlement-net corrections are P&L, not new capital or resets',()=>{
 const state={historicalHighWater:10000,operationalHighWater:10000,appliedEpochs:['same']};
 const result=cashFlows.applyC1CashFlowEvents({cash:1000,equity:9000,portfolioHighWatermark:10000,operationalRiskState:state,
  events:[event('interest',12,'pnl'),event('fee',-2,'pnl'),event('settlement',-.03,'pnl')]});
 near(result.cash,1009.97);near(result.equity,9009.97);assert.equal(result.portfolioHighWatermark,10000);
 assert.equal(result.operationalRiskState,state);assert.equal(result.capitalFlow,0);
});

check('invalid marks, bankrupting flows, conflicting IDs and non-finite events reject',()=>{
 for(const equity of [NaN,Infinity,undefined])assert.throws(()=>cashFlows.applyC1CashFlowEvents({cash:100,equity,portfolioHighWatermark:1000,events:[event('bad',1)]}),/marked equity/);
 for(const amount of [-9000,-10000])assert.throws(()=>cashFlows.applyC1CashFlowEvents({cash:1000,equity:9000,portfolioHighWatermark:10000,events:[event('bad',amount)]}),/positive marked equity/);
 assert.throws(()=>cashFlows.applyC1CashFlowEvents({cash:1000,equity:9000,portfolioHighWatermark:10000,events:[event('same',10),event('same',11)]}),/Conflicting effective/);
 assert.throws(()=>cashFlows.applyC1CashFlowEvents({cash:1000,equity:9000,portfolioHighWatermark:10000,events:[event('first',10),event('different-day',11,'capital',f.dates[2])]}),/Invalid effective/,'One marked-equity call cannot combine separate sessions');
 for(const bad of [event('unknown',1,'transfer'),event('infinite',Infinity),event('zero',0),event('future',1,'capital','2026-11-19'),event('weekend',1,'capital','2026-11-14')])
  assert.throws(()=>mark(input(),[bad]),/Invalid dated/);
});

check('actual generated engine keeps a ten-percent drawdown after a withdrawal without a new exit',()=>{
 const baseline=run(input()),replay=input();mark(replay,[event('withdrawal',-20000),event('withdrawal',-20000)]);
 const result=run(replay),point=result.curve.at(-1);
 near(result.actualCash,baseline.actualCash-20000);near(point.equity/result.accountRisk.highWater,.9);
 near(result.accountRisk.highWater,baseline.accountRisk.highWater*.8);near(result.accountRisk.operationalRisk.operationalHighWater,baseline.accountRisk.operationalRisk.operationalHighWater*.8);
 assert.equal(result.accountRisk.historicalHighWater,baseline.accountRisk.historicalHighWater,'Previously recorded raw peak is not reduced by capital removal');
 assert.equal(result.accountRisk.operationalRisk.appliedEpochs.length,0,'Capital movement does not create an operational reset');
 same(result.openPositions,baseline.openPositions,'Original holdings, purchase dates, basis and stop prices stay intact');same(result.trades,baseline.trades,'Cash journals never manufacture a stock trade');
 assert.equal(result.metrics.totalReturnPct,0,'The withdrawal is excluded from investment return');same(run(replay),result,'Reload reconstructs the same journal once, not an extra debit');
});

check('actual generated engine counts statement P&L and retains no-event output exactly',()=>{
 const baseline=run(input()),replay=input();mark(replay,[event('income',100,'pnl'),event('expense',-40,'pnl')]);
 const result=run(replay);near(result.actualCash,baseline.actualCash+60);assert.equal(result.metrics.totalReturnPct,.06);
 near(result.accountRisk.highWater,baseline.accountRisk.highWater);same(result.openPositions,baseline.openPositions);same(result.trades,baseline.trades);
 const empty=input();mark(empty,[]);same(run(empty),baseline,'Marking an empty journal does not alter any old-account result');
});

check('actual engine requires verified closing marks before consuming capital',()=>{
 const changed=copy(f.dataset),replay=input();mark(replay,[event('withdrawal',-100)]);
 changed.sessions.find(session=>session.date===f.dates[1]).prices.find(row=>row.symbol==='AAA').close=null;
 assert.throws(()=>simulate(changed,options,seed,replay),/Verified closing marks/);
});

check('current projection P&L requires trusted evidence and consumes once before opening risk checks',()=>{
 const date=f.end,replay={contract:'c1-actual-fill-replay-v1',sessions:f.dates.slice(1,-1).map(date=>({date,fills:[]})),projectionDate:date};
 const currentOptions={...options,recentMomentumLivePolicy:{...options.recentMomentumLivePolicy,sourceSessionDate:f.dates.at(-2),projectionDate:date}};
 const baseline=simulate(f.dataset,currentOptions,seed,replay),posting=event('known-current-expense',-5000,'pnl',date);
 replay.openingEvents=[posting];same(simulate(f.dataset,currentOptions,seed,replay),baseline,'Serialized current posting cannot alter opening risk');
 cashFlows.markC1CashFlowReplay(replay,{sleeve:'base',actualDollarsPerModelDollar:1,events:[],openingEvents:[posting],sourceDigest});
 const actual=createC1ActualFillReplay(replay,seed,f.dataset.sessions);
 assert.equal(actual.openingCashEvents(date).length,1);same(actual.openingCashEvents(date),[]);same(actual.cashEvents(date),[]);
 const result=simulate(f.dataset,currentOptions,seed,replay);
 assert(result.trades.some(trade=>trade.date===date&&trade.side==='sell'&&trade.reason==='portfolio-drawdown-stop'),'A known expense must affect the same opening risk decision, before hypothetical trades');
 assert(!baseline.trades.some(trade=>trade.date===date&&trade.reason==='portfolio-drawdown-stop'));
 same(simulate(f.dataset,currentOptions,seed,copy(replay)),baseline,'Serialized proof cannot activate current cash');
 for(const bad of [event('capital-at-open',-1,'capital',date),event('wrong-day',1,'pnl',f.dates.at(-2))])
  assert.throws(()=>cashFlows.markC1CashFlowReplay({...replay},{sleeve:'base',actualDollarsPerModelDollar:1,events:[],openingEvents:[bad],sourceDigest}),/Invalid dated/);
});

console.log(`PASS: ${cases} fictional trusted cash-flow replay cases; percentage-preserving capital adjustment, unchanged raw peaks/episode identity, P&L classification and actual generated-engine behavior. No live data or writes.`);
