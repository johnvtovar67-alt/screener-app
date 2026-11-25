// Fictional application behavior only. No provider calls, account storage,
// real market history, brokerage execution, or investment-performance claims.
const assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),load=file=>loader.load('lib/'+file+'.js');
const clone=value=>JSON.parse(JSON.stringify(value)),same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-6,message||`${a} differs from ${b}`);
const ids=['base','cooldown15','sector40'];let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name);}

function fixture(legacy=false,currentPnl=false){
 const workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-19',portfolio:[
  {symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-19'},
  {symbol:'CASH',role:'Swing',shares:3000,avgCost:1}]});
 workflow.now='2026-11-24T17:00:00Z';
 const sessions=workflow.sessions.filter(session=>session.date>='2026-11-19'),records=sessions.slice(1).map(session=>({date:session.date,complete:true,fills:[]}));
 const book={...workflow.book,model:{sessions:workflow.sessions},captures:workflow.sessions.map(session=>({sessionDate:session.date,hash:'synthetic-workflow:'+session.date,observedAt:session.decisionAt}))};
 let account={...workflow.account,records,sourceHashes:sessions.map(session=>({date:session.date,hash:'synthetic-workflow:'+session.date})),
  brokerageCash:{balance:currentPnl?2232.99:2203,observedAt:'2026-11-24T14:30:00Z',source:'manual-broker-balance'}};
 const original=load('c1AccountLedger').continueC1ActualAccount({adoption:account.adoption,sessions,historySessions:workflow.sessions,records,observedAt:workflow.now});
 let statement='Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n11/20/2026,Buy,CORC,1,800,0,-800\n11/20/2026,Bank Interest,,0,0,0,3\n';
 if(currentPnl)statement+='11/24/2026,Bank Interest,,0,0,0,30\n';
 if(legacy){
  const order={id:'fictional-owner',date:'2026-11-24',sleeve:'base',symbol:'LLL',side:'sell',shares:25,reason:'owner-discretionary-exit',recordingOnly:true,estimatedPrice:100};
  const plan={contract:'c1-actual-account-opening-plan-v1',date:order.date,sourceSessionDate:'2026-11-23',observedAt:'2026-11-24T14:45:00Z',openingBooks:clone(original.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1'};
  const ticket={id:'fictional-sale',symbol:'LLL',side:'sell',shares:1,price:100,fee:.01,executedAt:'2026-11-24T15:00:00Z',recordingReason:'owner-discretionary-exit'};
  account.intradayActivity={date:plan.date,plan,tickets:[ticket],fills:[{id:ticket.id+':base',orderId:order.id,symbol:ticket.symbol,side:ticket.side,shares:ticket.shares,price:ticket.price,fee:ticket.fee,executedAt:ticket.executedAt}]};
  statement+='11/24/2026,Sell,LLL,1,100,.01,99.99\n';
 }
 const snapshot=clone(account),portfolio=[...workflow.portfolio,{symbol:'CORC',role:'Core',shares:1,avgCost:800}];
 const approve=current=>{
  const review=load('c1BrokerStatementReview').reviewC1BrokerStatement({account:current,statementText:statement,portfolio,now:workflow.now,completedBooks:original.books});
  return load('c1BrokerCashJournal').appendC1BrokerCashJournal({account:current,review,reviewId:review.reviewId,confirmed:true,expectedRevision:current.revision,now:workflow.now});
 };
 account=approve(account);
 return {workflow,account,book,original,snapshot,approve};
}
const sumCash=books=>Object.values(books).reduce((sum,row)=>sum+row.cash,0);
const holding=(decision,symbol)=>decision.positions.find(row=>row.symbol===symbol);
const analysis=f=>load('c1AccountService').deriveC1AccountAnalysis({account:f.account,book:f.book,now:f.workflow.now});
const prepare=f=>load('c1AccountExecutionView').prepareC1AccountExecution({account:f.account,book:f.book,now:f.workflow.now,collectOpening:f.workflow.collectOpening});

async function main(){
 await check('actual account analysis and current opening share corrected cash, exposure and risk references',async()=>{
  const f=fixture(),view=analysis(f),prepared=await prepare(f);
  near(view.decision.actualCash,2203);near(view.decision.strategyCash,2203);
  assert.equal(view.decision.cashAccountingStatus.status,'applied');assert.equal(view.decision.cashAccounting.allocations.length,3);
  assert.equal(prepared.openingError,null);assert(prepared.openingPlan.cashAccounting);
  near(sumCash(prepared.openingPlan.openingBooks),2203);
  same(prepared.intradaySession.plan.cashAccounting,prepared.openingPlan.cashAccounting);
  const continued=load('c1CashAccounting').c1CashAccountingDecisionContinued(prepared.decision);
  assert(continued,'The final returned decision retains its private financial capability');
  let sectorLimit=0;
  for(const id of ids){
   const scale=f.account.adoption.seeds[id].actualDollarsPerModelDollar,risk=prepared.openingPlan.riskBySleeve[id];
   near(risk.highWater,continued.sleeves[id].accountRisk.highWater*scale);
   near(view.decision.recordedHistory.allocations.find(row=>row.sleeve===id).rawHistoricalPeak,
    continued.recordedHistory.sleeves[id].accountRisk.historicalHighWater*scale);
   assert(risk.highWater<f.original.sleeves[id].accountRisk.highWater*scale,'External capital cannot leave the old risk denominator active');
   const book=prepared.openingPlan.openingBooks[id],equity=book.cash+(book.positions.LLL?.shares||0)*100;
   sectorLimit+=equity*load('c1FrozenOptions').C1_FROZEN_OPTIONS[id].maxSectorPct;
  }
  near(prepared.openingPlan.accountExposure.maxSectorValue,sectorLimit);
  same(f.account.adoption,f.snapshot.adoption);same(f.account.records,f.snapshot.records);
 });
 await check('legacy recorded activity retains exact fills while current authority and close use financial books',async()=>{
  const f=fixture(true),prepared=await prepare(f);
  assert.equal(prepared.openingError,null);near(prepared.decision.actualCash,2302.99);near(sumCash(prepared.openingPlan.openingBooks),2302.99);
  assert.equal(holding(prepared.decision,'LLL').shares,99);
  same(prepared.account.intradayActivity.fills,f.snapshot.intradayActivity.fills);
  same(prepared.account.intradayActivity.tickets,f.snapshot.intradayActivity.tickets);
  same(prepared.account.intradayActivity.plan.openingBooks,f.snapshot.intradayActivity.plan.openingBooks,'Legacy recording evidence retains raw opening balances');
  const close=clone(f.workflow.sessions.at(-1));close.date='2026-11-24';close.decisionAt=close.date+'T21:00:00Z';for(const row of close.prices)row.date=close.date;
  const book={...f.book,model:{sessions:[...f.book.model.sessions,close]},captures:[...f.book.captures,{sessionDate:close.date,hash:'synthetic-workflow:'+close.date,observedAt:close.decisionAt}]};
  const closed=load('c1AccountService').deriveC1AccountAnalysis({account:prepared.account,book,now:new Date(close.date+'T22:00:00Z')});
  near(closed.decision.actualCash,2302.99);assert.equal(holding(closed.decision,'LLL').shares,99);
  same(closed.account.records.at(-1).fills,f.snapshot.intradayActivity.fills);
 });
 await check('completed-add recording accepts an approved predecessor only with unchanged full opening economics',()=>{
  const f=fixture(),recovery=load('c1CompletedAddRecovery');
  const first=recovery.c1CompletedAddRecordingSession({account:f.account,book:f.book,now:f.workflow.now});
  assert(first.plan.cashAccounting);
  f.account={...f.account,intradayActivity:{date:first.date,plan:first.plan,tickets:[],fills:[]}};
  f.account=f.approve(f.account);
  const context=load('c1BrokerCashJournal').c1CashAccountingForAccount(f.account);
  assert.notEqual(first.plan.cashAccounting.sourceDigest,context.sourceDigest);
  f.workflow.now='2026-11-24T17:02:00Z';
  const ticket={id:'fictional-late-add',symbol:'LLL',side:'buy',shares:1,price:100,fee:0,executedAt:'2026-11-24T17:01:00Z',recordingReason:'owner-confirmed-completed-add',allocations:[{sleeve:'base',shares:1}]};
  const args={account:f.account,book:f.book,ticket,expectedRevision:f.account.revision,now:f.workflow.now};
  const saved=recovery.recordC1CompletedAddRecovery(args),current=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book:f.book,now:f.workflow.now});
  assert.equal(holding(current.decision,'LLL').shares,101);near(current.decision.actualCash,2103);
  same(saved.adoption,f.snapshot.adoption);same(saved.records,f.snapshot.records);
  const altered=clone(f.account);altered.intradayActivity.plan.openingBooks.base.cash+=.01;
  assert.throws(()=>recovery.recordC1CompletedAddRecovery({...args,account:altered}),/Saved opening balances changed/);
  const foreign=clone(f.account);foreign.intradayActivity.plan.cashAccounting.sourceDigest='f'.repeat(64);
  assert.throws(()=>recovery.recordC1CompletedAddRecovery({...args,account:foreign}),/Saved opening balances changed/);
  const close=clone(f.workflow.sessions.at(-1));close.date='2026-11-24';close.decisionAt=close.date+'T21:00:00Z';for(const row of close.prices)row.date=close.date;
  const book={...f.book,model:{sessions:[...f.book.model.sessions,close]},captures:[...f.book.captures,{sessionDate:close.date,hash:'synthetic-workflow:'+close.date,observedAt:close.decisionAt}]};
  const closed=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book,now:new Date(close.date+'T22:00:00Z')});
  near(closed.decision.actualCash,2103);assert.equal(holding(closed.decision,'LLL').shares,101);
 });
 await check('retained issued trades preserve financial proof through a second approved journal and record exactly once',()=>{
  const f=fixture(),cash=load('c1CashAccounting'),context=load('c1BrokerCashJournal').c1CashAccountingForAccount(f.account),continued=cash.c1CashAccountingDecisionContinued(analysis(f).decision);
  const order={id:'fictional-issued-add',sleeve:'base',date:'2026-11-24',symbol:'LLL',side:'buy',shares:1,estimatedPrice:100,reason:'add'};
  const plan={contract:'c1-actual-account-opening-plan-v1',date:order.date,sourceSessionDate:'2026-11-23',observedAt:'2026-11-24T17:00:00Z',providerVerified:true,
   sourceReceipt:{observedAt:'2026-11-24T17:00:00Z',membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},
   openingBooks:clone(continued.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',cashAccounting:cash.c1CashAccountingPlanIdentity(context)};
  f.account=load('c1IssuedTradeLog').retainC1IssuedEntries({account:f.account,view:{openingPlan:plan,manualRecommendations:{date:plan.date,sourceSessionDate:plan.sourceSessionDate,status:'ready',observedAt:plan.observedAt,validUntil:'2026-11-24T17:10:00Z',orders:[order]}}});
  const retained=clone(f.account.issuedC1Entries[0]);same(retained.recordingPlan.cashAccounting,plan.cashAccounting);
  plan.cashAccounting.sourceDigest='0'.repeat(64);same(f.account.issuedC1Entries[0],retained,'Retained proof is a detached immutable snapshot');
  f.account=f.approve(f.account);
  f.workflow.now='2026-11-24T17:02:00Z';
  const ticket={id:'fictional-issued-fill',symbol:'LLL',side:'buy',shares:1,price:100,fee:0,executedAt:'2026-11-24T17:01:00Z',recordingReason:'recorded-issued-buy'};
  const args={account:f.account,book:f.book,ticket,expectedRevision:f.account.revision,now:f.workflow.now};
  const saved=load('c1CompletedAddRecovery').recordC1IssuedBuy(args);
  same(saved.issuedC1Entries[0],retained);assert.equal(saved.intradayActivity.fills.length,1);
  assert.equal(load('c1CompletedAddRecovery').recordC1IssuedBuy({...args,account:saved,expectedRevision:saved.revision}),saved,'An exact recording retry cannot debit cash again');
  const current=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book:f.book,now:f.workflow.now});
  near(current.decision.actualCash,2103);assert.equal(holding(current.decision,'LLL').shares,101);
  const close=clone(f.workflow.sessions.at(-1));close.date='2026-11-24';close.decisionAt=close.date+'T21:00:00Z';for(const row of close.prices)row.date=close.date;
  const book={...f.book,model:{sessions:[...f.book.model.sessions,close]},captures:[...f.book.captures,{sessionDate:close.date,hash:'synthetic-workflow:'+close.date,observedAt:close.decisionAt}]};
  const closed=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book,now:new Date(close.date+'T22:00:00Z')});
  near(closed.decision.actualCash,2103);same(closed.account.issuedC1Entries[0],retained);
 });
 await check('known current P&L and a reviewed cent residual enter actual opening, recording and close exactly once',async()=>{
  const f=fixture(false,true),initial=analysis(f),prepared=await prepare(f),cash=load('c1CashAccounting');
  assert.equal(prepared.openingError,null);near(initial.decision.actualCash,2232.99);near(sumCash(prepared.openingPlan.openingBooks),2232.99);
  const prior=cash.c1CashAccountingDecisionContinued(initial.decision);
  near(prior.actualCash,2203,'The prior completed session remains unchanged');
  assert(ids.reduce((sum,id)=>sum+prepared.openingPlan.riskBySleeve[id].highWater,0)>
   ids.reduce((sum,id)=>sum+prior.sleeves[id].accountRisk.highWater*f.account.adoption.seeds[id].actualDollarsPerModelDollar,0),
   'Known income must reach the projected model risk reference, not only displayed opening cash');
  const source=load('c1CompletedAddRecovery').c1CompletedAddRecordingSession({account:f.account,book:f.book,now:f.workflow.now});
  near(sumCash(source.plan.openingBooks),2232.99);
  f.account={...f.account,intradayActivity:{date:source.date,plan:source.plan,tickets:[],fills:[]}};f.workflow.now='2026-11-24T17:02:00Z';
  const ticket={id:'fictional-current-income-add',symbol:'LLL',side:'buy',shares:1,price:100,fee:0,executedAt:'2026-11-24T17:01:00Z',recordingReason:'owner-confirmed-completed-add',allocations:[{sleeve:'base',shares:1}]};
  const args={account:f.account,book:f.book,ticket,expectedRevision:f.account.revision,now:f.workflow.now},saved=load('c1CompletedAddRecovery').recordC1CompletedAddRecovery(args);
  const current=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book:f.book,now:f.workflow.now});near(current.decision.actualCash,2132.99);
  const stops=decision=>holding(decision,'LLL').stops.map(({sleeve,price})=>({sleeve,price}));
  same(stops(current.decision),stops(initial.decision));assert.equal(holding(current.decision,'LLL').openedAt,holding(initial.decision,'LLL').openedAt);
  const altered=clone(f.account);altered.intradayActivity.plan.openingBooks.base.cash+=.01;
  assert.throws(()=>load('c1CompletedAddRecovery').recordC1CompletedAddRecovery({...args,account:altered}),/Saved opening balances changed/);
  const close=clone(f.workflow.sessions.at(-1));close.date='2026-11-24';close.decisionAt=close.date+'T21:00:00Z';for(const row of close.prices)row.date=close.date;
  Object.assign(close.prices.find(row=>row.symbol==='LLL'),{open:100,high:100.2,low:98.9,close:99});
  const book={...f.book,model:{sessions:[...f.book.model.sessions,close]},captures:[...f.book.captures,{sessionDate:close.date,hash:'synthetic-workflow:'+close.date,observedAt:close.decisionAt}]};
  const closed=load('c1AccountService').deriveC1AccountAnalysis({account:saved,book,now:new Date(close.date+'T22:00:00Z')});
  near(closed.decision.actualCash,2132.99);assert.equal(holding(closed.decision,'LLL').shares,101);
  near(sumCash(cash.c1CashAccountingDecisionContinued(closed.decision).books),2132.99);
  same(closed.account.adoption,f.snapshot.adoption);same(closed.account.records.slice(0,-1),f.snapshot.records);
  f.workflow.now='2026-11-25T17:00:00Z';
  const nextAccount=load('c1AccountService').updateC1BrokerageCash({account:closed.account,brokerageCash:2132.99,expectedRevision:closed.account.revision,now:f.workflow.now});
  const next=await load('c1AccountExecutionView').prepareC1AccountExecution({account:nextAccount,book,now:f.workflow.now,collectOpening:f.workflow.collectOpening});
  assert.equal(next.openingError,null);near(sumCash(next.openingPlan.openingBooks),2132.99);assert.equal(holding(next.decision,'LLL').shares,101);
  same(stops(next.decision),stops(initial.decision));assert.equal(holding(next.decision,'LLL').openedAt,holding(initial.decision,'LLL').openedAt);
 });
 await check('trusted financial replanning preserves recorded loss facts, pending exits and the next-opening-only reset',async()=>{
  for(const shares of [10,25]){
   const f=fixture(),date='2026-11-24',order={id:'fictional-recorded-risk-exit',date,sleeve:'sector40',symbol:'LLL',side:'sell',shares:25,estimatedPrice:100,reason:'portfolio-drawdown-stop'};
   const risk={highWater:4000,paused:true,operationalRisk:{requiresLiquidationEpoch:true,triggerDate:date,purchaseRiskReady:false}};
   const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-23',observedAt:date+'T14:45:00Z',
    openingBooks:clone(f.original.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',riskBySleeve:{sector40:risk}};
   const ticket={id:'fictional-risk-fill',symbol:'LLL',side:'sell',shares,price:100,fee:.25,executedAt:date+'T17:01:00Z'};
   const fill={...ticket,id:ticket.id+':sector40',orderId:order.id};
   f.account={...f.account,intradayActivity:{date,plan,tickets:[ticket],fills:[fill]}};f.workflow.now=date+'T17:02:00Z';
   const prepared=await prepare(f);assert.equal(prepared.openingError,null);
   same(prepared.account.intradayActivity.fills,[fill]);same(prepared.account.intradayActivity.plan.riskBySleeve.sector40,risk);
   same(prepared.account.intradayActivity.entryPlanEvidence,plan,'The original opening and trigger remain archived');
   assert.equal(prepared.openingPlan.riskBySleeve.sector40.operationalRisk.purchaseRiskReady,false);
   assert(!prepared.openingPlan.orders.some(row=>row.side==='buy'&&row.sleeve==='sector40'),'A completed intraday exit cannot silently reset its allocation');
   if(shares===25)assert(prepared.openingPlan.orders.some(row=>row.side==='buy'&&row.sleeve!=='sector40'),'After the confirmed exit, unrelated allocations keep their independently qualifying entries');
   const exits=prepared.openingPlan.orders.filter(row=>row.side==='sell'&&!row.condition&&row.sleeve==='sector40'&&row.symbol==='LLL');
   assert.equal(exits.reduce((sum,row)=>sum+row.shares,0),25-shares,'Only the original actual unfilled exit remains');
   if(shares<25){
    const again=await prepare({...f,account:prepared.account});assert.equal(again.openingError,null);
    same(again.openingPlan.orders.filter(row=>row.side==='sell'&&!row.condition&&row.sleeve==='sector40').map(row=>[row.id,row.shares]),exits.map(row=>[row.id,row.shares]));
    continue;
   }
   const close=clone(f.workflow.sessions.at(-1));close.date=date;close.decisionAt=date+'T21:00:00Z';for(const row of close.prices)row.date=date;
   const book={...f.book,model:{sessions:[...f.book.model.sessions,close]},captures:[...f.book.captures,{sessionDate:date,hash:'synthetic-workflow:'+date,observedAt:close.decisionAt}]};
   const closed=load('c1AccountService').deriveC1AccountAnalysis({account:prepared.account,book,now:new Date(date+'T22:00:00Z')});
   const continued=load('c1CashAccounting').c1CashAccountingDecisionContinued(closed.decision),receipt=continued.operationalRiskReceipts.sector40;
   assert.equal(receipt.length,1);assert.equal(receipt[0].historicalPeak,4000);near(receipt[0].postExitEquity,continued.books.sector40.cash);
   f.workflow.now='2026-11-25T17:00:00Z';
   const account=load('c1AccountService').updateC1BrokerageCash({account:closed.account,brokerageCash:4702.75,expectedRevision:closed.account.revision,now:f.workflow.now});
   const next=await load('c1AccountExecutionView').prepareC1AccountExecution({account,book,now:f.workflow.now,collectOpening:f.workflow.collectOpening});
   assert.equal(next.openingError,null);assert.equal(next.openingPlan.riskBySleeve.sector40.operationalRisk.appliedEpochs.length,1);
   near(next.openingPlan.riskBySleeve.sector40.operationalRisk.epoch.reference,receipt[0].postExitEquity);
  }
 });
 console.log(`PASS: ${checks} fictional application flows; real service/planner/recorder paths, approved predecessor lineage, retained proof, strict tamper rejection and financial close continuity. No live data or writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
