// Actual recordPerformance seam and production ledger reducer; no route, provider,
// account, network, research runner or Blob request is invoked by this fixture.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const ledger=createResearchModuleLoader(process.cwd()).load('lib/performanceLedger.js');
const source=fs.readFileSync('pages/api/top5.js','utf8');
const start=source.indexOf('async function recordPerformance('),end=source.indexOf('\nfunction serializeStockForClient(',start);
assert(start>0&&end>start,'Actual performance-record function boundaries required');
const current=source.slice(start,end);
const guarded='  // An older snapshot must not replace the newer recording generation.\n  if (globalThis[PERFORMANCE_RECORD_KEY]?.promise === promise)\n    globalThis[PERFORMANCE_RECORD_KEY] = { key, at: Date.now(), promise: null, ok };';
const original='  globalThis[PERFORMANCE_RECORD_KEY] = { key, at: Date.now(), promise: null, ok };';
assert.equal(current.split(guarded).length,2,'Only the declared settlement ownership seam changes');
const baseline=current.replace(guarded,original);
assert.equal(createHash('sha256').update(baseline).digest('hex'),'a52ba4fd988083b9f5bce33cad6e3734fb8f4cd72866efde5777294fd23c2541','Every original projection, timestamp, cooldown, call and failure boundary remains byte-exact');
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b,label)=>assert.deepEqual(clone(a),clone(b),label);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const EPOCH=Date.parse('2026-10-23T14:00:00.000Z');
const rows=(price,action='Buy')=>[{symbol:'SYNTHETIC',price,currentPrice:price,dayChangePct:1,primaryTheme:'Synthetic',fundamentalDataStatus:'complete',eventRisk:{status:'Passed',manualCheckRequired:false,checkComplete:true},entryTiming:{available:true,asOf:'2026-10-23'},finalDecision:{action,relativeCapitalScore:90},recommendation:{displayLabel:action,entryQualityLabel:'Confirmed'},ignoredServerOnly:'never-persist-this'}];
function harness(body){
 let now=EPOCH;const calls=[],logs=[],state={records:[]};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const box={Date:ClockDate,PERFORMANCE_RECORD_KEY:'__performance',console:{warn:(...args)=>logs.push(args)},
  updatePerformanceLedger:async(compactRows,at)=>{
   const gate=deferred(),call={rows:clone(compactRows),at,gate};calls.push(call);
   const result=await gate.promise;
   if(result.ok||result.commitThenError)state.records=clone(ledger.applyPerformanceObservation(state.records,compactRows,at));
   if(result.commitThenError)throw Error('Synthetic transport failed after commit');
   if(result.throw)throw Error('Synthetic unavailable write');
   return result;
  }};
 vm.createContext(box);vm.runInContext(body+'\nglobalThis.record=recordPerformance;',box,{filename:'pages/api/top5.js:recordPerformance'});
 return{box,calls,state,logs,advance:ms=>now+=ms,at:()=>now,
  record:(key,price,action='Buy')=>box.record(rows(price,action),key),
  settle:(index,result={ok:true})=>calls[index].gate.resolve(result),
  evidence:()=>({calls:calls.map(({rows,at})=>({rows,at})),records:clone(state.records),logs:clone(logs)})};
}
async function normal(body){
 const h=harness(body),results=[];
 results.push(await(async()=>{const p=h.record('A',100);h.settle(0);return p;})());
 h.advance(29999);results.push(await h.record('A',100));assert.equal(h.calls.length,1,'Same successful snapshot coalesces before30s');
 h.advance(1);const renewal=h.record('A',100);assert.equal(h.calls.length,2,'At30s a normal observation is preserved');h.settle(1);results.push(await renewal);
 h.advance(1);const next=h.record('B',110,'Watch'),join=h.record('B',110,'Watch');assert.equal(h.calls.length,3,'Same pending snapshot joins');h.settle(2);results.push(await next,await join);
 h.advance(30000);const after=h.record('B',110,'Watch');assert.equal(h.calls.length,4,'No intended post30s observation is removed');h.settle(3);results.push(await after);
 for(const call of h.calls)assert(!JSON.stringify(call.rows).includes('never-persist-this'),'Original compact projection retained');
 return{...h.evidence(),results};
}
async function failureRecovery(body,result){
 const h=harness(body),results=[];
 const failed=h.record('A',100);h.settle(0,result);results.push(await failed);
 h.advance(4999);results.push(await h.record('A',100));assert.equal(h.calls.length,1,'Failed snapshot keeps its five-second cooldown, no automatic mutation retry');
 h.advance(1);const recovery=h.record('A',100);assert.equal(h.calls.length,2,'A normal new request can recover at five seconds');h.settle(1);results.push(await recovery);
 return{...h.evidence(),results};
}
async function race(body,{older={ok:true},newer={ok:true},thirdKey='B',thirdDelay=1}={}){
 const h=harness(body),a=h.record('A',100);h.advance(1);const b=h.record('B',110);
 assert.equal(h.calls.length,2);h.settle(0,older);const resultA=await a;
 const cacheAfterOlder={key:h.box.__performance.key,inflight:!!h.box.__performance.promise};
 h.advance(thirdDelay);const c=h.record(thirdKey,thirdKey==='C'?120:thirdKey==='A'?100:110),countBeforeRelease=h.calls.length;
 h.settle(1,newer);if(h.calls[2])h.settle(2,newer);
 const results=[resultA,await b,await c];
 return{...h.evidence(),cacheAfterOlder,countBeforeRelease,results};
}
async function main(){
 same(await normal(current),await normal(baseline),'All uncontended output, projection, exact timestamps, state history and30s-boundary calls remain identical');
 for(const result of [{ok:false,warning:'Synthetic failure'},{throw:true},{commitThenError:true}])same(await failureRecovery(current,result),await failureRecovery(baseline,result),'Failure, uncertain commit, retention, cooldown and explicit recovery parity');
 const races=[];
 for(const older of [{ok:true},{ok:false,warning:'Synthetic older failure'},{throw:true},{commitThenError:true}]){
  for(const newer of [{ok:true},{ok:false,warning:'Synthetic newer failure'}]){
   const before=await race(baseline,{older,newer}),after=await race(current,{older,newer});
   assert.equal(before.cacheAfterOlder.key,'A');assert.equal(before.countBeforeRelease,3,'Reproduce older-settlement cache regression and duplicate recording');
   assert.equal(after.cacheAfterOlder.key,'B');assert.equal(after.cacheAfterOlder.inflight,true);assert.equal(after.countBeforeRelease,2,'Newer recording keeps ownership and same-snapshot third request joins');
   same(after.calls,before.calls.slice(0,2),'Both initial intended compact observations and their exact timestamps remain identical');
   same(after.results,before.results,'Joining the pending same snapshot retains all caller outcomes');
   if(newer.ok){
    assert.equal(before.records.find(r=>r.recordType==='signal').lastMarkAt,'2026-10-23T14:00:00.002Z');
    assert.equal(after.records.find(r=>r.recordType==='signal').lastMarkAt,'2026-10-23T14:00:00.001Z');
    // This precise race-only difference is intentional: remove the third write
    // that bypassed the preexisting same-snapshot inflight coalescing contract.
   }
   races.push({older,newer,baselineWrites:before.calls.length,currentWrites:after.calls.length,originalObservationsEqual:true});
  }
 }
 const before=await race(baseline,{thirdKey:'C'}),after=await race(current,{thirdKey:'C'});
 same(after.calls,before.calls,'A distinct third snapshot still produces every requested observation at its original timestamp');same(after.records,before.records,'Distinct-snapshot full ledger remains identical');same(after.results,before.results,'Distinct-snapshot caller outcomes remain identical');
 // An explicit return to an older snapshot key is a new latest generation.
 // The buggy older completion suppresses it using an obsolete cooldown.
 const backBefore=await race(baseline,{thirdKey:'A'}),backAfter=await race(current,{thirdKey:'A'});
 assert.equal(backBefore.calls.length,2);assert.equal(backAfter.calls.length,3);
 same(backAfter.calls.slice(0,2),backBefore.calls,'Returning to A preserves the initial A/B observations');
 assert.equal(backAfter.calls[2].at,'2026-10-23T14:00:00.002Z');
 assert.equal(backAfter.records.find(r=>r.recordType==='signal').lastMarkPct,0,'Explicit A/B/A request sequence retains its final A mark');
 assert(backBefore.records.find(r=>r.recordType==='signal').lastMarkPct>9,'Reproduce obsolete A cooldown incorrectly retaining only the B mark');
 // ABA: a repeated key is insufficient ownership proof. Only the currently
 // installed promise may settle A2 while old A1 and B are still outstanding.
 const aba=harness(current),a1=aba.record('A',100);aba.advance(1);const middle=aba.record('B',110);aba.advance(1);const a2=aba.record('A',105);
 assert.equal(aba.calls.length,3);const a2Identity=aba.box.__performance.promise;
 aba.settle(0);await a1;assert.equal(aba.box.__performance.key,'A');assert.equal(aba.box.__performance.promise,a2Identity,'Old same-key A1 cannot replace newer A2 promise');
 const joinedA2=aba.record('A',105);assert.equal(aba.calls.length,3,'The next A request joins A2 instead of duplicating it');
 aba.settle(1);await middle;assert.equal(aba.box.__performance.promise,a2Identity,'B completion also leaves newest A2 identity intact');aba.settle(2);assert.equal(await a2,true);assert.equal(await joinedA2,true);
 // Recovery after the newer failed inflight write is not suppressed indefinitely.
 const h=harness(current),a=h.record('A',100);h.advance(1);const b=h.record('B',110);h.settle(0);await a;const c=h.record('B',110);h.settle(1,{ok:false,warning:'Synthetic failure'});assert.equal(await b,false);assert.equal(await c,false);assert.equal(h.calls.length,2);
 h.advance(5000);const recovered=h.record('B',110);h.settle(2);assert.equal(await recovered,true);assert.equal(h.calls.length,3,'Only explicit new refresh retries the failed newer generation');
 // The current generation can complete normally even if an older completion is
 // still held; its success cooldown starts at its own settlement time.
 const k=harness(current),old=k.record('A',100);k.advance(1);const next=k.record('B',110);k.settle(1);await next;k.advance(30000);const renewal=k.record('B',110);assert.equal(k.calls.length,3);k.settle(0);await old;assert.equal(k.box.__performance.key,'B');assert(k.box.__performance.promise);k.settle(2);await renewal;
 fs.mkdirSync('work/continue-producer',{recursive:true});fs.writeFileSync('work/continue-producer/record-verification.json',JSON.stringify({scope:'Actual isolated recording function + real pure ledger reducer, synthetic clock/promise I/O only',uncontendedExactParity:true,successCooldownMs:30000,failureCooldownMs:5000,failureAndUncertainCommitParity:true,races,distinctSnapshotTimesAndFullLedgerEqual:true,normalPost30sObservationsPreserved:true,noAutomaticMutationRetry:true,abaPromiseIdentityVerified:true,olderKeyReturnRecordsIntendedObservation:true,raceOnlyDifference:'Earlier completion no longer replaces newer inflight identity. A same-snapshot joining request retains original B timestamp rather than adding a spurious third mark; an explicit A/B/A return records the intended final A instead of using obsolete A cooldown.',noProductionOrProviderOrAccountOrBlobRequests:true},null,2)+'\n');
 console.log('PASS: actual recording-generation race reproduced/repaired; original observation rows/timestamps, distinct snapshots,30s/5s boundaries, failures/uncertain commits and explicit recovery preserved; same-snapshot duplicate write removed with zero external I/O.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
