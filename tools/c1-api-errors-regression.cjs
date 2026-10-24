// Real HTTP-handler error boundaries, with synthetic memory storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),errors=loader.load('lib/c1ApiErrors.js');
const service=loader.load('lib/c1AccountService.js'),saver=loader.load('lib/c1AccountSave.js');
const secret='PRIVATE_PROVIDER_URL_apikey_7289',key='synthetic_api_error_boundary_key_0001';
const now=new Date('2026-10-23T22:00:00Z'),date='2026-10-23';

function fixture(){
 const state={account:{contract:'c1-private-account-v1',revision:0,sourceHashes:[],privateSentinel:'PRIVATE_ACCOUNT_FACTS_913'},
  reads:0,bookReads:0,writes:0,readFailure:false,bookFailure:false,writeFailure:false,commitBeforeFailure:false,
  conflict:false,analysisFailure:false,logs:[]};
 const imports={},file=path.resolve('pages/api/c1-account.js');
 const never=()=>{throw Error('Unexpected external access');};
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request.startsWith('node:')?require(request):request.endsWith('c1ApiErrors')?errors:
   request.endsWith('c1AccountSave')?saver:{};
  for(const name of names.split(',').map(part=>part.trim()))imports[name]=values[name]||never;
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ')
  .replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 Object.assign(imports,{updateC1BrokerageCash:service.updateC1BrokerageCash,
  evaluateC1Account:()=>({sourceSessionDate:date,positions:[]}),
  deriveC1AccountAnalysis:({account})=>{
   if(state.analysisFailure)throw new TypeError(secret);
   return {decision:{current:false,revision:account.revision,sourceSessionDate:date,positions:[]}};
  },buildC1ManualRecommendations:()=>({status:'waiting',orders:[]}),
  easternMarketClock:()=>({key:date,minutes:1020}),marketSessionCloseMinutes:()=>960,
 });
 const box={...imports,Date,Response,process:{env:{}},console:{
  warn:(...args)=>state.logs.push(args.join(' ')),info:(...args)=>state.logs.push(args.join(' ')),error:(...args)=>state.logs.push(args.join(' ')),
 }};
 vm.createContext(box);vm.runInContext(source,box,{filename:file});
 const handler=box.factory({environment:'test',commit:'a'.repeat(40),clock:()=>now,
  readBook:async()=>{state.bookReads++;if(state.bookFailure)throw Error(secret);return {record:{model:{sessions:[{date}]}}};},
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
 console.log('PASS: real account API distinguishes 409 conflicts, 422 input, 503 dependencies and 500 internal failures, preserves canonical writes, avoids automatic mutation retries and redacts private diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
