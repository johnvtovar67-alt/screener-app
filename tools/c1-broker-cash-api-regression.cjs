// Real combined cash-review HTTP handler and financial replay, with wholly
// fictional books, broker statement text and memory storage. No network, owner
// records, production endpoints, or mocked economic derivation are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {createPortfolioSyncMemory}=require('./fixtures/c1-portfolio-sync-memory.cjs');
const loader=createResearchModuleLoader(process.cwd()),clone=value=>JSON.parse(JSON.stringify(value));
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,message||`${actual} differs from ${expected}`);
const now=new Date('2026-11-24T17:00:00.000Z'),ids=['base','cooldown15','sector40'];
const apiFile=path.resolve('pages/api/c1-account.js');
const key='fictional_cash_review_key_'.repeat(2);

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
  collectOpening:async()=>{if(!state.allowOpening)return never();state.openingCalls++;input.workflow.now=state.now;const opening=await input.workflow.collectOpening();await state.whileOpening?.();return opening;},collectHoldings:never,collectRanks:never,
  store:{read:async()=>{state.reads++;return {record:clone(state.account),etag:state.etag};},write:async(_path,account,etag)=>{
   state.writeAttempts++;assert.equal(etag,state.etag,'The real saver must retain the strong account ETag');
   if(state.conflict)throw Object.assign(Error('Fictional ETag conflict'),{name:'BlobPreconditionFailedError',status:412});
   state.account=clone(account);state.writes++;state.etag='"fictional-account-written-'+state.writes+'"';
   if(state.commitThenFail)throw Error('Fictional transport failure after committed write');
  }}
 });
 async function request(body,authorized=true){
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await handler({method:body?'POST':'GET',body,headers:authorized?{authorization:'Bearer '+key}:{}},response);
  assert.equal(response.headers['Cache-Control'],'no-store');return response;
 }
 async function review(){
  const response=await request({operation:'review-broker-cash-history',statementText:input.statementText,expectedRevision:state.account.revision});
  assert.equal(response.statusCode,200,'Actual review response: '+JSON.stringify(response.body));assert.equal(response.body.cashReview.financialValid,true);return response.body.cashReview;
 }
 const confirmPayload=review=>({operation:'confirm-broker-cash-history',statementText:input.statementText,reviewId:review.reviewId,
  expectedRevision:review.revision,confirmed:true,...(review.plannedSaleCorrection?{attributionConfirmed:true}:{})});
 return {input,state,request,review,confirmPayload,key,portfolioRequest:createPortfolioSyncMemory({state,loader,key})};
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
const prepare=h=>h.request({operation:'prepare-execution'});
const buys=response=>response.body.manualRecommendations.orders.filter(order=>order.side==='buy'&&!order.condition);
async function corrected(){
 const h=harness(),review=await h.review(),confirmation=await h.request(h.confirmPayload(review));
 assert.equal(confirmation.statusCode,200,JSON.stringify(confirmation.body));
 h.state.allowOpening=true;return h;
}
async function syncPortfolio(h,portfolio,options={}){
 const result=await h.portfolioRequest('PUT',{portfolio,expectedEtag:h.state.portfolioRecord.etag,...options});
 assert.equal(result.statusCode,200,JSON.stringify(result.body));return result.body;
}
let cases=0;const failures=[];
async function check(name,run){try{await run();cases++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}

if(require.main===module)(async()=>{
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
 await check('removing a saved Core holding cannot make old brokerage cash eligible again',async()=>{
  const h=harness(),review=await h.review();let response=await h.request(h.confirmPayload(review));assert.equal(response.statusCode,200,JSON.stringify(response.body));
  h.state.allowOpening=true;
  response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert(response.body.manualRecommendations.orders.some(order=>order.side==='buy'),'The exact fictional starting account is eligible for checked Buys');
  h.state.now=new Date('2026-11-24T17:05:00.000Z');h.state.portfolioRecord.portfolio.find(position=>position.symbol==='CORC').lastTradeAt=h.state.now.toISOString();
  response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.decision.brokerageCashCurrent,false);
  const before=clone(h.state.account);
  h.state.now=new Date('2026-11-24T17:07:00.000Z');
  const saved=await h.portfolioRequest('PUT',{portfolio:h.state.portfolioRecord.portfolio.filter(position=>position.symbol!=='CORC'),expectedEtag:h.state.portfolioRecord.etag});
  assert.equal(saved.statusCode,200,JSON.stringify(saved.body));
  const readback=await h.portfolioRequest('GET');assert.equal(readback.statusCode,200);assert.equal(readback.body.etag,saved.body.etag);
  assert(!readback.body.portfolio.some(position=>position.symbol==='CORC'),'The deletion actually committed');
  response=await h.request({operation:'prepare-execution'});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.decision.brokerageCashCurrent,false,'Deleting the row must not validate the old broker observation');
  assert.equal(response.body.decision.executableCash,0);assert(!response.body.manualRecommendations.orders.some(order=>order.side==='buy'));
  same(h.state.account,before,'A holdings edit or stale review adds no account financial facts');
 });
 await check('each economic Core edit blocks old cash through saved portfolio verification; only a newer broker observation restores the same Buy quantities',async()=>{
  const h=await corrected(),initial=await prepare(h),buySignature=orders=>orders.map(({symbol,sleeve,shares,estimatedPrice})=>({symbol,sleeve,shares,estimatedPrice}));
  assert.equal(initial.statusCode,200,JSON.stringify(initial.body));const expected=buySignature(buys(initial));assert(expected.length>0);
  const swing={symbol:'CORX',role:'Swing',shares:2,avgCost:70},core={...swing,role:'Core'};
  const initialCash=clone(h.state.account.brokerageCash),original=clone(h.state.account.records);
  const beforeEtag=h.state.portfolioRecord.etag;
  const originalPositions=clone(h.state.portfolioRecord.portfolio);
  h.state.now=new Date('2026-11-24T17:02:00.000Z');
  await syncPortfolio(h,[...originalPositions.slice().reverse(),swing],{coreCashChangeTimes:['2026-11-24T17:01:00.000Z']});
  assert(!Object.hasOwn(h.state.portfolioRecord,'coreCashChangeTimes'),'Caller cannot inject edit timestamps; reorder and Swing changes are neutral');
  assert(buys(await prepare(h)).length>0);
  const rejected=await h.portfolioRequest('PUT',{portfolio:originalPositions,expectedEtag:beforeEtag});assert.equal(rejected.statusCode,409);
  assert(!Object.hasOwn(h.state.portfolioRecord,'coreCashChangeTimes'),'Conflict cannot commit a Core change or metadata');
  for(const [name,edit]of Object.entries({
   addition:rows=>[...rows,{...core,symbol:'CORY'}],
   quantity:rows=>rows.map(row=>row.symbol==='CORC'?{...row,shares:4}:row),
   basis:rows=>rows.map(row=>row.symbol==='CORC'?{...row,avgCost:801}:row),
   'Core to Swing':rows=>rows.map(row=>row.symbol==='CORC'?{...row,role:'Swing'}:row),
   'Swing to Core':rows=>rows.map(row=>row.symbol==='CORX'?{...row,role:'Core'}:row),
   removal:rows=>rows.filter(row=>row.symbol!=='CORX')
  })){
   h.state.now=new Date(h.state.now.getTime()+60000);
   const previousAccount=clone(h.state.account),expectedChanges=(h.state.portfolioRecord.coreCashChangeTimes||[]).length+1;
   await syncPortfolio(h,edit(h.state.portfolioRecord.portfolio),{coreCashChangeTimes:[]});
   const readback=await h.portfolioRequest('GET');assert.equal(readback.body.coreCashChangeTimes.length,expectedChanges,name);
   assert.equal(readback.body.coreCashChangeTimes.at(-1),h.state.now.toISOString(),name);
   const paused=await prepare(h);assert.equal(paused.statusCode,200,JSON.stringify(paused.body));
   assert.equal(paused.body.decision.brokerageCashStatus,'Core-activity-review',name);assert.equal(paused.body.decision.executableCash,0,name);
   assert.equal(buys(paused).length,0,name);same(h.state.account,previousAccount,name+' changes no financial records');
   h.state.now=new Date(h.state.now.getTime()+1000);
   if(name==='addition'){
    const changedCash=await h.request({operation:'update-brokerage-cash',brokerageCash:initialCash.balance+100,expectedRevision:h.state.account.revision});
    assert.equal(changedCash.statusCode,200,'The entered observation can be saved without asserting accounting facts');
    const unverifiedCash=await prepare(h);assert.equal(unverifiedCash.statusCode,200,JSON.stringify(unverifiedCash.body));
    assert.equal(unverifiedCash.body.openingPlan.cashAccountingStatus,'review-required');assert.equal(buys(unverifiedCash).length,0,'A newer observation alone cannot resolve an unsupported material difference');
    same(h.state.account.records,original);h.state.now=new Date(h.state.now.getTime()+1000);
   }
   const updated=await h.request({operation:'update-brokerage-cash',brokerageCash:initialCash.balance,expectedRevision:h.state.account.revision});
   assert.equal(updated.statusCode,200,JSON.stringify(updated.body));assert.equal(h.state.account.brokerageCash.observedAt,h.state.now.toISOString());
   const restored=await prepare(h);assert.equal(restored.statusCode,200,JSON.stringify(restored.body));assert.equal(restored.body.decision.brokerageCashCurrent,true,name);
   assert.deepEqual(buySignature(buys(restored)),expected,name+' preserves the strategy and checked quantities');same(h.state.account.records,original);
  }
 });
 await check('a Core save during an opening request cannot publish or retain a stale Buy',async()=>{
  const h=await corrected(),baseline=await prepare(h),before=clone(h.state.account);
  const protective=response=>{
   const {orders,openingBooks}=response.body.openingPlan;
   return orders.filter(order=>order.side==='sell'&&openingBooks[order.sleeve].positions[order.symbol]?.shares>0)
    .map(({symbol,sleeve,shares,condition,estimatedPrice})=>({symbol,sleeve,shares,condition,estimatedPrice}));
  };
  assert(buys(baseline).length>0);const originalProtection=protective(baseline);assert(originalProtection.length>0);
  h.state.whileOpening=async()=>{
   h.state.whileOpening=null;h.state.now=new Date('2026-11-24T17:00:10.000Z');
   await syncPortfolio(h,h.state.portfolioRecord.portfolio.filter(row=>row.role!=='Core'));
  };
  const response=await prepare(h);assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(buys(response).length,0);assert.equal(response.body.decision.brokerageCashStatus,'Core-activity-review');
  assert.equal(h.state.openingCalls,2,'Each request verifies its own collection, including the race response');
  assert.deepEqual(protective(response),originalProtection,'The repeat verification preserves protective sell quantities and prices');
  same(h.state.account,before,'No stale issued entry reaches the saved account');
 });
 await check('an unchanged Core quantity and basis cannot erase a previously observed Core timestamp',async()=>{
  const h=await corrected(),core=h.state.portfolioRecord.portfolio.find(row=>row.role==='Core');
  h.state.now=new Date('2026-11-24T17:02:00.000Z');core.lastTradeAt='2026-11-24T17:01:00.000Z';
  const paused=await prepare(h);assert.equal(paused.statusCode,200,JSON.stringify(paused.body));assert.equal(buys(paused).length,0);
  const before=clone(h.state.account);
  await syncPortfolio(h,h.state.portfolioRecord.portfolio.map(row=>row===core?{...row,openedAt:'2026-11-21',lastTradeAt:null}:row));
  same(h.state.portfolioRecord.coreCashChangeTimes,[core.lastTradeAt],'Keep prior evidence without dating the metadata-only save as Core activity');
  const reloaded=await prepare(h);assert.equal(reloaded.statusCode,200,JSON.stringify(reloaded.body));assert.equal(buys(reloaded).length,0);
  same(h.state.account,before);
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
  await syncPortfolio(h,h.state.portfolioRecord.portfolio.filter(row=>row.symbol!=='CORC'));
  response=await h.request({operation:'record-intraday',ticket:{...ticket,id:'fictional-after-Core-issued-fill',executedAt:'2026-11-24T17:06:00.000Z'},expectedRevision:h.state.account.revision});
  assert.equal(response.statusCode,422,JSON.stringify(response.body));assert.equal(h.state.writeAttempts,beforeAttempts,'A later deletion retains the earlier Core cutoff');
  response=await h.request({operation:'record-intraday',ticket,expectedRevision:h.state.account.revision});assert.equal(response.statusCode,200,JSON.stringify(response.body));
  assert.equal(response.body.savedTradeTicket.id,ticket.id);assert.equal(response.body.decision.brokerageCashCurrent,false);assert.equal(response.body.decision.executableCash,0);
  assert(!Object.hasOwn(h.state.account,'coreCashObservationRequired'),'The retained-issued recording branch strips the request-local flag');
  same(h.state.account.brokerageCash,originalBroker);same(h.state.account.records,originalRecords);
  assert.equal(h.state.account.intradayActivity.tickets.at(-1).id,ticket.id);assert.equal(h.state.providerCalls,0);
 });
 console.log(`Combined brokerage-cash API regression: ${cases}/${cases+failures.length} fictional cases passed.`);
 if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={harness};
