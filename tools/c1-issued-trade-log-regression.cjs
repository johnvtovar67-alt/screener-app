// Real handler, recorder and ledger with fictional market/account fixtures.
// No provider, production storage, brokerage or private account data is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const portfolio=[{symbol:'BBB',role:'Swing',shares:20,avgCost:99,openedAt:'2026-10-14'},{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const make=()=>createWorkflowApi('buy',{portfolio,baselineDate:'2026-11-13',now:'2026-11-16T17:00:00Z'});
const money=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const completed=(f,account,offset=1)=>{
 const sessions=f.sessions.slice(0,221+offset),book={...f.book,model:{sessions},captures:sessions.map(session=>f.book.captures.find(capture=>capture.sessionDate===session.date)||{sessionDate:session.date,hash:'synthetic:'+session.date,observedAt:session.decisionAt})};
 const now=new Date(sessions.at(-1).date+'T22:00:00Z');
 const derived=f.service.deriveC1CompletedAccount({account,book,now});
 return {account:derived,view:f.service.evaluateC1Account({account:derived,book,now}),book,now};
};
async function main(){
 const isolated=make(),i=isolated.fixture;
 const {c1IssuedTradeChoices}=i.loader.load('lib/c1IssuedTradeLog.js');
 const offer=(key,sleeve)=>({contract:'c1-issued-entry-log-v1',key,date:'2026-11-16',issuedAt:'2026-11-16T17:00:00Z',providerVerified:true,filledSymbolBefore:{BBB:0},
  capacities:[{order:{id:key,sleeve,symbol:'BBB',side:'buy',reason:'completion',shares:2},filledBefore:0}]});
 const alternatives=[offer('first-offer','base'),offer('alternative-offer','cooldown15')];
 assert.equal(c1IssuedTradeChoices({entries:alternatives,date:'2026-11-16'})[0].shares,2,'Alternative two-share offers cannot be combined into four shares');
 assert.equal(c1IssuedTradeChoices({entries:alternatives,date:'2026-11-16',activity:{plan:{orders:[{id:'actual',sleeve:'base',symbol:'BBB'}]},fills:[{orderId:'actual',symbol:'BBB',side:'buy',shares:1}]}})[0].shares,1,'An actual fill consumes the aggregate offer across allocation alternatives');
 i.setCash(8000);const persisted=i.persist,unwritten=JSON.stringify(i.account);i.persist=()=>{throw Error('Synthetic storage failure');};
 const failure=await isolated.request('POST',{operation:'prepare-execution'});assert.equal(failure.status,503);assert(!failure.body.manualRecommendations);assert.equal(JSON.stringify(i.account),unwritten,'A failed issue-log save cannot publish a ready Buy or change account data');i.persist=persisted;
 const api=make(),f=api.fixture;f.setCash(8000);
 const original=clone(f.account),before=f.service.evaluateC1Account({account:f.account,book:f.book,now:f.now});
 const first=await api.request('POST',{operation:'prepare-execution'});
 assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal(first.body.manualRecommendations.status,'ready',JSON.stringify(first.body));
 assert(f.account.issuedC1Entries?.length,'The response cannot publish checked buys before durable retention');
 const unchanged=clone(f.account);delete unchanged.issuedC1Entries;assert.deepEqual(unchanged,original,'Retention changes no financial records or revision');
 const issued=first.body.intradaySession.issuedChoices[0];assert(issued&&issued.shares>0);
 const notYetIssued={id:'before-offer',symbol:issued.symbol,side:'buy',shares:1,price:100,fee:0,executedAt:'2026-11-16T16:59:00Z',recordingReason:'recorded-issued-buy'};
 const tooEarly=await api.request('POST',{operation:'record-intraday',ticket:notYetIssued,expectedRevision:f.account.revision});assert.equal(tooEarly.status,422);
 const issuedBytes=JSON.stringify(f.account.issuedC1Entries),writes=f.writes;
 const again=await api.request('POST',{operation:'prepare-execution'});assert.equal(again.status,200);assert.equal(f.writes,writes,'Repeated unchanged offers are not duplicate trades or metadata writes');
 assert.equal(JSON.stringify(f.account.issuedC1Entries),issuedBytes);
 f.setOpeningFailure(true);
 const withdrawn=await api.request('POST',{operation:'prepare-execution'});
 assert.equal(withdrawn.status,200);assert.equal(withdrawn.body.manualRecommendations.status,'waiting');
 assert(withdrawn.body.intradaySession.issuedChoices.some(row=>row.symbol===issued.symbol),'A withdrawn entry remains in the actual recorder');
 const ticket={id:'fictional-issued-fill',symbol:issued.symbol,side:'buy',shares:1,price:100.37,fee:.07,executedAt:f.now.toISOString(),recordingReason:'recorded-issued-buy'};
 const saved=await api.request('POST',{operation:'record-intraday',ticket,expectedRevision:f.account.revision});
 assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal(saved.body.intradaySession.tickets[0].id,ticket.id);
 money(saved.body.decision.actualCash,before.actualCash-100.44);
 const savedBytes=JSON.stringify(f.account),savedWrites=f.writes;
 const invalidCorrection=await api.request('POST',{operation:'correct-intraday-details',ticketId:ticket.id,price:ticket.price,fee:ticket.fee,executedAt:'2026-11-16T17:00:30.000Z',expectedRevision:f.account.revision});
 assert.equal(invalidCorrection.status,422,'A correction cannot move a fill before the retained issuance');assert.equal(JSON.stringify(f.account),savedBytes);
 const retry=await api.request('POST',{operation:'record-intraday',ticket,expectedRevision:original.revision});assert.equal(retry.status,200);assert.equal(f.writes,savedWrites);assert.equal(JSON.stringify(f.account),savedBytes);
 const conflict=await api.request('POST',{operation:'record-intraday',ticket:{...ticket,price:90},expectedRevision:f.account.revision});assert.equal(conflict.status,409);assert.equal(JSON.stringify(f.account),savedBytes);
 const duplicated=await api.request('POST',{operation:'record-intraday',ticket:{...ticket,id:'duplicate-new-reference'},expectedRevision:f.account.revision});assert.equal(duplicated.status,422);assert.equal(JSON.stringify(f.account),savedBytes);
 const reload=await api.request('GET');assert.equal(reload.status,200);assert(reload.body.intradaySession.tickets.some(row=>row.id===ticket.id));
 const closed=completed(f,f.account),following=completed(f,closed.account,2);
 money(closed.view.actualCash,saved.body.decision.actualCash);money(following.view.actualCash,saved.body.decision.actualCash);
 assert(closed.view.positions.some(row=>row.symbol===ticket.symbol));assert(following.view.positions.some(row=>row.symbol===ticket.symbol));
 assert.equal(JSON.stringify(f.account.records),JSON.stringify(original.records),'No saved historical record was replaced');

 const delayed=make(),d=delayed.fixture;d.setCash(8000);
 const offered=await delayed.request('POST',{operation:'prepare-execution'}),past=offered.body.intradaySession.issuedChoices[0];
 const execution=d.now.toISOString(),published=completed(d,d.account).book;
 d.book.model=published.model;d.book.captures=published.captures;d.now='2026-11-17T17:00:00Z';
 const nextDay=await delayed.request('GET');assert.equal(nextDay.status,200,JSON.stringify(nextDay.body));
 assert(nextDay.body.retainedTradeSessions.some(session=>session.date==='2026-11-16'&&session.issuedChoices.some(row=>row.symbol===past.symbol)),'An unrecorded issued offer remains visible on the next trading session');
 const lateTicket={id:'fictional-next-day-recording',symbol:past.symbol,side:'buy',shares:1,price:100.48,fee:.02,executedAt:execution,recordingReason:'recorded-issued-buy'};
 const lateSaved=await delayed.request('POST',{operation:'record-intraday',ticket:lateTicket,expectedRevision:d.account.revision});assert.equal(lateSaved.status,200,JSON.stringify(lateSaved.body));assert.equal(lateSaved.body.savedTradeTicket.id,lateTicket.id);
 money(lateSaved.body.decision.actualCash,d.account.adoption.actualCash-100.50);
 assert.equal(d.account.intradayActivity.date,'2026-11-16');assert.equal(d.account.intradayActivity.tickets[0].executedAt,execution,'Next-day entry must retain the real prior-session execution date');
 const finalized=completed(d,d.account),history=d.loader.load('lib/c1IssuedTradeLog.js').c1RetainedTradeSessions({account:finalized.account,now:d.now});
 assert(history.every(session=>session.recordingBlockedReason),'A finalized historical record cannot be silently replaced to add another fill');

 // Legacy Add: no issued receipt exists. Explicit recovery attribution is an
 // owner choice, never claimed historical recommendation evidence.
 const recovery=make(),r=recovery.fixture;
 r.setCash(8000);const prior=clone(r.account),oldView=r.service.evaluateC1Account({account:r.account,book:r.book,now:r.now});
 r.setOpeningFailure(true);
 let view=await recovery.request('GET');assert.equal(view.status,200,JSON.stringify(view.body));assert(view.body.intradaySession);
 const legacy={id:'fictional-legacy-add',symbol:'BBB',side:'buy',shares:3,price:101.25,fee:.21,executedAt:'2026-11-16T16:45:00.000Z',recordingReason:'owner-confirmed-completed-add',allocations:[{sleeve:'base',shares:3}]};
 // Current broker cash was observed AFTER this actual fill. It is not silently
 // reused as historical purchase authority and is not debited a second time.
 const result=await recovery.request('POST',{operation:'record-intraday',ticket:legacy,expectedRevision:r.account.revision});
 assert.equal(result.status,200,JSON.stringify(result.body));
 const held=result.body.decision.positions.find(row=>row.symbol==='BBB');assert.equal(held.shares,23);assert.equal(held.openedAt,oldView.positions.find(row=>row.symbol==='BBB').openedAt);
 money(held.totalCost,20*99+3*101.25+.21);money(result.body.decision.actualCash,oldView.actualCash-303.96);
 assert.equal(result.body.decision.brokerageCash,8000,'A post-fill broker observation already includes this execution');
 for(const stop of oldView.positions.find(row=>row.symbol==='BBB').stops)money(held.stops.find(row=>row.sleeve===stop.sleeve).price,stop.price);
 assert.equal(result.body.manualRecommendations.status,'waiting');assert.equal(result.body.manualRecommendations.orders.length,0);
 assert.deepEqual(clone(r.account.adoption),prior.adoption);assert.deepEqual(clone(r.account.records),prior.records);assert.deepEqual(clone(r.account.brokerageCash),prior.brokerageCash);
 const chronology=make(),c=chronology.fixture;c.account=clone(r.account);c.now='2026-11-16T17:10:00Z';
 c.account.intradayActivity.plan.orders.push({id:'fictional-owned-sale',sleeve:'base',symbol:'BBB',side:'sell',shares:5,reason:'owner-discretionary-exit',recordingOnly:true,executable:false});
 c.account.intradayActivity.fills.push({id:'fictional-sale:base',orderId:'fictional-owned-sale',symbol:'BBB',side:'sell',shares:5,price:100,fee:0,executedAt:'2026-11-16T17:00:00.000Z'});
 c.account.intradayActivity.recordingEvidence=clone(c.account.intradayActivity.plan);
 const chronologyBytes=JSON.stringify(c.account);
 const invalidLifecycle=await chronology.request('POST',{operation:'correct-intraday-details',ticketId:legacy.id,price:legacy.price,fee:legacy.fee,executedAt:'2026-11-16T17:01:00.000Z',expectedRevision:c.account.revision});
 assert.equal(invalidLifecycle.status,422,'Moving an old Add after a full sale cannot become a new holding lifecycle');assert.equal(JSON.stringify(c.account),chronologyBytes);
 const ledger=r.loader.load('lib/c1AccountLedger.js'),closing=completed(r,r.account);
 const oldRun=ledger.continueC1ActualAccount({adoption:prior.adoption,sessions:r.sessions.slice(220,221),historySessions:r.book.model.sessions,records:prior.records,observedAt:r.now});
 const newRun=ledger.continueC1ActualAccount({adoption:closing.account.adoption,sessions:r.sessions.slice(220,222),historySessions:closing.book.model.sessions,records:closing.account.records,observedAt:closing.now});
 for(const sleeve of ['base','cooldown15','sector40']){
  const was=oldRun.sleeves[sleeve].openPositions.find(position=>position.symbol==='BBB'),now=newRun.sleeves[sleeve].openPositions.find(position=>position.symbol==='BBB');
  assert.equal(now.entryTargetShares,was.entryTargetShares,'Recovery cannot invent a missing completion target');assert.equal(now.enteredAt,was.enteredAt);money(now.initialStopPrice,was.initialStopPrice);
 }
 const lateBook=completed(r,r.account).book;r.book.model=lateBook.model;r.book.captures=lateBook.captures;r.now='2026-11-16T22:00:00Z';
 const late={...legacy,id:'fictional-late-add',shares:1,price:102.19,fee:.03,executedAt:'2026-11-16T20:00:00.000Z',allocations:[{sleeve:'base',shares:1}]};
 view=await recovery.request('POST',{operation:'record-intraday',ticket:late,expectedRevision:r.account.revision});assert.equal(view.status,200,JSON.stringify(view.body));
 assert.equal(view.body.decision.positions.find(row=>row.symbol==='BBB').shares,24,'A published close cannot strand a late entered real fill');
 const next=completed(r,r.account,2);assert.equal(next.view.positions.find(row=>row.symbol==='BBB').shares,24);money(next.view.actualCash,oldView.actualCash-303.96-102.22);
 const priorBytes=JSON.stringify(r.account);
 for(const bad of [{symbol:'UNOWNED'},{shares:5},{allocations:[{sleeve:'unknown',shares:3}]},{executedAt:'2026-11-16T13:00:00Z'}]){
  const response=await recovery.request('POST',{operation:'record-intraday',ticket:{...legacy,...bad,id:'invalid-'+Object.keys(bad)[0]},expectedRevision:r.account.revision});assert.equal(response.status,422,JSON.stringify(response.body));assert.equal(JSON.stringify(r.account),priorBytes);
 }
 console.log('PASS: durable issued quantities survive withdrawal/reload and next-day entry; one actual receipt/debit, coherent allocation offer, duplicates/conflicts rejected, owner-confirmed legacy Add, unchanged dates/stops/targets/history, published-close and next-session replay.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
