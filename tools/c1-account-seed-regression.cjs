const assert=require('node:assert/strict');
require('node:child_process').execFileSync(process.execPath,['tools/generate-c1-account-simulator.cjs','--check']);
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {simulatePointInTimePortfolio:frozen}=loader.load('lib/c1FrozenSimulator.js');
const {simulatePointInTimePortfolio:account}=loader.load('lib/c1AccountSimulator.js');
const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
const {createC1ProspectiveSeeds:create,C1_ACCOUNT_SEED_CONTRACT:contract}=loader.load('lib/c1AccountSeed.js');
const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {portfolioCompositionSignature:signature}=loader.load('lib/portfolioGovernor.js');
const sessions=[],symbols=Array.from({length:12},(_,i)=>'T'+i);
for(let t=Date.parse('2026-03-02T12:00:00Z');sessions.length<80;t+=86400000){
 const date=new Date(t).toISOString().slice(0,10);if(!isUsMarketSessionDay(date))continue;
 const day=sessions.length;
 const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
   const prior=day?sessions.at(-1).prices[i].close:100,close=prior*(day===25?.84:1+.001*(i%3+1));
   return {symbol,open:prior,close,high:Math.max(prior,close)*1.01,low:Math.min(prior,close)*.99,volume:10000000,adjusted:true};
 });
 sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,prices,
   signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:prices[i].close,
     researchFactors:{momentumPercentile:100-((i+Math.floor(day/18)*4)%12),volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},
     entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
}
for(const config of Object.values(options)){
 const opts={...config,startDate:sessions[0].date,endDate:sessions.at(-1).date,liquidateAtEnd:false};
 assert.equal(JSON.stringify(account({sessions},opts)),JSON.stringify(frozen({sessions},opts)),'No-account runtime must exactly match the unchanged frozen engine');
}
const baseline=sessions[35],close=baseline.prices.find(p=>p.symbol==='T4').close;
const holding={symbol:'T4',role:'Swing',shares:10,entryPrice:close,openedAt:sessions[0].date,sector:'Sector0',issuer:'symbol:T4'};
const seed={contract,sleeve:'base',asOfSession:baseline.date,prospectiveAdoptionConfirmed:true,cash:100000-10*close,highWater:100000,remainingCooldownSessions:0,positions:[holding]};
const opts={...options.base,startDate:baseline.date,endDate:baseline.date,liquidateAtEnd:false};
const seeded=account({sessions},opts,seed);
assert.equal(seeded.trades.length,0,'Opening positions cannot become fabricated purchases or same-day sales');
assert.equal(seeded.openPositions[0].enteredAt,sessions[0].date);
assert.ok(seeded.pendingDecisions.some(o=>o.symbol==='T4'&&o.side==='sell'),'Old lower-ranked holding retains its elapsed minimum hold');
const young=account({sessions},opts,{...seed,positions:[{...holding,openedAt:baseline.date}]});
assert.ok(!young.pendingDecisions.some(o=>o.symbol==='T4'&&o.side==='sell'),'New holding retains the minimum holding period');
assert.equal(seeded.openPositions[0].stopPrice,close*.86);
assert.equal(seeded.accountOrigin.historicalPurchasesInferred,false);
const retainedLoss=account({sessions},{...opts,endDate:sessions[36].date},{...seed,highWater:120000,positions:[{...holding,openedAt:baseline.date}]});
assert.ok(retainedLoss.trades.some(t=>t.reason==='portfolio-drawdown-stop'),'Existing loss history cannot be reset at adoption');
assert.throws(()=>account({sessions},opts,{...seed,cash:0}),/do not reconcile/);
assert.throws(()=>account({sessions},opts,{...seed,positions:[{...holding,symbol:'MSTR'}]}),/excluded/);
assert.throws(()=>account({sessions},opts,{...seed,positions:[{...holding,openedAt:'2026-02-31'}]}),/holding date/);
assert.throws(()=>account({sessions},{...opts,rankedExitBuffer:9},seed),/frozen C1 options/);
const portfolio=[{symbol:'T4',role:'Swing',shares:3,avgCost:close,openedAt:sessions[0].date},{symbol:'MSTR',role:'Core',shares:2},{symbol:'CASH',role:'Swing',shares:1234.56,avgCost:1}];
const capitalRecord={version:2,highWater:2000,triggerDay:null,portfolioSignature:signature(portfolio),reconciliationRequired:false};
const adoption=create({portfolio,baseline,capitalRecord,adoptionConfirmed:true});
let cash=0,shares=0;
for(const s of Object.values(adoption.seeds)){cash+=s.cash*s.actualDollarsPerModelDollar;shares+=s.positions[0].shares*s.actualDollarsPerModelDollar;account({sessions},{...options[s.sleeve],startDate:baseline.date,endDate:baseline.date,liquidateAtEnd:false},s);}
assert.ok(Math.abs(cash-1234.56)<1e-8);assert.ok(Math.abs(shares-3)<1e-8);
assert.equal(adoption.historicalSleeveOwnershipInferred,false);assert.equal(adoption.executable,false);
assert.throws(()=>create({portfolio,baseline,capitalRecord:{...capitalRecord,reconciliationRequired:true},adoptionConfirmed:true}),/Reconcile/);
console.log('PASS: unchanged-engine parity in all three sleeves; real opening balances, old/new holding periods, initial stops, retained drawdown, exact account-unit conservation and no inferred historical buys.');
const {planC1ActualAccountOpening:planOpening,reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountExecution.js');
const opening={...sessions[36],corporateActions:[]};
const observedAt=opening.date+'T14:00:00Z';
const plan=planOpening({adoption,baseline,opening,observedAt});
assert.ok(plan.orders.length>0,'A valid seeded account must produce opening orders');
assert.ok(plan.orders.every(o=>Number.isSafeInteger(o.shares)&&o.shares>0));
assert.ok(Object.values(plan.projectedBooks).every(b=>b.cash>=0));
const untouched=reconcile({plan,fills:[],observedAt});
assert.equal(JSON.stringify(untouched.books),JSON.stringify(plan.openingBooks),'Unfilled projections must never change actual balances');
assert.ok(Math.abs(untouched.actualCash-adoption.actualCash)<1e-8);
assert.throws(()=>planOpening({adoption,baseline,opening:{...opening,prices:[]},observedAt}),/Missing opening quote/);
assert.throws(()=>planOpening({adoption,baseline,opening,observedAt:opening.date+'T12:00:00Z'}),/next observed market opening/);
console.log('PASS: first opening produces funded whole-share orders; zero actual fills preserve opening balances.');
const fixture={contract:'c1-actual-account-opening-plan-v1',date:opening.date,openingBooks:{base:{cash:1000,positions:{T4:{shares:5,avgCost:90,openedAt:baseline.date}}},cooldown15:{cash:500,positions:{}},sector40:{cash:250,positions:{}}},orders:[{id:'sell',sleeve:'base',symbol:'T4',side:'sell',shares:5},{id:'buy',sleeve:'base',symbol:'T5',side:'buy',shares:10}]};
const sell={id:'fill-1',orderId:'sell',symbol:'T4',side:'sell',shares:2,price:100,fee:.50,executedAt:opening.date+'T13:31:00Z'};
const buy={id:'fill-2',orderId:'buy',symbol:'T5',side:'buy',shares:3,price:101,fee:1,executedAt:opening.date+'T13:32:00Z'};
const actual=reconcile({plan:fixture,fills:[sell,buy],observedAt});
assert.equal(actual.books.base.cash,895.5);
assert.equal(actual.books.base.positions.T4.shares,3);
assert.equal(actual.books.base.positions.T4.openedAt,baseline.date);
assert.equal(actual.books.base.positions.T5.shares,3);
assert.equal(actual.books.base.positions.T5.avgCost,304/3);
assert.equal(actual.outstanding.find(o=>o.id==='sell').shares,3);
assert.equal(actual.outstanding.find(o=>o.id==='buy').shares,7);
assert.equal(actual.books.cooldown15.cash,500);
assert.equal(JSON.stringify(reconcile({plan:fixture,fills:[sell,sell,buy],observedAt})),JSON.stringify(actual),'Exact duplicate fill is idempotent');
assert.throws(()=>reconcile({plan:fixture,fills:[sell,{...sell,fee:1}],observedAt}),/Conflicting/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...sell,shares:6}],observedAt}),/exceed/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...buy,shares:10,price:200}],observedAt}),/exceeds its sleeve cash/);
assert.throws(()=>reconcile({plan:fixture,fills:[buy,sell],observedAt}),/execution time/);
assert.throws(()=>reconcile({plan:fixture,fills:[{...buy,symbol:'MSTR'}],observedAt}),/does not match/);
assert.equal(actual.modelAdvanceAuthorized,false);
console.log('PASS: partial fills, posted fees, original dates, independent sleeve cash, duplicate handling and oversell/overspend rejection.');
