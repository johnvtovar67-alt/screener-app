const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {mergeC1AccountPortfolio}=createResearchModuleLoader(process.cwd()).load('lib/c1AccountPortfolio.js');
const page=fs.readFileSync('pages/index.js','utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const core=[{symbol:'MSTR',shares:10,avgCost:100,role:'Core',openedAt:'2026-01-02',note:'retain'},
 {symbol:'SWVXX',shares:900,avgCost:1,role:'Core'},
 {symbol:'CASH',shares:200,avgCost:1,role:'Core'}];
const portfolio=[...core,{symbol:'VMFXX',shares:1500,avgCost:1,role:'Swing'},
 {symbol:'TEST',shares:5,avgCost:100,openedAt:'2026-09-01',role:'Swing'}];
const decision={positions:[{symbol:'TEST',shares:3,avgCost:100,openedAt:'2026-09-01'}],actualCash:1698,executable:false};
const before=JSON.stringify(portfolio);
const merged=mergeC1AccountPortfolio(portfolio,decision);
assert.deepEqual(plain(merged.filter(p=>p.role==='Core')),core);
assert.equal(merged.find(p=>p.role==='Swing'&&p.symbol==='VMFXX').shares,1698);
assert.equal(merged.filter(p=>p.symbol==='CASH').length,1);
assert.equal(JSON.stringify(portfolio),before);
assert.throws(()=>mergeC1AccountPortfolio(core,decision),/Swing cash/);

function extract(from,to){const a=page.indexOf(from),b=page.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return page.slice(a,b);}
const refresh=extract('  async function refreshC1Account(','  async function startC1Account(');
const save=extract('  async function saveC1Activity(','  const[transactionCheck');
const disconnect=extract('  function disconnectSync(','  async function copySyncKey(');
function client(fetcher){
 const state={view:{decision:{id:'previous'}},error:'',key:'test-only-key',writes:0};
 const box={accountRequestId:{current:0},SYNC_KEY:'key',
  localStorage:{getItem:()=>state.key,removeItem:()=>{state.key='';},setItem:()=>{state.writes++;}},
  fetch:fetcher,setAccountView:v=>{state.view=v;},setAccountError:v=>{state.error=v;},
  setSyncKey(){},setSyncInput(){},setSyncStatus(){}};
 vm.createContext(box);vm.runInContext(refresh+disconnect+'\nthis.refresh=refreshC1Account;this.disconnect=disconnectSync;',box);
 return {state,box};
}
(async()=>{
 for(const fetcher of [
  async()=>{throw new Error('Network unavailable');},
  async()=>({ok:true,json:async()=>{throw new SyntaxError('Invalid JSON');}}),
  async()=>({ok:false,status:401,json:async()=>({error:'Account rejected'})})
 ]){
  const {state,box}=client(fetcher);
  await assert.rejects(box.refresh());
  assert.equal(state.view,null,'Failed account request must remove the previous decision and opening plan');
  assert.equal(state.writes,0);
 }
 let calls=0;
 const missing=client(async()=>{calls++;});missing.state.key='';
 await missing.box.refresh();assert.equal(missing.state.view,null);assert.equal(calls,0);
 await assert.rejects(missing.box.refresh({operation:'record-session'}));
 const absent=client(async()=>({ok:false,status:404,json:async()=>({})}));
 await absent.box.refresh();assert.equal(absent.state.view,null);
 const latest={decision:{id:'latest',executable:false}};
 let rejectOld,resolveOld,count=0;
 const race=client(()=>++count===1?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve({ok:true,json:async()=>latest}));
 const old=race.box.refresh();await race.box.refresh();rejectOld(new Error('Older failed request'));await old;
 assert.deepEqual(race.state.view,latest,'An older failure cannot erase a newer decision');
 const switched=client(()=>new Promise(resolve=>{resolveOld=resolve;}));
 const inflight=switched.box.refresh();switched.box.disconnect();
 resolveOld({ok:true,json:async()=>latest});await inflight;
 assert.equal(switched.state.view,null,'Disconnect must cancel a pending account response');

 // Execute the actual Save handler with confirmed synthetic account output.
 // No real account, API, storage credential, model replay or provider is used.
 const writes=[],synced=[],analyzed=[];
 const risk={highWater:9000,triggerDay:'2026-09-01'};
 const box={portfolio:plain(portfolio),mergeC1AccountPortfolio,KEY:'portfolio',
  refreshC1Account:async()=>({decision}),localStorage:{setItem:(k,v)=>writes.push({k,value:JSON.parse(v)}),getItem:()=>JSON.stringify(risk)},
  setAccountBusy(){},setErr(){},setPortfolio(){},setResults(){},setAnalysisCapitalReady(){},
  pushCloudPortfolio:async p=>synced.push(plain(p)),analyze:async p=>analyzed.push(plain(p))};
 vm.createContext(box);vm.runInContext(save+'\nthis.save=saveC1Activity;',box);
 await box.save({complete:true,fills:[]},0);
 for(const result of [writes[0].value,synced[0],analyzed[0]]){
  assert.deepEqual(result.filter(p=>p.role==='Core'),core,'All save destinations must retain Core balances');
  assert.equal(result.find(p=>p.role==='Swing'&&p.symbol==='VMFXX').shares,1698);
 }
 assert.equal(writes.length,1);assert.equal(writes[0].k,'portfolio','The save must not reset the capital-risk record');
 assert.equal(JSON.stringify(portfolio),before);
 console.log('PASS: Core cash/holdings preserved through account save; failed refreshes invalidate stale decisions; superseded errors and disconnected responses cannot replace current account state. Synthetic client checks only.');
})().catch(error=>{console.error(error);process.exitCode=1;});


// Owner-requested presentation: no repeated research disclosures in the account UI.
assert.ok(!page.includes('aria-label="C1 account status"'));
assert.ok(!page.includes('alpha is not certified.'));
assert.ok(page.includes('<C1AccountDifferences decision={accountView.decision}'));
console.log('PASS: Research disclosures removed; actionable account differences remain visible.');
