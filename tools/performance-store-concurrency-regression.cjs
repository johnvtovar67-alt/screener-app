const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const ledger=createResearchModuleLoader(process.cwd()).load('lib/performanceLedger.js');
const PRIOR='tools/fixtures/performance-store-production-21d5380.js',CURRENT='lib/performanceStore.js';
const original=fs.readFileSync(PRIOR,'utf8');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0').update(original).digest('hex'),'9e9b4f7cfbd1ab76bde65a935960f4dfe30f78f5');
const NOW=new Date('2026-10-23T19:00:00Z'),URL='https://fixture.invalid/screener-performance-ledger.json';
const clone=x=>JSON.parse(JSON.stringify(x));
const row=symbol=>({symbol,price:100,action:'Buy',primaryTheme:'synthetic'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
class BlobPreconditionFailedError extends Error{}
function storage({missing=false,records=[]}={}){
 const state={exists:!missing,records:clone(records),version:0,calls:[],failRead:false,weak:false,noEtag:false,badBody:false,unknownWrite:false,commitThenFail:false};
 state.forClient=name=>({
  BlobPreconditionFailedError,
  list:async()=>{state.calls.push([name,'list']);return {blobs:state.exists?[{pathname:'screener-performance-ledger.json',url:URL}]:[]};},
  get:async(_url,options)=>{
   state.calls.push([name,'get',options]);if(state.failRead)throw Error('synthetic read failure');
   if(state.beforeGet)state.beforeGet(name);
   return{statusCode:state.badStatus?304:200,blob:{etag:state.noEtag?'':state.weak?'W/"weak"':'"v'+state.version+'"'},stream:JSON.stringify(state.badBody?{}:{records:clone(state.records)})};
  },
  put:async(path,body,options)=>{
   state.calls.push([name,'put',options]);
   if(state.pauseName===name&&!state.paused){state.paused=true;state.entered.resolve();await state.release.promise;}
   if(state.beforePut)state.beforePut(name);
   if(state.unknownWrite)throw Error('synthetic uncertain write');
   if(options.ifMatch&&(!state.exists||options.ifMatch!=='"v'+state.version+'"'))throw new BlobPreconditionFailedError('fixture conflict');
   if(options.allowOverwrite===false&&state.exists)throw Error('fixture already exists');
   assert.equal(path,'screener-performance-ledger.json');state.records=JSON.parse(body).records;state.exists=true;state.version++;
   if(state.commitThenFail)throw Error('synthetic transport after commit');
   return{url:URL};
  }
 });
 return state;
}
function instance(file,blob,expired=()=>false){
 const imports={...blob,...ledger,top5Phase:(_name,fn)=>fn(),top5Count(){},
  assertTop5Active(){if(expired())throw Error('TOP5_TIMEOUT');},isTop5Deadline:e=>e?.message==='TOP5_TIMEOUT'};
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{[\s\S]*?}\s*from\s*['"][^'"]+['"];?/g,'').replace(/export function /g,'function ');
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW.getTime();}}
 const box={...imports,Date:FixedDate,Response,console};vm.createContext(box);
 vm.runInContext(source+'\nglobalThis.testExports={updatePerformanceLedger,readPerformanceLedger};',box,{filename:file});
 return box.testExports;
}
async function race(file,missing=false){
 const state=storage({missing});state.pauseName='B';state.entered=deferred();state.release=deferred();
 const a=instance(file,state.forClient('A')),b=instance(file,state.forClient('B'));
 const waiting=b.updatePerformanceLedger([row('BBB')],NOW);await state.entered.promise;
 const first=await a.updatePerformanceLedger([row('AAA')],NOW);state.release.resolve();
 const second=await waiting;return{state,first,second};
}
async function main(){
 const prior=await race(PRIOR);
 assert.equal(prior.first.ok,true);assert.equal(prior.second.ok,true);
 assert(!prior.state.records.some(r=>r.symbol==='AAA'),'Reproduce acknowledged observation lost by the later stale writer');
 for(const missing of [false,true]){
  const current=await race(CURRENT,missing);
  assert.equal(current.first.ok,true);assert.equal(current.second.ok,false,'Stale writer must report failure, not erase the first successful update');
  assert.equal(current.second.status,503);assert(current.state.records.some(r=>r.symbol==='AAA'));
  assert(!current.state.records.some(r=>r.symbol==='BBB'));assert.equal(current.state.version,1);
  const rejectedPut=current.state.calls.filter(c=>c[0]==='B'&&c[1]==='put');
  assert.equal(rejectedPut.length,1,'No automatic stale-write retry');
  if(missing)assert.equal(rejectedPut[0][2].allowOverwrite,false,'Absent-object creation cannot overwrite a concurrent creator');
  else assert.equal(rejectedPut[0][2].ifMatch,'"v0"','Write uses the body-read version, not listing metadata');
  const recovered=await instance(CURRENT,current.state.forClient('C')).updatePerformanceLedger([row('BBB')],NOW);
  assert.equal(recovered.ok,true);assert(current.state.records.some(r=>r.symbol==='AAA')&&current.state.records.some(r=>r.symbol==='BBB'));
 }
 const history=[{id:'legacy-1',recordType:'signal',symbol:'OLD',action:'Buy',day:'2026-10-20',timestamp:'2026-10-20T19:00:00Z',price:90,forward:{1:2},custom:'preserved'},
  {id:'state-old',recordType:'state',signalState:true,symbol:'OLD',action:'Watch',timestamp:'2026-10-22T19:00:00Z'}];
 for(const [missing,records] of [[false,[]],[true,[]],[false,history]]){
  const old=storage({missing,records}),current=storage({missing,records});
  const previous=await instance(PRIOR,old.forClient('X')).updatePerformanceLedger([row('AAA'),row('BBB')],NOW);
  const actual=await instance(CURRENT,current.forClient('X')).updatePerformanceLedger([row('AAA'),row('BBB')],NOW);
  assert.deepEqual(clone(actual),clone(previous),'Exact uncontended return/record parity');
  assert.deepEqual(current.records,old.records,'Exact uncontended durable economic/history parity');
  assert.deepEqual(current.calls.map(c=>c[1]),old.calls.map(c=>c[1]),'No extra uncontended read/write calls');
  for(const call of current.calls.filter(c=>c[1]==='get'))assert.equal(call[2].headers['accept-encoding'],'identity');
  const view=await instance(CURRENT,current.forClient('reader')).readPerformanceLedger();
  assert.deepEqual(Object.keys(view),['records'],'Version metadata must stay private to the store');
 }
 for(const issue of ['failRead','weak','noEtag','badBody','badStatus']){
  const state=storage();state[issue]=true;
  const result=await instance(CURRENT,state.forClient('X')).updatePerformanceLedger([row('AAA')],NOW);
  assert.equal(result.ok,false,issue);assert.equal(state.calls.filter(c=>c[1]==='put').length,0,issue+' cannot authorize a blind overwrite');
 }
 for(const issue of ['unknownWrite','commitThenFail']){
  const state=storage();state[issue]=true;
  const result=await instance(CURRENT,state.forClient('X')).updatePerformanceLedger([row('AAA')],NOW);
  assert.equal(result.ok,false);assert.equal(state.calls.filter(c=>c[1]==='put').length,1,'No automatic retry after an uncertain write');
 }
 // Exercise the existing second/reconciliation write, not just the first put.
 // A simulated old/unconditional writer replaces A before verification; a
 // further update arrives before the reconciliation put can commit.
 const state=storage(),b=ledger.applyPerformanceObservation([], [row('BBB')],NOW),
  bc=ledger.applyPerformanceObservation(b,[row('CCC')],NOW);
 let reads=0,puts=0;
 state.beforeGet=()=>{if(++reads===3){state.records=clone(b);state.version=2;}};
 state.beforePut=()=>{if(++puts===2){state.records=clone(bc);state.version=3;}};
 const reconciled=await instance(CURRENT,state.forClient('X')).updatePerformanceLedger([row('AAA')],NOW);
 assert.equal(reconciled.ok,false);assert.equal(reconciled.status,503);
 assert.deepEqual(state.records,clone(bc),'A stale reconciliation write must not overwrite the newest durable data');
 assert.equal(state.calls.filter(c=>c[1]==='put')[1][2].ifMatch,'"v2"','Reconciliation uses its own verification-read version');
 console.log('PASS: two-instance acknowledged-update loss reproduced; conditional writes preserve the winner, fail stale/unknown writes without retry, recover on a normal new request and retain exact uncontended outputs.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
