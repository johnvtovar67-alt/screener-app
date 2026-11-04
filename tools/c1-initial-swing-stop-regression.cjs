// Prospective risk-policy mechanics only: synthetic accounts, prices and fills.
// No network, live persistence, performance experiment or historical replay rerun.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));let count=0;
const eq=(a,b,m)=>{count++;assert.equal(a,b,m);},ok=(a,m)=>{count++;assert.ok(a,m);};
const near=(a,b,m)=>{count++;assert(Math.abs(a-b)<1e-7,`${m}: ${a} != ${b}`);};
const sleeves=['base','cooldown15','sector40'];
function completedBook(f,end=222){return {...f.book,model:{sessions:f.sessions.slice(0,end)},captures:f.sessions.slice(0,end).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};}
function buyTicket(f,id,shares,price,fee=0){return {id,symbol:'MRNA',side:'buy',shares,price,fee,executedAt:f.now.toISOString()};}
function checkActualStops(f,v,expectedPct){
 const actual=f.loader.load('lib/c1AccountLedger.js').reconcileC1ActualAccountFills({plan:v.account.intradayActivity.plan,fills:v.account.intradayActivity.fills,observedAt:f.now}).fills;
 for(const stop of v.decision.positions.find(p=>p.symbol==='MRNA').stops){
  const fills=actual.filter(fill=>fill.side==='buy'&&v.account.intradayActivity.plan.orders.find(o=>o.id===fill.orderId).sleeve===stop.sleeve);
  const q=fills.reduce((sum,fill)=>sum+fill.shares,0),entry=fills.reduce((sum,fill)=>sum+fill.shares*fill.price,0)/q;
  near(stop.price,entry*(1-expectedPct/100),'Each sleeve uses actual weighted opening execution prices');eq(stop.shares,q,'Stop covers only acquired sleeve shares');
  const standing=v.openingPlan.orders.find(o=>o.symbol==='MRNA'&&o.sleeve===stop.sleeve&&o.condition==='stop-triggered');
  near(standing.estimatedPrice,stop.price,'Conditional level matches actual acquired stop');eq(standing.shares,q,'Conditional stop excludes unfilled target shares');
 }
}
async function main(){
 const f=createWorkflowFixture();f.setCash(100000);f.advance();const original=clone(f.account);
 const first=await f.prepare();eq(first.openingPlan.prospectiveSwingStopPolicy,'c1-new-swing-initial-stop-10-v1','Normal application preparation captures prospective policy');
 const buys=first.openingPlan.orders.filter(o=>o.symbol==='MRNA'&&o.side==='buy');eq(buys.length,3,'All three sleeves retain their original entry quantities');
 for(const o of buys){eq(o.initialSwingStopPct,10,'New ownership captures 10');eq(o.initialSwingStopPolicy,first.openingPlan.prospectiveSwingStopPolicy,'Order has explicit version');}
 for(const stop of first.decision.positions.find(p=>p.symbol==='LLL').stops)near(stop.price,86,'Existing open ownership remains at its original 14% stop');
 let v=await f.prepare(buyTicket(f,'new10-first',10,100.12,1));f.account=clone(v.account);checkActualStops(f,v,10);
 f.advance();v=await f.prepare(buyTicket(f,'new10-partial',10,101,.5));f.account=clone(v.account);checkActualStops(f,v,10);
 eq(JSON.stringify(f.account.adoption),JSON.stringify(original.adoption),'Adoption/history seed remains byte-identical');
 // A loaded/reloaded account and then the next completed session retain captured
 // policy even though the historical frozen option remains 14.
 const openingStops=clone(v.decision.positions.find(p=>p.symbol==='MRNA').stops),book=completedBook(f);
 const closed=f.service.deriveC1CompletedAccount({account:clone(f.account),book,now:new Date('2026-10-15T22:00:00Z')});
 const continued=f.service.evaluateC1Account({account:closed,book,now:new Date('2026-10-15T22:00:00Z')});
 eq(JSON.stringify(continued.positions.find(p=>p.symbol==='MRNA').stops),JSON.stringify(openingStops),'Completed recorded replay preserves actual 10% sleeve stops');
 f.account={...closed,positionContext:[{symbol:'MRNA',stage:'half',purchases:[],openingShares:20,openingCost:2012.7}]};f.book.model=book.model;f.book.captures=book.captures;f.now='2026-10-16T17:00:00Z';
 const next=await f.prepare();eq(JSON.stringify(next.decision.positions.find(p=>p.symbol==='MRNA').stops),JSON.stringify(openingStops),'Next session preserves original stop');
 // A saved old plan is actual authority; today's code must never relabel its
 // factual opening fills with the new threshold, even after a refresh/reload.
 const old=createWorkflowFixture();old.setCash(100000);old.advance();const oldView=await old.prepare(buyTicket(old,'old14-original',5,100.12)),oldPlan=clone(oldView.account.intradayActivity.plan);
 delete oldPlan.prospectiveSwingStopPolicy;
 for(const order of oldPlan.orders){delete order.initialSwingStopPolicy;delete order.initialSwingStopPct;if(order.symbol==='MRNA'&&order.condition==='stop-triggered')order.estimatedPrice=100.12*.86;}
 old.account={...oldView.account,intradayActivity:{...oldView.account.intradayActivity,plan:oldPlan}};old.advance();
 const oldSaved=await old.prepare(buyTicket(old,'old14-factual-fill',10,100.12));old.account=oldSaved.account;
 checkActualStops(old,oldSaved,14);
 const oldBook=completedBook(old),oldClosed=old.service.deriveC1CompletedAccount({account:clone(old.account),book:oldBook,now:new Date('2026-10-15T22:00:00Z')});
 for(const stop of old.service.evaluateC1Account({account:oldClosed,book:oldBook,now:new Date('2026-10-15T22:00:00Z')}).positions.find(p=>p.symbol==='MRNA').stops)near(stop.price,100.12*.86,'Old completed fills retain 14');
 // Exact 10% quote boundary is actionable without age/momentum/screen waits.
 const presenter=f.loader.load('lib/c1PositionPresentation.js'),p=continued.positions.find(p=>p.symbol==='MRNA'),at=new Date('2026-10-16T17:00:00Z');
 const quote=price=>({symbol:p.symbol,price,timestamp:at.getTime()/1000,_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:'live',_fmpQuoteFetchedAt:at.toISOString(),_fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol:p.symbol,price,timestamp:at.getTime()/1000,fetchedAt:at.toISOString()}});
 const highest=Math.max(...p.stops.map(s=>s.price)),args={decision:{...continued,current:true,sourceSessionDate:'2026-10-15'},position:{...p,recentMomentumReviews:[{available:false}],reviewRules:[{heldSessions:0,minimumHold:30}]},symbol:p.symbol,now:at};
 const boundary=presenter.c1PositionPresentation({...args,stock:quote(highest)});
 eq(boundary.label,'SELL — STOP TRIGGERED','Exact 10% initial stop boundary is inclusive');
 eq(presenter.c1RecordedSellInstruction(p,boundary).shares,p.stops.filter(s=>s.price>=highest).reduce((n,s)=>n+s.shares,0),'Sell contains only breached sleeve shares');
 eq(presenter.c1PositionPresentation({...args,stock:quote(highest+.000001)}).stopTriggered,false,'Immediately above every stop is not a verified breach');
 // No serialized/client field grants historical or projected stop authority.
 const replay=f.loader.load('lib/c1ActualFillReplay.js'),date='2026-10-15',seed={asOfSession:'2026-10-14'},sessions=[{date}],order={side:'buy',initialSwingStopPolicy:'c1-new-swing-initial-stop-10-v1',initialSwingStopPct:10};
 const fill=(id,pct)=>({id,orderId:id,symbol:'MRNA',side:'buy',reason:'Buy',shares:1,price:100,fee:0,executedAt:date+'T17:00:00Z',initialSwingStopPct:pct});
 let forged=fill('forged',10);replay.markC1ReconciledProjectionFill(forged,date,{symbol:'MRNA'});
 let r=replay.createC1ActualFillReplay({contract:'c1-actual-fill-replay-v1',sessions:[],projectionDate:date,projectionFills:[forged]},seed,sessions);
 eq(r.lookup(date,'MRNA','buy','Buy').initialSwingStopPct,undefined,'Serialized stop flag cannot authorize completed lookup');
 eq(r.reconciledProjectionExecutions(date)[0].initialSwingStopPct,undefined,'Serialized flag is stripped from projected facts too');
 for(const [firstNew,expected]of[[false,undefined],[true,10]]){
  const first=fill('first',10),second=fill('second',10);
  replay.markC1InitialSwingStopPurchase(first,date,firstNew?order:{side:'buy'});
  if(!firstNew)replay.markC1InitialSwingStopPurchase(second,date,order);
  r=replay.createC1ActualFillReplay({contract:'c1-actual-fill-replay-v1',sessions:[{date,fills:[first,second]}]},seed,sessions);
  eq(r.lookup(date,'MRNA','buy','Buy').initialSwingStopPct,expected,'First chronological captured opening defines policy; later flags cannot reinterpret it');
 }
 // Defensive lifecycle check: an ended old sleeve cannot donate its stop,
 // pending exit or momentum confirmations to a new same-ticker ownership.
 const intraday=f.loader.load('lib/c1IntradayActivity.js'),baseBooks=Object.fromEntries(sleeves.map(id=>[id,{cash:10000,positions:{MRNA:{shares:10,avgCost:100,openedAt:'2026-10-13'}}}]));
 const plan={contract:'c1-actual-account-opening-plan-v1',date,openingBooks:baseBooks,orders:[{id:'end-old',sleeve:'base',symbol:'MRNA',side:'sell',shares:10,reason:'owner-discretionary-exit'},{id:'start-new',sleeve:'base',symbol:'MRNA',side:'buy',shares:5,reason:'Buy',...order}]};
 const fills=[{id:'sell',orderId:'end-old',symbol:'MRNA',side:'sell',shares:10,price:100,fee:0,executedAt:date+'T15:00:00Z'},{id:'buy',orderId:'start-new',symbol:'MRNA',side:'buy',shares:5,price:110,fee:0,executedAt:date+'T15:01:00Z'}];
 const prior={contract:'c1-account-decision-v1',decisionId:'old-period',revision:1,current:true,sourceSessionDate:'2026-10-14',positions:[{symbol:'MRNA',shares:30,avgCost:100,openedAt:'2026-10-13',stops:sleeves.map(sleeve=>({sleeve,shares:10,price:86})),exits:sleeves.map(sleeve=>({sleeve,shares:10,reason:'initial-stop'})),reviewRules:sleeves.map(sleeve=>({sleeve,heldSessions:30})),recentMomentumReviews:sleeves.map(sleeve=>({sleeve,available:true}))}]};
 const lifecycle=intraday.c1IntradayDecision({decision:prior,activity:{plan,fills},revision:2,account:{},now:new Date(date+'T17:00:00Z')}).positions[0];
 // An older ownership addition never reinitializes or lowers its existing stop.
 for(const priorStop of [86,95]){
  const held=clone(prior);held.positions[0].stops[0].price=priorStop;
  const addPlan={...plan,orders:[{id:'older-add',sleeve:'base',symbol:'MRNA',side:'buy',shares:5,reason:'Add'}]};
  const addFill={...fills[1],orderId:'older-add',price:80};
  const added=intraday.c1IntradayDecision({decision:held,activity:{plan:addPlan,fills:[addFill]},revision:2,account:{},now:new Date(date+'T17:00:00Z')}).positions[0];
  near(added.stops.find(s=>s.sleeve==='base').price,priorStop,'A later addition preserves either a legacy or already tighter stop');
 }
 // Remaining-share weighted basis agrees with sequential projected accounting
 // after an intermediate partial sale within a new opening lifecycle.
 const emptyBooks=clone(baseBooks);delete emptyBooks.base.positions.MRNA;
 const partialPlan={...plan,openingBooks:emptyBooks,orders:[{id:'opening',sleeve:'base',symbol:'MRNA',side:'buy',shares:10,reason:'Buy',...order},{id:'partial-sale',sleeve:'base',symbol:'MRNA',side:'sell',shares:5,reason:'owner-discretionary-exit'},{id:'completion',sleeve:'base',symbol:'MRNA',side:'buy',shares:5,reason:'Buy'}]};
 const partialFills=[{...fills[1],id:'opening',orderId:'opening',shares:10,price:100,executedAt:date+'T15:00:00Z'},{...fills[0],id:'middle',orderId:'partial-sale',shares:5,executedAt:date+'T15:01:00Z'},{...fills[1],id:'completion',orderId:'completion',shares:5,price:80,executedAt:date+'T15:02:00Z'}];
 const partial=intraday.c1IntradayDecision({decision:{...prior,positions:[]},activity:{plan:partialPlan,fills:partialFills},revision:2,account:{},now:new Date(date+'T17:00:00Z')}).positions[0];
 near(partial.stops.find(s=>s.sleeve==='base').price,81,'Partial sale removes its proportional opening cost before a later fill');
 near(lifecycle.stops.find(s=>s.sleeve==='base').price,99,'Reentry receives its captured 10% stop');eq(lifecycle.exits.some(e=>e.sleeve==='base'),false,'Ended ownership cannot retain an old accepted exit');eq(lifecycle.reviewRules.some(e=>e.sleeve==='base'),false,'Ended ownership cannot retain old holding age');
 eq(lifecycle.exits.length,2,'Other original sleeves retain accepted pending exits');for(const stop of lifecycle.stops.filter(s=>s.sleeve!=='base'))near(stop.price,86,'Unclosed original sleeves retain14');
 const frozen=f.loader.load('lib/c1FrozenOptions.js');for(const c of Object.values(frozen.C1_FROZEN_OPTIONS))eq(c.minimumInitialStopPct,14,'Frozen historical options remain14');eq(frozen.C1_ACCOUNT_MOMENTUM_EXIT_POLICY.profitRankExitActivationPct,12,'Separate 12% profit activation is unchanged');
 const restored=require('./c1-initial-swing-stop-seams.cjs').restoreInitialSwingStopPolicy(fs.readFileSync('lib/c1RecentMomentumChallengerSimulator.js','utf8'),'lib/c1RecentMomentumChallengerSimulator.js');
 eq(crypto.createHash('sha256').update(restored).digest('hex'),'ca08f31539bb4e306251dd11ada2ae204af78d850c23644ffa617b752923d905','Only exact prospective seams change the generated recent engine');
 console.log(`PASS: ${count} prospective Swing-stop assertions; normal prepare/fill/reload/completed replay, partial fills, additions, legacy14, boundary quantity, private authority, lifecycle and unchanged historical/profit rules.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
