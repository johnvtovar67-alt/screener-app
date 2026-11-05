const {performance}=require('node:perf_hooks');

// CI workers can schedule Chrome slowly. Wait once for the same readiness
// evidence, with a monotonic deadline; never restart or retry the browser.
async function waitForBrowserStartup({process:child,isReady,timeoutMs=60000,
 now=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const started=now();let spawnError=null;
 const onError=error=>{spawnError=typeof error?.code==='string'?error.code:'SPAWN_FAILED';};
 child.on('error',onError);
 try{
  for(;;){
   const elapsedMs=Math.max(0,now()-started),exitCode=child.exitCode??null,signal=child.signalCode??null;
   const result=(ready,reason)=>({ready,reason,elapsedMs,timeoutMs,exitCode,signal,spawnError});
   if(spawnError)return result(false,'SPAWN_ERROR');
   if(exitCode!==null||signal!==null)return result(false,'PROCESS_EXITED');
   if(elapsedMs>=timeoutMs)return result(false,'STARTUP_TIMEOUT');
   if(isReady())return result(true,'READY');
   await pause(Math.min(50,timeoutMs-elapsedMs));
  }
 }finally{child.removeListener('error',onError);}
}

module.exports={waitForBrowserStartup};
