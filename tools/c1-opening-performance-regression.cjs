const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const loader=createResearchModuleLoader(process.cwd()),market=loader.load('lib/marketSession.js');
const {readC1CurrentEventEvidence}=loader.load('lib/c1CurrentEventEvidence.js');
const fixedNow='2026-09-30T15:00:00Z',NativeDate=Date;
class FixedDate extends NativeDate{constructor(value){super(value===undefined?fixedNow:value)}static now(){return NativeDate.parse(fixedNow)}}
const source=fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const context={...market,Date:FixedDate,Map,console,process,URL,URLSearchParams,AbortSignal,Response,setTimeout,clearTimeout,
 C1_LIVE_UNIVERSES:{sp500:{endpoint:'sp500-constituent'}},
 c1LiveMembers:(universe,rows)=>rows.map(row=>({symbol:row.symbol,name:row.name,sector:row.sector})).sort((a,b)=>a.symbol.localeCompare(b.symbol)),
 normalizeHistoricalBars:rows=>rows.map(row=>({...row,adjusted:true}))};
require('./c1-provider-transport-seams.cjs').installProviderTransport(context);
vm.createContext(context);vm.runInContext(source+'\nglobalThis.collect=collectC1AccountOpening;',context);
const collectC1AccountOpening=context.collect;

const now=new FixedDate(fixedNow),date='2026-09-29';
const required=['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ'];
const universe=[...required,...Array.from({length:480},(_,i)=>`X${String(i).padStart(3,'0')}`)];
const members=universe.map(symbol=>({symbol,sector:'Technology',name:symbol}));
const baseline={date,universeSymbols:universe,prices:required.map(symbol=>({symbol,open:99,high:101,low:98,close:100,adjusted:true})),signals:required.map(symbol=>({symbol,sector:'Technology'}))};
const calls=[],timestamp=now.getTime()/1000;let activeAnchors=0,maxActiveAnchors=0;
const response=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
async function fetcher(raw){
 const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1];calls.push(endpoint);
 if(endpoint==='sp500-constituent')return response(members);
 if(endpoint==='batch-quote'){
  const symbols=url.searchParams.get('symbols').split(',');
  assert.deepEqual(JSON.parse(JSON.stringify(symbols)),required,'The opening provider batches exactly the required symbols');
  return response(symbols.map(symbol=>({symbol,timestamp,open:100,price:101})));
 }
 if(endpoint==='quote')throw new Error('Individual quote requests must not return');
 if(endpoint==='historical-price-eod/dividend-adjusted'){
  activeAnchors++;maxActiveAnchors=Math.max(maxActiveAnchors,activeAnchors);
  await new Promise(resolve=>setTimeout(resolve,5));activeAnchors--;
  return response([{date,open:99,high:101,low:98,close:100,volume:1000000}]);
 }
 throw new Error('Unexpected endpoint '+endpoint);
}

(async()=>{
 const eventCalls=[],eventEvidence=currentEventEvidenceFor(required,now);
 const collectEvents=async(symbols,options)=>{eventCalls.push({symbols:[...symbols],options});return new Map(eventEvidence.map(risk=>[risk.symbol,risk]));};
 const opening=await collectC1AccountOpening({baseline,symbols:required,now,fetcher,apiKey:'fixture',collectEvents});
 assert.equal(opening.prices.length,required.length);
 assert(opening.prices.every(price=>price.open===100&&price.observedPrice===101),'Current event collection preserves the supplied quote values');
 assert.equal(calls.filter(x=>x==='batch-quote').length,1);
 assert.equal(calls.filter(x=>x==='quote').length,0);
 assert.equal(calls.filter(x=>x==='historical-price-eod/dividend-adjusted').length,required.length);
 assert.equal(calls.filter(x=>x==='sp500-constituent').length,2);
 assert(maxActiveAnchors>3&&maxActiveAnchors<=8,'Adjusted anchors use bounded parallelism above the old three-worker bottleneck');
 assert.equal(eventCalls.length,1,'The opening collects current event evidence once, independently of quotes and anchors');
 assert.deepEqual(eventCalls[0].symbols,required,'Only the requested symbols receive current event collection');
 assert.equal(eventCalls[0].options.fetcher,fetcher,'Event collection uses the controlled request fetcher');
 assert.equal(eventCalls[0].options.apiKey,'fixture');
 assert.equal(eventCalls[0].options.deadlineMs,now.getTime()+30000,'Current event collection has a finite request deadline');
 assert.deepEqual(JSON.parse(JSON.stringify(opening.currentEventEvidence)),eventEvidence,'The opening retains the supplied current event receipts');
 for(const risk of opening.currentEventEvidence)assert.equal(readC1CurrentEventEvidence(risk,now),'VERIFIED_CLEAR','Offline event receipts satisfy the real current-evidence contract');
 console.log('PASS: C1 opening uses one FMP batch quote, bounded eight-way adjusted anchors, two membership observations, and one current event collection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
