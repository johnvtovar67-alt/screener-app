// Provider lifecycle verification only. Synthetic data, no network or financial writes.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const NativeDate=Date;
const now=new NativeDate('2026-11-11T15:00:00.000Z');
class FixedDate extends NativeDate{constructor(value){super(arguments.length?value:now);}static now(){return +now;}}
global.Date=FixedDate;
const loader=createResearchModuleLoader(process.cwd());
const {collectC1UniverseEvents,collectC1OpeningAnchorScan}=loader.load('lib/c1UniverseVerification.js');
const symbols=Array.from({length:80},(_,i)=>'S'+String(i).padStart(3,'0'));
function risk(symbol){
 const observedAt=now.toISOString(),expiresAt=new NativeDate(+now+240000).toISOString();
 return {symbol,status:'Clear',blockNewCapital:false,checkComplete:true,eventRiskVerified:true,earningsCheckComplete:true,mergerCheckComplete:true,newsCheckComplete:true,eventVerification:{contract:'c1-current-event-evidence-v1',state:'VERIFIED_CLEAR',provider:'FMP',observedAt,expiresAt,
 sources:[['EARNINGS','earnings-calendar'],['MERGERS','mergers-acquisitions-latest'],['NEWS','news/stock']].map(([kind,endpoint])=>({kind,endpoint,complete:true,reason:'OK',fetchedAt:observedAt,expiresAt}))}};
}
async function run(){
 require('./c1-opening-anchor-batch-seam.cjs').restore(fs.readFileSync('lib/c1UniverseVerification.js','utf8'));
 const cache=new Map(),calls=[];
 const collect=async batch=>{calls.push([...batch]);return new Map(batch.map(s=>[s,risk(s)]));};
 let first=await collectC1UniverseEvents({sourceIdentity:'accepted-first',symbols,collect,now,cache});
 assert.equal(first.scan.complete,false);assert.equal(first.scan.scanned,32);assert.equal(first.scan.pending,48);
 const second=await collectC1UniverseEvents({sourceIdentity:'accepted-first',symbols,collect,now,cache});
 assert.equal(second.scan.scanned,64);assert.equal(second.scan.complete,false);
 const third=await collectC1UniverseEvents({sourceIdentity:'accepted-first',symbols,collect,now,cache});
 assert.equal(third.scan.complete,true);assert.equal(third.events.size,80);assert.equal(third.scan.evidenceComplete,true);
 assert.equal(new Set(calls.flat()).size,80);assert.equal(calls.flat().length,80);
 assert(calls.every(batch=>batch.length<=32),'Provider batches remain bounded without a candidate ceiling');
 const changed=await collectC1UniverseEvents({sourceIdentity:'accepted-second',symbols,collect,now,cache});
 assert.equal(changed.scan.scanned,32,'Changed dated ownership cannot reuse an earlier completion');
 const missing=await collectC1UniverseEvents({sourceIdentity:'missing-event',symbols:['MISSING'],now,cache,collect:async()=>new Map()});
 assert.equal(missing.scan.complete,true);assert.equal(missing.scan.evidenceComplete,false);assert.deepEqual([...missing.scan.unverifiedSymbols],['MISSING']);
 let expired=await collectC1UniverseEvents({sourceIdentity:'accepted-first',symbols,collect,now:new NativeDate(+now+241000),cache});
 assert.equal(expired.scan.evidenceComplete,false);assert([...expired.events.values()].some(r=>r.blockNewCapital===true),'An expired cached clear must become a blocked Manual review');
 const interruptedCache=new Map();
 await assert.rejects(collectC1UniverseEvents({sourceIdentity:'interrupted',symbols,now,cache:interruptedCache,collect:async()=>{throw Error('interrupted');}}),/interrupted/);
 const after=await collectC1UniverseEvents({sourceIdentity:'interrupted',symbols,now,cache:interruptedCache,collect});
 assert.equal(after.scan.scanned,32,'An interrupted batch never claims completed evidence');
 const progressCache=new Map();
 await collectC1UniverseEvents({sourceIdentity:'slow-progress',symbols,now,cache:progressCache,collect});
 await collectC1UniverseEvents({sourceIdentity:'slow-progress',symbols,now:new NativeDate(+now+240000),cache:progressCache,collect});
 const progressed=await collectC1UniverseEvents({sourceIdentity:'slow-progress',symbols,now:new NativeDate(+now+480000),cache:progressCache,collect});
 assert.equal(progressed.scan.scanned,80,'Progressing continuations are not discarded by their initial cache deadline');
 assert.equal(progressed.scan.evidenceComplete,false,'Sliding continuation lifetime never extends event receipts');

 // Drive the actual request ownership/deadline context forward while a batch
 // is in flight. Its late completion cannot mark any candidate reviewed.
 const originalPerformance=global.performance;let clock=0;
 Object.defineProperty(global,'performance',{configurable:true,value:{now:()=>clock}});
 const deadlineLoader=createResearchModuleLoader(process.cwd());
 const deadlineModule=deadlineLoader.load('lib/c1UniverseVerification.js');
 const {profileTop5Request}=deadlineLoader.load('lib/top5Diagnostics.js');
 const deadlineCache=new Map();
 try{
  await assert.rejects(profileTop5Request(()=>deadlineModule.collectC1UniverseEvents({sourceIdentity:'superseded',symbols,now,cache:deadlineCache,collect:async()=>{clock=56000;return new Map(symbols.map(s=>[s,risk(s)]));}})),error=>error.code==='TOP5_TIMEOUT');
  assert.equal([...deadlineCache.values()][0].attempted.size,0,'Expired owners cannot publish late verification progress');
 }finally{Object.defineProperty(global,'performance',{configurable:true,value:originalPerformance});}

 // Execute the real opening collector: 205 requested candidates require four
 // refreshes, fresh quote requests are <=100 names, dated anchors fetched once.
 const {collectC1AccountOpening}=loader.load('lib/c1AccountOpeningProvider.js');
 const members=Array.from({length:500},(_,i)=>({symbol:'U'+String(i).padStart(3,'0'),sector:'Sector '+i%8}));
 const required=members.slice(0,205).map(r=>r.symbol);
 const baseline={date:'2026-11-10',universeSymbols:members.map(r=>r.symbol),prices:members.map(r=>({symbol:r.symbol,close:100})),signals:members.map(r=>({...r,price:100}))};
 const quotes=[],anchors=[];let missingQuoteSymbol=null,missingQuoteSymbols=new Set();
 const fetcher=async url=>{
  const u=new URL(url);let body;
  if(u.pathname.endsWith('/sp500-constituent'))body=members;
  else if(u.pathname.endsWith('/batch-quote')){const batch=u.searchParams.get('symbols').split(',');quotes.push(batch);body=batch.filter(symbol=>symbol!==missingQuoteSymbol&&!missingQuoteSymbols.has(symbol)).map(symbol=>({symbol,open:100,price:100,timestamp:+now/1000}));}
  else if(u.pathname.endsWith('/historical-price-eod/dividend-adjusted')){const symbol=u.searchParams.get('symbol');anchors.push(symbol);body=[{symbol,date:baseline.date,adjOpen:100,adjHigh:101,adjLow:99,adjClose:100,volume:1e7}];}
  else throw Error('Unexpected provider route');
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 };
 const input={baseline,symbols:required,now,anchorStore:null,fetcher,apiKey:'synthetic-provider',collectEvents:async names=>new Map(names.map(s=>[s,risk(s)]))};
 let complete;
 for(let i=0;i<4;i++){
  try{complete=await collectC1AccountOpening(input);assert.equal(i,3,'No partial scan can authorize a plan');}
  catch(error){assert.equal(error.code,'C1_SCAN_INCOMPLETE');assert.equal(error.scan.complete,false);assert.equal(error.scan.completed,64*(i+1));}
 }
 assert.equal(complete.prices.length,205);assert.equal(anchors.length,205);assert.equal(new Set(anchors).size,205);
 assert(quotes.every(batch=>batch.length<=100),'The actual provider never emits an unbounded quote URL');
 assert.equal(complete.currentEventEvidence.length,205);
 assert.equal(complete.scan.complete,true);assert.equal(complete.scan.total,205);
 missingQuoteSymbol=required[1];
 const missingCandidate=await collectC1AccountOpening({...input,essentialSymbols:[required[0]]});
 assert.equal(missingCandidate.prices.length,204);
 assert.equal(missingCandidate.candidateDisqualifications[0].symbol,required[1]);
 assert.equal(missingCandidate.candidateDisqualifications[0].reason,'current-quote-unverified');
 missingQuoteSymbol=required[0];
 await assert.rejects(collectC1AccountOpening({...input,essentialSymbols:[required[0]]}),/Fresh opening quote missing/,'Missing held/essential ownership coverage remains fatal');
 missingQuoteSymbol=null;
 missingQuoteSymbols=new Set(required.slice(0,100));
 const emptyFirstBatch=await collectC1AccountOpening({...input,essentialSymbols:[required[200]]});
 assert.equal(emptyFirstBatch.prices.length,105,'A fully unavailable early quote batch cannot hide later verified candidates');
 assert.equal(emptyFirstBatch.candidateDisqualifications.length,100);
 missingQuoteSymbols=new Set();
 const altered={...baseline,prices:baseline.prices.map((r,i)=>i? r:{...r,close:101})};
 await assert.rejects(collectC1AccountOpening({...input,baseline:altered}),error=>error.code==='C1_SCAN_INCOMPLETE'&&error.scan.completed===64);
 assert.equal(anchors.length,269,'A changed accepted price basis starts its own 64-name scan');

 // Real Home/screen producer, current provider adapters, classifier, response
 // serializer and in-memory storage. A full source of eighty names takes
 // three bounded refreshes and is explicitly pending until all are visited.
 const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
 const fixture=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]});
 fixture.now=now;
 for(const session of fixture.sessions){
  session.signals=symbols.map((symbol,index)=>({symbol,companyName:symbol,issuer:symbol,sector:'Sector '+index,price:100,action:'Strong Buy',
   researchFactors:{momentumPercentile:100-index,volatility60Pct:20,factorCoverage:1},
   entryTiming:{available:true,asOf:session.date,macdImproving:true,liquidityPass:true,averageDollarVolume20:1e9,strongPass:true,pass:true},riskPlan:{invalidationPrice:86},recommendation:{}}));
  session.positionSignals=session.signals;
  session.universeSymbols=[...symbols];
  session.prices=[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date:session.date,open:100,high:101,low:99,close:100,volume:1e7,adjusted:true}));
 }
 const actualScreen=require('./fixtures/c1-normal-refresh-screen.cjs').createNormalRefreshScreen(fixture);
 for(let pass=0;pass<3;pass++){
  const response=await actualScreen.request({verificationPass:String(pass),compact:'1',screenSymbols:symbols.join(',')});
  assert.equal(response.status,200);
  const scan=response.body.meta.c1UniverseScan;
  assert.equal(scan.scanned,Math.min(80,(pass+1)*32));assert.equal(scan.complete,pass===2);
  if(pass<2){assert.equal(response.body.meta.selectionScanStatus,'incomplete');assert.equal(response.body.meta.quoteFeedStatus,'incomplete');}
  else assert.equal(response.body.stocks.filter(row=>symbols.includes(row.symbol)).length,80,'Current requested Watch transport does not truncate to eighteen historical leaders');
 }
 assert(!actualScreen.calls.some(call=>call.endpoint==='historical-price-eod/full'&&symbols.includes(call.symbol)),'Full C1 accepted timing evidence is reused rather than downloaded synchronously again');

 // Real opening acquisition -> real selection -> real three-allocation engine.
 // Twenty-four missing candidate quotes must release slots for #25 and below.
 const liveBaseline=fixture.book.model.sessions.at(-1);
 const fullMembers=[...symbols.map((symbol,index)=>({symbol,sector:'Sector '+index})),...Array.from({length:420},(_,index)=>({symbol:'Z'+String(index).padStart(3,'0'),sector:'Extra'}))];
 const lowQuoteFetcher=async raw=>{
  const url=new URL(raw),endpoint=url.pathname.split('/').at(-1);let body;
  if(endpoint==='sp500-constituent')body=fullMembers;
  else if(endpoint==='batch-quote')body=url.searchParams.get('symbols').split(',').filter(symbol=>!symbols.slice(0,24).includes(symbol)).map(symbol=>({symbol,open:100,price:100,timestamp:+now/1000}));
  else body=[{date:liveBaseline.date,adjOpen:100,adjHigh:101,adjLow:99,adjClose:100,volume:1e7}];
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 };
 let verifiedOpening;
 const lowInput={baseline:liveBaseline,symbols:[...symbols,'SPY','QQQ'],essentialSymbols:['SPY','QQQ'],now,anchorStore:null,fetcher:lowQuoteFetcher,apiKey:'synthetic-provider',collectEvents:async names=>new Map(names.map(symbol=>[symbol,risk(symbol)]))};
 for(let pass=0;pass<3;pass++){
  try{verifiedOpening=await collectC1AccountOpening(lowInput);}catch(error){assert.equal(error.code,'C1_SCAN_INCOMPLETE');}
 }
 assert.equal(verifiedOpening.candidateDisqualifications.length,24);
 const {projectC1AccountSession}=loader.load('lib/c1AccountProjection.js');
 const {c1AccountBooks}=loader.load('lib/c1AccountLedger.js');
 const {buildC1AccountPolicy}=loader.load('lib/c1AccountPolicy.js');
 // Explicit synthetic approval exercises the proposed path without approving
 // or changing the pending production risk-baseline decision.
 const policy={...buildC1AccountPolicy(fixture.account,{date:verifiedOpening.date,now}),operationalRiskDecision:{status:'approved',mode:'next-open-after-verified-liquidation'}};
 const projected=projectC1AccountSession({adoption:fixture.account.adoption,baseline:liveBaseline,opening:verifiedOpening,observedAt:now,
  books:c1AccountBooks(fixture.account.adoption),sessions:[liveBaseline],historySessions:fixture.book.model.sessions,
  purchaseFundingIndependent:true,additionalSwingCapacity:true,accountPolicy:policy,brokerageCashAvailable:100000});
 assert.deepEqual([...new Set(projected.orders.filter(order=>order.side==='buy').map(order=>order.symbol))],symbols.slice(24,27),'The actual provider and allocation engine advance beyond twenty-four unverifiable leaders');
 assert(!projected.orders.some(order=>order.side==='buy'&&symbols.slice(0,24).includes(order.symbol)),'No unavailable quote becomes an authorized purchase in any allocation');
 console.log('PASS: full-universe provider batches, all-name continuation, source identity, incomplete/expired evidence, interruption, real opening collector and bounded quote URLs.');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=NativeDate;});
