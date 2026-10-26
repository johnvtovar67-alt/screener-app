// Complete current HTTP adapter -> producer -> immutable reader -> actual ledger
// with synthetic provider I/O and isolated versioned Blob storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createHarness,CURRENT}=require('./top5-performance-regression.cjs');
const {readLegacyTop5Source}=require('./c1-screen-production-extraction.cjs');
const original=readLegacyTop5Source();
assert.equal(crypto.createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0').update(original).digest('hex'),'a882b44c0e009828068ada3efb3af97fdf45e3d4','The entire original route is reconstructed, including all caches/deadlines/ranking/observation/serialization');
const clone=value=>JSON.parse(JSON.stringify(value));
const noIdentity=response=>{const result=clone(response);delete result.headers['X-C1-Request-Id'];return result;};
class BlobPreconditionFailedError extends Error{}
function storage(){
 const state={exists:true,records:[],version:0,calls:[],commits:[],failRead:false,commitThenFail:false};
 state.forClient=name=>({BlobPreconditionFailedError,
  list:async options=>{state.calls.push({name,op:'list',options:clone(options)});return{blobs:state.exists?[{pathname:'screener-performance-ledger.json',url:'https://synthetic.invalid/screener-performance-ledger.json'}]:[]};},
  get:async(_url,options)=>{state.calls.push({name,op:'get',options:clone(options),version:state.version});if(state.failRead)throw Error('Synthetic read unavailable');return{statusCode:200,blob:{etag:'"v'+state.version+'"'},stream:JSON.stringify({records:state.records})};},
  put:async(path,body,options)=>{
   state.calls.push({name,op:'put',path,body,options:clone(options),version:state.version});
   if(options.ifMatch!=='"v'+state.version+'"')throw new BlobPreconditionFailedError('Synthetic conditional conflict');
   state.records=JSON.parse(body).records;state.version++;state.commits.push({version:state.version,body:JSON.parse(body)});
   if(state.commitThenFail)throw Error('Synthetic response interrupted after commit');return{url:'https://synthetic.invalid/screener-performance-ledger.json'};
  }});
 return state;
}
function world(legacy,{clockTick=0,actualContinuity=true,...changes}={}){
 const state=storage(),options={latencies:{discovery:2,snapshot:3,quote:5,fundamentals:7,event:11,timing:13},actualContinuity,actualPerformanceStore:true,memoryBlob:state.forClient('A'),serializeHttpBody:true,marketClockTickMs:clockTick,...changes,...(legacy?{routeSource:original}:{})};
 const a=createHarness(CURRENT,options),workers=[a];
 return{state,options,a,workers,addWorker(extra={}){const worker=createHarness(CURRENT,{...options,...extra,clock:a.clock,memoryBlob:state.forClient(String.fromCharCode(65+workers.length))});workers.push(worker);return worker;},evidence(){return clone({records:state.records,version:state.version,storageCalls:state.calls,commits:state.commits,workers:workers.map(w=>({calls:w.calls,observations:w.observations,cache:w.cache(),quoteCache:[...(w.quoteCache()||[])],cooldown:w.quoteCooldown(),inflight:[...(w.inflight()||[])],hysteresis:[...(w.hysteresis()||[])]}))});}};
}
async function journey(legacy,settings={}){
 const w=world(legacy,settings),responses=[];
 const req=async(query={})=>{const r=await w.a.clock.settle(w.a.request(query));responses.push(noIdentity(r));return r;};
 await req({compact:'1'});w.a.clock.advance(29999);await req({theme:'ai_compute'});
 w.a.clock.advance(1);await req({compact:'1',verificationPass:'1'});
 w.a.clock.advance(31000);await req({compact:'1',verificationPass:'0',screenSymbols:'X000,X001',symbol:'X005'});
 w.a.clock.advance(300000);await req({verificationPass:'20'});
 return{responses,...w.evidence()};
}
async function concurrent(legacy,settings={}){
 const w=world(legacy,settings),b=w.addWorker(),q={compact:'1',verificationPass:'1'};
 const response=await w.a.clock.settle(Promise.all([w.a.request(q),w.a.request(q),b.request(q),b.request({...q,verificationPass:'2'})]));
 // Preserve the current two-worker acquisition policy and all CAS outcomes;
 // do not assert that a mechanical split turns this into distributed locking.
 assert.equal(w.workers.length,2);assert.equal(w.a.calls.filter(c=>c.phase==='discovery').length,1);assert.equal(b.calls.filter(c=>c.phase==='discovery').length,2);
 w.a.clock.advance(31000);
 const recovery=await w.a.clock.settle(w.a.request(q));
 return{responses:response.map(noIdentity),recovery:noIdentity(recovery),...w.evidence()};
}
async function recover(legacy,kind){
 const changes={},w=world(legacy,{...changes,actualContinuity:false}),responses=[];
 if(kind==='provider')w.options.failQuotes=true;
 if(kind==='read')w.state.failRead=true;
 if(kind==='uncertain')w.state.commitThenFail=true;
 const failed=await w.a.clock.settle(w.a.request({compact:'1',verificationPass:'1'}));responses.push(noIdentity(failed));
 const putCount=w.state.calls.filter(c=>c.op==='put').length;
 if(kind==='uncertain'){assert.equal(putCount,1,'A transport error after commit cannot trigger an automatic POST/ledger retry');assert.equal(w.state.version,1);assert.equal(failed.body.meta.performanceObservationRecorded,false);}
 if(kind==='provider')assert.equal(failed.code,503);else assert.equal(failed.body.meta.performanceObservationRecorded,false);
 w.options.failQuotes=false;w.state.failRead=false;w.state.commitThenFail=false;w.a.clock.advance(300001);
 const recovered=await w.a.clock.settle(w.a.request({compact:'1',verificationPass:'2'}));responses.push(noIdentity(recovered));assert.equal(recovered.code,200);assert.equal(recovered.body.meta.performanceObservationRecorded,true);
 return{responses,...w.evidence()};
}
function assertFrozen(value){if(value&&typeof value==='object'){assert(Object.isFrozen(value));for(const key of Object.keys(value))assertFrozen(value[key]);}}
async function immutableRead(){
 const current=world(false),before=world(true);
 const hostile=JSON.parse('{"__proto__":{"safe":"own key"},"constructor":{"retained":true},"prototype":{"retained":true}}');
 const make=()=>({...hostile,date:new Date('2026-10-23T12:00:00Z'),undefinedValue:undefined,notFinite:Infinity,sparse:[,undefined,NaN],custom:{toJSON(){return{serialized:'once'};}}});
 current.a.snapshot.weights=make();before.a.snapshot.weights=make();
 const a=await before.a.clock.settle(before.a.request({compact:'1'})),b=await current.a.clock.settle(current.a.request({compact:'1'}));
 assert.deepEqual(noIdentity(b),noIdentity(a),'Actual HTTP JSON semantics for date/toJSON/undefined/nonfinite/sparse/prototype keys');
 assert.equal(current.a.wireResponse(),before.a.wireResponse(),'Complete wire JSON bytes remain exact');
 const raw=current.a.rawResponse(),cache=current.a.cache();assertFrozen(raw);
 assert(Object.hasOwn(raw.meta.productionPolicy.weights,'__proto__'));assert.equal(Object.getPrototypeOf(raw.meta.productionPolicy.weights),Object.prototype);
 assert.equal(raw.meta.productionPolicy.weights.date,'2026-10-23T12:00:00.000Z');assert.equal(raw.meta.productionPolicy.weights.notFinite,null);assert(!Object.hasOwn(raw.meta.productionPolicy.weights,'undefinedValue'));
 assert(!Object.isFrozen(cache));assert(!Object.isFrozen(cache.rows));assert(!Object.isFrozen(current.a.snapshot.weights),'Publishing the read snapshot never freezes producer-owned inputs');
 const cacheBefore=clone(cache),callsBefore=clone(current.a.calls),storageBefore=clone(current.state.calls),time=current.a.clock.now();
 const reader=current.a.screenReader();
 const production={broadSnapshot:cache,broadRows:cache.rows,rows:cache.rows,clientRows:cache.rows,themeLeadership:raw.themeLeadership,themeKey:'opportunities',config:{name:'Fixture',description:'Fixture'},performanceObservationRecorded:true,MIN_QUOTE_COVERAGE_PCT:95};
 const read1=reader.readC1ScreenSnapshot(production),read2=reader.readC1ScreenSnapshot(production);
 assert.deepEqual(read1,read2);assert.notEqual(read1,read2);assertFrozen(read1);assert.deepEqual(clone(cache),cacheBefore);assert.deepEqual(current.a.calls,callsBefore);assert.deepEqual(current.state.calls,storageBefore);assert.equal(current.a.clock.now(),time,'A read performs no external or mutating operation and does not schedule work');
 assert.notEqual(read1.stocks[0],cache.rows[0]);
 assert.throws(()=>{Object.defineProperty(read1.stocks[0],'price',{value:-1});},TypeError);
 assert.deepEqual(clone(cache),cacheBefore,'Consumer mutation attempts cannot alter cache authority');
 return{wireEqual:true,deepFrozen:true,noCacheAliases:true,noExternalReadEffects:true};
}
async function main(){
 const checks=[];
 for(const clockTick of [0,1]){assert.deepEqual(await journey(false,{clockTick}),await journey(true,{clockTick}),'Exact request-driven sequence/timestamps/complete records, cache/hysteresis and conditional-write lineage');checks.push('five-request sequence tick='+clockTick);assert.deepEqual(await concurrent(false,{clockTick}),await concurrent(true,{clockTick}),'Exact concurrent one/two-worker outputs, all observations, publication order, CAS failure and explicit recovery');checks.push('multiworker concurrency tick='+clockTick);}
 for(const kind of ['provider','read','uncertain']){assert.deepEqual(await recover(false,kind),await recover(true,kind),'Full failure + explicit recovery parity for '+kind);checks.push(kind+' recovery');}
 const immutability=await immutableRead();
 const report={syntheticOnly:true,actualRoute:true,actualPerformanceStore:true,completeSourceReversal:'a882b44c0e009828068ada3efb3af97fdf45e3d4',checks,immutability,noProductionOrAccountOrResearchOrCronRequests:true,noAutomaticMutationRetries:true,distributedAcquisition:'retained existing worker behavior; not falsely claimed centralized',durableImmutableArchive:'not implemented: additional mandatory write changes availability/deadline; legacy GET remains compatibility producer'};
 fs.mkdirSync('work/producer-completion',{recursive:true});fs.writeFileSync('work/producer-completion/parity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
