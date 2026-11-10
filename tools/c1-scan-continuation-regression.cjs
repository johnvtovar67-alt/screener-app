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
 const timedOut=await continueC1ReadOnlyScan({initial:first,scanOf,now:()=>time,budgetMs:5,next:async context=>{boundedRequests++;time=6;return payload(context.scan.completed+32);}});
 assert.equal(timedOut.scan.complete,false);assert.equal(boundedRequests,1,'Budget expiry never masquerades as no opportunities or a completed scan');
 let interruptedRequests=0;
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>{interruptedRequests++;throw Error('interrupted response');}}),/interrupted response/);
 assert.equal(interruptedRequests,1,'Uncertain/interrupted responses are not automatically replayed');
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(520,{identity:'different-accepted-source'})}),/accepted scan source changed/i);
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(521,{total:521})}),/accepted scan source changed/i);
 await assert.rejects(continueC1ReadOnlyScan({initial:first,scanOf,next:async()=>payload(16,{complete:true})}),/complete|progress|scan/i,'A false complete receipt cannot bypass full-source visitation');
 const legacy={ready:true};assert.equal(await continueC1ReadOnlyScan({initial:legacy,scanOf:()=>null,next:async()=>{throw Error('No legacy continuation');}}),legacy);
 console.log('PASS: full 520-name read-only continuation, exact source identity, one frame/budget, interrupted/stalled responses, stale competing owners, false completion and zero financial POST replays.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
