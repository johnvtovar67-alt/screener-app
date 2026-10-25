// Real portfolio handler and shared Blob predicate, synthetic memory I/O only.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),{isBlobPreconditionFailed}=loader.load('lib/blobErrors.js');
const original=fs.readFileSync('tools/fixtures/portfolio-sync-production-d386ae5.js','utf8'),current=fs.readFileSync('pages/api/portfolio-sync.js','utf8');
const hash=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(hash(original),'75b21442e9c14c06b04fbaaab6c3f1fb46d7143d');
const reversed=require('./c1-owner-access-extraction.cjs').originalPortfolioSource(current).replace("import {createHash,randomUUID} from 'crypto';","import {createHash} from 'crypto';")
 .replace("import {isBlobPreconditionFailed} from '../../lib/blobErrors';\n",'')
 .replace("  }catch{return{ok:false,error:'Blob storage unavailable'};}","  }catch(e){return{ok:false,error:e.message||'Blob storage unavailable'};}")
 .replace(/function reportPortfolioFailure\(res,stage,status\)\{[\s\S]*?\n\}\n/,'')
 .replace("    const health=await storageHealth();if(!health.ok)reportPortfolioFailure(res,'storage-health',503);","    const health=await storageHealth();")
 .replace("if(isBlobPreconditionFailed(e)||e.status===409||e.name==='BlobAlreadyExistsError')","if(/precondition failed.*etag mismatch/i.test(String(e.message||''))||e.status===409||e.status===412||['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(e.name))")
 .replace("    const requestId=reportPortfolioFailure(res,req.method==='PUT'?'portfolio-save':'portfolio-read',500);\n    return res.status(500).json({error:'Portfolio sync failed.',detail:'Saved portfolio verification is unavailable. Reload before retrying.',requestId});", "    console.error('portfolio sync:',e.message);\n    return res.status(500).json({error:'Portfolio sync failed.',detail:e.message});");
assert.equal(reversed,original,'Exact source reversal preserves the complete original handler beyond the redaction and shared predicate');
const originalPredicate=error=>error?.name==='BlobPreconditionFailedError'||error?.status===412||/precondition failed.*etag mismatch/i.test(String(error?.message||''));
const accountSave=fs.readFileSync('lib/c1AccountSave.js','utf8');
assert.equal(hash(accountSave.replace("import {isBlobPreconditionFailed} from './blobErrors';\n",'').replace('return isBlobPreconditionFailed(error);',"return error?.name==='BlobPreconditionFailedError'||error?.status===412||/precondition failed.*etag mismatch/i.test(String(error?.message||''));")),'44e91ede57936935aae3a3408c141baac93153bc','Only the existing exported account conflict predicate delegates; account save/rebase logic is byte-identical');
const accountPredicate=loader.load('lib/c1AccountSave.js').isC1AccountSaveConflict;
for(const name of [undefined,'Error','BlobPreconditionFailedError','BlobAlreadyExistsError'])for(const status of [undefined,409,412,500])for(const message of ['', 'Vercel Blob: Precondition failed: ETag mismatch.', 'private unrelated error']){
 const error=Object.assign(new Error(message),{...(name?{name}:{}),...(status?{status}:{})});
 assert.equal(isBlobPreconditionFailed(error),originalPredicate(error));assert.equal(accountPredicate(error),originalPredicate(error));
 const oldPortfolio=/precondition failed.*etag mismatch/i.test(String(error.message||''))||error.status===409||error.status===412||['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error.name);
 assert.equal(isBlobPreconditionFailed(error)||error.status===409||error.name==='BlobAlreadyExistsError',oldPortfolio);
}
for(const value of [null,undefined,'primitive',{},false])assert.equal(isBlobPreconditionFailed(value),originalPredicate(value));
const key='synthetic_portfolio_error_boundary_0001',sentinel='PRIVATE_STORAGE_ERROR_URL_TOKEN_7289',requestId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const at='2026-10-25T06:00:00.000Z',NativeDate=Date;
class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}}
const sample={version:2,updatedAt:'2026-10-23T20:00:00Z',portfolio:[{symbol:'AAA',shares:3,avgCost:100,role:'Swing',winnerHistory:{trimCount:2}}],c1ControlState:{highWater:100000,triggerDay:'2026-09-09'}};
const json=value=>JSON.parse(JSON.stringify(value));
function harness(source=current,{saved=true,environment='production'}={}){
 const state={saved:saved?{body:JSON.stringify(sample),etag:'v1'}:null,reads:[],puts:[],lists:[],logs:[]};
 const code=source.replace(/^import .*;\n/gm,'').replace('export const config=','const config=').replace('export default async function handler','async function handler');
 const box={...require('./c1-owner-access-extraction.cjs').ownerAccessFixture(),Date:Clock,Response,process:{env:{VERCEL_ENV:environment}},createHash:crypto.createHash,randomUUID:()=>requestId,isBlobPreconditionFailed,
  cleanC1ControlState:loader.load('lib/c1CapitalState.js').cleanC1ControlState,
  console:{warn:(...args)=>{if(state.logFailure)throw Error(sentinel);state.logs.push(args.join(' '));},error:(...args)=>state.logs.push(args.join(' '))},
  list:async options=>{state.lists.push(json(options));if(state.listError)throw state.listError;return{blobs:[]};},
  get:async(path,options)=>{
   state.reads.push({path,options:json(options)});if(state.getError)throw state.getError;
   if(path==='portfolio-sync-health/nonexistent.json')return null;
   assert.equal(options.access,'private');assert.equal(options.useCache,false);assert.equal(options.headers['accept-encoding'],'identity');
   return state.saved?{statusCode:200,blob:{etag:state.badEtag?undefined:state.saved.etag},stream:new Response(state.badBody||state.saved.body).body}:null;
  },
  put:async(path,body,options)=>{
   state.puts.push({path,body,options:json(options)});if(state.compete)state.saved={...state.saved,etag:'competitor'};
   if(state.saved?options.ifMatch!==state.saved.etag:options.allowOverwrite)throw Object.assign(Error(sentinel),{name:'BlobPreconditionFailedError',status:412});
   if(!state.putError||state.commitBeforeError)state.saved={body,etag:'v2'};
   if(state.putError)throw state.putError;return{etag:'v2'};
  }};
 vm.createContext(box);vm.runInContext(code+';this.handler=handler;',box);
 return{state,async request(method='GET',body,query={},authorized=true){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}};
  await box.handler({method,headers:authorized?{authorization:'Bearer '+key}:{},body,query},res);return res;
 }};
}
const edit={portfolio:[{symbol:' aaa ',shares:4,avgCost:105,role:'Swing',openedAt:'2026-09-01',winnerHistory:{trimCount:2}}],expectedEtag:'v1',c1ControlState:{highWater:100000,triggerDay:'2026-09-09'}};
(async()=>{
 // Exact responses, headers, storage calls/options and resulting records match.
 for(const [method,body,query,authorized,options]of [['GET'],['PUT',edit],['PUT',{...edit,expectedEtag:'stale'}],['PUT',{...edit,portfolio:null}],['POST'],['GET',undefined,{},false],['GET',undefined,{health:'1'}],['GET',undefined,{},true,{saved:false}],['PUT',{...edit,expectedEtag:null},{},true,{saved:false}],['PUT',{...edit,expectedEtag:null},{},true,{saved:false,environment:'preview'}]]){
  const before=harness(original,options),after=harness(current,options);
  const a=await before.request(method,body,query,authorized),b=await after.request(method,body,query,authorized);
  assert.deepEqual(json(b),json(a));assert.deepEqual(after.state,before.state,'Full memory GET/PUT/ETag/creation/storage contract remains identical');
 }
 const old=harness(original);old.state.getError=Error(sentinel);const leaked=await old.request();
 assert(JSON.stringify(leaked.body).includes(sentinel));assert(old.state.logs.join('\n').includes(sentinel),'Frozen handler reproduces public and log raw-error leak');
 const oldHealth=harness(original);oldHealth.state.listError=Error(sentinel);assert(JSON.stringify((await oldHealth.request('GET',undefined,{health:'1'})).body).includes(sentinel));
 for(const failure of ['getError','putError','listError','healthGetError','badBody','badEtag']){
  const f=harness();
  if(failure==='badBody')f.state.badBody='{not-json';else if(failure==='badEtag')f.state.badEtag=true;
  else f.state[failure==='healthGetError'?'getError':failure]=Error(sentinel);
  const health=['listError','healthGetError'].includes(failure),method=failure==='putError'?'PUT':'GET',res=await f.request(method,edit,health?{health:'1'}:{});
  assert.equal(res.statusCode,health?503:500);assert.equal(res.headers['X-C1-Request-Id'],requestId);
  assert.doesNotMatch(JSON.stringify(res),new RegExp(sentinel+'|'+key));assert.doesNotMatch(f.state.logs.join('\n'),new RegExp(sentinel+'|'+key+'|portfolio-sync/|AAA'));
  assert.equal(f.state.logs.length,1);const report=JSON.parse(f.state.logs[0].slice('PORTFOLIO_SYNC_FAILURE '.length));
  assert.deepEqual(Object.keys(report).sort(),['code','requestId','stage','status']);assert.equal(report.status,res.statusCode);assert.equal(report.code,'PORTFOLIO_STORAGE_UNAVAILABLE');
  assert.equal(f.state.puts.length,failure==='putError'?1:0,'A failed mutation is attempted once only');
 }
 for(const error of [Object.assign(Error(sentinel),{status:409}),Object.assign(Error(sentinel),{status:412}),Object.assign(Error(sentinel),{name:'BlobPreconditionFailedError'}),Object.assign(Error(sentinel),{name:'BlobAlreadyExistsError'}),Error('Precondition failed: ETag mismatch '+sentinel)]){
  const before=harness(original),after=harness();before.state.getError=after.state.getError=error;
  assert.deepEqual(json(await after.request('PUT',edit)),json(await before.request('PUT',edit)));assert.deepEqual(after.state,before.state);
 }
 for(const source of [original,current]){
  const race=harness(source);race.state.compete=true;const before=race.state.saved.body,res=await race.request('PUT',edit);
  assert.equal(res.statusCode,409);assert.equal(race.state.puts.length,1);assert.equal(race.state.saved.body,before,'Atomic store conflict cannot overwrite saved holdings/capital');
 }
 const unconfirmed=harness();unconfirmed.state.putError=Error(sentinel);unconfirmed.state.commitBeforeError=true;
 const failed=await unconfirmed.request('PUT',edit);assert.equal(failed.statusCode,500);assert.equal(unconfirmed.state.puts.length,1);assert.doesNotMatch(failed.body.detail,/not saved|no changes were saved/i);
 delete unconfirmed.state.putError;const recovered=await unconfirmed.request();assert.equal(recovered.statusCode,200);assert.equal(recovered.body.portfolio[0].shares,4);assert.equal(unconfirmed.state.puts.length,1,'Recovery reads saved state without automatic mutation retries');
 const logFailure=harness();logFailure.state.getError=Error(sentinel);logFailure.state.logFailure=true;assert.equal((await logFailure.request()).statusCode,500,'Logging cannot replace the sanitized failure response');
 console.log('PASS: portfolio raw-error leaks reproduced/redacted; shared Blob conflict identity, full successful GET/PUT/storage/ETag/CAS parity, bounded logs, unconfirmed-write retention/read recovery and zero mutation retries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
