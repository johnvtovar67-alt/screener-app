const commit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export function c1ClientReleaseState(loaded,remote,{environment='production'}={}){
 if(!commit(loaded)||!commit(remote?.buildCommit)||remote.clientProtocol!==1||
  remote.project!=='screener-app-cq5t'||remote.environment!==environment)return 'UNVERIFIED';
 return loaded===remote.buildCommit?'ALIGNED':'UPDATE_REQUIRED';
}

// Full navigation is a code update, never a retry of an account mutation.
// Draft values remain in their existing elements and never enter telemetry or
// storage. Navigation waits until the original edits/writes have settled.
export function installC1ClientReleaseGuard({window:win,document:doc,fetcher=win?.fetch?.bind(win),
 clientCommit,environment='production',onNotice=()=>{},onVersion=()=>{},navigate=()=>win.location.reload(),
 clock=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!win||!doc||typeof fetcher!=='function')return null;
 let stopped=false,busy=false,writes=0,uncertain=false,pending=null,inflight=null,timer=null,navigated=false;
 const baselines=new WeakMap(),dirty=new Set(),listeners=[];
 const listen=(target,type,fn,capture=false)=>{target.addEventListener(type,fn,capture);listeners.push(()=>target.removeEventListener(type,fn,capture));};
 const value=node=>node?.type==='checkbox'||node?.type==='radio'?String(node.checked):String(node?.value??'');
 const input=node=>node&&['INPUT','TEXTAREA','SELECT'].includes(node.tagName)&&!['button','submit','hidden'].includes(node.type);
 const drafts=()=>{for(const node of dirty)if(!doc.contains(node)||value(node)===baselines.get(node))dirty.delete(node);return dirty.size>0;};
 const notice=text=>{try{onNotice(text);}catch{}};
 const schedule=()=>{if(!stopped&&!timer)timer=setTimer(()=>{timer=null;attempt();},100);};
 function attempt(){
  if(stopped||!pending||navigated)return;
  if(busy||writes||uncertain||drafts()){
   notice(uncertain?'An app update is ready, but a request did not finish. Open Opportunities and tap Reload to check the saved account, then finish or cancel edits.':
    'An app update is ready. Finish or cancel edits and let saves complete; Reload will then load it.');return;
  }
  const key='c1-client-release-attempt:'+pending;
  try{const at=Number(win.sessionStorage.getItem(key));if(at&&clock()-at<600000){notice('The app update is still pending. Reopen Screener to load the latest version.');return;}
   win.sessionStorage.setItem(key,String(clock()));}catch{notice('An app update is ready. Reopen Screener to load it safely.');return;}
  navigated=true;notice('Loading the updated app…');navigate();
 }
 async function check(){
  if(stopped||!commit(clientCommit))return 'UNVERIFIED';
  if(inflight)return inflight;
  inflight=(async()=>{try{const r=await fetcher('/api/version',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!r.ok)return 'UNVERIFIED';const remote=await r.json();if(stopped)return 'UNVERIFIED';
   try{onVersion(remote);}catch{}
   const state=c1ClientReleaseState(clientCommit,remote,{environment});
   if(state==='UPDATE_REQUIRED'){pending=remote.buildCommit;schedule();}
   return state;
  }catch{return 'UNVERIFIED';}finally{inflight=null;}})();return inflight;
 }
 const focus=event=>{if(input(event.target)&&!baselines.has(event.target))baselines.set(event.target,value(event.target));};
 const edited=event=>{const node=event.target;if(!input(node))return;if(!baselines.has(node))baselines.set(node,String(node.defaultValue??''));
  if(value(node)===baselines.get(node))dirty.delete(node);else dirty.add(node);schedule();};
 listen(doc,'focusin',focus,true);listen(doc,'beforeinput',focus,true);listen(doc,'input',edited,true);listen(doc,'change',edited,true);
 listen(doc,'click',event=>{const button=event.target?.closest?.('header button');if(button&&['Reload','Reloading...'].includes(String(button.textContent||'').trim()))void check();schedule();},true);
 listen(win,'focus',()=>{void check();});
 listen(doc,'visibilitychange',()=>{if(doc.visibilityState==='visible')void check();});
 listen(win,'c1-refresh-busy',event=>{busy=event.detail===true;schedule();});
 listen(win,'c1-account-read-observed',()=>{if(!writes)uncertain=false;schedule();});
 const guard={check,beginMutation(){writes++;let ended=false;return ({unconfirmed=false}={})=>{if(ended)return;ended=true;writes=Math.max(0,writes-1);uncertain=uncertain||unconfirmed;schedule();};},
  state:()=>({busy,writes,uncertain,updatePending:Boolean(pending),drafts:dirty.size,navigated}),
  destroy(){stopped=true;if(timer)clearTimer(timer);listeners.forEach(remove=>remove());if(win.__c1ClientReleaseGuard===guard)delete win.__c1ClientReleaseGuard;}};
 win.__c1ClientReleaseGuard=guard;return guard;
}

// Drop bytes from a cloned response, without inspecting/logging financial data.
// Headers alone do not establish that an in-progress save response completed.
export function observeC1ClientMutation(promise,finish,{timeoutMs=95000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(typeof finish!=='function')return promise;
 let ended=false,timer;
 const done=unconfirmed=>{if(ended)return;ended=true;clearTimer(timer);try{finish({unconfirmed});}catch{}};
 timer=setTimer(()=>done(true),timeoutMs);
 return Promise.resolve(promise).then(response=>{
  try{const stream=response.clone().body;if(!stream){done(false);return response;}
   const reader=stream.getReader();(async()=>{try{while(!(await reader.read()).done){}done(false);}catch{done(true);}})();
  }catch{done(true);}return response;
 },error=>{done(true);throw error;});
}
