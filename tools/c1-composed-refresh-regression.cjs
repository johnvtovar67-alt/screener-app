// Full current screen + account handlers and real provider/store modules;
// synthetic HTTP transport and in-memory Blob/account storage only.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const {createNormalRefreshScreen}=require('./fixtures/c1-normal-refresh-screen.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const api=createWorkflowApi(),screen=createNormalRefreshScreen(api.fixture);api.fixture.setCash(100000);
 const reader=createResearchModuleLoader().load('lib/c1RefreshResponse.js').readC1AccountResponse;
 const initialAccount=clone(api.fixture.account),initialHash=hash(initialAccount);
 const analysis=await api.request('GET'),opening=await api.request('POST',{operation:'prepare-execution'});
 for(const result of[analysis,opening])assert.equal(await reader({ok:true,status:200,json:async()=>result.body,headers:{get:()=>null}}),result.body,'Actual handler view passes the real browser response reader without normalization');
 let response=await screen.request({compact:'1',screenSymbols:analysis.body.decision.stockScreen.candidates.map(row=>row.symbol).join(',')});
 assert.equal(response.status,200);assert.equal(response.body.meta.quoteFeedStatus,'live');assert.equal(response.body.meta.fundamentalFeedStatus,'healthy');assert.equal(response.body.meta.performanceObservationRecorded,true);
 assert.equal(response.body.meta.productionPolicy.sourceSessionDate,analysis.body.decision.sourceSessionDate,'Actual screen and account handlers use the same accepted source session');
 for(const symbol of['MRNA','BBB','CCC'])assert(response.body.stocks.some(row=>row.symbol===symbol&&row.eventRisk?.eventVerification?.state==='VERIFIED_CLEAR'),'Real current event receipts accompany the actual screen candidates');
 assert(screen.calls.some(row=>row.endpoint==='ratios-ttm')&&screen.calls.some(row=>row.endpoint==='income-statement-growth'),'At least one uncached issuer passes through the real fundamental adapter');
 for(const endpoint of['batch-quote','earnings-calendar','mergers-acquisitions-latest','news/stock','historical-price-eod/full'])assert(screen.calls.some(row=>row.endpoint===endpoint),'Real adapter reached synthetic '+endpoint);
 const initialLedger=clone(screen.ledger());assert(initialLedger.records.length>0);let cases=1;
 for(const mode of['quote-malformed','provider-invalid-json','provider-outage']){
  screen.expire();screen.resetRuntime();screen.state.mode=mode;const before=screen.writes.filter(row=>row.name==='screener-performance-ledger.json').length;
  response=await screen.request({verificationPass:'1'});
  if(mode==='quote-malformed'){assert.equal(response.status,200);assert.equal(response.body.meta.quoteCoverageAdequate,false);assert(response.body.stocks.every(row=>!['Buy','Strong Buy'].includes(row.finalDecision?.action)),'Malformed real provider response fails closed');}
  else{assert.equal(response.status,503);assert.equal(screen.writes.filter(row=>row.name==='screener-performance-ledger.json').length,before,'Unusable acquisition cannot create a performance observation');}
  assert.equal(hash(api.fixture.account),initialHash,'Screen provider failure never mutates the account');
  screen.expire();screen.state.mode=null;response=await screen.request({verificationPass:'1'});assert.equal(response.status,200);assert.equal(response.body.meta.quoteFeedStatus,'live');assert.equal(response.body.meta.quoteCoverageAdequate,true);assert.equal(response.body.meta.performanceObservationRecorded,true);cases++;
 }
 // A Blob acknowledgement can disappear after a genuine commit. The actual
 // performance store must report uncertainty without repeating that write.
 screen.expire();screen.resetRuntime();screen.state.mode='ledger-commit-lost';const beforeWrites=screen.writes.length;
 response=await screen.request({verificationPass:'1'});assert.equal(response.status,200);assert.equal(response.body.meta.performanceObservationRecorded,false);
 const lost=screen.writes.slice(beforeWrites).filter(row=>row.name==='screener-performance-ledger.json');assert.equal(lost.length,1);assert.equal(lost[0].acknowledgementLost,true);
 const committed=clone(screen.ledger());assert(committed.records.length>=initialLedger.records.length);const committedIds=new Set(committed.records.map(row=>row.id));
 screen.expire();screen.state.mode=null;response=await screen.request({verificationPass:'1'});assert.equal(response.body.meta.performanceObservationRecorded,true);
 const recoveredIds=new Set(screen.ledger().records.map(row=>row.id));for(const id of committedIds)assert(recoveredIds.has(id),'Explicit recovery retains each already committed ledger record');
 for(const write of screen.writes.filter(row=>row.name==='screener-performance-ledger.json'))assert.equal(write.ifMatch,write.previousEtag,'Every overwrite uses the origin body-read ETag; initial creation is non-overwriting');cases++;
 // Exercise a real account commit, then the actual browser parser's interrupted
 // body boundary. The browser must use an explicit read, never replay the POST.
 const before=clone(api.fixture.account),writeCount=api.fixture.writes;
 const mutation=await api.request('POST',{operation:'update-brokerage-cash',brokerageCash:99999.99,expectedRevision:before.revision});assert.equal(mutation.status,200);assert.equal(api.fixture.writes,writeCount+1);
 let retained=analysis.body;await assert.rejects(async()=>{const value=await reader({ok:true,status:200,json:async()=>{throw new TypeError('Synthetic interrupted response');},headers:{get:()=>null}},{stage:'account-refresh'});retained=value;},error=>error.code==='ACCOUNT_RESPONSE_INTERRUPTED');
 assert.equal(retained,analysis.body);assert.equal(api.requests.filter(row=>row.operation==='update-brokerage-cash').length,1);const committedAccount=clone(api.fixture.account),savedHash=hash(committedAccount);
 const recovered=await api.request('GET');assert.equal(recovered.status,200);assert.equal(recovered.body.decision.brokerageCash,99999.99);assert.equal(hash(api.fixture.account),savedHash);assert.equal(api.fixture.writes,writeCount+1);
 const protectedState=account=>Object.fromEntries(Object.entries(account).filter(([key])=>!['revision','brokerageCash','brokerageCashObservedAt','updatedAt'].includes(key)));assert.deepEqual(protectedState(committedAccount),protectedState(before));cases++;
 console.log('PASS: '+cases+' actual-handler/provider/store composition cases; failed and malformed acquisition, committed-but-unacknowledged conditional ledger/account writes, explicit recovery, preserved account history. Synthetic only; no live owner/brokerage acceptance.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
