const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const loader=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const {advanceC1ForwardModel:advance,c1ForwardOperationalState:state}=loader.load('lib/c1ForwardModel.js');
const {proveC1RecordedSaleRevision:prove}=loader.load('lib/c1RecordedSaleRevision.js');
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1FrozenSimulator.js');
const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const session=date=>({date,decisionAt:date+'T22:00:00.000Z',universeSymbols:['AAA'],
 prices:['AAA','SPY','QQQ'].map(symbol=>({symbol,date,open:100,high:101,low:99,close:100,volume:10000000,adjusted:true})),
 signals:[{symbol:'AAA',sector:'SectorA',price:100,researchFactors:{momentumPercentile:100,volatility60Pct:20},
  entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}]});

// A real frozen/forward replay, with synthetic inputs and ordinary universe-
// removal opening sales. No saved production market or private account data.
function scenario(open,revisedOpen){
 let model=advance(null,[session('2026-10-28')],new Date('2026-10-28T22:00Z'),{completedCloseQueue:true});
 model=advance(model,[session('2026-10-29')],new Date('2026-10-29T22:00Z'));
 const sale=session('2026-10-30');sale.universeSymbols=[];sale.signals=[];
 sale.corporateActions=[{type:'universe-removal',symbol:'AAA',effectiveDate:sale.date}];
 Object.assign(sale.prices[0],{open,close:open,high:Math.max(open,revisedOpen)+1,low:Math.min(open,revisedOpen)-1});
 model=advance(model,[sale],new Date(sale.decisionAt));
 const prior={contract:'c1-dated-index-book-v1',universe:'sp500',model,captures:[]};prior.recordHash=digest(prior);
 const today=session('2026-11-02');today.signals=[];today.universeSymbols=[];
 Object.assign(today.prices[0],{open,close:open,high:open+1,low:open-1});
 const input={sourceSessionDate:today.date,session:today};
 const original=advance(model,[today],new Date(today.decisionAt));
 const correctedPrior=clone(model);correctedPrior.sessions.at(-1).prices[0].open=revisedOpen;
 const corrected=advance(correctedPrior,[today],new Date(today.decisionAt));
 return {prior,input,original,corrected,prices:correctedPrior.sessions.at(-1).prices};
}
const args=f=>[f.prior,f.input,f.original,f.corrected,f.prices,digest];

const benign=scenario(90,90.1),before=canonical(benign);
assert(prove(...args(benign)),'Actual replay may reconcile a fully closed opening sale when full operational state is equal');
assert.equal(canonical(state(benign.original)),canonical(state(benign.corrected)));
assert.equal(canonical(benign),before,'Proof never mutates model or input history');
assert.equal(state(clone(benign.original)),null,'Serialized/cloned results cannot invent a trusted replay receipt');
assert.equal(prove(benign.prior,benign.input,clone(benign.original),benign.corrected,benign.prices,digest),null);
assert.equal(prove(benign.prior,benign.input,benign.original,clone(benign.corrected),benign.prices,digest),null);
const detached=state(benign.original);detached.base.portfolioRiskPausedThrough=999;
detached.base.trades[0].reason='injected';
assert.equal(canonical(state(benign.original)),canonical(state(benign.corrected)),'The public getter cannot mutate the trusted WeakMap receipt');
assert(prove(...args(benign)));

const material=scenario(120,121),originalState=state(material.original),correctedState=state(material.corrected);
assert.equal(canonical(material.original.pendingBySleeve),canonical(material.corrected.pendingBySleeve));
for(const id of Object.keys(options)){
 assert.equal(Object.keys(material.original.ledger.sleeves[id].positions).length,0);
 assert.equal(Object.keys(material.corrected.ledger.sleeves[id].positions).length,0);
 assert.notEqual(originalState[id].portfolioHighWatermark,correctedState[id].portfolioHighWatermark,
  'A completely flat model can still have changed future drawdown policy state');
 assert.equal(canonical({...originalState[id],portfolioHighWatermark:null}),canonical({...correctedState[id],portfolioHighWatermark:null}),
  'This fixture isolates high-water risk state, not changed orders or trade reasons');
}
assert.equal(prove(...args(material)),null,'Equal current flat holdings and queues cannot excuse different future drawdown state');

// Negative-control dependency injection is confined to this test VM. Confirm
// the very same real replay passes all other proof gates if its state difference
// is hidden, so the regression specifically protects operational-state parity.
const imports={};
let source=fs.readFileSync('lib/c1RecordedSaleRevision.js','utf8').replace(/import\s*{([^}]+)}\s*from\s*'([^']+)';/g,(_all,names,request)=>{
 const exports=request.startsWith('node:')?require(request):loader.load('lib/'+request.slice(2)+'.js');
 for(const name of names.split(',').map(s=>s.trim()))imports[name]=exports[name];
 return '';
});
const context={...imports,c1ForwardOperationalState:()=>clone(originalState),JSON,Object,Array,Set,Number};
vm.createContext(context);vm.runInContext(source.replace(/export /g,'')+'\nthis.prove=proveC1RecordedSaleRevision;',context);
assert(context.prove(...args(material)),'Negative control: suppressing only operational evidence recreates the unsafe acceptance');

// Observation is after the simulation and receives detached data. It cannot
// alter default output, future decisions, or the caller's input/configuration.
const dataset={metadata:{},sessions:benign.original.sessions};
const config={...options.base,startDate:benign.original.simulationStartSession,endDate:'2026-11-02',liquidateAtEnd:false};
const inputBefore=canonical({dataset,config}),normal=simulate(dataset,config);let calls=0;
const observed=simulate(dataset,config,snapshot=>{
 calls++;snapshot.positions.push(['FAKE',{shares:999}]);snapshot.pending.push({side:'buy',symbol:'FAKE'});
 snapshot.trades[0].reason='injected';snapshot.portfolioRiskPausedThrough=999;
});
assert.equal(calls,1);assert.equal(canonical(normal),canonical(observed),'Observer mutation cannot alter returned simulation');
assert.equal(canonical({dataset,config}),inputBefore,'Observer mutation cannot alter inputs');
console.log('PASS: real synthetic opening-sale replay accepts identical risk state, rejects changed high-water risk despite flat holdings/queues and missing WeakMap evidence; unsafe negative control reproduced; observer/default output parity and detached snapshots verified.');
