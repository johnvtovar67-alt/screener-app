// Offline request-diagnostic regression. All accounts and provider replies are
// synthetic; live Blob/FMP access is forbidden and no file persistence occurs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const NativeDate=Date,originalFetch=global.fetch,fixedAt='2026-10-15T17:00:00.000Z',commit='a'.repeat(40);
class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[fixedAt]));}static now(){return NativeDate.parse(fixedAt);}}
global.Date=FixedDate;global.fetch=async()=>{throw Error('Live provider access forbidden in request diagnostics regression');};
const clone=value=>JSON.parse(JSON.stringify(value));
const never=()=>{throw Error('Live provider/storage access forbidden in request diagnostics regression');};
const portfolio=[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const hostile='PRIVATE_RAW_SENTINEL_8b7a';

function loadCollector(loader){
 const normalizeHistoricalBars=loader.load('lib/fmpPriceBars.js').normalizeHistoricalBars;
 const source=fs.readFileSync('lib/c1AccountOpeningProvider.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const box={...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js'),normalizeHistoricalBars,Map,Date:FixedDate,console,process:{env:{}},URLSearchParams,AbortSignal,fetch:never};
 vm.createContext(box);vm.runInContext(source+';globalThis.collect=collectC1AccountOpening;',box);return box.collect;
}

function makeHarness({disabled=false,highVol=false,missing=false,stale=false,outsideHours=false,planError=false,diagnosticError=false,eventState='VERIFIED_CLEAR',eventFailure=false,eventExpired=false}={}){
 const f=createWorkflowFixture('buy',{portfolio});f.setCash(5000);
 if(outsideHours)f.now='2026-10-15T21:00:00.000Z';
 for(const session of f.sessions){
  for(const row of [...session.prices,...session.signals,...session.positionSignals])if(row.symbol==='DDD'){
   row.symbol='CRWD';if(row.entryTiming?.symbol==='DDD')row.entryTiming.symbol='CRWD';
  }
  session.universeSymbols=session.universeSymbols.map(symbol=>symbol==='DDD'?'CRWD':symbol);
 }
 const baseline=f.sessions[220];
 for(const row of [...baseline.signals,...baseline.positionSignals]){
  if(row.symbol==='MRNA'&&highVol)row.researchFactors.volatility60Pct=373.2866;
  if(row.symbol==='CRWD')row.eventRisk={status:'Manual',label:'Historical event verification unavailable',blockNewCapital:true,manualCheckRequired:true,checkComplete:false};
 }
 const signals=new Map(baseline.signals.map(row=>[row.symbol,row]));
 const members=baseline.universeSymbols.map(symbol=>({symbol,name:symbol,sector:signals.get(symbol).sector}));
 for(let i=0;members.length<490;i++)members.push({symbol:'ZZREQUEST'+i,name:'Synthetic '+i,sector:'Synthetic sector '+i});
 for(const session of f.sessions)session.universeSymbols=members.map(row=>row.symbol);
 const state={reads:0,bookReads:0,writes:0,collections:[],imports:{},prepareArgs:[],bytes:JSON.stringify(f.account),etag:'"request-fixture-0"'};
 const collector=loadCollector(f.loader);
 async function collectOpening(args){
  const request={symbols:[...args.symbols],batchSymbols:null};state.collections.push(request);
  return collector({...args,apiKey:'offline-request-diagnostics-fixture',collectEvents:async symbols=>{
   assert.equal(request.eventSymbols,undefined,'Each real opening collector invokes current event collection once');request.eventSymbols=[...symbols];
   assert.deepEqual([...symbols],[...args.symbols].filter(symbol=>!['SPY','QQQ'].includes(symbol)),'Event verification cannot broaden the quote-collection universe');
   if(eventFailure)throw Error(hostile+' current event provider unavailable');
   const risks=currentEventEvidenceFor(symbols,f.now,{CRWD:{state:eventState,status:eventState==='UNVERIFIED'?'Manual':eventState==='VERIFIED_BLOCKED'?'Blocked':'Clear'}});
   if(eventExpired)for(const risk of risks)if(risk.symbol==='CRWD')risk.eventVerification.expiresAt='2026-10-15T16:59:59.000Z';
   return new Map(risks.map(risk=>[risk.symbol,risk]));
  },fetcher:async raw=>{
   const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1];
   assert.equal(url.searchParams.get('apikey'),'offline-request-diagnostics-fixture');
   if(endpoint==='sp500-constituent')return new Response(JSON.stringify(members));
   if(endpoint==='batch-quote'){
    const symbols=url.searchParams.get('symbols').split(',');request.batchSymbols=symbols;
    return new Response(JSON.stringify(symbols.filter(symbol=>!(missing&&symbol==='MRNA')).map(symbol=>({symbol,open:100,price:100,timestamp:f.now.getTime()/1000-(stale&&symbol==='MRNA'?121:0)}))));
   }
   if(endpoint==='historical-price-eod/dividend-adjusted'){
    const anchor=args.baseline.prices.find(row=>row.symbol===url.searchParams.get('symbol'));assert(anchor);return new Response(JSON.stringify([anchor]));
   }
   throw Error('Unexpected offline opening endpoint '+endpoint);
  }});
 }
 const executionFile=path.resolve('lib/c1AccountExecutionView.js'),executionImports={};
 const executionSource=fs.readFileSync(executionFile,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,request)=>{
  const values=f.loader.load(request,executionFile);
  for(const name of spec.split(',').map(name=>name.trim())){
   const value=values[name];assert.notEqual(value,undefined,'Missing execution import '+name);
   executionImports[name]=typeof value==='function'?function(...args){
    state.imports[name]=(state.imports[name]||0)+1;
    if(name==='buildC1PurchaseDiagnostics'&&diagnosticError)throw Error(hostile+' diagnostic failure');
    if(name==='planC1ContinuedAccountOpening'&&planError)throw Error(hostile+' plan failure');
    return value(...args);
   }:value;
  }
  return '';
 }).replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const executionBox={...executionImports,Date:FixedDate,console,process:{env:{}}};vm.createContext(executionBox);
 vm.runInContext(executionSource+';globalThis.prepare=prepareC1AccountExecution;',executionBox,{filename:executionFile});
 const prepare=async args=>{state.prepareArgs.push({includePurchaseDiagnostics:args.includePurchaseDiagnostics,diagnosticCommit:args.diagnosticCommit,recordTicket:Boolean(args.recordTicket)});return executionBox.prepare({...args,...(disabled?{includePurchaseDiagnostics:false}:{})});};
 const apiFile=path.resolve('pages/api/c1-account.js'),apiImports={};
 const coverageSource=fs.readFileSync('lib/c1HoldingCoverage.js','utf8').replace(/^import .*;$/gm,'').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const missingPrices=new Function(coverageSource+';return missingC1HoldingPrices;')();
 const apiSource=fs.readFileSync(apiFile,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,request)=>{
  const values=request==='@vercel/blob'?{get:never,put:never}:request.endsWith('c1DatedBookStore')?{readStoredC1DatedBook:never}:
   request.endsWith('c1HeldRankProvider')?{collectC1HeldRankReviews:never}:request.endsWith('c1AccountOpeningProvider')?{collectC1AccountOpening:never}:
   request.endsWith('c1AccountExecutionView')?{prepareC1AccountExecution:prepare}:
   request.endsWith('c1HoldingCoverage')?{collectC1HoldingCoverage:never,missingC1HoldingPrices:missingPrices}:request.startsWith('node:')?require(request):f.loader.load(request,apiFile);
  for(const name of spec.split(',').map(name=>name.trim())){assert.notEqual(values[name],undefined,'Missing API import '+name);apiImports[name]=values[name];}
  return '';
 }).replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
 const apiBox={...apiImports,Date:FixedDate,console,process:{env:{}},Response};vm.createContext(apiBox);vm.runInContext(apiSource,apiBox,{filename:apiFile});
 const handler=apiBox.factory({environment:'test',commit,clock:()=>f.now,collectOpening,collectHoldings:never,collectRanks:never,readPortfolio:never,
  readBook:async()=>{state.bookReads++;return {record:f.book};},store:{read:async()=>{state.reads++;return {record:JSON.parse(state.bytes),etag:state.etag};},write:async(_path,account,etag)=>{
   assert.equal(etag,state.etag);state.writes++;state.bytes=JSON.stringify(account);state.etag='"request-fixture-'+state.writes+'"';
  }}});
 return {f,state,directPrepare:executionBox.prepare,async request(method='POST',body={operation:'prepare-execution'},authorized=true){
  const before=JSON.stringify(body),res={setHeader(){},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await handler({method,body,headers:authorized?{authorization:'Bearer offline_request_diagnostics_fixture_00001'}:{}},res);
  assert.equal(JSON.stringify(body),before,'The handler must not mutate its request body');return res;
 }};
}

const withoutDiagnostics=value=>{const result=clone(value);delete result.purchaseDiagnostics;return result;};
const withoutBuilder=counts=>Object.fromEntries(Object.entries(counts).filter(([name])=>!['buildC1PurchaseDiagnostics','unavailableC1PurchaseDiagnostics'].includes(name)));
function exactKeys(value,keys,label){assert(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label+' must use only its fixed field allowlist');}
function assertSchema(report){
 report=clone(report);
 exactKeys(report,['contract','status','executable','requestObservedAt','observedAt','deployedCommit','source','collection','review','tickers'],'report');
 assert.equal(report.contract,'c1-purchase-diagnostics-v1');assert.equal(report.executable,false);
 exactKeys(report.source,['sessionDate','basis','decisionAt','captureObservedAt'],'source');
 exactKeys(report.collection,['status','receiptObservedAt'],'collection');exactKeys(report.review,['manualStatus','manualReasonCode','openingPlanAvailable','providerVerified','openingErrorPresent','openingFailureCode'],'review');
 assert.deepEqual(report.tickers.map(row=>row.symbol),['MRNA','CRWD'],'Only the two fixed public tickers may be projected');
 for(const row of report.tickers){
  exactKeys(row,['symbol','source','nativeQueueIncluded','opening','capacityReview','entryReviewsAvailable','entryReviewCodes','recheckCodes','reconciliation'],row.symbol);
  exactKeys(row.source,['signalSource','signalPresent','price','momentumPercentile','volatility60Pct','volatilityLimits','event'],row.symbol+' source');
  for(const limit of row.source.volatilityLimits)exactKeys(limit,['maxVolatility60Pct','componentPredicatePass'],'volatility component');
  exactKeys(row.source.event,['status','blockNewCapital','manualCheckRequired','checkComplete','earningsCheckComplete','mergerCheckComplete','newsCheckComplete','eventRiskVerified','coverageAsOfPresent','coverageAsOf','eventRiskAvailableAtPresent','eventRiskAvailableAt','independentCurrentEvidence'],'event');
  exactKeys(row.opening,['currentEvent','requested','observed','status','open','observedPrice','providerObservedAt','ageSeconds','ageMaximumSeconds','ageScope','ageWithinLimitPass'],'opening');
  exactKeys(row.opening.currentEvent,['state','status','blockNewCapital','checkComplete','eventRiskVerified','observedAt','expiresAt','provider','sources'],'current event');
  assert(['VERIFIED_CLEAR','VERIFIED_BLOCKED','UNVERIFIED'].includes(row.opening.currentEvent.state));
  assert.deepEqual(row.opening.currentEvent.sources.map(source=>source.kind),['EARNINGS','MERGERS','NEWS']);
  for(const source of row.opening.currentEvent.sources){
   exactKeys(source,['kind','complete','fetchedAt','expiresAt','endpoint'],'current event source');
   assert(['EARNINGS-CALENDAR','MERGERS-ACQUISITIONS-LATEST','NEWS/STOCK','UNAVAILABLE'].includes(source.endpoint));
  }
  assert.equal(row.opening.ageScope,'PROVIDER_TIMESTAMP_AGE_ONLY');assert(row.opening.ageMaximumSeconds>0&&row.opening.ageMaximumSeconds<=120);
  exactKeys(row.capacityReview,['status','rating','reasonCode','quoteVerdict','eventVerdict','verdictBasis'],'capacity review');
  exactKeys(row.reconciliation,['appliedMismatchPresent','appliedCorrectionPresent','previousClose','revisedClose','correctedClose','latestRelevantSessionDate','aggregateDeferredRevisionCount','perTickerDeferredState'],'reconciliation');
  assert.equal(row.source.event.independentCurrentEvidence,'UNAVAILABLE','Historical/source evidence cannot imply a new current event request');
  assert.equal(row.reconciliation.perTickerDeferredState,'UNAVAILABLE','An aggregate deferred count cannot identify a target-specific unresolved revision');
  assert(row.entryReviewCodes.every(code=>/^[A-Z_]+$/.test(code)));assert(row.recheckCodes.every(code=>/^[A-Z_]+$/.test(code)));
 }
 assert.doesNotMatch(JSON.stringify(report),new RegExp(hostile+'|UNRELATED_PRIVATE|87654321|11223344|99887766'));
}
async function compareScenario(options={}){
 const enabled=makeHarness(options),disabled=makeHarness({...options,disabled:true});
 const before=enabled.state.bytes,bookBefore=JSON.stringify(enabled.f.book),a=await enabled.request(),b=await disabled.request();
 assert.equal(a.statusCode,200,JSON.stringify(a.body));assert.equal(b.statusCode,200,JSON.stringify(b.body));
 assert.deepEqual(withoutDiagnostics(a.body),clone(b.body),'Removing only diagnostics must restore the identical existing response');
 assert.deepEqual(enabled.state.collections,disabled.state.collections,'Diagnostics must not add or broaden provider collection');
 assert.deepEqual(withoutBuilder(enabled.state.imports),withoutBuilder(disabled.state.imports),'Diagnostics must not add account analysis, replay or plan calls');
 assert.equal(enabled.state.writes,0);assert.equal(disabled.state.writes,0);assert.equal(enabled.state.bytes,before,'Prepare cannot persist diagnostic or account changes');
 assert.equal(JSON.stringify(enabled.f.book),bookBefore,'Current event verification/diagnostics cannot mutate accepted historical records');
 assert.equal(enabled.state.reads,disabled.state.reads);assert.equal(enabled.state.bookReads,disabled.state.bookReads);
 assert.equal(enabled.state.prepareArgs[0].includePurchaseDiagnostics,true,'Only the authenticated prepare route explicitly enables diagnostics');
 assert.equal(enabled.state.prepareArgs[0].diagnosticCommit,commit);
 assert(!Object.hasOwn(b.body,'purchaseDiagnostics'),'The disabled baseline must retain its existing response shape');
 assertSchema(a.body.purchaseDiagnostics);
 return {enabled,response:a.body,diagnostics:a.body.purchaseDiagnostics};
}

async function main(){
 const normal=await compareScenario();
 assert(normal.diagnostics,'Authenticated prepare must include request diagnostics');
 assert.equal(normal.diagnostics.deployedCommit,commit);assert.equal(normal.diagnostics.requestObservedAt,fixedAt);assert.equal(normal.diagnostics.observedAt,fixedAt);
 assert.equal(normal.diagnostics.source.sessionDate,'2026-10-14');assert.equal(normal.diagnostics.source.basis,'REQUEST_ACCOUNT_BASELINE');
 assert.equal(normal.diagnostics.source.decisionAt,'2026-10-14T21:00:00.000Z');assert.equal(normal.diagnostics.review.openingPlanAvailable,true);
 assert.equal(normal.diagnostics.review.providerVerified,true);assert.equal(normal.diagnostics.review.openingErrorPresent,false);
 assert.equal(normal.diagnostics.collection.status,'RETURNED');
 const crwd=normal.diagnostics.tickers.find(row=>row.symbol==='CRWD');
 assert.equal(crwd.source.event.status,'MANUAL');assert.equal(crwd.source.event.blockNewCapital,true);assert.equal(crwd.source.event.checkComplete,false);
 assert.equal(crwd.opening.currentEvent.state,'VERIFIED_CLEAR');assert.equal(crwd.opening.currentEvent.status,'CLEAR');
 assert.equal(crwd.opening.currentEvent.blockNewCapital,false);assert.equal(crwd.opening.currentEvent.checkComplete,true);assert.equal(crwd.opening.currentEvent.eventRiskVerified,true);
 assert.equal(crwd.opening.currentEvent.observedAt,fixedAt);assert.equal(crwd.opening.currentEvent.provider,'FMP');
 assert.notEqual(crwd.capacityReview.reasonCode,'MATERIAL_EVENT_BLOCK','Current verified clear evidence supersedes the historical Manual field without rewriting it');
 assert.equal(crwd.capacityReview.eventVerdict,'PASS_FROM_REASON_PRIORITY');
 assert.equal(crwd.capacityReview.quoteVerdict,'PASS_FROM_REASON_PRIORITY');assert.equal(crwd.capacityReview.verdictBasis,'ACTUAL_CAPACITY_REASON_PRIORITY');
 const high=await compareScenario({highVol:true});
 const mrna=high.diagnostics.tickers.find(row=>row.symbol==='MRNA');
 assert.equal(mrna.source.volatility60Pct,373.2866);assert(mrna.source.volatilityLimits.every(row=>row.maxVolatility60Pct===100&&row.componentPredicatePass===false));
 assert.equal(mrna.nativeQueueIncluded,false);assert.equal(mrna.opening.requested,false);assert.equal(mrna.opening.observed,false);assert.equal(mrna.opening.status,'NOT_REQUESTED');
 assert.equal(mrna.capacityReview.reasonCode,'QUOTE_VERIFICATION_INCOMPLETE');assert.equal(mrna.capacityReview.eventVerdict,'UNAVAILABLE');
 assert.equal(mrna.opening.currentEvent.state,'UNVERIFIED','An omitted MRNA event request cannot imply verified current evidence');
 for(const options of [{eventState:'VERIFIED_BLOCKED'},{eventState:'UNVERIFIED'},{eventFailure:true},{eventExpired:true}]){
  const scenario=await compareScenario(options),row=scenario.diagnostics.tickers.find(row=>row.symbol==='CRWD');
  const blocked=options.eventState==='VERIFIED_BLOCKED';
  assert.equal(row.opening.currentEvent.state,blocked?'VERIFIED_BLOCKED':'UNVERIFIED');
  assert.equal(row.capacityReview.reasonCode,blocked?'MATERIAL_EVENT_BLOCK':'EVENT_VERIFICATION_UNAVAILABLE');
  assert.equal(row.capacityReview.eventVerdict,'BLOCKED');assert.equal(row.capacityReview.quoteVerdict,'PASS_FROM_REASON_PRIORITY');
  assert(!scenario.response.openingPlan.orders.some(order=>order.symbol==='CRWD'&&order.side==='buy'),'Adverse, failed, missing or expired current evidence cannot permit purchases');
 }
 const missing=await compareScenario({missing:true});
 const stale=await compareScenario({stale:true});
 for(const failed of [missing,stale]){
  assert.equal(failed.diagnostics.collection.status,'FAILED');assert.equal(failed.diagnostics.review.openingFailureCode,'TARGET_OPENING_QUOTE_UNAVAILABLE');
  const row=failed.diagnostics.tickers.find(row=>row.symbol==='MRNA');assert.equal(row.opening.requested,true);assert.equal(row.opening.observed,null);assert.equal(row.opening.status,'UNAVAILABLE');
  assert.equal(row.opening.providerObservedAt,null);assert.equal(row.opening.observedPrice,null,'A thrown collector cannot supply returned observations');
 }
 const planFailure=await compareScenario({planError:true});
 assert.equal(planFailure.diagnostics.collection.status,'RETURNED');assert.equal(planFailure.response.openingPlan,null);assert.equal(planFailure.diagnostics.review.openingFailureCode,'UNAVAILABLE');
 assert.equal(planFailure.diagnostics.tickers.find(row=>row.symbol==='MRNA').opening.observed,true,'A later plan failure cannot erase already returned quote evidence');
 const outside=await compareScenario({outsideHours:true});
 assert.equal(outside.enabled.state.collections.length,0);assert.equal(outside.diagnostics.collection.status,'NOT_ATTEMPTED');
 assert(outside.diagnostics.tickers.every(row=>row.opening.observed===null&&row.opening.status==='UNAVAILABLE'));
 const malformed=await compareScenario({diagnosticError:true});
 assert.equal(malformed.diagnostics.status,'UNAVAILABLE');assert(malformed.diagnostics.tickers.every(row=>row.opening.observed===null&&row.source.signalPresent===null));
 assert.equal(malformed.diagnostics.review.openingPlanAvailable,null,'Projector failure cannot assert that the existing opening plan is absent');
 assert.equal(malformed.diagnostics.review.openingErrorPresent,null,'Projector failure cannot assert that the existing view has no opening error');

 const auth=makeHarness(),beforeAuth=auth.state.bytes;
 assert.equal((await auth.request('POST',{operation:'prepare-execution'},false)).statusCode,401);
 assert.equal(auth.state.reads,0);assert.equal(auth.state.bookReads,0);assert.equal(auth.state.collections.length,0);assert.deepEqual(auth.state.imports,{});
 for(const [method,body,expected]of [['GET',undefined,200],['POST',{operation:'unrecognized',includePurchaseDiagnostics:true},400]]){
  const response=await auth.request(method,body);assert.equal(response.statusCode,expected);assert(!Object.hasOwn(response.body,'purchaseDiagnostics'));
 }
 assert.equal(auth.state.bytes,beforeAuth);assert.equal(auth.state.writes,0);assert.equal(auth.state.imports.buildC1PurchaseDiagnostics||0,0);

 const recording=makeHarness(),prepared=await recording.request(),orders=prepared.body.openingPlan.orders.filter(row=>row.symbol==='MRNA'&&row.side==='buy');
 assert(orders.length>0);const callsBefore=recording.state.imports.buildC1PurchaseDiagnostics;
 const posted=await recording.request('POST',{operation:'record-intraday',expectedRevision:prepared.body.decision.revision,includePurchaseDiagnostics:true,
  purchaseDiagnostics:{private:hostile},ticket:{id:'request-diagnostic-fixture-fill',symbol:'MRNA',side:'buy',shares:orders.reduce((sum,row)=>sum+row.shares,0),price:100.12,fee:0,executedAt:fixedAt}});
 assert.equal(posted.statusCode,200,JSON.stringify(posted.body));assert(!Object.hasOwn(posted.body,'purchaseDiagnostics'));
 assert.equal(recording.state.imports.buildC1PurchaseDiagnostics,callsBefore,'Recording cannot invoke diagnostic construction');
 assert.equal(recording.state.prepareArgs.at(-1).recordTicket,true);assert.notEqual(recording.state.prepareArgs.at(-1).includePurchaseDiagnostics,true);
 assert.equal(recording.state.writes,1,'Only the normal synthetic actual-fill save may persist');
 assert.doesNotMatch(recording.state.bytes,/purchaseDiagnostics|PRIVATE_RAW_SENTINEL/,'Response/client diagnostic fields cannot enter saved execution evidence');

 const direct=makeHarness();const directResult=await direct.directPrepare({account:direct.f.account,book:direct.f.book,now:direct.f.now,collectOpening:direct.f.collectOpening});
 assert(!Object.hasOwn(directResult,'purchaseDiagnostics'),'Non-API/default execution remains diagnostic-free');
 assert.equal(direct.state.imports.buildC1PurchaseDiagnostics||0,0);

 const builder=createResearchModuleLoader(process.cwd()).load('lib/c1PurchaseDiagnostics.js').buildC1PurchaseDiagnostics;
 const rawBaseline=clone(normal.enabled.f.sessions[220]);rawBaseline.eventCoverageAsOf=hostile;rawBaseline.privateCash=87654321;
 for(const signal of [...rawBaseline.signals,...rawBaseline.positionSignals])if(['MRNA','CRWD'].includes(signal.symbol)){
  signal.companyName=hostile;signal.sector=hostile;signal.eventRisk={status:hostile,label:hostile,detail:hostile,materialNews:[{text:hostile}],checkComplete:'true'};signal.eventRiskAvailableAt=hostile;
 }
 const safe=builder({baseline:rawBaseline,sourceBasis:hostile,sourceCapture:{sessionDate:rawBaseline.date,observedAt:hostile,private:hostile},
  decision:{opportunities:[{symbol:'MRNA',reason:hostile}],positions:[{symbol:'UNRELATED_PRIVATE',shares:11223344,cash:87654321}],private:hostile},requestedSymbols:['MRNA','UNRELATED_PRIVATE'],collectionStatus:'RETURNED',
  collectedOpening:{prices:[{symbol:'MRNA',open:100,observedPrice:100,observedAt:fixedAt,private:hostile},{symbol:'UNRELATED_PRIVATE',open:87654321,observedPrice:11223344,raw:hostile}],receipt:{observedAt:fixedAt,private:hostile},
   currentEventEvidence:[{symbol:'MRNA',status:hostile,label:hostile,detail:hostile,eventVerification:{provider:hostile,state:hostile,observedAt:hostile,expiresAt:hostile,sources:[{kind:'NEWS',endpoint:hostile,complete:'true',fetchedAt:hostile,expiresAt:hostile,private:hostile}]}},{symbol:'UNRELATED_PRIVATE',private:hostile}]},
  plan:{additionalSwingCapacity:{reviews:[{symbol:'MRNA',rating:hostile,reason:hostile}]},entryReviews:[{symbol:'MRNA',reason:hostile,shares:99887766}],entryRecheck:{blocks:[{symbol:'CRWD',reason:hostile}]},cash:87654321},
  openingError:hostile,manualRecommendations:{status:hostile,reason:hostile},requestObservedAt:hostile,observedAt:fixedAt,commit:hostile,reconciliations:[{private:hostile,deferredRevisionCount:3}]});
 assertSchema(safe);assert.equal(safe.deployedCommit,'UNAVAILABLE');assert.equal(safe.requestObservedAt,null);assert.equal(safe.source.basis,'UNAVAILABLE');
 assert.equal(safe.review.openingFailureCode,'UNAVAILABLE');assert.equal(safe.tickers[0].capacityReview.reasonCode,'UNAVAILABLE');
 assert.equal(safe.tickers[0].source.event.status,'UNAVAILABLE');assert.equal(safe.tickers[0].source.event.checkComplete,null);
 assert.equal(safe.tickers[0].opening.currentEvent.state,'UNVERIFIED');assert.equal(safe.tickers[0].opening.currentEvent.status,'UNAVAILABLE');assert.equal(safe.tickers[0].opening.currentEvent.provider,'UNAVAILABLE');
 assert.equal(safe.tickers[0].reconciliation.aggregateDeferredRevisionCount,3);assert.equal(safe.tickers[0].reconciliation.perTickerDeferredState,'UNAVAILABLE');
 const unknown=builder();assertSchema(unknown);assert(unknown.tickers.every(row=>row.source.signalPresent===null&&row.opening.observed===null&&row.opening.currentEvent.state==='UNVERIFIED'&&row.opening.currentEvent.blockNewCapital===null));
 const duplicate=builder({baseline:{date:'2026-10-14',signals:[],positionSignals:[]},requestedSymbols:['MRNA'],collectionStatus:'RETURNED',observedAt:fixedAt,
  collectedOpening:{prices:[{symbol:'MRNA',open:100,observedPrice:100,observedAt:fixedAt},{symbol:'MRNA',open:101,observedPrice:101,observedAt:fixedAt}],receipt:{quoteMaximumAgeSeconds:999}}});
 assertSchema(duplicate);assert.equal(duplicate.tickers[0].opening.status,'AMBIGUOUS');assert.equal(duplicate.tickers[0].opening.observedPrice,null);assert.equal(duplicate.tickers[0].opening.ageWithinLimitPass,null);assert.equal(duplicate.tickers[0].opening.ageMaximumSeconds,120);
 const future=builder({collectionStatus:'RETURNED',observedAt:fixedAt,collectedOpening:{prices:[{symbol:'MRNA',open:100,observedPrice:100,observedAt:'2026-10-15T17:00:01.000Z'}]}});
 assert.equal(future.tickers[0].opening.ageWithinLimitPass,false,'Age-only evidence must reject a future timestamp without implying full quote authority');
 console.log('PASS: authenticated prepare-only diagnostics preserve exact response/account/history/collector/replay parity; current clear supersedes historical Manual while adverse/unavailable/expired evidence remains blocked; quote failures, immutable MRNA volatility, fixed allowlists, hostile redaction and recording exclusion verified offline.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=NativeDate;global.fetch=originalFetch;});
