// Real collector -> immutable correction overlay -> real projection -> review.
// All accounts, prices, membership and events are synthetic; no live I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {restore}=require('./c1-opening-quote-repair-seams.cjs');
const NativeDate=Date,at='2026-10-15T17:00:00.000Z';
class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}}
global.Date=FixedDate;global.fetch=async()=>{throw Error('Live network forbidden');};
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){const f=createWorkflowFixture();f.setCash(5000);const baseline=f.sessions[220],bySymbol=new Map(baseline.signals.map(s=>[s.symbol,s]));const members=baseline.universeSymbols.map(symbol=>({symbol,name:symbol,sector:bySymbol.get(symbol).sector}));for(let i=0;members.length<490;i++)members.push({symbol:'ZZQUOTE'+i,name:'Synthetic',sector:'Synthetic'});for(const s of f.sessions)s.universeSymbols=members.map(m=>m.symbol);return {f,baseline,members};}
function collector(h,{old=false,correction=100,missing=false,stale=false}={}){
 const {f,baseline,members}=h,file='lib/c1AccountOpeningProvider.js';let source=fs.readFileSync(file,'utf8');if(old)source=restore(file,source);
 source=source.replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const box={...f.loader.load('lib/marketSession.js'),...f.loader.load('lib/c1LiveInput.js'),normalizeHistoricalBars:f.loader.load('lib/fmpPriceBars.js').normalizeHistoricalBars,Date:FixedDate,console:{info(){}},process:{env:{}},URLSearchParams,AbortSignal,fetch:global.fetch};
 require('./c1-provider-transport-seams.cjs').installProviderTransport(box);vm.createContext(box);vm.runInContext(source+';globalThis.collect=collectC1AccountOpening;',box);
 const calls={batch:[],anchors:[],membership:0,events:[]};
 const collect=async args=>box.collect({...args,apiKey:'offline-quote-set-fixture',collectEvents:async symbols=>{calls.events.push([...symbols]);return new Map(currentEventEvidenceFor(symbols,f.now).map(r=>[r.symbol,r]));},fetcher:async raw=>{
  const u=new URL(raw),endpoint=u.pathname.split('/stable/')[1];assert.equal(u.searchParams.get('apikey'),'offline-quote-set-fixture');
  if(endpoint==='sp500-constituent'){calls.membership++;return new Response(JSON.stringify(members));}
  if(endpoint==='batch-quote'){const symbols=u.searchParams.get('symbols').split(',');calls.batch.push(symbols);return new Response(JSON.stringify(symbols.filter(s=>!(missing&&s==='JJJ')).map(symbol=>({symbol,open:symbol==='DELL'?500:100,price:symbol==='DELL'?500:100,timestamp:f.now.getTime()/1000-(stale&&symbol==='JJJ'?121:0)}))));}
  if(endpoint==='historical-price-eod/dividend-adjusted'){const symbol=u.searchParams.get('symbol');calls.anchors.push(symbol);const p=baseline.prices.find(p=>p.symbol===symbol);assert(p);return new Response(JSON.stringify([{...p,...(symbol==='MRNA'?{close:correction}: {})}]));}
  throw Error('Unexpected synthetic endpoint '+endpoint);
 }});
 return {collect,calls};
}
function prepare(h,old=false){const file=path.resolve('lib/c1AccountExecutionView.js');let source=fs.readFileSync(file,'utf8');if(old)source=restore('lib/c1AccountExecutionView.js',source);const imports={};source=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,request)=>{const values=h.f.loader.load(request,file);for(const name of spec.split(',').map(s=>s.trim())){assert.notEqual(values[name],undefined);imports[name]=values[name];}return '';}).replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');const box={...imports,Date:FixedDate,process:{env:{}},console:{warn(){}}};vm.createContext(box);vm.runInContext(source+';globalThis.prepare=prepareC1AccountExecution;',box);return box.prepare;}
async function run(options={},old=false){const h=fixture(),c=collector(h,{...options,old}),bytes=JSON.stringify({account:h.f.account,book:h.f.book});const v=await prepare(h,old)({account:h.f.account,book:h.f.book,now:h.f.now,collectOpening:c.collect,includePurchaseDiagnostics:true});assert.equal(JSON.stringify({account:h.f.account,book:h.f.book}),bytes);assert.equal(h.f.writes,0);return {...h,...c,v};}
(async()=>{
 const before=await run({correction:99.9},true);assert.equal(before.v.openingError,'Missing opening quote: JJJ');assert(!before.calls.batch.flat().includes('JJJ'));
 const after=await run({correction:99.9});assert(after.calls.batch.flat().includes('JJJ'));assert.equal(after.calls.batch.length,2);assert.equal(after.calls.anchors.filter(s=>s==='JJJ').length,1);assert.equal(after.calls.membership,2);assert.equal(after.calls.events.length,1);assert(after.calls.events[0].includes('JJJ'));assert.match(after.v.openingError,/Price revision requires review: the revised close changes opening orders or limits/);assert.equal(after.v.openingPlan,null);assert.equal(after.v.manualRecommendations.orders.length,0,'A genuine changed plan stays paused');
 for(const correction of [100,99.99]){const a=await run({correction},true),b=await run({correction});assert.equal(b.v.openingError,null);assert(b.v.openingPlan);for(const key of ['orders','blockedOrders','entryReviews','openingBooks','projectedBooks','riskBySleeve','additionalSwingCapacity','sourceReceipt'])assert.deepEqual(clone(b.v.openingPlan[key]),clone(a.v.openingPlan[key]),key);assert.deepEqual(b.calls,a.calls,'No extra requests when coverage already agrees');}
 for(const option of [{missing:true},{stale:true}]){const b=await run({correction:99.9,...option});assert.match(b.v.openingError,/Fresh opening quote missing for JJJ|Opening market-data response was empty/);assert.equal(b.v.openingPlan,null);assert.equal(b.v.manualRecommendations.orders.length,0);}
 const h=fixture(),c=collector(h);const initial=h.f.service.deriveC1AccountAnalysis({account:h.f.account,book:h.f.book,now:h.f.now}).decision.requiredOpeningSymbols;let round=0;
 await assert.rejects(()=>c.collect({baseline:h.baseline,symbols:initial,now:h.f.now,allowPriceRevisionReview:true,resolveSymbols:()=>[...initial,...['JJJ','KKK','DELL'].slice(0,++round)]}),/requirements did not stabilize/);assert.equal(c.calls.batch.length,3);assert.equal(c.calls.events.length,0,'Unstable coverage cannot reach event/purchase verification');
 console.log('PASS: actual missing-JJJ reproduction, bounded supplemental quotes/anchors/events, unchanged full plan/request parity, genuine price differences and missing/stale/unstable coverage remain paused; immutable account/input and zero writes');
})().catch(e=>{console.error(e);process.exitCode=1;});
