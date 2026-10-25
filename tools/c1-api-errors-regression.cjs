// Real HTTP-handler error boundaries, with synthetic memory storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),errors=loader.load('lib/c1ApiErrors.js');
const service=loader.load('lib/c1AccountService.js'),saver=loader.load('lib/c1AccountSave.js');
const operational=loader.load('lib/c1AccountOperationalStatus.js');
const secret='PRIVATE_PROVIDER_URL_apikey_7289',key='synthetic_api_error_boundary_key_0001';
const now=new Date('2026-10-23T22:00:00Z'),date='2026-10-23';

// Run the complete real account service; only its pure screen-builder boundary
// is replaceable for fault injection. No actual provider/account access.
const serviceFile=path.resolve('lib/c1AccountService.js');
const currentService=fs.readFileSync(serviceFile,'utf8');
const originalCatch="try{stockScreen=buildC1StockScreenSnapshot(sessions.at(-1),now,book.model.sessions.filter(s=>s.date<=through));}catch{stockScreen={contract:'c1-stock-screen-v1',sourceSessionDate:sessions.at(-1).date,candidates:[]};}";
const oldService=currentService.replace(/try\{stockScreen=buildC1StockScreenSnapshot[\s\S]*?\n \}/,originalCatch);
const hash=require('node:crypto').createHash;
assert.equal(hash('sha1').update('blob '+Buffer.byteLength(oldService)+'\0').update(oldService).digest('hex'),'4ae7a2e61f47bddc78404b85e6423eda4c5b82c9','Exact reversal recovers original service; no other account behavior changes');
function screenService(builder,source=currentService){
 const imports={},names=[...source.matchAll(/export function (\w+)/g)].map(m=>m[1]);
 const code=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,request)=>{
  const values=loader.load(request,serviceFile);
  for(const name of spec.split(',').map(x=>x.trim()))imports[name]=name==='buildC1StockScreenSnapshot'?builder:values[name];
  return '';
 }).replace(/export function /g,'function ');
 const box={...imports,Date,console};vm.createContext(box);
 vm.runInContext(code+'\nglobalThis.testExports={'+names.join(',')+'};',box,{filename:serviceFile});
 return box.testExports;
}

function fixture(){
 const state={account:{contract:'c1-private-account-v1',revision:0,sourceHashes:[],privateSentinel:'PRIVATE_ACCOUNT_FACTS_913'},
  reads:0,bookReads:0,writes:0,readFailure:false,bookFailure:false,writeFailure:false,commitBeforeFailure:false,
  conflict:false,analysisFailure:false,logs:[]};
 const imports={},file=path.resolve('pages/api/c1-account.js');
 const never=()=>{throw Error('Unexpected external access');};
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request.startsWith('node:')?require(request):request.endsWith('c1ApiErrors')?errors:
   request.endsWith('c1AccountSave')?saver:request.endsWith('c1AccountOperationalStatus')?{...operational,
    logC1AccountOperationalStatus:(view,context)=>{
     if(state.observerFailure)throw Error(secret);
     operational.logC1AccountOperationalStatus(view,context,(...args)=>{if(state.logFailure)throw Error(secret);state.logs.push(args.join(' '));});
    }}:{};
  for(const name of names.split(',').map(part=>part.trim()))imports[name]=values[name]||never;
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ')
  .replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 Object.assign(imports,{updateC1BrokerageCash:service.updateC1BrokerageCash,
  evaluateC1Account:args=>state.realService?state.realService.evaluateC1Account(args):({sourceSessionDate:date,positions:[]}),
  deriveC1AccountAnalysis:args=>{
   if(state.analysisFailure)throw new TypeError(secret);
   if(state.realService)return state.realService.deriveC1AccountAnalysis(args);
   const {account}=args;
   return {decision:{current:false,revision:account.revision,sourceSessionDate:date,positions:[]}};
  },buildC1ManualRecommendations:()=>({status:'waiting',orders:[]}),
  easternMarketClock:()=>({key:date,minutes:1020}),marketSessionCloseMinutes:()=>960,
  prepareC1AccountExecution:async()=>{if(!state.prepared)throw Error('Unexpected execution request');return state.prepared;},
 });
 const box={...imports,Date,Response,process:{env:{}},console:{
  warn:(...args)=>state.logs.push(args.join(' ')),info:(...args)=>state.logs.push(args.join(' ')),error:(...args)=>state.logs.push(args.join(' ')),
 }};
 vm.createContext(box);vm.runInContext(source,box,{filename:file});
 const handler=box.factory({environment:'test',commit:'a'.repeat(40),clock:()=>state.now||now,
  readBook:async()=>{state.bookReads++;if(state.bookFailure)throw Error(secret);return {record:state.book||{model:{sessions:[{date}]}}};},
  store:{read:async()=>{state.reads++;if(state.readFailure)throw Error(secret);return {record:state.account,etag:'"fixture-etag"'};},
   write:async(_path,account,etag)=>{
    state.writes++;assert.equal(etag,'"fixture-etag"');
    if(state.conflict)throw Object.assign(Error(secret),{name:'BlobPreconditionFailedError',status:412});
    if(state.commitBeforeFailure)state.account=account;
    if(state.writeFailure)throw Error(secret);
    state.account=account;
   }},collectOpening:never,collectHoldings:never,collectRanks:never,readPortfolio:never,
 });
 return {state,async request(method='GET',body,authorized=true){
  const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await handler({method,body,headers:authorized?{authorization:'Bearer '+key}:{}},res);
  return res;
 }};
}

(async()=>{
 assert.equal(errors.c1AccountApiFailure(Error('Unexpected private details')).status,500);
 assert.equal(errors.c1AccountApiFailure(Object.assign(Error('Unknown'),{status:503})).status,500,
  'Untrusted arbitrary status properties do not forge a recognized dependency failure');
 const conflict=Object.assign(Error('ETag mismatch'),{name:'BlobPreconditionFailedError',status:412});
 await assert.rejects(()=>errors.c1AccountDependency(async()=>{throw conflict;},'storage'),error=>error===conflict);
 const f=fixture(),before=JSON.stringify(f.state.account),payload={operation:'update-brokerage-cash',brokerageCash:1500,expectedRevision:0};
 let response=await f.request('GET',undefined,false);assert.equal(response.statusCode,401);assert.equal(f.state.reads,0);
 response=await f.request();assert.equal(response.statusCode,200);assert.equal(f.state.writes,0);assert.equal(JSON.stringify(f.state.account),before);
 assert.match(response.headers['X-C1-Request-Id'],/^[a-f0-9-]{36}$/);
 f.state.readFailure=true;response=await f.request('POST',payload);
 assert.equal(response.statusCode,503);assert.equal(response.body.code,'ACCOUNT_STORAGE_UNAVAILABLE');assert.equal(f.state.writes,0);f.state.readFailure=false;
 f.state.bookFailure=true;response=await f.request('POST',payload);
 assert.equal(response.statusCode,503);assert.equal(response.body.code,'ACCOUNT_INPUT_UNAVAILABLE');assert.equal(f.state.writes,0);f.state.bookFailure=false;
 response=await f.request('POST',{...payload,brokerageCash:-1});assert.equal(response.statusCode,422);assert.equal(response.body.code,'ACCOUNT_VALIDATION_FAILED');assert.equal(f.state.writes,0);
 f.state.analysisFailure=true;response=await f.request();assert.equal(response.statusCode,500);assert.equal(response.body.code,'ACCOUNT_ANALYSIS_FAILED');assert.equal(f.state.writes,0);f.state.analysisFailure=false;
 f.state.writeFailure=true;response=await f.request('POST',payload);
 assert.equal(response.statusCode,503);assert.equal(response.body.code,'ACCOUNT_STORAGE_UNAVAILABLE');assert.equal(f.state.writes,1);assert.equal(JSON.stringify(f.state.account),before);
 assert.equal(response.body.executable,false);assert.equal(response.body.requestId,response.headers['X-C1-Request-Id']);
 assert(!JSON.stringify(response.body).includes(secret));f.state.writeFailure=false;
 f.state.conflict=true;response=await f.request('POST',payload);
 assert.equal(response.statusCode,409);assert.equal(response.body.code,'ACCOUNT_SAVE_CONFLICT');assert.equal(f.state.writes,2);
 assert.equal(JSON.stringify(f.state.account),before);f.state.conflict=false;
 // A failed remote write can have committed before its transport failed. Do
 // not claim it was unsaved or automatically repeat a mutation.
 f.state.writeFailure=true;f.state.commitBeforeFailure=true;response=await f.request('POST',payload);
 assert.equal(response.statusCode,503);assert.equal(f.state.writes,3);assert.equal(f.state.account.revision,1);
 assert.doesNotMatch(response.body.error,/not saved|no changes were saved/i);
 f.state.writeFailure=false;response=await f.request();assert.equal(response.statusCode,200);assert.equal(response.body.decision.revision,1);assert.equal(f.state.writes,3);
 response=await f.request('POST',payload);assert.equal(response.statusCode,409);assert.equal(response.body.code,'ACCOUNT_REVISION_CONFLICT');assert.equal(f.state.writes,3);
 const logs=f.state.logs.join('\n');assert(!logs.includes(secret));assert(!logs.includes(key));assert(!logs.includes('PRIVATE_ACCOUNT_FACTS_913'));assert(!logs.includes('c1-accounts-v1/'));
 assert(logs.includes('C1_ACCOUNT_API_FAILURE')&&logs.includes('account-read')&&logs.includes('accepted-input-read')&&logs.includes('account-save'));
 const workflow=require('./fixtures/c1-trading-workflow.cjs').createWorkflowFixture('buy');workflow.setCash(20000);
 const prepared=await workflow.prepare(),{account:ignored,...preparedView}=prepared;
 f.state.prepared=prepared;f.state.now=workflow.now;
 const writes=f.state.writes,priorAccount=JSON.stringify(f.state.account),priorPrepared=JSON.stringify(prepared),priorLogs=f.state.logs.length;
 response=await f.request('POST',{operation:'prepare-execution'});
 assert.equal(response.statusCode,200);assert.deepEqual(JSON.parse(JSON.stringify(response.body)),{...JSON.parse(JSON.stringify(preparedView)),holdingReviewError:null});
 const observed=f.state.logs.slice(priorLogs);assert.equal(observed.length,1);assert(observed[0].startsWith('C1_ACCOUNT_OPERATIONAL '));
 const summary=JSON.parse(observed[0].slice('C1_ACCOUNT_OPERATIONAL '.length));
 assert.equal(summary.code,'CHECKED_BUY_ORDERS_PRESENT');assert.equal(summary.requestId,response.headers['X-C1-Request-Id']);
 assert.equal(summary.screenComposition,'NOT_VERIFIED');assert.equal(summary.executable,false);
 for(const field of ['logFailure','observerFailure']){
  f.state[field]=true;const retry=await f.request('POST',{operation:'prepare-execution'});f.state[field]=false;
  assert.equal(retry.statusCode,200);assert.deepEqual(retry.body,response.body,'Diagnostic failures cannot alter successful payloads');
 }
 assert.equal(f.state.writes,writes);assert.equal(JSON.stringify(f.state.account),priorAccount);assert.equal(JSON.stringify(prepared),priorPrepared);
 assert(!f.state.logs.join('\n').includes(secret));assert(!f.state.logs.join('\n').includes(key));
 const wf=require('./fixtures/c1-trading-workflow.cjs').createWorkflowFixture('buy');
 const args={account:wf.account,book:wf.book,now:wf.now};
 const untouched=JSON.stringify(args),snapshot=loader.load('lib/c1StockClassification.js').buildC1StockScreenSnapshot;
 for(const n of [0,1,2,3,9]){
  const builder=(session,at,history)=>snapshot({...session,signals:session.signals.slice(0,n),positionSignals:session.positionSignals.slice(0,n)},at,history);
  const previous=screenService(builder,oldService).evaluateC1Account(args),actual=screenService(builder).evaluateC1Account(args);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(previous)),'Exact legacy insufficient/full screen and holding/economic parity');
  assert.equal(actual.stockScreen.candidates.length,n<3?0:n);
 }
 for(const error of [new TypeError(secret),Error('Unexpected failure'),{message:'unknown',status:503},'primitive failure',null,
  {message:{toString:()=> 'C1 production snapshot has insufficient qualified candidates (0/3)'}},
  Error('V11 production snapshot requires a dated source session'),Error('C1 production snapshot has insufficient qualified candidates (3/3)')]){
  const builder=()=>{throw error;};
  assert.equal(screenService(builder,oldService).evaluateC1Account(args).stockScreen.candidates.length,0,'Reproduce old unexpected failure flattened to empty screen');
  assert.throws(()=>screenService(builder).evaluateC1Account(args),thrown=>thrown===error,'Unexpected failure identity must reach existing API boundary');
 }
 const actualApi=fixture();actualApi.state.account=wf.account;actualApi.state.book=wf.book;actualApi.state.now=wf.now;
 actualApi.state.realService=screenService(()=>{throw new TypeError(secret);});
 let failed=await actualApi.request();
 assert.equal(failed.statusCode,500);assert.equal(failed.body.code,'ACCOUNT_ANALYSIS_FAILED');
 assert.equal(failed.body.retryable,false);assert.equal(failed.body.executable,false);
 assert.equal(actualApi.state.writes,0);assert.equal(actualApi.state.reads,1);assert.equal(actualApi.state.bookReads,1);
 assert(!JSON.stringify(failed.body).includes(secret));assert(!actualApi.state.logs.join('\n').includes(secret));
 actualApi.state.realService=screenService(snapshot);
 assert.equal((await actualApi.request()).statusCode,200,'A later repaired read recovers without cache/process reset');
 assert.equal(actualApi.state.writes,0);assert.equal(JSON.stringify(args),untouched,'Account/book/clock inputs remain unchanged');
 actualApi.state.realService=screenService(()=>{throw new TypeError(secret);});
 const revision=actualApi.state.account.revision;
 failed=await actualApi.request('POST',{operation:'update-brokerage-cash',brokerageCash:1500,expectedRevision:revision});
 assert.equal(failed.statusCode,500);assert.equal(actualApi.state.writes,1,'An analysis error after a successful save must never retry or roll back that save');
 assert.equal(actualApi.state.account.revision,revision+1);assert.equal(actualApi.state.account.brokerageCash.balance,1500);
 assert.doesNotMatch(failed.body.error,/not saved|no changes were saved/i,'A failed analysis cannot assert that the preceding save did not commit');
 actualApi.state.realService=screenService(snapshot);
 const recovered=await actualApi.request();assert.equal(recovered.statusCode,200);
 assert.equal(recovered.body.decision.revision,revision+1);assert.equal(actualApi.state.writes,1,'Reload reads the committed account without repeating the mutation');
 assert.equal(JSON.stringify(args),untouched);
 console.log('PASS: real account API preserves legacy insufficient-candidate fallback, rejects unexpected screen failures truthfully, distinguishes error classes, preserves canonical writes, avoids automatic mutation retries and redacts private diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
