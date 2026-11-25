// Real combined cash-review HTTP handler and financial replay, with wholly
// fictional books, broker statement text and memory storage. No network, owner
// records, production endpoints, or mocked economic derivation are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const loader=createResearchModuleLoader(process.cwd()),clone=value=>JSON.parse(JSON.stringify(value));
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,message||`${actual} differs from ${expected}`);
const now=new Date('2026-11-24T17:00:00.000Z'),ids=['base','cooldown15','sector40'];
const apiFile=path.resolve('pages/api/c1-account.js');

function fictionalInput(kind='plain'){
 const workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-19',portfolio:[
  {symbol:'LLL',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-19'},
  {symbol:'CASH',role:'Swing',shares:3000,avgCost:1}
 ]});
 workflow.now=now;
 const sessions=workflow.sessions.filter(session=>session.date>='2026-11-19'),records=sessions.slice(1).map(session=>({date:session.date,complete:true,fills:[]}));
 const book={...workflow.book,model:{sessions:workflow.sessions},captures:workflow.sessions.map(session=>({sessionDate:session.date,hash:'synthetic-workflow:'+session.date,observedAt:session.decisionAt}))};
 const account={...workflow.account,records,sourceHashes:sessions.map(session=>({date:session.date,hash:'synthetic-workflow:'+session.date})),
  brokerageCash:{balance:2203,observedAt:'2026-11-24T14:30:00.000Z',source:'manual-broker-balance'}};
 const original=loader.load('lib/c1AccountLedger.js').continueC1ActualAccount({adoption:account.adoption,sessions,historySessions:workflow.sessions,records,observedAt:now});
 let statementText='Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n11/20/2026,Buy,CORC,1,800,0,-800\n11/20/2026,Bank Interest,,0,0,0,3\n';
 let expectedCash=2203,expectedShares=100;
 if(kind!=='plain'){
  const planned=kind==='planned',order={id:'fictional-current-sale',date:'2026-11-24',sleeve:planned?'sector40':'base',symbol:'LLL',side:'sell',shares:25,
   reason:planned?'portfolio-drawdown-stop':'owner-discretionary-exit',...(planned?{}:{recordingOnly:true}),estimatedPrice:100};
  const orders=[order,...(planned?ids.map(sleeve=>({id:'fictional-stop:'+sleeve,date:order.date,sleeve,symbol:'LLL',side:'sell',
   shares:original.books[sleeve].positions.LLL.shares,estimatedPrice:86,reason:'initial-stop',condition:'stop-triggered'})):[])];
  const plan={contract:'c1-actual-account-opening-plan-v1',date:order.date,sourceSessionDate:'2026-11-23',observedAt:'2026-11-24T14:45:00.000Z',
   openingBooks:clone(original.books),orders,purchaseFundingPolicy:'brokerage-cash-only-v1'};
  const ticket={id:'fictional-saved-sale',symbol:'LLL',side:'sell',shares:planned?25:1,price:100,fee:planned?.25:.01,
   executedAt:'2026-11-24T15:00:00.000Z',...(planned?{}:{recordingReason:'owner-discretionary-exit'})};
  const fills=planned?[['base',6,.06],['cooldown15',13,.13],['sector40',6,.06]].map(([sleeve,shares,fee])=>({
   id:ticket.id+':'+sleeve,orderId:sleeve==='sector40'?order.id:'fictional-stop:'+sleeve,symbol:ticket.symbol,side:ticket.side,
   shares,price:ticket.price,fee,executedAt:ticket.executedAt
  })):[{id:ticket.id+':base',orderId:order.id,symbol:ticket.symbol,side:ticket.side,shares:1,price:100,fee:.01,executedAt:ticket.executedAt}];
  account.intradayActivity={date:plan.date,openingObservedAt:plan.observedAt,plan,tickets:[ticket],fills};
  expectedCash=planned?4702.75:2302.99;expectedShares=planned?75:99;
  statementText+=`11/24/2026,Sell,LLL,${ticket.shares},100,${ticket.fee},${ticket.shares*100-ticket.fee}\n`;
 }
 return {account,book,statementText,expectedCash,expectedShares,workflow,
  portfolioRecord:{portfolio:[...clone(workflow.portfolio),{symbol:'CORC',role:'Core',shares:1,avgCost:800,openedAt:'2026-11-20'}],etag:'"fictional-portfolio-etag"'}};
}

function harness(kind='plain'){
 const input=fictionalInput(kind),state={account:clone(input.account),book:clone(input.book),portfolioRecord:clone(input.portfolioRecord),
  reads:0,writes:0,writeAttempts:0,portfolioReads:0,providerCalls:0,openingCalls:0,allowOpening:false,now:new Date(now),etag:'"fictional-account-etag"',conflict:false,commitThenFail:false};
 const never=()=>{state.providerCalls++;throw Error('External I/O is forbidden in this fictional API case');};
 const imports={},source=fs.readFileSync(apiFile,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:
   request.endsWith('c1OwnerAccess')?require('./c1-owner-access-extraction.cjs').ownerAccessFixture():loader.load(request,apiFile);
  for(const name of names.split(',').map(part=>part.trim())){assert(name in values,request+' exports '+name);imports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ')
  .replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,Date,Response,process:{env:{}},console:{info(){},warn(){},error(){}}};vm.createContext(box);vm.runInContext(source,box,{filename:apiFile});
 const handler=box.factory({environment:'preview',commit:'fictional-broker-cash-test',clock:()=>state.now,
  readBook:async()=>({record:clone(state.book)}),readPortfolio:async()=>{state.portfolioReads++;return clone(state.portfolioRecord);},
  collectOpening:async()=>{if(!state.allowOpening)return never();state.openingCalls++;input.workflow.now=state.now;return input.workflow.collectOpening();},collectHoldings:never,collectRanks:never,
  store:{read:async()=>{state.reads++;return {record:clone(state.account),etag:state.etag};},write:async(_path,account,etag)=>{
   state.writeAttempts++;assert.equal(etag,state.etag,'The real saver must retain the strong account ETag');
   if(state.conflict)throw Object.assign(Error('Fictional ETag conflict'),{name:'BlobPreconditionFailedError',status:412});
   state.account=clone(account);state.writes++;state.etag='"fictional-account-written-'+state.writes+'"';
   if(state.commitThenFail)throw Error('Fictional transport failure after committed write');
  }}
 });
 async function request(body,authorized=true){
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await handler({method:body?'POST':'GET',body,headers:authorized?{authorization:'Bearer '+'fictional_cash_review_key_'.repeat(2)}:{}},response);
  assert.equal(response.headers['Cache-Control'],'no-store');return response;
 }
 async function review(){
  const response=await request({operation:'review-broker-cash-history',statementText:input.statementText,expectedRevision:state.account.revision});
  assert.equal(response.statusCode,200,'Actual review response: '+JSON.stringify(response.body));assert.equal(response.body.cashReview.financialValid,true);return response.body.cashReview;
 }
 const confirmPayload=review=>({operation:'confirm-broker-cash-history',statementText:input.statementText,reviewId:review.reviewId,
  expectedRevision:review.revision,confirmed:true,...(review.plannedSaleCorrection?{attributionConfirmed:true}:{})});
 return {input,state,request,review,confirmPayload};
}

function preserved(original,current,{planned=false}={}){
 for(const field of ['adoption','records','sourceHashes'])same(current[field],original[field],field+' remains original');
 if(original.intradayActivity){
  same(current.intradayActivity.plan,original.intradayActivity.plan,'The captured opening plan remains original');
  same(current.intradayActivity.tickets,original.intradayActivity.tickets,'Broker tickets remain original');
  if(!planned)same(current.intradayActivity.fills,original.intradayActivity.fills,'Non-attribution fill parts remain original');
 }
}
function financial(view,input){
 const decision=view.decision;
 for(const field of ['brokerageCash','strategyCash','actualCash','executableCash'])near(decision[field],input.expectedCash,'One current cash balance: '+field);
 assert.equal(decision.positions.find(position=>position.symbol==='LLL').shares,input.expectedShares);
 assert.equal(decision.cashAccountingStatus.status,'applied');
 assert.equal(decision.cashAccounting.allocations.length,3);
 return decision;
}
let cases=0;const failures=[];
async function check(name,run){try{await run();cases++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}

(async()=>{
 await check('unauthorized requests cannot read accounts, statements or portfolios',async()=>{
  const h=harness();const response=await h.request({operation:'review-broker-cash-history',statementText:h.input.statementText,expectedRevision:0},false);
  assert.equal(response.statusCode,401);assert.equal(h.state.reads,0);assert.equal(h.state.portfolioReads,0);assert.equal(h.state.writeAttempts,0);
 });
 await check('read-only real review validates financial replay without current intraday activity',async()=>{
  const h=harness(),snapshot=clone(h.state.account),review=await h.review();
  assert.equal(review.financialPreview.currentCash,2203);assert.equal(review.financialPreview.accountingCash,2203);
  assert.equal(review.financialPreview.allocations.length,3);assert.equal(review.externalCapitalNet,-800);assert.equal(review.pnlCashNet,3);
  assert.equal(h.state.writes,0);assert.equal(h.state.writeAttempts,0);same(h.state.account,snapshot);assert.equal(h.state.providerCalls,0);
 });
 await check('explicit confirmation, stale revisions and tampered bindings reject before writing',async()=>{
  const h=harness(),review=await h.review(),payload=h.confirmPayload(review),snapshot=clone(h.state.account);
  for(const [patch,status]of [[{confirmed:false},422],[{expectedRevision:-1},409],[{reviewId:'0'.repeat(64)},409],
   [{statementText:h.input.statementText.replace('-800','-799')},409]]){
   const response=await h.request({...payload,...patch});assert.equal(response.statusCode,status,JSON.stringify({patch,response:response.body}));assert.equal(response.body.retryable,false);
   assert.equal(h.state.writeAttempts,0);same(h.state.account,snapshot);
  }
  h.state.portfolioRecord.etag='"new-fictional-portfolio-etag"';const changed=await h.request(payload);assert.equal(changed.statusCode,409,JSON.stringify(changed.body));assert.equal(h.state.writeAttempts,0);
 });
 await check('strong ETag conflict cannot silently rebase a financial correction',async()=>{
  const h=harness('owner'),review=await h.review(),payload=h.confirmPayload(review),snapshot=clone(h.state.account);h.state.conflict=true;
  const response=await h.request(payload);assert.equal(response.statusCode,409,JSON.stringify(response.body));assert.equal(response.body.code,'ACCOUNT_SAVE_CONFLICT');
  assert.equal(h.state.writeAttempts,1);assert.equal(h.state.writes,0);same(h.state.account,snapshot);assert.equal(h.state.providerCalls,0);
 });
 await check('confirm and reload use one current cash balance and preserve actual holdings, stops and original records',async()=>{
  for(const kind of ['plain','owner']){
   const h=harness(kind),before=clone(h.state.account),beforeDecision=loader.load('lib/c1AccountService.js').deriveC1AccountAnalysis({account:before,book:h.state.book,now}).decision,
    review=await h.review(),response=await h.request(h.confirmPayload(review));
   assert.equal(response.statusCode,200,JSON.stringify(response.body));financial(response.body,h.input);preserved(before,h.state.account);
   assert.equal(h.state.writes,1);assert.equal(response.body.brokerCashCorrectionReceipt.reviewId,review.reviewId);assert.equal(h.state.account.cashAccountingCorrections.length,1);
   same(h.state.account.cashAccountingCorrections[0].originalBrokerageCash,before.brokerageCash,'The prior broker observation remains in the immutable journal audit');
   near(h.state.account.brokerageCash.balance,h.input.expectedCash);assert.equal(h.state.account.brokerageCash.observedAt,now.toISOString());
   const reloaded=await h.request();assert.equal(reloaded.statusCode,200,JSON.stringify(reloaded.body));const decision=financial(reloaded.body,h.input);
   for(const position of decision.positions){
    const prior=beforeDecision.positions.find(row=>row.symbol===position.symbol);assert.equal(position.shares,prior.shares);assert.equal(position.avgCost,prior.avgCost);assert.equal(position.openedAt,prior.openedAt);
    same(position.stops,prior.stops,'The cash journal cannot change recorded stops');
   }
   preserved(before,h.state.account);assert.equal(h.state.writes,1);assert.equal(h.state.providerCalls,0);
  }
 });
 await check('identical accepted proposal is acknowledged without another revision or write',async()=>{
  const h=harness('owner'),review=await h.review(),payload=h.confirmPayload(review),first=await h.request(payload);
  assert.equal(first.statusCode,200,JSON.stringify(first.body));const snapshot=clone(h.state.account),again=await h.request(payload);
  assert.equal(again.statusCode,200,JSON.stringify(again.body));assert.equal(again.body.brokerCashCorrectionReceipt.reviewId,review.reviewId);
  assert.equal(h.state.writes,1);assert.equal(h.state.writeAttempts,1);same(h.state.account,snapshot);
 });
 await check('unconfirmed transport after committed write is not automatically retried; reload recovers its receipt',async()=>{
  const h=harness('owner'),before=clone(h.state.account),review=await h.review(),payload=h.confirmPayload(review);h.state.commitThenFail=true;
  let response=await h.request(payload);assert.equal(response.statusCode,503,JSON.stringify(response.body));assert.equal(response.body.code,'ACCOUNT_STORAGE_UNAVAILABLE');
  assert.doesNotMatch(response.body.error,/not saved|no changes were saved/i,'An uncertain transport cannot falsely promise that the committed correction was unsaved');
  assert.equal(h.state.writeAttempts,1);assert.equal(h.state.writes,1);preserved(before,h.state.account);assert.equal(h.state.account.cashAccountingCorrections.length,1);
  h.state.commitThenFail=false;response=await h.request();assert.equal(response.statusCode,200,JSON.stringify(response.body));financial(response.body,h.input);assert.equal(h.state.writeAttempts,1);
  response=await h.request(payload);assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(h.state.writeAttempts,1);assert.equal(h.state.writes,1);
 });
 await check('financial validation failure occurs before a conditional account write',async()=>{
  const h=harness('owner'),review=await h.review(),payload=h.confirmPayload(review),snapshot=clone(h.state.account);
  h.state.book.captures.at(-1).hash='changed-accepted-source';const response=await h.request(payload);
  assert.equal(response.statusCode,500,JSON.stringify(response.body));assert.equal(response.body.code,'ACCOUNT_INPUT_INTEGRITY_FAILED');
  assert.equal(h.state.writeAttempts,0);same(h.state.account,snapshot);
 });
 await check('a combined planned-sale correction requires its own explicit confirmation before writing',async()=>{
  const h=harness('planned'),before=clone(h.state.account),review=await h.review(),payload=h.confirmPayload(review);
  const response=await h.request({...payload,attributionConfirmed:false});assert.equal(response.statusCode,422,JSON.stringify(response.body));
  assert.equal(h.state.writeAttempts,0);same(h.state.account,before);
 });
 await check('one combined confirmation corrects completed planned allocations and leaves no phantom repeat sale',async()=>{
  const h=harness('planned'),before=clone(h.state.account),review=await h.review(),payload=h.confirmPayload(review);
  assert.equal(review.plannedSaleCorrection.rows.length,1);assert.equal(review.plannedSaleCorrection.rows[0].shares,25);assert.equal(h.state.writeAttempts,0);
  let response=await h.request(payload);assert.equal(response.statusCode,200,JSON.stringify(response.body));financial(response.body,h.input);preserved(before,h.state.account,{planned:true});
  assert.equal(h.state.writes,1);assert.equal(h.state.account.revision,before.revision+1,'Cash and attribution are one conditional update');
  assert.equal(h.state.account.cashAccountingCorrections.length,1);assert.equal(h.state.account.saleAttributionCorrections.length,1);
  same(h.state.account.saleAttributionCorrections[0].originalFills,before.intradayActivity.fills);
  const activity=h.state.account.intradayActivity;assert.equal(activity.fills.length,1);assert.equal(activity.fills[0].shares,25);assert.equal(activity.fills[0].orderId,'fictional-current-sale');
  const remaining=loader.load('lib/c1IntradayActivity.js').c1IntradayRemainingPlan({plan:activity.plan,activity,opening:{prices:[]},baseline:{},decision:{positions:[]},now});
  assert(!remaining.orders.some(order=>order.symbol==='LLL'&&order.side==='sell'&&!order.condition),'The fulfilled original planned exit cannot leave another partial instruction');
  const reloaded=await h.request();assert.equal(reloaded.statusCode,200,JSON.stringify(reloaded.body));financial(reloaded.body,h.input);
  response=await h.request(payload);assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(h.state.writes,1);assert.equal(h.state.providerCalls,0);
 });
 await check('a combined legacy sale correction with current minor cash posting survives a real opening refresh',async()=>{
  const h=harness('planned'),before=clone(h.state.account);
  h.state.account.brokerageCash.balance-=.02;h.input.expectedCash-=.02;
  const review=await h.review();near(review.remainingRoundedBalanceAdjustment.amount,-.02);
  let response=await h.request(h.confirmPayload(review));assert.equal(response.statusCode,200,JSON.stringify(response.body));financial(response.body,h.input);
  preserved(before,h.state.account,{planned:true});
  h.state.allowOpening=true;response=await h.request({operation:'prepare-execution'});
  assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(response.body.openingError,null);
  financial(response.body,h.input);
  assert(!response.body.manualRecommendations.orders.some(order=>order.id==='fictional-current-sale'&&order.side==='sell'&&!order.condition));
  const reloaded=await h.request();assert.equal(reloaded.statusCode,200,JSON.stringify(reloaded.body));financial(reloaded.body,h.input);
 });
 await check('accepted current close and repeated after-close reads apply recorded fills and income once',async()=>{
  for(const kind of ['plain','owner']){
   const h=harness(kind),before=clone(h.state.account),session=clone(h.state.book.model.sessions.at(-1));
   session.date='2026-11-24';session.decisionAt='2026-11-24T22:00:00.000Z';
   for(const price of session.prices)price.date=session.date;
   h.state.book.model.sessions.push(session);h.state.book.captures.push({sessionDate:session.date,hash:'fictional-accepted-current-close',observedAt:session.decisionAt});
   h.state.now=new Date('2026-11-24T23:00:00.000Z');
   const review=await h.review(),response=await h.request(h.confirmPayload(review));assert.equal(response.statusCode,200,JSON.stringify(response.body));financial(response.body,h.input);
   assert.equal(response.body.decision.sourceSessionDate,'2026-11-24');preserved(before,h.state.account);
   for(let index=0;index<2;index++){
    const reloaded=await h.request();assert.equal(reloaded.statusCode,200,JSON.stringify(reloaded.body));financial(reloaded.body,h.input);
    assert.equal(reloaded.body.decision.sourceSessionDate,'2026-11-24');assert.equal(h.state.writes,1);preserved(before,h.state.account);
   }
   assert.equal(h.state.providerCalls,0);
  }
 });
 await check('newer Core snapshots pause current purchases without persisting freshness flags or changing broker facts',async()=>{
  const h=harness(),review=await h.review();let response=await h.request(h.confirmPayload(review));assert.equal(response.statusCode,200,JSON.stringify(response.body));
  h.state.allowOpening=true;
  response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.decision.brokerageCashCurrent,true);
  assert(response.body.intradaySession.issuedChoices?.length,'The real pre-change Buy review retains issued recording evidence');
  const originalBroker=clone(h.state.account.brokerageCash),originalRecords=clone(h.state.account.records),beforeWrites=h.state.writes;
  h.state.now=new Date('2026-11-24T17:10:00.000Z');h.state.portfolioRecord.portfolio.find(position=>position.symbol==='CORC').lastTradeAt='2026-11-24T17:05:00.000Z';
  response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.decision.brokerageCashCurrent,false);assert.equal(response.body.decision.executableCash,0);
  assert.equal(response.body.decision.brokerageCashStatus,'Core-activity-review');
  assert(!response.body.manualRecommendations.orders.some(order=>order.side==='buy'),'A stale Core cash observation cannot publish a current purchase');
  assert.equal(h.state.writes,beforeWrites,'The freshness check itself does not write a financial correction');
  assert(!Object.hasOwn(h.state.account,'coreCashObservationRequired'));same(h.state.account.brokerageCash,originalBroker);same(h.state.account.records,originalRecords);
  const sale={id:'fictional-post-Core-sale',symbol:'LLL',side:'sell',shares:1,price:100,fee:.01,executedAt:'2026-11-24T17:06:00.000Z',recordingReason:'owner-discretionary-exit'};
  response=await h.request({operation:'record-intraday',ticket:sale,expectedRevision:h.state.account.revision});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.decision.brokerageCashCurrent,false);assert.equal(response.body.decision.executableCash,0);
  assert(!Object.hasOwn(h.state.account,'coreCashObservationRequired'),'The ordinary prepared-record save strips the request-local flag');
  same(h.state.account.brokerageCash,originalBroker);same(h.state.account.records,originalRecords);assert.equal(h.state.account.intradayActivity.tickets.at(-1).id,sale.id);
  assert.equal(h.state.providerCalls,0);
 });
 await check('a retained issued fill from before a later Core change remains recordable while new buying stays paused',async()=>{
  const h=harness(),review=await h.review();let response=await h.request(h.confirmPayload(review));assert.equal(response.statusCode,200,JSON.stringify(response.body));
  h.state.allowOpening=true;response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  const choice=response.body.intradaySession.issuedChoices?.[0];assert(choice,'The real verified review must retain a Buy before the later Core change');
  const originalBroker=clone(h.state.account.brokerageCash),originalRecords=clone(h.state.account.records);
  h.state.now=new Date('2026-11-24T17:10:00.000Z');h.state.portfolioRecord.portfolio.find(position=>position.symbol==='CORC').lastTradeAt='2026-11-24T17:05:00.000Z';
  const ticket={id:'fictional-before-Core-issued-fill',symbol:choice.symbol,side:'buy',shares:1,price:100,fee:0,executedAt:'2026-11-24T17:01:00.000Z',recordingReason:'recorded-issued-buy'};
  const beforeAttempts=h.state.writeAttempts;
  response=await h.request({operation:'record-intraday',ticket:{...ticket,id:'fictional-after-Core-issued-fill',executedAt:'2026-11-24T17:06:00.000Z'},expectedRevision:h.state.account.revision});
  assert.equal(response.statusCode,422,JSON.stringify(response.body));assert.equal(h.state.writeAttempts,beforeAttempts,'A fill after the Core change needs fresh cash evidence before accounting can assert its funding');
  response=await h.request({operation:'record-intraday',ticket,expectedRevision:h.state.account.revision});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.savedTradeTicket.id,ticket.id);assert.equal(response.body.decision.brokerageCashCurrent,false);assert.equal(response.body.decision.executableCash,0);
  assert(!Object.hasOwn(h.state.account,'coreCashObservationRequired'),'The retained-issued recording branch strips the request-local flag');
  same(h.state.account.brokerageCash,originalBroker);same(h.state.account.records,originalRecords);
  assert.equal(h.state.account.intradayActivity.tickets.at(-1).id,ticket.id);assert.equal(h.state.providerCalls,0);
 });
 console.log(`Combined brokerage-cash API regression: ${cases}/${cases+failures.length} fictional cases passed.`);
 if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
