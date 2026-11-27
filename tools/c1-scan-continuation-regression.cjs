const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {continueC1ReadOnlyScan}=createResearchModuleLoader(process.cwd()).load('lib/c1ScanContinuation.js');
const payload=(count,{total=520,identity='accepted-source',complete=count===total}={})=>({scan:{sourceIdentity:identity,total,completed:count,complete},decisionId:identity+':'+count});
const scanOf=result=>result.scan;
async function run(){
 const requests=[];let capturedOwner='owner-1',clock=0;
 const first=payload(32);
 const completed=await continueC1ReadOnlyScan({initial:first,scanOf,isCurrent:()=>capturedOwner==='owner-1',now:()=>clock,next:async context=>{
  requests.push({method:'GET',pass:context.pass,deadline:context.deadline,source:context.scan.sourceIdentity});clock+=1000;
  return payload(Math.min(520,context.scan.completed+32));
 }});
 assert.equal(completed.scan.complete,true);assert.equal(completed.scan.completed,520);assert.equal(requests.length,16);
 assert(requests.every(request=>request.method==='GET'),'Continuation cannot replay a financial POST');
 assert.equal(requests.at(-1).pass,16,'The full 520-name supported universe advances beyond nine provider batches');
 assert.equal(new Set(requests.map(request=>request.source)).size,1);
 assert.equal(new Set(requests.map(request=>request.deadline)).size,1,'All continuations retain the original frame budget');
 const stale=await continueC1ReadOnlyScan({initial:first,scanOf,isCurrent:()=>false,next:async()=>{throw Error('Superseded owner cannot request');}});
 assert.equal(stale,first);
 const raced=await continueC1ReadOnlyScan({initial:first,scanOf,isCurrent:()=>capturedOwner==='owner-1',next:async()=>{capturedOwner='owner-2';return payload(520);}});
 assert.equal(raced,first,'Late complete response owned by a superseded refresh cannot replace its accepted partial frame');
 const active=await continueC1ReadOnlyScan({initial:payload(32,{identity:'new-owner'}),scanOf,next:async context=>payload(Math.min(520,context.scan.completed+32),{identity:'new-owner'})});
 assert.equal(active.scan.complete,true);assert.equal(active.scan.sourceIdentity,'new-owner','A competing fresh owner completes only its own accepted source');
 let stalledRequests=0;
 const stalled=await continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>{stalledRequests++;return payload(32);}});
 assert.equal(stalled.scan.complete,false);assert.equal(stalledRequests,1,'A stalled partial source stays explicitly incomplete');
 let time=0,boundedRequests=0;
 const timedOut=await continueC1ReadOnlyScan({initial:first,scanOf,now:()=>time,budgetMs:5,next:async()=>{boundedRequests++;time=6;return payload(520);}});
 assert.equal(timedOut,first,'Expired completion cannot replace a validated partial receipt');
 assert.equal(boundedRequests,1,'Budget expiry never masquerades as no opportunities or a completed scan');
 let finishLate,watchdog;
 try{
  const waited=await Promise.race([
   continueC1ReadOnlyScan({initial:first,scanOf,budgetMs:20,next:()=>new Promise(resolve=>{finishLate=resolve;})}),
   new Promise(resolve=>{watchdog=setTimeout(()=>resolve(null),300);})
  ]);
  assert.equal(waited,first,'The shared deadline settles without waiting for the response body');
 }finally{
  clearTimeout(watchdog);
  finishLate?.(payload(520));
 }
 let backwardRequests=0;
 const best=payload(128);
 const regressed=await continueC1ReadOnlyScan({initial:best,scanOf,next:async()=>payload(++backwardRequests===1?64:32)});
 assert.equal(regressed,best,'Repeated worker regressions cannot discard the highest valid partial receipt');
 assert.equal(backwardRequests,2,'Backward progress is eligible for one continuation within the existing budget');
 let interruptedRequests=0;
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>{interruptedRequests++;throw Error('interrupted response');}}),/interrupted response/);
 assert.equal(interruptedRequests,1,'Uncertain/interrupted responses are not automatically replayed');
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(520,{identity:'different-accepted-source'})}),/accepted scan source changed/i);
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(521,{total:521})}),/accepted scan source changed/i);
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(16,{complete:true})}),/complete|progress|scan/i,'A false complete receipt cannot bypass full-source visitation');
 const legacy={ready:true};assert.equal(await continueC1ReadOnlyScan({initial:legacy,scanOf:()=>null,next:async()=>{throw Error('No legacy continuation');}}),legacy);
 assert.equal(await continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>legacy}),first,'A missing continuation receipt cannot finish a verified source scan');
 const missingCompletion=payload(520);delete missingCompletion.scan.complete;
 assert.equal(await continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>missingCompletion}),first,'Counts alone cannot imply a complete proof');
 console.log('PASS: full 520-name continuation, strict in-flight budget, one worker regression retry, exact proof, stale owners and zero financial POST replays.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
