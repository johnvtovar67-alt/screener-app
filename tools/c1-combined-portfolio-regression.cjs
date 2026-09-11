const assert=require('node:assert/strict'),fs=require('node:fs'),z=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {c1CombinedPortfolio:combine}=loader.load('lib/c1CombinedPortfolio.js');
const {createC1SleeveAccounting:create,applyC1SleeveFill:apply,C1_ACCOUNTING_WEIGHTS:weights}=loader.load('lib/c1SleeveAccounting.js');
let checks=0;
for(const universe of ['nasdaq','sp500']){
 const runs=JSON.parse(z.gunzipSync(Buffer.from(fs.readFileSync(`tools/fixtures/c1-${universe}-accounting.json.gz.base64`,'utf8'),'base64')));
 let state=create(100000,runs[0].curve[0].date),maxNames=0;
 const indices=Object.fromEntries(runs.map(r=>[r.id,0]));
 for(let day=0;day<runs[0].curve.length;day++){
  const date=runs[0].curve[day].date,marks={};let expectedCash=0,expectedEquity=0;
  for(const r of runs){
   const w=weights[r.id],point=r.curve[day];assert.equal(point.date,date);
   for(const [s,p] of Object.entries(point.marks)){if(s in marks)assert.equal(marks[s],p);marks[s]=p;}
   expectedCash+=point.cash*w;expectedEquity+=point.equity*w;
   while(indices[r.id]<r.trades.length&&r.trades[indices[r.id]].date<=date){
    const i=indices[r.id]++,t=r.trades[i];state=apply(state,{...t,id:r.id+':'+i,sleeve:r.id,shares:t.shares*w});
   }
  }
  const combined=combine(state,marks,date);maxNames=Math.max(maxNames,combined.positions.length);
  assert.ok(Math.abs(combined.cash-expectedCash)<.02);assert.ok(Math.abs(combined.equity-expectedEquity)<.03);
  assert.ok(Math.abs(combined.cashWeightPct+combined.positions.reduce((a,p)=>a+p.observedWeightPct,0)-100)<1e-8);
  for(const p of combined.positions)assert.ok(Math.abs(Object.values(p.sleeveShares).reduce((a,n)=>a+n,0)-p.virtualShares)<1e-8);
  assert.equal(combined.executable,false);assert.equal(combined.orders.length,0);checks++;
 }
 assert.equal(maxNames,universe==='nasdaq'?6:7,'No top-three truncation');
}
let state=create(100000,'2026-03-02');state=apply(state,{id:'one',sleeve:'base',date:'2026-03-03',symbol:'TEST',side:'buy',shares:10,price:100});
assert.throws(()=>combine(state,{},'2026-03-03'),/Missing mark/);
assert.throws(()=>combine(state,{TEST:100},'2026-03-02'),/future fills/);
const corrupt=JSON.parse(JSON.stringify(state));corrupt.sleeves.base.cash=999999;
assert.equal(combine(corrupt,{TEST:100},'2026-03-03').cash,99000,'Replay fills instead of cached balance');
console.log(`PASS: combined portfolio matches ${checks} historical sessions across both universes; 6/7 names preserved; no orders inferred`);
