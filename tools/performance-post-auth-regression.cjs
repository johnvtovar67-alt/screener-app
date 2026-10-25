// Approved deployed POST authorization; actual handler/helper/store/ledger,
// synthetic credentials and memory-only Blob. No provider or production I/O.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const current=fs.readFileSync('pages/api/performance.js','utf8');
const blobHash=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
const authImport="import {rejectUnauthorizedResearchMutation} from '../../lib/researchMutationAuth';\n",guard="  if(['production','preview'].includes(process.env.VERCEL_ENV)&&rejectUnauthorizedResearchMutation(req,res))return;\n";
assert.equal(current.split(authImport).length,2,'Exactly one actual shared-auth import');
assert.equal(current.split(guard).length,2,'Exactly one approved deployed POST gate');
const original=current.replace(authImport,'').replace(guard,'');
assert.equal(blobHash(original),'47f3b8f120c574ef62e7784ab64d850d7d17d404','Removing only the approved auth lines exactly restores the deployed PR332 handler');
const proposed=current;
const loader=createResearchModuleLoader(process.cwd()),ledger=loader.load('lib/performanceLedger.js');
const at='2026-10-23T19:00:00.000Z',earlier='2026-10-23T18:00:00.000Z',secret='synthetic_review_server_secret_never_live';
class Clock extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return Date.parse(at);}}
const copy=value=>JSON.parse(JSON.stringify(value)),row={symbol:'SYNTHETIC',price:100,action:'Buy'},seed=copy(ledger.applyPerformanceObservation([],[row],earlier));
let comparisons=0,denials=0,methodChecks=0;
function harness(source,options={}){
 const {records=seed,exists=true,failure}=options,environment=Object.hasOwn(options,'environment')?options.environment:'production',configured=Object.hasOwn(options,'configured')?options.configured:secret;
 const env={...(environment===undefined?{}:{VERCEL_ENV:environment}),...(configured===undefined?{}:{CRON_SECRET:configured})};
 const state={records:copy(records),exists,version:1,calls:[],logs:[],bodyReads:0};class BlobPreconditionFailedError extends Error{}
 const adapter={BlobPreconditionFailedError,
  list:async options=>{state.calls.push({operation:'list',options:copy(options)});if(failure==='read')throw Error('synthetic read failure');return{blobs:state.exists?[{pathname:'screener-performance-ledger.json',url:'https://synthetic.invalid/ledger'}]:[]};},
  get:async(url,options)=>{state.calls.push({operation:'get',url,options:copy(options)});if(failure==='verify-read'&&state.calls.filter(c=>c.operation==='get').length===3)throw Error('synthetic verification read failure');return{statusCode:200,blob:{etag:failure==='weak-etag'?'W/"v1"':'"v'+state.version+'"'},stream:JSON.stringify({records:state.records})};},
  put:async(path,body,options)=>{
   state.calls.push({operation:'put',path,body,options:copy(options)});assert.equal(path,'screener-performance-ledger.json');
   if(failure==='conflict')state.version++;
   if(options.ifMatch&&options.ifMatch!=='"v'+state.version+'"')throw new BlobPreconditionFailedError('synthetic stale version');
   if(!state.exists)assert.equal(options.allowOverwrite,false);else assert.equal(options.ifMatch,'"v'+state.version+'"');
   if(failure==='unknown-write')throw Error('synthetic uncertain write');state.records=JSON.parse(body).records;state.version++;state.exists=true;
   if(failure==='commit-then-fail')throw Error('synthetic committed transport failure');return{url:'https://synthetic.invalid/ledger'};
  }};
 const storeBox={...ledger,...adapter,Map,Set,Date:Clock,Response,console:{warn:(...args)=>state.logs.push(args.join(' '))},top5Phase:(_name,fn)=>fn(),top5Count(){},assertTop5Active(){},isTop5Deadline:()=>false};
 const storeSource=fs.readFileSync('lib/performanceStore.js','utf8').replace(/import\s*{[\s\S]*?}\s*from\s*['"][^'"]+['"];?/g,'').replace(/export function /g,'function ');
 vm.createContext(storeBox);vm.runInContext(storeSource+';this.store={readPerformanceLedger,updatePerformanceLedger};',storeBox);
 const authBox={process:{env},Buffer,timingSafeEqual:crypto.timingSafeEqual};vm.createContext(authBox);
 const authSource=fs.readFileSync('lib/researchMutationAuth.js','utf8').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
 vm.runInContext(authSource+';this.reject=rejectUnauthorizedResearchMutation;',authBox);
 const endpoint={...ledger,...storeBox.store,Date:Clock,console:storeBox.console,process:{env},rejectUnauthorizedResearchMutation:authBox.reject};vm.createContext(endpoint);
 const api=source.replace(/^import .*;\n/gm,'').replace('export const config=','const config=').replace('export default async function handler','async function handler');
 vm.runInContext(api+';this.handler=handler;',endpoint);
 return{state,async request(method='GET',body,authorization,hostileBody=false){
  const req={method,headers:authorization===undefined?{}:{authorization},query:{}};
  Object.defineProperty(req,'body',{get(){state.bodyReads++;if(hostileBody)throw Error('HOSTILE_BODY_MUST_NOT_BE_READ');return body;}});
  const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await endpoint.handler(req,res);return res;
 }};
}
(async()=>{
 // Full successful responses, strong ETag creation/overwrite calls, status,
 // records, summaries and failure outcomes remain identical for trusted POSTs.
 const scenarios=[{}, {records:[],exists:false}, {failure:'read'},{failure:'weak-etag'}, {failure:'conflict'},{failure:'unknown-write'},{failure:'commit-then-fail'},{failure:'verify-read'}];
 const bodies=[{stocks:[{...row,price:105,action:'Watch'},{symbol:'SECOND',price:80,action:'Strong Buy'}],timestamp:at},{stocks:[],timestamp:at},{stocks:null},{}];
 for(const environment of ['production','preview'])for(const options of scenarios)for(const method of ['GET','POST']){
  const before=harness(original,{...options,environment}),after=harness(proposed,{...options,environment});
  const body=bodies[0],auth='Bearer '+secret;
  assert.deepEqual(copy(await after.request(method,body,auth)),copy(await before.request(method,body,auth)),'Full HTTP contract equality');
  assert.deepEqual(after.state,before.state,'Full storage calls/options, committed records/logs and read budgets match');comparisons++;
  if(method==='POST'&&options.failure&&['conflict','unknown-write','commit-then-fail'].includes(options.failure))assert.equal(after.state.calls.filter(c=>c.operation==='put').length,1,'No automatic mutation retry');
 }
 for(const body of bodies.slice(1)){
  const a=harness(original),b=harness(proposed);assert.deepEqual(copy(await b.request('POST',body,'Bearer '+secret)),copy(await a.request('POST',body,'Bearer '+secret)));assert.deepEqual(b.state,a.state);comparisons++;
 }
 // Read and405 behavior stay public and ignore the body in every environment,
 // including missing server config. Unsupported methods must not touch storage.
 for(const environment of ['production','preview','development',undefined])for(const method of ['GET','PUT','PATCH','DELETE','HEAD','OPTIONS']){
  const a=harness(original,{environment,configured:undefined}),b=harness(proposed,{environment,configured:undefined});
  assert.deepEqual(copy(await b.request(method,undefined,undefined,true)),copy(await a.request(method,undefined,undefined,true)));assert.deepEqual(b.state,a.state);assert.equal(b.state.bodyReads,0);
  if(method!=='GET'){assert.equal(b.state.calls.length,0);methodChecks++;}comparisons++;
 }
 // Actual shared constant-time helper: denied deployed POSTs cannot read even
 // a hostile body getter, invoke any store work or change records/ETags.
 for(const environment of ['production','preview'])for(const configured of [undefined,'',secret])for(const authorization of [undefined,'wrong','Bearer wrong','Bearer '+ 'x'.repeat(secret.length),'Bearer '+ 'x'.repeat(5000),'bearer '+secret,'Bearer '+secret+' ']){
  const f=harness(proposed,{environment,configured}),before=JSON.stringify(f.state.records),res=await f.request('POST',undefined,authorization,true);
  assert.equal(res.statusCode,configured?401:503);assert.equal(res.body.error,configured?'Unauthorized':'CRON_SECRET is not configured');assert.equal(res.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(f.state.bodyReads,0);assert.equal(f.state.calls.length,0);assert.equal(f.state.version,1);assert.equal(JSON.stringify(f.state.records),before);denials++;
 }
 // Development and ordinary offline/unset environments retain original HTTP
 // contracts; direct in-process producers never use this HTTP auth gate.
 for(const environment of ['development',undefined]){
  const a=harness(original,{environment,configured:undefined}),b=harness(proposed,{environment,configured:undefined});
  assert.deepEqual(copy(await b.request('POST',bodies[0])),copy(await a.request('POST',bodies[0])));assert.deepEqual(b.state,a.state);comparisons++;
 }
 assert.equal(fs.readFileSync('pages/api/performance.js','utf8'),current,'Tests never change application files');
 console.log(JSON.stringify({policy:'production/preview HTTP POST requires existing CRON_SECRET; public GET/405 and development/unset retained',baselineHandlerBlob:blobHash(original),comparisons,denials,unsupportedMethodZeroStorageChecks:methodChecks,memoryOnly:true,automaticMutationRetries:0,limitations:'Handler gate follows Next body parsing. No live endpoint/credentials/account/Blob I/O.'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
