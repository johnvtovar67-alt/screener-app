// Controlled elapsed time and process signals: no Chrome, network or real wait.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {waitForBrowserStartup}=require('./c1-browser-startup.cjs');
function fixture({readyAt=Infinity,exitAt=Infinity,signalAt=Infinity,errorAt=Infinity}={}){
 const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
 let elapsed=0,polls=0;
 return {child,get elapsed(){return elapsed;},get polls(){return polls;},
  options:{process:child,isReady:()=>elapsed>=readyAt,now:()=>elapsed,pause:async ms=>{
   assert(ms>0&&ms<=50);elapsed+=ms;polls++;
   if(elapsed>=exitAt)child.exitCode=1;
   if(elapsed>=signalAt)child.signalCode='SIGTERM';
   if(elapsed>=errorAt)child.emit('error',Object.assign(new Error('Private diagnostics excluded'),{code:'ENOENT'}));
  }}};
}
async function main(){
 for(const readyAt of [0,12000,59950]){
  const test=fixture({readyAt}),result=await waitForBrowserStartup(test.options);
  assert.equal(result.ready,true);assert.equal(result.reason,'READY');assert.equal(result.elapsedMs,readyAt);
  assert.equal(result.timeoutMs,60000);assert.equal(test.child.listenerCount('error'),0);
 }
 for(const [options,reason,elapsed]of [
  [{exitAt:150},'PROCESS_EXITED',150],[{signalAt:100},'PROCESS_EXITED',100],
  [{errorAt:50},'SPAWN_ERROR',50],[{},'STARTUP_TIMEOUT',60000],
  [{readyAt:60000},'STARTUP_TIMEOUT',60000],
  [{readyAt:100,exitAt:100},'PROCESS_EXITED',100]
 ]){
  const test=fixture(options),result=await waitForBrowserStartup(test.options);
  assert.equal(result.ready,false);assert.equal(result.reason,reason);assert.equal(result.elapsedMs,elapsed);
  assert.equal(test.child.listenerCount('error'),0);assert(!JSON.stringify(result).includes('Private diagnostics'));
 }
 // A stalled event loop cannot turn a readiness file seen after the deadline
 // into a successful start, and calendar-clock changes cannot extend the wait.
 const late=fixture({readyAt:65000});let elapsed=0;
 const result=await waitForBrowserStartup({...late.options,now:()=>elapsed,
  isReady:()=>elapsed>=65000,pause:async()=>{elapsed=65000;}});
 assert.equal(result.reason,'STARTUP_TIMEOUT');assert.equal(result.ready,false);
 console.log('PASS: browser startup waits once up to60s on monotonic elapsed time, accepts slow readiness, rejects process exits/spawn errors promptly, and retains a strict deadline.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
