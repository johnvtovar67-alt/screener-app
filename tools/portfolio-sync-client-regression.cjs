const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('pages/index.js','utf8');
const source=page.slice(page.indexOf('  async function pushCloudPortfolio('),page.indexOf('  function newSyncKey()'));
const disconnect=page.slice(page.indexOf('  function disconnectSync('),page.indexOf('  async function copySyncKey('));
function client(fetch){
 const saved=new Map([['key','synthetic-key'],['portfolio','[]']]),state={rows:[],status:''};
 const box={fetch,Date,SYNC_KEY:'key',KEY:'portfolio',C1_DRAWDOWN_KEY:'risk',syncKey:'synthetic-key',c1Control:{},
  syncQueue:{current:Promise.resolve()},syncRevision:{current:{key:'synthetic-key',etag:'v1'}},syncPullId:{current:0},syncWriteId:{current:0},syncDirty:{current:false},accountRequestId:{current:0},
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  setSyncStatus:v=>state.status=v,setPortfolio:v=>state.rows=v,setAccountView(){},setAccountAbsent(){},setAccountError(){},setSyncKey(){},setSyncInput(){}};
 vm.createContext(box);vm.runInContext(source+disconnect+'\nthis.push=pushCloudPortfolio;this.pull=pullCloudPortfolio;this.refresh=refreshEnteredPortfolio;this.disconnect=disconnectSync;',box);
 return {box,state,saved};
}
(async()=>{
 const requests=[];let finish;
 const queued=client(async(url,options)=>{
  requests.push(JSON.parse(options.body));
  if(requests.length===1)await new Promise(resolve=>finish=resolve);
  return {ok:true,json:async()=>({etag:'v'+(requests.length+1)})};
 });
 const one=queued.box.push([{symbol:'AAA',shares:1}]),two=queued.box.push([{symbol:'AAA',shares:2}]);
 await Promise.resolve();assert.equal(requests.length,1,'Concurrent edits must serialize');finish();
 assert.equal(await one,true);assert.equal(await two,true);
 assert.deepEqual(requests.map(r=>r.expectedEtag),['v1','v2']);assert.equal(queued.box.syncRevision.current.etag,'v3');
 assert.equal(queued.box.syncDirty.current,false);
 let gets=0;
 const conflict=client(async(url,options)=>{if(options.method!=='PUT')gets++;return {ok:false,status:409,json:async()=>({})};});
 assert.equal(await conflict.box.push([{symbol:'AAA',shares:5}]),false);
 assert.equal(await conflict.box.refresh(),null);assert.equal(gets,0,'Reload cannot erase a pending conflicting local edit');
 assert.match(conflict.state.status,/Sync conflict/);
 for(const change of ['edit','disconnect']){
  let resolve;
  const c=client(()=>new Promise(r=>resolve=r));const pending=c.box.pull('synthetic-key');
  if(change==='edit')c.saved.set('portfolio','[{"symbol":"LOCAL"}]');else c.box.disconnect();
  resolve({ok:true,json:async()=>({portfolio:[{symbol:'REMOTE'}],etag:'v2'})});
  assert.equal(await pending,false);assert.deepEqual(c.state.rows,[],'A late pull cannot replace local edits or disconnected state');
 }
 const remote=[{symbol:'AAA',shares:50,avgCost:100,role:'Swing'}];
 const c=client(async()=>({ok:true,json:async()=>({portfolio:remote,etag:'v2',c1ControlState:{highWater:10000}})}));
 const current=await c.box.refresh();assert.equal(JSON.stringify(current),JSON.stringify(remote));
 assert.equal(c.box.syncRevision.current.etag,'v2');assert.ok(c.saved.has('stock_screener_portfolio_before_sync_v1'));
 console.log('PASS: serialized client edits use latest versions; conflicts preserve local edits; late pulls cannot replace edited/disconnected state; manual refresh loads current cloud holdings.');
})().catch(error=>{console.error(error);process.exitCode=1;});
