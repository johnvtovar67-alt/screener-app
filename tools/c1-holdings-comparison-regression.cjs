const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {compareC1Holdings:compare}=createResearchModuleLoader(process.cwd()).load('lib/c1HoldingsComparison.js');
const holdings=[{symbol:'NTRA',shares:34,role:'Swing'},{symbol:'FCX',shares:75,role:'Swing'},{symbol:'STX',shares:3,role:'Swing'},{symbol:'MSTR',shares:140,role:'Core'},{symbol:'CASH',shares:14000,role:'Swing'}];
const original=JSON.stringify(holdings);
const model={status:'paper-only',observedForwardSessions:0,virtualShares:{},sourceSessionDate:'2026-09-09'};
for(const m of [null,model,{...model,status:'stale',observedForwardSessions:5}]) {
 const r=compare(holdings,m);assert.equal(r.status,'model-not-ready');assert.equal(r.executable,false);assert.equal(r.orders.length,0);
 assert.equal(r.positions.length,3);assert.ok(r.positions.every(p=>p.modelPresence==='unknown'));
}
const result=compare(holdings,{...model,observedForwardSessions:1,virtualShares:{NTRA:9999,FCX:1}});
assert.equal(result.positions.map(p=>p.modelPresence).join(','),'present,present,absent');
assert.equal(result.orders.length,0);assert.equal(result.cash,14000);assert.equal(result.historicalFillsReconciled,false);
assert.equal(JSON.stringify(holdings),original);
assert.throws(()=>compare([...holdings,holdings[0]],model),/duplicate/);
assert.throws(()=>compare([{symbol:'NTRA',shares:NaN,role:'Swing'}],model),/shares/);
assert.throws(()=>compare([{symbol:'NTRA',shares:34}],model),/role/);
assert.equal(compare(holdings,{...model,observedForwardSessions:1,virtualShares:{NTRA:NaN}}).status,'model-not-ready');
console.log('C1 holdings comparison: no inferred orders, no invented fill history, empty/stale models fail closed');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('pages/api/research/c1-holdings-comparison.js','utf8').replace(/^import .*;\n/gm,'').replace('export const config','const config').replace('export default async function handler','async function handler');
let calls=0;
const box={compareC1Holdings:compare,getV11ProductionSnapshot:async()=>{calls++;return {forwardAccounting:model};}};
vm.createContext(box);vm.runInContext(code+'\nglobalThis.handle=handler;',box);
(async()=>{
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 let r=res();await box.handle({method:'GET'},r);assert.equal(r.code,405);assert.equal(calls,0);
 r=res();await box.handle({method:'POST',body:{holdings:[holdings[0],holdings[0]]}},r);assert.equal(r.code,400);assert.equal(calls,0);
 r=res();await box.handle({method:'POST',body:{holdings,forwardAccounting:{executable:true},executable:true}},r);
 assert.equal(r.code,200);assert.equal(r.body.executable,false);assert.equal(r.body.status,'model-not-ready');assert.equal(r.headers['Cache-Control'],'no-store');
 console.log('C1 comparison route: server-owned model, input validation, no client authority override');
})().catch(e=>{console.error(e);process.exitCode=1;});
// Execute the actual page's comparison block with snapshots used by Analyze.
const page=fs.readFileSync('pages/index.js','utf8');
const block=page.slice(page.indexOf('      // Reuse this analysis'),page.indexOf('      let priorControl={}'));
assert.ok(block.includes('compareC1Holdings'));
let captured;
const ui={portfolio:[{symbol:'TEST',shares:2,role:'Swing'},{symbol:'CASH',shares:100,role:'Swing'}],CASH:['CASH'],role:(s,r)=>r,compareC1Holdings:compare,screenLive:true,currentProductionPolicy:{forwardAccounting:model},setHoldingsComparison:r=>{captured=r;}};
vm.createContext(ui);vm.runInContext(block,ui);
assert.equal(captured.positions.length,1);assert.equal(captured.executable,false);assert.equal(captured.portfolioSignature,JSON.stringify(ui.portfolio));
ui.portfolio[0].shares=3;assert.notEqual(captured.portfolioSignature,JSON.stringify(ui.portfolio),'Edited holdings must invalidate the visible comparison');
ui.screenLive=false;ui.currentProductionPolicy.forwardAccounting={...model,observedForwardSessions:4,virtualShares:{TEST:2}};vm.runInContext(block,ui);assert.equal(captured.status,'model-not-ready','Cached screen fallback cannot look verified');
assert.ok(page.includes('holdingsComparison.portfolioSignature===JSON.stringify(portfolio)'));
assert.ok(!page.includes('fetch("/api/research/c1-holdings-comparison'));
console.log('C1 portfolio integration: same snapshot, edit invalidation, no additional holdings upload');
