// Regression of the reproduced historical-event/current-capacity disagreement
// and native-volatility/omitted-quote explanation. No production claim is made.
// All accounts, events, memberships and provider responses below are synthetic.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const NativeDate=Date,originalFetch=global.fetch,originalKey=process.env.FMP_API_KEY;
const observedAt='2026-10-15T17:00:00.000Z';
class FixedDate extends NativeDate{
 constructor(...args){super(...(args.length?args:[observedAt]));}
 static now(){return NativeDate.parse(observedAt);}
}
global.Date=FixedDate;
global.fetch=async()=>{throw Error('Live provider access forbidden in purchase-block evidence regression');};
const clone=value=>JSON.parse(JSON.stringify(value));
const portfolio=[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const findings=[];
function fixture(){const f=createWorkflowFixture('buy',{portfolio});f.setCash(5000);return f;}
function sourceSignals(f,symbol){return [...f.sessions[220].signals,...f.sessions[220].positionSignals].filter(row=>row.symbol===symbol);}
function capacity(f,opening=f.opening()){
 return f.loader.load('lib/c1AdditionalSwingCapacity.js').c1AdditionalSwingCapacity({baseline:f.sessions[220],historySessions:f.sessions.slice(0,221),opening,observedAt:f.now.toISOString()});
}
function currentRating(f,symbol,rows=f.screenRows()){
 const {buildC1StockScreenSnapshot,classifyC1StockScreen}=f.loader.load('lib/c1StockClassification.js');
 return classifyC1StockScreen({snapshot:buildC1StockScreenSnapshot(f.sessions[220],f.now,f.sessions.slice(0,221)),rows,current:true}).find(row=>row.symbol===symbol);
}
function reasonFor(cap,symbol){return cap.reviews.find(row=>row.symbol===symbol)?.reason;}
function purchaseStatus(f,view,symbol){
 const rating=currentRating(f,symbol);
 const result=f.loader.load('lib/c1EntryReview.js').c1OpportunityPresentation({decision:{...view.decision,opportunities:[rating]},plan:view.openingPlan,buys:view.openingPlan.orders.filter(row=>row.side==='buy'),ready:view.manualRecommendations.status==='ready'});
 const tile=result.tiles.find(row=>row.symbol===symbol);
 return {...tile,plain:f.loader.load('lib/c1DecisionCopy.js').c1PlainDecisionReason({action:tile.accountAction,reason:tile.detail,symbol,decision:view.decision,openingPlan:view.openingPlan,purchaseDiagnostics:view.purchaseDiagnostics})};
}

function loadOpeningCollector(loader){
 // Load the real normalizer without importing the research module's Blob
 // storage graph. These exact source slices are pure and perform no I/O.
 const research=fs.readFileSync('lib/fmpResearchBacktest.js','utf8');
 const helpers=research.slice(research.indexOf('const asArray ='),research.indexOf('const usableAdjustedOhlcBar ='));
 const normalizer=research.slice(research.indexOf('export function normalizeHistoricalBars('),research.indexOf('export async function resolvePriceHistoryContract(')).replace('export function ','function ');
 assert(helpers.includes('const number =')&&normalizer.includes('function normalizeHistoricalBars('));
 const normalizeHistoricalBars=new Function(helpers+normalizer+';return normalizeHistoricalBars;')();
 const source=fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,async)=>(async||'')+'function ');
 const context={...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js'),normalizeHistoricalBars,Map,Date:FixedDate,console,process:{env:{}},URLSearchParams,AbortSignal,fetch:global.fetch};
 vm.createContext(context);vm.runInContext(source+';globalThis.collect=collectC1AccountOpening;',context);
 return context.collect;
}

// Use the real collector and its batch-symbol selection/quote/anchor validation.
// Extra synthetic members satisfy the unchanged production membership minimum;
// only the supplied fetch boundary is replaced. It never returns extra quotes.
function openingCollector(f,{missingSymbol,staleSymbol}={}){
 const baseline=f.sessions[220],signals=new Map(baseline.signals.map(row=>[row.symbol,row]));
 const members=baseline.universeSymbols.map(symbol=>({symbol,name:symbol,sector:signals.get(symbol)?.sector||'Synthetic sector'}));
 for(let i=0;members.length<490;i++)members.push({symbol:'ZZFIX'+i,name:'Synthetic member '+i,sector:'Synthetic sector '+i});
 const membership=members.map(row=>row.symbol);
 for(const session of f.sessions)session.universeSymbols=[...membership];
 const collect=loadOpeningCollector(f.loader);
 const requests=[];
 return {requests,async collectOpening(args){
  requests.push({symbols:[...args.symbols]});
  return collect({...args,apiKey:'offline-purchase-evidence-fixture',collectEvents:async symbols=>{
   requests.at(-1).eventSymbols=[...symbols];
   return new Map(currentEventEvidenceFor(symbols,f.now).map(risk=>[risk.symbol,risk]));
  },fetcher:async raw=>{
   const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1];
   assert.equal(url.searchParams.get('apikey'),'offline-purchase-evidence-fixture');
   if(endpoint==='sp500-constituent')return new Response(JSON.stringify(members));
   if(endpoint==='batch-quote'){
    const symbols=url.searchParams.get('symbols').split(',');requests.at(-1).batchSymbols=symbols;
    return new Response(JSON.stringify(symbols.filter(symbol=>symbol!==missingSymbol).map(symbol=>({symbol,open:100,price:100,timestamp:f.now.getTime()/1000-(symbol===staleSymbol?121:0)}))));
   }
   if(endpoint==='historical-price-eod/dividend-adjusted'){
    const symbol=url.searchParams.get('symbol'),anchor=args.baseline.prices.find(row=>row.symbol===symbol);
    assert(anchor,'The collector may request only real fixture anchors');
    return new Response(JSON.stringify([anchor]));
   }
   throw Error('Unexpected offline opening endpoint '+endpoint);
  }});
 }};
}
async function prepareWithCollector(f,options){
 const collector=openingCollector(f,options),before=JSON.stringify({account:f.account,book:f.book});
 const view=await f.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:collector.collectOpening,includePurchaseDiagnostics:true});
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before,'Preparing evidence must not mutate account or accepted inputs');
 assert.equal(f.writes,0,'No fixture account persistence is permitted');
 return {view,requests:collector.requests};
}

async function main(){
 const historical=fixture(),loader=historical.loader;
 const raw={metadata:{},securities:[{symbol:'CRWD',name:'Synthetic CRWD',sector:'Technology',listedAt:historical.sessions[0].date}],fundamentals:[],events:[],
  sessions:historical.sessions.slice(0,221).map(session=>({date:session.date,decisionAt:session.decisionAt,universeSymbols:session.date==='2026-10-14'?['CRWD']:[],prices:session.prices.filter(row=>['MRNA','SPY','QQQ'].includes(row.symbol)).map(row=>({...row,symbol:row.symbol==='MRNA'?'CRWD':row.symbol}))}))};
 const beforeRaw=JSON.stringify(raw),compiled=loader.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals(raw,{minimumHistoryRows:20,resume:{sessions:[],completedSessions:220,decisionMemory:[]},maxSessions:1});
 const historicalRisk=compiled.sessions.at(-1).positionSignals.find(row=>row.symbol==='CRWD').eventRisk;
 assert.equal(JSON.stringify(raw),beforeRaw,'The compiler must retain its original input evidence');
 assert.equal(historicalRisk.status,'Manual');assert.equal(historicalRisk.blockNewCapital,true);assert.equal(historicalRisk.checkComplete,false);
 const staleCoverage=clone(raw);staleCoverage.sessions.at(-1).eventCoverageAsOf='2026-10-14T20:59:59.000Z';
 const staleRisk=loader.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals(staleCoverage,{minimumHistoryRows:20,resume:{sessions:[],completedSessions:220,decisionMemory:[]},maxSessions:1}).sessions.at(-1).positionSignals[0].eventRisk;
 assert.equal(staleRisk.status,'Manual');assert.equal(staleRisk.blockNewCapital,true,'Coverage ending before the decision cannot clear historical event verification');

 // Independently run the real current event pipeline against fresh empty
 // earnings/M&A/news responses. This establishes current coverage separately
 // from the historical compiler's deliberately missing coverage.
 const eventCalls=[],eventFetch=global.fetch;
 global.fetch=async raw=>{const url=new URL(raw);eventCalls.push(url.pathname);return new Response('[]');};
 process.env.FMP_API_KEY='offline-current-events-fixture';
 const eventLoader=createResearchModuleLoader(process.cwd());
 const freshEvent=(await eventLoader.load('lib/eventRisk.js').fetchEventRiskMap(['CRWD'])).get('CRWD');
 global.fetch=eventFetch;
 const unavailableEvent=(await createResearchModuleLoader(process.cwd()).load('lib/eventRisk.js').fetchEventRiskMap(['CRWD'])).get('CRWD');
 if(originalKey===undefined)delete process.env.FMP_API_KEY;else process.env.FMP_API_KEY=originalKey;
 assert.equal(freshEvent.checkComplete,true);assert.equal(freshEvent.blockNewCapital,false);assert.equal(freshEvent.newsCheckComplete,true);assert.equal(eventCalls.length,4);
 assert.equal(unavailableEvent.checkComplete,false);assert.equal(unavailableEvent.blockNewCapital,true,'Actual missing current provider responses remain blocked');

 // Only the event field is borrowed from the real compiler so momentum,
 // liquidity, ownership and all other fixture rules remain controlled.
 const eventFixture=fixture();
 for(const session of eventFixture.sessions){
  for(const row of [...session.prices,...session.signals,...session.positionSignals])if(row.symbol==='MRNA'){
   row.symbol='CRWD';if(row.entryTiming?.symbol==='MRNA')row.entryTiming.symbol='CRWD';
  }
  session.universeSymbols=session.universeSymbols.map(symbol=>symbol==='MRNA'?'CRWD':symbol);
 }
 for(const row of sourceSignals(eventFixture,'CRWD'))row.eventRisk=clone(historicalRisk);
 const currentRows=eventFixture.screenRows().map(row=>row.symbol==='MRNA'?{...row,symbol:'CRWD',eventRisk:clone(freshEvent)}:row);
 const rating=currentRating(eventFixture,'CRWD',currentRows);assert(['Buy','Strong Buy'].includes(rating.rating),JSON.stringify(rating));
 const opened=eventFixture.opening();opened.prices=opened.prices.map(row=>row.symbol==='MRNA'?{...row,symbol:'CRWD'}:row);
 opened.currentEventEvidence=currentEventEvidenceFor(opened.prices.map(row=>row.symbol),eventFixture.now).map(risk=>risk.symbol==='CRWD'?freshEvent:risk);
 const sourceBefore=JSON.stringify(eventFixture.sessions),carried=capacity(eventFixture,opened);
 assert(carried.symbols.includes('CRWD'),'Verified current clear evidence must supersede obsolete historical Manual evidence');
 assert.equal(JSON.stringify(eventFixture.sessions),sourceBefore,'Current evaluation must retain original historical event inputs');
 assert.equal(sourceSignals(eventFixture,'CRWD')[0].eventRisk.status,'Manual');
 const unavailableOpening=clone(opened);unavailableOpening.currentEventEvidence=opened.currentEventEvidence.map(risk=>risk.symbol==='CRWD'?unavailableEvent:risk);
 const unavailable=capacity(eventFixture,unavailableOpening);assert(!unavailable.symbols.includes('CRWD'));
 assert.equal(reasonFor(unavailable,'CRWD'),'Current event verification is incomplete; purchases remain paused.');
 assert.equal(eventFixture.loader.load('lib/c1DecisionCopy.js').c1PlainDecisionReason({action:'No purchase',reason:reasonFor(unavailable,'CRWD')}),reasonFor(unavailable,'CRWD'));
 findings.push({code:'CURRENT_CLEAR_SUPERSEDES_HISTORICAL_MANUAL',historicalStatus:historicalRisk.status,currentEventCheckComplete:freshEvent.checkComplete,currentScreenRating:rating.rating,currentCapacityIncludesCRWD:true,unavailableCurrentStillBlocked:true});

 // Genuine adverse and unavailable event evidence must keep blocking capital.
 for(const state of ['VERIFIED_BLOCKED','UNVERIFIED']){
  const f=fixture(),opening=f.opening(),risk=currentEventEvidenceFor(['MRNA'],f.now,{MRNA:{state,status:state==='UNVERIFIED'?'Manual':'Blocked'}})[0];
  opening.currentEventEvidence=opening.currentEventEvidence.map(row=>row.symbol==='MRNA'?risk:row);
  assert(!capacity(f,opening).symbols.includes('MRNA'));assert.match(reasonFor(capacity(f,opening),'MRNA'),state==='UNVERIFIED'?/Current event verification is incomplete/:/material-event block/);
  assert.equal(currentRating(f,'MRNA',f.screenRows().map(row=>row.symbol==='MRNA'?{...row,eventRisk:clone(risk)}:row)).rating,'Watch','Genuine current adverse/unverified event evidence cannot be promoted by the screen');
 }
 for(const missing of [false,true]){
  const f=fixture(),opening=f.opening();
  if(missing)opening.prices=opening.prices.filter(row=>row.symbol!=='MRNA');
  else opening.prices.find(row=>row.symbol==='MRNA').observedAt='2026-10-15T16:57:59.000Z';
  const result=capacity(f,opening);assert(!result.symbols.includes('MRNA'));assert.match(reasonFor(result,'MRNA'),/quote verification is incomplete/);
 }

 const highVol=fixture(),options=highVol.loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
 const eligibilityHelpers={canonical:highVol.loader.load('lib/c1AccountSimulator.js').c1AccountRankEligible,
  currentRecentMomentum:highVol.loader.load('lib/c1RecentMomentumChallengerSimulator.js').c1AccountRankEligible};
 const signal=sourceSignals(highVol,'MRNA')[0];
 for(const [sleeve,config]of Object.entries(options)){
  assert.equal(config.maxVolatility60Pct,100,'The frozen native volatility rule must remain unchanged');
  for(const [engine,eligible]of Object.entries(eligibilityHelpers)){
   assert.equal(eligible({...signal,researchFactors:{...signal.researchFactors,volatility60Pct:100}},config),true,engine+' '+sleeve+' preserves its exact boundary');
   assert.equal(eligible({...signal,researchFactors:{...signal.researchFactors,volatility60Pct:100.01}},config),false,engine+' '+sleeve+' rejects volatility above its existing limit');
  }
 }
 for(const row of sourceSignals(highVol,'MRNA'))row.researchFactors.volatility60Pct=373.2866;
 assert(['Buy','Strong Buy'].includes(currentRating(highVol,'MRNA').rating),'The separate screen rating must reproduce the observed Buy');
 const {view,requests}=await prepareWithCollector(highVol);
 assert(view.openingPlan,view.openingError);assert.equal(view.openingError,null);assert.equal(requests.length,1);
 assert(!requests[0].symbols.includes('MRNA'),'Native-ineligible MRNA is absent from the real execution collection request');
 assert.deepEqual(requests[0].batchSymbols,requests[0].symbols,'The real collector must quote exactly requested symbols');
 assert.deepEqual(requests[0].eventSymbols,requests[0].symbols.filter(symbol=>!['SPY','QQQ'].includes(symbol)),'Current event collection uses only the unchanged execution collection universe');
 assert(!view.openingPlan.orders.some(row=>row.symbol==='MRNA'&&row.side==='buy'),'The genuine native volatility rejection must remain protected');
 const status=purchaseStatus(highVol,view,'MRNA');assert.equal(status.accountAction,'No purchase');
 assert.match(status.detail,/Current quote verification is incomplete/);assert.equal(status.plain,'Accepted 60-session volatility is 373.29%, above the 100.00% purchase limit; this stock is outside the C1 purchase queue.');
 findings.push({code:'NATIVE_VOLATILITY_BLOCK_EXPLAINED_WITHOUT_EXTRA_QUOTE',volatility60Pct:373.2866,nativeLimit:100,requestedMRNA:false,currentScreenRating:currentRating(highVol,'MRNA').rating,capacityReason:status.detail,visibleReason:status.plain});

 // Missing/stale quotes for a genuinely requested candidate must fail the
 // actual collector rather than producing a purchase from display evidence.
 for(const control of [{missingSymbol:'MRNA'},{staleSymbol:'MRNA'}]){
  const f=fixture(),result=await prepareWithCollector(f,control);
  assert(result.requests[0].symbols.includes('MRNA'),'The eligible control must genuinely request MRNA');
  assert.equal(result.view.openingPlan,null);assert.match(result.view.openingError,/Fresh opening quote missing for MRNA/);
 }
 for(const finding of findings)console.log(JSON.stringify(finding));
 console.log('PASS: current clear event evidence supersedes obsolete historical Manual evidence without historical mutation; failed/adverse current evidence and missing/stale quotes remain blocked; unchanged MRNA volatility rejection has its evidence-based explanation. Offline regression only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 global.Date=NativeDate;global.fetch=originalFetch;
 if(originalKey===undefined)delete process.env.FMP_API_KEY;else process.env.FMP_API_KEY=originalKey;
});
