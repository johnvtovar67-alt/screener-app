// Offline integration of the live manual-account decision and opening paths.
// Every account, capture, quote and fill below is synthetic; no storage/network.
const assert=require('node:assert/strict');
const {fixture}=require('./c1-recent-momentum-challenger-regression.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {previousMarketSessionDay,isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {portfolioCompositionSignature:signature}=loader.load('lib/portfolioGovernor.js');
const {adoptC1Account,evaluateC1Account,deriveC1AccountAnalysis}=loader.load('lib/c1AccountService.js');
const {planC1ContinuedAccountOpening:plan}=loader.load('lib/c1AccountExecution.js');
const {reconcileC1ActualAccountFills:reconcile,c1CompletionPolicy}=loader.load('lib/c1AccountLedger.js');
const {capC1ExecutionCash}=loader.load('lib/c1ExecutionCashAuthority.js');
const clone=value=>JSON.parse(JSON.stringify(value));
let count=0;
const ok=(value,message)=>{count++;assert.ok(value,message);};
const eq=(actual,expected,message)=>{count++;assert.equal(actual,expected,message);};
const near=(actual,expected,message)=>{count++;assert.ok(Math.abs(actual-expected)<.000001,`${message}: ${actual} versus ${expected}`);};
const same=(actual,expected,message)=>{count++;assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);};
const raises=(fn,pattern,message)=>{count++;assert.throws(fn,pattern,message);};
const recentReasons=['recent-momentum-deterioration','recent-momentum-profit-protection'];

function testCase(prices,{symbol='DELL',shares=300,entryPrice=100,firstDate='2026-10-14',cashOnly=false,historyTail,highs}={}){
  const original=fixture(prices,{historyTail,highs:highs?{AAA:highs}:undefined});
  const f=JSON.parse(JSON.stringify(original).replaceAll('"AAA"',JSON.stringify(symbol)));
  const dates=[firstDate];
  for(let i=0;i<220;i++)dates.unshift(previousMarketSessionDay(dates[0]));
  let next=new Date(firstDate+'T12:00:00Z');
  while(dates.length<f.dataset.sessions.length){
    next.setUTCDate(next.getUTCDate()+1);const date=next.toISOString().slice(0,10);
    if(isUsMarketSessionDay(date))dates.push(date);
  }
  for(let index=0;index<f.dataset.sessions.length;index++){
    const session=f.dataset.sessions[index],date=dates[index];
    session.date=date;session.decisionAt=date+'T21:00:00.000Z';
    for(const row of session.prices)row.date=date;
    for(const field of ['signals','positionSignals','accountHoldingSignals'])for(const row of session[field]||[]){
      for(const key of ['marketAvailableAt','fundamentalsAvailableAt','eventRiskAvailableAt'])if(row[key])row[key]=session.decisionAt;
      if(row.entryTiming)row.entryTiming.asOf=date;
    }
  }
  f.dates=dates.slice(220);f.start=firstDate;f.end=f.dates.at(-1);
  const cash=cashOnly?100000:100000-shares*prices[0];
  const portfolio=[...(cashOnly?[]:[{symbol,role:'Swing',shares,avgCost:entryPrice,openedAt:dates[210]}]),
    {symbol:'MSTR',role:'Core',shares:2,avgCost:200},{symbol:'CASH',role:'Swing',shares:cash,avgCost:1}];
  const equity=cash+(cashOnly?0:shares*prices[0]);
  const book={universe:'sp500',model:{sessions:f.dataset.sessions},captures:f.dataset.sessions.map(session=>({sessionDate:session.date,hash:'synthetic-production:'+session.date,observedAt:session.date+'T22:00:00.000Z'}))};
  const baselineBook={...book,model:{sessions:book.model.sessions.slice(0,221)},captures:book.captures.slice(0,221)};
  const account=adoptC1Account({portfolio,capitalRecord:{version:2,highWater:equity,triggerDay:null,portfolioSignature:signature(portfolio),reconciliationRequired:false},book:baselineBook,now:new Date(firstDate+'T22:00:00Z')});
  return {...f,symbol,book,account,portfolio};
}
function at(c,index,sourceAccount=c.account){
  const account=clone(sourceAccount);
  const last=account.records.at(-1)?.date||c.start;
  for(const date of c.dates.filter(date=>date>last&&date<=c.dates[index]))account.records.push({date,openingObservedAt:date+'T15:00:00.000Z',complete:true,fills:[]});
  account.sourceHashes=c.book.captures.filter(capture=>capture.sessionDate>=c.start&&capture.sessionDate<=c.dates[index]).map(capture=>({date:capture.sessionDate,hash:capture.hash}));
  const now=new Date(c.dates[index]+'T22:00:00.000Z');
  return {account,now,decision:evaluateC1Account({account,book:c.book,now})};
}
function opening(c,index,{sourceAccount=c.account,completionPolicy=c1CompletionPolicy()}={}){
  const {account}=at(c,index,sourceAccount),date=c.dates[index+1];
  if(!date)throw new Error('Test requires one following regular session');
  return plan({adoption:account.adoption,sessions:c.book.model.sessions.slice(220,220+index+1),
    historySessions:c.book.model.sessions.slice(0,220+index+1),records:account.records,
    cashReconciliations:account.cashReconciliations,opening:c.book.model.sessions[220+index+1],observedAt:date+'T15:00:00.000Z',completionPolicy});
}
const position=(c,index)=>at(c,index).decision.positions.find(row=>row.symbol===c.symbol);
const buys=(value,symbol)=>value.orders.filter(order=>order.side==='buy'&&order.symbol===symbol&&!order.condition);
const sales=(value,symbol)=>value.orders.filter(order=>order.side==='sell'&&order.symbol===symbol&&!order.condition);
function patchTiming(c,index,patch){for(const field of ['signals','positionSignals'])for(const row of c.book.model.sessions[220+index][field]||[])if(row.symbol===c.symbol)row.entryTiming={...row.entryTiming,...patch};}

// A high historical rank cannot indefinitely hold a currently falling stock.
{
  const c=testCase([100,99,98,97,96,95]);
  const before=JSON.stringify({account:c.account,book:c.book});
  const early=position(c,2),confirmed=position(c,3);
  ok(!['Hold','Exit candidate'].includes(early.action),'Two weak closes require active review rather than unsupported Hold or premature Sell');
  eq(confirmed.action,'Exit candidate','DELL-like three-close deterioration changes the actual account decision');
  ok(confirmed.exits.every(exit=>exit.reason==='recent-momentum-deterioration'),'All owned sleeves use the recent-momentum exit reason');
  ok(confirmed.stops.every(stop=>stop.price===86),'The established 14% stop remains unchanged');
  ok(confirmed.reviewRules.every(rule=>rule.close===97),'The deterioration decision is made before a 14% decline');
  const planned=opening(c,3),sell=sales(planned,c.symbol);
  eq(planned.priceAssumptions.zeroBrokerageCommissionPerOrder,0,'Checked order assumptions retain zero brokerage commission');
  eq(planned.priceAssumptions.estimatedSpreadSlippageBps,12,'The existing spread/slippage estimate remains explicit');
  eq(planned.priceAssumptions.actualFillsOverride,true,'Actual fill prices and posted fees override estimated costs');
  eq(sell.length,3,'The actual opening projection queues one exit per owned sleeve');
  near(sell.reduce((sum,order)=>sum+order.shares,0),300,'The next-open exit covers actual owned shares exactly once');
  ok(sell.every(order=>order.phase===1&&order.reason==='recent-momentum-deterioration'),'The new exit remains a next-open event');
  eq(buys(planned,c.symbol).length,0,'The same weak stock cannot consume replacement capital');
  const derived=deriveC1AccountAnalysis({account:c.account,book:c.book,now:new Date(c.dates[3]+'T22:00:00Z')});
  eq(derived.decision.positions.find(row=>row.symbol===c.symbol).action,'Exit candidate','The automatic completed-session analysis uses the same decision');
  same({account:c.account,book:c.book},JSON.parse(before),'Decision and projection preserve original accounts and accepted input');
  eq(confirmed.shares,300,'A recommendation never fabricates a completed sale');
  ok(!at(c,3).decision.positions.some(row=>row.symbol==='MSTR'),'Core holdings are excluded from the Swing momentum decision');
}

// Giveback confirmation must work while longer recent windows still show gain.
{
  const c=testCase([100,110,120,110,109,108]);
  const first=position(c,3),second=position(c,4);
  ok(first.action!=='Exit candidate','One MACD-confirmed giveback close does not sell a winner');
  eq(second.action,'Exit candidate','MPC-like confirmed profit giveback changes the actual account action');
  ok(second.exits.some(exit=>exit.reason==='recent-momentum-profit-protection'),'Profit protection uses the established recent-momentum exit branch');
  const timing=c.book.model.sessions[224].signals.find(row=>row.symbol===c.symbol).entryTiming;
  ok(timing.ret5>0,'Profit preservation does not wait for every recent return window to turn negative');
  eq(timing.macdImproving,false,'The decision uses canonical MACD confirmation');
  ok(sales(opening(c,4),c.symbol).some(order=>order.reason==='recent-momentum-profit-protection'),'Profit protection reaches actual next-open quantities');
}

// Ordinary corrections can recover and become eligible for additions again.
{
  const c=testCase([100,99,98,100.5,101,101.5],{shares:100});
  eq(position(c,2).exits.length,0,'A two-close correction preserves the investment');
  eq(position(c,4).exits.length,0,'Subsequent recovery does not inherit an unsupported exit');
  const policy=c1CompletionPolicy([{symbol:c.symbol,stage:'half'}]);
  eq(buys(opening(c,2,{completionPolicy:policy}),c.symbol).length,0,'An owner-confirmed partial position cannot Add during weakness');
  ok(buys(opening(c,4,{completionPolicy:policy}),c.symbol).length>0,'Recovery can reopen a still-qualified actual partial completion');
}

// New purchases must pass the same gate; a historic rank cannot override it.
{
  const c=testCase([99,98,97],{cashOnly:true,historyTail:[100,100.2,100.4,100.6,100.8]});
  eq(at(c,0).decision.opportunities.some(row=>row.symbol===c.symbol),false,'Recent weakness removes a new Buy from actual account opportunities');
  const projected=opening(c,0);
  eq(buys(projected,c.symbol).length,0,'Recent weakness blocks actual new Buy quantities');
  ok(projected.orders.some(order=>order.side==='buy'&&order.symbol!==c.symbol),'The veto preserves other qualified replacement opportunities');
}

// A healthy price gate cannot grant cash authority or spend unrecorded sales.
{
  const c=testCase([100,100.1],{cashOnly:true}),projected=opening(c,0);
  ok(buys(projected,c.symbol).length>0,'The cash-authority scenario begins with a qualified actual Buy');
  const now=new Date(c.dates[1]+'T15:00:00Z');
  const account={...c.account,brokerageCash:{balance:0,observedAt:c.dates[1]+'T14:45:00Z',source:'manual-broker-balance'}};
  const before=JSON.stringify(account),capped=capC1ExecutionCash({plan:projected,account,strategyCash:100000,now});
  eq(capped.orders.some(order=>order.side==='buy'),false,'Zero confirmed brokerage cash blocks fresh capital despite a healthy gate');
  eq(capped.cashAuthority.unrecordedSaleProceedsIncluded,false,'Projected sale proceeds cannot replenish executable cash');
  eq(JSON.stringify(account),before,'Cash restriction never rewrites account metadata or economics');
}

for(const [name,patch] of Object.entries({missing:{available:false},stale:{staleVerification:true},misaligned:{asOf:'2026-10-01'},unknownMacd:{macdImproving:null}})){
  const c=testCase([100,99,98,97,96]);patchTiming(c,2,patch);
  const row=position(c,3);
  eq(row.exits.some(exit=>recentReasons.includes(exit.reason)),false,`${name}: unsupported evidence cannot create a momentum Sell`);
  ok(row.action!=='Hold',`${name}: missing evidence cannot manufacture a healthy Hold`);
  const fresh=testCase([100,100.1],{cashOnly:true});patchTiming(fresh,0,patch);
  eq(buys(opening(fresh,0),fresh.symbol).length,0,`${name}: evidence cannot authorize fresh capital`);
}

// Established stop protection has priority and cannot produce duplicate sells.
{
  const c=testCase([100,99,98,85,84]);
  patchTiming(c,2,{available:false});
  const row=position(c,3);
  eq(row.action,'Exit candidate','The existing stop remains actionable without recent momentum');
  ok(row.exits.some(exit=>exit.reason==='initial-stop'),'The stop retains its original reason');
  const projected=opening(c,3),sell=sales(projected,c.symbol);
  ok(sell.every(order=>order.reason==='initial-stop'),'Existing stop priority is preserved in checked quantities');
  near(sell.reduce((sum,order)=>sum+order.shares,0),300,'Stop and recent momentum cannot double-sell ownership');
}

// A Buy actually filled before cutover remains factual even if the new gate
// would have rejected its price path. Only later discretionary capital is gated.
{
  const c=testCase([99,98,97,96],{cashOnly:true,firstDate:'2026-10-13',historyTail:[100,100.2,100.4,100.6,100.8]});
  const originalPlan=opening(c,0),order=buys(originalPlan,c.symbol)[0];
  ok(order&&order.shares>=2,'The pre-cutover plan establishes a real partial Buy fixture');
  const fill={id:'synthetic-before-cutover',orderId:order.id,symbol:c.symbol,side:'buy',shares:2,price:98.1,fee:.75,executedAt:c.dates[1]+'T15:00:00.000Z'};
  const record={date:c.dates[1],openingObservedAt:c.dates[1]+'T15:00:00.000Z',complete:true,completionPolicy:originalPlan.completionPolicy,
    executionEvidence:clone(originalPlan),fills:[fill]};
  const account={...clone(c.account),records:[record]};
  const before=JSON.stringify(account);
  const view=at(c,2,account).decision;
  const held=view.positions.find(row=>row.symbol===c.symbol);
  eq(held.shares,2,'The actual partial Buy survives the new current recommendation gate');
  near(held.avgCost,(2*98.1+.75)/2,'Actual posted fees remain in cost basis');
  near(view.actualCash,100000-2*98.1-.75,'Actual cash follows posted economics, not projected fills');
  eq(buys(opening(c,2,{sourceAccount:account}),c.symbol).length,0,'A saved unfilled target does not override current deterioration');
  eq(JSON.stringify(account),before,'Accepted execution evidence and original fill history are immutable');
  const actual=reconcile({plan:originalPlan,fills:[fill],observedAt:c.dates[1]+'T16:00:00Z'});
  same(reconcile({plan:originalPlan,fills:[fill,fill],observedAt:c.dates[1]+'T16:00:00Z'}),actual,'Exact duplicate actual fills remain idempotent');
  raises(()=>reconcile({plan:originalPlan,fills:[fill,{...fill,fee:.76}],observedAt:c.dates[1]+'T16:00:00Z'}),/Conflicting/,'A conflicting duplicate fee is rejected');
  const unfilled=reconcile({plan:originalPlan,fills:[],observedAt:c.dates[1]+'T16:00:00Z'});
  same(unfilled.books,originalPlan.openingBooks,'Zero actual fills cannot create modeled ownership or cash changes');
}

// A new opening gap can supersede yesterday's confirmed momentum exit. It
// must retain the existing stop classification, priority and cash ordering.
{
  const c=testCase([100,99,98,97,96,97,98]);
  const gap=c.book.model.sessions[224].prices.find(row=>row.symbol===c.symbol);
  gap.open=85;gap.low=84.9;
  ok(c.book.model.sessions.slice(220,224).every(session=>session.prices.find(row=>row.symbol===c.symbol).low>86),'No prior session in the scenario has already triggered the fixed stop');
  ok(position(c,3).exits.every(exit=>exit.reason==='recent-momentum-deterioration'),'The prior completed close has a confirmed momentum exit');
  const projected=opening(c,3),sell=sales(projected,c.symbol);
  eq(sell.length,3,'A gap through the stop produces exactly one sale per owned sleeve');
  ok(sell.every(order=>order.reason==='initial-stop'),'The opening stop breach takes priority over the pending recent-momentum reason');
  ok(sell.every(order=>order.phase===1),'A verified gap stop executes in the opening sale phase');
  ok(sell.every(order=>Math.abs(order.estimatedPrice-85*.9988)<.000001),'The stop uses the actual gap opening with the existing 12 bps sell adjustment');
  near(sell.reduce((sum,order)=>sum+order.shares,0),300,'A gap stop never duplicates the queued momentum-sale quantity');
  for(const sleeve of ['base','cooldown15','sector40']){
    const sequence=projected.orders.filter(order=>order.sleeve===sleeve&&!order.condition);
    eq(sequence[0]?.reason,'initial-stop',`${sleeve}: the gap sale precedes funded replacement purchases`);
    ok(projected.projectedBooks[sleeve].cash>=0,`${sleeve}: replacement purchases remain within post-sale sleeve funds`);
  }
  const account={...c.account,brokerageCash:{balance:0,observedAt:c.dates[4]+'T14:45:00Z',source:'manual-broker-balance'}};
  const capped=capC1ExecutionCash({plan:projected,account,strategyCash:70000,now:new Date(c.dates[4]+'T15:00:00Z')});
  eq(capped.orders.some(order=>order.side==='buy'),false,'An unrecorded gap-stop sale cannot fund executable purchases when broker cash is zero');
  eq(sales(capped,c.symbol).length,3,'Cash restrictions keep every gap-stop exit available');
  ok(projected.orders.filter(order=>order.condition==='stop-triggered').every(order=>order.phase===4),'Untriggered standing stops retain their intraday phase');
  // The frozen sleeve has no per-name stop cooldown. Exercise its existing
  // optional mechanism separately so gap reclassification cannot bypass it.
  const {simulatePointInTimePortfolio:live}=loader.load('lib/c1RecentMomentumAccountSimulator.js');
  const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
  const sessions=c.book.model.sessions.slice(220,226),history=c.book.model.sessions.slice(0,226);
  const recorded={contract:'c1-actual-fill-replay-v1',sessions:c.dates.slice(1,6).map((date,index)=>({date,
    fills:index===3?[{symbol:c.symbol,side:'sell',reason:'initial-stop',shares:300,price:85*.9988,fee:0}]:[]}))};
  const config={...C1_FROZEN_OPTIONS.base,startDate:c.start,endDate:c.dates[5],liquidateAtEnd:false};
  const normal=live({sessions,recentMomentumHistorySessions:history},config,c.account.adoption.seeds.base,recorded);
  const cooling=live({sessions,recentMomentumHistorySessions:history},{...config,stopCooldownSessions:2},c.account.adoption.seeds.base,recorded);
  ok(normal.pendingDecisions.some(order=>order.side==='buy'&&order.symbol===c.symbol),'Without an optional stop cooldown, a later confirmed recovery remains eligible');
  eq(cooling.pendingDecisions.some(order=>order.side==='buy'&&order.symbol===c.symbol),false,'The existing optional stop-cooldown mechanism still blocks a premature recovery purchase');
}

// New-reason posted sales replay as facts; a later recovery can establish a
// genuinely new purchase lifecycle without inheriting the old exit streak.
{
  const c=testCase([100,99,98,97,96,97,98,99,100]);
  const salePlan=opening(c,3),orders=sales(salePlan,c.symbol);
  const fills=orders.map((order,index)=>({id:'synthetic-momentum-sale-'+index,orderId:order.id,symbol:c.symbol,side:'sell',
    shares:order.shares,price:95.9,fee:.3,executedAt:c.dates[4]+'T15:00:00.000Z'}));
  const prior=at(c,3).account;
  const sold={...prior,records:[...prior.records,{date:c.dates[4],openingObservedAt:c.dates[4]+'T15:00:00.000Z',complete:true,
    completionPolicy:salePlan.completionPolicy,executionEvidence:clone(salePlan),fills}]};
  const partial=clone(sold),partialRecord=partial.records.at(-1);
  partialRecord.fills=partialRecord.fills.map(fill=>({...fill,shares:Math.floor(fill.shares/2)}));
  const soldShares=partialRecord.fills.reduce((sum,fill)=>sum+fill.shares,0),partialView=at(c,5,partial).decision;
  eq(partialView.positions.find(row=>row.symbol===c.symbol).shares,300-soldShares,'Partial momentum sales leave all unexecuted ownership intact');
  near(partialView.actualCash,70000+soldShares*95.9-.9,'Partial momentum-sale proceeds and actual fees are counted exactly once');
  same(partialRecord.executionEvidence,salePlan,'A partial sale cannot rewrite its original full exit recommendation');
  const before=JSON.stringify(sold),view=at(c,5,sold).decision;
  eq(view.positions.some(row=>row.symbol===c.symbol),false,'Posted recent-momentum sales remove actual ownership exactly once');
  near(view.actualCash,70000+300*95.9-.9,'Posted momentum-sale fees and proceeds reconcile exactly');
  const reentry=opening(c,5,{sourceAccount:sold}),buy=buys(reentry,c.symbol)[0];
  ok(buy&&buy.shares>0,'A recovered stock can receive a new actual Buy after the completed exit');
  const carry=at(c,5,sold).account;
  const acquired={...carry,records:[...carry.records,{date:c.dates[6],openingObservedAt:c.dates[6]+'T15:00:00.000Z',complete:true,
    completionPolicy:reentry.completionPolicy,executionEvidence:clone(reentry),
    fills:[{id:'synthetic-recovery-reentry',orderId:buy.id,symbol:c.symbol,side:'buy',shares:1,price:98.1,fee:.1,executedAt:c.dates[6]+'T15:00:00.000Z'}]}]};
  const held=at(c,6,acquired).decision.positions.find(row=>row.symbol===c.symbol);
  eq(held.shares,1,'Only the posted new purchase becomes ownership');
  eq(held.openedAt,c.dates[6],'The recovered purchase starts a new first-purchase date');
  eq(held.exits.length,0,'The recovered purchase cannot inherit an old confirmed exit');
  ok((held.recentMomentumReviews||[]).every(review=>review.state?.streak===0&&!review.state?.profitProtectionArmed),'The new lifecycle resets deterioration and old profit activation');
  eq(JSON.stringify(sold),before,'Sale and reentry analysis preserve all accepted prior execution evidence');
}

console.log(`PASS: ${count} live recent-momentum production integration assertions; synthetic accounts only.`);
