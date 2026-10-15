// Regression for the saved-plan release blocker: already posted Buy/Add facts
// must survive a current momentum veto and subsequent owner-exit replanning.
// All quotes, accounts and executions are synthetic. No network or persistence.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
// Reuse the existing deterministic public-account fixture without executing its
// assertions. This is also the fixture used by the original blocker reproduction.
const fixtureFile=path.resolve('tools/c1-recent-momentum-production-regression.cjs');
const fixtureSource=fs.readFileSync(fixtureFile,'utf8');
const boundary=fixtureSource.indexOf('// A high historical rank');
if(boundary<0)throw new Error('Production account fixture boundary is unavailable');
const {testCase,loader}=new Function('require',fixtureSource.slice(0,boundary)+'\nreturn {testCase,loader};')(createRequire(fixtureFile));
const {projectC1LegacyRecordedAccountSession:legacy,projectC1AccountSession:project}=loader.load('lib/c1AccountProjection.js');
const {c1AccountBooks,reconcileC1ActualAccountFills:reconcile,continueC1ActualAccount:advance}=loader.load('lib/c1AccountLedger.js');
const {planC1ContinuedAccountOpening:plan,replanC1IntradayAccountOpening:replan}=loader.load('lib/c1AccountExecution.js');
const {c1IntradayRemainingPlan:remainingPlan,recordC1IntradayActivity:record}=loader.load('lib/c1IntradayActivity.js');
const {adoptC1Account,evaluateC1Account}=loader.load('lib/c1AccountService.js');
const {portfolioCompositionSignature:signature}=loader.load('lib/portfolioGovernor.js');
const clone=value=>JSON.parse(JSON.stringify(value));
let assertions=0;
const ok=(value,message)=>{assertions++;assert.ok(value,message);};
const eq=(actual,expected,message)=>{assertions++;assert.equal(actual,expected,message);};
const same=(actual,expected,message)=>{assertions++;assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);};
const near=(actual,expected,message)=>{assertions++;assert.ok(Math.abs(actual-expected)<.000001,`${message}: ${actual} versus ${expected}`);};
const raises=(fn,pattern,message)=>{assertions++;assert.throws(fn,pattern,message);};
const sleeves=['base','cooldown15','sector40'];

function setup({newBuy=false,healthy=false}={}){
  const c=testCase(healthy?[100,100.1,100.2]:[99,98,97],{shares:100,firstDate:'2026-10-14',historyTail:healthy?undefined:[100,100.2,100.4,100.6,100.8]});
  const opening=c.book.model.sessions[221],baseline=c.book.model.sessions[220];
  const ownerSymbol=newBuy?'BBB':c.symbol;
  if(newBuy){
    const portfolio=c.portfolio.map(position=>position.symbol===c.symbol&&position.role==='Swing'?{...position,symbol:ownerSymbol}:position);
    const equity=90100+100*baseline.prices.find(row=>row.symbol===ownerSymbol).close;
    c.account=adoptC1Account({portfolio,capitalRecord:{version:2,highWater:equity,triggerDay:null,portfolioSignature:signature(portfolio),reconciliationRequired:false},
      book:{...c.book,model:{sessions:c.book.model.sessions.slice(0,221)},captures:c.book.captures.slice(0,221)},now:new Date(c.start+'T22:00:00Z')});
  }
  const time=opening.date+'T15:00:00.000Z',policy={version:1,partialSymbols:newBuy?[]:[c.symbol]};
  const rules=[{date:opening.date,priorDate:baseline.date,partialSymbols:policy.partialSymbols}];
  const old=legacy({record:{date:opening.date,complete:true,fills:[{}]},replayObservedAt:new Date(c.dates[2]+'T22:00:00Z'),
    adoption:c.account.adoption,baseline,opening,observedAt:time,books:c1AccountBooks(c.account.adoption),sessions:[baseline],replay:null,accountCompletionRules:rules});
  const buy=old.orders.find(order=>order.side==='buy'&&order.symbol===c.symbol&&order.sleeve==='base');
  if(!buy||buy.shares<3)throw new Error('The captured old plan must retain a partially filled Buy/Add target');
  for(const sleeve of sleeves)old.orders.push({id:'owner-exit:'+sleeve+':'+opening.date+':'+ownerSymbol,date:opening.date,sleeve,symbol:ownerSymbol,side:'sell',
    shares:old.openingBooks[sleeve].positions[ownerSymbol].shares,reason:'owner-discretionary-exit',recordingOnly:true,executable:false});
  const buyPrice=healthy?100.1:98.1,sellPrice=healthy?100.1:98;
  const activity={date:opening.date,openingObservedAt:time,plan:old,
    tickets:[{id:'old-add',symbol:c.symbol,side:'buy',shares:2,price:buyPrice,fee:.75,executedAt:time},
      {id:'old-owner-sale',symbol:ownerSymbol,side:'sell',shares:1,price:sellPrice,fee:0,executedAt:opening.date+'T15:05:00.000Z',recordingReason:'owner-discretionary-exit'}],
    fills:[{id:'old-add:base',orderId:buy.id,symbol:c.symbol,side:'buy',shares:2,price:buyPrice,fee:.75,executedAt:time},
      {id:'old-owner-sale:cooldown15',orderId:'owner-exit:cooldown15:'+opening.date+':'+ownerSymbol,symbol:ownerSymbol,side:'sell',shares:1,price:sellPrice,fee:0,executedAt:opening.date+'T15:05:00.000Z'}]};
  const input={adoption:c.account.adoption,sessions:[baseline],historySessions:c.book.model.sessions.slice(0,221),records:[],opening,
    observedAt:opening.date+'T16:00:00.000Z',completionPolicy:policy};
  const authority={...plan(input),providerVerified:true,sourceReceipt:{observedAt:input.observedAt}};
  return {c,baseline,opening,activity,input,authority,buy,rules,ownerSymbol};
}

// A legitimate current decision can still grant capital. Only the already
// executed old identity is exhausted; this repair must not blanket-freeze Adds.
{
  const context=setup({healthy:true});
  const result=replan({...context.input,activity:context.activity,authorityPlan:context.authority});
  const remaining=currentRemaining(context,result);
  const additions=remaining.orders.filter(order=>order.side==='buy'&&order.symbol===context.c.symbol);
  ok(additions.length>0,'Verified healthy current momentum permits qualified remaining Add quantities');
  ok(additions.every(order=>order.id!==context.buy.id&&order.postExitReplacement===true),'New capital has distinct currently projected authority rather than an old target waiver');
  const base=additions.find(order=>order.sleeve==='base');
  ok(base&&base.shares>0&&base.shares<=context.buy.shares-2,'The healthy addition remains bounded by the original target minus factual executions');
  const accepted=reconcile({plan:result.activity.plan,fills:result.activity.fills,observedAt:context.input.observedAt});
  near(accepted.actualCash,90000-2*100.1-.75+100.1,'Healthy-source replanning preserves posted prices, fees and cash');
}
const shares=(books,symbol)=>Object.values(books).reduce((sum,book)=>sum+(book.positions[symbol]?.shares||0),0);
function currentRemaining(context,result){
  const now=new Date(context.input.observedAt);
  const decision=evaluateC1Account({account:context.c.account,book:context.c.book,now});
  return remainingPlan({plan:result.plan,activity:result.activity,opening:context.opening,baseline:context.baseline,decision,now});
}

for(const newBuy of [false,true]){
  const context=setup({newBuy}),{c,input,activity,authority,buy}=context;
  const before=JSON.stringify({input,activity,authority,account:c.account,book:c.book});
  const accepted=reconcile({plan:activity.plan,fills:activity.fills,observedAt:input.observedAt});
  const result=replan({...input,activity,authorityPlan:authority});
  const actual=reconcile({plan:result.activity.plan,fills:result.activity.fills,observedAt:input.observedAt});
  same(actual.books,accepted.books,`${newBuy?'Buy':'Add'}: owner-exit replan conserves every actual sleeve position, basis and cash`);
  near(actual.actualCash,90001.05,`${newBuy?'Buy':'Add'}: accepted cash includes the exact posted fee and owner-sale proceeds`);
  eq(shares(actual.books,c.symbol),newBuy?2:101,`${newBuy?'Buy':'Add'}: only factual shares become ownership`);
  same(result.activity.fills,activity.fills,'Replanning preserves fill IDs, original dates, quantities, prices, fees and sleeve order IDs');
  same({input,activity,authority,account:c.account,book:c.book},JSON.parse(before),'The captured activity, account and accepted input are never mutated');
  const remaining=currentRemaining(context,result);
  eq(remaining.orders.some(order=>order.side==='buy'&&order.symbol===c.symbol),false,'An executed old Buy/Add does not waive the unfilled target momentum veto');
  eq(result.plan.orders.some(order=>order.side==='buy'&&order.symbol===c.symbol&&order.postExitReplacement),false,'The same weak stock cannot reappear as a fresh owner-exit replacement');
  ok(buy.shares>2,'The original plan really contains an unfilled remainder; this is not a full-fill-only check');
  const account={...c.account,revision:2,intradayActivity:result.activity,
    brokerageCash:{balance:100000,observedAt:context.opening.date+'T14:00:00Z',source:'manual-broker-balance'}};
  raises(()=>record({account,plan:remaining,ticket:{id:'unsupported-further-add',symbol:c.symbol,side:'buy',shares:1,price:98,fee:0,executedAt:context.opening.date+'T16:01:00Z'},
    expectedRevision:2,now:new Date(context.opening.date+'T16:02:00Z')}),/remaining C1 quantity|current|momentum|authorized/i,'The recording path cannot authorize another weak-stock share from the old target');
  const repeated=replan({...input,activity:result.activity,authorityPlan:authority});
  same(repeated.activity.fills,result.activity.fills,'Repeated owner-exit replan cannot duplicate factual executions');
  same(reconcile({plan:repeated.activity.plan,fills:repeated.activity.fills,observedAt:input.observedAt}).books,accepted.books,'Repeated replan leaves actual economics idempotent');
  const duplicate=clone(activity);duplicate.fills.splice(1,0,clone(duplicate.fills[0]));
  const deduplicated=replan({...input,activity:duplicate,authorityPlan:authority});
  same(reconcile({plan:deduplicated.activity.plan,fills:deduplicated.activity.fills,observedAt:input.observedAt}).books,accepted.books,'An identical repeated actual fill ID never doubles projected or recorded economics');
  eq(deduplicated.activity.plan.orders.find(order=>order.id===buy.id).shares,2,'Duplicate evidence grants only the original executed quantity');
}

// The exact same original evidence must replay in a completed historical
// record and in the still-open same-day projection without changing facts.
{
  const context=setup(),{c,activity,input}=context;
  const records=[{date:activity.date,openingObservedAt:activity.openingObservedAt,complete:true,completionPolicy:input.completionPolicy,
    executionEvidence:clone(activity.plan),fills:clone(activity.fills)}];
  const before=JSON.stringify({records,adoption:c.account.adoption});
  const continued=advance({adoption:c.account.adoption,sessions:c.book.model.sessions.slice(220,222),historySessions:c.book.model.sessions.slice(0,222),records,observedAt:c.dates[1]+'T22:00:00Z'});
  eq(shares(continued.books,c.symbol),101,'Normal historical replay retains the original Buy/Add and owner sale');
  near(continued.actualCash,90001.05,'Normal historical replay retains the exact posted cash');
  eq(continued.books.base.positions[c.symbol].openedAt,c.account.adoption.seeds.base.positions[0].openedAt,'The Add preserves the original first-purchase date');
  near(continued.books.base.positions[c.symbol].avgCost,(25*100+2*98.1+.75)/27,'The Add preserves actual weighted basis including posted fees');
  same({records,adoption:c.account.adoption},JSON.parse(before),'Historical replay never rewrites saved execution evidence or opening balances');
  const repaired=replan({...input,activity,authorityPlan:context.authority});
  const completed=[{...records[0],executionEvidence:clone(repaired.activity.plan),fills:clone(repaired.activity.fills)}];
  const completedAgain=advance({adoption:c.account.adoption,sessions:c.book.model.sessions.slice(220,222),historySessions:c.book.model.sessions.slice(0,222),records:completed,observedAt:c.dates[1]+'T22:00:00Z'});
  same(completedAgain.books,continued.books,'The repaired same-day saved plan also remains valid when its session completes');
  near(completedAgain.actualCash,continued.actualCash,'Completing a repaired activity never changes actual posted cash');
}

// Multiple executions of one captured new Buy retain the same aggregate
// entry basis, original target and 14% stop as canonical completed-record replay.
{
  const context=setup({newBuy:true}),{c,input,activity,buy}=context;
  activity.tickets.splice(1,0,{id:'old-add-second',symbol:c.symbol,side:'buy',shares:3,price:99.1,fee:.4,executedAt:context.opening.date+'T15:02:00.000Z'});
  activity.fills.splice(1,0,{id:'old-add-second:base',orderId:buy.id,symbol:c.symbol,side:'buy',shares:3,price:99.1,fee:.4,executedAt:context.opening.date+'T15:02:00.000Z'});
  const records=[{date:activity.date,openingObservedAt:activity.openingObservedAt,complete:true,completionPolicy:input.completionPolicy,
    executionEvidence:clone(activity.plan),fills:clone(activity.fills)}];
  const completed=advance({adoption:c.account.adoption,sessions:c.book.model.sessions.slice(220,222),historySessions:c.book.model.sessions.slice(0,222),records,observedAt:c.dates[1]+'T22:00:00Z'});
  const {simulatePointInTimePortfolio:canonical}=loader.load('lib/c1AccountSimulator.js');
  const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
  const canonicalRun=canonical({sessions:c.book.model.sessions.slice(220,222)},{...C1_FROZEN_OPTIONS.base,startDate:c.start,endDate:activity.date,liquidateAtEnd:false,accountCompletionRules:context.rules},
    c.account.adoption.seeds.base,completed.replay.base);
  const canonicalPosition=canonicalRun.openPositions.find(position=>position.symbol===c.symbol);
  const repaired=replan({...input,activity,authorityPlan:context.authority});
  const actual=reconcile({plan:repaired.activity.plan,fills:repaired.activity.fills,observedAt:input.observedAt});
  same(actual.books,completed.books,'Multiple partial Buy facts yield exactly the canonical completed sleeve economics');
  near(actual.books.base.positions[c.symbol].avgCost,98.93,'Both actual execution prices and posted fees contribute to actual average cost');
  near(canonicalPosition.entryPrice,98.7,'Canonical completed replay aggregates same-order execution prices');
  const stop=repaired.plan.orders.find(order=>order.symbol===c.symbol&&order.sleeve==='base'&&order.condition==='stop-triggered');
  ok(stop,'The repaired projection retains the standing stop for acquired shares');
  near(stop.estimatedPrice,canonicalPosition.initialStopPrice,'The repaired projection cannot freeze the first partial execution stop');
  near(stop.estimatedPrice,98.7*.86,'The original 14% stop uses the canonical aggregate execution price');
  eq(stop.shares,5,'The standing stop covers only the five actually acquired shares');
  eq(repaired.activity.plan.orders.find(order=>order.id===buy.id).targetShares,buy.targetShares,'The original saved position target remains intact');
  eq(currentRemaining(context,repaired).orders.some(order=>order.side==='buy'&&order.symbol===c.symbol),false,'Multiple old executions still cannot authorize their unfilled target remainder');
}

// Unknown current evidence cannot erase old executions or release new capital.
for(const stale of [false,true]){
  const context=setup(),{c,input,activity}=context;
  for(const field of ['signals','positionSignals'])for(const signal of context.baseline[field]||[])
    signal.entryTiming={...signal.entryTiming,...(stale?{staleVerification:true}:{macdImproving:null})};
  const authority={...plan(input),providerVerified:true,sourceReceipt:{observedAt:input.observedAt}};
  const expected=reconcile({plan:activity.plan,fills:activity.fills,observedAt:input.observedAt});
  const result=replan({...input,activity,authorityPlan:authority});
  same(reconcile({plan:result.activity.plan,fills:result.activity.fills,observedAt:input.observedAt}).books,expected.books,`${stale?'Stale':'Missing'} current momentum cannot reinterpret already posted facts`);
  eq(currentRemaining(context,result).orders.some(order=>order.side==='buy'),false,`${stale?'Stale':'Missing'} current evidence blocks all unfilled additions and replacements`);
}

// The exception is bounded by an actual fill reconciled to a captured order.
{
  const context=setup(),{activity,input,authority}=context;
  for(const mutate of [
    fill=>{fill.orderId='unsupported-order';},
    fill=>{fill.symbol='MSTR';},
    fill=>{fill.shares=activity.plan.orders.find(order=>order.id===fill.orderId).shares+1;},
    fill=>{fill.price=1000000;},
    fill=>{fill.fee=-1;},
  ]){
    const bad=clone(activity);mutate(bad.fills[0]);
    raises(()=>replan({...input,activity:bad,authorityPlan:authority}),/match|exceed|quantity|fee|price/i,'Unsupported fill evidence cannot obtain the replay exception');
  }
  const replay=Object.fromEntries(sleeves.map(sleeve=>[sleeve,{contract:'c1-actual-fill-replay-v1',sessions:[]}]));
  const scale=context.c.account.adoption.seeds.base.actualDollarsPerModelDollar;
  const raw={symbol:context.c.symbol,side:'buy',reason:context.buy.reason,shares:2/scale,price:98.1,fee:.75/scale,
    recorded:true,alreadyExecuted:true,projectionBuyAuthorized:true};
  raises(()=>project({adoption:context.c.account.adoption,baseline:context.baseline,opening:context.opening,observedAt:input.observedAt,
    books:c1AccountBooks(context.c.account.adoption),sessions:[context.baseline],historySessions:input.historySessions,replay,
    projectionFills:{base:[raw]},accountCompletionRules:context.rules}),/could not be applied|authority|recorded|reconciled/i,'Serializable flags on an unsupported projected Buy cannot bypass the current entry veto');
}

console.log(`PASS: ${assertions} recorded-fill momentum regression assertions; old Buy/Add facts, current vetoes and owner-exit replay remain distinct.`);
