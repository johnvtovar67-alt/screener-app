// Replays a saved pre-cutover server-plan fill through the real read-only API.
// Synthetic accepted market/account fixtures only; no private data or network.
const assert=require('node:assert/strict');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const api=createWorkflowApi('buy',{baselineDate:'2026-11-05',portfolio:[{symbol:'CASH',role:'Swing',shares:30000,avgCost:1}]});
const f=api.fixture,ledger=f.loader.load('lib/c1AccountLedger.js');
const source9=f.sessions.at(-1),source10=clone(source9);
function nextDate(value){
 if(typeof value==='string')return value.startsWith('2026-11-09')?'2026-11-10'+value.slice(10):value;
 if(Array.isArray(value))return value.map(nextDate);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,nextDate(item)]));
 return value;
}
Object.assign(source10,nextDate(source10));
f.sessions.push(source10);f.book.model.sessions.push(f.sessions[221],source9,source10);
for(const session of f.book.model.sessions.slice(221))f.book.captures.push({sessionDate:session.date,hash:'activation-boundary:'+session.date,observedAt:session.decisionAt});
let books=ledger.c1AccountBooks(f.account.adoption);
const records=[];
function captured(date,sourceDate,side,shares,price){
 const baseline=f.book.model.sessions.find(session=>session.date===sourceDate),signal=baseline.signals.find(s=>s.symbol==='MRNA');
 const reason=side==='buy'?(signal.entryTiming.strongPass===true?'Strong Buy':'Buy'):'owner-discretionary-exit';
 const id=side==='buy'?'base:'+date+':0':'owner-exit:base:'+date+':MRNA';
 const order={id,date,sleeve:'base',symbol:'MRNA',side,shares:side==='buy'?24:shares,reason,
  ...(side==='sell'?{recordingOnly:true}:{initialSwingStopPolicy:'c1-new-swing-initial-stop-10-v1',initialSwingStopPct:10,targetShares:24})};
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:sourceDate,observedAt:date+'T15:00:00.000Z',openingBooks:clone(books),orders:[order],
  purchaseFundingPolicy:'brokerage-cash-only-v1',completionPolicy:{version:1,partialSymbols:[]},
  riskBySleeve:Object.fromEntries(['base','cooldown15','sector40'].map(s=>[s,{highWater:f.account.adoption.seeds[s].highWater*f.account.adoption.seeds[s].actualDollarsPerModelDollar,paused:false}]))};
 const fills=[{id:'actual:'+date,orderId:id,symbol:'MRNA',side,shares,price,fee:0,executedAt:date+'T15:00:00.000Z'}];
 books=ledger.reconcileC1ActualAccountFills({plan,fills,observedAt:date+'T16:00:00.000Z'}).books;
 records.push({date,openingObservedAt:plan.observedAt,complete:true,basis:'recorded-intraday-fills',completionPolicy:plan.completionPolicy,executionEvidence:plan,fills});
}
captured('2026-11-06','2026-11-05','buy',2,100);
captured('2026-11-09','2026-11-06','sell',2,90);
captured('2026-11-10','2026-11-09','buy',9,100);
f.account={...f.account,records,sourceHashes:f.book.captures.filter(c=>c.sessionDate>='2026-11-05').map(c=>({date:c.sessionDate,hash:c.hash}))};
f.now='2026-11-11T02:10:00.000Z';
const before=JSON.stringify(f.account),economics=JSON.stringify({adoption:f.account.adoption,records:f.account.records});
// Before the repair this real continuation throws:
// Actual fill could not be applied to its C1 decision (MRNA buy Buy).
const decision=f.service.evaluateC1Account({account:f.account,book:f.book,now:f.now});
assert.equal(decision.sourceSessionDate,'2026-11-10');
assert.equal(decision.positions.find(p=>p.symbol==='MRNA').shares,9,'The already executed pre-cutover repurchase remains owned');
assert.equal(decision.positions.find(p=>p.symbol==='MRNA').avgCost,100);
assert.equal(decision.actualCash,29080,'Every recorded price and cash flow remains unchanged');
assert(decision.accountPolicy.blockedSymbols.includes('MRNA'),'The original loss still blocks NEW November 11 repurchases');
assert(!decision.opportunities.some(p=>p.symbol==='MRNA'));
assert(decision.opportunities.some(p=>p.symbol!=='MRNA'),'Unrelated qualifying stocks remain eligible for the new close-generated queue');
(async()=>{
 for(const method of ['GET','POST']){
  const response=await api.request(method,method==='POST'?{operation:'refresh-analysis'}:undefined);
  assert.equal(response.status,200,JSON.stringify({method,code:response.body.code,error:response.body.error}));
  assert.equal(response.body.decision.sourceSessionDate,'2026-11-10');
  assert.equal(response.body.decision.positions.find(p=>p.symbol==='MRNA').shares,9);
 }
 assert.equal(f.writes,0,'Normal GET and refresh-analysis POST never write the saved account');
 assert.equal(JSON.stringify(f.account),before,'Read-only analysis preserves the entire saved record');
 const completedAccount=f.account,lastRecord=records.at(-1);
 // Match the production saved shape: completed records stop at November 9;
 // November 10 actual fills remain in intradayActivity after the session ends.
 f.account={...clone(completedAccount),records:clone(records.slice(0,-1)),sourceHashes:clone(completedAccount.sourceHashes.filter(row=>row.date<'2026-11-10')),
  intradayActivity:{date:'2026-11-10',openingObservedAt:lastRecord.openingObservedAt,plan:clone(lastRecord.executionEvidence),
   tickets:[{id:'recorded-ticket',symbol:'MRNA',side:'buy',shares:9,price:100,fee:0,executedAt:lastRecord.fills[0].executedAt}],fills:clone(lastRecord.fills)}};
 const carriedBefore=JSON.stringify(f.account);
 for(const method of ['GET','POST']){
  const response=await api.request(method,method==='POST'?{operation:'refresh-analysis'}:undefined);
  assert.equal(response.status,200,JSON.stringify({shape:'saved-intraday-carry',method,code:response.body.code,error:response.body.error}));
  assert.equal(response.body.decision.sourceSessionDate,'2026-11-10');
  assert.equal(response.body.decision.actualCash,29080);
  assert.equal(response.body.decision.positions.find(p=>p.symbol==='MRNA').shares,9);
  assert.equal(response.body.decision.positions.find(p=>p.symbol==='MRNA').avgCost,100);
  assert.equal(response.body.intradaySession.afterClose,true);
  assert.equal(JSON.stringify(f.account),carriedBefore,'Completed carry remains derived in memory; saved intraday history is untouched');
 }
 assert.equal(f.writes,0);
 // The narrow policy gate repair must not accept missing original order
 // authority or a fill larger than its actual captured order.
 for(const defect of ['missing-order','excess-quantity']){
  f.account=clone(completedAccount);
  if(defect==='missing-order')f.account.records.at(-1).executionEvidence.orders=[];
  else f.account.records.at(-1).fills[0].shares=25;
  const invalidBefore=JSON.stringify(f.account);
  const response=await api.request(defect==='missing-order'?'GET':'POST',defect==='missing-order'?undefined:{operation:'refresh-analysis'});
  assert.equal(response.status,422,JSON.stringify({defect,status:response.status,code:response.body.code,error:response.body.error}));
  assert.equal(response.body.code,'ACCOUNT_VALIDATION_FAILED');
  assert.equal(JSON.stringify(f.account),invalidBefore,'Rejected evidence is never silently repaired or rewritten');
  assert.equal(f.writes,0);
 }
 f.account=completedAccount;
 f.now='2026-11-11T17:00:00.000Z';f.setCash(29080);
 const current=await api.request('POST',{operation:'prepare-execution'});
 assert.equal(current.status,200,JSON.stringify({code:current.body.code,error:current.body.error,openingError:current.body.openingError}));
 const buys=current.body.openingPlan?.orders.filter(o=>o.side==='buy')||[];
 assert(!buys.some(o=>o.symbol==='MRNA'),'November 11 execution enforces the account-wide stock cooldown');
 assert(buys.some(o=>o.symbol!=='MRNA'),'November 11 execution can still recommend unrelated qualifying stocks');
 assert.equal(f.writes,0);assert.equal(JSON.stringify({adoption:f.account.adoption,records:f.account.records}),economics);
 console.log('PASS: real GET/refresh-analysis reads preserve completed and saved-intraday Nov10 fills/economics without writes; missing/oversize order evidence stays rejected; Nov11 cooldowns block new same-name buys and permit unrelated replacements.');
})().catch(error=>{console.error(error);process.exitCode=1;});
