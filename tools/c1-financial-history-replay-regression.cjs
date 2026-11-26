// Fictional operational history, never an investment-performance result.
// Prices and quantities intentionally differ from the owner's broker records.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),{createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} differs from ${b}`),same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
function financialHistoryFixture(){
 const loader=createResearchModuleLoader(process.cwd()),ledger=loader.load('lib/c1AccountLedger.js'),project=loader.load('lib/c1AccountProjection.js').projectC1AccountSession,
  market=loader.load('lib/marketSession.js'),workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-04',portfolio:[{symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-04'},{symbol:'CASH',role:'Swing',shares:3000,avgCost:1}]});
 const history=JSON.parse(JSON.stringify(workflow.sessions).replace(/"MRNA"/g,'"VEEV"'));
 for(let day=new Date('2026-11-09T12:00:00Z');day.toISOString().slice(0,10)<='2026-11-24';day.setUTCDate(day.getUTCDate()+1)){
  const date=day.toISOString().slice(0,10);if(!market.isUsMarketSessionDay(date))continue;
  const session=clone(history.at(-1));session.date=date;session.decisionAt=date+'T21:00:00Z';for(const price of session.prices)price.date=date;history.push(session);
 }
 for(const session of history.filter(row=>row.date>='2026-11-06'))Object.assign(session.prices.find(row=>row.symbol==='LLL'),{open:87.5,high:87.6,low:87.4,close:87.5});
 const owned=history.filter(row=>row.date>='2026-11-04'),completed=owned.filter(row=>row.date<'2026-11-24'),records=completed.slice(1).map(row=>({date:row.date,complete:true,fills:[]})),now=new Date('2026-11-24T17:00:00Z');
 const args=()=>({adoption:workflow.account.adoption,sessions:completed,historySessions:history,records,observedAt:now});
 function planFor(date){
  const index=completed.findIndex(row=>row.date===date),sessions=completed.slice(0,index),continued=ledger.continueC1ActualAccount({...args(),sessions,records:records.slice(0,index-1)});
  return project({adoption:workflow.account.adoption,baseline:sessions.at(-1),opening:completed[index],observedAt:date+'T15:00:00Z',books:continued.books,sessions,historySessions:history,replay:continued.replay,
   accountCompletionRules:ledger.c1CompletionRules(records.slice(0,index),workflow.account.adoption.sourceSessionDate)});
 }
 const buyRecord=records.find(row=>row.date==='2026-11-06');buyRecord.completionPolicy={version:1,partialSymbols:['VEEV']};
 const buyPlan=planFor('2026-11-06'),buyOrder=buyPlan.orders.find(order=>order.sleeve==='base'&&order.symbol==='VEEV'&&order.side==='buy');
 assert(buyOrder,'The original unchanged model must actually offer the fictional VEEV purchase: '+JSON.stringify({orders:buyPlan.orders,entryReviews:buyPlan.entryReviews}));
 const buy={id:'fictional-historical-veev-buy',orderId:buyOrder.id,symbol:'VEEV',side:'buy',shares:1,price:100,fee:.01,executedAt:'2026-11-06T15:01:00Z'};
 buyRecord.executionEvidence=clone(buyPlan);buyRecord.fills=[buy];
 const addRecord=records.find(row=>row.date==='2026-11-09');addRecord.completionPolicy={version:1,partialSymbols:['VEEV']};
 const addPlan=planFor(addRecord.date),addOrder=addPlan.orders.find(order=>order.sleeve==='base'&&order.symbol==='VEEV'&&order.side==='buy');assert(addOrder);
 const add={id:'fictional-historical-veev-add',orderId:addOrder.id,symbol:'VEEV',side:'buy',shares:1,price:99.9,fee:.01,executedAt:'2026-11-09T15:01:00Z'};
 addRecord.executionEvidence=clone(addPlan);addRecord.fills=[add];
 const sellRecord=records.find(row=>row.date==='2026-11-10'),sellPlan=planFor(sellRecord.date),sellOrder={id:'fictional-historical-veev-sale',date:sellRecord.date,sleeve:'base',symbol:'VEEV',side:'sell',shares:2,reason:'owner-discretionary-exit',recordingOnly:true,estimatedPrice:100.2};
 sellPlan.orders.push(sellOrder);const sell={id:'fictional-historical-veev-sale-fill',orderId:sellOrder.id,symbol:'VEEV',side:'sell',shares:1,price:100.2,fee:.02,executedAt:'2026-11-10T15:01:00Z'};
 sellRecord.executionEvidence=clone(sellPlan);sellRecord.fills=[sell];
 const original=ledger.continueC1ActualAccount(args()),review={contract:'c1-broker-statement-review-v1',reviewId:'a'.repeat(64),bindings:{accountHash:'b'.repeat(64)},window:{from:'2026-11-04',through:'2026-11-23'},
  externalCapitalFlows:[{date:'2026-11-05',kind:'core-purchase',netCash:-2800}],pnlCashEvents:[],matchedTrades:[],remainingRoundedBalanceAdjustment:{allowed:true,amount:0,limit:5},
  originalLedgerCash:original.actualCash,afterKnownEventsCash:original.actualCash-2800,currentBrokerAvailability:{brokerageCash:original.actualCash-2800}};
 return {loader,ledger,workflow,history,owned,completed,records,now,args,planFor,buy,add,sell,buyPlan,original,review};
}
module.exports={financialHistoryFixture};
function legacyFinancialSimulator(loader){
 const file=path.resolve('lib/c1RecentMomentumChallengerSimulator.js'),original=fs.readFileSync(file,'utf8'),needle='const accountHistory=(c1AccountPolicyApplies(session.date)||actualReplay?.hasTrustedCashFlowReplay())&&!projection;';
 assert.equal(original.split(needle).length,2,'Reproduce only the demonstrated old completed-history date restriction');
 const imports={},source=original.replace(needle,'const accountHistory=c1AccountPolicyApplies(session.date)&&!projection;').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=loader.load(request,file);for(const name of names.split(',').map(part=>part.trim())){assert(name in values);imports[name]=values[name];}return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ');
 const box={...imports,Date,Intl,console};vm.createContext(box);vm.runInContext(source+';globalThis.simulate=simulatePointInTimePortfolio;',box,{filename:file});return box.simulate;
}
async function main(){
 const f=financialHistoryFixture(),before=clone(f.args()),cash=f.loader.load('lib/c1CashAccounting.js'),flows=f.loader.load('lib/c1CashFlowReplay.js'),
  adapter=f.loader.load('lib/c1ActualFillReplay.js'),context=cash.createC1CashAccounting({review:f.review}),effective=f.ledger.continueC1ActualAccount({...f.args(),cashAccounting:context}),
  seed=f.workflow.account.adoption.seeds.base,options={...f.loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS.base,startDate:seed.asOfSession,endDate:f.completed.at(-1).date,liquidateAtEnd:false,
   recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate:f.completed.at(-1).date,projectionDate:null,accountPolicy:effective.accountPolicy}},
  dataset={sessions:f.completed,recentMomentumHistorySessions:f.history};
 let cases=0;async function check(name,run){await run();cases++;console.log('PASS '+name);}
 await check('the old date restriction reproduces the exact observed unused VEEV Buy fingerprint',()=>{
  assert.throws(()=>legacyFinancialSimulator(f.loader)(dataset,options,seed,effective.replay.base),error=>
   createHash('sha256').update('c1-cash-review-failure-v1\0'+error.message).digest('hex').slice(0,16)==='b97fc5e99c06499b');
 });
 await check('trusted financial replay consumes validated prepolicy Buy, Add and partial Sell without rewriting facts',()=>{
  near(effective.actualCash,f.original.actualCash-2800);same(f.args(),before);same(effective.recordedHistory.books,f.original.books);
  for(const id of ['base','cooldown15','sector40']){
   same(effective.books[id].positions,f.original.books[id].positions);
   const actual=effective.sleeves[id].openPositions,raw=f.original.sleeves[id].openPositions;
   for(const held of raw){const row=actual.find(position=>position.symbol===held.symbol);near(row.shares,held.shares);near(row.stopPrice,held.stopPrice);assert.equal(row.enteredAt,held.enteredAt);}
  }
  const fills=effective.replay.base.sessions.flatMap(row=>row.fills),scale=seed.actualDollarsPerModelDollar;
  for(const original of [f.buy,f.add,f.sell]){const replay=fills.find(fill=>fill.id===original.id);assert(replay);near(replay.shares*scale,original.shares);near(replay.fee*scale,original.fee);assert.equal(replay.price,original.price);assert.equal(replay.executedAt,original.executedAt);}
  assert.equal(effective.books.base.positions.VEEV.shares,1);assert.equal(effective.books.base.positions.VEEV.openedAt,'2026-11-06');
  assert.equal(effective.operationalRiskReceipts.base?.length||0,0,'Unfilled hypothetical exits do not invent a completed risk-reset episode');
 });
 await check('serialized or copied inputs and mismatched allocation units cannot create financial-history authority',()=>{
  assert.equal(flows.c1HasCashFlowReplay(effective.replay.base,seed),true);
  for(const replay of [clone(effective.replay.base),{...effective.replay.base,statementApproved:true,hasTrustedCashFlowReplay:()=>true}]){
   assert.equal(flows.c1HasCashFlowReplay(replay,seed),false);assert.equal(adapter.createC1ActualFillReplay(replay,seed,f.completed).hasTrustedCashFlowReplay(),false);
  }
  assert.equal(flows.c1HasCashFlowReplay(effective.replay.base,{...seed,sleeve:'cooldown15'}),false);
  assert.equal(flows.c1HasCashFlowReplay(effective.replay.base,{...seed,actualDollarsPerModelDollar:seed.actualDollarsPerModelDollar*2}),false);
  assert.throws(()=>f.ledger.continueC1ActualAccount({...f.args(),cashAccounting:clone(context)}),/server-validated/);
 });
 await check('normal next-opening projection preserves trusted historical fills while current purchase/risk gates remain active',()=>{
  const plan=f.loader.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening({...f.args(),opening:f.owned.at(-1),observedAt:f.now.toISOString(),cashAccounting:context,purchaseFundingIndependent:true});
  near(Object.values(plan.openingBooks).reduce((sum,book)=>sum+book.cash,0),effective.actualCash);
  assert.equal(plan.orders.filter(order=>order.side==='buy').length,0);assert(Object.values(plan.riskBySleeve).some(risk=>risk.operationalRisk?.requiresLiquidationEpoch===true));
  same(f.args(),before);
 });
 await check('actual HTTP review, confirmation, normal reload and prepare use the repaired prepolicy financial history',async()=>{
  const account={...clone(f.workflow.account),records:clone(f.records),sourceHashes:f.completed.map(row=>({date:row.date,hash:'synthetic-workflow:'+row.date})),
   brokerageCash:{balance:Math.round(effective.actualCash*100)/100,observedAt:'2026-11-24T14:30:00Z',source:'manual-broker-balance'}},
   portfolio=[{symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-04'},{symbol:'VEEV',role:'Swing',shares:1,avgCost:effective.books.base.positions.VEEV.avgCost,openedAt:'2026-11-06'},
    {symbol:'CORC',role:'Core',shares:28,avgCost:100,openedAt:'2026-11-05'}],
   text='Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n11/05/2026,Buy,CORC,28,100,0,-2800\n11/06/2026,Buy,VEEV,1,100,0.01,-100.01\n11/09/2026,Buy,VEEV,1,99.9,0.01,-99.91\n11/10/2026,Sell,VEEV,1,100.2,0.02,100.18\n',
   book={universe:'sp500',model:{sessions:f.history.filter(row=>row.date<'2026-11-24')},captures:f.history.filter(row=>row.date<'2026-11-24').map(row=>({sessionDate:row.date,hash:'synthetic-workflow:'+row.date,observedAt:row.decisionAt}))},
   state={account,etag:'"history-before"',writes:0,providers:0},never=()=>{state.providers++;throw Error('No fictional network access');},file=path.resolve('pages/api/c1-account.js'),imports={};
  const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
   const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:request.endsWith('c1OwnerAccess')?require('./c1-owner-access-extraction.cjs').ownerAccessFixture():f.loader.load(request,file);
   for(const name of names.split(',').map(part=>part.trim())){assert(name in values);imports[name]=values[name];}return '';
  }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
  const box={...imports,Date,Response,process:{env:{}},console:{info(){},warn(){},error(){}}};vm.createContext(box);vm.runInContext(source,box,{filename:file});
  const handler=box.factory({environment:'preview',commit:'a'.repeat(40),clock:()=>f.now,readBook:async()=>({record:clone(book)}),readPortfolio:async()=>({portfolio:clone(portfolio),etag:'"history-portfolio"'}),
   collectOpening:async()=>{throw Error('Fictional opening evidence unavailable');},collectHoldings:never,collectRanks:never,
   store:{read:async()=>({record:clone(state.account),etag:state.etag}),write:async(_path,next,etag)=>{assert.equal(etag,state.etag);state.account=clone(next);state.etag='"history-after"';state.writes++;}}});
  async function request(body){const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
   await handler({method:body?'POST':'GET',headers:{authorization:'Bearer '+'fictional_financial_history_key_'.repeat(2)},body},response);return response;}
  const proposal=await request({operation:'review-broker-cash-history',statementText:text,expectedRevision:account.revision});assert.equal(proposal.statusCode,200,JSON.stringify(proposal.body));assert.equal(proposal.body.cashReview.financialValid,true);assert.equal(state.writes,0);
  const saved=await request({operation:'confirm-broker-cash-history',statementText:text,reviewId:proposal.body.cashReview.reviewId,expectedRevision:account.revision,confirmed:true});assert.equal(saved.statusCode,200,JSON.stringify(saved.body));assert.equal(state.writes,1);near(saved.body.decision.actualCash,effective.actualCash);
  const reread=await request();assert.equal(reread.statusCode,200,JSON.stringify(reread.body));near(reread.body.decision.actualCash,effective.actualCash);same(state.account.adoption,account.adoption);same(state.account.records,account.records);
  const prepared=await request({operation:'prepare-execution'});assert.equal(prepared.statusCode,200,JSON.stringify(prepared.body));near(prepared.body.decision.actualCash,effective.actualCash);assert.equal(prepared.body.manualRecommendations.orders.filter(order=>order.side==='buy').length,0);assert.equal(state.providers,0);assert.equal(state.writes,1);
 });
 console.log(`PASS: ${cases} prepolicy financial-history flows; exact old failure reproduced, original evidence preserved, private proof enforced, real review/confirm/reload and current execution guards retained. Fictional behavior only.`);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
