// Re-reads frozen, previously inspected artifacts. Does not simulate, select,
// retune or create new holdout evidence.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const weights={base:.25,cooldown15:.5,sector40:.25};
const expectedReturns={nasdaq:268.65228,sp500:380.7204925};
const results={};
for(const universe of Object.keys(expectedReturns)){
 const bytes=fs.readFileSync(`tools/fixtures/c1-${universe}-accounting.json.gz.base64`);
 const runs=JSON.parse(gunzipSync(Buffer.from(bytes.toString(),'base64')));
 assert.equal(runs.length,3);assert.deepEqual(runs.map(r=>r.id).sort(),Object.keys(weights).sort());
 const dates=runs[0].curve.map(p=>p.date),curve=dates.map(date=>({date,equity:0,cash:0}));
 const realizations=[];
 for(const run of runs){
  const w=weights[run.id];assert.deepEqual(run.curve.map(p=>p.date),dates);
  run.curve.forEach((p,i)=>{curve[i].equity+=p.equity*w;curve[i].cash+=p.cash*w;});
  const positions=new Map();
  for(const t of run.trades){
   assert.ok(Number.isFinite(t.price)&&t.price>=0&&t.shares>0);
   if(t.side==='buy'){
    const p=positions.get(t.symbol)||{shares:0,cost:0};p.shares+=t.shares;p.cost+=t.shares*t.price;positions.set(t.symbol,p);
   }else{
    assert.equal(t.side,'sell');const p=positions.get(t.symbol);assert.ok(p&&p.shares>=t.shares);
    const cost=p.cost/p.shares*t.shares,pnl=t.shares*t.price-cost;
    realizations.push({book:run.id,date:t.date,weightedPnl:pnl*w,returnPct:pnl/cost*100});
    p.shares-=t.shares;p.cost-=cost;if(!p.shares)positions.delete(t.symbol);
   }
  }
  assert.equal(positions.size,0,'Frozen fixture includes terminal liquidation; all lots must reconcile');
 }
 let peak=100000,dd=0;for(const p of curve){assert.ok(p.equity>0&&p.cash>=0&&p.cash<=p.equity+.02);peak=Math.max(peak,p.equity);dd=Math.min(dd,(p.equity/peak-1)*100);}
 const total=(curve.at(-1).equity/100000-1)*100;assert.ok(Math.abs(total-expectedReturns[universe])<.0001,'Match saved cost receipt');
 const wins=realizations.filter(t=>t.weightedPnl>0).reduce((a,t)=>a+t.weightedPnl,0),losses=-realizations.filter(t=>t.weightedPnl<0).reduce((a,t)=>a+t.weightedPnl,0);
 assert.ok(Math.abs(wins-losses-(curve.at(-1).equity-100000))<.02,'Trade P&L must equal final equity gain');
 const annual=[];let previous=100000;
 for(const year of [...new Set(dates.map(d=>d.slice(0,4)))]){
  const points=curve.filter(p=>p.date.startsWith(year)),ending=points.at(-1).equity;
  annual.push({year,start:points[0].date,end:points.at(-1).date,returnPct:(ending/previous-1)*100});previous=ending;
 }
 results[universe]={fixtureSha256:createHash('sha256').update(bytes).digest('hex'),start:dates[0],end:dates.at(-1),sessions:dates.length,totalReturnPct:total,maxDrawdownPct:dd,
  weightedRealizedProfitFactor:losses?wins/losses:null,bookRealizations:realizations.length,weightedDollarsPerBookRealization:(wins-losses)/realizations.length,
  meanBookRealizationReturnPct:realizations.reduce((a,t)=>a+t.returnPct,0)/realizations.length,
  averageInvestedPct:curve.reduce((a,p)=>a+(1-p.cash/p.equity)*100,0)/curve.length,
  annualDiagnostic:annual};
}
const report={scope:'frozen historical ledger audit',newBacktest:false,newHoldout:false,prospectiveRequirementWaivedByUser:true,eligibleForLiveCapital:false,
 methodology:'Weighted book cash P&L; average-cost lot accounting; costs already embedded in fill prices. Book realizations overlap across sleeves and are not independent trades. Calendar returns are descriptive, not new evaluation folds. Terminal liquidation is included.',
 unresolved:['Historical data provenance and survivorship/revision safety','Benchmark superiority by original evaluation fold','Post-selection and multiple-testing evidence','Live recommendation/model equivalence','Brokerage execution reconciliation'],results};
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
