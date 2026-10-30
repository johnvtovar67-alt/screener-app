const assert=require('node:assert/strict');
const l=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const {c1ClientReleaseState:compare,installC1ClientReleaseGuard:install,observeC1ClientMutation:observe}=l.load('lib/c1ClientRelease.js');
const old='a'.repeat(40),next='b'.repeat(40),remote={buildCommit:next,clientProtocol:1,project:'screener-app-cq5t',environment:'production'};
class Target{constructor(){this.listeners=new Map();}addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}emit(type,detail={}){for(const fn of this.listeners.get(type)||[])fn(detail);}}
function fixture(options={}){const win=new Target(),doc=new Target(),stored=new Map(),timers=new Map(),nodes=new Set(),notices=[];let serial=0,navigations=0,calls=0;
 win.sessionStorage={getItem:key=>stored.get(key)||null,setItem:(key,v)=>stored.set(key,v)};doc.contains=node=>nodes.has(node);doc.visibilityState='visible';
 const setTimer=(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimer=id=>timers.delete(id);
 const guard=install({window:win,document:doc,clientCommit:old,environment:'production',clock:()=>10000,setTimer,clearTimer,
  onNotice:text=>notices.push(text),navigate:()=>navigations++,fetcher:async()=>{calls++;return new Response(JSON.stringify(options.remote||remote));},...options});
 return {win,doc,guard,stored,nodes,notices,setTimer,clearTimer,get navigations(){return navigations;},get calls(){return calls;},flush(limit=100){for(const[id,t]of [...timers])if(t.delay<=limit){timers.delete(id);t.fn();}}};}
async function main(){
 assert.equal(compare(old,{...remote,buildCommit:old}),'ALIGNED');assert.equal(compare(old,remote),'UPDATE_REQUIRED');
 for(const patch of [{buildCommit:'invalid'},{clientProtocol:2},{environment:'preview'},{project:'wrong'}])assert.equal(compare(old,{...remote,...patch}),'UNVERIFIED');
 const aligned=fixture({remote:{...remote,buildCommit:old}});await aligned.guard.check();aligned.flush();assert.equal(aligned.navigations,0);
 const update=fixture();await update.guard.check();update.flush();update.flush();assert.equal(update.navigations,1);assert.equal(update.stored.size,1);
 const loop=fixture();loop.stored.set('c1-client-release-attempt:'+next,'9999');await loop.guard.check();loop.flush();assert.equal(loop.navigations,0,'A stale page cannot create a navigation loop');
 const busy=fixture();busy.win.emit('c1-refresh-busy',{detail:true});await busy.guard.check();busy.flush();assert.equal(busy.navigations,0);busy.win.emit('c1-refresh-busy',{detail:false});busy.flush();assert.equal(busy.navigations,1);
 const dirty=fixture(),input={tagName:'INPUT',type:'text',value:'100',defaultValue:'100'};dirty.nodes.add(input);dirty.doc.emit('focusin',{target:input});input.value='PRIVATE_DRAFT_SENTINEL';dirty.doc.emit('input',{target:input});
 await dirty.guard.check();dirty.flush();assert.equal(dirty.navigations,0);assert.doesNotMatch(JSON.stringify([...dirty.stored,...dirty.notices]),/PRIVATE_DRAFT/);
 input.value='100';dirty.doc.emit('input',{target:input});dirty.flush();assert.equal(dirty.navigations,1,'Reverting a draft permits the requested update');
 const removed=fixture(),node={...input};removed.nodes.add(node);removed.doc.emit('focusin',{target:node});node.value='200';removed.doc.emit('input',{target:node});await removed.guard.check();removed.flush();assert.equal(removed.navigations,0);removed.nodes.delete(node);removed.doc.emit('click',{});removed.flush();assert.equal(removed.navigations,1,'Saved/closed editors do not permanently hold an update');
 const writing=fixture(),finish=writing.guard.beginMutation();await writing.guard.check();writing.flush();assert.equal(writing.navigations,0);finish({unconfirmed:true});writing.flush();assert.equal(writing.navigations,0);writing.win.emit('c1-account-read-observed');writing.flush();assert.equal(writing.navigations,1,'An explicit verified account read resolves the uncertain-response update barrier');
 let controller,settlements=[];const response=new Response(new ReadableStream({start(c){controller=c;}}));
 const observed=observe(Promise.resolve(response),state=>settlements.push(state),{setTimer:writing.setTimer,clearTimer:writing.clearTimer});assert.equal(await observed,response);assert.equal(settlements.length,0,'Headers cannot finish a save observation');
 controller.enqueue(new TextEncoder().encode('PRIVATE_BODY_SENTINEL'));controller.close();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(settlements.length,1);assert.equal(settlements[0].unconfirmed,false);assert.equal(await response.text(),'PRIVATE_BODY_SENTINEL','The original response is unconsumed and unchanged');
 const timeout=fixture(),states=[];let retries=0;await observe(Promise.resolve(new Response(new ReadableStream({start(){}}))),s=>states.push(s),{setTimer:timeout.setTimer,clearTimer:timeout.clearTimer,timeoutMs:20});timeout.flush();assert.equal(states[0].unconfirmed,true);assert.equal(retries,0);
 // Reproduce the mobile post-header stall against the actual helper. A
 // deadline must settle without awaiting a permanently unresolved body.
 let versionReads=0;
 const stalled=fixture({fetcher:async url=>{assert.equal(url,'/api/version');versionReads++;return versionReads===1?{ok:true,json:()=>new Promise(()=>{})}:new Response(JSON.stringify(remote));}});
 let settled=false;const pending=stalled.guard.check().then(value=>{settled=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));stalled.flush(10000);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(settled,true,'A version response body cannot hold release detection indefinitely');assert.equal(await pending,'UNVERIFIED');assert.equal(stalled.navigations,0);
 assert.equal(await stalled.guard.check(),'UPDATE_REQUIRED','A later explicit check can recover after the old body expires');stalled.flush();assert.equal(versionReads,2);assert.equal(stalled.navigations,1);stalled.guard.destroy();
 const gone=fixture();gone.guard.destroy();assert.equal(await gone.guard.check(),'UNVERIFIED');assert.equal(gone.calls,0);
 const failed=fixture({fetcher:async()=>{throw Error('PRIVATE_FETCH_SENTINEL');}});assert.equal(await failed.guard.check(),'UNVERIFIED');failed.flush();assert.equal(failed.navigations,0);
 for(const f of [aligned,update,loop,busy,dirty,removed,writing,timeout,failed])f.guard.destroy();
 console.log('PASS: immutable client identity, explicit/start/focus release checks, safe deferred navigation for edits and full write bodies, read resolution after uncertainty, one navigation without loops, no draft data storage and no mutation replay.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
