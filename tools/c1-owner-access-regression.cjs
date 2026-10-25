// Actual private handlers, real account service and memory-only storage. Never
// load a real browser, credential, account, provider or remote Blob object.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {originalAccountSource,originalPortfolioSource,ownerAccessFixture}=require('./c1-owner-access-extraction.cjs');
const loader=createResearchModuleLoader(process.cwd()),clone=v=>JSON.parse(JSON.stringify(v));
const accountSource=fs.readFileSync('pages/api/c1-account.js','utf8'),portfolioSource=fs.readFileSync('pages/api/portfolio-sync.js','utf8');
const oldAccount=originalAccountSource(accountSource),oldPortfolio=originalPortfolioSource(portfolioSource);
const blobHash=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
assert.equal(blobHash(oldAccount),'55f816b776a0d8f73b700f3a19c516c147749338','Exact complete PR332 account handler reversal');
assert.equal(blobHash(oldPortfolio),'1e795fed9c6e244092895889b5b797be705b6907','Exact complete PR332 portfolio handler reversal');
const key='synthetic_owner_identity_existing_0001';
const digest=crypto.createHash('sha256').update(key).digest('hex'),other='a'.repeat(64);
const requestId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',at='2026-10-15T17:00:00.000Z';
const NativeDate=Date;
class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}}
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}});
const wf=require('./fixtures/c1-trading-workflow.cjs').createWorkflowFixture('buy');
const portfolioRecord={version:2,updatedAt:'2026-10-14T22:00:00Z',portfolio:clone(wf.portfolio),c1ControlState:{highWater:81000,triggerDay:null}};
function ownerGuard(env,state){
 const source=fs.readFileSync('lib/c1OwnerAccess.js','utf8').replace(/^import .*;\n/gm,'').replace('export function ','function ');
 return new Function('process','createHash','timingSafeEqual','Buffer','console',source+';return rejectUnauthorizedC1Owner;')(
  {env},(...args)=>{state.hashes++;return crypto.createHash(...args);},(...args)=>{state.compares++;return crypto.timingSafeEqual(...args);},Buffer,
  {info:(...args)=>{if(state.logFailure)throw Error('private logger failure');state.ownerLogs.push(args.join(' '));}});
}
const coverage=fs.readFileSync('lib/c1HoldingCoverage.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const missingC1HoldingPrices=new Function(coverage+';return missingC1HoldingPrices;')();
function account(source,env,options={}){
 const state={bytes:options.absent?null:JSON.stringify(wf.account),etag:'"v1"',reads:[],writes:[],bookReads:0,providerCalls:0,logs:[],ownerLogs:[],hashes:0,compares:0,logFailure:options.logFailure};
 const never=()=>{state.providerCalls++;throw Error('Unexpected external access');};
 const imports={},file=path.resolve('pages/api/c1-account.js');
 const sourceCode=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request.endsWith('c1OwnerAccess')?{rejectUnauthorizedC1Owner:ownerGuard(env,state)}:
   request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:
   request.endsWith('c1AccountOpeningProvider')?{collectC1AccountOpening:never}:request.endsWith('c1HeldRankProvider')?{collectC1HeldRankReviews:never}:
   request.endsWith('c1HoldingCoverage')?{collectC1HoldingCoverage:never,missingC1HoldingPrices}:
   request.startsWith('node:')?{...require(request),randomUUID:()=>requestId}:loader.load(request,file);
  for(const name of names.split(',').map(n=>n.trim())){assert.notEqual(values[name],undefined,name);imports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const box={...imports,process:{env},Date:FixedDate,Response,console:{warn:(...a)=>state.logs.push(a.join(' ')),info:(...a)=>state.logs.push(a.join(' '))}};
 vm.createContext(box);vm.runInContext(sourceCode,box);
 const handler=box.factory({environment:env.VERCEL_ENV||'local',commit:'synthetic-owner-policy',clock:()=>new Date(at),
  store:{read:async p=>{state.reads.push(p);if(options.readFailure)throw Error('private read error');return state.bytes?{record:JSON.parse(state.bytes),etag:state.etag}:null;},
   write:async(p,record,etag)=>{state.writes.push({path:p,record:clone(record),etag});if(options.conflict)throw Object.assign(Error('private CAS error'),{status:412});assert.equal(etag,state.etag);state.bytes=JSON.stringify(record);state.etag='"v2"';}},
  readBook:async()=>{state.bookReads++;return {record:clone(wf.book)};},readPortfolio:never,collectOpening:async()=>{state.providerCalls++;return wf.opening();},collectHoldings:never,collectRanks:never});
 return {state,async request(method,body,authorization='Bearer '+key){const res=response();await handler({method,body,headers:{authorization}},res);return res;},handler};
}
function portfolio(source,env,options={}){
 const state={bytes:options.absent?null:JSON.stringify(portfolioRecord),etag:'"v1"',reads:[],writes:[],lists:[],logs:[],ownerLogs:[],hashes:0,compares:0,logFailure:options.logFailure};
 const box={process:{env},Date:FixedDate,Response,createHash:crypto.createHash,randomUUID:()=>requestId,
  ...loader.load('lib/c1CapitalState.js'),...loader.load('lib/blobErrors.js'),rejectUnauthorizedC1Owner:ownerGuard(env,state),
  console:{warn:(...a)=>state.logs.push(a.join(' '))},
  get:async(p,storageOptions)=>{state.reads.push({path:p,options:clone(storageOptions)});if(storageOptions?.useCache!==false)throw Error('Unsafe cache');if(p==='portfolio-sync-health/nonexistent.json')return null;if(options.readFailure)throw Error('private read error');return state.bytes?{statusCode:200,blob:{etag:state.etag},stream:new Response(state.bytes).body}:null;},
  list:async options=>{state.lists.push(clone(options));return {blobs:[]};},
  put:async(p,bytes,storageOptions)=>{state.writes.push({path:p,bytes,options:clone(storageOptions)});if(storageOptions.ifMatch!==state.etag||options.conflict)throw Object.assign(Error('private CAS error'),{status:412});state.bytes=bytes;state.etag='"v2"';return {etag:state.etag};}};
 const code=source.replace(/^import .*;\n/gm,'').replace('export const config=','const config=').replace('export default async function handler','async function handler');
 vm.createContext(box);vm.runInContext(code+';globalThis.handler=handler;',box);
 return {state,async request(method,body,authorization='Bearer '+key,query={}){const res=response();await box.handler({method,body,headers:{authorization},query},res);return res;},handler:box.handler};
}
function comparable(state){const {ownerLogs,hashes,compares,logFailure,...rest}=state;return clone(rest);}
function telemetry(state,expected){
 assert.equal(state.ownerLogs.length,1);const text=state.ownerLogs[0];assert(text.startsWith('C1_OWNER_ACCESS '));
 const value=JSON.parse(text.slice('C1_OWNER_ACCESS '.length));assert.equal(value.code,expected);
 assert.deepEqual(Object.keys(value).sort(),['code','mode','surface']);
 assert(!text.includes(key)&&!text.includes(digest)&&!text.includes(other)&&!text.includes('portfolio-sync/')&&!text.includes('c1-accounts-v1/'));
}
async function main(){
 const modes=[
  [{},null],
  [{C1_OWNER_ACCESS_MODE:'off',C1_OWNER_ACCOUNT_SHA256:digest},null],
  [{C1_OWNER_ACCESS_MODE:'observe'},'OWNER_IDENTITY_UNCONFIGURED'],
  [{C1_OWNER_ACCESS_MODE:'observe',C1_OWNER_ACCOUNT_SHA256:'malformed'},'OWNER_IDENTITY_CONFIG_INVALID'],
  [{C1_OWNER_ACCESS_MODE:'observe',C1_OWNER_ACCOUNT_SHA256:other},'OWNER_IDENTITY_MISMATCH'],
  [{C1_OWNER_ACCESS_MODE:'observe',C1_OWNER_ACCOUNT_SHA256:digest},'OWNER_IDENTITY_MATCH'],
  [{C1_OWNER_ACCESS_MODE:'enforce',C1_OWNER_ACCOUNT_SHA256:digest},'OWNER_IDENTITY_MATCH'],
  [{C1_OWNER_ACCESS_MODE:'enforc',C1_OWNER_ACCOUNT_SHA256:other},'OWNER_ACCESS_MODE_INVALID'],
 ];
 const accountCases=[['GET'],['POST',{operation:'prepare-execution'}],['POST',{operation:'update-brokerage-cash',brokerageCash:777,expectedRevision:0}],
  ['POST',{operation:'update-brokerage-cash',brokerageCash:777,expectedRevision:20}],['POST',{operation:'unknown'}],['POST',{operation:'adopt'},undefined,{absent:true}],
  ['GET',undefined,undefined,{absent:true}],['GET',undefined,undefined,{readFailure:true}],['POST',{operation:'update-brokerage-cash',brokerageCash:777,expectedRevision:0},undefined,{conflict:true}]];
 const edit={portfolio:clone(wf.portfolio),c1ControlState:portfolioRecord.c1ControlState,expectedEtag:'"v1"'};
 const portfolioCases=[['GET'],['PUT',edit],['PUT',{...edit,expectedEtag:'stale'}],['PUT',{portfolio:null}],['GET',undefined,undefined,{absent:true}],['PUT',{...edit,expectedEtag:null},undefined,{absent:true}]];
 let comparisons=0;
 for(const [settings,code] of modes){
  const env={VERCEL_ENV:'production',...settings};
  for(const [factory,prior,current,cases] of [[account,oldAccount,accountSource,accountCases],[portfolio,oldPortfolio,portfolioSource,portfolioCases]]){
   for(const [index,[method,body,authorization,options]] of cases.entries()){
    const before=factory(prior,env,options),after=factory(current,env,options);
    const actual=await after.request(method,body,authorization),baseline=await before.request(method,body,authorization);
    assert.equal(actual.statusCode,(factory===account?[200,200,200,409,400,403,404,503,409]:[200,200,409,400,404,403])[index]);
    assert.deepEqual(clone(actual),clone(baseline),'Complete response/headers unchanged');
    assert.deepEqual(comparable(after.state),comparable(before.state),'Complete reads/writes/records/ETags/provider calls unchanged');
    if(code)telemetry(after.state,code);else assert.equal(after.state.ownerLogs.length,0);comparisons++;
   }
  }
 }
 // Observe logger failures, including missing or mismatched enrollment, cannot
 // prevent normal authorized access or change a write's success and saved bytes.
 for(const expected of [undefined,other,digest])for(const [factory,prior,current,method,body] of [[account,oldAccount,accountSource,'POST',accountCases[2][1]],[portfolio,oldPortfolio,portfolioSource,'PUT',edit]]){
  const env={VERCEL_ENV:'production',C1_OWNER_ACCESS_MODE:'observe',C1_OWNER_ACCOUNT_SHA256:expected};
  const a=factory(prior,env,{logFailure:true}),b=factory(current,env,{logFailure:true});
  assert.deepEqual(clone(await b.request(method,body)),clone(await a.request(method,body)));assert.deepEqual(comparable(b.state),comparable(a.state));comparisons++;
 }
 // Dormant enforcement is before body/path/private storage/provider work.
 let denials=0;
 for(const fingerprint of [undefined,'MALFORMED',other])for(const [factory,source,methods] of [[account,accountSource,['GET','POST']],[portfolio,portfolioSource,['GET','PUT']]])for(const method of methods){
  const env={VERCEL_ENV:'production',C1_OWNER_ACCESS_MODE:'enforce',C1_OWNER_ACCOUNT_SHA256:fingerprint},f=factory(source,env);
  const res=response(),req={method,query:{},headers:{authorization:'Bearer '+key},get body(){throw Error('Denied body read');}};
  await f.handler(req,res);assert.equal(res.statusCode,fingerprint===other?403:503);assert.equal(f.state.reads.length,0);assert.equal(f.state.writes.length,0);
  assert.equal(f.state.bytes,JSON.stringify(factory===account?wf.account:portfolioRecord));assert.equal(res.headers['X-C1-Request-Id'],undefined);denials++;
 }
 // Unsupported methods retain original dispatch, malformed credentials retain
 // original401, health stays public, and nonproduction has no owner policy.
 for(const environment of ['production','preview','development',undefined])for(const [factory,prior,current] of [[account,oldAccount,accountSource],[portfolio,oldPortfolio,portfolioSource]]){
  const env={VERCEL_ENV:environment,C1_OWNER_ACCESS_MODE:'enforce',C1_OWNER_ACCOUNT_SHA256:other};
  for(const [method,authorization] of [['DELETE','Bearer '+key],['GET',undefined],['GET','Bearer short']]){
   const a=factory(prior,env),b=factory(current,env);const auth=authorization===undefined?'':authorization;
   assert.deepEqual(clone(await b.request(method,undefined,auth)),clone(await a.request(method,undefined,auth)));assert.deepEqual(comparable(b.state),comparable(a.state));assert.equal(b.state.ownerLogs.length,0);comparisons++;
  }
  if(environment!=='production'){
   const a=factory(prior,env),b=factory(current,env);assert.deepEqual(clone(await b.request('GET')),clone(await a.request('GET')));assert.deepEqual(comparable(b.state),comparable(a.state));assert.equal(b.state.ownerLogs.length,0);comparisons++;
  }
 }
 const health=portfolio(portfolioSource,{VERCEL_ENV:'production',C1_OWNER_ACCESS_MODE:'enforce'});
 assert.equal((await health.request('GET',undefined,'',{health:'1'})).statusCode,200);assert.equal(health.state.ownerLogs.length,0);assert.equal(health.state.writes.length,0);
 // Constant-time comparison is invoked exactly once only for a valid64hex
 // enrollment, after a32-byte SHA256; off and malformed configurations skip it.
 for(const [fingerprint,expected] of [[digest,1],[other,1],['A'.repeat(64),0],['0'.repeat(63),0],[undefined,0]]){
  const f=portfolio(portfolioSource,{VERCEL_ENV:'production',C1_OWNER_ACCESS_MODE:'observe',C1_OWNER_ACCOUNT_SHA256:fingerprint});await f.request('GET');assert.equal(f.state.compares,expected);assert.equal(f.state.hashes,expected);
 }
 // Earlier manual-VM tests must execute the actual helper with their own
 // synthetic environment. Ambient production enrollment cannot govern fixture
 // credentials during an enforce-mode release or a normal recovery redeploy.
 for(const [settings,denied,status] of [[{},false,undefined],[{C1_OWNER_ACCESS_MODE:'observe'},false,undefined],
  [{C1_OWNER_ACCESS_MODE:'enforce'},true,503],[{C1_OWNER_ACCESS_MODE:'enforce',C1_OWNER_ACCOUNT_SHA256:other},true,403],
  [{C1_OWNER_ACCESS_MODE:'enforce',C1_OWNER_ACCOUNT_SHA256:digest},false,undefined]]){
  const log=[];const fixture=ownerAccessFixture(settings,{info:(...a)=>log.push(a.join(' '))}),res=response();
  assert.equal(fixture.rejectUnauthorizedC1Owner(res,{key,environment:'production',surface:'account'}),denied);
  assert.equal(res.statusCode,status);assert.equal(log.length,settings.C1_OWNER_ACCESS_MODE?1:0);
 }
 // Owner-run enrollment: no storage read outside reviewed existing production
 // origins; only fingerprint output, no HTTP/clipboard/storage mutation.
 const script=fs.readFileSync('docs/operations/c1-owner-fingerprint.browser.js','utf8');
 for(const origin of ['https://screener-app-cq5t.vercel.app','https://screener-app-cq5t-johnvtovar67-7543s-projects.vercel.app','https://screener-app-cq5t-git-main-johnvtovar67-7543s-projects.vercel.app','https://unknown.invalid']){
  let reads=0;const emitted=[];const box={location:{origin},localStorage:{getItem:name=>{reads++;assert.equal(name,'stock_screener_portfolio_sync_key_v1');return key;}},crypto:crypto.webcrypto,TextEncoder,Uint8Array,console:{info:v=>emitted.push(v)}};
  vm.createContext(box);const run=vm.runInContext(script,box);
  if(origin==='https://unknown.invalid'){await assert.rejects(run);assert.equal(reads,0);assert.deepEqual(emitted,[]);}else{await run;assert.equal(reads,1);assert.deepEqual(emitted,[digest]);}
 }
 console.log(`PASS: ${comparisons} exact full-handler response/storage/record/ETag comparisons; ${denials} dormant enforcement zero-body/zero-storage denials; production observe never locks out; public health/401/405/nonproduction retained; bounded secret-free logs, logger-failure tolerance, constant-time comparison and owner-only local enrollment verified.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
